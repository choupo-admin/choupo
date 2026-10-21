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
} // namespace

ODEStats Rosenbrock23::integrate(sVector& y, scalar t0, scalar t1,
                                 const DerivFn& f, const ODEControls& ctrl) const
{
    ODEStats st;
    const std::size_t n = y.size();
    const scalar span = t1 - t0;
    if (span <= 0.0) return st;

    const scalar d   = 1.0 / (2.0 + std::sqrt(2.0));
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
        if (st.steps >= ctrl.maxSteps) { st.ok = false; break; }

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
            catch (...) { h *= 0.5; ++st.rejected; if (h < hMin) { st.ok = false; break; } continue; }
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
            catch (...) { h *= 0.5; ++st.rejected; if (h < hMin) { st.ok = false; break; } continue; }
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
            for (std::size_t p = 0; p < nb; ++p) rb[p] = r[S->blockRows[p]];
            const sVector xb = blockThomasSolve(Wbt, std::move(rb));
            sVector x(n, 0.0);
            for (std::size_t p = 0; p < nb; ++p) x[S->blockRows[p]] = xb[p];
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
        sVector ynew(n);
        for (std::size_t i = 0; i < n; ++i) ynew[i] = y[i] + h * k2[i];

        // f3 = f(t+h, y*)
        const sVector f3 = f(t + h, ynew);

        // k3 = W^{-1}( f3 - e32(k2 - f2) - 2(k1 - f0) + hd*Td )
        sVector r3(n);
        for (std::size_t i = 0; i < n; ++i)
            r3[i] = f3[i] - e32 * (k2[i] - f2[i]) - 2.0 * (k1[i] - f0[i]) + hd * Td[i];
        const sVector k3 = solveW(r3);

        // embedded error err = (h/6)(k1 - 2 k2 + k3)
        scalar errNorm = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            const scalar err = (h / 6.0) * (k1[i] - 2.0 * k2[i] + k3[i]);
            const scalar sc  = atolFor(ctrl, i)
                             + ctrl.rtol * std::max(std::abs(y[i]), std::abs(ynew[i]));
            const scalar e   = err / sc;
            errNorm += e * e;
        }
        errNorm = std::sqrt(errNorm / static_cast<scalar>(n));

        // positivity: a step that drives a species row negative is unphysical
        // and would feed a fractional pow() a negative base -> NaN.  Reject it.
        bool negative = false;
        for (std::size_t i = 0; i < ctrl.nPositive && i < n; ++i)
            if (ynew[i] < 0.0) { negative = true; break; }

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
            const scalar fac = 0.8 * std::pow(std::max(errNorm, 1.0e-10), -1.0 / 3.0);
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
                const scalar fac = 0.8 * std::pow(errNorm, -1.0 / 3.0);
                h *= std::min(1.0, std::max(0.1, fac));
            }
            if (h < hMin) { st.ok = false; break; }
        }
    }

    st.hLast     = h;
    st.hNext     = hNext;
    st.hMinUsed  = hMin;
    st.stiffness = stiffPeak;

    if (ctrl.verbosity >= 3)
    {
        // The explicit-method stability bound (RK4 ~ 2.8/|λ|max) vs the step we
        // actually took: the ratio is "how much stiffness bought us".
        const scalar hExpl = (stiffPeak > 0.0) ? 2.8 / stiffPeak : 0.0;
        std::cout << "  [ODE] Rosenbrock23 (L-stable, linearly-implicit 2(3))\n"
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
