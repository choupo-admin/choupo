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

#include "Pipe.H"
#include "core/Constants.H"
#include "unitOperations/flash/IsothermalFlash.H"   // feed-flash for the gas-liquid split

#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

namespace {

// Standard gravitational acceleration [m/s^2] (CODATA / ISO 80000).  Kept
// local to the pipe model; core/Constants.H carries no gravity term and is
// a founder-managed file we deliberately do not touch.
constexpr scalar g_standard = 9.80665;

// Laminar/turbulent regime boundary (classical pipe-flow convention).
constexpr scalar Re_laminar = 2300.0;   // below: surely laminar
constexpr scalar Re_turb    = 4000.0;   // above: surely turbulent

// Darcy friction factor in the LAMINAR regime: f = 64 / Re.  Exact for
// fully-developed laminar pipe flow; the wall roughness plays no role.
scalar f_laminar(scalar Re)
{
    return 64.0 / Re;
}

// --- Haaland (1983) -------------------------------------------------------
//   1/sqrt(f) = -1.8 log10[ (eps/D / 3.7)^1.11 + 6.9/Re ]
//   Explicit, ~2 % of the implicit Colebrook over the turbulent range.
scalar f_haaland(scalar Re, scalar relRough)
{
    const scalar t = std::pow(relRough / 3.7, 1.11) + 6.9 / Re;
    const scalar inv_sqrt = -1.8 * std::log10(t);
    return 1.0 / (inv_sqrt * inv_sqrt);
}

// --- Colebrook-White (implicit) -------------------------------------------
//   1/sqrt(f) = -2 log10[ eps/D / 3.7 + 2.51 / (Re sqrt(f)) ]
//   Solved by fixed-point iteration on x = 1/sqrt(f), seeded with Haaland
//   (so it converges in a handful of steps).  This is the classical
//   turbulent reference the explicit fits approximate.
scalar f_colebrook(scalar Re, scalar relRough)
{
    scalar x = 1.0 / std::sqrt(f_haaland(Re, relRough));   // seed
    for (int it = 0; it < 50; ++it)
    {
        const scalar x_new =
            -2.0 * std::log10(relRough / 3.7 + 2.51 * x / Re);
        if (std::abs(x_new - x) < 1.0e-10)
        {
            x = x_new;
            break;
        }
        x = x_new;
    }
    return 1.0 / (x * x);
}

// --- Churchill (1977) -----------------------------------------------------
//   A single explicit expression valid for ALL Re (laminar, transition,
//   turbulent) and all eps/D:
//      f = 8 [ (8/Re)^12 + 1/(A+B)^1.5 ]^(1/12)
//   with
//      A = { -2.457 ln[ (7/Re)^0.9 + 0.27 eps/D ] }^16
//      B = ( 37530 / Re )^16
//   Returns the Darcy factor directly (no laminar branch needed).
scalar f_churchill(scalar Re, scalar relRough)
{
    const scalar a_inner = std::pow(7.0 / Re, 0.9) + 0.27 * relRough;
    const scalar A = std::pow(-2.457 * std::log(a_inner), 16.0);
    const scalar B = std::pow(37530.0 / Re, 16.0);
    const scalar term = std::pow(8.0 / Re, 12.0)
                      + 1.0 / std::pow(A + B, 1.5);
    return 8.0 * std::pow(term, 1.0 / 12.0);
}

} // anonymous namespace

