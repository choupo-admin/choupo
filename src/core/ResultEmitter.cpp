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

#include "ResultEmitter.H"

#include <cmath>
#include <iomanip>
#include <sstream>

namespace Choupo {

namespace {

// JSON-escape a string.  Only the subset of escapes JSON requires; we
// never emit U+0000..001F in dict identifiers so the basic set suffices.
std::string esc(const std::string& s)
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

// Emit a number in a JSON-safe way.  NaN / Inf are not valid JSON, so
// we serialise them as null with no surprise.
std::string num(scalar v)
{
    if (!std::isfinite(v)) return "null";
    std::ostringstream os;
    os << std::setprecision(12) << v;
    return os.str();
}

} // namespace

void emitResultJson(std::ostream& os, const SimulationResult& r)
{
    const auto& names = r.componentNames;

    os << "<<<Choupo:result-begin>>>\n";
    os << "{ \"version\": 1,\n";
    os << "  \"converged\": " << (r.converged ? "true" : "false") << ",\n";

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
    os << "  \"streams\": {";
    bool firstS = true;
    const bool haveMW = !r.componentMolarMass.empty();
    for (const auto& [name, s] : r.streams)
    {
        os << (firstS ? "\n" : ",\n");
        firstS = false;
        scalar F_mass = 0.0;
        if (haveMW)
        {
            for (std::size_t i = 0; i < names.size(); ++i)
            {
                auto it = r.componentMolarMass.find(names[i]);
                if (it == r.componentMolarMass.end()) continue;
                const scalar zi = (i < s.z.size()) ? s.z[i] : 0.0;
                F_mass += zi * it->second;
            }
            F_mass *= s.F;          // kmol/s * kg/kmol = kg/s
        }
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
        os << "    " << esc(name) << ": { "
           << "\"F\": " << num(s.F)
           << ", \"T\": " << num(s.T)
           << ", \"P\": " << num(s.P)
           // vf is the fluid-phase vapour fraction set by every flash /
           // saturation unit: 0 = pure liquid, 1 = pure vapour, 0..1 =
           // two-phase.  Authoritative -- the GUI uses it directly to
           // colour edges by phase (no heuristic from T / composition).
           << ", \"vf\": " << num(s.vf);
        // Specific molar enthalpy at the ELEMENTS reference (formation
        // datum) when the thermo package can compute it.  J/mol.  Energy
        // flow rate is F * H * 1000 W; computed in the GUI on the fly.
        if (s.H_valid) os << ", \"H\": " << num(s.H);
        // Total FLOW enthalpy [kW] = F*H (fluid) + Σ s[i]*h°(solid,T) (crystals).
        // The boundary energy balance reads THIS (counts a solid product's
        // crystals), not F*H -- so the GUI plot closes on the same elements
        // datum as the report.  Absent => fall back to F*H in the GUI.
        if (s.H_flow_valid) os << ", \"H_kW\": " << num(s.H_flow_kW);
        if (haveMW) os << ", \"F_mass\": " << num(F_mass);
        os << ", \"F_solid_mass\": " << num(F_solid);
        // Utility category (populated by `utility <name>;` in a stream
        // block).  Non-empty means this is a utility stream; the GUI uses
        // it for visual differentiation (dashed grey, chama/floco icon).
        if (!s.category.empty()) os << ", \"category\": " << esc(s.category);
        os << ", \"composition\": {";
        for (std::size_t i = 0; i < names.size(); ++i)
        {
            if (i) os << ", ";
            os << esc(names[i]) << ": "
               << num(i < s.z.size() ? s.z[i] : 0.0);
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
        os << " }";
    }
    os << "\n  },\n";

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
               << ", \"allocated\": " << (a.allocated ? "true" : "false") << " }";
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

    // ---- advisories (solver "speak-up": bounds active at the solution,
    //      rating exceedances, auto-init) -- so the GUI surfaces them ----
    if (!r.advisories.empty())
    {
        os << ",\n  \"advisories\": [";
        for (std::size_t i = 0; i < r.advisories.size(); ++i)
        {
            const auto& a = r.advisories[i];
            os << (i ? ",\n" : "\n") << "    { \"category\": " << esc(a.category)
               << ", \"severity\": " << esc(a.severity)
               << ", \"locus\": " << esc(a.locus)
               << ", \"message\": " << esc(a.message) << " }";
        }
        os << "\n  ]";
    }

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
               << ", \"provSource\": " << esc(p.provSource) << " }";
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

    os << "\n}\n";
    os << "<<<Choupo:result-end>>>\n";
}

} // namespace Choupo
