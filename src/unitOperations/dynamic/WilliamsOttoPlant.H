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
    Choupo::WilliamsOttoPlant

Description
    The Williams-Otto plant as ONE dynamic unit -- the classic benchmark of
    the process-control and optimisation literature, implemented VERBATIM
    from its primary specification:

        J. Schmid, K. Teichert, M. Chioua, T. Schindler, M. Bortz,
        "Simulation and optimal control of the Williams-Otto process using
        Pyomo", arXiv:2004.07614v1 (2020), eqs. (3.1)-(3.19).
        Original process: T. J. Williams & R. E. Otto, AIEE Trans. 80
        (1961) 458.

    A CSTR (reactions A+B->C, C+B->P+E, P+C->G, mass-based), a decanter
    that removes ALL G, a column that takes product P overhead with a fixed
    efficiency (F_pP = F_tP - 0.1 F_tE: 0.1 klb of P stays in the bottoms
    per klb of E), and a splitter sending a fraction eta of the bottoms out
    (purge F_d) and 1-eta back to the reactor.  The whole flowsheet is
    FOLDED into six ODEs for the reactor masses -- eqs. (3.6)-(3.11),
    reproduced in the .cpp above the code that implements them.

    UNIT CONVENTIONS.  The paper works in klb, hours and degrees RANKINE
    (its prose says "Reaumur" once; T* = 580 and the whole Williams-Otto
    literature say Rankine).  The model is implemented in those units
    INTERNALLY -- the citation is the spec -- and the dict boundary is SI:

      * the six species declare MW = 453.592 kg/kmol (1 klb), so ONE kmol
        IS one klb and every holdup/flow numeral in the case reads exactly
        as the paper's klb / klb/h values;
      * T crosses the boundary in kelvin (deg R = 1.8 x K);
      * time crosses in seconds (internal rates are per hour).

    All three conversions are announced at initialise.  The species are
    FICTITIOUS: no formulas (the elemental claim withholds by name), no
    formation data (the energy claim refuses by name) -- both correct, the
    same posture as the ctrl toy species.

    MVs:  T [K], F_fA, F_fB, mu [kmol/s], eta [-]   (the paper's five controls)
    CVs:  T, m_total, m_<species> [kmol = klb], F_tP, F_pP, F_wG, F_d [kmol/s]

    Validation anchor (pinned by ctrl12's golden): the PUBLISHED steady
    state x* = (3.27, 7.47, 1.12, 9.81, 1.69, 0.22) klb at
    u* = (10, 20, 580 R, 129.5, 0.2), paper eq. (4.8).
\*---------------------------------------------------------------------------*/

#pragma once

#include "DynamicUnitOperation.H"

namespace Choupo {

class WilliamsOttoPlant : public DynamicUnitOperation
{
public:
    WilliamsOttoPlant() = default;

    const std::string& type() const override { return type_; }

    void initialise(const DictPtr&        unitDict,
                    const ThermoPackage&  thermo,
                    const DictPtr&        reactionsDict) override;

    void step(scalar t, scalar dt) override;

    bool    hasOdeForm() const override { return true; }
    sVector odeState()   const override;
    void    setOdeState(const sVector& y) override;
    sVector odeDerivative(const sVector& y) const override;
    std::size_t odeNPositive() const override { return m_.size(); }

    sVector stateVector() const override;
    std::vector<std::string> stateLabels() const override;

    ContinuousStream outletStream() const override;

    BalanceSnapshot balanceSnapshot() const override;

    void   setMV(const std::string& key, scalar value) override;
    scalar getCV(const std::string& key) const override;

    std::vector<std::string> availableMVs() const override;
    std::vector<std::string> availableCVs() const override;

private:
    inline static const std::string type_ = "williamsOttoPlant";

    const ThermoPackage* thermo_ = nullptr;

    //- Reactor masses [klb == kmol under the declared MW], paper order
    //  (A, B, C, E, P, G) -- matched to the case's component order at
    //  initialise by NAME, never by position.
    sVector m_;

    //- The section-5 objective integrals, carried as ODE STATES so fixed
    //  RK4 and the adaptive integrator both accumulate them exactly:
    //  yield_ = INT F_pP dt and waste_ = INT F_wG dt  [klb], eqs. (5.4)/(5.5).
    scalar yield_ = 0.0, waste_ = 0.0;
    std::vector<std::size_t> comp_;   // package index of A,B,C,E,P,G

    //- The five controls, in the paper's internal units.
    scalar FfA_ = 0.0, FfB_ = 0.0;    // klb/h
    scalar T_R_ = 0.0;                // degrees Rankine
    scalar mu_  = 0.0;                // klb/h
    scalar eta_ = 0.0;                // [-]

    scalar P_bar_ = 1.013;            // reported on streams only

    //- The six mass derivatives, paper eqs. (3.6)-(3.11)  [klb/h].
    sVector rates_(const sVector& m) const;

    //- Derived boundary streams at the current state [klb/h].
    scalar FtP_() const;              // reactor outlet P
    scalar FtE_() const;              // reactor outlet E
    scalar FpP_() const;              // column overhead product
    scalar FwG_() const;              // decanter waste
};

} // namespace Choupo
