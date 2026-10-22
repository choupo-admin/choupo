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
    * The DEFAULT pore (closed form): a bisection on the feed Donnan
      potential (feed-face electroneutrality), a bisection on a permeate
      Donnan potential (permeate electroneutrality) -- both only when the
      membrane declares a charge -- and a closed-form per-ion transmission
      between them.  It does NOT impose (4) or (5) inside the pore (DSPM_DE.H
      says what each path solves; this list used to say "inner unknowns
      solved by NewtonND ... zero net current integrated across the pore",
      which the closed form never did).
    * The SOLVED pore (`poreSolver { method finiteDifference; }`): the ENP
      on n nodes, every node at once by Newton on the declared
      block-tridiagonal structure -- PoreNernstPlanck.{H,cpp}.
    * The water flux: a damped fixed point J_w = A_w (dP - dpi) around
      either pore.
    * The exclusions are switched on by the membrane record and ANNOUNCED;
      there is no seeding chain between them at run time (the closed form
      needs no seed -- its potentials are monotone bisections that cannot
      land on the psi = 0 branch -- and the solved pore starts from local
      Donnan equilibrium at every node).
\*---------------------------------------------------------------------------*/

#include "DSPM_DE.H"
#include "PoreNernstPlanck.H"

#include "core/Advisory.H"
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

// ---- Deen (1987) hindrance factors from lambda = r_ion / r_pore ------------
// Diffusive hindrance K_d and convective hindrance K_c, the centreline-averaged
// forms used in the DSPM-DE literature (Bowen & Welfoot 2002, Eqs. 14-15).
// Valid for 0 <= lambda < 1; clamped at lambda -> 1 (a fully excluded ion).
struct Hindrance { scalar Kd; scalar Kc; scalar Phi; };

