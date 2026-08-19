/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
-------------------------------------------------------------------------------
\*---------------------------------------------------------------------------*/

#include "ThielePellet.H"

#include "core/Advisory.H"
#include "thermo/Database.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/reactor/pellet/Catalyst.H"
#include "unitOperations/reactor/pellet/CatalystRegistry.H"
#include "unitOperations/reactor/pellet/EffectiveDiffusivity.H"
#include "unitOperations/reactor/pellet/PelletDiffusion.H"

#include <algorithm>
#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace Choupo {

namespace {

//  The CatalystRegistry is loaded on first use by a pellet op -- an EXPLICIT
//  call site (never a static initialiser), just a lazy one, so choupoProps
//  pays nothing when no pellet op runs.  Same shape as
//  IsothermEval::ensureAdsorbentsLoaded.
void ensureCatalystsLoaded()
{
    static bool done = false;
    if (done) return;
    done = true;
    const std::string& root = Database::currentRoot();
    if (!root.empty()) CatalystRegistry::loadFrom(root);
}

//  15 significant digits, not 12.  A CSV is a DATA PRODUCT: the gate reads
//  the published closed-form column back and compares it with one recomputed
//  in Python, and at 12 digits that comparison was limited by the file's own
//  precision (it failed at 1.3e-12 against a 1e-12 tolerance, which looked
//  like a formula difference and was not).  15 digits keeps the relative
//  round-trip error at ~1e-15, three orders below anything a reader or a gate
//  would act on.
std::string fmtG(scalar v)
{
    std::ostringstream os;
    os << std::setprecision(15) << v;
    return os.str();
}

std::string sci(scalar v, int digits = 4)
{
    std::ostringstream os;
    os << std::scientific << std::setprecision(digits) << v;
    return os.str();
}

//  ONE place that turns a `nodes` entry into a checked integer, so the three
//  places a node count can be declared cannot disagree about what is legal.
int readNodes(const DictPtr& d, const std::string& key, int fallback,
              const std::string& locus, bool& defaulted)
{
    defaulted = !d->found(key);
    const scalar v = d->lookupScalarOrDefault(key, static_cast<scalar>(fallback));
    const int n = static_cast<int>(std::lround(v));
    if (std::abs(v - static_cast<scalar>(n)) > 1.0e-9)
        throw std::runtime_error(locus + ": `" + key + "` must be a whole"
            " number of grid points (got " + fmtG(v) + ").");
    return n;
}

} // anonymous namespace

