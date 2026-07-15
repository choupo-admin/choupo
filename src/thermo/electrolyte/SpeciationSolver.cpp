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
\*---------------------------------------------------------------------------*/

#include "SpeciationSolver.H"

#include "core/Advisory.H"
#include "core/Constants.H"
#include "core/Dictionary.H"
#include "solver/NewtonND.H"
#include "thermo/ThermoAnnounce.H"
#include "thermo/electrolyte/AqueousActivity.H"
#include "thermo/electrolyte/PitzerHMW.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"
#include "thermo/electrolyte/SolventProperties.H"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <functional>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace Choupo {
namespace electrolyte {

// ---- catalogue loading -------------------------------------------------------

namespace {

// How to obtain the catalogue when neither the case nor the standards tree has
// it -- the data import runs as its own curation act; never fail cryptically.
const char* howToObtain =
    " -- the electrolyte speciation catalogue is not imported yet.  Generate it"
    " from the USGS PHREEQC databases (public domain,"
    " https://github.com/usgs-coupled/phreeqc3 -> database/phreeqc.dat:"
    " SOLUTION_SPECIES log_k/delta_h -> speciation.dat, PHASES -> minerals.dat),"
    " or copy the minimal hand-curated set from"
    " tutorials/props/electrolyte/scaling_ro_brackish/constant/electrolyte/"
    " into this case's constant/electrolyte/.";

std::vector<std::pair<std::string, double>> readMasters(const DictPtr& e)
{
    std::vector<std::pair<std::string, double>> v;
    for (const auto& m : e->lookupDictList("masters"))
        v.emplace_back(m->lookupWord("ion"), m->lookupScalar("nu"));
    return v;
}

// Read the optional analytic K(T) block (`analytic ( A1 .. A5 );` + an optional
// `validC ( lo hi );`).  Absence-tolerant -- an entry without it keeps the dH /
// flat path unchanged.  FAILS LOUDLY on a malformed coefficient count.
KTcorrection readKT(const DictPtr& e)
{
    KTcorrection kt;
    if (e->found("analytic"))
    {
        const auto v = e->lookupList("analytic");
        if (v.size() < 1 || v.size() > 6)
            throw std::runtime_error("speciation: `analytic ( ... )` needs 1..6 "
                "coefficients (A1..A6 of log_k(T) = A1 + A2 T + A3/T + A4 log10 T"
                " + A5/T^2 + A6 T^2), got " + std::to_string(v.size()));
        kt.hasAnalytic = true;
        for (std::size_t i = 0; i < v.size(); ++i) kt.a[i] = v[i];
    }
    if (e->found("validC"))
    {
        const auto r = e->lookupList("validC");
        if (r.size() != 2)
            throw std::runtime_error("speciation: `validC ( lo hi )` needs exactly"
                " two values (the analytic K(T) validity range in Celsius)");
        kt.hasRange = true; kt.Tlo_C = r[0]; kt.Thi_C = r[1];
    }
    return kt;
}

} // namespace

SpeciationSolver::SpeciationSolver(const std::string& activityModel)
{
    // The aqueous per-ion gamma model.  Selected by name (default "davies",
    // the only S1 builtin); AqueousActivity::New refuses an unknown name with
    // the available list.  The registry is filled by the explicit
    // AqueousActivity::registerBuiltins() call in main.cpp -- but register
    // defensively here too, so a solver built before that call (or in a tool
    // that forgot it) still finds Davies (idempotent: re-registering "davies"
    // just rebinds the same factory).
    AqueousActivity::registerBuiltins();
    activity_     = AqueousActivity::New(activityModel);
    activityName_ = activity_->modelName();

    // Pitzer HMW: run the TIER-1 self-check ONCE (mirrors IF97::verify() in the
    // steam tables) -- the multi-ion model reduced to a single salt MUST equal
    // the closed PitzerSingleSalt kernel to floating point, for EVERY binary in
    // pairs.dat, plus the I -> 0 Debye-Huckel limiting law.  A Pitzer built on a
    // wrong summation is worse than no Pitzer: REFUSE the run on a failed check
    // (do not loosen the tolerance).
    if (activityName_ == "pitzerHMW")
    {
        const double dev = PitzerHMW::verify(0);   // silent gate; verbose echo in solve()
        if (!(dev < 1.0e-9))
            throw std::runtime_error("speciation: PitzerHMW self-check FAILED "
                "(single-salt reduction vs PitzerSingleSalt max rel deviation "
                + std::to_string(dev) + " > 1e-9) -- the multi-ion summation has "
                "a bug; fix the index/sum, do not loosen the tolerance");
    }

    // Speciation network -- per-file under standards/chemistry/aqueousSpeciation/.
    // A case-local constant/electrolyte/speciation.dat carries the case DELTA and
    // its `speciationMode` decides how it meets the tree:
    //   extend (DEFAULT) -- case reactions MERGE over the tree (override same-species,
    //           ADD new); the case ships only what it introduces (e.g. an organic acid
    //           on top of the inorganic catalogue).
    //   replace          -- the case network ECLIPSES the tree entirely (a self-
    //           contained coherent model, e.g. the HMW verification's restricted set).
    // The `gases` sidecar rides on the case file either way.
    {
        std::vector<DictPtr> records;
        DictPtr caseDict;   // the case-local file (holds the gases sidecar, if any)
        const fs::path cl = caseElectrolytePath("speciation.dat");
        bool caseReplaces = false;
        std::vector<DictPtr> caseReactions;
        if (!cl.empty())
        {
            caseDict = Dictionary::fromFile(cl.string());
            caseReplaces =
                (caseDict->lookupWordOrDefault("speciationMode", "extend") == "replace");
            for (const auto& e : caseDict->lookupDictList("reactions"))
                caseReactions.push_back(e);
        }
        // Base = the standards tree, UNLESS the case replaces it.
        if (cl.empty() || !caseReplaces)
        {
            const fs::path dir = fs::path(Database::currentRoot())
                               / "standards" / "chemistry" / "aqueousSpeciation";
            if (!fs::exists(dir))
            {
                if (cl.empty())
                    throw std::runtime_error(
                        "speciation: no case-local speciation.dat and no standards "
                        "chemistry/aqueousSpeciation/" + std::string(howToObtain));
            }
            else
            {
                std::vector<fs::path> files;
                for (const auto& f : fs::directory_iterator(dir))
                    if (f.path().extension() == ".dat") files.push_back(f.path());
                std::sort(files.begin(), files.end());
                for (const auto& f : files) records.push_back(Dictionary::fromFile(f.string()));
            }
        }
        // Case reactions: replace -> they ARE the network; extend -> overlay by species
        // name (override a tree record of the same species, else append).
        for (const auto& e : caseReactions)
        {
            const std::string sp = e->lookupWord("species");
            auto it = std::find_if(records.begin(), records.end(),
                [&](const DictPtr& r){ return r->lookupWord("species") == sp; });
            if (it != records.end()) *it = e; else records.push_back(e);
        }
        for (const auto& e : records)
        {
            SpeciationReaction r;
            r.species = e->lookupWord("species");
            r.z       = e->lookupScalar("z");
            r.masters = readMasters(e);
            r.nuWater = e->lookupScalarOrDefault("nuWater", 0.0);
            r.logK25  = e->lookupScalar("logK25");
            r.hasDH   = e->found("dH");
            if (r.hasDH) r.dH = e->lookupScalar("dH");
            r.kt      = readKT(e);
            r.source  = e->lookupWordOrDefault("source", "undeclared");
            reactions_.push_back(std::move(r));
        }
        // Optional `gases` section: gas dissolution (Henry) constants for the
        // OPEN-system option (absence-tolerant -- a closed-only catalogue is
        // complete without it).
        if (caseDict && caseDict->found("gases"))
            for (const auto& e : caseDict->lookupDictList("gases"))
            {
                GasEntry g;
                g.gas     = e->lookupWord("gas");
                g.species = e->lookupWord("species");
                g.logK25  = e->lookupScalar("logK25");
                g.hasDH   = e->found("dH");
                if (g.hasDH) g.dH = e->lookupScalar("dH");
                g.kt      = readKT(e);
                g.source  = e->lookupWordOrDefault("source", "undeclared");
                gases_.push_back(std::move(g));
            }
        else if (cl.empty() || !caseReplaces)
        {
            // Standards tier: gas dissolution (Henry) constants live per-file under
            // chemistry/gasLiquid/ (the monolith speciation.dat `gases` sidecar is
            // gone).  Each record's `dissolved` is an ION label (e.g. "CO2"); link it
            // to the network species whose `ion` matches (CO2 -> CO2aq), fallback the
            // label itself.  The analytic K(T) carried here is the re-baselined value.
            const fs::path gdir = fs::path(Database::currentRoot())
                                / "standards" / "chemistry" / "gasLiquid";
            if (fs::exists(gdir))
            {
                std::vector<fs::path> gfiles;
                for (const auto& f : fs::directory_iterator(gdir))
                    if (f.path().extension() == ".dat") gfiles.push_back(f.path());
                std::sort(gfiles.begin(), gfiles.end());
                for (const auto& f : gfiles)
                {
                    auto e = Dictionary::fromFile(f.string());
                    GasEntry g;
                    g.gas     = e->lookupWord("gas");
                    const std::string dissolved = e->lookupWord("dissolved");
                    g.species = dissolved;
                    for (const auto& rec : records)
                        if (rec->lookupWordOrDefault("ion", "") == dissolved)
                        { g.species = rec->lookupWord("species"); break; }
                    g.logK25  = e->lookupScalar("logK25");
                    g.hasDH   = e->found("dH");
                    if (g.hasDH) g.dH = e->lookupScalar("dH");
                    g.kt      = readKT(e);
                    g.source  = e->lookupWordOrDefault("source", "undeclared");
                    gases_.push_back(std::move(g));
                }
            }
        }
        if (!cl.empty() && thermoAnnounce())   // case-local meets the standards tier: loud
            std::cerr << "[overlay] speciation: case-local " << cl.string()
                      << (caseReplaces ? " REPLACES the standard catalogue ("
                                       : " EXTENDS the standard catalogue (+"
                                         + std::to_string(caseReactions.size()) + " case, ")
                      << reactions_.size() << " reactions)\n";
    }

    {
        // The mineral kind is now per-file under standards/chemistry/mineralSolubility/
        // (the monolith electrolyte/minerals.dat is gone).  Dual leg, mirroring the
        // pitzer/mixing migrations: case-local constant/electrolyte/minerals.dat list
        // read WHOLE (overlay XOR, eclipses standard) ELSE a sorted *.dat directory
        // listing -- the DIRECTORY is the authoritative set (no index, arity-1 safe).
        // Each per-file's top-level dict IS one mineral record (same readMasters/readKT).
        std::vector<DictPtr> records;
        const fs::path cl = caseElectrolytePath("minerals.dat");
        const bool caseLocal = !cl.empty();
        if (caseLocal)
        {
            auto d = Dictionary::fromFile(cl.string());
            for (const auto& e : d->lookupDictList("minerals")) records.push_back(e);
        }
        else
        {
            // The legacy per-kind home is RETIRED (Phase D): minerals now live as
            // solidPhases in standards/components/ (scanned below).  Read the legacy
            // chemistry/mineralSolubility/ dir ONLY if it still exists -- absent is
            // fine (the components/ scan provides the catalogue).
            const fs::path dir = fs::path(Database::currentRoot())
                               / "standards" / "chemistry" / "mineralSolubility";
            if (fs::exists(dir))
            {
                std::vector<fs::path> files;
                for (const auto& f : fs::directory_iterator(dir))
                    if (f.path().extension() == ".dat") files.push_back(f.path());
                std::sort(files.begin(), files.end());
                for (const auto& f : files)
                    records.push_back(Dictionary::fromFile(f.string()));
            }
        }
        for (const auto& e : records)
        {
            MineralEntry m;
            m.mineral = e->lookupWord("mineral");
            m.formula = e->lookupWordOrDefault("formula", "");
            m.masters = readMasters(e);
            m.nuWater = e->lookupScalarOrDefault("nuWater", 0.0);
            m.logK25  = e->lookupScalar("logK25");
            m.hasDH   = e->found("dH");
            if (m.hasDH) m.dH = e->lookupScalar("dH");
            m.kt      = readKT(e);
            m.source  = e->lookupWordOrDefault("source", "undeclared");
            minerals_.push_back(std::move(m));
        }
        // UNIFIED substance files: a component in standards/components/ may declare
        // solidPhases{}, each concrete phase being a mineral (dissolution reaction +
        // equilibrium Ksp).  Scan them alongside the legacy mineralSolubility/ home.
        if (!caseLocal)
        {
            const fs::path cdir = fs::path(Database::currentRoot())
                                / "standards" / "components";
            if (fs::exists(cdir))
            {
                std::vector<fs::path> cfiles;
                for (const auto& f : fs::directory_iterator(cdir))
                    if (f.path().extension() == ".dat") cfiles.push_back(f.path());
                std::sort(cfiles.begin(), cfiles.end());
                for (const auto& f : cfiles)
                {
                    // UNIFIED overlay (roadmap Phase A): the ONE shared entry point
                    // deep-merges a case-local `overlayOf` partial over the standard.
                    auto rc = Database::applyCaseOverlay(
                        f.stem().string(), Dictionary::fromFile(f.string()), f.string());
                    auto d = rc.dict;
                    if (thermoAnnounce() && !rc.overlaidPaths.empty())
                    {
                        std::cerr << "[overlay] " << f.stem().string()
                                  << ": deep-merge of " << rc.overlaidPaths.size()
                                  << " leaf(s) from caseOverlay " << rc.overlayFile
                                  << " (all other values from standard " << rc.baseFile
                                  << "):";
                        for (const auto& pth : rc.overlaidPaths) std::cerr << " " << pth;
                        std::cerr << "\n";
                    }
                    if (!d->found("solidPhases")) continue;
                    auto sps = d->subDict("solidPhases");
                    for (const auto& phase : sps->keys())
                    {
                        auto ph = sps->subDict(phase);
                        if (!ph->found("equilibrium")) continue;   // needs a Ksp model
                        auto eq = ph->subDict("equilibrium");
                        const DictPtr rxn = ph->found("dissolutionReaction")
                            ? ph->subDict("dissolutionReaction") : ph;
                        MineralEntry m;
                        m.mineral = phase;
                        m.formula = d->lookupWordOrDefault("formula", "");
                        m.masters = readMasters(rxn);
                        m.nuWater = rxn->lookupScalarOrDefault("nuWater", 0.0);
                        m.logK25  = eq->lookupScalar("logK25");
                        m.hasDH   = eq->found("dH");
                        if (m.hasDH) m.dH = eq->lookupScalar("dH");
                        m.kt      = readKT(eq);
                        m.source  = eq->lookupWordOrDefault("source", "undeclared");
                        minerals_.push_back(std::move(m));
                    }
                }
            }
        }
        if (caseLocal && thermoAnnounce())
            std::cerr << "[overlay] minerals: case-local " << cl.string()
                      << " ECLIPSES the standard catalogue (taken whole, "
                      << minerals_.size() << " minerals)\n";
    }
}

// Out-of-line dtor: activity_ is a shared_ptr to the forward-declared
// AqueousActivity, so the destructor must live where the type is complete.
SpeciationSolver::~SpeciationSolver() = default;

std::vector<ExchangeReaction> SpeciationSolver::loadExchangeNetwork() const
{
    // Same nearest-wins-WHOLE rule as speciation.dat: a case-local exchange.dat
    // ECLIPSES the standard one entirely (a half-reaction network is one
    // coherent model -- half-merged selectivities are not a model).
    // The exchange kind is now per-file under standards/chemistry/ionExchange/
    // (the monolith electrolyte/exchange.dat is gone).  Dual leg, mirroring the
    // mineral migration: case-local constant/electrolyte/exchange.dat list read
    // WHOLE (overlay XOR -- a half-reaction network is one coherent model) else a
    // sorted *.dat directory listing of chemistry/ionExchange/.
    std::vector<DictPtr> records;
    const fs::path cl = caseElectrolytePath("exchange.dat");
    if (!cl.empty())
    {
        auto d = Dictionary::fromFile(cl.string());
        for (const auto& e : d->lookupDictList("exchange")) records.push_back(e);
    }
    else
    {
        const fs::path dir = fs::path(Database::currentRoot())
                           / "standards" / "chemistry" / "ionExchange";
        if (!fs::exists(dir))
            throw std::runtime_error(
                "exchange: no case-local exchange.dat and no standards "
                "chemistry/ionExchange/ -- generate it (USGS PHREEQC EXCHANGE_SPECIES, "
                "public domain) or copy a softener tutorial's snapshot into this case.");
        std::vector<fs::path> files;
        for (const auto& f : fs::directory_iterator(dir))
            if (f.path().extension() == ".dat") files.push_back(f.path());
        std::sort(files.begin(), files.end());
        for (const auto& f : files) records.push_back(Dictionary::fromFile(f.string()));
    }
    std::vector<ExchangeReaction> net;
    for (const auto& e : records)
    {
        ExchangeReaction r;
        r.species   = e->lookupWord("species");
        r.reference = e->lookupWordOrDefault("reference", "false") == "true";
        // exactly two legs: one { ion ...; } (the binding cation) + one
        // { site X; nu z; } (the conserved-capacity leg).  The site leg is the
        // NEW kind that flags "consumes exchange capacity".
        bool haveIon = false, haveSite = false;
        for (const auto& m : e->lookupDictList("masters"))
        {
            if (m->found("ion"))
            {
                if (haveIon)
                    throw std::runtime_error("exchange: species '" + r.species
                        + "' has more than one { ion ...; } leg (a half-reaction "
                          "binds exactly one aqueous cation)");
                r.ion = m->lookupWord("ion");
                haveIon = true;
            }
            else if (m->found("site"))
            {
                r.nuSite = m->lookupScalar("nu");
                haveSite = true;
            }
            else
                throw std::runtime_error("exchange: species '" + r.species
                    + "' has a leg that is neither { ion ...; } nor { site X; "
                      "nu n; }");
        }
        if (!haveIon || !haveSite)
            throw std::runtime_error("exchange: species '" + r.species
                + "' needs one { ion ...; } leg AND one { site X; nu n; } leg");
        r.logK25 = e->lookupScalar("logK25");
        r.hasDH  = e->found("dH");
        if (r.hasDH) r.dH = e->lookupScalar("dH");
        r.source = e->lookupWordOrDefault("source", "undeclared");
        net.push_back(std::move(r));
    }
    if (!cl.empty() && thermoAnnounce())
        std::cerr << "[overlay] exchange: case-local " << cl.string()
                  << " ECLIPSES the standard catalogue (network taken whole, "
                  << net.size() << " half-reactions)\n";
    return net;
}

double SpeciationSolver::mineralMW(const std::string& mineral) const
{
    const MineralEntry* me = nullptr;
    for (const auto& m : minerals_) if (m.mineral == mineral) { me = &m; break; }
    if (!me)
        throw std::runtime_error("mineralMW: '" + mineral + "' not in minerals.dat");
    double mw = me->nuWater * 18.015;
    for (const auto& [ion, nu] : me->masters)
    {
        if (ion == "H") { mw += nu * 1.008; continue; }
        const double m = ionMW(ion);
        if (m <= 0.0)
            throw std::runtime_error("mineralMW: ion '" + ion + "' (in " + mineral
                + ") has no MW in its ion record (species/aqueous/) -- add `MW <g/mol>;` to its entry");
        mw += nu * m;
    }
    return mw;
}

double SpeciationSolver::mineralLogK_T(const std::string& mineral, double T,
                                       bool& hasEntry) const
{
    const MineralEntry* me = nullptr;
    for (const auto& m : minerals_) if (m.mineral == mineral) { me = &m; break; }
    if (!me) { hasEntry = false; return 0.0; }
    hasEntry = true;
    return logK_T(me->logK25, me->hasDH, me->dH, me->kt, T);
}

double SpeciationSolver::chargeOf(const std::string& master) const
{
    auto it = masterCharge_.find(master);
    if (it != masterCharge_.end()) return it->second;
    auto ion = findIon(master);
    if (!ion)
        throw std::runtime_error("speciation: master ion '" + master
            + "' not in constant/electrolyte/ions.dat (case) or "
              "data/standards/species/aqueous.dat");
    const double z = ion->lookupScalar("z");
    masterCharge_[master] = z;
    return z;
}

// ---- the three small model functions (each one teachable line) --------------

double SpeciationSolver::daviesA(double T)
{
    // 0.51 at 25 C (log10 base; = 3 A_phi / ln 10 with A_phi = 0.3915), scaled
    // in T by the same eps_w(T)/rho_w(T) factor as the Pitzer/eNRTL kernels.
    return 0.51 * SolventProperties::debyeHuckelFactor(T);
}

double SpeciationSolver::logK_T(double logK25, bool hasDH, double dH_Jmol, double T)
{
    if (!hasDH || T == 298.15) return logK25;
    // van't Hoff, dH constant: log10 K(T) = log10 K(25C) + dH/(R ln10) (1/T25 - 1/T)
    constexpr double ln10 = 2.302585092994046;
    return logK25 + dH_Jmol / (constant::R * ln10) * (1.0 / 298.15 - 1.0 / T);
}

double SpeciationSolver::analyticLogK(const std::array<double,6>& a, double T)
{
    // PHREEQC analytic log_k(T):  A1 + A2 T + A3/T + A4 log10 T + A5/T^2 + A6 T^2
    return a[0] + a[1] * T + a[2] / T + a[3] * std::log10(T)
         + a[4] / (T * T) + a[5] * T * T;
}

double SpeciationSolver::logK_T(double logK25, bool hasDH, double dH_Jmol,
                                const KTcorrection& kt, double T)
{
    // Priority analytic > dH > flat, ALL anchored on logK25.
    if (kt.hasAnalytic)
    {
        if (T == 298.15) return logK25;          // byte-stable at 25 C by design
        // anchored correction: the absolute offset of the published fit cancels,
        // so logK(298.15) == logK25 EXACTLY (even if the fit does not reproduce
        // logK25 perfectly); only the analytic T-SHAPE is borrowed.
        return logK25 + (analyticLogK(kt.a, T) - analyticLogK(kt.a, 298.15));
    }
    return logK_T(logK25, hasDH, dH_Jmol, T);    // dH path (unchanged) or flat
}

// ---- solve -------------------------------------------------------------------

SpeciationResult SpeciationSolver::solve(const SpeciationInput& in, int verbosity) const
{
    // Manipulator hygiene: this function prints with setprecision/fixed --
    // restore the caller's stream state on every exit path (the structured
    // JSON emitter downstream must not inherit our formatting).
    struct CoutGuard
    {
        std::ios state{nullptr};
        CoutGuard()  { state.copyfmt(std::cout); }
        ~CoutGuard() { std::cout.copyfmt(state); }
    } coutGuard;

    SpeciationResult out;
    const double T      = in.T;
    const bool   solveH = in.solvePH;            // H+ an unknown, electroneutrality closes
    const double a_H = std::pow(10.0, -in.pH);   // used only when pH is GIVEN

    // The aqueous per-ion gamma model (default Davies).  `A` is the model's
    // Debye-Huckel slope at T (Davies: 0.51*debyeHuckelFactor(T) -- byte-identical
    // to the old daviesA(T)).  `gammaZ(z)` (defined below, once the live ionic
    // strength I exists) returns gamma_i at the CURRENT I so every call site sees
    // the same value the inline Davies formula gave.
    const double A   = activity_->evaluate(IonState{}, T).A;
    out.A = A;

    // K(T) with the full priority (analytic > dH > flat), CLASSIFYING each entry
    // into the right announce-bucket and flagging any analytic used beyond its
    // fitted range (no silent extrapolation).  At 25 C every path returns logK25
    // and NO bucket is touched (the off-25 guard) -- so the run is byte-identical
    // at 298.15 K BY CONSTRUCTION (every existing golden lives there).
    const bool offT = std::fabs(T - 298.15) > 0.01;
    auto kT = [&](const std::string& name, double logK25, bool hasDH, double dH,
                  const KTcorrection& kt) -> double
    {
        const double v = logK_T(logK25, hasDH, dH, kt, T);
        if (!offT) return v;                     // at 25 C: classify nothing
        if (kt.hasAnalytic)
        {
            out.analyticK.push_back(name);
            if (kt.hasRange)
            {
                const double TC = T - 273.15;
                if (TC < kt.Tlo_C - 1e-9 || TC > kt.Thi_C + 1e-9)
                    out.extrapolated.push_back(name);
            }
        }
        else if (hasDH) out.vantHoffK.push_back(name);
        else            out.flatK.push_back(name);
        return v;
    };

    // -- unknown masters: the totals with something in them --------------------
    std::vector<std::string> mast;        // names (std::map order: deterministic)
    std::vector<double>      mtot, mz;    // totals + charges
    for (const auto& [name, tot] : in.totals)
    {
        if (tot <= 0.0)
        {
            if (verbosity >= 2)
                std::cout << "  speciation: master '" << name
                          << "' total <= 0 -- excluded\n";
            continue;
        }
        mast.push_back(name);
        mtot.push_back(tot);
        mz.push_back(chargeOf(name));
    }
    const std::size_t n = mast.size();
    // -- cation exchange: ONE extra master (the free site X-) + the bound
    //    half-reaction species, ALL gated on a non-empty exchange spec.  X- is
    //    a pseudo-master: it joins the ln-unknowns and gets a CEC capacity
    //    balance (an EQUALITY, NOT the mineral active-set complementarity), but
    //    it is EXCLUDED from I / a_w / electroneutrality (it lives on the resin,
    //    not in the aqueous phase) and its activity is the equivalent fraction
    //    beta_X = m_X/CEC, never Davies.  Empty spec => doExchange false =>
    //    every branch below is skipped => byte-identical to the no-exchange path.
    const bool   doExchange = !in.exchange.empty();
    const double CEC        = in.exchange.CEC;        // [eq/kg water]
    const std::size_t nUnk = n + (solveH ? 1 : 0)     // +1: ln m_H
                               + (doExchange ? 1 : 0); // +1: ln m_X (free site)
    const std::size_t iH   = n;                        // index of the H+ unknown
    const std::size_t iX   = n + (solveH ? 1 : 0);     // index of the free-site X-
    auto masterIndex = [&](const std::string& name) -> int
    {
        for (std::size_t j = 0; j < n; ++j) if (mast[j] == name) return int(j);
        return -1;
    };

    // -- resin INITIAL LOADING: a softener resin ships / is regenerated in a
    //    fixed ionic `form` (Na), so it starts holding CEC equivalents of that
    //    ion.  The conserved total of the form ion = FEED aqueous + CEC; the
    //    excess over what stays bound is RELEASED to the water eq-for-eq (the
    //    salt penalty).  We augment the form-ion mole balance and remember the
    //    pristine feed total so the ledger can report aqueous before -> after.
    std::vector<double> mtotFeed = mtot;               // pristine feed (reporting)
    int formIdx = -1;
    if (doExchange && !in.exchange.form.empty())
    {
        formIdx = masterIndex(in.exchange.form);
        if (formIdx < 0)
            throw std::runtime_error("exchange: resin form ion '"
                + in.exchange.form + "' is not in the water analysis totals -- a "
                "resin regenerated in the " + in.exchange.form + " form releases "
                + in.exchange.form + ", so the analysis must carry a "
                + in.exchange.form + " total (even if small)");
        const double zForm = std::fabs(mz[std::size_t(formIdx)]);
        mtot[std::size_t(formIdx)] += CEC / zForm;     // eq -> mol of the form ion
    }

    // -- feed charge imbalance, ANNOUNCED before solving (solve-pH mode) --------
    //    The input analysis is rarely perfectly balanced; the solved pH ABSORBS
    //    whatever imbalance the lab sheet carries.  PHREEQC percent-error
    //    convention: 200 |S+ - S-| / (S+ + S-)  over the master totals
    //    (equivalents; H/OH are not part of a water analysis).
    if (solveH)
    {
        double sumPos = 0.0, sumNeg = 0.0;            // [eq/kg water]
        for (std::size_t j = 0; j < n; ++j)
            (mz[j] > 0.0 ? sumPos : sumNeg) += std::fabs(mz[j]) * mtot[j];
        if (sumPos + sumNeg > 0.0)
        {
            out.imbalancePct =
                200.0 * std::fabs(sumPos - sumNeg) / (sumPos + sumNeg);
            if (verbosity >= 2)
                std::cout << "  speciation: feed charge imbalance "
                          << std::fixed << std::setprecision(2)
                          << out.imbalancePct << "% (S+ = " << std::scientific
                          << std::setprecision(4) << sumPos << ", S- = " << sumNeg
                          << " eq/kg; PHREEQC convention 200|S+ - S-|/(S+ + S-))"
                             " -- the SOLVED pH absorbs this analysis error\n"
                          << std::defaultfloat;
            if (out.imbalancePct > 5.0)
            {
                std::ostringstream msg;
                msg << "feed charge imbalance " << std::fixed
                    << std::setprecision(1) << out.imbalancePct
                    << "% is above ~5% -- the analysis is inconsistent and the "
                       "SOLVED pH is NOT trustworthy (it absorbs the lab error); "
                       "re-check the reported totals";
                if (AdvisoryLog::instance().add("model", "warning", "speciation",
                                                msg.str())
                    && verbosity >= 1)
                    std::cout << "  [advisory] " << msg.str() << "\n";
            }
        }
    }

    // -- active reactions: every master present (or the fixed H) ---------------
    // An Active is an aqueous complex (rxn != nullptr) OR a bound exchange
    // species (isExch true, rxn nullptr).  An exchange species reuses the SAME
    // mass-action / Jacobian machinery: its idx carries (Me_master, 1) and
    // (X_master, z), its activity is its EQUIVALENT FRACTION (gamma forced to 1,
    // the CEC constant folded into logK at build time so speciesM returns m_sX),
    // and it is EXCLUDED from I / a_w / electroneutrality (it lives on the resin).
    struct Active
    {
        const SpeciationReaction* rxn = nullptr;   // nullptr for exchange species
        std::vector<std::pair<int, double>> idx;  // (master index, nu), excl. H
        double nuH = 0.0;                          // stoichiometry on the fixed H+
        double logK = 0.0;                         // at the run T (CEC folded if exch)
        double m = 0.0, gamma = 1.0;
        // exchange-species fields (isExch == true):
        bool        isExch = false;
        std::string exchName;                      // NaX, CaX2, ... (display)
        std::string exchIon;                       // the aqueous cation it binds
        int         exchIonIdx = -1;               // its master index
        double      nuSite = 0.0;                  // z = sites consumed
        // rxn-or-exchange uniform accessors (an exchange species has charge 0
        // for the aqueous balances -- it is NOT in the aqueous phase):
        double      z()       const { return isExch ? 0.0 : rxn->z; }
        double      nuWater() const { return isExch ? 0.0 : rxn->nuWater; }
        const std::string& species() const { return isExch ? exchName : rxn->species; }
    };
    std::vector<Active> act;
    for (const auto& r : reactions_)
    {
        Active a; a.rxn = &r;
        bool ok = true;
        for (const auto& [ion, nu] : r.masters)
        {
            if (ion == "H") { a.nuH += nu; continue; }
            const int j = masterIndex(ion);
            if (j < 0) { ok = false; break; }     // a master is absent: species off
            a.idx.emplace_back(j, nu);
        }
        if (!ok) continue;
        // solve-pH mode: H+ is unknown number iH -- fold its stoichiometry
        // into the idx machinery so the mass action / Jacobian see it like
        // any other unknown (a.nuH stays authoritative for the given-pH path).
        if (solveH && a.nuH != 0.0) a.idx.emplace_back(int(iH), a.nuH);
        a.logK = kT(r.species, r.logK25, r.hasDH, r.dH, r.kt);
        act.push_back(std::move(a));
    }

    // -- exchange species: Me(z+) + z X- = MeX, Gaines-Thomas equivalent
    //    fraction.  Mass action  beta_MeX = K * a_Me * beta_X^z  with
    //    beta_MeX = z*m_sX/CEC, a_Me = gamma_Me*m_Me, beta_X = m_X/CEC.  Taking
    //    logs and solving for ln m_sX:
    //       ln m_sX = ln10*logK + ln(gamma_Me) + x_Me + z*x_X
    //               + [ ln(CEC/z) - z*ln(CEC) ]   <- the CEC CONSTANT, folded
    //    so speciesM (which computes logK*ln10 - ln(gamma=1) + sum nu*(lnG+x))
    //    returns m_sX exactly when idx = {(Me,1),(X,z)} and the constant is
    //    folded into the effective logK.  gamma is forced to 1 (the bound
    //    species is NOT a Davies ion).  An exchange species whose binding cation
    //    is ABSENT from the analysis is skipped (no master to bind).
    constexpr double ln10c = 2.302585092994046;
    if (doExchange)
    {
        for (const auto& xr : in.exchange.network)
        {
            const int j = masterIndex(xr.ion);
            if (j < 0) continue;                  // its cation is absent: off
            Active a;
            a.isExch     = true;
            a.exchName   = xr.species;
            a.exchIon    = xr.ion;
            a.exchIonIdx = j;
            a.nuSite     = xr.nuSite;
            a.idx.emplace_back(j, 1.0);           // Me leg (gamma_Me*m_Me)
            a.idx.emplace_back(int(iX), xr.nuSite); // X leg (z * x_X)
            // exchange half-reactions carry no analytic in phreeqc.dat (the dH /
            // flat path is unchanged); pass an empty KTcorrection.
            const double lk = kT(xr.species, xr.logK25, xr.hasDH, xr.dH,
                                 KTcorrection{});
            // fold the CEC constant into logK (as a ln10-scaled equivalent):
            //   effective logK*ln10 = ln10*lk + ln(CEC/z) - z*ln(CEC)
            a.logK = lk + (std::log(CEC / xr.nuSite) - xr.nuSite * std::log(CEC)) / ln10c;
            act.push_back(std::move(a));
        }
    }

    // -- OPEN-CO2 pin: resolve the gas, the pinned species, and the master row
    //    whose mole balance the pin REPLACES (the unique non-H master of the
    //    dissolved species' formation -- HCO3 for CO2aq).
    int    pinAct = -1, pinRow = -1;
    double logKgasT = 0.0;
    if (in.openCO2)
    {
        if (in.pCO2 <= 0.0)
            throw std::runtime_error("speciation: atmosphere pCO2 must be > 0");
        const GasEntry* gas = nullptr;
        for (const auto& g : gases_) if (g.gas == "CO2") { gas = &g; break; }
        if (!gas)
            throw std::runtime_error("speciation: `atmosphere { pCO2 ... }` "
                "given but the speciation.dat catalogue has no `gases` entry "
                "for CO2 -- append\n    gases ( { gas CO2; species CO2aq; "
                "logK25 -1.468; dH -19982.8; } );\n(USGS PHREEQC phreeqc.dat "
                "PHASES CO2(g), public domain) to the catalogue in use");
        for (std::size_t s = 0; s < act.size(); ++s)
            if (act[s].species() == gas->species) { pinAct = int(s); break; }
        if (pinAct < 0)
            throw std::runtime_error("speciation: open-CO2 needs the pinned "
                "species '" + gas->species + "' active -- give an HCO3 entry "
                "in `totals` (in an OPEN system it is only the initial DIC "
                "guess; DIC itself is a solved outcome)");
        int nonH = 0;
        for (const auto& [j, nu] : act[std::size_t(pinAct)].idx)
            if (j < int(n)) { pinRow = j; ++nonH; (void)nu; }
        if (nonH != 1)
            throw std::runtime_error("speciation: the gas pin needs exactly "
                "one non-H master in the formation of '" + gas->species
                + "' (found " + std::to_string(nonH) + ")");
        logKgasT = kT("CO2(g)", gas->logK25, gas->hasDH, gas->dH, gas->kt);
    }

    // -- ALLOWED minerals (the equilibrate set) --------------------------------
    //    Each allowed mineral becomes a candidate for the active set.  The
    //    augmented-Newton unknown is n_p [mol transferred to the solid per kg
    //    water], appended AFTER the ln-block as a RAW LINEAR coordinate (NOT a
    //    log): it must be able to reach and CROSS 0 -- the sign of n_p drives
    //    eviction (n_p < 0 = the phase wants to redissolve, so it leaves the
    //    active set).  This DELIBERATE mixed-space break (ln for molalities,
    //    raw for n_p) is the price of complementarity; the ln-damp cap below
    //    applies to the ln-block ONLY.
    struct Allowed
    {
        const MineralEntry* min = nullptr;
        // dissolution stoichiometry resolved onto the MASTER mole balances:
        // a mineral may reference a master ion directly OR a computed species
        // (which chains through mass action: d ln a_species/dx_k = nu_species,k).
        // nuPj[masterIndex] = net moles of that master RELEASED per mol
        // dissolved (so precipitation, n_p > 0, SINKS -nu_pj * n_p from the
        // master balance).  Built once, constant across passes.
        std::vector<double> nuPj;          // size n, the sink coefficients
        double nuH = 0.0;                   // net H+ released per mol dissolved
        double logK = 0.0;                  // at the run T
        bool   hasHleg = false;            // carbonate { ion H; nu -1; } leg present
    };
    std::vector<Allowed> allowed;
    if (!in.equilibrate.empty())
    {
        // map species name -> the Active reaction that computes it (for chaining
        // a mineral that references a computed species, e.g. CO3).
        auto activeForSpecies = [&](const std::string& nm) -> const Active*
        {
            for (const auto& a : act) if (a.species() == nm) return &a;
            return nullptr;
        };
        for (const auto& nm : in.equilibrate)
        {
            const MineralEntry* me = nullptr;
            for (const auto& m : minerals_) if (m.mineral == nm) { me = &m; break; }
            if (!me)
            {
                std::ostringstream avail;
                for (const auto& m : minerals_) avail << " " << m.mineral;
                throw std::runtime_error("equilibrate: mineral '" + nm
                    + "' is not in minerals.dat.  Available:" + avail.str());
            }
            Allowed al; al.min = me;
            al.nuPj.assign(n, 0.0);
            // FIRST refuse, naming the ion: a mineral cannot precipitate ions
            // the water does not contain.  A formation leg's ion must resolve
            // to either a PRESENT master OR a computed species (which itself
            // exists only when ITS masters are present, since `act` is built
            // from present-master reactions).
            for (const auto& [ion, nu] : me->masters)
            {
                if (ion == "H") continue;
                (void)nu;
                if (masterIndex(ion) < 0 && !activeForSpecies(ion))
                    throw std::runtime_error("equilibrate: " + nm + " needs "
                        + ion + " but the analysis carries no " + ion + " total"
                        " -- a mineral cannot precipitate ions the water does"
                        " not contain");
            }
            // distribute each formation leg onto the master balances
            auto addLeg = [&](const std::string& ion, double nu)
            {
                if (ion == "H") { al.nuH += nu; if (nu < 0.0) al.hasHleg = true; return; }
                const int j = masterIndex(ion);
                if (j >= 0) { al.nuPj[std::size_t(j)] += nu; return; }
                // not a master: chain through the species that forms it
                const Active* sp = activeForSpecies(ion);
                for (const auto& [k, nuk] : sp->idx)
                {
                    if (std::size_t(k) == iH) { al.nuH += nu * nuk; continue; }
                    al.nuPj[std::size_t(k)] += nu * nuk;
                }
                if (!solveH) al.nuH += nu * sp->nuH;  // H folded into nuH (given-pH)
            };
            for (const auto& [ion, nu] : me->masters) addLeg(ion, nu);
            // classify-once: the form/extrapolation announce for minerals happens
            // in the final SI loop (which covers ALL minerals); here we only need
            // the value, so call the pure overload (no double-bucketing).
            al.logK = logK_T(me->logK25, me->hasDH, me->dH, me->kt, T);
            allowed.push_back(std::move(al));
        }
    }
    const bool doEquil = !allowed.empty();

    // -- the honest model header ------------------------------------------------
    if (verbosity >= 2)
    {
        std::cout << "  speciation: " << n << " master total(s) + pH ";
        if (solveH)
            std::cout << "SOLVED (H+ joins the unknowns; electroneutrality "
                         "sum z_i m_i = 0 closes the system), T = "
                      << std::fixed << std::setprecision(2) << T << " K\n";
        else
            std::cout << std::fixed << std::setprecision(2) << in.pH
                      << " (given), T = " << T << " K\n";
        if (in.openCO2)
            std::cout << "  OPEN to CO2(g): a(CO2aq) PINNED by Henry, "
                         "log10 a = log10 K_H(T) + log10 pCO2 = "
                      << std::setprecision(3) << logKgasT << " + ("
                      << std::log10(in.pCO2) << ")  [pCO2 = " << std::scientific
                      << std::setprecision(3) << in.pCO2 << " atm]\n"
                      << "  -- the HCO3 mole balance is REPLACED by the pin: "
                         "DIC is a solved OUTCOME (its total = initial guess "
                         "only)\n" << std::fixed;
        // Display the active model with an initial capital (davies -> Davies).
        std::string actDisp = activityName_;
        if (!actDisp.empty()) actDisp[0] = char(std::toupper((unsigned char)actDisp[0]));
        if (activityName_ == "pitzerHMW")
            // A here is A_phi(T) (the molality-scale osmotic DH slope, 0.3915 at
            // 25 C), NOT the Davies log10 A.  binaries + ternary theta/psi +
            // E_theta higher-order electrostatic mixing (v2a).
        {
            std::cout << "  aqueous activity: Pitzer HMW (binaries + ternary "
                         "theta/psi + E_theta higher-order electrostatic "
                         "mixing) (A_phi = "
                      << std::setprecision(4) << A
                      << " at T) -- per-ion specific-interaction gamma; "
                         "a_w from the HMW osmotic coefficient phi(I) "
                         "(NOT phi = 1)\n" << std::defaultfloat;
            // The glass-box self-check: single-salt reduction vs the closed
            // kernel + the I -> 0 Debye-Huckel limiting law (verbosity >= 3).
            if (verbosity >= 3) PitzerHMW::verify(3);
        }
        else
            std::cout << "  aqueous activity: " << actDisp << " (A = "
                      << std::setprecision(4) << A
                      << ") -- trustworthy to I ~ 0.5 mol/kg, indicative beyond;"
                         " a_w from phi = 1 (dilute approximation)\n"
                      << std::defaultfloat;
        if (doExchange)
        {
            // count the exchange species whose binding cation is present
            int nx = 0;
            for (const auto& a : act) if (a.isExch) ++nx;
            std::cout << "  CATION EXCHANGE (Gaines-Thomas, resin "
                      << in.exchange.resin << "): the SAME Newton you already "
                         "read -- masters + mass action + balances -- PLUS one "
                         "master (the free resin site X-), one balance (capacity "
                         "CEC = sum of equivalents on sites), and the "
                      << nx << " exchange half-reaction(s).\n"
                      << "    CEC = " << std::scientific << std::setprecision(4)
                      << CEC << " eq/kg water";
            if (!in.exchange.cecBasisNote.empty())
                std::cout << "  (" << in.exchange.cecBasisNote << ")";
            std::cout << std::defaultfloat << "\n"
                      << "    Watch divalent Ca2+ (logK 0.8, equivalent-fraction-"
                         "favoured) outcompete Na+: Ca leaves the water onto the "
                         "resin, Na released eq-for-eq.\n";
        }
        // (the K(T)-form announcement is emitted AFTER the SI loop, once minerals
        //  have been classified too -- see the unified banner near the end.)
    }

    // -- log-space Newton inside an ionic-strength fixed point -------------------
    constexpr double ln10 = 2.302585092994046;
    std::vector<double> x(nUnk);               // x_j = ln m_j (positivity built in)
    for (std::size_t j = 0; j < n; ++j) x[j] = std::log(mtot[j]);
    if (solveH) x[iH] = std::log(1.0e-7);      // neutral-water start for the free H+
    // free-site start: assume the resin begins mostly empty of divalents so a
    // sizeable fraction of CEC is free X- (a robust, honest seed; the Newton
    // converges from a wide basin in ln-space).
    if (doExchange) x[iX] = std::log(0.5 * CEC);

    double I = 1.0e-7;                          // water self-ionisation floor
    for (std::size_t j = 0; j < n; ++j) I += 0.5 * mz[j] * mz[j] * mtot[j];

    double m_H = solveH ? 1.0e-7 : a_H;        // refreshed each gamma pass
    double mSpeciesSum = 0.0;
    double aw = 1.0;                            // a_w iterated with I (phi = 1)
    const int maxGamma = 60, maxNewton = 50;

    // ---- the aqueous activity FREEZE (one evaluate() per gamma pass) ----------
    // Davies reads only {I, T}; Pitzer (and any future per-ION model) reads the
    // WHOLE pass composition (every species name + molality + charge) because
    // ln gamma_i is a double sum over the other ions.  We build the full IonState
    // ONCE per freeze and call evaluate() once; the result carries gamma(z) (the
    // charge-only accessor) and, for per-ion models, gammaNamed(name, z).
    //
    // `freezeActivity(masterM)` builds the state from a master-molality accessor
    // (exp(xa[j]) inside the Newton, exp(x[j]) when reporting) + the live m_H +
    // the live aqueous-complex molalities (act[].m); exchange species are bound
    // (NOT aqueous), so they are excluded from the state exactly as they are
    // excluded from I / a_w.  At 25 C with Davies this returns the SAME gamma
    // closure as the old IonState{I,T} call (Davies ignores name/molality), so
    // the Davies path is byte-identical.
    auto freezeActivity = [&](const std::function<double(std::size_t)>& masterM)
        -> ActivityResult
    {
        IonState st; st.I = I; st.T = T;
        for (std::size_t j = 0; j < n; ++j)
        {
            st.name.push_back(mast[j]);
            st.molality.push_back(masterM(j));
            st.charge.push_back(mz[j]);
        }
        st.name.push_back("H"); st.molality.push_back(m_H); st.charge.push_back(1.0);
        for (const auto& a : act)
            if (!a.isExch)                              // bound exchanger: not aqueous
            {
                st.name.push_back(a.species());
                st.molality.push_back(a.m);
                st.charge.push_back(a.z());
            }
        return activity_->evaluate(st, T);
    };
    // gamma of a NAMED species from a frozen result: prefer the per-ion accessor
    // (Pitzer); fall back to the charge-only one (Davies leaves gammaNamed null,
    // so this is byte-identical to the old gammaZ(z)).
    auto gNamed = [](const ActivityResult& ar, const std::string& name, double z)
        -> double
    {
        return ar.gammaNamed ? ar.gammaNamed(name, z) : ar.gamma(z);
    };

    // n_p [mol/kg water] precipitated per ALLOWED mineral (raw linear, NOT log;
    // index = position in `allowed`).  Zero throughout when !doEquil -- the
    // phase-free path never reads it.
    std::vector<double> npVal(allowed.size(), 0.0);

    // SI of one allowed mineral at the current converged state (admission test):
    //   SI = sum nu*(ln gamma + x)/ln10 + nuWater*log10 a_w - logK(T)
    // built from the SAME activity table the species use (chained species
    // resolve through their mass action automatically, via out.find later; here
    // we recompute from the live iterate so the active-set loop can probe
    // inactive minerals before the table is assembled).
    auto speciesActivity = [&](const std::string& nm, const std::vector<double>& gMx,
                               double awx) -> double
    {
        if (nm == "H")                                  // the H+ activity
            return solveH ? gMx[iH] * m_H : a_H;         // gMx[iH] is the frozen gamma_H
        const int j = masterIndex(nm);
        if (j >= 0) return gMx[std::size_t(j)] * std::exp(x[std::size_t(j)]);
        for (const auto& a : act)
            if (a.species() == nm)
            {
                double lg = a.logK * ln10 - std::log(a.gamma)
                          + a.nuWater() * std::log(awx);
                if (!solveH) lg += a.nuH * std::log(a_H);
                for (const auto& [k, nu] : a.idx)
                    lg += nu * (std::log(gMx[std::size_t(k)]) + x[std::size_t(k)]);
                return a.gamma * std::exp(lg);
            }
        return -1.0;
    };

    // ---- ONE fully-converged gamma-fixed-point + Newton solve for a given
    //      active mineral subset (indices into `allowed`).  Mutates x, I, aw,
    //      m_H, npVal[active].  Returns false if the I fixed point diverges.
    auto solvePass = [&](const std::vector<int>& activeMin) -> bool
    {
        const std::size_t nAct = activeMin.size();
        const std::size_t nA   = nUnk + nAct;          // + one n_p per active mineral
        // seed the n_p unknowns from the inherited / zero state
        std::vector<double> xa(nA);
        for (std::size_t j = 0; j < nUnk; ++j) xa[j] = x[j];
        for (std::size_t p = 0; p < nAct; ++p)
            xa[nUnk + p] = npVal[std::size_t(activeMin[p])];   // raw n_p

        bool converged = false;
        for (int g = 0; g < maxGamma && !converged; ++g)
        {
            out.gammaIters = g + 1;
            // aqueous gammas (and the phi = 1 water activity) frozen for this pass
            // -- ONE evaluate() over the whole pass composition (current xa).
            const ActivityResult ar =
                freezeActivity([&](std::size_t j){ return std::exp(xa[j]); });
            std::vector<double> gM(nUnk, 1.0);     // X-master (if any) keeps 1.0
            for (std::size_t j = 0; j < n; ++j) gM[j] = gNamed(ar, mast[j], mz[j]);
            // aqueous complexes: model gamma; bound exchange species: gamma = 1
            // (the equivalent-fraction convention, NOT an aqueous ion).
            for (auto& a : act) a.gamma = a.isExch ? 1.0 : gNamed(ar, a.species(), a.z());
            const double gH = gNamed(ar, "H", 1.0);
            if (solveH) gM[iH] = gH;               // H+ is unknown number iH
            else        m_H   = a_H / gH;
            if (doExchange) gM[iX] = 1.0;          // beta_X = m_X/CEC (CEC folded)

            // species molalities at the current xa (mass action, all in logs;
            // a_w^nuWater enters the formation when the entry declares water).
            auto speciesM = [&](const Active& a) -> double
            {
                double lg = a.logK * ln10 - std::log(a.gamma)
                          + a.nuWater() * std::log(aw);
                if (!solveH) lg += a.nuH * std::log(a_H);
                for (const auto& [j, nu] : a.idx)
                    lg += nu * (std::log(gM[std::size_t(j)]) + xa[std::size_t(j)]);
                return std::exp(lg);
            };

            // inner Newton: master mole balances (+ the Henry pin replacing the
            // carbonate balance when OPEN, + electroneutrality when pH is solved,
            // + the mineral sink -sum nu_pj n_p and one SI = 0 row per active phase)
            int it = 0;
            for (; it < maxNewton; ++it)
            {
                for (auto& a : act) a.m = speciesM(a);
                sVector R(nA, 0.0);
                double worst = 0.0;
                for (std::size_t j = 0; j < n; ++j)
                {
                    if (int(j) == pinRow)
                    {
                        const Active& p = act[std::size_t(pinAct)];
                        R[j] = std::log(p.m) + std::log(p.gamma)
                             - ln10 * (logKgasT + std::log10(in.pCO2));
                        worst = std::max(worst, std::fabs(R[j]));
                        continue;
                    }
                    R[j] = mtot[j] - std::exp(xa[j]);
                    for (const auto& a : act)
                        for (const auto& [k, nu] : a.idx)
                            if (std::size_t(k) == j) R[j] -= nu * a.m;
                    // mineral sink: precipitating n_p mol REMOVES nu_pj * n_p
                    // (nuPj is the RELEASE coefficient on dissolution)
                    for (std::size_t p = 0; p < nAct; ++p)
                        R[j] -= allowed[std::size_t(activeMin[p])].nuPj[j] * xa[nUnk + p];
                    worst = std::max(worst, std::fabs(R[j]) / mtot[j]);
                }
                if (solveH)
                {
                    // ELECTRONEUTRALITY sum z_i m_i = 0 over ALL species.
                    // A carbonate mineral's { ion H; nu -1; } leg RELEASES H+
                    // on precipitation: nuH * n_p enters here so the freed H+
                    // re-acidifies the solved pH (pH-solve mode only).
                    double q = std::exp(xa[iH]), qScale = std::exp(xa[iH]);
                    for (std::size_t j = 0; j < n; ++j)
                    {
                        q      += mz[j] * std::exp(xa[j]);
                        qScale += std::fabs(mz[j]) * std::exp(xa[j]);
                    }
                    for (const auto& a : act)
                    {
                        q      += a.z() * a.m;       // exchange species: z()=0
                        qScale += std::fabs(a.z()) * a.m;
                    }
                    for (std::size_t p = 0; p < nAct; ++p)
                        q += allowed[std::size_t(activeMin[p])].nuH * xa[nUnk + p];
                    R[iH] = q;
                    worst = std::max(worst, std::fabs(q) / qScale);
                }
                if (doExchange)
                {
                    // CEC CAPACITY balance (an EQUALITY, the shape of a master
                    // total).  A fixed exchanger is ALWAYS electroneutral: every
                    // site carries a cation -- there is no thermodynamically
                    // "empty" free site that competes.  The conserved capacity is
                    //   R_CEC = CEC - sum_s nuSite_s * m_sX = 0
                    // and x_X = ln m_X is the activity variable the mass actions
                    // solve FROM this fill constraint (it is the Lagrange-like
                    // unknown that makes the sites add up to CEC, not a populated
                    // species).  (Davies stays out: beta_X = m_X/CEC.)
                    double cap = 0.0;
                    for (const auto& a : act)
                        if (a.isExch) cap += a.nuSite * a.m;
                    R[iX] = CEC - cap;
                    worst = std::max(worst, std::fabs(R[iX]) / CEC);
                }
                // ln activity of any ion-or-species at the CURRENT iterate xa
                // (masters direct; computed species chain through mass action).
                auto lnActIter = [&](const std::string& nm) -> double
                {
                    if (nm == "H")
                        return solveH ? std::log(gM[iH]) + xa[iH] : std::log(a_H);
                    const int j = masterIndex(nm);
                    if (j >= 0)
                        return std::log(gM[std::size_t(j)]) + xa[std::size_t(j)];
                    for (const auto& a : act)
                        if (a.species() == nm)
                            return std::log(a.gamma) + std::log(speciesM(a));
                    return 0.0;
                };
                // SI = 0 rows (one per active mineral); linear in x within a
                // gamma pass (the pinRow generalised).  R_p = sum nu*(ln gamma
                // + x) + nuWater*ln a_w - ln10*logK(T) over the formation legs.
                for (std::size_t p = 0; p < nAct; ++p)
                {
                    const Allowed& al = allowed[std::size_t(activeMin[p])];
                    double rp = al.min->nuWater * std::log(aw) - ln10 * al.logK;
                    for (const auto& [ion, nu] : al.min->masters)
                        rp += nu * lnActIter(ion);
                    R[nUnk + p] = rp;
                    worst = std::max(worst, std::fabs(rp));
                }
                if (verbosity >= 3)
                {
                    std::cout << "    speciation Newton " << g + 1 << "." << it
                              << ":  max|R|/total = " << std::scientific
                              << std::setprecision(3) << worst << std::defaultfloat;
                    // exchange selectivity ratio (the lesson made numeric):
                    //   beta(CaX2)/beta(NaX)^2 = K_Ca * a_Ca / a_Na^2
                    if (doExchange)
                    {
                        const Active *ca = nullptr, *na = nullptr;
                        for (const auto& a : act)
                            if      (a.isExch && a.exchName == "CaX2") ca = &a;
                            else if (a.isExch && a.exchName == "NaX")  na = &a;
                        if (ca && na && na->m > 0.0)
                        {
                            const double bCa = ca->nuSite * ca->m / CEC;
                            const double bNa = na->nuSite * na->m / CEC;
                            std::cout << "   beta(CaX2)/beta(NaX)^2 = "
                                      << std::scientific << std::setprecision(3)
                                      << bCa / (bNa * bNa) << std::defaultfloat
                                      << "  (Ca-favoured > 1 => Ca outcompetes Na)";
                        }
                    }
                    std::cout << "\n";
                }
                if (worst < 1.0e-12) break;

                // analytic Jacobian in (x = ln m, n_p raw):
                //   mole-balance rows   dR_j/dx_k = -d_jk m_j - sum nu_j nu_k m_s
                //                       dR_j/dn_p = -nu_pj  (constant)
                //   SI = 0 rows         dR_p/dx_k = sum nu_pk (over formation legs)
                //                       dR_p/dn_q = 0  (bordered saddle)
                std::vector<sVector> J(nA, sVector(nA, 0.0));
                for (std::size_t j = 0; j < n; ++j)
                    if (int(j) != pinRow) J[j][j] = -std::exp(xa[j]);
                for (const auto& a : act)
                    for (const auto& [j, nuj] : a.idx)
                    {
                        if (std::size_t(j) >= n || j == pinRow) continue;
                        for (const auto& [k, nuk] : a.idx)
                            J[std::size_t(j)][std::size_t(k)] -= nuj * nuk * a.m;
                    }
                if (pinRow >= 0)
                    for (const auto& [k, nu] : act[std::size_t(pinAct)].idx)
                        J[std::size_t(pinRow)][std::size_t(k)] = nu;
                if (solveH)
                {
                    J[iH][iH] += std::exp(xa[iH]);                  // z_H = +1
                    for (std::size_t j = 0; j < n; ++j)
                        J[iH][j] += mz[j] * std::exp(xa[j]);
                    for (const auto& a : act)
                        for (const auto& [k, nu] : a.idx)
                            J[iH][std::size_t(k)] += a.z() * nu * a.m;
                }
                if (doExchange)
                {
                    // CEC capacity row  R_CEC = CEC - sum_s nuSite*m_sX.
                    //   dR_CEC/dx_X  = -sum_s nuSite * (d m_sX/dx_X)
                    //                = -sum_s nuSite^2 * m_sX
                    //   dR_CEC/dx_Me = -sum_{s binds Me} nuSite * m_sX
                    // (the X leg of an exchange species sits in a.idx as
                    //  (iX, nuSite), so d m_sX/dx_k = nu_k * m_sX as usual.)
                    for (const auto& a : act)
                        if (a.isExch)
                            for (const auto& [k, nu] : a.idx)
                                J[iX][std::size_t(k)] -= a.nuSite * nu * a.m;
                }
                // mineral-sink columns (dR_j/dn_p) and electroneutrality H column
                for (std::size_t p = 0; p < nAct; ++p)
                {
                    const Allowed& al = allowed[std::size_t(activeMin[p])];
                    for (std::size_t j = 0; j < n; ++j)
                        if (int(j) != pinRow)
                            J[j][nUnk + p] = -al.nuPj[j];
                    if (solveH) J[iH][nUnk + p] = al.nuH;
                }
                // SI = 0 rows: d/dx_k = sum over formation legs of nu * (the
                // species' d ln a/dx_k = nu_species,k for masters/chained spec)
                for (std::size_t p = 0; p < nAct; ++p)
                {
                    const Allowed& al = allowed[std::size_t(activeMin[p])];
                    for (std::size_t k = 0; k < n; ++k)
                        J[nUnk + p][k] = al.nuPj[k];          // d(sum nu ln a)/dx_k
                    if (solveH) J[nUnk + p][iH] = al.nuH;     // H+ leg derivative
                }

                sVector mR(nA);
                for (std::size_t j = 0; j < nA; ++j) mR[j] = -R[j];
                sVector dx = solver::gaussSolve(J, mR);

                // damp cap applies to the ln-BLOCK ONLY; the n_p steps are NOT
                // log-capped (they must reach/cross 0).  But the exhaustion
                // guard limits the WHOLE step so no master's dissolved total
                // crosses its floor in one move -- the precipitation cannot
                // demand ions the water no longer has.  (Free-water path:
                // nAct == 0, so this is a no-op -- byte-identical.)
                double big = 0.0;
                for (std::size_t j = 0; j < nUnk; ++j) big = std::max(big, std::fabs(dx[j]));
                double damp = (big > 4.0) ? 4.0 / big : 1.0;   // visible ln cap

                // exhaustion guard: shrink `damp` so every master stays above
                // floor = max(1e-12, 1e-6*feed) after the (damped) step.
                std::string guardHit;
                for (std::size_t j = 0; nAct > 0 && j < n; ++j)
                {
                    if (int(j) == pinRow) continue;
                    const double floor = std::max(1.0e-12, 1.0e-6 * mtot[j]);
                    const double mNew  = std::exp(xa[j] + damp * dx[j]);
                    if (mNew < floor && dx[j] < 0.0)
                    {
                        // largest f in (0,damp] keeping m_j at the floor
                        const double f = (std::log(floor) - xa[j]) / dx[j];
                        if (f > 0.0 && f < damp) { damp = f; guardHit = mast[j]; }
                    }
                }
                for (std::size_t j = 0; j < nUnk; ++j) xa[j] += damp * dx[j];
                for (std::size_t p = 0; p < nAct; ++p) xa[nUnk + p] += damp * dx[nUnk + p];
                if (!guardHit.empty() && verbosity >= 3)
                    std::cout << "    [guard] step damped to keep master '"
                              << guardHit << "' above its depletion floor "
                                 "(announced)\n";
            }
            out.newtonIters += it;
            if (solveH) m_H = std::exp(xa[iH]);

            // refresh I from EVERY species and test self-consistency
            for (auto& a : act) a.m = speciesM(a);
            double Inew = 0.5 * m_H;                       // z = +1
            for (std::size_t j = 0; j < n; ++j)
                Inew += 0.5 * mz[j] * mz[j] * std::exp(xa[j]);
            mSpeciesSum = 0.0;
            for (const auto& a : act)
            {
                if (a.isExch) continue;           // bound: on the resin, not in I/a_w
                Inew += 0.5 * a.z() * a.z() * a.m;
                mSpeciesSum += a.m;
            }
            double sumM = m_H + mSpeciesSum;       // free site m_X excluded (not aqueous)
            for (std::size_t j = 0; j < n; ++j) sumM += std::exp(xa[j]);
            // Water activity with the model's OSMOTIC coefficient:
            //   a_w = exp(-(M_w/1000) phi sum_i m_i).
            // Pitzer fills ar.osmotic (the rigorous HMW phi on the same virials as
            // its gammas); Davies leaves it null -> phi = 1 (the dilute approx,
            // consistent with Davies being indicative beyond I ~ 0.5).  phi is
            // frozen with the gammas for this pass and converges with the I fixed
            // point (at convergence the frozen state IS the current state).
            const double phi    = ar.osmotic ? ar.osmotic() : 1.0;
            const double awNew  = std::exp(-18.015e-3 * phi * sumM);
            if (verbosity >= 3)
                std::cout << "    gamma pass " << g + 1 << ":  I = " << std::scientific
                          << std::setprecision(6) << Inew << std::defaultfloat
                          << " mol/kg\n";
            if (std::fabs(Inew - I) <= 1.0e-12 + 1.0e-9 * Inew
                && std::fabs(awNew - aw) <= 1.0e-12) converged = true;
            I  = Inew;
            aw = awNew;
        }
        // write the iterate back to the shared state
        for (std::size_t j = 0; j < nUnk; ++j) x[j] = xa[j];
        for (std::size_t p = 0; p < nAct; ++p)
            npVal[std::size_t(activeMin[p])] = xa[nUnk + p];
        return converged;
    };

    // ---- the solve: plain free-water, then (if doEquil) the active-set loop ----
    if (!solvePass({}))
        throw std::runtime_error("speciation: ionic-strength fixed point did not "
            "converge in 60 passes (I = " + std::to_string(I) + " mol/kg)");

    // glass-box parameter dump (verbosity >= 3, once): which model parameters are
    // ACTIVE for the present ion set.  Davies overrides this to a no-op; PitzerHMW
    // lists the live beta/theta/psi/lambda.  Built from the converged free-water
    // state so the dumped set matches exactly the ions in play.
    if (verbosity >= 3)
    {
        IonState st; st.I = I; st.T = T;
        for (std::size_t j = 0; j < n; ++j)
        { st.name.push_back(mast[j]); st.molality.push_back(std::exp(x[j])); st.charge.push_back(mz[j]); }
        st.name.push_back("H"); st.molality.push_back(m_H); st.charge.push_back(1.0);
        for (const auto& a : act)
            if (!a.isExch)
            { st.name.push_back(a.species()); st.molality.push_back(a.m); st.charge.push_back(a.z()); }
        activity_->announceParameters(st, std::cout);
    }

    if (doEquil)
    {
        // record the free-water (no-solid) reference BEFORE any precipitation
        out.Ibefore  = I;
        {
            const ActivityResult ar =
                freezeActivity([&](std::size_t j){ return std::exp(x[j]); });
            out.pHbefore = solveH ? -std::log10(gNamed(ar, "H", 1.0) * m_H) : in.pH;
        }
        for (std::size_t j = 0; j < n; ++j)
            out.totalsBefore[mast[j]] = mtot[j];   // dissolved totals = feed (no solid)

        // SI of an allowed mineral at the live iterate (admission/eviction test)
        auto siAllowed = [&](int ai) -> double
        {
            const ActivityResult ar =
                freezeActivity([&](std::size_t j){ return std::exp(x[j]); });
            std::vector<double> gM(nUnk, 1.0);
            for (std::size_t j = 0; j < n; ++j) gM[j] = gNamed(ar, mast[j], mz[j]);
            if (solveH) gM[iH] = gNamed(ar, "H", 1.0);
            for (auto& a : act) a.gamma = a.isExch ? 1.0 : gNamed(ar, a.species(), a.z());
            const Allowed& al = allowed[std::size_t(ai)];
            double logIAP = al.min->nuWater * std::log10(aw);
            for (const auto& [ion, nu] : al.min->masters)
            {
                double a = speciesActivity(ion, gM, aw);
                if (a <= 0.0) return -1.0e9;
                logIAP += nu * std::log10(a);
            }
            return logIAP - al.logK;
        };

        if (verbosity >= 2)
        {
            std::cout << "  equilibrate: " << allowed.size() << " allowed phase(s) --";
            for (const auto& al : allowed) std::cout << " " << al.min->mineral;
            std::cout << ".  Complementarity per phase:\n"
                         "    SI <= 0 with n = 0  OR  SI = 0 with n > 0.  "
                         "Method: active set (admit most-supersaturated, evict "
                         "n < 0, re-solve).\n";
            std::cout << "  pass 0: free water           ";
            for (std::size_t a = 0; a < allowed.size(); ++a)
                std::cout << " SI " << allowed[a].min->mineral << " "
                          << std::showpos << std::fixed << std::setprecision(3)
                          << siAllowed(int(a)) << std::noshowpos;
            std::cout << std::defaultfloat << "\n";
        }

        std::vector<int> active;                       // indices into `allowed`
        auto isActive = [&](int ai){ for (int a : active) if (a == ai) return true; return false; };
        std::vector<std::string> history;
        const int maxChanges = 2 * int(allowed.size()) + 5;
        int changes = 0, passNo = 0;
        for (;; )
        {
            // (3) eviction: most-negative active n_p < 0 leaves
            int evict = -1; double mostNeg = -1.0e-10;
            for (int ai : active)
                if (npVal[std::size_t(ai)] < mostNeg) { mostNeg = npVal[std::size_t(ai)]; evict = ai; }
            if (evict >= 0)
            {
                npVal[std::size_t(evict)] = 0.0;
                active.erase(std::remove(active.begin(), active.end(), evict), active.end());
                if (++changes > maxChanges)
                    throw std::runtime_error("equilibrate: active set did not settle in "
                        + std::to_string(maxChanges) + " changes; history:" +
                        [&]{ std::string h; for (auto& s : history) h += " " + s; return h; }());
                history.push_back("evict:" + allowed[std::size_t(evict)].min->mineral);
                if (!solvePass(active))
                    throw std::runtime_error("equilibrate: I fixed point diverged after eviction");
                ++passNo;
                if (verbosity >= 2)
                    std::cout << "  pass " << passNo << ": - "
                              << allowed[std::size_t(evict)].min->mineral
                              << " (evicted: n < 0)\n";
                continue;
            }
            // (2) admission: most-supersaturated inactive allowed mineral, SI > tol
            int admit = -1; double mostSI = 1.0e-10;
            for (std::size_t a = 0; a < allowed.size(); ++a)
            {
                if (isActive(int(a))) continue;
                double si = siAllowed(int(a));
                if (si > mostSI) { mostSI = si; admit = int(a); }
            }
            if (admit >= 0)
            {
                active.push_back(admit);
                if (++changes > maxChanges)
                    throw std::runtime_error("equilibrate: active set did not settle in "
                        + std::to_string(maxChanges) + " changes; history:" +
                        [&]{ std::string h; for (auto& s : history) h += " " + s; return h; }());
                history.push_back("admit:" + allowed[std::size_t(admit)].min->mineral);
                if (!solvePass(active))
                    throw std::runtime_error("equilibrate: I fixed point diverged after admission");
                ++passNo;
                if (verbosity >= 2)
                    std::cout << "  pass " << passNo << ": + "
                              << allowed[std::size_t(admit)].min->mineral
                              << " (SI = 0 row)  n = " << std::scientific
                              << std::setprecision(3) << npVal[std::size_t(admit)]
                              << " mol/kg" << std::defaultfloat << "\n";
                continue;
            }
            break;   // (4) complementarity holds for all allowed
        }
        out.activeSetPasses = passNo;
        // record precipitated amounts + post-equilibration dissolved totals
        for (std::size_t a = 0; a < allowed.size(); ++a)
            out.precipitated[allowed[a].min->mineral] =
                isActive(int(a)) ? npVal[a] : 0.0;
        for (std::size_t j = 0; j < n; ++j)
        {
            double tot = mtot[j];
            for (std::size_t a = 0; a < allowed.size(); ++a)
                if (isActive(int(a))) tot -= allowed[a].nuPj[j] * npVal[a];
            out.totalsAfter[mast[j]] = tot;
        }
        // pH-stat risk: given-pH + a precipitated mineral with an H-leg
        if (!solveH)
            for (std::size_t a = 0; a < allowed.size(); ++a)
                if (isActive(int(a)) && allowed[a].hasHleg) out.pHstatRisk = true;
    }
    out.I  = I;
    out.aw = aw;

    // -- assemble the table ------------------------------------------------------
    // One final activity freeze on the converged composition (the report's
    // per-species gamma comes from the SAME model + state the solve used).
    const ActivityResult arOut =
        freezeActivity([&](std::size_t j){ return std::exp(x[j]); });
    for (std::size_t j = 0; j < n; ++j)
    {
        SpeciesRow r;
        r.name = mast[j]; r.z = mz[j];
        r.molality = std::exp(x[j]);
        r.gamma    = gNamed(arOut, mast[j], mz[j]);
        r.activity = r.gamma * r.molality;
        r.isMaster = true;
        out.rows.push_back(std::move(r));
    }
    {
        SpeciesRow r;                                  // H+: fixed (given) or solved
        r.name = "H"; r.z = 1.0;
        r.gamma    = gNamed(arOut, "H", 1.0);
        r.molality = solveH ? m_H : a_H / r.gamma;
        r.activity = solveH ? r.gamma * r.molality : a_H;  // given mode: exact echo
        r.isMaster = true;
        out.pH = solveH ? -std::log10(r.activity) : in.pH;
        out.rows.push_back(std::move(r));
    }
    for (const auto& a : act)
    {
        SpeciesRow r;
        r.name = a.species(); r.z = a.z();
        r.molality = a.m;
        // bound exchange species: activity is the EQUIVALENT FRACTION beta
        // (gamma = 1); aqueous complexes: the model gamma on the species.
        if (a.isExch)
        {
            r.gamma    = 1.0;
            r.activity = (a.nuSite * a.m) / CEC;        // beta_s = z*m_sX/CEC
        }
        else
        {
            r.gamma    = gNamed(arOut, a.species(), a.z());
            r.activity = r.gamma * r.molality;
        }
        out.rows.push_back(std::move(r));
    }
    // free-site X-: its molality and equivalent fraction (a master-like row)
    if (doExchange)
    {
        SpeciesRow r;
        r.name = in.exchange.exchanger; r.z = 0.0;      // pseudo-master, not aqueous
        r.molality = std::exp(x[iX]);
        r.gamma    = 1.0;
        r.activity = r.molality / CEC;                  // beta_X = m_X/CEC
        r.isMaster = true;
        out.rows.push_back(std::move(r));
    }

    // -- cation-exchange result: loadings + the eq-for-eq salt penalty ----------
    if (doExchange)
    {
        out.exchangeActive = true;
        out.CEC = CEC;
        out.m_X = std::exp(x[iX]);          // the X- activity variable (beta_X=m_X/CEC)
        double held = 0.0;                   // equivalents on sites (= CEC at solve)
        for (const auto& a : act)
            if (a.isExch)
            {
                out.bound[a.exchName] = a.m;
                out.beta[a.exchName]  = (a.nuSite * a.m) / CEC;
                held += a.nuSite * a.m;
            }
        out.cecUtilisedPct = 100.0 * held / CEC;   // ~100% (sites always full)
        // aqueous cation totals IN (pristine FEED) vs OUT (after exchange).  The
        // conserved total mtot already folds in the resin's initial form-ion
        // load (CEC eq of Na for a Na-form resin); aqAfter = conserved - bound,
        // aqBefore = the pristine feed -- so Na_added = aqAfter - aqBefore is the
        // NET Na released eq-for-eq (the salt penalty), positive by construction.
        for (std::size_t j = 0; j < n; ++j)
        {
            double afterTot = mtot[j];
            for (const auto& a : act)
                if (a.isExch && a.exchIonIdx == int(j)) afterTot -= a.m;
            out.aqBefore[mast[j]] = mtotFeed[j];
            out.aqAfter[mast[j]]  = afterTot;
        }
    }

    // -- saturation indices: every mineral whose ions are all in the table ------
    for (const auto& m : minerals_)
    {
        double logIAP = m.nuWater * std::log10(out.aw);
        bool ok = true;
        for (const auto& [ion, nu] : m.masters)
        {
            const SpeciesRow* r = out.find(ion);
            if (!r || r->activity <= 0.0) { ok = false; break; }
            logIAP += nu * std::log10(r->activity);
        }
        if (!ok) continue;                             // absent ion: SI not defined
        out.SI[m.mineral] = logIAP - kT(m.mineral, m.logK25, m.hasDH, m.dH, m.kt);
    }

    // -- K(T) FORM announcement (off-25 only; at 25 C every entry returns logK25
    //    and NO bucket was touched, so this whole block is silent -- the run is
    //    byte-identical at 298.15 K).  Three forms, each named:
    //      analytic  -- the PHREEQC analytic log_k(T), anchored on logK25
    //      van't Hoff-- constant-dH slope (unchanged path)
    //      flat      -- genuinely-bare entry, K held at 25 C (the shrinking set)
    if (verbosity >= 2 && offT)
    {
        auto line = [&](const char* tag, const std::vector<std::string>& v)
        {
            if (v.empty()) return;
            std::cout << "  K(T) " << tag << ":";
            for (const auto& s : v) std::cout << " " << s;
            std::cout << "\n";
        };
        line("analytic (PHREEQC log_k(T), anchored on logK25)", out.analyticK);
        line("van't Hoff (constant dH)",                        out.vantHoffK);
        if (!out.flatK.empty())
        {
            std::cout << "  K(T) HELD AT 25 C (no dH, no analytic in the catalogue)"
                         " for:";
            for (const auto& s : out.flatK) std::cout << " " << s;
            std::cout << "\n";
        }
        if (!out.extrapolated.empty())
        {
            std::ostringstream msg;
            msg << "K(T) EXTRAPOLATED beyond the fitted analytic range at T = "
                << std::fixed << std::setprecision(1) << (T - 273.15) << " C for:";
            for (const auto& s : out.extrapolated) msg << " " << s;
            if (AdvisoryLog::instance().add("model", "warning", "speciation",
                                            msg.str()))
                std::cout << "  [advisory] " << msg.str() << "\n";
        }
    }

    // -- honesty: Davies beyond its range is INDICATIVE, and we say so ----------
    // (Pitzer HMW is built for exactly this high-I regime -- the advisory is a
    // Davies-only caveat, so it never fires when Pitzer is the active model.)
    if (I > 0.7 && activityName_ == "davies")
    {
        out.daviesExceeded = true;
        std::ostringstream msg;
        msg << "Davies activity at I = " << std::fixed << std::setprecision(2)
            << I << " mol/kg -- beyond its ~0.5 mol/kg trust range; speciation "
               "and SI are INDICATIVE (use Pitzer for quantitative work)";
        if (AdvisoryLog::instance().add("model", "warning", "speciation", msg.str())
            && verbosity >= 2)
            std::cout << "  [advisory] " << msg.str() << "\n";
    }

    if (verbosity >= 2)
    {
        if (solveH)
        {
            std::cout << "  speciation: SOLVED pH = " << std::fixed
                      << std::setprecision(3) << out.pH
                      << " (from electroneutrality";
            if (out.imbalancePct > 0.0)
                std::cout << "; feed imbalance " << std::setprecision(2)
                          << out.imbalancePct << "% absorbed";
            std::cout << ")\n" << std::defaultfloat;
        }
        std::cout << "  speciation: " << out.rows.size() << " species, I = "
                  << std::scientific << std::setprecision(4) << out.I
                  << " mol/kg, a_w = " << std::fixed << std::setprecision(5)
                  << out.aw << "  (" << out.gammaIters << " gamma passes, "
                  << out.newtonIters << " Newton steps)\n" << std::defaultfloat;
        if (!out.SI.empty())
        {
            std::cout << "  SI:";
            for (const auto& [name, si] : out.SI)
                std::cout << "  " << name << " " << std::showpos << std::fixed
                          << std::setprecision(3) << si << std::noshowpos;
            std::cout << std::defaultfloat << "\n";
        }
    }

    // -- equilibrium-precipitation ledger + the honesty banner ------------------
    if (doEquil)
    {
        // The honesty banner is NON-SUPPRESSIBLE at verbosity >= 2 and lands an
        // AdvisoryLog entry (category equilibrate, severity info) regardless --
        // equilibrium amounts are a thermodynamic CEILING, not a deposit forecast.
        const std::string banner =
            "EQUILIBRIUM CEILING -- not a deposit prediction.  Amounts are the "
            "thermodynamic MAXIMUM precipitation (SI -> 0, infinite time, no "
            "nucleation barrier).  Real scale is kinetically limited -- induction "
            "time and antiscalants act on kinetics, which this calculation cannot "
            "see.  Actual deposit <= ceiling, often far less.  The safe direction "
            "is rigorous: ceiling ~ 0 => no driving force.";
        AdvisoryLog::instance().add("equilibrate", "info", "speciation", banner);

        if (verbosity >= 2)
        {
            std::cout << "\n  +-- EQUILIBRIUM CEILING -- not a deposit prediction. -----+\n"
                         "  | Amounts below are the thermodynamic MAXIMUM precipitation\n"
                         "  | (SI -> 0, infinite time, no nucleation barrier).  Real\n"
                         "  | scale is kinetically limited -- induction time and\n"
                         "  | antiscalants act on kinetics, which this calculation\n"
                         "  | cannot see.  Actual deposit <= ceiling, often far less.\n"
                         "  | The safe direction is rigorous: ceiling ~ 0 => no\n"
                         "  | driving force.\n"
                         "  +---------------------------------------------------------+\n";
            std::cout << "  [note] mineral MW derived as sum nu*MW(ion) + nuWater*MW(H2O)"
                         " from species/aqueous/ (no minerals.dat MW field)\n";

            std::cout << "  PRECIPITATION LEDGER:\n";
            for (const auto& al : allowed)
            {
                const std::string& nm = al.min->mineral;
                const double np = out.precipitated[nm];
                const double mw = mineralMW(nm);
                const double siAfter = out.SI.count(nm) ? out.SI.at(nm) : 0.0;
                if (np > 0.0)
                    std::cout << "    " << std::left << std::setw(12) << nm << std::right
                              << "  n = " << std::scientific << std::setprecision(4) << np
                              << " mol/kg = " << std::fixed << std::setprecision(2)
                              << np * mw * 1000.0 << " mg/kg   SI -> "
                              << std::showpos << std::setprecision(3) << siAfter
                              << std::noshowpos << std::defaultfloat << "\n";
                else
                    std::cout << "    " << std::left << std::setw(12) << nm << std::right
                              << "  stayed dissolved (n = 0)  SI " << std::showpos
                              << std::fixed << std::setprecision(3) << siAfter
                              << std::noshowpos << std::defaultfloat << "\n";
            }
            // catalogue minerals NOT equilibrated (with their free-water SI)
            bool firstOther = true;
            for (const auto& [nm, si] : out.SI)
            {
                bool isAllowed = false;
                for (const auto& al : allowed) if (al.min->mineral == nm) isAllowed = true;
                if (isAllowed) continue;
                if (firstOther)
                { std::cout << "    (not equilibrated, SI shown for reference):"; firstOther = false; }
                std::cout << "  " << nm << " " << std::showpos << std::fixed
                          << std::setprecision(3) << si << std::noshowpos;
            }
            if (!firstOther) std::cout << std::defaultfloat << "\n";
            // aragonite note: equilibrium picks the stable polymorph
            for (const auto& al : allowed)
                if (al.min->mineral == "calcite")
                    for (const auto& [nm, si] : out.SI)
                        if (nm == "aragonite")
                            std::cout << "    [note] equilibrium picks the STABLE "
                                         "polymorph (calcite); aragonite forming "
                                         "first is KINETICS, not equilibrium\n";

            // WATER AFTER block
            std::cout << "  WATER AFTER (dissolved totals before -> after):\n";
            for (std::size_t j = 0; j < n; ++j)
            {
                const double b = out.totalsBefore[mast[j]], a = out.totalsAfter[mast[j]];
                if (std::fabs(a - b) > 1.0e-12 * std::max(1.0, b))
                    std::cout << "    " << std::left << std::setw(6) << mast[j]
                              << std::right << std::scientific << std::setprecision(4)
                              << b << " -> " << a << " mol/kg  (" << std::showpos
                              << std::fixed << std::setprecision(1)
                              << 100.0 * (a - b) / b << "%)" << std::noshowpos
                              << std::defaultfloat << "\n";
            }
            std::cout << "    pH " << std::fixed << std::setprecision(3) << out.pHbefore
                      << " -> " << out.pH << "    I " << std::scientific
                      << std::setprecision(4) << out.Ibefore << " -> " << out.I
                      << " mol/kg\n" << std::defaultfloat;

            if (out.daviesExceeded)
                std::cout << "    [advisory] I > 0.5 mol/kg -- n_precip here is "
                             "INDICATIVE (Davies beyond its trust range)\n";
        }

        // given-pH + H-leg mineral: loud pH-stat warning (H is NOT conserved)
        if (out.pHstatRisk)
        {
            std::ostringstream ph; ph << std::fixed << std::setprecision(2) << out.pH;
            const std::string msg =
                "pH HELD at " + ph.str() + " while a carbonate "
                "mineral precipitated -- the released H+ is absorbed by an "
                "UNSTATED external buffer; H is NOT conserved and the amounts "
                "are pH-stat (titrated) values.  Prefer `pH solve` so the freed "
                "H+ re-acidifies the water and the equilibrium is closed.";
            if (AdvisoryLog::instance().add("equilibrate", "warning", "speciation", msg)
                && verbosity >= 1)
                std::cout << "  [advisory] " << msg << "\n";
        }
    }
    return out;
}

} // namespace electrolyte
} // namespace Choupo
