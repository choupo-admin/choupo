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

#include "BatchDryer.H"

#include "core/Dimensions.H"
#include "streams/Composition.H"
#include "thermo/Component.H"
#include "thermo/ThermoAnnounce.H"
#include "thermo/ThermoPackage.H"
#include "thermo/heatCapacity/HeatCapacityModel.H"
#include "thermo/vaporPressure/VaporPressureModel.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace Choupo {

void BatchDryer::initialise(const DictPtr&       unitDict,
                            const ThermoPackage& thermo,
                            const DictPtr&       /*reactionsDict*/)
{
    thermo_ = &thermo;
    const std::size_t n = thermo.n();

    verbosity_ = thermoAnnounceLevel();
    if (unitDict->found("solver"))
    {
        auto solverDict = unitDict->subDict("solver");
        verbosity_ = static_cast<int>(
            solverDict->lookupScalarOrDefault("verbosity", verbosity_));
    }

    const std::string who = "batchDryer '" + name_ + "'";

    // -----------------------------------------------------------------
    //  Initial holdup: the tray's charge (0/internalState).
    // -----------------------------------------------------------------
    auto initDict = unitDict->subDict("initial");
    state_.T = initDict->lookupScalar("T", Dims::temperature);
    state_.P = initDict->lookupScalar("P", Dims::pressure);      // Pa
    state_.V = initDict->lookupScalarOrDefault("V", 0.0);
    if (state_.P <= 0.0)
        throw std::runtime_error(who + ": initial.P must be a positive"
            " absolute pressure -- the psychrometry of the declared air is"
            " read at the tray's own pressure and this unit invents no"
            " default for it");

    const scalar nTot = initDict->lookupScalar("totalMoles", Dims::amount);
    if (nTot <= 0.0)
        throw std::runtime_error(who + ": initial.totalMoles must be > 0"
            " (the tray's charge: dry solid + its moisture)");

    const sVector x = readComposition(initDict, thermo, who + " init");
    state_.n.assign(n, 0.0);
    for (std::size_t i = 0; i < n; ++i) state_.n[i] = nTot * x[i];

    // -----------------------------------------------------------------
    //  Operation: exposed area, gas-film coefficient, critical moisture,
    //  and the DECLARED air environment.  No key here has a default.
    // -----------------------------------------------------------------
    auto op = unitDict->subDict("operation");

    area_ = op->lookupScalar("area", Dims::area);
    if (area_ <= 0.0)
        throw std::runtime_error(who + ": operation.area must be > 0 m2"
            " (the exposed drying surface -- equipment data)");

    //  k_Y is a mass flux per unit humidity-ratio driving force:
    //  kg/(m2 s) per (kg moisture / kg dry gas), i.e. [1 -2 -1 0 0].
    kY_ = op->lookupScalar("k_Y", Dims::massFlow / Dims::area);
    if (kY_ <= 0.0)
        throw std::runtime_error(who + ": operation.k_Y must be > 0"
            " kg/(m2 s) per unit humidity ratio -- it is SAMPLE/EQUIPMENT"
            " data (air velocity, tray geometry) and is never defaulted");

    X_c_ = op->lookupScalar("criticalMoisture");
    if (X_c_ <= 0.0)
        throw std::runtime_error(who + ": operation.criticalMoisture must"
            " be > 0 kg/kg -- the break between the constant-rate and the"
            " falling-rate periods is measured, not derivable");

    if (!op->found("air"))
        throw std::runtime_error(who + ": operation.air {} is missing -- the"
            " drying air is a DECLARED, CONSTANT environment (it is not a"
            " ledgered stream): declare air { T <K>; Y <kg/kg dry>;"
            " carrier <component>; }");
    auto airDict = op->subDict("air");
    T_air_ = airDict->lookupScalar("T", Dims::temperature);
    Y_air_ = airDict->lookupScalar("Y");
    if (T_air_ <= 0.0)
        throw std::runtime_error(who + ": operation.air.T must be a positive"
            " absolute temperature");
    if (Y_air_ < 0.0)
        throw std::runtime_error(who + ": operation.air.Y must be >= 0"
            " (kg moisture per kg DRY gas)");

    // -----------------------------------------------------------------
    //  Who is the solid, who is the moisture, who is the dry gas.
    //  The solid is identified by the FACT that carries the model (a
    //  `sorption {}` record), exactly as SolidDryer does; the carrier is
    //  DECLARED by name, because the wet-bulb equation needs its heat
    //  capacity and molar mass and nothing here may hardcode "air".
    // -----------------------------------------------------------------
    const std::string carrierName = airDict->lookupWord("carrier");
    bool haveCarrier = false;
    for (std::size_t i = 0; i < n; ++i)
        if (thermo.comp(i).name() == carrierName)
        { iCarrier_ = i; haveCarrier = true; break; }
    if (!haveCarrier)
        throw std::runtime_error(who + ": operation.air.carrier '"
            + carrierName + "' is not a component of this case -- the dry"
            " gas must be declared in constant/thermoPhysPropDict so its"
            " humid heat and molar mass come from the catalogue");

    std::vector<std::string> solidCandidates, moistCandidates;
    for (std::size_t i = 0; i < n; ++i)
    {
        if (state_.n[i] <= 0.0) continue;
        if (thermo.comp(i).hasSorption())
        { iSolid_ = i; solidCandidates.push_back(thermo.comp(i).name()); }
        else if (i != iCarrier_ && thermo.comp(i).hasVaporPressure())
        { iWater_ = i; moistCandidates.push_back(thermo.comp(i).name()); }
    }

    if (solidCandidates.empty())
        throw std::runtime_error(who + ": no component in the tray carries a"
            " `sorption { Xm; C; K; }` record, so the equilibrium moisture"
            " X_eq has no model -- add the GAB isotherm to the solid's"
            " case-local constant/components/<solid>.dat overlay (it is"
            " SAMPLE data: it belongs to this powder, not to the pure"
            " compound)");
    if (solidCandidates.size() > 1)
    {
        std::ostringstream os;
        os << who << ": " << solidCandidates.size() << " components in the"
              " tray carry a sorption record (";
        for (const auto& s : solidCandidates) os << " " << s;
        os << " ) -- this unit dries ONE solid on ONE dry basis; split the"
              " charge or remove the isotherm that does not describe it";
        throw std::runtime_error(os.str());
    }

    if (op->found("moisture"))
    {
        const std::string mn = op->lookupWord("moisture");
        bool found = false;
        for (std::size_t i = 0; i < n; ++i)
            if (thermo.comp(i).name() == mn) { iWater_ = i; found = true; break; }
        if (!found)
            throw std::runtime_error(who + ": operation.moisture '" + mn
                + "' is not a component of this case");
        if (state_.n[iWater_] <= 0.0)
            throw std::runtime_error(who + ": operation.moisture '" + mn
                + "' is not present in the tray's initial charge -- there is"
                " nothing to dry");
    }
    else if (moistCandidates.empty())
    {
        throw std::runtime_error(who + ": no volatile moisture in the tray"
            " (a component with a vapour pressure, other than the declared"
            " carrier '" + carrierName + "') -- charge the wet solid with"
            " its moisture in 0/internalState");
    }
    else if (moistCandidates.size() > 1)
    {
        std::ostringstream os;
        os << who << ": the moisture is ambiguous -- " << moistCandidates.size()
           << " volatile components are present (";
        for (const auto& s : moistCandidates) os << " " << s;
        os << " ).  Declare operation.moisture <component>; this unit"
              " integrates ONE moisture on the dry-solid basis";
        throw std::runtime_error(os.str());
    }

    const Component& sol   = thermo.comp(iSolid_);
    const Component& moist = thermo.comp(iWater_);
    const Component& carr  = thermo.comp(iCarrier_);

    if (!moist.hasVaporPressure())
        throw std::runtime_error(who + ": the moisture '" + moist.name()
            + "' has no vapour-pressure model -- the wet-bulb state and the"
            " saturation humidity cannot be evaluated");
    if (!moist.hasCpIdealGas())
        throw std::runtime_error(who + ": the moisture '" + moist.name()
            + "' needs an idealGasHeatCapacity block (the vapour term of the"
            " humid heat)");
    if (!carr.hasCpIdealGas())
        throw std::runtime_error(who + ": the carrier '" + carr.name()
            + "' needs an idealGasHeatCapacity block (the dry-gas term of"
            " the humid heat)");

    const scalar Mv = moist.MW();
    const scalar Mc = carr.MW();
    const scalar P  = state_.P;                                    // Pa

    m_solid_ = state_.n[iSolid_] * sol.MW();                       // kg
    if (m_solid_ <= 0.0)
        throw std::runtime_error(who + ": the dry-solid charge is zero -- X"
            " is moisture per kg DRY SOLID and has no meaning without one");
    nWater0_ = state_.n[iWater_];                                  // kmol
    X_0_     = nWater0_ * Mv / m_solid_;

    // -----------------------------------------------------------------
    //  The air's water activity, and the GAB equilibrium moisture at it.
    //  a_w = p_v / P_sat(T_air), p_v from the declared humidity ratio:
    //      Y = (Mv/Mc) p_v / (P - p_v)  =>  p_v = P Y / (Y + Mv/Mc).
    //  The GAB expression is SolidDryer's, verbatim: one model, two units.
    // -----------------------------------------------------------------
    const scalar pv_air   = P * Y_air_ / (Y_air_ + Mv / Mc);
    const scalar Psat_air = moist.vp().Psat_Pa(T_air_);
    if (Psat_air <= 0.0)
        throw std::runtime_error(who + ": the moisture's vapour pressure at"
            " the declared air temperature is not positive -- the water"
            " activity of the air cannot be formed");
    const scalar awRaw = pv_air / Psat_air;
    aw_ = std::min(0.99, std::max(0.0, awRaw));
    if (verbosity_ >= 1 && awRaw > 0.99)
        std::cout << "  [batchDryer '" << name_ << "'] the declared air is at"
                     " a_w = " << awRaw << ": the GAB isotherm is read at the"
                     " 0.99 ceiling (the capillary region is outside the"
                     " model), and it BINDS here -- announced, not hidden\n";

    const scalar Ka = sol.sorpK() * aw_;
    if (Ka >= 1.0)
        throw std::runtime_error(who + ": the GAB isotherm of '" + sol.name()
            + "' diverges at this air (K*a_w = " + std::to_string(Ka)
            + " >= 1) -- the declared air is outside the isotherm's domain");
    if (sol.sorpXm() <= 0.0)
        throw std::runtime_error(who + ": the sorption record of '"
            + sol.name() + "' declares a non-positive monolayer moisture Xm"
            " -- X_eq has no model");
    X_eq_ = sol.sorpXm() * sol.sorpC() * Ka
          / ((1.0 - Ka) * (1.0 - Ka + sol.sorpC() * Ka));

    if (X_c_ <= X_eq_)
    {
        std::ostringstream os;
        os << who << ": criticalMoisture X_c = " << X_c_ << " kg/kg is not"
              " above the equilibrium moisture X_eq = " << X_eq_ << " kg/kg"
              " of the declared air -- the falling-rate law R = R_c (X -"
              " X_eq)/(X_c - X_eq) has no domain there.  Either the air is"
              " too humid for this solid or X_c belongs to another sample";
        throw std::runtime_error(os.str());
    }
    if (X_0_ < X_eq_)
    {
        std::ostringstream os;
        os << who << ": the tray starts at X_0 = " << X_0_ << " kg/kg, BELOW"
              " the equilibrium moisture X_eq = " << X_eq_ << " kg/kg of the"
              " declared air -- that air would WET this solid, and this unit"
              " models drying only.  Charge more moisture or declare drier"
              " air (lower operation.air.Y)";
        throw std::runtime_error(os.str());
    }

    // -----------------------------------------------------------------
    //  Wet-bulb temperature of the DECLARED air: the adiabatic-saturation
    //  equation at Lewis = 1, by bisection -- the same construction as
    //  CoolingTower's fWb, on the same psychrometric datum.  The humid
    //  heat is evaluated at the air's own temperature (a HYPOTHESIS: cp
    //  varies by well under a percent across the wet-bulb depression).
    // -----------------------------------------------------------------
    const scalar cpc = carr.cpIdealGas().Cp(T_air_)  / Mc * 1000.0;  // J/(kg K)
    const scalar cpv = moist.cpIdealGas().Cp(T_air_) / Mv * 1000.0;

    auto Ysat = [&](scalar T) -> scalar
    {
        const scalar pv = moist.vp().Psat_Pa(T);
        if (pv <= 0.0 || pv >= 0.95 * P)
            throw std::runtime_error(who + ": the saturation humidity is"
                " undefined at T = " + std::to_string(T) + " K (the"
                " moisture's saturation pressure is out of range at "
                + std::to_string(P) + " Pa)");
        return (Mv / Mc) * pv / (P - pv);
    };
    auto fWb = [&](scalar Twb) -> scalar
    {
        const scalar lam = moist.Hvap_latent(Twb) / Mv * 1000.0;     // J/kg
        return Ysat(Twb) - Y_air_ - (cpc + Y_air_ * cpv) * (T_air_ - Twb) / lam;
    };

    scalar wbLo = 273.65, wbHi = T_air_;
    if (wbHi <= wbLo)
        throw std::runtime_error(who + ": the declared air temperature "
            + std::to_string(T_air_) + " K is at or below the wet-bulb"
            " bracket floor (273.65 K) -- this unit's psychrometry is"
            " written for air above freezing");
    if (fWb(wbHi) < 0.0)
        throw std::runtime_error(who + ": the declared air is supersaturated"
            " -- its humidity ratio Y exceeds saturation at its own"
            " temperature; check operation.air.Y");
    for (int it = 0; it < 100 && (wbHi - wbLo) > 1.0e-7; ++it)
    { const scalar m = 0.5 * (wbLo + wbHi); (fWb(m) >= 0.0 ? wbHi : wbLo) = m; }
    T_wb_ = 0.5 * (wbLo + wbHi);

    const scalar dY = Ysat(T_wb_) - Y_air_;
    if (dY <= 0.0)
        throw std::runtime_error(who + ": the saturation humidity at the"
            " wet bulb does not exceed the declared air humidity -- there is"
            " no mass-transfer driving force, so nothing dries");
    R_c_       = kY_ * dY;                                    // kg/(m2 s)
    lambda_wb_ = moist.Hvap_latent(T_wb_) / Mv * 1000.0;      // J/kg

    tPrev_    = 0.0;
    XPrev_    = X_0_;
    havePrev_ = true;

    // -----------------------------------------------------------------
    //  Announcements: every hypothesis this model runs on, out loud.
    // -----------------------------------------------------------------
    if (verbosity_ >= 1)
    {
        const scalar tCritPred = (X_0_ > X_c_)
            ? m_solid_ * (X_0_ - X_c_) / (R_c_ * area_) : 0.0;
        const scalar tau = m_solid_ * (X_c_ - X_eq_) / (R_c_ * area_);

        std::cout << "  [batchDryer '" << name_ << "'] solid '" << sol.name()
                  << "' " << std::fixed << std::setprecision(4) << m_solid_
                  << " kg dry, moisture '" << moist.name() << "', X_0 = "
                  << X_0_ << " kg/kg\n"
                  << "  [batchDryer '" << name_ << "'] declared AIR"
                     " ENVIRONMENT (constant, NOT a ledgered stream): T = "
                  << std::setprecision(2) << T_air_ << " K, Y = "
                  << std::setprecision(5) << Y_air_ << " kg/kg dry, carrier '"
                  << carr.name() << "', a_w = " << std::setprecision(4) << aw_
                  << "\n"
                  << "  [batchDryer '" << name_ << "'] wet bulb T_wb = "
                  << std::setprecision(2) << T_wb_ << " K (adiabatic"
                     " saturation, Lewis = 1, bisection to 1e-7 K); the"
                     " surface is HELD there while X > X_c\n"
                  << "  [batchDryer '" << name_ << "'] constant-rate flux"
                     " R_c = k_Y (Y_sat(T_wb) - Y) = " << std::scientific
                  << std::setprecision(4) << kY_ << " * " << dY << " = "
                  << R_c_ << " kg/(m2 s) -> " << (R_c_ * area_)
                  << " kg/s over " << std::fixed << std::setprecision(4)
                  << area_ << " m2\n"
                  << "  [batchDryer '" << name_ << "'] X_eq = "
                  << std::setprecision(5) << X_eq_ << " kg/kg -- GAB (Xm = "
                  << sol.sorpXm() << ", C = " << std::setprecision(3)
                  << sol.sorpC() << ", K = " << sol.sorpK() << ") at the"
                     " air's own a_w = " << std::setprecision(4) << aw_
                  << ", NOT a declared number\n"
                  << "  [batchDryer '" << name_ << "'] MODELLING CHOICE, not"
                     " physics: below X_c = " << std::setprecision(4) << X_c_
                  << " kg/kg the flux falls LINEARLY in the free moisture,"
                     " R = R_c (X - X_eq)/(X_c - X_eq) -- the simplest"
                     " defensible falling-rate law, and it is a CHOICE this"
                     " case makes\n"
                  << "  [batchDryer '" << name_ << "'] hand check: constant"
                     " rate to X_c in " << std::fixed << std::setprecision(1)
                  << tCritPred << " s, then an exponential tail of time"
                     " constant tau = m_s (X_c - X_eq)/(R_c A) = " << tau
                  << " s\n"
                  << "  [batchDryer '" << name_ << "'] latent load at the"
                     " constant rate = R_c A lambda(T_wb) = "
                  << std::setprecision(4) << (R_c_ * area_ * lambda_wb_ / 1000.0)
                  << " kW -- the AIR supplies it, from outside the campaign"
                     " boundary: published as a KPI, never as a ledgered"
                     " duty\n"
                  << "  [batchDryer '" << name_ << "'] named gap: the solid's"
                     " temperature is NOT integrated -- it is carried at its"
                     " charged value and the falling-rate warm-up toward"
                     " T_air is outside this model\n";
        std::cout.unsetf(std::ios::floatfield);
    }
}

