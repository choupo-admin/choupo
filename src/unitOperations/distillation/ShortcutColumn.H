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
    Choupo::ShortcutColumn

Description
    Shortcut distillation design by the Fenske-Underwood-Gilliland (FUG)
    method --- the classic preliminary column design.  Distinct from the
    rigorous stage-by-stage `distillationColumn` (Wang-Henke): FUG is a
    DESIGN method (specify the separation, get the number of stages and
    the reflux), fast and robust because it is closed-form.

    Steps:
      * Fenske  --- minimum stages N_min at total reflux, from the two
                    key components' recoveries and their relative
                    volatility; also distributes the non-keys.
      * Underwood --- minimum reflux R_min from the feed and a root θ of
                    Σ αᵢ zᵢ/(αᵢ − θ) = 1 − q.
      * Gilliland --- the actual stage count N at the operating reflux R,
                    via the Molokanov correlation.
      * Kirkbride --- the feed-stage location.

    Operation block:
        lightKey     benzene;     // the LK
        heavyKey     toluene;     // the HK
        recoveryLK   0.99;        // fraction of feed LK to the distillate
        recoveryHK   0.01;        // fraction of feed HK to the distillate
        refluxRatio  1.5;         //  OR  refluxFactor 1.3 (= R / R_min)

    EXACTLY ONE of the two reflux keys is MANDATORY, and there is no
    default.  There used to be (`R = 1.3 * Rmin`, commented "sensible
    default"), and 1.3 is indeed the usual rule of thumb --- which is what
    made the silence expensive rather than harmless: the stage count is
    what a student reads off this unit, R is what decides it, and a number
    the engine chose is one nobody can defend when asked why the column has
    that many stages.  Declaring it costs one line, both cases in the
    corpus already did, and the refusal quotes the computed R_min so a
    factor can be picked from it.

    ASSUMPTIONS (glass-box): constant relative volatility (evaluated at
    the feed bubble point), sharp key split, ideal stages.  Like every
    FUG, it does NOT handle azeotropes (α crossing 1) --- use the
    rigorous column for those.

    THE FEED BUBBLE POINT IS THE METHOD'S ONLY THERMODYNAMIC EVALUATION.
    Every α, and hence N_min, θ, R_min, N and the feed stage, comes from
    it.  One that does not converge REFUSES; it used to fall back on the
    feed's declared temperature and answer anyway, which is a column
    designed for a different mixture state, reported as this one.

    BOTH PRODUCTS ARE REPORTED AT THAT SAME FEED BUBBLE TEMPERATURE, and
    that is a KNOWN GAP rather than a claim: a total condenser's distillate
    leaves at its OWN bubble point and the bottoms at the reboiler's, and
    this method computes neither.  Anything downstream that prices those
    streams inherits the placeholder.

    Inputs (feed );   outputs (distillate  bottoms );
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

#include <map>

namespace Choupo {

class ShortcutColumn : public UnitOperation
{
public:
    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream>    producedStreams() const override { return produced_; }
    std::map<std::string, scalar> kpis()            const override { return kpis_; }

private:
    inline static const std::string type_ = "shortcutColumn";
    std::vector<ProcessStream>       produced_;
    std::map<std::string, scalar>    kpis_;
};

} // namespace Choupo
