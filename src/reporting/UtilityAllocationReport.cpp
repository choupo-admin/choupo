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

#include "UtilityAllocationReport.H"
#include <stdexcept>
#include "thermo/utility/UtilityCatalogue.H"
#include "core/Advisory.H"
#include "reporting/BalanceMath.H"   // unitHeatDuties, isProcessToProcessExchanger

#include "streams/UtilityCircuit.H"

#include <algorithm>
#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <map>
#include <set>
#include <vector>

namespace Choupo {

// ===========================================================================
//  allocateUtilities --- the single source of truth.
//
//  Sizes a plant utility for every unallocated heat duty by temperature
//  level: a unit's generic `Q`, plus a distillation column's reboiler
//  (heating, bottoms T) and condenser (cooling, top T).  A duty already
//  carried by a physical utility STREAM, or by a heat-LINK at either end,
//  is flagged carried and not re-allocated (no double-count).
//
//  Used BOTH by the utilityAllocation report (CSV / console) AND by the
//  application before emitting the result JSON, so the GUI sees the same
//  numbers without re-running the pick.
// ===========================================================================
std::vector<UtilityAllocation>
allocateUtilities(const SimulationResult& result, const DictPtr& flowsheet, scalar dTmin)
{
    //  WHICH DUTIES A UNIT HAS, AND AT WHAT TEMPERATURE, is
    //  `reporting::unitHeatDuties` (BalanceMath.H) -- the ONE home, derived
    //  from the same list the first law reads.  This file used to read only
    //  the KPI `Q` in W plus the column's two port keys, and every unit that
    //  publishes `Q_kW` alone (the reactors, the crystalliser) had its duty
    //  dropped here in silence while the energy report priced it (DEV.md 4c
    //  C52).

    //  THE UNIT DICTS: the engine's own composition (`result.unitDicts`, the
    //  dicts the units were built from).  The root dict's `units` list is the
    //  fallback for a result that predates it; a plant whose units live in
    //  their own folders lists none at its root, and until C52 its work
    //  wires and declared utilities were therefore NOT READ (announced
    //  below, which is now the residual case only).
    std::vector<DictPtr> unitDicts = result.unitDicts;
    if (unitDicts.empty() && flowsheet && flowsheet->hasDictList("units"))
        unitDicts = flowsheet->lookupDictList("units");

    // Lowest-grade catalogue utility that serves a duty of sign(Q) at T --
    // the ONE allocation rule, shared with the batch campaign pass
    // (UtilityCatalogue::pickForDuty; moved there in energy phase (f) so
    // steady and batch can never diverge on the pick).
    auto pick = [&](bool heating, scalar T) -> const Utility*
    {
        return UtilityCatalogue::pickForDuty(heating, T, dTmin);
    };

    // ---- carriers from topology (utility streams) -------------------------
    std::map<std::string, std::string> carrier;   // unit -> carrying utility stream
    {
        std::map<std::string, std::string> utilStreams;
        for (const auto& [sname, s] : result.streams)
            if (!s.category.empty()) utilStreams[sname] = s.category;

        for (const auto& ud : unitDicts)
        {
            const std::string uname = ud->lookupWordOrDefault("name", "");
            if (uname.empty()) continue;
            std::vector<std::string> touched;
            if (ud->found("in"))      touched.push_back(ud->lookupWord("in"));
            if (ud->found("inputs"))  for (auto& s : ud->lookupWordList("inputs"))  touched.push_back(s);
            if (ud->found("outputs")) for (auto& s : ud->lookupWordList("outputs")) touched.push_back(s);
            for (const auto& s : touched)
            {
                auto it = utilStreams.find(s);
                if (it != utilStreams.end()) { carrier[uname] = s; break; }
            }

            //  A PROCESS-PROCESS EXCHANGER IS ITS OWN CARRIER.  Its Q is
            //  heat RECOVERED between two process streams, not a demand
            //  on the catalogue -- the whole reason to install one instead
            //  of a heater and a cooler.  Until 2026-09-02 it fell through
            //  to the auto-pick with no unit T, and heatExchanger01 (a
            //  first-path tutorial) reported 93.79 kW of UNSERVED HEATING
            //  at "(unit T unknown)": a student reading the Reports tab
            //  concluded the exchanger needed steam.  Twelve golden rows
            //  in the corpus carried that reading.  The unit TYPE is the
            //  declared fact this classification reads -- never the name,
            //  never the duty's sign.
            if (carrier.find(uname) == carrier.end())
            {
                const std::string ty = ud->lookupWordOrDefault("type", "");
                //  The TYPE list has ONE home, the energy report's
                //  (`reporting::isProcessToProcessExchanger`): a cooling
                //  tower's Q_kW is water-to-air heat between its own
                //  streams, and since C52 this file reads Q_kW.
                if (reporting::isProcessToProcessExchanger(ty))
                    carrier[uname] = "its own process streams (" + ty + ")";
            }
        }

        //  A DECLARED UTILITY CIRCUIT IS A CARRIER, AND A NAMED ONE
        //  (2026-09-08).  Cooling water modelled as an explicit stream pair
        //  was invisible here: `cw` carries no `category`, so the served
        //  exchanger fell to the rule below and was reported as carried by
        //  "its own process streams" -- true of a process-process exchanger
        //  and false of this one, which is served by a plant utility.  With
        //  the circuit DECLARED there is one home for "what utilities does
        //  this plant use", and it names the service the case declared rather
        //  than a service this pass would have picked.
        for (const auto& [uname, circ] :
             utilityCircuits::servedUnits(
                 utilityCircuits::read(flowsheet), result.topology))
            carrier[uname] = "declared utility circuit " + circ.name
                           + " (" + circ.service + ")";

        //  AND THE SAME RULE OVER THE FLATTENED TOPOLOGY, which is the only
        //  list that holds a SECTORED plant's units (the loop above walks the
        //  root dict, and a sectored root lists sector names, not units).  The
        //  classification reads the DECLARED TYPE and nothing else, so it is
        //  the same rule stated once more over a list that reaches further --
        //  not a second rule.  A unit the loop above already carried keeps
        //  that carrier: a utility STREAM is more specific than "its own
        //  process streams", and this pass never overwrites one.
        for (const auto& fu : result.topology)
        {
            if (fu.name.empty() || carrier.count(fu.name)) continue;
            if (reporting::isProcessToProcessExchanger(fu.type))
                carrier[fu.name] = "its own process streams (" + fu.type + ")";
        }
    }

    // ---- DECLARED utilities: "<unit>/<port>" -> utility ---------------------
    //  Two spellings, one per kind of duty:
    //    * a unit's SINGLE generic duty (port ""): `utility <name>;` at the
    //      unit's own level, beside `type` (DEV.md 4c C52).  It is not in
    //      `operation {}` because the unit does not read it -- the utility
    //      allocation does -- and `operation {}` is the block a unit's key
    //      audit holds to "nobody read this";
    //    * a column's PORT duty: `operation { reboiler { utility <name>; } }`
    //      (and `condenser`), the older spelling, kept.
    //  A declaration is an INSTRUCTION and is held to `canServe` below: one
    //  that cannot serve the duty it names REFUSES, never falls back.
    std::map<std::string, std::string> declaredUtility;
    for (const auto& ud : unitDicts)
    {
        const std::string uname = ud->lookupWordOrDefault("name", "");
        if (uname.empty()) continue;
        if (ud->found("utility"))
            declaredUtility[uname + "/"] = ud->lookupWord("utility");
        if (!ud->found("operation")) continue;
        auto op = ud->subDict("operation");
        for (const char* port : {"reboiler", "condenser"})
            if (op && op->found(port))
            {
                auto pd = op->subDict(port);
                if (pd && pd->found("utility"))
                    declaredUtility[uname + "/" + port] = pd->lookupWord("utility");
            }
    }

    // ---- heat-links (energy wires kind heat): BOTH ends carried -----------
    std::map<std::string, std::string> heatLinkUnit;   // consumer -> "<src>.<port>"
    std::map<std::string, std::string> heatLinkPort;   // "<unit>/<port>" -> consumer
    for (const auto& ud : unitDicts)
    {
        const std::string uname = ud->lookupWordOrDefault("name", "");
        if (uname.empty() || !ud->found("energyInputs")) continue;
        for (const auto& ein : ud->lookupDictList("energyInputs"))
        {
            if (ein->lookupWordOrDefault("kind", "work") != "heat") continue;
            const std::string from = ein->lookupWordOrDefault("from", "");
            if (from.empty()) continue;
            heatLinkUnit[uname] = from;
            const auto dot = from.find('.');
            if (dot != std::string::npos)
                heatLinkPort[from.substr(0, dot) + "/" + from.substr(dot + 1)] = uname;
        }
    }

    // ---- unit types + work-COUPLED units (for the electrical tier) --------
    //   A unit is mechanically coupled by a work WIRE --- and therefore NOT
    //   billed as grid electricity --- if it EITHER receives shaft work
    //   (an energyInput of kind work) OR exports its shaft work to another
    //   unit (its shaft port is the `from` of some energyInput).  The latter
    //   is the combined-cycle compressor: its load is summed into the gas
    //   turbine's generator, so charging it again to the grid double-counts.
    //  THE UNIT TYPE COMES FROM THE ENGINE'S OWN FLATTENED TOPOLOGY, never
    //  from the root dict (2026-09-08).  A SECTORED plant lists only sector
    //  NAMES at its root -- each sector's units live in
    //  `sectors/<S>/system/flowsheetDict`, composed by `Flowsheet` at load --
    //  so `flowsheet->lookupDictList("units")` is EMPTY there and every unit
    //  lost its type in silence.  Consequences, measured by Vitor on a plant
    //  he built twice (nh3verde01 flat vs nh3verde02 sectored, same physics to
    //  the sixth figure): three compressors vanished from the electrical tier
    //  (C_UT 7 587 953 -> 1 582 EUR/yr, 9.3 MEUR/yr, 5 % of COM_d, with NO
    //  warning), and every process-process exchanger fell from
    //  "(carried: its own process streams)" to "(unit T unknown)".
    //
    //  `result.topology` is that same list, flat, with each unit's name
    //  QUALIFIED exactly as `result.kpis` keys them, and it is already handed
    //  to this function.  This file was ALREADY reading it for its carriers
    //  (see "carriers from topology" above) and then re-deriving types from
    //  the root -- two homes for one fact, in one file, and only the second
    //  broke.  Same shape as the 2026-09-04 hierarchy slice.
    std::map<std::string, std::string> unitType;
    for (const auto& fu : result.topology)
        if (!fu.name.empty()) unitType[fu.name] = fu.type;

    //  WHAT THE TOPOLOGY CANNOT SERVE.  `FlatUnit` carries name/type/ins/
    //  outs/sector by design -- it is topology, not the unit's own
    //  parameters -- so the blocks that need a unit's DICT (its
    //  `energyInputs` wires, its declared utilities) read `unitDicts`, the
    //  composed per-unit dicts the engine built the units from (published to
    //  reporting by C52; the seam the 2026-09-08 slice named and did not
    //  build).  Only a result that carries none of them degrades, and that
    //  is ANNOUNCED below rather than reported as an absence of wires.
    std::set<std::string> workCoupled;
    for (const auto& ud : unitDicts)
    {
        const std::string uname = ud->lookupWordOrDefault("name", "");
        if (uname.empty()) continue;
        //  (the type is NOT read here any more -- `unitType` is filled
        //   from `result.topology` above, its one home)
        if (ud->found("energyInputs"))
            for (const auto& ein : ud->lookupDictList("energyInputs"))
            {
                if (ein->lookupWordOrDefault("kind", "work") != "work") continue;
                workCoupled.insert(uname);                      // driven by a wire
                const std::string from = ein->lookupWordOrDefault("from", "");
                const auto dot = from.find('.');
                if (dot != std::string::npos)
                    workCoupled.insert(from.substr(0, dot));    // source exports work
            }
    }

    //  THE DEGRADATION IS ANNOUNCED, NEVER A ZERO.  The blocks above need a
    //  unit's own DICT.  A result that carries no unit dicts AND a root that
    //  lists none leaves them finding no work wires and no declared utility
    //  -- an ABSENCE that reads exactly like "this plant has none".  Say which
    //  it is.  Since C52 choupoSolve publishes the composed dicts, so this
    //  fires only for a result built without them.
    if (!result.topology.empty() && unitDicts.empty())
    {
        const std::string msg =
            "utility allocation read " + std::to_string(result.topology.size())
            + " unit(s) from the flattened topology, but neither the result"
              " nor the root flowsheetDict carries the units' own dicts.  Unit"
              " TYPES are correct (they come from the topology).  NOT READ,"
              " because they need each unit's dict: `energyInputs` work wires"
              " (a shaft-driven unit may therefore be billed to the grid) and"
              " a declared `utility` (a duty may fall to the automatic pick)."
              "  Absence of those here is NOT evidence the plant has none.";
        AdvisoryLog::instance().add("utilityAllocation", "warning",
                                    "unit dicts unavailable", msg);
        std::cerr << "WARNING: utilityAllocation: " << msg << "\n";
    }

    // ---- one row per duty -------------------------------------------------
    std::vector<UtilityAllocation> rows;
    std::set<std::string> dutyPorts;         // "<unit>/<port>" each unit PUBLISHES
    std::set<std::string> declaredServed;    // declarations that served a duty
    for (const auto& [unit, k] : result.kpis)
    {
        for (const auto& dty : reporting::unitHeatDuties(k, unit))
        {
            dutyPorts.insert(unit + "/" + dty.port);
            const scalar Q = dty.W;                    // W, + heating / - cooling
            if (std::abs(Q) < 1.0) continue;            // ignore ~0 (adiabatic)

            UtilityAllocation r;
            r.unit = unit;  r.port = dty.port;
            r.duty_kW = Q / 1000.0;  r.T = dty.T;
            r.tier = (Q > 0.0) ? "heating" : "cooling";

            // Carried (not re-allocated) when the heat has a carrier: a
            // physical utility STREAM, or a heat-LINK at either end.
            std::string carriedBy;
            if (dty.port.empty())
            {
                auto cit = carrier.find(unit);     if (cit != carrier.end()) carriedBy = cit->second;
                auto hit = heatLinkUnit.find(unit); if (hit != heatLinkUnit.end()) carriedBy = "heat-link " + hit->second;
            }
            else
            {
                auto pit = heatLinkPort.find(unit + "/" + dty.port);
                if (pit != heatLinkPort.end()) carriedBy = "heat-link -> " + pit->second;
            }
            const std::string declKey = unit + "/" + dty.port;
            const auto dit = declaredUtility.find(declKey);
            if (!carriedBy.empty() && dit != declaredUtility.end())
                throw std::runtime_error(
                    "utility allocation refused: unit '" + unit + "'"
                    + (dty.port.empty() ? std::string() : " port '" + dty.port + "'")
                    + " declares utility '" + dit->second + "', but its duty is"
                      " already carried by " + carriedBy + " -- there is nothing"
                      " to buy, and pricing the declared service would count the"
                      " same heat twice.\n    REMEDY: remove the `utility`"
                      " declaration, or the carrier.");
            if (!carriedBy.empty())
            {
                r.utility = "(carried: " + carriedBy + ")";
                r.carried = true;
                rows.push_back(std::move(r));
                continue;
            }

            // Explicit per-port utility wins over the auto-pick.
            //  A DECLARED UTILITY THAT IS ABSENT IS A REFUSAL, NOT A FALLBACK
            //  (AS5).  The catch here used to erase the lookup failure to
            //  `nullptr`, which is INDISTINGUISHABLE from "none declared" --
            //  so control fell straight through to the auto-pick.  A case
            //  declaring `steamHP` against a catalogue shipping only MP/LP
            //  was costed at MP and never contradicted, and this function
            //  feeds the result JSON, so the substitution is what the GUI and
            //  the economics read.
            //
            //  The distinction already mattered to this very function: it
            //  takes care elsewhere to separate "(none adequate)" from "(no
            //  catalogue loaded)" precisely so a message never asserts a
            //  check it did not perform.  The same care, here.
            //
            //  Declaring a utility is an INSTRUCTION.  Silently honouring a
            //  different one is not a degraded answer, it is another
            //  question's answer.
            //  ...AND A DECLARED UTILITY THAT CANNOT SERVE THE DUTY IS A
            //  REFUSAL TOO (DEV.md 4c C52).  Until then a declaration was
            //  checked only for EXISTING: a column condenser declared on
            //  steam would have been costed as steam.  It is held to the same
            //  rule the auto-pick filters on (`UtilityCatalogue::canServe`):
            //  the tier matches the sign of the duty, and heat can flow
            //  across dTmin at the process temperature.
            const std::string where = "unit '" + unit + "'"
                + (dty.port.empty() ? std::string() : " port '" + dty.port + "'");
            const Utility* u = nullptr;
            if (dit != declaredUtility.end())
            {
                try { u = &UtilityCatalogue::byName(dit->second); }
                catch (const std::exception& e)
                {
                    throw std::runtime_error(
                        "utility allocation refused: " + where
                        + " declares utility '" + dit->second + "', which is"
                          " not in the loaded catalogue.\n    " + e.what()
                        + "\n    The declared service is an INSTRUCTION, so"
                          " it is not silently replaced by the"
                          " temperature auto-pick -- that would cost the"
                          " duty against a utility nobody asked for and"
                          " report it as if asked.\n    REMEDY: add '"
                        + dit->second + "' to the utility catalogue, or"
                          " remove the declaration to accept the"
                          " auto-pick.");
                }
                std::string why;
                if (!UtilityCatalogue::canServe(*u, Q > 0.0, r.T, dTmin, &why))
                    throw std::runtime_error(
                        "utility allocation refused: " + where + " declares"
                        " utility '" + dit->second + "' for a "
                        + (Q > 0.0 ? "HEATING" : "COOLING") + " duty of "
                        + std::to_string(Q / 1000.0) + " kW at "
                        + std::to_string(r.T) + " K, and it cannot serve it: "
                        + why + " (dTmin " + std::to_string(dTmin) + " K).\n"
                          "    A declared service is an INSTRUCTION; one that"
                          " cannot be carried out is refused, never replaced"
                          " by the auto-pick.\n    REMEDY: declare a utility"
                          " that can serve this duty, or remove the"
                          " declaration to accept the auto-pick.");
                declaredServed.insert(declKey);
            }
            if (!u && r.T > 0.0) u = pick(Q > 0.0, r.T);
            if (u)
            {
                r.allocated = true;
                r.utility   = u->name;
                r.kg_s      = std::abs(Q) / u->dutyPerKg;
                r.MW        = std::abs(Q) / 1.0e6;
                r.eur_h     = (std::abs(Q) * 3600.0 / 1.0e9) * u->cost;   // W->GJ/h, €/GJ->€/h
            }
            else
            {
                //  THREE DIFFERENT FACTS, and only one of them is about the
                //  process.  "(none adequate)" says the catalogue was
                //  consulted and nothing in it fits -- a real finding about
                //  this duty.  With NO catalogue loaded it says the same
                //  thing while having looked at nothing, which is the shape
                //  of mistake this whole week has been about: a message
                //  asserting a check it did not perform.
                //
                //  An empty catalogue is not exotic: the sealed cases run
                //  with the installation tree hidden, and a run launched
                //  from inside a case directory (no CHOUPO_HOME, no
                //  data/standards beside the cwd) loads none either -- which
                //  is exactly how this was found, chasing a duty that turned
                //  out to be perfectly serviceable by steamLP.
                r.utility = (r.T <= 0.0)                          ? "(unit T unknown)"
                          : UtilityCatalogue::availableNames().empty()
                                ? "(no utility catalogue loaded)"
                                : "(none adequate)";
            }
            rows.push_back(std::move(r));
        }
    }

    //  A DECLARATION THAT SERVED NOTHING.  A utility declared on a port the
    //  unit does not publish a duty on is a declaration about a duty that
    //  does not exist -- a misplaced key, or a unit that is not what the
    //  author thinks -- and REFUSES.  One on a duty the unit publishes but
    //  that is ~0 this run (|Q| < 1 W: an adiabatic pass) is honoured by
    //  having nothing to serve, and SAID.
    for (const auto& [key, uname] : declaredUtility)
    {
        if (declaredServed.count(key)) continue;
        const auto slash = key.rfind('/');
        const std::string unit = key.substr(0, slash);
        const std::string port = key.substr(slash + 1);
        const std::string where = "unit '" + unit + "'"
            + (port.empty() ? std::string() : " port '" + port + "'");
        if (!dutyPorts.count(key))
            throw std::runtime_error(
                "utility allocation refused: " + where + " declares utility '"
                + uname + "', but publishes no heat duty"
                + (port.empty() ? std::string() : " on that port")
                + " for it to serve.\n    REMEDY: declare the utility on the"
                  " unit that carries the duty (a column's duties are"
                  " `operation { reboiler { utility ...; } condenser { ... } }`),"
                  " or remove the declaration.");
        const std::string msg = where + " declares utility '" + uname
            + "', and its duty is ~0 this run (|Q| < 1 W) -- nothing to serve.";
        AdvisoryLog::instance().add("utilityAllocation", "info",
                                    "declared utility idle", msg);
        std::cerr << "[utilityAllocation] " << msg << "\n";
    }

    // ---- electrical power (tier "power") ----------------------------------
    //   Rotating equipment crosses the plant boundary as electricity: pump &
    //   compressor MOTORS draw it from the grid; an electricLoad (generator)
    //   feeds it back.  W supplied by a WIRE (turbine -> compressor) is
    //   mechanical and is skipped.  Net = drawn - generated, priced at the
    //   electricity tariff -- the power bill alongside steam / cooling water.
    //   Graceful if the catalogue has no `electricity` entry.
    const Utility* elec = nullptr;
    try { elec = &UtilityCatalogue::byName("electricity"); }
    catch (const std::exception&) { elec = nullptr; }
    if (elec)
    {
        const scalar eff = (elec->driveEfficiency > 0.0) ? elec->driveEfficiency : 1.0;
        auto eurPerW = [&](scalar W) { return (W * 3600.0 / 1.0e9) * elec->cost; }; // W->€/h
        for (const auto& [unit, k] : result.kpis)
        {
            auto tIt = unitType.find(unit);
            const std::string ty = (tIt != unitType.end()) ? tIt->second : "";
            const auto& kmap = k;
            auto kf = [&kmap](const char* key) -> const scalar* {
                auto it = kmap.find(key); return it == kmap.end() ? nullptr : &it->second; };

            if (ty == "pump" || ty == "compressor")        // electric-motor consumer
            {
                if (workCoupled.count(unit)) continue;      // mechanically wire-coupled
                auto w = kf("W_shaft");
                if (!w || *w <= 1.0) continue;              // none / ~0 / not positive
                const scalar Pelec = *w / eff;              // grid draw incl. motor losses
                UtilityAllocation r;
                r.unit = unit;  r.tier = "power";  r.utility = "electricity";
                r.T = -1.0;     r.allocated = true;
                r.duty_kW = Pelec / 1000.0;  r.MW = Pelec / 1.0e6;  r.eur_h = eurPerW(Pelec);
                rows.push_back(std::move(r));
            }
            else if (ty == "electricLoad")                  // generator -> grid
            {
                auto w = kf("W_electric");
                if (!w || *w <= 1.0) continue;
                UtilityAllocation r;
                r.unit = unit;  r.tier = "power";  r.utility = "electricity (generated)";
                r.T = -1.0;     r.allocated = true;
                r.duty_kW = *w / 1000.0;  r.MW = *w / 1.0e6;  r.eur_h = -eurPerW(*w);  // credit
                rows.push_back(std::move(r));
            }
        }
    }

    return rows;
}

// ===========================================================================
//  The report object: compute via allocateUtilities(), then write CSV +
//  console.  (The application populates result.utilityAllocation separately
//  for the JSON; both call the same function.)
// ===========================================================================
void UtilityAllocationReport::run(const DictPtr& dict, const ReportContext& ctx)
{
    const scalar dTmin = dict ? dict->lookupScalarOrDefault("dTmin", 10.0) : 10.0;
    const auto rows = allocateUtilities(ctx.result, ctx.flowsheetDict, dTmin);

    std::map<std::string, std::pair<scalar,scalar>> byUtil;   // util -> (kg/s, €/h)
    for (const auto& r : rows)
        if (r.allocated) { byUtil[r.utility].first += r.kg_s; byUtil[r.utility].second += r.eur_h; }

    // ---- CSV --------------------------------------------------------------
    //  Default layout: the file sits directly in reports/ (legacySub "");
    //  postProcessing layout: postProcessing/utilityAllocation/<n>/.
    const std::filesystem::path uaDir = ctx.outDir("utilityAllocation", "");
    std::filesystem::create_directories(uaDir);
    std::ofstream csv(uaDir / "utilityAllocation.csv");
    csv << "unit,port,duty_kW,process_T_K,tier,utility,massflow_kg_s,load_MW,cost_eur_h\n";
    for (const auto& r : rows)
        csv << r.unit << ',' << r.port << ',' << r.duty_kW << ',' << r.T << ',' << r.tier << ','
            << r.utility << ',' << r.kg_s << ',' << r.MW << ',' << r.eur_h << '\n';
    csv.close();

    if (ctx.verbosity < 2) return;

    // ---- console ----------------------------------------------------------
    std::cout << "\n================  Utility allocation (from duties)  ================\n";
    if (rows.empty())
    {
        std::cout << "  (no unit reported a duty Q --- nothing to allocate)\n";
        std::cout << "====================================================================\n\n";
        return;
    }
    std::cout << "  unit         port        duty[kW]    T[K]   tier      utility          kg/s     EUR/h\n"
              << "  ----------  ----------  ---------  -------  --------  --------------  -------  -------\n";
    for (const auto& r : rows)
        std::cout << "  " << std::left << std::setw(11) << r.unit
                  << "  " << std::left << std::setw(10) << (r.port.empty() ? "-" : r.port) << std::right
                  << std::fixed << std::setprecision(3) << std::setw(10) << r.duty_kW
                  << std::setprecision(1) << std::setw(9) << r.T
                  << "  " << std::left << std::setw(8) << r.tier << std::right
                  << "  " << std::left << std::setw(14) << r.utility << std::right
                  << std::setprecision(4) << std::setw(9) << r.kg_s
                  << std::setprecision(2) << std::setw(9) << r.eur_h
                  //  A negative cost is a CREDIT the plant earns (steam raised,
                  //  power generated) -- said, never clamped (C52).
                  << (r.eur_h < 0.0 ? "  (credit)" : "") << "\n";
    if (!byUtil.empty())
    {
        std::cout << "  ---------------------------------------------------------------\n";
        std::cout << "  Totals by utility:\n";
        for (const auto& [name, agg] : byUtil)
            std::cout << "    " << std::left << std::setw(16) << name << std::right
                      << std::fixed << std::setprecision(4) << std::setw(9) << agg.first
                      << " kg/s   " << std::setprecision(2) << std::setw(9) << agg.second
                      << " EUR/h" << (agg.second < 0.0 ? "  (credit)" : "") << "\n";
    }
    std::cout << "====================================================================\n\n";
}

} // namespace Choupo
