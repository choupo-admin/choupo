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
File
    src/samples/SampleBehaviour.cpp

Description
    The one service a unit asks for a sample's behaviour (see the header).
\*---------------------------------------------------------------------------*/

#include "samples/SampleBehaviour.H"

#include "core/Dimensions.H"
#include "core/Units.H"
#include "thermo/liquidProperty/ExperimentsFile.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <functional>
#include <iomanip>
#include <limits>
#include <sstream>
#include <stdexcept>

namespace Choupo {
namespace sampleBehaviour {

scalar Answer::value(const std::string& key) const
{
    const auto it = values.find(key);
    if (it == values.end())
        throw std::runtime_error("sample `" + sample + "`: the answer carries no `" + key + "`.");
    return it->second;
}

namespace {

std::string g(scalar v, int p = 5)
{
    std::ostringstream o;
    o << std::defaultfloat << std::setprecision(p) << v;
    return o.str();
}

bool sameP(scalar a, scalar b) { return std::fabs(a - b) <= 1e-9 * std::max(std::fabs(a), std::fabs(b)); }

//  A test's own line and what it gives (W&T Example 4.1).
struct TestFit
{
    scalar dp = 0, A = 0, s = 0, m = 0, mu = 0, rho = 0;
    scalar c = 0, slope = 0, intercept = 0, alpha = 0, R = 0, rms = 0;
    std::size_t from = 0, to = 0, nUsed = 0;
    std::string reason;
    std::vector<scalar> t, V;
    std::vector<scalar> resid;                     // measured t/V minus the line, s/m3
};

TestFit fitTest(const DictPtr& d, const std::string& where)
{
    TestFit f;
    f.dp  = d->lookupScalar("pressureDrop", Dims::pressure);
    f.A   = d->lookupScalar("area", Dims::area);
    f.s   = d->lookupScalar("solidsMassFraction", Dims::dimensionless);
    f.m   = d->lookupScalar("wetToDryRatio", Dims::dimensionless);
    f.mu  = d->lookupScalar("filtrateViscosity", Dimensions(1, -1, -1, 0, 0));
    f.rho = d->lookupScalar("filtrateDensity", Dims::density);
    if (!(f.dp > 0 && f.A > 0 && f.mu > 0 && f.rho > 0))
        throw std::runtime_error(where + ": pressureDrop, area, filtrateViscosity and filtrateDensity"
            " must be positive.");
    if (!(f.s > 0 && f.s < 1) || !(f.m >= 1.0) || !(1.0 - f.m * f.s > 0))
        throw std::runtime_error(where + ": solidsMassFraction must lie in (0,1), wetToDryRatio be at"
            " least 1, and 1 - m s positive (c = rho s / (1 - m s)).");
    f.c = f.rho * f.s / (1.0 - f.m * f.s);

    experiments::ColumnRole rt; rt.dims = Dims::time;   rt.what = "a time";
    experiments::ColumnRole rv; rv.dims = Dims::volume; rv.what = "a filtrate volume";
    const auto tab = experiments::readTable(d, { rt, rv }, where);
    if (tab.cols[0].name != "t" || tab.cols[1].name != "V")
        throw std::runtime_error(where + ": the columns are `t` then `V` (filtration time, filtrate"
            " volume), in that order.");
    for (std::size_t i = 0; i < tab.rows(); ++i)
        if (tab.si[1][i] > 0.0) { f.t.push_back(tab.si[0][i]); f.V.push_back(tab.si[1][i]); }
    if (f.t.size() < 3)
        throw std::runtime_error(where + ": a test needs at least 3 rows with V > 0 (a line t/V against"
            " V and a residual).");
    if (!d->found("linearRegion"))
        throw std::runtime_error(where + ": `linearRegion { fromRow n; toRow n; reason \"...\"; }` is"
            " required: the book fits the LINEAR region of t/V against V and says which points it"
            " disregards (Wakeman & Tarleton p. 122-123); the rows are counted among those with V > 0.");
    const auto lr = d->subDict("linearRegion");
    f.from = static_cast<std::size_t>(lr->lookupScalar("fromRow", Dims::dimensionless));
    f.to   = static_cast<std::size_t>(lr->lookupScalar("toRow", Dims::dimensionless));
    f.reason = lr->lookupWordOrDefault("reason", "");
    if (f.reason.empty())
        throw std::runtime_error(where + ": `linearRegion` states no `reason`.");
    if (f.from < 1 || f.to > f.t.size() || f.to < f.from + 1)
        throw std::runtime_error(where + ": linearRegion rows " + std::to_string(f.from) + ".."
            + std::to_string(f.to) + " lie outside the " + std::to_string(f.t.size())
            + " rows with V > 0 (or hold fewer than two).");
    f.nUsed = f.to - f.from + 1;
    //  least squares of y = t/V on x = V over the region
    scalar sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (std::size_t i = f.from - 1; i < f.to; ++i)
    {
        const scalar x = f.V[i], y = f.t[i] / f.V[i];
        sx += x; sy += y; sxx += x * x; sxy += x * y;
    }
    const scalar n = static_cast<scalar>(f.nUsed);
    const scalar den = n * sxx - sx * sx;
    f.slope     = (n * sxy - sx * sy) / den;
    f.intercept = (sy - f.slope * sx) / n;
    if (!(f.slope > 0.0))
        throw std::runtime_error(where + ": the line t/V against V has a non-positive slope ("
            + g(f.slope) + " s/m6): no cake resistance can be read from it.");
    f.alpha = 2.0 * f.A * f.A * f.dp * f.slope / (f.c * f.mu);
    f.R     = f.A * f.dp * f.intercept / f.mu;
    scalar ss = 0;
    for (std::size_t i = 0; i < f.t.size(); ++i)
    {
        const scalar r = f.t[i] / f.V[i] - (f.slope * f.V[i] + f.intercept);
        f.resid.push_back(r);
        if (i + 1 >= f.from && i + 1 <= f.to) ss += r * r;
    }
    f.rms = std::sqrt(ss / n);
    return f;
}

std::string printEntry(const DictPtr& d, const std::string& k)
{
    const auto& v = d->entryValue(k);
    if (std::holds_alternative<std::string>(v)) return std::get<std::string>(v);
    if (std::holds_alternative<scalar>(v))
    {
        const std::string w = d->unitWordOf(k);
        const scalar si = std::get<scalar>(v);
        return g(w.empty() ? si : units::fromSI(si, w)) + (w.empty() ? "" : " " + w);
    }
    return "(see the record)";
}

} // namespace

Answer filtrationAt(const std::string& sample, scalar dp, const std::string& who)
{
    Answer a;
    a.sample   = sample;
    a.property = "filtrationTest";
    const auto file = experiments::readFile(sample, "filtrationTest", who + " (`sample " + sample + ";`)");
    const std::string where = file.where;
    const DictPtr pv = file.dict->subDict("provenance");
    a.citation = file.citation;
    a.kind     = pv->lookupWordOrDefault("kind", "");
    a.basis    = pv->lookupWordOrDefault("basis", "");
    if (a.kind != "measured" && a.kind != "adopted" && a.kind != "estimated")
        throw std::runtime_error(where + ": `provenance { kind measured|adopted|estimated; }` is"
            " required (R3): a measurement, a value its authors chose to use, or a correlation's"
            " output the case freezes -- the run prints which.");
    if (a.basis.empty())
        throw std::runtime_error(where + ": `provenance` states no `basis` (what the source says the"
            " value is, in its words).");
    if (!file.dict->found("subject"))
        throw std::runtime_error(where + ": `subject { suspension \"...\"; medium \"...\"; }` is"
            " required: a cake resistance belongs to the suspension AND the medium it was tested on"
            " (Wakeman & Tarleton p. 112: \"it is usually poor practice to infer data from a"
            " different feed suspension\").");
    const DictPtr subj = file.dict->subDict("subject");
    const std::string suspension = subj->lookupWordOrDefault("suspension", "");
    const std::string medium     = subj->lookupWordOrDefault("medium", "");
    if (suspension.empty() || medium.empty())
        throw std::runtime_error(where + ": `subject` needs both `suspension` and `medium`.");

    a.account.push_back("sample " + sample + " [" + a.kind + "]  " + suspension + " on " + medium);
    a.account.push_back("source: " + a.citation);
    a.account.push_back("basis: " + a.basis);
    if (file.dict->found("conditions"))
    {
        const DictPtr cond = file.dict->subDict("conditions");
        std::string line = "conditions (held fixed by the test):";
        for (const auto& k : cond->keys()) line += "  " + k + " = " + printEntry(cond, k) + ";";
        a.account.push_back(line);
    }

    //  ---- the authorised domain, when the record declares one ------------
    bool hasAuth = false;
    scalar aLo = 0, aHi = 0;
    std::string aReason, aRule;
    if (file.dict->found("authorised"))
    {
        const DictPtr au = file.dict->subDict("authorised");
        const DictPtr pd = au->subDict("pressureDrop");
        aLo = pd->lookupScalar("min", Dims::pressure);
        aHi = pd->lookupScalar("max", Dims::pressure);
        aReason = au->lookupWordOrDefault("reason", "");
        aRule   = au->lookupWordOrDefault("rule", "");
        if (!(aLo > 0 && aHi >= aLo))
            throw std::runtime_error(where + ": `authorised { pressureDrop { min ..; max ..; } }` needs"
                " 0 < min <= max.");
        if (aReason.empty())
            throw std::runtime_error(where + ": `authorised` states no `reason` (R2: a domain wider than"
                " the rows is a declaration, and says why).");
        hasAuth = true;
    }

    const bool hasTests  = file.dict->found("tests");
    const bool hasStated = file.dict->found("stated");
    if (hasTests == hasStated)
        throw std::runtime_error(where + ": a filtration record carries `tests ( ... )` (raw t-V rows) OR"
            " `stated { ... }` (values its source prints), never both and never neither.");
    if (a.kind == "measured" && !hasTests)
        throw std::runtime_error(where + ": `kind measured` is a record of raw rows: `tests ( ... )`."
            "  A value copied from a book is `kind adopted`.");
    if (a.kind != "measured" && hasTests)
        throw std::runtime_error(where + ": raw rows are a measurement: `kind measured`.");

    auto outside = [&](scalar lo, scalar hi, const std::string& what)
    {
        throw std::runtime_error(who + ": dp = " + g(dp) + " Pa lies outside the " + what + " [" + g(lo)
            + ", " + g(hi) + "] Pa of sample `" + sample + "` (" + where + ").  A sample's behaviour is"
            " not extrapolated: measure it at this pressure, or widen `authorised` with a reason.");
    };

    if (hasStated)
    {
        //  ---- STATED: the values the source prints; no rows, no support ----
        if (!hasAuth)
            throw std::runtime_error(where + ": a stated record has no rows, so no support: `authorised {"
                " pressureDrop { min ..; max ..; } reason \"...\"; }` is required (R2).");
        const DictPtr st = file.dict->subDict("stated");
        const bool hasA  = st->found("specificResistance");
        const bool hasA0 = st->found("alpha0"), hasS = st->found("compressibility");
        if (hasA && (hasA0 || hasS))
            throw std::runtime_error(where + ": `specificResistance` beside `alpha0`/`compressibility` --"
                " one cake law, not two.");
        if (hasA0 != hasS)
            throw std::runtime_error(where + ": a compressible cake states BOTH `alpha0` and"
                " `compressibility`.");
        if (!hasA && !hasA0)
            throw std::runtime_error(where + ": `stated` carries neither `specificResistance` nor"
                " `alpha0` + `compressibility`.");
        if (!(dp >= aLo * (1 - 1e-9) && dp <= aHi * (1 + 1e-9))) outside(aLo, aHi, "authorised domain");
        scalar alpha;
        if (hasA)
        {
            alpha = st->lookupScalar("specificResistance", Dimensions(-1, 1, 0, 0, 0));
            a.method = "stated constant specific resistance (a single value stood over the"
                       " authorised domain: a constant-property approximation)";
            if (!sameP(aLo, aHi))
                a.announcements.push_back("sample " + sample + ": a single value of alpha stands over"
                    " the authorised domain " + g(aLo) + " to " + g(aHi) + " Pa (" + aReason + ").");
        }
        else
        {
            //  alpha0 carries m/kg/Pa^s: read in SI.
            const scalar a0 = st->lookupScalar("alpha0");
            const scalar sc = st->lookupScalar("compressibility", Dims::dimensionless);
            alpha = a0 * std::pow(dp, sc);
            a.values["alpha0"] = a0;
            a.values["compressibility"] = sc;
            a.method = "stated power law alpha = alpha0 dp^s (alpha0 " + g(a0) + " m/kg/Pa^s, s "
                       + g(sc) + ")";
        }
        scalar Rm = st->lookupScalar("mediumResistance", Dimensions(0, -1, 0, 0, 0));
        scalar m  = st->lookupScalar("wetToDryRatio", Dims::dimensionless);
        a.values["specificResistance"] = alpha;
        a.values["mediumResistance"]   = Rm;
        a.values["wetToDryRatio"]      = m;
        a.supportStatus = "noRows";
        a.account.push_back("method: " + a.method);
        a.account.push_back("support: none (no rows); authorised pressureDrop " + g(aLo) + " to "
                            + g(aHi) + " Pa -- " + aReason);
        a.account.push_back("at dp = " + g(dp) + " Pa: alpha " + g(alpha) + " m/kg, R_m " + g(Rm)
                            + " 1/m, m " + g(m));
        return a;
    }

    //  ---- MEASURED: the raw rows, a line per test ------------------------
    std::vector<TestFit> fits;
    {
        const auto ts = file.dict->lookupDictList("tests");
        for (std::size_t i = 0; i < ts.size(); ++i)
            fits.push_back(fitTest(ts[i], where + " tests[" + std::to_string(i) + "]"));
    }
    if (fits.empty())
        throw std::runtime_error(where + ": `tests` is empty.");
    std::sort(fits.begin(), fits.end(), [](const TestFit& x, const TestFit& y) { return x.dp < y.dp; });
    for (std::size_t i = 0; i + 1 < fits.size(); ++i)
        if (sameP(fits[i].dp, fits[i + 1].dp))
            throw std::runtime_error(where + ": two tests at the same pressure drop (" + g(fits[i].dp)
                + " Pa): one test per pressure -- a repeat is a second record.");
    const scalar sLo = fits.front().dp, sHi = fits.back().dp;
    if (!hasAuth) { aLo = sLo; aHi = sHi; }
    if (aLo > sLo * (1 + 1e-9) || aHi < sHi * (1 - 1e-9))
        throw std::runtime_error(where + ": the authorised domain [" + g(aLo) + ", " + g(aHi)
            + "] Pa is narrower than the support [" + g(sLo) + ", " + g(sHi) + "] Pa the rows cover.");
    const bool wider = aLo < sLo * (1 - 1e-9) || aHi > sHi * (1 + 1e-9);
    if (wider && aRule != "nearest")
        throw std::runtime_error(where + ": an authorised domain wider than the support needs `rule"
            " nearest;` (the nearest test's values are stood over the excess and announced); no other"
            " rule is built.");

    a.account.push_back("method: the line t/V = (K/2) V + B through the linear region of each test"
        " (Wakeman & Tarleton Ex 4.1): alpha = 2 A^2 dp slope / (c mu), R = A dp intercept / mu, c = rho"
        " s / (1 - m s)");
    for (const auto& f : fits)
    {
        std::ostringstream o;
        o << "  test " << g(f.dp) << " Pa: rows " << f.from << ".." << f.to << " of " << f.t.size()
          << " (" << f.reason << "); t/V = " << g(f.slope) << " V + " << g(f.intercept) << ";  c = "
          << g(f.c) << " kg/m3;  alpha " << g(f.alpha) << " m/kg;  R " << g(f.R)
          << " 1/m;  rms of the line " << g(f.rms) << " s/m3";
        a.account.push_back(o.str());
        std::ostringstream r;
        r << "    residuals t/V (s/m3), rows with V > 0:";
        for (scalar x : f.resid) r << " " << g(x, 3);
        a.account.push_back(r.str());
    }
    //  the derived view: alpha = a dp^n through all the tests (printed, not used)
    if (fits.size() >= 2)
    {
        scalar sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (const auto& f : fits)
        {
            const scalar x = std::log(f.dp), y = std::log(f.alpha);
            sx += x; sy += y; sxx += x * x; sxy += x * y;
        }
        const scalar n = static_cast<scalar>(fits.size());
        const scalar den = n * sxx - sx * sx;
        const scalar ex  = (n * sxy - sx * sy) / den;
        const scalar a1  = std::exp((sy - ex * sx) / n);
        std::ostringstream v;
        v << "derived view (not used by the answer): alpha_av = " << g(a1) << " dp^" << g(ex)
          << " [m/kg, dp in Pa], residuals in ln alpha:";
        for (const auto& f : fits) v << " " << g(std::log(f.alpha) - std::log(a1 * std::pow(f.dp, ex)), 3);
        a.account.push_back(v.str());
    }
    a.account.push_back("support: pressureDrop " + g(sLo) + " to " + g(sHi) + " Pa (" + std::to_string(fits.size())
        + " test" + (fits.size() == 1 ? "" : "s") + ");  authorised " + g(aLo) + " to " + g(aHi) + " Pa"
        + (wider ? " -- " + aReason : ""));

    if (!(dp >= aLo * (1 - 1e-9) && dp <= aHi * (1 + 1e-9))) outside(aLo, aHi, "authorised domain");

    scalar alpha, Rm, m;
    auto taken = [&](const TestFit& f) { alpha = f.alpha; Rm = f.R; m = f.m; };
    if (dp < sLo * (1 - 1e-9) || dp > sHi * (1 + 1e-9))
    {
        const TestFit& f = dp < sLo ? fits.front() : fits.back();
        taken(f);
        a.supportStatus = "extended";
        a.method = "nearest test (" + g(f.dp) + " Pa) stood over the authorised excess";
        const scalar exc = std::fabs(dp - f.dp) / f.dp;
        a.announcements.push_back("sample " + sample + ": dp = " + g(dp) + " Pa is outside the tested"
            " pressures (" + g(sLo) + " to " + g(sHi) + " Pa); the values of the nearest test stand over"
            " it, a constant-property approximation (excursion " + g(100 * exc, 3) + " % of that"
            " test's pressure; " + aReason + ").");
    }
    else
    {
        std::size_t hit = fits.size();
        for (std::size_t i = 0; i < fits.size(); ++i) if (sameP(fits[i].dp, dp)) hit = i;
        if (hit < fits.size())
        {
            taken(fits[hit]);
            a.supportStatus = "inSupport";
            a.method = "the test's own line at " + g(fits[hit].dp) + " Pa";
        }
        else
        {
            std::size_t k = 0;
            while (k + 1 < fits.size() && fits[k + 1].dp < dp) ++k;
            const TestFit& lo = fits[k]; const TestFit& hi = fits[k + 1];
            const scalar w  = (dp - lo.dp) / (hi.dp - lo.dp);
            const scalar wl = std::log(dp / lo.dp) / std::log(hi.dp / lo.dp);
            alpha = std::exp((1 - wl) * std::log(lo.alpha) + wl * std::log(hi.alpha));
            Rm = (1 - w) * lo.R + w * hi.R;
            m  = (1 - w) * lo.m + w * hi.m;
            a.supportStatus = "inSupport";
            a.method = "between the tests at " + g(lo.dp) + " and " + g(hi.dp) + " Pa: alpha by the power"
                       " law through the two (log-log), R and m linear in dp";
        }
    }
    a.values["specificResistance"] = alpha;
    a.values["mediumResistance"]   = Rm;
    a.values["wetToDryRatio"]      = m;
    a.account.push_back("at dp = " + g(dp) + " Pa (" + a.method + "; " + a.supportStatus + "): alpha "
        + g(alpha) + " m/kg, R_m " + g(Rm) + " 1/m, m " + g(m));
    return a;
}

void refuseTypedSampleNumbers(const DictPtr& operDict, const std::string& who, const std::string& unitKind)
{
    static const char* words[] = { "specificCakeResistance", "alpha0", "compressibility",
                                   "mediumResistance", "wetToDryCakeRatio" };
    const std::string line = "`sample <name>;` in `operation`, with the number in the case's"
        " constant/experiments/<name>.dat (property filtrationTest; provenance { citation; kind"
        " measured|adopted|estimated; basis }; subject; tests ( ... ) or stated { ... }; authorised {"
        " ... })";
    std::function<void(const DictPtr&, const std::string&)> walk =
        [&](const DictPtr& d, const std::string& where)
    {
        for (const char* w : words)
            if (d->found(w))
                throw std::runtime_error(who + "`" + w + "` typed in `" + where + "` -- a " + unitKind
                    + " does not carry a sample's behaviour: a cake resistance belongs to the whole"
                    " sample state (suspension and medium), so it has ONE home, the sample record, and"
                    " the unit asks for it at its pressure (docs/design/measured-facts-materials-and-"
                    "flow-curves.md R6).  Write " + line + ", and remove the key here.");
        for (const auto& [path, child] : d->childDictsUnnoted(where))
            walk(child, path);
    };
    walk(operDict, "operation");
}

} // namespace sampleBehaviour
} // namespace Choupo
