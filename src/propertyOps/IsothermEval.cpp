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

#include "IsothermEval.H"

#include "thermo/Database.H"
#include "thermo/adsorbent/AdsorbentRegistry.H"

#include <algorithm>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace Choupo {

namespace fs = std::filesystem;

namespace {

// The AdsorbentRegistry is loaded explicitly by choupoSolve at start-up;
// choupoProps loads it here, on first use by an adsorption op --- still an
// EXPLICIT call site (never a static initialiser), just a lazy one so the
// props binary pays nothing when no adsorption op runs.
void ensureAdsorbentsLoaded()
{
    static bool done = false;
    if (done) return;
    done = true;
    const std::string& root = Database::currentRoot();
    if (!root.empty()) AdsorbentRegistry::loadFrom(root);
}

// Locate the raw record file the loaded model came from --- the case-local
// overlay first (same walk-up as AdsorbentRegistry::byName), else the
// standards catalogue.  Used by gate (c) to pin loader vs record.
std::string recordPathFor(const std::string& adsorbent,
                          const std::string& adsorbate)
{
    fs::path p = fs::current_path();
    for (int up = 0; up < 6; ++up)
    {
        const fs::path cand = p / "constant" / "parameters" / "adsorption"
            / "equilibria" / adsorbent / (adsorbate + ".dat");
        if (fs::exists(cand)) return cand.string();
        if (!p.has_parent_path()) break;
        p = p.parent_path();
    }
    const fs::path std_ = fs::path(Database::currentRoot()) / "standards"
        / "parameters" / "adsorption" / "equilibria" / adsorbent
        / (adsorbate + ".dat");
    return std_.string();
}

std::string fmtG(scalar v)
{
    std::ostringstream os;
    os << std::setprecision(10) << v;
    return os.str();
}

} // anonymous namespace

