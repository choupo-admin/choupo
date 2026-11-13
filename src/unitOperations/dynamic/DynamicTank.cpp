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
-------------------------------------------------------------------------------
File
    src/unitOperations/dynamic/DynamicTank.cpp

Description
    See DynamicTank.H.
\*---------------------------------------------------------------------------*/

#include "DynamicTank.H"
#include "streams/Composition.H"

#include <algorithm>
#include <cmath>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace Choupo {

namespace VVH = VariableVolumeHoldup;

void DynamicTank::initialise(const DictPtr&        unitDict,
                             const ThermoPackage&  thermo,
                             const DictPtr&        /*reactionsDict*/)
{
    thermo_ = &thermo;
    const std::size_t N = thermo.n();
    const std::string who = "dynamicTank '" + name_ + "'";

    if (unitDict->found("reaction") || unitDict->found("reactions"))
        throw std::runtime_error(who + ": a tank reacts nothing -- a vessel"
            " with a reaction and a level is the variable-volume CSTR, not"
            " this unit");

    // ---- Initial holdup ------------------------------------------------
    auto initDict = unitDict->subDict("initial");
    T_ = initDict->lookupScalar("T");
    P_ = initDict->lookupScalarOrDefault("P", 101325.0);          // Pa
    const sVector x = readComposition(initDict, thermo, who + " init");

    // ---- Declared geometry and outflow ---------------------------------
    auto op = unitDict->subDict("operation");
    geom_ = VVH::VerticalCylinder::read(
        op->found("geometry") ? op->subDict("geometry") : nullptr, who);

    UA_       = op->lookupScalarOrDefault("UA", 0.0);             // W/K
    T_jacket_ = op->lookupScalarOrDefault("T_jacket", T_);        // K

    if (!op->found("outflow"))
        throw std::runtime_error(who + ": no `outflow {}` -- the outflow is"
            " DECLARED: `mode flow; F ..;` (a manipulated flow) or `mode"
            " valve; opening ..; valve { Cv ..; downstreamPressure ..; }`");
    auto of = op->subDict("outflow");
    const std::string mode = of->lookupWordOrDefault("mode", "");
    if (mode == "flow")
    {
        outflow_   = Outflow::flow;
        F_out_set_ = of->lookupScalar("F");
        if (F_out_set_ < 0.0)
            throw std::runtime_error(who + ": outflow.F must be >= 0");
    }
    else if (mode == "valve")
    {
        outflow_ = Outflow::valve;
        opening_ = of->lookupScalar("opening");
        if (opening_ < 0.0 || opening_ > 1.0)
            throw std::runtime_error(who + ": outflow.opening must lie in"
                " [0, 1] (got " + std::to_string(opening_) + ")");
        valve_ = VVH::Valve::read(
            of->found("valve") ? of->subDict("valve") : nullptr, who);
    }
    else
        throw std::runtime_error(who + ": outflow.mode '" + mode + "' is not"
            " one this tank reads -- the two are `flow` (a manipulated"
            " flow, the level integrates) and `valve` (a valve on the"
            " outlet, the level self-regulates)");

    // ---- The initial inventory: moles, or a LEVEL ----------------------
    n_.assign(N, 0.0);
    const bool byLevel = initDict->found("level");
    if (byLevel)
    {
        if (initDict->found("totalMoles") || initDict->found("V"))
            throw std::runtime_error(who + ": the initial inventory is stated"
                " TWICE (`level` and `totalMoles`/`V`) -- keep one");
        const scalar h0 = initDict->lookupScalar("level");
        sVector unit(N, 0.0);
        for (std::size_t i = 0; i < N; ++i) unit[i] = x[i];
        const auto ls = VVH::liquidState(thermo, unit, T_, P_, who, "dynamicTank", name_);
        const scalar mass = h0 * geom_.area() * ls.density;       // kg
        const scalar nTot = mass / ls.meanMW;                     // kmol
        for (std::size_t i = 0; i < N; ++i) n_[i] = nTot * x[i];
    }
    else
    {
        const scalar nTot = initDict->lookupScalar("totalMoles");
        for (std::size_t i = 0; i < N; ++i) n_[i] = nTot * x[i];
    }

    // ---- Inlet ---------------------------------------------------------
    if (!unitDict->found("inlet"))
        throw std::runtime_error(who + ": no feed -- a continuous vessel"
            " declares the stream it is fed by (`in <stream>;`), and that"
            " stream's state lives in its own file 0/<stream>.");
    auto inletDict = unitDict->subDict("inlet");
    const scalar F0 = inletDict->lookupScalar("F");
    T_in_ = inletDict->lookupScalar("T");
    z_in_ = readComposition(inletDict, thermo, who + " inlet");
    nDotIn_.assign(N, 0.0);
    for (std::size_t i = 0; i < N; ++i) nDotIn_[i] = F0 * z_in_[i];
    applyInletFlows_();

    // ---- Energy: the package's mixture liquid surface, or a refusal ------
    try
    {
        scalar nt = 0.0; for (auto v : n_) nt += v;
        H_ = nt * VVH::mixtureEnthalpy(thermo, n_, T_);
        if (F_in_ > 0.0) (void) VVH::mixtureEnthalpy(thermo, nDotIn_, T_in_);
    }
    catch (const std::exception& e)
    {
        throw std::runtime_error(who + ": the package cannot price the"
            " mixture liquid enthalpy on the elements datum (" + e.what()
            + ").  The tank stores H on that datum so that its first law"
              " closes; a component set with no formation datum (a toy"
              " species) cannot be a tank");
    }

    // ---- A restart's declared V must agree with the inventory ------------
    const auto ls0 = VVH::liquidState(thermo, n_, T_, P_, who, "dynamicTank", name_);
    if (initDict->found("V"))
    {
        const scalar Vd = initDict->lookupScalar("V");
        if (std::abs(Vd - ls0.volume) > 1.0e-6 * std::max(Vd, ls0.volume))
            throw std::runtime_error(who + ": the declared V = "
                + std::to_string(Vd) + " m3 disagrees with the volume of the"
                " declared inventory on this package ("
                + std::to_string(ls0.volume) + " m3) -- a volume is DERIVED"
                " here (sum n MW / rho); declare the inventory or the level,"
                " not a volume beside it");
    }
    checkAccepted_(0.0);

    std::cout << "  [dynamicTank] '" << name_ << "': vertical cylinder D = "
              << geom_.diameter << " m, H = " << geom_.height << " m (area "
              << geom_.area() << " m2); initial level "
              << ls0.volume / geom_.area() << " m (V = " << ls0.volume
              << " m3, rho = " << ls0.density << " kg/m3 from the case's"
                 " package).  Energy: H stored on the elements datum (the"
                 " package's mixture liquid surface), T a readout; the"
                 " first-law ledger CLAIMS closure.\n";
    if (outflow_ == Outflow::flow)
        std::cout << "  [dynamicTank] '" << name_ << "': outflow = MANIPULATED"
                     " FLOW (F_out = " << F_out_set_ << " kmol/s, mv F_out):"
                     " the level INTEGRATES -- no self-regulation.\n";
    else
    {
        std::cout << "  [dynamicTank] '" << name_ << "': outflow = VALVE (Cv = "
                  << valve_.Cv << " m2, opening " << opening_
                  << ", downstream " << valve_.P_downstream_Pa
                  << " Pa; Q = Cv x opening x sqrt(dP/rho), dP = P + rho g h -"
                     " P_down): the level SELF-REGULATES.\n";
        announceSteadyLevel_();
    }
}

