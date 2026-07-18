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

#include "FitParameters.H"
#include "core/Advisory.H"
#include "core/Constants.H"
#include "core/ThermoResolution.H"
#include "core/Units.H"
#include "thermo/Database.H"
#include "thermo/ThermoPackage.H"
#include "thermo/ThermoPackageBuilder.H"
#include "unitOperations/saturation/BubblePoint.H"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdlib>
#include <ctime>
#include <filesystem>
#include <map>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

namespace {

struct ParamSpec
{
    std::string path;
    scalar      value;
    scalar      lo;
    scalar      hi;
};

std::string isoDateUtc()
{
    using namespace std::chrono;
    auto t = system_clock::to_time_t(system_clock::now());
    std::tm tm{}; gmtime_r(&t, &tm);
    std::ostringstream os;
    os << std::put_time(&tm, "%Y-%m-%d");
    return os.str();
}

// Compute the residual vector at the current parameter values.
//
// Algorithm:
//   For each (x_1, T_exp) point in the dataset, build x = (x_1, 1-x_1),
//   run BubblePoint::compute(thermo, x, P_data), capture T_bub_model,
//   residual_i = T_bub_model - T_exp.
//
// If the bubble-T solver fails to converge at a point, we mark that
// row with a fixed 1.0e3 K penalty residual (NOT a NaN); the LM loop is
// tolerant of these and just inflates lambda.  Such points are counted
// (nFailed) and reported so they don't masquerade as a clean fit.
//
// chi2 = Σ residual_i^2.
scalar computeResiduals(const ThermoPackage& thermo,
                        scalar P_Pa,
                        const sVector& xData_first,
                        const sVector& tData_exp,
                        sVector& residualsOut,
                        int* nFailed = nullptr,
                        std::size_t i1 = 0,        // component carrying x
                        std::size_t i2 = 1)        // component carrying 1-x
{
    const std::size_t n = thermo.n();
    const std::size_t N = xData_first.size();
    residualsOut.assign(N, 0.0);
    scalar chi2 = 0.0;
    if (nFailed) *nFailed = 0;

    for (std::size_t k = 0; k < N; ++k)
    {
        sVector x(n, 0.0);
        x[i1] = xData_first[k];
        x[i2] = 1.0 - xData_first[k];

        auto r = BubblePoint::compute(thermo, x, P_Pa);
        scalar res = r.converged ? (r.T - tData_exp[k]) : 1.0e3;
        if (!r.converged && nFailed) ++(*nFailed);
        residualsOut[k] = res;
        chi2 += res * res;
    }
    return chi2;
}

// Invert a (small, dense, symmetric-positive-semidefinite) P-by-P matrix by
// Gauss-Jordan with partial pivoting.  Returns the inverse; sets `ok=false`
// if the matrix is (numerically) singular, and reports a crude condition
// number as the ratio of the largest to the smallest pivot magnitude met
// during elimination -- a cheap, honest identifiability proxy (NOT the true
// 2-norm condition number, hence labelled "pivot-ratio estimate").
std::vector<sVector> invertGaussJordan(std::vector<sVector> A,
                                       bool& ok, scalar& condEstimate)
{
    const std::size_t P = A.size();
    ok = true;
    condEstimate = 1.0;
    std::vector<sVector> Inv(P, sVector(P, 0.0));
    for (std::size_t i = 0; i < P; ++i) Inv[i][i] = 1.0;

    // SCALE-INVARIANT singular test: a pivot is "zero" relative to the matrix
    // magnitude, not relative to 1e-300 (subnormals).  Without this, a wildly
    // ill-conditioned J^T J (the very case this feature exists to catch)
    // inverts to garbage yet is reported as fine.
    scalar matScale = 0.0;
    for (std::size_t i = 0; i < P; ++i)
        for (std::size_t j = 0; j < P; ++j)
            matScale = std::max(matScale, std::abs(A[i][j]));
    const scalar pivTol = std::max(1.0e-12 * matScale, 1.0e-300);

    scalar pivMax = 0.0, pivMin = 1.0e300;
    for (std::size_t col = 0; col < P; ++col)
    {
        // Partial pivot: largest |A[row][col]| at or below the diagonal.
        std::size_t pr = col;
        scalar best = std::abs(A[col][col]);
        for (std::size_t r = col + 1; r < P; ++r)
            if (std::abs(A[r][col]) > best) { best = std::abs(A[r][col]); pr = r; }
        if (best < pivTol) { ok = false; condEstimate = 1.0e300; return Inv; }
        if (pr != col) { std::swap(A[pr], A[col]); std::swap(Inv[pr], Inv[col]); }

        scalar piv = A[col][col];
        pivMax = std::max(pivMax, std::abs(piv));
        pivMin = std::min(pivMin, std::abs(piv));
        for (std::size_t j = 0; j < P; ++j) { A[col][j] /= piv; Inv[col][j] /= piv; }
        for (std::size_t r = 0; r < P; ++r)
        {
            if (r == col) continue;
            scalar f = A[r][col];
            for (std::size_t j = 0; j < P; ++j)
            {
                A[r][j]   -= f * A[col][j];
                Inv[r][j] -= f * Inv[col][j];
            }
        }
    }
    condEstimate = (pivMin > 0.0) ? pivMax / pivMin : 1.0e300;
    return Inv;
}

// Two-sided 95% Student-t critical value.  Small embedded table for the
// common low-dof regime (where t >> 1.96 and it MATTERS); 1.96 for dof > 30.
// Pedagogically honest: a fit on 11 points with 4 params has dof = 7, where
// t = 2.365, not 1.96 -- so the CI is ~20% wider than the naive normal one.
scalar tCrit95(int dof)
{
    static const scalar tbl[] = {
        0.0,                                                       // dof 0 (unused)
        12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306,   // 1..8
        2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131, 2.120,    // 9..16
        2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064,    // 17..24
        2.060, 2.056, 2.052, 2.048, 2.045, 2.042                   // 25..30
    };
    if (dof <= 0)  return 0.0;
    if (dof <= 30) return tbl[dof];
    return 1.960;
}

// Solve  (J^T J + lambda*diag(J^T J)) * dp = -J^T r   by Gauss-Jordan.
// Returns dp in-place; throws if singular.
sVector solveDamped(const std::vector<sVector>& J,
                    const sVector& r,
                    scalar lambda)
{
    const std::size_t N = J.size();
    if (N == 0) return {};
    const std::size_t P = J[0].size();

    // Build A = J^T J + lambda * diag(J^T J),  b = -J^T r
    std::vector<sVector> A(P, sVector(P, 0.0));
    sVector b(P, 0.0);
    for (std::size_t i = 0; i < P; ++i)
    {
        for (std::size_t j = 0; j < P; ++j)
            for (std::size_t k = 0; k < N; ++k)
                A[i][j] += J[k][i] * J[k][j];
        for (std::size_t k = 0; k < N; ++k)
            b[i] -= J[k][i] * r[k];
    }
    for (std::size_t i = 0; i < P; ++i) A[i][i] *= (1.0 + lambda);

    // Gauss-Jordan elimination
    for (std::size_t i = 0; i < P; ++i)
    {
        scalar piv = A[i][i];
        if (std::abs(piv) < 1.0e-18)
            throw std::runtime_error("FitParameters: singular normal matrix "
                "--- check that parameters are independent");
        for (std::size_t j = 0; j < P; ++j) A[i][j] /= piv;
        b[i] /= piv;
        for (std::size_t r2 = 0; r2 < P; ++r2)
        {
            if (r2 == i) continue;
            scalar f = A[r2][i];
            for (std::size_t j = 0; j < P; ++j) A[r2][j] -= f * A[i][j];
            b[r2] -= f * b[i];
        }
    }
    return b;
}

} // anonymous

