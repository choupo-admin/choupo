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

#include "core/Advisory.H"
#include "core/Constants.H"
#include "gibbsMethod/GibbsMethod.H"
#include "solver/NewtonRaphson.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace Choupo {

scalar GibbsReactor::stateEnthalpy_W(const GibbsProblem&     prob,
                                     const GibbsEquilibrium& eq,
                                     scalar                  T)
{
    const ThermoPackage& thermo = *prob.thermo;
    const std::size_t    N      = prob.N();
    scalar Ng = 0.0, Nl = 0.0;
    for (std::size_t i = 0; i < N; ++i)
    {
        Ng += eq.nGas[i];
        if (!eq.nLiq.empty()) Nl += eq.nLiq[i];
    }
    const scalar Ntot = Ng + Nl;
    if (!(Ntot > 0.0)) return 0.0;
    sVector zz(thermo.n(), 0.0);
    for (std::size_t i = 0; i < N; ++i)
        zz[prob.compIdx[i]] = (eq.nGas[i]
                             + (eq.nLiq.empty() ? 0.0 : eq.nLiq[i])) / Ntot;
    return Ntot * thermo.H_stream_formation(T, prob.P, Ng / Ntot, zz);
}

GibbsReactor::ApproachDirection
GibbsReactor::approachDirection(const GibbsMethod&  method,
                                const GibbsProblem& prob,
                                scalar              T,
                                scalar              magnitude,
                                bool                atSeed)
{
    ApproachDirection d;
    const ThermoPackage& thermo = *prob.thermo;
    const std::size_t    N      = prob.N();

    //  The probe: the TRUE equilibrium from this feed at the physical T.
    //  The extent it reaches is the only extent a stoichiometry-free reactor
    //  has, and the isothermal enthalpy change over it is the thermicity of
    //  the transformation AS IT RUNS from this feed -- which is what decides
    //  the direction a real bed falls short in.
    GibbsProblem probe = prob;
    probe.dTapproach = 0.0;
    const GibbsEquilibrium e0 = method.equilibrium(probe, T, {});

    scalar Nin = 0.0;
    for (auto v : prob.nIn) Nin += v;
    scalar extent = 0.0;     // max |n_out - n_in| / N_in, dimensionless
    if (e0.converged && Nin > 0.0)
    {
        for (std::size_t i = 0; i < N; ++i)
        {
            const scalar nOut = e0.nGas[i] + (e0.nLiq.empty() ? 0.0 : e0.nLiq[i]);
            extent = std::max(extent, std::abs(nOut - prob.nIn[i]) / Nin);
        }
        sVector zIn(thermo.n(), 0.0);
        for (std::size_t i = 0; i < N; ++i) zIn[prob.compIdx[i]] = prob.nIn[i] / Nin;
        const scalar H_in_W  = Nin * thermo.H_stream_formation(T, prob.P, 1.0, zIn);
        const scalar H_eq_W  = stateEnthalpy_W(prob, e0, T);
        d.dH_kJ_per_kmolFeed = (H_eq_W - H_in_W) / Nin;   // J/mol == kJ/kmol
    }

    d.determined = e0.converged && extent > 1.0e-12 && d.dH_kJ_per_kmolFeed != 0.0;
    if (d.determined)
    {
        d.sign = (d.dH_kJ_per_kmolFeed < 0.0) ? +1 : -1;
        d.word = (d.sign > 0) ? "exothermic" : "endothermic";
    }
    else
    {
        d.sign = +1;
        d.word = "undetermined";
    }

    std::ostringstream m;
    m << std::fixed << std::setprecision(2);
    m << "temperatureApproach " << magnitude << " K is a MAGNITUDE; the engine"
         " assigned its direction";
    if (atSeed) m << " (adiabatic mode: read at the seed T, the physical T being the answer)";
    m << ": the overall transformation from THIS feed to its equilibrium at T = "
      << T << " K is ";
    if (d.determined)
    {
        m << (d.sign > 0 ? "EXOTHERMIC" : "ENDOTHERMIC")
          << " (dH = " << d.dH_kJ_per_kmolFeed
          << " kJ per kmol of feed, isothermal, on the package's enthalpy"
             " surface -- never the published Q_kW), so the REACTION"
             " equilibrium is evaluated at T "
          << (d.sign > 0 ? "+ " : "- ") << magnitude << " K -- a "
          << (d.sign > 0 ? "HIGHER" : "LOWER")
          << " evaluation temperature is the one that under-predicts an "
          << d.word << " reaction.";
    }
    else
    {
        m << "thermally UNDETERMINED ("
          << (!e0.converged ? "the equilibrium probe did not converge"
              : extent <= 1.0e-12 ? "the feed is already at equilibrium: no conversion"
              : "dH = 0 exactly")
          << "), so the direction takes the DEFAULT, T + " << magnitude
          << " K, and says so.";
    }
    m << "  The reading is GLOBAL (the OVERALL thermicity decided; a reaction"
         " of the other thermicity riding inside it -- a shift inside a"
         " reformer -- is not resolved) and is taken from THIS FEED: a feed"
         " already past the equilibrium at T (a quench stage) runs the"
         " transformation the other way, and the approach then lands on the"
         " feed's own side, which the engine reads and does not judge.";
    d.message = m.str();
    return d;
}

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

    // `approachTemperature` is RETIRED (2026-09-26).  It was a SECOND approach
    // key read by this same solve, 76 lines above the one that announces
    // itself, and a DIFFERENT model: it shifted the temperature ARGUMENT
    // handed to the Gibbs method, so Psat and the fugacity coefficients moved
    // with the chemistry, while `temperatureApproach` (below) shifts the
    // reaction alone and keeps enthalpy, Psat and the energy balance at the
    // physical T.  It printed nothing, published no KPI, and the two ADDED
    // when both were declared -- the "dT survived in a copied dict" accident
    // the announcement below exists to prevent, sitting unannounced above it.
    // The key is read ONLY to refuse by name (the `Heater` `Tout` posture).
    if (operDict->found("approachTemperature"))
    {
        throw std::runtime_error(
            "GibbsReactor: 'approachTemperature' is no longer a valid operation "
            "key (retired 2026-09-26).  Declare 'temperatureApproach <dT>;' "
            "instead.\n"
            "  The two were DIFFERENT models, not two spellings of one: "
            "'approachTemperature' shifted the whole equilibrium evaluation to "
            "(T + dT), so Psat and the fugacity coefficients moved with the "
            "chemistry, silently and with no KPI; 'temperatureApproach' "
            "evaluates the REACTION equilibrium at (T + dT) and keeps enthalpy, "
            "Psat and the energy balance at the physical T, is ANNOUNCED on "
            "every run and published as the KPI temperatureApproach_K.\n"
            "  Declare 'temperatureApproach' as a MAGNITUDE (>= 0 K): the "
            "engine assigns its direction from the reaction's thermochemistry "
            "-- T + dT for an exothermic overall transformation (ammonia "
            "synthesis, shift), T - dT for an endothermic one (steam "
            "reforming) -- and announces which it chose and why.");
    }

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
    //  `temperatureApproach` is the ONE approach key: the method receives
    //  the physical T and applies `prob.dTapproach` to g_pure_ig alone
    //  (ElementPotential.cpp).  THE CASE DECLARES A MAGNITUDE; THE ENGINE ASSIGNS THE DIRECTION
    //  (Vitor, 2026-09-26).  A negative value is not a sign to be judged but
    //  an invalid magnitude, refused by name.  The direction is resolved
    //  below, once the enthalpy surface is in hand (`approachDirection`).
    const scalar dTmagnitude = operDict->found("temperatureApproach")
                             ? operDict->lookupScalar("temperatureApproach") : 0.0;
    if (dTmagnitude < 0.0)
    {
        std::ostringstream m;
        m << "GibbsReactor: 'temperatureApproach' must be a MAGNITUDE (>= 0 K);"
             " got " << dTmagnitude << ".  Declare the SIZE of the approach"
             " to equilibrium; the engine assigns its sign from the reaction's"
             " thermochemistry -- the REACTION equilibrium is evaluated at"
             " T + dT for an exothermic overall transformation and at T - dT"
             " for an endothermic one -- and announces which it chose and why."
             "  A real bed never crosses its own equilibrium curve, so the"
             " approach has no sign of its own to declare.";
        throw std::runtime_error(m.str());
    }
    prob.dTapproach = 0.0;   // resolved (signed) below when a magnitude is declared

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

    //  ---- ENTHALPY ON THE PACKAGE'S OWN SURFACE -------------------------
    //
    //  This used to sum `h_pure_ig` per component -- ideal gas -- while the
    //  streams this reactor produces are priced by the package, which may be
    //  a cubic EoS.  The adiabatic mode then solved `H_out,ig = H_in,ig + Q`
    //  and wrote a temperature at which the PUBLISHED enthalpies differ by
    //  exactly the residual functions: `R_out - R_in`, -938.21 kW on
    //  ammonia02's converter at 200 bar, on a unit whose correct residual is
    //  zero.  The ISOTHERMAL mode of this same unit already used
    //  `H_stream_formation` (below), so one unit ran two enthalpy surfaces
    //  depending on its mode.  Now both use the package's.
    //
    //  SCOPE, unchanged and stated: the balance is over the reactor's OWN
    //  declared species (`compIdx`).  A feed component outside that list is
    //  not in `nIn` and is not in this balance -- as before.
    //  The arithmetic lives in `stateEnthalpy_W` (one home) because the
    //  approach DIRECTION reads the same surface (below).
    auto enthalpy = [&](const GibbsEquilibrium& eq, scalar T) -> scalar {
        return stateEnthalpy_W(prob, eq, T);
    };

    //  ---- THE DIRECTION OF THE APPROACH, ASSIGNED HERE AND ANNOUNCED ------
    //
    //  Forum-ratified 2026-07-02: chemistry at T+dT, physical state at T,
    //  announced LOUD here AND at the point of consumption (a KPI carries it
    //  into every results block -- the "dT=50 survived in a copied dict for
    //  months" accident).  Ruled 2026-09-26: the SIGN is the engine's, read
    //  off the thermicity of the overall transformation from this feed at the
    //  physical T (see `approachDirection`).  In adiabatic mode the physical
    //  T is the answer, so the reading is taken at the seed and says so.
    if (dTmagnitude > 0.0)
    {
        const auto dir = approachDirection(*method, prob, T_guess, dTmagnitude,
                                           mode == "adiabatic");
        prob.dTapproach = dir.sign * dTmagnitude;
        std::cout << "  [gibbs] temperatureApproach = " << dTmagnitude
                  << " K: REACTION equilibrium evaluated at T "
                  << (prob.dTapproach > 0 ? "+ " : "- ")
                  << std::abs(prob.dTapproach)
                  << " K; enthalpy, Psat and the energy balance stay at the"
                     " physical T.\n"
                     "          " << dir.message << "\n"
                     "          This is an EMPIRICAL closeness-to-equilibrium"
                     " parameter (calibrated, never predicted); 0 = true"
                     " equilibrium.  GLOBAL: it cannot resolve per-reaction"
                     " approaches (e.g. WGS vs methanol), and at high P it"
                     " will absorb missing fugacity corrections.\n";
        AdvisoryLog::instance().add("model", dir.determined ? "info" : "warning",
                                    "gibbsReactor "
                                    + dict->lookupWordOrDefault("name", "(unnamed)"),
                                    dir.message);
    }

    // -- Mode dispatch ------------------------------------------------------
    scalar T_final = T_guess;
    GibbsEquilibrium eq;
    int outerIter = 0;
    if (mode == "adiabatic")
    {
        const scalar T_in = feedDict->lookupScalar("T", Dims::temperature);
        //  THE INLET ON THE SAME SURFACE.  Anything else reintroduces the
        //  defect on the other side of the equation.
        sVector zIn(thermo.n(), 0.0);
        scalar  Nin = 0.0;
        for (std::size_t i = 0; i < N; ++i) Nin += nIn[i];
        for (std::size_t i = 0; i < N; ++i)
            zIn[compIdx[i]] = (Nin > 0.0) ? nIn[i] / Nin : 0.0;
        //  AT THE FEED'S OWN PRESSURE, not the reactor's.  ammonia02's
        //  preheatedFeed arrives at 232.3 bar and the converter operates at
        //  200: evaluating the inlet at the operating pressure charges the
        //  reactor a departure-function step that belongs to the pipe.
        const scalar P_in = feedDict->found("P")
                          ? feedDict->lookupScalar("P", Dims::pressure) : P;
        const scalar H_in = (Nin > 0.0)
            ? Nin * thermo.H_stream_formation(T_in, P_in, 1.0, zIn) : 0.0;
        const scalar Q_J_s = Q_kJ_per_kmol * F_mol_s;

        auto fT = [&](scalar Tt) -> scalar {
            auto e = method->equilibrium(prob, Tt, {});
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
        eq = method->equilibrium(prob, T_final, {});
        if (!rT.converged)
            std::cerr << "GibbsReactor: outer Newton on T did NOT converge\n";
    }
    else
    {
        if (verbosity >= 2)
            std::cout << "GibbsReactor (" << modelName << ") at T = " << T_guess
                      << " K, P = " << (P * 1.0e-5) << " bar; " << N
                      << " species over " << M << " elements\n";
        eq = method->equilibrium(prob, T_final, makeHook(true));
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

    // lambda_* only when the method actually produced element potentials --
    // an empty pi is an absent claim, never a row of zeros (2026-08-22:
    // directMin published M fabricated zeros here and a golden pinned them).
    if (eq.pi.size() == M)
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
              << "   in " << eq.iterations
              << (eq.stopReason.empty() ? " Newton-ND iters\n"
                                        : " simplex iters\n");
    if (mode == "adiabatic")
        std::cout << "  Outer conv.:  in " << outerIter << " Newton-1D iters on T\n";
    if (eq.stopReason.empty())
        std::cout << "  Final |F|:    " << std::scientific
                  << std::setprecision(3) << eq.residual << "\n\n";
    else   // a derivative-free route has no |F|; print the claim it earned
        std::cout << "  Stop:         " << eq.stopReason << "\n\n";
    std::cout << "  Species         n_in [mol/s]    n_gas [mol/s]   n_liq [mol/s]\n"
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
