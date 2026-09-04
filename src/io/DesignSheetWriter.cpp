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

#include "io/DesignSheetWriter.H"

#include "core/PortRoles.H"
#include "streams/StreamMass.H"

#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <set>
#include <sstream>
#include <stdexcept>
#include <vector>

namespace fs = std::filesystem;

namespace Choupo
{
namespace DesignSheetWriter
{

namespace
{

//  A number as a reader wants it on a sheet: significant digits, not a fixed
//  number of decimals.  A sizing corpus spans a bench flash's 5e-3 m3 and a
//  plant's tens of thousands of kilograms; a fixed precision reproduces one
//  and gives two significant figures on the other.
std::string num(scalar v)
{
    std::ostringstream o;
    o << std::defaultfloat << std::setprecision(8) << v;
    return o.str();
}

//  `keyword  value unit;` -- the dict grammar's NAMED-UNIT form, the one the
//  parser reads back and the one `docs/ai/dict-syntax.md` recommends, so a
//  sheet is a dictionary and not merely a file that looks like one.
//
//  A DIMENSIONLESS VALUE DECLARES THE NULL DIMENSION VECTOR, `[0 0 0 0 0]`,
//  and does not simply omit the unit.  Omitting it writes `L_over_D 2.5;`,
//  which is the grammar's raw-SI form and means "the caller asserts the
//  dimensions" -- indistinguishable, to a reader AND to a gate, from a value
//  whose unit somebody forgot to declare.  That ambiguity is the exact defect
//  this whole slice exists to end, and it was found by the gate reporting
//  `L_over_D carries NO UNIT` about a ratio that declares `-` correctly.
//  The bracket form is the same grammar's other legal spelling and it is what
//  that spelling is FOR: a dimension with no name.
std::string entry(const std::string& key, scalar v, const std::string& unit,
                  std::size_t pad = 22)
{
    std::ostringstream o;
    o << "    " << std::left << std::setw(int(pad)) << key;
    if (unit == "-")
        o << "[0 0 0 0 0] " << num(v);
    else if (unit.empty())
        o << num(v);
    else
        o << num(v) << " " << unit;
    o << ";\n";
    return o.str();
}

//  One port block.  The state is the CONVERGED state of the stream at that
//  port; a port whose stream is not in the registry is written with its key
//  and role and NO state, rather than with zeros -- a zero temperature is a
//  claim, an absent one is not.
std::string portBlock(std::size_t                              i,
                      const std::string&                       global,
                      PortRoles::Role                          role,
                      const SimulationResult&                  result,
                      const ThermoPackage&                     thermo)
{
    std::ostringstream o;
    o << "    port" << i << "\n    {\n";
    o << "        global      \"" << global << "\";\n";
    o << "        bc          " << PortRoles::word(role) << ";\n";

    auto it = result.streams.find(global);
    if (it == result.streams.end())
    {
        o << "        //  no state: this stream is not in the solved"
             " registry (a boundary alias, or an\n"
             "        //  edge this domain does not carry).  Written without"
             " numbers rather than\n"
             "        //  with zeros -- a zero temperature is a claim.\n";
        o << "    }\n";
        return o.str();
    }

    const ProcessStream& s = it->second;
    o << "        T           " << num(s.T)  << " K;\n";
    o << "        P           " << num(s.P)  << " Pa;\n";
    o << "        F           " << num(s.F)  << " kmol/s;\n";

    //  THE WHOLE MASS -- fluid PLUS crystals.  `F_massTotal` (StreamMass.H) is
    //  the one home for this question, and its header says why: `F` and `z`
    //  describe the fluid phases, the solid rides in `s.s[]`, and a surface
    //  that multiplies `F` by the mixture molar mass silently drops the
    //  crystals.  A specification sheet whose mass flows do not add up is
    //  worse than one with none.
    o << "        mdot        " << num(F_massTotal(s, thermo))
      << " kg/s;\n";

    o << "        vapourFraction " << num(s.vf) << ";\n";
    o << "    }\n";
    return o.str();
}

} // namespace

std::size_t write(const std::string&                       caseRoot,
                  const SimulationResult&                  result,
                  const ThermoPackage&                     thermo,
                  int                                      verbosity)
{
    const fs::path root = fs::path(caseRoot) / "design";

    //  STALE SHEETS MUST NEVER LINGER.  A previous run's topology may have
    //  had units this one does not; leaving their sheets beside fresh ones
    //  would put equipment in the tree that this answer never sized.  Same
    //  posture, and the same call, as `converged/`.
    std::error_code ec;
    fs::remove_all(root, ec);

    //  NO SIZING PASS, NO DIRECTORY.  An empty `design/` reads as "sized,
    //  and everything came out empty"; an absent one reads as what it is.
    if (result.sizings.empty()) return 0;

    //  The port roles, from the ONE home.  The tear set is the resolved,
    //  qualified list the result carries -- never recovered by matching a
    //  bare authored word against a qualified name.
    std::set<std::string> tearSet(result.tearStreams.begin(),
                                  result.tearStreams.end());
    std::set<std::string> streamNames;
    for (const auto& [nm, s] : result.streams) { (void)s; streamNames.insert(nm); }
    const auto roles = PortRoles::classify(result.topology, tearSet, streamNames);

    //  The unit's ports, from the flattened topology.  A sized unit with no
    //  entry there keeps its sheet and gets no port blocks: the sizing is
    //  still a fact about it.
    std::map<std::string, const FlatUnit*> unitOf;
    for (const auto& u : result.topology) unitOf[u.name] = &u;

    std::size_t written = 0;
    std::vector<std::string> refusals;

    for (const auto& [uname, sz] : result.sizings)
    {
        //  THE DIRECTORY.  `design/<SECTOR>/<unit>/` where a sector exists,
        //  `design/<unit>/` where none does.  The sector is the one the
        //  flatten seam STAMPED on the sizing; it is never recovered by
        //  splitting the dotted unit name.
        fs::path dir = root;
        std::string leaf = uname;
        if (!sz.sector.empty())
        {
            dir /= sz.sector;
            //  THE LEAF NAME, and this is NOT the banned name-identity
            //  crossing.  The sector is not being INFERRED from the name --
            //  it is already known, stamped as data at the flatten seam and
            //  carried on the sizing.  The stamped sector is used only to
            //  find where its own prefix ends, and only when it really is
            //  the prefix; a name that does not begin with its sector keeps
            //  its whole self.  Without this, the tree reads
            //  `CONCENTRATION/CONCENTRATION.Evap2` -- the sector twice, once
            //  as a directory and once inside the name it already contains.
            const std::string prefix = sz.sector + ".";
            if (leaf.rfind(prefix, 0) == 0) leaf = leaf.substr(prefix.size());
        }
        dir /= leaf;
        fs::create_directories(dir, ec);

        //  THE SHEET'S NAME is the equipment type.  With one item per unit
        //  today that is unambiguous; when a unit realises several, each
        //  gets its own tag and this directory gains siblings.
        const std::string tag =
            sz.equipmentType.empty() ? std::string("equipment") : sz.equipmentType;

        std::ostringstream o;
        o << "/*--------------------------------*- Choupo -*-----------------"
             "---------------*\\\n"
             "  EQUIPMENT SPECIFICATION SHEET -- WRITTEN BY THE RUN.\n"
             "\n"
             "  This file is REGENERATED WHOLE on every run: the `design/`\n"
             "  tree is removed and rebuilt, exactly as `converged/` is.  Do\n"
             "  not edit it -- an edit is destroyed by the next run without a\n"
             "  word.  The inputs that produced it are `system/postDict`'s\n"
             "  `sizing {}` block and the case's converged state.\n"
             "\n"
             "  It is a Choupo dictionary: every value carries the unit it is\n"
             "  in, named as the dict grammar names it.  The units are the\n"
             "  ones the SIZER declared where it computed the value; they are\n"
             "  not all canonical SI, which is why each one is written down.\n"
             "\\*-----------------------------------------------------------"
             "----------------*/\n\n";

        o << "recordType  designSheet;\n\n";
        o << "unit        \"" << uname << "\";\n";
        if (!sz.sector.empty())
            o << "sector      " << sz.sector << ";\n";
        o << "equipment   " << tag << ";\n";
        o << "material    " << (sz.material.empty() ? std::string("(not stated)")
                                                    : sz.material) << ";\n";

        //  THE DESIGN ARGUMENT.  A volume is the same number whether a
        //  residence time, a space velocity or the author produced it, and
        //  those are three different design arguments.  A sheet without it
        //  can be reported and not defended.
        o << "basis       \"" << (sz.basis.empty() ? std::string("(not stated)")
                                                   : sz.basis) << "\";\n\n";

        //  ---- the ports ------------------------------------------------
        auto uit = unitOf.find(uname);
        if (uit == unitOf.end())
        {
            o << "//  This unit is not in the flattened topology, so its\n"
                 "//  inlets and outlets are unknown here.  Stated rather\n"
                 "//  than written as two empty blocks.\n\n";
        }
        else
        {
            const FlatUnit& fu = *uit->second;
            o << "inlets\n{\n";
            for (std::size_t i = 0; i < fu.ins.size(); ++i)
                o << portBlock(i, fu.ins[i], PortRoles::of(roles, fu.ins[i]),
                               result, thermo);
            o << "}\n\n";
            o << "outlets\n{\n";
            for (std::size_t i = 0; i < fu.outs.size(); ++i)
                o << portBlock(i, fu.outs[i], PortRoles::of(roles, fu.outs[i]),
                               result, thermo);
            o << "}\n\n";
        }

        //  ---- the size -------------------------------------------------
        //  ONE REFUSAL MUST NOT COST THE OTHER SHEETS.  The first draft threw
        //  from here, which aborted the whole loop: on a two-unit case the
        //  first unit's sheet was written, the second refused, and the tree
        //  was left PARTIAL with only a line on stderr -- a directory lying by
        //  omission, which is exactly the failure the report chain was fixed
        //  for on 2026-08-27 (one failing report used to kill every report
        //  after it).  So a refused unit is skipped BY NAME, its sheet is not
        //  written at all -- a sheet missing a value it should carry is worse
        //  than an absent one, because a reader cannot tell -- and every other
        //  unit still gets its page.
        std::string refusal;
        std::ostringstream sizingBlock;
        sizingBlock << "sizing\n{\n";
        for (const auto& [key, val] : sz.values)
        {
            const std::string u = sz.unitOf(key);
            if (u.empty())
            {
                refusal =
                    "unit '" + uname + "' declares a sizing value '" + key
                    + "' with NO UNIT.\n"
                      "  Every sizing value must name the unit it is in, at the"
                      " point where it is computed:\n"
                      "      d.set(\"" + key + "\", value, \"m3\");   // or"
                      " kW, bar, kg, -\n"
                      "  Writing `d.values[\"" + key + "\"]` directly bypasses"
                      " the one door that records it.\n"
                      "  A default would be a hand-written unit table, which is"
                      " what this replaced.";
                break;
            }
            sizingBlock << entry(key, val, u);
        }
        sizingBlock << "}\n";
        if (!refusal.empty())
        {
            refusals.push_back(refusal);
            continue;
        }
        o << sizingBlock.str();

        //  ---- the cost, when a costing pass ran ------------------------
        //  THE COST OF THIS EQUIPMENT belongs on this equipment's sheet: an
        //  auditor who has just read what was sized should not have to open
        //  another file to learn what it costs.  `economics/` answers a
        //  different question -- capital by sector, cash flow, IRR -- and
        //  none of that fits on one item's page.
        auto cit = result.costs.find(uname);
        if (cit != result.costs.end())
        {
            const CostBreakdown& cb = cit->second;
            o << "\ncost\n{\n";
            o << "    currency        " << cb.currency << ";\n";
            if (!cb.sizeKey.empty())
                o << "    sizeKey         " << cb.sizeKey << ";\n";
            if (!cb.correlation.empty())
                o << "    correlation     " << cb.correlation << ";\n";
            //  No unit word on the three costs: their unit is the CURRENCY,
            //  stated once by the `currency` key above.  Repeating it on each
            //  line would be three more homes for one fact, and `EUR_2026` is
            //  not a physical dimension the grammar can carry.
            o << entry("purchased",   cb.purchasedCost,   "", 16);
            o << entry("bareModule",  cb.bareModuleCost,  "", 16);
            o << entry("totalModule", cb.totalModuleCost, "", 16);
            if (!cb.factors.empty())
            {
                o << "    factors\n    {\n";
                for (const auto& [fk, fv] : cb.factors)
                    o << "        " << std::left << std::setw(20) << fk
                      << num(fv) << ";\n";
                o << "    }\n";
            }
            o << "}\n";
        }

        std::ofstream f((dir / tag).string(), std::ios::out | std::ios::trunc);
        if (!f.is_open())
            throw std::runtime_error("design sheet: cannot open "
                                     + (dir / tag).string());
        f << o.str();
        f.close();
        ++written;
    }

    //  THE REFUSALS ARE SAID ONCE, TOGETHER, AND ALWAYS -- not only when the
    //  run was asked to speak.  A tree with a unit missing is a tree a reader
    //  will read as complete.
    if (!refusals.empty())
    {
        std::cerr << "\n  [design] " << refusals.size() << " unit"
                  << (refusals.size() == 1 ? "" : "s")
                  << " got NO specification sheet:\n";
        for (const auto& r : refusals)
            std::cerr << "    - " << r << "\n";
    }

    if (verbosity >= 2)
        std::cout << "  [design] wrote " << written << " specification sheet"
                  << (written == 1 ? "" : "s") << " -> design/"
                  << (refusals.empty()
                          ? ""
                          : "  (" + std::to_string(refusals.size())
                                + " refused, above)")
                  << "  (regenerated whole; do not edit)\n";

    return written;
}

} // namespace DesignSheetWriter
} // namespace Choupo

// ************************************************************************* //
