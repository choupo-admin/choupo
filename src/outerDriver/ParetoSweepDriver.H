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
    Choupo::ParetoSweepDriver

    The PARETO FRONT by epsilon-constraint (design forum #102.6, approved
    #103) -- multi-objective without a new solver: the SECOND objective
    becomes a swept CONSTRAINT BOUND, and each front point is one run of
    the EXISTING SQP optimizer.  Glass-box: every point is an auditable
    constrained optimisation, the student SEES the trade-off curve they
    swept, and the vocabulary is the shared constraint grammar
    (ConstraintSpec.H), never a Pareto-specific dialect.

        outerDict
        {
            type paretoSweep;

            objective { ... }              // exactly the optimization block
                                           // (kind/path/sense preserved)
            variables ( {path;min;max;initial;} ... );
            constraints ( ... );           // optional FIXED constraints

            tradeoff                       // the swept epsilon bound
            {
                kpi     <path>;            // the second objective
                bound   atMost|atLeast;    // the constraint SENSE (#103:
                                           //   the full grammar, no baked-in
                                           //   atMost; equals is refused --
                                           //   meaningless in a sweep)
                range   ( lo  hi );
                nPoints N;
            }

            report { file pareto.csv; }
        }

    Per point the CSV records epsilon, the achieved objective, the
    achieved tradeoff value, every variable at the optimum, and the
    solver's OWN status (converged + feasible) -- a failed or infeasible
    point stays on the front table, marked (#103: cada ponto guarda
    status e feasibility).  Warm-starting each point from the previous
    solution is an EXECUTION optimisation only: when a warm-started
    point fails, the driver retries COLD from the declared initials and
    ANNOUNCES the retry (#103: se falhar, tenta cold-start e anuncia).
\*---------------------------------------------------------------------------*/

#pragma once

#include "ConstraintSpec.H"
#include "OuterDriver.H"

#include <string>
#include <vector>

namespace Choupo {

class ParetoSweepDriver : public OuterDriver
{
public:
    explicit ParetoSweepDriver(const DictPtr& outerDict);

    const std::string& type() const override { return type_; }
    int                run () override;

private:
    inline static const std::string type_ = "paretoSweep";

    DictPtr             outerDict_;     // re-used to build each point's SQP
    std::string         tradeoffPath_;
    ConstraintSpec::Op  tradeoffOp_ = ConstraintSpec::Op::AtMost;
    scalar              epsLo_ = 0.0, epsHi_ = 0.0;
    std::size_t         nPoints_ = 0;
    std::string         reportFile_ = "pareto.csv";
};

} // namespace Choupo
