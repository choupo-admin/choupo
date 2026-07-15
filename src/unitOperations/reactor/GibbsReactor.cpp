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

#include "GibbsReactor.H"

#include "core/Constants.H"
#include "gibbsMethod/GibbsMethod.H"
#include "solver/NewtonRaphson.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

int GibbsReactor::solve(const DictPtr& dict,
                        const ThermoPackage& thermo,
                        int verbosity)
{
    auto feedDict = dict->subDict("feed");
    auto operDict = dict->subDict("operation");
    auto compDict = dict->subDict("composition");

    const scalar F_in_kmols = feedDict->lookupScalar("F", Dims::molarFlow);
    const scalar T_guess   = operDict->lookupScalar("T", Dims::temperature);
    const scalar P         = operDict->lookupScalar("P", Dims::pressure);
    const std::string mode = operDict->lookupWordOrDefault("mode", "isothermal");
    if (mode != "isothermal" && mode != "adiabatic")
        throw std::runtime_error("GibbsReactor: unknown mode '" + mode
            + "' (expected 'isothermal' or 'adiabatic')");
    const scalar Q_kJ_per_kmol = operDict->lookupScalarOrDefault("Q", 0.0);

    // Approach to equilibrium: evaluate the equilibrium at (T + approachTemperature)
    // while the streams stay at the physical T.  A positive ΔT de-rates an
    // exothermic reaction (less conversion) -- the standard way to model
    // INCOMPLETE approach to equilibrium for reversible reactions (WGS,
    // reforming, ammonia) without kinetics.  Default 0 = full equilibrium.
    // (No effect on an essentially irreversible reaction whose K is huge.)
    const scalar dTapproach = operDict->lookupScalarOrDefault("approachTemperature", 0.0);

    // Solution method: selectable sub-model, default elementPotential
    // (ideal gas + ideal liquid).  In the `model` slot right after `type`,
    // falling back to a `model` key inside operation for older cases.
    const std::string modelName = dict->lookupWordOrDefault(
        "model", operDict->lookupWordOrDefault("model", "elementPotential"));
    auto method = GibbsMethod::New(modelName);

    // -- Elements and species ----------------------------------------------
    auto elems = operDict->lookupWordList("elements");
    const std::size_t M = elems.size();
    if (M == 0) throw std::runtime_error("GibbsReactor: 'elements' is empty");
    auto specs = operDict->lookupDictList("species");
    const std::size_t N = specs.size();
    if (N == 0) throw std::runtime_error("GibbsReactor: 'species' is empty");
    if (N <= M)
        throw std::runtime_error("GibbsReactor: need more species than elements"
            " for a non-degenerate equilibrium (got " + std::to_string(N)
            + " species and " + std::to_string(M) + " elements)");

    std::vector<std::vector<scalar>> A(M, std::vector<scalar>(N, 0.0));
    std::vector<std::size_t>         compIdx(N);
    std::vector<std::string>         specNames(N);
    std::vector<bool>                condensable(N, false);
    for (std::size_t i = 0; i < N; ++i)
    {
        auto sd = specs[i];
        const std::string sname = sd->lookupWord("name");
        compIdx[i]   = thermo.indexOf(sname);
        specNames[i] = sname;
        auto atoms = sd->lookupList("atoms");
        if (atoms.size() != M)
            throw std::runtime_error("GibbsReactor: species '" + sname
                + "' atoms list has " + std::to_string(atoms.size())
                + " entries, expected " + std::to_string(M));
        for (std::size_t j = 0; j < M; ++j) A[j][i] = atoms[j];
        if (!thermo.comp(compIdx[i]).hasGibbsData())
            throw std::runtime_error("GibbsReactor: species '" + sname
                + "' is missing a standardThermochemistry block in its.dat file");
        // A species can condense if it carries a vapour-pressure model; the
        // method's supersaturation check decides whether it actually does.
        condensable[i] = thermo.comp(compIdx[i]).hasVaporPressure();
    }

    // -- Feed -> species mole numbers + element balance --------------------
    const scalar F_mol_s = F_in_kmols * 1000.0;
    sVector z(thermo.n(), 0.0);
    scalar zsum = 0.0;
    for (const auto& key : compDict->keys())
    {
        std::size_t k = thermo.indexOf(key);
        z[k] = compDict->lookupScalar(key);
        zsum += z[k];
    }
    for (auto& v : z) v /= zsum;

    sVector nIn(N, 0.0);
    for (std::size_t i = 0; i < N; ++i) nIn[i] = z[compIdx[i]] * F_mol_s;

    sVector b(M, 0.0);
    for (std::size_t j = 0; j < M; ++j)
        for (std::size_t i = 0; i < N; ++i) b[j] += A[j][i] * nIn[i];
    for (std::size_t j = 0; j < M; ++j)
        if (b[j] <= 0.0)
            throw std::runtime_error("GibbsReactor: element '" + elems[j]
                + "' has zero or negative balance (feed must contain it)");

    GibbsProblem prob;
    prob.thermo = &thermo;
    prob.A = A; prob.b = b; prob.nIn = nIn; prob.compIdx = compIdx;
    prob.condensable = condensable; prob.P = P;
    // temperature approach to equilibrium (forum-ratified 2026-07-02):
    // chemistry at T+dT, physical state at T.  Announced LOUD here AND at
    // the point of consumption (a KPI carries it into every results block --
    // the "dT=50 survived in a copied dict for months" accident).
    prob.dTapproach = operDict->found("temperatureApproach")
                    ? operDict->lookupScalar("temperatureApproach") : 0.0;
    if (prob.dTapproach != 0.0)
        std::cout << "  [gibbs] temperatureApproach = " << prob.dTapproach
                  << " K: REACTION equilibrium evaluated at T "
                  << (prob.dTapproach > 0 ? "+ " : "- ")
                  << std::abs(prob.dTapproach)
                  << " K; enthalpy, Psat and the energy balance stay at the"
                     " physical T.\n"
                     "          This is an EMPIRICAL closeness-to-equilibrium"
                     " parameter (calibrated, never predicted); 0 = true"
                     " equilibrium.  GLOBAL: it cannot resolve per-reaction"
                     " approaches (e.g. WGS vs methanol), and at high P it"
                     " will absorb missing fugacity corrections.\n";

    scalar N0 = 0.0; for (auto v : nIn) N0 += v;

    // Verbose Newton-trace hook (records + prints at verbosity >= 3).
    auto makeHook = [&](bool record) -> GibbsMethod::IterHook {
        if (!record) return [this](int, scalar nf, scalar){ recordResidual(nf); };
        if (verbosity >= 3)
            return [this](int it, scalar nf, scalar al){
                recordResidual(nf);
                std::cout << "    iter " << std::setw(3) << it
                          << "   |F| = " << std::scientific << std::setprecision(4) << nf
                          << "   α = " << std::fixed << std::setprecision(4) << al << "\n";
            };
        return [this](int, scalar nf, scalar){ recordResidual(nf); };
    };

    // Enthalpy of an equilibrium (gas + liquid; liquid carries -ΔHvap).
    auto enthalpy = [&](const GibbsEquilibrium& eq, scalar T) -> scalar {
        scalar H = 0.0;
        for (std::size_t i = 0; i < N; ++i)
        {
            const auto& c = thermo.comp(compIdx[i]);
            H += eq.nGas[i] * c.h_pure_ig(T);
            if (!eq.nLiq.empty() && eq.nLiq[i] > 0.0)
                H += eq.nLiq[i] * (c.h_pure_ig(T) - c.Hvap_latent(T));
        }
        return H;
    };

    // -- Mode dispatch ------------------------------------------------------
    scalar T_final = T_guess;
    GibbsEquilibrium eq;
    int outerIter = 0;
    if (mode == "adiabatic")
    {
        const scalar T_in = feedDict->lookupScalar("T", Dims::temperature);
        scalar H_in = 0.0;
        for (std::size_t i = 0; i < N; ++i)
            H_in += nIn[i] * thermo.comp(compIdx[i]).h_pure_ig(T_in);
        const scalar Q_J_s = Q_kJ_per_kmol * F_mol_s;

        auto fT = [&](scalar Tt) -> scalar {
            auto e = method->equilibrium(prob, Tt + dTapproach, {});
            if (!e.converged) return 1.0e30;
            return enthalpy(e, Tt) - H_in - Q_J_s;
        };
        auto dfT = [&](scalar Tt){ const scalar h=0.5; return (fT(Tt+h)-fT(Tt-h))/(2.0*h); };

        solver::NROptions nro;
        nro.tolerance = 1.0e-2; nro.maxIter = 30;
        nro.lower = 250.0; nro.upper = 5000.0;
        nro.bracket = false; nro.monotoneIncreasing = true; nro.maxStep = 200.0;
        if (verbosity >= 2)
            std::cout << "GibbsReactor (adiabatic): outer Newton on T from "
                      << T_guess << " K\n";
        nro.onIter = [this](const solver::NRTrace& tr){ recordResidual(std::abs(tr.f)); };
        auto rT = solver::newton1D(fT, dfT, T_guess, nro);
        outerIter = rT.iterations;
        T_final = rT.x;
        eq = method->equilibrium(prob, T_final + dTapproach, {});
        if (!rT.converged)
            std::cerr << "GibbsReactor: outer Newton on T did NOT converge\n";
    }
    else
    {
        if (verbosity >= 2)
            std::cout << "GibbsReactor (" << modelName << ") at T = " << T_guess
                      << " K, P = " << (P * 1.0e-5) << " bar; " << N
                      << " species over " << M << " elements\n";
        eq = method->equilibrium(prob, T_final + dTapproach, makeHook(true));
        if (!eq.converged)
            std::cerr << "GibbsReactor: did NOT converge (final |F| = "
                      << eq.residual << ")\n";
    }

    // -- Outputs -----------------------------------------------------------
    const scalar Ng = eq.Ntotal_gas;
    const scalar Nl = eq.Ntotal_liq;
    produced_.clear();
    ProcessStream gasOut;
    gasOut.name = "out";
    gasOut.F = Ng / 1000.0;
    gasOut.T = T_final; gasOut.P = P; gasOut.vf = 1.0;
    gasOut.z.assign(thermo.n(), 0.0);
    for (std::size_t i = 0; i < N; ++i)
        gasOut.z[compIdx[i]] = (Ng > 0.0) ? eq.nGas[i] / Ng : 0.0;
    produced_.push_back(gasOut);

    if (eq.twoPhase && Nl > 0.0)
    {
        ProcessStream liqOut;
        liqOut.name = "condensate";
        liqOut.F = Nl / 1000.0;
        liqOut.T = T_final; liqOut.P = P; liqOut.vf = 0.0;
        liqOut.z.assign(thermo.n(), 0.0);
        for (std::size_t i = 0; i < N; ++i)
            liqOut.z[compIdx[i]] = eq.nLiq[i] / Nl;
        produced_.push_back(liqOut);
    }

    // -- KPIs --------------------------------------------------------------
    const scalar RT_final = constant::R * T_final;
    kpis_.clear();
    kpis_["T"]            = T_final;
    kpis_["P"]            = P;
    kpis_["F_in_kmol_h"]  = F_in_kmols * 3600.0;
    kpis_["F_out_kmol_h"] = gasOut.F * 3600.0;
    kpis_["N_in_mol_s"]   = N0;
    kpis_["N_out_mol_s"]  = Ng + Nl;
    kpis_["converged"]    = eq.converged ? 1.0 : 0.0;
    kpis_["iterations"]   = static_cast<scalar>(eq.iterations);
    if (mode == "adiabatic") kpis_["outerIterations"] = static_cast<scalar>(outerIter);

    // -- Reactor duty on the ELEMENTS datum (heat that crosses the boundary) --
    // In ISOTHERMAL (fixed-T) mode the reactor must exchange heat with the
    // surroundings to hold T against the reaction enthalpy: the chemical energy
    // released / absorbed by combustion (etc.) crosses the system boundary as a
    // REAL duty.  On the ONE datum (elements, 25 C) that duty is simply the
    // stream-enthalpy change H_out - H_in (the formation reference carries
    // dH_rxn), computed EXACTLY as the energy-balance report does -- so the
    // per-unit and the global plant-boundary ledgers agree.  Sign: + = heat
    // ADDED to the process, - = heat REMOVED.  Without this KPI the combustion
    // chemical energy silently leaks out of globalEnergyBoundary.csv (the 70 %
    // hole on combined01_brayton_rankine next to the 0.55 % headline closure).
    //
    // Adiabatic mode by definition exchanges no heat to hold T (its T floats to
    // absorb the reaction enthalpy; any externally imposed `Q` is already the
    // user's spec), so it emits no boundary duty here.
    if (mode == "isothermal")
    {
        const scalar T_in = feedDict->lookupScalar("T", Dims::temperature);
        sVector zf(thermo.n(), 0.0);
        for (std::size_t i = 0; i < N; ++i)
            zf[compIdx[i]] = (F_mol_s > 0.0) ? nIn[i] / F_mol_s : 0.0;
        const scalar H_in_kW = F_in_kmols * thermo.H_stream_formation(T_in, P, 1.0, zf);
        scalar H_out_kW = 0.0;
        for (const auto& s : produced_)
            H_out_kW += s.F * thermo.H_stream_formation(s.T, s.P, s.vf, s.z);
        kpis_["Q_kW"] = H_out_kW - H_in_kW;   // F[kmol/s]*h[kJ/kmol] = kW
    }

    for (std::size_t j = 0; j < M; ++j)
        kpis_["lambda_" + elems[j]] = eq.pi[j] * RT_final;
    if (prob.dTapproach != 0.0)
        kpis_["temperatureApproach_K"] = prob.dTapproach;
    for (std::size_t i = 0; i < N; ++i)
        kpis_["y_" + specNames[i]] = (Ng > 0.0) ? eq.nGas[i] / Ng : 0.0;
    if (eq.twoPhase && Nl > 0.0)
    {
        kpis_["twoPhase"]            = 1.0;
        kpis_["N_liq_mol_s"]         = Nl;
        kpis_["F_condensate_kmol_h"] = (Nl / 1000.0) * 3600.0;
        kpis_["liquidFraction"]      = Nl / (Ng + Nl);
        for (std::size_t i = 0; i < N; ++i)
            if (eq.nLiq[i] > 0.0) kpis_["x_" + specNames[i]] = eq.nLiq[i] / Nl;
    }

    // -- Report ------------------------------------------------------------
    std::cout << "\n=======================  Gibbs reactor  =========================\n"
              << "  Method:       " << modelName
              << (eq.twoPhase ? "   (gas + liquid)" : "   (single gas phase)") << "\n"
              << "  Mode:         " << mode
              << "    P = " << std::fixed << std::setprecision(3) << (P * 1.0e-5) << " bar\n"
              << "  T:            " << std::setprecision(2) << T_final << " K"
              << (mode == "adiabatic" ? "   (adiabatic flame T)" : "   (isothermal)") << "\n"
              << "  Conv.:        " << (eq.converged ? "yes" : "NO")
              << "   in " << eq.iterations << " Newton-ND iters\n";
    if (mode == "adiabatic")
        std::cout << "  Outer conv.:  in " << outerIter << " Newton-1D iters on T\n";
    std::cout << "  Final |F|:    " << std::scientific << std::setprecision(3)
              << eq.residual << "\n\n"
              << "  Species         n_in [mol/s]    n_gas [mol/s]   n_liq [mol/s]\n"
              << "  ----------------------------------------------------------------\n";
    for (std::size_t i = 0; i < N; ++i)
        std::cout << "  " << std::left << std::setw(14) << specNames[i]
                  << std::right << std::scientific << std::setprecision(4)
                  << "  " << std::setw(13) << nIn[i]
                  << "  " << std::setw(13) << eq.nGas[i]
                  << "  " << std::setw(13) << (eq.nLiq.empty() ? 0.0 : eq.nLiq[i]) << "\n";
    std::cout << "  " << std::left << std::setw(14) << "Total"
              << std::right << std::scientific << std::setprecision(4)
              << "  " << std::setw(13) << N0
              << "  " << std::setw(13) << Ng
              << "  " << std::setw(13) << Nl << "\n";
    if (eq.twoPhase)
        std::cout << "  Liquid fraction: " << std::fixed << std::setprecision(4)
                  << (Nl / (Ng + Nl)) << "  (condensate stream emitted)\n";
    std::cout << "==================================================================\n\n";

    return eq.converged ? 0 : 1;
}

} // namespace Choupo
