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

#include "BatchAdsorber.H"

#include "core/Constants.H"
#include "streams/Composition.H"
#include "thermo/ThermoAnnounce.H"
#include "thermo/ThermoPackage.H"
#include "thermo/adsorbent/Adsorbent.H"
#include "thermo/adsorbent/AdsorbentRegistry.H"
#include "solver/ODE/ODEIntegrator.H"

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace Choupo {

namespace {

// Resolve an adsorbent by name.  choupoBatch does not pre-load the
// adsorbent catalogue at start-up (choupoSolve does), so when byName
// cannot find it -- and no case-local constant/adsorbents/ overlay
// answered -- load the standards catalogue explicitly from CHOUPO_HOME
// or by walking up from the case directory, ANNOUNCED, then retry.
const Adsorbent& resolveAdsorbent(const std::string& name, int verbosity)
{
    namespace fs = std::filesystem;
    try
    {
        return AdsorbentRegistry::byName(name);
    }
    catch (const std::exception&)
    {
        fs::path dataRoot;
        if (const char* env = std::getenv("CHOUPO_HOME"))
            dataRoot = fs::path(env) / "data";
        else
        {
            fs::path p = fs::current_path();
            for (int up = 0; up < 8; ++up)
            {
                if (fs::exists(p / "data" / "standards" / "adsorbents"))
                {
                    dataRoot = p / "data";
                    break;
                }
                if (!p.has_parent_path() || p == p.parent_path()) break;
                p = p.parent_path();
            }
        }
        if (dataRoot.empty()) throw;
        if (verbosity >= 2)
            std::cout << "  [batchAdsorber] adsorbent catalogue loaded from "
                      << (dataRoot / "standards" / "adsorbents").string()
                      << "\n";
        AdsorbentRegistry::loadFrom(dataRoot.string());
        return AdsorbentRegistry::byName(name);
    }
}

} // anonymous namespace

void BatchAdsorber::initialise(const DictPtr&       unitDict,
                               const ThermoPackage& thermo,
                               const DictPtr&       /*reactionsDict*/)
{
    thermo_ = &thermo;
    const std::size_t n = thermo.n();
    compNames_.clear();
    compNames_.reserve(n);
    for (std::size_t i = 0; i < n; ++i)
        compNames_.push_back(thermo.comp(i).name());

    // Verbosity: the run's controlDict level, overridable per unit via
    // `solver { verbosity ...; }` (same convention as BatchReactor).
    verbosity_ = thermoAnnounceLevel();
    if (unitDict->found("solver"))
    {
        auto solverDict = unitDict->subDict("solver");
        integrator_ = solverDict->lookupWordOrDefault("integrator", "RK4");
        verbosity_  = static_cast<int>(
            solverDict->lookupScalarOrDefault("verbosity", verbosity_));
    }

    // -----------------------------------------------------------------
    //  Initial state: T, V (= the GAS headspace volume), gas charge.
    // -----------------------------------------------------------------
    auto initDict = unitDict->subDict("initial");
    state_.T = initDict->lookupScalar("T", Dims::temperature);
    state_.V = initDict->lookupScalar("V", Dims::volume);
    if (state_.V <= 0.0)
        throw std::runtime_error("batchAdsorber '" + name_ + "': initial.V = "
            + std::to_string(state_.V) + " m3 -- the gas headspace volume"
            " must be > 0");
    const scalar nTotGas = initDict->lookupScalar("totalMoles", Dims::amount);
    if (nTotGas <= 0.0)
        throw std::runtime_error("batchAdsorber '" + name_
            + "': initial.totalMoles = " + std::to_string(nTotGas)
            + " kmol -- must be > 0");

    const sVector x =
        readComposition(initDict, thermo, "batchAdsorber '" + name_ + "' init");
    state_.n.assign(n, 0.0);
    for (std::size_t i = 0; i < n; ++i) state_.n[i] = nTotGas * x[i];

    // -----------------------------------------------------------------
    //  Operation: adsorbent (by NAME, curated catalogue), charge, T pin.
    // -----------------------------------------------------------------
    auto opDict = unitDict->subDict("operation");

    m_ads_ = opDict->lookupScalar("m_ads", Dims::mass);
    if (m_ads_ <= 0.0)
    {
        std::ostringstream os;
        os << "batchAdsorber '" << name_ << "': operation.m_ads = " << m_ads_
           << " kg -- must be > 0 (the adsorbent charge is declared"
              " equipment data)";
        throw std::runtime_error(os.str());
    }

    T_setpoint_ = opDict->found("T_setpoint")
                  ? opDict->lookupScalar("T_setpoint", Dims::temperature)
                  : state_.T;
    if (T_setpoint_ <= 0.0)
        throw std::runtime_error("batchAdsorber '" + name_
            + "': T_setpoint must be a positive absolute temperature [K]");
    state_.T = T_setpoint_;

    adsorbentName_ = opDict->lookupWord("adsorbent");
    ads_ = &resolveAdsorbent(adsorbentName_, verbosity_);

    // -----------------------------------------------------------------
    //  kLDF: EQUIPMENT/SAMPLE kinetics -- case data, never catalogue data.
    //  basis declared (accepted set in A2: { solidFilm }); scope + source
    //  MANDATORY (sample provenance lives with the numbers, one block).
    // -----------------------------------------------------------------
    k_.assign(n, 0.0);
    std::vector<bool> hasK(n, false);
    if (opDict->found("kLDF"))
    {
        auto kldf = opDict->subDict("kLDF");

        const std::string basis =
            kldf->lookupWordOrDefault("basis", "(missing)");
        if (basis != "solidFilm")
            throw std::runtime_error("batchAdsorber '" + name_
                + "': kLDF.basis '" + basis + "' is not accepted -- the"
                " accepted set in A2 is { solidFilm } (solid-film linear"
                " driving force, dq/dt = k*(q* - q)).  Declare `basis"
                " solidFilm;`");

        if (!kldf->found("scope") || !kldf->found("source"))
            throw std::runtime_error("batchAdsorber '" + name_
                + "': kLDF is equipment/sample data -- declare scope (what"
                " pellet/sample this k describes) and source (where the"
                " number came from)");

        auto kdict = kldf->subDict("k");
        for (const auto& sp : kdict->keys())
        {
            auto it = std::find(compNames_.begin(), compNames_.end(), sp);
            if (it == compNames_.end())
            {
                if (!ads_->has(sp))
                    throw std::runtime_error("batchAdsorber '" + name_
                        + "': operation.kLDF.k lists '" + sp + "' but"
                        " adsorbent '" + adsorbentName_ + "' carries no"
                        " isotherm record for it"
                        " (data/standards/parameters/adsorption/equilibria/"
                        + adsorbentName_ + "/, or the case-local"
                        " constant/parameters/adsorption/equilibria/"
                        + adsorbentName_ + "/ overlay)");
                throw std::runtime_error("batchAdsorber '" + name_
                    + "': operation.kLDF.k lists '" + sp + "' but it is not"
                    " a component of this case (constant/propertyDict"
                    " components)");
            }
            const std::size_t i =
                static_cast<std::size_t>(it - compNames_.begin());
            if (!ads_->has(sp))
                throw std::runtime_error("batchAdsorber '" + name_
                    + "': operation.kLDF.k lists '" + sp + "' but adsorbent '"
                    + adsorbentName_ + "' carries no isotherm record for it"
                    " (data/standards/parameters/adsorption/equilibria/"
                    + adsorbentName_ + "/, or the case-local"
                    " constant/parameters/adsorption/equilibria/"
                    + adsorbentName_ + "/ overlay)");
            const scalar kv = kdict->lookupScalar(sp, Dims::inverseTime);
            if (kv <= 0.0)
            {
                std::ostringstream os;
                os << "batchAdsorber '" << name_ << "': operation.kLDF.k."
                   << sp << " = " << kv << " 1/s -- must be > 0 (declared"
                      " equipment kinetics, no default)";
                throw std::runtime_error(os.str());
            }
            k_[i]   = kv;
            hasK[i] = true;
        }
    }

    // -----------------------------------------------------------------
    //  Species classification (I = isotherm record, K = kLDF.k entry):
    //  I&&K adsorbing; I&&!K FATAL (no kinetic default); !I&&K FATAL
    //  (handled above); !I&&!K inert, ANNOUNCED.
    // -----------------------------------------------------------------
    adsorbing_.assign(n, false);
    for (std::size_t i = 0; i < n; ++i)
    {
        const bool hasIso = ads_->has(compNames_[i]);
        if (hasIso && hasK[i])
        {
            adsorbing_[i] = true;
            if (verbosity_ >= 2)
                std::cout << "  [batchAdsorber '" << name_ << "'] "
                          << compNames_[i] << ": "
                          << ads_->isotherm(compNames_[i])->model()
                          << " isotherm on " << adsorbentName_
                          << ", k_LDF = " << k_[i]
                          << " 1/s (basis solidFilm)\n";
        }
        else if (hasIso && !hasK[i])
        {
            throw std::runtime_error("batchAdsorber '" + name_
                + "': component '" + compNames_[i] + "' has an isotherm"
                " record on '" + adsorbentName_ + "' but no LDF constant --"
                " declare operation.kLDF.k." + compNames_[i]
                + " (equipment data, no default)");
        }
        else if (verbosity_ >= 1)
        {
            std::cout << "  [batchAdsorber '" << name_ << "'] "
                      << compNames_[i] << ": no isotherm record on "
                      << adsorbentName_ << " -> inert (q = 0), stays in the"
                      " gas phase\n";
        }
    }

    // -----------------------------------------------------------------
    //  Initial loading: default 0 (regenerated adsorbent), ANNOUNCED;
    //  declare initial.initialLoading{} [mol/kg] to override.
    // -----------------------------------------------------------------
    q_.assign(n, 0.0);
    if (initDict->found("initialLoading"))
    {
        auto ql = initDict->subDict("initialLoading");
        for (const auto& sp : ql->keys())
        {
            auto it = std::find(compNames_.begin(), compNames_.end(), sp);
            if (it == compNames_.end())
                throw std::runtime_error("batchAdsorber '" + name_
                    + "': initial.initialLoading lists '" + sp + "' but it"
                    " is not a component of this case (constant/propertyDict"
                    " components)");
            const scalar q0v = ql->lookupScalar(sp);
            if (q0v < 0.0)
            {
                std::ostringstream os;
                os << "batchAdsorber '" << name_
                   << "': initial.initialLoading." << sp << " = " << q0v
                   << " mol/kg -- must be >= 0";
                throw std::runtime_error(os.str());
            }
            q_[static_cast<std::size_t>(it - compNames_.begin())] = q0v;
        }
    }
    else if (verbosity_ >= 2)
    {
        std::cout << "  [batchAdsorber '" << name_ << "'] initialLoading: 0"
                     " (fresh adsorbent) -- declare initialLoading{} to"
                     " override\n";
    }
    q0_ = q_;

    // -----------------------------------------------------------------
    //  Per-species inventory invariant + the ideal-gas headspace pressure.
    //  P is a RESULT (ideal gas closes Duhem: n, T, V determine it); a
    //  declared initial.P is honoured ONLY as an honest cross-check.
    // -----------------------------------------------------------------
    nTot_.assign(n, 0.0);
    scalar P0 = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        nTot_[i] = state_.n[i] * 1000.0 + m_ads_ * q_[i];   // mol
        P0 += state_.n[i] * 1000.0 * constant::R * T_setpoint_ / state_.V;
    }
    if (verbosity_ >= 2)
        std::cout << "  [batchAdsorber '" << name_ << "'] ideal-gas"
                     " headspace (A2 assumption): p_i = n_gas_i*R*T/V;"
                     " P0 = " << P0 << " Pa = " << P0 * 1.0e-5 << " bar\n";

    if (initDict->found("P"))
    {
        const scalar Pdecl = initDict->lookupScalar("P", Dims::pressure);
        const scalar rel   = std::abs(Pdecl - P0) / std::max(P0, 1.0e-30);
        if (rel > 1.0e-3)
        {
            std::ostringstream os;
            os << "batchAdsorber '" << name_ << "': declared P inconsistent"
                  " with n*R*T/V -- initial.P = " << Pdecl << " Pa ("
               << Pdecl * 1.0e-5 << " bar) but n*R*T/V = " << P0 << " Pa ("
               << P0 * 1.0e-5 << " bar), relative deviation " << rel
               << " > 1e-3.  P of a closed ideal-gas headspace is a RESULT"
                  " (n, T, V fix it): remove initial.P or fix the state.";
            throw std::runtime_error(os.str());
        }
        if (verbosity_ >= 2)
            std::cout << "  [batchAdsorber '" << name_ << "'] declared"
                         " initial.P cross-checks against n*R*T/V (relative"
                         " deviation " << rel << " <= 1e-3)\n";
    }
    state_.P = P0;

    // -----------------------------------------------------------------
    //  Stiffness bound, PRINTED (no silent crutch): the worst local
    //  eigenvalue is k_eff = k*(1 + m_ads*alpha) with alpha =
    //  (dq*/dp at the origin)*R*T/V [1/kg]; explicit RK4 is stable for
    //  deltaT < 2.785/k_eff,max.
    // -----------------------------------------------------------------
    if (verbosity_ >= 2)
    {
        scalar keffMax = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            if (!adsorbing_[i]) continue;
            const IsothermModel* iso = ads_->isotherm(compNames_[i]);
            const scalar alpha = iso->dq_dp(T_setpoint_, 0.0)
                               * constant::R * T_setpoint_ / state_.V;
            keffMax = std::max(keffMax, k_[i] * (1.0 + m_ads_ * alpha));
        }
        if (keffMax > 0.0)
        {
            const scalar dtBound = 2.785 / keffMax;
            std::cout << "  [batchAdsorber '" << name_ << "'] LDF stiffness:"
                         " k_eff,max = " << keffMax << " 1/s -> RK4 requires"
                         " deltaT < " << dtBound << " s";
            // The unit does not receive deltaT; read the case controlDict
            // (we run chdir'ed into the case) so the verdict is concrete.
            try
            {
                if (std::filesystem::exists("system/controlDict"))
                {
                    auto cd = Dictionary::fromFile("system/controlDict");
                    const scalar dt = cd->lookupScalarOrDefault("deltaT", 0.0);
                    if (dt > 0.0 && integrator_ == "RK4")
                        std::cout << " (deltaT = " << dt << " s "
                                  << (dt < dtBound ? "ok" :
                                      "EXCEEDS the bound -- reduce deltaT or"
                                      " select solver { integrator"
                                      " Rosenbrock23; }") << ")";
                    else if (dt > 0.0)
                        std::cout << " (integrator " << integrator_
                                  << ": error-controlled, bound"
                                     " informational)";
                }
            }
            catch (const std::exception&) { /* verdict stays generic */ }
            std::cout << "\n";
        }
        std::cout << "  [batchAdsorber '" << name_ << "'] KPI"
                     " Q_ads_isosteric_kJ is a model-consistent estimate"
                     " (van't Hoff dH_ads), NOT a ledgered duty\n";
    }
}

