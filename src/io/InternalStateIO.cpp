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

#include "io/InternalStateIO.H"

#include "core/Dictionary.H"

#include "core/Advisory.H"
#include "core/FlatUnit.H"
#include "result/UnitProfile.H"

//  INCLUDE WHAT THIS FILE USES, not what its own header happens to pull in --
//  the `make wasm` lesson of 2026-08-27, held by `check_std_includes`.
#include <algorithm>
#include <cstddef>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <utility>
#include <variant>
#include <vector>

namespace fs = std::filesystem;

namespace Choupo
{
namespace InternalStateIO
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

//  A dotted sector ("A.B") is a path ("A/B"): the same geography the streams
//  are filed under.
fs::path sectorPathOf(const std::string& sector)
{
    fs::path    dir;
    std::string seg;
    for (char c : sector)
    {
        if (c == '.') { dir /= seg; seg.clear(); }
        else          { seg += c; }
    }
    if (!seg.empty()) dir /= seg;
    return dir;
}

//  The FILE a unit's interior lives in, RELATIVE to `<view>/internalStates/`:
//  `<SECTOR path>/<leaf>` where a sector exists, `<leaf>` where none does.
//  The sector is the STAMPED one, and the leaf is the qualified name with its
//  own sector's prefix removed -- and only when that prefix really is the
//  prefix.  This is not name identity: the sector is already known as data;
//  it is used only to find where its own prefix ends, so the tree does not
//  read `CONCENTRATION/CONCENTRATION.Cryst`.  ONE function serves the writer
//  and the reader, so the two can never disagree about an address.
fs::path unitFileOf(const std::string& uname, const std::string& sector)
{
    std::string leaf = uname;
    fs::path    dir;
    if (!sector.empty())
    {
        dir = sectorPathOf(sector);
        const std::string prefix = sector + ".";
        if (leaf.rfind(prefix, 0) == 0) leaf = leaf.substr(prefix.size());
    }
    return dir / leaf;
}

//  Is this file an interior RECORD?  The record says so itself -- nothing here
//  matches a file or a directory BY NAME.  Read as text before parsing so a
//  stream state file (or anything else living in the view) costs nothing.
bool looksLikeInternalState(const fs::path& file)
{
    std::ifstream probe(file.string());
    if (!probe.is_open()) return false;
    std::string body((std::istreambuf_iterator<char>(probe)),
                     std::istreambuf_iterator<char>());
    return body.find("recordType") != std::string::npos
        && body.find("internalState") != std::string::npos;
}

} // namespace

const std::vector<std::string>& knownKinds()
{
    static const std::vector<std::string> kinds =
        { "stageProfile", "axialProfile", "sizeDistribution", "swingTable",
          "profile" };
    return kinds;
}

std::string fileOf(const std::string& unitName, const std::string& sector)
{
    return (fs::path(ROOT) / unitFileOf(unitName, sector)).generic_string();
}

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

namespace
{

//  ONE BLOCK: the kind's name, then the axis, the point count, the columns
//  (axis first, then the rest as the profile holds them -- std::map,
//  alphabetical -- the same order `ProfilesReport` gives `profile.csv`) and
//  the markers.  Rendered at one indent so a unit with two kinds reads as
//  two blocks of one file.
void renderBlock(std::ostringstream& o, const std::string& kind,
                 const UnitProfile& prof, bool declared)
{
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

    o << kind << "\n{\n";
    o << "    xAxis       " << prof.xAxis << ";\n";
    o << "    nPoints     " << nPoints << ";\n";
    if (!declared)
        o << "\n    //  axis `" << prof.xAxis << "` has no declared kind in"
             " InternalStateIO::kindOf -- filed under the generic\n"
             "    //  name `profile` so it reaches the tree; give it one when"
             " its meaning is settled.\n";
    o << "\n    columns\n    {\n";
    for (const auto& c : cols)
    {
        const auto& vals = prof.columns.at(c);
        o << "        " << c << "\n        (";
        for (std::size_t i = 0; i < vals.size(); ++i)
        {
            //  Eight values a line: a 1000-point axial sweep stays a file a
            //  human can scroll, and a diff shows the value that moved
            //  rather than one line that changed.
            o << (i % 8 == 0 ? "\n            " : " ") << num(vals[i]);
        }
        o << "\n        );\n";
    }
    o << "    }\n";

    if (!prof.markers.empty())
    {
        o << "\n    markers\n    (\n";
        for (const auto& m : prof.markers)
            o << "        { x " << num(m.x) << "; label " << quoted(m.label)
              << "; }\n";
        o << "    );\n";
    }
    o << "}\n";
}

} // namespace

