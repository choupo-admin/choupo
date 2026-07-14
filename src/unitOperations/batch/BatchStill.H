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
    Choupo::BatchStill

Description
    Simple batch still (Rayleigh distillation, no reflux, no plates).
    A pot of liquid is boiled off at a constant molar vaporisation
    rate F_vap; the rising vapour is assumed to be in equilibrium with
    the boiling liquid (T = T_bubble(x, P)) and is removed from the
    vessel immediately.  Mass balance:

        dn_i / dt  =  - F_vap  ·  y_i*(T, x)

    where T = T_bubble(x, P) and y* = K(T, x) · x are obtained at each
    RK4 stage by reusing `BubblePoint::compute`.

    The temperature is NOT integrated --- it is an algebraic function
    of composition through the bubble-point equation.  The pressure is
    held constant (constant-P pot, typical of atmospheric batch
    distillations).  Volume is also held constant for bookkeeping; for
    Rayleigh the volume actually shrinks (or the liquid level drops),
    but with a constant-density-liquid assumption this is decorative
    rather than load-bearing.

    Classical Rayleigh integration gives, for an ideal binary with
    constant relative volatility α and lightest component subscript 1:

           ln(L / L_0)  =  (1 / (α - 1))
                            ·  [ ln(x_1 / x_1_0)
                               + α · ln((1 - x_1_0) / (1 - x_1)) ]

    so a benzene/toluene case with α ≈ 2.4 has a closed-form residue
    curve to compare against the integrator.

    With NRTL azeotropes (e.g. ethanol/water) the bubble-T algorithm
    handles the activity term automatically; starting the still above
    the azeotrope makes the still composition climb TOWARD the
    azeotrope and stall there --- a pedagogically vivid demo of the
    azeotrope as a kinetic barrier to further enrichment.

    MODEL SLOT (design forum #85):  `model rayleigh;` (default, the above)
    or `model rectifier;` --- the classical batch rectification: the pot
    feeds a column of nStages ideal equilibrium stages (negligible stage
    and condenser holdup, quasi-steady at every instant) topped by a TOTAL
    condenser with reflux ratio R.  F_vap is then the internal BOILUP V;
    the distillate PRODUCT is D = V/(R+1), the reflux L = R·D, and the pot
    loses product only:

        dn_i / dt  =  - D · x_D_i(t)

    x_D at each instant solves the quasi-steady cascade: vapour off the pot
    y0 = K(T_bub(x_B))·x_B; stage s liquid from the section balance
    V·y_{s-1} = L·x_s + D·x_D; y_s from a bubble-T on x_s; total condenser
    closes the loop with x_D = y_N.  The fixed point is on the VECTOR x_D
    (multicomponent); convergence is a declared residual max|y_N - x_D|,
    plus sum(x_D)=1 and nonnegative stage compositions --- never a
    normalisation that merely looks converged.  With R = 0 (no liquid
    down the column) the stages carry nothing and x_D = y0: `rectifier`
    with nStages 0, R 0 reproduces `rayleigh` exactly.

    refluxPolicy constantReflux holds R fixed (x_D drifts as the pot
    strips).  refluxPolicy constantComposition solves R(t) each step -- a
    BRACKETED solve over [0, refluxMax] on a feasibility map (forum
    #85-3/4), never a bare Newton -- to hold x_D of a declared lightKey at
    x_D_target; when the ceiling can no longer reach the target the run
    announces `onRefluxLimit stopDistillation` (D = 0, the campaign idles
    to endTime, refluxLimitReached visible in trajectory + KPIs).  Distinct
    refusals: a target below the R=0 floor; a target unreachable from the
    charge (an azeotrope caps the cascade at ANY reflux); a non-monotone
    x_D(R) (no silent branch-jumping).  A cascade that cannot CLOSE during
    the policy bracket is the feasibility PINCH speaking and scores as
    "not reached there" -- the campaign walks to the boundary instead of
    crashing.

    No energy KPI is reported: V alone does not prove a reboiler duty,
    and a V·latent shortcut would be a decorative number (forum #85-5).
\*---------------------------------------------------------------------------*/

#pragma once

#include "BatchUnitOperation.H"

namespace Choupo {

class BatchStill : public BatchUnitOperation
{
public:
    BatchStill() = default;

    const std::string& type() const override { return type_; }

    void initialise(const DictPtr&        unitDict,
                    const ThermoPackage&  thermo,
                    const DictPtr&        reactionsDict) override;

    void step(scalar t, scalar dt) override;

    const BatchState& state() const override { return state_; }

    void setOperationParameter(const std::string& key, scalar value) override;
    void notifyStateChanged() override;

    // The vapour removed since the last call, condensed for a receiver
    //: returns the buffered moles at the pot T/P and clears the
    // buffer.  The recipe layer routes this to a `dischargeTo` target.
    // In the rectifier model the buffer holds D·x_D·dt by construction
    // (the pot only ever loses product), never V·y (forum #85-1).
    BatchState takeContinuousDischarge() override;

    // rectifier: instantaneous x_D + R + D in trajectory.csv (the
    // INSTANTANEOUS distillate; the receiver holds the ACCUMULATED mean --
    // two different things, both pinned, forum #85-6).  rayleigh: none.
    std::vector<std::pair<std::string, scalar>> trajectoryExtras() const override;
    std::map<std::string, scalar> kpis() const override;
    std::vector<SimulationResult::TimelineEvent> statusEvents() const override;

    // ---- Energy ledger (phase (c), forum #98.3-3/#101) --------------------
    //  Two duty records per segment of constant physics.  Rayleigh:
    //  reboiler Q = dH_pot + Sum n_pkg*h_vap(T_pkg, z_pkg) (the first law
    //  over the pot, package-by-package vapour enthalpy) and condenser
    //  Q = -Sum n_pkg*[h_vap - h_liq](T_pkg) (condensing each shed package
    //  at its hand-off T).  Rectifier: the condenser is the PHYSICAL one --
    //  Q = -Sum V*dt*[h_vap - h_liq](T_top, x_D) at the top-stage T -- and
    //  the reboiler closes the box first law exactly as the residual.
    //  Phase-enthalpy differences of the actual packages, never an invented
    //  V*lambda.  Unpriceable segments go invalid NAMED, per the ledger's
    //  monotonic-validity discipline.
    void noteTimeAdvanced(scalar t) override;
    std::vector<SimulationResult::EnergyRecord>
         energyRecords(scalar tEnd) override;
    std::string energyLedgerGap() const override { return ""; }

protected:
    BatchState& mutableState() override { return state_; }

private:
    inline static const std::string type_ = "batchStill";

    BatchState                  state_;
    const ThermoPackage*        thermo_     = nullptr;
    scalar                      F_vap_      = 0;      // kmol/s: rayleigh product; rectifier BOILUP V
    scalar                      P_op_       = 0;      // bar
    scalar                      T_warm_     = 0;      // last bubble-T --- used as Newton seed
    sVector                     vapourBuf_;           // kmol vaporised since last discharge

    // ---- rectifier model (forum #85) ----
    std::string                 model_       = "rayleigh";
    std::string                 policy_      = "constantReflux";
    int                         nStages_     = 0;     // ideal stages above the pot
    scalar                      refluxRatio_ = 0.0;   // R: fixed, or the policy's current value
    mutable sVector             stageT_;              // warm bubble-T seed per stage
    sVector                     xD_;                  // last instantaneous distillate

    // ---- constantComposition policy (forum #85-3/4) ----
    std::size_t                 lightKeyIdx_ = 0;
    scalar                      xDTarget_    = 0.0;
    scalar                      refluxMax_   = 0.0;
    bool                        refluxLimitReached_ = false;
    scalar                      tLimit_      = -1.0;  // when the ceiling was hit

    // dn_i/dt = -F_vap · y_i* at current packed state (just n[]).
    // Also writes the bubble-T into T_warm_ for the next call's seed
    // and (after step()) into state_.T for trajectory writeout.
    sVector derivatives_(const sVector& n_vec);

    // Quasi-steady cascade solve at reflux ratio R: x_D such that N
    // equilibrium stages + the section balances + a total condenser close
    // over the pot vapour y0.  Declared residual max|y_N - x_D| with
    // sum/positivity checks; throws with the residual on non-convergence
    // (never a silent normalise).
    // `closed`: when non-null, a cascade that fails to CLOSE reports
    // *closed = false instead of throwing (bubble-T failures still throw)
    // -- the policy bracket treats a non-closing point as the feasibility
    // pinch, never as a crash.  The hard-throw stays for direct solves.
    sVector solveColumn_(const sVector& y0, scalar T_pot, scalar R,
                         bool* closed = nullptr);

    // constantComposition: the bracketed R-solve over a feasibility map
    // (never a bare Newton).  Returns true and sets refluxRatio_ when the
    // target is reachable from the CURRENT pot; returns false when the
    // ceiling refluxMax_ cannot reach it (the refluxLimit path).  Distinct
    // diagnostics for target-below-the-R=0-floor and for an ambiguous
    // (multi-branch) x_D(R) -- both throw rather than jump branches.
    // prevR < 0: the INITIAL call -- full feasibility grid over [0, refluxMax]
    // (floor diagnostic, all-sign-changes count, monotonicity, gap refusal).
    // prevR >= 0: mid-campaign -- R(t) is continuous, so an EXPANDING LOCAL
    // bracket walks from the previous R (never sampling the fragile low-R
    // corner the campaign is nowhere near); the same honesty rules apply to
    // every sampled point (a non-closing sample refuses, never scores).
    bool solveRefluxFor_(const sVector& y0, scalar T_pot, scalar prevR = -1.0);

    // ---- Energy-ledger segment bookkeeping (phase (c)) --------------------
    scalar  lastTime_  = 0.0;
    bool    timeSeen_  = false;
    scalar  segStart_  = 0.0;
    sVector segN0_;                 // pot inventory at segment open
    scalar  segT0_     = 0.0;       // pot T at segment open
    scalar  segVapH_   = 0.0;       // Sum n_pkg*h_vap(T_pkg) [kJ], rayleigh
    scalar  segLiqH_   = 0.0;       // Sum n_pkg*h_liq(T_pkg) [kJ], rectifier
    scalar  segLatent_ = 0.0;       // Sum n_pkg*[h_vap-h_liq](T_pkg) [kJ]
    scalar  segCondTop_ = 0.0;      // Sum V*dt*[h_vap-h_liq](T_top,x_D) [kJ]
    scalar  segTmax_    = 0.0;      // max pot T seen: the reboiler's service T
    scalar  segCondTmin_ = 0.0;     // min condensing T seen (0 = no package
                                    //   yet): the condenser's service T
    bool    segPoisoned_ = false;   // per-segment: reset at open
    std::vector<std::string> segMissing_;
    std::vector<SimulationResult::EnergyRecord> energyLog_;

    // Total-phase enthalpy [kJ] of `nv` at (T, P_op_), vf-selected; on any
    // failure poisons the CURRENT segment with a named reason.
    scalar phaseH_(const sVector& nv, scalar T, scalar vf);
    void   openSegment_(scalar t);
    void   closeSegment_(scalar t);
};

} // namespace Choupo
