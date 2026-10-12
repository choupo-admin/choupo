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
    number of reactions, each on its own rate law from the ONE factory
    (thermo/reaction/ReactionRate: Arrhenius, LHHW, a `type expression`
    written in the case's constant/reactions, or a law a case's code/
    registered -- DEV.md 4c C67), isothermal, adiabatic or jacketed, the
    temperature marched as total enthalpy on the package's own surface.  A
    reactor whose every law reads no concentration (an expression in T, P
    and mole fractions, per cubic metre of catalyst BED -- the Dyson & Simon
    ammonia bed is one) is a GAS bed: it reads no Vliq, publishes no
    liquid-basis `tau_s`, and publishes instead the normal-basis GHSV and
    the actual-gas residence time; every expression law also publishes the
    per-pass conversion of its reactants, its rate at both ends and -- when
    it declares `forward`/`reverse` legs and a window -- the effluent's
    temperature approach to the law's own equilibrium.  The description
    above this paragraph is the single-reaction path's and is still true of
    it; that path reads `type Arrhenius` only and refuses any other word,
    naming this one.

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

    A MULTITUBULAR, COOLED BED (multi-reaction path, DEV.md 4c C69,
    2026-10-12).  Catalyst in N parallel tubes, coolant in the shell:

        operation
        {
            thermalMode heatExchange;
            tubes   { count <->; innerDiameter <length>; length <length>;
                      wallThickness <length>; wallConductivity <W/m/K>; }
            catalyst         { particleDiameter <length>; shape sphere|cylinder; }
            wallHeatTransfer { model LiFinlayson; }      // or `U <W/m2/K>;`
            coolant { arrangement coCurrent|counterCurrent|boiling;
                      T_in <T>;  flow <mass flow>;  cp <J/kg/K> | utility <name>;
                      film <W/m2/K>; }
        }

    THE TUBES are the bed's geometry: area per volume 4/d_i, the cross-
    section N pi d_i^2/4 (Ergun runs on it, so per tube), and the bed volume
    N pi d_i^2/4 L -- ONE home for the length: `tubes.length` and `V_R` are
    exclusive (with no length, V_R gives it), and `L_over_D` or
    `areaPerVolume` beside `tubes` refuse.  `count` may be a real number
    (an outer driver solves it); the sizer rounds it UP to whole tubes, said.
    THE WALL COEFFICIENT is either DECLARED (`U`, overall, on the inside
    area) or computed from a packed-bed WALL correlation object
    (reactor/wallHeatTransfer/BedWallHeatTransfer: Li & Finlayson's 1-D
    U_w on the particle Reynolds number, at the LOCAL gas state), in series
    with the tube wall (`wallThickness`/`wallConductivity`, else NOT
    included, announced) and the coolant's DECLARED `film`.  Both at once
    refuse.  THE COOLANT is `boiling` (one temperature, today's behaviour),
    or a sensible fluid of declared mass flow and cp (or a `utility`
    record's mean cp, dutyPerKg / |T_in - T_out|, announced) flowing
    `coCurrent` (an initial-value problem, marched with the species) or
    `counterCurrent` (a TWO-POINT boundary-value problem: the coolant
    outlet temperature at the bed inlet is SHOT, on a bracketed root,
    until the coolant enters at its declared T_in -- announced, with the
    number of marches and the residual).  Without a `coolant {}` block the
    legacy keys `U`, `areaPerVolume`, `T_coolant` run exactly as before.
    Published: the hot spot (T_max, its volume and its axial position), the
    coolant outlet temperature, the duty the coolant takes (from the
    marched enthalpy) and, on the correlation route, every number the
    coefficient was computed from at the inlet.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/UnitOperation.H"
#include "unitOperations/reactor/wallHeatTransfer/BedWallHeatTransfer.H"

#include <map>
#include <memory>
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
        //  A MULTITUBULAR bed (operation.tubes, C69): D is the tube's inner
        //  diameter, A the cross-section of ALL tubes, L the tube length.
        bool   tubes   = false;
        scalar nTubes  = 0.0;         // may be real (an outer driver solves it)
        scalar dOuter  = 0.0;         // m; 0 = no wall declared
        scalar wallK   = 0.0;         // W/(m K); 0 = no wall declared
    };

    //  The bed volume: `V_R`, or N pi d^2/4 L when `tubes.length` is
    //  declared -- one home for the length, the two refused together.
    static scalar bedVolume(const DictPtr& operDict);

    //  Heat exchange with a coolant through the bed wall (thermalMode
    //  heatExchange).  `legacy` is the U + areaPerVolume + T_coolant form,
    //  untouched; every other route is the C69 one (see the description).
    enum class CoolantMode { constant, coCurrent, counterCurrent, boiling };
    struct WallExchange
    {
        bool        legacy = false;
        scalar      Udecl  = 0.0;     // W/(m2 K) declared; 0 -> correlation
        scalar      aV     = 0.0;     // m2/m3
        std::unique_ptr<BedWallHeatTransfer> corr;
        scalar      dp = 0.0, dt = 0.0, G = 0.0;   // correlation context
        scalar      R_wall = 0.0, R_film = 0.0;    // m2 K/W, inside area
        CoolantMode mode  = CoolantMode::constant;
        scalar      Tc_in = 0.0;      // K
        scalar      mcp   = 0.0;      // W/K, a sensible coolant's flow x cp
        scalar      mdot  = 0.0, cp = 0.0;          // kg/s, J/(kg K)
        std::string cpFrom;           // "declared" | "utility <name>"
        bool variable() const
        { return mode == CoolantMode::coCurrent || mode == CoolantMode::counterCurrent; }
    };
    static void readWallExchange(WallExchange& w, const DictPtr& operDict,
                                 const BedHydraulics& h, const ThermoPackage& thermo,
                                 scalar massFlow_kg_s, int verbosity);
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
