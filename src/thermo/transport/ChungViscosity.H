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
    Choupo::ChungViscosity

Description
    Low-pressure gas viscosity by the Chung et al. (1988) correlation
    (Reid-Prausnitz-Poling, "The Properties of Gases and Liquids", 4th
    ed., eq. 9-4.10):

        η [μP] = 40.785 · F_c · √(M·T) / (V_c^{2/3} · Ω_v)

        Ω_v = 1.16145/T*^0.14874 + 0.52487/e^{0.77320 T*}
                                  + 2.16178/e^{2.43787 T*}   (Neufeld)
        T*  = 1.2593 · T / T_c
        F_c = 1 − 0.2756 ω                 (non-polar form)

    Uses only data already on Component (Tc, Pc, ω, MW).  The critical
    volume is estimated from the acentric-factor correlation for the
    critical compressibility, Z_c ≈ 0.2918 − 0.0928 ω, via
    V_c = Z_c R T_c / P_c --- which reproduces N2 / CO2 viscosity to ~1 %.
    Returns Pa·s.
\*---------------------------------------------------------------------------*/

#pragma once

#include "TransportModel.H"

namespace Choupo {

class ChungViscosity : public TransportModel
{
public:
    explicit ChungViscosity(const DictPtr& /*dict*/) {}

    const std::string& modelName() const override { return name_; }
    scalar viscosityGasPure(const Component& c, scalar T_K) const override;

private:
    inline static const std::string name_ = "Chung";
};

} // namespace Choupo
