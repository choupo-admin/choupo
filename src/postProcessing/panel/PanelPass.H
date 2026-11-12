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
Namespace
    Choupo::panel

Description
    THE OPERATOR PANEL, READ AND CHECKED (2026-11-12, DEV.md 4c C371 slice
    S1; docs/design/operator-panel-in-the-case.md).  `system/panelDict` is
    DECLARED by the case; this pass, run AFTER the time loop, READS it,
    REFUSES what is not a panel (by name, with the remedy) and REPORTS FACTS
    about the panel that is one.  It reports facts and never a grade: whether
    a panel lets a person tell what the process is doing is the person's
    exercise, and no engine can mark it.

    WHY THE PHYSICS CANNOT SEE IT, structurally and not by care:
      * it lives in `postProcessing/`, a band `check_layering` forbids every
        `unitOperations`, `thermo` and `solver` file from including;
      * its inputs are a `const PublishedSeries&` (the labels and rows
        `trajectory.csv` carries, kept in memory), the panel dict, and a
        `Context` of NAMES -- it holds no pointer to a unit or a controller;
      * the driver calls it once, after the integration loop has ended.

    FACTS (definitions in docs/design/operator-panel-in-the-case.md section
    5; every crossing is resolved to the WRITE GRID, so an excursion shorter
    than one `writeInterval` is missed and a crossing between two writes is
    seen at the next one -- the remedy is a smaller `writeInterval`):
      notPublished, constant, outOfRange, limitOutsideRange, violated /
      neverViolated / alwaysViolated, neverApproached, controllerWithout-
      Element, sameQuantityAlarms, alarmsActive, message (fired or not).
    NOT BUILT here: `draftDiffers` (it needs the draft rules of slice S3).

    The numbers carry the unit the series is published in: no trajectory
    column declares its dimension today, so a `range` or `limit` written
    without a named unit is read as that column's own unit, and the engine
    cannot check the dimension (record, open item 7).  A scalar written with
    a named unit (`313.15 K`) is converted to SI.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/PanelRecords.H"

#include <string>
#include <vector>

namespace Choupo {
namespace panel {

//- A controller the flowsheet declares: its name and the measurement it
//  reads (its `PV`).  A controller with no measurement block carries none.
struct ControllerInfo
{
    std::string name;
    std::string type;       // PID | Schedule | Signal
    std::string pvUnit;     // measurement { unit }  ("" = none)
    std::string pvCv;       // measurement { cv }
};

//- What the panel's names are checked against: names only, no handles.
struct Context
{
    std::vector<std::string>    units;         // the flowsheet's unit names
    std::vector<ControllerInfo> controllers;   // its `controllers` list
    bool                        hasRecipe = false;
};

//- The controllers of a flowsheetDict (empty when it declares none).
std::vector<ControllerInfo> controllersOf(const Dictionary& flowsheetDict);

//- Read `panelDict`, refuse what is malformed (throws std::runtime_error,
//  the message naming the defect and the remedy) and compute the facts over
//  `series`.  `present` is true on the result.
PanelRecord evaluate(const Dictionary&      panelDict,
                     const PublishedSeries& series,
                     const Context&         ctx);

} // namespace panel
} // namespace Choupo
