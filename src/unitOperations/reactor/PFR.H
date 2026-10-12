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
    Choupo::PFR

Description
    Plug Flow Reactor — single phase (liquid), isothermal, single reaction,
    power-law kinetics.  Integrate the molar-flow balance along the axial
    coordinate V (reactor volume from inlet, 0 → V_R):

         dF_i / dV  =  ν_i · r(F)        F_i(0) = F_{i,in}

         r = k(T) · Π (F_j / Q )^β_j      [mol/(m³·s)]

    Volumetric flow Q is taken constant at the inlet value (liquid-phase
    incompressible assumption) — adequate for the educational target.

    Integration:  fixed-step 4th-order Runge-Kutta (RK4), implemented
    by hand so students see exactly what is happening.

    For a 1st-order reaction the closed form
         F_A(V_R) / F_A,in = exp(-k τ)
    is recovered to machine precision with ~100 RK4 steps, which is
    the canonical regression check.

    THE MULTI-REACTION PATH (`reactions ( ... )`) is the general one: any
    number of reactions, each on its own rate law (power law, LHHW, or --
    since 2026-09-26 -- the Dyson & Simon (1968) ammonia synthesis bed,
    `kinetics { type dysonSimon1968; }`, whose rate is in T, P and mole
    fractions per cubic metre of catalyst BED and needs no liquid molar
    volume), isothermal, adiabatic or jacketed, the temperature marched as
    total enthalpy on the package's own surface.  A reactor whose only
    reaction is a Dyson-Simon bed is a GAS bed: it reads no Vliq, publishes
    no liquid-basis `tau_s`, and publishes instead its per-pass N2 conversion,
    the effluent's temperature approach to the law's own equilibrium, the
    normal-basis GHSV and the actual-gas residence time.  The description
    above this paragraph is the single-reaction path's and is still true of
    it.

    THE BED'S CROSS-SECTION AND ITS PRESSURE DROP (multi-reaction path,
    DEV.md 4c C66, 2026-10-12).  A volume has no cross-section; a bed has
    one.  `operation { L_over_D <->; }` gives it: D = (4 V_R / (pi L/D))^(1/3),
    A = pi D^2 / 4, L = (L/D) D -- the straight cylinder the `pfr` sizer
    (CatalystBedSize) wraps a shell around, which READS the slenderness from
    this unit (published as the `L_over_D` KPI) and refuses a second copy in
    its own designRules: ONE home.  `operation { pressureDrop { model Ergun;
    voidFraction <->; allowable <pressure>; } }` (opt-in; `allowable`
    optional) then integrates
        dP/dz = -[ 150 mu (1-eps)^2 u / (eps^3 dp^2)
                   + 1.75 rho (1-eps) u^2 / (eps^3 dp) ]
    (Ergun, Chem. Eng. Prog. 48 (1952) 89, in the form this tree already
    carries in src/unitOperations/batch/FixedBedAdsorber.cpp and the Theory
    Guide's "Pressure drop" section) with the SAME RK4 as the species and
    the enthalpy, as dP/dV = (dP/dz) / A, u the superficial velocity of the
    local gas (molar volume from the package's equation of state, ideal gas
    announced where there is none), rho its density and mu its viscosity
    from the package's declared transport model (dilute-gas: no dense-gas
    correction, said on the run).  dp is `operation.catalyst.particleDiameter`
    -- the particle Eq 39 reads too, one home -- taken as Ergun's
    equivalent-sphere diameter, so a declared SIEVE size of irregular
    granules overstates it and the drop computed is a LOWER estimate, said.
    The rate law, the temperature (from H at the LOCAL P) and the outlet
    stream all see the marched pressure; the outlet leaves at P_in - dP.
    Absent both keys, nothing of this runs and the bed is the
    constant-pressure march it always was, byte for byte.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/UnitOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class PFR : public UnitOperation
{
public:
    PFR() = default;

    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream> producedStreams() const override
    {
        return produced_;
    }

    std::optional<UnitProfile> profile() const override
    {
        if (profile_.columns.empty()) return std::nullopt;
        return profile_;
    }

    std::map<std::string, scalar> kpis() const override { return kpis_; }

private:
    // MULTI-REACTION path (`reactions ( r1 r2 ... );`): the same RK4 march, but
    // dF_i/dV = SUM_j nu_ij r_j(F) -- an IVP, no Newton.  A series network is
    // where a PFR beats a CSTR (no back-mixing consumes the intermediate).
    int solveMultiReaction(const DictPtr&       dict,
                           const ThermoPackage& thermo,
                           int                  verbosity,
                           scalar               F_in_kmols,
                           scalar               T,
                           scalar               P,
                           scalar               V_R,
                           scalar               vf_in,
                           int                  nSteps,
                           const sVector&       z_in);

    //  The bed's geometry and its opt-in Ergun drop (see the description).
    struct BedHydraulics
    {
        bool   hasGeometry = false;   // operation.L_over_D declared
        bool   ergun       = false;   // operation.pressureDrop { model Ergun; }
        scalar L_over_D = 0.0, D = 0.0, L = 0.0, A = 0.0;   // -, m, m, m2
        scalar eps = 0.0;             // bed void fraction
        scalar dp  = 0.0;             // particle (Ergun equivalent) diameter, m
        scalar allowable = 0.0;       // Pa; 0 = none declared
    };
    static BedHydraulics readBedHydraulics(const DictPtr& operDict,
                                           const ThermoPackage& thermo,
                                           scalar V_R, int verbosity);
    //  dP/dz [Pa/m] (negative) at the local state; Ftot in mol/s.
    static scalar ergunGradient(const BedHydraulics& h, const ThermoPackage& thermo,
                                scalar T, scalar P, const sVector& z, scalar Ftot);
    //  The geometry and drop KPIs, the over-allowable announcement and the
    //  console lines.  Publishes nothing when neither key was declared.
    void publishBedHydraulics(const BedHydraulics& h, const ThermoPackage& thermo,
                              scalar T_in, scalar P_in, scalar T_out, scalar P_out,
                              const sVector& z_in, const sVector& z_out,
                              scalar F_in_mols, scalar F_out_mols, int verbosity);
    //  The single-reaction path integrates no bed geometry: refuse its keys.
    static void refuseBedHydraulicsOnSinglePath(const DictPtr& operDict);

    inline static const std::string type_ = "pfr";
    std::vector<ProcessStream>     produced_;
    UnitProfile                    profile_;
    std::map<std::string, scalar>  kpis_;
};

} // namespace Choupo
