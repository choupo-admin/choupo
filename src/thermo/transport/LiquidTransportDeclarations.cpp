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

#include "core/Dimensions.H"
#include "core/RegistryRefusal.H"
#include "thermo/Component.H"
#include "thermo/liquidProperty/ExperimentsFileAdapter.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <map>
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

void onlyKeys(const DictPtr& d, const std::vector<std::string>& allowed, const std::string& where)
{
    for (const auto& k : d->keys())
        if (std::find(allowed.begin(), allowed.end(), k) == allowed.end())
        {
            std::string list;
            for (const auto& a : allowed) list += (list.empty() ? "" : ", ") + a;
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
std::vector<ViscosityMeasurement>
readViscosityMeasurements(const DictPtr& block, const std::vector<Component>& comps)
{
    std::vector<ViscosityMeasurement> out;
    if (!block || !block->found("measured")) return out;
    const DictPtr ms = block->subDict("measured");
    for (const auto& name : ms->keys())
    {
        const std::string here = "transport liquid.viscosity.measured." + name;
        const DictPtr dec = ms->subDict(name);
        onlyKeys(dec, { "use", "reason" }, here);
        ViscosityMeasurement m;
        m.name = name;
        m.use  = dec->lookupWordOrDefault("use", "");
        if (m.use != "method" && m.use != "check")
            throw std::runtime_error(here + ": `use " + m.use + "` -- write `use method;`"
                " (the value IS the viscosity of its set inside its box) or `use check;`"
                " (printed beside the computed value, never used).");
        m.reason = dec->lookupWordOrDefault("reason", "");
        if (blank(m.reason))
            throw std::runtime_error(here + ": no `reason \"...\";`.  No law judges this"
                " box against the value's uncertainty in this slice, so standing one"
                " value over a box is a hypothesis, and the run says why.");

        const auto f = liquidProperty::experimentsAdapter::read(name, here,
            [&](const std::string& col) -> Dimensions
            {
                if (col == "T")  return Dims::temperature;
                if (col == "P")  return Dims::pressure;   // stated by the source; a liquid viscosity is not corrected for it
                if (col == "mu") return Dims::viscosity;
                if (col.size() > 3 && col.compare(0, 2, "w[") == 0 && col.back() == ']')
                    return Dims::dimensionless;
                throw std::runtime_error("constant/experiments/" + name + ".dat: column `" + col
                    + "` -- a liquid-viscosity point reads `mu` (required), `T`, `P` and"
                      " mass fractions `w[<component>]`.");
            });
        m.where    = f.where;
        m.citation = f.citation;
        onlyKeys(f.dict, { "provenance", "system", "property", "solvent", "columns", "data",
                           "uncertainty", "box" }, f.where);
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
        if (f.property != "liquidViscosity")
            throw std::runtime_error(f.where + ": `property " + f.property + "` -- the"
                " declaration `" + here + "` reads a liquidViscosity point.");
        if (f.rows.size() != 1)
            throw std::runtime_error(f.where + ": " + std::to_string(f.rows.size())
                + " points -- a marked mixture measurement is ONE point (a table of a"
                  " pure component's values is a law, slice (c)).");
        if (f.system.empty())
            throw std::runtime_error(f.where + ": no `system ( ... );` -- the constituent"
                " set the measurement describes.");
        std::set<std::size_t> set;
        for (const auto& c : f.system) set.insert(indexOf(comps, c, f.where + " system"));
        m.set.assign(set.begin(), set.end());
        //  A ONE-CONSTITUENT SET IS REFUSED (review row DG-03): the pure liquid's
        //  viscosity is a LAW of its record, read wherever the package needs a
        //  pure value (the mixing rule's inputs, Wilke-Chang's solvent, the mu_j
        //  of a viscosity-corrected rule); a measured mixture value would give
        //  the same pure liquid two viscosities in one run.
        if (m.set.size() < 2)
            throw std::runtime_error(here + " (" + f.where + "): `system` names ONE"
                " component.  A stated value of a pure liquid is not a mixture value: it"
                " belongs to the component, as a law of its record or a table law pinned"
                " for it (`transport { liquid { viscosity { pin ( { component " + f.system.front()
                + "; law <name>; reason \"...\"; } ); } } }`, the table type of C398"
                " slice (c)), so the package prices that liquid with one viscosity.");
        if (m.set.size() > 1)
        {
            m.solvent = f.dict->lookupWordOrDefault("solvent", "");
            if (std::find(f.system.begin(), f.system.end(), m.solvent) == f.system.end())
                throw std::runtime_error(f.where + ": `solvent` must name one of `system`"
                    " -- the constituent whose mass fraction is the rest.");
        }
        m.mu = liquidProperty::experimentsAdapter::valueOf(f, 0, "mu");
        if (!(m.mu > 0.0))
            throw std::runtime_error(f.where + ": `mu` must be positive.");
        if (liquidProperty::experimentsAdapter::hasColumn(f, "T"))
        { m.hasT = true; m.T = liquidProperty::experimentsAdapter::valueOf(f, 0, "T"); }
        if (liquidProperty::experimentsAdapter::hasColumn(f, "P"))
        { m.hasP = true; m.P = liquidProperty::experimentsAdapter::valueOf(f, 0, "P"); }
        scalar wsum = 0.0;
        for (const auto& col : f.columns)
            if (col.name.compare(0, 2, "w[") == 0)
            {
                const std::string cn = col.name.substr(2, col.name.size() - 3);
                if (cn == m.solvent || std::find(f.system.begin(), f.system.end(), cn) == f.system.end())
                    throw std::runtime_error(f.where + ": column `" + col.name + "` names a"
                        " constituent that is not a non-solvent member of `system`.");
                m.w[cn] = liquidProperty::experimentsAdapter::valueOf(f, 0, col.name);
                wsum += m.w[cn];
            }
        if (!m.w.empty()) m.w[m.solvent] = 1.0 - wsum;

        if (!f.dict->found("box"))
            throw std::runtime_error(f.where + ": no `box { T (lo hi); w[<c>] (lo hi); }` --"
                " the hard extent the case stands the value over.");
        const DictPtr box = f.dict->subDict("box");
        std::vector<std::string> boxKeys{ "T" };
        for (const auto& c : f.system) if (c != m.solvent) boxKeys.push_back("w[" + c + "]");
        onlyKeys(box, boxKeys, f.where + " box");
        m.boxT = pairOf(box, "T", f.where + " box");
        for (const auto& c : f.system)
            if (c != m.solvent && m.set.size() > 1)
                m.boxW[c] = pairOf(box, "w[" + c + "]", f.where + " box");
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
        out.push_back(std::move(m));
    }
    return out;
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
    return "stated value " + m.name + " (" + m.basis + ")";
}

bool isWater(const Component& c)
{
    return c.cas() == "7732-18-5" || (c.cas().empty() && c.name() == "water");
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
        case Rule::none:            break;
    }
    return "none";
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
        const auto f = liquidProperty::experimentsAdapter::read(name, here,
            [&](const std::string& col) -> Dimensions
            {
                if (col == "T") return Dims::temperature;
                if (col == "D") return Dims::diffusivity;
                throw std::runtime_error("constant/experiments/" + name + ".dat: column `" + col
                    + "` -- an infinite-dilution liquid diffusivity reads `T` and `D`.");
            });
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
        if (f.rows.size() != 1)
            throw std::runtime_error(f.where + ": " + std::to_string(f.rows.size())
                + " points.  A table of values with an interpolation is slice (c)'s table"
                  " type, not yet in the tree; in this slice an entry's file holds ONE"
                  " point (a value at a stated temperature).");
        d.T  = liquidProperty::experimentsAdapter::valueOf(f, 0, "T");
        d.D  = liquidProperty::experimentsAdapter::valueOf(f, 0, "D");
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
    if (!hasNew)
    {
        d.legacy = true;
        d.defaultModel = b->lookupWordOrDefault("model", "");
        return d;
    }
    d.legacy = false;
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
        onlyKeys(c, { "rule" }, here + ".composition");
        const std::string r = c->lookupWordOrDefault("rule", "");
        if (r == "CaldwellBabb")         d.rule = Rule::CaldwellBabb;
        else if (r == "Vignes")          d.rule = Rule::Vignes;
        else if (r == "LefflerCullinan") d.rule = Rule::LefflerCullinan;
        else if (r == "AndersonBabb")    d.rule = Rule::AndersonBabb;
        else if (r == "VignesKooijmanTaylor")
            throw std::runtime_error(here + ".composition: `rule VignesKooijmanTaylor` is"
                " refused until its source is read.  The chapter that reports it (Taylor &"
                " Kooijman 2014, Eqs. 3.38-3.41) prints its limiting diffusivity as"
                " (D0_ik D0_ki)^(1/2), which does not contain j, and the 1991 paper that"
                " proposed it is not in hand (DEV.md 4c C398, slice (d) ruling 5).");
        else
            throw std::runtime_error(here + ".composition: " + registryRefusal::message(
                "liquid-diffusivity composition rule", r.empty() ? "(none written)" : r,
                { "CaldwellBabb", "Vignes", "LefflerCullinan", "AndersonBabb" }, "Accepted"));
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
                " (CaldwellBabb, Vignes, LefflerCullinan, AndersonBabb).");
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
    std::string s = statedWords(m) + ", use " + m.use + ", a mixture value of " + set + ": "
                  + fmt("%.6g Pa s", m.mu);
    if (m.hasT) s += fmt(" at %.6g K", m.T);
    if (m.hasP) s += fmt(" at %.6g Pa (stated; not applied)", m.P);
    for (const auto& [c, w] : m.w) if (c != m.solvent) s += ", w[" + c + "] " + fmt("%.6g", w);
    if (!m.hasT && m.w.empty()) s += " (the source states no temperature and no composition)";
    s += "; box T " + fmt("%.6g", m.boxT.first) + fmt("-%.6g K", m.boxT.second);
    for (const auto& [c, lim] : m.boxW) s += ", w[" + c + "] " + fmt("%.6g", lim.first) + fmt("-%.6g", lim.second);
    s += std::string(" (hard); ") + (m.hasT && !m.w.empty() ? "away from the stated point" : "at every state (no stated point)")
       + " the case's assumption, reason: " + m.reason
       + "; source: " + m.citation + " (" + m.where + ")";
    return s;
}

std::vector<std::string> describe(const DiffusivityDeclaration& d, const std::vector<Component>& comps)
{
    std::vector<std::string> out;
    if (!d.declared || d.legacy) return out;
    out.push_back(std::string("liquidDiffusivity returns ") + returnsName(d.returns)
        + (d.returns == Returns::effective
               ? ": the effective diffusivity of a BINARY liquid, by the composition rule below;"
                 " three or more components present are refused (no reduction rule read)"
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
        out.push_back("liquidDiffusivity thermodynamic factor: taken as 1 (`take 1`; the effective"
            " value is the Maxwell-Stefan one, announced in every run that uses it)");
    }
    return out;
}

} // namespace liquidTransport
} // namespace Choupo
