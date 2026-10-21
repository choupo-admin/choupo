// SPDX-License-Identifier: GPL-3.0-or-later
//
// Probe for bin/curate/check_ode_block_structure.py -- compiled by the gate
// against src/solver/ODE/{Rosenbrock23,Jacobian}.cpp and
// src/solver/{LU,BlockTridiagonal}.cpp alone (no engine build touched).
//
// A small method-of-lines bed laid out the way FixedBedAdsorber lays out its
// state -- SPECIES-MAJOR, with ledger rows sitting BETWEEN the cell rows --
// so the declaration's row map is exercised, not just a cell-major identity:
//
//   rows [0, N)        c_j   advection + dispersion + an LDF sink
//   rows [N, 2N)       q_j   LDF uptake, Langmuir-like, T-dependent
//   row  2N            M_out = INT u c_{N-1} dt        (border: reads 1 cell)
//   row  2N+1          Q     = INT SUM h (T_j - T0) dt (border: reads ALL cells)
//   rows [2N+2, 3N+2)  T_j   advection + the heat of uptake
//
// It integrates the SAME problem dense and structured, in samplingInterval
// chunks as the unit does, and prints what the gate checks.  Then it hands
// the integrator three FALSE declarations and prints each refusal.
#include "solver/ODE/Rosenbrock23.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <exception>
#include <string>

using namespace Choupo;
using namespace Choupo::solver;

namespace
{
const std::size_t N = 30;
const scalar u = 0.2, D = 1.0e-3, dz = 1.0 / N, k = 50.0, uT = 0.05;

sVector rhs(const sVector& y)
{
    sVector dy(y.size(), 0.0);
    const std::size_t iM = 2 * N, iQ = 2 * N + 1, iT = 2 * N + 2;
    for (std::size_t j = 0; j < N; ++j)
    {
        const scalar c  = y[j];
        const scalar cl = (j == 0) ? 1.0 : y[j - 1];
        const scalar cr = (j + 1 < N) ? y[j + 1] : c;
        const scalar T  = y[iT + j];
        const scalar Tl = (j == 0) ? 300.0 : y[iT + j - 1];
        const scalar qs = 2.0 * c / (1.0 + c) * std::exp(-0.01 * (T - 300.0));
        const scalar dq = k * (qs - y[N + j]);
        dy[N + j]  = dq;
        dy[j]      = u * (cl - c) / dz + D * (cr - 2.0 * c + cl) / (dz * dz)
                   - 0.5 * dq;
        dy[iT + j] = uT * (Tl - T) / dz + 2.0 * dq;
        dy[iQ]    += 0.3 * (T - 300.0) * dz;
    }
    dy[iM] = u * y[N - 1];
    return dy;
}

sVector initial()
{
    sVector y(3 * N + 2, 0.0);
    for (std::size_t j = 0; j < N; ++j) y[2 * N + 2 + j] = 300.0;
    return y;
}

ODEBlockStructure trueStructure()
{
    ODEBlockStructure s;
    s.nBlocks = N;
    s.blockSize = 3;
    s.blockRows.resize(3 * N);
    for (std::size_t j = 0; j < N; ++j)
    {
        s.blockRows[3 * j + 0] = j;
        s.blockRows[3 * j + 1] = N + j;
        s.blockRows[3 * j + 2] = 2 * N + 2 + j;
    }
    //  M_out reads the last cell (narrow); Q reads every cell (wide).
    s.borderReads.push_back({2 * N, long(N) - 1, long(N) - 1});
    return s;
}

struct Run { sVector y; std::size_t acc = 0, rej = 0; };

Run integrate(ODEBlockStructure* s)
{
    Rosenbrock23 r;
    Run out;
    out.y = initial();
    const DerivFn f = [](scalar, const sVector& yy) { return rhs(yy); };
    scalar t = 0.0, hCarry = 0.0;
    const scalar tEnd = 20.0, sub = 0.5;
    while (t < tEnd - 1e-12)
    {
        ODEControls c;
        c.atol = {1.0e-9};
        c.rtol = 1.0e-6;
        c.hInit = (hCarry > 0.0) ? std::min(hCarry, sub) : 0.0;
        c.nPositive = 2 * N;
        c.verbosity = 0;
        c.structure = s;
        const ODEStats st = r.integrate(out.y, t, t + sub, f, c);
        if (!st.ok) { std::printf("GAVE-UP at t=%g\n", t); break; }
        hCarry = (st.hNext > 0.0) ? st.hNext : st.hLast;
        out.acc += st.accepted;
        out.rej += st.rejected;
        t += sub;
    }
    return out;
}

void refusal(const char* tag, ODEBlockStructure s)
{
    try
    {
        integrate(&s);
        std::printf("ACCEPTED %s\n", tag);
    }
    catch (const std::exception& e)
    {
        std::printf("REFUSED %s: %s\n", tag, e.what());
    }
}
} // namespace

