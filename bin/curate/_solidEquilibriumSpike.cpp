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
-------------------------------------------------------------------------------
Application
    _solidEquilibriumSpike  (the C2 spike's probe -- curation, not shipped)

Description
    Five demonstrations against the proposition RULED 2026-08-08 (C2): ONE
    solid-equilibrium architecture, MULTIPLE explicit solid thermodynamic
    models, NO independent removal mechanisms on the same equilibrium.

    D1  molecular solid (ICE): SolidPhase's fusion model behind the common
        interface, at fixed T -- freeze-concentration equilibrium; the
        converged brine molality must invert the fpd01 freezing curve.
    D2  ordinary salt (NaCl(s)): the dissolution/Ksp model behind the SAME
        interface, anchored on the cited Pinho & Macedo m_sat.
    D3  reactive mineral (CALCITE): ln(IAP/K) over the SPECIATED solution,
        with SpeciationSolver's own `equilibrate` as the untouched ORACLE.
    D4  ice + salt REGISTERED TOGETHER: one active, one correctly absent,
        atoms closed in the one ledger; then the eutectic attempt where
        both activate at once.
    D5  the NEGATIVE CONTROL: the banned two-independent-mechanisms shape
        reintroduced by hand, and the inconsistency it leaves measured.
\*---------------------------------------------------------------------------*/

#include "thermo/solidEquilibrium/SolidEquilibrium.H"
#include "core/Dictionary.H"
#include "thermo/Component.H"
#include "thermo/Database.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"
#include "thermo/electrolyte/SpeciationSolver.H"
#include "thermo/electrolyte/AqueousActivity.H"
#include "thermo/phase/Phase.H"
#include "thermo/phase/SolidPhase.H"
#include "thermo/vaporPressure/VaporPressureModel.H"
#include "thermo/heatCapacity/HeatCapacityModel.H"
#include "thermo/activityCoefficient/ActivityModel.H"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <iostream>
#include <string>
#include <vector>

using namespace Choupo;

static const double MW_W = 0.018015;   // kg/mol water

std::string num(double v)
{
    if (std::isnan(v)) return "NaN";
    if (std::isinf(v)) return v > 0 ? "Infinity" : "-Infinity";
    char b[40]; std::snprintf(b, sizeof b, "%.17g", v); return b;
}
std::string esc(const std::string& s)
{
    std::string o;
    for (char c : s) { if (c=='"'||c=='\\') { o+='\\'; o+=c; } else if (c=='\n') o+=' '; else o+=c; }
    return o;
}

struct Ctx
{
    Component water;
    std::unique_ptr<SolidPhase> ice;
    PitzerSingleSalt nacl;
    double lnKsp = 0.0;                 // anchored on the cited m_sat, 298.15 K
    double msat  = 6.144;               // Pinho & Macedo 2005, NaCl.dat
    double dHsoln = 3880.0;             // J/mol, NaCl.dat dissolutionEnthalpy
                                        // (cited); van 't Hoff FIRST-ORDER --
                                        // an announced spike approximation,
                                        // a curated Ksp(T) is the named gap
    double lnKspT(double T) const
    { return lnKsp - dHsoln / 8.314462618 * (1.0 / T - 1.0 / 298.15); }
};

//  ln(f_solid/Psat) for pure water ice at T -- SolidPhase, exactly as the
//  freezingPoint op consumes it.
static double lnIceRatio(const Ctx& c, double T)
{
    sVector x(1, 1.0);
    return std::log(c.ice->fEffective(T, 101325.0, x)[0]
                    / c.water.vp().Psat_Pa(T));
}

int main()
{
    VaporPressureModel::registerBuiltins();
    HeatCapacityModel::registerBuiltins();
    ActivityModel::registerBuiltins();
    electrolyte::AqueousActivity::registerBuiltins();

    const char* h = std::getenv("CHOUPO_HOME");
    const std::string home = h ? h : ".";
    Database db(home + "/data");

    Ctx c;
    c.water.readFromDict(Dictionary::fromFile(
        home + "/data/standards/components/water.dat"));
    std::vector<std::string> names{"water"};
    std::vector<Component> comps; comps.push_back(std::move(c.water));
    c.ice = std::make_unique<SolidPhase>(Dictionary::fromString(
        "name ice; mode crystallizing; component water;", "spike"), names, comps);
    c.water.readFromDict(Dictionary::fromFile(
        home + "/data/standards/components/water.dat"));
    c.nacl = electrolyte::loadSalt("Na", "Cl");
    c.lnKsp = 2.0 * std::log(c.msat * c.nacl.gammaPM(c.msat, 298.15));

    std::string out; bool first = true;
    auto add = [&](const std::string& s)
    { if (!first) out += ",\n  "; first = false; out += s; };

    // ---- D1: ice through the interface, fixed T ---------------------------
    {
        std::string r = "{\"demo\": \"D1_ice\"";
        try
        {
            const double T = 268.15;
            double salt = 1.0, w = 1.0;              // mol NaCl, kg water
            std::vector<solidEq::SolidCandidate> s(1);
            s[0].name = "ice";
            s[0].lnSI = [&](double Tq)
            { return std::log(c.nacl.waterActivity(salt / w, Tq))
                     - lnIceRatio(c, Tq); };
            s[0].remove = [&](double dn) { w -= dn * MW_W; };
            const int it = solidEq::equilibrate(s, T);
            const double mStar = salt / w;
            //  invert: the fpd01-style bisection at mStar must return T
            double lo = 230.0, hi = 274.0;
            for (int k = 0; k < 80; ++k)
            {
                const double mid = 0.5 * (lo + hi);
                const double res = std::log(c.nacl.waterActivity(mStar, mid))
                                 - lnIceRatio(c, mid);
                (res > 0.0 ? lo : hi) = mid;   // res>0 = below Tf
            }
            const double TfBack = 0.5 * (lo + hi);
            //  the complementarity negative: same candidate ABOVE the curve
            double salt2 = 1.0, w2 = 1.0;
            std::vector<solidEq::SolidCandidate> s2(1);
            s2[0].name = "ice";
            s2[0].lnSI = [&](double Tq)
            { return std::log(c.nacl.waterActivity(salt2 / w2, Tq))
                     - lnIceRatio(c, Tq); };
            s2[0].remove = [&](double dn) { w2 -= dn * MW_W; };
            solidEq::equilibrate(s2, 272.5);         // Tf(1 m) ~ 269.7 < 272.5
            r += ", \"result\": \"ok\", \"iters\": " + num(it)
               + ", \"nIce\": " + num(s[0].n)
               + ", \"mStar\": " + num(mStar)
               + ", \"TfBack_minus_T\": " + num(TfBack - T)
               + ", \"aboveCurve_n\": " + num(s2[0].n);
        }
        catch (const std::exception& e)
        { r += ", \"result\": \"" + esc(e.what()) + "\""; }
        add(r + "}");
    }

    // ---- D2: the salt through the SAME interface --------------------------
    {
        std::string r = "{\"demo\": \"D2_salt\"";
        try
        {
            const double T = 298.15;
            double salt = 7.0; const double w = 1.0, salt0 = 7.0;
            std::vector<solidEq::SolidCandidate> s(1);
            s[0].name = "NaCl(s)";
            s[0].lnSI = [&](double Tq)
            { const double m = salt / w;
              return 2.0 * std::log(m * c.nacl.gammaPM(m, Tq)) - c.lnKspT(Tq); };
            s[0].remove = [&](double dn) { salt -= dn; };
            const int it = solidEq::equilibrate(s, T);
            double salt3 = 5.0;
            std::vector<solidEq::SolidCandidate> s3(1);
            s3[0].name = "NaCl(s)";
            s3[0].lnSI = [&](double Tq)
            { const double m = salt3 / w;
              return 2.0 * std::log(m * c.nacl.gammaPM(m, Tq)) - c.lnKspT(Tq); };
            s3[0].remove = [&](double dn) { salt3 -= dn; };
            solidEq::equilibrate(s3, T);
            r += ", \"result\": \"ok\", \"iters\": " + num(it)
               + ", \"mEnd\": " + num(salt / w)
               + ", \"nSalt\": " + num(s[0].n)
               + ", \"ledger_gap\": " + num(salt + s[0].n - salt0)
               + ", \"subsat_n\": " + num(s3[0].n);
        }
        catch (const std::exception& e)
        { r += ", \"result\": \"" + esc(e.what()) + "\""; }
        add(r + "}");
    }

    // ---- D3: the reactive mineral, SpeciationSolver as untouched oracle ---
    {
        std::string r = "{\"demo\": \"D3_calcite\"";
        try
        {
            electrolyte::SpeciationSolver solver("davies");
            auto mkIn = [&](double ca, double co3, std::vector<std::string> eq)
            {
                electrolyte::SpeciationInput in;
                in.totals[SpeciesId("Ca")]   = ca;
                in.totals[SpeciesId("HCO3")] = co3;
                in.solvePH = true; in.T = 298.15;
                in.equilibrate = std::move(eq);
                in.announceClosure = false;
                return in;
            };
            //  ORACLE: the engine's own equilibrate, untouched.
            auto oracle = solver.solve(mkIn(5e-3, 1e-2, {"calcite"}), 0);
            const double nOracle = oracle.precipitated.count("calcite")
                                 ? oracle.precipitated.at("calcite") : -1.0;
            //  THE INTERFACE: same physics reached through the candidate.
            double ca = 5e-3, co3 = 1e-2;
            std::vector<solidEq::SolidCandidate> s(1);
            s[0].name = "calcite";
            s[0].lnSI = [&](double)
            {
                auto res = solver.solve(mkIn(ca, co3, {}), 0);
                return std::log(10.0) * res.SI.at("calcite");
            };
            s[0].remove = [&](double dn) { ca -= dn; co3 -= dn; };
            const int it = solidEq::equilibrate(s, 298.15, 400, 1e-9);
            auto endState = solver.solve(mkIn(ca, co3, {}), 0);
            r += ", \"result\": \"ok\", \"iters\": " + num(it)
               + ", \"nOracle\": " + num(nOracle)
               + ", \"nInterface\": " + num(s[0].n)
               + ", \"SIend\": " + num(endState.SI.at("calcite"))
               + ", \"pH_oracle\": " + num(oracle.pH)
               + ", \"pH_interface\": " + num(endState.pH);
        }
        catch (const std::exception& e)
        { r += ", \"result\": \"" + esc(e.what()) + "\""; }
        add(r + "}");
    }

    // ---- D4: both candidates in ONE solve, one ledger ---------------------
    auto joint = [&](const char* tag, double T, double salt0) -> std::string
    {
        std::string r = std::string("{\"demo\": \"") + tag + "\"";
        try
        {
            double salt = salt0, w = 1.0;
            const double water0 = 1.0 / MW_W;
            std::vector<solidEq::SolidCandidate> s(2);
            s[0].name = "ice";
            s[0].lnSI = [&](double Tq)
            { return std::log(c.nacl.waterActivity(salt / w, Tq))
                     - lnIceRatio(c, Tq); };
            s[0].remove = [&](double dn) { w -= dn * MW_W; };
            s[1].name = "NaCl(s)";
            s[1].lnSI = [&](double Tq)
            { const double m = salt / w;
              return 2.0 * std::log(m * c.nacl.gammaPM(m, Tq)) - c.lnKspT(Tq); };
            s[1].remove = [&](double dn) { salt -= dn; };
            const int it = solidEq::equilibrate(s, T);
            const double waterGap =
                (w / MW_W + s[0].n - water0) / water0;
            const double saltGap  = (salt + s[1].n - salt0) / salt0;
            r += ", \"result\": \"ok\", \"iters\": " + num(it)
               + ", \"nIce\": " + num(s[0].n)
               + ", \"nSalt\": " + num(s[1].n)
               + ", \"mEnd\": " + num(salt / w)
               + ", \"lnSI_ice\": " + num(s[0].lnSI(T))
               + ", \"lnSI_salt\": " + num(s[1].lnSI(T))
               + ", \"waterLedgerRel\": " + num(waterGap)
               + ", \"saltLedgerRel\": " + num(saltGap);
        }
        catch (const std::exception& e)
        { r += ", \"result\": \"" + esc(e.what()) + "\""; }
        return r + "}";
    };
    add(joint("D4_joint_one_active", 263.15, 2.0));
    add(joint("D4b_eutectic_attempt", 252.15, 6.0));

    // ---- D5: the BANNED shape, by hand, and its measured damage -----------
    //  The ruling bans TWO INDEPENDENT REMOVAL MECHANISMS acting on the same
    //  equilibrium.  Reintroduce it deliberately: the SAME physical solid
    //  (ice) solved by two mechanisms, each blind to the other's removal --
    //  exactly the shape a flash-owned crystal beside a speciation-owned one
    //  would take.  Both "converge"; their combined ledger over-freezes the
    //  water and the recombined state satisfies NEITHER equilibrium.
    {
        std::string r = "{\"demo\": \"D5_double_count\"";
        try
        {
            const double T = 263.15, salt0 = 2.0;
            auto solveIceBlind = [&]() {
                double sX = salt0, wX = 1.0;
                std::vector<solidEq::SolidCandidate> v(1);
                v[0].name = "ice";
                v[0].lnSI = [&](double Tq)
                { return std::log(c.nacl.waterActivity(sX / wX, Tq))
                         - lnIceRatio(c, Tq); };
                v[0].remove = [&](double dn) { wX -= dn * MW_W; };
                solidEq::equilibrate(v, T);
                return v[0].n;
            };
            const double nA = solveIceBlind();     // mechanism A, blind
            const double nB = solveIceBlind();     // mechanism B, blind
            const double water0 = 1.0 / MW_W;
            const double wBoth = 1.0 - (nA + nB) * MW_W;   // one pot, both removals
            const double mBoth = salt0 / wBoth;
            const double resIce = std::log(c.nacl.waterActivity(mBoth, T))
                                - lnIceRatio(c, T);
            //  the one-ledger closure the joint solve satisfies at 1e-16:
            //  liquid water + (the one solid that physically exists) vs start.
            const double ledgerRel =
                (wBoth / MW_W + nA - water0) / water0;     // counts ice ONCE
            r += ", \"result\": \"ok\""
               + std::string(", \"nA\": ") + num(nA)
               + ", \"nB\": " + num(nB)
               + ", \"residual_ice_after\": " + num(resIce)
               + ", \"ledgerRel_violation\": " + num(ledgerRel);
        }
        catch (const std::exception& e)
        { r += ", \"result\": \"" + esc(e.what()) + "\""; }
        add(r + "}");
    }

    std::cout << "<<<JSON\n[\n  " << out << "\n]\nJSON>>>\n";
    return 0;
}
