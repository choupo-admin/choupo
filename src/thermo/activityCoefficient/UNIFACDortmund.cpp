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

#include "UNIFACDortmund.H"
#include "core/Advisory.H"

#include "core/Dictionary.H"
#include "thermo/Database.H"
#include "thermo/RecordResolver.H"

#include <algorithm>
#include <array>
#include <cmath>
#include <filesystem>
#include <iostream>
#include <map>
#include <set>
#include <stdexcept>

namespace Choupo {

UNIFACDortmund::UNIFACDortmund(const DictPtr& dict,
                               const std::vector<std::string>& names)
:   name_("UNIFACDortmund"), names_(names)
{
    namespace fs = std::filesystem;
    const std::size_t N = names.size();

    // ---- the two printed tables, through the same case-local resolver
    //      ladder as the original UNIFAC (sealed snapshot first).
    const fs::path groupsFile = records::resolveRecord("parameters/UNIFACDortmund/groups.dat");
    const fs::path interFile  = records::resolveRecord("parameters/UNIFACDortmund/interactions.dat");
    if (groupsFile.empty() || interFile.empty())
        throw std::runtime_error(
            "UNIFACDortmund: the group tables (parameters/UNIFACDortmund/"
            "groups.dat + interactions.dat) are NOT in this SEALED case's"
            " constant/ tree -- re-run `bin/choupo-import`.");
    auto gdict = Dictionary::fromFile(groupsFile.string());
    auto idict = Dictionary::fromFile(interFile.string());

    std::map<std::string, double> Rmap, Qmap;
    std::map<std::string, int> mainMap;
    for (const auto& sg : gdict->lookupDictList("subgroups"))
    {
        const std::string nm = sg->lookupWord("name");
        Rmap[nm]    = sg->lookupScalar("R");
        Qmap[nm]    = sg->lookupScalar("Q");
        mainMap[nm] = static_cast<int>(sg->lookupScalar("mainGroup"));
    }
    std::map<int, std::string> mainName;
    for (const auto& mg : gdict->lookupDictList("mainGroups"))
        mainName[static_cast<int>(mg->lookupScalar("number"))] = mg->lookupWord("name");

    // directed (n -> m) triples, as printed: a row gives both directions.
    std::map<std::pair<int,int>, std::array<double,3>> abc;
    for (const auto& it : idict->lookupDictList("interactions"))
    {
        const int n = static_cast<int>(it->lookupScalar("n"));
        const int m = static_cast<int>(it->lookupScalar("m"));
        abc[{n, m}] = { it->lookupScalar("a_nm"), it->lookupScalar("b_nm"),
                        it->lookupScalar("c_nm") };
        abc[{m, n}] = { it->lookupScalar("a_mn"), it->lookupScalar("b_mn"),
                        it->lookupScalar("c_mn") };
    }

    // ---- per-component decomposition (injected from each component's own
    //      `groups { unifacDortmund (...) }`; never inline).
    DictPtr gblk = dict->found("groups") ? dict->subDict("groups") : nullptr;
    std::vector<std::map<std::string, int>> compGroups(N);
    std::set<std::string> used;
    std::vector<std::string> groupless;
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
            }
        }
        else
            groupless.push_back(names[i]);
    }
    if (!groupless.empty())
    {
        std::string list;
        for (const auto& c : groupless) list += (list.empty() ? "" : ", ") + c;
        throw std::runtime_error(
            "UNIFACDortmund: component(s) " + list + " carry no `groups {"
            " unifacDortmund ( ... ); }` block, so the Dortmund model cannot"
            " price them.  The Dortmund subgroups are NOT the original"
            " UNIFAC's (OH is split into OH_p/OH_s/OH_t, ring CH2/CH/C are"
            " c-CH2/c-CH/c-C, other groups differ), so the original"
            " `unifac` block is never reused.  Curate the assignment from"
            " Gmehling, Li & Schiller (1993) Table III (a component-level"
            " act), or choose `model UNIFAC;` for the original table.");
    }

    // ---- active subgroups (sorted -> deterministic) + parameters
    std::set<int> mains;
    for (const auto& s : used)
    {
        if (!Rmap.count(s))
            throw std::runtime_error("UNIFACDortmund: subgroup '" + s +
                "' is not in data/standards/parameters/UNIFACDortmund/groups.dat"
                " (Gmehling, Li & Schiller 1993, Table III) -- fix the group"
                " name in the component's `groups { unifacDortmund (...) }`"
                " block.");
        subgroupList_.push_back(s);
        Rk_.push_back(Rmap[s]);
        Qk_.push_back(Qmap[s]);
        mainOf_.push_back(mainMap[s]);
        mains.insert(mainMap[s]);
    }
    const std::size_t G = subgroupList_.size();

    // ---- every pair of DISTINCT main groups present must be printed in
    //      Table IV; one that is not is REFUSED by name.
    {
        std::vector<std::string> gaps;
        for (int m : mains)
            for (int k : mains)
                if (m != k && !abc.count({m, k}))
                    gaps.push_back(mainName[m] + "(" + std::to_string(m) + ")/"
                                   + mainName[k] + "(" + std::to_string(k) + ")");
        if (!gaps.empty())
        {
            std::string gl;
            for (std::size_t g = 0; g < gaps.size(); ++g)
                gl += (g ? ", " : "") + gaps[g];
            throw std::runtime_error(
                "UNIFACDortmund: Gmehling, Li & Schiller (1993) Table IV prints"
                " no interaction parameters for the main-group pair(s) " + gl
                + ".  They are REFUSED, not taken as athermal and not read from"
                " the original UNIFAC table or a later revision (the paper"
                " prints 530 of the 990 pairs of its 45 main groups).  Use"
                " `model UNIFAC;`, a fitted pair model, or choose components"
                " whose groups the paper connects.");
        }
    }

    aSub_.assign(G * G, 0.0);
    bSub_.assign(G * G, 0.0);
    cSub_.assign(G * G, 0.0);
    for (std::size_t m = 0; m < G; ++m)
        for (std::size_t k = 0; k < G; ++k)
            if (mainOf_[m] != mainOf_[k])
            {
                const auto& t = abc.at({ mainOf_[m], mainOf_[k] });
                aSub_[m * G + k] = t[0];
                bSub_[m * G + k] = t[1];
                cSub_[m * G + k] = t[2];
            }

    // ---- nu, r_i, q_i, r_i^(3/4), pure group composition
    nu_.assign(N, std::vector<int>(G, 0));
    r_.assign(N, 0.0); q_.assign(N, 0.0); r34_.assign(N, 0.0);
    Xpure_.assign(N, std::vector<double>(G, 0.0));
    for (std::size_t i = 0; i < N; ++i)
    {
        double tot = 0.0;
        for (const auto& kv : compGroups[i])
        {
            const std::size_t k = std::lower_bound(subgroupList_.begin(),
                subgroupList_.end(), kv.first) - subgroupList_.begin();
            nu_[i][k] = kv.second; tot += kv.second;
        }
        for (std::size_t k = 0; k < G; ++k)
        {
            r_[i] += nu_[i][k] * Rk_[k];
            q_[i] += nu_[i][k] * Qk_[k];
            if (tot > 0.0) Xpure_[i][k] = nu_[i][k] / tot;
        }
        r34_[i] = std::pow(r_[i], 0.75);
    }

    const std::string msg =
        "UNIFACDortmund: modified UNIFAC (Dortmund), parameters ONLY as printed"
        " in Gmehling, Li & Schiller, Ind. Eng. Chem. Res. 32 (1993) 178,"
        " Tables III-IV (R_k/Q_k; Psi = exp(-(a+bT+cT^2)/T); combinatorial"
        " with r^(3/4), Weidlich & Gmehling 1987 eq 5).  The paper fitted"
        " mostly 20-125 C data and warns against extrapolating outside it"
        " (p. 181); the later licensed Dortmund revisions are not entered.";
    if (AdvisoryLog::instance().add("thermo", "info", "UNIFACDortmund", msg))
        std::cerr << "[unifacDortmund] " << msg << "\n";
}

