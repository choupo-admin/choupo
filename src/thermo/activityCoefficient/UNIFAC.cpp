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
\*---------------------------------------------------------------------------*/

#include "UNIFAC.H"

#include "core/Dictionary.H"
#include "thermo/Component.H"
#include "thermo/Database.H"

#include <cmath>
#include <filesystem>
#include <iostream>
#include <set>
#include <stdexcept>

namespace Choupo {

namespace { const double Z = 10.0; }   // UNIFAC lattice coordination number

UNIFAC::UNIFAC(const DictPtr& dict, const std::vector<std::string>& names)
:   name_("UNIFAC"), names_(names)
{
    namespace fs = std::filesystem;
    const std::size_t N = names.size();

    // ---- load the published R_k/Q_k + a_mn tables (same channel NRTL uses) --
    const fs::path base = fs::path(Database::currentRoot()) / "standards" / "unifac";
    auto gdict = Dictionary::fromFile((base / "groups.dat").string());
    auto idict = Dictionary::fromFile((base / "interactions.dat").string());

    std::map<std::string, double> Rmap, Qmap;
    std::map<std::string, std::string> mainMap;
    for (const auto& sg : gdict->lookupDictList("subgroups"))
    {
        const std::string nm = sg->lookupWord("name");
        Rmap[nm]    = sg->lookupScalar("R");
        Qmap[nm]    = sg->lookupScalar("Q");
        mainMap[nm] = sg->lookupWord("mainGroup");
    }
    for (const auto& it : idict->lookupDictList("interactions"))
        a_[{ it->lookupWord("i"), it->lookupWord("j") }] = it->lookupScalar("a");

    // ---- per-component group decomposition (from the activityModel dict) ----
    DictPtr gblk = dict->found("groups") ? dict->subDict("groups") : nullptr;
    std::vector<std::map<std::string, int>> compGroups(N);
    std::set<std::string> used;
    hasGroups_.assign(N, false);
    for (std::size_t i = 0; i < N; ++i)
    {
        if (gblk && gblk->found(names[i]))
        {
            for (const auto& g : gblk->lookupDictList(names[i]))
            {
                const std::string gn = g->lookupWord("group");
                const int c = static_cast<int>(g->lookupScalarOrDefault("count", 1.0));
                compGroups[i][gn] += c;
                used.insert(gn);
                hasGroups_[i] = true;
            }
        }
        else
            // No silent crutch: announce the gap; this component gets gamma = 1.
            std::cerr << "[UNIFAC] component '" << names[i]
                      << "' has no groups declared in activityModel.groups -> "
                         "gamma = 1 for it (treated as ideal).\n";
    }

    // ---- active subgroup list (sorted -> deterministic) + parameters --------
    for (const auto& s : used)
    {
        if (!Rmap.count(s))
            throw std::runtime_error("UNIFAC: subgroup '" + s +
                "' is not in data/standards/unifac/groups.dat -- add it (with a"
                " cited R_k/Q_k) or fix the group name in activityModel.groups.");
        sgIndex_[s] = subgroupList_.size();
        subgroupList_.push_back(s);
        Rk_.push_back(Rmap[s]);
        Qk_.push_back(Qmap[s]);
        mainOf_.push_back(mainMap[s]);
    }
    const std::size_t G = subgroupList_.size();

    // ---- nu_, r_i, q_i, l_i, pure group composition X^(i) -------------------
    nu_.assign(N, std::vector<int>(G, 0));
    r_.assign(N, 0.0); q_.assign(N, 0.0); l_.assign(N, 0.0);
    Xpure_.assign(N, std::vector<double>(G, 0.0));
    for (std::size_t i = 0; i < N; ++i)
    {
        double tot = 0.0;
        for (const auto& kv : compGroups[i])
        { const std::size_t k = sgIndex_[kv.first]; nu_[i][k] = kv.second; tot += kv.second; }
        for (std::size_t k = 0; k < G; ++k)
        {
            r_[i] += nu_[i][k] * Rk_[k];
            q_[i] += nu_[i][k] * Qk_[k];
            if (tot > 0.0) Xpure_[i][k] = nu_[i][k] / tot;
        }
        l_[i] = (Z / 2.0) * (r_[i] - q_[i]) - (r_[i] - 1.0);
    }
}

std::vector<double> UNIFAC::lnGammaGroups(const std::vector<double>& X, scalar T) const
{
    const std::size_t G = subgroupList_.size();
    auto Psi = [&](std::size_t m, std::size_t k) -> double
    {
        if (mainOf_[m] == mainOf_[k]) return 1.0;                 // a = 0
        auto it = a_.find({ mainOf_[m], mainOf_[k] });
        const double a = (it != a_.end()) ? it->second : 0.0;    // absent pair -> 0
        return std::exp(-a / T);
    };

    double qsum = 0.0;
    for (std::size_t m = 0; m < G; ++m) qsum += Qk_[m] * X[m];
    std::vector<double> theta(G, 0.0);
    for (std::size_t m = 0; m < G; ++m) theta[m] = (qsum > 0.0) ? Qk_[m] * X[m] / qsum : 0.0;

    std::vector<double> ln(G, 0.0);
    for (std::size_t k = 0; k < G; ++k)
    {
        double s1 = 0.0;
        for (std::size_t m = 0; m < G; ++m) s1 += theta[m] * Psi(m, k);
        double s2 = 0.0;
        for (std::size_t m = 0; m < G; ++m)
        {
            double den = 0.0;
            for (std::size_t nn = 0; nn < G; ++nn) den += theta[nn] * Psi(nn, m);
            if (den > 0.0) s2 += theta[m] * Psi(k, m) / den;
        }
        ln[k] = (s1 > 0.0) ? Qk_[k] * (1.0 - std::log(s1) - s2) : 0.0;
    }
    return ln;
}

sVector UNIFAC::gamma(scalar T, const sVector& x) const
{
    const std::size_t N = names_.size(), G = subgroupList_.size();
    sVector g(N, 1.0);

    double sumrx = 0.0, sumqx = 0.0, sumlx = 0.0;
    for (std::size_t i = 0; i < N; ++i)
    { sumrx += r_[i] * x[i]; sumqx += q_[i] * x[i]; sumlx += x[i] * l_[i]; }

    // mixture group mole fractions
    std::vector<double> Xmix(G, 0.0); double gtot = 0.0;
    for (std::size_t i = 0; i < N; ++i)
        for (std::size_t k = 0; k < G; ++k) Xmix[k] += nu_[i][k] * x[i];
    for (std::size_t k = 0; k < G; ++k) gtot += Xmix[k];
    for (std::size_t k = 0; k < G; ++k) if (gtot > 0.0) Xmix[k] /= gtot;
    const std::vector<double> lnGmix = lnGammaGroups(Xmix, T);

    for (std::size_t i = 0; i < N; ++i)
    {
        if (!hasGroups_[i]) { g[i] = 1.0; continue; }

        // combinatorial (Staverman-Guggenheim)
        double lnC = 0.0;
        if (sumrx > 0.0 && sumqx > 0.0 && r_[i] > 0.0 && q_[i] > 0.0)
        {
            const double phi_over_x   = r_[i] / sumrx;                 // phi_i / x_i
            const double theta_over_phi = (q_[i] / sumqx) / (r_[i] / sumrx);
            lnC = std::log(phi_over_x) + (Z / 2.0) * q_[i] * std::log(theta_over_phi)
                + l_[i] - phi_over_x * sumlx;
        }

        // residual
        const std::vector<double> lnGpure = lnGammaGroups(Xpure_[i], T);
        double lnR = 0.0;
        for (std::size_t k = 0; k < G; ++k)
            if (nu_[i][k] > 0) lnR += nu_[i][k] * (lnGmix[k] - lnGpure[k]);

        g[i] = std::exp(lnC + lnR);
    }
    return g;
}


void injectUnifacGroups(const DictPtr& activityDict,
                        const std::vector<std::string>& names,
                        const std::vector<Component>& comps)
{
    if (!activityDict) return;
    if (activityDict->lookupWordOrDefault("model", "") != "UNIFAC") return;

    const bool hadGroups = activityDict->found("groups");
    DictPtr groups = hadGroups ? activityDict->subDict("groups")
                               : std::make_shared<Dictionary>("groups");
    for (std::size_t i = 0; i < names.size() && i < comps.size(); ++i)
    {
        if (groups->found(names[i])) continue;            // inline declaration wins
        if (!comps[i].hasGroups("unifac")) continue;      // component .dat has none
        std::vector<DictPtr> gl;
        for (const auto& gc : comps[i].groupsFor("unifac"))
        {
            auto gd = std::make_shared<Dictionary>();
            gd->insert("group", gc.first);
            gd->insert("count", static_cast<scalar>(gc.second));
            gl.push_back(gd);
        }
        groups->insert(names[i], gl);
    }
    if (!hadGroups) activityDict->insert("groups", groups);
}

} // namespace Choupo
