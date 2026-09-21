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
    Choupo::AmmoniaRateBench

Description
    THE BENCH IS THE WIRE.  `DysonSimon1968` carries a `verify()`, and an
    unwired self-check is a no-silent-crutch violation -- the same argument
    the Nusselt, friction and transport families already settled.  This op is
    how a student reaches the rate law without building a reactor around it.

    It answers two questions, and they are different questions.

    (1) THE LOCUS OF MAXIMUM RATE, and whether it DESCENDS.  Ammonia synthesis
        is exothermic and reversible, so at any conversion there is one
        temperature where the net rate is greatest, and that temperature falls
        as conversion rises.  Sweeping temperature at a fixed conversion on
        the paper's own reference mixture LOCATES that temperature.  Three
        conversions locate three points on the locus, and the descent is the
        whole reason a converter is quenched: it is the curve
        `tutorials/plant/ammonia03_quench_converter` zigzags about, and until
        this op existed nothing in the tree could draw it.

    (2) THE RATE AT A STATE THE READER DECLARES.  A converter designer's
        actual question is "how fast is this gas going, here?", and the states
        worth asking about are the ones another case computed.  Each declared
        point is evaluated and reported; nothing is compared or ranked.

    WHAT IT DOES NOT DO.  It does not size a bed, integrate along one, or
    touch any reactor.  It never says which temperature a bed SHOULD run at:
    the locus of maximum rate is a thermodynamic and kinetic fact, and where
    to sit relative to it is an engineering choice about catalyst life that
    no correlation in this tree can price.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class AmmoniaRateBench : public PropertyOperation
{
public:
    const std::string& type() const override
    {
        static const std::string t = "ammoniaRateBench";
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
