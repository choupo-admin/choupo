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
    Choupo::MembraneBankSize

Description
    THE VESSEL BANK OF A SPIRAL-WOUND STAGE (DEV.md 4c C199).  A
    `spiralWoundModule` unit is MATHEMATICALLY one element marched `elements`
    deep and scaled by `vessels` identical vessels in parallel.  Physically
    those vessels stand in RACKS: tiers of horizontal pressure vessels on a
    frame, with a clear length at one end where the elements are pushed in
    and out.  This sizer turns the unit's two published counts into that
    bank, per train when the plant is built in trains (TrainSplit.H).

    WHAT IS READ from the unit: `vessels`, `elements` (1 when the unit
    publishes none), `elementLength_m` and `elementDiameter_m` (published only
    when the module RECORD declares them), `area_stage`.  WHAT IS DECLARED,
    each with its origin, source and reason (nothing here is a default):

        vessel { endAllowance <m>; outsideDiameter <m>; origin; source; reason; }
        rack   { vesselsPerRack <n>; tiers <n>; pitch <m>; tierPitch <m>;
                 baseHeight <m>; endMargin <m>; aisle <m>;
                 origin; source; reason; }
        loadingClearance { vesselLengths <k>; origin; source; reason; }

    WHAT IS COMPUTED (and recomputed by the gate from the case's dicts):

        vesselLength   = elements elementLength + endAllowance
        vesselsPerTier = vesselsPerRack / tiers            (must be whole)
        racks          = ceil( vesselsPerTrain / vesselsPerRack )
        rackLength     = vesselLength + 2 endMargin
        rackWidth      = vesselsPerTier pitch
        rackHeight     = baseHeight + tiers tierPitch
        loadingClearance = k vesselLength   (free, at the +x end of the bank)
        bank           = racks side by side with an aisle between them:
          bankLength = rackLength + loadingClearance
          bankWidth  = racks rackWidth + (racks - 1) aisle
          bankHeight = rackHeight

    THE ENVELOPE (`envelopeLength`, `envelopeWidth`, `envelopeHeight`, metres)
    is what the plot plan reads to place the bank (PlantLayout.cpp
    `publishedFootprint`): a published BOX, beside the cylinder pairs it
    already reads -- no footprint grammar is added to the dict.  In the item's
    own frame the bank lies along +x (its `orientation alongX`), the vessels'
    axes along x, the loading clearance at the high-x end.

    A pitch smaller than the vessel's outside diameter, a vessel narrower than
    its element, a rack that does not divide into tiers, vessels that do not
    divide among the trains, and any missing declared number REFUSE by name.

    NOT COSTED (no Turton set covers a vessel bank; the vessels are FRP and the
    case's money is a declared quote).  The `material` word of the entry only
    fixes the record the sizer needs.
\*---------------------------------------------------------------------------*/

#pragma once

#include "EquipmentSize.H"

#include <string>
#include <vector>

namespace Choupo {

class MembraneBankSize : public EquipmentSize
{
public:
    const std::string& type() const override { return type_; }
    std::vector<EquipmentSizing> size(const std::string& unitName,
        const SimulationResult& result,
        const Material&         material,
        const DictPtr&          designRules) const override;
private:
    inline static const std::string type_ = "membraneBank";
};

} // namespace Choupo
