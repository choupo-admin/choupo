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

#include "Rosenbrock23.H"
#include "Jacobian.H"
#include "../LU.H"
#include "../BlockTridiagonal.H"

#include <algorithm>
#include <cmath>
#include <iostream>
#include <stdexcept>
#include <string>

namespace Choupo::solver
{

namespace
{
// Per-component absolute tolerance from the (possibly size-1) atol vector.
scalar atolFor(const ODEControls& c, std::size_t i)
{
    if (c.atol.empty()) return 1.0e-12;
    return (i < c.atol.size()) ? c.atol[i] : c.atol.back();
}

// Gershgorin bound on the spectral radius: max_i Σ_j |J_ij| >= |λ|_max.
scalar spectralBound(const std::vector<sVector>& J)
{
    scalar m = 0.0;
    for (const auto& row : J)
    {
        scalar s = 0.0;
        for (scalar v : row) s += std::abs(v);
        m = std::max(m, s);
    }
    return m;
}

const scalar kSqrtEpsR = std::sqrt(2.220446049250313e-16);

//  The declared structure, checked for SHAPE before any number is computed:
//  blockRows must name nBlocks*blockSize DISTINCT rows of y, and every
//  borderReads entry must name a border row once, with a span inside the
//  bed.  posOf[i] is the block-order position of row i, or -1 for a border
//  (quadrature) row.  The border rows are split into NARROW ones (reading
//  at most three consecutive blocks -- or none) and WIDE ones (the rest).
using BorderRead = ODEBlockStructure::BorderRead;

void indexStructure(const ODEBlockStructure& s, std::size_t n,
                    std::vector<long>& posOf,
                    std::vector<BorderRead>& narrow,
                    std::vector<std::size_t>& wide)
{
    const std::size_t nb = s.nBlocks * s.blockSize;
    if (s.blockRows.size() != nb || nb > n)
        throw std::runtime_error(
            "Rosenbrock23: the DECLARED block structure is malformed -- "
            + std::to_string(s.nBlocks) + " blocks of "
            + std::to_string(s.blockSize) + " need "
            + std::to_string(nb) + " block rows, the declaration lists "
            + std::to_string(s.blockRows.size()) + " for a state of "
            + std::to_string(n) + ".  Refusing.");
    posOf.assign(n, -1);
    for (std::size_t p = 0; p < nb; ++p)
    {
        const std::size_t r = s.blockRows[p];
        if (r == ODEBlockStructure::kPad) continue;   // a padding slot
        if (r >= n || posOf[r] >= 0)
            throw std::runtime_error(
                "Rosenbrock23: the DECLARED block structure is malformed --"
                " block row " + std::to_string(p) + " names state row "
                + std::to_string(r) + ", which is out of range or listed"
                " twice.  Refusing.");
        posOf[r] = long(p);
    }
    std::vector<int> declared(n, 0);
    narrow.clear();
    for (const auto& br : s.borderReads)
    {
        const bool empty = br.first > br.last;
        if (br.row >= n || posOf[br.row] >= 0 || declared[br.row]++
            || (!empty && (br.first < 0 || br.last >= long(s.nBlocks))))
            throw std::runtime_error(
                "Rosenbrock23: the DECLARED block structure is malformed --"
                " borderReads names state row " + std::to_string(br.row)
                + " (blocks " + std::to_string(br.first) + ".."
                + std::to_string(br.last) + "), which is not a border row,"
                " is listed twice, or reads outside the "
                + std::to_string(s.nBlocks) + " blocks.  Refusing.");
        if (empty || br.last - br.first <= 2) narrow.push_back(br);
        else declared[br.row] = 0;       // a declared but wide span
    }
    wide.clear();
    for (std::size_t i = 0; i < n; ++i)
        if (posOf[i] < 0 && !declared[i]) wide.push_back(i);
}

//  THE DECLARATION IS A CLAIM, AND A CLAIM IS MEASURED.  On the first
//  Jacobian built under a declaration the dense one is built too, and
//    - every entry in a BORDER column (a quadrature row that something
//      reads back), every block entry OUTSIDE the three bands, and every
//      entry of a narrow border row OUTSIDE the blocks it declared it
//      reads, is "off";
//    - every entry inside the bands, and inside a narrow row's span, is
//      "in", and is compared with the colored one (on a true structure
//      they are the same floating-point number).
//  A materially false structure, or a coloring that does not reproduce the
//  dense entries, REFUSES by name -- a wrong declaration must never become
//  a silently wrong breakthrough curve.  A WIDE border row may read any
//  block (it is closed by a directional difference, not by color).
void auditStructure(const std::vector<sVector>& Jd,
                    const ColoredODEJacobian& colored,
                    const std::vector<long>& posOf,
                    const std::vector<BorderRead>& narrow,
                    ODEBlockStructure& s)
{
    const std::size_t n  = Jd.size();
    const long        nv = long(s.blockSize);
    std::vector<long> narrowOf(n, -1);
    for (std::size_t i = 0; i < narrow.size(); ++i)
        narrowOf[narrow[i].row] = long(i);
    scalar off = 0.0, in = 0.0, mismatch = 0.0;
    for (std::size_t r = 0; r < n; ++r)
        for (std::size_t c = 0; c < n; ++c)
        {
            const scalar v = std::abs(Jd[r][c]);
            const long pr = posOf[r], pc = posOf[c];
            if (pc < 0) { off = std::max(off, v); continue; }
            const long bc = pc / nv;
            if (pr < 0)                                   // a border row
            {
                const long i = narrowOf[r];
                if (i < 0) continue;                      // wide: free
                const auto& br = narrow[std::size_t(i)];
                if (bc < br.first || bc > br.last)
                {
                    off = std::max(off, v);
                    continue;
                }
                in = std::max(in, v);
                const scalar vc = colored.narrowR[std::size_t(i)]
                    [std::size_t((bc - br.first) * nv + pc % nv)];
                mismatch = std::max(mismatch, std::abs(vc - Jd[r][c]));
                continue;
            }
            const long br = pr / nv;
            if (std::labs(br - bc) > 1) { off = std::max(off, v); continue; }
            in = std::max(in, v);
            const scalar vc = colored.bands.b[std::size_t(br)][std::size_t(bc - br + 1)]
                                             [std::size_t(pr % nv)][std::size_t(pc % nv)];
            mismatch = std::max(mismatch, std::abs(vc - Jd[r][c]));
        }
    s.offStructureMax = off;
    s.inStructureMax  = in;
    s.coloredMismatch = mismatch;
    s.audited = true;
    const scalar tol = 1.0e-4 * std::max(in, scalar(1.0));
    if (off > tol)
        throw std::runtime_error(
            "Rosenbrock23: the DECLARED block-tridiagonal structure ("
            + std::to_string(s.nBlocks) + " blocks of "
            + std::to_string(s.blockSize) + ", "
            + std::to_string(n - s.nBlocks * s.blockSize)
            + " border rows) is FALSE: max |J| outside it is "
            + std::to_string(off) + " against " + std::to_string(in)
            + " inside.  The model couples non-adjacent blocks, a border"
            " row is read back, or a border row reads blocks it did not"
            " declare.  Integrate it dense, or fix the declaration."
            "  Refusing -- a wrong structure must not become a silently"
            " wrong answer.");
    if (mismatch > tol)
        throw std::runtime_error(
            "Rosenbrock23: the COLORED Jacobian disagrees with the dense one"
            " inside the declared structure (max difference "
            + std::to_string(mismatch) + " against " + std::to_string(in)
            + ").  The coloring is not separating the columns it groups."
            "  Refusing.");
}
//  ---- Rodas4: the six stages --------------------------------------------
//  Hairer & Wanner, "Solving Ordinary Differential Equations II" (2nd ed.,
//  Springer 1996), Section IV.7, the method RODAS4 (Table 7.2), in the form
//  of the published code RODAS (Hairer's rodas.f): L-stable, order 4, an
//  embedded order-3 solution whose difference from the 4th-order one is the
//  last stage.  With gamma = 1/4 the stage equations are
//      (I/(h gamma) - J) u_i = f(t + c_i h, y + sum_j a_ij u_j)
//                              + sum_j (c_ij / h) u_j + h d_i df/dt,
//  and W = I - h gamma J (the matrix the caller already factors) solves them
//  as  W u_i = h gamma r_i.  The new state is  y + sum_j a5j u_j + u5 + u6
//  and the error estimate is u6.  Constants as printed in rodas.f; the
//  convergence order they give was MEASURED when they were entered
//  (2026-11-08, fixed steps h = 3/20 .. 3/160 on a nonautonomous nonlinear
//  pair: observed order 4.27, 4.16, 4.11; a mistyped digit shows as a lower
//  order), and an L-stability probe y' = -1000 (y - cos t) - sin t at
//  h = 0.1 gave 3.7e-7 against the exact cos t.
struct Rodas4Coeffs
{
    static constexpr scalar c2 = 0.386, c3 = 0.21, c4 = 0.63;
    static constexpr scalar d1 = 0.25, d2 = -0.1043, d3 = 0.1035,
                            d4 = -0.03620000000000023;
    static constexpr scalar a21 = 0.1544e1;
    static constexpr scalar a31 = 0.9466785280815826, a32 = 0.2557011698983284;
    static constexpr scalar a41 = 0.3314825187068521e1,
                            a42 = 0.2896124015972201e1,
                            a43 = 0.9986419139977817;
    static constexpr scalar a51 = 0.1221224509226641e1,
                            a52 = 0.6019134481288629e1,
                            a53 = 0.1253708332932087e2,
                            a54 = -0.6878860361058950;
    static constexpr scalar c21 = -0.5668800000000000e1;
    static constexpr scalar c31 = -0.2430093356833875e1,
                            c32 = -0.2063599157091915;
    static constexpr scalar c41 = -0.1073529058151375,
                            c42 = -0.9594562251023355e1,
                            c43 = -0.2047028614809616e2;
    static constexpr scalar c51 = 0.7496443313967647e1,
                            c52 = -0.1024680431464352e2,
                            c53 = -0.3399990352819905e2,
                            c54 = 0.1170890893206160e2;
    static constexpr scalar c61 = 0.8083246795921522e1,
                            c62 = -0.7981132988064893e1,
                            c63 = -0.3152159432874371e2,
                            c64 = 0.1631930543123136e2,
                            c65 = -0.6058818238834054e1;
};

template <class SolveW>
void rodas4Stages(const DerivFn& f, scalar t, scalar h, scalar hd,
                  const sVector& y, const sVector& f0, const sVector& Td,
                  const SolveW& solveW, const ODEControls& ctrl,
                  sVector& ynew, scalar& errNorm)
{
    using C = Rodas4Coeffs;
    const std::size_t n = y.size();
    const scalar ih = 1.0 / h;
    sVector r(n), yy(n);

    //  u_i = W^{-1} (hd * r_i), r_i already assembled in r
    auto stage = [&](void) -> sVector
    {
        for (std::size_t i = 0; i < n; ++i) r[i] *= hd;
        return solveW(r);
    };

    for (std::size_t i = 0; i < n; ++i) r[i] = f0[i] + h * C::d1 * Td[i];
    const sVector u1 = stage();

    for (std::size_t i = 0; i < n; ++i) yy[i] = y[i] + C::a21 * u1[i];
    sVector fy = f(t + C::c2 * h, yy);
    for (std::size_t i = 0; i < n; ++i)
        r[i] = fy[i] + C::c21 * ih * u1[i] + h * C::d2 * Td[i];
    const sVector u2 = stage();

    for (std::size_t i = 0; i < n; ++i)
        yy[i] = y[i] + C::a31 * u1[i] + C::a32 * u2[i];
    fy = f(t + C::c3 * h, yy);
    for (std::size_t i = 0; i < n; ++i)
        r[i] = fy[i] + ih * (C::c31 * u1[i] + C::c32 * u2[i])
             + h * C::d3 * Td[i];
    const sVector u3 = stage();

    for (std::size_t i = 0; i < n; ++i)
        yy[i] = y[i] + C::a41 * u1[i] + C::a42 * u2[i] + C::a43 * u3[i];
    fy = f(t + C::c4 * h, yy);
    for (std::size_t i = 0; i < n; ++i)
        r[i] = fy[i] + ih * (C::c41 * u1[i] + C::c42 * u2[i] + C::c43 * u3[i])
             + h * C::d4 * Td[i];
    const sVector u4 = stage();

    for (std::size_t i = 0; i < n; ++i)
        yy[i] = y[i] + C::a51 * u1[i] + C::a52 * u2[i] + C::a53 * u3[i]
              + C::a54 * u4[i];
    fy = f(t + h, yy);
    for (std::size_t i = 0; i < n; ++i)
        r[i] = fy[i] + ih * (C::c51 * u1[i] + C::c52 * u2[i] + C::c53 * u3[i]
                           + C::c54 * u4[i]);
    const sVector u5 = stage();

    for (std::size_t i = 0; i < n; ++i) yy[i] += u5[i];
    fy = f(t + h, yy);
    for (std::size_t i = 0; i < n; ++i)
        r[i] = fy[i] + ih * (C::c61 * u1[i] + C::c62 * u2[i] + C::c63 * u3[i]
                           + C::c64 * u4[i] + C::c65 * u5[i]);
    const sVector u6 = stage();

    ynew.assign(n, 0.0);
    errNorm = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        ynew[i] = yy[i] + u6[i];
        const scalar sc = ((ctrl.atol.empty()) ? 1.0e-12
                           : (i < ctrl.atol.size() ? ctrl.atol[i]
                                                   : ctrl.atol.back()))
                        + ctrl.rtol * std::max(std::abs(y[i]), std::abs(ynew[i]));
        const scalar e = u6[i] / sc;
        errNorm += e * e;
    }
    errNorm = std::sqrt(errNorm / static_cast<scalar>(n));
}
} // namespace

