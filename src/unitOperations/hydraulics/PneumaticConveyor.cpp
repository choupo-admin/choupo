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

#include "PneumaticConveyor.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <tuple>

namespace Choupo {

namespace {

// Schiller-Naumann drag coefficient (single particle).
scalar dragCoeff(scalar Re)
{
    if (Re <= 0.0) return 0.0;
    if (Re < 1000.0) return 24.0 / Re * (1.0 + 0.15 * std::pow(Re, 0.687));
    return 0.44;
}

// Single-particle terminal (free-settling) velocity by iterating the drag
// balance  u_t = sqrt( 4 g d (rho_p - rho_g) / (3 C_D rho_g) ),  Stokes start.
// Steady particle velocity from a FORCE BALANCE (forum 2026-07-03, replacing
// Hinkle's fitted slip + its silent fallback).  In developed flow the particle
// does not accelerate, so gas DRAG balances the wall (Coulomb) friction + the
// gravity component along the pipe:
//   1/2 rho_g Cd (pi/4 dp^2) slip^2 = (pi/6 dp^3 rho_p) g (sin th + mu_w cos th)
//   -> slip^2 = (4/3) dp rho_p g (sin th + mu_w cos th)/(rho_g Cd),  Cd(Re_slip)
// iterated.  Reduces to slip=u_t (vertical up: drag=gravity) and u_t*sqrt(mu_w)
// (horizontal: drag=friction) -- mechanistic, glass-box, NO fitted formula, NO
// fallback.  Returns u_g - slip (<=0 signals below-pickup: the caller flags it).
scalar particleVelocity(scalar u_g, scalar dp, scalar rho_p, scalar rho_g,
                        scalar mu, scalar g, scalar sinTheta, scalar muWall)
{
    if (dp <= 0.0 || rho_p <= rho_g || u_g <= 0.0) return u_g;
    const scalar cosTheta = std::sqrt(std::max(0.0, 1.0 - sinTheta * sinTheta));
    const scalar rhs = (4.0 / 3.0) * dp * rho_p * g
                     * (sinTheta + muWall * cosTheta) / rho_g;   // = slip^2 * Cd
    if (rhs <= 0.0) return u_g;                                  // downhill, no resist
    scalar slip = std::sqrt(rhs / 0.44);                        // Newton-Cd start
    for (int it = 0; it < 80; ++it)
    {
        const scalar Cd = dragCoeff(rho_g * slip * dp / mu);
        if (Cd <= 0.0) break;
        const scalar sn = std::sqrt(rhs / Cd);
        if (std::abs(sn - slip) < 1e-9 * std::max(sn, 1.0)) { slip = sn; break; }
        slip = sn;
    }
    return u_g - slip;
}

scalar terminalVelocity(scalar dp, scalar rho_p, scalar rho_g, scalar mu, scalar g)
{
    if (rho_p <= rho_g || dp <= 0.0) return 0.0;
    scalar ut = g * dp * dp * (rho_p - rho_g) / (18.0 * mu);   // Stokes
    for (int it = 0; it < 60; ++it)
    {
        const scalar Re = rho_g * ut * dp / mu;
        const scalar Cd = dragCoeff(Re);
        if (Cd <= 0.0) break;
        const scalar un = std::sqrt(4.0 * g * dp * (rho_p - rho_g) / (3.0 * Cd * rho_g));
        if (std::abs(un - ut) < 1.0e-6 * std::max(un, 1.0e-9)) { ut = un; break; }
        ut = un;
    }
    return ut;
}

} // namespace

int PneumaticConveyor::solve(const DictPtr& dict,
                             const ThermoPackage& thermo,
                             int verbosity)
{
    constexpr scalar R  = 8314.462;     // J/(kmol·K)
    constexpr scalar g  = 9.80665;      // m/s^2
    constexpr scalar PI = 3.14159265358979323846;
    const std::size_t n = thermo.n();

    // ---- Inlet gas ------------------------------------------------------
    auto feed = dict->subDict("feed");
    const scalar F = feed->lookupScalar("F", Dims::molarFlow);   // gas kmol/s
    const scalar T = feed->lookupScalar("T", Dims::temperature);
    const scalar P = feed->lookupScalar("P", Dims::pressure);
    auto comp = dict->subDict("composition");
    sVector y(n, 0.0);
    {
        for (const auto& k : comp->keys()) y[thermo.indexOf(k)] = comp->lookupScalar(k);
        scalar s = 0.0; for (auto v : y) s += v;
        if (s > 0.0) for (auto& v : y) v /= s;
    }

    // ---- Inlet solids + PSD --------------------------------------------
    if (!dict->found("solids"))
        throw std::runtime_error("pneumaticConveyor: the feed carries no solids "
            "--- this unit conveys solids in a gas.  Add a `solids { "
            "solidMolarFlows {...} diameters (...); massFractions (...); }` block.");
    auto sol = dict->subDict("solids");
    sVector sin(n, 0.0);
    {
        auto sf = sol->subDict("solidMolarFlows");
        for (const auto& k : sf->keys())
            sin[thermo.indexOf(k)] = sf->lookupScalar(k, Dims::molarFlow);   // accepts kmol/h etc.
    }
    std::vector<scalar> d  = sol->lookupList("diameters");      // m
    std::vector<scalar> mf = sol->lookupList("massFractions");
    if (d.empty() || d.size() != mf.size())
        throw std::runtime_error("pneumaticConveyor: PSD diameters / massFractions "
            "missing or mismatched.");
    { scalar s = 0.0; for (auto v : mf) s += v; if (s > 0.0) for (auto& v : mf) v /= s; }

    // ---- Geometry (HARDWARE only) --------------------------------------
    auto oper = dict->subDict("operation");
    auto geom = oper->subDict("geometry");
    const scalar D  = geom->lookupScalar("D", Dims::length);
    const scalar L  = geom->lookupScalar("L", Dims::length);
    const scalar dz = geom->lookupScalarOrDefault("dz", 0.0, Dims::length);  // vertical rise
    if (D <= 0.0 || L <= 0.0)
        throw std::runtime_error("pneumaticConveyor: D and L must be > 0.");

    // ---- Gas properties -------------------------------------------------
    scalar MWg = 0.0;
    for (std::size_t i = 0; i < n; ++i) MWg += y[i] * thermo.comp(i).MW();   // kg/kmol
    const scalar rho_g = P * MWg / (R * T);
    if (!thermo.hasTransport())
        throw std::runtime_error("pneumaticConveyor: needs a gas viscosity --- add "
            "`transport { viscosity { model Chung; } }` to the thermoPackage.");
    const scalar mu = thermo.viscosityGas(T, y);

    // ---- Solids: mass flow, particle density, Sauter mean diameter ------
    scalar rho_p = 0.0, mDotS = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        if (sin[i] <= 0.0) continue;
        const scalar mi = sin[i] * thermo.comp(i).MW();
        rho_p += mi * (thermo.comp(i).rho_p() > 0.0 ? thermo.comp(i).rho_p() : 0.0);
        mDotS += mi;
    }
    if (mDotS <= 0.0)
        throw std::runtime_error("pneumaticConveyor: no solids mass flow reached the "
            "unit --- check the `solids { solidMolarFlows {...} }` block / the upstream "
            "stream actually carries solids.");
    rho_p = rho_p / mDotS;
    if (rho_p <= 0.0)
        throw std::runtime_error("pneumaticConveyor: the solid has no particle "
            "density --- add `solid { rho_p <kg/m^3>; }` to its component.dat.");
    scalar invSauter = 0.0;
    for (std::size_t k = 0; k < d.size(); ++k) if (d[k] > 0.0) invSauter += mf[k] / d[k];
    const scalar dp = (invSauter > 0.0) ? 1.0 / invSauter : 0.0;   // Sauter mean (drag)

