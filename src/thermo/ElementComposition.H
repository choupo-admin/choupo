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
    src/thermo/ElementComposition.H

Description
    THE elemental-composition parser -- one routine shared by every caller
    that needs atoms from a `formula` string (the batch campaign ledger, the
    steady element-balance report, the dynamic balance snapshot, the
    `elementalComposition` props op).  Never duplicated, never re-implemented
    in a front-end.

    Grammar (the WHOLE string must parse -- a prefix match is a refusal):

        formula   :=  segment ( (':' | '·') segment )*        adduct/hydrate
        segment   :=  [count] unit+
        unit      :=  element [count]  |  '(' unit+ ')' [count]
        count     :=  integer or decimal ("2", "0.5", "10.5")
        element   :=  [A-Z][a-z]?  validated against the periodic table,
                      plus the explicit isotopes D and T (kept as their own
                      symbols -- an isotope is not folded into H)
        charge    :=  trailing '+' or '-' alone (monovalent: "NH4+"),
                      or sign BEFORE trailing digits ("SO4-2", "Ca+2").
                      'n+'/'n-' is NOT accepted -- ambiguous against
                      stoichiometry.  Charge changes electrons, not atoms.

    Anything else -- descriptive text, "N/A", a lumped pseudo-component or
    polymer/mixture without a single molecular formula, an unknown symbol --
    is UNAVAILABLE with the reason spelled out.  Never a silent zero, never
    a partial parse.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <map>
#include <string>

namespace Choupo {

struct ElementComposition
{
    bool                          available = false;
    std::string                   reason;   // when !available: what refused
    std::map<std::string, scalar> atoms;    // symbol -> atoms per formula unit
};

// Parse `formula` under the grammar above.  Total-string or nothing.
ElementComposition parseElementalFormula(const std::string& formula);

} // namespace Choupo