std::vector<double> UNIFACDortmund::psiMatrix(scalar T) const
{
    const std::size_t G = subgroupList_.size();
    std::vector<double> psi(G * G, 1.0);
    for (std::size_t m = 0; m < G; ++m)
        for (std::size_t k = 0; k < G; ++k)
            if (mainOf_[m] != mainOf_[k])
            {
                const std::size_t ix = m * G + k;
                psi[ix] = std::exp(-(aSub_[ix] + bSub_[ix] * T + cSub_[ix] * T * T) / T);
            }
    return psi;
}

std::vector<double> UNIFACDortmund::lnGammaGroups(const std::vector<double>& X,
                                                  const std::vector<double>& psi) const
{
    const std::size_t G = subgroupList_.size();
    auto Psi = [&](std::size_t m, std::size_t k) -> double { return psi[m * G + k]; };

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

sVector UNIFACDortmund::gamma(scalar T, const sVector& x) const
{
    const std::size_t N = names_.size(), G = subgroupList_.size();
    sVector g(N, 1.0);

    double sumrx = 0.0, sumqx = 0.0, sumr34x = 0.0;
    for (std::size_t i = 0; i < N; ++i)
    { sumrx += r_[i] * x[i]; sumqx += q_[i] * x[i]; sumr34x += r34_[i] * x[i]; }

    std::vector<double> Xmix(G, 0.0); double gtot = 0.0;
    for (std::size_t i = 0; i < N; ++i)
        for (std::size_t k = 0; k < G; ++k) Xmix[k] += nu_[i][k] * x[i];
    for (std::size_t k = 0; k < G; ++k) gtot += Xmix[k];
    for (std::size_t k = 0; k < G; ++k) if (gtot > 0.0) Xmix[k] /= gtot;
    const std::vector<double> psi = psiMatrix(T);
    const std::vector<double> lnGmix = lnGammaGroups(Xmix, psi);

    for (std::size_t i = 0; i < N; ++i)
    {
        // combinatorial, Gmehling et al. 1993 eq 2-4a (the r^(3/4) form):
        //   ln gC = 1 - V' + ln V' - 5 q (1 - V/F + ln(V/F))
        double lnC = 0.0;
        if (sumrx > 0.0 && sumqx > 0.0 && sumr34x > 0.0 && r_[i] > 0.0 && q_[i] > 0.0)
        {
            const double Vp = r34_[i] / sumr34x;
            const double V  = r_[i] / sumrx;
            const double F  = q_[i] / sumqx;
            lnC = 1.0 - Vp + std::log(Vp) - 5.0 * q_[i] * (1.0 - V / F + std::log(V / F));
        }

        // residual
        const std::vector<double> lnGpure = lnGammaGroups(Xpure_[i], psi);
        double lnR = 0.0;
        for (std::size_t k = 0; k < G; ++k)
            if (nu_[i][k] > 0) lnR += nu_[i][k] * (lnGmix[k] - lnGpure[k]);

        g[i] = std::exp(lnC + lnR);
    }
    return g;
}

} // namespace Choupo
