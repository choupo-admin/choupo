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
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  OlssonNaOH -- the NaOH-water correlations of Olsson, Jernqvist & Aly,
  Int. J. Thermophys. 18 (1997) 779: vapour pressure (Eqs. 1-5) and
  enthalpy (Eqs. 12-16) of aqueous sodium hydroxide, 0-200 degC, water mass fraction 0.2-1 (up to 80 wt %
  NaOH).  The coefficients live in the record
  data/standards/parameters/OlssonNaOH/NaOH-water.dat; this file holds the
  EQUATIONS, written exactly as the paper prints them, in the paper's own
  variables:

      x  water mass fraction [kg water/kg solution]   t  [degC]
      P  [kPa]    H  [kJ/kg solution]

  It is the KERNEL only.  The electrolyte model a case selects
  (`activityModel { model OlssonNaOH; }`) is ElectrolyteActivity, which
  routes to this kernel above the handover molality and to the Na-OH Pitzer
  pair below it (Theory Guide sec:olsson-naoh).

  Two derived quantities, both on the paper's own surface:

    ln a_w(x,t) = ln P(x,t) - ln P(1,t)        the correlation's OWN pure-water
                                               limit is the reference, so a_w
                                               is exactly 1 at x = 1 and the
                                               fit's error in water's own curve
                                               (-0.6 % at 200 degC) cancels;

    Phi(m,t)    = M_s [H(x,t) - x H(1,t)] / (1-x)    [J/mol NaOH]
                                               the apparent molar enthalpy of
                                               NaOH relative to its infinite
                                               dilution at 20 degC -- the
                                               paper's reference (p. 786).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"
#include "core/Dictionary.H"

#include <string>
#include <vector>

namespace Choupo {
namespace electrolyte {

class OlssonNaOH
{
public:
    //- One row of a validity table: x >= xMin for t in [tFrom, tTo) [degC].
    struct Band { scalar tFrom = 0.0, tTo = 0.0, xMin = 1.0; };

    //- Which correlation a window question is about.
    enum class Property { vapourPressure, enthalpy };

    OlssonNaOH() = default;

    //- Read the record (refuses by name a missing block or a wrong length).
    static OlssonNaOH fromRecord(const DictPtr& rec, const std::string& where);

    bool loaded() const { return loaded_; }
    const std::string& citation() const { return citation_; }

    //  ---- the paper's equations, in its own variables -----------------
    scalar lnP_kPa(scalar x, scalar t) const;          // Eqs. (2)-(5)
    scalar H_kJkg (scalar x, scalar t) const;          // Eqs. (12)-(16)

    //  ---- derived on the same surface -----------------------------------
    scalar lnAw(scalar x, scalar t) const { return lnP_kPa(x, t) - lnP_kPa(1.0, t); }
    //- Apparent molar enthalpy relative to infinite dilution at 20 degC [J/mol].
    scalar Phi(scalar m, scalar t) const;

    //  ---- composition ---------------------------------------------------
    scalar xOfMolality(scalar m) const { return 1.0 / (1.0 + m * Ms_ * 1.0e-3); }
    scalar molalityOfX(scalar x) const { return (1.0 - x) / (x * Ms_ * 1.0e-3); }

    //  ---- the windows (Tables III and VII) --------------------------------
    //- Smallest water mass fraction declared at t; 1 (nothing) outside [0,200(4)].
    scalar xMinAt(Property p, scalar t) const;
    //- The table's temperature span [degC].
    scalar tLow (Property p) const;
    scalar tHigh(Property p) const;
    bool   inWindow(Property p, scalar x, scalar t) const
    { return t >= tLow(p) && t <= tHigh(p) && x >= xMinAt(p, t) - 1.0e-12; }

    //- The Gibbs-Helmholtz gap at (x,t) [kJ/kg of the concentrated solution]:
    //  the heat of diluting from x to x_ref = 0.8 (20 wt %) computed (a) from
    //  the enthalpy correlation and (b) from the vapour-pressure correlation
    //  through L1 = -R T^2 d ln a_w/dT, (b) - (a), times the NaOH mass
    //  fraction.  Zero for x >= 0.8.  Theory Guide sec:olsson-naoh.
    scalar gibbsHelmholtzGap(scalar x, scalar t) const;

    //- The paper's stated maximum enthalpy error [kJ/kg] (p. 789).
    static constexpr scalar enthalpyMaxError_kJkg = 2.15;

    //- Handover molalities (record `handover`).
    scalar handoverFrom() const { return mFrom_; }
    scalar handoverTo()   const { return mTo_; }

    //- Molar masses the conversions use [g/mol].
    scalar Ms() const { return Ms_; }
    scalar Mw() const { return Mw_; }
    void setMolarMasses(scalar Ms, scalar Mw) { Ms_ = Ms; Mw_ = Mw; }

private:
    bool loaded_ = false;
    std::string citation_;
    std::vector<scalar> kP_, lP_, mP_;          // Table II
    std::vector<scalar> kH_, lH_, mH_, nH_;     // Table VI
    std::vector<Band>   winP_, winH_;
    scalar mFrom_ = 4.0, mTo_ = 6.0;
    scalar Ms_ = 39.99711, Mw_ = 18.01528;

    const std::vector<Band>& win_(Property p) const;
    //- Relative partial specific enthalpy of water from a_w(T) [kJ/kg water].
    scalar L1fromVapourPressure_(scalar x, scalar t) const;
};

} // namespace electrolyte
} // namespace Choupo
