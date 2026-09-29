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
Description
    ConvectiveDryer implementation -- see ConvectiveDryer.H.
\*---------------------------------------------------------------------------*/

#include "ConvectiveDryer.H"
#include "DryingCurve.H"
#include "Psychrometry.H"

#include "core/Dimensions.H"
#include "thermo/ThermoPackage.H"
#include "thermo/heatCapacity/HeatCapacityModel.H"
#include "thermo/vaporPressure/VaporPressureModel.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <limits>
#include <sstream>
#include <stdexcept>

namespace Choupo {

namespace {

//  A march that cannot be carried out (the air would have to be colder than
//  its own saturation, or could not supply the heat) -- caught by the
//  counter-current shooting, where it means "too much water was assumed".
//  `tooLittleWater` says which way the counter-current guess was wrong: the
//  air running out of moisture (negative humidity) means the guessed outlet
//  moisture was too HIGH; saturation or an energy shortfall means too LOW.
struct InfeasibleMarch : std::runtime_error
{
    bool tooLittleWater = false;
    explicit InfeasibleMarch(const std::string& w, bool little = false)
        : std::runtime_error(w), tooLittleWater(little) {}
};

} // namespace

int ConvectiveDryer::solve(const DictPtr& dict,
                           const ThermoPackage& thermo,
                           int verbosity)
{
    const std::size_t n = thermo.n();
    const std::string name = dict->name().empty() ? "convectiveDryer" : dict->name();
    const std::string who  = "convectiveDryer '" + name + "'";

    // ---- the two inlets: the same identification as SolidDryer ----------
    auto ins = dict->lookupDictList("inputStreams");
    if (ins.size() != 2)
        throw std::runtime_error(who + ": needs exactly TWO inputs -- a wet"
            " solid and a hot-air stream, e.g. inputs ( wetSolid hotAir )");
    auto readComp = [&](const DictPtr& sd) -> sVector
    {
        sVector v(n, 0.0); auto c = sd->subDict("composition"); scalar s = 0.0;
        for (const auto& k : c->keys()) v[thermo.indexOf(k)] = c->lookupScalar(k);
        for (auto x : v) s += x;
        if (s > 0.0) for (auto& x : v) x /= s;
        return v;
    };
    auto readSolids = [&](const DictPtr& sd) -> sVector
    {
        sVector v(n, 0.0);
        if (sd->found("solids") && sd->subDict("solids")->found("solidMolarFlows"))
        {
            auto mf = sd->subDict("solids")->subDict("solidMolarFlows");
            for (const auto& k : mf->keys()) v[thermo.indexOf(k)] = mf->lookupScalar(k);
        }
        return v;
    };
    DictPtr solidDict, airDict;
    for (const auto& s : ins)
    {
        const sVector sj = readSolids(s);
        bool isWet = false;
        for (std::size_t i = 0; i < n; ++i)
            if (sj[i] > 0.0 && thermo.comp(i).hasSorption()) isWet = true;
        if (isWet && !solidDict) solidDict = s; else if (!airDict) airDict = s;
    }
    if (!solidDict || !airDict)
        throw std::runtime_error(who + ": could not identify the wet solid (a"
            " stream carrying a solid whose record has a `sorption {}`"
            " isotherm) and the air (the other inlet)");

    const scalar P     = solidDict->lookupScalar("P", Dims::pressure);
    const scalar T_sIn = solidDict->lookupScalar("T", Dims::temperature);
    const scalar F_wIn = solidDict->lookupScalar("F", Dims::molarFlow);   // kmol/s
    const sVector zW   = readComp(solidDict);
    const sVector sW   = readSolids(solidDict);
    //  THIS UNIT ASSERTS A PHASE ON EACH INLET -- the air is priced as a
    //  vapour, the moisture on the solid as a liquid -- so it READS the phase
    //  each stream carries and refuses a disagreement (the evaporator rule,
    //  CLAUDE.md "the word that was not there").  An air stream with no
    //  declared phase carries vf = 0 by default and the energy report prices
    //  it as a LIQUID: that is a 380 kW first-law error on this unit's own
    //  witness, measured, before the stream said `phase gas;`.
    {
        const scalar vfA = airDict->lookupScalarOrDefault("vf", 0.0);
        const scalar vfS = solidDict->lookupScalarOrDefault("vf", 0.0);
        const std::string an = airDict->lookupWordOrDefault("streamName", "the air");
        const std::string sn = solidDict->lookupWordOrDefault("streamName", "the wet solid");
        if (vfA < 1.0 - 1.0e-12)
            throw std::runtime_error(who + ": the air stream '" + an + "' is"
                " carried with vapour fraction " + std::to_string(vfA)
                + ", but this dryer prices its air as a VAPOUR -- declare"
                " `phase gas;` in its 0/ file (an undeclared phase defaults to"
                " liquid, and the energy report would price it as one)");
        if (vfS > 1.0e-12)
            throw std::runtime_error(who + ": the wet-solid stream '" + sn
                + "' is carried with vapour fraction " + std::to_string(vfS)
                + ", but this dryer prices the moisture on the solid as a"
                " LIQUID -- declare `phase liquid;` (or leave it undeclared)");
    }
    const scalar T_aIn = airDict->lookupScalar("T", Dims::temperature);
    const scalar F_aIn = airDict->lookupScalar("F", Dims::molarFlow);
    const sVector yA   = readComp(airDict);

    std::size_t iSol = n, iW = n;
    for (std::size_t i = 0; i < n; ++i)
        if (sW[i] > 0.0 && thermo.comp(i).hasSorption()) iSol = i;
    for (std::size_t i = 0; i < n; ++i)
        if (zW[i] > 0.0 && thermo.comp(i).hasVaporPressure()) { iW = i; break; }
    if (iW == n)
        throw std::runtime_error(who + ": the wet solid carries no volatile"
            " moisture (a component with a vapour pressure in its liquid)");
    for (std::size_t i = 0; i < n; ++i)
        if (i != iW && zW[i] > 0.0)
            throw std::runtime_error(who + ": the wet solid's liquid carries '"
                + thermo.comp(i).name() + "' beside the moisture '"
                + thermo.comp(iW).name() + "' -- this dryer evaporates ONE"
                " moisture component");

    const Component& sol   = thermo.comp(iSol);
    const Component& moist = thermo.comp(iW);
    const scalar Mv = moist.MW();                                  // kg/kmol
    const scalar solidMol = sW[iSol];                              // kmol/s
    const scalar S        = solidMol * sol.MW();                   // kg/s dry
    const scalar X_in     = F_wIn * zW[iW] * Mv / S;               // kg/kg

    //  The DRY carrier: every air component but the moisture.
    scalar G_mol = 0.0, G = 0.0;                                   // kmol/s, kg/s
    sVector yDry(n, 0.0);
    for (std::size_t i = 0; i < n; ++i)
        if (i != iW && yA[i] > 0.0)
        {
            G_mol += F_aIn * yA[i];
            G     += F_aIn * yA[i] * thermo.comp(i).MW();
        }
    if (G_mol <= 0.0)
        throw std::runtime_error(who + ": the air stream carries no dry gas");
    for (std::size_t i = 0; i < n; ++i)
        if (i != iW) yDry[i] = F_aIn * yA[i] / G_mol;
    const scalar Mc   = G / G_mol;
    const scalar Y_in = F_aIn * yA[iW] * Mv / G;                   // kg/kg dry

    // ---- operation ----------------------------------------------------------
    auto op = dict->subDict("operation");
    const scalar A = op->lookupScalar("area", Dims::area);
    if (!(A > 0.0))
        throw std::runtime_error(who + ": operation.area must be > 0 m2 (the"
            " gas-solid contact area -- equipment data)");
    const scalar kY = op->lookupScalar("k_Y", Dims::massFlow / Dims::area);
    if (!(kY > 0.0))
        throw std::runtime_error(who + ": operation.k_Y must be > 0 kg/(m2 s)"
            " per unit humidity ratio -- equipment data, never defaulted");
    const scalar X_c = op->lookupScalar("criticalMoisture");
    if (!(X_c > 0.0))
        throw std::runtime_error(who + ": operation.criticalMoisture must be"
            " > 0 kg/kg -- measured on the material, not derivable");
    const std::string flow = op->lookupWord("flow");
    if (flow != "cocurrent" && flow != "countercurrent")
        throw std::runtime_error(who + ": operation.flow must be cocurrent or"
            " countercurrent (got '" + flow + "')");
    const bool counter = (flow == "countercurrent");
    const bool nDeclared = op->found("nSteps");
    const int  N = nDeclared ? static_cast<int>(op->lookupScalar("nSteps")) : 100;
    if (N < 10)
        throw std::runtime_error(who + ": operation.nSteps must be >= 10");
    const DryingCurve curve = DryingCurve::read(op, who);

    // ---- pricing: the package's own formation surface ------------------------
    //  The SAME calls the plant energy report prices these streams with
    //  (streamH_elements: the fluid on H_stream_formation, the crystals on
    //  their solid formation rung), so the balance this unit solves is the
    //  balance the report checks.  kmol/s x J/mol = kW.
    sVector zWater(n, 0.0);  zWater[iW] = 1.0;
    auto Hsolid = [&](scalar X, scalar T) -> scalar            // kW
    {
        const scalar Fw = X * S / Mv;                          // kmol/s
        scalar H = solidMol * sol.h_formation(T, "solid");
        if (Fw > 0.0) H += Fw * thermo.H_stream_formation(T, P, 0.0, zWater);
        return H;
    };
    auto airComp = [&](scalar Y, scalar& F) -> sVector
    {
        const scalar Fw = Y * G / Mv;
        F = G_mol + Fw;
        sVector z(n, 0.0);
        for (std::size_t i = 0; i < n; ++i) z[i] = yDry[i] * G_mol / F;
        z[iW] += Fw / F;
        return z;
    };
    auto Hair = [&](scalar Y, scalar T) -> scalar              // kW
    {
        scalar F = 0.0;
        const sVector z = airComp(Y, F);
        return F * thermo.H_stream_formation(T, P, 1.0, z);
    };

    // ---- local psychrometry of the air at (T, Y) ------------------------------
    auto cpDry = [&](scalar T) -> scalar                        // J/(kg K)
    {
        scalar cp = 0.0;
        for (std::size_t i = 0; i < n; ++i)
            if (yDry[i] > 0.0) cp += yDry[i] * thermo.comp(i).cpIdealGas().Cp(T);
        return cp / Mc * 1000.0;
    };
    auto Twb = [&](scalar T, scalar Y) -> scalar
    {
        return psychrometry::wetBulb(moist, Mv, Mc, cpDry(T),
                                     moist.cpIdealGas().Cp(T) / Mv * 1000.0,
                                     P, T, Y, who);
    };
    auto Yof = [&](scalar X, scalar Y_end) -> scalar
    {   //  water balance from the solid inlet to the point of moisture X
        return counter ? Y_end - S * (X_in - X) / G : Y_in + S * (X_in - X) / G;
    };

    //  Air temperature from the ENTHALPY balance at a point where the solid
    //  holds X: co-current Hair + Hsolid = H_in; counter-current
    //  Hair - Hsolid = H_ex - Hsolid_in.  The solid sits at the local wet
    //  bulb, which depends on T, so T is found by bisection on the whole
    //  balance.  A candidate T below the air's own saturation is infeasible.
    const scalar T_hi = std::max(T_aIn, T_sIn) + 30.0;
    auto solveT = [&](scalar X, scalar Y, scalar Hconst) -> scalar
    {
        auto g = [&](scalar T) -> scalar
        {
            scalar tw;
            try { tw = Twb(T, Y); }
            catch (const std::exception&) { return -1.0e30; }
            return counter ? Hair(Y, T) - Hsolid(X, tw) - Hconst
                           : Hair(Y, T) + Hsolid(X, tw) - Hconst;
        };
        scalar lo = 274.0, hi = T_hi;
        if (g(hi) < 0.0)
            throw InfeasibleMarch("the air cannot supply the heat this much"
                                  " drying needs");
        if (g(lo) > 0.0)
            throw InfeasibleMarch("no air temperature above 274 K closes the"
                                  " enthalpy balance");
        for (int it = 0; it < 60 && (hi - lo) > 1.0e-7; ++it)
        { const scalar m = 0.5 * (lo + hi); (g(m) >= 0.0 ? hi : lo) = m; }
        const scalar T = 0.5 * (lo + hi);
        if (psychrometry::airWaterActivity(moist, Mv, Mc, P, T, Y, who) >= 1.0)
            throw InfeasibleMarch("the air would be saturated inside the dryer");
        return T;
    };

    //  The local state and rate at moisture X.
    struct Local { scalar Y, T, Tw, Xeq, phi, R; };
    bool xeqAboveXc = false, awCeiling = false;
    auto local = [&](scalar X, scalar Y_end, scalar Hconst) -> Local
    {
        Local L;
        L.Y  = Yof(X, Y_end);
        if (L.Y < 0.0)
            throw InfeasibleMarch("negative air humidity", true);
        L.T  = solveT(X, L.Y, Hconst);
        L.Tw = Twb(L.T, L.Y);
        const scalar Rc = std::max(0.0, kY * (psychrometry::Ysat(moist, Mv, Mc,
                                        P, L.Tw, who) - L.Y));
        const scalar awRaw = psychrometry::airWaterActivity(moist, Mv, Mc, P,
                                                            L.T, L.Y, who);
        const scalar aw = std::min(0.99, awRaw);
        if (awRaw > 0.99) awCeiling = true;
        L.Xeq = psychrometry::gabMoisture(sol, aw, who);
        if (L.Xeq >= X_c)
        {   //  air humid enough that its X_eq reaches X_c: the curve has no
            //  domain; the solid dries at the (vanishing) constant rate while
            //  above X_eq and stops below it -- flagged and announced
            xeqAboveXc = true;
            L.phi = (X > L.Xeq) ? 1.0 : 0.0;
        }
        else
            L.phi = (X - L.Xeq) / (X_c - L.Xeq);
        L.R = (X > L.Xeq) ? Rc * curve.f(L.phi) : 0.0;        // no re-wetting
        return L;
    };

    //  One RK4 march in xi from the solid inlet; returns X at xi = 1 and
    //  fills the profile when asked.
    const scalar H_sIn = Hsolid(X_in, T_sIn);
    const scalar H_aIn = Hair(Y_in, T_aIn);
    struct Row { scalar xi, X, Y, T, Tw, R, phi; };
    auto march = [&](scalar Y_end, scalar Hconst, std::vector<Row>* rows) -> scalar
    {
        const scalar h = 1.0 / N;
        scalar X = X_in;
        auto dXdxi = [&](scalar x) { return -local(x, Y_end, Hconst).R * A / S; };
        for (int k = 0; k <= N; ++k)
        {
            if (rows)
            {
                const Local L = local(X, Y_end, Hconst);
                rows->push_back({ k * h, X, L.Y, L.T, L.Tw, L.R, L.phi });
            }
            if (k == N) break;
            const scalar k1 = dXdxi(X);
            const scalar k2 = dXdxi(std::max(0.0, X + 0.5 * h * k1));
            const scalar k3 = dXdxi(std::max(0.0, X + 0.5 * h * k2));
            const scalar k4 = dXdxi(std::max(0.0, X + h * k3));
            X += h * (k1 + 2.0 * k2 + 2.0 * k3 + k4) / 6.0;
            if (X < 0.0) throw InfeasibleMarch("moisture overshot below zero");
            //  Counter-current air only GAINS water on its way from xi = 1
            //  to xi = 0, so at no ACCEPTED point may it hold less than it
            //  was fed with: a guess implying that assumed too little water.
            //  Tested on accepted states only -- an RK4 stage may sit below
            //  the step's end by O(h), which is arithmetic, not a state --
            //  and to 1e-9 relative, the converged shot's own round-off.
            if (counter && Yof(X, Y_end) < Y_in * (1.0 - 1.0e-9))
                throw InfeasibleMarch("the air would hold less water than it"
                                      " was fed with", true);
        }
        return X;
    };

    //  The equilibrium moisture of the air AS FED: no outlet can go below it.
    const scalar awIn = psychrometry::airWaterActivity(moist, Mv, Mc, P, T_aIn,
                                                       Y_in, who);
    const scalar Xeq_in = psychrometry::gabMoisture(sol, std::min(0.99, awIn), who);
    if (X_c <= Xeq_in)
        throw std::runtime_error(who + ": criticalMoisture X_c = "
            + std::to_string(X_c) + " kg/kg is not above the equilibrium"
            " moisture of the air as fed, X_eq = " + std::to_string(Xeq_in)
            + " kg/kg -- the falling-rate curve has no domain; the air is too"
              " humid for this solid or X_c belongs to another sample");
    if (X_in <= Xeq_in)
        throw std::runtime_error(who + ": the solid enters at X = "
            + std::to_string(X_in) + " kg/kg, not above the equilibrium"
            " moisture of the air as fed (" + std::to_string(Xeq_in)
            + " kg/kg) -- that air would wet it; this unit models drying");

    std::vector<Row> rows;
    scalar X_out = 0.0, Y_ex = 0.0, T_ex = 0.0, T_sOut = 0.0;
    int shots = 0;
    if (!counter)
    {
        const scalar Hconst = H_sIn + H_aIn;
        try { X_out = march(Y_in, Hconst, &rows); }
        catch (const InfeasibleMarch& e)
        {
            throw std::runtime_error(who + ": co-current march failed -- "
                + std::string(e.what()) + ".  More air, hotter air, or less"
                " contact area.");
        }
        Y_ex  = rows.back().Y;   T_ex = rows.back().T;   T_sOut = rows.back().Tw;
    }
    else
    {
        //  The solid leaves at xi = 1, where the air ENTERS: its wet bulb.
        const scalar Tw_in = Twb(T_aIn, Y_in);
        auto shoot = [&](scalar Xo, std::vector<Row>* r) -> scalar
        {
            //  Water and enthalpy over the WHOLE unit fix the exhaust from
            //  the guessed X_out; over [0, xi] they give the air at xi:
            //      Hair(xi) - Hsolid(xi) = H_ex - H_sIn
            const scalar Ye  = Y_in + S * (X_in - Xo) / G;
            const scalar Hex = H_aIn + H_sIn - Hsolid(Xo, Tw_in);
            return march(Ye, Hex - H_sIn, r) - Xo;
        };
        scalar lo = Xeq_in, hi = X_in;
        auto res = [&](scalar Xo) -> scalar
        {
            ++shots;
            try { return shoot(Xo, nullptr); }
            catch (const InfeasibleMarch& e)
            {   //  the sign the mismatch would have had
                return e.tooLittleWater ? -1.0 : 1.0;
            }
        };
        if (res(hi) >= 0.0)
            throw std::runtime_error(who + ": counter-current shooting has no"
                " bracket -- the solid does not dry even with the air as fed");
        for (int it = 0; it < 60 && (hi - lo) > 1.0e-12 * X_in; ++it)
        {
            const scalar m = 0.5 * (lo + hi);
            (res(m) >= 0.0 ? lo : hi) = m;
        }
        X_out = 0.5 * (lo + hi);
        const scalar Ye  = Y_in + S * (X_in - X_out) / G;
        const scalar Hex = H_aIn + H_sIn - Hsolid(X_out, Tw_in);
        try { (void)march(Ye, Hex - H_sIn, &rows); }
        catch (const InfeasibleMarch& e)
        {
            throw std::runtime_error(who + ": counter-current converged shot"
                " is infeasible -- " + std::string(e.what()));
        }
        //  THE EXHAUST IS NOT THE AIR AT xi = 0.  The solid enters at its
        //  own T and is taken to the local wet bulb AT the inlet edge; that
        //  step exchanges heat with the air leaving right there.  So the
        //  exhaust is priced from the balance over the WHOLE unit,
        //  Hair(Y_ex, T_ex) = H_ex, never read off the first profile row
        //  (which is the air just inside the edge).  Reading it off the row
        //  broke the first law by the solid's inlet step (14 kW on
        //  convDryer01, found by the unit's own energy residual).
        Y_ex = Ye;   T_sOut = Tw_in;
        {
            scalar lo = 274.0, hi = std::max(T_aIn, T_sIn) + 30.0;
            if (Hair(Ye, hi) < Hex || Hair(Ye, lo) > Hex)
                throw std::runtime_error(who + ": the exhaust enthalpy has no"
                    " temperature between 274 K and " + std::to_string(hi) + " K");
            for (int it = 0; it < 80 && (hi - lo) > 1.0e-9; ++it)
            { const scalar m = 0.5 * (lo + hi); (Hair(Ye, m) >= Hex ? hi : lo) = m; }
            T_ex = 0.5 * (lo + hi);
        }
    }

    // ---- outlet streams --------------------------------------------------------
    produced_.clear();
    ProcessStream dry;
    dry.name = "drySolid";  dry.T = T_sOut;  dry.P = P;  dry.vf = 0.0;
    dry.F = X_out * S / Mv;
    dry.z.assign(n, 0.0);  if (dry.F > 0.0) dry.z[iW] = 1.0;
    dry.s.assign(n, 0.0);  dry.s[iSol] = solidMol;
    produced_.push_back(dry);

    ProcessStream ex;
    ex.name = "humidExhaust";  ex.T = T_ex;  ex.P = P;  ex.vf = 1.0;
    ex.z = airComp(Y_ex, ex.F);
    produced_.push_back(ex);

    //  The first law, as a self-check on the same surface.
    const scalar residual = (Hsolid(X_out, T_sOut) + Hair(Y_ex, T_ex))
                          - (H_sIn + H_aIn);                           // kW

    // ---- the profile along the contact area -------------------------------------
    UnitProfile prof;
    prof.xAxis = "position";
    for (const auto& r : rows)
    {
        prof.columns["position"].push_back(r.xi);
        prof.columns["X_kg_kg"].push_back(r.X);
        prof.columns["Y_kg_kg"].push_back(r.Y);
        prof.columns["T_gas_K"].push_back(r.T);
        prof.columns["T_solid_K"].push_back(r.Tw);
        prof.columns["R_kg_m2_s"].push_back(r.R);
        prof.columns["Phi"].push_back(std::min(1.0, r.phi));
    }
    profile_ = prof;

    scalar xiCrit = -1.0;
    for (std::size_t k = 1; k < rows.size(); ++k)
        if (rows[k - 1].X > X_c && rows[k].X <= X_c)
        {
            const scalar w = (rows[k - 1].X - X_c) / (rows[k - 1].X - rows[k].X);
            xiCrit = rows[k - 1].xi + w * (rows[k].xi - rows[k - 1].xi);
        }

    kpis_.clear();
    kpis_["X_initial"]          = X_in;
    kpis_["X_final"]            = X_out;
    kpis_["X_equilibrium_inlet_air"] = Xeq_in;
    kpis_["X_critical"]         = X_c;
    kpis_["water_removed_kg_s"] = S * (X_in - X_out);
    kpis_["T_air_out"]          = T_ex;
    kpis_["T_solid_out"]        = T_sOut;
    kpis_["Y_air_in"]           = Y_in;
    kpis_["Y_air_out"]          = Y_ex;
    kpis_["energyResidual_kW"]  = residual;
    if (xiCrit >= 0.0) kpis_["position_critical"] = xiCrit;
    if (counter) kpis_["shootingEvaluations"] = shots;

    if (verbosity >= 1)
    {
        const std::string tag = "  [" + who + "] ";
        std::cout << std::fixed
                  << tag << flow << " over A = " << std::setprecision(2) << A
                  << " m2, k_Y = " << std::setprecision(4) << kY
                  << " kg/(m2 s); solid '" << sol.name() << "' "
                  << std::setprecision(4) << S << " kg/s dry at X = "
                  << X_in << " kg/kg; air " << G << " kg/s dry at "
                  << std::setprecision(2) << T_aIn << " K, Y = "
                  << std::setprecision(5) << Y_in << " kg/kg\n"
                  << tag << "falling rate: "
                  << (curve.shape() == DryingCurve::Shape::linear
                        ? std::string("LINEAR in the free moisture (a MODELLING"
                                      " CHOICE)")
                        : "characteristic curve " + curve.shapeName()
                          + " (van Meel 1958), source: " + curve.source())
                  << "; X_c = " << std::setprecision(4) << X_c
                  << " kg/kg MEASURED, X_eq read at the LOCAL air (GAB)\n"
                  << tag << "HYPOTHESES: the solid at the LOCAL wet bulb in"
                     " both periods (its falling-rate warm-up NOT modelled);"
                     " Lewis = 1; one k_Y over the whole area; no axial"
                     " mixing; no re-wetting; adiabatic; the bound moisture"
                     " priced as liquid water (no heat of sorption)\n"
                  << tag << (nDeclared ? "nSteps declared: " : "nSteps DEFAULT: ")
                  << N << " RK4 steps along the area"
                  << (counter ? ", counter-current shooting on X_out: "
                              + std::to_string(shots) + " marches" : std::string())
                  << "\n"
                  << tag << "X: " << std::setprecision(5) << X_in << " -> "
                  << X_out << " kg/kg (floor of the air as fed: " << Xeq_in
                  << "); air " << std::setprecision(2) << T_aIn << " -> "
                  << T_ex << " K, Y " << std::setprecision(5) << Y_in << " -> "
                  << Y_ex << "; first law on the package surface: "
                  << std::scientific << std::setprecision(3) << residual
                  << " kW\n";
        if (xeqAboveXc)
            std::cout << tag << "NOTE: somewhere along the area the air is humid"
                         " enough that its X_eq reaches X_c -- the curve has no"
                         " domain there; the solid dries at the (vanishing)"
                         " constant rate above X_eq and stops below it\n";
        if (awCeiling)
            std::cout << tag << "NOTE: the local air reached a_w > 0.99 -- the"
                         " GAB isotherm is read at the 0.99 ceiling there\n";
        std::cout.unsetf(std::ios::floatfield);
    }
    return 0;
}

} // namespace Choupo
