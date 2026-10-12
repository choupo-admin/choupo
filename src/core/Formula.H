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
Class
    Choupo::Formula

Description
    A FORMULA WRITTEN IN A DICTIONARY, compiled ONCE and evaluated many times,
    with its physical dimensions checked at compile time.  Written for the
    `type expression;` rate law (thermo/reaction/ExpressionRate), and kept in
    core/ because nothing in it knows what a reaction is.

    THE GRAMMAR, all of it:

        expr    := term   (('+' | '-') term)*
        term    := unary  (('*' | '/') unary)*
        unary   := ('+' | '-') unary  |  power
        power   := primary ('^' unary)?           (right-associative)
        primary := number | name | name '(' expr (',' expr)* ')' | '(' expr ')'

        number  12   3.5   1.0e-3   (a bare number is DIMENSIONLESS)
        name    letters, digits and '_', optionally followed by ONE bracketed
                part: `T`, `k0`, `x[NH3]`, `c[water]`.  What a name MEANS is
                the caller's business (a `Resolver`); this class only asks.

    `-a^b` is `-(a^b)`, as on paper.

    FUNCTIONS, a closed list:  exp  ln  log10  sqrt  pow(a,b)  min(a,b)
    max(a,b) -- plus every 1-D TABLE the caller declares, called like a
    function of one argument and interpolated LINEARLY between its points.
    There is no `if`, no comparison and no loop: a branch in a rate law is a
    decision about WHICH law to write, and it is the author's to write.

    DIMENSIONS, and why they are checked rather than trusted.  Every name
    carries a `Dimensions`; a number is dimensionless.  `+`, `-`, `min` and
    `max` require equal dimensions; `*` and `/` combine them; `exp`, `ln` and
    `log10` require a dimensionless argument, a TABLE the dimensions of its x
    column; `sqrt` halves them and refuses an odd exponent; `a ^ b` requires a
    dimensionless `b`, and a dimensional `a` only with a CONSTANT `b` that
    leaves integer exponents.  An empirical correlation written "with T in
    kelvin and P in atmospheres" is therefore written with that statement IN
    it -- `T / Kelvin` with `Kelvin 1 K;` -- which is the sentence the paper
    prints beside its equation.  The check the engine cannot make (that the
    AUTHOR meant kelvin) is not pretended.

    WHAT IS REFUSED, by name, at compile time: a syntax error (with the
    column), an unknown name (with the closest known one), an unknown
    function, a wrong argument count, a dimension mismatch (both sides
    printed).  At evaluation: a table argument outside the table's declared x
    span -- a table has no form beyond its points, so it is NEVER
    extrapolated.  A non-finite value is the CALLER's to refuse, because the
    caller knows which named definition produced it.

    RELATION TO core/ExprEval.  ExprEval evaluates a computed `$variable`
    (post-processing: `"evap1.Q + evap2.Q"`) by re-parsing the string on every
    call, with no functions and no dimensions; it is left as it is because its
    identifiers carry dots and its callers resolve them against a
    SimulationResult.  Two grammars for two jobs, said rather than unified:
    this one adds functions, tables, dimensions and parse-once, none of which
    a report needs.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dimensions.H"
#include "core/Types.H"

#include <cstddef>
#include <functional>
#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace Choupo {

class Formula
{
public:

    //- What a name resolves to, at compile time.
    struct Symbol
    {
        bool        constant = false;   // a declared parameter: `value` is it
        scalar      value    = 0.0;
        std::size_t slot     = 0;       // otherwise: index into the slot vector
        Dimensions  dims;
    };

    //- One y column of a 1-D table: y(x), linear between the points, refused
    //  outside them.  `group` is the declared table it belongs to (one x
    //  column may carry several y columns), used in messages and the trace.
    struct Table
    {
        std::string         name;        // the function name, e.g. `b0`
        std::string         group;       // the declared table, e.g. `TableI`
        std::vector<scalar> x, y;        // SI, x strictly increasing
        Dimensions          xDims, yDims;
        std::string         xUnit;       // the declared unit word, for messages
        scalar              xFactor = 1.0;
    };

    using Resolver      = std::function<std::optional<Symbol>(const std::string&)>;
    using TableResolver = std::function<std::shared_ptr<const Table>(const std::string&)>;

    //- What one evaluation saw: the tables it interpolated, each as one
    //  sentence naming the group and the two bracketing points.
    struct Trace
    {
        std::vector<std::string> interpolated;
    };

    //- Compile `text`.  `where` names the formula in every refusal
    //  (e.g. "reaction 'r1', definition `Ka`").  `known` lists the names the
    //  resolver accepts, used only for the closest-name hint.
    static Formula compile(const std::string&              text,
                           const Resolver&                 resolve,
                           const TableResolver&            tables,
                           const std::string&              where,
                           const std::vector<std::string>& known = {});

    //- Evaluate on the caller's slot vector.  Throws on a table argument
    //  outside its span; returns NaN/inf as computed (the caller refuses).
    scalar evaluate(const std::vector<scalar>& slots, Trace* trace = nullptr) const;

    //- The result's dimensions.
    const Dimensions& dims() const { return nodes_[root_].dims; }

    //- The parsed formula printed back (glass box): the PARSE, not the text,
    //  so a reader sees how the precedence was read.
    std::string pretty() const;

    //- The slots this formula reads (sorted, unique).
    const std::vector<std::size_t>& slotsUsed() const { return slots_; }

    //- True when no slot is read (a constant expression).
    bool isConstant() const { return slots_.empty(); }

    enum class Op { Num, Const, Slot, Neg, Add, Sub, Mul, Div, Pow,
                    Exp, Ln, Log10, Sqrt, Min, Max, Table };

    struct Node
    {
        Op          op     = Op::Num;
        scalar      value  = 0.0;       // Num / Const
        std::string text;               // the literal or the name, for pretty()
        std::size_t slot   = 0;
        int         a = -1, b = -1;     // children
        std::shared_ptr<const Table> table;
        Dimensions  dims;
        bool        isConst    = false; // no slot below (for exponent checks)
        scalar      constValue = 0.0;   // its value when isConst
    };

private:

    std::vector<Node>        nodes_;
    int                      root_ = -1;
    std::vector<std::size_t> slots_;

    scalar      eval (int i, const std::vector<scalar>& s, Trace* tr) const;
    std::string print(int i, int parentPrec) const;

    friend class FormulaCompiler;
};

} // namespace Choupo
