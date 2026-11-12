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

#include "unitOperations/solids/Screen.H"
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

namespace {

constexpr scalar kPi = 3.14159265358979323846;

//  THE KARRA CAPACITY FACTORS, as King (2001) prints them, pp. 88-89.  Every
//  argument in the unit King states: h_T in mm, fractions in [0, 1].

//  eq. 4.32-4.33: the basic capacity [t/(h m2)]
scalar karraA(scalar hT)
{
    return (hT < 51.0) ? 12.13 * std::pow(hT, 0.32) - 10.3 : 0.34 * hT + 14.41;
}
//  eq. 4.36: the oversize factor; Pbar = fraction of the feed ABOVE h_T
scalar karraB(scalar Pbar)
{
    return (Pbar <= 0.87) ? 1.6 - 1.2 * Pbar : 4.275 - 4.25 * Pbar;
}
//  eq. 4.37: the half-size factor; x = fraction of the feed below h_T/2
scalar karraC(scalar x)
{
    if (x <= 0.30) return 0.7 + 1.2 * x;
    if (x <= 0.55) return 2.053 * std::pow(x, 0.564);
    if (x <= 0.80) return 3.35 * std::pow(x, 1.37);
    return 5.0 * x - 1.5;
}
//  p. 89: the wet-screening factor, T = 1.26 h_T with h_T in mm, as printed
//  ("whenever the material is sprayed with water"; 1 otherwise).
scalar karraE(scalar hT)
{
    const scalar T = 1.26 * hT;
    if (T < 1.0)  return 1.0;
    if (T < 2.0)  return T;
    if (T < 4.0)  return 1.5 + 0.25 * T;
    if (T < 6.0)  return 2.5;
    if (T < 10.0) return 3.25 - 0.125 * T;
    if (T < 12.0) return 4.5 - 0.25 * T;
    if (T < 16.0) return 2.1 - 0.05 * T;
    if (T < 24.0) return 1.5 - 0.0125 * T;
    if (T < 32.0) return 1.35 - 0.00625 * T;
    return 1.15;
}

MillAnchor karraVerify()
{
    //  King p. 87: "These factors all have a value of unity at the nominal
    //  standard operating condition".  The oversize factor at 50 % oversize
    //  and the half-size factor at 25 % half-size: B = 1.6 - 1.2 x 0.5 = 1,
    //  C = 0.7 + 1.2 x 0.25 = 1 -- identities at printed points.
    MillAnchor a;
    a.choupo = karraB(0.5) * karraC(0.25);
    a.published = 1.0;
    a.dev = std::abs(a.choupo - 1.0);
    a.kind = "identity";
    a.where = "King 2001 p. 87: the capacity factors are unity at the standard "
              "condition (B(0.5) C(0.25) = 1)";
    return a;
}

scalar yesNo(const DictPtr& d, const std::string& key, const std::string& me)
{
    const std::string w = d->lookupWord(key);
    if (w == "yes" || w == "true" || w == "on")  return 1.0;
    if (w == "no"  || w == "false" || w == "off") return 0.0;
    throw std::runtime_error(me + ": `" + key + "` is `yes` or `no`; got '" + w + "'.");
}

} // namespace


