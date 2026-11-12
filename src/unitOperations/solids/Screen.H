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
    Choupo::Screen

Description
    A VIBRATING SCREEN ON THE CASE'S SIZE GRID (DEV.md 4c C361 slice 3).
    `model` selects how the partition is obtained:

      karra      Karra (1979) as given by King (2001), section 4.2.1-4.2.2,
                 eqs. 4.30-4.48, pp. 87-90: the effective throughfall
                 aperture h_T = (h + d_w) cos(theta) - d_w (4.31); the basic
                 capacity A (4.32-4.33) times the oversize, half-size, deck,
                 wet-screening and bulk-density factors B, C, D, E, F
                 (4.36-4.39) and the near-size factor G_c (4.40); the loading
                 K = W^F P^F(h_T)/area / (A B C D E F) (4.42); the cut size
                 d50 = h_T G_c / K^0.148 (4.43); and the partition
                 c(d) = 1 - exp(-0.693 (d/d50)^5.9) (4.41), all as printed.
                 It publishes the area utilisation factor AUF (4.48): above
                 1 the screen is overloaded.  No parameter is fitted (King
                 p. 90), so nothing material-specific is asked for.
      declared   the partition is the case's: `partition {}` (a curve
                 object) and `bypass` (fines misplaced to the oversize).

    ONE SOLID POPULATION (docs/design/c361-solids-processing.md 2.3, still
    DEFERRED): every solid component of the feed is classified in the same
    proportion, because one size distribution describes them all.  A
    two-mineral feed is split as one material; a per-species distribution,
    and with it a split that tells minerals apart, is not built.

    MASS: coarse_k = a_k f_k m_s and fine_k = f_k m_s - coarse_k, class by
    class (King 2001 eqs. 4.20-4.29), so the products close on the feed
    exactly; the closure is printed.  The fluid splits by one fraction.
    ENERGY: no work, no heat; both products leave at the feed's T and P.

    REFUSED, by name: an aperture outside the case's size grid; a feed not on
    the grid; h_T <= 0 (a wire thicker than its projected opening); an
    effective aperture below the basic-capacity correlation's own zero
    (12.13 h_T^0.32 - 10.3 <= 0, h_T below about 0.6 mm); a fluid-bearing
    feed without `fluidToOversize`.

    Operation (karra):
        aperture h;  wireDiameter d_w;  inclination theta (deg);  area;
        deck S (1 = top);  wetScreening yes|no;  bulkDensity rho_B;
        openArea (fraction, optional: A scaled by it over OA, eq. 4.35);
        fluidToOversize (only with a fluid)
    Operation (declared):
        partition { ... };  bypass;  aperture (optional, checked);
        fluidToOversize (only with a fluid)

    Inputs ( feed );   outputs ( oversize undersize );
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class Screen : public UnitOperation
{
public:
    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream>    producedStreams() const override { return produced_; }
    std::map<std::string, scalar> kpis()            const override { return kpis_; }
    std::optional<UnitProfile>    profile()         const override { return profile_; }

private:
    std::string                   type_ = "screen";
    std::vector<ProcessStream>    produced_;
    std::map<std::string, scalar> kpis_;
    std::optional<UnitProfile>    profile_;
};

} // namespace Choupo