int ThielePellet::run(const DictPtr& dict,
                      const ThermoPackage& thermo,
                      int verbosity)
{
    ensureCatalystsLoaded();
    diag_.clear();

    const std::string opName = dict->lookupWordOrDefault("name", "thielePellet");
    const std::string locus  = "thielePellet '" + opName + "'";

    // ---------------------------------------------------------------------
    //  The pellet.
    // ---------------------------------------------------------------------
    const std::string catName = dict->lookupWord("catalyst");
    const std::string species = dict->lookupWord("species");
    const Catalyst&   cat     = CatalystRegistry::byName(catName);

    //  The species must be one the package carries -- otherwise no molecular
    //  diffusivity can be asked for it and nothing downstream means anything.
    //  indexOf throws by name; this only sharpens the locus.
    try { (void)thermo.indexOf(species); }
    catch (const std::exception& e)
    {
        throw std::runtime_error(locus + ": the diffusing species '" + species
            + "' is not in the case's component set -- " + e.what());
    }

    //  THE RECORD'S OWN PROVENANCE, announced from a PARSED field.  A pellet
    //  whose porosity and tortuosity are a teaching surrogate produces an eta
    //  that is a teaching surrogate, and the reader must be told beside the
    //  number rather than in a banner the parser discards.
    if (cat.origin() == "teachingSurrogate")
        AdvisoryLog::instance().add("data", "warning", locus,
            "the catalyst record " + cat.source() + " declares"
            " `provenance.identity.origin teachingSurrogate;` -- its geometry,"
            " porosity and tortuosity are NOT traceable to a primary"
            " measurement, so eta and phi below are illustrative and must not"
            " be quoted as a property of any real catalyst.  What IS verified"
            " here is that the numerical field reproduces the closed form at"
            " whatever modulus these values produce.");
    else if (!cat.origin().empty())
        AdvisoryLog::instance().add("data", "info", locus,
            "the catalyst record " + cat.source() + " declares"
            " `provenance.identity.origin " + cat.origin() + ";`.");
    else
        AdvisoryLog::instance().add("data", "info", locus,
            "the catalyst record " + cat.source() + " declares NO"
            " `provenance.identity.origin` -- where its geometry, porosity and"
            " tortuosity came from is unstated, which is not the same as their"
            " being sound.");
    if (cat.reviewStatus() != "reviewed")
        AdvisoryLog::instance().add("data", "info", locus,
            "the catalyst record " + cat.source() + " carries `reviewStatus "
            + (cat.reviewStatus().empty() ? std::string("<none declared>")
                                          : cat.reviewStatus())
            + "` -- it has not passed primary review.");

    const scalar T = dict->lookupScalar("T", Dims::temperature);
    const scalar P = dict->found("P")
                   ? dict->lookupScalar("P", Dims::pressure) : 0.0;
    if (!(T > 0.0))
        throw std::runtime_error(locus + ": `T` must be a positive absolute"
            " temperature.");

    // ---------------------------------------------------------------------
    //  The rate constant.  ONE of the two spellings, never both: the
    //  volumetric constant and the per-mass one are the SAME fact in two
    //  units, and two declarations of one fact drift.
    // ---------------------------------------------------------------------
    const bool hasVol  = dict->found("rateConstant");
    const bool hasMass = dict->found("rateConstantMass");
    if (hasVol && hasMass)
        throw std::runtime_error(locus + ": declares BOTH `rateConstant`"
            " [1/s, per unit pellet volume] and `rateConstantMass`"
            " [m3/(kg.s), per unit catalyst mass].  They are the same fact in"
            " two units, related by the pellet density, so two declarations"
            " are two homes for one number and they drift.  Declare one.");
    if (!hasVol && !hasMass)
        throw std::runtime_error(locus + ": declares no first-order rate"
            " constant.  Declare `rateConstant <1/s>;` (per unit PELLET"
            " volume, which is the basis the intraparticle balance is written"
            " on) or `rateConstantMass <m3/(kg.s)>;` (per unit catalyst mass,"
            " the basis a heterogeneous kinetics paper usually reports),"
            " whichever your source states -- converting it here for you"
            " would hide which one it was.");

    scalar k = 0.0;
    std::string kHow;
    if (hasVol)
    {
        k    = dict->lookupScalar("rateConstant", Dims::inverseTime);
        kHow = "declared volumetric (per unit pellet volume)";
    }
    else
    {
        const scalar km =
            dict->lookupScalar("rateConstantMass", Dimensions(-1, 3, -1, 0, 0));
        if (!(cat.rhoParticle() > 0.0))
            throw std::runtime_error(locus + ": `rateConstantMass` is per unit"
                " CATALYST MASS and the intraparticle balance is written per"
                " unit PELLET VOLUME, so the conversion needs the apparent"
                " pellet density -- and the catalyst record " + cat.source()
                + " declares no `rho_particle`.  Declare it there with its"
                  " provenance, or declare the volumetric `rateConstant`"
                  " directly.");
        k    = km * cat.rhoParticle();
        kHow = "k_v = k_m * rho_particle = " + sci(km) + " * "
             + fmtG(cat.rhoParticle()) + " = " + sci(k) + " 1/s";
    }
    if (!(k > 0.0))
        throw std::runtime_error(locus + ": the first-order rate constant must"
            " be strictly positive.");

    // ---------------------------------------------------------------------
    //  D_eff -- resolved and announced by its ONE home.
    // ---------------------------------------------------------------------
    auto diffDict = dict->subDict("diffusion");
    DiffusionRequest req;
    req.species          = species;
    req.counterDiffusing = diffDict->lookupWord("counterDiffusing");
    req.medium           = diffDict->lookupWord("medium");
    req.T_K              = T;
    req.P_Pa             = P;
    req.locus            = locus;

    const EffectiveDiffusivityResult de =
        resolveEffectiveDiffusivity(cat, thermo, req, verbosity);

    // ---------------------------------------------------------------------
    //  The two moduli.
    // ---------------------------------------------------------------------
    const scalar Lc      = cat.characteristicDimension();
    const scalar Lambda  = cat.volumeToSurfaceLength();
    const scalar phiChar = Lc * std::sqrt(k / de.D_eff);
    const scalar phi     = pellet::generalisedModulus(cat.geometry(), phiChar);

    bool nodesDefaulted = false;
    const int nodes = readNodes(dict, "nodes", 401, locus, nodesDefaulted);
    if (nodesDefaulted)
        AdvisoryLog::instance().add("model", "info", locus,
            "`nodes` was not declared; the intraparticle field is discretised"
            " on the DEFAULT 401 grid points.  The discretisation is"
            " second-order, so its error scales as (phi_char*h)^2 -- declare"
            " `nodes` when the modulus is large.");

    //  The scope of the model, stated on every run rather than in a comment.
    AdvisoryLog::instance().add("model", "info", locus,
        "ISOTHERMAL pellet, FIRST-ORDER reaction, ONE pellet size, and the"
        " external film neglected (c_s is taken as the bulk concentration)."
        "  The NON-ISOTHERMAL pellet is not modelled: coupled to Arrhenius it"
        " has up to three steady states for one phi and eta may exceed 1, so"
        " its answer is a SET and a Newton would return whichever root the"
        " guess was nearest.  Orders other than first are not modelled either"
        " -- they have no closed form, hence no oracle to check the numerical"
        " answer against.");

    if (verbosity >= 2)
    {
        std::cout << "\n=========================  thielePellet  ==========================\n"
                  << "  Pellet:        " << cat.name() << "  ("
                  << pelletGeometryName(cat.geometry())
                  << ", characteristic dimension " << sci(Lc) << " m,"
                  << " Lambda = V/S = " << sci(Lambda) << " m)\n"
                  << "  Species:       " << species << " in "
                  << req.counterDiffusing << " (" << req.medium << ") at "
                  << fmtG(T) << " K"
                  << (P > 0.0 ? ", " + fmtG(P) + " Pa" : "") << "\n"
                  << "  Rate constant: k = " << sci(k) << " 1/s   (" << kHow
                  << ")\n"
                  << "  D_eff:         " << sci(de.D_eff) << " m2/s   ("
                  << de.route << ")\n"
                  << "  Modulus:       phi_char = " << fmtG(phiChar)
                  << "   phi (generalised, on Lambda) = " << fmtG(phi) << "\n";
    }

    // ---------------------------------------------------------------------
    //  THE FIELD -- solved numerically, checked against the closed form.
    // ---------------------------------------------------------------------
    const pellet::PelletSolution sol =
        pellet::solvePellet(cat.geometry(), phiChar, nodes);

    //  THE BOUNDARY LAYER MUST BE RESOLVED, and the engine says when it is
    //  not.  At large phi the field collapses into a shell of thickness
    //  ~1/phi_char; when that shell spans only a few cells the second-order
    //  scheme is still convergent, but the answer ON THIS GRID is not
    //  accurate and a reader has no way to know that from the number alone.
    //  `sol.h` is used rather than a second computation of the same spacing:
    //  the grid the solver actually used is the only one worth judging.
    if (phiChar * sol.h > 0.25)
        AdvisoryLog::instance().add("model", "warning", locus,
            "phi_char*h = " + sci(phiChar * sol.h, 3) + " > 0.25: the"
            " intraparticle boundary layer (thickness ~ 1/phi_char = "
            + sci(1.0 / phiChar, 3) + " in normalised units) is spanned by"
            " fewer than four grid cells, so the field and eta on this grid"
            " carry a visible discretisation error.  Increase `nodes`.  The"
            " deviation from the closed form is published beside the answer,"
            " so the size of that error is not left to be guessed.");

    // ---------------------------------------------------------------------
    //  Verification tolerances: declared, or DEFAULTED and announced.
    // ---------------------------------------------------------------------
    scalar tolField = 1.0e-4, tolEta = 1.0e-4, tolSweep = 5.0e-3;
    bool tolDefaulted = true;
    if (dict->found("verification"))
    {
        auto v = dict->subDict("verification");
        tolField = v->lookupScalarOrDefault("field", tolField);
        tolEta   = v->lookupScalarOrDefault("eta",   tolEta);
        tolSweep = v->lookupScalarOrDefault("sweep", tolSweep);
        tolDefaulted = false;
    }
    if (tolDefaulted)
        AdvisoryLog::instance().add("model", "info", locus,
            "no `verification {}` block was declared; the numerical answer is"
            " checked against the closed form at the DEFAULT tolerances"
            " (field 1e-4, eta 1e-4, sweep 5e-3).  These are the tolerances"
            " the run's PASS/FAIL verdict is taken on.");

    bool allPass = true;
    const bool fieldPass = sol.maxAbsFieldDeviation <= tolField;
    const bool etaPass   = sol.etaRelDeviation      <= tolEta;
    allPass = allPass && fieldPass && etaPass;

    if (verbosity >= 2)
    {
        std::cout << "  ---- the single pellet, numerical vs CLOSED FORM ----\n"
                  << "    eta (volume integral of the field) = "
                  << fmtG(sol.eta) << "\n"
                  << "    eta (closed form)                  = "
                  << fmtG(sol.etaClosedForm) << "   rel dev "
                  << sci(sol.etaRelDeviation, 3)
                  << (etaPass ? "  PASS" : "  *** FAIL ***") << "\n"
                  << "    eta (surface flux, independent)    = "
                  << fmtG(sol.etaFlux) << "   rel dev vs the integral "
                  << sci(sol.etaVolumeVsFlux, 3) << "\n"
                  << "    max |c/c_s - closed form| over the field = "
                  << sci(sol.maxAbsFieldDeviation, 3)
                  << (fieldPass ? "  PASS" : "  *** FAIL ***") << "\n"
                  << "    c(centre)/c_s = " << fmtG(sol.u.front())
                  << "   (closed form " << fmtG(sol.uClosedForm.front())
                  << ")\n"
                  << "    Newton: " << sol.newtonIterations
                  << " iteration(s), ||F|| = " << sci(sol.newtonResidual, 3)
                  << " on " << nodes << " nodes (h = " << sci(sol.h, 3)
                  << ")\n";
    }

    // ---------------------------------------------------------------------
    //  Field CSV.
    // ---------------------------------------------------------------------
    std::string fieldCsv, sweepCsv, refineCsv;
    if (dict->found("output"))
    {
        auto o = dict->subDict("output");
        fieldCsv  = o->lookupWordOrDefault("field", "");
        sweepCsv  = o->lookupWordOrDefault("sweep", "");
        refineCsv = o->lookupWordOrDefault("refinement", "");
    }

    if (!fieldCsv.empty())
    {
        std::ofstream f(fieldCsv);
        if (!f)
            throw std::runtime_error(locus + ": cannot write the field CSV '"
                + fieldCsv + "'.");
        f << "geometry,phi,phi_char,xi,c_over_cs,c_over_cs_closedForm,"
             "absDeviation\n";
        const std::string gname = pelletGeometryName(cat.geometry());
        for (std::size_t j = 0; j < sol.xi.size(); ++j)
            f << gname << ',' << fmtG(phi) << ',' << fmtG(phiChar) << ','
              << fmtG(sol.xi[j]) << ',' << fmtG(sol.u[j]) << ','
              << fmtG(sol.uClosedForm[j]) << ','
              << fmtG(std::abs(sol.u[j] - sol.uClosedForm[j])) << '\n';
        if (verbosity >= 2)
            std::cout << "    concentration field -> " << fieldCsv << "  ("
                      << sol.xi.size() << " nodes)\n";
    }

    // ---------------------------------------------------------------------
    //  THE SWEEP -- the classical eta(phi) family.  A PARAMETRIC family over
    //  the modulus, said aloud: only the case's own point above uses the
    //  resolved k, D_eff and pellet dimension.
    // ---------------------------------------------------------------------
    scalar sweepMaxDev = 0.0;
    int    sweepPoints = 0;
    if (dict->found("sweep"))
    {
        auto sw = dict->subDict("sweep");
        const std::vector<scalar> range = sw->lookupList("phi");
        if (range.size() != 2 || !(range[0] > 0.0) || !(range[1] > range[0]))
            throw std::runtime_error(locus + ": `sweep.phi` must be"
                " `( lo hi );` with 0 < lo < hi -- the family is log-spaced in"
                " the modulus, so a non-positive endpoint has no logarithm.");
        bool sweepNodesDefaulted = false;
        const int nSweepNodes =
            readNodes(sw, "nodes", 201, locus + " sweep", sweepNodesDefaulted);
        if (sweepNodesDefaulted)
            AdvisoryLog::instance().add("model", "info", locus,
                "`sweep.nodes` was not declared; every point of the eta(phi)"
                " family is solved on the DEFAULT 201 grid points.  The family"
                " spans the modulus, so its LARGEST phi is the one that decides"
                " whether that grid is enough -- the per-point deviation from"
                " the closed form is published in the sweep CSV.");
        const int nPts = static_cast<int>(
            std::lround(sw->lookupScalarOrDefault("points", 21.0)));
        if (nPts < 2)
            throw std::runtime_error(locus + ": `sweep.points` must be at"
                " least 2 (the two endpoints).");

        std::vector<std::string> geoms =
            sw->found("geometries") ? sw->lookupWordList("geometries")
                                    : std::vector<std::string>{
                                          "slab", "cylinder", "sphere" };

        std::ofstream f;
        if (!sweepCsv.empty())
        {
            f.open(sweepCsv);
            if (!f)
                throw std::runtime_error(locus + ": cannot write the sweep CSV"
                    " '" + sweepCsv + "'.");
            f << "geometry,phi,phi_char,eta,eta_closedForm,relDeviation,"
                 "eta_flux\n";
        }

        AdvisoryLog::instance().add("model", "info", locus,
            "the eta(phi) sweep is a PARAMETRIC family over the generalised"
            " modulus, not a family of real pellets: it varies phi directly"
            " and holds nothing else fixed.  Only this case's own point (phi ="
            " " + fmtG(phi) + ", geometry "
            + pelletGeometryName(cat.geometry())
            + ") is built from the resolved rate constant, effective"
              " diffusivity and pellet dimension.");

        for (const std::string& gw : geoms)
        {
            const PelletGeometry g =
                pelletGeometryFromWord(gw, locus + " sweep.geometries");
            for (int i = 0; i < nPts; ++i)
            {
                const scalar t = static_cast<scalar>(i)
                               / static_cast<scalar>(nPts - 1);
                const scalar phiS = std::exp(std::log(range[0])
                    + t * (std::log(range[1]) - std::log(range[0])));
                const scalar phiCharS = pellet::characteristicModulus(g, phiS);
                const pellet::PelletSolution s =
                    pellet::solvePellet(g, phiCharS, nSweepNodes);
                sweepMaxDev = std::max(sweepMaxDev, s.etaRelDeviation);
                ++sweepPoints;
                if (f.is_open())
                    f << pelletGeometryName(g) << ',' << fmtG(phiS) << ','
                      << fmtG(phiCharS) << ',' << fmtG(s.eta) << ','
                      << fmtG(s.etaClosedForm) << ','
                      << fmtG(s.etaRelDeviation) << ','
                      << fmtG(s.etaFlux) << '\n';
            }
        }

        const bool sweepPass = sweepMaxDev <= tolSweep;
        allPass = allPass && sweepPass;
        diag_["sweep_points"]         = static_cast<scalar>(sweepPoints);
        diag_["sweep_maxRelDeviation"] = sweepMaxDev;
        diag_["sweep_nodes"]          = static_cast<scalar>(nSweepNodes);
        if (verbosity >= 2)
            std::cout << "  ---- eta(phi) sweep ----\n"
                      << "    " << sweepPoints << " point(s) over "
                      << geoms.size() << " geometry/geometries, "
                      << nSweepNodes << " nodes each\n"
                      << "    max rel deviation from the closed form = "
                      << sci(sweepMaxDev, 3)
                      << (sweepPass ? "  PASS" : "  *** FAIL ***") << "\n"
                      << (sweepCsv.empty() ? std::string()
                                           : "    eta(phi) -> " + sweepCsv
                                             + "\n");
    }

    // ---------------------------------------------------------------------
    //  THE GRID-REFINEMENT STUDY.  A single tolerance says the answer is close
    //  enough on ONE grid; the observed ORDER says the scheme is the one it
    //  claims to be.  That is a far stronger statement, and it costs four
    //  solves of a problem that takes milliseconds.
    // ---------------------------------------------------------------------
    if (dict->found("refinement"))
    {
        auto rf = dict->subDict("refinement");
        const std::vector<scalar> ns = rf->lookupList("nodes");
        if (ns.size() < 2)
            throw std::runtime_error(locus + ": `refinement.nodes` needs at"
                " least two grids -- an order of convergence is measured"
                " BETWEEN grids, so one grid measures nothing.");

        std::ofstream f;
        if (!refineCsv.empty())
        {
            f.open(refineCsv);
            if (!f)
                throw std::runtime_error(locus + ": cannot write the"
                    " refinement CSV '" + refineCsv + "'.");
            f << "geometry,phi,nodes,h,eta,eta_closedForm,relDeviation\n";
        }

        scalar prevDev = 0.0, prevN = 0.0, lastOrder = 0.0;
        const std::string gname = pelletGeometryName(cat.geometry());
        for (scalar nRaw : ns)
        {
            const int n = static_cast<int>(std::lround(nRaw));
            const pellet::PelletSolution s =
                pellet::solvePellet(cat.geometry(), phiChar, n);
            if (f.is_open())
                f << gname << ',' << fmtG(phi) << ',' << n << ','
                  << fmtG(s.h) << ',' << fmtG(s.eta) << ','
                  << fmtG(s.etaClosedForm) << ','
                  << fmtG(s.etaRelDeviation) << '\n';
            if (prevN > 0.0 && s.etaRelDeviation > 0.0 && prevDev > 0.0)
            {
                lastOrder = std::log(prevDev / s.etaRelDeviation)
                          / std::log((static_cast<scalar>(n) - 1.0)
                                     / (prevN - 1.0));
                if (verbosity >= 3)
                    std::cout << "      refinement " << static_cast<int>(prevN)
                              << " -> " << n << " nodes: observed order "
                              << fmtG(lastOrder) << "\n";
            }
            prevDev = s.etaRelDeviation;
            prevN   = static_cast<scalar>(n);
        }
        diag_["refinement_order"] = lastOrder;
        diag_["refinement_finestRelDeviation"] = prevDev;
        if (verbosity >= 2)
            std::cout << "  ---- grid refinement ----\n"
                      << "    observed order of convergence (finest pair) = "
                      << fmtG(lastOrder)
                      << "   (second-order central differences => 2)\n"
                      << (refineCsv.empty() ? std::string()
                                            : "    refinement -> " + refineCsv
                                              + "\n");
    }

    // ---------------------------------------------------------------------
    //  Diagnostics.
    // ---------------------------------------------------------------------
    diag_["phi"]                   = phi;
    diag_["phi_char"]              = phiChar;
    diag_["eta"]                   = sol.eta;
    diag_["eta_closedForm"]        = sol.etaClosedForm;
    diag_["eta_relDeviation"]      = sol.etaRelDeviation;
    diag_["eta_flux"]              = sol.etaFlux;
    diag_["eta_volumeVsFlux"]      = sol.etaVolumeVsFlux;
    diag_["field_maxAbsDeviation"] = sol.maxAbsFieldDeviation;
    diag_["c_centre"]              = sol.u.front();
    diag_["c_centre_closedForm"]   = sol.uClosedForm.front();
    diag_["D_eff"]                 = de.D_eff;
    if (de.D_molecular > 0.0)  diag_["D_molecular"] = de.D_molecular;
    if (de.crossCheckRelDeviation >= 0.0)
        diag_["D_eff_crossCheckRelDeviation"] = de.crossCheckRelDeviation;
    diag_["epsilon_p"]  = cat.epsilonP();
    diag_["tau"]        = cat.tau();
    diag_["Lambda"]     = Lambda;
    diag_["dimension"]  = Lc;
    diag_["rateConstant"] = k;
    diag_["T"] = T;
    if (P > 0.0) diag_["P"] = P;
    diag_["nodes"]             = static_cast<scalar>(nodes);
    diag_["newton_iterations"] = static_cast<scalar>(sol.newtonIterations);
    diag_["newton_residual"]   = sol.newtonResidual;

    //  THE WEISZ-PRATER OBSERVABLE MODULUS, published and NOT judged.  It is
    //  eta*phi^2 on the generalised modulus, which equals
    //  (observed rate)*Lambda^2/(D_eff*c_s) -- every quantity in it is
    //  measurable at the pellet's outside, which is what makes it the
    //  criterion a reader can actually apply.  What value counts as "small"
    //  is the reader's call and the theory guide's subject, not the engine's.
    diag_["weiszPrater"] = sol.eta * phi * phi;

    diag_["gate_field"]        = fieldPass ? 1.0 : 0.0;
    diag_["gate_eta"]          = etaPass   ? 1.0 : 0.0;
    diag_["gates_pass"]        = allPass   ? 1.0 : 0.0;

    if (verbosity >= 2)
    {
        std::cout << "  Weisz-Prater observable modulus eta*phi^2 = "
                  << fmtG(sol.eta * phi * phi)
                  << "  (published, not judged)\n"
                  << "  ALL CHECKS: " << (allPass ? "PASS" : "*** FAIL ***")
                  << "\n"
                  << "===================================================================\n\n";
    }

    return allPass ? 0 : 1;
}

} // namespace Choupo
