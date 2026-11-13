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
#include "Measured.H"
#include "SolutionLaw.H"
#include "core/Advisory.H"
#include "core/PropertySourceLog.H"
#include "thermo/ApproximationAuthorisation.H"
#include "thermo/LiquidPropertyDoor.H"
#include "thermo/PropertyDomainError.H"
#include "thermo/RecordResolver.H"
#include "thermo/ThermoPackage.H"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <cstdio>
#include <filesystem>
#include <iostream>
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

//  THE WORLD, for the "resolves differently" refusal (C378 pilot review,
//  PA-03).  A per-unit `thermo {}` declares a second world over the same
//  components; it is a second recipe, never a contradiction of the first.
//  The identity is therefore every per-component fact the resolution
//  READS from the package -- the name, the pure-fluid selection, whether the
//  formulation makes it a Henry solute, and which liquid-volume route its
//  record offers -- so two worlds that can resolve differently are two
//  identities.  It is not the package's serial: a pass that rebuilds the
//  SAME world gets a new serial, and the refusal exists for that world --
//  one whose resolution would change between passes because the data the
//  set's method reads changed.  (The measurement and the hypothesis are the
//  case's, one per run, and read the same by every world.)
std::string packageIdentity(const ThermoPackage& thermo)
{
    std::string s;
    for (std::size_t i = 0; i < thermo.n(); ++i)
        s += thermo.comp(i).name() + "/" + thermo.pureFluidMethod(i)
           + "/" + (thermo.isHenrySolute(i) ? "henry" : "-")
           + "/" + std::to_string(static_cast<int>(thermo.liquidVolumeRouteOf(i))) + ";";
    return s;
}

using Key = std::pair<std::string, std::vector<std::size_t>>;   // (identity, set)

struct RunState
{
    unsigned generation = 0;
    //  THE PACKAGE'S SERIAL, never its address (ruling 6): a package built
    //  where another one died has a serial of its own and inherits nothing.
    std::map<std::pair<unsigned long long, std::vector<std::size_t>>, DensityResolution> bySerial;
    //  The first resolution of each (identity, set) in the run.
    std::map<Key, DensityResolution> first;
    std::vector<Key> order;
    //  The hypothesis' use (component list -> largest mass-fraction sum).
    std::map<std::string, double> massless;
};

//  WHAT THE MUTEX PROTECTS: the RunState above (the caches and the lines
//  already printed) and nothing else.  It is held only while those maps
//  are read or written -- never while a method is resolved, built or
//  evaluated, because a method may call back into this file (a marked
//  measurement evaluates the method it replaces, whose massWithoutVolume
//  leaf reported back to a tally here): held across that, the same thread
//  waited on itself forever (C378 pilot review, PA-02).
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
    std::vector<std::string> names{ c.name() };
    for (const auto& a : c.aliases()) names.push_back(a);
    const fs::path stdDir = records::standardsRecord("parameters/Helmholtz");
    std::map<int, std::vector<std::pair<std::string, std::string>>> byTier;
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
    //  A sealed case without its copy has no such fact; the seal copies every
    //  record that names a component (bin/choupo-import, ruling 1).
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
    const bool declaredMassless =
        ApproximationAuthorisation::instance().massWithoutVolume().count(c) > 0;
    //  ONE READING OF THE HYPOTHESIS (C378 pilot review, PA-04): a component
    //  the case lists under `massWithoutVolume` keeps its mass and adds no
    //  volume, WHATEVER volume its record carries -- that is what the
    //  declaration says, and `maxMassFraction` bounds it.  Before, a listed
    //  component with a volume took its volume and the list was read only by
    //  the pump's heat capacity, which is not a volume question at all.
    if (declaredMassless)
    {
        passed.push_back("its own volume (" + c + "): the case lists it under"
            " massWithoutVolume, which the density honours whatever the record holds");
        return "massWithoutVolume";
    }
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
        passed.push_back("recordVolume (" + c + "): a declared Henry solute has no pure-liquid leaf");
        why = "'" + c + "' is a declared Henry solute: its volume in the liquid is a"
              " partial molar volume (`v_inf`), which this kernel does not read, so no"
              " pure-liquid volume stands for it, and no `massWithoutVolume` covers it";
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
        passed.push_back("recordVolume (" + c + "): neither `Vliq` nor Tc, Pc in its record");
        why = "'" + c + "' has no liquid volume: its record carries neither `Vliq`"
              " nor the critical constants Tc and Pc, and no `massWithoutVolume`"
              " covers it";
        return "";
    }
    return "recordVolume";
}

