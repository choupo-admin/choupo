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
    Choupo::PressureExchangerSize

Description
    The design sheet of a `pressureExchanger` unit (DEV.md 4c C192): an
    ARRAY of rotary units in parallel, counted from the maker's rated flow
    per unit, with the pressure drops and the booster duty the unit
    published.  On the pattern of CompressorSize / ShellTubeHX: a sizer for
    a RATING model READS the unit's own answer and passes it through; the
    one thing it computes is the count.

        rotors = ceil( Q_LP / ratedFlowPerUnit )

    Q_LP is the low-pressure (seawater) feed the unit published, the flow a
    maker rates the device on; `ratedFlowPerUnit` is DECLARED in the entry's
    `designRules {}` with its `source` -- the ERI PX-Q300 class is ~50-68 m3/h
    per unit, a datum the case cites, never a built-in -- and nothing here
    defaults it.  The array is in parallel: every rotor sees the same
    pressures and 1/rotors of each flow, which is what the sheet's
    `flowPerRotor` says.

    postDict entry:

        sizing
        {
            units
            (
                { unitName PX;  type pressureExchanger;  material SS316;
                  designRules
                  {
                      ratedFlowPerUnit  60 m3/h;
                      source            "...";
                      // pressureDesign 70 bar;   optional; absent, the HP inlet
                      //                          pressure read from the unit
                  } }
            );
        }

    C199 ADDITIONS (all optional): `perTrain yes;` sizes ONE ARRAY PER TRAIN of
    the plant's declared identical trains (`sizing { trains { ... } }`, see
    TrainSplit.H); `pressureRating <P>;` is the maker's pressure limit and the
    sizer REFUSES an operating or design pressure above it; `minFlowPerUnit
    <Q>;` is the bottom of the maker's flow window and a rotor under it
    REFUSES.  Both are declared with the entry's `source`.

    NOT COSTED.  No Turton cost set covers a rotary pressure exchanger
    (`costing/Turton.cpp::coeffsFor` names its nine words and this is not one
    of them), so the item is listed apart through `notCostedBecause` -- the
    relief-valve posture: no total moves and none reads INCOMPLETE -- and the
    case prices it, if it wants a price, as a declared quote (`costing {
    quotes ( ... ) }`, DEV.md 4c C98).
\*---------------------------------------------------------------------------*/

#pragma once

#include "EquipmentSize.H"

#include <string>
#include <vector>

namespace Choupo {

class PressureExchangerSize : public EquipmentSize
{
public:
    const std::string& type() const override { return type_; }
    std::vector<EquipmentSizing> size(const std::string& unitName,
        const SimulationResult& result,
        const Material&         material,
        const DictPtr&          designRules) const override;
private:
    inline static const std::string type_ = "pressureExchanger";
};

} // namespace Choupo
