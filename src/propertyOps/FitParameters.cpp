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
#include "thermo/Database.H"
#include "thermo/ThermoPackage.H"
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
                        int* nFailed = nullptr)
{
    const std::size_t n = thermo.n();
    const std::size_t N = xData_first.size();
    residualsOut.assign(N, 0.0);
    scalar chi2 = 0.0;
    if (nFailed) *nFailed = 0;

    for (std::size_t k = 0; k < N; ++k)
    {
        sVector x(n, 0.0);
        x[0] = xData_first[k];
        x[1] = 1.0 - xData_first[k];

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
    if (!thermoDict() || !database())
        throw std::runtime_error(
            "fitParameters: needs thermoDict + database (set by choupoProps "
            "main before.run()) --- a thermoPackage REBUILD per iteration "
            "is required for parameter regression");

    // -- parameters --------------------------------------------------------
    auto paramList = dict->lookupDictList("parameters");
    if (paramList.empty())
        throw std::runtime_error("fitParameters: 'parameters' list is empty");

    std::vector<ParamSpec> params;
    params.reserve(paramList.size());
    for (const auto& p : paramList)
    {
        ParamSpec ps;
        ps.path  = p->lookupWord("path");
        ps.value = p->lookupScalar("initial");
        ps.lo    = p->found("min") ? p->lookupScalar("min") : -1.0e30;
        ps.hi    = p->found("max") ? p->lookupScalar("max") :  1.0e30;
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
        // Opt-in promote: write a binary-pair proposal .dat for the fitted
        // pair (the author's explicit act; the GUI never writes -- credo).
        // `auto` => the canonical constant/binaryPairs/<model>/<pair>.fit-<date>.dat.
        if (o->found("proposal")) proposalPath = o->lookupWord("proposal");
    }

    // -- Build initial thermoPackage --------------------------------------
    // Mutable copy of the thermoDict (we'll setScalarAtPath into it).
    DictPtr work = thermoDict();
    auto buildThermo = [&](const std::vector<ParamSpec>& current)
    {
        for (const auto& ps : current)
            work->setScalarAtPath(ps.path, ps.value);
        ThermoPackage tp;
        tp.readFromDict(work, *database());
        return tp;
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

    // -- LM loop -----------------------------------------------------------
    sVector r_curr;
    ThermoPackage thermo = buildThermo(params);
    scalar chi2 = computeResiduals(thermo, P_data, xExp, tExp, r_curr);

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
            computeResiduals(thermoH, P_data, xExp, tExp, r_h);
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
                                              xExp, tExp, r_trial);

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
    if (!parityPath.empty())
    {
        std::ofstream pcsv(parityPath);
        pcsv << "x_1,T_exp,T_model,residual\n";
        for (std::size_t k = 0; k < N; ++k)
        {
            sVector x(thermo.n(), 0.0);
            x[0] = xExp[k]; x[1] = 1.0 - xExp[k];
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
        computeResiduals(thermo, P_data, xExp, tExp, r_final, &nFailed);

        std::vector<sVector> Jf(N, sVector(P, 0.0));
        for (std::size_t j = 0; j < P; ++j)
        {
            scalar p0 = params[j].value;
            scalar h  = fdStep * std::max(std::abs(p0), 1.0);
            params[j].value = p0 + h;
            ThermoPackage thH = buildThermo(params);
            sVector rh;
            computeResiduals(thH, P_data, xExp, tExp, rh);
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
            int pairIdx = -1; bool singlePair = true;
            std::map<std::string, scalar> coef;   // a_ij/b_ij/a_ji/b_ji -> value
            for (const auto& ps : params)
            {
                auto lb = ps.path.find("pairs[");
                auto rb = ps.path.find(']');
                auto dot = ps.path.rfind('.');
                if (lb == std::string::npos || rb == std::string::npos
                    || dot == std::string::npos || rb < lb)
                { singlePair = false; break; }
                int k = std::atoi(ps.path.substr(lb + 6, rb - lb - 6).c_str());
                if (pairIdx == -1) pairIdx = k;
                else if (pairIdx != k) { singlePair = false; break; }
                coef[ps.path.substr(dot + 1)] = ps.value;
            }

            if (singlePair && pairIdx >= 0)
            {
                auto am = work->subDict("activityModel");
                const std::string model = am->lookupWordOrDefault("model", "NRTL");
                auto pairs = am->lookupDictList("pairs");
                if (pairIdx < static_cast<int>(pairs.size()))
                {
                    auto pd = pairs[static_cast<std::size_t>(pairIdx)];
                    const std::string ci = pd->lookupWord("i");
                    const std::string cj = pd->lookupWord("j");
                    const scalar alpha = pd->lookupScalarOrDefault("alpha", 0.30);
                    const std::string pairName = (ci < cj ? ci + "-" + cj : cj + "-" + ci);

                    namespace fs = std::filesystem;
                    std::string outPath = proposalPath;
                    if (proposalPath == "auto")
                    {
                        fs::path outDir = fs::path("constant") / "binaryPairs" / model;
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
                          << "      mv " << outPath << "  constant/binaryPairs/" << model << "/" << pairName << ".dat\n"
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

} // namespace Choupo
