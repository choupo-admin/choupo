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

#include "ChemSepCp16.H"
#include "core/Advisory.H"

#include <cmath>
#include <iostream>
#include <stdexcept>
#include <variant>

namespace Choupo {

ChemSepCp16::ChemSepCp16(const DictPtr& dict)
{
    const auto c = dict->lookupList("coefficients");
    if (c.size() != 5)
        throw std::runtime_error(
            "chemsepCp16: 'coefficients' must be exactly 5 values (A B C D E)"
            " -- the form is Cp = A + exp(B/T + C + D T + E T^2) and every one"
            " of them is load-bearing; a short list would silently drop a term");
    A_ = c[0]; B_ = c[1]; C_ = c[2]; D_ = c[3]; E_ = c[4];

    owner_ = dict->lookupWordOrDefault("owner", "");

    //  THE SAME THREE STATES the polynomial form has (AP3): a declared
    //  window, a DECLARED absence, or no key at all.  They are different
    //  facts about the curation and are kept apart here for the same reason.
    if (dict->found("Trange"))
    {
        //  DISCRIMINATE ON THE VARIANT, never by asking for a word:
        //  `lookupWordOrDefault` THROWS on a list rather than falling back,
        //  so asking it first would refuse every record with a numeric range.
        const bool isWord =
            std::holds_alternative<std::string>(dict->entryValue("Trange"));
        if (isWord && dict->lookupWord("Trange") == "unknown")
        {
            rangeUnknown_ = true;
            AdvisoryLog::instance().add(
                "validity", "warning",
                owner_.empty() ? "chemsepCp16" : "component '" + owner_ + "'",
                "declares `Trange unknown;` -- the correlation's validity"
                " domain could not be recovered, so its values carry no"
                " validity claim at any temperature");
        }
        else
        {
            const auto r = dict->lookupList("Trange");
            if (r.size() != 2)
                throw std::runtime_error("chemsepCp16: 'Trange' needs two"
                                         " values, or the word `unknown`");
            Tmin_ = r[0]; Tmax_ = r[1];
            if (Tmax_ <= Tmin_)
                throw std::runtime_error(
                    "chemsepCp16: Trange (" + std::to_string(Tmin_) + " "
                    + std::to_string(Tmax_) + ") is not an interval."
                    "  An inverted window is a MALFORMED CLAIM about where the"
                    " correlation holds, not an extrapolation -- write"
                    " `Trange unknown;` if the domain is not recoverable.");
        }
    }
}


void ChemSepCp16::noteRange(scalar T) const
{
    //  `Trange unknown;` was announced at construction: that fact does not
    //  depend on T, and announcing it here would tie its delivery to whether
    //  a hot path happens to run.
    if (rangeUnknown_ || Tmax_ <= Tmin_) return;
    if (T >= Tmin_ && T <= Tmax_) return;
    if (announcedOutside_) return;
    announcedOutside_ = true;

    const std::string who = owner_.empty() ? "chemsepCp16"
                                           : "component '" + owner_ + "'";
    AdvisoryLog::instance().add(
        "validity", "warning", who,
        "ideal-gas Cp evaluated at T = " + std::to_string(T)
        + " K, OUTSIDE its declared Trange (" + std::to_string(Tmin_) + " "
        + std::to_string(Tmax_) + ") -- extrapolated, still returned");
}


scalar ChemSepCp16::Cp(scalar T) const
{
    noteRange(T);
    if (T <= 0)
        throw std::runtime_error("chemsepCp16: Cp asked at T <= 0 K");
    return A_ + std::exp(B_ / T + C_ + D_ * T + E_ * T * T);
}


namespace {

//  Composite Simpson.  THE INTEGRAL IS NUMERICAL BECAUSE THE FORM HAS NO
//  ELEMENTARY ANTIDERIVATIVE, and that is said rather than worked around: the
//  alternative was to fit a polynomial in order to integrate it in closed
//  form, which is exactly the refit this model exists to avoid.
//
//  The panel count is fixed and generous rather than adaptive.  Cp(T) here is
//  smooth and monotone-ish over any interval a process visits, so 200 panels
//  put the quadrature error far below the correlation's own residual -- and a
//  DETERMINISTIC rule keeps the enthalpy of a given (T, Tref) identical from
//  run to run, which an adaptive one would not.
template <class F>
scalar simpson(F f, scalar a, scalar b)
{
    if (b == a) return 0.0;
    const int n = 200;                      // even
    const scalar h = (b - a) / n;
    scalar s = f(a) + f(b);
    for (int i = 1; i < n; ++i)
        s += f(a + i * h) * ((i % 2) ? 4.0 : 2.0);
    return s * h / 3.0;
}

} // namespace


scalar ChemSepCp16::H(scalar T, scalar Tref) const
{
    noteRange(T);
    noteRange(Tref);
    return simpson([&](scalar t) { return A_ + std::exp(B_/t + C_ + D_*t + E_*t*t); },
                   Tref, T);
}


scalar ChemSepCp16::S(scalar T, scalar Tref) const
{
    noteRange(T);
    noteRange(Tref);
    if (T <= 0 || Tref <= 0)
        throw std::runtime_error("chemsepCp16: entropy integral needs T > 0");
    return simpson([&](scalar t)
                   { return (A_ + std::exp(B_/t + C_ + D_*t + E_*t*t)) / t; },
                   Tref, T);
}

} // namespace Choupo