//  THE CATALOGUE'S CHOICE (tiers 2b-5), without the case's measurement.
DensityResolution resolveCatalogue(const ThermoPackage& thermo, const std::vector<std::size_t>& set)
{
    DensityResolution r;
    r.set     = set;
    r.setName = setDisplayName(thermo, set);

    //  (2b) ONE constituent: the case's own pure-fluid selection pins it;
    //  else a reference equation that names it -- the order a leaf follows,
    //  so the set {i} and the leaf i inside a mixture agree as x_i -> 1.
    if (set.size() == 1 && !thermo.isHenrySolute(set.front()))
    {
        std::string record, why;
        std::vector<std::string> passed;
        const std::string leaf = leafFor(thermo, set.front(), passed, why, record);
        if (leaf == "pureFluid" || leaf == "referenceEquation")
        {
            r.method = leaf;
            r.record = record;
            r.passedOver = passed;
            return r;
        }
    }
    //  (2b) TWO OR MORE: a solution record for exactly the set.
    std::vector<std::string> missing;
    if (set.size() >= 2)
    {
        const std::string rec = SolutionLaw::recordFor(thermo, set);
        std::string listed;
        for (const std::size_t i : set)
            if (ApproximationAuthorisation::instance().massWithoutVolume().count(thermo.comp(i).name()))
                listed += (listed.empty() ? "" : ", ") + thermo.comp(i).name();
        if (!rec.empty() && !listed.empty())
            r.passedOver.push_back("solutionLaw." + rec + ": the case lists " + listed
                + " under massWithoutVolume, a hypothesis the solution's own law cannot"
                  " hold, so the set is mixed by additive volumes");
        else if (!rec.empty())
        {
            r.method = "solutionLaw";
            r.record = rec;
            return r;
        }
        else
            r.passedOver.push_back("solutionLaw: no solution record with a liquidDensity"
                " block for this set (parameters/solution/" + setFileName(thermo, set) + ".dat)");
    }
    //  (3) additive volumes, one leaf per constituent.
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
            + ": no method applies.  ";
        if (set.size() >= 2)
            msg += "No solution record covers this set (the kind of record that would:"
                   " parameters/solution/" + setFileName(thermo, set) + ".dat, a"
                   " `liquidDensity` law for exactly these constituents); and ";
        msg += "idealMixing (additive volumes) needs a volume for every constituent: ";
        for (std::size_t k = 0; k < missing.size(); ++k)
            msg += (k ? "; " : "") + missing[k];
        msg += ".  Remedy: a solution record for this set (from measured densities of"
               " the mixture), a liquid volume in each such component's record (`Vliq`,"
               " or Tc and Pc), or the declared hypothesis `approximations {"
               " massWithoutVolume { components ( ... ); maxMassFraction <w>; reason"
               " \"...\"; } }`.";
        throw PropertyDomainError(PropertyDomainError::Kind::missingDatum, msg,
            "a solution record for the set, a liquid volume for each constituent, or"
            " the hypothesis massWithoutVolume");
    }
    r.method = "idealMixing";
    return r;
}

std::vector<std::string> namesOf(const ThermoPackage& thermo, const std::vector<std::size_t>& set)
{
    std::vector<std::string> n;
    for (const std::size_t i : set) n.push_back(thermo.comp(i).name());
    std::sort(n.begin(), n.end());
    return n;
}

