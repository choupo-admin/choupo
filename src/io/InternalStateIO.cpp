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

#include "io/InternalStateWriter.H"

#include "core/FlatUnit.H"
#include "result/UnitProfile.H"

//  INCLUDE WHAT THIS FILE USES, not what its own header happens to pull in --
//  the `make wasm` lesson of 2026-08-27, held by `check_std_includes`.
#include <cstddef>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace fs = std::filesystem;

namespace Choupo
{
namespace InternalStateWriter
{

namespace
{

//  THE SAME PRECISION THE MACHINE CHANNEL USES.  `ResultEmitter::jsonNumber`
//  writes 12 significant digits in plain notation, and this file is a
//  projection of the record that channel publishes: written at the same
//  precision, the two surfaces agree to the last digit and a gate can hold
//  one to the other without a tolerance that hides a moved value.  A
//  non-finite value is written as the token the stream prints (`nan`, `inf`)
//  -- a fact about the run, not repaired into a number.
std::string num(scalar v)
{
    std::ostringstream o;
    o << std::defaultfloat << std::setprecision(12) << v;
    return o.str();
}

//  A string inside double quotes, with the two characters that would end or
//  escape it escaped.  Labels are the unit's own words ("feed stage").
std::string quoted(const std::string& s)
{
    std::string o = "\"";
    for (char c : s)
    {
        if (c == '"' || c == '\\') o += '\\';
        o += c;
    }
    return o + "\"";
}

} // namespace

std::string kindOf(const std::string& xAxis, bool& declared)
{
    declared = true;
    //  EXCLUDED, by decision (2026-09-05): a temperature axis is a parameter
    //  swept, not a coordinate of the equipment.  The van Heerden diagram
    //  (CSTR) and the Merkel construction (cooling tower) are analyses.
    if (xAxis == "T_K") return "";

    if (xAxis == "stage") return "stageProfile";
    if (xAxis == "V" || xAxis == "z" || xAxis == "z_m" || xAxis == "position")
        return "axialProfile";
    if (xAxis == "L_micron" || xAxis == "diameter_micron")
        return "sizeDistribution";
    //  The PSA / TSA table of loadings per component -- an INVENTORY of the
    //  bed, ruled internal state (Vítor, 2026-09-05).
    if (xAxis == "componentIndex") return "swingTable";

    declared = false;
    return "profile";
}

std::size_t write(const std::string&      caseRoot,
                  const SimulationResult& result,
                  int                     verbosity)
{
    const fs::path root = fs::path(caseRoot) / "internalStates";

    //  STALE FILES MUST NEVER LINGER.  A previous run's topology may have had
    //  units this one does not.  Same posture, same call, as `converged/`
    //  and `design/`.
    std::error_code ec;
    fs::remove_all(root, ec);

    //  NOTHING PUBLISHED, NO DIRECTORY.  An empty `internalStates/` reads as
    //  "every unit is hollow"; an absent one reads as what it is.
    if (result.profiles.empty()) return 0;

    //  The owning sector and the equipment type, from the flattened topology
    //  -- the sector is the one STAMPED at the flatten seam, never a split of
    //  the dotted name.  A profile whose unit is not in the topology keeps
    //  its file at the root with its whole name: the profile is still a fact
    //  about it.
    std::map<std::string, const FlatUnit*> unitOf;
    for (const auto& u : result.topology) unitOf[u.name] = &u;

    std::size_t              written = 0;
    std::vector<std::string> skipped;      // T_K profiles, by unit
    std::vector<std::string> undeclared;   // "unit (axis)" with no kind

    for (const auto& [uname, prof] : result.profiles)
    {
        bool declared = true;
        const std::string kind = kindOf(prof.xAxis, declared);
        if (kind.empty())
        {
            skipped.push_back(uname);
            continue;
        }
        if (!declared) undeclared.push_back(uname + " (" + prof.xAxis + ")");

        std::string sector, etype;
        auto uit = unitOf.find(uname);
        if (uit != unitOf.end())
        {
            sector = uit->second->sector;
            etype  = uit->second->type;
        }

        //  THE DIRECTORY.  `internalStates/<SECTOR>/<unit>/` where a sector
        //  exists, `internalStates/<unit>/` where none does.  The leaf is the
        //  qualified name with its OWN sector's prefix removed -- and only
        //  when that prefix really is the prefix.  This is not name identity:
        //  the sector is already known as data; it is used only to find where
        //  its own prefix ends, so the tree does not read
        //  `CONCENTRATION/CONCENTRATION.Cryst`.
        fs::path    dir  = root;
        std::string leaf = uname;
        if (!sector.empty())
        {
            dir /= sector;
            const std::string prefix = sector + ".";
            if (leaf.rfind(prefix, 0) == 0) leaf = leaf.substr(prefix.size());
        }
        dir /= leaf;
        fs::create_directories(dir, ec);

        //  THE COLUMN ORDER: the axis first, then the rest as the profile
        //  holds them (std::map -- alphabetical), the same order
        //  `ProfilesReport` gives `profile.csv`.
        std::vector<std::string> cols;
        if (prof.columns.count(prof.xAxis)) cols.push_back(prof.xAxis);
        for (const auto& [name, vals] : prof.columns)
        {
            (void)vals;
            if (name != prof.xAxis) cols.push_back(name);
        }
        std::size_t nPoints = 0;
        {
            auto xit = prof.columns.find(prof.xAxis);
            if (xit != prof.columns.end()) nPoints = xit->second.size();
            else
                for (const auto& [name, vals] : prof.columns)
                {
                    (void)name;
                    if (vals.size() > nPoints) nPoints = vals.size();
                }
        }

        std::ostringstream o;
        o << "/*--------------------------------*- Choupo -*-----------------"
             "---------------*\\\n"
             "  INTERNAL STATE OF ONE UNIT -- WRITTEN BY THE RUN.\n"
             "\n"
             "  This file is REGENERATED WHOLE on every run: the\n"
             "  `internalStates/` tree is removed and rebuilt, exactly as\n"
             "  `converged/` and `design/` are.  Do not edit it -- an edit is\n"
             "  destroyed by the next run without a word.\n"
             "\n"
             "  It is a PROJECTION of the profile this unit publishes through\n"
             "  `UnitOperation::profile()` -- the same record the result JSON\n"
             "  carries under `profiles` and `profile.csv` carries in the\n"
             "  reports.  Nothing here was computed for this file.\n"
             "\n"
             "  Internal state is a field over a coordinate of the equipment\n"
             "  (position, stage, particle size) or its inventory (loadings\n"
             "  per component); a construction over a parameter sweep\n"
             "  (van Heerden, Merkel) is an analysis and stays in the reports.\n"
             "\\*-----------------------------------------------------------"
             "----------------*/\n\n";

        o << "recordType  internalState;\n\n";
        o << "unit        " << quoted(uname) << ";\n";
        if (!sector.empty())
            o << "sector      " << sector << ";\n";
        o << "equipment   " << (etype.empty() ? std::string("(not in topology)")
                                              : etype) << ";\n";
        o << "xAxis       " << prof.xAxis << ";\n";
        o << "nPoints     " << nPoints << ";\n";
        if (!declared)
            o << "\n//  axis `" << prof.xAxis << "` has no declared kind in"
                 " InternalStateWriter::kindOf -- filed under the generic\n"
                 "//  name `profile` so it reaches the tree; give it one when"
                 " its meaning is settled.\n";
        o << "\n";

        o << "columns\n{\n";
        for (const auto& c : cols)
        {
            const auto& vals = prof.columns.at(c);
            o << "    " << c << "\n    (";
            for (std::size_t i = 0; i < vals.size(); ++i)
            {
                //  Eight values a line: a 1000-point axial sweep stays a
                //  file a human can scroll, and a diff shows the value that
                //  moved rather than one line that changed.
                o << (i % 8 == 0 ? "\n        " : " ") << num(vals[i]);
            }
            o << "\n    );\n";
        }
        o << "}\n";

        if (!prof.markers.empty())
        {
            o << "\nmarkers\n(\n";
            for (const auto& m : prof.markers)
                o << "    { x " << num(m.x) << "; label " << quoted(m.label)
                  << "; }\n";
            o << ");\n";
        }

        const fs::path file = dir / kind;
        std::ofstream f(file.string(), std::ios::out | std::ios::trunc);
        if (!f.is_open())
            throw std::runtime_error("internal state: cannot open "
                                     + file.string());
        f << o.str();
        f.close();
        ++written;
    }

    //  THE ANNOUNCEMENTS.  A skipped profile is a decision the reader must be
    //  able to see; an undeclared kind is the writer's own vocabulary falling
    //  short.  Both are said whenever the run speaks at all.
    if (verbosity >= 1)
    {
        if (!skipped.empty())
        {
            std::cout << "  [internalStates] " << skipped.size()
                      << " profile" << (skipped.size() == 1 ? "" : "s")
                      << " NOT written: xAxis T_K is a construction over a"
                         " parameter sweep (van Heerden, Merkel), an analysis"
                         " and not equipment state -- it stays in the reports"
                         " (";
            for (std::size_t i = 0; i < skipped.size(); ++i)
                std::cout << (i ? ", " : "") << skipped[i];
            std::cout << ")\n";
        }
        for (const auto& u : undeclared)
            std::cout << "  [internalStates] " << u
                      << ": axis has no declared kind -- written as"
                         " `profile`\n";
    }

    //  THE SUMMARY NAMES A DIRECTORY ONLY WHEN ONE EXISTS.  A run whose every
    //  profile was declined writes no tree, and "wrote 0 files ->
    //  internalStates/" would send the reader to a directory that is not there.
    if (verbosity >= 2)
    {
        if (written == 0)
            std::cout << "  [internalStates] nothing written: every published"
                         " profile was declined, so no internalStates/"
                         " directory exists\n";
        else
            std::cout << "  [internalStates] wrote " << written << " file"
                      << (written == 1 ? "" : "s")
                      << " -> internalStates/  (regenerated whole; do not"
                         " edit)\n";
    }

    return written;
}

} // namespace InternalStateWriter
} // namespace Choupo

// ************************************************************************* //
