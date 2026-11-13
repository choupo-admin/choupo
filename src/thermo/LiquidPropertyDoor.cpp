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

#include "LiquidPropertyDoor.H"

#include "core/PropertySourceLog.H"
#include "thermo/ThermoPackage.H"

#include <cstdio>
#include <limits>
#include <map>
#include <set>
#include <string>
#include <vector>

namespace Choupo {
namespace liquidProperty {

namespace {

using Route = ThermoPackage::LiquidVolumeRoute;

//  THE ONE HOME of what each liquid-volume route is called, keyed by the
//  route the package reports it took.
const char* routeId(Route r)
{
    switch (r)
    {
        case Route::anchoredRackett: return "anchoredRackett";
        case Route::flatVliq:        return "flatVliq";
        case Route::bareRackett:     return "bareRackett";
        case Route::none:            return "none";
    }
    return "?";
}

const char* routeLabel(Route r)
{
    switch (r)
    {
        case Route::anchoredRackett: return "each component's 25 C molar volume scaled to temperature by Rackett";
        case Route::flatVliq:        return "each component's 25 C molar volume, with no temperature effect (its record has no critical constants)";
        case Route::bareRackett:     return "an estimate by Rackett from the critical constants (no measured volume in the record)";
        case Route::none:            return "no route";
    }
    return "?";
}

std::string kelvin(scalar T)
{
    char b[32];
    std::snprintf(b, sizeof b, "%.6g K", T);
    return b;
}

//  The route's label with the temperature its datum belongs to.  When every
//  component on the route is at 25 C (no `VliqT`), it is routeLabel() word
//  for word; when all share one stated temperature, that temperature replaces
//  "25 C"; when they differ, each component is named with its own.
std::string routeLabelAt(Route r, const std::vector<std::string>& who)
{
    if (r != Route::anchoredRackett && r != Route::flatVliq) return routeLabel(r);
    std::set<std::string> temps;
    for (const auto& w : who) temps.insert(w.substr(w.find(" at ") + 4));
    if (temps.empty() || (temps.size() == 1 && *temps.begin() == "25 C"))
        return routeLabel(r);
    std::string where;
    if (temps.size() == 1) where = "molar volume at " + *temps.begin();
    else
    {
        where = "molar volume at its datum temperature (";
        for (std::size_t k = 0; k < who.size(); ++k)
            where += (k ? ", " : "") + who[k];
        where += ")";
    }
    return r == Route::anchoredRackett
        ? "each component's " + where + " scaled to temperature by Rackett"
        : "each component's " + where + ", with no temperature effect (its record has no critical constants)";
}

const char* routeOrigin(Route r)
{
    switch (r)
    {
        case Route::anchoredRackett: return "literature";   // the level; Rackett gives the shape
        case Route::flatVliq:        return "literature";
        case Route::bareRackett:     return "estimated";
        case Route::none:            return "";
    }
    return "";
}

} // namespace

const char* name(Property p)
{
    switch (p)
    {
        case Property::density:        return "liquidDensity";
        case Property::viscosity:      return "liquidViscosity";
        case Property::surfaceTension: return "surfaceTension";
    }
    return "?";
}

Result evaluate(const ThermoPackage& thermo, Property p, scalar T, scalar P,
                const sVector& x, const Consumer* who, const std::string& leftOut)
{
    Result r;
    //  THE VALUE FIRST, through the package's own method: the same double,
    //  and its refusal unchanged.
    switch (p)
    {
        case Property::density:
            r.value = thermo.density(T, P, x, DensityPhase::Liquid);       break;
        case Property::viscosity:
            r.value = thermo.viscosityLiquid(T, x);                         break;
        case Property::surfaceTension:
            r.value = thermo.surfaceTension(T, x);                          break;
    }

    //  THEN THE DESCRIPTION, read from the decision the package took.
    r.quality.domain   = "not declared";
    r.quality.evidence = "not quantified";
    std::string pressure = "not applied";
    if (const auto i = thermo.pureFluidCarrying(x))
    {
        const std::string m = thermo.pureFluidMethod(*i);
        r.methodId = "pureFluid." + m;
        r.leaves.push_back({ thermo.comp(*i).name(), r.methodId, 1.0 });
        r.quality.origin     = "regressed";
        r.quality.provenance = "the case's pureFluids selection (" + m + ")";
        if (p == Property::density)
        {
            r.label = "property kernel: the pure-fluid formulation " + m + " at the temperature and pressure";
            r.pressureApplied = true;
            pressure = "applied";
        }
        else
        {
            r.label = "property kernel: the pure-fluid formulation " + m
                    + " on the saturation line";
            pressure = (p == Property::viscosity) ? "not applied (saturated liquid)"
                                                  : "";
        }
    }
    else if (p == Property::density)
    {
        scalar zs = 0.0;
        for (std::size_t k = 0; k < x.size(); ++k) if (x[k] > 0.0) zs += x[k];
        std::set<Route> routes;
        //  THE DATUM'S TEMPERATURE, per route that reads `Vliq` (C378): a
        //  record that states `VliqT` is named with it; the rest are at
        //  25 C, so a request that touches no `VliqT` record is labelled
        //  word for word as before.
        std::map<Route, std::vector<std::string>> datumT;
        for (std::size_t k = 0; k < x.size() && k < thermo.n(); ++k)
            if (x[k] > 0.0)
            {
                const Route rt = thermo.liquidVolumeRouteOf(k);
                routes.insert(rt);
                const Component& ck = thermo.comp(k);
                if (rt == Route::anchoredRackett || rt == Route::flatVliq)
                    datumT[rt].push_back(ck.hasVliqT()
                        ? ck.name() + " at " + kelvin(ck.VliqT())
                        : ck.name() + " at 25 C");
                r.leaves.push_back({ thermo.comp(k).name(),
                                     std::string("liquidVolume.") + routeId(rt),
                                     zs > 0.0 ? x[k] / zs : 0.0 });
            }
        r.methodId = "liquidVolume.idealMix[";
        r.label    = "property kernel: ideal mixing of liquid volumes, ";
        bool first = true;
        for (const Route rt : routes)
        {
            r.methodId += std::string(first ? "" : "+") + routeId(rt);
            r.label    += std::string(first ? "" : "; ") + routeLabelAt(rt, datumT[rt]);
            if (r.quality.origin.empty() || std::string(routeOrigin(rt)) == "estimated")
                r.quality.origin = routeOrigin(rt);
            first = false;
        }
        r.methodId += "]";
        r.quality.provenance = "the component records' Vliq, Tc, Pc, omega";
    }
    else
    {
        const std::string m = (p == Property::viscosity) ? thermo.liquidViscosityMethod()
                                                         : thermo.surfaceTensionMethod();
        r.methodId = m;
        r.label = std::string("property kernel: the ")
                + (p == Property::viscosity ? "viscosity" : "surface-tension")
                + " model and mixing rule the case selects (" + m + ")";
        r.quality.origin     = "regressed";
        r.quality.provenance = "the component records' transport blocks";
        pressure = (p == Property::viscosity) ? "not applied (saturated liquid)" : "";
        scalar zs = 0.0;
        for (std::size_t k = 0; k < x.size(); ++k) if (x[k] > 0.0) zs += x[k];
        for (std::size_t k = 0; k < x.size() && k < thermo.n(); ++k)
            if (x[k] > 0.0)
                r.leaves.push_back({ thermo.comp(k).name(), m, zs > 0.0 ? x[k] / zs : 0.0 });
    }

    std::string type, unit;
    if (who) { type = who->type; unit = who->unit; }
    else if (!PropertySourceLog::instance().current(type, unit)) return r;
    PropertySourceLog::instance().use(type, unit, name(p),
        r.methodId, r.label, "kernel", pressure, leftOut,
        took(r.value, T, P > 0.0 ? P : std::numeric_limits<double>::quiet_NaN(),
             compositionKey(x)));
    return r;
}

} // namespace liquidProperty
} // namespace Choupo
