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
    This file is part of Choupo (GPL-3.0-or-later); see LICENSE.
\*---------------------------------------------------------------------------*/

#include "AgitatedVessel.H"

#include "Impeller.H"
#include "core/Advisory.H"
#include "core/Constants.H"
#include "core/PropertySourceLog.H"
#include "solver/NewtonRaphson.H"
#include "thermo/LiquidPropertyDoor.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

int AgitatedVessel::solve(const DictPtr& dict, const ThermoPackage& thermo, int verbosity)
{
    const std::string unitName = dict->name().empty() ? type() : dict->name();
    const std::string locus = "agitatedVessel '" + unitName + "'";
    auto feedDict = dict->subDict("feed");
    auto operDict = dict->subDict("operation");
    auto compDict = dict->subDict("composition");

    const scalar F    = feedDict->lookupScalar("F", Dims::molarFlow);      // kmol/s
    const scalar T_in = feedDict->lookupScalar("T", Dims::temperature);
    const scalar P_in = feedDict->lookupScalar("P", Dims::pressure);
    const std::size_t n = thermo.n();
    sVector x(n, 0.0);
    scalar zsum = 0.0;
    for (const auto& key : compDict->keys())
    {
        x[thermo.indexOf(key)] = compDict->lookupScalar(key);
        zsum += x[thermo.indexOf(key)];
    }
    if (zsum <= 0.0) throw std::runtime_error(locus + ": empty / zero composition.");
    for (auto& v : x) v /= zsum;

    // ---- the vessel, the impeller record, the speed ---------------------
    for (const auto& k : operDict->keys())
        if (k != "vessel" && k != "impeller" && k != "thermalMode" && k != "outsideCorrelationWindow" && k != "model")
            throw std::runtime_error(locus + ": operation word '" + k + "' -- this unit reads vessel, impeller, thermalMode,"
                " outsideCorrelationWindow.  A liquid property is never typed here: the liquid's flow curve is the property"
                " dictionary's, the impeller's constants an asset record's.");
    if (!operDict->found("vessel") || !operDict->subDict("vessel")->found("D_T"))
        throw std::runtime_error(locus + ": `operation { vessel { D_T <length>; } }` is required.");
    const scalar D_T = operDict->subDict("vessel")->lookupScalar("D_T", Dims::length);
    if (!operDict->found("impeller"))
        throw std::runtime_error(locus + ": `operation { impeller { record <name>; tipSpeed ... | N ...; } }` is required.");
    const DictPtr imp = operDict->subDict("impeller");
    if (!imp->found("record"))
        throw std::runtime_error(locus + ": `impeller { record <name>; }` -- the impeller is an asset record (kind impeller): its k_s and K_p are facts of the impeller (R7).");
    const agitation::ImpellerRecord rec = agitation::loadImpeller(imp->lookupWord("record"));
    scalar D;
    if (imp->found("D")) D = imp->lookupScalar("D", Dims::length);
    else if (rec.geometry.count("clearanceRatio")) D = D_T / (1.0 + rec.geometry.at("clearanceRatio"));
    else throw std::runtime_error(locus + ": the impeller diameter: write `impeller { D <length>; }` (the record states no clearanceRatio to derive it from D_T).");
    if (!(D > 0.0) || D > D_T)
        throw std::runtime_error(locus + ": the impeller diameter must be positive and not larger than the vessel's.");
    scalar N;
    if (imp->found("N") && imp->found("tipSpeed"))
        throw std::runtime_error(locus + ": `impeller` gives both N and tipSpeed -- one speed (two homes would let them disagree).");
    if (imp->found("N")) N = imp->lookupScalar("N", Dims::inverseTime);
    else if (imp->found("tipSpeed")) N = imp->lookupScalar("tipSpeed", Dims::velocity) / (constant::pi * D);
    else throw std::runtime_error(locus + ": `impeller` needs a speed: `N <rpm|1/s>;` or `tipSpeed <m/s>;`.");
    if (!(N > 0.0)) throw std::runtime_error(locus + ": a non-positive impeller speed.");
    const std::string mode = operDict->lookupWordOrDefault("thermalMode", "isothermal");
    if (mode != "isothermal" && mode != "adiabatic")
        throw std::runtime_error(locus + ": `thermalMode " + mode + ";` -- isothermal (the jacket removes the dissipated power, the duty is published) or adiabatic (the contents warm up).");

    // ---- the correlation's window ---------------------------------------
    std::vector<std::string> outsideWindow;
    const scalar Kp0 = agitation::laminarKp(rec, &outsideWindow);
    if (!outsideWindow.empty())
    {
        std::string words;
        for (const auto& w : outsideWindow) words += (words.empty() ? "" : "; ") + w;
        if (!operDict->found("outsideCorrelationWindow"))
            throw std::runtime_error(locus + ": the impeller record " + rec.name + " (" + rec.home + ") is outside the data range of the correlation"
                " that gives its K_p: " + words + ".  REFUSED: write `operation { outsideCorrelationWindow { reason \"...\"; } }` to run it as a"
                " hypothesis (said in the run), or a record with a measured K_p (`Kp <value>;`).");
        const std::string reason = operDict->subDict("outsideCorrelationWindow")->lookupWordOrDefault("reason", "");
        if (reason.empty())
            throw std::runtime_error(locus + ": `outsideCorrelationWindow` without a `reason \"...\";`.");
        const std::string msg = "the impeller " + rec.name + ": " + words + " -- run as a hypothesis, reason: " + reason;
        if (AdvisoryLog::instance().addAnnouncedOnce("impellerWindow:" + unitName, "approximation", "warning", locus, msg) && verbosity >= 1)
            std::cout << "  [agitatedVessel] " << msg << "\n";
    }

    // ---- the liquid -----------------------------------------------------
    liquidProperty::Request densityAsk;
    densityAsk.thermo = &thermo; densityAsk.T = T_in; densityAsk.P = P_in; densityAsk.x = x;
    const scalar rho = liquidProperty::density(densityAsk).value;
    if (!(rho > 0.0)) throw std::runtime_error(locus + ": non-physical liquid density.");
    scalar MW_mix = 0.0;
    for (std::size_t i = 0; i < n; ++i) MW_mix += x[i] * thermo.comp(i).MW();

    // ---- R9 refusals from the flow curve's declaration ------------------
    const scalar gammaAvg = rec.ks * N;
    const rheology::FlowCurve* fc = thermo.flowCurveFor(x);
    if (fc)
    {
        if (fc->hasYield)
            throw std::runtime_error(locus + ": the flow curve " + fc->name + " has a yield stress (" + std::to_string(fc->yield) + " Pa, "
                + fc->yieldHow + "): REFUSED (R9).  The average-shear-rate concept needs a single k_s, and with a yield stress there are"
                  " unyielded regions where the shear rate is zero (Chhabra & Richardson, p. 395-396); the well-mixed region is a cavern whose"
                  " size depends on the Bingham number (eq. 8.12, not built here).");
        if (fc->viscoelastic)
            throw std::runtime_error(locus + ": the flow curve " + fc->name + " is declared viscoelastic: REFUSED (R9).  \"No satisfactory correlations are"
                " thus available enabling the estimation of power consumption in visco-elastic fluids\" (p. 397); k_s then depends on De or Wi.");
        const scalar mx = fc->maxIndexAbove(std::min(gammaAvg, fc->gammaHiAuth));
        if (mx > 1.0 + 1.0e-9)
        {
            char b[300];
            std::snprintf(b, sizeof b, "d ln tau / d ln gamma reaches %.4g (> 1) at or above gamma_avg = %.6g 1/s", static_cast<double>(mx), static_cast<double>(gammaAvg));
            throw std::runtime_error(locus + ": the flow curve " + fc->name + " is shear-THICKENING (" + b + "): REFUSED (R9).  The viscosity is highest at the"
                " impeller, where the shear is highest, and \"the impeller draws enormous power to rotate in this almost solidified material\""
                " (p. 396); the average-shear-rate concept does not describe it.");
        }
    }

    // ---- the door, form 3, at gamma_avg = k_s N -------------------------
    liquidProperty::Consumer who{ "agitatedVessel", unitName };
    const liquidProperty::ApparentViscosity av = liquidProperty::apparentViscosity(
        thermo, T_in, P_in, x, liquidProperty::Shear::rate(gammaAvg), &who);
    const scalar mu = av.value;
    const scalar Re = rho * N * D * D / mu;

    // ---- the power ------------------------------------------------------
    //  Po Re = K_p in the laminar line; the line ends at Re_cr = a Po^b (the record), which depends on Po = K_p/Re.
    const scalar Po_lam = Kp0 / Re;
    scalar ReEnd = 0.0;
    if (rec.hasReCritical) ReEnd = rec.ReCritA * std::pow(Po_lam, rec.ReCritB);
    if (rec.hasReMax) ReEnd = rec.hasReCritical ? std::min(ReEnd, rec.ReMax) : rec.ReMax;
    scalar Po;
    std::string regime;
    if (Re <= ReEnd)
    {
        Po = Po_lam; regime = "laminar (Po Re = K_p)";
    }
    else
    {
        if (!rec.hasPoTurbulent)
            throw std::runtime_error(locus + ": Re = " + std::to_string(Re) + " is past the end of the laminar line (Re_cr = " + std::to_string(ReEnd)
                + ", " + (rec.ReCritSource.empty() ? std::string("the record's") : rec.ReCritSource) + ") and the impeller record " + rec.name
                + " carries no turbulent power number: REFUSED (R9) -- the laminar relation Po Re = K_p is not carried past its line.");
        const scalar ReTurb = 6370.0 * std::pow(rec.PoTurbulent, -1.0 / 3.0);     // eq. 8.8
        if (Re < ReTurb)
            throw std::runtime_error(locus + ": Re = " + std::to_string(Re) + " lies between the end of the laminar line (" + std::to_string(ReEnd)
                + ") and the start of fully turbulent flow (Re_cr = 6370 Po_t^-1/3 = " + std::to_string(ReTurb) + ", eq. 8.8): the transition,"
                  " where \"no simple mathematical relationship exists between Po and Re\" and the power is read off the impeller's curve (p. 386)."
                  "  REFUSED: change the speed or the viscosity, or use a record with the power curve.");
        Po = rec.PoTurbulent; regime = "turbulent (constant Po_t)";
        if (fc)
            AdvisoryLog::instance().addAnnouncedOnce("agitNNTurb:" + unitName, "validity", "warning", locus,
                "beyond the laminar line k_s rises with N faster than linearly (Wichterle & Wein; Kelly & Gigas, p. 395): gamma_avg = k_s N"
                " with the laminar k_s understates the shear for a non-Newtonian liquid");
    }
    const scalar P_W = Po * rho * N * N * N * std::pow(D, 5.0);

    // ---- the printed uncertainty: k_s and K_p ----------------------------
    scalar P_lo = P_W, P_hi = P_W;
    bool haveInterval = false;
    std::string intervalWords;
    if (regime.compare(0, 7, "laminar") == 0)
    {
        const scalar us = rec.ksUncertainty, uk = rec.KpUncertainty;
        std::vector<scalar> mus;
        bool ok = true;
        for (const scalar ksx : { rec.ks * (1.0 - us), rec.ks * (1.0 + us) })
        {
            if (!fc) { mus.push_back(mu); continue; }
            const scalar g = ksx * N;
            try { fc->admitRate(g, locus); mus.push_back(fc->stressUnchecked(g) / g); }
            catch (const std::exception&) { ok = false; }
        }
        if (ok)
        {
            scalar lo = 1.0e300, hi = 0.0;
            for (const scalar m : mus)
                for (const scalar kq : { Kp0 * (1.0 - uk), Kp0 * (1.0 + uk) })
                {
                    const scalar p = kq * m * N * N * D * D * D;
                    lo = std::min(lo, p); hi = std::max(hi, p);
                }
            P_lo = lo; P_hi = hi; haveInterval = true;
            char b[240];
            std::snprintf(b, sizeof b, "k_s +-%.3g %% (%s) through the flow curve, K_p +-%.3g %%", 100.0 * us, rec.ksSource.c_str(), 100.0 * uk);
            intervalWords = b;
        }
        else
            intervalWords = "not printed: k_s's stated uncertainty takes gamma_avg outside the flow curve's authorised domain";
    }

    // ---- the energy: the shaft power is a Work item of the unit ---------
    const scalar W_kW = P_W / 1000.0;
    const scalar F_mol_s = F * 1000.0;
    scalar T_out = T_in, Q_kW = 0.0;
    if (mode == "isothermal")
        Q_kW = -W_kW;                                      // the jacket removes what the impeller dissipates
    else
    {
        const scalar h_target = thermo.Hliquid(T_in, x) + P_W / F_mol_s;       // J/mol
        auto f  = [&](scalar T) { return thermo.Hliquid(T, x) - h_target; };
        auto df = [&](scalar T) { const scalar d = 0.25; return (f(T + d) - f(T - d)) / (2.0 * d); };
        solver::NROptions o;
        o.tolerance = 1.0e-8; o.maxIter = 60; o.lower = T_in - 1.0e-6; o.upper = T_in + 400.0;
        o.bracket = true; o.monotoneIncreasing = true; o.maxStep = 50.0;
        const auto r = solver::newton1D(f, df, T_in + 0.5, o);
        if (!r.converged)
            throw std::runtime_error(locus + ": the adiabatic energy balance H(T_out) = H(T_in) + W/F did not converge.");
        T_out = r.x;
    }

    if (verbosity >= 2)
    {
        std::cout << "\n==========================  Agitated Vessel Result  =================\n"
                  << "  Impeller:        " << rec.name << " (" << rec.home << ")\n"
                  << "                   D = " << std::fixed << std::setprecision(4) << D << " m   D_T = " << D_T << " m   N = " << std::setprecision(5) << N
                  << " 1/s (" << std::setprecision(2) << 60.0 * N << " rpm)   tip speed " << std::setprecision(4) << constant::pi * D * N << " m/s\n"
                  << "  Shear (eq. 8.9): gamma_avg = k_s N = " << std::setprecision(1) << rec.ks << " x " << std::setprecision(5) << N << " = "
                  << std::setprecision(4) << gammaAvg << " 1/s   (k_s +-" << std::setprecision(3) << 100.0 * rec.ksUncertainty << " %, " << rec.ksSource << ")\n"
                  << "  Fluid:           rho = " << std::setprecision(2) << rho << " kg/m3   mu_app = " << std::setprecision(4) << mu << " Pa s  ("
                  << av.domainWords << ")\n"
                  << "  Regime:          " << regime << "   Re = rho N D^2 / mu_app = " << std::setprecision(3) << Re
                  << "   Po = " << Po << "   (K_p = " << std::setprecision(2) << Kp0 << ")\n"
                  << "  Power:           P = " << std::setprecision(1) << P_W << " W  (" << std::setprecision(3) << W_kW << " kW)";
        if (haveInterval) std::cout << "   in " << std::setprecision(3) << P_lo / 1000.0 << " .. " << P_hi / 1000.0 << " kW (" << intervalWords << ")";
        else if (!intervalWords.empty()) std::cout << "   (" << intervalWords << ")";
        std::cout << "\n  Energy:          shaft work " << std::setprecision(3) << W_kW << " kW enters the contents; "
                  << (mode == "isothermal" ? "removed by the jacket, Q = " + std::to_string(Q_kW) + " kW (T_out = T_in)"
                                           : "dissipated: T_out = " + std::to_string(T_out) + " K") << "\n"
                  << "=====================================================================\n\n";
    }

    produced_.clear();
    ProcessStream out;
    out.name = "out"; out.F = F; out.T = T_out; out.P = P_in; out.z = x; out.vf = 0.0;
    produced_.push_back(out);

    kpis_.clear();
    kpis_["W_shaft"]    = P_W;
    kpis_["W_shaft_kW"] = W_kW;                            // an energy item of kind Work (EnergyItems.H), as a pump's
    if (mode == "isothermal") kpis_["Q_kW"] = Q_kW;
    kpis_["P_low_W"]    = P_lo;
    kpis_["P_high_W"]   = P_hi;
    kpis_["Re"]         = Re;
    kpis_["Po"]         = Po;
    kpis_["Kp"]         = Kp0;
    kpis_["gamma_avg"]  = gammaAvg;
    kpis_["mu_app"]     = mu;
    kpis_["N"]          = N;
    kpis_["D"]          = D;
    kpis_["tipSpeed"]   = constant::pi * D * N;
    kpis_["k_s"]        = rec.ks;
    kpis_["T_out"]      = T_out;
    kpis_["density"]    = rho;
    kpis_["F"]          = F;
    (void)MW_mix;
    return 0;
}

} // namespace Choupo
