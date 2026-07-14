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
    Choupo::RateLaw

    ONE rate law, parsed once from a reaction's `kinetics {}` block and then
    evaluated wherever a reactor needs it.  Before this class every reactor
    re-read A and Ea and re-wrote the product-of-concentrations loop inline;
    adding a second rate law would have meant editing all of them.

    THE LAW.  Two families, one formula.  Write the intensive variable of
    species i as theta_i -- a concentration [mol/m3], or an activity a_i =
    gamma_i x_i when `basis activity`.  Where a species adsorbs on the
    catalyst, weight it by its adsorption constant,

        abar_i = K_i(T) . theta_i ,        K_i(T) = K0_i . exp(B_i / T)

    (K_i = 1 for a species that declares no adsorption).  Then

                 k_f . PROD abar_i^{a_i}  -  k_r . PROD abar_i^{b_i}
        r  =  ---------------------------------------------------------
                     ( v  +  SUM_ads abar_i ) ^ p

    * p = 0 (no `adsorption` block) collapses the denominator to 1 and leaves
      the plain POWER LAW: `type Arrhenius`, the mass-action rate every
      textbook starts from.
    * p > 0 is LANGMUIR-HINSHELWOOD-HOUGEN-WATSON.  The denominator is the
      fraction of sites left vacant, raised to the number of sites the
      rate-determining step needs.  It is what makes a catalytic reaction slow
      down as its own product covers the surface -- the inhibition a power law
      cannot express at any order.
    * v is the vacant-site term.  It is 1 in the classical Hougen-Watson forms
      (1 + K_A c_A + ...), and 0 in models where the surface is taken as
      saturated -- an ion-exchange resin swollen with liquid, say, where every
      site is occupied by SOMETHING and only the competition matters.

    The reverse rate is either DETAILED BALANCE (`reversible true`, k_r =
    k_f / Kc, so equilibrium is exactly where the thermodynamics puts it), or
    an explicitly regressed Arrhenius pair (`A_rev`, `Ea_rev`) -- which is what
    a kinetic paper reports, and what a fitted K_a can then be checked against.

    Note the adsorption weights sit in the NUMERATOR too.  That is not a
    convention: the rate-determining surface step sees the ADSORBED species,
    not the bulk ones, so k_f multiplies abar and not theta.  Any constant
    K_i can of course be absorbed into k_f, which is why the textbook forms
    look different -- and why a rate constant is meaningless without the rate
    law and the activity model it was regressed with.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <cstddef>
#include <string>
#include <vector>

namespace Choupo
{

class ThermoPackage;

class RateLaw
{
public:

    // Parse one reaction's `kinetics {}` (plus its `stoichiometry` orders and
    // the optional `reversible` flag).  `who` names the caller for errors.
    static RateLaw fromDict(const DictPtr&       rxn,
                            const ThermoPackage& thermo,
                            const std::string&   who);

    // Net rate r = r_forward - r_reverse.  `conc` is in mol/m^3 and `x` are the
    // mole fractions; the law uses whichever its basis asks for.  Units follow
    // the rate constants: mol/(m^3.s) volumetric, or mol/(g_cat.s) when the
    // reactor supplies a catalyst loading.
    scalar netRate(const ThermoPackage& thermo, scalar T,
                   const sVector& conc, const sVector& x) const;

    // The forward rate constant alone, for reporting.
    scalar kForward(scalar T) const;

    const std::string& typeName() const { return type_; }
    bool  isLHHW()        const { return ads_; }
    bool  activityBasis() const { return activity_; }

private:

    std::string type_     = "Arrhenius";
    bool        activity_ = false;              // theta = gamma.x instead of c

    scalar A_    = 0.0, Ea_    = 0.0;           // forward
    bool   revExplicit_ = false;
    scalar Arev_ = 0.0, Earev_ = 0.0;           // reverse, when regressed
    bool   revBalance_  = false;                // reverse from k_f / Kc

    sVector nu_, order_, orderRev_;

    // Adsorption (absent => plain power law)
    bool   ads_    = false;
    scalar adsExp_ = 1.0;                       // p
    scalar vacant_ = 1.0;                       // v
    struct Site { std::size_t i; scalar K0; scalar B; };
    std::vector<Site> sites_;
};

} // namespace Choupo
