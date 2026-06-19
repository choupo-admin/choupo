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
    Choupo::EquationOfState

Description
    Abstract base for vapour-phase EoS — supplies fugacity coefficients
    φ_i(T, P, y) and molar volume v(T, P, y).  Built-in models register
    via `EquationOfState::registerModel(name, factory)`.

        equationOfState
        {
            model           idealGas;     // or PR, SRK,...
        }
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Constants.H"
#include "core/Dictionary.H"
#include "core/Types.H"

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {

class Component;

class EquationOfState
{
public:
    virtual ~EquationOfState() = default;

    virtual std::size_t n() const = 0;

    // Fugacity coefficients φ_i for all components in the vapour phase.
    virtual sVector phi(scalar T_K, scalar P_Pa, const sVector& y) const = 0;

    // Molar volume of the mixture [m³/mol]
    virtual scalar molarVolume(scalar T_K, scalar P_Pa, const sVector& y) const = 0;

    // Departure (residual) functions H^R, S^R = real − ideal-gas.
    //
    //     H_real(T, P, y) = H_ig(T, y)        + H_residual(T, P, y)
    //     S_real(T, P, y) = S_ig(T, P, y)     + S_residual(T, P, y)
    //
    // For idealGas both are identically 0 (default).  Cubic EoS like SRK
    // / PR override them with departure integrals derived from a(T) and
    // its temperature derivative.  Units: [J/mol] and [J/(mol·K)].
    virtual scalar H_residual(scalar /*T_K*/, scalar /*P_Pa*/, const sVector&) const
    {
        return 0.0;
    }
    virtual scalar S_residual(scalar /*T_K*/, scalar /*P_Pa*/, const sVector&) const
    {
        return 0.0;
    }

    // Compressibility Z = P·v / (R·T) at the vapour root.  Default ~ 1
    // for ideal gas; cubic EoS override.  Useful as a diagnostic and
    // as a single number callers can read instead of v.
    virtual scalar Z(scalar T_K, scalar P_Pa, const sVector& y) const
    {
        return P_Pa * molarVolume(T_K, P_Pa, y) / (constant::R * T_K);
    }

    virtual const std::string& modelName() const = 0;

    // Minimum-parameter-set MANIFEST (validation boundary, NOT the hot path):
    // the per-component property keys this model needs to be trustworthy
    // (e.g. {"Tc","Pc","omega"} for a cubic EoS).  PackageAudit checks each
    // component against this at load and warns on a MISSING or ESTIMATED value.
    // Default: none (idealGas needs only MW, always present).  See PackageAudit.H.
    virtual std::vector<std::string> requiredComponentProperties() const
    {
        return {};
    }

    using Factory = std::function<std::unique_ptr<EquationOfState>(const DictPtr&,
                          const std::vector<Component>&)>;
    static void registerModel(const std::string& name, Factory f);
    static std::unique_ptr<EquationOfState> New(const DictPtr& dict,
                                                const std::vector<Component>& comps);
    static void registerBuiltins();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
