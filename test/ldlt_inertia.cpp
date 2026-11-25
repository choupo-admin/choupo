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
    ldlt_inertia.cpp

Description
Standalone test of solver/ip/DenseLDLT (the Bunch-Kaufman P K P^T = L D L^T of
interior-point slice A1) on symmetric matrices of KNOWN INERTIA.  For each:
  * the inertia (n_pos, n_neg, n_zero) returned by factor() equals the one
    known by construction (a diagonal, a KKT theorem, a congruence S D S^T
    whose signs are D's: Sylvester's law);
  * x from solve() has a normwise backward error
        eta = |b - K x|_inf / ( |K|_inf |x|_inf + |b|_inf )
    at most kEtaMax = 1e-12 AFTER refinement (b = K x_true, x_true fixed by
    the seed), and the refinement is shown by printing eta before and after.
Prints one line per matrix and "LDLT_INERTIA_OK" at the end; exit 1 on a
failure.  Matrices are built from a fixed-seed Mersenne twister turned into
uniform numbers by hand (the standard distributions differ across libraries).
Build (standalone; bin/curate/check_ldlt_inertia.py builds and runs it):
    g++ -std=c++17 -O2 -Isrc test/ldlt_inertia.cpp src/solver/ip/DenseLDLT.cpp \
        -o /tmp/ldlt_inertia
\*---------------------------------------------------------------------------*/

#include "solver/ip/DenseLDLT.H"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <random>
#include <string>
#include <vector>

using namespace Choupo;
using namespace Choupo::solver;

namespace
{

constexpr scalar kEtaMax = 1.0e-12;

std::mt19937_64 rng(20261125);

//- Uniform in (-1, 1) from the top 53 bits of the generator.
scalar uni() { return 2.0 * (static_cast<scalar>(rng() >> 11) * (1.0 / 9007199254740992.0)) - 1.0; }

using Mat = std::vector<sVector>;

Mat zeros(std::size_t n) { return Mat(n, sVector(n, 0.0)); }

//- S diag(s) S^T for a random dense S (n x n, entries uniform in (-1,1)) times a
//  column scaling cs.
Mat congruence(std::size_t n, const sVector& s, const sVector& cs)
{
    Mat S = zeros(n);
    for (std::size_t i = 0; i < n; ++i)
        for (std::size_t j = 0; j < n; ++j) S[i][j] = uni() * cs[j];
    Mat K = zeros(n);
    for (std::size_t i = 0; i < n; ++i)
        for (std::size_t j = 0; j < n; ++j)
        {
            scalar v = 0.0;
            for (std::size_t k = 0; k < n; ++k) v += S[i][k] * s[k] * S[j][k];
            K[i][j] = v;
        }
    for (std::size_t i = 0; i < n; ++i)
        for (std::size_t j = 0; j < i; ++j) K[i][j] = K[j][i] = 0.5 * (K[i][j] + K[j][i]);
    return K;
}

//- The KKT matrix [[H, A], [A^T, 0]] with A given as its m columns (each of length n).
Mat kkt(const Mat& H, const Mat& Acols)
{
    const std::size_t n = H.size(), m = Acols.size();
    Mat K = zeros(n + m);
    for (std::size_t i = 0; i < n; ++i)
        for (std::size_t j = 0; j < n; ++j) K[i][j] = H[i][j];
    for (std::size_t c = 0; c < m; ++c)
        for (std::size_t i = 0; i < n; ++i) K[i][n + c] = K[n + c][i] = Acols[c][i];
    return K;
}

//- The true Bunch-Kaufman factors whose solutions carry a relative error
//  eps in every component (alternating sign): an inexact factorisation.
class InexactLDLT : public DenseLDLT
{
public:
    explicit InexactLDLT(scalar eps) : eps_(eps) {}

protected:
    sVector solveFactors_(const sVector& b) const override
    {
        sVector x = DenseLDLT::solveFactors_(b);
        for (std::size_t i = 0; i < x.size(); ++i) x[i] *= 1.0 + ((i % 2) ? eps_ : -eps_);
        return x;
    }

private:
    scalar eps_;
};

int failures = 0;

void run(const std::string& name, const Mat& K, const Inertia& expect, bool needTwoByTwo = false)
{
    const std::size_t n = K.size();
    DenseLDLT f;
    const Inertia got = f.factor(K);
    sVector xt(n), b(n, 0.0);
    for (std::size_t i = 0; i < n; ++i) xt[i] = uni();
    for (std::size_t i = 0; i < n; ++i)
        for (std::size_t j = 0; j < n; ++j) b[i] += K[i][j] * xt[j];
    SolveReport rep;
    bool solved = f.ok();
    if (solved) f.solve(b, rep);
    const bool inertiaOk = f.ok() && got == expect;
    // A matrix with a zero eigenvalue is not solved: it has no inverse, and
    // the inertia is the claim.  Only a non-singular K is held to eta.
    const bool singular = expect.zero > 0;
    const bool etaOk = singular || (solved && rep.backwardError <= kEtaMax);
    const bool pivotOk = !needTwoByTwo || f.twoByTwoPivots() >= 1;
    std::printf("%-44s n=%-4zu expected (%zu,%zu,%zu) got (%zu,%zu,%zu)%s  eta before %.2e after %.2e (%zu step%s)  2x2 pivots %zu  %s\n",
                name.c_str(), n, expect.positive, expect.negative, expect.zero,
                got.positive, got.negative, got.zero, f.ok() ? "" : " BREAKDOWN",
                singular ? 0.0 : rep.backwardErrorBefore, singular ? 0.0 : rep.backwardError,
                rep.refinementSteps, rep.refinementSteps == 1 ? "" : "s", f.twoByTwoPivots(),
                (inertiaOk && etaOk && pivotOk) ? "ok" : "FAIL");
    if (!(inertiaOk && etaOk && pivotOk)) ++failures;
}

} // namespace