std::size_t write(const std::string&      viewRoot,
                  const SimulationResult& result,
                  int                     verbosity,
                  const std::map<std::string, std::vector<std::string>>&
                                          readsByType)
{
    //  STALE FILES CANNOT LINGER, AND NOT BECAUSE THIS FUNCTION REMOVES THEM.
    //  The view root is `converged/`, which its own writer removes and
    //  rebuilds WHOLE immediately before this runs -- streams first, then the
    //  interiors into the same fresh tree.  Removing anything here would
    //  delete the streams this snapshot exists to complete.
    const fs::path root = fs::path(viewRoot) / ROOT;
    std::error_code ec;

    //  NOTHING PUBLISHED, NO DIRECTORY.  A case whose units say nothing about
    //  their inside gets no `internalStates/` at all; an empty one would read
    //  as "every unit is hollow".
    if (result.profiles.empty()) return 0;

    //  The owning sector and the equipment type, from the flattened topology
    //  -- the sector is the one STAMPED at the flatten seam, never a split of
    //  the dotted name.  A profile whose unit is not in the topology keeps
    //  its file at the root with its whole name: the profile is still a fact
    //  about it.
    std::map<std::string, const FlatUnit*> unitOf;
    for (const auto& u : result.topology) unitOf[u.name] = &u;

    //  GROUP BY UNIT: one file per unit, one block per kind.  The result
    //  record holds one profile per unit today, so every vector below has
    //  one entry; the shape is 1:N with N = 1 (the `design/` precedent), and
    //  a second kind lands as a second block with nothing above it changing.
    std::map<std::string, std::vector<std::pair<std::string, const UnitProfile*>>> blocksOf;
    std::map<std::string, bool>  declaredOf;   // "unit/kind" -> declared?
    std::vector<std::string>     skipped;      // T_K profiles, by unit
    std::vector<std::string>     undeclared;   // "unit (axis)" with no kind
    std::vector<std::string>     axisless;     // refused: axis not a column
    for (const auto& [uname, prof] : result.profiles)
    {
        bool declared = true;
        const std::string kind = kindOf(prof.xAxis, declared);
        if (kind.empty())
        {
            skipped.push_back(uname);
            continue;
        }

        //  THE AXIS A PROFILE DECLARES MUST BE A COLUMN OF IT, and this is
        //  the seam that refuses it.  `renderBlock` emits `xAxis <name>;`
        //  unconditionally while emitting the axis COLUMN only when the
        //  profile carries one, so an axis-less profile becomes a file whose
        //  first key `read` rejects by name -- and the same incomplete record
        //  goes on to the result JSON, `profile.csv`, the spreadsheet and the
        //  GUI plot, all four of which look the axis up in `columns` and draw
        //  nothing when it is absent.  A writer whose output its own reader
        //  refuses is a bug in BOTH; this is the writer's half.
        //
        //  It REFUSES rather than throwing, and both halves are deliberate.
        //  It refuses because a file `0/` cannot accept must not be written.
        //  It does not throw because the call site has already ruled that a
        //  failure here is said and never fatal -- the answer is computed --
        //  and because a throw in this loop would take every OTHER unit's
        //  interior with it, the partial tree that lies by omission (the
        //  2026-09-04 design-sheet lesson).  Nothing a case declares can
        //  reach this: only a unit's own source can publish an axis it does
        //  not carry, so the refusal is a contract on unit authors and costs
        //  a student nothing.
        if (!prof.columns.count(prof.xAxis))
        {
            std::string have;
            for (const auto& [cname, cvals] : prof.columns)
            {
                (void)cvals;
                have += (have.empty() ? "" : ", ") + cname;
            }
            const std::string msg =
                "unit '" + uname + "' publishes a profile declaring `xAxis "
                + prof.xAxis + "` and carries no column of that name (it has: "
                + (have.empty() ? "nothing" : have) + ").  No `" + kind
                + "` block is written for it: the axis is the one column that"
                  " must be there, and a file declaring an axis it does not"
                  " carry is one this module's own reader refuses.  The same"
                  " incomplete record reaches the result JSON, profile.csv,"
                  " the spreadsheet and the GUI plot, each of which draws"
                  " nothing where the axis should be.  Fix the unit: store"
                  " the axis it declares.";
            std::cerr << "\nREFUSED interior: " << msg << "\n";
            AdvisoryLog::instance().add(
                "refusal", "warning", "internalState/" + uname, msg);
            axisless.push_back(uname + " (" + prof.xAxis + ")");
            continue;
        }

        if (!declared) undeclared.push_back(uname + " (" + prof.xAxis + ")");
        blocksOf[uname].emplace_back(kind, &prof);
        declaredOf[uname + "/" + kind] = declared;
    }

    std::size_t written = 0;
    for (const auto& [uname, blocks] : blocksOf)
    {
        std::string sector, etype;
        auto uit = unitOf.find(uname);
        if (uit != unitOf.end())
        {
            sector = uit->second->sector;
            etype  = uit->second->type;
        }

        const fs::path file = root / unitFileOf(uname, sector);
        fs::create_directories(file.parent_path(), ec);

        std::ostringstream o;
        o << "/*--------------------------------*- Choupo -*-----------------"
             "---------------*\\\n"
             "  THE INTERNAL STATE OF ONE UNIT, inside the state view that\n"
             "  holds its streams.  A state directory is a RESTARTABLE\n"
             "  SNAPSHOT: the streams are the boundary, this is what the\n"
             "  equipment holds between them.  One file per unit, one block\n"
             "  per kind of field (stageProfile, axialProfile,\n"
             "  sizeDistribution, swingTable), filed under `internalStates/`\n"
             "  so a unit and a stream sharing a name can never collide.\n"
             "\n"
             "  In `converged/` this file is REGENERATED WHOLE on every run\n"
             "  together with the streams beside it.  Do not edit it there --\n"
             "  an edit is destroyed by the next run without a word.\n"
             "\n";

        //  WHAT THIS FILE IS FOR DEPENDS ON THE UNIT, so the sentence does
        //  too.  Telling every reader to copy the file into `0/` was correct
        //  for ONE unit type and FATAL for every other: a declared field
        //  nobody reads is refused by name, exit 2, and both units that
        //  publish an interior in the flagship plant are in the second group.
        //  The same defect shape as commit d4e173fb0 -- a pop-out telling
        //  every reader to edit a file the run rewrites -- and the same
        //  remedy: condition the instruction on the fact the writer already
        //  holds.  The fact is asked of the CLASS
        //  (`UnitOperation::interiorKindsRead`) and handed in as data; no
        //  type is named here, so the sentence cannot go stale the day a
        //  second unit learns to read one.
        {
            std::vector<std::string> reads;
            {
                auto rit = readsByType.find(etype);
                if (rit != readsByType.end()) reads = rit->second;
            }
            std::vector<std::string> seeds, ignored;
            for (const auto& [kind, prof] : blocks)
            {
                (void)prof;
                if (std::find(reads.begin(), reads.end(), kind) != reads.end())
                    seeds.push_back(kind);
                else
                    ignored.push_back(kind);
            }
            auto list = [](const std::vector<std::string>& v)
            {
                std::string s;
                for (const auto& k : v) s += (s.empty() ? "" : ", ") + k;
                return s;
            };

            if (seeds.empty())
                o << "  THIS UNIT READS NO DECLARED INTERIOR.  It seeds its\n"
                     "  own and says so on every run, so copying this file\n"
                     "  into the case's `0/internalStates/` seeds NOTHING --\n"
                     "  the next run REFUSES it by name, because a declared\n"
                     "  field nobody reads is a comment sitting in the state\n"
                     "  directory.  What this file is for is READING: the\n"
                     "  state the equipment held at the answer, beside the\n"
                     "  streams that bound it.\n"
                     "\n";
            else
            {
                o << "  COPY it into the case's `0/internalStates/` at the\n"
                     "  same address to DECLARE it as the interior the next\n"
                     "  run starts from -- this unit reads " << list(seeds)
                  << ".  A\n"
                     "  declared profile that does not satisfy the balances\n"
                     "  is a SEED, not an answer.\n";
                if (!ignored.empty())
                    o << "  It does NOT read " << list(ignored)
                      << ": a copy carrying\n"
                         "  that block is refused by name, not ignored.\n";
                o << "\n";
            }
        }

        o <<
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

        for (const auto& [kind, prof] : blocks)
        {
            o << "\n";
            renderBlock(o, kind, *prof, declaredOf.at(uname + "/" + kind));
        }

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
            std::cout << "  [interior] " << skipped.size()
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
            std::cout << "  [interior] " << u
                      << ": axis has no declared kind -- written as a"
                         " `profile` block\n";
        for (const auto& u : axisless)
            std::cout << "  [interior] " << u
                      << ": REFUSED -- the declared axis is not a column of"
                         " the profile (said in full above)\n";
    }

    //  THE SUMMARY NAMES A DIRECTORY ONLY WHEN ONE EXISTS.  A run whose every
    //  profile was declined writes no `internalStates/` at all, and "wrote 0
    //  files" naming one would send the reader somewhere that is not there.
    if (verbosity >= 2)
    {
        if (written == 0)
            std::cout << "  [interior] nothing written: every published profile"
                         " was declined, so no " << ROOT << "/ exists in this"
                         " state view\n";
        else
            std::cout << "  [interior] wrote " << written << " unit interior"
                      << (written == 1 ? "" : "s") << " into "
                      << fs::path(viewRoot).filename().string() << "/" << ROOT
                      << "/  (one file per unit; regenerated whole with the"
                         " streams; do not edit)\n";
    }

    return written;
}


