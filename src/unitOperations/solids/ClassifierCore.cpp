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

#include "unitOperations/solids/ClassifierCore.H"
#include "unitOperations/solids/classifierModel/PartitionCurves.H"
#include "streams/PsdOnGrid.H"
#include "core/distribution/SizeGrid.H"
#include "core/Dimensions.H"
#include "thermo/ThermoPackage.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

ClassifierFeed readClassifierFeed(const DictPtr& dict, const ThermoPackage& thermo,
                                  const std::string& owner)
{
    const std::size_t n = thermo.n();
    ClassifierFeed f;
    auto feed = dict->subDict("feed");
    f.F  = feed->lookupScalar("F", Dims::molarFlow);
    f.T  = feed->lookupScalar("T", Dims::temperature);
    f.P  = feed->lookupScalar("P", Dims::pressure);
    f.vf = feed->lookupScalarOrDefault("vf", 0.0);
    f.z.assign(n, 0.0);
    if (dict->found("composition"))
    {
        auto comp = dict->subDict("composition");
        for (const auto& k : comp->keys()) f.z[thermo.indexOf(k)] = comp->lookupScalar(k);
    }
    if (!dict->found("solids"))
        throw std::runtime_error(owner + ": the feed carries no solids -- a size "
            "classifier splits particles by size.");
    auto sol = dict->subDict("solids");
    f.s.assign(n, 0.0);
    {
        auto sf = sol->subDict("solidMolarFlows");
        for (const auto& k : sf->keys()) f.s[thermo.indexOf(k)] = sf->lookupScalar(k);
    }
    for (std::size_t i = 0; i < n; ++i)
        if (f.s[i] > 0.0) f.mSolids += f.s[i] * thermo.comp(i).MW();
    if (!(f.mSolids > 0.0))
        throw std::runtime_error(owner + ": the feed's solid flow is zero.");

    //  The stream's F and z describe its FLUID; the solids ride their own
    //  channel s (ProcessStream; the stream table says so).
    f.fluid.assign(n, 0.0);
    for (std::size_t i = 0; i < n; ++i)
    {
        f.fluid[i] = std::max(0.0, f.F * f.z[i]);
        f.mFluid  += f.fluid[i] * thermo.comp(i).MW();
    }
    if (f.mFluid > 0.0 && f.vf > 0.0)
        throw std::runtime_error(owner + ": the feed's fluid carries vapour "
            "(vf > 0).  A size classifier of powders and slurries splits a "
            "liquid or nothing; a gas-borne powder is a `cyclone`'s.");

    if (!sol->found("sizeEdges"))
        throw std::runtime_error(owner + ": the feed's size distribution is not "
            "on the case's size grid.  A partition curve is applied class by "
            "class, so the classes must be the case's: declare `sizeGrid { xMax; "
            "ratio; nClasses; }` in system/flowsheetDict and give the feed a "
            "`particleSizeDistribution` (docs/design/c361-solids-processing.md).");
    f.edges = sol->lookupList("sizeEdges");
    f.xRep  = sol->lookupList("diameters");
    f.w     = sol->lookupList("massFractions");
    if (f.edges.size() != f.w.size() + 1 || f.xRep.size() != f.w.size())
        throw std::runtime_error(owner + ": the feed's size distribution is "
            "malformed (edges, sizes and fractions disagree in length).");
    scalar sw = 0.0;
    for (auto v : f.w) sw += v;
    if (!(sw > 0.0))
        throw std::runtime_error(owner + ": the feed's size fractions sum to zero.");
    for (auto& v : f.w) v /= sw;
    return f;
}

