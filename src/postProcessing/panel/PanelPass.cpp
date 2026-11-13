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
File
    src/postProcessing/panel/PanelPass.cpp

Description
    See PanelPass.H.  Two halves: READ (the grammar, every refusal) and FACTS
    (the definitions of docs/design/operator-panel-in-the-case.md section 5).
\*---------------------------------------------------------------------------*/

#include "postProcessing/panel/PanelPass.H"

#include "core/DictAudit.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <map>
#include <set>
#include <sstream>
#include <stdexcept>
#include <variant>

namespace Choupo {
namespace panel {

namespace {

//  The one threshold of `neverApproached` is THIS RECORD'S default, not taken
//  from any practice (record section 5 and open item 4).
constexpr scalar kNeverApproachedFraction = 0.5;
//  `constant`: the last digit trajectory.csv writes (scientific, 8 decimals).
constexpr scalar kConstantTol = 1.0e-8;

[[noreturn]] void refuse(const std::string& m)
{
    throw std::runtime_error("panelDict: " + m);
}

std::string fmt(scalar v)
{
    std::ostringstream o;
    o << std::defaultfloat << std::setprecision(6) << v;
    return o.str();
}

std::string join(const std::vector<std::string>& v, const char* sep = ", ")
{
    std::string s;
    for (std::size_t i = 0; i < v.size(); ++i) s += (i ? sep : "") + v[i];
    return s;
}

// ---- dictionary readers (each refuses by name) ---------------------------

bool isScalar(const Dictionary& d, const std::string& k)
{
    return d.found(k) && std::holds_alternative<scalar>(d.entryValue(k));
}
bool isWord(const Dictionary& d, const std::string& k)
{
    return d.found(k) && std::holds_alternative<std::string>(d.entryValue(k));
}
bool isDict(const Dictionary& d, const std::string& k)
{
    return d.found(k) && std::holds_alternative<DictPtr>(d.entryValue(k));
}

void checkKeys(const Dictionary& d, const std::string& where,
               const std::vector<std::string>& allowed)
{
    for (const auto& k : d.keys())
    {
        if (std::find(allowed.begin(), allowed.end(), k) != allowed.end())
            continue;
        std::string hint;
        std::size_t best = 99;
        for (const auto& a : allowed)
        {
            const std::size_t e = dictAudit::editDistance(k, a);
            if (e < best) { best = e; hint = a; }
        }
        std::string m = "unknown key `" + k + "` in " + where + "; ";
        if (best <= 2 && best * 3 <= k.size() + 2)
            m += "did you mean `" + hint + "`?  ";
        m += "the keys read here are: " + join(allowed) + ".";
        refuse(m);
    }
}

scalar needScalar(const Dictionary& d, const std::string& k,
                  const std::string& where)
{
    if (!d.found(k))
        refuse(where + " has no `" + k + "`; write `" + k + " <number>;`.");
    if (!isScalar(d, k))
        refuse("`" + k + "` in " + where + " must be a number.");
    return d.lookupScalar(k);
}

scalar needTime(const Dictionary& d, const std::string& k,
                const std::string& where)
{
    const scalar v = needScalar(d, k, where);
    if (!d.hasDimensions(k) || !(d.dimensionsOf(k) == Dims::time))
        refuse("`" + k + "` in " + where + " is a time and carries its unit:"
               " write e.g. `" + k + " 2 min;` (a bare number has no unit).");
    return v;
}

std::string needText(const Dictionary& d, const std::string& k,
                     const std::string& where, const std::string& remedy)
{
    if (!isWord(d, k) || d.lookupWord(k).empty())
        refuse(where + " has no `" + k + "`; " + remedy);
    return d.lookupWord(k);
}

std::string optText(const Dictionary& d, const std::string& k,
                    const std::string& where)
{
    if (!d.found(k)) return "";
    if (!isWord(d, k))
        refuse("`" + k + "` in " + where + " must be a word or a quoted"
               " string.");
    return d.lookupWord(k);
}

DictPtr needBlock(const Dictionary& d, const std::string& k,
                  const std::string& where)
{
    if (!isDict(d, k))
        refuse(where + " needs a `" + k + " { ... }` block.");
    return d.subDict(k);
}

int needCount(const Dictionary& d, const std::string& k,
              const std::string& where)
{
    const scalar v = needScalar(d, k, where);
    if (v < 1 || std::floor(v) != v)
        refuse("`" + k + "` in " + where + " is a count: a positive integer.");
    return static_cast<int>(v);
}

// ---- the panel as read ----------------------------------------------------

struct Measure
{
    bool        controller = false;
    std::string owner;       // unit or controller name
    std::string cv;          // column key, or SP | PV | MV
    std::string cvUnit;      // the unit the CASE declares for it ("" = none)
    std::string column() const { return owner + "." + cv; }
};

struct Element
{
    std::string name, title, kind, reason, authored;
    Measure     meas, ref;
    bool        hasRef = false;
    bool        hasRange = false;  scalar rmin = 0, rmax = 0;
    bool        hasLow = false, hasHigh = false;  scalar low = 0, high = 0;
    std::string lsource, lreason;
    bool        hasAlarm = false;  std::string alarmOn;  scalar delay = 0;
    std::string action;
    bool        hasWords = false;  std::string wNormal, wLow, wHigh;
    std::vector<std::string> events;
    bool        hasPlace = false;  int pc = 0, pr = 0, pw = 0, ph = 0;
    bool hasLimit() const { return hasLow || hasHigh; }
};

struct Message
{
    std::string name, from, on, text;
};

Measure readMeasure(const Dictionary& e, const std::string& key,
                    const std::string& where, const Context& ctx)
{
    const std::string w = where + " `" + key + "`";
    DictPtr b = needBlock(e, key, where);
    if (key == "reference" && b->found("cvUnit"))
        refuse(w + ": `cvUnit` is declared on the `measurement`; the reference"
               " is drawn on the measurement's scale, in its unit.");
    checkKeys(*b, w, {"unit", "controller", "cv", "cvUnit"});
    const bool hasU = b->found("unit"), hasC = b->found("controller");
    if (hasU == hasC)
        refuse(w + " names a quantity by `unit <u>; cv <key>;` or by"
               " `controller <C>; cv SP|PV|MV;`, one of the two.");
    Measure m;
    m.cv = needText(*b, "cv", w, "name the published column, e.g. `cv U_V;`.");
    if (b->found("cvUnit"))
        m.cvUnit = needText(*b, "cvUnit", w, "write the unit the column is"
            " published in, read from the unit that publishes it, e.g."
            " `cvUnit \"V\";` (`\"-\"` for a dimensionless one), or delete the"
            " line.");
    if (hasU)
    {
        m.owner = needText(*b, "unit", w, "name a unit of the flowsheet.");
        if (std::find(ctx.units.begin(), ctx.units.end(), m.owner)
            == ctx.units.end())
            refuse(w + ": unit `" + m.owner + "` is not a unit of this"
                   " flowsheet (units: " + join(ctx.units) + ").  Correct the"
                   " name; a typo would otherwise draw an empty element.");
    }
    else
    {
        m.controller = true;
        m.owner = needText(*b, "controller", w, "name a controller.");
        bool known = false;
        for (const auto& c : ctx.controllers)
            if (c.name == m.owner) known = true;
        if (!known)
        {
            std::vector<std::string> cn;
            for (const auto& c : ctx.controllers) cn.push_back(c.name);
            refuse(w + ": controller `" + m.owner + "` is not declared in"
                   " this flowsheet (controllers: "
                   + (cn.empty() ? std::string("none") : join(cn)) + ").");
        }
        if (m.cv != "SP" && m.cv != "PV" && m.cv != "MV")
            refuse(w + ": a controller publishes SP, PV and MV; `cv "
                   + m.cv + "` is none of them.");
    }
    return m;
}

Element readElement(const Dictionary& e, std::size_t index, const Context& ctx)
{
    const std::string where = "elements[" + std::to_string(index) + "]";
    checkKeys(e, where,
              {"name", "title", "kind", "measurement", "reference", "range",
               "limit", "alarm", "words", "events", "place", "reason",
               "authored"});
    Element el;
    el.name = needText(e, "name", where, "every element has a unique name.");
    const std::string w = "element `" + el.name + "`";
    el.title = optText(e, "title", w);
    el.kind  = needText(e, "kind", w, "one of number, bar, trend, lamp.");
    if (el.kind != "number" && el.kind != "bar" && el.kind != "trend"
        && el.kind != "lamp")
        refuse(w + ": `kind " + el.kind + "` is not a display kind; the kinds"
               " are number, bar, trend, lamp.");
    el.meas = readMeasure(e, "measurement", w, ctx);

    if (e.found("reference"))
    {
        if (el.kind != "trend")
            refuse(w + ": `reference` (a second series drawn faint) belongs"
                   " to a `trend`, not a `" + el.kind + "`.");
        el.hasRef = true;
        el.ref = readMeasure(e, "reference", w, ctx);
    }

    if (e.found("range"))
    {
        DictPtr r = needBlock(e, "range", w);
        checkKeys(*r, w + " `range`", {"min", "max"});
        el.hasRange = true;
        el.rmin = needScalar(*r, "min", w + " `range`");
        el.rmax = needScalar(*r, "max", w + " `range`");
        if (!(el.rmin < el.rmax))
            refuse(w + ": `range` needs min < max (got " + fmt(el.rmin)
                   + " and " + fmt(el.rmax) + ").");
    }
    else if (el.kind == "bar" || el.kind == "lamp")
        refuse(w + ": a `" + el.kind + "` is drawn on a scale; add"
               " `range { min <v>; max <v>; }`.");

    if (e.found("limit"))
    {
        DictPtr l = needBlock(e, "limit", w);
        const std::string lw = w + " `limit`";
        checkKeys(*l, lw, {"low", "high", "source", "reason"});
        if (l->found("low"))  { el.hasLow  = true; el.low  = needScalar(*l, "low", lw); }
        if (l->found("high")) { el.hasHigh = true; el.high = needScalar(*l, "high", lw); }
        if (!el.hasLimit())
            refuse(lw + " has neither `low` nor `high`; a limit is at least"
                   " one end (both ends make a band).");
        if (el.hasLow && el.hasHigh && !(el.low < el.high))
            refuse(lw + ": `low` must be below `high`.");
        el.lsource = needText(*l, "source", lw,
            "say where the limit comes from (a record, a specification, an"
            " assumption written as such): `source \"...\";`.");
        el.lreason = needText(*l, "reason", lw,
            "say why this value is the limit: `reason \"...\";`.");
    }

    if (e.found("alarm"))
    {
        DictPtr a = needBlock(e, "alarm", w);
        const std::string aw = w + " `alarm`";
        checkKeys(*a, aw, {"on", "delay", "action"});
        if (!el.hasLimit())
            refuse(aw + ": an alarm needs a `limit { ... }` on the same"
                   " element -- it says which limit it watches.");
        el.hasAlarm = true;
        el.alarmOn = needText(*a, "on", aw, "one of high, low, outside.");
        if (el.alarmOn != "high" && el.alarmOn != "low"
            && el.alarmOn != "outside")
            refuse(aw + ": `on " + el.alarmOn + "` is not a trigger; the"
                   " triggers are high, low, outside.");
        if (el.alarmOn == "high" && !el.hasHigh)
            refuse(aw + ": `on high` needs `limit { high ...; }`.");
        if (el.alarmOn == "low" && !el.hasLow)
            refuse(aw + ": `on low` needs `limit { low ...; }`.");
        el.delay = a->found("delay") ? needTime(*a, "delay", aw) : 0.0;
        if (el.delay < 0) refuse(aw + ": `delay` cannot be negative.");
        el.action = needText(*a, "action", aw,
            "every alarm names the action it asks the operator for:"
            " `action \"...\";`.");
    }

    if (e.found("words"))
    {
        if (el.kind != "lamp")
            refuse(w + ": `words` (the lamp's state as a word) belongs to a"
                   " `lamp`, not a `" + el.kind + "`.");
        DictPtr x = needBlock(e, "words", w);
        checkKeys(*x, w + " `words`", {"normal", "low", "high"});
        el.hasWords = true;
        el.wNormal = optText(*x, "normal", w + " `words`");
        el.wLow    = optText(*x, "low", w + " `words`");
        el.wHigh   = optText(*x, "high", w + " `words`");
    }

    if (e.found("events"))
    {
        if (el.kind != "trend")
            refuse(w + ": `events` (markers on the time axis) belongs to a"
                   " `trend`, not a `" + el.kind + "`.");
        el.events = e.lookupWordList("events");
        for (const auto& n : el.events)
        {
            bool ok = false;
            if (n == "recipe") ok = ctx.hasRecipe;
            for (const auto& c : ctx.controllers) if (c.name == n) ok = true;
            if (!ok)
                refuse(w + ": `events` names `" + n + "`, which is neither a"
                       " controller of this flowsheet nor a `recipe` it"
                       " declares.");
        }
    }

    if (e.found("place"))
    {
        DictPtr p = needBlock(e, "place", w);
        checkKeys(*p, w + " `place`", {"column", "row", "width", "height"});
        el.hasPlace = true;
        el.pc = needCount(*p, "column", w + " `place`");
        el.pr = needCount(*p, "row", w + " `place`");
        el.pw = needCount(*p, "width", w + " `place`");
        el.ph = needCount(*p, "height", w + " `place`");
    }

    el.reason = needText(e, "reason", w,
        "say why this element is on the panel: `reason \"...\";`.");
    el.authored = optText(e, "authored", w);
    if (!el.authored.empty() && el.authored != "draft"
        && el.authored != "edited")
        refuse(w + ": `authored " + el.authored + "` is not a state; it is"
               " `draft` (as the drafter wrote it) or `edited` (a person"
               " shaped it).");
    return el;
}

// ---- row builders ---------------------------------------------------------

PanelRow row(const std::string& id) { PanelRow r; r.id = id; return r; }
void num(PanelRow& r, const std::string& k, scalar v) { r.numbers.push_back({k, v}); }
void word(PanelRow& r, const std::string& k, const std::string& v) { r.words.push_back({k, v}); }
void text(PanelRow& r, const std::string& k, const std::string& v) { if (!v.empty()) r.text.push_back({k, v}); }

bool beyond(const Element& e, const std::string& on, scalar v)
{
    const bool hi = e.hasHigh && v > e.high;
    const bool lo = e.hasLow && v < e.low;
    if (on == "high") return hi;
    if (on == "low")  return lo;
    return hi || lo;
}

} // namespace

std::vector<ControllerInfo> controllersOf(const Dictionary& fs)
{
    std::vector<ControllerInfo> out;
    if (!fs.found("controllers") || !fs.hasDictList("controllers")) return out;
    for (const auto& c : fs.lookupDictList("controllers"))
    {
        ControllerInfo ci;
        ci.name = c->lookupWordOrDefault("name", "");
        ci.type = c->lookupWordOrDefault("type", "");
        if (c->found("measurement") && isDict(*c, "measurement"))
        {
            DictPtr m = c->subDict("measurement");
            ci.pvUnit = m->lookupWordOrDefault("unit", "");
            ci.pvCv   = m->lookupWordOrDefault("cv", "");
        }
        out.push_back(ci);
    }
    return out;
}

PanelRecord evaluate(const Dictionary&      d,
                     const PublishedSeries& series,
                     const Context&         ctx)
{
    // ===================== READ ==========================================
    checkKeys(d, "system/panelDict",
              {"draft", "lock", "grid", "style", "elements", "messages"});

    PanelRecord rec;
    rec.present = true;

    std::string draftTool, draftEngine;
    if (d.found("draft"))
    {
        DictPtr b = needBlock(d, "draft", "system/panelDict");
        checkKeys(*b, "`draft`", {"tool", "engine"});
        draftTool = needText(*b, "tool", "`draft`", "write `tool panelDraft;`.");
        if (draftTool != "panelDraft")
            refuse("`draft { tool " + draftTool + "; }`: the only tool that"
                   " writes a draft is `panelDraft`.");
        draftEngine = needText(*b, "engine", "`draft`",
                               "write the engine version that drafted.");
    }
    bool locked = false;
    std::string lockBy, lockDate, lockReason;
    if (d.found("lock"))
    {
        DictPtr b = needBlock(d, "lock", "system/panelDict");
        checkKeys(*b, "`lock`", {"by", "date", "reason"});
        locked = true;
        lockBy = needText(*b, "by", "`lock`", "who locked the panel.");
        lockDate = needText(*b, "date", "`lock`", "when (a quoted date).");
        lockReason = needText(*b, "reason", "`lock`", "why it is locked.");
    }
    bool hasGrid = false;  int gridC = 0, gridR = 0;
    if (d.found("grid"))
    {
        DictPtr b = needBlock(d, "grid", "system/panelDict");
        checkKeys(*b, "`grid`", {"columns", "rows"});
        hasGrid = true;
        gridC = needCount(*b, "columns", "`grid`");
        gridR = needCount(*b, "rows", "`grid`");
    }
    std::string density;  bool hasWindow = false;  scalar window = 0;
    if (d.found("style"))
    {
        DictPtr b = needBlock(d, "style", "system/panelDict");
        checkKeys(*b, "`style`", {"density", "trendWindow"});
        density = optText(*b, "density", "`style`");
        if (!density.empty() && density != "compact" && density != "comfortable")
            refuse("`style { density " + density + "; }`: density is compact"
                   " or comfortable.");
        if (b->found("trendWindow"))
        {
            hasWindow = true;
            window = needTime(*b, "trendWindow", "`style`");
        }
    }

    if (!d.found("elements") || !d.hasDictList("elements"))
        refuse("system/panelDict declares no `elements ( { ... } ... );`; a"
               " panel with no element shows nothing.");
    std::vector<Element> els;
    {
        std::set<std::string> seen;
        std::size_t i = 0;
        for (const auto& ed : d.lookupDictList("elements"))
        {
            Element el = readElement(*ed, i++, ctx);
            if (!seen.insert(el.name).second)
                refuse("two elements are named `" + el.name + "`; the name is"
                       " the identity the facts and the golden rows use.");
            els.push_back(std::move(el));
        }
    }

    //  Placement: inside the grid, no two elements on one cell.
    {
        std::map<std::pair<int,int>, std::string> cell;
        for (const auto& el : els)
        {
            if (!el.hasPlace) continue;
            if (!hasGrid)
                refuse("element `" + el.name + "` has a `place` but the panel"
                       " declares no `grid { columns; rows; }`.");
            if (el.pc + el.pw - 1 > gridC || el.pr + el.ph - 1 > gridR)
                refuse("element `" + el.name + "` is placed outside the grid"
                       " (column " + std::to_string(el.pc) + ", width "
                       + std::to_string(el.pw) + " against "
                       + std::to_string(gridC) + " columns; row "
                       + std::to_string(el.pr) + ", height "
                       + std::to_string(el.ph) + " against "
                       + std::to_string(gridR) + " rows).");
            for (int c = el.pc; c < el.pc + el.pw; ++c)
                for (int r = el.pr; r < el.pr + el.ph; ++r)
                {
                    auto ins = cell.insert({{c, r}, el.name});
                    if (!ins.second)
                        refuse("elements `" + ins.first->second + "` and `"
                               + el.name + "` both stand on grid cell (column "
                               + std::to_string(c) + ", row "
                               + std::to_string(r) + ").");
                }
        }
    }

    std::vector<Message> msgs;
    if (d.found("messages"))
    {
        if (!d.hasDictList("messages"))
            refuse("`messages` is a list of `{ name; from; on; text; }`.");
        std::set<std::string> seen;
        std::size_t i = 0;
        for (const auto& md : d.lookupDictList("messages"))
        {
            const std::string w = "messages[" + std::to_string(i++) + "]";
            checkKeys(*md, w, {"name", "from", "on", "text"});
            Message m;
            m.name = needText(*md, "name", w, "every message has a name.");
            if (!seen.insert(m.name).second)
                refuse("two messages are named `" + m.name + "`.");
            m.on = needText(*md, "on", w, "one of high, low, outside, end.");
            if (m.on != "high" && m.on != "low" && m.on != "outside"
                && m.on != "end")
                refuse("message `" + m.name + "`: `on " + m.on + "` is not a"
                       " trigger; the triggers are high, low, outside, end.");
            m.text = needText(*md, "text", w, "the words the message sends.");
            m.from = optText(*md, "from", w);
            if (m.on != "end")
            {
                if (m.from.empty())
                    refuse("message `" + m.name + "` has no `from`; name the"
                           " element whose limit it watches (only `on end`"
                           " needs none).");
                const Element* src = nullptr;
                for (const auto& el : els) if (el.name == m.from) src = &el;
                if (!src)
                    refuse("message `" + m.name + "`: `from " + m.from
                           + "` names no element of this panel.");
                if (!src->hasLimit()
                    || (m.on == "high" && !src->hasHigh)
                    || (m.on == "low" && !src->hasLow))
                    refuse("message `" + m.name + "` fires on `" + m.on
                           + "` of element `" + m.from + "`, which declares"
                           " no such limit.");
            }
            msgs.push_back(std::move(m));
        }
    }

    // ===================== FACTS =========================================
    const std::size_t n = series.rows.size();
    const int tcol = series.column("t");
    if (tcol < 0 || n == 0)
        refuse("the run published no time series to read a panel from.");
    auto T = [&](std::size_t k) { return series.rows[k][tcol]; };

    auto addFact = [&](PanelRow r, const std::string& msg)
    {
        r.text.push_back({"explanation", msg});
        rec.logLines.push_back("[panel] " + r.id + ": " + msg);
        rec.facts.push_back(std::move(r));
    };

    {
        std::ostringstream o;
        o << "[panel] system/panelDict read: " << els.size() << " element(s), "
          << msgs.size() << " message(s); " << n << " written instant(s), "
          << fmt(T(0)) << " to " << fmt(T(n - 1)) << " s.  Crossings are"
          << " resolved to the write grid: an excursion shorter than one"
          << " writeInterval is not seen, and a crossing is seen at the next"
          << " write.  These are facts about the panel, not a grade.";
        rec.logLines.push_back(o.str());
    }

    //  Per element: its series and every fact about it.
    std::vector<std::vector<bool>>  active(els.size()); // alarm active
    std::vector<bool>               published(els.size(), false);
    std::map<std::string, std::vector<std::string>> alarmsOnColumn;

    for (std::size_t ei = 0; ei < els.size(); ++ei)
    {
        const Element& el = els[ei];
        const std::string col = el.meas.column();
        PanelRow er = row("element:" + el.name);
        word(er, "kind", el.kind);
        word(er, "column", col);
        if (!el.authored.empty()) word(er, "authored", el.authored);
        if (el.hasAlarm) word(er, "alarmOn", el.alarmOn);
        if (el.hasRef) word(er, "referenceColumn", el.ref.column());
        if (el.hasRange) { num(er, "rangeMin", el.rmin); num(er, "rangeMax", el.rmax); }
        if (el.hasLow)  num(er, "limitLow", el.low);
        if (el.hasHigh) num(er, "limitHigh", el.high);
        if (el.hasAlarm) num(er, "alarmDelay", el.delay);
        if (el.hasPlace)
        {
            num(er, "placeColumn", el.pc); num(er, "placeRow", el.pr);
            num(er, "placeWidth", el.pw);  num(er, "placeHeight", el.ph);
        }
        if (el.hasAlarm) alarmsOnColumn[col].push_back(el.name);

        const int ci = series.column(col);

        //  THE UNIT OF THE COLUMN.  The writer's, where it states one (a fact
        //  of the code that writes the column); else the case's `cvUnit`;
        //  else NONE is published -- never guessed from the key's name.  A
        //  declaration that disagrees with the writer is published beside it
        //  and said, not refused.
        {
            const std::string eu = series.unitOf(ci);
            const std::string& du = el.meas.cvUnit;
            if (!eu.empty())
            {
                word(er, "unit", eu);
                word(er, "unitFrom", "engine");
                if (!du.empty() && du != eu)
                {
                    word(er, "unitDeclared", du);
                    PanelRow f = row("unitDiffers:" + el.name);
                    word(f, "column", col);
                    word(f, "unit", eu);
                    word(f, "unitDeclared", du);
                    addFact(std::move(f), "element `" + el.name + "`: the case"
                            " declares `cvUnit \"" + du + "\"` for `" + col
                            + "`, which the run writes in " + eu + "; the"
                            " engine's unit is the one the numbers are in, and"
                            " the declaration is published beside it.");
                }
            }
            else if (!du.empty())
            {
                word(er, "unit", du);
                word(er, "unitFrom", "declared");
            }
        }
        if (el.hasRef && series.column(el.ref.column()) < 0)
        {
            PanelRow f = row("notPublished:" + el.name + ":reference");
            word(f, "column", el.ref.column());
            word(f, "role", "reference");
            addFact(std::move(f), "element `" + el.name + "`: its reference `"
                    + el.ref.column() + "` is not published by this run, so"
                    " the panel draws \"not published\" for it, never a zero;"
                    " the remedy is for the unit to publish it.");
        }
        if (ci < 0)
        {
            num(er, "published", 0);
            PanelRow f = row("notPublished:" + el.name);
            word(f, "column", col);
            addFact(std::move(f), "element `" + el.name + "`: the column `"
                    + col + "` is not published by this run, so the panel"
                    " draws \"not published\", never a zero; the remedy is"
                    " for the unit to publish it.");
            text(er, "title", el.title);
            text(er, "reason", el.reason);
            rec.elements.push_back(std::move(er));
            continue;
        }
        published[ei] = true;
        num(er, "published", 1);

        std::vector<scalar> v(n);
        for (std::size_t k = 0; k < n; ++k) v[k] = series.rows[k][ci];
        const scalar vmin = *std::min_element(v.begin(), v.end());
        const scalar vmax = *std::max_element(v.begin(), v.end());
        num(er, "min", vmin);  num(er, "max", vmax);
        num(er, "first", v.front());  num(er, "last", v.back());
        num(er, "n", static_cast<scalar>(n));

        //  constant
        if (n >= 2 && vmax - vmin <= kConstantTol * std::max<scalar>(1.0, std::abs(vmax)))
        {
            PanelRow f = row("constant:" + el.name);
            num(f, "value", v.front());
            num(f, "n", static_cast<scalar>(n));
            addFact(std::move(f), "element `" + el.name + "` (`" + col
                    + "`) did not change over the " + std::to_string(n)
                    + " written instants: it stays at " + fmt(v.front())
                    + ".  It shows a quantity that never moves in this run.");
        }
        //  outOfRange
        if (el.hasRange)
        {
            std::size_t cnt = 0;  scalar ext = 0, extDist = 0;
            for (std::size_t k = 0; k < n; ++k)
            {
                scalar over = 0;
                if (v[k] < el.rmin) over = el.rmin - v[k];
                else if (v[k] > el.rmax) over = v[k] - el.rmax;
                if (over > 0)
                {
                    ++cnt;
                    if (over > extDist) { extDist = over; ext = v[k]; }
                }
            }
            if (cnt > 0)
            {
                PanelRow f = row("outOfRange:" + el.name);
                num(f, "count", static_cast<scalar>(cnt));
                num(f, "extreme", ext);
                num(f, "rangeMin", el.rmin);  num(f, "rangeMax", el.rmax);
                addFact(std::move(f), "element `" + el.name + "`: "
                        + std::to_string(cnt) + " of " + std::to_string(n)
                        + " written values lie outside its scale ["
                        + fmt(el.rmin) + ", " + fmt(el.rmax) + "] (farthest "
                        + fmt(ext) + "); the scale hides part of the run.");
            }
        }
        //  limit facts
        if (el.hasLimit())
        {
            if (el.hasRange)
            {
                const bool lowOut = el.hasLow && (el.low < el.rmin || el.low > el.rmax);
                const bool highOut = el.hasHigh && (el.high < el.rmin || el.high > el.rmax);
                if (lowOut || highOut)
                {
                    PanelRow f = row("limitOutsideRange:" + el.name);
                    if (lowOut)  num(f, "limitLow", el.low);
                    if (highOut) num(f, "limitHigh", el.high);
                    num(f, "rangeMin", el.rmin);  num(f, "rangeMax", el.rmax);
                    addFact(std::move(f), "element `" + el.name + "`: its limit"
                            " lies outside its own scale [" + fmt(el.rmin)
                            + ", " + fmt(el.rmax) + "], so the limit cannot be"
                            " seen on the element.");
                }
            }
            std::vector<bool> vi(n, false);
            std::size_t k = 0;  std::size_t kFirst = 0, kLast = 0;
            for (std::size_t i = 0; i < n; ++i)
                if (beyond(el, "outside", v[i]))
                {
                    vi[i] = true;
                    if (k == 0) kFirst = i;
                    kLast = i;  ++k;
                }
            scalar d = 1e300;
            if (el.hasHigh) d = std::min(d, el.high - vmax);
            if (el.hasLow)  d = std::min(d, vmin - el.low);
            num(er, "violated", static_cast<scalar>(k));
            num(er, "closestApproach", d);
            scalar frac = 0;  bool hasFrac = el.hasRange;
            if (hasFrac)
            {
                frac = d / (el.rmax - el.rmin);
                num(er, "closestApproachFraction", frac);
            }
            const char* kindId = (k == 0) ? "neverViolated"
                               : (k == n) ? "alwaysViolated" : "violated";
            PanelRow f = row(std::string(kindId) + ":" + el.name);
            num(f, "violated", static_cast<scalar>(k));
            num(f, "n", static_cast<scalar>(n));
            if (k > 0) { num(f, "first", T(kFirst)); num(f, "last", T(kLast)); }
            num(f, "closestApproach", d);
            if (hasFrac) num(f, "closestApproachFraction", frac);
            std::string msg = "element `" + el.name + "`: its limit is ";
            if (k == 0)
                msg += "never violated in " + std::to_string(n) + " written"
                       " instants; the closest approach is " + fmt(d)
                       + (hasFrac ? " (" + fmt(frac) + " of its range)" : "")
                       + ".";
            else if (k == n)
                msg += "violated at every one of the " + std::to_string(n)
                       + " written instants, from t = " + fmt(T(kFirst))
                       + " s.";
            else
                msg += "violated at " + std::to_string(k) + " of "
                       + std::to_string(n) + " written instants; the first of"
                       " them is t = " + fmt(T(kFirst)) + " s and the last t = "
                       + fmt(T(kLast)) + " s (the instants between need not all"
                       " violate it).";
            addFact(std::move(f), msg);

            //  The periods the LIMIT is violated, on the write grid and with no
            //  delay, for EVERY element with a limit (alarm or not): an element
            //  without an alarm would otherwise carry no state at all, and on
            //  one with an alarm a delay can hide a violation the operator
            //  should still see.  `intervals` stays the alarm's.
            er.hasLimitIntervals = true;
            for (std::size_t i = 0; i < n; ++i)
                if (vi[i])
                {
                    if (i > 0 && vi[i - 1]) er.limitIntervals.back().second = T(i);
                    else er.limitIntervals.push_back({T(i), T(i)});
                }

            if (k == 0 && hasFrac && frac > kNeverApproachedFraction)
            {
                PanelRow g = row("neverApproached:" + el.name);
                num(g, "closestApproachFraction", frac);
                num(g, "threshold", kNeverApproachedFraction);
                addFact(std::move(g), "element `" + el.name + "`: the run never"
                        " came within " + fmt(kNeverApproachedFraction)
                        + " of the range of its limit (closest "
                        + fmt(frac) + "): the limit was not exercised by this"
                        " run.  The threshold " + fmt(kNeverApproachedFraction)
                        + " is a default of the design record, not taken from"
                        " a standard.");
            }

            //  alarm state on the write grid, with its delay
            if (el.hasAlarm)
            {
                std::vector<bool> av(n, false);
                scalar runStart = 0;  bool inRun = false;
                for (std::size_t i = 0; i < n; ++i)
                {
                    if (beyond(el, el.alarmOn, v[i]))
                    {
                        if (!inRun) { inRun = true; runStart = T(i); }
                        av[i] = (T(i) - runStart >= el.delay - 1e-9);
                    }
                    else inRun = false;
                }
                active[ei] = av;
                std::vector<std::pair<scalar, scalar>> iv;
                for (std::size_t i = 0; i < n; ++i)
                    if (av[i])
                    {
                        if (i > 0 && av[i - 1]) iv.back().second = T(i);
                        else iv.push_back({T(i), T(i)});
                    }
                er.hasIntervals = true;
                er.intervals = iv;
            }
        }
        text(er, "title", el.title);
        text(er, "reason", el.reason);
        text(er, "limitSource", el.lsource);
        text(er, "limitReason", el.lreason);
        text(er, "action", el.action);
        if (el.hasWords)
        {
            text(er, "wordNormal", el.wNormal);
            text(er, "wordLow", el.wLow);
            text(er, "wordHigh", el.wHigh);
        }
        rec.elements.push_back(std::move(er));
    }

    //  controllerWithoutElement
    for (const auto& c : ctx.controllers)
    {
        if (c.type != "PID") continue;
        bool shown = false;
        auto matches = [&](const Measure& m)
        {
            if (m.controller) return m.owner == c.name && m.cv == "PV";
            return !c.pvUnit.empty() && m.owner == c.pvUnit && m.cv == c.pvCv;
        };
        for (const auto& el : els)
            if (matches(el.meas) || (el.hasRef && matches(el.ref))) shown = true;
        if (!shown)
        {
            PanelRow f = row("controllerWithoutElement:" + c.name);
            word(f, "controller", c.name);
            if (!c.pvUnit.empty()) word(f, "measurement", c.pvUnit + "." + c.pvCv);
            addFact(std::move(f), "controller `" + c.name + "` is declared by"
                    " the flowsheet and no element shows its measured value"
                    " (neither `controller " + c.name + "; cv PV` nor its own"
                    " measurement): the operator cannot see the loop.");
        }
    }

    //  sameQuantityAlarms (the same published column only: two series that
    //  are functions of each other are NOT detected).  The id names an
    //  ELEMENT, like every other fact: the first of them in declaration
    //  order; the column is the word `column` and all of them `elements`.
    for (const auto& [col, names] : alarmsOnColumn)
        if (names.size() > 1)
        {
            PanelRow f = row("sameQuantityAlarms:" + names.front());
            word(f, "column", col);
            word(f, "elements", join(names, " "));
            num(f, "count", static_cast<scalar>(names.size()));
            addFact(std::move(f), std::to_string(names.size()) + " alarms watch"
                    " the same column `" + col + "` (elements " + join(names)
                    + "): one cause, one alarm.  Two series that are functions"
                    " of each other are not detected.");
        }

    //  alarmsActive
    std::size_t alarmsDeclared = 0;
    for (const auto& el : els) if (el.hasAlarm) ++alarmsDeclared;
    //  Published: the maximum count and the first instant it is reached
    //  (`max`, `at`); the first instant ANY alarm is active (`first`); how
    //  many written instants carry at least one (`count`); and those periods
    //  as the row's `intervals`.  The per-instant count itself is not
    //  published: it is derivable from each alarmed element's own intervals.
    std::size_t aMax = 0, aMaxAt = 0;
    if (alarmsDeclared > 0)
    {
        std::size_t aCount = 0, aFirst = 0;
        std::vector<std::pair<scalar, scalar>> anyIv;
        bool prevAny = false;
        for (std::size_t k = 0; k < n; ++k)
        {
            std::size_t c = 0;
            for (std::size_t ei = 0; ei < els.size(); ++ei)
                if (!active[ei].empty() && active[ei][k]) ++c;
            if (c > aMax) { aMax = c; aMaxAt = k; }
            if (c > 0)
            {
                if (aCount == 0) aFirst = k;
                ++aCount;
                if (prevAny) anyIv.back().second = T(k);
                else         anyIv.push_back({T(k), T(k)});
            }
            prevAny = (c > 0);
        }
        PanelRow f = row("alarmsActive");
        num(f, "alarms", static_cast<scalar>(alarmsDeclared));
        num(f, "max", static_cast<scalar>(aMax));
        if (aMax > 0) num(f, "at", T(aMaxAt));
        if (aCount > 0) num(f, "first", T(aFirst));
        num(f, "count", static_cast<scalar>(aCount));
        f.hasIntervals = true;
        f.intervals = anyIv;
        //  `at` is when the MAXIMUM was first reached, which can be the last
        //  written instant: it is said beside the first activation, never as
        //  "first at", which a reader takes for the start of the alarms.
        addFact(std::move(f), std::to_string(alarmsDeclared) + " alarm(s)"
                " declared; " + (aCount > 0
                    ? "the first alarm became active at t = " + fmt(T(aFirst))
                      + " s; at least one was active at "
                      + std::to_string(aCount) + " of " + std::to_string(n)
                      + " written instants; the maximum of "
                      + std::to_string(aMax) + " active at once was first"
                      " reached at t = " + fmt(T(aMaxAt)) + " s."
                    : std::string("none was ever active in this run.")));
    }

    //  messages
    for (const auto& m : msgs)
    {
        PanelRow r = row("message:" + m.name);
        word(r, "on", m.on);
        if (!m.from.empty()) word(r, "from", m.from);
        bool fired = false;  scalar tf = 0;
        if (m.on == "end") { fired = true; tf = T(n - 1); }
        else
            for (std::size_t ei = 0; ei < els.size() && !fired; ++ei)
            {
                if (els[ei].name != m.from || !published[ei]) continue;
                const int ci = series.column(els[ei].meas.column());
                for (std::size_t k = 0; k < n; ++k)
                    if (beyond(els[ei], m.on, series.rows[k][ci]))
                    { fired = true; tf = T(k); break; }
            }
        num(r, "fired", fired ? 1 : 0);
        if (fired) num(r, "t", tf);
        text(r, "text", m.text);
        rec.logLines.push_back("[panel] message:" + m.name + ": "
            + (fired ? "would fire at t = " + fmt(tf) + " s"
                     : std::string("never fires in this run"))
            + " (\"" + m.text + "\").");
        rec.messages.push_back(std::move(r));
    }

    //  summary
    rec.summary = row("summary");
    num(rec.summary, "elements", static_cast<scalar>(els.size()));
    num(rec.summary, "facts", static_cast<scalar>(rec.facts.size()));
    num(rec.summary, "messages", static_cast<scalar>(msgs.size()));
    num(rec.summary, "alarms", static_cast<scalar>(alarmsDeclared));
    num(rec.summary, "alarmsMax", static_cast<scalar>(aMax));
    if (aMax > 0) num(rec.summary, "alarmsMaxAt", T(aMaxAt));
    num(rec.summary, "instants", static_cast<scalar>(n));
    num(rec.summary, "locked", locked ? 1 : 0);
    if (hasGrid) { num(rec.summary, "gridColumns", gridC); num(rec.summary, "gridRows", gridR); }
    if (hasWindow) num(rec.summary, "trendWindow", window);
    if (!density.empty()) word(rec.summary, "density", density);
    if (!draftTool.empty()) { word(rec.summary, "draftTool", draftTool); word(rec.summary, "draftEngine", draftEngine); }
    if (locked)
    {
        text(rec.summary, "lockBy", lockBy);
        text(rec.summary, "lockDate", lockDate);
        text(rec.summary, "lockReason", lockReason);
    }
    rec.logLines.push_back("[panel] summary: " + std::to_string(els.size())
        + " element(s), " + std::to_string(rec.facts.size()) + " fact(s), "
        + std::to_string(alarmsDeclared) + " alarm(s) declared, at most "
        + std::to_string(aMax) + " active"
        + (locked ? "; the panel is LOCKED by " + lockBy + " (" + lockDate
                    + ")" : std::string("; not locked")) + ".");
    return rec;
}

} // namespace panel
} // namespace Choupo
