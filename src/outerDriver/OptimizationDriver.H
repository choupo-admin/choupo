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
    Choupo::OptimizationDriver

Description
    Minimise a scalar objective by varying design variables in the
    flowsheetDict.  Reads `system/outerDict`:

        type        optimization;
        method      nelderMead;        // only supported method for now

        variables
        (
            { path "units[0].operation.refluxRatio";  min 3.0; max 5.0;
                                                       initial 3.5; }
            { path "units[0].operation.feedStage";    min 6;   max 12;
                                                       initial 8;  }
        );

        objective
        {
            kind        kpi;           // kpi | stream | cost | costTotal
            path        column01.V_strip;
            sense       minimise;      // minimise (default) | maximise
        }

        options
        {
            maxIter     200;
            tolX        1e-4;
            tolF        1e-4;
            simplexInit 0.10;
        }

        report
        {
            file        optimization_history.csv;
        }

    Per evaluation the driver:
        1. clones the flowsheet template;
        2. writes each design variable into its target path
           (box-clipped to [min, max]);
        3. runs the simulator (closure from main.cpp);
        4. optionally runs the post-processor chain if the objective
           kind is "cost" or "costTotal" and a postDict was supplied;
        5. extracts the objective scalar from the SimulationResult;
        6. returns it to the Nelder-Mead solver (multiplied by -1
           if sense == maximise).

    On termination the driver replays the simulator once at the best
    point and emits the structured result block on stdout (so the
    case directory ends with the final state of the optimised case).

    `cost` and `costTotal` objective kinds require the case to also
    have a `system/postDict` with a sizing + costing chain; without
    it, the driver throws at start.
\*---------------------------------------------------------------------------*/

#pragma once

#include "OuterDriver.H"

#include <string>
#include <vector>

namespace Choupo {

class OptimizationDriver : public OuterDriver
{
public:
    explicit OptimizationDriver(const DictPtr& outerDict);

    const std::string& type() const override { return type_; }
    int                run () override;

    // Objective specification (public so the free objective-extractor
    // can dispatch on it from the.cpp's anonymous namespace).
    enum class Sense { Minimise, Maximise };
    enum class Kind  { Kpi, Stream, Cost, CostTotal };

private:
    inline static const std::string type_ = "optimization";

    struct Var
    {
        std::string path;
        scalar      lo;
        scalar      hi;
        scalar      x0;
    };

    // A nonlinear constraint:  resp(kpi)  {<= | >= | ==}  rhs (canonical SI).
    struct Constraint
    {
        enum class Op { AtMost, AtLeast, Equals };
        std::string path;        // "<unit>.<kpi>" or "<stream>.<field>"
        Op          op = Op::AtMost;
        scalar      rhs = 0.0;
        scalar      tol = 1.0e-4; // only used by Equals (equality scaling)
    };

    enum class Method { NelderMead, Sqp };

    std::vector<Var>        vars_;
    std::vector<Constraint> constraints_;
    Method                  method_    = Method::NelderMead;
    Kind                    objKind_   = Kind::Kpi;
    std::string             objPath_;            // "<unit>.<field>" depending on kind
    Sense                   objSense_  = Sense::Minimise;

    // Nelder-Mead options
    scalar                  tolX_       = 1.0e-4;
    scalar                  tolF_       = 1.0e-4;
    int                     maxIter_    = 200;
    scalar                  simplexInit_ = 0.10;

    // SQP options
    scalar                  fdStep_      = 1.0e-5;
    bool                    fdCentral_   = false;

    std::string             reportFile_ = "optimization_history.csv";

    // The two solver back-ends.
    int runNelderMead();
    int runSqp();
};

} // namespace Choupo
