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
    Choupo::lineSheets

Description
    THE LINE LIST OF A LAID-OUT PLANT (DEV.md 4c C207, C440).  One
    specification per ROUTED pipe, built after the layout has routed the
    pipes on the rack: the route gives the length, the bends and the
    elevation; the stream gives the flow and the state; `lineDesign {}` in
    `system/layoutDict` gives every rule the engine does not own.

    WHAT IS COMPUTED, and the page each rule is read at:

      SERVICE of a line, from the stream it carries: a liquid is
        `liquidDischarge`, or `liquidSuction` where its `to` end is a pump
        (a line the case can force with `lines ( { stream S; service W; } )`);
        a vapour is `gas`, or `steam` where it is water above the declared
        steam pressure; a stream with both phases is `twoPhase`.
      VELOCITY WINDOW by service: Towler & Sinnott, Chemical Engineering
        Design (2008), section 5.6 p. 265 (liquids pumped 1-3 m/s, gases and
        vapours 15-30 m/s, high-pressure steam above 8 bar 30-60 m/s) and
        Rase's expressions on p. 266 (pump discharge 0.06 d + 0.4 m/s, pump
        suction 0.02 d + 0.1 m/s, d the inside diameter in mm).  The case
        DECLARES the window it adopts, each with its source: the engine owns
        no default (the header sizer's rule, C199).
      EROSION: the case's declared limit on rho v^2.  No book in the
        literature folder gives one (Towler p. 266 says only that the
        velocity "should be kept below that at which erosion is likely to
        occur"), so the number is the case's, with its reason; with none
        declared rho v^2 is published and nothing is compared.  A gas is also
        held to the declared fraction of the sonic velocity (Towler p. 266:
        30 % of the critical velocity), the sonic velocity read as the
        ideal-gas value sqrt(gamma R T / M) from the package's ideal-gas Cp.
      NOMINAL SIZE AND SCHEDULE: the smallest declared nominal size whose
        velocity, at the inside diameter of the schedule the pressure needs,
        is inside every limit.  The schedule from the thin-cylinder wall of
        ASME B31.3 as Towler gives it, Eq. 5.8 (p. 263):
            t_m = P d / ( 2 (S E + P g) ) + c ,   t_nom = t_m / (1 - mill)
        S the material record's allowable stress (`sigma_y`), E the quality
        factor, g the temperature coefficient, c the allowances: all the
        case's, each with its reason.  The lightest declared schedule whose
        wall is at least t_nom is taken.  The schedule number of Eq. 5.9,
        1000 P / S, is published beside it.  The nominal sizes, outside
        diameters and walls are the CASE's table (Perry's Handbook 9th ed.,
        Table 10-22, from p. 10-70, for the shipped cases): the standards
        they reprint grant no redistribution, so the engine carries none.
      PRESSURE DROP: Darcy-Weisbach, dP = f (L + L_eq)/D rho v^2/2 (Towler
        Eq. 5.3a is the same law with the Fanning factor), f from the ONE
        registered friction-factor correlation the case names
        (`FrictionFactorCorrelation`, the pipe unit's own home), L_eq the
        fittings as equivalent pipe diameters (Towler Table 5.3, p. 249: the
        90-degree standard elbow 30-40 D, the fully open gate valve 7.5 D),
        one elbow per direction change of the ROUTE and the isolation valves
        the case declares per line; plus the static head rho g dz of the
        route's elevation change.  The line is compared with the book's
        allowable drop where the case declares one (Towler p. 265: pumped
        liquids 0.5 kPa/m, gases 0.02 % of the line pressure per metre).
      COST: only from a price the case DECLARES per nominal size and
        schedule (`cost { perMetre ... }`, Towler Eq. 5.10: installed cost =
        purchase cost x (1 + F)); the costing pass has no pipe correlation
        and none is invented.

    NOT MODELLED, said on every sheet: two-phase pressure drop (Perry gives
    Lockhart-Martinelli; it is not built, and a two-phase line is listed but
    not sized unless the case declares a velocity window for it), entrance
    and exit losses at the nozzles, the pump a line may need, the economic
    diameter (capital against pumping), thermal expansion and supports, and
    a gas line's change of density along its length (the drop is taken at
    the inlet density and flagged when it exceeds 10 % of the line
    pressure).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "result/SimulationResult.H"

namespace Choupo {
namespace lineSheets {

//  Reads `lineDesign {}` from the layout dictionary; absent, nothing is done
//  and nothing is published.  Fills `result.layout.lines` and `lineBasis`.
//  Throws, naming the key, when a declaration the sizing needs is missing.
void evaluate(const Dictionary& layoutDict, SimulationResult& result,
              int verbosity);

} // namespace lineSheets
} // namespace Choupo
