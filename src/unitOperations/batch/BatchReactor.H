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
    Choupo::BatchReactor

Description
    Batch reactor with one or more Arrhenius-type reactions.  State:
    mole numbers n_i and (in adiabatic mode) temperature T.  Volume V
    is held constant (constant-density liquid assumption).

    Governing equations:

        dn_i/dt  =  Σ_r  ν_{i,r}  ·  r_r(T, n)  ·  V

    Mode `isothermal`  → T held at T_setpoint, no energy balance.
    Mode `adiabatic`   → energy balance added:

        dT/dt  =  −  Σ_r  r_r(T, n) · V · ΔH_r   /   ( Σ_i n_i · Cp_liq_i(T) )

    The numerator and denominator share a factor of 1000 (mol/kmol)
    that cancels when n is in kmol and Cp in J/(mol·K), so dT/dt is
    in K/s as expected.

    Each reaction supplies its own kinetic parameters (A, Ea) and an
    optional `dH_rxn` (heat of reaction at the operating temperature,
    in J per mole of limiting reactant consumed; negative ⇒ exothermic).
    For we treat dH_rxn as constant with T --- the Cp adjustment
    via Kirchhoff is scheduled for if needed.

    Integration: classical RK4 on the packed state vector
    (n_0,..., n_{N-1}, T), with the time step set by `controlDict.deltaT`.
\*---------------------------------------------------------------------------*/

#pragma once

#include "thermo/reaction/RateLaw.H"

#include "BatchUnitOperation.H"

namespace Choupo {

class BatchReactor : public BatchUnitOperation
{
public:
    BatchReactor() = default;

    const std::string& type() const override { return type_; }

    void initialise(const DictPtr&        unitDict,
                    const ThermoPackage&  thermo,
                    const DictPtr&        reactionsDict) override;

    void step(scalar t, scalar dt) override;

    // ---- Packed-ODE form (the adaptive driver) ----------------------
    //   The reactor IS a clean autonomous ODE on (n_0..n_{N-1}, T), so it
    //   exposes the same packed state/derivatives the stiff step() path uses.
    bool    hasOdeForm() const override { return true; }
    sVector odeState()   const override;
    void    setOdeState(const sVector& y) override;
    sVector odeDerivative(const sVector& y) const override { return derivatives_(y); }
    std::size_t odeNPositive() const override { return state_.n.size(); }

    const BatchState& state() const override { return state_; }

    void setOperationParameter(const std::string& key, scalar value) override;

    // ---- Energy ledger (phase (a), forum #98.3/#99/#101) -----------------
    //   The isothermal jacket duty per SEGMENT of constant physics.  E is an
    //   EXACT state difference, never a quadrature: on the elements datum
    //   Sum_j dH_j*dXi_j == Sum_i dn_i*h_i(T), so a closed constant-P
    //   isothermal segment has Q = dH computed from the committed mole
    //   numbers alone -- the integrator is untouched and every existing
    //   trajectory stays byte-identical.  Segments close on setParameter
    //   (T change) and on any recipe material charge/discharge
    //   (notifyStateChanged), so the state difference is always PURELY
    //   reactive.  Adiabatic mode exchanges nothing (records none).
    void noteTimeAdvanced(scalar t) override;
    void notifyStateChanged() override;
    std::vector<SimulationResult::EnergyRecord>
         energyRecords(scalar tEnd) override;
    std::string energyLedgerGap() const override;

protected:
    BatchState& mutableState() override { return state_; }

private:
    inline static const std::string type_ = "batchReactor";

    // The rate-constant form a reaction declares (CHEMKIN gas-phase set).
    //   Arrhenius     k = A·exp(−Ea/RT)                  (legacy, bit-identical)
    //   ModArrhenius  k = A·T^b·exp(−Ea/RT)              (the 3-parameter form)
    //   ThirdBody     k·[M], [M] = Σ eff_j·c_j           (explicit +M reactant)
    //   Falloff       Lindemann/Troe blend of kLow,kInf  (pressure dependence)
    // LHHW joins the CHEMKIN gas forms as a peer: it does not replace them, it is
    // simply the rate law a CATALYTIC surface obeys.  Its whole definition lives in
    // the shared `RateLaw`, so a batch reactor and a steady CSTR cannot disagree
    // about what an adsorption denominator means.
    enum class RateForm { Arrhenius, ModArrhenius, ThirdBody, Falloff, LHHW };