int FitParameters::run(const DictPtr& dict,
                       const ThermoPackage& /*initialThermo*/,
                       int verbosity)
{
    // Kind dispatch FIRST: the isotherm kind is pair-data regression --- it
    // never rebuilds a thermoPackage, so the thermoDict guard below does not
    // apply to it.
    if (dict->subDict("residual")->lookupWord("kind") == "isotherm")
        return runIsothermFit(dict, verbosity);

    // The AUTHORED v2 grammar is the ONE fit source (named-path mutation,
    // rebuilt natively per iteration).
    const DictPtr fitSource = authoredV2();
    if (!fitSource || !database())
        throw std::runtime_error(
            "fitParameters: needs the authored property dict + database (set "
            "by choupoProps main before .run()) --- a thermoPackage REBUILD "
            "per iteration is required for parameter regression");

    // -- mode (forum #62-64): fit (default) adjusts; evaluate only SCORES ----
    const std::string mode = dict->lookupWordOrDefault("mode", "fit");
    const bool evalMode = (mode == "evaluate");
    if (mode != "fit" && mode != "evaluate")
        throw std::runtime_error("fitParameters: mode must be `fit` or "
            "`evaluate` (got '" + mode + "')");

    // -- parameters --------------------------------------------------------
    //  evaluate: OPTIONAL.  Absent -> score the package AS ASSEMBLED (the
    //  normal case: "how good are the pairs I HAVE against MY data?").
    //  Present -> a pinned what-if; entries carry `value` (initial/min/max are
    //  fit vocabulary and refuse).
    std::vector<DictPtr> paramList;
    if (dict->hasDictList("parameters")) paramList = dict->lookupDictList("parameters");
    if (!evalMode && paramList.empty())
        throw std::runtime_error("fitParameters: 'parameters' list is empty");

    std::vector<ParamSpec> params;
    params.reserve(paramList.size());
    for (const auto& p : paramList)
    {
        ParamSpec ps;
        ps.path  = p->lookupWord("path");
        if (evalMode)
        {
            if (p->found("initial") || p->found("min") || p->found("max"))
                throw std::runtime_error("fitParameters(evaluate): `initial`/"
                    "`min`/`max` are FIT vocabulary -- a pinned evaluation "
                    "takes `value` only (path " + ps.path + ")");
            ps.value = p->lookupScalar("value");
            ps.lo = -1.0e30; ps.hi = 1.0e30;
        }
        else
        {
            ps.value = p->lookupScalar("initial");
            ps.lo    = p->found("min") ? p->lookupScalar("min") : -1.0e30;
            ps.hi    = p->found("max") ? p->lookupScalar("max") :  1.0e30;
        }
        params.push_back(ps);
    }
    const std::size_t P = params.size();

    // -- residual block ----------------------------------------------------
    auto resDict = dict->subDict("residual");
    const std::string kind = resDict->lookupWord("kind");
    if (kind != "T_bubble")
        throw std::runtime_error("fitParameters: only kind=T_bubble is "
                                 "supported  (got '" + kind + "')");
    const scalar P_data = resDict->lookupScalar("P", Dims::pressure);

    // -- explicit components (forum #63-3).  T_bubble historically assumed
    //  indices 0/1 -- an ORDER-DEPENDENT silent default.  evaluate REQUIRES
    //  the pair named; fit accepts absence with a deprecation warning.
    std::string comp1Name, comp2Name;
    if (resDict->found("components"))
    {
        const auto cl = resDict->lookupWordList("components");
        if (cl.size() != 2)
            throw std::runtime_error("fitParameters: residual.components must "
                "name exactly TWO components for kind=T_bubble");
        comp1Name = cl[0]; comp2Name = cl[1];
    }
    else if (evalMode)
        throw std::runtime_error("fitParameters(evaluate): residual.components "
            "is REQUIRED -- name the pair explicitly, e.g. "
            "`components ( ethanol water );` (the historical index-0/1 default "
            "is order-dependent and retired for new grammar)");
    else
        std::cerr << "[fitParameters] DEPRECATION: residual.components absent -- "
                     "assuming package components 0/1 (order-dependent).  Name "
                     "the pair explicitly.\n";

    // -- evaluate-mode guards: LM knobs and write-outputs are fit vocabulary --
    if (evalMode && dict->found("options"))
    {
        auto o = dict->subDict("options");
        for (const char* k : {"maxIter", "tolerance", "fdStep", "lambda0"})
            if (o->found(k))
                throw std::runtime_error(std::string("fitParameters(evaluate): "
                    "options.") + k + " is an LM knob -- evaluate adjusts "
                    "nothing and refuses fit vocabulary");
    }

    auto flat = resDict->lookupList("data");
    if (flat.empty() || flat.size() % 2 != 0)
        throw std::runtime_error("fitParameters: residual.data must be a "
                                 "flat (x1 T x1 T...) list of even length");
    const std::size_t N = flat.size() / 2;
    sVector xExp(N), tExp(N);
    for (std::size_t k = 0; k < N; ++k)
    {
        xExp[k] = flat[2*k    ];
        tExp[k] = flat[2*k + 1];
    }

    // -- options -----------------------------------------------------------
    int    maxIter = 40;
    scalar tol     = 1.0e-4;
    scalar fdStep  = 1.0e-3;
    scalar lambda  = 1.0e-3;
    if (dict->found("options"))
    {
        auto o = dict->subDict("options");
        if (o->found("maxIter"))   maxIter = static_cast<int>(o->lookupScalar("maxIter"));
        if (o->found("tolerance")) tol     = o->lookupScalar("tolerance");
        if (o->found("fdStep"))    fdStep  = o->lookupScalar("fdStep");
        if (o->found("lambda0"))   lambda  = o->lookupScalar("lambda0");
    }

    // -- output files ------------------------------------------------------
    std::string fitLogPath, parityPath, proposalPath;
    if (dict->found("output"))
    {
        auto o = dict->subDict("output");
        if (o->found("fit_log"))  fitLogPath  = o->lookupWord("fit_log");
        if (o->found("parity"))   parityPath  = o->lookupWord("parity");
        if (evalMode && (o->found("fit_log") || o->found("promote")
                         || o->found("proposal")))
            throw std::runtime_error("fitParameters(evaluate): read-only mode "
                "-- fit_log/promote/proposal are fit outputs; only `parity` "
                "is meaningful here");
        // Opt-in promote: write a binary-pair proposal .dat for the fitted
        // pair (the author's explicit act; the GUI never writes -- credo).
        // `auto` => the canonical constant/parameters/<model>/<pair>.fit-<date>.dat.
        if (o->found("proposal")) proposalPath = o->lookupWord("proposal");
    }

    // -- Build initial thermoPackage --------------------------------------
    // A DEEP copy of the thermoDict (forum #63-7): the old `work = thermoDict()`
    // was an ALIAS, so every setScalarAtPath of the LM landed in the SHARED
    // dict -- the fit contaminated the package for any operation after it in
    // the same propsDict.  The working tree is now genuinely private.
    DictPtr work = fitSource->deepCopy();
    // G3 (Codex-ratified 2026-07-18): when the case is v2, `work` IS the
    // authored thermophysicalPropertySystem -- the LM mutates it by the
    // NAMED v2 path (equilibrium.liquid.activityModel.binaryParameters.
    // <i>-<j>.<coef>, order-stable, never pairs[0]) and the copy passes
    // through the translator EVERY iteration, so the fit varies the source
    // grammar itself.  v1 flat dicts keep the exact old path.
    const bool v2Work = work->lookupWordOrDefault("recordType", "")
                        == "thermophysicalPropertySystem";
    auto buildThermo = [&](const std::vector<ParamSpec>& current)
    {
        for (const auto& ps : current)
            work->setScalarAtPath(ps.path, ps.value);
        // The builder's ONE dispatch serves the mutated authored copy
        // directly (native; the fit's inline pairs included).
        if (!v2Work)
            throw std::runtime_error("fitParameters: the case system must be"
                " the v2 grammar (recordType thermophysicalPropertySystem)"
                " -- every v1/flat form is retired.");
        return ThermoPackageBuilder::build(work, *database());
    };

    if (verbosity >= 2)
    {
        std::cout << "\n==========================  FitParameters  ==========================\n"
                  << "  Kind:        " << kind << "\n"
                  << "  Data:        " << N << " (x_1, T_exp) pairs at P = "
                  << (P_data/1.0e5) << " bar\n"
                  << "  Parameters:  " << P << "\n";
        for (const auto& ps : params)
            std::cout << "    " << ps.path << " = "
                      << std::fixed << std::setprecision(4) << ps.value
                      << "  [" << ps.lo << ", " << ps.hi << "]\n";
        std::cout << "  LM:  maxIter " << maxIter
                  << "   tol " << tol
                  << "   fdStep " << fdStep
                  << "   lambda0 " << lambda << "\n"
                  << "  --------------------------------------------------\n"
                  << "   iter      chi2          lambda     params\n";
    }

    std::ofstream logCsv;
    if (!fitLogPath.empty())
    {
        logCsv.open(fitLogPath);
        logCsv << "iter,chi2,lambda";
        for (const auto& ps : params) logCsv << "," << ps.path;
        logCsv << "\n";
    }

    // -- resolve the explicit component pair (indices in the BUILT package) --
    auto pairIdx = [&](const ThermoPackage& tp) -> std::pair<std::size_t,std::size_t> {
        if (comp1Name.empty()) return {0, 1};
        return { tp.indexOf(comp1Name), tp.indexOf(comp2Name) };
    };

    // ======================  MODE EVALUATE (forum #62-64)  =================
    //  Score parameters against the dataset WITHOUT adjusting them.  Honest
    //  statistics: penalty rows never enter sse/rms/aad/max; all-failed is an
    //  error; some-failed is a PARTIAL result with a loud warning.  Read-only.
    if (evalMode)
    {
        ThermoPackage thermo = buildThermo(params);   // pinned on the deep copy; absent = as-assembled
        const auto [i1, i2] = pairIdx(thermo);

        // ---- Consume the CANONICAL pair resolution (forum #62/#67) --------
        //  The assembled package recorded WHERE the scored pair came from
        //  (ThermoResolutionLog).  Evaluate inherits that artefact's origin /
        //  validity / promotedDespite and REPEATS the warning at consumption
        //  -- an override or a prediction never washes out between the
        //  catalogue and the verdict.  A pinned what-if replaces the
        //  artefact's numbers, so its provenance does NOT apply and we say so.
        const PairResolution* res = nullptr;
        if (params.empty())
        {
            const std::string n1 = thermo.comp(i1).name();
            const std::string n2 = thermo.comp(i2).name();
            for (const auto& e : ThermoResolutionLog::instance().entries())
                if ((e.i == n1 && e.j == n2) || (e.i == n2 && e.j == n1))
                { res = &e; break; }
        }
        int nOutside = 0;                       // data points outside declared validity
        bool validityDeclared = false;
        if (res && res->validity.temperature)
        {
            validityDeclared = true;
            for (std::size_t k = 0; k < N; ++k)
                if (tExp[k] < res->validity.temperature->lo
                 || tExp[k] > res->validity.temperature->hi)
                    ++nOutside;
        }
        if (res)
        {
            if (res->origin == Origin::predictive)
                AdvisoryLog::instance().add("provenance", "warning",
                    res->i + "-" + res->j,
                    "evaluate consumes a PREDICTIVE pair (" + res->source
                    + ") -- a model's prediction transcribed as a value, "
                    "not a regression against data");
            if (res->promotedDespite)
                AdvisoryLog::instance().add("provenance", "warning",
                    res->i + "-" + res->j,
                    "evaluate consumes a pair promoted DESPITE diagnostics "
                    "(identifiable " + std::to_string(res->promotedDespite->identifiable)
                    + "; reason \"" + res->promotedDespite->reason + "\"; by "
                    + res->promotedDespite->by + ", " + res->promotedDespite->date + ")");
        }
        if (nOutside > 0)
            AdvisoryLog::instance().add("validity", "warning",
                res->i + "-" + res->j,
                std::to_string(nOutside) + " of " + std::to_string(N)
                + " data point(s) lie OUTSIDE the pair's declared validity ["
                + std::to_string(res->validity.temperature->lo) + ", "
                + std::to_string(res->validity.temperature->hi)
                + "] K -- the verdict extrapolates the artefact");

        sVector r; int nFailed = 0;
        computeResiduals(thermo, P_data, xExp, tExp, r, &nFailed, i1, i2);

        scalar sse = 0.0, aad = 0.0, maxAbs = 0.0;
        std::size_t maxIdx = 0, nGood = 0;
        for (std::size_t k = 0; k < N; ++k)
        {
            if (std::abs(r[k]) >= 9.99e2) continue;      // penalty row: out of stats
            sse += r[k] * r[k];
            aad += std::abs(r[k]);
            if (std::abs(r[k]) > maxAbs) { maxAbs = std::abs(r[k]); maxIdx = k; }
            ++nGood;
        }
        if (nGood == 0)
            throw std::runtime_error("fitParameters(evaluate): EVERY bubble-T "
                "point failed to converge -- nothing to score (check P, the "
                "component pair, and the model parameters)");
        const scalar rms = std::sqrt(sse / scalar(nGood));
        aad /= scalar(nGood);

        if (!parityPath.empty())
        {
            std::ofstream pcsv(parityPath);
            pcsv << "x_1,T_exp,T_model,residual,status\n";
            for (std::size_t k = 0; k < N; ++k)
            {
                const bool bad = std::abs(r[k]) >= 9.99e2;
                pcsv << xExp[k] << "," << tExp[k] << ",";
                if (bad) pcsv << ",,nonconverged\n";
                else pcsv << (tExp[k] + r[k]) << "," << r[k] << ",ok\n";
            }
        }

        if (verbosity >= 2)
        {
            std::cout << "\n=====================  FitParameters (EVALUATE)  ====================\n"
                      << "  Pair:        " << thermo.comp(i1).name() << " / "
                      << thermo.comp(i2).name() << "   at P = " << (P_data/1.0e5) << " bar\n"
                      << "  Parameters:  " << (params.empty()
                          ? "package AS ASSEMBLED (nothing pinned)"
                          : std::to_string(params.size()) + " pinned (what-if)") << "\n";
            if (!params.empty())
                std::cout << "  Provenance:  pinned in the op -- the artefact's "
                             "provenance/validity do not apply to a what-if\n";
            else if (res)
            {
                std::cout << "  Provenance:  " << originToWord(res->origin)
                          << "  [" << res->status << ": " << res->source << "]";
                if (!res->method.empty()) std::cout << "  method " << res->method;
                if (res->validity.temperature)
                    std::cout << "  validity [" << res->validity.temperature->lo
                              << ", " << res->validity.temperature->hi << "] K";
                std::cout << "\n";
                if (res->promotedDespite)
                    std::cout << "  WARNING: pair promoted DESPITE diagnostics "
                              << "(identifiable " << res->promotedDespite->identifiable
                              << "; \"" << res->promotedDespite->reason << "\"; by "
                              << res->promotedDespite->by << ", "
                              << res->promotedDespite->date << ")\n";
                if (validityDeclared && nOutside > 0)
                    std::cout << "  WARNING: " << nOutside << " of " << N
                              << " data point(s) OUTSIDE the declared validity -- "
                                 "the verdict extrapolates the artefact\n";
            }
            else
                std::cout << "  Provenance:  no pair resolution recorded for this "
                             "pair in the assembled package\n";
            if (verbosity >= 3)
            {
                std::cout << "   x_1        T_exp      T_model    resid\n";
                for (std::size_t k = 0; k < N; ++k)
                {
                    std::cout << "   " << std::fixed << std::setprecision(4) << xExp[k]
                              << "   " << std::setprecision(2) << std::setw(8) << tExp[k];
                    if (std::abs(r[k]) >= 9.99e2) std::cout << "   nonconverged\n";
                    else std::cout << "   " << std::setw(8) << (tExp[k]+r[k])
                                   << "   " << std::showpos << r[k] << std::noshowpos << "\n";
                }
            }
            std::cout << "  --------------------------------------------------\n"
                      << "  sse = " << std::scientific << std::setprecision(4) << sse
                      << " K^2   rms = " << std::fixed << std::setprecision(4) << rms
                      << " K   aad = " << aad << " K\n"
                      << "  max|resid| = " << maxAbs << " K  (at x_1 = "
                      << xExp[maxIdx] << ")   n_data = " << N
                      << "   feasible = " << nGood << "\n";
            if (nFailed > 0)
                std::cout << "  WARNING: PARTIAL result -- " << nFailed
                          << " point(s) did not converge (status=nonconverged in "
                             "the parity CSV); statistics cover the feasible rows only\n";
            std::cout << "=====================================================================\n\n";
        }

        diag_.clear();
        diag_["mode_evaluate"]    = 1.0;
        diag_["sse"]              = sse;
        diag_["chi2"]             = sse;    // legacy alias, same feasible-only sum
        diag_["rms"]              = rms;
        diag_["aad"]              = aad;
        diag_["max_abs_resid"]    = maxAbs;
        diag_["max_resid_x1"]     = xExp[maxIdx];
        diag_["n_data"]           = scalar(N);
        diag_["n_feasible"]       = scalar(nGood);
        diag_["penalised_points"] = scalar(nFailed);
        diag_["partial"]          = (nFailed > 0) ? 1.0 : 0.0;
        // Canonical-resolution consumption (forum #62/#67): whether the scored
        // artefact DECLARES a validity domain, and how many data rows fall
        // outside it.  Only meaningful when the artefact's provenance applies
        // (nothing pinned) -- a what-if replaced the numbers, so no claim.
        if (params.empty())
        {
            diag_["validity_declared"] = validityDeclared ? 1.0 : 0.0;
            if (validityDeclared)
                diag_["n_outside_validity"] = scalar(nOutside);
        }
        headline_ = { "rms", "aad", "penalised_points" };
        if (nOutside > 0) headline_.push_back("n_outside_validity");
        return 0;
    }

    // -- LM loop -----------------------------------------------------------
    sVector r_curr;
    ThermoPackage thermo = buildThermo(params);
    const auto [iF1, iF2] = pairIdx(thermo);
    scalar chi2 = computeResiduals(thermo, P_data, xExp, tExp, r_curr,
                                   nullptr, iF1, iF2);

    auto logIter = [&](int iter)
    {
        if (verbosity >= 2)
        {
            std::cout << "  " << std::setw(4) << iter
                      << "   " << std::scientific << std::setprecision(5)
                      << std::setw(13) << chi2
                      << "   " << std::setprecision(2)
                      << std::setw(9) << lambda;
            for (const auto& ps : params)
                std::cout << "  " << std::fixed << std::setprecision(4)
                          << ps.value;
            std::cout << "\n";
        }
        if (logCsv.is_open())
        {
            logCsv << iter << "," << chi2 << "," << lambda;
            for (const auto& ps : params) logCsv << "," << ps.value;
            logCsv << "\n";
        }
    };
    logIter(0);

    bool converged = false;
    int iter = 0;
    for (iter = 1; iter <= maxIter; ++iter)
    {
        // Build Jacobian by forward-difference.
        std::vector<sVector> J(N, sVector(P, 0.0));
        for (std::size_t j = 0; j < P; ++j)
        {
            scalar p0 = params[j].value;
            scalar h  = fdStep * std::max(std::abs(p0), 1.0);
            params[j].value = p0 + h;
            ThermoPackage thermoH = buildThermo(params);
            sVector r_h;
            computeResiduals(thermoH, P_data, xExp, tExp, r_h, nullptr, iF1, iF2);
            for (std::size_t k = 0; k < N; ++k)
                J[k][j] = (r_h[k] - r_curr[k]) / h;
            params[j].value = p0;
        }

        // Solve LM step, clamp to bounds, evaluate.
        sVector dp;
        try { dp = solveDamped(J, r_curr, lambda); }
        catch (...) { lambda *= 10.0; logIter(iter); continue; }

        std::vector<ParamSpec> trial = params;
        for (std::size_t j = 0; j < P; ++j)
        {
            trial[j].value = std::clamp(trial[j].value + dp[j],
                                        trial[j].lo, trial[j].hi);
        }
        ThermoPackage thermoTrial = buildThermo(trial);
        sVector r_trial;
        scalar chi2_trial = computeResiduals(thermoTrial, P_data,
                                              xExp, tExp, r_trial,
                                              nullptr, iF1, iF2);

        if (chi2_trial < chi2)
        {
            // Accept step.
            scalar rel = std::abs(chi2 - chi2_trial)
                       / std::max(chi2, 1.0e-30);
            params = trial;
            chi2 = chi2_trial;
            r_curr = r_trial;
            thermo = std::move(thermoTrial);
            lambda *= 0.7;
            logIter(iter);
            if (rel < tol) { converged = true; break; }
        }
        else
        {
            // Reject, inflate damping.
            lambda *= 2.5;
            if (lambda > 1.0e12)
                throw std::runtime_error("FitParameters: lambda diverged --- "
                    "bad initial guess or non-identifiable parameters");
            logIter(iter);
        }
    }

    // -- Parity CSV --------------------------------------------------------
    //  The NAMED pair's indices (iF1/iF2, resolved for the LM above), never
    //  slots 0/1 (forum #87-P1: in a package whose components are not ordered
    //  (LK, HK) the parity plotted a DIFFERENT pair than the one optimised).
    if (!parityPath.empty())
    {
        std::ofstream pcsv(parityPath);
        pcsv << "x_1,T_exp,T_model,residual\n";
        for (std::size_t k = 0; k < N; ++k)
        {
            sVector x(thermo.n(), 0.0);
            x[iF1] = xExp[k]; x[iF2] = 1.0 - xExp[k];
            auto br = BubblePoint::compute(thermo, x, P_data);
            const scalar Tm = br.converged ? br.T : std::nan("");
            pcsv << xExp[k] << "," << tExp[k] << "," << Tm
                 << "," << (Tm - tExp[k]) << "\n";
        }
    }

    if (verbosity >= 2)
    {
        std::cout << "  --------------------------------------------------\n"
                  << "  Converged:   " << (converged ? "yes" : "max iters reached")
                  << "   after " << iter << " iterations\n"
                  << "  Final chi2:  " << std::scientific << std::setprecision(5)
                  << chi2 << "\n"
                  << "  Fitted parameters:\n";
        for (const auto& ps : params)
            std::cout << "    " << ps.path << " = "
                      << std::fixed << std::setprecision(4) << ps.value << "\n";
    }

    // -- Identifiability statistics (the bar we hold: a fit with no CIs and an
    //    unexamined correlation matrix is a guess wearing a "converged"
    //    badge).  Recompute J at the converged params, form J^T J, invert it,
    //    and report standard errors, 95% (Student-t) confidence intervals,
    //    the parameter correlation matrix, and a condition-number proxy.
    //    These are emitted into the choupoProps result JSON for the GUI Fit
    //    view -- the engineer JUDGES the fit; nothing here certifies it.
    int nFailed = 0;
    {
        sVector r_final;
        computeResiduals(thermo, P_data, xExp, tExp, r_final, &nFailed, iF1, iF2);

        std::vector<sVector> Jf(N, sVector(P, 0.0));
        for (std::size_t j = 0; j < P; ++j)
        {
            scalar p0 = params[j].value;
            scalar h  = fdStep * std::max(std::abs(p0), 1.0);
            params[j].value = p0 + h;
            ThermoPackage thH = buildThermo(params);
            sVector rh;
            computeResiduals(thH, P_data, xExp, tExp, rh, nullptr, iF1, iF2);
            for (std::size_t k = 0; k < N; ++k) Jf[k][j] = (rh[k] - r_final[k]) / h;
            params[j].value = p0;
        }
        // Restore the converged thermo (the FD probes mutated `work`).
        thermo = buildThermo(params);

        // J^T J
        std::vector<sVector> JtJ(P, sVector(P, 0.0));
        for (std::size_t i = 0; i < P; ++i)
            for (std::size_t j = 0; j < P; ++j)
                for (std::size_t k = 0; k < N; ++k)
                    JtJ[i][j] += Jf[k][i] * Jf[k][j];

        bool ok = false; scalar cond = 1.0e300;
        auto Cinv = invertGaussJordan(JtJ, ok, cond);

        // EXCLUDE infeasible (penalty) rows from the REPORTED statistics.  The LM
        // uses a fixed 1e3-K penalty residual to steer away from non-converging
        // regions; folding (1e3)^2 into sigma^2 = chi2/dof would silently wreck
        // every standard error / CI whenever a row is infeasible (a no-silent-
        // crutch violation).  Score sigma^2 + rms on the FEASIBLE rows only.
        scalar chi2Feasible = 0.0; int nGood = 0;
        for (std::size_t k = 0; k < N; ++k)
            if (std::abs(r_final[k]) < 9.99e2) { chi2Feasible += r_final[k] * r_final[k]; ++nGood; }
        const int dof = nGood - static_cast<int>(P);
        const scalar sigma2 = (dof > 0) ? chi2Feasible / static_cast<scalar>(dof) : 0.0;
        const scalar tcrit  = tCrit95(dof);
        const bool wellConditioned = ok && cond < 1.0e8;

        diag_["dof"]              = static_cast<scalar>(dof);
        diag_["chi2_reduced"]     = sigma2;
        diag_["t_crit95"]         = tcrit;
        diag_["cond_JtJ"]         = cond;
        diag_["invertible"]       = ok ? 1.0 : 0.0;              // J^T J numerically invertible?
        diag_["well_conditioned"] = wellConditioned ? 1.0 : 0.0; // cond < 1e8?

        // Correlation matrix needs only the SHAPE of the inverse (sigma^2
        // cancels), so it is available whenever J^T J inverted -- independent
        // of dof.  ALWAYS publish whether it was computed + the max, so the GUI
        // never mistakes "not computed" for "all uncorrelated" (a zero matrix).
        bool corrComputed = false;
        scalar maxAbsCorr = 0.0;
        if (ok)
        {
            corrComputed = true;
            for (std::size_t i = 0; i < P; ++i)
                for (std::size_t j = i + 1; j < P; ++j)
                {
                    scalar denom = std::sqrt(Cinv[i][i] * Cinv[j][j]);
                    scalar c = (denom > 0.0) ? Cinv[i][j] / denom : 0.0;
                    c = std::clamp(c, -1.0, 1.0);   // roundoff on an ill-cond inverse can exceed 1
                    diag_["corr." + std::to_string(i) + "." + std::to_string(j)] = c;
                    maxAbsCorr = std::max(maxAbsCorr, std::abs(c));
                }
        }
        diag_["corr_computed"] = corrComputed ? 1.0 : 0.0;
        if (corrComputed) diag_["max_abs_corr"] = maxAbsCorr;

        // THE VERDICT.  A fit is identifiable only if J^T J inverted, there are
        // degrees of freedom, the system is well-conditioned, AND no two
        // parameters are essentially perfectly correlated.  (The naive "did it
        // invert?" is exactly the test that passed on the cond~3.6e11 / corr=1
        // ethanol-water example -- the case this feature exists to flag.)
        const bool identifiable =
            ok && dof > 0 && wellConditioned && (!corrComputed || maxAbsCorr < 0.999);
        diag_["identifiable"] = identifiable ? 1.0 : 0.0;

        // Standard errors + CIs need sigma^2 (dof>0).  A non-positive variance
        // (ill-conditioning) yields NaN -- NOT 0, which would read as infinite
        // precision.  The JSON emitter drops non-finite values, so the GUI
        // shows "--" for these.
        sVector stderrv(P, std::numeric_limits<scalar>::quiet_NaN());
        if (ok && dof > 0)
        {
            for (std::size_t i = 0; i < P; ++i)
            {
                scalar var_i = sigma2 * Cinv[i][i];
                stderrv[i] = (var_i > 0.0) ? std::sqrt(var_i)
                                           : std::numeric_limits<scalar>::quiet_NaN();
            }
        }

        // Per-parameter: index-keyed (the GUI matches index -> path via the
        // propsDict it already holds), plus path-keyed value (CLI readback).
        scalar maxAbsResid = 0.0;
        for (std::size_t k = 0; k < N; ++k)
            maxAbsResid = std::max(maxAbsResid, std::abs(r_final[k]));
        diag_["chi2"]             = chi2Feasible;   // feasible rows only (honest)
        diag_["rms"]              = (nGood > 0) ? std::sqrt(chi2Feasible / static_cast<scalar>(nGood))
                                                : std::numeric_limits<scalar>::quiet_NaN();
        diag_["max_abs_resid"]    = maxAbsResid;
        diag_["penalised_points"] = static_cast<scalar>(nFailed);

        int atBound = 0;
        for (std::size_t i = 0; i < P; ++i)
        {
            const auto& ps = params[i];
            scalar span = std::max(std::abs(ps.hi - ps.lo), 1.0e-30);
            scalar tolB = std::max(1.0e-6 * span, 1.0e-8);
            bool pinned = (std::abs(ps.value - ps.lo) < tolB)
                       || (std::abs(ps.value - ps.hi) < tolB);
            if (pinned) ++atBound;
            diag_["fit." + std::to_string(i) + ".value"]    = ps.value;
            diag_["fit." + std::to_string(i) + ".stderr"]   = stderrv[i];
            diag_["fit." + std::to_string(i) + ".ci95"]     = tcrit * stderrv[i];
            diag_["fit." + std::to_string(i) + ".at_bound"] = pinned ? 1.0 : 0.0;
        }
        diag_["params_at_bound"] = static_cast<scalar>(atBound);

        if (verbosity >= 2)
        {
            std::cout << "  Identifiability:  "
                      << (identifiable ? "parameters individually determined"
                                       : "NOT individually identifiable") << "\n"
                      << "    dof = " << dof
                      << "   reduced chi2 = " << std::scientific << std::setprecision(3) << sigma2
                      << "   cond(JtJ) ~ " << std::setprecision(2) << cond
                      << (wellConditioned ? "" : "  (ill-conditioned)") << "\n";
            if (ok && dof > 0)
            {
                for (std::size_t i = 0; i < P; ++i)
                    std::cout << "    " << params[i].path << " = "
                              << std::fixed << std::setprecision(4) << params[i].value
                              << "  +/- " << std::setprecision(4) << (tcrit * stderrv[i])
                              << "  (t95, sigma = " << std::setprecision(4) << stderrv[i] << ")\n";
            }
            if (corrComputed)
            {
                std::cout << "    max|correlation| = " << std::fixed << std::setprecision(3)
                          << maxAbsCorr;
                if (maxAbsCorr > 0.999)
                    std::cout << "   <-- unidentifiable (two params perfectly trade off)";
                else if (maxAbsCorr > 0.9)
                    std::cout << "   <-- strongly correlated";
                std::cout << "\n";
            }
            else
                std::cout << "    (correlation matrix not computed -- J^T J singular)\n";
            if (nFailed > 0)
                std::cout << "    " << nFailed << " data point(s) hit the "
                             "bubble-T penalty (non-converged)\n";
            std::cout << "=====================================================================\n\n";
        }

        // -- PROMOTE (opt-in): write a binary-pair proposal .dat -----------
        // Migrated from FitBinaryPair so FitParameters is the single canonical
        // fit engine (fit + judge + promote).  Only when every fitted path is a
        // coefficient of ONE activityModel pair (a_ij/b_ij/a_ji/b_ji).  The
        // proposal carries the fit quality AND the identifiability verdict --
        // promoting parameters that are not individually identifiable is loudly
        // flagged in the header, never hidden (the bar we hold).
        if (!proposalPath.empty())
        {
            // Two recognised path grammars, ONE pair either way:
            //   v1 flat :  activityModel.pairs[K].<coef>       (index-based)
            //   v2 named:  equilibrium.liquid.activityModel.binaryParameters
            //              .<i>-<j>.<coef>                     (order-stable)
            int pairIdx = -1; bool singlePair = true;
            std::string v2PairKey;
            std::map<std::string, scalar> coef;   // a_ij/b_ij/a_ji/b_ji -> value
            for (const auto& ps : params)
            {
                auto dot = ps.path.rfind('.');
                if (dot == std::string::npos) { singlePair = false; break; }
                if (ps.path.find(".binaryParameters.") != std::string::npos)
                {
                    auto pdot = ps.path.rfind('.', dot - 1);
                    if (pdot == std::string::npos) { singlePair = false; break; }
                    const std::string key =
                        ps.path.substr(pdot + 1, dot - pdot - 1);
                    if (v2PairKey.empty()) v2PairKey = key;
                    else if (v2PairKey != key) { singlePair = false; break; }
                    coef[ps.path.substr(dot + 1)] = ps.value;
                    continue;
                }
                auto lb = ps.path.find("pairs[");
                auto rb = ps.path.find(']');
                if (lb == std::string::npos || rb == std::string::npos
                    || rb < lb)
                { singlePair = false; break; }
                int k = std::atoi(ps.path.substr(lb + 6, rb - lb - 6).c_str());
                if (pairIdx == -1) pairIdx = k;
                else if (pairIdx != k) { singlePair = false; break; }
                coef[ps.path.substr(dot + 1)] = ps.value;
            }
            if (pairIdx >= 0 && !v2PairKey.empty()) singlePair = false;

            DictPtr pd;                            // the fitted pair's block
            std::string model = "NRTL";
            if (singlePair && !v2PairKey.empty())
            {
                auto am = work->subDict("equilibrium")->subDict("liquid")
                              ->subDict("activityModel");
                model = am->lookupWordOrDefault("model", "NRTL");
                auto bp = am->subDict("binaryParameters");
                if (bp->found(v2PairKey)) pd = bp->subDict(v2PairKey);
            }
            else if (singlePair && pairIdx >= 0)
            {
                auto am = work->subDict("activityModel");
                model = am->lookupWordOrDefault("model", "NRTL");
                auto pairs = am->lookupDictList("pairs");
                if (pairIdx < static_cast<int>(pairs.size()))
                    pd = pairs[static_cast<std::size_t>(pairIdx)];
            }

            if (pd)
            {
                {
                    const std::string ci = pd->lookupWord("i");
                    const std::string cj = pd->lookupWord("j");
                    const scalar alpha = pd->lookupScalarOrDefault("alpha", 0.30);
                    const std::string pairName = (ci < cj ? ci + "-" + cj : cj + "-" + ci);

                    namespace fs = std::filesystem;
                    std::string outPath = proposalPath;
                    if (proposalPath == "auto")
                    {
                        fs::path outDir = fs::path("constant") / "parameters" / model;
                        std::error_code ec; fs::create_directories(outDir, ec);
                        outPath = (outDir / (pairName + ".fit-" + isoDateUtc() + ".dat")).string();
                    }

                    auto co = [&](const std::string& k){ auto it = coef.find(k); return it == coef.end() ? 0.0 : it->second; };
                    std::ofstream f(outPath);
                    if (f)
                    {
                        const scalar rms = std::sqrt(chi2 / static_cast<scalar>(N));
                        f << "/*---------------------------------------------------------------------------*\\\n"
                          << "  fitParameters proposal -- pair " << pairName << " -- model " << model << "\n"
                          << "  " << N << " data points -- chi^2 = " << chi2
                          << "  RMS = " << rms << " K  (generated " << isoDateUtc() << ")\n";
                        if (!identifiable)
                            f << "  !! WARNING: these parameters are NOT individually identifiable\n"
                              << "  !! (max|correlation| = " << std::fixed << std::setprecision(3) << maxAbsCorr
                              << ").  The fit reproduces the data, but the individual a/b\n"
                              << "  !! values are not uniquely determined -- promote with care, or\n"
                              << "  !! add data at another pressure to separate a from b/T.\n";
                        f << "  Promote by:\n"
                          << "      mv " << outPath << "  constant/parameters/" << model << "/" << pairName << ".dat\n"
                          << "\\*---------------------------------------------------------------------------*/\n\n"
                          << "components  ( " << ci << "  " << cj << " );\n"
                          << "model       " << model << ";\n\n"
                          << "parameters\n{\n"
                          << "    i           " << ci << ";\n"
                          << "    j           " << cj << ";\n"
                          << std::setprecision(8)
                          << "    a_ij        " << co("a_ij") << ";\n"
                          << "    b_ij        " << co("b_ij") << ";\n"
                          << "    a_ji        " << co("a_ji") << ";\n"
                          << "    b_ji        " << co("b_ji") << ";\n"
                          << "    alpha       " << alpha << ";\n"
                          << "}\n\n"
                          << "provenance\n{\n"
                          << "    source        fitted;\n"
                          << "    fitDate       \"" << isoDateUtc() << "\";\n"
                          << "    algorithm     \"Levenberg-Marquardt (choupoProps fitParameters)\";\n"
                          << "    chi2          " << chi2 << ";\n"
                          << "    nDataPoints   " << N << ";\n"
                          << "    identifiable  " << (identifiable ? "true" : "false") << ";\n"
                          << "}\n";
                        if (verbosity >= 2)
                            std::cout << "  proposal written to: " << outPath
                                      << (identifiable ? "" : "  (NOT individually identifiable -- see header)")
                                      << "\n\n";
                    }
                    else if (verbosity >= 1)
                        std::cerr << "  fitParameters: could not write proposal " << outPath << "\n";
                }
            }
            else if (verbosity >= 1)
                std::cout << "  (proposal skipped: the fitted parameters are not a single "
                             "activityModel pair)\n";
        }
    }

    diag_["n_data"]    = static_cast<scalar>(N);
    diag_["n_params"]  = static_cast<scalar>(P);
    diag_["iter"]      = static_cast<scalar>(iter);
    diag_["chi2"]      = chi2;
    diag_["converged"] = converged ? 1.0 : 0.0;
    for (const auto& ps : params)
        diag_[ps.path] = ps.value;

    return converged ? 0 : 1;
}

