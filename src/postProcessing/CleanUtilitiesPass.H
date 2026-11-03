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
Class
    Choupo::CleanUtilitiesPass

Description
    THE CLEAN UTILITIES OF A DRUG-PRODUCT BUILDING, FED BY THE BUILDING THE
    CASE ALREADY DECLARES (2026-11-02, DEV.md 4c C195).  A GMP building's air
    and its purified water are the capital items every pharmaceutical project
    describes and none of the 19 reports surveyed calculated.  The building
    (`system/layoutDict`, `building {}`) already knows each room's plan, its
    floor's height and its grade; the batch plan already knows the lot, the
    stages and the Gantt.  This pass sizes the utilities from those two and
    from numbers the case declares, and adds NO physics.

    IT RUNS AFTER THE LAYOUT: `result.building` is read as the layout
    evaluated it (the ONE parse of the rooms; this file reads no dictionary of
    rooms).  `main.cpp` checks the layout before the first of `economics` and
    `cleanUtilities` in the chain.

    HVAC (`hvac { ... }`).  Per room: volume = plan area x height (the floor's
    own, or the room's declared one); supply flow = the grade's DECLARED air
    changes per hour x volume; fan power = flow x the declared pressure rise /
    the declared efficiency; and the SENSIBLE duty to bring the FRESH-AIR share
    (declared) from the declared outdoor design temperature to the declared
    supply temperature -- heating in winter, cooling in summer.  Published as
    one item per grade present and one for the total.  EVERY run announces what
    is NOT here: no humidity, no latent load (dehumidification), no room heat
    gain (machines, people, lighting), the recirculated air taken as returning
    at the supply temperature, no filtration pressure drop beyond the declared
    rise.  The air changes per hour are the CASE's, one per grade, each with a
    source and a reason: the published tables are no-grant standards and none
    is shipped; a grade present in the building with no declared rate REFUSES
    by name.

    PURIFIED WATER (`purifiedWater { ... }`).  Demand per lot = the declared
    water streams of the flowsheet (kg per lot from the converged balance and
    the plan's lot hours, over the declared density) + the declared cleaning
    volumes per lot.  Each use is placed in a stage of the batch plan, drawn
    over its declared `drawTime` at the start or the end of that stage's cycle;
    the PEAK is the largest sum of the draws that overlap in the plan's Gantt
    (the first campaign of every train started together -- the conservative
    reading, said).  The generator is rated at the peak x (1 + the declared
    margin); the storage tank holds the declared hold time of the peak.  Both
    are items; neither is costed (no correlation) and neither is placed (the
    layout is already checked).

    THE AIR IS PRICED, THE WATER PLANT IS NOT (DEV.md 4c C210, E2).  The pass
    runs BEFORE `costing`, and each `hvac/grade<G>` item is priced by the
    case's own declared installed cost per m3/h of supply air -- a
    `costing { quotes }` entry `hvacGrade <G>; valuePerSupplyAir <price>;
    currency; year; basis; kind; source; reason;` read by
    `costing/DeclaredQuote` (the same arithmetic as any quote: escalation,
    currency, installed or purchased, C_TM = 1.18 C_BM).  A grade with no such
    entry REFUSES in the costing pass by name and the capital total reads
    INCOMPLETE -- no default, no table is shipped.  `hvac/total` is the sum of
    the grades and is not priced twice.

    The items are `ratedMachine`-like in spirit: `notCostedBecause`,
    `notPlacedBecause`, units on every value, a `basis`.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PostProcessor.H"

namespace Choupo {

class CleanUtilitiesPass : public PostProcessor
{
public:
    explicit CleanUtilitiesPass(const DictPtr& dict) : dict_(dict) {}

    const std::string& type() const override { return type_; }
    int                run(SimulationResult& result) override;

private:
    inline static const std::string type_ = "cleanUtilities";
    DictPtr dict_;
};

} // namespace Choupo
