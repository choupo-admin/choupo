/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
-------------------------------------------------------------------------------
Class
    Choupo::CatalystBedSize

Description
    Sizing for a PLUG-FLOW CATALYST BED (`pfr`): the reactor whose volume is
    a KINETIC result, read from the unit, never derived here.

    THE UNIT IS A RATING MODEL.  `PFR` integrates the volume it is given
    (`operation.V_R`) and publishes it as the KPI `V_R`; when an outer driver
    solves that volume against a target (the `designSpec` of
    `tutorials/plant/ammoniaStaged04_kinetic`, on the effluent's approach to
    equilibrium) the KPI on the representative pass IS the engine's answer.
    This sizer therefore does what `CrystalliserSize` does with the MSMPR's
    declared working volume: it reads the unit's own number and passes it
    through, with a basis that says so.  It does NOT rebuild the volume from
    a throughput and a residence time -- that would reproduce the unit's
    number to round-off and hide that it is the unit's -- and it does not
    know, and does not claim to know, whether `V_R` was solved by a driver
    or typed by the author: the sizing pass has no view of the outer
    driver's manipulate list, so the basis says "read from the unit" and
    nothing more (a provenance key for that fact would be a second home).

    ONE UNIT, TWO PHYSICAL ITEMS (the 1:N shape `ColumnSize` established):

        shell            the pressure vessel around the bed -> `vessel`,
                         a straight cylinder of volume V_R at the declared
                         (or announced-default) L/D, ASME thin-wall through
                         `VesselMechanics` at the REQUIRED `pressureDesign`;
                         costed on the Guthrie vessel set exactly as any
                         vessel in the corpus.
        catalystCharge   the catalyst itself -> `catalystCharge`,
                         m_catalyst = V_R x catalystBulkDensity when the
                         density is DECLARED, priced at the DECLARED
                         `catalystPrice` (case money per kg, no index, no
                         module factor -- `Guthrie` states the shape on its
                         own line).  Absent the density, no mass is published
                         and the basis says why; absent the price, the item
                         is REFUSED BY NAME at costing time and the total
                         reads INCOMPLETE -- the tray precedent, one home.

    designRules:
        pressureDesign        bar     REQUIRED (refused by name if absent)
        L_over_D              -       else `designDefault::vesselLoverD`, announced
        corrosionAllow        m       else the announced default
        jointEfficiency       -       else the announced default
        catalystBulkDensity   kg/m3   optional; enables m_catalyst_kg
        catalystPrice         EUR/kg  optional; enables the catalyst cost line

    NOTHING HERE IS A COST CORRELATION.  No Guthrie set is invented for a
    catalyst bed: the shell reaches a set that already exists, and the
    catalyst is priced only from what the case declares.
\*---------------------------------------------------------------------------*/

#pragma once
#include "EquipmentSize.H"

#include <vector>

namespace Choupo {

class CatalystBedSize : public EquipmentSize
{
public:
    const std::string& type() const override { return type_; }
    std::vector<EquipmentSizing> size(const std::string& unitName,
        const SimulationResult& result,
        const Material&         material,
        const DictPtr&          designRules) const override;
private:
    inline static const std::string type_ = "pfr";
};

} // namespace Choupo
