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

#include "ReactionGibbs.H"

#include "core/Advisory.H"
#include "core/Constants.H"
#include "thermo/RecordResolver.H"
#include "thermo/ThermoPackage.H"

#include <cmath>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace Choupo {

namespace {

//  The rung word a case declares (the record vocabulary, so a reader can
//  match it against `standardThermochemistry.referenceState`) and the phase
//  word `Component::h_formation` walks to.  ONE table, both directions.
struct PhaseWord { const char* rung; const char* phase; };
const PhaseWord PHASES[] = {
    { "idealGas",   "gas"    },
    { "pureLiquid", "liquid" },
    { "pureSolid",  "solid"  },
};

PhaseWord phaseOf(const std::string& rungWord, const std::string& species)
{
    for (const auto& p : PHASES)
        if (rungWord == p.rung) return p;
    std::ostringstream m;
    m << "reactionGibbs: species '" << species << "' is declared on phase '"
      << rungWord << "', which is not a standard state this op knows."
         "  Accepted: idealGas, pureLiquid, pureSolid -- the same words a"
         " record's standardThermochemistry.referenceState uses.";
    throw std::runtime_error(m.str());
}

struct Term { std::string species; scalar nu; std::size_t idx; };

//  One species' standard-state enthalpy and absolute entropy at (T, phase),
//  and the ROUTE that produced them, as a word the CSV and the log carry.
struct Potential { scalar h; scalar s; std::string route; };

Potential price(const Component& c, scalar T, const PhaseWord& ph)
{
    if (!c.hasGibbsData())
        throw std::runtime_error("reactionGibbs: component '" + c.name()
            + "' carries no standardThermochemistry block; nothing here can"
              " price it and nothing here invents a datum.");
    const bool atDatum = std::abs(T - 298.15) < 1.0e-6;
    if (atDatum && c.hasRung(ph.rung))
    {
        //  The integral from 298.15 K to 298.15 K is zero, so the rung's own
        //  pair IS the potential -- no heat capacity is asked for, which is
        //  what lets a record with a datum and no Cp block answer HERE and
        //  nowhere else.
        const auto& r = c.rung(ph.rung);
        return { r.Hf298, r.S298, "datum" };
    }
    //  Everywhere else: the phase-aware walk.  It refuses by name where the
    //  record lacks what the walk needs, and that refusal is the answer.
    //  `integrated` = the record's own rung with its heat capacity integrated
    //  from 298.15 K; `crossing` = a phase change taken at 298.15 K on the way.
    const bool ownRung = (c.referenceStateWord() == ph.rung);
    return { c.h_formation(T, ph.phase), c.s_formation(T, ph.phase),
             ownRung ? "integrated" : "crossing" };
}

} // namespace

