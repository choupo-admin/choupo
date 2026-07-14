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
    Choupo::crystallisationHeatPerMol

    ONE shared resolver for the heat of crystallisation per mole of solute
    (dissolution sign: dH > 0 means dissolving ABSORBS heat, so
    crystallising RELEASES it), so the steady Crystalliser and the batch
    BatchCrystalliser speak the SAME sourced number and can never diverge
    -- the reactionHeat precedent applied to solids.

    Resolution order (source reports which path spoke):
      (1) electrolyte path (useElec): the ion-derived, single-sourced
          dissolutionEnthalpy (Hf_solid = Sum nu*hfAq - dH_soln is a
          DERIVED quantity, never stored -- forum 2026-06-29), plus the
          finite-concentration L2_bar(m_sat) correction when the Pitzer
          T-slots are calorimetrically fitted on an aqueous path;
      (2) molecular solution tier: dH_cryst = +dHsoln + (cp_aq - cp_solid)
          *(T - 298), the SAME number the elements-datum stream balance
          reads, so unit duty and stream dH reconcile from one value;
      (3) the operation's declared dHcryst constant, with any declared
          origin confessed in `source` (a zero duty never passes as
          physics).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <cstddef>
#include <string>

namespace Choupo {

class ThermoPackage;

scalar crystallisationHeatPerMol(const ThermoPackage& thermo,
                                 std::size_t          iSolute,
                                 bool                 useElec,
                                 bool                 mixedSolvent,
                                 scalar               m_sat,
                                 scalar               T_op,
                                 scalar               dHcrystConstant,
                                 std::string&         source);

} // namespace Choupo