// -----------------------------------------------------------------------
//  Ideal-gas partial pressures of a CANDIDATE loading vector [Pa]:
//  n_gas_i = n_tot_i - m_ads*q_i (the algebraic closure), p_i = n R T / V.
// -----------------------------------------------------------------------
std::map<std::string, scalar>
BatchAdsorber::partialPressures_(const sVector& q) const
{
    std::map<std::string, scalar> p;
    for (std::size_t i = 0; i < compNames_.size(); ++i)
    {
        const scalar nGas = nTot_[i] - m_ads_ * q[i];   // mol
        p[compNames_[i]] = nGas * constant::R * T_setpoint_ / state_.V;
    }
    return p;
}

sVector BatchAdsorber::odeDerivative(const sVector& y) const
{
    const std::size_t n = compNames_.size();
    const auto p = partialPressures_(y);

    sVector dydt(n, 0.0);
    for (std::size_t i = 0; i < n; ++i)
    {
        if (!adsorbing_[i]) continue;
        const scalar qStar = ads_->loading(compNames_[i], p, T_setpoint_);
        dydt[i] = k_[i] * (qStar - y[i]);
    }
    return dydt;
}

// -----------------------------------------------------------------------
//  Commit a loading vector: reconstruct n_gas from the invariant (the
//  closure is ONE subtraction -- exact by construction), guard the
//  overshoot, refresh the visible state.  Never a clamp.
// -----------------------------------------------------------------------
void BatchAdsorber::commitLoadings_(const sVector& y)
{
    const std::size_t n = compNames_.size();
    sVector nGas(n, 0.0);
    for (std::size_t i = 0; i < n; ++i)
    {
        nGas[i] = nTot_[i] - m_ads_ * y[i];              // mol
        if (nGas[i] < -1.0e-12 * std::max(nTot_[i], 1.0))
            throw std::runtime_error("batchAdsorber '" + name_
                + "': integration overshoot on '" + compNames_[i]
                + "': n_gas < 0 -- reduce deltaT or select solver"
                " { integrator Rosenbrock23; }");
    }
    scalar Ptot = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        q_[i]       = y[i];
        state_.n[i] = nGas[i] / 1000.0;                  // kmol (gas phase)
        Ptot += nGas[i] * constant::R * T_setpoint_ / state_.V;
    }
    state_.T = T_setpoint_;
    state_.P = Ptot;                                     // Pa
}