int main()
{
    const Run dense = integrate(nullptr);
    ODEBlockStructure s = trueStructure();
    Run blk;
    try { blk = integrate(&s); }
    catch (const std::exception& e)
    {
        std::printf("THREW on the TRUE declaration: %s\n", e.what());
        return 1;
    }

    scalar maxRel = 0.0;
    for (std::size_t i = 0; i < dense.y.size(); ++i)
        maxRel = std::max(maxRel, std::abs(blk.y[i] - dense.y[i])
                                  / std::max(std::abs(dense.y[i]), 1.0e-6));
    std::printf("n %zu\n", dense.y.size());
    std::printf("nBlocks %zu\n", s.nBlocks);
    std::printf("blockSize %zu\n", s.blockSize);
    std::printf("maxRelDiff %.3e\n", maxRel);
    std::printf("dense_steps %zu %zu\n", dense.acc, dense.rej);
    std::printf("block_steps %zu %zu\n", blk.acc, blk.rej);
    std::printf("jacobians %ld\n", s.jacobians);
    std::printf("jacobianEvals %ld\n", s.jacobianEvals);
    std::printf("auditEvals %ld\n", s.auditEvals);
    std::printf("borderEvals %ld\n", s.borderEvals);
    std::printf("narrowBorderRows %ld\n", s.narrowBorderRows);
    std::printf("wideBorderRows %ld\n", s.wideBorderRows);
    std::printf("offStructureMax %.3e\n", s.offStructureMax);
    std::printf("inStructureMax %.3e\n", s.inStructureMax);
    std::printf("coloredMismatch %.3e\n", s.coloredMismatch);
    std::printf("Mout %.12e %.12e\n", dense.y[2 * N], blk.y[2 * N]);
    std::printf("Qwall %.12e %.12e\n", dense.y[2 * N + 1], blk.y[2 * N + 1]);

    //  F1: the blocks hold the right rows of the WRONG cells (block b is
    //  cell 7b mod N) -- neighbors in the declaration are not neighbors
    //  in the model.
    {
        ODEBlockStructure f1 = trueStructure();
        for (std::size_t b = 0; b < N; ++b)
        {
            const std::size_t j = (7 * b) % N;
            f1.blockRows[3 * b + 0] = j;
            f1.blockRows[3 * b + 1] = N + j;
            f1.blockRows[3 * b + 2] = 2 * N + 2 + j;
        }
        refusal("F1-wrong-neighbors", f1);
    }
    //  F2: the loading rows left OUT of the blocks -- declared a border,
    //  but c and T read q back, so the border column is not zero.
    {
        ODEBlockStructure f2;
        f2.nBlocks = N;
        f2.blockSize = 2;
        f2.blockRows.resize(2 * N);
        for (std::size_t j = 0; j < N; ++j)
        {
            f2.blockRows[2 * j + 0] = j;
            f2.blockRows[2 * j + 1] = 2 * N + 2 + j;
        }
        refusal("F2-border-read-back", f2);
    }
    //  F4: M_out declared to read the FIRST cell -- it reads the last.
    {
        ODEBlockStructure f4 = trueStructure();
        f4.borderReads[0] = {2 * N, 0, 0};
        refusal("F4-border-reads-elsewhere", f4);
    }
    //  F3: a malformed map (one row listed twice).
    {
        ODEBlockStructure f3 = trueStructure();
        f3.blockRows[4] = f3.blockRows[1];
        refusal("F3-malformed", f3);
    }
    return 0;
}
