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

#include "core/Advisory.H"                          // the caveat surface
#include "core/Constants.H"                         // R
#include "core/Units.H"                             // atm_to_Pa
#include "thermo/electrolyte/EdwardsCatalogue.H"    // loadEdwardsHenry (Eq 13)
#include "thermo/electrolyte/SaltFromCatalogue.H"   // ionMW (ions.dat)
#include "thermo/ThermoPackageBuilder.H"
#include "thermo/electrolyte/SpeciationSolver.H"
#include "thermo/electrolyte/PitzerHMW.H"
#include "thermo/solidEquilibrium/SolidEquilibriumService.H"

#include <fstream>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <variant>
#include "thermo/activityCoefficient/ActivityModel.H"
#include "thermo/equationOfState/EquationOfState.H"
#include "thermo/heatCapacity/HeatCapacityModel.H"
#include "thermo/vaporPressure/VaporPressureModel.H"

#include "thermo/RecordResolver.H"
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
                in.totals[SpeciesId(k)] = totalAsMolality(t, k);
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
                in.totals[SpeciesId(ion)] += m * nu;
            }
            if (std::fabs(netCharge) > 1e-9)
                throw std::runtime_error("composition." + salt + ": speciesMap is NOT "
                    "electroneutral (Sum nu*charge = " + std::to_string(netCharge)
                    + ") -- fix components/" + salt + ".dat.");
        }
    }

    //  totalsBasis: what the totals ARE.  `analytical` (default) = a measured
    //  ion analysis, where a feed charge imbalance is evidence of lab error
    //  and the solve-pH advisory says so.  `stoichiometric` = FAMILY totals of
    //  neutral weak-electrolyte feeds expressed on the master basis (2.90
    //  mol/kg NH3 declared as `NH4 2.90`): the master basis then carries a
    //  FORMAL net charge that no lab measured, electroneutrality is the exact
    //  physical closure, and the imbalance check does not apply -- the same
    //  claim the ReactiveVLE bridge makes for its component-derived totals,
    //  here DECLARED by the case, which owns what its numbers mean.
    {
        const std::string tb =
            dict->lookupWordOrDefault("totalsBasis", "analytical");
        if (tb == "stoichiometric")
            in.stoichiometricTotals = true;
        else if (tb != "analytical")
            throw std::runtime_error("totalsBasis '" + tb + "': expected"
                " `analytical` (a measured ion analysis -- the default) or"
                " `stoichiometric` (family totals of neutral feeds on the"
                " master basis)");
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
//  Since S3b it RETURNS the admitted list rather than filling
//  SpeciationInput::equilibrate: that channel is the
//  SolidEquilibriumService's private one -- the one door material takes
//  into a solid phase -- and no reader hands anyone a filled key to walk
//  around it with.
std::vector<std::string> readEquilibrate(const DictPtr& dict)
{
    if (!dict->found("equilibrate")) return {};       // absent: SI-only, as today
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
    auto admitted = eq->lookupWordList("minerals");
    if (admitted.empty())
        throw std::runtime_error("equilibrate{}: the minerals list is empty -- "
            "name at least one allowed solid, or drop the block for SI-only");
    return admitted;
}

} // namespace propertyOps