    // Per-reaction kinetic + thermo data
    struct ReactionSpec
    {
        std::string              name;
        std::vector<std::size_t> comps;   // component indices listed in stoichiometry
        std::vector<scalar>      nu;      // signed stoichiometric coefficients
        std::vector<scalar>      order;   // power-law orders (positive = reactant)
        RateForm                 form  = RateForm::Arrhenius;
        scalar                   A_pre = 0;     // pre-exponential (SI, kmol-m³-s)
        scalar                   b     = 0;     // temperature exponent (ModArrhenius)
        scalar                   Ea    = 0;     // activation energy [J/mol]
        scalar                   dH    = 0;     // heat of reaction  [J/mol of limiting reactant]
        bool                     reversible = false;  // k_rev = k_fwd / Kc (detailed balance)
        // Third-body / fall-off support:
        sVector                  tbEff;          // full-length efficiency vector (empty => all 1)
        scalar                   A_low = 0;      // low-pressure-limit Arrhenius (Falloff)
        scalar                   b_low = 0;
        scalar                   Ea_low = 0;
        sVector                  troe;           // (a T*** T* [T**]); empty => Lindemann
        // LHHW: the whole law (basis, adsorption denominator, reverse leg) parsed once.
        RateLaw                  law;
    };

    enum class Mode { Isothermal, Adiabatic };

    // Adiabatic energy basis:
    //   LiquidDH      Σ r·V·ΔH_rxn over liquid Cp (the legacy, default path).
    //   GasConstantV  closed fixed-volume gas: dT/dt from species internal
    //                 energy u_i = h_pure_ig − R_uT over gas Cv = Cp − R.  The
    //                 heat release comes from the species' FORMATION enthalpies
    //                 (curated thermo), not a per-reaction ΔH.  For combustion.
    enum class Energy { LiquidDH, GasConstantV };

    BatchState                  state_;
    const ThermoPackage*        thermo_ = nullptr;
    // kg of dry catalyst per m^3 of reactor.  Absent (0) => the LHHW rate constants
    // are already volumetric.  Declared, printed, never assumed.
    scalar                      catalystLoading_ = 0.0;
    std::vector<ReactionSpec>   reactions_;
    Mode                        mode_       = Mode::Isothermal;
    Energy                      energy_     = Energy::LiquidDH;
    scalar                      T_setpoint_ = 0;

    // Time integrator: RK4 (default, the classic explicit step) or a stiff
    // method (EulerSI / Rosenbrock23) selected via `solver { integrator … }`.
    // Default RK4 keeps every existing batch tutorial byte-identical.
    std::string                 integrator_ = "RK4";
    // Set in initialise() from the run's controlDict verbosity (via
    // thermoAnnounceLevel()); `solver { verbosity … }` overrides per unit.
    int                         verbosity_  = 1;

    // Rate r [kmol/(m³·s)] of a single reaction at (T, n, V).
    scalar rateOfReaction_(const ReactionSpec& rxn,
                           scalar T,
                           const sVector& n,
                           scalar V) const;

    // CHEMKIN unit helpers: convert a declared `units { A "cm3/mol/s"; Ea
    // "cal/mol"; }` to SI (kmol-m³-s, J/mol) on load, announcing the factor at
    // verbosity>=2.  No `units` block => value already SI (returned unchanged).
    scalar ckA_ (const DictPtr& kin, scalar A,  int molecularity) const;
    scalar ckEa_(const DictPtr& kin, scalar Ea) const;
    // Full-length third-body efficiency vector from a `thirdBody { sp eff; }`
    // sub-dict (unlisted species => 1.0).
    sVector thirdBodyEfficiencies_(const DictPtr& kin,
                                   const ThermoPackage& thermo) const;

    // Combined derivatives for the packed state.
    //   packed[0..n-1] = mole numbers (kmol)
    //   packed[n]      = temperature (K)
    // Returns derivatives in the same packing.  For isothermal mode
    // the temperature derivative is forced to zero.
    sVector derivatives_(const sVector& packed) const;

    // ---- Energy-ledger segment bookkeeping (phase (a)) --------------------
    //  A segment is a stretch of constant physics: constant T_setpoint and
    //  no external material change.  segN0_ snapshots the mole numbers at
    //  the segment opening; closing prices E from the committed difference.
    scalar  lastTime_  = 0.0;    // latest committed time (noteTimeAdvanced)
    bool    timeSeen_  = false;  // false until the driver's first clock call
    scalar  segStart_  = 0.0;
    sVector segN0_;
    scalar  segT_      = 0.0;    // the segment's pinned temperature
    std::vector<SimulationResult::EnergyRecord> energyLog_;
    // Static duty resolution, decided once at initialise():
    //   dutyMissing_ non-empty  -> every segment is E-invalid, named.
    //   dutyByStateDiff_        -> all reacting species carry formation data:
    //                              E = Sum dn_i*h_i(T)  (Hess built in).
    //   otherwise               -> extent branch: solve N*xi = dn (least
    //                              squares, pivot-checked) and E = Sum
    //                              dH_j*xi_j with the announced overrides.
    std::vector<std::string> dutyMissing_;
    bool                     dutyByStateDiff_ = false;

    void openSegment_(scalar t);
    void closeSegment_(scalar t);
    // The setParameter T IMPULSE (phase (e), #99-3): an instantaneous
    // temperature forcing is an energy intervention, priced as the state
    // difference E = H(n, T_new) - H(n, T_old) on the SAME elements datum
    // the duty uses -- never Sum n*Cp*dT when enthalpy is available.
    void emitImpulse_(scalar T_old, scalar T_new);
};

} // namespace Choupo
