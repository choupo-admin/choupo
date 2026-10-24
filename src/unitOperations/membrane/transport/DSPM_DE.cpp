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
  DSPM-DE -- the equations, glass-box.  See DSPM_DE.H for the references and the
  staged-exclusion rationale.

  Numerical strategy (the §9 K=1-trap lesson made operational):
    * One z station = one binary (or multi-salt) electrolyte pore problem.
    * Ion gammas (Davies, wall) come from the speciation hook ONCE per station.
    * The shared Polarisation object (massTransfer/Polarisation.H, the ONE
      home of the wall for all three transport laws) raises the bulk conc to
      the WALL conc at the same k the solutionDiffusion seed uses -- the
      per-solute film by default, the Geraldes & Afonso (2007) coupled
      interface model when the case declares `polarisation { ionCoupling
      electroneutral; }` -- and the wall is then read ION BY ION, which is
      what the partition (2) takes as its c_bulk.
    * The SOLVED pore (the DEFAULT since 2026-10-24, DEV.md 4c C141; or
      `poreSolver { method finiteDifference; }`): the ENP on n nodes, every
      node at once by Newton on the declared block-tridiagonal structure --
      PoreNernstPlanck.{H,cpp} -- with, by default, the wall closed with
      that pore's own permeate (`wallClosure porePermeate`).
    * The DECLARED closed form (`poreSolver { method closedForm; }`, the
      default until C141): a bisection on the feed Donnan potential
      (feed-face electroneutrality), a bisection on a permeate Donnan
      potential (permeate electroneutrality) -- both only when the membrane
      declares a charge -- and a closed-form per-ion transmission between
      them.  It does NOT impose (4) or (5) inside the pore (DSPM_DE.H says
      what each path solves; this list used to say "inner unknowns solved by
      NewtonND ... zero net current integrated across the pore", which the
      closed form never did).  It still computes the solved pore's seed.
    * The water flux: J_w = A_w (dP - dpi) around either pore -- a damped
      fixed point under the closed form, a safeguarded secant under the
      solved pore.
    * The exclusions are switched on by the membrane record and ANNOUNCED;
      there is no seeding chain between them at run time (the closed form
      needs no seed -- its potentials are monotone bisections that cannot
      land on the psi = 0 branch -- and the solved pore starts from local
      Donnan equilibrium at every node).
\*---------------------------------------------------------------------------*/

#include "DSPM_DE.H"
#include "PoreNernstPlanck.H"

#include "core/Advisory.H"
#include "core/InfeasibleTrial.H"
#include "solver/NewtonND.H"
#include "core/Constants.H"
#include "core/RegistryRefusal.H"
#include "thermo/ThermoPackage.H"
#include "thermo/membrane/Membrane.H"
#include "thermo/electrolyte/SolventProperties.H"
#include "thermo/electrolyte/SpeciationSolver.H"
#include "../osmotic/OsmoticModel.H"

