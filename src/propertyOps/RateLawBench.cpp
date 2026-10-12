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

#include "RateLawBench.H"

#include "core/Units.H"
#include "thermo/reaction/ExpressionRate.H"

#include <algorithm>
#include <cmath>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <limits>
#include <sstream>
#include <stdexcept>

namespace Choupo {

namespace {

std::string f(scalar v, int p = 6)
{
    std::ostringstream os;
    os << std::fixed << std::setprecision(p) << v;
    return os.str();
}

struct Report { std::string name; std::string unit; };

} // namespace

int RateLawBench::run(const DictPtr& dict,
                      const ThermoPackage& /*thermo*/,
                      int verbosity)
{
    diag_.clear();
    std::ostringstream os;
    const std::string who = "rateLawBench";

    // -----------------------------------------------------------------
    //  THE LAW: the case's own, from constant/reactions.
    // -----------------------------------------------------------------
    if (!dict->found("reaction"))
        throw std::runtime_error(who + ": name the law with `reaction <name>;` --"
            " a reaction of this case's constant/reactions whose kinetics are"
            " `type expression;`.");
    const std::string rxnName = dict->lookupWord("reaction");
    const std::string path = "constant/reactions";
    if (!std::filesystem::exists(path))
        throw std::runtime_error(who + ": this case has no constant/reactions, so"
            " there is no law named '" + rxnName + "' to put on the bench.");
    const DictPtr lib = Dictionary::fromFile(path);
    if (!lib->found(rxnName))
        throw std::runtime_error(who + ": constant/reactions declares no reaction '"
            + rxnName + "'.");
    const DictPtr rxn = lib->subDict(rxnName);
    if (rxn->subDict("kinetics")->lookupWord("type") != "expression")
        throw std::runtime_error(who + ": reaction '" + rxnName + "' is not a"
            " `type expression` law; the bench evaluates a law written in the"
            " case, whose every number it can print back.");

    //  The composition space: the reaction's components, then every other
    //  name a declared mixture uses (an inert, say) -- in first-seen order.
    std::vector<std::string> comps;
    auto addComp = [&](const std::string& c)
    { if (std::find(comps.begin(), comps.end(), c) == comps.end()) comps.push_back(c); };
    for (const auto& s : rxn->lookupDictList("stoichiometry"))
        addComp(s->lookupWord("component"));
    if (dict->found("locus") && dict->subDict("locus")->found("baseMixture"))
        for (const auto& k : dict->subDict("locus")->subDict("baseMixture")->keys()) addComp(k);
    if (dict->found("points"))
        for (const auto& p : dict->lookupDictList("points"))
            for (const auto& k : p->subDict("composition")->keys()) addComp(k);

    RateOffer offer;
    offer.concentration = false;           // the bench has mole fractions, not a volume
    const ExpressionRate law(rxn, comps, who + ": reaction '" + rxnName + "'", offer);

    //  What to publish, each converted to its declared unit.
    std::vector<Report> report;
    if (dict->found("report"))
        for (const auto& r : dict->lookupDictList("report"))
        {
            Report e{ r->lookupWord("name"), r->lookupWord("unit") };
            if (!law.knows(e.name))
                throw std::runtime_error(who + ": report `" + e.name + "` is not a"
                    " parameter or definition of '" + rxnName + "', nor its"
                    " `rate`" + (law.hasLegs() ? std::string(", `forward` or `reverse`") : std::string()) + ".");
            const auto u = units::lookupUnit(e.unit);
            if (!u || u->affine || u->dims != law.dimsOf(e.name))
                throw std::runtime_error(who + ": report `" + e.name + "` cannot be"
                    " shown in `" + e.unit + "`: its dimensions are "
                    + law.dimsOf(e.name).toBracket() + ".");
            report.push_back(e);
        }
    if (report.empty())
        throw std::runtime_error(who + ": declare `report ( { name <n>; unit <u>; }"
            " ... )` -- what the bench prints is the case's choice, never a"
            " default.");

    auto xOf = [&](const DictPtr& comp, const std::string& where) -> sVector
    {
        sVector x(comps.size(), 0.0);
        scalar sum = 0.0;
        for (const auto& k : comp->keys())
        {
            const std::size_t i = static_cast<std::size_t>(
                std::find(comps.begin(), comps.end(), k) - comps.begin());
            x[i] = comp->lookupScalar(k);
            sum += x[i];
        }
        if (std::abs(sum - 1.0) > 1.0e-6)
        {
            std::ostringstream m;
            m << who << ": " << where << " -- the mole fractions sum to " << sum
              << ", not 1.  They are NOT normalised here: a composition that does"
                 " not close is a fact about the declaration, and renormalising"
                 " it would hide which entry is wrong.";
            throw std::runtime_error(m.str());
        }
        return x;
    };

    os << "\n========  Rate law on the bench: " << rxnName << "  ========\n"
       << "  The law is constant/reactions' own, as the engine PARSED it:\n"
       << law.describe("    ") << "\n";

    auto evaluateAt = [&](scalar T, scalar P, const sVector& x)
    {
        RateState s;
        s.T = T; s.P = P; s.x = &x; s.conc = nullptr;
        return law.evaluate(s);
    };
    auto shown = [&](const ExpressionRate::Detail& d, const Report& r)
    { return ExpressionRate::inUnit(law.valueOf(d, r.name), r.unit); };
    auto notes = [&](const ExpressionRate::Detail& d)
    {
        for (const auto& m : d.interpolated) os << "        [interpolated] " << m << "\n";
        for (const auto& m : d.outside)      os << "        " << m << "\n";
    };

    // -----------------------------------------------------------------
    //  (1) THE LOCUS OF MAXIMUM RATE
    // -----------------------------------------------------------------
    if (dict->found("locus"))
    {
        auto L = dict->subDict("locus");
        const scalar P = L->lookupScalar("pressure", Dims::pressure);
        const std::string key = L->lookupWord("keyReactant");
        const std::string maxName = L->lookupWord("maximise");
        const sVector base = xOf(L->subDict("baseMixture"), "locus.baseMixture");
        auto etas = L->lookupList("conversions");
        auto Td = L->subDict("temperature");
        const scalar Tfrom = Td->lookupScalar("from", Dims::temperature);
        const scalar Tto   = Td->lookupScalar("to",   Dims::temperature);
        const std::size_t nT =
            std::max<std::size_t>(2, std::size_t(Td->lookupScalar("n")));

        const auto kIt = std::find(comps.begin(), comps.end(), key);
        const std::size_t iKey = static_cast<std::size_t>(kIt - comps.begin());
        sVector nuAll(comps.size(), 0.0);
        for (std::size_t i = 0; i < law.components().size(); ++i)
            nuAll[i] = law.nu()[i];
        if (kIt == comps.end() || !(nuAll[iKey] < 0.0) || !(base[iKey] > 0.0))
            throw std::runtime_error(who + ": locus.keyReactant '" + key + "' must"
                " be a REACTANT of '" + rxnName + "' present in the base mixture --"
                " the conversion is of that reactant.");
        const auto mIt = std::find_if(report.begin(), report.end(),
                                      [&](const Report& r) { return r.name == maxName; });
        if (mIt == report.end())
            throw std::runtime_error(who + ": locus.maximise `" + maxName + "` must"
                " be one of the `report` entries (it is published in that unit).");
        if (!(Tto > Tfrom))
            throw std::runtime_error(who + ": locus.temperature.to must exceed"
                " .from -- a sweep of zero width locates no maximum.");
        if (etas.empty())
            throw std::runtime_error(who + ": locus.conversions is empty.  One"
                " conversion gives one point of the locus; the locus is the"
                " sequence, and a single point cannot show that it DESCENDS.");

        //  The mixture at conversion eta of the key reactant: walked along
        //  the reaction's own stoichiometry from the base mixture.
        auto mixtureAt = [&](scalar eta) -> sVector
        {
            if (!(eta > 0.0) || eta >= 1.0)
                throw std::runtime_error(who + ": a locus conversion must lie in"
                    " (0, 1).");
            const scalar xi = eta * base[iKey] / (-nuAll[iKey]);
            sVector nmol(comps.size(), 0.0);
            scalar tot = 0.0;
            for (std::size_t i = 0; i < comps.size(); ++i)
            { nmol[i] = base[i] + nuAll[i] * xi; tot += nmol[i]; }
            for (auto& v : nmol) v /= tot;
            return nmol;
        };

        os << "  ---- the locus of maximum `" << maxName << "`, at "
           << f(P / units::atm_to_Pa, 3) << " atm ----\n"
           << "  Conversion of " << key << " walked from the base mixture along the"
              " reaction's own stoichiometry; at each conversion the temperature of\n"
              "  greatest `" << maxName << "` is LOCATED by the sweep.\n\n"
           << "  " << std::left << std::setw(12) << "conversion"
           << std::setw(12) << "T_max [K]";
        for (const auto& r : report)
            os << std::setw(22) << (r.name + " [" + r.unit + "]");
        os << "\n";

        const scalar dT = (Tto - Tfrom) / scalar(nT - 1);
        std::size_t k = 0;
        scalar previousTmax = 0.0;
        bool descends = true;
        for (scalar eta : etas)
        {
            ++k;
            const std::string tag = "locus" + std::to_string(k);
            const sVector x = mixtureAt(eta);
            scalar bestT = Tfrom, bestV = -std::numeric_limits<scalar>::max();
            for (std::size_t i = 0; i < nT; ++i)
            {
                const scalar T = Tfrom + dT * scalar(i);
                const scalar v = shown(evaluateAt(T, P, x), *mIt);
                if (v > bestV) { bestV = v; bestT = T; }
            }
            const auto d = evaluateAt(bestT, P, x);
            diag_[tag + "_T_maxRate_K"] = bestT;
            diag_[tag + "_" + maxName + "_max"] = bestV;
            os << "  " << std::left << std::setw(12) << f(eta, 3)
               << std::setw(12) << f(bestT, 2);
            for (const auto& r : report)
            {
                const scalar v = shown(d, r);
                if (r.name != maxName) diag_[tag + "_" + r.name] = v;
                os << std::setw(22) << f(v, 6);
            }
            os << "\n";
            //  A maximum found ON the sweep's own boundary is a boundary, not a
            //  maximum, and saying so is the difference between a locus and an
            //  artefact.
            if (std::abs(bestT - Tfrom) < 0.5 * dT || std::abs(bestT - Tto) < 0.5 * dT)
                os << "        ^ this maximum sits ON THE EDGE of the swept window,"
                      " so it is the edge\n          that was found, not a maximum."
                      "  Widen `temperature` to locate one.\n";
            notes(d);
            if (k > 1 && bestT > previousTmax) descends = false;
            previousTmax = bestT;
        }
        diag_["locusDescends"] = descends ? 1.0 : 0.0;
        os << "\n  The locus " << (descends ? "DESCENDS" : "does NOT descend")
           << " over the conversions asked for.\n"
           << "  Where it should be MET is not a question this bench answers:"
              " sitting on\n  the locus maximises rate and a real converter"
              " trades that against the\n  temperature its catalyst"
              " survives, which nothing here prices.\n\n";
    }

    // -----------------------------------------------------------------
    //  (2) THE RATE AT STATES THE CASE DECLARES
    // -----------------------------------------------------------------
    if (dict->found("points"))
    {
        os << "  ---- the law at declared states ----\n"
           << "  " << std::left << std::setw(22) << "state"
           << std::setw(12) << "T [K]" << std::setw(12) << "P [atm]";
        for (const auto& r : report)
            os << std::setw(22) << (r.name + " [" + r.unit + "]");
        os << "\n";
        for (const auto& p : dict->lookupDictList("points"))
        {
            const std::string label = p->lookupWord("label");
            const scalar T = p->lookupScalar("T", Dims::temperature);
            const scalar P = p->lookupScalar("P", Dims::pressure);
            const sVector x = xOf(p->subDict("composition"), "point '" + label + "'");
            const auto d = evaluateAt(T, P, x);
            os << "  " << std::left << std::setw(22) << label
               << std::setw(12) << f(T, 2) << std::setw(12) << f(P / units::atm_to_Pa, 3);
            for (const auto& r : report)
            {
                const scalar v = shown(d, r);
                diag_[label + "_" + r.name] = v;
                os << std::setw(22) << f(v, 6);
            }
            os << "\n";
            notes(d);
            //  The law's OWN equilibrium temperature for this gas, when it
            //  declares the legs and a window to search them in.
            if (law.hasLegs() && law.hasEquilibriumWindow())
            {
                RateState s;
                s.T = T; s.P = P; s.x = &x; s.conc = nullptr;
                try
                {
                    const scalar Teq = law.equilibriumTemperature(s);
                    diag_[label + "_T_eq_K"] = Teq;
                    os << "        this gas is at the law's own equilibrium at T* = "
                       << f(Teq, 4) << " K\n";
                }
                catch (const std::exception& e)
                {
                    os << "        T* not located: " << e.what() << "\n";
                }
            }
        }
        os << "\n";
    }

    for (const auto& c : law.caveats()) os << "  " << c << "\n";
    os << "==========================================\n\n";

    if (verbosity >= 1) std::cout << os.str();
    return 0;
}

} // namespace Choupo
