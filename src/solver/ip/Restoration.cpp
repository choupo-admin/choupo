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
File
    Restoration.cpp

Description
    The minimum-violation restoration problem and its verdicts.  See
    Restoration.H.
\*---------------------------------------------------------------------------*/

#include "solver/ip/Restoration.H"

#include "solver/ip/InteriorPoint.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <functional>

namespace Choupo::solver
{

namespace
{

//  The restoration NLP over variables (x, p, n): see Restoration.H.
class RestorationProblem : public NLPProblem
{
public:
    RestorationProblem(const NLPProblem& core, const sVector& xL, const sVector& xU,
                       const sVector& xR, scalar mu, scalar rho)
        : core_(core), xL_(xL), xU_(xU), xR_(xR), n_(xR.size()), m_(core.numConstraints()),
          rho_(rho), zeta_(std::sqrt(mu)), D_(xR.size())
    {
        for (std::size_t i = 0; i < n_; ++i) { const scalar a = std::abs(xR[i]); D_[i] = a > 1.0 ? 1.0 / a : 1.0; }
        sVector c;
        sVector p(m_, 0.0), nn(m_, 0.0);
        if (core.constraints(xR, c))
            for (std::size_t j = 0; j < m_; ++j)
            {
                //  L1 (33): the positive solution of the restoration
                //  problem's stationarity for (p_j, n_j) at x = x_R.
                const scalar a = (mu - rho_ * c[j]) / (2.0 * rho_);
                nn[j] = a + std::sqrt(a * a + mu * c[j] / (2.0 * rho_));
                p[j] = c[j] + nn[j];
            }
        start_ = xR;
        start_.insert(start_.end(), p.begin(), p.end());
        start_.insert(start_.end(), nn.begin(), nn.end());
    }

    std::string name() const override { return "restoration of " + core_.name(); }
    std::size_t numVariables() const override { return n_ + 2 * m_; }
    std::size_t numConstraints() const override { return m_; }
    void variableBounds(sVector& xL, sVector& xU) const override
    {
        xL = xL_;  xU = xU_;
        xL.insert(xL.end(), 2 * m_, 0.0);
        xU.insert(xU.end(), 2 * m_, kInf);
    }
    sVector startingPoint() const override { return start_; }

