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
-------------------------------------------------------------------------------
\*---------------------------------------------------------------------------*/

#include "postProcessing/layout/BuildingLayout.H"

#include "core/Advisory.H"
#include "core/Dimensions.H"
#include "core/RegistryRefusal.H"

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <functional>
#include <iomanip>
#include <iostream>
#include <map>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace Choupo
{
namespace buildingLayout
{

namespace
{

//  A wall shared to within this is a wall shared; an overlap smaller than it
//  is touching (the plant layout's own tolerance, for the same reason: a
//  coordinate that round-trips through 8 significant figures must not turn
//  touching into overlapping).
constexpr scalar kTol  = 1.0e-6;   // [m]
constexpr scalar kTolP = 1.0e-9;   // [Pa]

const char* const kOutside = "outside";

std::string num(scalar v, int prec = 6)
{
    std::ostringstream o;
    o << std::defaultfloat << std::setprecision(prec) << v;
    return o.str();
}

[[noreturn]] void refuse(const std::string& what)
{
    throw std::runtime_error("layoutDict building: " + what);
}

//  Both homes the caveat surface reads, in one call (PlantLayout's rule).
void announce(const std::string& locus, const std::string& message)
{
    std::cerr << "[building] " << message << "\n";
    AdvisoryLog::instance().add("layout", "warning", locus, message);
}

scalar length(const Dictionary& d, const std::string& key,
              const std::string& where)
{
    if (!d.found(key))
        refuse(where + ": `" + key + "` is not declared (a length, e.g. `"
               + key + " 12 m;`)");
    return d.lookupScalar(key, Dims::length);
}

std::string text(const Dictionary& d, const std::string& key,
                 const std::string& where)
{
    if (!d.found(key))
        refuse(where + ": `" + key + "` is not declared -- it is a sentence"
               " the case owes its reader (`" + key + " \"...\";`)");
    const std::string s = d.lookupWord(key);
    if (s.empty()) refuse(where + ": `" + key + "` is empty");
    return s;
}

std::string word(const Dictionary& d, const std::string& key,
                 const std::string& where,
                 const std::vector<std::string>& accepted)
{
    if (!d.found(key))
        refuse(where + ": `" + key + "` is not declared");
    const std::string w = d.lookupWord(key);
    if (std::find(accepted.begin(), accepted.end(), w) == accepted.end())
        refuse(where + ": " + registryRefusal::message(key, w, accepted,
                                                       "Accepted"));
    return w;
}

//  Cleanliness rank: A 4, B 3, C 2, D 1, CNC 0, outside -1.
int rankOf(const std::string& grade)
{
    if (grade == "A") return 4;
    if (grade == "B") return 3;
    if (grade == "C") return 2;
    if (grade == "D") return 1;
    if (grade == "CNC") return 0;
    return -1;
}

bool isAirlockRole(const std::string& role)
{
    return role == "personnelAirlock" || role == "materialAirlock"
        || role == "gowning";
}

//  The length two closed intervals overlap by (negative: a gap).
scalar overlap1(scalar a0, scalar a1, scalar b0, scalar b1)
{
    return std::min(a1, b1) - std::max(a0, b0);
}

//  The plan length of wall rooms a and b share (0 if none).
scalar sharedWall(const BuildingRoom& a, const BuildingRoom& b)
{
    const scalar oy = overlap1(a.yMin, a.yMax, b.yMin, b.yMax);
    const scalar ox = overlap1(a.xMin, a.xMax, b.xMin, b.xMax);
    if ((std::abs(a.xMax - b.xMin) < kTol || std::abs(b.xMax - a.xMin) < kTol)
        && oy > kTol)
        return oy;
    if ((std::abs(a.yMax - b.yMin) < kTol || std::abs(b.yMax - a.yMin) < kTol)
        && ox > kTol)
        return ox;
    return 0.0;
}

//  The length of r's boundary NOT shared with a room of its own floor: the
//  exterior wall a door to `outside` must be in.
scalar exteriorWall(const BuildingRoom& r, const std::vector<BuildingRoom>& rooms)
{
    //  Each edge: its interval along the edge, and the covered sub-intervals.
    struct Edge { bool vertical; scalar at, lo, hi; };
    const Edge edges[4] = {
        { true,  r.xMin, r.yMin, r.yMax }, { true,  r.xMax, r.yMin, r.yMax },
        { false, r.yMin, r.xMin, r.xMax }, { false, r.yMax, r.xMin, r.xMax } };
    scalar free = 0.0;
    for (const auto& e : edges)
    {
        std::vector<std::pair<scalar, scalar>> cov;
        for (const auto& o : rooms)
        {
            if (&o == &r || o.floor != r.floor) continue;
            if (e.vertical)
            {
                if (std::abs(o.xMin - e.at) < kTol || std::abs(o.xMax - e.at) < kTol)
                    cov.push_back({ std::max(e.lo, o.yMin), std::min(e.hi, o.yMax) });
            }
            else
            {
                if (std::abs(o.yMin - e.at) < kTol || std::abs(o.yMax - e.at) < kTol)
                    cov.push_back({ std::max(e.lo, o.xMin), std::min(e.hi, o.xMax) });
            }
        }
        std::sort(cov.begin(), cov.end());
        scalar covered = 0.0, reach = e.lo;
        for (const auto& c : cov)
        {
            if (c.second <= c.first) continue;
            const scalar a = std::max(c.first, reach);
            if (c.second > a) { covered += c.second - a; reach = c.second; }
        }
        free += (e.hi - e.lo) - covered;
    }
    return free;
}

//  The clear distance between two room volumes (0 when they touch or meet).
scalar boxGap(const BuildingRoom& a, const BuildingRoom& b)
{
    const scalar gx = std::max(0.0, -overlap1(a.xMin, a.xMax, b.xMin, b.xMax));
    const scalar gy = std::max(0.0, -overlap1(a.yMin, a.yMax, b.yMin, b.yMax));
    const scalar gz = std::max(0.0, -overlap1(a.z, a.z + a.height,
                                              b.z, b.z + b.height));
    return std::sqrt(gx * gx + gy * gy + gz * gz);
}

//  A room's plan box -- ONE reader, for `evaluate` and for `roomPlans` (the
//  plot rule reads the boxes before the building is checked).
void readBox(const Dictionary& e, const std::string& w, scalar& xMin,
             scalar& xMax, scalar& yMin, scalar& yMax)
{
    xMin = length(e, "xMin", w);  xMax = length(e, "xMax", w);
    yMin = length(e, "yMin", w);  yMax = length(e, "yMax", w);
    if (!(xMax - xMin > kTol) || !(yMax - yMin > kTol))
        refuse(w + ": the box is empty (`xMax` must exceed `xMin`, `yMax`"
               " `yMin`)");
}

std::string joined(const std::vector<std::string>& v, const char* sep = " ")
{
    std::string s;
    for (std::size_t i = 0; i < v.size(); ++i) s += (i ? sep : "") + v[i];
    return s;
}

} // namespace

std::vector<RoomPlan> roomPlans(const Dictionary& layoutDict)
{
    std::vector<RoomPlan> out;
    if (!layoutDict.found("building")) return out;
    const auto bd = layoutDict.subDict("building");
    if (!bd->found("rooms") || !bd->hasDictList("rooms")) return out;   // evaluate refuses
    for (const auto& e : bd->lookupDictList("rooms"))
    {
        RoomPlan p;
        if (!e->found("room")) refuse("rooms: an entry has no `room` name");
        p.name = e->lookupWord("room");
        readBox(*e, "room `" + p.name + "`", p.xMin, p.xMax, p.yMin, p.yMax);
        out.push_back(p);
    }
    return out;
}

BuildingRecord evaluate(const Dictionary& layoutDict,
                        const PlantLayoutRecord& plant, int verbosity)
{
    BuildingRecord rec;
    if (!layoutDict.found("building")) return rec;
    const auto bd = layoutDict.subDict("building");
    const Dictionary& d = *bd;
    rec.present = true;

    const std::string W = "building";
    rec.name   = text(d, "name", W);
    rec.source = text(d, "source", W);
    rec.reason = text(d, "reason", W);

    //  ---- the shell: a non-process item of the plot plan (optional) -------
    //  The building as the SITE sees it -- its footprint in the plot, its
    //  separations, its road access, its ignition -- is that item; the rooms
    //  are its interior and must lie inside its box.
    const LayoutItem* shell = nullptr;
    if (d.found("envelope"))
    {
        rec.envelope = d.lookupWord("envelope");
        std::vector<std::string> names;
        for (const auto& it : plant.items)
        {
            if (it.nonProcess) names.push_back(it.id);
            if (it.id == rec.envelope) shell = &it;
        }
        if (!shell)
            refuse("`envelope " + rec.envelope + ";` -- "
                   + registryRefusal::message("non-process item", rec.envelope,
                                              names, "Placed"));
        if (!shell->nonProcess)
            refuse("`envelope " + rec.envelope + ";` names a PROCESS item; a"
                   " building's shell is a `nonProcess` item of `items ( ... )`");
    }

    //  ---- the cascade's minimum step: the case's, with its source --------
    if (!d.found("cascade"))
        refuse("`cascade { minimumStep <Pa>; source \"...\"; reason \"...\"; }`"
               " is not declared -- the pressure cascade is checked against"
               " the step the case chose, and no step is shipped here");
    {
        const auto c = d.subDict("cascade");
        if (!c->found("minimumStep"))
            refuse("cascade: `minimumStep` is not declared (e.g. `minimumStep"
                   " 10 Pa;`)");
        rec.minimumStep = c->lookupScalar("minimumStep", Dims::pressure);
        if (!(rec.minimumStep > 0))
            refuse("cascade: `minimumStep` must be positive");
        rec.stepSource = text(*c, "source", "cascade");
        rec.stepReason = text(*c, "reason", "cascade");
    }
    if (d.found("atexSeparation"))
    {
        const auto a = d.subDict("atexSeparation");
        rec.atexSeparationDeclared = true;
        rec.atexDistance = length(*a, "distance", "atexSeparation");
        if (rec.atexDistance < 0)
            refuse("atexSeparation: `distance` must not be negative");
        rec.atexSource = text(*a, "source", "atexSeparation");
        rec.atexReason = text(*a, "reason", "atexSeparation");
    }

    //  ---- floors -----------------------------------------------------------
    if (!d.found("floors") || !d.hasDictList("floors"))
        refuse("`floors ( { floor <name>; elevation <m>; height <m>; } ... );`"
               " is not declared");
    std::map<std::string, std::size_t> floorIdx;
    for (const auto& f : d.lookupDictList("floors"))
    {
        BuildingFloor fl;
        if (!f->found("floor")) refuse("floors: an entry has no `floor` name");
        fl.name = f->lookupWord("floor");
        const std::string w = "floor `" + fl.name + "`";
        fl.elevation = length(*f, "elevation", w);
        fl.height    = length(*f, "height", w);
        if (!(fl.height > 0)) refuse(w + ": `height` must be positive");
        if (!floorIdx.emplace(fl.name, rec.floors.size()).second)
            refuse(w + " is declared twice");
        rec.floors.push_back(fl);
    }
    if (rec.floors.empty()) refuse("`floors` is empty");
    {
        std::vector<BuildingFloor> s = rec.floors;
        std::sort(s.begin(), s.end(), [](const BuildingFloor& a, const BuildingFloor& b)
                  { return a.elevation < b.elevation; });
        for (std::size_t i = 0; i + 1 < s.size(); ++i)
            if (s[i].elevation + s[i].height > s[i + 1].elevation + kTol)
                refuse("floor `" + s[i].name + "` (" + num(s[i].elevation) + " m + "
                       + num(s[i].height) + " m) reaches into floor `"
                       + s[i + 1].name + "` (at " + num(s[i + 1].elevation)
                       + " m) -- two storeys cannot share a height");
    }

    //  ---- rooms ------------------------------------------------------------
    if (!d.found("rooms") || !d.hasDictList("rooms"))
        refuse("`rooms ( { room <name>; floor; xMin; xMax; yMin; yMax; grade;"
               " pressure; relativeTo; } ... );` is not declared");
    std::map<std::string, std::size_t> roomIdx;
    std::vector<DictPtr> roomDicts = d.lookupDictList("rooms");
    for (const auto& e : roomDicts)
    {
        BuildingRoom r;
        if (!e->found("room")) refuse("rooms: an entry has no `room` name");
        r.name = e->lookupWord("room");
        const std::string w = "room `" + r.name + "`";
        if (r.name == kOutside)
            refuse(w + ": `outside` is the word for the world beyond the"
                   " walls; name the room something else");
        if (!roomIdx.emplace(r.name, rec.rooms.size()).second)
            refuse(w + " is declared twice");
        if (!e->found("floor")) refuse(w + ": `floor` is not declared");
        r.floor = e->lookupWord("floor");
        auto fi = floorIdx.find(r.floor);
        if (fi == floorIdx.end())
        {
            std::vector<std::string> names;
            for (const auto& f : rec.floors) names.push_back(f.name);
            refuse(w + ": " + registryRefusal::message("floor", r.floor, names,
                                                       "Declared"));
        }
        r.z      = rec.floors[fi->second].elevation;
        r.height = rec.floors[fi->second].height;
        //  A room may rise above its floor's height (a double-height suite
        //  round a tall item); the volume check below keeps it clear of the
        //  rooms of the floor above.
        if (e->found("height"))
        {
            r.height = length(*e, "height", w);
            if (!(r.height > 0)) refuse(w + ": `height` must be positive");
        }
        readBox(*e, w, r.xMin, r.xMax, r.yMin, r.yMax);
        r.area = (r.xMax - r.xMin) * (r.yMax - r.yMin);
        r.role = e->found("role")
               ? word(*e, "role", w, { "room", "personnelAirlock",
                                       "materialAirlock", "gowning" })
               : std::string("room");
        r.grade = word(*e, "grade", w, { "A", "B", "C", "D", "CNC" });
        if (isAirlockRole(r.role))
            r.regime = word(*e, "regime", w, { "cascade", "bubble", "sink" });
        else if (e->found("regime"))
            refuse(w + ": `regime` belongs to an airlock (`role"
                   " personnelAirlock | materialAirlock | gowning`); this"
                   " room's role is `" + r.role + "`");
        if (!e->found("pressure"))
            refuse(w + ": `pressure` is not declared (the room's differential,"
                   " e.g. `pressure 15 Pa; relativeTo corridor;`)");
        r.pressure = e->lookupScalar("pressure", Dims::pressure);
        if (!e->found("relativeTo"))
            refuse(w + ": `relativeTo` is not declared (a room, or `outside`)");
        r.relativeTo = e->lookupWord("relativeTo");
        if (e->found("containment"))
            r.containment = word(*e, "containment", w, { "yes", "no" }) == "yes";
        if (e->found("atex"))
        {
            const auto a = e->subDict("atex");
            if (!a->found("zone")) refuse(w + ": atex: `zone` is not declared");
            const scalar z = a->lookupScalar("zone");
            const int zi = static_cast<int>(std::lround(z));
            if (std::abs(z - zi) > 1e-12
                || !(zi == 0 || zi == 1 || zi == 2 || zi == 20 || zi == 21 || zi == 22))
                refuse(w + ": atex `zone` is " + num(z) + " -- a gas zone 0, 1"
                       " or 2 or a dust zone 20, 21 or 22 (the IEC 60079-10-1"
                       " / -10-2 vocabulary)");
            r.atexZone   = zi;
            r.atexSource = text(*a, "source", w + " atex");
            r.atexReason = text(*a, "reason", w + " atex");
        }
        if (e->found("ignition")) r.ignition = text(*e, "ignition", w);
        if (e->found("occupancy"))
        {
            const scalar o = e->lookupScalar("occupancy");
            if (o < 0 || std::abs(o - std::round(o)) > 1e-12)
                refuse(w + ": `occupancy` is a whole number of people");
            r.occupancy = static_cast<int>(std::lround(o));
            rec.occupancy += r.occupancy;
        }
        if (e->found("equipment")) r.equipment = e->lookupWordList("equipment");
        if (e->found("source") != e->found("reason"))
            refuse(w + ": declare both `source` and `reason`, or neither");
        if (e->found("source"))
        {
            r.source = text(*e, "source", w);
            r.reason = text(*e, "reason", w);
        }
        rec.floorArea += r.area;
        rec.rooms.push_back(r);
    }
    auto& R = rec.rooms;
    const std::size_t nR = R.size();
    if (nR == 0) refuse("`rooms` is empty");

    //  Pressures resolved to outside along the relativeTo chain.
    {
        std::vector<int> state(nR, 0);   // 0 new, 1 on the stack, 2 done
        std::function<scalar(std::size_t, std::vector<std::string>&)> resolve =
            [&](std::size_t i, std::vector<std::string>& chain) -> scalar
        {
            if (state[i] == 2) return R[i].pressureToOutside;
            chain.push_back(R[i].name);
            if (state[i] == 1)
                refuse("the `relativeTo` chain closes on itself: "
                       + joined(chain, " -> ") + " -- one room must be"
                       " relative to `outside`");
            state[i] = 1;
            scalar base = 0.0;
            if (R[i].relativeTo != kOutside)
            {
                auto it = roomIdx.find(R[i].relativeTo);
                if (it == roomIdx.end())
                    refuse("room `" + R[i].name + "`: `relativeTo "
                           + R[i].relativeTo + ";` names no room (a room of"
                           " this building, or `outside`)");
                base = resolve(it->second, chain);
            }
            R[i].pressureToOutside = base + R[i].pressure;
            state[i] = 2;
            chain.pop_back();
            return R[i].pressureToOutside;
        };
        for (std::size_t i = 0; i < nR; ++i)
        {
            std::vector<std::string> chain;
            resolve(i, chain);
        }
    }

    //  ---- geometry: two rooms never share a volume ------------------------
    for (std::size_t i = 0; i < nR; ++i)
        for (std::size_t j = i + 1; j < nR; ++j)
        {
            const scalar ox = overlap1(R[i].xMin, R[i].xMax, R[j].xMin, R[j].xMax);
            const scalar oy = overlap1(R[i].yMin, R[i].yMax, R[j].yMin, R[j].yMax);
            const scalar oz = overlap1(R[i].z, R[i].z + R[i].height,
                                       R[j].z, R[j].z + R[j].height);
            if (ox > kTol && oy > kTol && oz > kTol)
                refuse("rooms `" + R[i].name + "` (floor `" + R[i].floor + "`) and `"
                       + R[j].name + "` (floor `" + R[j].floor + "`) overlap by "
                       + num(ox * oy) + " m2 of plan over " + num(oz) + " m of"
                       " height -- two rooms cannot share a volume");
        }

    //  ---- the rooms inside the shell ---------------------------------------
    if (shell)
    {
        const scalar x0 = shell->x - 0.5 * shell->dx, x1 = shell->x + 0.5 * shell->dx;
        const scalar y0 = shell->y - 0.5 * shell->dy, y1 = shell->y + 0.5 * shell->dy;
        const scalar z0 = shell->z, z1 = shell->z + shell->dz;
        for (const auto& r : R)
            if (r.xMin < x0 - kTol || r.xMax > x1 + kTol || r.yMin < y0 - kTol
                || r.yMax > y1 + kTol || r.z < z0 - kTol || r.z + r.height > z1 + kTol)
                refuse("room `" + r.name + "` (x " + num(r.xMin) + ".." + num(r.xMax)
                       + ", y " + num(r.yMin) + ".." + num(r.yMax) + ", z "
                       + num(r.z) + ".." + num(r.z + r.height) + " m) does not lie"
                       " inside the building's envelope `" + rec.envelope + "` (x "
                       + num(x0) + ".." + num(x1) + ", y " + num(y0) + ".." + num(y1)
                       + ", z " + num(z0) + ".." + num(z1) + " m)");
    }

    //  ---- connections -----------------------------------------------------
    //  The spaces: room indices, and nR for `outside`.
    const std::size_t OUT = nR;
    auto spaceOf = [&](const std::string& n, const std::string& w) -> std::size_t
    {
        if (n == kOutside) return OUT;
        auto it = roomIdx.find(n);
        if (it == roomIdx.end())
            refuse(w + ": `" + n + "` names no room (a room of this building,"
                   " or `outside`)");
        return it->second;
    };
    auto nameOf = [&](std::size_t s) { return s == OUT ? std::string(kOutside) : R[s].name; };
    auto pOf    = [&](std::size_t s) { return s == OUT ? 0.0 : R[s].pressureToOutside; };
    auto rankS  = [&](std::size_t s) { return s == OUT ? -1 : rankOf(R[s].grade); };
    auto gradeS = [&](std::size_t s) { return s == OUT ? std::string(kOutside) : R[s].grade; };
    auto airlockS = [&](std::size_t s) { return s != OUT && isAirlockRole(R[s].role); };
    auto contS  = [&](std::size_t s) { return s != OUT && R[s].containment; };

    struct Link { std::size_t a, b; std::string type; };
    std::vector<Link> links;
    std::vector<std::vector<std::pair<std::size_t, std::string>>> adj(nR + 1);
    std::set<std::pair<std::size_t, std::size_t>> linked;
    if (!d.found("connections") || !d.hasDictList("connections"))
        refuse("`connections ( { between ( <room> <room|outside> ); type door"
               " | stair | lift; } ... );` is not declared");
    std::size_t nC = 0;
    for (const auto& c : d.lookupDictList("connections"))
    {
        ++nC;
        const std::string w0 = "connections entry " + std::to_string(nC);
        if (!c->found("between")) refuse(w0 + ": `between ( a b );` is not declared");
        const auto two = c->lookupWordList("between");
        if (two.size() != 2) refuse(w0 + ": `between` names exactly two spaces");
        const std::string w = "connection " + two[0] + " -- " + two[1];
        const std::size_t a = spaceOf(two[0], w), b = spaceOf(two[1], w);
        if (a == b) refuse(w + ": a space cannot open on itself");
        if (a == OUT)
            refuse(w + ": write the room first and `outside` second");
        const std::string type = word(*c, "type", w, { "door", "stair", "lift" });
        const auto key = std::make_pair(std::min(a, b), std::max(a, b));
        if (!linked.insert(key).second)
            refuse(w + " is declared twice -- one opening per pair of spaces");
        if (b == OUT)
        {
            if (type != "door")
                refuse(w + ": a `" + type + "` does not lead outside; a door does");
            if (exteriorWall(R[a], R) <= kTol)
                refuse(w + ": room `" + R[a].name + "` has no exterior wall --"
                       " every side of it is shared with another room of floor `"
                       + R[a].floor + "`, so no door of it opens outside");
        }
        else if (type == "door")
        {
            if (R[a].floor != R[b].floor)
                refuse(w + ": a door joins two rooms of ONE floor (`" + R[a].floor
                       + "` and `" + R[b].floor + "` here); a `stair` or a `lift`"
                       " joins two floors");
            if (sharedWall(R[a], R[b]) <= kTol)
                refuse(w + ": the two rooms share no wall, so no door joins"
                       " them -- move a room, or route the flow through the"
                       " room between them");
        }
        else
        {
            if (R[a].floor == R[b].floor)
                refuse(w + ": a `" + type + "` joins two floors; both rooms are"
                       " on `" + R[a].floor + "` (use a door)");
            if (!(overlap1(R[a].xMin, R[a].xMax, R[b].xMin, R[b].xMax) > kTol
                  && overlap1(R[a].yMin, R[a].yMax, R[b].yMin, R[b].yMax) > kTol))
                refuse(w + ": a `" + type + "` rises inside one shaft, so the two"
                       " rooms' plans must overlap -- they do not");
        }
        links.push_back({ a, b, type });
        adj[a].push_back({ b, type });
        adj[b].push_back({ a, type });
        BuildingConnection bc;
        bc.a = R[a].name;
        bc.b = nameOf(b);
        bc.type = type;
        bc.id = type + ":" + bc.a + ":" + bc.b;
        bc.dP = pOf(a) - pOf(b);
        rec.connections.push_back(bc);
    }

    //  ---- equipment, in its room --------------------------------------------
    std::map<std::string, const LayoutItem*> placedItems;
    for (const auto& it : plant.items) placedItems[it.id] = &it;
    std::map<std::string, std::string> assigned;
    for (const auto& r : R)
        for (const auto& id : r.equipment)
        {
            const std::string w = "room `" + r.name + "` equipment `" + id + "`";
            auto it = placedItems.find(id);
            if (it == placedItems.end())
                refuse(w + " is not placed on the plot plan -- list it in"
                       " `items ( ... )` (its x, y, z and orientation) first");
            if (!assigned.emplace(id, r.name).second)
                refuse(w + " is already in room `" + assigned[id] + "` -- one"
                       " item, one room");
            const LayoutItem& i = *it->second;
            const scalar x0 = i.x - 0.5 * i.dx, x1 = i.x + 0.5 * i.dx;
            const scalar y0 = i.y - 0.5 * i.dy, y1 = i.y + 0.5 * i.dy;
            if (x0 < r.xMin - kTol || x1 > r.xMax + kTol
                || y0 < r.yMin - kTol || y1 > r.yMax + kTol
                || i.z < r.z - kTol || i.z + i.dz > r.z + r.height + kTol)
                refuse(w + " does not fit its room: the item spans x " + num(x0)
                       + ".." + num(x1) + ", y " + num(y0) + ".." + num(y1)
                       + ", z " + num(i.z) + ".." + num(i.z + i.dz)
                       + " m; the room x " + num(r.xMin) + ".." + num(r.xMax)
                       + ", y " + num(r.yMin) + ".." + num(r.yMax) + ", z "
                       + num(r.z) + ".." + num(r.z + r.height) + " m");
        }
    for (const auto& i : plant.items)
    {
        if (assigned.count(i.id)) continue;
        if (shell && i.id == rec.envelope) continue;   // the shell itself
        for (const auto& r : R)
        {
            const scalar ox = overlap1(i.x - 0.5 * i.dx, i.x + 0.5 * i.dx, r.xMin, r.xMax);
            const scalar oy = overlap1(i.y - 0.5 * i.dy, i.y + 0.5 * i.dy, r.yMin, r.yMax);
            const scalar oz = overlap1(i.z, i.z + i.dz, r.z, r.z + r.height);
            if (ox > kTol && oy > kTol && oz > kTol)
                refuse("item `" + i.id + "` stands inside room `" + r.name
                       + "`, which does not list it -- add it to the room's"
                       " `equipment ( ... )` or move it out of the room");
        }
    }

    //  ---- the building against the site: roads, fence ------------------
    if (plant.roads.present)
        for (const auto& road : plant.roads.roads)
            for (std::size_t k = 0; k + 1 < road.centreline.size(); ++k)
            {
                const auto& p = road.centreline[k];
                const auto& q = road.centreline[k + 1];
                const scalar h = 0.5 * road.width;
                const scalar x0 = std::min(p[0], q[0]) - h, x1 = std::max(p[0], q[0]) + h;
                const scalar y0 = std::min(p[1], q[1]) - h, y1 = std::max(p[1], q[1]) + h;
                for (const auto& r : R)
                    if (r.z < plant.roads.headroom - kTol
                        && overlap1(x0, x1, r.xMin, r.xMax) > kTol
                        && overlap1(y0, y1, r.yMin, r.yMax) > kTol)
                        refuse("road `" + road.id + "` runs through room `" + r.name
                               + "` (floor `" + r.floor + "` at " + num(r.z)
                               + " m, below the roads' headroom of "
                               + num(plant.roads.headroom) + " m)");
            }
    if (plant.fence.present)
        for (const auto& r : R)
            if (r.xMin < plant.fence.xMin - kTol || r.xMax > plant.fence.xMax + kTol
                || r.yMin < plant.fence.yMin - kTol || r.yMax > plant.fence.yMax + kTol)
                refuse("room `" + r.name + "` stands across or outside the fence"
                       " (x " + num(plant.fence.xMin) + ".." + num(plant.fence.xMax)
                       + ", y " + num(plant.fence.yMin) + ".." + num(plant.fence.yMax)
                       + " m)");

    //  ---- flows and shared rooms -------------------------------------------
    const std::vector<std::string> kinds = { "personnel", "material", "waste" };
    std::set<std::string> flowNames;
    if (d.found("flows"))
    {
        if (!d.hasDictList("flows"))
            refuse("`flows` is a list of `{ flow \"<name>\"; kind; path ( ... ); }`");
        for (const auto& f : d.lookupDictList("flows"))
        {
            BuildingFlow fl;
            if (!f->found("flow")) refuse("flows: an entry has no `flow` name");
            fl.name = f->lookupWord("flow");
            const std::string w = "flow `" + fl.name + "`";
            //  A flow's name is its identity in the result (`flow:<name>`)
            //  and in the golden row that pins it, whose columns are split
            //  on whitespace: a name with a space would publish a record
            //  no row can read, so it would arrive unpinned.
            if (fl.name.find_first_of(" \t") != std::string::npos)
                refuse(w + ": a flow name is one word (it is the flow's id in"
                       " the result and in the golden); write it as one, e.g."
                       " `apiToSolution`, and say the rest in `reason`");
            if (!flowNames.insert(fl.name).second) refuse(w + " is declared twice");
            fl.kind = word(*f, "kind", w, kinds);
            if (!f->found("path")) refuse(w + ": `path ( ... );` is not declared");
            fl.path = f->lookupWordList("path");
            if (fl.path.size() < 2)
                refuse(w + ": a flow moves from one space to another -- its path"
                       " names at least two");
            for (std::size_t k = 0; k < fl.path.size(); ++k)
            {
                spaceOf(fl.path[k], w);
                if (k && fl.path[k] == fl.path[k - 1])
                    refuse(w + ": `" + fl.path[k] + "` follows itself in the path");
            }
            if (f->found("reason")) fl.reason = text(*f, "reason", w);
            rec.flows.push_back(fl);
        }
    }
    //  shared[room] = the set of flow kinds the case declared may meet there.
    std::map<std::string, std::set<std::string>> sharedBy;
    if (d.found("shared"))
    {
        if (!d.hasDictList("shared"))
            refuse("`shared` is a list of `{ room <name>; flows ( <kind> <kind> );"
                   " reason \"...\"; }`");
        for (const auto& s : d.lookupDictList("shared"))
        {
            BuildingShared sh;
            if (!s->found("room")) refuse("shared: an entry has no `room`");
            sh.room = s->lookupWord("room");
            const std::string w = "shared `" + sh.room + "`";
            if (sh.room == kOutside || !roomIdx.count(sh.room))
                refuse(w + ": names no room of this building");
            if (!s->found("flows")) refuse(w + ": `flows ( ... );` is not declared");
            sh.flows = s->lookupWordList("flows");
            std::set<std::string> u(sh.flows.begin(), sh.flows.end());
            if (u.size() != sh.flows.size() || u.size() < 2)
                refuse(w + ": `flows` names two or three DIFFERENT kinds");
            for (const auto& k : sh.flows)
                if (std::find(kinds.begin(), kinds.end(), k) == kinds.end())
                    refuse(w + ": " + registryRefusal::message("flow kind", k, kinds,
                                                               "Accepted"));
            sh.reason = text(*s, "reason", w);
            for (const auto& k : sh.flows) sharedBy[sh.room].insert(k);
            rec.shared.push_back(sh);
        }
    }
    auto isShared = [&](const std::string& room, const std::string& k1,
                        const std::string& k2)
    {
        auto it = sharedBy.find(room);
        return it != sharedBy.end() && it->second.count(k1) && it->second.count(k2);
    };

    //  ======================================================================
    //  THE RULES -- every one ANNOUNCED, none refused.
    //  ======================================================================
    std::set<std::string> raised;
    auto addFinding = [&](const std::string& kind, const std::string& a,
                          const std::string& b, scalar value, scalar limit,
                          const std::string& message)
    {
        const std::string id = kind + ":" + a + ":" + b;
        if (!raised.insert(id).second) return;
        BuildingFinding f;
        f.id = id; f.kind = kind; f.a = a; f.b = b;
        f.value = value; f.limit = limit; f.message = message;
        rec.findings.push_back(f);
        announce("building '" + a + "'", message);
    };
    const scalar step = rec.minimumStep;
    auto pa = [&](scalar p) { return num(p) + " Pa"; };

    //  (1) THE CASCADE between two connected spaces, neither an airlock.
    //  A containment room against a non-containment space is governed by the
    //  containment rules (it is deliberately LOWER), so the cascade is not
    //  asked of that pair.
    auto cascadeCheck = [&](std::size_t u, std::size_t v, const std::string& via)
    {
        if (contS(u) != contS(v)) return;
        if (rankS(u) == rankS(v)) return;
        const std::size_t clean = rankS(u) > rankS(v) ? u : v;
        const std::size_t dirty = clean == u ? v : u;
        if (rankS(clean) < 1) return;    // CNC against outside: no grade at stake
        const scalar dp = pOf(clean) - pOf(dirty);
        if (dp < step - kTolP)
            addFinding("cascade", nameOf(clean), nameOf(dirty), dp, step,
                "pressure cascade: `" + nameOf(clean) + "` (grade " + gradeS(clean)
                + ", " + pa(pOf(clean)) + " to outside) is "
                + (dp < 0 ? "BELOW" : "above") + " `" + nameOf(dirty) + "` ("
                + gradeS(dirty) + ", " + pa(pOf(dirty)) + ")" + via + " by "
                + pa(dp) + ", short of the declared minimum step of " + pa(step)
                + " -- air would not move from the cleaner room to the less"
                " clean one with the margin the case asked for");
    };
    for (const auto& l : links)
    {
        if (airlockS(l.a) || airlockS(l.b)) continue;
        cascadeCheck(l.a, l.b, "");
    }

    //  (2) THE AIRLOCKS: the regime the case declared, against the pressures
    //  it declared; and across a cascade airlock, the cascade itself.
    for (std::size_t i = 0; i < nR; ++i)
    {
        if (!isAirlockRole(R[i].role)) continue;
        std::vector<std::size_t> nb;
        for (const auto& e : adj[i])
            if (std::find(nb.begin(), nb.end(), e.first) == nb.end())
                nb.push_back(e.first);
        if (nb.size() < 2)
        {
            addFinding("airlockRegime", R[i].name, "", static_cast<scalar>(nb.size()), 2,
                "airlock `" + R[i].name + "` opens on "
                + std::to_string(nb.size()) + " space(s) -- an airlock stands"
                " BETWEEN two, or it separates nothing");
            continue;
        }
        scalar pmin = pOf(nb[0]), pmax = pOf(nb[0]);
        for (auto s : nb) { pmin = std::min(pmin, pOf(s)); pmax = std::max(pmax, pOf(s)); }
        const scalar p = R[i].pressureToOutside;
        const std::string head = "airlock `" + R[i].name + "` is declared a "
                                 + R[i].regime + " at " + pa(p) + " to outside, ";
        if (R[i].regime == "bubble" && p - pmax < step - kTolP)
            addFinding("airlockRegime", R[i].name, R[i].regime, p - pmax, step,
                head + "but it is above its highest neighbour (" + pa(pmax)
                + ") by only " + pa(p - pmax) + ", short of the step of "
                + pa(step) + " -- a bubble pushes air OUT through both doors");
        else if (R[i].regime == "sink" && pmin - p < step - kTolP)
            addFinding("airlockRegime", R[i].name, R[i].regime, pmin - p, step,
                head + "but it is below its lowest neighbour (" + pa(pmin)
                + ") by only " + pa(pmin - p) + ", short of the step of "
                + pa(step) + " -- a sink draws air IN through both doors");
        else if (R[i].regime == "cascade")
        {
            const scalar margin = std::min(p - pmin, pmax - p);
            if (margin <= kTolP)
                addFinding("airlockRegime", R[i].name, R[i].regime, margin, 0,
                    head + "but it does not lie strictly between its neighbours ("
                    + pa(pmin) + " .. " + pa(pmax) + ") -- a cascade airlock is a"
                    " step DOWN from the cleaner side to the less clean one");
            for (std::size_t x = 0; x < nb.size(); ++x)
                for (std::size_t y = x + 1; y < nb.size(); ++y)
                    if (!airlockS(nb[x]) && !airlockS(nb[y]))
                        cascadeCheck(nb[x], nb[y], " across airlock `" + R[i].name + "`");
        }
    }

    //  (3) A CHANGE OF GRADE goes through an airlock.
    for (const auto& l : links)
    {
        if (airlockS(l.a) || airlockS(l.b)) continue;
        if (rankS(l.a) == rankS(l.b)) continue;
        if (std::max(rankS(l.a), rankS(l.b)) < 1) continue;
        addFinding("gradeChangeWithoutAirlock", nameOf(l.a), nameOf(l.b), 0, 0,
            "`" + nameOf(l.a) + "` (" + gradeS(l.a) + ") opens on `" + nameOf(l.b)
            + "` (" + gradeS(l.b) + ") through a " + l.type + ", not an airlock"
            " -- people and material moving between different grades pass an"
            " airlock (EU GMP Annex 1 para 4.12)");
    }

    //  (4) CONTAINMENT: dust stays in.
    for (std::size_t i = 0; i < nR; ++i)
    {
        if (!R[i].containment) continue;
        for (const auto& e : adj[i])
        {
            const std::size_t n = e.first;
            if (contS(n)) continue;
            if (!airlockS(n))
                addFinding("containmentAccess", R[i].name, nameOf(n), 0, 0,
                    "containment room `" + R[i].name + "` opens directly on `"
                    + nameOf(n) + "` -- a contained room is reached through a"
                    " bubble or a sink airlock, which keeps its dust in");
            else if (R[n].regime == "cascade")
                addFinding("containmentAccess", R[i].name, nameOf(n), 0, 0,
                    "containment room `" + R[i].name + "` is reached through `"
                    + nameOf(n) + "`, a CASCADE airlock -- a cascade passes the"
                    " room's air on; a bubble or a sink stops it");
            if (airlockS(n) && R[n].regime == "sink") continue;
            const scalar dn = pOf(n) - R[i].pressureToOutside;
            if (dn < step - kTolP)
                addFinding("containmentNotNegative", R[i].name, nameOf(n), dn, step,
                    "containment room `" + R[i].name + "` (" + pa(R[i].pressureToOutside)
                    + ") is not below `" + nameOf(n) + "` (" + pa(pOf(n))
                    + ") by the step of " + pa(step) + " (it is below by "
                    + pa(dn) + ") -- a contained room is NEGATIVE to its"
                    " neighbours, so air moves in and the dust stays in");
        }
    }

    //  (5) THE FLOWS.
    auto connectedPair = [&](std::size_t a, std::size_t b)
    {
        return linked.count({ std::min(a, b), std::max(a, b) }) != 0;
    };
    for (auto& fl : rec.flows)
    {
        for (std::size_t k = 0; k + 1 < fl.path.size(); ++k)
        {
            const std::size_t a = spaceOf(fl.path[k], ""), b = spaceOf(fl.path[k + 1], "");
            if (!connectedPair(a, b))
            {
                fl.connected = false;
                addFinding("flowBreak", fl.name, fl.path[k] + "->" + fl.path[k + 1], 0, 0,
                    fl.kind + " flow `" + fl.name + "` steps from `" + fl.path[k]
                    + "` to `" + fl.path[k + 1] + "`, and no door, stair or lift"
                    " joins them -- the path goes through a wall");
            }
        }
        for (std::size_t k = 0; k < fl.path.size(); ++k)
        {
            const std::size_t s = spaceOf(fl.path[k], "");
            if (s == OUT || !isAirlockRole(R[s].role)) continue;
            const bool personnel = fl.kind == "personnel";
            const bool wrong = personnel ? R[s].role == "materialAirlock"
                                         : R[s].role != "materialAirlock";
            const std::string other = personnel ? "material" : "personnel";
            if (wrong && !isShared(R[s].name, fl.kind, other))
                addFinding("wrongAirlock", fl.name, R[s].name, 0, 0,
                    fl.kind + " flow `" + fl.name + "` passes `" + R[s].name
                    + "`, a " + R[s].role + " -- "
                    + (personnel ? "people use a personnel airlock"
                                 : "material and waste use a material airlock")
                    + " (Annex 1 para 4.12 separates the two where possible);"
                    " declare the room `shared` with a reason if this is the design");
        }
        if (fl.kind == "material")
        {
            std::set<std::string> seen;
            for (const auto& n : fl.path)
                if (n != kOutside && !seen.insert(n).second)
                    addFinding("materialRevisit", fl.name, n, 0, 0,
                        "material flow `" + fl.name + "` enters `" + n + "` twice"
                        " -- the material flow is one-way, raw to product, and a"
                        " room it returns to holds clean and less clean together");
        }
        if (fl.kind == "personnel")
        {
            int gowned = -1;
            std::string lastGown;
            for (const auto& n : fl.path)
            {
                const std::size_t s = spaceOf(n, "");
                if (s == OUT) { gowned = -1; lastGown.clear(); continue; }
                const auto& r = R[s];
                if (r.role == "gowning") { gowned = rankOf(r.grade); lastGown = r.name; continue; }
                if (isAirlockRole(r.role)) continue;
                const int rk = rankOf(r.grade);
                if (rk < 1) { gowned = -1; lastGown.clear(); continue; }
                if (rk > gowned)
                    addFinding("ungownedEntry", fl.name, r.name, rk, gowned,
                        "personnel flow `" + fl.name + "` enters `" + r.name
                        + "` (grade " + r.grade + ") "
                        + (lastGown.empty()
                           ? std::string("without passing a gowning room since"
                                         " it left CNC or outside")
                           : "gowned only for grade " + R[roomIdx[lastGown]].grade
                             + " (at `" + lastGown + "`)")
                        + " -- people gown for the grade they enter, in"
                        " stages of increasing cleanliness (Annex 1 para 4.12)");
            }
        }
    }
    //  Crossings: a room two flows both pass THROUGH (interior rooms).
    auto interior = [&](const BuildingFlow& f)
    {
        std::set<std::string> s;
        for (std::size_t k = 1; k + 1 < f.path.size(); ++k)
            if (f.path[k] != kOutside) s.insert(f.path[k]);
        return s;
    };
    for (const auto& m : rec.flows)
    {
        if (m.kind != "material") continue;
        const auto mi = interior(m);
        for (const auto& o : rec.flows)
        {
            if (o.kind == "material") continue;
            for (const auto& room : interior(o))
            {
                if (!mi.count(room) || isShared(room, o.kind, "material")) continue;
                if (o.kind == "personnel")
                    addFinding("flowCrossing", room, o.name + "|" + m.name, 0, 0,
                        "personnel flow `" + o.name + "` and material flow `" + m.name
                        + "` both pass through `" + room + "` -- the two flows cross"
                        " there; separate them, or declare the room `shared` with"
                        " the reason it is safe");
                else
                    addFinding("wasteMeetsMaterial", room, o.name + "|" + m.name, 0, 0,
                        "waste flow `" + o.name + "` passes through `" + room
                        + "`, which material flow `" + m.name + "` also passes"
                        " through -- waste leaves by its own route; separate them,"
                        " or declare the room `shared` with the reason it is safe");
            }
        }
    }

    //  (6) ATEX rooms against ignition rooms.
    {
        std::vector<std::size_t> ax, ig;
        for (std::size_t i = 0; i < nR; ++i)
        {
            if (R[i].atexZone >= 0) ax.push_back(i);
            if (!R[i].ignition.empty()) ig.push_back(i);
        }
        if (!ax.empty() && !ig.empty() && !rec.atexSeparationDeclared)
            addFinding("atexSeparationUndeclared", rec.name, "", 0, 0,
                "the building has " + std::to_string(ax.size()) + " hazardous-area"
                " room(s) and " + std::to_string(ig.size()) + " ignition room(s)"
                " and declares no `atexSeparation { distance; source; reason; }`"
                " -- their isolation is unchecked");
        else
            for (auto a : ax)
                for (auto g : ig)
                {
                    const std::string head = "hazardous-area room `" + R[a].name
                        + "` (zone " + std::to_string(R[a].atexZone) + ") ";
                    if (a == g)
                        addFinding("atexIgnition", R[a].name, R[g].name, 0,
                                   rec.atexDistance,
                            head + "is itself declared an ignition source (\""
                            + R[g].ignition + "\")");
                    else if (connectedPair(a, g))
                        addFinding("atexIgnition", R[a].name, R[g].name, 0,
                                   rec.atexDistance,
                            head + "opens directly on ignition room `" + R[g].name
                            + "` (\"" + R[g].ignition + "\") -- a door is no"
                            " separation");
                    else
                    {
                        const scalar gap = boxGap(R[a], R[g]);
                        if (gap < rec.atexDistance - kTol)
                            addFinding("atexIgnition", R[a].name, R[g].name, gap,
                                       rec.atexDistance,
                                head + "is " + num(gap) + " m from ignition room `"
                                + R[g].name + "` (\"" + R[g].ignition + "\"),"
                                " closer than the declared separation of "
                                + num(rec.atexDistance) + " m");
                    }
                }
    }

    //  (7) ESCAPE: every room reaches outside through doors and stairs.
    {
        std::vector<bool> seen(nR + 1, false);
        std::vector<std::size_t> todo = { OUT };
        seen[OUT] = true;
        while (!todo.empty())
        {
            const std::size_t s = todo.back();
            todo.pop_back();
            for (const auto& e : adj[s])
                if (e.second != "lift" && !seen[e.first])
                {
                    seen[e.first] = true;
                    todo.push_back(e.first);
                }
        }
        for (std::size_t i = 0; i < nR; ++i)
            if (!seen[i])
                addFinding("noEscape", R[i].name, "", 0, 0,
                    "room `" + R[i].name + "` has no way out to `outside` through"
                    " the declared doors and stairs (a lift is not an exit) --"
                    " every room has an escape route");
    }

    //  ---- the glass box: what the engine read ---------------------------
    if (verbosity >= 1)
    {
        std::cout << "\n[building] " << rec.name << ": " << nR << " room(s) on "
                  << rec.floors.size() << " floor(s), " << num(rec.floorArea)
                  << " m2; cascade step " << pa(step) << "; "
                  << rec.findings.size() << " finding(s)\n";
        std::cout << "  " << std::left << std::setw(18) << "room" << std::setw(10)
                  << "floor" << std::setw(26) << "role" << std::setw(6) << "grade"
                  << std::right << std::setw(10) << "p [Pa]" << std::setw(10)
                  << "area [m2]" << "\n";
        for (const auto& r : R)
            std::cout << "  " << std::left << std::setw(18) << r.name << std::setw(10)
                      << r.floor << std::setw(26)
                      << (r.role + (r.regime.empty() ? "" : "/" + r.regime))
                      << std::setw(6) << r.grade << std::right << std::setw(10)
                      << num(r.pressureToOutside) << std::setw(10) << num(r.area)
                      << (r.containment ? "  containment" : "")
                      << (r.atexZone >= 0 ? "  zone " + std::to_string(r.atexZone) : "")
                      << "\n";
    }
    return rec;
}

} // namespace buildingLayout
} // namespace Choupo

// ************************************************************************* //