int Screen::solve(const DictPtr& dict, const ThermoPackage& thermo, int verbosity)
{
    const std::string me = "screen";
    const ClassifierFeed f = readClassifierFeed(dict, thermo, me);
    auto oper = dict->subDict("operation");
    if (!dict->found("model"))
        throw std::runtime_error(me + ": no `model` -- `karra` (King 2001 section "
            "4.2.1, no fitted parameter) or `declared` (the case's partition curve).");
    const std::string model = dict->lookupWord("model");
    if (model != "karra" && model != "declared")
        throw std::runtime_error(me + ": `model` is `karra` or `declared`; got '"
            + model + "'.");

    const scalar xLo = f.edges[1], xHi = f.edges.back();
    auto checkAperture = [&](scalar h)
    {
        if (!(h > xLo && h < xHi))
        {
            std::ostringstream o;
            o << me << ": the aperture " << h * 1e3 << " mm lies outside the case's "
              "size grid (" << xLo * 1e3 << " - " << xHi * 1e3 << " mm, the pan's top "
              "edge to xMax).  A screen whose opening the grid does not resolve "
              "splits nothing the case can see: extend the grid.";
            throw std::runtime_error(o.str());
        }
    };

    scalar Rfl = 0.0;
    if (f.mFluid > 0.0)
    {
        if (!oper->found("fluidToOversize"))
            throw std::runtime_error(me + ": the feed carries a fluid, so "
                "`fluidToOversize` (the fraction of it leaving with the oversize) "
                "must be declared -- neither model predicts it.");
        Rfl = oper->lookupScalar("fluidToOversize", Dims::dimensionless);
        if (Rfl < 0.0 || Rfl > 1.0)
            throw std::runtime_error(me + ": `fluidToOversize` must lie in [0, 1].");
    }

    std::vector<scalar> c, a;
    scalar R = 0.0;
    std::unique_ptr<PartitionCurve> curve;
    MillAnchor an;
    kpis_.clear();
    std::ostringstream rep;
    rep << std::fixed << std::setprecision(4);

    if (model == "declared")
    {
        if (!oper->found("partition"))
            throw std::runtime_error(me + ": `operation { partition { model ...; } }` "
                "is missing -- the `declared` screen IS its partition curve.");
        auto pd = oper->subDict("partition");
        if (!pd->found("model"))
            throw std::runtime_error(me + ": `partition { model ...; }` is missing.");
        curve = PartitionCurve::New(pd->lookupWord("model"), me);
        curve->readParameters(pd, f.w.size(), me);
        if (!curve->hasCutSize())
            throw std::runtime_error(me + ": the '" + curve->type() + "' partition "
                "has no cut size -- declare it in `partition {}`.");
        if (!oper->found("bypass"))
            throw std::runtime_error(me + ": `bypass` is missing -- the fraction of "
                "every class misplaced to the oversize (0 for none: say so).");
        R = oper->lookupScalar("bypass", Dims::dimensionless);
        if (R < 0.0 || R >= 1.0)
            throw std::runtime_error(me + ": `bypass` must lie in [0, 1).");
        if (oper->found("aperture")) checkAperture(oper->lookupScalar("aperture", Dims::length));
        c = curve->corrected(f.edges, f.xRep);
        an = curve->verify();
        rep << "  Partition:    " << curve->type() << "   " << curve->describe() << "\n"
            << "                " << curve->citation() << "\n";
    }
    else
    {
        for (const char* k : {"aperture", "wireDiameter", "inclination", "area",
                              "deck", "wetScreening", "bulkDensity"})
            if (!oper->found(k))
                throw std::runtime_error(me + ": the karra model needs `" + k
                    + "` (King 2001 eqs. 4.31-4.42) -- it is the screen's or the "
                      "feed's, and no default stands in for it.");
        const scalar h    = oper->lookupScalar("aperture", Dims::length);
        const scalar dw   = oper->lookupScalar("wireDiameter", Dims::length);
        const scalar th   = oper->lookupScalar("inclination", Dims::dimensionless); // rad
        const scalar Ar   = oper->lookupScalar("area", Dims::area);
        const scalar S    = oper->lookupScalar("deck", Dims::dimensionless);
        const scalar wet  = yesNo(oper, "wetScreening", me);
        const scalar rhoB = oper->lookupScalar("bulkDensity", Dims::density);
        checkAperture(h);
        if (!(dw >= 0.0) || !(Ar > 0.0) || !(rhoB > 0.0))
            throw std::runtime_error(me + ": wireDiameter >= 0, area > 0 and "
                "bulkDensity > 0 are required.");
        if (S < 1.0 || std::abs(S - std::round(S)) > 1e-9)
            throw std::runtime_error(me + ": `deck` is 1 for the top deck, 2 for "
                "the second, and so on (King eq. 4.38).");
        if (th < 0.0 || th >= kPi / 2.0)
            throw std::runtime_error(me + ": `inclination` must lie in [0, 90) "
                "degrees -- write it with its unit, e.g. `20 deg`.");

        //  eq. 4.31: the effective throughfall aperture, projected.
        const scalar hTm = (h + dw) * std::cos(th) - dw;        // m
        if (!(hTm > 0.0))
            throw std::runtime_error(me + ": the effective aperture h_T = (h + d_w) "
                "cos(theta) - d_w is not positive -- the wire, inclined, closes "
                "the opening (King eq. 4.31).");
        const scalar hT = hTm * 1e3;                             // mm, King's unit
        scalar A = karraA(hT);
        if (!(A > 0.0))
        {
            std::ostringstream o;
            o << me << ": the basic capacity 12.13 h_T^0.32 - 10.3 is not positive "
                 "at h_T = " << hT << " mm -- below the correlation's own zero "
                 "(about 0.6 mm), outside its window (King eq. 4.32).";
            throw std::runtime_error(o.str());
        }
        const scalar OA = 21.5 * std::log10(h * 1e3) + 37.0;     // eq. 4.34, %
        const bool hasOA = oper->found("openArea");
        if (hasOA)
        {
            const scalar oa = oper->lookupScalar("openArea", Dims::dimensionless);
            if (!(oa > 0.0 && oa < 1.0))
                throw std::runtime_error(me + ": `openArea` is a fraction in (0, 1).");
            A *= 100.0 * oa / OA;                                // eq. 4.35
        }
        const scalar PhT   = fractionPassing(f.edges, f.w, hTm);
        const scalar Phalf = fractionPassing(f.edges, f.w, 0.5 * hTm);
        const scalar P125  = fractionPassing(f.edges, f.w, 1.25 * hTm);
        const scalar P075  = fractionPassing(f.edges, f.w, 0.75 * hTm);
        const scalar Ph    = fractionPassing(f.edges, f.w, h);
        const scalar B  = karraB(1.0 - PhT);
        const scalar C  = karraC(Phalf);
        const scalar D  = 1.1 - 0.1 * S;
        const scalar E  = (wet > 0.5) ? karraE(hT) : 1.0;
        const scalar Fb = rhoB / 1600.0;
        const scalar Gc = 0.975 * std::pow(std::max(0.0, 1.0 - P125 + P075), 0.511);
        const scalar WF = f.mSolids * 3.6;                       // t/h
        const scalar ABCDEF = A * B * C * D * E * Fb;
        const scalar K = (WF * PhT / Ar) / ABCDEF;               // eq. 4.42
        if (!(K > 0.0))
            throw std::runtime_error(me + ": the loading K is zero -- no feed "
                "below h_T, so there is nothing to screen.");
        const scalar d50 = hTm * Gc / std::pow(K, 0.148);        // eq. 4.43
        auto pd = std::make_shared<Dictionary>("partition");
        pd->insert("m", 5.9);
        pd->insert("d50", d50);
        curve = PartitionCurve::New("rosinRammler", me);
        curve->readParameters(pd, f.w.size(), me);
        c = curve->corrected(f.edges, f.xRep);
        an = karraVerify();
        scalar U = 0.0;
        for (std::size_t i = 0; i < c.size(); ++i) U += (1.0 - c[i]) * f.w[i] * WF;
        const scalar Th  = ABCDEF * Gc * Ar;                      // eq. 4.30
        const scalar AUF = U / Th;                                // eq. 4.48
        const scalar eff = (Ph > 0.0) ? U / (WF * Ph) : 0.0;      // eqs. 4.46-4.47
        kpis_["hT_mm"]   = hT;
        kpis_["karra_A"] = A;   kpis_["karra_B"] = B;   kpis_["karra_C"] = C;
        kpis_["karra_D"] = D;   kpis_["karra_E"] = E;   kpis_["karra_F"] = Fb;
        kpis_["karra_Gc"] = Gc; kpis_["karra_K"] = K;
        kpis_["karra_d50_um"] = d50 * 1e6;
        kpis_["theoreticalUndersize_t_h"] = Th;
        kpis_["undersizeTransmitted_t_h"] = U;
        kpis_["areaUtilisationFactor"]    = AUF;
        kpis_["screeningEfficiency"]      = eff;
        rep << "  Model:        karra (Karra 1979; King 2001 sec. 4.2.1-4.2.2, eqs. "
               "4.30-4.48, pp. 87-90)\n"
            << "  Aperture:     h = " << h * 1e3 << " mm, d_w = " << dw * 1e3
            << " mm, theta = " << th * 180.0 / kPi << " deg  ->  h_T = " << hT << " mm\n"
            << "  Feed:         P(h_T) = " << PhT << ", P(h_T/2) = " << Phalf
            << ", near-size P(1.25h_T) - P(0.75h_T) = " << P125 - P075 << "\n"
            << "  Factors:      A = " << A << " t/(h m2)"
            << (hasOA ? " (open area applied, eq. 4.35)" : " (standard light-medium mesh)")
            << ", B = " << B << ", C = " << C << ", D = " << D
            << ", E = " << E << ", F = " << Fb << ", Gc = " << Gc << "\n"
            << "  Loading:      K = " << K << "  ->  d50 = h_T Gc / K^0.148 = "
            << d50 * 1e3 << " mm\n"
            << "  Capacity:     theoretical " << Th << " t/h of undersize, "
               "transmitted " << U << " t/h  ->  AUF = " << AUF
            << (AUF > 1.0 ? "  (OVERLOADED)" : "") << "\n"
            << "  Efficiency:   " << eff << "  (undersize transmitted / undersize "
               "in the feed at h, eq. 4.47)\n";
    }

    a.resize(c.size());
    for (std::size_t i = 0; i < c.size(); ++i) a[i] = R + (1.0 - R) * c[i];
    const ClassifierSplit sp = splitOnPartition(f, a, Rfl, thermo, "oversize", "undersize");
    produced_ = { sp.coarse, sp.fine };

    UnitProfile prof;
    publishClassification(kpis_, prof, f, c, a, R, Rfl, sp, "oversize", "undersize");
    kpis_["anchor_partition_dev"] = an.dev;
    profile_ = prof;

    if (verbosity >= 1)
    {
        std::cout << "\n========================  Screen Result  =========================\n"
                  << rep.str()
                  << std::fixed << std::setprecision(4)
                  << "  Solids:       " << f.mSolids * 3.6 << " t/h;  to oversize "
                  << sp.Y * f.mSolids * 3.6 << " t/h (Y = " << sp.Y << "), undersize "
                  << (1.0 - sp.Y) * f.mSolids * 3.6 << " t/h\n";
        if (f.mFluid > 0.0)
            std::cout << "  Fluid:        " << f.mFluid * 3.6 << " t/h;  to oversize "
                      << Rfl << "\n";
        std::cout << std::scientific << std::setprecision(3)
                  << "  Closure:      max_k |over + under - feed| / m_s = " << sp.sizeClosure
                  << ";  fluid " << sp.fluidClosure << "\n" << std::fixed
                  << "  [anchor] " << (model == "karra" ? std::string("karra") : curve->type())
                  << ": " << std::setprecision(5) << an.choupo << " vs " << an.published
                  << "  (dev " << std::setprecision(3) << 100.0 * an.dev << " %, "
                  << an.kind << ")  " << an.where << "\n";
        if (verbosity >= 2) printClassTable(f, c, a, sp, "oversize", "undersize");
        std::cout << "==================================================================\n\n";
    }
    return 0;
}

} // namespace Choupo
