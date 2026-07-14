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
Class
    Choupo::PairResolution / Choupo::ThermoResolutionLog

Description
    Where did a binary-interaction parameter set come from?  When an activity
    model (NRTL today) resolves a pair, it records HOW it resolved (inline in
    the thermoPackage, a per-node `constant/binaryPairs/` file, the plant-root
    file, the standard library, or defaulted-to-ideal) and the ACTUAL file it
    loaded -- the source path itself reveals the owning node (".../SEPARATION/
    constant/..." vs ".../standards/..."), so the GUI gets per-node provenance
    for free from the engine's own record (never a TypeScript re-walk -- one
    source of truth).  When the file carries a `provenance { source ...; }`
    block, its value (placeholder / literature / fitted / ...) rides along so a
    PLACEHOLDER masquerading as data is visible, not inferred from the numbers.

    This is the foundation-navigator + pair-coverage-matrix data feed.  Same
    process-wide-sink pattern as AdvisoryLog: cleared at the start of a run,
    drained into the SimulationResult, emitted in the result JSON.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Origin.H"

#include <optional>
#include <string>
#include <utility>
#include <vector>

namespace Choupo {

struct PairResolution
{
    std::string model;       // "NRTL" | "Wilson" | ...
    std::string i;           // component i
    std::string j;           // component j
    std::string status;      // "inline"|"perNode"|"caseRoot"|"standard"|"idealDefault"
    std::string source;      // the file actually loaded, or "inline" / "ideal-default"
    std::string provSource;  // the file's provenance.source ("placeholder"/"literature"/
                             // "fitted"/...) when present, else "" (e.g. ideal-default)

    // ---- P1 audit fields (forum #67/#69): typed, riding the same record, and
    //      NEVER read by the hot numerical path -- they exist for the run
    //      header, the result JSON, the gap report and mode-evaluate.
    // RANKING AND POLICY USE ONLY `origin` (the typed tier); `provSource` stays
    // as the raw source label during migration and never outranks the type.
    Origin                           origin = Origin::unattributed;
    std::string                      method;
    std::string                      methodVersion;  // STABLE id, never a path
    ValidityDomain                   validity;
    std::optional<PromotionOverride> promotedDespite;
};

// ---- Shared audit emission (forum #73-3): ONE implementation of the P1
//      audit-detail JSON fragment, consumed by EVERY result emitter
//      (choupoSolve's ResultEmitter and choupoProps's main) -- the contract is
//      per CONSUMPTION, never per binary, and a second diverging formatter is
//      how fields silently rot.  Takes the caller's own string-escaper so the
//      two emitters keep their quoting conventions.
template <class Esc>
inline std::string pairResolutionAuditJson(const PairResolution& p, Esc esc)
{
    std::string out;
    out += ", \"origin\": " + esc(originToWord(p.origin));
    if (!p.method.empty())        out += ", \"method\": " + esc(p.method);
    if (!p.methodVersion.empty()) out += ", \"methodVersion\": " + esc(p.methodVersion);
    if (p.validity.any())
    {
        out += ", \"validity\": {";
        bool first = true;
        auto rng = [&](const char* k, const Range& r2)
        {
            out += std::string(first ? " " : ", ") + "\"" + k + "\": { \"min\": "
                 + std::to_string(r2.lo) + ", \"max\": " + std::to_string(r2.hi) + " }";
            first = false;
        };
        if (p.validity.temperature) rng("temperature", *p.validity.temperature);
        if (p.validity.pressure)    rng("pressure",    *p.validity.pressure);
        if (!p.validity.composition.empty())
        {
            out += std::string(first ? " " : ", ") + "\"composition\": {";
            bool f2 = true;
            for (const auto& [c, r2] : p.validity.composition)
            {
                out += std::string(f2 ? " " : ", ") + esc(c) + ": { \"min\": "
                     + std::to_string(r2.lo) + ", \"max\": " + std::to_string(r2.hi) + " }";
                f2 = false;
            }
            out += " }"; first = false;
        }
        if (!p.validity.note.empty())
        { out += std::string(first ? " " : ", ") + "\"note\": " + esc(p.validity.note); first = false; }
        out += " }";
    }
    if (p.promotedDespite)
        out += ", \"promotedDespite\": { \"identifiable\": "
             + std::to_string(p.promotedDespite->identifiable)
             + ", \"reason\": " + esc(p.promotedDespite->reason)
             + ", \"by\": "     + esc(p.promotedDespite->by)
             + ", \"date\": "   + esc(p.promotedDespite->date) + " }";
    return out;
}

// The ALWAYS-ON consumption announcement (forum #67 D-c): compact stdout line
// + persistent advisory for predictive parameters and overridden promotions.
// Returns true when anything was announced (callers may refresh advisories).
bool announceProvenanceConsumption(const std::vector<PairResolution>& entries);

class ThermoResolutionLog
{
public:
    static ThermoResolutionLog& instance()
    {
        static ThermoResolutionLog inst;
        return inst;
    }

    void clear() { entries_.clear(); }

    // Dedup on (model,i,j,status,source): the same package can be built more
    // than once (Phase + legacy activity_ pointer; per-pass rebuilds).
    void add(PairResolution pr)
    {
        for (const auto& e : entries_)
            if (e.model == pr.model && e.i == pr.i && e.j == pr.j
                && e.status == pr.status && e.source == pr.source)
                return;
        entries_.push_back(std::move(pr));
    }

    const std::vector<PairResolution>& entries() const { return entries_; }

private:
    ThermoResolutionLog() = default;
    std::vector<PairResolution> entries_;
};

} // namespace Choupo
