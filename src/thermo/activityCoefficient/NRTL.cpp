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

#include "NRTL.H"
#include "core/Advisory.H"
#include "core/Origin.H"
#include "core/ThermoResolution.H"
#include "thermo/PairAudit.H"
#include "thermo/Database.H"

#include <algorithm>
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
    throw std::runtime_error("NRTL: component '" + name
        + "' not found in thermoPackage component list");
}

// Build "<a>-<b>.dat" with components sorted alphabetically.
std::string alphaPairFilename(const std::string& a, const std::string& b)
{
    return (a < b ? a + "-" + b : b + "-" + a) + ".dat";
}

// Try to locate the pair file.  ONE spelling across every tier (Migration 2):
// parameters/NRTL/<pair>.dat, resolved in precedence order
//     0. <nodeBase>/constant/parameters/NRTL/<pair>.dat    (per-node, Item 0b)
//     1. <cwd>/constant/parameters/NRTL/<pair>.dat         (case-local / plant root)
//     2. per-node / case sealed snapshot  constant/propertyData/parameters/NRTL/
//     3. <Database::currentRoot()>/standards/parameters/NRTL/<pair>.dat
//     4. <Database::currentRoot()>/local/parameters/NRTL/<pair>.dat  (private tier)
// Returns empty path if nothing found.  `nodeBase` is the owning node's folder
// (e.g. "SEPARATION") so a sector/unit's PARTICULAR pair resolves before the
// plant root + the standard library -- the per-node walk-up.
fs::path locatePairFile(const std::string& pairName, const std::string& nodeBase,
                        std::string& tierOut)
{
    if (!nodeBase.empty())
    {
        fs::path nodeFile = fs::path(nodeBase)
                            / "constant" / "parameters" / "NRTL" / pairName;
        if (fs::exists(nodeFile)) { tierOut = "perNode"; return nodeFile; }
    }

    fs::path caseFile = fs::current_path()
                        / "constant" / "parameters" / "NRTL" / pairName;
    if (fs::exists(caseFile)) { tierOut = "caseRoot"; return caseFile; }

    // Case snapshot: propertyData/parameters/ is the CANONICAL home for a model
    // parameter (sealed self-containment, F2).  Per-node context first, then the
    // case root -- consulted BEFORE the installation catalogue.
    if (!nodeBase.empty())
    {
        fs::path nodeSnap = fs::path(nodeBase) / "constant" / "propertyData"
                          / "parameters" / "NRTL" / pairName;
        if (fs::exists(nodeSnap)) { tierOut = "perNodeSnapshot"; return nodeSnap; }
    }
    fs::path caseSnap = fs::current_path() / "constant" / "propertyData"
                      / "parameters" / "NRTL" / pairName;
    if (fs::exists(caseSnap)) { tierOut = "caseSnapshot"; return caseSnap; }

    const auto& root = Database::currentRoot();
    if (!root.empty())
    {
        fs::path stdFile = fs::path(root)
                           / "standards" / "parameters" / "NRTL" / pairName;
        if (fs::exists(stdFile)) { tierOut = "standard"; return stdFile; }
        fs::path localFile = fs::path(root)
                           / "local" / "parameters" / "NRTL" / pairName;
        if (fs::exists(localFile)) { tierOut = "local"; return localFile; }
    }
    tierOut = "idealDefault";
    return {};
}

} // anonymous

