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

    ASSUMPTIONS (glass-box): constant relative volatility (evaluated at
    the feed bubble point), sharp key split, ideal stages.  Like every
    FUG, it does NOT handle azeotropes (α crossing 1) --- use the
    rigorous column for those.

    Inputs (feed );   outputs (distillate  bottoms );
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

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
