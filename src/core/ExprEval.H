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
    Choupo

Description
    A tiny arithmetic expression evaluator for computed `$variables`
    (post-processing expressions).  Hand-rolled recursive-descent
    parser --- no dependency, glass-box --- supporting:

        + - * /        binary operators (usual precedence)
        ( )            parentheses
        + -            unary sign
        numbers        12, 3.5, 1.0e-3
        identifiers    resolved through the caller's `resolve` callback;
                       may be dotted/bracketed: `evap1.Q`, `feed.T`,
                       `product.x[water]`, or a bare variable name `A`.

    The grammar:

        expr := term   (('+' | '-') term)*
        term := factor (('*' | '/') factor)*
        factor := number | identifier | '(' expr ')' | ('+'|'-') factor

    Throws std::runtime_error on a syntax error or when `resolve` rejects
    an identifier.  Used by ComputedReport to evaluate
    `variables { Q_total { compute "evap1.Q + evap2.Q"; } }` against the
    SimulationResult after a solve.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <functional>
#include <string>

namespace Choupo {

scalar evalExpr(const std::string& expr,
                const std::function<scalar(const std::string&)>& resolve);

} // namespace Choupo
