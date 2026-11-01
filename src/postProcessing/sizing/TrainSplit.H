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
Description
    A PLANT OF IDENTICAL PARALLEL TRAINS, SIZED PER TRAIN (DEV.md 4c C199).

    An industrial seawater RO plant is organised as N identical trains, each
    with its own high-pressure pump, pressure-exchanger array and vessel
    racks.  The flowsheet is solved ONCE at plant flow (the trains are
    identical and in parallel, so a plant stream is N times a train's and the
    physics is the same); what changes is how the plant is SIZED and drawn:
    one item per train.

    ONE declaration (`sizing { trains { count; source; reason; } }`, read by
    SizingPass into `result.trains`) and one switch per entry
    (`perTrain yes;` in its designRules).  An entry that says `perTrain` with
    no declared trains REFUSES by name; an entry that does not say it is
    sized as before, byte for byte.  The items are tagged `train1`..`trainN`
    (`EquipmentSizing::equipmentTag`, the 1:N mechanism the column uses), and
    every one publishes `trains`, `trainIndex` and the plant totals beside its
    per-train numbers.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "result/SimulationResult.H"

#include <cmath>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {
namespace trainSplit {

//  0 when the entry is not per-train; otherwise the declared train count.
inline int trainsOf(const SimulationResult& result, const DictPtr& designRules,
                    const std::string& who)
{
    if (!designRules->found("perTrain")) return 0;
    const std::string w = designRules->lookupWord("perTrain");
    if (w != "yes" && w != "no")
        throw std::runtime_error(who + ": `perTrain " + w + ";` -- Accepted:"
            " yes, no.");
    if (w == "no") return 0;
    if (result.trains.count < 1)
        throw std::runtime_error(who + ": `perTrain yes;` but the sizing pass"
            " declares no trains.  Add `trains { count N; source \"...\";"
            " reason \"...\"; }` to `sizing { }` in system/postDict -- the"
            " count of identical parallel trains is the case's fact and no"
            " default is taken.");
    return result.trains.count;
}

//  A per-train quantity: the plant's divided by the trains, which must come
//  out whole where it counts physical things (vessels, rotors).
inline int wholePerTrain(int plantCount, int trains, const std::string& what,
                         const std::string& who)
{
    if (plantCount % trains != 0)
        throw std::runtime_error(who + ": " + std::to_string(plantCount) + " "
            + what + " cannot be shared by " + std::to_string(trains)
            + " identical trains (" + std::to_string(plantCount % trains)
            + " left over).  Identical trains carry a whole number of each;"
              " change the count or the trains.");
    return plantCount / trains;
}

inline void stamp(EquipmentSizing& d, int k, int N)
{
    d.equipmentTag = "train" + std::to_string(k);
    d.set("trains",     static_cast<scalar>(N), "-");
    d.set("trainIndex", static_cast<scalar>(k), "-");
}

} // namespace trainSplit
} // namespace Choupo