// -----------------------------------------------------------------------
//  X and the two-period flux: ONE expression, read by the derivative, the
//  trajectory and the KPIs alike.
// -----------------------------------------------------------------------
scalar BatchDryer::moistureOf_(const sVector& y) const
{
    return y[iWater_] * thermo_->comp(iWater_).MW() / m_solid_;
}

scalar BatchDryer::flux_(scalar X) const
{
    if (X > X_c_) return R_c_;
    return R_c_ * (X - X_eq_) / (X_c_ - X_eq_);
}

sVector BatchDryer::odeDerivative(const sVector& y) const
{
    sVector dydt(y.size(), 0.0);
    //  R [kg/(m2 s)] * A [m2] / MW [kg/kmol] = kmol/s.  Only the moisture
    //  row moves: the dry solid is inert matter in this vessel.
    dydt[iWater_] = -flux_(moistureOf_(y)) * area_
                  / thermo_->comp(iWater_).MW();
    return dydt;
}

void BatchDryer::setOdeState(const sVector& y)
{
    if (y.size() != state_.n.size())
        throw std::runtime_error("batchDryer '" + name_ + "': the integrator"
            " returned a state of the wrong length");
    //  The falling-rate law drives the flux to ZERO at X_eq, so the
    //  moisture can only approach it from above.  A negative row means the
    //  integration overshot -- named, never clamped.
    if (y[iWater_] < 0.0)
        throw std::runtime_error("batchDryer '" + name_ + "': integration"
            " overshoot -- the moisture inventory went negative, which the"
            " falling-rate law forbids (its flux vanishes at X_eq > 0):"
            " reduce deltaT");
    state_.n = y;
}

