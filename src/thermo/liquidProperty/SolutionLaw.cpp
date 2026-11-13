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

#include "SolutionLaw.H"

#include "DensityResolver.H"
#include "core/Advisory.H"
#include "core/Dimensions.H"
#include "core/PropertySourceLog.H"
#include "thermo/PropertyDomainError.H"
#include "thermo/RecordResolver.H"
#include "thermo/ThermoPackage.H"

#include <algorithm>
#include <cmath>
#include <filesystem>
#include <cstdio>
#include <iostream>
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

//  The form of Olsson, Jernqvist and Aly (1997), Eqs. (6)-(9): three
//  coefficient rows b1, b2, b3, each six terms in x^(k/2), k = 0..5.
class PolynomialTSqrtX : public SolutionForm
{
public:
    PolynomialTSqrtX(const DictPtr& d, const std::string& where)
    {
        const char* rows[3] = { "b1", "b2", "b3" };
        for (int j = 0; j < 3; ++j)
        {
            if (!d->found(rows[j]))
                throw std::runtime_error(where + ": the form polynomialTSqrtX needs"
                    " three coefficient rows b1, b2, b3 (six numbers each, the"
                    " coefficients of x^0, x^(1/2), ..., x^(5/2)); `" + rows[j]
                    + "` is absent.");
            const auto v = d->lookupList(rows[j]);
            if (v.size() != 6)
                throw std::runtime_error(where + ": `" + rows[j] + "` carries "
                    + std::to_string(v.size()) + " numbers; the form polynomialTSqrtX"
                    " takes exactly six per row.");
            for (int k = 0; k < 6; ++k) c_[j][k] = v[k];
        }
    }
    std::string name() const override { return "polynomialTSqrtX"; }
    scalar rho(scalar t, scalar x) const override
    {
        const scalar s = std::sqrt(x);
        scalar b[3];
        for (int j = 0; j < 3; ++j)
        {
            scalar sum = 0.0, p = 1.0;
            for (int k = 0; k < 6; ++k) { sum += c_[j][k] * p; p *= s; }
            b[j] = sum;
        }
        return b[0] + b[1] * t + b[2] * t * t;                   // Eq. (6)
    }
private:
    scalar c_[3][6] = {};
};

const Component* componentNamed(const ThermoPackage& thermo, const std::string& n, std::size_t& at)
{
    for (std::size_t i = 0; i < thermo.n(); ++i)
        if (thermo.comp(i).name() == n) { at = i; return &thermo.comp(i); }
    return nullptr;
}

} // namespace

// ---- The forms' factory ----------------------------------------------------
std::map<std::string, SolutionForm::Factory>& SolutionForm::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void SolutionForm::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<SolutionForm> SolutionForm::New(const std::string& name, const DictPtr& block,
                                                const std::string& where)
{
    const auto it = registry().find(name);
    if (it == registry().end())
    {
        std::string avail;
        for (const auto& kv : registry()) avail += " " + kv.first;
        throw std::runtime_error(where + ": unknown form '" + name
            + "' of a solution's density law.  Registered:"
            + (avail.empty() ? std::string(" (none)") : avail));
    }
    return it->second(block, where);
}

void SolutionForm::registerBuiltins()
{
    registerType("polynomialTSqrtX", [](const DictPtr& d, const std::string& w)
        { return std::make_unique<PolynomialTSqrtX>(d, w); });
}

// ---- The record ------------------------------------------------------------
std::string SolutionLaw::recordFor(const ThermoPackage& thermo, const std::vector<std::size_t>& set)
{
    const std::string sub = "parameters/solution/" + setFileName(thermo, set) + ".dat";
    const auto p = records::resolveRecord(sub);
    if (p.empty() || !std::filesystem::exists(p)) return "";
    const DictPtr d = Dictionary::fromFile(p.string());
    if (!d->found("liquidDensity")) return "";
    return p.string();
}