    // ---- Velocities -----------------------------------------------------
    const scalar A     = PI * D * D / 4.0;
    const scalar Q     = F * R * T / P;        // gas volumetric flow m^3/s
    const scalar u_g   = Q / A;                // superficial gas velocity
    const scalar mDotG = F * MWg;              // kg/s of gas
    // Particle velocity from the mechanistic FORCE BALANCE (drag = wall friction
    // + gravity component) -- no fitted slip, no silent fallback.  mu_w is the
    // particle-wall Coulomb friction coefficient (declared, announced).
    const scalar muWall  = oper->lookupScalarOrDefault("particleWallFriction", 0.4);
    const scalar sinTh   = (L > 0.0) ? std::max(-1.0, std::min(1.0, dz / L)) : 0.0;
    const scalar u_t     = terminalVelocity(dp, rho_p, rho_g, mu, g);
    scalar u_p = particleVelocity(u_g, dp, rho_p, rho_g, mu, g, sinTh, muWall);
    // u_p <= 0 means the gas is BELOW PICKUP (slip >= u_g) -- not a model glitch
    // but the physical no-conveying regime the saltation check below flags LOUD.
    const bool belowPickup = (u_p <= 0.02 * u_g);
    if (belowPickup) u_p = 0.02 * u_g;   // numerical floor for rho_susp; SEEN via saltation warning
    const scalar rhoSusp = mDotS / (u_p * A);  // suspended-solids density kg/m^3
    const scalar loading = (mDotG > 0.0) ? mDotS / mDotG : 0.0;

