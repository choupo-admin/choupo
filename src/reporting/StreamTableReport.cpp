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

#include "StreamTableReport.H"
#include "BalanceMath.H"
#include "Topology.H"
#include "streams/StreamMass.H"
#include "core/FlatUnit.H"   // topLevelSector -- the ONE home for a chain's head

#include <algorithm>
#include <map>
#include <sstream>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

void StreamTableReport::run(const DictPtr& /*dict*/, const ReportContext& ctx)
{
    const auto topo = reporting::readTopology(ctx.flowsheetDict, ctx.result);

    auto roleOf = [&](const std::string& name) -> std::string {
        if (topo.feeds.count(name))    return "feed";
        if (topo.products.count(name)) return "product";
        return "intermediate";
    };

    //  ---- WHERE A STREAM LIVES, AND WHERE IT CROSSES ----------------------
    //
    //  The wiring of a fractal plant is in the root `connections {}` block --
    //  TOPOLOGY, which never lives in a state view -- and the state is
    //  scattered across one folder per sector.  So nothing anywhere showed
    //  the two together, and `0/MAIN/` holding three streams while the
    //  inter-sector connections are declared in MAIN reads as a contradiction
    //  it is not: a stream lives with the unit that PRODUCES it (which is
    //  what makes drill-in work -- CONCENTRATION opened alone needs its own
    //  `Magma` in its own `0/`), so `Magma` crosses CONCENTRATION -> DRYING
    //  and is filed under CONCENTRATION.  Two columns say so here.
    //
    //  `sector` is the OWNERSHIP rule's answer, deliberately -- the producer's
    //  sector, or the first consumer's for a stream nobody produces -- so the
    //  column names the folder the stream's state file is actually in.  Its
    //  value is the STAMPED `FlatUnit::sector`'s top-level segment, read
    //  through the one home `topLevelSector`, never a substring of a name.
    //
    //  EMPTY IS NOT A SECTOR CALLED "root" (the 2026-09-04 ruling).  A case
    //  whose units carry no sector gets NEITHER column -- not two empty ones,
    //  which would be a format change claiming a structure that is not there.
    //  Inside a plant that HAS sectors, a unit at the plant root is a
    //  different matter and keeps the honest `(no sector)` the design and
    //  economics CSVs already print for it.
    std::map<std::string, std::string> producerOf;      // stream -> unit
    std::map<std::string, std::vector<std::string>> consumersOf;
    std::map<std::string, std::string> unitSector;      // unit -> top sector
    bool anySector = false;
    for (const auto& u : topo.units)
    {
        const std::string sec = topLevelSector(u.sector);
        unitSector[u.name] = sec;
        if (!sec.empty()) anySector = true;
        for (const auto& o : u.outs) producerOf[o] = u.name;
        for (const auto& i : u.ins)  consumersOf[i].push_back(u.name);
    }
    const char* NO_SECTOR = "(no sector)";
    auto sectorOfUnit = [&](const std::string& unit) -> std::string {
        auto it = unitSector.find(unit);
        if (it == unitSector.end() || it->second.empty()) return NO_SECTOR;
        return it->second;
    };
    //  A BARE LABEL IS THE SAME STREAM UNDER THE AUTHOR'S OWN NAME, and the
    //  table lists it beside the qualified one.  It appears in no unit's ins
    //  or outs, so asking the topology about it directly answers "nobody owns
    //  this" -- which would have printed `(no sector)` against half this
    //  plant's rows, including `Magma`, the very stream that raised the
    //  question.  The label is resolved through the DECLARED bridge the
    //  relabel pass recorded (`result.boundaryAliasOf`), never by matching the
    //  bare name against the tail of a qualified one: that is the name
    //  identity this whole slice exists to remove.
    auto canonical = [&](const std::string& stream) -> std::string {
        auto a = ctx.result.boundaryAliasOf.find(stream);
        return a == ctx.result.boundaryAliasOf.end() ? stream : a->second;
    };
    //  A stream the flat topology does not know at all -- neither produced nor
    //  consumed, and no declared alias for one that is -- has no owning unit,
    //  so it has no sector to state.  That is an EMPTY cell, not `(no
    //  sector)`: the latter is a fact about a unit at the plant root, and
    //  saying it about a stream nobody owns would be an answer where there is
    //  none.
    auto known = [&](const std::string& stream) -> bool {
        return producerOf.count(stream) || consumersOf.count(stream);
    };
    //  The owning sector: the producer's, else the FIRST consumer's -- the
    //  same rule `StreamOwnership::ownershipPath` files the state file by, so
    //  this column and that folder cannot disagree.
    auto ownerSectorOf = [&](const std::string& raw) -> std::string {
        const std::string stream = canonical(raw);
        if (!known(stream)) return "";
        auto p = producerOf.find(stream);
        if (p != producerOf.end()) return sectorOfUnit(p->second);
        auto c = consumersOf.find(stream);
        if (c != consumersOf.end() && !c->second.empty())
            return sectorOfUnit(c->second.front());
        return NO_SECTOR;
    };
    //  `FROM->TO` for every sector this stream is handed ACROSS.  A stream
    //  with no producer (a domain inlet) or no consumer (a product) crosses
    //  nothing -- it enters or leaves the plant, which the `role` column
    //  already says.  A stream with consumers in more than one foreign sector
    //  gets one entry per sector, space-separated; the corpus has no such
    //  stream today, and the plural is written down rather than assumed away.
    auto crossingOf = [&](const std::string& raw) -> std::string {
        const std::string stream = canonical(raw);
        auto p = producerOf.find(stream);
        if (p == producerOf.end()) return "";
        const std::string from = sectorOfUnit(p->second);
        std::vector<std::string> to;
        auto c = consumersOf.find(stream);
        if (c != consumersOf.end())
            for (const auto& u : c->second)
            {
                const std::string s = sectorOfUnit(u);
                if (s != from && std::find(to.begin(), to.end(), s) == to.end())
                    to.push_back(s);
            }
        std::string out;
        for (const auto& s : to)
            out += (out.empty() ? "" : " ") + from + "->" + s;
        return out;
    };

    const auto& comps = ctx.result.componentNames;
    const std::filesystem::path dir = ctx.outDir("streamTable", "streams");
    std::filesystem::create_directories(dir);
    const std::filesystem::path path = dir / "streamTable.csv";
    std::ofstream f(path);
    if (!f.is_open())
        throw std::runtime_error("streamTable: cannot open " + path.string());

    //  SPECIES columns.  A reactive case's streams carry TWO bases and the
    //  table must show both: the apparent components that are the state, and
    //  the species the model resolved in them.  The column set is the UNION
    //  over the streams that carry a speciation -- a stream without one (an
    //  all-vapour line: ions do not enter a vapour) leaves them blank, which
    //  is the honest mark for "no aqueous phase here", not a zero.
    std::vector<std::string> species;
    bool anySpeciation = false;
    //  A complete-dissociation block has no H+ network behind it and so no
    //  pH; a whole case of them gets no pH COLUMN, rather than a column of
    //  blanks inviting the reader to wonder what went missing.
    bool anyPH = false;
    for (const auto& [name, s] : ctx.result.streams)
    {
        (void)name;
        if (!s.speciation) continue;
        anySpeciation = true;
        if (s.speciation->pH_valid) anyPH = true;
        for (const auto& [sp, v] : s.speciation->flows)
        {
            (void)v;
            if (std::find(species.begin(), species.end(), sp) == species.end())
                species.push_back(sp);
        }
    }
    std::sort(species.begin(), species.end());

    // Header
    f << "stream,role";
    if (anySector) f << ",sector,crossing";
    f << ",F_kmol_per_h,F_mass_kg_per_h,T_K,P_bar,vapourFraction,solids_kg_per_h,enthalpy_kW";
    for (const auto& c : comps) f << ",x_" << c;
    if (anySpeciation)
    {
        if (anyPH) f << ",pH";
        //  n_ (an AMOUNT), never x_: the species are a decomposition of the
        //  LIQUID, so a mole fraction over the whole stream would be a
        //  different denominator wearing the same prefix.
        for (const auto& sp : species) f << ",n_" << sp << "_kmol_per_h";
    }
    f << "\n";

    // Stable order: feed -> intermediate -> product, then by name.
    auto rank = [&](const std::string& n) {
        const std::string r = roleOf(n);
        return r == "feed" ? 0 : r == "intermediate" ? 1 : 2;
    };
    std::vector<std::string> names;
    for (const auto& [name, s] : ctx.result.streams) { (void)s; names.push_back(name); }
    std::sort(names.begin(), names.end(), [&](const std::string& a, const std::string& b) {
        const int ra = rank(a), rb = rank(b);
        return ra != rb ? ra < rb : a < b;
    });

    for (const auto& name : names)
    {
        const auto& s = ctx.result.streams.at(name);
        const scalar F_kmol_h = s.F * 3600.0;                  // kmol/s -> kmol/h
        const scalar Fm_kg_h  = F_massTotal(s, ctx.thermo) * 3600.0; // kg/s  -> kg/h
        f << name << "," << roleOf(name);
        if (anySector)
            f << "," << ownerSectorOf(name) << "," << crossingOf(name);
        f << "," << std::fixed << std::setprecision(6) << F_kmol_h
          << "," << Fm_kg_h
          << "," << std::setprecision(3) << s.T
          << "," << std::setprecision(4) << (s.P / 1.0e5)
          << "," << std::setprecision(4) << s.vf;
        scalar solidMass = 0.0;                                  // kg/h
        for (std::size_t i = 0; i < comps.size() && i < s.s.size(); ++i)
            solidMass += s.s[i] * ctx.thermo.comp(i).MW() * 3600.0;
        f << "," << std::setprecision(6) << solidMass;
        // Per-stream enthalpy flow [kW] on the ONE datum (elements, 25 C).
        // No sensible fallback: if a present species genuinely lacks elements
        // data the kernel throws -- for a DISPLAY table we catch that single
        // stream and print n/a (an honest "no elements enthalpy here"), never
        // a fabricated second datum.  The energy BALANCE, by contrast, lets
        // the throw propagate so the gap surfaces loudly.
        //  Build the field BEFORE writing the separator.  Streaming the comma
        //  first and then calling a function that may throw wrote the comma,
        //  hit the catch, and wrote ",n/a" -- TWO fields for one column, so
        //  every column after it shifted by one for any stream whose elements
        //  enthalpy is unavailable.  A CSV that silently mislabels its own
        //  columns is worse than one with a gap in it (found 2026-07-27, on a
        //  feed carrying a solid).
        {
            std::string hcell = "n/a";
            try
            {
                std::ostringstream os;
                os << std::fixed << std::setprecision(4)
                   << reporting::streamH_elements(s, ctx.thermo);
                hcell = os.str();
            }
            catch (const std::exception&) { }
            f << "," << hcell;
        }
        for (std::size_t i = 0; i < comps.size(); ++i)
        {
            const scalar xi = (i < s.z.size()) ? s.z[i] : 0.0;
            f << "," << std::setprecision(6) << xi;
        }
        if (anySpeciation)
        {
            if (!s.speciation)
                for (std::size_t k = 0; k < species.size() + (anyPH ? 1 : 0); ++k)
                    f << ",";
            else
            {
                //  NO pH IS A BLANK CELL, NEVER A ZERO.  A complete-
                //  dissociation block has no H+ network to solve a pH from,
                //  and `0.000` in this column does not read as "absent" -- it
                //  reads as a strongly acidic brine.  The no-speciation row
                //  above already leaves the cell empty; this one must agree.
                if (anyPH)
                {
                    f << ",";
                    if (s.speciation->pH_valid)
                        f << std::fixed << std::setprecision(3) << s.speciation->pH;
                }
                for (const auto& sp : species)
                {
                    scalar v = 0.0;
                    for (const auto& [nm, q] : s.speciation->flows)
                        if (nm == sp) { v = q; break; }
                    f << "," << std::scientific << std::setprecision(6)
                      << v * 3600.0;
                }
            }
        }
        f << "\n";
    }
    f.close();

    if (ctx.verbosity >= 2)
        std::cout << "  [report] streamTable -> " << path.string()
                  << "  (" << names.size() << " streams)\n";

    //  ---- the PHASE split, when a stream carries more than one -----------
    //
    //  The table above is one row per stream on the OVERALL material, and for
    //  a stream holding two liquids or a precipitate that row says nothing
    //  about the split -- flash19's liquid keeps 91 % of its benzene in a
    //  phase the table could not mention.  Widening the table by a column per
    //  (phase, component) would double it for every case, most of which have
    //  one phase, so this is its own artefact and it EXISTS ONLY when there is
    //  something to say: no second liquid and no solid anywhere, no file.
    //
    //  Long format -- one row per (stream, phase, component) -- because the
    //  phase set differs per stream and a wide table would be mostly blank.
    //  The AQUEOUS row is the fluid MINUS the organic (the engine stores only
    //  the organic side, the same as the stream files); the SOLID comes from
    //  s[], in the same molar basis as the rest, not the kg/h of the summary
    //  column above.
    bool anyPhases = false;
    for (const auto& [nm, s] : ctx.result.streams)
    {
        (void)nm;
        if ((s.organicLiquid && !s.organicLiquid->empty())
            || std::any_of(s.s.begin(), s.s.end(), [](scalar v){ return v != 0.0; }))
        { anyPhases = true; break; }
    }
    if (!anyPhases) return;

    const std::filesystem::path ppath = dir / "phases.csv";
    std::ofstream pf(ppath);
    if (!pf.is_open())
        throw std::runtime_error("streamTable: cannot open " + ppath.string());
    pf << "stream,phase,component,n_kmol_per_h\n";
    std::size_t rows = 0;
    for (const auto& name : names)
    {
        const auto& s = ctx.result.streams.at(name);
        const bool hasOrg = s.organicLiquid && !s.organicLiquid->empty();
        const bool hasSol = std::any_of(s.s.begin(), s.s.end(),
                                        [](scalar v){ return v != 0.0; });
        if (!hasOrg && !hasSol) continue;      // one phase: nothing to split
        auto row = [&](const char* phase, const std::string& comp, scalar n)
        {
            if (n == 0.0) return;
            pf << name << "," << phase << "," << comp << ","
               << std::scientific << std::setprecision(6) << n * 3600.0 << "\n";
            ++rows;
        };
        for (std::size_t i = 0; i < comps.size(); ++i)
        {
            const scalar fluid = s.F * ((i < s.z.size()) ? s.z[i] : 0.0);
            const scalar org = (hasOrg && i < s.organicLiquid->size())
                             ? (*s.organicLiquid)[i] : 0.0;
            //  A subtraction can leave a rounding crumb below any physical
            //  amount; that is the organic side's last digit, not a component
            //  of the aqueous phase.
            const scalar aq = fluid - org;
            row("aqueous", comps[i],
                (std::abs(aq) > 1e-15 * std::max(scalar(1), std::abs(fluid))) ? aq : 0.0);
            row("organic", comps[i], org);
            row("solid",   comps[i], (i < s.s.size()) ? s.s[i] : 0.0);
        }
    }
    pf.close();
    if (ctx.verbosity >= 2)
        std::cout << "  [report] streamTable -> " << ppath.string()
                  << "  (" << rows << " phase rows)\n";
}

} // namespace Choupo
