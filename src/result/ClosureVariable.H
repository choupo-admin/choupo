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

    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
-------------------------------------------------------------------------------
Struct
    Choupo::ClosureVariable

Description
    A CLOSURE VARIABLE (DEV.md 4c C174, 2026-10-26): a term a unit publishes
    across its boundary that it COMPUTED AS THE REMAINDER of one of its own
    balances, so that balance, evaluated over the unit, is zero for ANY value
    of the unit's other terms.  The closure then verifies only their SUM.

    The witness is the distillation column: `Q_reboiler_kW = dH - Q_cond`.
    Its first law closed by construction while the condenser duty was wrong
    on every column of the corpus (C169), and `check_energy_closure` read
    green -- a balance used to COMPUTE a variable cannot then be the evidence
    that the variable is right.

    WHAT IS NOT ONE, and the line is drawn here so every unit draws it the
    same way.  A term DEFINED by the unit's only balance -- an isothermal
    reactor's or a heater's duty, H_out - H_in, or an adiabatic outlet solved
    from H_out = H_in -- has no OTHER term for the remainder to absorb: the
    unit's model says nothing else about that heat.  Its closure, re-priced
    by the energy report at the PUBLISHED states, fails whenever the unit
    computed on a state or a surface its streams do not carry (CLAUDE.md 6,
    the 2026-09-12 family), which is exactly what it is evidence of.  A term
    is a closure variable only when the unit ALSO says what it should be by
    another equation -- the column's condenser and reboiler envelopes, an
    adiabatic reactor's zero, a jacket's U A dT, a bed's regeneration duty --
    or when a component of a sum is filled by difference (a membrane's
    water) -- and the published number is the remainder instead.

    A record carries the SECOND ROUTE when the unit has one: the value the
    unit's own model gives the same term, the gap, the tolerance, and whether
    the two agree.  `verified` is true ONLY then.  A unit with no second
    route says so in `note`, and its closure is "by construction -- not
    verified": counted by the reports and the gates, never as evidence.

    Pure data, deliberately in its own small header (the UnitProfile
    precedent): the unit declares it, the flowsheet collects it, the reports
    stamp their per-unit rows from it, the result emitter publishes it, and
    the GUI draws the word.  Nobody recomputes it.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <string>

namespace Choupo {

struct ClosureVariable
{
    std::string unit;          // stamped by the flowsheet (qualified name)
    std::string balance;       // "energy" | "material" | "element"
    std::string variable;      // the published term computed as the remainder
    std::string rule;          // the arithmetic, in words
    std::string blindTo;       // what the unit's closure therefore cannot see
    //  THE SECOND ROUTE, when the unit has one.
    std::string check;         // the other equation, in words ("" = none)
    bool        hasCheck   = false;
    scalar      checkValue = 0.0;   // the second route's value of `variable`
    scalar      gap        = 0.0;   // published - checkValue (same units)
    scalar      tolerance  = 0.0;   // the gap the check accepts
    bool        verified   = false; // hasCheck && |gap| <= tolerance
    //  Whether the second route MUST agree when the model is solved: true
    //  where both routes are the same model's equations (a full MESH's
    //  reboiler envelope, a reactor's declared heat, a membrane's solutes),
    //  false where the gap is the approximation's own content (a CMO
    //  column's envelope).  A gate fails a `mustAgree` record that is not
    //  verified; it reports the rest.
    bool        mustAgree  = false;
    std::string units = "kW";
    std::string note;          // why NOT verified, in words ("" when verified)

    //  The ONE word a reader sorts on, and the one the GUI draws.
    const char* status() const { return verified ? "verified" : "notVerified"; }
};

} // namespace Choupo
