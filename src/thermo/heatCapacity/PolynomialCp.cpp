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

#include "PolynomialCp.H"
#include <iostream>

#include <cmath>
#include <stdexcept>

namespace Choupo {

PolynomialCp::PolynomialCp(const DictPtr& dict)
{
    a_ = dict->lookupList("coefficients");
    if (a_.empty())
        throw std::runtime_error("PolynomialCp: 'coefficients' is empty");
    if (a_.size() > 5)
        throw std::runtime_error("PolynomialCp: at most 5 coefficients (a0..a4)");
    if (dict->found("Trange"))
    {
        auto r = dict->lookupList("Trange");
        if (r.size() != 2)
            throw std::runtime_error("PolynomialCp: 'Trange' must hold (Tmin Tmax)");
        Tmin_ = r[0]; Tmax_ = r[1];
    }
    owner_ = dict->lookupWordOrDefault("owner", "");
}

//  THE DECLARED WINDOW IS NOW USED (AP3).  Two distinct things can be wrong,
//  and they need different sentences:
//
//    * the window is NOT A WINDOW (hi <= lo).  Six records in the catalogue
//      declare one -- CoolProp liquid-Cp fits with a four-term polynomial over
//      a 1 K or 0 K span, which cannot have been fitted as stated.  Saying
//      "outside the range" about such a record would be nonsense: EVERY T is
//      outside an empty interval.  So it gets its own message, and it names
//      the defect rather than the symptom.
//
//    * T is genuinely outside a VALID window.  I4 is explicit that this is
//      ANNOUNCED, never refused -- "the professor extrapolates on purpose,
//      but knows he did".
//
//  Once per model instance, then a bool test: Cp(T) runs inside the Newton
//  loop and provenance must not live there.
void PolynomialCp::noteRange(scalar T) const
{
    if (Tmin_ == 0.0 && Tmax_ == 0.0) return;          // no window declared

    if (Tmax_ <= Tmin_)
    {
        if (!announcedBadWindow_)
        {
            announcedBadWindow_ = true;
            std::cerr << "[cp] polynomial Cp"
                      << (owner_.empty() ? std::string()
                                         : " for '" + owner_ + "'")
                      << " declares Trange (" << Tmin_ << " " << Tmax_
                      << "), which is not an interval -- the upper bound does"
                         " not exceed the lower.\n     The fit's true domain"
                         " is therefore UNKNOWN, so this Cp is being used with"
                         " no validity claim at all.  Re-derive the range from"
                         " the regression that produced the coefficients.\n";
        }
        return;
    }

    if ((T < Tmin_ || T > Tmax_) && !announcedOutside_)
    {
        announcedOutside_ = true;
        std::cerr << "[cp] polynomial Cp"
                  << (owner_.empty() ? std::string() : " for '" + owner_ + "'")
                  << " evaluated at T = " << T << " K, OUTSIDE its declared"
                     " Trange (" << Tmin_ << " " << Tmax_ << ").\n     The"
                     " value is extrapolated: it is still returned (I4 --"
                     " extrapolation is a legitimate choice), but it is no"
                     " longer covered by the fit.\n";
    }
}

scalar PolynomialCp::Cp(scalar T) const
{
    noteRange(T);
    scalar s = 0.0;
    scalar pwr = 1.0;
    for (scalar a : a_) { s += a * pwr; pwr *= T; }
    return s;
}

scalar PolynomialCp::H(scalar T, scalar Tref) const
{
    // ∫ Cp dT = Σ a_k T^{k+1} / (k+1)
    auto integral = [&](scalar tau) {
        scalar s = 0.0;
        scalar pwr = tau;
        for (std::size_t k = 0; k < a_.size(); ++k)
        {
            s += a_[k] * pwr / static_cast<scalar>(k + 1);
            pwr *= tau;
        }
        return s;
    };
    return integral(T) - integral(Tref);
}

scalar PolynomialCp::S(scalar T, scalar Tref) const
{
    //  ∫ Cp/T dT
    //  = a_0 · ln(T/Tref) + Σ_{k≥1} a_k · (T^k − Tref^k) / k
    if (a_.empty()) return 0.0;
    scalar s = a_[0] * std::log(T / Tref);
    scalar pwrT    = T;
    scalar pwrTref = Tref;
    for (std::size_t k = 1; k < a_.size(); ++k)
    {
        s += a_[k] * (pwrT - pwrTref) / static_cast<scalar>(k);
        pwrT    *= T;
        pwrTref *= Tref;
    }
    return s;
}

} // namespace Choupo
