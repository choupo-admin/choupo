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

#include "Exchange.H"

#include "thermo/electrolyte/ExchangeInput.H"   // electrolyte::readExchange

#include "Speciate.H"                               // propertyOps::readAnalysis
#include "core/Advisory.H"
#include "core/Dimensions.H"
#include "thermo/Database.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"   // electrolytePaths, ionMW
#include "thermo/electrolyte/SpeciationSolver.H"
#include "CasePackage.H"

#include "thermo/RecordResolver.H"
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace fs = std::filesystem;

namespace Choupo {

//  `readExchange` and its two helpers USED TO LIVE HERE, in `namespace
//  propertyOps`, and `unitOperations/separation/IonExchanger.cpp` included
//  this file to reach them -- one half of the `unitOperations` <->
//  `propertyOps` cycle (debt D2).  A props BENCH and a process UNIT both turn
//  the same declared `exchange {}` block into the same solver input, so the
//  shared reader belonged in neither consumer.  It is now
//  `thermo/electrolyte/ExchangeInput.H`, per module-boundaries.md §2 (record
//  resolution belongs to thermo) and §3 (the lowest NEUTRAL layer that can own
//  the concept).

namespace {

// CaCO3-equivalent hardness [mg/L as CaCO3] from Ca + Mg molalities (mol/kg ~
// mol/L at rho ~ 1): hardness = (m_Ca + m_Mg) * 100.09 g/mol(CaCO3) * 1000.
double hardnessAsCaCO3(double m_Ca, double m_Mg)
{
    return (m_Ca + m_Mg) * 100.09 * 1000.0;   // mg/L as CaCO3
}

} // anonymous namespace

int Exchange::run(const DictPtr& dict, const ThermoPackage& /*thermo*/, int verbosity)
{
    struct CoutGuard
    {
        std::ios state{nullptr};
        CoutGuard()  { state.copyfmt(std::cout); }
        ~CoutGuard() { std::cout.copyfmt(state); }
    } coutGuard;

    diag_.clear();
    //  `equilibrate {}` is READ BY NOBODY here, and a key nobody reads must
    //  not be silently accepted (audit, 2026-07-28: a softener op carrying it
    //  reported SI_calcite +1.708 with nothing precipitated and no message --
    //  in a code that refuses unknown keys INSIDE equilibrate{}, that is a
    //  doctrine leak).  The solver does carry both an exchange row and a
    //  mineral active set, so this is a CAPABILITY, not an impossibility --
    //  but nothing has ever validated the two together, and a softener that
    //  starts precipitating because a block was quietly honoured is the
    //  silent-crutch failure, not a feature.
    if (dict->found("equilibrate"))
        throw std::runtime_error("exchange: `equilibrate {}` is not honoured by"
            " the exchange op -- an exchange run reports saturation indices but"
            " precipitates nothing, and until now it ignored this block in"
            " silence.  Either drop it (the SI table already tells you what the"
            " softened effluent is supersaturated in), or run the effluent"
            " through a separate `speciate` op that carries the"
            " `equilibrate { minerals ( ... ); }`.  Joint exchange +"
            " precipitation is a comparison against a reference that nobody has"
            " run: the CEC"
            " capacity row and the mineral active set have never been solved"
            " together against a reference.");
    auto in = propertyOps::readAnalysis(dict);
    if (in.totals.empty())
        throw std::runtime_error("exchange: `totals` is empty -- a softener "
            "needs a water analysis to soften");

    // Optional aqueous-activity-model selection (default Davies, the only S1
    // builtin; an unknown name is refused with the available list).
    electrolyte::SpeciationSolver solver(propertyOps::resolveAqueousActivity(dict, authoredV2()));
    electrolyte::readExchange(dict, in, solver, verbosity);

    // -- the MANDATORY honesty banner (non-suppressible at verbosity >= 2 +
    //    an AdvisoryLog entry regardless) -- the limiting-effluent caveat.
    const std::string banner =
        "EXCHANGE EQUILIBRIUM -- limiting effluent, not a bed in service.  "
        "Water fully equilibrated with the resin at the stated CEC and "
        "selectivity (the best a fresh / fully-loaded contactor does per pass). "
        " A real fixed bed leaks rising hardness as the exchange front migrates "
        "toward breakthrough, then must be regenerated.  Cycle length, "
        "bed-volumes-to-breakthrough and regeneration are TRANSIENT and not "
        "modelled here.  Safe reading: real leakage >= this equilibrium "
        "leakage; if the equilibrium effluent is already hard, no bed will "
        "soften it.";
    AdvisoryLog::instance().add("exchange", "info", "exchange", banner);
    if (verbosity >= 2)
        std::cout <<
            "\n  +-- EXCHANGE EQUILIBRIUM -- limiting effluent, not a bed in service. --+\n"
            "  | Water fully equilibrated with the resin at the stated CEC and\n"
            "  | selectivity (the best a fresh / fully-loaded contactor does per\n"
            "  | pass).  A real fixed bed leaks rising hardness as the exchange\n"
            "  | front migrates toward breakthrough, then must be regenerated.\n"
            "  | Cycle length, bed-volumes-to-breakthrough and regeneration are\n"
            "  | TRANSIENT and not modelled here.  Safe reading: real leakage >=\n"
            "  | this equilibrium leakage; if the equilibrium effluent is already\n"
            "  | hard, no bed will soften it.\n"
            "  +--------------------------------------------------------------------+\n";

    const auto res = solver.solve(in, verbosity);

    // -- post-exchange (softened) aqueous species table -------------------------
    const std::string outFile_ = dict->subDict("output")->lookupWord("file");
    records::refuseStandardsWrite("exchange", "file", outFile_);
    std::ofstream csv(outFile_);
    if (!csv.is_open())
        throw std::runtime_error("exchange: cannot open output file");
    csv << "species,molality,activity,gamma\n";
    csv << std::scientific << std::setprecision(8);
    for (const auto& r : res.rows)
        csv << r.name << "," << r.molality << "," << r.activity << ","
            << r.gamma << "\n";

    // -- KPIs -------------------------------------------------------------------
    auto aqIn  = [&](const std::string& ion) {
        return res.aqBefore.count(ion) ? res.aqBefore.at(ion) : 0.0; };
    auto aqOut = [&](const std::string& ion) {
        return res.aqAfter.count(ion)  ? res.aqAfter.at(ion)  : 0.0; };

    const double hIn  = hardnessAsCaCO3(aqIn("Ca"),  aqIn("Mg"));
    const double hOut = hardnessAsCaCO3(aqOut("Ca"), aqOut("Mg"));
    diag_["hardness_in_mgL_CaCO3"]  = hIn;
    diag_["hardness_out_mgL_CaCO3"] = hOut;
    diag_["hardness_removal_pct"]   = hIn > 0.0 ? 100.0 * (hIn - hOut) / hIn : 0.0;

    const double mwCa = electrolyte::ionMW("Ca");   // g/mol
    const double mwMg = electrolyte::ionMW("Mg");
    const double mwNa = electrolyte::ionMW("Na");
    diag_["Ca_leakage_mgL"] = aqOut("Ca") * mwCa * 1000.0;
    diag_["Mg_leakage_mgL"] = aqOut("Mg") * mwMg * 1000.0;

    // Na ADDED (the salt penalty): Na released eq-for-eq into the water.
    const double naAdded = aqOut("Na") - aqIn("Na");      // mol/kg (>0)
    diag_["Na_added_mgL"]  = naAdded * mwNa * 1000.0;
    diag_["Na_added_meqL"] = naAdded * 1.0e3;             // Na is monovalent: meq=mmol

    // resin loadings (equivalent fractions on the resin)
    auto beta = [&](const std::string& sp) {
        return res.beta.count(sp) ? res.beta.at(sp) : 0.0; };
    diag_["resin_loading_beta_Ca"] = beta("CaX2");
    diag_["resin_loading_beta_Mg"] = beta("MgX2");
    diag_["resin_loading_beta_Na"] = beta("NaX");
    diag_["CEC_utilised_pct"]      = res.cecUtilisedPct;
    diag_["newtonIters"]           = res.newtonIters;
    diag_["I"]  = res.I;
    diag_["pH"] = res.pH;

    if (dict->found("diagSpecies"))
        for (const auto& name : dict->lookupWordList("diagSpecies"))
        {
            const auto* r = res.find(name);
            if (!r)
                throw std::runtime_error("exchange: diagSpecies '" + name
                    + "' is not in the computed species table");
            diag_["m_" + name] = r->molality;
        }

    // -- the exchange-equilibrium ledger + the isotherm CSV ---------------------
    if (verbosity >= 2)
    {
        std::cout << "  EXCHANGE LEDGER (resin " << in.exchange.resin
                  << ", Gaines-Thomas):\n";
        std::cout << "    sites FULL: CEC utilised " << std::fixed
                  << std::setprecision(1) << res.cecUtilisedPct
                  << "% (a fixed exchanger is always electroneutral -- every "
                     "site carries a cation)\n" << std::defaultfloat;
        for (const auto& [sp, m] : res.bound)
            std::cout << "    " << std::left << std::setw(8) << sp << std::right
                      << " m = " << std::scientific << std::setprecision(4) << m
                      << " mol/kg   beta = " << std::fixed << std::setprecision(4)
                      << res.beta.at(sp) << std::defaultfloat << "\n";
        std::cout << "  WATER (aqueous total before -> after, eq-for-eq):\n";
        for (const auto& [ion, b] : res.aqBefore)
        {
            const double a = aqOut(ion);
            if (std::fabs(a - b) > 1.0e-12 * std::max(1.0, b))
                std::cout << "    " << std::left << std::setw(6) << ion
                          << std::right << std::scientific << std::setprecision(4)
                          << b << " -> " << a << " mol/kg  (" << std::showpos
                          << std::fixed << std::setprecision(1)
                          << 100.0 * (a - b) / b << "%)" << std::noshowpos
                          << std::defaultfloat << "\n";
        }
        std::cout << "  hardness " << std::fixed << std::setprecision(1) << hIn
                  << " -> " << hOut << " mg/L as CaCO3  (removal "
                  << std::setprecision(2) << diag_["hardness_removal_pct"]
                  << "%);  Na added " << std::setprecision(2)
                  << diag_["Na_added_meqL"] << " meq/L (the salt penalty)\n"
                  << std::defaultfloat;
        if (res.daviesExceeded)
            std::cout << "    [advisory] I > 0.5 mol/kg -- the exchange "
                         "equilibrium here is INDICATIVE (Davies beyond its "
                         "trust range)\n";
    }

    // isotherm diag/CSV (loaded eq-fraction beta_s vs solution eq-fraction of
    // each exchangeable cation) -- the GUI plots this.
    {
        const std::string base = dict->subDict("output")->lookupWord("file");
        const std::string iso = base.substr(0, base.find_last_of('.')) + "_isotherm.csv";
        std::ofstream icsv(iso);
        if (icsv.is_open())
        {
            // solution equivalent fractions over the exchangeable cations present
            double eqTot = 0.0;
            struct Row { std::string sp, ion; double zion; };
            std::vector<Row> rows = {
                {"NaX","Na",1}, {"KX","K",1}, {"CaX2","Ca",2},
                {"MgX2","Mg",2}, {"SrX2","Sr",2}, {"BaX2","Ba",2} };
            for (const auto& r : rows)
                if (aqOut(r.ion) > 0.0) eqTot += r.zion * aqOut(r.ion);
            icsv << "species,beta_resin,Esol_solution\n";
            icsv << std::scientific << std::setprecision(8);
            for (const auto& r : rows)
                if (res.beta.count(r.sp))
                {
                    const double Esol = eqTot > 0.0 ? r.zion * aqOut(r.ion) / eqTot : 0.0;
                    icsv << r.sp << "," << res.beta.at(r.sp) << "," << Esol << "\n";
                }
        }
    }

    if (verbosity >= 2)
        std::cout << "exchange: " << res.rows.size() << " species -> "
                  << dict->subDict("output")->lookupWord("file")
                  << " (softened effluent), hardness removal "
                  << std::fixed << std::setprecision(1)
                  << diag_["hardness_removal_pct"] << "%\n" << std::defaultfloat;
    return 0;
}

} // namespace Choupo
