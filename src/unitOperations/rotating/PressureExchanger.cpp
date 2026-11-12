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

#include "PressureExchanger.H"
#include "core/PropertySourceLog.H"
#include "core/Advisory.H"

#include <cmath>
#include <cstdio>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

namespace {

//  A DECLARED PARAMETER, OR A REFUSAL BY NAME.  The three device numbers are
//  a maker's (or a paper's) and nothing here invents one: an absent key
//  names itself and the remedy; a value outside its range names the range.
scalar requiredFraction(const DictPtr& oper, const std::string& key,
                        scalar lo, bool loOpen, scalar hi, bool hiOpen,
                        const std::string& meaning, const std::string& locus)
{
    if (!oper->found(key))
        throw std::runtime_error(locus + ": `operation { " + key + " ...; }`"
            " is REQUIRED and absent.  It is " + meaning + " -- a maker's data"
            " sheet or Stover, Desalination 203 (2007) 168-175 gives it, and"
            " no default is applied: declare it, with its `source`.");
    const scalar v = oper->lookupScalar(key);
    const bool below = loOpen ? (v <= lo) : (v < lo);
    const bool above = hiOpen ? (v >= hi) : (v > hi);
    if (!std::isfinite(v) || below || above)
    {
        char b[160];
        std::snprintf(b, sizeof(b), "%s%g, %g%s", loOpen ? "(" : "[",
                      static_cast<double>(lo), static_cast<double>(hi),
                      hiOpen ? ")" : "]");
        throw std::runtime_error(locus + ": `" + key + "` must lie in " + b
            + " (a fraction); got " + std::to_string(v) + ".  It is "
            + meaning + ".");
    }
    return v;
}

} // namespace

