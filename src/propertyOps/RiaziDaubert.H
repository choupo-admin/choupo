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
  RiaziDaubert — the Riazi & Daubert (1987) two-parameter correlations for the
  pseudo-component constants of a PETROLEUM CUT, from the easily-measured
  characterisation pair (normal boiling point Tb, specific gravity SG):

      theta = a * Tb^b * SG^c            (Tb in degrees Rankine)

  with theta = { MW, Tc, Pc, Vc, ... } and the (a,b,c) tabulated per property.
  omega is then backed out by Lee-Kesler from (Tb, Tc, Pc), exactly as the
  Joback path does.

  This is the SCALAR-input sibling of Joback in the ConstantEstimator family.
  A petroleum cut is a LUMP of hundreds of species with no single molecular
  structure, so it has NO group decomposition -- the estimate is anchored on
  bulk measurements (Tb, SG), not groups.

  Primary source (cite this, not an aggregator):
    M. R. Riazi & T. E. Daubert, "Characterization parameters for petroleum
    fractions", Ind. Eng. Chem. Res. 26 (1987) 755-759.
    (See also M. R. Riazi, "Characterization and Properties of Petroleum
    Fractions", ASTM MNL50, 2005, Ch. 2 -- the consolidated correlation set.)
\*---------------------------------------------------------------------------*/

#ifndef Choupo_RiaziDaubert_H
#define Choupo_RiaziDaubert_H

#include "ConstantEstimator.H"

namespace Choupo {

class RiaziDaubert : public ConstantEstimator
{
public:
    std::string method() const override
    {
        return "Riazi-Daubert petroleum correlations (Riazi & Daubert 1987)";
    }
    InputKind inputKind() const override { return InputKind::Scalars; }

    ConstantEstimate estimateFromScalars(
        const std::map<std::string, double>& anchors,
        bool& ok, std::string& error) const override;

    std::vector<std::string> knownAnchors() const override
    {
        return { "Tb", "SG" };
    }
};

} // namespace Choupo

#endif
