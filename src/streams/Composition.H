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
    Composition.H

Description
    Shared parsing helper: read a composition block from a parent
    dict and return mole fractions (the canonical form everywhere
    downstream).

    Accepts three equivalent keywords --- pick exactly one:

        molarComposition  { benzene 0.50;  toluene 0.50; }   -- x_i
        massComposition   { benzene 0.40;  toluene 0.60; }   -- w_i (converted)
        composition       { benzene 0.50;  toluene 0.50; }   -- legacy alias of
                                                                molarComposition

    Mass fractions are converted to mole fractions at parse time via
        x_i = (w_i / MW_i) / Sigma_j (w_j / MW_j)
    using the per-component molar masses from the thermo package.

    A composition whose sum drifts more than 1e-3 from 1.0 prints a
    warning and is renormalised --- silent typos don't slip through.

    `context` is a short label (stream name, unit name) used in
    error / warning messages.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"
#include "thermo/ThermoPackage.H"

#include <string>

namespace Choupo {

sVector readComposition(const DictPtr&        parent,
                        const ThermoPackage&  thermo,
                        const std::string&    context);

} // namespace Choupo
