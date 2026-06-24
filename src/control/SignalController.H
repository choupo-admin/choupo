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
    Choupo::SignalController

Description
    The GENERALISED open-loop "controller": it owns a `Signal` (step,
    staircase, ramp, pulse, sine) and at each sample writes signal.value(t)
    into a named MV of a unit --- exactly like ScheduleController, but with
    the WHOLE forcing-function vocabulary instead of only the staircase.

    It reads NO measurement (open loop): `lastCV()` is 0, while `lastMV()`
    and `setpoint()` both mirror the forcing value (so the SP/MV columns of
    the trajectory CSV show the injected signal --- ready to plot against
    the closed-loop PV).

    Dict format (file-first):

        {
            name      FeedDist;
            type      Signal;
            actuator  { unit reactor;  mv T_in; }      // (or `target T_in;`)
            signal
            {
                type        sinusoidal;
                mean        320 K;
                amplitude   15 K;
                period      600 s;
            }
        }

    ScheduleController is RETAINED (legacy `type Schedule; schedule(...)`),
    now delegating to StaircaseSignal so both spellings share one math.

    Explicit factory, registered as "Signal" in Controller::registerBuiltins.
\*---------------------------------------------------------------------------*/

#pragma once

#include "Controller.H"
#include "signal/Signal.H"

namespace Choupo {

class SignalController : public Controller
{
public:
    SignalController() = default;

    const std::string& type() const override { return type_; }

    void initialise(const DictPtr&      ctrlDict,
                    const UnitResolver& resolveUnit) override;

    void update(scalar t, scalar dt) override;

    scalar lastCV()   const override { return 0.0; }   // open loop, no PV
    scalar lastMV()   const override { return lastMV_; }
    scalar setpoint() const override { return lastMV_; }

private:
    inline static const std::string type_ = "Signal";

    DynamicUnitOperation*    actUnit_ = nullptr;
    std::string              mvKey_;
    std::unique_ptr<Signal>  signal_;
    scalar                   lastMV_ = 0.0;
};

} // namespace Choupo
