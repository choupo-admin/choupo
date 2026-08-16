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
Class
    Choupo::BatchDryer

Description
    The DRYING CURVE as a batch vessel: a tray of wet solid losing its
    moisture into air of DECLARED, CONSTANT condition.  The state is the
    moisture content

        X = m_moisture / m_drySolid                              [kg/kg]

    and the whole unit is the classical two-period construction a student
    draws by hand -- a constant-rate stretch, a break at X_c, an
    exponential tail onto X_eq.

    THE AIR IS A DECLARED ENVIRONMENT, NOT A LEDGERED STREAM.  This is the
    FixedBedAdsorber's constant-(u, P, T) carrier posture, and it is
    declared the same way: `operation { air { T; Y; carrier; } }`.  The
    water that leaves the solid crosses that boundary and leaves the
    campaign -- so the vessel's inventory genuinely shrinks, and the
    campaign mass balance would read that as a leak.  It is reported
    instead through declaredMaterialResidual() as matter the declared
    closure DESTROYS by construction (negative kmol of the moisture
    component, exactly the evaporated amount): the raw numbers stay raw,
    the prediction is an independent cross-check for the verdict.

    Governing equations (canonical SI; the flux is per unit exposed area):

      1.  CONSTANT-RATE period, X > X_c.  The wetted surface sits at the
          air's WET-BULB temperature -- the adiabatic-saturation equation
          of the declared air, solved by bisection (the same construction
          and the same psychrometric datum as CoolingTower's fWb):

              Y_sat(T_wb) - Y = (cp_c + Y cp_v) (T_air - T_wb) / lambda(T_wb)

          and the flux is gas-film controlled,

              R_c = k_Y ( Y_sat(T_wb) - Y )            [kg/(m^2 s)]

      2.  FALLING-RATE period, X <= X_c.  A MODELLING CHOICE, announced as
          one and never presented as physics: the flux falls LINEARLY in
          the free moisture,

              R = R_c (X - X_eq) / (X_c - X_eq)

          which integrates to the classical exponential approach
          X(t) - X_eq = (X_c - X_eq) exp(-(t - t_c)/tau),
          tau = m_s (X_c - X_eq) / (R_c A).  The rate vanishes AT X_eq by
          construction -- there is no clamp anywhere in this class.

      3.  X_eq is the GAB equilibrium moisture at the air's own water
          activity a_w = p_v / P_sat(T_air), read from the SOLID
          COMPONENT's `sorption { Xm; C; K; }` record -- the SAME
          expression SolidDryer evaluates (one model, two units, no
          drift).  A solid with no sorption record REFUSES by name.

    ODE form (hasOdeForm() == true).  The packed state is the vessel's
    MOLE VECTOR: only the moisture row moves, every other row (the dry
    solid) is constant, so the driver's positivity guard and the campaign
    inventory both read the state directly.

        dn_moisture/dt = -R A / MW_moisture / 1000       [kmol/s]

    ENERGY.  The latent heat of the evaporation comes from the air, and
    the air is outside the campaign boundary: nothing in this vessel can
    price it.  energyLedgerGap() says exactly that and vesselEnthalpy()
    answers ok=false (a dry solid plus its bound moisture is not one
    liquid at T).  The duty is published as a KPI -- visible, quantified,
    and NOT claimed to be ledgered.  The solid's own temperature history
    is NOT integrated either: the surface is held at T_wb by hypothesis
    (2), and the falling-rate warm-up toward T_air is a named gap.
\*---------------------------------------------------------------------------*/

#pragma once

#include "BatchUnitOperation.H"

#include <map>
#include <string>
#include <utility>
#include <vector>

namespace Choupo {

class BatchDryer : public BatchUnitOperation
{
public:
    BatchDryer() = default;

    const std::string& type() const override { return type_; }

    void initialise(const DictPtr&        unitDict,
                    const ThermoPackage&  thermo,
                    const DictPtr&        reactionsDict) override;

    void step(scalar t, scalar dt) override;

    // ---- Packed-ODE form: Y = the vessel's mole vector [kmol] --------
    bool        hasOdeForm() const override { return true; }
    sVector     odeState()   const override { return state_.n; }
    void        setOdeState(const sVector& y) override;
    sVector     odeDerivative(const sVector& y) const override;
    std::size_t odeNPositive() const override { return state_.n.size(); }

    const BatchState& state() const override { return state_; }

    // The evaporated moisture crossed the DECLARED air boundary: report it
    // as matter this closure destroys (negative kmol), never silently.
    std::map<std::string, scalar> declaredMaterialResidual() const override;

    // A wet solid is not one liquid at T -- and the evaporation's latent
    // heat is the air's, which this campaign does not own.
    scalar      vesselEnthalpy(bool& ok, std::string& why) const override;
    std::string energyLedgerGap() const override;

    void noteTimeAdvanced(scalar t) override;

    std::vector<std::pair<std::string, scalar>> trajectoryExtras() const override;
    std::map<std::string, scalar> kpis() const override;

protected:
    BatchState& mutableState() override { return state_; }

private:
    inline static const std::string type_ = "batchDryer";

    BatchState           state_;              // n [kmol]; T [K]; P [bar]
    const ThermoPackage* thermo_ = nullptr;

    std::size_t iSolid_ = 0;      // the sorbing solid (dry basis)
    std::size_t iWater_ = 0;      // the moisture
    std::size_t iCarrier_ = 0;    // the declared dry gas of the air

    // Declared equipment/sample data (no defaults anywhere).
    scalar area_  = 0.0;          // exposed drying area          [m^2]
    scalar kY_    = 0.0;          // gas-film coefficient  [kg/(m^2 s)] per dY
    scalar X_c_   = 0.0;          // critical moisture            [kg/kg]

    // Declared air environment.
    scalar T_air_ = 0.0;          // K
    scalar Y_air_ = 0.0;          // kg moisture / kg dry gas

    // Derived once, at initialise (all four are ANNOUNCED there).
    scalar m_solid_ = 0.0;        // dry-solid charge             [kg]
    scalar T_wb_    = 0.0;        // wet-bulb temperature         [K]
    scalar aw_      = 0.0;        // air water activity           [-]
    scalar X_eq_    = 0.0;        // GAB equilibrium moisture     [kg/kg]
    scalar R_c_     = 0.0;        // constant-rate flux    [kg/(m^2 s)]
    scalar lambda_wb_ = 0.0;      // latent heat at T_wb          [J/kg]
    scalar nWater0_ = 0.0;        // charged moisture             [kmol]
    scalar X_0_     = 0.0;        // initial moisture             [kg/kg]

    // OBSERVED break time: the crossing of X_c, linearly interpolated
    // between the two bracketing ACCEPTED states (dX/dt is exactly
    // constant on that leg, so the interpolation is not a smoothing).
    // Negative == not observed; the KPI is then OMITTED, never faked.
    scalar t_crit_    = -1.0;
    scalar tPrev_     = 0.0;
    scalar XPrev_     = 0.0;
    bool   havePrev_  = false;

    int    verbosity_ = 1;

    // Moisture content of a candidate mole vector [kg/kg dry solid].
    scalar moistureOf_(const sVector& y) const;

    // Drying flux at a moisture content [kg/(m^2 s)] -- the two-period
    // law, evaluated as ONE expression the derivative and the trajectory
    // both read (never a second copy of the model).
    scalar flux_(scalar X) const;
};

} // namespace Choupo