int main()
{
    std::printf("zero-pivot threshold %.0e of the column scale; eta limit %.0e; inertia = (positive, negative, zero)\n",
                DenseLDLT::kZeroFraction, kEtaMax);

    //  1. A diagonal of mixed signs.
    {
        Mat K = zeros(5);
        const scalar d[5] = {3.0, -2.0, 0.5, -7.0, 1.0};
        for (int i = 0; i < 5; ++i) K[i][i] = d[i];
        run("diagonal 3,-2,0.5,-7,1", K, {3, 2, 0});
    }
    //  2. [[0,1],[1,0]]: no 1x1 pivot exists, a 2x2 block is required.
    {
        Mat K = {{0.0, 1.0}, {1.0, 0.0}};
        run("[[0,1],[1,0]]", K, {1, 1, 0}, true);
    }
    //  3. Singular matrices: the zero count.
    {
        Mat K = {{1.0, 1.0}, {1.0, 1.0}};
        run("[[1,1],[1,1]] (eigenvalues 2, 0)", K, {1, 0, 1});
        Mat D = zeros(3);
        D[0][0] = 1.0; D[2][2] = -1.0;
        run("diag(1,0,-1)", D, {1, 1, 1});
        sVector s(10, 1.0);
        for (int i = 3; i < 7; ++i) s[i] = -1.0;
        s[8] = 0.0; s[9] = 0.0;
        run("congruence n=10 with two zero eigenvalues", congruence(10, s, sVector(10, 1.0)), {4, 4, 2});
    }
    //  4. KKT matrices [[H, A], [A^T, 0]] of equality-constrained QPs.
    //     Inertia theorem: (n, m, 0) iff A has full column rank and H is
    //     positive definite on the null space of A^T.
    {
        //  HS76's Hessian (positive definite: eigenvalues 0.198, 1, 1.555,
        //  3.247) with the two constraints active at its solution: the
        //  first inequality x1 + 2 x2 + x3 + x4 = 5 and the bound x3 = 0.
        Mat H = {{2, 0, -1, 0}, {0, 1, 0, 0}, {-1, 0, 2, 1}, {0, 0, 1, 1}};
        Mat A = {{1, 2, 1, 1}, {0, 0, 1, 0}};
        run("KKT HS76 Hessian, 2 active rows (n=4,m=2)", kkt(H, A), {4, 2, 0}, true);
        //  H indefinite on the null space of A^T: wrong inertia, by theorem
        //  (1 + 1 positive, 1 + 1 negative: Z^T H Z = diag(-1, 1)).
        Mat H2 = zeros(3);
        H2[0][0] = 1.0; H2[1][1] = -1.0; H2[2][2] = 1.0;
        Mat A2 = {{1, 0, 0}};
        run("KKT H indefinite on null(A^T) (n=3,m=1)", kkt(H2, A2), {2, 2, 0});
        //  The same in 4 + 2: Z^T H Z = [[1,2],[2,1]] has one negative eigenvalue.
        Mat H3 = {{1, 2, 0, 0}, {2, 1, 0, 0}, {0, 0, 3, 1}, {0, 0, 1, 3}};
        Mat A3 = {{0, 0, 1, 0}, {0, 0, 0, 1}};
        run("KKT H indefinite on null(A^T) (n=4,m=2)", kkt(H3, A3), {3, 3, 0}, true);
    }
    //  5. A random congruence S diag(signs) S^T: the inertia is the signs'.
    for (std::size_t n : {std::size_t(10), std::size_t(40), std::size_t(100)})
    {
        sVector s(n);
        std::size_t np = 0;
        for (std::size_t i = 0; i < n; ++i)
        {
            s[i] = (i % 3 == 1) ? -1.0 : 1.0;
            if (s[i] > 0) ++np;
        }
        run("random congruence S diag(+-1) S^T", congruence(n, s, sVector(n, 1.0)), {np, n - np, 0});
    }
    //  6. Badly scaled: the columns of S spread over 4 and 6 decades, so K
    //     has eigenvalues down to 1e-8 and 1e-12 of its largest.  (Eight
    //     decades would put them at round-off: that K is numerically
    //     singular, and factor() says BREAKDOWN, correctly.)
    for (int dec : {4, 6})
    {
        const std::size_t n = 30;
        sVector s(n), cs(n);
        std::size_t np = 0;
        for (std::size_t i = 0; i < n; ++i)
        {
            s[i] = (i % 2 == 0) ? 1.0 : -1.0;
            if (s[i] > 0) ++np;
            cs[i] = std::pow(10.0, -double(dec) * double(i) / double(n - 1));
        }
        run("badly scaled congruence (" + std::to_string(dec) + " decades)",
            congruence(n, s, cs), {np, n - np, 0});
    }
    //  7. REFINEMENT.  A backward-stable Bunch-Kaufman solve of these
    //     matrices already has eta ~ 1e-16 and refinement in working
    //     precision cannot lower a normwise eta that small (measured on 4e5
    //     random matrices of up to nine decades: it never did).  What
    //     refinement is FOR is a factorisation that is only approximately
    //     right -- a dropped tolerance, a stale factor, the sparse and block
    //     versions of the later slices.  Stand one in: the true factors with
    //     the solution perturbed by a relative `eps` per component.  Two
    //     steps contract the error by eps each: eps = 1e-7 gives eta 1e-7
    //     before and ~1e-14 after (accepted, refinement necessary); eps = 0.3
    //     leaves eta ~ 0.1 after two steps and the limit kBackwardErrorLimit
    //     REJECTS it (what Algorithm IC does with such a factorisation).
    for (scalar eps : {1.0e-7, 0.3})
    {
        const std::size_t n = 30;
        sVector s(n);
        std::size_t np = 0;
        for (std::size_t i = 0; i < n; ++i) { s[i] = (i % 2 == 0) ? 1.0 : -1.0; if (s[i] > 0) ++np; }
        const Mat K = congruence(n, s, sVector(n, 1.0));
        InexactLDLT f(eps);
        const Inertia got = f.factor(K);
        sVector xt(n), b(n, 0.0);
        for (std::size_t i = 0; i < n; ++i) xt[i] = uni();
        for (std::size_t i = 0; i < n; ++i)
            for (std::size_t j = 0; j < n; ++j) b[i] += K[i][j] * xt[j];
        SolveReport rep;
        f.solve(b, rep);
        const bool accepted = rep.backwardError <= kBackwardErrorLimit;
        const bool expectAccepted = eps < 1.0e-3;
        const bool ok = got == Inertia{np, n - np, 0} && accepted == expectAccepted
                        && rep.backwardError <= rep.backwardErrorBefore
                        && (!expectAccepted || rep.backwardErrorBefore > 1.0e-9);
        std::printf("%-44s n=%-4zu inexact factors eps %.0e: eta before %.2e after %.2e (%zu steps) -> %s  %s\n",
                    "refinement of an approximate factorisation", n, eps, rep.backwardErrorBefore,
                    rep.backwardError, rep.refinementSteps, accepted ? "ACCEPTED" : "REJECTED",
                    ok ? "ok" : "FAIL");
        if (!ok) ++failures;
    }

    if (failures)
    {
        std::printf("LDLT_INERTIA_FAIL (%d)\n", failures);
        return 1;
    }
    std::printf("LDLT_INERTIA_OK\n");
    return 0;
}
