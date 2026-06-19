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
    Choupo::HenrysLaw

Description
    Henry's-law constant for a solute--solvent pair.  Captures
    how an only-slightly-soluble gas partitions between vapour and a
    liquid solvent: in the dilute limit

        P_i  =  H_i(T) · x_i        →     K_i  =  H_i(T) / P

    with x_i the mole fraction of the solute in the liquid and P the
    total pressure.

    Temperature dependence follows the textbook van't Hoff form:

        H(T)  =  H_ref · exp [ +ΔH_diss/R · (1/T − 1/T_ref) ]

    where ΔH_diss is the molar enthalpy of dissolution (negative for
    exothermic dissolution; CO2 / NH3 / H2S all become less soluble
    as T rises, so their ΔH_diss is negative and H rises).

    The constant is keyed by the ordered pair (solute, solvent).
    File location: `data/standards/henrysLaw/<solute>-<solvent>.dat`.

    File format:

        solute      CO2;
        solvent     water;

        model       vantHoff;
        H_ref       1.64e8;        // Pa  at T_ref
        T_ref       298.15;        // K
        enthalpy   -19400;         // J/mol  (dissolution; <0 is exothermic)
        Trange      ( 273  373 );
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <string>

namespace Choupo {

class HenrysLaw
{
public:
    HenrysLaw() = default;

    void readFromDict(const DictPtr& d);

    const std::string& solute()  const { return solute_;  }
    const std::string& solvent() const { return solvent_; }

    // Henry's-law constant H(T) in Pa.  K_i = H(T) / P (with P in Pa).
    scalar H(scalar T_K) const;

    scalar H_ref() const { return H_ref_; }
    scalar T_ref() const { return T_ref_; }
    scalar dHdiss() const { return dHdiss_; }
    scalar T_min() const { return T_min_; }
    scalar T_max() const { return T_max_; }

private:
    std::string solute_;
    std::string solvent_;
    std::string model_ = "vantHoff";
    scalar      H_ref_  = 0.0;            // Pa
    scalar      T_ref_  = 298.15;         // K
    scalar      dHdiss_ = 0.0;            // J/mol (negative for exothermic)
    scalar      T_min_  = 273.15;
    scalar      T_max_  = 373.15;
};

} // namespace Choupo
