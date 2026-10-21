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

#include "Ppr78Kij.H"

#include "core/Advisory.H"
#include "thermo/RecordResolver.H"
#include "thermo/ThermoPackage.H"
#include "thermo/equationOfState/EquationOfState.H"

#include <chrono>
#include <cmath>
#include <ctime>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <set>
#include <sstream>
#include <stdexcept>

namespace Choupo {

namespace {

std::string todayUtc()
{
    using namespace std::chrono;
    auto t = system_clock::to_time_t(system_clock::now());
    std::tm tm{}; gmtime_r(&t, &tm);
    std::ostringstream os;
    os << std::put_time(&tm, "%Y-%m-%d");
    return os.str();
}

struct GroupPair
{
    scalar A = 0.0;      // MPa
    scalar B = 0.0;      // MPa
};

std::string pairKey(const std::string& k, const std::string& l)
{
    return (k < l) ? k + "|" + l : l + "|" + k;
}

} // namespace

int Ppr78Kij::run(const DictPtr& dict,
                  const ThermoPackage& thermo,
                  int verbosity)
{
    const std::string who = "ppr78Kij(" + dict->lookupWordOrDefault("name", "") + ")";

    // ---- the declaration ---------------------------------------------------
    const std::string tablePath = dict->lookupWord("groupTable");
    const scalar      T         = dict->lookupScalar("T", Dims::temperature);
    if (!dict->found("output") || !dict->subDict("output")->found("record"))
        throw std::runtime_error(who + ": `output { record \"<path>\"; }` is"
            " required -- the kij set this op computes is a FILE the case"
            " then declares, never a hidden runtime value.");
    const std::string outPath = dict->subDict("output")->lookupWord("record");
    records::refuseStandardsWrite(who, "output.record", outPath);

    std::vector<std::string> comps;
    if (dict->found("components")) comps = dict->lookupWordList("components");
    else
        for (std::size_t i = 0; i < thermo.n(); ++i) comps.push_back(thermo.comp(i).name());
    if (comps.size() < 2)
        throw std::runtime_error(who + ": fewer than two components -- a kij"
            " is a property of a PAIR.");

    // ---- the group table -----------------------------------------------------
    DictPtr tab = Dictionary::fromFile(tablePath);
    if (tab->lookupWordOrDefault("recordType", "") != "ppr78GroupTable")
        throw std::runtime_error(who + ": " + tablePath + " is not a"
            " `recordType ppr78GroupTable;` record.");
    const std::string method = tab->lookupWordOrDefault("method", "PPR78");
    const std::string tabEos = tab->lookupWordOrDefault("eos", "PengRobinson");
    if (tabEos != "PengRobinson")
        throw std::runtime_error(who + ": the group table declares eos "
            + tabEos + "; PPR78 / E-PPR78 kij are defined on PR78 (their Eq. 7"
              " carries PR78's a_i and b_i) and this op evaluates them on"
              " Choupo's PengRobinson, which IS PR78.");
    const std::string tabUnit = tab->lookupWordOrDefault("units", "MPa");
    if (tabUnit != "MPa")
        throw std::runtime_error(who + ": the group table's `units` must be"
            " MPa (the articles' own unit); got " + tabUnit + ".");
    const scalar Tref = tab->lookupScalarOrDefault("Tref", 298.15, Dims::temperature);
    const auto groups = tab->lookupWordList("groups");
    std::set<std::string> groupSet(groups.begin(), groups.end());

    std::map<std::string, GroupPair> table;
    for (const auto& e : tab->lookupDictList("interactions"))
    {
        const std::string k = e->lookupWord("k"), l = e->lookupWord("l");
        if (!groupSet.count(k) || !groupSet.count(l))
            throw std::runtime_error(who + ": interaction " + k + "-" + l
                + " names a group not in `groups`.");
        if (k == l)
            throw std::runtime_error(who + ": interaction " + k + "-" + l
                + " -- A_kk = B_kk = 0 by definition and is never listed.");
        const std::string key = pairKey(k, l);
        if (table.count(key))
            throw std::runtime_error(who + ": interaction " + k + "-" + l
                + " listed twice (A_kl = A_lk: list each pair ONCE).");
        GroupPair gp;
        gp.A = e->lookupScalar("A");
        gp.B = e->lookupScalar("B");
        if (gp.A == 0.0)
            throw std::runtime_error(who + ": interaction " + k + "-" + l
                + " has A = 0 -- the exponent B/A - 1 is undefined; a pair the"
                  " table prints N.A. is simply absent, never zero.");
        table[key] = gp;
    }

    // the data windows (optional): per group pair, the fitted T range
    struct Window { scalar lo = 0.0, hi = 0.0; };
    std::map<std::string, Window> windows;
    if (tab->found("dataWindows"))
        for (const auto& e : tab->lookupDictList("dataWindows"))
        {
            const auto t = e->lookupList("T");
            if (t.size() != 2 || t[0] >= t[1])
                throw std::runtime_error(who + ": dataWindows entry "
                    + e->lookupWord("k") + "-" + e->lookupWord("l")
                    + " needs `T ( lo hi );` in kelvin with lo < hi.");
            Window w; w.lo = t[0]; w.hi = t[1];
            windows[pairKey(e->lookupWord("k"), e->lookupWord("l"))] = w;
        }

    // the decompositions: alpha_ik per component
    auto dec = tab->subDict("decompositions");
    std::vector<std::map<std::string, scalar>> alpha(comps.size());
    std::vector<std::string> decoText(comps.size());
    for (std::size_t i = 0; i < comps.size(); ++i)
    {
        if (!dec->found(comps[i]))
            throw std::runtime_error(who + ": the group table declares no"
                " decomposition for component '" + comps[i] + "' -- the"
                " articles print none, so it is the curator's declaration,"
                " never derived here from a name or a formula.");
        auto d = dec->subDict(comps[i]);
        scalar total = 0.0;
        std::ostringstream txt;
        for (const auto& g : d->keys())
        {
            if (!groupSet.count(g))
                throw std::runtime_error(who + ": decomposition of '" + comps[i]
                    + "' names group '" + g + "', not in the table's `groups`.");
            const scalar cnt = d->lookupScalar(g);
            if (cnt <= 0.0)
                throw std::runtime_error(who + ": decomposition of '" + comps[i]
                    + "' gives group '" + g + "' a non-positive count.");
            alpha[i][g] = cnt;
            total += cnt;
            txt << (txt.str().empty() ? "" : " + ") << cnt << " " << g;
        }
        if (total <= 0.0)
            throw std::runtime_error(who + ": decomposition of '" + comps[i]
                + "' is empty.");
        for (auto& kv : alpha[i]) kv.second /= total;
        decoText[i] = txt.str();
    }

    // ---- a_i(T), b_i from the engine's own PR78 ----------------------------
    //  ONE home: the PACKAGE's own cubic fills a_i(T) and b_i through the same
    //  buildAi the flash runs (`PR::mixingLedger`), so the delta_i that
    //  prices kij is the a_i the package will use.  The system this op runs
    //  in must therefore declare PengRobinson (a Component is not copyable,
    //  and a second cubic built here would be a second home anyway).  The
    //  composition handed to the ledger does not enter a_i or b_i; an
    //  equimolar y keeps it well-formed.
    if (thermo.eos().modelName() != "PR")
        throw std::runtime_error(who + ": the system this op runs in declares"
            " equationOfState model '" + thermo.eos().modelName() + "'; the"
            " PPR78 kij are defined on PR78's a_i and b_i, so declare"
            " `equationOfState { model PengRobinson; }` (phi-phi) here.");
    sVector yEq(thermo.n(), 1.0 / static_cast<scalar>(thermo.n()));
    EquationOfState::MixingLedger led;
    if (!thermo.eos().mixingLedger(T, yEq, led))
        throw std::runtime_error(who + ": the package's EoS publishes no mixing ledger.");
    std::vector<scalar> delta(comps.size());           // sqrt(Pa)
    for (std::size_t i = 0; i < comps.size(); ++i)
    {
        const std::size_t k = thermo.indexOf(comps[i]);
        delta[i] = std::sqrt(led.a[k]) / led.b[k];
    }

    // ---- the pairs -------------------------------------------------------------
    struct Row
    {
        std::string i, j;
        scalar E_MPa = 0.0, dterm_MPa = 0.0, denom_MPa = 0.0, kij = 0.0;
        bool   extrap = false;
        std::string window;
    };
    std::vector<Row> rows;
    std::string extrapList;
    for (std::size_t i = 0; i < comps.size(); ++i)
        for (std::size_t j = i + 1; j < comps.size(); ++j)
        {
            //  the union of the groups the two molecules carry
            std::set<std::string> gs;
            for (const auto& kv : alpha[i]) gs.insert(kv.first);
            for (const auto& kv : alpha[j]) gs.insert(kv.first);
            auto a = [&](std::size_t m, const std::string& g) -> scalar
            {
                auto it = alpha[m].find(g);
                return (it == alpha[m].end()) ? 0.0 : it->second;
            };
            scalar sum = 0.0;                          // MPa
            for (const auto& k : gs)
                for (const auto& l : gs)
                {
                    if (k == l) continue;              // A_kk = B_kk = 0: skipped, not 0/0
                    const scalar dk = a(i, k) - a(j, k);
                    const scalar dl = a(i, l) - a(j, l);
                    if (dk == 0.0 || dl == 0.0) continue;
                    auto it = table.find(pairKey(k, l));
                    if (it == table.end())
                        throw std::runtime_error(who + ": pair " + comps[i]
                            + "-" + comps[j] + " needs the group interaction "
                            + k + "-" + l + ", which the table " + tablePath
                            + " does not carry (the article prints N.A. for"
                              " some pairs; a missing one is a gap to state,"
                              " never a zero to assume).");
                    const GroupPair& gp = it->second;
                    sum += dk * dl * gp.A * std::pow(Tref / T, gp.B / gp.A - 1.0);
                }
            Row r;
            r.i = comps[i]; r.j = comps[j];
            r.E_MPa     = -0.5 * sum;
            const scalar dd = delta[i] - delta[j];
            r.dterm_MPa = dd * dd / 1.0e6;
            r.denom_MPa = 2.0 * delta[i] * delta[j] / 1.0e6;
            r.kij       = (r.E_MPa - r.dterm_MPa) / r.denom_MPa;
            if (!std::isfinite(r.kij))
                throw std::runtime_error(who + ": pair " + r.i + "-" + r.j
                    + " gave a non-finite kij.");
            //  the data window of a SINGLE-group pair (the 2017 table's
            //  binaries are molecule = group); a multi-group molecule has no
            //  single window and none is claimed
            if (alpha[i].size() == 1 && alpha[j].size() == 1)
            {
                auto wit = windows.find(pairKey(alpha[i].begin()->first,
                                                alpha[j].begin()->first));
                if (wit != windows.end())
                {
                    std::ostringstream w;
                    w << std::fixed << std::setprecision(2) << wit->second.lo
                      << "-" << wit->second.hi << " K";
                    r.window = w.str();
                    r.extrap = (T < wit->second.lo || T > wit->second.hi);
                    if (r.extrap)
                        extrapList += (extrapList.empty() ? "" : ", ") + r.i + "-"
                                    + r.j + " (" + r.window + ")";
                }
            }
            rows.push_back(r);
            diag_["kij_" + r.i + "_" + r.j] = r.kij;
        }
    diag_["T_K"]   = T;
    diag_["nPairs"] = static_cast<scalar>(rows.size());
    headline_ = { "T_K", "nPairs" };

    // ---- the record ------------------------------------------------------------
    {
        namespace fs = std::filesystem;
        std::error_code ec;
        const fs::path parent = fs::path(outPath).parent_path();
        if (!parent.empty()) fs::create_directories(parent, ec);
    }
    std::ofstream f(outPath);
    if (!f)
        throw std::runtime_error(who + ": cannot open " + outPath + " for writing.");
    f << "/*---------------------------------------------------------------------------*\\\n"
      << "  kij SET -- " << method << " group-contribution binary interaction parameters\n"
      << "  of the PR78 equation of state, EVALUATED ONCE at T = " << std::fixed
      << std::setprecision(3) << T << " K and written here as the CONSTANTS\n"
      << "  the phi-phi package reads (DEV.md 4c C123, route P: \"kij a T declarada\").\n"
      << "\n"
      << "  Written " << todayUtc() << " by choupoProps " << who << ".  RE-RUN THAT OP\n"
      << "  to regenerate; do not edit a number here by hand.\n"
      << "\n"
      << "  SOURCE of every A_kl, B_kl and decomposition: " << tablePath << "\n"
      << "      " << tab->lookupWordOrDefault("source", "(the table record names its source)") << "\n"
      << "  EQUATION: k_ij = [E_ij - (delta_i - delta_j)^2] / (2 delta_i delta_j),\n"
      << "      delta_i = sqrt(a_i(T))/b_i on Choupo's own PR78 (PR::mixingLedger),\n"
      << "      E_ij = -1/2 SUM_k SUM_l (alpha_ik - alpha_jk)(alpha_il - alpha_jl)\n"
      << "             A_kl (" << std::setprecision(2) << Tref << "/T)^(B_kl/A_kl - 1),  A, B in MPa.\n"
      << "  The columns beside each kij are the three terms of that quotient, in MPa,\n"
      << "  so a reader can redo the division.\n";
    if (!extrapList.empty())
        f << "\n  EXTRAPOLATED IN T (their parameters were fitted on data whose range the\n"
          << "  table record declares; this T lies outside it): " << extrapList << "\n";
    f << "\\*---------------------------------------------------------------------------*/\n\n"
      << "recordType     eosBinaryInteractionSet;\n"
      << "schemaVersion  1;\n"
      << "eos            PengRobinson;\n"
      << "method         " << method << ";\n"
      << "T              " << std::setprecision(6) << T << " K;\n"
      << "groupTable     \"" << tablePath << "\";\n"
      << "reviewStatus   " << tab->lookupWordOrDefault("reviewStatus", "interim") << ";\n"
      << "licence        " << tab->lookupWordOrDefault("licence", "primaryCitation") << ";\n\n"
      << "decompositions   // alpha_ik = count / total, per molecule\n{\n";
    for (std::size_t i = 0; i < comps.size(); ++i)
        f << "    " << std::left << std::setw(14) << comps[i] << " \"" << decoText[i] << "\";\n";
    f << "}\n\n"
      << "pairs   // i  j  kij  |  E_ij [MPa]  (delta_i - delta_j)^2 [MPa]  2 delta_i delta_j [MPa]\n(\n";
    for (const auto& r : rows)
    {
        f << "    { i " << std::left << std::setw(12) << (r.i + ";")
          << " j " << std::setw(12) << (r.j + ";")
          << " kij " << std::right << std::fixed << std::setprecision(10) << std::setw(14) << r.kij << ";"
          << "  E_MPa " << std::setw(10) << std::setprecision(4) << r.E_MPa << ";"
          << "  deltaTerm_MPa " << std::setw(10) << r.dterm_MPa << ";"
          << "  denominator_MPa " << std::setw(10) << r.denom_MPa << ";";
        if (!r.window.empty())
            f << "  dataWindow \"" << r.window << "\";  extrapolated "
              << (r.extrap ? "yes" : "no") << ";";
        f << " }\n";
    }
    f << ");\n";
    f.close();

    // ---- the console -----------------------------------------------------------
    if (verbosity >= 2)
    {
        std::cout << "\n==========================  " << method << " kij  ==========================\n"
                  << "  T = " << std::fixed << std::setprecision(3) << T << " K   table "
                  << tablePath << "\n  " << rows.size() << " pair(s) written to " << outPath << "\n";
        if (verbosity >= 3)
        {
            std::cout << "   i             j               kij        E_ij[MPa]  dTerm[MPa]\n";
            for (const auto& r : rows)
                std::cout << "   " << std::left << std::setw(13) << r.i << " "
                          << std::setw(13) << r.j << std::right
                          << std::setw(11) << std::setprecision(6) << r.kij
                          << std::setw(12) << std::setprecision(4) << r.E_MPa
                          << std::setw(12) << r.dterm_MPa
                          << (r.extrap ? "   EXTRAPOLATED (" + r.window + ")" : "") << "\n";
        }
        std::cout << "=====================================================================\n\n";
    }
    if (!extrapList.empty())
    {
        const std::string msg = who + ": " + method + " extrapolated in T at "
            + std::to_string(T) + " K for " + extrapList
            + " -- written into the set record, repeated by every run that reads it";
        AdvisoryLog::instance().add("thermo", "warning", who + " extrapolation", msg);
        std::cerr << "[ppr78Kij] " << msg << "\n";
    }
    return 0;
}

} // namespace Choupo