scalar fractionPassing(const std::vector<scalar>& e, const std::vector<scalar>& w,
                       scalar x)
{
    if (e.size() != w.size() + 1 || w.empty()) return 0.0;
    scalar tot = 0.0;
    for (auto v : w) tot += v;
    if (!(tot > 0.0)) return 0.0;
    if (x <= e.front()) return 0.0;
    if (x >= e.back())  return 1.0;
    scalar U = 0.0;
    for (std::size_t k = 0; k < w.size(); ++k)
    {
        const scalar lo = e[k], hi = e[k + 1];
        if (x < hi)
        {
            scalar t;
            if (lo <= 0.0) t = x / hi;                                   // the pan
            else           t = std::log(x / lo) / std::log(hi / lo);
            return U + t * w[k] / tot;
        }
        U += w[k] / tot;
    }
    return 1.0;
}

ClassifierSplit splitOnPartition(const ClassifierFeed& f,
                                 const std::vector<scalar>& a,
                                 scalar Rfl,
                                 const ThermoPackage& thermo,
                                 const std::string& coarseName,
                                 const std::string& fineName)
{
    const std::size_t n = thermo.n(), nc = f.w.size();
    ClassifierSplit sp;
    sp.coarseFlow.assign(nc, 0.0);
    sp.fineFlow.assign(nc, 0.0);
    scalar mc = 0.0, mf = 0.0;
    for (std::size_t k = 0; k < nc; ++k)
    {
        const scalar feedk = f.w[k] * f.mSolids;
        sp.coarseFlow[k] = a[k] * feedk;
        sp.fineFlow[k]   = feedk - sp.coarseFlow[k];       // the DIFFERENCE: exact
        mc += sp.coarseFlow[k];
        mf += sp.fineFlow[k];
        const scalar r = std::abs(sp.coarseFlow[k] + sp.fineFlow[k] - feedk) / f.mSolids;
        sp.sizeClosure = std::max(sp.sizeClosure, r);
    }
    sp.Y = mc / f.mSolids;
    sp.coarseW.assign(nc, 0.0);
    sp.fineW.assign(nc, 0.0);
    for (std::size_t k = 0; k < nc; ++k)
    {
        if (mc > 0.0) sp.coarseW[k] = sp.coarseFlow[k] / mc;
        if (mf > 0.0) sp.fineW[k]   = sp.fineFlow[k] / mf;
    }

    //  Every solid component in the proportion Y, every fluid component in
    //  R_fl: one population, one fluid.
    sVector sc(n, 0.0), sf(n, 0.0), lc(n, 0.0), lf(n, 0.0);
    scalar fluidIn = 0.0, fluidOut = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        sc[i] = sp.Y * f.s[i];
        sf[i] = f.s[i] - sc[i];
        lc[i] = Rfl * f.fluid[i];
        lf[i] = f.fluid[i] - lc[i];
        fluidIn  += f.fluid[i] * thermo.comp(i).MW();
        fluidOut += (lc[i] + lf[i]) * thermo.comp(i).MW();
    }
    sp.fluidClosure = (fluidIn > 0.0) ? std::abs(fluidOut - fluidIn) / fluidIn : 0.0;

    auto build = [&](const std::string& nm, const sVector& s, const sVector& l,
                     const std::vector<scalar>& w, scalar mSol)
    {
        ProcessStream p;
        p.name = nm;
        //  F and z are the FLUID's; the solids are s.
        scalar F = 0.0;
        for (std::size_t i = 0; i < n; ++i) F += l[i];
        p.F = F;
        p.T = f.T; p.P = f.P; p.vf = f.vf;
        p.z.assign(n, 0.0);
        if (F > 0.0) for (std::size_t i = 0; i < n; ++i) p.z[i] = l[i] / F;
        else         p.z = f.z;
        p.s = s;
        if (mSol > 0.0)
        {
            p.psd.edges = f.edges;
            p.psd.diameter = f.xRep;
            p.psd.massFrac = w;
        }
        return p;
    };
    sp.coarse = build(coarseName, sc, lc, sp.coarseW, mc);
    sp.fine   = build(fineName,   sf, lf, sp.fineW,   mf);
    return sp;
}

