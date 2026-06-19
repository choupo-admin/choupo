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
    Choupo::UNIFAC

Description
    UNIFAC (original) PREDICTIVE activity-coefficient model: gamma_i(T, x) from
    the molecular GROUP decomposition of each component -- NO fitted binary
    parameters.  The headline glass-box win: predict a binary's VLE (even the
    ethanol-water azeotrope) from structure alone, then SEE the error vs data
    (run it through the validation weapon).

    gamma_i = gamma_i^C (combinatorial, Staverman-Guggenheim) * gamma_i^R
    (residual, group-contribution).  Reference: Fredenslund, Jones & Prausnitz,
    AIChE J. 21 (1975) 1086; Poling, Prausnitz & O'Connell, 5th ed., Sec. 8-10.

    The author declares each component's groups in the activityModel block (the
    model receives only the names + this dict, not the Component objects):

        activityModel
        {
            model  UNIFAC;
            groups
            {
                ethanol ( { group CH3; count 1; } { group CH2; count 1; } { group OH; count 1; } );
                water   ( { group H2O; count 1; } );
            }
        }

    R_k/Q_k and the main-group a_mn matrix load from data/standards/unifac/
    (via Database::currentRoot(), the same channel NRTL uses for binaryPairs).
    A component missing from `groups` -> the model falls back to gamma=1 for it
    and logs the gap (no silent crutch).
\*---------------------------------------------------------------------------*/

#pragma once

#include "ActivityModel.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class UNIFAC : public ActivityModel
{
public:
    UNIFAC(const DictPtr& dict, const std::vector<std::string>& componentNames);

    std::size_t n() const override { return names_.size(); }
    sVector gamma(scalar T_K, const sVector& x) const override;
    const std::string& modelName() const override { return name_; }

private:
    // residual ln(Gamma_k) for a group-composition X (subgroup mole fractions,
    // parallel to subgroupList_) at temperature T.
    std::vector<double> lnGammaGroups(const std::vector<double>& X, scalar T) const;

    std::string name_;
    std::vector<std::string> names_;

    // active subgroups (sorted, deterministic) + their parameters
    std::vector<std::string> subgroupList_;
    std::map<std::string, std::size_t> sgIndex_;     // subgroup -> position in subgroupList_
    std::vector<double> Rk_, Qk_;                    // per subgroup
    std::vector<std::string> mainOf_;                // per subgroup -> main group key

    // main-group interaction a_mn [K]; absent pair -> 0
    std::map<std::pair<std::string,std::string>, double> a_;

    // per component: subgroup counts (parallel to subgroupList_), and r,q,l
    std::vector<std::vector<int>> nu_;
    std::vector<double> r_, q_, l_;
    std::vector<bool> hasGroups_;                    // component declared -> true

    // pure-component residual ln(Gamma_k^(i)) is T-dependent; cache the pure
    // group-composition X^(i) (T-independent) and recompute at gamma() time.
    std::vector<std::vector<double>> Xpure_;
};

class Component;  // fwd

// Inject each component's INTRINSIC UNIFAC group decomposition
// (Component::groupsFor("unifac")) into an activityModel `groups {}` block for any
// component not already declared inline -- so the decomposition lives ONCE in the
// component .dat (its true home, alongside joback), never re-declared per case.
// No-op unless the dict's model is UNIFAC.  Inline declarations always win.  Must
// be called before ActivityModel::New, at a site that has the Component objects
// (so case-local component overlays are respected).
void injectUnifacGroups(const DictPtr& activityDict,
                        const std::vector<std::string>& names,
                        const std::vector<Component>& comps);

} // namespace Choupo
