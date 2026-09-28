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
#include "unitOperations/reactor/PureSolidPhase.H"

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
    // Temperature approach to equilibrium (the standard construct,
    // forum-ratified
    // 2026-07-02): the REACTION equilibrium (chemical potentials g/RT) is
    // evaluated at T + dTapproach while the PHYSICAL state -- enthalpy,
    // Psat/condensation, the energy balance -- stays at T.  The outlet is a
    // legitimate NON-equilibrium state (its affinity at T is nonzero: that
    // is the point).  An EMPIRICAL, CALIBRATED closeness-to-equilibrium
    // parameter -- never predicted, always announced.  0 = true equilibrium.
    scalar                           dTapproach = 0.0;   // [K]
    //  The element NAMES, row by row of A (the case's `elements` list).
    //  Read only to LABEL the structured log below; empty -> "1", "2", ...
    std::vector<std::string>         elements;
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
    // Empty on the Newton routes (residual is a real |F|).  A derivative-free
    // route fills it with its own stopping reason INSTEAD of fabricating a
    // residual -- the consumer prints whichever claim the method actually
    // earned (2026-08-22; directMin used to assert converged/0 iters/|F|=0).
    std::string         stopReason;
    //  WHY a Newton route did NOT converge, when it did not (empty
    //  otherwise).  Kept apart from `stopReason`, which is the claim a
    //  derivative-free route earned INSTEAD of a residual and which the
    //  reactor's report reads as "this was a simplex".
    std::string         notConvergedCause;

    //  PURE SOLID PHASES (2026-09-27, C14).  Filled ONLY by
    //  `GibbsMethod::solve` when the problem declares a species whose record
    //  is `referenceState pureSolid;` -- empty otherwise, so every case that
    //  declares none sees exactly the structure it always saw.
    std::vector<scalar> nSolid;          // N  [mol/s]; > 0 only for a present solid
    struct SolidVerdict
    {
        std::size_t i = 0;               // species index in the problem
        scalar      lnActivity = 0.0;    // ln a_s = sum_k pi_k A_ks - g_s/RT at the ANSWER
        scalar      lnActivityWithout = 0.0;  // ...in the solid-FREE equilibrium (the test)
        bool        present = false;
        int         bisections = 0;      // outer iterations on n_s (0 when absent)
    };
    std::vector<SolidVerdict> solids;
};

//  THE STRUCTURED LOG OF A SOLVE (2026-09-27, commission C15: the EduTool
//  that shows how the element-potential method SOLVES).
//
//  The Newton's iterates used to reach nothing but the console (verbosity 3
//  printed |F| and the backtracking factor) and the unit's residual history
//  (|F| alone).  A lesson that walks the method iteration by iteration needs
//  the UNKNOWNS -- pi_k and ln N -- each element-balance residual, the step,
//  and every species' ln n_i, so it can say why no amount can go negative.
//  A console is not a channel; this is.
//
//  One record = one number: (stage, iteration, quantity, value, unit), the
//  LONG form, so the phase searches (liquid, solid) and the second route of
//  the seed add rows rather than columns.  The log is an OBSERVER: the solve
//  never reads it back, an empty sink changes nothing, and it is written
//  only when a case DECLARES `newtonLog` (GibbsReactor.cpp) -- so no existing
//  output grows.  Stages, in the order a solve can emit them:
//
//    standardState      g_i/RT (+ ln phi_i) and ln(P/P0), per fugacity pass
//    leastSquaresSeed   the Newton from the least-squares seed at the feed
//    primalSeed         the primal Gibbs re-seed (only when the first stopped)
//    primalReseed       the SAME Newton from that seed
//    warmStartPass<k>   fugacity pass k >= 2 of a real-gas package
//    liquidTest         y_i P against Psat_i on the gas-only answer
//    liquidBisection    each fluid solve of the 1-D search on the liquid L
//    solidTest          ln a_s of each declared pure solid, solid-free answer
//    solidBisection     each fluid solve of the 1-D search on n_s
//
//  Only the OUTERMOST solve is logged: the fluid solves nested inside a
//  bisection pass no sink, so a stage's rows are that stage's own numbers.
struct GibbsLogRecord
{
    std::string stage;
    int         iteration = 0;
    std::string quantity;
    scalar      value = 0.0;
    std::string unit;
};
using GibbsLog = std::function<void(const GibbsLogRecord&)>;

//  The `newtonLog` file (GibbsLog.cpp).  `refuseGibbsLogPath` runs BEFORE the
//  solve and refuses a path inside the frozen catalogue by the one shared
//  rule (`records::refuseStandardsWrite`); `writeGibbsLogCsv` writes the
//  records AFTER it, one per line, header `stage,iteration,quantity,value,
//  unit`, 12 significant digits, and returns the number written (-1 when the
//  file could not be opened -- said by the caller, never fatal).
void refuseGibbsLogPath(const std::string& path);
long writeGibbsLogCsv(const std::string& path,
                      const std::vector<GibbsLogRecord>& records);

