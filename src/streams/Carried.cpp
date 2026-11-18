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
Description
    The kinds of carried quantity and the functions that carry them between a
    unit's dict wire, a ProcessStream and a state file.  See Carried.H.
\*---------------------------------------------------------------------------*/

#include "streams/Carried.H"

#include "core/Dictionary.H"
#include "core/distribution/SizeGrid.H"
#include "streams/PsdOnGrid.H"
#include "streams/ProcessStream.H"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <fstream>
#include <iomanip>
#include <map>
#include <mutex>
#include <stdexcept>

namespace Choupo {

namespace {

std::map<std::string, CarriedKind::Factory>& registry()
{
    static std::map<std::string, CarriedKind::Factory> r;
    return r;
}

ParticleSizeDistribution psdOf(const CarriedQuantity& q)
{
    ParticleSizeDistribution p;
    p.diameter = q.attribute("axis");
    p.massFrac = q.values;
    p.edges    = q.attribute("edges");
    return p;
}

//  A kind's attribute names are CLOSED: one it does not list is refused, by
//  the kind, naming the quantity.
void allowOnly(const CarriedQuantity& q,
               const std::vector<std::string>& allowed)
{
    for (const auto& kv : q.attributes)
        if (std::find(allowed.begin(), allowed.end(), kv.first) == allowed.end())
        {
            std::string list;
            for (const auto& a : allowed) list += (list.empty() ? "" : ", ") + a;
            throw std::runtime_error("carried quantity '" + q.name + "' ("
                + q.kind + "): the attribute '" + kv.first + "' is not one of"
                + " this kind's own ("
                + (list.empty() ? std::string("it has none") : list) + ").");
        }
}

std::string attributesText(const CarriedQuantity& q)
{
    if (q.attributes.empty()) return "none";
    std::string s;
    for (const auto& kv : q.attributes)
    {
        s += (s.empty() ? "" : ", ") + kv.first + " =";
        for (const auto v : kv.second) s += " " + std::to_string(v);
    }
    return s;
}

// ---------------------------------------------------------------------------
//  EXTENSIVE KINDS: a flow of the carrier.  They add on mixing and divide
//  with the carrier on a split -- the law of section 5b Q2, once.
// ---------------------------------------------------------------------------
class ExtensiveKind : public CarriedKind
{
public:
    std::optional<CarriedQuantity>
    mix(const std::vector<CarriedPart>& parts,
        const CarriedMixContext&) const override
    {
        if (parts.empty()) return std::nullopt;
        CarriedQuantity out = *parts.front().q;
        scalar sum = 0.0;
        for (const auto& p : parts)
        {
            if (p.q->carrier != out.carrier || p.q->attributes != out.attributes)
                throw std::runtime_error("carried quantity '" + out.name
                    + "': inlet '" + p.inlet + "' declares carrier '"
                    + p.q->carrier + "' (attributes "
                    + attributesText(*p.q) + ") where inlet '"
                    + parts.front().inlet + "' declares '"
                    + out.carrier + "' (attributes " + attributesText(out)
                    + ").  One name is one quantity of one carrier; they"
                      " cannot be added.");
            sum += p.q->values.empty() ? 0.0 : p.q->values.front();
        }
        out.values.assign(1, sum);
        return out;
    }
    CarriedQuantity divide(const CarriedQuantity& q, scalar f) const override
    {
        CarriedQuantity out = q;
        for (auto& v : out.values) v *= f;
        return out;
    }
    void writeState(std::ostream& os, const CarriedQuantity& q,
                    const std::string& ind) const override
    {
        os << ind << q.name << "\n" << ind << "{\n"
           << ind << "    kind     " << q.kind << ";\n"
           << ind << "    carrier  " << q.carrier << ";\n";
        validate(q);
        if (q.attributes.count("order"))
            os << ind << "    order    "
               << static_cast<int>(std::lround(q.attributeScalar("order", -1)))
               << ";\n";
        const auto oldPrec = os.precision(17);
        os << ind << "    values   (";
        for (const auto v : q.values) os << " " << v;
        os << " );\n" << ind << "}\n";
        os.precision(oldPrec);
    }
    CarriedQuantity readState(const std::string& name,
                              const Dictionary& d) const override
    {
        CarriedQuantity q;
        q.kind    = kindName();
        q.name    = name;
        q.carrier = d.lookupWord("carrier");
        if (d.found("order"))
            q.attributes["order"] = { std::round(d.lookupScalar("order")) };
        q.values  = d.lookupList("values");
        q.unit    = unitOf(q);
        validate(q);
        return q;
    }
    void report(std::ostream& os, const CarriedQuantity& q) const override
    {
        os << q.name << " [" << kindName() << ", carrier " << q.carrier
           << (q.attributes.count("order")
                   ? ", order " + std::to_string(static_cast<int>(
                         std::lround(q.attributeScalar("order", -1))))
                   : std::string())
           << "] = " << q.values.front() << " " << q.unit;
    }
    scalar total(const CarriedQuantity& q) const override
    { return q.values.empty() ? 0.0 : q.values.front(); }
    CarriedQuantity transform(const CarriedQuantity& in,
                              const std::vector<scalar>& solved,
                              const std::string& unit) const override
    {
        if (solved.size() != 1)
            throw std::runtime_error(unit + ": the solved " + kindName() + " '"
                + in.name + "' must be ONE number.");
        if (!allowsProduction() && solved.front() != in.values.front())
            throw std::runtime_error(unit + ": changes the " + kindName() + " '"
                + in.name + "' (carrier " + in.carrier + ") from "
                + std::to_string(in.values.front()) + " to "
                + std::to_string(solved.front()) + ", but a " + kindName()
                + " has NO production or destruction term: a unit may divide"
                  " or move it, never make or lose it.  A unit that converts"
                  " the carrier must declare a quantity that has a balance"
                  " (a rate), or refuse.");
        CarriedQuantity out = in;
        out.values = solved;
        validate(out);
        return out;
    }

