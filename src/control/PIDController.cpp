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

#include "PIDController.H"

#include <algorithm>
#include <stdexcept>

namespace Choupo {

void PIDController::initialise(const DictPtr&      ctrlDict,
                               const UnitResolver& resolveUnit)
{
    // ---- Measurement port -------------------------------------------
    auto measDict = ctrlDict->subDict("measurement");
    const std::string measUnitName = measDict->lookupWord("unit");
    cvKey_ = measDict->lookupWord("cv");
    measUnit_ = resolveUnit(measUnitName);
    if (!measUnit_)
        throw std::runtime_error("PIDController '" + name_ + "':"
            " measurement.unit '" + measUnitName + "' not found");

    // ---- Actuator port ----------------------------------------------
    auto actDict = ctrlDict->subDict("actuator");
    const std::string actUnitName = actDict->lookupWord("unit");
    mvKey_ = actDict->lookupWord("mv");
    actUnit_ = resolveUnit(actUnitName);
    if (!actUnit_)
        throw std::runtime_error("PIDController '" + name_ + "':"
            " actuator.unit '" + actUnitName + "' not found");

    // ---- Setpoint ----------------------------------------------------
    SP_ = ctrlDict->lookupScalar("setpoint");

    // ---- Gains -------------------------------------------------------
    //  gains{} is small and CLOSED (Kp / Ki / Kd, parallel form), so a
    //  foreign key is always a mistake: the textbook form
    //  `gains { Kc 2.0; tauI 5.0; }` used to parse, default every gain to
    //  zero, and run the loop with NO control action at exit 0 -- the
    //  closed-loop plot was the open-loop response with a constant bias
    //  (2026-08-22 fresh-eyes audit).  A MISSING key stays a declared
    //  absence (an I-only controller is legitimate); a controller whose
    //  declared gains are ALL zero would do nothing and refuses too.
    auto gd = ctrlDict->subDict("gains");
    for (const auto& k : gd->keys())
        if (k != "Kp" && k != "Ki" && k != "Kd")
            throw std::runtime_error("PIDController '" + name_ + "': gains."
                + k + " is not a gain this controller reads -- the keys are"
                " Kp, Ki, Kd (parallel form).  Textbook Kc/tauI/tauD"
                " converts as Kp = Kc; Ki = Kc/tauI; Kd = Kc*tauD.");
    Kp_ = gd->lookupScalarOrDefault("Kp", 0.0);
    Ki_ = gd->lookupScalarOrDefault("Ki", 0.0);
    Kd_ = gd->lookupScalarOrDefault("Kd", 0.0);
    if (Kp_ == 0.0 && Ki_ == 0.0 && Kd_ == 0.0)
        throw std::runtime_error("PIDController '" + name_ + "': every gain"
            " in gains{} is zero (or absent) -- this controller would apply"
            " no action at all.  Declare at least one nonzero Kp, Ki or Kd,"
            " or remove the controller from the case.");

    // ---- Output limits / bias ---------------------------------------
    if (ctrlDict->found("output"))
    {
        auto od = ctrlDict->subDict("output");
        u_min_  = od->lookupScalarOrDefault("min",  -1e30);
        u_max_  = od->lookupScalarOrDefault("max",   1e30);
        u_bias_ = od->lookupScalarOrDefault("bias",  0.0);
    }
    if (u_min_ > u_max_)
        throw std::runtime_error("PIDController '" + name_ + "':"
            " output.min > output.max");

    // ---- Reset internal state ---------------------------------------
    integral_ = 0;
    prevPV_   = 0;
    primed_   = false;

    // Prime lastMV_ with the bias so the first trajectory write
    // reflects the controller's natural starting point.
    lastMV_ = std::clamp(u_bias_, u_min_, u_max_);
}

void PIDController::update(scalar /*t*/, scalar dt)
{
    if (dt <= 0.0) return;

    const scalar PV = measUnit_->getCV(cvKey_);
    const scalar e  = SP_ - PV;
    lastCV_ = PV;

    // Derivative on PV.  At the first call we have no previous PV,
    // so the derivative term is zeroed (avoids a transient spike).
    scalar dPVdt = 0.0;
    if (primed_) dPVdt = (PV - prevPV_) / dt;
    prevPV_ = PV;
    primed_ = true;

    // Unclamped output
    const scalar u_unclamped =
          u_bias_
        + Kp_ * e
        + Ki_ * integral_
        - Kd_ * dPVdt;          // sign: derivative on PV  ⇒ -Kd · dPV/dt

    const scalar u = std::clamp(u_unclamped, u_min_, u_max_);

    // Conditional integration (anti-windup): only advance the integral
    // when the unclamped output is INSIDE the bounds.  This is the
    // simplest robust anti-windup --- prevents accumulation when the
    // actuator is saturated.
    if (u_unclamped >= u_min_ && u_unclamped <= u_max_)
        integral_ += e * dt;     // rectangular for simplicity

    lastMV_ = u;
    actUnit_->setMV(mvKey_, u);
}

} // namespace Choupo
