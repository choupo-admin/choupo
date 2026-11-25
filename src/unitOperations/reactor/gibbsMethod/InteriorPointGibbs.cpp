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

#include "InteriorPointGibbs.H"

#include "core/Advisory.H"
#include "core/Constants.H"
#include "solver/ip/InteriorPoint.H"
#include "solver/ip/NLPProblem.H"
#include "thermo/Component.H"
#include "thermo/equationOfState/EquationOfState.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <map>
#include <set>
#include <sstream>
#include <stdexcept>

namespace Choupo {

namespace {

using solver::DenseMatrix;
using solver::kInf;

//  ---------------------------------------------------------------------------
//  THE NLP: G/RT of an ideal gas phase and an ideal liquid phase, in amounts
//  scaled by the total feed moles, over the element balances.
//
//  Variables  x = ( u_0 .. u_{N-1} | w_0 .. w_{K-1} ):  the gas amounts of the N
//  species and the liquid amounts of the K condensables, each divided by the
//  total feed moles N0.
//
//  f(x) = sum_i u_i (gt_i + ln u_i) - U ln U  +  sum_k w_k (gl_k + ln w_k) - W ln W
//         U = sum u_i,  W = sum w_k,  gt_i = g_i/RT + ln(P/P0),
//         gl_k = g_k/RT + ln(f_k/P0)       (f_k: the pure-liquid fugacity)
//  c(x) = A u + A_c w - b/N0
//
//  grad f   = gt_i + ln(u_i/U)  |  gl_k + ln(w_k/W)             (mu/RT of each species)
//  hess f   = diag(1/u) - 1/U   (gas block)  |  diag(1/w) - 1/W  (liquid block)
//  The constraints are linear: the Hessian of the Lagrangian is sigma hess f.
//  ---------------------------------------------------------------------------
class GibbsNLP : public solver::NLPProblem
{
public:
    GibbsNLP(const GibbsProblem& p, sVector gt, sVector gl, std::vector<std::size_t> condIdx,
             scalar N0, bool guardGas, std::vector<std::string> names)
        : p_(p), gt_(std::move(gt)), gl_(std::move(gl)), cond_(std::move(condIdx)), N0_(N0),
          guardGas_(guardGas), names_(std::move(names)), N_(p.N()), K_(cond_.size()), M_(p.M())
    {
        bt_.resize(M_);
        for (std::size_t j = 0; j < M_; ++j) bt_[j] = p_.b[j] / N0_;
    }

    std::string name() const override { return "gibbs reactor"; }
    std::size_t numVariables() const override { return N_ + K_; }
    std::size_t numConstraints() const override { return M_; }
    void variableBounds(sVector& xL, sVector& xU) const override
    {
        xL.assign(N_ + K_, 0.0);
        xU.assign(N_ + K_, kInf);
    }
    sVector startingPoint() const override
    {
        sVector x(N_ + K_, 0.0);
        for (std::size_t i = 0; i < N_; ++i) x[i] = p_.nIn[i] / N0_;
        return x;
    }
    //  THE GAS SPECIES carry no barrier in variant (b): the entropy term repels zero.
    bool isGuardOnly(std::size_t i) const override { return guardGas_ && i < N_; }