// ---------------------------------------------------------------------------
//  THE SEED WRITER -- `choupo-init0`'s half, and the only writer that ever
//  touches `0/`.
//
//  `write` above renders a PHOTOGRAPH: what a unit held at the answer, into a
//  view the engine rebuilds whole.  This renders a SEED: what a unit would
//  start from if the case declared nothing, into the view the AUTHOR owns.
//  The two are the same object in the same grammar -- the same `renderBlock`,
//  so what this writes the reader accepts -- and they differ in exactly one
//  place, the header sentence, because the two files answer different
//  questions and a file that misdescribes itself is the defect that has now
//  cost this module two commits.
//
//  IT WRITES THE UNIT'S OWN SEED, never a better one (the 2026-05-30 rule).
//  The profiles arrive from `UnitOperation::seedInterior`, built by the same
//  function the unit's `solve()` starts from; nothing is improved here, and
//  nothing is invented for a unit that publishes none.
// ---------------------------------------------------------------------------
std::size_t writeSeeds(const std::string&           viewRoot,
                       const std::vector<FlatUnit>& topology,
                       const std::map<std::string,
                                      std::map<std::string, UnitProfile>>& seeds,
                       bool                         force,
                       int                          verbosity,
                       std::size_t&                 kept)
{
    kept = 0;
    if (seeds.empty()) return 0;

    const fs::path root = fs::path(viewRoot) / ROOT;
    std::error_code ec;

    std::map<std::string, const FlatUnit*> unitOf;
    for (const auto& u : topology) unitOf[u.name] = &u;

    std::size_t written = 0;
    for (const auto& [uname, byKind] : seeds)
    {
        if (byKind.empty()) continue;

        std::string sector, etype;
        auto uit = unitOf.find(uname);
        if (uit != unitOf.end())
        {
            sector = uit->second->sector;
            etype  = uit->second->type;
        }

        const fs::path file = root / unitFileOf(uname, sector);

        //  THE TOOL'S POSTURE, UNCHANGED: an existing file is the author's
        //  and is never overwritten without `--force`.  A seed the student
        //  has edited is exactly what this feature exists to let them own.
        if (fs::exists(file) && !force)
        {
            if (verbosity >= 2)
                std::cout << "  [init0] kept      " << file.generic_string()
                          << "  (exists; --force regenerates)\n";
            ++kept;
            continue;
        }

        std::ostringstream o;
        o << "/*--------------------------------*- Choupo -*-----------------"
             "---------------*\\\n"
             "  THE INTERNAL STATE OF ONE UNIT, inside the state view that\n"
             "  holds its streams.  A state directory is a RESTARTABLE\n"
             "  SNAPSHOT: the streams are the boundary, this is what the\n"
             "  equipment holds between them.  One file per unit, one block\n"
             "  per kind of field (stageProfile, axialProfile,\n"
             "  sizeDistribution, swingTable), filed under `internalStates/`\n"
             "  so a unit and a stream sharing a name can never collide.\n"
             "\n"
             "  In `0/` this file is the AUTHOR'S: it is the state the next\n"
             "  run STARTS from, and no run ever rewrites it.  What is here\n"
             "  is the seed the unit would have invented for itself,\n"
             "  materialised by bin/choupo-init0 so it can be read, edited\n"
             "  and owned -- never a better guess chosen on your behalf.\n"
             "\n"
             "  A DECLARED PROFILE THAT DOES NOT SATISFY THE BALANCES IS A\n"
             "  SEED, NOT AN ANSWER: the iteration still decides.  Replace it\n"
             "  with converged/internalStates/ from a run of THIS case to\n"
             "  restart from the answer; the unit REFUSES by name a profile\n"
             "  that does not describe it, and deleting the file puts the\n"
             "  unit back on the seed it invents in code (announced).\n"
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

        for (const auto& [kind, prof] : byKind)
        {
            //  A SEED THIS MODULE'S OWN READER WOULD REFUSE IS NOT WRITTEN.
            //  Both halves of the 2026-09-07 writer contract apply here too:
            //  the block name must be the kind the axis derives (a unit that
            //  keys its seed under another word is describing a different
            //  field), and the axis must be a column of the profile.  Only a
            //  unit's own source can reach either, so this is a contract on
            //  unit authors and costs a student nothing.
            bool declared = true;
            const std::string derived = kindOf(prof.xAxis, declared);
            if (derived != kind || !prof.columns.count(prof.xAxis))
                throw std::runtime_error(
                    "internal state: unit '" + uname + "' offers a seed block `"
                    + kind + "` over axis `" + prof.xAxis + "`"
                    + (derived == kind
                         ? std::string(" and carries no column of that name")
                         : " and that axis is the kind `" + derived + "`")
                    + " -- a seed this module's own reader would refuse must"
                      " not be written.");
            o << "\n";
            renderBlock(o, kind, prof, declared);
        }

        fs::create_directories(file.parent_path(), ec);
        std::ofstream f(file.string(), std::ios::out | std::ios::trunc);
        if (!f.is_open())
            throw std::runtime_error("internal state: cannot open "
                                     + file.string());
        f << o.str();
        f.close();

        if (verbosity >= 1)
            std::cout << "  [init0] wrote     " << file.generic_string()
                      << "  (interior seed, " << etype << ")\n";
        ++written;
    }

    return written;
}