void BatchDryer::step(scalar /*t*/, scalar dt)
{
    //  Classical RK4 on the mole vector -- the batch corpus's default
    //  fixed-step path (the adaptive driver calls odeDerivative/setOdeState
    //  instead and never enters here).
    auto axpy = [](const sVector& a, scalar f, const sVector& b)
    {
        sVector r(a.size());
        for (std::size_t i = 0; i < a.size(); ++i) r[i] = a[i] + f * b[i];
        return r;
    };
    sVector y = state_.n;
    const auto k1 = odeDerivative(y);
    const auto k2 = odeDerivative(axpy(y, 0.5 * dt, k1));
    const auto k3 = odeDerivative(axpy(y, 0.5 * dt, k2));
    const auto k4 = odeDerivative(axpy(y,       dt, k3));
    for (std::size_t i = 0; i < y.size(); ++i)
        y[i] += dt / 6.0 * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]);
    setOdeState(y);
}

// -----------------------------------------------------------------------
//  The break time is OBSERVED, not predicted: the crossing of X_c between
//  the two bracketing ACCEPTED states.  dX/dt is exactly constant on that
//  leg, so the linear interpolation is not a smoothing of anything.
// -----------------------------------------------------------------------
void BatchDryer::noteTimeAdvanced(scalar t)
{
    const scalar X = moistureOf_(state_.n);
    if (havePrev_ && t_crit_ < 0.0 && XPrev_ > X_c_ && X <= X_c_)
    {
        const scalar span = XPrev_ - X;
        t_crit_ = (span > 0.0)
                ? tPrev_ + (t - tPrev_) * (XPrev_ - X_c_) / span
                : t;
        if (verbosity_ >= 1)
            std::cout << "  [batchDryer '" << name_ << "'] constant-rate"
                         " period ENDS at t = " << t_crit_ << " s (X crossed"
                         " X_c = " << X_c_ << " kg/kg between the accepted"
                         " states at " << tPrev_ << " s and " << t
                      << " s); the falling-rate law takes over\n";
    }
    tPrev_    = t;
    XPrev_    = X;
    havePrev_ = true;
}

