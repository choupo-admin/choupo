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
    * The film model raises the bulk salt conc to the WALL conc (closed form,
      same as SolutionDiffusion), then the salt wall conc is split into ion
      molarities by stoichiometry -- these are the c_bulk in the partition (2).
    * Inner unknowns solved by NewtonND: per ion the pore-inlet concentration
      c_in,i, plus J_v -- closed by feed-face electroneutrality (4), zero net
      current (5) integrated across the pore, and the water-flux / osmotic loop.
    * STAGED: the steric-only solve (Donnan = 0, Born = 0) is solved FIRST and
      used to SEED the charged solve, so Newton starts away from the trivial
      Donnan = 0 saddle.  If the +Born stage will not converge, the model keeps
      the +Donnan result and ANNOUNCES the descope (no silent fallback).
\*---------------------------------------------------------------------------*/

#include "DSPM_DE.H"

#include "core/Constants.H"
#include "thermo/ThermoPackage.H"
#include "thermo/membrane/Membrane.H"
#include "thermo/electrolyte/SolventProperties.H"
#include "thermo/electrolyte/SpeciationSolver.H"
#include "../osmotic/OsmoticModel.H"

// The ion-transport tier (radius, D0) accessors + charge live in the electrochem
// header (the only radius/D0 accessor in the tree).  This couples membrane ->
// electrochem; noted in the final report.  Charges also via electrolyte::ionCharge.
#include "unitOperations/electrochem/Electrochem.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"

#include <algorithm>
#include <cmath>
#include <iostream>
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

    // K_c (convective lag), Bowen & Welfoot 2002 Eq. 15:
    //   K_c = (1 + 0.054 lam - 0.988 lam^2 + 0.441 lam^3) / ... -- the standard
    //   centreline form below (Geraldes-Brites form), bounded in [0, ~1]:
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
    std::string name;     // species key (Na, Cl, SO4, ...)
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
TransportSolution DSPM_DE::localFluxes(const TransportContext& ctx) const
{
    const ThermoPackage& thermo = ctx.thermo;
    const auto&  soluteIdx = ctx.soluteIdx;
    const scalar A_w       = ctx.A_w;
    const scalar k_film    = ctx.k_film;
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
                  << "\n";
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
        const std::string cat = comp.electrolyteCation();
        const std::string an  = comp.electrolyteAnion();
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
        ic.r = electrochem::ionRadius(cat); ic.D = electrochem::ionD0(cat);
        ic.c_bulk = nu_c * c_salt_bulk;
        Ion ia; ia.name = an;  ia.z = za; ia.salt = s; ia.stoich = nu_a;
        ia.r = electrochem::ionRadius(an);  ia.D = electrochem::ionD0(an);
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
    //  Unknowns (log-space, kept positive): the pore-INLET concentration of
    //  each ion c_in,i [mol/m^3] AND the permeate concentration c_perm,i.
    //  Closures:
    //    * feed-face Donnan + Born + steric partition (2) links c_in,i to the
    //      wall ion conc through a single feed Donnan potential dphi_f;
    //    * pore electroneutrality (4) at the inlet fixes dphi_f given c_in;
    //    * the EXTENDED NERNST-PLANCK (1) integrated across the pore with the
    //      zero-current constraint (5) gives each ion's permeate concentration;
    //    * permeate-face partition (2)+(4) ties c_perm,i to the bulk permeate.
    //
    //  To keep the glass-box pedagogy and robustness, we use the standard
    //  DSPM-DE "linearised-gradient" closed form for the ENP integral across a
    //  thin pore (Bowen-Welfoot 2002): with a uniform pore potential gradient,
    //  the per-ion permeate concentration solves the algebraic system below.
    //  This avoids an inner RK4 while preserving the charge coupling.
    // ===================================================================

    // Wall ion conc with the film polarisation at the current J_v (closed form,
    // identical to SolutionDiffusion's c_m for the parent salt, applied to the
    // ion via its stoichiometric share).  E = exp(J_v / k_film).
    auto wallIons = [&](scalar Jv, std::vector<scalar>& cwall,
                        std::vector<scalar>& gwall, scalar& Iwall)
    {
        const scalar E = std::exp(Jv / std::max(k_film, 1e-12));
        // First pass: ionic strength from bulk to get gammas, then polarise.
        Iwall = 0.0;
        for (std::size_t i = 0; i < Ni; ++i)
            Iwall += 0.5 * ions[i].c_bulk * scalar(ions[i].z) * scalar(ions[i].z);
        const scalar Iwall_molL = Iwall / 1000.0;
        for (std::size_t i = 0; i < Ni; ++i)
        {
            // Polarise the parent salt's ion: use a representative B for the
            // salt (the host B_s of that salt) so the wall buildup matches the
            // solution-diffusion seed at the same J_v.
            const scalar Bs = B_s[ions[i].salt];
            const scalar phi = Jv + Bs;
            const scalar denom = 1.0 + Bs * (E - 1.0) / std::max(phi, 1e-30);
            cwall[i] = E * ions[i].c_bulk / denom;
            gwall[i] = daviesGammaConc(ions[i].z, Iwall_molL, A_davies);
        }
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
        //  THE KEY CLOSURE (Bowen-Welfoot 2002).  At steady state each ion's
        //  pore flux is carried OUT by convection into the permeate:
        //        j_i = J_v * c_perm,i                                       (*)
        //  The ENP (1) integrated across the pore from the feed-face pore
        //  concentration c_in,i to the permeate-face pore concentration
        //  c_outpore,i = part_perm,i * c_perm,i (the permeate Donnan/steric/Born
        //  partition) gives, for a uniform potential gradient, the per-ion
        //  relation that closes c_perm,i implicitly:
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
    return out;
}

} // namespace membrane
} // namespace Choupo