    // ---- Friction factors ----------------------------------------------
    const scalar Re_g = rho_g * u_g * D / mu;
    const scalar f_g  = (Re_g > 2100.0) ? 0.079 * std::pow(Re_g, -0.25)
                                        : 16.0 / std::max(Re_g, 1.0);     // Fanning
    // Solids friction: Yang (1974), AIChE J. 20(3):605 -- the modified friction
    // factor f_p (his eq 4: dP_s = f_p rho_susp u_p^2 L /(2D)) correlated on the
    // voidage eps and the terminal/particle Reynolds ratio (Re)_t/(Re)_p = u_t/u_p.
    //   (1-eps) = solids holdup = rho_susp/rho_p.
    //   vertical  (eq 3): f_p eps^3/(1-eps) = 0.0206 [(1-eps)(Re_t/Re_p)]^-0.869
    //   horizontal(eq 5): f_p eps^3/(1-eps) = 0.117  [(1-eps)(Re_t/Re_p) U_f/sqrt(gD)]^-1.15
    // (replaces the scatter-prone Hinkle 1953 f_p.)  A line predominantly
    // vertical uses eq 3, else eq 5; announced.  Mixed lines should be segmented.
    const scalar oneMinEps = std::min(0.5, rhoSusp / rho_p);   // (1-eps), guarded
    const scalar eps       = 1.0 - oneMinEps;
    const scalar reRatio   = (u_p > 0.0) ? u_t / u_p : 0.0;    // (Re)_t/(Re)_p
    const bool   vertical  = (std::abs(sinTh) > 0.5);
    const char*  yangEq    = vertical ? "3 (vertical)" : "5 (horizontal)";
    scalar f_p = 0.0;
    if (eps > 0.0 && oneMinEps > 0.0 && reRatio > 0.0)
    {
        const scalar pre = oneMinEps / (eps * eps * eps);
        if (vertical)
            f_p = 0.0206 * pre * std::pow(oneMinEps * reRatio, -0.869);
        else
        {
            const scalar Fr = u_g / std::sqrt(g * D);          // U_f/sqrt(gD)
            f_p = 0.117 * pre * std::pow(oneMinEps * reRatio * Fr, -1.15);
        }
    }

    // ---- BEND losses: solids RE-ACCELERATION (forum 2026-07-03) ---------
    // Each bend decelerates the solids to u_p,bend = ratio*u_p; the gas must
    // then RE-ACCELERATE them downstream -- the same momentum work as the line
    // entry, once per bend: dP_bend = mDotS (u_p - u_p,bend)/A.  The exit ratio
    // is keyed to bend TYPE (cited textbook ranges; Klinzing/Marcus): a
    // long-radius sweep keeps most velocity, a blind tee nearly stops the solids
    // (higher dP, near-zero erosion).  Geometry in the case dict, one entry per
    // bend.  No `bends` -> no bend loss (a straight line).
    scalar dP_bends = 0.0;
    std::vector<std::tuple<scalar,scalar,std::string>> bendLog;   // ratio, dP, type
    if (geom->found("bends"))
    {
        for (const auto& b : geom->lookupDictList("bends"))
        {
            const std::string bt = b->lookupWordOrDefault("type", "longRadius");
            scalar ratio;
            if (b->found("exitRatio"))       ratio = b->lookupScalar("exitRatio");
            else if (bt == "blindTee")       ratio = 0.25;   // solids nearly stop
            else if (bt == "shortRadius")    ratio = 0.50;   // R/D ~ 2-4
            else                             ratio = 0.75;   // longRadius, R/D >= 6
            ratio = std::max(0.0, std::min(1.0, ratio));
            const scalar dPb = mDotS * u_p * (1.0 - ratio) / A;  // re-accel momentum
            dP_bends += dPb;
            bendLog.emplace_back(ratio, dPb, bt);
        }
    }

    // ---- Pressure-drop contributions (Pa) ------------------------------
    const scalar dP_accG = 0.5 * rho_g * u_g * u_g;
    const scalar dP_accS = rhoSusp * u_p * u_p;
    const scalar dP_frG  = 2.0 * f_g * rho_g * u_g * u_g * L / D;      // Fanning gas
    const scalar dP_frS  = f_p * rhoSusp * u_p * u_p * L / (2.0 * D);  // Yang eq 4
    const scalar dP_stG  = rho_g  * g * dz;
    const scalar dP_stS  = rhoSusp * g * dz;
    const scalar dP   = dP_accG + dP_accS + dP_frG + dP_frS + dP_stG + dP_stS + dP_bends;
    const scalar Pout = P - dP;

