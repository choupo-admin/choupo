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
    WHAT A BATCH RUN PUBLISHES TO THE VIEWS (C477, docs/design/a-post-
    processing-dictionary.md section 7).  The producers of a choupoBatch run
    are its VESSELS, published as `unit:<name>`, and nothing else is invented:

      * the vessel's KPIs as diagnostics (`T_final`, `n_<c>_final`, `tauIgnition`
        ...), the unit of each where the key says it, plus per component the
        final mole fraction `x_<c>_final` ("-") and `ppm_<c>_final` ("ppm"),
        and `ppm_NOx_final` when the package holds both NO and NO2
        (NOx = NO + NO2, the sum the combustion literature plots);
      * ONE published table `trajectory`: the write grid of trajectory.csv,
        `t` [s], `T` [K], and per component that ever held material `x_<c>`
        and `ppm_<c>`, `ppm_NOx`, then the vessel's own trajectory extras (a
        route integral's `cumNO_<route>`).

    Built ONLY when the case declares views, so no other case's output moves.
\*---------------------------------------------------------------------------*/

#pragma once

#include "postProcessing/views/Views.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {
namespace views {

struct BatchVesselRecord
{
    std::string name, type;
    std::vector<std::string> componentNames;
    std::vector<scalar> t, T;                       // the write grid
    std::vector<std::vector<scalar>> n;             // n[row][component] [kmol]
    std::vector<std::string> extraNames;            // trajectoryExtras keys
    std::vector<std::vector<scalar>> extras;        // extras[row][k], NaN = withheld
    std::map<std::string, scalar> kpis;             // the result's KPI block
    bool dropTimeZero = false;                      // log write grid: a log axis cannot draw t = 0
};

std::vector<Publication> publicationsOfBatchRun(const std::vector<BatchVesselRecord>& vessels);

} // namespace views
} // namespace Choupo
