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
    Choupo::NRTL

Description
    Non-Random Two-Liquid activity-coefficient model (Renon & Prausnitz,
    1968).  For each ordered pair (i,j):

        τ_ij = a_ij + b_ij / T          τ_ii = 0
        G_ij = exp( -α_ij τ_ij )        G_ii = 1     α_ii = 0

    The activity coefficient of component i in a mixture of composition x is:

        ln γ_i = Σ_j τ_ji G_ji x_j / Σ_k G_ki x_k
               + Σ_j [ x_j G_ij / Σ_k G_kj x_k ]
                   ·{ τ_ij - Σ_k τ_kj G_kj x_k / Σ_l G_lj x_l }

    The non-randomness parameter α is symmetric (α_ij = α_ji).
    Typical α values: 0.20–0.47.

Dictionary form:

        activityModel
        {
            model       NRTL;
            pairs
            (
                {
                    i         ethanol;     // component name in thermoPackage
                    j         water;
                    a_ij     -0.8009;      // τ_ij = a_ij + b_ij / T
                    b_ij      246.18;      // [K]
                    a_ji      3.4578;
                    b_ji     -586.0809;
                    alpha     0.30;
                }
                //... more pairs for >2 components
            );
        }

\*---------------------------------------------------------------------------*/

#pragma once

#include "ActivityModel.H"
#include "thermo/ThermoPackage.H"

#include <vector>

namespace Choupo {

class NRTL : public ActivityModel
{
public:
    // The model needs the component-name -> index map from the thermo
    // package so it can resolve `i` and `j` words in the dictionary.
    NRTL(const DictPtr& dict, const std::vector<std::string>& componentNames);

    std::size_t n() const override { return n_; }
    sVector gamma(scalar T_K, const sVector& x) const override;

    const std::string& modelName() const override { return name_; }

private:
    std::size_t n_;
    // active-set mask (empty/all-true = no domain declared)
    std::vector<bool> activeMask_;
    inline static const std::string name_ = "NRTL";

    // Pair parameter matrices (n × n), row-major.
    bool calFitAll_ = true;      // AND over pairs: measured-H_E refit flag
    std::vector<scalar> aMat_;   // a_ij
    std::vector<scalar> bMat_;   // b_ij  [K]
    std::vector<scalar> alphaMat_;

    // Helper indexing
    scalar a    (std::size_t i, std::size_t j) const { return aMat_    [i*n_ + j]; }
    scalar b    (std::size_t i, std::size_t j) const { return bMat_    [i*n_ + j]; }
    scalar alpha(std::size_t i, std::size_t j) const { return alphaMat_[i*n_ + j]; }

public:
    // True only when every resolved pair carries `calorimetricFit true;`
    // (ideal-defaulted pairs count as unfitted).  Gates excessEnthalpy.
    bool calorimetricFit() const override { return calFitAll_; }

private:
};

} // namespace Choupo
