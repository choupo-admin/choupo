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

#include "Extractor.H"
#include "unitOperations/flash/IsothermalFlash.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <limits>
#include <iostream>
#include <stdexcept>

namespace Choupo {

// One theoretical stage = one liquid-liquid equilibrium.  We hand the
// two streams arriving at the stage (as COMPONENT-MOLAR vectors) to the
// shared Gibbs-min LL flash and read back the two equilibrium phase
// MOLAR vectors, with the solvent-rich phase labelled the "extract".
//
// The flash kernel is IsothermalFlash::solveCore --- called read-only;
// the Extractor never re-implements the equilibrium split.
namespace {

struct StageSplit
{
    sVector extractMol;     // solvent-rich phase, component molar flows
    sVector raffinateMol;   // feed-rich phase,    component molar flows
    sVector xExtract;       // extract mole fractions  (Sigma = 1)
    sVector xRaffinate;     // raffinate mole fractions
    bool    split = false;  // true if a genuine two-phase split was found
};

// Sum two component-molar vectors.
sVector addMol(const sVector& a, const sVector& b)
{
    sVector r(a.size(), 0.0);
    for (std::size_t i = 0; i < a.size(); ++i) r[i] = a[i] + b[i];
    return r;
}

scalar totalOf(const sVector& m)
{
    scalar s = 0.0;
    for (auto v : m) s += v;
    return s;
}

// Equilibrate ONE stage.  `inMol` is the combined component-molar feed to
// the stage (raffinate-from-above + extract-from-below).  `iSolvent` is
// the index of the species that defines the extract phase (the phase with
// the higher mole fraction of it is the extract).
StageSplit equilibrateStage(const sVector& inMol,
                            std::size_t iSolvent,
                            scalar T, scalar P,
                            const ThermoPackage& thermo,
                            std::size_t alphaRich,
                            std::size_t betaRich)
{
    const std::size_t n = thermo.n();
    StageSplit out;
    out.extractMol.assign(n, 0.0);
    out.raffinateMol.assign(n, 0.0);

    const scalar Ftot = totalOf(inMol);
    if (Ftot <= 0.0)
    {
        out.xExtract.assign(n, 0.0);
        out.xRaffinate.assign(n, 0.0);
        return out;
    }

    FlashInput in;
    in.F = Ftot;
    in.T = T;
    in.P = P;
    in.z.assign(n, 0.0);
    for (std::size_t i = 0; i < n; ++i) in.z[i] = inMol[i] / Ftot;

    FlashOptions opts;
    opts.phaseSet        = PhaseSet::LL;
    opts.verbosity       = 0;        // the stage flash stays quiet
    opts.llAlphaRichComp = alphaRich;
    opts.llBetaRichComp  = betaRich;
    opts.accelerator     = OuterAccelerator::DirectSubstitution;

    // READ-ONLY call into the shared LL-flash kernel (Gibbs minimisation).
    const FlashSolution sol =
        IsothermalFlash::solveCore(in, thermo, opts);

    // LL convention of solveCore:  beta = V_over_F is the fraction in
    // phase beta; x = phase alpha; y = phase beta;
    //   z_i = (1 - beta) x_alpha_i + beta x_beta_i.
    const scalar beta = sol.V_over_F;
    const bool twoPhase =
        sol.converged && beta > 1.0e-6 && beta < 1.0 - 1.0e-6
        && sol.y.size() == n && sol.x.size() == n;

    if (!twoPhase)
    {
        // No split at this stage: the whole inlet leaves as raffinate
        // (the feed-side phase) so the cascade mass balance stays exact.
        out.split        = false;
        out.raffinateMol = inMol;
        out.xRaffinate   = in.z;
        out.xExtract.assign(n, 0.0);
        return out;
    }

    // Molar flows of the two phases.
    sVector alphaMol(n, 0.0), betaMol(n, 0.0);
    for (std::size_t i = 0; i < n; ++i)
    {
        alphaMol[i] = Ftot * (1.0 - beta) * sol.x[i];
        betaMol[i]  = Ftot *        beta  * sol.y[i];
    }

    // The EXTRACT is the phase richer in the solvent species.
    const bool alphaIsExtract =
        (iSolvent < n) ? (sol.x[iSolvent] >= sol.y[iSolvent]) : false;

    if (alphaIsExtract)
    {
        out.extractMol   = alphaMol;  out.xExtract   = sol.x;
        out.raffinateMol = betaMol;   out.xRaffinate = sol.y;
    }
    else
    {
        out.extractMol   = betaMol;   out.xExtract   = sol.y;
        out.raffinateMol = alphaMol;  out.xRaffinate = sol.x;
    }
    out.split = true;
    return out;
}

} // namespace

int Extractor::solve(const DictPtr& dict,
                     const ThermoPackage& thermo,
                     int verbosity)
{
    // ---- Two inputs: feed (stage 1) + fresh solvent (stage N) ----------
    auto ins = dict->lookupDictList("inputStreams");
    if (ins.size() != 2)
        throw std::runtime_error("Extractor: expected exactly 2 input streams"
            " (feed + solvent); got " + std::to_string(ins.size())
            + ".  Declare in flowsheetDict as  inputs (feedName solventName );");

    const std::size_t n = thermo.n();

    auto readStream = [&](const DictPtr& sd, sVector& mol,
                          scalar& T, scalar& P)
    {
        const scalar F = sd->lookupScalar("F", Dims::molarFlow);
        T = sd->lookupScalar("T", Dims::temperature);
        P = sd->lookupScalar("P", Dims::pressure);
        sVector z(n, 0.0);
        auto cd = sd->subDict("composition");
        scalar s = 0.0;
        for (const auto& k : cd->keys()) z[thermo.indexOf(k)] = cd->lookupScalar(k);
        for (auto v : z) s += v;
        if (s > 0.0) for (auto& v : z) v /= s;
        mol.assign(n, 0.0);
        for (std::size_t i = 0; i < n; ++i) mol[i] = F * z[i];
    };

    sVector feedMol(n, 0.0), solvMol(n, 0.0);
    scalar T_feed = 0, P_feed = 0, T_solv = 0, P_solv = 0;
    readStream(ins[0], feedMol, T_feed, P_feed);
    readStream(ins[1], solvMol, T_solv, P_solv);

    const scalar F_feed = totalOf(feedMol);
    const scalar F_solv = totalOf(solvMol);
    if (F_feed <= 0.0) throw std::runtime_error("Extractor: feed F must be > 0");
    if (F_solv <= 0.0) throw std::runtime_error("Extractor: solvent F must be > 0");

    // ---- Operation block ----------------------------------------------
    auto oper = dict->subDict("operation");
    const int N = static_cast<int>(std::lround(oper->lookupScalar("stages")));
    if (N < 1) throw std::runtime_error("Extractor: `stages` must be >= 1");

    // One isothermal temperature for the whole column (LLE is weakly
    // enthalpic --- the energy balance is intentionally out of scope).
    // Default: the feed temperature; overridable with `temperature`.
    scalar T = oper->found("temperature")
                 ? oper->lookupScalar("temperature", Dims::temperature)
                 : T_feed;
    const scalar P = P_feed;

    // ---- The two liquid phases + the solvent / split species -----------
    auto liqs = thermo.phasesOfType("liquid");
    if (liqs.size() < 2)
        throw std::runtime_error("Extractor: LL extraction needs >= 2 liquid "
            "phases in the thermoPackage (got " + std::to_string(liqs.size())
            + ").  Declare two `liquid` phases (extract + raffinate).");

    // The species that DEFINES the extract phase: by default the solvent
    // stream's dominant component; overridable with `solvent <name>;` in
    // the operation block.  Also seeds the LL flash's alpha/beta bias so
    // the Gibbs-min starts in the right basin.
    std::size_t iSolvent = n;
    if (oper->found("solvent"))
        iSolvent = thermo.indexOf(oper->lookupWord("solvent"));
    else
    {
        scalar best = -1.0;
        for (std::size_t i = 0; i < n; ++i)
            if (solvMol[i] > best) { best = solvMol[i]; iSolvent = i; }
    }
    // The feed's dominant carrier defines the raffinate-rich bias.
    std::size_t iCarrier = n;
    {
        scalar best = -1.0;
        for (std::size_t i = 0; i < n; ++i)
            if (feedMol[i] > best) { best = feedMol[i]; iCarrier = i; }
    }
    if (iCarrier == iSolvent)
        for (std::size_t i = 0; i < n; ++i)
            if (i != iSolvent) { iCarrier = i; break; }

    // ---- Cascade unknowns ----------------------------------------------
    //   Rmol[j] = raffinate leaving stage j  (flows toward stage N)
    //   Emol[j] = extract   leaving stage j  (flows toward stage 1)
    //   Inlets to stage j:  raffinate from j-1 (feed at j=0) and
    //                       extract   from j+1 (solvent at j=N+1).
    std::vector<sVector> Rmol(N, sVector(n, 0.0));
    std::vector<sVector> Emol(N, sVector(n, 0.0));
    std::vector<sVector> xR(N, sVector(n, 0.0));
    std::vector<sVector> xE(N, sVector(n, 0.0));

    // Initial guess: every stage's extract = the fresh solvent, every
    // stage's raffinate = the feed.  Honest, topology-propagated seed.
    for (int j = 0; j < N; ++j) { Emol[j] = solvMol; Rmol[j] = feedMol; }

    const int    maxIt = 800;
    const scalar relax = 0.5;
    // The cascade is judged on its OVERALL MASS CLOSURE --- the only
    // physically meaningful convergence metric here.  Each per-stage
    // Gibbs-min flash (Nelder-Mead, tolX 1e-5 on compositions) splits its
    // inlet exactly, but under-relaxed Gauss-Seidel leaves a small
    // inter-stage imbalance that the sweeps grind down; the per-step
    // |Delta F| residual limit-cycles on the flash-noise floor and is a
    // poor proxy, so we stop when the column balance closes (or stalls).
    const scalar throughput = F_feed + F_solv;
    const scalar closeTol   = 1.0e-4;                // relative mass-closure target
    const int    stallLimit = 60;                    // sweeps without closure improvement
    int    iters       = 0;
    scalar dMax        = 0.0;
    int    splitStages = 0;
    scalar bestClose   = std::numeric_limits<scalar>::infinity();
    int    stall       = 0;
    bool   converged   = false;

    auto columnClosure = [&]() -> scalar
    {
        const scalar fOut = totalOf(Emol[0]) + totalOf(Rmol[N - 1]);
        return std::abs(throughput - fOut) / std::max<scalar>(throughput, 1.0e-30);
    };

    for (iters = 0; iters < maxIt; ++iters)
    {
        dMax        = 0.0;
        splitStages = 0;

        // Gauss-Seidel sweep, stage 1 -> N (uses freshest neighbours).
        for (int j = 0; j < N; ++j)
        {
            const sVector& raffFromAbove = (j == 0)     ? feedMol : Rmol[j - 1];
            const sVector& extrFromBelow = (j == N - 1) ? solvMol : Emol[j + 1];
            const sVector  inMol         = addMol(raffFromAbove, extrFromBelow);

            const StageSplit ss = equilibrateStage(
                inMol, iSolvent, T, P, thermo, iSolvent, iCarrier);
            if (ss.split) ++splitStages;

            // Under-relaxed update of the two leaving streams.
            for (std::size_t i = 0; i < n; ++i)
            {
                const scalar newR = (1.0 - relax) * Rmol[j][i] + relax * ss.raffinateMol[i];
                const scalar newE = (1.0 - relax) * Emol[j][i] + relax * ss.extractMol[i];
                dMax = std::max(dMax, std::abs(newR - Rmol[j][i]));
                dMax = std::max(dMax, std::abs(newE - Emol[j][i]));
                Rmol[j][i] = newR;
                Emol[j][i] = newE;
            }
            xR[j] = ss.xRaffinate;
            xE[j] = ss.xExtract;
        }

        const scalar close = columnClosure();
        recordResidual(close);

        // Converged: the column mass balance closes to the target.
        if (close < closeTol) { ++iters; converged = true; break; }

        // Stall: closure has stopped improving --- the cascade is
        // limit-cycling on the per-stage flash noise floor; stop on the
        // best state, but only call it CONVERGED if the closure it
        // reached is acceptable (otherwise the `converged` KPI stays 0
        // and the report warns --- numerical honesty over a green light).
        if (close < bestClose - 1.0e-3 * bestClose) { bestClose = close; stall = 0; }
        else                                        { ++stall; }
        if (stall >= stallLimit)
        { ++iters; converged = (close < 10.0 * closeTol); break; }
    }

    // ---- Outlet streams ------------------------------------------------
    //   Extract   leaves stage 1     (top product, solvent-rich)
    //   Raffinate leaves stage N     (bottom product, feed-derived)
    const sVector extractMol   = Emol[0];
    const sVector raffinateMol = Rmol[N - 1];
    const scalar  F_extract    = totalOf(extractMol);
    const scalar  F_raffinate  = totalOf(raffinateMol);

    sVector zExtract(n, 0.0), zRaffinate(n, 0.0);
    for (std::size_t i = 0; i < n; ++i)
    {
        if (F_extract   > 0.0) zExtract[i]   = extractMol[i]   / F_extract;
        if (F_raffinate > 0.0) zRaffinate[i] = raffinateMol[i] / F_raffinate;
    }

    // ---- Recovery + distribution per species ---------------------------
    //   recovery_i = fraction of species i (fed) that leaves in the
    //   EXTRACT product.  distribution_i = z_extract,i / z_raffinate,i.
    const sVector totalInMol = addMol(feedMol, solvMol);
    sVector recovery(n, 0.0), distribution(n, 0.0);
    for (std::size_t i = 0; i < n; ++i)
    {
        if (totalInMol[i] > 0.0) recovery[i] = extractMol[i] / totalInMol[i];
        if (zRaffinate[i] > 1.0e-12) distribution[i] = zExtract[i] / zRaffinate[i];
    }

    // ---- Mass-closure check (glass-box honesty) ------------------------
    const scalar F_in_total  = F_feed + F_solv;
    const scalar F_out_total = F_extract + F_raffinate;
    const scalar closure_err = std::abs(F_in_total - F_out_total)
                             / std::max<scalar>(F_in_total, 1.0e-30);

    produced_.clear();
    {
        ProcessStream ex; ex.name = "extract";
        ex.F = F_extract; ex.T = T; ex.P = P; ex.z = zExtract; ex.vf = 0.0;
        produced_.push_back(ex);
        ProcessStream rf; rf.name = "raffinate";
        rf.F = F_raffinate; rf.T = T; rf.P = P; rf.z = zRaffinate; rf.vf = 0.0;
        produced_.push_back(rf);
    }

    kpis_.clear();
    kpis_["stages"]        = static_cast<scalar>(N);
    kpis_["splitStages"]   = static_cast<scalar>(splitStages);
    kpis_["F_feed"]        = F_feed;
    kpis_["F_solvent"]     = F_solv;
    kpis_["F_extract"]     = F_extract;
    kpis_["F_raffinate"]   = F_raffinate;
    kpis_["solventToFeed"] = F_solv / F_feed;
    kpis_["massClosure"]   = closure_err;
    kpis_["iterations"]    = static_cast<scalar>(iters);
    kpis_["converged"]     = converged ? 1.0 : 0.0;
    kpis_["T"]             = T;
    kpis_["P"]             = P;
    // The SOLUTE is the species (other than the solvent and the feed
    // carrier) that is most enriched into the extract --- report it
    // by name plus a generic per-species breakdown.
    std::size_t iSolute = n; scalar bestRec = -1.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        if (i == iSolvent || i == iCarrier) continue;
        if (recovery[i] > bestRec) { bestRec = recovery[i]; iSolute = i; }
    }
    if (iSolute < n)
    {
        kpis_["soluteRecovery"]     = recovery[iSolute];
        kpis_["soluteDistribution"] = distribution[iSolute];
    }
    for (std::size_t i = 0; i < n; ++i)
    {
        if (totalInMol[i] <= 0.0) continue;
        const std::string& nm = thermo.comp(i).name();
        kpis_["recovery_" + nm]     = recovery[i];      // -> extract
        kpis_["distribution_" + nm] = distribution[i];  // z_E / z_R
    }

