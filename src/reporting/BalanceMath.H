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

#include "core/SimulationResult.H"
#include "core/Types.H"
#include "thermo/ElementComposition.H"
#include "streams/ProcessStream.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/flash/IsothermalFlash.H"   // solveCore: two-phase split enthalpy

#include <cmath>
#include <map>
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

// The plant-boundary ELEMENT aggregation -- ONE routine shared by the
// elementBalance report and the spreadsheet sheet (never duplicated).
// Feeds/products come from the caller's topology; per-component boundary
// flow is fluid F*z + particulate s[] (both kmol/s); atoms come from THE
// shared parser.  Refusals are STATES: a species whose formula refuses,
// or a declared boundary stream missing from the result, withholds the
// claim naming itself -- never a silent zero.
struct ElementBoundaryBalance
{
    bool                                             available = false;
    std::vector<std::pair<std::string, std::string>> refusedSpecies;
    std::vector<std::string>                         missingStreams;
    std::map<std::string, scalar>                    elemIn;    // kmol-atom/s
    std::map<std::string, scalar>                    elemOut;   // kmol-atom/s
};

inline ElementBoundaryBalance elementBoundaryBalance(
    const std::set<std::string>& feeds,
    const std::set<std::string>& products,
    const SimulationResult&      result,
    const ThermoPackage&         thermo)
{
    ElementBoundaryBalance out;
    const std::size_t n = thermo.n();
    auto molarFlow = [&](const ProcessStream& s)
    {
        std::vector<scalar> v(n, 0.0);
        for (std::size_t i = 0; i < n; ++i)
        {
            v[i] = s.F * ((i < s.z.size()) ? s.z[i] : 0.0);
            if (i < s.s.size()) v[i] += s.s[i];
        }
        return v;
    };
    std::vector<scalar> molIn(n, 0.0), molOut(n, 0.0);
    auto accumulate = [&](const std::set<std::string>& names,
                          std::vector<scalar>& acc)
    {
        for (const auto& nm : names)
        {
            auto it = result.streams.find(nm);
            if (it == result.streams.end())
            {
                // A declared boundary stream with no state is a WITHHELD
                // claim, never a silent zero in a conservation diagnostic.
                out.missingStreams.push_back(nm);
                continue;
            }
            const auto v = molarFlow(it->second);
            for (std::size_t i = 0; i < n; ++i) acc[i] += v[i];
        }
    };
    accumulate(feeds, molIn);
    accumulate(products, molOut);

    for (std::size_t i = 0; i < n; ++i)
    {
        if (molIn[i] == 0.0 && molOut[i] == 0.0) continue;   // not present
        const auto ec = parseElementalFormula(thermo.comp(i).formula());
        if (!ec.available)
        {
            out.refusedSpecies.emplace_back(thermo.comp(i).name(), ec.reason);
            continue;
        }
        for (const auto& [sym, na] : ec.atoms)
        {
            out.elemIn[sym]  += na * molIn[i];
            out.elemOut[sym] += na * molOut[i];
        }
    }
    // The row set is the UNION of in/out elements: an element CREATED only
    // on the product side (a chemically wrong operation -- the gravest
    // error this diagnostic exists to catch) must appear, with in = 0.
    for (const auto& [sym, v] : out.elemOut)
    { (void) v; if (!out.elemIn.count(sym)) out.elemIn[sym] = 0.0; }
    for (const auto& [sym, v] : out.elemIn)
    { (void) v; if (!out.elemOut.count(sym)) out.elemOut[sym] = 0.0; }

    out.available = out.refusedSpecies.empty() && out.missingStreams.empty();
    return out;
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
        "W_shaft_kW", "W_hydraulic_kW", "Q_removed_kW",
        "Q_regeneration_kW", "Q_adsorption_cooling_kW"
    };
    return items.count(k) > 0;
}

// A duty KPI whose heat is delivered to the process THROUGH the unit's own
// heating-medium streams (steam in / condensate out), which appear in the
// unit's ins/outs.  That medium's enthalpy drop is ALREADY counted as a
// stream item in the energy balance, so summing the KPI on top double-counts
// it (the old "2131 % closure" on the evaporator).  Such a duty is INTERNAL
// to the unit's stream ledger -- kept as a sizing/economy KPI but NOT an
// external boundary item.  Today this is exactly the evaporator's `duty_kW`
// (its chest steam + condensate are always streams); a bare `Q_kW`,
// `Q_reboiler_kW`, `Q_condenser_kW` (flash / heater / column) has NO stream
// medium and so IS a genuine boundary item.
inline bool isInternalMediumDutyKpi(const std::string& k)
{
    return k == "duty_kW";
}


// Which enthalpy datum a per-unit energy balance was computed on.  There is
// only ONE datum -- the elements reference (Hf, 25 C) -- so the heat of
// reaction always shows up in h_out - h_in; `None` means the unit carries no
// stream-enthalpy data at all (e.g. a pure energy node).  The old `Sensible`
// fallback was deleted (Vitor's law: elements-only, throw-on-gap, never a
// silent second datum that drops the reaction heat).
enum class EnergyRef { Elements, None };

