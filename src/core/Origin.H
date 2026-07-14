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

/*---------------------------------------------------------------------------*\
  Origin — the per-value provenance tag (the keystone of the property tree).

  Where a curated number came from: measured (literature), regressed (fitted to
  data), estimated (group contribution / corresponding states), assumed, or
  placeholder.  Lives at the DATA + VALIDATION boundary ONLY — parsed from a
  component's `provenance {}` block and emitted to the result JSON.  It MUST
  NEVER be threaded through the solver hot path (no PropertyResult<T> in
  flash/Newton, no runtime resolver) — that is the settled 2026-06-05 rule.

  Header-only, zero deps, compiles in isolation.
\*---------------------------------------------------------------------------*/

#ifndef Choupo_Origin_H
#define Choupo_Origin_H

#include <map>
#include <optional>
#include <string>

namespace Choupo {

enum class Origin
{
    unattributed,   // no provenance declared (the honest default)
    literature,     // measured / experimental / from a cited table
    regressed,      // fitted to data (Antoine, Andrade, NRTL pair, ...)
    predictive,     // a MODEL's prediction transcribed as a value (UNIFAC-derived
                    //   pair, corresponding-states surrogate) -- the P4 ladder
                    //   rung between regressed and estimated (forum #67: a
                    //   distinct class; collapsing it into `estimated`
                    //   contradicted the resolution-priority ladder)
    estimated,      // group contribution from the substance's OWN structure (Joback)
    assumed,        // an engineering assumption the curator owns
    placeholder     // a stub to be replaced
};

// ---- ValidityDomain (forum #67 D-b): the declared domain a parameter set or
//      correlation is trusted over.  EXTENSIBLE and typed; temperature is the
//      one dimension implemented first (it is what the current files declare);
//      pressure and composition slots exist so the SHAPE never changes when a
//      case needs them.  Absent = optional -- never a 0,0 sentinel.
struct Range { double lo = 0.0; double hi = 0.0; };

struct ValidityDomain
{
    std::optional<Range>         temperature;   // K
    std::optional<Range>         pressure;      // Pa
    std::map<std::string, Range> composition;   // keyed by component, dimensionless
    std::string                  note;          // free-text qualifier, transported

    bool any() const
    { return temperature.has_value() || pressure.has_value() || !composition.empty() || !note.empty(); }
};

// ---- PromotionOverride (forum #59-E2 / #67): the AUDITABLE record of a human
//      promoting an artefact the diagnostics flagged (identifiable:0, a failed
//      consistency test).  Structured -- reason and authorship travel with the
//      value to every consumption (result JSON, advisory, run header) -- never
//      reduced to a bool, never disguising the artefact as a clean fit.
struct PromotionOverride
{
    int         identifiable = -1;   // the flag at promotion time
    std::string reason;              // the human's justification (REQUIRED)
    std::string by;                  // who promoted (REQUIRED)
    std::string date;                // when (REQUIRED)
};

// Per-value provenance record (a side-channel; never read by a value accessor).
struct OriginInfo
{
    Origin      origin = Origin::unattributed;
    std::string method;        // e.g. "Andrade fit to NIST mu(T)"
    std::string methodVersion; // stable table id, e.g. "joback-poling5e-table2-2"
    std::string uncertainty;   // e.g. "~2% AAD", or "status -- reason" (structured form)
    std::string note;          // free-form
    std::string raw;           // verbatim text for the flat free-text grammar
    bool        hasValidity = false;
    double      validityMin = 0.0;
    double      validityMax = 0.0;
};

// Word -> Origin.  Tolerant (accepts common synonyms); unknown -> unattributed.
// NEVER throws.
inline Origin originFromWord(const std::string& w)
{
    if (w == "literature" || w == "experimental" || w == "measured") return Origin::literature;
    if (w == "regressed"  || w == "fitted")                          return Origin::regressed;
    if (w == "predictive" || w == "predicted")                       return Origin::predictive;
    if (w == "estimated"  || w == "estimate")                        return Origin::estimated;
    if (w == "assumed")                                              return Origin::assumed;
    if (w == "placeholder" || w == "stub")                           return Origin::placeholder;
    return Origin::unattributed;
}

// Origin -> lower-case word (for the result JSON).
inline const char* originToWord(Origin o)
{
    switch (o)
    {
        case Origin::literature:   return "literature";
        case Origin::regressed:    return "regressed";
        case Origin::predictive:   return "predictive";
        case Origin::estimated:    return "estimated";
        case Origin::assumed:      return "assumed";
        case Origin::placeholder:  return "placeholder";
        case Origin::unattributed: default: return "unattributed";
    }
}

} // namespace Choupo

#endif