    // ---- Saltation velocity (Rizk 1973, horizontal) --------------------
    const scalar delta  = 1440.0 * dp + 1.96;
    const scalar chi    = 1100.0 * dp + 2.5;
    const scalar u_salt = (loading > 0.0 && chi > 0.0)
        ? std::sqrt(g * D) * std::pow(loading * std::pow(10.0, delta), 1.0 / chi) : 0.0;
    const bool   saltRisk = (u_salt > u_g);

    // ---- Outlet stream --------------------------------------------------
    produced_.clear();
    ProcessStream out; out.name = "conveyed";
    out.F = F; out.T = T; out.P = Pout; out.z = y; out.vf = 1.0;
    out.s = sin;
    ParticleSizeDistribution psd; psd.diameter = d; psd.massFrac = mf;
    out.psd = psd;
    produced_.push_back(out);

    // ---- KPIs -----------------------------------------------------------
    kpis_.clear();
    kpis_["deltaP"]                = dP;
    kpis_["deltaP_gasAccel"]       = dP_accG;
    kpis_["deltaP_solidsAccel"]    = dP_accS;
    kpis_["deltaP_gasFriction"]    = dP_frG;
    kpis_["deltaP_solidsFriction"] = dP_frS;
    kpis_["deltaP_static"]         = dP_stG + dP_stS;
    kpis_["deltaP_bends"]          = dP_bends;
    kpis_["nBends"]                = static_cast<scalar>(bendLog.size());
    kpis_["P_out"]                 = Pout;
    kpis_["u_gas"]                 = u_g;
    kpis_["u_particle"]            = u_p;
    kpis_["u_terminal"]            = u_t;
    kpis_["u_saltation"]           = u_salt;
    kpis_["solidsLoading"]         = loading;
    kpis_["suspensionDensity"]     = rhoSusp;
    kpis_["sauterDiameter"]        = dp;
    kpis_["rho_gas"]               = rho_g;
    kpis_["rho_particle"]          = rho_p;
    kpis_["solidsMassFlow"]        = mDotS;
    kpis_["particleWallFriction"]  = muWall;
    kpis_["saltationMargin"]       = (u_salt > 0.0) ? u_g / u_salt : 0.0;
    // acceleration-length diagnostic: rough distance for a particle to reach
    // u_p (u_p^2 / 2a, a = drag accel at half-slip); warns if L_accel/L is large.
    {
        const scalar slip0 = std::max(1e-3, u_g - u_p);
        const scalar Cd0   = dragCoeff(rho_g * slip0 * dp / mu);
        const scalar accel = 0.75 * Cd0 * rho_g * slip0 * slip0 / (rho_p * dp);  // m/s^2
        const scalar Lacc  = (accel > 0.0) ? u_p * u_p / (2.0 * accel) : 0.0;
        kpis_["accelerationLength"] = Lacc;
        // pass-8 (student): an acceleration zone LONGER than the pipe means
        // the developed-flow assumptions never hold anywhere -- say it LOUD.
        if (Lacc > L && verbosity >= 1)
            std::cout << "\n[pneumaticConveyor] WARNING: the solids acceleration"
                         " length (~" << Lacc << " m) EXCEEDS the pipe length ("
                      << L << " m)" << (dP_bends > 0.0 ? " -- and each bend needs"
                         " its own re-acceleration zone" : "")
                      << ".  The developed-flow dP breakdown is a rough model"
                         " here; treat the split as indicative.\n";
    }

