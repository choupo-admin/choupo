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

#include "ScalingScan.H"

#include "Speciate.H"   // propertyOps::readAnalysis / readEquilibrate
#include "core/Dimensions.H"
#include "thermo/electrolyte/ScalingIndices.H"
#include "thermo/electrolyte/SpeciationSolver.H"

#include <algorithm>
#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <stdexcept>
#include <vector>

namespace Choupo {

int ScalingScan::run(const DictPtr& dict, const ThermoPackage& /*thermo*/, int verbosity)
{
    // Manipulator hygiene: restore the caller's cout state on every exit (the
    // structured JSON emitter downstream must not inherit our formatting).
    struct CoutGuard
    {
        std::ios state{nullptr};
        CoutGuard()  { state.copyfmt(std::cout); }
        ~CoutGuard() { std::cout.copyfmt(state); }
    } coutGuard;

    diag_.clear();
    auto feed = propertyOps::readAnalysis(dict);
    propertyOps::readEquilibrate(dict, feed);   // optional equilibrate { minerals ( ... ); }
    if (feed.totals.empty())
        throw std::runtime_error("scalingScan: `totals` is empty -- a scaling "
            "scan needs a water analysis to concentrate");
    const bool doEquil = !feed.equilibrate.empty();

    // feedFlow [volumetric] -> enables the kg/day scale curve.  REFUSED without
    // equilibrate{} -- a SI-only scan has no precipitated amount to rate, so a
    // bare feedFlow would be a dead key (no dead keys).
    double feedFlow_m3s = 0.0;   // 0 = not given
    if (dict->found("feedFlow"))
    {
        if (!doEquil)
            throw std::runtime_error("scalingScan: `feedFlow` is set but there "
                "is no `equilibrate { minerals ( ... ); }` block -- feedFlow only "
                "feeds the kg/day precipitation rate, which a SI-only scan does "
                "not compute.  Add an equilibrate block, or drop feedFlow.");
        if (!dict->hasDimensions("feedFlow"))
            throw std::runtime_error("scalingScan: feedFlow needs a volumetric "
                "unit: feedFlow 12.6 m3/h | 0.05 m3/s | 300 m3/d ...  Bare "
                "numbers are refused.");
        if (!(dict->dimensionsOf("feedFlow") == Dims::volumetricFlow))
            throw std::runtime_error("scalingScan: feedFlow declared unit is "
                + dict->dimensionsOf("feedFlow").toPretty()
                + ", expected a VOLUMETRIC FLOW (m3/h | m3/s | m3/d)");
        feedFlow_m3s = dict->lookupScalar("feedFlow");   // canonical m^3/s
    }

    // -- recovery grid -----------------------------------------------------------
    scalar rFrom = 0.0, rTo = 0.9;
    std::size_t nPts = 10;
    if (dict->found("recovery"))
    {
        auto rd = dict->subDict("recovery");
        rFrom = rd->lookupScalarOrDefault("from", rFrom);
        rTo   = rd->lookupScalarOrDefault("to",   rTo);
        if (rd->found("n")) nPts = std::max<std::size_t>(2, static_cast<std::size_t>(rd->lookupScalar("n")));
    }
    if (rFrom < 0.0 || rTo <= rFrom || rTo >= 1.0)
        throw std::runtime_error("scalingScan: recovery must satisfy "
            "0 <= from < to < 1 (totals scale as feed/(1-r))");

    // -- the honest scan header --------------------------------------------------
    if (verbosity >= 2)
    {
        std::cout << "scalingScan: concentrate totals = feed/(1-r), r = "
                  << rFrom << "-" << rTo << " (" << nPts << " pts) -- PURE water "
                     "removal;\n";
        if (feed.solvePH)
        {
            std::cout << "  pH SOLVED from electroneutrality at every point -- ";
            if (feed.openCO2)
                std::cout << "OPEN to CO2(g) at pCO2 = " << std::scientific
                          << std::setprecision(3) << feed.pCO2
                          << " atm\n  (DIC set by gas-liquid equilibrium per "
                             "point -- degassing / invasion allowed)\n"
                          << std::defaultfloat;
            else
                std::cout << "CLOSED system\n  (DIC concentrates with the "
                             "water; the pH column shows the drift)\n";
        }
        else
            std::cout << "  pH HELD at " << std::fixed << std::setprecision(2)
                      << feed.pH << " across the scan ("
                      << (feed.openCO2 ? "OPEN to CO2(g) -- DIC a solved outcome"
                                       : "no CO2 degassing / alkalinity shift")
                      << ")\n" << std::defaultfloat;
        if (doEquil)
        {
            std::cout << "  EQUILIBRATE allowed:";
            for (const auto& m : feed.equilibrate) std::cout << " " << m;
            std::cout << " -- SI_<m> stays RAW free-water; new columns SIeq_<m>, "
                         "n_<m> (mol/kg concentrate water),\n  scale_<m> = "
                         "n*(1-r) (mol/kg FEED water)";
            if (feedFlow_m3s > 0.0)
                std::cout << ", kgday_<m> (feedFlow "
                          << std::scientific << std::setprecision(3)
                          << feedFlow_m3s * 3600.0 << " m3/h)" << std::defaultfloat;
            std::cout << " carry the precipitation CEILING.\n";
        }
    }

    // Optional aqueous-activity-model selection (default Davies, the only S1
    // builtin; an unknown name is refused with the available list).
    const std::string activityModel =
        dict->lookupWordOrDefault("activityModel", "davies");
    electrolyte::SpeciationSolver solver(activityModel);

    // Optional per-ion gamma columns (the MECHANISM plot): `diagSpecies ( Ca SO4
    // ... );` emits one gamma_<ion> CSV column per named species, taken from the
    // RAW free-water speciation at each point -- so the student SEES where the SI
    // divergence comes from (Davies' monotone gamma decline vs Pitzer's high-I
    // upturn).  Honest scope: only for the per-ion aqueous models (pitzer/davies),
    // since gamma_<ion> is the lesson those two tell -- refused otherwise so the
    // column is never a dead artefact.  Absence-tolerant: no diagSpecies => no
    // columns (byte-identical to a pre-feature scan).
    std::vector<std::string> gammaCols;
    if (dict->found("diagSpecies"))
    {
        if (activityModel != "pitzer" && activityModel != "davies")
            throw std::runtime_error("scalingScan: `diagSpecies` (per-ion gamma "
                "columns) is only meaningful for a per-ION activity model "
                "(activityModel pitzer | davies); the active model is '"
                + activityModel + "'");
        gammaCols = dict->lookupWordList("diagSpecies");
    }

    // Mineral availability is recovery-invariant (the species set never
    // changes); read it off the first point and freeze the CSV columns.
    std::vector<std::string> siCols;          // RAW free-water SI (unchanged)
    std::vector<std::string> eqCols;          // ALLOWED minerals (equilibrated)
    if (doEquil) eqCols = feed.equilibrate;

    // Industry calcite indices (LSI / Stiff-Davis / Ryznar) ride alongside the
    // rigorous SI_calcite when calcite is in the catalogue and the analysis
    // carries Ca + HCO3.  EMPIRICAL, concentration-based -- the deliberate
    // contrast to the activity SI (see thermo/electrolyte/ScalingIndices); the
    // divergence at high I is the lesson.  Frozen off the catalogue/totals (set
    // at k == 0 below); columns LSI, StiffDavis, RSI appended after the SI_<m>.
    bool   doIndices = false;
    double logK_calcite_T = 0.0;
    const bool hasCaHCO3 = feed.totals.count("Ca") && feed.totals.count("HCO3");

    std::ofstream csv(dict->subDict("output")->lookupWord("file"));
    if (!csv.is_open())
        throw std::runtime_error("scalingScan: cannot open output file");

    const scalar dr = (rTo - rFrom) / static_cast<scalar>(nPts - 1);
    bool daviesExceeded = false;
    scalar rExceed = 1.0, lastI = 0.0;
    // onset tracking: the first r where each allowed mineral begins to precipitate
    std::map<std::string, scalar> rOnset;
    // SI = 0 crossing tracking (the engineering "onset of scaling" recovery): the
    // recovery at which the RAW free-water SI of each catalogue mineral first
    // crosses zero (undersaturated -> supersaturated).  Linearly interpolated
    // between the bracketing grid points so it does not snap to the grid.  This is
    // the number the Davies-vs-Pitzer comparison hinges on (recovery_at_<m>_onset)
    // -- distinct from the precipitation onset above (which needs equilibrate{}).
    std::map<std::string, scalar> prevSI, prevR, siOnset;
    for (std::size_t k = 0; k < nPts; ++k)
    {
        const scalar r = rFrom + dr * static_cast<scalar>(k);

        // RAW free-water speciation (NO equilibrate) -- keeps SI_<m> columns
        // their original meaning, byte-compatible with pre-feature scans.
        electrolyte::SpeciationInput inRaw = feed;
        inRaw.equilibrate.clear();
        for (auto& [name, tot] : inRaw.totals) tot = tot / (1.0 - r);
        const auto raw = solver.solve(inRaw, k == 0 ? verbosity : std::min(verbosity, 1));

        // EQUILIBRATED speciation (precipitation to SI = 0) -- only when asked.
        electrolyte::SpeciationResult eq;
        if (doEquil)
        {
            electrolyte::SpeciationInput inEq = feed;
            for (auto& [name, tot] : inEq.totals) tot = tot / (1.0 - r);
            eq = solver.solve(inEq, k == 0 ? std::min(verbosity, 2) : 0);
        }

        if (k == 0)
        {
            for (const auto& m : solver.minerals())          // catalogue order
                if (raw.SI.count(m.mineral)) siCols.push_back(m.mineral);
            if (siCols.empty())
                throw std::runtime_error("scalingScan: no mineral SI available "
                    "for this analysis (check minerals.dat ions vs the totals)");
            // Industry-index decision: calcite catalogued + Ca/HCO3 present.
            bool hasCalcite = false;
            for (const auto& m : siCols) if (m == "calcite") hasCalcite = true;
            if (hasCalcite && hasCaHCO3)
            {
                bool hasCc = false;
                logK_calcite_T = solver.mineralLogK_T("calcite", feed.T, hasCc);
                doIndices = hasCc;
                if (doIndices && verbosity >= 2)
                    std::cout << "  [indices] LSI / Stiff-Davis / Ryznar columns "
                                 "ON -- EMPIRICAL concentration-based calcite "
                                 "indices;\n  [indices] compare to the rigorous "
                                 "activity SI_calcite -- they DIVERGE at high I "
                                 "(Stiff-Davis K is a CHART FIT, announced).  "
                                 "Concentrations approximated by molality "
                                 "(dilute mol/L ~ mol/kg).\n";
            }
            csv << "recovery,I,pH";
            for (const auto& m : siCols) csv << ",SI_" << m;
            if (doIndices) csv << ",LSI,StiffDavis,RSI";
            for (const auto& g : gammaCols) csv << ",gamma_" << g;
            if (doEquil)
                for (const auto& m : eqCols)
                {
                    csv << ",SIeq_" << m << ",n_" << m << ",scale_" << m;
                    if (feedFlow_m3s > 0.0) csv << ",kgday_" << m;
                }
            csv << "\n" << std::scientific << std::setprecision(8);
        }

        csv << r << "," << raw.I << "," << raw.pH;
        for (const auto& m : siCols) csv << "," << raw.SI.at(m);
        if (doIndices)
        {
            // Concentration proxy = concentrated molality [mol/kg] ~ mol/L
            // (dilute aqueous; honest approximation announced in the header).
            const double cCa   = inRaw.totals.at("Ca");
            const double cHCO3 = inRaw.totals.at("HCO3");
            const auto ix = electrolyte::ScalingIndices::compute(
                raw.pH, cCa, cHCO3, raw.I, feed.T, logK_calcite_T);
            csv << "," << ix.LSI << "," << ix.stiffDavis << "," << ix.RSI;
            if (k == 0 || k + 1 == nPts)
            {
                const std::string suf = (k == 0) ? "_r0" : "_rmax";
                diag_["LSI" + suf]        = ix.LSI;
                diag_["StiffDavis" + suf] = ix.stiffDavis;
                diag_["RSI" + suf]        = ix.RSI;
                // The headline contrast number: empirical LSI minus rigorous SI.
                diag_["LSI_minus_SIcalcite" + suf] = ix.LSI - raw.SI.at("calcite");
            }
        }
        for (const auto& g : gammaCols)
        {
            const auto* row = raw.find(g);
            if (!row)
                throw std::runtime_error("scalingScan: diagSpecies '" + g
                    + "' is not a species in this analysis (check the totals / "
                      "ions.dat name)");
            csv << "," << row->gamma;
        }
        // SI = 0 crossing (the scaling-onset recovery), per RAW catalogue mineral:
        // linearly interpolate the recovery where SI first goes from < 0 to >= 0.
        for (const auto& m : siCols)
        {
            const scalar si = raw.SI.at(m);
            if (prevSI.count(m) && !siOnset.count(m)
                && prevSI.at(m) < 0.0 && si >= 0.0)
            {
                const scalar s0 = prevSI.at(m), r0 = prevR.at(m);
                siOnset[m] = r0 + (r - r0) * (0.0 - s0) / (si - s0);
                if (verbosity >= 2)
                    std::cout << "  [onset] " << m << " SI crosses 0 (scaling "
                                 "begins) at r = " << std::fixed
                              << std::setprecision(3) << siOnset.at(m)
                              << std::defaultfloat << "\n";
            }
            prevSI[m] = si; prevR[m] = r;
        }
        if (doEquil)
            for (const auto& m : eqCols)
            {
                const scalar np    = eq.precipitated.count(m) ? eq.precipitated.at(m) : 0.0;
                const scalar siEq  = eq.SI.count(m) ? eq.SI.at(m) : 0.0;
                const scalar scale = np * (1.0 - r);   // mol/kg FEED water
                csv << "," << siEq << "," << np << "," << scale;
                if (feedFlow_m3s > 0.0)
                {
                    // kg/day mineral = scale [mol/kg feed] * feedFlow [kg feed/day] * MW [g/mol] / 1000
                    const scalar kgFeedDay = feedFlow_m3s * 1000.0 * 86400.0;  // ~1 kg/L
                    const scalar kgday = scale * kgFeedDay * solver.mineralMW(m) / 1.0e3;
                    csv << "," << kgday;
                }
                // onset: first point with non-zero precipitation
                if (np > 0.0 && !rOnset.count(m))
                {
                    rOnset[m] = r;
                    if (verbosity >= 2)
                        std::cout << "  [onset] " << m << " begins to precipitate "
                                     "at r = " << std::fixed << std::setprecision(2)
                                  << r << std::defaultfloat << "\n";
                }
            }
        csv << "\n";

        if (raw.daviesExceeded && !daviesExceeded)
        { daviesExceeded = true; rExceed = r; }
        lastI = raw.I;

        if (k == 0 || k + 1 == nPts)                          // pin the end points
        {
            const std::string suf = (k == 0) ? "_r0" : "_rmax";
            diag_["I" + suf]  = raw.I;
            diag_["pH" + suf] = raw.pH;   // RAW free-water pH (unchanged)
            for (const auto& m : siCols) diag_["SI_" + m + suf] = raw.SI.at(m);
        }
        if (doEquil && k + 1 == nPts)     // endpoint precipitation diagnostics
        {
            for (const auto& m : eqCols)
            {
                const scalar np = eq.precipitated.count(m) ? eq.precipitated.at(m) : 0.0;
                diag_["n_" + m + "_rmax"]     = np;
                diag_["scale_" + m + "_rmax"] = np * (1.0 - rTo);
                if (feedFlow_m3s > 0.0)
                {
                    const scalar kgFeedDay = feedFlow_m3s * 1000.0 * 86400.0;
                    diag_["kgday_" + m + "_rmax"] =
                        np * (1.0 - rTo) * kgFeedDay * solver.mineralMW(m) / 1.0e3;
                }
            }
            diag_["pHeq_rmax"] = eq.pH;   // equilibrated pH at the endpoint
        }
    }
    // r_onset diagnostics (one per allowed mineral that ever precipitated)
    if (doEquil)
        for (const auto& m : eqCols)
            if (rOnset.count(m)) diag_["r_onset_" + m] = rOnset.at(m);
    // SI = 0 crossing recovery (the scaling-onset KPI -- the number the
    // Davies-vs-Pitzer comparison hinges on).  One per catalogue mineral whose
    // RAW SI crossed zero within the scanned range.
    for (const auto& m : siCols)
        if (siOnset.count(m)) diag_["recovery_at_" + m + "_onset"] = siOnset.at(m);

    if (daviesExceeded && verbosity >= 1)
        std::cout << "  [advisory] Davies beyond its ~0.5 mol/kg trust range "
                     "from r = " << std::fixed << std::setprecision(2) << rExceed
                  << " (I = " << std::setprecision(3) << lastI
                  << " mol/kg at r = " << std::setprecision(2) << rTo
                  << ") -- SI there is INDICATIVE\n" << std::defaultfloat;

    if (verbosity >= 2)
    {
        std::cout << "scalingScan: " << nPts << " points -> "
                  << dict->subDict("output")->lookupWord("file") << "; SI at r = "
                  << rTo << ":";
        for (const auto& m : siCols)
            std::cout << "  " << m << " " << std::showpos << std::fixed
                      << std::setprecision(3) << diag_["SI_" + m + "_rmax"]
                      << std::noshowpos;
        std::cout << std::defaultfloat << "\n";
    }
    return 0;
}

} // namespace Choupo
