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
    Choupo::UNIQUAC

Description
    UNIQUAC (UNIversal QUAsi-Chemical) activity-coefficient model
    (Abrams & Prausnitz, AIChE J. 21 (1975) 116).  Completes the
    NRTL / Wilson / UNIFAC / UNIQUAC quartet.

    gamma_i = gamma_i^C (combinatorial) * gamma_i^R (residual):

        ln gamma_i^C = ln(phi_i/x_i) + (z/2) q_i ln(theta_i/phi_i)
                       + l_i - (phi_i/x_i) Sum_j x_j l_j
        ln gamma_i^R = q_i [ 1 - ln( Sum_j theta_j tau_ji )
                              - Sum_j ( theta_j tau_ij / Sum_k theta_k tau_kj ) ]

    with  l_i = (z/2)(r_i - q_i) - (r_i - 1),  z = 10 (lattice coordination),
          phi_i   = r_i x_i / Sum_j r_j x_j       (segment fraction)
          theta_i = q_i x_i / Sum_j q_j x_j       (area fraction)
          tau_ij  = exp( -a_ij / T )              (a_ij = (u_ij - u_jj)/R [K])

    Pure-component r_i (volume) and q_i (surface area) are STRUCTURAL.  This
    glass-box engine takes them per component from the activityModel block
    (literature van der Waals values the student cites), e.g.

        activityModel
        {
            model  UNIQUAC;
            rq
            {
                ethanol { r 2.1055; q 1.9720; }
                water   { r 0.9200; q 1.4000; }
            }
            // Binary tau parameters: inline pairs OR a UNIQUAC pair catalogue
            // (data/standards/parameters/UNIQUAC/<a>-<b>.dat), mirroring NRTL.
            pairs
            (
                { i ethanol; j water; a_ij -2.4936; a_ji 756.9477; }
                // a_ij in KELVIN; tau_ij = exp(-A_ij(T)/T).  Full T-dependence
                // A_ij(T) = a_ij + b_ij*T + c_ij*T^2 via the optional b_ij [-]
                // and c_ij [1/K] (most sets use a only; T-correlated LLE sets
                // such as Winkelman et al. FPE 284 (2009) need b and c).
            );
        }

    A pair absent everywhere defaults to IDEAL (a_ij = a_ji = 0 -> tau = 1) and
    is ANNOUNCED (no silent crutch), exactly like NRTL.

\*---------------------------------------------------------------------------*/

#pragma once

#include "ActivityModel.H"
#include "thermo/ThermoPackage.H"

#include <vector>

namespace Choupo {

class UNIQUAC : public ActivityModel
{
public:
    UNIQUAC(const DictPtr& dict, const std::vector<std::string>& componentNames);

    std::size_t n() const override { return n_; }
    sVector gamma(scalar T_K, const sVector& x) const override;

    const std::string& modelName() const override { return name_; }

private:
    std::size_t n_;
    inline static const std::string name_ = "UNIQUAC";
    static constexpr scalar z_coord_ = 10.0;   // lattice coordination number

    std::vector<scalar> r_;       // pure-component volume parameters
    std::vector<scalar> q_;       // pure-component surface-area parameters

    // tau_ij = exp( -A_ij(T) / T ),  A_ij(T) = aMat_ij + bMat_ij*T + cMat_ij*T^2.
    //   a_ij [K], b_ij [-], c_ij [1/K].  The quadratic c-term carries the
    //   T-dependence of T-correlated sets such as Winkelman et al. (2009).
    std::vector<scalar> aMat_;    // a_ij [K]
    std::vector<scalar> bMat_;    // b_ij [-]
    std::vector<scalar> cMat_;    // c_ij [1/K]

    scalar a(std::size_t i, std::size_t j) const { return aMat_[i*n_ + j]; }
    scalar b(std::size_t i, std::size_t j) const { return bMat_[i*n_ + j]; }
    scalar c(std::size_t i, std::size_t j) const { return cMat_[i*n_ + j]; }
};

// Fill the UNIQUAC `rq {}` block from each component's intrinsic `uniquac { r; q; }`
// (Component::rUniquac/qUniquac) for any component not declared inline -- so the
// van der Waals r, q live ONCE in the component .dat, never re-declared per case.
// No-op unless the dict's model is UNIQUAC.  Inline `rq{}` entries always win.
// Call before ActivityModel::New, at a site that has the Component objects.
void injectUniquacRQ(const DictPtr& activityDict,
                     const std::vector<std::string>& names,
                     const std::vector<Component>& comps);

} // namespace Choupo
