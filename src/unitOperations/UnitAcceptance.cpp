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
#include "thermo/ThermoPackage.H"
#include "unitOperations/flash/StreamEquilibrium.H"   // the ONE inlet-phase reading

#include <cstdio>
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
    }
    return "unknown";
}

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
                                            const std::string&     where)
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

    // ---- The components the equations carry ---------------------------------
    if (acc.models.rule != UnitAcceptance::ModelsRule::everyComponent)
    {
        std::string unmodelled;
        for (std::size_t i = 0; i < n && i < inlet.z.size(); ++i)
        {
            if (!(inlet.z[i] > 0.0)) continue;
            bool modelled = false;
            switch (acc.models.rule)
            {
                case UnitAcceptance::ModelsRule::everyComponent:
                    modelled = true;
                    break;
                case UnitAcceptance::ModelsRule::aqueousSolventAndNonvolatileSolutes:
                    modelled = (i == iSolvent) || thermo.comp(i).isNonvolatile();
                    break;
            }
            if (modelled) continue;
            unmodelled += "\n      '" + thermo.comp(i).name() + "' (z = "
                + std::to_string(inlet.z[i]) + ", role '"
                + thermo.comp(i).role() + "')";
        }
        if (!unmodelled.empty())
            out.push_back(head + " carries component(s) this unit does not"
                " model:" + unmodelled + "\n"
                "    It models " + acc.models.sentence + "; " + acc.models.why
                + "\n    REMEDY: " + acc.models.remedy);
    }

    // ---- Any further declared condition ------------------------------------
    for (const auto& c : acc.refusesAlso)
        if (c.test)
            if (auto detail = c.test(inlet, thermo))
                out.push_back(head + " " + *detail + ".  " + c.sentence
                    + "  REMEDY: " + c.remedy);
    return out;
}

void checkAcceptance(const UnitOperation&   unit,
                     const AcceptanceInlet& inlet,
                     const ThermoPackage&   thermo,
                     const std::string&     where)
{
    const auto f = acceptanceFindings(unit.acceptance(), unit.type(), inlet,
                                      thermo, where);
    if (f.empty()) return;
    std::string msg = f.front();
    for (std::size_t k = 1; k < f.size(); ++k) msg += "\n  " + f[k];
    throw std::runtime_error(msg);
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

void describeUnitsJson(std::ostream& os)
{
    const auto types = UnitOperation::availableTypes();
    os << "{\n  \"schema\": \"unitAcceptance-v1\",\n  \"units\": [";
    bool first = true;
    for (const auto& t : types)
    {
        std::unique_ptr<UnitOperation> u;
        try { u = UnitOperation::New(t); }
        catch (const std::exception&) { continue; }
        const UnitAcceptance a = u->acceptance();
        os << (first ? "\n" : ",\n");
        first = false;
        os << "    {\n      \"type\": " << q(t)
           << ",\n      \"declared\": " << (a.declared ? "true" : "false");
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
        os << ",\n      \"models\": { \"rule\": " << q(modelsRuleWord(a.models.rule))
           << ", \"sentence\": " << q(a.models.sentence);
        if (!a.models.why.empty())    os << ", \"why\": " << q(a.models.why);
        if (!a.models.remedy.empty()) os << ", \"remedy\": " << q(a.models.remedy);
        os << " }";
        os << ",\n      \"passThrough\": [";
        for (std::size_t k = 0; k < a.passThroughFates.size(); ++k)
            os << (k ? ", " : "") << q(a.passThroughFates[k]);
        os << "]";
        os << ",\n      \"refusesAlso\": [";
        for (std::size_t k = 0; k < a.refusesAlso.size(); ++k)
            os << (k ? ", " : "") << "{ \"id\": " << q(a.refusesAlso[k].id)
               << ", \"sentence\": " << q(a.refusesAlso[k].sentence)
               << ", \"remedy\": " << q(a.refusesAlso[k].remedy) << " }";
        os << "]\n    }";
    }
    os << "\n  ]\n}\n";
}

} // namespace Choupo
