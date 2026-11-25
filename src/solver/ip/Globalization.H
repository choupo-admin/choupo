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
    Globalization.H

Description
    The FILTER: the globalization STRATEGY of Algorithm A, the rule that decides
    whether a trial point is better than where the run stands
    (docs/design/interior-point.md sec. 2.5; Theory Guide sec:ip-filter).
    The mechanism that tries the points (backtracking) is LineSearch.H.

    Two measures: the infeasibility theta(x) = ||c(x)||_1 and the barrier
    objective phi_mu(x).  A trial point is acceptable when it is not
    DOMINATED by an earlier point kept in the filter F (a set of corners
    (theta_F, phi_F); the point is dominated when theta >= theta_F and
    phi >= phi_F for a corner) and it improves the current point enough:

      switching     (19)  grad phi^T dx < 0  and  alpha (-grad phi^T dx)^s_phi > delta theta^s_theta
      Armijo        (20)  phi(x+) <= phi(x) + eta_phi alpha grad phi^T dx
      margins       (18)  theta(x+) <= (1 - gamma_theta) theta(x)   or
                          phi(x+)   <= phi(x) - gamma_phi theta(x)
      smallest step (23)  alpha_min

    When (19) holds and theta(x) <= theta_min the trial must pass Armijo (20):
    the step is a "phi-type" step and the filter is NOT enlarged.  Otherwise
    the trial must pass (18), and the filter gains the corner (22)
        ( (1 - gamma_theta) theta(x),  phi_mu(x) - gamma_phi theta(x) ).
    PRINTED DETAIL OF THE SOURCE: in the preprint's (22) the second
    coordinate of the corner reads f(x_k) - gamma_phi theta(x_k); the
    sentence around it and the margins (18b) use the barrier objective phi_mu,
    and phi_mu is what is coded here (design record sec. 1; one source reading
    cannot confirm the journal's printing, and the filter compares phi_mu
    values, so f in the corner would compare unlike quantities).  The merit
    function alternative (L1 (39)-(40)) is slice A4, not this file.

    The filter starts as { theta >= theta_max } (L1 (21)) and is reset to
    that at each new value of mu.
\*---------------------------------------------------------------------------*/

#pragma once

#include "solver/ip/IPParameters.H"

#include <cstddef>
#include <utility>
#include <vector>

namespace Choupo::solver
{

class FilterGlobalization
{
public:
    explicit FilterGlobalization(const IPParameters& p) : p_(p) {}

    enum class Verdict { Reject, AcceptPhi, AcceptTheta };

    //- F = { theta >= theta_max } (L1 (21)): drop every corner, set theta_max.
    void reset(scalar thetaMax);

    //- True when (theta, phi) is dominated by a corner of F or has theta >= theta_max.
    bool inFilter(scalar theta, scalar phi) const;

    //- The corner (22) for the current point (theta_k, phi_mu(x_k)).
    void augment(scalar theta, scalar phi);

    std::size_t size() const { return corners_.size(); }

    //- The state of the current point the trial is judged against.
    struct Current
    {
        scalar theta;       //- theta(x_k)
        scalar phi;         //- phi_mu(x_k)
        scalar gradPhiDx;   //- grad phi_mu(x_k)^T dx
        scalar thetaMin;    //- theta_min = 1e-4 max(1, theta(x0))
    };

    //- L1 (19).
    bool switching(const Current& k, scalar alpha) const;

    //- L1 (23): below this step length the line search gives up.
    scalar minimumStep(const Current& k) const;

    //- The whole acceptance test of Algorithm A step A-5.3 / A-5.4 for the
    //  trial (theta+, phi+) at step length alpha.
    Verdict test(const Current& k, scalar alpha, scalar thetaTrial, scalar phiTrial) const;

private:
    const IPParameters& p_;
    scalar thetaMax_ = 0.0;
    std::vector<std::pair<scalar, scalar>> corners_;   //- (theta_F, phi_F)
};

} // namespace Choupo::solver
