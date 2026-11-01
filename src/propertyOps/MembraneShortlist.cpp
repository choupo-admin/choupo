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

#include "MembraneShortlist.H"

#include "core/Constants.H"
#include "core/Dimensions.H"
#include "thermo/ThermoPackage.H"
#include "thermo/membrane/Membrane.H"
#include "thermo/membrane/MembraneModule.H"
#include "thermo/membrane/MembraneModuleRegistry.H"
#include "thermo/membrane/MembraneRegistry.H"
#include "unitOperations/membrane/RatedTestInversion.H"
#include "unitOperations/membrane/massTransfer/MassTransferModel.H"
#include "unitOperations/membrane/osmotic/OsmoticModel.H"
#include "unitOperations/membrane/pressureDrop/PressureDropModel.H"

#include <cctype>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <iostream>
#include <limits>
#include <memory>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

namespace {

const scalar NaN = std::numeric_limits<scalar>::quiet_NaN();

std::string fmt(scalar v, const char* f = "%.6g")
{
    char b[64];
    std::snprintf(b, sizeof(b), f, static_cast<double>(v));
    return b;
}

//  One candidate's row: everything the shortlist publishes, side by side.
//  Margins are (limit - value)/limit, NaN where the record states no limit.
struct Row
{
    std::string name;
    std::string reason;          // empty = passes every hard filter
    bool        rated = false;   // the re-rating ran (numbers below are set)
    scalar R_int = NaN, R_obs = NaN, recovery = NaN;
    scalar A_w_LMH = NaN, A_w_record_LMH = NaN;   // L/m2/h/bar: derived from the sheet / the record's
    scalar permeate_m3d = NaN, feed_m3h = NaN, flux_LMH = NaN;
    scalar permeateConc_ppm = NaN, dP_bar = NaN;
    scalar specificPressure = NaN, specificEnergy = NaN;
    scalar mP = NaN, mT = NaN, mdP = NaN, mFeed = NaN, mPH = NaN;
};

void addReason(Row& r, const std::string& why)
{
    r.reason += (r.reason.empty() ? "" : "; ") + why;
}

} // namespace

std::string MembraneShortlist::diagnosticUnit(const std::string& key) const
{
    const auto dot = key.rfind("__");
    const std::string k = dot == std::string::npos ? key : key.substr(dot + 2);
    if (k == "permeateFlow_m3d")               return "m3/d";
    if (k == "feedFlow_m3h")                   return "m3/h";
    if (k == "flux_LMH")                       return "L/m2/h";
    if (k == "permeateConc_ppm")               return "ppm";
    if (k == "dP_bar")                         return "bar";
    if (k == "A_w_LMH_per_bar")                return "L/m2/h/bar";
    if (k == "specificPressure_bar_per_LMH")   return "bar/(L/m2/h)";
    if (k == "specificEnergy_kWh_m3")          return "kWh/m3";
    return "-";
}