//  (1) THE CASE'S MEASUREMENT MARKED FOR USE, over the catalogue's choice.
DensityResolution resolveNew(const ThermoPackage& thermo, const std::vector<std::size_t>& set)
{
    const auto here = namesOf(thermo, set);
    const Measurement* marked = nullptr;
    for (const auto& m : MeasurementDeclarations::instance().all())
    {
        auto c = m.constituents;
        std::sort(c.begin(), c.end());
        if (m.use != "method" || c != here) continue;
        if (marked)
            throw PropertyDomainError(PropertyDomainError::Kind::missingDatum,
                "liquid density of " + setDisplayName(thermo, set) + ": two measurements"
                " are marked for use (" + marked->name + ", " + m.name + "); one set has"
                " one method.", "mark one; keep the other as `use check;`");
        marked = &m;
    }
    if (!marked)
    {
        DensityResolution r = resolveCatalogue(thermo, set);
        r.methodId = build(r, thermo)->id();
        return r;
    }

    //  The catalogue method the measurement displaces: named, and applying.
    DensityResolution cat;
    std::string catWhy;
    bool catApplies = true;
    try { cat = resolveCatalogue(thermo, set); }
    catch (const PropertyDomainError& e) { catApplies = false; catWhy = e.what(); }
    const std::string here0 = "volumetric.liquid.measured." + marked->name;
    if (catApplies)
    {
        if (marked->replacesMethod.empty())
            throw PropertyDomainError(PropertyDomainError::Kind::missingDatum,
                here0 + " is marked `use method` for " + setDisplayName(thermo, set)
                + " without `replaces`, while the catalogue method " + cat.method
                + " applies to that set.  A value of the case displaces a catalogue"
                  " method only by an explicit act.",
                "`replaces { method " + cat.method + ";"
                + (cat.record.empty() ? std::string()
                                      : " record " + fs::path(cat.record).stem().string() + ";")
                + " }`, or `use check;`");
        const std::string catRecord = cat.method == "solutionLaw"
            ? fs::path(cat.record).stem().string() : cat.record;
        if (marked->replacesMethod != cat.method
            || (!marked->replacesRecord.empty() && marked->replacesRecord != catRecord))
            throw PropertyDomainError(PropertyDomainError::Kind::missingDatum,
                here0 + " `replaces { method " + marked->replacesMethod
                + (marked->replacesRecord.empty() ? "" : "; record " + marked->replacesRecord)
                + "; }`, but the method that applies to " + setDisplayName(thermo, set)
                + " is " + cat.method + (catRecord.empty() ? "" : " (" + catRecord + ")")
                + ".  It may displace only the method that applies.",
                "name the applying method in `replaces`");
    }
    else if (!marked->replacesMethod.empty())
        throw PropertyDomainError(PropertyDomainError::Kind::missingDatum,
            here0 + " `replaces " + marked->replacesMethod + "`, but no catalogue method"
            " applies to " + setDisplayName(thermo, set) + " (" + catWhy + ").",
            "drop `replaces`: the measurement is then the set's only method");

    DensityResolution r;
    r.set     = set;
    r.setName = setDisplayName(thermo, set);
    r.method  = "measured";
    r.record  = marked->name;
    if (catApplies)
    {
        r.under.push_back(cat);
        r.passedOver.push_back(cat.method + (cat.record.empty() ? "" : " (" + fs::path(cat.record).stem().string() + ")")
            + ": replaced by the case's measurement " + marked->name);
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
    for (const auto& u : r.under) b.parts.push_back(build(u, thermo));
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

    const auto sk = std::make_pair(thermo.serial(), set);
    {
        std::lock_guard<std::mutex> lk(mtx());
        freshRun();
        const auto it = run().bySerial.find(sk);
        if (it != run().bySerial.end()) return it->second;
    }

    //  Resolved WITHOUT the lock (see mtx()): resolution may build and
    //  evaluate methods, and those may report back to this file.
    DensityResolution r = resolveNew(thermo, set);

    std::lock_guard<std::mutex> lk(mtx());
    freshRun();
    const auto again = run().bySerial.find(sk);       // another thread got here first
    if (again != run().bySerial.end()) return again->second;
    const Key key{ packageIdentity(thermo), set };
    const auto f = run().first.find(key);
    if (f != run().first.end())
    {
        if (f->second.methodId != r.methodId || f->second.parts != r.parts
            || f->second.record != r.record || f->second.partRecords != r.partRecords)
            throw PropertyDomainError(PropertyDomainError::Kind::outsideHardDomain,
                "liquid density of the constituent set " + r.setName + ": resolved to "
                + f->second.methodId + " earlier in this run and to " + r.methodId
                + " now.  A method is resolved once per constituent set and never"
                  " handed over; a pass that changes which data exist for the set is"
                  " refused.",
                "keep the data the set's method reads the same across the run's passes");
    }
    else
    {
        run().first.emplace(key, r);
        run().order.push_back(key);
    }
    return run().bySerial.emplace(sk, std::move(r)).first->second;
}

std::vector<DensityResolution> densityResolutionsOfRun()
{
    std::lock_guard<std::mutex> lk(mtx());
    freshRun();
    std::vector<DensityResolution> out;
    for (const auto& k : run().order) out.push_back(run().first.at(k));
    return out;
}

void noteMassWithoutVolume(const std::string& components, double w)
{
    std::lock_guard<std::mutex> lk(mtx());
    freshRun();
    double& m = run().massless[components];
    m = std::max(m, w);
}

std::map<std::string, double> massWithoutVolumeOfRun()
{
    std::lock_guard<std::mutex> lk(mtx());
    freshRun();
    return run().massless;
}

//  THE PRESSURE ABOVE WHICH A METHOD THAT TAKES NONE IS ANNOUNCED [Pa].  A
//  liquid's isothermal compressibility is about 5e-10 per Pa (water 4.6e-10
//  at 25 C), so 2 MPa is a 0.1 % density effect -- the order a golden's
//  1e-4 tolerance can see.  Below it the table's pressure column ("not
//  applied") is the statement; an advisory on every pump would be noise.
constexpr double pressureAnnouncedAbove = 2.0e6;

//  THE PILOT'S ENTRY (LiquidPropertyDoor.H).
Result density(const Request& q)
{
    if (!q.thermo)
        throw std::logic_error("liquidProperty::density: a request names its package");
    const DensityResolution res = resolveDensity(*q.thermo, q.x);
    DensityAnswer a;
    try { a = build(res, *q.thermo)->evaluate(q.T, q.P, q.x); }
    catch (const PropertyDomainError& e)
    {
        //  A STATE OUTSIDE A HARD DOMAIN, OR NOT A STATE, IS A REJECTABLE
        //  TRIAL (plan section 7): a solver that can reject a step does; a
        //  converged or final state fails the run with the remedy.  A missing
        //  datum is a resolution failure, never a property of the state.
        if (e.kind == PropertyDomainError::Kind::missingDatum) throw;
        throw PropertyDomainTrial(e.kind, e.what(), e.remedy);
    }

    Result r;
    r.value           = a.rho;
    r.methodId        = a.methodId;
    r.label           = a.label;
    r.leaves          = a.leaves;
    r.pressureApplied = a.pressureApplied;
    r.quality         = a.quality;

    std::string type, unit;
    const bool site = q.who ? (type = q.who->type, unit = q.who->unit, true)
                            : PropertySourceLog::instance().current(type, unit);

    //  THE CASE'S CHECK-ONLY MEASUREMENTS OF THIS SET: printed beside the
    //  value, never used (plan section 5).
    {
        const auto here = namesOf(*q.thermo, res.set);
        for (const auto& m : MeasurementDeclarations::instance().all())
        {
            auto c = m.constituents;
            std::sort(c.begin(), c.end());
            if (m.use != "check" || c != here) continue;
            const auto w = Measured::massFractions(*q.thermo, res.set, q.x);
            const std::string out = Measured::outsideBox(m, q.T, q.P, w);
            char b[200];
            std::string msg;
            if (out.empty())
            {
                std::snprintf(b, sizeof b, " %.6g kg/m3 against %.6g kg/m3 computed (%+.3g %%)",
                              m.rho, r.value, (r.value / m.rho - 1.0) * 100.0);
                msg = "check " + m.name + ":" + b + " by " + r.methodId;
            }
            else
            {
                std::snprintf(b, sizeof b, " (measured at %.6g K; here %.6g K, %+.6g K away)",
                              m.T, q.T, q.T - m.T);
                msg = "check " + m.name + ": not at its conditions -- " + out + b
                    + "; computed " + std::to_string(r.value) + " kg/m3 by " + r.methodId;
            }
            const std::string where = site ? type + " " + unit : std::string("no unit");
            if (AdvisoryLog::instance().addAnnouncedOnce("liquidDensityCheck:" + m.name + ":" + where,
                    "validity", "info", "liquid density (" + where + ")", msg))
                std::cout << "  [liquid density] " << msg << "\n";
        }
    }

    if (!site) return r;
    //  "PRESSURE NOT APPLIED": the table's pressure column says it on every
    //  such row, always; the ADVISORY is raised only where it can matter
    //  (ruling 2 at hand-back B), once per method and unit.
    if (!r.pressureApplied && q.P > pressureAnnouncedAbove
        && AdvisoryLog::instance().addAnnouncedOnce(
               "liquidDensityPressure:" + r.methodId + ":" + type + " " + unit,
               "approximation", "info", type + " " + unit,
               "liquid density by " + r.methodId + ": pressure is not applied (the method"
               " carries no pressure term) at " + std::to_string(q.P * 1.0e-6) + " MPa, above "
               "the 2 MPa where a liquid's compressibility (about 5e-10 per Pa) reaches 0.1 %"))
        std::cout << "  [liquid density] " << type << " " << unit << ": " << r.methodId
                  << " carries no pressure term; pressure not applied\n";
    PropertySourceLog::instance().use(type, unit, name(Property::density),
        r.methodId, r.label, "kernel", r.pressureApplied ? "applied" : "not applied", "",
        took(r.value, q.T, q.P > 0.0 ? q.P : std::numeric_limits<double>::quiet_NaN(),
             compositionKey(q.x)));
    return r;
}

} // namespace liquidProperty
} // namespace Choupo
