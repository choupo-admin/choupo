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
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  VanKrevelen -- polymer group-contribution estimator (Slice 1: DENSITY).

  Predicts a polymer's REPEAT-UNIT properties from additive group sums, the
  exact analogue of Joback but for the repeat unit instead of a small molecule:

      M0  = sum n_i * MW_i           repeat-unit molar mass   [g/mol]
      Vw  = sum n_i * Vw_i           Bondi van der Waals vol  [cm^3/mol]
      V   = k * Vw                   molar volume             [cm^3/mol]
      rho = M0 / V                   density                  [g/cm^3]

  The per-group van der Waals volumes Vw_i are Bondi (J. Phys. Chem. 68 (1964)
  441) -- the PRIMARY source per value.  They are NOT taken from the Van
  Krevelen book table (copyright); they are derived from the UNIFAC R_k volume
  parameters Choupo already ships (data/standards/parameters/UNIFAC/, ChemSep Artistic-2.0,
  Hansen 1991 -> Bondi) via the standard Abrams-Prausnitz normalisation
  Vw = R_k * 15.17 cm^3/mol.  See data/standards/parameters/vanKrevelen.dat.

  Tg, solubility parameter delta, Tm, Cp are DEFERRED (Slice 2/3): their open
  parameters are a different, correctly-attributed thing (Tg needs the Yang 2020
  modified scheme, not bare Van Krevelen; delta/Tm are book-locked).
\*---------------------------------------------------------------------------*/

#ifndef Choupo_VanKrevelen_H
#define Choupo_VanKrevelen_H

#include "ConstantEstimator.H"

namespace Choupo {

class VanKrevelen : public ConstantEstimator
{
public:
    std::string method() const override
    {
        return "Van Krevelen group contribution (density; Vw from Bondi 1964 "
               "via UNIFAC R_k = Vw/15.17)";
    }
    InputKind inputKind() const override { return InputKind::PolymerGroups; }

    PolymerEstimate estimatePolymer(const std::vector<GroupSpec>& groups,
                                    double k,
                                    bool& ok, std::string& error) const override;

    std::vector<std::string> knownGroups() const override;
};

} // namespace Choupo

#endif
