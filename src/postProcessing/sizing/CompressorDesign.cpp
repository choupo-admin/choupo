/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

#include "CompressorDesign.H"
#include "DesignDefaults.H"
#include "core/Advisory.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/rotating/IsentropicCore.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <vector>

namespace Choupo {
namespace compressorDesign {

namespace {

constexpr scalar R_kmol   = 8314.462618;     // J/(kmol K)
constexpr scalar cfm_per_m3s = 2118.8800032893;
constexpr int    maxStages = 12;

//  ---- THE MACHINE CHART: Brown 2005, Fig 1-2 (p.3) ------------------------
//  READ OFF THE FIGURE (log-log axes, 1e2..1e6 cfm and 2..200): each region is
//  a box whose edges were measured on the page image and are good to about
//  +-3 % of the edge value.  A region's upper ratio is the LOWER of its left
//  and right corners where the figure slopes.  Not a table the book prints.
struct Region
{
    const char* name;
    scalar Qmin, Qmax;     // inlet actual flow [cfm]
    scalar rMin;           // overall pressure ratio, lower edge
    scalar rMaxLeft, rMaxRight;   // upper edge at Qmin and at Qmax; log-log straight between
    const char* cell;      // the figure's own label
};
//  The order IS the tie-break where several regions contain the point (the
//  book gives none): dynamic machines first, then rotary, then reciprocating.
const Region regions[] =
{
    { "centrifugal",   1.0e3, 1.0e4, 1.4, 20.0, 13.8, "Multistage / Single-Stage Centrif." },
    { "axial",         1.0e4, 1.0e6, 1.4, 16.4, 12.5, "Multistage Axial" },
    { "screw",         1.26e2, 2.15e3, 1.4, 12.4, 12.4, "Rotary Compressors" },
    { "reciprocating", 1.0e2, 1.0e3, 1.4, 101.0, 101.0, "Single-Stage / Multistage Reciprocating" },
};

//  The upper ratio edge at flow Q: the figure's top edge is a straight line on
//  its log-log axes between the two corners (centrifugal: 20 at 1e3 cfm falling
//  to 13.8 at 1e4 cfm, measured on the 300 dpi page image).
scalar rMaxAt(const Region& r, scalar cfm)
{
    if (r.rMaxLeft == r.rMaxRight) return r.rMaxLeft;
    const scalar t = std::log(cfm / r.Qmin) / std::log(r.Qmax / r.Qmin);
    return r.rMaxLeft * std::pow(r.rMaxRight / r.rMaxLeft, t);
}

//  ---- RECIPROCATING EFFICIENCY: Brown 2005, Fig 3-6 (p.66) -----------------
//  Read at the half-integer ratios, +-0.5 points.  The curve already includes
//  a 95 % mechanical efficiency and a 3000 fpm valve velocity (the caption),
//  so no mechanical loss is added on top of it.
const scalar recipR[]   = { 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5 };
const scalar recipEta[] = { 0.730, 0.789, 0.820, 0.832, 0.840, 0.8425, 0.845,
                            0.849, 0.850, 0.852, 0.846 };

scalar recipEfficiency(scalar r, bool& clamped)
{
    const int n = int(sizeof(recipR) / sizeof(recipR[0]));
    clamped = false;
    if (r <= recipR[0])   { clamped = (r < recipR[0]);   return recipEta[0]; }
    if (r >= recipR[n-1]) { clamped = (r > recipR[n-1]); return recipEta[n-1]; }
    for (int i = 0; i + 1 < n; ++i)
        if (r <= recipR[i+1])
        {
            const scalar t = (r - recipR[i]) / (recipR[i+1] - recipR[i]);
            return recipEta[i] + t * (recipEta[i+1] - recipEta[i]);
        }
    return recipEta[n-1];
}

//  ---- DEFAULTED INPUTS, each with the page that gives it --------------------
using designDefault::Assumption;

const Assumption cDischargeLimit
{ "maxDischargeT", 519.261, "K",
  "475 F, the temperature a centrifugal estimate should not exceed when no other"
  " consideration limits it (Brown 2005, p.196-197; the book calls it arbitrary)" };
const Assumption rDischargeLimit
{ "maxDischargeT", 422.039, "K",
  "300 F, the discharge limit of API 618 for a reciprocating machine (Brown 2005,"
  " p.71): higher temperatures coke the lubricant and damage valves" };
const Assumption screwRatioLimit
{ "maxRatioPerStage", 4.06, "-",
  "a dry helical-lobe stage at atmospheric suction is limited to 45 psi discharge"
  " (Brown 2005, p.8): (14.7 + 45) / 14.7, read as gauge pressure" };
const Assumption coolerDropFraction
{ "coolerDropFraction", 0.02, "-",
  "the intercooler pressure drop as a fraction of the absolute pressure at its"
  " entrance (Brown 2005, p.200)" };
const Assumption coolerDropMin
{ "coolerDropMin", 13789.5, "Pa",
  "the floor of the intercooler pressure drop, 2 psi, where 2 % would be unrealistically"
  " small (Brown 2005, p.200)" };
const Assumption centrifugalEta
{ "etaPolytropic", 0.75, "-",
  "the estimated centrifugal stage (polytropic) efficiency a sizing starts from"
  " (Brown 2005, p.196); the flow-coefficient chart of Fig 5-27 is not used" };
const Assumption axialEta
{ "etaAdiabatic", 0.85, "-",
  "the adiabatic efficiency the axial procedure recommends (Brown 2005, p.278 and p.285)" };
const Assumption screwEta
{ "etaAdiabatic", 0.75, "-",
  "the peak of the helical-lobe efficiency curves, which read 75-77 % (Brown 2005,"
  " Fig 4-7, p.135); the curve of a real machine depends on its built-in volume ratio" };
const Assumption centrifugalMech
{ "mechLossFraction", 0.01, "-",
  "1 % mechanical loss for a centrifugal estimate (Brown 2005, p.199); Eq 2.78 adds the loss to the power"
  " and the book gives no basis for the 1 %, so it is taken as a fraction of the gas power" };
const Assumption axialMech
{ "mechLossFraction", 0.01, "-",
  "1 %, the centrifugal estimate of Brown 2005 p.199, borrowed: the axial book reads"
  " the loss from a frame-size chart (Fig 6-11) that is not used here" };
const Assumption noMech
{ "mechLossFraction", 0.0, "-",
  "none on top of the efficiency: the source's efficiency is a shaft value" };
const Assumption driverMargin
{ "driverMargin", 1.10, "-",
  "API recommends the motor at 110 % of the greatest power the compressor needs"
  " (Brown 2005, p.307)" };

struct Stage
{
    scalar P1 = 0, P2 = 0, T1 = 0, T2 = 0, r = 0;
    scalar a = 0;          // (g-1)/g  of the isentropic path, Eq 2.76
    scalar etaP = 0, etaA = 0, n = 0;
    scalar Z1 = 0, Z2 = 0;
    scalar head = 0;       // polytropic head [J/kg], Eq 2.73
    scalar Wgas = 0;       // [W]  Eq 2.78 without the mechanical term
    scalar Wshaft = 0;     // [W]
    scalar dhCheck = 0;    // (Wgas - package enthalpy rise) / package enthalpy rise
    int    elements = 0;   // impellers / blade rows
    scalar etaDecl = 0;    // the efficiency as the source states it
    bool   clamped = false;
};

struct Interc
{
    scalar Tin = 0, Tout = 0, Pin = 0, Pout = 0, duty = 0;
};

struct Ctx
{
    const ThermoPackage* tp = nullptr;
    sVector y;
    scalar MW = 0;          // kg/kmol
    scalar F  = 0;          // kmol/s
    scalar mdot = 0;        // kg/s
    DensityPhase ph = DensityPhase::Vapour;

