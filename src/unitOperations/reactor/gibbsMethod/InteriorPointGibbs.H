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
    Choupo::InteriorPointGibbs

Description
    `model interiorPoint;` of the Gibbs reactor: the constrained Gibbs-energy
    minimisation solved by Choupo-IP, the primal-dual interior-point filter
    line search of src/solver/ip/ (slice B1 of docs/design/interior-point.md;
    Theory Guide sec:gibbs-interior-point).

        min  G/RT = sum_i n_i (g_i/RT + ln(P/P0) + ln(n_i/N_gas))
                  + sum_k l_k (g_k/RT + ln(f_k/P0) + ln(l_k/N_liq))
        s.t. A n + A_c l = b,   n >= 0,  l >= 0

    gas amounts n_i, ideal-liquid amounts l_k of the condensable species
    (Raoult: the pure-liquid fugacity f_k of ThermoPackage::pureLiquidReference,
    the reference the elementPotential method saturates against), amounts
    scaled by the total feed moles.  The gradient (mu_i/RT) and the Hessian of
    each ideal mixing phase, diag(1/n_i) - 1/N, are ANALYTIC.  The multipliers
    of the element balances are the element potentials with the sign of THE
    BRIDGE, pi = -lambda (design record sec. 4.2): mu_i/RT + (A^T lambda)_i =
    z_i and z_i -> 0 for a species present.

    THE TWO VARIANTS OF REVIEW R1, MEASURED (sec:gibbs-interior-point):
      pureCondensedOnly  NO barrier on the species of the gas phase (the
                         entropy term n ln(n/N) already repels zero; only the
                         fraction to the boundary keeps n > 0, NLPProblem::
                         isGuardOnly); a barrier on the ideal liquid, a phase
                         that can vanish.  The primal-dual Newton on the true
                         KKT conditions: no mu/n error on a trace species, no
                         polish needed.
      everyAmount        a barrier on every amount, then the element-potential
                         polish of design sec. 2.9: every amount recomputed
                         from pi = -lambda and finished by the existing Newton
                         (gibbsGasSolve) on the gas, whose largest change is
                         printed.  Selectable with `interiorPoint { barrier
                         everyAmount; }`.
    In BOTH the polish is computed and its largest change is reported; only
    everyAmount publishes the polished amounts.

    NOT IN THIS SLICE, refused by name: a pure solid (slice B2), a fugacity
    model (an equation of state other than the ideal gas; slice B3).  A
    liquid is the IDEAL mixture of the condensables (an activity model of the
    package is not read, as in elementPotential), and a gas phase that
    vanishes entirely is refused (the stated limit of R1, stage C).

    The optional unit-level block (design sec. 3.3):

        interiorPoint
        {
            barrier        pureCondensedOnly;   // | everyAmount
            barrierUpdate  monotone;            // adaptive: slice A3, refused
            globalization  filter;              // merit: slice A4, refused
            log            ipLog.csv;           // optional; refused in data/standards
        }

    refused by name under any other `model`.
\*---------------------------------------------------------------------------*/

#pragma once

#include "GibbsMethod.H"
#include "core/Dictionary.H"

#include <map>
#include <string>

namespace Choupo {

class InteriorPointGibbs : public GibbsMethod
{
public:
    struct Options
    {
        bool        barrierOnEveryAmount = false;   //- false: pureCondensedOnly (the default)
        std::string log;                            //- the per-iteration CSV, empty: none
    };

    const std::string& name() const override { return name_; }
    GibbsEquilibrium equilibrium(const GibbsProblem& p, scalar T_K,
                                 const IterHook& onIter = {},
                                 const GibbsLog& log = {}) const override;

    //- Pure solids are slice B2: GibbsMethod::solve refuses them by name.
    bool supportsPureSolids() const override { return false; }
    std::string report(bool detailed) const override;
    std::map<std::string, scalar> extraKpis() const override;

    void setOptions(const Options& o) { opt_ = o; }
    const Options& options() const { return opt_; }

    //- Reads the unit-level `interiorPoint {}` block.  Refuses an unknown
    //  key, a value of a later slice, and a log path inside the frozen
    //  catalogue, all by name.
    static Options readBlock(const DictPtr& block);

    //- The block under a model that is not interiorPoint: refused by name.
    static void refuseBlockUnder(const std::string& modelName);

private:
    inline static const std::string name_ = "interiorPoint";
    Options opt_;

    //  The last solve's record: the reactor prints it, the adiabatic outer
    //  Newton overwrites it at every trial T, so what stays is the FINAL
    //  solve (the reactor's own convention for `newtonLog`).
    mutable std::string reportBrief_, reportDetail_;
    mutable std::map<std::string, scalar> kpis_;
};

} // namespace Choupo
