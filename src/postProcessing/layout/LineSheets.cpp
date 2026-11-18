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
    This file is part of Choupo.  GPL-3.0-or-later; see LICENSE and NOTICE.

    SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

#include "LineSheets.H"

#include "core/Dimensions.H"
#include "materials/MaterialRegistry.H"
#include "postProcessing/sizing/PhaseDensity.H"
#include "streams/StreamMass.H"
#include "thermo/LiquidPropertyDoor.H"
#include "thermo/PricedDensity.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/hydraulics/friction/FrictionFactorCorrelation.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <map>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {
namespace lineSheets {

namespace {

constexpr scalar kPi  = 3.14159265358979323846;
constexpr scalar kG   = 9.80665;       // [m/s2] standard gravity
constexpr scalar kR   = 8.31446261815324;
constexpr scalar kAtm = 101325.0;      // [Pa]
constexpr scalar phaseTol = 1.0e-9;

std::string fmt(scalar v)
{
    char b[48];
    std::snprintf(b, sizeof(b), "%.6g", static_cast<double>(v));
    return b;
}

void needText(const DictPtr& b, const char* block, const char* key)
{
    if (!b->found(key) || b->lookupWord(key).empty())
        throw std::runtime_error(std::string("lineDesign: `") + block + " { "
            + key + " \"...\"; }` is not declared -- a number the case chose"
              " carries where it came from and why it is this plant's.");
}

DictPtr need(const DictPtr& d, const char* name, const std::string& where)
{
    if (!d->found(name) || !std::holds_alternative<DictPtr>(d->entryValue(name)))
        throw std::runtime_error("lineDesign: `" + where + name
            + " { ... }` is not declared.  Nothing in the line list is taken"
              " by default: the case declares each rule it sizes by.");
    return d->subDict(name);
}

//  A service's rule: a velocity window, optionally Rase's linear form for the
//  upper bound, a book guide on the drop per metre.
struct ServiceRule
{
    bool   declared = false;
    bool   hasMin = false, hasMax = false, hasRase = false;
    scalar vMin = 0, vMax = 0, raseSlope = 0, raseIntercept = 0; // [m/s per mm], [m/s]
    scalar dropPerMetre = 0;       // [Pa/m]
    scalar dropFraction = 0;       // [1/m of the line pressure]
    scalar sonicFraction = 0;      // of the sonic velocity (gases)
    std::string source;
};

ServiceRule readService(const DictPtr& d)
{
    ServiceRule r;
    r.declared = true;
    needText(d, "service", "source");
    needText(d, "service", "reason");
    r.source = d->lookupWord("source");
    if (d->found("min")) { r.vMin = d->lookupScalar("min", Dims::velocity); r.hasMin = true; }
    if (d->found("max")) { r.vMax = d->lookupScalar("max", Dims::velocity); r.hasMax = true; }
    if (d->found("raseSlopePerMm"))
    {
        r.raseSlope     = d->lookupScalar("raseSlopePerMm");
        r.raseIntercept = d->lookupScalar("raseIntercept", Dims::velocity);
        r.hasRase = true;
    }
    if (!r.hasMax && !r.hasRase)
        throw std::runtime_error("lineDesign: a service declares `max <m/s>;`"
            " or the Rase form `raseSlopePerMm; raseIntercept;` as its upper"
            " velocity bound.");
    if (r.hasMin && r.hasMax && !(r.vMin > 0 && r.vMax > r.vMin))
        throw std::runtime_error("lineDesign: a velocity window needs"
            " 0 < min < max.");
    if (d->found("allowableDropPerMetre")) r.dropPerMetre = d->lookupScalar("allowableDropPerMetre");
    if (d->found("allowableDropFraction")) r.dropFraction = d->lookupScalar("allowableDropFraction");
    if (d->found("sonicFraction")) r.sonicFraction = d->lookupScalar("sonicFraction");
    return r;
}

struct Schedule { int number; scalar wall; };
struct NominalSize
{
    std::string name;
    scalar nps;                  // the case's number (inches)
    scalar od;                   // [m]
    std::vector<Schedule> schedules;   // ascending wall
};

//  Direction changes of a route: segments are axis-aligned, so a bend is a
//  vertex where the axis of travel changes.
int bendsOf(const std::vector<std::vector<scalar>>& route)
{
    auto axis = [&](std::size_t i) {
        const auto& a = route[i]; const auto& b = route[i + 1];
        const scalar d[3] = { std::fabs(b[0]-a[0]), std::fabs(b[1]-a[1]), std::fabs(b[2]-a[2]) };
        if (d[0] < 1e-9 && d[1] < 1e-9 && d[2] < 1e-9) return -1;
        return int(std::max_element(d, d + 3) - d);
    };
    int n = 0, prev = -1;
    for (std::size_t i = 0; i + 1 < route.size(); ++i)
    {
        const int a = axis(i);
        if (a < 0) continue;
        if (prev >= 0 && a != prev) ++n;
        prev = a;
    }
    return n;
}

} // namespace

void evaluate(const Dictionary& layoutDict, SimulationResult& result, int verbosity)
{
    if (!layoutDict.found("lineDesign")) return;
    PlantLayoutRecord& L = result.layout;
    if (!L.present()) return;

    const DictPtr LD = layoutDict.subDict("lineDesign");
    const std::string W = "lineDesign.";

    std::shared_ptr<const ThermoPackage> pkg =
        result.thermoForPost ? result.thermoForPost() : nullptr;
    if (!pkg)
        throw std::runtime_error("lineDesign: the run carries no thermophysical"
            " package for its post-processing passes; a line is sized on the"
            " density and viscosity of the stream it carries.");

    // ---- declarations --------------------------------------------------
    const std::string model = LD->found("frictionModel")
        ? LD->lookupWord("frictionModel") : std::string();
    if (model.empty())
        throw std::runtime_error("lineDesign: `frictionModel <word>;` is not"
            " declared (a registered friction-factor correlation).");

    const DictPtr rg = need(LD, "roughness", W);
    needText(rg, "roughness", "source"); needText(rg, "roughness", "reason");
    const scalar eps = rg->lookupScalar("value", Dims::length);

    const std::string matName = LD->found("material") ? LD->lookupWord("material") : "";
    if (matName.empty())
        throw std::runtime_error("lineDesign: `material <record>;` is not declared"
            " (a construction-material record, read for its allowable stress).");
    const Material& mat = MaterialRegistry::byName(matName);
    if (!(mat.sigma_y > 0))
        throw std::runtime_error("lineDesign: the material record '" + matName
            + "' carries no allowable stress (sigma_y).");

    const DictPtr wallD = need(LD, "wall", W);
    for (const char* k : { "source", "reason" }) needText(wallD, "wall", k);
    const scalar Eq = wallD->lookupScalar("qualityFactor");
    const scalar gT = wallD->lookupScalar("temperatureCoefficient");
    const scalar corr = wallD->lookupScalar("allowance", Dims::length);
    const scalar mill = wallD->lookupScalar("millUndertolerance");
    const scalar dpF  = wallD->lookupScalar("designPressureFactor");
    if (!(Eq > 0 && Eq <= 1) || !(gT >= 0) || !(corr >= 0) || !(mill >= 0 && mill < 0.5) || !(dpF >= 1))
        throw std::runtime_error("lineDesign.wall: qualityFactor in (0,1], temperatureCoefficient"
            " >= 0, allowance >= 0, millUndertolerance in [0,0.5), designPressureFactor >= 1.");

    const DictPtr ns = need(LD, "nominalSizes", W);
    for (const char* k : { "source", "reason" }) needText(ns, "nominalSizes", k);
    std::vector<NominalSize> sizes;
    if (!ns->hasDictList("sizes"))
        throw std::runtime_error("lineDesign.nominalSizes: `sizes ( { nominalSize; outsideDiameter;"
            " schedules ( { schedule; wall; } ... ); } ... );` is not declared.");
    for (const DictPtr& s : ns->lookupDictList("sizes"))
    {
        NominalSize n;
        n.nps = s->lookupScalar("nominalSize");
        n.name = fmt(n.nps);
        n.od = s->lookupScalar("outsideDiameter", Dims::length);
        if (!s->hasDictList("schedules"))
            throw std::runtime_error("lineDesign.nominalSizes: size " + n.name + " declares no `schedules`.");
        for (const DictPtr& c : s->lookupDictList("schedules"))
            n.schedules.push_back({ int(std::lround(c->lookupScalar("schedule"))),
                                    c->lookupScalar("wall", Dims::length) });
        std::sort(n.schedules.begin(), n.schedules.end(),
                  [](const Schedule& a, const Schedule& b) { return a.wall < b.wall; });
        if (!(n.od > 0) || n.schedules.empty())
            throw std::runtime_error("lineDesign.nominalSizes: size " + n.name + " needs a positive outsideDiameter and schedules.");
        sizes.push_back(n);
    }
    std::sort(sizes.begin(), sizes.end(),
              [](const NominalSize& a, const NominalSize& b) { return a.od < b.od; });
    if (sizes.empty())
        throw std::runtime_error("lineDesign.nominalSizes: `sizes` is empty.");

    const DictPtr vel = need(LD, "services", W);
    std::map<std::string, ServiceRule> rules;
    for (const char* sv : { "liquidDischarge", "liquidSuction", "gas", "steam", "twoPhase" })
        if (vel->found(sv) && std::holds_alternative<DictPtr>(vel->entryValue(sv)))
            rules[sv] = readService(vel->subDict(sv));
    scalar steamAbove = 0;
    if (vel->found("steamAbove")) steamAbove = vel->lookupScalar("steamAbove", Dims::pressure);

    scalar rhoV2Limit = 0;
    std::string rhoV2Source;
    if (LD->found("erosion"))
    {
        const DictPtr e = LD->subDict("erosion");
        for (const char* k : { "source", "reason" }) needText(e, "erosion", k);
        rhoV2Limit  = e->lookupScalar("rhoV2Max");
        rhoV2Source = e->lookupWord("source");
        if (!(rhoV2Limit > 0)) throw std::runtime_error("lineDesign.erosion: rhoV2Max must be positive.");
    }

    scalar bendD = 0, valveD = 0; int valvesPerLine = 0;
    std::string fitSource;
    if (LD->found("fittings"))
    {
        const DictPtr f = LD->subDict("fittings");
        for (const char* k : { "source", "reason" }) needText(f, "fittings", k);
        fitSource = f->lookupWord("source");
        if (f->found("bendEquivalentDiameters")) bendD = f->lookupScalar("bendEquivalentDiameters");
        if (f->found("valveEquivalentDiameters")) valveD = f->lookupScalar("valveEquivalentDiameters");
        if (f->found("valvesPerLine")) valvesPerLine = int(std::lround(f->lookupScalar("valvesPerLine")));
    }

    //  cost: a declared price per metre per nominal size and schedule
    struct Price { scalar nps; int sch; scalar perMetre; };
    std::vector<Price> prices;
    scalar instF = 0, instPerM = 0; std::string currency, priceSource;
    if (LD->found("cost"))
    {
        const DictPtr c = LD->subDict("cost");
        for (const char* k : { "source", "reason", "currency" }) needText(c, "cost", k);
        currency = c->lookupWord("currency");
        priceSource = c->lookupWord("source");
        instF = c->found("installationFactor") ? c->lookupScalar("installationFactor") : 0.0;
        instPerM = c->found("installationPerMetre") ? c->lookupScalar("installationPerMetre") : 0.0;
        if (c->hasDictList("perMetre"))
            for (const DictPtr& q : c->lookupDictList("perMetre"))
                prices.push_back({ q->lookupScalar("nominalSize"),
                                   int(std::lround(q->lookupScalar("schedule"))),
                                   q->lookupScalar("price") });
    }

    //  forced services
    std::map<std::string, std::string> forced;
    if (LD->hasDictList("lines"))
        for (const DictPtr& d : LD->lookupDictList("lines"))
            forced[d->lookupWord("stream")] = d->lookupWord("service");

    FrictionFactorCorrelation::registerBuiltins();
    auto corrFn = FrictionFactorCorrelation::New(model);


    // ---- the lines -------------------------------------------------------
    for (const LayoutPipe& p : L.pipes)
    {
        if (!p.branch.empty()) continue;      // a header's branch carries no flow of its own
        LineSheet S;
        S.pipeId = p.id(); S.stream = p.stream;
        S.from = p.from; S.to = p.to;
        S.length = p.length;
        S.bends = bendsOf(p.route);
        S.valves = valvesPerLine;
        if (p.route.size() >= 2)
            S.elevationRise = p.route.back()[2] - p.route.front()[2];
        const std::string who = "line " + p.stream;

        auto notSized = [&](const std::string& why) {
            S.sized = false; S.notSizedBecause = why;
            L.lines.push_back(S);
        };

        auto st = result.streams.find(p.stream);
        if (st == result.streams.end()) { notSized("the stream is not in the solved flowsheet"); continue; }
        const ProcessStream& s = st->second;
        S.T = s.T; S.P = s.P;
        S.massFlow = F_massTotal(s, *pkg);

        //  service
        bool twoPhase = false, vapour = false;
        if (s.vf <= phaseTol) vapour = false;
        else if (s.vf >= 1.0 - phaseTol) vapour = true;
        else twoPhase = true;
        std::string svc;
        if (forced.count(p.stream)) { svc = forced[p.stream]; S.serviceWhy = "declared in `lines`"; }
        else if (twoPhase) { svc = "twoPhase"; S.serviceWhy = "vapour fraction " + fmt(s.vf); }
        else if (!vapour)
        {
            bool toPump = false;
            for (const auto& u : result.topology)
                if (p.toKind == "item" && u.name == p.toUnit && u.type == "pump") toPump = true;
            svc = toPump ? "liquidSuction" : "liquidDischarge";
            S.serviceWhy = toPump ? "a liquid whose `to` end is a pump" : "a liquid";
        }
        else
        {
            double water = 0;
            for (std::size_t i = 0; i < pkg->n() && i < s.z.size(); ++i)
                if (pkg->comp(i).name() == "water") water = s.z[i];
            if (steamAbove > 0 && water > 0.99 && s.P > steamAbove)
            { svc = "steam"; S.serviceWhy = "water vapour above " + fmt(steamAbove / 1e5) + " bar"; }
            else { svc = "gas"; S.serviceWhy = "a vapour"; }
        }
        S.service = svc;
        if (!rules.count(svc))
        {
            notSized("the case declares no `services." + svc + "` rule"
                     + (svc == "twoPhase" ? " (no book in the folder gives a two-phase velocity rule: Perry 9th ed. section Economic Pipe Diameter, pp. 6-14 to 6-15, says the economic-diameter guides do not apply to multiphase flow; declare a window with its reason to size such a line)" : ""));
            continue;
        }
        const ServiceRule& R = rules[svc];
        if (twoPhase)
        {
            notSized("two-phase: the phase densities and the pressure drop (Lockhart-Martinelli) are not built; the line is listed, not sized");
            continue;
        }

        //  fluid
        phaseDensity::Reading rd;
        try { rd = phaseDensity::of(result, p.stream, who); }
        catch (const std::exception& e) { notSized(e.what()); continue; }
        S.density = rd.rho;
        S.massFlow = rd.massFlow;
        S.volumeFlow = S.massFlow / S.density;
        scalar mu = 0;
        try {
            if (!vapour)
            {
                //  Asked over the components that have a liquid state here (the
                //  density's own selection, one home): a dissolved supercritical
                //  gas has no liquid law, is left out and renormalised, and the
                //  door announces what it left out.
                const pricedDensity::Selection sel =
                    pricedDensity::select(*pkg, s.T, s.P, s.z, DensityPhase::Liquid);
                mu = liquidProperty::evaluate(*pkg, liquidProperty::Property::viscosity, s.T, s.P,
                        sel.zPriced, liquidProperty::Consumer{"lineSheets", who}, sel.dropped).value;
            }
            else
                mu = pkg->viscosityGas(s.T, s.P, s.z);
        } catch (const std::exception& e) { notSized(std::string("viscosity: ") + e.what()); continue; }
        if (!(mu > 0) || !std::isfinite(mu)) { notSized("non-physical viscosity " + fmt(mu)); continue; }
        S.viscosity = mu;

        //  sonic velocity (ideal-gas value) for a gas
        scalar vSonic = 0;
        if (vapour && R.sonicFraction > 0)
        {
            scalar Mw = 0;
            for (std::size_t i = 0; i < pkg->n() && i < s.z.size(); ++i) Mw += s.z[i] * pkg->comp(i).MW();
            const scalar cp = pkg->Cp_ig(s.T, s.z);              // J/mol/K
            const scalar gam = cp / (cp - kR);
            vSonic = std::sqrt(gam * kR * s.T / (Mw * 1e-3));    // MW kg/kmol -> kg/mol
            S.velocitySonic = R.sonicFraction * vSonic;
        }
        if (rhoV2Limit > 0) { S.velocityErosion = std::sqrt(rhoV2Limit / S.density); S.rhoV2Limit = rhoV2Limit; }

        //  design pressure and the wall's demand
        const scalar Pg = std::max(0.0, (s.P - kAtm) * dpF);
        S.designPressure = Pg;
        const scalar Pmpa = Pg * 1e-6;
        S.scheduleNumberRequired = 1000.0 * Pmpa / mat.sigma_y;

        bool done = false;
        for (const NominalSize& n : sizes)
        {
            const scalar tp = Pmpa * n.od / (2.0 * (mat.sigma_y * Eq + Pmpa * gT));   // Eq. 5.8, N/mm2 x m
            const scalar tm = tp + corr;
            const scalar tnom = tm / (1.0 - mill);
            const Schedule* sch = nullptr;
            for (const Schedule& c : n.schedules)
                if (c.wall >= tnom * (1.0 - 1e-12)) { sch = &c; break; }
            if (!sch) continue;
            const scalar D = n.od - 2.0 * sch->wall;
            if (!(D > 0)) continue;
            const scalar v = 4.0 * S.volumeFlow / (kPi * D * D);
            scalar vmax = 1e300; std::string gov = "none";
            if (R.hasMax) { vmax = R.vMax; gov = "service window"; }
            if (R.hasRase)
            {
                const scalar vr = R.raseSlope * (D * 1000.0) + R.raseIntercept;
                if (vr < vmax) { vmax = vr; gov = "Rase form"; }
            }
            if (S.velocityErosion > 0 && S.velocityErosion < vmax) { vmax = S.velocityErosion; gov = "erosion rho v^2"; }
            if (S.velocitySonic > 0 && S.velocitySonic < vmax) { vmax = S.velocitySonic; gov = "sonic fraction"; }
            if (v > vmax * (1.0 + 1e-12)) continue;
            // accepted
            S.nominalSize = n.name; S.nps = n.nps; S.schedule = sch->number;
            S.outsideDiameter = n.od; S.wall = sch->wall; S.wallRequired = tm;
            S.insideDiameter = D; S.velocity = v;
            S.velocityMin = R.hasMin ? R.vMin : 0; S.velocityMax = vmax; S.governedBy = gov;
            done = true; break;
        }
        if (!done)
        {
            notSized("no declared size and schedule keeps the velocity inside the limits"
                     " (Q = " + fmt(S.volumeFlow * 3600.0) + " m3/h, design pressure "
                     + fmt(Pg * 1e-5) + " bar gauge); declare a larger size or a higher limit");
            continue;
        }

        //  hydraulics
        FrictionContext fc;
        fc.Re = S.density * S.velocity * S.insideDiameter / mu;
        fc.relRough = eps / S.insideDiameter;
        const FrictionResult fr = corrFn->evaluate(fc);
        S.reynolds = fc.Re; S.frictionFactor = fr.f;
        const scalar Leq = (S.bends * bendD + S.valves * valveD) * S.insideDiameter;
        S.equivalentLength = Leq;
        const scalar pd = 0.5 * S.density * S.velocity * S.velocity;
        S.dropFriction = fr.f * (S.length + Leq) / S.insideDiameter * pd;
        S.dropStatic = S.density * kG * S.elevationRise;
        S.dropTotal = S.dropFriction + S.dropStatic;
        S.dropPerMetre = fr.f / S.insideDiameter * pd;
        S.rhoV2 = S.density * S.velocity * S.velocity;
        if (R.dropPerMetre > 0) S.dropAllowable = R.dropPerMetre;
        else if (R.dropFraction > 0) S.dropAllowable = R.dropFraction * s.P;

        //  flags
        auto flag = [&](const std::string& t) { S.flags.push_back(t); };
        if (S.velocityMin > 0 && S.velocity < S.velocityMin)
            flag("velocity " + fmt(S.velocity) + " m/s below the window's minimum " + fmt(S.velocityMin) + " m/s (smallest declared size already taken)");
        if (S.dropAllowable > 0 && S.dropPerMetre > S.dropAllowable)
            flag("drop " + fmt(S.dropPerMetre) + " Pa/m exceeds the guide " + fmt(S.dropAllowable) + " Pa/m");
        if (vapour && S.dropFriction > 0.1 * s.P)
            flag("drop exceeds 10 % of the line pressure: a constant-density Darcy drop is not valid, divide the line");
        if (S.rhoV2Limit > 0 && S.rhoV2 > S.rhoV2Limit * (1.0 + 1e-9))
            flag("rho v^2 above the declared erosion limit");
        if (!fr.inValidity && !fr.validityNote.empty()) flag(fr.validityNote);
        if (mat.maxT > 0 && s.T > mat.maxT)
            flag("stream temperature " + fmt(s.T) + " K above the material record's maxT " + fmt(mat.maxT) + " K");
        if (mat.maxP > 0 && Pg * 1e-5 > mat.maxP)
            flag("design pressure " + fmt(Pg * 1e-5) + " bar above the material record's maxP " + fmt(mat.maxP) + " bar");
        if (rd.unpricedMoleFraction > 0.0) flag("density priced without " + fmt(rd.unpricedMoleFraction) + " mole fraction the package cannot price alone");

        //  cost
        if (prices.empty()) S.costNote = "not costed: the case declares no `cost { perMetre }` (the costing pass has no pipe correlation)";
        else
        {
            const Price* pr = nullptr;
            for (const Price& q : prices)
                if (std::fabs(q.nps - S.nps) < 1e-9 && q.sch == S.schedule) pr = &q;
            if (!pr) S.costNote = "not costed: no declared price for size " + S.nominalSize + " schedule " + std::to_string(S.schedule);
            else
            {
                S.costed = true; S.pricePerMetre = pr->perMetre; S.currency = currency;
                S.cost = S.length * (pr->perMetre * (1.0 + instF) + instPerM);
                S.costNote = "length x (price x (1 + F) + installation per metre), F = " + fmt(instF) + ", installation " + fmt(instPerM) + " per metre (Towler Eq. 5.10 form); " + priceSource;
            }
        }

        S.sized = true;
        S.basis = "service " + svc + " (" + S.serviceWhy + "); Q = m/rho = " + fmt(S.volumeFlow * 3600.0)
            + " m3/h at rho " + fmt(S.density) + " kg/m3, mu " + fmt(mu) + " Pa.s; the smallest declared size whose"
              " velocity at the inside diameter of the schedule the pressure needs is inside the limits"
              " (governed by " + S.governedBy + "); wall t_m = P d/(2(S E + P g)) + c, Towler Eq. 5.8, S "
            + fmt(mat.sigma_y) + " MPa (" + matName + "), design pressure " + fmt(Pg * 1e-5)
            + " bar gauge; Darcy f from " + model + " at Re " + fmt(fc.Re) + ", eps/D " + fmt(fc.relRough)
            + "; " + std::to_string(S.bends) + " bends and " + std::to_string(S.valves) + " valves as "
            + fmt(Leq) + " m of equivalent pipe (" + (fitSource.empty() ? "none declared" : fitSource)
            + "); static head from the route's " + fmt(S.elevationRise) + " m rise.  Gas viscosity is the dilute-gas model's;"
              " the sonic velocity is the ideal-gas value";
        L.lines.push_back(S);
    }

    L.lineBasis = "line list: velocity windows by service, wall, fittings and erosion limit as the case declares them"
                  " (lineDesign {}); sizes and schedules from the case's table; friction by " + model
                  + "; not modelled: two-phase drop, nozzle entrance and exit losses, the pump a line may need,"
                    " the economic diameter, a gas line's density change along its length";

    if (verbosity >= 2)
    {
        int n = 0, ns2 = 0;
        for (const auto& l : L.lines) { ++n; if (l.sized) ++ns2; }
        std::printf("  [lines] %d routed lines, %d sized, %d listed not sized (the case's lineDesign)\n", n, ns2, n - ns2);
    }
}

} // namespace lineSheets
} // namespace Choupo
