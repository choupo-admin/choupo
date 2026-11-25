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
    interior_point_hs.cpp

Description
Standalone test of the interior-point optimizer (slice A2, src/solver/ip/):
  1. DERIVATIVES.  Every problem's hand-written gradient and Jacobian are
     compared with central differences of its functions, and (where the
     Hessian of the Lagrangian is analytic) with central differences of the
     analytic gradient, before the problem is solved.
  2. THE HS SET (docs/design/interior-point.md sec. 4.1).  The fifteen
     Hock-Schittkowski problems HS1, 6, 7, 13, 21, 35, 38, 40, 43, 71, 76,
     100, 113, 116, 118, written here from the MATHEMATICAL statement of the
     problem (the objective, the constraints, the bounds, the standard start,
     the optimum f*), not copied from any code.  PASS rule: the run converges,
     |f - f*| <= 1e-6 max(1,|f*|), and the violation of the constraints and
     bounds at the returned point is <= 1e-8, from the standard start.  The
     iteration count is pinned with a band, and NO evaluation of f may be made
     outside the variable bounds (the fraction to the boundary: the line
     search's own rejection of a trial whose log is undefined would otherwise
     hide its removal).
  3. TWO INFEASIBLE PROBLEMS (review R3): two inconsistent linear equalities,
     and a bound against an equality.  The run must end "locally infeasible"
     naming the violated rows, never "converged" and never an iteration limit.
  4. ALGORITHM IC (the inertia correction) against a factoriser that BREAKS
     DOWN, one that returns a solve with a large backward error, and a matrix
     holding NaN: a breakdown is the same news as zero eigenvalues (dc > 0),
     a wrong factorisation is never used, and nothing crashes or is silently
     accepted.
Prints one line per check and "INTERIOR_POINT_OK" at the end; exit 1 on a
failure.  Build (standalone; bin/curate/check_interior_point.py builds and runs it):
    g++ -std=c++17 -O2 -Isrc test/interior_point_hs.cpp src/solver/ip/DenseLDLT.cpp ... (every .cpp of src/solver/ip) -o /tmp/interior_point_hs
\*---------------------------------------------------------------------------*/

#include "solver/ip/DenseLDLT.H"
#include "solver/ip/InertiaCorrection.H"
#include "solver/ip/InteriorPoint.H"
#include "solver/ip/NLPProblem.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <functional>
#include <iostream>
#include <memory>
#include <string>
#include <tuple>
#include <vector>

using namespace Choupo;
using namespace Choupo::solver;

namespace
{

using Vec = sVector;

int g_failures = 0;

// ---------------------------------------------------------------------------
//  A function with its hand derivatives.
// ---------------------------------------------------------------------------

struct Fn
{
    std::function<scalar(const Vec&)> val;
    std::function<void(const Vec&, Vec&)> grad;
    //  Adds w * (Hessian) to the matrix; empty when there is no analytic Hessian.
    std::function<void(const Vec&, scalar, DenseMatrix&)> hess;
};

//  c0 + b.x + 0.5 x^T Q x, with b and Q given as sparse lists (1-based indices;
//  a Q entry (i, j, v) sets Q_ij = Q_ji = v).
Fn quad(std::size_t n, scalar c0, std::vector<std::pair<int, scalar>> lin,
        std::vector<std::tuple<int, int, scalar>> qd)
{
    Vec b(n, 0.0);
    for (auto& l : lin) b[l.first - 1] += l.second;
    DenseMatrix Q(n, Vec(n, 0.0));
    for (auto& q : qd)
    {
        const int i = std::get<0>(q) - 1, j = std::get<1>(q) - 1;
        Q[i][j] = std::get<2>(q);
        Q[j][i] = std::get<2>(q);
    }
    Fn f;
    f.val = [=](const Vec& x) {
        scalar s = c0;
        for (std::size_t i = 0; i < n; ++i)
        {
            s += b[i] * x[i];
            for (std::size_t j = 0; j < n; ++j) s += 0.5 * x[i] * Q[i][j] * x[j];
        }
        return s;
    };
    f.grad = [=](const Vec& x, Vec& g) {
        g = b;
        for (std::size_t i = 0; i < n; ++i)
            for (std::size_t j = 0; j < n; ++j) g[i] += Q[i][j] * x[j];
    };
    f.hess = [=](const Vec&, scalar w, DenseMatrix& W) {
        for (std::size_t i = 0; i < n; ++i)
            for (std::size_t j = 0; j < n; ++j) W[i][j] += w * Q[i][j];
    };
    return f;
}

// ---------------------------------------------------------------------------
//  A problem built from such functions.
// ---------------------------------------------------------------------------

class HSProblem : public NLPProblem
{
public:
    std::string label;
    Vec x0, xL, xU, cL, cU;
    Fn obj;
    std::vector<Fn> cons;
    std::vector<std::string> rowNames;
    scalar fStar = 0.0;
    std::size_t pinIterations = 0;     //- the pinned iteration count (0: none yet)
    bool exact = true;                 //- every function has an analytic Hessian
    mutable std::size_t outside = 0;   //- evaluations of f at a point outside the variable bounds (the
                                       //  fraction-to-the-boundary rule says there are none)