    //  The invariants every extensive kind shares: ONE value; the kind adds
    //  its own attributes and ranges in `check`.
    void validate(const CarriedQuantity& q) const override
    {
        if (q.values.size() != 1)
            throw std::runtime_error("carried quantity '" + q.name + "' ("
                + kindName() + "): `values` must hold ONE number, it holds "
                + std::to_string(q.values.size()) + ".");
        check(q);
    }
    virtual void check(const CarriedQuantity&) const = 0;
};

class MaterialMassKind : public ExtensiveKind
{
public:
    std::string kindName() const override { return "materialMass"; }
    bool allowsProduction() const override { return false; }
    bool totalIsMass() const override { return true; }
    std::string unitOf(const CarriedQuantity&) const override { return "kg/s"; }
    void check(const CarriedQuantity& q) const override
    {
        allowOnly(q, {});
        if (q.values.front() < 0.0)
            throw std::runtime_error("carried quantity '" + q.name
                + "' (materialMass): a mass flow is not negative ("
                + std::to_string(q.values.front()) + ").");
    }
};

class ChainMomentKind : public ExtensiveKind
{
public:
    std::string kindName() const override { return "chainMoment"; }
    //  Coupling and scission make and lose chains and change every moment.
    bool allowsProduction() const override { return true; }
    std::string unitOf(const CarriedQuantity&) const override { return "kmol/s"; }
    void check(const CarriedQuantity& q) const override
    {
        //  Q5: the zeroth moment (the chain count) and the second (for the
        //  weight average); the first is DERIVED from the segments (Q4), so
        //  carrying it would be a second home for the polymer's mass.
        allowOnly(q, { "order" });
        const scalar order = q.attributeScalar("order", -1.0);
        if (order != 0.0 && order != 2.0)
            throw std::runtime_error("carried quantity '" + q.name
                + "' (chainMoment): `order` must be 0 or 2, it is "
                + std::to_string(static_cast<int>(order)) + ".  The first moment is never"
                  " carried: it is derived from the segment flows (design"
                  " record 5b, Q4/Q5).");
        if (q.values.front() < 0.0)
            throw std::runtime_error("carried quantity '" + q.name
                + "' (chainMoment): a moment of a distribution is not"
                  " negative.");
    }
};

// ---------------------------------------------------------------------------
//  THE SIZE DISTRIBUTION: the existing `psd`, its mixing law MOVED here from
//  the mixer (DEV.md 4c C361) with no change of behaviour.
// ---------------------------------------------------------------------------
class SizeDistributionKind : public CarriedKind
{
public:
    std::string kindName() const override { return "sizeDistribution"; }
    bool storedInStreamPsd() const override { return true; }
    std::string unitOf(const CarriedQuantity&) const override { return "-"; }
    void validate(const CarriedQuantity& q) const override
    {
        allowOnly(q, { "axis", "edges", "weight" });
        const auto& axis  = q.attribute("axis");
        const auto& edges = q.attribute("edges");
        if (q.attribute("weight").size() > 1)
            throw std::runtime_error("carried quantity '" + q.name
                + "' (sizeDistribution): `weight` is ONE number (the solid"
                  " mass that weighs the fractions).");
        if (q.attributeScalar("weight", 0.0) < 0.0)
            throw std::runtime_error("carried quantity '" + q.name
                + "' (sizeDistribution): `weight` is a mass, not negative.");
        if (q.values.empty()) return;       // an inlet that carries solids but no distribution
        if (axis.size() != q.values.size())
            throw std::runtime_error("carried quantity '" + q.name
                + "' (sizeDistribution): " + std::to_string(axis.size())
                + " diameters for " + std::to_string(q.values.size())
                + " mass fractions.");
        if (!edges.empty() && edges.size() != q.values.size() + 1)
            throw std::runtime_error("carried quantity '" + q.name
                + "' (sizeDistribution): " + std::to_string(edges.size())
                + " class edges for " + std::to_string(q.values.size())
                + " classes (one more than the classes).");
    }
    //  Breakage and growth move mass BETWEEN classes (a redistribution, with
    //  the unit's own rate); none makes solid mass, which the check holds.
    bool allowsProduction() const override { return true; }

