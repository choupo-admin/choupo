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
File
    src/thermo/RecordLaws.cpp

Description
    The reader of several named laws inside a record's property block, and
    the one table of law forms (U3).  See RecordLaws.H.
\*---------------------------------------------------------------------------*/

#include "RecordLaws.H"
#include "PropertyDomainError.H"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <functional>
#include <iostream>
#include <iomanip>
#include <map>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <variant>

namespace Choupo {
namespace recordLaws {

namespace {

std::map<std::string, std::string>& forms()
{
    static std::map<std::string, std::string> f;
    return f;
}

std::string num(scalar v)
{
    std::ostringstream os;
    os << std::setprecision(6) << v;
    return os.str();
}

bool isDictEntry(const DictPtr& d, const std::string& k)
{
    return std::holds_alternative<DictPtr>(d->entryValue(k));
}

//  The soft window a law TYPE declares, read here for the view and the
//  remedy only (each type still reads and announces its own window).
void readSoft(Law& L)
{
    const DictPtr& d = L.body;
    try
    {
        if (d->found("Trange"))
        {
            //  `Trange unknown;` (10 records) is a declared absence, not a window.
            const auto t = d->lookupList("Trange");
            if (t.size() == 2) { L.hasSoft = true; L.softLo = t[0]; L.softHi = t[1]; }
        }
        else if (d->found("Tmin") && d->found("Tmax"))
        {
            L.hasSoft = true; L.softLo = d->lookupScalar("Tmin"); L.softHi = d->lookupScalar("Tmax");
        }
        else if (d->found("Tlow") && d->found("Thigh"))
        {
            L.hasSoft = true; L.softLo = d->lookupScalar("Tlow"); L.softHi = d->lookupScalar("Thigh");
        }
    }
    catch (const std::exception&) { L.hasSoft = false; }
}

void readDomain(Law& L, const std::string& where)
{
    (void)L;
    //  A HARD WINDOW IS NOT SUPPORTED YET (C398, ruled after the fifth review
    //  round): every form of it -- refused inside the searches, then audited on
    //  the reported states -- left a state unvisited or misfired, so it leaves
    //  this landing and is designed in its own slice.
    if (L.body->found("domain"))
        throw std::runtime_error(where + ": `domain` -- a hard window is not supported yet (DEV.md 4c,"
            " C398 hard-window slice); declare the law's soft window, which is announced when left.");
}

} // namespace

void declareForm(const std::string& family, const std::string& type, const std::string& form)
{
    forms()[family + "/" + type] = form;
}

std::map<std::string, std::string>& builtIns()
{
    static std::map<std::string, std::string> m;
    return m;
}

void declareBuiltInWindow(const std::string& family, const std::string& type,
                          const std::string& window)
{
    builtIns()[family + "/" + type] = window;
}

std::string builtInWindowOf(const std::string& family, const std::string& type)
{
    const auto it = builtIns().find(family + "/" + type);
    return it == builtIns().end() ? std::string() : it->second;
}

std::string pinPlace(const std::string& property)
{
    if (property == "vaporPressure")
        return "equilibrium { vaporPressure { pin ( { component <c>; law <name>; reason \"...\"; } ); } }";
    if (property == "idealGasHeatCapacity" || property == "liquidHeatCapacity"
        || property == "solidHeatCapacity")
        return "caloric { " + property + " { pin ( { component <c>; law <name>; reason \"...\"; } ); } }";
    if (property == "liquidViscosity")
        return "transport { liquid { viscosity { pin ( { component <c>; law <name>; reason \"...\"; } ); } } }";
    if (property == "liquidThermalConductivity" || property == "liquidConductivity")
        return "transport { liquid { thermalConductivity { pin ( { component <c>; law <name>; reason \"...\"; } ); } } }";
    if (property == "surfaceTension")
        return "transport { interface { surfaceTension { pin ( { component <c>; law <name>; reason \"...\"; } ); } } }";
    return "the property's block of the property dictionary";
}

bool traceOn()
{
    static const bool on = std::getenv("CHOUPO_LAW_TRACE") != nullptr;
    return on;
}

std::string selfLine(const std::string& component, const std::string& property,
                     const std::string& lawToken, const std::string& type,
                     const std::string& by, const std::string& window,
                     const std::string& source, const std::string& value,
                     const std::string& home)
{
    return component + " [" + property + "]: law " + lawToken + " (" + type + "), " + by
         + "; window: " + window + "; source: " + source + "; value: " + value
         + "; record: " + home;
}

void traceCall(const std::string& tag, const std::string& line)
{
    if (traceOn()) std::cerr << "[law-call] #" << (tag.empty() ? std::string("?") : tag) << " " << line << "\n";
}

namespace { thread_local std::shared_ptr<std::string> tlPackageTag; }

std::shared_ptr<std::string> currentPackageTag()
{
    return tlPackageTag ? tlPackageTag : std::make_shared<std::string>();
}

PackageTagScope::PackageTagScope(std::shared_ptr<std::string> tag) : saved(tlPackageTag) { tlPackageTag = std::move(tag); }
PackageTagScope::~PackageTagScope() { tlPackageTag = saved; }

std::string modelLine(const std::string& who, const std::string& key, const std::string& model,
                      const std::string& by, const std::string& window, const std::string& source)
{
    return selfLine(who, key, "none (model)", model, by, window, source, "state-dependent",
                    "no record law");
}

double probeT(const Law& L, double Tc)
{
    if (L.hasDomain) return 0.5 * (L.domainLo + L.domainHi);
    if (L.hasSoft)   return 0.5 * (L.softLo + L.softHi);
    if (Tc > 0.0 && L.type == "RowlinsonBondi") return 0.55 * Tc;
    if (Tc > 0.0 && (L.type == "AmbroseWalton" || L.type == "Wagner")) return 0.7 * Tc;
    return 300.0;
}

std::string valueText(double value, double T)
{
    if (!std::isfinite(value)) return "n/a";
    char b[64];
    std::snprintf(b, sizeof b, "%.8g at %.6g K", value, T);
    return b;
}

std::string formOf(const std::string& family, const std::string& type)
{
    const auto it = forms().find(family + "/" + type);
    return it == forms().end() ? std::string() : it->second;
}

std::string familyOf(const std::string& property)
{
    if (property == "idealGasHeatCapacity" || property == "liquidHeatCapacity"
        || property == "solidHeatCapacity")
        return "heatCapacity";
    return property;
}

std::string Law::windowText() const
{
    std::string s;
    if (hasSoft) s = "soft " + num(softLo) + "-" + num(softHi) + " K (announced outside)";
    if (hasDomain) s += std::string(s.empty() ? "" : "; ") + "hard " + num(domainLo) + "-"
                      + num(domainHi) + " K (refused outside)";
    return s.empty() ? std::string("no window declared") : s;
}

std::string Law::windowText(const std::string& family) const
{
    const std::string b = builtInWindowOf(family, type);
    if (b.empty()) return windowText();
    const std::string own = (hasSoft || hasDomain) ? windowText() + "; " : std::string();
    return own + "built-in (type " + type + "): " + b;
}

const Law* Block::find(const std::string& name) const
{
    const int i = indexOf(name);
    return i < 0 ? nullptr : &laws[std::size_t(i)];
}

int Block::indexOf(const std::string& name) const
{
    for (std::size_t i = 0; i < laws.size(); ++i)
        if (laws[i].name == name) return int(i);
    return -1;
}

std::string Block::names() const
{
    std::string s;
    for (const auto& L : laws) s += (s.empty() ? "" : ", ") + (L.name.empty() ? std::string("(unnamed)") : L.name);
    return s;
}

Block parse(const DictPtr& block, const std::string& property,
            const std::string& owner,
            const std::function<bool(const std::string&)>& isType)
{
    Block b;
    b.property = property;
    b.owner    = owner;
    const std::string where = "component '" + owner + "': " + property;

    bool hasSub = false;
    for (const auto& k : block->keys()) if (isDictEntry(block, k)) { hasSub = true; break; }

    const bool namedForm = property == "liquidViscosity" || property == "liquidThermalConductivity";
    if (!namedForm && block->found("model"))
    {
        //  ONE LAW, today's shape.  Its sub-blocks (Wagner's `reducing`,
        //  RowlinsonBondi's injected ideal-gas block) are the law's own.
        Law L;
        L.type = block->lookupWord("model");
        L.body = block;
        readSoft(L);
        readDomain(L, where);
        b.shape = Block::Shape::oneLaw;
        b.laws.push_back(L);
        b.preferred = 0;
        return b;
    }
    if (property == "surfaceTension" && !hasSub)
    {
        Law L;
        L.type = "tauPower";
        L.body = block;
        readSoft(L);
        readDomain(L, where);
        b.shape = Block::Shape::bare;
        b.laws.push_back(L);
        b.preferred = 0;
        return b;
    }

    b.shape = Block::Shape::namedLaws;
    //  Scalars a block of named laws may carry: `preferred`, and the facts the
    //  component injects into its laws (`owner`, Tc, Pc, omega, Tb).
    static const char* injected[] = { "owner", "Tc", "Pc", "omega", "Tb" };
    for (const auto& k : block->keys())
    {
        if (isDictEntry(block, k))
        {
            Law L;
            L.name = k;
            L.body = block->subDict(k);
            if (L.body->found("model"))
                L.type = L.body->lookupWord("model");
            else if (isType(k))
                L.type = k;
            else
                throw std::runtime_error(where + ": law `" + k + "` names no type -- write"
                    " `model <type>;` inside it (a law's name is its identifier; its"
                    " type is its `model` word, or its name when the name is a registered"
                    " type of this property)");
            if (!isType(L.type))
                throw std::runtime_error(where + ": law `" + k + "` declares type `" + L.type
                    + "`, which is not a registered type of this property");
            readSoft(L);
            readDomain(L, where + "." + k);
            b.laws.push_back(L);
            continue;
        }
        if (k == "preferred") continue;
        bool ok = false;
        for (const char* s : injected) if (k == s) { ok = true; break; }
        if (!ok)
            throw std::runtime_error(where + ": `" + k + "` is read by nothing -- a block of"
                " named laws holds the laws (one sub-block each) and `preferred <name>;`.");
    }
    if (b.laws.empty())
        throw std::runtime_error(where + " declares no law.");
    if (block->found("preferred"))
    {
        const std::string p = block->lookupWord("preferred");
        b.preferred = b.indexOf(p);
        if (b.preferred < 0)
            throw std::runtime_error(where + ": `preferred " + p + ";` names no law of the"
                " block -- its laws are: " + b.names());
    }
    else if (b.laws.size() == 1)
        b.preferred = 0;
    return b;
}

} // namespace recordLaws
} // namespace Choupo