void BatchAdsorber::setOdeState(const sVector& y)
{
    commitLoadings_(y);
}

void BatchAdsorber::step(scalar /*t*/, scalar dt)
{
    sVector y = q_;

    if (integrator_ == "RK4")
    {
        auto axpy = [](const sVector& a, scalar f, const sVector& b)
        {
            sVector r(a.size());
            for (std::size_t i = 0; i < a.size(); ++i) r[i] = a[i] + f * b[i];
            return r;
        };
        const auto k1 = odeDerivative(y);
        const auto k2 = odeDerivative(axpy(y, 0.5 * dt, k1));
        const auto k3 = odeDerivative(axpy(y, 0.5 * dt, k2));
        const auto k4 = odeDerivative(axpy(y,       dt, k3));
        for (std::size_t i = 0; i < y.size(); ++i)
            y[i] += dt / 6.0 * (k1[i] + 2.0*k2[i] + 2.0*k3[i] + k4[i]);
    }
    else
    {
        if (!solver::ODEIntegrator::known(integrator_))
            solver::ODEIntegrator::registerBuiltins();
        auto integ = solver::ODEIntegrator::New(integrator_);

        solver::DerivFn f =
            [this](scalar /*tt*/, const sVector& yy)
            { return odeDerivative(yy); };

        solver::ODEControls ctrl;
        ctrl.atol.assign(y.size(), 1.0e-12);   // q rows [mol/kg]
        ctrl.rtol      = 1.0e-7;
        ctrl.nPositive = y.size();             // loadings must stay >= 0
        ctrl.verbosity = verbosity_;
        integ->integrate(y, 0.0, dt, f, ctrl);
    }

    commitLoadings_(y);
}

