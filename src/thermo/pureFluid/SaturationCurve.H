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
Function
    Choupo::saturationPressure

Description
    THE SATURATION CURVE OF A COMPONENT HAS ONE HOME (C39, 2026-10-06).

    A case may declare `pureFluids { water { method IF97; } }`, and the
    package then prices that component's ENTHALPY on the fundamental
    equation.  Until this file existed every SATURATION PRESSURE the
    package handed out still read the component record's Antoine -- the
    K-value, the Raoult K, the Henry Poynting anchor of a solvent -- so
    water at 1 bar boiled at 372.09 K to the flash (the record's Antoine)
    and at 372.76 K to the enthalpy surface (IF97's region 4).  A stream
    between the two was a vapour to one reader and a liquid to the other:
    the family THE STATE A UNIT COMPUTES WITH IS NOT THE STATE ITS STREAMS
    CARRY (CLAUDE.md §6), the second home being a correlation nobody had
    switched off.  The run header said otherwise: the v2 builder announced
    that the declared surface REPLACES "the saturation dome (Psat)", and
    nothing did.

    The rule: a declared pure-fluid method OWNS its component's saturation
    curve wherever the PACKAGE is asked for it.  Inside the method's own
    window (`PureFluidModel::saturationWindow`, IF97: 273.15 .. 647.096 K)
    the answer is the method's p_sat(T).  Outside it the method has no
    saturation curve -- above the critical point there is none at all, and
    below the triple point the liquid line it draws does not exist -- so
    the record's own correlation answers, extrapolated as it always was for
    every other component, and that substitution is ANNOUNCED once per
    component and side (`AdvisoryLog::addAnnouncedOnce`, the caveat block).
    A component with no declared method reads its record exactly as before,
    so a package with no `pureFluids {}` is byte-identical.

    Two doors reach this one function: `ThermoPackage::Psat(i, T)` (every
    unit, flash, psychrometric helper and Gibbs method that holds the
    package) and `LiquidPhase::fEffective` (the phase layer sits below the
    package and holds the method by pointer, rebound with the components
    when the package moves).  Neither carries a copy of the rule.

    The sites deliberately NOT routed, each with its reason, are listed in
    docs/design/a-saturation-curve-with-two-homes.md.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

namespace Choupo {

class Component;
class PureFluidModel;

//  Saturation pressure [Pa] of component `c` at T [K].  `pf` is the
//  declared pure-fluid method for `c`, or nullptr when none is declared.
scalar saturationPressure(const Component& c, const PureFluidModel* pf,
                          scalar T_K);

} // namespace Choupo
