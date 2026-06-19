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
    PropertyEvaluator.H

Description
    One-stop evaluator for the property keywords supported by the
    `propertyScan1D` / `propertyScan2D` ops.  Encapsulates the per-point
    lookup so the scan ops share a single property catalogue.

    Supported keywords:

      Single-value:         T   P
      Pure / mixture VLE:   Psat_<comp>   T_bubble   T_dew
      Activity model:       gamma_<comp>
      Ideal-gas mixture:    H_ig   S_ig   Cp_ig
      Real-gas mixture:     Z   v_molar   H_R   S_R   H_real   S_real

    Throws with a clear, student-readable message if the keyword is
    not in the catalogue, or if the state is missing a piece of data
    that the keyword needs (e.g. Psat for a non-volatile component).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"
#include <string>

namespace Choupo {

class ThermoPackage;

namespace propertyOps {

scalar evaluateProperty(const std::string& propKey,
                        const ThermoPackage& thermo,
                        scalar T_K,
                        scalar P_Pa,
                        const sVector& xLiquid);

} // namespace propertyOps
} // namespace Choupo