    // ---- Report (glass-box) --------------------------------------------
    if (verbosity >= 1 && loading > 15.0)
        std::cout << "\n[pneumaticConveyor] WARNING: solids loading "
                  << std::fixed << std::setprecision(1) << loading << " kg/kg is"
                  << " above the DILUTE-phase ceiling (~15); this model does NOT"
                  << " cover dense-phase (plug/slug) flow -- treat the result as"
                  << " out of range.\n";
    if (verbosity >= 1 && (eps < 0.994 || eps > 0.9995))
        std::cout << "\n[pneumaticConveyor] WARNING: voidage eps = " << std::fixed
                  << std::setprecision(5) << eps << " is OUTSIDE the Yang-1974 "
                  << "solids-friction range (0.994-0.999); the f_p is an "
                  << "EXTRAPOLATION -- more dilute (higher eps) inflates it.  Use "
                  << "a realistic loading (~2-15 kg/kg) or read dP_solidsFriction "
                  << "as indicative only.\n";
    if (verbosity >= 1 && saltRisk)
        std::cout << "\n[pneumaticConveyor] WARNING: gas velocity " << std::fixed
                  << std::setprecision(2) << u_g << " m/s is BELOW the saltation "
                  << "velocity " << u_salt << " m/s --- solids may settle and block "
                  << "the line.  Increase the gas rate or reduce the pipe diameter.\n";
    if (verbosity >= 2)
    {
        std::cout << "\n=============  Pneumatic conveyor (dilute phase)  =============\n"
                  << "  Pipe:   D = " << std::fixed << std::setprecision(3) << D
                  << " m,  L = " << std::setprecision(1) << L
                  << " m,  vertical rise dz = " << std::setprecision(1) << dz << " m\n"
                  << "  Gas:    Q = " << std::scientific << std::setprecision(3) << Q
                  << " m^3/s,  u_g = " << std::fixed << std::setprecision(2) << u_g
                  << " m/s,  rho_g = " << std::setprecision(3) << rho_g
                  << " kg/m^3,  mu = " << std::scientific << std::setprecision(3) << mu << " Pa.s\n"
                  << "  Solids: m_dot = " << std::setprecision(3) << mDotS
                  << " kg/s,  rho_p = " << std::fixed << std::setprecision(0) << rho_p
                  << " kg/m^3,  d_p(Sauter) = " << std::setprecision(1) << (dp * 1.0e6)
                  << " um,  loading = " << std::setprecision(2) << loading << " kg/kg\n"
                  << "  u_particle = " << std::setprecision(2) << u_p << " m/s"
                  << (belowPickup ? " (BELOW PICKUP -- see saltation)" : " (force balance)")
                  << " [drag = mu_w=" << std::setprecision(2) << muWall
                  << " wall friction + gravity],  u_terminal = " << u_t
                  << " m/s,  suspension rho* = "
                  << std::setprecision(3) << rhoSusp << " kg/m^3\n"
                  << "  Saltation u_salt = " << std::setprecision(2) << u_salt << " m/s  "
                  << (saltRisk ? "<-- WARNING: u_g below saltation!" : "(u_g above saltation, OK)")
                  << "\n  ------  pressure-drop breakdown (Pa)  ------\n"
                  << "    gas acceleration   = " << std::setw(10) << std::setprecision(1) << dP_accG << "\n"
                  << "    solids acceleration= " << std::setw(10) << dP_accS << "\n"
                  << "    gas friction       = " << std::setw(10) << dP_frG << "\n"
                  << "    solids friction    = " << std::setw(10) << dP_frS << "  (Yang 1974 eq " << yangEq << " -- mean inclination " << std::setprecision(1) << (std::asin(std::max(-1.0,std::min(1.0,sinTh))) * 57.2958) << " deg vs the 30-deg cutoff (sin 0.5); mixed lines should be SEGMENTED)\n"
                  << "    static (gas+solids)= " << std::setw(10) << (dP_stG + dP_stS) << "\n";
            for (std::size_t bi = 0; bi < bendLog.size(); ++bi)
                std::cout << "    bend[" << (bi+1) << "] " << std::get<2>(bendLog[bi])
                          << " (u_p " << std::setprecision(1) << u_p << "->"
                          << std::get<0>(bendLog[bi]) * u_p << " m/s) = "
                          << std::setw(10) << std::get<1>(bendLog[bi]) << " Pa\n";
            if (!bendLog.empty())
                std::cout << "    bends TOTAL        = " << std::setw(10) << dP_bends
                          << " Pa  (" << std::setprecision(0)
                          << (100.0 * dP_bends / std::max(dP, 1.0))
                          << "% of dP; re-accel MOMENTUM only -- the extra"
                             " friction in the re-accel zone is not separately"
                             " counted, so this is a mechanistic lower bound)\n";
            // pass-10: this tail was CHAINED inside the bends conditional, so a
            // bend-free line lost its TOTAL, P_out and accel-length caveat.
            std::cout << "    --------------------------------\n"
                  << "    accel length (est) = " << std::setw(10) << std::setprecision(1) << kpis_["accelerationLength"] << "  m   (developed-flow split is indicative where this rivals L)\n"
                  << "    TOTAL dP           = " << std::setw(10) << dP << " Pa"
                  << "   ->  P_out = " << std::setprecision(0) << Pout << " Pa\n"
                  << "===============================================================\n\n";
    }
    return 0;
}

} // namespace Choupo
