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
Namespace
    Choupo::bundMath

Description
    THE CAPACITY ARITHMETIC OF A BUND, and nothing else (DEV.md 4c C134,
    extracted for C136): the volume an enclosed item occupies between grade
    and a level, the gross volume of the wall, a capacity-rule term, a depth
    allowance (rain) and the required volume.  Pure functions of numbers: no
    dictionary, no layout record, no sizing -- the layout check that calls
    them (`PlantLayout.cpp`, `readBunds`) supplies every footprint, height
    and rule from the case and says where each came from.

    THE SAME ARITHMETIC AS THE EDUTOOL, AND HELD TO IT.  The "Secondary
    containment: designing a bund" EduTool (DEV.md 4c C136) computes these
    functions in TypeScript (`gui/src/ui/methods/bund.ts`), and its test pins
    worked examples of each.  Two implementations of one procedure drift
    unless something compares them, so `bin/curate/check_bund_arithmetic.py`
    compiles a probe against THIS header, reproduces the numbers the
    TypeScript test pins, and holds the green-ammonia witness's published
    bund to both.  Each function here mirrors one of that file's, and the
    comment beside it names which.

    WHAT THE EDUTOOL TEACHES BEYOND THIS, said here so nobody reads it as a
    disagreement: a sloped floor, a freeboard, the level a spill reaches
    below the wall top, and the useful capacity that leaves the ruptured
    tank's own footprint undeducted.  THIS header deducts EVERY enclosed
    footprint below the wall top, the largest tank's included, which is the
    safe side of that reading by the largest footprint times the wall
    height; the page states both numbers and the difference.

    The floor is at grade and flat; an item's base is its declared `z`, and
    the space BELOW a raised item is free (a lying drum on saddles) -- a
    solid plinth must be declared into the item's footprint height.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <algorithm>
#include <cmath>

namespace Choupo {
namespace bundMath {

constexpr scalar kPi = 3.14159265358979323846;                       // Math.PI

//  A STANDING cylinder (vertical axis), diameter D, base at elevation z
//  above grade, height H: the volume it occupies between grade and the
//  level h.                                               displacedStanding
inline scalar displacedStanding(scalar D, scalar z, scalar H, scalar h)
{
    const scalar lo = std::max(0.0, z), hi = std::min(h, z + H);
    if (hi <= lo) return 0.0;
    return 0.25 * kPi * D * D * (hi - lo);
}

//  A LYING cylinder, diameter D, axial length Lax, bottom at elevation z:
//  the circular segment below the level, times its length.  displacedLying
inline scalar displacedLying(scalar D, scalar Lax, scalar z, scalar h)
{
    const scalar lo = std::max(0.0, z), hi = std::min(h, z + D);
    if (hi <= lo) return 0.0;
    const scalar R = 0.5 * D;
    auto seg = [&](scalar t)   // the circle's area below t above its bottom
    {
        t = std::max(0.0, std::min(D, t));
        return R * R * std::acos((R - t) / R)
             - (R - t) * std::sqrt(std::max(0.0, 2.0 * R * t - t * t));
    };
    return Lax * (seg(hi - z) - seg(lo - z));
}

//  A BOX footprint dx x dy, base at z, height dz.               displacedBox
inline scalar displacedBox(scalar dx, scalar dy, scalar z, scalar dz, scalar h)
{
    const scalar lo = std::max(0.0, z), hi = std::min(h, z + dz);
    if (hi <= lo) return 0.0;
    return dx * dy * (hi - lo);
}

//  The GEOMETRIC volume of a flat floor and its wall.          grossVolume
inline scalar grossVolume(scalar area, scalar wallHeight)
{
    return area * wallHeight;
}

//  One term of a capacity rule: a fraction of the largest, or of the total,
//  volume the enclosed items count.                              termVolume
inline scalar termVolume(scalar fraction, bool ofLargest, scalar largest, scalar total)
{
    return fraction * (ofLargest ? largest : total);
}

//  A depth allowance (a design rainfall) over the catch area.  depthAllowance
inline scalar depthAllowance(scalar depth, scalar catchArea)
{
    return depth * catchArea;
}

//  The required volume: the governing term plus the allowances.
//                                                            requiredVolume
inline scalar requiredVolume(scalar governingTerm, scalar allowances)
{
    return std::max(0.0, governingTerm) + allowances;
}

} // namespace bundMath
} // namespace Choupo