    CarriedQuantity transform(const CarriedQuantity& in,
                              const std::vector<scalar>& solved,
                              const std::string& unit) const override
    {
        if (solved.size() != in.values.size())
            throw std::runtime_error(unit + ": the transformed size"
                " distribution has " + std::to_string(solved.size())
                + " classes, its inlet " + std::to_string(in.values.size())
                + ".");
        scalar a = 0.0, b = 0.0;
        for (auto v : in.values) a += v;
        for (auto v : solved)    b += v;
        if (std::abs(a - b) > 1e-6 * std::max(1.0, std::abs(a)))
            throw std::runtime_error(unit + ": the transformed size"
                " distribution's fractions sum to " + std::to_string(b)
                + " where its inlet's sum to " + std::to_string(a) + ": a"
                  " redistribution between classes makes no solid mass.");
        CarriedQuantity out = in;
        out.values = solved;
        validate(out);
        return out;
    }

    std::optional<CarriedQuantity>
    mix(const std::vector<CarriedPart>& parts,
        const CarriedMixContext& ctx) const override
    {
        //  THE SIZE DISTRIBUTION OF THE BLEND (DEV.md 4c C361).  On the
        //  case's size grid a blend is EXACT: w_out,k = SUM_j m_j w_j,k /
        //  SUM_j m_j, class by class, mass-weighted.  Decided in
        //  docs/design/c361-solids-processing.md:
        //    * every solid-bearing inlet on the SAME grid       -> exact blend;
        //    * one on the grid, another on a unit's own bins (or none) -> the
        //      other is RE-BINNED onto the grid (mass exact; its moments shift
        //      by the within-class assumption) and that is ANNOUNCED;
        //    * two DIFFERENT declared grids                     -> REFUSED: a
        //      case has one grid, so two means a unit ignored it -- a defect
        //      to fix at its source, not to interpolate away here;
        //    * no inlet on a grid                               -> nothing is
        //      done (every case written before the grid: unchanged).
        const CarriedPart* ref = nullptr;
        for (const auto& pi : parts)
            if (!pi.q->attribute("edges").empty() && !pi.q->values.empty()) { ref = &pi; break; }
        if (!ref) return std::nullopt;

        SizeGrid grid;
        if (ctx.unitDict && ctx.unitDict->found("sizeGrid"))
            grid = SizeGrid::fromDict(ctx.unitDict->subDict("sizeGrid"));
        const std::vector<scalar>& E = ref->q->attribute("edges");
        std::vector<scalar> w(E.size() - 1, 0.0);
        scalar M = 0.0;
        for (const auto& pi : parts)
        {
            ParticleSizeDistribution p = psdOf(*pi.q);
            const scalar mass = pi.q->attributeScalar("weight", 0.0);
            if (p.empty())
                throw std::runtime_error("mixer: inlet '" + pi.inlet + "' "
                    "carries solids with NO size distribution while inlet '"
                    + ref->inlet + "' carries one on the case's size grid.  "
                    "The blend's distribution would be undefined; declare a "
                    "`particleSizeDistribution` on '" + pi.inlet + "'.");
            if (p.onGrid() && p.edges.size() == E.size())
            {
                bool same = true;
                for (std::size_t k = 0; k < E.size(); ++k)
                    if (std::abs(p.edges[k] - E[k]) > 1e-9 * std::max(1e-30, E[k]))
                    { same = false; break; }
                if (!same)
                    throw std::runtime_error("mixer: inlets '" + ref->inlet
                        + "' and '" + pi.inlet + "' carry size distributions "
                        "on two DIFFERENT size grids.  A case declares one "
                        "grid (`sizeGrid {}`), so a second one means a unit "
                        "did not write on it -- that unit is the defect.");
            }
            else
            {
                SizeGrid g = grid.empty()
                    ? SizeGrid()          // fall through to the refusal
                    : grid;
                if (g.empty())
                    throw std::runtime_error("mixer: inlet '" + pi.inlet
                        + "' is not on the size grid that '" + ref->inlet
                        + "' carries, and no `sizeGrid` reached this unit "
                        "to re-bin it onto.");
                const scalar before = psdMoments(p.edges, p.diameter, p.massFrac).d50;
                const std::string why = putPsdOnGrid(p, g);
                const scalar after = psdMoments(p.edges, p.diameter, p.massFrac).d50;
                const std::string msg = "inlet '" + pi.inlet + "' " + why
                    + " before blending; its d50 moved from "
                    + std::to_string(before * 1e6) + " to "
                    + std::to_string(after * 1e6) + " um by the re-binning "
                      "(mass is exact; the moments carry the within-class "
                      "assumption)";
                if (ctx.advise) ctx.advise(pi.inlet, msg);
            }
            for (std::size_t k = 0; k < w.size(); ++k) w[k] += mass * p.massFrac[k];
            M += mass;
        }
        if (!(M > 0.0)) return std::nullopt;
        for (auto& v : w) v /= M;
        return create(ref->q->name, ref->q->carrier, w,
                      { { "axis",   representativeSizes(E) },
                        { "edges",  E },
                        { "weight", { M } } });
    }