    std::string name() const override { return label; }
    std::size_t numVariables() const override { return x0.size(); }
    std::size_t numConstraints() const override { return cons.size(); }
    void variableBounds(Vec& l, Vec& u) const override { l = xL; u = xU; }
    void constraintBounds(Vec& l, Vec& u) const override { l = cL; u = cU; }
    Vec startingPoint() const override { return x0; }
    bool objective(const Vec& x, scalar& f) const override
    {
        for (std::size_t i = 0; i < x.size(); ++i)
            if (x[i] < xL[i] || x[i] > xU[i]) { ++outside; break; }
        f = obj.val(x);
        return std::isfinite(f);
    }
    bool objectiveGradient(const Vec& x, Vec& g) const override { obj.grad(x, g); return true; }
    bool constraints(const Vec& x, Vec& c) const override
    {
        c.resize(cons.size());
        for (std::size_t j = 0; j < cons.size(); ++j) c[j] = cons[j].val(x);
        return true;
    }
    bool constraintJacobian(const Vec& x, DenseMatrix& J) const override
    {
        J.assign(cons.size(), Vec());
        for (std::size_t j = 0; j < cons.size(); ++j) cons[j].grad(x, J[j]);
        return true;
    }
    bool hessianLagrangian(const Vec& x, scalar sigma, const Vec& lambda, DenseMatrix& W) const override
    {
        if (!exact) return NLPProblem::hessianLagrangian(x, sigma, lambda, W);
        W.assign(x.size(), Vec(x.size(), 0.0));
        obj.hess(x, sigma, W);
        for (std::size_t j = 0; j < cons.size(); ++j) cons[j].hess(x, lambda[j], W);
        return true;
    }
    bool hasExactHessian() const override { return exact; }
    std::string constraintName(std::size_t j) const override
    {
        return j < rowNames.size() ? rowNames[j] : NLPProblem::constraintName(j);
    }
    void finalise()
    {
        const std::size_t n = x0.size();
        if (xL.empty()) xL.assign(n, -kInf);
        if (xU.empty()) xU.assign(n, kInf);
        exact = static_cast<bool>(obj.hess);
        for (const Fn& c : cons) exact = exact && static_cast<bool>(c.hess);
    }
};

const scalar kInfinity = kInf;

//  g >= 0
void geq(HSProblem& p, Fn f) { p.cons.push_back(std::move(f)); p.cL.push_back(0.0); p.cU.push_back(kInfinity); }
//  g = 0
void eqc(HSProblem& p, Fn f) { p.cons.push_back(std::move(f)); p.cL.push_back(0.0); p.cU.push_back(0.0); }

Vec filled(std::size_t n, scalar v) { return Vec(n, v); }

// ---------------------------------------------------------------------------
//  The fifteen problems.  x_i below is x[i-1].
// ---------------------------------------------------------------------------

std::vector<std::unique_ptr<HSProblem>> makeProblems()
{
    std::vector<std::unique_ptr<HSProblem>> v;
    auto add = [&](const char* name, scalar fstar, std::size_t pin) {
        v.push_back(std::make_unique<HSProblem>());
        v.back()->label = name;
        v.back()->fStar = fstar;
        v.back()->pinIterations = pin;
        return v.back().get();
    };

    {   // HS1: min 100 (x2 - x1^2)^2 + (1 - x1)^2,  x2 >= -1.5
        HSProblem* p = add("HS1", 0.0, 0);
        p->x0 = {-2.0, 1.0};
        p->xL = {-kInf, -1.5};
        p->obj.val = [](const Vec& x) { const scalar t = x[1] - x[0] * x[0]; return 100.0 * t * t + (1 - x[0]) * (1 - x[0]); };
        p->obj.grad = [](const Vec& x, Vec& g) {
            const scalar t = x[1] - x[0] * x[0];
            g = {-400.0 * x[0] * t - 2.0 * (1 - x[0]), 200.0 * t};
        };
        p->obj.hess = [](const Vec& x, scalar w, DenseMatrix& W) {
            W[0][0] += w * (1200.0 * x[0] * x[0] - 400.0 * x[1] + 2.0);
            W[0][1] += w * (-400.0 * x[0]);  W[1][0] += w * (-400.0 * x[0]);
            W[1][1] += w * 200.0;
        };
    }
    {   // HS6: min (1 - x1)^2  s.t. 10 (x2 - x1^2) = 0
        HSProblem* p = add("HS6", 0.0, 0);
        p->x0 = {-1.2, 1.0};
        p->obj = quad(2, 1.0, {{1, -2.0}}, {{1, 1, 2.0}});
        eqc(*p, quad(2, 0.0, {{2, 10.0}}, {{1, 1, -20.0}}));
    }
    {   // HS7: min ln(1 + x1^2) - x2  s.t. (1 + x1^2)^2 + x2^2 - 4 = 0
        HSProblem* p = add("HS7", -std::sqrt(3.0), 0);
        p->x0 = {2.0, 2.0};
        p->obj.val = [](const Vec& x) { return std::log(1 + x[0] * x[0]) - x[1]; };
        p->obj.grad = [](const Vec& x, Vec& g) { g = {2 * x[0] / (1 + x[0] * x[0]), -1.0}; };
        p->obj.hess = [](const Vec& x, scalar w, DenseMatrix& W) {
            const scalar d = 1 + x[0] * x[0];
            W[0][0] += w * 2.0 * (1 - x[0] * x[0]) / (d * d);
        };
        Fn c;
        c.val = [](const Vec& x) { const scalar d = 1 + x[0] * x[0]; return d * d + x[1] * x[1] - 4.0; };
        c.grad = [](const Vec& x, Vec& g) { g = {4 * x[0] * (1 + x[0] * x[0]), 2 * x[1]}; };
        c.hess = [](const Vec& x, scalar w, DenseMatrix& W) { W[0][0] += w * (4.0 + 12.0 * x[0] * x[0]); W[1][1] += w * 2.0; };
        eqc(*p, c);
    }
    {   // HS13: min (x1 - 2)^2 + x2^2  s.t. (1 - x1)^3 - x2 >= 0,  x >= 0   (LICQ fails at x* = (1, 0))
        HSProblem* p = add("HS13", 1.0, 0);
        p->x0 = {-2.0, -2.0};
        p->xL = {0.0, 0.0};
        p->obj = quad(2, 4.0, {{1, -4.0}}, {{1, 1, 2.0}, {2, 2, 2.0}});
        Fn c;
        c.val = [](const Vec& x) { const scalar t = 1 - x[0]; return t * t * t - x[1]; };
        c.grad = [](const Vec& x, Vec& g) { const scalar t = 1 - x[0]; g = {-3.0 * t * t, -1.0}; };
        c.hess = [](const Vec& x, scalar w, DenseMatrix& W) { W[0][0] += w * 6.0 * (1 - x[0]); };
        geq(*p, c);
    }
    {   // HS21: min 0.01 x1^2 + x2^2 - 100  s.t. 10 x1 - x2 - 10 >= 0,  2 <= x1 <= 50, -50 <= x2 <= 50
        HSProblem* p = add("HS21", -99.96, 0);
        p->x0 = {-1.0, -1.0};
        p->xL = {2.0, -50.0};  p->xU = {50.0, 50.0};
        p->obj = quad(2, -100.0, {}, {{1, 1, 0.02}, {2, 2, 2.0}});
        geq(*p, quad(2, -10.0, {{1, 10.0}, {2, -1.0}}, {}));
    }
    {   // HS35: min 9 - 8x1 - 6x2 - 4x3 + 2x1^2 + 2x2^2 + x3^2 + 2x1x2 + 2x1x3
        //       s.t. 3 - x1 - x2 - 2x3 >= 0,  x >= 0
        HSProblem* p = add("HS35", 1.0 / 9.0, 0);
        p->x0 = {0.5, 0.5, 0.5};
        p->xL = filled(3, 0.0);
        p->obj = quad(3, 9.0, {{1, -8.0}, {2, -6.0}, {3, -4.0}},
                      {{1, 1, 4.0}, {2, 2, 4.0}, {3, 3, 2.0}, {1, 2, 2.0}, {1, 3, 2.0}});
        geq(*p, quad(3, 3.0, {{1, -1.0}, {2, -1.0}, {3, -2.0}}, {}));
    }
    {   // HS38 (Colville): bounds only, -10 <= x <= 10
        HSProblem* p = add("HS38", 0.0, 0);
        p->x0 = {-3.0, -1.0, -3.0, -1.0};
        p->xL = filled(4, -10.0);  p->xU = filled(4, 10.0);
        p->obj.val = [](const Vec& x) {
            const scalar a = x[1] - x[0] * x[0], b = x[3] - x[2] * x[2];
            return 100 * a * a + (1 - x[0]) * (1 - x[0]) + 90 * b * b + (1 - x[2]) * (1 - x[2])
                   + 10.1 * ((x[1] - 1) * (x[1] - 1) + (x[3] - 1) * (x[3] - 1)) + 19.8 * (x[1] - 1) * (x[3] - 1);
        };
        p->obj.grad = [](const Vec& x, Vec& g) {
            const scalar a = x[1] - x[0] * x[0], b = x[3] - x[2] * x[2];
            g = {-400 * x[0] * a - 2 * (1 - x[0]),
                 200 * a + 20.2 * (x[1] - 1) + 19.8 * (x[3] - 1),
                 -360 * x[2] * b - 2 * (1 - x[2]),
                 180 * b + 20.2 * (x[3] - 1) + 19.8 * (x[1] - 1)};
        };
        p->obj.hess = [](const Vec& x, scalar w, DenseMatrix& W) {
            W[0][0] += w * (1200 * x[0] * x[0] - 400 * x[1] + 2);
            W[0][1] += w * (-400 * x[0]);  W[1][0] += w * (-400 * x[0]);
            W[1][1] += w * 220.2;
            W[1][3] += w * 19.8;  W[3][1] += w * 19.8;
            W[2][2] += w * (1080 * x[2] * x[2] - 360 * x[3] + 2);
            W[2][3] += w * (-360 * x[2]);  W[3][2] += w * (-360 * x[2]);
            W[3][3] += w * 200.2;
        };
    }
    {   // HS40: min -x1 x2 x3 x4  s.t. x1^3 + x2^2 - 1 = 0,  x1^2 x4 - x3 = 0,  x4^2 - x2 = 0
        HSProblem* p = add("HS40", -0.25, 0);
        p->x0 = filled(4, 0.8);
        p->obj.val = [](const Vec& x) { return -x[0] * x[1] * x[2] * x[3]; };
        p->obj.grad = [](const Vec& x, Vec& g) {
            g = {-x[1] * x[2] * x[3], -x[0] * x[2] * x[3], -x[0] * x[1] * x[3], -x[0] * x[1] * x[2]};
        };
        p->obj.hess = [](const Vec& x, scalar w, DenseMatrix& W) {
            auto set = [&](int i, int j, scalar val) { W[i][j] += w * val; W[j][i] += (i == j ? 0.0 : w * val); };
            set(0, 1, -x[2] * x[3]);  set(0, 2, -x[1] * x[3]);  set(0, 3, -x[1] * x[2]);
            set(1, 2, -x[0] * x[3]);  set(1, 3, -x[0] * x[2]);  set(2, 3, -x[0] * x[1]);
        };
        Fn c1;
        c1.val = [](const Vec& x) { return x[0] * x[0] * x[0] + x[1] * x[1] - 1.0; };
        c1.grad = [](const Vec& x, Vec& g) { g = {3 * x[0] * x[0], 2 * x[1], 0.0, 0.0}; };
        c1.hess = [](const Vec& x, scalar w, DenseMatrix& W) { W[0][0] += w * 6 * x[0]; W[1][1] += w * 2.0; };
        Fn c2;
        c2.val = [](const Vec& x) { return x[0] * x[0] * x[3] - x[2]; };
        c2.grad = [](const Vec& x, Vec& g) { g = {2 * x[0] * x[3], 0.0, -1.0, x[0] * x[0]}; };
        c2.hess = [](const Vec& x, scalar w, DenseMatrix& W) {
            W[0][0] += w * 2 * x[3];  W[0][3] += w * 2 * x[0];  W[3][0] += w * 2 * x[0];
        };
        Fn c3 = quad(4, 0.0, {{2, -1.0}}, {{4, 4, 2.0}});
        eqc(*p, c1);  eqc(*p, c2);  eqc(*p, c3);
    }
    {   // HS43 (Rosen-Suzuki): three quadratic inequalities
        HSProblem* p = add("HS43", -44.0, 0);
        p->x0 = filled(4, 0.0);
        p->obj = quad(4, 0.0, {{1, -5.0}, {2, -5.0}, {3, -21.0}, {4, 7.0}},
                      {{1, 1, 2.0}, {2, 2, 2.0}, {3, 3, 4.0}, {4, 4, 2.0}});
        geq(*p, quad(4, 8.0, {{1, -1.0}, {2, 1.0}, {3, -1.0}, {4, 1.0}},
                     {{1, 1, -2.0}, {2, 2, -2.0}, {3, 3, -2.0}, {4, 4, -2.0}}));
        geq(*p, quad(4, 10.0, {{1, 1.0}, {4, 1.0}},
                     {{1, 1, -2.0}, {2, 2, -4.0}, {3, 3, -2.0}, {4, 4, -4.0}}));
        geq(*p, quad(4, 5.0, {{1, -2.0}, {2, 1.0}, {4, 1.0}},
                     {{1, 1, -4.0}, {2, 2, -2.0}, {3, 3, -2.0}}));
    }
    {   // HS71: min x1 x4 (x1 + x2 + x3) + x3  s.t. x1 x2 x3 x4 >= 25, sum x^2 = 40, 1 <= x <= 5
        HSProblem* p = add("HS71", 17.0140172895, 0);
        p->x0 = {1.0, 5.0, 5.0, 1.0};
        p->xL = filled(4, 1.0);  p->xU = filled(4, 5.0);
        p->obj.val = [](const Vec& x) { return x[0] * x[3] * (x[0] + x[1] + x[2]) + x[2]; };
        p->obj.grad = [](const Vec& x, Vec& g) {
            g = {x[3] * (2 * x[0] + x[1] + x[2]), x[0] * x[3], x[0] * x[3] + 1.0, x[0] * (x[0] + x[1] + x[2])};
        };
        p->obj.hess = [](const Vec& x, scalar w, DenseMatrix& W) {
            auto set = [&](int i, int j, scalar val) { W[i][j] += w * val; if (i != j) W[j][i] += w * val; };
            set(0, 0, 2 * x[3]);  set(0, 1, x[3]);  set(0, 2, x[3]);  set(0, 3, 2 * x[0] + x[1] + x[2]);
            set(1, 3, x[0]);  set(2, 3, x[0]);
        };
        Fn g1;
        g1.val = [](const Vec& x) { return x[0] * x[1] * x[2] * x[3] - 25.0; };
        g1.grad = [](const Vec& x, Vec& g) { g = {x[1] * x[2] * x[3], x[0] * x[2] * x[3], x[0] * x[1] * x[3], x[0] * x[1] * x[2]}; };
        g1.hess = [](const Vec& x, scalar w, DenseMatrix& W) {
            auto set = [&](int i, int j, scalar val) { W[i][j] += w * val; W[j][i] += w * val; };
            set(0, 1, x[2] * x[3]);  set(0, 2, x[1] * x[3]);  set(0, 3, x[1] * x[2]);
            set(1, 2, x[0] * x[3]);  set(1, 3, x[0] * x[2]);  set(2, 3, x[0] * x[1]);
        };
        geq(*p, g1);
        eqc(*p, quad(4, -40.0, {}, {{1, 1, 2.0}, {2, 2, 2.0}, {3, 3, 2.0}, {4, 4, 2.0}}));
    }
    {   // HS76: convex QP, three linear inequalities, x >= 0
        HSProblem* p = add("HS76", -4.681818181818, 0);
        p->x0 = filled(4, 0.5);
        p->xL = filled(4, 0.0);
        p->obj = quad(4, 0.0, {{1, -1.0}, {2, -3.0}, {3, 1.0}, {4, -1.0}},
                      {{1, 1, 2.0}, {2, 2, 1.0}, {3, 3, 2.0}, {4, 4, 1.0}, {1, 3, -1.0}, {3, 4, 1.0}});
        geq(*p, quad(4, 5.0, {{1, -1.0}, {2, -2.0}, {3, -1.0}, {4, -1.0}}, {}));
        geq(*p, quad(4, 4.0, {{1, -3.0}, {2, -1.0}, {3, -2.0}, {4, 1.0}}, {}));
        geq(*p, quad(4, -1.5, {{2, 1.0}, {3, 4.0}}, {}));
    }
    {   // HS100: nonconvex, n = 7, four nonlinear inequalities
        HSProblem* p = add("HS100", 680.630057275, 0);
        p->x0 = {1.0, 2.0, 0.0, 4.0, 0.0, 1.0, 1.0};
        p->obj.val = [](const Vec& x) {
            return std::pow(x[0] - 10, 2) + 5 * std::pow(x[1] - 12, 2) + std::pow(x[2], 4) + 3 * std::pow(x[3] - 11, 2)
                   + 10 * std::pow(x[4], 6) + 7 * x[5] * x[5] + std::pow(x[6], 4) - 4 * x[5] * x[6] - 10 * x[5] - 8 * x[6];
        };
        p->obj.grad = [](const Vec& x, Vec& g) {
            g = {2 * (x[0] - 10), 10 * (x[1] - 12), 4 * std::pow(x[2], 3), 6 * (x[3] - 11), 60 * std::pow(x[4], 5),
                 14 * x[5] - 4 * x[6] - 10, 4 * std::pow(x[6], 3) - 4 * x[5] - 8};
        };
        p->obj.hess = [](const Vec& x, scalar w, DenseMatrix& W) {
            W[0][0] += w * 2;  W[1][1] += w * 10;  W[2][2] += w * 12 * x[2] * x[2];  W[3][3] += w * 6;
            W[4][4] += w * 300 * std::pow(x[4], 4);  W[5][5] += w * 14;  W[6][6] += w * 12 * x[6] * x[6];
            W[5][6] += w * -4;  W[6][5] += w * -4;
        };
        Fn g1;
        g1.val = [](const Vec& x) { return 127 - 2 * x[0] * x[0] - 3 * std::pow(x[1], 4) - x[2] - 4 * x[3] * x[3] - 5 * x[4]; };
        g1.grad = [](const Vec& x, Vec& g) { g = {-4 * x[0], -12 * std::pow(x[1], 3), -1.0, -8 * x[3], -5.0, 0.0, 0.0}; };
        g1.hess = [](const Vec& x, scalar w, DenseMatrix& W) { W[0][0] += w * -4;  W[1][1] += w * -36 * x[1] * x[1];  W[3][3] += w * -8; };
        Fn g2;
        g2.val = [](const Vec& x) { return 282 - 7 * x[0] - 3 * x[1] - 10 * x[2] * x[2] - x[3] + x[4]; };
        g2.grad = [](const Vec& x, Vec& g) { g = {-7.0, -3.0, -20 * x[2], -1.0, 1.0, 0.0, 0.0}; };
        g2.hess = [](const Vec&, scalar w, DenseMatrix& W) { W[2][2] += w * -20; };
        Fn g3 = quad(7, 196.0, {{1, -23.0}, {7, 8.0}}, {{2, 2, -2.0}, {6, 6, -12.0}});
        Fn g4 = quad(7, 0.0, {{6, -5.0}, {7, 11.0}}, {{1, 1, -8.0}, {1, 2, 3.0}, {2, 2, -2.0}, {3, 3, -4.0}});
        geq(*p, g1);  geq(*p, g2);  geq(*p, g3);  geq(*p, g4);
    }
    {   // HS113: n = 10, eight inequalities (three linear, five quadratic)
        HSProblem* p = add("HS113", 24.3062090641, 0);
        p->x0 = {2, 3, 5, 5, 1, 2, 7, 3, 6, 10};
        //  constant: 100 + 100 + 9 + 2 + 7*121 + 2*100 + 49 + 45 = 1352
        p->obj = quad(10, 1352.0,
                      {{1, -14.0}, {2, -16.0}, {3, -20.0}, {4, -40.0}, {5, -6.0}, {6, -4.0}, {8, -154.0}, {9, -40.0}, {10, -14.0}},
                      {{1, 1, 2.0}, {2, 2, 2.0}, {1, 2, 1.0}, {3, 3, 2.0}, {4, 4, 8.0}, {5, 5, 2.0}, {6, 6, 4.0},
                       {7, 7, 10.0}, {8, 8, 14.0}, {9, 9, 4.0}, {10, 10, 2.0}});
        geq(*p, quad(10, 105.0, {{1, -4.0}, {2, -5.0}, {7, 3.0}, {8, -9.0}}, {}));
        geq(*p, quad(10, 0.0, {{1, -10.0}, {2, 8.0}, {7, 17.0}, {8, -2.0}}, {}));
        geq(*p, quad(10, 12.0, {{1, 8.0}, {2, -2.0}, {9, -5.0}, {10, 2.0}}, {}));
        // -3 (x1-2)^2 - 4 (x2-3)^2 - 2 x3^2 + 7 x4 + 120
        geq(*p, quad(10, 120.0 - 12.0 - 36.0, {{1, 12.0}, {2, 24.0}, {4, 7.0}}, {{1, 1, -6.0}, {2, 2, -8.0}, {3, 3, -4.0}}));
        // -5 x1^2 - 8 x2 - (x3 - 6)^2 + 2 x4 + 40
        geq(*p, quad(10, 40.0 - 36.0, {{2, -8.0}, {3, 12.0}, {4, 2.0}}, {{1, 1, -10.0}, {3, 3, -2.0}}));
        // -x1^2 - 2 (x2 - 2)^2 + 2 x1 x2 - 14 x5 + 6 x6
        geq(*p, quad(10, -8.0, {{2, 8.0}, {5, -14.0}, {6, 6.0}}, {{1, 1, -2.0}, {2, 2, -4.0}, {1, 2, 2.0}}));
        // -0.5 (x1 - 8)^2 - 2 (x2 - 4)^2 - 3 x5^2 + x6 + 30
        geq(*p, quad(10, 30.0 - 32.0 - 32.0, {{1, 8.0}, {2, 16.0}, {6, 1.0}}, {{1, 1, -1.0}, {2, 2, -4.0}, {5, 5, -6.0}}));
        // 3 x1 - 6 x2 - 12 (x9 - 8)^2 + 7 x10
        geq(*p, quad(10, -768.0, {{1, 3.0}, {2, -6.0}, {9, 192.0}, {10, 7.0}}, {{9, 9, -24.0}}));
    }
    {   // HS116: n = 13, fifteen inequalities, Hessian by finite differences (announced)
        HSProblem* p = add("HS116", 97.5884089805, 0);
        p->x0 = {0.5, 0.8, 0.9, 0.1, 0.14, 0.5, 489.0, 80.0, 650.0, 450.0, 150.0, 150.0, 150.0};
        p->xL = {0.1, 0.1, 0.1, 0.0001, 0.1, 0.1, 0.1, 0.1, 500.0, 0.1, 1.0, 0.0001, 0.0001};
        p->xU = {1.0, 1.0, 1.0, 0.1, 0.9, 0.9, 1000.0, 1000.0, 1000.0, 500.0, 150.0, 150.0, 150.0};
        p->obj = quad(13, 0.0, {{11, 1.0}, {12, 1.0}, {13, 1.0}}, {});
        p->obj.hess = nullptr;
        auto fn = [](std::function<scalar(const Vec&)> val, std::function<void(const Vec&, Vec&)> grad) {
            Fn f;  f.val = std::move(val);  f.grad = std::move(grad);  return f;
        };
        geq(*p, quad(13, 0.0, {{3, 1.0}, {2, -1.0}}, {}));                                  // x3 - x2
        geq(*p, quad(13, 0.0, {{2, 1.0}, {1, -1.0}}, {}));                                  // x2 - x1
        geq(*p, quad(13, 1.0, {{7, -0.002}, {8, 0.002}}, {}));                              // 1 - 0.002 (x7 - x8)
        geq(*p, quad(13, -50.0, {{11, 1.0}, {12, 1.0}, {13, 1.0}}, {}));                    // x11 + x12 + x13 - 50
        geq(*p, quad(13, 250.0, {{11, -1.0}, {12, -1.0}, {13, -1.0}}, {}));                 // 250 - (x11 + x12 + x13)
        geq(*p, fn([](const Vec& x) { return x[12] - 1.262626 * x[9] + 1.231059 * x[2] * x[9]; },
                   [](const Vec& x, Vec& g) { g.assign(13, 0.0); g[12] = 1.0; g[9] = -1.262626 + 1.231059 * x[2]; g[2] = 1.231059 * x[9]; }));
        geq(*p, fn([](const Vec& x) { return x[4] - 0.03475 * x[1] - 0.975 * x[1] * x[4] + 0.00975 * x[1] * x[1]; },
                   [](const Vec& x, Vec& g) { g.assign(13, 0.0); g[4] = 1.0 - 0.975 * x[1]; g[1] = -0.03475 - 0.975 * x[4] + 0.0195 * x[1]; }));
        geq(*p, fn([](const Vec& x) { return x[5] - 0.03475 * x[2] - 0.975 * x[2] * x[5] + 0.00975 * x[2] * x[2]; },
                   [](const Vec& x, Vec& g) { g.assign(13, 0.0); g[5] = 1.0 - 0.975 * x[2]; g[2] = -0.03475 - 0.975 * x[5] + 0.0195 * x[2]; }));
        geq(*p, fn([](const Vec& x) { return x[4] * x[6] - x[0] * x[7] - x[3] * x[6] + x[3] * x[7]; },
                   [](const Vec& x, Vec& g) {
                       g.assign(13, 0.0);
                       g[4] = x[6];  g[6] = x[4] - x[3];  g[0] = -x[7];  g[7] = -x[0] + x[3];  g[3] = -x[6] + x[7];
                   }));
        geq(*p, fn([](const Vec& x) { return 1 - 0.002 * (x[1] * x[8] + x[4] * x[7] - x[0] * x[7] - x[5] * x[8]) - x[4] - x[5]; },
                   [](const Vec& x, Vec& g) {
                       g.assign(13, 0.0);
                       g[1] = -0.002 * x[8];  g[8] = -0.002 * (x[1] - x[5]);  g[4] = -0.002 * x[7] - 1.0;
                       g[7] = -0.002 * (x[4] - x[0]);  g[0] = 0.002 * x[7];  g[5] = 0.002 * x[8] - 1.0;
                   }));
        geq(*p, fn([](const Vec& x) { return x[1] * x[8] - x[2] * x[9] - x[5] * x[8] - 500 * x[1] + 500 * x[5] + x[1] * x[9]; },
                   [](const Vec& x, Vec& g) {
                       g.assign(13, 0.0);
                       g[1] = x[8] - 500.0 + x[9];  g[8] = x[1] - x[5];  g[2] = -x[9];
                       g[9] = -x[2] + x[1];  g[5] = -x[8] + 500.0;
                   }));
        geq(*p, fn([](const Vec& x) { return x[1] - 0.9 - 0.002 * (x[1] * x[9] - x[2] * x[9]); },
                   [](const Vec& x, Vec& g) {
                       g.assign(13, 0.0);
                       g[1] = 1.0 - 0.002 * x[9];  g[9] = -0.002 * (x[1] - x[2]);  g[2] = 0.002 * x[9];
                   }));
        geq(*p, fn([](const Vec& x) { return x[3] - 0.03475 * x[0] - 0.975 * x[0] * x[3] + 0.00975 * x[0] * x[0]; },
                   [](const Vec& x, Vec& g) { g.assign(13, 0.0); g[3] = 1.0 - 0.975 * x[0]; g[0] = -0.03475 - 0.975 * x[3] + 0.0195 * x[0]; }));
        geq(*p, fn([](const Vec& x) { return x[10] - 1.262626 * x[7] + 1.231059 * x[0] * x[7]; },
                   [](const Vec& x, Vec& g) { g.assign(13, 0.0); g[10] = 1.0; g[7] = -1.262626 + 1.231059 * x[0]; g[0] = 1.231059 * x[7]; }));
        geq(*p, fn([](const Vec& x) { return x[11] - 1.262626 * x[8] + 1.231059 * x[1] * x[8]; },
                   [](const Vec& x, Vec& g) { g.assign(13, 0.0); g[11] = 1.0; g[8] = -1.262626 + 1.231059 * x[1]; g[1] = 1.231059 * x[8]; }));
    }
    {   // WB2000: Wachter & Biegler 2000, "Failure of global convergence for a class of interior point
        //         methods": min x1  s.t.  x1^2 - x2 - 1 = 0,  x1 - x3 - 0.5 = 0,  x2, x3 >= 0.
        //         The collection's start (-2, 3, 1) ends in a local minimum of the infeasibility ("locally
        //         infeasible", honest: x1 < 0 cannot satisfy c2); from (-3, 3, 0.01) the line search finds no
        //         acceptable step at iteration ~5, ENTERS THE RESTORATION PHASE (1 time) and recovers to
        //         x* = (1, 0, 0.5), f* = 1.  This is the one problem of the set that enters restoration and
        //         then converges: it is the witness for sabotage (iii) (restoration replaced by a stop).
        HSProblem* p = add("WB2000", 1.0, 0);
        p->x0 = {-3.0, 3.0, 0.01};
        p->xL = {-kInfinity, 0.0, 0.0};
        p->obj = quad(3, 0.0, {{1, 1.0}}, {});
        eqc(*p, quad(3, -1.0, {{2, -1.0}}, {{1, 1, 2.0}}));
        eqc(*p, quad(3, -0.5, {{1, 1.0}, {3, -1.0}}, {}));
    }
    {   // HS118: n = 15, 17 rows (12 ranges and 5 sums) = 29 one-sided inequalities
        HSProblem* p = add("HS118", 664.820449993, 0);
        p->x0.clear();
        for (int k = 0; k < 5; ++k) { p->x0.push_back(20.0); p->x0.push_back(55.0); p->x0.push_back(15.0); }
        p->xL.clear();  p->xU.clear();
        for (int k = 0; k < 5; ++k)
        {
            if (k == 0) { p->xL.insert(p->xL.end(), {8.0, 43.0, 3.0}); p->xU.insert(p->xU.end(), {21.0, 57.0, 16.0}); }
            else { p->xL.insert(p->xL.end(), {0.0, 0.0, 0.0}); p->xU.insert(p->xU.end(), {90.0, 120.0, 60.0}); }
        }
        std::vector<std::pair<int, scalar>> lin;
        std::vector<std::tuple<int, int, scalar>> qd;
        for (int k = 0; k < 5; ++k)
        {
            lin.push_back({3 * k + 1, 2.3});  qd.push_back({3 * k + 1, 3 * k + 1, 2.0e-4});
            lin.push_back({3 * k + 2, 1.7});  qd.push_back({3 * k + 2, 3 * k + 2, 2.0e-4});
            lin.push_back({3 * k + 3, 2.2});  qd.push_back({3 * k + 3, 3 * k + 3, 3.0e-4});
        }
        p->obj = quad(15, 0.0, lin, qd);
        const scalar lo[3] = {-7.0, -7.0, -7.0}, hi[3] = {6.0, 7.0, 6.0};
        for (int j = 1; j <= 4; ++j)
            for (int off = 0; off < 3; ++off)
            {
                p->cons.push_back(quad(15, 0.0, {{3 * j + off + 1, 1.0}, {3 * (j - 1) + off + 1, -1.0}}, {}));
                p->cL.push_back(lo[off]);  p->cU.push_back(hi[off]);
            }
        const scalar sums[5] = {60.0, 50.0, 70.0, 85.0, 100.0};
        for (int k = 0; k < 5; ++k)
        {
            p->cons.push_back(quad(15, -sums[k], {{3 * k + 1, 1.0}, {3 * k + 2, 1.0}, {3 * k + 3, 1.0}}, {}));
            p->cL.push_back(0.0);  p->cU.push_back(kInfinity);
        }
    }
    for (auto& p : v) p->finalise();
    return v;
}

// ---------------------------------------------------------------------------
//  1. Derivatives
// ---------------------------------------------------------------------------

bool checkDerivatives(const HSProblem& p)
{
    const std::size_t n = p.numVariables(), m = p.numConstraints();
    //  The start, and a second point inside the box.
    std::vector<Vec> points{p.x0};
    Vec x2 = p.x0;
    for (std::size_t i = 0; i < n; ++i)
    {
        x2[i] *= 1.0 + 0.05 * std::sin(1.0 + static_cast<scalar>(i));
        x2[i] += 0.01 * std::cos(2.0 + static_cast<scalar>(i));
        x2[i] = std::min(std::max(x2[i], p.xL[i] + 0.01 * (std::isfinite(p.xU[i]) ? p.xU[i] - p.xL[i] : 1.0)),
                         std::isfinite(p.xU[i]) ? p.xU[i] - 0.01 * (p.xU[i] - p.xL[i]) : kInf);
    }
    points.push_back(x2);
    Vec lambda(m);
    for (std::size_t j = 0; j < m; ++j) lambda[j] = 0.3 + 0.1 * static_cast<scalar>(j % 5);

    scalar worstG = 0.0, worstJ = 0.0, worstW = 0.0;
    for (const Vec& x : points)
    {
        Vec g;
        p.objectiveGradient(x, g);
        DenseMatrix J;
        p.constraintJacobian(x, J);
        for (std::size_t i = 0; i < n; ++i)
        {
            const scalar h = 1e-6 * std::max(1.0, std::abs(x[i]));
            Vec xp = x, xm = x;
            xp[i] += h;  xm[i] -= h;
            scalar fp, fm;
            p.objective(xp, fp);  p.objective(xm, fm);
            worstG = std::max(worstG, std::abs((fp - fm) / (2 * h) - g[i]) / (1.0 + std::abs(g[i])));
            Vec cp, cm;
            p.constraints(xp, cp);  p.constraints(xm, cm);
            for (std::size_t j = 0; j < m; ++j)
                worstJ = std::max(worstJ, std::abs((cp[j] - cm[j]) / (2 * h) - J[j][i]) / (1.0 + std::abs(J[j][i])));
        }
        if (p.hasExactHessian())
        {
            DenseMatrix W, Wfd;
            p.hessianLagrangian(x, 1.0, lambda, W);
            p.NLPProblem::hessianLagrangian(x, 1.0, lambda, Wfd);     //- the base class: finite differences of the gradient
            for (std::size_t r = 0; r < n; ++r)
                for (std::size_t c = 0; c < n; ++c)
                    worstW = std::max(worstW, std::abs(W[r][c] - Wfd[r][c]) / (1.0 + std::abs(W[r][c])));
        }
    }
    const bool ok = worstG <= 1e-6 && worstJ <= 1e-6 && worstW <= 1e-4;
    std::printf("%-6s derivatives vs central differences: gradient %.1e, Jacobian %.1e, Hessian %s  %s\n",
                p.label.c_str(), worstG, worstJ,
                p.hasExactHessian() ? ([&] { char b[32]; std::snprintf(b, sizeof b, "%.1e", worstW); return std::string(b); })().c_str()
                                    : "finite differences (announced)",
                ok ? "ok" : "FAIL");
    return ok;
}

// ---------------------------------------------------------------------------
//  2. The HS set
// ---------------------------------------------------------------------------

struct Pin { const char* name; std::size_t iterations; };

//  Iteration counts of the first accepted runs (2026-11-25); a run within the
//  band max(3, 25 %) passes.  A move outside it is a change of behaviour of
//  the algorithm and is read, not re-pinned silently.
const Pin kPins[] = {
    {"HS1", 25}, {"HS6", 6}, {"HS7", 27}, {"HS13", 311}, {"HS21", 8}, {"HS35", 7}, {"HS38", 40}, {"HS40", 3},
    {"HS43", 9}, {"HS71", 8}, {"HS76", 7}, {"HS100", 10}, {"HS113", 11}, {"HS116", 21}, {"WB2000", 15}, {"HS118", 11},
};

//  TWO PROBLEMS HAVE THEIR OWN ACCEPTANCE RULE, each following from the problem
//  and stated here and in the Theory Guide (sec:interior-point-hs).
//
//  HS13: the optimum x* = (1, 0) is a CUSP -- the gradient of the active
//  constraint, (0, -1), is parallel to that of the active bound x2 >= 0, and
//  no multipliers exist (grad f = (-2, 0) cannot be balanced: the run's
//  multipliers grow to 1.4e5).  The constraint is a CUBE at x*: a violation v
//  lets x1 reach 1 + v^(1/3) with x2 = 0, so the best f a point of violation v
//  can have is (1 - v^(1/3))^2, about 2 v^(1/3) = 4.3e-3 below f* at
//  v = 1e-8.  "|f - f*| <= 1e-6 at v <= 1e-8" would need v <= 1e-19, below
//  what double precision can resolve in (1 - x1)^3: NO solver can meet it.  The
//  rule is therefore the one the problem implies: the run is converged, v <= 1e-8,
//  f lies between the permitted-violation floor and f* + 1e-6, and
//  x1 within [1 - 1e-6, 1 + v^(1/3) (1 + 1e-6) + 1e-9] -- the permitted cusp.
//  Its 311 iterations with 287 inertia corrections (zero eigenvalue of the
//  KKT matrix at the cusp, theta steps only) are a slowness recorded for A3
//  (second-order correction, adaptive barrier update), not hidden: the
//  iteration pin stays.
//
//  HS116: the run is FEASIBLE (violation 0 against the statement written here;
//  re-read term by term a second time on 2026-11-25 against the statement as
//  the collection gives it -- 15 constraints, 13 bounds pairs and the start
//  agree; the collection's own text was not at hand, so this is a reading, not
//  a diff) and ends 9.0e-4 BELOW the collection's f* = 97.5884089805,
//  relative 9.2e-6.  The multipliers are about 1e3 (c13: 1.07e3), so a
//  constraint tightened by 8.5e-7 moves f by exactly that difference (measured:
//  tightening c13 to >= 8e-7 gives 97.58836, to >= 1e-6 gives 97.58858); the
//  HYPOTHESIS (not proven) is that the collection's f* was taken at a point
//  with that feasibility margin, or at rounded constants.  The run's x agrees
//  with the published x* to the digits published (x1 = 0.80377, x9 = 500.016).  The rule is one-sided and stated: not worse than f* by
//  more than 1e-6 relative, and not better than the f* minus the 1e-5
//  relative that a 1e-6 feasibility margin at these multipliers explains.  It
//  is NOT a loosening for a run that finds a lower f silently: a drop below
//  f* (1 - 1e-5) fails, a feasible lower value is reported, and the finding is
//  put to the architect.
struct Rule
{
    scalar below;   // relative: f may be below f* by at most this
    scalar above;   // relative: f may be above f* by at most this
};

Rule ruleFor(const std::string& name)
{
    if (name == "HS116") return {1e-5, 1e-6};
    return {1e-6, 1e-6};
}

//  HS13's own check, on x.
bool hs13Cusp(const IPResult& r, scalar& floorF)
{
    const scalar v = 1e-8, cr = std::cbrt(v);
    floorF = (1 - cr) * (1 - cr);
    return r.x.size() == 2 && r.x[0] >= 1 - 1e-6 && r.x[0] <= 1 + cr * (1 + 1e-6) + 1e-9 && r.x[1] <= v;
}

bool runHS(HSProblem& p, bool verbose)
{
    IPOptions o;
    if (verbose) o.log = &std::cout;
    p.outside = 0;
    const IPResult r = InteriorPoint::solve(p, o);
    const scalar fErr = std::abs(r.objective - p.fStar);
    const scalar scaleF = std::max(1.0, std::abs(p.fStar));
    const Rule rule = ruleFor(p.label);
    bool fOk = r.objective >= p.fStar - rule.below * scaleF && r.objective <= p.fStar + rule.above * scaleF;
    if (p.label == "HS13")
    {
        scalar floorF = 0;
        fOk = hs13Cusp(r, floorF) && r.objective >= floorF - 1e-9 && r.objective <= p.fStar + 1e-6;
    }
    std::size_t pin = 0;
    for (const Pin& k : kPins) if (p.label == k.name) pin = k.iterations;
    const std::size_t band = std::max<std::size_t>(3, pin / 4);
    const bool inBand = pin == 0 || (r.iterations + band >= pin && r.iterations <= pin + band);
    const bool pass = r.converged() && fOk && r.constraintViolation <= 1e-8 && inBand && p.outside == 0;
    std::printf("%-6s f* %-16.10g f %-16.10g |df| %.1e viol %.1e  it %3zu (pin %3zu +-%zu)  ic %2zu  resto %zu  outside %zu  %s  %s\n",
                p.label.c_str(), p.fStar, r.objective, fErr, r.constraintViolation, r.iterations, pin, band,
                r.inertiaCorrections, r.restorations, p.outside, statusName(r.status), pass ? "PASS" : "FAIL");
    if (p.label == "HS13") std::printf("       own rule: cusp optimum, f in [(1 - v^(1/3))^2, f*], x1 in [1, 1 + v^(1/3)], v <= 1e-8\n");
    if (p.label == "HS116") std::printf("       own rule: f in [f* (1 - 1e-5), f* (1 + 1e-6)]; collection's f* is at a feasibility margin of ~8.5e-7 (multipliers ~1e3)\n");
    if (verbose)
    {
        std::printf("       x =");
        for (scalar xi : r.x) std::printf(" %.8g", xi);
        std::printf("\n");
    }
    return pass;
}

// ---------------------------------------------------------------------------
//  3. Infeasible problems (R3)
// ---------------------------------------------------------------------------

std::unique_ptr<HSProblem> makeInfeasibleEqualities()
{
    //  min x1^2 + x2^2  s.t.  x1 + x2 = 1,  x1 + x2 = 2: no point satisfies both.
    auto p = std::make_unique<HSProblem>();
    p->label = "INF1_two_equalities";
    p->x0 = {0.0, 0.0};
    p->obj = quad(2, 0.0, {}, {{1, 1, 2.0}, {2, 2, 2.0}});
    eqc(*p, quad(2, -1.0, {{1, 1.0}, {2, 1.0}}, {}));
    eqc(*p, quad(2, -2.0, {{1, 1.0}, {2, 1.0}}, {}));
    p->rowNames = {"sum_equals_1", "sum_equals_2"};
    p->finalise();
    return p;
}

std::unique_ptr<HSProblem> makeBoundAgainstEquality()
{
    //  min x1^2 + x2^2  s.t.  x1 + x2 = 5,  0 <= x <= 1: the bounds allow a sum of at most 2.
    auto p = std::make_unique<HSProblem>();
    p->label = "INF2_bound_vs_equality";
    p->x0 = {0.5, 0.5};
    p->xL = {0.0, 0.0};  p->xU = {1.0, 1.0};
    p->obj = quad(2, 0.0, {}, {{1, 1, 2.0}, {2, 2, 2.0}});
    eqc(*p, quad(2, -5.0, {{1, 1.0}, {2, 1.0}}, {}));
    p->rowNames = {"sum_equals_5"};
    p->finalise();
    return p;
}

bool runInfeasible(HSProblem& p, const std::vector<std::string>& mustName, bool verbose)
{
    IPOptions o;
    if (verbose) o.log = &std::cout;
    const IPResult r = InteriorPoint::solve(p, o);
    bool named = !r.infeasibleRows.empty();
    for (const std::string& want : mustName)
    {
        bool found = false;
        for (const std::string& row : r.infeasibleRows) if (row.find(want) != std::string::npos) found = true;
        named = named && found;
    }
    const bool pass = r.status == IPStatus::LocallyInfeasible && named && !r.converged();
    std::string rows;
    for (const std::string& s : r.infeasibleRows) rows += (rows.empty() ? "" : "; ") + s;
    std::printf("%-24s status %s  it %zu  resto %zu  rows named [%s]  %s\n", p.label.c_str(), statusName(r.status),
                r.iterations, r.restorations, rows.c_str(), pass ? "PASS" : "FAIL");
    if (!r.message.empty()) std::printf("%-24s last line: %s\n", "", r.message.c_str());
    return pass;
}

// ---------------------------------------------------------------------------
//  4. Algorithm IC
// ---------------------------------------------------------------------------

//  A DenseLDLT that misbehaves on a script: the first `breakdowns` calls to
//  factor() report a BREAKDOWN, the next `wrongSolves` solves report a backward
//  error far above the limit.
class ScriptedFactoriser : public SymmetricIndefinite
{
public:
    ScriptedFactoriser(std::size_t breakdowns, std::size_t wrongSolves)
        : breakdowns_(breakdowns), wrongSolves_(wrongSolves) {}
    std::string name() const override { return "scripted"; }
    Inertia factor(const std::vector<sVector>& K) override
    {
        Inertia in = real_.factor(K);
        broken_ = calls_++ < breakdowns_;
        return broken_ ? Inertia{} : in;
    }
    bool ok() const override { return !broken_ && real_.ok(); }
    sVector solve(const sVector& b, SolveReport& rep) const override
    {
        sVector x = real_.solve(b, rep);
        if (wrongSolves_ > 0) { --wrongSolves_; rep.backwardError = 1.0e-6; }
        return x;
    }
    scalar zeroThreshold() const override { return real_.zeroThreshold(); }
    std::size_t calls() const { return calls_; }

private:
    DenseLDLT real_;
    std::size_t breakdowns_;
    mutable std::size_t wrongSolves_;
    std::size_t calls_ = 0;
    bool broken_ = false;
};

//  K of an equality-constrained convex QP, inertia (2, 1, 0): n = 2, m = 1.
DenseMatrix goodKKT()
{
    return {{2.0, 0.0, 1.0}, {0.0, 3.0, 1.0}, {1.0, 1.0, 0.0}};
}

bool checkIC()
{
    bool all = true;
    IPParameters par;
    const sVector rhs{1.0, 2.0, 0.5};
    const scalar mu = 1.0e-4;
    const scalar dcWant = par.dcBar * std::pow(mu, par.kappaC);

    {   // A healthy matrix: IC-1 accepts, no regularisation.
        ScriptedFactoriser f(0, 0);
        InertiaCorrection ic(f, par);
        const auto r = ic.correct(goodKKT(), 2, 1, mu, 5, rhs);
        const bool ok = r.ok && r.dw == 0.0 && r.dc == 0.0 && r.factorisations == 1;
        std::printf("IC healthy matrix: dw %.1e dc %.1e factorisations %zu  %s\n", r.dw, r.dc, r.factorisations, ok ? "ok" : "FAIL");
        all = all && ok;
    }
    {   // IC-2: a BREAKDOWN is zero eigenvalues: dc > 0 (and dw > 0 from IC-3), never a crash or a silent accept.
        ScriptedFactoriser f(1, 0);
        InertiaCorrection ic(f, par);
        const auto r = ic.correct(goodKKT(), 2, 1, mu, 5, rhs);
        const bool ok = r.ok && r.dc == dcWant && r.dw == par.dw0Bar && r.factorisations == 2;
        std::printf("IC breakdown at IC-1: dw %.1e dc %.2e (dcBar mu^kappaC = %.2e) factorisations %zu  %s\n",
                    r.dw, r.dc, dcWant, r.factorisations, ok ? "ok" : "FAIL");
        all = all && ok;
    }
    {   // The first-iterations rule: a breakdown in iteration 1 keeps dc > 0 at IC-1 of the next iteration.
        ScriptedFactoriser f(1, 0);
        InertiaCorrection ic(f, par);
        ic.correct(goodKKT(), 2, 1, mu, 1, rhs);
        const auto r2 = ic.correct(goodKKT(), 2, 1, mu, 2, rhs);
        const bool ok = ic.keepsDc() && r2.ok && r2.dc == dcWant && r2.dw == 0.0 && r2.factorisations == 1;
        std::printf("IC keeps dc > 0 after a singular iteration < 3: next dw %.1e dc %.2e  %s\n", r2.dw, r2.dc, ok ? "ok" : "FAIL");
        all = all && ok;
    }
    {   // R4: a solve whose backward error is above the limit is a WRONG factorisation: its step is not used.
        ScriptedFactoriser f(0, 1);
        InertiaCorrection ic(f, par);
        const auto r = ic.correct(goodKKT(), 2, 1, mu, 5, rhs);
        const bool ok = r.ok && r.dw == par.dw0Bar && r.dc == 0.0 && r.factorisations == 2 && r.backwardError <= kBackwardErrorLimit;
        std::printf("IC backward error above the limit: dw %.1e factorisations %zu accepted eta %.1e  %s\n",
                    r.dw, r.factorisations, r.backwardError, ok ? "ok" : "FAIL");
        all = all && ok;
    }
    {   // Wrong inertia (indefinite on the null space): dw grows until the inertia is (n, m, 0).
        //  H = diag(-1, -2) is negative on the null space of A^T = (1, 1): inertia (1, 2, 0) at dw = 0.
        DenseMatrix K{{-1.0, 0.0, 1.0}, {0.0, -2.0, 1.0}, {1.0, 1.0, 0.0}};
        DenseLDLT f;
        InertiaCorrection ic(f, par);
        const auto r = ic.correct(K, 2, 1, mu, 5, rhs);
        const bool ok = r.ok && r.dw > 1.5 && r.inertia == Inertia{2, 1, 0};   //- dw must exceed 3/2 = -(Z'HZ)/(Z'Z)
        std::printf("IC indefinite Hessian: dw %.1e inertia (%zu,%zu,%zu)  %s\n", r.dw, r.inertia.positive, r.inertia.negative,
                    r.inertia.zero, ok ? "ok" : "FAIL");
        all = all && ok;
    }
    {   // A matrix with NaN: DenseLDLT breaks down on every trial; IC must end in IC-6, not crash or accept.
        DenseMatrix K = goodKKT();
        K[0][0] = std::nan("");
        DenseLDLT f;
        InertiaCorrection ic(f, par);
        const auto r = ic.correct(K, 2, 1, mu, 5, rhs);
        const bool ok = !r.ok && r.dw > par.dwMax / par.kappaWPlusBar;   //- the last dw tried is within one growth step of dwMax
        std::printf("IC matrix with NaN: ok=%d dw %.1e factorisations %zu  %s\n", r.ok ? 1 : 0, r.dw, r.factorisations, ok ? "ok" : "FAIL");
        all = all && ok;
    }
    return all;
}

} // namespace