NRTL::NRTL(const DictPtr& dict, const std::vector<std::string>& names)
:   n_(names.size())
{
    aMat_.assign(n_*n_, 0.0);
    bMat_.assign(n_*n_, 0.0);
    alphaMat_.assign(n_*n_, 0.0);

    // Track which off-diagonal (i,j) pairs have parameters set so we can
    // fall back to file lookup for the rest.
    std::vector<bool> covered(n_*n_, false);
    for (std::size_t i = 0; i < n_; ++i) covered[i*n_ + i] = true;

    auto applyPair = [&](const DictPtr& p, const std::string& sourceLabel)
    {
        const std::string ni = p->lookupWord("i");
        const std::string nj = p->lookupWord("j");
        const std::size_t i = findIndex(names, ni);
        const std::size_t j = findIndex(names, nj);
        if (i == j)
            throw std::runtime_error("NRTL: pair refers to same component '"
                + ni + "' (" + sourceLabel + ")");

        const scalar a_ij  = p->lookupScalarOrDefault("a_ij",  0.0);
        const scalar b_ij  = p->lookupScalarOrDefault("b_ij",  0.0);
        const scalar a_ji  = p->lookupScalarOrDefault("a_ji",  0.0);
        const scalar b_ji  = p->lookupScalarOrDefault("b_ji",  0.0);
        const scalar alpha = p->lookupScalar         ("alpha");

        aMat_    [i*n_ + j] = a_ij;
        aMat_    [j*n_ + i] = a_ji;
        bMat_    [i*n_ + j] = b_ij;
        bMat_    [j*n_ + i] = b_ji;
        alphaMat_[i*n_ + j] = alpha;
        alphaMat_[j*n_ + i] = alpha;

        covered[i*n_ + j] = true;
        covered[j*n_ + i] = true;
        // The molecular calorimetric gate is per-PAIR and conjunctive: H^E is
        // a mixture property, so EVERY pair must carry a measured-H_E refit
        // before the package's excess enthalpy is trusted (spec sec.8b).
        if (p->lookupWordOrDefault("calorimetricFit", "false") != "true")
            calFitAll_ = false;
    };

    auto recordResolution = [&](const std::string& ni, const std::string& nj,
                                const std::string& status, const std::string& source,
                                const std::string& provSource,
                                const DictPtr& provDict = nullptr)
    {
        PairResolution r{ "NRTL", ni, nj, status, source, provSource };
        fillPairAudit(r, provDict, ni + "-" + nj, status == "standard");
        ThermoResolutionLog::instance().add(std::move(r));
    };

    // ---- Phase 1: inline `pairs (... )` in the thermoPackage dict ----
    if (dict->found("pairs"))
        for (const auto& p : dict->lookupDictList("pairs"))
        {
            applyPair(p, "inline");
            recordResolution(p->lookupWord("i"), p->lookupWord("j"),
                             "inline", "inline", "inline");
        }

    // ---- Phase 2: file lookup (case-local then standards) for any pair
    //               not yet covered.
    // HYBRID (Vítor's decision, "see-then-decide"): a pair with no parameters
    // anywhere DEFAULTS TO IDEAL (tau=0 -> no excess-Gibbs contribution) rather
    // than aborting -- so the foundation can be built pair-by-pair (turn on
    // NRTL, see what's missing, fit/add it).  But it is NEVER silent: every
    // ideal-defaulted pair is collected and announced (log + AdvisoryLog), so
    // the student SEES exactly which interactions are unconstrained.
    // Per-node search base (Item 0b): the owning node's folder, injected by
    // the Flowsheet into the unit's `thermo {}` so a sector/unit's PARTICULAR
    // pair resolves before the plant root + the standard library.
    const std::string pairBase = dict->lookupWordOrDefault("binaryPairsBase", "");

    // ACTIVE-SET projection (Codex/Claude design, 2026-07-16; doctrine intact:
    // components stay GLOBAL in streams and package -- only the PAIR MATRIX
    // and its announcement restrict to the declared domain).  When the context
    // declares `activeComponents ( ... )`:
    //   * pairs among ACTIVE components must resolve or the ctor REFUSES --
    //     an ideal assumption between active components is a model FACT and
    //     must live as a record (provenance `source assumedIdeal`), never a
    //     silent default;
    //   * pairs touching an out-of-domain component skip the lookup entirely
    //     and are announced as ONE aggregated outOfContext line;
    //   * gamma() refuses if an out-of-domain component carries real
    //     composition (the declared domain stopped representing the stream).
    activeMask_.assign(n_, true);
    bool hasActiveSet = false;
    if (dict->found("activeComponents"))
    {
        hasActiveSet = true;
        activeMask_.assign(n_, false);
        for (const auto& an : dict->lookupWordList("activeComponents"))
            activeMask_[findIndex(names, an)] = true;   // findIndex refuses unknowns
    }

    std::vector<std::string> idealDefaulted;
    std::size_t outOfContext = 0;
    for (std::size_t i = 0; i < n_; ++i)
        for (std::size_t j = i + 1; j < n_; ++j)
        {
            if (covered[i*n_ + j]) continue;

            if (hasActiveSet && !(activeMask_[i] && activeMask_[j]))
            {
                // outside the declared domain: tau stays 0, alpha harmless,
                // no per-pair lookup, no per-pair noise.
                alphaMat_[i*n_ + j] = alphaMat_[j*n_ + i] = 0.3;
                covered[i*n_ + j] = covered[j*n_ + i] = true;
                ++outOfContext;
                recordResolution(names[i], names[j], "outOfContext",
                                 "out-of-context", "");
                continue;
            }

            const std::string fname = alphaPairFilename(names[i], names[j]);
            std::string tier;
            fs::path file = locatePairFile(fname, pairBase, tier);

            if (file.empty())
            {
                if (hasActiveSet)
                    throw std::runtime_error("NRTL: pair " + names[i] + "-"
                        + names[j] + " is between ACTIVE components of the"
                        " declared domain but has no parameter record.  An"
                        " ideal assumption between active components is a"
                        " model FACT: add a record (a_ij/b_ij = 0, provenance"
                        " `source assumedIdeal;`) under constant/parameters/"
                        "NRTL/ (or the sealed snapshot) and declare it -- no"
                        " silent crutch.");
                // default to ideal: tau=0 (aMat/bMat already 0), alpha harmless
                alphaMat_[i*n_ + j] = alphaMat_[j*n_ + i] = 0.3;
                covered[i*n_ + j] = covered[j*n_ + i] = true;
                idealDefaulted.push_back(names[i] + "-" + names[j]);
                calFitAll_ = false;   // an ideal-defaulted pair is unfitted
                recordResolution(names[i], names[j], "idealDefault",
                                 "ideal-default", "");
                continue;
            }

            auto fileDict = Dictionary::fromFile(file.string());

            if (tier == "local")
            {
                const bool isNew = AdvisoryLog::instance().add(
                    "provenance", "warning", "NRTL " + names[i] + "-" + names[j],
                    "loaded from data/local/parameters -- UNVERIFIED");
                if (isNew)
                    std::cout << "  [local] NRTL binary pair " << names[i]
                              << "-" << names[j]
                              << ": UNVERIFIED local (imported/licensed) data\n";
            }

            // Validate model
            if (fileDict->found("model"))
            {
                const std::string declaredModel = fileDict->lookupWord("model");
                if (declaredModel != "NRTL")
                    throw std::runtime_error(
                        "NRTL: " + file.string() + " declares model '"
                        + declaredModel + "' but case requires NRTL");
            }

            // Apply the `parameters` block (or, for backward compat, the
            // file's top-level pair-like entries).
            if (fileDict->found("parameters"))
                applyPair(fileDict->subDict("parameters"),
                          file.string());
            else
                throw std::runtime_error(
                    "NRTL: " + file.string() + " missing 'parameters' block");

            // The file's own provenance.source ("placeholder"/"literature"/
            // "fitted"/...) -- distinguishes a guess from real data.
            std::string provSource;
            if (fileDict->found("provenance"))
                provSource = fileDict->subDict("provenance")
                                 ->lookupWordOrDefault("source", "");
            recordResolution(names[i], names[j], tier, file.string(), provSource,
                             fileDict->found("provenance")
                                 ? fileDict->subDict("provenance") : nullptr);
        }
    // Diagonals stay at 0 (τ_ii = 0, G_ii = 1, α_ii = 0).

    if (outOfContext > 0)
    {
        std::size_t nAct = 0;
        for (std::size_t k = 0; k < n_; ++k) if (activeMask_[k]) ++nAct;
        std::cout << "  [thermo] NRTL active-set domain (" << nAct << "/" << n_
                  << " components active): " << outOfContext
                  << " pair(s) outOfContext (no lookup, tau = 0; out-of-domain"
                     " composition is advisory-checked at evaluation, hard-"
                     "checked at convergence by the route gate)\n";
    }

    // Announce the ideal-defaulted pairs (no silent crutch): the student sees
    // which interactions are unconstrained and can fit/add them.
    if (!idealDefaulted.empty())
    {
        std::string list;
        for (std::size_t k = 0; k < idealDefaulted.size(); ++k)
            list += (k ? ", " : "") + idealDefaulted[k];
        // Gate the log line on the AdvisoryLog dedup: NRTL's activity model is
        // constructed more than once per thermo build (the liquid Phase + the
        // legacy activity_ pointer), so without this the SAME warning prints
        // twice and reads like a bug.
        const bool isNew = AdvisoryLog::instance().add("thermo", "warning", "NRTL",
            std::to_string(idealDefaulted.size())
            + " binary pair(s) defaulted to ideal (no parameters): " + list
            + " -- fit or add them to constrain these interactions");
        if (isNew)
            std::cout << "  [thermo] NRTL: " << idealDefaulted.size()
                      << " binary pair(s) have no parameters -> defaulted to IDEAL: "
                      << list << "  (fit or add them to constrain these interactions)\n";
    }
}

