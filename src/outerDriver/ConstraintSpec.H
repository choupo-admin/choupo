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
Struct
    Choupo::ConstraintSpec

    THE one constraint grammar of the outer drivers (forum #102.6/#103):

        constraints ( { kpi <path>; atMost|atLeast|equals <rhs>; tol <x>; } ... );

    parsed by parseConstraints() and evaluated by evaluateConstraint() --
    shared by the SQP optimizer (which needs constraints to optimise) and
    the sweep's FEASIBILITY MAP (which marks every row, never filters).
    Keywords are atLeast/atMost/equals, NOT min/max -- those collide with
    objective.sense.

    The evaluation emits, per constraint (the #103 amendment: never a
    global string):
        value      -- the extracted response at this point
        rhs        -- the declared bound
        residual   -- SIGNED normalised violation: positive means VIOLATED,
                      scale = max(|rhs|, tol, 1e-12).  atMost:
                      (value-rhs)/scale; atLeast: (rhs-value)/scale;
                      equals: (|value-rhs|-tol)/scale.
        satisfied  -- residual <= 0 (the tol band is inside "satisfied").
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/SimulationResult.H"
#include "ResponseExtractor.H"

#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

struct ConstraintSpec
{
    enum class Op { AtMost, AtLeast, Equals };
    std::string path;        // "<unit>.<kpi>" or "<stream>.<field>"
    Op          op = Op::AtMost;
    scalar      rhs = 0.0;
    scalar      tol = 1.0e-4;

    const char* opWord() const
    {
        switch (op)
        {
            case Op::AtMost:  return "atMost";
            case Op::AtLeast: return "atLeast";
            default:          return "equals";
        }
    }
};

struct ConstraintEval
{
    scalar value     = 0.0;
    scalar residual  = 0.0;   // signed, normalised; > 0 == violated
    bool   satisfied = false;
    bool   evaluated = false; // false when the response was unreadable
};

inline std::vector<ConstraintSpec> parseConstraints(const DictPtr& d,
                                                    const std::string& who)
{
    std::vector<ConstraintSpec> out;
    if (!d->found("constraints")) return out;
    for (const auto& c : d->lookupDictList("constraints"))
    {
        ConstraintSpec con;
        con.path = c->lookupWord("kpi");
        int nForm = 0;
        if (c->found("atMost"))
        { con.op = ConstraintSpec::Op::AtMost;  con.rhs = c->lookupScalar("atMost");  ++nForm; }
        if (c->found("atLeast"))
        { con.op = ConstraintSpec::Op::AtLeast; con.rhs = c->lookupScalar("atLeast"); ++nForm; }
        if (c->found("equals"))
        { con.op = ConstraintSpec::Op::Equals;  con.rhs = c->lookupScalar("equals");  ++nForm; }
        if (nForm != 1)
            throw std::runtime_error(who + ": each constraint needs EXACTLY"
                " one of atMost / atLeast / equals (on '" + con.path + "')");
        con.tol = c->lookupScalarOrDefault("tol", 1.0e-4);
        out.push_back(std::move(con));
    }
    return out;
}

inline ConstraintEval evaluateConstraint(const ConstraintSpec& c,
                                         const SimulationResult& r,
                                         const std::string& who)
{
    ConstraintEval e;
    try { e.value = extractResponse(r, c.path, who); }
    catch (const std::exception&) { return e; }        // evaluated = false
    e.evaluated = true;
    const scalar scale = std::max({ std::abs(c.rhs), c.tol, 1.0e-12 });
    switch (c.op)
    {
        case ConstraintSpec::Op::AtMost:
            e.residual = (e.value - c.rhs) / scale;          break;
        case ConstraintSpec::Op::AtLeast:
            e.residual = (c.rhs - e.value) / scale;          break;
        default:
            e.residual = (std::abs(e.value - c.rhs) - c.tol) / scale;
    }
    e.satisfied = e.residual <= 0.0;
    return e;
}

} // namespace Choupo
