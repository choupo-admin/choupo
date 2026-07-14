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
    Choupo::HConsistency

    The PHYSICAL gate of the one-enthalpy-surface contract (design forum
    #106): a grep gate proves loci, not thermodynamics.  For each named
    component this op checks, at a declared T, the STATE IDENTITIES the
    canonical surface must obey by construction:

      1. dh_liq/dT (finite difference of speciesPhaseEnthalpy) == Cp_liquid
      2. dh_gas/dT (idem)                                      == Cp_idealGas
      3. h_g(298.15) - h_liq(298.15)                           == the
         vaporisation anchor the formation legs use at 298.15 K
      4. d[h_g - h_liq]/dT                                     == Cp_g - Cp_liq
         (Kirchhoff on the STATE Hvap)

    Each check lands as a relative-error diagnostic the golden pins to
    round-off.  A surface whose liquid slope ignored the declared liquid
    Cp (the retired h_ig - Hvap_Watson(T) leg: mheatx duties moved 10%)
    FAILS check 1 loudly here.

        {
            name       h_identity;
            type       hConsistency;
            components ( benzene toluene water ethanol );
            temperature 350;               // K (checks run at this T)
        }
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>

namespace Choupo {

class HConsistency : public PropertyOperation
{
public:
    const std::string& type() const override
    { static const std::string t = "hConsistency"; return t; }
    int run(const DictPtr& dict, const ThermoPackage& thermo,
            int verbosity) override;
    std::map<std::string, scalar> diagnostics() const override
    { return diag_; }

    std::vector<std::string> headline() const override
    { return { "worst_rel_err" }; }

private:
    std::map<std::string, scalar> diag_;
};

} // namespace Choupo
