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

#include "thermo/pureFluid/PureFluidModel.H"
#include "thermo/pureFluid/IF97WaterFluid.H"
#include "thermo/iapws/IF97.H"
#include "thermo/iapws/IAPWSTransport.H"

#include <algorithm>
#include <stdexcept>

namespace Choupo {

// ===========================================================================
//  IF97WaterFluid -- the unit bridge over the frozen kernel
// ===========================================================================
//
// Kernel table units -> Choupo per-mole units.  MW in g/mol (== kg/kmol):
//   h[J/mol]  = h[kJ/kg]  * MW          s,cp  same factor
//   v[m³/mol] = v[m³/kg]  * MW / 1000

scalar IF97WaterFluid::h_molar(scalar T_K, scalar p_Pa) const
{
    return IF97::props(p_Pa, T_K).h * mw_;
}

scalar IF97WaterFluid::s_molar(scalar T_K, scalar p_Pa) const
{
    return IF97::props(p_Pa, T_K).s * mw_;
}

scalar IF97WaterFluid::v_molar(scalar T_K, scalar p_Pa) const
{
    return IF97::props(p_Pa, T_K).v * mw_ / 1000.0;
}

scalar IF97WaterFluid::cp_molar(scalar T_K, scalar p_Pa) const
{
    return IF97::props(p_Pa, T_K).cp * mw_;
}

scalar IF97WaterFluid::p_sat(scalar T_K) const
{
    return IF97::psat(T_K);   // region 4, [Pa]
}

scalar IF97WaterFluid::T_sat(scalar p_Pa) const
{
    return IF97::Tsat(p_Pa);  // region 4 inverse, closed form, [K]
}

// --- Transport: (T,p) -> density from IF97, then the IAPWS transport kernels.
//     The contract is (T,p); the (rho,T) dependence of the R12-08/R15-11
//     kernels is an internal detail bridged here via IF97::props(p,T).rho.

scalar IF97WaterFluid::mu(scalar T_K, scalar p_Pa) const
{
    const scalar rho = IF97::props(p_Pa, T_K).rho;     // kg/m3
    return IAPWSTransport::mu(rho, T_K);               // Pa.s (R12-08, mu2 off)
}

scalar IF97WaterFluid::lambda(scalar T_K, scalar p_Pa) const
{
    const scalar rho = IF97::props(p_Pa, T_K).rho;     // kg/m3
    return IAPWSTransport::lambda(rho, T_K);           // W/(m.K) (R15-11, bg)
}

scalar IF97WaterFluid::sigma(scalar T_K) const
{
    return IAPWSTransport::sigma(T_K);                 // N/m (R1-76, sat line)
}

double IF97WaterFluid::verify() const
{
    // ONE number guards the whole IAPWS-water stack: the frozen IF97
    // thermodynamic kernel AND the IAPWS transport kernels (R12-08 mu,
    // R15-11 lambda, R1-76 sigma).  Worst relative deviation wins.
    return std::max(IF97::verify(), IAPWSTransport::verify());
}

// ===========================================================================
//  PureFluidModel base -- transport defaults (THROW: no universal fallback)
// ===========================================================================

scalar PureFluidModel::mu(scalar, scalar) const
{
    throw std::runtime_error(
        "PureFluidModel '" + type() + "': no viscosity formulation -- this "
        "pure-fluid kernel does not ship a transport release.");
}

scalar PureFluidModel::lambda(scalar, scalar) const
{
    throw std::runtime_error(
        "PureFluidModel '" + type() + "': no thermal-conductivity formulation "
        "-- this pure-fluid kernel does not ship a transport release.");
}

scalar PureFluidModel::sigma(scalar) const
{
    throw std::runtime_error(
        "PureFluidModel '" + type() + "': no surface-tension formulation -- "
        "this pure-fluid kernel does not ship a transport release.");
}

// ===========================================================================
//  PureFluidModel base -- default T_sat (bisection inverse of p_sat)
// ===========================================================================
//
// Any kernel that exposes only p_sat(T) gets a usable Tsat(p) for free.
// IF97 overrides this with its closed-form region-4 quadratic; this default
// exists so a future pure-fluid kernel need only supply p_sat.
scalar PureFluidModel::T_sat(scalar p_Pa) const
{
    scalar lo = 200.0, hi = 1000.0;   // generous bracket (sub-triple .. super-Tc)
    for (int it = 0; it < 80; ++it)
    {
        const scalar mid = 0.5 * (lo + hi);
        if (p_sat(mid) < p_Pa) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
}

// ===========================================================================
//  Explicit factory (no auto-registration macros)
// ===========================================================================

std::map<std::string, PureFluidModel::Factory>& PureFluidModel::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void PureFluidModel::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<PureFluidModel>
PureFluidModel::New(const DictPtr& dict, scalar MW_g_per_mol)
{
    const std::string method = dict->lookupWord("method");
    auto it = registry().find(method);
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry())
            avail += (avail.empty() ? "" : ", ") + kv.first;
        throw std::runtime_error(
            "PureFluidModel::New: unknown method '" + method
            + "' -- available: " + avail);
    }
    return it->second(dict, MW_g_per_mol);
}

std::vector<std::string> PureFluidModel::availableTypes()
{
    std::vector<std::string> out;
    for (const auto& kv : registry()) out.push_back(kv.first);
    return out;
}

void PureFluidModel::registerBuiltins()
{
    registerType("IF97",
        [](const DictPtr&, scalar mw) -> std::unique_ptr<PureFluidModel>
        { return std::make_unique<IF97WaterFluid>(mw); });
}

} // namespace Choupo
