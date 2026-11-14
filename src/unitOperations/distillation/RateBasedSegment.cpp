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
    The rate-based packed segment, `model rateBased;` (slice B1 of DEV.md
    4c C329 part 2).  The equations, their count and the structure are in
    RateBasedSegment.H; the derivation is the Theory Guide's section "The
    rate-based packed segment" (\label{sec:rateBasedSegment}).  This file
    reads the case, builds the residual, solves it, and reports.

    THE NEWTON NEVER SEES A CORRELATION.  The film coefficients, the
    effective area, the heat-transfer coefficients and the pressure profile
    are evaluated on a converged profile and held FIXED inside the next
    Newton (an outer fixed point, announced with its count), exactly as the
    record's coupling C1 prescribes for the computed tray efficiency: the
    packing model's holdup is itself an implicit solve, and a nested solve
    under a finite-difference Jacobian is noise.
\*---------------------------------------------------------------------------*/

#include "DistillationColumn.H"
#include "RateBasedSegment.H"
#include "PackingRBF.H"
#include "PackingDelft.H"
#include "TrayHydraulics.H"
#include "core/Constants.H"
#include "core/PropertySourceLog.H"
#include "core/RegistryRefusal.H"
#include "result/ClosureVariable.H"
#include "solver/NewtonND.H"
#include "thermo/LiquidPropertyDoor.H"
#include "thermo/SaturationCurves.H"
#include "thermo/activityCoefficient/ActivityModel.H"
#include "thermo/equationOfState/EquationOfState.H"
#include "thermo/transport/WilkeChang.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <limits>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

namespace {

//  What the packing model gives for one segment, evaluated on a converged
//  profile and then held fixed through the next Newton.
struct SegmentCoefficients
{
    scalar betaV = 0.0, betaL = 0.0;   // c k a_e A dz / V_ref        [-]
    scalar gamV  = 0.0, gamL  = 0.0;   // h a_e A dz / V_ref          [J/(mol K)]
    scalar dP    = 0.0;                // Pa/m
    scalar m     = 0.0;                // slope of the equilibrium line at xbar
    scalar HG = 0.0, HL = 0.0, HOG = 0.0;  // m, at this segment's own loads
    scalar F  = 0.0, uL = 0.0, aeOverAp = 0.0, holdup = 0.0, flood = 0.0;
    scalar DLlinear = 0.0, DLvignes = 0.0;
};

scalar relChange(scalar a, scalar b)
{
    const scalar s = std::max({std::abs(a), std::abs(b), 1.0e-300});
    return std::abs(a - b) / s;
}

} // namespace

