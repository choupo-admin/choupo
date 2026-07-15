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

#include "PackageAudit.H"

#include "Component.H"
#include "activityCoefficient/ActivityModel.H"
#include "core/Origin.H"
#include "equationOfState/EquationOfState.H"

#include <iostream>
#include <stdexcept>
#include <string>

namespace Choupo {

namespace {

// Is the required property KEY present on the component?  Keys match the model
// manifests (and the component's `provenance {}` field names).  For `omega`,
// 0.0 is a physically valid value (e.g. argon ~ 0), so absence is not
// detectable from the scalar — we never raise a MISSING for it.
bool hasProp(const Component& c, const std::string& key)
{
    if (key == "Tc")             return c.Tc() > 0.0;
    if (key == "Pc")             return c.Pc() > 0.0;
    if (key == "omega")          return true;
    if (key == "vaporPressure")  return c.hasVaporPressure();
    if (key == "standardThermochemistry") return c.hasGibbsData();
    if (key == "cpIdealGas")     return c.hasCpIdealGas();
    return true;   // unknown key: don't false-alarm
}

void collectModel(const std::vector<Component>& comps, const std::string& model,
                  const std::vector<std::string>& reqs, std::vector<AuditFinding>& out)
{
    for (const auto& key : reqs)
        for (const auto& c : comps)
        {
            if (!hasProp(c, key))
            {
                out.push_back({ model, c.name(), key, "missing" });
                continue;
            }
            // Present: is it an ESTIMATE / PLACEHOLDER (provenance side-channel)?
            const OriginInfo oi = c.provenanceFor(key);
            if (oi.origin == Origin::estimated)
                out.push_back({ model, c.name(), key, "estimated" });
            else if (oi.origin == Origin::placeholder)
                out.push_back({ model, c.name(), key, "placeholder" });
        }
}

} // namespace

std::vector<AuditFinding> collectAuditFindings(const std::vector<Component>& components,
                                               const ActivityModel*          activity,
                                               const EquationOfState*         eos)
{
    std::vector<AuditFinding> f;
    if (eos)      collectModel(components, eos->modelName(),      eos->requiredComponentProperties(),      f);
    if (activity) collectModel(components, activity->modelName(), activity->requiredComponentProperties(), f);
    return f;
}

void requireVerifiedOrThrow(const std::vector<AuditFinding>& findings, bool accept)
{
    if (accept) return;
    std::string blocked;
    for (const auto& f : findings)
        if (f.kind == "estimated" || f.kind == "placeholder")
            blocked += "    - " + f.model + " requires '" + f.property + "' of '"
                     + f.component + "' which is an " + f.kind + " value\n";
    if (blocked.empty()) return;
    throw std::runtime_error(
        "ThermoPackage: a REQUIRED property is an UNVERIFIED estimate -- refusing to\n"
        "  run a simulation on it silently:\n" + blocked +
        "  remedy: review + promote the component (see docs/ai/curation-protocol.md),\n"
        "  OR proceed deliberately on the estimate by adding `acceptUnverified true;`\n"
        "  to the thermoPackage (you then own the result).");
}

int auditPackage(const std::vector<Component>& components,
                 const ActivityModel*          activity,
                 const EquationOfState*         eos,
                 std::ostream*                  err)
{
    std::ostream& out = err ? *err : std::cerr;
    const auto findings = collectAuditFindings(components, activity, eos);
    for (const auto& f : findings)
    {
        if (f.kind == "missing")
            out << "[package] " << f.model << " needs '" << f.property
                << "' for component '" << f.component
                << "' but it is MISSING -- the model cannot be trusted for it.\n";
        else
            out << "[package] " << f.model << " uses "
                << (f.kind == "placeholder" ? "a PLACEHOLDER" : "an ESTIMATED")
                << " '" << f.property << "' for component '" << f.component
                << "' -- the result rides on it; review before trusting.\n";
    }
    return static_cast<int>(findings.size());
}

} // namespace Choupo
