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

#include "Signal.H"
#include "Signals.H"

#include <stdexcept>

namespace Choupo {

std::map<std::string, Signal::Factory>& Signal::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void Signal::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<Signal> Signal::New(const std::string& type)
{
    auto it = registry().find(type);
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error("Signal::New: unknown type '" + type
            + "'.  Registered:" + (avail.empty() ? " (none yet)" : avail));
    }
    return it->second();
}

std::vector<std::string> Signal::availableTypes()
{
    std::vector<std::string> v;
    v.reserve(registry().size());
    for (const auto& kv : registry()) v.push_back(kv.first);
    return v;
}

void Signal::registerBuiltins()
{
    registerType("step",
        []() -> std::unique_ptr<Signal> { return std::make_unique<StepSignal>(); });

    // The staircase has two spellings (`staircase` and the legacy `schedule`),
    // both the ZOH-over-a-list math --- so `type schedule;` inside a signal{}
    // block reads identically to the historic top-level Schedule controller.
    registerType("staircase",
        []() -> std::unique_ptr<Signal> { return std::make_unique<StaircaseSignal>(); });
    registerType("schedule",
        []() -> std::unique_ptr<Signal> { return std::make_unique<StaircaseSignal>(); });

    registerType("ramp",
        []() -> std::unique_ptr<Signal> { return std::make_unique<RampSignal>(); });

    registerType("pulse",
        []() -> std::unique_ptr<Signal> { return std::make_unique<PulseSignal>(); });

    // `sine` and `sinusoidal` are the same generator (the dict in the design
    // spells it `sinusoidal`; `sine` is the short form).
    registerType("sine",
        []() -> std::unique_ptr<Signal> { return std::make_unique<SineSignal>(); });
    registerType("sinusoidal",
        []() -> std::unique_ptr<Signal> { return std::make_unique<SineSignal>(); });

    // PRBS for identification experiments (forum #100.4/#101): a
    // maximal-length LFSR with a DECLARED seed -- deterministic, exactly
    // repeatable, period-verified at load.  Never runtime randomness.
    registerType("prbs",
        []() -> std::unique_ptr<Signal> { return std::make_unique<PrbsSignal>(); });
}

} // namespace Choupo
