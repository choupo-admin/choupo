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
    Choupo::FixedBedAdsorber

Description
    1-D ISOTHERMAL fixed-bed adsorber with axial dispersion and linear-
    driving-force (LDF) uptake.  `flowModel ergun` is the A4 conservative
    formulation: every gas species is integrated, P = RT Sum(c_i), and signed
    face velocities follow Ergun.  `constantVelocity` retains the announced
    A3 teaching/compatibility model.

    Governing equations per adsorbing component i, 0 < z < L (superficial
    u basis, c in mol/m3 of gas, q in mol/kg of adsorbent):

        eps dc_i/dt + rho_b dq_i/dt = -d(u c_i)/dz + Dax d2c_i/dz2
        dq_i/dt = k_i * (q*_i(c) - q_i)
        q*_i    = Adsorbent::loading(c -> p, T)     (A1: competitive Langmuir)

    rho_b is the CATALOGUED bulk density; the (1-eps)*rho_p form is FORBIDDEN
    (contract section 1.3: double-counting the porosity is the classic error;
    rho_p = rho_b/(1-eps) is derived and printed, never asked for).

    In A4, inlet molar flux is declared by feed u/P/composition and P_out is
    the downstream boundary.  Particle diameter/sphericity come from the
    adsorbent identity and gas viscosity from the canonical transport model.

    Discretisation (spec section 2, audited): conservative finite volumes on
    a DECLARED uniform mesh of nCells, first-order upwind advection + central
    dispersion at the faces, Danckwerts inlet as the IMPOSED face flux
    F_1/2 = u*c_in (the exact conservative form -- no ghost cell), outlet
    face without a dispersive term (dc/dz|L = 0), source rho_b*k*(q*-q)
    with NO (1-eps) factor.  The scheme is telescopic: discrete conservation
    is exact by construction, so the IN/OUT ledger rows integrated as part
    of the SAME ODE close against the hold-up at machine level (gate G3).

    Packed A4 ODE state (fixed order):
        Y = [ c_{i,j} (nComp x N) | q_{a,j} (nAds x N) | M_in_i | M_out_i ]
    c and q rows are positivity-guarded; the ledger rows are not.

    Time integration is OWNED by the unit (hasOdeForm() == false ON PURPOSE:
    the breakthrough sampler must see every accepted state at <= the declared
    samplingInterval, which the driver-level ODE sweep would hide):
      * controlDict `timeStepping adaptive;` (recommended) -> the stiff
        Rosenbrock23 sub-steps each interval in samplingInterval chunks;
      * `timeStepping fixed;` -> explicit RK4 at the case deltaT, REFUSED
        when deltaT exceeds the Gershgorin bound printed term by term
        (advection 2u_i/dz + dispersion 4D_i/dz^2 + LDF k(1+rho_b q*'(0)/eps))
        -- the student SEES which term rules the step.

    Announced pre-run (spec section 1.3): Pe = uL/Dax, retention factor
    R_f = eps + rho_b q*(c_in)/c_in, stoichiometric time t_st = (L/u) R_f,
    shock speed u_sh = u/R_f, |lambda_LDF| and the stiff/non-stiff verdict.

    Species classification (I = isotherm record on the adsorbent, K = entry
    in operation.kLDF.k), refused without silence -- the A2 pattern:
        I && K>0  ->  adsorbing (integrated, LDF source)
        I && K==0 ->  transport-only DIAGNOSTIC (integrated, solid frozen;
                      an EXPLICIT declared zero, announced -- gate G1)
        I && !K   ->  FATAL (an isotherm without kinetics needs a silent
                      default -- a crutch)
        !I &&  K  ->  FATAL (a k without an equilibrium is a contradiction)
        !I && !K  ->  inert and explicitly transported in A4.  The exactly-one
                      carrier restriction applies only to A3 compatibility.

    OPEN-boundary campaign accounting: the bed is flow-through, so its
    materialInventory() = bed hold-up (gas + solid) PLUS the remaining part
    of the DECLARED feed commitment, A*u*c_in*(endTime - t) at the CURRENT
    feed -- the feed is declared material, so the campaign datum owns it
    from t = 0 and the campaign mass/element balance verifies exactly the
    FV ledger closure.  The raffinate leaves through
    takeContinuousDischarge() as a real external-outlet ledger record.
    KNOWN declared error, priced aloud: holding u AND c_tot constant while
    the bed removes adsorbate FABRICATES carrier moles at exactly the net
    uptake rate (the roll-up the constant-u declaration hides) and A3
    reports it as a declared residual.  In A4 every species ledger closes
    directly, `declaredMaterialResidual()` is empty, and
    `carrier_fabricated_mol` is the numerical continuity residual.  Recipe
    chargeFrom / discharge are REFUSED, named (a bed is not a batch
    vessel).

    A5, first step -- the ISOTHERMAL FEED SWITCH (concentration-swing
    regeneration): recipe `setParameter feed.<component> = <y>` re-declares
    that species' feed mole fraction mid-campaign (A3: the carrier follows
    by difference and cannot be set itself; ergun: the species amends
    alone).  Each switch AMENDS the declared feed commitment; the jump is
    priced and handed to choupoBatch as DatumAmendment packages, ledgered
    against the external boundary (kind `feedAmendment`) so the campaign
    balances read records, never jumps.  The breakthrough crossings /
    integral FREEZE at their pre-switch values (the first feed step stays
    the claim; the desorption wave lives in c_out/qbar).  T, u and P stay
    DECLARED CONSTANTS: thermal swing, flow transients and blowdown each
    refuse by name (gate: check_feed_switch, sabotage-verified).
    Witness: batch19_feed_switch_purge.

    A5-T1 -- the ADIABATIC bed (`energyBalance adiabatic;`, ergun mode
    ONLY: the A3 closure pins c_tot = P/(RT) by declaration and a
    temperature field would contradict it -- refused).  One temperature
    per cell (declared local gas-solid equilibrium), appended as state
    rows after the ledgers; the van't Hoff isotherm is fed the CELL's own
    T -- the same dH_ads datum drives b(T), the energy source term and
    the ledger, one datum, three readers.  cp_s is DECLARED case data
    (operation.solidHeatCapacity{value;scope;source;}, the kLDF pattern);
    adsorbed-phase heat capacity neglected, declared.  Announced pre-run:
    u_th, L/u_th, and the all-heat-retained BOUND DT_ad (with the
    u_th-vs-u_sh verdict on which wave leads).  Adiabatic = NO energy
    record (nothing exchanged); the campaign energy balance is CLAIMED on
    per-cell vessel enthalpy (gas + adsorbed at T_j, solid sensible
    cp_s(T_j - T0)) against boundary streams whose per-step packages
    carry the outlet cell's own T.  T1.5: `feed.T` is the HOT-PURGE
    control (thermal mode only -- isothermal still refuses, pointing at
    the declaration that unlocks it): a feed at a new T re-declares the
    WHOLE remaining commitment, retire OUT at T_old + declare IN at
    T_new (pinned-P ideal-gas scaling; the enthalpy repricing rides in
    the packages' own T), crossings freeze for every integrated species
    and the pre-run claims (u_th, DT_ad) stay the ANNOUNCED values.
    T2: `energyBalance wallCooled;` + wallHeatTransfer{h;T_wall;dBed}
    adds -h a_w (T_j - T_wall) to the energy row; the removed heat
    integrates as a STATE ROW of the same ODE (the M_in/M_out ledger
    pattern, never a posterior quadrature) and the `wallHeat` record
    READS it.  One-knob guards: adiabatic+wall block contradicts,
    wallCooled without the block refuses, h <= 0 refuses.  Fixed
    stepping in thermal mode refuses by name -- gate check_thermal_bed
    (refusals) + the witness goldens (physics; the wall/ledger desync
    sabotage is caught there).  Witnesses: batch20 (T1), batch21 (T1.5),
    batch22_wall_cooled (T2); design:
    docs/design/fixed-bed-thermal-a5.md.

    In the ISOTHERMAL modes, energy stays outside the flow slice as
    before: A3's energyLedgerGap() names its gap and vesselEnthalpy()
    answers ok=false -- the campaign energy balance reports UNAVAILABLE
    quoting the gap verbatim, never a decorative closure; ergun-isothermal
    ledgers the adsorption duty and prices the vessel at the held T.

    Outputs: trajectory extras c_out/y_out/qbar/closure per component;
    axial profiles `<t>/<unit>.profile` (columns z, c_i..., q_i...) written
    OpenFOAM-style every writeInterval; KPIs t_breakthrough_5pct / t_50 /
    t_breakthrough_95pct / integral_anchor (trapezoid of (1 - c_out/c_in)
    over the internal <= samplingInterval samples, gate G5) /
    t_stoichiometric (analytic) / mass_closure per component.
\*---------------------------------------------------------------------------*/

#pragma once

#include "BatchUnitOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class Adsorbent;

class FixedBedAdsorber : public BatchUnitOperation
{
public:
    FixedBedAdsorber() = default;

    const std::string& type() const override { return type_; }

    void initialise(const DictPtr&        unitDict,
                    const ThermoPackage&  thermo,
                    const DictPtr&        reactionsDict) override;

    void step(scalar t, scalar dt) override;

    // The unit OWNS its sub-stepping (see header) -- no packed-ODE handoff.
    bool hasOdeForm() const override { return false; }

    const BatchState& state() const override { return state_; }

    // Bed hold-up (gas + solid) + the remaining declared feed commitment
    // [kmol] -- the open-boundary campaign datum (see header).
    sVector materialInventory() const override;

    // Raffinate shed since the last call (the driver routes it to
    // `dischargeTo` or records it as an external outlet).
    BatchState takeContinuousDischarge() override;

    scalar vesselEnthalpy(bool& ok, std::string& why) const override;
    std::string energyLedgerGap() const override;

    //  A4 energy: the adsorption duty as an exact state difference on the
    //  adsorbed inventory, Q = Sum_i dH_ads,i * dn_ads,i -- the isosteric
    //  heat from the SAME isotherm records the equilibrium runs on.
    std::vector<SimulationResult::EnergyRecord>
        energyRecords(scalar tEnd) override;

    // A fixed bed is flow-through, not a batch vessel: recipe transfers
    // in/out are refused, named.  The A5 cycle step that DOES exist is the
    // isothermal FEED SWITCH below.
    void       chargeFrom(const BatchState& src) override;
    BatchState dischargeAll() override;
    BatchState discharge(scalar fraction) override;

    //  A5 (first step): the ISOTHERMAL feed switch.  `feed.<component>`
    //  re-declares that species' feed MOLE FRACTION mid-campaign (the same
    //  quantity the author declared in feed{molarComposition{}}), enabling
    //  concentration-swing regeneration -- load, then purge with clean
    //  carrier.  u, P, T stay declared constants: the thermal and pressure
    //  swings each need physics this slice does not carry and refuse by
    //  name.  Every switch amends the declared feed commitment; the
    //  amendment is priced and handed to the driver as ledger records.
    void setOperationParameter(const std::string& key, scalar value) override;
    std::vector<DatumAmendment> takeDatumAmendments() override;

    void noteTimeAdvanced(scalar t) override;

    std::vector<std::pair<std::string, scalar>> trajectoryExtras() const override;
    std::map<std::string, scalar> kpis() const override;

    //  The constant-(u, P, T) closure fabricates carrier at exactly the net
    //  uptake rate -- predicted by construction, declared to the campaign
    //  balance as the forum-#119 cross-check (never a discount).
    std::map<std::string, scalar> declaredMaterialResidual() const override;
    std::vector<SimulationResult::TimelineEvent> statusEvents() const override;

protected:
    BatchState& mutableState() override { return state_; }

private:
    inline static const std::string type_ = "fixedBedAdsorber";

    BatchState state_;   // n = GAS hold-up per component [kmol]; T [K];
                         // P [Pa]; V = bed volume A*L [m3]

    // ---- geometry / declared operating constants ----------------------
    scalar L_    = 0.0;      // bed length [m]
    scalar A_    = 0.0;      // cross-section [m2]
    scalar eps_  = 0.0;      // interparticle void fraction [-]
    scalar u_    = 0.0;      // superficial velocity [m/s], DECLARED constant
    scalar T_    = 0.0;      // temperature [K], DECLARED constant (A4: energy)
    scalar P_    = 0.0;      // pressure [Pa], DECLARED constant (A4: Ergun)
    scalar Dax_  = 0.0;      // axial dispersion [m2/s], DECLARED
    scalar rhoB_ = 0.0;      // bulk density [kg/m3] from the catalogue
    std::size_t N_ = 0;      // nCells (declared -- no silent default)
    scalar dz_   = 0.0;      // L/N [m]
    scalar cTot_ = 0.0;      // P/(R T) [mol/m3], constant by declaration
    bool   ergun_ = false;    // A4: all species integrated, P derived, u algebraic
    //  A5-T1: adiabatic one-temperature energy balance (ergun mode ONLY --
    //  the A3 closure pins c_tot by declaration and a temperature field
    //  would contradict it).  T_j becomes a state row per cell; cp_s is
    //  DECLARED case data (operation.solidHeatCapacity{}, kLDF pattern).
    bool   thermal_ = false;
    scalar cpS_ = 0.0;        // solid heat capacity [J/(kg K)], declared
    scalar cpgFeed_ = 0.0;    // feed-gas mixture Cp_ig at Tfeed_ [J/(mol K)]
    //  T2: wall heat exchange (`energyBalance wallCooled;`) -- the T1 energy
    //  row gains -h a_w (T_j - T_wall); the REMOVED heat integrates as one
    //  more STATE ROW of the same ODE (never a posterior quadrature).
    bool   wallCooled_ = false;
    scalar wallH_  = 0.0;     // h [W/(m2 K)], declared
    scalar wallTw_ = 0.0;     // T_wall [K], declared
    scalar wallAv_ = 0.0;     // a_w = 4/dBed [1/m], from the DECLARED dBed
    //  T1.5: the FEED temperature -- a CONTROL in thermal mode (the TSA
    //  hot purge, recipe setParameter feed.T), the declared T otherwise.
    //  cFeedTot_ = P/(R Tfeed): the feed's total concentration, which a
    //  hot feed LOWERS at the pinned feed pressure.
    scalar Tfeed_ = 0.0;
    scalar cFeedTot_ = 0.0;
    //  Frozen pre-run claims (announced at initialise; a later feed
    //  switch must not silently rewrite what was claimed).
    scalar uThAnn_ = 0.0;               // announced thermal-wave velocity
    std::vector<scalar> dTadAnn_;       // announced DT_ad bound per species
    scalar Pout_ = 0.0;       // downstream pressure [Pa]
    scalar muGas_ = 0.0;      // optional declared test override [Pa.s]
    scalar dParticle_ = 0.0;  // adsorbent identity [m]
    scalar sphericity_ = 1.0;

    const ThermoPackage* thermo_ = nullptr;
    const Adsorbent*     ads_    = nullptr;   // registry-owned
    std::string          adsorbentName_;

    // ---- species bookkeeping ------------------------------------------
    std::vector<std::string> compNames_;   // all case components
    std::vector<std::size_t> adsIdx_;      // component index per INTEGRATED species
    std::vector<scalar>      k_;           // LDF [1/s] per integrated species
    std::vector<scalar>      cIn_;         // feed conc [mol/m3] per integrated species
    std::vector<scalar>      q0_;          // initial loading [mol/kg] per integrated species
    std::vector<scalar>      c0_;          // initial conc [mol/m3] per integrated species
    std::vector<scalar>      cInAll_;      // A4 feed concentration, every species
    std::vector<scalar>      c0All_;       // A4 initial concentration, every species
    std::size_t              carrierIdx_ = 0;   // the ONE present inert
    scalar                   cInCarrier_ = 0.0; // feed conc of the carrier [mol/m3]

    // ---- packed state (spec section 2.1 order) --------------------------
    //   y_[a*N + j]                    c of integrated species a, cell j
    //   y_[nAds*N + a*N + j]           q of integrated species a, cell j
    //   y_[2*nAds*N + a]               M_in_a  [mol]  (area included)
    //   y_[2*nAds*N + nAds + a]        M_out_a [mol]
    sVector y_;
    std::vector<scalar> hold0_;   // initial bed hold-up per integrated species [mol]

    // ---- A4 energy (per INTEGRATED species) -----------------------------
    std::vector<scalar> dHAds_;   // isosteric heat [J/mol, <0], from the record
    std::vector<scalar> nAds0_;   // adsorbed inventory at t = start [kmol]
    scalar adsorbedKmol_(std::size_t a) const;   // rho_b*A*Sum q dz, state

    // ---- time integration (owned) ---------------------------------------
    bool   adaptive_        = true;    // controlDict timeStepping
    scalar deltaT_          = 0.0;     // case deltaT (fixed RK4 step)
    scalar samplingInterval_ = 0.5;    // breakthrough sampler resolution [s]
    scalar rtol_            = 1.0e-6;  // internal Rosenbrock23 tolerance
                                       // (spec 2.5 default; solver{rtol})
    sVector atol_;                     // per-row (spec section 2.5)
    scalar hCarry_          = 0.0;     // warm-restart step across chunks
    scalar startTime_       = 0.0;
    scalar endTime_         = 0.0;
    scalar writeInterval_   = 0.0;
    scalar nextProfile_     = 0.0;
    scalar tNow_            = 0.0;
    int    verbosity_       = 1;

    // ---- breakthrough sampler (<= samplingInterval resolution) ----------
    scalar tPrev_ = 0.0;                     // last sample time
    std::vector<scalar> fPrev_;              // last c_out/c_in per integrated species
    std::vector<scalar> integral_;           // trapezoid of (1 - c_out/c_in) [s]
    std::vector<scalar> tCross5_, tCross50_, tCross95_;   // <0 = not crossed
    std::vector<scalar> tStoich_;            // analytic t_st per species [s]
    //  A feed switch changes the sampler's reference basis: the frozen
    //  crossings/integral keep describing the PRE-switch feed step
    //  (announced), and the live feed-referenced diagnostics retire.
    std::vector<bool> feedSwitched_;

    // ---- A5 feed-switch amendments awaiting the driver ------------------
    std::vector<DatumAmendment> pendingAmendments_;

    // ---- continuous-discharge marks (shed accounting) -------------------
    std::vector<scalar> shedMark_;           // M_out already handed over [mol]
    scalar              shedMarkCarrier_ = 0.0;

    // reusable partial-pressure map for Adsorbent::loading (values updated
    // in place through cached iterators -- no per-cell allocation)
    std::map<std::string, scalar>                    pMap_;
    std::vector<std::map<std::string, scalar>::iterator> pIt_;

    // ---- internals -------------------------------------------------------
    sVector rhs_(const sVector& y);          // the audited stencil (spec 2.3)
    void    commit_(const sVector& y);       // y_ <- y, refresh state_.n
    void    sample_(scalar t);               // crossings + G5 integral update
    void    rk4Step_(scalar dt);
    void    writeProfile_(scalar t) const;   // <t>/<name>.profile
    scalar  gershgorin_(scalar& adv, scalar& disp, scalar& ldf) const;
    scalar  carrierCell_(std::size_t j) const;   // c_carrier in cell j [mol/m3]
    scalar  carrierFabricated_() const;          // net uptake [mol] -- the
                                                 // carrier moles the declared
                                                 // constant-(u,P,T) closure
                                                 // fabricates (announced)
    scalar  qStarFeed_(std::size_t a) const;     // q*_a at the feed [mol/kg]
    std::size_t qOffset_() const;
    std::size_t inOffset_() const;
    std::size_t outOffset_() const;
    std::size_t tOffset_() const;                // A5-T1: T rows (thermal only)
    std::size_t qwOffset_() const;               // T2: the Q_wall state row
    scalar cellT_(const sVector& y, std::size_t j) const;  // T_ unless thermal
    scalar cpgCell_(const sVector& y, std::size_t j) const; // mixture Cp_ig [J/mol/K]
    scalar pressureCell_(const sVector& y, std::size_t j) const;
    scalar ergunVelocity_(scalar pLeft, scalar pRight, scalar distance,
                          const sVector& cLeft, const sVector& cRight) const;
};

} // namespace Choupo
