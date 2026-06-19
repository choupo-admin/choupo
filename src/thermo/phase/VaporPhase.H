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
    Choupo::VaporPhase

Description
    Vapor phase whose effective fugacity follows the EoS contribution:

        f_i^eff(T, P, y)  =  φ_i(T, P, y)  ·  P                  [Pa]

    Dict form:

        { name vapor;  type vapor;  eos { model idealGas; } }
\*---------------------------------------------------------------------------*/

#pragma once

#include "Phase.H"
#include "thermo/equationOfState/EquationOfState.H"

namespace Choupo {

class VaporPhase : public Phase
{
public:
    VaporPhase(const DictPtr& dict,
               const std::vector<std::string>& componentNames,
               const std::vector<Component>& components);

    const std::string& name()     const override { return name_; }
    const std::string& typeName() const override { return typeName_; }

    sVector fEffective(scalar T_K, scalar P_Pa,
                       const sVector& y) const override;

    // Vapor activity coefficients (ideal-gas limit: γ = 1).
    sVector activityCoefficients(scalar /*T*/, const sVector& y) const override
    {
        return sVector(y.size(), 1.0);
    }

    const EquationOfState& eos() const { return *eos_; }

private:
    std::string name_;
    inline static const std::string typeName_ = "vapor";
    std::unique_ptr<EquationOfState> eos_;
    std::size_t n_ = 0;
};

} // namespace Choupo
