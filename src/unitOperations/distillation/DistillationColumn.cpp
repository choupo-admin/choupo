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

#include "DistillationColumn.H"
#include "solver/NewtonRaphson.H"
#include "solver/NewtonND.H"
#include "thermo/SaturationCurves.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <vector>

namespace Choupo {

namespace {

// Thomas algorithm: solves a tridiagonal system in-place.
//   A_j * x_{j-1} + B_j * x_j + C_j * x_{j+1} = D_j
// A_0 and C_{N-1} are ignored.  All vectors have size N.
sVector thomas(const sVector& A,
               const sVector& B,
               const sVector& C,
               sVector D)
{
    const std::size_t N = B.size();
    sVector C_(N, 0.0), D_(N, 0.0);
    C_[0] = C[0] / B[0];
    D_[0] = D[0] / B[0];
    for (std::size_t j = 1; j < N; ++j)
    {
        scalar denom = B[j] - A[j] * C_[j-1];
        C_[j] = (j+1 < N) ? C[j] / denom : 0.0;
        D_[j] = (D[j] - A[j] * D_[j-1]) / denom;
    }
    sVector x(N);
    x[N-1] = D_[N-1];
    for (std::size_t k = 1; k < N; ++k)
    {
        std::size_t j = N - 1 - k;
        x[j] = D_[j] - C_[j] * x[j+1];
    }
    return x;
}

// (bubble-T lives in src/thermo/SaturationCurves.H -- shared with the
//  T-x-y sweep that the GUI's Plots tab consumes.)

} // anonymous namespace

int DistillationColumn::solve(const DictPtr& dict,
                              const ThermoPackage& thermo,
                              int verbosity)
{
    auto feedDict = dict->subDict("feed");
    auto operDict = dict->subDict("operation");
    auto compDict = dict->subDict("composition");

    // Model selector.  The variant goes in the `model` slot RIGHT AFTER
    // `type` (the project-wide convention: type = which unit, model =
    // which variant, operation = the values).  Default Wang-Henke;
    // `model simultaneous;` switches to the MESH Newton below.  Falls back
    // to the legacy `method` key inside operation for old cases.
    const std::string method = dict->lookupWordOrDefault(
        "model", operDict->lookupWordOrDefault("method", "WangHenke"));
    if (method == "simultaneous" || method == "MESH"
        || method == "NaphtaliSandholm")
        return solveSimultaneous(dict, thermo, verbosity);

    // ---- Feed ----------------------------------------------------------
    const scalar F  = feedDict->lookupScalar("F", Dims::molarFlow);
    const scalar Tf = feedDict->lookupScalar("T", Dims::temperature);
    const scalar P  = operDict->lookupScalarOrDefault("P",
                          feedDict->lookupScalar("P", Dims::pressure),
                          Dims::pressure);

    const std::size_t n = thermo.n();
    sVector z(n, 0.0);
    scalar zsum = 0.0;
    for (const auto& key : compDict->keys())
    {
        std::size_t i = thermo.indexOf(key);
        z[i] = compDict->lookupScalar(key);
        zsum += z[i];
    }
    for (auto& v : z) v /= zsum;

    // ---- Column spec ---------------------------------------------------
    const int    Nint     = static_cast<int>(operDict->lookupScalar("nStages"));
    const int    NFint    = static_cast<int>(operDict->lookupScalar("feedStage"));
    const std::size_t N   = static_cast<std::size_t>(Nint);
    const std::size_t NF  = static_cast<std::size_t>(NFint);   // 1-based
    const scalar R        = operDict->lookupScalar("refluxRatio");
    const scalar D        = operDict->lookupScalar("distillateRate", Dims::molarFlow);
    const scalar q        = operDict->lookupScalarOrDefault("feedQuality", 1.0);

    if (NFint < 1 || NFint > Nint)
        throw std::runtime_error("DistillationColumn: feedStage out of range");

    const scalar B  = F - D;
    if (B <= 0.0)
        throw std::runtime_error("DistillationColumn: bottoms B = F − D must be > 0");

    const scalar Ll  = R * D;            // L above feed
    const scalar Vl  = (R + 1.0) * D;    // V above feed
    const scalar Lp  = Ll + q * F;       // L below feed (L')
    const scalar Vp  = Vl - (1.0 - q) * F;
    if (Vp <= 0.0)
        throw std::runtime_error(
            "DistillationColumn: vapour flow below feed is non-positive");

    // ---- Convergence config -------------------------------------------
    const int    maxOuter = static_cast<int>(dict->lookupScalarOrDefault("maxOuterIter", 200));
    const scalar tolX     = dict->lookupScalarOrDefault("compositionTol", 1.0e-6);

    // ---- Initial T profile (linear) -----------------------------------
    // Heuristic: T_top ≈ Tf - 10, T_bot ≈ Tf + 10 (refined by bubble-point)
    sVector T(N);
    for (std::size_t j = 0; j < N; ++j)
    {
        scalar a = static_cast<scalar>(j) / static_cast<scalar>(N - 1);
        T[j] = (Tf - 5.0) + a * 20.0;
    }

    // ---- Initial x profile (linear in z) ------------------------------
    // For light/heavy intuition we use the same feed composition at all
    // stages; the iteration refines it.
    std::vector<sVector> x(N, z);

    if (verbosity >= 3)
    {
        std::cout << "DistillationColumn  N=" << N
                  << "  feedStage=" << NF
                  << "  R=" << R << "  D=" << D
                  << "  B=" << B << "  q=" << q << "  P=" << (P * 1.0e-5) << " bar\n"
                  << "Outer iter      max|Δx|         T_top         T_bottom\n"
                  << "   ----      -----------    -----------    -----------\n";
    }

    int outerIt = 0;
    scalar maxDx = 0.0;
    bool   converged = false;

    for (outerIt = 0; outerIt < maxOuter; ++outerIt)
    {
        // 1. K-matrix at current (T, x)
        std::vector<sVector> K(N, sVector(n, 1.0));
        for (std::size_t j = 0; j < N; ++j)
            K[j] = thermo.Kvec(T[j], P, x[j], x[j]);

        // 2. Solve tridiagonal per component i
        std::vector<sVector> x_new(N, sVector(n, 0.0));
        for (std::size_t i = 0; i < n; ++i)
        {
            sVector A(N, 0.0), Bv(N, 0.0), C(N, 0.0), Dv(N, 0.0);
            // Stage 1 (top): A=0, B = L + D*K_1, C = -V*K_2
            Bv[0] =  Ll + D * K[0][i];
            C[0]  = -Vl * K[1][i];
            // Stages 2..NF-1 above feed
            for (std::size_t j = 1; j + 1 < NF; ++j)
            {
                A[j]  = -Ll;
                Bv[j] =  Ll + Vl * K[j][i];
                C[j]  = -Vl * K[j+1][i];
            }
            // Feed stage (NF, 1-based → index NF-1)
            std::size_t jf = NF - 1;
            if (jf > 0)
            {
                A[jf]  = -Ll;
                Bv[jf] =  Lp + Vl * K[jf][i];
                C[jf]  = -Vp * K[jf+1][i];
                Dv[jf] =  F * z[i];
            }
            else
            {
                // Feed is at stage 1 — treat similarly to top with feed term.
                Bv[0] = Lp + D * K[0][i];
                Dv[0] = F * z[i];
                C[0]  = -Vp * K[1][i];
            }
            // Stages NF+1.. N-1 below feed
            for (std::size_t j = jf + 1; j + 1 < N; ++j)
            {
                A[j]  = -Lp;
                Bv[j] =  Lp + Vp * K[j][i];
                C[j]  = -Vp * K[j+1][i];
            }
            // Stage N (reboiler): A = -L', B = V*K_N + B
            A[N-1]  = -Lp;
            Bv[N-1] =  Vp * K[N-1][i] + B;

            sVector xi = thomas(A, Bv, C, Dv);
            for (std::size_t j = 0; j < N; ++j) x_new[j][i] = std::max(xi[j], 0.0);
        }

        // 3. Normalise x at each stage
        for (std::size_t j = 0; j < N; ++j)
        {
            scalar s = 0.0;
            for (auto v : x_new[j]) s += v;
            if (s > 0.0) for (auto& v : x_new[j]) v /= s;
        }

        // 4. Update T at each stage via bubble-point
        for (std::size_t j = 0; j < N; ++j)
            T[j] = bubbleT(thermo, x_new[j], P, T[j]);

        // 5. Convergence
        maxDx = 0.0;
        for (std::size_t j = 0; j < N; ++j)
            for (std::size_t i = 0; i < n; ++i)
                maxDx = std::max(maxDx, std::abs(x_new[j][i] - x[j][i]));
        recordResidual(maxDx);

        x = x_new;

        if (verbosity >= 3 && (outerIt < 6
                            || outerIt % 5 == 0
                            || maxDx < tolX))
            std::cout << "   " << std::setw(4) << outerIt
                      << "      " << std::scientific << std::setprecision(3)
                      << std::setw(11) << maxDx
                      << "    " << std::fixed << std::setprecision(2)
                      << std::setw(11) << T[0]
                      << "    " << std::setw(11) << T[N-1] << "\n";

        if (maxDx < tolX) { converged = true; ++outerIt; break; }
    }

    // ---- Distillate composition: x_D = K_1 · x_1 ----------------------
    auto K1 = thermo.Kvec(T[0], P, x[0], x[0]);
    sVector xD(n);
    for (std::size_t i = 0; i < n; ++i) xD[i] = K1[i] * x[0][i];
    {
        scalar s = 0.0; for (auto v : xD) s += v;
        if (s > 0.0) for (auto& v : xD) v /= s;
    }

    // ---- Stage profile (consumed by the GUI's profile plot) -----------
    //  xAxis: 1-indexed stage number, matching the printed table.
    //  Columns: T, x_<comp>, y_<comp>.  y is the equilibrium vapour
    //  composition at the stage's (T, x), i.e. y_{j,i} = K_{j,i} x_{j,i}
    //  after a per-stage K solve.
    profile_ = UnitProfile{};
    profile_.xAxis = "stage";
    profile_.columns["stage"].reserve(N);
    profile_.columns["T"].reserve(N);
    for (std::size_t i = 0; i < n; ++i)
    {
        profile_.columns["x_" + thermo.comp(i).name()].reserve(N);
        profile_.columns["y_" + thermo.comp(i).name()].reserve(N);
    }
    for (std::size_t j = 0; j < N; ++j)
    {
        const auto Kj = thermo.Kvec(T[j], P, x[j], x[j]);
        profile_.columns["stage"].push_back(static_cast<scalar>(j + 1));
        profile_.columns["T"].push_back(T[j]);
        for (std::size_t i = 0; i < n; ++i)
        {
            profile_.columns["x_" + thermo.comp(i).name()].push_back(x[j][i]);
            profile_.columns["y_" + thermo.comp(i).name()].push_back(Kj[i] * x[j][i]);
        }
    }
    profile_.markers.push_back({static_cast<scalar>(NF), "feed"});

    // ---- Report --------------------------------------------------------
    std::cout << "\n========================  DistillationColumn  =====================\n"
              << "  Converged:     " << (converged ? "yes" : "NO") << "\n"
              << "  Outer iter.:   " << outerIt << "\n"
              << "  Final max|Δx|: " << std::scientific << std::setprecision(3)
              << maxDx << "\n\n"
              << "  Stage-by-stage profile  (T, x_i):\n"
              << "    stage      T [K]      ";
    for (std::size_t i = 0; i < n; ++i)
        std::cout << "x(" << thermo.comp(i).name() << ")  ";
    std::cout << "\n";
    for (std::size_t j = 0; j < N; ++j)
    {
        std::cout << "    " << std::setw(4) << (j+1) << "    "
                  << std::fixed << std::setprecision(2)
                  << std::setw(8) << T[j] << "   ";
        for (std::size_t i = 0; i < n; ++i)
            std::cout << " " << std::setw(7) << std::setprecision(5)
                      << x[j][i];
        if (j+1 == NF) std::cout << "  ← feed";
        if (j+1 == 1)  std::cout << "  (top)";
        if (j+1 == N)  std::cout << "  (reboiler)";
        std::cout << "\n";
    }
    std::cout << "\n  Products:\n"
              << "    Distillate  D = " << std::fixed << std::setprecision(4)
              << (D * 3600.0) << " kmol/h  T = " << T[0] << " K\n"
              << "      x_D = ";
    for (std::size_t i = 0; i < n; ++i)
        std::cout << thermo.comp(i).name() << "=" << std::setprecision(5)
                  << xD[i] << "  ";
    std::cout << "\n    Bottoms     B = " << (B * 3600.0) << " kmol/h  T = "
              << T[N-1] << " K\n"
              << "      x_B = ";
    for (std::size_t i = 0; i < n; ++i)
        std::cout << thermo.comp(i).name() << "=" << x[N-1][i] << "  ";
    std::cout << "\n=====================================================================\n\n";

    // ---- Produced streams (order: distillate, bottoms) ----------------
    produced_.clear();
    ProcessStream dStream;
    dStream.name = "distillate";
    dStream.F    = D;
    dStream.T    = T[0];
    dStream.P    = P;
    dStream.z    = xD;
    dStream.vf   = 0.0;            // already condensed
    produced_.push_back(dStream);

    ProcessStream bStream;
    bStream.name = "bottoms";
    bStream.F    = B;
    bStream.T    = T[N-1];
    bStream.P    = P;
    bStream.z    = x[N-1];
    bStream.vf   = 0.0;
    produced_.push_back(bStream);

    // ---- KPIs --------------------------------------------------------
    kpis_.clear();
    kpis_["nStages"]    = static_cast<scalar>(N);
    kpis_["feedStage"]  = static_cast<scalar>(NF);
    kpis_["R"]          = R;
    kpis_["D"]          = D;
    kpis_["B"]          = B;
    kpis_["T_top"]      = T[0];
    kpis_["T_bottom"]   = T[N-1];
    kpis_["V_rect"]     = Vl;       // vapour flow in rectifying section
    kpis_["L_rect"]     = Ll;
    kpis_["V_strip"]    = Vp;       // vapour flow at reboiler ~ Q_reboiler proxy
    kpis_["L_strip"]    = Lp;
    // Light-key purity in distillate, heavy-key purity in bottoms
    // (component 0 = light by convention for binary feed)
    kpis_["x_D_LK"]     = xD[0];
    kpis_["x_B_HK"]     = (n > 1) ? x[N-1][n - 1] : 0.0;
    kpis_["iterations"] = static_cast<scalar>(outerIt);

    // Energy items [kW].  Q_condenser is the heat removed to condense the
    // overhead vapour V1=(R+1)D (latent at the top); Q_reboiler then CLOSES
    // the column energy balance, Q_reb = dH_streams - Q_cond, so the two
    // reconcile with the stream enthalpy change (this is how a column duty is
    // reported).  Signed as energy added to the process: condenser negative
    // (removed), reboiler positive (supplied).  dH is datum-independent for a
    // non-reacting unit, so the sensible datum here matches the report.
    {
        const scalar V1     = (R + 1.0) * D;                              // overhead vapour [kmol/s]
        const scalar lamTop = thermo.Hvapour(T[0], xD) - thermo.Hliquid(T[0], xD);
        const scalar Q_cond = -V1 * lamTop;                              // removed (latent, datum-independent)
        // Stream enthalpies on the report's datum (elements first --- so dH
        // matches the balance sheet; sensible fallback if Hf is missing).
        bool elem = true;
        try { thermo.H_stream_formation(Tf, P, 1.0 - q, z);
              thermo.H_stream_formation(T[0], P, 0.0, xD);
              thermo.H_stream_formation(T[N-1], P, 0.0, x[N-1]); }
        catch (const std::exception&) { elem = false; }
        auto H = [&](scalar Fx, scalar Tx, scalar vfx, const sVector& zx) {
            return elem ? Fx * thermo.H_stream_formation(Tx, P, vfx, zx)
                      : Fx * thermo.Hliquid(Tx, zx);
        };
        const scalar dH = (H(D, T[0], 0.0, xD) + H(B, T[N-1], 0.0, x[N-1]))
                        -  H(F, Tf, 1.0 - q, z);
        kpis_["Q_condenser_kW"] = Q_cond;
        kpis_["Q_reboiler_kW"]  = dH - Q_cond;                          // closes the balance
    }

    return converged ? 0 : 1;
}

// ===========================================================================
//   Rigorous simultaneous-correction method (MESH Newton).
//
//   Variables, per stage j:  x_{j,0..n-2}  (the last fraction by Σx=1)
//                            and T_j.   ->  N·n unknowns.
//   Equations, per stage j:  n-1 component balances M_{j,i} (same CMO
//   coefficients as Wang-Henke, but with K_j(T_j) live) + the bubble-
//   point Σ_i K_{j,i} x_{j,i} − 1 = 0 that fixes T_j.   ->  N·n residuals.
//
//   Solved by solver::newtonND (finite-difference Jacobian, dense Gauss,
//   Armijo backtracking).  This is the SIMULTANEOUS Newton on the MESH
//   set --- the part that converges azeotropes; the Naphtali-Sandholm
//   block-tridiagonal Jacobian is an efficiency refinement left for later.
// ===========================================================================
int DistillationColumn::solveSimultaneous(const DictPtr& dict,
                                          const ThermoPackage& thermo,
                                          int verbosity)
{
    auto feedDict = dict->subDict("feed");
    auto operDict = dict->subDict("operation");
    auto compDict = dict->subDict("composition");

    const scalar F  = feedDict->lookupScalar("F", Dims::molarFlow);
    const scalar Tf = feedDict->lookupScalar("T", Dims::temperature);
    const scalar P  = operDict->lookupScalarOrDefault("P",
                          feedDict->lookupScalar("P", Dims::pressure),
                          Dims::pressure);

    const std::size_t n = thermo.n();
    sVector z(n, 0.0);
    { scalar s = 0.0;
      for (const auto& k : compDict->keys()) z[thermo.indexOf(k)] = compDict->lookupScalar(k);
      for (auto v : z) s += v;
      if (s > 0.0) for (auto& v : z) v /= s; }

    const std::size_t N  = static_cast<std::size_t>(operDict->lookupScalar("nStages"));
    const std::size_t NF = static_cast<std::size_t>(operDict->lookupScalar("feedStage"));
    const scalar R = operDict->lookupScalar("refluxRatio");
    const scalar D = operDict->lookupScalar("distillateRate", Dims::molarFlow);
    const scalar q = operDict->lookupScalarOrDefault("feedQuality", 1.0);
    const scalar Bf = F - D;
    if (NF < 2 || NF > N)
        throw std::runtime_error("DistillationColumn(simultaneous): feedStage "
            "must be 2..nStages (feed at the top not supported by this method)");
    if (Bf <= 0.0)
        throw std::runtime_error("DistillationColumn(simultaneous): B = F − D must be > 0");

    const scalar Ll = R * D, Vl = (R + 1.0) * D;
    const scalar Lp = Ll + q * F, Vp = Vl - (1.0 - q) * F;
    if (Vp <= 0.0)
        throw std::runtime_error("DistillationColumn(simultaneous): vapour below feed <= 0");
    const std::size_t jf = NF - 1;                 // feed stage index
    const std::size_t nv = n;                      // vars per stage

    // Pack/unpack u = [x_{0,0..n-2}, T_0, x_{1,...}, T_1,...].
    auto unpack = [&](const sVector& u, std::size_t j, sVector& xj, scalar& Tj) {
        xj.assign(n, 0.0);
        scalar s = 0.0;
        for (std::size_t i = 0; i + 1 < n; ++i) { xj[i] = u[j*nv + i]; s += xj[i]; }
        xj[n-1] = 1.0 - s;
        Tj = u[j*nv + (n-1)];
    };

    // Residual: n-1 component balances + bubble-point per stage.
    auto residual = [&](const sVector& u) -> sVector {
        std::vector<sVector> x(N), y(N), K(N);
        sVector T(N);
        for (std::size_t j = 0; j < N; ++j) {
            unpack(u, j, x[j], T[j]);
            K[j] = thermo.Kvec(T[j], P, x[j], x[j]);
            y[j].assign(n, 0.0);
            for (std::size_t i = 0; i < n; ++i) y[j][i] = K[j][i] * x[j][i];
        }
        sVector g(N * nv, 0.0);
        for (std::size_t j = 0; j < N; ++j) {
            for (std::size_t i = 0; i + 1 < n; ++i) {       // M_{j,i}
                scalar m;
                if (j == 0)
                    m = Ll*x[0][i] + D*y[0][i] - Vl*y[1][i];
                else if (j == N-1)
                    m = -Lp*x[N-2][i] + Vp*y[N-1][i] + Bf*x[N-1][i];
                else if (j < jf)
                    m = -Ll*x[j-1][i] + (Ll*x[j][i] + Vl*y[j][i]) - Vl*y[j+1][i];
                else if (j == jf)
                    m = -Ll*x[j-1][i] + (Lp*x[j][i] + Vl*y[j][i]) - Vp*y[j+1][i] - F*z[i];
                else
                    m = -Lp*x[j-1][i] + (Lp*x[j][i] + Vp*y[j][i]) - Vp*y[j+1][i];
                g[j*nv + i] = m;
            }
            scalar sy = 0.0;                                // E_j: Σ y − 1
            for (std::size_t i = 0; i < n; ++i) sy += y[j][i];
            g[j*nv + (n-1)] = sy - 1.0;
        }
        return g;
    };

    // Initial guess: linear T, feed composition at every stage.
    sVector u0(N * nv, 0.0);
    for (std::size_t j = 0; j < N; ++j) {
        const scalar a = static_cast<scalar>(j) / static_cast<scalar>(N - 1);
        for (std::size_t i = 0; i + 1 < n; ++i) u0[j*nv + i] = z[i];
        u0[j*nv + (n-1)] = (Tf - 5.0) + a * 20.0;
    }

    solver::NDOptions opts;
    opts.tolerance = 1.0e-9;
    opts.maxIter   = 80;
    if (verbosity >= 3)
        opts.onIter = [this](const solver::NDTrace& tr) {
            recordResidual(tr.normF);
        };
    auto res = solver::newtonND(residual, u0, opts);

    std::vector<sVector> x(N);
    sVector T(N);
    for (std::size_t j = 0; j < N; ++j) unpack(res.x, j, x[j], T[j]);

    // Distillate (total condenser): x_D = K_1·x_1, normalised.
    auto K0 = thermo.Kvec(T[0], P, x[0], x[0]);
    sVector xD(n);
    { scalar s = 0.0;
      for (std::size_t i = 0; i < n; ++i) { xD[i] = K0[i]*x[0][i]; s += xD[i]; }
      if (s > 0.0) for (auto& v : xD) v /= s; }

    // Profile.
    profile_ = UnitProfile{};
    profile_.xAxis = "stage";
    for (std::size_t j = 0; j < N; ++j) {
        const auto Kj = thermo.Kvec(T[j], P, x[j], x[j]);
        profile_.columns["stage"].push_back(static_cast<scalar>(j + 1));
        profile_.columns["T"].push_back(T[j]);
        for (std::size_t i = 0; i < n; ++i) {
            profile_.columns["x_" + thermo.comp(i).name()].push_back(x[j][i]);
            profile_.columns["y_" + thermo.comp(i).name()].push_back(Kj[i]*x[j][i]);
        }
    }
    profile_.markers.push_back({static_cast<scalar>(NF), "feed"});

    if (verbosity >= 2)
    {
        std::cout << "\n=============  DistillationColumn (simultaneous MESH)  ============\n"
                  << "  Converged:   " << (res.converged ? "yes" : "NO")
                  << "   Newton iters: " << res.iterations
                  << "   ||F|| = " << std::scientific << std::setprecision(3) << res.residual << "\n\n"
                  << "  Stage-by-stage profile  (T, x_i, y_i):\n"
                  << "    stage      T [K]   ";
        for (std::size_t i = 0; i < n; ++i)
            std::cout << "  x(" << thermo.comp(i).name() << ")";
        for (std::size_t i = 0; i < n; ++i)
            std::cout << "  y(" << thermo.comp(i).name() << ")";
        std::cout << "\n";
        for (std::size_t j = 0; j < N; ++j)
        {
            const auto Kj = thermo.Kvec(T[j], P, x[j], x[j]);
            std::cout << "    " << std::setw(4) << (j+1) << "    "
                      << std::fixed << std::setprecision(2) << std::setw(8) << T[j] << "  ";
            for (std::size_t i = 0; i < n; ++i)
                std::cout << " " << std::setw(7) << std::setprecision(4) << x[j][i];
            for (std::size_t i = 0; i < n; ++i)
                std::cout << " " << std::setw(7) << std::setprecision(4) << (Kj[i]*x[j][i]);
            if (j+1 == NF) std::cout << "  <- feed";
            if (j+1 == 1)  std::cout << "  (top)";
            if (j+1 == N)  std::cout << "  (reboiler)";
            std::cout << "\n";
        }
        std::cout << "\n  Products:\n"
                  << "    Distillate  D = " << std::fixed << std::setprecision(4) << (D*3600.0)
                  << " kmol/h  T = " << std::setprecision(2) << T[0] << " K   x_D("
                  << thermo.comp(0).name() << ") = " << std::setprecision(5) << xD[0] << "\n"
                  << "    Bottoms     B = " << std::setprecision(4) << (Bf*3600.0)
                  << " kmol/h  T = " << std::setprecision(2) << T[N-1] << " K   x_B("
                  << thermo.comp(n-1).name() << ") = " << std::setprecision(5) << x[N-1][n-1] << "\n"
                  << "==================================================================\n\n";
    }

    produced_.clear();
    ProcessStream dStream;
    dStream.name = "distillate"; dStream.F = D; dStream.T = T[0]; dStream.P = P;
    dStream.z = xD; dStream.vf = 0.0;
    produced_.push_back(dStream);
    ProcessStream bStream;
    bStream.name = "bottoms"; bStream.F = Bf; bStream.T = T[N-1]; bStream.P = P;
    bStream.z = x[N-1]; bStream.vf = 0.0;
    produced_.push_back(bStream);

    kpis_.clear();
    kpis_["nStages"]    = static_cast<scalar>(N);
    kpis_["feedStage"]  = static_cast<scalar>(NF);
    kpis_["R"]          = R;
    kpis_["D"]          = D;
    kpis_["B"]          = Bf;
    kpis_["T_top"]      = T[0];
    kpis_["T_bottom"]   = T[N-1];
    kpis_["x_D_LK"]     = xD[0];
    kpis_["x_B_HK"]     = (n > 1) ? x[N-1][n-1] : 0.0;
    kpis_["iterations"] = static_cast<scalar>(res.iterations);

    // Energy items [kW] (see the Wang-Henke path): condenser from the overhead
    // latent, reboiler closes the column energy balance.
    {
        const scalar V1     = (R + 1.0) * D;
        const scalar lamTop = thermo.Hvapour(T[0], xD) - thermo.Hliquid(T[0], xD);
        const scalar Q_cond = -V1 * lamTop;
        bool elem = true;
        try { thermo.H_stream_formation(Tf, P, 1.0 - q, z);
              thermo.H_stream_formation(T[0], P, 0.0, xD);
              thermo.H_stream_formation(T[N-1], P, 0.0, x[N-1]); }
        catch (const std::exception&) { elem = false; }
        auto H = [&](scalar Fx, scalar Tx, scalar vfx, const sVector& zx) {
            return elem ? Fx * thermo.H_stream_formation(Tx, P, vfx, zx)
                      : Fx * thermo.Hliquid(Tx, zx);
        };
        const scalar dH = (H(D, T[0], 0.0, xD) + H(Bf, T[N-1], 0.0, x[N-1]))
                        -  H(F, Tf, 1.0 - q, z);
        kpis_["Q_condenser_kW"] = Q_cond;
        kpis_["Q_reboiler_kW"]  = dH - Q_cond;
    }

    return res.converged ? 0 : 1;
}

} // namespace Choupo
