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
Description
    WHAT EACH UNIT TYPE SAYS IT WILL USE for a liquid property, declared at
    assembly (DEV.md 4c C378 slice 0; core/PropertySourceLog.H).

    One table, one row per (unit type, property): the CLASSES of source the
    type's code may take -- `kernel` (the one door), `bypass` (a record field
    or a constant of its own), `declared` (a value the case writes), `own`
    (a correlation of its own).  The run records what was USED at the site
    that took the number; a used class this table does not list is printed
    and published as a MISMATCH, so the table cannot drift from the code
    unnoticed.  A type absent from the table declares nothing and is not
    judged (its uses still print).
\*---------------------------------------------------------------------------*/

#pragma once

#include <string>

namespace Choupo {
namespace propertySourceDeclarations {

//  Record in PropertySourceLog what unit `unit` of type `type` declares.
void declareFor(const std::string& type, const std::string& unit);

} // namespace propertySourceDeclarations
} // namespace Choupo
