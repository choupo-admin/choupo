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

#include "SprayDryer.H"
#include "solver/NewtonRaphson.H"
#include "streams/StreamMass.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

int SprayDryer::solve(const DictPtr& dict,
                      const ThermoPackage& thermo,
                      int verbosity)
{
    constexpr scalar PI = 3.14159265358979323846;
    constexpr scalar G  = 9.80665;          // m/s^2
    constexpr scalar R  = 8314.462;         // J/(kmol·K)
    const std::size_t n = thermo.n();

    // -------------------------------------------------------------------
    //  Inputs: feed (liquid + dissolved solid) + dryingAir (hot gas).
    //  buildAugmentedDict writes them under `inputStreams ( {feed} {air} )`
    //  when the unit declares  inputs (feed dryingAir );
    // -------------------------------------------------------------------
    auto ins = dict->lookupDictList("inputStreams");
    if (ins.size() != 2)
        throw std::runtime_error("SprayDryer: expected exactly 2 inputs"
            " (feed liquid + drying air); got " + std::to_string(ins.size())
            + ".  Declare  inputs (feed dryingAir );");
    auto feedDict = ins[0];
    auto airDict  = ins[1];

    const scalar F_feed = feedDict->lookupScalar("F", Dims::molarFlow);   // kmol/s
    const scalar T_feed = feedDict->lookupScalar("T", Dims::temperature);
    const scalar F_air  = airDict->lookupScalar("F", Dims::molarFlow);    // kmol/s
    const scalar T_air  = airDict->lookupScalar("T", Dims::temperature);
    const scalar P_air  = airDict->lookupScalarOrDefault("P", 101325.0);

    auto readComp = [&](const DictPtr& sd) -> sVector
    {
        sVector v(n, 0.0);
        auto c = sd->subDict("composition");
        scalar s = 0.0;
        for (const auto& k : c->keys()) { v[thermo.indexOf(k)] = c->lookupScalar(k); }
        for (auto x : v) s += x;
        if (s > 0.0) for (auto& x : v) x /= s;
        return v;
    };
    const sVector zFeed = readComp(feedDict);
    const sVector yAir  = readComp(airDict);

    // Crystals already SUSPENDED in the feed (e.g. a magma from a crystalliser
    // upstream): they are not dissolved (not in `composition`), they ride in
    // s[] and must end up in the powder -- the dryer evaporates the liquor, the
    // suspended solid passes straight through.
    auto readSolids = [&](const DictPtr& sd) -> sVector
    {
        sVector v(n, 0.0);
        if (!sd->found("solids")) return v;
        auto so = sd->subDict("solids");
        if (so->found("solidMolarFlows"))
        {
            auto mf = so->subDict("solidMolarFlows");
            for (const auto& k : mf->keys()) v[thermo.indexOf(k)] = mf->lookupScalar(k);
        }
        return v;
    };
    const sVector sFeed = readSolids(feedDict);    // kmol/s of suspended crystals

    // -------------------------------------------------------------------
    //  Operation = atomiser HARDWARE only (the credo).  Liquid viscosity
    //  / surface tension default to water (Choupo carries neither yet);
    //  they are knobs, not specs.
    // -------------------------------------------------------------------
    auto oper = dict->subDict("operation");
    const scalar Nrpm  = oper->lookupScalarOrDefault("wheelSpeed", 10000.0);  // rpm
    const scalar Ddisk = oper->lookupScalar("wheelDiameter", Dims::length);   // m
    const scalar muL   = oper->lookupScalarOrDefault("liquidViscosity", 1.0e-3);
    const scalar nRR   = oper->lookupScalarOrDefault("spreadParameter", 2.2);  // Rosin-Rammler width
    const scalar Dch   = oper->lookupScalarOrDefault("chamberDiameter", 0.0);  // m  (drying chamber)
    const scalar Lch   = oper->lookupScalarOrDefault("chamberHeight",  0.0);   // m  (drying chamber)
    const std::string flowDir = oper->lookupWordOrDefault("flow", "co");       // co | counter current
    if (Ddisk <= 0.0) throw std::runtime_error("SprayDryer: wheelDiameter must be > 0");

    // -------------------------------------------------------------------
    //  Identify, in the FEED, the volatile solvent and the non-volatile
    //  solid; in the AIR, the dominant dry-gas carrier (for diffusivity).
    // -------------------------------------------------------------------
    std::size_t iSolv = n, iSolid = n;
    for (std::size_t i = 0; i < n; ++i)
    {
        if (zFeed[i] <= 0.0) continue;
        const std::string& r = thermo.comp(i).role();
        if (r == "nonvolatile")                          iSolid = i;
        else if (thermo.comp(i).hasVaporPressure())      iSolv  = i;
    }
    if (iSolv == n)
        throw std::runtime_error("SprayDryer: the feed has no volatile"
            " solvent to evaporate (need a component with vapour pressure).");
    if (iSolid == n)
        throw std::runtime_error("SprayDryer: the feed has no non-volatile"
            " solid to dry into powder (need a `role nonvolatile;` species).");

    std::size_t iDry = n; scalar ymax = 0.0;
    for (std::size_t i = 0; i < n; ++i)
        if (i != iSolv && yAir[i] > ymax) { ymax = yAir[i]; iDry = i; }
    if (iDry == n)
        throw std::runtime_error("SprayDryer: dryingAir has no carrier gas.");

    const Component& solv = thermo.comp(iSolv);
    const Component& sol  = thermo.comp(iSolid);
    const scalar MW_w = solv.MW();

    // -------------------------------------------------------------------
    //  Surface tension of the atomising liquid -- HONEST CASCADE (glass-box):
    //    (1) explicit `surfaceTension` in operation{}  -> the knob wins;
    //    (2) else the property layer  thermo.surfaceTension(T_feed, x_liq)
    //        -- the REAL sigma(T) of the liquid (IAPWS R1-76 if water is
    //        IF97-flagged, else the generic SurfaceTensionModel) evaluated
    //        at the atomisation (feed) temperature.  The non-volatile solid
    //        has no liquid surface, so sigma is taken on the volatile
    //        solvent (water) -- a unit vector in iSolv -- which also keeps
    //        the BrockBird correlation off the solid's missing Tc/Pc/Tb;
    //    (3) else (no sigma model declared / the accessor throws) -> the
    //        0.072 N/m water fallback, so cases WITHOUT a sigma model stay
    //        byte-stable.
    // -------------------------------------------------------------------
    scalar sigma = 0.072;
    std::string sigmaSource = "default (0.072 N/m, water)";
    if (oper->found("surfaceTension"))
    {
        sigma = oper->lookupScalar("surfaceTension");
        sigmaSource = "operation{} knob";
    }
    else
    {
        sVector xLiq(n, 0.0);
        xLiq[iSolv] = 1.0;                       // surface = the volatile solvent
        try
        {
            sigma = thermo.surfaceTension(T_feed, xLiq);
            sigmaSource = "property layer  sigma(T_feed) of " + solv.name();
        }
        catch (const std::exception&)
        {
            sigma = 0.072;                       // no sigma model -> byte-stable fallback
            sigmaSource = "default (0.072 N/m, water -- no surfaceTension model)";
        }
    }

    // -------------------------------------------------------------------
    //  Mass balance: solid -> powder; ALL feed solvent -> vapour (the
    //  phase-1 "dry powder" assumption).  Air carries the vapour out.
    // -------------------------------------------------------------------
    const scalar n_solv_feed = F_feed * zFeed[iSolv];                // kmol/s evaporated
    const scalar n_solid     = F_feed * zFeed[iSolid] + sFeed[iSolid]; // dissolved + suspended
    const scalar m_solid     = n_solid * sol.MW();                   // kg/s solid

    scalar MW_feed = 0.0;
    for (std::size_t i = 0; i < n; ++i) MW_feed += zFeed[i] * thermo.comp(i).MW();
    scalar m_feed = F_feed * MW_feed;                      // kg/s (dissolved basis)
    for (std::size_t i = 0; i < n; ++i) m_feed += sFeed[i] * thermo.comp(i).MW();  // + suspended crystals
    const scalar x_solid_mass = (m_feed > 0.0) ? m_solid / m_feed : 0.0;

    // -------------------------------------------------------------------
    //  Wet-bulb temperature of the droplet (constant-rate surface T).
    //  Psychrometric balance with the Lewis relation (Le ~ 1 for water-air):
    //      (T_air - Twb)·cp_humid = ΔHvap(Twb)·(Y_sat(Twb) - Y_air)
    //  with absolute humidities Y in kg solvent / kg dry gas.
    // -------------------------------------------------------------------
    scalar MW_dry = 0.0, ydry = 0.0;
    for (std::size_t i = 0; i < n; ++i)
        if (i != iSolv) { MW_dry += yAir[i] * thermo.comp(i).MW(); ydry += yAir[i]; }
    MW_dry = (ydry > 0.0) ? MW_dry / ydry : thermo.comp(iDry).MW();

    const scalar yw_air = yAir[iSolv];
    const scalar Y_air  = (yw_air < 1.0)
                        ? (MW_w / MW_dry) * yw_air / (1.0 - yw_air) : 1.0;

    scalar cp_dry_molar = 0.0;
    for (std::size_t i = 0; i < n; ++i)
        if (i != iSolv && yAir[i] > 0.0 && ydry > 0.0)   // only species present (skip the solid)
            cp_dry_molar += (yAir[i] / ydry) * thermo.comp(i).cpIdealGas().Cp(T_air);
    const scalar cp_dry = cp_dry_molar / (MW_dry / 1000.0);                 // J/(kg dry·K)
    const scalar cp_vap = solv.cpIdealGas().Cp(T_air) / (MW_w / 1000.0);    // J/(kg vap·K)

    auto Ysat = [&](scalar T) -> scalar
    {
        const scalar Pw = solv.vp().Psat_Pa(T);
        return (Pw < 0.99 * P_air) ? (MW_w / MW_dry) * Pw / (P_air - Pw) : 10.0;
    };
    auto gwb = [&](scalar Twb) -> scalar
    {
        const scalar dHv = solv.Hvap_latent(Twb) / (MW_w / 1000.0);        // J/kg
        const scalar cph = cp_dry + Y_air * cp_vap;                        // J/(kg dry·K)
        return (T_air - Twb) * cph - dHv * (Ysat(Twb) - Y_air);
    };
    auto dgwb = [&](scalar T) { const scalar h = 0.01; return (gwb(T + h) - gwb(T - h)) / (2.0 * h); };

    solver::NROptions owb;
    owb.tolerance = 1.0e-2;
    owb.maxIter   = 80;
    owb.lower     = std::min(T_feed, 280.0);
    owb.upper     = T_air;
    owb.bracket   = true;
    auto rwb = solver::newton1D(gwb, dgwb, 0.5 * (T_feed + T_air), owb);
    const scalar T_wb = rwb.x;

    // -------------------------------------------------------------------
    //  Adiabatic energy balance -> outlet air T_out.  The hot air gives
    //  up sensible heat to evaporate the feed solvent (warm the feed
    //  water from T_feed up to the wet-bulb, then vaporise it):
    //      F_air·cp_air·(T_air - T_out) = n_evap·[ΔHvap + cpL·(Twb - Tfeed)]
    // -------------------------------------------------------------------
    const scalar cpL_w = solv.hasCpLiquid()
                       ? solv.cpLiquid().Cp(0.5 * (T_feed + T_wb)) : 75.4;  // J/(mol·K)
    const scalar Q = n_solv_feed * 1000.0
                   * (solv.Hvap_latent(T_wb) + cpL_w * (T_wb - T_feed));    // W
    // Molar Cp of the inlet air -- summed over species ACTUALLY present, so
    // a non-volatile solid in the package (y = 0, no idealGasHeatCapacity)
    // is skipped rather than tripping ThermoPackage::Cp_ig's hard check.
    scalar cp_air_molar = 0.0;                                              // J/(mol·K)
    for (std::size_t i = 0; i < n; ++i)
        if (yAir[i] > 0.0) cp_air_molar += yAir[i] * thermo.comp(i).cpIdealGas().Cp(T_air);
    const scalar cp_air_W = std::max(1.0, F_air * 1000.0 * cp_air_molar);   // W/K
    // Energy cap: the air cannot cool below its adiabatic-saturation (wet-bulb)
    // temperature.  If the feed solvent exceeds what the air can carry to
    // saturation, drying is ENERGY-limited -- the air leaves saturated at T_wb
    // and the unevaporated solvent stays in the powder (a wet product), not the
    // unphysical sub-wet-bulb T the "all solvent evaporates" balance would give.
    const scalar q_per_evap = solv.Hvap_latent(T_wb) + cpL_w * (T_wb - T_feed);  // J/mol
    const scalar n_evap_max = (q_per_evap > 0.0)
                            ? cp_air_W * (T_air - T_wb) / (1000.0 * q_per_evap)  // kmol/s
                            : n_solv_feed;
    const bool   energy_limited = (n_solv_feed > n_evap_max);
    const scalar T_out = energy_limited ? T_wb : T_air - Q / cp_air_W;

    // -------------------------------------------------------------------
    //  Atomisation -- Friedman/Marshall rotary-disc correlation:
    //      d32/D = 0.4 (Γ/(ρ_L N D²))^0.6 (μ_L/Γ)^0.2 (σ ρ_L D/Γ²)^0.1
    //  Γ = feed mass flow per unit wetted perimeter (π D); N in rev/s.
    //  The droplet then shrinks to the powder particle as solvent leaves:
    //      d_p = d32 · (x_solid,mass · ρ_L / ρ_solid)^(1/3)
    // -------------------------------------------------------------------
    const scalar rho_L = (solv.Vliq() > 0.0) ? (MW_w / 1000.0) / solv.Vliq() : 1000.0;
    const scalar N_rev = Nrpm / 60.0;                       // rev/s
    const scalar Gamma = m_feed / (PI * Ddisk);             // kg/(m·s)
    scalar d32 = 0.0;
    if (Gamma > 0.0 && N_rev > 0.0)
        d32 = 0.4 * Ddisk
            * std::pow(Gamma / (rho_L * N_rev * Ddisk * Ddisk), 0.6)
            * std::pow(muL / Gamma, 0.2)
            * std::pow(sigma * rho_L * Ddisk / (Gamma * Gamma), 0.1);
    const scalar rho_solid = (sol.rho_p() > 0.0) ? sol.rho_p() : 1500.0;
    const scalar d_part = (x_solid_mass > 0.0)
                        ? d32 * std::cbrt(x_solid_mass * rho_L / rho_solid) : d32;

    // -------------------------------------------------------------------
    //  Drying kinetics -- terminal velocity (Stokes) + Ranz-Marshall.
    //  Needs the transport layer (gas mu / k / D).  Without it the M&E
    //  and atomisation still stand; the kinetics are reported as zero.
    // -------------------------------------------------------------------
    const scalar T_film  = 0.5 * (T_air + T_wb);
    scalar MW_air = 0.0; for (std::size_t i = 0; i < n; ++i) MW_air += yAir[i] * thermo.comp(i).MW();
    const scalar rho_g   = P_air * MW_air / (R * T_film);   // kg/m^3

    scalar mu_g = 0.0, k_g = 0.0, Dab = 0.0;
    if (thermo.hasTransport())             mu_g = thermo.viscosityGas(T_film, yAir);
    if (thermo.hasThermalConductivity())   k_g  = thermo.thermalConductivityGas(T_film, yAir);
    if (thermo.hasDiffusivity())           Dab  = thermo.diffusivityGas(T_film, P_air, iSolv, iDry);

    const scalar d   = (d32 > 0.0) ? d32 : d_part;          // droplet drives drying
    scalar v_t = 0.0, Re = 0.0, Pr = 0.0, Sc = 0.0;
    scalar Nu = 2.0, Sh = 2.0, h = 0.0, kc = 0.0, tau_const = 0.0;
    if (mu_g > 0.0 && d > 0.0)
    {
        v_t = (rho_L - rho_g) * G * d * d / (18.0 * mu_g);
        Re  = rho_g * v_t * d / mu_g;
        const scalar cp_g_mass = cp_air_molar / (MW_air / 1000.0);         // J/(kg·K)
        if (k_g  > 0.0) Pr = cp_g_mass * mu_g / k_g;
        if (Dab  > 0.0) Sc = mu_g / (rho_g * Dab);
        Nu = 2.0 + 0.6 * std::sqrt(Re) * (Pr > 0.0 ? std::cbrt(Pr) : 0.0);
        Sh = 2.0 + 0.6 * std::sqrt(Re) * (Sc > 0.0 ? std::cbrt(Sc) : 0.0);
        if (k_g > 0.0) h  = Nu * k_g / d;                  // W/(m^2·K)
        if (Dab > 0.0) kc = Sh * Dab / d;                  // m/s

        // Constant-rate drying time of one droplet (heat-limited):
        const scalar m_water_drop = (PI / 6.0) * d * d * d * rho_L * (1.0 - x_solid_mass);
        const scalar A_drop       = PI * d * d;
        const scalar dHv_kg       = solv.Hvap_latent(T_wb) / (MW_w / 1000.0);
        const scalar rate_drop    = (dHv_kg > 0.0)
                                  ? h * A_drop * (T_air - T_wb) / dHv_kg : 0.0;
        tau_const = (rate_drop > 0.0) ? m_water_drop / rate_drop : 0.0;     // s
    }

    // -------------------------------------------------------------------
    //  PHASE 2 -- residual moisture (GAB equilibrium + Lewis falling rate).
    //  Phase 1 assumed the powder leaves bone-dry; in reality drying stops
    //  at a residual moisture set by the material's sorption isotherm and
    //  the air humidity.  If the solid carries a `sorption { Xm; C; K; Xc; }`
    //  block (material data) we close X_final (kg water / kg dry solid):
    //    - constant-rate period: X falls from X_in to the critical Xc at
    //      Nc = 6 h ΔT / (ΔHvap ρ_L d x_solid)  [kg/kg per s];
    //    - falling-rate period (Lewis): dX/dt = -k (X - Xe), with k tied to
    //      Nc by continuity at Xc:  k = Nc / (Xc - Xe);
    //    - Xe from GAB at the exhaust-air water activity a_w;
    //    - X_final = X(residenceTime), never below Xe.
    // -------------------------------------------------------------------
    const scalar X_in = (x_solid_mass > 0.0) ? (1.0 - x_solid_mass) / x_solid_mass : 0.0;
    scalar X_final = 0.0, X_eq = 0.0, X_cr = 0.0, a_w = 0.0, t_const = 0.0, k_fall = 0.0;

    // Residence time = chamber height / particle fall velocity --- a RESULT
    // of the chamber HARDWARE (D, L), not a free parameter (the credo).  The
    // particle falls at the gas superficial velocity plus its terminal
    // velocity (co-current); counter-current subtracts.
    scalar v_gas = 0.0, v_particle = 0.0, residence = 0.0;
    if (Dch > 0.0 && Lch > 0.0)
    {
        const scalar A_ch  = PI * Dch * Dch / 4.0;                          // m^2
        const scalar Q_gas = F_air * R * (0.5 * (T_air + T_out)) / P_air;   // m^3/s
        v_gas = Q_gas / A_ch;
        v_particle = (flowDir == "counter")
                   ? std::max(1.0e-4, v_t - v_gas) : v_gas + v_t;
        residence = (v_particle > 0.0) ? Lch / v_particle : 0.0;
    }
    // Drying KINETICS (critical moisture Xc + curve) come from the
    // constant/dryingKinetics library, resolved by the Flowsheet into a
    // `dryingCurve` sub-dict --- kept SEPARATE from the equilibrium sorption
    // isotherm on the material.dat (the split: isotherm vs CDC).
    const bool hasDryCurve = dict->found("dryingCurve");
    if (hasDryCurve)
        X_cr = dict->subDict("dryingCurve")->lookupScalarOrDefault("Xc", 0.0);
    const bool phase2 = sol.hasSorption() && hasDryCurve && X_cr > 0.0
                      && h > 0.0 && residence > 0.0;
    if (phase2)
    {
        // Water activity the powder sees = relative humidity of exhaust air
        // (use the phase-1 fully-evaporated humidity; residual is a tiny
        // correction, so this is not iterated).
        const scalar n_w_ex   = F_air * yAir[iSolv] + n_solv_feed;
        const scalar F_ex     = F_air + n_solv_feed;
        const scalar y_w_ex   = (F_ex > 0.0) ? n_w_ex / F_ex : 0.0;
        const scalar Psat_out = solv.vp().Psat_Pa(T_out);
        a_w = (Psat_out > 0.0) ? std::min(0.99, y_w_ex * P_air / Psat_out) : 0.0;

        // GAB equilibrium moisture Xe(a_w).
        const scalar Xm = sol.sorpXm(), Cg = sol.sorpC(), Kg = sol.sorpK();
        const scalar Ka = Kg * a_w;
        if (Ka < 1.0 && Xm > 0.0)
            X_eq = Xm * Cg * Ka / ((1.0 - Ka) * (1.0 - Ka + Cg * Ka));
        // X_cr already read from the dryingCurve library (kinetics) above.

        // Constant-rate specific drying rate [kg water / kg dry solid / s].
        const scalar dHv_kg = solv.Hvap_latent(T_wb) / (MW_w / 1000.0);
        const scalar Nc = (dHv_kg > 0.0 && d > 0.0 && rho_L > 0.0 && x_solid_mass > 0.0)
            ? 6.0 * h * (T_air - T_wb) / (dHv_kg * d * rho_L * x_solid_mass) : 0.0;
        k_fall = (X_cr > X_eq && Nc > 0.0) ? Nc / (X_cr - X_eq) : 0.0;

        if (X_in > X_cr && Nc > 0.0)
        {
            t_const = (X_in - X_cr) / Nc;
            X_final = (residence <= t_const)
                ? X_in - Nc * residence                              // still constant-rate
              : (k_fall > 0.0
                    ? X_eq + (X_cr - X_eq) * std::exp(-k_fall * (residence - t_const))
                  : X_eq);                                         // falling-rate (Lewis)
        }
        else  // already at/below critical -> straight falling-rate from X_in
        {
            const scalar Xstart = std::max(X_in, X_eq);
            X_final = (k_fall > 0.0)
                ? X_eq + (Xstart - X_eq) * std::exp(-k_fall * residence) : Xstart;
        }
        X_final = std::max(X_final, X_eq);          // cannot dry below equilibrium
    }
    // Residual moisture = the LARGER of the kinetic hold-up (residence time)
    // and the energy floor (solvent the air could not carry to saturation).
    const scalar n_resid_kinetic = X_final * m_solid / MW_w;  // kmol/s
    const scalar n_resid_energy  = energy_limited ? std::max(0.0, n_solv_feed - n_evap_max) : 0.0;
    const scalar n_water_resid   = std::max(n_resid_kinetic, n_resid_energy);  // kmol/s
    const scalar m_water_resid   = n_water_resid * MW_w;      // kg/s held in the powder
    const scalar n_evap          = std::max(0.0, n_solv_feed - n_water_resid);

    // -------------------------------------------------------------------
    //  Particle-size distribution.  Atomisation produces a SPREAD of
    //  droplet sizes, not a single d32; the powder inherits it (each
    //  droplet shrinks by the same factor).  Rosin-Rammler cumulative
    //  mass-below-d:  Q(d) = 1 - exp(-(d/d')^n),  d' ~ d_part
    //  (characteristic size), n = spread (calibratable -> FitParameters).
    // -------------------------------------------------------------------
    const int NB = 15;
    std::vector<scalar> dCen, mf, cum;
    {
        const scalar dLo = 0.2 * d_part, dHi = 3.2 * d_part;
        auto Q = [&](scalar dd){ return (d_part > 0.0)
            ? 1.0 - std::exp(-std::pow(dd / d_part, nRR)) : 0.0; };
        scalar mfSum = 0.0;
        for (int k = 0; k < NB; ++k)
        {
            const scalar a = dLo * std::pow(dHi / dLo, scalar(k)     / NB);
            const scalar b = dLo * std::pow(dHi / dLo, scalar(k + 1) / NB);
            dCen.push_back(std::sqrt(a * b));
            mf.push_back(Q(b) - Q(a));
            mfSum += mf.back();
        }
        if (mfSum > 0.0) for (auto& w : mf) w /= mfSum;       // normalise (tails clipped)
        scalar c = 0.0; for (auto w : mf) { c += w; cum.push_back(c); }
    }
    auto pctile = [&](scalar p) -> scalar
    {
        for (std::size_t k = 0; k < cum.size(); ++k)
            if (cum[k] >= p)
            {
                if (k == 0) return dCen.front();
                const scalar f = (p - cum[k - 1]) / std::max(1.0e-12, cum[k] - cum[k - 1]);
                return dCen[k - 1] + f * (dCen[k] - dCen[k - 1]);
            }
        return dCen.empty() ? d_part : dCen.back();
    };
    const scalar d10 = pctile(0.10), d50 = pctile(0.50), d90 = pctile(0.90);

    // -------------------------------------------------------------------
    //  Outlet streams.
    // -------------------------------------------------------------------
    produced_.clear();

    ProcessStream powder;
    powder.name = "powder";
    // The powder carries its dry solid in s[] AND the residual moisture as
    // bound liquid water in the fluid flow F (vf = 0): mass closes because
    // feed water = evaporated (exhaust) + residual (here).
    powder.T = T_out; powder.P = P_air; powder.vf = 0.0;
    powder.F = n_water_resid;
    powder.z.assign(n, 0.0);
    if (n_water_resid > 0.0) powder.z[iSolv] = 1.0;
    powder.s.assign(n, 0.0); powder.s[iSolid] = n_solid;
    powder.psd.diameter = dCen;          // Rosin-Rammler spread, not a single d32
    powder.psd.massFrac = mf;
    produced_.push_back(powder);

    ProcessStream exhaust;
    exhaust.name = "exhaustAir";
    exhaust.T = T_out; exhaust.P = P_air; exhaust.vf = 1.0;
    sVector nout(n, 0.0);
    for (std::size_t i = 0; i < n; ++i) nout[i] = F_air * yAir[i];
    nout[iSolv] += n_evap;             // only the EVAPORATED water (phase 2: not all of it)
    scalar Fout = 0.0; for (auto v : nout) Fout += v;
    exhaust.F = Fout; exhaust.z.assign(n, 0.0);
    if (Fout > 0.0) for (std::size_t i = 0; i < n; ++i) exhaust.z[i] = nout[i] / Fout;
    produced_.push_back(exhaust);

    // -------------------------------------------------------------------
    //  KPIs.
    // -------------------------------------------------------------------
    const scalar eta_th = (T_air - T_wb > 1.0e-6) ? (T_air - T_out) / (T_air - T_wb) : 0.0;
    kpis_.clear();
    kpis_["T_out"]            = T_out;            // K  (exhaust air)
    kpis_["T_wetbulb"]        = T_wb;             // K  (droplet surface)
    kpis_["water_evaporated"] = n_evap * MW_w;    // kg/s (feed water minus residual)
    kpis_["water_residual"]   = m_water_resid;    // kg/s held in the powder
    kpis_["powder_flow"]      = m_solid + m_water_resid;   // kg/s (dry solid + moisture)
    kpis_["powder_dry"]       = m_solid;          // kg/s dry solid only
    kpis_["d_droplet"]        = d32;              // m
    kpis_["d_droplet_micron"] = d32 * 1.0e6;
    kpis_["d_particle"]       = d_part;           // m
    kpis_["d_particle_micron"]= d_part * 1.0e6;
    kpis_["solidMassFraction"]= x_solid_mass;
    kpis_["v_terminal"]       = v_t;              // m/s
    kpis_["Re"]               = Re;
    kpis_["Pr"]               = Pr;
    kpis_["Sc"]               = Sc;
    kpis_["Nu"]               = Nu;
    kpis_["Sh"]               = Sh;
    kpis_["h"]                = h;                // W/(m^2·K)
    kpis_["k_c"]              = kc;               // m/s
    kpis_["tau_dry_constant"] = tau_const;        // s
    kpis_["duty"]             = Q;                // W (latent+sensible to evaporate)
    kpis_["thermalEfficiency"]= eta_th;           // adiabatic-saturation efficiency
    kpis_["rho_liquid"]       = rho_L;
    kpis_["rho_gas"]          = rho_g;
    kpis_["d10_micron"]       = d10 * 1.0e6;      // 10 % undersize
    kpis_["d50_micron"]       = d50 * 1.0e6;      // median
    kpis_["d90_micron"]       = d90 * 1.0e6;      // 90 % undersize
    kpis_["span"]             = (d50 > 0.0) ? (d90 - d10) / d50 : 0.0;  // distribution width
    // Phase-2 moisture (kg water / kg dry solid unless noted):
    kpis_["X_initial"]        = X_in;
    kpis_["X_critical"]       = X_cr;
    kpis_["X_equilibrium"]    = X_eq;
    kpis_["X_final"]          = X_final;
    kpis_["moisture_pct_wb"]  = 100.0 * X_final / (1.0 + X_final);   // wet-basis %
    kpis_["water_activity"]   = a_w;
    kpis_["residenceTime"]    = residence;        // s  (RESULT of chamber geometry)
    kpis_["t_constant_rate"]  = t_const;
    kpis_["chamberDiameter"]  = Dch;              // m  (HARDWARE)
    kpis_["chamberHeight"]    = Lch;              // m  (HARDWARE)
    kpis_["v_gas"]            = v_gas;            // m/s superficial gas velocity
    kpis_["v_particle"]       = v_particle;       // m/s particle fall velocity

    // -------------------------------------------------------------------
    //  Profile: the powder PSD (mass fraction vs particle diameter) for
    //  the GUI's ProfilePlot (log diameter axis, like the cyclone).
    // -------------------------------------------------------------------
    UnitProfile prof;
    prof.xAxis = "diameter_micron";
    std::vector<scalar> dmic; dmic.reserve(dCen.size());
    for (auto dd : dCen) dmic.push_back(dd * 1.0e6);
    prof.columns["diameter_micron"] = dmic;
    prof.columns["massFrac"]        = mf;
    profile_ = prof;

    // -------------------------------------------------------------------
    //  Report.
    // -------------------------------------------------------------------
    if (verbosity >= 2)
    {
        std::cout << "\n=========================  Spray Dryer Result  ===================\n"
                  << "  Atomiser (HARDWARE): wheel D = " << std::fixed << std::setprecision(3)
                  << Ddisk << " m,  N = " << std::setprecision(0) << Nrpm << " rpm\n"
                  << "  Air in:  " << std::setprecision(1) << T_air << " K ("
                  << (T_air - 273.15) << " °C),  " << std::scientific << std::setprecision(3)
                  << (F_air * 1000.0) << " mol/s\n"
                  << "  Feed:    " << std::fixed << std::setprecision(1) << T_feed << " K, "
                  << std::scientific << std::setprecision(3) << (m_feed) << " kg/s, "
                  << std::fixed << std::setprecision(1) << (100.0 * x_solid_mass) << " wt% solid\n"
                  << "  ----  mass + energy  ----\n"
                  << "  Water evaporated = " << std::scientific << std::setprecision(3)
                  << (n_evap * MW_w) << " kg/s   Powder (dry) = " << m_solid << " kg/s\n"
                  << "  Droplet wet-bulb T_wb = " << std::fixed << std::setprecision(1)
                  << T_wb << " K (" << (T_wb - 273.15) << " °C)\n"
                  << "  Exhaust air  T_out   = " << std::setprecision(1) << T_out
                  << " K (" << (T_out - 273.15) << " °C),  η_th = "
                  << std::setprecision(2) << eta_th << "\n"
                  << "  ----  atomisation (Friedman)  ----\n"
                  << "  Surface tension sigma = " << std::scientific << std::setprecision(4)
                  << sigma << " N/m  [" << sigmaSource << "]\n"
                  << std::fixed
                  << "  Droplet d32 = " << std::setprecision(1) << (d32 * 1.0e6)
                  << " µm  ->  particle d_p = " << (d_part * 1.0e6) << " µm\n"
                  << "  Powder PSD (Rosin-Rammler, n = " << std::setprecision(1) << nRR
                  << "):  d10 = " << (d10 * 1.0e6) << "  d50 = " << (d50 * 1.0e6)
                  << "  d90 = " << (d90 * 1.0e6) << " µm  (span = "
                  << std::setprecision(2) << ((d50 > 0.0) ? (d90 - d10) / d50 : 0.0) << ")\n"
                  << "  ----  drying kinetics (Ranz-Marshall)  ----\n";
        if (mu_g > 0.0)
            std::cout << "  v_t = " << std::setprecision(3) << v_t << " m/s,  Re = "
                      << std::setprecision(2) << Re << ",  Pr = " << Pr << ",  Sc = " << Sc << "\n"
                      << "  Nu = " << Nu << " -> h = " << std::setprecision(1) << h
                      << " W/(m²·K);  Sh = " << std::setprecision(2) << Sh
                      << " -> k_c = " << std::scientific << std::setprecision(3) << kc << " m/s\n"
                      << "  Constant-rate drying time τ = " << std::fixed << std::setprecision(4)
                      << tau_const << " s\n";
        else
            std::cout << "  (no transport block -> drying coefficients not computed;"
                         " add transport { thermalConductivity{} diffusivity{} })\n";
        if (Dch > 0.0 && Lch > 0.0)
            std::cout << "  ----  chamber (HARDWARE) -> residence time  ----\n"
                      << "  D_chamber = " << std::fixed << std::setprecision(2) << Dch
                      << " m,  L_chamber = " << Lch << " m,  " << flowDir << "-current\n"
                      << "  v_gas = " << std::setprecision(3) << v_gas << " m/s + v_terminal = "
                      << v_t << " m/s  ->  residence = " << std::setprecision(2)
                      << residence << " s\n";
        if (phase2)
            std::cout << "  ----  residual moisture (GAB + Lewis falling rate)  ----\n"
                      << "  X_in = " << std::fixed << std::setprecision(3) << X_in
                      << "  ->  X_crit = " << X_cr << "  ->  X_eq(a_w=" << std::setprecision(3)
                      << a_w << ") = " << X_eq << " kg/kg\n"
                      << "  Residence " << std::setprecision(2) << residence
                      << " s (constant-rate ends at " << std::setprecision(3) << t_const
                      << " s)  ->  X_final = " << X_final << " kg/kg  ("
                      << std::setprecision(2) << (100.0 * X_final / (1.0 + X_final))
                      << " wt% wet basis)\n"
                      << "  Powder = " << std::scientific << std::setprecision(3)
                      << (m_solid + m_water_resid) << " kg/s  (" << m_solid << " dry + "
                      << m_water_resid << " moisture)\n";
        else
            std::cout << "  (no `sorption {}` block on the solid -> phase-1 dry powder)\n";
        std::cout << "==================================================================\n\n";
    }

    return rwb.converged ? 0 : 1;
}

} // namespace Choupo
