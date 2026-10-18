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
        if (i.nonProcess) continue;
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

    //  ---- the junctions, and where each stands on the rack -------------
    auto isJunction = [&](const std::string& unit) {
        return !placedOf.count(unit) && !sizedOf.count(unit)
            && junctionTypes().count(typeOf[unit]);
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
    std::map<std::string, scalar> jx;
    std::vector<std::string> jOrder;
    for (const auto& u : r.topology)
        if (isJunction(u.name)) jOrder.push_back(u.name);
    for (const auto& j : jOrder)
    {
        scalar sx = 0; std::size_t n = 0;
        for (const auto& o : nbr[j])
        {
            auto p = placedOf.find(o);
            if (p == placedOf.end()) continue;
            sx += p->second.front()->x; ++n;
        }
        if (n) jx[j] = sx / scalar(n);
    }
    for (std::size_t pass = 0; pass < jOrder.size(); ++pass)
    {
        bool moved = false;
        for (const auto& j : jOrder)
        {
            if (jx.count(j)) continue;
            scalar sx = 0; std::size_t n = 0;
            for (const auto& o : nbr[j])
                if (jx.count(o)) { sx += jx[o]; ++n; }
            if (n) { jx[j] = sx / scalar(n); moved = true; }
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
        if (cs.size() > 1)
        {
            std::string who;
            for (const auto& c : cs) who += (who.empty() ? "" : ", ") + c;
            //  The producer's nozzle is the one end the drawing can mark:
            //  a missing pipe must never look like a finished drawing.
            const End a = endOf(from, true);
            rec.notRouted.push_back({ s, "consumed by " + std::to_string(cs.size())
                                    + " units (" + who + "); a pipe has two ends",
                                    from, who, a.kind.empty() ? Pt{} : a.point });
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
            const Pt anchor = !a.kind.empty() ? a.point
                            : (!b.kind.empty() ? b.point : Pt{});
            rec.notRouted.push_back({ s, why, from, to, anchor });
            continue;
        }
        LayoutPipe p;
        p.stream = s;
        auto lab = r.boundaryOutletLabelOf.find(s);
        if (lab != r.boundaryOutletLabelOf.end()) p.label = lab->second;
        p.fromKind = a.kind; p.from = a.at; p.fromUnit = a.unit;
        p.toKind   = b.kind; p.to   = b.at; p.toUnit   = b.unit;

        std::vector<Pt> pts;
        auto ov = overrides.find(s);
        if (ov != overrides.end())
        {
            //  A DECLARED ROUTE: the source's anchor, the waypoints, the
            //  target's anchor -- a battery limit has no anchor of its own,
            //  so there the route begins or ends at the case's own waypoint.
            p.routedBy = "waypoints";
            if (!a.point.empty()) pts.push_back(a.point);
            for (const auto& q : ov->second) pts.push_back(q);
            if (!b.point.empty()) pts.push_back(b.point);
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
                    o << (a.point.empty() ? "the first waypoint"
                          : "the top of `" + a.at + "`");
                    o << " and ends at "
                      << (b.point.empty() ? "the last waypoint"
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
    R.pavedArea = unionArea(all);

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
    " pipe's polyline and every declared road's paved surface, grown on"
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
    " every declared waypoint route and every declared road's paved surface,"
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
    pl.xMin = x0 - pl.margin;  pl.xMax = x1 + pl.margin;
    pl.yMin = y0 - pl.margin;  pl.yMax = y1 + pl.margin;
    pl.plotArea = (pl.xMax - pl.xMin) * (pl.yMax - pl.yMin);

    //  ---- the footprints ---------------------------------------------------
    for (const auto& i : rec.items) pl.footprintArea += planArea(i);
    pl.footprintShare = pl.plotArea > 0 ? pl.footprintArea / pl.plotArea : 0.0;
    for (std::size_t i = 0; i < rec.items.size(); ++i)
        for (std::size_t j = i + 1; j < rec.items.size(); ++j)
            if (clearPlan(rec.items[i], rec.items[j]) < -kTol) ++pl.stackedPairs;

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
            ps.footprintArea += planArea(i);
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
                { dmin = dd; along = alongX(o.side) ? q[0] : q[1]; }
            }
            o.road  = best->id;
            o.width = best->width;
        }
        onSide(o.side, along, o.x, o.y);
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
        rec.items.push_back(it);
    }

    //  ---- overlap: REFUSED ------------------------------------------------
    for (std::size_t i = 0; i < rec.items.size(); ++i)
        for (std::size_t j = i + 1; j < rec.items.size(); ++j)
        {
            const auto& a = rec.items[i];
            const auto& b = rec.items[j];
            const scalar c  = clearPlan(a, b);
            const scalar vz = verticalOverlap(a.z, a.dz, b.z, b.dz);
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
        std::set<std::string> kinds;
        for (const auto& i : rec.items) kinds.insert(i.kind);
        for (const auto& t : rec.separation)
            for (const auto& rule : t.rules)
                for (const auto& k : { rule.a, rule.b })
                    if (!kinds.count(k))
                    {
                        addFinding("deadRule", k, rule.a + "|" + rule.b, 0.0,
                            rule.distance, "info",
                            "the separation rule (" + rule.a + ", " + rule.b
                            + ") names the kind `" + k + "`, which no placed"
                            " item carries -- it checks nothing in this"
                            " layout");
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
                      << num(i.dz) << " m (" << i.footprintFrom << ")\n";
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
        }
        const auto& pl = rec.plot;
        std::cout << "[layout] plot: " << num(pl.xMax - pl.xMin) << " m x "
                  << num(pl.yMax - pl.yMin) << " m = " << num(pl.plotArea)
                  << " m2 (margin " << num(pl.margin) << " m, "
                  << (pl.marginDeclared ? "declared" : "none declared")
                  << "); footprints " << num(pl.footprintArea) << " m2 = "
                  << num(100.0 * pl.footprintShare, 4)
                  << " % of the plot\n";
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
         "              footprint {...}; [ignition \"why\";] } );\n"
         "    areas { <SECTOR> { xMin; xMax; yMin; yMax; } }\n"
         "    separation ( { source; reason; measure edgeToEdge|centreToCentre;\n"
         "                   distances ( { between ( kindA kindB ); distance; } ); } );\n"
         "    pipeRack { y; elevation; laneSpacing; lanesPerTier <n>; tierSpacing;\n"
         "               xStart; xEnd; reason; }   (absent: the engine's stated default)\n"
         "    pipes { <stream> { waypoints ( { x; y; z; } ... ); } }   (optional)\n"
         "    plot { margin; reason; }   (absent: margin 0 m, announced -- a lower bound)\n"
         "    roads { source; reason; headroom; access { distance; source; reason; }\n"
         "            [noTraffic ( <zones> );] network ( { road \"<name>\"; width;\n"
         "            reason; waypoints ( { x; y; } ... ); } ... ); }   (optional)\n"
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
    o << "\n// ************************************************************************* //\n";
    return o.str();
}

} // namespace plantLayout
} // namespace Choupo

// ************************************************************************* //