void DynamicTank::announceSteadyLevel_() const
{
    if (!(F_in_ > 0.0) || !(opening_ > 0.0)) return;
    //  At steady state the tank holds the feed (composition, and T = T_in
    //  with no jacket), so the density is the feed's at T_in.
    const auto lf = VVH::liquidState(*thermo_, nDotIn_, T_in_, P_,
                                     "dynamicTank '" + name_ + "'",
                                     "dynamicTank", name_);
    const scalar Q  = F_in_ * lf.meanMW / lf.density;             // m3/s
    const scalar hs = VVH::valveSteadyLevel(valve_, opening_, Q, lf.density, P_);
    std::cout << "  [dynamicTank] '" << name_ << "': closed-form steady level"
                 " for this inflow and opening  h* = (Q/(Cv x))^2/g -"
                 " (P - P_down)/(rho g) = " << hs << " m  (Q = " << Q
              << " m3/s at rho = " << lf.density << " kg/m3, T = T_in"
              << (UA_ != 0.0 ? "; a jacket moves T and so rho a little" : "")
              << "); the run's own level follows in the trajectory.\n";
}

DynamicTank::Resolved DynamicTank::resolve_(const sVector& n, scalar H,
                                            bool strict) const
{
    const std::string who = "dynamicTank '" + name_ + "'";
    Resolved r;
    r.T = VVH::temperatureFromEnthalpy(*thermo_, n, H, T_);
    r.liquid = VVH::liquidState(*thermo_, n, r.T, P_, who, "dynamicTank", name_);
    r.liquid.level = VVH::level(geom_, r.liquid.volume);
    if (outflow_ == Outflow::flow)
        r.F_out = F_out_set_;
    else
    {
        const scalar Q = VVH::valveVolumetricFlow(valve_, opening_,
            r.liquid.density, P_, r.liquid.level, strict, who);   // m3/s
        r.F_out = (r.liquid.meanMW > 0.0) ? Q * r.liquid.density / r.liquid.meanMW
                                          : 0.0;                  // kmol/s
    }
    return r;
}