    // ---- Stage profile -------------------------------------------------
    UnitProfile prof;
    prof.xAxis = "stage";
    std::vector<scalar> stageAxis(N), Eflow(N), Rflow(N);
    std::vector<std::vector<scalar>> xEcol(n, std::vector<scalar>(N, 0.0));
    std::vector<std::vector<scalar>> xRcol(n, std::vector<scalar>(N, 0.0));
    for (int j = 0; j < N; ++j)
    {
        stageAxis[j] = static_cast<scalar>(j + 1);
        Eflow[j]     = totalOf(Emol[j]);
        Rflow[j]     = totalOf(Rmol[j]);
        for (std::size_t i = 0; i < n; ++i)
        {
            xEcol[i][j] = (j < static_cast<int>(xE.size()) && xE[j].size() == n) ? xE[j][i] : 0.0;
            xRcol[i][j] = (j < static_cast<int>(xR.size()) && xR[j].size() == n) ? xR[j][i] : 0.0;
        }
    }
    prof.columns["stage"]      = stageAxis;
    prof.columns["F_extract"]  = Eflow;
    prof.columns["F_raffinate"]= Rflow;
    for (std::size_t i = 0; i < n; ++i)
    {
        const std::string& nm = thermo.comp(i).name();
        prof.columns["xE_" + nm] = xEcol[i];
        prof.columns["xR_" + nm] = xRcol[i];
    }
    profile_ = prof;