    CarriedQuantity divide(const CarriedQuantity& q, scalar f) const override
    {
        //  Intensive: a split does not change the fractions, only the mass
        //  that weighs them.
        CarriedQuantity out = q;
        if (out.attributes.count("weight"))
            out.attributes["weight"] = { q.attributeScalar("weight", 0.0) * f };
        return out;
    }

    void writeState(std::ostream& os, const CarriedQuantity& q,
                    const std::string& ind) const override
    {
        validate(q);
        //  The text the state writer printed before the kinds existed.
        os << ind << "particleSizeDistribution\n" << ind << "{\n"
           << ind << "    diameter  (";
        for (const auto d : q.attribute("axis")) os << " " << d;
        os << " );\n" << ind << "    massFrac  (";
        for (const auto m : q.values) os << " " << m;
        os << " );\n";
        if (!q.attribute("edges").empty())
        {
            os << ind << "    edges     (";
            for (const auto e : q.attribute("edges")) os << " " << e;
            os << " );\n";
        }
        os << ind << "}\n";
    }

    CarriedQuantity readState(const std::string& name,
                              const Dictionary& d) const override
    {
        std::map<std::string, std::vector<scalar>> at;
        at["axis"] = d.lookupList("diameter");
        if (d.found("edges")) at["edges"] = d.lookupList("edges");
        return create(name, "solid", d.lookupList("massFrac"), at);
    }

