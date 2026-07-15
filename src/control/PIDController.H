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
    Choupo::PIDController

Description
    Standard ideal-form PID:

        e(t) = SP - PV
        u(t) = u_0 + Kp · e + Ki · ∫_0^t e dτ + Kd · de/dt

    Implementation choices for pedagogical correctness and basic
    robustness:

      * Derivative on PV (not on error).  Eliminates the impulsive
        "set-point kick" when the user changes SP during a run.
      * Rectangular (Euler) integration of the error for the integral term.
      * Anti-windup: output is clamped to [u_min, u_max].  When the
        unclamped u exceeds a bound, the integral term is *not*
        advanced for that step (clamping back-calculation light).
        This is the simplest robust strategy --- prevents the integral
        from accumulating against a saturated actuator.

    Direct vs reverse action: the sign of Kp encodes the action.  A
    cooling jacket (Kp > 0) makes T_jacket DROP as PV rises; the user
    chooses the sign that gives stable closed-loop response for their
    system.

    Dict keys parsed by initialise():

        type            PID;
        measurement     { unit reactor;  cv T; }
        actuator        { unit reactor;  mv T_jacket; }
        setpoint        350.0;
        gains           { Kp 5.0;  Ki 0.05;  Kd 0.0; }
        output          { min 280.0;  max 400.0;  bias 300.0; }
\*---------------------------------------------------------------------------*/

#pragma once

#include "Controller.H"

namespace Choupo {

class PIDController : public Controller
{
public:
    PIDController() = default;

    const std::string& type() const override { return type_; }

    void initialise(const DictPtr&      ctrlDict,
                    const UnitResolver& resolveUnit) override;

    void update(scalar t, scalar dt) override;

    scalar lastCV()    const override { return lastCV_; }
    scalar lastMV()    const override { return lastMV_; }
    scalar setpoint()  const override { return SP_; }

    void setSetpoint(scalar sp) { SP_ = sp; }

private:
    inline static const std::string type_ = "PID";

    // Bindings
    DynamicUnitOperation*   measUnit_ = nullptr;
    DynamicUnitOperation*   actUnit_  = nullptr;
    std::string             cvKey_;
    std::string             mvKey_;

    // Tuning
    scalar Kp_ = 0;
    scalar Ki_ = 0;
    scalar Kd_ = 0;

    // Output limits and bias
    scalar u_min_ = -1e30;
    scalar u_max_ =  1e30;
    scalar u_bias_ = 0;

    // Setpoint
    scalar SP_ = 0;

    // Internal state
    scalar integral_     = 0;
    scalar prevPV_       = 0;
    bool   primed_       = false;
    scalar lastCV_       = 0;
    scalar lastMV_       = 0;
};

} // namespace Choupo
