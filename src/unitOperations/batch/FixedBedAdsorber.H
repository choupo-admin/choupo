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
    of the DECLARED feed commitment A*u*c_in*(endTime - startTime) -- the
    feed is declared material, so the campaign datum owns it from t = 0 and
    the campaign mass/element balance verifies exactly the FV ledger
    closure.  The raffinate leaves through takeContinuousDischarge() as a
    real external-outlet ledger record.  KNOWN declared error, priced
    aloud: holding u AND c_tot constant while the bed removes adsorbate
    FABRICATES carrier moles at exactly the net uptake rate (the roll-up
    the constant-u declaration hides) and A3 reports it as a declared
    residual.  In A4 every species ledger closes directly,
    `declaredMaterialResidual()` is empty, and `carrier_fabricated_mol` is the
    numerical continuity residual.  Recipe chargeFrom / discharge are
    REFUSED, named (a bed is not a batch vessel; step transitions are A5).

    Energy remains outside this isothermal flow slice. energyLedgerGap() names
    it and vesselEnthalpy()
    answers ok=false -- the campaign energy balance reports UNAVAILABLE
    quoting the gap verbatim, never a decorative closure.

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

    // A fixed bed is flow-through, not a batch vessel: recipe transfers
    // in/out are refused, named (step transitions arrive with A5).
    void       chargeFrom(const BatchState& src) override;
    BatchState dischargeAll() override;
    BatchState discharge(scalar fraction) override;

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
    scalar pressureCell_(const sVector& y, std::size_t j) const;
    scalar ergunVelocity_(scalar pLeft, scalar pRight, scalar distance,
                          const sVector& cLeft, const sVector& cRight) const;
};

} // namespace Choupo
