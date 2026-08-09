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
-------------------------------------------------------------------------------
Reference (public-domain method, primary source -- NOT a port of any code):
    Nocedal & Wright, Numerical Optimization, 2nd ed. (2006), Sec. 16.5
      (convex QP by an active set), eq. 16.4 (the equality KKT system).
    The reconciliation posture -- weighted least squares on measurements
      subject to the conservation laws they must satisfy -- is the standard
      one; see e.g. Narasimhan & Jordache, Data Reconciliation and Gross
      Error Detection (1999), Ch. 3, for the linear steady-state problem.

    NOTE ON THE INCLUDE LIST BELOW.  It is short on purpose and the shortness
    is the contract: `core/`, `solver/`, and the standard library.  Nothing
    from `thermo/`.  See AnalysisReconciler.H -- the one-way boundary of the
    ruling is enforced by what this translation unit is unable to name.
\*---------------------------------------------------------------------------*/

#include "streams/AnalysisReconciler.H"
#include "solver/ActiveSetQP.H"

#include <algorithm>
#include <cmath>
#include <sstream>
#include <stdexcept>

namespace Choupo::analysis
{

namespace
{

scalar dot(const sVector& a, const sVector& b)
{
    scalar s = 0.0;
    for (std::size_t i = 0; i < a.size(); ++i) s += a[i] * b[i];
    return s;
}

} // anonymous namespace

ReconciliationOutcome
reconcileWeightedLeastSquares(const ReconciliationRequest& req)
{
    const std::size_t n = req.rows.size();
    const std::size_t m = req.constraints.size();

    if (n == 0)
        throw std::runtime_error("analysis reconciliation: no measured"
            " quantity to reconcile.");
    if (m == 0)
        throw std::runtime_error("analysis reconciliation: weighted least"
            " squares with NO enforced constraint is not a reconciliation --"
            " the unconstrained minimum of Sum ((x-m)/sigma)^2 is x = m, so"
            " the answer would be the measurement returned unchanged while"
            " the record claimed it had been reconciled.  Declare at least"
            " one law in `enforce ( ... )`.");

    //  ---- (0) THE MEASUREMENT MUST CARRY A SCALE ---------------------------
    //  sigma is the whole content of the word WEIGHTED.  A zero sigma is an
    //  INFINITE weight, which silently pins a row and makes every other
    //  correction larger without saying so.
    for (const auto& r : req.rows)
    {
        if (!(r.sigma > 0.0))
            throw std::runtime_error("analysis reconciliation: quantity '"
                + r.label + "' carries no positive uncertainty (sigma = "
                + std::to_string(r.sigma) + ").  Weighted least squares"
                " weights each measurement by 1/sigma^2, so a zero sigma is"
                " an infinite weight: the row would be pinned and every"
                " other correction silently inflated to pay for it.");
        if (!std::isfinite(r.measured))
            throw std::runtime_error("analysis reconciliation: quantity '"
                + r.label + "' has a non-finite measured value.");
    }
    for (const auto& c : req.constraints)
        if (c.coeff.size() != n)
            throw std::runtime_error("analysis reconciliation: constraint '"
                + c.name + "' has " + std::to_string(c.coeff.size())
                + " coefficients for " + std::to_string(n)
                + " measured quantities.");

    //  ---- (1) THE PROBLEM, IN SIGMA UNITS ---------------------------------
    //  u_r = (x_r - m_r) / sigma_r.  Two reasons, and both matter:
    //    * SCALING -- the objective Hessian becomes the identity, so a sheet
    //      mixing millimolar calcium with micromolar iron is as well
    //      conditioned as one that does not.  In natural units the weights
    //      span 1/sigma^2 over many decades and the KKT system inherits it.
    //    * MEANING -- u IS the normalized correction the report publishes,
    //      so the number the solver works in is the number the reader sees.
    //
    //  Each constraint row is then normalised to unit length as well; the
    //  multiplier absorbs the factor and the attribution below is stated in
    //  terms of the SAME normalised rows, so it stays exact.
    solver::QPProblem qp;
    qp.B.assign(n, sVector(n, 0.0));
    for (std::size_t i = 0; i < n; ++i) qp.B[i][i] = 1.0;
    qp.g.assign(n, 0.0);

    std::vector<sVector> Anorm(m, sVector(n, 0.0));
    sVector rowScale(m, 1.0);
    for (std::size_t k = 0; k < m; ++k)
    {
        const auto& c = req.constraints[k];
        sVector row(n, 0.0);
        for (std::size_t r = 0; r < n; ++r) row[r] = c.coeff[r] * req.rows[r].sigma;
        scalar nrm = std::sqrt(dot(row, row));
        if (!(nrm > 0.0))
            throw std::runtime_error("analysis reconciliation: constraint '"
                + c.name + "' touches no adjustable quantity -- every"
                " coefficient is zero, so enforcing it can neither be"
                " satisfied nor violated by anything this reconciliation may"
                " move.  A law that cannot bind must not be declared"
                " enforced.");
        for (auto& v : row) v /= nrm;
        rowScale[k] = nrm;
        Anorm[k] = row;

        //  Aeq . u + beq = 0, with beq the residual of the law AT THE
        //  MEASUREMENT: Sum coeff*measured - target, scaled the same way.
        scalar resid = -c.target;
        for (std::size_t r = 0; r < n; ++r) resid += c.coeff[r] * req.rows[r].measured;
        qp.Aeq.push_back(row);
        qp.beq.push_back(resid / nrm);
    }

    //  NON-NEGATIVITY, always: x_r >= 0  <=>  -sigma_r u_r - m_r <= 0.
    //  Normalised (divide by sigma_r) to  -u_r - m_r/sigma_r <= 0, so these
    //  rows are unit vectors too and the multiplier mu_r is already in the
    //  same sigma units as everything else.
    qp.Aineq.assign(n, sVector(n, 0.0));
    qp.bineq.assign(n, 0.0);
    for (std::size_t r = 0; r < n; ++r)
    {
        qp.Aineq[r][r] = -1.0;
        qp.bineq[r]    = -req.rows[r].measured / req.rows[r].sigma;
    }

    solver::QPResult qr;
    try
    {
        qr = solver::activeSetQP(qp);
    }
    catch (const std::exception& e)
    {
        //  An infeasible or degenerate constraint set is a statement about
        //  the ANALYSIS, not a numerical accident, so it is reported as one.
        throw std::runtime_error(std::string("analysis reconciliation: the"
            " constrained least-squares problem could not be solved -- ")
            + e.what() + ".  This usually means the enforced laws contradict"
            " each other (two constraints that cannot both hold for any"
            " non-negative composition), or that one is a multiple of"
            " another.  Check the `enforce ( ... )` list.");
    }

    //  ---- (2) THE ANSWER --------------------------------------------------
    ReconciliationOutcome out;
    out.iterations = qr.iterations;
    out.note = qr.reason;
    out.rows.resize(n);

    for (std::size_t r = 0; r < n; ++r)
    {
        const scalar u = qr.d[r];
        auto& o = out.rows[r];
        o.correctionSigma = u;
        o.correction      = u * req.rows[r].sigma;
        o.adjusted        = req.rows[r].measured + o.correction;
        o.weight          = 1.0 / (req.rows[r].sigma * req.rows[r].sigma);
        o.atNonNegativityBound = qr.active[r];
        out.objective    += u * u;
    }

    //  ---- (3) THE ATTRIBUTION, EXACT ---------------------------------------
    //  At the optimum:  u + A^T lambda + Aineq^T mu = 0, i.e. for each row
    //      u_r = - Sum_k lambda_k A_{k,r}  +  mu_r
    //  so every part below is a genuine term of an identity, not a share
    //  invented after the fact.  The identity is CHECKED before it is
    //  published: an attribution that does not reconstruct its own
    //  correction is a report that reads like an explanation and is not one.
    for (std::size_t k = 0; k < m; ++k)
    {
        ConstraintOutcome co;
        co.name    = req.constraints[k].name;
        co.family  = req.constraints[k].family;
        co.meaning = req.constraints[k].meaning;
        co.multiplier = qr.lambdaEq[k];
        scalar rb = -req.constraints[k].target, ra = -req.constraints[k].target;
        for (std::size_t r = 0; r < n; ++r)
        {
            rb += req.constraints[k].coeff[r] * req.rows[r].measured;
            ra += req.constraints[k].coeff[r] * out.rows[r].adjusted;
        }
        co.residualBefore = rb;
        co.residualAfter  = ra;
        (void)rowScale[k];
        out.constraints.push_back(co);
    }

    for (std::size_t r = 0; r < n; ++r)
    {
        auto& o = out.rows[r];
        scalar recon = 0.0, absTotal = 0.0, best = 0.0;
        for (std::size_t k = 0; k < m; ++k)
        {
            const scalar part = -qr.lambdaEq[k] * Anorm[k][r];
            if (part == 0.0) continue;
            o.attribution.push_back({req.constraints[k].name, part});
            recon += part;
            absTotal += std::abs(part);
            if (std::abs(part) > std::abs(best))
            {
                best = part;
                o.responsibleConstraint = req.constraints[k].name;
            }
        }
        if (qr.lambdaIneq[r] != 0.0)
        {
            const scalar part = qr.lambdaIneq[r];
            o.attribution.push_back({"nonNegativity", part});
            recon += part;
            absTotal += std::abs(part);
            if (std::abs(part) > std::abs(best))
            {
                best = part;
                o.responsibleConstraint = "nonNegativity";
            }
        }
        o.responsibleShare = (absTotal > 0.0) ? std::abs(best) / absTotal : 0.0;
        if (o.attribution.empty()) o.responsibleConstraint = "none";

        if (std::abs(recon - o.correctionSigma)
                > 1.0e-8 * std::max(1.0, std::abs(o.correctionSigma)))
        {
            std::ostringstream os;
            os << "analysis reconciliation: the per-constraint attribution of"
                  " quantity '" << req.rows[r].label << "' does not"
                  " reconstruct its own correction (parts sum to " << recon
               << " sigma, the correction is " << o.correctionSigma
               << " sigma).  The reported explanation and the reported answer"
                  " would disagree, which is worse than reporting no"
                  " explanation at all.";
            throw std::runtime_error(os.str());
        }
    }

    for (std::size_t k = 0; k < m; ++k)
    {
        //  A constraint BINDS when it actually moved something.  Reported
        //  rather than inferred by the reader from a multiplier's magnitude,
        //  which is in sigma units and means nothing on its own.
        for (std::size_t r = 0; r < n && !out.constraints[k].binding; ++r)
            for (const auto& a : out.rows[r].attribution)
                if (a.constraint == out.constraints[k].name && a.deltaSigma != 0.0)
                    out.constraints[k].binding = true;
    }

    //  ---- (4) THE ANSWER MUST ACTUALLY SATISFY THE LAWS --------------------
    //  Cheap, and it is the difference between "the solver returned" and
    //  "the composition is admissible".
    for (const auto& c : out.constraints)
    {
        scalar scale = std::abs(c.residualBefore);
        for (std::size_t r = 0; r < n; ++r)
            scale = std::max(scale, std::abs(req.rows[r].measured));
        if (std::abs(c.residualAfter) > 1.0e-9 * std::max(scale, 1.0e-30))
        {
            std::ostringstream os;
            os << "analysis reconciliation: constraint '" << c.name
               << "' is still violated at the answer (residual "
               << c.residualAfter << ", was " << c.residualBefore
               << ").  The reconciliation exists to produce a composition"
                  " that satisfies it; returning one that does not would hand"
                  " the equilibrium an inadmissible inlet.";
            throw std::runtime_error(os.str());
        }
    }

    //  ---- (5) THE DECLARED LIMITS -----------------------------------------
    //  Reported, never enforced here: the caller owns the stream's name and
    //  therefore owns the refusal message.
    for (std::size_t r = 0; r < n; ++r)
    {
        const auto& o = out.rows[r];
        if (req.maxCorrectionSigma > 0.0
            && std::abs(o.correctionSigma) > req.maxCorrectionSigma)
            out.violations.push_back({req.rows[r].label, "sigma",
                                      std::abs(o.correctionSigma),
                                      req.maxCorrectionSigma});
        if (req.maxCorrectionPercent > 0.0 && req.rows[r].measured != 0.0)
        {
            const scalar pct = 100.0 * std::abs(o.correction / req.rows[r].measured);
            if (pct > req.maxCorrectionPercent)
                out.violations.push_back({req.rows[r].label, "percent", pct,
                                          req.maxCorrectionPercent});
        }
    }

    return out;
}

} // namespace Choupo::analysis
