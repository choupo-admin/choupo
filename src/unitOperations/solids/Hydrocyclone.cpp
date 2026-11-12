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

//  THE DATA WINDOW of the Nageswararao correlations, as the 2004 paper states
//  it.  Feed solids by weight: the model-fitting set ran 41-70 % (p. 684),
//  the parameters were "evaluated using data with C_W greater than 40 %"
//  (p. 681) and tests above 70 % were excluded (p. 678).  Cyclone diameter:
//  the database's 20", 15", 10" and 6" cyclones, 38.1-10.2 cm (p. 677).
constexpr scalar kCwMin = 40.0, kCwMax = 70.0;          // % by weight
constexpr scalar kDcMin = 0.102, kDcMax = 0.381;        // m

//  Nageswararao et al. 2004 p. 681: "an increase in D_u of 10 % will always
//  result in an increase of 26 % in R_f" -- the exponent 2.40 of eq. 15 at a
//  printed point (1.1^2.40 = 1.2569).
MillAnchor nageswararaoVerify()
{
    MillAnchor a;
    a.choupo = std::pow(1.1, 2.40);
    a.published = 1.26;
    a.dev = std::abs(a.choupo - a.published) / a.published;
    a.kind = "identity";
    a.where = "Nageswararao et al. 2004 p. 681: +10 % spigot -> +26 % R_f (eq. 15)";
    return a;
}

} // namespace


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
            "partition curve and water split) or `nageswararao` (Nageswararao, "
            "Wiseman & Napier-Munn 2004).");
    const std::string model = dict->lookupWord("model");
    if (model != "declared" && model != "nageswararao")
        throw std::runtime_error(me + ": `model` is `declared` or `nageswararao`; "
            "got '" + model + "'.");

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
    const scalar rhoL = thermo.density(f.T, f.P, xl, DensityPhase::Liquid);
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

    if (model == "declared")
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
    else
    {
        //  The paper's fluid is water and nothing else (p. 675): the
        //  package's aqueous solvent (its one home, ThermoPackage) and no
        //  other fluid component.
        const std::size_t iw = thermo.findAqueousSolvent();
        for (std::size_t i = 0; i < n; ++i)
            if (f.fluid[i] > 0.0 && i != iw)
                throw std::runtime_error(me + ": the nageswararao model is "
                    "applicable only when WATER is the fluid medium (Nageswararao "
                    "et al. 2004 p. 675); the feed's liquid carries '"
                    + thermo.comp(i).name() + "'.");
        {
            std::ostringstream o;
            o << std::fixed << std::setprecision(2);
            if (CW < kCwMin || CW > kCwMax)
            {
                o << me << ": the feed is " << CW << " % solids by weight, outside "
                     "the nageswararao correlation's window " << kCwMin << " - "
                  << kCwMax << " % (the model-fitting data, Nageswararao et al. "
                     "2004 pp. 678, 681, 684).  Outside it the paper says the "
                     "predictions are doubtful (p. 678); use `model declared;`.";
                throw std::runtime_error(o.str());
            }
        }
        if (!oper->found("geometry"))
            throw std::runtime_error(me + ": `geometry { Dc; Do; Du; Di; Lc; "
                "coneAngle; }` is missing.");
        auto g = oper->subDict("geometry");
        for (const char* k : {"Dc", "Do", "Du", "Di", "Lc", "coneAngle"})
            if (!g->found(k))
                throw std::runtime_error(me + ": `geometry { " + std::string(k)
                    + " ...; }` is missing (Nageswararao eqs. 13-15).");
        const scalar Dc = g->lookupScalar("Dc", Dims::length);
        const scalar Do = g->lookupScalar("Do", Dims::length);
        const scalar Du = g->lookupScalar("Du", Dims::length);
        const scalar Di = g->lookupScalar("Di", Dims::length);
        const scalar Lc = g->lookupScalar("Lc", Dims::length);
        const scalar th = g->lookupScalar("coneAngle", Dims::dimensionless) * 180.0 / kPi;
        if (!(th > 0.0 && th < 180.0))
            throw std::runtime_error(me + ": `coneAngle` must lie in (0, 180) "
                "degrees -- write it with its unit, e.g. `15 deg`.");
        if (!(Do > 0.0 && Du > 0.0 && Di > 0.0 && Lc > 0.0))
            throw std::runtime_error(me + ": every geometric length must be positive.");
        if (Dc < kDcMin * (1.0 - 1e-9) || Dc > kDcMax * (1.0 + 1e-9))
        {
            std::ostringstream o;
            o << std::fixed << std::setprecision(3) << me << ": D_c = " << Dc
              << " m is outside the nageswararao correlation's window " << kDcMin
              << " - " << kDcMax << " m (the 10.2-38.1 cm cyclones of its "
                 "database, Nageswararao et al. 2004 p. 677).";
            throw std::runtime_error(o.str());
        }
        if (!oper->found("nCyclones"))
            throw std::runtime_error(me + ": `nCyclones` is missing -- the feed is "
                "shared equally among them, and Q in eq. 13 is ONE cyclone's.");
        const scalar nCyc = oper->lookupScalar("nCyclones", Dims::dimensionless);
        if (nCyc < 1.0 || std::abs(nCyc - std::round(nCyc)) > 1e-9)
            throw std::runtime_error(me + ": `nCyclones` is a whole number >= 1.");
        if (!oper->found("constants"))
            throw std::runtime_error(me + ": `constants { KQ0; KD0; KW0; }` is "
                "missing -- the material constants are the CASE's (Nageswararao "
                "et al. 2004 p. 679: they must be sourced from a test or a "
                "survey of the material), never a default.");
        auto kd = oper->subDict("constants");
        for (const char* k : {"KQ0", "KD0", "KW0"})
            if (!kd->found(k))
                throw std::runtime_error(me + ": `constants { " + std::string(k)
                    + " ...; }` is missing -- a material constant of the feed.");
        const scalar KQ0 = kd->lookupScalar("KQ0");
        const scalar KD0 = kd->lookupScalar("KD0");
        const scalar KW0 = kd->lookupScalar("KW0");
        if (!oper->found("alpha"))
            throw std::runtime_error(me + ": `alpha` (the sharpness of the Whiten "
                "curve, eq. 21) is missing -- a property of the feed, determined "
                "by test work (p. 681).");
        if (!oper->found("hinderedSettling"))
            throw std::runtime_error(me + ": `hinderedSettling` is missing: "
                "`original` (lambda = C_V/(1-C_V)^3, p. 676) or `steinour` (lambda "
                "= 10^(1.82 C_V)/(1-C_V)^2, p. 684).  The case's K_D0 and K_W0 "
                "were fitted with ONE of them.");
        const std::string hs = oper->lookupWord("hinderedSettling");
        scalar lambda;
        if (hs == "original")      lambda = CV / std::pow(1.0 - CV, 3);
        else if (hs == "steinour") lambda = std::pow(10.0, 1.82 * CV) / std::pow(1.0 - CV, 2);
        else throw std::runtime_error(me + ": `hinderedSettling` is `original` or "
                 "`steinour`; got '" + hs + "'.");

        //  The paper's units (footnote 4, p. 677).
        const scalar Q    = (Vs + Vl) * 3600.0 / nCyc;            // m3/h per cyclone
        const scalar rhoP = rhoPulp / 1000.0;                     // t/m3
        const scalar gacc = 9.80665;                              // m/s2
        //  eq. 13 solved for the feed pressure P [kPa].
        const scalar rhsQ = KQ0 * std::pow(Dc, -0.10) * std::pow(Do / Dc, 0.68)
                          * std::pow(Di / Dc, 0.45) * std::pow(Lc / Dc, 0.20)
                          * std::pow(th, -0.10);
        if (!(rhsQ > 0.0))
            throw std::runtime_error(me + ": K_Q0 must be positive.");
        const scalar sq   = Q / (Dc * Dc * rhsQ);                 // sqrt(P/rho_p)
        const scalar Pk   = rhoP * sq * sq;                       // kPa
        const scalar Pgr  = Pk / (rhoP * gacc * Dc);              // P/(rho_p g D_c)
        //  eq. 14: the corrected cut size [um].
        const scalar d50c = Dc * KD0 * std::pow(Dc, -0.65) * std::pow(Do / Dc, 0.52)
                          * std::pow(Du / Dc, -0.50) * std::pow(Di / Dc, 0.20)
                          * std::pow(Lc / Dc, 0.20) * std::pow(th, 0.15)
                          * std::pow(Pgr, -0.22) * std::pow(lambda, 0.93);
        //  eq. 15 (D_i/D_c)^+0.50 as stated in section 3.2.4; eq. 18 prints -0.50.
        Rf = KW0 * std::pow(Do / Dc, -1.19) * std::pow(Du / Dc, 2.40)
           * std::pow(Di / Dc, 0.50) * std::pow(Lc / Dc, 0.22) * std::pow(th, -0.24)
           * std::pow(Pgr, -0.53) * std::pow(lambda, 0.27);
        if (!(Rf > 0.0 && Rf < 1.0))
        {
            std::ostringstream o;
            o << me << ": eq. 15 predicts a water recovery to underflow R_f = " << Rf
              << ", outside (0, 1) -- the declared K_W0 and geometry are not a "
                 "cyclone the correlation describes.";
            throw std::runtime_error(o.str());
        }
        const scalar alpha = oper->lookupScalar("alpha", Dims::dimensionless);
        auto pd = std::make_shared<Dictionary>("partition");
        pd->insert("alpha", alpha);
        curve = PartitionCurve::New("whiten", me);
        curve->readParameters(pd, f.w.size(), me);
        curve->setCutSize(d50c * 1e-6);
        an = nageswararaoVerify();
        kpis_["P_kPa"]               = Pk;
        kpis_["Q_m3h_perCyclone"]    = Q;
        kpis_["nCyclones"]           = nCyc;
        kpis_["lambda"]              = lambda;
        kpis_["model_d50c_um"]       = d50c;
        kpis_["model_Rf"]            = Rf;
        kpis_["P_over_rhogDc"]       = Pgr;
        kpis_["hydraulicPower_kW"]   = Pk * Q * nCyc / 3600.0;   // Wills eq. 9.20
        rep << "  Model:        nageswararao (Nageswararao, Wiseman & Napier-Munn "
               "2004, eqs. 13-15 p. 677, eq. 21 p. 681)\n"
            << "  Geometry:     D_c " << Dc << " m, D_o " << Do << ", D_u " << Du
            << ", D_i " << Di << ", L_c " << Lc << " m, cone " << th << " deg;  "
            << nCyc << " cyclone(s)\n"
            << "  Constants:    K_Q0 " << KQ0 << ", K_D0 " << KD0 << ", K_W0 " << KW0
            << ", alpha " << alpha << "  (the case's, for its material)\n"
            << "  Hindered:     " << hs << "  lambda = " << lambda << "  (C_V = "
            << CV << ")\n"
            << "  eq. 13:       Q = " << Q << " m3/h per cyclone  ->  P = " << Pk
            << " kPa  (the feed pressure the cyclone needs; P Q = "
            << Pk * Q * nCyc / 3600.0 << " kW, Wills eq. 9.20)\n"
            << "  eq. 14:       d50c = " << d50c << " um\n"
            << "  eq. 15:       R_f  = " << Rf << "   [(D_i/D_c)^+0.50 as eq. 15 "
               "states it; the paper's eq. 18 repeats it with -0.50]\n";
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
                  << "  [anchor] " << (model == "nageswararao" ? std::string("nageswararao")
                                                               : curve->type())
                  << ": " << std::setprecision(5) << an.choupo << " vs " << an.published
                  << "  (dev " << std::setprecision(3) << 100.0 * an.dev << " %, "
                  << an.kind << ")  " << an.where << "\n";
        if (verbosity >= 2) printClassTable(f, c, a, sp, "underflow", "overflow");
        std::cout << "==================================================================\n\n";
    }
    return 0;
}

} // namespace Choupo
