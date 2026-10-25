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
  The ENP pore solved node by node at once -- the equations are in
  PoreNernstPlanck.H; this file is the residual with its analytic Jacobian,
  the grid, the seed, the Newton call and the continuation, in that order.
\*---------------------------------------------------------------------------*/

#include "PoreNernstPlanck.H"

#include "core/Advisory.H"
#include "core/InfeasibleTrial.H"
#include "solver/BlockTridiagonal.H"
#include "solver/NewtonND.H"

#include <algorithm>
#include <cmath>
#include <limits>
#include <stdexcept>
#include <string>

namespace Choupo {
namespace membrane {
namespace pore {

scalar bernoulli(scalar x)
{
    //  Near 0 the quotient x/(e^x - 1) cancels; its Taylor series is
    //  1 - x/2 + x^2/12 - x^4/720 + ..., and below |x| = 1e-4 the first
    //  three terms leave an error under 1e-19.
    if (std::abs(x) < 1.0e-4) return 1.0 - 0.5 * x + x * x / 12.0;
    //  x > 0: x e^{-x} / (1 - e^{-x}), which underflows to 0 instead of
    //  overflowing; x < 0: x / expm1(x), which tends to -x.
    if (x > 0.0) return x * std::exp(-x) / (-std::expm1(-x));
    return x / std::expm1(x);
}

scalar bernoulliSlope(scalar x)
{
    //  B'(x) = B(x) (1 - x - B(x)) / x, from B(-x) = B(x) + x.  The bracket
    //  cancels near 0, where the series -1/2 + x/6 - x^3/180 + x^5/5040 is
    //  used (the next term, x^7/151200, is below 1e-19 at |x| = 1e-2).
    if (std::abs(x) < 1.0e-2)
    {
        const scalar x2 = x * x;
        return -0.5 + x / 6.0 - x * x2 / 180.0 + x * x2 * x2 / 5040.0;
    }
    const scalar B = bernoulli(x);
    return B * (1.0 - x - B) / x;
}

std::vector<scalar> gradedGrid(std::size_t N, scalar beta)
{
    std::vector<scalar> g(N + 1);
    for (std::size_t k = 0; k <= N; ++k)
    {
        const scalar s = scalar(k) / scalar(N);
        g[k] = (beta > 0.0)
             ? 0.5 * (1.0 + std::tanh(beta * (2.0 * s - 1.0)) / std::tanh(beta))
             : s;
    }
    g.front() = 0.0;
    g.back()  = 1.0;
    return g;
}

scalar daviesLnGamma(int z, scalar I_molL, scalar A, scalar* dLnGamma_dI)
{
    //  log10 gamma = -A z^2 (sqrt(I)/(1 + sqrt(I)) - 0.3 I)  (Davies 1962)
    static const scalar ln10 = std::log(10.0);
    if (z == 0 || !(A > 0.0))
    {
        if (dLnGamma_dI) *dLnGamma_dI = 0.0;
        return 0.0;
    }
    const scalar I  = std::max(I_molL, 0.0);
    const scalar sI = std::sqrt(I);
    const scalar z2 = scalar(z) * scalar(z);
    if (dLnGamma_dI)
        *dLnGamma_dI = (sI > 0.0)
            ? -ln10 * A * z2 * (0.5 / (sI * (1.0 + sI) * (1.0 + sI)) - 0.3)
            : 0.0;
    return -ln10 * A * z2 * (sI / (1.0 + sI) - 0.3 * I);
}

namespace {

// ---- the unknown layout, one block per node (see the header) ---------------
struct Layout
{
    std::size_t Ni = 0, nv = 0, N = 0;     // ions, block size, intervals
    std::size_t u (std::size_t k, std::size_t i) const { return k * nv + i; }
    std::size_t ps(std::size_t k)                const { return k * nv + Ni; }
    std::size_t v (std::size_t k, std::size_t i) const { return k * nv + Ni + 1 + i; }
    std::size_t pp(std::size_t k)                const { return k * nv + 2 * Ni + 1; }
    std::size_t jv(std::size_t k)                const { return k * nv + 2 * Ni + 2; }
    std::size_t xs(std::size_t k)                const { return k * nv + 2 * Ni + 3; }
};

//  What every evaluation of one problem shares: the layout, the grid and
//  the two scales that make J_v and xi' O(1) unknowns.
struct Context
{
    Layout L;
    std::vector<scalar> h;       // h_k = xi_{k+1} - xi_k
    std::vector<scalar> grid;
    scalar Jref  = 1.0;          // J_v = Jref j
    scalar xiRef = 1.0;          // xi' = xiRef x
};

Context contextOf(const PoreProblem& pb, const PoreSettings& s)
{
    Context C;
    C.L.Ni = pb.ions.size();
    C.L.nv = 2 * C.L.Ni + 4;
    C.L.N  = s.intervals;
    C.grid = s.nodes.empty() ? gradedGrid(s.intervals, s.grading) : s.nodes;
    C.h.resize(s.intervals);
    for (std::size_t k = 0; k < s.intervals; ++k) C.h[k] = C.grid[k + 1] - C.grid[k];
    if (pb.closure.active)
        C.Jref = (pb.closure.Aw * pb.closure.dP > 0.0) ? pb.closure.Aw * pb.closure.dP : 1.0e-6;
    else
        C.Jref = (pb.Jv > 0.0) ? pb.Jv : 1.0e-6;
    if (pb.wall.active && pb.wall.coupled)
    {
        scalar ks = 0.0, Ds = 0.0;
        for (std::size_t i = 0; i < C.L.Ni; ++i) { ks += pb.wall.k[i]; Ds += pb.wall.D[i]; }
        C.xiRef = (Ds > 0.0 && ks > 0.0) ? ks / Ds : 1.0;
    }
    return C;
}

// A concentration from its logarithm; a trial whose logarithm leaves the
// representable range is INFEASIBLE (the Newton shortens the step), never
// clamped.
scalar expChecked(scalar w, const char* what)
{
    if (!std::isfinite(w) || w > 700.0 || w < -700.0)
        throw InfeasibleTrial(std::string("pore ENP: ") + what
                              + " left the representable range");
    return std::exp(w);
}

// The fitted (Scharfetter-Gummel) flux of ion i over [k, k+1], split into
// its two terms so the caller can normalise by their magnitudes.
struct FluxTerms { scalar t1, t2; };

FluxTerms fittedFlux(const PoreIon& ion, scalar Jv, scalar h,
                     scalar ck, scalar ck1, scalar psik, scalar psik1)
{
    const scalar Ph = ion.P / h;
    const scalar ah = ion.Kc * Jv * h / ion.P - scalar(ion.z) * (psik1 - psik);
    return { Ph * bernoulli(-ah) * ck, Ph * bernoulli(ah) * ck1 };
}

// THE FACE ACTIVITIES of `activity bulkOverPoreDavies` (PoreActivity): the
// Davies ln gamma, and its derivative in I, on the solution side of the feed
// face (the wall, ionic strength I_wall -- the excluded ions' film counted),
// on the pore side of the feed face (node 0), on the pore side of the
// permeate face (node N) and in the permeate.  ONE home: the residual reads
// it inside every evaluation, and solveFrom reads it once on the answer so
// the ratio the partitions (5)-(6) USED is published, not re-derived.
struct FaceActivities
{
    explicit FaceActivities(std::size_t Ni)
        : lgW(Ni, 0.0), dgW(Ni, 0.0), lg0(Ni, 0.0), dg0(Ni, 0.0),
          lgN(Ni, 0.0), dgN(Ni, 0.0), lgP(Ni, 0.0), dgP(Ni, 0.0) {}
    std::vector<scalar> lgW, dgW, lg0, dg0, lgN, dgN, lgP, dgP;
};

FaceActivities faceActivities(const PoreProblem& pb, const scalar* cWall,
                              const scalar* c0, const scalar* cN,
                              const scalar* cpN, const scalar* cWallExcluded)
{
    const std::size_t Ni = pb.ions.size();
    FaceActivities A(Ni);
    scalar Iw = 0.0, I0 = 0.0, IN = 0.0, Ip = 0.0;
    for (std::size_t i = 0; i < Ni; ++i)
    {
        const scalar z2 = scalar(pb.ions[i].z) * scalar(pb.ions[i].z);
        if (cWall) Iw += 0.5 * z2 * cWall[i];
        I0 += 0.5 * z2 * c0[i];
        IN += 0.5 * z2 * cN[i];
        Ip += 0.5 * z2 * cpN[i];
    }
    if (cWallExcluded)
        for (std::size_t e = 0; e < pb.wall.excluded.size(); ++e)
        {
            const scalar ze = scalar(pb.wall.excluded[e].z);
            Iw += 0.5 * ze * ze * cWallExcluded[e];
        }
    for (std::size_t i = 0; i < Ni; ++i)
    {
        const int z = pb.ions[i].z;
        if (cWall) A.lgW[i] = daviesLnGamma(z, Iw / 1000.0, pb.activity.Asolution, &A.dgW[i]);
        A.lg0[i] = daviesLnGamma(z, I0 / 1000.0, pb.activity.Apore, &A.dg0[i]);
        A.lgN[i] = daviesLnGamma(z, IN / 1000.0, pb.activity.Apore, &A.dgN[i]);
        A.lgP[i] = daviesLnGamma(z, Ip / 1000.0, pb.activity.Asolution, &A.dgP[i]);
    }
    return A;
}

// The wall of the ions that do not enter the pore (PoreWall::excluded): the
// interface balance at zero permeate, at the station's J_v and field.
WallAtField excludedWall(const PoreProblem& pb, scalar Jv, scalar xiPrime)
{
    const std::size_t Ne = pb.wall.excluded.size();
    std::vector<int> z(Ne);
    std::vector<scalar> k(Ne), D(Ne), cb(Ne), zero(Ne, 0.0);
    for (std::size_t e = 0; e < Ne; ++e)
    {
        const auto& x = pb.wall.excluded[e];
        z[e] = x.z; k[e] = x.k; D[e] = x.D; cb[e] = x.cBulk;
    }
    return wallAtField(pb.wall.suction, pb.wall.coupled, Jv, k, D, z, cb, zero,
                       xiPrime, nullptr);
}

// ---- the residual and, when asked, its ANALYTIC Jacobian --------------------
//  One pass computes both: every row's value and, into the three bands, its
//  derivative with respect to every unknown it reads.  `Jb` null: residual
//  only.  The row list is the header's ("THE EQUATIONS of block k").
sVector evaluate(const PoreProblem& pb, const Context& C, const sVector& x,
                 solver::BlockBands* Jb)
{
    const Layout& L = C.L;
    const std::size_t Ni = L.Ni, N = L.N, nv = L.nv;
    const bool wallOn = pb.wall.active;
    const bool actOn  = pb.activity.active;

    //  The concentrations and the permeate copies, node by node (flat
    //  storage: this runs once per residual, thousands of times a run).
    std::vector<scalar> cFlat((N + 1) * Ni), cpFlat((N + 1) * Ni);
    for (std::size_t k = 0; k <= N; ++k)
        for (std::size_t i = 0; i < Ni; ++i)
        {
            cFlat[k * Ni + i]  = expChecked(x[L.u(k, i)], "a pore concentration");
            cpFlat[k * Ni + i] = expChecked(x[L.v(k, i)], "a permeate concentration");
        }
    struct Rows
    {
        const scalar* p; std::size_t n;
        const scalar* operator[](std::size_t k) const { return p + k * n; }
    };
    const Rows c{ cFlat.data(), Ni }, cp{ cpFlat.data(), Ni };

    // ---- the wall (7)-(8), at block 0's own copies --------------------------
    const scalar J0  = C.Jref * x[L.jv(0)];
    const scalar xi0 = C.xiRef * x[L.xs(0)];
    WallAtField W;
    if (wallOn)
    {
        std::vector<int> z(Ni);
        for (std::size_t i = 0; i < Ni; ++i) z[i] = pb.ions[i].z;
        const std::vector<scalar> cp0(cp[0], cp[0] + Ni);
        W = wallAtField(pb.wall.suction, pb.wall.coupled, J0, pb.wall.k, pb.wall.D,
                        z, pb.wall.cBulk, cp0, xi0,
                        pb.wall.solutionDiffusion ? &pb.wall.B : nullptr);
        if (!W.ok) throw InfeasibleTrial("pore ENP wall: " + W.reason);
    }
    const std::size_t Ne = wallOn ? pb.wall.excluded.size() : 0;
    WallAtField WE;
    if (Ne > 0)
    {
        WE = excludedWall(pb, J0, xi0);
        if (!WE.ok) throw InfeasibleTrial("pore ENP wall (an ion the pore"
                                          " excludes): " + WE.reason);
    }

    // ---- the face activities (bulkOverPoreDavies) ---------------------------
    const FaceActivities FA = actOn
        ? faceActivities(pb, wallOn ? W.c_m.data() : nullptr, c[0], c[N], cp[N],
                         Ne > 0 ? WE.c_m.data() : nullptr)
        : FaceActivities(Ni);
    const std::vector<scalar>& lgW = FA.lgW; const std::vector<scalar>& dgW = FA.dgW;
    const std::vector<scalar>& lg0 = FA.lg0; const std::vector<scalar>& dg0 = FA.dg0;
    const std::vector<scalar>& lgN = FA.lgN; const std::vector<scalar>& dgN = FA.dgN;
    const std::vector<scalar>& lgP = FA.lgP; const std::vector<scalar>& dgP = FA.dgP;

    sVector F(x.size(), 0.0);
    //  J[row block][column block][row slot][column slot] += value
    auto add = [&](std::size_t rb, std::size_t rs, std::size_t cb, std::size_t cs, scalar v)
    {
        Jb->b[rb][cb + 1 - rb][rs][cs] += v;
    };

    for (std::size_t k = 0; k <= N; ++k)
    {
        const std::size_t row = k * nv;
        const scalar Jk = C.Jref * x[L.jv(k)];

        // ---- rows 0..Ni-1: the flux of [k, k+1], or the permeate partition --
        for (std::size_t i = 0; i < Ni; ++i)
        {
            const PoreIon& ion = pb.ions[i];
            const scalar z = scalar(ion.z);
            if (k < N)
            {
                const scalar h  = C.h[k];
                const scalar Ph = ion.P / h;
                const scalar ah = ion.Kc * Jk * h / ion.P - z * (x[L.ps(k+1)] - x[L.ps(k)]);
                const scalar Bm = bernoulli(-ah), Bp = bernoulli(ah);
                const scalar t1 = Ph * Bm * c[k][i];
                const scalar t2 = Ph * Bp * c[k+1][i];
                const scalar jj = Jk * cp[k][i];
                const scalar s  = t1 + t2 + std::abs(jj);
                const scalar r  = t1 - t2 - jj;
                const scalar f  = r / s;
                F[row + i] = f;
                if (Jb)
                {
                    const scalar dt1 = -Ph * bernoulliSlope(-ah) * c[k][i];   // d t1/d ah
                    const scalar dt2 =  Ph * bernoulliSlope(ah)  * c[k+1][i]; // d t2/d ah
                    const scalar sg  = (jj >= 0.0) ? 1.0 : -1.0;
                    auto put = [&](std::size_t cb, std::size_t cs, scalar dr, scalar ds)
                    { add(k, i, cb, cs, (dr - f * ds) / s); };
                    put(k,     i,       t1,  t1);
                    put(k + 1, i,      -t2,  t2);
                    put(k,     Ni,      (dt1 - dt2) * z,  (dt1 + dt2) * z);
                    put(k + 1, Ni,     -(dt1 - dt2) * z, -(dt1 + dt2) * z);
                    const scalar dahdj = ion.Kc * h * C.Jref / ion.P;
                    put(k, 2 * Ni + 2, (dt1 - dt2) * dahdj - C.Jref * cp[k][i],
                                       (dt1 + dt2) * dahdj + sg * C.Jref * cp[k][i]);
                    put(k, Ni + 1 + i, -jj, sg * jj);
                }
            }
            else
            {
                scalar lnPerm = std::log(ion.permSide);
                if (actOn) lnPerm += lgP[i] - lgN[i];
                F[row + i] = x[L.u(N, i)] - lnPerm - x[L.v(N, i)]
                           + z * (x[L.ps(N)] - x[L.pp(N)]);
                if (Jb)
                {
                    add(N, i, N, i, 1.0);
                    add(N, i, N, Ni + 1 + i, -1.0);
                    add(N, i, N, Ni, z);
                    add(N, i, N, 2 * Ni + 1, -z);
                    if (actOn)
                        for (std::size_t j = 0; j < Ni; ++j)
                        {
                            const scalar z2j = scalar(pb.ions[j].z) * scalar(pb.ions[j].z);
                            add(N, i, N, Ni + 1 + j, -dgP[i] * 0.5 * z2j * cp[N][j] / 1000.0);
                            add(N, i, N, j,           dgN[i] * 0.5 * z2j * c[N][j]  / 1000.0);
                        }
                }
            }
        }

        // ---- row Ni: electroneutrality at node k ------------------------------
        {
            scalar r = pb.Xd, s = std::abs(pb.Xd);
            for (std::size_t i = 0; i < Ni; ++i)
            {
                r += scalar(pb.ions[i].z) * c[k][i];
                s += std::abs(scalar(pb.ions[i].z)) * c[k][i];
            }
            const scalar f = r / s;
            F[row + Ni] = f;
            if (Jb)
                for (std::size_t j = 0; j < Ni; ++j)
                {
                    const scalar z = scalar(pb.ions[j].z);
                    add(k, Ni, k, j, (z * c[k][j] - f * std::abs(z) * c[k][j]) / s);
                }
        }

        // ---- rows Ni+1..2Ni: the feed partition with the wall, or the copies --
        for (std::size_t i = 0; i < Ni; ++i)
        {
            const PoreIon& ion = pb.ions[i];
            const std::size_t rs = Ni + 1 + i;
            if (k == 0)
            {
                scalar lnFeed = std::log(ion.feedSide);
                if (wallOn) lnFeed += std::log(W.c_m[i]);
                if (actOn)  lnFeed += lgW[i] - lg0[i];
                F[row + rs] = x[L.u(0, i)] - lnFeed + scalar(ion.z) * x[L.ps(0)];
                if (Jb)
                {
                    add(0, rs, 0, i, 1.0);
                    add(0, rs, 0, Ni, scalar(ion.z));
                    if (actOn)
                        for (std::size_t j = 0; j < Ni; ++j)
                        {
                            const scalar z2j = scalar(pb.ions[j].z) * scalar(pb.ions[j].z);
                            add(0, rs, 0, j, dg0[i] * 0.5 * z2j * c[0][j] / 1000.0);
                        }
                    if (wallOn)
                    {
                        //  d ln C_m,i and d ln gamma_wall,i through the wall
                        //  unknowns: the permeate copies, J_v and xi'.
                        for (std::size_t j = 0; j < Ni; ++j)
                        {
                            const scalar dcm_j = W.dc_dcp[j] * cp[0][j];   // dC_m,j/dv_j
                            scalar d = (j == i) ? dcm_j / W.c_m[i] : 0.0;
                            if (actOn)
                                d += dgW[i] * 0.5 * scalar(pb.ions[j].z * pb.ions[j].z)
                                   * dcm_j / 1000.0;
                            add(0, rs, 0, Ni + 1 + j, -d);
                        }
                        scalar dJ  = W.dc_dJ[i]  * C.Jref  / W.c_m[i];
                        scalar dXi = W.dc_dxi[i] * C.xiRef / W.c_m[i];
                        if (actOn)
                        {
                            scalar sJ = 0.0, sX = 0.0;
                            for (std::size_t l = 0; l < Ni; ++l)
                            {
                                const scalar z2l = scalar(pb.ions[l].z * pb.ions[l].z);
                                sJ += 0.5 * z2l * W.dc_dJ[l]  * C.Jref  / 1000.0;
                                sX += 0.5 * z2l * W.dc_dxi[l] * C.xiRef / 1000.0;
                            }
                            for (std::size_t e = 0; e < Ne; ++e)
                            {
                                const scalar ze = scalar(pb.wall.excluded[e].z);
                                sJ += 0.5 * ze * ze * WE.dc_dJ[e]  * C.Jref  / 1000.0;
                                sX += 0.5 * ze * ze * WE.dc_dxi[e] * C.xiRef / 1000.0;
                            }
                            dJ  += dgW[i] * sJ;
                            dXi += dgW[i] * sX;
                        }
                        add(0, rs, 0, 2 * Ni + 2, -dJ);
                        add(0, rs, 0, 2 * Ni + 3, -dXi);
                    }
                }
            }
            else
            {
                F[row + rs] = x[L.v(k, i)] - x[L.v(k - 1, i)];
                if (Jb) { add(k, rs, k, rs, 1.0); add(k, rs, k - 1, rs, -1.0); }
            }
        }

        // ---- row 2Ni+1: the permeate potential held equal FORWARD (so each
        //      copy sits on its own block's diagonal), or zero current ----------
        if (k == N)
        {
            scalar r = 0.0, s = 0.0;
            for (std::size_t i = 0; i < Ni; ++i)
            {
                r += scalar(pb.ions[i].z) * cp[N][i];
                s += std::abs(scalar(pb.ions[i].z)) * cp[N][i];
            }
            const scalar f = r / s;
            F[row + 2 * Ni + 1] = f;
            if (Jb)
                for (std::size_t j = 0; j < Ni; ++j)
                {
                    const scalar z = scalar(pb.ions[j].z);
                    add(N, 2 * Ni + 1, N, Ni + 1 + j,
                        (z * cp[N][j] - f * std::abs(z) * cp[N][j]) / s);
                }
        }
        else
        {
            F[row + 2 * Ni + 1] = x[L.pp(k)] - x[L.pp(k + 1)];
            if (Jb) { add(k, 2 * Ni + 1, k, 2 * Ni + 1, 1.0);
                      add(k, 2 * Ni + 1, k + 1, 2 * Ni + 1, -1.0); }
        }

        // ---- row 2Ni+2: the water flux (9) or the imposed one, or the copy ----
        if (k == 0)
        {
            if (pb.closure.active)
            {
                const scalar sc = pb.closure.Aw * pb.closure.dP;
                scalar sm = 0.0, sp = 0.0;
                for (std::size_t i = 0; i < Ni; ++i) { sm += W.c_m[i]; sp += cp[0][i]; }
                for (std::size_t e = 0; e < Ne; ++e) sm += WE.c_m[e];
                const scalar ART = pb.closure.Aw * pb.closure.RT;
                F[row + 2 * Ni + 2] = (J0 - pb.closure.Aw * pb.closure.dP + ART * (sm - sp)) / sc;
                if (Jb)
                {
                    scalar dJ = C.Jref, dX = 0.0;
                    for (std::size_t i = 0; i < Ni; ++i)
                    {
                        dJ += ART * W.dc_dJ[i] * C.Jref;
                        dX += ART * W.dc_dxi[i] * C.xiRef;
                        add(0, 2 * Ni + 2, 0, Ni + 1 + i,
                            ART * (W.dc_dcp[i] * cp[0][i] - cp[0][i]) / sc);
                    }
                    for (std::size_t e = 0; e < Ne; ++e)
                    {
                        dJ += ART * WE.dc_dJ[e] * C.Jref;
                        dX += ART * WE.dc_dxi[e] * C.xiRef;
                    }
                    add(0, 2 * Ni + 2, 0, 2 * Ni + 2, dJ / sc);
                    add(0, 2 * Ni + 2, 0, 2 * Ni + 3, dX / sc);
                }
            }
            else
            {
                F[row + 2 * Ni + 2] = x[L.jv(0)] - pb.Jv / C.Jref;
                if (Jb) add(0, 2 * Ni + 2, 0, 2 * Ni + 2, 1.0);
            }
        }
        else
        {
            F[row + 2 * Ni + 2] = x[L.jv(k)] - x[L.jv(k - 1)];
            if (Jb) { add(k, 2 * Ni + 2, k, 2 * Ni + 2, 1.0);
                      add(k, 2 * Ni + 2, k - 1, 2 * Ni + 2, -1.0); }
        }

        // ---- row 2Ni+3: electroneutrality AT THE WALL (8), or the idle slot ---
        if (k == 0 && wallOn && pb.wall.coupled)
        {
            scalar r = 0.0, s = 0.0;
            for (std::size_t i = 0; i < Ni; ++i)
            {
                r += scalar(pb.ions[i].z) * W.c_m[i];
                s += std::abs(scalar(pb.ions[i].z)) * W.c_m[i];
            }
            for (std::size_t e = 0; e < Ne; ++e)
            {
                r += scalar(pb.wall.excluded[e].z) * WE.c_m[e];
                s += std::abs(scalar(pb.wall.excluded[e].z)) * WE.c_m[e];
            }
            const scalar f = r / s;
            F[row + 2 * Ni + 3] = f;
            if (Jb)
            {
                scalar dJr = 0.0, dJs = 0.0, dXr = 0.0, dXs = 0.0;
                for (std::size_t i = 0; i < Ni; ++i)
                {
                    const scalar z = scalar(pb.ions[i].z), az = std::abs(z);
                    const scalar dv = W.dc_dcp[i] * cp[0][i];
                    add(0, 2 * Ni + 3, 0, Ni + 1 + i, (z * dv - f * az * dv) / s);
                    dJr += z * W.dc_dJ[i] * C.Jref;   dJs += az * W.dc_dJ[i] * C.Jref;
                    dXr += z * W.dc_dxi[i] * C.xiRef; dXs += az * W.dc_dxi[i] * C.xiRef;
                }
                for (std::size_t e = 0; e < Ne; ++e)
                {
                    const scalar z = scalar(pb.wall.excluded[e].z), az = std::abs(z);
                    dJr += z * WE.dc_dJ[e] * C.Jref;   dJs += az * WE.dc_dJ[e] * C.Jref;
                    dXr += z * WE.dc_dxi[e] * C.xiRef; dXs += az * WE.dc_dxi[e] * C.xiRef;
                }
                add(0, 2 * Ni + 3, 0, 2 * Ni + 2, (dJr - f * dJs) / s);
                add(0, 2 * Ni + 3, 0, 2 * Ni + 3, (dXr - f * dXs) / s);
            }
        }
        else
        {
            F[row + 2 * Ni + 3] = x[L.xs(k)];
            if (Jb) add(k, 2 * Ni + 3, k, 2 * Ni + 3, 1.0);
        }
    }
    return F;
}

void validate(const PoreProblem& pb, const PoreSettings& s)
{
    const std::string ctx = "pore ENP solver: ";
    if (s.intervals < 2)
        throw std::runtime_error(ctx + "`nodes` must give at least 2 intervals");
    if (!(s.grading >= 0.0) || !std::isfinite(s.grading))
        throw std::runtime_error(ctx + "the grid grading must be finite and >= 0");
    if (!s.nodes.empty())
    {
        bool ok = s.nodes.size() == s.intervals + 1
               && s.nodes.front() == 0.0 && s.nodes.back() == 1.0;
        for (std::size_t k = 0; ok && k < s.intervals; ++k)
            ok = std::isfinite(s.nodes[k + 1]) && s.nodes[k + 1] > s.nodes[k];
        if (!ok)
            throw std::runtime_error(ctx + "an explicit grid must hold `intervals"
                " + 1` strictly increasing nodes from 0 to 1");
    }
    if (s.adaptive && (!(s.gridTolerance > 0.0) || !std::isfinite(s.gridTolerance)
                       || s.gridPasses < 1))
        throw std::runtime_error(ctx + "the adaptive grid needs a finite"
            " gridTolerance > 0 and at least one pass");
    bool pos = false, neg = false;
    for (const PoreIon& io : pb.ions)
    {
        if (!(io.P > 0.0) || !(io.Kc > 0.0) || !(io.feedSide > 0.0)
            || !(io.permSide > 0.0) || !std::isfinite(io.feedSide))
            throw std::runtime_error(ctx + "an ion with a non-positive "
                "conductance, convective hindrance or partition was handed to"
                " the pore -- an absent ion is not a term and must be left out"
                " by the caller");
        pos = pos || io.z > 0;
        neg = neg || io.z < 0;
    }
    if (!pos || !neg)
        throw std::runtime_error(ctx + "the pore needs at least one cation and"
            " one anion (electroneutrality has no solution otherwise)");
    const std::size_t Ni = pb.ions.size();
    if (pb.wall.active)
    {
        if (pb.wall.cBulk.size() != Ni || pb.wall.k.size() != Ni
            || pb.wall.D.size() != Ni
            || (pb.wall.solutionDiffusion && pb.wall.B.size() != Ni))
            throw std::logic_error(ctx + "the wall's per-ion vectors do not match the ions");
        for (std::size_t i = 0; i < Ni; ++i)
            if (!(pb.wall.cBulk[i] > 0.0))
                throw std::runtime_error(ctx + "an ion with no bulk concentration"
                    " was handed to the wall -- an absent ion is not a term");
        for (const auto& e : pb.wall.excluded)
            if (!(e.cBulk > 0.0) || !(e.k > 0.0) || !(e.D > 0.0))
                throw std::runtime_error(ctx + "an ion the pore excludes needs a"
                    " positive bulk concentration, film coefficient and D");
    }
    else if (!pb.wall.excluded.empty())
        throw std::logic_error(ctx + "an ion the pore excludes lives only in the"
                                     " film: it needs PoreProblem::wall");
    if (pb.closure.active)
    {
        if (!pb.wall.active)
            throw std::logic_error(ctx + "the water-flux closure reads the wall:"
                                         " it needs PoreProblem::wall");
        if (!(pb.closure.Aw > 0.0) || !(pb.closure.dP > 0.0) || !(pb.closure.RT > 0.0))
            throw std::runtime_error(ctx + "the water-flux closure needs A_w > 0,"
                                           " dP > 0 and RT > 0");
    }
    else if (!(pb.Jv >= 0.0) || !std::isfinite(pb.Jv))
        throw std::runtime_error(ctx + "the water flux must be finite and >= 0");
    if (pb.activity.active && !pb.wall.active)
        throw std::logic_error(ctx + "the face activities read the wall: they"
                                     " need PoreProblem::wall");
}

PoreSolution solveFrom(const PoreProblem& pb, const PoreSettings& s, sVector x0)
{
    const Context C = contextOf(pb, s);
    const Layout& L = C.L;
    solver::NDOptions o;
    o.tolerance          = s.tolerance;
    o.maxIter            = s.maxIter;
    o.blockTri.nBlocks   = L.N + 1;
    o.blockTri.blockSize = L.nv;
    o.blockTri.audit     = s.audit;
    if (!s.finiteDifferenceJacobian)
        o.blockTri.jacobian = [&](const sVector& x, solver::BlockBands& J)
        { evaluate(pb, C, x, &J); };
    auto F = [&](const sVector& x) { return evaluate(pb, C, x, nullptr); };
    const solver::NDResult r = solver::newtonND(F, std::move(x0), o);

    PoreSolution out;
    out.converged     = r.converged;
    out.iterations    = r.iterations;
    out.iterationsTotal = r.iterations;
    out.residual      = r.residual;
    out.offBandMax    = std::isfinite(r.offBandMax) ? r.offBandMax : -1.0;
    out.jacobianMismatch = std::isfinite(r.analyticMismatch) ? r.analyticMismatch : -1.0;
    out.jacobianEvals = r.jacobianEvals;
    out.stopReason    = r.stopReason;
    out.intervals     = L.N;
    out.grid          = C.grid;
    out.x             = r.x;

    const std::size_t Ni = L.Ni, N = L.N;
    out.c.assign(N + 1, std::vector<scalar>(Ni));
    out.psi.assign(N + 1, 0.0);
    out.cPerm.assign(Ni, 0.0);
    for (std::size_t k = 0; k <= N; ++k)
    {
        for (std::size_t i = 0; i < Ni; ++i) out.c[k][i] = std::exp(r.x[L.u(k, i)]);
        out.psi[k] = r.x[L.ps(k)];
    }
    for (std::size_t i = 0; i < Ni; ++i) out.cPerm[i] = std::exp(r.x[L.v(N, i)]);
    out.psiPerm = r.x[L.pp(N)];
    out.Jv      = C.Jref * r.x[L.jv(0)];
    if (pb.wall.active)
    {
        out.xiPrime = pb.wall.coupled ? C.xiRef * r.x[L.xs(0)] : 0.0;
        std::vector<scalar> cp0(Ni);
        std::vector<int> z(Ni);
        for (std::size_t i = 0; i < Ni; ++i)
        { cp0[i] = std::exp(r.x[L.v(0, i)]); z[i] = pb.ions[i].z; }
        const WallAtField W = wallAtField(pb.wall.suction, pb.wall.coupled, out.Jv,
            pb.wall.k, pb.wall.D, z, pb.wall.cBulk, cp0, out.xiPrime,
            pb.wall.solutionDiffusion ? &pb.wall.B : nullptr);
        out.cWall = W.c_m;
        if (!pb.wall.excluded.empty())
        {
            const WallAtField WE = excludedWall(pb, out.Jv, out.xiPrime);
            out.cWallExcluded = WE.c_m;
        }
        if (pb.wall.coupled && W.ok)
        {
            scalar q = 0.0, qa = 0.0;
            for (std::size_t i = 0; i < Ni; ++i)
            { q += z[i] * W.c_m[i]; qa += std::abs(scalar(z[i])) * W.c_m[i]; }
            for (std::size_t e = 0; e < out.cWallExcluded.size(); ++e)
            {
                const scalar ze = scalar(pb.wall.excluded[e].z);
                q += ze * out.cWallExcluded[e]; qa += std::abs(ze) * out.cWallExcluded[e];
            }
            out.wallChargeMax = qa > 0.0 ? std::abs(q) / qa : 0.0;
        }
    }

    //  The activity ratio each face's partition USED at the answer
    //  (bulkOverPoreDavies), read from the residual's own home -- the
    //  caller publishes it beside the steric, Born and Donnan factors.
    if (pb.activity.active && pb.wall.active)
    {
        const FaceActivities FA = faceActivities(pb, out.cWall.data(), out.c[0].data(),
            out.c[N].data(), out.cPerm.data(),
            out.cWallExcluded.empty() ? nullptr : out.cWallExcluded.data());
        out.lnActivityFeed.resize(Ni);
        out.lnActivityPerm.resize(Ni);
        for (std::size_t i = 0; i < Ni; ++i)
        {
            out.lnActivityFeed[i] = FA.lgW[i] - FA.lg0[i];
            out.lnActivityPerm[i] = FA.lgP[i] - FA.lgN[i];
        }
    }

    //  Measured on the answer: every interval's flux against J_v c_perm,i
    //  -- relative to the two fitted terms it nets (what the Newton drove
    //  to round-off) AND relative to the net flux itself -- the STIFFNESS
    //  ratio, the electromigration flux against the net flux, the current
    //  and the electroneutrality.
    scalar fluxMax = 0.0, fluxRel = 0.0, stiff = 0.0, enMax = 0.0;
    scalar zj = 0.0, azj = 0.0;
    for (std::size_t i = 0; i < Ni; ++i)
    {
        const scalar j = out.Jv * out.cPerm[i];
        zj  += scalar(pb.ions[i].z) * j;
        azj += std::abs(scalar(pb.ions[i].z)) * j;
        for (std::size_t k = 0; k < N; ++k)
        {
            const scalar h = C.h[k];
            const FluxTerms t = fittedFlux(pb.ions[i], out.Jv, h, out.c[k][i],
                                           out.c[k+1][i], out.psi[k],
                                           out.psi[k+1]);
            const scalar terms = std::abs(t.t1) + std::abs(t.t2);
            const scalar d = std::abs(t.t1 - t.t2 - j);
            fluxMax = std::max(fluxMax, d / (terms + std::abs(j)));
            if (j > 0.0)
            {
                fluxRel = std::max(fluxRel, d / j);
                //  the electromigration flux P |z| c dpsi/dxi on the
                //  interval, against the net flux: grid-independent
                const scalar mig = pb.ions[i].P * std::abs(scalar(pb.ions[i].z))
                                 * 0.5 * (out.c[k][i] + out.c[k+1][i])
                                 * std::abs(out.psi[k+1] - out.psi[k]) / h;
                stiff = std::max(stiff, mig / j);
            }
        }
    }
    for (std::size_t k = 0; k <= N; ++k)
    {
        scalar sum = pb.Xd, a = std::abs(pb.Xd);
        for (std::size_t i = 0; i < Ni; ++i)
        {
            sum += scalar(pb.ions[i].z) * out.c[k][i];
            a   += std::abs(scalar(pb.ions[i].z)) * out.c[k][i];
        }
        enMax = std::max(enMax, std::abs(sum) / a);
    }
    out.fluxConstancyMax  = fluxMax;
    out.fluxRelativeMax   = fluxRel;
    out.stiffnessRatio    = stiff;
    out.currentMax        = azj > 0.0 ? std::abs(zj) / azj : 0.0;
    out.electroneutralMax = enMax;
    return out;
}

// The potential that makes the pore electroneutral against reservoir values
// a_i = e^{la_i}: sum_i z_i a_i e^{-z_i psi} + X_d = 0.  The left side falls
// monotonically in psi (its derivative is -sum z_i^2 a_i e^{-z_i psi}), so a
// bisection on a wide bracket cannot miss the root when both signs of
// charge are present.  Evaluated in logs so no term overflows.
scalar localDonnan(const PoreProblem& pb, const std::vector<scalar>& la)
{
    auto f = [&](scalar psi)
    {
        scalar s = pb.Xd;
        for (std::size_t i = 0; i < la.size(); ++i)
        {
            const scalar w = la[i] - scalar(pb.ions[i].z) * psi;
            s += scalar(pb.ions[i].z) * std::exp(std::min(w, 700.0));
        }
        return s;
    };
    scalar lo = -150.0, hi = 150.0;
    for (int it = 0; it < 200; ++it)
    {
        const scalar mid = 0.5 * (lo + hi);
        if (f(mid) > 0.0) lo = mid; else hi = mid;
        if (hi - lo < 1.0e-13) break;
    }
    return 0.5 * (lo + hi);
}

// ---- the seed ---------------------------------------------------------------
sVector seedVector(const PoreProblem& pb, const Context& C,
                   const std::vector<scalar>& cPerm, scalar Jseed)
{
    //  THE SEED: LOCAL DONNAN EQUILIBRIUM.  Each ion's "reservoir" value
    //  a_i runs log-linear (in node index) from the feed face (feedSide_i,
    //  times the wall concentration at the seed when the wall is folded in)
    //  to the permeate face (permSide_i c_perm,i), and at every node the
    //  potential is the one that makes the pore ELECTRONEUTRAL against those
    //  reservoirs:
    //      sum_i z_i a_i(xi) e^{-z_i psi} + X_d = 0,
    //  monotone in psi, so a bisection finds it.  The seed therefore
    //  satisfies both partitions and electroneutrality at every node
    //  EXACTLY, and leaves only the flux rows and zero current to the
    //  Newton.  It is a STARTING POINT, and the answer is owed to the
    //  equations: a seed that leaves electroneutrality to the Newton
    //  (log-linear concentrations, a flat potential) was MEASURED to send
    //  the Newton into overflow on a strongly charged pore with a divalent
    //  co-ion, which is why this one is built.
    const Layout& L = C.L;
    sVector x(L.nv * (L.N + 1), 0.0);
    std::vector<scalar> la0(L.Ni), laN(L.Ni), cps(L.Ni);
    for (std::size_t i = 0; i < L.Ni; ++i)
    {
        const PoreIon& io = pb.ions[i];
        cps[i] = cPerm[i] > 0.0 ? cPerm[i] : 1.0e-6 * io.feedSide / io.permSide;
    }
    std::vector<scalar> cm(L.Ni, 1.0);
    if (pb.wall.active)
    {
        std::vector<int> z(L.Ni);
        for (std::size_t i = 0; i < L.Ni; ++i) z[i] = pb.ions[i].z;
        const WallAtField W = wallAtField(pb.wall.suction, pb.wall.coupled, Jseed,
            pb.wall.k, pb.wall.D, z, pb.wall.cBulk, cps, 0.0,
            pb.wall.solutionDiffusion ? &pb.wall.B : nullptr);
        cm = W.ok ? W.c_m : pb.wall.cBulk;
    }
    for (std::size_t i = 0; i < L.Ni; ++i)
    {
        const PoreIon& io = pb.ions[i];
        la0[i] = std::log(io.feedSide * cm[i]);
        laN[i] = std::log(io.permSide * cps[i]);
        for (std::size_t k = 0; k <= L.N; ++k) x[L.v(k, i)] = std::log(cps[i]);
    }
    std::vector<scalar> la(L.Ni);
    for (std::size_t k = 0; k <= L.N; ++k)
    {
        const scalar t = scalar(k) / scalar(L.N);
        for (std::size_t i = 0; i < L.Ni; ++i) la[i] = (1.0 - t) * la0[i] + t * laN[i];
        const scalar psi = localDonnan(pb, la);
        x[L.ps(k)] = psi;
        x[L.pp(k)] = 0.0;      // psi(1) - psi_perm is the local Donnan at N
        x[L.jv(k)] = Jseed / C.Jref;
        x[L.xs(k)] = 0.0;
        for (std::size_t i = 0; i < L.Ni; ++i)
            x[L.u(k, i)] = la[i] - scalar(pb.ions[i].z) * psi;
    }
    //  the last node's jump is its own Donnan potential: psi_perm = 0 there
    //  means psi(1) - psi_perm = psi(1), the local equilibrium -- consistent
    //  with (6) by construction.
    return x;
}

//  A state with its water-flux copies re-expressed in THIS problem's J_ref
//  (a warm start from another station, or from the previous step of the
//  continuation, carries its own reference).
sVector withFlux(sVector x, const Context& C, scalar Jv)
{
    for (std::size_t k = 0; k <= C.L.N; ++k) x[C.L.jv(k)] = Jv / C.Jref;
    return x;
}

scalar seedFlux(const PoreProblem& pb, scalar Jv)
{
    if (Jv >= 0.0) return Jv;
    return pb.closure.active ? 0.5 * pb.closure.Aw * pb.closure.dP : pb.Jv;
}

// ---- continuation in the drive ---------------------------------------------
//  When the Newton fails from the seed it was handed, the station is solved
//  again from the one state that is EXACT without any Newton: with no flux
//  nothing crosses, the pore is in Donnan equilibrium with both baths and
//  the permeate is the feed-face reservoir over the permeate partition,
//  c_perm,i = feedSide_i C_b,i / permSide_i, which is what the local-Donnan
//  seed builds when it is handed that permeate.  From a tiny drive (a
//  Peclet number of 1e-4 on every ion) the DRIVE -- the imposed J_v, or dP
//  under the closure -- is raised geometrically to the target, each solve
//  warm-started from the last; a failed step shortens the ratio.  A solver
//  aid, so it is COUNTED (PoreSolution::continuationSteps) for the caller
//  to announce.
PoreSolution continuation(const PoreProblem& pb, const PoreSettings& s,
                          const std::string& why)
{
    PoreSettings sc = s;
    sc.audit = false;
    const Context C = contextOf(pb, s);
    const std::size_t Ni = C.L.Ni;
    scalar Jstart = std::numeric_limits<scalar>::max();
    std::vector<scalar> cEq(Ni);
    for (std::size_t i = 0; i < Ni; ++i)
    {
        Jstart = std::min(Jstart, 1.0e-4 * pb.ions[i].P / pb.ions[i].Kc);
        cEq[i] = pb.ions[i].feedSide * (pb.wall.active ? pb.wall.cBulk[i] : 1.0)
               / pb.ions[i].permSide;
    }
    const scalar drive = pb.closure.active ? pb.closure.Aw * pb.closure.dP : pb.Jv;
    scalar t = (drive > 0.0) ? std::min(1.0, Jstart / drive) : 1.0;
    auto atT = [&](scalar tt)
    {
        PoreProblem q = pb;
        if (q.closure.active) q.closure.dP = tt * pb.closure.dP;
        else                  q.Jv         = tt * pb.Jv;
        return q;
    };
    PoreSolution r;
    int iterSum = 0;
    {
        AdvisoryFrame trial("pore ENP continuation", true);
        const PoreProblem q = atT(t);
        r = solveFrom(q, sc, seedVector(q, contextOf(q, sc), cEq, t * drive));
        iterSum += r.iterations;
    }
    int steps = 1;
    scalar ratio = 4.0;
    while (r.converged && t < 1.0 && steps < 400)
    {
        const scalar tn = std::min(1.0, t * ratio);
        PoreSolution rn;
        {
            AdvisoryFrame trial("pore ENP continuation", true);
            const PoreProblem q = atT(tn);
            rn = solveFrom(q, sc, withFlux(r.x, contextOf(q, sc), r.Jv));
            iterSum += rn.iterations;
        }
        ++steps;
        if (rn.converged)
        {
            t = tn; r = std::move(rn);
            ratio = std::min(ratio * 2.0, 100.0);
        }
        else
        {
            ratio = std::sqrt(ratio);
            if (ratio < 1.0 + 1.0e-3) break;
        }
    }
    if (!(r.converged && t >= 1.0))
    {
        r.converged  = false;
        r.stopReason = std::string("continuation in the ")
                     + (pb.closure.active ? "applied pressure" : "imposed J_v")
                     + " stalled at " + std::to_string(t) + " of the target"
                       " after " + std::to_string(steps) + " solves (the"
                       " direct Newton had stopped: " + why + ")";
    }
    r.continuationSteps = steps;
    r.directFailure     = why;
    r.iterationsTotal   = iterSum;
    return r;
}

PoreSolution finish(const PoreProblem& pb, const PoreSettings& s, PoreSolution r)
{
    if (r.converged) return r;
    PoreSolution c = continuation(pb, s, r.stopReason.empty()
                         ? std::string("no convergence in maxIter") : r.stopReason);
    c.offBandMax       = r.offBandMax;       // the audit was taken on the first try
    c.jacobianMismatch = r.jacobianMismatch;
    c.jacobianEvals   += r.jacobianEvals;
    c.iterationsTotal += r.iterations;
    return c;
}

// ---- THE ADAPTIVE GRID (C144) ------------------------------------------------
//  THE MONITOR (C144, measured in docs/design/a-stiff-pore-solved-at-once.md
//  section 12).  The Scharfetter-Gummel flux is EXACT on a cell where the
//  potential is linear, so what it leaves out is the potential's CURVATURE:
//  its truncation error is O(h_k^2 |psi''|) on cell k.  The error of a
//  published permeate is the sum of those over the cells, so the grid that
//  minimises sum h_k^2 D_k for a fixed node count has h_k ~ D_k^{-1/3} --
//  the monitor M_k = D_k^{1/3}, equidistributed.  A FLOOR equal to the mean
//  of D^{1/3} over the pore (Beckett & Mackenzie, Appl. Numer. Math. 35
//  (2000) 87) keeps at least half the nodes uniformly spread, where psi''
//  is not the only source of error (the concentration's own curvature
//  under convection), and two passes of a (1/4, 1/2, 1/4) filter keep
//  neighbouring cells within a bounded ratio.  Measured and REJECTED, with
//  their numbers in the record: the arc length of (ln c, psi) -- the profile
//  is steep where it is nearly linear, so it moved nodes to where the
//  scheme is already exact and was WORSE than uniform on the interior front
//  -- and the more aggressive D^{1/2} with a smaller floor, which gained
//  1.7x there and lost 2.4x on the ambipolar limit.
std::vector<scalar> monitorOf(const std::vector<scalar>& xi,
                              const std::vector<scalar>& psi)
{
    const std::size_t N = xi.size() - 1;
    //  |psi''| at the interior nodes (the three-point form on an uneven
    //  grid), copied to the two faces, averaged onto the cells.
    std::vector<scalar> d2(N + 1, 0.0);
    for (std::size_t j = 1; j < N; ++j)
    {
        const scalar hl = xi[j] - xi[j - 1], hr = xi[j + 1] - xi[j];
        d2[j] = std::abs(2.0 * ((psi[j + 1] - psi[j]) / hr
                              - (psi[j] - psi[j - 1]) / hl) / (hl + hr));
    }
    d2[0] = d2[1];
    d2[N] = d2[N - 1];
    std::vector<scalar> M(N);
    scalar mean = 0.0;
    for (std::size_t k = 0; k < N; ++k)
    {
        M[k] = std::cbrt(0.5 * (d2[k] + d2[k + 1]));
        mean += M[k] * (xi[k + 1] - xi[k]);
    }
    //  A linear potential (no curvature at all) has nothing to adapt to:
    //  the floor alone is left, and the grid stays where it is.
    const scalar floor = mean > 0.0 ? mean : 1.0;
    for (std::size_t k = 0; k < N; ++k) M[k] += floor;
    for (int p = 0; p < 2; ++p)
    {
        std::vector<scalar> t(M);
        for (std::size_t k = 0; k < N; ++k)
        {
            const scalar l = M[k > 0 ? k - 1 : 0], r = M[k + 1 < N ? k + 1 : N - 1];
            t[k] = 0.25 * l + 0.5 * M[k] + 0.25 * r;
        }
        M.swap(t);
    }
    return M;
}

//  A state carried from one grid to another of the SAME node count: the
//  profile unknowns (ln c_i and psi) linearly interpolated in xi; the copies
//  of the global unknowns (permeate, permeate potential, J_v, the wall
//  field) kept node for node -- they are equal at every node of a converged
//  state, and the wall field's slot is read at node 0 only.  The
//  interpolated profile is not electroneutral to round-off; the Newton
//  restores it, from a state a cell's interpolation error away.
sVector transferState(const sVector& x, const std::vector<scalar>& from,
                      const std::vector<scalar>& to, std::size_t Ni)
{
    const std::size_t nv = 2 * Ni + 4, N = from.size() - 1;
    sVector y = x;
    if (from == to) return y;
    std::size_t m = 0;
    for (std::size_t j = 1; j < N; ++j)
    {
        const scalar t = to[j];
        while (m + 1 < N && from[m + 1] <= t) ++m;
        const scalar w = (t - from[m]) / (from[m + 1] - from[m]);
        for (std::size_t q = 0; q <= Ni; ++q)
            y[j * nv + q] = (1.0 - w) * x[m * nv + q] + w * x[(m + 1) * nv + q];
    }
    return y;
}

//  The loop: from a converged answer on its own grid, the equidistributing
//  grid is computed; when no node would move by more than the tolerance the
//  answer is SETTLED, otherwise the state is carried onto the new grid and
//  re-solved (a warm Newton, no continuation: a re-solve that fails is
//  abandoned and the last converged answer stands, said in gridFailure).
PoreSolution adapt(const PoreProblem& pb, const PoreSettings& s, PoreSolution r)
{
    if (!s.adaptive || !r.converged) return r;
    int passes = 0, iters = 0;
    long jevals = 0;
    for (;;)
    {
        const std::vector<scalar> g = equidistributedGrid(r);
        r.gridMove    = gridMovement(r.grid, g);
        //  Decided on EVERY pass: a re-solve's answer arrives with its own
        //  (default) flag, and a loop that stops on its pass count must not
        //  inherit a "settled" it never measured.
        r.gridSettled = r.gridMove <= s.gridTolerance;
        if (r.gridSettled) break;
        if (passes >= s.gridPasses) break;
        PoreSettings sg = s;
        sg.nodes = g;
        sg.audit = false;
        PoreSolution rn;
        {
            AdvisoryFrame trial("pore ENP adaptive grid", true);
            rn = solveFrom(pb, sg, transferState(r.x, r.grid, g, pb.ions.size()));
        }
        ++passes;
        iters  += rn.iterations;
        jevals += rn.jacobianEvals;
        if (!rn.converged)
        {
            r.gridFailure = "the re-solve on the moved grid stopped ("
                          + rn.stopReason + ")";
            break;
        }
        rn.offBandMax        = r.offBandMax;
        rn.jacobianMismatch  = r.jacobianMismatch;
        rn.continuationSteps = r.continuationSteps;
        rn.directFailure     = r.directFailure;
        rn.iterationsTotal   = r.iterationsTotal;
        rn.jacobianEvals     = r.jacobianEvals;
        rn.gridMove          = r.gridMove;
        r = std::move(rn);
    }
    r.gridPasses       = passes;
    r.iterationsTotal += iters;
    r.jacobianEvals   += jevals;
    return r;
}

//  The settings a solve runs on: the adaptive loop starts from the grid it
//  is handed (a warm start's own grid, so a module carries its grid station
//  to station) or, cold, from the declared one.
PoreSettings onGrid(const PoreSettings& s, const std::vector<scalar>& g)
{
    PoreSettings t = s;
    if (s.adaptive && g.size() == s.intervals + 1) t.nodes = g;
    return t;
}

} // anonymous namespace

// ---- the monitor and its equidistribution (THE ADAPTIVE GRID) ---------------
std::vector<scalar> equidistributedGrid(const PoreSolution& r)
{
    const std::vector<scalar>& xi = r.grid;
    const std::size_t N = xi.size() - 1;
    std::vector<scalar> h(N);
    for (std::size_t k = 0; k < N; ++k) h[k] = xi[k + 1] - xi[k];
    const std::vector<scalar> M = monitorOf(xi, r.psi);
    //  The cumulative integral of M, and its inverse at equal shares.
    std::vector<scalar> W(N + 1, 0.0);
    for (std::size_t k = 0; k < N; ++k) W[k + 1] = W[k] + M[k] * h[k];
    std::vector<scalar> g(N + 1);
    g.front() = 0.0; g.back() = 1.0;
    std::size_t m = 0;
    for (std::size_t j = 1; j < N; ++j)
    {
        const scalar t = W[N] * scalar(j) / scalar(N);
        while (m + 1 < N && W[m + 1] <= t) ++m;
        g[j] = xi[m] + (t - W[m]) / M[m];
        g[j] = std::min(std::max(g[j], xi[m]), xi[m + 1]);
    }
    return g;
}

scalar gridMovement(const std::vector<scalar>& from, const std::vector<scalar>& to)
{
    //  max_j |xi_new,j - xi_old,j| over the mean of the two old cells that
    //  meet at node j: how far a node moves in units of its own cell.
    scalar mv = 0.0;
    for (std::size_t j = 1; j + 1 < from.size(); ++j)
    {
        const scalar cell = 0.5 * (from[j + 1] - from[j - 1]);
        mv = std::max(mv, std::abs(to[j] - from[j]) / cell);
    }
    return mv;
}

PoreSolution solve(const PoreProblem& pb, const PoreSettings& s,
                   const PoreSeed& seed)
{
    validate(pb, s);
    const Context C = contextOf(pb, s);
    if (seed.cPerm.size() != C.L.Ni)
        throw std::runtime_error("pore ENP solver: the seed carries "
            + std::to_string(seed.cPerm.size()) + " permeate concentrations"
            " for " + std::to_string(C.L.Ni) + " ions");
    PoreSolution r;
    {
        AdvisoryFrame trial("pore ENP from the seed", true);
        r = solveFrom(pb, s, seedVector(pb, C, seed.cPerm, seedFlux(pb, seed.Jv)));
    }
    return adapt(pb, s, finish(pb, s, std::move(r)));
}

PoreSolution solve(const PoreProblem& pb, const PoreSettings& s,
                   const PoreSolution& warm)
{
    validate(pb, s);
    if (warm.x.size() != (2 * pb.ions.size() + 4) * (s.intervals + 1)
        || warm.grid.size() != s.intervals + 1)
        throw std::runtime_error("pore ENP solver: a warm start from a"
            " solution with a different node count or ion list");
    //  Adaptive: the warm answer's own grid is the start (carried station
    //  to station); fixed: the declared grid, the warm state carried onto it
    //  (the identity when the two grids are the same).
    const PoreSettings sw = onGrid(s, warm.grid);
    const Context C = contextOf(pb, sw);
    //  The warm state carries its own J_v / J_ref; the reference of THIS
    //  problem may differ (the next station's dP): rescale the copies.
    PoreSolution r;
    {
        AdvisoryFrame trial("pore ENP warm start", true);
        r = solveFrom(pb, sw, withFlux(transferState(warm.x, warm.grid, C.grid,
                                                     pb.ions.size()), C, warm.Jv));
    }
    return adapt(pb, sw, finish(pb, sw, std::move(r)));
}

PoreSolution audit(const PoreProblem& pb, const PoreSettings& s,
                   const PoreSeed& seed)
{
    validate(pb, s);
    const Context C = contextOf(pb, s);
    PoreSettings sa = s;
    sa.audit    = true;
    sa.maxIter  = 1;
    sa.finiteDifferenceJacobian = false;
    AdvisoryFrame trial("pore ENP audit", true);
    return solveFrom(pb, sa, seedVector(pb, C, seed.cPerm, seedFlux(pb, seed.Jv)));
}

// ---- the test surface ---------------------------------------------------------
std::size_t blockSize(const PoreProblem& pb) { return 2 * pb.ions.size() + 4; }

sVector residualAt(const PoreProblem& pb, const PoreSettings& s, const sVector& x)
{
    return evaluate(pb, contextOf(pb, s), x, nullptr);
}

void jacobianAt(const PoreProblem& pb, const PoreSettings& s, const sVector& x,
                solver::BlockBands& J)
{
    const Context C = contextOf(pb, s);
    J = solver::BlockBands(C.L.N + 1, C.L.nv);
    evaluate(pb, C, x, &J);
}

sVector seedOf(const PoreProblem& pb, const PoreSettings& s, const PoreSeed& seed)
{
    validate(pb, s);
    const Context C = contextOf(pb, s);
    return seedVector(pb, C, seed.cPerm, seedFlux(pb, seed.Jv));
}

} // namespace pore
} // namespace membrane
} // namespace Choupo
