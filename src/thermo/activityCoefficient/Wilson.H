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
    Choupo::Wilson

Description
    Wilson (1964) activity-coefficient model:

        Λ_ij = (V_j / V_i ) · exp( - A_ij / (R T ) )         Λ_ii = 1

        ln γ_i = 1 - ln( Σ_j x_j Λ_ij )
               - Σ_k  (x_k Λ_ki ) / ( Σ_j x_j Λ_kj )

    where V_i are pure-component liquid molar volumes and
    A_ij = λ_ij − λ_ii are the (non-symmetric) energy parameters in J/mol.

    Limitations:
        - Cannot represent liquid–liquid phase splitting (use NRTL/UNIQUAC).
        - Two adjustable parameters per pair (A_ij, A_ji), no third
          'non-randomness' factor.

Dictionary form:

        activityModel
        {
            model       Wilson;
            pairs
            (
                {
                    i          ethanol;
                    j          water;
                    A_ij       1157.95;     // J/mol  (= λ_ij - λ_ii)
                    A_ji       4081.65;     // J/mol  (= λ_ji - λ_jj)
                }
            );
        }
\*---------------------------------------------------------------------------*/

#pragma once

#include "ActivityModel.H"
#include "thermo/Component.H"

#include <vector>

namespace Choupo {

class Wilson : public ActivityModel
{
public:
    // Takes the resolved components: the name map (to resolve `i`,`j`) AND the
    // pure-component liquid molar volumes (m³/mol) come from them, set in the
    // constructor -- no post-construction setMolarVolumes dance.
    Wilson(const DictPtr& dict, const std::vector<Component>& comps);

    std::size_t n() const override { return n_; }
    sVector gamma(scalar T_K, const sVector& x) const override;

    const std::string& modelName() const override { return name_; }

private:
    std::size_t n_;
    inline static const std::string name_ = "Wilson";

    // Energy parameter matrix A_ij  [J/mol].  A_ii = 0.
    std::vector<scalar> Amat_;
    // HYBRID (mirrors NRTL): a pair with no parameters anywhere is treated as
    // IDEAL for that binary -- Λ_ij = Λ_ji = 1 (NOT A=0, which leaves the
    // V_j/V_i ratio) -- so the foundation builds pair-by-pair instead of
    // aborting.  Announced, never silent.  true => that off-diagonal is ideal.
    std::vector<bool> idealPair_;
    // Pure-component liquid molar volumes [m³/mol]
    sVector V_;
};

} // namespace Choupo
