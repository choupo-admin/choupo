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
Description
    DryingCurve implementation -- see DryingCurve.H.
\*---------------------------------------------------------------------------*/

#include "DryingCurve.H"

#include "core/RegistryRefusal.H"

#include <cmath>
#include <sstream>
#include <stdexcept>

namespace Choupo {

std::string DryingCurve::shapeName() const
{
    switch (shape_)
    {
        case Shape::power: return "power";
        case Shape::table: return "table";
        default:           return "linear";
    }
}

DryingCurve DryingCurve::read(const DictPtr& op, const std::string& who)
{
    DryingCurve c;
    if (!op->found("dryingCurve")) return c;          // linear, undeclared
    auto d = op->subDict("dryingCurve");
    c.declared_ = true;
    const std::string where = who + ": operation.dryingCurve";

    const std::string s = d->lookupWord("shape");
    if      (s == "linear") c.shape_ = Shape::linear;
    else if (s == "power")  c.shape_ = Shape::power;
    else if (s == "table")  c.shape_ = Shape::table;
    else
        throw std::runtime_error(where + ": " + registryRefusal::message(
            "drying-curve shape", s, { "linear", "power", "table" },
            "Accepted"));

    //  A key that belongs to another shape is a declaration this shape
    //  would silently ignore -- refused by name instead.
    auto forbid = [&](const char* key, const char* owner) {
        if (d->found(key))
            throw std::runtime_error(where + ": '" + key + "' is read only by"
                " shape " + owner + "; this curve declares shape " + s + ".");
    };

    if (c.shape_ != Shape::linear)
    {
        if (!d->found("source"))
            throw std::runtime_error(where + ": shape " + s + " is a claim"
                " about THIS material's internal transport, so it must say"
                " where it comes from: declare source \"<article, dataset,"
                " or 'hypothetical teaching curve'>\";");
        c.source_ = d->lookupWordOrDefault("source", "");
    }
    else if (d->found("source"))
        c.source_ = d->lookupWordOrDefault("source", "");

    if (c.shape_ == Shape::power)
    {
        forbid("phi", "table");  forbid("f", "table");
        c.n_ = d->lookupScalar("exponent");
        if (!(c.n_ > 0.0))
            throw std::runtime_error(where + ": exponent must be > 0 (f ="
                " Phi^n; n = 1 is the linear curve, n < 1 keeps the rate high"
                " into the falling period, n > 1 drops it early).");
    }
    else if (c.shape_ == Shape::table)
    {
        forbid("exponent", "power");
        c.phi_ = d->lookupList("phi");
        c.f_   = d->lookupList("f");
        std::ostringstream m;
        if (c.phi_.size() != c.f_.size() || c.phi_.size() < 2)
            m << "phi and f must be two lists of the SAME length, at least 2"
                 " points (got " << c.phi_.size() << " and " << c.f_.size()
              << ")";
        else if (c.phi_.front() != 0.0 || c.f_.front() != 0.0
              || c.phi_.back()  != 1.0 || c.f_.back()  != 1.0)
            m << "the curve must start at (Phi, f) = (0, 0) -- no drying at"
                 " the equilibrium moisture -- and end at (1, 1) -- the"
                 " constant rate at the critical moisture";
        else
            for (std::size_t i = 1; i < c.phi_.size() && m.str().empty(); ++i)
            {
                if (!(c.phi_[i] > c.phi_[i - 1]))
                    m << "phi must increase strictly (point " << i + 1
                      << ": " << c.phi_[i] << " after " << c.phi_[i - 1] << ")";
                else if (c.f_[i] < c.f_[i - 1])
                    m << "f must not decrease as Phi increases (point " << i + 1
                      << ": f = " << c.f_[i] << " after " << c.f_[i - 1]
                      << "); a rate that RISES as the solid dries is not a"
                         " characteristic curve -- smooth the measurement";
            }
        if (!m.str().empty()) throw std::runtime_error(where + ": " + m.str());
    }
    else
    {
        forbid("exponent", "power");  forbid("phi", "table");
        forbid("f", "table");
    }
    return c;
}

scalar DryingCurve::f(scalar phi) const
{
    if (phi >= 1.0) return 1.0;
    if (phi <= 0.0) return 0.0;
    switch (shape_)
    {
        case Shape::power: return std::pow(phi, n_);
        case Shape::table:
        {
            std::size_t i = 1;
            while (i < phi_.size() - 1 && phi_[i] < phi) ++i;
            const scalar w = (phi - phi_[i - 1]) / (phi_[i] - phi_[i - 1]);
            return f_[i - 1] + w * (f_[i] - f_[i - 1]);
        }
        default: return phi;
    }
}

} // namespace Choupo