int Speciate::run(const DictPtr& dict, const ThermoPackage& /*thermo*/, int verbosity)
{
    diag_.clear();
    // PACKAGE (roadmap Phase B): the case's OFFICIAL dictionary, constant/thermoPhysPropDict,
    // when it declares propertyMethods.aqueousActivity, IS the electrolyte
    // propertyPackage -- it fixes the activity method + input basis, and the op then
    // carries only the ANALYSIS.  A flat/degenerate thermoPackage (or none) -> the
    // legacy per-op `activityModel` form (backward compatible).
    // The case's aqueous surface (aqueousProperties): it fixes the gamma
    // model; the op's own
    // `activityModel` WINS (the model-CONTRAST mechanism: davies vs pitzerHMW
    // on ONE feed).  Solvent: the speciation stack computes on the WATER
    // surface (molality basis, SolventProperties, Debye-Hueckel A(T)) -- a
    // declared non-water solvent refuses loudly (a NAMED gap, never a silent
    // substitution).
    const propertyOps::AqueousSurface surface =
        propertyOps::aqueousSurfaceOf(authoredV2());
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
    const auto admitted = propertyOps::readEquilibrate(dict);

    // verifyGlobal: the FULL-catalogue Pitzer
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
    //  D-R1: the op dict may declare a deliberately restricted network
    //  (networkScope restricted; network ( ... ); reason "...";).  ONE
    //  parse, in the solver -- the reactive builder routes through the
    //  same method.
    solver.applyNetworkScope(dict);
    //  MIGRATION S3: a mineral set goes through the ONE door -- the
    //  SolidEquilibriumService (coupled route: the provider's own
    //  simultaneous solve, numbers unchanged; the service owns the entry,
    //  the formed ledger and the narration).  An SI-only analysis solves
    //  directly, as ever -- no solid may form there.
    const auto res = admitted.empty()
        ? solver.solve(in, verbosity)
        : solidEq::SolidEquilibriumService::equilibrateMinerals(
              solver, in, admitted, verbosity).aqueous;

    // -- species table CSV ------------------------------------------------------
    const std::string outFile_ = dict->subDict("output")->lookupWord("file");
    records::refuseStandardsWrite("speciate", "file", outFile_);
    std::ofstream csv(outFile_);
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

    //  THE CHARGE THE ANSWER CARRIES, and why it belongs HERE rather than only
    //  in the log.  The solver already computes it -- sum(z_i m_i) /
    //  sum(|z_i| m_i) over the converged rows -- and prints it at verbosity >= 2
    //  with its meaning attached.  It was reaching NO machine-readable surface:
    //  not this map, so not the CSV, so not the result JSON, so no golden could
    //  pin it and no reader could act on it without scraping stdout.
    //
    //  That matters most under an IMPOSED pH, which is the case that makes the
    //  quantity interesting.  `pH <number>;` fixes a_H and DROPS H+'s mole
    //  balance, so the solution is electrically neutral only because of a strong
    //  acid or base that no total declares -- and this residual IS that implicit
    //  titrant, in equivalents.  A distribution diagram drawn across pH is
    //  drawn across a titration nobody wrote down; publishing the number is what
    //  lets the picture say so with a measurement instead of a sentence.
    //
    //  `chargeImposed` travels WITH it and is not decoration: the same number
    //  means "the titrant" when the pH was given and "the convergence residual
    //  of electroneutrality" when it was solved, and those are different claims.
    //  A value whose meaning depends on a mode must carry the mode.
    diag_["chargeResidual"] = res.chargeResidual;
    diag_["chargeImposed"]  = res.chargeImposed ? 1.0 : 0.0;
    //  D-R1 label (Vitor's condition 2): a result from a reduced model is
    //  identifiable in the golden-master surface too, not only the console.
    if (res.restrictedNetwork)
        diag_["networkRestricted"] = 1.0;
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

    //  THE MEASURABLE ONE.  Every key above is a SINGLE-ION activity
    //  coefficient, and a single-ion gamma is not measurable: it depends on
    //  the convention that splits a neutral combination into charged halves.
    //  What experiment reports -- and what every published seawater or
    //  single-salt table quotes -- is the MEAN IONIC coefficient
    //
    //      gamma_pm = ( gamma_+^nu+ * gamma_-^nu- )^(1/(nu+ + nu-)) ,
    //
    //  which is convention-free.  Until now the engine published only the
    //  unmeasurable half, so a case comparing against a published table had
    //  to combine the ions BY HAND in a header comment.  That is a derived
    //  number with no home in the result, and it went stale exactly as such
    //  numbers do: `pitzer_seawater_verify`'s header claimed "all pins STILL
    //  in their published band" after E_theta was activated, having actually
    //  re-checked the two 1-1 salts whose gamma_pm is easy to eyeball.  The
    //  four divalent salts were never recomputed (see the case header).
    //
    //  The STOICHIOMETRY IS DERIVED, never declared and never read off a
    //  name: nu+ and nu- are the smallest integers with nu+*z+ = nu-*|z-|,
    //  from the charges the species records already carry.  Deriving it from
    //  a salt name would be the name-identity crossing the F2 contract bans.
    if (dict->found("diagMeanIonic"))
        for (const auto& e : dict->lookupDictList("diagMeanIonic"))
        {
            const std::string cat = e->lookupWord("cation");
            const std::string ani = e->lookupWord("anion");
            const auto* rc = res.find(cat);
            const auto* ra = res.find(ani);
            if (!rc || !ra)
                throw std::runtime_error("speciate: diagMeanIonic '"
                    + cat + "'/'" + ani + "': '" + (rc ? ani : cat)
                    + "' is not in the computed species table");
            if (rc->z <= 0.0 || ra->z >= 0.0)
                throw std::runtime_error("speciate: diagMeanIonic names '"
                    + cat + "' as the cation and '" + ani + "' as the anion, "
                    "but their charges are " + std::to_string(rc->z) + " and "
                    + std::to_string(ra->z) + " -- a mean ionic coefficient "
                    "is defined for one POSITIVE and one NEGATIVE species");

            const double zp = std::round(rc->z), zm = std::round(-ra->z);
            if (std::fabs(zp - rc->z) > 1e-9 || std::fabs(zm + ra->z) > 1e-9)
                throw std::runtime_error("speciate: diagMeanIonic '" + cat
                    + "'/'" + ani + "': non-integer charge -- the "
                    "stoichiometry nu+*z+ = nu-*|z-| has no integer solution");

            //  smallest integers: divide both charges by their gcd
            long a = static_cast<long>(zm), b = static_cast<long>(zp);
            while (b != 0) { const long t = a % b; a = b; b = t; }
            const double g   = static_cast<double>(a > 0 ? a : -a);
            const double nup = zm / g, num = zp / g;

            diag_["gamma_pm_" + cat + "_" + ani] =
                std::pow(std::pow(rc->gamma, nup) * std::pow(ra->gamma, num),
                         1.0 / (nup + num));

            //  Announce the DERIVATION, not just the answer: a reader must be
            //  able to see which stoichiometry produced the number without
            //  re-deriving it from the charges themselves.
            if (verbosity >= 2)
                std::cout << "    gamma_pm(" << cat << "," << ani << "): nu+ "
                          << nup << ", nu- " << num << " derived from z("
                          << cat << ") = " << rc->z << ", z(" << ani << ") = "
                          << ra->z << "\n";
        }

    //  -- vapour side (optional `vapour {}`) -- Eqs 5/6/11 of Edwards et al.
    //  (1978) over the SOLVED speciation: the equilibrium partial pressure of
    //  each declared molecular solute and of the solvent, hence the total
    //  pressure and the vapour composition.  This is what turns the activity
    //  surface into a comparable VLE point (the Table 7 anchor):
    //
    //      p_a * phi_a = m_a gamma_a* H_a^(P)                        (Eq 5)
    //      p_w * phi_w = a_w Psat_w phi_w^s exp[v_w (P-Psat_w)/RT]   (Eq 6)
    //      ln H^(P) = ln H^(Psat_w) + v_a_inf (P - Psat_w)/RT        (Eq 11)
    //
    //  phi = 1 is a DECLARED approximation (`fugacity ideal;`, refused when
    //  absent): the reference computes phi from a vapour model its
    //  transcription does not carry, so nothing else is available -- and the
    //  case must own that in writing.  The solvent Poynting factor of Eq 6 is
    //  OMITTED and announced: no v_w(T) is curated, and at the pressures this
    //  block serves (a few atm) it is below 0.2 %.
    if (dict->found("vapour"))
    {
        const auto vap = dict->subDict("vapour");

        const std::string fug = vap->lookupWordOrDefault("fugacity", "");
        if (fug.empty())
            throw std::runtime_error("vapour{}: `fugacity ideal;` must be"
                " DECLARED.  phi = 1 is an approximation the case owns, not a"
                " default the engine assumes (no silent crutch).");
        if (fug != "ideal")
            throw std::runtime_error("vapour.fugacity '" + fug + "': only"
                " `ideal` (phi = 1) is implemented -- the Edwards (1978)"
                " reference's own vapour-fugacity model is not transcribed,"
                " and no other is curated.");

        if (!vap->found("solutes"))
            throw std::runtime_error("vapour{}: needs `solutes ( { species"
                " <name>; henry <record-stem>; } ... );` -- the volatile"
                " molecular species, each with the curated Henry record that"
                " prices it.");

        struct VapSolute
        {
            const electrolyte::SpeciesRow* row;
            electrolyte::EdwardsHenry      rec;
            double                         H = 0;   // at T, before Eq 11
            double                         p = 0;   // partial pressure [atm]
        };
        std::vector<VapSolute> sol;
        for (const auto& e : vap->lookupDictList("solutes"))
        {
            VapSolute s;
            const std::string name = e->lookupWord("species");
            s.row = res.find(name);
            if (!s.row)
                throw std::runtime_error("vapour.solutes: species '" + name
                    + "' is not in the computed species table");
            if (s.row->z != 0.0)
                throw std::runtime_error("vapour.solutes: '" + name
                    + "' carries charge z = " + std::to_string(s.row->z)
                    + " -- Eq 5 prices a MOLECULAR solute; an ion has no"
                      " vapour pressure of its own");
            s.rec = electrolyte::loadEdwardsHenry(e->lookupWord("henry"));

            //  The record names its standard state, and the standard state
            //  is the ACTIVITY MODEL's: Edwards' H is molal, referenced to
            //  Psat(water), riding the unsymmetric gamma* of Eq 8.  Reading
            //  it against another model's gamma silently mixes scales.
            if (s.rec.convention.rfind("Edwards", 0) == 0
                && model != "edwardsPitzer")
                throw std::runtime_error("vapour.solutes." + name + ": Henry"
                    " record '" + s.rec.stem + "' declares convention '"
                    + s.rec.convention + "', which rides the unsymmetric"
                    " gamma* of activityModel edwardsPitzer -- the active"
                    " model here is '" + model + "'.  Standard states do not"
                    " mix; select the matching model or the matching record.");

            s.H = s.rec.H(in.T);
            if (s.rec.Thi > s.rec.Tlo
                && (in.T < s.rec.Tlo || in.T > s.rec.Thi))
            {
                std::ostringstream msg;
                msg << "EdwardsPitzer Henry record " << s.rec.stem
                    << " evaluated at T = " << std::fixed
                    << std::setprecision(2) << in.T
                    << " K, outside its declared validity " << s.rec.Tlo
                    << "-" << s.rec.Thi << " K -- extrapolated";
                if (AdvisoryLog::instance().add("model", "warning",
                                               "speciate vapour", msg.str()))
                    std::cout << "  [advisory] " << msg.str() << "\n";
            }
            sol.push_back(std::move(s));
        }
        if (sol.empty())
            throw std::runtime_error("vapour.solutes: empty -- name at least"
                " one volatile molecular species");

        //  The solvent leg: a_w * Psat(T) on the solvent's OWN curated vapour-
        //  pressure model (the same record every flash reads, so the two
        //  surfaces cannot drift apart).
        const scalar PsatPa =
            database()->loadComponent("water").vp().Psat_Pa(in.T);
        const double PsAtm  = PsatPa / units::atm_to_Pa;
        const double pWater = res.aw * PsAtm;

        //  Eq 11 couples H to the total pressure the sum is trying to find, so
        //  the closure is a fixed point.  The derivative dP/dP through the
        //  exponential is ~ v_inf P/(RT) ~ 1e-3 at a few atm, so plain
        //  substitution converges in a handful of passes; 50 is a ceiling,
        //  not an expectation.
        double P = pWater;
        for (const auto& s : sol) P += s.row->molality * s.row->gamma * s.H;
        for (int it = 0; it < 50; ++it)
        {
            double Pnew = pWater;
            for (auto& s : sol)
            {
                double kk = 1.0;
                if (s.rec.hasVInfinity())
                {
                    const double vSI = s.rec.vInfinityAt(in.T) * 1.0e-6;
                    kk = std::exp(vSI * (P - PsAtm) * units::atm_to_Pa
                                  / (constant::R * in.T));
                }
                s.p  = s.row->molality * s.row->gamma * s.H * kk;
                Pnew += s.p;
            }
            const bool done = std::fabs(Pnew - P) <= 1.0e-12 * std::fabs(Pnew);
            P = Pnew;
            if (done) break;
        }

        diag_["P_atm"]       = P;
        diag_["p_water_atm"] = pWater;
        diag_["y_water"]     = pWater / P;
        for (const auto& s : sol)
        {
            diag_["p_" + s.row->name + "_atm"] = s.p;
            diag_["y_" + s.row->name]          = s.p / P;
        }

        {
            std::ostringstream msg;
            msg << "vapour{} priced with phi = 1 (`fugacity ideal`, the"
                   " case's declared approximation); solvent Poynting factor"
                   " omitted (no curated v_w(T); < 0.2 % below 4 atm)";
            if (AdvisoryLog::instance().add("model", "info",
                                            "speciate vapour", msg.str())
                && verbosity >= 2)
                std::cout << "  [vapour] " << msg.str() << "\n";
        }
        if (verbosity >= 2)
        {
            std::cout << "  [vapour] solvent: a_w = " << std::fixed
                      << std::setprecision(6) << res.aw << ", Psat = "
                      << PsAtm << " atm -> p_w = " << pWater << " atm\n";
            for (const auto& s : sol)
            {
                std::cout << "  [vapour] " << s.row->name << ": m = "
                          << s.row->molality << ", gamma = " << s.row->gamma
                          << ", H(T) = " << s.H << " kg-atm/mol ("
                          << s.rec.stem << ")";
                if (s.rec.hasVInfinity())
                    std::cout << ", Eq 11 at v_inf = "
                              << s.rec.vInfinityAt(in.T) << " cm3/mol";
                else
                    std::cout << ", Eq 11 UNAVAILABLE (no vInfinity in"
                                 " record; H taken at Psat_w)";
                std::cout << " -> p = " << s.p << " atm\n";
            }
            std::cout << "  [vapour] P = " << P << " atm; y_water = "
                      << pWater / P << std::defaultfloat << "\n";
        }
    }

    if (verbosity >= 2)
        std::cout << "speciate: " << res.rows.size() << " species -> "
                  << dict->subDict("output")->lookupWord("file") << ", "
                  << res.SI.size() << " mineral SI value(s)\n";
    return 0;
}

} // namespace Choupo