void DynamicTank::checkAccepted_(scalar t) const
{
    const Resolved r = resolve_(n_, H_, true);
    VVH::refuseDryOrOverflow(geom_, r.liquid, t, "dynamicTank '" + name_ + "'");
}

sVector DynamicTank::derivatives_(const sVector& y) const
{
    const std::size_t N = y.size() - 1;
    sVector n(y.begin(), y.begin() + N);
    const Resolved r = resolve_(n, y[N], false);

    scalar nTot = 0.0;
    for (auto v : n) nTot += std::max<scalar>(v, 0.0);

    sVector d(N + 1, 0.0);
    for (std::size_t i = 0; i < N; ++i)
    {
        const scalar xi = nTot > 0.0 ? std::max<scalar>(n[i], 0.0) / nTot : 0.0;
        d[i] = nDotIn_[i] - r.F_out * xi;
    }
    const scalar Hin  = F_in_ > 0.0
        ? F_in_ * VVH::mixtureEnthalpy(*thermo_, nDotIn_, T_in_) : 0.0;   // kW
    const scalar Hout = nTot > 0.0
        ? r.F_out * VVH::mixtureEnthalpy(*thermo_, n, r.T) : 0.0;         // kW
    const scalar Q    = (UA_ / 1000.0) * (T_jacket_ - r.T);               // kW
    d[N] = Hin - Hout + Q;                                                // kJ/s
    return d;
}

void DynamicTank::step(scalar t, scalar dt)
{
    const std::size_t N = n_.size();
    const std::string who = "dynamicTank '" + name_ + "'";
    sVector y(N + 1);
    for (std::size_t i = 0; i < N; ++i) y[i] = n_[i];
    y[N] = H_;

    auto axpy = [](const sVector& a, scalar c, const sVector& b)
    {
        sVector r(a.size());
        for (std::size_t i = 0; i < a.size(); ++i) r[i] = a[i] + c * b[i];
        return r;
    };
    const auto k1 = derivatives_(y);
    const auto k2 = derivatives_(axpy(y, 0.5 * dt, k1));
    const auto k3 = derivatives_(axpy(y, 0.5 * dt, k2));
    const auto k4 = derivatives_(axpy(y,       dt, k3));
    for (std::size_t i = 0; i < y.size(); ++i)
        y[i] += dt / 6.0 * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]);

    //  No clamp, ever: a negative mole number is a vessel that emptied (or a
    //  step too long to see it) and is REFUSED by name.
    scalar total = 0.0;
    for (std::size_t i = 0; i < N; ++i) total += y[i];
    if (!(total > 0.0))
        throw std::runtime_error(who + ": the vessel RAN DRY at t = "
            + std::to_string(t + dt) + " s (the step drove the total"
            " inventory to " + std::to_string(total) + " kmol).  Refused, not"
            " clamped: lower the outflow, raise the inflow or the setpoint"
            " (or reduce deltaT if the step overshot the empty vessel)");
    for (std::size_t i = 0; i < N; ++i)
        if (y[i] < 0.0)
            throw std::runtime_error(who + ": the step drove n_"
                + thermo_->comp(i).name() + " to " + std::to_string(y[i])
                + " kmol at t = " + std::to_string(t + dt) + " s.  Refused,"
                " not clamped -- reduce deltaT");
    for (std::size_t i = 0; i < N; ++i) n_[i] = y[i];
    H_ = y[N];
    T_ = VVH::temperatureFromEnthalpy(*thermo_, n_, H_, T_);
    t_ = t + dt;
    checkAccepted_(t_);
}

