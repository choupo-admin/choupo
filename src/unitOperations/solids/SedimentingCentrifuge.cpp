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

#include "unitOperations/solids/SedimentingCentrifuge.H"
#include "unitOperations/solids/ClassifierCore.H"
#include "unitOperations/solids/SolidLiquidCore.H"
#include "core/Advisory.H"
#include "core/Dimensions.H"
#include "thermo/ThermoPackage.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

int SedimentingCentrifuge::solve(const DictPtr& dict, const ThermoPackage& thermo,
                                 int verbosity)
{
    const std::string me = "sedimentingCentrifuge";
    const scalar pi = 3.14159265358979323846;
    const scalar g  = 9.80665;                       // Geankoplis p. 1412
    const ClassifierFeed f = readClassifierFeed(dict, thermo, me);
    if (!(f.mFluid > 0.0))
        throw std::runtime_error(me + ": the feed is DRY -- a sedimenting "
            "centrifuge clarifies a liquid.");
    if (!dict->found("model"))
        throw std::runtime_error(me + ": no `model` -- `tubularBowl` or "
            "`discStack` (the bowl's Sigma, Ambler 1959).");
    const std::string model = dict->lookupWord("model");
    if (model != "tubularBowl" && model != "discStack")
        throw std::runtime_error(me + ": `model` is `tubularBowl` or `discStack`; "
            "got '" + model + "'.");
    auto oper = dict->subDict("operation");
    auto need = [&](const std::string& k)
    {
        if (!oper->found(k))
            throw std::runtime_error(me + " (" + model + "): `operation { " + k
                + " ...; }` is missing.");
    };

    //  ---- properties --------------------------------------------------------
    const scalar rhoS = solidDensity(f.s, thermo, me);
    const scalar rhoL = liquidDensity(f.fluid, f.T, f.P, thermo);
    const scalar mu   = liquidViscosity(f.fluid, f.T, thermo, me);
    const scalar drho = rhoS - rhoL;
    if (!(drho > 0.0))
    {
        std::ostringstream m;
        m << me << ": the solid (rho_s = " << rhoS << " kg/m3) is not denser than "
             "the liquid (rho_l = " << rhoL << " kg/m3) -- it would move to the "
             "axis, not to the wall.  A sedimenting centrifuge collects what is "
             "denser than its liquid.";
        throw std::runtime_error(m.str());
    }
    const scalar Q = f.mFluid / rhoL + f.mSolids / rhoS;          // m3/s of slurry

    //  ---- geometry and Sigma ---------------------------------------------
    need("speed");
    const scalar omega = 2.0 * pi * oper->lookupScalar("speed", Dims::inverseTime);
    if (!(omega > 0.0))
        throw std::runtime_error(me + ": `speed` must be positive.");
    scalar r1 = 0.0, r2 = 0.0, b = 0.0, V = 0.0, Sigma = 0.0, SigmaG = 0.0;
    scalar nDisc = 0.0, theta = 0.0;
    if (model == "tubularBowl")
    {
        need("bowlRadius"); need("liquidRadius"); need("bowlLength");
        r2 = oper->lookupScalar("bowlRadius",   Dims::length);
        r1 = oper->lookupScalar("liquidRadius", Dims::length);
        b  = oper->lookupScalar("bowlLength",   Dims::length);
        if (!(r1 > 0.0 && r2 > r1 && b > 0.0))
            throw std::runtime_error(me + ": the bowl needs 0 < liquidRadius < "
                "bowlRadius and a positive bowlLength.");
        V      = pi * b * (r2 * r2 - r1 * r1);                     // Geankoplis p. 1436
        Sigma  = omega * omega * V / (g * std::log(2.0 * r2 * r2 / (r1 * r1 + r2 * r2)));
        SigmaG = omega * omega * V / (2.0 * g * std::log(2.0 * r2 / (r1 + r2)));
    }
    else
    {
        need("discSpaces"); need("outerRadius"); need("innerRadius"); need("discHalfAngle");
        nDisc = oper->lookupScalar("discSpaces", Dims::dimensionless);
        r2    = oper->lookupScalar("outerRadius", Dims::length);
        r1    = oper->lookupScalar("innerRadius", Dims::length);
        theta = oper->lookupScalar("discHalfAngle", Dims::dimensionless);   // rad (`deg` converts)
        if (!(nDisc >= 1.0 && r1 > 0.0 && r2 > r1))
            throw std::runtime_error(me + ": the disc stack needs at least one "
                "space and 0 < innerRadius < outerRadius.");
        if (!(theta > 0.0 && theta < 0.5 * pi))
            throw std::runtime_error(me + ": `discHalfAngle` lies in (0, 90) deg.");
        Sigma = 2.0 * pi * nDisc * omega * omega * (r2 * r2 * r2 - r1 * r1 * r1)
              / (3.0 * g * std::tan(theta));                       // de Haan eq. 9.52
    }

    //  ---- the cut size and Stokes' window -----------------------------------
    //  Q = 2 v_g(d50) Sigma,  v_g = d^2 drho g / (18 mu).
    const scalar d50 = std::sqrt(9.0 * mu * Q / (drho * g * Sigma));
    const scalar vWall = d50 * d50 * drho * omega * omega * r2 / (18.0 * mu);   // eq. 30.2-13
    const scalar Re = d50 * vWall * rhoL / mu;
    if (!(Re < 1.0))
    {
        std::ostringstream m;
        m << me << ": at the cut size d50 = " << d50 * 1e6 << " um the particle "
             "Reynolds number at the bowl wall is " << Re << " -- outside Stokes' "
             "law (N_Re < 1, Geankoplis section 30.1B, p. 1413), on which Sigma "
             "theory rests (Ambler 1959 p. 186).  Raise the speed or lower the "
             "throughput (Re grows as Q^1.5 / omega); a turbulent-settling Sigma (Ambler eqs. 34-39) is not "
             "built.";
        throw std::runtime_error(m.str());
    }
    scalar dpcG = 0.0, effAtDpcG = 0.0;
    if (model == "tubularBowl")
    {
        dpcG = std::sqrt(9.0 * mu * Q / (drho * g * SigmaG));     // Geankoplis eq. 30.2-12
        const scalar rm = 0.5 * (r1 + r2);
        effAtDpcG = (r2 * r2 - rm * rm) / (r2 * r2 - r1 * r1);
    }

    //  ---- the grade efficiency per class -----------------------------------
    const scalar tau = (model == "tubularBowl") ? V / Q : 0.0;
    auto grade = [&](scalar d)
    {
        if (model == "tubularBowl")
        {
            const scalar k = d * d * drho * omega * omega * tau / (18.0 * mu);
            const scalar rs = std::max(r1, r2 * std::exp(-k));
            return (r2 * r2 - rs * rs) / (r2 * r2 - r1 * r1);
        }
        return std::min(1.0, 0.5 * (d / d50) * (d / d50));
    };
    std::vector<scalar> a(f.w.size());
    for (std::size_t k = 0; k < a.size(); ++k) a[k] = grade(f.xRep[k]);
    const scalar effD50 = grade(d50);

    //  ---- the split ----------------------------------------------------------
    need("sedimentSolids");
    const scalar ws = oper->lookupScalar("sedimentSolids", Dims::dimensionless);
    if (!(ws > 0.0 && ws <= 1.0))
        throw std::runtime_error(me + ": `sedimentSolids` (mass fraction of solids "
            "in the discharged sediment) lies in (0, 1].");
    scalar Y = 0.0;
    for (std::size_t k = 0; k < a.size(); ++k) Y += a[k] * f.w[k];
    const scalar Lsed = Y * f.mSolids * (1.0 - ws) / ws;
    if (!(Lsed <= f.mFluid))
        throw std::runtime_error(me + ": a sediment at " + std::to_string(ws)
            + " solids would carry more liquid than the feed brings.");
    const scalar Rfl = Lsed / f.mFluid;
    const ClassifierSplit sp = splitOnPartition(f, a, Rfl, thermo, "sediment", "centrate");
    produced_ = { sp.coarse, sp.fine };

    kpis_.clear();
    UnitProfile prof;
    publishClassification(kpis_, prof, f, a, a, 0.0, Rfl, sp, "sediment", "centrate");
    kpis_["rho_solid"]          = rhoS;
    kpis_["rho_liquid"]         = rhoL;
    kpis_["mu_liquid_Pa_s"]     = mu;
    kpis_["feed_m3_s"]          = Q;
    kpis_["omega_rad_s"]        = omega;
    kpis_["gForce_wall"]        = omega * omega * r2 / g;
    kpis_["sigma_m2"]           = Sigma;
    kpis_["cutSize_d50_um"]     = d50 * 1e6;
    kpis_["Re_cut"]             = Re;
    kpis_["vWall_cut_m_s"]      = vWall;
    kpis_["gradeEfficiency_at_d50"] = effD50;
    kpis_["sedimentSolids"]     = ws;
    if (model == "tubularBowl")
    {
        kpis_["bowlVolume_m3"]      = V;
        kpis_["residenceTime_s"]    = tau;
        kpis_["sigmaHalfLayer_m2"]  = SigmaG;
        kpis_["cutSizeHalfLayer_Dpc_um"] = dpcG * 1e6;
        kpis_["gradeEfficiency_at_Dpc"]  = grade(dpcG);
        kpis_["volumeFractionOutsideMidRadius"] = effAtDpcG;
    }
    profile_ = prof;

    //  ---- the settling regime: DILUTE, announced with its number -----------
    //  Sigma theory (Ambler 1959) settles every particle as if it were alone:
    //  Stokes' velocity, no crowding.  Hindered settling (Geankoplis eq.
    //  30.1-16) is NOT applied, so the feed's solids VOLUME fraction is
    //  printed, published and announced.  No threshold is set: whether this
    //  feed is dilute enough is the reader's judgement, not the engine's.
    const scalar phiS = (f.mSolids / rhoS) / Q;
    kpis_["solidsVolumeFraction_feed"] = phiS;
    {
        std::ostringstream m;
        m << std::defaultfloat << std::setprecision(4)
          << "unhindered (dilute) Stokes settling is assumed at a feed solids "
             "volume fraction of " << phiS << ": each particle settles as if it "
             "were alone; hindered settling (Geankoplis eq. 30.1-16) is not "
             "modelled.  Where crowding slows the settling, the printed cut size "
             "is too small.  Whether this feed is dilute enough is not judged "
             "here.";
        const std::string unitName = dict->name().empty()
            ? dict->lookupWordOrDefault("name", "(unnamed)") : dict->name();
        if (AdvisoryLog::instance().add("model", "info", me + " " + unitName, m.str())
            && verbosity >= 1)
            std::cout << "  [" << me << "] " << unitName << ": " << m.str() << "\n";
    }

    if (verbosity >= 1)
    {
        std::cout << "\n=================  Sedimenting Centrifuge Result  ================\n"
                  << std::defaultfloat << std::setprecision(5)
                  << "  Model:        " << model << "\n"
                  << "  Slurry:       " << Q << " m3/s (" << Q * 3600.0 << " m3/h);  "
                  << f.mSolids << " kg/s solids;  rho_s " << rhoS << ", rho_l " << rhoL
                  << " kg/m3, mu " << mu << " Pa s (package)\n"
                  << "  Solids:       volume fraction of the feed slurry phi_s = "
                  << phiS << " (dilute settling assumed, not judged)\n"
                  << "  Speed:        omega = " << omega << " rad/s;  " << omega * omega * r2 / g
                  << " g at the wall\n";
        if (model == "tubularBowl")
            std::cout << "  Bowl:         r_1 = " << r1 << " m, r_2 = " << r2 << " m, b = "
                      << b << " m, V = " << V << " m3, residence " << tau << " s\n"
                      << "  Sigma:        " << Sigma << " m2 (equal-volume cut, Ambler "
                         "eq. 28);  half-layer cut (Geankoplis eq. 30.2-19) " << SigmaG << " m2\n"
                      << "  Cut sizes:    d50 = " << d50 * 1e6 << " um (E = " << effD50
                      << ");  Geankoplis D_pc = " << dpcG * 1e6 << " um (eq. 30.2-12; E = "
                      << grade(dpcG) << " on the same curve)\n";
        else
            std::cout << "  Discs:        " << nDisc << " spaces, r_1 = " << r1 << " m, r_2 = "
                      << r2 << " m, half angle " << theta * 180.0 / pi << " deg\n"
                      << "  Sigma:        " << Sigma << " m2 (de Haan et al. eq. 9.52)\n"
                      << "  Cut size:     d50 = " << d50 * 1e6 << " um\n";
        std::cout << "  Stokes:       Re at the cut size, at the wall = " << Re
                  << " (< 1 required)\n"
                  << "  Split:        " << 100.0 * Y << " % of the solids to the sediment at "
                  << ws << " solids; " << 100.0 * Rfl << " % of the liquid with it\n"
                  << std::scientific << std::setprecision(3)
                  << "  Closure:      max_k |sediment + centrate - feed| / m_s = "
                  << sp.sizeClosure << ";  liquid " << sp.fluidClosure << "\n"
                  << std::defaultfloat;
        if (verbosity >= 2) printClassTable(f, a, a, sp, "sediment", "centrate");
        std::cout << "==================================================================\n\n";
    }
    return 0;
}

} // namespace Choupo
