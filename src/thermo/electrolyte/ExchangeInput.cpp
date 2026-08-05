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

#include "thermo/electrolyte/ExchangeInput.H"

#include "core/Dimensions.H"
#include "thermo/Database.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"   // electrolytePaths, ionMW

#include <filesystem>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace fs = std::filesystem;

namespace Choupo {
namespace electrolyte {

namespace {

// Resolve a resin .dat BY EXACT NAME (case-local constant/electrolyte/resins/
// first, then the flat data/standards/assets/ home) -- the same noun pattern as
// materials/ and membranes/.  Returns an empty path if not found.
fs::path resinPath(const std::string& name)
{
    // case-local (constant/electrolyte/resins/) reuse the electrolytePaths walk,
    // then the resin ASSET (kind ionExchangeResin; resins are an engineering
    // asset; the electrolyte/resins/ folder is gone).  ONE resolver (sealing
    // redesign): the mirrored constant/assets/<name>.dat is the case-local tier,
    // else the standards catalogue -- a SEALED case reads its own mirror ONLY
    // (resolveRecord returns empty when sealed + absent, and the caller refuses
    // loudly with the available list).
    for (const auto& base : electrolyte::electrolytePaths(std::string("resins/") + name + ".dat"))
        if (fs::exists(base)) return base;
    const fs::path st = records::resolveRecord("assets/" + name + ".dat");
    if (!st.empty() && fs::exists(st)) return st;
    return {};
}

// The resin loading the SOLVER consumes is X_total [eq / kg WATER] -- and a
// vendor CEC is quoted per litre of BED (or per kg of DRY resin), NEVER per
// litre of solution: converting eq/L_bed to eq/kg_water through rho(water)~1
// was dimensionally invalid (the Codex membrane08 audit, P0).  The honest
// contract (2026-07-18):
//     nameplate  (the ASSET's):  CEC [eq/L bed]  and/or  CEC_dry [eq/kg dry]
//     contact    (the OP's)   :  resinDose [L bed / kg water]  XOR
//                                resinDose [kg dry / kg water]
//     derived (announced)     :  X_total = CEC * resinDose   [eq/kg water]
// A bed-basis capacity WITHOUT a declared dose REFUSES -- the dose is the
// author's owned assumption, visible, never a hidden rho~1 shortcut.
double resinLoadingEqPerKgWater(const DictPtr& op, const DictPtr& resinRec,
                                const std::string& resinName,
                                std::string& basisNote)
{
    if (op->found("CEC"))
        throw std::runtime_error("exchange: `CEC` does not belong in the"
            " operation -- the capacity NAMEPLATE lives in the resin asset ("
            + resinName + ".dat: CEC [eq/L bed], CEC_dry [eq/kg dry]); the"
            " operation declares the CONTACT: `resinDose <v> L/kg;` (bed"
            " volume per kg water) or `resinDose <v> kg/kg;` (dry resin per"
            " kg water).");
    if (!op->found("resinDose"))
        throw std::runtime_error("exchange: a bed-basis capacity needs the"
            " contact loading -- declare `resinDose <v> L/kg;` (litres of"
            " settled bed per kg of water) or `resinDose <v> kg/kg;` (kg dry"
            " resin per kg water).  eq/L of RESIN BED is not eq/L of solution;"
            " no rho~1 shortcut is taken for you.");
    if (!op->hasDimensions("resinDose"))
        throw std::runtime_error("exchange: resinDose needs its unit --"
            " `resinDose 1.0 L/kg;` or `resinDose 0.5 kg/kg;` (bare numbers"
            " refused: the dose must declare its basis).");

    const Dimensions doseDims = op->dimensionsOf("resinDose");
    const double dose = op->lookupScalar("resinDose");     // canonical SI

    if (doseDims == Dims::specificVolume)                  // m^3 bed / kg water
    {
        if (!resinRec->found("CEC"))
            throw std::runtime_error("exchange: resinDose is volumetric"
                " (L bed/kg water) but resin " + resinName + ".dat carries no"
                " volumetric nameplate `CEC <v> eq/L;` -- curate it, or use a"
                " mass dose against CEC_dry.");
        const double cec = resinRec->lookupScalar("CEC");  // kmol/m^3 (== eq/L)
        const double x = cec * dose * 1.0e3;               // -> eq/kg water
        std::ostringstream os;
        os << "X_total = CEC (" << cec << " eq/L bed, " << resinName
           << ".dat nameplate) x resinDose (" << dose * 1.0e3
           << " L bed/kg water) = " << x << " eq/kg water";
        basisNote = os.str();
        return x;
    }
    if (doseDims == Dims::dimensionless)                   // kg dry / kg water
    {
        if (!resinRec->found("CEC_dry"))
            throw std::runtime_error("exchange: resinDose is a mass ratio"
                " (kg dry/kg water) but resin " + resinName + ".dat carries no"
                " `CEC_dry <v> eq/kg;` nameplate -- curate it, or use a"
                " volumetric dose against CEC.");
        const double cecDry = resinRec->lookupScalar("CEC_dry"); // kmol/kg
        const double x = cecDry * 1.0e3 * dose;                  // eq/kg water
        std::ostringstream os;
        os << "X_total = CEC_dry (" << cecDry * 1.0e3 << " eq/kg dry, "
           << resinName << ".dat nameplate) x resinDose (" << dose
           << " kg dry/kg water) = " << x << " eq/kg water";
        basisNote = os.str();
        return x;
    }
    throw std::runtime_error("exchange: resinDose unit is "
        + doseDims.toPretty() + " -- expected L/kg (bed volume per kg water)"
        " or kg/kg (dry resin per kg water).");
}

} // anonymous namespace

void readExchange(const DictPtr& dict, electrolyte::SpeciationInput& in,
                  const electrolyte::SpeciationSolver& solver, int verbosity)
{
    if (!dict->found("exchange"))
        throw std::runtime_error("exchange: the `exchange { resin <name>; "
            "resinDose ...; }` block is required for an exchange op");
    auto ex = dict->subDict("exchange");
    for (const auto& k : ex->keys())
        if (k != "resin" && k != "resinDose" && k != "CEC")
            throw std::runtime_error("exchange{}: unknown key '" + k
                + "'.  Grammar: `resin <name>;` (required) and `resinDose "
                  "<value> <L/kg|kg/kg>;` (required -- the contact loading;"
                  " the capacity nameplate lives in the resin .dat).");
    if (!ex->found("resin"))
        throw std::runtime_error("exchange{}: needs `resin <name>;` (the resin "
            "is resolved by exact name in constant/electrolyte/resins/ or "
            "data/standards/assets/)");

    const std::string resin = ex->lookupWord("resin");
    fs::path rp = resinPath(resin);
    if (rp.empty())
    {
        // list what IS available (standards + case-local) for the refusal
        std::string avail;
        fs::path stdResins = fs::path(Database::currentRoot())
                           / "standards" / "assets";
        if (fs::exists(stdResins))
            for (const auto& e : fs::directory_iterator(stdResins))
                if (e.path().extension() == ".dat")
                    avail += " " + e.path().stem().string();
        throw std::runtime_error("exchange: resin '" + resin + "' not found in "
            "constant/electrolyte/resins/ (case) or data/standards/assets/"
            "resins/.  Available:" + (avail.empty() ? " (none)" : avail));
    }
    auto rd = Dictionary::fromFile(rp.string());

    in.exchange.resin     = resin;
    in.exchange.exchanger = rd->lookupWordOrDefault("exchanger", "X");
    in.exchange.form      = rd->lookupWordOrDefault("form", "");   // e.g. Na

    // The solver's X_total [eq/kg water] is DERIVED: the asset's nameplate
    // capacity x the operation's declared contact dose -- the whole
    // arithmetic rides in the announce (no hidden rho~1 shortcut).
    std::string basisNote;
    in.exchange.CEC = resinLoadingEqPerKgWater(ex, rd, resin, basisNote);
    in.exchange.cecBasisNote = basisNote;

    // load the half-reaction network (case overlay first, then standards)
    in.exchange.network = solver.loadExchangeNetwork();
    if (in.exchange.network.empty())
        throw std::runtime_error("exchange: exchange.dat carries no "
            "half-reactions -- the network is empty");

    // refuse a bound species whose aqueous cation the analysis lacks, naming it
    // (only those cations actually present can exchange; absent ones are simply
    // off, but a resin whose form ion is absent gets flagged for the student).
    bool anyPresent = false;
    for (const auto& r : in.exchange.network)
        if (in.totals.count(SpeciesId(r.ion)) && in.totals.at(SpeciesId(r.ion)) > 0.0)
            anyPresent = true;
    if (!anyPresent)
        throw std::runtime_error("exchange: none of the exchange.dat cations ("
            "Na, K, Ca, Mg, ...) is present in the water analysis -- there is "
            "nothing to exchange.  Add the relevant cation totals.");

    if (verbosity >= 2)
        std::cout << "exchange: resin " << resin << " (exchanger "
                  << in.exchange.exchanger << "), CEC = " << std::scientific
                  << std::setprecision(4) << in.exchange.CEC << " eq/kg water  ("
                  << basisNote << ")\n" << std::defaultfloat;
}

} // namespace electrolyte
} // namespace Choupo
