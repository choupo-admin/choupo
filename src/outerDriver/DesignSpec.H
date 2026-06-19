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
    Choupo::DesignSpec

Description
    A design specification: wrap the simulator with an outer
    Newton-ND that MANIPULATES one or more case-level $variables and
    TARGETS one or more KPI / stream values.  The number of unknowns
    equals the number of targets.

    This driver only works on cases whose flowsheetDict declares a
    top-level `variables {... }` block --- because the manipulated
    quantities are NAMED variables, not dotted paths.  See `system/
    flowsheetDict` in the bundled designSpec tutorials for the
    canonical pattern.

    Dict syntax (system/outerDict)
    ------------------------------
        type    designSpec;

        manipulate
        (
            { variable A;    initial 17;   min 5;   max 30;  unit m2;  }
            { variable P_1;  initial 100;  min 50;  max 160; unit kPa; }
        );

        targets
        (
            // Value-target form: a computed quantity must equal a
            // literal.  `value` and `tol` carry their own unit
            // suffixes (parser converts to canonical SI; cross-checks
            // them against the path's expected dimensions when
            // available).
            { path  productConc.F_mass;   value 0.3125 kg/s;   tol 1e-3 kg/s; }

            // Equality-target form: two computed quantities
            // must be equal.  Used for inter-effect mass closure,
            // recycle balancing, etc.
            { lhs   V1.F_mass;   rhs   effect2.F_cond;         tol 1e-4 kg/s; }
        );

        options
        {
            maxIter  50;
            tolF     1.0;            // |F|_2 < 1  means each residual ~ tol
            fdStep   1.0e-4;
        }

        report
        {
            file     designspec_history.csv;
        }

    The manipulated $A propagates LIVE to every unit op that read
    `area $A;` (or any other field).  No paths, no broadcasting ---
    the dict reference is the broadcast.

    Algorithm
        1.  Read the spec.  Validate dim(manipulate) == dim(targets).
        2.  x0 = [initial_i for each manipulate], converted to SI from
            the optional `unit` suffix on each entry.
        3.  F(x) := clone flowsheetDict, write x[i] to
            variables.<name_i>, run simulator, then for each target j
                value-target:   residual[j] = (resp(path) - value) / tol
                equality-target:residual[j] = (resp(lhs)  - resp(rhs)) / tol
            All quantities in canonical SI.
        4.  newtonND(F, x0).
        5.  At convergence: replay simulator at x*, emit structured
            result JSON, write CSV history.

    Limitations (first cut)
      * Variable must exist as a scalar entry in the case's
        `variables {... }` block.
      * Box bounds advisory: x clipped after every step.
      * No regularisation for under/over-determined systems --- caller
        supplies n equations + n unknowns.
\*---------------------------------------------------------------------------*/

#pragma once

#include "OuterDriver.H"

#include <string>
#include <vector>

namespace Choupo {

class DesignSpec : public OuterDriver
{
public:
    explicit DesignSpec(const DictPtr& outerDict);

    const std::string& type() const override { return type_; }
    int                run () override;

private:
    inline static const std::string type_ = "designSpec";

    struct Manipulate
    {
        std::string variable;   // name in the case's `variables {... }` block
        scalar      initial;    // in canonical SI (post unit-suffix conversion)
        scalar      lo;
        scalar      hi;
    };

    // Two flavours of target:
    //   Value:    resp(path) ==  value           (path + value)
    //   Equality: resp(lhs)  ==  resp(rhs)       (lhs + rhs, no value)
    // Both share `tol` as the residual normaliser (so |F|_2 ~ 1 means
    // each constraint is satisfied to within tol).
    struct Target
    {
        enum class Kind { Value, Equality } kind = Kind::Value;
        std::string path;       // Value form
        std::string lhs;        // Equality form
        std::string rhs;        // Equality form
        scalar      value = 0;  // canonical SI
        scalar      tol   = 1.0;
    };

    std::vector<Manipulate>  vars_;
    std::vector<Target>      targets_;

    int      maxIter_   = 50;
    scalar   tolF_      = 1.0e-6;
    scalar   fdStep_    = 1.0e-4;
    std::string reportFile_ = "designspec_history.csv";
};

} // namespace Choupo