// ===========================================================================
//  residual.kind == isotherm  (A1b --- adsorption contract sections 2/5)
//
//  Self-contained van't Hoff Langmuir regression: analytic Jacobian LM in
//  TRANSFORMED space (theta = ln q_max, ln b_ref, dH_ads natural) --- positive
//  parameters are positive by construction, never clamped.  Identifiability
//  is structural: single-T data refuses dH_ads; Henry-regime data reports
//  only the product q_max*b; the SVD condition number of the relative-scaled
//  Jacobian flags any other rank deficiency.
// ===========================================================================

namespace {

struct IsoPoint { scalar T, p, q, sigma; };   // K, Pa, mol/kg, mol/kg

// Fit modes.  LANG_SINGLE_T anchors b at T_data (tRefEff = T_data, no dH);
// the HENRY modes fit the linear surface q = H(T) p when the data cannot
// separate q_max from b (max b p < 0.05).
enum class IsoMode { LangFull, LangSingleT, HenryMulti, HenrySingle };

std::size_t isoNParams(IsoMode m)
{
    switch (m)
    {
        case IsoMode::LangFull:    return 3;
        case IsoMode::LangSingleT: return 2;
        case IsoMode::HenryMulti:  return 2;
        default:                   return 1;
    }
}

// Residuals + analytic Jacobian in theta-space.  Langmuir:
//   b = e^{th1} exp(-dH/R (1/T - 1/tRef)),  s = b p,  q = e^{th0} s/(1+s)
//   dq/d(ln qm) = q;  dq/d(ln b) = q/(1+s);  dq/d(dH) = q/(1+s) * (-(1/T-1/tRef)/R)
// Henry:  q = e^{th0} exp(-dH/R (1/T-1/tRef)) p;  dq/d(ln H) = q;
//   dq/d(dH) = q * (-(1/T-1/tRef)/R).
scalar isoResiduals(IsoMode mode, const sVector& th, scalar tRef,
                    const std::vector<IsoPoint>& data,
                    sVector& r, std::vector<sVector>* J)
{
    const std::size_t n = data.size();
    const std::size_t P = isoNParams(mode);
    r.assign(n, 0.0);
    if (J) J->assign(n, sVector(P, 0.0));
    scalar chi2 = 0.0;

    for (std::size_t k = 0; k < n; ++k)
    {
        const IsoPoint& d = data[k];
        const scalar vh = (1.0 / d.T - 1.0 / tRef);   // van't Hoff abscissa

        scalar q = 0.0;
        if (mode == IsoMode::LangFull || mode == IsoMode::LangSingleT)
        {
            const scalar qm = std::exp(th[0]);
            const scalar dH = (mode == IsoMode::LangFull) ? th[2] : 0.0;
            const scalar b  = std::exp(th[1]) * std::exp(-dH / constant::R * vh);
            const scalar s  = b * d.p;
            q = qm * s / (1.0 + s);
            if (J)
            {
                (*J)[k][0] = q / d.sigma;
                (*J)[k][1] = q / (1.0 + s) / d.sigma;
                if (mode == IsoMode::LangFull)
                    (*J)[k][2] = q / (1.0 + s) * (-vh / constant::R) / d.sigma;
            }
        }
        else
        {
            const scalar dH = (mode == IsoMode::HenryMulti) ? th[1] : 0.0;
            const scalar H  = std::exp(th[0]) * std::exp(-dH / constant::R * vh);
            q = H * d.p;
            if (J)
            {
                (*J)[k][0] = q / d.sigma;
                if (mode == IsoMode::HenryMulti)
                    (*J)[k][1] = q * (-vh / constant::R) / d.sigma;
            }
        }

        r[k] = (q - d.q) / d.sigma;
        chi2 += r[k] * r[k];
    }
    return chi2;
}

// Per-component step caps: a trust-region safeguard against an early wild
// step, NOT a bound on the parameter (nothing is clamped at the optimum).
// ln-space columns cap at 5 (a factor e^5 per step); the NATURAL dH_ads
// column caps at 2e4 J/mol per step --- capping it at 5 would crawl at
// 5 J/mol per iteration (the classic scale trap).
sVector isoStepCaps(IsoMode m)
{
    switch (m)
    {
        case IsoMode::LangFull:   return { 5.0, 5.0, 2.0e4 };
        case IsoMode::LangSingleT:return { 5.0, 5.0 };
        case IsoMode::HenryMulti: return { 5.0, 2.0e4 };
        default:                  return { 5.0 };
    }
}

// LM driver in theta-space.
struct IsoFitResult
{
    sVector th;
    scalar  chi2 = 0.0;
    int     iter = 0;
    bool    converged = false;
};

IsoFitResult isoLm(IsoMode mode, sVector th0, scalar tRef,
                   const std::vector<IsoPoint>& data,
                   int maxIter, scalar tol, scalar lambda0, int verbosity)
{
    IsoFitResult out;
    out.th = std::move(th0);
    sVector r;
    out.chi2 = isoResiduals(mode, out.th, tRef, data, r, nullptr);
    scalar lambda = lambda0;
    const sVector caps = isoStepCaps(mode);

    for (out.iter = 1; out.iter <= maxIter; ++out.iter)
    {
        std::vector<sVector> J;
        isoResiduals(mode, out.th, tRef, data, r, &J);

        sVector dth;
        try { dth = solveDamped(J, r, lambda); }
        catch (...) { lambda *= 10.0; continue; }
        for (std::size_t j = 0; j < dth.size(); ++j)
            dth[j] = std::clamp(dth[j], -caps[j], caps[j]);

        sVector trial = out.th;
        for (std::size_t j = 0; j < trial.size(); ++j) trial[j] += dth[j];
        sVector rT;
        const scalar chi2T = isoResiduals(mode, trial, tRef, data, rT, nullptr);

        if (chi2T < out.chi2)
        {
            const scalar rel = std::abs(out.chi2 - chi2T)
                             / std::max(out.chi2, 1.0e-30);
            scalar stepInf = 0.0;
            for (scalar d : dth) stepInf = std::max(stepInf, std::abs(d));
            out.th = trial;
            out.chi2 = chi2T;
            lambda *= 0.7;
            if (verbosity >= 4)
                std::cout << "    [isoLm] iter " << out.iter << "  chi2 "
                          << std::scientific << std::setprecision(5)
                          << out.chi2 << "  lambda " << lambda << "\n";
            if (rel < tol || out.chi2 < 1.0e-28 || stepInf < 1.0e-13)
            { out.converged = true; break; }
        }
        else
        {
            lambda *= 2.5;
            if (lambda > 1.0e12)
                throw std::runtime_error("fitParameters(isotherm): lambda "
                    "diverged --- bad initial guess or a surface the data "
                    "cannot constrain (check the dataset and the initials)");
        }
    }
    return out;
}

// Eigenvalues (ascending) of a small symmetric matrix by cyclic Jacobi;
// optional eigenvectors as COLUMNS of V.  P <= 3 here --- exact enough.
sVector jacobiEig(std::vector<sVector> A, std::vector<sVector>* V)
{
    const std::size_t P = A.size();
    std::vector<sVector> Vloc(P, sVector(P, 0.0));
    for (std::size_t i = 0; i < P; ++i) Vloc[i][i] = 1.0;

    for (int sweep = 0; sweep < 100; ++sweep)
    {
        scalar off = 0.0;
        for (std::size_t i = 0; i < P; ++i)
            for (std::size_t j = i + 1; j < P; ++j)
                off += A[i][j] * A[i][j];
        if (off < 1.0e-300) break;

        for (std::size_t pi = 0; pi < P; ++pi)
            for (std::size_t qi = pi + 1; qi < P; ++qi)
            {
                if (std::abs(A[pi][qi]) < 1.0e-300) continue;
                const scalar theta = (A[qi][qi] - A[pi][pi])
                                   / (2.0 * A[pi][qi]);
                const scalar t = (theta >= 0.0 ? 1.0 : -1.0)
                    / (std::abs(theta) + std::sqrt(theta * theta + 1.0));
                const scalar c = 1.0 / std::sqrt(t * t + 1.0);
                const scalar s = t * c;
                for (std::size_t k = 0; k < P; ++k)
                {
                    const scalar akp = A[k][pi], akq = A[k][qi];
                    A[k][pi] = c * akp - s * akq;
                    A[k][qi] = s * akp + c * akq;
                }
                for (std::size_t k = 0; k < P; ++k)
                {
                    const scalar apk = A[pi][k], aqk = A[qi][k];
                    A[pi][k] = c * apk - s * aqk;
                    A[qi][k] = s * apk + c * aqk;
                }
                for (std::size_t k = 0; k < P; ++k)
                {
                    const scalar vkp = Vloc[k][pi], vkq = Vloc[k][qi];
                    Vloc[k][pi] = c * vkp - s * vkq;
                    Vloc[k][qi] = s * vkp + c * vkq;
                }
            }
    }

    sVector ev(P);
    for (std::size_t i = 0; i < P; ++i) ev[i] = A[i][i];
    // sort ascending, permuting V's columns alongside
    std::vector<std::size_t> idx(P);
    for (std::size_t i = 0; i < P; ++i) idx[i] = i;
    std::sort(idx.begin(), idx.end(),
              [&](std::size_t a, std::size_t b){ return ev[a] < ev[b]; });
    sVector evs(P);
    std::vector<sVector> Vs(P, sVector(P, 0.0));
    for (std::size_t i = 0; i < P; ++i)
    {
        evs[i] = ev[idx[i]];
        for (std::size_t k = 0; k < P; ++k) Vs[k][i] = Vloc[k][idx[i]];
    }
    if (V) *V = Vs;
    return evs;
}

// Read the (T, p, q [, sigma]) dataset: a self-describing columns file (each
// column DECLARES its unit; converted to canonical SI here, at the data
// boundary), or inline flat (T p q) triples already in SI.
std::vector<IsoPoint> readIsoData(const DictPtr& resDict, bool& haveSigma,
                                  std::string& citation)
{
    std::vector<IsoPoint> data;
    haveSigma = false;

    if (resDict->found("dataset"))
    {
        const std::string path = resDict->lookupWord("dataset");
        auto ds = Dictionary::fromFile(path);   // relative to the case dir
        if (!ds->found("columns"))
            throw std::runtime_error("fitParameters(isotherm): dataset '"
                + path + "' must be self-describing (columns ( { name ...; "
                "unit ...; } ... ) + data ( ... )) --- units are declared, "
                "never guessed");
        auto cols = ds->lookupDictList("columns");
        auto grid = ds->lookupList("data");
        const std::size_t nc = cols.size();
        if (nc < 3 || grid.empty() || grid.size() % nc != 0)
            throw std::runtime_error("fitParameters(isotherm): dataset '"
                + path + "': need >= 3 columns (T, p, q [, sigma]) and a "
                "data grid divisible by the column count");

        int iT = -1, iP = -1, iQ = -1, iS = -1;
        std::vector<std::string> cunit(nc);
        for (std::size_t j = 0; j < nc; ++j)
        {
            const std::string nm = cols[j]->lookupWord("name");
            cunit[j] = cols[j]->lookupWord("unit");
            if      (nm == "T")                       iT = static_cast<int>(j);
            else if (nm == "p")                       iP = static_cast<int>(j);
            else if (nm == "q")                       iQ = static_cast<int>(j);
            else if (nm == "sigma" || nm == "weight") iS = static_cast<int>(j);
        }
        if (iT < 0 || iP < 0 || iQ < 0)
            throw std::runtime_error("fitParameters(isotherm): dataset '"
                + path + "' must name columns T, p and q");
        haveSigma = (iS >= 0);

        auto convT = [&](scalar v) -> scalar
        {
            const std::string& u = cunit[static_cast<std::size_t>(iT)];
            if (u == "K") return v;
            auto sp = units::lookupUnit(u);
            if (sp && sp->affine) return units::affineToK(v, u);
            throw std::runtime_error("fitParameters(isotherm): T column unit '"
                + u + "' not a temperature");
        };
        auto convP = [&](scalar v) -> scalar
        {
            const std::string& u = cunit[static_cast<std::size_t>(iP)];
            if (u == "Pa") return v;
            auto sp = units::lookupUnit(u);
            if (sp && !sp->affine) return v * sp->factor;
            throw std::runtime_error("fitParameters(isotherm): p column unit '"
                + u + "' not a pressure");
        };
        auto convQ = [&](scalar v, int col) -> scalar
        {
            const std::string& u = cunit[static_cast<std::size_t>(col)];
            if (u == "mol/kg" || u == "mmol/g") return v;   // numerically equal
            throw std::runtime_error("fitParameters(isotherm): loading unit '"
                + u + "' not implemented --- declare mol/kg (canonical) or "
                "mmol/g (numerically identical); other bases are a curation-"
                "time conversion, recorded in the dataset header");
        };

        const std::size_t rows = grid.size() / nc;
        data.reserve(rows);
        for (std::size_t rrow = 0; rrow < rows; ++rrow)
        {
            IsoPoint d;
            d.T = convT(grid[rrow * nc + static_cast<std::size_t>(iT)]);
            d.p = convP(grid[rrow * nc + static_cast<std::size_t>(iP)]);
            d.q = convQ(grid[rrow * nc + static_cast<std::size_t>(iQ)], iQ);
            d.sigma = haveSigma
                ? convQ(grid[rrow * nc + static_cast<std::size_t>(iS)], iS)
                : 1.0;
            data.push_back(d);
        }

        if (ds->found("provenance"))
        {
            auto pv = ds->subDict("provenance");
            citation = pv->lookupWordOrDefault("citation", "");
            if (citation.empty())
                citation = pv->lookupWordOrDefault("source", "");
        }
        if (citation.empty()) citation = "dataset " + path + " (uncited)";
    }
    else
    {
        auto flat = resDict->lookupList("data");
        if (flat.empty() || flat.size() % 3 != 0)
            throw std::runtime_error("fitParameters(isotherm): inline "
                "residual.data must be flat (T p q) triples in canonical SI "
                "(K, Pa, mol/kg) --- or point `dataset` at a columns file");
        for (std::size_t k = 0; k + 2 < flat.size(); k += 3)
            data.push_back({ flat[k], flat[k + 1], flat[k + 2], 1.0 });
        citation = "inline residual.data (synthetic / case-local)";
    }

    for (const auto& d : data)
        if (d.T <= 0.0 || d.p <= 0.0 || d.q < 0.0 || d.sigma <= 0.0)
            throw std::runtime_error("fitParameters(isotherm): every data row "
                "needs T > 0 K, p > 0 Pa, q >= 0 mol/kg (and sigma > 0) --- "
                "drop the trivial (0,0) anchor rows, the model satisfies "
                "them identically");
    return data;
}

} // anonymous namespace

