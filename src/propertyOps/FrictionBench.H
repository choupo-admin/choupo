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
    Choupo::FrictionBench

Description
    THE FRICTION-FACTOR BENCH -- and it does two different things on purpose.

    (1) VERIFY.  Every registered correlation is asked to reproduce its own
        published anchor, and the deviation is printed BESIDE the citation.
        This is the same wire `heatTransferBench` is for the Nusselt family:
        an unwired self-check is itself a no-silent-crutch violation.

    (2) COMPARE -- the half that is pedagogy rather than hygiene.  A
        `compare { Re ...; relRough ...; }` block evaluates EVERY correlation
        at the SAME point and prints the spread, with each one's validity note
        beside its answer.

    THE SECOND IS WHY THIS OPERATION EXISTS.  Four expressions answer one
    question and they disagree; a simulator that picks one and says nothing
    teaches that the friction factor is a fact.  It is a correlation, and
    which one was chosen is part of the answer.  The spread is REPORTED, never
    judged: the bench does not say which is right, because that depends on the
    pipe, and saying so would be the silent crutch in a louder voice.

    The comparison also makes the WINDOWS visible in the only way that
    teaches: Blasius, asked about a rough pipe, answers confidently and is
    wrong, and its note says so on the same line as its number.

        operations
        (
            {
                name     moody;
                type     frictionBench;
                compare  { Re 1e5; relRough 1e-3; }   // optional
            }
        );

    Diagnostics: `dev_<model>` and `f_<model>` per correlation, plus
    `spread_pct` and `f_min` / `f_max` when a comparison point is declared --
    so a golden can pin the DISAGREEMENT, not merely each number.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>

namespace Choupo {

class FrictionBench : public PropertyOperation
{
public:
    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override { return diag_; }

private:
    std::string type_ = "frictionBench";
    std::map<std::string, scalar> diag_;
};

} // namespace Choupo
