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

#include <set>
#include <string>

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
        case Route::anchoredRackett: return "the record's Vliq (25 C) x Rackett(T)/Rackett(298.15 K)";
        case Route::flatVliq:        return "the record's Vliq (25 C) held flat (no Tc)";
        case Route::bareRackett:     return "bare Rackett from Tc, Pc, omega (an estimate)";
        case Route::none:            return "no route";
    }
    return "?";
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
            r.label = "kernel: the pure-fluid formulation " + m + ", v(T, P)";
            r.pressureApplied = true;
            pressure = "applied";
        }
        else
        {
            r.label = "kernel: the pure-fluid formulation " + m
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
        for (std::size_t k = 0; k < x.size() && k < thermo.n(); ++k)
            if (x[k] > 0.0)
            {
                const Route rt = thermo.liquidVolumeRouteOf(k);
                routes.insert(rt);
                r.leaves.push_back({ thermo.comp(k).name(),
                                     std::string("liquidVolume.") + routeId(rt),
                                     zs > 0.0 ? x[k] / zs : 0.0 });
            }
        r.methodId = "liquidVolume.idealMix[";
        r.label    = "kernel: ideal mixing of liquid volumes, ";
        bool first = true;
        for (const Route rt : routes)
        {
            r.methodId += std::string(first ? "" : "+") + routeId(rt);
            r.label    += std::string(first ? "" : "; ") + routeLabel(rt);
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
        r.label = std::string("kernel: ")
                + (p == Property::viscosity ? "liquid viscosity " : "surface tension ")
                + m + " (model/mixing rule)";
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
        r.methodId, r.label, "kernel", pressure, leftOut);
    return r;
}

} // namespace liquidProperty
} // namespace Choupo
