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
    src/core/BatchPlanRecords.H

Description
    THE BATCH PLANT a case declares on its steady material balance and the
    engine designs (2026-10-19, DEV.md 4c C99) -- the plain record
    `postProcessing/BatchPlanPass` produces and the result JSON carries as
    its top-level `"batchPlan"` block.  Scalars, ints, bools and strings only,
    in `core` for the reason `ResultRecords.H` gives (debt D7): the engine
    PRODUCES it and the result CARRIES it.  EMPTY (`present` false) unless the
    postDict declares `batchPlan {}`, so every other result is unchanged.

    Units, every field: times in HOURS, masses in kg, volumes in m3, mass
    rates in kg/h, densities in kg/m3.  The method and every symbol are in
    `postProcessing/BatchPlanPass.H`.
\*---------------------------------------------------------------------------*/

#ifndef Choupo_core_BatchPlanRecords_H
#define Choupo_core_BatchPlanRecords_H

#include "core/Types.H"

#include <string>
#include <vector>

namespace Choupo {

//  One STAGE: the equipment that handles one lot at one step of the recipe,
//  grouping one or more flowsheet units.
struct BatchStage
{
    std::string name;
    std::string train;
    std::string type;                   // batch | semicontinuous
    std::vector<std::string> units;     // the flowsheet units it groups
    std::string holds;                  // the stream whose mass it handles
    std::string feeds;                  // the stage it discharges into ("" = none)
    std::string source, reason;

    scalar massRate       = 0;  // [kg/h]  the flowsheet rate of `holds`
    scalar massPerProduct = 0;  // [kg/kg] f_j = massRate / product rate
    scalar massPerLot     = 0;  // [kg]    f_j B

    //  batch only (zero otherwise)
    scalar bulkDensity    = 0;  // [kg/m3] declared
    scalar fillFraction   = 0;  // [-]     declared
    scalar sizeFactor     = 0;  // [m3/kg product] S_j = f_j / (rho phi)
    scalar volume         = 0;  // [m3]    S_j B, the stage
    scalar volumePerUnit  = 0;  // [m3]    S_j B / N_ip, one vessel
    scalar maxVolume      = 0;  // [m3]    declared, `largestEquipment` rule only

    //  semicontinuous only (zero otherwise)
    scalar rate           = 0;  // [kg/h]  m_j / t_op, the stage
    scalar ratePerUnit    = 0;  // [kg/h]  rate / N_ip, one machine
    std::string operatingFrom;  // declared | flowsheet
    scalar capacityRate   = 0;  // [kg/h]  the rating unit's own (flowsheet) rate
    std::string ratingUnit;     // the unit whose hardware rates it ("" = none)

    std::string sizeKind;       // volume | massRate
    int    inPhase        = 1;  // N_ip, units sharing one lot
    int    outOfPhase     = 1;  // N_op, units taking alternate lots
    int    unitsInstalled = 1;  // N_ip x N_op

    scalar chargeTime     = 0;  // [h]
    scalar processTime    = 0;  // [h] processing (batch) or operating (semicontinuous)
    scalar dischargeTime  = 0;  // [h]
    std::string dischargeFrom;  // declared | fedStage
    scalar cleanTime      = 0;  // [h]
    scalar cycleTime      = 0;  // [h] t_j, the four summed
    scalar effectiveCycle = 0;  // [h] t_j / N_op
    scalar utilisation    = 0;  // [-] t_j / (N_op T_L)
    bool   limiting       = false;
    scalar offset         = 0;  // [h] start of the campaign's first lot here
    scalar busyHours      = 0;  // [h/yr] per unit
    scalar occupancy      = 0;  // [-] busyHours / the train's available time
    scalar idleHours      = 0;  // [h/yr] per unit
};

//  One TRAIN: stages that run lot by lot together; two trains are decoupled
//  by an intermediate store, and each keeps its own cycle and campaigns.
struct BatchTrain
{
    std::string name;
    std::string source, reason;
    std::vector<std::string> stages;
    scalar availableTime    = 0;  // [h/yr] declared
    int    lotsPerCampaign  = 1;  // declared
    scalar changeover       = 0;  // [h] declared, once per campaign
    scalar cycleTime        = 0;  // [h] T_L = max over stages of t_j / N_op
    std::string limitingStage;
    int    campaigns        = 0;  // per year
    scalar campaignSpan     = 0;  // [h] makespan of a full campaign
    scalar campaignDuration = 0;  // [h] span + changeover
    scalar requiredTime     = 0;  // [h/yr] every campaign of the year
    scalar occupancy        = 0;  // [-] requiredTime / availableTime
};

//  One bar of a train's FIRST campaign (every later campaign repeats it,
//  shifted by the campaign duration; the last may hold fewer lots).
struct BatchGanttRow
{
    std::string train, stage;     // stage "changeover" for the train's clean
    int    lot   = 0;             // 1-based; 0 for the changeover
    int    unit  = 0;             // 1-based out-of-phase unit; 0 changeover
    scalar start = 0, end = 0;    // [h] from the campaign's start
};

struct BatchFinding
{
    std::string id;       // <kind>:<subject>
    std::string kind;     // lowUtilisation | idleTrain | capacityMismatch
    std::string subject;
    scalar      value = 0;
    scalar      limit = 0;
    std::string message;
};

struct BatchPlanRecord
{
    bool        present = false;
    std::string product;             // the flowsheet stream that IS the product
    scalar      productRate    = 0;  // [kg/h] its flowsheet rate
    scalar      productPerYear = 0;  // [kg/yr] Q, declared
    std::string productionSource, productionReason;

    std::string lotRule;             // declared | largestEquipment
    std::string lotStream;           // the stream the lot is declared on
    scalar      lotStreamMass  = 0;  // [kg] of `lotStream` per lot
    scalar      lotSize        = 0;  // [kg of product] B
    std::string lotLimitingStage;    // largestEquipment only
    std::string lotSource, lotReason;
    int         lotsPerYear    = 0;  // N = ceil(Q / B)
    scalar      production     = 0;  // [kg/yr] N B

    scalar      equivalentHours = 0; // [h/yr] Q / productRate
    scalar      streamFactor    = 0; // [-]    equivalentHours / 8760

    scalar      lowUtilisation  = 0; // [-] the threshold the announcements use
    bool        lowUtilisationDeclared = false;

    std::vector<BatchStage>    stages;
    std::vector<BatchTrain>    trains;
    std::vector<BatchGanttRow> gantt;
    std::vector<BatchFinding>  findings;
    std::vector<std::string>   unplannedUnits;   // flowsheet units in no stage

    //  The stage that groups `unit`, or nullptr.
    const BatchStage* stageOfUnit(const std::string& unit) const
    {
        for (const auto& s : stages)
            for (const auto& u : s.units)
                if (u == unit) return &s;
        return nullptr;
    }
};

} // namespace Choupo

#endif
