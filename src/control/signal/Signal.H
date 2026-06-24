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
    Choupo::Signal

Description
    Abstract base for a pure TIME-SIGNAL value generator: a deterministic
    function  value(t)  with no state read from the process.  It is the
    forcing-function vocabulary of dynamic process control --- a step, a
    staircase, a ramp, a rectangular pulse, a sinusoid --- factored OUT of
    any controller so the SAME shapes drive a setpoint change, an inlet
    disturbance, or a fixed time-varying input.

    Pedagogy (Seborg/Edgar/Mellichamp/Doyle Ch. 5 forcing functions; Ch.
    13-14 frequency response):  inject a sinusoid on an inlet, watch the
    PID chase a moving target, read the steady-cycling output amplitude
    ratio + phase lag --- that is one point of a Bode plot, built by
    trial-and-error.  Every parameter (mean, amplitude, period) is
    EXPLICIT in the dict (never auto-centred): the glass-box, no-silent-
    crutch stance.

    Dict format (file-first), inside a controller's `signal {}` sub-dict:

        signal
        {
            type        sine;        // step | staircase | ramp | pulse | sine
            mean        320 K;       // baseline value (the offset)
            amplitude   15 K;        // (sine/pulse) peak deviation
            period      600 s;       // (sine) period --- OR `frequency`
            phase       0;           // (sine) radians
            tStart      0 s;         // (sine/ramp/pulse) signal onset
        }

    Explicit factory, same as every other base in the project.  No
    auto-registration --- `registerBuiltins()` is called in main.cpp.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {

class Signal
{
public:
    virtual ~Signal() = default;

    virtual const std::string& type() const = 0;

    // Parse the signal's parameters from its `signal {}` sub-dict.  Each
    // concrete signal reads exactly the keys it needs and (where useful)
    // PRINTS its derived twins (e.g. f = 1/period) for glass-box clarity.
    virtual void initialise(const DictPtr& signalDict) = 0;

    // The deterministic forcing value at time t [s].
    virtual scalar value(scalar t) const = 0;

    // ---- Factory (explicit registry) ----
    using Factory = std::function<std::unique_ptr<Signal>()>;

    static void                          registerType(const std::string& name, Factory f);
    static std::unique_ptr<Signal>       New(const std::string& type);
    static void                          registerBuiltins();
    static std::vector<std::string>      availableTypes();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
