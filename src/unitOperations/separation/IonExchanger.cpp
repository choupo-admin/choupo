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

#include "IonExchanger.H"

#include "core/Advisory.H"
#include "propertyOps/Exchange.H"                     // propertyOps::readExchange
#include "thermo/electrolyte/SaltFromCatalogue.H"     // findIon, ionMW
#include "thermo/electrolyte/SpeciationSolver.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <variant>

namespace Choupo {

namespace {

constexpr scalar MW_WATER_KG = 0.0180153;     // kg/mol (for the molality closure)

// CaCO3-equivalent hardness [mg/L as CaCO3] from Ca + Mg molalities (mol/kg ~
// mol/L at rho ~ 1).  Shared definition with the Exchange beaker op.
scalar hardnessAsCaCO3(scalar m_Ca, scalar m_Mg)
{
    return (m_Ca + m_Mg) * 100.09 * 1000.0;       // mg/L as CaCO3
}

} // anonymous namespace

int IonExchanger::solve(const DictPtr& dict,
                        const ThermoPackage& thermo,
                        int verbosity)
{
    const std::size_t Ncomp = thermo.n();

    // ---- Inlet stream (Flowsheet feed/composition deposit; same as the
    //      spiralWoundModule sibling) -------------------------------------
    auto feedDict = dict->subDict("feed");
    const scalar F_in = feedDict->lookupScalar("F", Dims::molarFlow);   // kmol/s
    const scalar T_in = feedDict->lookupScalar("T", Dims::temperature); // K
    const scalar P_in = feedDict->lookupScalar("P", Dims::pressure);    // Pa
    auto zDict = dict->subDict("composition");
    sVector z_in(Ncomp, 0.0);
    scalar zSum = 0.0;
    for (const auto& key : zDict->keys())
    {
        const std::size_t i = thermo.indexOf(key);
        z_in[i] = zDict->lookupScalar(key);
        zSum   += z_in[i];
    }
    if (std::abs(zSum - 1.0) > 1.0e-6)
        throw std::runtime_error("ionExchanger: feed composition does not sum "
            "to 1 (Sigma z = " + std::to_string(zSum) + ")");

    const std::size_t iWater = thermo.indexOf("water");        // loud if absent
    const scalar z_water = z_in[iWater];
    if (z_water <= 0.0)
        throw std::runtime_error("ionExchanger: the feed has no water -- a "
            "softener needs an aqueous carrier (water as a component)");

    // ---- operation{} : HARDWARE in -------------------------------------
    auto opDict = dict->subDict("operation");
    for (const auto& k : opDict->keys())
    {
        // REFUSE result-named keys: a target hardness / removal / leakage is an
        // OUTPUT, hence an outer-driver (sweep / optimisation) job, not a
        // hardware spec.  Rotating-equipment honesty for the softener.
        if (k == "removal" || k == "fraction" || k == "hardness"
         || k == "targetHardness" || k == "leakage" || k == "removalTarget")
            throw std::runtime_error("ionExchanger operation{}: '" + k + "' is "
                "a RESULT, not a hardware spec -- a softener takes resin + CEC "
                "(+ optional bedVolume); the effluent hardness / removal is what "
                "it COMPUTES.  To hit a target hardness, vary the hardware with "
                "an outer driver (sweep / optimisation), don't name the output.");
        if (k != "resin" && k != "CEC" && k != "bedVolume" && k != "pH")
            throw std::runtime_error("ionExchanger operation{}: unknown key '" + k
                + "'.  Grammar: resin <name>; (required) CEC <value> "
                  "<eq/L|eq/kg|mol/kg|mol/L>; (optional, defaults from the resin "
                  ".dat) bedVolume <value> m3; (optional) pH <number|solve>;");
    }

    // ---- Build the SpeciationInput from the INLET stream ---------------
    // totals [mol/kg water] from the inlet mole fractions: for component i,
    //   m_i = (z_i / z_water) / MW_water[kg/mol].
    electrolyte::SpeciationInput in;
    const scalar molesWaterPerKg = 1.0 / MW_WATER_KG;          // mol H2O / kg
    for (std::size_t i = 0; i < Ncomp; ++i)
    {
        if (i == iWater) continue;
        if (z_in[i] <= 0.0) continue;
        const std::string nm = thermo.comp(i).name();
        if (!electrolyte::findAqueousSpecies(nm))
            throw std::runtime_error("ionExchanger: component '" + nm + "' has "
                "no row in ions.dat -- the softener needs an IONIC water "
                "analysis (master ions Ca, Mg, Na, K, Cl, SO4, HCO3, ... + "
                "water, with the electrolyte catalogue in constant/electrolyte/).");
        in.totals[nm] = (z_in[i] / z_water) * molesWaterPerKg;   // mol/kg water
    }
    if (in.totals.empty())
        throw std::runtime_error("ionExchanger: the inlet carries no ions -- a "
            "softener needs a water analysis to soften");

    // pH: a number (given) or the word `solve` (electroneutrality closure).
    bool solvePH = true;
    {
        const EntryValue& pH = opDict->entryValue("pH");
        if (std::holds_alternative<std::string>(pH))
        {
            const auto& w = std::get<std::string>(pH);
            if (w != "solve")
                throw std::runtime_error("ionExchanger operation{}: pH must be a "
                    "number (given) or the word `solve` -- got '" + w + "'");
            solvePH = true;
        }
        else { solvePH = false; in.pH = opDict->lookupScalar("pH"); }
    }
    in.solvePH = solvePH;
    in.T       = T_in;

    // ---- Exchange spec : reuse the SAME reader as the beaker op ---------
    // readExchange wants an `exchange { resin ...; [CEC ...;] }` sub-dict; map
    // the operation{} hardware keys onto it so the resin resolution, CEC basis
    // conversion, network load and refusals are NOT duplicated here.
    auto exDict = std::make_shared<Dictionary>("exchange");
    if (!opDict->found("resin"))
        throw std::runtime_error("ionExchanger operation{}: needs `resin "
            "<name>;` (resolved by exact name in constant/electrolyte/resins/ "
            "or data/standards/assets/)");
    exDict->insert("resin", opDict->entryValue("resin"));
    if (opDict->found("CEC"))
    {
        exDict->insert("CEC", opDict->entryValue("CEC"));
        // carry the dimension metadata across (it lives per-key on the Dictionary,
        // not on the EntryValue) so readExchange's basis check sees the unit.
        if (opDict->hasDimensions("CEC"))
            exDict->setDimensions("CEC", opDict->dimensionsOf("CEC"));
    }
    auto wrap = std::make_shared<Dictionary>(dict->name());
    wrap->insert("exchange", exDict);

    // Optional aqueous-activity-model selection (default Davies, the only S1
    // builtin; an unknown name is refused with the available list).
    electrolyte::SpeciationSolver solver(opDict->lookupWordOrDefault("activityModel", "davies"));
    propertyOps::readExchange(wrap, in, solver, verbosity);

    // bedVolume : optional HARDWARE, the per-litre CEC nameplate then has a
    // physical resin-in-service.  v1 keeps the CEC eq/kg-water basis (the
    // limiting-effluent equilibrium does not depend on the absolute bed size);
    // we announce the basis so the student sees what is (and is not) used.
    scalar bedVolume = 0.0;
    if (opDict->found("bedVolume"))
    {
        bedVolume = opDict->lookupScalar("bedVolume", Dims::volume);   // m3
        if (verbosity >= 2)
            std::cout << "  [spec] bedVolume " << bedVolume << " m3 of resin in "
                         "service -- the limiting-effluent equilibrium uses the "
                         "CEC per kg water (announced above); the absolute bed "
                         "size sets cycle length / breakthrough, which are "
                         "TRANSIENT and not modelled here\n";
    }

    // ---- The MANDATORY honesty banner (shared with the Exchange beaker op,
    //      so the teaching never diverges) -------------------------------
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
    AdvisoryLog::instance().add("exchange", "info", "ionExchanger", banner);
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

    // ---- Build the `softened` effluent ProcessStream -------------------
    // Cations exchange (aqAfter); anions + water are conserved.  Rebuild the
    // per-component molality, then back to mole fractions against the same
    // water basis.  Electroneutral by construction (the kernel enforced it).
    auto aqOut = [&](const std::string& ion) {
        return res.aqAfter.count(ion) ? res.aqAfter.at(ion) : 0.0; };
    auto aqIn  = [&](const std::string& ion) {
        return res.aqBefore.count(ion) ? res.aqBefore.at(ion) : 0.0; };

    out_.clear();
    {
        // moles per kg water for each component (water itself = molesWaterPerKg)
        std::vector<scalar> molesPerKg(Ncomp, 0.0);
        molesPerKg[iWater] = molesWaterPerKg;
        scalar nTot = molesWaterPerKg;
        for (std::size_t i = 0; i < Ncomp; ++i)
        {
            if (i == iWater) continue;
            const std::string nm = thermo.comp(i).name();
            // cations the network touches use the post-exchange total; everything
            // else (anions, non-exchanged cations) keeps its inlet molality.
            scalar m = (z_in[i] / z_water) * molesWaterPerKg;     // inlet molality
            if (res.aqAfter.count(nm)) m = aqOut(nm);             // exchanged cation
            molesPerKg[i] = std::max<scalar>(m, 0.0);
            nTot += molesPerKg[i];
        }

        ProcessStream sft;
        sft.name = "softened";
        sft.T  = T_in;        // thermal-neutral v1: T held (announced below)
        sft.P  = P_in;
        sft.vf = 0.0;         // a softened water is liquid
        sft.z.assign(Ncomp, 0.0);
        for (std::size_t i = 0; i < Ncomp; ++i)
            sft.z[i] = (nTot > 0.0) ? molesPerKg[i] / nTot : 0.0;
        // Total molar flow: the water mole flow is conserved (water does not
        // exchange); F_water = F_in * z_water_in, and F_out = F_water / x_water.
        const scalar F_water = F_in * z_water;
        sft.F = (sft.z[iWater] > 0.0) ? F_water / sft.z[iWater] : F_in;
        out_.push_back(std::move(sft));
    }

    // ---- KPIs ----------------------------------------------------------
    kpis_.clear();
    const scalar hIn  = hardnessAsCaCO3(aqIn("Ca"),  aqIn("Mg"));
    const scalar hOut = hardnessAsCaCO3(aqOut("Ca"), aqOut("Mg"));
    kpis_["hardness_in_mgL_CaCO3"]  = hIn;
    kpis_["hardness_out_mgL_CaCO3"] = hOut;
    kpis_["hardness_removal_pct"]   = hIn > 0.0 ? 100.0 * (hIn - hOut) / hIn : 0.0;

    const scalar mwCa = electrolyte::ionMW("Ca");
    const scalar mwMg = electrolyte::ionMW("Mg");
    const scalar mwNa = electrolyte::ionMW("Na");
    kpis_["Ca_leakage_mgL"] = aqOut("Ca") * mwCa * 1000.0;
    kpis_["Mg_leakage_mgL"] = aqOut("Mg") * mwMg * 1000.0;

    const scalar naAdded = aqOut("Na") - aqIn("Na");      // mol/kg (>0)
    kpis_["Na_added_mgL"]  = naAdded * mwNa * 1000.0;
    kpis_["Na_added_meqL"] = naAdded * 1.0e3;             // Na monovalent: meq = mmol

    auto beta = [&](const std::string& sp) {
        return res.beta.count(sp) ? res.beta.at(sp) : 0.0; };
    kpis_["resin_loading_beta_Ca"] = beta("CaX2");
    kpis_["resin_loading_beta_Mg"] = beta("MgX2");
    kpis_["resin_loading_beta_Na"] = beta("NaX");
    kpis_["CEC_utilised_pct"]      = res.cecUtilisedPct;
    kpis_["I"]  = res.I;
    kpis_["pH"] = res.pH;
    if (bedVolume > 0.0) kpis_["bedVolume_m3"] = bedVolume;

    // Heat of exchange dH : reported but NOT applied to T (thermal-neutral v1).
    // Sum nu * dH over the cations that LOADED onto the resin (eq-for-eq with Na
    // release); a per-pass indicative figure, the T hold is announced.
    scalar dH_total = 0.0;
    for (const auto& r : in.exchange.network)
        if (r.hasDH && res.bound.count(r.species))
            dH_total += r.dH * res.bound.at(r.species);    // J/mol-w * mol/kg ~ J/kg w
    kpis_["dH_exchange_Jkgw"] = dH_total;

    if (verbosity >= 2)
    {
        std::cout << "\n=========================  Ion-exchange softener  ===\n"
                  << "  Resin:           " << in.exchange.resin
                  << "  (Gaines-Thomas, CEC " << std::scientific
                  << std::setprecision(3) << in.exchange.CEC << " eq/kg water)\n"
                  << std::defaultfloat
                  << "  Hardness:        " << std::fixed << std::setprecision(1)
                  << hIn << " -> " << hOut << " mg/L as CaCO3  (removal "
                  << std::setprecision(2) << kpis_["hardness_removal_pct"]
                  << "%)\n"
                  << "  Leakage:         Ca " << std::setprecision(3)
                  << kpis_["Ca_leakage_mgL"] << " mg/L, Mg "
                  << kpis_["Mg_leakage_mgL"] << " mg/L\n"
                  << "  Na added:        " << std::setprecision(2)
                  << kpis_["Na_added_meqL"] << " meq/L (" << kpis_["Na_added_mgL"]
                  << " mg/L) -- the salt penalty\n"
                  << "  Resin loading:   beta(CaX2) " << std::setprecision(4)
                  << kpis_["resin_loading_beta_Ca"] << ", beta(MgX2) "
                  << kpis_["resin_loading_beta_Mg"] << ", beta(NaX) "
                  << kpis_["resin_loading_beta_Na"] << "  (CEC utilised "
                  << std::setprecision(1) << kpis_["CEC_utilised_pct"] << "%)\n"
                  << "  Heat of exch.:   " << std::scientific << std::setprecision(3)
                  << dH_total << " J/kg water -- T HELD at " << std::fixed
                  << std::setprecision(2) << T_in << " K (thermal-neutral v1; "
                  << "the dH is a KPI, not applied to the stream)\n"
                  << std::defaultfloat
                  << "=====================================================\n\n";
    }

    return 0;
}

} // namespace Choupo