SolutionLaw::SolutionLaw(const Binding& b)
  : thermo_(b.thermo), set_(b.set), path_(b.recordName)
{
    setName_ = setDisplayName(*thermo_, set_);
    const DictPtr r = Dictionary::fromFile(path_);
    //  Named by its place in the mirrored tree, never by this machine's path.
    shown_ = "parameters/solution/" + std::filesystem::path(path_).filename().string();
    const std::string where = shown_;
    //  The roles the record states are its constituent set; it must be the
    //  request's, exactly (plan section 4: a third constituent passes the
    //  method over, never applies it).
    std::vector<std::string> roles = { r->lookupWord("solute"), r->lookupWord("solvent") };
    std::vector<std::size_t> recSet;
    for (const auto& n : roles)
    {
        std::size_t i = 0;
        if (!componentNamed(*thermo_, n, i))
            throw PropertyDomainError(PropertyDomainError::Kind::missingDatum,
                where + ": names '" + n + "', which is not a component of this case.");
        recSet.push_back(i);
    }
    std::sort(recSet.begin(), recSet.end());
    if (recSet != set_)
        throw std::runtime_error(where + ": the record states the set "
            + setDisplayName(*thermo_, recSet) + " (one solute, one solvent) and was found"
            " for the set " + setName_ + ".  The solution record holds a binary only;"
            " a law for a set of three or more has no record kind yet (C378 pilot"
            " review, PA-08).");

    const DictPtr ld = r->subDict("liquidDensity");
    const std::string w = where + " liquidDensity";
    //  An unknown key is refused, naming the keys this block reads (C378
    //  pilot review, PA-05): a word the reader skips is a statement nobody
    //  executes.  The form's own coefficient rows are its keys (b1-b3).
    for (const auto& k : ld->keys())
        if (k != "returns" && k != "form" && k != "variable" && k != "temperatureOrigin"
            && k != "domain" && k != "pressure" && k != "provenance"
            && k != "b1" && k != "b2" && k != "b3")
            throw std::runtime_error(w + ": unknown word '" + k + "'.  The block reads"
                " returns, form, variable, temperatureOrigin, domain, pressure,"
                " provenance and the form's coefficient rows (polynomialTSqrtX: b1, b2, b3).");
    const std::string ret = ld->lookupWord("returns");
    if (ret != "solutionDensity")
        throw std::runtime_error(w + ": `returns " + ret + "` -- the pilot reads"
            " one kind, `solutionDensity` (kg/m3 of the solution).");
    form_ = SolutionForm::New(ld->lookupWord("form"), ld, w);

    //  The composition variable, `w[<component>]`: a mass fraction of a
    //  constituent of the set.
    const std::string var = ld->lookupWord("variable");
    if (var.size() < 4 || var.compare(0, 2, "w[") != 0 || var.back() != ']')
        throw std::runtime_error(w + ": `variable " + var + "` -- write the mass"
            " fraction of a constituent, `w[<component>]`.");
    const std::string vc = var.substr(2, var.size() - 3);
    std::size_t vi = 0;
    if (!componentNamed(*thermo_, vc, vi)
        || std::find(set_.begin(), set_.end(), vi) == set_.end())
        throw std::runtime_error(w + ": `variable " + var + "` names a component"
            " that is not in the record's set " + setName_ + ".");
    variable_ = vi;
    Torigin_  = ld->lookupScalar("temperatureOrigin", Dims::temperature);

    for (const auto& band : ld->lookupDictList("domain"))
    {
        if (!band->found("T") || !band->found(var))
            throw std::runtime_error(w + ": each `domain` band carries both limits,"
                " `T (Tlo Thi);` (K) and `" + var + " (lo hi);`.");
        for (const auto& k : band->keys())
            if (k != "T" && k != var)
                throw std::runtime_error(w + ": a `domain` band reads `T` and `" + var
                    + "`; unknown word '" + k + "'.");
        const auto t = band->lookupList("T");
        const auto x = band->lookupList(var);
        if (t.size() != 2 || x.size() != 2 || !(t[0] < t[1]) || !(x[0] < x[1]))
            throw std::runtime_error(w + ": a `domain` band needs two increasing"
                " limits for T and for " + var + ".");
        domain_.push_back({ t[0], t[1], x[0], x[1] });
    }
    if (domain_.empty())
        throw std::runtime_error(w + ": a law without a `domain` is refused --"
            " the record states where it holds.");
    const std::string pres = ld->lookupWord("pressure");
    if (pres != "notCarried")
        throw std::runtime_error(w + ": `pressure " + pres + "` -- the pilot's"
            " forms carry no pressure term; write `pressure notCarried;`.");
    const DictPtr pv = ld->subDict("provenance");
    citation_     = pv->lookupWord("citation");
    uncertainty_  = pv->lookupWord("uncertainty");
    maxDeviation_ = pv->lookupScalar("maxDeviation", Dims::density);
}

