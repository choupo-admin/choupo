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
Namespace
    Choupo::plantLayout::typical

Description
    A TYPICAL TRAIN, DECLARED ONCE AND REPEATED (2026-11-10, DEV.md 4c C272
    slice 1).  A plant of N identical trains is drawn the way a drawing
    office draws it: one train in full, the others as a repeat.  In
    `system/layoutDict`

        typicals
        (
            { typical "train"; index "train"; count 6;
              pitch { x 19 m; y 0 m; }
              members ( "RO1/train1" "HPpump/train1" ... );
              source "..."; reason "..."; }
        );

    `members` are the sized items of TRAIN 1, each declared in `items ( ... )`
    like any other (position, orientation, footprint).  The sized item of
    train k has the same id with its trailing `<index>1` replaced by
    `<index>k`; the engine moves train 1's item by (k - 1) x `pitch`, takes
    the size from THAT item's own sizing, and puts it in the room the building
    lists for train 1's item.  Every repeated item takes part in EVERY check
    and in the pipe router as if the case had declared it (overlap, separation,
    zones, roads, bunds, headers: a branch per train); the result keeps
    every item in `items` (a repeat carries `repeatOf`) and adds, apart, an
    OUTLINE per repeated train and room (`typicalOutlines`: the plan box that
    holds the train's items in it).
    One group has one pitch: a plant whose equipment does not repeat on one
    pitch declares one group per pitch.

    A room of the building that lists a member lists the repeats too
    (`copiesOf`), so `equipment` names train 1 only.
\*---------------------------------------------------------------------------*/

#ifndef Choupo_plantLayout_TypicalTrain_H
#define Choupo_plantLayout_TypicalTrain_H

#include "core/Dictionary.H"
#include "core/Types.H"

#include <string>
#include <vector>

namespace Choupo
{
namespace plantLayout
{
namespace typical
{

struct Group
{
    std::string              name;
    std::string              index;     // the word before the train number
    int                      count = 0;
    scalar                   px = 0, py = 0;   // [m] train k+1 = train k + pitch
    std::vector<std::string> members;   // sized item ids of train 1
    std::string              source;
    std::string              reason;
};

//- The groups `typicals ( ... )` declares; empty when absent.  Throws a
//  runtime_error naming the defect on every malformed declaration.
std::vector<Group> read(const Dictionary& layoutDict);

//- The id of train `k`'s item for a train-1 member.
std::string idOf(const Group& g, const std::string& member, int k);

//- The ids that repeat `id` in trains 2..N (empty when `id` is no member).
std::vector<std::string> copiesOf(const Dictionary& layoutDict,
                                  const std::string& id);

//- `ids` followed by the repeats of every member among them.
std::vector<std::string> withCopies(const Dictionary& layoutDict,
                                    const std::vector<std::string>& ids);

} // namespace typical
} // namespace plantLayout
} // namespace Choupo

#endif

// ************************************************************************* //