    void publishKpis(std::map<std::string, scalar>& kpis,
                     const CarriedQuantity& q) const override
    {
        //  The blend's moments from the one home, and the sum of its
        //  fractions (the mass closure of the blending, 1 to round-off).
        const ParticleSizeDistribution p = psdOf(q);
        if (p.empty()) return;
        publishPsdKpis(kpis, "psd_", p);
        scalar sw = 0.0;
        for (auto v : p.massFrac) sw += v;
        kpis["psd_massFractionSum"] = sw;
    }

    void report(std::ostream& os, const CarriedQuantity& q) const override
    {
        os << q.name << " [sizeDistribution, carrier solid] "
           << q.values.size() << " classes";
    }
};

} // namespace

// ---------------------------------------------------------------------------
//  The factory
// ---------------------------------------------------------------------------
void CarriedKind::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<CarriedKind> CarriedKind::New(const std::string& kind)
{
    auto it = registry().find(kind);
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error("carried quantity: unknown kind '" + kind
            + "'.  The closed list is:" + (avail.empty() ? " (none registered)"
                                                         : avail));
    }
    return it->second();
}

std::vector<std::string> CarriedKind::availableTypes()
{
    std::vector<std::string> names;
    for (const auto& kv : registry()) names.push_back(kv.first);
    return names;
}

void CarriedKind::registerBuiltins()
{
    //  EXPLICIT, one readable place; idempotent because three of the five
    //  binaries reach a stream reader through more than one entry.
    registerType("sizeDistribution",
        [] { return std::make_unique<SizeDistributionKind>(); });
    registerType("materialMass",
        [] { return std::make_unique<MaterialMassKind>(); });
    registerType("chainMoment",
        [] { return std::make_unique<ChainMomentKind>(); });
}

CarriedQuantity CarriedKind::create(const std::string& name,
                                    const std::string& carrier,
                                    const std::vector<scalar>& values,
                                    const std::map<std::string,
                                        std::vector<scalar>>& attributes) const
{
    CarriedQuantity q;
    q.kind       = kindName();
    q.name       = name;
    q.carrier    = carrier;
    q.values     = values;
    q.attributes = attributes;
    q.unit       = unitOf(q);
    validate(q);
    return q;
}

// ---------------------------------------------------------------------------
//  Wire, stream, state file
// ---------------------------------------------------------------------------
static const char* const kPsdName = "particleSizeDistribution";

//  A stream's own size distribution as a carried quantity (weight 0: a
//  stream does not know the molar masses that would weigh it).
static CarriedQuantity psdQuantity(const ParticleSizeDistribution& psd)
{
    std::map<std::string, std::vector<scalar>> at;
    at["axis"] = psd.diameter;
    if (!psd.edges.empty()) at["edges"] = psd.edges;
    return CarriedKind::New("sizeDistribution")
        ->create(kPsdName, "solid", psd.massFrac, at);
}