sVector DynamicTank::stateVector() const
{
    const Resolved r = resolve_(n_, H_, true);
    sVector s = n_;
    s.push_back(T_);
    s.push_back(r.liquid.level);
    s.push_back(r.liquid.volume);
    s.push_back(r.liquid.density);
    s.push_back(F_in_);
    s.push_back(r.F_out);
    return s;
}

std::vector<std::string> DynamicTank::stateLabels() const
{
    std::vector<std::string> l;
    for (std::size_t i = 0; i < n_.size(); ++i)
        l.push_back("n_" + thermo_->comp(i).name());
    for (const char* s : { "T", "level", "volume", "density", "F_in", "F_out" })
        l.push_back(s);
    return l;
}

ContinuousStream DynamicTank::outletStream() const
{
    const Resolved r = resolve_(n_, H_, true);
    ContinuousStream s;
    s.F = r.F_out;
    s.T = T_;
    //  the pressure at the outlet nozzle: the vessel pressure plus the head
    s.P = P_ + r.liquid.density * VVH::gravity * r.liquid.level;
    s.z.assign(n_.size(), 0.0);
    if (r.liquid.nTotal > 0.0)
        for (std::size_t i = 0; i < n_.size(); ++i)
            s.z[i] = n_[i] / r.liquid.nTotal;
    return s;
}

ContinuousStream DynamicTank::inletStream() const
{
    ContinuousStream s;
    s.F = F_in_;  s.T = T_in_;  s.P = P_;  s.z = z_in_;
    return s;
}

void DynamicTank::setInletStream(const ContinuousStream& s)
{
    if (s.z.size() != nDotIn_.size())
        throw std::runtime_error("dynamicTank '" + name_ + "': routed inlet"
            " carries " + std::to_string(s.z.size()) + " components against"
            " this unit's " + std::to_string(nDotIn_.size())
            + " -- one global component set is the ctrl contract");
    for (std::size_t i = 0; i < nDotIn_.size(); ++i) nDotIn_[i] = s.F * s.z[i];
    T_in_ = s.T;
    applyInletFlows_();
}

void DynamicTank::applyInletFlows_()
{
    scalar F = 0.0;
    for (auto v : nDotIn_) F += v;
    F_in_ = F;
    if (F > 0.0)
        for (std::size_t i = 0; i < nDotIn_.size(); ++i)
            z_in_[i] = nDotIn_[i] / F;
    // F == 0: keep the last z (a shut feed has no composition of its own).
}

bool DynamicTank::holdupRecord(HoldupRecord& h) const
{
    const Resolved r = resolve_(n_, H_, true);
    h.T = T_;  h.P = P_;  h.V = r.liquid.volume;  h.n = n_;
    h.notRestored.clear();
    return true;
}

BalanceSnapshot DynamicTank::balanceSnapshot() const
{
    BalanceSnapshot bs;
    if (!thermo_)
    {
        bs.materialReason = "dynamicTank '" + name_ + "': not initialised";
        return bs;
    }
    const std::size_t N = n_.size();
    const Resolved r = resolve_(n_, H_, true);
    for (std::size_t i = 0; i < N; ++i)
        bs.componentNames.push_back(thermo_->comp(i).name());
    bs.inventory.assign(n_.begin(), n_.end());

    BalanceFace in;
    in.id = name_ + ".feed";
    in.direction = BalanceFace::Direction::in;
    in.role = BalanceFace::Role::boundary;
    in.molarFlows.assign(nDotIn_.begin(), nDotIn_.end());
    in.enthalpyFlow_kW = F_in_ > 0.0
        ? F_in_ * VVH::mixtureEnthalpy(*thermo_, nDotIn_, T_in_) : 0.0;
    bs.faces.push_back(std::move(in));

    BalanceFace out;
    out.id = name_ + ".out";
    out.direction = BalanceFace::Direction::out;
    out.role = BalanceFace::Role::boundary;
    out.molarFlows.assign(N, 0.0);
    if (r.liquid.nTotal > 0.0)
        for (std::size_t i = 0; i < N; ++i)
            out.molarFlows[i] = r.F_out * n_[i] / r.liquid.nTotal;
    out.enthalpyFlow_kW = r.liquid.nTotal > 0.0
        ? r.F_out * VVH::mixtureEnthalpy(*thermo_, n_, T_) : 0.0;
    bs.faces.push_back(std::move(out));

    bs.materialAvailable = true;
    bs.materialReason.clear();
    bs.functional = BalanceSnapshot::EnergyFunctional::H;
    bs.physicalEnergyAvailable = true;
    bs.energyReason.clear();
    bs.storedEnergy_kJ = H_;
    bs.heatInput_kW    = (UA_ / 1000.0) * (T_jacket_ - T_);
    return bs;
}

