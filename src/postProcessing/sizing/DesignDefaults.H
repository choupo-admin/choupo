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
    Choupo::designDefault

Description
    THE ONE HOME for a design constant that MORE THAN ONE SIZER asks for --
    the value, the unit it is in, and the WORD that says it is an assumption
    rather than a declaration.

    WHY THIS EXISTS.  A student hands in a project and must defend every
    number in it.  Three of the numbers that decide a vessel's wall, its
    weight and therefore its capital cost were literals sitting inside two
    different sizers, read with `lookupScalarOrDefault` and announced nowhere:

        corrosionAllow   0.003   in StirredTank.cpp AND VesselSize.cpp
        jointEfficiency  1.0     in StirredTank.cpp AND VesselSize.cpp
        L_over_D         2.5     in StirredTank.cpp
        L_over_D         3.0     in VesselSize.cpp

    A duplicated literal is the arity sin in its plainest form: two homes for
    one fact, which drift the day one of them is edited.  And a default that
    is USED and not SAID is worse than a wrong number, because a wrong number
    can be argued with -- `ammonia02_full_plant` sizes a 220 bar separator and
    a 25 bar letdown drum with a corrosion allowance and a weld joint
    efficiency it never declared, and nothing in its output said so.

    L/D: TWO VALUES, DELIBERATELY LEFT APART -- READ THIS BEFORE "FIXING" IT.
    `StirredTank` assumes 2.5 and `VesselSize` assumes 3.0 for the SAME key,
    asking the SAME question.  This home does NOT reconcile them.  Picking one
    would change D, H, t_wall, weight and therefore the capital cost of every
    vessel in the corpus that does not declare the key -- a scientific change
    riding on a structural one, and a CURATION decision RESERVED for Vitor.
    What this home does is make the disagreement meet a reader in ONE place
    instead of being discovered by diffing two sizers, and make each sizer
    name the value it asks for rather than hide it in a call argument.

    A DECLARED VALUE ANNOUNCES NOTHING.  Silence must keep meaning "nothing
    was assumed", so `valueOr` is inert on a case that declares the key: same
    number, same output, no advisory.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/ResultRecords.H"
#include "core/Types.H"

#include <string>

namespace Choupo {
namespace designDefault {

//  A design constant a sizer will supply if the case does not.
//
//  `unit` is the EquipmentSizing vocabulary -- a NAMED unit (`m`, `bar`) or
//  `-` for a dimensionless ratio -- so the announcement states the number in
//  the unit it is actually in, and never bare.
//
//  `why` says what the assumption COMMITS THE READER TO, not where the number
//  came from: none of these four is a curated datum, and writing a citation
//  for a value that has none would convert `unsourced` into `falsely sourced`.
struct Assumption
{
    const char* key;
    scalar      value;
    const char* unit;
    const char* why;
};

extern const Assumption corrosionAllow;
extern const Assumption jointEfficiency;
extern const Assumption stirredTankLoverD;    //  2.5  -- see the L/D note above
extern const Assumption vesselLoverD;         //  3.0  -- and it is NOT 2.5

//  THE TWO END SPACES OF A TRAY COLUMN (2026-09-07).  A tower is not as tall
//  as its tray stack: there is vapour disengagement space above the top tray
//  and a liquid sump below the bottom one, and neither follows from anything
//  the MESH solution computes.  They are here rather than as literals inside
//  `ColumnSize` for the reason this whole file exists -- a default that is
//  USED must be announced, and the announcement lives in `valueOr`.
extern const Assumption columnDisengagement;  //  m, above the top tray
extern const Assumption columnSump;           //  m, below the bottom tray

//  The declared value, or `a.value` ANNOUNCED.
//
//  On the default path it does three things and they are one act: it prints
//  at the site, it raises an advisory (so the fact reaches the end-of-run
//  caveat block and the result JSON, the CatalystPellet precedent), and it
//  records the key on the sizing record so the equipment SPECIFICATION SHEET
//  can say which of its inputs the engine supplied.
scalar valueOr(const DictPtr&     designRules,
               const Assumption&  a,
               const std::string& equipment,
               const std::string& unitName,
               EquipmentSizing&   d);

} // namespace designDefault
} // namespace Choupo

// ************************************************************************* //
