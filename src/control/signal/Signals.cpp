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

#include "Signals.H"
#include "core/Constants.H"

#include <algorithm>
#include <cmath>
#include <iostream>
#include <stdexcept>

namespace Choupo {

// ===========================================================================
//  StepSignal:   t < tStep ? mean : mean + step
// ===========================================================================
void StepSignal::initialise(const DictPtr& d)
{
    mean_  = d->lookupScalar("mean");
    step_  = d->lookupScalar("step");      // deviation added AFTER tStep
    tStep_ = d->lookupScalarOrDefault("tStep", 0.0);
}

scalar StepSignal::value(scalar t) const
{
    return (t < tStep_) ? mean_ : mean_ + step_;
}

// ===========================================================================
//  StaircaseSignal:  ZOH over an ascending (time,value) list.  This body is
//  the verbatim legacy ScheduleController math --- keep it identical so the
//  step train of every existing ctrl case stays byte-for-byte the same.
// ===========================================================================
void StaircaseSignal::initialise(const DictPtr& d)
{
    auto schedList = d->lookupDictList("schedule");
    if (schedList.empty())
        throw std::runtime_error("StaircaseSignal: schedule list is empty");

    entries_.clear();
    entries_.reserve(schedList.size());
    for (const auto& e : schedList)
    {
        const scalar t = e->lookupScalar("time");
        const scalar v = e->lookupScalar("value");
        entries_.emplace_back(t, v);
    }
    std::sort(entries_.begin(), entries_.end(),
              [](const auto& a, const auto& b) { return a.first < b.first; });
}

scalar StaircaseSignal::value(scalar t) const
{
    // Walk the (sorted) schedule, pick the latest entry with time <= t.
    // The +1e-12 tolerance and front-default are PRESERVED from the legacy
    // ScheduleController::update so the trajectory is byte-identical.
    scalar val = entries_.front().second;
    for (const auto& [tk, v] : entries_)
    {
        if (tk <= t + 1.0e-12) val = v;
        else                    break;
    }
    return val;
}

// ===========================================================================
//  RampSignal:   mean + slope * max(0, min(t, tEnd) - tStart)
// ===========================================================================
void RampSignal::initialise(const DictPtr& d)
{
    mean_   = d->lookupScalar("mean");
    slope_  = d->lookupScalar("slope");
    tStart_ = d->lookupScalarOrDefault("tStart", 0.0);
    tEnd_   = d->lookupScalarOrDefault("tEnd", 1.0e30);
}

scalar RampSignal::value(scalar t) const
{
    const scalar tc = std::min(t, tEnd_);
    const scalar dt = std::max<scalar>(0.0, tc - tStart_);
    return mean_ + slope_ * dt;
}

// ===========================================================================
//  PulseSignal:  rectangular pulse of height amplitude on [tStart,tStart+width]
// ===========================================================================
void PulseSignal::initialise(const DictPtr& d)
{
    mean_      = d->lookupScalar("mean");
    amplitude_ = d->lookupScalar("amplitude");
    tStart_    = d->lookupScalarOrDefault("tStart", 0.0);
    width_     = d->lookupScalar("width");
}

scalar PulseSignal::value(scalar t) const
{
    const bool inside = (t >= tStart_) && (t < tStart_ + width_);
    return inside ? mean_ + amplitude_ : mean_;
}

// ===========================================================================
//  SineSignal:  mean + amplitude * sin(2*pi*(t-tStart)/period + phase).
//  `period` XOR `frequency` (cross-rejected); the derived twins are printed.
// ===========================================================================
void SineSignal::initialise(const DictPtr& d)
{
    mean_      = d->lookupScalar("mean");
    amplitude_ = d->lookupScalar("amplitude");
    phase_     = d->lookupScalarOrDefault("phase", 0.0);
    tStart_    = d->lookupScalarOrDefault("tStart", 0.0);

    const bool hasPeriod = d->found("period");
    const bool hasFreq   = d->found("frequency");
    if (hasPeriod && hasFreq)
        throw std::runtime_error("SineSignal: specify `period` XOR `frequency`,"
            " not both (they are the same datum: f = 1/period)");
    if (!hasPeriod && !hasFreq)
        throw std::runtime_error("SineSignal: needs a `period` (s) or a"
            " `frequency` (Hz)");

    if (hasPeriod)
        period_ = d->lookupScalar("period");
    else
    {
        const scalar f = d->lookupScalar("frequency");
        if (f <= 0.0)
            throw std::runtime_error("SineSignal: frequency must be > 0");
        period_ = 1.0 / f;
    }
    if (period_ <= 0.0)
        throw std::runtime_error("SineSignal: period must be > 0");

    // Glass-box: print the derived twins so a student sees f and omega.
    const scalar f     = 1.0 / period_;
    const scalar omega = 2.0 * constant::pi * f;
    std::cout << "  Signal[sine]:  mean=" << mean_
              << "  amplitude=" << amplitude_
              << "  period=" << period_ << " s"
              << "  (f=" << f << " Hz, omega=" << omega << " rad/s)"
              << "  phase=" << phase_ << " rad\n";
}

scalar SineSignal::value(scalar t) const
{
    const scalar arg = 2.0 * constant::pi * (t - tStart_) / period_ + phase_;
    return mean_ + amplitude_ * std::sin(arg);
}

} // namespace Choupo
