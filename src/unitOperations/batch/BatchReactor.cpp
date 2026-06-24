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

#include "BatchReactor.H"
#include "core/Constants.H"
#include "streams/Composition.H"
#include "thermo/ThermoPackage.H"
#include "thermo/Component.H"
#include "thermo/reaction/Reaction.H"
#include "solver/ODE/ODEIntegrator.H"

#include <algorithm>
#include <cmath>
#include <iostream>
#include <stdexcept>

namespace Choupo {

void BatchReactor::initialise(const DictPtr&       unitDict,
                              const ThermoPackage& thermo,
                              const DictPtr&       reactionsDict)
{
    thermo_ = &thermo;
    const std::size_t n = thermo.n();

    // -----------------------------------------------------------------
    //  Initial state from `initial` sub-dict.
    // -----------------------------------------------------------------
    auto initDict = unitDict->subDict("initial");
    state_.T = initDict->lookupScalar("T");
    state_.P = initDict->lookupScalar("P");
    state_.V = initDict->lookupScalar("V");
    const scalar nTot = initDict->lookupScalar("totalMoles");

    // Composition: molarComposition / massComposition / composition
    // all delegate to the shared readComposition helper, which returns
    // the canonical mole-fraction vector (mass fractions converted via
    // MW) and warns if the user-supplied values don't sum to 1.
    const sVector x =
        readComposition(initDict, thermo, "BatchReactor '" + name_ + "' init");
    state_.n.assign(n, 0.0);
    for (std::size_t i = 0; i < n; ++i) state_.n[i] = nTot * x[i];

    // -----------------------------------------------------------------
    //  Operation mode: isothermal | adiabatic
    // -----------------------------------------------------------------
    auto opDict = unitDict->subDict("operation");
    const std::string mode = opDict->lookupWordOrDefault("mode", "isothermal");
    if (mode == "isothermal")
    {
        mode_       = Mode::Isothermal;
        T_setpoint_ = opDict->found("T_setpoint")
                      ? opDict->lookupScalar("T_setpoint")
                    : state_.T;
        state_.T    = T_setpoint_;
    }
    else if (mode == "adiabatic")
    {
        mode_       = Mode::Adiabatic;
        T_setpoint_ = 0;
        // state_.T is the initial temperature; it evolves with the
        // energy balance from here on.
    }
    else
    {
        throw std::runtime_error("BatchReactor: unknown mode '" + mode
            + "' (expected 'isothermal' or 'adiabatic')");
    }

    // -----------------------------------------------------------------
    //  Optional time-integrator selection.
    //      solver { integrator RK4 | EulerSI | Rosenbrock23; }
    //  Default RK4 -- the classic explicit step every batch tutorial uses,
    //  so omitting the block changes nothing.  Stiff chemistry (detailed
    //  kinetics) selects Rosenbrock23.
    // -----------------------------------------------------------------
    if (unitDict->found("solver"))
    {
        auto solverDict = unitDict->subDict("solver");
        integrator_ = solverDict->lookupWordOrDefault("integrator", "RK4");
        // The stiff integrators announce their step/stiffness verdict at
        // verbosity>=3 (numerical-honesty credo).  Read it here, default 3 so
        // a case that opted into a stiff method gets the lesson by default.
        verbosity_  = static_cast<int>(solverDict->lookupScalarOrDefault("verbosity", 3));
    }

    // -----------------------------------------------------------------
    //  Adiabatic energy basis (only consulted in adiabatic mode).
    //      operation { mode adiabatic; energy gasConstantV | liquidDH; }
    //  Default liquidDH = the legacy per-reaction-ΔH / liquid-Cp path, so
    //  every existing adiabatic tutorial is unchanged.  gasConstantV is the
    //  closed fixed-volume gas-phase balance for combustion (heat release from
    //  the species' formation enthalpies, gas Cv).
    // -----------------------------------------------------------------
    {
        const std::string ebasis = opDict->lookupWordOrDefault("energy", "liquidDH");
        if      (ebasis == "liquidDH")     energy_ = Energy::LiquidDH;
        else if (ebasis == "gasConstantV") energy_ = Energy::GasConstantV;
        else throw std::runtime_error("BatchReactor: unknown energy basis '"
                + ebasis + "' (expected 'liquidDH' or 'gasConstantV')");
    }

    // -----------------------------------------------------------------
    //  Reaction(s) lookup.  Backward-compat: accept either
    //      reaction   name;            (single)
    //  or
    //      reactions  (name1 name2... );   (list)
    // -----------------------------------------------------------------
    if (!reactionsDict)
        throw std::runtime_error("BatchReactor: case has no reactions library"
            " (constant/reactions); cannot resolve reaction reference");

    std::vector<std::string> rxnNames;
    if (unitDict->found("reactions"))
        rxnNames = unitDict->lookupWordList("reactions");
    else if (unitDict->found("reaction"))
        rxnNames = { unitDict->lookupWord("reaction") };
    else
        throw std::runtime_error("BatchReactor: unit needs `reaction` (single)"
            " or `reactions` (list) entry");

    reactions_.clear();
    reactions_.reserve(rxnNames.size());
    for (const auto& rxnName : rxnNames)
    {
        auto rxn = reactionsDict->subDict(rxnName);
        ReactionSpec r;
        r.name = rxnName;

        auto stoich = rxn->lookupDictList("stoichiometry");
        r.comps.reserve(stoich.size());
        r.nu.reserve(stoich.size());
        r.order.reserve(stoich.size());
        for (const auto& s : stoich)
        {
            const std::string cname = s->lookupWord("component");
            r.comps.push_back(thermo.indexOf(cname));
            r.nu.push_back(s->lookupScalar("nu"));
            r.order.push_back(s->lookupScalar("order"));
        }

        auto kin = rxn->subDict("kinetics");
        const std::string ktype = kin->lookupWord("type");

        // Forward molecularity (for the cm-mol-s -> SI A conversion): the sum
        // of the positive (reactant-side) power-law orders, rounded to int.
        int molecularity = 0;
        for (scalar o : r.order) if (o > 0.0) molecularity += static_cast<int>(std::lround(o));

        // Optional units block: convert CHEMKIN cm-mol-s / cal-mol to SI on
        // load (and announce it).  Absent => values already SI (legacy).
        const auto convA  = [&](scalar A, int molec) { return ckA_(kin, A, molec); };
        const auto convEa = [&](scalar Ea)           { return ckEa_(kin, Ea);     };

        if (ktype == "Arrhenius")
        {
            r.form  = RateForm::Arrhenius;
            r.A_pre = convA(kin->lookupScalar("A"), molecularity);
            r.Ea    = convEa(kin->lookupScalar("Ea"));
        }
        else if (ktype == "modifiedArrhenius")
        {
            r.form  = RateForm::ModArrhenius;
            r.A_pre = convA(kin->lookupScalar("A"), molecularity);
            r.b     = kin->lookupScalar("b");
            r.Ea    = convEa(kin->lookupScalar("Ea"));
        }
        else if (ktype == "thirdBody")
        {
            // k·[M], [M] from per-species efficiencies; molecularity gains the
            // +M, so the A conversion uses molecularity+1.
            r.form  = RateForm::ThirdBody;
            r.A_pre = convA(kin->lookupScalar("A"), molecularity + 1);
            r.b     = kin->lookupScalarOrDefault("b", 0.0);
            r.Ea    = convEa(kin->lookupScalar("Ea"));
            r.tbEff = thirdBodyEfficiencies_(kin, thermo);
        }
        else if (ktype == "falloff")
        {
            // High-pressure limit kInf on the main A/b/Ea; low-pressure kLow in
            // a `low {…}` sub-dict (molecularity+1); optional `troe ( … )`.
            r.form  = RateForm::Falloff;
            r.A_pre = convA(kin->lookupScalar("A"), molecularity);        // kInf
            r.b     = kin->lookupScalarOrDefault("b", 0.0);
            r.Ea    = convEa(kin->lookupScalar("Ea"));
            auto low = kin->subDict("low");
            r.A_low  = ckA_(low, low->lookupScalar("A"), molecularity + 1);
            r.b_low  = low->lookupScalarOrDefault("b", 0.0);
            r.Ea_low = ckEa_(low, low->lookupScalar("Ea"));
            if (kin->found("troe")) r.troe = kin->lookupList("troe");
            r.tbEff = kin->found("thirdBody")
                      ? thirdBodyEfficiencies_(kin, thermo) : sVector{};
        }
        else
        {
            throw std::runtime_error("BatchReactor: reaction '" + rxnName
                + "': unknown kinetics type '" + ktype + "' (expected Arrhenius,"
                " modifiedArrhenius, thirdBody, or falloff)");
        }

        // Heat of reaction.  Optional (default 0) so isothermal cases that
        // don't care about it can omit it without error.  For adiabatic
        // cases the user MUST set it explicitly or the energy balance
        // will be inert.
        r.dH = rxn->lookupScalarOrDefault("dH_rxn", 0.0);

        // Optional reversible flag: k_rev derived from k_fwd / K_eq
        // by detailed balance, K_eq(T) re-evaluated each step (T may drift in
        // adiabatic mode) --- see rateOfReaction_.
        r.reversible = rxn->lookupWordOrDefault("reversible", "false") == "true";

        reactions_.push_back(std::move(r));
    }

    if (mode_ == Mode::Adiabatic)
    {
        // Sanity: every reaction needs dH_rxn for the energy balance to
        // do anything useful.  Warn (don't throw) if all are zero ---
        // the user might be intentionally testing the integrator on a
        // thermally neutral case.
        bool anyHeat = false;
        for (const auto& r : reactions_) if (std::abs(r.dH) > 1.0e-9) { anyHeat = true; break; }
        if (!anyHeat)
        {
            // Quiet --- the run will simply be isothermal in practice
            // (no heat release).  Pedagogically harmless.
        }
        // Each component must carry the thermo the chosen energy basis reads:
        //   liquidDH     -> liquidHeatCapacity (legacy)
        //   gasConstantV -> ideal-gas Cp + formation (h_pure_ig / Cv)
        for (std::size_t i = 0; i < n; ++i)
        {
            const auto& c = thermo.comp(i);
            if (energy_ == Energy::LiquidDH && !c.hasCpLiquid())
                throw std::runtime_error("BatchReactor (adiabatic, liquidDH):"
                    " component '" + c.name() + "' has no liquidHeatCapacity"
                    " in its.dat file");
            if (energy_ == Energy::GasConstantV && (!c.hasCpIdealGas() || !c.hasGibbsData()))
                throw std::runtime_error("BatchReactor (adiabatic, gasConstantV):"
                    " component '" + c.name() + "' needs idealGasHeatCapacity +"
                    " gibbsFormation (for u_i = h_pure_ig − R_uT and Cv) in its"
                    " .dat file");
        }
    }
}

// -----------------------------------------------------------------------
//  Rate of a single reaction r at the current state.
//
//        r = k(T) · ∏_j (n_j / V)^{order_j}        [kmol/(m³·s)]
//
//  k(T) = A · exp(−Ea / RT)  with R in J/(mol·K) and Ea in J/mol.
// -----------------------------------------------------------------------
// -- CHEMKIN unit conversion on load (announced at verbosity>=2) -------------
scalar BatchReactor::ckA_(const DictPtr& kin, scalar A, int molecularity) const
{
    if (!kin->found("units")) return A;
    const std::string u = kin->subDict("units")->lookupWordOrDefault("A", "");
    // cm-mol-s -> SI kmol-m³-s:  A_SI = A · (1e-3)^(molecularity-1).
    if (u.find("cm") != std::string::npos)
    {
        const scalar f = std::pow(1.0e-3, molecularity - 1);
        if (verbosity_ >= 2)
            std::cout << "  [kinetics] A: " << A << " " << u << "  ->  "
                      << A * f << " (SI, kmol-m³-s; ×" << f << ", molecularity "
                      << molecularity << ")\n";
        return A * f;
    }
    return A;
}

scalar BatchReactor::ckEa_(const DictPtr& kin, scalar Ea) const
{
    if (!kin->found("units")) return Ea;
    const std::string u = kin->subDict("units")->lookupWordOrDefault("Ea", "");
    scalar f = 1.0;
    if      (u.find("kcal") != std::string::npos) f = 4184.0;
    else if (u.find("cal")  != std::string::npos) f = 4.184;
    else if (u.find("kJ")   != std::string::npos) f = 1000.0;
    if (f != 1.0 && verbosity_ >= 2)
        std::cout << "  [kinetics] Ea: " << Ea << " " << u << "  ->  "
                  << Ea * f << " J/mol (×" << f << ")\n";
    return Ea * f;
}

sVector
BatchReactor::thirdBodyEfficiencies_(const DictPtr& kin,
                                     const ThermoPackage& thermo) const
{
    sVector eff(thermo.n(), 1.0);            // unlisted species => 1.0
    auto tb = kin->subDict("thirdBody");
    for (const auto& sp : tb->keys())
        eff[thermo.indexOf(sp)] = tb->lookupScalar(sp);
    return eff;
}

scalar BatchReactor::rateOfReaction_(const ReactionSpec& rxn,
                                     scalar               T,
                                     const sVector&       n,
                                     scalar               V) const
{
    // Forward rate constant k_eff(T, c), with third-body [M] and fall-off
    // blending folded in.  Concentration vector c_j = n_j/V (kmol/m³) is only
    // needed for [M] (third-body / fall-off); cheap to skip otherwise.
    scalar k = 0.0;
    switch (rxn.form)
    {
        case RateForm::Arrhenius:
            k = Reaction::arrheniusRate(rxn.A_pre, rxn.Ea, T);
            break;
        case RateForm::ModArrhenius:
            k = Reaction::modifiedArrheniusRate(rxn.A_pre, rxn.b, rxn.Ea, T);
            break;
        case RateForm::ThirdBody:
        case RateForm::Falloff:
        {
            sVector conc(n.size());
            for (std::size_t j = 0; j < n.size(); ++j) conc[j] = n[j] / V;
            static const sVector kAll1;
            const sVector& eff = rxn.tbEff.empty() ? kAll1 : rxn.tbEff;
            const scalar M = Reaction::thirdBodyConcentration(conc, eff);
            if (rxn.form == RateForm::ThirdBody)
                k = Reaction::modifiedArrheniusRate(rxn.A_pre, rxn.b, rxn.Ea, T) * M;
            else
            {
                const scalar kInf = Reaction::modifiedArrheniusRate(rxn.A_pre, rxn.b, rxn.Ea, T);
                const scalar kLow = Reaction::modifiedArrheniusRate(rxn.A_low, rxn.b_low, rxn.Ea_low, T);
                k = Reaction::falloffRate(kLow, kInf, M, T, rxn.troe);
            }
            break;
        }
    }

    scalar r = k;
    for (std::size_t s = 0; s < rxn.comps.size(); ++s)
    {
        if (rxn.order[s] <= 0.0) continue;
        const scalar c_i = n[rxn.comps[s]] / V;
        r *= std::pow(std::max<scalar>(c_i, 0.0), rxn.order[s]);
    }
    if (!rxn.reversible) return r;

    // Reverse leg (detailed balance): k_rev = k_fwd / Kc, the concentration-
    // basis equilibrium constant (Reaction::equilibriumKc), re-evaluated each
    // call so it tracks T in adiabatic mode.  For third-body/fall-off the same
    // k_eff carries [M]/the blend, which cancels at equilibrium (Kc is the
    // gas-species ratio), so this stays consistent.
    const scalar K_eq  = Reaction::equilibriumKc(*thermo_, rxn.comps, rxn.nu, T);
    const scalar k_rev = k / K_eq;

    scalar r_rev = k_rev;
    for (std::size_t s = 0; s < rxn.comps.size(); ++s)
    {
        if (rxn.nu[s] <= 0.0) continue;                 // products only
        const scalar c_i = n[rxn.comps[s]] / V;
        r_rev *= std::pow(std::max<scalar>(c_i, 0.0), rxn.nu[s]);
    }
    return r - r_rev;
}

// -----------------------------------------------------------------------
//  Combined derivatives.
//
//  packed[0..n-1] = mole numbers [kmol]
//  packed[n]      = temperature  [K]
//
//  dn_i/dt = Σ_r ν_{i,r} · r_r · V                 [kmol/s]
//  dT/dt   = −Σ_r r_r · V · ΔH_r / Σ_i n_i · Cp_i  [K/s]   (adiabatic only)
// -----------------------------------------------------------------------
sVector BatchReactor::derivatives_(const sVector& packed) const
{
    const std::size_t n = packed.size() - 1;
    sVector n_vec(n);
    for (std::size_t i = 0; i < n; ++i) n_vec[i] = packed[i];
    const scalar T = (mode_ == Mode::Isothermal) ? T_setpoint_ : packed[n];
    const scalar V = state_.V;

    sVector dydt(n + 1, 0.0);

    // Loop over reactions; accumulate the species derivatives and (for the
    // liquid-ΔH basis) the per-reaction heat release.
    scalar heatRate = 0.0;   // Σ r_r · V · ΔH_r  [J·kmol / (mol·s)]
                             // (the mol/kmol factor cancels in dT/dt --- see header)
    for (const auto& rxn : reactions_)
    {
        const scalar r_r = rateOfReaction_(rxn, T, n_vec, V);   // kmol/(m³·s)
        for (std::size_t s = 0; s < rxn.comps.size(); ++s)
            dydt[rxn.comps[s]] += rxn.nu[s] * r_r * V;          // kmol/s
        heatRate += rxn.dH * r_r * V;                            // J·kmol/(mol·s)
    }

    if (mode_ == Mode::Adiabatic && energy_ == Energy::LiquidDH)
    {
        // Legacy liquid path: Σ r·V·ΔH over liquid Cp.
        scalar CpTot = 0.0;
        for (std::size_t i = 0; i < n; ++i)
            CpTot += n_vec[i] * thermo_->comp(i).cpLiquid().Cp(T);

        if (CpTot < 1.0e-30) { dydt[n] = 0.0; }
        else                  { dydt[n] = -heatRate / CpTot; }
        // The (J·kmol / mol·s) / (kmol · J/(mol·K)) = K/s  --- the
        // mol/kmol factors cancel, no explicit 1000 needed.
    }
    else if (mode_ == Mode::Adiabatic && energy_ == Energy::GasConstantV)
    {
        // Closed fixed-volume gas: first law dU = 0 gives, per the chain rule,
        //     dT/dt = − Σ_i u_i(T)·(dn_i/dt) / Σ_i n_i·Cv_i(T)
        // with u_i = h_pure_ig_i(T) − R_u·T  (internal energy, ideal gas) and
        // Cv_i = Cp_gas_i(T) − R_u.  The heat release is INTRINSIC to the
        // species' formation enthalpies (curated thermo) -- no per-reaction ΔH.
        // The kmol(dn/dt)·J/mol(u) and kmol(n)·J/mol/K(Cv) factors of 1000
        // cancel, as in the liquid path.
        scalar uDot  = 0.0;   // Σ u_i · dn_i/dt
        scalar CvTot = 0.0;   // Σ n_i · Cv_i
        for (std::size_t i = 0; i < n; ++i)
        {
            const scalar u_i  = thermo_->comp(i).h_pure_ig(T) - constant::R * T;
            const scalar Cv_i = thermo_->comp(i).cpIdealGas().Cp(T) - constant::R;
            uDot  += u_i  * dydt[i];
            CvTot += n_vec[i] * Cv_i;
        }
        dydt[n] = (CvTot < 1.0e-30) ? 0.0 : -uDot / CvTot;
    }
    // else: dydt[n] stays 0 (isothermal)

    return dydt;
}

void BatchReactor::setOperationParameter(const std::string& key, scalar value)
{
    if (key == "T_setpoint")
    {
        if (mode_ != Mode::Isothermal)
            throw std::runtime_error("BatchReactor '" + name_ + "': cannot"
                " set T_setpoint on a non-isothermal reactor (mode is"
                " adiabatic --- temperature is integrated by the energy"
                " balance, not user-supplied)");
        T_setpoint_ = value;
        state_.T    = value;
        return;
    }
    if (key == "T")
    {
        // For adiabatic mode, allow direct T forcing (e.g. external
        // jacket coming on).  In isothermal mode this is equivalent to
        // T_setpoint.
        state_.T    = value;
        if (mode_ == Mode::Isothermal) T_setpoint_ = value;
        return;
    }
    // Anything else: delegate to base so the standard error fires.
    BatchUnitOperation::setOperationParameter(key, value);
}

void BatchReactor::step(scalar /*t*/, scalar dt)
{
    // Pack state: (n[0..n-1], T).
    const std::size_t n = state_.n.size();
    sVector y0(n + 1);
    for (std::size_t i = 0; i < n; ++i) y0[i] = state_.n[i];
    y0[n] = state_.T;

    if (integrator_ == "RK4")
    {
        // The classic explicit step -- unchanged, so every existing batch
        // tutorial is byte-identical.
        auto axpy = [](const sVector& x, scalar a, const sVector& y) {
            sVector r(x.size());
            for (std::size_t i = 0; i < x.size(); ++i) r[i] = x[i] + a * y[i];
            return r;
        };

        auto k1 = derivatives_(y0);
        auto k2 = derivatives_(axpy(y0, 0.5 * dt, k1));
        auto k3 = derivatives_(axpy(y0, 0.5 * dt, k2));
        auto k4 = derivatives_(axpy(y0,       dt, k3));

        for (std::size_t i = 0; i < y0.size(); ++i)
            y0[i] += dt / 6.0 * (k1[i] + 2.0*k2[i] + 2.0*k3[i] + k4[i]);
    }
    else
    {
        // Stiff / semi-implicit path: advance the SAME packed derivatives over
        // [0, dt] with the selected adaptive integrator.  The derivatives are
        // autonomous in t (chemistry), so the wrapper ignores the time arg.
        if (!solver::ODEIntegrator::known(integrator_))
            solver::ODEIntegrator::registerBuiltins();
        auto integ = solver::ODEIntegrator::New(integrator_);

        solver::DerivFn f =
            [this](scalar /*t*/, const sVector& y) { return derivatives_(y); };

        solver::ODEControls ctrl;
        ctrl.atol.assign(n + 1, 1.0e-15);   // species rows: rtol dominates
        ctrl.atol[n] = 1.0e-6;              // temperature row [K]
        ctrl.rtol      = 1.0e-7;
        ctrl.nPositive = n;                 // mole numbers must stay >= 0 (T free)
        ctrl.verbosity = verbosity_;
        integ->integrate(y0, 0.0, dt, f, ctrl);
    }

    // Unpack and guard against numerical drift below zero on the mole
    // numbers (the rate eqs are nonlinear --- the step can overshoot).
    for (std::size_t i = 0; i < n; ++i)
        state_.n[i] = std::max<scalar>(y0[i], 0.0);
    state_.T = (mode_ == Mode::Isothermal) ? T_setpoint_ : y0[n];
}

// ---- Packed-ODE form (the adaptive driver) ------------------------------
//  Pack/unpack mirror step()'s convention EXACTLY (n_0..n_{N-1}, T), including
//  the isothermal T-pin, so the adaptive sweep and a fixed step() agree.
sVector BatchReactor::odeState() const
{
    const std::size_t n = state_.n.size();
    sVector y(n + 1);
    for (std::size_t i = 0; i < n; ++i) y[i] = state_.n[i];
    y[n] = state_.T;
    return y;
}

void BatchReactor::setOdeState(const sVector& y)
{
    const std::size_t n = state_.n.size();
    for (std::size_t i = 0; i < n; ++i)
        state_.n[i] = std::max<scalar>(y[i], 0.0);
    state_.T = (mode_ == Mode::Isothermal) ? T_setpoint_ : y[n];
}

} // namespace Choupo
