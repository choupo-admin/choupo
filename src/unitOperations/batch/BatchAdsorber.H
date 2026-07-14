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
    Choupo::BatchAdsorber

Description
    CLOSED, isothermal gas--solid contacting vessel with linear-driving-force
    (LDF) uptake kinetics: an ideal-gas headspace of fixed volume V_gas over
    m_ads kg of adsorbent, temperature pinned by the jacket (T_setpoint).

    Governing equations (canonical SI; p converted to the isotherm record's
    declared basis ONLY at the A1 boundary):

        p_i        = n_gas_i * R * T / V_gas                    [Pa]
        q*_i(T, p) = competitive equilibrium loading            [mol/kg]
                     (Adsorbent::loading -- extended Langmuir / henry,
                      assembled by the A1 layer from the pair catalogue)
        dq_i/dt    = k_i * ( q*_i - q_i )                       [mol/(kg s)]
        n_gas_i(t) + m_ads * q_i(t) = n_tot_i = const           (closure)

    STATE DECISION (spec A2 section 1.4): the ODE state Y is ONLY the
    loadings q_i.  n_gas_i is ALGEBRAIC, reconstructed from the per-species
    inventory invariant n_tot_i at every derivative evaluation -- so the
    component closure holds BY CONSTRUCTION (one subtraction of doubles),
    never at the mercy of the integrator.  Same arity-1 logic as the rest of
    the project: n_gas is a derivative, you do not integrate a derivative.
    A committed step that reconstructs n_gas_i < -1e-12*max(n_tot_i, 1 mol)
    is an integration overshoot and THROWS, named -- never a clamp.

    Data homes (the data doctrine):
      * adsorbent identity + per-species isotherms: curated catalogue
        (data/standards/adsorbents/ + parameters/adsorption/equilibria/,
        case-local overlay honoured by AdsorbentRegistry::byName);
      * k_LDF: EQUIPMENT/SAMPLE data -- lives in the CASE dict, inside
        operation.kLDF with MANDATORY basis/scope/source, never in a
        standards .dat, never defaulted.

    Species classification (I = isotherm record on the adsorbent, K = entry
    in operation.kLDF.k) is refused without silence:
        I &&  K   ->  adsorbing (LDF integrated)
        I && !K   ->  FATAL (an isotherm without kinetics would need a
                      silent kinetic default -- a crutch)
        !I &&  K   ->  FATAL (a k without an equilibrium is a contradiction)
        !I && !K   ->  inert, ANNOUNCED (q = 0, stays in the gas phase)

    Energy in A2: the vessel is isothermal and the adsorption duty is NOT
    yet ledgered -- energyLedgerGap() names it ("dH_ads/Cp pricing lands in
    A4"), vesselEnthalpy() answers ok=false (a gas + adsorbed-phase
    inventory must not be priced as one liquid), and NO decorative energy
    records are emitted.  The Q_ads_isosteric_kJ KPI is labelled a
    model-consistent estimate (van't Hoff dH_ads), NOT a ledgered duty.

    materialInventory() returns the TOTAL gas + adsorbed inventory per
    component (kmol) -- the campaign mass balance never misses the adsorbed
    phase (the crystalliser-magma pattern, forum #88).  The adsorbent MASS
    itself is equipment (like catalystLoading in BatchReactor), not a
    component: it does not enter the inventory.
\*---------------------------------------------------------------------------*/

#pragma once

#include "BatchUnitOperation.H"

#include <vector>

namespace Choupo {

class Adsorbent;

class BatchAdsorber : public BatchUnitOperation
{
public:
    BatchAdsorber() = default;

    const std::string& type() const override { return type_; }

    void initialise(const DictPtr&        unitDict,
                    const ThermoPackage&  thermo,
                    const DictPtr&        reactionsDict) override;

    void step(scalar t, scalar dt) override;

    // ---- Packed-ODE form (the adaptive driver) ----------------------
    //   Y = (q_0 ... q_{N-1}) [mol/kg] -- autonomous, smooth, dimension N.
    //   n_gas is reconstructed algebraically inside the derivative.
    bool    hasOdeForm() const override { return true; }
    sVector odeState()   const override { return q_; }
    void    setOdeState(const sVector& y) override;
    sVector odeDerivative(const sVector& y) const override;
    std::size_t odeNPositive() const override { return q_.size(); }

    const BatchState& state() const override { return state_; }

    void setOperationParameter(const std::string& key, scalar value) override;

    // TOTAL per-component inventory, gas + adsorbed phase [kmol].
    sVector materialInventory() const override;

    // A gas + adsorbed-phase inventory is NOT priceable on the elements
    // datum until A4 wires dH_ads/Cp -- the default (everything liquid at
    // T, P) would be a lie for this vessel.
    scalar vesselEnthalpy(bool& ok, std::string& why) const override;

    // The NAMED A2 energy gap (no decorative records; the campaign energy
    // balance reports UNAVAILABLE quoting this verbatim).
    std::string energyLedgerGap() const override;

    // Recipe charge/discharge redefines the per-species invariant.
    void notifyStateChanged() override;

    std::vector<std::pair<std::string, scalar>> trajectoryExtras() const override;
    std::map<std::string, scalar> kpis() const override;

protected:
    BatchState& mutableState() override { return state_; }

private:
    inline static const std::string type_ = "batchAdsorber";

    BatchState               state_;      // n = GAS phase only [kmol]; T [K];
                                          // P [Pa]; V = headspace volume [m3]
    const ThermoPackage*     thermo_ = nullptr;
    const Adsorbent*         ads_    = nullptr;   // registry-owned, not ours
    std::string              adsorbentName_;

    scalar                   m_ads_      = 0.0;   // adsorbent charge [kg]
    scalar                   T_setpoint_ = 0.0;   // pinned temperature [K]

    std::vector<std::string> compNames_;          // per component index
    std::vector<bool>        adsorbing_;          // I && K per component
    sVector                  k_;    // LDF constant [1/s] (0 for non-adsorbing)
    sVector                  q_;    // current loading [mol/kg]
    sVector                  q0_;   // initial loading (uptake reference)
    sVector                  nTot_; // per-species invariant n_gas + m*q [mol]

    // Time integrator: RK4 (default, consistent with the batch corpus) or a
    // stiff method via `solver { integrator EulerSI | Rosenbrock23; }`.
    std::string              integrator_ = "RK4";
    int                      verbosity_  = 1;

    // Commit a loading vector: q_ <- y, reconstruct n_gas from the
    // invariant (FATAL, named, on overshoot below -1e-12*max(n_tot, 1 mol)),
    // refresh state_.n [kmol], state_.P = sum p_i [Pa], state_.T.
    void commitLoadings_(const sVector& y);

    // Ideal-gas partial pressures [Pa] of a candidate loading vector,
    // keyed by component short-name (the Adsorbent::loading interface).
    std::map<std::string, scalar> partialPressures_(const sVector& q) const;

    // Worst per-species closure residual max_i |n_gas_i + m*q_i - n_tot_i|
    // / n_tot_i at the committed state -- the gate (c), visible per row.
    scalar closureWorstRel_() const;

    // Isosteric heat of adsorption of component i [J/mol, < 0], extracted
    // from the A1 isotherm surface itself by van't Hoff (two-temperature
    // probe deep in the Henry regime) -- the frozen IsothermModel API does
    // not export dH_ads, and a SECOND copy of it here would be arity-2.
    scalar isostericHeat_(std::size_t i) const;
};

} // namespace Choupo
