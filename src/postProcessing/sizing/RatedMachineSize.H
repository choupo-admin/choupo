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
        `result.batchPlan` (`BatchPlanPass`); a unit in no stage or a stage
        of the wrong type refuses by name;
      * the mass a RATE machine handles: the sum of its inlet streams
        (`overallMassFlow`, the one home) on the flowsheet's basis, scaled to
        the lot by the plan's own lot hours (lot size / product rate), and
        divided by the stage's operating time;
      * for a BATCH machine, the stage's mass per lot and the declared bulk
        density of the plan (`V_working = m_lot / rho_bulk`).

    SEVERAL PRODUCTS (2026-11-08, DEV.md 4c C249 d).  In a MULTIPRODUCT plan
    the fit is checked PER PRODUCT i, on its own numbers at this stage
    (`BatchProductStage`): lot B_i = the product's lot, mass per lot f_ij B_i,
    bulk density, operating time t_op,ij, and the lot hours B_i / r_P that
    scale the inlet streams to the lot.  Then
        util_i = load_i / capacity     (capacity does not depend on product)
        the machine must fit EVERY product: util_i > 1 refuses, NAMING the
        product, and the machines needed are the largest over products;
        the published figures are those of the BINDING product (largest
        util_i), `utilisation_<product>` and `load_<product>` carry each,
        and `productsChecked` the count.  The pass ANNOUNCES the number of
        products it ran over.  A single-product plan is the same code with
        one view (the numbers do not move).  The inlet streams stay on the
        flowsheet's balance (a product's own `massPerProduct` is read for a
        batch stage's mass per lot, not for a rate machine's inlet).
        A press or a packaging line counts TABLETS, and a strength with its
        own tablet weight declares it beside the default:
        `rating { itemMass 0.29 g; itemMassByProduct { strength5 0.145 g; } }`
        (an entry naming no product, or the block in a one-product plan,
        refuses by name); a product not listed uses `itemMass`.

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

      volumeRate    (C199) a PUMP rated by the largest flow one machine of the
                    chosen make carries.  No batch plan is read.  rating:
                    maxFlowPerUnit [m3/h], origin literature|assumed, source,
                    reason (and an optional pressureRating); the load is the
                    pump's own published F x v_molar_liq.  pumpsNeeded =
                    ceil(Q_train / maxFlowPerUnit); `installed { count }` is
                    the pumps in parallel PER TRAIN (default 1; fewer than
                    needed REFUSES naming the count); `spare { count }` the
                    plant's stand-by pumps; `perTrain yes;` sizes one item per
                    declared train (TrainSplit.H).

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

    THE TABLET PRESS'S THREE OPTIONAL CHECKS (2026-11-13, DEV.md 4c C270),
    each a block of the designRules beside `rating`, each with its `source`
    and `reason`; ABSENT, the run announces that the press was NOT checked
    for dwell time and for compaction force (naming the keys) and no number
    moves.
      dwell { punchFlat <L>; pitchCircle <D>; minimumDwellTime <t>; }
          the punch head's flat stays under the roll for t = L / (pi D n) at
          n rev/s, so a formulation needing t_min is pressed no faster than
          n_max = L / (pi D t_min).  Published: the dwell at the catalogue
          speed, n_max, the dwell-limited capacity and `dwellBinds`; the
          utilisation uses the LOWER capacity and a binding limit is
          announced.  (The batch plan is NOT re-timed by it: the plan's
          operating time is the case's declaration; see DEV.md 4c C270.)
      effectiveness { availability; performance; quality; }
          OEE = A x P x Q scales the capacity; a quality factor below 1 on a
          press whose flowsheet already splits off a reject stream is
          announced as rejects counted twice, with both numbers.
      compaction { material; heckel { K | Py; A; Pmin; Pmax; basis
                   inDie|outOfDie; } ryshkewitch { sigma0; kb; basis; }
                   targetTensileStrength; punchTipArea; maxCompressionForce;
                   [trueDensity;] }
          ONE fitted material, no mixture rule (said on every run).  The
          Ryshkewitch-Duckworth curve inverted gives the porosity at the
          target strength, the Heckel line inverted the pressure at that
          solid fraction, the punch tip area the force -- the SAME functions
          the compaction bench fits (`propertyOps/CompactionLaws.H`).  A
          target at or above sigma_0, a non-positive constant, or a solid
          fraction the Heckel line reaches only below zero pressure REFUSE;
          a pressure outside the Heckel window, two curves on different
          bases, and a force above `announceAbove` of the press's maximum are
          ANNOUNCED.  A declared true density adds the thickness of a
          flat-faced tablet, m / (rho_true D A_tip).

    NOT MODELLED, said in the item's basis: the machine's behaviour (no
    granule size, no blend uniformity; for any machine but a declared press,
    no compaction force either), and the speed at which a lot can really be
    run beyond what the declared dwell and effectiveness say.
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
