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

#include "DynamicCSTR.H"
#include "core/Constants.H"
#include "streams/Composition.H"
#include "unitOperations/reactor/ReactionHeat.H"

#include <algorithm>
#include <cmath>
#include <iostream>
#include <optional>
#include <stdexcept>

namespace Choupo {

void DynamicCSTR::initialise(const DictPtr&        unitDict,
                             const ThermoPackage&  thermo,
                             const DictPtr&        reactionsDict)
{
    thermo_ = &thermo;
    const std::size_t N = thermo.n();

    // ---- Initial state ------------------------------------------------
    auto initDict = unitDict->subDict("initial");
    T_  = initDict->lookupScalar("T");
    P_  = initDict->lookupScalarOrDefault("P", 1.0);
    V_  = initDict->lookupScalar("V");
    const scalar nTot = initDict->lookupScalar("totalMoles");

    {
        const sVector x = readComposition(initDict, thermo,
            "DynamicCSTR '" + name_ + "' init");
        n_.assign(N, 0.0);
        for (std::size_t i = 0; i < N; ++i) n_[i] = nTot * x[i];
    }

    // ---- Inlet --------------------------------------------------------
    auto inletDict = unitDict->subDict("inlet");
    F_in_ = inletDict->lookupScalar("F");
    T_in_ = inletDict->lookupScalar("T");
    z_in_ = readComposition(inletDict, thermo,
        "DynamicCSTR '" + name_ + "' inlet");
    // Authoritative per-component molar flows (F, z become derived views).
    nDotIn_.assign(z_in_.size(), 0.0);
    for (std::size_t i = 0; i < z_in_.size(); ++i)
        nDotIn_[i] = F_in_ * z_in_[i];

    // ---- Jacket -------------------------------------------------------
    auto opDict = unitDict->subDict("operation");
    catalystLoading_ = opDict->lookupScalarOrDefault("catalystLoading", 0.0);  // kg/m^3
    UA_         = opDict->lookupScalarOrDefault("UA",       0.0);   // W/K
    T_jacket_   = opDict->lookupScalarOrDefault("T_jacket", T_);    // K

    // ---- Reactions ----------------------------------------------------
    std::vector<std::string> rxnNames;
    if (unitDict->found("reactions"))
        rxnNames = unitDict->lookupWordList("reactions");
    else if (unitDict->found("reaction"))
        rxnNames = { unitDict->lookupWord("reaction") };

    if (!rxnNames.empty() && !reactionsDict)
        throw std::runtime_error("DynamicCSTR: case names a reaction but"
            " has no constant/reactions library");

    reactions_.clear();
    for (const auto& rn : rxnNames)
    {
        auto rxn = reactionsDict->subDict(rn);
        ReactionSpec r;
        r.name = rn;
        auto stoich = rxn->lookupDictList("stoichiometry");
        for (const auto& s : stoich)
        {
            r.comps.push_back(thermo.indexOf(s->lookupWord("component")));
            r.nu.push_back(s->lookupScalar("nu"));
            // A species with no `order` does not appear in the forward rate law -- the
            // steady reactors have always read it that way, and a reaction library is
            // shared between them.  Requiring it here made the same file legal in a CSTR
            // and illegal in a batch vessel.
            r.order.push_back(s->lookupScalarOrDefault("order", 0.0));
        }
        auto kin = rxn->subDict("kinetics");
        const std::string ktype = kin->lookupWord("type");
        if (ktype == "LHHW")
        {
            r.lhhw = true;
            r.law  = RateLaw::fromDict(rxn, thermo,
                                       "DynamicCSTR: reaction '" + rn + "'");
        }
        else if (ktype == "Arrhenius")
        {
            r.A_pre = kin->lookupScalar("A");
            r.Ea    = kin->lookupScalar("Ea");
        }
        else
            throw std::runtime_error("DynamicCSTR: kinetics type must be `Arrhenius`"
                " or `LHHW` (reaction '" + rn + "', got '" + ktype + "')");

        // Heat of reaction on the ONE enthalpy base (elements/formation datum),
        // resolved ONCE here through the shared helper.  When every reacting
        // species carries gibbsFormation, dH_rxn(T) = Σ νᵢ·hᵢ(T) is authoritative
        // and a present dict `dH_rxn` is cross-checked (mismatch warned, never
        // silently overriding).  The dynamic reactor is always non-isothermal
        // (it integrates T), so the heat of reaction is always consulted.  The
        // ctrl toy components (compA/compB, no gibbsFormation) take the announced
        // dict-override branch -- their numbers are unchanged.
        std::optional<scalar> dictDH;
        if (rxn->found("dH_rxn")) dictDH = rxn->lookupScalar("dH_rxn");
        std::string heatSource;
        r.dH = reactionHeat(thermo, r.comps, r.nu, T_, "liquid", dictDH,
                            "DynamicCSTR '" + name_ + "' reaction '" + rn + "'",
                            /*verbosity*/ 3, heatSource);
        reactions_.push_back(std::move(r));
    }

    // ---- Sanity: liquidHeatCapacity required for the energy balance --
    for (std::size_t i = 0; i < N; ++i)
        if (!thermo.comp(i).hasCpLiquid())
            throw std::runtime_error("DynamicCSTR: component '"
                + thermo.comp(i).name() + "' has no liquidHeatCapacity"
                " entry in its.dat file (needed for the energy balance)");

    // ---- start: explicit (default) vs steadyState seed ----------------
    //  ABSENT or `explicit`  => t=0 is the literal `initial{}` above
    //                           (byte-identical to every existing case).
    //  `steadyState`         => t=0 is SEEDED from the steady solution of the
    //                           holdup ODE at the declared feed/UA/T_jacket
    //                           (dn/dt = 0, dT/dt = 0).  Computed + PRINTED,
    //                           never a fabricated constant (no silent crutch).
    const std::string start =
        initDict->lookupWordOrDefault("start", "explicit");
    if (start == "steadyState" || start == "steady")
    {
        std::cout << "  DynamicCSTR '" << name_
                  << "': start = STEADY-STATE seed (from the holdup ODE at"
                     " the declared feed/UA/T_jacket)\n"
                  << "    explicit initial{} (T0=" << T_
                  << " K) used only as the relaxation guess.\n";
        seedFromSteady();
    }
    else if (start == "explicit")
    {
        std::cout << "  DynamicCSTR '" << name_
                  << "': start = explicit initial{}  (T0=" << T_ << " K)\n";
    }
    else
        throw std::runtime_error("DynamicCSTR '" + name_ + "': unknown"
            " initial.start '" + start + "' (expected `explicit` or"
            " `steadyState`)");
}

// ---------------------------------------------------------------------------
//  seedFromSteady():  relax the holdup ODE (dn/dt = f, dT/dt = f) to its steady
//  fixed point with the CURRENT feed / UA / T_jacket HELD, and adopt that
//  (n_i, T) as the t=0 state.  Glass-box: it integrates the SAME RK4 step() the
//  run uses (one code path, no second physics) until the state stops changing,
//  then announces the seeded operating point (no silent crutch).
//
//  THE STEP SIZE is the subtlety.  The reactor's SLOWEST mode is its residence
//  time tau_res = n_tot / F_in (often hours), but its FASTEST mode is the
//  thermal/jacket relaxation tau_T ~ (n*Cp) / (F*Cp + UA/1000) (often seconds).
//  An explicit RK4 step is stable only when dt is a fraction of the FAST mode,
//  so dt is sized off tau_T (NOT tau_res --- using tau_res/200 overshoots the
//  fast thermal mode and the relaxation diverges).  The horizon is then many
//  slow-mode residence times so the composition fully equilibrates.
// ---------------------------------------------------------------------------
void DynamicCSTR::seedFromSteady()
{
    const std::size_t N = n_.size();

    scalar nTot = 0.0; for (auto v : n_) nTot += v;

    // Heat capacities at the current T (kJ/K and kJ/(K) per mole-rate term).
    scalar CpTot = 0.0, CpInAvg = 0.0;
    for (std::size_t i = 0; i < N; ++i)
    {
        const scalar cp = thermo_->comp(i).cpLiquid().Cp(T_);
        CpTot   += n_[i]   * cp;
        CpInAvg += z_in_[i] * cp;
    }
    // Fast (thermal) time constant: (n*Cp) / (F*Cp_in + UA/1000).
    const scalar thermalDenom = F_in_ * CpInAvg + UA_ / 1000.0;
    const scalar tauT = (thermalDenom > 1.0e-30 && CpTot > 1.0e-30)
                      ? CpTot / thermalDenom : 1.0;
    // Slow (residence) time constant.
    const scalar tauRes = (F_in_ > 1.0e-30) ? nTot / F_in_ : tauT;

    const scalar dt = std::max<scalar>(tauT / 20.0, 1.0e-6);  // fraction of FAST mode
    // Horizon: enough slow-mode times to equilibrate composition, capped.
    const scalar horizon = std::max<scalar>(20.0 * tauRes, 200.0 * tauT);
    const std::size_t maxSteps =
        std::min<std::size_t>(static_cast<std::size_t>(horizon / dt) + 1, 5000000);

    sVector prev(N + 1);
    for (std::size_t it = 0; it < maxSteps; ++it)
    {
        for (std::size_t i = 0; i < N; ++i) prev[i] = n_[i];
        prev[N] = T_;

        step(0.0, dt);                 // the SAME RK4 the run uses --- one path

        if (!std::isfinite(T_))        // diverged (no stable open-loop SS)
        {
            std::cout << "    WARNING: steady-state seed DIVERGED (the open-loop"
                      << " reactor has no stable attractor at this jacket) ---"
                      << " keeping the explicit initial{}.\n";
            for (std::size_t i = 0; i < N; ++i) n_[i] = prev[i];
            T_ = prev[N];
            return;
        }

        scalar maxRel = 0.0;
        for (std::size_t i = 0; i < N; ++i)
        {
            const scalar d = std::abs(n_[i] - prev[i]);
            maxRel = std::max(maxRel, d / std::max<scalar>(std::abs(prev[i]), 1.0e-12));
        }
        maxRel = std::max(maxRel,
            std::abs(T_ - prev[N]) / std::max<scalar>(std::abs(prev[N]), 1.0));

        if (maxRel < 1.0e-11)
        {
            scalar nt = 0.0; for (auto v : n_) nt += v;
            std::cout << "    seeded steady state reached after " << (it + 1)
                      << " relaxation steps (dt=" << dt << " s):  T0=" << T_ << " K";
            for (std::size_t i = 0; i < N; ++i)
                if (nt > 0.0)
                    std::cout << "  x_" << thermo_->comp(i).name() << "="
                              << n_[i] / nt;
            std::cout << "\n";
            return;
        }
    }
    std::cout << "    note: steady-state seed reached the relaxation horizon ("
              << maxSteps << " steps) without a tight fixed point --- using the"
              << " last relaxed state (T0=" << T_ << " K) as an approximate"
              << " operating point.\n";
}

// -----------------------------------------------------------------------
//  Arrhenius rate: r = k(T) · ∏_j (n_j / V)^{order_j}    [kmol/(m³·s)]
// -----------------------------------------------------------------------
scalar DynamicCSTR::rateOfReaction_(const ReactionSpec& rxn,
                                    scalar               T,
                                    const sVector&       n,
                                    scalar               V) const
{
    // LHHW answers for itself: the shared RateLaw carries the basis (concentration
    // or activity), the adsorption denominator and the reverse leg.  With conc in
    // kmol/m^3, a `catalystLoading` in kg/m^3 turns a per-gram rate constant into
    // the reactor's volumetric one exactly: mol/(g.s) x kg/m^3 = kmol/(m^3.s).
    if (rxn.lhhw)
    {
        const std::size_t nc = n.size();
        sVector conc(nc, 0.0), x(nc, 0.0);
        scalar ntot = 0.0;
        for (std::size_t j = 0; j < nc; ++j)
        { conc[j] = std::max<scalar>(n[j], 0.0) / V; ntot += std::max<scalar>(n[j], 0.0); }
        if (ntot > 0.0) for (std::size_t j = 0; j < nc; ++j) x[j] = std::max<scalar>(n[j], 0.0) / ntot;
        const scalar cf = (catalystLoading_ > 0.0) ? catalystLoading_ : 1.0;
        return cf * rxn.law.netRate(*thermo_, T, conc, x);
    }

    const scalar k = rxn.A_pre * std::exp(-rxn.Ea / (constant::R * T));
    scalar r = k;
    for (std::size_t s = 0; s < rxn.comps.size(); ++s)
    {
        if (rxn.order[s] <= 0.0) continue;
        const scalar c_i = n[rxn.comps[s]] / V;
        r *= std::pow(std::max<scalar>(c_i, 0.0), rxn.order[s]);
    }
    return r;
}

// -----------------------------------------------------------------------
//  Combined derivatives for the packed state.
//      packed[0..N-1] = n_i [kmol]
//      packed[N]      = T   [K]
//
//   dn_i/dt = F_in · z_in_i  -  F_out · (n_i/Σn)  +  Σ_r ν_{i,r} · r_r · V
//   Σn·Cp · dT/dt = F_in·Cp_in·(T_in-T) + (UA/1000)·(T_j-T) - Σ_r r_r·V·ΔH_r
//
//  F_out = F_in (constant-volume CSTR; assumes incompressible liquid).
// -----------------------------------------------------------------------
sVector DynamicCSTR::derivatives_(const sVector& packed) const
{
    const std::size_t N = packed.size() - 1;
    sVector n(N);
    for (std::size_t i = 0; i < N; ++i) n[i] = packed[i];
    const scalar T = packed[N];

    scalar nTot = 0.0;
    for (auto v : n) nTot += std::max<scalar>(v, 0.0);

    sVector dydt(N + 1, 0.0);

    // ---- Mass balance per component -----------------------------------
    const scalar F_out = F_in_;   // constant-volume assumption
    for (std::size_t i = 0; i < N; ++i)
    {
        const scalar x_i = (nTot > 0) ? n[i] / nTot : 0.0;
        dydt[i] = F_in_ * z_in_[i] - F_out * x_i;
    }

    // ---- Reactions ----------------------------------------------------
    scalar heatRxn = 0.0;   // kJ/s released (signed: + means absorbed)
    for (const auto& rxn : reactions_)
    {
        const scalar rr = rateOfReaction_(rxn, T, n, V_);   // kmol/(m³·s)
        for (std::size_t s = 0; s < rxn.comps.size(); ++s)
            dydt[rxn.comps[s]] += rxn.nu[s] * rr * V_;       // kmol/s
        heatRxn += rxn.dH * rr * V_;                         // kJ/s (dH J/mol · kmol/s = kJ/s)
    }

    // ---- Energy balance ----------------------------------------------
    //  CpTot (in kJ/K) = Σ n_i · Cp_liq_i(T)   (Cp J/(mol·K) ≡ kJ/(kmol·K))
    scalar CpTot = 0.0;
    for (std::size_t i = 0; i < N; ++i)
        CpTot += n[i] * thermo_->comp(i).cpLiquid().Cp(T);

    if (CpTot > 1.0e-30)
    {
        scalar CpInAvg = 0.0;
        for (std::size_t i = 0; i < N; ++i)
            CpInAvg += z_in_[i] * thermo_->comp(i).cpLiquid().Cp(T);
        const scalar convective = F_in_ * CpInAvg * (T_in_ - T);  // kJ/s
        const scalar jacket     = (UA_ / 1000.0) * (T_jacket_ - T); // kJ/s
        dydt[N] = (convective + jacket - heatRxn) / CpTot;          // K/s
    }
    return dydt;
}

void DynamicCSTR::step(scalar /*t*/, scalar dt)
{
    const std::size_t N = n_.size();
    sVector y(N + 1);
    for (std::size_t i = 0; i < N; ++i) y[i] = n_[i];
    y[N] = T_;

    auto axpy = [](const sVector& a, scalar c, const sVector& b)
    {
        sVector r(a.size());
        for (std::size_t i = 0; i < a.size(); ++i) r[i] = a[i] + c * b[i];
        return r;
    };

    auto k1 = derivatives_(y);
    auto k2 = derivatives_(axpy(y, 0.5*dt, k1));
    auto k3 = derivatives_(axpy(y, 0.5*dt, k2));
    auto k4 = derivatives_(axpy(y,     dt, k3));

    for (std::size_t i = 0; i < y.size(); ++i)
        y[i] += dt / 6.0 * (k1[i] + 2.0*k2[i] + 2.0*k3[i] + k4[i]);

    for (std::size_t i = 0; i < N; ++i)
        n_[i] = std::max<scalar>(y[i], 0.0);
    T_ = y[N];
}

// ---- Packed-ODE form (the adaptive driver) ------------------------------
//  Pack/unpack mirror step()'s convention EXACTLY: (n_0..n_{N-1}, T).
sVector DynamicCSTR::odeState() const
{
    const std::size_t N = n_.size();
    sVector y(N + 1);
    for (std::size_t i = 0; i < N; ++i) y[i] = n_[i];
    y[N] = T_;
    return y;
}

void DynamicCSTR::setOdeState(const sVector& y)
{
    const std::size_t N = n_.size();
    for (std::size_t i = 0; i < N; ++i)
        n_[i] = std::max<scalar>(y[i], 0.0);
    T_ = y[N];
}

sVector DynamicCSTR::stateVector() const
{
    sVector s = n_;
    s.push_back(T_);
    s.push_back(F_in_);
    for (auto z : z_in_) s.push_back(z);
    return s;
}

std::vector<std::string> DynamicCSTR::stateLabels() const
{
    std::vector<std::string> labels;
    labels.reserve(2 * n_.size() + 2);
    for (std::size_t i = 0; i < n_.size(); ++i)
        labels.push_back("n_" + thermo_->comp(i).name());
    labels.push_back("T");
    // Inlet DERIVED views (forum #103: an inlet-field disturbance must
    // prove that F and z changed by the derived values, not merely that
    // the reactor responded) -- constant columns for undisturbed cases.
    labels.push_back("F_in");
    for (std::size_t i = 0; i < n_.size(); ++i)
        labels.push_back("z_in_" + thermo_->comp(i).name());
    return labels;
}

ContinuousStream DynamicCSTR::outletStream() const
{
    ContinuousStream s;
    s.F = F_in_;                              // constant volume → F_out = F_in
    s.T = T_;
    s.P = P_;
    s.z.assign(n_.size(), 0.0);
    scalar nTot = 0;
    for (auto v : n_) nTot += v;
    if (nTot > 0)
        for (std::size_t i = 0; i < n_.size(); ++i) s.z[i] = n_[i] / nTot;
    return s;
}

ContinuousStream DynamicCSTR::inletStream() const
{
    // The instantaneous FEED face: F_in/T_in/P/z_in held at the current MV
    // state.  Mirror of outletStream() --- a read-only projection, no physics.
    ContinuousStream s;
    s.F = F_in_;
    s.T = T_in_;
    s.P = P_;
    s.z = z_in_;
    return s;
}

void DynamicCSTR::applyInletFlows_()
{
    scalar F = 0.0;
    for (auto v : nDotIn_) F += v;
    F_in_ = F;
    if (F > 0.0)
        for (std::size_t i = 0; i < nDotIn_.size(); ++i)
            z_in_[i] = nDotIn_[i] / F;
    // F == 0: keep the last z (a temporarily shut feed has no composition
    // of its own; the flows are authoritative and all zero).
}

void DynamicCSTR::setMV(const std::string& key, scalar value)
{
    if (key == "T_jacket") { T_jacket_ = value; return; }
    if (key == "T_in")     { T_in_     = value; return; }
    if (key == "F_in")
    {
        if (value < 0.0)
            throw std::runtime_error("DynamicCSTR '" + name_ + "': F_in"
                " must be ≥ 0 (got " + std::to_string(value) + ")");
        // Total-flow MV: scales the authoritative component flows
        // PROPORTIONALLY (composition preserved -- the historical F_in
        // semantics, now stated).
        if (F_in_ > 0.0)
        {
            const scalar f = value / F_in_;
            for (auto& v : nDotIn_) v *= f;
        }
        else
            for (std::size_t i = 0; i < nDotIn_.size(); ++i)
                nDotIn_[i] = value * z_in_[i];
        applyInletFlows_();
        return;
    }
    // ---- Inlet-field actuators (forum #100.4/#101/#103) ------------------
    if (key.rfind("moleFraction.", 0) == 0)
    {
        // ABSOLUTE mole fraction of one component; the OTHERS renormalise
        // proportionally and the TOTAL molar flow F_in is held.  Validated
        // hard: the disturbance never fabricates or destroys total feed.
        const std::string nm = key.substr(std::string("moleFraction.").size());
        const std::size_t c  = thermo_->indexOf(nm);
        if (value < 0.0 || value > 1.0)
            throw std::runtime_error("DynamicCSTR '" + name_ + "': "
                + key + " must lie in [0, 1] (got "
                + std::to_string(value) + ")");
        const scalar F = F_in_;
        scalar restOld = 0.0;
        for (std::size_t i = 0; i < z_in_.size(); ++i)
            if (i != c) restOld += z_in_[i];
        if (restOld <= 0.0 && value < 1.0)
            throw std::runtime_error("DynamicCSTR '" + name_ + "': "
                + key + " = " + std::to_string(value) + " needs the OTHER"
                " components renormalised proportionally, but they are all"
                " zero in the current inlet -- there is no proportion to"
                " preserve.  Use componentMolarFlow.<c> instead.");
        sVector zNew(z_in_.size(), 0.0);
        zNew[c] = value;
        const scalar scale = (restOld > 0.0) ? (1.0 - value) / restOld : 0.0;
        scalar sum = value;
        for (std::size_t i = 0; i < z_in_.size(); ++i)
        {
            if (i == c) continue;
            zNew[i] = z_in_[i] * scale;
            sum += zNew[i];
        }
        if (std::abs(sum - 1.0) > 1.0e-12)
            throw std::runtime_error("DynamicCSTR '" + name_ + "': "
                + key + " renormalisation failed the machine-precision sum"
                " check (sum = " + std::to_string(sum) + ")");
        for (std::size_t i = 0; i < zNew.size(); ++i)
            nDotIn_[i] = F * zNew[i];
        applyInletFlows_();
        return;
    }
    if (key.rfind("componentMolarFlow.", 0) == 0)
    {
        // ABSOLUTE molar flow of one component [kmol/s]; the others keep
        // their flows, so F_in and z_in both change by DERIVED values --
        // the disturbance never hides from the other components (#101).
        const std::string nm =
            key.substr(std::string("componentMolarFlow.").size());
        const std::size_t c = thermo_->indexOf(nm);
        if (value < 0.0)
            throw std::runtime_error("DynamicCSTR '" + name_ + "': "
                + key + " must be >= 0 kmol/s (got "
                + std::to_string(value) + ")");
        nDotIn_[c] = value;
        applyInletFlows_();
        return;
    }
    DynamicUnitOperation::setMV(key, value);  // throws
}

scalar DynamicCSTR::getCV(const std::string& key) const
{
    if (key == "T")        return T_;
    if (key == "T_jacket") return T_jacket_;
    if (key == "F_in")     return F_in_;
    if (key == "T_in")     return T_in_;

    if (key == "n_total")
    {
        scalar s = 0;
        for (auto v : n_) s += v;
        return s;
    }
    // Try x_<name>
    if (key.rfind("x_", 0) == 0)
    {
        const std::string nm = key.substr(2);
        const std::size_t i  = thermo_->indexOf(nm);
        scalar nTot = 0; for (auto v : n_) nTot += v;
        return (nTot > 0) ? n_[i] / nTot : 0.0;
    }
    return DynamicUnitOperation::getCV(key);  // throws
}

std::vector<std::string> DynamicCSTR::availableMVs() const
{
    std::vector<std::string> v = { "T_jacket", "T_in", "F_in" };
    for (std::size_t i = 0; i < n_.size(); ++i)
    {
        v.push_back("moleFraction." + thermo_->comp(i).name());
        v.push_back("componentMolarFlow." + thermo_->comp(i).name());
    }
    return v;
}

std::vector<std::string> DynamicCSTR::availableCVs() const
{
    std::vector<std::string> v = { "T", "T_jacket", "F_in", "T_in", "n_total" };
    for (std::size_t i = 0; i < n_.size(); ++i)
        v.push_back("x_" + thermo_->comp(i).name());
    return v;
}

} // namespace Choupo
