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
File
    Globalization.cpp

Description
    The filter and the acceptance tests of Algorithm A (L1 (18)-(23)).  See
    Globalization.H.
\*---------------------------------------------------------------------------*/

#include "solver/ip/Globalization.H"

#include <algorithm>
#include <cmath>

namespace Choupo::solver
{

void FilterGlobalization::reset(scalar thetaMax)
{
    thetaMax_ = thetaMax;
    corners_.clear();
}

bool FilterGlobalization::inFilter(scalar theta, scalar phi) const
{
    if (!(theta < thetaMax_)) return true;                     //- the initial region theta >= theta_max
    for (const auto& c : corners_)
        if (theta >= c.first && phi >= c.second) return true;  //- dominated by a stored point
    return false;
}

void FilterGlobalization::augment(scalar theta, scalar phi)
{
    //  L1 (22), with phi_mu where the preprint prints f (see the header).
    corners_.emplace_back((1.0 - p_.gammaTheta) * theta, phi - p_.gammaPhi * theta);
}

bool FilterGlobalization::switching(const Current& k, scalar alpha) const
{
    if (!(k.gradPhiDx < 0.0)) return false;
    return alpha * std::pow(-k.gradPhiDx, p_.sPhi) > p_.delta * std::pow(k.theta, p_.sTheta);
}

scalar FilterGlobalization::minimumStep(const Current& k) const
{
    //  L1 (23).
    scalar m = p_.gammaTheta;
    if (k.gradPhiDx < 0.0)
    {
        m = std::min(m, p_.gammaPhi * k.theta / (-k.gradPhiDx));
        if (k.theta <= k.thetaMin)
            m = std::min(m, p_.delta * std::pow(k.theta, p_.sTheta) / std::pow(-k.gradPhiDx, p_.sPhi));
    }
    return p_.gammaAlpha * m;
}

FilterGlobalization::Verdict FilterGlobalization::test(const Current& k, scalar alpha,
                                                       scalar thetaTrial, scalar phiTrial) const
{
    //  Step A-5 of Algorithm A, filter check: the trial must be acceptable to the filter.
    if (inFilter(thetaTrial, phiTrial)) return Verdict::Reject;

    //  Sufficient decrease, case I: (19) holds and theta(x_k) <= theta_min -> Armijo (20).
    if (k.theta <= k.thetaMin && switching(k, alpha))
        return phiTrial <= k.phi + p_.etaPhi * alpha * k.gradPhiDx ? Verdict::AcceptPhi : Verdict::Reject;

    //  Case II: the margins (18).
    if (thetaTrial <= (1.0 - p_.gammaTheta) * k.theta || phiTrial <= k.phi - p_.gammaPhi * k.theta)
    {
        //  The filter is enlarged unless (19) and (20) both hold (L1 Algorithm A, the filter-augmentation step).
        const bool armijo = phiTrial <= k.phi + p_.etaPhi * alpha * k.gradPhiDx;
        return switching(k, alpha) && armijo ? Verdict::AcceptPhi : Verdict::AcceptTheta;
    }
    return Verdict::Reject;
}

} // namespace Choupo::solver
