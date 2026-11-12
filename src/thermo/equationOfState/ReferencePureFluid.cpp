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

#include "ReferencePureFluid.H"

#include <cmath>
#include <iostream>
#include <stdexcept>

namespace Choupo {

HelmholtzPureFluid::HelmholtzPureFluid(const DictPtr& dict, scalar mw)
:   mw_(mw)
{
    const std::string equation = dict->lookupWord("equation");
    fluid_ = &helmholtz::ReferenceFluid::load(equation);
    std::cout << "[pureFluid] Helmholtz: " << f().equation()
              << " -- reference equation of state of " << f().fluid()
              << "; primary " << f().citation() << "; " << f().windowSentence()
              << "; the publication's check values reproduced at load\n";
}

helmholtz::State HelmholtzPureFluid::stateAt(scalar T, scalar p) const
{
    f().announceIfOutside(T, p);
    return f().at(T, f().density(T, p));
}

scalar HelmholtzPureFluid::h_molar(scalar T, scalar p) const
{ return stateAt(T, p).h * mw_ / 1000.0; }

scalar HelmholtzPureFluid::s_molar(scalar T, scalar p) const
{ return stateAt(T, p).s * mw_ / 1000.0; }

scalar HelmholtzPureFluid::v_molar(scalar T, scalar p) const
{ return mw_ / 1000.0 / f().density(T, p); }

scalar HelmholtzPureFluid::cp_molar(scalar T, scalar p) const
{ return stateAt(T, p).cp * mw_ / 1000.0; }

scalar HelmholtzPureFluid::p_sat(scalar T) const
{ return f().saturation(T).psat; }

scalar HelmholtzPureFluid::T_sat(scalar p) const
{
    // Newton on ln p along the equation's own saturation curve, with the
    // Clapeyron slope  dpsat/dT = (s'' - s') / (1/rho'' - 1/rho')  from the
    // same Maxwell solution; safeguarded by bisection inside the bracket.
    scalar lo = f().Ttriple(), hi = f().Tc();
    if (!(p >= p_sat(lo) && p <= p_sat(hi)))
        throw std::runtime_error("Helmholtz " + f().equation() + ": T_sat asked at p = "
            + std::to_string(p) + " Pa, outside the saturation curve (triple point "
              "to the critical point)");
    if (p == p_sat(hi)) return hi;
    scalar T = 0.5 * (lo + hi);
    for (int it = 0; it < 100; ++it)
    {
        const helmholtz::Saturation s = f().saturation(T);
        if (s.psat < p) lo = T; else hi = T;
        const scalar slope = (s.vapour.s - s.liquid.s) / (1.0 / s.rhoV - 1.0 / s.rhoL);
        scalar Tn = T - (s.psat - p) / slope;
        if (!(Tn > lo && Tn < hi)) Tn = 0.5 * (lo + hi);
        if (std::fabs(Tn - T) <= 1.0e-12 * T) return Tn;
        T = Tn;
    }
    return T;
}

std::pair<scalar, scalar> HelmholtzPureFluid::saturationWindow() const
{
    return { f().Ttriple(), f().Tc() };
}

double HelmholtzPureFluid::verify() const
{
    return f().worstRelativeDeviation();
}

} // namespace Choupo