// -----------------------------------------------------------------------
//  Ledgers and hooks.
// -----------------------------------------------------------------------
sVector BatchAdsorber::materialInventory() const
{
    sVector inv(state_.n.size(), 0.0);
    for (std::size_t i = 0; i < state_.n.size(); ++i)
        inv[i] = state_.n[i] + m_ads_ * q_[i] / 1000.0;   // kmol, all phases
    return inv;
}

scalar BatchAdsorber::vesselEnthalpy(bool& ok, std::string& why) const
{
    ok  = false;
    why = "gas + adsorbed-phase inventory not priceable on the elements"
          " datum until A4 (dH_ads/Cp wiring)";
    return 0.0;
}

std::string BatchAdsorber::energyLedgerGap() const
{
    return "isothermal adsorption duty not yet ledgered (dH_ads/Cp pricing"
           " lands in A4)";
}

void BatchAdsorber::notifyStateChanged()
{
    // A recipe charge/discharge changed the GAS side: the invariant is
    // redefined at the instant of transfer, so the closure holds by
    // construction again from here on.
    scalar Ptot = 0.0;
    for (std::size_t i = 0; i < state_.n.size(); ++i)
    {
        nTot_[i] = state_.n[i] * 1000.0 + m_ads_ * q_[i];
        Ptot += state_.n[i] * 1000.0 * constant::R * T_setpoint_ / state_.V;
    }
    state_.T = T_setpoint_;   // isothermal: the jacket re-pins T
    state_.P = Ptot;
}

