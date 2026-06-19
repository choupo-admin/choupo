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
    Choupo::ProfilesReport

Description
    Dumps each unit op's internal profile (the distillation column's
    per-stage T-x-y, the PFR's axial conversion, the membrane's J_w(z)
    and c_b(z),...) to `reports/unitOperations/<unit>/profile.csv`.
    The CSV's first column is the profile's independent axis (stage,
    V, z,...); the remaining columns follow.  Any `markers` the unit
    declared (e.g. the column's feed stage) go to a sibling
    `markers.csv`.

    Reads `SimulationResult.profiles` (populated by every unit op that
    overrides producedProfiles()).  Units without an internal profile
    simply produce no folder.

    Dict form:

        profiles { }                       // all units that have one
        profiles { units (column ); }     // only the named units
\*---------------------------------------------------------------------------*/

#pragma once

#include "Report.H"

namespace Choupo {

class ProfilesReport : public Report
{
public:
    const std::string& type() const override { return type_; }
    void run(const DictPtr& dict, const ReportContext& ctx) override;

private:
    inline static const std::string type_ = "profiles";
};

} // namespace Choupo