int PressureExchanger::solve(const DictPtr& dict,
                             const ThermoPackage& thermo,
                             int verbosity)
{
    const std::string unitLabel = dict->name().empty() ? type() : dict->name();
    const std::string locus = type() + " '" + unitLabel + "'";

    // ---- Two inputs: the brine (high pressure) and the seawater (low) -----
    auto ins = dict->lookupDictList("inputStreams");
    if (ins.size() != 2)
        throw std::runtime_error(locus + ": expected exactly 2 input streams"
            " -- inputs ( highPressureIn lowPressureIn ): the BRINE first, the"
            " SEAWATER second; got " + std::to_string(ins.size()) + ".");
    const std::size_t n = thermo.n();

    struct Feed
    { std::string name; sVector z; scalar F = 0, T = 0, P = 0; };
    auto readFeed = [&](const DictPtr& sd) -> Feed
    {
        Feed f;
        f.name = sd->lookupWordOrDefault("streamName", sd->name());
        f.F  = sd->lookupScalar("F", Dims::molarFlow);
        f.T  = sd->lookupScalar("T", Dims::temperature);
        f.P  = sd->lookupScalar("P", Dims::pressure);
        f.z.assign(n, 0.0);
        auto cd = sd->subDict("composition");
        scalar sum = 0.0;
        for (const auto& k : cd->keys()) f.z[thermo.indexOf(k)] = cd->lookupScalar(k);
        for (auto v : f.z) sum += v;
        if (sum > 0.0) for (auto& v : f.z) v /= sum;
        return f;
    };
    Feed hp = readFeed(ins[0]);      // the brine
    Feed lp = readFeed(ins[1]);      // the seawater

    // ---- WHAT THE DEVICE ACCEPTS (DEV.md 4c C188 item 5) ------------------
    //  A liquid, the aqueous solvent, every component modelled -- the
    //  DECLARED contract (`acceptance()` below), applied to BOTH inlets by the
    //  one function that writes such a refusal.  An authored inlet was already
    //  checked before the first unit ran; a produced one (the brine, in a
    //  recycle) is checked here.
    checkAcceptance(*this, acceptanceInletOf(ins[0], hp.z, thermo, locus,
                    acceptance()), thermo, locus);
    checkAcceptance(*this, acceptanceInletOf(ins[1], lp.z, thermo, locus,
                    acceptance()), thermo, locus);

    if (!(hp.F > 0.0) || !(lp.F > 0.0))
        throw std::runtime_error(locus + ": both inlets must carry material"
            " (brine F = " + std::to_string(hp.F) + " kmol/s, seawater F = "
            + std::to_string(lp.F) + " kmol/s).  A duct with nothing to"
            " exchange is not a pressure exchanger.");

    // ---- The three declared parameters, the drain and the source ----------
    auto oper = dict->subDict("operation");
    const scalar eta = requiredFraction(oper, "efficiency", 0.0, true, 1.0, false,
        "the pressure-transfer (energy) efficiency, eta = (Q_HPout P_HPout"
        " + Q_LPout P_LPout) / (Q_HPin P_HPin + Q_LPin P_LPin), 95-98 % for the"
        " rotary ceramic class", locus);
    const scalar m = requiredFraction(oper, "mixing", 0.0, false, 1.0, true,
        "the VOLUMETRIC mixing: the share of the high-pressure outlet that is"
        " brine left in the duct, 3-6 % for the rotary ceramic class", locus);
    const scalar lambda = requiredFraction(oper, "leakage", 0.0, false, 1.0, true,
        "the leakage (lubrication flow): the share of the high-pressure inlet"
        " volume that crosses the rotor-stator gap to the low-pressure outlet,"
        " 1-2 % for the rotary ceramic class", locus);
    if (!oper->found("P_LPout"))
        throw std::runtime_error(locus + ": `operation { P_LPout ...; }` is"
            " REQUIRED and absent: the drain (low-pressure outlet) pressure."
            "  The device sets it by nothing of its own -- it is the pressure"
            " of the line the spent brine leaves by -- so the case declares"
            " it (1-2 bar absolute is usual).");
    const scalar P_LPout = oper->lookupScalar("P_LPout", Dims::pressure);
    if (!(P_LPout > 0.0))
        throw std::runtime_error(locus + ": `P_LPout` must be a positive"
            " absolute pressure; got " + std::to_string(P_LPout) + " Pa.");
    if (!oper->found("source"))
        throw std::runtime_error(locus + ": `operation { source \"...\"; }` is"
            " REQUIRED and absent.  The efficiency, the mixing and the leakage"
            " are a maker's numbers (or a paper's: Stover, Desalination 203"
            " (2007) 168-175); say where these three came from.");
    const std::string source = oper->lookupWord("source");

    // ---- Temperatures: the model is isothermal --------------------------
    const scalar dT_in = std::fabs(hp.T - lp.T);
    if (dT_in > 0.5)
        throw std::runtime_error(locus + ": the two inlets are at different"
            " temperatures (brine " + std::to_string(hp.T) + " K, seawater "
            + std::to_string(lp.T) + " K, " + std::to_string(dT_in) + " K"
            " apart).  This model is ISOTHERMAL -- each outlet leaves at the"
            " temperature of the stream that makes most of it -- and mixing"
            " two solutions of different temperature would need an enthalpy"
            " balance on the mixing share that nothing here models.  Bring"
            " the two to one temperature upstream (a heat exchanger), or"
            " accept a difference below 0.5 K, which is announced.");
    if (dT_in > 0.0)
    {
        char b[320];
        std::snprintf(b, sizeof(b), "the two inlets differ by %.3f K (brine"
            " %.3f K, seawater %.3f K); each outlet leaves at its majority"
            " stream's temperature -- the model is isothermal and prices no"
            " mixing enthalpy", static_cast<double>(dT_in),
            static_cast<double>(hp.T), static_cast<double>(lp.T));
        AdvisoryLog::instance().add("approximation", "info", locus, b);
        if (verbosity >= 2) std::cout << "  [pressureExchanger] " << b << "\n";
    }

    // ---- Liquid molar volume of each inlet (the pump's reading) ----------
    //   v = sum x_i Vliq_i over the components that carry one; a dissolved
    //   ion or a salt with an aqueous bridge carries none and contributes no
    //   volume (dilute-solution reading, ANNOUNCED); any other component
    //   without Vliq refuses.  Q = F v, the volumetric flow the balances use.
    scalar x_ions_total = 0.0;
    std::string ions;
    auto molarVolume = [&](const Feed& f) -> scalar
    {
        scalar v = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            if (!(f.z[i] > 0.0)) continue;
            const scalar vi = thermo.comp(i).Vliq();
            if (vi <= 0.0)
            {
                if (thermo.comp(i).hasAqueousMapping())
                {
                    x_ions_total += f.z[i];
                    const std::string nm = thermo.comp(i).name();
                    if (ions.find(nm) == std::string::npos)
                        ions += (ions.empty() ? "" : " ") + nm;
                    continue;
                }
                throw std::runtime_error(locus + ": component '"
                    + thermo.comp(i).name() + "' in '" + f.name + "' has no"
                    " liquid molar volume (Vliq) in its record -- the"
                    " volumetric balances need one (or an aqueous bridge, for"
                    " a dissolved solute, which then contributes no volume).");
            }
            v += f.z[i] * vi;
        }
        if (!(v > 0.0))
            throw std::runtime_error(locus + ": '" + f.name + "' has no"
                " component with a liquid molar volume -- no volume to"
                " exchange.");
        return v;                                   // m3/mol
    };
    const scalar v_hp = molarVolume(hp);
    const scalar v_lp = molarVolume(lp);
    for (const scalar v : { v_hp, v_lp })
        PropertySourceLog::instance().useHere("liquidVolume", x_ions_total > 0.0
            ? liquidSource::recordVliqIonsMassKept : liquidSource::recordVliqFlat,
            "bypass", took(v), "not applied");
    if (x_ions_total > 0.0)
    {
        char b[480];
        std::snprintf(b, sizeof(b), "dissolved solute(s) (%s) carry no liquid"
            " molar volume: each stream's volume is its solvent's"
            " (dilute-solution reading, the pump's), and the two solutions'"
            " volumes are taken additive", ions.c_str());
        AdvisoryLog::instance().add("approximation", "info", locus, b);
        if (verbosity >= 2) std::cout << "  [pressureExchanger] " << b << "\n";
    }
    const scalar F_hp = hp.F * 1000.0, F_lp = lp.F * 1000.0;   // mol/s
    const scalar Q_HPin = F_hp * v_hp;                         // m3/s
    const scalar Q_LPin = F_lp * v_lp;

    // ---- (1) VOLUME -------------------------------------------------------
    const scalar Q_leak  = lambda * Q_HPin;
    const scalar Q_HPout = Q_HPin - Q_leak;
    const scalar Q_LPout = Q_LPin + Q_leak;
    const scalar imbalance = (Q_LPin - Q_HPin) / Q_HPin;
    {
        char b[520];
        std::snprintf(b, sizeof(b), "efficiency %.4f, mixing %.4f, leakage"
            " %.4f (source: %s); the seawater feed is %+.2f %% of the brine"
            " feed by volume (a rotary exchanger runs balanced; the imbalance"
            " is published, never corrected)", static_cast<double>(eta),
            static_cast<double>(m), static_cast<double>(lambda), source.c_str(),
            static_cast<double>(100.0 * imbalance));
        AdvisoryLog::instance().add("model", "info", locus, b);
        if (verbosity >= 2) std::cout << "  [pressureExchanger] " << b << "\n";
    }

    // ---- (2) COMPOSITION, by the mixing on a volumetric basis ------------
    scalar V_brine_HP = m * Q_HPout;                   // brine volume leaving at HP
    scalar V_sea_HP   = (1.0 - m) * Q_HPout;           // seawater volume leaving at HP
    scalar m_eff      = m;
    //  AN UNDER-FLUSHED DUCT.  When the seawater fed is less than the volume
    //  the brine displaces, the duct cannot be filled with seawater and the
    //  balance of it is brine: the declared mixing is a FLOOR the device
    //  cannot honour on this feed, the effective one is what the flows
    //  allow, and the run SAYS so -- a warning, never a silent clamp.  It is
    //  announced rather than refused because inside a recycle the trial
    //  brine flow is the SOLVER's, not the answer (the path is not the
    //  answer); at the converged state the warning stands and the imbalance
    //  KPI shows how far from balanced the device runs.
    if (V_sea_HP > Q_LPin)
    {
        V_sea_HP   = Q_LPin;
        V_brine_HP = Q_HPout - Q_LPin;
        m_eff      = V_brine_HP / Q_HPout;
        char b[480];
        std::snprintf(b, sizeof(b), "UNDER-FLUSHED: the low-pressure feed"
            " (%.4f m3/h) fills only %.2f %% of the duct volume the brine"
            " displaces (%.4f m3/h); the rest leaves with the pressurised"
            " seawater as brine, so the effective mixing is %.4f against the"
            " declared %.4f.  A rotary exchanger runs with Q_LPin ~ Q_HPin:"
            " feed it more seawater, or less brine.",
            static_cast<double>(3600.0 * Q_LPin),
            static_cast<double>(100.0 * Q_LPin / Q_HPout),
            static_cast<double>(3600.0 * Q_HPout),
            static_cast<double>(m_eff), static_cast<double>(m));
        AdvisoryLog::instance().add("model", "warning", locus, b);
        if (verbosity >= 1) std::cout << "  [pressureExchanger] " << b << "\n";
    }
    sVector n_HP(n, 0.0), n_LP(n, 0.0);               // mol/s
    scalar F_HPout = 0.0, F_LPout = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        const scalar rho_b = F_hp * hp.z[i] / Q_HPin;   // mol/m3 of brine
        const scalar rho_s = F_lp * lp.z[i] / Q_LPin;   // mol/m3 of seawater
        n_HP[i] = V_brine_HP * rho_b + V_sea_HP * rho_s;
        n_LP[i] = F_hp * hp.z[i] + F_lp * lp.z[i] - n_HP[i];
        if (n_LP[i] < 0.0 && n_LP[i] > -1.0e-12 * (F_hp + F_lp)) n_LP[i] = 0.0;
        F_HPout += n_HP[i];
        F_LPout += n_LP[i];
    }
    sVector z_HP(n, 0.0), z_LP(n, 0.0);
    for (std::size_t i = 0; i < n; ++i)
    {
        z_HP[i] = F_HPout > 0.0 ? n_HP[i] / F_HPout : 0.0;
        z_LP[i] = F_LPout > 0.0 ? n_LP[i] / F_LPout : 0.0;
    }

    //  The salinity the feed gains: mass fraction of every non-solvent
    //  component (the "total solute"), high-pressure outlet against the
    //  seawater inlet.
    const std::size_t iw = thermo.aqueousSolventIndex();
    auto soluteMassFraction = [&](const sVector& z) -> scalar
    {
        scalar mTot = 0.0, mSol = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            const scalar mi = z[i] * thermo.comp(i).MW();
            mTot += mi;
            if (i != iw) mSol += mi;
        }
        return mTot > 0.0 ? mSol / mTot : 0.0;
    };
    const scalar w_in  = soluteMassFraction(lp.z);
    const scalar w_out = soluteMassFraction(z_HP);
    const scalar w_brine = soluteMassFraction(hp.z);
    const scalar salinityIncrease = w_in > 0.0 ? (w_out - w_in) / w_in : 0.0;

    // ---- (3) PRESSURE, by the efficiency ---------------------------------
    const scalar E_in  = Q_HPin * hp.P + Q_LPin * lp.P;          // W
    const scalar P_HPout = (eta * E_in - Q_LPout * P_LPout) / Q_HPout;
    const scalar E_out = Q_HPout * P_HPout + Q_LPout * P_LPout;  // = eta E_in
    const scalar W_lost = E_in - E_out;                          // W
    if (P_HPout <= lp.P)
    {
        char b[480];
        std::snprintf(b, sizeof(b), "the high-pressure outlet solves to %.4f"
            " bar, at or below the seawater inlet's %.4f bar: the device"
            " recovers nothing.  At efficiency %.4f with Q_HPin %.4f m3/h,"
            " Q_LPin %.4f m3/h, P_HPin %.4f bar and P_LPout %.4f bar the"
            " definition has no useful root -- check the efficiency, the"
            " drain pressure and the flow balance.",
            static_cast<double>(P_HPout / 1.0e5), static_cast<double>(lp.P / 1.0e5),
            static_cast<double>(eta), static_cast<double>(3600.0 * Q_HPin),
            static_cast<double>(3600.0 * Q_LPin), static_cast<double>(hp.P / 1.0e5),
            static_cast<double>(P_LPout / 1.0e5));
        throw std::runtime_error(locus + ": " + b);
    }
    if (P_LPout > hp.P)
        throw std::runtime_error(locus + ": the declared drain pressure"
            " P_LPout = " + std::to_string(P_LPout / 1.0e5) + " bar exceeds the"
            " brine inlet's " + std::to_string(hp.P / 1.0e5) + " bar: the spent"
            " brine cannot leave against a higher pressure than it arrived at.");
    if (P_HPout > hp.P)
    {
        char b[400];
        std::snprintf(b, sizeof(b), "the high-pressure outlet (%.4f bar) solves"
            " ABOVE the brine inlet (%.4f bar): at this efficiency the"
            " definition credits the leaked volume's pressure energy to the"
            " outlet -- an artefact of the definition at eta -> 1, published"
            " as solved", static_cast<double>(P_HPout / 1.0e5),
            static_cast<double>(hp.P / 1.0e5));
        AdvisoryLog::instance().add("model", "warning", locus, b);
        if (verbosity >= 1) std::cout << "  [pressureExchanger] " << b << "\n";
    }

    // ---- The booster the device leaves to be paid ------------------------
    //  The target is the pressure the high-pressure outlet must rejoin: the
    //  case declares it (`targetPressure`, the high-pressure pump's
    //  discharge) or, absent, the BRINE INLET pressure is read in its place
    //  -- a lower bound on the real target, since the membrane's own channel
    //  drop sits between the two -- and the reading is ANNOUNCED.
    scalar P_target;
    bool targetDeclared = oper->found("targetPressure");
    if (targetDeclared)
        P_target = oper->lookupScalar("targetPressure", Dims::pressure);
    else
    {
        P_target = hp.P;
        char b[400];
        std::snprintf(b, sizeof(b), "no `targetPressure` declared: the booster"
            " duty is computed to the BRINE INLET pressure (%.4f bar), a lower"
            " bound on the high-pressure pump's discharge, which the"
            " membrane's channel drop separates from it",
            static_cast<double>(hp.P / 1.0e5));
        AdvisoryLog::instance().add("default", "info", locus, b);
        if (verbosity >= 2) std::cout << "  [pressureExchanger] " << b << "\n";
    }
    const scalar boosterDuty_W = Q_HPout * std::max(0.0, P_target - P_HPout);
    const scalar recovered_W   = Q_HPout * (P_HPout - lp.P);

    if (verbosity >= 2)
    {
        std::cout << "\n======================  Pressure Exchanger Result  ==================\n"
                  << "  Declared:        efficiency " << std::fixed << std::setprecision(4) << eta
                  << "   mixing " << m << (m_eff != m ? " (effective " : "")
                  << (m_eff != m ? std::to_string(m_eff) + ", under-flushed)" : std::string())
                  << "   leakage " << lambda << "\n"
                  << "  Source:          " << source << "\n"
                  << "  Volumes [m3/h]:  HP in " << std::setprecision(4) << 3600.0 * Q_HPin
                  << "   LP in " << 3600.0 * Q_LPin
                  << "   HP out " << 3600.0 * Q_HPout
                  << "   LP out " << 3600.0 * Q_LPout
                  << "   leak " << 3600.0 * Q_leak << "\n"
                  << "  Pressures [bar]: HP in " << std::setprecision(3) << hp.P / 1.0e5
                  << "   LP in " << lp.P / 1.0e5
                  << "   HP out " << P_HPout / 1.0e5 << " (solved)"
                  << "   LP out " << P_LPout / 1.0e5 << " (declared)\n"
                  << "  Recovered:       " << std::setprecision(3) << (P_HPout - lp.P) / 1.0e5
                  << " bar on the seawater, " << recovered_W / 1000.0 << " kW hydraulic\n"
                  << "  HP-side loss:    " << (hp.P - P_HPout) / 1.0e5
                  << " bar  ->  booster (hydraulic, to " << P_target / 1.0e5 << " bar"
                  << (targetDeclared ? ", declared" : ", the brine inlet") << "): "
                  << boosterDuty_W / 1000.0 << " kW\n"
                  << "  Dissipated:      " << W_lost / 1000.0 << " kW  ("
                  << std::setprecision(4) << W_lost / Q_HPout / 3.6e6
                  << " kWh per m3 of pressurised seawater)\n"
                  << "  Salinity [w/w]:  seawater " << std::setprecision(5) << w_in
                  << "   brine " << w_brine << "   HP out " << w_out
                  << "  (+" << std::setprecision(3) << 100.0 * salinityIncrease
                  << " % on the feed: the mixing's penalty)\n"
                  << "  T:               unchanged (HP out " << std::setprecision(2) << lp.T
                  << " K, LP out " << hp.T << " K)\n"
                  << "=====================================================================\n\n";
    }

    // ---- Produced streams: 0 = highPressureOut, 1 = lowPressureOut -------
    produced_.clear();
    ProcessStream o0;
    o0.name = "highPressureOut";
    o0.F    = F_HPout / 1000.0;
    o0.T    = lp.T;
    o0.P    = P_HPout;
    o0.z    = z_HP;
    o0.vf   = 0.0;
    produced_.push_back(o0);
    ProcessStream o1;
    o1.name = "lowPressureOut";
    o1.F    = F_LPout / 1000.0;
    o1.T    = hp.T;
    o1.P    = P_LPout;
    o1.z    = z_LP;
    o1.vf   = 0.0;
    produced_.push_back(o1);

    // ---- KPIs -----------------------------------------------------------
    kpis_.clear();
    kpis_["efficiency"]             = eta;
    kpis_["mixing"]                 = m;
    kpis_["mixingEffective"]        = m_eff;                     // = mixing unless under-flushed
    kpis_["leakage"]                = lambda;
    kpis_["P_HPin"]                 = hp.P;
    kpis_["P_LPin"]                 = lp.P;
    kpis_["P_HPout"]                = P_HPout;
    kpis_["P_LPout"]                = P_LPout;
    kpis_["P_recovered_bar"]        = (P_HPout - lp.P) / 1.0e5;
    kpis_["dP_HP_bar"]              = (hp.P - P_HPout) / 1.0e5;
    kpis_["dP_LP_bar"]              = (lp.P - P_LPout) / 1.0e5;
    kpis_["Q_HPin_m3h"]             = 3600.0 * Q_HPin;
    kpis_["Q_LPin_m3h"]             = 3600.0 * Q_LPin;
    kpis_["Q_HPout_m3h"]            = 3600.0 * Q_HPout;
    kpis_["Q_LPout_m3h"]            = 3600.0 * Q_LPout;
    kpis_["leakageFlow_m3h"]        = 3600.0 * Q_leak;
    kpis_["mixedBrineFlow_m3h"]     = 3600.0 * V_brine_HP;
    kpis_["flowImbalance"]          = imbalance;
    kpis_["salinity_LPin"]          = w_in;
    kpis_["salinity_HPout"]         = w_out;
    kpis_["salinity_brine"]         = w_brine;
    kpis_["feedSalinityIncrease"]   = salinityIncrease;
    kpis_["targetPressure"]         = P_target;
    kpis_["boosterDuty_kW"]         = boosterDuty_W / 1000.0;    // hydraulic, eta_pump = 1
    kpis_["recoveredPower_kW"]      = recovered_W / 1000.0;      // hydraulic
    kpis_["dissipation_kW"]         = W_lost / 1000.0;
    kpis_["specificEnergy_kWh_m3"]  = W_lost / Q_HPout / 3.6e6;  // per m3 pressurised seawater
    kpis_["Q_kW"]                   = 0.0;                       // no heat, no work on the fluid
    kpis_["F_HPout"]                = o0.F;
    kpis_["F_LPout"]                = o1.F;

    return 0;
}

