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
    src/thermo/PropertyVariants.H

Description
    NAMED VARIANTS of a case's one property dictionary (DEV.md 4c C398,
    RULED, points 1-3; docs/design/several-laws-per-property.md, THE
    RULING).  A `constant/thermoPhysPropDict` keeps its blocks -- they ARE
    the case's system -- and may add

        variants
        {
            line
            {
                transport { liquid { viscosity { model Vogel; } } }
            }
        }

    Each variant states ONLY what differs, and derives DIRECTLY from the
    file's own system: one base, so there is no chain and no cycle.  A unit
    (flowsheetDict) or a property operation (propsDict) selects one by name,

        thermo line;

    and the variant is applied by the ONE typed merge every inline
    `thermo { ... }` fragment already goes through (ThermoOverride.H) -- an
    inline fragment keeps reading exactly as before, as an UNNAMED variant.
    So a unit and an operation that name the same variant receive the same
    package, built by the same builder from the same merged text.

    What this file decides, and what it refuses by name:
      * the body of a variant is a fragment of the system grammar
        (equilibrium / caloric / volumetric / transport / pureFluids);
      * a variant never derives from another variant (`thermo`, `variant`,
        `variants`, `inherits`, `derivedFrom`, `base`, `from` inside a
        variant are refused, naming the rule);
      * inside `transport`, a phase is vapour / liquid / interface and a
        property block is one the system grammar reads (the flat names
        `liquidViscosity`, ... are the OTHER spelling of the same block and
        are refused, as is any name nothing would read);
      * an unknown variant name is refused, listing the variants the file
        declares.
    A variant nobody selects is ANNOUNCED, not refused: a choupoSolve run
    and a choupoProps run read the same constant/, and a variant used only by
    the property check is, correctly, never used by the solve.  The
    announcement is the unread-key audit's (core/DictAudit.H), run on the
    `variants` block after the run.

    The `variants` block is NOT inherited through `inherits`: a sector's
    variants are the sector file's own, derived from the sector's resolved
    system (PropertyContext.H).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"

#include <string>
#include <vector>

namespace Choupo {
namespace propertyVariants {

//  The engine-injected key that rides on a unit's rewritten `thermo {}`
//  when the unit selected a NAMED variant: the variant's name.  Plumbing,
//  never authored (an authored `variant` key in a fragment is refused).
inline const char* selectedKey() { return "selectedVariant"; }

//  True when `holder` (a unit or an operation dict) selects a variant BY
//  NAME: `thermo <word>;`.
bool selectsByName(const DictPtr& holder);

//  The `variants {}` block itself, fetched WITHOUT noting it (null when
//  absent): what the unread-key audit walks after the run.
DictPtr variantsBlock(const DictPtr& system);

//  The names the system declares under `variants {}`, in file order
//  (empty when none).  Read WITHOUT marking anything read.
std::vector<std::string> names(const DictPtr& system);

//  Validate the `variants {}` block of a system: structure only, every
//  refusal above.  Called by the builder on every system it is handed, so
//  every binary validates a variant at load whether or not a unit selects
//  it.  No-op when the system declares none.
void validate(const DictPtr& system);

//  The body of the named variant, VALIDATED; refuses an unknown name
//  listing the declared ones.  `who` names the selector ("unit 'P1'").
//  The returned dict is the authored one (not a copy), so the reads the
//  builder makes through it are seen by the unread-key audit.
DictPtr body(const DictPtr& system, const std::string& name,
             const std::string& who);

//  The fragment `holder` selects against `system`: the named variant's
//  body, the inline `thermo { ... }` block, or null when the holder
//  selects nothing.  `name` receives the variant's name ("" for an inline
//  fragment or none).
DictPtr fragmentOf(const DictPtr& system, const DictPtr& holder,
                   const std::string& who, std::string& name);

//  A SHALLOW copy of `body` with the selected variant's name stamped on it
//  (selectedKey()): what the flowsheet puts in place of a unit's
//  `thermo <name>;`, so every reader downstream sees the fragment it has
//  always seen.  The sub-blocks are SHARED with the authored dict (the
//  reads they receive are the audit's evidence); only the top level is new,
//  so the per-node plumbing the flattener adds never touches the authored
//  variant.
DictPtr stampedFragment(const DictPtr& body, const std::string& name);

} // namespace propertyVariants
} // namespace Choupo
