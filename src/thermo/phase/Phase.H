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
    Choupo::Phase

Description
    Abstract phase used by the multi-phase thermodynamic package.  Each
    concrete phase (vapour, liquid, solid) implements a single key method:

        sVector  fEffective(T, P, x)        [Pa]

    where  f_i^eff(T, P, x)  is the effective fugacity per unit mole
    fraction of component i in this phase.  Equilibrium between two
    phases α and β is then

         f_i^eff,α(x^α) · x_i^α  =  f_i^eff,β(x^β) · x_i^β

    so the generalised K-value is

         K_i^{αβ}  =  x_i^β / x_i^α  =  f_i^eff,α / f_i^eff,β

    Per phase type:
        VaporPhase :  f_i^eff = φ_i(T,P,y) · P
        LiquidPhase:  f_i^eff = γ_i(T,x)   · P_i^sat(T)
        SolidPhase :  inert (does not equilibrate); crystallising solid
                        with f_i^eff = f_i^{0,S}(T) deferred.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {

class Component;

class Phase
{
public:
    virtual ~Phase() = default;

    virtual const std::string& name()     const = 0;
    virtual const std::string& typeName() const = 0;

    // Effective fugacity per component [Pa].
    virtual sVector fEffective(scalar T_K, scalar P_Pa,
                               const sVector& x) const = 0;

    // Activity coefficients γ_i (T, x).  For VaporPhase this is the
    // ideal-gas limit (γ = 1).  For SolidPhase it throws (no SLE yet).
    // Used by the Michelsen TPD stability test in LL flash.
    virtual sVector activityCoefficients(scalar T_K,
                                          const sVector& x) const = 0;

    // True for vapor / liquid / crystallizing solid.  False for inert solid.
    virtual bool isEquilibriumActive() const { return true; }

    // ---- Factory (run-time selection) -------------------------------------
    using Factory = std::function<std::unique_ptr<Phase>(const DictPtr&,
        const std::vector<std::string>&,
        const std::vector<Component>&)>;

    static void registerType(const std::string& typeName, Factory f);

    // Construct a phase from a dictionary that contains `type <word>;`.
    static std::unique_ptr<Phase> New(const DictPtr&                       phaseDict,
        const std::vector<std::string>&      componentNames,
        const std::vector<Component>&        components);

    static void registerBuiltins();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
