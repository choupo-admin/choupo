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
#include "streams/StreamMass.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/flash/IsothermalFlash.H"   // solveCore: two-phase split enthalpy
#include "unitOperations/flash/StreamEquilibrium.H" // the ONE resolve-and-price home

#include <algorithm>
#include <cmath>
#include <map>
#include <optional>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {
namespace reporting {

// Per-component mass flow [kg/h] of a stream: F[kmol/s]*z_i*MW_i*3600, plus
// the crystals in s[i].  THE FUNCTION MOVED DOWN to `streams/StreamMass.H`
// (2026-09-08), beside the two total-mass views it belongs with, so a reader
// BELOW `reporting` can call it instead of writing the loop again -- the
// declared-utility circuit check compares two streams component by component
// from band 3.  This alias keeps the `reporting::componentMassFlow` spelling
// every balance surface already uses, pointing at the one home.
using Choupo::componentMassFlow;

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

//  WHICH SIDE OF THE FIRST LAW AN ENERGY ITEM IS ON (2026-09-12).
//
//  The steady-flow energy equation a student writes is  dH = Q - W, and the
//  two terms on the right are not interchangeable: heat crosses a boundary
//  down a temperature difference, work leaves through a shaft.  The engine
//  published only their SUM (`Q_boundary_kW`), so nothing downstream could
//  draw the equation -- and a figure that cannot separate Q from W cannot be
//  the first law, it can only be its total.
//
//  `Heat` and `Work` are the whole vocabulary, deliberately.  There is NO
//  catch-all: the map below IS the set of energy items (see
//  `isEnergyItemKpi`), so a KPI cannot become an energy item without a human
//  saying which side of the equation it is on.  An item that is genuinely
//  neither is a decision for a maintainer, not a default bucket that
//  quietly absorbs it -- the shape the 2026-08-05 arity slice found in the
//  reaction `order` (five readers, five defaults, a silent zero).
enum class EnergyItemKind { Heat, Work };

// Curated set of KPI names that are genuine energy-balance ITEMS (heat
// supplied/removed, shaft work), signed as energy ADDED to the process
// streams (+ in, - out).  Used to list a unit's energy items on the balance
// sheet and to close the energy balance against the stream enthalpy change.
// Deliberately EXCLUDES diagnostics (e.g. W_isen_kW) so nothing double-
// counts; a unit adds itself here by exposing one of these KPIs.
//
//  ONE HOME for both facts: membership AND kind.  `isEnergyItemKpi` reads
//  this map's keys, so the two can never disagree about what an energy item
//  is.  NOT VERIFIED HERE, and said rather than implied: `W_hydraulic_kW`
//  and `Q_removed_kW` are declared but published by no unit in the tree
//  today (the pump emits `W_hydraulic`, without the `_kW`), so their kind is
//  a contract for a future publisher rather than a fact about a current run.
inline const std::map<std::string, EnergyItemKind>& energyItemKpis()
{
    static const std::map<std::string, EnergyItemKind> items = {
        {"Q_kW",                    EnergyItemKind::Heat},
        {"duty_kW",                 EnergyItemKind::Heat},
        {"Q_reboiler_kW",           EnergyItemKind::Heat},
        {"Q_condenser_kW",          EnergyItemKind::Heat},
        {"Q_removed_kW",            EnergyItemKind::Heat},
        {"Q_regeneration_kW",       EnergyItemKind::Heat},
        {"Q_adsorption_cooling_kW", EnergyItemKind::Heat},
        {"W_shaft_kW",              EnergyItemKind::Work},
        {"W_hydraulic_kW",          EnergyItemKind::Work},
    };
    return items;
}

inline bool isEnergyItemKpi(const std::string& k)
{
    return energyItemKpis().count(k) > 0;
}

//  Is this item SHAFT WORK?  Asked by the plant-boundary accumulator so the
//  published ledger can carry Q and W apart.  A name this map does not know
//  is not an energy item at all and never reaches here.
inline bool isWorkItemKpi(const std::string& k)
{
    const auto it = energyItemKpis().find(k);
    return it != energyItemKpis().end() && it->second == EnergyItemKind::Work;
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

//  IS THIS UNIT A PROCESS-TO-PROCESS HEAT EXCHANGER?  (2026-10-05, DEV.md
//  C35 / 4d D1.)  Asked of what the unit IS -- its TYPE -- never of how many
//  ports it has.  Such a unit moves its declared duty BETWEEN its own process
//  streams, so the duty is internal: the streams already net it and counting
//  it at the plant boundary would count it twice (the old -3663 % on
//  heatExchanger01).  The test used to be structural -- >= 2 process inlets,
//  >= 2 process outlets, no utility stream -- and a MULTI-FEED distillation
//  column satisfies it while its reboiler and condenser are heat that
//  crosses the boundary: its two duties were dropped, and the plant residual
//  was exactly -(Q_reboiler + Q_condenser) on column04 (-78.693876 kW),
//  column05 and column08 (-891.980060 kW).  An antisolvent crystalliser's
//  cooling duty was one data datum away from the same fate.
//
//  The list is the set of unit types whose energy-item KPI IS heat passed
//  from one of their process streams to another: a shell-and-tube or plate
//  exchanger, a multi-stream exchanger, a cooling tower (water to air).  A
//  new exchanger type joins it here, by a human, the way an energy item
//  joins `energyItemKpis`; a type that is not listed keeps its duties on the
//  boundary, which is the reading a unit's published duty already promises.
//  The structural conditions stay as NECESSARY ones (an exchanger whose one
//  side is a utility circuit tagged on both ends sends its heat through
//  `qBoundary` and is not internal), never as sufficient.
inline bool isProcessToProcessExchanger(const std::string& unitType)
{
    return unitType == "heatExchanger"
        || unitType == "multiStreamHX"
        || unitType == "coolingTower";
}

//  WHICH HEAT DUTIES A UNIT PUBLISHES -- the ONE home of "this unit has a
//  duty" (2026-10-10, DEV.md 4c C52).
//
//  The energy report has always put a unit's `Q_kW` on the plant boundary
//  (`energyItemKpis` above); the utility allocation read only the KPI `Q`
//  in W, plus the column's two port keys.  Every unit that publishes `Q_kW`
//  alone -- gibbsReactor, cstr, conversionReactor, equilibriumReactor, pfr,
//  crystalliser -- had its duty PRICED by the first law and DROPPED by the
//  allocation: not allocated, not listed unserved, absent from C_UT and from
//  the economics' count of unpriced duties.  The green-ammonia converter's
//  -30 605 kW was the witness.  Two readers asking "does this unit have a
//  duty" with two different key lists is the arity sin; the answer now has
//  ONE home, derived from the SAME list the first law reads:
//
//      a boundary heat duty = an `energyItemKpis()` item of kind Heat that
//      is not an internal-medium duty (`isInternalMediumDutyKpi`).
//
//  What this table adds is only what the allocation needs beyond the first
//  law: the PORT a duty is served on (a column has two) and the KPI that
//  carries the temperature the heat crosses at.  A Heat item with no row here
//  is a maintainer's omission and REFUSES by name (`unitHeatDuties`) rather
//  than being skipped -- skipping is exactly the defect this replaces.
//
//  THE SI TWIN.  Four units (heater, heatExchanger, isothermalFlash,
//  phaseChanger) publish the generic duty twice: `Q` in W and `Q_kW`.  Each
//  computes the second from the first (`Q_W / 1000`, read at their kpis_
//  assignments), so the two agree by construction; they are CHECKED here
//  anyway, and a disagreement refuses naming both numbers, because a unit
//  publishing two different duties is a defect no reader should pick a side
//  of.  `Q` is preferred when present, so every row those units published
//  before this home existed is byte-identical.
struct HeatDutyPort
{
    const char* kpi;       // the energy item (kW)
    const char* port;      // "" = the unit's single generic duty
    const char* tempKpi;   // the KPI holding the temperature it crosses at
                           // ("" = the unit's own T, else T_out)
};

inline const std::vector<HeatDutyPort>& heatDutyPorts()
{
    //  ORDER IS THE ROW ORDER of the allocation (generic duty first, then the
    //  column's reboiler and condenser, as before this home existed).
    static const std::vector<HeatDutyPort> ports = {
        {"Q_kW",                    "",                  ""},
        {"Q_reboiler_kW",           "reboiler",          "T_bottom"},
        {"Q_condenser_kW",          "condenser",         "T_top"},
        {"Q_removed_kW",            "removed",           ""},
        {"Q_regeneration_kW",       "regeneration",      "T_regeneration"},
        {"Q_adsorption_cooling_kW", "adsorptionCooling", "T_adsorption"},
    };
    return ports;
}

struct UnitHeatDuty
{
    std::string kpi;       // which energy item it is
    std::string port;      // "" for the generic duty
    scalar      W = 0.0;   // signed, + heat INTO the process
    scalar      T = -1.0;  // K, the process temperature it crosses at; -1 unknown
};

inline std::vector<UnitHeatDuty>
unitHeatDuties(const std::map<std::string, scalar>& kpis, const std::string& unit)
{
    //  Every Heat item that crosses the boundary must have a port row.
    for (const auto& [key, kind] : energyItemKpis())
    {
        if (kind != EnergyItemKind::Heat || isInternalMediumDutyKpi(key)) continue;
        bool found = false;
        for (const auto& p : heatDutyPorts()) if (key == p.kpi) { found = true; break; }
        if (!found)
            throw std::logic_error("reporting::unitHeatDuties: the energy item `"
                + key + "` is a boundary heat duty (energyItemKpis) with no row in"
                  " heatDutyPorts() -- the utility allocation would drop it in"
                  " silence.  Add its port and temperature KPI there.");
    }

    auto find = [&kpis](const std::string& k) -> const scalar*
    {
        auto it = kpis.find(k);
        return it == kpis.end() ? nullptr : &it->second;
    };
    //  The unit's own temperature: `T`, else `T_out`, else `T_op` (the
    //  crystalliser publishes its magma temperature under that name and no
    //  other, so its cooling duty had no temperature to be served at).  A
    //  non-isothermal pfr publishes `T` as its INLET temperature: a duty
    //  spread along a profile is served here at that one temperature, an
    //  approximation said rather than refined.
    auto unitT = [&find]() -> scalar
    {
        if (auto t = find("T"))     return *t;
        if (auto t = find("T_out")) return *t;
        if (auto t = find("T_op"))  return *t;
        return -1.0;
    };

    std::vector<UnitHeatDuty> out;
    for (const auto& p : heatDutyPorts())
    {
        const std::string key = p.kpi;
        const scalar* kW = find(key);
        const scalar* W  = (key == "Q_kW") ? find("Q") : nullptr;
        if (!kW && !W) continue;
        if (kW && W)
        {
            const scalar a = *W, b = *kW * 1000.0;
            if (std::abs(a - b) > 1.0e-9 * std::max(std::abs(a), std::abs(b)) + 1.0e-6)
                throw std::runtime_error("unit '" + unit + "' publishes two"
                    " different duties: Q = " + std::to_string(a) + " W and"
                    " Q_kW = " + std::to_string(*kW) + " kW.  They are one"
                    " number in two units and must agree; no reader picks a"
                    " side.  This is a defect in the unit's KPI publication.");
        }
        UnitHeatDuty d;
        d.kpi  = key;
        d.port = p.port;
        d.W    = W ? *W : *kW * 1000.0;
        const std::string tk = p.tempKpi;
        const scalar* tp = tk.empty() ? nullptr : find(tk);
        d.T = tp ? *tp : unitT();
        out.push_back(std::move(d));
    }
    return out;
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
    //  A UTILITY CIRCUIT DECLARED ON ONE END ONLY (2026-09-09, found by Vitor
    //  on the green-ammonia global energy panel).  See `unitEnergyBalance`:
    //  the tag was IGNORED for this unit and every stream counted as process
    //  material.  Set so the report can ANNOUNCE it -- a half-declared circuit
    //  is the author's to close, and silence here is what let a 960 MW datum
    //  offset be filed as a duty.  Empty when the unit has no such stream.
    std::vector<std::string> utilityTagIgnored;   // the tagged stream names
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
    //
    //  The RESOLUTION itself moved to `unitOperations/flash/StreamEquilibrium.H`
    //  (2026-08-09) when a third surface -- the heater's Q -> T_out inversion --
    //  was found pricing states on a fourth convention.
    //
    //  AND SO DID THE READING OF THE ANSWER (2026-09-12).  "A converged
    //  single-phase resolution is not a split" used to be written out HERE,
    //  and a fourth surface then needed the same sentence: the distillation
    //  column, which must price its feed exactly as this report prices it or
    //  the two disagree by the feed's latent half.  `unitOperations` may not
    //  include `reporting`, so the sentence would have had to be copied --
    //  the arity sin, in the machinery built to audit it.  It is one call now.
    //
    //  AND THE SEARCH IS THE CONSUMER'S (2026-10-05, C35 item 4).  A stream
    //  fed to a `phaseSet VLLE` flash means its THREE-phase equilibrium; the
    //  vapour-liquid search found one liquid on vlle03's feed where the
    //  unit's own search finds a vapour and two liquids, and the unit's duty
    //  (priced as this report prices) charged 186.48 kW to an identity
    //  operation.  `consumerRecipe` is the unit's own call.
    const auto recipe = flashState::consumerRecipe(s, thermo);
    return flashState::twoPhaseSplit(s.T, s.P, s.z, s.phasePinned, s.vf,
                                     thermo, "stream '" + s.name + "'",
                                     "energyBalance", nullptr,
                                     recipe ? &*recipe : nullptr);
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
        //  A RESOLVED STATE MAY CARRY CRYSTALS THE STREAM FILE DOES NOT --
        //  `sp->x` is the APPARENT liquid, any precipitate resolved here still
        //  inside it, priced as dissolved -- so `hOfState` moves each such mole
        //  onto the solid formation rung, exactly as the unit duty does
        //  (R-E3/R-E5).  Without it, an unpinned feed whose own equilibrium
        //  precipitates is priced dissolved while the outlet is priced
        //  crystalline, and the balance reads the RUNG DIFFERENCE as a duty
        //  (flash19: 0.1557 kW, against a unit that correctly reports zero).
        //  Amounts are on the resolution's F = 1 basis, so they scale by s.F.
        H = s.F * flashState::hOfState(*sp, s.T, s.P, s.z, thermo);
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
//
// THE SUBTRACTION IS THE WHOLE POINT, AND IT NEEDS BOTH ENDS (2026-09-09).
// `qBoundary = H(supply) - H(return)` cancels the medium's formation datum and
// leaves the heat it carried.  With the tag on ONE end only the cancellation
// never happens: the supply's whole datum offset lands in qBoundary as a
// "duty" and the return lands in hOut as process material.  Measured on
// `greenAmmoniaIndustrialN2` (its sectored 2026-09 edition), where `0/MAIN/Chw` carries
// `category chilledWater;` and the ChwOut the run produces carries none:
// 60.05 kg/s of chilled water reported a 960 712 kW duty for a chiller whose
// real duty is 741.56 kW -- and, because that unit then failed the
// `internalExchanger` test in EnergyBalanceReport, its 741.56 kW was ALSO
// added to the plant's Q_boundary while its heat was already carried out by
// the ChwOut stream counted in Sum H(products).  The double count WAS the
// plant's 728.86 kW first-law residual.
//
// Nothing in the corpus tags a return: ten cases tag a supply, zero tag the
// other end (utility03's brineSupply/brineReturn, evaporator03's
// liveSteam/cond1..3, ...).  So the cancellation this function is built on
// has never once happened.
//
// RULE: the tag is applied only when the unit has a tagged stream on BOTH
// sides.  Otherwise the circuit is half-declared, the offsets cannot cancel,
// and the honest reading is the one the untagged circuits already get --
// count the medium as material passing through, which nets its own datum
// exactly and leaves the unit's dH to be reconciled against its declared
// duty.  The names are reported so the run can ANNOUNCE it; this function
// never decides in silence, and it never throws (a report that kills the run
// over a case's declaration is worse than one that says what it did).
inline UnitEnergy unitEnergyBalance(const std::vector<const ProcessStream*>& ins,
    const std::vector<const ProcessStream*>& outs,
    const ThermoPackage& thermo, scalar /*Tref*/)
{
    UnitEnergy u;
    bool any = false;

    //  Is the circuit declared on both sides of THIS unit?  Decided before a
    //  single enthalpy is accumulated, because the answer changes what every
    //  tagged stream below is.
    const auto tagged = [](const std::vector<const ProcessStream*>& v)
    {
        int n = 0;
        for (const auto* s : v) if (s && !s->category.empty()) ++n;
        return n;
    };
    const int nTagIn  = tagged(ins);
    const int nTagOut = tagged(outs);
    const bool applyTag = (nTagIn > 0 && nTagOut > 0);

    for (const auto* s : ins)
    {
        if (!s) continue;
        any = true;
        const scalar h = streamH_elements(*s, thermo);
        if (s->category.empty() || !applyTag)
        {
            u.hIn += h; ++u.nProcIn;
            if (!s->category.empty()) u.utilityTagIgnored.push_back(s->name);
        }
        else u.qBoundary += h;   // utility supplies heat in
    }
    for (const auto* s : outs)
    {
        if (!s) continue;
        any = true;
        const scalar h = streamH_elements(*s, thermo);
        if (s->category.empty() || !applyTag)
        {
            u.hOut += h; ++u.nProcOut;
            if (!s->category.empty()) u.utilityTagIgnored.push_back(s->name);
        }
        else u.qBoundary -= h;    // utility carries heat out
    }
    u.ref = any ? EnergyRef::Elements : EnergyRef::None;
    return u;
}

} // namespace reporting
} // namespace Choupo