void BatchAdsorber::setOperationParameter(const std::string& key, scalar value)
{
    if (key == "T_setpoint" || key == "T")
    {
        if (value <= 0.0)
            throw std::runtime_error("batchAdsorber '" + name_
                + "': T_setpoint must be a positive absolute temperature");
        const scalar Told = T_setpoint_;
        T_setpoint_ = value;
        state_.T    = value;
        // p = n R T / V responds instantly to the pinned T.
        scalar Ptot = 0.0;
        for (std::size_t i = 0; i < state_.n.size(); ++i)
            Ptot += state_.n[i] * 1000.0 * constant::R * T_setpoint_
                  / state_.V;
        state_.P = Ptot;
        if (verbosity_ >= 2 && value != Told)
            std::cout << "  [batchAdsorber '" << name_ << "'] T_setpoint "
                      << Told << " K -> " << value << " K (the isotherm"
                         " shifts via van't Hoff; the impulse energy stays"
                         " in the named A4 ledger gap)\n";
        return;
    }
    BatchUnitOperation::setOperationParameter(key, value);
}

scalar BatchAdsorber::closureWorstRel_() const
{
    scalar worst = 0.0;
    for (std::size_t i = 0; i < state_.n.size(); ++i)
    {
        if (nTot_[i] <= 0.0) continue;
        const scalar res =
            std::abs(state_.n[i] * 1000.0 + m_ads_ * q_[i] - nTot_[i]);
        worst = std::max(worst, res / nTot_[i]);
    }
    return worst;
}

