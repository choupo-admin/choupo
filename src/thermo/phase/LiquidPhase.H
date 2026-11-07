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
    Choupo::LiquidPhase

Description
    Liquid phase whose effective fugacity follows the γ-Psat contribution:

        f_i^eff(T, x)  =  γ_i(T, x)  ·  P_i^sat(T)              [Pa]

    and, when the package's vapour is a REAL gas (non-ideal EoS),
    γ_i · φ_i^sat(T) · P_i^sat(T) (thermo/phase/SaturatedVapour.H).  The
    factor is the same on every liquid, so it cancels in the LL ratio.

    Two such phases can coexist for LLE; the K-value between them is then
    K_i^{αβ} = γ_i^α / γ_i^β (the pure-component Psat cancels).

    Dict form:

        { name liquid;  type liquid;
          activity { model NRTL; pairs (... ); } }
\*---------------------------------------------------------------------------*/

#pragma once

#include "Phase.H"
#include "thermo/activityCoefficient/ActivityModel.H"

#include <memory>

namespace Choupo {

class LiquidPhase : public Phase
{
public:
    LiquidPhase(const DictPtr& dict,
                const std::vector<std::string>& componentNames,
                const std::vector<Component>& components);

    const std::string& name()     const override { return name_; }
    const std::string& typeName() const override { return typeName_; }

    sVector fEffective(scalar T_K, scalar P_Pa,
                       const sVector& x) const override;

    sVector activityCoefficients(scalar T_K,
                                  const sVector& x) const override
    {
        return activity_->gamma(T_K, x);
    }

    const ActivityModel& activity() const { return *activity_; }

    // Borrowed-pointer re-bind after the owning ThermoPackage is moved.
    void rebindComponents(const std::vector<Component>* comps) override
    { components_ = comps; }
    void rebindPureFluids(const PureFluidMap* pf) override
    { pureFluids_ = pf; }
    void rebindVapourEos(const EquationOfState* eos) override
    { vapourEos_ = eos; }

private:
    std::string name_;
    inline static const std::string typeName_ = "liquid";
    std::unique_ptr<ActivityModel>      activity_;
    const std::vector<Component>*       components_ = nullptr;   // borrowed
    const PureFluidMap*                 pureFluids_ = nullptr;   // borrowed
    const EquationOfState*              vapourEos_  = nullptr;   // borrowed; null = ideal
    std::size_t                         n_ = 0;
};

} // namespace Choupo