    bool objective(const sVector& v, scalar& f) const override
    {
        scalar s = 0.0;
        for (std::size_t j = 0; j < 2 * m_; ++j) s += v[n_ + j];
        scalar prox = 0.0;
        for (std::size_t i = 0; i < n_; ++i) { const scalar d = D_[i] * (v[i] - xR_[i]); prox += d * d; }
        f = rho_ * s + 0.5 * zeta_ * prox;
        return true;
    }
    bool objectiveGradient(const sVector& v, sVector& g) const override
    {
        g.assign(n_ + 2 * m_, rho_);
        for (std::size_t i = 0; i < n_; ++i) g[i] = zeta_ * D_[i] * D_[i] * (v[i] - xR_[i]);
        return true;
    }
    bool constraints(const sVector& v, sVector& c) const override
    {
        if (!core_.constraints(sVector(v.begin(), v.begin() + n_), c)) return false;
        for (std::size_t j = 0; j < m_; ++j) c[j] += -v[n_ + j] + v[n_ + m_ + j];
        return true;
    }
    bool constraintJacobian(const sVector& v, DenseMatrix& J) const override
    {
        if (!core_.constraintJacobian(sVector(v.begin(), v.begin() + n_), J)) return false;
        for (std::size_t j = 0; j < m_; ++j)
        {
            J[j].resize(n_ + 2 * m_, 0.0);
            J[j][n_ + j] = -1.0;
            J[j][n_ + m_ + j] = 1.0;
        }
        return true;
    }
    bool hessianLagrangian(const sVector& v, scalar, const sVector& lambda, DenseMatrix& W) const override
    {
        //  The objective's own curvature is zeta D_R^2 on x; the constraints
        //  bring those of c(x) (objective weight 0 in the core problem).
        DenseMatrix Wc;
        if (!core_.hessianLagrangian(sVector(v.begin(), v.begin() + n_), 0.0, lambda, Wc)) return false;
        W.assign(n_ + 2 * m_, sVector(n_ + 2 * m_, 0.0));
        for (std::size_t r = 0; r < n_; ++r)
            for (std::size_t c = 0; c < n_; ++c) W[r][c] = Wc[r][c];
        for (std::size_t i = 0; i < n_; ++i) W[i][i] += zeta_ * D_[i] * D_[i];
        return true;
    }
    bool hasExactHessian() const override { return core_.hasExactHessian(); }
    std::string variableName(std::size_t i) const override
    {
        if (i < n_) return core_.variableName(i);
        return (i < n_ + m_ ? "p(" : "n(") + core_.constraintName((i - n_) % m_) + ")";
    }
    std::string constraintName(std::size_t j) const override { return core_.constraintName(j); }

private:
    const NLPProblem& core_;
    sVector xL_, xU_, xR_;
    std::size_t n_, m_;
    scalar rho_, zeta_;
    sVector D_, start_;
};

std::string fmt(const std::string& name, scalar v)
{
    char b[64];
    std::snprintf(b, sizeof b, "%.3e", v);
    return name + ": " + b;
}

} // namespace

RestorationOutcome runRestoration(const NLPProblem& core, const sVector& xLower, const sVector& xUpper,
                                  const sVector& xR, scalar mu, const IPParameters& par,
                                  const std::function<bool(const sVector&)>& exitTest,
                                  const sVector* rowScale)
{
    RestorationOutcome out;
    const std::size_t n = xR.size(), m = core.numConstraints();

    sVector cR;
    scalar cInf = 0.0;
    if (core.constraints(xR, cR))
        for (scalar v : cR) cInf = std::max(cInf, std::abs(v));

    RestorationProblem rp(core, xLower, xUpper, xR, mu, par.rho);

    IPOptions o;
    o.par = par;
    o.par.maxIterations = par.restorationMaxIterations;
    o.scaling = false;            //- the rows are already scaled
    o.relaxBounds = false;        //- the bounds arrive relaxed
    o.pushStartInside = false;    //- x_R is already inside by the fraction-to-the-boundary rule; (p, n) by (33)
    o.allowRestoration = false;   //- no restoration inside the restoration
    o.muStart = std::max(mu, cInf);                           //- L1 sec. 3.3.1
    o.earlyExit = [&](const sVector& v) { return exitTest(sVector(v.begin(), v.begin() + n)); };

    const IPResult r = InteriorPoint::algorithmA(rp, o);
    out.innerIterations = r.iterations;
    sVector x(r.x.begin(), r.x.begin() + std::min(n, r.x.size()));

    if (r.status == IPStatus::EarlyExit)
    {
        out.kind = RestorationOutcome::Kind::Recovered;
        out.x = x;
        out.note = "restoration: acceptable point after " + std::to_string(r.iterations) + " iterations";
        return out;
    }

    sVector c;
    scalar theta = 0.0, cMax = 0.0;
    const bool evaluated = x.size() == n && core.constraints(x, c);
    if (evaluated)
        for (std::size_t j = 0; j < m; ++j)
        {
            theta += std::abs(c[j]);
            cMax = std::max(cMax, std::abs(c[j]) / (rowScale ? (*rowScale)[j] : 1.0));
        }
    out.theta = theta;

    if (r.status == IPStatus::Converged && evaluated)
    {
        if (cMax > par.tol)
        {
            out.kind = RestorationOutcome::Kind::LocallyInfeasible;
            out.x = x;
            std::vector<std::pair<scalar, std::string>> rows;
            for (std::size_t j = 0; j < m; ++j)
            {
                const scalar res = std::abs(c[j]) / (rowScale ? (*rowScale)[j] : 1.0);
                if (res > par.tol) rows.emplace_back(res, fmt(core.constraintName(j), c[j] / (rowScale ? (*rowScale)[j] : 1.0)));
            }
            std::sort(rows.begin(), rows.end(), [](const auto& a, const auto& b) { return a.first > b.first; });
            for (const auto& rw : rows) out.violatedRows.push_back(rw.second);
            out.note = "restoration converged to a point with ||c||_1 = " + fmt("", theta).substr(2)
                       + ": a local minimum of the constraint violation (it cannot be reduced further from here)";
            return out;
        }
        out.kind = RestorationOutcome::Kind::Recovered;      //- a feasible point was found
        out.x = x;
        out.note = "restoration converged to a feasible point";
        return out;
    }

    out.kind = RestorationOutcome::Kind::Failed;
    out.note = std::string("restoration problem stopped: ") + statusName(r.status) + " (" + r.message + ")";
    return out;
}

} // namespace Choupo::solver