scalar BatchAdsorber::isostericHeat_(std::size_t i) const
{
    // van't Hoff extraction from the A1 equilibrium surface itself: at a
    // probe pressure deep in the Henry regime, ln q is exactly linear in
    // 1/T for both registered models, so dH_ads = -R * dln(q)/d(1/T).
    const IsothermModel* m = ads_->isotherm(compNames_[i]);
    if (!m) return 0.0;
    const scalar dT = 5.0;
    const scalar T1 = T_setpoint_ - dT;
    const scalar T2 = T_setpoint_ + dT;
    if (T1 <= 0.0) return 0.0;
    const scalar pProbe = 1.0e-4;   // Pa: b*p ~ 1e-8 for the strongest pair
    const scalar q1 = m->q(T1, pProbe);
    const scalar q2 = m->q(T2, pProbe);
    if (q1 <= 0.0 || q2 <= 0.0 || q1 == q2) return 0.0;
    return -constant::R * std::log(q2 / q1) / (1.0 / T2 - 1.0 / T1);
}

std::vector<std::pair<std::string, scalar>>
BatchAdsorber::trajectoryExtras() const
{
    std::vector<std::pair<std::string, scalar>> ex;
    for (std::size_t i = 0; i < compNames_.size(); ++i)
        if (adsorbing_[i])
            ex.emplace_back("q_" + compNames_[i], q_[i]);
    for (std::size_t i = 0; i < compNames_.size(); ++i)
        ex.emplace_back("p_" + compNames_[i] + "_bar",
            state_.n[i] * 1000.0 * constant::R * T_setpoint_
            / state_.V * 1.0e-5);
    ex.emplace_back("P_total_bar", state_.P * 1.0e-5);
    for (std::size_t i = 0; i < compNames_.size(); ++i)
        if (adsorbing_[i])
            ex.emplace_back("uptake_" + compNames_[i] + "_mol",
                m_ads_ * (q_[i] - q0_[i]));
    ex.emplace_back("closure_worst_rel", closureWorstRel_());
    return ex;
}

std::map<std::string, scalar> BatchAdsorber::kpis() const
{
    std::map<std::string, scalar> k;
    scalar Qads = 0.0;   // kJ, model-consistent estimate (announced label)
    for (std::size_t i = 0; i < compNames_.size(); ++i)
    {
        if (!adsorbing_[i]) continue;
        k["q_" + compNames_[i] + "_final"]    = q_[i];
        k["uptake_" + compNames_[i] + "_mol"] = m_ads_ * (q_[i] - q0_[i]);
        Qads += m_ads_ * (q_[i] - q0_[i]) * isostericHeat_(i) / 1000.0;
    }
    k["closure_worst_rel"]  = closureWorstRel_();
    k["Q_ads_isosteric_kJ"] = Qads;
    return k;
}

} // namespace Choupo