// The ion-transport tier (radius, D0) lives in the THERMO tier -- re-homed
// 2026-07-25 from the electrochem header (that home coupled membrane ->
// electrochem, an inversion).  Charges via electrolyte::ionCharge as before.
#include "thermo/electrolyte/IonTransport.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <numeric>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {
namespace membrane {

namespace {

// ---- physical constants for the Born term ---------------------------------
// Faraday and elementary charge from the CODATA Avogadro / Boltzmann already in
// Constants.H (e = F/N_A; F = N_A*e).  Vacuum permittivity is the CODATA value.
constexpr scalar F_const   = 96485.33212;            // [C/mol]  Faraday
constexpr scalar e_charge  = F_const / constant::Na; // [C]      elementary charge
constexpr scalar eps0      = 8.8541878128e-12;       // [F/m]    vacuum permittivity

// ---- The hindrance factors from lambda = r_ion / r_pore ---------------------
// Diffusive hindrance K_d, convective hindrance K_c and the steric partition
// Phi = (1 - lambda)^2.  ONE pair since 2026-10-24 (DEV.md 4c C141): until
// then the default took Dechadilok & Deen's polynomial H itself as K_d -- but
// H = Phi K_d, and Phi is carried separately in the partition (2), so that
// default counted the steric partition TWICE in diffusion (K_d too small by
// (1 - lambda)^2).  The word that selected it, `hindrance legacy`, now
// refuses by name (readParameters).
struct HindranceFactors { scalar Kd; scalar Kc; scalar Phi; };

// ---- Dechadilok & Deen (2006), the cross-section-averaged pair -------------
// Dechadilok & Deen, "Hindrance factors for diffusion and convection in
// pores", Ind. Eng. Chem. Res. 45 (2006) 6953-6959.  Their polynomial fits
// H = Phi K_d (the product with the steric partition), valid to lambda =
// 0.95; above it the lubrication form K_d = 0.984 ((1 - lambda)/lambda)^(5/2)
// takes over (and meets H/Phi at 0.95 to 6e-3 -- which is how one reads
// that the polynomial is H, not K_d).  K_c is their rational fit.  This is
// the pair NanoFiltran evaluates (NANOFILTRAN.F, the hindrance loop); a
// fully excluded ion (lambda >= 1) gets NanoFiltran's floor 1e-8 there.
HindranceFactors dechadilokDeenFactors(scalar lambda)
{
    const scalar l = std::max(lambda, 0.0);
    if (l >= 1.0) return { 1e-8, 1e-8, 1e-15 };
    const scalar Phi = (1.0 - l) * (1.0 - l);
    scalar Kd;
    if (l <= 0.95)
    {
        const scalar l2 = l*l, l3 = l2*l, l4 = l3*l, l5 = l4*l, l6 = l5*l, l7 = l6*l;
        const scalar lnl = (l > 1e-300) ? std::log(l) : 0.0;
        const scalar H = 1.0 + 1.125 * l * lnl - 1.56034 * l + 0.528155 * l2
                       + 1.91521 * l3 - 2.81903 * l4 + 0.270788 * l5
                       + 1.10115 * l6 - 0.435933 * l7;
        Kd = H / Phi;
    }
    else
        Kd = 0.984 * std::pow((1.0 - l) / l, 2.5);
    const scalar Kc = (1.0 + 3.867 * l - 1.907 * l * l - 0.834 * l * l * l)
                    / (1.0 + 1.867 * l - 0.741 * l * l);
    return { Kd, Kc, Phi };
}

// Davies on log10 with A from the solvent's dielectric constant:
// A(eps, T) = 1.82483e6 (eps T)^(-3/2), the Debye-Hueckel constant on the
// concentration scale (mol/L).  At eps = 78.45, T = 298.15 K it is 0.5101,
// SpeciationSolver::daviesA's 0.51.  Used by `activity bulkOverPoreDavies`
// with eps_b on the solution side and eps_p on the pore side.
scalar daviesAofEps(scalar eps, scalar T)
{
    return 1.82483e6 * std::pow(eps * T, -1.5);
}

// Born solvation energy difference dW_i [J] for moving ion i from bulk
// (eps_b) into the pore (eps_p).  Bowen & Welfoot 2002 Eq. 16.
//   dW = z^2 e^2 / (8 pi eps0 r_ion) (1/eps_p - 1/eps_b)
scalar bornEnergy(int z, scalar r_ion, scalar eps_p, scalar eps_b)
{
    if (eps_p <= 0.0 || r_ion <= 0.0) return 0.0;
    return (scalar(z) * scalar(z) * e_charge * e_charge)
         / (8.0 * constant::pi * eps0 * r_ion) * (1.0 / eps_p - 1.0 / eps_b);
}

// Davies activity coefficient (mole/volume basis approximated by molal Davies,
// the same teaching rung the speciation hook uses).  z is the charge, I the
// ionic strength [mol/m^3 -> mol/L], A the Davies coefficient at T.
scalar daviesGammaConc(int z, scalar I_molL, scalar A)
{
    if (z == 0) return 1.0;
    const scalar sI = std::sqrt(std::max(I_molL, 0.0));
    const scalar log10g = -A * scalar(z) * scalar(z)
                        * (sI / (1.0 + sI) - 0.3 * I_molL);
    return std::pow(10.0, log10g);
}

// A single ion in the DSPM-DE problem.
struct Ion
{
    SpeciesId name;       // TYPED species id (declared FK of its salt)
    int    z = 0;         // signed charge
    scalar r = 0.0;       // ion radius [m]
    scalar D = 0.0;       // free-solution D0 [m^2/s]
    scalar c_bulk = 0.0;  // wall (feed-side) molarity [mol/m^3]
    // derived
    scalar lambda = 0.0, Kd = 0.0, Kc = 0.0, Phi = 0.0, dWkT = 0.0;
    std::size_t salt = 0; // which salt component it belongs to (collapse back)
    int    stoich = 0;    // ions of this kind per formula unit (for the collapse)
};

} // anonymous namespace

// ---------------------------------------------------------------------------
//  `transportParameters { poreSolver { method <word>; nodes <n>;
//  wallClosure <word>; } ... }`.  Absent (the block, or `poreSolver` in it),
//  the pore is SOLVED -- `method finiteDifference; nodes 101; wallClosure
//  porePermeate;`, the stated defaults since 2026-10-24 (DEV.md 4c C141),
//  set in the member initialisers because this reader is called only when
//  the case writes the block, and announced at the first solve.  A key
//  this law does not read, a method word it does not know, and a grid it
//  cannot use each REFUSE by name: a declared word the engine dispatches on
//  must not fall through to a default (CLAUDE.md, 2026-09-07).
void DSPM_DE::readParameters(const DictPtr& params)
{
    const std::string ctx = "transport DSPM-DE: transportParameters";
    if (!params) return;
    for (const auto& k : params->keys())
        if (k != "poreSolver" && k != "hindrance" && k != "activity"
            && k != "bulkDielectric")
            throw std::runtime_error(ctx + " declares `" + k + "`, which this"
                " law does not read.  DSPM-DE reads `poreSolver { method"
                " closedForm | finiteDifference; nodes <n>; wallClosure"
                " solutionDiffusion | porePermeate; }`, `hindrance`,"
                " `activity` and `bulkDielectric` there.");

    //  The declared model choices (DSPM_DE.H, "DECLARED CHOICES").  Each
    //  word refuses an unknown spelling naming the accepted list.
    if (params->found("hindrance"))
    {
        const std::string w = params->lookupWord("hindrance");
        //  The retired word, refused with its reason (DEV.md 4c C141): a
        //  case that declared it asked for a model this law no longer has,
        //  and falling to the default in silence would change its answer
        //  without a word.
        if (w == "legacy")
            throw std::runtime_error(ctx + " declares `hindrance legacy;`,"
                " which is RETIRED (2026-10-24): it took as K_d the Dechadilok-Deen"
                " polynomial H, which is the PRODUCT Phi K_d, while the steric"
                " partition Phi = (1 - lambda)^2 is carried separately in the"
                " interfacial partition -- so it counted the steric partition"
                " twice in diffusion (K_d too small by (1 - lambda)^2).  Declare"
                " `hindrance DechadilokDeen2006;` (K_d = H/Phi, their K_c; the"
                " default) or drop the key.");
        const std::vector<std::string> acc = { "DechadilokDeen2006" };
        if (std::find(acc.begin(), acc.end(), w) == acc.end())
            throw std::runtime_error(registryRefusal::message(
                "DSPM-DE hindrance", w, acc, "Accepted"));
        hindranceDeclared_ = true;
    }
    if (params->found("activity"))
    {
        const std::string w = params->lookupWord("activity");
        const std::vector<std::string> acc = { "wallDavies", "ideal",
                                               "bulkOverPoreDavies" };
        if (std::find(acc.begin(), acc.end(), w) == acc.end())
            throw std::runtime_error(registryRefusal::message(
                "DSPM-DE activity", w, acc, "Accepted"));
        activity_ = (w == "ideal")              ? Activity::Ideal
                  : (w == "bulkOverPoreDavies") ? Activity::BulkOverPoreDavies
                                                : Activity::WallDavies;
    }
    if (params->found("bulkDielectric"))
    {
        const scalar e = params->lookupScalar("bulkDielectric");
        if (!(e >= 1.0) || !std::isfinite(e))
            throw std::runtime_error(ctx + " `bulkDielectric` must be a relative"
                " dielectric constant of at least 1 (it reads "
                + std::to_string(e) + ")");
        bulkDielectric_ = e;
    }

    if (!params->found("poreSolver"))
        return;                   // the solved pore, every stated default
    const auto ps = params->subDict("poreSolver");
    for (const auto& k : ps->keys())
        if (k != "method" && k != "nodes" && k != "wallClosure")
            throw std::runtime_error(ctx + ".poreSolver declares `" + k
                + "`, which the pore solver does not read (it reads `method`,"
                  " `nodes` and `wallClosure`).");
    if (!ps->found("method"))
        throw std::runtime_error(ctx + ".poreSolver declares no `method` --"
            " say `finiteDifference` (the pore solved node by node, the default"
            " when the block is absent) or `closedForm` (the uniform-gradient"
            " form, which does not solve the pore)");
    const std::string method = ps->lookupWord("method");
    const std::vector<std::string> accepted = { "closedForm", "finiteDifference" };
    if (std::find(accepted.begin(), accepted.end(), method) == accepted.end())
        throw std::runtime_error(registryRefusal::message(
            "DSPM-DE pore solver method", method, accepted, "Accepted"));
    finiteDifference_ = (method == "finiteDifference");
    methodDefaulted_  = false;
    if (!finiteDifference_)
    {
        //  The closed form has no permeate of its own to close the wall
        //  with: its wall is the solution-diffusion B_s closure.
        wallClosure_          = WallClosure::SolutionDiffusion;
        wallClosureDefaulted_ = false;
        poreNodes_            = 0;
        nodesDefaulted_       = false;
        if (ps->found("nodes"))
            throw std::runtime_error(ctx + ".poreSolver declares `nodes` with"
                " `method closedForm;` -- the closed form has no grid, so the"
                " number would be read by nothing.  Drop it, or say"
                " `method finiteDifference;`.");
        if (ps->found("wallClosure"))
            throw std::runtime_error(ctx + ".poreSolver declares `wallClosure`"
                " with `method closedForm;` -- only the solved pore can close"
                " the wall with its own permeate.  Drop it, or say `method"
                " finiteDifference;`.");
        if (activity_ == Activity::BulkOverPoreDavies)
            throw std::runtime_error(ctx + " declares `activity"
                " bulkOverPoreDavies;` with `method closedForm;` -- its"
                " pore-side activity coefficients are read at the pore's own"
                " end nodes, which the closed form does not have.  Say `method"
                " finiteDifference;`.");
        return;
    }
    if (ps->found("wallClosure"))
    {
        const std::string w = ps->lookupWord("wallClosure");
        const std::vector<std::string> acc = { "solutionDiffusion", "porePermeate" };
        if (std::find(acc.begin(), acc.end(), w) == acc.end())
            throw std::runtime_error(registryRefusal::message(
                "DSPM-DE pore solver wallClosure", w, acc, "Accepted"));
        wallClosure_ = (w == "porePermeate") ? WallClosure::PorePermeate
                                             : WallClosure::SolutionDiffusion;
        wallClosureDefaulted_ = false;
    }
    if (ps->found("nodes"))
    {
        const scalar n = ps->lookupScalar("nodes");
        if (!(n >= 3.0) || n != std::floor(n) || n > 100000.0)
            throw std::runtime_error(ctx + ".poreSolver `nodes` must be a whole"
                " number of grid nodes across the pore, faces included, of at"
                " least 3 (it reads " + std::to_string(n) + ")");
        poreNodes_      = static_cast<std::size_t>(n);
        nodesDefaulted_ = false;
    }
    // else: the stated default (101, the member initialiser), announced at
    // the first solve.
}

// ---------------------------------------------------------------------------
TransportSolution DSPM_DE::localFluxes(const TransportContext& ctx) const
{
    const ThermoPackage& thermo = ctx.thermo;
    const auto&  soluteIdx = ctx.soluteIdx;
    const scalar A_w       = ctx.A_w;
    const Polarisation&        polar = ctx.polarisation;
    const MassTransferContext& hyd   = ctx.hydraulics;
    const scalar dP        = ctx.P_feed_Pa - ctx.P_perm_Pa;
    const scalar T         = ctx.T_K;
    const auto&  c_b       = ctx.c_b;            // bulk salt conc [kmol/m^3]
    const auto&  B_s       = ctx.B_s;
    const Membrane* mem    = ctx.membrane;
    const std::size_t Ns   = soluteIdx.size();

    // ---- Refuse loudly: DSPM-DE needs the membrane pore tier ----------------
    if (!mem || !mem->hasPoreModel())
        throw std::runtime_error("transport DSPM-DE: membrane '"
            + (mem ? mem->name() : std::string("(none)"))
            + "' has no poreModel{} block (poreRadius + porosity/thickness "
              "[+ chargeDensity + poreDielectric]).  DSPM-DE is a charged-pore "
              "model; a solution-diffusion membrane cannot select it.  Use a "
              "membrane with a poreModel{} tier (e.g. NF270_dspmde) or set "
              "`transport solutionDiffusion;`.");

    const scalar r_p   = mem->poreRadius_m();
    const scalar X_d   = mem->hasChargeDensity() ? mem->chargeDensity_molm3() : 0.0;
    const scalar eps_b = (bulkDielectric_ > 0.0) ? bulkDielectric_
                                                 : SolventProperties::epsWater(T);
    const scalar eps_p = mem->hasPoreDielectric() ? mem->poreDielectric() : eps_b;
    const bool   bornOn   = mem->hasPoreDielectric() && eps_p < eps_b;
    const bool   donnanOn = mem->hasChargeDensity() && std::abs(X_d) > 1e-30;

    TransportSolution out;
    out.c_m.assign(Ns, 0.0);
    out.c_p.assign(Ns, 0.0);
    out.J_s.assign(Ns, 0.0);
    out.J_w = 0.0;
    const bool imposed = std::isfinite(ctx.imposedJv);
    if (!imposed && dP <= 0.0) return out;

    // ---- The declared model choices, announced once (DSPM_DE.H) ------------
    if (!choicesSaid_)
    {
        choicesSaid_ = true;
        std::ostringstream c;
        //  The hindrance pair is announced whether declared or not: it is
        //  the one pair this law has, and a reader of an undeclared run must
        //  still see which K_d and K_c priced it.
        c << "  [DSPM-DE] hindrance DechadilokDeen2006 ("
          << (hindranceDeclared_ ? "declared" : "the default") << "): K_d ="
             " H/Phi (Dechadilok & Deen, Ind. Eng. Chem. Res. 45 (2006)"
             " 6953), K_c their rational fit\n";
        if (activity_ == Activity::Ideal)
            c << "  [DSPM-DE] activity ideal (declared): every activity"
                 " coefficient 1, both faces\n";
        else if (activity_ == Activity::BulkOverPoreDavies)
            c << "  [DSPM-DE] activity bulkOverPoreDavies (declared):"
                 " gamma_bulk/gamma_pore at both faces, Davies (log10) with"
                 " A(eps_b) = " << daviesAofEps(eps_b, T) << " and A(eps_p) = "
              << daviesAofEps(eps_p, T) << " (1.82483e6 (eps T)^-3/2); the"
                 " pore gammas converged around the pore solve\n";
        if (bulkDielectric_ > 0.0)
            c << "  [DSPM-DE] bulkDielectric " << bulkDielectric_
              << " (declared; SolventProperties::epsWater(T) would give "
              << SolventProperties::epsWater(T) << ")\n";
        if (wallClosure_ == WallClosure::PorePermeate)
            c << "  [DSPM-DE] wallClosure porePermeate ("
              << (wallClosureDefaulted_ ? "the default" : "declared")
              << "): the wall closed with the solved pore's own permeate\n";
        if (!finiteDifference_)
            c << "  [DSPM-DE] poreSolver closedForm (declared): the pore is NOT"
                 " solved -- feed-face Donnan, an electroneutral permeate, each"
                 " ion carried across alone by a closed-form transmission that"
                 " is not the solution of the extended Nernst-Planck equations"
                 " (DSPM_DE.H); the wall closed with the salts' B_s\n";
        if (imposed)
            c << "  [DSPM-DE] J_v IMPOSED by the caller (" << ctx.imposedJv
              << " m/s): no J_w = A_w (dP - dpi) closure\n";
        std::cout << c.str();
    }

    // ---- Stage banner (announced ONCE, no silent fallback) ------------------
    if (!banner_done_)
    {
        banner_done_ = true;
        std::cout << "  [DSPM-DE] charged-pore Nernst-Planck (Bowen-Welfoot 2002)"
                  << "  r_p = " << r_p * 1e9 << " nm,  X_d = " << X_d
                  << " mol/m3\n"
                  << "  [DSPM-DE] exclusions: steric ON"
                  << (donnanOn ? " | Donnan ON" : " | Donnan OFF (X_d=0)")
                  << (bornOn   ? " | Born ON (eps_p<eps_b)" : " | Born OFF")
                  << "\n";
        // The activity treatment belongs to the MODEL, not to the case's
        // `aqueous {}` declaration (that governs units that ASK for
        // activities; this model IS its activity treatment).  Since C138
        // slice 2 the law offers three declared treatments of its own
        // (`transportParameters { activity ...; }`, DSPM_DE.H); the
        // default line below is the one every DSPM-DE run printed before.
        if (activity_ == Activity::WallDavies)
            std::cout << "  [DSPM-DE] activity: Davies A(T) correction"
                         " (model-prescribed, Bowen-Welfoot formulation --"
                         " not a case-selectable gamma model)\n";
    }

    // ---- Decompose each salt solute into its ions --------------------------
    std::vector<Ion> ions;
    for (std::size_t s = 0; s < Ns; ++s)
    {
        const auto& comp = thermo.comp(soluteIdx[s]);
        if (!comp.hasElectrolyteSpec())
            throw std::runtime_error("transport DSPM-DE: solute '" + comp.name()
                + "' has no electrolyte{ cation; anion; } block -- DSPM-DE works "
                  "ion-by-ion and needs the salt's ion decomposition.  Add the "
                  "block to its component .dat, or use a salt that carries one "
                  "(NaCl, CaCl2, MgSO4).");
        // Declared FK from the component record (derived from dissociatesTo)
        // -- typed at the point of read, per the loader contract.
        const SpeciesId cat{comp.electrolyteCation()};
        const SpeciesId an {comp.electrolyteAnion()};
        const int zc = electrolyte::ionCharge(cat);     // > 0
        const int za = electrolyte::ionCharge(an);      // < 0
        // electroneutral stoichiometry M_{nu_c} X_{nu_a}: nu_c*zc = nu_a*|za|.
        const int g = std::gcd(zc, -za);
        const int nu_c = (-za) / g;
        const int nu_a =  zc   / g;

        // Wall (feed-side) salt molarity from the film model (closed form, the
        // SolutionDiffusion polarisation -- evaluated at the no-osmotic J_w as a
        // first pass; refined in the J_w loop below).
        const scalar c_salt_bulk = c_b[s] * 1.0e3;      // kmol/m^3 -> mol/m^3

        Ion ic; ic.name = cat; ic.z = zc; ic.salt = s; ic.stoich = nu_c;
        ic.r = electrolyte::ionRadius(cat); ic.D = electrolyte::ionD0(cat);
        ic.c_bulk = nu_c * c_salt_bulk;
        Ion ia; ia.name = an;  ia.z = za; ia.salt = s; ia.stoich = nu_a;
        ia.r = electrolyte::ionRadius(an);  ia.D = electrolyte::ionD0(an);
        ia.c_bulk = nu_a * c_salt_bulk;
        ions.push_back(ic); ions.push_back(ia);
    }
    const std::size_t Ni = ions.size();

    // Dechadilok-Deen hindrance + Born (in kT units) per ion -- geometry is
    // J_w independent.
    const scalar kT = constant::kB * T;
    for (auto& io : ions)
    {
        io.lambda = io.r / r_p;
        const HindranceFactors h = dechadilokDeenFactors(io.lambda);
        io.Kd = h.Kd; io.Kc = h.Kc; io.Phi = h.Phi;
        io.dWkT = bornOn ? bornEnergy(io.z, io.r, eps_p, eps_b) / kT : 0.0;
    }

    // ---- Davies A(T) and a wall ionic strength (frozen per station) --------
    const scalar A_davies = electrolyte::SpeciationSolver::daviesA(T);

    // ===================================================================
    //  Inner pore solve at a GIVEN water flux J_v (peclet enters via J_v).
    //
    //  The closed form (declared; under the solved pore, its seed):
    //    * feed-face Donnan + Born + steric partition (2) links c_in,i to the
    //      wall ion conc through a single feed Donnan potential dphi_f;
    //    * pore electroneutrality (4) AT THE INLET ONLY fixes dphi_f;
    //    * each ion is carried across ALONE by the closed-form transmission
    //      below -- not an integral of (1) under (4)-(5), which are not
    //      imposed inside the pore (DSPM_DE.H, "TWO WAYS ACROSS THE PORE");
    //    * the permeate-face partition and permeate electroneutrality tie
    //      c_perm,i to the bulk permeate.
    //  The solved pore (poreSolver finiteDifference) replaces the middle two
    //  steps by PoreNernstPlanck's solve of (1)-(5), seeded from this
    //  closed form's permeate.
    // ===================================================================

    // Wall ion conc with the polarisation at the current J_v: the shared
    // Polarisation kernel (ONE home for the wall) on THIS law's ion list --
    // each ion with its own charge and free-solution D0 (already resolved
    // above for the hindrance factors), k_c,i priced per ion on that D when
    // the unit declares a correlation, and the solution-diffusion permeate
    // closure with the parent salt's B_s (the same closure the
    // solutionDiffusion seed uses, so the wall buildup matches it at the
    // same J_v).  Under the default policy this is byte-for-byte the old
    // per-ion closed form E c_b / (1 + B (E - 1) / phi); under
    // `ionCoupling electroneutral;` the ions share one interface field.
    scalar lastXi = 0.0; bool lastCoupled = false;
    std::vector<scalar> ionD(Ni), ionB(Ni), ionCb(Ni);
    std::vector<int>    ionZ(Ni);
    std::vector<std::string> ionName(Ni);
    for (std::size_t i = 0; i < Ni; ++i)
    {
        ionD[i]    = ions[i].D;
        ionB[i]    = B_s[ions[i].salt];
        ionCb[i]   = ions[i].c_bulk;
        ionZ[i]    = ions[i].z;
        ionName[i] = ions[i].name.key;
    }
    // The SOLUTION-side activity coefficient at the feed face, per declared
    // treatment (DSPM_DE.H): wallDavies, Davies with SpeciationSolver's A on
    // the BULK ionic strength (the default, unchanged); ideal, 1;
    // bulkOverPoreDavies, Davies with A(eps_b) on the WALL solution's ionic
    // strength -- the pore-side gamma it is divided by is applied where the
    // pore is solved, because it needs the pore's own first node.
    const scalar A_bulkEps = daviesAofEps(eps_b, T);
    const scalar A_poreEps = daviesAofEps(eps_p, T);
    auto ionicStrength_molL = [&](const std::vector<scalar>& c)
    {
        scalar I = 0.0;
        for (std::size_t i = 0; i < c.size(); ++i)
            I += 0.5 * c[i] * scalar(ions[i].z) * scalar(ions[i].z);
        return I / 1000.0;
    };
    auto faceGammas = [&](const std::vector<scalar>& cwall, std::vector<scalar>& g)
    {
        if (activity_ == Activity::Ideal)
        { for (std::size_t i = 0; i < Ni; ++i) g[i] = 1.0; return; }
        if (activity_ == Activity::BulkOverPoreDavies)
        {
            const scalar I = ionicStrength_molL(cwall);
            for (std::size_t i = 0; i < Ni; ++i)
                g[i] = daviesGammaConc(ions[i].z, I, A_bulkEps);
            return;
        }
        std::vector<scalar> cb(Ni);
        for (std::size_t i = 0; i < Ni; ++i) cb[i] = ions[i].c_bulk;
        const scalar I = ionicStrength_molL(cb);
        for (std::size_t i = 0; i < Ni; ++i)
            g[i] = daviesGammaConc(ions[i].z, I, A_davies);
    };

    auto wallIons = [&](scalar Jv, std::vector<scalar>& cwall,
                        std::vector<scalar>& gwall, scalar& Iwall)
    {
        std::vector<scalar> kIon(Ni);
        for (std::size_t i = 0; i < Ni; ++i) kIon[i] = polar.kFilmForD(hyd, ionD[i]);
        std::vector<scalar> cpClosure;
        const WallSolution w = wallWithSolutionDiffusion(
            polar.policy(), Jv, kIon, ionD, ionZ, ionCb, ionB, T, ionName, cpClosure);
        requireOk(w, "transport DSPM-DE");
        // First pass: ionic strength from bulk to get gammas, then polarise.
        Iwall = 0.0;
        for (std::size_t i = 0; i < Ni; ++i)
            Iwall += 0.5 * ions[i].c_bulk * scalar(ions[i].z) * scalar(ions[i].z);
        const scalar Iwall_molL = Iwall / 1000.0;
        for (std::size_t i = 0; i < Ni; ++i)
        {
            cwall[i] = w.c_m[i];
            gwall[i] = daviesGammaConc(ions[i].z, Iwall_molL, A_davies);
        }
        if (activity_ != Activity::WallDavies) faceGammas(cwall, gwall);
        lastXi = w.coupled ? w.xi : 0.0;
        lastCoupled = w.coupled;
    };

    // The wall closed with a GIVEN permeate (wallClosure porePermeate): the
    // same kernel, Eqs. (2)-(8) of Geraldes & Afonso 2007, handed the solved
    // pore's permeate instead of the solution-diffusion closure.
    //  Returns the kernel's answer WITHOUT refusing: the outer passes may
    //  ask about a trial permeate and back away from it (the kernel's own
    //  contract); the ACCEPTED wall is checked where it is accepted.
    auto wallFromPermeate = [&](scalar Jv, const std::vector<scalar>& cperm,
                                std::vector<scalar>& cwall,
                                std::vector<scalar>& gwall) -> WallSolution
    {
        std::vector<scalar> kIon(Ni);
        for (std::size_t i = 0; i < Ni; ++i) kIon[i] = polar.kFilmForD(hyd, ionD[i]);
        WallSolution w = wallConcentrations(
            polar.policy(), Jv, kIon, ionD, ionZ, ionCb, cperm, T, ionName);
        if (!w.ok) return w;
        for (std::size_t i = 0; i < Ni; ++i) cwall[i] = w.c_m[i];
        faceGammas(cwall, gwall);
        lastXi = w.coupled ? w.xi : 0.0;
        lastCoupled = w.coupled;
        return w;
    };

    // Solve the feed-face Donnan potential dphi (in RT/F units, "psi") so that
    // pore electroneutrality (4) holds:  sum z_i c_in,i + X_d = 0,
    //   c_in,i = Phi_i * exp(-dW_i/kT) * exp(-z_i psi) * gamma_i * c_wall,i
    // Monotone in psi -> robust bisection (NEVER the K=1 trivial branch).
    auto solveDonnan = [&](const std::vector<scalar>& cwall,
                           const std::vector<scalar>& gwall,
                           scalar Xfix) -> scalar
    {
        if (!donnanOn && std::abs(Xfix) < 1e-30)
            return 0.0;   // steric/Born only: no Donnan potential
        auto neutral = [&](scalar psi)
        {
            scalar sum = Xfix;
            for (std::size_t i = 0; i < Ni; ++i)
            {
                const scalar part = ions[i].Phi * std::exp(-ions[i].dWkT)
                                  * std::exp(-scalar(ions[i].z) * psi);
                sum += scalar(ions[i].z) * part * gwall[i] * cwall[i];
            }
            return sum;
        };
        scalar lo = -50.0, hi = 50.0;
        scalar flo = neutral(lo), fhi = neutral(hi);
        if (flo * fhi > 0.0) return 0.0;       // no sign change (degenerate)
        for (int it = 0; it < 200; ++it)
        {
            const scalar mid = 0.5 * (lo + hi);
            const scalar fm = neutral(mid);
            if (std::abs(fm) < 1e-14) return mid;
            if (flo * fm <= 0.0) { hi = mid; fhi = fm; }
            else                 { lo = mid; flo = fm; }
        }
        return 0.5 * (lo + hi);
    };

    // The pore SOLVED (poreSolver finiteDifference): the account of every
    // solve at this station, and the last solution, which warm-starts the
    // next water-flux pass (same station, same ions, J_v moved a little).
    PoreAccount         poreAcc;
    pore::PoreSolution  poreWarm;
    //  `wallClosure porePermeate`: the permeate the wall and the pore last
    //  converged on at THIS station, which warm-starts the wall Newton at
    //  the next water-flux pass (J_v moves a little between passes).
    std::vector<scalar> permWarm;
    bool                haveWarm = false;
    std::vector<scalar> lastWall(Ni, 0.0);   // the wall the last pore pass used

    // Given J_v, compute the per-ion permeate concentration and the per-salt
    // wall/permeate concentrations.  Returns the osmotic-pressure difference
    // (van't Hoff over the ions) so the outer J_v loop can close.
    auto poreSolve = [&](scalar Jv,
                         std::vector<scalar>& c_in,       // pore inlet [mol/m^3]
                         std::vector<scalar>& c_perm_ion, // permeate ion [mol/m^3]
                         scalar& dpi)
    {
        std::vector<scalar> cwall(Ni), gwall(Ni); scalar Iwall = 0.0;
        wallIons(Jv, cwall, gwall, Iwall);

        // Feed-face Donnan + partition -> pore inlet concentrations.
        const scalar psi_f = solveDonnan(cwall, gwall, X_d);
        for (std::size_t i = 0; i < Ni; ++i)
            c_in[i] = ions[i].Phi * std::exp(-ions[i].dWkT)
                    * std::exp(-scalar(ions[i].z) * psi_f) * gwall[i] * cwall[i];

        // ---- Across-pore extended Nernst-Planck, closed on the permeate ----
        //
        //  THE KEY CLOSURE (cited to Bowen-Welfoot 2002; the citation is not
        //  verified against the paper's text).  At steady state each ion's
        //  pore flux is carried OUT by convection into the permeate:
        //        j_i = J_v * c_perm,i                                       (*)
        //  Between the feed-face pore concentration c_in,i and the
        //  permeate-face pore concentration c_outpore,i = part_perm,i *
        //  c_perm,i the closed form takes the per-ion relation below.  It is NOT
        //  the integral of (1): with no potential and R = 1 the integral is
        //  c_p/c_w = Phi Kc/(1 - (1 - Phi Kc) e^{-Pe}), and this relation does
        //  not reduce to it (a point solute, Phi = Kc = 1, is rejected up to
        //  50 % here and not at all by (1)) -- see DSPM_DE.H:
        //
        //     c_perm,i / c_in,i  =  Kc_i / ( Kc_i + (1 - Kc_i e^{-Pe_i}) R_i )
        //
        //  the classic convective-diffusive pore transmission with
        //        Pe_i = Kc_i J_v / (Kd_i D_i (A_k/dx))                (dimensionless)
        //  and R_i = part_feed,i / part_perm,i the ratio of the two interfacial
        //  partition coefficients (the Donnan/Born asymmetry between the faces).
        //  We solve the coupled set {c_perm,i} + permeate electroneutrality
        //  (sum z_i c_perm,i = 0, fixing the permeate Donnan potential psi_p) by
        //  a damped fixed point on psi_p -- seeded from psi_p = 0 (the steric
        //  branch), which keeps Newton off the trivial Donnan = 0 saddle.
        const scalar AkdX = mem->porosityOverThickness();
        std::vector<scalar> Pe(Ni), part_feed(Ni);
        for (std::size_t i = 0; i < Ni; ++i)
        {
            const scalar Deff = std::max(ions[i].Kd * ions[i].D * AkdX, 1e-30);
            Pe[i] = std::min(std::max(ions[i].Kc * Jv / Deff, 1e-10), 60.0);
            part_feed[i] = ions[i].Phi * std::exp(-ions[i].dWkT);  // steric*Born
        }

        // Fixed point on the permeate Donnan potential psi_p (RT/F units).  For a
        // GIVEN psi_p, each ion's permeate-face partition is
        //   part_perm,i = Phi_i e^{-dW_i/kT} e^{+z_i psi_p}
        // and the transmission gives c_perm,i directly; psi_p is then updated to
        // restore permeate electroneutrality.  Monotone -> robust bisection.
        auto permAt = [&](scalar psi_p, std::vector<scalar>& cperm) -> scalar
        {
            scalar charge = 0.0;
            for (std::size_t i = 0; i < Ni; ++i)
            {
                const scalar part_perm = ions[i].Phi * std::exp(-ions[i].dWkT)
                                       * std::exp(scalar(ions[i].z) * psi_p);
                const scalar Ri = part_feed[i] / std::max(part_perm, 1e-300);
                const scalar Kc = ions[i].Kc;
                const scalar denom = Kc + (1.0 - Kc * std::exp(-Pe[i])) * Ri;
                const scalar trans = Kc / std::max(denom, 1e-300);
                cperm[i] = c_in[i] * trans / std::max(part_feed[i], 1e-300)
                         * part_perm;                 // back to BULK permeate conc
                charge += scalar(ions[i].z) * cperm[i];
            }
            return charge;
        };

        std::vector<scalar> cp(Ni, 0.0);
        if (donnanOn)
        {
            scalar lo = -50.0, hi = 50.0;
            scalar flo = permAt(lo, cp), fhi = permAt(hi, cp);
            if (flo * fhi <= 0.0)
                for (int it = 0; it < 200; ++it)
                {
                    const scalar mid = 0.5 * (lo + hi);
                    const scalar fm = permAt(mid, cp);
                    if (std::abs(fm) < 1e-16) break;
                    if (flo * fm <= 0.0) { hi = mid; fhi = fm; }
                    else                 { lo = mid; flo = fm; }
                }
            permAt(0.5 * (lo + hi), cp);
        }
        else
        {
            permAt(0.0, cp);          // steric/Born only: no permeate Donnan
        }
        for (std::size_t i = 0; i < Ni; ++i) c_perm_ion[i] = std::max(cp[i], 0.0);

        // ---- The pore SOLVED, when declared (poreSolver finiteDifference) --
        //  Everything above stays: the wall, the feed-face partition and the
        //  closed form, whose permeate SEEDS the solve.  The pore solver is
        //  handed each present ion's conductance, convective hindrance and
        //  the two partition coefficients computed HERE (one home), and
        //  returns the permeate that (1)-(5) give.  An ion with no feed
        //  concentration is not a term and is left out of the pore.
        //
        //  THE OUTER PASSES (C138 slice 2).  Two declared choices make a
        //  partition coefficient depend on the pore's own answer: `activity
        //  bulkOverPoreDavies` (the pore-side gammas are read at the pore's
        //  end nodes and the permeate-side bulk gamma on the permeate) and
        //  `wallClosure porePermeate` (the wall is closed with the pore's
        //  permeate).  They are converged by a fixed point around the pore
        //  solve -- each pass a full Newton of the pore, warm-started from
        //  the last -- until no partition coefficient moves by more than
        //  1e-13 relative.  Neither declared: one pass, exactly as before.
        std::vector<scalar> gPore0(Ni, 1.0), gPoreN(Ni, 1.0), gPerm(Ni, 1.0);

        //  ONE PORE at the current wall (cwall, gwall): the activity passes
        //  run inside it, so the pore and its own end-node gammas agree on
        //  return.  `trial` marks an evaluation made for the wall Newton
        //  below: there a pore that does not converge is an INFEASIBLE TRIAL
        //  for that Newton to back away from, never a refusal.
        auto poreAtWall = [&](bool trial)
        {
            for (int pass = 0; ; ++pass)
            {
                pore::PoreProblem pb;
                pb.Xd = X_d;
                pb.Jv = Jv;
                pore::PoreSeed seed;
                std::vector<std::size_t> present;
                for (std::size_t i = 0; i < Ni; ++i)
                {
                    const scalar feedSide = part_feed[i] * gwall[i] * cwall[i] / gPore0[i];
                    if (!(feedSide > 0.0)) continue;
                    pore::PoreIon pi;
                    pi.z        = ions[i].z;
                    pi.P        = ions[i].Kd * ions[i].D * AkdX;
                    pi.Kc       = ions[i].Kc;
                    pi.feedSide = feedSide;
                    pi.permSide = part_feed[i] * gPerm[i] / gPoreN[i];
                    pb.ions.push_back(pi);
                    present.push_back(i);
                    seed.cPerm.push_back(cp[i]);
                }
                pore::PoreSettings settings;
                settings.intervals = poreNodes_ - 1;
                //  The structure audit builds the DENSE Jacobian once: n^2
                //  doubles.  Measured (C138 slice 2): 3201 nodes of a
                //  four-ion pore are 32010 unknowns, an 8.2 GB audit.  Above
                //  auditMaxUnknowns the audit is SKIPPED and the banner says
                //  so with the size it would have cost; the block structure
                //  is the same code at every grid, audited at the smaller.
                constexpr std::size_t auditMaxUnknowns = 4096;   // 134 MB dense
                const std::size_t nUnknowns =
                    (2 * pb.ions.size() + 2) * (settings.intervals + 1);
                settings.audit = !poreBanner_ && nUnknowns <= auditMaxUnknowns;
                //  The seed, in order of preference: this station's previous
                //  water-flux pass; the previous STATION's converged pore (the
                //  channel moves a little between stations); the closed form
                //  (the first station of a run).  Measured on membrane10's
                //  MgSO4 module: the closed-form seed alone sent the Newton to
                //  continuation at every one of its 51 stations.
                const std::size_t nx = nUnknowns;
                pore::PoreSolution sol =
                      (haveWarm && poreWarm.x.size() == nx)
                    ? pore::solve(pb, settings, poreWarm)
                    : (haveLastPore_ && lastPore_.x.size() == nx)
                    ? pore::solve(pb, settings, lastPore_)
                    : pore::solve(pb, settings, seed);
                if (!sol.converged)
                {
                    std::ostringstream m;
                    m << "transport DSPM-DE: the finite-difference pore solve did"
                         " NOT converge at J_v = " << Jv << " m/s, X_d = " << X_d
                      << " mol/m3 on " << poreNodes_ << " nodes (||F|| = "
                      << sol.residual << "): " << sol.stopReason << ".  Refusing"
                         " rather than publishing a pore that does not satisfy its"
                         " equations.";
                    if (trial) throw InfeasibleTrial(m.str());
                    throw std::runtime_error(m.str());
                }
                if (!poreBanner_)
                {
                    poreBanner_ = true;
                    std::ostringstream b;
                    b << std::setprecision(3)
                      << "  [DSPM-DE] pore SOLVED (poreSolver finiteDifference"
                      << (methodDefaulted_ ? ", the default" : "") << "): the"
                         " extended Nernst-Planck equations on " << poreNodes_
                      << " nodes across the pore" << (nodesDefaulted_
                          ? " (stated default; declare `nodes`)" : "")
                      << ", Scharfetter-Gummel fluxes, electroneutrality at every"
                         " node and zero current; every node solved at once by"
                         " Newton on the declared block-tridiagonal structure ("
                      << poreNodes_ << " blocks of " << 2 * pb.ions.size() + 2
                      << ") -- the method of NanoFiltran (Geraldes & Alves,"
                         " J. Membr. Sci. 321 (2008) 172-182); seeded from the"
                         " closed form at the first station, from the previous"
                         " station's pore after it\n"
                      << "  [DSPM-DE] first pore solve: " << sol.iterations
                      << " Newton iterations, ||F|| = " << sol.residual;
                    if (sol.offBandMax >= 0.0)
                        b << ", block-tridiagonal structure VERIFIED (max |J| off"
                             " the bands = " << sol.offBandMax << ")";
                    else if (nUnknowns > auditMaxUnknowns)
                        b << ", structure audit SKIPPED (" << nUnknowns
                          << " unknowns: a dense audit Jacobian of "
                          << double(nUnknowns) * double(nUnknowns) * 8.0 / 1.0e9
                          << " GB; audited only up to " << auditMaxUnknowns << ")";
                    b << ", stiffness (migration / net flux) = "
                      << sol.stiffnessRatio << "\n";
                    std::cout << b.str();
                }
                if (sol.continuationSteps > 0 && !continuationSaid_)
                {
                    continuationSaid_ = true;
                    const std::string msg = "the pore Newton from its seed stopped ("
                        + sol.directFailure + "); the pore was solved by"
                        " continuation in J_v from the exact J_v = 0 state ("
                        + std::to_string(sol.continuationSteps) + " solves).  Every"
                        " continuation is counted in the module's pore summary.";
                    if (AdvisoryLog::instance().add("solver", "info", "DSPM-DE pore", msg))
                        std::cout << "  [DSPM-DE] " << msg << "\n";
                }
                for (std::size_t i = 0; i < Ni; ++i) c_perm_ion[i] = 0.0;
                for (std::size_t m = 0; m < present.size(); ++m)
                    c_perm_ion[present[m]] = sol.cPerm[m];

                PoreAccount a;
                a.nodes             = int(poreNodes_);
                a.solves            = 1;
                a.newtonMax         = sol.iterations;
                a.continuations     = sol.continuationSteps > 0 ? 1 : 0;
                a.residualMax       = sol.residual;
                a.fluxConstancyMax  = sol.fluxConstancyMax;
                a.fluxRelativeMax   = sol.fluxRelativeMax;
                a.stiffnessMax      = sol.stiffnessRatio;
                a.currentMax        = sol.currentMax;
                a.electroneutralMax = sol.electroneutralMax;
                poreAcc.merge(a);

                //  `activity bulkOverPoreDavies`: the gammas this pore's
                //  partitions used against the ones its answer gives; stop
                //  when no gamma moves by more than 1e-13 relative.
                bool moved = false;
                if (activity_ == Activity::BulkOverPoreDavies)
                {
                    auto relMove = [](scalar a0, scalar a1)
                    { return std::abs(a1 - a0) > 1e-13 * std::max(std::abs(a0), 1e-300); };
                    const std::size_t N = sol.c.size() - 1;
                    scalar I0 = 0.0, IN = 0.0;
                    for (std::size_t m = 0; m < present.size(); ++m)
                    {
                        const scalar z2 = scalar(ions[present[m]].z * ions[present[m]].z);
                        I0 += 0.5 * z2 * sol.c[0][m];
                        IN += 0.5 * z2 * sol.c[N][m];
                    }
                    const scalar Ip = ionicStrength_molL(c_perm_ion);
                    for (std::size_t i = 0; i < Ni; ++i)
                    {
                        const scalar g0 = daviesGammaConc(ions[i].z, I0 / 1000.0, A_poreEps);
                        const scalar gN = daviesGammaConc(ions[i].z, IN / 1000.0, A_poreEps);
                        const scalar gp = daviesGammaConc(ions[i].z, Ip, A_bulkEps);
                        if (relMove(gPore0[i], g0) || relMove(gPoreN[i], gN)
                            || relMove(gPerm[i], gp)) moved = true;
                        gPore0[i] = g0; gPoreN[i] = gN; gPerm[i] = gp;
                    }
                }
                poreWarm = std::move(sol);
                haveWarm = true;
                if (!moved)
                {
                    outerPassesMax_ = std::max(outerPassesMax_, pass + 1);
                    return;
                }
                if (pass >= 400)
                {
                    std::ostringstream m;
                    m << "transport DSPM-DE: the pore and its own end-node activity"
                         " coefficients (`activity bulkOverPoreDavies`) did NOT"
                         " settle in 400 passes at J_v = " << Jv << " m/s.  Refusing"
                         " rather than publishing a pore whose partitions are not"
                         " its own.";
                    if (trial) throw InfeasibleTrial(m.str());
                    throw std::runtime_error(m.str());
                }
            }
        };

        //  `wallClosure porePermeate`: the wall and the pore SOLVED TOGETHER.
        //  The unknowns are the logarithms of the permeate the wall is closed
        //  with; the residual is the pore's own permeate at that wall against
        //  it, ln c_p,pore - ln c_p,used.  Newton (solver::newtonND, dense --
        //  one unknown per ion) with a finite-difference Jacobian, each
        //  evaluation one pore warm-started from the last.  A plain fixed
        //  point (close the wall with the pore's permeate, re-solve, repeat)
        //  was built first and MEASURED to fail on this slice's polarised
        //  mixture: 400 passes without settling.  A trial whose wall the
        //  interface balance does not admit, or whose pore does not converge,
        //  is an InfeasibleTrial the Newton's line search backs away from.
        if (finiteDifference_ && wallClosure_ == WallClosure::PorePermeate)
        {
            //  The unknowns are the ions the FEED carries.  An ion with no
            //  bulk concentration (a salt component of the flowsheet that
            //  this unit is not fed) is not a term -- the pore leaves it out
            //  too -- and its permeate stays exactly zero; making ln c_p of
            //  it an unknown put -inf in the residual at its first
            //  evaluation (MEASURED, C141: membrane10, whose three units
            //  share three salt components).
            std::vector<std::size_t> act;
            for (std::size_t i = 0; i < Ni; ++i)
                if (ions[i].c_bulk > 0.0) act.push_back(i);
            const std::size_t Na = act.size();
            //  A trial wall is admissible only if the interface balance
            //  admits it AND every fed ion stands above zero there: the
            //  uncoupled film computes a wall below zero rather than hide it
            //  (Polarisation.cpp), and such a wall is a trial to back away
            //  from, never a pore to solve (the pore would refuse it as a
            //  one-sign pore -- MEASURED, C141: membrane11).
            auto admissible = [&](const WallSolution& w,
                                  const std::vector<scalar>& cw)
            {
                if (!w.ok) return false;
                for (std::size_t m = 0; m < Na; ++m)
                    if (!(cw[act[m]] > 0.0)) return false;
                return true;
            };
            //  The starting permeate, in order of preference: the one the
            //  wall and the pore converged on at this station's previous
            //  water-flux pass; the previous STATION's; and, at the first
            //  station of a run, the pore's at the B_s closure's wall --
            //  each scaled by the largest theta = 1, 1/2, ... whose wall is
            //  admissible (theta -> 0 always is: a permeate-free wall needs
            //  no field), so the Newton starts from an evaluable point.
            //  MEASURED (C141), the warm starts are what makes this the
            //  default: started from the B_s closure at every pass,
            //  membrane10 took 113 s.
            std::vector<scalar> u0(Na), cStart(Ni, 0.0), cwS(Ni), gwS(Ni);
            std::vector<scalar> base;
            if (permWarm.size() == Ni)                     base = permWarm;
            else if (lastPermeate_.size() == Ni)           base = lastPermeate_;
            for (std::size_t m = 0; m < Na && !base.empty(); ++m)
                if (!(base[act[m]] > 0.0)) base.clear();
            if (base.empty())
            {
                poreAtWall(false);                 // at the B_s closure's wall
                base = c_perm_ion;
            }
            for (scalar theta = 1.0; ; theta *= 0.5)
            {
                for (std::size_t m = 0; m < Na; ++m)
                    cStart[act[m]] = theta * std::max(base[act[m]], 1e-300);
                if (admissible(wallFromPermeate(Jv, cStart, cwS, gwS), cwS)
                    || theta < 1e-12) break;
            }
            for (std::size_t m = 0; m < Na; ++m) u0[m] = std::log(cStart[act[m]]);
            auto F = [&](const sVector& u) -> sVector
            {
                std::vector<scalar> cpTrial(Ni, 0.0), cw(Ni), gw(Ni);
                for (std::size_t m = 0; m < Na; ++m) cpTrial[act[m]] = std::exp(u[m]);
                const WallSolution w = wallFromPermeate(Jv, cpTrial, cw, gw);
                if (!w.ok) throw InfeasibleTrial("DSPM-DE wall: " + w.reason);
                if (!admissible(w, cw))
                    throw InfeasibleTrial("DSPM-DE wall: a fed ion's wall"
                                          " concentration is not positive");
                cwall = cw; gwall = gw;
                poreAtWall(true);
                sVector r(Na);
                for (std::size_t m = 0; m < Na; ++m)
                {
                    if (!(c_perm_ion[act[m]] > 0.0))
                        throw InfeasibleTrial("DSPM-DE wall: a permeate concentration"
                                              " reached zero");
                    r[m] = std::log(c_perm_ion[act[m]]) - u[m];
                }
                return r;
            };
            solver::NDOptions o;
            o.tolerance = 1.0e-12;
            o.maxIter   = 60;
            o.fdStep    = 1.0e-7;
            const solver::NDResult nr = solver::newtonND(F, u0, o);
            if (!nr.converged)
            {
                std::ostringstream m;
                m << "transport DSPM-DE (wallClosure porePermeate): the wall and"
                     " the pore did NOT converge together at J_v = " << Jv
                  << " m/s (||ln c_p,pore - ln c_p,wall|| = " << nr.residual
                  << " after " << nr.iterations << " Newton iterations"
                  << (nr.stopReason.empty() ? "" : "; " + nr.stopReason)
                  << ").  Refusing rather than publishing a wall closed with a"
                     " permeate the pore does not give.";
                throw std::runtime_error(m.str());
            }
            const sVector rFinal = F(nr.x);        // leave the state AT the answer
            (void)rFinal;
            permWarm = c_perm_ion;
            outerPassesMax_ = std::max(outerPassesMax_, nr.iterations);
        }
        else if (finiteDifference_)
            poreAtWall(false);
        lastWall = cwall;

        // van't Hoff osmotic difference [Pa] over ALL ions (wall - permeate).
        scalar c_wall_tot = 0.0, c_perm_tot = 0.0;
        for (std::size_t i = 0; i < Ni; ++i)
        { c_wall_tot += cwall[i]; c_perm_tot += c_perm_ion[i]; }
        dpi = constant::R * T * (c_wall_tot - c_perm_tot);   // mol/m^3 * J/mol = Pa
    };

    // ---- Outer J_v loop: J_w = A_w (dP - dpi), damped fixed point ----------
    scalar Jw = A_w * dP;          // SolutionDiffusion seed
    std::vector<scalar> c_in(Ni, 0.0), c_perm_ion(Ni, 0.0);
    scalar dpi = 0.0;
    if (imposed) Jw = ctx.imposedJv;          // the caller's J_v: no closure
    //  The closed form keeps the damped fixed point it was recorded on.  The
    //  SOLVED pore takes a safeguarded SECANT on the same equation, h(J) =
    //  J - A_w (dP - dpi(J)) = 0: the damped fixed point contracts by about
    //  one half per pass, so it needs ~40 passes to 1e-12, and under the
    //  solved pore each pass is a full wall-and-pore Newton (MEASURED, C141:
    //  membrane10 40 s on the fixed point).  h rises monotonically from
    //  -A_w dP at J = 0 (no flux, no polarisation, dpi = 0) to A_w dpi >= 0
    //  at J = A_w dP, so the root is bracketed by (0, A_w dP]; a secant step
    //  that leaves the bracket falls back to the damped step.  Same equation,
    //  same tolerance -- only the path to the root differs.
    scalar Ja = 0.0, ha = 0.0;   bool haveA = false;
    for (int it = 0; it < 80 && !imposed; ++it)
    {
        poreSolve(Jw, c_in, c_perm_ion, dpi);
        const scalar Jw_new = A_w * std::max(dP - dpi, 0.0);
        const scalar relax = 0.5;
        scalar Jw_upd = (1.0 - relax) * Jw + relax * Jw_new;
        if (finiteDifference_)
        {
            const scalar hb = Jw - Jw_new;
            if (haveA && std::abs(hb - ha) > 0.0)
            {
                const scalar Js = Jw - hb * (Jw - Ja) / (hb - ha);
                if (std::isfinite(Js) && Js > 0.0 && Js <= A_w * dP) Jw_upd = Js;
            }
            Ja = Jw; ha = hb; haveA = true;
        }
        if (std::abs(Jw_upd - Jw) < 1e-12 * std::max(Jw, 1e-12)) { Jw = Jw_upd; break; }
        Jw = std::max(Jw_upd, 0.0);
    }
    poreSolve(Jw, c_in, c_perm_ion, dpi);
    out.J_w = std::max(Jw, 0.0);

    // ---- Collapse ions back to per-salt wall / permeate / flux -------------
    // Per salt: wall conc = max over its ions of (ion wall conc / stoich); the
    // measurable salt permeate conc = (ion permeate / stoich) -- electroneutral,
    // so cation and anion give the same salt conc to numerical accuracy; we take
    // the cation leg (stoich-normalised) as the salt representative.
    std::vector<scalar> cwall(Ni), gwall(Ni); scalar Iw = 0.0;
    if (wallClosure_ == WallClosure::PorePermeate)
        cwall = lastWall;                     // the wall the pore converged with
    else
        wallIons(out.J_w, cwall, gwall, Iw);
    for (std::size_t i = 0; i < Ni; ++i)
    {
        TransportSolution::IonState st;
        st.name   = ions[i].name.key;
        st.z      = ions[i].z;
        st.c_bulk = ions[i].c_bulk;
        st.c_wall = cwall[i];
        st.c_perm = c_perm_ion[i];
        out.ions.push_back(st);
    }
    for (std::size_t s = 0; s < Ns; ++s)
    {
        scalar salt_wall = 0.0, salt_perm = 0.0; bool got = false;
        for (std::size_t i = 0; i < Ni; ++i)
            if (ions[i].salt == s && ions[i].z > 0)   // cation leg
            {
                salt_wall = cwall[i] / std::max(ions[i].stoich, 1);
                salt_perm = c_perm_ion[i] / std::max(ions[i].stoich, 1);
                got = true;
            }
        if (!got)   // safety: salt with no cation leg (shouldn't happen)
            for (std::size_t i = 0; i < Ni; ++i)
                if (ions[i].salt == s)
                { salt_wall = cwall[i] / std::max(ions[i].stoich, 1);
                  salt_perm = c_perm_ion[i] / std::max(ions[i].stoich, 1); }
        out.c_m[s] = salt_wall * 1.0e-3;                  // mol/m^3 -> kmol/m^3
        out.c_p[s] = salt_perm * 1.0e-3;
        out.J_s[s] = out.J_w * out.c_p[s];               // kmol/(m^2 s): convective
    }
    if (lastCoupled) { out.xi = lastXi; out.hasXi = true; }
    if (finiteDifference_)
    {
        out.pore = poreAcc; out.hasPore = true;
        if (haveWarm) { lastPore_ = std::move(poreWarm); haveLastPore_ = true; }
        if (permWarm.size() == Ni) lastPermeate_ = permWarm;
    }
    return out;
}

} // namespace membrane
} // namespace Choupo