int IsothermEval::run(const DictPtr& dict,
                      const ThermoPackage& /*thermo*/,
                      int verbosity)
{
    ensureAdsorbentsLoaded();
    diag_.clear();

    const std::string adsName = dict->lookupWord("adsorbent");
    const std::string species = dict->lookupWord("adsorbate");

    const Adsorbent& ads = AdsorbentRegistry::byName(adsName);
    const IsothermModel* iso = ads.isotherm(species);
    if (!iso)
        throw std::runtime_error("isothermEval: adsorbent '" + adsName
            + "' carries NO equilibrium record for '" + species
            + "' --- a species with no record adsorbs nothing; there is "
            "nothing to evaluate.");

    // ---- grid (RAW canonical SI: T [K], p [Pa]) ---------------------------
    auto grid = dict->subDict("grid");
    const std::vector<scalar> Ts = grid->lookupList("T");
    const std::vector<scalar> ps = grid->lookupList("p");
    if (Ts.empty() || ps.empty())
        throw std::runtime_error("isothermEval: grid.T and grid.p must be "
                                 "non-empty lists (T in K, p in Pa)");
    for (scalar T : Ts) if (T <= 0.0)
        throw std::runtime_error("isothermEval: grid.T must be positive "
                                 "absolute temperatures [K]");
    for (scalar p : ps) if (p <= 0.0)
        throw std::runtime_error("isothermEval: grid.p must be positive "
                                 "partial pressures [Pa]");
    std::vector<scalar> psSorted = ps;
    std::sort(psSorted.begin(), psSorted.end());

    // ---- optional unit-invariance twin (gate d) ---------------------------
    const IsothermModel* twin = nullptr;
    std::string twinName;
    if (dict->found("unitTwin"))
    {
        twinName = dict->lookupWord("unitTwin");
        const Adsorbent& tw = AdsorbentRegistry::byName(twinName);
        twin = tw.isotherm(species);
        if (!twin)
            throw std::runtime_error("isothermEval: unitTwin '" + twinName
                + "' carries no record for '" + species + "'");
        if (twin->pressureBasis() == iso->pressureBasis())
            throw std::runtime_error("isothermEval: unitTwin '" + twinName
                + "' declares the SAME pressureBasis ('" + iso->pressureBasis()
                + "') as '" + adsName + "' --- the invariance gate needs a "
                "twin in a DIFFERENT basis, otherwise it proves nothing");
    }

    if (verbosity >= 2)
    {
        std::cout << "\n=========================  isothermEval  ===========================\n"
                  << "  Pair:        " << species << " on " << adsName
                  << "   (model " << iso->model()
                  << ", pressureBasis " << iso->pressureBasis() << ")\n"
                  << "  Grid:        " << Ts.size() << " temperature(s) x "
                  << ps.size() << " pressure(s)   [K, Pa]\n"
                  << "  tRef:        " << iso->tRef() << " K\n";
    }

    // ---- q(T, p) table + per-T KPIs ---------------------------------------
    std::string csvPath;
    if (dict->found("output"))
        csvPath = dict->subDict("output")->lookupWordOrDefault("file", "");
    std::ofstream csv;
    if (!csvPath.empty())
    {
        csv.open(csvPath);
        csv << "T,p,q\n";                       // K, Pa, mol/kg
    }

    diag_["tRef"] = iso->tRef();
    const bool saturates = iso->saturates();
    if (saturates) diag_["qsat"] = iso->q_sat();

    bool monotonic = true;
    for (std::size_t i = 0; i < Ts.size(); ++i)
    {
        const scalar T = Ts[i];
        const std::string k = "_T" + std::to_string(i);
        diag_["T" + std::to_string(i)] = T;
        diag_["henry" + k] = iso->dq_dp(T, 0.0);              // mol/kg/Pa
        diag_["b"     + k] = iso->affinity(T);                // 1/declared-p

        scalar qPrev = -1.0;
        for (scalar p : psSorted)
        {
            const scalar q = iso->q(T, p);
            if (q < qPrev - 1.0e-14 * std::max(std::abs(qPrev), scalar(1)))
                monotonic = false;
            qPrev = q;
            if (csv.is_open())
                csv << fmtG(T) << "," << fmtG(p) << "," << fmtG(q) << "\n";
        }

        if (verbosity >= 3)
        {
            std::cout << "    T = " << std::fixed << std::setprecision(2) << T
                      << " K:  henryLimit = " << std::scientific
                      << std::setprecision(6) << iso->dq_dp(T, 0.0)
                      << " mol/kg/Pa   b(T) = " << iso->affinity(T)
                      << " [1/" << (iso->pressureBasis() == "partialPressureBar"
                                    ? "bar" : "Pa") << "]\n";
        }
    }

    // =======================  THE GATES  ===================================
    bool allPass = true;

    // (a) HENRY LIMIT: q(T, p_low)/p_low -> dq_dp(T, 0) at p_low = 1e-3 Pa
    //     (= 1e-3 * p_ref with p_ref = 1 Pa, the canonical-SI unit pressure).
    //     For Langmuir the relative deviation is b*p_low --- O(1e-7) for any
    //     catalogued affinity; for Henry it is exactly 0.
    {
        const scalar pLow = 1.0e-3;                            // [Pa]
        scalar maxDev = 0.0;
        for (scalar T : Ts)
        {
            const scalar H = iso->dq_dp(T, 0.0);
            if (H <= 0.0)
                throw std::runtime_error("isothermEval: henryLimit(T) <= 0 at T = "
                    + fmtG(T) + " K --- a broken record");
            const scalar slope = iso->q(T, pLow) / pLow;
            maxDev = std::max(maxDev, std::abs(slope - H) / H);
        }
        const bool pass = maxDev <= 1.0e-6;
        allPass = allPass && pass;
        diag_["gate_henry"]        = pass ? 1.0 : 0.0;
        diag_["gate_henry_maxdev"] = maxDev;
        if (verbosity >= 2)
            std::cout << "  gate (a) henry limit:      "
                      << (pass ? "PASS" : "FAIL") << "   max rel dev "
                      << std::scientific << std::setprecision(3) << maxDev
                      << "  (p_low = 1e-3 Pa, tol 1e-6)\n";
    }

    // (b) SATURATION: monotonic in p, and q -> q_sat at p_big with
    //     b(T)*p_big = 1e4 (theta = 0.9999; tolerance 2e-4 leaves margin).
    //     A henry record has NO saturation --- announced, not pretended.
    if (saturates)
    {
        scalar maxGap = 0.0;
        for (scalar T : Ts)
        {
            const scalar bPa = iso->affinity(T) * iso->pScale();  // 1/Pa
            if (bPa <= 0.0)
                throw std::runtime_error("isothermEval: affinity(T) <= 0 on a "
                    "saturating record --- broken");
            const scalar pBig = 1.0e4 / bPa;
            const scalar q    = iso->q(T, pBig);
            if (q > iso->q_sat() * (1.0 + 1.0e-12))
            {
                maxGap = 1.0;                    // overshooting q_sat: broken
                continue;
            }
            maxGap = std::max(maxGap, (iso->q_sat() - q) / iso->q_sat());
        }
        const bool pass = monotonic && maxGap <= 2.0e-4;
        allPass = allPass && pass;
        diag_["gate_saturation"]        = pass ? 1.0 : 0.0;
        diag_["gate_saturation_maxgap"] = maxGap;
        diag_["gate_monotonic"]         = monotonic ? 1.0 : 0.0;
        if (verbosity >= 2)
            std::cout << "  gate (b) saturation:       "
                      << (pass ? "PASS" : "FAIL") << "   max (qsat-q)/qsat "
                      << std::scientific << std::setprecision(3) << maxGap
                      << " at theta=0.9999 (tol 2e-4); monotonic "
                      << (monotonic ? "yes" : "NO") << "\n";
    }
    else
    {
        diag_["gate_monotonic"] = monotonic ? 1.0 : 0.0;
        allPass = allPass && monotonic;
        if (verbosity >= 2)
            std::cout << "  gate (b) saturation:       skipped -- '"
                      << iso->model() << "' declares NO saturation "
                      "(saturates() = false); monotonicity still checked ("
                      << (monotonic ? "yes" : "NO") << ")\n";
    }

    // (c) ANCHOR PIN: the loaded model at tRef reproduces the record's RAW
    //     anchor parameter (b_298 / H_298) to 1e-12 --- loader vs record.
    {
        auto record = Dictionary::fromFile(recordPathFor(adsName, species));
        auto params = record->subDict("parameters");
        scalar raw = 0.0, loaded = 0.0;
        if (iso->model() == "langmuir")
        {
            raw    = params->lookupScalar("b_298");
            loaded = iso->affinity(iso->tRef());
        }
        else if (iso->model() == "henry")
        {
            raw    = params->lookupScalar("H_298");
            // H(tRef) in the declared basis = dq_dp / pScale (both per Pa).
            loaded = iso->dq_dp(iso->tRef(), 0.0) / iso->pScale();
        }
        else
            throw std::runtime_error("isothermEval: gate (c) knows no anchor "
                "key for model '" + iso->model() + "'");
        const scalar dev = std::abs(loaded - raw) / std::abs(raw);
        const bool pass = dev <= 1.0e-12;
        allPass = allPass && pass;
        diag_["gate_pin"]     = pass ? 1.0 : 0.0;
        diag_["gate_pin_dev"] = dev;
        if (verbosity >= 2)
            std::cout << "  gate (c) anchor pin:       "
                      << (pass ? "PASS" : "FAIL") << "   |b(tRef)-b_ref|/b_ref = "
                      << std::scientific << std::setprecision(3) << dev
                      << "  (tol 1e-12)\n";
    }

    // (d) UNIT INVARIANCE: same physics declared in a different pressure
    //     basis must evaluate identically at every grid point (1e-12 rel).
    if (twin)
    {
        scalar maxDev = 0.0;
        for (scalar T : Ts)
            for (scalar p : ps)
            {
                const scalar qa = iso ->q(T, p);
                const scalar qb = twin->q(T, p);
                const scalar den = std::max(std::abs(qa), 1.0e-300);
                maxDev = std::max(maxDev, std::abs(qa - qb) / den);
            }
        const bool pass = maxDev <= 1.0e-12;
        allPass = allPass && pass;
        diag_["gate_twin"]        = pass ? 1.0 : 0.0;
        diag_["gate_twin_maxdev"] = maxDev;
        if (verbosity >= 2)
            std::cout << "  gate (d) unit invariance:  "
                      << (pass ? "PASS" : "FAIL") << "   max rel dev vs '"
                      << twinName << "' (" << twin->pressureBasis() << ") = "
                      << std::scientific << std::setprecision(3) << maxDev
                      << "  (tol 1e-12)\n";
    }

    diag_["gates_pass"] = allPass ? 1.0 : 0.0;
    diag_["n_T"] = static_cast<scalar>(Ts.size());
    diag_["n_p"] = static_cast<scalar>(ps.size());

    if (verbosity >= 2)
    {
        if (!csvPath.empty())
            std::cout << "  q(T,p) table:              " << csvPath << "  ("
                      << Ts.size() * ps.size() << " points)\n";
        std::cout << "  ALL GATES:                 "
                  << (allPass ? "PASS" : "*** FAIL ***") << "\n"
                  << "=====================================================================\n\n";
    }

    return allPass ? 0 : 1;
}

} // namespace Choupo
