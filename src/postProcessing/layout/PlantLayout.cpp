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

#include "postProcessing/layout/PlantLayout.H"
#include "postProcessing/layout/BuildingLayout.H"
#include "postProcessing/layout/BundArithmetic.H"
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
namespace plantLayout
{

namespace
{

constexpr scalar kPi  = 3.14159265358979323846;
//  A geometric tolerance, not a tolerance on anybody's safety distance: two
//  footprints that TOUCH (clear distance 0) do not overlap, and a printed
//  coordinate that round-trips through 8 significant figures must not turn
//  touching into overlapping.
constexpr scalar kTol = 1.0e-6;   // [m]

std::string num(scalar v, int prec = 6)
{
    std::ostringstream o;
    o << std::defaultfloat << std::setprecision(prec) << v;
    return o.str();
}

[[noreturn]] void refuse(const std::string& what)
{
    throw std::runtime_error("layoutDict: " + what);
}

//  Every announcement goes to BOTH homes the caveat surface reads: the line
//  at its site (stderr) and the log the end-of-run block and the result
//  JSON replay.  One call, so the two can never say different things.
void announce(const std::string& severity, const std::string& locus,
              const std::string& message)
{
    std::cerr << "[layout] " << message << "\n";
    AdvisoryLog::instance().add("layout", severity, locus, message);
}

//  A length the case must declare.  Raw numbers are metres (the grammar's
//  raw-SI form); a declared unit is converted and dimension-checked.
scalar length(const Dictionary& d, const std::string& key,
              const std::string& where)
{
    if (!d.found(key))
        refuse(where + ": `" + key + "` is not declared (a length, e.g. `"
               + key + " 12 m;`)");
    return d.lookupScalar(key, Dims::length);
}

//  An ANGLE must carry its unit.  The grammar's raw form is SI, which for an
//  angle is the radian, so `from 225;` would silently read as 225 rad; a
//  wind rose is read in degrees, and the only safe reading is the declared one.
scalar angleDeg(const Dictionary& d, const std::string& key,
                const std::string& where)
{
    if (!d.found(key))
        refuse(where + ": `" + key + "` is not declared (an angle, e.g. `"
               + key + " 225 deg;`)");
    if (!d.hasDimensions(key))
        refuse(where + ": `" + key + "` carries no unit -- an angle must be"
               " written with one (`" + key + " " + num(d.lookupScalar(key))
               + " deg;`), because the raw form is the radian");
    return d.lookupScalar(key, Dims::dimensionless) * 180.0 / kPi;
}

std::string text(const Dictionary& d, const std::string& key,
                 const std::string& where)
{
    if (!d.found(key))
        refuse(where + ": `" + key + "` is not declared -- it is a sentence"
               " the case owes its reader (`" + key + " \"...\";`)");
    const std::string s = d.lookupWord(key);
    if (s.empty())
        refuse(where + ": `" + key + "` is empty");
    return s;
}

//  ---- geometry ---------------------------------------------------------

bool isCircle(const LayoutItem& i)
{
    return i.shape == "cylinder" && i.orientation == "vertical";
}

//  The clear distance between two footprints ON THE PLAN, edge to edge.
//  Negative when they overlap (minus the smaller penetration).
scalar clearPlan(const LayoutItem& a, const LayoutItem& b)
{
    const bool ca = isCircle(a), cb = isCircle(b);
    if (ca && cb)
        return std::hypot(a.x - b.x, a.y - b.y) - 0.5 * a.dx - 0.5 * b.dx;
    if (!ca && !cb)
    {
        const scalar gx = std::fabs(a.x - b.x) - 0.5 * (a.dx + b.dx);
        const scalar gy = std::fabs(a.y - b.y) - 0.5 * (a.dy + b.dy);
        if (gx > 0 && gy > 0) return std::hypot(gx, gy);
        if (gx > 0) return gx;
        if (gy > 0) return gy;
        return std::max(gx, gy);
    }
    const LayoutItem& c = ca ? a : b;   // the circle
    const LayoutItem& r = ca ? b : a;   // the rectangle
    const scalar rad = 0.5 * c.dx;
    const scalar hx = 0.5 * r.dx, hy = 0.5 * r.dy;
    const scalar px = std::clamp(c.x, r.x - hx, r.x + hx);
    const scalar py = std::clamp(c.y, r.y - hy, r.y + hy);
    const bool inside = (px == c.x && py == c.y);
    if (!inside) return std::hypot(c.x - px, c.y - py) - rad;
    const scalar toEdge = std::min({ c.x - (r.x - hx), (r.x + hx) - c.x,
                                     c.y - (r.y - hy), (r.y + hy) - c.y });
    return -(toEdge + rad);
}

//  The plan distance from a POINT to an item's footprint (0 inside it).
scalar pointToFootprint(scalar px, scalar py, const LayoutItem& i)
{
    if (isCircle(i))
        return std::max(0.0, std::hypot(px - i.x, py - i.y) - 0.5 * i.dx);
    const scalar gx = std::max(0.0, std::fabs(px - i.x) - 0.5 * i.dx);
    const scalar gy = std::max(0.0, std::fabs(py - i.y) - 0.5 * i.dy);
    return std::hypot(gx, gy);
}

scalar verticalOverlap(scalar za, scalar ha, scalar zb, scalar hb)
{
    return std::min(za + ha, zb + hb) - std::max(za, zb);
}

//  Bearing of the plan vector (vx, vy), clockwise from the plan's +y, in
//  degrees in [0, 360).
scalar planBearing(scalar vx, scalar vy)
{
    scalar b = std::atan2(vx, vy) * 180.0 / kPi;
    if (b < 0) b += 360.0;
    return b;
}

scalar wrap180(scalar a)
{
    while (a > 180.0)  a -= 360.0;
    while (a < -180.0) a += 360.0;
    return a;
}

//  ---- what a sized item publishes ---------------------------------------

//  THE PAIRS A FOOTPRINT IS READ FROM, keyed on what the sizer PUBLISHED and
//  never on its kind word: a new sizer that publishes `D` and `H` is placed
//  without this file changing.
struct KeyPair { const char* d; const char* l; };
const KeyPair kPairs[] = {
    { "D",               "H"             },   // vessel, stirred tank, column
                                              // shell, catalyst bed, converter
    { "shellID",         "tubeLength"    },   // a DESIGNED shell-and-tube
    { "chamberDiameter", "chamberHeight" },   // spray dryer
};

//  The kinds that live inside or on another item.  The ONE list, here,
//  because the layout is the only reader that asks the question.
const std::map<std::string, std::string>& internalKinds()
{
    static const std::map<std::string, std::string> m = {
        { "sieveTrays",     "inside the column shell of the same unit" },
        { "catalystCharge", "inside the bed of the same unit" },
        { "reliefValve",    "mounted on the item it protects" },
    };
    return m;
}

//  Parse one `release {}` / `ignition` pair onto an item.
void readHazards(const Dictionary& e, LayoutItem& it, const std::string& where)
{
    if (e.found("ignition"))
    {
        it.ignition = e.lookupWord("ignition");
        if (it.ignition.empty())
            refuse(where + ": `ignition` must say WHY the item ignites"
                   " (`ignition \"fired heater: an open flame\";`)");
    }
    if (!e.found("release")) return;
    const auto rel = e.subDict("release");
    const std::string w = where + " release";
    it.release       = true;
    it.releaseSource = text(*rel, "source", w);
    it.releaseReason = text(*rel, "reason", w);
    if (!rel->found("zones")) return;
    for (const auto& zd : rel->lookupDictList("zones"))
    {
        LayoutZone z;
        if (!zd->found("zone"))
            refuse(w + ": a zone declares no `zone` (0, 1 or 2)");
        const scalar zn = zd->lookupScalar("zone");
        if (!(zn == 0.0 || zn == 1.0 || zn == 2.0))
            refuse(w + ": `zone " + num(zn) + ";` -- "
                   + registryRefusal::message("hazardous-area zone",
                        num(zn), { "0", "1", "2" }, "Accepted"));
        z.zone   = int(zn);
        z.radius = length(*zd, "radius", w + " zone " + num(zn));
        z.height = length(*zd, "height", w + " zone " + num(zn));
        if (z.radius <= 0 || z.height <= 0)
            refuse(w + " zone " + num(zn) + ": `radius` and `height` must be"
                   " positive");
        it.zones.push_back(z);
    }
}

std::vector<LayoutSeparationTable> readSeparation(const Dictionary& d)
{
    std::vector<LayoutSeparationTable> out;
    if (!d.found("separation")) return out;
    std::size_t t = 0;
    for (const auto& td : d.lookupDictList("separation"))
    {
        const std::string w = "separation table " + std::to_string(++t);
        LayoutSeparationTable tab;
        tab.source = text(*td, "source", w);
        tab.reason = text(*td, "reason", w);
        if (!td->found("measure"))
            refuse(w + ": `measure` is not declared -- say what the table's"
                   " distances are measured between (`measure edgeToEdge;`"
                   " or `measure centreToCentre;`)");
        tab.measure = td->lookupWord("measure");
        if (tab.measure != "edgeToEdge" && tab.measure != "centreToCentre")
            refuse(w + ": " + registryRefusal::message("separation measure",
                   tab.measure, { "edgeToEdge", "centreToCentre" },
                   "Accepted"));
        if (!td->found("distances"))
            refuse(w + ": `distances ( ... );` is not declared");
        for (const auto& rd : td->lookupDictList("distances"))
        {
            if (!rd->found("between"))
                refuse(w + ": a row declares no `between ( kindA kindB );`");
            const auto k = rd->lookupWordList("between");
            if (k.size() != 2)
                refuse(w + ": `between` names " + std::to_string(k.size())
                       + " kind(s); a separation is between TWO kinds"
                       " (the same word twice for two items of one kind)");
            LayoutSeparationRule rule;
            rule.a = std::min(k[0], k[1]);
            rule.b = std::max(k[0], k[1]);
            rule.distance = length(*rd, "distance",
                                   w + " (" + rule.a + ", " + rule.b + ")");
            if (rule.distance <= 0)
                refuse(w + " (" + rule.a + ", " + rule.b + "): `distance`"
                       " must be positive");
            tab.rules.push_back(rule);
        }
        out.push_back(tab);
    }
    //  ONE DISTANCE PER PAIR OF KINDS.  Two rows for one pair -- in one
    //  table or across two -- are two homes for one number, and which wins
    //  would be an accident of order.
    std::map<std::pair<std::string, std::string>, std::string> seen;
    for (std::size_t i = 0; i < out.size(); ++i)
        for (const auto& rule : out[i].rules)
        {
            const auto key = std::make_pair(rule.a, rule.b);
            const std::string here = "table " + std::to_string(i + 1);
            auto it = seen.find(key);
            if (it != seen.end())
                refuse("the separation between `" + rule.a + "` and `"
                       + rule.b + "` is declared twice (" + it->second
                       + " and " + here + ") -- one pair of kinds, one"
                       " distance; delete one row");
            seen[key] = here;
        }
    return out;
}

LayoutWind readWind(const Dictionary& d)
{
    LayoutWind w;
    if (!d.found("wind")) return w;
    const auto wd = d.subDict("wind");
    w.present      = true;
    w.fromDeg      = angleDeg(*wd, "from", "wind");
    w.planNorthDeg = angleDeg(*wd, "planNorth", "wind");
    w.halfAngleDeg = angleDeg(*wd, "halfAngle", "wind");
    w.reach        = length(*wd, "reach", "wind");
    w.source       = text(*wd, "source", "wind");
    w.reason       = text(*wd, "reason", "wind");
    if (w.halfAngleDeg <= 0 || w.halfAngleDeg > 180)
        refuse("wind: `halfAngle` must lie in (0, 180] deg, got "
               + num(w.halfAngleDeg));
    if (w.reach <= 0)
        refuse("wind: `reach` must be positive");
    return w;
}

//  The sizing record of every item, keyed by id, and the order the
//  flowsheet declares them in (the order a sequential plan runs, which is a
//  valid flow order: CLAUDE.md §6, the sequential-plan contract).
std::vector<const EquipmentSizing*> itemsInFlowOrder(const SimulationResult& r)
{
    std::vector<const EquipmentSizing*> out;
    std::set<std::string> done;
    for (const auto& u : r.topology)
        for (const auto& [id, s] : r.sizings)
            if (s.unitName == u.name && done.insert(id).second)
                out.push_back(&s);
    for (const auto& [id, s] : r.sizings)
        if (done.insert(id).second) out.push_back(&s);
    return out;
}

//  THE SIZING ENTRY WHOSE SIZER REFUSED THE ITEM `id`, or null (C79).  The
//  id's shape is asked of `EquipmentSizing::isItemOf`, the inverse of
//  `itemId()` beside it -- no record exists to ask, because the sizer threw.
const std::pair<const std::string, std::string>*
refusedSizingOf(const SimulationResult& r, const std::string& id)
{
    for (const auto& e : r.sizingRefusals)
        if (EquipmentSizing::isItemOf(id, e.first)) return &e;
    return nullptr;
}

//  The known sector names: every unit's stamp.
std::set<std::string> sectorsOf(const SimulationResult& r)
{
    std::set<std::string> out;
    for (const auto& u : r.topology)
        if (!u.sector.empty()) out.insert(u.sector);
    for (const auto& [id, s] : r.sizings)
        if (!s.sector.empty()) out.insert(s.sector);
    return out;
}

//  Fill an item's extents from its shape and orientation.
void setExtents(LayoutItem& it, scalar D_or_len, scalar L_or_width,
                scalar height, const std::string& where)
{
    if (it.shape == "cylinder")
    {
        const scalar D = D_or_len, L = L_or_width;
        if (it.orientation == "vertical") { it.dx = D; it.dy = D; it.dz = L; }
        else if (it.orientation == "alongX") { it.dx = L; it.dy = D; it.dz = D; }
        else { it.dx = D; it.dy = L; it.dz = D; }
        return;
    }
    const scalar len = D_or_len, wid = L_or_width;
    if (it.orientation == "vertical")
        refuse(where + ": a declared footprint is a BOX and has no axis to"
               " stand on -- say which plan axis its `length` lies along"
               " (`orientation alongX;` or `orientation alongY;`)");
    if (it.orientation == "alongX") { it.dx = len; it.dy = wid; }
    else                            { it.dx = wid; it.dy = len; }
    it.dz = height;
}

//  ---- the pipes (DEV.md 4c C80) ----------------------------------------

//  THE UNSIZED UNITS A PIPE PASSES THROUGH.  A mixer and a splitter are a
//  tee on a line, a valve a fitting on it: none has a footprint, so each is
//  drawn as a JUNCTION -- a node on the rack -- rather than left as a hole
//  in the plant's piping.  Any other unsized unit (a storage tank nobody
//  sized, a pump with no sizer) is NOT a junction: a stream touching it is
//  listed as not routed, with that reason, and no place is invented for it.
//  The ONE list, here, because the layout is the only reader that asks.
const std::set<std::string>& junctionTypes()
{
    static const std::set<std::string> s = { "mixer", "splitter", "valve" };
    return s;
}

//  THE STATED DEFAULT RACK, used when the case declares no `pipeRack`, and
//  ANNOUNCED once.  Drafting values, said as such -- not a standard's.
constexpr scalar kRackElevation   = 6.0;   // [m]
constexpr scalar kRackLaneSpacing = 0.6;   // [m]
constexpr int    kRackLanesPerTier = 6;
constexpr scalar kRackTierSpacing = 1.5;   // [m]
constexpr scalar kRackEndMargin   = 5.0;   // [m] beyond the outermost footprint

using Pt = std::vector<scalar>;   // { plan x, plan y, elevation z }

scalar segLength(const Pt& a, const Pt& b)
{
    return std::fabs(a[0] - b[0]) + std::fabs(a[1] - b[1])
         + std::fabs(a[2] - b[2]);
}

//  How many of the three coordinates differ between two points.
int axesMoved(const Pt& a, const Pt& b)
{
    int n = 0;
    for (int k = 0; k < 3; ++k)
        if (std::fabs(a[k] - b[k]) > kTol) ++n;
    return n;
}

//  Drop repeated points, then merge collinear runs, so the published
//  polyline holds only its corners (its length is unchanged by either).
std::vector<Pt> tidy(const std::vector<Pt>& in)
{
    std::vector<Pt> a;
    for (const auto& p : in)
        if (a.empty() || axesMoved(a.back(), p) > 0) a.push_back(p);
    if (a.size() < 3) return a;
    std::vector<Pt> o{ a[0] };
    for (std::size_t i = 1; i + 1 < a.size(); ++i)
    {
        const Pt& p = o.back(); const Pt& q = a[i]; const Pt& s = a[i + 1];
        //  q is a corner unless p -> q and q -> s move along the same axis.
        bool straight = false;
        for (int k = 0; k < 3; ++k)
        {
            bool pq = true, qs = true;
            for (int m2 = 0; m2 < 3; ++m2)
                if (m2 != k)
                {
                    if (std::fabs(p[m2] - q[m2]) > kTol) pq = false;
                    if (std::fabs(q[m2] - s[m2]) > kTol) qs = false;
                }
            if (pq && qs) { straight = true; break; }
        }
        if (!straight) o.push_back(q);
    }
    o.push_back(a.back());
    return o;
}

LayoutPipeRack readRack(const Dictionary& d, const PlantLayoutRecord& rec)
{
    LayoutPipeRack k;
    if (d.found("pipeRack"))
    {
        const auto rd = d.subDict("pipeRack");
        const std::string w = "pipeRack";
        k.declared     = true;
        k.y            = length(*rd, "y",           w);
        k.elevation    = length(*rd, "elevation",   w);
        k.laneSpacing  = length(*rd, "laneSpacing", w);
        k.tierSpacing  = length(*rd, "tierSpacing", w);
        k.xStart       = length(*rd, "xStart",      w);
        k.xEnd         = length(*rd, "xEnd",        w);
        k.reason       = text(*rd, "reason", w);
        if (!rd->found("lanesPerTier"))
            refuse(w + ": `lanesPerTier` is not declared (a count, e.g."
                   " `lanesPerTier 6;`)");
        const scalar n = rd->lookupScalar("lanesPerTier");
        if (!(n >= 1.0) || n != std::floor(n))
            refuse(w + ": `lanesPerTier " + num(n) + ";` -- a count of lanes,"
                   " a whole number of at least 1");
        k.lanesPerTier = int(n);
        if (k.laneSpacing <= 0 || k.tierSpacing <= 0)
            refuse(w + ": `laneSpacing` and `tierSpacing` must be positive");
        if (k.elevation < 0)
            refuse(w + ": `elevation` is a height above grade and cannot be"
                   " negative");
        if (k.xEnd <= k.xStart)
            refuse(w + ": `xStart` (" + num(k.xStart) + " m, where the plant's"
                   " inlets arrive) must lie west of `xEnd` (" + num(k.xEnd)
                   + " m, where its outlets leave)");
        return k;
    }
    //  The stated default: on the mean plan y of the placed PROCESS items
    //  (a building off the plot must not drag the rack to it), at the
    //  drafting elevation, running past the outermost process footprint by
    //  the stated margin at both ends.
    scalar sy = 0, xmin = 1e300, xmax = -1e300;
    std::size_t n = 0;
    for (const auto& i : rec.items)
    {
        if (i.nonProcess || !i.room.empty()) continue;   // C100: indoors
        sy += i.y; ++n;
        xmin = std::min(xmin, i.x - 0.5 * i.dx);
        xmax = std::max(xmax, i.x + 0.5 * i.dx);
    }
    if (n == 0)
    {
        for (const auto& i : rec.items)
        {
            sy += i.y; ++n;
            xmin = std::min(xmin, i.x - 0.5 * i.dx);
            xmax = std::max(xmax, i.x + 0.5 * i.dx);
        }
    }
    k.y            = n ? sy / scalar(n) : 0.0;
    k.elevation    = kRackElevation;
    k.laneSpacing  = kRackLaneSpacing;
    k.lanesPerTier = kRackLanesPerTier;
    k.tierSpacing  = kRackTierSpacing;
    k.xStart       = (n ? xmin : 0.0) - kRackEndMargin;
    k.xEnd         = (n ? xmax : 0.0) + kRackEndMargin;
    k.reason       = "the engine's stated default (no pipeRack declared)";
    return k;
}

//  Lane k's position on the rack: across the rack within a tier, centred on
//  the rack's line; the tiers stacked upward from its elevation.
void laneAt(const LayoutPipeRack& k, int lane, scalar& y, scalar& z)
{
    const int tier = lane / k.lanesPerTier;
    const int pos  = lane % k.lanesPerTier;
    y = k.y + (scalar(pos) - 0.5 * scalar(k.lanesPerTier - 1)) * k.laneSpacing;
    z = k.elevation + scalar(tier) * k.tierSpacing;
}

//  One end of a pipe as the layout can reach it.
struct End
{
    std::string kind;      // item | junction | batteryLimit | "" (unreachable)
    std::string at;        // item id | junction unit | inlet | outlet
    std::string unit;      // flowsheet unit, empty at a battery limit
    Pt          point;     // the nozzle, the junction node; empty at a limit
    std::string why;       // why it cannot be reached (kind empty)
    //  C100: the end stands INSIDE the declared building -- an item a room
    //  lists (`room` its room), or a junction piped only to such items.
    bool        indoor = false;
    std::string room;
};

void routePipes(const Dictionary& d, const SimulationResult& r,
                PlantLayoutRecord& rec)
{
    rec.pipeRack = readRack(d, rec);
    const auto& rack = rec.pipeRack;

    //  Placed items per unit, in the order the case declared them; the
    //  sized items per unit; the unit's type.
    std::map<std::string, std::vector<const LayoutItem*>> placedOf;
    for (const auto& i : rec.items)
    {
        if (i.nonProcess) continue;
        auto s = r.sizings.find(i.id);
        if (s != r.sizings.end()) placedOf[s->second.unitName].push_back(&i);
    }
    std::map<std::string, std::vector<std::string>> sizedOf;
    for (const auto& [id, s] : r.sizings) sizedOf[s.unitName].push_back(id);
    std::map<std::string, std::string> typeOf;
    for (const auto& u : r.topology) typeOf[u.name] = u.type;

    //  The streams, in the order the flowsheet first names them (each
    //  unit's inlets, then its outlets): a feed is met before its products.
    std::vector<std::string> order;
    std::map<std::string, std::string> producer;
    std::map<std::string, std::vector<std::string>> consumers;
    std::set<std::string> seen;
    for (const auto& u : r.topology)
    {
        for (const auto& s : u.ins)
        {
            consumers[s].push_back(u.name);
            if (seen.insert(s).second) order.push_back(s);
        }
        for (const auto& s : u.outs)
        {
            producer[s] = u.name;
            if (seen.insert(s).second) order.push_back(s);
        }
    }

    //  ---- SOLIDS ARE NOT PIPED (DEV.md 4c C97) -------------------------
    //  A stream with NO fluid phase that carries a solid: `F` is the fluid
    //  molar flow only and `s` the solid's, per component
    //  (`streams/ProcessStream.H`).  A powder, granules or tablets move in
    //  closed containers or on a conveyor, never in a pipe on the rack; a
    //  slurry or a wet solid (a fluid beside it) is still a pipe.
    auto solidsOnly = [&](const std::string& s) {
        auto it = r.streams.find(s);
        if (it == r.streams.end() || it->second.F > 0.0) return false;
        for (const scalar si : it->second.s)
            if (si > 0.0) return true;
        return false;
    };
    //  A unit every stream of which is solids carries nothing to pipe.
    std::map<std::string, bool> onlySolids;
    for (const auto& u : r.topology)
    {
        bool all = !(u.ins.empty() && u.outs.empty());
        for (const auto& s : u.ins)  all = all && solidsOnly(s);
        for (const auto& s : u.outs) all = all && solidsOnly(s);
        onlySolids[u.name] = all;
    }

    //  ---- the junctions, and where each stands on the rack -------------
    auto isJunction = [&](const std::string& unit) {
        return !placedOf.count(unit) && !sizedOf.count(unit)
            && junctionTypes().count(typeOf[unit]) && !onlySolids[unit];
    };
    //  Neighbours: the units at the other end of every stream it touches.
    std::map<std::string, std::vector<std::string>> nbr;
    for (const auto& s : order)
    {
        auto p = producer.find(s);
        if (p == producer.end()) continue;
        for (const auto& c : consumers[s])
        {
            nbr[p->second].push_back(c);
            nbr[c].push_back(p->second);
        }
    }
    //  THE RULE: a junction stands at the MEAN plan x of the placed items it
    //  is piped to (each unit's first placed item), on the rack's centre
    //  line, at the rack's elevation.  A junction piped to none takes the
    //  mean x of the junctions next to it that already have one, in passes,
    //  in the flowsheet's order -- so it is deterministic and never guessed.
    //  INDOORS (DEV.md 4c C100): only items in the open place a junction on
    //  the rack; a junction piped to placed items ALL of which stand inside
    //  the declared building (or, piped to none, only to junctions that
    //  stand indoors) stands indoors with them -- `jIn`, never on the rack.
    std::map<std::string, scalar> jx;
    std::set<std::string> jIn;
    std::vector<std::string> jOrder;
    for (const auto& u : r.topology)
        if (isJunction(u.name)) jOrder.push_back(u.name);
    for (const auto& j : jOrder)
    {
        scalar sx = 0; std::size_t n = 0, nIn = 0;
        for (const auto& o : nbr[j])
        {
            auto p = placedOf.find(o);
            if (p == placedOf.end()) continue;
            if (!p->second.front()->room.empty()) { ++nIn; continue; }
            sx += p->second.front()->x; ++n;
        }
        if (n) jx[j] = sx / scalar(n);
        else if (nIn) jIn.insert(j);
    }
    for (std::size_t pass = 0; pass < jOrder.size(); ++pass)
    {
        bool moved = false;
        for (const auto& j : jOrder)
        {
            if (jx.count(j) || jIn.count(j)) continue;
            scalar sx = 0; std::size_t n = 0, nIn = 0;
            for (const auto& o : nbr[j])
            {
                if (jx.count(o)) { sx += jx[o]; ++n; }
                else if (jIn.count(o)) ++nIn;
            }
            if (n) { jx[j] = sx / scalar(n); moved = true; }
            else if (nIn) { jIn.insert(j); moved = true; }
        }
        if (!moved) break;
    }
    for (const auto& j : jOrder)
        if (jx.count(j))
            rec.junctions.push_back({ j, typeOf[j], jx[j], rack.y,
                                      rack.elevation });

    //  ---- one end of a stream ------------------------------------------
    auto endOf = [&](const std::string& unit, bool inlet) {
        End e;
        if (unit.empty())
        {
            e.kind = "batteryLimit";
            e.at   = inlet ? "inlet" : "outlet";
            return e;
        }
        e.unit = unit;
        auto p = placedOf.find(unit);
        if (p != placedOf.end())
        {
            //  THE NOZZLE: a unit realising several items is piped through
            //  the FIRST of them the case placed (the order of `items`); the
            //  pipe enters and leaves at that item's plan centre, at its TOP
            //  (z + its height, standing or lying).  Stylised: no nozzle
            //  schedule is published by any sizer.
            const LayoutItem& i = *p->second.front();
            e.kind  = "item";
            e.at    = i.id;
            e.point = { i.x, i.y, i.z + i.dz };
            e.indoor = !i.room.empty();
            e.room   = i.room;
            return e;
        }
        if (jIn.count(unit))
        {
            e.kind   = "junction";
            e.at     = unit;
            e.indoor = true;
            return e;
        }
        if (jx.count(unit))
        {
            e.kind  = "junction";
            e.at    = unit;
            e.point = { jx[unit], rack.y, rack.elevation };
            return e;
        }
        auto sz = sizedOf.find(unit);
        if (refusedSizingOf(r, unit))
            e.why = "unit `" + unit + "`'s sizer refused (see the sizing"
                    " table), so it has no item on the plot plan";
        else if (sz != sizedOf.end())
        {
            std::string ids;
            for (const auto& id : sz->second) ids += (ids.empty() ? "" : ", ") + id;
            e.why = "unit `" + unit + "` is sized (" + ids + ") but none of"
                    " its items is placed on the plot plan";
        }
        else if (junctionTypes().count(typeOf[unit]))
            e.why = "junction `" + unit + "` (" + typeOf[unit] + ") is piped"
                    " to no placed item, directly or through another junction,"
                    " so it has no place on the rack";
        else
            e.why = "unit `" + unit + "` (" + typeOf[unit] + ") has no sized"
                    " item to place and is not a junction (mixer, splitter,"
                    " valve)";
        return e;
    };

    //  ---- the declared overrides ---------------------------------------
    std::map<std::string, std::vector<Pt>> overrides;
    if (d.found("pipes"))
    {
        const auto pd = d.subDict("pipes");
        for (const auto& s : pd->keys())
        {
            if (!seen.count(s))
            {
                std::vector<std::string> known(order.begin(), order.end());
                refuse("pipes: `" + s + "` -- " + registryRefusal::message(
                       "stream", s, known, "Accepted"));
            }
            const auto od = pd->subDict(s);
            const std::string w = "pipes `" + s + "`";
            if (!od->found("waypoints"))
                refuse(w + ": `waypoints ( { x <m>; y <m>; z <m>; } ... );` is"
                       " not declared -- an override IS its waypoints");
            std::vector<Pt> pts;
            std::size_t k = 0;
            for (const auto& wd : od->lookupDictList("waypoints"))
            {
                const std::string ww = w + " waypoint " + std::to_string(++k);
                pts.push_back({ length(*wd, "x", ww), length(*wd, "y", ww),
                                length(*wd, "z", ww) });
            }
            if (pts.empty())
                refuse(w + ": `waypoints` is empty -- declare at least one");
            overrides[s] = pts;
        }
    }

    //  ---- route ----------------------------------------------------------
    int lane = 0;
    for (const auto& s : order)
    {
        auto pIt = producer.find(s);
        const std::string from = pIt == producer.end() ? "" : pIt->second;
        const auto& cs = consumers[s];
        if (solidsOnly(s))
        {
            std::string to;
            for (const auto& c : cs) to += (to.empty() ? "" : ", ") + c;
            if (overrides.count(s))
                refuse("pipes `" + s + "`: an override routes a pipe, and this"
                       " stream carries only solids (no fluid phase), which"
                       " are not piped -- remove the override");
            LayoutNotRouted n;
            n.stream = s;
            n.reason = "solids only (no fluid phase): moved in containers or"
                       " by conveyor, not piped";
            n.fromUnit = from;
            n.toUnit = to;
            n.solids = true;
            rec.notRouted.push_back(n);
            continue;
        }
        if (cs.size() > 1)
        {
            std::string who;
            for (const auto& c : cs) who += (who.empty() ? "" : ", ") + c;
            //  The producer's nozzle is the one end the drawing can mark:
            //  a missing pipe must never look like a finished drawing.
            const End a = endOf(from, true);
            //  An end INDOORS (C100) is no place to mark: indoor piping is
            //  not drawn, so nothing there looks finished -- the stream is
            //  listed, `indoor`, and marked nowhere.
            LayoutNotRouted n{ s, "consumed by " + std::to_string(cs.size())
                               + " units (" + who + "); a pipe has two ends",
                               from, who, a.kind.empty() || a.indoor ? Pt{} : a.point };
            n.indoor = a.indoor;
            rec.notRouted.push_back(n);
            continue;
        }
        const std::string to = cs.empty() ? "" : cs.front();
        const End a = endOf(from, true);
        const End b = endOf(to, false);
        if (a.kind.empty() || b.kind.empty())
        {
            const std::string why = a.kind.empty() ? a.why : b.why;
            if (overrides.count(s))
                refuse("pipes `" + s + "`: an override routes a pipe between"
                       " two ends the layout reaches, and this stream has"
                       " none: " + why);
            //  The end the layout DOES reach is where the view marks the
            //  missing pipe (empty when neither end is reachable).
            const End* reach = !a.kind.empty() ? &a : (!b.kind.empty() ? &b : nullptr);
            LayoutNotRouted n{ s, why, from, to,
                               reach && !reach->indoor ? reach->point : Pt{} };
            n.indoor = reach && reach->indoor;   // C100: marked nowhere, as above
            rec.notRouted.push_back(n);
            continue;
        }
        //  ---- AN END INDOORS (DEV.md 4c C100) ---------------------------
        //  Indoor piping is not routed: it runs in the rooms and their
        //  service voids, which the plot plan does not draw.  A pipe between
        //  an end indoors and one in the open is drawn only where the case
        //  DECLARES its outdoor leg, waypoints ending (or beginning) ON THE
        //  WALL of the building's shell, where the pipe enters -- the wall
        //  penetration, that end's only point.
        const auto ov = overrides.find(s);
        if (a.indoor || b.indoor)
        {
            auto who = [](const End& e) {
                return e.kind == "junction"
                    ? "junction `" + e.at + "`"
                    : "`" + e.at + "` (room `" + e.room + "`)";
            };
            LayoutNotRouted n;
            n.stream = s;
            n.fromUnit = from;
            n.toUnit = to;
            n.indoor = true;
            if (a.indoor && b.indoor)
            {
                if (ov != overrides.end())
                    refuse("pipes `" + s + "`: both its ends stand inside the"
                           " building (" + who(a) + " and " + who(b) + "), and"
                           " indoor piping is not routed -- remove the override");
                n.reason = "inside the building: indoor piping is not routed ("
                           + who(a) + " to " + who(b) + "; it runs in the rooms"
                           " and their service voids, which the plot plan does"
                           " not draw)";
                rec.notRouted.push_back(n);
                continue;
            }
            const End& in  = a.indoor ? a : b;
            const End& out = a.indoor ? b : a;
            if (ov == overrides.end() || rec.shell.empty())
            {
                if (ov != overrides.end())
                    refuse("pipes `" + s + "`: one end stands inside the building"
                           " (" + who(in) + "), and the building declares no"
                           " `envelope` -- with no shell there is no wall for the"
                           " outdoor leg to enter by; declare the envelope or"
                           " remove the override");
                n.reason = "one end inside the building (" + who(in) + "): indoor"
                           " piping is not routed; "
                           + (rec.shell.empty()
                              ? std::string("the building declares no `envelope`,"
                                            " so no wall is drawn for it to enter by")
                              : "the case may declare its outdoor leg, `pipes { "
                                + s + " { waypoints ( ... ); } }`, "
                                + (a.indoor ? "beginning" : "ending")
                                + " on the wall of `" + rec.shell
                                + "` where it enters");
                n.anchor = out.kind == "batteryLimit" ? Pt{} : out.point;
                rec.notRouted.push_back(n);
                continue;
            }
            //  The wall penetration: the waypoint at the indoor end lies on
            //  the shell's boundary (a side face, between its base and top).
            const LayoutItem* sh = nullptr;
            for (const auto& i : rec.items) if (i.id == rec.shell) sh = &i;
            const Pt& q = a.indoor ? ov->second.front() : ov->second.back();
            const scalar x0 = sh->x - 0.5 * sh->dx, x1 = sh->x + 0.5 * sh->dx;
            const scalar y0 = sh->y - 0.5 * sh->dy, y1 = sh->y + 0.5 * sh->dy;
            const bool inX = q[0] >= x0 - kTol && q[0] <= x1 + kTol;
            const bool inY = q[1] >= y0 - kTol && q[1] <= y1 + kTol;
            const bool onWall =
                ((std::abs(q[0] - x0) < kTol || std::abs(q[0] - x1) < kTol) && inY)
             || ((std::abs(q[1] - y0) < kTol || std::abs(q[1] - y1) < kTol) && inX);
            if (!onWall || q[2] < sh->z - kTol || q[2] > sh->z + sh->dz + kTol)
                refuse("pipes `" + s + "`: one end stands inside the building ("
                       + who(in) + "), so the route's " + (a.indoor ? "FIRST" : "LAST")
                       + " waypoint is where the pipe enters it -- the wall"
                       " penetration -- and must lie ON the wall of `" + rec.shell
                       + "` (x = " + num(x0) + " or " + num(x1) + " m, or y = "
                       + num(y0) + " or " + num(y1) + " m, between z = "
                       + num(sh->z) + " and " + num(sh->z + sh->dz) + " m); it is"
                       " at (" + num(q[0]) + ", " + num(q[1]) + ", " + num(q[2])
                       + ") m");
        }
        LayoutPipe p;
        p.stream = s;
        auto lab = r.boundaryOutletLabelOf.find(s);
        if (lab != r.boundaryOutletLabelOf.end()) p.label = lab->second;
        p.fromKind = a.indoor ? "wallPenetration" : a.kind;
        p.from = a.at; p.fromUnit = a.unit;
        p.toKind   = b.indoor ? "wallPenetration" : b.kind;
        p.to   = b.at; p.toUnit   = b.unit;
        //  An end indoors (C100) has no point of its own here: the route
        //  begins or ends at its wall penetration, the case's waypoint.
        const Pt aPt = a.indoor ? Pt{} : a.point;
        const Pt bPt = b.indoor ? Pt{} : b.point;

        std::vector<Pt> pts;
        if (ov != overrides.end())
        {
            //  A DECLARED ROUTE: the source's anchor, the waypoints, the
            //  target's anchor -- a battery limit has no anchor of its own,
            //  so there the route begins or ends at the case's own waypoint.
            p.routedBy = "waypoints";
            if (!aPt.empty()) pts.push_back(aPt);
            for (const auto& q : ov->second) pts.push_back(q);
            if (!bPt.empty()) pts.push_back(bPt);
            for (std::size_t i = 1; i < pts.size(); ++i)
                if (axesMoved(pts[i - 1], pts[i]) > 1)
                {
                    std::ostringstream o;
                    o << "pipes `" << s << "`: segment " << i << " runs from ("
                      << num(pts[i - 1][0]) << ", " << num(pts[i - 1][1]) << ", "
                      << num(pts[i - 1][2]) << ") to (" << num(pts[i][0]) << ", "
                      << num(pts[i][1]) << ", " << num(pts[i][2]) << ") m and"
                         " moves along more than one axis -- a route is"
                         " ORTHOGONAL; add the corner between them (the route"
                         " begins at ";
                    o << (aPt.empty() ? "the first waypoint"
                          : "the top of `" + a.at + "`");
                    o << " and ends at "
                      << (bPt.empty() ? "the last waypoint"
                          : "the top of `" + b.at + "`") << ")";
                    refuse(o.str());
                }
        }
        else
        {
            //  THE RACK ROUTE: up (or down) from the source to its lane, across
            //  to the lane, along the rack, across to the target, down to it.
            p.routedBy = "rack";
            p.lane = lane++;
            scalar ly = 0, lz = 0;
            laneAt(rack, p.lane, ly, lz);
            if (a.kind == "batteryLimit") pts.push_back({ rack.xStart, ly, lz });
            else
            {
                pts.push_back(a.point);
                pts.push_back({ a.point[0], a.point[1], lz });
                pts.push_back({ a.point[0], ly, lz });
            }
            if (b.kind == "batteryLimit") pts.push_back({ rack.xEnd, ly, lz });
            else
            {
                pts.push_back({ b.point[0], ly, lz });
                pts.push_back({ b.point[0], b.point[1], lz });
                pts.push_back(b.point);
            }
        }
        p.route = tidy(pts);
        for (std::size_t i = 1; i < p.route.size(); ++i)
            p.length += segLength(p.route[i - 1], p.route[i]);
        rec.pipes.push_back(p);
    }

    if (!rack.declared)
        announce("info", "layout",
            "no `pipeRack` is declared, so the " + std::to_string(rec.pipes.size())
            + " pipe(s) are routed on the engine's STATED DEFAULT rack: along"
              " plan x on the mean plan y of the placed process items (y = "
            + num(rack.y) + " m), lowest tier at " + num(rack.elevation)
            + " m, lanes " + num(rack.laneSpacing) + " m apart, "
            + std::to_string(rack.lanesPerTier) + " per tier, tiers "
            + num(rack.tierSpacing) + " m apart, from x = " + num(rack.xStart)
            + (d.found("fence")
               ? " m (where the inlets join it) to x = " + num(rack.xEnd)
                 + " m (where the outlets leave it; the fence the case"
                   " declares carries each on to its crossing), "
               : " m (the inlets' battery limit) to x = " + num(rack.xEnd)
                 + " m (the outlets'), ")
            + num(kRackEndMargin) + " m past the"
              " outermost process footprint.  Drafting values, not a"
              " standard's: declare `pipeRack { y; elevation; laneSpacing;"
              " lanesPerTier; tierSpacing; xStart; xEnd; reason; }` in"
              " system/layoutDict");
}

//  ---- the roads (DEV.md 4c C90) ------------------------------------------

scalar unionArea(const std::vector<LayoutArea>& rs);   // below, with the plot

//  THE NON-PROCESS KINDS A ROAD RULE READS.  The kind of a non-process item
//  is the case's own word (the separation table names it); two words carry
//  a meaning the road check needs, and this is the ONE list of them:
//    gate         -- an ENTRANCE: the road network is reached from it;
//    weighbridge  -- a truck scale, DRIVABLE: a road runs OVER its deck (it
//                    is not refused as a road through a footprint), and a
//                    weighbridge no road crosses is announced.
const char* const kGateKind        = "gate";
const char* const kWeighbridgeKind = "weighbridge";

//  An axis-aligned plan rectangle as a box item, so the item geometry above
//  (`clearPlan`, `pointToFootprint`) measures it with no second copy.
LayoutItem planBox(scalar x0, scalar x1, scalar y0, scalar y1)
{
    LayoutItem b;
    b.shape = "box";
    b.orientation = "alongX";
    b.x  = 0.5 * (x0 + x1);
    b.y  = 0.5 * (y0 + y1);
    b.dx = x1 - x0;
    b.dy = y1 - y0;
    return b;
}

//  A road's PAVED rectangles: each segment of its centre line widened by
//  half the width on every side, ends included -- so a corner is paved
//  square and two roads meeting at a centre line share their junction.
std::vector<LayoutArea> pavedRects(const LayoutRoad& rd)
{
    std::vector<LayoutArea> out;
    const scalar h = 0.5 * rd.width;
    for (std::size_t k = 0; k + 1 < rd.centreline.size(); ++k)
    {
        const auto& a = rd.centreline[k];
        const auto& b = rd.centreline[k + 1];
        out.push_back({ rd.id, std::min(a[0], b[0]) - h, std::max(a[0], b[0]) + h,
                               std::min(a[1], b[1]) - h, std::max(a[1], b[1]) + h });
    }
    return out;
}

bool rectsMeet(const LayoutArea& a, const LayoutArea& b, scalar tol)
{
    return a.xMin <= b.xMax + tol && b.xMin <= a.xMax + tol
        && a.yMin <= b.yMax + tol && b.yMin <= a.yMax + tol;
}

//  Two centre-line segments touch or cross (each runs along one axis, so a
//  segment is a degenerate rectangle).
bool segmentsMeet(const std::vector<scalar>& a0, const std::vector<scalar>& a1,
                  const std::vector<scalar>& b0, const std::vector<scalar>& b1)
{
    const LayoutArea A{ "", std::min(a0[0], a1[0]), std::max(a0[0], a1[0]),
                            std::min(a0[1], a1[1]), std::max(a0[1], a1[1]) };
    const LayoutArea B{ "", std::min(b0[0], b1[0]), std::max(b0[0], b1[0]),
                            std::min(b0[1], b1[1]), std::max(b0[1], b1[1]) };
    return rectsMeet(A, B, kTol);
}

void readRoads(const Dictionary& d, PlantLayoutRecord& rec)
{
    LayoutRoads& R = rec.roads;
    const auto rd = d.subDict("roads");
    const std::string w = "roads";
    R.present  = true;
    R.source   = text(*rd, "source", w);
    R.reason   = text(*rd, "reason", w);
    R.headroom = length(*rd, "headroom", w);
    if (R.headroom <= 0)
        refuse(w + ": `headroom " + num(R.headroom) + " m;` -- the vehicle"
               " clearance the network is laid out for must be positive");
    if (!rd->found("access"))
        refuse(w + ": `access { distance <m>; source \"...\"; reason \"...\"; }`"
               " is not declared -- the distance within which every placed"
               " item must have a road (fire-brigade and maintenance access)"
               " is the case's to state, with where it comes from");
    {
        const auto ad = rd->subDict("access");
        R.accessDistance = length(*ad, "distance", w + " access");
        R.accessSource   = text(*ad, "source", w + " access");
        R.accessReason   = text(*ad, "reason", w + " access");
        if (R.accessDistance < 0)
            refuse(w + " access: `distance` cannot be negative");
    }
    if (rd->found("noTraffic"))
        for (scalar z : rd->lookupList("noTraffic"))
        {
            if (!(z == 0.0 || z == 1.0 || z == 2.0))
                refuse(w + ": `noTraffic` -- " + registryRefusal::message(
                       "hazardous-area zone", num(z), { "0", "1", "2" },
                       "Accepted"));
            R.noTraffic.push_back(int(z));
        }
    if (!rd->found("network"))
        refuse(w + ": `network ( { road \"<name>\"; width <m>; reason \"...\";"
               " waypoints ( { x; y; } ... ); } ... );` is not declared");
    std::set<std::string> names;
    std::size_t n = 0;
    for (const auto& e : rd->lookupDictList("network"))
    {
        ++n;
        LayoutRoad road;
        if (!e->found("road"))
            refuse(w + " network entry " + std::to_string(n) + ": `road"
                   " \"<name>\";` is not declared");
        road.id = e->lookupWord("road");
        const std::string wr = "road `" + road.id + "`";
        if (!names.insert(road.id).second)
            refuse(wr + " is declared twice -- one name, one road");
        road.width  = length(*e, "width", wr);
        road.reason = text(*e, "reason", wr);
        if (road.width <= 0)
            refuse(wr + ": `width` must be positive");
        //  C96: the radius of its corners, and one-way traffic.
        if (e->found("cornerRadius"))
        {
            road.cornerRadius = length(*e, "cornerRadius", wr);
            road.cornerRadiusDeclared = true;
            if (road.cornerRadius < 0)
                refuse(wr + ": `cornerRadius` cannot be negative");
        }
        if (e->found("oneWay"))
        {
            const std::string ow = e->lookupWord("oneWay");
            if (ow != "yes" && ow != "no")
                refuse(wr + ": `oneWay` -- " + registryRefusal::message(
                       "oneWay", ow, { "yes", "no" }, "Accepted"));
            road.oneWay = ow == "yes";
        }
        if (!e->found("waypoints"))
            refuse(wr + ": `waypoints ( { x <m>; y <m>; } ... );` -- its centre"
                   " line -- is not declared");
        std::size_t k = 0;
        for (const auto& p : e->lookupDictList("waypoints"))
        {
            ++k;
            const std::string wp = wr + " waypoint " + std::to_string(k);
            if (p->found("z"))
                refuse(wp + ": a road lies at grade; its waypoints are plan"
                       " points `{ x <m>; y <m>; }` and carry no `z`");
            road.centreline.push_back({ length(*p, "x", wp), length(*p, "y", wp) });
        }
        if (road.centreline.size() < 2)
            refuse(wr + ": a centre line needs at least two waypoints");
        for (std::size_t s = 0; s + 1 < road.centreline.size(); ++s)
        {
            const auto& a = road.centreline[s];
            const auto& b = road.centreline[s + 1];
            const bool mx = std::fabs(a[0] - b[0]) > kTol;
            const bool my = std::fabs(a[1] - b[1]) > kTol;
            if (mx && my)
                refuse(wr + ": the segment from (" + num(a[0]) + ", " + num(a[1])
                       + ") m to (" + num(b[0]) + ", " + num(b[1]) + ") m runs"
                       " DIAGONALLY -- a road segment runs along one plan axis;"
                       " add the corner (" + num(b[0]) + ", " + num(a[1])
                       + ") m between them");
            if (!mx && !my)
                refuse(wr + ": waypoints " + std::to_string(s + 1) + " and "
                       + std::to_string(s + 2) + " are the same point");
            road.length += std::fabs(a[0] - b[0]) + std::fabs(a[1] - b[1]);
        }
        R.length += road.length;
        R.roads.push_back(road);
    }
    if (R.roads.empty())
        refuse(w + ": `network` declares no road");

    //  ---- C96: the design vehicle, the turning areas, the truck routes ----
    if (rd->found("designVehicle"))
    {
        const auto dv = rd->subDict("designVehicle");
        auto& V = R.designVehicle;
        V.present = true;
        V.turningDiameter = length(*dv, "turningDiameter", w + " designVehicle");
        V.source = text(*dv, "source", w + " designVehicle");
        V.reason = text(*dv, "reason", w + " designVehicle");
        if (V.turningDiameter <= 0)
            refuse(w + " designVehicle: `turningDiameter` must be positive");
    }
    if (rd->found("turningAreas"))
    {
        std::set<std::string> an;
        std::size_t k = 0;
        for (const auto& e : rd->lookupDictList("turningAreas"))
        {
            ++k;
            LayoutTurningArea ta;
            if (!e->found("area"))
                refuse(w + " turningAreas entry " + std::to_string(k)
                       + ": `area \"<name>\";` is not declared");
            ta.id = e->lookupWord("area");
            const std::string wa = "turning area `" + ta.id + "`";
            if (!an.insert(ta.id).second)
                refuse(wa + " is declared twice");
            ta.x = length(*e, "x", wa);
            ta.y = length(*e, "y", wa);
            ta.diameter = length(*e, "diameter", wa);
            ta.reason = text(*e, "reason", wa);
            if (ta.diameter <= 0)
                refuse(wa + ": `diameter` must be positive");
            R.turningAreas.push_back(ta);
        }
    }
    if (rd->found("truckRoutes"))
    {
        if (!R.designVehicle.present)
            refuse(w + ": `truckRoutes` are declared with no `designVehicle {"
                   " turningDiameter <m>; source \"...\"; reason \"...\"; }` --"
                   " a route is checked against the vehicle that drives it");
        std::set<std::string> rn, roadNames;
        for (const auto& road : R.roads) roadNames.insert(road.id);
        std::size_t k = 0;
        for (const auto& e : rd->lookupDictList("truckRoutes"))
        {
            ++k;
            LayoutTruckRoute T;
            if (!e->found("route"))
                refuse(w + " truckRoutes entry " + std::to_string(k)
                       + ": `route \"<name>\";` is not declared");
            T.id = e->lookupWord("route");
            const std::string wt = "truck route `" + T.id + "`";
            if (!rn.insert(T.id).second)
                refuse(wt + " is declared twice");
            for (const char* key : { "from", "to" })
                if (!e->found(key))
                    refuse(wt + ": `" + std::string(key) + " <gate>;` is not"
                           " declared -- a route runs from a gate back to a gate");
            T.from   = e->lookupWord("from");
            T.to     = e->lookupWord("to");
            T.reason = text(*e, "reason", wt);
            if (!e->found("roads"))
                refuse(wt + ": `roads ( <road> ... );` -- the roads it drives,"
                       " in order -- is not declared");
            T.roads = e->lookupWordList("roads");
            if (T.roads.empty())
                refuse(wt + ": `roads` names no road");
            for (const auto& name : T.roads)
                if (!roadNames.count(name))
                    refuse(wt + ": `" + name + "` -- " + registryRefusal::message(
                           "road", name, std::vector<std::string>(roadNames.begin(),
                           roadNames.end()), "Declared"));
            if (e->found("serves")) T.serves = e->lookupWordList("serves");
            R.truckRoutes.push_back(T);
        }
    }
    else if (R.designVehicle.present)
        announce("info", "layout",
            "a `designVehicle` is declared and no `truckRoutes`: no route is"
            " walked, so the turning diameter checks nothing");
}

void checkRoads(PlantLayoutRecord& rec,
    const std::function<void(const std::string&, const std::string&,
                             const std::string&, scalar, scalar,
                             const std::string&, const std::string&)>& addFinding)
{
    LayoutRoads& R = rec.roads;
    const auto isDrivable = [](const LayoutItem& i)
    { return i.nonProcess && i.kind == kWeighbridgeKind; };

    std::vector<std::vector<LayoutArea>> rects;
    std::vector<LayoutArea> all;
    for (const auto& rd : R.roads)
    {
        rects.push_back(pavedRects(rd));
        all.insert(all.end(), rects.back().begin(), rects.back().end());
    }
    //  C96: the approaches that carry a road on to its gate's fence opening
    //  are paved too.
    for (const auto& o : rec.fence.openings)
        if (o.approach > kTol)
            all.push_back({ o.gate, std::min(o.approachX, o.x) - (o.approachX == o.x ? 0.5 * o.width : 0.0),
                                    std::max(o.approachX, o.x) + (o.approachX == o.x ? 0.5 * o.width : 0.0),
                                    std::min(o.approachY, o.y) - (o.approachY == o.y ? 0.5 * o.width : 0.0),
                                    std::max(o.approachY, o.y) + (o.approachY == o.y ? 0.5 * o.width : 0.0) });
    R.pavedArea = unionArea(all);

    //  ---- C96: a turning area through a footprint is REFUSED (it is
    //  pavement, as a road is); one that touches no road is ANNOUNCED -------
    for (const auto& ta : R.turningAreas)
    {
        for (const auto& it : rec.items)
        {
            if (isDrivable(it)) continue;
            if (verticalOverlap(0.0, R.headroom, it.z, it.dz) <= kTol) continue;
            const scalar dd = pointToFootprint(ta.x, ta.y, it);
            if (dd < 0.5 * ta.diameter - kTol)
                refuse("turning area `" + ta.id + "` (" + num(ta.diameter)
                       + " m across at (" + num(ta.x) + ", " + num(ta.y)
                       + ") m) runs THROUGH `" + it.id + "`, whose footprint comes "
                       + num(dd) + " m from its centre -- move the turning area or"
                         " the item");
        }
        scalar dmin = 1e300;
        for (const auto& rd : R.roads)
            for (std::size_t k = 0; k + 1 < rd.centreline.size(); ++k)
            {
                const auto& a = rd.centreline[k];
                const auto& b = rd.centreline[k + 1];
                const scalar cx = std::clamp(ta.x, std::min(a[0], b[0]), std::max(a[0], b[0]));
                const scalar cy = std::clamp(ta.y, std::min(a[1], b[1]), std::max(a[1], b[1]));
                dmin = std::min(dmin, std::hypot(ta.x - cx, ta.y - cy));
            }
        if (dmin > 0.5 * ta.diameter + kTol)
            addFinding("turningAreaOffRoad", ta.id, "", dmin, 0.5 * ta.diameter,
                "warning",
                "turning area `" + ta.id + "` touches no road: its centre is "
                + num(dmin) + " m from the nearest centre line, beyond its "
                + num(0.5 * ta.diameter) + " m radius");
    }

    //  ---- a road through a footprint: REFUSED (as two items overlapping) --
    for (std::size_t i = 0; i < R.roads.size(); ++i)
        for (const auto& pr : rects[i])
        {
            const LayoutItem box = planBox(pr.xMin, pr.xMax, pr.yMin, pr.yMax);
            for (const auto& it : rec.items)
            {
                if (isDrivable(it)) continue;
                const scalar c = clearPlan(box, it);
                if (c >= -kTol) continue;
                if (verticalOverlap(0.0, R.headroom, it.z, it.dz) <= kTol)
                    continue;   // it stands above the headroom: the road passes under
                refuse("road `" + R.roads[i].id + "` runs THROUGH `" + it.id
                       + "`: its paved surface (" + num(R.roads[i].width)
                       + " m wide) and the item's footprint interpenetrate by "
                       + num(-c) + " m on the plan, below the " + num(R.headroom)
                       + " m headroom the network declares.  A road and an item"
                       " cannot occupy one place -- move the road or the item");
            }
        }

    //  ---- under the pipe rack: allowed only with the headroom -----------
    if (!rec.pipes.empty())
    {
        const auto& k = rec.pipeRack;
        const scalar hw = 0.5 * k.lanesPerTier * k.laneSpacing;
        const LayoutArea band{ "", k.xStart, k.xEnd, k.y - hw, k.y + hw };
        for (std::size_t i = 0; i < R.roads.size(); ++i)
            for (const auto& pr : rects[i])
            {
                const scalar x0 = std::max(pr.xMin, band.xMin);
                const scalar x1 = std::min(pr.xMax, band.xMax);
                const scalar y0 = std::max(pr.yMin, band.yMin);
                const scalar y1 = std::min(pr.yMax, band.yMax);
                if (x1 - x0 <= kTol || y1 - y0 <= kTol) continue;
                if (k.elevation < R.headroom - kTol)
                    refuse("road `" + R.roads[i].id + "` passes UNDER the pipe"
                           " rack, whose lowest tier is " + num(k.elevation)
                           + " m above grade (" + (k.declared ? "declared"
                           : "the engine's stated default") + "), below the "
                           + num(R.headroom) + " m headroom the network declares"
                           " -- raise the rack (`pipeRack { elevation; }`) or"
                           " route the road round it");
                R.rackCrossings.push_back({ R.roads[i].id, x0, x1, y0, y1,
                                            k.elevation });
            }
    }

    //  ---- under a pipe: every routed segment above a road must clear the
    //  headroom (a declared waypoint route may run low) ---------------------
    for (const auto& p : rec.pipes)
        for (std::size_t s = 0; s + 1 < p.route.size(); ++s)
        {
            const auto& a = p.route[s];
            const auto& b = p.route[s + 1];
            const scalar zLow = std::min(a[2], b[2]);
            if (zLow >= R.headroom - kTol) continue;
            const LayoutArea seg{ "", std::min(a[0], b[0]), std::max(a[0], b[0]),
                                      std::min(a[1], b[1]), std::max(a[1], b[1]) };
            for (std::size_t i = 0; i < R.roads.size(); ++i)
                for (const auto& pr : rects[i])
                {
                    //  Strictly inside the paved surface on the plan: a pipe
                    //  riser at a nozzle beside the road does not count.
                    if (!(seg.xMin < pr.xMax - kTol && pr.xMin < seg.xMax + kTol
                          && seg.xMax > pr.xMin + kTol
                          && seg.yMin < pr.yMax - kTol && seg.yMax > pr.yMin + kTol))
                        continue;
                    refuse("pipe `" + p.stream + "` crosses road `" + R.roads[i].id
                           + "` " + num(zLow) + " m above grade, below the "
                           + num(R.headroom) + " m headroom the network declares"
                           " -- raise its route or move the road");
                }
        }

    //  ---- connectivity: roads whose centre lines meet are one network ----
    std::vector<int> comp(R.roads.size());
    for (std::size_t i = 0; i < comp.size(); ++i) comp[i] = int(i);
    std::function<int(int)> root = [&](int i)
    { return comp[i] == i ? i : (comp[i] = root(comp[i])); };
    for (std::size_t i = 0; i < R.roads.size(); ++i)
        for (std::size_t j = i + 1; j < R.roads.size(); ++j)
        {
            bool meet = false;
            const auto& A = R.roads[i].centreline;
            const auto& B = R.roads[j].centreline;
            for (std::size_t s = 0; s + 1 < A.size() && !meet; ++s)
                for (std::size_t t = 0; t + 1 < B.size() && !meet; ++t)
                    meet = segmentsMeet(A[s], A[s + 1], B[t], B[t + 1]);
            if (meet) comp[root(int(i))] = root(int(j));
        }
    std::map<int, int> label;
    for (std::size_t i = 0; i < R.roads.size(); ++i)
    {
        const int r0 = root(int(i));
        if (!label.count(r0)) { const int nl = int(label.size()); label[r0] = nl; }
        R.roads[i].component = label[r0];
    }
    R.components = int(label.size());

    //  The nearest road to an item, among `allowed` components: the clear
    //  plan distance from its footprint to the paved surface, and the
    //  nearest point on that road's centre line.
    struct Near { int road = -1; scalar dist = 1e300; scalar x = 0, y = 0;
                  bool onDeck = false; };
    auto nearest = [&](const LayoutItem& it, const std::set<int>* allowed)
    {
        Near best;
        for (std::size_t i = 0; i < R.roads.size(); ++i)
        {
            if (allowed && !allowed->count(R.roads[i].component)) continue;
            const auto& cl = R.roads[i].centreline;
            for (std::size_t s = 0; s < rects[i].size(); ++s)
            {
                const auto& pr = rects[i][s];
                const LayoutItem box = planBox(pr.xMin, pr.xMax, pr.yMin, pr.yMax);
                const scalar c = std::max(0.0, clearPlan(box, it));
                //  A weighbridge is ON the road when the centre line crosses
                //  its deck.
                bool deck = false;
                if (isDrivable(it))
                    deck = pointToFootprint(
                        std::clamp(it.x, std::min(cl[s][0], cl[s + 1][0]),
                                         std::max(cl[s][0], cl[s + 1][0])),
                        std::clamp(it.y, std::min(cl[s][1], cl[s + 1][1]),
                                         std::max(cl[s][1], cl[s + 1][1])), it)
                           <= kTol;
                const bool better = (deck && !best.onDeck)
                    || (deck == best.onDeck && c < best.dist - kTol);
                if (!better) continue;
                best.road = int(i);
                best.dist = c;
                best.onDeck = deck;
                best.x = std::clamp(it.x, std::min(cl[s][0], cl[s + 1][0]),
                                          std::max(cl[s][0], cl[s + 1][0]));
                best.y = std::clamp(it.y, std::min(cl[s][1], cl[s + 1][1]),
                                          std::max(cl[s][1], cl[s + 1][1]));
            }
        }
        return best;
    };

    //  ---- the entrances: every placed gate, served by a road within the
    //  access distance ------------------------------------------------------
    std::set<int> reached;
    for (const auto& it : rec.items)
    {
        if (!(it.nonProcess && it.kind == kGateKind)) continue;
        R.entrances.push_back(it.id);
        const Near nb = nearest(it, nullptr);
        if (nb.road < 0 || nb.dist > R.accessDistance + kTol)
        {
            addFinding("gateOffRoad", it.id, "", nb.road < 0 ? 0.0 : nb.dist,
                R.accessDistance, "warning",
                "gate `" + it.id + "` has no road within the " + num(R.accessDistance)
                + " m access distance the case declares (the nearest is "
                + (nb.road < 0 ? std::string("none") : num(nb.dist) + " m away")
                + "): the road network has no entrance there");
            continue;
        }
        reached.insert(R.roads[nb.road].component);
    }
    const bool anyGate = !R.entrances.empty();
    //  C96: ONE entrance is a site a blocked road closes.
    if (R.entrances.size() == 1)
        addFinding("singleEntrance", R.entrances.front(), "", 1.0, 2.0, "warning",
            "the site has ONE entrance (gate `" + R.entrances.front() + "`): a"
            " fire brigade arriving while that road is blocked -- by the fire, by"
            " a tanker, by the evacuation leaving -- has no second way in.  Place"
            " a second `gate`, on another side, served by the road network");
    if (!anyGate)
        addFinding("noEntrance", "roads", "", 0.0, 0.0, "warning",
            "the road network declares no entrance: no non-process item of kind"
            " `gate` is placed, so whether the roads reach the site from outside"
            " is not checked -- every road is taken as reached");
    for (auto& rd : R.roads)
    {
        rd.fromEntrance = !anyGate || reached.count(rd.component) > 0;
        if (!rd.fromEntrance)
            addFinding("roadDisconnected", rd.id, "", 0.0, 0.0, "warning",
                "road `" + rd.id + "` is not connected to any road a gate"
                " reaches: its centre line meets none of theirs, so a vehicle"
                " entering the site cannot drive onto it");
    }
    std::set<int> fromGate;
    for (const auto& rd : R.roads)
        if (rd.fromEntrance) fromGate.insert(rd.component);

    //  ---- every placed item: the nearest road a gate reaches ------------
    for (const auto& it : rec.items)
    {
        if (!it.room.empty()) continue;   // C100: reached through its building
        const Near nb = nearest(it, &fromGate);
        LayoutAccess a;
        a.item = it.id;
        if (nb.road >= 0)
        {
            a.road = R.roads[nb.road].id;
            a.distance = nb.dist;
            a.x = nb.x; a.y = nb.y;
            a.onDeck = nb.onDeck;
        }
        R.access.push_back(a);
        if (it.nonProcess && it.kind == kGateKind) continue;   // said above
        if (isDrivable(it))
        {
            if (!nb.onDeck)
                addFinding("weighbridgeOffRoad", it.id, "", 0.0, 0.0, "warning",
                    "weighbridge `" + it.id + "` lies on no road a gate reaches:"
                    " no centre line crosses its deck, so a truck cannot drive"
                    " onto it");
            continue;
        }
        if (nb.road >= 0 && nb.dist <= R.accessDistance + kTol) continue;
        const std::string far = nb.road < 0 ? std::string("no road a gate reaches")
            : "the nearest road a gate reaches, `" + a.road + "`, is " + num(nb.dist)
              + " m from its footprint";
        if (it.nonProcess)
            addFinding("buildingNotReached", it.id, a.road, nb.road < 0 ? 0.0 : nb.dist,
                R.accessDistance, "warning",
                "site building `" + it.id + "` (" + it.kind + ") is not served by"
                " the road network: " + far + ", against the " + num(R.accessDistance)
                + " m access distance the case declares (source: " + R.accessSource + ")");
        else
            addFinding("noRoadAccess", it.id, a.road, nb.road < 0 ? 0.0 : nb.dist,
                R.accessDistance, "warning",
                "`" + it.id + "` (" + it.kind + ") has no road within the "
                + num(R.accessDistance) + " m access distance the case declares"
                " for fire-brigade and maintenance access: " + far + " (source: "
                + R.accessSource + ")");
    }

    //  ---- a road through a zone the case closes to traffic: ANNOUNCED ----
    if (!R.noTraffic.empty())
        for (const auto& rel : rec.items)
        {
            if (!rel.release) continue;
            for (const auto& z : rel.zones)
            {
                if (std::find(R.noTraffic.begin(), R.noTraffic.end(), z.zone)
                    == R.noTraffic.end()) continue;
                if (verticalOverlap(0.0, R.headroom, rel.z, z.height) <= kTol)
                    continue;
                for (std::size_t i = 0; i < R.roads.size(); ++i)
                {
                    scalar dmin = 1e300;
                    for (const auto& pr : rects[i])
                        dmin = std::min(dmin, pointToFootprint(rel.x, rel.y,
                                   planBox(pr.xMin, pr.xMax, pr.yMin, pr.yMax)));
                    if (dmin >= z.radius - kTol) continue;
                    addFinding("roadInZone", R.roads[i].id,
                        rel.id + "#zone" + std::to_string(z.zone), dmin, z.radius,
                        "warning",
                        "road `" + R.roads[i].id + "` enters the zone "
                        + std::to_string(z.zone) + " envelope of `" + rel.id
                        + "`, which the case closes to traffic: its paved surface"
                        " comes " + num(dmin) + " m from the release axis against"
                        " a declared radius of " + num(z.radius) + " m (source: "
                        + rel.releaseSource + ")");
                }
            }
        }
}

//  ---- the plot (DEV.md 4c C82) ------------------------------------------

//  THE RULE, ONE SENTENCE, published on the result so every surface quotes
//  the engine rather than paraphrasing it.
const char* const kPlotRule =
    "the plot is the axis-aligned envelope of every declared sector area,"
    " every placed footprint (process and non-process), every routed"
    " pipe's polyline and every declared road's paved surface and turning"
    " area, grown on"
    " every side by the declared plot margin;"
    " the footprint area is the sum of the placed items' plan areas (a"
    " vertical cylinder's disc, any other item's rectangle), each item"
    " counted once";

//  The same rule where the case declares a fence (DEV.md 4c C93): the
//  rack-routed pipes enter as the rack's plan band, because the legs that
//  carry them on to the fence are drawn from this very plot.
const char* const kPlotRuleFenced =
    "the plot is the axis-aligned envelope of every declared sector area,"
    " every placed footprint (process and non-process), the pipe rack's plan"
    " band (which every rack route lies within, up to the legs that carry a"
    " boundary pipe on to the fence, inside the fence by construction),"
    " every declared waypoint route and every declared road's paved surface"
    " and turning area,"
    " grown on every side by the declared plot margin;"
    " the footprint area is the sum of the placed items' plan areas (a"
    " vertical cylinder's disc, any other item's rectangle), each item"
    " counted once";

//  The plan area one item covers.
scalar planArea(const LayoutItem& i)
{
    return isCircle(i) ? 0.25 * kPi * i.dx * i.dx : i.dx * i.dy;
}

//  The area of the UNION of axis-aligned rectangles, exactly, on the grid
//  their own edges make (no sampling).
scalar unionArea(const std::vector<LayoutArea>& rs)
{
    std::vector<scalar> xs, ys;
    for (const auto& a : rs)
    {
        xs.push_back(a.xMin); xs.push_back(a.xMax);
        ys.push_back(a.yMin); ys.push_back(a.yMax);
    }
    std::sort(xs.begin(), xs.end());
    std::sort(ys.begin(), ys.end());
    scalar total = 0;
    for (std::size_t i = 0; i + 1 < xs.size(); ++i)
        for (std::size_t j = 0; j + 1 < ys.size(); ++j)
        {
            const scalar cx = 0.5 * (xs[i] + xs[i + 1]);
            const scalar cy = 0.5 * (ys[j] + ys[j + 1]);
            for (const auto& a : rs)
                if (cx > a.xMin && cx < a.xMax && cy > a.yMin && cy < a.yMax)
                {
                    total += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
                    break;
                }
        }
    return total;
}

void plotOf(const Dictionary& d, PlantLayoutRecord& rec, bool withFence)
{
    LayoutPlot& pl = rec.plot;
    pl.present = true;
    pl.rule    = withFence ? kPlotRuleFenced : kPlotRule;

    //  ---- the margin: the case's, or 0 m announced ---------------------
    if (d.found("plot"))
    {
        const auto pd = d.subDict("plot");
        pl.margin         = length(*pd, "margin", "plot");
        pl.marginReason   = text(*pd, "reason", "plot");
        pl.marginDeclared = true;
        if (pl.margin < 0)
            refuse("plot: `margin " + num(pl.margin) + " m;` -- a margin is the"
                   " ground kept clear around the plant and cannot be negative");
    }

    //  ---- the envelope -----------------------------------------------------
    scalar x0 = 1e300, x1 = -1e300, y0 = 1e300, y1 = -1e300;
    auto take = [&](scalar xa, scalar xb, scalar ya, scalar yb)
    {
        x0 = std::min(x0, xa); x1 = std::max(x1, xb);
        y0 = std::min(y0, ya); y1 = std::max(y1, yb);
    };
    for (const auto& i : rec.items)
        take(i.x - 0.5 * i.dx, i.x + 0.5 * i.dx, i.y - 0.5 * i.dy, i.y + 0.5 * i.dy);
    for (const auto& a : rec.areas)
        take(a.xMin, a.xMax, a.yMin, a.yMax);
    //  WITH A FENCE (DEV.md 4c C93) a boundary pipe is carried on to the
    //  fence, which is drawn FROM this plot -- so the rack-routed pipes enter
    //  the envelope as the rack's own plan band (every rack route lies in the
    //  envelope of the items it joins and that band, its battery-limit ends
    //  included), and the legs from the rack to the fence lie inside the
    //  fence by construction.  A declared waypoint route is the case's own
    //  geometry and enters as itself.  Without a fence: every route, as
    //  before.
    bool rackBand = false;
    for (const auto& p : rec.pipes)
    {
        if (withFence && p.routedBy == "rack") { rackBand = true; continue; }
        for (const auto& q : p.route)
            take(q[0], q[0], q[1], q[1]);
    }
    if (rackBand)
    {
        const auto& k = rec.pipeRack;
        const scalar hw = 0.5 * k.lanesPerTier * k.laneSpacing;
        take(k.xStart, k.xEnd, k.y - hw, k.y + hw);
    }
    for (const auto& rd : rec.roads.roads)
        for (const auto& pr : pavedRects(rd))
            take(pr.xMin, pr.xMax, pr.yMin, pr.yMax);
    for (const auto& ta : rec.roads.turningAreas)   // C96
        take(ta.x - 0.5 * ta.diameter, ta.x + 0.5 * ta.diameter,
             ta.y - 0.5 * ta.diameter, ta.y + 0.5 * ta.diameter);
    //  THE GMP INTERIOR (DEV.md 4c C97): every room of a declared
    //  `building {}`, its plan box read by the building's own reader -- so a
    //  room is never beyond the plot and its ground is priced with the rest.
    //  The rule's sentence says so only where a building is declared, so a
    //  case with none publishes the sentence it always did.
    const auto rooms = buildingLayout::roomPlans(d);
    for (const auto& rm : rooms) take(rm.xMin, rm.xMax, rm.yMin, rm.yMax);
    if (!rooms.empty())
    {
        const std::string at = ", grown on";
        const auto k = pl.rule.find(at);
        if (k != std::string::npos)
            pl.rule.insert(k, " and every room of the declared building (its"
                              " plan box)");
    }
    //  SECONDARY CONTAINMENT (DEV.md 4c C134): every declared bund's or
    //  impounding area's wall outline and its pit occupy ground too.  The
    //  sentence names them only where one is declared.
    for (const auto& b : rec.bunds)
    {
        for (const auto& q : b.outline) take(q[0], q[0], q[1], q[1]);
        if (b.hasPit)
            take(b.pitX - 0.5 * b.pitLength, b.pitX + 0.5 * b.pitLength,
                 b.pitY - 0.5 * b.pitWidth,  b.pitY + 0.5 * b.pitWidth);
    }
    if (!rec.bunds.empty())
    {
        const std::string at = ", grown on";
        const auto k = pl.rule.find(at);
        if (k != std::string::npos)
            pl.rule.insert(k, " and every declared secondary containment (its"
                              " wall's outline and an impounding area's pit)");
    }
    pl.xMin = x0 - pl.margin;  pl.xMax = x1 + pl.margin;
    pl.yMin = y0 - pl.margin;  pl.yMax = y1 + pl.margin;
    pl.plotArea = (pl.xMax - pl.xMin) * (pl.yMax - pl.yMin);

    //  ---- the footprints ---------------------------------------------------
    //  An item inside the declared building (C100) stands on the building's
    //  ground, which the shell's own footprint already counts: it is not
    //  counted again, nor stacked over the shell.
    bool anyIndoor = false;
    for (const auto& i : rec.items)
    {
        if (!i.room.empty()) { anyIndoor = true; continue; }
        pl.footprintArea += planArea(i);
    }
    if (anyIndoor) pl.rule += ", an item inside the declared building counted in"
                              " the building's footprint and not again";
    pl.footprintShare = pl.plotArea > 0 ? pl.footprintArea / pl.plotArea : 0.0;
    for (std::size_t i = 0; i < rec.items.size(); ++i)
        for (std::size_t j = i + 1; j < rec.items.size(); ++j)
            if (rec.items[i].room.empty() && rec.items[j].room.empty()
                && clearPlan(rec.items[i], rec.items[j]) < -kTol) ++pl.stackedPairs;

    //  ---- the declared sector areas: their union, and shared ground ------
    if (!rec.areas.empty())
    {
        scalar sum = 0;
        for (const auto& a : rec.areas) sum += (a.xMax - a.xMin) * (a.yMax - a.yMin);
        pl.declaredAreasUnion   = unionArea(rec.areas);
        pl.declaredAreasOverlap = std::max(0.0, sum - pl.declaredAreasUnion);
        for (std::size_t i = 0; i < rec.areas.size(); ++i)
            for (std::size_t j = i + 1; j < rec.areas.size(); ++j)
            {
                const auto& a = rec.areas[i];
                const auto& b = rec.areas[j];
                const scalar w = std::min(a.xMax, b.xMax) - std::max(a.xMin, b.xMin);
                const scalar h = std::min(a.yMax, b.yMax) - std::max(a.yMin, b.yMin);
                if (w > kTol && h > kTol)
                    announce("warning", "layout '" + a.sector + "'",
                        "the declared areas of sectors " + a.sector + " and "
                        + b.sector + " share " + num(w * h) + " m2 of ground ("
                        + num(w) + " m x " + num(h) + " m): the plot counts that"
                        " ground once, and the two sector areas, published as"
                        " declared, add up to more than their union");
            }
    }

    //  ---- per sector, in the order the plan first names it --------------
    std::vector<std::string> order;
    for (const auto& a : rec.areas) order.push_back(a.sector);
    for (const auto& i : rec.items)
        if (!i.sector.empty()
            && std::find(order.begin(), order.end(), i.sector) == order.end())
            order.push_back(i.sector);
    for (const auto& sec : order)
    {
        LayoutPlotSector ps;
        ps.sector = sec;
        scalar a0 = 1e300, a1 = -1e300, b0 = 1e300, b1 = -1e300;
        for (const auto& i : rec.items)
        {
            if (i.sector != sec) continue;
            if (i.room.empty()) ps.footprintArea += planArea(i);   // C100
            a0 = std::min(a0, i.x - 0.5 * i.dx); a1 = std::max(a1, i.x + 0.5 * i.dx);
            b0 = std::min(b0, i.y - 0.5 * i.dy); b1 = std::max(b1, i.y + 0.5 * i.dy);
        }
        const auto ar = std::find_if(rec.areas.begin(), rec.areas.end(),
            [&](const LayoutArea& a) { return a.sector == sec; });
        if (ar != rec.areas.end())
        {
            ps.from     = "declaredArea";
            ps.plotArea = (ar->xMax - ar->xMin) * (ar->yMax - ar->yMin);
        }
        else
        {
            ps.from     = "footprintEnvelope";
            ps.plotArea = (a1 - a0) * (b1 - b0);
        }
        pl.sectors.push_back(ps);
    }

    if (!pl.marginDeclared)
        announce("info", "layout",
            "no `plot { margin; reason; }` is declared, so the plot area ("
            + num(pl.plotArea) + " m2) is the BARE envelope of the layout -- a"
              " LOWER BOUND: a real plot keeps ground clear around the plant"
              " for its roads, its fence and its access, and how much is the"
              " case's to declare and defend (`plot { margin <m>; reason"
              " \"...\"; }` in system/layoutDict).  No margin is invented");
}

//  ---- the fence (DEV.md 4c C93) -------------------------------------------

const char* const kFenceRule =
    "the fence is the published plot's boundary moved `inset` inward (0 m"
    " when none is declared, announced); it opens at each placed gate, on the"
    " side nearest the gate, centred on the end of the road that serves the"
    " gate and as wide as that road (the gate's own extent along the side"
    " when no road serves it); a road that meets the fence anywhere else is"
    " refused; every pipe that ends at a battery limit is carried along its"
    " rack lane to the fence -- west for a plant inlet, east for an outlet,"
    " or the side the case names (north or south at a declared x) -- and"
    " crosses it there, labelled with where it comes from or goes to";

using FindingSink = std::function<void(const std::string&, const std::string&,
                                       const std::string&, scalar, scalar,
                                       const std::string&, const std::string&)>;

void fenceOf(const Dictionary& d, PlantLayoutRecord& rec,
             const FindingSink& addFinding)
{
    LayoutFence& F = rec.fence;
    const auto fd = d.subDict("fence");
    const std::string w = "fence";
    F.present = true;
    F.rule    = kFenceRule;
    F.source  = text(*fd, "source", w);
    F.reason  = text(*fd, "reason", w);
    if (fd->found("inset"))
    {
        F.inset = length(*fd, "inset", w);
        F.insetDeclared = true;
        if (F.inset < 0)
            refuse("fence: `inset " + num(F.inset) + " m;` -- the fence is"
                   " moved INWARD of the plot boundary; a negative inset would"
                   " put it on land the plot does not count");
    }
    else
        announce("info", "layout",
            "no `inset` is declared in `fence {}`, so the fence stands ON the"
            " plot boundary (inset 0 m): the plot's margin is then the clear"
            " strip inside it.  Declare `inset <m>;` to say otherwise");
    const auto& pl = rec.plot;
    F.xMin = pl.xMin + F.inset;  F.xMax = pl.xMax - F.inset;
    F.yMin = pl.yMin + F.inset;  F.yMax = pl.yMax - F.inset;
    if (F.xMax - F.xMin <= kTol || F.yMax - F.yMin <= kTol)
        refuse("fence: `inset " + num(F.inset) + " m;` leaves no ground inside"
               " the fence (the plot is " + num(pl.xMax - pl.xMin) + " m x "
               + num(pl.yMax - pl.yMin) + " m)");
    F.length = 2.0 * ((F.xMax - F.xMin) + (F.yMax - F.yMin));

    //  The side of the fence nearest a plan point, and a point's coordinate
    //  ALONG a side (x on north and south, y on east and west).
    auto nearestSide = [&](scalar px, scalar py)
    {
        const std::pair<scalar, std::string> c[4] = {
            { py - F.yMin, "south" }, { F.yMax - py, "north" },
            { px - F.xMin, "west"  }, { F.xMax - px, "east"  } };
        int k = 0;
        for (int i = 1; i < 4; ++i) if (c[i].first < c[k].first - kTol) k = i;
        return c[k].second;
    };
    auto onSide = [&](const std::string& side, scalar along, scalar& x, scalar& y)
    {
        if (side == "south")      { x = along; y = F.yMin; }
        else if (side == "north") { x = along; y = F.yMax; }
        else if (side == "west")  { x = F.xMin; y = along; }
        else                      { x = F.xMax; y = along; }
    };
    const auto alongX = [](const std::string& side)
    { return side == "south" || side == "north"; };

    //  ---- the openings: one per gate -------------------------------------
    for (const auto& g : rec.items)
    {
        if (!(g.nonProcess && g.kind == kGateKind)) continue;
        LayoutFenceOpening o;
        o.gate = g.id;
        o.side = nearestSide(g.x, g.y);
        //  The road that serves the gate: the nearest paved surface.
        const LayoutRoad* best = nullptr;
        scalar bestD = 1e300;
        for (const auto& rd : rec.roads.roads)
            for (const auto& pr : pavedRects(rd))
            {
                const scalar c = std::max(0.0, clearPlan(
                    planBox(pr.xMin, pr.xMax, pr.yMin, pr.yMax), g));
                if (c < bestD - kTol) { bestD = c; best = &rd; }
            }
        scalar along = alongX(o.side) ? g.x : g.y;
        o.width = alongX(o.side) ? g.dx : g.dy;
        if (best)
        {
            //  Its centre-line point nearest the side: the road's END there.
            scalar dmin = 1e300;
            for (const auto& q : best->centreline)
            {
                scalar fx = 0, fy = 0;
                onSide(o.side, alongX(o.side) ? q[0] : q[1], fx, fy);
                const scalar dd = std::hypot(q[0] - fx, q[1] - fy);
                if (dd < dmin - kTol)
                {
                    dmin = dd; along = alongX(o.side) ? q[0] : q[1];
                    o.approachX = q[0]; o.approachY = q[1];
                }
            }
            o.road  = best->id;
            o.width = best->width;
        }
        onSide(o.side, along, o.x, o.y);
        //  C96: the APPROACH -- the road carried on, perpendicular to the
        //  fence, from that end to the opening, so a road the plot's margin
        //  stops short still reaches its gate.  It is pavement, so it may not
        //  run through an item.
        if (best)
        {
            o.approach = std::hypot(o.x - o.approachX, o.y - o.approachY);
            if (o.approach > kTol)
            {
                const scalar h = 0.5 * o.width;
                const bool vert = std::fabs(o.x - o.approachX) < kTol;
                const LayoutItem strip = planBox(
                    std::min(o.x, o.approachX) - (vert ? h : 0.0),
                    std::max(o.x, o.approachX) + (vert ? h : 0.0),
                    std::min(o.y, o.approachY) - (vert ? 0.0 : h),
                    std::max(o.y, o.approachY) + (vert ? 0.0 : h));
                for (const auto& it : rec.items)
                {
                    if (it.nonProcess && it.kind == kWeighbridgeKind) continue;
                    if (verticalOverlap(0.0, rec.roads.headroom, it.z, it.dz) <= kTol)
                        continue;
                    const scalar c = clearPlan(strip, it);
                    if (c < -kTol)
                        refuse("the approach from road `" + o.road + "` to gate `"
                               + o.gate + "`'s opening in the fence runs THROUGH `"
                               + it.id + "` (by " + num(-c) + " m on the plan): the"
                                 " road is carried on to the fence there, so keep"
                                 " that strip clear");
                }
            }
        }
        o.gateDistance =
              o.side == "south" ? (g.y - 0.5 * g.dy) - F.yMin
            : o.side == "north" ? F.yMax - (g.y + 0.5 * g.dy)
            : o.side == "west"  ? (g.x - 0.5 * g.dx) - F.xMin
            :                     F.xMax - (g.x + 0.5 * g.dx);
        F.openings.push_back(o);
    }
    if (F.openings.empty())
        announce("warning", "layout",
            "the fence declares no way in: no non-process item of kind `gate`"
            " is placed, so the fence is drawn CLOSED -- nothing can enter the"
            " site except by the boundary pipes");

    //  ---- a road meets the fence only at a gate's opening: REFUSED else --
    for (const auto& rd : rec.roads.roads)
        for (const auto& pr : pavedRects(rd))
        {
            struct Cut { const char* side; bool hit; scalar a0, a1; };
            const Cut cuts[4] = {
                { "south", pr.yMin < F.yMin - kTol && pr.yMax > F.yMin + kTol
                           && pr.xMax > F.xMin && pr.xMin < F.xMax,
                  std::max(pr.xMin, F.xMin), std::min(pr.xMax, F.xMax) },
                { "north", pr.yMin < F.yMax - kTol && pr.yMax > F.yMax + kTol
                           && pr.xMax > F.xMin && pr.xMin < F.xMax,
                  std::max(pr.xMin, F.xMin), std::min(pr.xMax, F.xMax) },
                { "west",  pr.xMin < F.xMin - kTol && pr.xMax > F.xMin + kTol
                           && pr.yMax > F.yMin && pr.yMin < F.yMax,
                  std::max(pr.yMin, F.yMin), std::min(pr.yMax, F.yMax) },
                { "east",  pr.xMin < F.xMax - kTol && pr.xMax > F.xMax + kTol
                           && pr.yMax > F.yMin && pr.yMin < F.yMax,
                  std::max(pr.yMin, F.yMin), std::min(pr.yMax, F.yMax) } };
            for (const auto& c : cuts)
            {
                if (!c.hit) continue;
                bool atGate = false;
                for (const auto& o : F.openings)
                {
                    if (o.side != c.side) continue;
                    const scalar oc = alongX(o.side) ? o.x : o.y;
                    if (c.a0 >= oc - 0.5 * o.width - kTol
                        && c.a1 <= oc + 0.5 * o.width + kTol) atGate = true;
                }
                if (!atGate)
                    refuse("road `" + rd.id + "` meets the fence on its "
                           + std::string(c.side) + " side (" + num(c.a0)
                           + " .. " + num(c.a1) + " m along it) where no gate"
                           " opens it -- a road through a fence with no gate is"
                           " a road nobody can drive.  Place a `gate` there,"
                           " stop the road inside the fence, or change the"
                           " fence's inset");
            }
        }

    //  ---- nothing stands across the fence (checked after the roads, so a
    //  road the fence cuts is named first) ---------------------------------
    for (const auto& i : rec.items)
        if (i.x - 0.5 * i.dx < F.xMin - kTol || i.x + 0.5 * i.dx > F.xMax + kTol
            || i.y - 0.5 * i.dy < F.yMin - kTol || i.y + 0.5 * i.dy > F.yMax + kTol)
            refuse("fence: `" + i.id + "` stands across or outside the fence"
                   " (the fence runs x " + num(F.xMin) + " .. " + num(F.xMax)
                   + " m, y " + num(F.yMin) + " .. " + num(F.yMax) + " m, the"
                   " plot moved " + num(F.inset) + " m inward) -- reduce the"
                   " inset or move the item");

    //  ---- the boundary pipes: carried to the fence, labelled ---------------
    struct Declared { std::string side, word, label; scalar at = 0;
                      bool hasAt = false, used = false; };
    std::map<std::string, Declared> declared;
    if (fd->found("crossings"))
        for (const auto& cd : fd->lookupDictList("crossings"))
        {
            if (!cd->found("stream"))
                refuse("fence crossings: an entry declares no `stream`");
            const std::string s = cd->lookupWord("stream");
            const std::string ww = "fence crossing `" + s + "`";
            if (declared.count(s))
                refuse(ww + " is declared twice");
            Declared e;
            if (cd->found("from") == cd->found("to"))
                refuse(ww + ": declare where it comes FROM (a plant inlet,"
                       " `from \"...\";`) or where it goes TO (an outlet,"
                       " `to \"...\";`) -- exactly one");
            e.word  = cd->found("from") ? "from" : "to";
            e.label = text(*cd, e.word, ww);
            if (cd->found("side"))
            {
                e.side = cd->lookupWord("side");
                if (e.side != "north" && e.side != "south" && e.side != "east"
                    && e.side != "west")
                    refuse(ww + ": " + registryRefusal::message("side", e.side,
                           { "north", "south", "east", "west" }, "Accepted"));
            }
            if (cd->found("at"))
            {
                e.at = length(*cd, "at", ww);
                e.hasAt = true;
            }
            if (!e.side.empty() && alongX(e.side) && !e.hasAt)
                refuse(ww + ": a crossing on the " + e.side + " side names where"
                       " along it (`at <x> m;`) -- the pipe leaves its rack lane"
                       " there");
            if (e.hasAt && (e.side.empty() || !alongX(e.side)))
                refuse(ww + ": `at` places a crossing along the north or south"
                       " side only; on the west and east sides the pipe meets"
                       " the fence where its rack lane does");
            declared[s] = e;
        }

    const auto& k = rec.pipeRack;
    for (auto& p : rec.pipes)
    {
        const bool in  = p.fromKind == "batteryLimit";
        const bool out = p.toKind   == "batteryLimit";
        if (!in && !out) continue;
        LayoutFenceCrossing c;
        c.stream    = p.stream;
        c.direction = in ? "in" : "out";
        auto e = declared.find(p.stream);
        Declared* dc = e == declared.end() ? nullptr : &e->second;
        const std::string ww = "fence crossing `" + p.stream + "`";
        if (dc)
        {
            dc->used = true;
            const std::string want = in ? "from" : "to";
            if (dc->word != want)
                refuse(ww + ": `" + p.stream + "` is a plant "
                       + std::string(in ? "INLET" : "OUTLET") + ", so its label"
                       " says where it comes " + (in ? "FROM" : "goes TO")
                       + " (`" + want + " \"...\";`), not `" + dc->word + "`");
        }
        if (p.routedBy == "waypoints")
        {
            if (dc && !dc->side.empty())
                refuse(ww + ": the pipe's route is DECLARED (waypoints), so its"
                       " crossing is where that route ends; a `side` would be a"
                       " second home for it");
            const auto& q = in ? p.route.front() : p.route.back();
            const bool on = (std::fabs(q[0] - F.xMin) <= kTol
                             || std::fabs(q[0] - F.xMax) <= kTol)
                            && q[1] >= F.yMin - kTol && q[1] <= F.yMax + kTol;
            const bool onY = (std::fabs(q[1] - F.yMin) <= kTol
                              || std::fabs(q[1] - F.yMax) <= kTol)
                             && q[0] >= F.xMin - kTol && q[0] <= F.xMax + kTol;
            if (!on && !onY)
                refuse(ww + ": the declared route's " + (in ? "first" : "last")
                       + " waypoint (" + num(q[0]) + ", " + num(q[1]) + ") m is"
                       " its battery limit and does not lie on the fence (x "
                       + num(F.xMin) + " .. " + num(F.xMax) + " m, y "
                       + num(F.yMin) + " .. " + num(F.yMax) + " m)");
            c.x = q[0]; c.y = q[1]; c.z = q[2];
            c.side = nearestSide(q[0], q[1]);
            c.positionFrom = "waypoints";
        }
        else
        {
            scalar ly = 0, lz = 0;
            laneAt(k, p.lane, ly, lz);
            c.side = dc && !dc->side.empty() ? dc->side : (in ? "west" : "east");
            c.positionFrom = dc && !dc->side.empty() ? "declared" : "statedDefault";
            std::vector<std::vector<scalar>> leg;   // in the direction of flow
            if (alongX(c.side))
            {
                if (!(dc->at > F.xMin + kTol && dc->at < F.xMax - kTol))
                    refuse(ww + ": `at " + num(dc->at) + " m;` lies outside the"
                           " " + c.side + " side of the fence (x " + num(F.xMin)
                           + " .. " + num(F.xMax) + " m)");
                c.x = dc->at;
                c.y = c.side == "south" ? F.yMin : F.yMax;
                c.z = lz;
                const std::vector<scalar> C{ c.x, c.y, c.z }, A{ c.x, ly, lz };
                leg = in ? std::vector<std::vector<scalar>>{ C, A }
                         : std::vector<std::vector<scalar>>{ A, C };
            }
            else
            {
                c.x = c.side == "west" ? F.xMin : F.xMax;
                c.y = ly;
                c.z = lz;
                leg = { { c.x, c.y, c.z } };
            }
            //  Replace the battery-limit point (the rack end) by the leg.
            std::vector<std::vector<scalar>> r = p.route;
            if (in) { r.erase(r.begin()); r.insert(r.begin(), leg.begin(), leg.end()); }
            else    { r.pop_back();       r.insert(r.end(),   leg.begin(), leg.end()); }
            p.route = tidy(r);
            p.length = 0;
            for (std::size_t i = 1; i < p.route.size(); ++i)
                p.length += segLength(p.route[i - 1], p.route[i]);
        }
        if (dc) { c.label = dc->label; c.labelDeclared = true; }
        else
            addFinding("unlabelledCrossing", p.stream, "", 0.0, 0.0, "warning",
                "boundary stream `" + p.stream + "` crosses the fence on its "
                + c.side + " side at (" + num(c.x) + ", " + num(c.y) + ") m"
                " with no declared " + (in ? "origin" : "destination") + ": say"
                " where it " + (in ? "comes from" : "goes to") + " -- `fence {"
                " crossings ( { stream " + p.stream + "; " + (in ? "from" : "to")
                + " \"...\"; } ); }`");
        F.crossings.push_back(c);
    }
    //  A declared crossing whose stream is NOT ROUTED (an end the layout
    //  cannot reach -- a refused sizer, an unplaced item) is not drawn: the
    //  reason it is not routed is already published, and a plot plan must not
    //  turn one missing pipe into a missing run (C79's rule).  A name that is
    //  no stream of the run, or a stream with no battery-limit end, refuses.
    for (const auto& [s, e] : declared)
    {
        if (e.used) continue;
        bool unrouted = false;
        for (const auto& n : rec.notRouted) if (n.stream == s) unrouted = true;
        if (!unrouted)
            refuse("fence crossing `" + s + "`: no pipe of this layout ends at a"
                   " battery limit under that name -- only a plant inlet or"
                   " outlet crosses the fence");
    }
}

//  ---- the site logistics (DEV.md 4c C96) ---------------------------------

//  THE NON-PROCESS KINDS C96 GIVES A MEANING, beside `gate` and
//  `weighbridge` above -- the same ONE place for the kind words the layout
//  reads:
//    carPark        -- declares its bays in `parking {}` (`readParking`);
//    musterPoint,
//    firePumpHouse  -- an EMERGENCY item: where people gather, and what
//                      pumps the fire water, when something has gone wrong.
//                      One inside a release source's zone envelope or
//                      downwind of it is announced (`checkExposure`), an
//                      ignition source or not: what is at stake is that it
//                      be usable, not that it light the cloud.
//  Every other word (office, laydown, windsock, fireWaterTank, ...) is drawn
//  by its kind and checked only by the rules every item meets.
const char* const kCarParkKind = "carPark";

bool isEmergencyKind(const std::string& k)
{
    return k == "musterPoint" || k == "firePumpHouse";
}

//  THE CAR PARK RULE (C96), one home.  The rows run along the item's LENGTH
//  (its declared orientation axis), between two END AISLES of the declared
//  aisle width that join them; across the width the pattern is a row, its
//  aisle, a row (`doubleLoaded`: two rows share an aisle, a car enters and
//  leaves a bay from the same aisle) or an aisle, a row, an aisle
//  (`driveThrough`: a car enters from one aisle and leaves into the next,
//  nose first).  A bay of width w and length l at angle th to its aisle
//  occupies a DEPTH l sin th + w cos th across the aisle and a PITCH w / sin
//  th along it, and the first bay of a row reaches l cos th + w sin th along
//  the aisle.  So a row holds 1 + floor((L - 2 a - (l cos th + w sin th)) /
//  pitch) bays, and the declared count must not exceed rows x that.
void readParking(const Dictionary& e, const LayoutItem& it,
                 const std::string& where, PlantLayoutRecord& rec)
{
    const bool isPark = it.nonProcess && it.kind == kCarParkKind;
    if (!e.found("parking"))
    {
        if (isPark)
            refuse(where + ": a `carPark` declares its bays -- `parking {"
                   " bays <n>; bay { width <m>; length <m>; } aisle <m>;"
                   " angle <deg>; arrangement doubleLoaded|driveThrough;"
                   " entry reverse|forward; source \"...\"; reason \"...\"; }`");
        return;
    }
    if (!isPark)
        refuse(where + ": `parking {}` is declared on an item of kind `"
               + it.kind + "` -- only a non-process item of kind `carPark`"
               " has bays");
    if (it.orientation == "vertical")
        refuse(where + ": a car park lays its rows along its length -- declare"
               " `orientation alongX;` or `orientation alongY;`");
    const auto p = e.subDict("parking");
    const std::string w = where + " parking";
    LayoutCarPark c;
    c.item = it.id;
    if (!p->found("bays"))
        refuse(w + ": `bays <n>;` -- the number of bays the case declares --"
               " is not declared");
    const scalar nb = p->lookupScalar("bays");
    if (nb < 1.0 || std::fabs(nb - std::round(nb)) > 1e-9)
        refuse(w + ": `bays " + num(nb) + ";` must be a whole number of at"
               " least 1");
    c.bays = int(std::lround(nb));
    if (!p->found("bay"))
        refuse(w + ": `bay { width <m>; length <m>; }` -- the size of one"
               " bay -- is not declared");
    const auto b = p->subDict("bay");
    c.bayWidth  = length(*b, "width", w + " bay");
    c.bayLength = length(*b, "length", w + " bay");
    c.aisle     = length(*p, "aisle", w);
    c.angleDeg  = angleDeg(*p, "angle", w);
    if (c.bayWidth <= 0 || c.bayLength <= 0 || c.aisle <= 0)
        refuse(w + ": the bay's width and length and the aisle must be"
               " positive");
    if (c.angleDeg < 30.0 - 1e-9 || c.angleDeg > 90.0 + 1e-9)
        refuse(w + ": `angle " + num(c.angleDeg) + " deg;` -- a bay stands at"
               " 30 to 90 deg to its aisle; a parallel bay along a kerb is not"
               " a car-park row and is not laid out here");
    if (!p->found("arrangement"))
        refuse(w + ": `arrangement doubleLoaded|driveThrough;` is not declared");
    c.arrangement = p->lookupWord("arrangement");
    if (c.arrangement != "doubleLoaded" && c.arrangement != "driveThrough")
        refuse(w + ": " + registryRefusal::message("arrangement", c.arrangement,
               { "doubleLoaded", "driveThrough" }, "Accepted"));
    if (!p->found("entry"))
        refuse(w + ": `entry reverse|forward;` -- how a car enters its bay --"
               " is not declared");
    c.entry = p->lookupWord("entry");
    if (c.entry != "reverse" && c.entry != "forward")
        refuse(w + ": " + registryRefusal::message("entry", c.entry,
               { "reverse", "forward" }, "Accepted"));
    c.source = text(*p, "source", w);
    c.reason = text(*p, "reason", w);
    c.exitsForward = c.arrangement == "driveThrough" || c.entry == "reverse";

    const scalar th = c.angleDeg * kPi / 180.0;
    const scalar sn = std::sin(th);
    const scalar cs = std::fabs(std::cos(th)) < 1e-12 ? 0.0 : std::cos(th);
    const bool   ax = it.orientation == "alongX";
    const scalar Lr = ax ? it.dx : it.dy;    // along the rows
    const scalar Wr = ax ? it.dy : it.dx;    // across them
    c.area   = it.dx * it.dy;
    c.depth  = c.bayLength * sn + c.bayWidth * cs;
    c.pitch  = c.bayWidth / sn;
    const scalar first = c.bayLength * cs + c.bayWidth * sn;
    c.usableLength = Lr - 2.0 * c.aisle;
    c.perRow = c.usableLength + 1e-9 < first ? 0
        : int(std::floor((c.usableLength - first) / c.pitch + 1e-9)) + 1;
    //  The rows across the width: where each row band starts (local v,
    //  from -Wr/2) and on which side its aisle lies (+1: the +v side).
    struct Row { scalar v0; int side; };
    std::vector<Row> rows;
    if (c.arrangement == "doubleLoaded")
    {
        const scalar mod = 2.0 * c.depth + c.aisle;
        scalar v = -0.5 * Wr;
        while (v + mod <= 0.5 * Wr + 1e-9)
        {
            rows.push_back({ v, +1 });
            rows.push_back({ v + c.depth + c.aisle, -1 });
            v += mod;
        }
        if (v + c.depth + c.aisle <= 0.5 * Wr + 1e-9) rows.push_back({ v, +1 });
    }
    else
    {
        scalar v = -0.5 * Wr + c.aisle;
        while (v + c.depth + c.aisle <= 0.5 * Wr + 1e-9)
        {
            rows.push_back({ v, +1 });
            v += c.depth + c.aisle;
        }
    }
    c.rows     = int(rows.size());
    c.capacity = c.rows * c.perRow;
    if (c.bays > c.capacity)
        refuse(where + ": " + std::to_string(c.bays) + " bays are declared, and"
               " the footprint holds " + std::to_string(c.capacity) + " ("
               + std::to_string(c.rows) + " row(s) of " + std::to_string(c.perRow)
               + ": bays " + num(c.bayWidth) + " m x " + num(c.bayLength)
               + " m at " + num(c.angleDeg) + " deg, aisles " + num(c.aisle)
               + " m, " + c.arrangement + ", on " + num(Lr) + " m x " + num(Wr)
               + " m).  Bays that do not fit are not a car park -- enlarge the"
                 " footprint or declare fewer bays");
    //  Every declared bay, row by row: its plan centre and the direction a
    //  car leaves it by (toward its aisle; the +v aisle for a drive-through).
    int left = c.bays;
    for (const auto& r : rows)
        for (int k = 0; k < c.perRow && left > 0; ++k, --left)
        {
            const scalar u  = -0.5 * Lr + c.aisle + 0.5 * first + k * c.pitch;
            const scalar v  = r.v0 + 0.5 * c.depth;
            const scalar eu = cs, ev = sn * r.side;
            if (ax) c.stalls.push_back({ it.x + u, it.y + v, eu, ev });
            else    c.stalls.push_back({ it.x + v, it.y + u, ev, eu });
        }
    rec.carParks.push_back(c);
}

//  THE EMERGENCY ITEMS (C96): a muster point or a fire-water pump house
//  inside a release source's declared zone envelope, or downwind of it by
//  the declared wind, is ANNOUNCED -- the same geometry the ignition check
//  reads, applied to what must stay usable when the release happens.
void checkExposure(const PlantLayoutRecord& rec, const FindingSink& addFinding)
{
    for (const auto& em : rec.items)
    {
        if (!(em.nonProcess && isEmergencyKind(em.kind))) continue;
        const std::string what = em.kind == "musterPoint"
            ? "a muster point is where people gather when something has gone"
              " wrong, and a cloud from this source reaches it"
            : "the fire-water pumps must run when this source is on fire or"
              " leaking, and a cloud from it reaches them";
        for (const auto& rel : rec.items)
        {
            if (!rel.release || rel.id == em.id) continue;
            const scalar dPlan = pointToFootprint(rel.x, rel.y, em);
            for (const auto& z : rel.zones)
            {
                if (dPlan >= z.radius - kTol) continue;
                if (verticalOverlap(rel.z, z.height, em.z, em.dz) <= kTol)
                    continue;
                addFinding("exposedInZone", em.id, rel.id + "#zone"
                           + std::to_string(z.zone), dPlan, z.radius,
                    "warning",
                    "`" + em.id + "` (" + em.kind + ") lies inside the zone "
                    + std::to_string(z.zone) + " envelope of `" + rel.id + "`: "
                    + num(dPlan) + " m from its axis against a declared radius"
                    " of " + num(z.radius) + " m -- " + what + " (source: "
                    + rel.releaseSource + ")");
            }
            if (!rec.wind.present) continue;
            const auto& w = rec.wind;
            const scalar downwind = std::fmod(w.fromDeg + 180.0, 360.0);
            const scalar vx = em.x - rel.x, vy = em.y - rel.y;
            const scalar dist = std::hypot(vx, vy);
            if (dist <= kTol || dist > w.reach + kTol) continue;
            const scalar trueB = std::fmod(planBearing(vx, vy)
                                           + w.planNorthDeg + 360.0, 360.0);
            const scalar off = wrap180(trueB - downwind);
            if (std::fabs(off) > w.halfAngleDeg + 1e-9) continue;
            addFinding("exposedDownwind", em.id, rel.id, dist, w.reach,
                "warning",
                "`" + em.id + "` (" + em.kind + ") lies DOWNWIND of release"
                " source `" + rel.id + "`: " + num(dist) + " m away on a true"
                " bearing of " + num(trueB, 4) + " deg, " + num(std::fabs(off), 3)
                + " deg off the downwind direction " + num(downwind, 4)
                + " deg -- " + what + " (declared sector +/- "
                + num(w.halfAngleDeg, 4) + " deg, reach " + num(w.reach)
                + " m; source: " + w.source + ")");
        }
    }
}

//  ---- the truck routes (C96) ------------------------------------------------

using Pt2 = std::vector<scalar>;   // { plan x, plan y }

//  The arc length along a centre line at which the plan point lies, or -1
//  when it lies on none of its segments.
scalar arcOn(const std::vector<Pt2>& cl, scalar px, scalar py)
{
    scalar s = 0;
    for (std::size_t k = 0; k + 1 < cl.size(); ++k)
    {
        const auto& a = cl[k];
        const auto& b = cl[k + 1];
        if (px >= std::min(a[0], b[0]) - kTol && px <= std::max(a[0], b[0]) + kTol
            && py >= std::min(a[1], b[1]) - kTol && py <= std::max(a[1], b[1]) + kTol)
            return s + std::fabs(px - a[0]) + std::fabs(py - a[1]);
        s += std::fabs(b[0] - a[0]) + std::fabs(b[1] - a[1]);
    }
    return -1.0;
}

//  The centre line driven from arc s0 to arc s1, in either direction: the
//  point at s0, the vertices strictly between, the point at s1.
std::vector<Pt2> driven(const std::vector<Pt2>& cl, scalar s0, scalar s1)
{
    std::vector<scalar> acc{ 0.0 };
    for (std::size_t k = 0; k + 1 < cl.size(); ++k)
        acc.push_back(acc.back() + std::fabs(cl[k + 1][0] - cl[k][0])
                                 + std::fabs(cl[k + 1][1] - cl[k][1]));
    auto at = [&](scalar s)
    {
        for (std::size_t k = 0; k + 1 < cl.size(); ++k)
            if (s <= acc[k + 1] + kTol || k + 2 == cl.size())
            {
                const scalar seg = acc[k + 1] - acc[k];
                const scalar t = seg > 0 ? std::clamp((s - acc[k]) / seg, 0.0, 1.0) : 0.0;
                return Pt2{ cl[k][0] + t * (cl[k + 1][0] - cl[k][0]),
                            cl[k][1] + t * (cl[k + 1][1] - cl[k][1]) };
            }
        return cl.back();
    };
    std::vector<Pt2> out{ at(s0) };
    if (s1 >= s0)
    {
        for (std::size_t k = 0; k < cl.size(); ++k)
            if (acc[k] > s0 + kTol && acc[k] < s1 - kTol) out.push_back(cl[k]);
    }
    else
    {
        for (std::size_t k = cl.size(); k-- > 0;)
            if (acc[k] < s0 - kTol && acc[k] > s1 + kTol) out.push_back(cl[k]);
    }
    out.push_back(at(s1));
    return out;
}

//  Where two centre lines meet: every crossing point, and both ends of a
//  stretch they share.
std::vector<Pt2> meetings(const std::vector<Pt2>& A, const std::vector<Pt2>& B)
{
    std::vector<Pt2> out;
    for (std::size_t s = 0; s + 1 < A.size(); ++s)
        for (std::size_t t = 0; t + 1 < B.size(); ++t)
        {
            const scalar x0 = std::max(std::min(A[s][0], A[s + 1][0]),
                                       std::min(B[t][0], B[t + 1][0]));
            const scalar x1 = std::min(std::max(A[s][0], A[s + 1][0]),
                                       std::max(B[t][0], B[t + 1][0]));
            const scalar y0 = std::max(std::min(A[s][1], A[s + 1][1]),
                                       std::min(B[t][1], B[t + 1][1]));
            const scalar y1 = std::min(std::max(A[s][1], A[s + 1][1]),
                                       std::max(B[t][1], B[t + 1][1]));
            if (x1 < x0 - kTol || y1 < y0 - kTol) continue;
            out.push_back({ x0, y0 });
            if (x1 - x0 > kTol || y1 - y0 > kTol) out.push_back({ x1, y1 });
        }
    return out;
}

//  An axis-aligned segment meets an item's plan rectangle (or disc).
bool segmentMeets(const Pt2& a, const Pt2& b, const LayoutItem& it)
{
    const scalar cx = std::clamp(it.x, std::min(a[0], b[0]), std::max(a[0], b[0]));
    const scalar cy = std::clamp(it.y, std::min(a[1], b[1]), std::max(a[1], b[1]));
    return pointToFootprint(cx, cy, it) <= kTol;
}

const char* const kRouteRule =
    "a truck route is driven along its declared roads in order, from the"
    " fence opening of its `from` gate (or that gate's point on its road, with"
    " no fence) to the opening of its `to` gate, turning from one road onto"
    " the next where their centre lines meet (the meeting nearest along the"
    " road being driven; a road named twice in a row is driven to its far end"
    " and back); a 180 deg turn is a REVERSAL and needs a declared"
    " turning area at least the design vehicle's turning diameter across; a"
    " 90 deg corner takes the smaller of the two roads' declared corner"
    " radii, and the outer edge of the pavement there (that radius plus half"
    " the narrower road) must reach half the turning diameter; two corners"
    " closer than the sum of their radii cannot both be made";

void checkTruckRoutes(PlantLayoutRecord& rec, const FindingSink& addFinding)
{
    LayoutRoads& R = rec.roads;
    if (R.truckRoutes.empty()) return;
    std::map<std::string, std::size_t> roadIx;
    for (std::size_t i = 0; i < R.roads.size(); ++i) roadIx[R.roads[i].id] = i;
    auto itemOf = [&](const std::string& id) -> const LayoutItem*
    {
        for (const auto& i : rec.items) if (i.id == id) return &i;
        return nullptr;
    };
    auto accessOf = [&](const std::string& id) -> const LayoutAccess*
    {
        for (const auto& a : R.access) if (a.item == id) return &a;
        return nullptr;
    };
    auto openingOf = [&](const std::string& gate) -> const LayoutFenceOpening*
    {
        if (!rec.fence.present) return nullptr;
        for (const auto& o : rec.fence.openings)
            if (o.gate == gate && !o.road.empty()) return &o;
        return nullptr;
    };
    const scalar need = 0.5 * R.designVehicle.turningDiameter;
    R.designVehicle.routeRule = kRouteRule;

    for (auto& T : R.truckRoutes)
    {
        const std::string wr = "truck route `" + T.id + "`";
        std::size_t before = rec.findings.size();
        for (const auto& name : { T.from, T.to })
            if (!itemOf(name))
                refuse(wr + ": `" + name + "` is no placed item -- a route runs"
                       " from a gate and back to a gate");
        for (const auto& name : T.serves)
            if (!itemOf(name))
                refuse(wr + ": `serves` names `" + name + "`, which is no placed"
                       " item");

        //  ---- the ends: an opening's approach, or the gate's road point ---
        std::vector<Pt2> pts;
        std::vector<int> segRoad;
        std::vector<bool> segApproach;
        auto push = [&](const Pt2& q, int road, bool approach)
        {
            if (!pts.empty() && std::fabs(pts.back()[0] - q[0]) < kTol
                && std::fabs(pts.back()[1] - q[1]) < kTol) return;
            if (!pts.empty()) { segRoad.push_back(road); segApproach.push_back(approach); }
            pts.push_back(q);
        };
        auto endOn = [&](const std::string& name, std::size_t road, bool start,
                         Pt2& onRoad, const LayoutFenceOpening*& op)
        {
            op = nullptr;
            const auto* o = openingOf(name);
            if (o && o->road == R.roads[road].id)
            {
                op = o;
                onRoad = { o->approachX, o->approachY };
                return;
            }
            const auto* a = accessOf(name);
            if (!a || a->road != R.roads[road].id)
                refuse(wr + ": it " + (start ? "starts" : "ends") + " at `" + name
                       + "`, whose road is " + (a && !a->road.empty()
                           ? "`" + a->road + "`" : std::string("none"))
                       + ", and its " + (start ? "first" : "last") + " road is `"
                       + R.roads[road].id + "` -- a route " + (start ? "leaves"
                       : "reaches") + " an item by the road that serves it");
            onRoad = { a->x, a->y };
        };
        const std::size_t r0 = roadIx.at(T.roads.front());
        const std::size_t rn = roadIx.at(T.roads.back());
        Pt2 P, E;
        const LayoutFenceOpening* opIn = nullptr;
        const LayoutFenceOpening* opOut = nullptr;
        endOn(T.from, r0, true, P, opIn);
        endOn(T.to, rn, false, E, opOut);
        if (opIn) push({ opIn->x, opIn->y }, int(r0), true);
        push(P, int(r0), true);
        for (std::size_t k = 0; k < T.roads.size(); ++k)
        {
            const std::size_t ri = roadIx.at(T.roads[k]);
            const auto& cl = R.roads[ri].centreline;
            const scalar s0 = arcOn(cl, P[0], P[1]);
            if (s0 < 0)
                refuse(wr + ": the point (" + num(P[0]) + ", " + num(P[1])
                       + ") m it has reached does not lie on road `"
                       + T.roads[k] + "`");
            Pt2 target = E;
            if (k + 1 < T.roads.size() && T.roads[k + 1] == T.roads[k])
            {
                //  A road named twice in a row is driven to its FAR end and
                //  back: a dead end, visited -- the turn there is a reversal.
                const scalar total = arcOn(cl, cl.back()[0], cl.back()[1]);
                target = (s0 > 0.5 * total) ? cl.front() : cl.back();
            }
            else if (k + 1 < T.roads.size())
            {
                const auto cands = meetings(cl, R.roads[roadIx.at(T.roads[k + 1])].centreline);
                if (cands.empty())
                    refuse(wr + ": roads `" + T.roads[k] + "` and `" + T.roads[k + 1]
                           + "` do not meet -- a route drives from one road onto"
                             " the next where their centre lines meet");
                scalar best = 1e300;
                for (const auto& c : cands)
                {
                    const scalar s = arcOn(cl, c[0], c[1]);
                    if (s >= 0 && std::fabs(s - s0) < best - kTol)
                    { best = std::fabs(s - s0); target = c; }
                }
            }
            const scalar s1 = arcOn(cl, target[0], target[1]);
            if (s1 < 0)
                refuse(wr + ": its end (" + num(target[0]) + ", " + num(target[1])
                       + ") m does not lie on road `" + T.roads[k] + "`");
            for (const auto& q : driven(cl, s0, s1)) push(q, int(ri), false);
            P = target;
        }
        if (opOut) push({ opOut->x, opOut->y }, int(rn), true);
        T.path = pts;

        //  ---- the length, the corners and the reversals ------------------
        std::vector<scalar> sAt{ 0.0 };
        for (std::size_t i = 0; i + 1 < pts.size(); ++i)
            sAt.push_back(sAt.back() + std::hypot(pts[i + 1][0] - pts[i][0],
                                                  pts[i + 1][1] - pts[i][1]));
        T.length = sAt.back();
        struct CornerAt { std::size_t k; scalar s, r; };
        std::vector<CornerAt> turns;
        for (std::size_t i = 1; i + 1 < pts.size(); ++i)
        {
            const scalar ax = pts[i][0] - pts[i - 1][0], ay = pts[i][1] - pts[i - 1][1];
            const scalar bx = pts[i + 1][0] - pts[i][0], by = pts[i + 1][1] - pts[i][1];
            const scalar la = std::hypot(ax, ay), lb = std::hypot(bx, by);
            const scalar dot = (ax * bx + ay * by) / (la * lb);
            if (dot > 0.5) continue;                     // straight on
            const auto& rin  = R.roads[std::size_t(segRoad[i - 1])];
            const auto& rout = R.roads[std::size_t(segRoad[i])];
            LayoutRouteCorner c;
            c.x = pts[i][0]; c.y = pts[i][1];
            c.inRoad = rin.id; c.outRoad = rout.id;
            c.required = need;
            const std::string where = "(" + num(c.x) + ", " + num(c.y) + ") m";
            if (dot < -0.5)
            {
                c.turn = "reverse";
                ++T.reversals;
                const LayoutTurningArea* area = nullptr;
                for (const auto& ta : R.turningAreas)
                    if (std::hypot(ta.x - c.x, ta.y - c.y) <= 0.5 * ta.diameter + kTol)
                        if (!area || ta.diameter > area->diameter) area = &ta;
                const std::string k = std::to_string(T.corners.size());
                if (!area)
                {
                    c.ok = false;
                    addFinding("routeReverses", T.id, k, 0.0,
                        R.designVehicle.turningDiameter, "warning",
                        wr + " turns back on itself at " + where + " on road `"
                        + rin.id + "`, and no declared turning area holds that"
                        " point: the truck must REVERSE there (a turning circle"
                        " of at least the design vehicle's " + num(2.0 * need)
                        + " m, a loop, or a road that runs on removes the"
                          " manoeuvre)");
                }
                else
                {
                    c.turningArea = area->id;
                    c.radius = 0.5 * area->diameter;
                    c.outerRadius = c.radius;
                    if (area->diameter < 2.0 * need - kTol)
                    {
                        c.ok = false;
                        addFinding("turningAreaTooSmall", T.id, k, area->diameter,
                            2.0 * need, "warning",
                            wr + " turns round in turning area `" + area->id
                            + "` at " + where + ", " + num(area->diameter)
                            + " m across, smaller than the design vehicle's "
                            + num(2.0 * need) + " m turning circle (source: "
                            + R.designVehicle.source + "): the truck must"
                              " shunt to turn there");
                    }
                }
                T.corners.push_back(c);
                continue;
            }
            c.turn = (ax * by - ay * bx) > 0 ? "left" : "right";
            c.radius = std::min(rin.cornerRadius, rout.cornerRadius);
            c.outerRadius = c.radius + 0.5 * std::min(rin.width, rout.width);
            const std::string k = std::to_string(T.corners.size());
            if (c.outerRadius < need - kTol)
            {
                c.ok = false;
                addFinding("sharpCorner", T.id, k, c.outerRadius, need, "warning",
                    wr + " turns " + c.turn + " from road `" + rin.id + "` onto `"
                    + rout.id + "` at " + where + " on a corner of centre-line"
                    " radius " + num(c.radius) + " m" + ((rin.cornerRadiusDeclared
                        && rout.cornerRadiusDeclared) ? std::string("")
                        : std::string(" (no `cornerRadius` declared on ")
                          + (rin.cornerRadiusDeclared ? "`" + rout.id + "`"
                             : "`" + rin.id + "`") + ": a square corner)")
                    + ": the pavement's outer edge there is " + num(c.outerRadius)
                    + " m from the corner's centre, short of the " + num(need)
                    + " m outer radius the design vehicle turns on (source: "
                    + R.designVehicle.source + ") -- the truck runs over the"
                      " kerb or shunts");
            }
            turns.push_back({ T.corners.size(), sAt[i], c.radius });
            T.corners.push_back(c);
        }
        for (std::size_t q = 0; q + 1 < turns.size(); ++q)
        {
            const scalar gap = turns[q + 1].s - turns[q].s;
            const scalar want = turns[q].r + turns[q + 1].r;
            if (gap >= want - kTol) continue;
            const auto& c0 = T.corners[turns[q].k];
            const auto& c1 = T.corners[turns[q + 1].k];
            addFinding("cornersTooClose", T.id, std::to_string(turns[q].k), gap,
                want, "warning",
                wr + ": its corners at (" + num(c0.x) + ", " + num(c0.y)
                + ") m and (" + num(c1.x) + ", " + num(c1.y) + ") m are "
                + num(gap) + " m apart, less than the " + num(want) + " m their"
                " two radii take (" + num(turns[q].r) + " + " + num(turns[q + 1].r)
                + " m): a truck cannot finish one turn before it must start the"
                  " next");
        }

        //  ---- a one-way road driven backwards ----------------------------
        std::set<std::string> told;
        for (std::size_t i = 0; i + 1 < pts.size(); ++i)
        {
            if (segApproach[i]) continue;
            const auto& rd = R.roads[std::size_t(segRoad[i])];
            if (!rd.oneWay || told.count(rd.id)) continue;
            const scalar a = arcOn(rd.centreline, pts[i][0], pts[i][1]);
            const scalar b = arcOn(rd.centreline, pts[i + 1][0], pts[i + 1][1]);
            if (b >= a - kTol) continue;
            told.insert(rd.id);
            addFinding("wrongWay", T.id, rd.id, 0.0, 0.0, "warning",
                wr + " drives road `" + rd.id + "` AGAINST its one-way"
                " direction (the order of its waypoints) between (" + num(pts[i][0])
                + ", " + num(pts[i][1]) + ") m and (" + num(pts[i + 1][0]) + ", "
                + num(pts[i + 1][1]) + ") m");
        }

        //  ---- the weighbridge --------------------------------------------
        bool anyBridge = false;
        for (const auto& it : rec.items)
        {
            if (!(it.nonProcess && it.kind == kWeighbridgeKind)) continue;
            anyBridge = true;
            for (std::size_t i = 0; i + 1 < pts.size() && T.weighbridge.empty(); ++i)
                if (segmentMeets(pts[i], pts[i + 1], it)) T.weighbridge = it.id;
        }
        if (anyBridge && T.weighbridge.empty())
            addFinding("routeMissesWeighbridge", T.id, "", 0.0, 0.0, "warning",
                wr + " drives over no weighbridge, and the case places one: a"
                " truck on it is never weighed -- route it over the deck");

        //  ---- the stops it serves ----------------------------------------
        for (const auto& name : T.serves)
        {
            const auto* a = accessOf(name);
            bool on = false;
            if (a && !a->road.empty())
                for (std::size_t i = 0; i + 1 < pts.size() && !on; ++i)
                {
                    const LayoutItem pt = planBox(a->x, a->x, a->y, a->y);
                    on = segmentMeets(pts[i], pts[i + 1], pt);
                }
            if (!on)
                addFinding("routeMissesStop", T.id, name, 0.0, 0.0, "warning",
                    wr + " does not pass `" + name + "`, a stop it declares it"
                    " serves: " + (a && !a->road.empty()
                        ? "its point on road `" + a->road + "` ("
                          + num(a->x) + ", " + num(a->y) + ") m is on none of the"
                            " roads the route drives there"
                        : std::string("no road a gate reaches serves it")));
        }

        //  ---- leaving by a gate --------------------------------------------
        std::set<std::string> notGate;
        for (const auto& name : { T.from, T.to })
        {
            const auto* it = itemOf(name);
            if (it->nonProcess && it->kind == kGateKind) continue;
            if (!notGate.insert(name).second) continue;
            addFinding("routeNoGate", T.id, name, 0.0, 0.0, "warning",
                wr + (name == T.to ? " ends" : " starts") + " at `" + name + "` ("
                + it->kind + "), which is not a gate: a truck there "
                + (name == T.to ? "has not left the site, and must turn and find"
                                  " a way out the route does not show"
                                : "came in by no gate the route shows"));
        }
        T.verdict = rec.findings.size() == before ? "clear" : "announced";
    }
}

//  ---- secondary containment (DEV.md 4c C134) -----------------------------
//
//  A BUND or an IMPOUNDING AREA is a DECLARED REGION round the items it
//  encloses, not a placed item: the overlap rule does not apply to it.  The
//  rule, all of it in this section and published as one sentence:
//    * every listed item stands INSIDE the region (its footprint within the
//      wall), every placed item inside the region is LISTED, and no wall runs
//      through a footprint -- a wall that cannot be built is REFUSED;
//    * a BUND holds its area x its wall height, less the volume each enclosed
//      footprint occupies below the wall's top (the floor at grade);
//    * an IMPOUNDING AREA is a kerbed catch area sloped to a REMOTE pit, and
//      holds the pit's volume (length x width x depth, open, below grade);
//    * the REQUIRED volume is the largest of the case's declared terms (a
//      fraction of the largest, or of the total, volume the enclosed items
//      that hold LIQUID count on the declared basis) plus its allowances (a
//      volume, or a depth over the catch area: rain);
//    * short of it is ANNOUNCED (a containment the student must defend);
//      every placed item in the open that holds liquid and that no
//      containment encloses is ANNOUNCED; so are a road or a pipe through a
//      wall (a pipe below the wall's top), an open drain to the sewer, and a
//      pit that is not remote.  No standard's table is shipped: every number
//      is the case's, with its source.

const char* const kBundRule =
    "a bund holds its area x its wall height less the volume each enclosed"
    " footprint occupies below the wall's top (a vertical cylinder's disc, a"
    " lying cylinder's circular segment, any other item's rectangle, the floor"
    " at grade); an impounding area holds its remote pit's volume (length x"
    " width x depth); the required volume is the largest of the case's"
    " declared terms -- a fraction of the largest, or of the total, volume the"
    " enclosed items that hold liquid count on the declared basis (vesselVolume:"
    " the item's sized V_R; heldLiquid: the liquid its inventory holds) -- plus"
    " the declared allowances (a volume, or a depth over the catch area and"
    " the pit)";

using P2 = std::pair<scalar, scalar>;

//  Twice the signed area (counter-clockwise positive).
scalar shoelace(const std::vector<P2>& p)
{
    scalar a = 0;
    for (std::size_t i = 0; i < p.size(); ++i)
    {
        const auto& u = p[i];
        const auto& v = p[(i + 1) % p.size()];
        a += u.first * v.second - v.first * u.second;
    }
    return a;
}

scalar pointSegDist(scalar px, scalar py, const P2& a, const P2& b)
{
    const scalar vx = b.first - a.first, vy = b.second - a.second;
    const scalar L2 = vx * vx + vy * vy;
    scalar t = L2 > 0 ? ((px - a.first) * vx + (py - a.second) * vy) / L2 : 0.0;
    t = std::max(0.0, std::min(1.0, t));
    return std::hypot(px - (a.first + t * vx), py - (a.second + t * vy));
}

scalar distToOutline(scalar px, scalar py, const std::vector<P2>& p)
{
    scalar d = 1e300;
    for (std::size_t i = 0; i < p.size(); ++i)
        d = std::min(d, pointSegDist(px, py, p[i], p[(i + 1) % p.size()]));
    return d;
}

//  Strictly inside (ray casting); a point on the outline is not.
bool strictlyInside(scalar px, scalar py, const std::vector<P2>& p)
{
    if (distToOutline(px, py, p) <= kTol) return false;
    bool in = false;
    for (std::size_t i = 0, j = p.size() - 1; i < p.size(); j = i++)
    {
        const auto& a = p[i];
        const auto& b = p[j];
        if ((a.second > py) != (b.second > py)
            && px < (b.first - a.first) * (py - a.second) / (b.second - a.second)
                    + a.first)
            in = !in;
    }
    return in;
}

//  Two segments cross at a point interior to both (touching and collinear
//  overlaps are not a crossing).
bool segmentsCross(const P2& a, const P2& b, const P2& c, const P2& d)
{
    auto orient = [](const P2& p, const P2& q, const P2& r)
    {
        return (q.first - p.first) * (r.second - p.second)
             - (q.second - p.second) * (r.first - p.first);
    };
    const scalar o1 = orient(a, b, c), o2 = orient(a, b, d);
    const scalar o3 = orient(c, d, a), o4 = orient(c, d, b);
    const scalar e = kTol * (1.0 + std::hypot(b.first - a.first, b.second - a.second)
                                 + std::hypot(d.first - c.first, d.second - c.second));
    return ((o1 > e && o2 < -e) || (o1 < -e && o2 > e))
        && ((o3 > e && o4 < -e) || (o3 < -e && o4 > e));
}

//  A segment passes through the OPEN rectangle (Liang-Barsky on the rectangle
//  shrunk by the tolerance).
bool segmentThroughRect(const P2& a, const P2& b, scalar x0, scalar x1,
                        scalar y0, scalar y1)
{
    x0 += kTol; x1 -= kTol; y0 += kTol; y1 -= kTol;
    if (x1 <= x0 || y1 <= y0) return false;
    scalar t0 = 0, t1 = 1;
    const scalar dx = b.first - a.first, dy = b.second - a.second;
    const scalar p[4] = { -dx, dx, -dy, dy };
    const scalar q[4] = { a.first - x0, x1 - a.first, a.second - y0, y1 - a.second };
    for (int k = 0; k < 4; ++k)
    {
        if (std::fabs(p[k]) < 1e-15) { if (q[k] < 0) return false; continue; }
        const scalar t = q[k] / p[k];
        if (p[k] < 0) t0 = std::max(t0, t);
        else          t1 = std::min(t1, t);
        if (t0 > t1) return false;
    }
    return t1 - t0 > 1e-12;
}

//  Where an item's footprint stands against the outline: 1 inside (the wall
//  round it), -1 outside, 0 across the wall.
int footprintSide(const LayoutItem& i, const std::vector<P2>& p)
{
    if (isCircle(i))
    {
        const scalar r = 0.5 * i.dx;
        if (distToOutline(i.x, i.y, p) < r - kTol) return 0;
        return strictlyInside(i.x, i.y, p) ? 1 : -1;
    }
    const scalar x0 = i.x - 0.5 * i.dx, x1 = i.x + 0.5 * i.dx;
    const scalar y0 = i.y - 0.5 * i.dy, y1 = i.y + 0.5 * i.dy;
    for (std::size_t k = 0; k < p.size(); ++k)
        if (segmentThroughRect(p[k], p[(k + 1) % p.size()], x0, x1, y0, y1))
            return 0;
    //  No wall runs through the box: it is wholly on one side, and its
    //  centre says which.
    if (strictlyInside(i.x, i.y, p)) return 1;
    return distToOutline(i.x, i.y, p) <= kTol ? 0 : -1;
}

//  The volume an item occupies between grade and the wall's top `h`.
//
//  THE ARITHMETIC IS `bundMath`'s (BundArithmetic.H), extracted verbatim on
//  2026-10-25 (DEV.md 4c C136): a standing cylinder's disc times the part
//  of its height below the level, a lying cylinder's circular segment times
//  its length, a box.  It is the ONE home the secondary-containment
//  EduTool's TypeScript (gui/src/ui/methods/bund.ts) is held to by
//  bin/curate/check_bund_arithmetic.py, which also refuses a copy of it
//  here.  An item occupies its envelope from its declared base `z` up, so
//  the space beneath a raised item is free (a lying drum on saddles), and
//  a solid plinth belongs in the item's declared height.  The page teaches
//  more than this (a sloped floor, a freeboard, the useful capacity), and
//  says so beside each number.  (This comment is long on purpose: it keeps
//  every line below it where the EduTools cite it by file and line.)
scalar displacedBelow(const LayoutItem& i, scalar h)
{
    if (isCircle(i)) return bundMath::displacedStanding(i.dx, i.z, i.dz, h);
    if (i.shape == "cylinder")
        return bundMath::displacedLying(i.dz,
            i.orientation == "alongX" ? i.dx : i.dy, i.z, h);
    return bundMath::displacedBox(i.dx, i.dy, i.z, i.dz, h);
}

//  The liquid an item holds by its sizing's inventory [m3]: the sum of its
//  liquid phases' V x fraction.  0 when it holds none, or declares none.
scalar heldLiquidOf(const SimulationResult& r, const std::string& id)
{
    const auto s = r.sizings.find(id);
    if (s == r.sizings.end()) return 0.0;
    scalar v = 0;
    for (const auto& h : s->second.inventory.phases)
        if (h.phase == "liquid") v += h.volume;
    return v;
}

std::vector<P2> outlineOf(const LayoutBund& b)
{
    std::vector<P2> p;
    for (const auto& q : b.outline) p.emplace_back(q[0], q[1]);
    return p;
}

const LayoutItem& placedItem(const PlantLayoutRecord& rec, const std::string& id)
{
    return *std::find_if(rec.items.begin(), rec.items.end(),
        [&](const LayoutItem& q) { return q.id == id; });
}

void readBunds(const Dictionary& d, const SimulationResult& r,
               PlantLayoutRecord& rec, const FindingSink& addFinding)
{
    rec.bundRule = kBundRule;
    std::set<std::string> names;
    std::map<std::string, std::string> bundOf;   // item -> its containment
    std::size_t n = 0;
    for (const auto& e : d.lookupDictList("bunds"))
    {
        ++n;
        LayoutBund b;
        if (!e->found("name"))
            refuse("bunds entry " + std::to_string(n) + ": `name \"<name>\";` is"
                   " not declared");
        b.id = e->lookupWord("name");
        const std::string w = "bund `" + b.id + "`";
        if (!names.insert(b.id).second)
            refuse(w + " is declared twice -- one name, one containment");
        if (!e->found("kind"))
            refuse(w + ": `kind` is not declared -- `bund` (a wall round the"
                   " items: the spill is held where it falls) or `impounding` (a"
                   " kerbed catch area sloped to a remote pit: the spill is led"
                   " AWAY from the items), and the case says which and why");
        b.kind = e->lookupWord("kind");
        if (b.kind != "bund" && b.kind != "impounding")
            refuse(w + ": " + registryRefusal::message("containment kind",
                   b.kind, { "bund", "impounding" }, "Accepted"));
        b.source = text(*e, "source", w);
        b.reason = text(*e, "reason", w);

        //  ---- the region: a rectangle or a polygon, exactly one -------------
        const bool rect = e->found("region"), poly = e->found("polygon");
        if (rect == poly)
            refuse(w + ": declare exactly one of `region { xMin; xMax; yMin;"
                   " yMax; }` (a rectangular wall) or `polygon ( { x; y; } ...);`"
                   " (the wall's plan outline, corner by corner)");
        std::vector<P2> p;
        if (rect)
        {
            const auto rd = e->subDict("region");
            const std::string wr = w + " region";
            const scalar x0 = length(*rd, "xMin", wr), x1 = length(*rd, "xMax", wr);
            const scalar y0 = length(*rd, "yMin", wr), y1 = length(*rd, "yMax", wr);
            if (x1 <= x0 || y1 <= y0)
                refuse(wr + ": a region needs xMin < xMax and yMin < yMax");
            p = { { x0, y0 }, { x1, y0 }, { x1, y1 }, { x0, y1 } };
            b.regionFrom = "rectangle";
        }
        else
        {
            std::size_t k = 0;
            for (const auto& v : e->lookupDictList("polygon"))
            {
                ++k;
                const std::string wv = w + " polygon corner " + std::to_string(k);
                if (v->found("z"))
                    refuse(wv + ": a corner is a plan point -- the wall stands on"
                           " grade and its height is `wall { height; }`; delete `z`");
                p.emplace_back(length(*v, "x", wv), length(*v, "y", wv));
            }
            if (p.size() < 3)
                refuse(w + ": a polygon needs at least three corners");
            for (std::size_t i = 0; i < p.size(); ++i)
                for (std::size_t j = i + 1; j < p.size(); ++j)
                {
                    const bool adjacent = j == i + 1
                                       || (i == 0 && j == p.size() - 1);
                    if (adjacent) continue;
                    if (segmentsCross(p[i], p[(i + 1) % p.size()],
                                      p[j], p[(j + 1) % p.size()]))
                        refuse(w + ": the polygon's sides " + std::to_string(i + 1)
                               + " and " + std::to_string(j + 1) + " cross --"
                               " a wall's outline must not cross itself");
                }
            b.regionFrom = "polygon";
        }
        b.area = 0.5 * std::fabs(shoelace(p));
        if (b.area <= kTol)
            refuse(w + ": the region encloses no area");
        for (const auto& q : p) b.outline.push_back({ q.first, q.second });

        //  ---- the wall (a bund's wall, an impounding area's kerb) ----------
        if (!e->found("wall"))
            refuse(w + ": `wall { height <m>; }` is not declared -- "
                   + (b.kind == "bund"
                      ? std::string("a bund's wall height is half of what it holds")
                      : std::string("the kerb round the catch area keeps the spill"
                                    " running to the pit")));
        b.wallHeight = length(*e->subDict("wall"), "height", w + " wall");
        if (b.wallHeight <= 0)
            refuse(w + ": the wall `height` must be positive");

        //  ---- the pit (an impounding area's own, a bund's never) -----------
        if (b.kind == "impounding")
        {
            if (!e->found("pit"))
                refuse(w + ": an impounding area leads the spill to a REMOTE pit"
                       " -- declare it, `pit { x <m>; y <m>; length <m>; width"
                       " <m>; depth <m>; }` (length along plan x, width along"
                       " plan y, open and below grade)");
            const auto pd = e->subDict("pit");
            const std::string wp = w + " pit";
            b.hasPit    = true;
            b.pitX      = length(*pd, "x", wp);
            b.pitY      = length(*pd, "y", wp);
            b.pitLength = length(*pd, "length", wp);
            b.pitWidth  = length(*pd, "width", wp);
            b.pitDepth  = length(*pd, "depth", wp);
            if (b.pitLength <= 0 || b.pitWidth <= 0 || b.pitDepth <= 0)
                refuse(wp + ": `length`, `width` and `depth` must be positive");
        }
        else if (e->found("pit"))
            refuse(w + ": a `pit` is an impounding area's; a bund holds the"
                   " spill inside its own wall.  Declare `kind impounding;` or"
                   " delete the pit");

        //  ---- the drain ------------------------------------------------------
        if (!e->found("drain"))
            refuse(w + ": `drain` is not declared -- how rainwater leaves the "
                   + (b.kind == "bund" ? std::string("bund") : std::string("pit"))
                   + ": closedValve (opened by hand once the water is seen to be"
                     " clean), sumpPump, or openToSewer");
        b.drain = e->lookupWord("drain");
        if (b.drain != "closedValve" && b.drain != "sumpPump"
            && b.drain != "openToSewer")
            refuse(w + ": " + registryRefusal::message("drain", b.drain,
                   { "closedValve", "sumpPump", "openToSewer" }, "Accepted"));

        //  ---- the items -----------------------------------------------------
        if (!e->found("items"))
            refuse(w + ": `items ( ... );` is not declared -- a containment is"
                   " declared round the items it holds");
        b.items = e->lookupWordList("items");
        if (b.items.empty())
            refuse(w + ": `items` is empty");
        std::set<std::string> listed;
        //  A listed item whose SIZER refused is left unplaced and announced
        //  (`sizingRefused`, DEV.md 4c C79): the run goes on, so the
        //  containment that lists it must not refuse the run either.  Its
        //  wall is still the case's declaration and is published; what it
        //  must HOLD cannot be known without that item's size, so its
        //  capacity is NOT CHECKED, said by name -- no volume is invented.
        std::vector<std::string> unsized;
        for (const auto& id : b.items)
        {
            if (!listed.insert(id).second)
                refuse(w + ": `" + id + "` is listed twice");
            const auto it = std::find_if(rec.items.begin(), rec.items.end(),
                [&](const LayoutItem& i) { return i.id == id; });
            const bool sizerRefused = std::any_of(rec.findings.begin(),
                rec.findings.end(), [&](const LayoutFinding& f)
                { return f.kind == "sizingRefused" && f.a == id; });
            if (it == rec.items.end() && sizerRefused)
            {
                unsized.push_back(id);
                bundOf[id] = b.id;
                continue;
            }
            if (it == rec.items.end())
            {
                std::ostringstream o;
                o << w << " lists `" << id << "`, which is not placed on this"
                     " plot plan.  Placed items:";
                for (const auto& i : rec.items) o << " " << i.id;
                refuse(o.str());
            }
            if (!it->room.empty())
                refuse(w + " lists `" + id + "`, which stands in room `" + it->room
                       + "` of the declared building: indoors the ROOM holds a"
                         " spill (its floor, its drains, its sills), and the"
                         " site's containment is for items in the open");
            const auto prev = bundOf.find(id);
            if (prev != bundOf.end())
                refuse(w + " lists `" + id + "`, which bund `" + prev->second
                       + "` already holds -- one item, one containment");
            bundOf[id] = b.id;
        }

        //  ---- every listed item inside, every item inside listed ---------
        for (const auto& i : rec.items)
        {
            const int side = footprintSide(i, p);
            const bool isListed = listed.count(i.id) > 0;
            if (side == 0)
                refuse(w + ": its wall runs THROUGH the footprint of `" + i.id
                       + "` -- a wall cannot be built through an item.  Move the"
                         " wall round it, or the item clear of it");
            if (isListed && side < 0)
                refuse(w + " lists `" + i.id + "`, and `" + i.id + "` stands"
                       " OUTSIDE its wall (its footprint centred at x " + num(i.x)
                       + ", y " + num(i.y) + " m) -- a containment holds only"
                         " what stands inside it.  Move the wall or the item, or"
                         " take it off the list");
            if (!isListed && side > 0)
                refuse(w + ": `" + i.id + "` stands INSIDE its wall and is not"
                       " in its `items` -- what stands in a basin takes up its"
                       " volume, so the list says everything that is there."
                       "  Add it, or move it out");
        }

        //  ---- what the containment holds --------------------------------
        if (b.kind == "bund")
        {
            b.grossVolume = bundMath::grossVolume(b.area, b.wallHeight);
            for (const auto& id : b.items)
                if (std::find(unsized.begin(), unsized.end(), id) == unsized.end())
                    b.displacedVolume += displacedBelow(placedItem(rec, id), b.wallHeight);
            b.netVolume = b.grossVolume - b.displacedVolume;
        }
        else
        {
            b.grossVolume = b.pitLength * b.pitWidth * b.pitDepth;
            b.netVolume   = b.grossVolume;
        }

        //  ---- the rule: the case's own ------------------------------------
        if (!e->found("capacityRule"))
            refuse(w + ": `capacityRule { basis vesselVolume|heldLiquid; terms ("
                   " { fraction <->; of largest|total; } ... ); [allowances ("
                   " { name; volume <m3>; | depth <m>; reason; } ... );] source"
                   " \"...\"; reason \"...\"; }` is not declared -- how much a"
                   " containment must hold is the case's to state, with the"
                   " guideline or code it reads it from.  No standard's table is"
                   " shipped");
        const auto cr = e->subDict("capacityRule");
        const std::string wc = w + " capacityRule";
        b.ruleSource = text(*cr, "source", wc);
        b.ruleReason = text(*cr, "reason", wc);
        if (!cr->found("basis"))
            refuse(wc + ": `basis` is not declared -- `vesselVolume` (each item's"
                   " sized volume, V_R: what spills if it is full) or `heldLiquid`"
                   " (the liquid its inventory holds at its working level)");
        b.basis = cr->lookupWord("basis");
        if (b.basis != "vesselVolume" && b.basis != "heldLiquid")
            refuse(wc + ": " + registryRefusal::message("basis", b.basis,
                   { "vesselVolume", "heldLiquid" }, "Accepted"));
        if (!cr->found("terms"))
            refuse(wc + ": `terms ( { fraction <->; of largest|total; } ... );` is"
                   " not declared (the largest of them governs)");
        for (const auto& t : cr->lookupDictList("terms"))
        {
            LayoutBundTerm term;
            if (!t->found("fraction") || !t->found("of"))
                refuse(wc + ": a term declares `fraction` and `of`");
            term.fraction = t->lookupScalar("fraction", Dims::dimensionless);
            term.of = t->lookupWord("of");
            if (term.of != "largest" && term.of != "total")
                refuse(wc + ": " + registryRefusal::message("term `of`", term.of,
                       { "largest", "total" }, "Accepted"));
            if (term.fraction <= 0)
                refuse(wc + ": a term's `fraction` must be positive");
            b.terms.push_back(term);
        }
        if (b.terms.empty())
            refuse(wc + ": `terms` is empty");
        if (cr->found("allowances"))
            for (const auto& a : cr->lookupDictList("allowances"))
            {
                LayoutBundAllowance al;
                if (!a->found("name"))
                    refuse(wc + ": an allowance declares its `name`");
                al.name = a->lookupWord("name");
                const std::string wa = wc + " allowance `" + al.name + "`";
                al.reason = text(*a, "reason", wa);
                const bool vol = a->found("volume"), dep = a->found("depth");
                if (vol == dep)
                    refuse(wa + ": declare exactly one of `volume <m3>;` or"
                           " `depth <m>;` (a depth over the catch area, e.g. a"
                           " design rainfall)");
                if (vol)
                {
                    al.from   = "volume";
                    al.volume = a->lookupScalar("volume", Dims::volume);
                }
                else
                {
                    al.from  = "depth";
                    al.depth = length(*a, "depth", wa);
                    //  Rain falls on the catch area, and on an impounding
                    //  area's open pit too.
                    al.volume = bundMath::depthAllowance(al.depth, b.area
                                + (b.hasPit ? b.pitLength * b.pitWidth : 0.0));
                }
                if (al.volume < 0)
                    refuse(wa + ": an allowance cannot be negative");
                b.allowances.push_back(al);
            }

        //  ---- the enclosed items that hold liquid ------------------------
        for (const auto& id : b.items)
        {
            if (std::find(unsized.begin(), unsized.end(), id) != unsized.end())
                continue;
            const scalar liquid = heldLiquidOf(r, id);
            if (liquid <= 0) continue;
            LayoutBundHeld h;
            h.item = id;
            if (b.basis == "heldLiquid")
                h.volume = liquid;
            else
            {
                const auto s = r.sizings.find(id);
                if (s == r.sizings.end() || !s->second.values.count("V_R"))
                    refuse(wc + ": `basis vesselVolume;`, and `" + id + "` holds"
                           " liquid but its sizer publishes no volume (V_R) -- use"
                           " `basis heldLiquid;`");
                h.volume = s->second.values.at("V_R");
            }
            if (b.kind == "bund")
                h.displaced = displacedBelow(placedItem(rec, id), b.wallHeight);
            b.largestHeld = std::max(b.largestHeld, h.volume);
            b.totalHeld  += h.volume;
            b.held.push_back(h);
        }
        scalar governingVolume = -1;
        for (auto& t : b.terms)
        {
            t.volume = bundMath::termVolume(t.fraction, t.of == "largest", b.largestHeld, b.totalHeld);
            if (t.volume > governingVolume)
            {
                governingVolume = t.volume;
                b.governing = t.of;
            }
        }
        scalar allow = 0;
        for (const auto& a : b.allowances) allow += a.volume;
        b.requiredVolume = bundMath::requiredVolume(governingVolume, allow);

        if (!unsized.empty())
        {
            b.verdict = "notChecked";
            std::string names;
            for (const auto& u : unsized) names += (names.empty() ? "`" : ", `") + u + "`";
            addFinding("bundNotChecked", b.id, unsized.front(), b.netVolume, 0.0,
                "warning",
                w + " lists " + names + ", which the sizing pass could not size"
                " (announced `sizingRefused`), so " + (unsized.size() == 1
                ? std::string("it is") : std::string("they are")) + " not placed"
                " -- its wall is published as declared, and its CAPACITY IS NOT"
                " CHECKED: what it must hold depends on the size of what it"
                " holds, and no size is invented.  Fix the sizing and the"
                " containment is checked against its rule");
        }
        else if (b.held.empty())
        {
            b.verdict = "holdsNothing";
            addFinding("bundHoldsNothing", b.id, "", b.netVolume, b.requiredVolume,
                "info",
                w + " encloses no item that holds liquid by the run's own"
                " inventory (" + std::to_string(b.items.size()) + " item(s)"
                " listed, none with a liquid phase in its sizing's inventory)"
                " -- its capacity rule has nothing to hold it to");
        }
        else if (b.netVolume + 1e-9 * std::max(1.0, b.requiredVolume)
                 >= b.requiredVolume)
            b.verdict = "adequate";
        else
        {
            b.verdict = "inadequate";
            addFinding("bundCapacity", b.id, "", b.netVolume, b.requiredVolume,
                "warning",
                w + " (" + b.kind + ") holds " + num(b.netVolume) + " m3 ("
                + (b.kind == "bund"
                   ? num(b.area) + " m2 x " + num(b.wallHeight) + " m less "
                     + num(b.displacedVolume) + " m3 the enclosed footprints"
                       " displace"
                   : std::string("its pit, ") + num(b.pitLength) + " x "
                     + num(b.pitWidth) + " x " + num(b.pitDepth) + " m")
                + "), short of the " + num(b.requiredVolume) + " m3 its declared"
                  " rule requires (source: " + b.ruleSource + ")");
        }
        if (b.drain == "openToSewer")
            addFinding("bundDrainOpen", b.id, "", 0.0, 0.0, "warning",
                w + " drains OPEN to the sewer (`drain openToSewer;`): a spill"
                " leaves by the drain as fast as it arrives, and the "
                + std::string(b.kind == "bund" ? "bund" : "pit")
                + " holds nothing while the drain is open -- a containment's"
                  " drain is the case's to defend");
        if (b.hasPit)
        {
            const scalar px0 = b.pitX - 0.5 * b.pitLength, px1 = b.pitX + 0.5 * b.pitLength;
            const scalar py0 = b.pitY - 0.5 * b.pitWidth,  py1 = b.pitY + 0.5 * b.pitWidth;
            LayoutItem pit;
            pit.shape = "box"; pit.orientation = "alongX";
            pit.x = b.pitX; pit.y = b.pitY; pit.dx = b.pitLength; pit.dy = b.pitWidth;
            for (const auto& i : rec.items)
                if (clearPlan(i, pit) < -kTol)
                    refuse(w + ": its pit (x " + num(px0) + " .. " + num(px1)
                           + " m, y " + num(py0) + " .. " + num(py1) + " m) lies"
                             " under `" + i.id + "` -- an item cannot stand over"
                             " an open pit; move one of them");
            for (const auto& rd : rec.roads.roads)
                for (const auto& pr : pavedRects(rd))
                {
                    const scalar wx = std::min(px1, pr.xMax) - std::max(px0, pr.xMin);
                    const scalar wy = std::min(py1, pr.yMax) - std::max(py0, pr.yMin);
                    if (wx > kTol && wy > kTol)
                        refuse(w + ": its pit lies under road `" + rd.id + "` -- a"
                               " road cannot run over an open pit; move one of"
                               " them");
                }
            //  REMOTE: the pit is where the pool forms, so it is meant to
            //  stand AWAY from the items whose spill it takes.
            bool meets = strictlyInside(b.pitX, b.pitY, p);
            for (std::size_t k = 0; k < p.size() && !meets; ++k)
                if (segmentThroughRect(p[k], p[(k + 1) % p.size()], px0, px1, py0, py1))
                    meets = true;
            if (meets)
                addFinding("pitNotRemote", b.id, "", 0.0, 0.0, "warning",
                    w + " is an impounding area, and its pit lies INSIDE its own"
                    " catch area: the pool then forms under the items it is meant"
                    " to lead the spill away from -- a remote pit stands outside"
                    " the catch area");
        }
        rec.bunds.push_back(b);
    }

    //  ---- two containments claiming the same ground -----------------------
    auto someInside = [](const std::vector<P2>& u, const std::vector<P2>& v)
    {
        for (std::size_t k = 0; k < u.size(); ++k)
        {
            const auto& s = u[k];
            const auto& t = u[(k + 1) % u.size()];
            if (strictlyInside(s.first, s.second, v)
                || strictlyInside(0.5 * (s.first + t.first),
                                  0.5 * (s.second + t.second), v))
                return true;
        }
        return false;
    };
    for (std::size_t i = 0; i < rec.bunds.size(); ++i)
        for (std::size_t j = i + 1; j < rec.bunds.size(); ++j)
        {
            const auto a = outlineOf(rec.bunds[i]), b = outlineOf(rec.bunds[j]);
            bool overlap = false;
            for (std::size_t k = 0; k < a.size() && !overlap; ++k)
                for (std::size_t m = 0; m < b.size() && !overlap; ++m)
                    if (segmentsCross(a[k], a[(k + 1) % a.size()],
                                      b[m], b[(m + 1) % b.size()]))
                        overlap = true;
            if (overlap || someInside(a, b) || someInside(b, a))
                refuse("bunds `" + rec.bunds[i].id + "` and `" + rec.bunds[j].id
                       + "` claim the same ground -- two containments may share a"
                         " wall, never a floor");
        }
}

//  A liquid in the open that nothing contains.  Run on EVERY layout (a case
//  with no `bunds` included): a layout with an unbunded tank is a layout the
//  student must defend.
void announceUnbunded(const SimulationResult& r, const PlantLayoutRecord& rec,
                      const FindingSink& addFinding)
{
    std::set<std::string> held;
    for (const auto& b : rec.bunds)
        for (const auto& id : b.items) held.insert(id);
    for (const auto& i : rec.items)
    {
        if (!i.room.empty() || held.count(i.id)) continue;
        const scalar liquid = heldLiquidOf(r, i.id);
        if (liquid <= 0) continue;
        addFinding("unbundedLiquid", i.id, "", liquid, 0.0, "warning",
            "`" + i.id + "` holds " + num(liquid) + " m3 of liquid by the run's"
            " own inventory, and no bund or impounding area of this layout"
            " encloses it: a leak runs where the ground takes it.  Declare its"
            " secondary containment (`bunds ( { name; kind bund|impounding;"
            " items ( " + i.id + " ); ... } );` in system/layoutDict), or"
            " defend its absence");
    }
}

//  Roads and pipes through a wall, and a containment across the fence: run
//  once every road, pipe and the fence are final.
void checkBundCrossings(PlantLayoutRecord& rec, const FindingSink& addFinding)
{
    for (const auto& b : rec.bunds)
    {
        const auto p = outlineOf(b);
        const std::string w = "bund `" + b.id + "`";
        for (const auto& rd : rec.roads.roads)
        {
            bool crosses = false;
            for (const auto& pr : pavedRects(rd))
                for (std::size_t k = 0; k < p.size() && !crosses; ++k)
                    if (segmentThroughRect(p[k], p[(k + 1) % p.size()],
                                           pr.xMin, pr.xMax, pr.yMin, pr.yMax))
                        crosses = true;
            if (crosses)
                addFinding("roadCrossesBund", rd.id, b.id, 0.0, b.wallHeight,
                    "warning",
                    "road `" + rd.id + "` crosses the " + num(b.wallHeight)
                    + " m wall of " + w + ": a vehicle needs a ramp over it, and"
                      " a gap in it is a way out for the spill -- the crossing is"
                      " the case's to defend");
        }
        for (const auto& pp : rec.pipes)
        {
            bool through = false;
            for (std::size_t s = 0; s + 1 < pp.route.size() && !through; ++s)
            {
                const auto& u = pp.route[s];
                const auto& v = pp.route[s + 1];
                if (std::fabs(u[2] - v[2]) > kTol) continue;   // a riser
                if (u[2] >= b.wallHeight - kTol) continue;     // over the wall
                const P2 a { u[0], u[1] }, c { v[0], v[1] };
                for (std::size_t k = 0; k < p.size() && !through; ++k)
                    if (segmentsCross(a, c, p[k], p[(k + 1) % p.size()]))
                        through = true;
            }
            if (through)
                addFinding("pipeThroughBund", pp.stream, b.id, 0.0, b.wallHeight,
                    "warning",
                    "pipe `" + pp.stream + "` passes THROUGH the wall of " + w
                    + ", below its " + num(b.wallHeight) + " m top: a penetration"
                      " the spill can leave by unless it is sealed -- a pipe is"
                      " usually carried over the wall");
        }
        if (rec.fence.present)
        {
            const auto& F = rec.fence;
            bool out = false;
            for (const auto& q : p)
                if (q.first < F.xMin - kTol || q.first > F.xMax + kTol
                    || q.second < F.yMin - kTol || q.second > F.yMax + kTol)
                    out = true;
            if (b.hasPit
                && (b.pitX - 0.5 * b.pitLength < F.xMin - kTol
                    || b.pitX + 0.5 * b.pitLength > F.xMax + kTol
                    || b.pitY - 0.5 * b.pitWidth < F.yMin - kTol
                    || b.pitY + 0.5 * b.pitWidth > F.yMax + kTol))
                out = true;
            if (out)
                refuse("fence: " + w + " stands across or outside the fence (the"
                       " fence runs x " + num(F.xMin) + " .. " + num(F.xMax)
                       + " m, y " + num(F.yMin) + " .. " + num(F.yMax) + " m) --"
                         " reduce the inset or move the containment");
        }
    }
}

} // anonymous namespace

// ===========================================================================

Footprint publishedFootprint(const EquipmentSizing& s)
{
    Footprint f;
    for (const auto& p : kPairs)
    {
        auto d = s.values.find(p.d);
        auto l = s.values.find(p.l);
        if (d == s.values.end() || l == s.values.end()) continue;
        if (s.unitOf(p.d) != "m" || s.unitOf(p.l) != "m") continue;
        //  A SHELL-AND-TUBE OF SEVERAL SHELLS is several bodies whose
        //  arrangement nobody published; it is not one cylinder of the
        //  published size, so it takes a declared footprint.
        if (std::string(p.d) == "shellID")
        {
            auto n = s.values.find("shellsInSeries");
            if (n != s.values.end() && n->second > 1.0) continue;
        }
        f.known = true;
        f.D = d->second;
        f.L = l->second;
        f.fromKeys = std::string(p.d) + "/" + p.l;
        return f;
    }
    std::ostringstream o;
    o << "it publishes no diameter-and-length pair (D/H, shellID/tubeLength,"
         " chamberDiameter/chamberHeight); it publishes";
    std::size_t n = 0;
    for (const auto& [k, v] : s.values)
    {
        (void)v;
        if (n++ == 6) { o << " ..."; break; }
        o << " " << k;
    }
    if (s.values.empty()) o << " nothing";
    f.why = o.str();
    return f;
}

bool isInternal(const EquipmentSizing& s, const SimulationResult& r,
                std::string& host)
{
    auto k = internalKinds().find(s.equipmentType);
    if (k != internalKinds().end()) { host = k->second; return true; }
    const std::string id = s.itemId();
    for (const auto& [oid, o] : r.sizings)
        for (const auto& m : o.encloses)
            if (m == id)
            {
                host = "a basket inside the converter shell `" + oid + "`";
                return true;
            }
    return false;
}

// ---------------------------------------------------------------------------
//  THE PIPE CLASH (DEV.md 4c C93).  The router places a pipe by a rule and
//  never looks at what stands in its way, so a routed segment may run
//  THROUGH a placed item.  Checked here, after every route is final (the
//  fence legs included): a segment whose plan path crosses an item's
//  footprint (a vertical cylinder's disc, any other item's rectangle) while
//  its elevation lies between that item's base and its top is ANNOUNCED by
//  name, once per (pipe, item) -- never refused, because a clash is a draft
//  the student must see and move, like a short distance.  The items at the
//  pipe's own two ends are not checked: the pipe meets them at their nozzle.
//  A pipe AT an item's top (the nozzle height) or touching its edge is not a
//  clash (kTol).
// ---------------------------------------------------------------------------

//  The parameter interval [t0, t1] of segment a + t (b - a), t in [0, 1],
//  that lies strictly inside item i's plan footprint; false when none does.
bool planInside(const LayoutItem& i, const std::vector<scalar>& a,
                const std::vector<scalar>& b, scalar& t0, scalar& t1)
{
    const scalar dx = b[0] - a[0], dy = b[1] - a[1];
    t0 = 0.0; t1 = 1.0;
    if (isCircle(i))
    {
        //  |a + t d - c|^2 < (R - kTol)^2, a quadratic in t.
        const scalar R = 0.5 * i.dx - kTol;
        const scalar fx = a[0] - i.x, fy = a[1] - i.y;
        const scalar A = dx * dx + dy * dy;
        const scalar B = 2.0 * (fx * dx + fy * dy);
        const scalar C = fx * fx + fy * fy - R * R;
        if (A < kTol * kTol) return C < 0.0;          // a vertical segment
        const scalar disc = B * B - 4.0 * A * C;
        if (disc <= 0.0) return false;
        const scalar q = std::sqrt(disc);
        t0 = std::max(0.0, (-B - q) / (2.0 * A));
        t1 = std::min(1.0, (-B + q) / (2.0 * A));
        return t1 > t0;
    }
    //  The rectangle shrunk by kTol, clipped slab by slab (Liang-Barsky).
    const scalar lo[2] = { i.x - 0.5 * i.dx + kTol, i.y - 0.5 * i.dy + kTol };
    const scalar hi[2] = { i.x + 0.5 * i.dx - kTol, i.y + 0.5 * i.dy - kTol };
    const scalar p0[2] = { a[0], a[1] }, d[2] = { dx, dy };
    for (int k = 0; k < 2; ++k)
    {
        if (std::abs(d[k]) < kTol * kTol)
        {
            if (p0[k] <= lo[k] || p0[k] >= hi[k]) return false;
            continue;
        }
        scalar u0 = (lo[k] - p0[k]) / d[k], u1 = (hi[k] - p0[k]) / d[k];
        if (u0 > u1) std::swap(u0, u1);
        t0 = std::max(t0, u0);
        t1 = std::min(t1, u1);
        if (t1 <= t0) return false;
    }
    return true;
}

void checkPipeClashes(PlantLayoutRecord& rec, const FindingSink& addFinding)
{
    for (const auto& p : rec.pipes)
        for (const auto& it : rec.items)
        {
            if ((p.fromKind == "item" && p.from == it.id)
                || (p.toKind == "item" && p.to == it.id)) continue;
            if (!it.room.empty()) continue;   // C100: the shell answers for it
            const scalar zb = it.z + kTol, zt = it.z + it.dz - kTol;
            for (std::size_t k = 1; k < p.route.size(); ++k)
            {
                const auto& a = p.route[k - 1];
                const auto& b = p.route[k];
                scalar t0, t1;
                if (!planInside(it, a, b, t0, t1)) continue;
                //  The elevation over the part of the segment inside the
                //  footprint (a segment is level or vertical: linear in t).
                const scalar za = a[2] + t0 * (b[2] - a[2]);
                const scalar zz = a[2] + t1 * (b[2] - a[2]);
                const scalar zLo = std::min(za, zz), zHi = std::max(za, zz);
                if (zHi <= zb || zLo >= zt) continue;
                addFinding("pipeClash", p.stream, it.id, zLo, it.z + it.dz,
                    "warning",
                    "pipe `" + p.stream + "` runs THROUGH `" + it.id + "`: its"
                    " segment from (" + num(a[0]) + ", " + num(a[1]) + ", "
                    + num(a[2]) + ") to (" + num(b[0]) + ", " + num(b[1])
                    + ", " + num(b[2]) + ") m crosses the item's footprint at "
                    + num(zLo) + " m, below its top at " + num(it.z + it.dz)
                    + " m (base " + num(it.z) + " m).  The router does not"
                    " steer round items: move the item, or route the pipe"
                    " with `pipes { " + p.stream + " { waypoints ( ... ); } }`"
                    " over or round it");
                break;   // once per (pipe, item)
            }
        }
}

// ===========================================================================

PlantLayoutRecord evaluate(const Dictionary& d, const SimulationResult& r,
                           int verbosity)
{
    PlantLayoutRecord rec;

    //  A run whose sizing pass REFUSED every unit sized "nothing" too, but it
    //  has already said why, unit by unit; those items are announced below.
    if (r.sizings.empty() && r.sizingRefusals.empty())
        refuse("the case declares a layout, and a layout places SIZED items"
               " -- this run sized nothing.  Declare a sizing pass"
               " (`system/postDict`, `sizing { units ( ... ); }`), or delete"
               " system/layoutDict");

    if (!d.found("items"))
        refuse("`items ( ... );` is not declared -- a layout places items");

    rec.separation = readSeparation(d);
    rec.wind       = readWind(d);

    //  ---- the items --------------------------------------------------------
    std::vector<std::string> placeable;
    for (const auto* s : itemsInFlowOrder(r))
    {
        std::string host;
        if (!isInternal(*s, r, host)) placeable.push_back(s->itemId());
    }

    //  THE ITEMS INDOORS (DEV.md 4c C100): every item a room of the declared
    //  building lists, its room, floor and floor elevation -- read by the
    //  building's own readers, the one home of an indoor item's base.
    const auto indoor = buildingLayout::indoorPlaces(d);
    rec.shell = buildingLayout::envelopeOf(d);

    std::set<std::string> placed;
    //  Placed items whose sizer REFUSED: (item, sizing entry, its refusal).
    std::vector<std::vector<std::string>> refusedItems;
    std::size_t n = 0;
    for (const auto& e : d.lookupDictList("items"))
    {
        ++n;
        const bool isItem = e->found("item"), isNon = e->found("nonProcess");
        const std::string where0 = "items entry " + std::to_string(n);
        if (isItem == isNon)
            refuse(where0 + ": declare exactly one of `item \"<sized item"
                   " id>\";` (a sized item of this run) or `nonProcess"
                   " \"<name>\";` (a building, a flare, a control room)");
        LayoutItem it;
        it.nonProcess = isNon;
        it.id = e->lookupWord(isItem ? "item" : "nonProcess");
        const std::string where = (isItem ? "item `" : "nonProcess `")
                                  + it.id + "`";
        if (!placed.insert(it.id).second)
            refuse(where + " is placed twice -- one item, one position");

        it.x = length(*e, "x", where);
        it.y = length(*e, "y", where);
        const auto in = indoor.find(it.id);
        if (in != indoor.end())
        {
            //  An item a room lists stands ON that room's floor: its base is
            //  the floor's elevation, read from the building, never declared
            //  a second time here.
            if (e->found("z"))
                refuse(where + " stands in room `" + in->second.room + "` of the"
                       " declared building (the room's `equipment` lists it), and"
                       " an item indoors stands on its room's floor: its base is"
                       " floor `" + in->second.floor + "`'s elevation, "
                       + num(in->second.elevation) + " m, read from the building"
                       " -- delete `z` from the item (one home for the base)");
            it.z    = in->second.elevation;
            it.room = in->second.room;
        }
        else
            it.z = length(*e, "z", where);
        if (!e->found("orientation"))
            refuse(where + ": `orientation` is not declared (vertical,"
                   " alongX or alongY)");
        it.orientation = e->lookupWord("orientation");
        if (it.orientation != "vertical" && it.orientation != "alongX"
            && it.orientation != "alongY")
            refuse(where + ": " + registryRefusal::message("orientation",
                   it.orientation, { "vertical", "alongX", "alongY" },
                   "Accepted"));

        const bool declaresFootprint = e->found("footprint");
        if (isItem)
        {
            auto s = r.sizings.find(it.id);
            //  ITS SIZER REFUSED (C79): the item is left UNPLACED and
            //  announced below, and the run goes on.  A refused sizer is
            //  already its own reported failure; a plot plan must not turn
            //  one missing sheet into a missing run.
            const auto* refusedBy = (s == r.sizings.end())
                                  ? refusedSizingOf(r, it.id) : nullptr;
            if (refusedBy)
            {
                refusedItems.push_back({ it.id, refusedBy->first,
                                         refusedBy->second });
                continue;
            }
            if (s == r.sizings.end())
            {
                std::ostringstream o;
                o << where << " names no sized item of this run.  Placeable"
                     " items:";
                for (const auto& p : placeable) o << " " << p;
                o << "  (an item's id is its design sheet's: the unit name,"
                     " or unit/tag where a unit realises several)";
                refuse(o.str());
            }
            std::string host;
            if (isInternal(s->second, r, host))
                refuse(where + " is not placed on its own: it is a `"
                       + s->second.equipmentType + "`, " + host
                       + " -- place that item instead");
            if (e->found("kind"))
                refuse(where + ": `kind` is the design sheet's own word (`"
                       + s->second.equipmentType + "`) and is not declared"
                       " on a sized item; delete the line");
            it.kind   = s->second.equipmentType;
            it.sector = s->second.sector;
            const Footprint f = publishedFootprint(s->second);
            if (f.known)
            {
                if (declaresFootprint)
                    refuse(where + " declares a `footprint`, but its sizer"
                           " already published its size (" + f.fromKeys
                           + " = " + num(f.D) + " m / " + num(f.L)
                           + " m) -- one item, one size; delete the"
                           " footprint");
                it.shape = "cylinder";
                it.footprintFrom = "published";
                setExtents(it, f.D, f.L, 0.0, where);
            }
            else
            {
                if (!declaresFootprint)
                    refuse(where + " (a `" + it.kind + "`) cannot be placed"
                           " from its own sizing: " + f.why + ".  No size is"
                           " invented -- declare its plan box,"
                           " `footprint { length <m>; width <m>; height <m>; }`");
            }
        }
        else
        {
            if (!e->found("kind"))
                refuse(where + ": a non-process item declares its `kind`"
                       " (a word the separation table can name, e.g."
                       " `kind building;`)");
            it.kind = e->lookupWord("kind");
            if (!declaresFootprint)
                refuse(where + ": a non-process item has no sizing; declare"
                       " `footprint { length <m>; width <m>; height <m>; }`");
            //  Why it is there and where its size came from (C90): both or
            //  neither, so a sentence never stands without its pair.
            if (e->found("source") != e->found("reason"))
                refuse(where + ": declare both `source \"...\";` (where its"
                       " size and place come from) and `reason \"...\";` (why"
                       " it is there), or neither");
            if (e->found("source"))
            {
                it.source = text(*e, "source", where);
                it.reason = text(*e, "reason", where);
            }
        }
        if (it.shape.empty())
        {
            const auto fp = e->subDict("footprint");
            const scalar L = length(*fp, "length", where + " footprint");
            const scalar W = length(*fp, "width",  where + " footprint");
            const scalar H = length(*fp, "height", where + " footprint");
            if (L <= 0 || W <= 0 || H <= 0)
                refuse(where + ": footprint `length`, `width` and `height`"
                       " must be positive");
            it.shape = "box";
            it.footprintFrom = "declared";
            setExtents(it, L, W, H, where);
        }
        readHazards(*e, it, where);
        //  An item indoors is classified by its ROOM (C100): the room's
        //  `atex { zone; source; reason; }` and `ignition` are the one home,
        //  checked by the building against the rooms round it.
        if (!it.room.empty() && (it.release || !it.ignition.empty()))
            refuse(where + " stands in room `" + it.room + "` of the declared"
                   " building, and declares " + (it.release
                   ? std::string("a `release` (hazardous-area zones)")
                   : std::string("an `ignition`")) + " of its own.  Indoors the"
                   " ROOM is classified, not the item: declare the room's `atex {"
                   " zone; source; reason; }` (or its `ignition \"...\";`) in"
                   " `building { rooms ( ... ); }` and delete it from the item");
        readParking(*e, it, where, rec);   // C96
        rec.items.push_back(it);
    }

    //  ---- overlap: REFUSED ------------------------------------------------
    for (std::size_t i = 0; i < rec.items.size(); ++i)
        for (std::size_t j = i + 1; j < rec.items.size(); ++j)
        {
            const auto& a = rec.items[i];
            const auto& b = rec.items[j];
            //  THE SHELL HOLDS WHAT ITS ROOMS LIST (C100): the building's
            //  envelope and an item a room lists are not two items sharing a
            //  place -- the building checks that the item fits its room.
            const bool shellA = !rec.shell.empty() && a.id == rec.shell;
            const bool shellB = !rec.shell.empty() && b.id == rec.shell;
            if ((shellA && !b.room.empty()) || (shellB && !a.room.empty()))
                continue;
            const scalar c  = clearPlan(a, b);
            const scalar vz = verticalOverlap(a.z, a.dz, b.z, b.dz);
            if (c < -kTol && vz > kTol && (shellA || shellB))
            {
                const auto& o = shellA ? b : a;
                refuse("`" + o.id + "` OVERLAPS the building `" + rec.shell
                       + "` (the shell of the declared GMP interior) by "
                       + num(-c) + " m on the plan, and no room of the building"
                       " lists it.  An item inside the building stands in a room"
                       " that lists it (`equipment ( " + o.id + " );`, its base"
                       " then that room's floor); an item outside stands clear of"
                       " the shell -- list it in its room or move it");
            }
            if (c < -kTol && vz > kTol)
                refuse("`" + a.id + "` and `" + b.id + "` OVERLAP: their"
                       " footprints interpenetrate by " + num(-c)
                       + " m on the plan, and their heights share "
                       + num(vz) + " m (bases at z = " + num(a.z) + " and "
                       + num(b.z) + " m).  Two items cannot occupy one"
                       " place -- move one");
        }

    //  ---- areas -----------------------------------------------------------
    if (d.found("areas"))
    {
        const auto known = sectorsOf(r);
        if (known.empty())
            refuse("`areas` are declared, and this case has no sectors -- an"
                   " area is a sector's piece of ground (a flat case's units"
                   " ARE the plant); delete the block");
        const auto ad = d.subDict("areas");
        for (const auto& sec : ad->keys())
        {
            if (!known.count(sec))
                refuse("areas: `" + sec + "` -- "
                       + registryRefusal::message("sector", sec,
                           std::vector<std::string>(known.begin(), known.end()),
                           "Accepted"));
            const auto a = ad->subDict(sec);
            LayoutArea ar;
            ar.sector = sec;
            const std::string w = "area `" + sec + "`";
            ar.xMin = length(*a, "xMin", w);
            ar.xMax = length(*a, "xMax", w);
            ar.yMin = length(*a, "yMin", w);
            ar.yMax = length(*a, "yMax", w);
            if (ar.xMax <= ar.xMin || ar.yMax <= ar.yMin)
                refuse(w + ": an area needs xMin < xMax and yMin < yMax");
            rec.areas.push_back(ar);
        }
    }

    //  ---- announcements ---------------------------------------------------
    auto addFinding = [&](const std::string& kind, const std::string& a,
                          const std::string& b, scalar value, scalar limit,
                          const std::string& severity,
                          const std::string& message)
    {
        LayoutFinding f;
        f.kind = kind; f.a = a; f.b = b; f.value = value; f.limit = limit;
        f.id = kind + ":" + a + ":" + b;
        f.message = message;
        rec.findings.push_back(f);
        announce(severity, "layout '" + a + "'", message);
    };

    //  Placed items whose sizer refused: left unplaced, said by name with
    //  the sizer's own reason, so the reader is sent to the sizing table.
    for (const auto& ri : refusedItems)
        addFinding("sizingRefused", ri[0], ri[1], 0.0, 0.0, "warning",
            "`" + ri[0] + "` is declared on the plot plan, and the sizing"
            " pass could not size `" + ri[1] + "` (its FAILED line: \""
            + ri[2] + "\").  The item is left UNPLACED -- no size is"
            " invented, and the run is not refused for it; fix the sizing"
            " and it takes its declared place");

    //  Separation, pair by pair.
    std::map<std::pair<std::string, std::string>,
             std::pair<const LayoutSeparationTable*, scalar>> ruleOf;
    for (const auto& t : rec.separation)
        for (const auto& rule : t.rules)
            ruleOf[{ rule.a, rule.b }] = { &t, rule.distance };
    for (std::size_t i = 0; i < rec.items.size(); ++i)
        for (std::size_t j = i + 1; j < rec.items.size(); ++j)
        {
            const auto& a = rec.items[i];
            const auto& b = rec.items[j];
            //  C100: the table spaces items IN THE OPEN; an item indoors is
            //  represented on the site by its building, whose own
            //  separations the table checks.
            if (!a.room.empty() || !b.room.empty()) continue;
            auto it = ruleOf.find({ std::min(a.kind, b.kind),
                                    std::max(a.kind, b.kind) });
            if (it == ruleOf.end()) continue;
            const auto& tab = *it->second.first;
            const scalar req = it->second.second;
            const bool edge = tab.measure == "edgeToEdge";
            const scalar dist = edge ? clearPlan(a, b)
                                     : std::hypot(a.x - b.x, a.y - b.y);
            if (dist < req - kTol)
                addFinding("separation", a.id, b.id, dist, req, "warning",
                    "`" + a.id + "` (" + a.kind + ") and `" + b.id + "` ("
                    + b.kind + ") stand " + num(dist) + " m apart ("
                    + (edge ? "edge to edge" : "centre to centre")
                    + "), closer than the " + num(req) + " m the case"
                    " declares between these kinds (source: " + tab.source
                    + ")");
        }

    //  A rule naming a kind no placed item carries checks nothing.
    {
        std::set<std::string> kinds, indoorKinds;
        for (const auto& i : rec.items)
            (i.room.empty() ? kinds : indoorKinds).insert(i.kind);
        for (const auto& t : rec.separation)
            for (const auto& rule : t.rules)
                for (const auto& k : { rule.a, rule.b })
                    if (!kinds.count(k))
                    {
                        addFinding("deadRule", k, rule.a + "|" + rule.b, 0.0,
                            rule.distance, "info",
                            "the separation rule (" + rule.a + ", " + rule.b
                            + ") names the kind `" + k + "`, which no placed"
                            " item " + (indoorKinds.count(k)
                                ? std::string("in the open carries (only items"
                                  " inside the building do, and the table spaces"
                                  " items in the open: indoors their building"
                                  " stands for them)")
                                : std::string("carries"))
                            + " -- it checks nothing in this layout");
                        break;
                    }
    }

    //  An item outside its sector's area.
    for (const auto& ar : rec.areas)
        for (const auto& i : rec.items)
        {
            if (i.sector != ar.sector) continue;
            const bool in = i.x - 0.5 * i.dx >= ar.xMin - kTol
                         && i.x + 0.5 * i.dx <= ar.xMax + kTol
                         && i.y - 0.5 * i.dy >= ar.yMin - kTol
                         && i.y + 0.5 * i.dy <= ar.yMax + kTol;
            if (!in)
                addFinding("outsideArea", i.id, ar.sector, 0.0, 0.0,
                    "warning",
                    "`" + i.id + "` belongs to sector " + ar.sector
                    + " and its footprint does not lie inside that sector's"
                    " declared area");
        }

    //  Ignition sources inside a declared zone envelope.  The envelope is a
    //  VERTICAL CYLINDER about the release item's plan centre, of the
    //  declared radius, from the item's base elevation to the declared
    //  height above it; an ignition source is inside it when its footprint
    //  comes within the radius of that axis AND its height range meets the
    //  envelope's.
    for (const auto& rel : rec.items)
    {
        if (!rel.release) continue;
        for (const auto& ig : rec.items)
        {
            if (ig.ignition.empty() || ig.id == rel.id) continue;
            const scalar dPlan = pointToFootprint(rel.x, rel.y, ig);
            for (const auto& z : rel.zones)
            {
                if (dPlan >= z.radius - kTol) continue;
                if (verticalOverlap(rel.z, z.height, ig.z, ig.dz) <= kTol)
                    continue;
                addFinding("ignitionInZone", ig.id, rel.id + "#zone"
                           + std::to_string(z.zone), dPlan, z.radius,
                    "warning",
                    "ignition source `" + ig.id + "` (" + ig.ignition
                    + ") lies inside the zone " + std::to_string(z.zone)
                    + " envelope of `" + rel.id + "`: " + num(dPlan)
                    + " m from its axis against a declared radius of "
                    + num(z.radius) + " m (source: " + rel.releaseSource
                    + ")");
            }
        }
    }

    //  Ignition sources downwind of a release source.  The rule, all of it
    //  declared: the bearing from the release item's plan centre to the
    //  ignition item's lies within +/- halfAngle of the DOWNWIND direction
    //  (the wind's `from` + 180 deg, on true bearings: plan bearing +
    //  planNorth), and the centre-to-centre distance is within `reach`.
    if (rec.wind.present)
    {
        const auto& w = rec.wind;
        const scalar downwind = std::fmod(w.fromDeg + 180.0, 360.0);
        for (const auto& rel : rec.items)
        {
            if (!rel.release) continue;
            for (const auto& ig : rec.items)
            {
                if (ig.ignition.empty() || ig.id == rel.id) continue;
                const scalar vx = ig.x - rel.x, vy = ig.y - rel.y;
                const scalar dist = std::hypot(vx, vy);
                if (dist <= kTol || dist > w.reach + kTol) continue;
                const scalar trueB = std::fmod(planBearing(vx, vy)
                                               + w.planNorthDeg + 360.0, 360.0);
                const scalar off = wrap180(trueB - downwind);
                if (std::fabs(off) > w.halfAngleDeg + 1e-9) continue;
                addFinding("ignitionDownwind", ig.id, rel.id, dist, w.reach,
                    "warning",
                    "ignition source `" + ig.id + "` (" + ig.ignition
                    + ") lies DOWNWIND of release source `" + rel.id + "`: "
                    + num(dist) + " m away on a true bearing of "
                    + num(trueB, 4) + " deg, " + num(std::fabs(off), 3)
                    + " deg off the downwind direction " + num(downwind, 4)
                    + " deg (declared sector +/- " + num(w.halfAngleDeg, 4)
                    + " deg, reach " + num(w.reach) + " m; source: "
                    + w.source + ")");
            }
        }
    }

    //  ---- C96: the emergency items, and the car parks' exits --------------
    checkExposure(rec, addFinding);
    for (const auto& c : rec.carParks)
        if (!c.exitsForward)
            addFinding("carParkReverseExit", c.item, "", 0.0, 0.0, "warning",
                "car park `" + c.item + "`: its bays are entered forward and left"
                " by REVERSING into the aisle (`arrangement " + c.arrangement
                + "; entry forward;`) -- in an evacuation every car backs out at"
                  " once, blind.  Reverse-in bays (`entry reverse;`) or"
                  " drive-through bays let a car leave nose first");

    //  ---- sized items left out --------------------------------------------
    for (const auto& [id, s] : r.sizings)
    {
        std::string host;
        if (isInternal(s, r, host)) { rec.internal.push_back(id); continue; }
        if (!placed.count(id)) rec.unplaced.push_back(id);
    }
    if (!rec.unplaced.empty())
    {
        std::ostringstream o;
        o << rec.unplaced.size() << " sized item"
          << (rec.unplaced.size() == 1 ? " is" : "s are")
          << " not placed on the plot plan:";
        for (const auto& u : rec.unplaced) o << " " << u;
        announce("info", "layout", o.str());
    }

    //  ---- the pipes (C80) ---------------------------------------------------
    routePipes(d, r, rec);

    //  ---- the roads (C90): read after the pipes ---------------------------
    if (d.found("roads")) readRoads(d, rec);

    //  ---- secondary containment (C134): read after the roads (a pit must
    //  not lie under one) and before the plot, which holds its ground ------
    if (d.found("bunds")) readBunds(d, r, rec, addFinding);
    announceUnbunded(r, rec, addFinding);

    //  ---- the plot (C82): after the pipes and the roads, which occupy
    //  ground too -----------------------------------------------------------
    const bool withFence = d.found("fence");
    plotOf(d, rec, withFence);

    //  ---- the fence (C93): drawn FROM the plot, then the boundary pipes
    //  carried on to it --------------------------------------------------------
    if (withFence) fenceOf(d, rec, addFinding);

    //  ---- the roads checked (C90): after the pipes have their final routes,
    //  which a road must pass under ------------------------------------------
    if (d.found("roads")) checkRoads(rec, addFinding);

    //  ---- the pipe clash (C93): every route final, the fence legs included
    checkPipeClashes(rec, addFinding);

    //  ---- the truck routes (C96): every road, access point and fence
    //  opening final ---------------------------------------------------------
    if (rec.roads.present) checkTruckRoutes(rec, addFinding);

    //  ---- roads and pipes through a containment's wall (C134): every road,
    //  route and the fence final ------------------------------------------
    checkBundCrossings(rec, addFinding);

    if (verbosity >= 2)
    {
        std::cout << "\n[layout] system/layoutDict: " << rec.items.size()
                  << " item(s) placed, " << rec.unplaced.size()
                  << " sized item(s) unplaced, " << rec.internal.size()
                  << " internal(s) not placed on their own, "
                  << rec.findings.size() << " finding(s)\n";
        for (const auto& i : rec.items)
            std::cout << "  " << std::left << std::setw(22) << i.id
                      << std::setw(14) << i.kind << " " << i.shape << " "
                      << i.orientation << " at (" << num(i.x) << ", "
                      << num(i.y) << ", " << num(i.z) << ") m, extents "
                      << num(i.dx) << " x " << num(i.dy) << " x "
                      << num(i.dz) << " m (" << i.footprintFrom << ")"
                      << (i.room.empty() ? "" : ", indoors in room " + i.room)
                      << "\n";
        scalar total = 0;
        for (const auto& p : rec.pipes) total += p.length;
        std::cout << "[layout] pipes: " << rec.pipes.size() << " routed ("
                  << num(total) << " m in all), " << rec.notRouted.size()
                  << " not routed; rack at y = " << num(rec.pipeRack.y)
                  << " m, elevation " << num(rec.pipeRack.elevation) << " m ("
                  << (rec.pipeRack.declared ? "declared" : "stated default")
                  << ")\n";
        for (const auto& p : rec.pipes)
            std::cout << "  " << std::left << std::setw(22) << p.stream
                      << std::setw(26) << (p.from + " -> " + p.to) << " "
                      << std::right << std::setw(9) << num(p.length, 5)
                      << " m  (" << p.routedBy
                      << (p.lane >= 0 ? ", lane " + std::to_string(p.lane) : "")
                      << ")\n";
        for (const auto& n : rec.notRouted)
            std::cout << "  " << std::left << std::setw(22) << n.stream
                      << "not routed: " << n.reason << "\n";
        if (rec.roads.present)
        {
            const auto& R = rec.roads;
            std::cout << "[layout] roads: " << R.roads.size() << " road(s), "
                      << num(R.length) << " m of centre line, "
                      << num(R.pavedArea) << " m2 paved, " << R.components
                      << " connected network(s), " << R.rackCrossings.size()
                      << " crossing(s) under the rack; headroom "
                      << num(R.headroom) << " m, access within "
                      << num(R.accessDistance) << " m\n";
            for (const auto& rd : R.roads)
                std::cout << "  " << std::left << std::setw(22) << rd.id
                          << std::right << std::setw(9) << num(rd.length, 5)
                          << " m x " << num(rd.width) << " m"
                          << (rd.fromEntrance ? "" : "  (no gate reaches it)")
                          << "\n";
            for (const auto& T : R.truckRoutes)
            {
                std::cout << "[layout] truck route " << T.id << ": " << T.from
                          << " -> " << T.to << ", " << num(T.length, 6) << " m, "
                          << T.corners.size() << " turn(s), " << T.reversals
                          << " reversal(s), weighbridge "
                          << (T.weighbridge.empty() ? std::string("none")
                                                    : T.weighbridge)
                          << ", " << T.verdict << " (design vehicle turning"
                          << " circle " << num(R.designVehicle.turningDiameter)
                          << " m)\n";
                for (const auto& c : T.corners)
                    std::cout << "  " << std::left << std::setw(8) << c.turn
                              << "at (" << num(c.x) << ", " << num(c.y) << ") m, "
                              << c.inRoad << " -> " << c.outRoad << ": radius "
                              << num(c.radius) << " m, outer " << num(c.outerRadius)
                              << " m against " << num(c.required) << " m"
                              << (c.ok ? "" : "  ANNOUNCED") << "\n";
            }
        }
        const auto& pl = rec.plot;
        std::cout << "[layout] plot: " << num(pl.xMax - pl.xMin) << " m x "
                  << num(pl.yMax - pl.yMin) << " m = " << num(pl.plotArea)
                  << " m2 (margin " << num(pl.margin) << " m, "
                  << (pl.marginDeclared ? "declared" : "none declared")
                  << "); footprints " << num(pl.footprintArea) << " m2 = "
                  << num(100.0 * pl.footprintShare, 4)
                  << " % of the plot\n";
        for (const auto& c : rec.carParks)
            std::cout << "[layout] car park " << c.item << ": " << c.bays
                      << " bays declared, " << c.capacity << " fit (" << c.rows
                      << " row(s) of " << c.perRow << ", " << c.arrangement
                      << ", " << num(c.angleDeg) << " deg, entry " << c.entry
                      << ", cars leave " << (c.exitsForward ? "nose first"
                                                            : "reversing")
                      << "), " << num(c.area) << " m2\n";
        for (const auto& b : rec.bunds)
        {
            std::cout << "[layout] " << (b.kind == "bund" ? "bund " : "impounding area ")
                      << b.id << ": " << b.items.size() << " item(s), "
                      << num(b.area) << " m2 inside a " << num(b.wallHeight)
                      << " m " << (b.kind == "bund" ? "wall" : "kerb") << "; holds "
                      << num(b.netVolume) << " m3 (";
            if (b.kind == "bund")
                std::cout << num(b.grossVolume) << " m3 less " << num(b.displacedVolume)
                          << " m3 displaced";
            else
                std::cout << "its remote pit " << num(b.pitLength) << " x "
                          << num(b.pitWidth) << " x " << num(b.pitDepth) << " m";
            std::cout << ") against " << num(b.requiredVolume) << " m3 required ("
                      << b.governing << " term on " << b.basis;
            for (const auto& a : b.allowances)
                std::cout << " + " << a.name << " " << num(a.volume) << " m3";
            std::cout << "): " << b.verdict << "; drain " << b.drain << "\n";
        }
        for (const auto& ps : pl.sectors)
            std::cout << "  " << std::left << std::setw(22) << ps.sector
                      << num(ps.plotArea) << " m2 (" << ps.from
                      << "), footprints " << num(ps.footprintArea) << " m2\n";
        if (rec.fence.present)
        {
            const auto& F = rec.fence;
            std::cout << "[layout] fence: " << num(F.length) << " m round x "
                      << num(F.xMin) << " .. " << num(F.xMax) << " m, y "
                      << num(F.yMin) << " .. " << num(F.yMax) << " m (the plot"
                      << " moved " << num(F.inset) << " m inward), "
                      << F.openings.size() << " gate opening(s), "
                      << F.crossings.size() << " pipe crossing(s)\n";
            for (const auto& o : F.openings)
                std::cout << "  " << std::left << std::setw(22) << o.gate
                          << "opening on the " << o.side << " side at ("
                          << num(o.x) << ", " << num(o.y) << ") m, "
                          << num(o.width) << " m wide"
                          << (o.road.empty() ? "" : " (road `" + o.road + "`)")
                          << ", the gate " << num(o.gateDistance)
                          << " m inside\n";
            for (const auto& c : F.crossings)
                std::cout << "  " << std::left << std::setw(22) << c.stream
                          << (c.direction == "in" ? "IN " : "OUT") << " on the "
                          << c.side << " side at (" << num(c.x) << ", "
                          << num(c.y) << ", " << num(c.z) << ") m ("
                          << c.positionFrom << "): "
                          << (c.labelDeclared ? (c.direction == "in" ? "from "
                              : "to ") + c.label : std::string("NO LABEL"))
                          << "\n";
        }
    }
    return rec;
}

// ===========================================================================

namespace
{

std::string quoted(const std::string& s)
{
    std::string o = "\"";
    for (char c : s) { if (c == '"') o += '\''; else o += c; }
    return o + "\"";
}

std::string m(scalar v)
{
    //  Two decimals: a draft is a proposal in centimetres, not a claim to
    //  the last digit of a solve.
    std::ostringstream o;
    o << std::fixed << std::setprecision(2) << v << " m";
    return o.str();
}

std::string deg(scalar v)
{
    std::ostringstream o;
    o << std::defaultfloat << std::setprecision(8) << v << " deg";
    return o.str();
}

} // anonymous namespace

std::string draft(const SimulationResult& r, const Dictionary* previous)
{
    //  What the student already declared, carried rather than re-invented.
    std::vector<LayoutSeparationTable> sep;
    LayoutWind wind;
    //  A rack the author DECLARED is carried as declared (its values do not
    //  depend on where the draft puts the items); declared waypoints are not,
    //  because they were drawn around positions the draft moves.
    LayoutPipeRack rack;
    bool hadPipeOverrides = false;
    bool hadRoads = false;
    bool hadFence = false;
    bool hadBunds = false;
    bool hadBuilding = false;   // C100
    bool        hadPlot    = false;
    scalar      plotMargin = 0.0;
    std::string plotReason;
    std::map<std::string, std::string> hazardText;   // id -> its lines
    //  A footprint the author already DECLARED for an item with none of its
    //  own, and the author's non-process items: both carried, never guessed.
    struct Box { scalar L = 0, W = 0, H = 0; std::string orientation; };
    std::map<std::string, Box> declaredBox;
    struct NonProc { std::string name, kind; Box box; std::string source, reason; };
    std::vector<NonProc> nonProc;
    auto readBox = [](const Dictionary& e, const std::string& where) {
        Box b;
        const auto fp = e.subDict("footprint");
        b.L = length(*fp, "length", where);
        b.W = length(*fp, "width",  where);
        b.H = length(*fp, "height", where);
        b.orientation = e.lookupWordOrDefault("orientation", "alongX");
        if (b.orientation == "vertical") b.orientation = "alongX";
        return b;
    };
    if (previous)
    {
        sep  = readSeparation(*previous);
        wind = readWind(*previous);
        if (previous->found("pipeRack"))
            rack = readRack(*previous, PlantLayoutRecord{});
        if (previous->found("plot"))
        {
            const auto pd = previous->subDict("plot");
            plotMargin = length(*pd, "margin", "plot");
            plotReason = text(*pd, "reason", "plot");
            hadPlot    = true;
        }
        hadPipeOverrides = previous->found("pipes");
        hadRoads         = previous->found("roads");
        hadFence         = previous->found("fence");
        hadBunds         = previous->found("bunds");
        hadBuilding      = previous->found("building");
        if (previous->found("items"))
            for (const auto& e : previous->lookupDictList("items"))
            {
                const bool isNon = e->found("nonProcess");
                if (!e->found("item") && !isNon) continue;
                LayoutItem tmp;
                const std::string id = e->lookupWord(isNon ? "nonProcess" : "item");
                if (e->found("footprint"))
                {
                    const Box b = readBox(*e, "`" + id + "` footprint");
                    if (isNon)
                        nonProc.push_back({ id, e->lookupWordOrDefault("kind", "building"), b,
                                            e->lookupWordOrDefault("source", ""),
                                            e->lookupWordOrDefault("reason", "") });
                    else
                        declaredBox[id] = b;
                }
                readHazards(*e, tmp, "item `" + id + "`");
                std::ostringstream o;
                if (!tmp.ignition.empty())
                    o << "        ignition " << quoted(tmp.ignition) << ";\n";
                if (tmp.release)
                {
                    o << "        release\n        {\n"
                      << "            source " << quoted(tmp.releaseSource) << ";\n"
                      << "            reason " << quoted(tmp.releaseReason) << ";\n";
                    if (!tmp.zones.empty())
                    {
                        o << "            zones\n            (\n";
                        for (const auto& z : tmp.zones)
                            o << "                { zone " << z.zone
                              << "; radius " << m(z.radius) << "; height "
                              << m(z.height) << "; }\n";
                        o << "            );\n";
                    }
                    o << "        }\n";
                }
                //  A car park's bays (C96) are the author's declaration,
                //  carried as declared -- a carPark without them refuses.
                if (e->found("parking"))
                {
                    const auto pk = e->subDict("parking");
                    const std::string wp = "`" + id + "` parking";
                    const auto bay = pk->subDict("bay");
                    o << "        parking\n        {\n"
                      << "            bays        " << pk->lookupScalar("bays") << ";\n"
                      << "            bay         { width " << m(length(*bay, "width", wp))
                      << "; length " << m(length(*bay, "length", wp)) << "; }\n"
                      << "            aisle       " << m(length(*pk, "aisle", wp)) << ";\n"
                      << "            angle       " << deg(angleDeg(*pk, "angle", wp)) << ";\n"
                      << "            arrangement " << pk->lookupWord("arrangement") << ";\n"
                      << "            entry       " << pk->lookupWord("entry") << ";\n"
                      << "            source      " << quoted(text(*pk, "source", wp)) << ";\n"
                      << "            reason      " << quoted(text(*pk, "reason", wp)) << ";\n"
                      << "        }\n";
                }
                hazardText[id] = o.str();
            }
    }
    std::map<std::pair<std::string, std::string>,
             std::pair<scalar, bool>> rule;   // -> (distance, edgeToEdge)
    for (const auto& t : sep)
        for (const auto& ru : t.rules)
            rule[{ ru.a, ru.b }] = { ru.distance, t.measure == "edgeToEdge" };

    //  ---- the items, in flow order, grouped by sector -----------------------
    struct D { const EquipmentSizing* s; LayoutItem it; };
    std::vector<std::string> sectorOrder;
    std::map<std::string, std::vector<D>> bySector;
    std::vector<std::string> needFootprint, internals;
    for (const auto* s : itemsInFlowOrder(r))
    {
        std::string host;
        if (isInternal(*s, r, host))
        { internals.push_back(s->itemId() + "  (" + host + ")"); continue; }
        const Footprint f = publishedFootprint(*s);
        auto prevBox = declaredBox.find(s->itemId());
        if (!f.known && prevBox == declaredBox.end())
        {
            needFootprint.push_back(s->itemId() + "  (" + s->equipmentType
                                    + ": " + f.why + ")");
            continue;
        }
        D dd{ s, {} };
        dd.it.id = s->itemId();
        dd.it.kind = s->equipmentType;
        dd.it.sector = s->sector;
        if (f.known)
        {
            dd.it.shape = "cylinder";
            dd.it.footprintFrom = "published";
            //  A shell-and-tube lies on its side (the bundle is pulled along
            //  its axis); every other cylinder stands.  A DRAFTING choice,
            //  said in the file, which the student may reverse.
            dd.it.orientation = s->equipmentType == "shellTubeHX" ? "alongY"
                                                                  : "vertical";
            setExtents(dd.it, f.D, f.L, 0.0, dd.it.id);
        }
        else
        {
            const Box& b = prevBox->second;
            dd.it.shape = "box";
            dd.it.footprintFrom = "declared";
            dd.it.orientation = b.orientation;
            setExtents(dd.it, b.L, b.W, b.H, dd.it.id);
        }
        if (!bySector.count(s->sector)) sectorOrder.push_back(s->sector);
        bySector[s->sector].push_back(dd);
    }

    //  ---- place along one line (y = 0), in flow order -----------------------
    //  Each item goes at the smallest x that keeps (i) the clear gap to the
    //  item before it at least the larger plan extent of the two -- a
    //  DRAFTING spacing for access, not a safety distance -- and (ii) every
    //  declared separation to every item already placed.
    std::vector<D> nonProcD;
    for (const auto& np : nonProc)
    {
        D dd{ nullptr, {} };
        dd.it.id = np.name;
        dd.it.nonProcess = true;
        dd.it.kind = np.kind;
        dd.it.source = np.source;
        dd.it.reason = np.reason;
        dd.it.shape = "box";
        dd.it.footprintFrom = "declared";
        dd.it.orientation = np.box.orientation;
        setExtents(dd.it, np.box.L, np.box.W, np.box.H, np.name);
        nonProcD.push_back(dd);
    }
    std::vector<std::vector<D>*> groups;
    for (const auto& sec : sectorOrder) groups.push_back(&bySector[sec]);
    groups.push_back(&nonProcD);
    std::vector<LayoutItem*> placed;
    for (auto* grp : groups)
        for (auto& dd : *grp)
        {
            LayoutItem& it = dd.it;
            it.y = 0.0;
            it.z = 0.0;
            scalar x = 0.5 * it.dx;
            if (!placed.empty())
            {
                const LayoutItem& prev = *placed.back();
                const scalar gap = std::max({ prev.dx, prev.dy, it.dx, it.dy });
                x = prev.x + 0.5 * prev.dx + gap + 0.5 * it.dx;
                for (const auto* p : placed)
                {
                    auto ru = rule.find({ std::min(p->kind, it.kind),
                                          std::max(p->kind, it.kind) });
                    if (ru == rule.end()) continue;
                    const scalar need = ru->second.second
                        ? p->x + 0.5 * p->dx + ru->second.first + 0.5 * it.dx
                        : p->x + std::max(ru->second.first,
                                          0.5 * p->dx + 0.5 * it.dx);
                    x = std::max(x, need);
                }
            }
            //  Rounded UP to the centimetre the file prints, so the printed
            //  position never sits closer than the rule it was placed by.
            it.x = std::ceil(x * 100.0 - 1e-9) / 100.0;
            placed.push_back(&it);
        }

    //  ---- one area per sector: the items' extent, widened by half the gap
    //  to the neighbouring sector, so adjacent areas meet midway -------------
    std::vector<LayoutArea> areas;
    const bool sectored = !sectorOrder.empty()
                       && !(sectorOrder.size() == 1 && sectorOrder[0].empty());
    if (sectored)
    {
        std::vector<scalar> lo, hi, half;
        for (const auto& sec : sectorOrder)
        {
            scalar l = 1e300, h = -1e300, w = 0;
            for (const auto& dd : bySector[sec])
            {
                l = std::min(l, dd.it.x - 0.5 * dd.it.dx);
                h = std::max(h, dd.it.x + 0.5 * dd.it.dx);
                w = std::max(w, 0.5 * dd.it.dy);
            }
            lo.push_back(l); hi.push_back(h); half.push_back(w);
        }
        for (std::size_t k = 0; k < sectorOrder.size(); ++k)
        {
            if (sectorOrder[k].empty()) continue;   // no sector stamp
            scalar mL = k > 0 ? 0.5 * (lo[k] - hi[k - 1]) : -1;
            scalar mR = k + 1 < sectorOrder.size() ? 0.5 * (lo[k + 1] - hi[k]) : -1;
            if (mL < 0) mL = mR;
            if (mR < 0) mR = mL;
            if (mL < 0) mL = mR = half[k];
            const scalar my = std::max(mL, mR);
            areas.push_back({ sectorOrder[k], lo[k] - mL, hi[k] + mR,
                              -half[k] - my, half[k] + my });
        }
    }

    //  ---- write ----------------------------------------------------------
    std::ostringstream o;
    o << "/*---------------------------------------------------------------------------*\\\n"
         "  system/layoutDict -- A DRAFT written by `bin/choupo-layout --draft`.\n"
         "\n"
         "  THIS FILE IS A PROPOSAL, NOT A LAYOUT.  The tool put the sized items in\n"
         "  flow order (the order the flowsheet declares its units) along one line,\n"
         "  y = 0, at grade; between neighbours it left a clear gap equal to the\n"
         "  larger plan extent of the two -- a DRAFTING spacing for access, not a\n"
         "  safety distance -- and it kept every separation the case had declared.\n"
         "  It invented no size and no distance: an item whose sizer published no\n"
         "  diameter and length is listed below for YOU to place with a declared\n"
         "  footprint, and no separation table, wind or zone is written for you.\n"
         "  Move every item to where you can defend it, then delete this banner.\n"
         "\n"
         "  Grammar (lengths in m; angles must carry `deg`):\n"
         "    items ( { item \"<sized item id>\"; x; y; z; orientation\n"
         "              vertical|alongX|alongY; [footprint {length; width; height;}]\n"
         "              [ignition \"why\";] [release { source; reason; zones (...); }] }\n"
         "            { nonProcess \"<name>\"; kind <word>; x; y; z; orientation;\n"
         "              footprint {...}; [ignition \"why\";]\n"
         "              [parking { bays; bay { width; length; } aisle; angle <deg>;\n"
         "                arrangement doubleLoaded|driveThrough; entry reverse|forward;\n"
         "                source; reason; }   (a kind carPark only)] } );\n"
         "    areas { <SECTOR> { xMin; xMax; yMin; yMax; } }\n"
         "    separation ( { source; reason; measure edgeToEdge|centreToCentre;\n"
         "                   distances ( { between ( kindA kindB ); distance; } ); } );\n"
         "    pipeRack { y; elevation; laneSpacing; lanesPerTier <n>; tierSpacing;\n"
         "               xStart; xEnd; reason; }   (absent: the engine's stated default)\n"
         "    pipes { <stream> { waypoints ( { x; y; z; } ... ); } }   (optional)\n"
         "    plot { margin; reason; }   (absent: margin 0 m, announced -- a lower bound)\n"
         "    roads { source; reason; headroom; access { distance; source; reason; }\n"
         "            [noTraffic ( <zones> );] network ( { road \"<name>\"; width;\n"
         "            [cornerRadius;] [oneWay yes|no;] reason; waypoints ( { x; y; }\n"
         "            ... ); } ... ); [designVehicle { turningDiameter; source; reason; }]\n"
         "            [turningAreas ( { area; x; y; diameter; reason; } ... );]\n"
         "            [truckRoutes ( { route; from <gate>; to <gate>; roads ( ... );\n"
         "            [serves ( ... );] reason; } ... );] }   (optional)\n"
         "    wind { from <deg>; planNorth <deg>; halfAngle <deg>; reach <m>;\n"
         "           source; reason; }\n"
         "  Record: docs/design/a-plant-layout-is-declared-and-checked.md\n"
         "\\*---------------------------------------------------------------------------*/\n\n";

    o << "items\n(\n";
    for (std::size_t g = 0; g < groups.size(); ++g)
    {
        const bool np = g + 1 == groups.size();
        if (np && !nonProcD.empty())
            o << "    //  non-process items, carried from the previous layout\n";
        else if (!np && !sectorOrder[g].empty())
            o << "    //  sector " << sectorOrder[g] << "\n";
        for (const auto& dd : *groups[g])
        {
            const auto& it = dd.it;
            if (it.nonProcess)
            {
                o << "    {\n        nonProcess  " << quoted(it.id) << ";\n"
                  << "        kind        " << it.kind << ";\n";
                if (!it.source.empty())
                    o << "        source      " << quoted(it.source) << ";\n"
                      << "        reason      " << quoted(it.reason) << ";\n";
            }
            else
                o << "    {\n        item        " << quoted(it.id) << ";   // "
                  << it.kind << ", " << num(it.dx) << " x " << num(it.dy)
                  << " x " << num(it.dz) << " m "
                  << (it.footprintFrom == "published"
                        ? "from its own sizing" : "from YOUR declared footprint")
                  << "\n";
            o << "        x           " << m(it.x) << ";\n"
              << "        y           " << m(it.y) << ";\n"
              << "        z           " << m(it.z) << ";\n"
              << "        orientation " << it.orientation << ";\n";
            if (it.shape == "box")
            {
                const bool ax = it.orientation == "alongX";
                o << "        footprint   { length " << m(ax ? it.dx : it.dy)
                  << "; width " << m(ax ? it.dy : it.dx) << "; height "
                  << m(it.dz) << "; }\n";
            }
            auto h = hazardText.find(it.id);
            if (h != hazardText.end()) o << h->second;
            o << "    }\n";
        }
    }
    o << ");\n";

    if (!needFootprint.empty())
    {
        o << "\n//  NOT PLACED -- these items publish no diameter and length, so the tool\n"
             "//  will not guess a size.  Add each to `items` with the plan box YOU\n"
             "//  defend (an entry of the form below), or leave it out and the run\n"
             "//  will say it is unplaced:\n"
             "//      { item \"<id>\"; x ... m; y ... m; z 0 m; orientation alongX;\n"
             "//        footprint { length ... m; width ... m; height ... m; } }\n";
        for (const auto& s : needFootprint) o << "//    " << s << "\n";
    }
    if (!internals.empty())
    {
        o << "\n//  Never placed on their own (they live inside or on another item):\n";
        for (const auto& s : internals) o << "//    " << s << "\n";
    }

    if (!areas.empty())
    {
        o << "\n//  One area per sector: the items' extent, widened by half the gap to\n"
             "//  the neighbouring sector.  A drafting proposal.\nareas\n{\n";
        for (const auto& a : areas)
            o << "    " << a.sector << " { xMin " << m(a.xMin) << "; xMax "
              << m(a.xMax) << "; yMin " << m(a.yMin) << "; yMax "
              << m(a.yMax) << "; }\n";
        o << "}\n";
    }

    if (!sep.empty())
    {
        o << "\n//  The case's own separation table(s), carried as declared.\nseparation\n(\n";
        for (const auto& t : sep)
        {
            o << "    {\n        source  " << quoted(t.source) << ";\n"
              << "        reason  " << quoted(t.reason) << ";\n"
              << "        measure " << t.measure << ";\n"
              << "        distances\n        (\n";
            for (const auto& ru : t.rules)
                o << "            { between ( " << ru.a << " " << ru.b
                  << " ); distance " << m(ru.distance) << "; }\n";
            o << "        );\n    }\n";
        }
        o << ");\n";
    }
    else
    {
        o << "\n//  SEPARATION: none declared, and none is written for you.  Choupo ships no\n"
             "//  spacing table -- the published ones grant no redistribution -- so the\n"
             "//  distances are YOURS, each table with where its numbers come from:\n"
             "//  separation\n"
             "//  (\n"
             "//      { source \"...\"; reason \"...\"; measure edgeToEdge;\n"
             "//        distances ( { between ( vessel compressor ); distance ... m; } ); }\n"
             "//  );\n";
    }

    if (wind.present)
    {
        o << "\n//  The case's own prevailing wind, carried as declared.\nwind\n{\n"
          << "    from      " << deg(wind.fromDeg) << ";\n"
          << "    planNorth " << deg(wind.planNorthDeg) << ";\n"
          << "    halfAngle " << deg(wind.halfAngleDeg) << ";\n"
          << "    reach     " << m(wind.reach) << ";\n"
          << "    source    " << quoted(wind.source) << ";\n"
          << "    reason    " << quoted(wind.reason) << ";\n}\n";
    }
    else
    {
        o << "\n//  WIND and HAZARDOUS AREAS: none declared, and none is written for you.\n"
             "//  The site's wind rose and each release source's zone extents are YOURS\n"
             "//  to declare, with their sources:\n"
             "//  wind { from ... deg; planNorth 0 deg; halfAngle ... deg; reach ... m;\n"
             "//         source \"...\"; reason \"...\"; }\n"
             "//  and, inside an item:  ignition \"why it ignites\";\n"
             "//                        release { source \"...\"; reason \"...\";\n"
             "//                                  zones ( { zone 2; radius ... m; height ... m; } ); }\n";
    }
    if (rack.declared)
    {
        o << "\n//  The case's own pipe rack, carried as declared.\npipeRack\n{\n"
          << "    y            " << m(rack.y) << ";\n"
          << "    elevation    " << m(rack.elevation) << ";\n"
          << "    laneSpacing  " << m(rack.laneSpacing) << ";\n"
          << "    lanesPerTier " << rack.lanesPerTier << ";\n"
          << "    tierSpacing  " << m(rack.tierSpacing) << ";\n"
          << "    xStart       " << m(rack.xStart) << ";\n"
          << "    xEnd         " << m(rack.xEnd) << ";\n"
          << "    reason       " << quoted(rack.reason) << ";\n}\n";
    }
    else
    {
        o << "\n//  PIPE RACK: none declared, and none is written for you.  Without one the\n"
             "//  engine routes every pipe on its STATED DEFAULT rack and says so in the\n"
             "//  run (along plan x on the mean y of the process items, 6 m up, lanes\n"
             "//  0.6 m apart, 6 per tier, tiers 1.5 m apart, 5 m past the outermost\n"
             "//  footprint at each end).  Where YOUR rack runs is a design choice you\n"
             "//  defend -- every pipe length follows from it:\n"
             "//  pipeRack\n"
             "//  {\n"
             "//      y            ... m;      // plan y of its centre line (it runs along x)\n"
             "//      elevation    ... m;      // its lowest tier\n"
             "//      laneSpacing  ... m;\n"
             "//      lanesPerTier ...;\n"
             "//      tierSpacing  ... m;\n"
             "//      xStart       ... m;      // west end: where the plant's inlets arrive\n"
             "//      xEnd         ... m;      // east end: where its outlets leave\n"
             "//      reason       \"...\";\n"
             "//  }\n";
    }
    if (hadPlot)
        o << "\n//  The case's own plot margin, carried as declared.\nplot\n{\n"
          << "    margin " << m(plotMargin) << ";\n"
          << "    reason " << quoted(plotReason) << ";\n}\n";
    else
        o << "\n//  PLOT MARGIN: none declared, and none is written for you.  The plot area\n"
             "//  the run publishes is then the bare envelope of the layout -- a lower\n"
             "//  bound.  The ground kept clear around the plant for its roads, fence and\n"
             "//  access is yours to declare and defend:\n"
             "//  plot { margin ... m; reason \"...\"; }\n";
    if (hadPipeOverrides)
        o << "\n//  The previous layout's `pipes { ... waypoints ... }` overrides are NOT\n"
             "//  carried: they were drawn around positions this draft has moved.\n";
    //  ROADS ARE NOT DRAFTED (DEV.md 4c C90).  A road's centre line is drawn
    //  round the items it serves, exactly as a declared pipe route is, and
    //  where the gate stands is a fact about the site the run cannot know;
    //  a skeleton proposed here would be a road network nobody chose, with
    //  every access distance it then satisfied satisfied by construction.
    if (hadRoads)
        o << "\n//  The previous layout's `roads {}` network is NOT carried: its centre\n"
             "//  lines were drawn round positions this draft has moved.  Redraw it.\n";
    else
        o << "\n//  ROADS: none declared, and none is written for you -- where the gate\n"
             "//  stands and how each road runs round the items are yours to decide:\n"
             "//  roads\n"
             "//  {\n"
             "//      source   \"...\";  reason \"...\";\n"
             "//      headroom ... m;     // the vehicle clearance under a rack or a pipe\n"
             "//      access   { distance ... m; source \"...\"; reason \"...\"; }\n"
             "//      noTraffic ( 1 );    // optional: zones closed to vehicles (announced)\n"
             "//      network\n"
             "//      (\n"
             "//          { road \"main\"; width ... m; reason \"...\";\n"
             "//            waypoints ( { x ... m; y ... m; } { x ... m; y ... m; } ); }\n"
             "//      );\n"
             "//  }\n"
             "//  and, for the entrance:  { nonProcess \"gate\"; kind gate; ... }\n";
    //  THE FENCE IS NOT DRAFTED either (DEV.md 4c C93): its line follows the
    //  plot by itself, but where each boundary pipe crosses it and what the
    //  label says are facts about the site, and a declared crossing position
    //  was chosen round positions this draft has moved.
    if (hadFence)
        o << "\n//  The previous layout's `fence {}` is NOT carried: its crossing\n"
             "//  positions were chosen round positions this draft has moved.\n"
             "//  Redeclare it.\n";
    //  SECONDARY CONTAINMENT IS NOT DRAFTED (DEV.md 4c C134): a wall is drawn
    //  round the items it holds, at positions this draft has moved, and how
    //  much it must hold is a rule the case reads from its own guideline.
    if (hadBunds)
        o << "\n//  The previous layout's `bunds ( ... )` are NOT carried: each wall was\n"
             "//  drawn round positions this draft has moved.  Redeclare them.\n";
    else
        o << "\n//  SECONDARY CONTAINMENT: none declared, and none is written for you.  An\n"
             "//  item in the open that holds liquid and that no bund encloses is\n"
             "//  announced.  Declare, round the items that hold liquid:\n"
             "//  bunds\n"
             "//  (\n"
             "//      { name \"...\"; kind bund;     // or impounding, with a remote pit { x; y; length; width; depth; }\n"
             "//        items ( ... ); region { xMin ... m; xMax ... m; yMin ... m; yMax ... m; }\n"
             "//        wall { height ... m; } drain closedValve;\n"
             "//        capacityRule { basis vesselVolume; terms ( { fraction ...; of largest; } );\n"
             "//                       source \"...\"; reason \"...\"; }\n"
             "//        source \"...\"; reason \"...\"; }\n"
             "//  );\n";
    //  THE BUILDING IS NOT DRAFTED (DEV.md 4c C100): its rooms and the items
    //  they hold were placed round positions this draft has moved, so every
    //  item is drafted in the open, and the interior is the author's again.
    if (hadBuilding)
        o << "\n//  The previous layout's `building {}` is NOT carried: its rooms, and\n"
             "//  the items they held, were placed round positions this draft has\n"
             "//  moved -- every item is drafted in the open.  Redeclare it, listing\n"
             "//  in each room the items that stand in it (an item a room lists\n"
             "//  takes its base from the room's floor: delete its `z`).\n";
    o << "\n// ************************************************************************* //\n";
    return o.str();
}

} // namespace plantLayout
} // namespace Choupo

// ************************************************************************* //