sVector NRTL::gamma(scalar T, const sVector& x) const
{
    if (x.size() != n_)
        throw std::runtime_error("NRTL::gamma: x.size() != n_components");

    // Active-set guard: the mask hides PAIRS, never material.  If an
    // out-of-domain component carries composition, the tau = 0 physics being
    // applied to it is UNCONSTRAINED -- but a hard refusal here would kill
    // honest solver TRANSIENTS (the auto-init tear seed is the flow-averaged
    // aggregate of ALL plant feeds, announced as such, and washes out at
    // convergence).  So: LOUD advisory during evaluation; the HARD assertion
    // lives at the converged state (the lithium route gate checks the
    // converged streams carry no out-of-domain material).
    if (!activeMask_.empty())
        for (std::size_t k = 0; k < n_; ++k)
            if (!activeMask_[k] && x[k] > 1.0e-10)
            {
                const bool isNew = AdvisoryLog::instance().add(
                    "thermo", "warning", "NRTL activeComponents",
                    "out-of-domain component index " + std::to_string(k)
                    + " carries x = " + std::to_string(x[k])
                    + " during evaluation -- tau = 0 (unconstrained) physics"
                    " applied; if this persists at CONVERGENCE the declared"
                    " domain no longer represents the stream (extend"
                    " activeComponents and curate its pairs).");
                if (isNew)
                    std::cout << "  [thermo] NRTL active-set: out-of-domain"
                                 " composition during evaluation (x = "
                              << x[k] << " at index " << k
                              << ") -- transient tolerated, convergence must"
                                 " clear it\n";
            }

    // τ and G at this T
    std::vector<scalar> tau(n_*n_, 0.0);
    std::vector<scalar> G  (n_*n_, 1.0);
    for (std::size_t i = 0; i < n_; ++i)
        for (std::size_t j = 0; j < n_; ++j)
        {
            if (i == j) { tau[i*n_+j] = 0.0; G[i*n_+j] = 1.0; continue; }
            scalar t = a(i,j) + b(i,j) / T;
            tau[i*n_+j] = t;
            G  [i*n_+j] = std::exp(-alpha(i,j) * t);
        }

    // Pre-compute  S_j = Σ_k G_kj x_k    (denominators that appear often)
    sVector S(n_, 0.0);
    for (std::size_t j = 0; j < n_; ++j)
    {
        scalar s = 0.0;
        for (std::size_t k = 0; k < n_; ++k) s += G[k*n_ + j] * x[k];
        S[j] = s;
    }

    // Pre-compute  T_j = Σ_k τ_kj G_kj x_k
    sVector Tsum(n_, 0.0);
    for (std::size_t j = 0; j < n_; ++j)
    {
        scalar s = 0.0;
        for (std::size_t k = 0; k < n_; ++k)
            s += tau[k*n_ + j] * G[k*n_ + j] * x[k];
        Tsum[j] = s;
    }

    sVector lnGamma(n_, 0.0);
    for (std::size_t i = 0; i < n_; ++i)
    {
        // First term: Σ_j τ_ji G_ji x_j / S_i
        scalar termA = (S[i] > 0.0) ? Tsum[i] / S[i] : 0.0;

        // Second term: Σ_j  x_j G_ij / S_j  ·{ τ_ij - T_j / S_j }
        scalar termB = 0.0;
        for (std::size_t j = 0; j < n_; ++j)
        {
            if (S[j] <= 0.0) continue;
            termB += (x[j] * G[i*n_ + j] / S[j])
                   * (tau[i*n_ + j] - Tsum[j] / S[j]);
        }

        lnGamma[i] = termA + termB;
    }

    sVector gam(n_);
    for (std::size_t i = 0; i < n_; ++i) gam[i] = std::exp(lnGamma[i]);
    return gam;
}

} // namespace Choupo
