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

#include "result/ResultEmitter.H"
#include "thermo/SealCheck.H"

#include <cmath>
#include <iomanip>
#include <sstream>

namespace Choupo {

namespace {

// JSON-escape a string.  Only the subset of escapes JSON requires; we
// never emit U+0000..001F in dict identifiers so the basic set suffices.
std::string escImpl_(const std::string& s)
{
    std::string out;
    out.reserve(s.size() + 2);
    out.push_back('"');
    for (char c : s)
    {
        switch (c)
        {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n";  break;
            case '\r': out += "\\r";  break;
            case '\t': out += "\\t";  break;
            default:   out.push_back(c);
        }
    }
    out.push_back('"');
    return out;
}

std::string esc(const std::string& s) { return escImpl_(s); }


// Emit a number in a JSON-safe way.  NaN / Inf are not valid JSON, so
// we serialise them as null with no surprise.
std::string num(scalar v) { return jsonNumber(v); }

//  THE OVERALL MASS FLOW of a stream [kg/s]: the fluid AND the solid, summed
//  over the components the run carries a molar mass for.  ONE home, read by
//  the stream table and by the layout's pipes, so the two cannot disagree.
scalar overallMassFlow(const SimulationResult& r, const ProcessStream& s)
{
    const auto& names = r.componentNames;
    scalar F_mass = 0.0;
    for (std::size_t i = 0; i < names.size(); ++i)
    {
        auto it = r.componentMolarMass.find(names[i]);
        if (it == r.componentMolarMass.end()) continue;
        const scalar zi = (i < s.z.size()) ? s.z[i] : 0.0;
        const scalar si = (i < s.s.size()) ? s.s[i] : 0.0;
        F_mass += (s.F * zi + si) * it->second;   // kmol/s * kg/kmol
    }
    return F_mass;
}

} // namespace

//  THE MACHINE CHANNEL OWNS ITS PRECISION (2026-09-03).  choupoProps wrote
//  its diagnostics with a bare `<< val`, inheriting whatever precision and
//  flags the LAST op's console table had left on std::cout -- de facto
//  fixed(4) across the corpus, so `v_molar 0.0166` where the engine held
//  0.016638, and a golden recorded from it pinned the accident of op order.
//  One formatter, one home, every binary: 12 significant digits, plain
//  notation, a non-finite value as JSON null.
std::string jsonNumber(scalar v)
{
    if (!std::isfinite(v)) return "null";
    std::ostringstream os;
    os << std::defaultfloat << std::setprecision(12) << v;
    return os.str();
}

void emitResultJson(std::ostream& os, const SimulationResult& r)
{
    const auto& names = r.componentNames;

    os << "<<<Choupo:result-begin>>>\n";
    os << "{ \"version\": 1,\n";
    os << "  \"converged\": " << (r.converged ? "true" : "false") << ",\n";

    //  ---- the provenance seal, tri-state (forum 2026-08-02) -------------
    //  Read HERE, at the ONE point every result passes through, so the
    //  verdict travels with the artefact instead of dying on stderr.  A
    //  golden, a report or a converged/ directory produced by a diverged
    //  run now says so; `unsealed` is emitted as itself and never as
    //  "verified", because a case that sealed nothing makes no claim.
    {
        const std::string& v = records::sealVerdict();
        os << "  \"seal\": { \"verdict\": " << esc(v);
        const auto& dr = records::sealDivergedRecords();
        if (!dr.empty())
        {
            os << ", \"divergedRecords\": [";
            for (std::size_t i = 0; i < dr.size(); ++i)
            {
                if (i) os << ", ";
                os << esc(dr[i]);
            }
            os << "]";
        }
        os << " },\n";
    }

    // ---- components ------------------------------------------------------
    os << "  \"components\": [";
    for (std::size_t i = 0; i < names.size(); ++i)
    {
        if (i) os << ", ";
        os << esc(names[i]);
    }
    os << "],\n";

    // ---- componentMolarMass (kg/kmol) -----------------------------------
    //   Lets the GUI derive mass fractions w_i locally without a second
    //   trip through the solver.  Skipped when the application main()
    //   did not populate the map.
    if (!r.componentMolarMass.empty())
    {
        os << "  \"componentMolarMass\": {";
        bool firstMW = true;
        for (const auto& [name, mw] : r.componentMolarMass)
        {
            os << (firstMW ? "" : ",") << " " << esc(name) << ": " << num(mw);
            firstMW = false;
        }
        os << " },\n";
    }

    // ---- streams ---------------------------------------------------------
    //   F is kmol/s (canonical SI); F_mass is kg/s, derived from the
    //   stream composition and the per-component molar masses passed
    //   in via r.componentMolarMass.  The GUI can then display the
    //   stream in whichever flow unit the student picked (kmol/h,
    //   kg/s, mol/h,...) without dragging MWs through the JSON
    //   bridge.
    // One-line legend emitted once above the table (JSON has no comments, so
    // it rides as a string key).  THE PUBLIC CONTRACT (one stream, one
    // semantics, ruled 2026-08-08): F, composition, F_mass and H describe
    // the OVERALL stream material -- solids included -- exactly as
    // converged/<stream> stores componentMolarFlows; the explicitly named
    // extras (F_solid_mass, solids{}, organicLiquid{}, speciation{}) locate
    // parts of that same material, and vf is the vapour fraction of the
    // FLUID portion.  This payload used to leak the engine's INTERNAL
    // fluid+solid split (F/composition/H fluid-only beside an overall
    // H_kW), so the same field name meant different things on different
    // surfaces -- the transport-contract defect flash19 exposed.
    os << "  \"streamsNote\": \"F/composition/F_mass/H = the OVERALL stream "
          "material incl. solids (as converged/<stream>); H [J/mol] overall "
          "molar enthalpy, H_kW = F*H the total enthalpy flow, elements "
          "datum; vf = vapour fraction of the FLUID portion; F_solid_mass/"
          "solids/organicLiquid/speciation locate parts of the same "
          "material\",\n";
    os << "  \"streams\": {";
    bool firstS = true;
    const bool haveMW = !r.componentMolarMass.empty();
    for (const auto& [name, s] : r.streams)
    {
        os << (firstS ? "\n" : ",\n");
        firstS = false;
        //  The OVERALL molar flow: the engine carries F/z for the FLUID and
        //  s[] (kmol/s) for the solid; the stream's material is their sum,
        //  and that is what the public F/composition state -- the internal
        //  split must not leak (it did, and the phase totals then read as
        //  failing to close against an F that never contained the solid).
        scalar F_solid_molar = 0.0;
        for (std::size_t i = 0; i < s.s.size(); ++i) F_solid_molar += s.s[i];
        const scalar F_overall = s.F + F_solid_molar;
        const scalar F_mass = haveMW ? overallMassFlow(r, s) : 0.0;
        // Solid phase: total solid mass flow [kg/s] + per-component
        // solid mass, so the GUI can show the particulate a stream carries
        // (otherwise a solids-only stream looks empty: F is fluid-only).
        scalar F_solid = 0.0;
        bool   anySolid = false;
        if (haveMW && !s.s.empty())
            for (std::size_t i = 0; i < names.size(); ++i)
            {
                auto it = r.componentMolarMass.find(names[i]);
                if (it == r.componentMolarMass.end()) continue;
                const scalar si = (i < s.s.size()) ? s.s[i] : 0.0;
                if (si != 0.0) anySolid = true;
                F_solid += si * it->second;     // kmol/s * kg/kmol = kg/s
            }
        //  WHICH NAMES ARE THE SAME PIPE.  `streams` is keyed by every name a
        //  stream answers to -- its identity, the bare sector label, the
        //  plant's boundary label -- because a golden, a case file and a
        //  canvas edge each speak a different one of them and all three must
        //  resolve.  A reader that draws a TABLE, though, must not print one
        //  pipe three times, so the engine says here which entries are labels
        //  and which name the plant gave the boundary.  The GUI applies these
        //  fields; it does not work the equivalence out for itself, or the
        //  rule would have two homes and the two surfaces could disagree
        //  about how many streams a plant has.
        std::string aliasOf, plantLabel;
        {
            auto a = r.boundaryAliasOf.find(name);
            if (a != r.boundaryAliasOf.end()) aliasOf = a->second;
            auto l = r.boundaryOutletLabelOf.find(name);
            if (l != r.boundaryOutletLabelOf.end()) plantLabel = l->second;
        }
        os << "    " << esc(name) << ": { "
           << "\"F\": " << num(F_overall)
           << ", \"T\": " << num(s.T)
           << ", \"P\": " << num(s.P)
           // vf is the vapour fraction OF THE FLUID PORTION, set by every
           // flash / saturation unit: 0 = pure liquid, 1 = pure vapour,
           // 0..1 = two-phase.  It deliberately says nothing about a solid
           // the stream also carries -- the phases{} decomposition owns the
           // physical state; vf answers only the vapour question.
           << ", \"vf\": " << num(s.vf);
        // Overall molar enthalpy [J/mol] on the ELEMENTS reference
        // (formation datum): the total enthalpy flow over the total molar
        // flow, so H and H_kW are ONE consistent pair (H_kW = F*H) instead
        // of a fluid-only H beside an overall H_kW -- the mixed-basis pair
        // the 2026-08-08 transport audit banned.  kJ/s over kmol/s is
        // J/mol.  A stream with no solid keeps its old value exactly.
        if (s.H_flow_valid && F_overall > 0.0)
            os << ", \"H\": " << num(s.H_flow_kW / F_overall);
        else if (s.H_valid && F_solid_molar == 0.0)
            os << ", \"H\": " << num(s.H);
        // Total FLOW enthalpy [kW] = F*H (fluid) + Σ s[i]*h°(solid,T) (crystals).
        // The boundary energy balance reads THIS (counts a solid product's
        // crystals) -- so the GUI plot closes on the same elements
        // datum as the report.  Absent => fall back to F*H in the GUI.
        if (s.H_flow_valid) os << ", \"H_kW\": " << num(s.H_flow_kW);
        // Present species with NO elements-datum enthalpy (missing data, not
        // composition).  When non-empty, H / H_kW above are absent BECAUSE of
        // these -- the GUI energy plot must REFUSE and name them, not silently
        // skip the stream.  Absent (the common case) => fully curated stream.
        if (!s.H_missing.empty())
        {
            os << ", \"H_missing\": [";
            for (std::size_t i = 0; i < s.H_missing.size(); ++i)
            {
                if (i) os << ", ";
                os << esc(s.H_missing[i]);
            }
            os << "]";
        }
        if (!aliasOf.empty())    os << ", \"aliasOf\": " << esc(aliasOf);
        if (!plantLabel.empty()) os << ", \"boundaryLabel\": " << esc(plantLabel);
        //  The DECLARED utility circuit this stream belongs to, decided by
        //  the massBalance report through `streams/UtilityCircuit` and only
        //  carried here.  Absent on every stream of every case that declares
        //  no circuit, so a non-declaring case's JSON is byte-identical.
        {
            auto u = r.utilityCircuitOf.find(name);
            if (u != r.utilityCircuitOf.end() && !u->second.empty())
                os << ", \"utilityCircuit\": " << esc(u->second);
        }
        if (haveMW) os << ", \"F_mass\": " << num(F_mass);
        os << ", \"F_solid_mass\": " << num(F_solid);
        // Utility category (populated by `utility <name>;` in a stream
        // block).  Non-empty means this is a utility stream; the GUI uses
        // it for visual differentiation (dashed grey, chama/floco icon).
        if (!s.category.empty()) os << ", \"category\": " << esc(s.category);
        //  OVERALL mole fractions: (fluid + solid) material per component
        //  over the overall flow, so a precipitated crystal's material is
        //  IN the composition it belongs to (flash19: the stream's CaCO3 is
        //  0.03 kmol/h = dissolved + crystal, and the composition says so).
        os << ", \"composition\": {";
        for (std::size_t i = 0; i < names.size(); ++i)
        {
            const scalar zi = (i < s.z.size()) ? s.z[i] : 0.0;
            const scalar si = (i < s.s.size()) ? s.s[i] : 0.0;
            if (i) os << ", ";
            os << esc(names[i]) << ": "
               << num(F_overall > 0.0 ? (s.F * zi + si) / F_overall : 0.0);
        }
        os << "}";
        if (anySolid)
        {
            os << ", \"solids\": {";
            bool firstSol = true;
            for (std::size_t i = 0; i < names.size(); ++i)
            {
                const scalar si = (i < s.s.size()) ? s.s[i] : 0.0;
                if (si == 0.0) continue;
                auto it = r.componentMolarMass.find(names[i]);
                const scalar mw = (it != r.componentMolarMass.end()) ? it->second : 0.0;
                os << (firstSol ? "" : ", ") << esc(names[i]) << ": " << num(si * mw);
                firstSol = false;
            }
            os << "}";
        }
        // Particle-size distribution.  Crystalliser, SprayDryer, Cyclone,
        // BagFilter and friends populate it; emit when present so the GUI's
        // Streams panel can plot or tabulate it next to the solids row.
        if (!s.psd.empty())
        {
            os << ", \"psd\": { \"diameter\": [";
            for (std::size_t k = 0; k < s.psd.diameter.size(); ++k)
                os << (k ? ", " : "") << num(s.psd.diameter[k]);
            os << "], \"massFrac\": [";
            for (std::size_t k = 0; k < s.psd.massFrac.size(); ++k)
                os << (k ? ", " : "") << num(s.psd.massFrac[k]);
            os << "] }";
        }
        //  The SECOND LIQUID, per component [kmol/s].  Only the ORGANIC side,
        //  exactly as the stream file stores it: the aqueous is the liquid
        //  MINUS this, so the pair closes by subtraction instead of by two
        //  independently-rounded vectors agreeing.  One home here too -- the
        //  GUI subtracts, it is not handed a second vector to drift from.
        //
        //  Without it a four-phase case could not show its phases: flash19's
        //  liquid carries an aqueous, an organic and a solid, and the payload
        //  named only the solid.
        if (s.organicLiquid && !s.organicLiquid->empty())
        {
            const auto& org = *s.organicLiquid;
            os << ", \"organicLiquid\": {";
            bool firstOrg = true;
            for (std::size_t i = 0; i < names.size(); ++i)
            {
                const scalar oi = (i < org.size()) ? org[i] : 0.0;
                if (oi == 0.0) continue;
                os << (firstOrg ? "" : ", ") << esc(names[i]) << ": " << num(oi);
                firstOrg = false;
            }
            os << "}";
        }
        //  The SPECIATION the package solved for this stream: the ions the
        //  apparent components resolve into, in the aqueous phase.  It is on
        //  disk in converged/<stream> (nested under phases.aqueous) but was
        //  absent from this payload, so the GUI -- which reads only this --
        //  could not show it at all: a reactive case's card offered mole
        //  fractions of CaCO3 and nothing about Ca, HCO3 or the pH.
        //
        //  REPORT-ONLY, like the file: `composition` above stays the apparent
        //  material and is untouched.  Flows in kmol/s (canonical SI), the
        //  same basis as F.
        if (s.speciation && !s.speciation->flows.empty())
        {
            const auto& sp = *s.speciation;
            os << ", \"speciation\": { \"network\": " << esc(sp.network)
               << ", \"basis\": " << esc(sp.basis);
            if (sp.pH_valid) os << ", \"pH\": " << num(sp.pH);
            os << ", \"flows\": {";
            for (std::size_t k = 0; k < sp.flows.size(); ++k)
                os << (k ? ", " : "") << esc(sp.flows[k].first) << ": "
                   << num(sp.flows[k].second);
            os << "} }";
        }

        //  THE ANALYSIS RECONCILIATION -- a MEASUREMENT record, and it is
        //  deliberately NOT mixed into anything above.  `speciation` beside
        //  it is what the chemistry CALCULATED; this is what a laboratory
        //  REPORTED and how far it had to be moved to give the chemistry an
        //  admissible inlet.  The two are different kinds of number and a
        //  reader must not have to remember which is which, so they are kept
        //  apart by three marks that survive being read out of order:
        //    * these rows carry `reportedValue`; nothing calculated has one;
        //    * corrections are quoted in SIGMA, which is meaningless for a
        //      calculated quantity;
        //    * these rows are keyed by the author's SHEET LABEL, `speciation`
        //      by SPECIES ID -- two different key spaces.
        //  `note` says it in words for a consumer that shows the payload raw.
        if (s.analysis)
        {
            const auto& a = *s.analysis;
            os << ", \"analysisReconciliation\": { \"note\": \"MEASUREMENTS and"
                  " the distance each was moved to obtain a physically"
                  " admissible inlet -- NOT chemistry results (those are in"
                  " speciation{}).  Rows are keyed by the author's sheet"
                  " label and carry reportedValue; corrections are in"
                  " sigma.\"";
            os << ", \"method\": "
               << esc(a.method.empty() ? std::string("none") : a.method);
            os << ", \"basis\": " << esc(a.basis);
            if (!a.enforced.empty())
            {
                os << ", \"enforce\": [";
                for (std::size_t k = 0; k < a.enforced.size(); ++k)
                    os << (k ? ", " : "") << esc(a.enforced[k]);
                os << "]";
            }
            if (a.pH_valid) os << ", \"pHReported\": " << num(a.pH);
            os << ", \"chargeImbalanceBeforePct\": " << num(a.imbalancePctBefore)
               << ", \"chargeImbalanceAfterPct\": "  << num(a.imbalancePctAfter)
               << ", \"chargeResidueBefore\": "      << num(a.imbalanceBefore)
               << ", \"chargeResidueAfter\": "       << num(a.imbalanceAfter);
            if (!a.constraints.empty())
            {
                os << ", \"objective\": " << num(a.objective)
                   << ", \"workingSetChanges\": " << a.qpIterations;
                if (a.maxCorrectionSigma > 0.0)
                    os << ", \"maximumCorrectionSigma\": "
                       << num(a.maxCorrectionSigma);
                os << ", \"constraints\": [";
                for (std::size_t k = 0; k < a.constraints.size(); ++k)
                {
                    const auto& c = a.constraints[k];
                    os << (k ? ", " : "") << "{ \"name\": " << esc(c.name)
                       << ", \"family\": " << esc(c.family)
                       << ", \"meaning\": " << esc(c.meaning)
                       << ", \"residualBefore\": " << num(c.residualBefore)
                       << ", \"residualAfter\": "  << num(c.residualAfter)
                       << ", \"multiplier\": "     << num(c.multiplier)
                       << ", \"binding\": " << (c.binding ? "true" : "false")
                       << " }";
                }
                os << "]";
            }
            os << ", \"adjustments\": [";
            bool firstA = true;
            for (const auto& an : a.analytes)
            {
                const scalar d = an.reconciled - an.measured;
                if (a.constraints.empty() && d == 0.0) continue;
                os << (firstA ? "" : ", ");
                firstA = false;
                os << "{ \"label\": "
                   << esc(an.label.empty() ? an.species : an.label);
                if (!an.species.empty()) os << ", \"species\": " << esc(an.species);
                if (!an.element.empty()) os << ", \"element\": " << esc(an.element);
                os << ", \"reportedValue\": " << num(an.measured)
                   << ", \"adjustedValue\": "  << num(an.reconciled)
                   << ", \"correction\": "     << num(d)
                   << ", \"sigma\": "          << num(an.sigma)
                   << ", \"uncertaintyPct\": " << num(an.uncertaintyPct)
                   << ", \"uncertaintyOrigin\": " << esc(an.uncertaintyOrigin)
                   << ", \"weight\": "
                   << num(an.sigma > 0.0 ? 1.0/(an.sigma*an.sigma) : 0.0)
                   << ", \"correctionSigma\": " << num(an.correctionSigma)
                   << ", \"constraintResponsible\": "
                   << esc(an.responsibleConstraint.empty()
                              ? std::string("none") : an.responsibleConstraint)
                   << ", \"responsibleShare\": " << num(an.responsibleShare)
                   << ", \"atNonNegativityBound\": "
                   << (an.atNonNegativityBound ? "true" : "false");
                if (!an.roles.empty())
                {
                    os << ", \"causedBy\": {";
                    for (std::size_t k = 0; k < an.roles.size(); ++k)
                        os << (k ? ", " : "") << esc(an.roles[k].constraint)
                           << ": " << num(an.roles[k].causedSigma);
                    os << "}, \"closure\": {";
                    bool f2 = true;
                    for (const auto& ro : an.roles)
                    {
                        if (ro.constraint == "nonNegativity") continue;
                        os << (f2 ? "" : ", ") << esc(ro.constraint) << ": "
                           << num(ro.closure);
                        f2 = false;
                    }
                    os << "}";
                }
                os << " }";
            }
            os << "]";
            os << ", \"conservedInventory\": {";
            for (std::size_t k = 0; k < a.conservedInventory.size(); ++k)
                os << (k ? ", " : "") << esc(a.conservedInventory[k].first)
                   << ": " << num(a.conservedInventory[k].second);
            os << "} }";
        }
        os << " }";
    }
    os << "\n  },\n";

    //  ---- problemDivergence ------------------------------------------------
    //  ABOVE the KPIs, and not among the advisories at the bottom.  Placement
    //  is the claim: a consumer that reads the numbers first would learn only
    //  afterwards that they answer a different question.  Always emitted --
    //  an empty array means "nothing diverged", and the absence of the key
    //  would mean "an older Choupo wrote this".
    os << "  \"problemDivergence\": [";
    for (std::size_t k = 0; k < r.divergences.size(); ++k)
    {
        const auto& d = r.divergences[k];
        os << (k ? ",\n    " : "\n    ")
           << "{ \"kind\": " << esc(d.kind)
           << ", \"locus\": " << esc(d.locus)
           << ", \"requested\": " << esc(d.requested)
           << ", \"solved\": " << esc(d.solved)
           << ", \"reason\": " << esc(d.reason) << " }";
    }
    os << (r.divergences.empty() ? "],\n" : "\n  ],\n");

    // ---- kpis ------------------------------------------------------------
    os << "  \"kpis\": {";
    bool firstU = true;
    for (const auto& [unitName, kv] : r.kpis)
    {
        os << (firstU ? "\n" : ",\n");
        firstU = false;
        os << "    " << esc(unitName) << ": {";
        bool firstK = true;
        for (const auto& [key, val] : kv)
        {
            os << (firstK ? " " : ", ");
            firstK = false;
            os << esc(key) << ": " << num(val);
        }
        os << " }";
    }
    os << "\n  },\n";

    // ---- convergence (per-unit residual history) ------------------------
    os << "  \"convergence\": {";
    bool firstC = true;
    for (const auto& [unitName, residuals] : r.convergence)
    {
        os << (firstC ? "\n" : ",\n");
        firstC = false;
        os << "    " << esc(unitName) << ": [";
        for (std::size_t i = 0; i < residuals.size(); ++i)
        {
            if (i) os << ", ";
            os << num(residuals[i]);
        }
        os << "]";
    }
    os << "\n  }";

    // ---- utilities (aggregation by stream.category) --------------
    if (!r.utilities.empty())
    {
        os << ",\n  \"utilities\": {";
        bool firstUu = true;
        for (const auto& [cat, kg_s] : r.utilities)
        {
            os << (firstUu ? " " : ", ");
            firstUu = false;
            os << esc(cat) << ": " << num(kg_s);
        }
        os << " }";
    }

    // ---- energy wires (shaft work / heat couplings between units) ----
    //   One entry per resolved EnergyWire: a direct scalar coupling
    //   (turbine shaft -> compressor / electricLoad, furnace heat ->
    //   heater, ...).  The GUI draws these as a distinct edge class (W /
    //   Q), separate from material-stream edges.
    if (!r.energyWires.empty())
    {
        os << ",\n  \"energyWires\": [";
        bool firstW = true;
        for (const auto& w : r.energyWires)
        {
            os << (firstW ? " " : ", ");
            firstW = false;
            os << "{ \"from\": " << esc(w.fromUnit)
               << ", \"fromPort\": " << esc(w.fromPort)
               << ", \"to\": " << esc(w.toUnit)
               << ", \"target\": " << esc(w.toTarget)
               << ", \"kind\": " << esc(w.kind)
               << ", \"value\": " << num(w.value) << " }";
        }
        os << " ]";
    }

    // ---- recycleLoops (DEV.md 4c C42) ----------------------------------
    //   The loop each declared tear cuts, as the sequential-plan validator
    //   found it: its units and its streams, qualified names.  The GUI
    //   highlights a loop from this list and never re-detects one.
    if (!r.recycleLoops.empty())
    {
        os << ",\n  \"recycleLoops\": [";
        bool firstL = true;
        for (const auto& [tear, loop] : r.recycleLoops)
        {
            os << (firstL ? " " : ", ");
            firstL = false;
            os << "{ \"tear\": " << esc(tear) << ", \"units\": [";
            for (std::size_t k = 0; k < loop.units.size(); ++k)
                os << (k ? ", " : " ") << esc(loop.units[k]);
            os << " ], \"streams\": [";
            for (std::size_t k = 0; k < loop.streams.size(); ++k)
                os << (k ? ", " : " ") << esc(loop.streams[k]);
            os << " ] }";
        }
        os << " ]";
    }

    // ---- model-boundary audit (H conserved, T is the model-dependent readout)
    //   Internal streams where producer and consumer use different thermo
    //   models: the enthalpy the two models disagree about (kJ/mol + kW) and the
    //   implied dT, OR a refusal across a speciation change.  Lets the GUI show
    //   the model inconsistency next to the boundary.
    if (!r.modelBoundaries.empty())
    {
        os << ",\n  \"modelBoundaries\": [";
        bool firstB = true;
        for (const auto& b : r.modelBoundaries)
        {
            os << (firstB ? " " : ", ");
            firstB = false;
            os << "{ \"stream\": " << esc(b.stream)
               << ", \"producer\": " << esc(b.producer)
               << ", \"consumer\": " << esc(b.consumer)
               << ", \"refused\": " << (b.refused ? "true" : "false");
            if (b.refused)
                os << ", \"reason\": " << esc(b.reason);
            else
                os << ", \"dH_kJ_per_mol\": " << num(b.dH_kJ_per_mol)
                   << ", \"dH_kW\": " << num(b.dH_kW)
                   << ", \"implied_dT_K\": " << num(b.implied_dT_K);
            os << " }";
        }
        os << " ]";
    }

    // ---- per-unit energy closure with the model-boundary step accounted --
    //   THREE QUANTITIES, NEVER COLLAPSED (ruling 2026-08-09): the RAW
    //   physical imbalance, the enthalpy STEP attributed to an identified
    //   model transition, and what REMAINS unexplained after it.  The entry
    //   names both sides of the boundary by their declared models, the rule
    //   that authorises the transition, and the step's sign / units /
    //   magnitude, so a reader of the JSON can check the claim without the
    //   CSV.  Only `status: accounted` credited the step.
    if (!r.energyClosures.empty())
    {
        os << ",\n  \"energyClosures\": [";
        bool firstE = true;
        for (const auto& e : r.energyClosures)
        {
            os << (firstE ? " " : ", ");
            firstE = false;
            os << "{ \"unit\": " << esc(e.unit)
               << ", \"status\": " << esc(e.status)
               << ", \"raw_kW\": " << num(e.raw_kW)
               << ", \"step_kW\": " << num(e.step_kW)
               << ", \"remaining_kW\": " << num(e.remaining_kW)
               << ", \"upstreamWorld\": " << esc(e.upstreamWorld)
               << ", \"downstreamWorld\": " << esc(e.downstreamWorld)
               << ", \"rule\": " << esc(e.rule)
               << ", \"sign\": " << esc(e.sign)
               << ", \"units\": " << esc(e.units)
               << ", \"magnitude\": " << num(e.magnitude)
               << ", \"normResidual\": " << num(e.normResidual)
               << ", \"criterion\": " << esc(e.criterion);
            if (!e.detail.empty()) os << ", \"perStream\": " << esc(e.detail);
            if (!e.reason.empty()) os << ", \"reason\": " << esc(e.reason);
            os << " }";
        }
        os << " ]";
    }

    // ---- utility allocation (per-duty utility sizing) ------------
    //   Each heat duty (a unit's Q, or a column reboiler/condenser port)
    //   sized to a plant utility by temperature level --- or flagged
    //   carried (utility stream / heat-link).  Lets the GUI show "which
    //   utility, how much, how much €" next to the duty.
    if (!r.utilityAllocation.empty())
    {
        os << ",\n  \"utilityAllocation\": [";
        bool firstA = true;
        for (const auto& a : r.utilityAllocation)
        {
            os << (firstA ? " " : ", ");
            firstA = false;
            os << "{ \"unit\": " << esc(a.unit)
               << ", \"port\": " << esc(a.port)
               << ", \"tier\": " << esc(a.tier)
               << ", \"utility\": " << esc(a.utility)
               << ", \"duty_kW\": " << num(a.duty_kW)
               << ", \"T\": " << num(a.T)
               << ", \"kg_s\": " << num(a.kg_s)
               << ", \"MW\": " << num(a.MW)
               << ", \"eur_h\": " << num(a.eur_h)
               << ", \"allocated\": " << (a.allocated ? "true" : "false")
               << ", \"carried\": " << (a.carried ? "true" : "false") << " }";
        }
        os << " ]";
    }

    // ---- computed (post-processing expressions) ------------------
    if (!r.computed.empty())
    {
        os << ",\n  \"computed\": {";
        bool firstC = true;
        for (const auto& [name, val] : r.computed)
        {
            os << (firstC ? " " : ", ");
            firstC = false;
            os << esc(name) << ": " << num(val);
        }
        os << " }";
    }

    // ---- EQUIPMENT: what the design and costing passes concluded --------
    //  The sizing and costing passes produce the plant's equipment list -- the
    //  vessel volumes, exchanger areas, wall thicknesses, materials, the design
    //  BASIS that produced each size, and the money that follows from it -- and
    //  until now NONE of it crossed into the result JSON.  The engine printed a
    //  table, wrote two CSVs, and the browser could not draw a single row of
    //  it: the app's Reports workspace showed balances, utilities, exchanger
    //  datasheets and the DCF appraisal, and no equipment list at all.
    //
    //  Same shape as the sector stamp and the fit verdict before it: the engine
    //  computes the fact, the crossing drops it, and the reader is left without.
    //
    //  Emitted only when a sizing pass actually produced something, so a case
    //  with no postDict gains no block.  The COST is nested inside its unit
    //  rather than shipped as a second array keyed by name: a unit's size and
    //  its price are one row of one table to every reader, and two arrays that
    //  must be joined by name is the crossing this project keeps paying for.
    if (!r.sizings.empty())
    {
        os << ",\n  \"equipment\": [";
        bool firstE = true;
        for (const auto& [itemKey, sz] : r.sizings)
        {
            os << (firstE ? "\n" : ",\n");
            firstE = false;
            //  TWO IDENTITIES, TWO QUESTIONS.  `unit` is the flowsheet
            //  operation and `item` is the physical object it realises; a
            //  distillation column publishes five lines under one `unit`, and
            //  a reader -- the golden `equipment` kind included -- resolves
            //  them on `item`.  For every unit that realises a single item
            //  the two are the same string, which is what keeps every case
            //  that predates the column sizer matching exactly as before.
            os << "    { \"unit\": " << esc(sz.unitName)
               << ", \"item\": " << esc(itemKey);
            if (!sz.equipmentTag.empty())
                os << ", \"tag\": " << esc(sz.equipmentTag);
            if (!sz.sector.empty()) os << ", \"sector\": " << esc(sz.sector);
            os << ", \"type\": " << esc(sz.equipmentType)
               << ", \"material\": " << esc(sz.material);
            if (!sz.basis.empty()) os << ", \"basis\": " << esc(sz.basis);
            os << ", \"values\": {";
            bool firstV = true;
            for (const auto& [k, v] : sz.values)
            {
                os << (firstV ? " " : ", ");
                firstV = false;
                os << esc(k) << ": " << num(v);
            }
            os << " }";
            //  WHAT THE ITEM HOLDS (2026-10-07, DEV.md 4c C44 slice 3), ONE
            //  FLAT OBJECT so the golden `equipment` kind reads it as
            //  `inventory.<key>`: `volume` [m3] the fractions apply to, per
            //  held stream `<stream>.fraction` [-], `.volume` [m3], `.rho`
            //  [kg/m3], `.mass` [kg]; `mass.<component>` [kg] and
            //  `mass.total` [kg] over the phases.  Written BEFORE `cost`
            //  (whose reader takes the rest of the line) and ONLY for an item
            //  that declared one, so every other item's line is unchanged.
            if (sz.inventory.present())
            {
                const auto& inv = sz.inventory;
                os << ", \"inventory\": { \"volume\": " << num(inv.volume);
                for (const auto& h : inv.phases)
                    os << ", " << esc(h.stream + ".fraction") << ": " << num(h.fraction)
                       << ", " << esc(h.stream + ".volume")   << ": " << num(h.volume)
                       << ", " << esc(h.stream + ".rho")      << ": " << num(h.rho)
                       << ", " << esc(h.stream + ".mass")     << ": " << num(h.mass);
                for (const auto& [c, kg] : inv.massOf())
                    os << ", " << esc("mass." + c) << ": " << num(kg);
                os << ", \"mass.total\": " << num(inv.total()) << " }";
            }
            auto ci = r.costs.find(itemKey);
            if (ci != r.costs.end())
            {
                const auto& c = ci->second;
                os << ", \"cost\": { \"purchased\": " << num(c.purchasedCost)
                   << ", \"bareModule\": " << num(c.bareModuleCost)
                   << ", \"totalModule\": " << num(c.totalModuleCost)
                   << ", \"currency\": " << esc(c.currency);
                if (!c.sizeKey.empty())     os << ", \"sizeKey\": " << esc(c.sizeKey);
                if (!c.correlation.empty()) os << ", \"correlation\": " << esc(c.correlation);
                os << ", \"factors\": {";
                bool firstF = true;
                for (const auto& [k, v] : c.factors)
                {
                    os << (firstF ? " " : ", ");
                    firstF = false;
                    os << esc(k) << ": " << num(v);
                }
                os << " } }";
            }
            os << " }";
        }
        os << "\n  ]";
    }

    // ---- which SECTOR owns each unit ------------------------------------
    //  The browser draws a flat list of dotted names and has no way to
    //  recover the hierarchy: the result JSON carries no topology, and
    //  splitting `SECTOR.unit` on its last dot is the name identity the F2
    //  contract bans (right on today's corpus, silently wrong for the first
    //  unit whose name carries a dot for another reason).  So the stamp made
    //  at the flatten seam travels here too -- same origin as the design and
    //  costing surfaces, never re-derived.
    //
    //  Emitted ONLY when a hierarchy exists, so a flat case's JSON is
    //  byte-identical to what it was before this block: an empty map on every
    //  flat case would assert a structure that is not there, the same rule
    //  the CSV column and the console banner follow.
    {
        bool anySector = false;
        for (const auto& fu : r.topology)
            if (!fu.sector.empty()) { anySector = true; break; }
        if (anySector)
        {
            os << ",\n  \"unitSectors\": {";
            bool firstS = true;
            for (const auto& fu : r.topology)
            {
                if (fu.sector.empty()) continue;
                os << (firstS ? "\n" : ",\n");
                firstS = false;
                os << "    " << esc(fu.name) << ": " << esc(fu.sector);
            }
            os << "\n  }";
        }
    }

    // ---- profiles (1-D internal state: PFR axial sweep, column stages) ---
    if (!r.profiles.empty())
    {
        os << ",\n  \"profiles\": {";
        bool firstP = true;
        for (const auto& [unitName, prof] : r.profiles)
        {
            os << (firstP ? "\n" : ",\n");
            firstP = false;
            os << "    " << esc(unitName) << ": {\n";
            os << "      \"xAxis\": " << esc(prof.xAxis) << ",\n";
            os << "      \"columns\": {";
            bool firstCol = true;
            for (const auto& [col, vals] : prof.columns)
            {
                os << (firstCol ? "\n" : ",\n");
                firstCol = false;
                os << "        " << esc(col) << ": [";
                for (std::size_t i = 0; i < vals.size(); ++i)
                {
                    if (i) os << ", ";
                    os << num(vals[i]);
                }
                os << "]";
            }
            os << "\n      }";
            if (!prof.markers.empty())
            {
                os << ",\n      \"markers\": [";
                for (std::size_t i = 0; i < prof.markers.size(); ++i)
                {
                    if (i) os << ", ";
                    os << "{ \"x\": " << num(prof.markers[i].x)
                       << ", \"label\": " << esc(prof.markers[i].label) << " }";
                }
                os << "]";
            }
            os << "\n    }";
        }
        os << "\n  }";
    }

    // ---- T-x-y (only emitted for binary VLE systems) ---------------------
    if (r.txy.has_value())
    {
        const auto& t = *r.txy;
        os << ",\n  \"txy\": {\n";
        os << "    \"P\": " << num(t.P) << ",\n";
        os << "    \"components\": [" << esc(t.comp1) << ", " << esc(t.comp2) << "],\n";
        auto writeVec = [&](const char* key, const std::vector<scalar>& v)
        {
            os << "    " << esc(key) << ": [";
            for (std::size_t i = 0; i < v.size(); ++i)
            {
                if (i) os << ", ";
                os << num(v[i]);
            }
            os << "]";
        };
        writeVec("xBubble", t.xBubble); os << ",\n";
        writeVec("Tbubble", t.Tbubble); os << ",\n";
        writeVec("yDew",    t.yDew);    os << ",\n";
        writeVec("Tdew",    t.Tdew);    os << "\n  }";
    }

    // ---- timeline (batch recipe/status sequence) -- the machine-readable
    //      feed of the sequence/Gantt view; absent unless events fired ----
    if (!r.timeline.empty())
    {
        os << ",\n  \"timeline\": [";
        for (std::size_t i = 0; i < r.timeline.size(); ++i)
        {
            const auto& e = r.timeline[i];
            os << (i ? ",\n" : "\n")
               << "    { \"t\": "        << e.t
               << ", \"kind\": "         << esc(e.kind)
               << ", \"action\": "       << esc(e.action)
               << ", \"detail\": "       << esc(e.detail)
               << ", \"trigger\": "      << esc(e.trigger)
               << ", \"from\": "         << esc(e.from)
               << ", \"to\": "           << esc(e.to);
            if (e.tEnd > e.t)
                os << ", \"tEnd\": "     << e.tEnd;
            os << " }";
        }
        os << "\n  ]";
    }

    // ---- transfers (the batch MATERIAL LEDGER; timeline/Gantt project it) --
    if (!r.transfers.empty())
    {
        os << ",\n  \"transfers\": [";
        for (std::size_t i = 0; i < r.transfers.size(); ++i)
        {
            const auto& tr = r.transfers[i];
            os << (i ? ",\n" : "\n")
               << "    { \"tStart\": " << tr.tStart
               << ", \"tEnd\": "  << tr.tEnd
               << ", \"from\": " << esc(tr.from)
               << ", \"to\": "   << esc(tr.to)
               << ", \"kind\": " << esc(tr.kind)
               << ", \"dn\": {";
            bool first = true;
            for (const auto& [c, v] : tr.dn)
            {
                os << (first ? " " : ", ") << esc(c) << ": " << num(v);
                first = false;
            }
            os << " }";
            if (tr.H_valid) os << ", \"H_kJ\": " << num(tr.H_kJ);
            if (!tr.H_missing.empty())
            {
                os << ", \"H_missing\": [";
                for (std::size_t m = 0; m < tr.H_missing.size(); ++m)
                    os << (m ? ", " : "") << esc(tr.H_missing[m]);
                os << "]";
            }
            os << " }";
        }
        os << "\n  ]";
    }

    // ---- energyLedger (the batch ENERGY LEDGER: one record per segment of
    //      constant physics; E_kJ only when the whole segment was priceable) --
    if (!r.energyLedger.empty())
    {
        os << ",\n  \"energyLedger\": [";
        for (std::size_t i = 0; i < r.energyLedger.size(); ++i)
        {
            const auto& er = r.energyLedger[i];
            os << (i ? ",\n" : "\n")
               << "    { \"tStart\": " << er.tStart
               << ", \"tEnd\": "  << er.tEnd
               << ", \"unit\": "  << esc(er.unit)
               << ", \"kind\": "  << esc(er.kind);
            if (er.E_valid) os << ", \"E_kJ\": " << num(er.E_kJ);
            if (er.T_service_K >= 0.0)
                os << ", \"T_service_K\": " << num(er.T_service_K);
            if (!er.E_missing.empty())
            {
                os << ", \"E_missing\": [";
                for (std::size_t m = 0; m < er.E_missing.size(); ++m)
                    os << (m ? ", " : "") << esc(er.E_missing[m]);
                os << "]";
            }
            os << ", \"basis\": " << esc(er.basis) << " }";
        }
        os << "\n  ]";
    }

    // ---- advisories (solver "speak-up": bounds active at the solution,
    //      rating exceedances, auto-init) -- so the GUI surfaces them ----
    os << advisoriesJson(r.advisories);

    // ---- thermoResolution (binary-pair provenance) -- feeds the GUI
    //      foundation navigator + pair-coverage matrix ----
    if (!r.thermoResolution.empty())
    {
        os << ",\n  \"thermoResolution\": [";
        for (std::size_t i = 0; i < r.thermoResolution.size(); ++i)
        {
            const auto& p = r.thermoResolution[i];
            os << (i ? ",\n" : "\n") << "    { \"model\": " << esc(p.model)
               << ", \"i\": " << esc(p.i)
               << ", \"j\": " << esc(p.j)
               << ", \"status\": " << esc(p.status)
               << ", \"source\": " << esc(p.source)
               << ", \"provSource\": " << esc(p.provSource);
            //  P1 audit detail (forum #67 D-c): full structured record, from
            //  the ONE shared formatter.  This site used to ALSO emit
            //  `origin`, `method` and `methodVersion` by hand immediately
            //  before calling it, so every pair came out with those three keys
            //  TWICE in one JSON object -- the shared emitter existing exactly
            //  to prevent a second copy, with the second copy beside it.
            os << pairResolutionAuditJson(p, esc);
            os << " }";
        }
        os << "\n  ]";
    }

    // ---- componentCoverage (per-component thermo capabilities) -- feeds the
    //      GUI thermo-readiness view: ready vs gap (no Antoine -> no VLE) ----
    if (!r.componentCoverage.empty())
    {
        os << ",\n  \"componentCoverage\": [";
        for (std::size_t i = 0; i < r.componentCoverage.size(); ++i)
        {
            const auto& c = r.componentCoverage[i];
            auto b = [](bool v) { return v ? "true" : "false"; };
            os << (i ? ",\n" : "\n") << "    { \"name\": " << esc(c.name)
               << ", \"criticals\": "   << b(c.criticals)
               << ", \"psat\": "        << b(c.psat)
               << ", \"vliq\": "        << b(c.vliq)
               << ", \"cpIdealGas\": "  << b(c.cpIdealGas)
               << ", \"gibbs\": "       << b(c.gibbs)
               << ", \"nonvolatile\": " << b(c.nonvolatile) << " }";
        }
        os << "\n  ]";
    }

    // ---- economics (discounted-cash-flow appraisal, Perry / Turton Ch.10) --
    //   The headline scalars (FCI / TCI / COM_d / revenue / NPV / IRR /
    //   payback + AACE accuracy band) AND the full year-by-year DCF table ---
    //   exactly the columns of reports/economics/cashFlow.csv.  Emitted ONLY
    //   when an economics postDict ran (economics.present); omitted otherwise
    //   so every non-economics case's JSON is byte-for-byte unchanged.
    //  The plant-boundary first law, ONE LINE so the golden extractor and the
    //  GUI read the same object (see SimulationResult::GlobalEnergyBoundary).
    if (r.globalEnergyBoundary.present)
    {
        const auto& gb = r.globalEnergyBoundary;
        os << ",\n  \"globalEnergyBoundary\": { "
           << "\"H_feeds_kW\": "    << num(gb.H_feeds_kW)
           << ", \"Q_boundary_kW\": " << num(gb.Q_boundary_kW)
           //  The same number, told apart: heat down a temperature
           //  difference vs work through a shaft.  They sum back to
           //  Q_boundary_kW exactly (the report derives the heat by
           //  subtraction), so a reader may draw  dH = Q - W  without
           //  computing anything of its own.  Sign: + is energy ADDED to
           //  the process streams, so the textbook W is -W_shaft_kW.
           << ", \"Q_heat_kW\": "     << num(gb.Q_heat_kW)
           << ", \"W_shaft_kW\": "    << num(gb.W_shaft_kW)
           << ", \"H_products_kW\": " << num(gb.H_products_kW)
           << ", \"residual_kW\": "   << num(gb.residual_kW)
           //  A percentage with no scale behind it is not published as a
           //  number: `residual_pct_available` false means the reader must
           //  draw the ABSOLUTE residual and say the ratio is unavailable
           //  (2026-09-08 -- the triple-effect evaporator was emitting
           //  -6.16e14 % from a 1e-9 kW floor).  `null` rather than an
           //  omitted key, so an old reader sees the change instead of
           //  silently defaulting to 0.
           << ", \"residual_pct\": "
           << (gb.residual_pct_available ? num(gb.residual_pct)
                                         : std::string("null"))
           << ", \"residual_pct_available\": "
           << (gb.residual_pct_available ? "true" : "false")
           << ", \"residual_denom_kW\": "
           << (gb.residual_pct_available ? num(gb.residual_denom_kW)
                                         : std::string("null"))
           << ", \"residual_basis\": \"" << gb.residual_basis << "\""
           << ", \"n_feeds\": "       << gb.n_feeds
           << ", \"n_products\": "    << gb.n_products
           << ", \"n_gap\": "         << gb.n_gap
           << ", \"noBoundary\": "    << (gb.noBoundary ? "true" : "false")
           << ", \"datum\": "         << esc(gb.datum)
           << " }";
    }
    //  THE PLANT-BOUNDARY MATERIAL SUMMARY, IN TWO SCOPES, ONE LINE -- so the
    //  golden extractor and the GUI read the same object, exactly as the first
    //  law above does.  Emitted ONLY when the case DECLARED a utility circuit:
    //  the object's PRESENCE is the answer to "was anything declared here?",
    //  and a case with no `utilities` block therefore writes byte-for-byte
    //  what it wrote before this existed.  A reader that does not find it
    //  reads the massBalance report's single TOTAL scope, which is the whole
    //  balance for that case.
    if (r.globalMassBoundary.present && r.globalMassBoundary.declared)
    {
        const auto& gm = r.globalMassBoundary;
        os << ",\n  \"globalMassBoundary\": { "
           << "\"declared\": "          << (gm.declared ? "true" : "false")
           << ", \"n_circuits\": "      << gm.n_circuits
           << ", \"total_in_kg_per_h\": "  << num(gm.total_in_kg_per_h)
           << ", \"total_out_kg_per_h\": " << num(gm.total_out_kg_per_h)
           //  A closure needs a boundary: `null` rather than a 0.0000 that
           //  reads as the gravest violation possible, about nothing (the
           //  report's own `n/a` rule, and the 2026-09-08 percentage-with-no-
           //  scale rule one balance over).
           << ", \"total_closure_pct\": "
           << (gm.total_closure_available ? num(gm.total_closure_pct)
                                          : std::string("null"))
           << ", \"process_in_kg_per_h\": "  << num(gm.process_in_kg_per_h)
           << ", \"process_out_kg_per_h\": " << num(gm.process_out_kg_per_h)
           << ", \"process_closure_pct\": "
           << (gm.process_closure_available ? num(gm.process_closure_pct)
                                            : std::string("null"))
           << ", \"utility_excluded_kg_per_h\": "
           << num(gm.utility_excluded_kg_per_h)
           << ", \"utility_fraction_pct\": " << num(gm.utility_fraction_pct)
           << " }";
    }
    if (r.economics.present)
    {
        const auto& e = r.economics;
        os << ",\n  \"economics\": {\n";
        os << "    \"currency\": "          << esc(e.currency)           << ",\n";
        os << "    \"FCI\": "               << num(e.FCI)                << ",\n";
        os << "    \"WC\": "                << num(e.WC)                 << ",\n";
        os << "    \"TCI\": "               << num(e.TCI)                << ",\n";
        os << "    \"COM_d\": "             << num(e.COM_d)              << ",\n";
        os << "    \"revenue\": "           << num(e.revenue)            << ",\n";
        os << "    \"depreciation\": "      << num(e.depreciation)       << ",\n";
        os << "    \"NPV\": "               << num(e.NPV)                << ",\n";
        os << "    \"IRR\": "               << (e.haveIRR ? num(e.IRR) : std::string("null")) << ",\n";
        os << "    \"irrAmbiguous\": "      << (e.irrAmbiguous ? "true" : "false") << ",\n";
        os << "    \"discountedPayback\": " << num(e.discPayback)        << ",\n";
        os << "    \"simplePayback\": "     << num(e.simplePayback)      << ",\n";
        os << "    \"discountRate\": "      << num(e.discountRate)       << ",\n";
        os << "    \"taxRate\": "           << num(e.taxRate)            << ",\n";
        os << "    \"projectLife\": "       << e.projectLife             << ",\n";
        os << "    \"estimateClass\": "     << e.estimateClass           << ",\n";
        os << "    \"accLo\": "             << num(e.accLo)              << ",\n";
        os << "    \"accHi\": "             << num(e.accHi)              << ",\n";
        //  THE LAND (2026-10-17, DEV.md 4c C82), ONLY when the case declared
        //  a land price -- every other economics case's JSON is byte-for-byte
        //  what it was.  `cost` and `area` are also `kpis.economics.land` /
        //  `landArea`, which the golden `kpi` kind pins; the cash-flow rows
        //  then carry a `land` cell (the outlay at the start of construction,
        //  the recovery in the last year).
        if (e.landPresent)
            os << "    \"land\": { \"price\": " << num(e.landPrice)
               << ", \"area\": " << num(e.landArea)
               << ", \"areaFrom\": " << esc(e.landAreaFrom)
               << ", \"cost\": " << num(e.landCost)
               << ", \"investedAtYear\": " << e.landInvestedAtYear
               << ", \"recoveredAtYear\": " << e.landRecoveredAtYear
               << ", \"source\": " << esc(e.landSource)
               << ", \"reason\": " << esc(e.landReason) << " },\n";
        //  THE WORKING CAPITAL BUILT UP (2026-10-07, DEV.md 4c C44 slice 4),
        //  ONLY when the case declared the model -- every fraction-of-FCI
        //  case's JSON is byte-for-byte what it was.  The numbers are also
        //  `kpis.economics.WC_*`, which the golden `kpi` kind pins; this
        //  object carries the WORDS (each line's rule) a reader draws.
        if (e.workingCapital.present)
        {
            const auto& w = e.workingCapital;
            auto line = [&](const WorkingCapitalLine& l, bool first)
            {
                os << (first ? "\n" : ",\n") << "        { \"key\": " << esc(l.key)
                   << ", \"label\": " << esc(l.label)
                   << ", \"value\": " << num(l.value)
                   << ", \"rule\": " << esc(l.rule) << " }";
            };
            os << "    \"workingCapital\": {\n      \"assets\": [";
            for (std::size_t i = 0; i < w.assets.size(); ++i) line(w.assets[i], i == 0);
            os << "\n      ],\n      \"liabilities\": [";
            for (std::size_t i = 0; i < w.liabilities.size(); ++i)
                line(w.liabilities[i], i == 0);
            os << "\n      ],\n"
               << "      \"gross\": " << num(w.gross)
               << ", \"net\": " << num(w.net)
               << ", \"fractionRule\": " << num(w.fractionRule)
               << ", \"fractionUsed\": " << num(w.fractionUsed)
               << ", \"productionCostPerKg\": " << num(w.productionCostPerKg)
               << "\n    },\n";
        }
        //  THE START-UP YEARS (2026-10-11, DEV.md 4c C63), ONLY when the
        //  case declared a timeline beyond the one-year, full-production
        //  shape -- every other case's JSON is byte-for-byte what it was.
        //  The rows then also run over the construction years (year <= 0).
        if (e.timelineExtended)
        {
            auto list = [&](const std::vector<scalar>& v)
            {
                std::string out = "[";
                for (std::size_t k = 0; k < v.size(); ++k)
                    out += (k ? ", " : "") + num(v[k]);
                return out + "]";
            };
            os << "    \"timeline\": { \"constructionPeriod\": " << e.constructionPeriod
               << ", \"capitalSchedule\": " << list(e.capitalSchedule)
               << ", \"rampUp\": " << list(e.rampUp)
               << ", \"startupCostFraction\": " << num(e.startupCostFraction)
               << ", \"startupCost\": " << num(e.startupCost)
               << ", \"NPV_atStartOfConstruction\": " << num(e.NPV_projectStart)
               << " },\n";
        }
        //  THE ONE-AT-A-TIME SENSITIVITY (2026-10-17; the pass is C68), ONLY
        //  when the case declared it -- every other economics case's JSON is
        //  byte-for-byte what it was.  The rows of sensitivity.csv in its
        //  (tornado) order, with the engine's own caveat sentence; the GUI's
        //  tornado draws exactly this.  The numbers are also
        //  `kpis.economics.sens_*`, pinned by the golden `kpi` kind.
        if (!e.sensitivity.empty())
        {
            os << "    \"sensitivity\": {\n      \"caveat\": " << esc(e.sensitivityCaveat)
               << ",\n      \"inputs\": [";
            for (std::size_t i = 0; i < e.sensitivity.size(); ++i)
            {
                const auto& sr = e.sensitivity[i];
                os << (i ? ",\n" : "\n") << "        { \"input\": " << esc(sr.input)
                   << ", \"kpiKey\": "       << esc(sr.kpiKey)
                   << ", \"mode\": "         << esc(sr.mode)
                   << ", \"fromBand\": "     << (sr.fromBand ? "true" : "false")
                   << ", \"declaredLow\": "  << num(sr.declaredLow)
                   << ", \"declaredHigh\": " << num(sr.declaredHigh)
                   << ", \"unit\": "         << esc(sr.unit)
                   << ", \"baseValue\": "    << num(sr.baseValue)
                   << ", \"valueLow\": "     << num(sr.valueLow)
                   << ", \"valueHigh\": "    << num(sr.valueHigh)
                   << ", \"NPV_low\": "      << num(sr.NPV_low)
                   << ", \"NPV_high\": "     << num(sr.NPV_high)
                   << ", \"NPVswing\": "     << num(sr.NPVswing)
                   << ", \"NPVsignFlip\": "  << esc(sr.NPVsignFlip) << " }";
            }
            os << "\n      ]\n    },\n";
        }
        os << "    \"cashFlow\": [";
        for (std::size_t i = 0; i < e.cashFlow.size(); ++i)
        {
            const auto& cf = e.cashFlow[i];
            os << (i ? ",\n" : "\n") << "      { \"year\": " << cf.year
               << ", \"investment\": "     << num(cf.investment);
            if (e.landPresent)
                os << ", \"land\": " << num(cf.land);
            if (e.timelineExtended)
                os << ", \"productionFraction\": " << num(cf.productionFraction);
            os << ", \"revenue\": "        << num(cf.revenue)
               << ", \"opex\": "           << num(cf.operatingCost);
            if (e.timelineExtended)
                os << ", \"startupCost\": " << num(cf.startupCost);
            os << ", \"depreciation\": "   << num(cf.depreciation)
               << ", \"taxableIncome\": "  << num(cf.taxableIncome)
               << ", \"tax\": "            << num(cf.tax)
               << ", \"afterTaxProfit\": " << num(cf.afterTaxProfit)
               << ", \"cashFlow\": "       << num(cf.cashFlow)
               << ", \"discountFactor\": " << num(cf.discountFactor)
               << ", \"discountedCF\": "   << num(cf.discountedCF)
               << ", \"cumulativeDCF\": "  << num(cf.cumulativeDCF) << " }";
        }
        os << "\n    ]\n  }";
    }

    // ---- layout: the plot plan the case declared, as the engine read it ---
    //  (2026-10-17, DEV.md 4c C75).  ONLY when the case declares
    //  `system/layoutDict`, so every other case's JSON is byte-for-byte what
    //  it was.  EVERY LINE THAT CARRIES A NUMBER CARRIES AN `"id"`, one record
    //  per line: the golden `layout` kind resolves a row by that id (item id,
    //  `<kind>:<a>:<b>` for a finding, `summary`) without walking braces.
    //  The GUI draws this block and computes no footprint and no position.
    if (r.layout.present())
    {
        const auto& L = r.layout;
        os << ",\n  \"layout\": {\n    \"items\": [";
        for (std::size_t i = 0; i < L.items.size(); ++i)
        {
            const auto& it = L.items[i];
            os << (i ? ",\n" : "\n") << "      { \"id\": " << esc(it.id)
               << ", \"nonProcess\": " << (it.nonProcess ? "true" : "false")
               << ", \"kind\": " << esc(it.kind)
               << ", \"sector\": " << esc(it.sector)
               << ", \"shape\": " << esc(it.shape)
               << ", \"orientation\": " << esc(it.orientation)
               << ", \"footprintFrom\": " << esc(it.footprintFrom)
               << ", \"x\": " << num(it.x) << ", \"y\": " << num(it.y)
               << ", \"z\": " << num(it.z)
               << ", \"dx\": " << num(it.dx) << ", \"dy\": " << num(it.dy)
               << ", \"dz\": " << num(it.dz);
            if (!it.ignition.empty())
                os << ", \"ignition\": " << esc(it.ignition);
            if (!it.source.empty())
                os << ", \"source\": " << esc(it.source)
                   << ", \"reason\": " << esc(it.reason);
            if (it.release)
            {
                os << ", \"release\": { \"source\": " << esc(it.releaseSource)
                   << ", \"reason\": " << esc(it.releaseReason)
                   << ", \"zones\": [";
                for (std::size_t z = 0; z < it.zones.size(); ++z)
                    os << (z ? ", " : " ") << "{ \"zone\": " << it.zones[z].zone
                       << ", \"radius\": " << num(it.zones[z].radius)
                       << ", \"height\": " << num(it.zones[z].height) << " }";
                os << " ] }";
            }
            os << " }";
        }
        os << "\n    ],\n    \"areas\": [";
        for (std::size_t i = 0; i < L.areas.size(); ++i)
        {
            const auto& a = L.areas[i];
            os << (i ? ",\n" : "\n") << "      { \"id\": " << esc("area:" + a.sector)
               << ", \"sector\": " << esc(a.sector)
               << ", \"xMin\": " << num(a.xMin) << ", \"xMax\": " << num(a.xMax)
               << ", \"yMin\": " << num(a.yMin) << ", \"yMax\": " << num(a.yMax)
               << " }";
        }
        os << (L.areas.empty() ? "]" : "\n    ]") << ",\n    \"separation\": [";
        for (std::size_t i = 0; i < L.separation.size(); ++i)
        {
            const auto& t = L.separation[i];
            os << (i ? ",\n" : "\n") << "      { \"source\": " << esc(t.source)
               << ", \"reason\": " << esc(t.reason)
               << ", \"measure\": " << esc(t.measure) << ", \"rules\": [";
            for (std::size_t k = 0; k < t.rules.size(); ++k)
                os << (k ? ", " : " ") << "{ \"a\": " << esc(t.rules[k].a)
                   << ", \"b\": " << esc(t.rules[k].b)
                   << ", \"distance\": " << num(t.rules[k].distance) << " }";
            os << " ] }";
        }
        os << (L.separation.empty() ? "]" : "\n    ]");
        if (L.wind.present)
        {
            const auto& w = L.wind;
            os << ",\n    \"wind\": { \"id\": \"wind\", \"angleUnit\": \"deg\""
               << ", \"from\": " << num(w.fromDeg)
               << ", \"planNorth\": " << num(w.planNorthDeg)
               << ", \"halfAngle\": " << num(w.halfAngleDeg)
               << ", \"reach\": " << num(w.reach)
               << ", \"source\": " << esc(w.source)
               << ", \"reason\": " << esc(w.reason) << " }";
        }
        os << ",\n    \"findings\": [";
        for (std::size_t i = 0; i < L.findings.size(); ++i)
        {
            const auto& f = L.findings[i];
            os << (i ? ",\n" : "\n") << "      { \"id\": " << esc(f.id)
               << ", \"kind\": " << esc(f.kind)
               << ", \"a\": " << esc(f.a) << ", \"b\": " << esc(f.b)
               << ", \"value\": " << num(f.value) << ", \"limit\": " << num(f.limit)
               << ", \"message\": " << esc(f.message) << " }";
        }
        os << (L.findings.empty() ? "]" : "\n    ]");
        auto list = [&](const char* key, const std::vector<std::string>& v)
        {
            os << ",\n    \"" << key << "\": [";
            for (std::size_t i = 0; i < v.size(); ++i)
                os << (i ? ", " : "") << esc(v[i]);
            os << "]";
        };
        list("unplaced", L.unplaced);
        list("internal", L.internal);
        //  THE PIPES (DEV.md 4c C80): the rack, the junctions on it, one
        //  line per routed pipe and one per stream not routed.  The route is
        //  published IN THE DIRECTION OF FLOW (the producer's end first), so
        //  no separate direction field is needed; the stream's state is read
        //  here from `streams` with the stream table's own mass-flow sum, so
        //  the two surfaces cannot disagree.  The golden `layout` kind pins
        //  each pipe's `length` and its two ends (`from`, `to`).
        {
            const auto& k = L.pipeRack;
            os << ",\n    \"pipeRack\": { \"id\": \"pipeRack\""
               << ", \"declared\": " << (k.declared ? "true" : "false")
               << ", \"y\": " << num(k.y)
               << ", \"elevation\": " << num(k.elevation)
               << ", \"laneSpacing\": " << num(k.laneSpacing)
               << ", \"lanesPerTier\": " << k.lanesPerTier
               << ", \"tierSpacing\": " << num(k.tierSpacing)
               << ", \"xStart\": " << num(k.xStart)
               << ", \"xEnd\": " << num(k.xEnd)
               << ", \"reason\": " << esc(k.reason) << " }";
        }
        os << ",\n    \"junctions\": [";
        for (std::size_t i = 0; i < L.junctions.size(); ++i)
        {
            const auto& j = L.junctions[i];
            os << (i ? ",\n" : "\n") << "      { \"id\": " << esc("junction:" + j.unit)
               << ", \"unit\": " << esc(j.unit) << ", \"type\": " << esc(j.type)
               << ", \"x\": " << num(j.x) << ", \"y\": " << num(j.y)
               << ", \"z\": " << num(j.z) << " }";
        }
        os << (L.junctions.empty() ? "]" : "\n    ]") << ",\n    \"pipes\": [";
        scalar pipeLength = 0;
        for (std::size_t i = 0; i < L.pipes.size(); ++i)
        {
            const auto& p = L.pipes[i];
            pipeLength += p.length;
            os << (i ? ",\n" : "\n") << "      { \"id\": " << esc("pipe:" + p.stream)
               << ", \"stream\": " << esc(p.stream);
            if (!p.label.empty()) os << ", \"label\": " << esc(p.label);
            os << ", \"fromKind\": " << esc(p.fromKind)
               << ", \"from\": " << esc(p.from)
               << ", \"fromUnit\": " << esc(p.fromUnit)
               << ", \"toKind\": " << esc(p.toKind)
               << ", \"to\": " << esc(p.to)
               << ", \"toUnit\": " << esc(p.toUnit)
               << ", \"routedBy\": " << esc(p.routedBy)
               << ", \"lane\": " << p.lane
               << ", \"length\": " << num(p.length);
            auto st = r.streams.find(p.stream);
            if (st != r.streams.end())
            {
                const auto& sv = st->second;
                if (haveMW) os << ", \"F_mass\": " << num(overallMassFlow(r, sv));
                os << ", \"T\": " << num(sv.T) << ", \"P\": " << num(sv.P)
                   << ", \"vf\": " << num(sv.vf);
            }
            os << ", \"route\": [";
            for (std::size_t q = 0; q < p.route.size(); ++q)
                os << (q ? ", " : "") << "[" << num(p.route[q][0]) << ", "
                   << num(p.route[q][1]) << ", " << num(p.route[q][2]) << "]";
            os << "] }";
        }
        os << (L.pipes.empty() ? "]" : "\n    ]") << ",\n    \"notRouted\": [";
        for (std::size_t i = 0; i < L.notRouted.size(); ++i)
        {
            const auto& n = L.notRouted[i];
            os << (i ? ",\n" : "\n") << "      { \"id\": " << esc("notRouted:" + n.stream)
               << ", \"stream\": " << esc(n.stream)
               << ", \"reason\": " << esc(n.reason)
               << ", \"fromUnit\": " << esc(n.fromUnit)
               << ", \"toUnit\": " << esc(n.toUnit);
            //  The end the layout reaches, where the view marks the missing
            //  pipe; an ARRAY, so the golden's layout row reads no number here.
            if (n.anchor.size() == 3)
                os << ", \"anchor\": [" << num(n.anchor[0]) << ", "
                   << num(n.anchor[1]) << ", " << num(n.anchor[2]) << "]";
            os << " }";
        }
        os << (L.notRouted.empty() ? "]" : "\n    ]");
        //  THE PLOT (DEV.md 4c C82): one line for the whole plot, one per
        //  sector, each with an `"id"` so the golden `layout` kind pins
        //  `plotArea` and `footprintArea` on it.  The rule is the engine's
        //  own sentence; the GUI quotes it and computes no area.
        if (L.plot.present)
        {
            const auto& p = L.plot;
            os << ",\n    \"plot\": { \"id\": \"plot\""
               << ", \"margin\": " << num(p.margin)
               << ", \"marginDeclared\": " << (p.marginDeclared ? "true" : "false")
               << ", \"xMin\": " << num(p.xMin) << ", \"xMax\": " << num(p.xMax)
               << ", \"yMin\": " << num(p.yMin) << ", \"yMax\": " << num(p.yMax)
               << ", \"plotArea\": " << num(p.plotArea)
               << ", \"footprintArea\": " << num(p.footprintArea)
               << ", \"footprintShare\": " << num(p.footprintShare)
               << ", \"stackedPairs\": " << p.stackedPairs
               << ", \"declaredAreasUnion\": " << num(p.declaredAreasUnion)
               << ", \"declaredAreasOverlap\": " << num(p.declaredAreasOverlap)
               << ", \"marginReason\": " << esc(p.marginReason)
               << ", \"rule\": " << esc(p.rule) << " }";
            os << ",\n    \"plotSectors\": [";
            for (std::size_t i = 0; i < p.sectors.size(); ++i)
            {
                const auto& ps = p.sectors[i];
                os << (i ? ",\n" : "\n") << "      { \"id\": " << esc("plotSector:" + ps.sector)
                   << ", \"sector\": " << esc(ps.sector)
                   << ", \"from\": " << esc(ps.from)
                   << ", \"plotArea\": " << num(ps.plotArea)
                   << ", \"footprintArea\": " << num(ps.footprintArea) << " }";
            }
            os << (p.sectors.empty() ? "]" : "\n    ]");
        }
        //  THE ROADS (DEV.md 4c C90): the network line, one line per road
        //  (its centre line and length), one per crossing under the rack and
        //  one per placed item (the nearest road a gate reaches).  Absent
        //  without a `roads {}` declaration, so every other layout's JSON is
        //  unchanged.  The golden `layout` kind pins each road's `length`, the
        //  network's `length` and `pavedArea`, and each access `distance`.
        if (L.roads.present)
        {
            const auto& R = L.roads;
            os << ",\n    \"roadNetwork\": { \"id\": \"roadNetwork\""
               << ", \"headroom\": " << num(R.headroom)
               << ", \"accessDistance\": " << num(R.accessDistance)
               << ", \"noTraffic\": [";
            for (std::size_t i = 0; i < R.noTraffic.size(); ++i)
                os << (i ? ", " : "") << R.noTraffic[i];
            os << "], \"entrances\": [";
            for (std::size_t i = 0; i < R.entrances.size(); ++i)
                os << (i ? ", " : "") << esc(R.entrances[i]);
            os << "], \"roads\": " << R.roads.size()
               << ", \"components\": " << R.components
               << ", \"length\": " << num(R.length)
               << ", \"pavedArea\": " << num(R.pavedArea)
               << ", \"source\": " << esc(R.source)
               << ", \"reason\": " << esc(R.reason)
               << ", \"accessSource\": " << esc(R.accessSource)
               << ", \"accessReason\": " << esc(R.accessReason) << " }";
            os << ",\n    \"roads\": [";
            for (std::size_t i = 0; i < R.roads.size(); ++i)
            {
                const auto& rd = R.roads[i];
                os << (i ? ",\n" : "\n") << "      { \"id\": " << esc("road:" + rd.id)
                   << ", \"road\": " << esc(rd.id)
                   << ", \"width\": " << num(rd.width)
                   << ", \"length\": " << num(rd.length)
                   << ", \"component\": " << rd.component
                   << ", \"fromEntrance\": " << (rd.fromEntrance ? "true" : "false")
                   << ", \"cornerRadius\": " << num(rd.cornerRadius)
                   << ", \"cornerRadiusDeclared\": " << (rd.cornerRadiusDeclared ? "true" : "false")
                   << ", \"oneWay\": " << (rd.oneWay ? "true" : "false")
                   << ", \"reason\": " << esc(rd.reason)
                   << ", \"centreline\": [";
                for (std::size_t q = 0; q < rd.centreline.size(); ++q)
                    os << (q ? ", " : "") << "[" << num(rd.centreline[q][0]) << ", "
                       << num(rd.centreline[q][1]) << "]";
                os << "] }";
            }
            os << (R.roads.empty() ? "]" : "\n    ]") << ",\n    \"rackCrossings\": [";
            for (std::size_t i = 0; i < R.rackCrossings.size(); ++i)
            {
                const auto& c = R.rackCrossings[i];
                os << (i ? ",\n" : "\n") << "      { \"id\": "
                   << esc("rackCrossing:" + c.road + ":" + std::to_string(i))
                   << ", \"road\": " << esc(c.road)
                   << ", \"xMin\": " << num(c.xMin) << ", \"xMax\": " << num(c.xMax)
                   << ", \"yMin\": " << num(c.yMin) << ", \"yMax\": " << num(c.yMax)
                   << ", \"clearance\": " << num(c.clearance) << " }";
            }
            os << (R.rackCrossings.empty() ? "]" : "\n    ]") << ",\n    \"access\": [";
            for (std::size_t i = 0; i < R.access.size(); ++i)
            {
                const auto& a = R.access[i];
                os << (i ? ",\n" : "\n") << "      { \"id\": " << esc("access:" + a.item)
                   << ", \"item\": " << esc(a.item)
                   << ", \"road\": " << esc(a.road);
                if (!a.road.empty())
                    os << ", \"distance\": " << num(a.distance)
                       << ", \"roadX\": " << num(a.x) << ", \"roadY\": " << num(a.y)
                       << ", \"onDeck\": " << (a.onDeck ? "true" : "false");
                os << " }";
            }
            os << (R.access.empty() ? "]" : "\n    ]");
            //  THE TRUCKS (DEV.md 4c C96): the design vehicle, the turning
            //  areas, one line per truck route (its path and length, its
            //  verdict WORD) and one per corner it turns (the declared radius,
            //  the outer radius the pavement gives, the one the vehicle
            //  needs).  Absent keys without the declarations, so a roads block
            //  that declares none keeps its JSON.  The golden `layout` kind
            //  pins each route's `length` and `verdict`, each corner's
            //  position, `radius` and `turn`.
            if (R.designVehicle.present)
                os << ",\n    \"designVehicle\": { \"id\": \"designVehicle\""
                   << ", \"turningDiameter\": " << num(R.designVehicle.turningDiameter)
                   << ", \"source\": " << esc(R.designVehicle.source)
                   << ", \"reason\": " << esc(R.designVehicle.reason)
                   << ", \"rule\": " << esc(R.designVehicle.routeRule) << " }";
            if (!R.turningAreas.empty())
            {
                os << ",\n    \"turningAreas\": [";
                for (std::size_t i = 0; i < R.turningAreas.size(); ++i)
                {
                    const auto& ta = R.turningAreas[i];
                    os << (i ? ",\n" : "\n") << "      { \"id\": " << esc("turningArea:" + ta.id)
                       << ", \"area\": " << esc(ta.id)
                       << ", \"x\": " << num(ta.x) << ", \"y\": " << num(ta.y)
                       << ", \"diameter\": " << num(ta.diameter)
                       << ", \"reason\": " << esc(ta.reason) << " }";
                }
                os << "\n    ]";
            }
            if (!R.truckRoutes.empty())
            {
                os << ",\n    \"truckRoutes\": [";
                for (std::size_t i = 0; i < R.truckRoutes.size(); ++i)
                {
                    const auto& T = R.truckRoutes[i];
                    os << (i ? ",\n" : "\n") << "      { \"id\": " << esc("truckRoute:" + T.id)
                       << ", \"route\": " << esc(T.id)
                       << ", \"from\": " << esc(T.from) << ", \"to\": " << esc(T.to)
                       << ", \"verdict\": " << esc(T.verdict)
                       << ", \"length\": " << num(T.length)
                       << ", \"turns\": " << T.corners.size()
                       << ", \"reversals\": " << T.reversals
                       << ", \"weighbridge\": " << esc(T.weighbridge)
                       << ", \"reason\": " << esc(T.reason) << ", \"roads\": [";
                    for (std::size_t q = 0; q < T.roads.size(); ++q)
                        os << (q ? ", " : "") << esc(T.roads[q]);
                    os << "], \"serves\": [";
                    for (std::size_t q = 0; q < T.serves.size(); ++q)
                        os << (q ? ", " : "") << esc(T.serves[q]);
                    os << "], \"path\": [";
                    for (std::size_t q = 0; q < T.path.size(); ++q)
                        os << (q ? ", " : "") << "[" << num(T.path[q][0]) << ", "
                           << num(T.path[q][1]) << "]";
                    os << "] }";
                }
                os << "\n    ],\n    \"routeCorners\": [";
                bool first = true;
                for (const auto& T : R.truckRoutes)
                    for (std::size_t k = 0; k < T.corners.size(); ++k)
                    {
                        const auto& c = T.corners[k];
                        os << (first ? "\n" : ",\n") << "      { \"id\": "
                           << esc("routeCorner:" + T.id + ":" + std::to_string(k))
                           << ", \"route\": " << esc(T.id)
                           << ", \"turn\": " << esc(c.turn)
                           << ", \"inRoad\": " << esc(c.inRoad)
                           << ", \"outRoad\": " << esc(c.outRoad)
                           << ", \"x\": " << num(c.x) << ", \"y\": " << num(c.y)
                           << ", \"radius\": " << num(c.radius)
                           << ", \"outerRadius\": " << num(c.outerRadius)
                           << ", \"required\": " << num(c.required)
                           << ", \"turningArea\": " << esc(c.turningArea)
                           << ", \"ok\": " << (c.ok ? "true" : "false") << " }";
                        first = false;
                    }
                os << (first ? "]" : "\n    ]");
            }
        }
        //  THE FENCE (DEV.md 4c C93): its line (drawn from the plot), one
        //  line per gate opening and one per pipe crossing.  Absent without a
        //  `fence {}` declaration, so every other layout's JSON is unchanged.
        //  The golden `layout` kind pins the fence's `length`, each
        //  opening's and each crossing's position and each one's `side`
        //  word; the label is the case's own sentence, echoed, not pinned.
        if (L.fence.present)
        {
            const auto& F = L.fence;
            os << ",\n    \"fence\": { \"id\": \"fence\""
               << ", \"inset\": " << num(F.inset)
               << ", \"insetDeclared\": " << (F.insetDeclared ? "true" : "false")
               << ", \"xMin\": " << num(F.xMin) << ", \"xMax\": " << num(F.xMax)
               << ", \"yMin\": " << num(F.yMin) << ", \"yMax\": " << num(F.yMax)
               << ", \"length\": " << num(F.length)
               << ", \"source\": " << esc(F.source)
               << ", \"reason\": " << esc(F.reason)
               << ", \"rule\": " << esc(F.rule) << " }";
            os << ",\n    \"fenceOpenings\": [";
            for (std::size_t i = 0; i < F.openings.size(); ++i)
            {
                const auto& o = F.openings[i];
                os << (i ? ",\n" : "\n") << "      { \"id\": " << esc("fenceOpening:" + o.gate)
                   << ", \"gate\": " << esc(o.gate) << ", \"side\": " << esc(o.side)
                   << ", \"x\": " << num(o.x) << ", \"y\": " << num(o.y)
                   << ", \"width\": " << num(o.width)
                   << ", \"road\": " << esc(o.road)
                   << ", \"gateDistance\": " << num(o.gateDistance)
                   << ", \"approachX\": " << num(o.approachX)
                   << ", \"approachY\": " << num(o.approachY)
                   << ", \"approach\": " << num(o.approach) << " }";
            }
            os << (F.openings.empty() ? "]" : "\n    ]") << ",\n    \"fenceCrossings\": [";
            for (std::size_t i = 0; i < F.crossings.size(); ++i)
            {
                const auto& c = F.crossings[i];
                os << (i ? ",\n" : "\n") << "      { \"id\": " << esc("fenceCrossing:" + c.stream)
                   << ", \"stream\": " << esc(c.stream)
                   << ", \"direction\": " << esc(c.direction)
                   << ", \"side\": " << esc(c.side)
                   << ", \"x\": " << num(c.x) << ", \"y\": " << num(c.y)
                   << ", \"z\": " << num(c.z)
                   << ", \"positionFrom\": " << esc(c.positionFrom)
                   << ", \"labelDeclared\": " << (c.labelDeclared ? "true" : "false")
                   << ", \"label\": " << esc(c.label) << " }";
            }
            os << (F.crossings.empty() ? "]" : "\n    ]");
        }
        //  THE CAR PARKS (DEV.md 4c C96): one line per car park -- the
        //  declared count, what the footprint holds by the rule, the area, and
        //  every bay as [x, y, ux, uy] (its centre and the way a car leaves
        //  it), an ARRAY so the golden reads no number there.  Absent when no
        //  car park is placed.  Pinned: `bays`, `capacity`, `area`.
        if (!L.carParks.empty())
        {
            os << ",\n    \"carParks\": [";
            for (std::size_t i = 0; i < L.carParks.size(); ++i)
            {
                const auto& c = L.carParks[i];
                os << (i ? ",\n" : "\n") << "      { \"id\": " << esc("carPark:" + c.item)
                   << ", \"item\": " << esc(c.item)
                   << ", \"bays\": " << c.bays
                   << ", \"capacity\": " << c.capacity
                   << ", \"rows\": " << c.rows << ", \"perRow\": " << c.perRow
                   << ", \"bayWidth\": " << num(c.bayWidth)
                   << ", \"bayLength\": " << num(c.bayLength)
                   << ", \"aisle\": " << num(c.aisle)
                   << ", \"angle\": " << num(c.angleDeg)
                   << ", \"arrangement\": " << esc(c.arrangement)
                   << ", \"entry\": " << esc(c.entry)
                   << ", \"exitsForward\": " << (c.exitsForward ? "true" : "false")
                   << ", \"depth\": " << num(c.depth) << ", \"pitch\": " << num(c.pitch)
                   << ", \"usableLength\": " << num(c.usableLength)
                   << ", \"area\": " << num(c.area)
                   << ", \"source\": " << esc(c.source)
                   << ", \"reason\": " << esc(c.reason) << ", \"stalls\": [";
                for (std::size_t q = 0; q < c.stalls.size(); ++q)
                    os << (q ? ", " : "") << "[" << num(c.stalls[q][0]) << ", "
                       << num(c.stalls[q][1]) << ", " << num(c.stalls[q][2]) << ", "
                       << num(c.stalls[q][3]) << "]";
                os << "] }";
            }
            os << "\n    ]";
        }
        os << ",\n    \"summary\": { \"id\": \"summary\", \"placed\": "
           << L.items.size() << ", \"unplaced\": " << L.unplaced.size()
           << ", \"internal\": " << L.internal.size()
           << ", \"findings\": " << L.findings.size()
           << ", \"pipes\": " << L.pipes.size()
           << ", \"notRouted\": " << L.notRouted.size()
           << ", \"pipeLength\": " << num(pipeLength) << " }\n  }";
    }

    os << "\n}\n";
    os << "<<<Choupo:result-end>>>\n";
}

} // namespace Choupo

namespace Choupo
{
std::string jsonEscape(const std::string& s) { return esc(s); }

std::string advisoriesJson(const std::vector<Advisory>& advs)
{
    if (advs.empty()) return "";
    std::string out = ",\n  \"advisories\": [";
    for (std::size_t i = 0; i < advs.size(); ++i)
        out += std::string(i ? ",\n" : "\n")
             + "    { \"category\": " + esc(advs[i].category)
             + ", \"severity\": " + esc(advs[i].severity)
             + ", \"locus\": " + esc(advs[i].locus)
             + ", \"message\": " + esc(advs[i].message)
             //  WHICH STATE this is about -- see core/Advisory.H.  `status`
             //  is always written (a reader must never have to infer
             //  "accepted" from a missing key); `where` only when a solver
             //  named its frame.
             + ", \"status\": " + esc(advs[i].status)
             + (advs[i].where.empty()
                    ? std::string()
                    : ", \"where\": " + esc(advs[i].where))
             + " }";
    out += "\n  ]";
    return out;
}
}