// ---------------------------------------------------------------------------
//  THE READER.  A state view's unit interiors, back as the very objects the
//  writer rendered.  `0/` is where this matters: what a case DECLARES there is
//  the interior the next run starts from, which is what makes a state
//  directory a RESTARTABLE SNAPSHOT rather than a photograph of the streams.
// ---------------------------------------------------------------------------
namespace
{

UnitProfile parseBlock(const DictPtr& d, const std::string& where)
{
    UnitProfile p;
    p.xAxis = d->lookupWord("xAxis");

    if (!d->found("columns"))
        throw std::runtime_error("declared interior " + where
            + ": no `columns {}` -- an interior with no field is not a"
              " state.");
    auto cols = d->subDict("columns");
    for (const auto& c : cols->keys())
        p.columns[c] = cols->lookupList(c);

    if (!p.columns.count(p.xAxis))
        throw std::runtime_error("declared interior " + where
            + ": declares `xAxis " + p.xAxis + ";` and carries no column of"
              " that name -- the axis is the one column that must be there.");

    if (d->found("markers"))
        for (const auto& m : d->lookupDictList("markers"))
            p.markers.push_back(
                ProfileMarker{ m->lookupScalar("x"),
                               m->lookupWordOrDefault("label", "") });
    return p;
}

} // namespace

