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

#include "core/InfeasibleTrial.H"
#include "DistillationColumn.H"
#include "TrayHydraulics.H"
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
    auto operDict = dict->subDict("operation");

    // Model selector.  The variant goes in the `model` slot RIGHT AFTER
    // `type` (the project-wide convention: type = which unit, model =
    // which variant, operation = the values).  Default Wang-Henke;
    // `model simultaneous;` switches to the MESH Newton below.  Falls back
    // to the legacy `method` key inside operation for old cases.
    const std::string method = dict->lookupWordOrDefault(
        "model", operDict->lookupWordOrDefault("method", "WangHenke"));
    if (method == "simultaneous" || method == "MESH"
        || method == "NaphtaliSandholm" || method == "fullMESH")
        return solveSimultaneous(dict, thermo, verbosity);

    // Capability boundary, made LOUD (no silent crutch): multiple feeds and
    // side draws live only in the simultaneous MESH.  The Wang-Henke
    // tridiagonal sweep takes a single feed --- so REFUSE clearly here rather
    // than silently ignore a `feeds`/`sideDraws` block the user wrote.
    if (operDict->found("feeds") || operDict->found("sideDraws")
        || dict->found("reaction") || dict->found("inputStreams"))
        throw std::runtime_error("DistillationColumn: multiple feeds (`inputs (...)` / "
            "`feeds`), side draws, or reactive distillation require `model "
            "simultaneous;` --- the Wang-Henke method handles a single feed only.");

    // ---- Feed ----------------------------------------------------------
    auto feedDict = dict->subDict("feed");
    auto compDict = dict->subDict("composition");
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

    // Strictly INSIDE the cascade: NF == N (feed onto the bottom stage)
    // walked the Wang-Henke arrays out of bounds and SEGFAULTED (found live
    // by the Front-4c integer enumeration probing nStages below the feed).
    // The guard now states what the algorithm actually supports, with the
    // remedy in the message -- never a crash.
    if (NFint < 1 || NFint >= Nint)
        throw std::runtime_error("DistillationColumn: feedStage ("
            + std::to_string(NFint) + ") must lie in 1.." + std::to_string(Nint - 1)
            + " (strictly above the bottom stage; nStages = "
            + std::to_string(Nint) + ").  Raise nStages or lower feedStage.");

    const scalar B  = F - D;
    if (B <= 0.0)
        throw InfeasibleTrial("DistillationColumn: bottoms B = F - D <= 0 (infeasible trial)");

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

    // ---- MURPHREE TRAY EFFICIENCY (declared, never guessed) ------------
    //  Up to here every stage is an EQUILIBRIUM stage: the vapour leaving it is in
    //  equilibrium with the liquid leaving it.  No real tray achieves that -- the
    //  vapour spends a finite time in the froth.  Murphree measured the shortfall
    //  on the VAPOUR side:
    //
    //      y_j = E_MV . y*_j  +  (1 - E_MV) . y_{j+1},        y*_j = K_j x_j
    //
    //  i.e. the vapour leaving tray j travels a fraction E_MV of the way from what
    //  entered (y_{j+1}) to what equilibrium would give (y*_j).  E_MV = 1 is the
    //  ideal stage and every existing case keeps that default, byte for byte.
    //
    //  E_MV is a DECLARED number, like the orifice coefficient and the weep-point
    //  constant in the hydraulics: it comes from a correlation, a chart, or plant
    //  data, and it is the student's to own.  Choupo will not invent it.
    //
    //  With efficiency, `nStages` counts REAL TRAYS, not ideal stages -- which is
    //  what the hydraulics pass then sizes.  The condenser and the reboiler stay
    //  equilibrium devices (they are not trays).
    const scalar Emv = operDict->lookupScalarOrDefault("murphreeEfficiency", 1.0);
    if (Emv <= 0.0 || Emv > 1.0)
        throw std::runtime_error("DistillationColumn: murphreeEfficiency must lie in "
            "(0, 1] -- 1 is the ideal equilibrium stage");
    if (Emv < 1.0 && verbosity >= 2)
        std::cout << "  Murphree vapour efficiency E_MV = " << Emv
                  << "  -- the " << (N - 1) << " trays are REAL trays, not ideal stages\n";

    int outerIt = 0;
    scalar maxDx = 0.0;
    bool   converged = false;

    //  y from the PREVIOUS outer pass.  The Murphree relation couples tray j to the
    //  vapour rising from j+1, which would destroy the tridiagonal structure if it
    //  were an unknown.  Lag it one pass: the linear solve keeps its shape, and at
    //  convergence y^old == y, so the converged profile satisfies Murphree EXACTLY.
    //  Honest, and visible: the outer loop is what pays for it.
    std::vector<sVector> yPrev(N, sVector(n, 0.0));
    bool haveY = false;
    std::vector<sVector> Keff(N, sVector(n, 1.0));

    for (outerIt = 0; outerIt < maxOuter; ++outerIt)
    {
        // 1. K-matrix at current (T, x)
        std::vector<sVector> K(N, sVector(n, 1.0));
        for (std::size_t j = 0; j < N; ++j)
            K[j] = thermo.Kvec(T[j], P, x[j], x[j]);

        // 1b. Fold the tray efficiency into an EFFECTIVE K, so that y_j = Keff_j x_j
        //     carries the Murphree relation without changing a single equation below.
        Keff = K;
        if (Emv < 1.0)
            for (std::size_t j = 0; j + 1 < N; ++j)       // the reboiler is not a tray
                for (std::size_t i = 0; i < n; ++i)
                {
                    const scalar xj = x[j][i];
                    if (xj <= 1.0e-12) continue;           // absent component: y ~ 0 either way
                    const scalar yDown = haveY ? yPrev[j+1][i] : K[j+1][i] * x[j+1][i];
                    Keff[j][i] = std::max(0.0, Emv * K[j][i] + (1.0 - Emv) * yDown / xj);
                }

        // 2. Solve tridiagonal per component i
        std::vector<sVector> x_new(N, sVector(n, 0.0));
        for (std::size_t i = 0; i < n; ++i)
        {
            sVector A(N, 0.0), Bv(N, 0.0), C(N, 0.0), Dv(N, 0.0);
            // Stage 1 (top): A=0, B = L + D*K_1, C = -V*K_2
            Bv[0] =  Ll + D * Keff[0][i];
            C[0]  = -Vl * Keff[1][i];
            // Stages 2..NF-1 above feed
            for (std::size_t j = 1; j + 1 < NF; ++j)
            {
                A[j]  = -Ll;
                Bv[j] =  Ll + Vl * Keff[j][i];
                C[j]  = -Vl * Keff[j+1][i];
            }
            // Feed stage (NF, 1-based → index NF-1)
            std::size_t jf = NF - 1;
            if (jf > 0)
            {
                A[jf]  = -Ll;
                Bv[jf] =  Lp + Vl * Keff[jf][i];
                C[jf]  = -Vp * Keff[jf+1][i];
                Dv[jf] =  F * z[i];
            }
            else
            {
                // Feed is at stage 1 — treat similarly to top with feed term.
                Bv[0] = Lp + D * Keff[0][i];
                Dv[0] = F * z[i];
                C[0]  = -Vp * Keff[1][i];
            }
            // Stages NF+1.. N-1 below feed
            for (std::size_t j = jf + 1; j + 1 < N; ++j)
            {
                A[j]  = -Lp;
                Bv[j] =  Lp + Vp * Keff[j][i];
                C[j]  = -Vp * Keff[j+1][i];
            }
            // Stage N (reboiler): A = -L', B = V*K_N + B
            A[N-1]  = -Lp;
            Bv[N-1] =  Vp * Keff[N-1][i] + B;

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

        // 3b. The vapour this pass actually produced -- the lag term for the next.
        if (Emv < 1.0)
        {
            for (std::size_t j = 0; j < N; ++j)
            {
                scalar sy = 0.0;
                for (std::size_t i = 0; i < n; ++i)
                { yPrev[j][i] = Keff[j][i] * x_new[j][i]; sy += yPrev[j][i]; }
                if (sy > 0.0) for (auto& v : yPrev[j]) v /= sy;
            }
            haveY = true;
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

    // ---- Distillate composition: x_D = y_1, the vapour leaving the TOP TRAY.
    //  With E_MV < 1 that is Keff_1 x_1, not the equilibrium K_1 x_1: a real top
    //  tray hands the condenser a vapour it never fully equilibrated with.
    auto K1 = (Emv < 1.0) ? Keff[0] : thermo.Kvec(T[0], P, x[0], x[0]);
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
        const auto Kj = (Emv < 1.0) ? Keff[j] : thermo.Kvec(T[j], P, x[j], x[j]);
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
    if (Emv < 1.0) kpis_["murphreeEfficiency"] = Emv;

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

    // ---- Optional sieve-tray hydraulics ------------------------------
    //  Under CMO the traffic is constant within each section, so V and L are
    //  section step-functions.  Stage N-1 is the reboiler; the condenser is
    //  external to this method's stage list, so every stage above the reboiler
    //  is a tray.
    {
        std::vector<scalar> Vs(N, 0.0), Ls(N, 0.0);
        std::vector<sVector> yAll(N, sVector(n, 0.0));
        for (std::size_t j = 0; j < N; ++j)
        {
            const bool rect = (j + 1 < static_cast<std::size_t>(NFint));
            Vs[j] = rect ? Vl : Vp;
            Ls[j] = rect ? Ll : Lp;
            const auto Kj = (Emv < 1.0) ? Keff[j] : thermo.Kvec(T[j], P, x[j], x[j]);
            scalar sy = 0.0;
            for (std::size_t i = 0; i < n; ++i) { yAll[j][i] = Kj[i] * x[j][i]; sy += yAll[j][i]; }
            if (sy > 0.0) for (auto& v : yAll[j]) v /= sy;
        }
        Vs[N-1] = 0.0;                    // the reboiler is not a tray
        hydraulicsPass(operDict, thermo, P, T, x, yAll, Vs, Ls, verbosity);
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
    auto operDict = dict->subDict("operation");
    // Murphree efficiency is implemented on the Wang-Henke path only (folded into
    // an effective K, with the vapour from below lagged one outer pass).  The MESH
    // Newton has no outer pass to lag against: the relation would have to enter the
    // residual and the Jacobian.  Refuse rather than silently return ideal stages.
    if (operDict->lookupScalarOrDefault("murphreeEfficiency", 1.0) < 1.0)
        throw std::runtime_error("DistillationColumn: `murphreeEfficiency` is not "
            "implemented for `method simultaneous` -- it would have to enter the MESH "
            "residual and Jacobian, and Choupo will not quietly hand you ideal stages "
            "instead.  Use the Wang-Henke method, or drop the efficiency.");
    // A MULTI-FEED column takes its feeds as flowsheet STREAMS (`inputs (...)` ->
    // `inputStreams`), so the plant-boundary mass + energy balance sees them.  A
    // single-feed column keeps the legacy `in feed;` (-> `feed{}` + `composition{}`).
    const bool   multiFeed = dict->found("inputStreams");
    const DictPtr feedDict = multiFeed ? nullptr : dict->subDict("feed");
    const DictPtr compDict = multiFeed ? nullptr : dict->subDict("composition");

    const scalar P  = multiFeed
        ? operDict->lookupScalar("P", Dims::pressure)
        : operDict->lookupScalarOrDefault("P", feedDict->lookupScalar("P", Dims::pressure),
                                          Dims::pressure);

    const std::size_t n = thermo.n();
    auto readComp = [&](const DictPtr& cd) {
        sVector zz(n, 0.0); scalar s = 0.0;
        for (const auto& k : cd->keys()) zz[thermo.indexOf(k)] = cd->lookupScalar(k);
        for (auto v : zz) s += v;
        if (s > 0.0) for (auto& v : zz) v /= s;
        return zz;
    };

    const std::size_t N  = static_cast<std::size_t>(operDict->lookupScalar("nStages"));
    const scalar R = operDict->lookupScalar("refluxRatio");
    const scalar D = operDict->lookupScalar("distillateRate", Dims::molarFlow);

    // ---- per-stage feed / side-draw maps -------------------------------
    //  General RadFrac-style staircase: any stage may receive a feed and/or
    //  bleed a liquid (U) or vapour (W) side draw.  The single `feed{}` block
    //  is feed #1 (backward compatible); extra `feeds(...)` and `sideDraws(...)`
    //  lists add more.  Feeds on the same stage are merged (mole-weighted z, q).
    std::vector<scalar>  Ffeed(N, 0.0), feedLiq(N, 0.0), feedTmol(N, 0.0),
                         Udraw(N, 0.0), Wdraw(N, 0.0);
    std::vector<sVector> feedComp(N, sVector(n, 0.0));
    auto addFeed = [&](std::size_t j, scalar Ff, scalar qf, scalar Tff, const sVector& zf) {
        Ffeed[j] += Ff; feedLiq[j] += qf * Ff; feedTmol[j] += Ff * Tff;
        for (std::size_t i = 0; i < n; ++i) feedComp[j][i] += Ff * zf[i];
    };

    // Representative primary-feed scalars (initial-guess anchor, profile marker,
    // the elem-datum probe).  The per-stage arrays above carry the real physics.
    scalar       Tf = 0.0, q = 1.0;
    std::size_t  NF = 0;
    sVector      z(n, 0.0);

    if (multiFeed)   // ---- feeds are flowsheet streams, mapped to stages ----------
    {
        std::map<std::string, DictPtr> byName;
        for (const auto& s : dict->lookupDictList("inputStreams")) byName[s->name()] = s;
        if (!operDict->found("feeds"))
            throw std::runtime_error("DistillationColumn: a multi-input column needs "
                "`operation { feeds ( { stream <name>; stage <k>; } ... ); }` to map each "
                "input stream to a stage.");
        bool first = true;
        for (const auto& fe : operDict->lookupDictList("feeds"))
        {
            const std::string sName = fe->lookupWord("stream");
            const std::size_t st = static_cast<std::size_t>(fe->lookupScalar("stage"));
            if (st < 1 || st > N)
                throw std::runtime_error("DistillationColumn: a feed `stage` is out of range.");
            auto it = byName.find(sName);
            if (it == byName.end())
                throw std::runtime_error("DistillationColumn: feed stream '" + sName
                    + "' is not among the column's `inputs (...)`.");
            const auto& sd = it->second;
            const scalar  Ff  = sd->lookupScalar("F", Dims::molarFlow);
            const scalar  Tfe = sd->lookupScalar("T", Dims::temperature);
            const sVector zf  = readComp(sd->subDict("composition"));
            // The feed's thermal state lives in the STREAM (information follows the
            // streams): the McCabe--Thiele quality q = 1 - vf, with vf the vapour
            // fraction the flowsheet flash already resolved.  A redundant
            // operation.feeds.quality that DISAGREES is exactly the column08-class
            // silent bug (a vapour feed declared liquid) -> REFUSE it loudly.
            const scalar vfStream = sd->lookupScalarOrDefault("vf", 0.0);
            const scalar qf = 1.0 - vfStream;
            if (fe->found("quality"))
            {
                const scalar qDecl = fe->lookupScalar("quality");
                if (std::abs(qDecl - qf) > 1.0e-3)
                    throw std::runtime_error("DistillationColumn: feed '" + sName
                        + "': operation.feeds.quality = " + std::to_string(qDecl)
                        + " contradicts the feed STREAM (vaporFraction "
                        + std::to_string(vfStream) + " => q = " + std::to_string(qf)
                        + ").  A feed's thermal state lives in the stream, not the"
                        " column -- delete the `quality` and set the stream's"
                        " T / P / vaporFraction so the two can never disagree.");
            }
            addFeed(st - 1, Ff, qf, Tfe, zf);
            if (first) { Tf = Tfe; NF = st; q = qf; z = zf; first = false; }
        }
    }
    else             // ---- legacy single feed{} block + feedStage ----------------
    {
        Tf = feedDict->lookupScalar("T", Dims::temperature);
        NF = static_cast<std::size_t>(operDict->lookupScalar("feedStage"));
        q  = operDict->lookupScalarOrDefault("feedQuality", 1.0);
        if (NF < 2 || NF > N)
            throw std::runtime_error("DistillationColumn(simultaneous): feedStage "
                "must be 2..nStages (feed at the top not supported by this method)");
        z = readComp(compDict);
        addFeed(NF - 1, feedDict->lookupScalar("F", Dims::molarFlow), q, Tf, z);

        // legacy INLINE extra feeds (a side channel -- NOT on the flowsheet graph,
        // so the plant-boundary balance misses them; prefer `inputs (...)` streams).
        if (operDict->found("feeds"))
            for (const auto& fe : operDict->lookupDictList("feeds"))
            {
                const std::size_t st = static_cast<std::size_t>(fe->lookupScalar("stage"));
                if (st < 1 || st > N)
                    throw std::runtime_error("DistillationColumn: a feed `stage` is out of range.");
                const scalar Ff = fe->lookupScalar("F", Dims::molarFlow);
                const scalar qf = fe->lookupScalarOrDefault("quality", 1.0);
                const scalar Tfe = fe->lookupScalarOrDefault("T", Tf, Dims::temperature);
                addFeed(st - 1, Ff, qf, Tfe, readComp(fe->subDict("composition")));
            }
    }
    // side draws:  sideDraws ( { stage k; phase liquid|vapor; rate ..; } ... )
    std::size_t nDraws = 0;
    if (operDict->found("sideDraws"))
        for (const auto& dr : operDict->lookupDictList("sideDraws"))
        {
            const std::size_t st = static_cast<std::size_t>(dr->lookupScalar("stage"));
            if (st < 1 || st > N)
                throw std::runtime_error("DistillationColumn: a sideDraw `stage` is out of range.");
            const scalar rate = dr->lookupScalar("rate", Dims::molarFlow);
            const std::string ph = dr->lookupWordOrDefault("phase", "liquid");
            if (ph == "vapor" || ph == "vapour" || ph == "V") Wdraw[st - 1] += rate;
            else                                              Udraw[st - 1] += rate;
            ++nDraws;
        }

    // resolve merged feed composition / quality per stage
    std::vector<scalar>  qfeed(N, 1.0), feedT(N, Tf);
    std::vector<sVector> zfeed(N, sVector(n, 0.0));
    for (std::size_t j = 0; j < N; ++j)
        if (Ffeed[j] > 0.0)
        {
            qfeed[j] = feedLiq[j] / Ffeed[j];
            feedT[j] = feedTmol[j] / Ffeed[j];
            for (std::size_t i = 0; i < n; ++i) zfeed[j][i] = feedComp[j][i] / Ffeed[j];
        }

    // ---- CMO flow profile L[j] (down), V[j] (up) -----------------------
    std::vector<scalar> L(N, 0.0), V(N, 0.0);
    L[0] = R * D;                                  // reflux
    for (std::size_t j = 1; j < N; ++j) L[j] = L[j-1] + qfeed[j]*Ffeed[j] - Udraw[j];
    if (N > 1) V[1] = (R + 1.0) * D;               // vapour into the total condenser
    for (std::size_t j = 1; j + 1 < N; ++j) V[j+1] = V[j] - (1.0 - qfeed[j])*Ffeed[j] + Wdraw[j];

    scalar totFeed = 0.0, totDraw = 0.0;
    for (std::size_t j = 0; j < N; ++j) { totFeed += Ffeed[j]; totDraw += Udraw[j] + Wdraw[j]; }
    const scalar Bf = totFeed - D - totDraw;       // bottoms by overall balance
    if (Bf <= 0.0)
        throw InfeasibleTrial("DistillationColumn(simultaneous): B = sumF - D - sumDraws <= 0 (infeasible trial)");
    for (std::size_t j = 1; j < N; ++j)
        if (V[j] <= 0.0 || L[j] < 0.0)
            throw std::runtime_error("DistillationColumn(simultaneous): a stage vapour/liquid "
                "flow went non-positive (a feed/draw combination starves the column).");

    // ---- Optional reaction: equilibrium reactive distillation ----------
    //  Mole-conserving (Σν = 0) reactions only (esterification, transester.):
    //  total moles are preserved, so the CMO flow profile above is untouched.
    //  Each reactive stage gains ONE unknown -- the molar extent ξ_j -- closed
    //  by an activity-based equilibrium residual  Σ_i ν_i ln(γ_i x_i) = ln K_a.
    //  The reaction HEAT is NOT fed back into the CMO flows: this is the honest
    //  bubble-point SCREENING model for reactive distillation; the full energy
    //  coupling is the deferred full-MESH step.
    sVector nu(n, 0.0);
    std::vector<std::size_t> rxStages;
    scalar Ka298 = 1.0, dHrxn = 0.0;               // K_a(T) = Ka298·exp(-dHrxn/R·(1/T − 1/298.15))
    bool   kinetic = false, adsorption = false;    // kinetic (rate) vs equilibrium mode
    scalar kfA = 0.0, kfEa = 0.0, krA = 0.0, krEa = 0.0, mCatPerStage = 0.0;
    sVector Kads(n, 0.0);                           // adsorption equilibrium constants
    const bool reactive = dict->found("reaction");
    if (reactive)
    {
        auto rx = dict->subDict("reaction");
        for (const auto& s : rx->lookupDictList("stoichiometry"))
            nu[thermo.indexOf(s->lookupWord("component"))] = s->lookupScalar("nu");
        scalar sumNu = 0.0; for (auto v : nu) sumNu += v;
        if (std::abs(sumNu) > 1.0e-9)
            throw std::runtime_error("DistillationColumn: reactive distillation here "
                "supports mole-conserving (Sum nu = 0) reactions only (e.g. esterification). "
                "A Sum nu != 0 reaction changes the internal flows and needs the full-MESH "
                "energy balance, which this method does not yet carry.");
        for (auto v : rx->lookupList("reactiveStages"))
            rxStages.push_back(static_cast<std::size_t>(v) - 1);
        if (rx->found("kinetics"))                 // KINETIC (rate-limited) reactive distillation
        {
            kinetic = true;
            auto kin = rx->subDict("kinetics");
            adsorption = (kin->lookupWordOrDefault("model", "pseudoHomogeneous") == "adsorption");
            auto fwd = kin->subDict("forward"); kfA = fwd->lookupScalar("A"); kfEa = fwd->lookupScalar("Ea");
            auto rev = kin->subDict("reverse"); krA = rev->lookupScalar("A"); krEa = rev->lookupScalar("Ea");
            if (adsorption)
                for (const auto& a : kin->lookupDictList("adsorption"))
                    Kads[thermo.indexOf(a->lookupWord("component"))] = a->lookupScalar("K");
            const scalar mCatTot = kin->lookupScalar("catalystMass", Dims::mass);   // kg total
            mCatPerStage = (!rxStages.empty()) ? mCatTot * 1000.0 / rxStages.size() : 0.0;  // g/stage
        }
        else                                       // EQUILIBRIUM reactive distillation
        {
            auto eq = rx->subDict("equilibrium");
            if (eq->found("Ka298"))                // van't Hoff form
            { Ka298 = eq->lookupScalar("Ka298"); dHrxn = eq->lookupScalarOrDefault("dHrxn", 0.0); }
            else                                   // constant K_a
            { Ka298 = eq->lookupScalar("Ka"); dHrxn = 0.0; }
        }
    }
    auto KaAt = [&](scalar T) {                    // van't Hoff (constant Δh°_r)
        return Ka298 * std::exp(-dHrxn / 8.314462 * (1.0/T - 1.0/298.15));
    };
    const std::size_t nRx = rxStages.size();
    std::vector<int> extentOf(N, -1);
    for (std::size_t k = 0; k < nRx; ++k) extentOf[rxStages[k]] = static_cast<int>(k);

    const std::size_t nv = n;                      // vars per stage
    const std::size_t nExtents = kinetic ? 0 : nRx; // kinetic: extent is COMPUTED, not an unknown
    const std::size_t nU = N * nv + nExtents;

    // Reaction rate r [mol/(g_cat·s)] at a stage (pseudo-homogeneous or adsorption
    // LHHW).  a_i = γ_i x_i; for the adsorption model a'_i = K_i a_i / M_i and the
    // rate is divided by (Σ a'_i)².  Forward over reactants (ν<0), reverse over
    // products (ν>0).  The stage extent is then r · m_cat (per stage).
    auto rateAt = [&](const sVector& xj, scalar Tj, const sVector& gam) -> scalar {
        const scalar Rg = 8.314462;
        const scalar kf = kfA * std::exp(-kfEa / (Rg * Tj));
        const scalar kr = krA * std::exp(-krEa / (Rg * Tj));
        scalar af = 1.0, ar = 1.0, sumA = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            scalar a = std::max(gam[i] * xj[i], 0.0);
            if (adsorption) a = Kads[i] * a / thermo.comp(i).MW();   // a'_i
            sumA += a;
            if (a > 0.0)
            {
                if (nu[i] < 0.0) af *= std::pow(a, -nu[i]);
                if (nu[i] > 0.0) ar *= std::pow(a,  nu[i]);
            }
            else if (nu[i] < 0.0) af = 0.0;        // a reactant absent -> no forward rate
        }
        scalar r = kf * af - kr * ar;
        if (adsorption) r /= std::max(sumA * sumA, 1.0e-300);
        return r;
    };

    // Pack/unpack u = [x_{0,0..n-2}, T_0, x_{1,...}, T_1,...].
    auto unpack = [&](const sVector& u, std::size_t j, sVector& xj, scalar& Tj) {
        xj.assign(n, 0.0);
        scalar s = 0.0;
        for (std::size_t i = 0; i + 1 < n; ++i) { xj[i] = u[j*nv + i]; s += xj[i]; }
        xj[n-1] = 1.0 - s;
        Tj = u[j*nv + (n-1)];
    };

    // Residual: n-1 component balances + bubble-point per stage (+ reaction).
    //  rxnActive is a HOMOTOPY switch: phase 1 solves the column with the
    //  reaction OFF (extents driven to 0 -- robust, converges in a few iters);
    //  phase 2 turns the reaction ON, seeded from the converged non-reactive
    //  profile.  This is the standard way to converge reactive distillation.
    bool rxnActive = false;
    scalar mCatScale = 1.0;                            // catalyst-mass continuation (kinetic mode)
    auto residual = [&](const sVector& u) -> sVector {
        std::vector<sVector> x(N), y(N), K(N);
        sVector T(N);
        for (std::size_t j = 0; j < N; ++j) {
            unpack(u, j, x[j], T[j]);
            K[j] = thermo.Kvec(T[j], P, x[j], x[j]);
            y[j].assign(n, 0.0);
            for (std::size_t i = 0; i < n; ++i) y[j][i] = K[j][i] * x[j][i];
        }
        sVector g(nU, 0.0);
        for (std::size_t j = 0; j < N; ++j) {
            const int ext = reactive ? extentOf[j] : -1;
            scalar xi = 0.0;                               // molar extent on stage j [kmol/s]
            if (ext >= 0 && rxnActive)
            {
                if (kinetic)                               // computed from the rate × catalyst mass
                {
                    const sVector gam = thermo.activity().gamma(T[j], x[j]);
                    xi = rateAt(x[j], T[j], gam) * mCatPerStage * mCatScale / 1000.0;
                }
                else
                    xi = u[N*nv + ext];                    // equilibrium: a free unknown
            }
            for (std::size_t i = 0; i + 1 < n; ++i) {       // M_{j,i}  (out − in − generation)
                scalar m;
                if (j == 0)                                  // total condenser
                    m = L[0]*x[0][i] + D*y[0][i] - V[1]*y[1][i];
                else if (j == N-1)                           // partial reboiler
                    m = V[N-1]*y[N-1][i] + Bf*x[N-1][i]
                        + Udraw[N-1]*x[N-1][i] + Wdraw[N-1]*y[N-1][i]
                        - L[N-2]*x[N-2][i] - Ffeed[N-1]*zfeed[N-1][i];
                else                                         // any interior stage
                    m = (L[j] + Udraw[j])*x[j][i] + (V[j] + Wdraw[j])*y[j][i]
                        - L[j-1]*x[j-1][i] - V[j+1]*y[j+1][i] - Ffeed[j]*zfeed[j][i];
                if (ext >= 0) m -= nu[i] * xi;              // reaction generation ν_i·ξ_j
                g[j*nv + i] = m;
            }
            scalar sy = 0.0;                                // E_j: Σ y − 1
            for (std::size_t i = 0; i < n; ++i) sy += y[j][i];
            g[j*nv + (n-1)] = sy - 1.0;
        }
        // Reactive-stage equilibrium residuals:  Σ_i ν_i ln(γ_i x_i) − ln K_a = 0.
        // (Kinetic mode has no extent unknowns -- the extent is computed above.)
        if (reactive && !kinetic)
            for (std::size_t k = 0; k < nRx; ++k)
            {
                if (!rxnActive) { g[N*nv + k] = u[N*nv + k]; continue; }   // phase 1: ξ_k -> 0
                const std::size_t j = rxStages[k];
                const sVector gam = thermo.activity().gamma(T[j], x[j]);
                scalar lnQ = 0.0;
                for (std::size_t i = 0; i < n; ++i)
                    if (nu[i] != 0.0)
                        lnQ += nu[i] * std::log(std::max(gam[i] * x[j][i], 1.0e-300));
                g[N*nv + k] = lnQ - std::log(KaAt(T[j]));
            }
        return g;
    };

    // Initial guess: linear T, feed composition at every stage; extents ξ_j = 0.
    //  Non-reactive: the primary feed z + a Tf-anchored ramp (unchanged).
    //  Reactive: the AVERAGED feed composition blended toward uniform (so all
    //  species, incl. products, are present -- avoids ln(0) in the equilibrium
    //  residual) and a T ramp spanning the components' boiling points (the cold
    //  feed T is a poor anchor for a hot reactive column).
    sVector zGuess = z;
    scalar Ttop = Tf - 5.0, Tbot = Tf + 15.0;
    if (reactive)
    {
        sVector zAvg(n, 0.0); scalar Ftot = 0.0;
        for (std::size_t j = 0; j < N; ++j)
        { for (std::size_t i = 0; i < n; ++i) zAvg[i] += Ffeed[j]*zfeed[j][i]; Ftot += Ffeed[j]; }
        if (Ftot > 0.0) for (auto& v : zAvg) v /= Ftot;
        zGuess.assign(n, 0.0);
        for (std::size_t i = 0; i < n; ++i) zGuess[i] = 0.5*zAvg[i] + 0.5/static_cast<scalar>(n);
        scalar tbMin = 1.0e9, tbMax = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        { const scalar tb = thermo.comp(i).Tb();
          if (tb > 0.0) { tbMin = std::min(tbMin, tb); tbMax = std::max(tbMax, tb); } }
        if (tbMax > tbMin) { Ttop = tbMin; Tbot = tbMax; }
    }
    sVector u0(nU, 0.0);
    for (std::size_t j = 0; j < N; ++j) {
        const scalar a = static_cast<scalar>(j) / static_cast<scalar>(N - 1);
        for (std::size_t i = 0; i + 1 < n; ++i) u0[j*nv + i] = zGuess[i];
        u0[j*nv + (n-1)] = Ttop + a * (Tbot - Ttop);
    }

    solver::NDOptions opts;
    opts.tolerance = 1.0e-9;
    opts.maxIter   = 80;
    opts.parallel  = true;     // the MESH residual is a pure function (thread-safe)
    if (verbosity >= 3)
        opts.onIter = [this](const solver::NDTrace& tr) {
            recordResidual(tr.normF);
        };
    auto res = solver::newtonND(residual, u0, opts);   // phase 1: reaction OFF (robust)
    if (reactive)
    {
        rxnActive = true;                              // phase 2: reaction ON, seeded from phase 1
        if (kinetic)                                   // ramp the catalyst mass (continuation):
            for (scalar s : {0.01, 0.05, 0.2, 0.5, 1.0})   // a fast rate is stiff if switched on whole
            { mCatScale = s; res = solver::newtonND(residual, res.x, opts); }
        else
            res = solver::newtonND(residual, res.x, opts);
    }

    std::vector<sVector> x(N);
    sVector T(N);
    for (std::size_t j = 0; j < N; ++j) unpack(res.x, j, x[j], T[j]);

    // ===== FULL-MESH refinement (Naphtali-Sandholm) =========================
    // `model fullMESH`: promote V_j, L_j to UNKNOWNS and add the per-stage TOTAL-
    // mass + ENERGY balances, SEEDED from the converged CMO profile (the cheap
    // bubble-point model bootstraps the rigorous one -- Vitor's idea).  The energy
    // balance lets V_j, L_j follow the REAL latent heats instead of assuming
    // equimolal overflow -> the enthalpy residual the CMO never carried.  Total
    // condenser: V_0=0, L_0=R*D; reboiler: L_{N-1}=B; their energy balances give
    // Q post-hoc.  Reactive full-MESH is not wired yet (keeps the CMO profile).
    const std::string fmModel = dict->lookupWordOrDefault(
        "model", operDict->lookupWordOrDefault("method", "WangHenke"));
    if ((fmModel == "fullMESH" || fmModel == "MESH"
         || fmModel == "NaphtaliSandholm") && !reactive)
    {
        const std::size_t mv = n + 2;              // x_{0..n-2}, T, V, L per stage
        const std::size_t mU = N * mv;
        auto unpackF = [&](const sVector& w, std::size_t j, sVector& xj,
                           scalar& Tj, scalar& Vj, scalar& Lj) {
            xj.assign(n, 0.0); scalar s = 0.0;
            for (std::size_t i = 0; i + 1 < n; ++i) { xj[i] = w[j*mv+i]; s += xj[i]; }
            xj[n-1] = 1.0 - s;
            Tj = w[j*mv + (n-1)]; Vj = w[j*mv + n]; Lj = w[j*mv + n+1];
        };
        auto residualF = [&](const sVector& w) -> sVector {
            std::vector<sVector> xs(N), ys(N);
            sVector Ts(N), Vs(N), Ls(N);
            for (std::size_t j = 0; j < N; ++j) {
                unpackF(w, j, xs[j], Ts[j], Vs[j], Ls[j]);
                const auto Kj = thermo.Kvec(Ts[j], P, xs[j], xs[j]);
                ys[j].assign(n, 0.0);
                for (std::size_t i = 0; i < n; ++i) ys[j][i] = Kj[i]*xs[j][i];
            }
            auto hL = [&](const sVector& xx, scalar TT){ return thermo.Hliquid(TT, xx); };
            auto hV = [&](const sVector& yy, scalar TT){ return thermo.Hvapour(TT, yy); };
            sVector g(mU, 0.0);
            for (std::size_t j = 0; j < N; ++j) {
                for (std::size_t i = 0; i + 1 < n; ++i) {        // component balances
                    scalar m;
                    if (j == 0)
                        m = Ls[0]*xs[0][i] + D*ys[0][i] - Vs[1]*ys[1][i];
                    else if (j == N-1)
                        m = Vs[N-1]*ys[N-1][i] + Ls[N-1]*xs[N-1][i]
                            + Udraw[N-1]*xs[N-1][i] + Wdraw[N-1]*ys[N-1][i]
                            - Ls[N-2]*xs[N-2][i] - Ffeed[N-1]*zfeed[N-1][i];
                    else
                        m = (Ls[j]+Udraw[j])*xs[j][i] + (Vs[j]+Wdraw[j])*ys[j][i]
                            - Ls[j-1]*xs[j-1][i] - Vs[j+1]*ys[j+1][i] - Ffeed[j]*zfeed[j][i];
                    g[j*mv + i] = m;
                }
                scalar sy = 0.0; for (std::size_t i = 0; i < n; ++i) sy += ys[j][i];
                g[j*mv + (n-1)] = sy - 1.0;                       // summation
                if (j == 0)                                       // total mass / condenser V_0=0
                    g[j*mv + n] = Vs[0];
                else if (j == N-1)
                    g[j*mv + n] = Vs[N-1] + Ls[N-1] + Udraw[N-1] + Wdraw[N-1]
                                - Ls[N-2] - Ffeed[N-1];
                else
                    g[j*mv + n] = Ls[j] + Vs[j] + Udraw[j] + Wdraw[j]
                                - Ls[j-1] - Vs[j+1] - Ffeed[j];
                if (j == 0)                                        // energy / flow specs
                    g[j*mv + n+1] = Ls[0] - R*D;                   // reflux spec
                else if (j == N-1)
                    g[j*mv + n+1] = Ls[N-1] - Bf;                  // bottoms spec
                else {                                             // ENERGY balance (enthalpy residual)
                    const scalar hFj = (Ffeed[j] > 0.0)
                        ? qfeed[j]*hL(zfeed[j], feedT[j]) + (1.0-qfeed[j])*hV(zfeed[j], feedT[j])
                        : 0.0;
                    g[j*mv + n+1] =
                          Ls[j-1]*hL(xs[j-1],Ts[j-1]) + Vs[j+1]*hV(ys[j+1],Ts[j+1])
                        + Ffeed[j]*hFj
                        - (Ls[j]+Udraw[j])*hL(xs[j],Ts[j]) - (Vs[j]+Wdraw[j])*hV(ys[j],Ts[j]);
                }
            }
            return g;
        };
        sVector w0(mU, 0.0);                                       // seed from the CMO profile
        for (std::size_t j = 0; j < N; ++j) {
            for (std::size_t i = 0; i + 1 < n; ++i) w0[j*mv+i] = x[j][i];
            w0[j*mv + (n-1)] = T[j];  w0[j*mv + n] = V[j];  w0[j*mv + n+1] = L[j];
        }
        solver::NDOptions optsF;
        optsF.tolerance = 1.0e-7; optsF.maxIter = 60; optsF.parallel = true;
        if (verbosity >= 3)
            optsF.onIter = [this](const solver::NDTrace& tr){ recordResidual(tr.normF); };
        auto resF = solver::newtonND(residualF, w0, optsF);
        for (std::size_t j = 0; j < N; ++j) unpackF(resF.x, j, x[j], T[j], V[j], L[j]);
        if (!resF.converged) res.converged = false;
        if (verbosity >= 2)
            std::cerr << "  full-MESH (Naphtali-Sandholm): "
                      << (resF.converged ? "converged" : "NOT converged")
                      << " in " << resF.iterations << " iters, ||F|| = " << resF.residual
                      << "  (V,L now energy-consistent, not CMO)\n";
    }
    // ========================================================================

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
    // side draws (in stage order): a liquid draw leaves at x[j], a vapour draw at y[j].
    for (std::size_t j = 0; j < N; ++j)
    {
        if (Udraw[j] > 0.0)
        {
            ProcessStream s; s.name = "liquidDraw_" + std::to_string(j + 1);
            s.F = Udraw[j]; s.T = T[j]; s.P = P; s.z = x[j]; s.vf = 0.0;
            produced_.push_back(s);
        }
        if (Wdraw[j] > 0.0)
        {
            const auto Kj = thermo.Kvec(T[j], P, x[j], x[j]);
            sVector yj(n, 0.0); scalar sy = 0.0;
            for (std::size_t i = 0; i < n; ++i) { yj[i] = Kj[i]*x[j][i]; sy += yj[i]; }
            if (sy > 0.0) for (auto& v : yj) v /= sy;
            ProcessStream s; s.name = "vaporDraw_" + std::to_string(j + 1);
            s.F = Wdraw[j]; s.T = T[j]; s.P = P; s.z = yj; s.vf = 1.0;
            produced_.push_back(s);
        }
    }

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

    // Reactive distillation: total extent + conversion of the limiting reactant.
    if (reactive)
    {
        scalar extentTot = 0.0;
        for (std::size_t k = 0; k < nRx; ++k)
        {
            const std::size_t j = rxStages[k];
            if (kinetic)                                   // recompute from the converged profile
                extentTot += rateAt(x[j], T[j], thermo.activity().gamma(T[j], x[j]))
                             * mCatPerStage / 1000.0;
            else
                extentTot += res.x[N*nv + k];
        }
        // limiting reactant = the fed reactant (nu<0) with the least feed.
        std::size_t iLim = n; scalar fedLim = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            if (nu[i] >= 0.0) continue;
            scalar fed = 0.0;
            for (std::size_t j = 0; j < N; ++j) fed += Ffeed[j] * zfeed[j][i];
            if (iLim == n || fed < fedLim) { iLim = i; fedLim = fed; }
        }
        const scalar consumed = (iLim < n) ? -nu[iLim] * extentTot : 0.0;
        kpis_["reactionExtent"]   = extentTot;                       // kmol/s
        kpis_["conversion"]       = (fedLim > 0.0) ? consumed / fedLim : 0.0;
        if (verbosity >= 2 && iLim < n)
            std::cout << "  Reaction: Σξ = " << std::scientific << std::setprecision(3)
                      << (extentTot*3600.0) << " kmol/h,  conversion of "
                      << thermo.comp(iLim).name() << " = " << std::fixed
                      << std::setprecision(1) << (100.0 * consumed / std::max(fedLim,1e-30))
                      << " %  ("
                      << (kinetic ? (adsorption ? "adsorption (LHHW) kinetics"
                                                : "pseudo-homogeneous kinetics")
                                  : "equilibrium")
                      << ", " << nRx << " reactive stages)\n";
    }

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
        // products out (distillate + bottoms + every side draw) minus feeds in.
        scalar Hout = H(D, T[0], 0.0, xD) + H(Bf, T[N-1], 0.0, x[N-1]);
        for (std::size_t j = 0; j < N; ++j)
        {
            if (Udraw[j] > 0.0) Hout += H(Udraw[j], T[j], 0.0, x[j]);
            if (Wdraw[j] > 0.0)
            {
                const auto Kj = thermo.Kvec(T[j], P, x[j], x[j]);
                sVector yj(n, 0.0); scalar sy = 0.0;
                for (std::size_t i = 0; i < n; ++i) { yj[i] = Kj[i]*x[j][i]; sy += yj[i]; }
                if (sy > 0.0) for (auto& v : yj) v /= sy;
                Hout += H(Wdraw[j], T[j], 1.0, yj);
            }
        }
        scalar Hin = 0.0;
        for (std::size_t j = 0; j < N; ++j)
            if (Ffeed[j] > 0.0) Hin += H(Ffeed[j], feedT[j], 1.0 - qfeed[j], zfeed[j]);
        const scalar dH = Hout - Hin;
        kpis_["Q_condenser_kW"] = Q_cond;
        kpis_["Q_reboiler_kW"]  = dH - Q_cond;
        kpis_["nFeeds"]         = static_cast<scalar>(
            std::count_if(Ffeed.begin(), Ffeed.end(), [](scalar v){ return v > 0.0; }));
        kpis_["nSideDraws"]     = static_cast<scalar>(nDraws);
    }

    // ---- Optional sieve-tray hydraulics ------------------------------
    //  Here V[j] and L[j] are the solver's own per-stage traffic.  V[0] = 0
    //  identifies the total condenser; the reboiler is the last stage.  Both
    //  drop out of the tray list on their own.
    {
        std::vector<sVector> yAll(N, sVector(n, 0.0));
        for (std::size_t j = 0; j < N; ++j)
        {
            const auto Kj = thermo.Kvec(T[j], P, x[j], x[j]);
            scalar sy = 0.0;
            for (std::size_t i = 0; i < n; ++i) { yAll[j][i] = Kj[i] * x[j][i]; sy += yAll[j][i]; }
            if (sy > 0.0) for (auto& v : yAll[j]) v /= sy;
        }
        std::vector<scalar> Vs = V, Ls = L;
        Vs[N-1] = 0.0;                     // the reboiler is not a tray
        hydraulicsPass(operDict, thermo, P, T, x, yAll, Vs, Ls, verbosity);
    }

    return res.converged ? 0 : 1;
}

