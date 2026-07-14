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
    Choupo::StreamOverrides

    The outer driver's declared HAND on stream state (design forum #52/#53,
    2026-07-10).  A driver that varies a feed per pass -- a sweep over a feed
    composition, a design unknown on a steam flow -- used to write into the
    flowsheetDict `streams{}` block.  In a 0/ case that block is IGNORED, so
    the driver turned a knob connected to nothing and NOTHING went red
    (fitNRTL01's chi^2 degraded 100x in silence).

    The ruling: the hand grabs the SEEDED REGISTRY, in memory, after the 0/
    (or legacy) seeding of each pass -- never a dict.  The 0/ file stays the
    authored BASE value; the outerDict declares the knob; each application is
    announced.  Only a BOUNDARY stream (a domain inlet) or an EXPLICITLY
    DECLARED SEED (a `tearStreams` entry -- a legitimate initial condition for
    a multiplicity study, though not a physical inlet) may be manipulated;
    anything else is refused by name and role.

    The driver BUILDS one instance per pass and hands it EXPLICITLY down the
    call chain (driver -> simulate -> runSimulation -> Flowsheet); the
    Flowsheet applies it once to the fresh seeded state and never stores it
    globally.  It appeared in a first cut as an instance-singleton (the
    AdvisoryLog precedent) -- the arbiter killed that (forum #55 D4): the
    manipulation is INPUT to a pass, so it belongs in the pass's type; global
    state makes reset, isolated tests and driver composition fragile long
    before any concurrency exists.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <map>
#include <string>

namespace Choupo
{

class StreamOverrides
{
public:
    StreamOverrides() = default;

    // path: "<stream>.<field>" with field one of
    //   F | T | P | moleFraction.<component>
    // value in SI (the driver's dict parse already converted).
    void set(const std::string& path, scalar value) { values_[path] = value; }
    void clear()                                    { values_.clear(); }
    bool empty() const                              { return values_.empty(); }

    const std::map<std::string, scalar>& all() const { return values_; }

    // Translate a dict-spelled path ("streams.feed.molarComposition.ethanol")
    // into the channel spelling ("feed.moleFraction.ethanol").  ONE translator
    // for every driver -- the target-resolution rules live here, never copied
    // into sweep / designSpec / fit.
    static std::string fromDictPath(const std::string& dictPath)
    {
        std::string p = dictPath;
        if (p.rfind("streams.", 0) == 0) p = p.substr(8);
        const std::string mc = ".molarComposition.";
        const auto k = p.find(mc);
        if (k != std::string::npos)
            p = p.substr(0, k) + ".moleFraction." + p.substr(k + mc.size());
        return p;
    }

private:
    std::map<std::string, scalar> values_;
};

} // namespace Choupo
