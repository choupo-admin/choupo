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
    Choupo::UNIFACDortmund

Description
    Modified UNIFAC (Dortmund), selected with `model UNIFACDortmund;`.  It is a
    SECOND predictive group-contribution model beside the original UNIFAC (the
    original is untouched); the three differences are exactly the printed ones:

      1. the combinatorial part with the r_i^(3/4) exponent
         (Weidlich & Gmehling 1987 eq 5; Gmehling, Li & Schiller 1993 eq 2-3);
      2. temperature-dependent group interactions
         Psi_nm = exp(-(a_nm + b_nm T + c_nm T^2)/T)
         (Weidlich & Gmehling 1987 eq 7; Gmehling et al. 1993 eq 10);
      3. different R_k, Q_k (1993 Table III), with the alcohol OH split into
         primary, secondary and tertiary subgroups and cyclic CH2/CH/C and
         cyclic-ether groups.

    The parameters are ONLY those printed in Gmehling, Li & Schiller, Ind. Eng.
    Chem. Res. 32 (1993) 178 (Table III: R_k, Q_k; Table IV: a, b, c), read
    from data/standards/parameters/UNIFACDortmund/.  The later licensed
    Dortmund revisions are not entered.  A main-group pair the paper does not
    print is REFUSED by name (never read from another table, never taken as
    athermal); a component with no `groups { unifacDortmund (...) }` block is
    REFUSED by name.  Equations as implemented: docs/theory-guide (label
    sec:unifac-dortmund).
\*---------------------------------------------------------------------------*/

#pragma once

#include "ActivityModel.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class UNIFACDortmund : public ActivityModel
{
public:
    UNIFACDortmund(const DictPtr& dict, const std::vector<std::string>& componentNames);

    std::size_t n() const override { return names_.size(); }
    sVector gamma(scalar T_K, const sVector& x) const override;
    const std::string& modelName() const override { return name_; }

private:
    // ln Gamma_k for a group composition X at the temperature whose Psi
    // matrix (row-major G x G) is `psi`.
    std::vector<double> lnGammaGroups(const std::vector<double>& X,
                                      const std::vector<double>& psi) const;

    // Psi(m,k) = exp(-(a + b T + c T^2)/T), built once per gamma() call.
    std::vector<double> psiMatrix(scalar T) const;

    std::string name_;
    std::vector<std::string> names_;

    std::vector<std::string> subgroupList_;          // sorted, deterministic
    std::vector<double> Rk_, Qk_;
    std::vector<int> mainOf_;                        // main-group number

    // a, b, c per SUBGROUP pair (row m, column k), dense G x G, built at
    // construction; the hot path never touches a map.
    std::vector<double> aSub_, bSub_, cSub_;

    std::vector<std::vector<int>> nu_;               // nu_[i][k]
    std::vector<double> r_, q_, r34_;                // r_i, q_i, r_i^(3/4)
    std::vector<std::vector<double>> Xpure_;
};

} // namespace Choupo
