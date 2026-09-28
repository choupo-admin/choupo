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

#include "FitWeighting.H"
#include "EvidencePartition.H"

#include <algorithm>
#include <iostream>
#include <stdexcept>
#include <string>

namespace Choupo {

sVector fitWeights(const DictPtr& residualDict,
                   const EvidencePartition* partition,
                   const std::vector<std::string>& xNames,
                   const std::vector<std::string>& yNames,
                   const std::vector<std::string>& zNames,
                   int verbosity)
{
    const std::string weighting =
        residualDict->lookupWordOrDefault("weighting", "equal");
    if (weighting != "equal" && weighting != "uncertainty")
        throw std::runtime_error("fitParameters(T_bubble): `weighting "
            + weighting + ";` is not a weighting this operation knows.  "
            "Accepted: equal, uncertainty.");
    sVector w;
    if (weighting == "equal")
        return w;
    if (!partition)
        throw std::runtime_error("fitParameters(T_bubble): `weighting "
            "uncertainty;` needs the evidence FILES, which carry the"
            " uncertainties; the inline `residual.data ( )` form carries none.");

    for (const auto& ds : partition->fit())
    {
        //  The same reader, the same names the fit loads its points with, so
        //  the count compared below is the count the fit will use.
        const auto pts = EvidencePartition::loadColumns(
            ds, xNames, yNames, "fitParameters(T_bubble)", zNames);
        auto d = Dictionary::fromFile(ds.path);
        const std::string where = "fitParameters(T_bubble): dataset '"
                                + ds.path + "'";
        if (!d->found("uncertainty")
            || !d->subDict("uncertainty")->found("T_bubble")
            || !d->subDict("uncertainty")->subDict("T_bubble")->found("values"))
            throw std::runtime_error(where + " carries no `uncertainty {"
                " T_bubble { values ( ... ); } }`, and the residual declares"
                " `weighting uncertainty;`.  A point with no stated"
                " uncertainty cannot be weighted by one; declare `weighting"
                " equal;` or give every fit dataset its values.");
        auto u = d->subDict("uncertainty")->subDict("T_bubble");
        const std::string unit = u->lookupWordOrDefault("unit", "");
        if (unit != "K")
            throw std::runtime_error(where + ": the T_bubble uncertainty"
                " declares unit '" + unit + "'.  Only K is read; a"
                " conversion here would be a silent one.");
        const auto vals = u->lookupList("values");
        if (vals.size() != pts.size())
            throw std::runtime_error(where + ": " + std::to_string(vals.size())
                + " uncertainty values for " + std::to_string(pts.size())
                + " data rows.  They are aligned by position, so a different"
                  " count means they no longer describe the same points.");
        for (const scalar v : vals)
        {
            if (!(v > 0.0))
                throw std::runtime_error(where + ": an uncertainty of "
                    + std::to_string(v) + " K.  Zero claims a perfect"
                    " measurement and a negative one is meaningless;"
                    " neither can weight a residual.");
            w.push_back(1.0 / v);
        }
    }

    if (verbosity >= 2 && !w.empty())
    {
        scalar umin = 1.0e30, umax = 0.0;
        for (const scalar x : w)
        { umin = std::min(umin, 1.0 / x); umax = std::max(umax, 1.0 / x); }
        std::cout << "      [weighting] uncertainty -- each fit point weighted"
                     " by 1/U, U = " << umin << " .. " << umax
                  << " K (the datasets' own expanded uncertainties); chi2 is"
                     " then dimensionless.  The held-out AAD stays"
                     " unweighted, in K.\n";
    }
    return w;
}

} // namespace Choupo