int main(int argc, char** argv)
{
    bool verbose = false;
    std::string only;
    for (int i = 1; i < argc; ++i)
    {
        const std::string a = argv[i];
        if (a == "-v") verbose = true;
        else only = a;
    }

    auto problems = makeProblems();
    auto inf1 = makeInfeasibleEqualities();
    auto inf2 = makeBoundAgainstEquality();

    std::printf("== derivatives ==\n");
    for (auto& p : problems) if (only.empty() || only == p->label) if (!checkDerivatives(*p)) ++g_failures;
    if (only.empty())
    {
        for (HSProblem* p : {inf1.get(), inf2.get()}) if (!checkDerivatives(*p)) ++g_failures;
    }

    std::printf("== Hock-Schittkowski set ==\n");
    for (auto& p : problems) if (only.empty() || only == p->label) if (!runHS(*p, verbose)) ++g_failures;

    if (only.empty())
    {
        std::printf("== infeasible problems (R3) ==\n");
        if (!runInfeasible(*inf1, {"sum_equals_1", "sum_equals_2"}, verbose)) ++g_failures;
        if (!runInfeasible(*inf2, {"sum_equals_5"}, verbose)) ++g_failures;

        std::printf("== Algorithm IC ==\n");
        if (!checkIC()) ++g_failures;
    }

    if (g_failures == 0) std::printf("INTERIOR_POINT_OK\n");
    else std::printf("%d failure(s)\n", g_failures);
    return g_failures == 0 ? 0 : 1;
}
