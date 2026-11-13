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

#include "unitOperations/solids/CakeFilter.H"
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

namespace {

//  The solute fraction remaining in the cake after a wash ratio N.
struct WashLaw
{
    std::string model;
    std::vector<scalar> N, R;     // tabulated test

    scalar remaining(scalar n, const std::string& me) const
    {
        if (model == "displacement") return std::max(0.0, 1.0 - n);
        //  tabulated: linear in (N, ln R), Perry's coordinates (eq. 18-71).
        if (n < N.front() || n > N.back())
        {
            std::ostringstream m;
            m << me << ": the wash ratio N = " << n << " lies outside the "
                 "tabulated wash test (" << N.front() << " to " << N.back()
              << ").  A wash curve is not extrapolated: extend the test or "
                 "change the wash flow.";
            throw std::runtime_error(m.str());
        }
        for (std::size_t j = 0; j + 1 < N.size(); ++j)
            if (n <= N[j + 1])
            {
                const scalar t = (n - N[j]) / (N[j + 1] - N[j]);
                return std::exp((1.0 - t) * std::log(R[j]) + t * std::log(R[j + 1]));
            }
        return R.back();
    }
};

WashLaw readWashLaw(const DictPtr& oper, const std::string& me)
{
    if (!oper->found("washing"))
        throw std::runtime_error(me + ": a wash inlet is connected and "
            "`operation { washing { model displacement | tabulated; } }` is "
            "missing -- the solute left in the cake after the wash is the "
            "washing law's answer, and none is assumed.");
    auto w = oper->subDict("washing");
    if (!w->found("model"))
        throw std::runtime_error(me + ": `washing { model ...; }` is missing "
            "(`displacement` or `tabulated`).");
    WashLaw L;
    L.model = w->lookupWord("model");
    if (L.model == "displacement") return L;
    if (L.model != "tabulated")
        throw std::runtime_error(me + ": washing model '" + L.model + "' is not "
            "known -- `displacement` (ideal, R = 1 - N) or `tabulated` (the "
            "case's wash test, `washRatio ( ... ); remaining ( ... );`).");
    if (!w->found("washRatio") || !w->found("remaining"))
        throw std::runtime_error(me + ": `washing { model tabulated; }` needs "
            "`washRatio ( ... )` and `remaining ( ... )`, the wash test's N and "
            "the fraction of solute left in the cake.");
    L.N = w->lookupList("washRatio");
    L.R = w->lookupList("remaining");
    if (L.N.size() != L.R.size() || L.N.size() < 2)
        throw std::runtime_error(me + ": `washRatio` and `remaining` must have "
            "the same length, at least 2.");
    for (std::size_t j = 0; j < L.N.size(); ++j)
    {
        if (!(L.R[j] > 0.0 && L.R[j] <= 1.0))
            throw std::runtime_error(me + ": every `remaining` value must lie in "
                "(0, 1] (it is interpolated in ln R).");
        if (j > 0 && !(L.N[j] > L.N[j - 1]))
            throw std::runtime_error(me + ": `washRatio` must increase strictly.");
        if (j > 0 && L.R[j] > L.R[j - 1])
            throw std::runtime_error(me + ": `remaining` must not increase with "
                "the wash ratio -- more wash cannot leave more solute.");
    }
    return L;
}

} // namespace