void DistillationColumn::hydraulicsPass(const DictPtr&              operDict,
                                        const ThermoPackage&        thermo,
                                        scalar                      P,
                                        const std::vector<scalar>&  T,
                                        const std::vector<sVector>& x,
                                        const std::vector<sVector>& y,
                                        const std::vector<scalar>&  V,
                                        const std::vector<scalar>&  L,
                                        int                         verbosity)
{
    if (!operDict->found("hydraulics")) return;

    const auto geo = TrayHydraulics::readGeometry(operDict->subDict("hydraulics"));
    const auto res = TrayHydraulics::evaluate(thermo, P, T, x, y, V, L, geo);
    if (res.stages.empty()) return;

    TrayHydraulics::report(res, geo, verbosity);

    kpis_["diameter"]          = res.diameter;
    kpis_["floodApproach_max"] = res.floodApproachMax;
    kpis_["floodStage"]        = static_cast<scalar>(res.floodStage);
    kpis_["dP_column_kPa"]     = res.dPColumn / 1000.0;
    kpis_["downcomerBackup_max_mm"] = res.backupMax;
    kpis_["downcomerFloodStages"]   = static_cast<scalar>(res.nDcFlood);
    if (res.weepChecked) kpis_["weepingStages"] = static_cast<scalar>(res.nWeeping);

    // The profile carries one row per stage; a non-tray stage (condenser,
    // reboiler) leaves zeros rather than pretending to have hydraulics.
    const std::size_t N = T.size();
    auto& fa = profile_.columns["floodApproach"];
    auto& dp = profile_.columns["dP_Pa"];
    auto& hb = profile_.columns["h_backup_mm"];
    fa.assign(N, 0.0); dp.assign(N, 0.0); hb.assign(N, 0.0);
    for (const auto& st : res.stages)
    {
        fa[st.index - 1] = st.floodApproach;
        dp[st.index - 1] = st.dP;
        hb[st.index - 1] = st.h_b;
    }
}

} // namespace Choupo
