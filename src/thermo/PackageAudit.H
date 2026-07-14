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
  PackageAudit — the property-package "minimum parameter set" check.

  At the VALIDATION BOUNDARY (once, when a ThermoPackage is assembled — NEVER in
  the flash/Newton hot path), confront each chosen model's manifest of REQUIRED
  per-component properties (EquationOfState/ActivityModel::requiredComponentProperties)
  against every component, and emit a STRUCTURED WARNING when a required value is:
    - MISSING   (the model cannot be trusted for that component), or
    - ESTIMATED / PLACEHOLDER  (per the component's `provenance {}` side-channel:
      the result rides on an estimate -- the "no silent crutch" rule).

  This is the Choupo-aligned half of commercial process simulators' "minimum parameter set"
  idea: provenance stays at the data + validation boundary; the value type is
  never wrapped (no PropertyResult<T> / Tracked<T> in the solver — settled
  2026-06-05, see core/Origin.H and docs/property-architecture.md §3).

  Warn-only: it changes no result, so it can never break a case.
\*---------------------------------------------------------------------------*/

#pragma once

#include <iosfwd>
#include <string>
#include <vector>

namespace Choupo {

class Component;
class ActivityModel;
class EquationOfState;

// One per-(model, component, property) finding from the manifest check.
struct AuditFinding
{
    std::string model;       // the model that requires the property (e.g. "SRK")
    std::string component;   // the component lacking / estimating it
    std::string property;    // the required property key (e.g. "Tc")
    std::string kind;        // "missing" | "estimated" | "placeholder"
};

// Pure data: confront each model's requiredComponentProperties() manifest against
// the components and return every MISSING / ESTIMATED / PLACEHOLDER finding.
// No I/O, no hot path -- the validation-boundary primitive the gap report reuses.
std::vector<AuditFinding> collectAuditFindings(const std::vector<Component>& components,
                                               const ActivityModel*          activity,
                                               const EquationOfState*         eos);

// Audit the assembled package and WARN (no silent crutch).  `activity` / `eos`
// may be null.  Writes findings as prose to `err` (default std::cerr); returns
// the number of findings (0 = clean) so callers/tests can assert on it.
int auditPackage(const std::vector<Component>& components,
                 const ActivityModel*          activity,
                 const EquationOfState*         eos,
                 std::ostream*                  err = nullptr);

// The run-block (integrity teeth): called on the SOLVE path only (never on the
// gap-report / property-curation paths).  Throws if any finding is an ESTIMATE /
// PLACEHOLDER for a REQUIRED property and `accept` is false -- so an unverified
// estimate cannot ride into a simulation result unnoticed.  Opt in with
// `acceptUnverified true;` in the thermoPackage once the student owns the risk.
// (MISSING required props already throw at model construction.)
void requireVerifiedOrThrow(const std::vector<AuditFinding>& findings, bool accept);

} // namespace Choupo