int CakeFilter::solve(const DictPtr& dict, const ThermoPackage& thermo, int verbosity)
{
    const std::string me = "cakeFilter";
    const std::size_t n = thermo.n();
    const auto inlets = readInputStreams(dict, thermo, me);
    if (inlets.size() > 2)
        throw std::runtime_error(me + ": at most two inlets, `inputs ( slurry "
            "wash )`.");
    const SlurryState& f = inlets.front();
    const bool hasWash = inlets.size() == 2;
    if (!(f.mSolids > 0.0))
        throw std::runtime_error(me + ": the feed '" + f.name + "' carries no "
            "solids -- a cake filter builds a cake from them.");
    if (!(f.mLiquid > 0.0))
        throw std::runtime_error(me + ": the feed '" + f.name + "' carries no "
            "liquid -- a cake filter separates a slurry.");
    if (!dict->found("model"))
        throw std::runtime_error(me + ": no `model` -- `rotaryDrum` (continuous) "
            "or `batchPress` (a cyclic press or leaf filter, cycle-averaged).");
    const std::string model = dict->lookupWord("model");
    if (model != "rotaryDrum" && model != "batchPress")
        throw std::runtime_error(me + ": `model` is `rotaryDrum` or `batchPress`; "
            "got '" + model + "'.");
    auto oper = dict->subDict("operation");
    auto need = [&](const std::string& k)
    {
        if (!oper->found(k))
            throw std::runtime_error(me + " (" + model + "): `operation { " + k
                + " ...; }` is missing.");
    };

    //  ---- properties of the slurry, from the package --------------------
    const scalar rhoS = solidDensity(f.solid, thermo, me);
    const scalar rhoL = liquidDensity(f.liquid, f.T, f.P, thermo);
    const scalar mu   = liquidViscosity(f.liquid, f.T, thermo, me);

    //  ---- the cake: resistance, moisture --------------------------------
    need("pressureDrop");
    const scalar dp = oper->lookupScalar("pressureDrop", Dims::pressure);
    if (!(dp > 0.0))
        throw std::runtime_error(me + ": `pressureDrop` must be positive.");
    const bool hasA  = oper->found("specificCakeResistance");
    const bool hasA0 = oper->found("alpha0");
    const bool hasS  = oper->found("compressibility");
    scalar alpha = 0.0, alpha0 = 0.0, sComp = 0.0;
    if (hasA && (hasA0 || hasS))
        throw std::runtime_error(me + ": `specificCakeResistance` is declared "
            "beside `alpha0`/`compressibility` -- one cake law, not two.  An "
            "incompressible cake declares alpha; a compressible one declares "
            "alpha0 and s (alpha = alpha0 dp^s, Geankoplis eq. 24.2-11).");
    if (hasA)
    {
        alpha = oper->lookupScalar("specificCakeResistance", Dimensions(-1, 1, 0, 0, 0));
    }
    else if (hasA0 || hasS)
    {
        if (!(hasA0 && hasS))
            throw std::runtime_error(me + ": a compressible cake needs BOTH "
                "`alpha0` and `compressibility` (alpha = alpha0 dp^s, Geankoplis "
                "eq. 24.2-11); only " + std::string(hasA0 ? "alpha0" : "compressibility")
                + " is declared.");
        //  alpha0 carries the dimensions m/kg/Pa^s, not expressible with
        //  integer exponents: it is read in SI, with dp in Pa and alpha in m/kg.
        alpha0 = oper->lookupScalar("alpha0");
        sComp  = oper->lookupScalar("compressibility", Dims::dimensionless);
        //  The range of s.  s < 0 says the cake gets MORE permeable as it is
        //  squeezed harder: no reading in this law, so it is refused.  s = 0
        //  is the incompressible cake and 0 < s <= 1 the usual range, both
        //  silent.  s > 1 is a legal law with a consequence a student should
        //  see: K_p = mu alpha c_s / (A^2 dp) = mu alpha0 c_s dp^(s-1) / A^2
        //  (eq. 24.2-14) GROWS with dp, so where the cake term dominates the
        //  medium's a higher pressure drop gives LESS filtrate -- announced.
        if (sComp < 0.0)
        {
            std::ostringstream m;
            m << me << ": `compressibility` s = " << sComp << " is negative -- the "
                 "cake resistance alpha = alpha0 dp^s would FALL as the pressure "
                 "drop rises, a cake that opens as it is squeezed, which this law "
                 "has no reading for (Geankoplis eq. 24.2-11).  Declare s >= 0 "
                 "from the slope of log(alpha) against log(dp) measured on this "
                 "slurry, or `specificCakeResistance` for an incompressible cake.";
            throw std::runtime_error(m.str());
        }
        if (sComp > 1.0)
        {
            std::ostringstream m;
            m << std::defaultfloat << std::setprecision(5)
              << "`compressibility` s = " << sComp << " is above 1: the cake "
                 "constant K_p = mu alpha0 c_s dp^(s-1) / A^2 (Geankoplis eqs. "
                 "24.2-11, 24.2-14) grows with the pressure drop as dp^"
              << sComp - 1.0 << ", so where the cake resistance dominates the "
                 "medium's a HIGHER pressure drop gives LESS filtrate.  The "
                 "filter is computed as declared at dp = " << dp << " Pa; the "
                 "engine does not judge whether this s describes the slurry.";
            const std::string unitName = dict->name().empty()
                ? dict->lookupWordOrDefault("name", "(unnamed)") : dict->name();
            if (AdvisoryLog::instance().add("model", "warning", me + " " + unitName,
                                            m.str())
                && verbosity >= 1)
                std::cout << "  [" << me << "] " << unitName << ": " << m.str() << "\n";
        }
        alpha  = alpha0 * std::pow(dp, sComp);
    }
    else
        throw std::runtime_error(me + ": the cake's specific resistance is "
            "missing -- declare `specificCakeResistance` [m/kg] or, for a "
            "compressible cake, `alpha0` and `compressibility`.  It is a "
            "property of THIS slurry measured in a filtration test (Geankoplis "
            "Example 24.2-1); no default exists.");
    if (!(alpha > 0.0))
        throw std::runtime_error(me + ": the specific cake resistance must be positive.");
    need("mediumResistance");
    const scalar Rm = oper->lookupScalar("mediumResistance", Dimensions(0, -1, 0, 0, 0));
    if (Rm < 0.0)
        throw std::runtime_error(me + ": `mediumResistance` cannot be negative.");
    need("wetToDryCakeRatio");
    const scalar mWet = oper->lookupScalar("wetToDryCakeRatio", Dims::dimensionless);
    if (!(mWet >= 1.0))
        throw std::runtime_error(me + ": `wetToDryCakeRatio` (kg wet cake / kg "
            "dry cake) is at least 1.");

    //  ---- the balance: retained liquor, filtrate, c_S --------------------
    const scalar Lr = (mWet - 1.0) * f.mSolids;                 // kg/s liquor in the cake
    if (!(Lr < f.mLiquid))
        throw std::runtime_error(me + ": a cake at m = " + std::to_string(mWet)
            + " would hold " + std::to_string(Lr) + " kg/s of liquid and the "
            "slurry brings only " + std::to_string(f.mLiquid) + " -- no filtrate "
            "would leave.  Check `wetToDryCakeRatio` against the feed's solids.");
    const scalar phi = Lr / f.mLiquid;                          // liquor fraction to cake
    sVector cakeLiq(n, 0.0), filtLiq(n, 0.0);
    for (std::size_t i = 0; i < n; ++i)
    {
        cakeLiq[i] = phi * f.liquid[i];
        filtLiq[i] = f.liquid[i] - cakeLiq[i];                  // the DIFFERENCE
    }
    const scalar mFilt = f.mLiquid - Lr;
    const scalar Qf    = mFilt / rhoL;                           // m3/s of filtrate
    const scalar cS    = f.mSolids / Qf;                         // kg solids / m3 filtrate
    const scalar cx    = f.mSolids / (f.mSolids + f.mLiquid);
    const scalar cS2410 = rhoL * cx / (1.0 - mWet * cx);         // Geankoplis eq. 24.2-10
    //  Saturated cake: the liquor fills the voids.
    const scalar vLiq  = (mWet - 1.0) / rhoL, vSol = 1.0 / rhoS;
    const scalar eps   = vLiq / (vLiq + vSol);

    //  ---- the filter -----------------------------------------------------
    scalar A = 0.0, tc = 0.0, tForm = 0.0, Vcyc = 0.0, tClean = 0.0;
    scalar fSub = 0.0, tWash = 0.0, presses = 0.0, washFactor = 1.0;
    std::string washPath;
    scalar QwVol = 0.0, rhoW = 0.0;
    if (hasWash)
    {
        const SlurryState& w = inlets[1];
        if (w.mSolids > 0.0)
            throw std::runtime_error(me + ": the wash inlet '" + w.name + "' "
                "carries solids -- a wash liquor is a clear liquid.");
        if (!(w.mLiquid > 0.0))
            throw std::runtime_error(me + ": the wash inlet '" + w.name + "' "
                "carries no liquid.");
        if (std::abs(w.T - f.T) > 0.01)
            throw std::runtime_error(me + ": the wash arrives at "
                + std::to_string(w.T) + " K and the slurry at " + std::to_string(f.T)
                + " K.  An enthalpy balance across the cake is not built in this "
                "slice, so the wash must come at the slurry's temperature (put a "
                "`heater` before it).");
        rhoW  = liquidDensity(w.liquid, w.T, w.P, thermo);
        QwVol = w.mLiquid / rhoW;
    }

    std::ostringstream rep;
    rep << std::setprecision(5);
    if (model == "rotaryDrum")
    {
        need("submergence");
        fSub = oper->lookupScalar("submergence", Dims::dimensionless);
        if (!(fSub > 0.0 && fSub < 1.0))
            throw std::runtime_error(me + ": `submergence` f (the fraction of the "
                "drum in the slurry, Geankoplis eq. 24.2-23) lies in (0, 1).");
        const bool hasTc = oper->found("cycleTime"), hasArea = oper->found("area");
        if (hasTc == hasArea)
            throw std::runtime_error(me + " (rotaryDrum): declare EXACTLY ONE of "
                "`cycleTime` (the area is the result) and `area` (the cycle time is "
                "the result) -- Geankoplis eq. 24.2-26 links them through the feed.");
        if (hasTc)
        {
            tc = oper->lookupScalar("cycleTime", Dims::time);
            if (!(tc > 0.0))
                throw std::runtime_error(me + ": `cycleTime` must be positive.");
            //  Geankoplis eq. 24.2-26, p. 1089: the filtrate per unit area
            //  and time, V/(A t_c).
            const scalar u = (-Rm / tc + std::sqrt(Rm * Rm / (tc * tc)
                              + 2.0 * cS * alpha * dp * fSub / (mu * tc))) / (alpha * cS);
            A = Qf / u;
        }
        else
        {
            A = oper->lookupScalar("area", Dims::area);
            if (!(A > 0.0))
                throw std::runtime_error(me + ": `area` must be positive.");
            //  eq. 24.2-25 divided by t_c, with V = Q_f t_c, solved for t_c.
            const scalar med = mu * Rm * Qf / (dp * A);
            if (!(fSub > med))
                throw std::runtime_error(me + ": the medium alone (mu R_m Q_f / (dp "
                    "A) = " + std::to_string(med) + ") needs more than the "
                    "submerged fraction f = " + std::to_string(fSub) + " of every "
                    "revolution -- this drum cannot pass the feed at any speed.  "
                    "Enlarge the area or the pressure drop.");
            tc = (fSub - med) * 2.0 * dp * A * A / (mu * alpha * cS * Qf * Qf);
        }
        tForm = fSub * tc;                                       // eq. 24.2-23
        Vcyc  = Qf * tc;
        rep << "  Drum:         f = " << fSub << ", t_c = " << tc << " s ("
            << (hasTc ? "declared" : "result") << "), A = " << A << " m2 ("
            << (hasTc ? "result, eq. 24.2-26" : "declared") << ")\n";
    }
    else
    {
        need("area"); need("filtratePerCycle"); need("cleaningTime");
        A      = oper->lookupScalar("area", Dims::area);
        Vcyc   = oper->lookupScalar("filtratePerCycle", Dims::volume);
        tClean = oper->lookupScalar("cleaningTime", Dims::time);
        if (!(A > 0.0) || !(Vcyc > 0.0) || tClean < 0.0)
            throw std::runtime_error(me + " (batchPress): `area` and "
                "`filtratePerCycle` must be positive, `cleaningTime` not negative.");
    }

    const scalar Kp = mu * alpha * cS / (A * A * dp);           // eq. 24.2-14
    const scalar B  = mu * Rm / (A * dp);                        // eq. 24.2-15
    const scalar tFilt = 0.5 * Kp * Vcyc * Vcyc + B * Vcyc;      // eq. 24.2-17
    const scalar tFiltClosure = (model == "rotaryDrum")
        ? std::abs(tFilt - tForm) / tForm : 0.0;
    if (model == "batchPress") tForm = tFilt;

    //  ---- washing --------------------------------------------------------
    scalar Nw = 0.0, Rrem = 1.0, beta = 0.0, Vr = 0.0;
    sVector cakeOut = cakeLiq, spent(n, 0.0);
    WashLaw law;
    if (!hasWash && oper->found("washing"))
        throw std::runtime_error(me + ": `washing {}` is declared and no wash "
            "inlet is connected -- add it to `inputs ( slurry wash )`.");
    if (hasWash)
    {
        law = readWashLaw(oper, me);
        if (!(Lr > 0.0))
            throw std::runtime_error(me + ": a dry cake (m = 1) holds no liquor "
                "to wash.");
        if (model == "batchPress")
        {
            need("washFlowPath");
            washPath = oper->lookupWord("washFlowPath");
            if (washPath == "sameAsFiltrate")      washFactor = 1.0;   // eq. 24.2-19
            else if (washPath == "throughWashing") washFactor = 0.25;  // eq. 24.2-20
            else
                throw std::runtime_error(me + ": `washFlowPath` is `sameAsFiltrate` "
                    "(leaf filter, Geankoplis eq. 24.2-19) or `throughWashing` "
                    "(plate-and-frame, twice the cake and half the area, eq. "
                    "24.2-20); got '" + washPath + "'.");
        }
        //  Wash per cycle: the cycle-averaged wash flow over one cycle.  For
        //  a press, the wash per cycle stands to V_f as the wash flow to the
        //  filtrate flow; for a drum, it is what one revolution receives.
        const scalar rateW = washFactor / (Kp * Vcyc + B);      // m3/s, eq. 24.2-19/-20
        const scalar VwCyc = QwVol * Vcyc / Qf;
        tWash = VwCyc / rateW;
        if (model == "rotaryDrum" && fSub + tWash / tc > 1.0)
        {
            std::ostringstream m;
            m << me << ": washing at the final filtration rate (Geankoplis eq. "
                 "24.2-19) takes " << tWash << " s per revolution, "
              << 100.0 * tWash / tc << " % of the cycle, and only "
              << 100.0 * (1.0 - fSub) << " % is out of the slurry.  Reduce the "
                 "wash flow, lengthen the cycle or lower the submergence.";
            throw std::runtime_error(m.str());
        }
        //  Wash ratio N: wash volume / volume of liquor in the cake (Perry
        //  p. 18-76), on the cycle-averaged flows.
        Vr   = Lr / rhoL;                                        // m3/s of liquor in cake
        Nw   = QwVol / Vr;
        Rrem = law.remaining(Nw, me);
        beta = (1.0 - Rrem) * Vr / QwVol;                       // fraction of wash kept
        if (beta > 1.0 + 1e-12)
            throw std::runtime_error(me + ": the wash replaces (1 - R) of the cake "
                "liquor by volume and brings less than that -- the declared law "
                "and wash flow are inconsistent.");
        beta = std::min(beta, 1.0);
        const SlurryState& w = inlets[1];
        for (std::size_t i = 0; i < n; ++i)
        {
            cakeOut[i] = Rrem * cakeLiq[i] + beta * w.liquid[i];
            //  the DIFFERENCE: exact per component
            spent[i]   = (cakeLiq[i] + w.liquid[i]) - cakeOut[i];
        }
    }
    if (model == "batchPress")
    {
        tc      = tFilt + tWash + tClean;
        presses = Qf * tc / Vcyc;
    }

    //  ---- products -------------------------------------------------------
    sVector none(n, 0.0);
    produced_.clear();
    produced_.push_back(makeSlurryStream("cake", f.T, f.P, cakeOut, f.solid, f.psd));
    produced_.push_back(makeSlurryStream("filtrate", f.T, f.P, filtLiq, none, f.psd));
    if (hasWash)
        produced_.push_back(makeSlurryStream("spentWash", f.T, f.P, spent, none, f.psd));

    std::vector<const sVector*> in = { &f.liquid, &f.solid };
    if (hasWash) { in.push_back(&inlets[1].liquid); in.push_back(&inlets[1].solid); }
    std::vector<const sVector*> out = { &cakeOut, &f.solid, &filtLiq };
    if (hasWash) out.push_back(&spent);
    const scalar closure = componentClosure(in, out);

    //  ---- KPIs -----------------------------------------------------------
    const scalar Wcyc   = cS * Vcyc / A;                         // kg dry solids / m2 per cycle
    const scalar Lcake  = Wcyc / ((1.0 - eps) * rhoS);           // m
    kpis_.clear();
    kpis_["solidsMassFlow_kg_s"]   = f.mSolids;
    kpis_["liquidMassFlow_kg_s"]   = f.mLiquid;
    kpis_["solidsMassFraction"]    = cx;
    kpis_["rho_liquid"]            = rhoL;
    kpis_["rho_solid"]             = rhoS;
    kpis_["mu_liquid_Pa_s"]        = mu;
    kpis_["pressureDrop_Pa"]       = dp;
    kpis_["alpha_m_kg"]            = alpha;
    kpis_["mediumResistance_1_m"]  = Rm;
    kpis_["cS_kg_m3"]              = cS;
    kpis_["cS_eq24_2_10_kg_m3"]    = cS2410;
    kpis_["filtrate_m3_s"]         = Qf;
    kpis_["cakeLiquor_kg_s"]       = Lr;
    kpis_["cakePorosity"]          = eps;
    kpis_["area_m2"]               = A;
    kpis_["Kp_s_m6"]               = Kp;
    kpis_["B_s_m3"]                = B;
    kpis_["filtratePerCycle_m3"]   = Vcyc;
    kpis_["filtrationTime_s"]      = tForm;
    kpis_["cycleTime_s"]           = tc;
    kpis_["filtrationFlux_m_s"]    = Qf / A;
    kpis_["cakeSolidsPerArea_kg_m2"] = Wcyc;
    kpis_["cakeThickness_mm"]      = 1e3 * Lcake;
    kpis_["componentMassClosure"]  = closure;
    if (model == "rotaryDrum")
    {
        kpis_["submergence"]       = fSub;
        kpis_["formationTimeClosure"] = tFiltClosure;
    }
    else
    {
        kpis_["cleaningTime_s"]    = tClean;
        kpis_["pressesRequired"]   = presses;
    }
    if (hasWash)
    {
        kpis_["wash_m3_s"]         = QwVol;
        kpis_["washRatio"]         = Nw;
        kpis_["soluteRemaining"]   = Rrem;
        kpis_["washTime_s"]        = tWash;
        kpis_["washFractionOfCycle"] = tWash / tc;
    }

    //  The t/V vs V line of the cycle (Geankoplis eq. 24.2-18, Fig. 24.2-2),
    //  for the GUI to draw: slope K_p/2, intercept B.
    UnitProfile prof;
    prof.xAxis = "V_m3";
    std::vector<scalar> vv, tt, tv;
    for (int k = 0; k <= 20; ++k)
    {
        const scalar V = Vcyc * k / 20.0;
        const scalar t = 0.5 * Kp * V * V + B * V;
        vv.push_back(V);
        tt.push_back(t);
        tv.push_back(V > 0.0 ? t / V : B);
    }
    prof.columns["V_m3"]       = vv;
    prof.columns["t_s"]        = tt;
    prof.columns["t_over_V_s_m3"] = tv;
    profile_ = prof;

    if (verbosity >= 1)
    {
        std::cout << "\n=====================  Cake Filter Result  =======================\n"
                  << std::defaultfloat << std::setprecision(5)
                  << "  Model:        " << model << "\n"
                  << "  Slurry:       " << f.mSolids << " kg/s solids in " << f.mLiquid
                  << " kg/s liquid (c_x = " << cx << ");  rho_l " << rhoL
                  << ", rho_s " << rhoS << " kg/m3, mu " << mu << " Pa s (package)\n"
                  << "  Cake law:     alpha = " << alpha << " m/kg";
        if (hasA0) std::cout << " = " << alpha0 << " x dp^" << sComp << " (eq. 24.2-11)";
        std::cout << ";  R_m = " << Rm << " 1/m;  dp = " << dp << " Pa\n"
                  << "  Cake:         m = " << mWet << " kg wet / kg dry, porosity "
                  << eps << " (saturated);  retains " << Lr << " kg/s of liquor\n"
                  << "  c_S:          " << cS << " kg/m3 filtrate  (eq. 24.2-10: "
                  << cS2410 << ")\n"
                  << "  Filtrate:     " << Qf << " m3/s\n"
                  << rep.str()
                  << "  K_p, B:       " << Kp << " s/m6, " << B << " s/m3  (eqs. 24.2-14, -15)\n"
                  << "  Per cycle:    V = " << Vcyc << " m3, filtration t = " << tForm
                  << " s (eq. 24.2-17), cake " << Wcyc << " kg/m2, "
                  << 1e3 * Lcake << " mm\n";
        if (model == "batchPress")
            std::cout << "  Cycle:        t_c = t_f + t_w + t_clean = " << tFilt << " + "
                      << tWash << " + " << tClean << " = " << tc << " s;  presses "
                         "needed for the average feed: " << presses << "\n";
        if (hasWash)
            std::cout << "  Washing:      " << QwVol << " m3/s, wash ratio N = " << Nw
                      << ", solute remaining R = " << Rrem << " (" << law.model
                      << "), wash time " << tWash << " s per cycle"
                      << (washPath.empty() ? "" : " (" + washPath + ")") << "\n";
        std::cout << std::scientific << std::setprecision(3)
                  << "  Closure:      max_i |out - in| / in (every component) = "
                  << closure << "\n" << std::defaultfloat
                  << "==================================================================\n\n";
    }
    return 0;
}

} // namespace Choupo