// -----------------------------------------------------------------------
//  Ledgers.
// -----------------------------------------------------------------------
std::map<std::string, scalar> BatchDryer::declaredMaterialResidual() const
{
    //  Negative = matter this declared closure DESTROYS by construction:
    //  the evaporated moisture left across the declared air boundary, which
    //  is outside the campaign.  The campaign's raw numbers stay raw; this
    //  is the independent cross-check that separates "declared, quantified
    //  model boundary" from "unexplained leak".
    const scalar evaporated_kmol = nWater0_ - state_.n[iWater_];
    return { { thermo_->comp(iWater_).name(), -evaporated_kmol } };
}

scalar BatchDryer::vesselEnthalpy(bool& ok, std::string& why) const
{
    ok  = false;
    why = "a dry solid plus its bound moisture is not one liquid at T, and"
          " the evaporation's latent heat comes from the DECLARED air"
          " environment, which lies outside the campaign boundary";
    return 0.0;
}

std::string BatchDryer::energyLedgerGap() const
{
    return "the drying duty is supplied by the DECLARED air environment,"
           " which is outside the campaign boundary: this vessel cannot"
           " price matter it never received (the latent load is published"
           " as the latentDuty_kW / latentEnergy_kJ KPIs instead), and the"
           " solid's own temperature history is not integrated";
}

