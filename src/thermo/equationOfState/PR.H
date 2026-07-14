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
    Choupo::PR

Description
    Peng-Robinson (1976) cubic equation of state, vapour root --- the sibling
    of Choupo::SRK.  Generalised cubic with ε = 1 − √2, σ = 1 + √2:

        P = R·T / (v − b) − a(T) / [ (v + ε·b)(v + σ·b) ]

    Pure-component parameters:

        a_c,i = 0.45724 · R² · Tc_i² / Pc_i
        b_i   = 0.07780 · R · Tc_i  / Pc_i
        α_i(T) = [ 1 + κ_i · (1 − √(T/Tc_i)) ]²
        κ_i    = 0.37464 + 1.54226·ω_i − 0.26992·ω_i²      (PR76)
        a_i(T) = a_c,i · α_i(T)

    Van der Waals one-fluid mixing rule (same as SRK):

        a_mix(T)  = ΣΣ y_i y_j · (1 − k_ij) · √(a_i(T) · a_j(T))
        b_mix     = Σ y_i b_i

    Dimensionless A = a_mix·P/(R·T)², B = b_mix·P/(R·T).  The cubic in Z:

        Z³ − (1 − B) Z² + (A − 2B − 3B²) Z − (A·B − B² − B³) = 0

    is solved by Cardano (analytic); the largest real root above B is the
    vapour root.

    Fugacity coefficient of component i (vapour root):

        ln φ_i = (b_i/b_mix)·(Z − 1) − ln(Z − B)
               − A/(2√2·B) · [ 2·(Σ_j y_j(1−k_ij)√(a_i a_j))/a_mix − b_i/b_mix ]
                 · ln[ (Z + (1+√2)B) / (Z + (1−√2)B) ]

    Departure functions at the vapour root (Sandler, generalised cubic):

        H^R = R·T·(Z − 1)
            + (T·da_mix/dT − a_mix) / (2√2·b_mix)
              · ln[ (Z + (1+√2)B) / (Z + (1−√2)B) ]

        S^R = R · ln(Z − B)
            + (da_mix/dT) / (2√2·b_mix)
              · ln[ (Z + (1+√2)B) / (Z + (1−√2)B) ]

    Note: the PR76 κ-correlation above is used for all ω; the PR78 high-ω
    refinement (ω > 0.49) is not applied.  Dictionary form mirrors SRK:

        equationOfState
        {
            model           PR;
            binaryInteractions ( { i CO2; j CH4; kij 0.0919; } );   // optional
        }
\*---------------------------------------------------------------------------*/

#pragma once

#include "EquationOfState.H"
#include "core/Constants.H"
#include "thermo/Component.H"

#include <string>
#include <vector>

namespace Choupo {

class PR : public EquationOfState
{
public:
    PR(const std::vector<Component>& comps,
       const std::vector<std::vector<scalar>>& kij);

    std::size_t n() const override { return n_; }

    sVector phi(scalar T_K, scalar P_Pa, const sVector& y) const override;
    sVector phiLiquid(scalar T_K, scalar P_Pa, const sVector& y) const override;
    scalar  molarVolume(scalar T_K, scalar P_Pa, const sVector& y) const override;
    scalar  Z(scalar T_K, scalar P_Pa, const sVector& y) const override;

    scalar  H_residual(scalar T_K, scalar P_Pa, const sVector& y) const override;
    scalar  S_residual(scalar T_K, scalar P_Pa, const sVector& y) const override;

    const std::string& modelName() const override { return name_; }

    // Cubic EoS: needs the critical constants + acentric factor per component.
    std::vector<std::string> requiredComponentProperties() const override
    {
        return { "Tc", "Pc", "omega" };
    }

    static std::unique_ptr<EquationOfState>
    fromDict(const DictPtr& eosDict, const std::vector<Component>& comps);

private:
    struct PureParams
    {
        scalar a_c;          // 0.45724 R² Tc² / Pc   [Pa·m^6/mol²]
        scalar b;            // 0.07780 R Tc / Pc      [m³/mol]
        scalar kappa;        // PR76 κ(ω)
        scalar Tc;           // [K]
    };

    void buildAi(scalar T,
                 std::vector<scalar>& a,
                 std::vector<scalar>& dadT) const;

    void buildMix(scalar T, const sVector& y,
                  scalar& a_mix, scalar& dadT_mix, scalar& b_mix,
                  std::vector<scalar>* a_per_comp_out = nullptr,
                  std::vector<std::vector<scalar>>* aij_out = nullptr) const;

    // Real vapour root of the PR cubic; Cardano with branch selection.
    scalar cardano_root(scalar A, scalar B, bool liquid) const;

    std::size_t                            n_;
    std::vector<PureParams>                pure_;
    std::vector<std::vector<scalar>>       kij_;
    inline static const std::string        name_ = "PR";
};

} // namespace Choupo
