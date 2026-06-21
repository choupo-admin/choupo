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
#include "thermo/reaction/Reaction.H"

#include <cmath>
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
        if (ktype != "Arrhenius")
            throw std::runtime_error("BatchReactor: reaction '" + rxnName
                + "': only kinetics 'Arrhenius' implemented (got '" + ktype + "')");
        r.A_pre = kin->lookupScalar("A");
        r.Ea    = kin->lookupScalar("Ea");

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
        // Also: every component must have a liquidHeatCapacity for the
        // energy balance to evaluate.
        for (std::size_t i = 0; i < n; ++i)
        {
            if (!thermo.comp(i).hasCpLiquid())
                throw std::runtime_error("BatchReactor (adiabatic): component '"
                    + thermo.comp(i).name() + "' has no liquidHeatCapacity in"
                    " its.dat file");
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
scalar BatchReactor::rateOfReaction_(const ReactionSpec& rxn,
                                     scalar               T,
                                     const sVector&       n,
                                     scalar               V) const
{
    const scalar k = Reaction::arrheniusRate(rxn.A_pre, rxn.Ea, T);
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
    // call so it tracks T in adiabatic mode.
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

    // Loop over reactions; accumulate the species derivatives and the
    // heat release.
    scalar heatRate = 0.0;   // Σ r_r · V · ΔH_r  [J·kmol / (mol·s)]
                             // (the mol/kmol factor cancels in dT/dt --- see header)
    for (const auto& rxn : reactions_)
    {
        const scalar r_r = rateOfReaction_(rxn, T, n_vec, V);   // kmol/(m³·s)
        for (std::size_t s = 0; s < rxn.comps.size(); ++s)
            dydt[rxn.comps[s]] += rxn.nu[s] * r_r * V;          // kmol/s
        heatRate += rxn.dH * r_r * V;                            // J·kmol/(mol·s)
    }

    if (mode_ == Mode::Adiabatic)
    {
        // Total heat capacity Σ n_i · Cp_i(T) in [kmol · J/(mol·K)]
        scalar CpTot = 0.0;
        for (std::size_t i = 0; i < n; ++i)
            CpTot += n_vec[i] * thermo_->comp(i).cpLiquid().Cp(T);

        if (CpTot < 1.0e-30) { dydt[n] = 0.0; }
        else                  { dydt[n] = -heatRate / CpTot; }
        // The (J·kmol / mol·s) / (kmol · J/(mol·K)) = K/s  --- the
        // mol/kmol factors cancel, no explicit 1000 needed.
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
    // Pack state for RK4: (n[0..n-1], T).
    const std::size_t n = state_.n.size();
    sVector y0(n + 1);
    for (std::size_t i = 0; i < n; ++i) y0[i] = state_.n[i];
    y0[n] = state_.T;

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

    // Unpack and guard against numerical drift below zero on the mole
    // numbers (the rate eqs are nonlinear --- RK4 can overshoot).
    for (std::size_t i = 0; i < n; ++i)
        state_.n[i] = std::max<scalar>(y0[i], 0.0);
    state_.T = (mode_ == Mode::Isothermal) ? T_setpoint_ : y0[n];
}

} // namespace Choupo
