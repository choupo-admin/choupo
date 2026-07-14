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

#include "Wilson.H"
#include "core/Advisory.H"
#include "core/Constants.H"
#include "core/ThermoResolution.H"
#include "thermo/PairAudit.H"
#include "thermo/Database.H"

#include <cmath>
#include <filesystem>
#include <iostream>
#include <stdexcept>
#include <string>

namespace Choupo {

namespace fs = std::filesystem;

namespace {

std::size_t findIndex(const std::vector<std::string>& names,
                      const std::string& name)
{
    for (std::size_t i = 0; i < names.size(); ++i)
        if (names[i] == name) return i;
    throw std::runtime_error("Wilson: component '" + name
        + "' not found in thermoPackage component list");
}

std::string alphaPairFilename(const std::string& a, const std::string& b)
{
    return (a < b ? a + "-" + b : b + "-" + a) + ".dat";
}

fs::path locatePairFile(const std::string& pairName)
{
    fs::path caseFile = fs::current_path()
                        / "constant" / "binaryPairs" / "Wilson" / pairName;
    if (fs::exists(caseFile)) return caseFile;

    const auto& root = Database::currentRoot();
    if (!root.empty())
    {
        fs::path stdFile = fs::path(root)
                           / "standards" / "binaryPairs" / "Wilson" / pairName;
        if (fs::exists(stdFile)) return stdFile;
        fs::path proposedFile = fs::path(root)
                           / "local" / "binaryPairs" / "Wilson" / pairName;
        if (fs::exists(proposedFile)) return proposedFile;
    }
    return {};
}

} // anonymous

Wilson::Wilson(const DictPtr& dict, const std::vector<Component>& comps)
:   n_(comps.size())
{
    Amat_.assign(n_*n_, 0.0);
    idealPair_.assign(n_*n_, false);
    V_.assign(n_,    0.0);

    // Molar volumes straight from the components -- self-configured AT
    // construction (no post-construction setMolarVolumes two-phase dance).
    // Throw LOUD on a missing Vliq (no silent crutch).
    std::vector<std::string> names;  names.reserve(n_);
    for (std::size_t i = 0; i < n_; ++i)
    {
        names.push_back(comps[i].name());
        if (comps[i].Vliq() <= 0.0)
            throw std::runtime_error("Wilson: component '" + comps[i].name()
                + "' has Vliq <= 0 -- add 'Vliq' to its data/components/*.dat");
        V_[i] = comps[i].Vliq();
    }

    std::vector<bool> covered(n_*n_, false);
    for (std::size_t i = 0; i < n_; ++i) covered[i*n_ + i] = true;

    auto record = [&](const std::string& ni, const std::string& nj,
                      const std::string& status, const std::string& source,
                      const std::string& provSource,
                      const DictPtr& provDict = nullptr)
    {
        PairResolution r{ "Wilson", ni, nj, status, source, provSource };
        fillPairAudit(r, provDict, ni + "-" + nj, status == "standard");
        ThermoResolutionLog::instance().add(std::move(r));
    };

    auto applyPair = [&](const DictPtr& p, const std::string& sourceLabel)
    {
        const std::string ni = p->lookupWord("i");
        const std::string nj = p->lookupWord("j");
        const std::size_t i = findIndex(names, ni);
        const std::size_t j = findIndex(names, nj);
        if (i == j)
            throw std::runtime_error("Wilson: pair refers to same component '"
                + ni + "' (" + sourceLabel + ")");

        Amat_[i*n_ + j] = p->lookupScalar("A_ij");
        Amat_[j*n_ + i] = p->lookupScalar("A_ji");

        covered[i*n_ + j] = true;
        covered[j*n_ + i] = true;
    };

    // ---- Phase 1: inline pairs ---------------------------------------
    if (dict->found("pairs"))
        for (const auto& p : dict->lookupDictList("pairs"))
        {
            applyPair(p, "inline");
            record(p->lookupWord("i"), p->lookupWord("j"), "inline", "inline", "inline");
        }

    // ---- Phase 2: file lookup for any uncovered pair -----------------
    // HYBRID (mirrors NRTL, Vítor's "see-then-decide"): a pair with no
    // parameters anywhere DEFAULTS TO IDEAL (Λ_ij = Λ_ji = 1 -> that binary
    // contributes nothing) instead of aborting, so Wilson can be turned on in
    // a multi-component package and the missing pairs fitted/added later.
    // Never silent: each ideal-defaulted pair is announced + recorded.
    std::vector<std::string> idealDefaulted;
    for (std::size_t i = 0; i < n_; ++i)
        for (std::size_t j = i + 1; j < n_; ++j)
        {
            if (covered[i*n_ + j]) continue;

            const std::string fname = alphaPairFilename(names[i], names[j]);
            fs::path file = locatePairFile(fname);

            if (file.empty())
            {
                idealPair_[i*n_ + j] = idealPair_[j*n_ + i] = true;
                covered[i*n_ + j] = covered[j*n_ + i] = true;
                idealDefaulted.push_back(names[i] + "-" + names[j]);
                record(names[i], names[j], "idealDefault", "ideal-default", "");
                continue;
            }

            auto fileDict = Dictionary::fromFile(file.string());
            const bool isProposed =
                file.string().find("/proposed/binaryPairs/") != std::string::npos;
            if (isProposed)
            {
                const bool isNew = AdvisoryLog::instance().add(
                    "provenance", "warning", "Wilson " + names[i] + "-" + names[j],
                    "loaded from data/local/binaryPairs -- UNVERIFIED");
                if (isNew)
                    std::cout << "  [local] Wilson binary pair " << names[i]
                              << "-" << names[j]
                              << ": UNVERIFIED local (imported/licensed) data\n";
            }

            if (fileDict->found("model"))
            {
                const std::string declaredModel = fileDict->lookupWord("model");
                if (declaredModel != "Wilson")
                    throw std::runtime_error(
                        "Wilson: " + file.string() + " declares model '"
                        + declaredModel + "' but case requires Wilson");
            }

            if (fileDict->found("parameters"))
                applyPair(fileDict->subDict("parameters"), file.string());
            else
                throw std::runtime_error(
                    "Wilson: " + file.string() + " missing 'parameters' block");

            std::string provSource;
            if (fileDict->found("provenance"))
                provSource = fileDict->subDict("provenance")
                                 ->lookupWordOrDefault("source", "");
            const std::string tier = isProposed ? "local" :
                (file.string().find("/standards/") != std::string::npos) ? "standard" : "caseRoot";
            record(names[i], names[j], tier, file.string(), provSource,
               fileDict->found("provenance")
                   ? fileDict->subDict("provenance") : nullptr);
        }

    // Announce the ideal-defaulted pairs (no silent crutch).
    if (!idealDefaulted.empty())
    {
        std::string list;
        for (std::size_t k = 0; k < idealDefaulted.size(); ++k)
            list += (k ? ", " : "") + idealDefaulted[k];
        const bool isNew = AdvisoryLog::instance().add("thermo", "warning", "Wilson",
            std::to_string(idealDefaulted.size())
            + " binary pair(s) defaulted to ideal (no parameters): " + list
            + " -- fit or add them to constrain these interactions");
        if (isNew)
            std::cout << "  [thermo] Wilson: " << idealDefaulted.size()
                      << " binary pair(s) have no parameters -> defaulted to IDEAL: "
                      << list << "  (fit or add them to constrain these interactions)\n";
    }
}


sVector Wilson::gamma(scalar T, const sVector& x) const
{
    const scalar RT = constant::R * T;

    // Λ matrix at this T
    std::vector<scalar> L(n_*n_, 1.0);
    for (std::size_t i = 0; i < n_; ++i)
        for (std::size_t j = 0; j < n_; ++j)
        {
            if (i == j) { L[i*n_+j] = 1.0; continue; }
            // Ideal-defaulted pair (no params): Λ = 1, no interaction.
            if (idealPair_[i*n_+j]) { L[i*n_+j] = 1.0; continue; }
            L[i*n_+j] = (V_[j] / V_[i]) * std::exp(-Amat_[i*n_+j] / RT);
        }

    // Pre-compute  S_i = Σ_j x_j Λ_ij
    sVector S(n_, 0.0);
    for (std::size_t i = 0; i < n_; ++i)
    {
        scalar s = 0.0;
        for (std::size_t j = 0; j < n_; ++j) s += x[j] * L[i*n_+j];
        S[i] = s;
    }

    sVector lnGamma(n_, 0.0);
    for (std::size_t i = 0; i < n_; ++i)
    {
        scalar sum2 = 0.0;
        for (std::size_t k = 0; k < n_; ++k)
        {
            if (S[k] > 0.0)
                sum2 += x[k] * L[k*n_+i] / S[k];
        }
        lnGamma[i] = 1.0 - std::log(S[i]) - sum2;
    }

    sVector gam(n_);
    for (std::size_t i = 0; i < n_; ++i) gam[i] = std::exp(lnGamma[i]);
    return gam;
}

} // namespace Choupo
