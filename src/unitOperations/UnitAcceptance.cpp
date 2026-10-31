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

#include "UnitAcceptance.H"
#include "UnitOperation.H"
#include "core/Identifiers.H"
#include "core/ProblemDivergence.H"
#include "thermo/ThermoPackage.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"     // findAqueousSpecies
#include "unitOperations/flash/StreamEquilibrium.H"   // the ONE inlet-phase reading

#include <algorithm>
#include <cstdio>
#include <variant>
#include <memory>
#include <stdexcept>

namespace Choupo {

const char* modelsRuleWord(UnitAcceptance::ModelsRule r)
{
    switch (r)
    {
        case UnitAcceptance::ModelsRule::everyComponent:
            return "everyComponent";
        case UnitAcceptance::ModelsRule::aqueousSolventAndNonvolatileSolutes:
            return "aqueousSolventAndNonvolatileSolutes";
        case UnitAcceptance::ModelsRule::aqueousSolventAndIons:
            return "aqueousSolventAndIons";
    }
    return "unknown";
}

const char* capabilityWord(UnitAcceptance::Capability c)
{
    switch (c)
    {
        case UnitAcceptance::Capability::aqueousActivityModel:
            return "aqueousActivityModel";
    }
    return "unknown";
}

const char* scopeWord(UnitAcceptance::Scope s)
{
    switch (s)
    {
        case UnitAcceptance::Scope::eachInlet:    return "eachInlet";
        case UnitAcceptance::Scope::combinedFeed: return "combinedFeed";
    }
    return "unknown";
}

const PassThroughDeclaration::Entry* PassThroughDeclaration::find(std::size_t i) const
{
    for (const auto& e : entries)
        if (e.index == i) return &e;
    return nullptr;
}

namespace {

//  Whether the rule carries component i.  On refusal `why` gets the reason
//  in the bridge's or the catalogue's own words (the one home of each).
bool modelledBy(UnitAcceptance::ModelsRule rule, std::size_t i,
                std::size_t iSolvent, const ThermoPackage& thermo,
                std::string& why)
{
    switch (rule)
    {
        case UnitAcceptance::ModelsRule::everyComponent:
            return true;
        case UnitAcceptance::ModelsRule::aqueousSolventAndNonvolatileSolutes:
            if (i == iSolvent || thermo.comp(i).isNonvolatile()) return true;
            why = "role '" + thermo.comp(i).role() + "'";
            return false;
        case UnitAcceptance::ModelsRule::aqueousSolventAndIons:
        {
            if (i == iSolvent) return true;
            //  The component -> species crossing is the DECLARED bridge, and
            //  its refusal sentence lives there (`singleMaster`).
            try
            {
                const SpeciesId sp = thermo.aqueousChemistry().singleMaster(
                    ComponentId(thermo.comp(i).name()));
                if (electrolyte::findAqueousSpecies(sp.key)) return true;
                why = "its species '" + sp.key + "' has no record in the"
                      " aqueous species catalogue (species/) -- this unit"
                      " needs an IONIC water analysis";
            }
            catch (const std::exception& e) { why = e.what(); }
            return false;
        }
    }
    return true;
}

bool needMet(UnitAcceptance::Capability c, const ThermoPackage& thermo)
{
    switch (c)
    {
        case UnitAcceptance::Capability::aqueousActivityModel:
        {
            const auto& aq = thermo.aqueousChemistry();
            return aq.declared && !aq.activityModel.empty();
        }
    }
    return true;
}

const char* needSentence(UnitAcceptance::Capability c)
{
    switch (c)
    {
        case UnitAcceptance::Capability::aqueousActivityModel:
            return "needs aqueous activities, but the case declares no aqueous"
                   " chemistry";
    }
    return "needs a capability the package lacks";
}

} // namespace

AcceptanceInlet acceptanceInletOf(const DictPtr&        feedDict,
                                  const sVector&        z,
                                  const ThermoPackage&  thermo,
                                  const std::string&    locus,
                                  const UnitAcceptance& acc)
{
    AcceptanceInlet in;
    in.streamName = feedDict->lookupWordOrDefault("streamName", "");
    in.T  = feedDict->lookupScalar("T", Dims::temperature);
    in.P  = feedDict->lookupScalar("P", Dims::pressure);
    in.z  = z;
    in.vf = (acc.phases.liquid && acc.phases.vapour)
          ? feedDict->lookupScalarOrDefault("vf", 0.0)
          : flashState::resolvedInletVaporFraction(feedDict, in.T, in.P, z,
                                                   thermo, locus);
    return in;
}

std::vector<std::string> acceptanceFindings(const UnitAcceptance&  acc,
                                            const std::string&     unitType,
                                            const AcceptanceInlet& inlet,
                                            const ThermoPackage&   thermo,
                                            const std::string&     where,
                                            const PassThroughDeclaration* pt)
{
    std::vector<std::string> out;
    const std::string head = where + " (type " + unitType + "): the feed"
        + (inlet.streamName.empty() ? std::string()
                                    : " (stream '" + inlet.streamName + "')");
    const std::size_t n = thermo.n();

    // ---- The phases the model is written for -------------------------------
    {
        const bool vapourPresent = inlet.vf > 0.0;
        const bool liquidPresent = inlet.vf < 1.0;
        const char* notWhat = nullptr;
        if (!acc.phases.vapour && vapourPresent)      notWhat = "a liquid";
        else if (!acc.phases.liquid && liquidPresent) notWhat = "a vapour";
        if (notWhat)
        {
            char b[200];
            std::snprintf(b, sizeof(b), "vapour fraction %.6g at T = %.2f K,"
                " P = %.4g bar", static_cast<double>(inlet.vf),
                static_cast<double>(inlet.T),
                static_cast<double>(inlet.P / 1.0e5));
            out.push_back(head + " is not " + notWhat + " (" + b + ").  "
                + acc.phases.why + "  REMEDY: " + acc.phases.remedy);
        }
    }

    // ---- The aqueous solvent -----------------------------------------------
    const std::size_t iSolvent = thermo.findAqueousSolvent();
    if (acc.solvent.aqueousRequired)
    {
        const std::string& sv = thermo.aqueousSolventName();
        if (iSolvent >= n)
            out.push_back(head + " carries no " + sv + " -- the aqueous solvent"
                " '" + sv + "' is not a component of this package -- and "
                + acc.solvent.why + "  REMEDY: " + acc.solvent.remedy);
        else if (!(inlet.z[iSolvent] > 0.0))
            out.push_back(head + " carries no " + sv + " (z_" + sv + " = "
                + std::to_string(inlet.z[iSolvent]) + "), and "
                + acc.solvent.why + "  REMEDY: " + acc.solvent.remedy);
    }

    // ---- The package capabilities the unit reads ---------------------------
    //  About the PACKAGE, not the stream: the head names no stream, so the
    //  same finding on two inlets is one sentence (the pre-solve pass keeps
    //  one copy).
    for (const auto& nd : acc.needs)
        if (!needMet(nd.what, thermo))
            out.push_back(where + " (type " + unitType + ") "
                + needSentence(nd.what) + " (`" + capabilityWord(nd.what)
                + "`).  " + nd.why + "\n    REMEDY: " + nd.remedy);

    // ---- The components the equations carry ---------------------------------
    if (acc.models.rule != UnitAcceptance::ModelsRule::everyComponent)
    {
        std::string unmodelled;
        std::size_t nModelledSolutes = 0;
        for (std::size_t i = 0; i < n && i < inlet.z.size(); ++i)
        {
            if (!(inlet.z[i] > 0.0)) continue;
            if (pt && pt->find(i)) continue;      // declared to pass through
            std::string why;
            if (modelledBy(acc.models.rule, i, iSolvent, thermo, why))
            {
                if (i != iSolvent) ++nModelledSolutes;
                continue;
            }
            unmodelled += "\n      '" + thermo.comp(i).name() + "' (z = "
                + std::to_string(inlet.z[i]) + "): " + why;
        }
        if (!unmodelled.empty())
        {
            std::string remedy = acc.models.remedy;
            if (!acc.passThroughFates.empty())
            {
                std::string fates;
                for (std::size_t k = 0; k < acc.passThroughFates.size(); ++k)
                    fates += (k ? " | " : "") + acc.passThroughFates[k];
                remedy += "  OR, if the component crosses this unit without"
                    " entering its equations, DECLARE that approximation in"
                    " the unit's entry:\n        passThrough { <component> {"
                    " fate " + fates + "; }  reason \"...\"; }";
            }
            out.push_back(head + " carries component(s) this unit does not"
                " model:" + unmodelled + "\n"
                "    It models " + acc.models.sentence + "; " + acc.models.why
                + "\n    REMEDY: " + remedy);
        }
        else if (acc.models.atLeastOne && nModelledSolutes == 0)
            out.push_back(head + " carries none of the components this unit"
                " acts on -- it models " + acc.models.sentence + ".  "
                + acc.models.noneWhy);
    }

    // ---- Any further declared condition ------------------------------------
    for (const auto& c : acc.refusesAlso)
        if (c.test)
            if (auto detail = c.test(inlet, thermo))
                out.push_back(head + " " + *detail + ".  " + c.sentence
                    + "  REMEDY: " + c.remedy);
    return out;
}

namespace {

[[noreturn]] void throwFindings(const std::vector<std::string>& f)
{
    std::string msg = f.front();
    for (std::size_t k = 1; k < f.size(); ++k) msg += "\n  " + f[k];
    throw std::runtime_error(msg);
}

} // namespace

void checkAcceptance(const UnitOperation&   unit,
                     const AcceptanceInlet& inlet,
                     const ThermoPackage&   thermo,
                     const std::string&     where,
                     const PassThroughDeclaration* pt)
{
    const auto f = acceptanceFindings(unit.acceptance(), unit.type(), inlet,
                                      thermo, where, pt);
    if (!f.empty()) throwFindings(f);
}

void checkAcceptance(const UnitAcceptance&  acc,
                     const std::string&     unitType,
                     const AcceptanceInlet& inlet,
                     const ThermoPackage&   thermo,
                     const std::string&     where)
{
    const auto f = acceptanceFindings(acc, unitType, inlet, thermo, where);
    if (!f.empty()) throwFindings(f);
}

std::vector<std::string> passThroughFindings(const DictPtr&          unitDict,
                                             const UnitAcceptance&   acc,
                                             const std::string&      unitType,
                                             const ThermoPackage&    thermo,
                                             const std::string&      where,
                                             PassThroughDeclaration& out)
{
    out = PassThroughDeclaration{};
    std::vector<std::string> f;
    if (!unitDict || !unitDict->found("passThrough")) return f;
    const std::string head = where + " (type " + unitType + ") `passThrough`";

    if (acc.passThroughFates.empty())
    {
        f.push_back(head + ": this unit offers NO pass-through -- every"
            " component it is handed enters its equations or is refused, so a"
            " declared crossing would be a decision the unit cannot honour.  "
            "REMEDY: remove the block, and either price the component with a"
            " model this unit reads or remove it from the feed.");
        return f;
    }
    std::string offered;
    for (std::size_t k = 0; k < acc.passThroughFates.size(); ++k)
        offered += (k ? " | " : "") + acc.passThroughFates[k];

    const auto pd = unitDict->subDict("passThrough");
    const std::size_t n = thermo.n();
    const std::size_t iSolvent = thermo.findAqueousSolvent();
    for (const auto& key : pd->keys())
    {
        if (key == "reason") continue;
        if (!std::holds_alternative<DictPtr>(pd->entryValue(key)))
        {
            f.push_back(head + ": `" + key + "` is neither `reason` nor a"
                " component block.  The grammar is  passThrough { <component>"
                " { fate " + offered + "; }  reason \"...\"; }");
            continue;
        }
        std::size_t i = n;
        for (std::size_t c = 0; c < n; ++c)
            if (thermo.comp(c).name() == key) { i = c; break; }
        if (i >= n)
        {
            f.push_back(head + ": '" + key + "' is not a component of this"
                " package -- a pass-through names a component the case"
                " declares.");
            continue;
        }
        if (i == iSolvent)
        {
            f.push_back(head + ": '" + key + "' is the aqueous solvent.  The"
                " solvent IS the medium this unit's equations are written in;"
                " it cannot cross the unit outside them.  REMEDY: remove it"
                " from the block.");
            continue;
        }
        std::string why;
        if (modelledBy(acc.models.rule, i, iSolvent, thermo, why))
        {
            f.push_back(head + ": '" + key + "' is a component this unit"
                " MODELS (" + acc.models.sentence + ").  A pass-through of a"
                " modelled component would take it out of the equations that"
                " price it -- a listing nobody needs reads like a decision.  "
                "REMEDY: remove it from the block.");
            continue;
        }
        const auto cd = pd->subDict(key);
        const std::string fate = cd->lookupWordOrDefault("fate", "");
        for (const auto& ck : cd->keys())
            if (ck != "fate")
                f.push_back(head + " '" + key + "': unknown key `" + ck
                    + "` -- the block takes only `fate " + offered + ";`.");
        if (fate.empty())
        {
            f.push_back(head + " '" + key + "': no `fate` -- where a component"
                " the unit does not model leaves IS a model choice, and the"
                " engine supplies none.  Declare `fate " + offered + ";`.");
            continue;
        }
        if (std::find(acc.passThroughFates.begin(), acc.passThroughFates.end(),
                      fate) == acc.passThroughFates.end())
        {
            f.push_back(head + " '" + key + "': fate '" + fate + "' is not"
                " offered by this unit.  Offered: " + offered + ".  "
                + acc.passThroughWhy);
            continue;
        }
        out.entries.push_back({ key, i, fate });
    }
    out.reason = pd->lookupWordOrDefault("reason", "");
    if (out.reason.empty())
        f.push_back(head + ": no `reason`.  A pass-through claims the unit's"
            " mechanism does not act on the component -- a claim about"
            " physics the engine cannot verify, so the case states it:"
            " `reason \"...\";`.");
    if (out.entries.empty() && f.empty())
        f.push_back(head + ": the block names no component.  REMEDY: remove"
            " it, or name the component(s) that cross the unit.");
    if (!f.empty()) out = PassThroughDeclaration{};
    return f;
}

PassThroughDeclaration readPassThrough(const DictPtr&        unitDict,
                                       const UnitAcceptance& acc,
                                       const std::string&    unitType,
                                       const ThermoPackage&  thermo,
                                       const std::string&    where)
{
    PassThroughDeclaration pt;
    const auto f = passThroughFindings(unitDict, acc, unitType, thermo, where, pt);
    if (!f.empty()) throwFindings(f);
    return pt;
}

void recordPassThrough(const PassThroughDeclaration& pt,
                       const std::string&            where)
{
    for (const auto& e : pt.entries)
        ProblemDivergence::instance().add("declaredApproximation", where,
            "pass " + e.component + " through to the " + e.fate + " outlet",
            e.component + " entered none of the unit's equations; every mole"
            " of it fed to the unit left in the " + e.fate + " outlet",
            pt.reason);
}

namespace {

std::string esc(const std::string& s)
{
    std::string o;
    o.reserve(s.size() + 8);
    for (const char c : s)
    {
        switch (c)
        {
            case '"':  o += "\\\""; break;
            case '\\': o += "\\\\"; break;
            case '\n': o += "\\n";  break;
            case '\t': o += "\\t";  break;
            default:
                if (static_cast<unsigned char>(c) < 0x20)
                {
                    char b[8];
                    std::snprintf(b, sizeof(b), "\\u%04x", c);
                    o += b;
                }
                else o += c;
        }
    }
    return o;
}

std::string q(const std::string& s) { return "\"" + esc(s) + "\""; }

} // namespace

void describeAcceptancesJson(
    std::ostream& os,
    const std::vector<std::pair<std::string, UnitAcceptance>>& units)
{
    os << "{\n  \"schema\": \"unitAcceptance-v1\",\n  \"units\": [";
    bool first = true;
    for (const auto& [t, a] : units)
    {
        os << (first ? "\n" : ",\n");
        first = false;
        os << "    {\n      \"type\": " << q(t)
           << ",\n      \"declared\": " << (a.declared ? "true" : "false");
        os << ",\n      \"appliesTo\": " << q(scopeWord(a.appliesTo));
        os << ",\n      \"phases\": { \"accepted\": [";
        bool f2 = true;
        if (a.phases.liquid) { os << "\"liquid\""; f2 = false; }
        if (a.phases.vapour) { os << (f2 ? "" : ", ") << "\"vapour\""; }
        os << "]";
        if (!a.phases.why.empty())    os << ", \"why\": " << q(a.phases.why);
        if (!a.phases.remedy.empty()) os << ", \"remedy\": " << q(a.phases.remedy);
        os << " }";
        os << ",\n      \"solvent\": { \"aqueousRequired\": "
           << (a.solvent.aqueousRequired ? "true" : "false");
        if (!a.solvent.why.empty())    os << ", \"why\": " << q(a.solvent.why);
        if (!a.solvent.remedy.empty()) os << ", \"remedy\": " << q(a.solvent.remedy);
        os << " }";
        os << ",\n      \"needs\": [";
        for (std::size_t k = 0; k < a.needs.size(); ++k)
            os << (k ? ", " : "") << "{ \"capability\": "
               << q(capabilityWord(a.needs[k].what))
               << ", \"why\": " << q(a.needs[k].why)
               << ", \"remedy\": " << q(a.needs[k].remedy) << " }";
        os << "]";
        os << ",\n      \"models\": { \"rule\": " << q(modelsRuleWord(a.models.rule))
           << ", \"sentence\": " << q(a.models.sentence);
        if (!a.models.why.empty())    os << ", \"why\": " << q(a.models.why);
        if (!a.models.remedy.empty()) os << ", \"remedy\": " << q(a.models.remedy);
        if (a.models.atLeastOne)
            os << ", \"atLeastOne\": true, \"noneWhy\": " << q(a.models.noneWhy);
        os << " }";
        os << ",\n      \"passThrough\": { \"fates\": [";
        for (std::size_t k = 0; k < a.passThroughFates.size(); ++k)
            os << (k ? ", " : "") << q(a.passThroughFates[k]);
        os << "]";
        if (!a.passThroughWhy.empty()) os << ", \"why\": " << q(a.passThroughWhy);
        os << " }";
        os << ",\n      \"refusesAlso\": [";
        for (std::size_t k = 0; k < a.refusesAlso.size(); ++k)
            os << (k ? ", " : "") << "{ \"id\": " << q(a.refusesAlso[k].id)
               << ", \"sentence\": " << q(a.refusesAlso[k].sentence)
               << ", \"remedy\": " << q(a.refusesAlso[k].remedy) << " }";
        os << "]\n    }";
    }
    os << "\n  ]\n}\n";
}

void describeUnitsJson(std::ostream& os)
{
    std::vector<std::pair<std::string, UnitAcceptance>> units;
    for (const auto& t : UnitOperation::availableTypes())
    {
        std::unique_ptr<UnitOperation> u;
        try { u = UnitOperation::New(t); }
        catch (const std::exception&) { continue; }
        units.emplace_back(t, u->acceptance());
    }
    describeAcceptancesJson(os, units);
}

} // namespace Choupo
