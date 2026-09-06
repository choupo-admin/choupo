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
    Choupo::TransportBench

Description
    THE TRANSPORT-CORRELATION BENCH -- the friction bench's twin for the
    five transport families (gas viscosity, gas thermal conductivity, gas
    diffusivity, liquid viscosity, liquid conductivity) plus the two gas
    mixing rules.  Two halves, on purpose:

    (1) VERIFY.  Every registered model is asked to reproduce its own anchor,
        and the deviation is printed BESIDE the primary citation, the window,
        and the KIND of anchor -- "theory" (Eucken's monatomic limit, Wilke's
        phi_ii = 1) or "arithmetic" (the correlation's own closed form at a
        stated point).  The kind is printed because this catalogue holds NO
        measured transport data: a 0.000 % on an arithmetic anchor proves the
        transcription and nothing else, and a bench that let it read as a
        validation would be lying by layout.

    (2) COMPARE -- optional, `compare { T ...; P ...; y ( ... ); }`.  Every
        registered gas-viscosity and gas-conductivity model is evaluated for
        EVERY component of the case at that point, each value printed with
        its computable window verdict; then the case's declared mixing rules
        give mu_mix (Wilke) and k_mix (Wassiljewa / Mason-Saxena) at the
        composition y (equimolar when omitted, announced).  The spread across
        models is published -- and today it is 0.00 % for both, because ONE
        model is registered per gas family.  The bench says so instead of
        hiding it: a spread of one is not agreement, it is the absence of a
        second opinion, and Chapman-Enskog (Lennard-Jones sigma, eps/k that no
        record carries yet) is the named next member.

    THE BENCH NEVER RANKS.  Which correlation is right depends on the gas
    and the state; saying so here would be the silent crutch in a louder
    voice.

        operations
        (
            {
                name     bench;
                type     transportBench;
                compare  { T 373.15 K; P 1 bar; }      // optional
            }
        );

    Diagnostics: `dev_<model>` per correlation and `dev_wilkePhi`; with a
    comparison point, `mu_<model>_<component>` [Pa.s], `k_<model>_<component>`
    [W/(m K)], `mu_mix_Wilke`, `k_mix_Wassiljewa`, `spread_mu_pct`,
    `spread_k_pct`, `n_models_mu`, `n_models_k` -- so a golden pins the
    disagreement (or, today, its absence) and not only each number, and so
    a gate can recompute Wilke and Wassiljewa from the pure values and the
    records' molar masses without trusting the log.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>

namespace Choupo {

class TransportBench : public PropertyOperation
{
public:
    const std::string& type() const override { return type_; }
    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;
    std::map<std::string, scalar> diagnostics() const override { return diag_; }

private:
    std::string type_ = "transportBench";
    std::map<std::string, scalar> diag_;
};

} // namespace Choupo