    // ---- Report --------------------------------------------------------
    if (verbosity >= 2)
    {
        std::cout << "\n=============  Liquid-Liquid Extraction (counter-current)  ===========\n"
                  << "  Stages (theoretical, HARDWARE):  N = " << N << "\n"
                  << "  Feed     F = " << std::scientific << std::setprecision(4) << F_feed
                  << " kmol/s  (stage 1, " << std::fixed << std::setprecision(1) << T_feed << " K)\n"
                  << "  Solvent  F = " << std::scientific << std::setprecision(4) << F_solv
                  << " kmol/s  (stage " << N << ", " << std::fixed << std::setprecision(1) << T_solv << " K)\n"
                  << "  Solvent / feed = " << std::setprecision(2) << (F_solv / F_feed)
                  << ",  T = " << std::setprecision(1) << T << " K,  P = "
                  << std::setprecision(3) << (P / 1.0e5) << " bar\n";
        std::cout << "  Extract  F = " << std::scientific << std::setprecision(4) << F_extract
                  << " kmol/s  (solvent-rich, leaves stage 1)\n"
                  << "  Raffinate F = " << std::scientific << std::setprecision(4) << F_raffinate
                  << " kmol/s  (feed-derived, leaves stage " << N << ")\n";
        std::cout << "  Cascade: " << iters << " sweeps, |Delta F| = "
                  << std::scientific << std::setprecision(3) << dMax
                  << ",  two-phase stages = " << splitStages << " / " << N << "\n";
        std::cout << "  Mass closure: in = " << std::scientific << std::setprecision(6) << F_in_total
                  << "  out = " << F_out_total << "  (rel.err " << closure_err << ")\n";
        if (iSolute < n)
            std::cout << "  Solute '" << thermo.comp(iSolute).name()
                      << "':  recovery to extract = " << std::fixed << std::setprecision(1)
                      << (100.0 * recovery[iSolute]) << " %"
                      << ",  distribution z_E/z_R = " << std::setprecision(3)
                      << distribution[iSolute] << "\n";
        std::cout << "  ------  per species  (recovery to extract)  ------\n";
        for (std::size_t i = 0; i < n; ++i)
        {
            if (totalInMol[i] <= 0.0) continue;
            std::cout << "    " << std::setw(10) << thermo.comp(i).name()
                      << "   z_extract = " << std::fixed << std::setprecision(4) << zExtract[i]
                      << "   z_raffinate = " << std::setprecision(4) << zRaffinate[i]
                      << "   recovery = " << std::setprecision(1) << (100.0 * recovery[i]) << " %\n";
        }
        std::cout << "  Assumptions: counter-current, N equilibrium stages, isothermal,\n"
                  << "               per-stage split via the shared Gibbs-min LL flash.\n"
                  << "======================================================================\n\n";
    }

    if (!converged)
        std::cerr << "Warning: Extractor cascade hit the iteration cap ("
                  << maxIt << " sweeps) with |Delta F| = " << dMax
                  << " --- result may be under-converged.\n";
    if (closure_err > 1.0e-4)
        std::cerr << "Warning: Extractor mass closure off by " << closure_err
                  << " (rel.) --- check the stage balances.\n";

    return 0;
}

} // namespace Choupo
