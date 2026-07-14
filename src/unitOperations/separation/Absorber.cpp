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

#include "Absorber.H"
#include "thermo/henrysLaw/HenrysLawRegistry.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

// Thomas algorithm for a tridiagonal system a_j x_{j-1} + b_j x_j +
// c_j x_{j+1} = d_j  (a_0 and c_{N-1} unused).  No library.
static std::vector<scalar> thomasSolve(std::vector<scalar> a,
                                       std::vector<scalar> b,
                                       std::vector<scalar> c,
                                       std::vector<scalar> d)
{
    const int N = static_cast<int>(b.size());
    for (int j = 1; j < N; ++j)
    {
        const scalar m = a[j] / b[j - 1];
        b[j] -= m * c[j - 1];
        d[j] -= m * d[j - 1];
    }
    std::vector<scalar> x(N, 0.0);
    x[N - 1] = d[N - 1] / b[N - 1];
    for (int j = N - 2; j >= 0; --j)
        x[j] = (d[j] - c[j] * x[j + 1]) / b[j];
    return x;
}

int Absorber::solve(const DictPtr& dict,
                    const ThermoPackage& thermo,
                    int verbosity)
{
    // ---- Two inputs: gas feed (bottom) + lean solvent (top) -------------
    auto ins = dict->lookupDictList("inputStreams");
    if (ins.size() != 2)
        throw std::runtime_error("Absorber: expected exactly 2 input streams"
            " (gas feed + lean solvent); got " + std::to_string(ins.size())
            + ".  Declare in flowsheetDict as  inputs (gasName solventName );");
    const std::size_t n = thermo.n();

    auto readStream = [&](const DictPtr& sd, sVector& z,
                          scalar& F, scalar& T, scalar& P)
    {
        F = sd->lookupScalar("F", Dims::molarFlow);
        T = sd->lookupScalar("T", Dims::temperature);
        P = sd->lookupScalar("P", Dims::pressure);
        z.assign(n, 0.0);
        auto cd = sd->subDict("composition");
        scalar s = 0.0;
        for (const auto& k : cd->keys()) { z[thermo.indexOf(k)] = cd->lookupScalar(k); }
        for (auto v : z) s += v;
        if (s > 0.0) for (auto& v : z) v /= s;
    };

    sVector y_in(n), x_in(n);
    scalar V_in = 0, T_gas = 0, P_gas = 0, L_in = 0, T_sol = 0, P_sol = 0;
    readStream(ins[0], y_in, V_in, T_gas, P_gas);
    readStream(ins[1], x_in, L_in, T_sol, P_sol);
    if (V_in <= 0.0) throw std::runtime_error("Absorber: gas feed F must be > 0");
    if (L_in <= 0.0) throw std::runtime_error("Absorber: solvent F must be > 0");

    auto oper = dict->subDict("operation");
    const int N = static_cast<int>(std::lround(oper->lookupScalar("stages")));
    if (N < 1) throw std::runtime_error("Absorber: `stages` must be >= 1");
    const scalar P = P_gas;

    // ---- Classify components -------------------------------------------
    //  solute: role solute WITH a Henry entry -> transfers gas<->liquid,
    //            solved by the stage tridiagonal.
    //  solvent : the named solvent -> stays in the liquid (no evaporation),
    //            its mole fraction is set BY DIFFERENCE so Σx = 1.
    //  inert : everything else present in the gas -> stays in the gas.
    const std::string& solv = thermo.solventName();
    const std::size_t iSolv = solv.empty() ? n : thermo.indexOf(solv);
    std::vector<bool> isSolute(n, false);
    for (std::size_t i = 0; i < n; ++i)
        isSolute[i] = (thermo.comp(i).role() == "solute" && !solv.empty()
                    && HenrysLawRegistry::has(thermo.comp(i).name(), solv));

    // ---- Energy data (heat-of-absorption balance; isothermal fallback) -
    const scalar T0 = 0.5 * (T_gas + T_sol);
    scalar Cp_L = 0.0, Cp_V = 0.0;
    if (iSolv < n && thermo.comp(iSolv).hasCpLiquid())
        Cp_L = thermo.comp(iSolv).cpLiquid().Cp(T0);
    for (std::size_t i = 0; i < n; ++i)
        if (thermo.comp(i).hasCpIdealGas())
            Cp_V += y_in[i] * thermo.comp(i).cpIdealGas().Cp(T0);
    sVector dHabs(n, 0.0);
    bool anyHeat = false;
    for (std::size_t i = 0; i < n; ++i)
        if (isSolute[i])
        {
            dHabs[i] = -HenrysLawRegistry::byPair(thermo.comp(i).name(), solv).dHdiss();
            if (std::abs(dHabs[i]) > 1.0) anyHeat = true;
        }
    const bool nonIso = (Cp_L > 0.0 && Cp_V > 0.0 && anyHeat);

    // ---- Coupled mass (solutes only) + energy, stage by stage ----------
    //  Stage 1 = top (lean solvent in, clean gas out), N = bottom.
    std::vector<scalar> Tprof(N, T0);
    std::vector<std::vector<scalar>> xs(n, std::vector<scalar>(N, 0.0)); // solute liquid frac (rel.)
    std::vector<std::vector<scalar>> ys(n, std::vector<scalar>(N, 0.0)); // solute gas frac (rel.)
    const scalar CL = L_in * Cp_L, CV = V_in * Cp_V;
    const int    maxIt = nonIso ? 200 : 1;
    const scalar relax = 0.5, tolT = 1.0e-3;
    int iters = 0;

    for (iters = 0; iters < maxIt; ++iters)
    {
        std::vector<sVector> Kstage(N);
        for (int j = 0; j < N; ++j) Kstage[j] = thermo.Kvec(Tprof[j], P, x_in, y_in);

        for (std::size_t i = 0; i < n; ++i)
        {
            if (!isSolute[i]) continue;
            bool ok = true;
            for (int j = 0; j < N && ok; ++j)
                if (!(Kstage[j][i] > 0.0) || !std::isfinite(Kstage[j][i])) ok = false;
            if (!ok) continue;
            std::vector<scalar> a(N, -L_in), b(N, 0.0), c(N, 0.0), d(N, 0.0);
            for (int j = 0; j < N; ++j)     b[j] = L_in + V_in * Kstage[j][i];
            for (int j = 0; j < N - 1; ++j) c[j] = -V_in * Kstage[j + 1][i];
            d[0]     = L_in * x_in[i];      // lean solvent feed (top)
            d[N - 1] = V_in * y_in[i];      // gas feed (bottom)
            xs[i] = thomasSolve(a, b, c, d);
            for (int j = 0; j < N; ++j) ys[i][j] = Kstage[j][i] * xs[i][j];
        }

        if (!nonIso) break;

        std::vector<scalar> Q(N, 0.0);
        for (int j = 0; j < N; ++j)
            for (std::size_t i = 0; i < n; ++i)
            {
                if (dHabs[i] == 0.0) continue;
                const scalar yBelow = (j == N - 1) ? y_in[i] : ys[i][j + 1];
                Q[j] += V_in * (yBelow - ys[i][j]) * dHabs[i];
            }
        std::vector<scalar> a(N, -CL), b(N, CL + CV), c(N, -CV), d = Q;
        d[0]     += CL * T_sol;
        d[N - 1] += CV * T_gas;
        std::vector<scalar> Tnew = thomasSolve(a, b, c, d);
        scalar dTmax = 0.0;
        for (int j = 0; j < N; ++j)
        {
            const scalar t = Tprof[j] + relax * (Tnew[j] - Tprof[j]);
            dTmax = std::max(dTmax, std::abs(t - Tprof[j]));
            Tprof[j] = t;
        }
        recordResidual(dTmax);
        if (dTmax < tolT) { ++iters; break; }
    }

    // ---- Molar flows per stage -> mole fractions (Σ = 1 by construction)
    //  solute: from the tridiagonal; solvent: constant in the liquid (no
    //  evaporation); inert: constant in the gas (no absorption).
    std::vector<std::vector<scalar>> gasMol(n, std::vector<scalar>(N, 0.0));
    std::vector<std::vector<scalar>> liqMol(n, std::vector<scalar>(N, 0.0));
    std::vector<std::vector<scalar>> xprof(n, std::vector<scalar>(N, 0.0));
    std::vector<std::vector<scalar>> yprof(n, std::vector<scalar>(N, 0.0));
    for (int j = 0; j < N; ++j)
    {
        scalar Vj = 0.0, Lj = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            if (isSolute[i])      { gasMol[i][j] = V_in * ys[i][j]; liqMol[i][j] = L_in * xs[i][j]; }
            else if (i == iSolv)  { liqMol[i][j] = L_in * x_in[i]; }       // solvent stays liquid
            else                  { gasMol[i][j] = V_in * y_in[i]; }       // inert stays gas
            Vj += gasMol[i][j]; Lj += liqMol[i][j];
        }
        for (std::size_t i = 0; i < n; ++i)
        {
            yprof[i][j] = (Vj > 0.0) ? gasMol[i][j] / Vj : 0.0;
            xprof[i][j] = (Lj > 0.0) ? liqMol[i][j] / Lj : 0.0;
        }
    }

    // ---- Outlet streams from the terminal stages (mass closes) ---------
    sVector gasOut(n, 0.0), liqOut(n, 0.0);
    for (std::size_t i = 0; i < n; ++i)
    {
        gasOut[i] = gasMol[i][0];        // clean gas leaves the TOP (stage 1)
        liqOut[i] = liqMol[i][N - 1];    // rich liquid leaves the BOTTOM (stage N)
    }
    scalar V_out = 0.0, L_out = 0.0;
    for (std::size_t i = 0; i < n; ++i) { V_out += gasOut[i]; L_out += liqOut[i]; }
    sVector y_out(n, 0.0), x_out(n, 0.0);
    for (std::size_t i = 0; i < n; ++i)
    {
        if (V_out > 0.0) y_out[i] = gasOut[i] / V_out;
        if (L_out > 0.0) x_out[i] = liqOut[i] / L_out;
    }

    // ---- Recovery, KPIs ------------------------------------------------
    const sVector Kref = thermo.Kvec(T_gas, P, x_in, y_in);   // at feed T
    sVector frac(n, 0.0);
    for (std::size_t i = 0; i < n; ++i)
    {
        const scalar in_i = V_in * y_in[i];
        if (in_i > 0.0) frac[i] = (in_i - gasOut[i]) / in_i;
    }
    const scalar T_top = Tprof.front(), T_bot = Tprof.back();

    produced_.clear();
    ProcessStream cg; cg.name = "cleanGas";
    cg.F = V_out; cg.T = T_top; cg.P = P; cg.z = y_out; cg.vf = 1.0;
    produced_.push_back(cg);
    ProcessStream rl; rl.name = "richLiquid";
    rl.F = L_out; rl.T = T_bot; rl.P = P; rl.z = x_out; rl.vf = 0.0;
    produced_.push_back(rl);

    kpis_.clear();
    kpis_["stages"]       = static_cast<scalar>(N);
    kpis_["V_in"]         = V_in;
    kpis_["L_in"]         = L_in;
    kpis_["L_over_V"]     = L_in / V_in;
    kpis_["F_cleanGas"]   = V_out;
    kpis_["F_richLiquid"] = L_out;
    kpis_["T_top"]        = T_top;
    kpis_["T_bottom"]     = T_bot;
    kpis_["dT_rise"]      = T_bot - T_sol;
    kpis_["nonIsothermal"]= nonIso ? 1.0 : 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        if (V_in * y_in[i] <= 0.0) continue;
        const std::string& nm = thermo.comp(i).name();
        kpis_["recovery_" + nm] = frac[i];
        kpis_["K_" + nm]        = Kref[i];
        kpis_["A_" + nm]        = (Kref[i] > 0.0) ? L_in / (Kref[i] * V_in) : 0.0;
    }

    // ---- Profile: stage, T, x_i, y_i (now Σ = 1 per stage) -------------
    UnitProfile prof;
    prof.xAxis = "stage";
    std::vector<scalar> stageAxis(N);
    for (int j = 0; j < N; ++j) stageAxis[j] = static_cast<scalar>(j + 1);
    prof.columns["stage"] = stageAxis;
    prof.columns["T_K"]   = Tprof;
    for (std::size_t i = 0; i < n; ++i)
    {
        if (V_in * y_in[i] <= 0.0 && L_in * x_in[i] <= 0.0) continue;
        const std::string& nm = thermo.comp(i).name();
        prof.columns["y_" + nm] = yprof[i];
        prof.columns["x_" + nm] = xprof[i];
    }
    profile_ = prof;

    // ---- Report --------------------------------------------------------
    if (verbosity >= 2)
    {
        std::cout << "\n========================  Absorber (Kremser)  ====================\n"
                  << "  Stages: N = " << N << "   (THEORETICAL equilibrium stages -- the case-declared hardware count)\n"
                  << "  Gas feed   V = " << std::scientific << std::setprecision(4) << V_in
                  << " kmol/s  (bottom, " << std::fixed << std::setprecision(1) << T_gas << " K)\n"
                  << "  Solvent    L = " << std::scientific << std::setprecision(4) << L_in
                  << " kmol/s  (top, lean, " << std::fixed << std::setprecision(1) << T_sol << " K)\n"
                  << "  L / V = " << std::setprecision(2) << (L_in / V_in)
                  << ",  P = " << std::setprecision(3) << (P / 1.0e5) << " bar\n";
        if (nonIso)
            std::cout << "  Energy balance ON: heat of absorption heats the column.\n"
                      << "  T: top = " << std::setprecision(2) << T_top << " K,  bottom = "
                      << T_bot << " K  (liquid +" << (T_bot - T_sol) << " K)  ["
                      << iters << " iters]\n";
        else
            std::cout << "  Isothermal (no Cp / heat-of-absorption data): T = "
                      << std::setprecision(2) << T0 << " K\n";
        std::cout << "  ------  per species in the gas  ------\n";
        for (std::size_t i = 0; i < n; ++i)
        {
            if (V_in * y_in[i] <= 0.0) continue;
            std::cout << "    " << std::setw(10) << thermo.comp(i).name()
                      << "   K(feed) = " << std::scientific << std::setprecision(3) << Kref[i]
                      << "   recovery = " << std::fixed << std::setprecision(1)
                      << (100.0 * frac[i]) << " %\n";
        }
        std::cout << "  Assumptions: counter-current, constant L/V (dilute),\n"
                  << "               lean solvent, no solvent evaporation,\n"
                  << "               Cp_L = solvent, Cp_V = feed gas.\n"
                  << "==================================================================\n\n";
    }
    return 0;
}

} // namespace Choupo
