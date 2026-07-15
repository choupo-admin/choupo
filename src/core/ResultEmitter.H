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
Function
    Choupo::emitResultJson

Description
    Hand-rolled JSON emitter for SimulationResult.  Writes one structured
    block to stdout, delimited by two recognisable marker lines, so that
    any downstream consumer (the browser GUI, a shell script with `awk`,
    a Python notebook) can extract the result without re-parsing the
    iteration log.

Output layout
    <<<Choupo:result-begin>>>
    { "version": 1,
      "converged": true,
      "components": ["ethanol", "water"],
      "streams": {
         "feed":       { "F": 1.0, "T": 350.0, "P": 1.01325,
                         "composition": { "ethanol": 1.0, "water": 0.0 }},
         "reactorOut": {... },
...
      },
      "kpis": {
         "reactor":   { "iterations": 4, "X_limiting": 0.5238,... },
         "separator": {... }
      }
    }
    <<<Choupo:result-end>>>

    Role classification (feed / intermediate / product) is intentionally
    NOT emitted here — it depends on the flowsheet topology and is
    cheap for the consumer to compute from the case's flowsheetDict.

Why a hand-rolled emitter
    Keeps the C++ dependency footprint at zero (consistent with the
    rest of Choupo) and lets every byte be visible to a student
    reading the source.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/SimulationResult.H"

#include <ostream>

namespace Choupo {

void emitResultJson(std::ostream& os, const SimulationResult& r);

// THE JSON string escaper (forum #75-2): one implementation, used by every
// result emitter in every binary.  A human justification with quotes or a
// newline must never corrupt the machine stream.
std::string jsonEscape(const std::string& s);

// ONE emitter of the advisories JSON array (forum #77-6) -- both binaries'
// result streams consume this; two copies of a schema is how they diverge.
struct Advisory;   // fwd (core/Advisory.H)
std::string advisoriesJson(const std::vector<Advisory>& advs);

} // namespace Choupo
