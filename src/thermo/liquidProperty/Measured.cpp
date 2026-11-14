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

#include "Measured.H"

#include "DensityResolver.H"
#include "SolutionLaw.H"
#include "core/Advisory.H"
#include "core/PropertySourceLog.H"
#include "thermo/PropertyDomainError.H"
#include "thermo/RecordResolver.H"
#include "thermo/ThermoPackage.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <filesystem>
#include <iostream>
#include <limits>
#include <map>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {
namespace liquidProperty {

namespace {

std::string fmt(const char* f, double v)
{
    char b[48];
    std::snprintf(b, sizeof b, f, v);
    return b;
}

std::pair<scalar, scalar> pairOf(const DictPtr& d, const std::string& k, const std::string& where)
{
    const auto v = d->lookupList(k);
    if (v.size() != 2 || !(v[0] <= v[1]))
        throw std::runtime_error(where + ": `" + k + " (lo hi);` needs two increasing limits.");
    return { v[0], v[1] };
}

//  The column unit -> SI factor, for the four columns a density point carries.
scalar toSI(const std::string& col, const std::string& unit, const std::string& where)
{
    if (col == "T")
    {
        if (unit == "K") return 1.0;
    }
    else if (col == "P")
    {
        if (unit == "Pa") return 1.0;
        if (unit == "kPa") return 1.0e3;
        if (unit == "MPa") return 1.0e6;
        if (unit == "bar") return 1.0e5;
    }
    else if (col == "rho")
    {
        if (unit == "kg/m3") return 1.0;
    }
    else if (col.compare(0, 2, "w[") == 0)
    {
        if (unit == "-") return 1.0;
    }
    throw std::runtime_error(where + ": column `" + col + "` in unit `" + unit
        + "` -- a density point is read in K, Pa (kPa, MPa, bar), kg/m3 and mass"
          " fractions `w[<component>]` (unit -).");
}

} // namespace

MeasurementDeclarations& MeasurementDeclarations::instance()
{
    static MeasurementDeclarations d;
    return d;
}

void MeasurementDeclarations::readFrom(const DictPtr& top)
{
    all_.clear();
    if (!top || !top->found("volumetric")) return;
    const DictPtr vol = top->subDict("volumetric");
    for (const auto& k : vol->keys())
        if (k != "liquid")
            throw std::runtime_error("volumetric: unknown word '" + k + "'.  The pilot"
                " reads `volumetric { liquid { measured { ... } } }` only.");
    const DictPtr liq = vol->subDict("liquid");
    for (const auto& k : liq->keys())
        if (k != "measured")
            throw std::runtime_error("volumetric.liquid: unknown word '" + k + "'.  The"
                " pilot reads `measured { <name> { use method | check; ... } }` only.");
    const DictPtr ms = liq->subDict("measured");
    for (const auto& name : ms->keys())
    {
        const DictPtr dec = ms->subDict(name);
        const std::string here = "volumetric.liquid.measured." + name;
        Measurement m;
        m.name = name;
        m.use  = dec->lookupWord("use");
        if (m.use != "method" && m.use != "check")
            throw std::runtime_error(here + ": `use " + m.use + "` -- write `use method;`"
                " (the value is the density of its set inside its box) or `use check;`"
                " (printed beside the computed value, never used).");
        m.reason = dec->lookupWordOrDefault("reason", "");
        if (dec->found("replaces"))
        {
            if (m.use != "method")
                throw std::runtime_error(here + ": `replaces` belongs to `use method`;"
                    " a check replaces nothing.");
            const DictPtr r = dec->subDict("replaces");
            for (const auto& kk : r->keys())
                if (kk != "method" && kk != "record")
                    throw std::runtime_error(here + ".replaces: unknown word '" + kk
                        + "' (method, record).");
            m.replacesMethod = r->lookupWord("method");
            m.replacesRecord = r->lookupWordOrDefault("record", "");
        }
        for (const auto& kk : dec->keys())
            if (kk != "use" && kk != "reason" && kk != "replaces")
                throw std::runtime_error(here + ": unknown word '" + kk + "' (use,"
                    " replaces, reason).");

        const std::string sub = "experiments/" + name + ".dat";
        const auto p = records::localRecord(sub);
        if (p.empty())
            throw std::runtime_error(here + ": no file constant/" + sub + " in this"
                " case.  A measurement the case marks is the case's own data.");
        m.path = p.string();
        const DictPtr f = Dictionary::fromFile(m.path);
        const std::string where = "constant/" + sub;
        m.property = f->lookupWord("property");
        if (m.property != "liquidDensity")
            throw std::runtime_error(where + ": `property " + m.property + "` -- the"
                " pilot reads liquidDensity only.");
        m.solvent = f->lookupWord("solvent");
        m.U       = f->lookupScalar("uncertainty");
        if (f->found("provenance"))
        {
            const DictPtr pv = f->subDict("provenance");
            m.citation = pv->lookupWordOrDefault("citation", pv->lookupWordOrDefault("source", ""));
        }
        const auto cols = f->lookupDictList("columns");
        const auto data = f->lookupList("data");
        if (cols.empty() || data.size() != cols.size())
            throw std::runtime_error(where + ": a marked measurement is ONE point: `data`"
                " carries exactly one value per column (" + std::to_string(cols.size())
                + " columns, " + std::to_string(data.size()) + " values).");
        bool hasT = false, hasP = false, hasRho = false;
        scalar wsum = 0.0;
        for (std::size_t c = 0; c < cols.size(); ++c)
        {
            const std::string col  = cols[c]->lookupWord("name");
            const std::string unit = cols[c]->lookupWord("unit");
            const scalar v = data[c] * toSI(col, unit, where);
            if (col == "T")        { m.T = v; hasT = true; }
            else if (col == "P")   { m.P = v; hasP = true; }
            else if (col == "rho") { m.rho = v; hasRho = true; }
            else
            {
                const std::string cn = col.substr(2, col.size() - 3);
                m.w[cn] = v;
                wsum += v;
                m.constituents.push_back(cn);
            }
        }
        if (!hasT || !hasP || !hasRho || m.w.empty())
            throw std::runtime_error(where + ": a density point carries T, P, rho and at"
                " least one mass fraction w[<component>].");
        m.w[m.solvent] = 1.0 - wsum;
        m.constituents.push_back(m.solvent);

        //  EVERY DECLARED MEASUREMENT IS USED, CHECKED OR REFUSED -- never
        //  dropped (C378 pilot review, PA-05).  A column naming a component
        //  the case does not have (`w[NaHO]`) made a set no unit ever asks
        //  for, and the catalogue's law priced the unit in silence.  So: every
        //  key of the file is one the reader knows; every constituent is one
        //  of the case's components; and the file's `system` is exactly the
        //  set its columns describe.
        static const char* const fileKeys[] = { "provenance", "system", "property",
            "solvent", "columns", "data", "uncertainty", "box" };
        for (const auto& k : f->keys())
            if (std::find(std::begin(fileKeys), std::end(fileKeys), k) == std::end(fileKeys))
                throw std::runtime_error(where + ": unknown word '" + k + "'.  A density"
                    " point reads provenance, system, property, solvent, columns, data,"
                    " uncertainty and box.");
        if (top->found("components"))
        {
            const auto comps = top->lookupWordList("components");
            for (const auto& c : m.constituents)
                if (std::find(comps.begin(), comps.end(), c) == comps.end())
                    throw std::runtime_error(here + " (" + where + "): '" + c + "' is not"
                        " one of the case's components, so no constituent set of this run"
                        " can match the measurement and it would never be used.  Remedy:"
                        " name the columns `w[<component>]` and the `solvent` by the"
                        " case's component names.");
        }
        if (f->found("system"))
        {
            auto sys = f->lookupWordList("system");
            auto mine = m.constituents;
            std::sort(sys.begin(), sys.end());
            std::sort(mine.begin(), mine.end());
            if (sys != mine)
                throw std::runtime_error(where + ": `system` names a set its columns do"
                    " not describe (the mass-fraction columns and the solvent give the"
                    " set of the measurement).  Remedy: make `system ( ... );` and the"
                    " `w[...]` columns plus `solvent` name the same components.");
        }
        const DictPtr box = f->subDict("box");
        for (const auto& k : box->keys())
        {
            const bool known = k == "T" || k == "P"
                || (k.compare(0, 2, "w[") == 0 && k.back() == ']'
                    && m.w.count(k.substr(2, k.size() - 3)) && k.substr(2, k.size() - 3) != m.solvent);
            if (!known)
                throw std::runtime_error(where + " box: unknown word '" + k + "'.  The box"
                    " reads T, P and one w[<component>] per mass-fraction column.");
        }
        m.boxT = pairOf(box, "T", where + " box");
        m.boxP = pairOf(box, "P", where + " box");
        for (const auto& kv : m.w)
            if (kv.first != m.solvent)
                m.boxW[kv.first] = pairOf(box, "w[" + kv.first + "]", where + " box");
        if (!(m.T >= m.boxT.first && m.T <= m.boxT.second && m.P >= m.boxP.first
              && m.P <= m.boxP.second))
            throw std::runtime_error(where + ": the measured point is outside its own box.");
        all_.push_back(std::move(m));
    }
}

std::map<std::string, scalar> Measured::massFractions(const ThermoPackage& thermo,
    const std::vector<std::size_t>& set, const sVector& x)
{
    std::map<std::string, scalar> w;
    scalar M = 0.0;
    for (const std::size_t i : set) M += std::max<scalar>(x[i], 0.0) * thermo.comp(i).MW();
    for (const std::size_t i : set)
        w[thermo.comp(i).name()] = M > 0.0 ? std::max<scalar>(x[i], 0.0) * thermo.comp(i).MW() / M : 0.0;
    return w;
}

std::string Measured::outsideBox(const Measurement& m, scalar T, scalar P,
                                 const std::map<std::string, scalar>& w)
{
    if (T < m.boxT.first || T > m.boxT.second)
        return "T = " + fmt("%.6g K", T) + " (box " + fmt("%.6g", m.boxT.first)
             + fmt("-%.6g K", m.boxT.second) + ")";
    if (P < m.boxP.first || P > m.boxP.second)
        return "P = " + fmt("%.6g Pa", P) + " (box " + fmt("%.6g", m.boxP.first)
             + fmt("-%.6g Pa", m.boxP.second) + ")";
    for (const auto& kv : m.boxW)
    {
        const auto it = w.find(kv.first);
        const scalar v = it == w.end() ? 0.0 : it->second;
        if (v < kv.second.first || v > kv.second.second)
            return "w[" + kv.first + "] = " + fmt("%.6g", v) + " (box " + fmt("%.6g", kv.second.first)
                 + fmt("-%.6g", kv.second.second) + ")";
    }
    return "";
}

Measured::Measured(const Binding& b)
  : thermo_(b.thermo), set_(b.set)
{
    for (const auto& m : MeasurementDeclarations::instance().all())
        if (m.name == b.recordName) m_ = m;
    if (m_.name.empty())
        throw std::logic_error("Measured: no measurement named " + b.recordName);
    if (!b.parts.empty()) replaced_ = b.parts.front();

    //  THE BOX AGAINST THE UNCERTAINTY: the replaced law's span over the
    //  box's corners (T and each mass fraction at its limits, P at the
    //  point), against the stated uncertainty.
    bool judged = false;
    if (replaced_)
    {
        try
        {
            std::vector<std::vector<scalar>> axes{ { m_.boxT.first, m_.boxT.second } };
            std::vector<std::string> names;
            for (const auto& kv : m_.boxW)
            { names.push_back(kv.first); axes.push_back({ kv.second.first, kv.second.second }); }
            const std::size_t n = axes.size();
            auto at = [&](scalar T, const std::map<std::string, scalar>& w) {
                sVector x(thermo_->n(), 0.0);
                scalar sum = 0.0;
                for (const std::size_t i : set_)
                {
                    const auto it = w.find(thermo_->comp(i).name());
                    const scalar wi = it != w.end() ? it->second : 0.0;
                    x[i] = wi / thermo_->comp(i).MW(); sum += x[i];
                }
                for (auto& v : x) v /= sum;
                return replaced_->evaluate(T, m_.P, x).rho;
            };
            auto wAt = [&](const std::vector<scalar>& corner) {
                std::map<std::string, scalar> w;
                scalar s = 0.0;
                for (std::size_t k = 0; k < names.size(); ++k) { w[names[k]] = corner[k + 1]; s += corner[k + 1]; }
                w[m_.solvent] = 1.0 - s;
                return w;
            };
            const scalar r0 = at(m_.T, m_.w);
            scalar span = 0.0;
            for (std::size_t mask = 0; mask < (std::size_t(1) << n); ++mask)
            {
                std::vector<scalar> c(n);
                for (std::size_t k = 0; k < n; ++k) c[k] = axes[k][(mask >> k) & 1];
                span = std::max(span, std::fabs(at(c[0], wAt(c)) - r0));
            }
            judged = true;
            hypothesis_ = span > m_.U;
        }
        catch (const std::exception&) { judged = false; }
    }
    if ((!judged || hypothesis_) && m_.reason.find_first_not_of(" \t") == std::string::npos)
        throw PropertyDomainError(PropertyDomainError::Kind::missingDatum,
            "volumetric.liquid.measured." + m_.name + ": its box is "
            + std::string(judged ? "wider than the measurement's uncertainty (the law's"
                                   " span over the box exceeds " + fmt("%.6g kg/m3", m_.U)
                                   + "), so standing the point in it is a hypothesis"
                                 : "not judged: no law applies to the set to measure"
                                   " its span against the uncertainty")
            + "; write its `reason \"...\";`.",
            "a reason for the box, or a box no wider than the uncertainty");
    if (!judged) hypothesis_ = true;
}

DensityAnswer Measured::evaluate(scalar T, scalar P, const sVector& x) const
{
    const auto w = massFractions(*thermo_, set_, x);
    const std::string out = outsideBox(m_, T, P, w);
    if (!out.empty())
        throw PropertyDomainError(PropertyDomainError::Kind::outsideHardDomain,
            "liquid density of " + setDisplayName(*thermo_, set_) + ": " + out
            + " is outside the box the case declared for its measurement " + m_.name
            + " (constant/experiments/" + m_.name + ".dat).  A marked measurement is the set's method and is"
              " never extrapolated nor handed over to another.",
            "a state inside the box, or a wider box with its reason (a hypothesis)");

    DensityAnswer a;
    a.rho = m_.rho;
    scalar M = 0.0;
    for (const std::size_t i : set_) M += std::max<scalar>(x[i], 0.0) * thermo_->comp(i).MW();
    scalar zs = 0.0;
    for (const std::size_t i : set_) zs += std::max<scalar>(x[i], 0.0);
    a.v = (M / zs / 1000.0) / a.rho;
    a.methodId = id();
    a.label = "property kernel: the case's measurement " + m_.name + " ("
            + (m_.citation.empty() ? "constant/experiments/" + m_.name + ".dat" : m_.citation) + "), "
            + fmt("%.6g kg/m3", m_.rho) + " at every state inside the box the case declared"
            + (replaced_ ? "; replaces " + replaced_->id() : std::string());
    for (const std::size_t i : set_)
        a.leaves.push_back({ thermo_->comp(i).name(), id(), zs > 0 ? x[i] / zs : 0.0 });
    a.pressureApplied = false;
    const bool atPoint = std::fabs(T - m_.T) < 1e-9 && std::fabs(P - m_.P) <= 1e-9 * m_.P;
    a.quality.origin     = (hypothesis_ && !atPoint) ? "assumed" : "literature";
    a.quality.provenance = "constant/experiments/" + m_.name + ".dat";
    a.quality.domain     = "inside the case's box (hard)";
    a.quality.evidence   = "expanded uncertainty " + fmt("%.6g kg/m3", m_.U);

    //  WHAT IT BEAT, IN THE OPEN (amendment 2): the replaced method's value at
    //  this state and the deviation; a FINDING when above that method's
    //  stated maximum deviation.
    if (replaced_)
    {
        std::string type, unit;
        const std::string site = PropertySourceLog::instance().current(type, unit)
                               ? type + " " + unit : std::string("no unit");
        std::string msg;
        bool counted = false;
        try
        {
            const scalar r = replaced_->evaluate(T, P, x).rho;
            const auto* law = dynamic_cast<const SolutionLaw*>(replaced_.get());
            const scalar lim = law ? law->maxDeviation() : std::numeric_limits<scalar>::quiet_NaN();
            counted = (lim == lim) && std::fabs(m_.rho - r) > lim;
            msg = "measured " + m_.name + " " + fmt("%.6g kg/m3", m_.rho) + " replaces "
                + replaced_->id() + " (" + fmt("%.6g kg/m3", r) + " there, "
                + fmt("%+.3g %%", (r / m_.rho - 1.0) * 100.0) + "; "
                + (lim == lim ? std::string(counted ? "BEYOND" : "inside") + " its stated "
                                + fmt("%.6g kg/m3", lim)
                              : std::string("its uncertainty is not quantified")) + ")";
        }
        catch (const std::exception& e)
        {
            msg = "measured " + m_.name + " replaces " + replaced_->id()
                + ", which gives no value at this state: " + e.what();
        }
        if (AdvisoryLog::instance().addAnnouncedOnce("liquidDensityMeasured:" + m_.name + ":" + site,
                counted ? "finding" : "approximation", counted ? "warning" : "info",
                "liquid density (" + site + ")", msg))
            std::cout << "  [liquid density] " << msg << "\n";
    }
    return a;
}

} // namespace liquidProperty
} // namespace Choupo
