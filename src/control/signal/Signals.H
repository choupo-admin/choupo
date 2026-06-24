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
    src/control/signal/Signals.H

Description
    The concrete Signal value generators (the forcing-function vocabulary):

      StepSignal       t < tStep ? mean : step                  (a single jump)
      StaircaseSignal  ZOH over an ascending (time,value) list  (== the legacy
                       ScheduleController body, kept as the staircase math source)
      RampSignal       mean + slope*max(0, min(t,tEnd)-tStart)
      PulseSignal      mean + amplitude on [tStart, tStart+width], else mean
      SineSignal       mean + amplitude*sin(2*pi*(t-tStart)/period + phase)

    Each is a PURE function of t (no process feedback).  All parameters are
    explicit in the dict --- no auto-centring.
\*---------------------------------------------------------------------------*/

#pragma once

#include "Signal.H"

namespace Choupo {

// ---------------------------------------------------------------------------
//  StepSignal:  a single jump at t = tStep.
// ---------------------------------------------------------------------------
class StepSignal : public Signal
{
public:
    const std::string& type() const override { return type_; }
    void   initialise(const DictPtr& d) override;
    scalar value(scalar t) const override;

private:
    inline static const std::string type_ = "step";
    scalar mean_  = 0.0;
    scalar step_  = 0.0;   // value AFTER the jump = mean_ ... but stored as the
                           // post-step ABSOLUTE value (see initialise()).
    scalar tStep_ = 0.0;
};

// ---------------------------------------------------------------------------
//  StaircaseSignal:  zero-order-hold over an ascending (time, value) list.
//  This is the verbatim body of the legacy ScheduleController --- the ONE
//  source of truth for the staircase math (the schedule still works).
// ---------------------------------------------------------------------------
class StaircaseSignal : public Signal
{
public:
    const std::string& type() const override { return type_; }
    void   initialise(const DictPtr& d) override;
    scalar value(scalar t) const override;

private:
    inline static const std::string type_ = "staircase";
    std::vector<std::pair<scalar, scalar>> entries_;   // (time, value), sorted
};

// ---------------------------------------------------------------------------
//  RampSignal:  a linear ramp of slope `slope` starting at tStart, optionally
//  saturating at tEnd (held flat thereafter).
// ---------------------------------------------------------------------------
class RampSignal : public Signal
{
public:
    const std::string& type() const override { return type_; }
    void   initialise(const DictPtr& d) override;
    scalar value(scalar t) const override;

private:
    inline static const std::string type_ = "ramp";
    scalar mean_   = 0.0;
    scalar slope_  = 0.0;    // value-units per second
    scalar tStart_ = 0.0;
    scalar tEnd_   = 1.0e30; // absent => never saturates
};

// ---------------------------------------------------------------------------
//  PulseSignal:  a rectangular pulse of height `amplitude` over
//  [tStart, tStart+width], mean elsewhere.
// ---------------------------------------------------------------------------
class PulseSignal : public Signal
{
public:
    const std::string& type() const override { return type_; }
    void   initialise(const DictPtr& d) override;
    scalar value(scalar t) const override;

private:
    inline static const std::string type_ = "pulse";
    scalar mean_      = 0.0;
    scalar amplitude_ = 0.0;
    scalar tStart_    = 0.0;
    scalar width_     = 0.0;
};

// ---------------------------------------------------------------------------
//  SineSignal:  mean + amplitude*sin(2*pi*(t-tStart)/period + phase).
//  `period` XOR `frequency` (cross-rejected); the twin is printed.
// ---------------------------------------------------------------------------
class SineSignal : public Signal
{
public:
    const std::string& type() const override { return type_; }
    void   initialise(const DictPtr& d) override;
    scalar value(scalar t) const override;

private:
    inline static const std::string type_ = "sine";
    scalar mean_      = 0.0;
    scalar amplitude_ = 0.0;
    scalar period_    = 1.0;   // s
    scalar phase_     = 0.0;   // radians
    scalar tStart_    = 0.0;
};

} // namespace Choupo