// ===========================================================================
//   `model rateBased;` -- see RateBasedSegment.H for the model.
// ===========================================================================
int DistillationColumn::solveRateBased(const DictPtr& dict,
                                       const ThermoPackage& thermo,
                                       int verbosity)
{
    auto operDict = dict->subDict("operation");
    const std::string unit = dict->name();
    const std::size_t n = thermo.n();
    const std::string who = "DistillationColumn '" + unit + "' (model rateBased): ";

    //  ---- WHAT SLICE B1 IS NOT, refused by name with the slice that is ----
    for (const char* k : {"feed", "inputStreams", "reaction"})
        if (dict->found(k))
            throw std::runtime_error(who + "`" + k + "` -- this slice is a packed"
                " bed at TOTAL reflux, with no feed and no products.  A feed on the"
                " rate-based segments is slice B3 (DEV.md 4c C329 part 2); for a"
                " column with a feed today select `model fullMESH;`.");
    for (const char* k : {"feeds", "sideDraws", "refluxRatio", "distillateRate",
                          "distillateRecovery", "bottomsRate", "boilupRatio", "feedStage"})
        if (operDict->found(k))
            throw std::runtime_error(who + "`" + k + "` -- this slice is TOTAL"
                " reflux (declared by `totalReflux { fFactor; specifiedAt reboiler;"
                " composition {} }`); a reflux ratio and products on the rate-based"
                " segments are slice B3.  Remove the key, or select `model"
                " fullMESH;` for a general reflux on equilibrium stages.");
    for (const char* k : {"nStages", "murphreeEfficiency", "efficiency", "hydraulics"})
        if (operDict->found(k))
            throw std::runtime_error(who + "`" + k + "` belongs to a TRAY column;"
                " rate-based trays are slice B2.  This slice is a packed bed,"
                " declared by `packing {}` alone (the tray efficiency from the"
                " internals is `model totalReflux;` with `efficiency {}`).");
    if (!operDict->found("packing"))
        throw std::runtime_error(who + "no `packing {}` block.  This slice is a"
            " packed bed: declare the packing (diameter, height, specificArea,"
            " voidFraction, corrugationAngle and the geometry its model reads),"
            " as `model totalReflux;` reads it.");
    if (n != 2)
        throw std::runtime_error(who + "the package holds " + std::to_string(n)
            + " components; this slice is a BINARY.  Three or more components"
              " need the Maxwell-Stefan film with the liquid's thermodynamic"
              " factor (slice B4); an effective-diffusivity shortcut is not"
              " offered (design record, section 7.2, decision 2).");
    if (thermo.hasReactiveEquilibrium())
        throw std::runtime_error(who + "the package resolves reactive"
            " equilibrium; a reacting film is not in this slice.");
    if (thermo.hasEos() && !thermo.eos().isIdeal())
        throw std::runtime_error(who + "the vapour is not an ideal gas (the"
            " package declares a non-ideal equation of state).  The interface energy"
            " balance prices each flux at its partial molar enthalpy, and this"
            " slice takes it as the pure component's, which is exact for an"
            " ideal-gas vapour only.  Declare `fugacityModel idealGas;`, or use"
            " `model totalReflux;`.");
    if (!thermo.hasActivity() || thermo.activity().modelName() != "ideal")
        throw std::runtime_error(who + "the liquid is not an ideal solution"
            " (activity model `" + (thermo.hasActivity() ? thermo.activity().modelName()
                                                          : std::string("none"))
            + "`).  The liquid film needs the FICK diffusivity at finite"
              " concentration, D = D_MS * Gamma, and the package gives neither"
              " the thermodynamic factor Gamma nor a finite-concentration D_MS;"
              " for an ideal solution Gamma = 1 exactly and the infinite-"
              "dilution values suffice (announced).  The thermodynamic factor"
              " is slice B4.  Use `model totalReflux;` with `packing {}`.");
    {
        const std::string ctype = operDict->found("condenser")
            ? operDict->subDict("condenser")->lookupWordOrDefault("type", "total") : "total";
        if (ctype != "total")
            throw std::runtime_error(who + "total reflux is modelled with a TOTAL"
                " condenser (`condenser { type total; }`).");
    }

    //  ---- The limit, a declared check mode ---------------------------------
    const std::string limitWord = operDict->lookupWordOrDefault("limit", "none");
    if (limitWord != "none" && limitWord != "transferUnits")
        throw std::runtime_error(who + registryRefusal::message("rate-based limit",
            limitWord, {"transferUnits"}, "Accepted")
            + "  (Omit the key for the rate-based model itself.)");
    const bool limitMode = (limitWord == "transferUnits");

    //  ---- Specification: identical to the transfer-unit bed's ------------
    const scalar Ptop = operDict->lookupScalar("P", Dims::pressure);
    auto tr = operDict->subDict("totalReflux");
    if (tr->lookupWordOrDefault("specifiedAt", "reboiler") != "reboiler")
        throw std::runtime_error(who + registryRefusal::message(
            "total-reflux composition location",
            tr->lookupWordOrDefault("specifiedAt", "reboiler"), {"reboiler"}, "Accepted"));
    sVector xN(n, 0.0);
    {
        auto comp = tr->subDict("composition");
        scalar s = 0.0;
        for (const auto& key : comp->keys())
        { const std::size_t i = thermo.indexOf(key); xN[i] = comp->lookupScalar(key); s += xN[i]; }
        if (!(s > 0.0))
            throw std::runtime_error(who + "totalReflux.composition is empty");
        for (auto& v : xN) v /= s;
    }
    if (!tr->found("fFactor") || tr->found("boilupRate"))
        throw std::runtime_error(who + "the boil-up is declared as `fFactor` (the"
            " reboiler vapour on the tower area), and only that.");
    const scalar Fspec = tr->lookupScalar("fFactor");

    auto pk = operDict->subDict("packing");
    const bool modelDeclared = pk->found("model");
    const std::string pmodel = pk->lookupWordOrDefault("model", "RochaBravoFair");
    if (pmodel != "RochaBravoFair" && pmodel != "Delft")
        throw std::runtime_error(who + "no mass-transfer correlation for this"
            " packing: " + registryRefusal::message("packing model", pmodel,
                {"RochaBravoFair", "Delft"}, "Accepted")
            + "  Both are corrugated STRUCTURED packings; a random packing has no"
              " correlation in the engine.");
    const bool delft = (pmodel == "Delft");
    const scalar Dcol = pk->lookupScalar("diameter", Dims::length);
    const scalar Hbed = pk->lookupScalar("height", Dims::length);
    PackingRBF::Geometry pg;
    PackingDelft::Geometry dg;
    pg.ap    = pk->lookupScalar("specificArea");
    pg.eps   = pk->lookupScalar("voidFraction");
    pg.theta = pk->lookupScalar("corrugationAngle") * constant::pi / 180.0;
    if (delft)
    {
        dg.ap = pg.ap; dg.eps = pg.eps; dg.alpha = pg.theta;
        dg.b   = pk->lookupScalar("corrugationBase", Dims::length);
        dg.h   = pk->lookupScalar("corrugationHeight", Dims::length);
        dg.hpe = pk->lookupScalar("elementHeight", Dims::length);
        dg.hpb = Hbed; dg.dc = Dcol;
        dg.Omega = pk->lookupScalarOrDefault("holeFraction", 0.0);
    }
    else
    {
        pg.S = pk->lookupScalar("corrugationSide", Dims::length);
        const std::string surf = pk->lookupWordOrDefault("surface", "gauze");
        if (surf != "gauze" && surf != "sheetMetal")
            throw std::runtime_error(who + registryRefusal::message("packing surface",
                surf, {"gauze", "sheetMetal"}, "Accepted"));
        pg.gauze = (surf == "gauze");
        if (!pg.gauze) pg.FSE = pk->lookupScalar("surfaceEnhancement");
    }
    const std::size_t lk = pk->found("lightKey") ? thermo.indexOf(pk->lookupWord("lightKey")) : 0;
    const std::size_t hk = 1 - lk;
    const scalar muLdecl = pk->found("liquidViscosity")
        ? pk->lookupScalar("liquidViscosity", Dims::viscosity) : 0.0;
    if (!(muLdecl > 0.0) && !thermo.hasLiquidViscosity())
        throw std::runtime_error(who + "the packing model needs a liquid"
            " viscosity -- a liquidViscosity model in the package or a measured"
            " `liquidViscosity <Pa s>;` in `packing {}`.");
    if (!thermo.hasTransport() || !thermo.hasDiffusivity() || !thermo.hasSurfaceTension())
        throw std::runtime_error(who + "the packing model needs the vapour"
            " viscosity and diffusivity and the surface tension from the package"
            " (`transport {}`).");
    if (!limitMode && (!thermo.hasThermalConductivity() || !thermo.hasLiquidConductivity()))
        throw std::runtime_error(who + "the film heat-transfer coefficients need"
            " the thermal conductivity of BOTH phases: add `transport { vapour {"
            " thermalConductivity { model Eucken; } } liquid { thermalConductivity"
            " { model SatoRiedel; } } }` (or the models the components support).");
    const int Mdecl = static_cast<int>(pk->lookupScalarOrDefault("segments", 100.0));
    if (Mdecl < rateBased::minSegments)
        throw std::runtime_error(who + "`segments " + std::to_string(Mdecl) + "` is below"
            " the minimum of " + std::to_string(rateBased::minSegments)
            + " segments this model accepts; declare at least that many (the run"
              " also solves the bed on half the segments, prints both answers,"
              " and refuses a count whose measured error estimate exceeds 1 %).");

    const scalar A_T = 0.25 * constant::pi * Dcol * Dcol;
    //  M and dz change once: the bed is solved on Mdecl/2 segments first (the
    //  companion solve that MEASURES the discretisation error), then on Mdecl.
    int    M  = Mdecl / 2;
    scalar dz = Hbed / M;
    const rateBased::SegmentLayout lay{n};
    const std::size_t B = lay.block();
    const WilkeChang wilkeChang(nullptr);

    //  ---- Thermodynamic helpers (one package, one surface) ----------------
    auto normalised = [&](const sVector& z)
    {
        sVector o(z); scalar s = 0.0;
        for (auto v : o) s += v;
        if (s > 0.0) for (auto& v : o) v /= s;
        return o;
    };
    auto composition = [&](scalar zlk)
    { sVector v(n, 0.0); v[lk] = zlk; v[hk] = 1.0 - zlk; return v; };
    auto MWof = [&](const sVector& z)
    { scalar m = 0.0; for (std::size_t i = 0; i < n; ++i) m += z[i] * thermo.comp(i).MW(); return m; };
    bool bubbleFailed = false;
    auto bubble = [&](const sVector& xl, scalar P, scalar Tg)
    {
        bool ok = true;
        const scalar T = bubbleT(thermo, normalised(xl), P, Tg, 1.0e-12, nullptr, &ok);
        if (!ok) bubbleFailed = true;
        return T;
    };
    auto Kat = [&](scalar T, scalar P, const sVector& xl, const sVector& yv)
    { return thermo.Kvec(T, P, normalised(xl), normalised(yv)); };
    auto eqVap = [&](const sVector& xl, scalar T, scalar P)
    {
        const sVector K = Kat(T, P, xl, xl);
        sVector y(n, 0.0); scalar s = 0.0;
        for (std::size_t i = 0; i < n; ++i) { y[i] = K[i] * xl[i]; s += y[i]; }
        for (auto& v : y) v /= s;
        return y;
    };
    //  [J/mol of the amounts in z], a vapour or a liquid priced on the
    //  formation datum the streams use, at its own composition.
    auto hV = [&](const sVector& z, scalar T, scalar P)
    {
        scalar s = 0.0; for (auto v : z) s += v;
        return s * thermo.H_stream_formation(T, P, 1.0, normalised(z));
    };
    auto hL = [&](const sVector& z, scalar T, scalar P)
    {
        scalar s = 0.0; for (auto v : z) s += v;
        return s * thermo.H_stream_formation(T, P, 0.0, normalised(z));
    };
    //  The partial molar enthalpies at the interface: the pure components'
    //  (exact for an ideal-gas vapour and an ideal-solution liquid, the only
    //  phases this slice accepts).
    std::vector<sVector> unitVec(n, sVector(n, 0.0));
    for (std::size_t i = 0; i < n; ++i) unitVec[i][i] = 1.0;
    try
    {
        (void)hV(xN, 350.0, Ptop);
        (void)hL(xN, 350.0, Ptop);
    }
    catch (const std::exception& e)
    {
        throw std::runtime_error(who + "the components carry no formation"
            " enthalpy the energy balances can be written on (" + std::string(e.what())
            + "); add the `standardThermochemistry` block to their records.");
    }
    //  The slope of the equilibrium line at a liquid of light-key fraction
    //  xlk, by the central difference the transfer-unit bed uses.
    auto ystarAndSlope = [&](scalar xlk, scalar P, scalar Tg, scalar& ys, scalar& m)
    {
        const sVector xx = composition(xlk);
        const scalar Tb = bubble(xx, P, Tg);
        ys = eqVap(xx, Tb, P)[lk];
        const scalar h = std::min({1.0e-4, 0.5 * xlk, 0.5 * (1.0 - xlk)});
        auto ysOf = [&](scalar xv) { const sVector q = composition(xv);
            return eqVap(q, bubble(q, P, Tb), P)[lk]; };
        m = (h > 0.0) ? (ysOf(xlk + h) - ysOf(xlk - h)) / (2.0 * h) : 1.0;
        return Tb;
    };

    //  ---- The reboiler: an equilibrium stage at the bed's bottom pressure --
    struct Reboiler { scalar P = 0.0, T = 0.0, V = 0.0; sVector y; };
    auto reboilerAt = [&](scalar Pb, scalar Tg)
    {
        Reboiler r;
        r.P = Pb;
        r.T = bubble(xN, Pb, Tg);
        r.y = eqVap(xN, r.T, Pb);
        const scalar rhoV = thermo.density(r.T, Pb, r.y, DensityPhase::Vapour);
        r.V = Fspec * A_T * std::sqrt(rhoV) / MWof(r.y);       // kmol/s
        return r;
    };

    std::vector<scalar> Pface(M + 1, Ptop);
    Reboiler reb = reboilerAt(Ptop, 350.0);
    const scalar Vref = reb.V;
    const scalar lamRef = hV(reb.y, reb.T, Ptop) - hL(reb.y, reb.T, Ptop);

    //  ---- The coefficients of one segment at its mid-state ----------------
    auto coefficientsAt = [&](const sVector& ym, const sVector& xm, scalar TVm,
                              scalar TLm, scalar vm, scalar lm, scalar Pm)
    {
        SegmentCoefficients c;
        const sVector yv = normalised(ym), xl = normalised(xm);
        const scalar rhoG = thermo.density(TVm, Pm, yv, DensityPhase::Vapour);
        const scalar rhoL = TrayHydraulics::liquidDensity(thermo, TLm, Pm, xl).rho;
        const scalar MV = MWof(yv), ML = MWof(xl);
        PackingRBF::State st;
        st.UGs = vm * Vref * MV / (rhoG * A_T);
        st.ULs = lm * Vref * ML / (rhoL * A_T);
        st.rhoG = rhoG; st.rhoL = rhoL;
        st.muG = thermo.viscosityGas(TVm, yv);
        st.muL = (muLdecl > 0.0) ? muLdecl
            : liquidProperty::evaluate(thermo, liquidProperty::Property::viscosity, TLm, Pm, xl).value;
        st.sigma = liquidProperty::evaluate(thermo, liquidProperty::Property::surfaceTension, TLm, Pm, xl).value;
        st.DG = thermo.diffusivityGas(TVm, Pm, 0, 1);
        const scalar D01 = wilkeChang.diffusivityLiquidBinary(thermo.comp(0), thermo.comp(1), TLm, st.muL);
        const scalar D10 = wilkeChang.diffusivityLiquidBinary(thermo.comp(1), thermo.comp(0), TLm, st.muL);
        //  The transfer-unit bed's rule (linear in x between the two
        //  infinite-dilution values); Vignes's logarithmic rule beside it,
        //  measured and printed, never used.
        st.DL = xl[0] * D10 + xl[1] * D01;
        c.DLlinear = st.DL;
        c.DLvignes = std::pow(D10, xl[0]) * std::pow(D01, xl[1]);
        PropertySourceLog::instance().useHere("liquidDiffusivity", liquidSource::ownWilkeChang, "own", took(st.DL, TLm, Pm));
        if (muLdecl > 0.0)
            PropertySourceLog::instance().useHere("liquidViscosity", liquidSource::declaredByCase, "declared", took(muLdecl));
        scalar ys = 0.0;
        (void)ystarAndSlope(xl[lk], Pm, TLm, ys, c.m);
        st.lambda = c.m * vm / lm;
        const PackingRBF::Result r = delft ? PackingDelft::evaluate(dg, st)
                                           : PackingRBF::evaluate(pg, st);
        if (r.flooded)
        {
            std::ostringstream o;
            o << who << "the packed bed FLOODS (no Rocha-Bravo-Fair holdup below "
              << pg.dPflood << " Pa/m) at F = " << st.UGs * std::sqrt(rhoG)
              << " (m/s)(kg/m3)^0.5, P = " << Pm * 1.0e-5 << " bar.";
            throw std::runtime_error(o.str());
        }
        const scalar cG = rhoG / MV, cL = rhoL / ML;           // kmol/m3
        c.betaV = cG * r.kG * r.ae * A_T * dz / Vref;
        c.betaL = cL * r.kL * r.ae * A_T * dz / Vref;
        c.dP = r.dP;
        c.HG = r.HG; c.HL = r.HL; c.HOG = r.HG + st.lambda * r.HL;
        c.F = st.UGs * std::sqrt(rhoG);
        c.uL = st.ULs * 3600.0;
        c.aeOverAp = r.ae / pg.ap;
        c.holdup = r.hL;
        c.flood = r.dP / pg.dPflood;
        if (!limitMode)
        {
            //  THE HEAT/MASS-TRANSFER ANALOGY on the same films.  Vapour: the
            //  coefficient is a Sherwood correlation Sh ~ Re^a Sc^(1/3), so
            //  the same correlation for heat (Nu ~ Re^a Pr^(1/3)) gives
            //  h_G = k_G (rho c_p)_G (alpha_G / D_G)^(2/3).  Liquid: the
            //  coefficient is penetration theory, k_L = 2 (D_L/(pi t))^0.5, so
            //  the same contact time gives h_L = k_L (rho c_p)_L (alpha_L/D_L)^(1/2).
            const scalar dT = 0.05;
            const scalar cpV = (thermo.H_stream_formation(TVm + dT, Pm, 1.0, yv)
                              - thermo.H_stream_formation(TVm - dT, Pm, 1.0, yv)) / (2.0 * dT);
            const scalar cpL = (thermo.H_stream_formation(TLm + dT, Pm, 0.0, xl)
                              - thermo.H_stream_formation(TLm - dT, Pm, 0.0, xl)) / (2.0 * dT);
            const scalar lamG = thermo.thermalConductivityGas(TVm, yv);
            const scalar lamL = thermo.thermalConductivityLiquid(TLm, xl);
            const scalar rcpG = cG * 1000.0 * cpV, rcpL = cL * 1000.0 * cpL;   // J/(m3 K)
            const scalar hGc = r.kG * rcpG * std::pow(lamG / rcpG / st.DG, 2.0 / 3.0);
            const scalar hLc = r.kL * rcpL * std::sqrt(lamL / rcpL / st.DL);
            //  W/K per (kmol/s) of V_ref = J/(kmol K); /1000 -> J/(mol K).
            c.gamV = hGc * r.ae * A_T * dz / (Vref * 1000.0);
            c.gamL = hLc * r.ae * A_T * dz / (Vref * 1000.0);
        }
        return c;
    };

    //  ---- The state of segment k's inlets and its mid-state ---------------
    struct Mid
    {
        sVector yin, xin, ym, xm;
        scalar TVin = 0.0, TLin = 0.0, vin = 0.0, lin = 0.0;
        scalar TVm = 0.0, TLm = 0.0, vm = 0.0, lm = 0.0;
        scalar PVin = 0.0, PLin = 0.0;           // the faces the inlets are priced at
    };
    auto midOf = [&](const sVector& X, int k, bool needRefluxT)
    {
        Mid s;
        const std::size_t b = static_cast<std::size_t>(k) * B;
        if (k == M - 1)
        { s.yin = reb.y; s.TVin = reb.T; s.vin = reb.V / Vref; s.PVin = Pface[M]; }
        else
        {
            const std::size_t bn = b + B;
            s.yin.assign(X.begin() + bn + lay.y(), X.begin() + bn + lay.y() + n);
            s.TVin = X[bn + lay.TV()]; s.vin = X[bn + lay.v()]; s.PVin = Pface[k + 1];
        }
        if (k == 0)
        {
            //  THE TOTAL CONDENSER: the reflux is the top vapour, returned at
            //  its bubble point at the declared top pressure, L_0 = V_0.
            s.xin.assign(X.begin() + lay.y(), X.begin() + lay.y() + n);
            s.lin = X[lay.v()];
            s.TLin = needRefluxT ? bubble(s.xin, Ptop, X[lay.TV()]) : X[lay.TL()];
            s.PLin = Ptop;
        }
        else
        {
            const std::size_t bp = b - B;
            s.xin.assign(X.begin() + bp + lay.x(), X.begin() + bp + lay.x() + n);
            s.TLin = X[bp + lay.TL()]; s.lin = X[bp + lay.l()]; s.PLin = Pface[k];
        }
        s.ym.resize(n); s.xm.resize(n);
        for (std::size_t i = 0; i < n; ++i)
        {
            s.ym[i] = 0.5 * (s.yin[i] + X[b + lay.y() + i]);
            s.xm[i] = 0.5 * (s.xin[i] + X[b + lay.x() + i]);
        }
        s.TVm = 0.5 * (s.TVin + X[b + lay.TV()]);
        s.TLm = 0.5 * (s.TLin + X[b + lay.TL()]);
        s.vm  = 0.5 * (s.vin + X[b + lay.v()]);
        s.lm  = 0.5 * (s.lin + X[b + lay.l()]);
        return s;
    };

    std::vector<SegmentCoefficients> coef(M);

    //  ---- THE RESIDUAL: 5n + 5 rows per segment (RateBasedSegment.H) ------
    auto residual = [&](const sVector& X)
    {
        sVector R(X.size(), 0.0);
        for (int k = 0; k < M; ++k)
        {
            const std::size_t b = static_cast<std::size_t>(k) * B;
            const Mid s = midOf(X, k, true);
            const SegmentCoefficients& c = coef[k];
            const scalar Pm = 0.5 * (Pface[k] + Pface[k + 1]);
            const scalar* y  = &X[b + lay.y()];
            const scalar* x  = &X[b + lay.x()];
            const scalar* yI = &X[b + lay.yI()];
            const scalar* xI = &X[b + lay.xI()];
            const scalar* w  = &X[b + lay.w()];
            const scalar TV = X[b + lay.TV()], TL = X[b + lay.TL()], TI = X[b + lay.TI()];
            const scalar v = X[b + lay.v()], l = X[b + lay.l()];
            scalar wt = 0.0, sy = 0.0, sx = 0.0, syI = 0.0, sxI = 0.0;
            for (std::size_t i = 0; i < n; ++i)
            { wt += w[i]; sy += y[i]; sx += x[i]; syI += yI[i]; sxI += xI[i]; }
            std::size_t r = b;
            //  Bulk component balances (2n).
            for (std::size_t i = 0; i < n; ++i) R[r++] = v * y[i] - s.vin * s.yin[i] - w[i];
            for (std::size_t i = 0; i < n; ++i) R[r++] = l * x[i] - s.lin * s.xin[i] + w[i];
            //  Summations of the bulk (2).
            R[r++] = sy - 1.0;
            R[r++] = sx - 1.0;
            //  Interface equilibrium (n).
            const sVector yIv(yI, yI + n), xIv(xI, xI + n);
            if (!limitMode)
            {
                const sVector K = Kat(TI, Pm, xIv, yIv);
                for (std::size_t i = 0; i < n; ++i) R[r++] = yI[i] - K[i] * xI[i];
            }
            else
            {
                //  THE LIMIT: linear over the segment about the bulk liquid,
                //  and T_I the bubble point of the interface liquid.
                scalar ys = 0.0, m = 0.0;
                (void)ystarAndSlope(s.xm[lk], Pm, s.TLm, ys, m);
                const sVector K = Kat(TI, Pm, xIv, xIv);
                scalar sKx = 0.0;
                for (std::size_t i = 0; i < n; ++i) sKx += K[i] * xI[i];
                for (std::size_t i = 0; i < n; ++i)
                    R[r++] = (i == lk) ? yI[lk] - (ys + m * (xI[lk] - s.xm[lk])) : sKx - 1.0;
            }
            //  Summations at the interface (2).
            R[r++] = syI - 1.0;
            R[r++] = sxI - 1.0;
            //  The two films (n - 1 each; binary: the light key).
            R[r++] = w[lk] - (c.betaV * (yI[lk] - s.ym[lk]) + 0.5 * (yI[lk] + s.ym[lk]) * wt);
            R[r++] = w[lk] - (c.betaL * (s.xm[lk] - xI[lk]) + 0.5 * (xI[lk] + s.xm[lk]) * wt);
            //  Energy (3).
            if (!limitMode)
            {
                scalar eV = c.gamV * (TI - s.TVm), eL = c.gamL * (s.TLm - TI);
                for (std::size_t i = 0; i < n; ++i)
                {
                    eV += w[i] * thermo.H_stream_formation(TI, Pm, 1.0, unitVec[i]);
                    eL += w[i] * thermo.H_stream_formation(TI, Pm, 0.0, unitVec[i]);
                }
                const sVector yo(y, y + n), xo(x, x + n);
                R[r++] = (v * hV(yo, TV, Pface[k]) - s.vin * hV(s.yin, s.TVin, s.PVin) - eV) / lamRef;
                R[r++] = (l * hL(xo, TL, Pface[k + 1]) - s.lin * hL(s.xin, s.TLin, s.PLin) + eL) / lamRef;
                R[r++] = (eV - eL) / lamRef;
            }
            else
            {
                //  THE LIMIT: each bulk at the saturation temperature of its
                //  own composition (the transfer-unit bed's section), and
                //  equimolar counter-diffusion.
                const sVector yo(y, y + n), xo(x, x + n);
                const sVector KV = Kat(TV, Pface[k], yo, yo);
                const sVector KL = Kat(TL, Pface[k + 1], xo, xo);
                scalar sV = 0.0, sL = 0.0;
                for (std::size_t i = 0; i < n; ++i) { sV += KV[i] * y[i]; sL += KL[i] * x[i]; }
                R[r++] = sV - 1.0;
                R[r++] = sL - 1.0;
                R[r++] = wt;
            }
        }
        return R;
    };

    sVector X;
    int passes = 0, newtonIts = 0;
    scalar offBand = std::numeric_limits<scalar>::quiet_NaN();
    int auditedAt = 0;
    const scalar newtonTol = 1.0e-11;

    //  ---- Coefficients and the pressure profile from a profile ------------
    auto evaluateAll = [&](const sVector& Xs, std::vector<SegmentCoefficients>& cs,
                           std::vector<scalar>& Pf)
    {
        cs.assign(M, SegmentCoefficients{});
        //  The bed's pressure falls upward by its own drop; the TOP is the
        //  declared pressure, so the faces are built from the top down.
        std::vector<scalar> Pnew(M + 1, Ptop);
        for (int k = 0; k < M; ++k)
        {
            const Mid s = midOf(Xs, k, true);
            cs[k] = coefficientsAt(s.ym, s.xm, s.TVm, s.TLm, s.vm, s.lm,
                                   0.5 * (Pf[k] + Pf[k + 1]));
            Pnew[k + 1] = Pnew[k] + dz * cs[k].dP;
        }
        Pf = Pnew;
    };

    //  ---- ONE SOLVE OF THE BED on the current M ---------------------------
    auto solveBed = [&]()
    {
        Pface.assign(M + 1, Ptop);
        reb = reboilerAt(Ptop, reb.T);
        //  ---- THE SEED: a crude transfer-unit march at the top pressure, with
        //  the coefficients of the reboiler's vapour on every segment -----------
        X.assign(static_cast<std::size_t>(M) * B, 0.0);
        {
            const SegmentCoefficients c0 = coefficientsAt(reb.y, reb.y, reb.T, reb.T, 1.0, 1.0, Ptop);
            std::vector<scalar> yface(M + 1);
            yface[M] = reb.y[lk];
            scalar Tg = reb.T;
            for (int k = M - 1; k >= 0; --k)
            {
                scalar ys = 0.0, m = 0.0;
                Tg = ystarAndSlope(yface[k + 1], Ptop, Tg, ys, m);
                const scalar rr = 1.0 / (1.0 / c0.betaV + c0.m / c0.betaL);
                yface[k] = std::min(0.999999, yface[k + 1] + rr * (ys - yface[k + 1]));
            }
            for (int k = 0; k < M; ++k)
            {
                const std::size_t b = static_cast<std::size_t>(k) * B;
                const sVector yk = composition(yface[k]), xk = composition(yface[k + 1]);
                const sVector xm = composition(0.5 * (yface[k] + yface[k + 1]));
                const scalar TVk = bubble(yk, Ptop, reb.T), TLk = bubble(xk, Ptop, reb.T);
                scalar ys = 0.0, m = 0.0;
                const scalar Tm = ystarAndSlope(xm[lk], Ptop, reb.T, ys, m);
                const scalar wl = (ys - xm[lk]) / (1.0 / c0.betaV + m / c0.betaL);
                const sVector yI = composition(xm[lk] + wl / c0.betaV);
                const sVector xI = composition(xm[lk] - wl / c0.betaL);
                for (std::size_t i = 0; i < n; ++i)
                {
                    X[b + lay.y() + i] = yk[i];  X[b + lay.x() + i] = xk[i];
                    X[b + lay.yI() + i] = yI[i]; X[b + lay.xI() + i] = xI[i];
                }
                X[b + lay.w() + lk] = wl; X[b + lay.w() + hk] = -wl;
                X[b + lay.TV()] = TVk; X[b + lay.TL()] = TLk;
                X[b + lay.TI()] = bubble(xI, Ptop, Tm);
                X[b + lay.v()] = 1.0; X[b + lay.l()] = 1.0;
            }
        }

        //  ---- THE OUTER FIXED POINT around the Newton ------------------------
        evaluateAll(X, coef, Pface);
        reb = reboilerAt(Pface[M], reb.T);
        const std::size_t nUnknowns = static_cast<std::size_t>(M) * B;
        passes = 0;
        scalar lastChange = std::numeric_limits<scalar>::infinity();
        const int maxPasses = 60;
        for (; passes < maxPasses; )
        {
            ++passes;
            solver::NDOptions o;
            o.tolerance = newtonTol;
            o.maxIter   = 80;
            o.globalisation = solver::Globalisation::armijo;
            o.blockTri.nBlocks   = static_cast<std::size_t>(M);
            o.blockTri.blockSize = B;
            //  The structure is a property of the code: audited on the first
            //  Newton of the run when the dense Jacobian is affordable (the
            //  audit builds it whole), declared on the others.
            o.blockTri.audit = (passes == 1 && nUnknowns <= 3000);
            o.lower.assign(nUnknowns, -std::numeric_limits<scalar>::infinity());
            for (int k = 0; k < M; ++k)
            {
                const std::size_t b = static_cast<std::size_t>(k) * B;
                for (std::size_t i = 0; i < 4 * n; ++i) o.lower[b + i] = 0.0;
                o.lower[b + lay.v()] = 1.0e-6;
                o.lower[b + lay.l()] = 1.0e-6;
            }
            o.upper.assign(nUnknowns, std::numeric_limits<scalar>::infinity());
            const solver::NDResult res = solver::newtonND(residual, X, o);
            newtonIts += res.iterations;
            if (o.blockTri.audit && std::isfinite(res.offBandMax)) { offBand = res.offBandMax; auditedAt = M; }
            if (!res.converged)
                throw std::runtime_error(who + "the Newton on the segments did not"
                    " converge (outer pass " + std::to_string(passes) + ", ||F|| "
                    + std::to_string(res.residual) + (res.stopReason.empty() ? std::string()
                    : "; " + res.stopReason) + ").");
            X = res.x;
            std::vector<SegmentCoefficients> cNew;
            std::vector<scalar> Pnew = Pface;
            evaluateAll(X, cNew, Pnew);
            scalar ch = 0.0;
            for (int k = 0; k < M; ++k)
            {
                ch = std::max({ch, relChange(cNew[k].betaV, coef[k].betaV),
                               relChange(cNew[k].betaL, coef[k].betaL)});
                if (!limitMode)
                    ch = std::max({ch, relChange(cNew[k].gamV, coef[k].gamV),
                                   relChange(cNew[k].gamL, coef[k].gamL)});
            }
            for (int k = 0; k <= M; ++k) ch = std::max(ch, relChange(Pnew[k], Pface[k]));
            lastChange = ch;
            if (ch < 1.0e-10) break;      // X solves the rows written on `coef`
            coef = cNew;
            Pface = Pnew;
            reb = reboilerAt(Pface[M], reb.T);
        }
        if (lastChange >= 1.0e-10)
            throw std::runtime_error(who + "the coefficients did not settle in "
                + std::to_string(maxPasses) + " outer passes (last relative change "
                + std::to_string(lastChange) + ").");
    };

    //  ---- The bed's HETP and end compositions on the current solve --------
    struct Ends { scalar HETP = 0.0, Nt = 0.0, alpha = 0.0, xT = 0.0, xB = 0.0, Ttop = 0.0; };
    auto endsOf = [&]()
    {
        Ends e;
        const sVector y0(X.begin() + lay.y(), X.begin() + lay.y() + n);
        const std::size_t bl = static_cast<std::size_t>(M - 1) * B + lay.x();
        const sVector xb(X.begin() + bl, X.begin() + bl + n);
        e.Ttop = bubble(y0, Ptop, X[lay.TV()]);
        const scalar Tbelow = bubble(xb, Pface[M], reb.T);
        auto alphaAt = [&](const sVector& z, scalar T, scalar P)
        { const sVector K = Kat(T, P, z, z); return K[lk] / K[hk]; };
        e.alpha = std::sqrt(alphaAt(y0, e.Ttop, Ptop) * alphaAt(xb, Tbelow, Pface[M]));
        e.xT = normalised(y0)[lk];
        e.xB = normalised(xb)[lk];
        e.Nt = std::log((e.xT / (1.0 - e.xT)) / (e.xB / (1.0 - e.xB))) / std::log(e.alpha);
        e.HETP = Hbed / e.Nt;
        return e;
    };

    //  THE COMPANION SOLVE ON HALF THE SEGMENTS, then the declared count.
    //  The box scheme is second order, so the error of the fine answer is
    //  estimated as |HETP_M - HETP_M/2| / 3 (Richardson): a MEASUREMENT on
    //  this bed, printed, and refused above 1 %.
    solveBed();
    const Ends half = endsOf();
    const int Mhalf = M;
    M = Mdecl;
    dz = Hbed / M;
    solveBed();
    if (bubbleFailed)
        std::cout << "  [rateBased] " << unit << ": WARNING -- a bubble point did"
                     " not meet its tolerance during the solve.\n";
    const std::size_t nUnknowns = static_cast<std::size_t>(M) * B;

    //  ---- What the converged segments say --------------------------------
    auto at = [&](int k, std::size_t off) { return X[static_cast<std::size_t>(k) * B + off]; };
    auto vecAt = [&](int k, std::size_t off)
    { const std::size_t b = static_cast<std::size_t>(k) * B + off; return sVector(X.begin() + b, X.begin() + b + n); };
    const sVector y0 = vecAt(0, lay.y()), xBed = vecAt(M - 1, lay.x());
    const Ends fine = endsOf();
    const scalar Ttop = fine.Ttop, alpha = fine.alpha, xT = fine.xT, xB = fine.xB;
    const scalar Nt = fine.Nt, HETP = fine.HETP;
    const scalar discErr = std::abs(fine.HETP - half.HETP) / (3.0 * fine.HETP);

    //  Conservation: the reboiler's material balance is written by no row
    //  (the bed's rows imply it); measured here.
    scalar massGap = 0.0;
    for (std::size_t i = 0; i < n; ++i)
        massGap = std::max(massGap, std::abs(at(M - 1, lay.l()) * xBed[i] * Vref - reb.V * reb.y[i]) / reb.V);
    //  The first law at each end, on the streams' own surface.
    const scalar TLin0 = bubble(y0, Ptop, Ttop);
    const scalar Qcond = Vref * at(0, lay.v()) * (hL(y0, TLin0, Ptop) - hV(y0, at(0, lay.TV()), Ptop));
    const scalar QrebOwn = reb.V * hV(reb.y, reb.T, Pface[M])
                         - Vref * at(M - 1, lay.l()) * hL(xBed, at(M - 1, lay.TL()), Pface[M]);
    const scalar Qplug = -Qcond;     // nothing crosses the column's boundary

    //  Discretisation estimate and per-segment quantities.
    scalar rMax = 0.0, ratioMin = 1e300, ratioMax = -1e300, ratioSum = 0.0;
    scalar dTvMax = 0.0, dTlMax = 0.0, phiMax = 0.0, dlVig = 0.0, sumDP = 0.0, sumAe = 0.0, sumHold = 0.0, sumUL = 0.0, maxFlood = 0.0;
    int ratioCount = 0;
    profile_ = UnitProfile{};
    profile_.xAxis = "z";
    for (int k = 0; k < M; ++k)
    {
        const Mid s = midOf(X, k, true);
        const SegmentCoefficients& c = coef[k];
        const scalar HOGk = dz * s.vm * (1.0 / c.betaV + c.m / c.betaL);
        rMax = std::max(rMax, dz / HOGk);
        const scalar wl = at(k, lay.w() + lk), wh = at(k, lay.w() + hk);
        const scalar wt = wl + wh;
        if (std::abs(wl) > 1.0e-14)
        {
            const scalar ratio = -wh / wl;
            ratioMin = std::min(ratioMin, ratio); ratioMax = std::max(ratioMax, ratio);
            ratioSum += ratio; ++ratioCount;
        }
        const scalar TI = at(k, lay.TI());
        dTvMax = std::max(dTvMax, std::abs(TI - s.TVm));
        dTlMax = std::max(dTlMax, std::abs(s.TLm - TI));
        phiMax = std::max(phiMax, std::abs(wt) / c.betaV);
        dlVig = std::max(dlVig, std::abs(c.DLvignes - c.DLlinear) / c.DLlinear);
        sumDP += c.dP; sumAe += c.aeOverAp; sumHold += c.holdup; sumUL += c.uL;
        maxFlood = std::max(maxFlood, c.flood);
        const scalar toFlux = Vref / (A_T * dz);    // kmol/(m3 s) of bed
        profile_.columns["z"].push_back((k + 0.5) * dz);
        profile_.columns["P"].push_back(0.5 * (Pface[k] + Pface[k + 1]));
        profile_.columns["T_V"].push_back(s.TVm);
        profile_.columns["T_I"].push_back(TI);
        profile_.columns["T_L"].push_back(s.TLm);
        profile_.columns["y_" + thermo.comp(lk).name()].push_back(s.ym[lk]);
        profile_.columns["x_" + thermo.comp(lk).name()].push_back(s.xm[lk]);
        profile_.columns["yI_" + thermo.comp(lk).name()].push_back(at(k, lay.yI() + lk));
        profile_.columns["xI_" + thermo.comp(lk).name()].push_back(at(k, lay.xI() + lk));
        profile_.columns["Na_" + thermo.comp(lk).name()].push_back(wl * toFlux);
        profile_.columns["Na_" + thermo.comp(hk).name()].push_back(wh * toFlux);
        profile_.columns["V"].push_back(s.vm * Vref);
        profile_.columns["L"].push_back(s.lm * Vref);
        profile_.columns["HOG"].push_back(HOGk);
    }
    if (discErr > rateBased::maxDiscretisationError)
    {
        const int need = static_cast<int>(std::ceil(M * std::sqrt(discErr / rateBased::maxDiscretisationError))) + 1;
        std::ostringstream o;
        o << who << "the discretisation error measured on this bed, |HETP("
          << M << ") - HETP(" << Mhalf << ")|/3 = " << discErr << " of the HETP, exceeds "
          << rateBased::maxDiscretisationError << "; declare `segments " << need << ";` or more.";
        throw std::runtime_error(o.str());
    }

    //  ---- Report ---------------------------------------------------------
    const scalar Ftop = coef[0].F, Fbot = coef[M - 1].F;
    std::ostringstream rep;
    rep << "\n=============  DistillationColumn (rate-based packed bed, total reflux)  =============\n"
        << "  " << (limitMode ? "LIMIT `transferUnits`: linear equilibrium over each segment,"
                                " equimolar counter-diffusion, each bulk at its bubble point --"
                                " the transfer-unit bed, solved as segments (a check mode)"
                              : "two films, interface equilibrium, interface energy balance:"
                                " the fluxes are NOT assumed equimolar") << "\n"
        << "  correlation: " << (delft ? "Delft (Olujic et al. 1999; Fair et al. 2000 Tables 2, 4)"
                                       : "Rocha-Bravo-Fair (IECR 32 (1993) 641; 35 (1996) 1660)")
        << (modelDeclared ? " (declared)" : " (the default for a structured packing; `packing { model ...; }` selects)") << "\n"
        << "  flow: PLUG flow in both phases (box scheme: each film driven by the mean of the"
           " segment's inlet and outlet); the films are algebraic (no discretisation inside a film)\n"
        << "  ends: reboiler = equilibrium stage on the declared liquid at the bed's bottom pressure;"
           " total condenser, the reflux the top vapour at its bubble point at the declared top pressure\n"
        << "  liquid Fick diffusivity: ideal solution (Gamma = 1), the two infinite-dilution Wilke-Chang"
           " values combined linearly in x; Vignes's rule would differ by at most "
        << std::setprecision(3) << 100.0 * dlVig << " % on this bed\n";
    if (!limitMode)
        rep << "  film heat transfer: the same coefficients by the heat/mass analogy (vapour Chilton-Colburn,"
               " (alpha/D)^(2/3); liquid penetration, (alpha/D)^(1/2)); low-flux coefficients, no"
               " high-flux correction (largest rate factor |N_t|/(c k_G) = "
            << std::setprecision(3) << phiMax << ")\n";
    rep << "  " << M << " segments of " << std::setprecision(4) << dz << " m; " << nUnknowns
        << " unknowns (" << B << " per segment), block-tridiagonal: "
        << (auditedAt ? "VERIFIED on the first Newton of the " + std::to_string(auditedAt)
                        + "-segment solve, max off-band |J| = "
                      : std::string("declared, not audited (the dense audit runs at <= 3000 unknowns)"));
    if (auditedAt) rep << std::scientific << std::setprecision(2) << offBand << std::defaultfloat;
    rep << "\n  outer passes on the " << M << "-segment solve (coefficients and pressures"
           " re-evaluated on the converged segments): " << passes
        << "; Newton iterations over both solves " << newtonIts << "\n"
        << "  discretisation, MEASURED: HETP " << std::setprecision(9) << fine.HETP << " m on " << M
        << " segments, " << half.HETP << " m on " << Mhalf << "; reflux x " << fine.xT << " / " << half.xT
        << "; error estimate |difference|/3 = " << std::scientific << std::setprecision(2)
        << discErr << std::defaultfloat << " of the HETP (largest dz/H_OG " << std::setprecision(4) << rMax << ")\n\n"
        << "      z [m]   P [mbar]   T_V [K]   T_I [K]   T_L [K]   y(" << thermo.comp(lk).name()
        << ")   x       -N_" << thermo.comp(hk).name() << "/N_" << thermo.comp(lk).name()
        << "   H_OG [m]\n";
    for (int k = 0; k < M; k += std::max(1, M / 10))
    {
        const scalar wl = at(k, lay.w() + lk), wh = at(k, lay.w() + hk);
        rep << "    " << std::fixed << std::setw(7) << std::setprecision(3) << profile_.columns["z"][k] << "  "
            << std::setw(8) << std::setprecision(3) << profile_.columns["P"][k] * 1.0e-2 << "  "
            << std::setw(8) << std::setprecision(3) << profile_.columns["T_V"][k] << "  "
            << std::setw(8) << std::setprecision(3) << profile_.columns["T_I"][k] << "  "
            << std::setw(8) << std::setprecision(3) << profile_.columns["T_L"][k] << "  "
            << std::setw(8) << std::setprecision(5) << profile_.columns["y_" + thermo.comp(lk).name()][k] << "  "
            << std::setw(8) << std::setprecision(5) << profile_.columns["x_" + thermo.comp(lk).name()][k] << "  "
            << std::setw(8) << std::setprecision(5) << (std::abs(wl) > 0.0 ? -wh / wl : 0.0) << "  "
            << std::setw(7) << std::setprecision(4) << profile_.columns["HOG"][k] << "\n";
    }
    rep << std::defaultfloat << std::setprecision(6)
        << "\n  HETP (bed height / Fenske stages, alpha " << alpha << "): " << HETP << " m\n"
        << "  reflux x(" << thermo.comp(lk).name() << ") " << xT << ", liquid below the bed " << xB
        << ", reboiler " << xN[lk] << "\n"
        << "  material: the reboiler's balance (written by no row) closes to "
        << std::scientific << std::setprecision(2) << massGap << std::defaultfloat
        << " of the boil-up per component\n"
        << std::fixed << std::setprecision(4)
        << "  energy: condenser " << Qcond << " kW, reboiler by its own envelope " << QrebOwn
        << " kW, by the column's whole first law " << Qplug << " kW\n";
    if (!limitMode)
        rep << "  equimolar counter-diffusion is NOT imposed: -N_" << thermo.comp(hk).name()
            << "/N_" << thermo.comp(lk).name() << " runs " << ratioMin << " .. " << ratioMax
            << "; the vapour flow changes up the bed by V_top/V_bottom = "
            << at(0, lay.v()) * Vref / reb.V << "\n"
            << "  interface vs bulk temperatures: |T_I - T_V| <= " << dTvMax
            << " K, |T_L - T_I| <= " << dTlMax << " K\n";
    rep << std::defaultfloat;
    rep << "=======================================================================================\n\n";
    std::cout << rep.str();

    produced_.clear();
    kpis_.clear();
    kpis_["HETP"] = HETP;
    kpis_["theoreticalStages_bed"] = Nt;
    kpis_["alpha_mean"] = alpha;
    kpis_["x_reflux_LK"] = xT;
    kpis_["x_belowBed_LK"] = xB;
    kpis_["x_reboiler_LK"] = xN[lk];
    kpis_["T_top"] = Ttop;
    kpis_["T_bottom"] = reb.T;
    kpis_["V_boilup"] = reb.V;
    kpis_["P_bottom_bar"] = Pface[M] * 1.0e-5;
    kpis_["dP_bed_mbar_per_m"] = (Pface[M] - Ptop) * 1.0e-2 / Hbed;
    kpis_["dP_over_dPflood_max"] = maxFlood;
    kpis_["fFactor_bedTop"] = Ftop;
    kpis_["fFactor_bedBottom"] = Fbot;
    kpis_["uL_mean_m3_m2h"] = sumUL / M;
    kpis_["holdup_mean"] = sumHold / M;
    kpis_["aeOverAp_mean"] = sumAe / M;
    kpis_["Q_condenser_kW"] = Qcond;
    kpis_["Q_reboiler_kW"] = Qplug;
    kpis_["Q_reboiler_ownEnvelope_kW"] = QrebOwn;
    kpis_["massClosure_maxRel"] = massGap;
    kpis_["discretisationError_est"] = discErr;
    kpis_["HETP_halfSegments"] = half.HETP;
    kpis_["segments"] = M;
    kpis_["DL_vignesVsLinear_maxRel"] = dlVig;
    if (!limitMode)
    {
        kpis_["fluxRatio_min"] = ratioMin;
        kpis_["fluxRatio_max"] = ratioMax;
        kpis_["fluxRatio_mean"] = ratioCount ? ratioSum / ratioCount : 0.0;
        kpis_["TI_minus_TV_maxAbs"] = dTvMax;
        kpis_["TL_minus_TI_maxAbs"] = dTlMax;
        kpis_["V_top_over_V_bottom"] = at(0, lay.v()) * Vref / reb.V;
        kpis_["rateFactor_max"] = phiMax;
    }

    //  ---- The first law, classified (RB-02, RB-05) -----------------------
    ClosureVariable cv;
    cv.balance  = "energy";
    cv.variable = "Q_reboiler_kW";
    cv.rule     = "Q_reboiler = -Q_condenser: nothing crosses the boundary of a"
                  " column at total reflux, so its whole first law closes on the reboiler";
    cv.blindTo  = "the split between the two duties -- the column's closure holds for any Q_condenser";
    closures_.clear();
    if (limitMode)
        cv.note = "no second route: the limit `transferUnits` replaces the bed's"
                  " energy rows by bubble-point temperatures and equimolar"
                  " counter-diffusion, so no energy balance is solved inside the bed";
    else
    {
        cv.check = "the reboiler's own envelope on the solved segments: V_b h_V(y_b, T_b)"
                   " - L_bed h_L(x_bed, T_L,bed); it agrees with -Q_condenser only if"
                   " every segment's vapour, liquid AND interface energy rows are solved";
        cv.hasCheck   = true;
        cv.checkValue = QrebOwn;
        cv.gap        = Qplug - QrebOwn;
        const scalar terms = std::abs(reb.V * hV(reb.y, reb.T, Pface[M]))
                           + std::abs(Vref * at(M - 1, lay.l()) * hL(xBed, at(M - 1, lay.TL()), Pface[M]));
        //  1e-5 kW and 1e-9 of the envelope's terms (the full MESH's
        //  tolerance), plus what the Newton's own tolerance allows: two
        //  energy rows per segment, each at most newtonTol V_ref lambda_ref.
        cv.tolerance  = 1.0e-5 + 1.0e-9 * terms + 2.0 * M * newtonTol * Vref * std::abs(lamRef);
        cv.mustAgree  = true;
        cv.verified   = std::abs(cv.gap) <= cv.tolerance;
        if (!cv.verified)
        {
            std::ostringstream m;
            m << std::scientific << std::setprecision(6) << "the reboiler's own envelope reads "
              << QrebOwn << " kW against " << Qplug << " kW (gap " << cv.gap << " > "
              << cv.tolerance << ")";
            cv.note = m.str();
        }
    }
    closures_.push_back(cv);
    (void)verbosity;
    return 0;
}

} // namespace Choupo
