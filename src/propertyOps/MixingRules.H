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
    Choupo::MixingRules

Description
    Publish the van der Waals ONE-FLUID DECOMPOSITION of a cubic equation
    of state's mixture parameters at one state -- every pure a_i(T) and
    b_i, every binary k_ij as constructed, every pair's additive term in

        a_mix(T) = ΣΣ y_i y_j (1 − k_ij) √(a_i a_j),   b_mix = Σ y_i b_i

    and the identity that re-adds the terms to the a_mix the engine runs.
    The numbers come from `EquationOfState::mixingLedger`, a window on the
    SAME buildMix the hot path executes -- this op transcribes no mixing
    rule of its own; its only arithmetic is the re-addition (each pair
    term from the ledger's own a, k_ij, y) and the two dimensionless
    definitions A = a_mix·P/(RT)², B = b_mix·P/(RT), re-stated here ONLY
    so a reader can walk from the pair table into the cubic in Z.  A
    re-addition gap beyond round-off REFUSES: it would mean this
    explanation and the engine disagree, and a wrong explanation
    delivered confidently is worse than none.

    Dictionary form:

        {
            name        mix_ledger;
            type        mixingRules;
            state
            {
                T            250 K;
                P            30 bar;
                composition  { N2 0.05;  CH4 0.90;  CO2 0.05; }
            }
        }

    Refusals, each by name: a package with no equation-of-state slot; a
    model with no one-fluid rule (ideal gas has no a at all, PC-SAFT
    mixes inside its segment dispersion sum -- explaining either with
    this table would describe arithmetic the model does not run); and
    the re-addition identity above.

    Which k_ij were DECLARED (with their records) and which pairs run
    the k_ij = 0 default is announced by the EoS at construction -- one
    home; this op publishes the resulting matrix so the values are
    pinned, and counts the nonzero pairs.

SourceFiles
    MixingRules.cpp
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>

namespace Choupo {

class MixingRules : public PropertyOperation
{
public:
    MixingRules() = default;

    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override
    {
        return diag_;
    }

private:
    inline static const std::string type_ = "mixingRules";
    std::map<std::string, scalar>   diag_;
};

} // namespace Choupo
