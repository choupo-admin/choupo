/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

#include "PropertySourceLog.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <functional>
#include <map>
#include <set>
#include <sstream>
#include <utility>

namespace Choupo {

namespace {

std::string jsonString(const std::string& s)
{
    std::string o = "\"";
    for (char c : s)
    {
        if (c == '"' || c == '\\') { o += '\\'; o += c; }
        else if (c == '\n') o += "\\n";
        else if (c == '\t') o += "\\t";
        else o += c;
    }
    return o + "\"";
}

std::string jsonNumber(double v)
{
    if (!std::isfinite(v)) return "null";
    char b[40];
    std::snprintf(b, sizeof(b), "%.12g", v);
    return b;
}

//  The words and the display unit of each property.
struct Display { const char* words; const char* unit; double scale; const char* fmt; };
Display displayOf(const std::string& property)
{
    if (property == "liquidDensity")     return { "liquid density",      "kg/m3",   1.0,    "%.2f" };
    if (property == "liquidVolume")      return { "liquid molar volume", "cm3/mol", 1.0e6,  "%.2f" };
    if (property == "liquidViscosity")   return { "liquid viscosity",    "mPa s",   1.0e3,  "%.4g" };
    if (property == "surfaceTension")    return { "surface tension",     "mN/m",    1.0e3,  "%.4g" };
    if (property == "liquidDiffusivity") return { "liquid diffusivity",  "m2/s",    1.0,    "%.3g" };
    if (property == "liquidKinematicViscosity") return { "liquid kinematic viscosity", "m2/s", 1.0, "%.3g" };
    //  Not a liquid property: the CSTR's all-vapour feed (C378 pilot, defect 2).
    if (property == "vapourVolume")      return { "vapour molar volume", "cm3/mol", 1.0e6,  "%.2f" };
    return { "?", "", 1.0, "%.4g" };
}

std::string number(const char* fmt, double v)
{
    char b[48];
    std::snprintf(b, sizeof(b), fmt, v);
    return b;
}

//  "787.27 kg/m3", "785.12 .. 787.30 kg/m3 (12 values)", or "" when the
//  consumer recorded no number.
std::string valueText(const PropertySourceLog::Used& u)
{
    if (u.nValued == 0) return "";
    const Display d = displayOf(u.property);
    const std::string lo = number(d.fmt, u.vMin * d.scale);
    const std::string hi = number(d.fmt, u.vMax * d.scale);
    if (lo == hi) return lo + " " + d.unit;
    return lo + " .. " + hi + " " + d.unit + " (" + std::to_string(u.nValued) + " values)";
}

std::string stateText(const PropertySourceLog::Used& u)
{
    std::string s;
    if (u.nT > 0)
    {
        const std::string a = number("%.1f", u.TMin), b = number("%.1f", u.TMax);
        s += "at " + (a == b ? a : a + " .. " + b) + " K";
    }
    if (u.nP > 0)
    {
        const std::string a = number("%.3g", u.PMin * 1.0e-5), b = number("%.3g", u.PMax * 1.0e-5);
        s += std::string(s.empty() ? "at " : ", ") + (a == b ? a : a + " .. " + b) + " bar";
    }
    return s;
}

std::string andList(const std::set<std::string>& s)
{
    std::vector<std::string> v(s.begin(), s.end());
    std::string o;
    for (std::size_t i = 0; i < v.size(); ++i)
        o += (i == 0 ? "" : (i + 1 == v.size() ? " and " : ", ")) + v[i];
    return o;
}

//  The source in plain words, with what the unit's call left out.
std::string sourceText(const PropertySourceLog::Used& u)
{
    std::string s = u.label;
    if (u.pressureNote == "not applied" && u.label.find("pressure effect") == std::string::npos)
        s += "; pressure not applied";
    else if (u.pressureNote == "not applied (saturated liquid)")
        s += "; pressure not applied (the saturated liquid)";
    else if (u.pressureNote.compare(0, 11, "applied to ") == 0)
        s += "; pressure " + u.pressureNote;          // per leaf (C378 pilot review, S3)
    if (!u.leftOut.empty())
        s += "; " + andList(u.leftOut) + " left out (no liquid volume at that state)";
    return s;
}

std::string unitList(const std::vector<std::string>& units)
{
    std::string o;
    const std::size_t shown = units.size() > 3 ? 3 : units.size();
    for (std::size_t i = 0; i < shown; ++i) o += (i ? ", " : "") + units[i];
    if (units.size() > shown) o += " + " + std::to_string(units.size() - shown) + " more";
    return o;
}

} // namespace

std::size_t compositionKey(const std::vector<double>& x)
{
    double s = 0.0;
    for (double v : x) if (v > 0.0) s += v;
    if (!(s > 0.0)) return 0;
    std::string k;
    for (double v : x)
    {
        char b[32];
        std::snprintf(b, sizeof(b), "%.12g,", v > 0.0 ? v / s : 0.0);
        k += b;
    }
    const std::size_t h = std::hash<std::string>{}(k);
    return h == 0 ? 1 : h;
}

void PropertySourceLog::clear()
{
    std::lock_guard<std::mutex> g(mutex_);
    used_.clear();
    declared_.clear();
    parameters_.clear();
    hypotheses_.clear();
    generation_.fetch_add(1, std::memory_order_relaxed);
}

PropertySourceLog::Scope::Scope(const std::string& type, const std::string& unit)
{
    PropertySourceLog& log = instance();
    std::lock_guard<std::mutex> g(log.mutex_);
    prevType_ = log.currentType_;
    prevUnit_ = log.currentUnit_;
    log.currentType_ = type;
    log.currentUnit_ = unit;
}

PropertySourceLog::Scope::~Scope()
{
    PropertySourceLog& log = instance();
    std::lock_guard<std::mutex> g(log.mutex_);
    log.currentType_ = prevType_;
    log.currentUnit_ = prevUnit_;
}

bool PropertySourceLog::current(std::string& type, std::string& unit) const
{
    std::lock_guard<std::mutex> g(mutex_);
    if (currentType_.empty()) return false;
    type = currentType_;
    unit = currentUnit_;
    return true;
}

void PropertySourceLog::declare(const std::string& type, const std::string& unit,
                                const std::string& property,
                                const std::string& sourceClass)
{
    std::lock_guard<std::mutex> g(mutex_);
    declared_[{type, unit, property}].insert(sourceClass);
}

void PropertySourceLog::use(const std::string& type, const std::string& unit,
                            const std::string& property, const std::string& sourceId,
                            const std::string& label, const std::string& sourceClass,
                            const std::string& pressureNote, const std::string& leftOut,
                            const Taken& t)
{
    std::lock_guard<std::mutex> g(mutex_);
    Used& u = used_[{unit, property, sourceId}];
    if (u.count == 0)
    {
        u.type = type; u.unit = unit; u.property = property; u.sourceId = sourceId;
    }
    u.label = label;
    u.sourceClass = sourceClass;
    u.pressureNote = pressureNote;
    ++u.count;
    if (std::isfinite(t.value))
    {
        if (u.nValued == 0) { u.vMin = u.vMax = t.value; }
        else { u.vMin = std::min(u.vMin, t.value); u.vMax = std::max(u.vMax, t.value); }
        ++u.nValued;
    }
    if (std::isfinite(t.T))
    {
        if (u.nT == 0) { u.TMin = u.TMax = t.T; }
        else { u.TMin = std::min(u.TMin, t.T); u.TMax = std::max(u.TMax, t.T); }
        ++u.nT;
    }
    if (std::isfinite(t.P))
    {
        if (u.nP == 0) { u.PMin = u.PMax = t.P; }
        else { u.PMin = std::min(u.PMin, t.P); u.PMax = std::max(u.PMax, t.P); }
        ++u.nP;
    }
    if (property == "liquidDensity" && t.composition != 0 && std::isfinite(t.value)
        && std::isfinite(t.T) && std::isfinite(t.P) && u.states.size() < 64)
        u.states[std::make_tuple(t.T, t.P, t.composition)] = t.value;
    //  one name per entry, whatever list the caller joined
    std::size_t s = 0;
    while (s < leftOut.size())
    {
        std::size_t e = leftOut.find(',', s);
        if (e == std::string::npos) e = leftOut.size();
        std::string w = leftOut.substr(s, e - s);
        while (!w.empty() && w.front() == ' ') w.erase(w.begin());
        while (!w.empty() && w.back() == ' ') w.pop_back();
        if (!w.empty()) u.leftOut.insert(w);
        s = e + 1;
    }
}

void PropertySourceLog::useHere(const std::string& property, const NamedSource& s,
                                const std::string& sourceClass, const Taken& taken,
                                const std::string& pressureNote)
{
    std::string type, unit;
    if (current(type, unit))
        use(type, unit, property, s.id, s.label, sourceClass, pressureNote, "", taken);
}

void PropertySourceLog::useHere(const std::string& property, const ConstantSource& s,
                                const std::string& sourceClass)
{
    std::string type, unit;
    if (current(type, unit)) use(type, unit, property, s, sourceClass);
}

void PropertySourceLog::useHere(const std::string& property, const NamedSource& s,
                                const std::string& addendum, const std::string& sourceClass,
                                const Taken& taken, const std::string& pressureNote)
{
    std::string type, unit;
    if (current(type, unit))
        use(type, unit, property, s.id, std::string(s.label) + addendum, sourceClass,
            pressureNote, "", taken);
}

void PropertySourceLog::useHere(const std::string& property, const NamedSource& s,
                                const std::vector<std::string>& statedAt,
                                const std::string& addendum, const std::string& sourceClass,
                                const Taken& taken, const std::string& pressureNote)
{
    std::string type, unit;
    if (current(type, unit))
        use(type, unit, property, s.id, liquidSource::labelAtDatum(s.label, statedAt) + addendum,
            sourceClass, pressureNote, "", taken);
}

std::string liquidSource::labelAtDatum(const char* label, const std::vector<std::string>& statedAt)
{
    std::string w(label);
    if (statedAt.empty()) return w;
    const std::string key = "25 C molar volume";
    const std::size_t at = w.find(key);
    if (at == std::string::npos) return w;
    std::size_t end = at + key.size();
    const bool plural = (end < w.size() && w[end] == 's');
    if (plural) ++end;
    std::string who;
    for (std::size_t k = 0; k < statedAt.size(); ++k) who += (k ? ", " : "") + statedAt[k];
    return w.substr(0, at) + (plural ? "molar volumes" : "molar volume")
         + " at the temperature its record states (" + who + "; any other at 25 C)"
         + w.substr(end);
}

std::vector<std::string> PropertySourceLog::mismatches() const
{
    std::vector<std::string> out;
    std::set<std::string> declaringTypes;
    for (const auto& d : declared_) declaringTypes.insert(std::get<0>(d.first));
    for (const auto& kv : used_)
    {
        const Used& u = kv.second;
        if (!declaringTypes.count(u.type)) continue;   // only flowsheet units declare
        const auto d = declared_.find(std::make_tuple(u.type, u.unit, u.property));
        if (d == declared_.end() || !d->second.count(u.sourceClass))
            out.push_back(u.unit + " (" + u.type + ") took its "
                + displayOf(u.property).words + " from a source of class '"
                + u.sourceClass + "' its type does not declare");
    }
    return out;
}

std::vector<std::string> PropertySourceLog::idle() const
{
    std::vector<std::string> out;
    for (const auto& d : declared_)
    {
        bool any = false;
        for (const auto& kv : used_)
            if (kv.second.unit == std::get<1>(d.first)
                && kv.second.property == std::get<2>(d.first)
                && d.second.count(kv.second.sourceClass))
                any = true;
        if (!any)
            out.push_back(std::get<1>(d.first) + " (" + std::get<0>(d.first) + ") "
                          + std::get<2>(d.first));
    }
    return out;
}

std::vector<std::string> PropertySourceLog::pricedTwice() const
{
    std::map<std::tuple<double, double, std::size_t>,
             std::vector<std::pair<std::string, double>>> byState;
    for (const auto& kv : used_)
        for (const auto& st : kv.second.states)
            byState[st.first].push_back({ kv.second.unit + " (" + kv.second.type + ")",
                                          st.second });
    std::vector<std::string> out;
    for (const auto& b : byState)
    {
        double lo = b.second.front().second, hi = lo;
        for (const auto& w : b.second) { lo = std::min(lo, w.second); hi = std::max(hi, w.second); }
        if (!(hi - lo > 1.0e-9 * std::fabs(hi))) continue;
        std::string line = "the same liquid (" + number("%.1f", std::get<0>(b.first))
            + " K, " + number("%.3g", std::get<1>(b.first) * 1.0e-5)
            + " bar, one composition) is given two densities: ";
        std::set<std::string> seen;
        bool first = true;
        for (const auto& w : b.second)
        {
            const std::string item = w.first + " " + number("%.2f", w.second) + " kg/m3";
            if (!seen.insert(item).second) continue;
            line += (first ? "" : ", ") + item;
            first = false;
        }
        out.push_back(line);
    }
    return out;
}

//  A CONSTANT WHERE ANOTHER UNIT COMPUTED (review DR-08): a unit that took a
//  constant liquid density while another consumer of the same run priced a
//  liquid at a state.  Not claimed to be the same stream: the table does not
//  know the streams; the pilot will.
std::vector<std::string> PropertySourceLog::constantBesideComputed() const
{
    std::vector<std::string> out;
    std::vector<const Used*> constants, computed;
    for (const auto& kv : used_)
    {
        const Used& u = kv.second;
        if (u.property != "liquidDensity" || u.nValued == 0) continue;
        const bool constant = u.sourceId.rfind("constant.", 0) == 0
                           || u.sourceId.rfind("default.", 0) == 0
                           || u.sourceId.rfind("fallback.", 0) == 0;
        (constant ? constants : computed).push_back(&u);
    }
    for (const Used* c : constants)
    {
        std::string line = c->unit + " (" + c->type + ") took a constant "
            + number("%.2f", c->vMin) + " kg/m3 for a liquid density, while ";
        bool first = true;
        int shown = 0;
        for (const Used* k : computed)
        {
            if (k->unit == c->unit) continue;
            if (shown == 3) { line += ", ..."; break; }
            line += std::string(first ? "" : ", ") + k->unit + " (" + k->type + ") computed "
                  + valueText(*k);
            first = false;
            ++shown;
        }
        if (shown == 0) continue;
        out.push_back(line + " (whether they price the same liquid is not checked here)");
    }
    return out;
}

void PropertySourceLog::hypothesisHere(const std::string& word, const std::string& components,
                                       double share, double bound)
{
    std::string type, unit;
    if (!current(type, unit)) return;
    std::lock_guard<std::mutex> g(mutex_);
    Hypothesis& h = hypotheses_[{ word, unit }];
    h.type = type;
    h.components = components;
    h.bound = bound;
    if (h.count == 0 || share > h.largest) h.largest = share;
    ++h.count;
}

void PropertySourceLog::printUsed(std::ostream& os) const
{
    if (used_.empty() && parameters_.empty() && hypotheses_.empty()) return;
    os << "\n[liquid properties] Where each unit took its liquid properties from in"
          " this run (values as used; nothing is changed by this table)\n";
    //  Units of one type that share the property, the source AND the value
    //  share a line; the rest is one line per unit.
    using GroupKey = std::tuple<std::string, std::string, std::string, std::string,
                                std::string, std::string>;
    std::map<GroupKey, std::vector<std::string>> groups;
    for (const auto& kv : used_)
    {
        const Used& u = kv.second;
        groups[std::make_tuple(u.property, u.type, sourceText(u), valueText(u),
                               stateText(u), u.sourceId)].push_back(u.unit);
    }
    for (const auto& g : groups)
    {
        const std::string& property = std::get<0>(g.first);
        const std::string& type     = std::get<1>(g.first);
        const std::string& value    = std::get<3>(g.first);
        const std::string& state    = std::get<4>(g.first);
        os << "  " << unitList(g.second) << " (" << type << ")   "
           << displayOf(property).words << "   "
           << (value.empty() ? std::string("value not recorded") : value)
           << (state.empty() ? "" : " " + state) << "   "
           << std::get<2>(g.first) << "\n";
    }
    for (const auto& m : mismatches()) os << "  [mismatch] " << m << "\n";
    for (const auto& p : pricedTwice()) os << "  [twice] " << p << "\n";
    //  SAME LIQUID, TWO METHODS (C378 pilot review, PA-13).  `[twice]` keys
    //  on an exact (T, P, composition) and so never fired where it mattered
    //  most: a pump on the kernel's methods and a pipe on the slice-0 door
    //  price one water at neighbouring states.  This line keys on the
    //  composition alone and names each consumer's method and range, while
    //  the migration leaves a liquid with two methods in one run.
    {
        struct Seen { std::string who, id; double lo, hi; };
        std::map<std::size_t, std::vector<Seen>> byComposition;
        for (const auto& kv : used_)
        {
            const Used& u = kv.second;
            if (u.property != "liquidDensity") continue;
            std::map<std::size_t, std::pair<double, double>> range;
            for (const auto& st : u.states)
            {
                auto it = range.find(std::get<2>(st.first));
                if (it == range.end()) range[std::get<2>(st.first)] = { st.second, st.second };
                else { it->second.first = std::min(it->second.first, st.second);
                       it->second.second = std::max(it->second.second, st.second); }
            }
            for (const auto& r : range)
                byComposition[r.first].push_back({ u.unit + " (" + u.type + ")", u.sourceId,
                                                   r.second.first, r.second.second });
        }
        for (const auto& b : byComposition)
        {
            std::set<std::string> ids;
            for (const auto& s : b.second) ids.insert(s.id);
            if (ids.size() < 2) continue;
            std::string line = "one liquid composition is priced by " + std::to_string(ids.size())
                             + " methods in this run: ";
            for (std::size_t k = 0; k < b.second.size(); ++k)
            {
                const auto& s = b.second[k];
                line += (k ? "; " : "") + s.who + " " + s.id + " "
                      + (s.hi - s.lo > 5.0e-3 ? number("%.2f", s.lo) + " .. " + number("%.2f", s.hi)
                                              : number("%.2f", s.lo)) + " kg/m3";
            }
            os << "  [two methods] " << line << "\n";
        }
    }
    for (const auto& c : constantBesideComputed()) os << "  [constant] " << c << "\n";
    for (const auto& h : hypotheses_)
    {
        char b[160];
        std::snprintf(b, sizeof b, "largest share %.3g of the declared bound %.3g", h.second.largest,
                      h.second.bound);
        os << "  [hypothesis] " << h.first.first << " (" << h.second.components << ") in "
           << h.first.second << " (" << h.second.type << "): " << b << "\n";
    }
    if (!parameters_.empty())
    {
        os << "  Parameters of thermodynamic models that read a component's 25 C"
              " liquid volume (not a liquid property of any unit, the same datum):\n";
        for (const auto& p : parameters_)
            os << "    " << p.first << ": " << p.second << "\n";
    }
}

std::string PropertySourceLog::json() const
{
    if (used_.empty() && declared_.empty() && parameters_.empty()) return "";
    std::ostringstream o;
    o << ",\n  \"propertySources\": {\n    \"used\": [";
    bool first = true;
    for (const auto& kv : used_)
    {
        const Used& u = kv.second;
        o << (first ? "\n" : ",\n") << "      { \"unit\": " << jsonString(u.unit)
          << ", \"consumerType\": " << jsonString(u.type)
          << ", \"property\": " << jsonString(u.property)
          << ", \"sourceId\": " << jsonString(u.sourceId)
          << ", \"label\": " << jsonString(sourceText(u))
          << ", \"class\": " << jsonString(u.sourceClass)
          << ", \"kernel\": " << (u.sourceClass == "kernel" ? "true" : "false")
          << ", \"pressure\": " << jsonString(u.pressureNote)
          << ", \"calls\": " << u.count
          << ", \"valueMin\": " << (u.nValued ? jsonNumber(u.vMin) : "null")
          << ", \"valueMax\": " << (u.nValued ? jsonNumber(u.vMax) : "null")
          << ", \"TMin\": " << (u.nT ? jsonNumber(u.TMin) : "null")
          << ", \"TMax\": " << (u.nT ? jsonNumber(u.TMax) : "null")
          << ", \"PMin\": " << (u.nP ? jsonNumber(u.PMin) : "null")
          << ", \"PMax\": " << (u.nP ? jsonNumber(u.PMax) : "null")
          << ", \"leftOut\": [";
        bool f2 = true;
        for (const auto& lo : u.leftOut) { o << (f2 ? "" : ", ") << jsonString(lo); f2 = false; }
        o << "] }";
        first = false;
    }
    o << (first ? "" : "\n    ") << "],\n    \"declared\": [";
    first = true;
    for (const auto& d : declared_)
        for (const auto& cls : d.second)
        {
            o << (first ? "\n" : ",\n") << "      { \"unit\": "
              << jsonString(std::get<1>(d.first)) << ", \"consumerType\": "
              << jsonString(std::get<0>(d.first)) << ", \"property\": "
              << jsonString(std::get<2>(d.first)) << ", \"class\": "
              << jsonString(cls) << " }";
            first = false;
        }
    o << (first ? "" : "\n    ");
    auto list = [&o](const char* key, const std::vector<std::string>& v)
    {
        o << "],\n    \"" << key << "\": [";
        bool f = true;
        for (const auto& s : v) { o << (f ? "\n      " : ",\n      ") << jsonString(s); f = false; }
        o << (f ? "" : "\n    ");
    };
    list("declaredNotUsed", idle());
    list("mismatches", mismatches());
    list("pricedTwice", pricedTwice());
    list("constantBesideComputed", constantBesideComputed());
    o << "],\n    \"modelParameters\": [";
    first = true;
    for (const auto& p : parameters_)
    {
        o << (first ? "\n      " : ",\n      ") << "{ \"model\": " << jsonString(p.first)
          << ", \"reads\": " << jsonString(p.second) << " }";
        first = false;
    }
    o << (first ? "" : "\n    ") << "]";
    if (!hypotheses_.empty())
    {
        o << ",\n    \"hypotheses\": [";
        first = true;
        for (const auto& h : hypotheses_)
        {
            o << (first ? "\n      " : ",\n      ") << "{ \"word\": " << jsonString(h.first.first)
              << ", \"unit\": " << jsonString(h.first.second)
              << ", \"consumerType\": " << jsonString(h.second.type)
              << ", \"components\": " << jsonString(h.second.components)
              << ", \"largestShare\": " << jsonNumber(h.second.largest)
              << ", \"bound\": " << jsonNumber(h.second.bound) << " }";
            first = false;
        }
        o << "\n    ]";
    }
    o << "\n  }";
    return o.str();
}

} // namespace Choupo