int Pipe::solve(const DictPtr& dict,
                const ThermoPackage& thermo,
                int verbosity)
{
    auto feedDict = dict->subDict("feed");
    auto operDict = dict->subDict("operation");
    auto compDict = dict->subDict("composition");

    const scalar F   = feedDict->lookupScalar("F", Dims::molarFlow);  // kmol/s
    const scalar T   = feedDict->lookupScalar("T", Dims::temperature);
    const scalar Pin = feedDict->lookupScalar("P", Dims::pressure);

    // ---- Composition (mole fractions, renormalised) ---------------------
    const std::size_t n = thermo.n();
    sVector z(n, 0.0);
    scalar zsum = 0.0;
    for (const auto& key : compDict->keys())
    {
        const std::size_t i = thermo.indexOf(key);
        z[i] = compDict->lookupScalar(key);
        zsum += z[i];
    }
    if (zsum <= 0.0)
        throw std::runtime_error("Pipe: empty / zero composition.");
    for (auto& v : z) v /= zsum;

    // ---- Geometry -------------------------------------------------------
    auto geom = operDict->subDict("geometry");
    const scalar D   = geom->lookupScalar("D",         Dims::length);
    const scalar L   = geom->lookupScalar("L",         Dims::length);
    const scalar eps = geom->lookupScalar("roughness", Dims::length);
    const scalar dz  = geom->lookupScalarOrDefault("dz", 0.0, Dims::length);

    if (D <= 0.0 || L < 0.0 || eps < 0.0)
        throw std::runtime_error(
            "Pipe: geometry requires D > 0, L >= 0, roughness >= 0.");

    // Sum of fitting loss coefficients Σ K (minor losses).  Each entry is a
    // sub-dict { K <coeff>; count <n=1>; }.  Absent block -> Σ K = 0.
    scalar sumK = 0.0;
    if (geom->found("fittings"))
    {
        for (const auto& f : geom->lookupDictList("fittings"))
        {
            const scalar K     = f->lookupScalar("K");
            const scalar count = f->lookupScalarOrDefault("count", 1.0);
            sumK += K * count;
        }
    }

    // =====================================================================
    //  GAS-LIQUID TWO-PHASE FLOW  (Layer 1: homogeneous / Lockhart-Martinelli)
    //
    //  Activates AUTOMATICALLY when the feed flashes two-phase (0 < V/F < 1) at
    //  (T, Pin) -- the inlet vapour fraction the flowsheet resolves.  A single-
    //  phase feed falls through to the liquid path below (unchanged).  The
    //  correlations are general (need rho_L, rho_G, mu_L, mu_G) but were
    //  developed and validated on AIR-WATER / STEAM-WATER -- the solid case.
    // =====================================================================
    {
        FlashInput fin;  fin.F = F;  fin.T = T;  fin.P = Pin;  fin.z = z;
        FlashOptions fo; fo.verbosity = 0;
        const FlashSolution fs = IsothermalFlash::solveCore(fin, thermo, fo);
        const scalar VF = (fs.converged && std::isfinite(fs.V_over_F))
            ? std::min(1.0, std::max(0.0, fs.V_over_F)) : 0.0;

        if (VF > 1.0e-6 && VF < 1.0 - 1.0e-6)
        {
            const DictPtr tpDict = operDict->found("twoPhase")
                ? operDict->subDict("twoPhase") : DictPtr();
            const std::string tpModel = tpDict
                ? tpDict->lookupWordOrDefault("model", "LockhartMartinelli")
                : "LockhartMartinelli";
            const std::string fricModel = dict->lookupWordOrDefault("model",
                operDict->lookupWordOrDefault("model", "Churchill"));
            const scalar relRough2 = eps / D;
            auto fricF = [&](scalar Re) -> scalar {
                if (Re < Re_laminar)          return f_laminar(Re);
                if (fricModel == "Haaland")   return f_haaland(Re, relRough2);
                if (fricModel == "Colebrook") return f_colebrook(Re, relRough2);
                return f_churchill(Re, relRough2);
            };

            // Phase compositions, molar masses, mass flows
            const sVector& yv = fs.y;  const sVector& xl = fs.x;
            scalar MWg = 0.0, MWl = 0.0;
            for (std::size_t i = 0; i < n; ++i)
            { MWg += yv[i] * thermo.comp(i).MW();  MWl += xl[i] * thermo.comp(i).MW(); }
            const scalar Wg = VF * F * MWg;            // kg/s gas
            const scalar Wl = (1.0 - VF) * F * MWl;    // kg/s liquid
            const scalar Wtot = Wg + Wl;
            const scalar quality = Wg / Wtot;          // mass quality (vapour)

            // The flash may leave a TRACE of a supercritical component (T > Tc,
            // e.g. N2 at 25 C) in the liquid -- it cannot be liquid, and it
            // poisons the liquid property models (Rackett density, Vogel viscosity
            // return NaN above Tc).  Clean it for the LIQUID-phase properties:
            // drop finite-Tc components below T and renormalise (their mass is
            // already counted in MWl above; this is the property composition only).
            sVector xlp = xl;  scalar xlpSum = 0.0;
            for (std::size_t i = 0; i < n; ++i)
            {
                const scalar Tc = thermo.comp(i).Tc();
                if (Tc > 0.0 && T > Tc) xlp[i] = 0.0;
                xlpSum += xlp[i];
            }
            if (xlpSum > 0.0) for (auto& v : xlp) v /= xlpSum;
            else              xlp = xl;        // pathological: nothing condensable

            // Phase properties (rho per phase; mu from override or thermo)
            const scalar rhoG = thermo.density(T, Pin, yv,  DensityPhase::Vapour);
            const scalar rhoL = thermo.density(T, Pin, xlp, DensityPhase::Liquid);
            if (rhoG <= 0.0 || rhoL <= 0.0)
                throw std::runtime_error("Pipe(two-phase): non-physical phase density.");
            scalar muL, muG;
            if (operDict->found("viscosity"))
            {
                muL = operDict->lookupScalar("viscosity", Dims::viscosity);
                std::cout << "  [pipe] liquid viscosity: USER OVERRIDE from"
                             " operation.viscosity = " << muL << " Pa.s"
                             " (the thermoPackage liquidViscosity model is"
                             " bypassed for this unit).\n";
            }
            else if (thermo.hasLiquidViscosity()) muL = thermo.viscosityLiquid(T, xlp);
            else throw std::runtime_error("Pipe(two-phase): no liquid viscosity -- add a "
                "thermoPackage liquidViscosity model, or operation { viscosity <v> Pa.s; }.");
            if (tpDict && tpDict->found("gasViscosity"))
                muG = tpDict->lookupScalar("gasViscosity", Dims::viscosity);
            else muG = thermo.viscosityGas(T, yv);   // throws with its own remedy if absent
            if (muL <= 0.0 || muG <= 0.0)
                throw std::runtime_error("Pipe(two-phase): non-physical phase viscosity.");

            const scalar area = constant::pi * D * D / 4.0;
            const scalar jG = (Wg / rhoG) / area;      // superficial gas velocity [m/s]
            const scalar jL = (Wl / rhoL) / area;      // superficial liquid velocity
            const scalar Re_Ls = rhoL * jL * D / muL;  // liquid flowing alone
            const scalar Re_Gs = rhoG * jG * D / muG;  // gas flowing alone

            scalar dP_fric = 0.0, holdupL = 0.0, rhoMix = 0.0, X = 0.0, phiL2 = 1.0;
            std::string regime2;
            if (tpModel == "homogeneous")
            {
                // Pseudo-fluid: no-slip density + McAdams viscosity, single-phase Darcy.
                const scalar rhoH = 1.0 / (quality / rhoG + (1.0 - quality) / rhoL);
                const scalar muH  = 1.0 / (quality / muG  + (1.0 - quality) / muL);
                const scalar vH   = Wtot / (rhoH * area);
                const scalar fH   = fricF(rhoH * vH * D / muH);
                dP_fric  = fH * (L / D) * (0.5 * rhoH * vH * vH);
                const scalar voidFrac = jG / (jG + jL);    // no-slip
                holdupL  = 1.0 - voidFrac;
                rhoMix   = rhoH;
                regime2  = "homogeneous (no-slip)";
            }
            else if (tpModel == "LockhartMartinelli")
            {
                // Phase-alone gradients -> Martinelli X -> Chisholm multiplier phi_L^2.
                const scalar dPdz_L = fricF(Re_Ls) * (1.0 / D) * (0.5 * rhoL * jL * jL);
                const scalar dPdz_G = fricF(Re_Gs) * (1.0 / D) * (0.5 * rhoG * jG * jG);
                X = std::sqrt(dPdz_L / dPdz_G);
                // Chisholm C from each phase's regime alone (Re < 1000 = viscous/laminar).
                const bool lamL = Re_Ls < 1000.0, lamG = Re_Gs < 1000.0;
                scalar C; std::string cc;
                if      (!lamL && !lamG) { C = 20.0; cc = "tt"; }
                else if ( lamL && !lamG) { C = 12.0; cc = "vt"; }
                else if (!lamL &&  lamG) { C = 10.0; cc = "tv"; }
                else                     { C =  5.0; cc = "vv"; }
                phiL2   = 1.0 + C / X + 1.0 / (X * X);
                dP_fric = phiL2 * dPdz_L * L;
                // Butterworth (1975) fit of the Lockhart-Martinelli void fraction.
                const scalar voidFrac = 1.0 / (1.0 + 0.28 * std::pow(X, 0.71));
                holdupL = 1.0 - voidFrac;
                rhoMix  = holdupL * rhoL + voidFrac * rhoG;
                regime2 = "Lockhart-Martinelli (" + cc + ", C=" + std::to_string((int)C) + ")";
            }
            else if (tpModel == "Friedel")
            {
                // Friedel (1979): a general two-phase multiplier on the TOTAL mass
                // flux flowing as liquid; needs surface tension (Weber number).
                const scalar sigma = (tpDict && tpDict->found("surfaceTension"))
                    ? tpDict->lookupScalar("surfaceTension") : thermo.surfaceTension(T, xlp);
                if (sigma <= 0.0) throw std::runtime_error("Pipe(Friedel): non-physical surface tension.");
                const scalar G    = Wtot / area;                         // mass flux kg/m2.s
                const scalar rhoH = 1.0 / (quality / rhoG + (1.0 - quality) / rhoL);
                const scalar fLO  = fricF(G * D / muL);                  // total flow as liquid
                const scalar fGO  = fricF(G * D / muG);                  // total flow as gas
                const scalar Efr  = (1.0 - quality) * (1.0 - quality)
                                  + quality * quality * (rhoL * fGO) / (rhoG * fLO);
                const scalar Ffr  = std::pow(quality, 0.78) * std::pow(1.0 - quality, 0.224);
                const scalar Hfr  = std::pow(rhoL / rhoG, 0.91) * std::pow(muG / muL, 0.19)
                                  * std::pow(1.0 - muG / muL, 0.7);
                const scalar Fr   = G * G / (g_standard * D * rhoH * rhoH);   // Froude
                const scalar We   = G * G * D / (rhoH * sigma);              // Weber
                phiL2   = Efr + 3.24 * Ffr * Hfr / (std::pow(Fr, 0.045) * std::pow(We, 0.035));
                const scalar dPdz_LO = fLO * (1.0 / D) * (G * G / (2.0 * rhoL));
                dP_fric = phiL2 * dPdz_LO * L;
                const scalar voidFrac = jG / (jG + jL);   // homogeneous void (Friedel is friction-only)
                holdupL = 1.0 - voidFrac;
                rhoMix  = holdupL * rhoL + voidFrac * rhoG;
                regime2 = "Friedel (phi_LO^2)";
            }
            else if (tpModel == "BeggsBrill")
            {
                // Beggs & Brill (1973): flow-pattern map + holdup (+ inclination)
                // + a two-phase friction-factor ratio.  Needs surface tension.
                const scalar sigma = (tpDict && tpDict->found("surfaceTension"))
                    ? tpDict->lookupScalar("surfaceTension") : thermo.surfaceTension(T, xlp);
                if (sigma <= 0.0) throw std::runtime_error("Pipe(BeggsBrill): non-physical surface tension.");
                const scalar vm   = jG + jL;                    // mixture velocity
                const scalar lamL = jL / vm;                    // no-slip liquid holdup
                const scalar NFr  = vm * vm / (g_standard * D);
                const scalar NLV  = jL * std::pow(rhoL / (g_standard * sigma), 0.25);
                const scalar L1 = 316.0      * std::pow(lamL,  0.302);
                const scalar L2 = 0.0009252  * std::pow(lamL, -2.4684);
                const scalar L3 = 0.10       * std::pow(lamL, -1.4516);
                const scalar L4 = 0.5        * std::pow(lamL, -6.738);
                std::string pat;
                if      ((lamL < 0.01 && NFr < L1) || (lamL >= 0.01 && NFr < L2))    pat = "segregated";
                else if (lamL >= 0.01 && NFr >= L2 && NFr <= L3)                     pat = "transition";
                else if ((lamL >= 0.01 && lamL < 0.4 && NFr > L3 && NFr <= L1)
                      || (lamL >= 0.4 && NFr > L3 && NFr <= L4))                     pat = "intermittent";
                else                                                                pat = "distributed";
                auto HL0 = [&](scalar a, scalar b, scalar c)
                    { return std::max(lamL, a * std::pow(lamL, b) / std::pow(NFr, c)); };
                scalar Hl0;
                if      (pat == "segregated")   Hl0 = HL0(0.98,  0.4846, 0.0868);
                else if (pat == "intermittent") Hl0 = HL0(0.845, 0.5351, 0.0173);
                else if (pat == "distributed")  Hl0 = HL0(1.065, 0.5824, 0.0609);
                else { const scalar A = (L3 - NFr) / (L3 - L2);   // transition: interpolate
                       Hl0 = A * HL0(0.98, 0.4846, 0.0868) + (1.0 - A) * HL0(0.845, 0.5351, 0.0173); }
                // Inclination (theta from dz/L; horizontal -> psi = 1).
                const scalar sinth = (L > 0.0) ? std::max(-1.0, std::min(1.0, dz / L)) : 0.0;
                const scalar theta = std::asin(sinth);
                scalar psi = 1.0;
                if (std::abs(theta) > 1.0e-6)
                {
                    scalar d = 0, e = 0, ff = 0, gg = 0;  bool zeroC = false;
                    if (sinth >= 0.0) {            // uphill (Payne et al.)
                        if      (pat == "segregated")   { d=0.011; e=-3.768; ff=3.539;  gg=-1.614; }
                        else if (pat == "intermittent") { d=2.96;  e=0.305;  ff=-0.4473; gg=0.0978; }
                        else                            { zeroC = true; }   // distributed: C = 0
                    } else { d=4.70; e=-0.3692; ff=0.1244; gg=-0.5056; }     // downhill (all)
                    scalar Cbb = zeroC ? 0.0
                        : std::max(0.0, (1.0 - lamL) * std::log(d * std::pow(lamL, e)
                                       * std::pow(std::max(NLV,1e-9), ff) * std::pow(NFr, gg)));
                    const scalar s18 = std::sin(1.8 * theta);
                    psi = 1.0 + Cbb * (s18 - 0.333 * s18 * s18 * s18);
                }
                const scalar Hl    = std::max(lamL, std::min(1.0, Hl0 * psi));
                holdupL = Hl;
                const scalar rho_ns = rhoL * lamL + rhoG * (1.0 - lamL);
                const scalar mu_ns  = muL  * lamL + muG  * (1.0 - lamL);
                const scalar f_ns   = fricF(rho_ns * vm * D / mu_ns);
                const scalar yb     = lamL / (Hl * Hl);
                scalar S;
                if (yb > 1.0 && yb <= 1.2) S = std::log(2.2 * yb - 1.2);
                else { const scalar ly = std::log(std::max(yb, 1e-12));
                       const scalar den = -0.0523 + 3.182*ly - 0.8725*ly*ly + 0.01853*ly*ly*ly*ly;
                       S = (std::abs(den) > 1e-6) ? ly / den : 0.0; }
                const scalar f_tp = f_ns * std::exp(S);
                dP_fric = f_tp * (L / D) * (0.5 * rho_ns * vm * vm);
                rhoMix  = rhoL * Hl + rhoG * (1.0 - Hl);   // slip density for elevation
                phiL2   = std::exp(S);                     // report the friction multiplier
                regime2 = "Beggs-Brill (" + pat + ")";
            }
            else
                throw std::runtime_error("Pipe: unknown twoPhase model '" + tpModel
                    + "'.  homogeneous | LockhartMartinelli (Layer 1); Friedel | "
                      "BeggsBrill (Layer 2, need surface tension).");

            const scalar dP_elev = rhoMix * g_standard * dz;
            const scalar dP   = dP_fric + dP_elev;       // (fittings: Layer-2 item)
            const scalar Pout = Pin - dP;

            if (verbosity >= 2)
                std::cout << "\n=================  Pipe Result -- GAS-LIQUID TWO-PHASE  =============\n"
                          << "  Model:           " << regime2 << "   (friction: " << fricModel << ")\n"
                          << "  Inlet:           V/F = " << std::fixed << std::setprecision(4) << VF
                          << "   mass quality = " << quality << "\n"
                          << "  Gas phase:       rho_G = " << std::setprecision(3) << rhoG
                          << " kg/m3   mu_G = " << std::scientific << std::setprecision(3) << muG
                          << " Pa.s   j_G = " << std::fixed << std::setprecision(3) << jG << " m/s\n"
                          << "  Liquid phase:    rho_L = " << std::setprecision(2) << rhoL
                          << " kg/m3   mu_L = " << std::scientific << std::setprecision(3) << muL
                          << " Pa.s   j_L = " << std::fixed << std::setprecision(3) << jL << " m/s\n"
                          << "  Martinelli X:    " << std::setprecision(4) << X
                          << "   phi_L^2 = " << phiL2 << "\n"
                          << "  Liquid holdup:   " << std::setprecision(4) << holdupL
                          << "   (void = " << (1.0 - holdupL) << ")\n"
                          << "  dP friction:     " << (dP_fric * 1.0e-5) << "  bar\n"
                          << "  dP elevation:    " << (dP_elev * 1.0e-5) << "  bar   (rho_mix = "
                          << std::setprecision(2) << rhoMix << " kg/m3, dz = " << dz << " m)\n"
                          << "  dP (total):      " << std::setprecision(4) << (dP * 1.0e-5)
                          << "  bar   <- RESULT   P_out = " << (Pout * 1.0e-5) << " bar\n"
                          << "====================================================================\n\n";

            produced_.clear();
            ProcessStream out;
            out.name = "out";  out.F = F;  out.T = T;  out.P = Pout;  out.z = z;  out.vf = VF;
            produced_.push_back(out);

            kpis_.clear();
            kpis_["deltaP"]        = dP;        kpis_["dP_friction"]  = dP_fric;
            kpis_["dP_elevation"]  = dP_elev;   kpis_["P_in"]         = Pin;
            kpis_["P_out"]         = Pout;      kpis_["vaporFraction"]= VF;
            kpis_["quality_mass"]  = quality;   kpis_["holdup_liquid"]= holdupL;
            kpis_["voidFraction"]  = 1.0 - holdupL;
            kpis_["X_martinelli"]  = X;         kpis_["phi_L2"]       = phiL2;
            kpis_["jG"]            = jG;        kpis_["jL"]           = jL;
            kpis_["rho_G"]         = rhoG;      kpis_["rho_L"]        = rhoL;
            kpis_["Re_Ls"]         = Re_Ls;     kpis_["Re_Gs"]        = Re_Gs;
            kpis_["F"]             = F;
            return 0;
        }
    }

    // ---- Properties: density (liquid) and viscosity ---------------------
    //   rho from the thermoPackage liquid branch (Rackett / pure-fluid).
    const scalar rho = thermo.density(T, Pin, z, DensityPhase::Liquid);
    if (rho <= 0.0)
        throw std::runtime_error("Pipe: non-physical liquid density.");

    //   Viscosity: explicit operation override wins (self-contained cases),
    //   else the thermoPackage liquidViscosity model.  Required for Re.
    scalar mu;
    std::string muSource;
    if (operDict->found("viscosity"))
    {
        mu = operDict->lookupScalar("viscosity", Dims::viscosity);
        muSource = "operation override";
    }
    else if (thermo.hasLiquidViscosity())
    {
        mu = thermo.viscosityLiquid(T, z);
        muSource = "thermoPackage liquidViscosity";
    }
    else
    {
        throw std::runtime_error(
            "Pipe: no liquid viscosity available.  Add a "
            "`transport { liquidViscosity { model Vogel; } }` block to the "
            "thermoPackage, or give `operation { viscosity <value> Pa.s; }` "
            "directly.  The Reynolds number needs it.");
    }
    if (mu <= 0.0)
        throw std::runtime_error("Pipe: non-physical liquid viscosity.");

    // ---- Kinematics -----------------------------------------------------
    //   Volumetric flow Q = ṅ · v̄_molar = (F_mol/s) · (MW / rho).
    //   F is kmol/s -> mol/s = F*1000; MW in kg/kmol -> kg/mol = MW/1000;
    //   so F_mol*MW_per_mol = (F*1000)*(MW/1000) = F*MW  [kg/s].
    scalar MW_mix = 0.0;                                  // kg/kmol
    for (std::size_t i = 0; i < n; ++i)
        MW_mix += z[i] * thermo.comp(i).MW();
    const scalar massFlow = F * MW_mix;                  // kg/s
    const scalar Q_vol    = massFlow / rho;              // m^3/s
    const scalar area     = constant::pi * D * D / 4.0;  // m^2
    const scalar v        = Q_vol / area;                // m/s
    const scalar Re       = rho * v * D / mu;
    const scalar relRough = eps / D;

    // ---- Friction factor: select the sub-model (the `model` slot) -------
    const std::string modelName = dict->lookupWordOrDefault(
        "model", operDict->lookupWordOrDefault("model", "Churchill"));

    // Regime classification (for the report + KPI; Churchill is smooth
    // across it, the other two switch to 64/Re below 2300).
    int regimeCode;          // 0 laminar, 1 transition, 2 turbulent
    std::string regime;
    if (Re < Re_laminar)      { regimeCode = 0; regime = "laminar";    }
    else if (Re < Re_turb)    { regimeCode = 1; regime = "transition"; }
    else                      { regimeCode = 2; regime = "turbulent";  }

    scalar f;
    if (modelName == "Churchill")
    {
        // Churchill spans every regime in one expression.
        f = f_churchill(Re, relRough);
    }
    else if (modelName == "Haaland")
    {
        f = (Re < Re_laminar) ? f_laminar(Re) : f_haaland(Re, relRough);
    }
    else if (modelName == "Colebrook")
    {
        f = (Re < Re_laminar) ? f_laminar(Re) : f_colebrook(Re, relRough);
    }
    else
    {
        throw std::runtime_error(
            "Pipe: unknown friction model '" + modelName + "'.  Choose "
            "Churchill (default) | Haaland | Colebrook.");
    }

    // ---- Mechanical energy balance: the three ΔP contributions ----------
    const scalar velHead     = 0.5 * rho * v * v;             // Pa
    const scalar dP_friction = f * (L / D) * velHead;         // distributed
    const scalar dP_fittings = sumK * velHead;                // minor losses
    const scalar dP_elevation = rho * g_standard * dz;       // static head
    const scalar dP = dP_friction + dP_fittings + dP_elevation;

    const scalar Pout = Pin - dP;
    // Friction head loss h_f = (dP_friction + dP_fittings)/(rho g)  [m].
    const scalar head_loss = (dP_friction + dP_fittings)
                           / (rho * g_standard);

    if (Pout <= 0.0)
        std::cerr << "WARNING: pipe outlet pressure is non-positive ("
                  << (Pout * 1.0e-5) << " bar).  The computed ΔP ("
                  << (dP * 1.0e-5) << " bar) exceeds the inlet pressure --- "
                     "the line is grossly undersized or too long for this "
                     "flow.  Use a larger D or a pump.\n";

    if (verbosity >= 2)
    {
        std::cout << "\n==============================  Pipe Result  ========================\n"
                  << "  Friction model:  " << modelName << "   (" << regime << ")\n"
                  << "  Geometry:        D = " << std::fixed << std::setprecision(4)
                  << D << " m   L = " << std::setprecision(2) << L
                  << " m   eps/D = " << std::scientific << std::setprecision(3)
                  << relRough << "   Σ K = " << std::fixed << std::setprecision(2)
                  << sumK << "\n"
                  << "  Fluid:           rho = " << std::fixed << std::setprecision(2)
                  << rho << " kg/m3   mu = " << std::scientific << std::setprecision(4)
                  << mu << " Pa.s  (" << muSource << ")\n"
                  << "  Flow:            Q = " << std::scientific << std::setprecision(4)
                  << Q_vol << " m3/s   v = " << std::fixed << std::setprecision(4)
                  << v << " m/s   Re = " << std::setprecision(1) << Re << "\n"
                  << "  Friction factor: f = " << std::fixed << std::setprecision(6)
                  << f << "\n"
                  << "  dP friction:     " << std::setprecision(4)
                  << (dP_friction * 1.0e-5) << "  bar\n"
                  << "  dP fittings:     " << (dP_fittings * 1.0e-5) << "  bar\n"
                  << "  dP elevation:    " << (dP_elevation * 1.0e-5)
                  << "  bar   (Δz = " << std::setprecision(2) << dz << " m)\n"
                  << "  ΔP (total):      " << std::setprecision(4)
                  << (dP * 1.0e-5) << "  bar   <- RESULT (computed, not a spec)\n"
                  << "  head loss:       " << std::setprecision(3) << head_loss
                  << "  m   (friction + fittings)\n"
                  << "  P_in:            " << std::setprecision(4)
                  << (Pin * 1.0e-5) << "  bar\n"
                  << "  P_out:           " << (Pout * 1.0e-5) << "  bar   <- result\n"
                  << "=====================================================================\n\n";
    }

    // ---- Produced stream: inlet with P reduced by ΔP --------------------
    produced_.clear();
    ProcessStream out;
    out.name = "out";
    out.F    = F;
    out.T    = T;          // incompressible, T held
    out.P    = Pout;
    out.z    = z;
    out.vf   = 0.0;        // single-phase liquid
    produced_.push_back(out);

    // ---- KPIs -----------------------------------------------------------
    kpis_.clear();
    kpis_["deltaP"]         = dP;
    kpis_["dP_friction"]    = dP_friction;
    kpis_["dP_fittings"]    = dP_fittings;
    kpis_["dP_elevation"]   = dP_elevation;
    kpis_["P_in"]           = Pin;
    kpis_["P_out"]          = Pout;
    kpis_["velocity"]       = v;
    kpis_["reynolds"]       = Re;
    kpis_["frictionFactor"] = f;
    kpis_["regime"]         = static_cast<scalar>(regimeCode);
    kpis_["head_loss_m"]    = head_loss;
    kpis_["density"]        = rho;
    kpis_["viscosity"]      = mu;
    kpis_["F"]              = F;

    return 0;
}

} // namespace Choupo