void carriedToDict(Dictionary& d, const ProcessStream& s)
{
    if (s.carried.empty()) return;
    auto cd = std::make_shared<Dictionary>("carried");
    for (const auto& q : s.carried)
    {
        auto qd = std::make_shared<Dictionary>(q.name);
        qd->insert("kind", q.kind);
        qd->insert("carrier", q.carrier);
        if (q.attributes.count("order"))
            qd->insert("order", q.attributeScalar("order", -1.0));
        qd->insert("values", q.values);
        cd->insert(q.name, qd);
    }
    d.insert("carried", cd);
}

std::vector<CarriedQuantity> carriedOfInlet(const Dictionary& d, scalar solidMass)
{
    std::vector<CarriedQuantity> out;
    if (solidMass > 0.0)
    {
        //  Solid-bearing: the psd quantity exists, EMPTY when the inlet has
        //  no distribution (the mixing law refuses that beside a gridded one).
        std::vector<scalar> values;
        std::map<std::string, std::vector<scalar>> at;
        at["weight"] = { solidMass };
        if (d.found("solids"))
        {
            auto sol = d.subDict("solids");
            if (sol->found("diameters"))
            {
                at["axis"] = sol->lookupList("diameters");
                values     = sol->lookupList("massFractions");
                if (sol->found("sizeEdges")) at["edges"] = sol->lookupList("sizeEdges");
            }
        }
        out.push_back(CarriedKind::New("sizeDistribution")
                          ->create(kPsdName, "solid", values, at));
    }
    if (d.found("carried"))
    {
        auto cd = d.subDict("carried");
        for (const auto& key : cd->keys())
        {
            auto qd = cd->subDict(key);
            out.push_back(CarriedKind::New(qd->lookupWord("kind"))
                              ->readState(key, *qd));
        }
    }
    return out;
}

std::vector<CarriedQuantity> carriedOfStream(const ProcessStream& s)
{
    std::vector<CarriedQuantity> out;
    if (!s.psd.empty())
    {
        out.push_back(psdQuantity(s.psd));
    }
    for (const auto& q : s.carried) out.push_back(q);
    return out;
}

void applyCarried(ProcessStream& s, const std::vector<CarriedQuantity>& qs)
{
    for (const auto& q : qs)
    {
        if (q.kind == "sizeDistribution")
        {
            if (q.values.empty()) continue;
            s.psd.diameter = q.attribute("axis");
            s.psd.massFrac = q.values;
            s.psd.edges    = q.attribute("edges");
        }
        else
        {
            auto it = std::find_if(s.carried.begin(), s.carried.end(),
                [&](const CarriedQuantity& c) { return c.name == q.name; });
            if (it != s.carried.end()) *it = q; else s.carried.push_back(q);
        }
    }
}

std::vector<CarriedQuantity>
mixCarried(const std::vector<std::pair<std::string,
                                       std::vector<CarriedQuantity>>>& inlets,
           const CarriedMixContext& ctx)
{
    std::vector<std::string> names;
    for (const auto& in : inlets)
        for (const auto& q : in.second)
            if (std::find(names.begin(), names.end(), q.name) == names.end())
                names.push_back(q.name);
    std::vector<CarriedQuantity> out;
    for (const auto& name : names)
    {
        std::vector<CarriedPart> parts;
        std::string kind;
        for (const auto& in : inlets)
            for (const auto& q : in.second)
                if (q.name == name)
                {
                    if (kind.empty()) kind = q.kind;
                    else if (kind != q.kind)
                        throw std::runtime_error("carried quantity '" + name
                            + "' is of kind '" + kind + "' on one inlet and '"
                            + q.kind + "' on inlet '" + in.first + "'.");
                    parts.push_back({ in.first, &q });
                }
        if (auto m = CarriedKind::New(kind)->mix(parts, ctx))
            out.push_back(std::move(*m));
    }
    return out;
}