// -----------------------------------------------------------------------
//  Trajectory + KPIs.
// -----------------------------------------------------------------------
std::vector<std::pair<std::string, scalar>>
BatchDryer::trajectoryExtras() const
{
    const scalar X = moistureOf_(state_.n);
    std::vector<std::pair<std::string, scalar>> ex;
    ex.emplace_back("X_kg_kg", X);                       // the drying curve
    ex.emplace_back("R_kg_m2_s", flux_(X));              // the rate curve
    ex.emplace_back("evaporated_kg",
        (X_0_ - X) * m_solid_);
    return ex;
}

std::map<std::string, scalar> BatchDryer::kpis() const
{
    const scalar X = moistureOf_(state_.n);
    std::map<std::string, scalar> k;
    k["X_initial"]     = X_0_;
    k["X_final"]       = X;
    k["X_critical"]    = X_c_;
    k["X_equilibrium"] = X_eq_;
    k["T_wb"]          = T_wb_;
    k["R_constant"]    = R_c_;
    //  The latent load of the CONSTANT-RATE period (R_c A lambda(T_wb)) and
    //  the energy the whole evaporation took.  Both are the AIR's, and both
    //  are labelled as such wherever they appear -- never a ledgered duty.
    k["latentDuty_kW"]   = R_c_ * area_ * lambda_wb_ / 1000.0;
    k["latentEnergy_kJ"] = (X_0_ - X) * m_solid_ * lambda_wb_ / 1000.0;
    //  t_critical is published ONLY when the run actually observed the
    //  crossing.  A run that ends inside the constant-rate period has no
    //  break time, and an absent number is not faked with a sentinel.
    if (t_crit_ >= 0.0) k["t_critical"] = t_crit_;
    return k;
}

} // namespace Choupo
