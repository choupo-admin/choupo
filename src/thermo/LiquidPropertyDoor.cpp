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
#include "thermo/liquidProperty/DensityLeaf.H"
#include "thermo/pureFluid/PureFluidModel.H"

#include <stdexcept>
#include <cstdio>
#include <iostream>
#include <limits>
#include <map>
#include <mutex>
#include <set>
#include <string>
#include <vector>

namespace Choupo {
namespace liquidProperty {

namespace {

using Route = ThermoPackage::LiquidVolumeRoute;

//  The route words have ONE home, the record-volume leaves of the kernel
//  (liquidProperty/DensityLeaf.H); the slice-0 description of
//  `ThermoPackage::density` reads them there.
const char* routeId(Route r) { return recordRouteId(static_cast<int>(r)); }
std::string routeLabel(Route r, const std::vector<std::string>& statedAt = {})
{ return recordRouteWords(static_cast<int>(r), statedAt); }
const char* routeOrigin(Route r) { return recordRouteOrigin(static_cast<int>(r)); }

} // namespace

std::vector<std::string> statedDatumTemperatures(const ThermoPackage& thermo, const sVector& x)
{
    std::vector<std::string> out;
    for (std::size_t k = 0; k < x.size() && k < thermo.n(); ++k)
        if (x[k] > 0.0 && thermo.comp(k).hasVliqT()) out.push_back(datumOf(thermo.comp(k)));
    return out;
}

const char* name(Property p)
{
    switch (p)
    {
        case Property::density:        return "liquidDensity";
        case Property::viscosity:      return "liquidViscosity";
        case Property::surfaceTension: return "surfaceTension";
        case Property::thermalConductivity: return "liquidThermalConductivity";
        case Property::diffusivity:    return "liquidDiffusivity";
    }
    return "?";
}

namespace {
Result evaluateImpl(const ThermoPackage& thermo, Property p, scalar T, scalar P,
                    const sVector& x, const Consumer* who, const std::string& leftOut,
                    bool record, long component = -1);
}

Result evaluate(const ThermoPackage& thermo, Property p, scalar T, scalar P,
                const sVector& x, const Consumer* who, const std::string& leftOut,
                long component)
{
    return evaluateImpl(thermo, p, T, P, x, who, leftOut, true, component);
}

Result soluteDiffusivity(const ThermoPackage& thermo, scalar T, std::size_t iSolute,
                         std::size_t iSolvent, const Consumer* who)
{
    Result r;
    r.value = thermo.diffusivityLiquid(T, iSolute, iSolvent);
    const std::string sol = thermo.comp(iSolute).name();
    const std::string slv = thermo.comp(iSolvent).name();
    const auto* e = thermo.liquidDiffusivityDeclaration().entryFor(iSolute, iSolvent);
    if (e && e->model.empty())
    {
        r.methodId = "declared.infiniteDilution";
        r.label = "property kernel: the case's declared value of " + sol + " in " + slv
                + " at infinite dilution (" + e->where + "; source: " + e->source
                + "), stood over the box the case declared";
        r.quality.origin     = "literature";
        r.quality.provenance = e->source.empty() ? e->where : e->source;
        r.quality.domain     = "inside the case's box (hard)";
    }
    else
    {
        r.methodId = thermo.liquidDiffusivityMethod();
        r.label = "property kernel: the infinite-dilution correlation the case selects ("
                + (e ? e->model : thermo.liquidDiffusivityMethod()) + ") for " + sol
                + " in " + slv;
        r.quality.origin     = "predictive";
        r.quality.provenance = "the case's transport { liquid { diffusivity } }";
        r.quality.domain     = "not declared";
    }
    r.quality.evidence = "not quantified";
    r.leaves.push_back({ sol, r.methodId, 1.0 });
    if (who)
        PropertySourceLog::instance().use(who->type, who->unit, name(Property::diffusivity),
            r.methodId, r.label, "kernel", "not applied", "",
            took(r.value, T));
    return r;
}

stokesEinstein::Factor ionDiffusivityFactor(const ThermoPackage& thermo, scalar T_K, long iSolvent)
{
    return iSolvent < 0 ? stokesEinstein::factor(thermo, T_K)
                        : stokesEinstein::factorFor(thermo, static_cast<std::size_t>(iSolvent), T_K);
}

Result evaluateUnrecorded(const ThermoPackage& thermo, Property p, scalar T,
                          scalar P, const sVector& x)
{
    return evaluateImpl(thermo, p, T, P, x, nullptr, "", false);
}

namespace {
Result evaluateImpl(const ThermoPackage& thermo, Property p, scalar T, scalar P,
                    const sVector& x, const Consumer* who, const std::string& leftOut,
                    bool record, long component)
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
        case Property::thermalConductivity:
            r.value = thermo.thermalConductivityLiquid(T, x);               break;
        case Property::diffusivity:
            r.value = component >= 0
                ? thermo.diffusivityLiquidEffective(T, x, static_cast<std::size_t>(component))
                : thermo.diffusivityLiquidEffective(T, x);                  break;
    }

