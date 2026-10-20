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

#include "PhaseSplitScan.H"
#include "core/Advisory.H"
#include "thermo/RecordResolver.H"
#include "thermo/ThermoPackage.H"
#include "thermo/electrolyte/ReactiveVLE.H"
#include "thermo/phase/Phase.H"
#include "thermo/phase/SolidPhase.H"
#include "unitOperations/flash/IsothermalFlash.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <set>
#include <sstream>
#include <stdexcept>

namespace Choupo {

namespace {

//  ---- JSON spelling, local and small ------------------------------------
//  Twelve significant digits, the machine channel's own precision; a
//  non-finite value is `null`, never a token JSON cannot parse.
std::string jnum(scalar v)
{
    if (!std::isfinite(v)) return "null";
    char buf[40];
    std::snprintf(buf, sizeof buf, "%.12g", static_cast<double>(v));
    return buf;
}

std::string jstr(const std::string& s)
{
    std::string o = "\"";
    for (char ch : s)
    {
        switch (ch)
        {
            case '"':  o += "\\\""; break;
            case '\\': o += "\\\\"; break;
            case '\n': o += "\\n";  break;
            case '\r': o += "\\r";  break;
            case '\t': o += "\\t";  break;
            default:
                if (static_cast<unsigned char>(ch) >= 0x20) o += ch;
        }
    }
    return o + "\"";
}

std::string fmt(scalar v, int prec = 4)
{
    std::ostringstream os;
    os << std::fixed << std::setprecision(prec) << v;
    return os.str();
}

//  The first line of a refusal, for the one-line-per-point console table
//  (the whole text goes to the JSON block).
std::string firstLine(const std::string& s)
{
    const auto nl = s.find('\n');
    return nl == std::string::npos ? s : s.substr(0, nl);
}

//  ---- what one grid point publishes ---------------------------------------
struct PhaseAmount
{
    std::string name;      // V | L1 | L2 | <solid name>
    scalar      amount;    // mol per mol of feed
    sVector     x;         // its composition (sums to 1)
};

struct Announcement
{
    std::string category, locus, message;
};

struct Point
{
    scalar      var = 0.0, T = 0.0, P = 0.0;
    bool        solved = false;
    std::string reason;            // the refusal, verbatim (refused points)
    std::string regime;            // the flash's own prose
    std::string phaseSetWord;      // VL | LL | VLLE (what `auto` resolved to)
    int         iterations = 0;
    std::vector<PhaseAmount>                       phases;   // present only
    std::map<std::string, scalar>                  kpis;     // the flash's observables
    std::vector<std::pair<std::string, scalar>>    species;  // mol per mol feed
    std::vector<Announcement>                      firstRaised;
};

struct Event
{
    std::string kind;    // appeared | disappeared | phaseSet
    std::string phase;   // or the new phase-set word
    scalar      from = 0.0, to = 0.0;   // the two grid values it lies between
    std::size_t index = 0;              // the point where it is first true
    bool        acrossRefused = false;  // a refused point sits between
};

const char* psWord(PhaseSet ps)
{
    return ps == PhaseSet::VL ? "VL" : ps == PhaseSet::LL ? "LL" : "VLLE";
}

//  ---- the solution, read into phases ------------------------------------
//
//  ONE reading of `FlashSolution` per branch, in the vocabulary the flash
//  unit itself uses when it fills its ports: `vllePorts` for a VLLE search,
//  `liquidLiquid` for an LL answer, `solidFlows` SUBTRACTED from the liquid
//  on both the SLE and the reactive paths (IsothermalFlash.cpp, the stream
//  assembly), the organic liquid on the reactive path.  F = 1 throughout, so
//  every flow is already per mole of feed.
void readPhases(const FlashSolution& sol, const ThermoPackage& thermo,
                const FlashInput& in, Point& pt,
                std::map<std::string, std::string>& labels)
{
    const std::size_t n = thermo.n();
    auto push = [&](const std::string& name, scalar amount, sVector x)
    {
        if (!(amount > 1.0e-12)) return;
        scalar s = 0.0;
        for (auto v : x) s += v;
        if (s > 0.0) for (auto& v : x) v /= s;
        pt.phases.push_back({ name, amount, std::move(x) });
    };
    auto unitVector = [&](std::size_t c)
    {
        sVector e(n, 0.0);
        e[c] = 1.0;
        return e;
    };

    //  The solids first: both solid-bearing branches leave the crystal
    //  INSIDE `sol.x` (the chemistry-route convention) and the stream
    //  assembly takes it out; so does this.
    sVector solidPerMol(n, 0.0);
    scalar  solidTotal = 0.0;
    if (!sol.solidFlows.empty())
    {
        for (std::size_t c = 0; c < n && c < sol.solidFlows.size(); ++c)
        {
            const scalar s = sol.solidFlows[c] / in.F;
            if (!(s > 0.0)) continue;
            solidPerMol[c] = s;
            solidTotal    += s;
            //  BY NAME.  A declared crystallising SolidPhase names itself
            //  (`ice`); a precipitate is named by the mineral the package
            //  says OWNS that component (`calcite`), and by the component
            //  with a `(s)` only when no single mineral does.
            std::string name;
            for (auto si : thermo.phasesOfType("solid"))
            {
                const auto* sp = dynamic_cast<const SolidPhase*>(&thermo.phase(si));
                if (sp && sp->crystalIndex() == c) { name = sp->name(); break; }
            }
            if (name.empty())
                if (const auto* cfg = thermo.reactiveConfig())
                {
                    std::vector<std::string> owners;
                    for (const auto& [mineral, owner] : cfg->solidOwner)
                        if (owner == c) owners.push_back(mineral);
                    if (owners.size() == 1) name = owners[0];
                }
            if (name.empty()) name = thermo.comp(c).name() + "(s)";
            labels[name] = "solid: " + thermo.comp(c).name();
            push(name, s, unitVector(c));
        }
    }

    if (sol.threePhase)
    {
        const auto ports = vllePorts(sol, n);
        push("V",  ports.vapour.beta, ports.vapour.z);
        push("L1", ports.alpha.beta,  ports.alpha.z);
        push("L2", ports.beta.beta,   ports.beta.z);
        return;
    }
    if (sol.liquidLiquid)
    {
        push("L1", 1.0 - sol.V_over_F, sol.x);
        push("L2", sol.V_over_F,       sol.y);
        return;
    }

    //  Vapour + ONE apparent liquid, the liquid possibly holding a crystal
    //  and (reactive path) a second liquid inside it.
    const scalar V = sol.sleBranch ? 0.0 : sol.V_over_F;
    if (V > 0.0) push("V", V, sol.y);

    sVector liq(n, 0.0);
    for (std::size_t i = 0; i < n && i < sol.x.size(); ++i)
        liq[i] = (1.0 - V) * sol.x[i] - solidPerMol[i];

    if (sol.organicLiquid && !sol.organicLiquid->empty())
    {
        //  `organicLiquid` is scaled by F in solveCore; F = 1 here, so it is
        //  per mole of feed.  The aqueous is the liquid MINUS it (closure by
        //  subtraction, the stream's own rule).
        sVector org(n, 0.0);
        scalar  orgTot = 0.0;
        for (std::size_t i = 0; i < n && i < sol.organicLiquid->size(); ++i)
        {
            org[i]  = (*sol.organicLiquid)[i] / in.F;
            orgTot += org[i];
            liq[i] -= org[i];
        }
        labels["L1"] = "aqueous";
        labels["L2"] = "organic";
        scalar aqTot = 0.0;
        for (auto v : liq) aqTot += std::max(v, 0.0);
        push("L1", aqTot, liq);
        push("L2", orgTot, org);
        return;
    }
    scalar liqTot = 0.0;
    for (auto v : liq) liqTot += std::max(v, 0.0);
    push("L1", liqTot, liq);
}

} // anonymous namespace

int PhaseSplitScan::run(const DictPtr& dict,
                        const ThermoPackage& globalThermo,
                        int verbosity)
{
    diag_.clear();
    block_.clear();
    const std::string opName = dict->lookupWordOrDefault("name", type_);

    //  Per-op `thermo {}` override, exactly as the other scans take it.
    auto override = thermoForOp(dict);
    const ThermoPackage& thermo = override ? *override : globalThermo;
    const std::size_t n = thermo.n();

    // ---- vary ------------------------------------------------------------
    auto varyDict = dict->subDict("vary");
    const std::string variable = varyDict->lookupWord("variable");
    if (variable != "T" && variable != "P")
        throw std::runtime_error("phaseSplitScan '" + opName + "': `vary {"
            " variable }` must be T or P (got '" + variable + "').  The feed"
            " is FIXED here by design -- a composition sweep of a phase split"
            " is a different lesson, and `propertyScanBinary` draws it.");
    const Dimensions varDims = (variable == "T") ? Dims::temperature
                                                 : Dims::pressure;
    const scalar from = varyDict->lookupScalar("from", varDims);
    const scalar to   = varyDict->lookupScalar("to",   varDims);
    std::size_t nPoints = 0;
    if (varyDict->found("n"))
        nPoints = static_cast<std::size_t>(varyDict->lookupScalar("n"));
    else if (varyDict->found("step"))
    {
        const scalar step = varyDict->lookupScalar("step", varDims);
        if (!(step > 0.0))
            throw std::runtime_error("phaseSplitScan '" + opName
                + "': `vary { step }` must be positive.");
        nPoints = static_cast<std::size_t>(std::fabs((to - from) / step)) + 1;
    }
    else
    {
        nPoints = 21;
        if (verbosity >= 1)
            std::cout << "  [phaseSplitScan] neither `n` nor `step` declared"
                         " -- using the default of 21 points.\n";
    }
    if (nPoints < 2)
        throw std::runtime_error("phaseSplitScan '" + opName
            + "': need n >= 2 grid points (a single state is `propertyPoint`"
              "'s job).");

    // ---- state: the held axis + the feed ---------------------------------
    auto stateDict = dict->subDict("state");
    if (stateDict->found(variable))
        throw std::runtime_error("phaseSplitScan '" + opName + "': `state`"
            " declares " + variable + " while `vary` sweeps it -- two homes"
            " for one axis.  Keep the swept axis in `vary` only, and the"
            " held one (" + std::string(variable == "T" ? "P" : "T")
            + ") in `state`.");
    const std::string heldName = (variable == "T") ? "P" : "T";
    if (!stateDict->found(heldName))
        throw std::runtime_error("phaseSplitScan '" + opName + "': `state`"
            " must declare the held axis " + heldName + " (the scan varies "
            + variable + " at fixed " + heldName + "; there is no default"
            " state).");
    const scalar held = stateDict->lookupScalar(heldName,
        variable == "T" ? Dims::pressure : Dims::temperature);

    auto compDict = stateDict->subDict("composition");
    sVector z(n, 0.0);
    scalar  zsum = 0.0;
    for (const auto& key : compDict->keys())
    {
        const scalar v = compDict->lookupScalar(key);
        if (v < 0.0)
            throw std::runtime_error("phaseSplitScan '" + opName
                + "': composition." + key + " is negative.");
        z[thermo.indexOf(key)] += v;
        zsum += v;
    }
    if (!(zsum > 0.0))
        throw std::runtime_error("phaseSplitScan '" + opName + "': the"
            " `composition {}` block is empty or sums to zero -- a phase"
            " split is a property of ONE feed and there is no default feed.");
    if (std::fabs(zsum - 1.0) > 1.0e-9 && verbosity >= 1)
        std::cout << "  [phaseSplitScan] the feed sums to " << fmt(zsum, 6)
                  << " (moles), normalised to 1.\n";
    for (auto& v : z) v /= zsum;

    // ---- the flash's own options, read by the flash's own reader ----------
    //  `phaseSet` / `alphaRich` / `betaRich` are the isothermalFlash unit's
    //  words; a synthetic `operation {}` hands them to readOptions so that
    //  `auto` is decided per grid point by the SAME TPD test the unit runs,
    //  and an unknown word is refused by the one sentence the unit uses.
    std::string operText;
    for (const char* key : { "phaseSet", "alphaRich", "betaRich" })
        if (dict->found(key))
            operText += std::string(key) + " " + dict->lookupWord(key) + "; ";

    // ---- output ------------------------------------------------------------
    const std::string outFile = dict->subDict("output")->lookupWord("file");
    records::refuseStandardsWrite("phaseSplitScan", "file", outFile);

    if (verbosity >= 2)
    {
        std::cout << "\n=========================  phaseSplitScan  =========================\n"
                  << "  Feed (mol):";
        for (std::size_t i = 0; i < n; ++i)
            if (z[i] > 0.0) std::cout << "  " << thermo.comp(i).name()
                                      << " " << fmt(z[i], 4);
        std::cout << "\n  Sweep:   " << variable << " from " << from << " to "
                  << to << " (" << nPoints << " points) at fixed " << heldName
                  << " = " << held << (variable == "T" ? " Pa" : " K") << "\n"
                  << "  Each point is ONE isothermal flash (IsothermalFlash::"
                     "solveCore -- the unit's own solver, nothing re-derived"
                     " here).\n"
                  << "  Output:  " << outFile << "\n";
    }

    // ---- the sweep ---------------------------------------------------------
    std::vector<Point> pts;
    pts.reserve(nPoints);
    std::map<std::string, std::string> labels;
    //  The declared liquid phase names label L1/L2 on the molecular paths;
    //  the reactive path overwrites them with aqueous/organic as it finds.
    {
        const auto liqs = thermo.phasesOfType("liquid");
        if (!liqs.empty())     labels["L1"] = thermo.phase(liqs[0]).name();
        if (liqs.size() >= 2)  labels["L2"] = thermo.phase(liqs[1]).name();
        const auto vaps = thermo.phasesOfType("vapor");
        if (!vaps.empty())     labels["V"]  = thermo.phase(vaps[0]).name();
    }
    //  The flash prints its full narration at verbosity >= 2; a 21-point
    //  scan would print it 21 times.  The points, the events and the
    //  refusals are this op's own table, so the inner solve speaks only
    //  from verbosity 4 (where [sle] / [flash] narration is wanted).
    const int innerVerbosity = std::max(0, verbosity - 3);

    for (std::size_t k = 0; k < nPoints; ++k)
    {
        Point pt;
        const scalar t = static_cast<scalar>(k)
                       / static_cast<scalar>(nPoints - 1);
        pt.var = from + t * (to - from);
        pt.T = (variable == "T") ? pt.var : held;
        pt.P = (variable == "P") ? pt.var : held;

        FlashInput in;
        in.F = 1.0;   // per mole of feed: every amount below is a fraction
        in.T = pt.T;
        in.P = pt.P;
        in.z = z;

        const std::size_t nAdvBefore = AdvisoryLog::instance().entries().size();
        try
        {
            auto unitDict = Dictionary::fromString(
                "operation { T " + jnum(pt.T) + "; P " + jnum(pt.P) + "; "
                + operText + "}", "phaseSplitScan '" + opName + "'");
            FlashOptions opts = IsothermalFlash::readOptions(
                unitDict, thermo, in, innerVerbosity);
            opts.verbosity = innerVerbosity;
            pt.phaseSetWord = psWord(opts.phaseSet);

            const FlashSolution sol = IsothermalFlash::solveCore(in, thermo, opts);
            if (!sol.converged)
                throw std::runtime_error("the flash did not converge at this"
                    " point (regime '" + sol.regime + "', residual "
                    + jnum(sol.residual) + " after "
                    + std::to_string(sol.iterations) + " iterations)");
            pt.solved     = true;
            pt.regime     = sol.regime;
            pt.iterations = sol.iterations;
            pt.kpis       = sol.extraKpis;
            readPhases(sol, thermo, in, pt, labels);
            if (sol.speciation)
                for (const auto& [sp, flow] : sol.speciation->flows)
                    pt.species.emplace_back(sp, flow / in.F);
        }
        catch (const std::exception& e)
        {
            //  A REFUSED POINT IS A PUBLISHED FACT.  Nothing is substituted
            //  for it -- not the previous point's phases, not a one-phase
            //  guess -- and the scan goes on to the next grid value.
            pt.solved = false;
            pt.reason = e.what();
        }
        //  Every record-level announcement this point was the FIRST to
        //  raise: the log deduplicates, so an entry new after this solve
        //  was raised here and nowhere earlier in the run.
        const auto adv = AdvisoryLog::instance().entries();
        for (std::size_t a = nAdvBefore; a < adv.size(); ++a)
            pt.firstRaised.push_back({ adv[a].category, adv[a].locus,
                                       adv[a].message });
        pts.push_back(std::move(pt));
    }

    // ---- events: what changed between consecutive solved points ------------
    std::vector<Event> events;
    {
        const Point* prev = nullptr;
        bool refusedBetween = false;
        for (std::size_t k = 0; k < pts.size(); ++k)
        {
            const Point& cur = pts[k];
            if (!cur.solved) { refusedBetween = (prev != nullptr); continue; }
            if (prev)
            {
                std::set<std::string> a, b;
                for (const auto& p : prev->phases) a.insert(p.name);
                for (const auto& p : cur.phases)  b.insert(p.name);
                for (const auto& name : b)
                    if (!a.count(name))
                        events.push_back({ "appeared", name, prev->var,
                                           cur.var, k, refusedBetween });
                for (const auto& name : a)
                    if (!b.count(name))
                        events.push_back({ "disappeared", name, prev->var,
                                           cur.var, k, refusedBetween });
                if (cur.phaseSetWord != prev->phaseSetWord)
                    events.push_back({ "phaseSet", cur.phaseSetWord,
                                       prev->var, cur.var, k, refusedBetween });
            }
            prev = &cur;
            refusedBetween = false;
        }
    }

    // ---- the column set: every phase name and observable seen anywhere ----
    std::vector<std::string> phaseNames;
    std::vector<std::string> kpiKeys;
    std::vector<std::string> speciesNames;
    for (const auto& pt : pts)
    {
        for (const auto& p : pt.phases)
            if (std::find(phaseNames.begin(), phaseNames.end(), p.name)
                    == phaseNames.end())
                phaseNames.push_back(p.name);
        for (const auto& [k, v] : pt.kpis)
            if (std::find(kpiKeys.begin(), kpiKeys.end(), k) == kpiKeys.end())
                kpiKeys.push_back(k);
        for (const auto& [s, v] : pt.species)
            if (std::find(speciesNames.begin(), speciesNames.end(), s)
                    == speciesNames.end())
                speciesNames.push_back(s);
    }
    //  Fluids first in the fixed order V, L1, L2; then the solids as met.
    std::stable_sort(phaseNames.begin(), phaseNames.end(),
        [](const std::string& a, const std::string& b)
        {
            auto rank = [](const std::string& s)
            { return s == "V" ? 0 : s == "L1" ? 1 : s == "L2" ? 2 : 3; };
            return rank(a) < rank(b);
        });

    // ---- the CSV -----------------------------------------------------------
    std::ofstream csv(outFile);
    if (!csv.is_open())
        throw std::runtime_error("phaseSplitScan: cannot open '" + outFile
                                 + "' for writing");
    csv << variable << ",solved,nPhases";
    for (const auto& p : phaseNames) csv << "," << p;
    for (const auto& p : phaseNames)
        for (std::size_t i = 0; i < n; ++i)
            if (z[i] > 0.0) csv << ",x_" << p << "_" << thermo.comp(i).name();
    for (const auto& k : kpiKeys)      csv << "," << k;
    for (const auto& s : speciesNames) csv << ",n_" << s;
    csv << "\n";
    csv << std::scientific << std::setprecision(10);
    for (const auto& pt : pts)
    {
        csv << pt.var << "," << (pt.solved ? 1 : 0) << ","
            << (pt.solved ? std::to_string(pt.phases.size()) : "nan");
        auto find = [&](const std::string& name) -> const PhaseAmount*
        {
            for (const auto& p : pt.phases) if (p.name == name) return &p;
            return nullptr;
        };
        for (const auto& name : phaseNames)
        {
            const auto* p = find(name);
            if (!pt.solved) csv << ",nan";
            else            csv << "," << (p ? p->amount : 0.0);
        }
        for (const auto& name : phaseNames)
        {
            const auto* p = find(name);
            for (std::size_t i = 0; i < n; ++i)
                if (z[i] > 0.0)
                {
                    if (p) csv << "," << p->x[i];
                    else   csv << ",nan";
                }
        }
        for (const auto& k : kpiKeys)
        {
            auto it = pt.kpis.find(k);
            if (it == pt.kpis.end()) csv << ",nan";
            else                     csv << "," << it->second;
        }
        for (const auto& s : speciesNames)
        {
            scalar v = NAN;
            for (const auto& [sp, flow] : pt.species) if (sp == s) v = flow;
            if (std::isnan(v)) csv << ",nan"; else csv << "," << v;
        }
        csv << "\n";
    }
    csv.close();

    // ---- the console table -------------------------------------------------
    std::size_t nSolved = 0, nRefused = 0;
    for (const auto& pt : pts) (pt.solved ? nSolved : nRefused)++;
    if (verbosity >= 2)
    {
        std::cout << "\n  " << std::left << std::setw(14)
                  << (variable == "T" ? "T [K]" : "P [Pa]") << "phases (mol per mol feed)\n"
                  << "  " << std::string(66, '-') << "\n";
        for (const auto& pt : pts)
        {
            std::cout << "  " << std::left << std::setw(14) << fmt(pt.var, 3);
            if (!pt.solved)
            {
                std::cout << "REFUSED -- " << firstLine(pt.reason) << "\n";
                continue;
            }
            for (const auto& p : pt.phases)
                std::cout << p.name << " " << fmt(p.amount, 4) << "  ";
            auto ph = pt.kpis.find("pH");
            if (ph != pt.kpis.end()) std::cout << "pH " << fmt(ph->second, 3);
            std::cout << "\n";
        }
        for (const auto& e : events)
        {
            std::cout << "  [phaseSplitScan] ";
            if (e.kind == "phaseSet")
                std::cout << "phase set changed to " << e.phase;
            else
                std::cout << "phase '" << e.phase << "' "
                          << (e.kind == "appeared" ? "APPEARED" : "DISAPPEARED");
            std::cout << " between " << variable << " = " << fmt(e.from, 3)
                      << " and " << fmt(e.to, 3)
                      << (e.acrossRefused ? " (across a refused point)" : "")
                      << "\n";
        }
        for (const auto& pt : pts)
            for (const auto& a : pt.firstRaised)
                std::cout << "  [phaseSplitScan] first raised at " << variable
                          << " = " << fmt(pt.var, 3) << ": " << a.locus
                          << " -- " << firstLine(a.message) << "\n";
        std::cout << "\n  NOT MODELLED by this scan: nucleation and supercooling"
                     " (every point is the equilibrium ceiling);\n"
                     "  a solid no record declares (a crystal needs the"
                     " component's Hfus and triple point -- sucrose.dat has\n"
                     "  no Hfus, it decomposes before melting; a precipitate"
                     " needs a chemistryDict solid its component owns);\n"
                     "  solute inclusion in a crystal; the liquid/solid"
                     " heat-capacity term of dG_fus (announced by the record).\n"
                  << "  Wrote " << pts.size() << " rows to '" << outFile
                  << "'.\n====================================================================\n\n";
    }

    //  The refusals ride the ADVISORY LOG so the caveat block and the result
    //  JSON carry them for a reader who never saw the console (one entry per
    //  distinct reason, the points listed).
    {
        std::map<std::string, std::vector<scalar>> byReason;
        for (const auto& pt : pts)
            if (!pt.solved) byReason[firstLine(pt.reason)].push_back(pt.var);
        for (const auto& [why, at] : byReason)
        {
            std::ostringstream m;
            m << at.size() << " of " << pts.size() << " grid point(s) REFUSED"
                 " by the flash (" << variable << " =";
            for (std::size_t i = 0; i < at.size() && i < 6; ++i)
                m << " " << fmt(at[i], 3);
            if (at.size() > 6) m << " ...";
            m << "): " << why << "  No phase split is published at those"
                 " points; the scan continued past them.";
            AdvisoryLog::instance().add("refusal", "warning",
                "phaseSplitScan '" + opName + "'", m.str());
        }
    }

    // ---- diagnostics (numbers) -------------------------------------------
    diag_["n_points"]      = static_cast<scalar>(pts.size());
    diag_["n_solved"]      = static_cast<scalar>(nSolved);
    diag_["n_refused"]     = static_cast<scalar>(nRefused);
    diag_["n_events"]      = static_cast<scalar>(events.size());
    std::size_t nAdv = 0;
    for (const auto& pt : pts) nAdv += pt.firstRaised.size();
    diag_["n_announcements"] = static_cast<scalar>(nAdv);
    for (const auto& name : phaseNames)
    {
        std::size_t count = 0;
        bool first = true;
        scalar firstAt = 0.0, lastAt = 0.0;
        for (const auto& pt : pts)
            for (const auto& p : pt.phases)
                if (p.name == name)
                {
                    ++count;
                    if (first) { firstAt = pt.var; first = false; }
                    lastAt = pt.var;
                }
        diag_["points_" + name] = static_cast<scalar>(count);
        diag_["first_" + name]  = firstAt;
        diag_["last_" + name]   = lastAt;
    }

    // ---- the result block ------------------------------------------------
    {
        std::ostringstream j;
        j << "{ \"op\": " << jstr(opName)
          << ", \"variable\": " << jstr(variable)
          << ", \"held\": { " << jstr(heldName) << ": " << jnum(held) << " }"
          << ", \"feed\": {";
        bool firstZ = true;
        for (std::size_t i = 0; i < n; ++i)
            if (z[i] > 0.0)
            {
                j << (firstZ ? " " : ", ") << jstr(thermo.comp(i).name())
                  << ": " << jnum(z[i]);
                firstZ = false;
            }
        j << " }, \"phaseNames\": [";
        for (std::size_t i = 0; i < phaseNames.size(); ++i)
            j << (i ? ", " : "") << jstr(phaseNames[i]);
        j << "], \"phaseLabels\": {";
        bool firstL = true;
        for (const auto& name : phaseNames)
        {
            auto it = labels.find(name);
            if (it == labels.end()) continue;
            j << (firstL ? " " : ", ") << jstr(name) << ": " << jstr(it->second);
            firstL = false;
        }
        j << " }, \"csv\": " << jstr(outFile)
          << ",\n      \"points\": [";
        for (std::size_t k = 0; k < pts.size(); ++k)
        {
            const Point& pt = pts[k];
            j << (k ? ",\n        " : "\n        ")
              << "{ \"T\": " << jnum(pt.T) << ", \"P\": " << jnum(pt.P)
              << ", \"solved\": " << (pt.solved ? "true" : "false");
            if (!pt.solved)
            {
                j << ", \"reason\": " << jstr(pt.reason);
            }
            else
            {
                j << ", \"phaseSet\": " << jstr(pt.phaseSetWord)
                  << ", \"regime\": " << jstr(pt.regime)
                  << ", \"iterations\": " << pt.iterations
                  << ", \"phases\": {";
                for (std::size_t p = 0; p < pt.phases.size(); ++p)
                {
                    const auto& ph = pt.phases[p];
                    j << (p ? ", " : " ") << jstr(ph.name) << ": { \"amount\": "
                      << jnum(ph.amount) << ", \"x\": {";
                    bool fx = true;
                    for (std::size_t i = 0; i < n; ++i)
                        if (z[i] > 0.0)
                        {
                            j << (fx ? " " : ", ") << jstr(thermo.comp(i).name())
                              << ": " << jnum(ph.x[i]);
                            fx = false;
                        }
                    j << " } }";
                }
                j << " }, \"observables\": {";
                bool fk = true;
                for (const auto& [key, v] : pt.kpis)
                {
                    if (!std::isfinite(v)) continue;
                    j << (fk ? " " : ", ") << jstr(key) << ": " << jnum(v);
                    fk = false;
                }
                j << " }";
                if (!pt.species.empty())
                {
                    j << ", \"species\": {";
                    for (std::size_t s = 0; s < pt.species.size(); ++s)
                        j << (s ? ", " : " ") << jstr(pt.species[s].first)
                          << ": " << jnum(pt.species[s].second);
                    j << " }";
                }
            }
            if (!pt.firstRaised.empty())
            {
                j << ", \"firstRaised\": [";
                for (std::size_t a = 0; a < pt.firstRaised.size(); ++a)
                    j << (a ? ", " : "") << "{ \"category\": "
                      << jstr(pt.firstRaised[a].category) << ", \"locus\": "
                      << jstr(pt.firstRaised[a].locus) << ", \"message\": "
                      << jstr(pt.firstRaised[a].message) << " }";
                j << "]";
            }
            j << " }";
        }
        j << "\n      ], \"events\": [";
        for (std::size_t e = 0; e < events.size(); ++e)
            j << (e ? ", " : "") << "{ \"kind\": " << jstr(events[e].kind)
              << ", \"phase\": " << jstr(events[e].phase)
              << ", \"from\": " << jnum(events[e].from)
              << ", \"to\": " << jnum(events[e].to)
              << ", \"index\": " << events[e].index
              << ", \"acrossRefused\": "
              << (events[e].acrossRefused ? "true" : "false") << " }";
        j << "], \"notModelled\": ["
             "\"nucleation and supercooling: every point is the equilibrium"
             " ceiling\", "
             "\"a solid no record declares: a crystal needs the component's"
             " Hfus and triple point (sucrose.dat has no Hfus), a precipitate"
             " a chemistryDict solid its component owns\", "
             "\"solute inclusion in a crystal (ice is pure)\", "
             "\"the liquid/solid heat-capacity term of dG_fus (the record's"
             " own announcement)\"] }";
        block_ = j.str();
    }

    //  A scan that solved NOTHING produced no split; exit 0 with a CSV of
    //  nan is the shape the corpus NaN guard exists to catch.
    return nSolved > 0 ? 0 : 1;
}

} // namespace Choupo
