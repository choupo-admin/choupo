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
    Choupo::RateLawBench

Description
    A RATE LAW ON THE BENCH, without a reactor around it.  The law is the
    one a case writes in its constant/reactions (`kinetics { type expression;
    }`, thermo/reaction/ExpressionRate), named by `reaction <name>;`; the
    bench evaluates it and prints it back as PARSED.  It replaced the
    ammonia-only `ammoniaRateBench` on 2026-10-12 (DEV.md 4c C67), when the
    Dyson & Simon law left the engine for the case.

    It answers two questions, and they are different questions.

    (1) THE LOCUS OF MAXIMUM RATE, and whether it DESCENDS.  For a reversible
        exothermic reaction there is one temperature, at each conversion,
        where the net rate is greatest, and that temperature falls as
        conversion rises -- the curve a quench converter zigzags about.  A
        temperature sweep at a fixed conversion LOCATES it.  The conversion
        is of a declared `keyReactant`, walked from a declared `baseMixture`
        along the reaction's own stoichiometry; `maximise` names the quantity
        located (the law's value, or one of its definitions).

    (2) THE RATE AT A STATE THE READER DECLARES -- each `points` entry is
        evaluated and reported; nothing is compared or ranked.

    What is published is chosen by the case: `report ( { name <n>; unit <u>;
    } ... )`, each a definition, a parameter, or the law's own `rate` /
    `forward` / `reverse`, converted to the declared unit (whose dimensions
    must be the quantity's).  A composition that does not sum to one is
    REFUSED, never normalised: which entry is wrong is the author's to say.

    WHAT IT DOES NOT DO.  It does not size a bed, integrate along one, or
    touch a reactor, and it never says which temperature a bed SHOULD run at.
    It holds no anchors of its own: the checks a law must pass are a GATE's
    (bin/curate/check_ammonia_rate.py for the ammonia law), which evaluates
    every case's declared law through this bench.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class RateLawBench : public PropertyOperation
{
public:
    const std::string& type() const override
    {
        static const std::string t = "rateLawBench";
        return t;
    }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override { return diag_; }

private:
    std::map<std::string, scalar> diag_;
};

} // namespace Choupo
