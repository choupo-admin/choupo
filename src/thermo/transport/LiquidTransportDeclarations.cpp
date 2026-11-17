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
-------------------------------------------------------------------------------
Description
    The readers of LiquidTransportDeclarations.H (C398 slice (d)).
\*---------------------------------------------------------------------------*/

#include "LiquidTransportDeclarations.H"

#include "core/Advisory.H"
#include "core/Dimensions.H"
#include "core/PropertySourceLog.H"
#include "core/RegistryRefusal.H"
#include "thermo/Component.H"
#include "thermo/ThermoPackage.H"
#include "thermo/liquidProperty/ExperimentsFile.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <functional>
#include <iostream>
#include <map>
#include <mutex>
#include <set>
#include <stdexcept>

namespace Choupo {
namespace liquidTransport {

namespace {

std::string fmt(const char* f, double v)
{
    char b[48];
    std::snprintf(b, sizeof b, f, v);
    return b;
}

std::size_t indexOf(const std::vector<Component>& comps, const std::string& name,
                    const std::string& where)
{
    for (std::size_t i = 0; i < comps.size(); ++i)
        if (comps[i].name() == name) return i;
    std::string have;
    for (const auto& c : comps) have += (have.empty() ? "" : ", ") + c.name();
    throw std::runtime_error(where + ": '" + name + "' is not one of the system's"
        " components (" + have + ").");
}

//  ONE POINT OF AN EXPERIMENTS FILE, read by slice (c)'s one reader
//  (thermo/liquidProperty/ExperimentsFile.H): the file comes from the
//  experiments/ folder of the constant/ that DECLARES the entry citing it
//  (`@experimentsDir`, stamped by the dictionary's reader; review row TG-02 on
//  slice (c)), never from an ancestor; each column is checked against the
//  dimension its name gives (U1-U2).
struct PointFile
{
    experiments::File           f;
    experiments::Table          t;
    std::vector<std::string>    names;            // column names, in order
    std::size_t rows() const { return t.rows(); }
    bool has(const std::string& c) const
    { return std::find(names.begin(), names.end(), c) != names.end(); }
    scalar at(std::size_t r, const std::string& c) const
    {
        const auto it = std::find(names.begin(), names.end(), c);
        if (it == names.end())
            throw std::runtime_error(f.where + ": no column `" + c + "`.");
        return t.si[static_cast<std::size_t>(it - names.begin())].at(r);
    }
};

experiments::ColumnRole role(const Dimensions& d, const char* what, bool affine = false)
{
    experiments::ColumnRole r;
    r.dims = d;
    r.what = what;
    r.affineAllowed = affine;
    return r;
}

PointFile readPointFile(const std::string& name, const std::string& here, const DictPtr& citing,
                        const std::function<experiments::ColumnRole(const std::string&)>& roleOf)
{
    PointFile pf;
    experiments::refuseWrittenExperimentsDir(citing, here);
    const std::string dir = citing->lookupWordOrDefault(experiments::experimentsDirKey(), "");
    pf.f = experiments::readFile(name, "", here, dir);
    std::vector<experiments::ColumnRole> roles;
    if (pf.f.dict->found("columns") && pf.f.dict->hasDictList("columns"))
        for (const auto& c : pf.f.dict->lookupDictList("columns"))
        {
            const std::string cn = c->lookupWordOrDefault("name", "");
            if (std::find(pf.names.begin(), pf.names.end(), cn) != pf.names.end())
                throw std::runtime_error(pf.f.where + ": column `" + cn + "` twice.");
            pf.names.push_back(cn);
            roles.push_back(roleOf(cn));
        }
    pf.t = experiments::readTable(pf.f.dict, roles, pf.f.where);
    return pf;
}

void onlyKeys(const DictPtr& d, const std::vector<std::string>& allowed0, const std::string& where)
{
    std::vector<std::string> allowed = allowed0;
    allowed.push_back(experiments::experimentsDirKey());   // stamped by the reader (TG-02), never written
    experiments::refuseWrittenExperimentsDir(d, where);     // TG-17: refused by name, before "unknown word"
    for (const auto& k : d->keys())
        if (std::find(allowed.begin(), allowed.end(), k) == allowed.end())
        {
            std::string list;
            for (const auto& a : allowed0) list += (list.empty() ? "" : ", ") + a;
            throw std::runtime_error(where + ": unknown word '" + k + "' -- this block"
                " reads " + list + ".");
        }
}

std::pair<scalar, scalar> pairOf(const DictPtr& d, const std::string& k, const std::string& where)
{
    if (!d->found(k))
        throw std::runtime_error(where + ": no `" + k + " (lo hi);` -- the box names the"
            " extent the case stands the value over, on every axis.");
    const auto v = d->lookupList(k);
    if (v.size() != 2 || !(v[0] <= v[1]))
        throw std::runtime_error(where + ": `" + k + " (lo hi);` needs two increasing limits.");
    return { v[0], v[1] };
}

bool blank(const std::string& s) { return s.find_first_not_of(" \t") == std::string::npos; }

} // namespace

// ===========================================================================
//  (1) a measured mixture viscosity
// ===========================================================================
const char* quantityWord(const std::string& property)
{
    if (property == "liquidThermalConductivity") return "liquid thermal conductivity";
    if (property == "surfaceTension")            return "surface tension";
    return "liquid viscosity";
}

const char* valueColumn(const std::string& property)
{
    if (property == "liquidThermalConductivity") return "lambda";
    if (property == "surfaceTension")            return "sigma";
    return "mu";
}

const char* valueUnit(const std::string& property)
{
    if (property == "liquidThermalConductivity") return "W/(m K)";
    if (property == "surfaceTension")            return "N/m";
    return "Pa s";
}

namespace {

//  One axis at a time (C421 slice (8), R1-R2): the interpolation of y(x) at
//  `x` over the nodes `xs` (strictly increasing, at least two) with the
//  declared word.  On a node (to 1e-12 of the axis) the node's own value is
//  returned.  The four words are those of the table law
//  (PropertyTable.H); the cubic is the Fritsch-Carlson monotone Hermite
//  interpolant (1980).  `x` is inside [xs.front(), xs.back()] (the caller
//  clamps it: between the support and the authorised box the edge's value
//  stands).
scalar interpolate1(const std::vector<scalar>& xs, const std::vector<scalar>& ys,
                    const std::string& how, scalar x)
{
    const std::size_t n = xs.size();
    for (std::size_t k = 0; k < n; ++k)
        if (std::fabs(x - xs[k]) <= 1.0e-12 * (1.0 + std::fabs(xs[k]))) return ys[k];
    std::size_t k = 0;
    while (k + 2 < n && x > xs[k + 1]) ++k;               // segment holding x
    const scalar h = xs[k + 1] - xs[k];
    if (how == "linear")
        return ys[k] + (x - xs[k]) / h * (ys[k + 1] - ys[k]);
    if (how == "logLinear")
        return std::exp(std::log(ys[k]) + (x - xs[k]) / h * (std::log(ys[k + 1]) - std::log(ys[k])));
    if (how == "logReciprocal")
    {
        const scalar wgt = (1.0 / x - 1.0 / xs[k]) / (1.0 / xs[k + 1] - 1.0 / xs[k]);
        return std::exp(std::log(ys[k]) + wgt * (std::log(ys[k + 1]) - std::log(ys[k])));
    }
    //  monotoneCubic: secant mean at the inner nodes (zero where the secants
    //  change sign or one is zero), one-sided at the ends, then the circle
    //  a^2 + b^2 <= 9 on each segment.
    std::vector<scalar> d(n - 1), m(n, 0.0);
    for (std::size_t j = 0; j + 1 < n; ++j) d[j] = (ys[j + 1] - ys[j]) / (xs[j + 1] - xs[j]);
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (std::size_t j = 1; j + 1 < n; ++j)
        m[j] = (d[j - 1] * d[j] <= 0.0) ? 0.0 : 0.5 * (d[j - 1] + d[j]);
    for (std::size_t j = 0; j + 1 < n; ++j)
    {
        if (d[j] == 0.0) { m[j] = 0.0; m[j + 1] = 0.0; continue; }
        const scalar a = m[j] / d[j], b = m[j + 1] / d[j];
        const scalar r2 = a * a + b * b;
        if (r2 > 9.0)
        {
            const scalar tau = 3.0 / std::sqrt(r2);
            m[j] = tau * a * d[j];
            m[j + 1] = tau * b * d[j];
        }
    }
    const scalar t = (x - xs[k]) / h, t2 = t * t, t3 = t2 * t;
    return (2.0 * t3 - 3.0 * t2 + 1.0) * ys[k] + (t3 - 2.0 * t2 + t) * h * m[k]
         + (-2.0 * t3 + 3.0 * t2) * ys[k + 1] + (t3 - t2) * h * m[k + 1];
}

} // namespace

std::vector<ViscosityMeasurement>
readViscosityMeasurements(const DictPtr& block, const std::vector<Component>& comps)
{
    return readMeasurements(block, comps, "liquidViscosity");
}

std::vector<MixtureMeasurement>
readMeasurements(const DictPtr& block, const std::vector<Component>& comps,
                 const std::string& property)
{
    std::vector<MixtureMeasurement> out;
    if (!block || !block->found("measured")) return out;
    const std::string quantity = quantityWord(property);
    const std::string vcol     = valueColumn(property);
    const std::string where0 = property == "liquidViscosity" ? "transport liquid.viscosity.measured."
        : property == "liquidThermalConductivity" ? "transport liquid.thermalConductivity.measured."
                                                  : "transport interface.surfaceTension.measured.";
    const DictPtr ms = block->subDict("measured");
    for (const auto& name : ms->keys())
    {
        const std::string here = where0 + name;
        const DictPtr dec = ms->subDict(name);
        onlyKeys(dec, { "use", "reason", "interpolation", "ignores", "ignoresReason", "ignoresUpTo" }, here);
        MixtureMeasurement m;
        m.name = name;
        m.property = property;
        m.use  = dec->lookupWordOrDefault("use", "");
        if (m.use != "method" && m.use != "check")
            throw std::runtime_error(here + ": `use " + m.use + "` -- write `use method;`"
                " (the value IS the " + quantity + " of its set inside its box) or `use check;`"
                " (printed beside the computed value, never used).");
        m.reason = dec->lookupWordOrDefault("reason", "");

        const PointFile pf = readPointFile(name, here, dec,
            [&](const std::string& col) -> experiments::ColumnRole
            {
                if (col == "T")  return role(Dims::temperature, "a temperature", true);
                if (col == "P")  return role(Dims::pressure, "a pressure");   // stated by the source; the property is not corrected for it
                if (col == vcol)
                    return role(property == "liquidViscosity" ? Dims::viscosity
                              : property == "surfaceTension" ? Dims::surfaceTension : Dims::thermalCond,
                                (std::string("a ") + quantity).c_str());
                if (col.size() > 3 && col.compare(0, 2, "w[") == 0 && col.back() == ']')
                    return role(Dims::dimensionless, "a mass fraction");
                throw std::runtime_error("experiments file " + name + ".dat: column `" + col
                    + "` -- a " + quantity + " point reads `" + vcol + "` (required), `T`, `P` and"
                      " mass fractions `w[<component>]`.");
            });
        const experiments::File& f = pf.f;
        m.where    = f.where;
        m.citation = f.citation;
        m.assumedValue = (f.origin == "assumed");
        onlyKeys(f.dict, { "provenance", "system", "property", "solvent", "columns", "data",
                           "uncertainty", "box", "authorised" }, f.where);
        //  WHAT KIND OF VALUE THE SOURCE STATES (review row DF-04): a measurement,
        //  an average, a representative value the authors employed.  The run and
        //  the guide name it in these words; nothing calls a stated value a
        //  measurement unless its file says it is one.
        m.basis = f.dict->subDict("provenance")->lookupWordOrDefault("basis", "");
        if (blank(m.basis))
            throw std::runtime_error(f.where + ": `provenance` states no `basis \"...\";` --"
                " what kind of value the source gives (a measurement, an average over"
                " operating conditions, a representative value the authors employed),"
                " in the source's own words.  The run prints it beside the value.");
        //  R3: `kind` -- measured | adopted | estimated.  Required beside many rows.
        m.kind = f.dict->subDict("provenance")->lookupWordOrDefault("kind", "");
        if (!m.kind.empty() && m.kind != "measured" && m.kind != "adopted" && m.kind != "estimated")
            throw std::runtime_error(f.where + ": `provenance { kind " + m.kind + "; }` -- one of"
                " measured (a measurement), adopted (a value its authors chose to use) or"
                " estimated (a correlation's output the case freezes).");
        if (f.property != property)
            throw std::runtime_error(f.where + ": `property " + f.property + "` -- the"
                " declaration `" + here + "` reads a " + property + " point.");
        m.rows = pf.rows();
        if (m.rows < 1)
            throw std::runtime_error(f.where + ": no rows in `data`.");
        if (m.rows > 1 && m.kind.empty())
            throw std::runtime_error(f.where + ": " + std::to_string(m.rows) + " rows and"
                " `provenance` states no `kind` -- R3: a table says what its values are:"
                " `kind measured;` (a measurement), `adopted;` (a value its authors chose to"
                " use) or `estimated;` (a correlation's output the case freezes).");
        if (f.system.empty())
            throw std::runtime_error(f.where + ": no `system ( ... );` -- the constituent"
                " set the measurement describes.");
        std::set<std::size_t> set;
        for (const auto& c : f.system) set.insert(indexOf(comps, c, f.where + " system"));
        m.set.assign(set.begin(), set.end());
        //  A ONE-CONSTITUENT SET IS REFUSED (review row DG-03): the pure liquid's
        //  property is a LAW of its record, read wherever the package needs a
        //  pure value (the mixing rule's inputs, Wilke-Chang's solvent, the mu_j
        //  of a viscosity-corrected rule); a measured mixture value would give
        //  the same pure liquid two values in one run.
        if (m.set.size() < 2)
            throw std::runtime_error(here + " (" + f.where + "): `system` names ONE"
                " component.  A stated value of a pure liquid is not a mixture value: it"
                " belongs to the component, as a law of its record or a table law pinned"
                " for it (`transport { liquid { viscosity { pin ( { component " + f.system.front()
                + "; law <name>; reason \"...\"; } ); } } }`, the table type of C398"
                " slice (c)), so the package prices that liquid with one value.");
        m.solvent = f.dict->lookupWordOrDefault("solvent", "");
        if (std::find(f.system.begin(), f.system.end(), m.solvent) == f.system.end())
            throw std::runtime_error(f.where + ": `solvent` must name one of `system`"
                " -- the constituent whose mass fraction is the rest.");
        if (!pf.has(vcol))
            throw std::runtime_error(f.where + ": no `" + vcol + "` column -- the stated " + quantity + ".");
        for (std::size_t r = 0; r < m.rows; ++r)
            if (!(pf.at(r, vcol) > 0.0))
                throw std::runtime_error(f.where + ": row " + std::to_string(r + 1) + ": `" + vcol
                    + "` must be positive.");
        m.mu = pf.at(0, vcol);

        //  THE AXES: one per declared column among T and w[<c>], in column order.
        for (const auto& colName : pf.names)
        {
            if (colName == "P")
            {
                for (std::size_t r = 1; r < m.rows; ++r)
                    if (pf.at(r, "P") != pf.at(0, "P"))
                        throw std::runtime_error(f.where + ": the `P` column holds more than one"
                            " value.  The package's " + quantity + " takes (T, composition) and"
                            " no pressure, so pressure is not an axis of a table here: P is the"
                            " pressure the source states (not applied) -- one value.");
                m.hasP = true;
                m.P = pf.at(0, "P");
                continue;
            }
            if (colName == vcol) continue;
            MixtureMeasurement::Axis ax;
            ax.name = colName;
            if (colName != "T")
            {
                ax.component = colName.substr(2, colName.size() - 3);
                if (ax.component == m.solvent
                    || std::find(f.system.begin(), f.system.end(), ax.component) == f.system.end())
                    throw std::runtime_error(f.where + ": column `" + colName + "` names a"
                        " constituent that is not a non-solvent member of `system`.");
            }
            for (std::size_t r = 0; r < m.rows; ++r) ax.v.push_back(pf.at(r, colName));
            std::sort(ax.v.begin(), ax.v.end());
            ax.v.erase(std::unique(ax.v.begin(), ax.v.end()), ax.v.end());
            m.axes.push_back(std::move(ax));
        }
        if (pf.has("T")) { m.hasT = true; m.T = pf.at(0, "T"); }
        scalar wsum = 0.0;
        for (const auto& ax : m.axes)
            if (!ax.component.empty())
            {
                m.w[ax.component] = pf.at(0, ax.name);
                wsum += m.w[ax.component];
            }
        if (!m.w.empty()) m.w[m.solvent] = 1.0 - wsum;

        //  THE GRID: every combination of the values of the varying axes, once.
        std::vector<std::size_t> varying;
        for (std::size_t a = 0; a < m.axes.size(); ++a) if (m.axes[a].varies()) varying.push_back(a);
        std::size_t cells = 1;
        for (const std::size_t a : varying) cells *= m.axes[a].v.size();
        if (m.rows > 1 && varying.empty())
            throw std::runtime_error(f.where + ": " + std::to_string(m.rows) + " rows and no"
                " column varies -- the rows repeat one point.");
        if (m.rows != cells)
            throw std::runtime_error(f.where + ": " + std::to_string(m.rows) + " rows on the axes "
                + [&] { std::string s; for (const std::size_t a : varying) s += (s.empty() ? "" : ", ")
                    + m.axes[a].name + " (" + std::to_string(m.axes[a].v.size()) + " values)"; return s; }()
                + (varying.size() > 1
                    ? ": a scattered set on more than one axis is refused in this slice -- a"
                      " RECTANGULAR GRID is required (every combination of the axis values,"
                      " " + std::to_string(cells) + " rows)"
                    : ": a repeated value on the axis is refused -- one row per value")
                + ".");
        m.grid.assign(cells, 0.0);
        std::vector<char> filled(cells, 0);
        for (std::size_t r = 0; r < m.rows; ++r)
        {
            std::size_t idx = 0;
            for (const std::size_t a : varying)
            {
                const auto& v = m.axes[a].v;
                const std::size_t k = static_cast<std::size_t>(
                    std::lower_bound(v.begin(), v.end(), pf.at(r, m.axes[a].name)) - v.begin());
                idx = idx * v.size() + k;
            }
            if (filled[idx])
                throw std::runtime_error(f.where + ": row " + std::to_string(r + 1) + " repeats a"
                    " combination of the axis values -- a scattered set on more than one axis is"
                    " refused in this slice; a RECTANGULAR GRID is required, one row per combination.");
            filled[idx] = 1;
            m.grid[idx] = pf.at(r, vcol);
        }

        //  THE INTERPOLATION, declared per varying axis (the table law's four words).
        if (dec->found("interpolation"))
        {
            if (varying.empty())
                throw std::runtime_error(here + ": `interpolation` beside ONE row -- nothing to"
                    " interpolate; a one-row record stands over its box as it did.");
            //  one word for one axis (a scalar entry), a list `( ... )` otherwise
            std::vector<std::string> words;
            {
                const auto& iv = dec->entryValue("interpolation");
                if (std::holds_alternative<std::string>(iv)) words.push_back(dec->lookupWord("interpolation"));
                else words = dec->lookupWordList("interpolation");
            }
            if (words.size() != varying.size())
                throw std::runtime_error(here + ": `interpolation` gives " + std::to_string(words.size())
                    + " word(s) for the " + std::to_string(varying.size()) + " varying axis(es) ("
                    + [&] { std::string s; for (const std::size_t a : varying) s += (s.empty() ? "" : ", ")
                        + m.axes[a].name; return s; }()
                    + "): one word for one axis, a list `( ... )` in the order of the columns otherwise.");
            for (std::size_t j = 0; j < varying.size(); ++j)
            {
                auto& ax = m.axes[varying[j]];
                const std::string& wd = words[j];
                if (wd != "linear" && wd != "logLinear" && wd != "logReciprocal" && wd != "monotoneCubic")
                    throw std::runtime_error(here + ": interpolation `" + wd + "` on axis " + ax.name
                        + " -- one of linear, logLinear, logReciprocal (T only), monotoneCubic"
                          " (`clamp` is refused: past the rows the authorised box holds the edge"
                          " and says so).");
                if (!ax.component.empty() && wd != "linear" && wd != "monotoneCubic")
                    throw std::runtime_error(here + ": interpolation `" + wd + "` on the composition"
                        " axis " + ax.name + " -- a composition axis takes linear or monotoneCubic"
                        " (a mass fraction may be 0, and the log forms are written for T).");
                if (wd == "logReciprocal" && ax.name != "T")
                    throw std::runtime_error(here + ": interpolation logReciprocal (ln y in 1/x) is"
                        " the Arrhenius form and belongs to the T axis.");
                if (wd == "monotoneCubic" && ax.v.size() < 3)
                    throw std::runtime_error(here + ": interpolation monotoneCubic on " + ax.name
                        + " needs at least 3 values (it has " + std::to_string(ax.v.size()) + ").");
                ax.interpolation = wd;
            }
        }
        else if (!varying.empty())
            throw std::runtime_error(here + ": " + std::to_string(m.rows) + " rows and no"
                " `interpolation` -- declare one per varying axis: linear (y in x), logLinear"
                " (ln y in x), logReciprocal (ln y in 1/T, T only) or monotoneCubic"
                " (Fritsch-Carlson); a table's interpolation is always declared.");

        //  THE AUTHORISED BOX (R2): `box` (as the one-row records spell it) or
        //  `authorised`; one spelling per file.
        if (f.dict->found("box") && f.dict->found("authorised"))
            throw std::runtime_error(f.where + ": `box` and `authorised` in one file -- one spelling"
                " per file (they are the same domain: what the case stands the value over).");
        if (!f.dict->found("box") && !f.dict->found("authorised"))
            throw std::runtime_error(f.where + ": no `box { T (lo hi); w[<c>] (lo hi); }` (or"
                " `authorised { ... }`) -- the hard extent the case stands the value over.");
        m.boxWord = f.dict->found("authorised") ? "authorised" : "box";
        const DictPtr box = f.dict->subDict(m.boxWord);
        std::vector<std::string> boxKeys{ "T", "reason" };
        for (const auto& c : f.system) if (c != m.solvent) boxKeys.push_back("w[" + c + "]");
        onlyKeys(box, boxKeys, f.where + " " + m.boxWord);
        m.boxT = pairOf(box, "T", f.where + " " + m.boxWord);
        for (const auto& c : f.system)
            if (c != m.solvent)
                m.boxW[c] = pairOf(box, "w[" + c + "]", f.where + " " + m.boxWord);
        const std::string boxReason = box->lookupWordOrDefault("reason", "");
        if (!blank(boxReason))
        {
            if (!blank(m.reason))
                throw std::runtime_error(here + ": a `reason` in the dictionary entry and one in the"
                    " record's `" + m.boxWord + "` -- one home per reason.");
            m.reason = boxReason;
        }
        //  Each axis' support lies inside the authorised box.
        bool wider = !m.hasT;
        for (const auto& ax : m.axes)
        {
            const std::pair<scalar, scalar> lim = ax.component.empty() ? m.boxT : m.boxW.at(ax.component);
            if (ax.lo() < lim.first || ax.hi() > lim.second)
                throw std::runtime_error(f.where + ": the rows' support on " + ax.name + " ("
                    + fmt("%.6g", ax.lo()) + " to " + fmt("%.6g", ax.hi()) + ") is outside its own "
                    + m.boxWord + " (" + fmt("%.6g", lim.first) + " to " + fmt("%.6g", lim.second) + ").");
            if (lim.first != ax.lo() || lim.second != ax.hi()) wider = true;
        }
        for (const auto& c : f.system)
        {
            if (c == m.solvent) continue;
            bool has = false;
            for (const auto& ax : m.axes) if (ax.component == c) has = true;
            if (!has) wider = true;
        }
        if (wider && blank(m.reason))
            throw std::runtime_error(here + ": no `reason \"...\";`.  The " + boxName(m) + " is wider than"
                " the rows' support, so standing the value over it is a hypothesis of the case, and the run"
                " says why (R2).  The reason is written in the dictionary entry or in the record's `"
                + m.boxWord + "`.");

        //  F: components the table does not describe, present up to a bound.
        const bool ig = dec->found("ignores");
        if (!ig && (dec->found("ignoresReason") || dec->found("ignoresUpTo")))
            throw std::runtime_error(here + ": `ignoresReason` / `ignoresUpTo` without `ignores ( ... );`.");
        if (ig)
        {
            for (const auto& c : dec->lookupWordList("ignores"))
            {
                const std::size_t i = indexOf(comps, c, here + " ignores");
                if (std::find(m.set.begin(), m.set.end(), i) != m.set.end())
                    throw std::runtime_error(here + ": `ignores` names `" + c + "`, a member of the"
                        " record's `system` -- the table describes it.");
                m.ignored.push_back(i);
            }
            std::sort(m.ignored.begin(), m.ignored.end());
            m.ignoresReason = dec->lookupWordOrDefault("ignoresReason", "");
            if (blank(m.ignoresReason))
                throw std::runtime_error(here + ": `ignores` without `ignoresReason \"...\";` -- why the"
                    " liquid's other components may be left out of the value.");
            if (!dec->found("ignoresUpTo"))
                throw std::runtime_error(here + ": `ignores` without `ignoresUpTo <mass fraction>;` --"
                    " the bound beyond which the run refuses (REQUIRED).");
            m.ignoresUpTo = dec->lookupScalar("ignoresUpTo");
            if (!(m.ignoresUpTo > 0.0 && m.ignoresUpTo <= 1.0))
                throw std::runtime_error(here + ": `ignoresUpTo` is a mass fraction in (0, 1].");
        }

        if (m.hasT && !(m.T >= m.boxT.first && m.T <= m.boxT.second))
            throw std::runtime_error(f.where + ": the stated point is outside its own box.");
        for (const auto& [c, lim] : m.boxW)
            if (m.w.count(c) && !(m.w.at(c) >= lim.first && m.w.at(c) <= lim.second))
                throw std::runtime_error(f.where + ": the stated point is outside its own box.");
        for (const auto& o : out)
        {
            if (o.set == m.set && o.use == "method" && m.use == "method")
                throw std::runtime_error(here + ": a second `use method` measurement for the"
                    " set of `" + o.name + "` -- one constituent set holds one method.");
            //  review row DG-04: a check beside the method of the same set is
            //  never reached (the method answers first) and would never print.
            if (o.set == m.set && o.use != m.use)
                throw std::runtime_error(here + ": `use " + m.use + "` beside `" + o.name
                    + "` (`use " + o.use + "`) on the same set -- a stated value that is the"
                      " set's method answers every state, so a check beside it is never"
                      " compared.  Keep one: the method, or the check (with the law"
                      " answering).");
        }
        //  R3 on a one-row record that states no kind: said once, never silent.
        if (m.kind.empty())
            if (AdvisoryLog::instance().addAnnouncedOnce("measuredKindMissing:" + name,
                    "approximation", "info", quantity,
                    "the record " + f.where + " states no `provenance { kind ...; }` (measured, adopted or"
                    " estimated): its value is taken as stated, and the run cannot say what it is"))
                std::cout << "  [" << quantity << "] " << f.where << ": no provenance kind (measured | adopted"
                             " | estimated) -- stated once\n";
        out.push_back(std::move(m));
    }
    return out;
}

scalar ignoredShare(const std::vector<Component>& comps, const MixtureMeasurement& m, const sVector& x)
{
    if (m.ignored.empty()) return 0.0;
    scalar M = 0.0, ig = 0.0;
    for (std::size_t i = 0; i < x.size() && i < comps.size(); ++i)
        if (x[i] > 0.0) M += x[i] * comps[i].MW();
    for (const std::size_t i : m.ignored)
        if (i < x.size() && x[i] > 0.0) ig += x[i] * comps[i].MW();
    return M > 0.0 ? ig / M : 0.0;
}

bool insideSupport(const MixtureMeasurement& m, scalar T, const std::map<std::string, scalar>& w)
{
    for (const auto& ax : m.axes)
    {
        scalar v = T;
        if (!ax.component.empty())
        {
            const auto it = w.find(ax.component);
            v = it == w.end() ? 0.0 : it->second;
        }
        const scalar tol = 1.0e-12 * (1.0 + std::fabs(v));
        if (v < ax.lo() - tol || v > ax.hi() + tol) return false;
    }
    return true;
}

void announceIgnored(const MixtureMeasurement& m, const std::vector<Component>& comps, scalar share)
{
    std::string names;
    for (const std::size_t i : m.ignored) names += (names.empty() ? "" : ", ") + comps[i].name();
    const std::string q = quantityWord(m.property);
    std::string described;
    for (const std::size_t i : m.set) described += (described.empty() ? "" : " + ") + comps[i].name();
    if (AdvisoryLog::instance().addAnnouncedOnce("measuredIgnores:" + m.name, "approximation", "info", q,
            "table " + m.name + " describes " + described
            + " and the liquid also holds " + names + ", ignored by the case's declaration up to a mass"
            " fraction of " + fmt("%.6g", m.ignoresUpTo) + " (reason: " + m.ignoresReason + ")"))
        std::cout << "  [" << q << "] table " << m.name << ": the liquid also holds " << names
                  << ", ignored up to a mass fraction of " << fmt("%.6g", m.ignoresUpTo)
                  << " (reason: " << m.ignoresReason << ")\n";
    PropertySourceLog::instance().hypothesisHere("ignoredInMeasuredTable", names, share, m.ignoresUpTo);
}

scalar valueAt(const MixtureMeasurement& m, scalar T, const std::map<std::string, scalar>& w)
{
    //  The coordinate of each axis, clamped to its support; the excursion is
    //  the distance clamped.
    std::vector<scalar> c(m.axes.size());
    std::vector<scalar> exc(m.axes.size(), 0.0);
    std::vector<int> side(m.axes.size(), 0);
    bool any = false;
    for (std::size_t a = 0; a < m.axes.size(); ++a)
    {
        const auto& ax = m.axes[a];
        scalar v = T;
        if (!ax.component.empty())
        {
            const auto it = w.find(ax.component);
            v = it == w.end() ? 0.0 : it->second;
        }
        const scalar tol = 1.0e-12 * (1.0 + std::fabs(v));
        if (v < ax.lo() - tol) { exc[a] = ax.lo() - v; side[a] = -1; any = true; v = ax.lo(); }
        else if (v > ax.hi() + tol) { exc[a] = v - ax.hi(); side[a] = +1; any = true; v = ax.hi(); }
        c[a] = v;
    }
    if (any && m.isTable())
    {
        //  The largest excursion of the run, per axis and side, restated on the
        //  advisory channel (the table law's pattern); the first one also said
        //  on the console, once per record.
        struct Held { std::map<std::string, scalar> max; unsigned long long generation = 0; bool told = false; };
        static std::map<std::string, Held> held;
        static std::mutex mx;
        std::lock_guard<std::mutex> lk(mx);
        Held& h = held[m.name + "|" + m.where];
        const unsigned long long gen = AdvisoryLog::instance().generation();
        if (h.generation != gen) { h.max.clear(); h.generation = gen; }
        bool grew = false;
        for (std::size_t a = 0; a < m.axes.size(); ++a)
            if (side[a] != 0)
            {
                const std::string key = m.axes[a].name + (side[a] < 0 ? " below" : " above");
                if (exc[a] > h.max[key]) { h.max[key] = exc[a]; grew = true; }
            }
        if (grew)
        {
            std::string msg = std::string("the ") + quantityWord(m.property) + " was taken past the rows' support of table "
                + m.name + " (kind " + m.kind + ") inside the case's " + boxName(m)
                + ", the nearest edge's value held; largest excursion";
            bool first = true;
            for (const auto& kv : h.max)
            {
                msg += std::string(first ? " " : ", ") + kv.first + " by "
                     + fmt("%.6g", kv.second) + (kv.first.compare(0, 1, "T") == 0 ? " K" : "");
                first = false;
            }
            msg += "; reason: " + m.reason;
            AdvisoryLog::instance().restate("table", "warning", "measured table " + m.name, msg);
            if (!h.told)
            {
                h.told = true;
                std::cout << "  [" << quantityWord(m.property) << "] table " << m.name
                          << ": taken past its rows' support (nearest edge held, reason: " << m.reason
                          << "); the largest excursion is restated at the end of the run\n";
            }
        }
    }
    //  One axis at a time, in the order of the file's columns: reduce the
    //  first varying axis over the others' grid, then the next ...
    std::vector<std::size_t> varying;
    for (std::size_t a = 0; a < m.axes.size(); ++a) if (m.axes[a].varies()) varying.push_back(a);
    std::vector<scalar> data = m.grid;
    for (const std::size_t a : varying)
    {
        const auto& ax = m.axes[a];
        const std::size_t n = ax.v.size();
        const std::size_t stride = data.size() / n;
        std::vector<scalar> next(stride);
        std::vector<scalar> ys(n);
        for (std::size_t s = 0; s < stride; ++s)
        {
            for (std::size_t k = 0; k < n; ++k) ys[k] = data[k * stride + s];
            next[s] = interpolate1(ax.v, ys, ax.interpolation, c[a]);
        }
        data = std::move(next);
    }
    return data.front();
}

std::map<std::string, scalar>
massFractionsOf(const std::vector<Component>& comps, const std::vector<std::size_t>& set,
                const sVector& x)
{
    std::map<std::string, scalar> w;
    scalar M = 0.0;
    for (const std::size_t i : set) M += std::max<scalar>(x[i], 0.0) * comps[i].MW();
    for (const std::size_t i : set)
        w[comps[i].name()] = M > 0.0 ? std::max<scalar>(x[i], 0.0) * comps[i].MW() / M : 0.0;
    return w;
}

std::string outsideBox(const ViscosityMeasurement& m, scalar T,
                       const std::map<std::string, scalar>& w)
{
    if (T < m.boxT.first || T > m.boxT.second)
        return "T = " + fmt("%.6g K", T) + " (box " + fmt("%.6g", m.boxT.first)
             + fmt("-%.6g K", m.boxT.second) + ")";
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

bool atStatedPoint(const ViscosityMeasurement& m, scalar T,
                   const std::map<std::string, scalar>& w)
{
    if (!m.hasT || m.w.empty()) return false;
    if (m.isTable())
    {
        //  A TABLE: the state is at a stated point when every declared axis
        //  coordinate is one of its nodes (a measured row of the grid).
        for (const auto& ax : m.axes)
        {
            scalar v = T;
            if (!ax.component.empty())
            {
                const auto it = w.find(ax.component);
                v = it == w.end() ? 0.0 : it->second;
            }
            bool node = false;
            for (const scalar x : ax.v)
                if (std::fabs(v - x) <= 1.0e-12 * (1.0 + std::fabs(x))) node = true;
            if (!node) return false;
        }
        return true;
    }
    if ((T - m.T) * (T - m.T) > 1e-18) return false;
    for (const auto& [c, ws] : m.w)
    {
        const auto it = w.find(c);
        const scalar v = it == w.end() ? 0.0 : it->second;
        if ((v - ws) * (v - ws) > 1e-24) return false;
    }
    return true;
}

std::string statedWords(const ViscosityMeasurement& m)
{
    if (m.isTable())
        return "table " + m.name + " (" + std::to_string(m.rows) + " rows, kind " + m.kind + ": " + m.basis + ")";
    return "stated value " + m.name + " (" + m.basis + ")";
}

bool isWater(const Component& c)
{
    //  By its CAS number; a record that states none is matched by the one home
    //  of the aqueous solvent's name (check_aqueous_solvent_home).
    return c.cas() == "7732-18-5"
        || (c.cas().empty() && c.name() == ThermoPackage::defaultAqueousSolvent());
}

std::string waterSoluteRefusal(const std::string& model, const std::string& solvent)
{
    return "the default " + model + " is not used with water as the solute (Poling,"
           " Prausnitz & O'Connell, The Properties of Gases and Liquids, 5th ed., p. 11.22:"
           " \"The method should not be used when water is the solute\").  Remedy: an entry"
           " for the pair in `transport { liquid { diffusivity { infiniteDilution { entries ("
           " ... ); } } } }` -- a value with its source, `{ solute water; solvent " + solvent
         + "; kind infiniteDilution; value <D> <unit>; T <T> K; box { T (lo hi); } source"
           " \"...\"; reason \"...\"; }`, or the correlation named for the pair with the"
           " reason it is accepted outside its stated scope, `{ solute water; solvent " + solvent
         + "; kind infiniteDilution; model " + model + "; reason \"...\"; }`";
}

// ===========================================================================
//  (2) the liquid diffusivity
// ===========================================================================
const char* returnsName(Returns r)
{
    return r == Returns::effective ? "effective" : "infiniteDilution";
}

const char* ruleName(Rule r)
{
    switch (r)
    {
        case Rule::CaldwellBabb:    return "CaldwellBabb";
        case Rule::Vignes:          return "Vignes";
        case Rule::LefflerCullinan: return "LefflerCullinan";
        case Rule::AndersonBabb:    return "AndersonBabb";
        case Rule::VignesKooijmanTaylor: return "VignesKooijmanTaylor";
        case Rule::none:            break;
    }
    return "none";
}

const char* reductionName(Reduction r)
{
    return r == Reduction::Wilke ? "Wilke" : "none";
}

std::string reductionEquation(Reduction r)
{
    if (r == Reduction::Wilke)
        return "D_i,eff = (1 - x_i) / sum_{j != i} x_j / D_ij, with D_ij the pair values the"
               " composition rule gives";
    return "";
}

std::string reductionCitation(Reduction r)
{
    if (r == Reduction::Wilke)
        return "Taylor & Krishna (1993), Multicomponent Mass Transfer, Eq. 6.1.14, p. 126"
               " (the book's Example 6.1.1, p. 127, is the worked number)";
    return "";
}

std::string ruleEquation(Rule r)
{
    switch (r)
    {
        case Rule::CaldwellBabb:
            return "D_12 = x_2 D0_12 + x_1 D0_21, each D0 in its own solvent's viscosity";
        case Rule::Vignes:
            return "D_12 = D0_12^x_2 D0_21^x_1, each D0 in its own solvent's viscosity";
        case Rule::LefflerCullinan:
            return "D_12 mu = (D0_12 mu_2)^x_2 (D0_21 mu_1)^x_1, mu the mixture's viscosity";
        case Rule::AndersonBabb:
            return "D_12 mu = x_2 D0_12 mu_2 + x_1 D0_21 mu_1, mu the mixture's viscosity";
        case Rule::VignesKooijmanTaylor:
            return "D_ij = D0_ij^x_j D0_ji^x_i prod_{k != i,j} (D0_ik D0_jk)^(x_k/2), each D0 in its"
                   " own solvent's viscosity (the Maxwell-Stefan pair value; a binary gives Vignes)";
        case Rule::none: break;
    }
    return "";
}

std::string ruleCitation(Rule r)
{
    switch (r)
    {
        case Rule::CaldwellBabb:
            return "Taylor & Kooijman (2014), Mass Transfer in Distillation, Eq. 3.32;"
                   " Poling, Prausnitz & O'Connell, 5th ed., Eq. 11-10.2 with the"
                   " thermodynamic factor 1";
        case Rule::Vignes:
            return "Taylor & Kooijman (2014), Eq. 3.33, printed as a SUM of the two powers, a"
                   " misprint of the logarithmic average its text describes; the product is"
                   " Poling, Prausnitz & O'Connell, 5th ed., Eq. 11-10.4";
        case Rule::LefflerCullinan:
            return "Poling, Prausnitz & O'Connell, 5th ed., Eq. 11-10.5 (Leffler & Cullinan"
                   " 1970, not read)";
        case Rule::AndersonBabb:
            return "the form as stated in Poling 5th ed. p. 11.34 (the group D mu / alpha"
                   " linear in mole fraction); the original (Anderson & Babb 1961) not read";
        case Rule::VignesKooijmanTaylor:
            return "Kooijman & Taylor (1991), Ind. Eng. Chem. Res. 30, 1217, Eq. 23 (the limiting"
                   " value of Eq. 21, p. 1219); the form printed in Taylor & Kooijman (2014) Eq. 3.41"
                   " and Taylor & Krishna (1993) Eq. 4.2.19, (D0_ik D0_ki)^(1/2), is a misprint of it"
                   " (it does not contain j, so it is not symmetric; on the paper's own Table I, with each"
                   " pair evaluated for i < j and copied to j, i, it gives an average discrepancy of"
                   " 0.1002 against 0.0782)";
        case Rule::none: break;
    }
    return "";
}

bool ruleIsViscosityCorrected(Rule r)
{
    return r == Rule::LefflerCullinan || r == Rule::AndersonBabb;
}

const DiffusivityEntry* DiffusivityDeclaration::entryFor(std::size_t solute, std::size_t solvent) const
{
    for (const auto& e : entries)
        if (e.solute == solute && e.solvent == solvent) return &e;
    return nullptr;
}

namespace {

DiffusivityEntry readEntry(const DictPtr& e, const std::vector<Component>& comps,
                           std::size_t k)
{
    const std::string here = "transport liquid.diffusivity.infiniteDilution.entries["
                           + std::to_string(k) + "]";
    onlyKeys(e, { "solute", "solvent", "kind", "value", "T", "box", "source", "reason",
                  "experiments", "model" }, here);
    DiffusivityEntry d;
    if (!e->found("solute") || !e->found("solvent"))
        throw std::runtime_error(here + ": an entry names its `solute` and its `solvent`"
            " (the direction is explicit: D0 of the solute at infinite dilution in the"
            " solvent).");
    const std::string su = e->lookupWord("solute"), sv = e->lookupWord("solvent");
    d.solute  = indexOf(comps, su, here);
    d.solvent = indexOf(comps, sv, here);
    if (d.solute == d.solvent)
        throw std::runtime_error(here + ": solute and solvent are both '" + su + "' -- a"
            " self-diffusion coefficient is the kind `self`, not consumed in this slice.");
    d.kind = e->lookupWordOrDefault("kind", "");
    if (d.kind.empty())
        throw std::runtime_error(here + ": the entry names no `kind` -- write `kind"
            " infiniteDilution;` (the only kind a consumer reads in this slice; a datum"
            " states what it is, C398 ruling 6).");
    if (d.kind != "infiniteDilution")
    {
        if (d.kind == "fick" || d.kind == "maxwellStefan" || d.kind == "self")
            throw std::runtime_error(here + ": `kind " + d.kind + "` -- no consumer reads a"
                " datum of that kind yet (the liquid film takes infinite-dilution values"
                " and a composition rule, DEV.md 4c C398 slice (d)); it is refused rather"
                " than read as something it is not.");
        throw std::runtime_error(here + ": " + registryRefusal::message("diffusivity kind",
            d.kind, { "infiniteDilution" }, "Accepted"));
    }
    d.reason = e->lookupWordOrDefault("reason", "");
    if (e->found("model"))
    {
        //  THE CORRELATION NAMED FOR THIS PAIR, e.g. Wilke-Chang where the
        //  default refuses it (water as the solute): no value, a reason.
        for (const char* k2 : { "value", "T", "box", "source", "experiments" })
            if (e->found(k2))
                throw std::runtime_error(here + ": `" + std::string(k2) + "` beside `model` --"
                    " an entry is a datum (a value with its source, or a file) OR a"
                    " correlation named for the pair, not both.");
        d.model = e->lookupWord("model");
        if (blank(d.reason))
            throw std::runtime_error(here + ": `model " + d.model + "` named for " + su + " in "
                + sv + " needs its `reason \"...\";` -- why the correlation is accepted for"
                  " this pair.");
        d.outsideScope = isWater(comps[d.solute]) && d.model == "WilkeChang";
        d.where  = "the correlation " + d.model;
        d.source = d.outsideScope
            ? "outside the method's stated scope (Poling 5th ed. p. 11.22: not to be used with"
              " water as the solute)"
            : "the correlation " + d.model;
        return d;
    }
    if (e->found("experiments"))
    {
        for (const char* k2 : { "value", "T", "box", "source" })
            if (e->found(k2))
                throw std::runtime_error(here + ": `" + std::string(k2) + "` beside"
                    " `experiments` -- the file holds the value, its temperature, its"
                    " box and its source; one home.");
        const std::string name = e->lookupWord("experiments");
        const PointFile pf = readPointFile(name, here, e,
            [&](const std::string& col) -> experiments::ColumnRole
            {
                if (col == "T") return role(Dims::temperature, "a temperature", true);
                if (col == "D") return role(Dims::diffusivity, "a diffusivity");
                throw std::runtime_error("experiments file " + name + ".dat: column `" + col
                    + "` -- an infinite-dilution liquid diffusivity reads `T` and `D`.");
            });
        const experiments::File& f = pf.f;
        onlyKeys(f.dict, { "provenance", "system", "property", "solute", "solvent", "kind",
                           "columns", "data", "uncertainty", "box" }, f.where);
        //  THE FILE DESCRIBES ITS ENTRY, or it is refused (SECOND ADDENDUM V3:
        //  water in methanol cited as methanol in water).
        if (f.property != "liquidDiffusivity")
            throw std::runtime_error(f.where + ": `property " + f.property + "`, cited by "
                + here + " as a liquidDiffusivity.");
        const std::string fsu = f.dict->lookupWordOrDefault("solute", "");
        const std::string fsv = f.dict->lookupWordOrDefault("solvent", "");
        const std::string fk  = f.dict->lookupWordOrDefault("kind", "");
        if (fsu != su || fsv != sv)
            throw std::runtime_error(f.where + ": the file is " + fsu + " in " + fsv
                + "; " + here + " cites it as " + su + " in " + sv + ".  The direction of"
                  " an infinite-dilution value is part of the datum.");
        if (fk != d.kind)
            throw std::runtime_error(f.where + ": `kind " + fk + "`; " + here
                + " cites it as `kind " + d.kind + "`.");
        if (!f.system.empty())
        {
            auto sys = f.system; std::sort(sys.begin(), sys.end());
            std::vector<std::string> mine{ su, sv }; std::sort(mine.begin(), mine.end());
            if (sys != mine)
                throw std::runtime_error(f.where + ": `system` names a set other than the"
                    " solute and the solvent.");
        }
        if (pf.rows() != 1)
            throw std::runtime_error(f.where + ": " + std::to_string(pf.rows())
                + " points.  An entry's file holds ONE point (a value at a stated"
                  " temperature); a table of values with an interpolation is a law of"
                  " type `table` (C398 slice (c)), not an entry.");
        if (!pf.has("T") || !pf.has("D"))
            throw std::runtime_error(f.where + ": an infinite-dilution value reads columns `T` and `D`.");
        d.T  = pf.at(0, "T");
        d.D  = pf.at(0, "D");
        if (!f.dict->found("box"))
            throw std::runtime_error(f.where + ": no `box { T (lo hi); }` -- the extent"
                " the case stands the one point over (K).");
        const DictPtr box = f.dict->subDict("box");
        onlyKeys(box, { "T" }, f.where + " box");
        d.boxT   = pairOf(box, "T", f.where + " box");
        d.source = f.citation;
        d.where  = f.where;
    }
    else
    {
        if (!e->found("value") || !e->found("T") || !e->found("box") || !e->found("source"))
            throw std::runtime_error(here + ": a constant entry carries `value <D> <unit>;`,"
                " `T <T> <unit>;` (the temperature the value is stated at), `box { T (lo"
                " hi); }` (K) and `source \"...\";` -- or names an experiments file.");
        d.D = e->lookupScalar("value", Dims::diffusivity);
        d.T = e->lookupScalar("T", Dims::temperature);
        const DictPtr box = e->subDict("box");
        onlyKeys(box, { "T" }, here + " box");
        d.boxT   = pairOf(box, "T", here + " box");
        d.source = e->lookupWord("source");
        d.where  = "inline";
    }
    if (!(d.D > 0.0) || !std::isfinite(d.D))
        throw std::runtime_error(here + ": the value must be a positive diffusivity.");
    if (!(d.T >= d.boxT.first && d.T <= d.boxT.second))
        throw std::runtime_error(here + ": the stated temperature " + fmt("%.6g K", d.T)
            + " is outside its own box.");
    const bool atPoint = d.boxT.first == d.T && d.boxT.second == d.T;
    if (!atPoint && blank(d.reason))
        throw std::runtime_error(here + ": its box (" + fmt("%.6g", d.boxT.first)
            + fmt("-%.6g K", d.boxT.second) + ") is wider than its one point at "
            + fmt("%.6g K", d.T) + ", and no law judges that in this slice: write its"
              " `reason \"...\";`.");
    return d;
}

} // namespace

DiffusivityDeclaration readDiffusivity(const DictPtr& b, const std::vector<Component>& comps)
{
    DiffusivityDeclaration d;
    if (!b) return d;
    d.declared = true;
    const std::string here = "transport liquid.diffusivity";
    onlyKeys(b, { "model", "returns", "composition", "infiniteDilution",
                  "thermodynamicFactor" }, here);
    const bool hasNew = b->found("returns") || b->found("composition")
                     || b->found("infiniteDilution") || b->found("thermodynamicFactor");
    //  THE OLD FORM IS REFUSED BY NAME (DEV.md 4c C402, no legacy): no shipped
    //  case writes `diffusivity { model <word>; }` since C398 slice (d), so its
    //  reader is deleted and the refusal gives the line to write instead.
    if (!hasNew)
    {
        const std::string w = b->lookupWordOrDefault("model", "WilkeChang");
        throw std::runtime_error(here + ": the form `diffusivity { model " + w + "; }` is no"
            " longer read (it said neither which quantity the package returns nor how a"
            " mixture combines the binaries; DEV.md 4c C398 slice (d), C402).  Write"
            " `diffusivity { returns infiniteDilution; infiniteDilution { default { model "
            + w + "; } } }` for the binary infinite-dilution values, or `diffusivity {"
            " returns effective; composition { rule AndersonBabb; } infiniteDilution {"
            " default { model " + w + "; } } thermodynamicFactor { take 1; } }` for the"
            " effective value of a binary liquid.");
    }
    if (b->found("model"))
        throw std::runtime_error(here + ": `model` beside the declared quantity -- the"
            " infinite-dilution correlation is named once, in `infiniteDilution {"
            " default { model <word>; } }`.");
    const std::string ret = b->lookupWordOrDefault("returns", "");
    if (ret == "effective")              d.returns = Returns::effective;
    else if (ret == "infiniteDilution")  d.returns = Returns::infiniteDilution;
    else
        throw std::runtime_error(here + ": " + registryRefusal::message(
            "returned liquid diffusivity", ret.empty() ? "(none written)" : ret,
            { "effective", "infiniteDilution" }, "Accepted")
            + "  `returns` names the quantity the package hands a consumer.");

    if (b->found("composition"))
    {
        const DictPtr c = b->subDict("composition");
        onlyKeys(c, { "rule", "reduction" }, here + ".composition");
        const std::string r = c->lookupWordOrDefault("rule", "");
        if (r == "CaldwellBabb")         d.rule = Rule::CaldwellBabb;
        else if (r == "Vignes")          d.rule = Rule::Vignes;
        else if (r == "LefflerCullinan") d.rule = Rule::LefflerCullinan;
        else if (r == "AndersonBabb")    d.rule = Rule::AndersonBabb;
        else if (r == "VignesKooijmanTaylor") d.rule = Rule::VignesKooijmanTaylor;
        else
            throw std::runtime_error(here + ".composition: " + registryRefusal::message(
                "liquid-diffusivity composition rule", r.empty() ? "(none written)" : r,
                { "CaldwellBabb", "Vignes", "LefflerCullinan", "AndersonBabb",
                  "VignesKooijmanTaylor" }, "Accepted"));
        if (c->found("reduction"))
        {
            const std::string w = c->lookupWordOrDefault("reduction", "");
            if (w != "Wilke")
                throw std::runtime_error(here + ".composition: " + registryRefusal::message(
                    "liquid-diffusivity reduction", w.empty() ? "(none written)" : w,
                    { "Wilke" }, "Accepted") + "  (Burghardt-Krupiczka, Kato and Stewart are"
                    " not built: DEV.md 4c C329 slice B2, ruling 2.)");
            d.reduction = Reduction::Wilke;
            if (d.rule != Rule::VignesKooijmanTaylor)
                throw std::runtime_error(here + ".composition: `reduction " + w + "` with `rule "
                    + r + "` -- only VignesKooijmanTaylor has a form for three or more"
                    " components (the binary rules combine two pair values and have nothing to"
                    " reduce); write `reduction` beside `rule VignesKooijmanTaylor`.");
        }
    }
    if (b->found("thermodynamicFactor"))
    {
        const DictPtr g = b->subDict("thermodynamicFactor");
        onlyKeys(g, { "take", "from" }, here + ".thermodynamicFactor");
        if (g->found("from"))
            throw std::runtime_error(here + ".thermodynamicFactor: `from` -- the liquid"
                " film takes the thermodynamic factor as 1 (DEV.md 4c C329, B4b: the"
                " liquid Maxwell-Stefan film is not planned); a factor from the activity"
                " model has no consumer in this slice.  Write `take 1;`.");
        if (!g->found("take") || g->lookupScalar("take") != 1.0)
            throw std::runtime_error(here + ".thermodynamicFactor: write `take 1;` -- the"
                " only value this slice accepts (an effective diffusivity with Gamma"
                " taken as 1, announced in the run).");
        d.gammaTakenOne = true;
    }
    if (d.returns == Returns::effective)
    {
        if (d.rule == Rule::none)
            throw std::runtime_error(here + ": `returns effective` needs the rule that"
                " combines the infinite-dilution values: `composition { rule <name>; }`"
                " (CaldwellBabb, Vignes, LefflerCullinan, AndersonBabb, VignesKooijmanTaylor).");
        if (d.rule == Rule::VignesKooijmanTaylor && comps.size() >= 3 && d.reduction == Reduction::none)
            throw std::runtime_error(here + ".composition: `rule VignesKooijmanTaylor` in a package"
                " of " + std::to_string(comps.size()) + " components needs the reduction that turns"
                " its pair values into one diffusivity per component: `composition { rule"
                " VignesKooijmanTaylor; reduction Wilke; }` (Taylor & Krishna 1993, Eq. 6.1.14).");
        if (!d.gammaTakenOne)
            throw std::runtime_error(here + ": `returns effective` needs the"
                " thermodynamic factor it is taken with: `thermodynamicFactor { take 1; }`"
                " (a Fick diffusivity is the Maxwell-Stefan one times Gamma; the run says"
                " which Gamma it took).");
    }
    else
    {
        if (d.rule != Rule::none)
            throw std::runtime_error(here + ": `composition` with `returns"
                " infiniteDilution` -- infinite-dilution values are combined by nothing,"
                " so the rule would be read by nothing.");
        if (d.gammaTakenOne)
            throw std::runtime_error(here + ": `thermodynamicFactor` with `returns"
                " infiniteDilution` -- at infinite dilution the factor is 1 by"
                " definition, so the key would be read by nothing.");
    }

    if (!b->found("infiniteDilution"))
        throw std::runtime_error(here + ": no `infiniteDilution { default { model <word>; } }`"
            " -- the values every rule combines.");
    const DictPtr id = b->subDict("infiniteDilution");
    onlyKeys(id, { "default", "entries" }, here + ".infiniteDilution");
    if (id->found("default"))
    {
        const DictPtr df = id->subDict("default");
        onlyKeys(df, { "model" }, here + ".infiniteDilution.default");
        d.defaultModel = df->lookupWordOrDefault("model", "");
    }
    if (id->found("entries"))
    {
        if (!id->hasDictList("entries"))
            throw std::runtime_error(here + ".infiniteDilution: `entries` is a list of"
                " entries, `entries ( { solute <c>; solvent <c>; kind infiniteDilution;"
                " ... } );`.");
        std::size_t k = 0;
        for (const auto& e : id->lookupDictList("entries"))
        {
            DiffusivityEntry de = readEntry(e, comps, k++);
            if (d.entryFor(de.solute, de.solvent))
                throw std::runtime_error(here + ".infiniteDilution.entries: "
                    + comps[de.solute].name() + " in " + comps[de.solvent].name()
                    + " twice -- one pair and direction holds one datum.");
            d.entries.push_back(std::move(de));
        }
    }
    if (d.defaultModel.empty() && d.entries.empty())
        throw std::runtime_error(here + ".infiniteDilution: neither a `default { model"
            " <word>; }` nor `entries` -- no value to return.");
    return d;
}

std::string describe(const ViscosityMeasurement& m, const std::vector<Component>& comps)
{
    std::string set;
    for (const std::size_t i : m.set) set += (set.empty() ? "" : " + ") + comps[i].name();
    const std::string unit = valueUnit(m.property);
    std::string s = statedWords(m) + ", use " + m.use + ", a mixture value of " + set + ": "
                  + fmt("%.6g ", m.mu) + unit;
    if (m.hasT) s += fmt(" at %.6g K", m.T);
    if (m.hasP) s += fmt(" at %.6g Pa (stated; not applied)", m.P);
    for (const auto& [c, w] : m.w) if (c != m.solvent) s += ", w[" + c + "] " + fmt("%.6g", w);
    if (!m.hasT && m.w.empty()) s += " (the source states no temperature and no composition)";
    s += "; " + m.boxWord + " T " + fmt("%.6g", m.boxT.first) + fmt("-%.6g K", m.boxT.second);
    for (const auto& [c, lim] : m.boxW) s += ", w[" + c + "] " + fmt("%.6g", lim.first) + fmt("-%.6g", lim.second);
    s += std::string(" (hard); ") + (m.hasT && !m.w.empty() ? "away from the stated point" : "at every state (no stated point)")
       + " the case's assumption, reason: " + m.reason
       + "; source: " + m.citation + " (" + m.where + ")";
    if (!m.kind.empty()) s += "; kind " + m.kind;
    return s;
}

std::string interpolationWords(const ViscosityMeasurement& m)
{
    std::string s;
    for (const auto& ax : m.axes)
        if (ax.varies()) s += (s.empty() ? "" : "; ") + ax.name + ": " + ax.interpolation;
    return s;
}

std::vector<std::string> describeLines(const ViscosityMeasurement& m, const std::vector<Component>& comps)
{
    if (!m.isTable()) return { describe(m, comps) };
    std::string set;
    for (const std::size_t i : m.set) set += (set.empty() ? "" : " + ") + comps[i].name();
    const std::string unit = valueUnit(m.property);
    std::vector<std::string> d;
    d.push_back(std::string("table ") + m.name + ", use " + m.use + ", a mixture " + quantityWord(m.property)
        + " of " + set + ": record " + m.where + ", kind " + m.kind + " (" + m.basis + "), "
        + std::to_string(m.rows) + " rows, source: " + m.citation);
    for (const auto& ax : m.axes)
    {
        const bool comp = !ax.component.empty();
        d.push_back("  axis " + ax.name + ": " + std::to_string(ax.v.size()) + " value(s), support "
            + fmt("%.6g", ax.lo()) + (ax.varies() ? fmt(" to %.6g", ax.hi()) : std::string(" (one value, held)"))
            + (comp ? "" : " K")
            + (ax.varies() ? ", interpolation " + ax.interpolation : std::string()));
    }
    std::string a = "  authorised (" + m.boxWord + "): T " + fmt("%.6g", m.boxT.first) + fmt("-%.6g K", m.boxT.second);
    for (const auto& [c, lim] : m.boxW) a += ", w[" + c + "] " + fmt("%.6g", lim.first) + fmt("-%.6g", lim.second);
    d.push_back(a + " (hard: outside it the run refuses); between the support and the authorised box the nearest"
        " edge's value is held and the largest excursion announced"
        + (m.reason.empty() ? std::string() : "; reason: " + m.reason));
    if (!m.ignored.empty())
    {
        std::string ig;
        for (const std::size_t i : m.ignored) ig += (ig.empty() ? "" : ", ") + comps[i].name();
        d.push_back("  ignores " + ig + " up to a mass fraction of " + fmt("%.6g", m.ignoresUpTo)
            + " of the liquid (refused beyond), reason: " + m.ignoresReason);
    }
    return d;
}

std::vector<std::string> describe(const DiffusivityDeclaration& d, const std::vector<Component>& comps)
{
    std::vector<std::string> out;
    if (!d.declared) return out;
    const bool kt = d.rule == Rule::VignesKooijmanTaylor;
    out.push_back(std::string("liquidDiffusivity returns ") + returnsName(d.returns)
        + (d.returns == Returns::effective
               ? (kt ? ": the effective diffusivity of a named component of a liquid of two or more"
                       " components, by the composition rule and the reduction below"
                     : ": the effective diffusivity of a BINARY liquid, by the composition rule below;"
                       " three or more components present are refused under this rule (no multicomponent form of it"
                       " has been read; rule VignesKooijmanTaylor with a reduction answers for them)")
               : ": the infinite-dilution value of a named solute in a named solvent, combined by nothing"));
    if (!d.defaultModel.empty())
        out.push_back("liquidDiffusivity infinite dilution, every pair not listed below: " + d.defaultModel
            + (ruleIsViscosityCorrected(d.rule)
                   ? " in the mixture's viscosity (the rule's D0 mu_solvent / mu, term for term)"
                   : " in the pure solvent's viscosity"));
    for (const auto& e : d.entries)
        if (!e.model.empty())
            out.push_back("liquidDiffusivity infinite dilution, " + comps[e.solute].name() + " in "
                + comps[e.solvent].name() + " (kind " + e.kind + "): " + e.model + " named for the"
                " pair" + (e.outsideScope ? ", OUTSIDE THE METHOD'S STATED SCOPE (Poling 5th ed."
                                            " p. 11.22: not to be used with water as the solute)"
                                          : std::string())
                + ", reason: " + e.reason);
        else
            out.push_back("liquidDiffusivity infinite dilution, " + comps[e.solute].name() + " in "
                + comps[e.solvent].name() + " (kind " + e.kind + "): " + fmt("%.6g m2/s", e.D)
                + fmt(" at %.6g K", e.T) + "; box T " + fmt("%.6g", e.boxT.first) + fmt("-%.6g K", e.boxT.second)
                + " (hard)" + (e.reason.empty() ? std::string() : ", reason: " + e.reason)
                + "; source: " + e.source + " (" + e.where + ")");
    if (d.returns == Returns::effective)
    {
        out.push_back(std::string("liquidDiffusivity composition rule ") + ruleName(d.rule) + ": "
            + ruleEquation(d.rule) + "; " + ruleCitation(d.rule));
        if (kt)
        {
            out.push_back(std::string("liquidDiffusivity reduction ")
                + (d.reduction == Reduction::none ? "(none: a binary liquid, every reduction returns the pair value)"
                                                   : reductionName(d.reduction))
                + (d.reduction == Reduction::none ? std::string()
                   : ": " + reductionEquation(d.reduction) + "; " + reductionCitation(d.reduction)));
            out.push_back("liquidDiffusivity Gamma: the film takes 1; Gamma_<i>_<j> and D_L_Fick_<i>_<j> are"
                " printed as props quantities for the student, from the activity model, the last component"
                " taking the change");
            out.push_back("liquidDiffusivity limiting value of the third component: (D0_ik D0_jk)^(1/2),"
                " Kooijman & Taylor (1991) Eq. 21, the one the paper's own Table I scores best; the form"
                " the two books print is a misprint, and the Wesselingh-Krishna value (D0_ij D0_ji)^(1/2),"
                " Eq. 20, is not used");
        }
        out.push_back("liquidDiffusivity thermodynamic factor: taken as 1 (`take 1`; the effective"
            " value is the Maxwell-Stefan one, announced in every run that uses it)");
    }
    return out;
}

} // namespace liquidTransport
} // namespace Choupo