std::map<std::string, std::map<std::string, UnitProfile>>
read(const std::string&           viewRoot,
     const std::vector<FlatUnit>& topology,
     int                          verbosity)
{
    std::map<std::string, std::map<std::string, UnitProfile>> out;
    const fs::path view(viewRoot);
    if (!fs::exists(view) || !fs::is_directory(view)) return out;
    const std::string viewName = view.filename().string();

    std::error_code ec;

    //  A RECORD FILED WHERE THE READER DOES NOT LOOK IS A DECLARATION
    //  SILENTLY DROPPED -- the retired one-directory-per-unit shape
    //  (`<view>/<SECTOR>/<unit>/<kind>`, 2026-09-06, one day old) would sit
    //  in the view, look like state, and seed nothing.  So the whole view is
    //  swept for records OUTSIDE `internalStates/`, and one found there
    //  refuses naming the address it must move to.
    for (const auto& e : fs::recursive_directory_iterator(view, ec))
    {
        if (!e.is_regular_file()) continue;
        const fs::path rel = fs::relative(e.path(), view, ec);
        if (rel.empty()) continue;
        if (rel.begin()->string() == ROOT) continue;
        if (!looksLikeInternalState(e.path())) continue;
        throw std::runtime_error(
            "MISFILED declared interior: " + viewName + "/" + rel.generic_string()
            + " declares `recordType internalState;` outside " + viewName + "/"
            + ROOT + "/.  A unit's interior is ONE file at"
              " <view>/" + std::string(ROOT) + "/<SECTOR>/<unit>, with one block"
              " per kind (stageProfile { ... }); the one-directory-per-unit"
              " shape <view>/<SECTOR>/<unit>/<kind> is retired.  Move the"
              " record there as a block, or delete it -- it would otherwise"
              " be skipped in silence, which is the defect a declared"
              " interior exists to remove.");
    }

    const fs::path root = view / ROOT;
    if (!fs::exists(root) || !fs::is_directory(root)) return out;

    //  The addresses the writer would use, as a lookup from the relative
    //  file path back to the unit that owns it.
    std::map<std::string, std::string> unitAt;      // "MAIN/C1" -> "MAIN.C1"
    for (const auto& u : topology)
        unitAt[unitFileOf(u.name, u.sector).generic_string()] = u.name;

    std::size_t files = 0, blocks = 0;
    for (const auto& e : fs::recursive_directory_iterator(root, ec))
    {
        if (!e.is_regular_file()) continue;
        const fs::path rel = fs::relative(e.path(), root, ec);
        if (rel.empty()) continue;
        const std::string relKey = rel.generic_string();
        const std::string where  = viewName + "/" + ROOT + "/" + relKey;

        //  This directory holds exactly one class of content.  A file in it
        //  that does not say it is an interior record is a misfiling, and
        //  naming it is cheaper than the hour spent wondering why the seed
        //  did not take.
        if (!looksLikeInternalState(e.path()))
            throw std::runtime_error(
                "declared interior " + where + " does not declare"
                " `recordType internalState;` -- every file under "
                + viewName + "/" + ROOT + "/ is a unit's interior record,"
                  " and this one does not say so.  Copy the record from"
                  " converged/" + ROOT + "/ after a run, or delete it.");

        auto it = unitAt.find(relKey);
        if (it == unitAt.end())
        {
            //  AN ORPHAN INTERIOR -- the same posture as an orphan stream
            //  file.  A record filed against a unit the flowsheet does not
            //  have is a claim about nothing, and a case that keeps it will
            //  keep believing the engine read it.
            std::string known;
            for (const auto& [k, v] : unitAt)
                known += (known.empty() ? "" : ", ") + k + " (" + v + ")";
            throw std::runtime_error(
                "ORPHAN declared interior: " + where + " -- the file '" + relKey
                + "' names no unit in the flattened flowsheet.  A unit's"
                  " interior lives at <view>/" + std::string(ROOT)
                + "/<SECTOR>/<unit>, at the address its STAMPED sector"
                  " dictates."
                + (known.empty()
                     ? std::string("  This flowsheet has no units at all.")
                     : "  The units this flowsheet has: " + known + "."));
        }
        const std::string& uname = it->second;

        //  ONE BLOCK PER KIND.  Every sub-dictionary of the record is a
        //  block, and its name must be a kind -- a block the vocabulary does
        //  not know is refused by name rather than carried along as a field
        //  nobody could ever read.
        auto d = Dictionary::fromFile(e.path().string());
        const auto& kinds = knownKinds();
        std::size_t here = 0;
        for (const auto& key : d->keys())
        {
            if (!std::holds_alternative<DictPtr>(d->entryValue(key))) continue;
            if (std::find(kinds.begin(), kinds.end(), key) == kinds.end())
            {
                std::string can;
                for (const auto& k : kinds) can += (can.empty() ? "" : ", ") + k;
                throw std::runtime_error(
                    "declared interior " + where + ": block `" + key
                    + "` is not a kind of internal state.  A block's name is"
                      " the kind of field it carries; the kinds are: " + can
                    + ".");
            }
            out[uname][key] = parseBlock(d->subDict(key), where + " (" + key + ")");
            ++here;
        }
        if (here == 0)
            throw std::runtime_error(
                "declared interior " + where + " carries no block -- an"
                " interior record with no kind of field declares nothing."
                "  It needs at least one block (stageProfile { ... }).");
        blocks += here;
        ++files;
    }

    if (verbosity >= 2 && files > 0)
    {
        std::cout << "  [interior] " << files << " declared interior"
                  << (files == 1 ? "" : "s") << " (" << blocks << " block"
                  << (blocks == 1 ? "" : "s") << ") read from "
                  << viewName << "/" << ROOT << "/:";
        for (const auto& [uname, byKind] : out)
            for (const auto& [kind, prof] : byKind)
            {
                (void)prof;
                std::cout << " " << uname << " (" << kind << ")";
            }
        std::cout << "\n";
    }
    return out;
}

} // namespace InternalStateIO
} // namespace Choupo

// ************************************************************************* //
