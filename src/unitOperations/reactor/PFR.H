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
    Choupo::PFR

Description
    Plug Flow Reactor — single phase (liquid), isothermal, single reaction,
    power-law kinetics.  Integrate the molar-flow balance along the axial
    coordinate V (reactor volume from inlet, 0 → V_R):

         dF_i / dV  =  ν_i · r(F)        F_i(0) = F_{i,in}

         r = k(T) · Π (F_j / Q )^β_j      [mol/(m³·s)]

    Volumetric flow Q is taken constant at the inlet value (liquid-phase
    incompressible assumption) — adequate for the educational target.

    Integration:  fixed-step 4th-order Runge-Kutta (RK4), implemented
    by hand so students see exactly what is happening.

    For a 1st-order reaction the closed form
         F_A(V_R) / F_A,in = exp(-k τ)
    is recovered to machine precision with ~100 RK4 steps, which is
    the canonical regression check.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/UnitOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class PFR : public UnitOperation
{
public:
    PFR() = default;

    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream> producedStreams() const override
    {
        return produced_;
    }

    std::optional<UnitProfile> profile() const override
    {
        if (profile_.columns.empty()) return std::nullopt;
        return profile_;
    }

    std::map<std::string, scalar> kpis() const override { return kpis_; }

private:
    inline static const std::string type_ = "pfr";
    std::vector<ProcessStream>     produced_;
    UnitProfile                    profile_;
    std::map<std::string, scalar>  kpis_;
};

} // namespace Choupo
