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
    This file is part of Choupo.  GPL-3.0-or-later; see LICENSE and NOTICE.

    SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

//  The nozzle schedule (DEV.md 4c C444); the rules are in NozzleSchedule.H.

#include "postProcessing/layout/NozzleSchedule.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <map>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {
namespace nozzleSchedule {

namespace {

constexpr scalar kPsiPerBar = 14.5037738;   // unit conversion, not a datum

std::string fmt(scalar v)
{
    char b[48];
    std::snprintf(b, sizeof(b), "%.6g", static_cast<double>(v));
    return b;
}

void needText(const DictPtr& b, const char* block, const char* key)
{
    if (!b->found(key) || b->lookupWord(key).empty())
        throw std::runtime_error(std::string("nozzleDesign: `") + block + " { "
            + key + " \"...\"; }` is not declared -- a number the case chose"
              " carries where it came from and why it is this plant's.");
}

DictPtr need(const DictPtr& d, const char* name, const std::string& where)
{
    if (!d->found(name) || !std::holds_alternative<DictPtr>(d->entryValue(name)))
        throw std::runtime_error("nozzleDesign: `" + where + name
            + " { ... }` is not declared.  Nothing in the nozzle schedule is"
              " taken by default: the case declares each rule it rates by.");
    return d->subDict(name);
}

struct Size { std::string name; scalar nps; scalar idLightest; };

struct RatingRow { scalar upToF; std::vector<scalar> psig; };
struct RatingTable
{
    std::string material, group, source;
    std::vector<int> classes;
    std::vector<RatingRow> rows;
    scalar minF = 0;
};

struct ManwayRule { std::string equipment, where, source; int count = 0; };

void add(std::string& to, const std::string& what)
{
    to += (to.empty() ? "" : "; ") + what;
}

} // namespace

void evaluate(const Dictionary& layoutDict, SimulationResult& result, int verbosity)
{
    if (!layoutDict.found("nozzleDesign")) return;
    PlantLayoutRecord& L = result.layout;
    if (!L.present()) return;
    const DictPtr ND = layoutDict.subDict("nozzleDesign");
    const std::string W = "nozzleDesign.";

    // ---- the size table (the line list's own) --------------------------
    std::vector<Size> sizes;
    {
        //  The size table is the line list's where the case declares one; a case
        //  with no `lineDesign {}` declares its own `nozzleDesign.nominalSizes {}`
        //  (same grammar) and its nozzles are then sized by the item's criterion
        //  alone, a line having no sheet.
        const DictPtr ns = layoutDict.found("lineDesign")
            ? layoutDict.subDict("lineDesign")->subDict("nominalSizes")
            : need(ND, "nominalSizes", W);
        if (!layoutDict.found("lineDesign"))
        {
            needText(ns, "nominalSizes", "source"); needText(ns, "nominalSizes", "reason");
        }
        for (const DictPtr& s : ns->lookupDictList("sizes"))
        {
            Size z;
            z.nps = s->lookupScalar("nominalSize");
            z.name = fmt(z.nps);
            const scalar od = s->lookupScalar("outsideDiameter", Dims::length);
            scalar wmin = 1e300;
            for (const DictPtr& c : s->lookupDictList("schedules"))
                wmin = std::min(wmin, c->lookupScalar("wall", Dims::length));
            z.idLightest = od - 2.0 * wmin;
            sizes.push_back(z);
        }
        std::sort(sizes.begin(), sizes.end(),
                  [](const Size& a, const Size& b) { return a.nps < b.nps; });
    }

    // ---- the flange rating tables --------------------------------------
    const DictPtr fr = need(ND, "flangeRating", W);
    needText(fr, "flangeRating", "source");
    needText(fr, "flangeRating", "reason");
    std::map<std::string, RatingTable> tables;
    if (!fr->hasDictList("tables"))
        throw std::runtime_error("nozzleDesign.flangeRating: `tables ( { material; group;"
            " source; minF; classes ( ... ); rows ( { upToF; psig ( ... ); } ... ); } ... );`"
            " is not declared.");
    for (const DictPtr& t : fr->lookupDictList("tables"))
    {
        RatingTable r;
        r.material = t->lookupWord("material");
        r.group    = t->lookupWord("group");
        r.source   = t->lookupWord("source");
        r.minF     = t->lookupScalar("minF");
        for (scalar c : t->lookupList("classes")) r.classes.push_back(int(std::lround(c)));
        for (const DictPtr& w : t->lookupDictList("rows"))
        {
            RatingRow rr;
            rr.upToF = w->lookupScalar("upToF");
            rr.psig  = w->lookupList("psig");
            if (rr.psig.size() != r.classes.size())
                throw std::runtime_error("nozzleDesign.flangeRating: table for "
                    + r.material + ", row upToF " + fmt(rr.upToF) + " has "
                    + std::to_string(rr.psig.size()) + " pressures for "
                    + std::to_string(r.classes.size()) + " classes.");
            r.rows.push_back(rr);
        }
        std::sort(r.rows.begin(), r.rows.end(),
                  [](const RatingRow& a, const RatingRow& b) { return a.upToF < b.upToF; });
        if (r.rows.empty() || r.classes.empty())
            throw std::runtime_error("nozzleDesign.flangeRating: table for " + r.material + " is empty.");
        tables[r.material] = r;
    }

    // ---- facing ---------------------------------------------------------
    const DictPtr fc = need(ND, "facing", W);
    needText(fc, "facing", "source"); needText(fc, "facing", "reason");
    const std::string facingDefault = fc->lookupWord("default");
    const int ringFromClass = fc->found("ringJointFromClass")
        ? int(std::lround(fc->lookupScalar("ringJointFromClass"))) : 0;

    // ---- design temperature --------------------------------------------
    const DictPtr dt = need(ND, "designTemperature", W);
    needText(dt, "designTemperature", "source"); needText(dt, "designTemperature", "reason");
    const scalar tMargin = dt->lookupScalar("margin");
    if (!(tMargin >= 0)) throw std::runtime_error("nozzleDesign.designTemperature: margin must be >= 0 (kelvin).");

    // ---- manways --------------------------------------------------------
    const DictPtr mw = need(ND, "manway", W);
    needText(mw, "manway", "source"); needText(mw, "manway", "reason");
    const scalar entryMinD  = mw->lookupScalar("entryMinDiameter", Dims::length);
    const scalar mwDiameter = mw->lookupScalar("diameter", Dims::length);
    const scalar mwNps      = mw->lookupScalar("nominalSize");
    const DictPtr insp = need(mw, "inspection", "nozzleDesign.manway.");
    needText(insp, "inspection", "source"); needText(insp, "inspection", "reason");
    const scalar inspNps = insp->lookupScalar("nominalSize");
    std::vector<ManwayRule> mrules;
    if (mw->hasDictList("openings"))
        for (const DictPtr& o : mw->lookupDictList("openings"))
        {
            ManwayRule m;
            needText(o, "manway.openings", "source");
            needText(o, "manway.openings", "reason");
            m.equipment = o->lookupWord("equipment");
            m.where     = o->lookupWord("where");
            m.count     = int(std::lround(o->lookupScalar("count")));
            m.source    = o->lookupWord("source");
            mrules.push_back(m);
        }

    auto lineSheetOf = [&](const std::string& pipeId) -> const LineSheet* {
        for (const LineSheet& s : L.lines) if (s.pipeId == pipeId) return &s;
        return nullptr;
    };
    auto layoutItem = [&](const std::string& id) -> const LayoutItem* {
        for (const LayoutItem& i : L.items) if (i.id == id) return &i;
        return nullptr;
    };
    auto sizeFor = [&](scalar dReq) -> const Size* {
        for (const Size& s : sizes) if (s.idLightest >= dReq * (1.0 - 1e-12)) return &s;
        return nullptr;
    };
    auto sizeByNps = [&](scalar nps) -> const Size* {
        for (const Size& s : sizes) if (std::fabs(s.nps - nps) < 1e-9) return &s;
        return nullptr;
    };

    auto rate = [&](NozzleRow& r, const EquipmentSizing& sz, scalar Pg, scalar T, scalar Town = 0)
    {
        r.designP = Pg; r.designT = T;
        auto it = tables.find(sz.material);
        if (it == tables.end())
        {
            add(r.why, "flange class: no rating table is declared for material "
                       + (sz.material.empty() ? std::string("(not stated)") : sz.material));
            return;
        }
        const RatingTable& tb = it->second;
        const scalar TF = (T - 273.15) * 9.0 / 5.0 + 32.0;
        const RatingRow* row = nullptr;
        for (const RatingRow& w : tb.rows) if (w.upToF >= TF) { row = &w; break; }
        if (!row)
        {
            add(r.why, "flange class: design temperature " + fmt(TF)
                       + " F is above the last row of the " + tb.material + " table");
            return;
        }
        const scalar psig = Pg / 1e5 * kPsiPerBar;
        int cls = 0;
        for (std::size_t k = 0; k < tb.classes.size(); ++k)
            if (row->psig[k] >= psig) { cls = tb.classes[k]; break; }
        if (!cls)
        {
            //  C519: say WHAT is uncovered and what is left to decide, never a bare "above".
            const std::size_t top = tb.classes.size() - 1;
            std::string w = "flange class: no class of the " + tb.material + " table holds "
                + fmt(psig) + " psig at the design temperature " + fmt(TF) + " F ("
                + fmt(T) + " K): the table's highest class, " + std::to_string(tb.classes[top])
                + ", holds " + fmt(row->psig[top]) + " psig there.  To DECIDE: a class above the table's,"
                " a lower design pressure for this nozzle, or another material with its own rating table";
            if (Town > 0 && Town < T - 1e-9)
            {
                const scalar TFo = (Town - 273.15) * 9.0 / 5.0 + 32.0;
                for (const RatingRow& w2 : tb.rows)
                    if (w2.upToF >= TFo)
                    {
                        for (std::size_t k = 0; k < tb.classes.size(); ++k)
                            if (w2.psig[k] >= psig)
                            {
                                w += ".  At this nozzle's OWN stream temperature plus the margin, "
                                     + fmt(Town) + " K (" + fmt(TFo) + " F), class "
                                     + std::to_string(tb.classes[k]) + " would hold it: the item-wide design"
                                     " temperature (the hottest connected stream) is what leaves it uncovered";
                                break;
                            }
                        break;
                    }
            }
            add(r.why, w);
            return;
        }
        r.flangeClass = std::to_string(cls);
        r.facing = (ringFromClass > 0 && cls >= ringFromClass) ? "RTJ" : facingDefault;
        r.basis += "; class " + r.flangeClass + " from " + tb.group + " (" + tb.source + ") at "
                 + fmt(TF) + " F: the first class whose working pressure holds " + fmt(psig) + " psig";
        if (TF < tb.minF)
            add(r.why, "design temperature " + fmt(TF) + " F is below the table's " + fmt(tb.minF)
                       + " F minimum: the low-temperature rating of the material is not in the table");
    };

    for (const auto& kv : result.sizings)
    {
        const std::string& itemKey = kv.first;
        const EquipmentSizing& sz = kv.second;
        const LayoutItem* li = layoutItem(itemKey);
        if (!li || li->nonProcess) continue;

        NozzleSchedule S;
        S.item = itemKey;

        // the hottest stream on the item, for the design temperature
        scalar Tmax = 0;
        std::vector<const LayoutPipe*> mine;
        for (const LayoutPipe& p : L.pipes)
            if (p.fromPort.item == itemKey || p.toPort.item == itemKey)
            {
                mine.push_back(&p);
                auto st = result.streams.find(p.stream);
                if (st != result.streams.end()) Tmax = std::max(Tmax, st->second.T);
            }
        const scalar Tdes = Tmax > 0 ? Tmax + tMargin : 0.0;

        // the item's design pressure, gauge [Pa]
        scalar PgItem = 0; bool havePItem = false;
        {
            auto v = sz.values.find("pressureDesign");
            if (v != sz.values.end()) { PgItem = v->second * 1e5; havePItem = true; }
        }

        int nN = 0;
        for (const LayoutPipe* p : mine)
        {
            for (int end = 0; end < 2; ++end)
            {
                const LayoutPort& port = end == 0 ? p->fromPort : p->toPort;
                if (port.item != itemKey) continue;
                NozzleRow r;
                r.kind = "process";
                r.mark = "N" + std::to_string(++nN);
                r.service = port.port;
                r.direction = end == 0 ? "out" : "in";
                r.stream = p->stream;
                const LineSheet* ls = lineSheetOf(p->id());
                if (ls) r.line = ls->id();
                // orientation, from where the layout put the nozzle on the item
                r.orientation = "side";
                if (port.point.size() == 3 && li->dz > 0)
                {
                    const scalar zr = (port.point[2] - li->z) / li->dz;
                    if (zr >= 0.9) r.orientation = "top";
                    else if (zr <= 0.1) r.orientation = "bottom";
                }
                // size
                const Size* lineS = (ls && ls->sized) ? sizeByNps(ls->nps) : nullptr;
                if (lineS) r.lineSize = lineS->name;
                const Size* eqS = nullptr;
                scalar dEq = 0; std::string eqKey;
                {
                    std::vector<std::string> keys = { "d_nozzle_" + port.port };
                    if (port.port == "inlet") keys.push_back("d_nozzle_feed");
                    for (const std::string& key : keys)
                    {
                        auto v = sz.values.find(key);
                        if (v != sz.values.end()) { dEq = v->second; eqKey = key; break; }
                    }
                }
                if (dEq > 0)
                {
                    eqS = sizeFor(dEq);
                    if (eqS) r.equipmentSize = eqS->name;
                    else add(r.why, "the item's " + eqKey + " of " + fmt(dEq * 1000)
                                    + " mm exceeds the largest declared size");
                }
                const Size* pick = nullptr;
                if (lineS && eqS) { pick = lineS->nps >= eqS->nps ? lineS : eqS; r.sizeFrom = "line+equipment"; }
                else if (lineS)   { pick = lineS; r.sizeFrom = "line"; }
                else if (eqS)     { pick = eqS;   r.sizeFrom = "equipment"; }
                else              { r.sizeFrom = "none"; }
                if (pick)
                {
                    r.nominalSize = pick->name; r.nps = pick->nps;
                    if (lineS && std::fabs(lineS->nps - pick->nps) > 1e-9)
                        r.reducer = "reducer " + lineS->name + " in line to " + pick->name + " in nozzle";
                    else if (!lineS)
                        r.reducer = "line not sized: the nozzle is the item's criterion alone";
                    r.basis = "size " + r.nominalSize + " in: "
                        + (lineS ? "line " + r.line + " is " + lineS->name + " in" : std::string("no sized line"))
                        + (eqS ? "; the item's " + eqKey + " asks " + fmt(dEq * 1000) + " mm = " + eqS->name + " in"
                               : std::string());
                }
                else
                    add(r.why, "size: no sized line and no criterion of the item for this port");
                // pressure and temperature
                scalar Pg = 0; std::string pFrom;
                if (havePItem) { Pg = PgItem; pFrom = "the item's pressureDesign"; }
                else if (ls && ls->sized) { Pg = ls->designPressure; pFrom = "the line's design pressure"; }
                if (pFrom.empty() || Tdes <= 0)
                    add(r.why, "flange class: no design pressure or temperature");
                else
                {
                    r.basis += "; design P " + fmt(Pg / 1e5) + " bar gauge (" + pFrom + "), design T "
                             + fmt(Tdes) + " K (the hottest connected stream + " + fmt(tMargin) + " K)";
                    scalar Town = 0;
                    {
                        auto st = result.streams.find(r.stream);
                        if (st != result.streams.end()) Town = st->second.T + tMargin;
                    }
                    rate(r, sz, Pg, Tdes, Town);
                }
                S.rows.push_back(r);
            }
        }

        // manways / inspection openings, by the case's rule for this kind
        std::string kind = sz.equipmentType;
        if (kind == "vessel" && sz.equipmentTag == "shell") kind = "columnShell";
        scalar D = 0;
        { auto v = sz.values.find("D"); if (v != sz.values.end()) D = v->second; }
        //  A storage tank's sizing publishes a volume, not a diameter: the diameter
        //  of its placed cylinder (the layout's own footprint) is then the one read.
        std::string dFrom = "the sizing's D";
        if (!(D > 0) && li->dx > 0)
        {
            if (li->shape == "cylinder") { D = li->dx; dFrom = "the placed cylinder's diameter"; }
            else if (li->dy > 0) { D = std::min(li->dx, li->dy); dFrom = "the smaller side of the placed footprint, which stands for the round tank"; }
        }
        int nM = 0, nH = 0;
        bool anyRule = false;
        for (const ManwayRule& m : mrules)
        {
            if (m.equipment != kind) continue;
            anyRule = true;
            if (!(D > 0))
            {
                S.notes.push_back("manway rule for " + kind + " not applied: neither the sizing nor the placed item gives a diameter to compare with the entry limit");
                continue;
            }
            for (int k = 0; k < m.count; ++k)
            {
                NozzleRow r;
                const bool enter = D >= entryMinD;
                r.kind = enter ? "manway" : "inspection";
                r.mark = enter ? "M" + std::to_string(++nM) : "H" + std::to_string(++nH);
                r.service = r.kind;
                r.direction = "-";
                r.orientation = m.where == "roof" ? "top" : "side";
                r.sizeFrom = "declared";
                const scalar nps = enter ? mwNps : inspNps;
                if (const Size* z = sizeByNps(nps)) { r.nps = z->nps; r.nominalSize = z->name; }
                else { r.nps = nps; r.nominalSize = fmt(nps); }
                r.basis = std::string(enter ? "manway " : "inspection opening ") + r.nominalSize + " in, "
                        + m.where + ": count " + std::to_string(m.count) + " for " + kind + " (" + m.source + "); "
                        + (enter ? "D " + fmt(D) + " m (" + dFrom + ") is at least the entry limit " + fmt(entryMinD)
                                   + " m (clear opening " + fmt(mwDiameter) + " m)"
                                 : "D " + fmt(D) + " m (" + dFrom + ") is below the entry limit " + fmt(entryMinD)
                                   + " m: nobody can enter, so an inspection opening replaces the manway");
                if (havePItem && Tdes > 0)
                {
                    r.basis += "; design P " + fmt(PgItem / 1e5) + " bar gauge (the item's pressureDesign), design T "
                             + fmt(Tdes) + " K";
                    rate(r, sz, PgItem, Tdes);
                }
                else
                    add(r.why, "flange class: no design pressure or temperature for this item");
                S.rows.push_back(r);
            }
        }
        if (!anyRule)
            S.notes.push_back("no manway rule is declared for equipment kind " + kind);
        S.notes.push_back("not modelled: nozzle reinforcement, the minimum metal temperature of the flange,"
                          " the standard's flange dimensions and bolting, projection and elevation,"
                          " instrument and drain connections, a machine's own flange");
        L.nozzles.push_back(S);
    }

    L.nozzleBasis = "nozzle schedule: size from the line sheet and the item's own criterion (a mismatch is a reducer),"
                    " flange class from the case's pressure-temperature table at the design pressure and temperature,"
                    " manways from the case's rule per equipment kind (nozzleDesign {})";
    if (verbosity >= 2)
    {
        int n = 0, nm = 0, nr = 0;
        for (const auto& s : L.nozzles)
            for (const auto& r : s.rows) { ++n; if (r.kind != "process") ++nm; if (r.flangeClass.empty()) ++nr; }
        std::printf("  [nozzles] %zu items, %d nozzles (%d manway/inspection), %d not rated (the case's nozzleDesign)\n",
                    L.nozzles.size(), n, nm, nr);
    }
}

} // namespace nozzleSchedule
} // namespace Choupo
