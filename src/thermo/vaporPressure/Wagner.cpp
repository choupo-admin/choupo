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

#include "Wagner.H"

#include "core/Dimensions.H"

#include <cmath>
#include <stdexcept>
#include <string>

namespace Choupo {

Wagner::Wagner(const DictPtr& dict)
:   name_("Wagner")
{
    if (!dict->found("reducing"))
        throw std::runtime_error("Wagner vapour pressure: `reducing { T <K>;"
            " P <pressure>; }` is REQUIRED -- the coefficients are meaningful"
            " only with the reducing constants they were fitted with, so the"
            " component's own Tc / Pc are NOT substituted for them.  Copy the"
            " reducing constants from the same source as the coefficients.");
    auto r = dict->subDict("reducing");
    Tr_ = r->lookupScalar("T", Dims::temperature);
    Pr_ = r->lookupScalar("P", Dims::pressure);
    if (!(Tr_ > 0.0) || !(Pr_ > 0.0))
        throw std::runtime_error("Wagner vapour pressure: reducing T and P"
            " must both be positive.");

    auto c = dict->lookupList("coefficients");
    auto x = dict->lookupList("exponents");
    if (c.empty())
        throw std::runtime_error("Wagner vapour pressure: `coefficients` is"
            " empty.");
    if (c.size() != x.size())
        throw std::runtime_error("Wagner vapour pressure: `coefficients` holds "
            + std::to_string(c.size()) + " values and `exponents` holds "
            + std::to_string(x.size()) + " -- one exponent per coefficient,"
              " declared from the same source (the form is a family and the"
              " exponent set says which member).");
    for (scalar ei : x)
        if (!(ei > 0.0))
            throw std::runtime_error("Wagner vapour pressure: every exponent"
                " must be positive (tau^e must vanish at the reducing point).");
    a_.assign(c.begin(), c.end());
    e_.assign(x.begin(), x.end());

    if (dict->found("Trange"))
    {
        auto t = dict->lookupList("Trange");
        if (t.size() != 2)
            throw std::runtime_error("Wagner vapour pressure: 'Trange' must"
                " hold (Tmin Tmax)");
        Tmin_ = t[0]; Tmax_ = t[1];
    }
}

scalar Wagner::psat(scalar T, scalar Tr, scalar Pr,
                    const std::vector<scalar>& a,
                    const std::vector<scalar>& e)
{
    //  A trial temperature at or below absolute zero is a SOLVER excursion,
    //  not a state (measured: a reactive column's MESH iteration asks for
    //  one, and recovers).  The equation's own limit there is Psat -> 0, and
    //  returning that limit keeps the excursion recoverable; the base class
    //  has already announced the evaluation outside the declared window.
    //  (Antoine returns an arbitrary number there -- 10^(A - B/(T + C)) --
    //  which is no better and is not announced as one.)
    if (!(T > 0.0)) return 0.0;
    //  No saturation line above the reducing (critical) point: return Pr,
    //  as AmbroseWalton returns Pc.  The base class says so aloud.
    if (T >= Tr) return Pr;
    const scalar tau = 1.0 - T / Tr;
    scalar sum = 0.0;
    for (std::size_t i = 0; i < a.size(); ++i)
        sum += a[i] * std::pow(tau, e[i]);
    return Pr * std::exp(Tr / T * sum);
}

scalar Wagner::computePsat(scalar T) const
{
    return psat(T, Tr_, Pr_, a_, e_);
}

} // namespace Choupo