    scalar Z(scalar T, scalar P) const
    {
        const scalar rho = tp->density(T, P, y, DensityPhase::Vapour);
        return P * MW / (rho * R_kmol * T);
    }
};

//  etaKind: 0 polytropic, 1 adiabatic (value in `eta`), 2 reciprocating curve.
scalar polytropicFromAdiabatic(scalar etaA, scalar r, scalar a)
{
    //  etaA = (r^a - 1) / (r^(a/etaP) - 1)   -- Eq 2.66 against Eq 2.73,
    //  monotone in etaP; bisection.
    scalar lo = 0.05, hi = 1.0;
    const scalar num = std::pow(r, a) - 1.0;
    for (int it = 0; it < 200; ++it)
    {
        const scalar mid = 0.5 * (lo + hi);
        const scalar f = num / (std::pow(r, a / mid) - 1.0);
        if (f < etaA) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
}

Stage runStage(const Ctx& c, scalar T1, scalar P1, scalar P2,
               int etaKind, scalar etaValue, scalar mech)
{
    Stage s;
    s.T1 = T1; s.P1 = P1; s.P2 = P2; s.r = P2 / P1;
    const ThermoPackage& tp = *c.tp;
    const scalar s1 = tp.S_real(T1, P1, c.y, c.ph);
    const scalar h1 = tp.H_real(T1, P1, c.y, c.ph);
    const scalar T2s = rotating::solveT_for_S(tp, s1, P2, c.y,
                                              T1 * std::pow(s.r, 0.25));
    s.a = std::log(T2s / T1) / std::log(s.r);                    // Eq 2.76
    scalar etaDecl = etaValue;
    if (etaKind == 2) etaDecl = recipEfficiency(s.r, s.clamped);
    s.etaDecl = etaDecl;
    if (etaKind == 0) { s.etaP = etaDecl; }
    else              { s.etaP = polytropicFromAdiabatic(etaDecl, s.r, s.a); }
    if (!(s.a / s.etaP < 1.0))
        throw std::runtime_error("polytropic exponent undefined: (g-1)/(g eta_p) = "
            + std::to_string(s.a / s.etaP) + " >= 1");
    s.etaA = (std::pow(s.r, s.a) - 1.0) / (std::pow(s.r, s.a / s.etaP) - 1.0);
    s.n    = 1.0 / (1.0 - s.a / s.etaP);                          // Eq 2.71
    s.T2   = T1 * std::pow(s.r, s.a / s.etaP);                    // Eq 5.16
    s.Z1   = c.Z(T1, P1);
    s.Z2   = c.Z(s.T2, P2);
    const scalar Zavg = 0.5 * (s.Z1 + s.Z2);                      // Eq 2.68
    const scalar Rs = R_kmol / c.MW;                              // J/(kg K)
    s.head   = Zavg * Rs * T1 * (s.etaP / s.a) * (std::pow(s.r, s.a / s.etaP) - 1.0); // Eq 2.73
    s.Wgas   = c.mdot * s.head / s.etaP;                          // Eq 2.78
    s.Wshaft = s.Wgas * (1.0 + mech);
    const scalar dh = (tp.H_real(s.T2, P2, c.y, c.ph) - h1) * c.F * 1000.0;
    s.dhCheck = (s.Wgas - dh) / dh;
    return s;
}

struct Chain
{
    std::vector<Stage>  stages;
    std::vector<Interc> inter;
    scalar rStage = 0;
    scalar Tmax = 0;
};

Chain runChain(const Ctx& c, int n, scalar T_in, scalar P_in, scalar P_out,
               scalar T_cool, scalar dropFrac, scalar dropMin,
               int etaKind, scalar etaValue, scalar mech)
{
    //  Equal stage ratios r_s with the cooler drops between them: the
    //  balanced division of Brown Eq 3.17 with the allowance p.200 asks for.
    //  P_out = P_in * r_s^n * prod(1 - drop_i / P_exit_i); r_s by bisection.
    auto finalP = [&](scalar rs)
    {
        scalar P = P_in;
        for (int i = 0; i < n; ++i)
        {
            P *= rs;
            if (i + 1 < n) P -= std::max(dropFrac * P, dropMin);
        }
        return P;
    };
    scalar lo = 1.0001, hi = std::pow(P_out / P_in, 1.0) * 1.5 + 1.0;
    for (int it = 0; it < 200; ++it)
    {
        const scalar mid = 0.5 * (lo + hi);
        if (finalP(mid) < P_out) lo = mid; else hi = mid;
    }
    Chain ch;
    ch.rStage = 0.5 * (lo + hi);
    scalar T = T_in, P = P_in;
    for (int i = 0; i < n; ++i)
    {
        const scalar Pe = (i + 1 == n) ? P_out : P * ch.rStage;
        Stage st = runStage(c, T, P, Pe, etaKind, etaValue, mech);
        ch.Tmax = std::max(ch.Tmax, st.T2);
        ch.stages.push_back(st);
        if (i + 1 < n)
        {
            Interc ic;
            ic.Pin = Pe;
            ic.Pout = Pe - std::max(dropFrac * Pe, dropMin);
            ic.Tin = st.T2;
            ic.Tout = T_cool;
            ic.duty = (c.tp->H_real(ic.Tin, ic.Pin, c.y, c.ph)
                     - c.tp->H_real(ic.Tout, ic.Pout, c.y, c.ph)) * c.F * 1000.0;
            ch.inter.push_back(ic);
            T = T_cool; P = ic.Pout;
        }
    }
    return ch;
}

std::string num3(scalar v)
{
    std::ostringstream o; o << std::defaultfloat << std::setprecision(4) << v;
    return o.str();
}

} // namespace

void apply(EquipmentSizing&         d,
           const std::string&       unitName,
           const SimulationResult&  result,
           const DictPtr&           design)
{
    const std::string who = "compressor '" + unitName + "' (design)";
    auto refuse = [&](const std::string& m) { throw std::runtime_error(who + ": " + m); };

    if (!result.thermoForPost)
        refuse("this run carries no thermophysical package for its post-processing"
               " passes (only choupoSolve attaches one), and the real-gas"
               " compressibility cannot be formed without one.");
    const std::shared_ptr<const ThermoPackage> pkg = result.thermoForPost();
    if (!pkg) refuse("the case's package could not be built for post-processing.");

    const FlatUnit* fu = nullptr;
    for (const auto& u : result.topology) if (u.name == unitName) fu = &u;
    if (!fu || fu->ins.size() != 1)
        refuse("the detailed design needs the unit's one suction stream, and the"
               " solved topology does not give it.");
    auto sit = result.streams.find(fu->ins[0]);
    if (sit == result.streams.end())
        refuse("suction stream '" + fu->ins[0] + "' is not in the solved flowsheet.");
    const ProcessStream& in = sit->second;
    if (in.z.size() != pkg->n())
        refuse("stream '" + in.name + "' does not match the case's component list.");
    auto kp = result.kpis.find(unitName);
    if (kp == result.kpis.end() || !kp->second.count("P_out")
        || !kp->second.count("W_shaft_kW"))
        refuse("the unit's P_out / W_shaft_kW results are missing.");
    const scalar P_out = kp->second.at("P_out");

    Ctx c;
    c.tp = pkg.get();
    c.y  = in.z;
    c.F  = in.F;
    for (std::size_t i = 0; i < pkg->n(); ++i) c.MW += in.z[i] * pkg->comp(i).MW();
    c.mdot = c.F * c.MW;
    const scalar T_in = in.T, P_in = in.P;
    const scalar rTotal = P_out / P_in;
    const scalar rho1 = pkg->density(T_in, P_in, c.y, DensityPhase::Vapour);
    const scalar Q1   = c.mdot / rho1;                       // m3/s
    const scalar cfm  = Q1 * cfm_per_m3s;

    CompressorService& cs = d.compressor;
    cs.driver = "electricMotor";
    auto declared = [&](const char* k) { return design->found(k); };
    auto noteDeclared = [&](const char* k) { if (declared(k)) cs.declared.push_back(k); };
    auto sourced = [&](const Assumption& a, scalar v)
    {
        //  `valueOr` announced it and recorded the key on `d.assumed`; the
        //  sheet also carries the page.
        if (!declared(a.key)) cs.sources.push_back({ a.key, std::string(a.why) });
        (void)v;
    };

    //  ---- 1. THE MACHINE -------------------------------------------------
    std::string machine;
    if (declared("machine"))
    {
        machine = design->lookupWord("machine");
        const std::vector<std::string> ok = { "centrifugal", "axial", "reciprocating", "screw" };
        if (std::find(ok.begin(), ok.end(), machine) == ok.end())
            refuse("`machine " + machine + ";` is not one of centrifugal, axial,"
                   " reciprocating, screw.");
        cs.machineBy = "declared";
        cs.selection = "declared by the case (the chart would have said: see below)";
    }
    else cs.machineBy = "selected";

    std::string chartSaid;
    {
        std::ostringstream o;
        o << "inlet " << num3(cfm) << " cfm (" << num3(Q1 * 3600.0) << " m3/h), overall ratio "
          << num3(rTotal) << ": ";
        std::string pick;
        for (const auto& r : regions)
            if (cfm >= r.Qmin && cfm <= r.Qmax && rTotal >= r.rMin && rTotal <= rMaxAt(r, cfm))
            { pick = r.name; o << "inside the chart region '" << r.cell << "' (Brown 2005, Fig 1-2, p.3)"; break; }
        if (pick.empty() && rTotal < 1.4 && cfm >= 1.0e2 && cfm <= 1.0e6)
        {
            //  Below the chart's lowest ratio the figure draws nothing: the
            //  machine is the first whose FLOW range holds the point.
            for (const auto& r : regions)
                if (cfm >= r.Qmin && cfm <= r.Qmax) { pick = r.name; break; }
            o << "ratio below the chart's lowest edge (1.4, Fig 1-2, p.3): the first machine whose"
                 " flow range holds the point is taken (a circulator or booster duty)";
        }
        if (pick.empty())
        {
            if (cfm > 1.0e6)
                refuse("the inlet flow " + num3(cfm) + " cfm is beyond the chart's 1e6 cfm;"
                       " declare `machine ...;` and the parallel trains yourself.");
            pick = "reciprocating";
            o << "OUTSIDE every region of Fig 1-2 (Brown 2005, p.3); only the reciprocating"
                 " machine reaches ratios above ~17, with up to 10 000 cfm per cylinder"
                 " (p.5), so it is taken, in parallel cylinders where the flow needs them";
        }
        chartSaid = o.str();
        if (machine.empty()) { machine = pick; cs.selection = chartSaid; }
        else cs.selection += " -- chart: " + chartSaid;
    }
    cs.machine = machine;
    noteDeclared("machine");

    //  ---- 2. THE LIMITS AND THE EFFICIENCY, by machine ---------------------
    const std::string who2 = "compressor";
    scalar Tmax = 0.0;
    if (declared("maxDischargeT")) Tmax = design->lookupScalar("maxDischargeT");
    else if (machine == "centrifugal") Tmax = designDefault::valueOr(design, cDischargeLimit, who2, unitName, d);
    else if (machine == "reciprocating") Tmax = designDefault::valueOr(design, rDischargeLimit, who2, unitName, d);
    else refuse("the " + machine + " machine has no discharge-temperature limit in the source;"
                " declare `maxDischargeT <T> K;` with your reason.");
    if (machine == "centrifugal" && !declared("maxDischargeT")) sourced(cDischargeLimit, Tmax);
    if (machine == "reciprocating" && !declared("maxDischargeT")) sourced(rDischargeLimit, Tmax);
    noteDeclared("maxDischargeT");

    scalar rMaxStage = 1.0e9;
    if (declared("maxRatioPerStage")) rMaxStage = design->lookupScalar("maxRatioPerStage");
    else if (machine == "screw")
    { rMaxStage = designDefault::valueOr(design, screwRatioLimit, who2, unitName, d); sourced(screwRatioLimit, rMaxStage); }
    noteDeclared("maxRatioPerStage");

    const scalar dropFrac = designDefault::valueOr(design, coolerDropFraction, who2, unitName, d);
    sourced(coolerDropFraction, dropFrac); noteDeclared("coolerDropFraction");
    const scalar dropMin  = designDefault::valueOr(design, coolerDropMin, who2, unitName, d);
    sourced(coolerDropMin, dropMin); noteDeclared("coolerDropMin");

    scalar T_cool = T_in;
    if (declared("intercoolTemperature")) { T_cool = design->lookupScalar("intercoolTemperature"); cs.declared.push_back("intercoolTemperature"); }
    else cs.notes.push_back("the intercoolers return the gas to the machine's inlet temperature,"
                            " the basis of Brown 2005 Fig 2-2 and Example 2-4 (p.47-50); declare"
                            " `intercoolTemperature` for the cooling water's own.");

    int etaKind = 0; scalar etaValue = 0.0;
    if (declared("etaPolytropic") && declared("etaAdiabatic"))
        refuse("declare `etaPolytropic` or `etaAdiabatic`, not both.");
    if (declared("etaPolytropic")) { etaKind = 0; etaValue = design->lookupScalar("etaPolytropic"); cs.declared.push_back("etaPolytropic"); }
    else if (declared("etaAdiabatic")) { etaKind = 1; etaValue = design->lookupScalar("etaAdiabatic"); cs.declared.push_back("etaAdiabatic"); }
    else if (machine == "centrifugal")
    { etaKind = 0; etaValue = designDefault::valueOr(design, centrifugalEta, who2, unitName, d); sourced(centrifugalEta, etaValue); }
    else if (machine == "axial")
    { etaKind = 1; etaValue = designDefault::valueOr(design, axialEta, who2, unitName, d); sourced(axialEta, etaValue); }
    else if (machine == "screw")
    { etaKind = 1; etaValue = designDefault::valueOr(design, screwEta, who2, unitName, d); sourced(screwEta, etaValue); }
    else
    {
        etaKind = 2;
        cs.sources.push_back({ "etaAdiabatic", "read from the reciprocating efficiency curve against the"
            " stage pressure ratio (Brown 2005, Fig 3-6, p.66; +-0.5 points; the curve includes a"
            " 95 % mechanical efficiency; the gas-gravity and low-pressure multipliers of Tables"
            " 3-1 and 3-2 are not applied)" });
    }
    if (etaValue != 0.0 && !(etaValue > 0.0 && etaValue <= 1.0))
        refuse("the declared efficiency must satisfy 0 < eta <= 1.");

    scalar mech = 0.0;
    if (declared("mechLossFraction")) { mech = design->lookupScalar("mechLossFraction"); cs.declared.push_back("mechLossFraction"); }
    else if (machine == "centrifugal") { mech = designDefault::valueOr(design, centrifugalMech, who2, unitName, d); sourced(centrifugalMech, mech); }
    else if (machine == "axial")       { mech = designDefault::valueOr(design, axialMech, who2, unitName, d); sourced(axialMech, mech); }
    else                               { mech = designDefault::valueOr(design, noMech, who2, unitName, d); sourced(noMech, mech); }

    const scalar margin = designDefault::valueOr(design, driverMargin, who2, unitName, d);
    sourced(driverMargin, margin); noteDeclared("driverMargin");

    //  ---- 3. THE STAGES --------------------------------------------------
    Chain best;
    int nSel = 0;
    std::string limiting;
    if (declared("stages"))
    {
        const scalar sv = design->lookupScalar("stages");
        nSel = int(std::lround(sv));
        if (nSel < 1 || nSel > maxStages || std::abs(sv - nSel) > 1e-9)
            refuse("`stages` must be a whole number from 1 to " + std::to_string(maxStages) + ".");
        cs.stagesBy = "declared"; cs.declared.push_back("stages");
        limiting = "declared by the case";
        best = runChain(c, nSel, T_in, P_in, P_out, T_cool, dropFrac, dropMin, etaKind, etaValue, mech);
    }
    else
    {
        cs.stagesBy = "limit";
        for (int n = 1; n <= maxStages; ++n)
        {
            Chain ch = runChain(c, n, T_in, P_in, P_out, T_cool, dropFrac, dropMin, etaKind, etaValue, mech);
            if (ch.Tmax <= Tmax && ch.rStage <= rMaxStage)
            {
                best = ch; nSel = n;
                std::ostringstream o;
                o << "the fewest sections whose hottest discharge (" << num3(ch.Tmax) << " K) is within"
                  << " the limit " << num3(Tmax) << " K";
                if (rMaxStage < 1.0e8) o << " and whose ratio per stage (" << num3(ch.rStage)
                                         << ") is within " << num3(rMaxStage);
                limiting = o.str();
                break;
            }
        }
        if (nSel == 0)
            refuse("no design of up to " + std::to_string(maxStages) + " stages keeps the discharge"
                   " within " + num3(Tmax) + " K -- raise `maxDischargeT` or lower the intercooling"
                   " temperature.");
    }
    cs.stages = nSel; cs.intercoolers = nSel - 1; cs.limiting = limiting;

    //  ---- 4. THE ELEMENTS PER SECTION (impellers, blade rows) -----------------
    int casings = 0, elementsTotal = 0;
    if (machine == "centrifugal")
    {
        //  Brown 2005 p.196: 10 000 ft-lbf/lb per stage at molecular weight 28-30;
        //  100 ft-lbf/lb LESS per unit of molecular weight above, 200 MORE per
        //  unit below.  The reference molecular weight is the middle of the range.
        const scalar ftlbf_to_Jkg = 0.3048 * 9.80665;
        const scalar Hs_ref = 10000.0 * ftlbf_to_Jkg;
        const scalar MWref = 29.0;
        const scalar Hs = (c.MW >= MWref ? 10000.0 - 100.0 * (c.MW - MWref)
                                         : 10000.0 + 200.0 * (MWref - c.MW)) * ftlbf_to_Jkg;
        (void)Hs_ref;
        if (!(Hs > 0.0)) refuse("the head-per-stage rule gives a non-positive value at molecular weight "
                                + num3(c.MW) + " (the rule is good for 2 to 70).");
        d.set("headPerImpeller", Hs, "J/kg");
        for (auto& s : best.stages)
        {
            const scalar z = s.head / Hs;
            int zi = int(std::floor(z));
            const scalar frac = z - zi;
            s.elements = (zi >= 1 && frac < 0.2) ? zi : zi + 1;
            casings += (s.elements + 7) / 8;           // at most eight per casing, p.197
            elementsTotal += s.elements;
        }
        cs.notes.push_back("impellers per section = polytropic head / head per impeller, rounded up"
                           " (a fraction under 0.2 dropped), Brown 2005 p.196; at most eight per"
                           " casing (p.197); a section is one casing at least.");
    }
    else if (machine == "axial")
    {
        const scalar psiW = 0.29;                        // p.278
        const scalar um = 720.0 * 0.3048;               // 720 ft/s
        for (auto& s : best.stages)
        {
            s.elements = std::max(1, int(std::lround(s.head / (psiW * um * um)))); // Eq 6.15
            elementsTotal += s.elements;
        }
        casings = nSel;
        cs.notes.push_back("blade rows per section from Brown 2005 Eq 6.15, z = g Ha / (mu um^2), with"
                           " mu = 0.29 and um = 720 ft/s (p.278); the frame, hub/tip check and speed"
                           " of p.279-281 are not done.");
    }
    else casings = nSel;

    //  ---- 5. TOTALS AND THE DRIVER ----------------------------------------
    scalar WgasT = 0, WshaftT = 0, QinterT = 0;
    for (const auto& s : best.stages) { WgasT += s.Wgas; WshaftT += s.Wshaft; }
    for (const auto& i : best.inter)  QinterT += i.duty;
    const scalar Wunit = kp->second.at("W_shaft_kW") * 1000.0;

    d.set("Q_inlet",          Q1 * 3600.0,  "m3/h");
    d.set("rOverall",         rTotal,       "-");
    d.set("nStages",          scalar(nSel), "-");
    d.set("nIntercoolers",    scalar(nSel - 1), "-");
    d.set("rStage",           best.rStage,  "-");
    d.set("T_dischargeMax",   best.Tmax,    "K");
    d.set("T_dischargeLimit", Tmax,         "K");
    d.set("powerGas",         WgasT / 1000.0,   "kW");
    d.set("powerShaft",       WshaftT / 1000.0, "kW");
    d.set("powerUnitSinglePass", Wunit / 1000.0, "kW");
    d.set("driverRating",     margin * WshaftT / 1000.0, "kW");
    d.set("driverMargin",     margin,       "-");
    d.set("Q_intercoolers",   QinterT / 1000.0, "kW");
    d.set("MW",               c.MW,         "kg/kmol");
    if (machine == "centrifugal" || machine == "axial")
    {
        d.set("nElements", scalar(elementsTotal), "-");
        d.set("nCasings",  scalar(casings), "-");
    }
    if (declared("motorEfficiency"))
    {
        const scalar em = design->lookupScalar("motorEfficiency");
        if (!(em > 0.0 && em <= 1.0)) refuse("`motorEfficiency` must satisfy 0 < eta <= 1.");
        d.set("powerElectric", WshaftT / em / 1000.0, "kW");
        cs.declared.push_back("motorEfficiency");
    }
    else cs.notes.push_back("no motor efficiency is declared, so the electrical input is not computed;"
                            " Brown 2005 p.301-310 gives none as a number.");

    for (std::size_t i = 0; i < best.stages.size(); ++i)
    {
        const Stage& s = best.stages[i];
        const std::string p = "stage" + std::to_string(i + 1) + "_";
        d.set(p + "ratio",  s.r,   "-");
        d.set(p + "Tin",    s.T1,  "K");
        d.set(p + "Pin",    s.P1 / 1.0e5, "bar");
        d.set(p + "Tout",   s.T2,  "K");
        d.set(p + "Pout",   s.P2 / 1.0e5, "bar");
        d.set(p + "Zavg",   0.5 * (s.Z1 + s.Z2), "-");
        d.set(p + "n",      s.n,   "-");
        d.set(p + "etaPoly", s.etaP, "-");
        d.set(p + "head",   s.head, "J/kg");
        d.set(p + "power",  s.Wshaft / 1000.0, "kW");
        d.set(p + "dhCheck", s.dhCheck, "-");
        if (s.elements > 0) d.set(p + "elements", scalar(s.elements), "-");
    }
    for (std::size_t i = 0; i < best.inter.size(); ++i)
    {
        const Interc& ic = best.inter[i];
        const std::string p = "intercooler" + std::to_string(i + 1) + "_";
        d.set(p + "duty", ic.duty / 1000.0, "kW");
        d.set(p + "Tin",  ic.Tin,  "K");
        d.set(p + "Tout", ic.Tout, "K");
        d.set(p + "dP",   (ic.Pin - ic.Pout) / 1.0e5, "bar");
    }

    //  ---- 6. WHAT THE READER IS TOLD -----------------------------------------
    bool clamped = false;
    for (const auto& s : best.stages) clamped = clamped || s.clamped;
    if (clamped)
        cs.notes.push_back("a stage ratio fell outside Fig 3-6 (1.5 to 6.5): the curve's end value is used.");
    cs.notes.push_back("the flowsheet's unit is ONE adiabatic pass; `powerUnitSinglePass` is its `W_shaft`"
                       " and is the size the costing reads, unchanged.  `powerShaft` is the staged,"
                       " intercooled machine; the intercoolers are listed here, not placed as exchanger"
                       " items of the plant.");
    cs.notes.push_back("the unit's own `eta` is an ISENTROPIC efficiency for its single pass; the design"
                       " uses the source's efficiency for the machine and stage (shown per stage as"
                       " `stageN_etaPoly`), so the two powers are not expected to agree.");
    cs.notes.push_back("the gas is priced as a vapour at every stage and intercooler outlet (no"
                       " condensation between stages is tested); Z and the compression exponent come"
                       " from the case's package.");
    cs.notes.push_back("`stageN_dhCheck` is the polytropic gas power of Brown Eq 2.78 against the"
                       " package's own enthalpy rise for the same stage: a closure of the real-gas"
                       " arithmetic, not a claim about the machine.");
    cs.notes.push_back("a design standard motor size is not selected; the driver is the rating the"
                       " 110 % rule asks for.");
    if (std::abs(best.stages.front().dhCheck) > 0.05)
        std::cout << "  [warning] compressor '" << unitName << "' (design): the polytropic power of"
                  << " stage 1 differs from the package's enthalpy rise by "
                  << std::fixed << std::setprecision(1) << 100.0 * best.stages.front().dhCheck
                  << " % (real-gas departure larger than the averaged-Z head carries).\n";
}

} // namespace compressorDesign
} // namespace Choupo