//  WHAT THE DEVICE ACCEPTS (DEV.md 4c C188 item 5; C192): a LIQUID on both
//  ports, the aqueous solvent in both, every component carried into the
//  volumetric balances -- a solute with no Vliq through its aqueous bridge.
UnitAcceptance PressureExchanger::acceptance() const
{
    UnitAcceptance a;
    a.declared = true;
    a.phases.liquid = true;
    a.phases.vapour = false;
    a.phases.why = "The exchanger moves pressure between two LIQUIDS by"
        " displacement in a duct: its balances are volumetric on the liquid"
        " molar volume, and a vapour has no duct volume to exchange.";
    a.phases.remedy = "feed it liquids only -- a degassed brine and a"
        " subcooled seawater.";
    a.solvent.aqueousRequired = true;
    a.solvent.why = "the device is the seawater-RO energy-recovery device:"
        " both streams are aqueous solutions, the salinity it moves between"
        " them is the solute mass fraction on the aqueous solvent, and a"
        " dissolved solute's volume is taken as the solvent's.";
    a.solvent.remedy = "carry the aqueous solvent (water unless the case"
        " declares another) in BOTH feeds.";
    a.models.rule = UnitAcceptance::ModelsRule::everyComponent;
    a.models.sentence = "every component the two streams carry, each with a"
        " liquid molar volume or an aqueous bridge (a dissolved solute, whose"
        " volume is then the solvent's)";
    a.models.why = "the balances are volumetric and every component is"
        " carried in them; one with neither a Vliq nor an aqueous bridge has"
        " no volume to be displaced by and refuses at the solve.";
    a.models.remedy = "give the component a liquid molar volume in its record,"
        " or declare its aqueous bridge.";
    return a;
}

} // namespace Choupo
