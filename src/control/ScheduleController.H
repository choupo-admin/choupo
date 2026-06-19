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
    Choupo::ScheduleController

Description
    Open-loop "controller" that writes a MV from a piecewise-constant
    time schedule.  Pedagogically a degenerate case of Controller ---
    the measurement port is ignored entirely --- but it slots cleanly
    into the same plumbing, which lets cases inject disturbances,
    setpoint changes, or fixed time-varying inputs without inventing a
    second event mechanism.

    Dict format:

        type         Schedule;
        actuator     { unit reactor;  mv T_in; }
        schedule
        (
            { time 0;    value 320.0; }
            { time 400;  value 310.0; }      // step disturbance at t = 400 s
            { time 800;  value 330.0; }      // another step at t = 800 s
        );

    Times must be ascending.  At each `update()` the controller scans
    the schedule and writes the value of the latest entry whose time
    has already elapsed.

    No PV reading, no integration, no gains.  The "lastCV" reported in
    the trajectory CSV is NaN, "lastMV" is the most recently written
    value, and "setpoint" mirrors lastMV (so the SP column shows the
    same step train --- useful for plotting).
\*---------------------------------------------------------------------------*/

#pragma once

#include "Controller.H"

namespace Choupo {

class ScheduleController : public Controller
{
public:
    ScheduleController() = default;

    const std::string& type() const override { return type_; }

    void initialise(const DictPtr&      ctrlDict,
                    const UnitResolver& resolveUnit) override;

    void update(scalar t, scalar dt) override;

    scalar lastCV()   const override { return 0.0; }  // unused
    scalar lastMV()   const override { return lastMV_; }
    scalar setpoint() const override { return lastMV_; }

private:
    inline static const std::string type_ = "Schedule";

    DynamicUnitOperation*  actUnit_ = nullptr;
    std::string            mvKey_;

    std::vector<std::pair<scalar, scalar>> entries_;   // (time, value)
    scalar                 lastMV_ = 0.0;
};

} // namespace Choupo
