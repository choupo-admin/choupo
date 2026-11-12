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
    Choupo::HelmholtzPureFluid

Description
    A reference (multiparameter Helmholtz) equation of state REACHING A
    FLOWSHEET, through the PureFluidModel factory -- the base its own header
    reserves for "a single self-contained fundamental equation tied to its
    own datum", which is exactly what a reference equation is (it is NOT an
    EquationOfState: that base prices DEPARTURES of a mixture from the ideal
    gas, and a reference equation carries its own ideal-gas part).

        pureFluids { water { method Helmholtz; equation IAPWS95; } }

    A thin unit bridge, like IF97WaterFluid: the kernel speaks per unit
    MASS (J/kg, kg/m3); with MW [g/mol]
        h_molar = h * MW / 1000      [J/mol]      (s, cp likewise)
        v_molar = MW / 1000 / rho    [m3/mol]
    The datum is the PUBLICATION's (IAPWS-95: u = s = 0 for the saturated
    liquid at the triple point, the same convention as IF97).  The phase at
    (T, p) is the stable one: below T_c the branch psat(T) names, from the
    Maxwell saturation of the same equation.  Every (T, p) outside the
    publication's window is announced (ReferenceFluid::announceIfOutside).

SourceFiles
    ReferencePureFluid.cpp
\*---------------------------------------------------------------------------*/

#pragma once

#include "thermo/pureFluid/PureFluidModel.H"
#include "ReferenceFluid.H"

#include <string>
#include <utility>

namespace Choupo {

class HelmholtzPureFluid : public PureFluidModel
{
public:
    HelmholtzPureFluid(const DictPtr& dict, scalar mw_g_per_mol);

    std::string type() const override { return "Helmholtz"; }

    scalar h_molar (scalar T_K, scalar p_Pa) const override;
    scalar s_molar (scalar T_K, scalar p_Pa) const override;
    scalar v_molar (scalar T_K, scalar p_Pa) const override;
    scalar cp_molar(scalar T_K, scalar p_Pa) const override;
    scalar p_sat(scalar T_K) const override;
    scalar T_sat(scalar p_Pa) const override;
    std::pair<scalar, scalar> saturationWindow() const override;
    double verify() const override;

private:
    helmholtz::State stateAt(scalar T_K, scalar p_Pa) const;

    // the process-wide cached record (ReferenceFluid::load owns it)
    const helmholtz::ReferenceFluid* fluid_ = nullptr;
    const helmholtz::ReferenceFluid& f() const { return *fluid_; }
    scalar mw_;
};

} // namespace Choupo