    //  THEN THE DESCRIPTION, read from the decision the package took.
    r.quality.domain   = "not declared";
    r.quality.evidence = "not quantified";
    std::string pressure = "not applied";
    const char* measuredProperty = p == Property::viscosity           ? "liquidViscosity"
                                 : p == Property::thermalConductivity ? "liquidThermalConductivity"
                                 : p == Property::surfaceTension      ? "surfaceTension" : nullptr;
    const liquidTransport::MixtureMeasurement* measured =
        measuredProperty ? thermo.measuredMixtureFor(measuredProperty, x) : nullptr;
    if (measured)
    {
        //  A STATED MIXTURE VISCOSITY the case marks as its set's method
        //  (C398 slice (d)): the value at every state inside its box, named by
        //  what its file says it is (review row DF-04: a representative value,
        //  an average, a measurement); at the stated point (T AND composition,
        //  review row DG-08) the source's value, elsewhere the case's
        //  assumption.  The origin is printed per site and origin, as the
        //  density's is (review row DF-10).
        r.methodId = "stated." + measured->name;
        const std::string quantity = liquidTransport::quantityWord(measured->property);
        r.label = measured->isTable()
            ? "property kernel: the case's " + liquidTransport::statedWords(*measured) + " ("
              + measured->where + "), interpolated inside its rows (" + liquidTransport::interpolationWords(*measured)
              + "), the nearest edge held inside the " + liquidTransport::boxName(*measured) + " the case declared"
              + (measured->reason.empty() ? std::string() : " (reason: " + measured->reason + ")")
              + "; kind " + measured->kind
            : "property kernel: the case's " + liquidTransport::statedWords(*measured) + " ("
              + measured->where + "), stood over the box the case declared"
                " (reason: " + measured->reason + ")"
              + (measured->kind.empty() ? std::string() : "; kind " + measured->kind);
        const auto wState = liquidTransport::massFractionsOf(thermo.components(), measured->set, x);
        const bool atPoint = liquidTransport::atStatedPoint(*measured, T, wState);
        //  A TABLE (C421 (8)): a row's own value is the source's; between rows it is derived from
        //  them; past the support the nearest edge is held, the case's assumption; the record's
        //  `kind` can only lower this (adopted: assumed; estimated: estimated).
        const bool inside = measured->isTable() ? liquidTransport::insideSupport(*measured, T, wState) : atPoint;
        if (measured->isTable())
            r.quality.origin = measured->kind == "estimated" ? "estimated"
                             : (measured->kind == "adopted" || measured->assumedValue || !inside) ? "assumed"
                             : atPoint ? "literature" : "derived";
        else
            r.quality.origin = (atPoint && !measured->assumedValue) ? "literature" : "assumed";
        {
            std::string type, unit;
            const bool site = who ? (type = who->type, unit = who->unit, true)
                                  : PropertySourceLog::instance().current(type, unit);
            static std::mutex mx;
            static std::set<std::string> printed;
            const std::string key = measured->name + "|" + (site ? type + " " + unit : "no unit")
                                  + "|" + r.quality.origin;
            bool fresh = false;
            { std::lock_guard<std::mutex> lk(mx); fresh = printed.insert(key).second; }
            if (fresh && record)
                std::cout << "  [" << quantity << "] " << (site ? type + " " + unit : std::string("no unit"))
                          << ": " << r.methodId << " (origin " << r.quality.origin << "; "
                          << (atPoint ? "the source's stated point"
                                      : measured->isTable() && inside ? "between the source's rows, interpolated"
                                      : measured->isTable() ? "past the rows' support, the nearest edge held"
                                      : "away from the source's stated point, the case's assumption")
                          << ")\n";
        }
        r.quality.provenance = measured->where;
        r.quality.domain     = measured->isTable() ? "inside the case's " + liquidTransport::boxName(*measured) + " (hard); interpolated inside the rows"
                                                   : std::string("inside the case's box (hard)");
        for (const std::size_t k : measured->set)
            r.leaves.push_back({ thermo.comp(k).name(), r.methodId, 0.0 });
        pressure = "not applied (saturated liquid)";
    }
    else if ((p == Property::thermalConductivity && !thermo.pureFluidCarrying(x))
             || p == Property::diffusivity)
    {
        //  A pure fluid carried by its formulation takes the branch below, as
        //  the package's own thermalConductivityLiquid does (its first test).
        const bool k = (p == Property::thermalConductivity);
        const std::string m = k ? thermo.liquidConductivityMethod() : thermo.liquidDiffusivityMethod();
        r.methodId = m;
        if (k)
            r.label = "property kernel: the thermal-conductivity model and mixing rule the case"
                      " selects (" + m + ")";
        else
        {
            const auto& d = thermo.liquidDiffusivityDeclaration();
            r.label = "property kernel: the effective liquid diffusivity the case declares --"
                      " rule " + std::string(liquidTransport::ruleName(d.rule)) + " ("
                    + liquidTransport::ruleEquation(d.rule) + ")"
                    + (d.reduction == liquidTransport::Reduction::none ? std::string()
                        : ", reduced to one value per component by " + std::string(liquidTransport::reductionName(d.reduction))
                          + " (" + liquidTransport::reductionEquation(d.reduction) + ")"
                          + (component >= 0 && static_cast<std::size_t>(component) < thermo.n()
                                 ? ", for " + thermo.comp(static_cast<std::size_t>(component)).name()
                                 : std::string()))
                    + " on infinite-dilution values"
                      " from " + (d.defaultModel.empty() ? std::string("the case's entries")
                                                          : d.defaultModel
                                  + (d.entries.empty() ? "" : " and the case's entries"))
                    + ", the thermodynamic factor taken as 1";
        }
        r.quality.origin     = "predictive";
        r.quality.provenance = "the case's transport { liquid { "
                             + std::string(k ? "thermalConductivity" : "diffusivity") + " } }";
        pressure = "not applied";
        scalar zs = 0.0;
        for (std::size_t q = 0; q < x.size(); ++q) if (x[q] > 0.0) zs += x[q];
        for (std::size_t q = 0; q < x.size() && q < thermo.n(); ++q)
            if (x[q] > 0.0)
                r.leaves.push_back({ thermo.comp(q).name(), m, zs > 0.0 ? x[q] / zs : 0.0 });
    }
    else if (const auto i = thermo.pureFluidCarrying(x))
    {
        const std::string m = thermo.pureFluidMethod(*i);
        const PureFluidModel* model = thermo.pureFluidModel(*i);
        r.methodId = "pureFluid." + m;
        r.leaves.push_back({ thermo.comp(*i).name(), r.methodId, 1.0 });
        r.quality.origin     = "regressed";
        r.quality.provenance = "the case's pureFluids selection (" + m + ")";
        if (p == Property::density)
        {
            //  The words follow the one phase decision the package took
            //  (pureFluidPhaseState, C378 pilot defect 1).
            const bool line = pureFluidPhaseState(*model, T, P, true).branch
                           != PureFluidPhaseBranch::oneFluid;
            r.label = "property kernel: the pure-fluid formulation "
                    + model->densityFormulation()
                    + (line ? ", liquid branch at the temperature and pressure; at or"
                              " below the saturation pressure, the saturated liquid at T"
                            : " at the temperature and pressure (no saturation line"
                              " at this temperature: one fluid)");
            r.pressureApplied = true;
            pressure = "applied";
        }
        else
        {
            //  The formulation that gives THIS property, named by the model
            //  that computed it (DR-01): IF97 gives no viscosity and no
            //  surface tension.
            const bool sat = (p == Property::viscosity || p == Property::thermalConductivity);
            r.label = "property kernel: "
                    + (p == Property::viscosity           ? model->viscosityFormulation()
                     : p == Property::thermalConductivity ? model->conductivityFormulation()
                                                          : model->surfaceTensionFormulation())
                    + (sat ? ", at saturation" : "");
            pressure = sat ? "not applied (saturated liquid)" : "";
        }
    }
    else if (p == Property::density)
    {
        scalar zs = 0.0;
        for (std::size_t k = 0; k < x.size(); ++k) if (x[k] > 0.0) zs += x[k];
        std::set<Route> routes;
        //  The datum temperature of every component on a route that reads
        //  `Vliq`; handed to routeLabel only when one of them states `VliqT`,
        //  so a request at 25 C keeps its words byte for byte.
        std::map<Route, std::vector<std::string>> datumT;
        std::set<Route> stated;
        for (std::size_t k = 0; k < x.size() && k < thermo.n(); ++k)
            if (x[k] > 0.0)
            {
                const Route rt = thermo.liquidVolumeRouteOf(k);
                routes.insert(rt);
                const Component& ck = thermo.comp(k);
                if (rt == Route::anchoredRackett || rt == Route::flatVliq)
                {
                    datumT[rt].push_back(datumOf(ck));
                    if (ck.hasVliqT()) stated.insert(rt);
                }
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
            r.label    += std::string(first ? "" : "; ") + routeLabel(rt, stated.count(rt) ? datumT[rt] : std::vector<std::string>{});
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
        //  A block that names no model: each constituent's own law (a pin of a
        //  record law, a case's table), never an empty "()" (review row TG-07).
        if (p == Property::viscosity && m.empty())
        {
            const std::string laws = thermo.liquidViscosityLawsText(x, r.quality.origin,
                                                                    r.quality.provenance);
            r.methodId = "perConstituent";
            r.label = "property kernel: one law per constituent -- " + laws;
        }
        pressure = (p == Property::viscosity) ? "not applied (saturated liquid)" : "";
        scalar zs = 0.0;
        for (std::size_t k = 0; k < x.size(); ++k) if (x[k] > 0.0) zs += x[k];
        for (std::size_t k = 0; k < x.size() && k < thermo.n(); ++k)
            if (x[k] > 0.0)
                r.leaves.push_back({ thermo.comp(k).name(), m, zs > 0.0 ? x[k] / zs : 0.0 });
    }

    if (!record) return r;
    std::string type, unit;
    if (who) { type = who->type; unit = who->unit; }
    else if (!PropertySourceLog::instance().current(type, unit)) return r;
    PropertySourceLog::instance().use(type, unit, name(p),
        r.methodId, r.label, "kernel", pressure, leftOut,
        took(r.value, T, P > 0.0 ? P : std::numeric_limits<double>::quiet_NaN(),
             compositionKey(x)));
    return r;
}
} // namespace

} // namespace liquidProperty

