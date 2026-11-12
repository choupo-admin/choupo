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

#include "unitOperations/solids/Classifier.H"
#include "unitOperations/solids/ClassifierCore.H"
#include "unitOperations/solids/classifierModel/PartitionCurves.H"
#include "core/Dimensions.H"
#include "thermo/ThermoPackage.H"

#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

int Classifier::solve(const DictPtr& dict, const ThermoPackage& thermo, int verbosity)
{
    const std::string me = "classifier";
    const ClassifierFeed f = readClassifierFeed(dict, thermo, me);
    auto oper = dict->subDict("operation");

    if (!oper->found("partition"))
        throw std::runtime_error(me + ": `operation { partition { model ...; } }` is "
            "missing -- a classifier IS its partition curve.");
    auto pd = oper->subDict("partition");
    if (!pd->found("model"))
    {
        std::string avail;
        for (const auto& m : PartitionCurve::availableTypes()) avail += " " + m;
        throw std::runtime_error(me + ": `partition { model ...; }` is missing.  "
            "Registered:" + avail);
    }
    auto curve = PartitionCurve::New(pd->lookupWord("model"), me);
    curve->readParameters(pd, f.w.size(), me);
    if (!curve->hasCutSize())
        throw std::runtime_error(me + ": the '" + curve->type() + "' partition has "
            "no cut size -- declare it in `partition {}`.");

    if (!oper->found("bypass"))
        throw std::runtime_error(me + ": `bypass` is missing -- the fraction of "
            "every class short-circuited to the coarse product (0 for a perfect "
            "classifier: say so).");
    const scalar R = oper->lookupScalar("bypass", Dims::dimensionless);
    if (R < 0.0 || R >= 1.0)
        throw std::runtime_error(me + ": `bypass` must lie in [0, 1).");

    scalar Rfl = 0.0;
    if (f.mFluid > 0.0)
    {
        if (!oper->found("fluidToCoarse"))
            throw std::runtime_error(me + ": the feed carries a fluid, so "
                "`fluidToCoarse` (the fraction of it leaving with the coarse "
                "product) must be declared -- a partition curve says nothing "
                "about the liquid.");
        Rfl = oper->lookupScalar("fluidToCoarse", Dims::dimensionless);
        if (Rfl < 0.0 || Rfl > 1.0)
            throw std::runtime_error(me + ": `fluidToCoarse` must lie in [0, 1].");
    }

    const std::vector<scalar> c = curve->corrected(f.edges, f.xRep);
    std::vector<scalar> a(c.size());
    for (std::size_t k = 0; k < c.size(); ++k) a[k] = R + (1.0 - R) * c[k];

    const ClassifierSplit sp = splitOnPartition(f, a, Rfl, thermo, "coarse", "fine");
    produced_ = { sp.coarse, sp.fine };

    kpis_.clear();
    UnitProfile prof;
    publishClassification(kpis_, prof, f, c, a, R, Rfl, sp, "coarse", "fine");
    const MillAnchor an = curve->verify();
    kpis_["anchor_partition_dev"] = an.dev;
    profile_ = prof;

    if (verbosity >= 1)
    {
        std::cout << "\n======================  Classifier Result  =======================\n"
                  << "  Partition:    " << curve->type() << "   " << curve->describe() << "\n"
                  << "                " << curve->citation() << "\n"
                  << std::fixed << std::setprecision(4)
                  << "  Bypass R:     " << R << "   (a_k = R + (1 - R) c_k)\n"
                  << "  Solids:       " << f.mSolids * 3.6 << " t/h on " << f.w.size()
                  << " classes;  to coarse " << sp.Y * f.mSolids * 3.6 << " t/h (Y = "
                  << sp.Y << ")\n";
        if (f.mFluid > 0.0)
            std::cout << "  Fluid:        " << f.mFluid * 3.6 << " t/h;  to coarse "
                      << Rfl << "\n";
        std::cout << std::scientific << std::setprecision(3)
                  << "  Closure:      max_k |coarse + fine - feed| / m_s = " << sp.sizeClosure
                  << ";  fluid " << sp.fluidClosure << "\n" << std::fixed;
        std::cout << "  [anchor] partition " << curve->type() << ": " << std::setprecision(5)
                  << an.choupo << " vs " << an.published << "  (dev " << std::setprecision(3)
                  << 100.0 * an.dev << " %, " << an.kind << ")  " << an.where << "\n";
        if (verbosity >= 2) printClassTable(f, c, a, sp, "coarse", "fine");
        std::cout << "==================================================================\n\n";
    }
    return 0;
}

} // namespace Choupo
