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
    Choupo::FitBinaryPair

Description
    Concrete OuterDriver: fits the four NRTL/Wilson binary interaction
    parameters (a_ij, b_ij, a_ji, b_ji) of a single binary pair to
    experimental bubble-temperature data, using Levenberg-Marquardt.
    The mixing rule's `alpha` (NRTL) or molar volumes (Wilson) are
    kept fixed.

    Usage in `system/outerDict`:

        type      fitBinaryPair;
        pair      ethanol-water;                 // <c1>-<c2>
        data      constant/experiments/ethanol-water-101kPa;
        unit      bt01;                          // unit reporting T_bubble

        // optional:
        maxIter   30;     tolerance 1.0e-6;
        fdStep    1.0e-4; lambda0   1.0e-3;

    `data` is a dict file with:

        P    1.01325;                            // metadata, K is from KPI
        data
        (
            0.05  358.04
            0.10  355.77
...
        );

    The driver:
       1. mutates `streams.<feedStream>.composition.<c1>` per data row;
       2. mutates `activityModel.pairs[<idx>].{a_ij,b_ij,a_ji,b_ji}` per
          LM iteration;
       3. reads `units[unit].kpis["T_bubble"]` for the residual;
       4. minimises Σ (T_pred − T_exp)² with hand-rolled Levenberg-
          Marquardt (Gauss-Newton + Marquardt damping; finite-difference
          Jacobian; gaussSolve on the 4×4 normal equations).

    Writes a fitted-parameters proposal file at the original pair's
    location with a `.fit-<YYYY-MM-DD>.dat` suffix.
\*---------------------------------------------------------------------------*/

#pragma once

#include "OuterDriver.H"

#include <string>

namespace Choupo {

class FitBinaryPair : public OuterDriver
{
public:
    explicit FitBinaryPair(const DictPtr& outerDict);

    const std::string& type() const override { return type_; }
    int                run () override;

private:
    inline static const std::string type_ = "fitBinaryPair";

    std::string  pairName_;        // "<c1>-<c2>"
    std::string  comp1_, comp2_;   // split from pairName_
    std::string  dataPath_;        // dataset dict file
    std::string  unitName_;        // unit emitting T_bubble

    int          maxIter_   = 30;
    scalar       tolerance_ = 1.0e-6;
    scalar       fdStep_    = 1.0e-4;
    scalar       lambda0_   = 1.0e-3;
};

} // namespace Choupo