std::vector<CarriedQuantity>
divideCarried(const std::vector<CarriedQuantity>& qs, scalar f)
{
    std::vector<CarriedQuantity> out;
    for (const auto& q : qs) out.push_back(CarriedKind::New(q.kind)->divide(q, f));
    return out;
}

void writeCarriedBlock(std::ostream& os, const ProcessStream& s)
{
    if (s.carried.empty()) return;
    os << "\ncarried\n{\n";
    for (const auto& q : s.carried)
        CarriedKind::New(q.kind)->writeState(os, q, "    ");
    os << "}\n";
}

void readCarriedBlock(const Dictionary& d, ProcessStream& s)
{
    s.carried.clear();
    if (!d.found("carried")) return;                 // old file: none carried
    auto cd = d.subDict("carried");
    for (const auto& key : cd->keys())
    {
        auto qd = cd->subDict(key);
        const std::string kind = qd->lookupWord("kind");
        auto k = CarriedKind::New(kind);
        if (k->storedInStreamPsd())
            throw std::runtime_error("carried quantity '" + key + "': kind '"
                + kind + "' lives in the stream's own psd block, not in"
                  " `carried {}`.");
        s.carried.push_back(k->readState(key, *qd));
    }
}

void writePsdState(std::ostream& os, const ParticleSizeDistribution& psd,
                   const std::string& indent)
{
    CarriedKind::New("sizeDistribution")->writeState(os, psdQuantity(psd), indent);
}

void reportCarried(std::ostream& os, const ProcessStream& s,
                   const std::string& indent)
{
    for (const auto& q : s.carried)
    {
        os << indent;
        CarriedKind::New(q.kind)->report(os, q);
        os << "\n";
    }
}

void publishCarriedKpis(std::map<std::string, scalar>& kpis,
                        const std::vector<CarriedQuantity>& qs)
{
    for (const auto& q : qs) CarriedKind::New(q.kind)->publishKpis(kpis, q);
}

scalar carriedTotal(const std::vector<const ProcessStream*>& streams,
                    const std::string& name)
{
    scalar t = 0.0;
    for (const auto* s : streams)
        for (const auto& q : s->carried)
            if (q.name == name) t += CarriedKind::New(q.kind)->total(q);
    return t;
}

std::map<std::string, scalar> carriedMassFlows(const ProcessStream& s)
{
    std::map<std::string, scalar> out;
    for (const auto& q : s.carried)
    {
        const auto k = CarriedKind::New(q.kind);
        if (k->totalIsMass()) out[q.name] += k->total(q);
    }
    return out;
}

void refuseCarriedInStateTree(const std::filesystem::path& zeroDir,
                              const std::string&           driver)
{
    namespace fs = std::filesystem;
    if (!fs::exists(zeroDir)) return;
    std::vector<fs::path> files;
    for (const auto& e : fs::recursive_directory_iterator(zeroDir))
        if (e.is_regular_file()) files.push_back(e.path());
    std::sort(files.begin(), files.end());
    for (const auto& f : files)
    {
        std::ifstream in(f);
        std::string line;
        while (std::getline(in, line))
        {
            const auto b = line.find_first_not_of(" \t");
            if (b == std::string::npos || line.compare(b, 2, "//") == 0) continue;
            for (const char* key : { "carried", "particleSizeDistribution" })
            {
                const std::size_t n = std::string(key).size();
                if (line.compare(b, n, key) == 0
                    && (b + n == line.size()
                        || !(std::isalnum(static_cast<unsigned char>(line[b + n]))
                             || line[b + n] == '_')))
                    throw std::runtime_error(driver + ": the state file '"
                        + f.string() + "' carries a `" + key + "` block, and"
                        " no unit of " + driver + " models a carried quantity"
                        " (a size distribution, a material's mass, a polymer's"
                        " moments: design record 5b/5d).  It would be dropped"
                        " at the first transfer, so it is refused here.  Take"
                        " it off the file, or run the case in choupoSolve.");
            }
        }
    }
}

} // namespace Choupo