int ReactionGibbs::run(const DictPtr& dict, const ThermoPackage& thermo, int verbosity)
{
    const std::string opName = dict->lookupWordOrDefault("name", "reactionGibbs");

    // ---- the reactions: names into constant/reactions ------------------------
    if (!dict->found("reactions"))
        throw std::runtime_error("reactionGibbs: needs `reactions ( r1 r2 ... );`,"
            " names defined in constant/reactions (each with a `stoichiometry` block)");
    const auto names = dict->lookupWordList("reactions");
    if (names.empty())
        throw std::runtime_error("reactionGibbs: the `reactions ( ... )` list is empty");
    const std::filesystem::path libPath = std::filesystem::path("constant") / "reactions";
    if (!std::filesystem::exists(libPath))
        throw std::runtime_error("reactionGibbs: constant/reactions not found in the"
            " case directory -- the stoichiometry lives in the library, never here");
    auto lib = Dictionary::fromFile(libPath.string());

    // ---- the declared standard state of every species -----------------------
    if (!dict->found("phases"))
        throw std::runtime_error("reactionGibbs: needs `phases { <species> idealGas |"
            " pureLiquid | pureSolid; ... }` -- the standard state each species is"
            " priced on is a DECLARATION, and the op will not guess it");
    auto phases = dict->subDict("phases");

    auto indexOf = [&](const std::string& nm) -> std::size_t {
        for (std::size_t i = 0; i < thermo.n(); ++i)
            if (thermo.comp(i).name() == nm) return i;
        throw std::runtime_error("reactionGibbs: species '" + nm
            + "' is not in the thermoPackage component list");
    };

    struct Rxn { std::string name; std::vector<Term> terms; };
    std::vector<Rxn> rxns;
    for (const auto& rn : names)
    {
        if (!lib->found(rn))
            throw std::runtime_error("reactionGibbs: reaction '" + rn
                + "' is not defined in constant/reactions");
        auto rd = lib->subDict(rn);
        if (!rd->hasDictList("stoichiometry"))
            throw std::runtime_error("reactionGibbs: reaction '" + rn
                + "' has no `stoichiometry ( { component ..; nu ..; } ... )` block");
        Rxn r; r.name = rn;
        for (const auto& e : rd->lookupDictList("stoichiometry"))
        {
            Term t;
            t.species = e->lookupWord("component");
            t.nu      = e->lookupScalar("nu");
            t.idx     = indexOf(t.species);
            if (!phases->found(t.species))
                throw std::runtime_error("reactionGibbs: species '" + t.species
                    + "' (reaction '" + rn + "') has no entry in `phases {}` --"
                      " declare the standard state it is priced on (idealGas |"
                      " pureLiquid | pureSolid)");
            r.terms.push_back(t);
        }
        if (r.terms.empty())
            throw std::runtime_error("reactionGibbs: reaction '" + rn
                + "' has an empty stoichiometry");
        rxns.push_back(r);
    }

    // ---- the temperatures ---------------------------------------------------------
    if (!dict->found("temperatures"))
        throw std::runtime_error("reactionGibbs: needs `temperatures ( T1 T2 ... );` in K");
    const auto Ts = dict->lookupList("temperatures");
    if (Ts.empty())
        throw std::runtime_error("reactionGibbs: the `temperatures ( ... )` list is empty");
    for (auto T : Ts)
        if (!(T > 0.0))
            throw std::runtime_error("reactionGibbs: a temperature must be positive, in K");

    // ---- output ---------------------------------------------------------------------
    const std::string outFile = dict->subDict("output")->lookupWord("file");
    records::refuseStandardsWrite("reactionGibbs", "file", outFile);
    std::ofstream csv(outFile);
    if (!csv.is_open())
        throw std::runtime_error("reactionGibbs: cannot open output file " + outFile);
    csv << "reaction,T_K,dH_kJ_mol,dS_J_molK,dG_kJ_mol,lnK,species_routes\n"
        << std::scientific << std::setprecision(8);

    if (verbosity >= 1)
        std::cout << "  [reactionGibbs] " << opName << ": " << rxns.size()
                  << " reaction(s) at " << Ts.size() << " temperature(s), every"
                     " species on its DECLARED standard state; the datum is the"
                     " elements/formation convention at 298.15 K (dHf_298 +"
                     " third-law s_298).  Route per species: `datum` = the"
                     " record's own rung at 298.15 K, no Cp integrated;"
                     " `integrated` = its own rung with Cp integrated from"
                     " 298.15 K; `crossing` = h_formation/s_formation from the"
                     " declared rung to ANOTHER phase, the transition taken at"
                     " 298.15 K (each refuses by name where the record lacks"
                     " the leg).\n";

    for (const auto& r : rxns)
    {
        for (auto T : Ts)
        {
            scalar dH = 0.0, dS = 0.0;
            std::ostringstream routes;
            if (verbosity >= 2)
                std::cout << "  [reactionGibbs] " << r.name << " at T = "
                          << std::fixed << std::setprecision(2) << T << " K\n";
            for (const auto& t : r.terms)
            {
                const Component& c = thermo.comp(t.idx);
                const PhaseWord ph = phaseOf(phases->lookupWord(t.species), t.species);
                const Potential p = price(c, T, ph);
                dH += t.nu * p.h;
                dS += t.nu * p.s;
                routes << (routes.tellp() > 0 ? ";" : "") << t.species << ":" << p.route;
                if (verbosity >= 2)
                    std::cout << "      " << std::setw(10) << std::left << t.species
                              << " nu " << std::setw(6) << std::right
                              << std::fixed << std::setprecision(2) << t.nu
                              << "  priced on " << std::setw(10) << std::left << ph.rung
                              << " (record declares " << c.referenceStateWord()
                              << ")  route " << std::setw(8) << p.route
                              << "  h = " << std::setw(12) << std::right
                              << std::setprecision(1) << p.h << " J/mol"
                              << "  s = " << std::setw(8) << std::setprecision(2)
                              << p.s << " J/(mol K)\n";
                //  A crossing is ANNOUNCED whatever the verbosity: an advisory
                //  must not depend on how loudly the run was asked to speak.
                if (p.route == "crossing")
                {
                    AdvisoryLog::instance().add("model", "info",
                        "reactionGibbs " + opName,
                        "species '" + t.species + "' priced on " + ph.rung
                        + " by crossing from its declared "
                        + c.referenceStateWord() + " datum (reaction '" + r.name
                        + "', T = " + std::to_string(T) + " K)");
                }
            }
            const scalar dG  = dH - T * dS;
            const scalar lnK = -dG / (constant::R * T);
            std::ostringstream key;
            key << r.name << "_T" << static_cast<int>(std::lround(T)) << "K_";
            diag_[key.str() + "dH_kJ_mol"] = dH / 1000.0;
            diag_[key.str() + "dS_J_molK"] = dS;
            diag_[key.str() + "dG_kJ_mol"] = dG / 1000.0;
            diag_[key.str() + "lnK"]       = lnK;
            headline_.push_back(key.str() + "dG_kJ_mol");
            csv << r.name << "," << std::scientific << std::setprecision(8) << T << ","
                << dH / 1000.0 << "," << dS << "," << dG / 1000.0 << "," << lnK
                << "," << routes.str() << "\n";
            if (verbosity >= 1)
                std::cout << "  [reactionGibbs] " << r.name << "  T = "
                          << std::fixed << std::setprecision(2) << T << " K:"
                          << "  dH = " << std::setprecision(3) << dH / 1000.0
                          << " kJ/mol  dS = " << std::setprecision(2) << dS
                          << " J/(mol K)  dG = " << std::setprecision(3) << dG / 1000.0
                          << " kJ/mol  ln K = " << std::setprecision(3) << lnK
                          << "  (" << (dG < 0.0 ? "exergonic" : "endergonic")
                          << " as written; says nothing about a rate)\n";
        }
    }
    csv.close();
    return 0;
}

} // namespace Choupo
