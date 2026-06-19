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
    Choupo::IF97WaterFluid

Description
    A THIN PureFluidModel wrapper over the FROZEN Choupo::IF97 kernel
    (src/thermo/iapws/IF97.{H,cpp}).  It does exactly ONE thing the kernel
    does not: the unit bridge from the kernel's table units (per unit MASS,
    on the IAPWS triple-point datum) to Choupo's per-mole canonical units.

    The kernel returns, at routed/validity-checked (p,T):
        v  [m³/kg]   h [kJ/kg]   s [kJ/(kg·K)]   cp [kJ/(kg·K)]

    With MW = molar mass of water [g/mol] (= kg/kmol in a Choupo `.dat`):
        h_molar  [J/mol]      = h_kJkg  * MW          (kJ/kg · g/mol = J/mol)
        s_molar  [J/(mol·K)]  = s_kJkgK * MW
        cp_molar [J/(mol·K)]  = cp_kJkgK* MW
        v_molar  [m³/mol]     = v_m3kg  * MW / 1000   (m³/kg · kg/mol)

    The datum is the IF97 triple-point reference state; regions 1 (compressed
    liquid), 2 (superheated vapour) and 4 (saturation line) are covered by
    this kernel slice.  The kernel stays byte-frozen; verify() delegates to
    IF97::verify().

SourceFiles
    PureFluidModel.cpp   (this wrapper is small; it lives with the factory)
\*---------------------------------------------------------------------------*/

#pragma once

#include "thermo/pureFluid/PureFluidModel.H"

namespace Choupo {

class IF97WaterFluid : public PureFluidModel
{
public:
    // mw is the molar mass of water [g/mol] (Component::MW(), kg/kmol == g/mol).
    explicit IF97WaterFluid(scalar mw_g_per_mol) : mw_(mw_g_per_mol) {}

    std::string type() const override { return "IF97"; }

    scalar h_molar (scalar T_K, scalar p_Pa) const override;
    scalar s_molar (scalar T_K, scalar p_Pa) const override;
    scalar v_molar (scalar T_K, scalar p_Pa) const override;
    scalar cp_molar(scalar T_K, scalar p_Pa) const override;
    scalar p_sat   (scalar T_K) const override;
    scalar T_sat   (scalar p_Pa) const override;

    // Transport: (T,p) in, density fetched from the IF97 kernel internally,
    // then the IAPWS R12-08 / R15-11 / R1-76 transport kernels.
    scalar mu      (scalar T_K, scalar p_Pa) const override;
    scalar lambda  (scalar T_K, scalar p_Pa) const override;
    scalar sigma   (scalar T_K) const override;

    double verify() const override;

private:
    scalar mw_;   // g/mol
};

} // namespace Choupo
