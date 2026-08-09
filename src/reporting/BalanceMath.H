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

#include "result/SimulationResult.H"
#include "core/Types.H"
#include "thermo/ElementComposition.H"
#include "core/Advisory.H"
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
    // PARTIAL: every species resolved, but at least one only through a
    // declared composition with unaccounted mass -- the declared elements
    // are usable; no COMPLETE elemental closure may be stamped.
    bool                                             partial = false;
    std::vector<std::pair<std::string, scalar>>      partialSpecies;
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
        const auto er = elementalCompositionOf(thermo.comp(i));
        if (er.completeness == ElementalResolution::Completeness::unavailable)
        {
            out.refusedSpecies.emplace_back(thermo.comp(i).name(), er.reason);
            continue;
        }
        if (er.completeness == ElementalResolution::Completeness::partial)
        {
            out.partial = true;
            out.partialSpecies.emplace_back(thermo.comp(i).name(),
                                            er.unaccountedMassFraction);
        }
        for (const auto& [sym, na] : er.atoms)
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
    //  R-E5 (2026-08-09, docs/design/tp-stream-energy-coherence.md): ONE
    //  stream-H convention.  The unit duty resolves an UNPINNED stream at its
    //  own (T, P, z) before pricing it; this report must obtain H the same way
    //  or the two disagree by exactly the latent share -- which is what
    //  flash19's 101.17 % closure was, and what slice 2 would otherwise have
    //  inverted (unit 0, report 13.49).  A stream a unit produced is unpinned
    //  too, and re-flashing it is IDEMPOTENT: the unit already resolved that
    //  state, so the split comes back as the unit left it.  A PINNED stream
    //  keeps its declared reading, split only where the pin is a saturation
    //  quality (0 < q < 1).
    const bool resolvable = s.phasePinned
        ? (s.vf > 1.0e-9 && s.vf < 1.0 - 1.0e-9)
        : true;
    if (!resolvable)                             return std::nullopt;
    if (thermo.phasesOfType("vapor").empty())    return std::nullopt;
    FlashInput fin; fin.F = 1.0; fin.T = s.T; fin.P = s.P; fin.z = s.z;
    FlashOptions fopts; fopts.verbosity = 0;
    FlashSolution fs;
    try
    {
        fs = IsothermalFlash::solveCore(fin, thermo, fopts);
    }
    catch (const std::exception& ex)
    {
        //  A STREAM WHOSE OWN EQUILIBRIUM THE PACKAGE WILL NOT RESOLVE still
        //  has a defined enthalpy under the state it carries -- and refusing
        //  the whole balance over it would report NOTHING about a unit whose
        //  energy is perfectly computable (flash19's vapour outlet carries no
        //  Ca, so the reactive package refuses to speciate it at all).  Price
        //  what the stream carries, and SAY SO: an announced fall-back is a
        //  reading the student can check, a silent one is the crutch.
        AdvisoryLog::instance().add(
            "energyBalance", "info", "stream '" + s.name + "'",
            "priced on the state it CARRIES (vf = " + std::to_string(s.vf)
            + "): its own equilibrium at (T, P, z) could not be resolved -- "
            + ex.what());
        return std::nullopt;
    }
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

//  MOVED to `thermo/EnthalpyDatum.H` (debt D7, 2026-08-05).  It was the
//  last upward edge in the subsystem graph: `Flowsheet.cpp` included THIS
//  header to reach that one function.  §3 had already ruled it a thermo
//  query wearing a reporting jacket.

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
        //  A RESOLVED STATE MAY CARRY CRYSTALS THE STREAM FILE DOES NOT.
        //  `sp->x` is the APPARENT liquid -- any precipitate resolved here is
        //  still inside it, priced as dissolved -- so each such mole moves onto
        //  the solid formation rung, exactly as the unit duty does (R-E3/R-E5).
        //  Without it, an unpinned feed whose own equilibrium precipitates is
        //  priced dissolved while the outlet is priced crystalline, and the
        //  balance reads the RUNG DIFFERENCE as a duty (flash19: 0.1557 kW,
        //  against a unit that now correctly reports zero).  Amounts are on
        //  the resolution's F = 1 basis, so they scale by s.F.
        sVector e(thermo.n(), 0.0);
        for (std::size_t i = 0; i < sp->solidFlows.size() && i < thermo.n(); ++i)
        {
            const scalar s_i = s.F * sp->solidFlows[i];
            if (s_i <= 0.0) continue;
            e.assign(thermo.n(), 0.0);
            e[i] = 1.0;
            H += s_i * (thermo.comp(i).h_formation(s.T, "solid")
                        - thermo.H_liquid_formation(s.T, e));
        }
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