SolutionLaw::~SolutionLaw() = default;

std::string SolutionLaw::id() const
{
    return "solutionLaw." + std::filesystem::path(path_).stem().string();
}

DensityAnswer SolutionLaw::evaluate(scalar T, scalar P, const sVector& x) const
{
    //  Mass fractions over the set, from the request's mole fractions.
    scalar M = 0.0;
    for (const std::size_t i : set_) if (x[i] > 0.0) M += x[i] * thermo_->comp(i).MW();
    if (!(M > 0.0))
        throw PropertyDomainError(PropertyDomainError::Kind::invalidState,
            "liquid density: empty composition");
    const scalar xv = x[variable_] * thermo_->comp(variable_).MW() / M;
    const std::string var = "w[" + thermo_->comp(variable_).name() + "]";
    bool inside = false;
    for (const auto& b : domain_)
        if (T >= b.Tlo && T <= b.Thi && xv >= b.xlo && xv <= b.xhi) { inside = true; break; }
    if (!inside)
    {
        std::string bands;
        for (const auto& b : domain_)
            bands += (bands.empty() ? "" : "; ") + fmt("T %.6g", b.Tlo) + fmt("-%.6g K: ", b.Thi)
                   + var + fmt(" %.4g", b.xlo) + fmt("-%.4g", b.xhi);
        throw PropertyDomainError(PropertyDomainError::Kind::outsideHardDomain,
            "liquid density of " + setName_ + ": the state T = " + fmt("%.6g K", T) + ", "
            + var + " = " + fmt("%.6g", xv) + " is outside every band of the law in "
            + shown_ + " (" + bands + ").  The record's domain is hard: the law is"
              " never extrapolated.",
            "a state inside the record's domain, or a record whose domain covers it");
    }
    DensityAnswer a;
    a.rho = form_->rho(T - Torigin_, xv);
    if (!(a.rho > 0.0) || !std::isfinite(a.rho))
        throw PropertyDomainError(PropertyDomainError::Kind::invalidState,
            "liquid density of " + setName_ + ": the law of " + shown_
            + " gives no finite positive density");
    a.v = (M / 1000.0) / a.rho;                                    // m3/mol
    a.methodId = id();
    a.label = "property kernel: the solution's own density law (" + form_->name()
            + ", " + citation_ + "), at the temperature; the law carries no pressure term";
    scalar zs = 0.0;
    for (const std::size_t i : set_) zs += x[i];
    for (const std::size_t i : set_)
        a.leaves.push_back({ thermo_->comp(i).name(), id(), zs > 0.0 ? x[i] / zs : 0.0 });
    a.pressureApplied   = false;
    a.quality.origin    = "regressed";
    a.quality.provenance = shown_;
    a.quality.domain    = "inside the record's domain (hard)";
    a.quality.evidence  = uncertainty_;
    (void)P;
    return a;
}

} // namespace liquidProperty
} // namespace Choupo
