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
    This file is part of Choupo.  GPL-3.0-or-later, see LICENSE.

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
-------------------------------------------------------------------------------
Namespace
    Choupo::views

Description
    WHAT A TIME-INTEGRATED FLOWSHEET RUN PUBLISHES TO THE VIEWS (C487 slice 1,
    docs/design/a-post-processing-dictionary.md section 7).  The producers of
    a choupoCtrl / choupoSemiContinuous run are its DYNAMIC UNITS and, under
    choupoCtrl, its CONTROLLERS, both published as `unit:<name>` (a view
    writes `unitOp <name>;`; a unit and a controller never share a name,
    because the result's KPI block is already keyed by both):

      * the producer's KPIs as diagnostics (`T_final`, `n_<c>_final`,
        `MV_final`, `t_end` ...), each with the unit its key says;
      * ONE published table `trajectory`: the write grid of trajectory.csv.
        A unit's columns are `t` [s] and its state labels (`T` [K], `n_<c>`
        [kmol], `F_in` [kmol/s], `z_in_<c>` [-], `level` [m] ...); a
        controller's are `t`, `SP`, `PV`, `MV` (`MV` alone for an open-loop
        schedule, which measures nothing), the unit of PV / MV taken from the
        controlled and manipulated variable the controller names.

    THE SHAPE IS BatchPublications': the driver keeps its write grid in
    memory ONLY when the case declares views, hands the records here after
    the run, and the one Reader (Views.H) resolves them.  The KPI-unit rule
    is BatchPublications' own (`kpiUnitOfKey`), shared rather than copied.
    Built ONLY when the case declares views, so no other case's output moves.
\*---------------------------------------------------------------------------*/

#pragma once

#include "postProcessing/views/Views.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {
namespace views {

//  One producer's recorded write grid.
struct TimeSeriesRecord
{
    std::string name, type;
    std::vector<std::string> columns;        // every column except `t`
    std::vector<std::string> columnUnits;    // parallel to `columns`
    std::vector<scalar> t;                   // the write grid [s]
    std::vector<std::vector<scalar>> rows;   // rows[r][column]
    std::map<std::string, scalar> kpis;      // the result's KPI block of this producer
    std::map<std::string, std::string> kpiUnits;   // KPI key -> unit ("" = none)
};

//  The unit of a dynamic unit's state label (`T` -> K, `n_<c>` -> kmol,
//  `F_in` -> kmol/s, `level` -> m ...); "" where the label does not say it.
std::string stateLabelUnit(const std::string& label);

std::vector<Publication> publicationsOfTimeSeries(const std::vector<TimeSeriesRecord>& producers);

} // namespace views
} // namespace Choupo
