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

#include "FitBinaryPair.H"
#include "solver/NewtonND.H"

#include <chrono>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <streambuf>

namespace Choupo {

namespace {

std::string isoDateUtc()
{
    using namespace std::chrono;
    auto t  = system_clock::to_time_t(system_clock::now());
    std::tm tm{}; gmtime_r(&t, &tm);
    std::ostringstream os;
    os << std::put_time(&tm, "%Y-%m-%d");
    return os.str();
}

} // anonymous

FitBinaryPair::FitBinaryPair(const DictPtr& d)
{
    pairName_  = d->lookupWord("pair");
    auto dash  = pairName_.find('-');
    if (dash == std::string::npos || dash == 0 || dash + 1 == pairName_.size())
        throw std::runtime_error("fitBinaryPair: 'pair' must be '<c1>-<c2>'");
    comp1_    = pairName_.substr(0, dash);
    comp2_    = pairName_.substr(dash + 1);
    dataPath_ = d->lookupWord("data");
    unitName_ = d->lookupWord("unit");

    if (d->found("maxIter"))   maxIter_   = static_cast<int>(d->lookupScalar("maxIter"));
    if (d->found("tolerance")) tolerance_ = d->lookupScalar("tolerance");
    if (d->found("fdStep"))    fdStep_    = d->lookupScalar("fdStep");
    if (d->found("lambda0"))   lambda0_   = d->lookupScalar("lambda0");
}

int FitBinaryPair::run()
{
    if (!simulator_)      throw std::runtime_error("fitBinaryPair: simulator not set");
    if (!flowsheetDict_)  throw std::runtime_error("fitBinaryPair: flowsheetDict not set");
    if (!thermoDict_)     throw std::runtime_error("fitBinaryPair: thermoDict not set");

    // -----------------------------------------------------------------
    // 1.  Load and unpack the experimental dataset.
    //     Two-column flat list:  (x_1  T_exp  x_1  T_exp... )
    // -----------------------------------------------------------------
    auto expDict  = Dictionary::fromFile(dataPath_);
    auto flat     = expDict->lookupList("data");
    if (flat.empty() || flat.size() % 2 != 0)
        throw std::runtime_error("fitBinaryPair: dataset 'data' list must be"
            " non-empty and have an even number of entries (x_1 T pairs)");
    const std::size_t N = flat.size() / 2;
    sVector xExp(N), tExp(N);
    for (std::size_t i = 0; i < N; ++i)
    {
        xExp[i] = flat[2*i    ];
        tExp[i] = flat[2*i + 1];
    }

    // -----------------------------------------------------------------
    // 2.  Locate the binary pair in the thermoPackage.
    // -----------------------------------------------------------------
    auto activityDict = thermoDict_->subDict("activityModel");
    auto pairsList    = activityDict->lookupDictList("pairs");
    int pairIdx = -1;
    for (std::size_t k = 0; k < pairsList.size(); ++k)
    {
        const auto i = pairsList[k]->lookupWord("i");
        const auto j = pairsList[k]->lookupWord("j");
        if ((i == comp1_ && j == comp2_) || (i == comp2_ && j == comp1_))
        { pairIdx = static_cast<int>(k); break; }
    }
    if (pairIdx < 0)
        throw std::runtime_error("fitBinaryPair: pair '" + pairName_
            + "' not found in thermoPackage.activityModel.pairs");

    const std::string pp =
        "activityModel.pairs[" + std::to_string(pairIdx) + "].";

    // -----------------------------------------------------------------
    // 3.  Find which stream feeds the named unit (from the flowsheet).
    // -----------------------------------------------------------------
    auto tmplUnits = flowsheetDict_->lookupDictList("units");
    std::string feedStream;
    for (const auto& u : tmplUnits)
        if (u->lookupWord("name") == unitName_)
        { feedStream = u->lookupWord("in"); break; }
    if (feedStream.empty())
        throw std::runtime_error("fitBinaryPair: unit '" + unitName_
            + "' not found in flowsheetDict (or has no 'in' field)");

    // The composition block in a stream may be named either
    // `molarComposition` (preferred) or `composition` (legacy
    // alias) --- inspect the first per-row reload to decide which one
    // we mutate.  Both are mole fractions internally, so the path
    // syntax is identical, only the leaf name differs.
    std::string compKey = "composition";
    {
        auto probe = Dictionary::fromFile(flowsheetDict_->sourceName());
        auto streams = probe->subDict("streams");
        auto fd = streams->subDict(feedStream);
        if (fd->found("molarComposition"))   compKey = "molarComposition";
        else if (fd->found("massComposition"))
            throw std::runtime_error("fitBinaryPair: stream '" + feedStream +
                "' uses massComposition --- not supported for fitting"
                " (the data table is in mole fractions); switch to"
                " molarComposition");
    }
    const std::string cp1 =
        "streams." + feedStream + "." + compKey + "." + comp1_;
    const std::string cp2 =
        "streams." + feedStream + "." + compKey + "." + comp2_;

    // -----------------------------------------------------------------
    // 4.  Initial parameter vector from the current thermoPackage.
    // -----------------------------------------------------------------
    sVector params(4);
    params[0] = pairsList[pairIdx]->lookupScalar("a_ij");
    params[1] = pairsList[pairIdx]->lookupScalar("b_ij");
    params[2] = pairsList[pairIdx]->lookupScalar("a_ji");
    params[3] = pairsList[pairIdx]->lookupScalar("b_ji");

    // -----------------------------------------------------------------
    // 5.  Forward model + residuals + chi^2.
    // -----------------------------------------------------------------
    auto applyParams = [&](const sVector& p) {
        thermoDict_->setScalarAtPath(pp + "a_ij", p[0]);
        thermoDict_->setScalarAtPath(pp + "b_ij", p[1]);
        thermoDict_->setScalarAtPath(pp + "a_ji", p[2]);
        thermoDict_->setScalarAtPath(pp + "b_ji", p[3]);
    };

    auto forward = [&](const sVector& p) -> sVector {
        applyParams(p);
        sVector tp(N, std::numeric_limits<scalar>::quiet_NaN());

        // Silence inner solver/flowsheet output -- a single LM step does
        //   N points · (1 residual + 2·4 FD probes) ≈ 100 bubble-T solves,
        // and each emits a full result block.  We redirect cout/cerr to a
        // throw-away sink for the duration of the forward evaluation.
        std::ostringstream sink;
        auto* coutBuf = std::cout.rdbuf(sink.rdbuf());
        auto* cerrBuf = std::cerr.rdbuf(sink.rdbuf());

        for (std::size_t i = 0; i < N; ++i)
        {
            auto fs = Dictionary::fromFile(flowsheetDict_->sourceName());
            fs->setScalarAtPath(cp1,       xExp[i]);
            fs->setScalarAtPath(cp2, 1.0 - xExp[i]);
            try {
                auto result = simulator_(fs);
                auto itU = result.kpis.find(unitName_);
                if (itU == result.kpis.end()) continue;
                auto itK = itU->second.find("T_bubble");
                if (itK == itU->second.end()) continue;
                tp[i] = itK->second;
            }
            catch (const std::exception&) { /* leave as NaN */ }
        }

        std::cout.rdbuf(coutBuf);
        std::cerr.rdbuf(cerrBuf);
        return tp;
    };

    auto residuals = [&](const sVector& p) -> sVector {
        auto tp = forward(p);
        sVector r(N);
        for (std::size_t i = 0; i < N; ++i)
            r[i] = std::isfinite(tp[i]) ? (tp[i] - tExp[i]) : 1.0e3;  // huge penalty on failure
        return r;
    };

    auto chi2 = [](const sVector& r) {
        scalar s = 0;
        for (auto v : r) s += v * v;
        return s;
    };

    // -----------------------------------------------------------------
    // 6.  Levenberg-Marquardt loop.
    // -----------------------------------------------------------------
    std::cout << "\n=========================  fitBinaryPair  =========================\n"
              << "  pair:        " << pairName_ << "  (" << comp1_ << "/" << comp2_ << ")\n"
              << "  dataset:     " << dataPath_ << "  (" << N << " points)\n"
              << "  unit:        " << unitName_ << "   feed stream: " << feedStream << "\n"
              << "  max iter:    " << maxIter_ << "   tol: " << tolerance_
              << "   fd step: " << fdStep_ << "   λ0: " << lambda0_ << "\n"
              << "  initial:     a_ij=" << params[0] << "  b_ij=" << params[1]
              << "  a_ji=" << params[2] << "  b_ji=" << params[3] << "\n"
              << "===================================================================\n";

    sVector r0   = residuals(params);
    scalar  best = chi2(r0);
    scalar  lam  = lambda0_;

    std::cout << "\n  iter     chi^2          RMS(K)     λ         step\n"
              << "  ----  ------------  ----------  --------  --------\n"
              << std::scientific << std::setprecision(4)
              << "  init  " << std::setw(12) << best
              << "  " << std::setw(10) << std::sqrt(best / N)
              << "  " << std::setw(8) << lam << "\n";

    int conv = 0;  // 0 not yet, 1 chi^2 plateau, 2 max iter

    for (int it = 1; it <= maxIter_; ++it)
    {
        // ----- finite-difference Jacobian (central) ------------------
        std::vector<sVector> J(N, sVector(4));
        for (int k = 0; k < 4; ++k)
        {
            const scalar h = std::max<scalar>(1.0, std::abs(params[k])) * fdStep_;
            auto pP = params; pP[k] += h;
            auto pM = params; pM[k] -= h;
            const auto rP = residuals(pP);
            const auto rM = residuals(pM);
            for (std::size_t i = 0; i < N; ++i)
                J[i][k] = (rP[i] - rM[i]) / (2 * h);
        }

        // ----- normal equations:  (J^T J + λ diag) · Δ = − J^T r ------
        std::vector<sVector> JtJ(4, sVector(4, 0.0));
        sVector              Jtr(4, 0.0);
        for (int i = 0; i < 4; ++i)
        {
            for (int j = 0; j < 4; ++j)
                for (std::size_t n = 0; n < N; ++n) JtJ[i][j] += J[n][i] * J[n][j];
            for (std::size_t n = 0; n < N; ++n)     Jtr[i]    += J[n][i] * r0[n];
        }
        for (int i = 0; i < 4; ++i) JtJ[i][i] *= (1.0 + lam);

        sVector neg(4); for (int i = 0; i < 4; ++i) neg[i] = -Jtr[i];
        sVector delta = solver::gaussSolve(JtJ, neg);

        // ----- trial step --------------------------------------------
        sVector trial(4);
        for (int i = 0; i < 4; ++i) trial[i] = params[i] + delta[i];
        const auto rT  = residuals(trial);
        const scalar c2T = chi2(rT);

        scalar stepNorm = 0;
        for (int i = 0; i < 4; ++i) stepNorm += delta[i] * delta[i];
        stepNorm = std::sqrt(stepNorm);

        std::cout << "  " << std::setw(4) << it
                  << "  " << std::setw(12) << c2T
                  << "  " << std::setw(10) << std::sqrt(c2T / N)
                  << "  " << std::setw(8) << lam
                  << "  " << std::setw(8) << stepNorm
                  << "\n";

        if (c2T < best)
        {
            const scalar rel = (best - c2T) / std::max<scalar>(best, 1.0e-30);
            params = trial;
            r0     = rT;
            best   = c2T;
            lam   /= 3.0;
            if (rel < tolerance_) { conv = 1; break; }
        }
        else
        {
            lam *= 5.0;
            if (lam > 1.0e10) { conv = 0; break; }
        }
    }
    if (!conv) conv = 2;

    // Make sure thermoDict carries the final accepted parameters
    applyParams(params);

    // -----------------------------------------------------------------
    // 7.  Final report + write proposal file.
    // -----------------------------------------------------------------
    std::cout << "\n=========================  Fit Result  =============================\n"
              << "  status:        " << (conv == 1 ? "converged (relative tolerance)"
                                   :  conv == 2 ? "stopped at maxIter"
                                                : "λ blew up — fit failed") << "\n"
              << "  chi^2:         " << best << "\n"
              << "  RMS error:     " << std::sqrt(best / N) << " K\n"
              << "  fitted params:\n"
              << std::fixed << std::setprecision(6)
              << "    a_ij = " << params[0] << "\n"
              << "    b_ij = " << params[1] << "\n"
              << "    a_ji = " << params[2] << "\n"
              << "    b_ji = " << params[3] << "\n";

    // Per-point breakdown
    const auto tFinal = forward(params);
    std::cout << "\n     i      x_1     T_exp      T_pred      ΔT\n"
              << "  ----  -------  ---------  ---------  --------\n";
    for (std::size_t i = 0; i < N; ++i)
        std::cout << "  " << std::setw(4) << i
                  << "  " << std::setw(7) << std::setprecision(4) << xExp[i]
                  << "  " << std::setw(9) << std::setprecision(3) << tExp[i]
                  << "  " << std::setw(9) << std::setprecision(3) << tFinal[i]
                  << "  " << std::setw(8) << std::setprecision(4)
                          << (tFinal[i] - tExp[i]) << "\n";
    std::cout << "===================================================================\n\n";

    // Proposal file in the canonical research-workflow location:
    //   constant/binaryPairs/<model>/<c1>-<c2>.fit-<date>.dat
    // (Same convention as process04_research_workflow.  The directory
    // is created if necessary -- the case may currently use inline pairs
    // and not yet have a constant/binaryPairs/ tree.)
    const std::string model =
        thermoDict_->subDict("activityModel")->lookupWord("model");
    namespace fs = std::filesystem;
    const fs::path outDir = fs::path("constant") / "binaryPairs" / model;
    std::error_code ec;
    fs::create_directories(outDir, ec);
    const std::string outPath =
        (outDir / (pairName_ + ".fit-" + isoDateUtc() + ".dat")).string();

    std::ofstream f(outPath);
    if (f)
    {
        f << "/*---------------------------------------------------------------------------*\\\n"
          << "  fitBinaryPair proposal -- pair " << pairName_
          << " -- model " << model
          << "\n  " << N << " data points -- chi^2 = " << best
          << "  RMS = " << std::sqrt(best / N) << " K\n"
          << "  Generated: " << isoDateUtc() << "\n"
          << "  Promote by:\n"
          << "      mv " << outPath
          << "  constant/binaryPairs/" << model << "/" << pairName_ << ".dat\n"
          << "\\*---------------------------------------------------------------------------*/\n\n"
          << "components  ( " << comp1_ << "  " << comp2_ << " );\n"
          << "model       " << model << ";\n\n"
          << "parameters\n{\n"
          << "    i           " << comp1_ << ";\n"
          << "    j           " << comp2_ << ";\n"
          << std::setprecision(8)
          << "    a_ij        " << params[0] << ";\n"
          << "    b_ij        " << params[1] << ";\n"
          << "    a_ji        " << params[2] << ";\n"
          << "    b_ji        " << params[3] << ";\n"
          << "    alpha       " << pairsList[pairIdx]->lookupScalarOrDefault("alpha", 0.30) << ";\n"
          << "}\n";
        std::cout << "  proposal written to: " << outPath << "\n\n";
    }
    else std::cerr << "fitBinaryPair: could not write " << outPath << "\n";

    return (conv == 1) ? 0 : 1;
}

} // namespace Choupo