//  ThermoPackage::soluteVolumeAtTb (declared in ThermoPackage.H, C398 slice d2).
//  Defined HERE, beside the door whose density it asks and whose words (the
//  route) it prints, so that the package's own source keeps its line numbers
//  (the EduTool lessons cite ThermoPackage.cpp by line).
const ThermoPackage::SoluteVolumeAtTb& ThermoPackage::soluteVolumeAtTb(std::size_t i) const
{
    const auto it = soluteVolumeTb_.find(i);
    if (it != soluteVolumeTb_.end()) return it->second;
    SoluteVolumeAtTb v;
    const Component& c = components_.at(i);
    v.Tb = c.Tb();
    if (!(v.Tb > 0.0))
        v.refusal = c.name() + " has no normal boiling point (Tb) in its record, so the"
                    " solute volume V_A of Wilke-Chang (Poling Eq. 11-9.1) cannot be taken at it";
    else
    {
        try
        {
            sVector e(n(), 0.0);
            e[i] = 1.0;
            const auto r = liquidProperty::evaluateUnrecorded(*this, liquidProperty::Property::density,
                                                              v.Tb, 101325.0, e);
            if (!(r.value > 0.0)) throw std::runtime_error("non-positive density");
            v.rho   = r.value;
            v.V_m3  = (c.MW() / 1000.0) / r.value;
            v.route = r.label;
            v.ok    = true;
        }
        catch (const std::exception& ex)
        {
            char tb[32];
            std::snprintf(tb, sizeof tb, "%.6g K", v.Tb);
            v.refusal = c.name() + " has no liquid density at its normal boiling point ("
                      + tb + "): " + ex.what();
        }
    }
    return soluteVolumeTb_.emplace(i, std::move(v)).first->second;
}

} // namespace Choupo
