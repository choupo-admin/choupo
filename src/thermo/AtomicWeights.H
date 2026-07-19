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
    src/thermo/AtomicWeights.H

Description
    THE shared standard-atomic-weight catalogue [kg/kmol == g/mol] -- one
    home, consumed by the elemental-composition resolver; never copied into
    a consumer.  Values are the IUPAC/CIAAW 2021 standard atomic weights
    (Prohaska et al., Pure Appl. Chem. 94 (2022) 573, "Standard atomic
    weights of the elements 2021"), abridged to conventional single values;
    D and T carry their own isotopic masses (CIAAW/AME2020).  Elements with
    no stable isotope carry the mass number of the longest-lived isotope,
    bracketed by IUPAC -- adequate for a conservation DIAGNOSTIC, and no
    real formula in the catalogue reaches them.

    Returns 0.0 for an unknown symbol -- the CALLER refuses loudly (the
    resolver never fabricates a weight).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <string>

namespace Choupo {

// Standard atomic weight [kg/kmol]; 0.0 when the symbol is unknown.
scalar atomicWeight(const std::string& symbol);

} // namespace Choupo
