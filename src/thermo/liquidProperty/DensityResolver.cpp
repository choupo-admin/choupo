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

#include "DensityResolver.H"

#include "DensityLeaf.H"
#include "core/PropertySourceLog.H"
#include "thermo/LiquidPropertyDoor.H"
#include "thermo/PropertyDomainError.H"
#include "thermo/RecordResolver.H"
#include "thermo/ThermoPackage.H"

#include <algorithm>
#include <cctype>
#include <filesystem>
#include <limits>
#include <map>
#include <memory>
#include <mutex>
#include <set>
#include <stdexcept>
#include <string>
#include <tuple>
#include <vector>

namespace Choupo {
namespace liquidProperty {

namespace {

namespace fs = std::filesystem;

std::string lower(std::string s)
{
    std::transform(s.begin(), s.end(), s.begin(),
                   [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
    return s;
}

std::vector<std::string> sortedNames(const ThermoPackage& thermo, const std::vector<std::size_t>& set)
{
    std::vector<std::string> n;
    for (const std::size_t i : set) n.push_back(thermo.comp(i).name());
    std::sort(n.begin(), n.end(), [](const std::string& a, const std::string& b)
              { const auto la = lower(a), lb = lower(b); return la != lb ? la < lb : a < b; });
    return n;
}

//  What makes two packages the same for the freeze: their components and
//  their pure-fluid selections, in order.
std::string packageIdentity(const ThermoPackage& thermo)
{
    std::string s;
    for (std::size_t i = 0; i < thermo.n(); ++i)
        s += thermo.comp(i).name() + "/" + thermo.pureFluidMethod(i) + ";";
    return s;
}

using Key = std::pair<std::string, std::vector<std::size_t>>;   // (identity, set)

struct RunState
{
    unsigned generation = 0;
    std::map<Key, DensityResolution> resolved;
    //  The packages (by address) whose sets were already checked against the
    //  run's resolution; a package met for the first time resolves again.
    std::set<std::tuple<const ThermoPackage*, std::string, std::vector<std::size_t>>> checked;
    std::vector<Key> order;
};

std::mutex& mtx() { static std::mutex m; return m; }
RunState&   run() { static RunState r; return r; }

void freshRun()
{
    const unsigned g = PropertySourceLog::instance().generation();
    if (run().generation != g) { run() = RunState{}; run().generation = g; }
}

//  THE REFERENCE EQUATION THAT NAMES A COMPONENT, BY THE FACT (plan section
//  2, ruling 1): a Helmholtz record in parameters/Helmholtz/ whose `fluid` is
//  the component's name or one of its aliases, found as the equation itself
//  is found -- case-local (constant/parameters/Helmholtz/, which wins), then
//  the catalogue; a SEALED case reads only its own copy.  Two records of one
//  tier naming the same fluid are refused, naming both (TR-07).  "" when
//  none names it.
std::string referenceRecordFor(const ThermoPackage& thermo, std::size_t i)
{
    static std::mutex m;
    static std::map<std::string, std::pair<std::string, std::string>> parsed;  // path -> (equation, fluid)
    const Component& c = thermo.comp(i);
    const auto names = [&] {
        std::vector<std::string> n{ c.name() };
        for (const auto& a : c.aliases()) n.push_back(a);
        return n;
    }();
    const fs::path stdDir = records::standardsRecord("parameters/Helmholtz");
    std::map<int, std::vector<std::pair<std::string, std::string>>> byTier;  // tier -> (equation, path)
    for (const auto& p : records::scanRecordDir("parameters/Helmholtz"))
    {
        std::pair<std::string, std::string> ef;
        {
            std::lock_guard<std::mutex> lk(m);
            const auto it = parsed.find(p.string());
            if (it != parsed.end()) ef = it->second;
            else
            {
                const DictPtr d = Dictionary::fromFile(p.string());
                ef = { d->lookupWordOrDefault("equation", p.stem().string()),
                       d->lookupWordOrDefault("fluid", "") };
                parsed.emplace(p.string(), ef);
            }
        }
        if (std::find(names.begin(), names.end(), ef.second) == names.end()) continue;
        const int tier = (p.parent_path() == stdDir) ? 1 : 0;      // 0: the case's own
        byTier[tier].push_back({ ef.first, p.string() });
    }
    if (byTier.empty()) return "";
    const auto& best = byTier.begin()->second;
    if (best.size() > 1)
        throw PropertyDomainError(PropertyDomainError::Kind::missingDatum,
            "liquid density: two reference equations of one tier name the fluid '"
            + c.name() + "' (" + best[0].second + ", " + best[1].second + "); the"
              " engine does not choose between them.  Remedy: keep one, or select one"
              " by name with `pureFluids { " + c.name() + " { method Helmholtz;"
              " equation <name>; } }`.",
            "one reference record per fluid and tier");
    return best.front().first;
}

//  The leaf for ONE constituent, by the plan's order: its registered name,
//  or "" with `why` saying why none applies.  `record` receives the
//  reference equation's name for a `referenceEquation` leaf.
std::string leafFor(const ThermoPackage& thermo, std::size_t i,
                    std::vector<std::string>& passed, std::string& why,
                    std::string& record)
{
    const std::string c = thermo.comp(i).name();
    if (thermo.hasPureFluid(i))
    {
        const std::string ref = referenceRecordFor(thermo, i);
        if (!ref.empty())
            passed.push_back("referenceEquation." + ref + " (" + c + "): the case's"
                " pureFluids selection pins the component's method");
        return "pureFluid";
    }
    if (thermo.isHenrySolute(i))
    {
        why = "'" + c + "' is a declared Henry solute: its volume in the liquid is a"
              " partial molar volume (`v_inf`), which this kernel does not read, so no"
              " pure-liquid volume stands for it";
        passed.push_back("recordVolume (" + c + "): a declared Henry solute has no pure-liquid leaf");
        return "";
    }
    record = referenceRecordFor(thermo, i);
    if (!record.empty())
    {
        if (thermo.liquidVolumeRouteOf(i) != ThermoPackage::LiquidVolumeRoute::none)
            passed.push_back("recordVolume (" + c + "): a reference equation names the"
                " fluid (" + record + "), and it carries temperature and pressure");
        return "referenceEquation";
    }
    const auto route = thermo.liquidVolumeRouteOf(i);
    if (route == ThermoPackage::LiquidVolumeRoute::none)
    {
        why = "'" + c + "' has no liquid volume: its record carries neither `Vliq`"
              " nor the critical constants Tc and Pc";
        passed.push_back("recordVolume (" + c + "): neither `Vliq` nor Tc, Pc in its record");
        return "";
    }
    return "recordVolume";
}

DensityResolution resolveNew(const ThermoPackage& thermo, const std::vector<std::size_t>& set)
{
    DensityResolution r;
    r.set     = set;
    r.setName = setDisplayName(thermo, set);

    //  (2b) one constituent: the case's own pure-fluid selection pins it;
    //  else a reference equation that names it.  The same order as a leaf's,
    //  so the set {i} and the leaf i inside a mixture agree as x_i -> 1.
    std::string leaf1, record1, why1;
    if (set.size() == 1 && !thermo.isHenrySolute(set.front()))
        leaf1 = leafFor(thermo, set.front(), r.passedOver, why1, record1);
    if (leaf1 == "pureFluid" || leaf1 == "referenceEquation")
    {
        r.method = leaf1;
        r.record = record1;
    }
    else
    {
        r.passedOver.clear();
        //  (3) additive volumes, one leaf per constituent.
        std::vector<std::string> missing;
        for (const std::size_t i : set)
        {
            std::string why, record;
            const std::string leaf = leafFor(thermo, i, r.passedOver, why, record);
            if (leaf.empty()) { missing.push_back(why); continue; }
            r.parts.push_back(leaf);
            r.partRecords.push_back(record);
        }
        if (!missing.empty())
        {
            //  (5) refusal: every method passed over, and the remedy.
            std::string msg = "liquid density of the constituent set " + r.setName
                + ": no method applies.  idealMixing (additive volumes) needs a volume"
                  " for every constituent, and ";
            for (std::size_t k = 0; k < missing.size(); ++k)
                msg += (k ? "; " : "") + missing[k];
            msg += ".  Remedy: give each such component a liquid volume in its record"
                   " (`Vliq`, or Tc and Pc), or provide a solution record for this set,"
                   " parameters/solution/" + setFileName(thermo, set) + ".dat.";
            throw PropertyDomainError(PropertyDomainError::Kind::missingDatum, msg,
                "a liquid volume for each constituent, or a solution record for the set");
        }
        r.method = "idealMixing";
    }
    r.methodId = build(r, thermo)->id();
    return r;
}

} // namespace

std::string setDisplayName(const ThermoPackage& thermo, const std::vector<std::size_t>& set)
{
    std::string s = "{";
    bool first = true;
    for (const auto& n : sortedNames(thermo, set)) { s += (first ? "" : ", ") + n; first = false; }
    return s + "}";
}

std::string setFileName(const ThermoPackage& thermo, const std::vector<std::size_t>& set)
{
    std::string s;
    for (const auto& n : sortedNames(thermo, set)) s += (s.empty() ? "" : "-") + n;
    return s;
}

std::shared_ptr<const DensityMethod> build(const DensityResolution& r, const ThermoPackage& thermo)
{
    DensityMethod::Binding b;
    b.thermo     = &thermo;
    b.set        = r.set;
    b.recordName = r.record;
    for (std::size_t k = 0; k < r.parts.size(); ++k)
    {
        DensityMethod::Binding lb;
        lb.thermo     = &thermo;
        lb.set        = { r.set[k] };
        lb.recordName = k < r.partRecords.size() ? r.partRecords[k] : std::string();
        b.parts.push_back(std::shared_ptr<const DensityMethod>(DensityMethod::New(r.parts[k], lb)));
    }
    return std::shared_ptr<const DensityMethod>(DensityMethod::New(r.method, b));
}

DensityResolution resolveDensity(const ThermoPackage& thermo, const sVector& x)
{
    std::vector<std::size_t> set;
    for (std::size_t i = 0; i < x.size() && i < thermo.n(); ++i)
        if (x[i] > 0.0) set.push_back(i);
    if (set.empty())
        throw PropertyDomainError(PropertyDomainError::Kind::invalidState,
            "liquid density: empty composition (no component has x > 0)");

    std::lock_guard<std::mutex> lk(mtx());
    freshRun();
    const Key key{ packageIdentity(thermo), set };
    const auto seen = std::make_tuple(&thermo, key.first, set);
    const auto it = run().resolved.find(key);
    if (it != run().resolved.end() && run().checked.count(seen)) return it->second;

    DensityResolution r = resolveNew(thermo, set);
    if (it != run().resolved.end())
    {
        if (it->second.methodId != r.methodId || it->second.parts != r.parts
            || it->second.record != r.record || it->second.partRecords != r.partRecords)
            throw PropertyDomainError(PropertyDomainError::Kind::outsideHardDomain,
                "liquid density of the constituent set " + r.setName + ": resolved to "
                + it->second.methodId + " earlier in this run and to " + r.methodId
                + " now.  A method is resolved once per constituent set and never"
                  " handed over; a pass that changes which data exist for the set is"
                  " refused.",
                "keep the data the set's method reads the same across the run's passes");
        run().checked.insert(seen);
        return it->second;
    }
    run().checked.insert(seen);
    run().order.push_back(key);
    return run().resolved.emplace(key, std::move(r)).first->second;
}

std::vector<DensityResolution> densityResolutionsOfRun()
{
    std::lock_guard<std::mutex> lk(mtx());
    freshRun();
    std::vector<DensityResolution> out;
    for (const auto& k : run().order) out.push_back(run().resolved.at(k));
    return out;
}

//  THE PILOT'S ENTRY (LiquidPropertyDoor.H).
Result density(const Request& q)
{
    if (!q.thermo)
        throw std::logic_error("liquidProperty::density: a request names its package");
    const DensityResolution res = resolveDensity(*q.thermo, q.x);
    const DensityAnswer a = build(res, *q.thermo)->evaluate(q.T, q.P, q.x);

    Result r;
    r.value           = a.rho;
    r.methodId        = a.methodId;
    r.label           = a.label;
    r.leaves          = a.leaves;
    r.pressureApplied = a.pressureApplied;
    r.quality         = a.quality;

    std::string type, unit;
    if (q.who) { type = q.who->type; unit = q.who->unit; }
    else if (!PropertySourceLog::instance().current(type, unit)) return r;
    PropertySourceLog::instance().use(type, unit, name(Property::density),
        r.methodId, r.label, "kernel", r.pressureApplied ? "applied" : "not applied", "",
        took(r.value, q.T, q.P > 0.0 ? q.P : std::numeric_limits<double>::quiet_NaN(),
             compositionKey(q.x)));
    return r;
}

} // namespace liquidProperty
} // namespace Choupo