// Per-unit energy balance result, all on the elements datum.  `hIn`/`hOut`
// carry the PROCESS streams; `qBoundary` is the heat delivered to the process
// through the unit's UTILITY streams (steam/condensate etc.) -- the utility
// enthalpy drop, signed + into the process.  Closing the balance compares the
// process dH against qBoundary plus any genuine external duty KPI.
struct UnitEnergy
{
    scalar    hIn       = 0.0;   // kW, process inlets
    scalar    hOut      = 0.0;   // kW, process outlets
    scalar    qBoundary = 0.0;   // kW, heat in via utility streams (in - out)
    int       nProcIn   = 0;     // # process (non-utility) inlets
    int       nProcOut  = 0;     // # process (non-utility) outlets
    EnergyRef ref       = EnergyRef::None;
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

// Enthalpy [kW] carried by the CRYSTALLINE phase (the per-component molar
// array s.s[], kmol/s) on the ELEMENTS datum: Σ s.s[i]·h°_i(solid, T) =
// Σ s.s[i]·(Hf_crystal,i + ∫_298^T cp_solid,i dT').  This is the SAME solid
// formation leg the crystalliser / Component use (h_formation(T,"solid")).
// Without it the energy balance silently DROPS the crystals it just made --
// the +677 kW non-closure on the sugar crystalliser -- even though the MASS
// balance counts them (componentMassFlow reads s.s[] at :65).  Throws (naming
// the species) only if a crystallising species lacks the solid formation datum
// -- a real curation gap on the elements datum, NOT papered over by a fallback.
inline scalar solidH_elements(const ProcessStream& s, const ThermoPackage& thermo)
{
    scalar h = 0.0;
    for (std::size_t i = 0; i < s.s.size() && i < thermo.n(); ++i)
        if (s.s[i] > 0.0)
            h += s.s[i] * thermo.comp(i).h_formation(s.T, "solid");
    return h;   // kW  (s.s [kmol/s] x h_formation [J/mol == kJ/kmol] = kW)
}

// The PRESENT components of a stream (z_i > 0 or s_i > 0) that have NO
// elements-datum enthalpy route -- the genuine missing-DATA gap the energy
// balance must REFUSE on, named for the student.  Composition-absent species
// (z_i = 0 AND s_i = 0) are deliberately NOT listed: their skip is legitimate
// physics (the silent path is correct for them).  Empty result => every
// present species is placeable on the elements datum, so the stream's
// enthalpy is trustworthy.  This is the no-silent-crutch boundary: a present
// species without a datum is a refusal, not a quiet drop.
inline std::vector<std::string> missingEnthalpyData(const ProcessStream& s,
                                                    const ThermoPackage& thermo)
{
    std::vector<std::string> miss;
    for (std::size_t i = 0; i < thermo.n(); ++i)
    {
        const scalar zi = (i < s.z.size()) ? s.z[i] : 0.0;
        const scalar si = (i < s.s.size()) ? s.s[i] : 0.0;
        if (zi <= 0.0 && si <= 0.0) continue;        // absent by composition
        if (!thermo.hasEnthalpyDatum(i)) miss.push_back(thermo.comp(i).name());
    }
    return miss;
}

// ELEMENTS reference (carries Hf -> reaction heat shows up) -- the ONE datum.
// The fluid phase (s.z) plus the crystalline phase (s.s[]) are BOTH counted so
// the balance closes over the crystals exactly as the mass balance does.
//
// Absent species (z_i <= 0) are skipped by COMPOSITION inside the thermo
// kernels (H_ig / H_liquid_formation / solidH_elements), never by swallowing
// an exception.  A PRESENT species with no phase path on the elements datum is
// a real data gap -> the kernel THROWS naming the component, and that throw is
// allowed to propagate (Vitor's law: throw-on-gap, never a silent downgrade to
// a second datum that would drop the reaction heat).
inline scalar streamH_elements(const ProcessStream& s,
                               const ThermoPackage& thermo)
{
    scalar H;
    if (auto sp = streamSplit(s, thermo))
    {
        const scalar h =
            (1.0 - sp->V_over_F) * thermo.H_stream_formation(s.T, s.P, 0.0, sp->x)
          +        sp->V_over_F  * thermo.H_stream_formation(s.T, s.P, 1.0, sp->y);
        H = s.F * h;
    }
    else
        H = s.F * thermo.H_stream_formation(s.T, s.P, s.vf, s.z);
    return H + solidH_elements(s, thermo);
}

// Energy balance over a unit on the ELEMENTS datum (the only datum).  Process
// streams (no `category`) accumulate into hIn/hOut; UTILITY streams (a steam /
// condensate medium, carrying a `category`) accumulate into qBoundary as the
// heat delivered to the process = (utility H in) - (utility H out).  Null
// entries in ins/outs are skipped.  `None` only when the unit resolves to no
// streams at all (a pure energy node); any present species lacking elements
// data throws (it is NOT papered over by a sensible fallback any more).
inline UnitEnergy unitEnergyBalance(const std::vector<const ProcessStream*>& ins,
    const std::vector<const ProcessStream*>& outs,
    const ThermoPackage& thermo, scalar /*Tref*/)
{
    UnitEnergy u;
    bool any = false;
    for (const auto* s : ins)
    {
        if (!s) continue;
        any = true;
        const scalar h = streamH_elements(*s, thermo);
        if (s->category.empty()) { u.hIn += h; ++u.nProcIn; }
        else                       u.qBoundary += h;   // utility supplies heat in
    }
    for (const auto* s : outs)
    {
        if (!s) continue;
        any = true;
        const scalar h = streamH_elements(*s, thermo);
        if (s->category.empty()) { u.hOut += h; ++u.nProcOut; }
        else                       u.qBoundary -= h;    // utility carries heat out
    }
    u.ref = any ? EnergyRef::Elements : EnergyRef::None;
    return u;
}

} // namespace reporting
} // namespace Choupo
