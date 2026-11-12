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
    Choupo::SedimentingCentrifuge

Description
    A SEDIMENTING CENTRIFUGE BY SIGMA THEORY, SPLITTING ON THE CASE'S SIZE
    GRID (DEV.md 4c C361 slice 4; docs/design/c361-solids-processing.md 8).

    STOKES SETTLING in the centrifugal field (Ambler 1959 eqs. 1-5;
    Geankoplis 5th ed. eq. 30.2-8, p. 1435): a particle of size d moves out
    at dr/dt = d^2 (rho_s - rho_l) omega^2 r / (18 mu), mu and rho_l the
    package's liquid viscosity and density, rho_s the solids' rho_p.

    SIGMA, the area of a gravity settler that does the same work, Q_50 = 2
    v_g Sigma, v_g = d^2 (rho_s - rho_l) g / (18 mu):

      tubularBowl  Sigma = omega^2 V / (g ln(2 r_2^2 / (r_1^2 + r_2^2))),
                   V = pi b (r_2^2 - r_1^2)  (Ambler eqs. 24-28, p. 191, the 50 %
                   cut where equal VOLUMES lie inside and outside the
                   starting radius; de Haan, Eral & Schuur 2nd ed. eqs. 9.44-9.46,
                   p. 309).  Geankoplis eq. 30.2-19 (p. 1439) defines the
                   cut instead by the particle starting HALFWAY through the
                   layer, Sigma_G = omega^2 V / (2 g ln(2 r_2/(r_1 + r_2))),
                   and is printed beside it with its cut size D_pc (eq.
                   30.2-12): the two books' cut sizes are two points of the
                   same grade curve.
      discStack    Sigma = 2 pi n omega^2 (r_2^3 - r_1^3) / (3 g tan theta)
                   (de Haan et al. eq. 9.52, p. 311; Ambler eq. 46, p. 194, with his
                   flow factor C = 1).

    THE GRADE EFFICIENCY per class (the fraction of each size reaching the
    wall), at the class's representative size, on the classifier core of
    slice 3 -- no second splitter:

      tubularBowl  plug flow, feed spread uniformly over the annulus (the
                   premises of Ambler eq. 26 and de Haan eq. 9.44): a
                   particle starting at r is captured when ln(r_2/r) <= k(d)
                   = d^2 (rho_s - rho_l) omega^2 tau / (18 mu), tau = V/Q
                   (Geankoplis eq. 30.2-10 integrated from r), so
                   E(d) = (r_2^2 - r*^2) / (r_2^2 - r_1^2),
                   r* = max(r_1, r_2 e^-k).  E(d_50) = 1/2 exactly.
      discStack    the plug-flow gap (Ambler eqs. 40-44, pp. 193-194, with f(y) = 1, the
                   case in which his C is unity): the drift across the gap
                   grows with v_g, so E(d) = min(1, (d/d_50)^2 / 2).

    These two curves are DERIVED here from the trajectories the sources
    print; neither source prints E(d) as an equation (design record 8.4).

    STOKES' WINDOW, enforced: the particle Reynolds number at the cut size,
    with the settling velocity at the bowl wall (Geankoplis eq. 30.2-13),
    Re = d v rho_l / mu, must be below 1 -- the Stokes' law region
    (Geankoplis section 30.1B, p. 1413).

    THE STREAMS: the sediment receives a_k f_k m_s of each class
    (`sedimentSolids`, the solids mass fraction of the discharged sediment,
    DECLARED, sets the liquid it carries); the centrate is the difference.
    One solid population (design record 2.3).  No work, no heat: the
    products leave at the feed's T and P (the drive power is not computed).

    REFUSED, by name: a feed not on the grid, dry, or vapour-bearing; a
    solid not denser than the liquid; a geometry with r_1 >= r_2 or a disc
    angle outside (0, 90) degrees; Re >= 1 at the cut size; a sediment that
    would need more liquid than the feed brings.

    Inputs ( feed );   outputs ( sediment centrate );
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class SedimentingCentrifuge : public UnitOperation
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
    std::string                   type_ = "sedimentingCentrifuge";
    std::vector<ProcessStream>    produced_;
    std::map<std::string, scalar> kpis_;
    std::optional<UnitProfile>    profile_;
};

} // namespace Choupo