Hindrance deenFactors(scalar lambda)
{
    const scalar lam = std::min(std::max(lambda, 0.0), 0.999);
    const scalar Phi = (1.0 - lam) * (1.0 - lam);          // steric partition

    // K_d (diffusive), Bowen & Welfoot 2002 Eq. 14 (polynomial fit to Deen):
    //   K_d = 1 + 9/8 lam ln(lam) - 1.56034 lam + 0.528155 lam^2
    //         + 1.91521 lam^3 - 2.81903 lam^4 + 0.270788 lam^5
    //         + 1.10115 lam^6 - 0.435933 lam^7
    const scalar l = lam;
    const scalar l2 = l*l, l3 = l2*l, l4 = l3*l, l5 = l4*l, l6 = l5*l, l7 = l6*l;
    const scalar lnl = (l > 1e-12) ? std::log(l) : 0.0;
    scalar Kt = 1.0 + 1.125 * l * lnl - 1.56034 * l + 0.528155 * l2
              + 1.91521 * l3 - 2.81903 * l4 + 0.270788 * l5
              + 1.10115 * l6 - 0.435933 * l7;               // K^-1,t (drag)
    // K_d = Phi * K^-1,t / ... -- in the centreline form the partition is carried
    // separately, so the diffusive HINDRANCE coefficient is simply Kt here.
    const scalar Kd = std::max(Kt, 1e-6);

    // K_c (convective lag), Bowen & Welfoot 2002 Eq. 15 -- the centreline
    // (Geraldes-Brites) form with the (2 - Phi) partitioning prefactor:
    //   K_c = (2 - Phi)(1 + 0.054 lam - 0.988 lam^2 + 0.441 lam^3)
    const scalar Kc = (2.0 - Phi) * (1.0 + 0.054 * l - 0.988 * l2 + 0.441 * l3);
    return { Kd, std::max(Kc, 1e-6), Phi };
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
//  `transportParameters { poreSolver { method <word>; nodes <n>; } }`.
//  Absent, the closed form runs and nothing is read -- every DSPM-DE case
//  that predates the block is untouched.  A key this law does not read, a
//  method word it does not know, and a grid it cannot use each REFUSE by
//  name: a declared word the engine dispatches on must not fall through to
//  a default (CLAUDE.md, 2026-09-07).
void DSPM_DE::readParameters(const DictPtr& params)
{
    const std::string ctx = "transport DSPM-DE: transportParameters";
    if (!params) return;
    for (const auto& k : params->keys())
        if (k != "poreSolver")
            throw std::runtime_error(ctx + " declares `" + k + "`, which this"
                " law does not read.  DSPM-DE reads only `poreSolver { method"
                " closedForm | finiteDifference; nodes <n>; }` there.");
    if (!params->found("poreSolver")) return;
    const auto ps = params->subDict("poreSolver");
    for (const auto& k : ps->keys())
        if (k != "method" && k != "nodes")
            throw std::runtime_error(ctx + ".poreSolver declares `" + k
                + "`, which the pore solver does not read (it reads `method`"
                  " and `nodes`).");
    if (!ps->found("method"))
        throw std::runtime_error(ctx + ".poreSolver declares no `method` --"
            " say `closedForm` (the uniform-gradient form, the default when the"
            " block is absent) or `finiteDifference` (the pore solved node by"
            " node)");
    const std::string method = ps->lookupWord("method");
    const std::vector<std::string> accepted = { "closedForm", "finiteDifference" };
    if (std::find(accepted.begin(), accepted.end(), method) == accepted.end())
        throw std::runtime_error(registryRefusal::message(
            "DSPM-DE pore solver method", method, accepted, "Accepted"));
    finiteDifference_ = (method == "finiteDifference");
    if (!finiteDifference_)
    {
        if (ps->found("nodes"))
            throw std::runtime_error(ctx + ".poreSolver declares `nodes` with"
                " `method closedForm;` -- the closed form has no grid, so the"
                " number would be read by nothing.  Drop it, or say"
                " `method finiteDifference;`.");
        return;
    }
    if (ps->found("nodes"))
    {
        const scalar n = ps->lookupScalar("nodes");
        if (!(n >= 3.0) || n != std::floor(n) || n > 100000.0)
            throw std::runtime_error(ctx + ".poreSolver `nodes` must be a whole"
                " number of grid nodes across the pore, faces included, of at"
                " least 3 (it reads " + std::to_string(n) + ")");
        poreNodes_ = static_cast<std::size_t>(n);
    }
    else
    {
        poreNodes_      = 101;     // stated default, announced at the first solve
        nodesDefaulted_ = true;
    }
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
    const scalar eps_b = SolventProperties::epsWater(T);
    const scalar eps_p = mem->hasPoreDielectric() ? mem->poreDielectric() : eps_b;
    const bool   bornOn   = mem->hasPoreDielectric() && eps_p < eps_b;
    const bool   donnanOn = mem->hasChargeDensity() && std::abs(X_d) > 1e-30;

    TransportSolution out;
    out.c_m.assign(Ns, 0.0);
    out.c_p.assign(Ns, 0.0);
    out.J_s.assign(Ns, 0.0);
    out.J_w = 0.0;
    if (dP <= 0.0) return out;

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
                  << "\n"
                  // The activity treatment is MODEL-PRESCRIBED, not a case
                  // choice: Bowen-Welfoot partitioning is formulated on a
                  // Davies-type correction, so swapping the gamma model would
                  // change the published model, not configure it.  Announced
                  // (never silent), and deliberately NOT a dict key -- the
                  // `aqueous {}` case declaration governs units that ASK for
                  // activities; this model IS its activity treatment.
                  << "  [DSPM-DE] activity: Davies A(T) correction"
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

    // Deen hindrance + Born (in kT units) per ion -- geometry is J_w independent.
    const scalar kT = constant::kB * T;
    for (auto& io : ions)
    {
        io.lambda = io.r / r_p;
        const Hindrance h = deenFactors(io.lambda);
        io.Kd = h.Kd; io.Kc = h.Kc; io.Phi = h.Phi;
        io.dWkT = bornOn ? bornEnergy(io.z, io.r, eps_p, eps_b) / kT : 0.0;
    }

    // ---- Davies A(T) and a wall ionic strength (frozen per station) --------
    const scalar A_davies = electrolyte::SpeciationSolver::daviesA(T);

    // ===================================================================
    //  Inner pore solve at a GIVEN water flux J_v (peclet enters via J_v).
    //
    //  The closed form (the default):
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
        lastXi = w.coupled ? w.xi : 0.0;
        lastCoupled = w.coupled;
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
    bool                haveWarm = false;

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
        //  c_perm,i the default takes the per-ion relation below.  It is NOT
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
        if (finiteDifference_)
        {
            pore::PoreProblem pb;
            pb.Xd = X_d;
            pb.Jv = Jv;
            pore::PoreSeed seed;
            std::vector<std::size_t> present;
            for (std::size_t i = 0; i < Ni; ++i)
            {
                const scalar feedSide = part_feed[i] * gwall[i] * cwall[i];
                if (!(feedSide > 0.0)) continue;
                pore::PoreIon pi;
                pi.z        = ions[i].z;
                pi.P        = ions[i].Kd * ions[i].D * AkdX;
                pi.Kc       = ions[i].Kc;
                pi.feedSide = feedSide;
                pi.permSide = part_feed[i];
                pb.ions.push_back(pi);
                present.push_back(i);
                seed.cPerm.push_back(cp[i]);
            }
            pore::PoreSettings settings;
            settings.intervals = poreNodes_ - 1;
            settings.audit     = !poreBanner_;
            //  The seed, in order of preference: this station's previous
            //  water-flux pass; the previous STATION's converged pore (the
            //  channel moves a little between stations); the closed form
            //  (the first station of a run).  Measured on membrane10's
            //  MgSO4 module: the closed-form seed alone sent the Newton to
            //  continuation at every one of its 51 stations.
            const std::size_t nx = (2 * pb.ions.size() + 2) * (settings.intervals + 1);
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
                throw std::runtime_error(m.str());
            }
            if (!poreBanner_)
            {
                poreBanner_ = true;
                std::ostringstream b;
                b << std::setprecision(3)
                  << "  [DSPM-DE] pore SOLVED (poreSolver finiteDifference): the"
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
            poreWarm = std::move(sol);
            haveWarm = true;
        }

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
    for (int it = 0; it < 80; ++it)
    {
        poreSolve(Jw, c_in, c_perm_ion, dpi);
        const scalar Jw_new = A_w * std::max(dP - dpi, 0.0);
        const scalar relax = 0.5;
        const scalar Jw_upd = (1.0 - relax) * Jw + relax * Jw_new;
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
    wallIons(out.J_w, cwall, gwall, Iw);
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
    }
    return out;
}

} // namespace membrane
} // namespace Choupo