ODEStats Rosenbrock23::integrate(sVector& y, scalar t0, scalar t1,
                                 const DerivFn& f, const ODEControls& ctrl) const
{
    const bool rodas = (scheme_ == Scheme::Rodas4);
    //  step-size controller: the estimate is O(h^3) for the 2(3) pair and
    //  O(h^4) for Rodas4, so the step scales as err^(-1/3) and err^(-1/4)
    const scalar pw     = rodas ? 0.25 : 1.0 / 3.0;
    const scalar safety = rodas ? 0.9  : 0.8;
    ODEStats st;
    const std::size_t n = y.size();
    const scalar span = t1 - t0;
    if (span <= 0.0) return st;

    //  d is the diagonal coefficient of W = I - h*d*J: 1/(2+sqrt2) for the
    //  2(3) pair, gamma = 1/4 for Rodas4 (Hairer & Wanner, Table 7.2).
    const scalar d   = rodas ? 0.25 : 1.0 / (2.0 + std::sqrt(2.0));
    const scalar e32 = 6.0 + std::sqrt(2.0);

    // Typical scales for the FD Jacobian (|y| with an atol floor).
    sVector typ(n, 1.0);
    for (std::size_t i = 0; i < n; ++i)
        typ[i] = std::max(std::abs(y[i]), atolFor(ctrl, i));

    // Initial step (Hairer-style): h0 ~ 0.01 ||y||/||f|| in the scaled norm.
    scalar t = t0;
    sVector f0 = f(t, y);
    scalar h;
    if (ctrl.hInit > 0.0)
        h = ctrl.hInit;
    else
    {
        scalar d0 = 0.0, d1 = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            const scalar sc = atolFor(ctrl, i) + ctrl.rtol * std::abs(y[i]);
            d0 += (y[i] / sc) * (y[i] / sc);
            d1 += (f0[i] / sc) * (f0[i] / sc);
        }
        d0 = std::sqrt(d0 / n); d1 = std::sqrt(d1 / n);
        h  = (d1 < 1.0e-10) ? 1.0e-6 * std::max(span, 1.0) : 0.01 * d0 / d1;
        h  = std::min(h, span);
        if (h <= 0.0) h = 1.0e-8 * std::max(span, 1.0);
    }
    const scalar hMin = (ctrl.hMin > 0.0)
        ? ctrl.hMin
        : 1.0e-13 * std::max(std::abs(t1), 1.0);
    // Optional caps (0 => no cap).  hMax bounds the step itself; maxGrowth
    // bounds how fast the step may grow after an accepted step (the spiritual
    // maxCo).  Both seed at the dict opt-in and otherwise leave behaviour as-is.
    const scalar hMax      = (ctrl.hMax > 0.0) ? ctrl.hMax : span;
    const scalar maxGrowth = (ctrl.maxGrowth > 1.0) ? ctrl.maxGrowth : 4.0;
    if (h > hMax) h = hMax;

    scalar stiffPeak = 0.0;

    // ---- the OPT-IN declared structure (ODEBlockStructure) ---------------
    //  Absent, every line below takes the dense path exactly as before.
    ODEBlockStructure* S = (ctrl.structure && ctrl.structure->declared())
                         ? ctrl.structure : nullptr;
    std::vector<long>        posOf;    // state row -> block-order position
    std::vector<BorderRead>  narrow;   // border rows differentiated by color
    std::vector<std::size_t> wide;     // border rows closed by direction
    if (S)
    {
        indexStructure(*S, n, posOf, narrow, wide);
        S->narrowBorderRows = long(narrow.size());
        S->wideBorderRows   = long(wide.size());
    }
    const std::size_t nb = S ? S->nBlocks * S->blockSize : 0;

    // The step the controller proposes for the NEXT interval (ODEStats).
    scalar hNext = h;

    while (t < t1 - 1.0e-14 * std::max(std::abs(t1), 1.0))
    {
        if (h > hMax) h = hMax;
        //  the step the controller wants, before it is shortened to land on
        //  t1 -- remembered so the next interval can start from IT
        const scalar hWanted = h;
        if (h > t1 - t) h = t1 - t;
        if (st.steps >= ctrl.maxSteps)
        {
            st.ok = false;
            st.failure = "maxSteps: " + std::to_string(ctrl.maxSteps)
                       + " steps taken without reaching the interval end";
            break;
        }

        // --- one Jacobian + one factorisation of W = I - h*d*J --------------
        f0 = f(t, y);
        sVector Td;
        std::vector<sVector>     W;          // dense path
        std::vector<std::size_t> piv;
        BlockThomasLU            Wbt;        // structured path
        ColoredODEJacobian       colored;
        if (!S)
        {
            auto J  = fdJacobianODE(f, t, y, f0, typ);
            Td = fdDfDt(f, t, y, f0, std::max(span, 1.0));
            stiffPeak = std::max(stiffPeak, spectralBound(J));

            W.assign(n, sVector(n, 0.0));
            for (std::size_t i = 0; i < n; ++i)
                for (std::size_t j = 0; j < n; ++j)
                    W[i][j] = (i == j ? 1.0 : 0.0) - h * d * J[i][j];

            try { luFactor(W, piv); }
            catch (...)
            {
                h *= 0.5; ++st.rejected;
                if (h < hMin)
                {
                    st.ok = false;
                    st.failure = "hMin: the step fell below the floor while"
                                 " W = I - h d J stayed singular";
                    break;
                }
                continue;
            }
        }
        else
        {
            colored = fdJacobianODEColored(f, t, y, f0, typ, *S, narrow);
            ++S->jacobians;
            S->jacobianEvals += colored.evals;
            if (!S->audited)
            {
                const auto Jd = fdJacobianODE(f, t, y, f0, typ);
                S->auditEvals = long(n);
                auditStructure(Jd, colored, posOf, narrow, *S);  // may refuse
            }
            Td = fdDfDt(f, t, y, f0, std::max(span, 1.0));

            //  Gershgorin over the BLOCK rows (a border row is a ledger in
            //  its own units, not a rate the step has to resolve).
            const std::size_t nv = S->blockSize;
            for (std::size_t b = 0; b < S->nBlocks; ++b)
                for (std::size_t i = 0; i < nv; ++i)
                {
                    scalar rs = 0.0;
                    for (const auto& blk : colored.bands.b[b])
                        for (scalar v : blk[i]) rs += std::abs(v);
                    stiffPeak = std::max(stiffPeak, rs);
                }

            //  W_bb = I - h d J_bb, band by band
            BlockBands Wb = colored.bands;
            for (std::size_t b = 0; b < S->nBlocks; ++b)
                for (std::size_t w = 0; w < 3; ++w)
                    for (std::size_t i = 0; i < nv; ++i)
                        for (std::size_t k = 0; k < nv; ++k)
                            Wb.b[b][w][i][k] = ((w == 1 && i == k) ? 1.0 : 0.0)
                                             - h * d * colored.bands.b[b][w][i][k];
            try { Wbt = blockThomasFactor(Wb); }
            catch (...)
            {
                h *= 0.5; ++st.rejected;
                if (h < hMin)
                {
                    st.ok = false;
                    st.failure = "hMin: the step fell below the floor while"
                                 " W = I - h d J stayed singular";
                    break;
                }
                continue;
            }
        }

        const scalar hd = h * d;

        //  x = W^{-1} r.  Dense: the LU above.  Structured: block-Thomas on
        //  the block rows, then each border row closed directly,
        //      x_d = r_d + h d (R x_b):
        //  a NARROW row from its colored entries (the same perturbations as
        //  the block rows), the WIDE rows together from ONE directional
        //  difference of f along x_b (scaled so its largest RELATIVE
        //  component is sqrt(machine eps)).
        auto solveW = [&](const sVector& r) -> sVector
        {
            if (!S) return luSolve(W, piv, r);
            const std::size_t nv = S->blockSize;
            sVector rb(nb);
            constexpr std::size_t kPad = ODEBlockStructure::kPad;
            for (std::size_t p = 0; p < nb; ++p)
                rb[p] = S->blockRows[p] == kPad ? 0.0 : r[S->blockRows[p]];
            const sVector xb = blockThomasSolve(Wbt, std::move(rb));
            sVector x(n, 0.0);
            for (std::size_t p = 0; p < nb; ++p)
                if (S->blockRows[p] != kPad) x[S->blockRows[p]] = xb[p];
            for (std::size_t i = 0; i < narrow.size(); ++i)
            {
                const auto& br = narrow[i];
                scalar Rx = 0.0;
                for (long b = br.first; b <= br.last; ++b)
                    for (std::size_t k = 0; k < nv; ++k)
                        Rx += colored.narrowR[i][std::size_t(b - br.first) * nv + k]
                            * xb[std::size_t(b) * nv + k];
                x[br.row] = r[br.row] + hd * Rx;
            }
            if (wide.empty()) return x;
            scalar rel = 0.0;
            for (std::size_t p = 0; p < nb; ++p)
            {
                const std::size_t i = S->blockRows[p];
                if (i == kPad) continue;
                rel = std::max(rel, std::abs(x[i])
                                    / std::max(std::abs(y[i]), typ[i]));
            }
            if (rel > 0.0 && std::isfinite(rel))
            {
                const scalar delta = kSqrtEpsR / rel;
                sVector yp = y;
                for (std::size_t p = 0; p < nb; ++p)
                {
                    const std::size_t i = S->blockRows[p];
                    if (i == kPad) continue;
                    yp[i] = y[i] + delta * x[i];
                }
                const sVector fp = f(t, yp);
                ++S->borderEvals;
                for (std::size_t dRow : wide)
                    x[dRow] = r[dRow] + hd * (fp[dRow] - f0[dRow]) / delta;
            }
            else
                for (std::size_t dRow : wide) x[dRow] = r[dRow];
            return x;
        };

        sVector ynew(n);
        scalar errNorm = 0.0;
        if (!rodas)
        {
            // k1 = W^{-1} (f0 + hd*Td)
            sVector r1(n);
            for (std::size_t i = 0; i < n; ++i) r1[i] = f0[i] + hd * Td[i];
            const sVector k1 = solveW(r1);

            // f2 = f(t+h/2, y + h/2 k1)
            sVector y2(n);
            for (std::size_t i = 0; i < n; ++i) y2[i] = y[i] + 0.5 * h * k1[i];
            const sVector f2 = f(t + 0.5 * h, y2);

            // k2 = W^{-1}(f2 - k1) + k1
            sVector r2(n);
            for (std::size_t i = 0; i < n; ++i) r2[i] = f2[i] - k1[i];
            sVector k2 = solveW(r2);
            for (std::size_t i = 0; i < n; ++i) k2[i] += k1[i];

            // candidate y* = y + h k2
            for (std::size_t i = 0; i < n; ++i) ynew[i] = y[i] + h * k2[i];

            // f3 = f(t+h, y*)
            const sVector f3 = f(t + h, ynew);

            // k3 = W^{-1}( f3 - e32(k2 - f2) - 2(k1 - f0) + hd*Td )
            sVector r3(n);
            for (std::size_t i = 0; i < n; ++i)
                r3[i] = f3[i] - e32 * (k2[i] - f2[i]) - 2.0 * (k1[i] - f0[i]) + hd * Td[i];
            const sVector k3 = solveW(r3);

            // embedded error err = (h/6)(k1 - 2 k2 + k3)
            for (std::size_t i = 0; i < n; ++i)
            {
                const scalar err = (h / 6.0) * (k1[i] - 2.0 * k2[i] + k3[i]);
                const scalar sc  = atolFor(ctrl, i)
                                 + ctrl.rtol * std::max(std::abs(y[i]), std::abs(ynew[i]));
                const scalar e   = err / sc;
                errNorm += e * e;
            }
            errNorm = std::sqrt(errNorm / static_cast<scalar>(n));
        }
        else
        {
            rodas4Stages(f, t, h, hd, y, f0, Td, solveW, ctrl, ynew, errNorm);
            //  A row that must stay >= 0 and sits at zero (the clean bed
            //  ahead of a front) comes out of the six-stage combination at
            //  round-off, -1e-30 rather than 0.  Below the row's own
            //  absolute tolerance that is the same number as zero: it is
            //  set to zero.  Anything more negative is a real overshoot and
            //  is rejected below, as for the 2(3) pair.
            for (std::size_t i = 0; i < ctrl.positiveRows.size() && i < n; ++i)
                if (ctrl.positiveRows[i] && ynew[i] < 0.0
                    && ynew[i] > -atolFor(ctrl, i))
                    ynew[i] = 0.0;
        }

        // positivity: a step that drives a masked row negative is unphysical
        // and would feed a fractional pow() a negative base -> NaN.  Reject it
        // (the mask covers every packed unit's rows, at their own offsets).
        bool negative = false;
        for (std::size_t i = 0; i < ctrl.positiveRows.size() && i < n; ++i)
            if (ctrl.positiveRows[i]
                && ynew[i] < (ctrl.positiveWithinAtol ? -atolFor(ctrl, i)
                                                       : 0.0))
            { negative = true; st.negativeRow = i; break; }

        bool finite = true;
        for (scalar v : ynew) if (!std::isfinite(v)) { finite = false; break; }

        ++st.steps;
        if (errNorm <= 1.0 && !negative && finite)
        {
            // accept
            y = ynew;
            t += h;
            ++st.accepted;
            for (std::size_t i = 0; i < n; ++i)
                typ[i] = std::max(std::abs(y[i]), atolFor(ctrl, i));
            const scalar hAccepted = h;
            // grow the step (order-2 pair -> exponent 1/3), capped by maxGrowth.
            const scalar fac = safety * std::pow(std::max(errNorm, 1.0e-10), -pw);
            h *= std::min(maxGrowth, std::max(0.2, fac));
            if (h > hMax) h = hMax;
            //  The next interval's proposal.  A step SHORTENED to land on t1
            //  says little about the step the controller wanted: start from
            //  the WANTED one, bounded by what the shortened step's own
            //  error supports (fac uncapped by maxGrowth, floored at 0.2).
            if (hAccepted < hWanted)
                hNext = std::min(hMax, std::min(hWanted,
                            hAccepted * std::max(0.2, fac)));
            else
                hNext = h;
            // Glass-box: report the step we just took at the time we reached.
            if (ctrl.onAccept) ctrl.onAccept(t, hAccepted);
            if (ctrl.onAcceptState) ctrl.onAcceptState(t, hAccepted, y);
        }
        else
        {
            // reject + shrink
            ++st.rejected;
            if (negative || !finite) h *= 0.5;
            else
            {
                const scalar fac = safety * std::pow(errNorm, -pw);
                h *= std::min(1.0, std::max(0.1, fac));
            }
            if (h < hMin)
            {
                st.ok = false;
                st.failure = std::string("hMin: the step fell below the floor"
                                         " after a rejected step (")
                    + (!finite   ? "non-finite candidate state"
                      : negative ? "a positive row driven negative"
                                 : "local error above tolerance")
                    + ")";
                break;
            }
        }
    }

    st.tReached  = t;
    st.hLast     = h;
    st.hNext     = hNext;
    st.hMinUsed  = hMin;
    st.stiffness = stiffPeak;

    if (ctrl.verbosity >= 3)
    {
        // The explicit-method stability bound (RK4 ~ 2.8/|λ|max) vs the step we
        // actually took: the ratio is "how much stiffness bought us".
        const scalar hExpl = (stiffPeak > 0.0) ? 2.8 / stiffPeak : 0.0;
        std::cout << (rodas ? "  [ODE] Rodas4 (L-stable, linearly-implicit, order 4(3))\n"
                            : "  [ODE] Rosenbrock23 (L-stable, linearly-implicit 2(3))\n")
                  << "        steps: " << st.accepted << " accepted, "
                  << st.rejected << " rejected\n"
                  << "        |lambda|_max ~ " << stiffPeak << " 1/s"
                  << "   explicit-stable step ~ " << hExpl << " s\n"
                  << "        stiffness ratio ~ "
                  << ((hExpl > 0.0) ? (st.hLast / hExpl) : 0.0)
                  << "x (implicit steps that big would be unstable for RK4)\n";
        if (!st.ok)
            std::cout << "        WARNING: gave up (step below hMin or maxSteps)\n";
    }
    return st;
}

} // namespace Choupo::solver
