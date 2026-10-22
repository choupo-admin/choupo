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
  PoreNernstPlanck.H; this file is the residual, the seed and the Newton
  call, in that order.
\*---------------------------------------------------------------------------*/

#include "PoreNernstPlanck.H"

#include "core/Advisory.H"
#include "core/InfeasibleTrial.H"
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

namespace {

// ---- the unknown layout, one block per node (see the header) ---------------
struct Layout
{
    std::size_t Ni = 0, nv = 0, N = 0;     // ions, block size, intervals
    std::size_t u (std::size_t k, std::size_t i) const { return k * nv + i; }
    std::size_t ps(std::size_t k)                const { return k * nv + Ni; }
    std::size_t v (std::size_t k, std::size_t i) const { return k * nv + Ni + 1 + i; }
    std::size_t pp(std::size_t k)                const { return k * nv + 2 * Ni + 1; }
};

Layout layoutOf(const PoreProblem& pb, std::size_t N)
{
    Layout L;
    L.Ni = pb.ions.size();
    L.nv = 2 * L.Ni + 2;
    L.N  = N;
    return L;
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

sVector residual(const PoreProblem& pb, const Layout& L, const sVector& x)
{
    const std::size_t Ni = L.Ni, N = L.N;
    const scalar h  = 1.0 / scalar(N);
    const scalar Jv = pb.Jv;

    std::vector<std::vector<scalar>> c(N + 1, std::vector<scalar>(Ni));
    for (std::size_t k = 0; k <= N; ++k)
        for (std::size_t i = 0; i < Ni; ++i)
            c[k][i] = expChecked(x[L.u(k, i)], "a pore concentration");
    std::vector<scalar> cp(Ni);
    for (std::size_t i = 0; i < Ni; ++i)
        cp[i] = expChecked(x[L.v(N, i)], "a permeate concentration");

    sVector F(x.size(), 0.0);
    for (std::size_t k = 0; k <= N; ++k)
    {
        const std::size_t row = k * L.nv;
        // rows 0..Ni-1: the flux of [k, k+1], or the permeate partition
        for (std::size_t i = 0; i < Ni; ++i)
        {
            const PoreIon& ion = pb.ions[i];
            if (k < N)
            {
                const FluxTerms t = fittedFlux(ion, Jv, h, c[k][i], c[k+1][i],
                                               x[L.ps(k)], x[L.ps(k+1)]);
                const scalar j = Jv * expChecked(x[L.v(k, i)],
                                                 "a permeate concentration");
                F[row + i] = (t.t1 - t.t2 - j)
                           / (std::abs(t.t1) + std::abs(t.t2) + std::abs(j));
            }
            else
            {
                F[row + i] = x[L.u(N, i)] - std::log(ion.permSide)
                           - x[L.v(N, i)]
                           + scalar(ion.z) * (x[L.ps(N)] - x[L.pp(N)]);
            }
        }
        // row Ni: electroneutrality at node k
        {
            scalar s = pb.Xd, a = std::abs(pb.Xd);
            for (std::size_t i = 0; i < Ni; ++i)
            {
                s += scalar(pb.ions[i].z) * c[k][i];
                a += std::abs(scalar(pb.ions[i].z)) * c[k][i];
            }
            F[row + Ni] = s / a;
        }
        // rows Ni+1..2Ni: the feed partition, or the copies held equal
        for (std::size_t i = 0; i < Ni; ++i)
        {
            const PoreIon& ion = pb.ions[i];
            F[row + Ni + 1 + i] = (k == 0)
                ? x[L.u(0, i)] - std::log(ion.feedSide)
                  + scalar(ion.z) * x[L.ps(0)]
                : x[L.v(k, i)] - x[L.v(k - 1, i)];
        }
        // row 2Ni+1: the permeate potential held equal FORWARD (so each
        // copy sits on its own block's diagonal), or, at the last node, zero
        // current
        if (k == N)
        {
            scalar s = 0.0, a = 0.0;
            for (std::size_t i = 0; i < Ni; ++i)
            {
                s += scalar(pb.ions[i].z) * cp[i];
                a += std::abs(scalar(pb.ions[i].z)) * cp[i];
            }
            F[row + 2 * Ni + 1] = s / a;
        }
        else
            F[row + 2 * Ni + 1] = x[L.pp(k)] - x[L.pp(k + 1)];
    }
    return F;
}

void validate(const PoreProblem& pb, const PoreSettings& s)
{
    const std::string ctx = "pore ENP solver: ";
    if (s.intervals < 2)
        throw std::runtime_error(ctx + "`nodes` must give at least 2 intervals");
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
    if (!(pb.Jv >= 0.0) || !std::isfinite(pb.Jv))
        throw std::runtime_error(ctx + "the water flux must be finite and >= 0");
}

PoreSolution solveFrom(const PoreProblem& pb, const PoreSettings& s,
                       sVector x0)
{
    const Layout L = layoutOf(pb, s.intervals);
    solver::NDOptions o;
    o.tolerance          = s.tolerance;
    o.maxIter            = s.maxIter;
    o.blockTri.nBlocks   = L.N + 1;
    o.blockTri.blockSize = L.nv;
    o.blockTri.audit     = s.audit;
    auto F = [&](const sVector& x) { return residual(pb, L, x); };
    const solver::NDResult r = solver::newtonND(F, std::move(x0), o);

    PoreSolution out;
    out.converged     = r.converged;
    out.iterations    = r.iterations;
    out.residual      = r.residual;
    out.offBandMax    = std::isfinite(r.offBandMax) ? r.offBandMax : -1.0;
    out.jacobianEvals = r.jacobianEvals;
    out.stopReason    = r.stopReason;
    out.intervals     = L.N;
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

    //  Measured on the answer: every interval's flux against J_v c_perm,i
    //  -- relative to the two fitted terms it nets (what the Newton drove
    //  to round-off) AND relative to the net flux itself -- the STIFFNESS
    //  ratio, the electromigration flux against the net flux, the current
    //  and the electroneutrality.
    const scalar h = 1.0 / scalar(N);
    scalar fluxMax = 0.0, fluxRel = 0.0, stiff = 0.0, enMax = 0.0;
    scalar zj = 0.0, azj = 0.0;
    for (std::size_t i = 0; i < Ni; ++i)
    {
        const scalar j = pb.Jv * out.cPerm[i];
        zj  += scalar(pb.ions[i].z) * j;
        azj += std::abs(scalar(pb.ions[i].z)) * j;
        for (std::size_t k = 0; k < N; ++k)
        {
            const FluxTerms t = fittedFlux(pb.ions[i], pb.Jv, h, out.c[k][i],
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
sVector seedVector(const PoreProblem& pb, const Layout& L,
                   const std::vector<scalar>& cPerm)
{
    //  THE SEED: LOCAL DONNAN EQUILIBRIUM.  Each ion's "reservoir" value
    //  a_i runs log-linear from the feed face (feedSide_i) to the permeate
    //  face (permSide_i c_perm,i), and at every node the potential is the
    //  one that makes the pore ELECTRONEUTRAL against those reservoirs:
    //      sum_i z_i a_i(xi) e^{-z_i psi} + X_d = 0,
    //  monotone in psi, so a bisection finds it.  The seed therefore
    //  satisfies both partitions and electroneutrality at every node
    //  EXACTLY, and leaves only the flux rows and zero current to the
    //  Newton.  It is a STARTING POINT, and the answer is owed to the
    //  equations: a seed that leaves electroneutrality to the Newton
    //  (log-linear concentrations, a flat potential) was MEASURED to send
    //  the Newton into overflow on a strongly charged pore with a divalent
    //  co-ion, which is why this one is built.
    sVector x(L.nv * (L.N + 1), 0.0);
    std::vector<scalar> la0(L.Ni), laN(L.Ni);
    for (std::size_t i = 0; i < L.Ni; ++i)
    {
        const PoreIon& io = pb.ions[i];
        const scalar cp = cPerm[i] > 0.0 ? cPerm[i]
                                              : 1.0e-6 * io.feedSide;
        la0[i] = std::log(io.feedSide);
        laN[i] = std::log(io.permSide * cp);
        for (std::size_t k = 0; k <= L.N; ++k) x[L.v(k, i)] = std::log(cp);
    }
    std::vector<scalar> la(L.Ni);
    for (std::size_t k = 0; k <= L.N; ++k)
    {
        const scalar t = scalar(k) / scalar(L.N);
        for (std::size_t i = 0; i < L.Ni; ++i) la[i] = (1.0 - t) * la0[i] + t * laN[i];
        const scalar psi = localDonnan(pb, la);
        x[L.ps(k)] = psi;
        x[L.pp(k)] = 0.0;      // psi(1) - psi_perm is the local Donnan at N
        for (std::size_t i = 0; i < L.Ni; ++i)
            x[L.u(k, i)] = la[i] - scalar(pb.ions[i].z) * psi;
    }
    //  the last node's jump is its own Donnan potential: psi_perm = 0 there
    //  means psi(1) - psi_perm = psi(1), the local equilibrium -- consistent
    //  with (6) by construction.
    return x;
}

// ---- continuation in the water flux -----------------------------------------
//  When the Newton fails from the seed it was handed, the pore is solved
//  again from the one state that is EXACT without any Newton: at J_v = 0
//  no flux crosses, the pore is in Donnan equilibrium with both baths and
//  the permeate equals the feed, which is what the local-Donnan seed
//  builds when it is handed c_perm,i = feedSide_i/permSide_i.  From a tiny
//  J_v (a Peclet number of 1e-4 on every ion) the flux is raised
//  geometrically to the target, each solve warm-started from the last; a
//  failed step shortens the ratio.  A solver aid, so it is COUNTED
//  (PoreSolution::continuationSteps) for the caller to announce.
PoreSolution continuation(const PoreProblem& pb, const PoreSettings& s,
                          const Layout& L, const std::string& why)
{
    PoreSettings sc = s;
    sc.audit = false;
    scalar Jstart = std::numeric_limits<scalar>::max();
    std::vector<scalar> cEq(L.Ni);
    for (std::size_t i = 0; i < L.Ni; ++i)
    {
        Jstart = std::min(Jstart, 1.0e-4 * pb.ions[i].P / pb.ions[i].Kc);
        cEq[i] = pb.ions[i].feedSide / pb.ions[i].permSide;
    }
    PoreProblem q = pb;
    q.Jv = std::min(pb.Jv, Jstart);
    PoreSolution r;
    {
        AdvisoryFrame trial("pore ENP continuation", true);
        r = solveFrom(q, sc, seedVector(q, L, cEq));
    }
    int steps = 1;
    scalar ratio = 4.0;
    while (r.converged && q.Jv < pb.Jv && steps < 400)
    {
        PoreProblem next = pb;
        next.Jv = std::min(pb.Jv, q.Jv * ratio);
        PoreSolution rn;
        {
            AdvisoryFrame trial("pore ENP continuation", true);
            rn = solveFrom(next, sc, r.x);
        }
        ++steps;
        if (rn.converged)
        {
            q = next; r = std::move(rn);
            ratio = std::min(ratio * 2.0, 100.0);
        }
        else
        {
            ratio = std::sqrt(ratio);
            if (ratio < 1.0 + 1.0e-3) break;
        }
    }
    if (!(r.converged && q.Jv >= pb.Jv))
    {
        r.converged  = false;
        r.stopReason = "continuation in J_v stalled at J_v = "
                     + std::to_string(q.Jv) + " m/s of " + std::to_string(pb.Jv)
                     + " after " + std::to_string(steps) + " solves (the"
                       " direct Newton had stopped: " + why + ")";
    }
    r.continuationSteps = steps;
    r.directFailure     = why;
    return r;
}

} // anonymous namespace

PoreSolution solve(const PoreProblem& pb, const PoreSettings& s,
                   const PoreSeed& seed)
{
    validate(pb, s);
    const Layout L = layoutOf(pb, s.intervals);
    if (seed.cPerm.size() != L.Ni)
        throw std::runtime_error("pore ENP solver: the seed carries "
            + std::to_string(seed.cPerm.size()) + " permeate concentrations"
            " for " + std::to_string(L.Ni) + " ions");
    PoreSolution r;
    {
        AdvisoryFrame trial("pore ENP from the seed", true);
        r = solveFrom(pb, s, seedVector(pb, L, seed.cPerm));
    }
    if (r.converged) return r;
    PoreSolution c = continuation(pb, s, L, r.stopReason.empty()
                         ? std::string("no convergence in maxIter") : r.stopReason);
    c.offBandMax    = r.offBandMax;       // the audit was taken on the seed
    c.jacobianEvals += r.jacobianEvals;
    return c;
}

PoreSolution solve(const PoreProblem& pb, const PoreSettings& s,
                   const PoreSolution& warm)
{
    validate(pb, s);
    const Layout L = layoutOf(pb, s.intervals);
    if (warm.x.size() != L.nv * (L.N + 1))
        throw std::runtime_error("pore ENP solver: a warm start from a"
            " solution on a different grid or ion list");
    PoreSolution r;
    {
        AdvisoryFrame trial("pore ENP warm start", true);
        r = solveFrom(pb, s, warm.x);
    }
    if (r.converged) return r;
    PoreSolution c = continuation(pb, s, L, r.stopReason.empty()
                         ? std::string("no convergence in maxIter") : r.stopReason);
    c.jacobianEvals += r.jacobianEvals;
    return c;
}

} // namespace pore
} // namespace membrane
} // namespace Choupo
