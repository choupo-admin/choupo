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
