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
File
    Constants.H

Description
    Physical & numerical constants used throughout the simulator.
    SI units everywhere unless explicitly noted.
\*---------------------------------------------------------------------------*/

#pragma once

#include "Types.H"

namespace Choupo::constant {

// -- Mathematical -------------------------------------------------------------
constexpr scalar pi      = 3.14159265358979323846;   // M_PI is non-standard;
                                                     // declare ours explicitly.

// -- Physical -----------------------------------------------------------------
constexpr scalar R       = 8.314462618;     // [J/(mol·K)] universal gas constant
constexpr scalar F       = 96485.33212;     // [C/mol] Faraday constant (CODATA 2018, exact)
constexpr scalar Na      = 6.02214076e23;   // [1/mol]     Avogadro
constexpr scalar kB      = 1.380649e-23;    // [J/K]       Boltzmann
constexpr scalar Pref    = 1.0e5;           // [Pa] thermochemical standard state (1 bar)

// -- Conversions --------------------------------------------------------------
constexpr scalar bar_to_Pa  = 1.0e5;
constexpr scalar Pa_to_bar  = 1.0e-5;
constexpr scalar atm_to_bar = 1.01325;

// -- NORMAL gas volume (Nm3) ---------------------------------------------------
//  The reference a "normal cubic metre" is measured at: 0 degC and 1 atm, the
//  gas taken as IDEAL, so one mole occupies R*T_normal/P_normal = 22.414 L.
//  It is a CONVENTION a quoted number carries, not a property of any gas, and
//  it is the one every published space velocity (GHSV, Nm3 of gas per m3 of
//  catalyst per hour) is stated on.  ONE home: the PFR's `GHSV_normal_h` KPI
//  and the vessel sizer's `spaceVelocityBasis normal;` both read it here, so
//  the KPI a reader sets beside a datasheet and the rule a case sizes a bed
//  with cannot drift onto two different references.  "Standard" conditions
//  are NOT this: they are 15, 20 or 25 degC at 1 bar or 1 atm depending on
//  the source, which is why the sizer accepts no word `standard`.
constexpr scalar T_normal   = 273.15;      // [K]
constexpr scalar P_normal   = 101325.0;    // [Pa] 1 atm

} // namespace Choupo::constant
