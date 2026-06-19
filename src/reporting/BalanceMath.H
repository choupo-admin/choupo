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
File
    src/reporting/BalanceMath.H

Description
    Small shared helpers behind the mass / energy balance reports so the
    CSV writers and the ODS spreadsheet report compute identical numbers
    from one source of truth.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"
#include "streams/ProcessStream.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/flash/IsothermalFlash.H"   // solveCore: two-phase split enthalpy

#include <cmath>
#include <optional>
#include <set>
#include <string>
#include <vector>

namespace Choupo {
namespace reporting {

// Per-component mass flow [kg/h] of a stream: F[kmol/s]*z_i*MW_i*3600.
inline std::vector<scalar> componentMassFlow(const ProcessStream& s,
                                             const ThermoPackage& thermo)
{
    const std::size_t n = thermo.n();
    std::vector<scalar> m(n, 0.0);
    for (std::size_t i = 0; i < n; ++i)
    {
        const scalar zi = (i < s.z.size()) ? s.z[i] : 0.0;
        m[i] = s.F * zi * thermo.comp(i).MW() * 3600.0;
        // Solid phase: the particulate carried in s[i] adds to the
        // component mass flow so balances close over the solid too.
        if (i < s.s.size())
            m[i] += s.s[i] * thermo.comp(i).MW() * 3600.0;
    }
    return m;
}

// closure % = 100 * out / in   (deviation from 100 is the closure error).
inline scalar closurePct(scalar in, scalar out)
{
    return (std::abs(in) > 1.0e-30) ? 100.0 * out / in : 0.0;
}

// Curated set of KPI names that are genuine energy-balance ITEMS (heat
// supplied/removed, shaft work), signed as energy ADDED to the process
// streams (+ in, - out).  Used to list a unit's energy items on the balance
// sheet and to close the energy balance against the stream enthalpy change.
// Deliberately EXCLUDES diagnostics (e.g. W_isen_kW) so nothing double-
// counts; a unit adds itself here by exposing one of these KPIs.
inline bool isEnergyItemKpi(const std::string& k)
{
    static const std::set<std::string> items = {
        "Q_kW", "duty_kW", "Q_reboiler_kW", "Q_condenser_kW",
        "W_shaft_kW", "W_hydraulic_kW", "Q_removed_kW"
    };
    return items.count(k) > 0;
}


// Which enthalpy datum a per-unit energy balance was computed on.
enum class EnergyRef { Elements, Sensible, None };

// Per-unit energy balance result.  `ref` records which datum was used
// (and therefore whether the heat of reaction is INCLUDED).
struct UnitEnergy
{
    scalar    hIn  = 0.0;   // kW
    scalar    hOut = 0.0;   // kW
    EnergyRef ref  = EnergyRef::None;
};

// A genuinely two-phase stream (0<vf<1) carries the enthalpy of its equilibrium
// PHASES (split), not the blend-by-z that H_stream*(T,P,vf,z) / the vf>=0.5
// liquid-or-vapour pick returns --- the two differ by the latent heat of
// separation, which would otherwise show as a phantom dH next to a Q=0 flash.
// Returns the (vf, x, y) split, or nullopt if the stream is single-phase or the
// package has no vapour phase (LL-only).
inline std::optional<FlashSolution> streamSplit(const ProcessStream& s,
                                                const ThermoPackage& thermo)
{
    if (!(s.vf > 1.0e-9 && s.vf < 1.0 - 1.0e-9)) return std::nullopt;
    if (thermo.phasesOfType("vapor").empty())    return std::nullopt;
    FlashInput fin; fin.F = 1.0; fin.T = s.T; fin.P = s.P; fin.z = s.z;
    FlashOptions fopts; fopts.verbosity = 0;
    const FlashSolution fs = IsothermalFlash::solveCore(fin, thermo, fopts);
    if (fs.converged && fs.V_over_F > 1.0e-9 && fs.V_over_F < 1.0 - 1.0e-9)
        return fs;
    return std::nullopt;
}

// ELEMENTS reference (carries Hf -> reaction heat shows up).  nullopt if
// any component lacks gibbsFormation / Watson data.
inline std::optional<scalar> streamH_elements(const ProcessStream& s,
                                              const ThermoPackage& thermo)
{
    try {
        if (auto sp = streamSplit(s, thermo))
        {
            const scalar h =
                (1.0 - sp->V_over_F) * thermo.H_stream_formation(s.T, s.P, 0.0, sp->x)
              +        sp->V_over_F  * thermo.H_stream_formation(s.T, s.P, 1.0, sp->y);
            return s.F * h;
        }
        return s.F * thermo.H_stream_formation(s.T, s.P, s.vf, s.z);
    }
    catch (const std::exception&) { return std::nullopt; }
}

// SENSIBLE+latent reference (per-component zero; no Hf).  nullopt if the
// thermo lacks liquid Cp (permanent gases).
inline std::optional<scalar> streamH_sensible(const ProcessStream& s,
                                              const ThermoPackage& thermo,
                                              scalar Tref)
{
    try {
        if (auto sp = streamSplit(s, thermo))
        {
            const scalar h =
                (1.0 - sp->V_over_F) * thermo.Hliquid(s.T, sp->x, Tref)
              +        sp->V_over_F  * thermo.Hvapour(s.T, sp->y, Tref);
            return s.F * h;
        }
        const scalar h = (s.vf >= 0.5)
            ? thermo.Hvapour(s.T, s.z, Tref)
          : thermo.Hliquid(s.T, s.z, Tref);
        return s.F * h;
    } catch (const std::exception&) { return std::nullopt; }
}

// Energy balance over a unit, using ONE consistent datum for all its
// streams: try elements first (correct across reactors); if any stream
// lacks Hf, retry the whole unit on the sensible datum; None if even
// that fails.  Null entries in ins/outs are skipped.
inline UnitEnergy unitEnergyBalance(const std::vector<const ProcessStream*>& ins,
    const std::vector<const ProcessStream*>& outs,
    const ThermoPackage& thermo, scalar Tref)
{
    auto tryDatum = [&](bool elements) -> std::optional<UnitEnergy> {
        UnitEnergy u;
        u.ref = elements ? EnergyRef::Elements : EnergyRef::Sensible;
        for (const auto* s : ins)
        {
            if (!s) continue;
            auto h = elements ? streamH_elements(*s, thermo)
                            : streamH_sensible(*s, thermo, Tref);
            if (!h) return std::nullopt;
            u.hIn += *h;
        }
        for (const auto* s : outs)
        {
            if (!s) continue;
            auto h = elements ? streamH_elements(*s, thermo)
                            : streamH_sensible(*s, thermo, Tref);
            if (!h) return std::nullopt;
            u.hOut += *h;
        }
        return u;
    };

    if (auto u = tryDatum(/*elements=*/true))  return *u;
    if (auto u = tryDatum(/*elements=*/false)) return *u;
    return UnitEnergy{};   // ref = None
}

} // namespace reporting
} // namespace Choupo
