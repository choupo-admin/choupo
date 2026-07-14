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
    Choupo::GibbsMethod

Description
    Selectable solution method for the Gibbs reactor's constrained
    Gibbs-energy minimisation, picked with `model` in the operation block
    (the project-wide selectable-sub-model pattern, parallel to CycloneModel
    / EquationOfState):

        gibbsReactor
        {
            model   elementPotential;   // default (ideal gas + ideal liquid)
...
        }

    A method computes the multiphase equilibrium at ONE temperature (the
    reactor owns the isothermal / adiabatic outer dispatch and the energy
    balance).  Built-ins:

        elementPotential  (alias ideal / RAND) -- Lagrangian element-potential
                          method extended to gas + IDEAL liquid (V+L).  The
                          gas-only path reproduces the reactor exactly.
        directMin         (alias nonideal / NRTL) -- direct Gibbs-energy
                          minimisation (handles non-ideal liquids).

    GibbsProblem carries the element-balance system + the thermo handle;
    GibbsEquilibrium returns the gas AND liquid mole numbers (the liquid
    vectors are empty / zero when a single gas phase is stable).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"
#include "thermo/ThermoPackage.H"

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {

// The constrained-equilibrium problem at a given (T, P).
struct GibbsProblem
{
    const ThermoPackage*             thermo = nullptr;
    std::vector<std::vector<scalar>> A;          // M×N atom matrix
    std::vector<scalar>              b;          // M element totals [mol/s]
    std::vector<scalar>              nIn;        // N feed mole numbers [mol/s] (for the seed)
    std::vector<std::size_t>         compIdx;    // N -> thermo component index
    std::vector<bool>                condensable;// N (species with a vapour-pressure model)
    scalar                           P = 0.0;    // reactor pressure [Pa]
    // Temperature approach to equilibrium (Aspen-style, forum-ratified
    // 2026-07-02): the REACTION equilibrium (chemical potentials g/RT) is
    // evaluated at T + dTapproach while the PHYSICAL state -- enthalpy,
    // Psat/condensation, the energy balance -- stays at T.  The outlet is a
    // legitimate NON-equilibrium state (its affinity at T is nonzero: that
    // is the point).  An EMPIRICAL, CALIBRATED closeness-to-equilibrium
    // parameter -- never predicted, always announced.  0 = true equilibrium.
    scalar                           dTapproach = 0.0;   // [K]
    std::size_t M() const { return b.size(); }
    std::size_t N() const { return compIdx.size(); }
};

// The converged equilibrium at a given T.
struct GibbsEquilibrium
{
    std::vector<scalar> nGas;            // N  [mol/s]
    std::vector<scalar> nLiq;            // N  [mol/s] (0 if single gas phase)
    scalar              Ntotal_gas = 0.0;
    scalar              Ntotal_liq = 0.0;
    std::vector<scalar> pi;              // M dimensionless element multipliers
    bool                twoPhase  = false;
    bool                converged = false;
    int                 iterations = 0;
    scalar              residual   = 0.0;
};

// Shared single-gas-phase Gibbs solve (the element-potential Newton),
// used by elementPotential and as the nested gas equilibrium of reactiveFlash.
// `b` is the element-balance RHS to solve for (the reactive-flash loop passes
// b reduced by the liquid's atoms).
GibbsEquilibrium gibbsGasSolve(const GibbsProblem& p, scalar T_K,
                               const std::vector<scalar>& g_over_RT,
                               const std::vector<scalar>& b,
                               const std::function<void(int,scalar,scalar)>& onIter = {});

class GibbsMethod
{
public:
    virtual ~GibbsMethod() = default;
    virtual const std::string& name() const = 0;

    // Equilibrium at a single temperature.  `onIter` (optional) lets the
    // reactor record residuals / print the Newton trace without the method
    // depending on the unit-op.
    using IterHook = std::function<void(int iter, scalar normF, scalar alpha)>;
    virtual GibbsEquilibrium equilibrium(const GibbsProblem& p, scalar T_K,
                                         const IterHook& onIter = {}) const = 0;

    // ---- Run-time selection (explicit registry) ------------------------
    using Factory = std::function<std::unique_ptr<GibbsMethod>()>;
    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<GibbsMethod> New(const std::string& name);
    static void registerBuiltins();
    static std::vector<std::string> availableTypes();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