void DynamicTank::setMV(const std::string& key, scalar value)
{
    const std::string who = "dynamicTank '" + name_ + "'";
    if (key == "T_jacket") { T_jacket_ = value; return; }
    if (key == "T_in")     { T_in_     = value; return; }
    if (key == "F_in")
    {
        if (value < 0.0)
            throw std::runtime_error(who + ": F_in must be >= 0 (got "
                + std::to_string(value) + ")");
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
    if (key.rfind("componentMolarFlow.", 0) == 0)
    {
        const std::size_t c = thermo_->indexOf(
            key.substr(std::string("componentMolarFlow.").size()));
        if (value < 0.0)
            throw std::runtime_error(who + ": " + key + " must be >= 0 kmol/s");
        nDotIn_[c] = value;
        applyInletFlows_();
        return;
    }
    if (key == "F_out")
    {
        if (outflow_ != Outflow::flow)
            throw std::runtime_error(who + ": mv F_out is the manipulated"
                " flow of `mode flow`; this tank is in `mode valve`, whose"
                " manipulated variable is `opening`");
        if (value < 0.0)
            throw std::runtime_error(who + ": F_out must be >= 0 (got "
                + std::to_string(value) + ")");
        F_out_set_ = value;
        return;
    }
    if (key == "opening")
    {
        if (outflow_ != Outflow::valve)
            throw std::runtime_error(who + ": mv opening is the valve of"
                " `mode valve`; this tank is in `mode flow`, whose"
                " manipulated variable is `F_out`");
        if (value < 0.0 || value > 1.0)
            throw std::runtime_error(who + ": opening must lie in [0, 1]"
                " (got " + std::to_string(value) + ")");
        opening_ = value;
        return;
    }
    DynamicUnitOperation::setMV(key, value);   // throws by name
}

scalar DynamicTank::getCV(const std::string& key) const
{
    if (key == "T")        return T_;
    if (key == "T_jacket") return T_jacket_;
    if (key == "F_in")     return F_in_;
    if (key == "T_in")     return T_in_;
    if (key == "opening" && outflow_ == Outflow::valve) return opening_;
    if (key == "level" || key == "volume" || key == "density" || key == "F_out"
        || key == "n_total")
    {
        const Resolved r = resolve_(n_, H_, true);
        if (key == "level")   return r.liquid.level;
        if (key == "volume")  return r.liquid.volume;
        if (key == "density") return r.liquid.density;
        if (key == "F_out")   return r.F_out;
        return r.liquid.nTotal;
    }
    if (key.rfind("x_", 0) == 0)
    {
        const std::size_t i = thermo_->indexOf(key.substr(2));
        scalar nt = 0.0; for (auto v : n_) nt += v;
        return nt > 0.0 ? n_[i] / nt : 0.0;
    }
    return DynamicUnitOperation::getCV(key);   // throws
}

std::vector<std::string> DynamicTank::availableMVs() const
{
    std::vector<std::string> v = { "F_in", "T_in", "T_jacket" };
    v.push_back(outflow_ == Outflow::flow ? "F_out" : "opening");
    for (std::size_t i = 0; i < n_.size(); ++i)
        v.push_back("componentMolarFlow." + thermo_->comp(i).name());
    return v;
}

std::vector<std::string> DynamicTank::availableCVs() const
{
    std::vector<std::string> v = { "level", "volume", "density", "T",
        "T_jacket", "F_in", "F_out", "T_in", "n_total" };
    if (outflow_ == Outflow::valve) v.push_back("opening");
    for (std::size_t i = 0; i < n_.size(); ++i)
        v.push_back("x_" + thermo_->comp(i).name());
    return v;
}

} // namespace Choupo
