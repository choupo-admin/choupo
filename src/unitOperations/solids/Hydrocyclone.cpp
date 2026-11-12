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

#include "unitOperations/solids/Hydrocyclone.H"
#include "thermo/LiquidPropertyDoor.H"
#include "unitOperations/solids/ClassifierCore.H"
#include "unitOperations/solids/classifierModel/PartitionCurves.H"
#include "core/Dimensions.H"
#include "thermo/ThermoPackage.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {


int Hydrocyclone::solve(const DictPtr& dict, const ThermoPackage& thermo, int verbosity)
{
    const std::string me = "hydrocyclone";
    const ClassifierFeed f = readClassifierFeed(dict, thermo, me);
    const std::size_t n = thermo.n();
    if (!(f.mFluid > 0.0))
        throw std::runtime_error(me + ": the feed is DRY -- a hydrocyclone "
            "classifies a slurry, the particles carried by the liquid's vortex.  "
            "A dry powder is a `screen`'s or a `classifier`'s.");
    auto oper = dict->subDict("operation");
    if (!dict->found("model"))
        throw std::runtime_error(me + ": no `model` -- `declared` (the case's "
            "partition curve and water split).  The empirical correlation of "
            "Nageswararao, Wiseman & Napier-Munn (2004) is not built: it waits "
            "for a source that prints its constants and a worked example.");
    const std::string model = dict->lookupWord("model");
    if (model != "declared")
        throw std::runtime_error(me + ": `model` is `declared`; got '" + model
            + "'.");

    //  Slurry state: solids density from the components (volume-additive),
    //  liquid density from the package at the feed's T and P.
    scalar invRhoS = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        if (!(f.s[i] > 0.0)) continue;
        const scalar rp = thermo.comp(i).rho_p();
        if (!(rp > 0.0))
            throw std::runtime_error(me + ": solid '" + thermo.comp(i).name()
                + "' has no particle density -- add `solid { rho_p <kg/m^3>; }` "
                  "to its component record.");
        invRhoS += (f.s[i] * thermo.comp(i).MW() / f.mSolids) / rp;
    }
    const scalar rhoS = 1.0 / invRhoS;
    sVector xl(n, 0.0);
    scalar nFl = 0.0;
    for (std::size_t i = 0; i < n; ++i) nFl += f.fluid[i];
    for (std::size_t i = 0; i < n; ++i) xl[i] = f.fluid[i] / nFl;
    const scalar rhoL = liquidProperty::evaluate(thermo, liquidProperty::Property::density, f.T, f.P, xl).value;
    const scalar Vs = f.mSolids / rhoS, Vl = f.mFluid / rhoL;      // m3/s
    const scalar CW = 100.0 * f.mSolids / (f.mSolids + f.mFluid);  // % by weight
    const scalar CV = Vs / (Vs + Vl);                              // fraction
    const scalar rhoPulp = (f.mSolids + f.mFluid) / (Vs + Vl);     // kg/m3

    std::unique_ptr<PartitionCurve> curve;
    scalar Rf = 0.0;
    MillAnchor an;
    kpis_.clear();
    std::ostringstream rep;
    rep << std::fixed << std::setprecision(4);

    {
        if (!oper->found("partition"))
            throw std::runtime_error(me + ": `operation { partition { model ...; "
                "d50c ...; } }` is missing -- the `declared` hydrocyclone IS its "
                "corrected curve and its water split.");
        auto pd = oper->subDict("partition");
        if (!pd->found("model"))
            throw std::runtime_error(me + ": `partition { model ...; }` is missing.");
        curve = PartitionCurve::New(pd->lookupWord("model"), me);
        curve->readParameters(pd, f.w.size(), me);
        if (!curve->hasCutSize())
            throw std::runtime_error(me + ": the '" + curve->type() + "' partition "
                "has no cut size -- declare `d50c` (or `d50`) in `partition {}`.");
        if (!oper->found("waterToUnderflow"))
            throw std::runtime_error(me + ": `waterToUnderflow` (R_f, the fraction "
                "of the feed water leaving in the underflow) is missing -- it is "
                "also the solids bypass (Kelsall; Wills eq. 9.15).");
        Rf = oper->lookupScalar("waterToUnderflow", Dims::dimensionless);
        if (!(Rf >= 0.0 && Rf < 1.0))
            throw std::runtime_error(me + ": `waterToUnderflow` must lie in [0, 1).");
        an = curve->verify();
        rep << "  Model:        declared\n"
            << "  Partition:    " << curve->type() << "   " << curve->describe() << "\n"
            << "                " << curve->citation() << "\n";
    }

    const std::vector<scalar> c = curve->corrected(f.edges, f.xRep);
    std::vector<scalar> a(c.size());
    for (std::size_t k = 0; k < c.size(); ++k) a[k] = Rf + (1.0 - Rf) * c[k];
    const ClassifierSplit sp = splitOnPartition(f, a, Rf, thermo, "underflow", "overflow");
    produced_ = { sp.coarse, sp.fine };

    UnitProfile prof;
    publishClassification(kpis_, prof, f, c, a, Rf, Rf, sp, "underflow", "overflow");
    kpis_["anchor_partition_dev"] = an.dev;
    kpis_["feedSolids_wt_pct"]    = CW;
    kpis_["feedSolids_vol_frac"]  = CV;
    kpis_["rho_pulp"]             = rhoPulp;
    kpis_["rho_solid"]            = rhoS;
    kpis_["rho_liquid"]           = rhoL;
    //  The products' dilution ratios (water/solids by mass), the quantity a
    //  plant reads off its densities (Wills p. 215).
    const scalar mU = sp.Y * f.mSolids, mO = (1.0 - sp.Y) * f.mSolids;
    kpis_["feed_dilution"] = f.mFluid / f.mSolids;
    if (mU > 0.0) kpis_["underflow_dilution"] = Rf * f.mFluid / mU;
    if (mO > 0.0) kpis_["overflow_dilution"]  = (1.0 - Rf) * f.mFluid / mO;
    profile_ = prof;

    if (verbosity >= 1)
    {
        std::cout << "\n=====================  Hydrocyclone Result  ======================\n"
                  << rep.str()
                  << std::fixed << std::setprecision(4)
                  << "  Slurry:       " << f.mSolids * 3.6 << " t/h solids in "
                  << f.mFluid * 3.6 << " t/h liquid;  " << CW << " % solids by weight, C_V = "
                  << CV << ";  rho_s " << rhoS << ", rho_l " << rhoL << ", pulp "
                  << rhoPulp << " kg/m3\n"
                  << "  Water split:  R_f = " << Rf << " to underflow (also the solids "
                     "bypass: a_k = R_f + (1 - R_f) c_k)\n"
                  << "  Solids:       to underflow " << mU * 3.6 << " t/h (Y = " << sp.Y
                  << "), overflow " << mO * 3.6 << " t/h\n"
                  << "  Dilution:     feed " << f.mFluid / f.mSolids;
        if (mU > 0.0) std::cout << ", underflow " << Rf * f.mFluid / mU;
        if (mO > 0.0) std::cout << ", overflow " << (1.0 - Rf) * f.mFluid / mO;
        std::cout << "  (water/solids by mass)\n"
                  << std::scientific << std::setprecision(3)
                  << "  Closure:      max_k |under + over - feed| / m_s = " << sp.sizeClosure
                  << ";  water " << sp.fluidClosure << "\n" << std::fixed
                  << "  [anchor] " << curve->type()
                  << ": " << std::setprecision(5) << an.choupo << " vs " << an.published
                  << "  (dev " << std::setprecision(3) << 100.0 * an.dev << " %, "
                  << an.kind << ")  " << an.where << "\n";
        if (verbosity >= 2) printClassTable(f, c, a, sp, "underflow", "overflow");
        std::cout << "==================================================================\n\n";
    }
    return 0;
}

} // namespace Choupo
