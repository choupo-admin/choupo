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
Description
    Yield-based reactor (Aspen RYield analogue): outlet set by mass yields
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/UnitOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

// A YIELD reactor (Aspen RYield analogue).  No stoichiometry and no kinetics:
// the user states, directly, the MASS YIELD of each product per unit of total
// feed mass (kg product i / kg feed).  This is the right tool when only the
// product distribution is known (empirical / lumped chemistry -- pyrolysis,
// gasification, combustion, biomass conversion) and writing balanced reactions
// is impractical.  The OVERALL MASS BALANCE always closes: the outlet mass
// equals the inlet mass, so the yields are interpreted on a normalised basis
// (Sum(yield) = 1).  If the supplied yields do not sum to 1 the reactor
// announces the renormalisation aloud (no silent crutch) -- the student owns
// the numbers.
//
// Spec (in operation{}):
//   yields ( { component benzene; yield 0.42; } { component CH4; yield 0.10; } ... );
//   T <K>;     (optional -- isothermal outlet T; defaults to the feed T)
//
// Energy: heat of reaction emerges as Sum_out(n_i h_f) - Sum_in(n_i h_f) from
// the elements/formation datum (h_formation), exactly as the conversion/Gibbs
// reactors do.  If any species (in or out) lacks formation data, the duty is
// NOT reported and the limitation is stated -- never a silent zero.
class YieldReactor : public UnitOperation
{
public:
    YieldReactor() = default;

    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream> producedStreams() const override { return produced_; }
    std::map<std::string, scalar> kpis() const override { return kpis_; }

private:
    inline static const std::string type_ = "yieldReactor";
    std::vector<ProcessStream>     produced_;
    std::map<std::string, scalar>  kpis_;
};

} // namespace Choupo