    bool objective(const sVector& x, scalar& f) const override
    {
        scalar U = 0.0, W = 0.0;
        f = 0.0;
        for (std::size_t i = 0; i < N_; ++i)
        {
            if (!(x[i] > 0.0)) return false;
            U += x[i];
            f += x[i] * (gt_[i] + std::log(x[i]));
        }
        f -= U * std::log(U);
        if (K_)
        {
            scalar fl = 0.0;
            for (std::size_t k = 0; k < K_; ++k)
            {
                const scalar w = x[N_ + k];
                if (!(w > 0.0)) return false;
                W += w;
                fl += w * (gl_[k] + std::log(w));
            }
            f += fl - W * std::log(W);
        }
        return std::isfinite(f);
    }
    bool objectiveGradient(const sVector& x, sVector& g) const override
    {
        g.assign(N_ + K_, 0.0);
        scalar U = 0.0, W = 0.0;
        for (std::size_t i = 0; i < N_; ++i) { if (!(x[i] > 0.0)) return false; U += x[i]; }
        for (std::size_t k = 0; k < K_; ++k) { if (!(x[N_ + k] > 0.0)) return false; W += x[N_ + k]; }
        for (std::size_t i = 0; i < N_; ++i) g[i] = gt_[i] + std::log(x[i] / U);
        for (std::size_t k = 0; k < K_; ++k) g[N_ + k] = gl_[k] + std::log(x[N_ + k] / W);
        return true;
    }
    bool constraints(const sVector& x, sVector& c) const override
    {
        c.assign(M_, 0.0);
        for (std::size_t j = 0; j < M_; ++j)
        {
            scalar s = -bt_[j];
            for (std::size_t i = 0; i < N_; ++i) s += p_.A[j][i] * x[i];
            for (std::size_t k = 0; k < K_; ++k) s += p_.A[j][cond_[k]] * x[N_ + k];
            c[j] = s;
        }
        return true;
    }
    bool constraintJacobian(const sVector&, DenseMatrix& J) const override
    {
        J.assign(M_, sVector(N_ + K_, 0.0));
        for (std::size_t j = 0; j < M_; ++j)
        {
            for (std::size_t i = 0; i < N_; ++i) J[j][i] = p_.A[j][i];
            for (std::size_t k = 0; k < K_; ++k) J[j][N_ + k] = p_.A[j][cond_[k]];
        }
        return true;
    }
    bool hessianLagrangian(const sVector& x, scalar sigma, const sVector&, DenseMatrix& Hm) const override
    {
        Hm.assign(N_ + K_, sVector(N_ + K_, 0.0));
        if (sigma == 0.0) return true;
        scalar U = 0.0, W = 0.0;
        for (std::size_t i = 0; i < N_; ++i) { if (!(x[i] > 0.0)) return false; U += x[i]; }
        for (std::size_t k = 0; k < K_; ++k) { if (!(x[N_ + k] > 0.0)) return false; W += x[N_ + k]; }
        for (std::size_t i = 0; i < N_; ++i)
        {
            for (std::size_t j = 0; j < N_; ++j) Hm[i][j] = -sigma / U;
            Hm[i][i] += sigma / x[i];
        }
        for (std::size_t k = 0; k < K_; ++k)
        {
            for (std::size_t l = 0; l < K_; ++l) Hm[N_ + k][N_ + l] = -sigma / W;
            Hm[N_ + k][N_ + k] += sigma / x[N_ + k];
        }
        return true;
    }
    bool hasExactHessian() const override { return true; }
    std::string variableName(std::size_t i) const override
    {
        return i < N_ ? "n_gas[" + names_[i] + "]" : "n_liq[" + names_[cond_[i - N_]] + "]";
    }
    std::string constraintName(std::size_t j) const override
    {
        return j < p_.elements.size() ? "balance[" + p_.elements[j] + "]" : "balance[" + std::to_string(j + 1) + "]";
    }

private:
    const GibbsProblem& p_;
    sVector gt_, gl_;
    std::vector<std::size_t> cond_;
    scalar N0_;
    bool guardGas_;
    std::vector<std::string> names_;
    std::size_t N_, K_, M_;
    sVector bt_;
};

std::string sci(scalar v, int digits = 6)
{
    char b[48];
    std::snprintf(b, sizeof b, "%.*e", digits, v);
    return b;
}

} // namespace

// ===========================================================================
//  The method
// ===========================================================================

GibbsEquilibrium InteriorPointGibbs::equilibrium(const GibbsProblem& p, scalar T,
                                                 const IterHook& onIter, const GibbsLog& log) const
{
    const auto&       thermo = *p.thermo;
    const std::size_t N = p.N(), M = p.M();

    //  WHAT THIS SLICE DOES NOT CARRY, REFUSED BY NAME (design sec. 7, rows B2 and B3).
    if (!thermo.eos().isIdeal())
        throw std::runtime_error("GibbsReactor (model interiorPoint): the thermodynamic package carries a"
            " non-ideal equation of state, and the interiorPoint method prices the gas as an IDEAL gas in"
            " slice B1 -- fugacity coefficients (a finite-difference Hessian part) are slice B3 of the"
            " interior-point plan (docs/design/interior-point.md sec. 7).  Use `model elementPotential;`"
            " (which folds ln phi in by successive substitution), or an ideal-gas package.");

    scalar N0 = 0.0;
    for (scalar v : p.nIn) N0 += v;
    if (!(N0 > 0.0)) N0 = 1.0;
    const scalar lnP = std::log(p.P / constant::Pref);

    //  g_i/RT at the CHEMISTRY temperature (T + dTapproach), the pure liquid at the physical T:
    //  exactly the two references elementPotential uses (ElementPotential.cpp).
    sVector gRT(N), gt(N);
    std::vector<std::string> names(N);
    for (std::size_t i = 0; i < N; ++i)
    {
        gRT[i] = thermo.comp(p.compIdx[i]).g_pure_ig(T + p.dTapproach) / (constant::R * (T + p.dTapproach));
        gt[i]  = gRT[i] + lnP;
        names[i] = thermo.comp(p.compIdx[i]).name();
    }
    std::vector<std::size_t> cond;
    sVector gl;
    for (std::size_t i = 0; i < N; ++i)
    {
        if (!canCondenseAt(p, i, T)) continue;
        cond.push_back(i);
        gl.push_back(gRT[i] + std::log(thermo.pureLiquidReference(p.compIdx[i], T, p.P) / constant::Pref));
    }
    const std::size_t K = cond.size();

    const bool everyAmount = opt_.barrierOnEveryAmount;
    GibbsNLP nlp(p, gt, gl, cond, N0, /*guardGas=*/!everyAmount, names);

    solver::IPOptions ipo;
    const solver::IPResult r = solver::InteriorPoint::solve(nlp, ipo);

    GibbsEquilibrium eq;
    eq.nGas.assign(N, 0.0);
    eq.nLiq.assign(N, 0.0);
    eq.iterations = static_cast<int>(r.iterations);
    if (onIter)
        for (const auto& row : r.trace.rows) onIter(static_cast<int>(row.iteration), row.infDu, row.alphaPr);

    //  THE LIMIT OF THE BARRIER-FREE VARIANT, MEASURED (gibbs06_thermal_nox, 1800 K, lean): a species at
    //  ~1e-40 of the feed (here CH4) contributes ~1e-43 to G/RT, so the objective cannot SEE the step that
    //  corrects it, the filter accepts only round-off in theta and the run stops "restoration failed" at a
    //  FEASIBLE point with its dual infeasibility at 1e-3.  That point is exactly what the element-potential
    //  polish exists for (design sec. 2.9): pi = -lambda is close, the Newton in ln n finishes it.  So a
    //  feasible stop is RESCUED by the polish, announced, published only if the polish converges.
    const bool rescue = !r.converged()
        && (r.status == solver::IPStatus::RestorationFailed || r.status == solver::IPStatus::StepTooSmall)
        && r.constraintViolation <= 1.0e-8;
    if (!r.converged() && !rescue)
    {
        eq.converged = false;
        eq.residual = r.kktError;
        eq.notConvergedCause = std::string("the interior-point run ended \"") + solver::statusName(r.status)
            + "\": " + r.message;
        reportBrief_ = "  interiorPoint: NOT CONVERGED (" + std::string(solver::statusName(r.status)) + ")\n";
        reportDetail_ = reportBrief_ + "    iteration trace:\n      " + solver::IPTrace::headerLine() + "\n";
        for (const auto& row : r.trace.rows) reportDetail_ += "      " + solver::IPTrace::format(row) + "\n";
        kpis_.clear();
        return eq;
    }

    //  ---- THE PHASE SET.  The liquid is present iff the tangent-plane sum of the ideal liquid reaches 1:
    //  with pi = -lambda, d_k = g_k/RT + ln(f_k/P0) - (A_k . pi), x_k = exp(-d_k) is the liquid that
    //  would be in equilibrium with the gas, and sum_k exp(-d_k) >= 1 is Michelsen's condition for it.
    //  A liquid amount the barrier left at mu/z below that is a GHOST, set to zero (and its mass is
    //  what the polish below reports).
    sVector lambda = r.lambda;
    sVector piIP(M);
    for (std::size_t j = 0; j < M; ++j) piIP[j] = -lambda[j];                       // THE BRIDGE
    scalar tpd = 0.0;
    for (std::size_t k = 0; k < K; ++k)
    {
        scalar Api = 0.0;
        for (std::size_t j = 0; j < M; ++j) Api += p.A[j][cond[k]] * piIP[j];
        tpd += std::exp(-(gl[k] - Api));
    }
    const bool liquidPresent = K > 0 && tpd > 1.0 - 1.0e-7;
    scalar ghostMass = 0.0;
    if (K > 0 && !liquidPresent)
        for (std::size_t k = 0; k < K; ++k) ghostMass += r.x[N + k] * N0;

    for (std::size_t i = 0; i < N; ++i) eq.nGas[i] = r.x[i] * N0;
    if (liquidPresent)
        for (std::size_t k = 0; k < K; ++k) eq.nLiq[cond[k]] = r.x[N + k] * N0;
    scalar NgIP = 0.0, NlIP = 0.0;
    for (scalar v : eq.nGas) NgIP += v;
    for (scalar v : eq.nLiq) NlIP += v;
    if (!(NgIP > 1.0e-8 * N0))
        throw std::runtime_error("GibbsReactor (model interiorPoint): the gas phase vanished at the"
            " optimum (" + sci(NgIP) + " mol/s of " + sci(N0) + " fed) -- a whole phase disappearing is"
            " the stated limit of the barrier-free variant (design record sec. 8, R1; stage C).  Use"
            " `model elementPotential;` or `reactiveFlash`.");

    //  ---- THE POLISH (design sec. 2.9): the amounts recomputed from pi = -lambda and finished by the
    //  existing element-potential Newton on the gas, whose seed this is.  Always COMPUTED, so its largest
    //  change is a measurement; PUBLISHED only under `barrier everyAmount`.
    sVector bGas = p.b;
    for (std::size_t k = 0; k < K; ++k)
        for (std::size_t j = 0; j < M; ++j) bGas[j] -= p.A[j][cond[k]] * eq.nLiq[cond[k]];
    sVector seed(M + 1);
    for (std::size_t j = 0; j < M; ++j) seed[j] = piIP[j];
    seed[M] = std::log(NgIP);
    GibbsEquilibrium pol = gibbsGasSolve(p, T, gRT, bGas, {}, {}, &seed);
    scalar polishRel = 0.0, polishAbs = 0.0, piDiff = 0.0;
    std::string polishSpecies = "-";
    if (pol.converged)
    {
        for (std::size_t i = 0; i < N; ++i)
        {
            const scalar nP = pol.nGas[i], nI = eq.nGas[i];
            polishAbs = std::max(polishAbs, std::abs(nP - nI) / N0);
            if (nP > 1.0e-30 * N0)
            {
                const scalar rel = std::abs(nP - nI) / nP;
                if (rel > polishRel) { polishRel = rel; polishSpecies = names[i]; }
            }
        }
        for (std::size_t j = 0; j < M; ++j) piDiff = std::max(piDiff, std::abs(pol.pi[j] - piIP[j]));
    }
    const bool usePolish = (everyAmount || rescue) && pol.converged;
    if (rescue && !pol.converged)
    {
        eq.converged = false;
        eq.notConvergedCause = std::string("the interior-point run ended \"") + solver::statusName(r.status)
            + "\" and the element-potential polish from pi = -lambda did not converge either";
        reportBrief_ = reportDetail_ = "  interiorPoint: NOT CONVERGED (" + std::string(solver::statusName(r.status)) + ", polish failed)\n";
        kpis_.clear();
        return eq;
    }
    if (everyAmount && !rescue && !pol.converged)
        throw std::runtime_error("GibbsReactor (model interiorPoint, barrier everyAmount): the element-potential"
            " polish did not converge from pi = -lambda (" + pol.notConvergedCause + ")");
    if (usePolish) eq.nGas = pol.nGas;

    eq.Ntotal_gas = 0.0;  eq.Ntotal_liq = 0.0;
    for (scalar v : eq.nGas) eq.Ntotal_gas += v;
    for (scalar v : eq.nLiq) eq.Ntotal_liq += v;
    eq.twoPhase = liquidPresent && eq.Ntotal_liq > 0.0;
    eq.pi = usePolish ? pol.pi : piIP;
    eq.converged = true;
    scalar res = 0.0;
    for (std::size_t j = 0; j < M; ++j)
    {
        scalar s = -p.b[j];
        for (std::size_t i = 0; i < N; ++i) s += p.A[j][i] * (eq.nGas[i] + eq.nLiq[i]);
        res = std::max(res, std::abs(s));
    }
    eq.residual = res;

    //  An independent last look, the one every method gives: a condensable the answer left supersaturated.
    {
        std::vector<bool> condensed(N, false);
        if (liquidPresent)
            for (std::size_t k = 0; k < K; ++k) condensed[cond[k]] = true;
        eq.supersaturatedNotCondensed = supersaturatedCondensables(p, eq, T, condensed);
    }

    // ---- the record --------------------------------------------------------------------------
    //  Stage, iteration, quantity: the per-iteration trace, the bridge, the amounts.
    if (log)
    {
        for (const auto& row : r.trace.rows)
        {
            const int it = static_cast<int>(row.iteration);
            log({"interiorPoint", it, "mu", row.mu, "-"});
            log({"interiorPoint", it, "phi_mu", row.phi, "-"});
            log({"interiorPoint", it, "theta", row.theta, "-"});
            log({"interiorPoint", it, "inf_du", row.infDu, "-"});
            log({"interiorPoint", it, "compl", row.compl_, "-"});
            log({"interiorPoint", it, "dx_norm", row.dxNorm, "-"});
            log({"interiorPoint", it, "dw", row.dw, "-"});
            log({"interiorPoint", it, "alpha_pr", row.alphaPr, "-"});
            log({"interiorPoint", it, "alpha_du", row.alphaDu, "-"});
            log({"interiorPoint", it, "line_search_trials", static_cast<scalar>(row.lineSearchTrials), "-"});
            log({"interiorPoint", it, "filter_size", static_cast<scalar>(row.filterSize), "-"});
        }
        for (std::size_t j = 0; j < M; ++j)
        {
            const std::string e = j < p.elements.size() ? p.elements[j] : std::to_string(j + 1);
            log({"bridge", 0, "lambda_" + e, lambda[j], "-"});
            log({"bridge", 0, "pi_" + e, eq.pi[j], "-"});
        }
        for (std::size_t i = 0; i < N; ++i)
        {
            log({"amounts", 0, "n_gas_" + names[i], eq.nGas[i], "mol/s"});
            if (eq.nLiq[i] > 0.0) log({"amounts", 0, "n_liq_" + names[i], eq.nLiq[i], "mol/s"});
        }
        log({"polish", 0, "largest_relative_change", polishRel, "-"});
        log({"polish", 0, "largest_change_over_feed", polishAbs, "-"});
    }

    //  ---- the report: the bridge, the barrier, the polish --------------------------------------
    scalar muFinal = r.trace.rows.empty() ? 0.0 : r.trace.rows.back().mu;
    std::ostringstream brief, detail;
    brief << "  interiorPoint (Choupo-IP, filter line search; barrier on "
          << (everyAmount ? "EVERY amount, then the element-potential polish" : "the liquid only: the gas species carry none")
          << "):\n"
          << "    " << (N + K) << " unknowns (" << N << " gas" << (K ? " + " + std::to_string(K) + " liquid" : std::string())
          << "), " << M << " element balances, analytic gradient and Hessian; "
          << r.iterations << " iterations, " << r.inertiaCorrections << " inertia corrections, "
          << r.restorations << " restorations, final mu " << sci(muFinal, 2) << ", KKT error " << sci(r.kktError, 2) << "\n"
          << (rescue ? "    RESCUED BY THE POLISH: the run ended \"" + std::string(solver::statusName(r.status)) + "\" at a feasible point with the dual infeasibility at "
                       + sci(r.kktError, 2) + " (a trace amount the objective cannot see); the element-potential Newton from pi = -lambda finished it\n" : std::string())
          << "    THE BRIDGE  pi = -lambda  (the multiplier of each element balance IS minus its element potential):\n";
    for (std::size_t j = 0; j < M; ++j)
    {
        const std::string e = j < p.elements.size() ? p.elements[j] : std::to_string(j + 1);
        brief << "      " << e << "   lambda = " << sci(lambda[j], 10) << "   pi = -lambda = " << sci(piIP[j], 10);
        if (pol.converged) brief << "   polished pi = " << sci(pol.pi[j], 10);
        brief << "\n";
    }
    brief << "    polish: element-potential Newton from pi = -lambda, "
          << (pol.converged ? std::to_string(pol.iterations) + " iterations" : std::string("did not converge"))
          << "; largest change " << sci(polishRel, 2) << " relative (" << polishSpecies << "), "
          << sci(polishAbs, 2) << " of the feed, pi " << sci(piDiff, 2)
          << (usePolish ? "  [published]" : "  [reported, not applied]") << "\n";
    if (K)
        brief << "    liquid: IDEAL mixture of " << K << " condensable" << (K > 1 ? "s" : "") << " (Raoult; an activity model of the package is not read); tangent-plane sum "
              << sci(tpd, 8) << (liquidPresent ? " (>= 1 - 1e-7): present" : " < 1: absent (barrier ghost " + sci(ghostMass, 2) + " mol/s dropped)") << "\n";
    detail << brief.str() << "    iteration trace (mu, scaled dual infeasibility, element-balance infeasibility theta, complementarity, step lengths):\n"
           << "      " << solver::IPTrace::headerLine() << "\n";
    for (const auto& row : r.trace.rows) detail << "      " << solver::IPTrace::format(row) << "\n";
    reportBrief_ = brief.str();
    reportDetail_ = detail.str();

    kpis_.clear();
    kpis_["ip_iterations"] = static_cast<scalar>(r.iterations);
    kpis_["ip_inertiaCorrections"] = static_cast<scalar>(r.inertiaCorrections);
    kpis_["ip_restorations"] = static_cast<scalar>(r.restorations);
    kpis_["ip_barrierOnEveryAmount"] = everyAmount ? 1.0 : 0.0;
    kpis_["ip_rescuedByPolish"] = rescue ? 1.0 : 0.0;
    kpis_["ip_polishLargestRelativeChange"] = polishRel;
    for (std::size_t j = 0; j < M; ++j)
        kpis_["ip_lambda_" + (j < p.elements.size() ? p.elements[j] : std::to_string(j + 1))] = lambda[j];
    return eq;
}

std::string InteriorPointGibbs::report(bool detailed) const
{
    return detailed ? reportDetail_ : reportBrief_;
}

std::map<std::string, scalar> InteriorPointGibbs::extraKpis() const
{
    return kpis_;
}

// ===========================================================================
//  The optional block
// ===========================================================================

InteriorPointGibbs::Options InteriorPointGibbs::readBlock(const DictPtr& block)
{
    Options o;
    if (!block) return o;
    static const std::set<std::string> known = {"barrier", "barrierUpdate", "globalization", "log"};
    for (const std::string& key : block->keys())
        if (!known.count(key))
            throw std::runtime_error("GibbsReactor: unknown key `" + key + "` in `interiorPoint { }`; the block"
                " reads barrier, barrierUpdate, globalization and log (no tolerance or maxIter key exists: the"
                " tolerances are the optimizer's own and are printed in its header).");
    const std::string bar = block->lookupWordOrDefault("barrier", "pureCondensedOnly");
    if (bar == "everyAmount") o.barrierOnEveryAmount = true;
    else if (bar != "pureCondensedOnly")
        throw std::runtime_error("GibbsReactor: `interiorPoint { barrier " + bar + "; }` -- the values are"
            " `pureCondensedOnly` (no barrier on the species of the gas phase; the default, review R1 variant b)"
            " and `everyAmount` (a barrier on every amount, then the element-potential polish; variant a).");
    const std::string upd = block->lookupWordOrDefault("barrierUpdate", "monotone");
    if (upd != "monotone")
        throw std::runtime_error("GibbsReactor: `interiorPoint { barrierUpdate " + upd + "; }` -- only `monotone`"
            " exists; the adaptive rule is slice A3 of the interior-point plan, not built.");
    const std::string glob = block->lookupWordOrDefault("globalization", "filter");
    if (glob != "filter")
        throw std::runtime_error("GibbsReactor: `interiorPoint { globalization " + glob + "; }` -- only `filter`"
            " exists; the merit-function globalization is slice A4 of the interior-point plan, not built.");
    o.log = block->lookupWordOrDefault("log", "");
    if (!o.log.empty()) refuseGibbsLogPath(o.log);
    return o;
}

void InteriorPointGibbs::refuseBlockUnder(const std::string& modelName)
{
    throw std::runtime_error("GibbsReactor: the unit declares an `interiorPoint { }` block but `model " + modelName
        + ";` -- the block configures the interior-point method and is read only under `model interiorPoint;`."
          "  Remove the block, or select the model.");
}

} // namespace Choupo