void publishClassification(std::map<std::string, scalar>& kpis,
                           UnitProfile& prof,
                           const ClassifierFeed& f,
                           const std::vector<scalar>& c,
                           const std::vector<scalar>& a,
                           scalar R, scalar Rfl,
                           const ClassifierSplit& sp,
                           const std::string& cw,
                           const std::string& fw)
{
    kpis["solidsMassFlow_kg_s"]          = f.mSolids;
    kpis["fluidMassFlow_kg_s"]           = f.mFluid;
    kpis["solidsTo_" + cw]               = sp.Y;
    kpis["fluidTo_" + cw]                = Rfl;
    kpis["bypass"]                       = R;
    kpis[cw + "_solids_kg_s"]            = sp.Y * f.mSolids;
    kpis[fw + "_solids_kg_s"]            = (1.0 - sp.Y) * f.mSolids;
    kpis["sizeMassClosure"]              = sp.sizeClosure;
    kpis["fluidMassClosure"]             = sp.fluidClosure;
    const scalar d50c = partitionSize(f.xRep, c, 0.5);
    const scalar d50  = partitionSize(f.xRep, a, 0.5);
    const scalar d25  = partitionSize(f.xRep, a, 0.25);
    const scalar d75  = partitionSize(f.xRep, a, 0.75);
    if (d50c > 0.0) kpis["d50c_um"] = d50c * 1e6;
    if (d50  > 0.0) kpis["d50_um"]  = d50 * 1e6;
    //  Wills & Napier-Munn 2006 eq. 9.14, p. 214, on the ACTUAL curve: only
    //  when the curve reaches both 25 % and 75 % (a bypass above 25 % leaves
    //  no d25, and the imperfection is then undefined, not zero).
    if (d50 > 0.0 && d25 > 0.0 && d75 > 0.0)
        kpis["imperfection"] = (d75 - d25) / (2.0 * d50);
    auto onGrid = [&](const std::vector<scalar>& w)
    {
        ParticleSizeDistribution p;
        p.diameter = f.xRep; p.massFrac = w; p.edges = f.edges;
        return p;
    };
    publishPsdKpis(kpis, "feed_", onGrid(f.w));
    if (sp.Y > 0.0) publishPsdKpis(kpis, cw + "_", onGrid(sp.coarseW));
    if (sp.Y < 1.0) publishPsdKpis(kpis, fw + "_", onGrid(sp.fineW));

    prof.xAxis = "x_um";
    std::vector<scalar> xc, fc, cc, ac, pc, qc;
    for (std::size_t k = 0; k < f.w.size(); ++k)
    {
        xc.push_back(f.xRep[k] * 1e6);
        fc.push_back(f.w[k]);
        cc.push_back(c[k]);
        ac.push_back(a[k]);
        pc.push_back(sp.coarseW[k]);
        qc.push_back(sp.fineW[k]);
    }
    prof.columns["x_um"]                  = xc;
    prof.columns["feed_massFrac"]         = fc;
    prof.columns["partition_corrected"]   = cc;
    prof.columns["partition_actual"]      = ac;
    prof.columns[cw + "_massFrac"]        = pc;
    prof.columns[fw + "_massFrac"]        = qc;
}

void printClassTable(const ClassifierFeed& f,
                     const std::vector<scalar>& c,
                     const std::vector<scalar>& a,
                     const ClassifierSplit& sp,
                     const std::string& cw,
                     const std::string& fw)
{
    std::cout << "  class   edges [um]               feed     corrected  actual   "
              << std::setw(9) << cw << "  " << std::setw(9) << fw << "\n";
    for (std::size_t k = f.w.size(); k-- > 0;)
        std::cout << "  " << std::setw(4) << k << "   " << std::fixed
                  << std::setprecision(2) << std::setw(9) << f.edges[k] * 1e6
                  << " - " << std::setw(9) << f.edges[k + 1] * 1e6 << "   "
                  << std::setprecision(5) << std::setw(8) << f.w[k] << "  "
                  << std::setw(8) << c[k] << "  " << std::setw(8) << a[k] << "  "
                  << std::setw(9) << sp.coarseW[k] << "  " << std::setw(9)
                  << sp.fineW[k] << "\n";
}

} // namespace Choupo
