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

#include "AmbroseWalton.H"

#include "core/Advisory.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <limits>
#include <sstream>
#include <stdexcept>

namespace Choupo {

namespace {

//  The curve's own normal boiling point may differ from the record's Tb by
//  this much before the model says so.  1 K is a STATED DEFAULT (C281 step 1):
//  an accurate corresponding-states curve lands within a fraction of a kelvin
//  of a well-measured Tb, while the usual scatter of a reported Tb between
//  sources is of the same order, so a smaller gap would announce noise.  It is
//  a threshold on an ANNOUNCEMENT only; no pressure is changed by it.
constexpr scalar tbGapAnnounce_K = 1.0;

std::string fmt(scalar v, int prec, bool sign = false)
{
    std::ostringstream os;
    os << std::fixed << std::setprecision(prec);
    if (sign) os << std::showpos;
    os << v;
    return os.str();
}

} // namespace

AmbroseWalton::AmbroseWalton(const DictPtr& dict)
:   name_("AmbroseWalton")
{
    // Tc/Pc/omega are injected from the component by Component::Component
    // (they live at component level).  Pc is stored in BAR throughout Choupo
    // (the EoS does the same c.Pc()*1e5); convert to Pa here so psat() works in
    // pure SI.  Fail loud + remedy-bearing if missing.
    Tc_    = dict->lookupScalarOrDefault("Tc",    0.0);
    Pc_    = dict->lookupScalarOrDefault("Pc",    0.0) * 1.0e5;   // bar -> Pa
    omega_ = dict->lookupScalarOrDefault("omega", 0.0);

    if (Tc_ <= 0.0 || Pc_ <= 0.0)
        throw std::runtime_error("AmbroseWalton vapour pressure needs Tc and Pc "
            "(> 0) and omega on the component.  This corresponding-states model "
            "takes them from the component automatically -- declare Tc, Pc and "
            "omega (a Joback + Lee-Kesler estimate provides all three).");

    //  Tb is injected from the component like Tc/Pc/omega, but the CURVE does
    //  not use it: it is read only to compare against the curve's own normal
    //  boiling point, below.  0 means the record declares none.
    const scalar Tb = dict->lookupScalarOrDefault("Tb", 0.0);
    announce(dict->lookupWordOrDefault("owner", ""), Tb);
}

//  Normal boiling point of the curve itself: the T at which psat() = 1 atm,
//  by bisection on the monotone curve between 0.2 Tc and Tc.  NaN when the
//  curve never reaches 1 atm below Tc (Pc < 1 atm) or is already above it at
//  0.2 Tc.
scalar AmbroseWalton::normalBoilingPoint(scalar Tc, scalar Pc, scalar omega)
{
    const scalar P1 = 101325.0;
    scalar lo = 0.2 * Tc;
    scalar hi = Tc * (1.0 - 1.0e-12);
    if (!(psat(lo, Tc, Pc, omega) < P1) || !(psat(hi, Tc, Pc, omega) >= P1))
        return std::numeric_limits<scalar>::quiet_NaN();
    for (int i = 0; i < 200; ++i)
    {
        const scalar mid = 0.5 * (lo + hi);
        if (psat(mid, Tc, Pc, omega) < P1) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
}

//  SAY WHAT THIS CURVE IS (C281 step 1).  The record marks the estimate only in
//  a comment; a result built on this model carried no word of it.  Once per
//  component per process, through AdvisoryLog, so it reaches the end-of-run
//  caveat block and the result JSON.  No number moves.
void AmbroseWalton::announce(const std::string& owner, scalar Tb) const
{
    const std::string who = owner.empty() ? std::string("(unnamed component)")
                                          : owner;
    const std::string locus = "component '" + who + "'";

    const std::string inputs =
        "Tc = " + fmt(Tc_, 2) + " K, Pc = " + fmt(Pc_ / 1.0e5, 3)
        + " bar, omega = " + fmt(omega_, 4);
    if (AdvisoryLog::instance().addAnnouncedOnce("aw-estimate:" + who,
            "provenance", "info", locus,
            "vapour pressure is an Ambrose-Walton corresponding-states "
            "ESTIMATE from " + inputs + ", not a fit to measurements"))
    {
        std::cerr << "[psat-estimate] " << who << ": the vapour pressure is an"
                     " Ambrose-Walton corresponding-states ESTIMATE computed"
                     " from " << inputs << ".  It is not a fit to vapour-pressure"
                     " measurements and it does not read the record's Tb; its"
                     " accuracy degrades for polar, hydrogen-bonding and"
                     " associating species.\n";
    }

    if (!(Tb > 0.0)) return;

    const scalar Tnb = normalBoilingPoint(Tc_, Pc_, omega_);
    const bool noRoot = std::isnan(Tnb);
    if (!noRoot && std::fabs(Tnb - Tb) <= tbGapAnnounce_K) return;

    const std::string what = noRoot
        ? "the curve never reaches 101325 Pa below Tc, but the record declares "
          "Tb = " + fmt(Tb, 2) + " K"
        : "the curve's own normal boiling point (P = 101325 Pa) is "
          + fmt(Tnb, 2) + " K, the record declares Tb = " + fmt(Tb, 2)
          + " K, a gap of " + fmt(Tnb - Tb, 2, true) + " K (threshold "
          + fmt(tbGapAnnounce_K, 1) + " K)";
    const std::string remedy =
        "The curve does not use Tb, so the two contradict each other.  Remedy:"
        " a vapour-pressure record fitted to measurements (Antoine or Wagner),"
        " or a review of omega (and Tc, Pc) in this record -- the record's Tb"
        " may itself be an estimate.";
    if (AdvisoryLog::instance().addAnnouncedOnce("aw-tbgap:" + who,
            "validity", "warning", locus, what + ".  " + remedy))
    {
        std::cerr << "[psat-estimate] " << who << ": " << what << ".  "
                  << remedy << "\n";
    }
}

scalar AmbroseWalton::psat(scalar T, scalar Tc, scalar Pc, scalar omega)
{
    // No saturation above the critical point -- cap at Pc (Pr = 1 at Tr = 1).
    if (T >= Tc) return Pc;

    const scalar Tr  = T / Tc;
    const scalar tau = 1.0 - Tr;

    // tau powers (tau > 0 below Tc, so the fractional powers are real).
    const scalar t10 = tau;
    const scalar t15 = tau * std::sqrt(tau);          // tau^1.5
    const scalar t25 = t15 * tau;                      // tau^2.5
    const scalar t50 = tau * tau * tau * tau * tau;    // tau^5

    const scalar f0 = (-5.97616 * t10 + 1.29874 * t15 - 0.60394 * t25 - 1.06841 * t50) / Tr;
    const scalar f1 = (-5.03365 * t10 + 1.11505 * t15 - 5.41217 * t25 - 7.46628 * t50) / Tr;
    const scalar f2 = (-0.64771 * t10 + 2.41539 * t15 - 4.26979 * t25 + 3.25259 * t50) / Tr;

    const scalar lnPr = f0 + omega * f1 + omega * omega * f2;
    return Pc * std::exp(lnPr);
}

scalar AmbroseWalton::computePsat(scalar T) const
{
    return psat(T, Tc_, Pc_, omega_);
}

//  d ln Psat/dT, analytic (the base class continues ln Psat from Tc with it:
//  a finite difference at Tc is only good to ~1e-4 because of the tau^1.5
//  term).  With g_k(tau) the numerator polynomials above and Tr = T/Tc,
//      ln Pr = G(tau)/Tr ,  G = g0 + omega g1 + omega^2 g2 ,
//      d ln Pr/dT = -(G'(tau) Tr + G) / (Tc Tr^2) ,  tau = 1 - Tr.
scalar AmbroseWalton::computeDlnPsatDT(scalar T) const
{
    if (!(T > 0.0) || T > Tc_) return std::numeric_limits<scalar>::quiet_NaN();
    const scalar Tr  = T / Tc_;
    const scalar tau = 1.0 - Tr;
    const scalar s   = std::sqrt(tau);
    const scalar t10 = tau, t15 = tau * s, t25 = t15 * tau;
    const scalar t50 = tau * tau * tau * tau * tau;
    const scalar w = omega_, w2 = omega_ * omega_;

    auto g  = [&](scalar c1, scalar c15, scalar c25, scalar c50)
    { return c1 * t10 + c15 * t15 + c25 * t25 + c50 * t50; };
    auto dg = [&](scalar c1, scalar c15, scalar c25, scalar c50)
    { return c1 + 1.5 * c15 * s + 2.5 * c25 * t15
           + 5.0 * c50 * tau * tau * tau * tau; };

    const scalar G  = g (-5.97616, 1.29874, -0.60394, -1.06841)
                    + w  * g (-5.03365, 1.11505, -5.41217, -7.46628)
                    + w2 * g (-0.64771, 2.41539, -4.26979, 3.25259);
    const scalar dG = dg(-5.97616, 1.29874, -0.60394, -1.06841)
                    + w  * dg(-5.03365, 1.11505, -5.41217, -7.46628)
                    + w2 * dg(-0.64771, 2.41539, -4.26979, 3.25259);
    return -(dG * Tr + G) / (Tc_ * Tr * Tr);
}

} // namespace Choupo
