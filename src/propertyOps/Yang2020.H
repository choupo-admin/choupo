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
  Yang2020 -- polymer group-contribution estimator for the GLASS TRANSITION
  temperature Tg (Slice 2).  This is the YANG 2020 MODIFIED scheme, NOT bare
  Van Krevelen -- a separate, correctly-attributed method.

  Source: Yang, Zou, Ye, Zhu, Dong, Bi, "A Modified Group Contribution Scheme to
  Predict Homopolymer Glass Transition Temperatures", ACS Omega 5 (2020) 19655,
  doi:10.1021/acsomega.0c04499 -- CC-BY 4.0 (the parameter values ARE
  redistributable, unlike the copyright Van Krevelen book table).

  THE EQUATION (paper eq 5, quoted):
      Tg(inf) = [ sum N_i * Yg_i(inf) + Nb * Ygb ] / M0
  where Yg_i(inf) is the limiting Tg contribution of group i [10^3 g.K/mol],
  N_i its occurrence number, Ygb/Nb the contribution + occurrence of backbones
  in the side chain, and M0 the repeat-unit molar mass [g/mol].  Yg(inf) is the
  "limiting molar glass-transition function"; Tg(inf) is the infinite-Mw limit
  (the Fox-Flory Tg(Mn) follows by Tg = Tg(inf) - K/Mn -- a later slice).

  IMPORTANT -- PROVISIONAL DATA (data/proposed/, NOT promoted):
  Table S3 of the SI gives each group's FW + Yg(inf), but the group IDENTITIES
  are drawn as 2D-structure IMAGES; the numeric values are transcribed
  faithfully, but the group-name <-> structure mapping needs human verification
  against the SI figures.  See data/proposed/yang2020/groups.dat.
\*---------------------------------------------------------------------------*/

#ifndef Choupo_Yang2020_H
#define Choupo_Yang2020_H

#include "ConstantEstimator.H"

namespace Choupo {

class Yang2020 : public ConstantEstimator
{
public:
    std::string method() const override
    {
        return "Yang 2020 modified group contribution (Tg-infinity); "
               "ACS Omega 5 (2020) 19655, CC-BY";
    }
    InputKind inputKind() const override { return InputKind::PolymerGroups; }

    PolymerEstimate estimatePolymer(const std::vector<GroupSpec>& groups,
                                    double k,
                                    bool& ok, std::string& error) const override;

    std::vector<std::string> knownGroups() const override;
};

} // namespace Choupo

#endif