int MembraneShortlist::run(const DictPtr& dict, const ThermoPackage& thermo,
                           int verbosity)
{
    diag_.clear();
    const std::string opName = dict->name().empty() ? type() : dict->name();
    const std::string site   = "membraneShortlist '" + opName + "'";

    //  The film / drop / osmotic sub-model factories the module reads
    //  (idempotent; choupoProps does not run UnitOperation::registerBuiltins).
    MassTransferModel::registerBuiltins();
    PressureDropModel::registerBuiltins();
    OsmoticModel    ::registerBuiltins();

    // ---- the request ---------------------------------------------------------
    if (!dict->found("class") || !dict->found("solute")
     || !dict->found("conditions") || !dict->found("operation"))
        throw std::runtime_error(site + ": declare `class <name>;` (a kind"
            " membraneClass), `solute <component>;`, `conditions { T; P;"
            " pressureBasis; recovery; feedMassFraction; }` and `operation {"
            " ... }` (the film, pressure-drop and polarisation blocks and"
            " P_permeate, as a spiralWoundModule unit writes them).");
    const std::string className = dict->lookupWord("class");
    const std::string solute    = dict->lookupWord("solute");
    const MembraneModule& cls   = MembraneModuleRegistry::byName(className);
    if (!cls.isFunctionalClass())
        throw std::runtime_error(site + ": `class " + className + ";` names a"
            " commercial module, not a functional class (`kind"
            " membraneClass`).  The shortlist goes FROM a class to products.");
    const auto bandIt = cls.rejectionBands().find(solute);
    if (bandIt == cls.rejectionBands().end())
        throw std::runtime_error(site + ": the class " + className + " does"
            " not rate " + solute + " (no band for it) -- a class says"
            " nothing about a salt it does not rate.");
    bool known = false;
    for (std::size_t i = 0; i < thermo.n(); ++i)
        if (thermo.comp(i).name() == solute) known = true;
    if (!known)
        throw std::runtime_error(site + ": " + solute + " is not a component"
            " of this case's thermoPhysPropDict.");
    const std::string clsKind = MembraneRegistry::byName(className).kind();

    const DictPtr cond = dict->subDict("conditions");
    for (const char* k : { "T", "P", "pressureBasis", "recovery", "feedMassFraction" })
        if (!cond->found(k))
            throw std::runtime_error(site + ": conditions {} declares no `"
                + std::string(k) + "` -- nothing is defaulted in a comparison.");
    const scalar T  = cond->lookupScalar("T", Dims::temperature);
    scalar P        = cond->lookupScalar("P", Dims::pressure);
    const std::string basis = cond->lookupWord("pressureBasis");
    if (basis == "feedGauge")         P += constant::P_normal;
    else if (basis != "feedAbsolute")
        throw std::runtime_error(site + ": `pressureBasis " + basis + ";` --"
            " accepted: feedAbsolute, feedGauge.");
    const scalar recTarget = cond->lookupScalar("recovery");
    const scalar w         = cond->lookupScalar("feedMassFraction");
    if (!(recTarget > 0.0 && recTarget < 1.0) || !(w > 0.0 && w < 1.0))
        throw std::runtime_error(site + ": recovery and feedMassFraction must"
            " lie in (0, 1).");
    const bool   hasPH = cond->found("pH");
    const scalar pH    = hasPH ? cond->lookupScalar("pH") : NaN;
    //  WHICH TIERS OF THE CATALOGUE are candidates.  Absent: every tier the
    //  registry read, data/local included (what a student with an imported
    //  catalogue wants); declared: only those -- a witness whose golden must
    //  not depend on one machine's private records declares
    //  `tiers ( standards case );`.  The choice is printed either way.
    std::vector<std::string> tiers;
    if (dict->found("tiers"))
    {
        tiers = dict->lookupWordList("tiers");
        for (const auto& t : tiers)
            if (t != "standards" && t != "case" && t != "local")
                throw std::runtime_error(site + ": `tiers` accepts standards,"
                    " case, local -- not '" + t + "'.");
    }
    else tiers = { "standards", "case", "local" };
    //  The membrane an element is wound with, when its record names none (an
    //  imported element states no transport parameters -- bin/choupo-import-
    //  membranes).  The carrier supplies the membrane TYPE (NF | RO) and the
    //  water permeance the search starts from; the permeance itself is then
    //  derived from the record's own rated test, so the carrier's number
    //  does not reach the answer.  Absent, such an element is excluded.
    const std::string carrier = dict->lookupWordOrDefault("carrier", "");
    const DictPtr tmpl = dict->subDict("operation");
    if (!tmpl->found("P_permeate"))
        throw std::runtime_error(site + ": operation {} declares no"
            " `P_permeate` (the module reads it).");

    if (verbosity >= 1)
    {
        std::cout << "\n  [" << opName << "] membrane shortlist for class "
                  << className << " (" << clsKind << "), " << solute << " at "
                  << fmt(w * 1e6, "%.0f") << " ppm, " << fmt(P * 1e-5, "%.4g")
                  << " bar absolute feed, " << fmt(T, "%.2f") << " K, element"
                  << " recovery " << fmt(recTarget * 100.0, "%.4g")
                  << " %, tiers (";
        for (const auto& t : tiers) std::cout << " " << t;
        std::cout << " )\n  Hard filters, then each survivor re-rated at THESE"
                  << " conditions; listed in alphabetical order; no score, no"
                  << " weight, no rank.\n";
    }

    // ---- the candidates: every registered commercial module, by name --------
    std::vector<Row> rows;
    for (const std::string& name : MembraneModuleRegistry::availableNames())
    {
        {
            const std::string tier = MembraneModuleRegistry::tierOf(name);
            bool inTiers = false;
            for (const auto& t : tiers) if (t == tier) inTiers = true;
            if (!inTiers) continue;                // not a candidate of this request
        }
        const MembraneModule& rec = MembraneModuleRegistry::byName(name);
        if (rec.isFunctionalClass()) continue;     // a class is not a product
        Row r;
        r.name = name;

        // (1) the hard filters on the record alone -------------------------
        if (rec.format() != "spiralWound")
            addReason(r, "a " + rec.format() + ", not a spiral element (the"
                " shortlist rates one spiral element)");
        const std::string wound = rec.membrane().empty() ? carrier : rec.membrane();
        if (rec.format() != "spiralWound") {}
        else if (wound.empty())
            addReason(r, "names no membrane and the op declares no `carrier`");
        else
        {
            try
            {
                const std::string kind = MembraneRegistry::byName(wound).kind();
                if (kind != clsKind)
                    addReason(r, "membrane '" + wound + "' is " + kind
                        + ", the class is " + clsKind);
            }
            catch (const std::exception&)
            {
                addReason(r, "membrane '" + wound + "' is not registered");
            }
        }
        std::vector<const RatedTest*> ofSolute;
        for (const auto& t : rec.ratedTests())
            if (t.solute == solute) ofSolute.push_back(&t);
        if (ofSolute.empty())
            addReason(r, "no rated test of " + solute);
        else if (ofSolute.size() > 1)
            addReason(r, std::to_string(ofSolute.size()) + " rated tests of "
                + solute + " (different operating points, never averaged)");
        else if (ofSolute.front()->isRange())
            addReason(r, "rated rejection of " + solute + " is a range");
        for (const auto& t : rec.ratedTests())
        {
            const auto b = cls.rejectionBands().find(t.solute);
            if (b == cls.rejectionBands().end() || t.isRange()) continue;
            if (t.rejection < b->second.min || t.rejection > b->second.max)
                addReason(r, t.solute + " rated " + fmt(t.rejection * 100.0, "%.4g")
                    + " % is outside the class band " + fmt(b->second.min * 100.0, "%.4g")
                    + "-" + fmt(b->second.max * 100.0, "%.4g") + " %");
        }
        const ModuleLimits& lim = rec.limits();
        if (lim.hasP_max)
        {
            r.mP = (lim.P_max - P) / lim.P_max;
            if (P > lim.P_max)
                addReason(r, "feed " + fmt(P * 1e-5, "%.4g") + " bar > P_max "
                    + fmt(lim.P_max * 1e-5, "%.4g") + " bar");
        }
        if (lim.hasT_max)
        {
            r.mT = (lim.T_max - T) / lim.T_max;
            if (T > lim.T_max)
                addReason(r, "T " + fmt(T, "%.2f") + " K > T_max "
                    + fmt(lim.T_max, "%.2f") + " K");
        }
        if (lim.hasPH && hasPH)
        {
            r.mPH = std::min(pH - lim.pH_min, lim.pH_max - pH);
            if (r.mPH < 0.0)
                addReason(r, "pH " + fmt(pH, "%.3g") + " outside "
                    + fmt(lim.pH_min, "%.3g") + "-" + fmt(lim.pH_max, "%.3g"));
        }
        if (!r.reason.empty()) { rows.push_back(std::move(r)); continue; }

        // (2) the re-rating at the student's conditions --------------------
        try
        {
            auto unit = std::make_shared<Dictionary>("shortlist:" + name);
            unit->insert("feed", std::make_shared<Dictionary>("feed"));
            DictPtr op = tmpl->deepCopy();
            for (const char* k : { "module", "membrane", "transport",
                                   "transportParameters", "elements", "vessels" })
                op->erase(k);
            op->insert("module", EntryValue(name));
            if (rec.membrane().empty())
                op->insert("membrane", EntryValue(carrier));
            op->insert("transport", EntryValue(std::string("constantRejection")));
            auto tp  = std::make_shared<Dictionary>("transportParameters");
            auto rej = std::make_shared<Dictionary>("rejection");
            rej->insert(solute, EntryValue(std::string("fromRatedTest")));
            tp->insert("rejection", rej);
            tp->insert("source", EntryValue(std::string(
                "DERIVED: the shortlist inverts this record's rated test")));
            op->insert("transportParameters", tp);
            unit->insert("operation", op);

            const std::string label = "shortlist " + name;
            //  THE SHEET'S PERMEATE AS WELL AS ITS REJECTION: the membrane
            //  record's A_w is a teaching fit to another case, the sheet's
            //  permeate at its rated test measures THIS element; both are
            //  derived from the record's own test (deriveWaterPermeance) and
            //  the re-rating at the student's conditions uses them.
            const std::string wound = rec.membrane().empty() ? carrier : rec.membrane();
            const auto dw = membrane::deriveWaterPermeance(unit, thermo, rec,
                MembraneRegistry::byName(wound).A_w(), solute, "", label);
            const auto& inv = dw.inv;
            const RatedTest& rt = *ofSolute.front();

            auto at = [&](scalar Q) {
                return membrane::runModuleAt(unit, thermo, rec, solute,
                    inv.R_int, w, Q, T, P, label, "shortlist probe", dw.A_w);
            };
            //  The feed flow that gives the student's recovery: recovery falls
            //  as the feed flow rises, so bracket from the sheet's own feed
            //  and bisect in log Q (the module is the function).
            scalar Qlo = rt.permeateFlow / rt.recovery, Qhi = Qlo;
            auto g = [&](scalar Q) { return at(Q).recovery - recTarget; };
            if (g(Qlo) > 0.0)
            {
                int k = 0;
                for (Qhi = Qlo; g(Qhi) > 0.0; Qhi *= 2.0)
                    if (++k > 40) throw std::runtime_error("the recovery "
                        + fmt(recTarget * 100.0, "%.4g") + " % is not bracketed"
                        " from above");
                Qlo = Qhi / 2.0;
            }
            else
            {
                int k = 0;
                for (Qlo = Qhi; g(Qlo) <= 0.0; Qlo *= 0.5)
                    if (++k > 40) throw std::runtime_error("no permeate reaches"
                        " the recovery " + fmt(recTarget * 100.0, "%.4g")
                        + " % at this pressure (osmotic limit or no flux)");
                Qhi = Qlo * 2.0;
            }
            membrane::ModuleAtConditions m;
            for (int it = 0; it < 80; ++it)
            {
                const scalar Q = std::sqrt(Qlo * Qhi);
                m = at(Q);
                const scalar d = m.recovery - recTarget;
                if (std::abs(d) < 1.0e-9) { Qlo = Qhi = Q; break; }
                if (d > 0.0) Qlo = Q; else Qhi = Q;
                if (it == 79) throw std::runtime_error("the feed-flow solve for"
                    " the student's recovery did not converge");
            }
            const scalar Qf = Qlo;
            r.rated            = true;
            r.R_int            = inv.R_int;
            r.A_w_LMH          = dw.A_w * 3.6e11;
            r.A_w_record_LMH   = dw.A_w_record * 3.6e11;
            r.R_obs            = m.R_obs;
            r.recovery         = m.recovery;
            r.permeate_m3d     = m.permeateFlow * 86400.0;
            r.feed_m3h         = Qf * 3600.0;
            r.flux_LMH         = m.flux * 3.6e6;
            r.permeateConc_ppm = w * (1.0 - m.R_obs) * 1.0e6;
            r.dP_bar           = m.dP * 1.0e-5;
            r.specificPressure = (P * 1.0e-5) / r.flux_LMH;
            r.specificEnergy   = P * Qf / m.permeateFlow / 3.6e6;
            if (lim.hasFeedFlow_max)
            {
                r.mFeed = (lim.feedFlow_max - Qf) / lim.feedFlow_max;
                if (Qf > lim.feedFlow_max)
                    addReason(r, "feed " + fmt(Qf * 3600.0, "%.4g") + " m3/h > feedFlow_max "
                        + fmt(lim.feedFlow_max * 3600.0, "%.4g") + " m3/h");
            }
            if (lim.hasDP_max)
            {
                r.mdP = (lim.dP_max - m.dP) / lim.dP_max;
                if (m.dP > lim.dP_max)
                    addReason(r, "pressure drop " + fmt(m.dP * 1e-5, "%.4g")
                        + " bar > dP_max " + fmt(lim.dP_max * 1e-5, "%.4g") + " bar");
            }
        }
        catch (const std::exception& e)
        {
            addReason(r, std::string("cannot be re-rated: ") + e.what());
        }
        rows.push_back(std::move(r));
    }

    // ---- publish, side by side, in the registry's alphabetical order --------
    std::size_t nPass = 0;
    std::set<std::string> prefixes;
    for (const auto& r : rows)
    {
        if (r.reason.empty()) ++nPass;
        //  A diagnostic key is a WORD (the golden's reader takes \w+ only):
        //  a module name's hyphens become underscores, `__` divides the
        //  module from the criterion, and two names that collide refuse.
        std::string p;
        for (char ch : r.name) p += (std::isalnum(static_cast<unsigned char>(ch)) ? ch : '_');
        p += "__";
        if (!prefixes.insert(p).second)
            throw std::runtime_error(site + ": two module names map to the"
                " diagnostic prefix '" + p + "' -- rename one record.");
        if (r.rated)
        {
            diag_[p + "R_int"]                        = r.R_int;
            diag_[p + "A_w_LMH_per_bar"]              = r.A_w_LMH;
            diag_[p + "R_obs"]                        = r.R_obs;
            diag_[p + "recovery"]                     = r.recovery;
            diag_[p + "permeateFlow_m3d"]             = r.permeate_m3d;
            diag_[p + "feedFlow_m3h"]                 = r.feed_m3h;
            diag_[p + "flux_LMH"]                     = r.flux_LMH;
            diag_[p + "permeateConc_ppm"]             = r.permeateConc_ppm;
            diag_[p + "dP_bar"]                       = r.dP_bar;
            diag_[p + "specificPressure_bar_per_LMH"] = r.specificPressure;
            diag_[p + "specificEnergy_kWh_m3"]        = r.specificEnergy;
        }
        if (!std::isnan(r.mP))    diag_[p + "margin_P"]        = r.mP;
        if (!std::isnan(r.mT))    diag_[p + "margin_T"]        = r.mT;
        if (!std::isnan(r.mdP))   diag_[p + "margin_dP"]       = r.mdP;
        if (!std::isnan(r.mFeed)) diag_[p + "margin_feedFlow"] = r.mFeed;
        if (!std::isnan(r.mPH))   diag_[p + "margin_pH"]       = r.mPH;
    }
    //  The `operation` block is read by the module probes on a deep copy, so
    //  the unread-key audit of THIS dict cannot see it: once a probe has run,
    //  the block is declared another reader's (the module's), by name.
    for (const auto& r : rows)
        if (r.rated)
        {
            for (const auto& k : tmpl->keys()) tmpl->noteForeignBlock(k);
            break;
        }
    diag_["n_candidates"] = static_cast<scalar>(rows.size());
    diag_["n_pass"]       = static_cast<scalar>(nPass);
    diag_["n_excluded"]   = static_cast<scalar>(rows.size() - nPass);

    if (verbosity >= 1)
    {
        for (const auto& r : rows)
        {
            if (!r.reason.empty()) { std::cout << "  EXCLUDED  " << r.name << ": " << r.reason << "\n"; }
            if (r.rated)
                std::cout << (r.reason.empty() ? "  PASS      " : "            ") << r.name
                    << "  permeate " << fmt(r.permeate_m3d, "%.4g") << " m3/d"
                    << "  R_obs " << fmt(r.R_obs * 100.0, "%.4g") << " %"
                    << "  permeate conc " << fmt(r.permeateConc_ppm, "%.4g") << " ppm"
                    << "  flux " << fmt(r.flux_LMH, "%.4g") << " LMH"
                    << "  P/flux " << fmt(r.specificPressure, "%.4g") << " bar/LMH"
                    << "  E " << fmt(r.specificEnergy, "%.4g") << " kWh/m3"
                    << "  feed " << fmt(r.feed_m3h, "%.4g") << " m3/h"
                    << "  dP " << fmt(r.dP_bar, "%.4g") << " bar\n";
        }
        std::cout << "  " << nPass << " of " << rows.size()
                  << " commercial module(s) pass every hard filter.\n";
    }

    if (dict->found("output") && dict->subDict("output")->found("file"))
    {
        const std::string f = dict->subDict("output")->lookupWord("file");
        std::ofstream csv(f);
        if (!csv) throw std::runtime_error(site + ": cannot open " + f);
        csv << "module,status,reason,R_int,A_w_LMH_per_bar,R_obs,recovery,permeateFlow_m3d,"
               "feedFlow_m3h,flux_LMH,permeateConc_ppm,dP_bar,"
               "specificPressure_bar_per_LMH,specificEnergy_kWh_m3,"
               "margin_P,margin_T,margin_dP,margin_feedFlow,margin_pH\n";
        for (const auto& r : rows)
        {
            std::string reason = r.reason;
            for (auto& ch : reason) if (ch == ',') ch = ';';
            csv << r.name << ',' << (r.reason.empty() ? "pass" : "excluded") << ','
                << reason;
            for (scalar v : { r.R_int, r.A_w_LMH, r.R_obs, r.recovery, r.permeate_m3d,
                              r.feed_m3h, r.flux_LMH, r.permeateConc_ppm, r.dP_bar,
                              r.specificPressure, r.specificEnergy, r.mP, r.mT,
                              r.mdP, r.mFeed, r.mPH })
                csv << ',' << (std::isnan(v) ? std::string() : fmt(v, "%.10g"));
            csv << '\n';
        }
    }
    return 0;
}

} // namespace Choupo
