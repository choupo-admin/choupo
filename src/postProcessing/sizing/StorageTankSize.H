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
    Choupo::StorageTankSize

Description
    THE STORAGE OF A BOUNDARY STREAM (2026-10-07, DEV.md 4c C44 slice 2).
    A plant buys tanks for its raw materials and its products -- "um item
    muito importante do investimento" (Vitor) -- and no flowsheet unit is
    one: nothing in the topology solves a tank that only holds a product
    until it is shipped.  Vitor ruled that a storage tank is a POSTDICT ITEM
    ATTACHED TO A BOUNDARY STREAM ("o postDict e boa ideia!"):

        sizing
        {
            storage
            (
                { name          NH3Storage;
                  stream        ProductNH3;     // the stream it stores
                  material      SS304;
                  storageTime   21 day;         // the declared design basis
                  fillFraction  0.90;           // working level / tank volume
                  maxTankVolume 30000;          // m3, one tank at most
                }
            );
        }

    THE SIZE, from declarations and the run's own stream, nothing else:

        V_stored = storageTime x mdot / rho_liquid       [m3 of liquid]
        V_tanks  = V_stored / fillFraction               [m3 of tank]
        N        = ceil(V_tanks / maxTankVolume)
        V_R      = V_tanks / N                           [m3, each tank]

    mdot is the stream's own mass flow and rho its liquid density at the
    state it carries, on the case's package (`phaseDensity::of`, announced).
    `storageTime` MUST carry its unit (`21 day`): the dict grammar reads a
    bare number as SI seconds, and a 21-SECOND tank is a size the run
    would print without complaint.  Every key is required -- a default
    storage time is a design basis nobody chose.

    ONE ITEM PER TANK, tagged `tank1` .. `tankN`, each sized and costed as
    `storageTank`: a plant with two 20 000 m3 tanks buys two tanks, and
    costing one 40 000 m3 tank would put a size outside the correlation
    priced as though it were inside it.

    A GAS IS NOT STORED HERE.  A vapour stream is refused by name: gas
    storage is a pressure vessel or a holder, and an atmospheric tank
    correlation does not price either.  So is a stream above 1.5 bar
    (pressurised liquid storage is spheres and bullets).

    NOT REGISTERED in the unit-type registry, deliberately.  The sizers
    there are reached by a UNIT's `type` word and read that unit's KPIs; a
    tank is reached from the `storage ( ... )` list and reads a STREAM.
    Registering it would invite `{ unitName X; type storageTank; }` under
    `units`, where `storageTank` is also a flowsheet unit type that means
    something else.  `SizingPass` constructs it directly.
\*---------------------------------------------------------------------------*/

#pragma once

#include "EquipmentSize.H"

#include <string>
#include <vector>

namespace Choupo {

class StorageTankSize : public EquipmentSize
{
public:
    const std::string& type() const override { return type_; }

    //  `unitName` is the storage item's NAME (it is not a flowsheet unit);
    //  `designRules` is the whole `storage ( { ... } )` entry.
    std::vector<EquipmentSizing> size(const std::string& unitName,
        const SimulationResult& result,
        const Material&         material,
        const DictPtr&          designRules) const override;

private:
    inline static const std::string type_ = "storageTank";
};

} // namespace Choupo
