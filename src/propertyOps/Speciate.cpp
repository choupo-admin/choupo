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

#include "core/Units.H"                             // atm_to_Pa
#include "thermo/electrolyte/SaltFromCatalogue.H"   // ionMW (ions.dat)
#include "thermo/electrolyte/SpeciationSolver.H"

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
// Optional `atmosphere { pCO2 <value> <pressure unit>; }` = OPEN system:
// a(CO2aq) is pinned by Henry and DIC becomes a solved outcome.
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

    // COMPOSITION (roadmap Phase B): the analysis given as APPARENT SALTS, each
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
            if (!(rec->found("component")
                  && rec->subDict("component")->found("speciesMap")))
                throw std::runtime_error("composition." + salt + ": components/"
                    + salt + ".dat has no component.speciesMap.");
            auto sm = rec->subDict("component")->subDict("speciesMap");
            scalar netCharge = 0.0;
            for (const auto& ion : sm->keys())
            {
                const scalar nu = sm->lookupScalar(ion);
                const fs::path ip = croot / "species" / "aqueous" / (ion + ".dat");
                if (!fs::exists(ip))
                    throw std::runtime_error("composition." + salt + ": species/aqueous/"
                        + ion + ".dat missing (needed for the charge balance).");
                netCharge += nu * Dictionary::fromFile(ip.string())->lookupScalar("charge");
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

    // atmosphere: OPEN system.  The unit is MANDATORY (atm / bar / Pa --
    // any declared pressure unit); K_H speaks per-atm, so convert.
    if (dict->found("atmosphere"))
    {
        auto atm = dict->subDict("atmosphere");
        if (!atm->found("pCO2"))
            throw std::runtime_error("atmosphere{}: needs pCO2 (the CO2 "
                "partial pressure the solution equilibrates with)");
        if (!atm->hasDimensions("pCO2"))
            throw std::runtime_error("atmosphere.pCO2 needs a pressure unit: "
                "pCO2 4.2e-4 atm | 4.26e-4 bar | 42.6 Pa ...  Bare numbers "
                "are refused -- a partial pressure must declare its basis.");
        const Dimensions dims = atm->dimensionsOf("pCO2");
        if (!(dims == Dims::pressure))
            throw std::runtime_error("atmosphere.pCO2: declared unit is "
                + dims.toPretty() + ", expected a PRESSURE (atm | bar | Pa)");
        in.openCO2 = true;
        in.pCO2    = atm->lookupScalar("pCO2") / units::atm_to_Pa;  // Pa -> atm
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

namespace {
// The case's OFFICIAL dictionary lives in constant/propertyDict (walk UP the
// fractal cascade).  For the speciate path it is an electrolyte propertyPackage
// declaring the SYSTEM (propertyMethods.aqueousActivity + inputBasis).  Returns
// null if there is none up the tree.
DictPtr caseDictionary()
{
    namespace fs = std::filesystem;
    fs::path p = fs::current_path();
    for (int up = 0; up < 6; ++up)
    {
        fs::path cand = p / "constant" / "propertyDict";
        if (fs::exists(cand)) return Dictionary::fromFile(cand.string());
        if (!p.has_parent_path()) break;
        p = p.parent_path();
    }
    return nullptr;
}
} // namespace

int Speciate::run(const DictPtr& dict, const ThermoPackage& /*thermo*/, int verbosity)
{
    diag_.clear();
    // PACKAGE (roadmap Phase B): the case's OFFICIAL dictionary, constant/propertyDict,
    // when it declares propertyMethods.aqueousActivity, IS the electrolyte
    // propertyPackage -- it fixes the activity method + input basis, and the op then
    // carries only the ANALYSIS.  A flat/degenerate thermoPackage (or none) -> the
    // legacy per-op `activityModel` form (backward compatible).
    DictPtr pkg = caseDictionary();
    const bool isPackage = pkg && pkg->found("propertyMethods")
        && pkg->subDict("propertyMethods")->found("aqueousActivity");
    if (!isPackage) pkg = nullptr;

    // Activity model: from the package's propertyMethods.aqueousActivity when a
    // package is declared (model contrasts = DIFFERENT packages), else the per-op
    // `activityModel`.  Default Davies (the only S1 builtin).  Resolved + the
    // input basis VALIDATED before the analysis is read (so a bad key fails with a
    // basis error, not an obscure downstream one).
    std::string model = dict->lookupWordOrDefault("activityModel", "davies");
    if (pkg)
    {
        {
            std::string m = pkg->subDict("propertyMethods")->lookupWord("aqueousActivity");
            const auto dot = m.rfind('.');            // "electrolyte.pitzerHMW" -> "pitzerHMW"
            model = (dot == std::string::npos) ? m : m.substr(dot + 1);
        }
        // Input-basis validation: composition keys subset of apparentComponents;
        // analyticalTotals/totals keys subset of analyticalMasters.
        if (pkg->found("inputBasis"))
        {
            auto ib = pkg->subDict("inputBasis");
            auto subsetCheck = [&](const char* opKey, const char* basisKey)
            {
                if (!dict->found(opKey) || !ib->found(basisKey)) return;
                const auto allowed = ib->lookupWordList(basisKey);
                for (const auto& k : dict->subDict(opKey)->keys())
                    if (std::find(allowed.begin(), allowed.end(), k) == allowed.end())
                        throw std::runtime_error(std::string(opKey) + "." + k
                            + " is not declared in the package inputBasis."
                            + basisKey + ".");
            };
            subsetCheck("composition",      "apparentComponents");
            subsetCheck("totals",           "analyticalMasters");
            subsetCheck("analyticalTotals", "analyticalMasters");
        }
    }

    auto in = propertyOps::readAnalysis(dict);
    propertyOps::readEquilibrate(dict, in);

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
