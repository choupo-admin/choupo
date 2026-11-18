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
    Choupo::drumSize

Description
    THE DETAILED SIZE OF A GAS-LIQUID SEPARATOR DRUM (DEV.md 4c C318): a flash
    drum, a knock-out drum, a letdown or storage flash.  `VesselSize` used to
    give such a drum a volume from a vapour residence time and nothing else --
    no allowable velocity, no liquid levels, no orientation, no nozzles, and so
    no way to defend the diameter.  A case that declares
    `designRules { drum { ... } }` is sized here instead, and the result is
    still ONE vessel (D, H, V) that `VesselSize` walls, weighs and costs as
    before.

    Two published procedures, selected by `method`, each read at its page:
      wankat  Wankat, Separation Process Engineering 2nd ed., section 2.8
              (Eqs. 2-59 to 2-64): K_drum from the Blackwell fit of Watkins'
              chart (Eq. 2-60), u_perm = K sqrt((rhoL-rhov)/rhov) (Eq. 2-59),
              horizontal K = 1.25 K_vertical and A_T = A_c/0.2 (Eq. 2-64),
              H/D window 3 to 5, feed-nozzle clearances.
      towler  Towler & Sinnott, Chemical Engineering Design 1st ed., section
              10.9 (Eqs. 10.10, 10.11, Figure 10.51, Examples 10.5, 10.6):
              K = 0.07 m/s, a factor 0.15 without a demister, the vertical
              clearances of Figure 10.51a, the horizontal drum at half level
              with L/D by pressure (3, 4, 5) and the settling-time balance.
    The terminal velocity of the design droplet is Haider & Levenspiel's
    sphere correlation as printed in Kunii & Levenspiel, Fluidization
    Engineering 2nd ed., Eq. 34, printed beside the allowable velocity as the
    physical check.  The nozzle velocities are the typical pipe velocities of
    Towler & Sinnott section 5 (liquids pumped 1 to 3 m/s, gases and vapours
    15 to 30 m/s), DECLARED by the case, with the rho v^2 of the feed printed.

    EVERY NUMBER THE SOURCES DO NOT FIX IS A DECLARED INPUT: the hold-up and
    surge times, the low-level height, the demister, the design droplet, the
    nozzle velocities, the rounding step.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/ResultRecords.H"
#include "core/Types.H"
#include "result/SimulationResult.H"

#include <string>

namespace Choupo {
namespace drumSize {

//  The Blackwell (1984) fit of Watkins' (1967) chart, as Wankat Eq. 2-60:
//  K_drum in ft/s from F_lv = (W_L/W_v) sqrt(rho_v/rho_L).
scalar blackwellK_ftps(scalar Flv);

//  The terminal velocity of a sphere of diameter `d` [m] falling in a gas
//  (Haider & Levenspiel via Kunii & Levenspiel Eq. 34), [m/s].
scalar haiderLevenspielTerminal(scalar d, scalar rho_g, scalar rho_L,
                                scalar mu_g);

//  The area of the circular segment of liquid depth h in a circle of radius R.
scalar segmentArea(scalar R, scalar h);

struct Result
{
    scalar V = 0.0, D = 0.0, H = 0.0;     // shell volume, diameter, length/height
    std::string basis;
};

//  Size the drum of `unitName` and write every number to `d` (the record the
//  sheet and the golden read).  Throws, naming the missing key and the remedy.
Result size(const std::string&      unitName,
            const SimulationResult& result,
            const DictPtr&          drum,
            EquipmentSizing&        d);

} // namespace drumSize
} // namespace Choupo
