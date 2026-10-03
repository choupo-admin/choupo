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
    Choupo::GibbsReactor

Description
    Constrained Gibbs-energy minimisation reactor for a gas mixture (plus
    a liquid and a pure solid -- see below).  Given a feed, T and P,
    and an explicit atom-balance matrix declared in the operation
    block, solves

        min   G(n)  =  Σ_i n_i · μ_i(T, P, y)
         n   subject to   A · n  =  b           (element balance)
                          n_i ≥ 0               (mole numbers)

    via the standard Lagrangian formulation: introduce one multiplier
    π_j (= λ_j / RT) per element, plus ln(N_total), and solve the
    M+1 nonlinear equations

        Σ_i A_{ji} · n_i(π, ln N_total)  =  b_j        j = 1..M
        Σ_i        n_i(π, ln N_total)    =  N_total

    using NewtonND with the existing finite-difference Jacobian.  Each
    n_i comes from the stationarity condition

        n_i  =  exp(ln N_total − ln P − g_i°(T)/RT  +  Σ_k π_k A_{ki}).

    For the ideal-gas reference at P° = 1 bar with φ_i = 1
    assumption, the chemical potential reduces to
        μ_i  =  g_i°(T) + RT ln(y_i · P).

    Inputs (operation block):
        T             reactor temperature  [K]
        P             reactor pressure     [bar]
        elements      list of element names tracked  (C H O )
        species       list-of-dicts, one per participating component:
                          { name <comp>;  atoms (N_e1  N_e2... ); }

    The species' `name` must match a component already registered in
    the thermo package.  Each `atoms` vector lists the count of each
    element (in the order declared by `elements`) for that species.

    The reactor produces a single outlet stream (vapour, vf = 1) with
    the equilibrium composition, and exposes the equilibrium mole
    fractions and N_total as KPIs.

    KPIs:
        T, P, F_out_kmol_h, N_in_mol_s, N_out_mol_s,
        y_<species> for each species in the operation block.

    PURE SOLID PHASES (2026-09-27, C14).  A species whose record declares
    `referenceState pureSolid;` (graphite) is its own phase -- activity 1,
    amount >= 0 -- and never a member of the gas mixture.  It is tested on
    the solid-free equilibrium, deposited only where its activity there
    exceeds one, announced either way, carried out in the outlet's solids
    and priced on the solid rung (gibbsMethod/GibbsSolidPhase.cpp,
    `GibbsMethod::solve`).  Extra KPIs: n_solid_<name>_mol_s,
    activity_<name>, F_solid_kmol_h.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/UnitOperation.H"
#include "gibbsMethod/GibbsMethod.H"
#include "TemperatureApproach.H"      // the approach sign rule, one home

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class GibbsReactor : public UnitOperation
{
public:
    GibbsReactor() = default;

    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream> producedStreams() const override
    {
        return produced_;
    }

    std::map<std::string, scalar> kpis() const override { return kpis_; }

    //- THE DIRECTION OF A TEMPERATURE APPROACH IS THE ENGINE'S ACT, NOT THE
    //  AUTHOR'S (Vitor's ruling, 2026-09-26: "O delta T e dado sempre
    //  positivo e tu e que vais atribuir sinal dependendo da reacao
    //  quimica").  A case declares `temperatureApproach` as a MAGNITUDE; the
    //  engine reads the thermicity of the OVERALL transformation from this
    //  feed to its equilibrium at the physical T -- the isothermal enthalpy
    //  change on the package's own surface, never the published `Q_kW`,
    //  whose sign carries the feed's sensible heat when feed and reactor
    //  differ in T -- and evaluates the REACTION equilibrium at T + |dT| for
    //  an exothermic transformation (a higher temperature under-predicts it)
    //  and at T - |dT| for an endothermic one.  ONE home for the rule: the
    //  reactor and the `gibbsMap` props op both call this, so the two cannot
    //  drift apart.  It costs one extra equilibrium solve at dT = 0.
    //
    //  THE DIRECTION IS READ FROM THE ANSWER, NEVER FROM THE SEED
    //  (2026-10-03; record docs/design/the-approach-direction-is-read-from-
    //  the-answer.md).  In ISOTHERMAL mode `T` is the physical T and the
    //  reading is at the answer by construction.  In ADIABATIC mode the
    //  physical T is itself the unknown, and this used to be read at the
    //  SEED `operation.T`: a bed whose feed already carries product, seeded
    //  hotter than the temperature at which that feed is itself at
    //  equilibrium, read the transformation as DECOMPOSITION, took T - |dT|,
    //  and ended MORE converted than its own equilibrium -- the aid helped
    //  instead of hurting, and a different seed gave a different sign.  Now
    //  the adiabatic bed is solved ONCE with no approach, and `T` here is
    //  that dT = 0 outlet T0: the state THIS bed reaches, which no seed can
    //  move.  `adiabatic` carries what decided it, for the announcement.
    struct AdiabaticProbe
    {
        scalar T_seed          = 0.0;   // the operation.T the dT = 0 solve started from
        int    outerIterations = 0;     // that solve's outer Newton iterations on T
        bool   converged       = false; // whether it met its tolerance
    };
    struct ApproachDirection
    {
        int         sign = +1;          // +1: T + |dT|;  -1: T - |dT|
        bool        determined = false; // false -> + is an ANNOUNCED default
        scalar      dH_kJ_per_kmolFeed = 0.0;   // isothermal, on the package surface
        std::string word;               // "exothermic" | "endothermic" | "undetermined"
        std::string message;            // the ONE sentence every caller prints and logs
    };
    static ApproachDirection approachDirection(const GibbsMethod&    method,
                                               const GibbsProblem&   prob,
                                               scalar                T,
                                               scalar                magnitude,
                                               const AdiabaticProbe* adiabatic = nullptr);

    //- Enthalpy flow [W] of an equilibrium state at temperature T on the
    //  package's own surface (the SAME arithmetic the adiabatic Newton and
    //  the approach direction both use; one home, see solve()).
    static scalar stateEnthalpy_W(const GibbsProblem&     prob,
                                  const GibbsEquilibrium& eq,
                                  scalar                  T);

    //- The adiabatic outer Newton on T that did not converge, ANNOUNCED
    //  (console + AdvisoryLog) with the energy residual at the published T.
    static void announceOuterNotConverged(const std::string& unitLocus,
                                          scalar             T_last,
                                          scalar             residual_W,
                                          int                iterations);

private:
    inline static const std::string type_ = "gibbsReactor";
    std::vector<ProcessStream>     produced_;
    std::map<std::string, scalar>  kpis_;
};

} // namespace Choupo