// Shared single-gas-phase Gibbs solve (the element-potential Newton),
// used by elementPotential and as the nested gas equilibrium of reactiveFlash.
// `b` is the element-balance RHS to solve for (the reactive-flash loop passes
// b reduced by the liquid's atoms).
GibbsEquilibrium gibbsGasSolve(const GibbsProblem& p, scalar T_K,
                               const std::vector<scalar>& g_over_RT,
                               const std::vector<scalar>& b,
                               const std::function<void(int,scalar,scalar)>& onIter = {},
                               const GibbsLog& log = {});

//  THE PRIMAL SEED OF THE ELEMENT-POTENTIAL NEWTON (2026-09-27).
//
//  `gibbsGasSolve` solves for the M element potentials pi and ln N, seeded by
//  a least-squares fit AT THE FEED COMPOSITION.  From a feed far from its
//  equilibrium that seed is not a poor guess but an unusable one: 10 %
//  ammonia in air at 500 K and 5 bar seeds water -- absent from the feed --
//  at 1.4e11 mol/s against 2.8e1 mol/s of feed, because the seed inherits
//  the whole affinity of the reaction that makes it.  At such a point two
//  species carry every atom, the (M+1) Jacobian is singular in double
//  precision, and the Newton stops at iteration 0 on a singular matrix.  An
//  exact (analytic) Jacobian does NOT cure it -- measured: with one, the
//  Newton still stopped on a singular matrix at every T sampled up to 600 K
//  (500 K at 50 bar) -- because the defect is the POINT, not the derivative.
//
//  This is the seed that does not inherit it: a damped Newton on ln n_j
//  (the reduced Gibbs iteration equations of Gordon & McBride, NASA
//  Reference Publication 1311, 1994) started from EQUAL amounts of every
//  species.  Its (M+1) matrix is weighted by the CURRENT amounts, not by
//  exp(pi.A), so it is well conditioned wherever the amounts are, and a
//  species on its way to 1e-300 simply stops contributing.  Every step is
//  limited so that no major species changes by more than a factor e^2 and a
//  trace species is not carried past 1e-4 of the total in one step; the
//  limit is the ONLY aid, and it is the method's, not a clamp on the answer.
//
//  It returns pi and ln N for the element-potential Newton to START from.
//  The answer is still that Newton's, on the same residual and the same
//  1e-8 tolerance: the seed is a solver aid and the caller ANNOUNCES it.
struct GibbsPrimalSeed
{
    bool                converged  = false;
    int                 iterations = 0;
    sVector             pi;               // M element potentials (dimensionless)
    scalar              lnN        = 0.0; // ln(total moles [mol/s])
    std::string         reason;           // why it stopped, when it did not converge
};

//  `gTilde_i` = g_i/RT + ln(P/P0) (+ ln phi_i): the full standard-state term
//  of mu_i/RT = gTilde_i + ln(n_i/N).  `N0` sets the scale of the start.
GibbsPrimalSeed gibbsPrimalSeed(const std::vector<std::vector<scalar>>& A,
                                const std::vector<scalar>&              b,
                                const std::vector<scalar>&              gTilde,
                                scalar                                  N0,
                                int                                     maxIter = 200);

// Enthalpy flow [W] of the pure solid phase(s) of an equilibrium at T, on
// the SOLID rung (`Component::h_formation(T, "solid")`, the leg the energy
// report prices a stream's `s[]` on).  Zero when `eq.nSolid` is empty.
scalar pureSolidEnthalpy_W(const GibbsProblem& p, const GibbsEquilibrium& eq,
                           scalar T_K);

class GibbsMethod
{
public:
    virtual ~GibbsMethod() = default;
    virtual const std::string& name() const = 0;

    // Equilibrium at a single temperature.  `onIter` (optional) lets the
    // reactor record residuals / print the Newton trace without the method
    // depending on the unit-op.
    using IterHook = std::function<void(int iter, scalar normF, scalar alpha)>;
    //  `log` (optional) receives the structured records above; the method
    //  that does not implement them ignores it (the reactor refuses a
    //  declared `newtonLog` for any method but elementPotential).
    virtual GibbsEquilibrium equilibrium(const GibbsProblem& p, scalar T_K,
                                         const IterHook& onIter = {},
                                         const GibbsLog& log = {}) const = 0;

    //- The equilibrium INCLUDING any pure solid phase (GibbsSolidPhase.cpp).
    //  A species whose record declares `referenceState pureSolid;` does not
    //  enter the fluid mixture: it is its own phase, activity 1, amount >= 0.
    //  With no such species this IS `equilibrium(p, T, onIter)`, the same
    //  call and the same answer.  Every caller that may meet a solid calls
    //  this; `equilibrium` stays the fluid-only method each model implements.
    GibbsEquilibrium solve(const GibbsProblem& p, scalar T_K,
                           const IterHook& onIter = {},
                           const GibbsLog& log = {}) const;

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
