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
\*---------------------------------------------------------------------------*/

#include "ExpressionRate.H"
#include <functional>
#include "core/Advisory.H"
#include "core/DictAudit.H"
#include "core/RegistryRefusal.H"
#include "core/Units.H"
#include <map>
#include <algorithm>
#include <cctype>
#include <cmath>
#include <iomanip>
#include <set>
#include <sstream>
#include <stdexcept>
#include <memory>
namespace Choupo {

namespace {

const std::vector<std::string>& kineticsKeys()
{
    static const std::vector<std::string> k = {
        "type", "source", "basis", "rateOf", "parameters", "tables",
        "definitions", "rate", "forward", "reverse", "rateConstant",
        "fugacityCoefficients", "validity", "equilibriumTemperatureWindow",
        "caveats" };
    return k;
}

//  Names a formula supplies or calls itself; a declared name may not take one.
bool reservedName(const std::string& n)
{
    static const std::set<std::string> r = {
        "T", "P", "exp", "ln", "log10", "sqrt", "pow", "min", "max",
        "rate", "forward", "reverse" };
    return r.count(n) != 0;
}

bool isIdentifier(const std::string& n)
{
    if (n.empty() || !(std::isalpha(static_cast<unsigned char>(n[0])) || n[0] == '_'))
        return false;
    for (char c : n)
        if (!(std::isalnum(static_cast<unsigned char>(c)) || c == '_')) return false;
    return true;
}

const Dimensions volumetricRate { 0, -3, -1, 0, 1 };   // kmol/(m3 s)
const Dimensions perMassRate    { -1, 0, -1, 0, 1 };   // kmol/(kg s)

//  The bracket form [M L T Theta N] alone: the engine's canonical numbers
//  are kg, m, s, K, kmol -- except a molar ENERGY, held in J/mol (core/
//  Units.cpp) -- and a named label would hide that.
std::string dimsText(const Dimensions& d)
{
    if (d.isDimensionless()) return "[-]";
    return d.toBracket();
}

std::string g(scalar v, int p = 6)
{
    std::ostringstream os;
    os << std::setprecision(p) << v;
    return os.str();
}

} // namespace

ExpressionRate::ExpressionRate(const DictPtr&                  rxn,
                               const std::vector<std::string>& components,
                               const std::string&              who,
                               const RateOffer&                offer)
  : who_(who), comps_(components)
{
    const std::size_t n = comps_.size();
    auto indexOf = [&](const std::string& name) -> std::size_t
    {
        for (std::size_t i = 0; i < n; ++i) if (comps_[i] == name) return i;
        return n;
    };

    // ---- stoichiometry: nu, and nothing a power law would read ------------
    nu_.assign(n, 0.0);
    for (const auto& s : rxn->lookupDictList("stoichiometry"))
    {
        const std::string c = s->lookupWord("component");
        const std::size_t i = indexOf(c);
        if (i == n)
            throw std::runtime_error(who + ": stoichiometry names component '" + c
                + "', which is not in this system's component list.");
        nu_[i] = s->lookupScalar("nu");
        for (const char* key : { "order", "orderRev" })
            if (s->found(key))
                throw std::runtime_error(who + ": stoichiometry entry '" + c
                    + "' declares `" + key + "`, which a `type expression` law"
                      " does not read -- the formula IS the rate law, its"
                      " exponents included.  Remove the key.");
    }
    if (rxn->found("reversible"))
        throw std::runtime_error(who + ": `reversible` is not read by a `type"
            " expression` law -- declare the reverse leg in the formula itself"
            " (`forward` and `reverse`, or inside `rate`).  Remove the key.");

    auto kin = rxn->subDict("kinetics");
    for (const auto& key : kin->keys())
        if (std::find(kineticsKeys().begin(), kineticsKeys().end(), key) == kineticsKeys().end())
            throw std::runtime_error(who + ": " + registryRefusal::message(
                "`type expression` kinetics key", key, kineticsKeys(), "Accepted")
                + "  A key the engine does not read is a comment that looks"
                  " like a declaration.");

    // ---- what the value is ------------------------------------------------
    if (!kin->found("source") || kin->lookupWord("source").empty())
        throw std::runtime_error(who + ": a `type expression` law needs `source"
            " \"...\";` -- the citation its numbers come from (a law of your own"
            " says so in words).  A rate constant without its source is a"
            " number nobody can check.");
    source_ = kin->lookupWord("source");

    if (!kin->found("basis"))
        throw std::runtime_error(who + ": a `type expression` law needs `basis"
            " reactorVolume;` (the value is per cubic metre of reactor -- of"
            " catalyst BED, for a packed bed) or `basis catalystMass;` (per"
            " kilogram of catalyst; the reactor then needs `catalystLoading`)."
            "  There is no default: the two differ by the bed density.");
    basis_ = kin->lookupWord("basis");
    static const std::vector<std::string> bases = { "reactorVolume", "catalystMass" };
    if (std::find(bases.begin(), bases.end(), basis_) == bases.end())
        throw std::runtime_error(who + ": " + registryRefusal::message(
            "rate basis", basis_, bases, "Accepted"));

    if (!kin->found("rateOf"))
        throw std::runtime_error(who + ": a `type expression` law needs `rateOf"
            " extent;` (the formula is the reaction's extent rate) or `rateOf"
            " <component>;` (the net formation rate of that component -- what"
            " a paper reports as e.g. \"kmol NH3 per m3 per hour\" -- which the"
            " law divides by that component's nu).  Declared, never assumed.");
    rateOf_ = kin->lookupWord("rateOf");
    if (rateOf_ != "extent")
    {
        const std::size_t i = indexOf(rateOf_);
        if (i == n || nu_[i] == 0.0)
            throw std::runtime_error(who + ": `rateOf " + rateOf_ + "` names no"
                " component this reaction's stoichiometry carries with a"
                " non-zero nu -- the formation rate of a component the reaction"
                " does not touch is not this reaction's rate.");
        nuRateOf_ = nu_[i];
    }

    // ---- parameters --------------------------------------------------------
    std::vector<std::string> known = { "T", "P" };
    for (const auto& c : comps_)
    { known.push_back("x[" + c + "]"); known.push_back("p[" + c + "]"); known.push_back("c[" + c + "]"); }

    std::set<std::string> taken;
    auto claim = [&](const std::string& name, const std::string& kind)
    {
        if (!isIdentifier(name))
            throw std::runtime_error(who + ": " + kind + " name `" + name + "` is"
                " not a plain name (letters, digits and `_`, not starting with a"
                " digit).");
        if (reservedName(name))
            throw std::runtime_error(who + ": " + kind + " name `" + name + "` is"
                " reserved (T and P are the state; exp, ln, log10, sqrt, pow,"
                " min and max are functions; rate, forward and reverse are the"
                " law's own value).  Choose another.");
        if (!taken.insert(name).second)
            throw std::runtime_error(who + ": the name `" + name + "` is declared"
                " twice (parameters, table columns and definitions share one"
                " namespace).");
        known.push_back(name);
    };

    if (kin->found("parameters"))
    {
        auto pd = kin->subDict("parameters");
        for (const auto& key : pd->keys())
        {
            claim(key, "parameter");
            if (!pd->hasDimensions(key))
                throw std::runtime_error(who + ": parameter `" + key + "` carries"
                    " no unit.  Every parameter states its unit -- write `-` for"
                    " a pure number -- so the formula's dimensions can be"
                    " checked and a reader can see what the number is.");
            Param p;
            p.name  = key;
            p.value = pd->lookupScalar(key);
            p.dims  = pd->dimensionsOf(key);
            params_.push_back(p);
        }
    }

    // ---- tables ------------------------------------------------------------
    if (kin->found("tables"))
    {
        auto td = kin->subDict("tables");
        for (const auto& group : td->keys())
        {
            auto t = td->subDict(group);
            for (const char* need : { "x", "xUnit", "yUnit" })
                if (!t->found(need))
                    throw std::runtime_error(who + ": table `" + group + "` needs `"
                        + need + "` -- a table states its abscissa, and the unit"
                          " of both columns (`-` for a pure number).");
            auto unitOf = [&](const std::string& word) -> units::UnitSpec
            {
                const auto u = units::lookupUnit(word);
                if (!u)
                    throw std::runtime_error(who + ": table `" + group + "`: unit `"
                        + word + "` is not a unit this engine knows.");
                if (u->affine)
                    throw std::runtime_error(who + ": table `" + group + "`: unit `"
                        + word + "` is affine (an offset scale); declare the"
                          " column in K.");
                return *u;
            };
            const std::string xu = t->lookupWord("xUnit");
            const auto ux = unitOf(xu);
            const auto uy = unitOf(t->lookupWord("yUnit"));
            std::vector<scalar> x = t->lookupList("x");
            if (x.size() < 2)
                throw std::runtime_error(who + ": table `" + group + "` declares"
                    " fewer than two points -- one point is a constant, declare it"
                    " as a parameter.");
            for (auto& v : x) v *= ux.factor;
            for (std::size_t k = 1; k < x.size(); ++k)
                if (!(x[k] > x[k - 1]))
                    throw std::runtime_error(who + ": table `" + group + "`: x must"
                        " be strictly increasing.");
            tableGroups_.push_back(group);
            bool anyColumn = false;
            for (const auto& col : t->keys())
            {
                if (col == "x" || col == "xUnit" || col == "yUnit") continue;
                claim(col, "table column");
                std::vector<scalar> y = t->lookupList(col);
                if (y.size() != x.size())
                    throw std::runtime_error(who + ": table `" + group + "` column `"
                        + col + "` has " + std::to_string(y.size()) + " values for "
                        + std::to_string(x.size()) + " points.");
                for (auto& v : y) v *= uy.factor;
                auto tab = std::make_shared<Formula::Table>();
                tab->name = col; tab->group = group;
                tab->x = x; tab->y = y;
                tab->xDims = ux.dims; tab->yDims = uy.dims;
                tab->xUnit = xu; tab->xFactor = ux.factor;
                tables_[col] = tab;
                anyColumn = true;
            }
            if (!anyColumn)
                throw std::runtime_error(who + ": table `" + group + "` declares no"
                    " column -- a table is an x list and at least one y list.");
        }
    }

    // ---- definitions, compiled in dependency order ------------------------
    std::map<std::string, std::string> defText;
    std::vector<std::string>           defOrderDeclared;
    if (kin->found("definitions"))
    {
        auto dd = kin->subDict("definitions");
        for (const auto& key : dd->keys())
        {
            claim(key, "definition");
            defText[key] = dd->lookupWord(key);
            defOrderDeclared.push_back(key);
        }
    }

    const std::size_t firstDefSlot = 2 + 3 * n;
    std::map<std::string, std::size_t> defSlot;      // compiled
    std::set<std::string>              inProgress;
    std::vector<std::string>           chain;

    Formula::TableResolver tableOf = [&](const std::string& fn)
        -> std::shared_ptr<const Formula::Table>
    {
        auto it = tables_.find(fn);
        return it == tables_.end() ? nullptr : it->second;
    };

    std::function<void(const std::string&)> compileDef;
    Formula::Resolver resolve = [&](const std::string& id) -> std::optional<Formula::Symbol>
    {
        Formula::Symbol s;
        if (id == "T") { s.slot = slotT(); s.dims = Dims::temperature; return s; }
        if (id == "P") { s.slot = slotP(); s.dims = Dims::pressure;    return s; }
        const auto lb = id.find('[');
        if (lb != std::string::npos && id.back() == ']')
        {
            const std::string head = id.substr(0, lb);
            const std::string comp = id.substr(lb + 1, id.size() - lb - 2);
            if (head != "x" && head != "p" && head != "c") return std::nullopt;
            const std::size_t i = indexOf(comp);
            if (i == n)
            {
                std::string list;
                for (const auto& c : comps_) list += (list.empty() ? "" : ", ") + c;
                throw std::runtime_error(who + ": `" + id + "` names component '"
                    + comp + "', which is not in this system (" + list + ").");
            }
            if (head == "x") { s.slot = slotX(i);  s.dims = Dims::dimensionless; }
            if (head == "p") { s.slot = slotPp(i); s.dims = Dims::pressure; }
            if (head == "c") { s.slot = slotC(i);  s.dims = Dims::concentration; }
            return s;
        }
        for (const auto& p : params_)
            if (p.name == id)
            { s.constant = true; s.value = p.value; s.dims = p.dims; return s; }
        if (defText.count(id))
        {
            compileDef(id);
            for (const auto& d : defs_)
                if (d.name == id) { s.slot = d.slot; s.dims = d.f.dims(); return s; }
        }
        return std::nullopt;
    };

    compileDef = [&](const std::string& name)
    {
        if (defSlot.count(name)) return;
        if (inProgress.count(name))
        {
            std::string c;
            for (const auto& k : chain) c += k + " -> ";
            throw std::runtime_error(who + ": the definitions form a CYCLE ("
                + c + name + ") -- a definition cannot be computed from itself.");
        }
        inProgress.insert(name);
        chain.push_back(name);
        Def d;
        d.name = name;
        d.text = defText[name];
        d.f = Formula::compile(d.text, resolve, tableOf,
                               who + ", definition `" + name + "`", known);
        chain.pop_back();
        inProgress.erase(name);
        d.slot = firstDefSlot + defs_.size();
        defSlot[name] = d.slot;
        defs_.push_back(std::move(d));
    };
    for (const auto& name : defOrderDeclared) compileDef(name);
    nSlots_ = firstDefSlot + defs_.size();

    // ---- the rate, or its two legs ----------------------------------------
    const bool hasRate = kin->found("rate");
    const bool hasF = kin->found("forward"), hasR = kin->found("reverse");
    if (hasRate == (hasF || hasR) || hasF != hasR)
        throw std::runtime_error(who + ": a `type expression` law declares EITHER"
            " `rate \"...\";` OR both `forward \"...\";` and `reverse \"...\";`"
            " (the net rate is then forward - reverse, and the law's own"
            " equilibrium -- where the two are equal -- becomes something the"
            " reactor can report).");
    const Dimensions want = (basis_ == "reactorVolume") ? volumetricRate : perMassRate;
    auto compileTop = [&](const std::string& key) -> Formula
    {
        Formula f = Formula::compile(kin->lookupWord(key), resolve, tableOf,
                                     who + ", `" + key + "`", known);
        if (f.dims() != want)
            throw std::runtime_error(who + ": `" + key + "` has dimensions "
                + dimsText(f.dims()) + ", but `basis " + basis_ + "` makes it a rate"
                " in " + dimsText(want) + (basis_ == "reactorVolume"
                    ? " (amount per reactor volume per time)"
                    : " (amount per catalyst mass per time)")
                + ".  Give the rate constant its unit (e.g. `k0 1.5e3 kmol/m3/h;`)"
                  " -- the engine converts it; a bare number is dimensionless.");
        return f;
    };
    if (hasRate) rate_ = compileTop("rate");
    else { forward_ = compileTop("forward"); reverse_ = compileTop("reverse"); legs_ = true; }

    // ---- what the formulas read --------------------------------------------
    auto scan = [&](const Formula& f)
    {
        for (std::size_t s : f.slotsUsed())
        {
            if (s == slotP() || (s >= slotPp(0) && s < slotPp(0) + n)) usesPressure_ = true;
            if (s >= slotC(0) && s < slotC(0) + n) usesConcentration_ = true;
        }
    };
    for (const auto& d : defs_) scan(d.f);
    if (rate_) scan(*rate_);
    if (forward_) { scan(*forward_); scan(*reverse_); }
    if (usesPressure_ && !offer.pressure)
        throw std::runtime_error(who + ": the formula reads the pressure (P or"
            " p[i]), and " + (offer.pressureAbsent.empty()
                ? std::string("this reactor carries no pressure a rate law can"
                    " read.  Write the law in concentrations or mole fractions,"
                    " or run it in a reactor that carries its pressure (cstr, pfr).")
                : offer.pressureAbsent)
            + "  No pressure is assumed.");
    if (usesConcentration_ && !offer.concentration)
        throw std::runtime_error(who + ": the formula reads concentrations"
            " (c[i]), which this reactor does not form.");

    // ---- optional reporting declarations -----------------------------------
    auto knowsName = [&](const std::string& nm)
    {
        if (defSlot.count(nm)) return true;
        for (const auto& p : params_) if (p.name == nm) return true;
        return false;
    };
    if (kin->found("rateConstant"))
    {
        auto rc = kin->subDict("rateConstant");
        rateConstantName_ = rc->lookupWord("name");
        rateConstantUnit_ = rc->lookupWord("unit");
        if (!knowsName(rateConstantName_))
            throw std::runtime_error(who + ": `rateConstant.name " + rateConstantName_
                + "` is neither a parameter nor a definition of this law.");
        const auto u = units::lookupUnit(rateConstantUnit_);
        if (!u || u->affine || u->dims != dimsOf(rateConstantName_))
            throw std::runtime_error(who + ": `rateConstant.unit " + rateConstantUnit_
                + "` is not a unit of `" + rateConstantName_ + "`'s dimensions "
                + dimsText(dimsOf(rateConstantName_)) + ".");
    }
    if (kin->found("fugacityCoefficients"))
    {
        auto fc = kin->subDict("fugacityCoefficients");
        for (const auto& c : fc->keys())
        {
            if (indexOf(c) == n)
                throw std::runtime_error(who + ": fugacityCoefficients names '" + c
                    + "', which is not in this system.");
            const std::string d = fc->lookupWord(c);
            if (!defSlot.count(d) || !dimsOf(d).isDimensionless())
                throw std::runtime_error(who + ": fugacityCoefficients." + c + " = `"
                    + d + "` must be a DIMENSIONLESS definition of this law.");
            fugacity_[c] = d;
        }
    }
    if (kin->found("validity"))
    {
        auto vd = kin->subDict("validity");
        for (const auto& key : vd->keys())
        {
            auto e = vd->subDict(key);
            Validity v;
            v.name = key;
            Dimensions dims;
            if (key == "T") dims = Dims::temperature;
            else if (key == "P") dims = Dims::pressure;
            else if (knowsName(key)) dims = dimsOf(key);
            else
                throw std::runtime_error(who + ": validity entry `" + key + "` is"
                    " neither T, P, a parameter nor a definition.");
            if (!e->found("outside"))
                throw std::runtime_error(who + ": validity." + key + " needs"
                    " `outside announce;` or `outside refuse;` -- what leaving the"
                    " window MEANS is the author's statement about the source.");
            const std::string o = e->lookupWord("outside");
            static const std::vector<std::string> outs = { "announce", "refuse" };
            if (std::find(outs.begin(), outs.end(), o) == outs.end())
                throw std::runtime_error(who + ": " + registryRefusal::message(
                    "validity outside word", o, outs, "Accepted"));
            v.refuse = (o == "refuse");
            //  The unit the window is SHOWN in (optional; SI otherwise).
            if (e->found("unit"))
            {
                v.unit = e->lookupWord("unit");
                const auto u = units::lookupUnit(v.unit);
                if (!u || u->affine || u->dims != dims)
                    throw std::runtime_error(who + ": validity." + key + ".unit `"
                        + v.unit + "` is not a unit of " + dimsText(dims) + ".");
                v.factor = u->factor;
            }
            else if (!dims.isDimensionless())
                v.unit = "(SI)";
            if (e->found("min")) { v.hasLo = true; v.lo = e->lookupScalar("min", dims); }
            if (e->found("max")) { v.hasHi = true; v.hi = e->lookupScalar("max", dims); }
            if (!v.hasLo && !v.hasHi)
                throw std::runtime_error(who + ": validity." + key + " declares"
                    " neither `min` nor `max`.");
            validity_.push_back(v);
        }
        // A window on a PARAMETER is decided now, once: it cannot move.
        std::vector<scalar> none;
        for (const auto& v : validity_)
            for (const auto& p : params_)
                if (p.name == v.name)
                {
                    const bool out = (v.hasLo && p.value < v.lo) || (v.hasHi && p.value > v.hi);
                    if (!out) continue;
                    const std::string u = v.unit.empty() ? std::string() : " " + v.unit;
                    std::ostringstream os;
                    os << who << ": parameter `" << p.name << "` = " << g(p.value / v.factor)
                       << u << " lies outside the window the law declares for it"
                       << (v.hasLo ? " (min " + g(v.lo / v.factor) : std::string(" ("))
                       << (v.hasHi ? std::string(v.hasLo ? ", " : "") + "max " + g(v.hi / v.factor)
                                   : std::string())
                       << u << ")";
                    if (v.refuse)
                        throw std::runtime_error(os.str() + " -- declared `outside"
                            " refuse`, so this REFUSES.  The source's correlation"
                            " was not fitted there.");
                    AdvisoryLog::instance().add("model", "warning", who, os.str());
                }
    }
    if (kin->found("equilibriumTemperatureWindow"))
    {
        if (!legs_)
            throw std::runtime_error(who + ": `equilibriumTemperatureWindow` is the"
                " range in which the law's OWN equilibrium (forward = reverse) is"
                " searched -- it needs `forward` and `reverse`, not a single"
                " `rate`.");
        auto w = kin->subDict("equilibriumTemperatureWindow");
        Teq_min_ = w->lookupScalar("min", Dims::temperature);
        Teq_max_ = w->lookupScalar("max", Dims::temperature);
        if (!(Teq_max_ > Teq_min_) || !(Teq_min_ > 0.0))
            throw std::runtime_error(who + ": equilibriumTemperatureWindow needs"
                " 0 < min < max.");
    }
    if (kin->found("caveats")) caveats_ = kin->lookupWordList("caveats");
}

const std::string& ExpressionRate::typeName() const
{
    static const std::string s = "expression";
    return s;
}

bool ExpressionRate::knows(const std::string& name) const
{
    if (name == "rate" || (legs_ && (name == "forward" || name == "reverse"))) return true;
    for (const auto& d : defs_)    if (d.name == name) return true;
    for (const auto& p : params_)  if (p.name == name) return true;
    return false;
}

Dimensions ExpressionRate::dimsOf(const std::string& name) const
{
    if (name == "rate" || (legs_ && (name == "forward" || name == "reverse")))
        return basis_ == "reactorVolume" ? volumetricRate : perMassRate;
    for (const auto& d : defs_)    if (d.name == name) return d.f.dims();
    for (const auto& p : params_)  if (p.name == name) return p.dims;
    throw std::runtime_error(who_ + ": `" + name + "` is not a parameter or"
        " definition of this law.");
}

void ExpressionRate::fillState(const RateState& s, std::vector<scalar>& v) const
{
    const std::size_t n = comps_.size();
    v.assign(nSlots_, 0.0);
    v[slotT()] = s.T;
    v[slotP()] = s.P;
    for (std::size_t i = 0; i < n; ++i)
    {
        const scalar xi = s.x ? (*s.x)[i] : 0.0;
        v[slotX(i)]  = xi;
        v[slotPp(i)] = xi * s.P;
        v[slotC(i)]  = s.conc ? (*s.conc)[i] / s.amountPerKmol : 0.0;
    }
}

void ExpressionRate::evaluateDefinitions(std::vector<scalar>& v, Formula::Trace* tr) const
{
    for (const auto& d : defs_)
    {
        const scalar r = d.f.evaluate(v, tr);
        if (!std::isfinite(r))
        {
            std::ostringstream os;
            os << who_ << ": definition `" << d.name << "` = " << d.f.pretty()
               << " evaluated to " << r << " at T = " << v[slotT()] << " K, P = "
               << v[slotP()] << " Pa, x = (";
            for (std::size_t i = 0; i < comps_.size(); ++i)
                os << (i ? ", " : "") << comps_[i] << " " << v[slotX(i)];
            os << ").  A rate law has no value here -- a quantity it divides by"
                  " is zero, or a function left its domain.  That is a property"
                  " of the declared law at this state, and this REFUSES rather"
                  " than floor it.";
            throw std::runtime_error(os.str());
        }
        v[d.slot] = r;
    }
}

std::optional<scalar> ExpressionRate::lookupValue(const std::vector<scalar>& v,
                                                  const std::string& name) const
{
    if (name == "T") return v[slotT()];
    if (name == "P") return v[slotP()];
    for (const auto& d : defs_)   if (d.name == name) return v[d.slot];
    for (const auto& p : params_) if (p.name == name) return p.value;
    return std::nullopt;
}

void ExpressionRate::checkValidity(const std::vector<scalar>& v,
                                   std::vector<std::string>* out) const
{
    for (const auto& w : validity_)
    {
        bool isParam = false;
        for (const auto& p : params_) if (p.name == w.name) isParam = true;
        if (isParam) continue;                   // decided at construction
        const auto val = lookupValue(v, w.name);
        if (!val) continue;
        const bool lo = w.hasLo && *val < w.lo;
        const bool hi = w.hasHi && *val > w.hi;
        if (!lo && !hi) continue;
        const std::string u = w.unit.empty() ? std::string() : " " + w.unit;
        std::ostringstream os;
        os << "[window] `" << w.name << "` = " << g(*val / w.factor) << u
           << " is " << (lo ? "BELOW" : "ABOVE") << " the window the law declares ("
           << (w.hasLo ? g(w.lo / w.factor) : std::string("-inf")) << " to "
           << (w.hasHi ? g(w.hi / w.factor) : std::string("+inf")) << u << ")";
        if (w.refuse)
            throw std::runtime_error(who_ + ": " + os.str() + ", declared `outside"
                " refuse` -- the source gives nothing to evaluate there, so this"
                " REFUSES rather than extrapolating.");
        if (out) out->push_back(os.str() + " -- extrapolated and ANNOUNCED, as"
            " the law declares (`outside announce`).");
    }
}

ExpressionRate::Detail ExpressionRate::evaluate(const RateState& s) const
{
    Detail d;
    fillState(s, d.slots);
    Formula::Trace tr;
    evaluateDefinitions(d.slots, &tr);
    if (rate_) d.rateSI = rate_->evaluate(d.slots, &tr);
    else
    {
        d.forwardSI = forward_->evaluate(d.slots, &tr);
        d.reverseSI = reverse_->evaluate(d.slots, &tr);
        d.rateSI = d.forwardSI - d.reverseSI;
    }
    if (!std::isfinite(d.rateSI))
        throw std::runtime_error(who_ + ": the rate evaluated to a non-finite value"
            " at T = " + g(s.T) + " K, P = " + g(s.P) + " Pa -- this REFUSES.");
    d.interpolated = tr.interpolated;
    checkValidity(d.slots, &d.outside);
    return d;
}

scalar ExpressionRate::valueOf(const Detail& d, const std::string& name) const
{
    if (name == "rate") return d.rateSI;
    if (legs_ && name == "forward") return d.forwardSI;
    if (legs_ && name == "reverse") return d.reverseSI;
    const auto v = lookupValue(d.slots, name);
    if (!v)
        throw std::runtime_error(who_ + ": `" + name + "` is not a parameter or"
            " definition of this law.");
    return *v;
}

scalar ExpressionRate::netRate(const ThermoPackage&, const RateState& s) const
{
    const Detail d = evaluate(s);
    for (const auto& m : d.outside)
        AdvisoryLog::instance().addAnnouncedOnce("expressionRate:" + who_ + ":"
            + m.substr(0, m.find(" = ")), "model", "warning", who_, m);
    for (const auto& m : d.interpolated)
        AdvisoryLog::instance().addAnnouncedOnce("expressionRate:" + who_ + ":"
            + m.substr(0, m.find(" LINEARLY")), "model", "info", who_, "[interpolated] " + m);
    const scalar extent = d.rateSI / nuRateOf_;
    return (basis_ == "reactorVolume") ? extent * s.amountPerKmol : extent;
}

scalar ExpressionRate::rateConstant(const ThermoPackage&, const RateState& s) const
{
    if (rateConstantName_.empty())
        throw std::runtime_error(who_ + ": this law declares no `rateConstant`.");
    const Detail d = evaluate(s);
    return inUnit(valueOf(d, rateConstantName_), rateConstantUnit_);
}

scalar ExpressionRate::inUnit(scalar si, const std::string& unit)
{
    return units::fromSI(si, unit);
}

scalar ExpressionRate::legImbalance(const RateState& s, scalar T) const
{
    if (!legs_)
        throw std::runtime_error(who_ + ": the law declares a single `rate`, so"
            " it has no forward and reverse legs to balance.");
    RateState t = s;
    t.T = T;
    std::vector<scalar> v;
    fillState(t, v);
    evaluateDefinitions(v, nullptr);
    return forward_->evaluate(v) - reverse_->evaluate(v);
}

scalar ExpressionRate::equilibriumTemperature(const RateState& s) const
{
    if (!hasEquilibriumWindow())
        throw std::runtime_error(who_ + ": no `equilibriumTemperatureWindow` is"
            " declared, so the law's own equilibrium temperature is not searched.");
    scalar lo = Teq_min_, hi = Teq_max_;
    scalar flo = legImbalance(s, lo);
    const scalar fhi = legImbalance(s, hi);
    if ((flo > 0.0) == (fhi > 0.0))
    {
        std::ostringstream os;
        os << who_ << ": the law's forward and reverse legs do not cross between "
           << lo << " K and " << hi << " K for this composition (forward - reverse"
              " = " << flo << " at the low end, " << fhi << " at the high end), so"
              " no equilibrium temperature lies in the declared window.";
        throw std::runtime_error(os.str());
    }
    //  Bisection: 100 halvings of any physical window is far below anything
    //  the result is quoted to.
    for (int i = 0; i < 100; ++i)
    {
        const scalar mid = 0.5 * (lo + hi);
        const scalar fm = legImbalance(s, mid);
        if ((fm > 0.0) == (flo > 0.0)) { lo = mid; flo = fm; }
        else hi = mid;
    }
    return 0.5 * (lo + hi);
}

std::string ExpressionRate::describe(const std::string& in) const
{
    std::ostringstream os;
    os << in << "source:      " << source_ << "\n"
       << in << "basis:       " << basis_ << "   (the value is in "
       << (basis_ == "reactorVolume" ? "kmol/(m3 s), per reactor volume"
                                     : "kmol/(kg s), per catalyst mass") << ")\n"
       << in << "rateOf:      " << rateOf_;
    if (rateOf_ != "extent")
        os << "   (the extent rate is the value / nu = value / " << g(nuRateOf_) << ")";
    os << "\n";
    if (!params_.empty())
    {
        os << in << "parameters  (SI, as the engine holds them):\n";
        for (const auto& p : params_)
            os << in << "    " << std::left << std::setw(14) << p.name << std::right
               << " = " << std::setprecision(10) << p.value << "   "
               << dimsText(p.dims) << "\n";
    }
    for (const auto& gname : tableGroups_)
    {
        os << in << "table " << gname << ":  linear between its points, refused"
                    " outside them; columns";
        for (const auto& kv : tables_)
            if (kv.second->group == gname) os << " " << kv.first;
        os << "\n";
    }
    if (!defs_.empty())
    {
        os << in << "definitions (in evaluation order, as PARSED):\n";
        for (const auto& d : defs_)
            os << in << "    " << std::left << std::setw(14) << d.name << std::right
               << " = " << d.f.pretty() << "   " << dimsText(d.f.dims()) << "\n";
    }
    if (rate_)
        os << in << "rate        = " << rate_->pretty() << "   " << dimsText(rate_->dims()) << "\n";
    else
        os << in << "forward     = " << forward_->pretty() << "\n"
           << in << "reverse     = " << reverse_->pretty() << "\n"
           << in << "rate        = forward - reverse   " << dimsText(forward_->dims()) << "\n";
    return os.str();
}

} // namespace Choupo
