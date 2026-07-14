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
    Choupo::reactionHeat

    ONE shared resolver for the heat of reaction, so every reactor -- steady
    (conversion / yield / gibbs / CSTR / PFR) AND time-dependent (batchReactor,
    dynamicCSTR) -- speaks the SAME enthalpy base: the elements / formation
    datum.  The heat of reaction is

          dH_rxn(T) = Σ νᵢ · hᵢ(T)          [J per mole of extent]

    where each hᵢ carries ΔHf°(elements, 25 °C) from its gibbsFormation{} block
    (phase-aware: h_pure_ig for "gas", h_formation(T,"liquid") otherwise).

    The reactions-dict `dH_rxn` key is DEMOTED to an explicit, announced,
    cross-checked OVERRIDE -- used only when a reacting species deliberately
    lacks formation data (toy / lumped / measured-ΔH pedagogy):

      (a) every species carries gibbsFormation  -> the formation value is
          authoritative (sourceOut = "formation"); a present `dictOverride`
          is CROSS-CHECKED and a mismatch beyond tolerance is WARNED aloud,
          never silently overriding the curated value;
      (b) any species lacks gibbsFormation      -> fall back to `dictOverride`
          and LOUDLY announce "dict OVERRIDE -- no formation datum"
          (sourceOut = "dict-override");
      (c) neither formation data nor a dict value -> WARN aloud and return 0
          (sourceOut = "none"); we never throw (backwards-compat / numerical
          honesty: no silent thermally-neutral crutch).

    This is the single source of truth.  Called ONCE per reaction at set-up
    (never in the integration hot loop), so its announcements are cheap.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <cstddef>
#include <optional>
#include <string>
#include <vector>

namespace Choupo {

class ThermoPackage;

// Resolve the heat of reaction (J per mole of extent) on the elements/formation
// datum, with the dict value demoted to an announced, cross-checked override.
// `comps`/`nu` are the parallel stoichiometry vectors; `phase` is "gas" or
// "liquid"; `context` labels the announcements; `verbosity` gates the
// informational source line (warnings always print).  `sourceOut` reports
// which branch was taken ("formation" / "dict-override" / "none").
scalar reactionHeat(const ThermoPackage&            thermo,
                    const std::vector<std::size_t>& comps,
                    const std::vector<scalar>&      nu,
                    scalar                          T,
                    const std::string&              phase,
                    std::optional<scalar>           dictOverride,
                    const std::string&              context,
                    int                             verbosity,
                    std::string&                    sourceOut);

} // namespace Choupo
