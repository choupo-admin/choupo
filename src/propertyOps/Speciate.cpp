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

#include "Speciate.H"
#include "CasePackage.H"

#include "core/Units.H"                             // atm_to_Pa
#include "thermo/electrolyte/SaltFromCatalogue.H"   // ionMW (ions.dat)
#include "thermo/ThermoPackageBuilder.H"
#include "thermo/electrolyte/SpeciationSolver.H"
#include "thermo/electrolyte/PitzerHMW.H"

#include <fstream>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <variant>

namespace Choupo {

namespace propertyOps {

namespace {

// The /L-basis closure is announced ONCE per run, not once per entry --
// N identical lines teach nothing (it is the same approximation each time).
void announceRhoOnce()
{
    static bool announced = false;
    if (announced) return;
    announced = true;
    std::cout << "[units] /L bases converted at rho ~ 1 kg/L (dilute aqueous)\n";
}

// One `totals` entry -> molality [mol/kg water].  The unit is MANDATORY:
// water analyses arrive in many bases (mol/kg, mg/L, mmol/L, ...) and a
// bare number silently assumed mol/kg would violate the units law.
scalar totalAsMolality(const DictPtr& t, const std::string& ion)
{
    if (!t->hasDimensions(ion))
        throw std::runtime_error("totals." + ion + " needs a unit: "
            + ion + " 0.0021 mol/kg | 84 mg/L | 2.1 mmol/kg | 0.0021 mol/L ..."
            "  Bare numbers are refused -- a water analysis must declare its basis.");

    const Dimensions dims = t->dimensionsOf(ion);
    const scalar     v    = t->lookupScalar(ion);          // canonical SI

    // amount/mass (mol/kg, mmol/kg): the native basis.  Canonical is
    // kmol/kg, the solver speaks mol/kg.
    if (dims == Dims::molality)
        return v * 1.0e3;

    // amount/volume (mol/L, mmol/L, M): canonical kmol/m^3 = mol/L
    // numerically; to molality through the solution density ~ 1 kg/L
    // (dilute aqueous closure, announced).
    if (dims == Dims::concentration)
    {
        announceRhoOnce();
        return v;                       // mol/L -> mol/kg at rho ~ 1 kg/L
    }

    // mass/volume (mg/L, g/L, ppm): canonical kg/m^3; to moles through the
    // ion's MW (ions.dat), then the same rho ~ 1 kg/L closure.
    if (dims == Dims::density)
    {
        const double MW = electrolyte::ionMW(ion);   // g/mol = kg/kmol
        if (MW <= 0.0)
            throw std::runtime_error("totals." + ion + " is on a mass basis "
                "(mg/L | g/L) but the '" + ion + "' row in ions.dat has no MW"
                " -- add `MW <g/mol>;` to the ion entry, or give the total in"
                " mol/kg");
        announceRhoOnce();
        return v / MW;                  // kg/m^3 / (kg/kmol) = mol/L -> mol/kg
    }

    // Anything else (mole/mass FRACTION, a flow, ...) -- refuse loudly.
    throw std::runtime_error("totals." + ion + ": unsupported basis "
        + dims.toPretty() + ".  v1 accepts amount/mass (mol/kg, mmol/kg), "
        "amount/volume (mol/L, mmol/L, M) and mass/volume (mg/L, g/L, ppm); "
        "mole/mass-fraction and meq/L bases are planned -- convert to a "
        "supported basis for now.");
}

} // anonymous namespace

// Shared by speciate / scalingScan: read the water analysis off the op dict.
// `totals` is optional (absent or empty = pure water -- the Kw pin case);
// each entry MUST carry a unit and is converted to molality [mol/kg water]
// by totalAsMolality above.  pH is REQUIRED: a number (given) or the word
// `solve` (H+ joins the unknowns, electroneutrality closes the system).
// Optional `atmosphere { pCO2 <value> <unit>; O2 <value> <unit>; ... }` =
// OPEN system: each listed gas pins its dissolved species by Henry and the
// pinned family's total becomes a solved outcome (`pCO2` = legacy `CO2`).
electrolyte::SpeciationInput readAnalysis(const DictPtr& dict)
{
    electrolyte::SpeciationInput in;
    // `analyticalTotals` (roadmap Phase B) is the mode for waters measured directly
    // in ions/masters; `totals` is its accepted alias (legacy + brevity).
    for (const char* key : {"totals", "analyticalTotals"})
        if (dict->found(key))
        {
            auto t = dict->subDict(key);
            for (const auto& k : t->keys())
                in.totals[k] = totalAsMolality(t, k);
        }

    // COMPOSITION (roadmap Phase B): the analysis given as FORMULA-UNIT SALTS
    // (component basis), each
    // expanded to ion totals through its component.speciesMap (loaded with the
    // Phase-A case overlay).  Electroneutrality is VALIDATED (Sum nu*charge = 0),
    // so a formulated-salts input can never silently unbalance charge.  Coexists
    // with (accumulates onto) `totals`; gives the SAME ion totals as writing them
    // by hand.
    if (dict->found("composition"))
    {
        namespace fs = std::filesystem;
        const fs::path croot = fs::path(Database::currentRoot()) / "standards";
        auto comp = dict->subDict("composition");
        for (const auto& salt : comp->keys())
        {
            const scalar m = totalAsMolality(comp, salt);
            const fs::path sp = croot / "components" / (salt + ".dat");
            if (!fs::exists(sp))
                throw std::runtime_error("composition." + salt + ": no components/"
                    + salt + ".dat for the apparent->ions expansion.");
            auto rec = Database::applyCaseOverlay(
                salt, Dictionary::fromFile(sp.string()), sp.string()).dict;
            // Prefer the unified component.speciesMap; accept the legacy
            // top-level dissociatesTo as the ion map (so a not-yet-migrated salt
            // still expands under composition{}).
            DictPtr sm;
            if (rec->found("component")
                && rec->subDict("component")->found("speciesMap"))
                sm = rec->subDict("component")->subDict("speciesMap");
            else if (rec->found("dissociatesTo"))
                sm = rec->subDict("dissociatesTo");
            else
                throw std::runtime_error("composition." + salt + ": components/"
                    + salt + ".dat has no component.speciesMap nor dissociatesTo.");
            scalar netCharge = 0.0;
            for (const auto& ion : sm->keys())
            {
                const scalar nu = sm->lookupScalar(ion);
                auto iRec = electrolyte::findIon(ion);
                if (!iRec)
                    throw std::runtime_error("composition." + salt + ": ion '" + ion
                        + "' not found in species/aqueous (needed for the charge balance).");
                netCharge += nu * iRec->lookupScalar("z");
                in.totals[ion] += m * nu;
            }
            if (std::fabs(netCharge) > 1e-9)
                throw std::runtime_error("composition." + salt + ": speciesMap is NOT "
                    "electroneutral (Sum nu*charge = " + std::to_string(netCharge)
                    + ") -- fix components/" + salt + ".dat.");
        }
    }

    // pH: `pH 7.8;` (given) or `pH solve;` (charge-balance closure)
    const EntryValue& pH = dict->entryValue("pH");
    if (std::holds_alternative<std::string>(pH))
    {
        const auto& w = std::get<std::string>(pH);
        if (w != "solve")
            throw std::runtime_error("pH must be a number (given) or the word "
                "`solve` (H+ solved from electroneutrality) -- got '" + w + "'");
        in.solvePH = true;
    }
    else
        in.pH = dict->lookupScalar("pH");

    // atmosphere: OPEN system.  EVERY key is a gas the solution equilibrates
    // with -- `CO2 4.2e-4 atm; O2 0.2095 atm; ...` (any gas the gasLiquid
    // catalogue carries); `pCO2` stays as the legacy spelling of `CO2`.  The
    // unit is MANDATORY (atm / bar / Pa -- any declared pressure unit); K_H
    // speaks per-atm, so convert.
    if (dict->found("atmosphere"))
    {
        auto atm = dict->subDict("atmosphere");
        for (const auto& key : atm->keys())
        {
            const std::string gas = (key == "pCO2") ? "CO2" : key;
            if (!atm->hasDimensions(key))
                throw std::runtime_error("atmosphere." + key + " needs a "
                    "pressure unit: " + key + " 4.2e-4 atm | 4.26e-4 bar | "
                    "42.6 Pa ...  Bare numbers are refused -- a partial "
                    "pressure must declare its basis.");
            const Dimensions dims = atm->dimensionsOf(key);
            if (!(dims == Dims::pressure))
                throw std::runtime_error("atmosphere." + key + ": declared "
                    "unit is " + dims.toPretty()
                    + ", expected a PRESSURE (atm | bar | Pa)");
            in.atmosphere.emplace_back(
                gas, atm->lookupScalar(key) / units::atm_to_Pa);  // Pa -> atm
        }
        if (in.atmosphere.empty())
            throw std::runtime_error("atmosphere{}: empty -- list at least "
                "one gas partial pressure (e.g. pCO2 4.2e-4 atm;)");
    }

    in.T  = dict->lookupScalarOrDefault("temperature", 298.15);
    return in;
}

// Read the optional `equilibrate { minerals ( ... ); }` block -- a SEPARATE
// reader (readAnalysis stays untouched).  Absent = empty allowed set (today's
// behaviour).  `minerals` is REQUIRED inside the block; unknown keys are refused
// naming the v1 grammar (seed{}/targetSI{} are reserved slots, not implemented).
void readEquilibrate(const DictPtr& dict, electrolyte::SpeciationInput& in)
{
    if (!dict->found("equilibrate")) return;          // absent: SI-only, as today
    auto eq = dict->subDict("equilibrate");
    for (const auto& k : eq->keys())
        if (k != "minerals")
            throw std::runtime_error("equilibrate{}: unknown key '" + k
                + "'.  v1 grammar accepts only `minerals ( ... );`.  "
                "(seed{} and targetSI{} are reserved for a future version and "
                "are NOT implemented.)");
    if (!eq->found("minerals"))
        throw std::runtime_error("equilibrate{}: needs `minerals ( calcite "
            "gypsum ... );` -- the allowed solid set that may precipitate to "
            "its SI = 0 ceiling");
    in.equilibrate = eq->lookupWordList("minerals");
    if (in.equilibrate.empty())
        throw std::runtime_error("equilibrate{}: the minerals list is empty -- "
            "name at least one allowed solid, or drop the block for SI-only");
}

} // namespace propertyOps


int Speciate::run(const DictPtr& dict, const ThermoPackage& /*thermo*/, int verbosity)
{
    diag_.clear();
    // PACKAGE (roadmap Phase B): the case's OFFICIAL dictionary, constant/propertyDict,
    // when it declares propertyMethods.aqueousActivity, IS the electrolyte
    // propertyPackage -- it fixes the activity method + input basis, and the op then
    // carries only the ANALYSIS.  A flat/degenerate thermoPackage (or none) -> the
    // legacy per-op `activityModel` form (backward compatible).
    // The case's aqueous surface (aqueousProperties, read NATIVELY from the
    // authored v2 grammar -- wave F): it fixes the gamma model; the op's own
    // `activityModel` WINS (the model-CONTRAST mechanism: davies vs pitzerHMW
    // on ONE feed).  Solvent: the speciation stack computes on the WATER
    // surface (molality basis, SolventProperties, Debye-Hueckel A(T)) -- a
    // declared non-water solvent refuses loudly (a NAMED gap, never a silent
    // substitution).
    const propertyOps::AqueousSurface surface = propertyOps::caseAqueousSurface();
    std::string model = dict->lookupWordOrDefault("activityModel", "");
    if (surface.present)
    {
        if (model.empty()) model = surface.model;
        if (!surface.solvent.empty() && surface.solvent != "water")
            throw std::runtime_error("aqueousProperties.solvent '"
                + surface.solvent
                + "': the speciation stack is aqueous-only (molality basis +"
                " water Debye-Hueckel surface) -- a " + surface.solvent
                + "-solvent speciation is a named gap, not a silent"
                " substitution.  Declare `solvent water;` or remove the key.");
    }

    if (model.empty()) model = "davies";   // no package, no op override -> S1 default

    auto in = propertyOps::readAnalysis(dict);
    propertyOps::readEquilibrate(dict, in);

    // verifyGlobal (Codex seal-audit 2026-07-18): the FULL-catalogue Pitzer
    // single-salt oracle -- every binary in the pairs home vs the closed
    // PitzerSingleSalt kernel.  Declared by the DEDICATED validation case
    // only (its seal deliberately carries the whole family); a normal run's
    // oracle covers just its own ions inside solve().
    if (dict->lookupWordOrDefault("verifyGlobal", "false") == "true")
    {
        const double dev = electrolyte::PitzerHMW::verify(verbosity);
        if (!(dev < 1.0e-9))
            throw std::runtime_error("speciate verifyGlobal: PitzerHMW"
                " full-catalogue self-check FAILED (max rel deviation "
                + std::to_string(dev) + " > 1e-9)");
        if (verbosity >= 2)
            std::cout << "  [verifyGlobal] PitzerHMW single-salt oracle:"
                         " FULL catalogue swept, max rel dev "
                      << dev << " (< 1e-9)\n";
    }

    electrolyte::SpeciationSolver solver(model);
    const auto res = solver.solve(in, verbosity);

    // -- species table CSV ------------------------------------------------------
    std::ofstream csv(dict->subDict("output")->lookupWord("file"));
    if (!csv.is_open())
        throw std::runtime_error("speciate: cannot open output file");
    csv << "species,molality,activity,gamma\n";
    csv << std::scientific << std::setprecision(8);
    for (const auto& r : res.rows)
        csv << r.name << "," << r.molality << "," << r.activity << ","
            << r.gamma << "\n";

    // -- diagnostics (golden-master KPIs; word-char keys) ------------------------
    diag_["I"]  = res.I;
    diag_["aw"] = res.aw;
    diag_["pH"] = res.pH;     // solved (electroneutrality) or echoed (given)
    for (const auto& [mineral, si] : res.SI)
        diag_["SI_" + mineral] = si;   // POST-equilibration when equilibrate set
    // n_<m>: precipitated amount [mol/kg] per ALLOWED mineral (reads 0.000 for
    // an evicted phase; the key is absent entirely when equilibrate{} is unused).
    for (const auto& [mineral, np] : res.precipitated)
        diag_["n_" + mineral] = np;
    if (dict->found("diagSpecies"))
        for (const auto& name : dict->lookupWordList("diagSpecies"))
        {
            const auto* r = res.find(name);
            if (!r)
                throw std::runtime_error("speciate: diagSpecies '" + name
                    + "' is not in the computed species table");
            diag_["m_" + name]     = r->molality;
            diag_["gamma_" + name] = r->gamma;   // per-ion activity coefficient
        }

    if (verbosity >= 2)
        std::cout << "speciate: " << res.rows.size() << " species -> "
                  << dict->subDict("output")->lookupWord("file") << ", "
                  << res.SI.size() << " mineral SI value(s)\n";
    return 0;
}

} // namespace Choupo
