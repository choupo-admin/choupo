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

#include "UNIQUAC.H"
#include "core/Advisory.H"
#include "thermo/Database.H"
#include "core/ThermoResolution.H"
#include "thermo/PairAudit.H"

#include <cmath>
#include <filesystem>
#include <iostream>
#include <stdexcept>

namespace Choupo {

namespace fs = std::filesystem;

namespace {

std::size_t findIndex(const std::vector<std::string>& names,
                      const std::string& name)
{
    for (std::size_t i = 0; i < names.size(); ++i)
        if (names[i] == name) return i;
    throw std::runtime_error("UNIQUAC: component '" + name
        + "' not found in thermoPackage component list");
}

std::string alphaPairFilename(const std::string& a, const std::string& b)
{
    return (a < b ? a + "-" + b : b + "-" + a) + ".dat";
}

// Locate a UNIQUAC pair file, same precedence as NRTL: per-node, case-root,
// standard library.  Empty path => nothing found.
fs::path locatePairFile(const std::string& pairName, const std::string& nodeBase)
{
    if (!nodeBase.empty())
    {
        fs::path f = fs::path(nodeBase) / "constant" / "binaryPairs" / "UNIQUAC" / pairName;
        if (fs::exists(f)) return f;
    }
    fs::path caseFile = fs::current_path() / "constant" / "binaryPairs" / "UNIQUAC" / pairName;
    if (fs::exists(caseFile)) return caseFile;

    // Case snapshot: propertyData/parameters/ is the CANONICAL param home (sealed
    // self-containment, F2) -- per-node then case root, before the catalogue.
    if (!nodeBase.empty())
    {
        fs::path nodeSnap = fs::path(nodeBase) / "constant" / "propertyData"
                          / "parameters" / "activity" / "UNIQUAC" / pairName;
        if (fs::exists(nodeSnap)) return nodeSnap;
    }
    fs::path caseSnap = fs::current_path() / "constant" / "propertyData"
                      / "parameters" / "activity" / "UNIQUAC" / pairName;
    if (fs::exists(caseSnap)) return caseSnap;

    const auto& root = Database::currentRoot();
    if (!root.empty())
    {
        fs::path stdFile = fs::path(root) / "standards" / "binaryPairs" / "UNIQUAC" / pairName;
        if (fs::exists(stdFile)) return stdFile;
        fs::path proposedFile = fs::path(root) / "local" / "binaryPairs" / "UNIQUAC" / pairName;
        if (fs::exists(proposedFile)) return proposedFile;
    }
    return {};
}

} // anonymous

UNIQUAC::UNIQUAC(const DictPtr& dict, const std::vector<std::string>& names)
:   n_(names.size())
{
    r_.assign(n_, 0.0);
    q_.assign(n_, 0.0);
    aMat_.assign(n_*n_, 0.0);
    bMat_.assign(n_*n_, 0.0);
    cMat_.assign(n_*n_, 0.0);

    // ---- Pure-component r, q (structural; glass-box, the student cites them) ----
    if (!dict->found("rq"))
        throw std::runtime_error("UNIQUAC: missing `rq { <comp> { r; q; } ... }` "
            "block -- every component needs its van der Waals volume r and "
            "surface area q");
    auto rq = dict->subDict("rq");
    std::vector<bool> haveRQ(n_, false);
    for (const auto& cname : rq->keys())
    {
        const std::size_t i = findIndex(names, cname);
        auto cd = rq->subDict(cname);
        r_[i] = cd->lookupScalar("r");
        q_[i] = cd->lookupScalar("q");
        if (r_[i] <= 0.0 || q_[i] <= 0.0)
            throw std::runtime_error("UNIQUAC: component '" + cname
                + "' has non-positive r or q");
        haveRQ[i] = true;
    }
    for (std::size_t i = 0; i < n_; ++i)
        if (!haveRQ[i])
            throw std::runtime_error("UNIQUAC: component '" + names[i]
                + "' has no r/q in the `rq {}` block");

    // ---- Binary interaction parameters a_ij [K] (tau_ij = exp(-a_ij/T)) ----
    std::vector<bool> covered(n_*n_, false);
    for (std::size_t i = 0; i < n_; ++i) covered[i*n_ + i] = true;

    auto applyPair = [&](const DictPtr& p, const std::string& src)
    {
        const std::string ni = p->lookupWord("i");
        const std::string nj = p->lookupWord("j");
        const std::size_t i = findIndex(names, ni);
        const std::size_t j = findIndex(names, nj);
        if (i == j)
            throw std::runtime_error("UNIQUAC: pair refers to same component '"
                + ni + "' (" + src + ")");
        aMat_[i*n_ + j] = p->lookupScalarOrDefault("a_ij", 0.0);
        aMat_[j*n_ + i] = p->lookupScalarOrDefault("a_ji", 0.0);
        bMat_[i*n_ + j] = p->lookupScalarOrDefault("b_ij", 0.0);
        bMat_[j*n_ + i] = p->lookupScalarOrDefault("b_ji", 0.0);
        cMat_[i*n_ + j] = p->lookupScalarOrDefault("c_ij", 0.0);
        cMat_[j*n_ + i] = p->lookupScalarOrDefault("c_ji", 0.0);
        covered[i*n_ + j] = covered[j*n_ + i] = true;
    };

    // Phase 1: inline pairs in the thermoPackage dict.
    if (dict->found("pairs"))
        for (const auto& p : dict->lookupDictList("pairs"))
        {
            applyPair(p, "inline");
            PairResolution r{ "UNIQUAC", p->lookupWord("i"), p->lookupWord("j"),
                              "inline", "inline", "" };
            ThermoResolutionLog::instance().add(std::move(r));
        }

    // Phase 2: file lookup for any pair not yet covered.
    const std::string pairBase = dict->lookupWordOrDefault("binaryPairsBase", "");
    std::vector<std::string> idealDefaulted;
    for (std::size_t i = 0; i < n_; ++i)
        for (std::size_t j = i + 1; j < n_; ++j)
        {
            if (covered[i*n_ + j]) continue;

            const std::string fname = alphaPairFilename(names[i], names[j]);
            fs::path file = locatePairFile(fname, pairBase);
            if (file.empty())
            {
                idealDefaulted.push_back(names[i] + "-" + names[j]);
                covered[i*n_ + j] = covered[j*n_ + i] = true;
                ThermoResolutionLog::instance().add(PairResolution{
                    "UNIQUAC", names[i], names[j],
                    "idealDefault", "ideal-default", "" });
                continue;   // a_ij = a_ji = 0 -> tau = 1 (ideal contribution)
            }

            auto fd = Dictionary::fromFile(file.string());
            const bool isProposed =
                file.string().find("/proposed/binaryPairs/") != std::string::npos;
            if (isProposed)
            {
                const bool isNew = AdvisoryLog::instance().add(
                    "provenance", "warning", "UNIQUAC " + names[i] + "-" + names[j],
                    "loaded from data/local/binaryPairs -- UNVERIFIED");
                if (isNew)
                    std::cout << "  [local] UNIQUAC binary pair " << names[i]
                              << "-" << names[j]
                              << ": UNVERIFIED local (imported/licensed) data\n";
            }
            if (fd->found("model"))
            {
                const std::string m = fd->lookupWord("model");
                if (m != "UNIQUAC")
                    throw std::runtime_error("UNIQUAC: " + file.string()
                        + " declares model '" + m + "' but case requires UNIQUAC");
            }
            if (!fd->found("parameters"))
                throw std::runtime_error("UNIQUAC: " + file.string()
                    + " missing 'parameters' block");
            applyPair(fd->subDict("parameters"), file.string());
            {
                // Audit path (forum #77-4): UNIQUAC joins the SAME contract as
                // NRTL and Wilson -- one parser, typed origin, validity, override.
                std::string provSource;
                DictPtr provDict;
                if (fd->found("provenance"))
                {
                    provDict   = fd->subDict("provenance");
                    provSource = provDict->lookupWordOrDefault("source", "");
                }
                const std::string tier = isProposed ? "local" :
                    (file.string().find("/standards/") != std::string::npos)
                    ? "standard" : "caseLocal";
                PairResolution r{ "UNIQUAC", names[i], names[j],
                                  tier, file.string(), provSource };
                fillPairAudit(r, provDict, names[i] + "-" + names[j],
                              tier == "standard");
                ThermoResolutionLog::instance().add(std::move(r));
            }
        }

    // No silent crutch: announce the ideal-defaulted pairs.
    if (!idealDefaulted.empty())
    {
        std::string list;
        for (std::size_t k = 0; k < idealDefaulted.size(); ++k)
            list += (k ? ", " : "") + idealDefaulted[k];
        const bool isNew = AdvisoryLog::instance().add("thermo", "warning", "UNIQUAC",
            std::to_string(idealDefaulted.size())
            + " binary pair(s) defaulted to ideal (no parameters): " + list);
        if (isNew)
            std::cout << "  [thermo] UNIQUAC: " << idealDefaulted.size()
                      << " binary pair(s) have no parameters -> defaulted to IDEAL: "
                      << list << "  (fit or add them to constrain these interactions)\n";
    }
}

sVector UNIQUAC::gamma(scalar T, const sVector& x) const
{
    if (x.size() != n_)
        throw std::runtime_error("UNIQUAC::gamma: x.size() != n_components");

    // tau_ij at this T.  A_ij(T) = a_ij + b_ij*T + c_ij*T^2 (Winkelman Eq. 10);
    // tau_ij = exp(-A_ij/T) (Eq. 7).  c = 0 recovers the linear a + b*T form.
    std::vector<scalar> tau(n_*n_, 1.0);
    for (std::size_t i = 0; i < n_; ++i)
        for (std::size_t j = 0; j < n_; ++j)
            tau[i*n_ + j] = std::exp(-(a(i,j) + b(i,j) * T + c(i,j) * T * T) / T);   // tau_ii = exp(0) = 1

    // Segment (phi) and area (theta) fractions.
    scalar sumRx = 0.0, sumQx = 0.0;
    for (std::size_t i = 0; i < n_; ++i) { sumRx += r_[i] * x[i]; sumQx += q_[i] * x[i]; }

    sVector phi(n_, 0.0), theta(n_, 0.0);
    for (std::size_t i = 0; i < n_; ++i)
    {
        phi[i]   = (sumRx > 0.0) ? r_[i] * x[i] / sumRx : 0.0;
        theta[i] = (sumQx > 0.0) ? q_[i] * x[i] / sumQx : 0.0;
    }

    // l_i = (z/2)(r_i - q_i) - (r_i - 1)
    sVector l(n_, 0.0);
    for (std::size_t i = 0; i < n_; ++i)
        l[i] = (z_coord_ / 2.0) * (r_[i] - q_[i]) - (r_[i] - 1.0);
    scalar sum_xl = 0.0;
    for (std::size_t i = 0; i < n_; ++i) sum_xl += x[i] * l[i];

    // Residual denominators  D_j = Sum_k theta_k tau_kj
    sVector D(n_, 0.0);
    for (std::size_t j = 0; j < n_; ++j)
    {
        scalar s = 0.0;
        for (std::size_t k = 0; k < n_; ++k) s += theta[k] * tau[k*n_ + j];
        D[j] = s;
    }

    sVector gam(n_, 1.0);
    for (std::size_t i = 0; i < n_; ++i)
    {
        if (x[i] <= 0.0) { gam[i] = 1.0; continue; }

        // Combinatorial part.
        scalar lnGammaC =
              std::log(phi[i] / x[i])
            + (z_coord_ / 2.0) * q_[i] * std::log(theta[i] / phi[i])
            + l[i]
            - (phi[i] / x[i]) * sum_xl;

        // Residual part.
        scalar sumThetaTau = 0.0;
        for (std::size_t j = 0; j < n_; ++j) sumThetaTau += theta[j] * tau[j*n_ + i];
        scalar sumFrac = 0.0;
        for (std::size_t j = 0; j < n_; ++j)
            if (D[j] > 0.0) sumFrac += theta[j] * tau[i*n_ + j] / D[j];

        scalar lnGammaR = q_[i] * (1.0 - std::log(sumThetaTau) - sumFrac);

        gam[i] = std::exp(lnGammaC + lnGammaR);
    }
    return gam;
}

void injectUniquacRQ(const DictPtr& activityDict,
                     const std::vector<std::string>& names,
                     const std::vector<Component>& comps)
{
    if (!activityDict) return;
    if (activityDict->lookupWordOrDefault("model", "") != "UNIQUAC") return;

    const bool hadRQ = activityDict->found("rq");
    DictPtr rq = hadRQ ? activityDict->subDict("rq")
                       : std::make_shared<Dictionary>("rq");
    for (std::size_t i = 0; i < names.size() && i < comps.size(); ++i)
    {
        if (rq->found(names[i])) continue;            // inline declaration wins
        if (!comps[i].hasUniquac()) continue;         // component .dat has none
        auto cd = std::make_shared<Dictionary>();
        cd->insert("r", comps[i].rUniquac());
        cd->insert("q", comps[i].qUniquac());
        rq->insert(names[i], cd);
    }
    if (!hadRQ) activityDict->insert("rq", rq);
}

} // namespace Choupo
