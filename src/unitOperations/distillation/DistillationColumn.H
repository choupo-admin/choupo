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
    Choupo::DistillationColumn

Description
    Multicomponent distillation column, rigorous bubble-point method
    (Wang-Henke), Constant Molar Overflow (CMO) assumption — no energy
    balance per stage, no Murphree efficiency.

    Stage numbering (1-based from top):
        stage 1     = top tray (vapour goes up to a total condenser)
        stage NF    = feed stage (feed enters here)
        stage N     = partial reboiler (equilibrium stage)

    With total condenser, x_D,i = y_1,i = K_{1,i}·x_{1,i}, and Σ x_D = 1
    is automatically enforced by the bubble-point at stage 1.

    Inputs (per stage are NOT user-specified; the user gives the column
    skeleton):
        nStages, feedStage,  R = L/D,  D (distillate flow [kmol/h]),
        q (feed quality, default 1 = saturated liquid).

    Algorithm:
        1. Initial T-profile (linear between guesses) and x-profile
           (heuristic Σ-z-rich at top, Σ-z-poor at bottom).
        2. Outer loop:
           a. K_j = K(T_j, x_j) per stage from ThermoPackage.
           b. For each component, solve a tridiagonal system in stage
              index for x_{j,i} (Thomas algorithm).
           c. Normalise Σ_i x_{j,i} = 1 at every stage.
           d. Update T_j by bubble-point  Σ K(T_j,x_j) x_{j,i} = 1
              (1-D Newton).
           e. Check max|Δx|, max|ΔT|; iterate.

    Outputs:
        Distillate: F = D,  z = x_D,  T = T_1
        Bottoms   : F = B,  z = x_N,  T = T_N
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/UnitOperation.H"

#include <string>
#include <vector>

namespace Choupo {

class DistillationColumn : public UnitOperation
{
public:
    DistillationColumn() = default;

    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream> producedStreams() const override
    {
        return produced_;
    }

    std::map<std::string, scalar> kpis() const override
    {
        return kpis_;
    }

    std::optional<UnitProfile> profile() const override
    {
        if (profile_.columns.empty()) return std::nullopt;
        return profile_;
    }

private:
    // Rigorous simultaneous-correction (MESH Newton) method --- selected
    // by `method simultaneous;` in the operation block.  Solves all the
    // stage equations at once by Newton (handles azeotropes, where the
    // sequential bubble-point Wang-Henke is unstable).  The default
    // method stays Wang-Henke, so existing cases are untouched.
    int solveSimultaneous(const DictPtr& dict,
                          const ThermoPackage& thermo,
                          int verbosity);

    inline static const std::string type_ = "distillationColumn";
    std::vector<ProcessStream>     produced_;
    std::map<std::string, scalar>  kpis_;
    UnitProfile                    profile_;
};

} // namespace Choupo
