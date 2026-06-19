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
    src/reporting/ModelBoundaryAudit.H

Description
    The MODEL-BOUNDARY AUDIT.  Settled 2026-06-08 (forum 5/5).

    When two adjacent units use different thermo models (a per-unit
    `thermo {}` override, or one sector on eNRTL feeding another on NRTL),
    the stream that crosses between them is a MODEL BOUNDARY.  A model
    boundary is NOT a physical device -- nothing physical happens between
    "the upstream model's view" and "the downstream model's view" of the
    same stream -- so there is no real temperature change to absorb.

    PRINCIPLE: *H is the conserved truth; T is the model-dependent readout
    of it.*  Choupo holds (T,P,z) across the boundary and lets H STEP; this
    audit makes that step VISIBLE and quantitative instead of hiding it.

    For every internal stream whose producer and consumer use different
    packages it evaluates  dH = H_down(T,P,z) - H_up(T,P,z)  at the SAME
    state (the components are global, so the formation baseline cancels and
    dH is exactly the two models' enthalpy disagreement), prints it in
    kJ/mol and kW, and the implied dT-to-reconcile (= dH / Cp_down).  It
    sums the computable boundaries into a plant model-inconsistency total.

    It HARD-REFUSES (prints a refusal, never a number) across a speciation
    change (electrolyte <-> molecular): there the two models share no common
    composition basis, so a single dH would lie.

    No absorption, no silent T-nudge -- that would be exactly the hidden
    side-channel the glass-box credo forbids.  See CLAUDE.md sec.10 and
    docs/ai/energy.md sec.7.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/SimulationResult.H"   // ModelBoundaryFinding (shared with the result JSON)
#include "core/Types.H"
#include "streams/ProcessStream.H"
#include "thermo/ThermoPackage.H"

#include <cmath>
#include <functional>
#include <iomanip>
#include <iostream>
#include <map>
#include <string>
#include <vector>

namespace Choupo
{
// Compute the model-boundary findings for a converged flowsheet: every internal
// stream whose producer and consumer use different thermo packages.  `packageOf`
// returns the per-unit ThermoPackage (the Flowsheet's thermoFor, curried with
// the global package).  Pure -- no I/O; the common single-global-model case
// returns an empty vector.
inline std::vector<ModelBoundaryFinding> computeModelBoundaries(
    const std::vector<DictPtr>&                                   units,
    const std::map<std::string, ProcessStream>&                   streams,
    const std::function<const ThermoPackage&(const DictPtr&)>&    packageOf)
{
    std::vector<ModelBoundaryFinding> found;

    // producer map: stream name -> the unit that emits it
    std::map<std::string, DictPtr> producer;
    for (const auto& u : units)
        if (u->found("outputs"))
            for (const auto& o : u->lookupWordList("outputs"))
                producer[o] = u;

    for (const auto& u : units)
    {
        std::vector<std::string> ins;
        if (u->found("inputs"))     ins = u->lookupWordList("inputs");
        else if (u->found("in"))    ins = { u->lookupWord("in") };

        for (const auto& sname : ins)
        {
            auto pit = producer.find(sname);
            if (pit == producer.end()) continue;            // external feed
            const DictPtr& pu = pit->second;
            if (pu == u) continue;                           // self-loop guard

            const ThermoPackage& Pup = packageOf(pu);
            const ThermoPackage& Pdn = packageOf(u);
            if (&Pup == &Pdn) continue;                      // same package, no boundary

            auto sit = streams.find(sname);
            if (sit == streams.end()) continue;
            const ProcessStream& s = sit->second;

            ModelBoundaryFinding f;
            f.stream   = sname;
            f.producer = pu->lookupWord("name");
            f.consumer = u->lookupWord("name");

            // Speciation change -> ill-posed, refuse rather than mislead.
            if (Pup.hasElectrolyte() != Pdn.hasElectrolyte())
            {
                f.refused = true;
                f.reason  = "speciation change (electrolyte<->molecular) -- dH ill-posed";
                found.push_back(f);
                continue;
            }

            // Datum change -> ill-posed, refuse.  A pure-fluid package (IF97 &
            // kin) reports h on its OWN reference datum (the IAPWS triple
            // point), incommensurable with the formation/sensible datum of the
            // generic package; dH would subtract two unrelated gauges.  A
            // CLOSED single-package loop never reaches here (&Pup == &Pdn
            // short-circuits above) -- its constant offset cancels.  This fires
            // only across a per-unit thermo{} override that adds/removes a
            // pure-fluid between adjacent units.
            if (Pup.pureFluidSelections().empty() != Pdn.pureFluidSelections().empty())
            {
                f.refused = true;
                f.reason  = "datum change (pure-fluid <-> formation enthalpy reference) -- dH ill-posed";
                found.push_back(f);
                continue;
            }

            // H_stream_formation is the model-AWARE enthalpy (it carries the EoS
            // residual via H_real); a real EoS disagreement (e.g. SRK vs ideal)
            // surfaces here.  An activity-only override does NOT change it
            // (Choupo puts the activity model in the K-values, not the enthalpy
            // datum) -> dH = 0, honestly "models agree here".
            scalar Hup, Hdn;
            try
            {
                Hup = Pup.H_stream_formation(s.T, s.P, s.vf, s.z);
                Hdn = Pdn.H_stream_formation(s.T, s.P, s.vf, s.z);
            }
            catch (const std::exception&) { continue; }      // can't evaluate -> skip
            if (!std::isfinite(Hup) || !std::isfinite(Hdn)) continue;

            const scalar dH = Hdn - Hup;                     // J/mol
            if (std::fabs(dH) < 1.0e-3) continue;            // models agree here

            // Implied dT-to-reconcile via the downstream model's Cp (finite diff).
            scalar dT = 0.0;
            try
            {
                const scalar Hdn2 = Pdn.H_stream_formation(s.T + 0.1, s.P, s.vf, s.z);
                const scalar cp   = (Hdn2 - Hdn) / 0.1;      // J/mol/K
                if (std::fabs(cp) > 1.0e-6) dT = dH / cp;
            }
            catch (const std::exception&) { /* leave dT = 0 */ }

            f.dH_kJ_per_mol = dH / 1000.0;
            f.dH_kW         = dH * s.F;       // [J/mol]*[kmol/s] = kW
            f.implied_dT_K  = dT;
            found.push_back(f);
        }
    }

    return found;
}

// Print the audit to the run log.  Silent when there are no boundaries or when
// verbosity < 2 -- the common single-global-model case stays clean.
inline void printModelBoundaries(const std::vector<ModelBoundaryFinding>& found,
                                 int verbosity)
{
    if (verbosity < 2 || found.empty()) return;

    scalar totalKW = 0.0;
    for (const auto& f : found) if (!f.refused) totalKW += f.dH_kW;

    std::cout << "\n====== MODEL-BOUNDARY AUDIT "
                 "(H conserved; T is the model-dependent readout) ======\n";
    std::cout << "  Adjacent units use different thermo models.  "
                 "dH = H_down - H_up at the\n"
                 "  stream's (T,P,z): the enthalpy the two models disagree about, "
                 "held not absorbed.\n\n";
    std::cout << "  " << std::left
              << std::setw(24) << "stream"
              << std::setw(24) << "producer -> consumer"
              << std::right
              << std::setw(13) << "dH [kJ/mol]"
              << std::setw(11) << "dH [kW]"
              << std::setw(14) << "implied dT[K]" << "\n";
    std::cout << "  " << std::string(24, '-') << " " << std::string(22, '-')
              << " " << std::string(11, '-') << " " << std::string(9, '-')
              << " " << std::string(12, '-') << "\n";

    for (const auto& f : found)
    {
        const std::string pc = f.producer + " -> " + f.consumer;
        std::cout << "  " << std::left
                  << std::setw(24) << f.stream
                  << std::setw(24) << pc;
        if (f.refused)
        {
            std::cout << "REFUSED: " << f.reason << "\n";
            continue;
        }
        std::cout << std::right << std::fixed
                  << std::setw(13) << std::setprecision(4) << f.dH_kJ_per_mol
                  << std::setw(11) << std::setprecision(2) << f.dH_kW
                  << std::setw(14) << std::setprecision(2) << f.implied_dT_K << "\n";
    }

    std::cout << "  " << std::string(24, '-') << " " << std::string(22, '-')
              << " " << std::string(11, '-') << " " << std::string(9, '-')
              << " " << std::string(12, '-') << "\n";
    std::cout << "  plant model-inconsistency (sum over computable boundaries): "
              << std::fixed << std::setprecision(2) << totalKW << " kW\n";
    std::cout << "  (reduce to ONE global model to close it, or accept + "
                 "document the boundary.)\n";
    std::cout << "==================================================="
                 "==================\n\n";
}

} // namespace Choupo