int FitParameters::runIsothermFit(const DictPtr& dict, int verbosity)
{
    diag_.clear();

    auto resDict = dict->subDict("residual");
    const std::string model = resDict->lookupWordOrDefault("model", "langmuir");
    if (model != "langmuir")
        throw std::runtime_error("fitParameters(isotherm): only model "
            "`langmuir` (van't Hoff) is implemented (got '" + model + "')");
    const std::string adsName = resDict->lookupWord("adsorbent");
    const std::string species = resDict->lookupWord("adsorbate");
    const scalar tRef = resDict->lookupScalar("tRef");        // K, mandatory
    if (tRef <= 0.0)
        throw std::runtime_error("fitParameters(isotherm): tRef must be a "
            "positive absolute temperature [K] --- the van't Hoff anchor is "
            "declared, never an implicit 298");

    // ---- data + weighting -------------------------------------------------
    bool haveSigma = false;
    std::string citation;
    std::vector<IsoPoint> data = readIsoData(resDict, haveSigma, citation);
    const std::size_t n = data.size();

    const std::string weighting =
        resDict->lookupWordOrDefault("weighting",
                                     haveSigma ? "sigma" : "absolute");
    std::string sigmaNote;
    if (weighting == "relative")
    {
        if (haveSigma)
            throw std::runtime_error("fitParameters(isotherm): `weighting "
                "relative;` clashes with the dataset's sigma column --- "
                "declare ONE weighting, not two");
        const scalar floor = resDict->lookupScalar("floor");  // mol/kg, mandatory
        if (floor <= 0.0)
            throw std::runtime_error("fitParameters(isotherm): relative "
                "weighting needs a declared positive `floor` [mol/kg]");
        for (auto& d : data) d.sigma = std::max(d.q, floor);
        std::ostringstream os;
        os << "relative residuals: sigma_j = max(q_j, " << floor << " mol/kg)";
        sigmaNote = os.str();
    }
    else if (weighting == "sigma")
    {
        if (!haveSigma)
            throw std::runtime_error("fitParameters(isotherm): `weighting "
                "sigma;` but the dataset carries no sigma column");
        sigmaNote = "per-point sigma column from the dataset [mol/kg]";
    }
    else if (weighting == "absolute")
    {
        if (haveSigma)
            throw std::runtime_error("fitParameters(isotherm): the dataset "
                "carries a sigma column but the op declares `weighting "
                "absolute;` --- remove the declaration (the column wins by "
                "default) or drop the column; a silent tie-break is a lie");
        sigmaNote = "UNWEIGHTED absolute-q residuals (sigma = 1 mol/kg; no "
                    "sigma column, none declared)";
    }
    else
        throw std::runtime_error("fitParameters(isotherm): weighting must be "
            "absolute | relative (or a dataset sigma column); got '"
            + weighting + "'");

    // ---- parameters: the declared trio, positives fitted in ln-space ------
    if (!dict->hasDictList("parameters"))
        throw std::runtime_error("fitParameters(isotherm): declare the "
            "parameter trio q_max / b_ref / dH_ads with initials");
    scalar qm0 = 0.0, b0 = 0.0, dH0 = 0.0;
    bool haveQm = false, haveB = false, haveDH = false;
    // Optional DECLARED domain per parameter (forum #119 P2): checked at the
    // OPTIMUM as a verdict, never a clamp inside the iteration -- positivity
    // still comes from the ln-space transformation.  An optimum outside its
    // declared domain refuses the proposal BY NAME (active-bound diagnostic).
    std::map<std::string, std::pair<scalar, scalar>> declaredBounds;
    for (const auto& p : dict->lookupDictList("parameters"))
    {
        const std::string nm = p->lookupWord("name");
        const scalar v = p->lookupScalar("initial");
        if      (nm == "q_max")  { qm0 = v; haveQm = true; }
        else if (nm == "b_ref")  { b0  = v; haveB  = true; }
        else if (nm == "dH_ads") { dH0 = v; haveDH = true; }
        else
            throw std::runtime_error("fitParameters(isotherm): unknown "
                "parameter '" + nm + "' (the langmuir surface has q_max "
                "[mol/kg], b_ref [1/Pa] and dH_ads [J/mol])");
        if (p->found("min") || p->found("max"))
        {
            const scalar lo = p->found("min")
                ? p->lookupScalar("min")
                : -std::numeric_limits<scalar>::infinity();
            const scalar hi = p->found("max")
                ? p->lookupScalar("max")
                :  std::numeric_limits<scalar>::infinity();
            if (!(lo < hi))
                throw std::runtime_error("fitParameters(isotherm): parameter '"
                    + nm + "' declares min >= max");
            declaredBounds[nm] = { lo, hi };
        }
    }
    if (!haveQm || !haveB || !haveDH)
        throw std::runtime_error("fitParameters(isotherm): declare ALL of "
            "q_max, b_ref and dH_ads --- the ENGINE decides which are "
            "identifiable from the data, the author does not pre-trim");
    if (qm0 <= 0.0 || b0 <= 0.0)
        throw std::runtime_error("fitParameters(isotherm): initial q_max and "
            "b_ref must be > 0 (they are fitted in ln-space)");

    // ---- options -----------------------------------------------------------
    int    maxIter = 200;
    scalar tol     = 1.0e-12;
    scalar lambda0 = 1.0e-3;
    if (dict->found("options"))
    {
        auto o = dict->subDict("options");
        if (o->found("maxIter"))   maxIter = static_cast<int>(o->lookupScalar("maxIter"));
        if (o->found("tolerance")) tol     = o->lookupScalar("tolerance");
        if (o->found("lambda0"))   lambda0 = o->lookupScalar("lambda0");
    }

    // ---- structural identifiability, part 1: distinct temperatures --------
    std::vector<scalar> distinctT;
    for (const auto& d : data)
    {
        bool seen = false;
        for (scalar T : distinctT)
            if (std::abs(d.T - T) < 1.0e-6 * T) { seen = true; break; }
        if (!seen) distinctT.push_back(d.T);
    }
    const bool singleT = (distinctT.size() == 1);
    const scalar tRefEff = singleT ? distinctT[0] : tRef;
    IsoMode mode = singleT ? IsoMode::LangSingleT : IsoMode::LangFull;
    std::size_t P = isoNParams(mode);

    if (n < P + 1)
        throw std::runtime_error("fitParameters(isotherm): "
            + std::to_string(n) + " data point(s) cannot determine "
            + std::to_string(P) + " parameter(s) --- need at least "
            + std::to_string(P + 1) + ".  A fit on fewer points is a "
            "fabrication; REFUSED by name.");

    if (verbosity >= 2)
    {
        std::cout << "\n====================  FitParameters (ISOTHERM)  ====================\n"
                  << "  Pair:        " << species << " on " << adsName
                  << "   model " << model << " (van't Hoff)\n"
                  << "  Data:        " << n << " (T, p, q) points at "
                  << distinctT.size() << " temperature(s)";
        if (!distinctT.empty())
        {
            scalar lo = distinctT[0], hi = distinctT[0];
            for (scalar T : distinctT) { lo = std::min(lo, T); hi = std::max(hi, T); }
            std::cout << "  [" << std::fixed << std::setprecision(2) << lo
                      << ", " << hi << "] K";
        }
        std::cout << "\n  Source:      " << citation << "\n"
                  << "  Weighting:   " << sigmaNote << "\n"
                  << "  tRef:        " << std::fixed << std::setprecision(2)
                  << tRefEff << " K"
                  << (singleT ? "  (:= T_data --- single-T dataset)" : "") << "\n";
        if (singleT)
            std::cout << "  NOTE:        SINGLE-temperature dataset -- dH_ads "
                         "is STRUCTURALLY unidentifiable;\n"
                         "               fitting q_max and b(T_data) only; "
                         "dH_ads will NOT be reported.\n";
    }

    // ---- fit ---------------------------------------------------------------
    sVector th0;
    if (mode == IsoMode::LangFull)  th0 = { std::log(qm0), std::log(b0), dH0 };
    else                            th0 = { std::log(qm0), std::log(b0) };

    IsoFitResult fit = isoLm(mode, th0, tRefEff, data,
                             maxIter, tol, lambda0, verbosity);

    scalar qm = std::exp(fit.th[0]);
    scalar bRef = std::exp(fit.th[1]);                        // 1/Pa at tRefEff
    scalar dH = (mode == IsoMode::LangFull) ? fit.th[2] : 0.0;

    // ---- structural identifiability, part 2: the Henry regime -------------
    //  max b(T_j) p_j at the optimum.  Below 0.05 the data never bends: only
    //  the PRODUCT q_max*b (the Henry slope) is determined.
    scalar bpMax = 0.0;
    for (const auto& d : data)
    {
        const scalar b = bRef * std::exp(-dH / constant::R
                                         * (1.0 / d.T - 1.0 / tRefEff));
        bpMax = std::max(bpMax, b * d.p);
    }
    const bool henryRegime = bpMax < 0.05;

    diag_["n_data"]   = static_cast<scalar>(n);
    diag_["bp_max"]   = bpMax;
    diag_["single_T"] = singleT ? 1.0 : 0.0;
    diag_["henry_regime"] = henryRegime ? 1.0 : 0.0;

    if (henryRegime)
    {
        //  Case (ii): REFIT the reduced (linear) surface and report the
        //  product with an honest uncertainty --- no misleading covariances
        //  on factors the data cannot separate.
        mode = singleT ? IsoMode::HenrySingle : IsoMode::HenryMulti;
        P = isoNParams(mode);
        sVector thH0 = singleT
            ? sVector{ std::log(qm0 * b0) }
            : sVector{ std::log(qm0 * b0), dH0 };
        fit = isoLm(mode, thH0, tRefEff, data, maxIter, tol, lambda0, verbosity);
        const scalar Hslope = std::exp(fit.th[0]);            // mol/kg/Pa
        dH = (mode == IsoMode::HenryMulti) ? fit.th[1] : 0.0;

        sVector r; std::vector<sVector> J;
        const scalar chi2 = isoResiduals(mode, fit.th, tRefEff, data, r, &J);
        const int dof = static_cast<int>(n) - static_cast<int>(P);
        const scalar s2 = (dof > 0) ? chi2 / dof : 0.0;
        std::vector<sVector> JtJ(P, sVector(P, 0.0));
        for (std::size_t i = 0; i < P; ++i)
            for (std::size_t j = 0; j < P; ++j)
                for (std::size_t k = 0; k < n; ++k)
                    JtJ[i][j] += J[k][i] * J[k][j];
        bool ok = false; scalar condPivot = 0.0;
        auto C = invertGaussJordan(JtJ, ok, condPivot);
        const scalar seLnH = (ok && dof > 0) ? std::sqrt(s2 * C[0][0])
                                             : std::numeric_limits<scalar>::quiet_NaN();
        const scalar seH   = Hslope * seLnH;                  // delta method
        const scalar seDH  = (mode == IsoMode::HenryMulti && ok && dof > 0)
            ? std::sqrt(s2 * C[1][1])
            : std::numeric_limits<scalar>::quiet_NaN();
        const scalar tc = tCrit95(dof);

        //  The REDUCED surface's verdict is EARNED, not declared (#119 P1):
        //  convergence + degrees of freedom + a successful J^T J inversion
        //  with finite standard errors.  On failure the values and CIs are
        //  REFUSED BY NAME -- a NaN stderr next to "identifiable 1" would be
        //  a lie wearing a diagnostic.
        const bool henryOk = fit.converged && ok && dof > 0
                             && std::isfinite(seLnH);
        diag_["converged"]    = fit.converged ? 1.0 : 0.0;
        diag_["iter"]         = static_cast<scalar>(fit.iter);
        diag_["chi2"]         = chi2;
        diag_["chi2_reduced"] = s2;
        diag_["dof"]          = static_cast<scalar>(dof);
        diag_["rms"]          = std::sqrt(chi2 / static_cast<scalar>(n));
        diag_["n_params"]     = static_cast<scalar>(P);
        diag_["identifiable"] = henryOk ? 1.0 : 0.0;  // of the REDUCED surface
        diag_["q_max_identifiable"] = 0.0;
        diag_["b_ref_identifiable"] = 0.0;
        diag_["dH_identifiable"]    =
            (mode == IsoMode::HenryMulti && henryOk) ? 1.0 : 0.0;
        if (henryOk)
        {
            diag_["fit.henry_slope.value"]  = Hslope;
            diag_["fit.henry_slope.stderr"] = seH;
            diag_["fit.henry_slope.ci95"]   = tc * seH;
            if (mode == IsoMode::HenryMulti)
            {
                diag_["fit.dH_ads.value"]  = dH;
                diag_["fit.dH_ads.stderr"] = seDH;
                diag_["fit.dH_ads.ci95"]   = tc * seDH;
            }
        }
        const bool endo = henryOk && (mode == IsoMode::HenryMulti) && dH > 0.0;
        diag_["endothermic_suspicious"] = endo ? 1.0 : 0.0;

        if (verbosity >= 2)
        {
            std::cout << "  --------------------------------------------------\n"
                      << "  HENRY REGIME: max b*p = " << std::scientific
                      << std::setprecision(3) << bpMax << " < 0.05 --- the data "
                         "never bends off the linear\n"
                      << "  surface, so q_max and b_ref are NOT separable.\n";
            if (!henryOk)
                std::cout << "  REDUCED FIT REFUSED BY NAME: "
                          << (!fit.converged ? "LM did not converge"
                              : (dof <= 0 ? "zero degrees of freedom (n <= P)"
                                          : "J^T J inversion failed / non-finite stderr"))
                          << " --- no values, no CIs (identifiable 0).\n";
            else
            {
                std::cout << "  Reporting the PRODUCT only:\n"
                          << "    henry slope q_max*b = " << std::setprecision(6)
                          << Hslope << " +/- " << (tc * seH)
                          << " mol/kg/Pa  (95% CI, t" << dof << ")\n";
                if (mode == IsoMode::HenryMulti)
                    std::cout << "    dH_ads              = " << std::fixed
                              << std::setprecision(1) << dH << " +/- "
                              << (tc * seDH) << " J/mol\n";
            }
            std::cout << "    q_max, b_ref: UNIDENTIFIABLE from this dataset "
                         "(add points with b*p >= O(1)\n"
                      << "    to bend the isotherm; no covariance is quoted "
                         "for factors the data cannot see).\n";
            if (endo)
                std::cout << "  *** ENDOTHERMIC ADSORPTION FITTED (dH_ads > 0)"
                             " --- physically suspicious, check the dataset ***\n";
            std::cout << "  Converged:   " << (fit.converged ? "yes" : "NO")
                      << " after " << fit.iter << " iterations   chi2 = "
                      << std::scientific << std::setprecision(5) << chi2 << "\n"
                      << "=====================================================================\n\n";
        }
        if (endo)
            AdvisoryLog::instance().add("physics", "warning",
                adsName + "/" + species,
                "endothermic adsorption fitted (dH_ads > 0) --- physically "
                "suspicious, check the dataset");
        if (dict->found("output")
            && dict->subDict("output")->found("proposal")
            && verbosity >= 1)
            std::cout << "  (proposal skipped: Henry-regime data determines "
                         "only the product q_max*b --- a langmuir record "
                         "would transcribe unidentifiable factors)\n";
        return fit.converged ? 0 : 1;
    }

    // ---- statistics at the optimum (langmuir, full or single-T) -----------
    sVector r; std::vector<sVector> J;
    const scalar chi2 = isoResiduals(mode, fit.th, tRefEff, data, r, &J);
    const int dof = static_cast<int>(n) - static_cast<int>(P);
    const scalar s2 = (dof > 0) ? chi2 / dof : 0.0;
    const scalar tc = tCrit95(dof);

    std::vector<sVector> JtJ(P, sVector(P, 0.0));
    for (std::size_t i = 0; i < P; ++i)
        for (std::size_t j = 0; j < P; ++j)
            for (std::size_t k = 0; k < n; ++k)
                JtJ[i][j] += J[k][i] * J[k][j];
    bool ok = false; scalar condPivot = 0.0;
    auto C = invertGaussJordan(JtJ, ok, condPivot);   // cov/s2 in theta-space

    //  SVD identifiability on the RELATIVE-scaled Jacobian J diag(theta):
    //  the ln-space columns (q_max, b_ref) are already d r / d ln(param);
    //  the dH column is scaled by |dH| (guarded >= 1 J/mol so a fitted
    //  dH ~ 0 cannot fake a zero column).  cond > 1e8 => rank-deficient.
    scalar condScaled = std::numeric_limits<scalar>::infinity();
    sVector nullDir;
    {
        sVector colScale(P, 1.0);
        if (mode == IsoMode::LangFull)
            colScale[2] = std::max(std::abs(fit.th[2]), scalar(1.0));
        std::vector<sVector> G(P, sVector(P, 0.0));
        for (std::size_t i = 0; i < P; ++i)
            for (std::size_t j = 0; j < P; ++j)
                G[i][j] = JtJ[i][j] * colScale[i] * colScale[j];
        std::vector<sVector> V;
        sVector ev = jacobiEig(G, &V);
        const scalar evMax = ev.back();
        const scalar evMin = ev.front();
        if (evMin > 0.0 && evMax > 0.0)
            condScaled = std::sqrt(evMax / evMin);
        nullDir.assign(P, 0.0);
        for (std::size_t k = 0; k < P; ++k) nullDir[k] = V[k][0];
    }
    const bool rankDeficient = !(condScaled < 1.0e8);

    // correlation matrix (shape of the inverse; invariant under the positive
    // delta-method rescaling to natural space)
    const std::vector<std::string> pname =
        (mode == IsoMode::LangFull)
            ? std::vector<std::string>{ "q_max", "b_ref", "dH_ads" }
            : std::vector<std::string>{ "q_max", "b_at_T" };
    scalar maxAbsCorr = 0.0;
    if (ok)
        for (std::size_t i = 0; i < P; ++i)
            for (std::size_t j = i + 1; j < P; ++j)
            {
                const scalar den = std::sqrt(C[i][i] * C[j][j]);
                scalar c = (den > 0.0) ? C[i][j] / den : 0.0;
                c = std::clamp(c, -1.0, 1.0);
                diag_["corr." + pname[i] + "." + pname[j]] = c;
                maxAbsCorr = std::max(maxAbsCorr, std::abs(c));
            }

    const bool identifiable =
        ok && dof > 0 && !rankDeficient && maxAbsCorr < 0.999;

    //  Declared-domain verdict (#119 P2): each declared min/max is checked at
    //  the OPTIMUM -- never a clamp inside the LM iteration (positivity stays
    //  with the ln-space transformation).  An optimum outside its declared
    //  domain is an ACTIVE BOUND: named, diagnosed, and it refuses the
    //  proposal below -- the data and the declared domain disagree, and the
    //  engine does not paper over that by projecting the number.
    std::vector<std::string> activeBounds;
    {
        std::map<std::string, scalar> optimum{ { "q_max", qm } };
        if (mode == IsoMode::LangFull)
        {
            optimum["b_ref"]  = bRef;
            optimum["dH_ads"] = dH;
        }
        for (const auto& [nm, lohi] : declaredBounds)
        {
            auto it = optimum.find(nm);
            if (it == optimum.end()) continue;
            const bool active =
                it->second < lohi.first || it->second > lohi.second;
            diag_["bound_active_" + nm] = active ? 1.0 : 0.0;
            if (active) activeBounds.push_back(nm);
        }
    }

    // standard errors: theta-space, then delta method to natural space
    sVector seTh(P, std::numeric_limits<scalar>::quiet_NaN());
    if (ok && dof > 0)
        for (std::size_t i = 0; i < P; ++i)
        {
            const scalar var = s2 * C[i][i];
            seTh[i] = (var > 0.0) ? std::sqrt(var)
                                  : std::numeric_limits<scalar>::quiet_NaN();
        }
    const scalar seQm = qm * seTh[0];
    const scalar seB  = bRef * seTh[1];
    const scalar seDH = (mode == IsoMode::LangFull)
        ? seTh[2] : std::numeric_limits<scalar>::quiet_NaN();

    //  The FULL verdict is EARNED (forum #121, same policy as the Henry
    //  branch): convergence AND inversion AND dof AND rank AND finite
    //  standard errors.  Only under statOk are ANY fit.* keys published --
    //  a non-converged LM must not leave parameters or CIs behind (the
    //  return code does not un-emit diagnostics).
    bool seFinite = true;
    for (std::size_t i = 0; i < P; ++i)
        if (!std::isfinite(seTh[i])) seFinite = false;
    const bool statOk = fit.converged && identifiable && seFinite;

    const bool endo = statOk && (mode == IsoMode::LangFull) && dH > 0.0;

    diag_["converged"]    = fit.converged ? 1.0 : 0.0;
    diag_["iter"]         = static_cast<scalar>(fit.iter);
    diag_["chi2"]         = chi2;
    diag_["chi2_reduced"] = s2;
    diag_["dof"]          = static_cast<scalar>(dof);
    diag_["rms"]          = std::sqrt(chi2 / static_cast<scalar>(n));
    diag_["n_params"]     = static_cast<scalar>(P);
    diag_["cond_scaledJ"] = condScaled;
    diag_["identifiable"] = statOk ? 1.0 : 0.0;
    diag_["max_abs_corr"] = maxAbsCorr;
    diag_["endothermic_suspicious"] = endo ? 1.0 : 0.0;
    if (statOk)
    {
        diag_["fit.q_max.value"]  = qm;
        diag_["fit.q_max.stderr"] = seQm;
        diag_["fit.q_max.ci95"]   = tc * seQm;
    }
    if (mode == IsoMode::LangFull)
    {
        if (statOk)
        {
            diag_["fit.b_ref.value"]  = bRef;                 // 1/Pa @ tRef
            diag_["fit.b_ref.stderr"] = seB;
            diag_["fit.b_ref.ci95"]   = tc * seB;
            diag_["fit.dH_ads.value"]  = dH;
            diag_["fit.dH_ads.stderr"] = seDH;
            diag_["fit.dH_ads.ci95"]   = tc * seDH;
        }
        //  structurally multi-T, but the VERDICT is earned (#119/#121): a
        //  failed/rank-deficient fit cannot certify the van't Hoff slope.
        diag_["dH_identifiable"]   = statOk ? 1.0 : 0.0;
    }
    else
    {
        //  Case (i): single-T --- b is b(T_data); dH_ads is NOT reported (a
        //  number with +/-3000% would be a fabrication wearing error bars).
        if (statOk)
        {
            diag_["fit.b_at_T.value"]  = bRef;                // 1/Pa @ T_data
            diag_["fit.b_at_T.stderr"] = seB;
            diag_["fit.b_at_T.ci95"]   = tc * seB;
        }
        diag_["T_data"]            = tRefEff;
        diag_["dH_identifiable"]   = 0.0;
    }

    if (verbosity >= 2)
    {
        std::cout << "  --------------------------------------------------\n"
                  << "  Converged:   " << (fit.converged ? "yes" : "NO")
                  << " after " << fit.iter << " iterations   chi2 = "
                  << std::scientific << std::setprecision(5) << chi2
                  << "   s2 = " << s2 << " (dof " << dof << ")\n";
        if (!statOk)
            std::cout << "  FIT REFUSED BY NAME: "
                      << (!fit.converged ? "LM did not converge"
                          : (!identifiable ? "parameters not individually "
                                             "identifiable (rank/correlation)"
                                           : "non-finite standard errors"))
                      << " --- NO fit.* values, NO CIs are published"
                         " (identifiable 0); raw diagnostics only.\n";
        else
        {
        std::cout << "  Fitted parameters (95% CI, t" << dof << "):\n"
                  << "    q_max   = " << std::fixed << std::setprecision(5)
                  << qm << " +/- " << (tc * seQm) << " mol/kg  ("
                  << std::setprecision(2) << (100.0 * seQm / qm) << "% rel se)\n";
        if (mode == IsoMode::LangFull)
        {
            std::cout << "    b_ref   = " << std::scientific << std::setprecision(5)
                      << bRef << " +/- " << (tc * seB) << " 1/Pa at "
                      << std::fixed << std::setprecision(2) << tRef << " K  (= "
                      << std::setprecision(4) << (bRef / constant::Pa_to_bar)
                      << " 1/bar; " << std::setprecision(2)
                      << (100.0 * seB / bRef) << "% rel se)\n"
                      << "    dH_ads  = " << std::setprecision(1) << dH
                      << " +/- " << (tc * seDH) << " J/mol  ("
                      << std::setprecision(2)
                      << std::abs(100.0 * seDH / dH) << "% rel se)\n";
        }
        else
            std::cout << "    b(T)    = " << std::scientific << std::setprecision(5)
                      << bRef << " +/- " << (tc * seB) << " 1/Pa at T_data = "
                      << std::fixed << std::setprecision(2) << tRefEff << " K\n"
                      << "    dH_ads  : NOT REPORTED --- one temperature "
                         "cannot see the van't Hoff slope\n"
                      << "              (structurally unidentifiable; add "
                         "isotherms at other temperatures)\n";
        }
        std::cout << "  Identifiability:  "
                  << (identifiable ? "parameters individually determined"
                                   : "NOT individually identifiable")
                  << "\n    cond(J*diag(theta)) = " << std::scientific
                  << std::setprecision(2) << condScaled
                  << (rankDeficient ? "  (> 1e8: RANK-DEFICIENT)" : "")
                  << "   max|corr| = " << std::fixed << std::setprecision(3)
                  << maxAbsCorr << "\n";
        if (ok && P >= 2)
        {
            std::cout << "    correlation matrix:\n";
            for (std::size_t i = 0; i < P; ++i)
            {
                std::cout << "      " << std::left << std::setw(8) << pname[i]
                          << std::right;
                for (std::size_t j = 0; j < P; ++j)
                {
                    scalar c = (i == j) ? 1.0
                        : ((i < j) ? diag_["corr." + pname[i] + "." + pname[j]]
                                   : diag_["corr." + pname[j] + "." + pname[i]]);
                    std::cout << "  " << std::fixed << std::setprecision(3)
                              << std::setw(7) << c;
                }
                std::cout << "\n";
            }
        }
        if (rankDeficient && !nullDir.empty())
        {
            std::cout << "    weakest direction (unit vector, theta-space):";
            for (std::size_t k = 0; k < P; ++k)
                std::cout << "  " << pname[k] << " " << std::fixed
                          << std::setprecision(3) << nullDir[k];
            std::cout << "\n";
        }
        if (endo)
            std::cout << "  *** ENDOTHERMIC ADSORPTION FITTED (dH_ads = +"
                      << std::fixed << std::setprecision(0) << dH
                      << " J/mol > 0) ---\n"
                      << "  *** physically suspicious, check the dataset "
                         "(sign convention, T ordering) ***\n";
        std::cout << "=====================================================================\n\n";
    }
    if (endo)
        AdvisoryLog::instance().add("physics", "warning",
            adsName + "/" + species,
            "endothermic adsorption fitted (dH_ads > 0) --- physically "
            "suspicious, check the dataset");
    if (!activeBounds.empty())
    {
        std::string list;
        for (const auto& nm : activeBounds)
            list += (list.empty() ? "" : ", ") + nm;
        AdvisoryLog::instance().add("fit", "warning",
            adsName + "/" + species,
            "fitted optimum outside the declared domain of " + list
            + " (active bound) --- proposal refused; the data and the "
              "declared bounds disagree");
    }

    // ---- proposal (opt-in): schema-exact record under data/local/ ---------
    //  Only an HONEST record is proposed: full van't Hoff fit, individually
    //  identifiable.  Human promotion (Vitor) moves it to standards; the
    //  engine NEVER writes the standards catalogue.
    if (dict->found("output") && dict->subDict("output")->found("proposal"))
    {
        const std::string prop = dict->subDict("output")->lookupWord("proposal");
        if (mode != IsoMode::LangFull)
        {
            if (verbosity >= 1)
                std::cout << "  (proposal skipped: single-T fit carries no "
                             "dH_ads --- a van't Hoff record cannot be "
                             "written honestly)\n";
        }
        else if (!statOk)
        {
            if (verbosity >= 1)
                std::cout << "  (proposal skipped: the fit did not EARN its "
                             "verdict (non-converged, unidentifiable or "
                             "non-finite errors) --- transcribing it into a "
                             "record would launder the uncertainty)\n";
        }
        else if (!activeBounds.empty())
        {
            if (verbosity >= 1)
            {
                std::cout << "  (proposal REFUSED: optimum outside the declared"
                             " domain of";
                for (const auto& nm : activeBounds) std::cout << " " << nm;
                std::cout << " --- the data and the declared bounds disagree;"
                             " fix one, never project the number)\n";
            }
        }
        else
        {
            namespace fs = std::filesystem;
            std::string outPath = prop;
            if (prop == "auto")
            {
                fs::path dir = fs::path(Database::currentRoot()) / "local"
                    / "adsorption" / "equilibria" / adsName;
                std::error_code ec;
                fs::create_directories(dir, ec);
                outPath = (dir / (species + ".dat")).string();
            }
            scalar Tlo = distinctT[0], Thi = distinctT[0];
            for (scalar T : distinctT)
            { Tlo = std::min(Tlo, T); Thi = std::max(Thi, T); }
            std::ofstream f(outPath);
            if (f)
            {
                f << "/*--------------------------------*- Choupo -*--------------------------------*\\\n"
                  << "  PROPOSED adsorption equilibrium record --- " << species
                  << " on " << adsName << ".\n\n"
                  << "  Regressed by choupoProps fitParameters (kind isotherm, "
                     "analytic-Jacobian LM,\n"
                  << "  ln-space positivity) on " << isoDateUtc() << ".  "
                  << n << " points, " << distinctT.size() << " temperatures ["
                  << std::fixed << std::setprecision(2) << Tlo << ", " << Thi
                  << "] K.\n"
                  << "  rms = " << std::scientific << std::setprecision(3)
                  << std::sqrt(chi2 / static_cast<scalar>(n))
                  << " (weighted), s2 = " << s2 << ", cond(J*diag(theta)) = "
                  << std::setprecision(2) << condScaled
                  << ", max|corr| = " << std::fixed << std::setprecision(3)
                  << maxAbsCorr << ".\n"
                  << "  95% CIs (t" << dof << "): q_max +/- "
                  << std::setprecision(4) << (tc * seQm) << " mol/kg, b_298 +/- "
                  << std::scientific << std::setprecision(3)
                  << (tc * seB / constant::Pa_to_bar) << " 1/bar, dH_ads +/- "
                  << std::fixed << std::setprecision(0) << (tc * seDH)
                  << " J/mol.\n\n"
                  << "  FOR HUMAN PROMOTION ONLY: review, then move to\n"
                  << "  data/standards/parameters/adsorption/equilibria/"
                  << adsName << "/" << species << ".dat\n"
                  << "  (the engine never writes the standards catalogue).\n"
                  << "\\*-----------------------------------------------------------------------------*/\n\n"
                  << "recordType      adsorptionIsotherm;\n"
                  << "schemaVersion   1;\n\n"
                  << "adsorbent       " << adsName << ";\n"
                  << "adsorbate       " << species << ";\n\n"
                  << "model           langmuir;\n\n"
                  << "parameters\n{\n"
                  << std::setprecision(8)
                  << "    q_max   " << std::defaultfloat << std::setprecision(9)
                  << qm << ";      // saturation loading [mol/kg]\n"
                  << "    b_298   " << (bRef / constant::Pa_to_bar)
                  << ";      // affinity at tRef [1/bar]\n"
                  << "    dH_ads  " << dH
                  << ";      // isosteric heat of adsorption [J/mol]"
                  << (dH > 0.0 ? "  // !! ENDOTHERMIC --- suspicious" : "")
                  << "\n}\n\n"
                  << "tRef            " << tRef << ";               // van't Hoff anchor [K]\n"
                  << "loadingBasis    molPerKgAdsorbent;    // q = mol adsorbate per kg adsorbent\n"
                  << "pressureBasis   partialPressureBar;   // p = partial pressure in bar (b_298 per bar)\n\n"
                  << "provenance\n{\n"
                  << "    origin    regressed;\n"
                  << "    method    \"" << citation << "; " << n
                  << " points, T in [" << std::fixed << std::setprecision(2)
                  << Tlo << ", " << Thi << "] K; weighted rms = "
                  << std::scientific << std::setprecision(3)
                  << std::sqrt(chi2 / static_cast<scalar>(n)) << " mol/kg, s2 = "
                  << s2 << "; LM (choupoProps fitParameters kind isotherm), "
                  << "ln-space positivity, identifiable\";\n"
                  << "    curation  \"PROPOSAL " << isoDateUtc()
                  << " --- pending human review and promotion; never "
                  << "auto-promoted\";\n"
                  << "}\n";
                if (verbosity >= 1)
                    std::cout << "  proposal written to: " << outPath << "\n\n";
            }
            else if (verbosity >= 1)
                std::cerr << "  fitParameters(isotherm): could not write "
                             "proposal " << outPath << "\n";
        }
    }

    return fit.converged ? 0 : 1;
}

} // namespace Choupo
