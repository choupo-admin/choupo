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
    Choupo::BatchCrystalliser

Description
    Batch crystalliser --- the DYNAMIC population balance by the method of
    moments (the time-dependent sibling of the steady MSMPR `crystalliser`
    of choupoSolve).

    A closed, well-mixed vessel starts SUPERSATURATED; crystals nucleate
    and grow, the dissolved solute depletes, and the supersaturation
    relaxes toward equilibrium (S -> 1).  For size-independent growth the
    moment equations close with no size grid:

        dmu0/dt = B0                 (nucleation feeds zero-size nuclei)
        dmu1/dt = G mu0              (growth convects up the size axis)
        dmu2/dt = 2 G mu1
        dmu3/dt = 3 G mu2

    with kinetics G = k_g (S-1)^g, B0 = k_b (S-1)^b M_T^j, M_T = rho_c k_v mu3
    and S = c/c_sat(T).  The solute mass balance couples them:

        dn_solute/dt = - V rho_c k_v (dmu3/dt) / MW_solute

    (the solute leaving solution is exactly the crystal mass formed by
    growth; nuclei carry zero mass).  RK4 on the packed state
    (mu0, mu1, mu2, mu3, n_solute).  Isothermal first cut (T held); the
    moments + solute relax from the initial supersaturation.

    Kinetics live in `constant/crystallisation` (referenced
    `crystallisation <name>;` at unit level, self-loaded here) --- the same
    library and split as the steady crystalliser.  Equilibrium c_sat(T) and
    the solid `rho_p`/`k_v` are on the component.dat.

    Runs under choupoBatch.  Unseeded primary nucleation (j=0) bootstraps the
    population from S>1; a magma-dependent j>0 would need a seed.
\*---------------------------------------------------------------------------*/

#pragma once

#include "BatchUnitOperation.H"

namespace Choupo {

class BatchCrystalliser : public BatchUnitOperation
{
public:
    BatchCrystalliser() = default;

    const std::string& type() const override { return type_; }

    void initialise(const DictPtr&        unitDict,
                    const ThermoPackage&  thermo,
                    const DictPtr&        reactionsDict) override;

    void step(scalar t, scalar dt) override;

    const BatchState& state() const override { return state_; }

    // ALL-phase inventory (forum #88): state_.n carries the DISSOLVED solute
    // only (the ODE drains it as crystals grow); the crystal magma
    // V*rho_c*k_v*mu3 lives in the moments.  The campaign mass balance sums
    // both -- without this override, crystallisation looked like mass loss.
    sVector materialInventory() const override
    {
        sVector inv = state_.n;
        if (MW_sol_ > 0.0)
            inv[iSolute_] += V_ * rho_c_ * k_v_ * mu3_ / MW_sol_;   // kmol
        return inv;
    }

    std::vector<std::pair<std::string, scalar>> trajectoryExtras() const override;

    // ---- Energy ledger (phase (d)) ----------------------------------------
    //  The isothermal crystallisation duty is an EXACT state difference on
    //  the crystal inventory: Q = -dH_cryst * dn_cryst with n_cryst =
    //  V*rho_c*k_v*mu3/MW (mu3 is state), and dH_cryst from the SAME shared
    //  resolver the steady crystalliser reads (crystallisationHeatPerMol:
    //  ion-derived dissolutionEnthalpy / solution tier / declared constant
    //  -- the source travels in the record basis).  The vessel-enthalpy
    //  half stays a NAMED gap: the campaign balance prices inventories as
    //  one liquid, and this vessel's crystal belongs on the solid rung.
    void noteTimeAdvanced(scalar t) override;
    std::vector<SimulationResult::EnergyRecord>
         energyRecords(scalar tEnd) override;
    std::string energyLedgerGap() const override { return ""; }

    // The magma prices PER RUNG: the dissolved inventory as liquid (the
    // aqueous/solution tier -- the same rung the material ledger uses) and
    // the crystal mass n_cryst = V*rho_c*k_v*mu3/M on the SOLID rung,
    // h_formation(T, "solid") = Hf298(solid) + Int cp_solid.  This is what
    // makes the campaign balance close against the latent duty: the duty's
    // dH_cryst = dHsoln + (cp_aq - cp_solid)(T-298) is EXACTLY the rung
    // difference per mole moved.
    scalar vesselEnthalpy(bool& ok, std::string& why) const override;

protected:
    BatchState& mutableState() override { return state_; }

private:
    inline static const std::string type_ = "batchCrystalliser";

    BatchState           state_;            // n[] = dissolved species, T, P, V
    const ThermoPackage* thermo_ = nullptr;

    std::size_t iSolute_ = 0, iSolv_ = 0;
    scalar      MW_sol_  = 0, MW_solv_ = 0;
    scalar      rho_c_   = 0, k_v_     = 0;
    scalar      T_       = 0, V_       = 0;  // isothermal T, suspension volume

    // Power-law kinetics (from constant/crystallisation)
    scalar k_g_ = 0, g_ = 1, k_b_ = 0, b_ = 1, j_ = 0;

    // Moments per m^3 of suspension (RK4 state, mirrored in state_.n[iSolute_]).
    scalar mu0_ = 0, mu1_ = 0, mu2_ = 0, mu3_ = 0;

    // Supersaturation from the dissolved-solute mole number.
    scalar supersaturation_(scalar nSoluteDissolved) const;

    // Derivatives of the packed state (mu0, mu1, mu2, mu3, n_solute).
    sVector derivatives_(const sVector& packed) const;

    // ---- Energy-ledger segment bookkeeping (phase (d)) --------------------
    scalar      lastTime_   = 0.0;
    bool        timeSeen_   = false;
    scalar      segStart_   = 0.0;
    scalar      segMu3Start_ = 0.0;
    scalar      dHcrystPerMol_ = 0.0;   // J/mol, dissolution sign; resolved once
    std::string dHcrystSource_;         // which path spoke (travels in basis)
    std::vector<SimulationResult::EnergyRecord> energyLog_;
    void closeSegment_(scalar t);
};

} // namespace Choupo
