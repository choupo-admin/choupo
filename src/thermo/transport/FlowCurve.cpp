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

#include "FlowCurve.H"

#include "core/Advisory.H"
#include "core/Dimensions.H"
#include "thermo/Component.H"
#include "thermo/PropertyDomainError.H"
#include "thermo/liquidProperty/ExperimentsFile.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <iostream>
#include <mutex>
#include <numeric>
#include <set>
#include <stdexcept>

namespace Choupo {
namespace rheology {

namespace {

std::string fmt(const char* f, double v)
{
    char b[64];
    std::snprintf(b, sizeof b, f, v);
    return b;
}

experiments::ColumnRole role(const Dimensions& d, const char* what)
{
    experiments::ColumnRole r;
    r.dims = d;
    r.what = what;
    return r;
}

void onlyKeys(const DictPtr& d, const std::vector<std::string>& allowed0, const std::string& where)
{
    std::vector<std::string> allowed = allowed0;
    allowed.push_back(experiments::experimentsDirKey());
    experiments::refuseWrittenExperimentsDir(d, where);
    for (const auto& k : d->keys())
        if (std::find(allowed.begin(), allowed.end(), k) == allowed.end())
        {
            std::string list;
            for (const auto& a : allowed0) list += (list.empty() ? "" : ", ") + a;
            throw std::runtime_error(where + ": unknown word '" + k + "' -- this block reads " + list + ".");
        }
}

std::pair<scalar, scalar> pairOf(const DictPtr& d, const std::string& k, const std::string& where)
{
    const auto v = d->lookupList(k);
    if (v.size() != 2 || !(v[0] <= v[1]))
        throw std::runtime_error(where + ": `" + k + " (lo hi);` needs two increasing limits (raw SI).");
    return { v[0], v[1] };
}

bool yes(const std::string& w) { return w == "yes" || w == "true"; }

//  ln-ln chord of the segment (a, b) of (x, y) at x (any x, y > 0).
scalar chordLog(scalar x0, scalar y0, scalar x1, scalar y1, scalar x)
{
    const scalar k = (std::log(y1) - std::log(y0)) / (std::log(x1) - std::log(x0));
    return y0 * std::exp(k * (std::log(x) - std::log(x0)));
}

} // namespace

const std::vector<CorrectionRule>& correctionRules()
{
    //  What an instrument's RAW reading needs before it is a flow curve, from the
    //  book's own list (Chhabra & Richardson, 2nd ed., Table in the study note,
    //  section 3.1; pages are the printed ones).
    static const std::vector<CorrectionRule> r = {
        { "capillary", {
            { "RabinowitschMooney", "the true wall shear rate (3n'+1)/(4n') x 8V/D, eq. 2.21, p. 60" },
            { "endEffects",         "the Bagley end-pressure correction (at least three lengths), eq. 2.22, p. 63-64" },
            { "slipChecked",        "wall slip tested (Mooney, three diameters), p. 68-70" },
            { "laminarOnly",        "the readings that left the laminar line excluded, p. 75" } } },
        { "concentricCylindersNarrowGap", {
            { "endEffects",         "the end correction of the bob, p. 76-78" },
            { "slipChecked",        "wall slip tested, p. 68-70" } } },
        { "concentricCylindersWideGap", {
            { "wideGapShearRate",   "the wide-gap rate from the slope d ln Omega / d ln tau (Krieger-Maron), eqs. 2.38-2.41, p. 79-80" },
            { "endEffects",         "the end correction of the bob, p. 76-78" },
            { "slipChecked",        "wall slip tested, p. 68-70" } } },
        { "coneAndPlate", {
            { "gapChecked",         "the gap at least 100 times the largest particle, p. 83" },
            { "slipChecked",        "wall slip tested, p. 68-70" } } },
        { "parallelPlates", {
            { "parallelPlateStress","tau = T (3 + d ln T / d ln Omega) / (2 pi R^3), eq. 2.47, p. 87" },
            { "slipChecked",        "wall slip tested by the adjustable gap, p. 87" } } },
        { "model", {} },          // rows generated from a stated constitutive equation: kind adopted | estimated
    };
    return r;
}

void refuseNewtonianAsk(const FlowCurve& c, const std::vector<Component>& comps, const sVector& /*x*/)
{
    std::string set;
    for (const std::size_t i : c.set) set += (set.empty() ? "" : " + ") + comps[i].name();
    throw PropertyDomainError(PropertyDomainError::Kind::missingDatum,
        "the liquid " + set + " is declared NON-NEWTONIAN (`transport { liquid { rheology { measured { " + c.name
        + " } } } }`, " + c.where + "): it has no one viscosity.  Its apparent viscosity is tau/gamma at a shear the"
        " unit supplies from its own geometry (a pipe's wall rate, a stirred vessel's k_s N) -- ask"
        " `liquidProperty::apparentViscosity`, never the Newtonian door (a Newtonian value here would be a number nobody declared).",
        "a unit that supplies a shear: `pipe` (laminar), `agitatedVessel`; or remove the rheology block to declare the liquid Newtonian");
}

// ===========================================================================
//  Evaluation
// ===========================================================================
scalar FlowCurve::stressUnchecked(scalar g) const
{
    if (!(g > 0.0)) return hasYield ? yield : 0.0;
    if (fit)
    {
        const Fit& f = *fit;
        if (f.model == "powerLaw")        return f.m * std::pow(g, f.n);
        if (f.model == "Bingham")         return f.tau0 + f.muB * g;
        return f.tau0 + f.m * std::pow(g, f.n);       // HerschelBulkley
    }
    const scalar y0 = hasYield ? yield : 0.0;
    const std::size_t n = gamma.size();
    //  s = tau - yield on the rows.
    auto s = [&](std::size_t k) { return tau[k] - y0; };
    if (n == 1) return y0 + s(0);                     // refused at load; defensive
    std::size_t k = 0;
    while (k + 2 < n && g > gamma[k + 1]) ++k;        // segment holding g (end segments extend)
    const bool inside = g >= gamma.front() && g <= gamma.back();
    if (inside && interpolation == "linear")
        return y0 + s(k) + (g - gamma[k]) / (gamma[k + 1] - gamma[k]) * (s(k + 1) - s(k));
    return y0 + chordLog(gamma[k], s(k), gamma[k + 1], s(k + 1), g);
}

scalar FlowCurve::rateAt(scalar stress) const
{
    const scalar y0 = hasYield ? yield : 0.0;
    const scalar s = stress - y0;
    if (!(s > 0.0)) return 0.0;
    if (fit)
    {
        const Fit& f = *fit;
        if (f.model == "Bingham") return s / f.muB;
        return std::pow(s / f.m, 1.0 / f.n);          // powerLaw (tau0 = 0), HerschelBulkley
    }
    const std::size_t n = gamma.size();
    auto sk = [&](std::size_t k) { return tau[k] - y0; };
    std::size_t k = 0;
    while (k + 2 < n && s > sk(k + 1)) ++k;
    const bool inside = s >= sk(0) && s <= sk(n - 1);
    if (inside && interpolation == "linear")
        return gamma[k] + (s - sk(k)) / (sk(k + 1) - sk(k)) * (gamma[k + 1] - gamma[k]);
    return chordLog(sk(k), gamma[k], sk(k + 1), gamma[k + 1], s);
}

Status FlowCurve::admitRate(scalar g, const std::string& asker) const
{
    Status st;
    const scalar tol = 1.0e-9 * (1.0 + g);
    if (g < gammaLoAuth - tol || g > gammaHiAuth + tol)
        throw PropertyDomainError(PropertyDomainError::Kind::outsideHardDomain,
            asker + ": the flow curve `" + name + "` (" + where + ") is asked at a shear rate of "
            + fmt("%.6g", g) + " 1/s, outside the " + (gammaLoAuth == gamma.front() && gammaHiAuth == gamma.back()
                    ? "support of its rows" : "authorised domain the case declared")
            + " (" + fmt("%.6g", gammaLoAuth) + " to " + fmt("%.6g", gammaHiAuth)
            + " 1/s).  A flow curve is never extrapolated (Chhabra & Richardson, p. 36).",
            "a state inside the measured range, or a record whose rows (or whose `authorised { gamma (lo hi); reason \"...\"; }`)"
            " reach this rate");
    st.insideSupport = g >= gamma.front() - tol && g <= gamma.back() + tol;
    st.extended = !st.insideSupport;
    st.words = st.insideSupport
        ? "inside the rows (" + fmt("%.6g", gamma.front()) + " to " + fmt("%.6g", gamma.back()) + " 1/s)"
        : "past the rows' support, inside the authorised domain: the chord of the end segment (log-log)";
    return st;
}

void FlowCurve::announceExtension(scalar g, const std::string& asker) const
{
    struct Held { scalar lo = 0, hi = 0; unsigned long long generation = 0; bool told = false; };
    static std::map<std::string, Held> held;
    static std::mutex mx;
    std::lock_guard<std::mutex> lk(mx);
    Held& h = held[name + "|" + where];
    const unsigned long long gen = AdvisoryLog::instance().generation();
    if (h.generation != gen) { h = Held(); h.generation = gen; }
    bool grew = false;
    if (g < gamma.front() && gamma.front() - g > h.lo) { h.lo = gamma.front() - g; grew = true; }
    if (g > gamma.back()  && g - gamma.back() > h.hi)  { h.hi = g - gamma.back();  grew = true; }
    if (!grew) return;
    std::string msg = "the flow curve " + name + " (kind " + kind + ") was taken past its rows' support"
        " inside the case's authorised domain, the end segment's chord held; largest excursion";
    if (h.lo > 0.0) msg += " below by " + fmt("%.6g", h.lo) + " 1/s";
    if (h.hi > 0.0) msg += std::string(h.lo > 0.0 ? "," : "") + " above by " + fmt("%.6g", h.hi) + " 1/s";
    msg += "; reason: " + reason;
    AdvisoryLog::instance().restate("table", "warning", "flow curve " + name, msg);
    if (!h.told)
    {
        h.told = true;
        std::cout << "  [flow curve] " << name << ": taken past its rows' support (" << asker
                  << "; end chord, reason: " << reason << "); the largest excursion is restated at the end of the run\n";
    }
}

scalar FlowCurve::stressAt(scalar g, Status* st) const
{
    const Status s = admitRate(g, "flow curve");
    if (s.extended) announceExtension(g, "flow curve");
    if (st) *st = s;
    return stressUnchecked(g);
}

scalar FlowCurve::apparentViscosityAt(scalar g, Status* st) const
{
    return stressAt(g, st) / g;
}

scalar FlowCurve::index(scalar g) const
{
    const scalar gp = g * (1.0 + 1.0e-4), gm = g * (1.0 - 1.0e-4);
    return (std::log(stressUnchecked(gp)) - std::log(stressUnchecked(gm))) / (std::log(gp) - std::log(gm));
}

scalar FlowCurve::maxIndexAbove(scalar g) const
{
    const scalar hi = std::max(gammaHiAuth, g);
    scalar mx = index(g);
    const int N = 200;
    for (int i = 1; i <= N; ++i)
        mx = std::max(mx, index(g * std::pow(hi / g, static_cast<scalar>(i) / N)));
    return mx;
}

std::string FlowCurve::outsideBox(scalar Tstate, const std::map<std::string, scalar>& wstate) const
{
    if (Tstate < boxT.first || Tstate > boxT.second)
        return "T = " + fmt("%.6g K", Tstate) + " (box " + fmt("%.6g", boxT.first) + fmt("-%.6g K", boxT.second) + ")";
    for (const auto& kv : boxW)
    {
        const auto it = wstate.find(kv.first);
        const scalar v = it == wstate.end() ? 0.0 : it->second;
        if (v < kv.second.first || v > kv.second.second)
            return "w[" + kv.first + "] = " + fmt("%.6g", v) + " (box " + fmt("%.6g", kv.second.first)
                 + fmt("-%.6g", kv.second.second) + ")";
    }
    return "";
}

bool FlowCurve::atStatedPoint(scalar Tstate, const std::map<std::string, scalar>& wstate) const
{
    if (std::fabs(Tstate - T) > 1.0e-6 * T) return false;
    for (const auto& kv : w)
    {
        const auto it = wstate.find(kv.first);
        const scalar v = it == wstate.end() ? 0.0 : it->second;
        if (std::fabs(v - kv.second) > 1.0e-6) return false;
    }
    return true;
}

std::string FlowCurve::describe() const
{
    std::string s = "flow curve " + name + " (" + where + "): kind " + kind + " (" + basis + "), "
        + std::to_string(gamma.size()) + " rows, " + fmt("%.6g", gamma.front()) + " to " + fmt("%.6g", gamma.back())
        + " 1/s at " + fmt("%.6g K", T) + ", instrument " + instrument;
    if (!corrected.empty())
    {
        s += " (corrected:";
        for (const auto& c : corrected) s += " " + c;
        s += ")";
    }
    s += fit ? ", derived fit " + fit->words : ", rows interpolated " + interpolation;
    if (hasYield) s += "; yield stress " + fmt("%.6g Pa", yield) + " (" + yieldHow + ")";
    return s;
}

// ===========================================================================
//  The fit (R1): printed, never stored
// ===========================================================================
namespace {

Fit makeFit(const FlowCurve& c, const std::string& model, const std::string& here)
{
    Fit f;
    f.model = model;
    const std::size_t n = c.gamma.size();
    f.gammaLo = c.gamma.front();
    f.gammaHi = c.gamma.back();
    auto regress = [&](const std::vector<scalar>& X, const std::vector<scalar>& Y, scalar& slope, scalar& icpt)
    {
        scalar sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (std::size_t i = 0; i < X.size(); ++i) { sx += X[i]; sy += Y[i]; sxx += X[i] * X[i]; sxy += X[i] * Y[i]; }
        const scalar N = static_cast<scalar>(X.size());
        const scalar den = N * sxx - sx * sx;
        if (!(std::fabs(den) > 0.0)) throw std::runtime_error(here + ": the fit is degenerate (the rows have one shear rate).");
        slope = (N * sxy - sx * sy) / den;
        icpt  = (sy - slope * sx) / N;
    };
    if (model == "powerLaw")
    {
        if (c.hasYield)
            throw std::runtime_error(here + ": `fit { model powerLaw; }` beside a `yieldStress` datum -- a power law"
                " has no yield stress; name HerschelBulkley (tau = tau_0 + m gamma^n, eq. 1.18, p. 14).");
        std::vector<scalar> X, Y;
        for (std::size_t i = 0; i < n; ++i) { X.push_back(std::log(c.gamma[i])); Y.push_back(std::log(c.tau[i])); }
        scalar slope, icpt; regress(X, Y, slope, icpt);
        f.n = slope; f.m = std::exp(icpt);
        f.words = "powerLaw tau = m gamma^n, m = " + fmt("%.6g", f.m) + " Pa s^n, n = " + fmt("%.6g", f.n)
                + " (least squares of ln tau on ln gamma, eq. 1.12, p. 9)";
    }
    else if (model == "HerschelBulkley")
    {
        if (!c.hasYield)
            throw std::runtime_error(here + ": `fit { model HerschelBulkley; }` needs the yield stress as a DATUM of the record"
                " (`yieldStress { value ...; how \"...\"; }`, R8): the fitted yield stress is an operational parameter that"
                " differs by model for the same fluid (Chhabra & Richardson, Example 1.2, p. 23-25: 50.45, 42.58 and 32 Pa"
                " against 38.2 Pa from a vane), so Choupo never reads it off a fit.");
        f.tau0 = c.yield;
        std::vector<scalar> X, Y;
        for (std::size_t i = 0; i < n; ++i) { X.push_back(std::log(c.gamma[i])); Y.push_back(std::log(c.tau[i] - c.yield)); }
        scalar slope, icpt; regress(X, Y, slope, icpt);
        f.n = slope; f.m = std::exp(icpt);
        f.words = "HerschelBulkley tau = tau_0 + m gamma^n, tau_0 = " + fmt("%.6g", f.tau0) + " Pa (the datum), m = "
                + fmt("%.6g", f.m) + " Pa s^n, n = " + fmt("%.6g", f.n) + " (least squares of ln(tau - tau_0) on ln gamma, eq. 1.18, p. 14)";
    }
    else if (model == "Bingham")
    {
        if (!c.hasYield)
            throw std::runtime_error(here + ": `fit { model Bingham; }` needs the yield stress as a DATUM of the record"
                " (`yieldStress { value ...; how \"...\"; }`, R8).");
        f.tau0 = c.yield;
        scalar sgs = 0, sgg = 0;
        for (std::size_t i = 0; i < n; ++i) { sgs += c.gamma[i] * (c.tau[i] - c.yield); sgg += c.gamma[i] * c.gamma[i]; }
        f.muB = sgs / sgg;
        f.words = "Bingham tau = tau_0 + mu_B gamma, tau_0 = " + fmt("%.6g", f.tau0) + " Pa (the datum), mu_B = "
                + fmt("%.6g", f.muB) + " Pa s (least squares through the yield stress, eq. 1.17, p. 13)";
    }
    else
        throw std::runtime_error(here + ": `fit { model " + model + "; }` -- the derived fits are powerLaw, Bingham and"
            " HerschelBulkley (the book's eqs. 1.12, 1.17, 1.18).");
    f.residual.resize(n);
    scalar ss = 0.0;
    for (std::size_t i = 0; i < n; ++i)
    {
        scalar tf;
        if (model == "powerLaw") tf = f.m * std::pow(c.gamma[i], f.n);
        else if (model == "Bingham") tf = f.tau0 + f.muB * c.gamma[i];
        else tf = f.tau0 + f.m * std::pow(c.gamma[i], f.n);
        f.residual[i] = tf / c.tau[i] - 1.0;
        ss += f.residual[i] * f.residual[i];
    }
    f.rms = std::sqrt(ss / static_cast<scalar>(n));
    return f;
}

} // namespace

// ===========================================================================
//  Reading the declaration and the record
// ===========================================================================
std::vector<FlowCurve> readFlowCurves(const DictPtr& block, const std::vector<Component>& comps)
{
    std::vector<FlowCurve> out;
    if (!block || !block->found("measured")) return out;
    const DictPtr ms = block->subDict("measured");
    for (const auto& name : ms->keys())
    {
        const std::string here = "transport liquid.rheology.measured." + name;
        const DictPtr dec = ms->subDict(name);
        onlyKeys(dec, { "use", "reason", "interpolation", "fit" }, here);
        FlowCurve c;
        c.name = name;
        c.use  = dec->lookupWordOrDefault("use", "");
        if (c.use != "method")
            throw std::runtime_error(here + ": `use " + c.use + "` -- write `use method;` (the curve IS the liquid's rheology"
                " inside its box).  A flow curve has no `use check` in this slice.");
        c.reason = dec->lookupWordOrDefault("reason", "");
        c.interpolation = dec->lookupWordOrDefault("interpolation", "");
        if (c.interpolation != "logLog" && c.interpolation != "linear")
            throw std::runtime_error(here + ": `interpolation " + c.interpolation + "` -- declare how tau(gamma) is read between"
                " the rows: `logLog` (a power law between neighbouring rows) or `linear`.");
        if (dec->found("fit"))
        {
            const DictPtr fd = dec->subDict("fit");
            onlyKeys(fd, { "model" }, here + ".fit");
            c.fitModel = fd->lookupWordOrDefault("model", "");
        }

        //  ---- the file ----
        experiments::refuseWrittenExperimentsDir(dec, here);
        const std::string dir = dec->lookupWordOrDefault(experiments::experimentsDirKey(), "");
        const experiments::File f = experiments::readFile(name, "flowCurve", here, dir);
        c.where = f.where;
        c.citation = f.citation;
        onlyKeys(f.dict, { "provenance", "system", "property", "solvent", "conditions", "yieldStress",
                           "columns", "data", "authorised", "uncertainty" }, f.where);
        const DictPtr pv = f.dict->subDict("provenance");
        c.basis = pv->lookupWordOrDefault("basis", "");
        c.kind  = pv->lookupWordOrDefault("kind", "");
        if (c.basis.empty())
            throw std::runtime_error(f.where + ": `provenance` states no `basis \"...\";` -- what the rows are, in the source's words.");
        if (c.kind != "measured" && c.kind != "adopted" && c.kind != "estimated")
            throw std::runtime_error(f.where + ": `provenance { kind " + c.kind + "; }` -- R3: measured, adopted or estimated (required).");

        //  ---- the set ----
        if (f.system.empty())
            throw std::runtime_error(f.where + ": no `system ( ... );` -- the constituent set the curve describes.");
        std::set<std::size_t> set;
        for (const auto& s : f.system)
        {
            bool ok = false;
            for (std::size_t i = 0; i < comps.size(); ++i)
                if (comps[i].name() == s) { set.insert(i); ok = true; }
            if (!ok) throw std::runtime_error(f.where + " system: '" + s + "' is not one of the system's components.");
        }
        c.set.assign(set.begin(), set.end());
        c.solvent = f.dict->lookupWordOrDefault("solvent", "");
        if (c.set.size() > 1 && std::find(f.system.begin(), f.system.end(), c.solvent) == f.system.end())
            throw std::runtime_error(f.where + ": `solvent` must name one of `system` -- the constituent whose mass fraction is the rest.");

        //  ---- the conditions (R4, R8) ----
        if (!f.dict->found("conditions"))
            throw std::runtime_error(f.where + ": no `conditions { instrument ...; corrected ( ... ); T ...; }` -- R8: readings that do not"
                " declare their instrument and the corrections applied are refused as a flow curve.");
        const DictPtr cd = f.dict->subDict("conditions");
        onlyKeys(cd, { "instrument", "corrected", "T", "w", "viscoelastic", "timeDependent", "model" }, f.where + " conditions");
        c.instrument = cd->lookupWordOrDefault("instrument", "");
        {
            const CorrectionRule* rule = nullptr;
            for (const auto& r : correctionRules()) if (r.instrument == c.instrument) rule = &r;
            if (!rule)
            {
                std::string have;
                for (const auto& r : correctionRules()) have += (have.empty() ? "" : ", ") + r.instrument;
                throw std::runtime_error(f.where + ": `conditions { instrument " + c.instrument + "; }` -- R8 needs the instrument, one of "
                    + have + " (`model` for rows generated from a stated constitutive equation).");
            }
            if (cd->found("corrected")) c.corrected = cd->lookupWordList("corrected");
            for (const auto& req : rule->required)
                if (std::find(c.corrected.begin(), c.corrected.end(), req.first) == c.corrected.end())
                    throw std::runtime_error(f.where + ": R8 -- these readings are refused as a flow curve: the correction `" + req.first
                        + "` is not declared in `conditions { corrected ( ... ); }` for a " + c.instrument + ": " + req.second
                        + ".  A raw rheometer reading is a flow curve only after the instrument's corrections (Chhabra & Richardson, p. 36).");
            if (c.instrument == "model")
            {
                if (c.kind == "measured")
                    throw std::runtime_error(f.where + ": `instrument model` (rows generated from a constitutive equation) cannot be"
                        " `kind measured` -- say `kind adopted` (the parameters a source printed) or `estimated`.");
                if (!cd->found("model"))
                    throw std::runtime_error(f.where + ": `instrument model` needs `conditions { model \"<the equation and its source>\"; }`.");
            }
        }
        if (!cd->found("T"))
            throw std::runtime_error(f.where + ": `conditions { T <value>; }` -- the temperature the sample was held at (R4: part of the identity).");
        c.T = cd->lookupScalar("T", Dims::temperature);
        if (cd->found("w"))
        {
            const DictPtr wd = cd->subDict("w");
            scalar sum = 0.0;
            for (const auto& k : wd->keys())
            {
                if (std::find(f.system.begin(), f.system.end(), k) == f.system.end() || k == c.solvent)
                    throw std::runtime_error(f.where + " conditions.w: `" + k + "` is not a non-solvent member of `system`.");
                c.w[k] = wd->lookupScalar(k);
                sum += c.w[k];
            }
            c.w[c.solvent] = 1.0 - sum;
        }
        else if (c.set.size() > 1)
            throw std::runtime_error(f.where + ": a curve of " + std::to_string(c.set.size()) + " constituents states the mass fractions it was"
                " taken at: `conditions { w { <component> <mass fraction>; } }` (the solvent is the rest).");
        c.viscoelastic  = yes(cd->lookupWordOrDefault("viscoelastic", "no"));
        c.timeDependent = yes(cd->lookupWordOrDefault("timeDependent", "no"));

        //  ---- the yield stress: a datum of its own (R8) ----
        if (f.dict->found("yieldStress"))
        {
            const DictPtr yd = f.dict->subDict("yieldStress");
            onlyKeys(yd, { "value", "how" }, f.where + " yieldStress");
            c.hasYield = true;
            c.yield = yd->lookupScalar("value", Dims::pressure);
            c.yieldHow = yd->lookupWordOrDefault("how", "");
            if (!(c.yield > 0.0))
                throw std::runtime_error(f.where + ": `yieldStress { value }` must be positive.");
            if (c.yieldHow.empty())
                throw std::runtime_error(f.where + ": `yieldStress { how \"...\"; }` -- R8: how the yield stress was measured (a vane, a controlled-stress"
                    " creep ramp; Chhabra & Richardson, p. 23 and 91-96).");
        }

        //  ---- the rows ----
        std::vector<experiments::ColumnRole> roles;
        std::vector<std::string> names;
        if (f.dict->found("columns") && f.dict->hasDictList("columns"))
            for (const auto& col : f.dict->lookupDictList("columns"))
            {
                const std::string cn = col->lookupWordOrDefault("name", "");
                if (std::find(names.begin(), names.end(), cn) != names.end())
                    throw std::runtime_error(f.where + ": column `" + cn + "` twice.");
                names.push_back(cn);
                if (cn == "gamma")    roles.push_back(role(Dims::inverseTime, "a shear rate"));
                else if (cn == "tau") roles.push_back(role(Dims::pressure, "a shear stress"));
                else if (cn == "mu")  roles.push_back(role(Dims::viscosity, "an apparent viscosity"));
                else throw std::runtime_error(f.where + ": column `" + cn + "` -- a flow curve reads two of `gamma` (shear rate),"
                    " `tau` (shear stress), `mu` (apparent viscosity); T and the composition are `conditions`.");
            }
        const experiments::Table t = experiments::readTable(f.dict, roles, f.where);
        if (names.size() != 2)
            throw std::runtime_error(f.where + ": a flow curve has TWO columns, two of `gamma`, `tau`, `mu`.");
        auto col = [&](const std::string& cn) -> const std::vector<scalar>*
        {
            const auto it = std::find(names.begin(), names.end(), cn);
            return it == names.end() ? nullptr : &t.si[static_cast<std::size_t>(it - names.begin())];
        };
        const std::size_t rows = t.rows();
        if (rows < 2)
            throw std::runtime_error(f.where + ": a flow curve has at least two rows (it is a CURVE).");
        std::vector<std::pair<scalar, scalar>> pts;
        const auto *G = col("gamma"), *Tau = col("tau"), *Mu = col("mu");
        for (std::size_t r = 0; r < rows; ++r)
        {
            scalar g, s;
            if (G && Tau) { g = (*G)[r]; s = (*Tau)[r]; }
            else if (G && Mu) { g = (*G)[r]; s = (*Mu)[r] * g; }
            else if (Tau && Mu) { s = (*Tau)[r]; g = s / (*Mu)[r]; }
            else throw std::runtime_error(f.where + ": the two columns are the same quantity.");
            if (!(g > 0.0) || !(s > 0.0))
                throw std::runtime_error(f.where + ": row " + std::to_string(r + 1) + ": shear rate and shear stress must be positive.");
            pts.push_back({ g, s });
        }
        std::sort(pts.begin(), pts.end());
        for (std::size_t r = 0; r < rows; ++r)
        {
            c.gamma.push_back(pts[r].first);
            c.tau.push_back(pts[r].second);
            if (r > 0 && !(c.gamma[r] > c.gamma[r - 1]))
                throw std::runtime_error(f.where + ": two rows at one shear rate -- one row per rate.");
            if (r > 0 && !(c.tau[r] > c.tau[r - 1]))
                throw std::runtime_error(f.where + ": the shear stress does not rise with the shear rate between " + fmt("%.6g", c.gamma[r - 1])
                    + " and " + fmt("%.6g", c.gamma[r]) + " 1/s.  A falling branch is wall slip, thixotropy or an instrument artefact, not a"
                    " time-independent flow curve (Chhabra & Richardson, p. 64, 68, 80): R8 refuses it as one.");
        }
        if (c.hasYield && !(c.tau.front() > c.yield))
            throw std::runtime_error(f.where + ": the lowest row's stress " + fmt("%.6g", c.tau.front()) + " Pa is not above the yield stress "
                + fmt("%.6g", c.yield) + " Pa the record declares -- rows below the yield are not flow.");

        //  ---- the authorised domain (R2) ----
        c.gammaLoAuth = c.gamma.front();
        c.gammaHiAuth = c.gamma.back();
        c.boxT = { c.T * (1.0 - 1.0e-6), c.T * (1.0 + 1.0e-6) };
        for (const auto& kv : c.w) if (kv.first != c.solvent) c.boxW[kv.first] = { kv.second - 1.0e-6, kv.second + 1.0e-6 };
        if (f.dict->found("authorised"))
        {
            const DictPtr ad = f.dict->subDict("authorised");
            if (ad->lookupWordOrDefault("reason", "").empty())
                throw std::runtime_error(f.where + ": `authorised { ... }` without a `reason \"...\";` -- a domain wider than the rows is a hypothesis (R2).");
            for (const auto& k : ad->keys())
            {
                if (k == "reason") continue;
                const auto pr = pairOf(ad, k, f.where + " authorised");
                if (k == "gamma")
                {
                    if (pr.first > c.gamma.front() || pr.second < c.gamma.back())
                        throw std::runtime_error(f.where + ": `authorised { gamma }` is narrower than the rows' support.");
                    c.gammaLoAuth = pr.first; c.gammaHiAuth = pr.second;
                }
                else if (k == "T")
                    c.boxT = pr;
                else if (k.size() > 3 && k.compare(0, 2, "w[") == 0 && k.back() == ']')
                {
                    const std::string comp = k.substr(2, k.size() - 3);
                    if (!c.boxW.count(comp))
                        throw std::runtime_error(f.where + ": `authorised { " + k + " }` names a constituent that is not a non-solvent member of `system`.");
                    c.boxW[comp] = pr;
                }
                else
                    throw std::runtime_error(f.where + ": `authorised { " + k + " }` -- the axes are gamma, T and w[<component>].");
            }
        }
        if (c.boxT.first > c.T || c.boxT.second < c.T)
            throw std::runtime_error(f.where + ": the authorised T box does not hold the temperature the curve was taken at.");

        //  ---- the derived fit (R1) ----
        if (!c.fitModel.empty())
        {
            c.fit = makeFit(c, c.fitModel, here);
            if (AdvisoryLog::instance().addAnnouncedOnce("flowCurveFit:" + c.name, "approximation", "info", "flow curve " + c.name,
                    "derived fit of the rows, nothing stored: " + c.fit->words + "; range fitted " + fmt("%.6g", c.fit->gammaLo) + " to "
                    + fmt("%.6g", c.fit->gammaHi) + " 1/s; rms of the row residuals " + fmt("%.3g %%", 100.0 * c.fit->rms)))
            {
                std::cout << "  [flow curve] " << c.name << ": derived fit (R1, nothing stored): " << c.fit->words << "\n"
                          << "      range fitted " << fmt("%.6g", c.fit->gammaLo) << " to " << fmt("%.6g", c.fit->gammaHi)
                          << " 1/s; residual (tau_fit/tau_row - 1) per row:";
                for (std::size_t i = 0; i < c.fit->residual.size(); ++i)
                    std::cout << (i ? ", " : " ") << fmt("%+.2e", c.fit->residual[i]);
                std::cout << "; rms " << fmt("%.3g %%", 100.0 * c.fit->rms) << "\n";
            }
        }
        out.push_back(std::move(c));
    }
    return out;
}

} // namespace rheology
} // namespace Choupo
