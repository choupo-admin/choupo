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
    Choupo::RatedMachineSize

Description
    DOES THE MACHINE FIT THE BATCH AND THE SHIFT (2026-11-02, DEV.md 4c
    C195).  A solid-dose plant carries its blenders, roller compactor, mill,
    screen, tablet press, coating pan and packaging line as `mixer` /
    `splitter` units that move MASS and model no machine; the question a
    project owes its reader about each -- "does a machine of this vendor
    rating take this lot in this time" -- is therefore answered nowhere.
    This sizer answers it, with NO new physics: it reads the throughput the
    run and the batch plan already hold, divides it by a rating the CASE
    declares, and publishes the ratio.

    A RATING IS A DECLARED FACT, NEVER A SHIPPED ONE.  `rating { ...;
    source "..."; reason "..."; }` carries the vendor's number with its unit
    and where it came from.  No machine catalogue is carried here and no
    default is taken: a missing rating key REFUSES by name.

    WHAT IS READ, and from where (nothing is re-derived):
      * the stage the unit belongs to and its lot, cycle and times --
        `result.batchPlan` (`BatchPlanPass`); a unit in no stage, a
        MULTIPRODUCT plan, or a stage of the wrong type refuses by name;
      * the mass a RATE machine handles: the sum of its inlet streams
        (`overallMassFlow`, the one home) on the flowsheet's basis, scaled to
        the lot by the plan's own lot hours (lot size / product rate), and
        divided by the stage's operating time;
      * for a BATCH machine, the stage's mass per lot and the declared bulk
        density of the plan (`V_working = m_lot / rho_bulk`).

    FOUR KINDS (`kind`, a declared word; an unknown one refuses):
      batchVolume   a bin blender, high-shear bowl, coating pan.  rating:
                    nominalVolume [m3], maxFill [-].  capacity = N V_nominal
                    maxFill; load = the lot's working volume.
      massRate      a roller compactor, mill, screen.  rating: capacity
                    [kg/h].  load = the mass per lot / the stage's operating
                    time.
      tabletPress   rating: stations [-], turretSpeed [rpm], compressions
                    PerRevolution [-] and itemMass [mass] (the pressed
                    tablet).  capacity = N stations rpm 60 compressions
                    tablets per hour; load = tablets per hour from the mass.
      packagingLine rating: packsPerMinute [1/min], itemsPerPack [-], itemMass
                    [mass] (the packed tablet).  capacity = N packs/min 60
                    packs per hour; load = packs per hour from the mass.
    (`turretSpeed` and `packsPerMinute` are plain numbers: the unit table has
    no revolution or pack, and the sheet declares the unit on the value it
    publishes.)

    `installed { count N; source; reason; }` declares more than one machine
    (the second unit that makes an over-100 % stage legal); absent, the count
    is the plan's own `unitsInstalled`.  Utilisation = load / capacity.
    ABOVE 100 % THE SIZER REFUSES, naming the count that would fit; ABOVE
    `announceAbove` (0.85 unless the case declares another) it ANNOUNCES.
    `shift { length; source; reason; }` (optional) states the shift: a lot
    that needs more than a shift at the rating is announced.

    NOT COSTED: no Turton set exists for a process machine and none is
    invented; the money is the case's declared quote (`costing { quotes }`),
    which this item no longer blocks (`notCostedBecause`).  NOT PLACED on the
    plot plan (`notPlacedBecause`): the machine stands in a room of the
    building, and the room is what the plan places.

    NOT MODELLED, said in the item's basis: the machine's behaviour (no
    compaction force, no granule size, no blend uniformity), its overall
    equipment effectiveness, and the speed at which a lot can really be run.
\*---------------------------------------------------------------------------*/

#pragma once

#include "EquipmentSize.H"

#include <string>
#include <vector>

namespace Choupo {

class RatedMachineSize : public EquipmentSize
{
public:
    const std::string& type() const override { return type_; }

    std::vector<EquipmentSizing> size(const std::string& unitName,
        const SimulationResult& result,
        const Material&         material,
        const DictPtr&          designRules) const override;

private:
    inline static const std::string type_ = "ratedMachine";
};

} // namespace Choupo
