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

#include <sstream>

namespace Choupo {

namespace {

std::string joined(const std::set<std::string>& s, const char* sep)
{
    std::string o;
    for (const auto& x : s) o += (o.empty() ? "" : sep) + x;
    return o;
}

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

} // namespace

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
                            const std::string& pressureNote, const std::string& leftOut)
{
    std::lock_guard<std::mutex> g(mutex_);
    Used& u = used_[{type, property, sourceId}];
    u.label = label;
    u.sourceClass = sourceClass;
    u.pressureNote = pressureNote;
    u.units.insert(unit);
    if (!leftOut.empty()) u.leftOut.insert(leftOut);
}

void PropertySourceLog::useHere(const std::string& property, const NamedSource& s,
                                const std::string& sourceClass,
                                const std::string& pressureNote)
{
    std::string type, unit;
    if (current(type, unit)) use(type, unit, property, s.id, s.label, sourceClass, pressureNote);
}

void PropertySourceLog::useHere(const std::string& property, const ConstantSource& s,
                                const std::string& sourceClass)
{
    std::string type, unit;
    if (current(type, unit)) use(type, unit, property, s.id, s.label, sourceClass, "");
}

std::vector<std::string> PropertySourceLog::mismatches() const
{
    std::vector<std::string> out;
    //  (type, unit, property) -> classes used
    std::map<std::tuple<std::string, std::string, std::string>, std::set<std::string>> usedBy;
    for (const auto& kv : used_)
        for (const auto& unit : kv.second.units)
            usedBy[{std::get<0>(kv.first), unit, std::get<1>(kv.first)}]
                .insert(kv.second.sourceClass);
    for (const auto& kv : usedBy)
    {
        //  Only consumers that are flowsheet units declare at assembly.
        bool typeDeclares = false;
        for (const auto& d : declared_)
            if (std::get<0>(d.first) == std::get<0>(kv.first)) { typeDeclares = true; break; }
        if (!typeDeclares) continue;
        const auto d = declared_.find(kv.first);
        for (const auto& cls : kv.second)
            if (d == declared_.end() || !d->second.count(cls))
                out.push_back(std::get<0>(kv.first) + " '" + std::get<1>(kv.first)
                    + "' used a " + cls + " source for " + std::get<2>(kv.first)
                    + " that it did not declare");
    }
    return out;
}

void PropertySourceLog::printDeclared(std::ostream& os) const
{
    if (declared_.empty()) return;
    os << "\n[properties] liquid properties by consumer, DECLARED at assembly"
          " (C378 slice 0: what each unit says it will use; nothing changed)\n";
    //  aggregate (type, property, class) -> units
    std::map<std::tuple<std::string, std::string, std::string>, std::set<std::string>> agg;
    for (const auto& d : declared_)
        for (const auto& cls : d.second)
            agg[{std::get<0>(d.first), std::get<2>(d.first), cls}].insert(std::get<1>(d.first));
    for (const auto& a : agg)
        os << "  " << std::get<0>(a.first) << "  " << std::get<1>(a.first)
           << "  " << std::get<2>(a.first) << "  [" << joined(a.second, " ") << "]\n";
}

void PropertySourceLog::printUsed(std::ostream& os) const
{
    if (used_.empty() && declared_.empty()) return;
    os << "\n[properties] liquid properties by consumer, USED in this run"
          " (C378 slice 0: the number each consumer actually took)\n";
    for (const auto& kv : used_)
    {
        const Used& u = kv.second;
        os << "  " << std::get<0>(kv.first) << "  " << std::get<1>(kv.first)
           << "  " << u.label;
        if (!u.pressureNote.empty()) os << "; pressure " << u.pressureNote;
        if (!u.leftOut.empty()) os << "; left out: " << joined(u.leftOut, ", ");
        os << "  [" << joined(u.units, " ") << "]\n";
    }
    for (const auto& m : mismatches())
        os << "  [mismatch] " << m << "\n";
    //  Declared and never used: said, not counted as a defect (a unit may
    //  take a declared value instead, or a path may not run).
    std::map<std::tuple<std::string, std::string, std::string>, std::set<std::string>> usedBy;
    for (const auto& kv : used_)
        for (const auto& unit : kv.second.units)
            usedBy[{std::get<0>(kv.first), unit, std::get<1>(kv.first)}]
                .insert(kv.second.sourceClass);
    //  aggregated per (type, property): the units that used none of the
    //  sources they declared for it in this run.
    std::map<std::pair<std::string, std::string>, std::set<std::string>> idle;
    for (const auto& d : declared_)
    {
        const auto u = usedBy.find(d.first);
        bool any = false;
        if (u != usedBy.end())
            for (const auto& cls : d.second) if (u->second.count(cls)) any = true;
        if (!any) idle[{std::get<0>(d.first), std::get<2>(d.first)}].insert(std::get<1>(d.first));
    }
    for (const auto& i : idle)
        os << "  [declared, not used in this run] " << i.first.first << "  "
           << i.first.second << "  [" << joined(i.second, " ") << "]\n";
}

std::string PropertySourceLog::json() const
{
    if (used_.empty() && declared_.empty()) return "";
    std::ostringstream o;
    o << ",\n  \"propertySources\": {\n    \"used\": [";
    bool first = true;
    for (const auto& kv : used_)
    {
        const Used& u = kv.second;
        o << (first ? "\n" : ",\n") << "      { \"consumerType\": "
          << jsonString(std::get<0>(kv.first)) << ", \"property\": "
          << jsonString(std::get<1>(kv.first)) << ", \"sourceId\": "
          << jsonString(std::get<2>(kv.first)) << ", \"label\": "
          << jsonString(u.label) << ", \"class\": " << jsonString(u.sourceClass)
          << ", \"kernel\": " << (u.sourceClass == "kernel" ? "true" : "false")
          << ", \"pressure\": " << jsonString(u.pressureNote) << ", \"units\": [";
        bool f2 = true;
        for (const auto& un : u.units) { o << (f2 ? "" : ", ") << jsonString(un); f2 = false; }
        o << "], \"leftOut\": [";
        f2 = true;
        for (const auto& lo : u.leftOut) { o << (f2 ? "" : ", ") << jsonString(lo); f2 = false; }
        o << "] }";
        first = false;
    }
    o << (first ? "" : "\n    ") << "],\n    \"declared\": [";
    first = true;
    for (const auto& d : declared_)
        for (const auto& cls : d.second)
        {
            o << (first ? "\n" : ",\n") << "      { \"consumerType\": "
              << jsonString(std::get<0>(d.first)) << ", \"unit\": "
              << jsonString(std::get<1>(d.first)) << ", \"property\": "
              << jsonString(std::get<2>(d.first)) << ", \"class\": "
              << jsonString(cls) << " }";
            first = false;
        }
    o << (first ? "" : "\n    ") << "],\n    \"mismatches\": [";
    first = true;
    for (const auto& m : mismatches())
    {
        o << (first ? "\n" : ",\n") << "      " << jsonString(m);
        first = false;
    }
    o << (first ? "" : "\n    ") << "]\n  }";
    return o.str();
}

} // namespace Choupo
