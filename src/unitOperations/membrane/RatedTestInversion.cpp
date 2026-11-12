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

#include "RatedTestInversion.H"
#include "core/PropertySourceLog.H"
#include "SpiralWoundModule.H"

#include "core/Advisory.H"
#include "core/Dimensions.H"
#include "core/Identifiers.H"
#include "thermo/ThermoPackage.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"
#include "thermo/membrane/MembraneModule.H"

#include <cmath>
#include <cstdio>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <streambuf>
#include <string>
#include <variant>
#include <vector>

namespace Choupo {
namespace membrane {

namespace {

std::string fmt(scalar v, const char* f = "%.6g")
{
    char b[64];
    std::snprintf(b, sizeof(b), f, static_cast<double>(v));
    return b;
}

//  The probe is the module itself, and the module talks: its banners, its
//  estimates, its result table.  None of that describes the case's run, so
//  the probe's console output is discarded for its duration (restored on
//  any exit, an exception included).
class NullBuffer : public std::streambuf
{
protected:
    int overflow(int c) override { return c; }
};

class SilenceCout
{
public:
    SilenceCout() : old_(std::cout.rdbuf(&null_)) {}
    ~SilenceCout() { std::cout.rdbuf(old_); }
    SilenceCout(const SilenceCout&) = delete;
    SilenceCout& operator=(const SilenceCout&) = delete;
private:
    NullBuffer      null_;
    std::streambuf* old_;
};

//  The standard atmosphere a GAUGE pressure is measured from (Pa).  A sheet
//  that says "psig" states its pressure above the local atmosphere; the
//  probe needs it absolute, and the standard atmosphere is the convention
//  (announced where it is used, never silently).
constexpr scalar standardAtmosphere = 101325.0;

RatedTestConditions conditionsOf(const DictPtr& unitDict,
                                 const MembraneModule& record,
                                 const RatedTest& rt,
                                 const std::string& solute)
{
    RatedTestConditions c;
    c.module           = record.name();
    c.test             = rt.label();
    c.solute           = solute;
    c.feedMassFraction = rt.feedMassFraction;
    c.P                = rt.pressureBasis == "feedGauge" ? rt.P + standardAtmosphere : rt.P;
    c.P_permeate       = unitDict->subDict("operation")
                             ->lookupScalar("P_permeate", Dims::pressure);
    c.T                = rt.T;
    c.recoverySheet    = rt.recovery;
    c.permeateSheet    = rt.permeateFlow;
    c.rejectionSheet   = rt.rejection;
    c.feedFlow         = rt.permeateFlow / rt.recovery;
    return c;
}

std::string joinIds(const std::vector<const RatedTest*>& ts)
{
    std::string out;
    for (const auto* t : ts)
        out += (out.empty() ? "" : ", ") + (t->id.empty() ? std::string("(no id)") : t->id);
    return out;
}

} // namespace

// ---------------------------------------------------------------------------
const RatedTest& selectRatedTest(const MembraneModule& record,
                                 const std::string& solute,
                                 const std::string& testId,
                                 const std::string& who)
{
    const auto& tests = record.ratedTests();
    if (tests.empty())
        throw std::runtime_error(who + ": module '" + record.name() + "' ("
            + record.sourcePath() + ") carries no `ratedTest {}` (nor a"
              " `ratedTests ( ... )` list) -- there is no observed rejection to"
              " invert.  Declare R_int as a number with its `source`.");
    std::vector<const RatedTest*> all, ofSolute;
    for (const auto& t : tests)
    {
        all.push_back(&t);
        if (t.solute == solute) ofSolute.push_back(&t);
    }
    if (!testId.empty())
    {
        for (const auto& t : tests)
            if (t.id == testId)
            {
                if (t.solute != solute)
                    throw std::runtime_error(who + ": test '" + testId + "' of"
                        " module '" + record.name() + "' is a " + t.solute
                        + " test, not a " + solute + " one -- a data sheet's"
                          " test says nothing about another solute.");
                return t;
            }
        throw std::runtime_error(who + ": module '" + record.name() + "' has no"
            " rated test with id '" + testId + "'.  Its tests: " + joinIds(all) + ".");
    }
    if (ofSolute.empty())
    {
        std::string rated;
        for (const auto* t : all)
            if (rated.find(t->solute) == std::string::npos)
                rated += (rated.empty() ? "" : ", ") + t->solute;
        throw std::runtime_error(who + ": module '" + record.name() + "' was"
            " rated on " + rated + ", not on " + solute + " -- a data sheet's"
            " test says nothing about another solute.  Only the rated solute ("
            + rated + ") can be derived `fromRatedTest`; declare " + solute
            + "'s R_int as a number with its `source`.");
    }
    if (ofSolute.size() > 1)
        throw std::runtime_error(who + ": module '" + record.name() + "' carries "
            + std::to_string(ofSolute.size()) + " " + solute + " tests (ids "
            + joinIds(ofSolute) + ") -- different operating points, or a typical"
              " and a bound, never averaged.  Name the one you mean:"
              " `rejection { " + solute + " ( fromRatedTest <id> ); }`.");
    return *ofSolute.front();
}

// ---------------------------------------------------------------------------
ModuleAtConditions runModuleAt(const DictPtr& unitDict,
                               const ThermoPackage& thermo,
                               const MembraneModule& record,
                               const std::string& solute,
                               scalar R_int,
                               scalar feedMassFraction,
                               scalar feedFlow,
                               scalar T,
                               scalar P,
                               const std::string& unitLabel,
                               const std::string& probeName,
                               scalar A_w_override)
{
    //  THE PROBE DICT: a deep copy of the unit's own (an alias would rewrite
    //  the case's), one element in one vessel, no scaling audit, the rated
    //  solute's R a number.
    DictPtr probe = unitDict->deepCopy();
    probe->erase("scaling");
    DictPtr op = probe->subDict("operation");
    //  The probe runs the component as ONE solute with the effective R_int it
    //  is handed; a split declared on the unit is resolved by the CALLER (the
    //  per-test inversions below), never nested in the probe.
    op->erase("aqueousSplit");
    op->insert("elements", 1.0, Dims::dimensionless);
    op->insert("vessels",  1.0, Dims::dimensionless);
    DictPtr rej = op->subDict("transportParameters")->subDict("rejection");
    rej->erase(solute);
    rej->insert(solute, R_int, Dims::dimensionless);
    //  Every OTHER solute still declared `fromRatedTest` is absent from the
    //  probe's feed (water + the rated solute only), so its R enters nothing
    //  -- but left as the word it would make the probe run an inversion of
    //  its own, nested (C189 slice 3: a functional class rates two salts).
    //  A placeholder number stands in; it multiplies a zero concentration.
    const std::vector<std::string> others = rej->keys();   // a copy: erased below
    for (const auto& k : others)
        if (k != solute
         && (std::holds_alternative<std::string>(rej->entryValue(k))
          || std::holds_alternative<std::vector<std::string>>(rej->entryValue(k))))
        {
            rej->erase(k);
            rej->insert(k, 1.0, Dims::dimensionless);
        }

    //  THE FEED: water + the solute at feedMassFraction, its volume
    //  closed on the module's own solution density (rho_feed, the key
    //  toBulk reads), so the probe's volumetric feed is exactly `feedFlow`.
    const std::size_t iW = thermo.aqueousSolventIndex();
    const std::size_t iS = thermo.indexOf(solute);
    const scalar rho  = op->lookupScalarOrDefault("rho_feed", liquidSource::rhoFeedDefault.value);
    if (op->found("rho_feed"))
        PropertySourceLog::instance().useHere("liquidDensity", liquidSource::declaredByCase, "declared");
    else
        PropertySourceLog::instance().useHere("liquidDensity", liquidSource::rhoFeedDefault);
    const scalar w    = feedMassFraction;
    const scalar nS   = w / thermo.comp(iS).MW();             // kmol/kg
    const scalar nW   = (1.0 - w) / thermo.comp(iW).MW();
    const scalar F    = feedFlow * rho * (nS + nW);           // kmol/s
    DictPtr feed = probe->subDict("feed");
    feed->insert("F", F);
    feed->insert("T", T);
    feed->insert("P", P);
    auto comp = std::make_shared<Dictionary>("composition");
    for (std::size_t i = 0; i < thermo.n(); ++i)
        comp->insert(thermo.comp(i).name(),
                     i == iS ? nS / (nS + nW) : (i == iW ? nW / (nS + nW) : 0.0));
    probe->insert("composition", comp);

    SpiralWoundModule m;
    m.markRatedTestProbe();
    if (!std::isnan(A_w_override)) m.setWaterPermeabilityOverride(A_w_override);
    {
        //  A trial: what the probe raises is about the rated test, not about
        //  the case's answer (core/Advisory.H, the partition).
        AdvisoryFrame frame("rated-test inversion of '" + unitLabel + "'", true);
        SilenceCout quiet;
        try { m.solve(probe, thermo, 0); }
        catch (const std::exception& e)
        {
            throw std::runtime_error("spiralWoundModule '" + unitLabel + "':"
                " the " + probeName + " of module '" + record.name() + "' ("
                + fmt(w * 1e6, "%.0f") + " ppm " + solute + ", "
                + fmt(P * 1e-5, "%.3g") + " bar, " + fmt(T, "%.2f")
                + " K) at R_int = " + fmt(R_int, "%.10g") + " failed: "
                + e.what());
        }
    }
    const auto k = m.kpis();
    auto get = [&](const std::string& key) {
        const auto it = k.find(key);
        if (it == k.end())
            throw std::runtime_error("module probe: the module published"
                " no `" + key + "`.");
        return it->second;
    };
    ModuleAtConditions r;
    r.R_int        = R_int;
    r.R_obs        = get("R_obs_" + solute);
    r.cmOverCb     = 1.0 + get("Gamma_" + solute + "_avg");
    r.recovery     = get("water_recovery");
    r.flux         = get("J_w_avg");
    r.permeateFlow = r.flux * record.activeArea_m2();
    r.dP           = get("dP_feed");
    return r;
}

// ---------------------------------------------------------------------------
RatedTestPoint rateAtRatedTest(const DictPtr& unitDict,
                               const ThermoPackage& thermo,
                               const MembraneModule& record,
                               const RatedTest& test,
                               const std::string& solute,
                               scalar R_int,
                               const std::string& unitLabel,
                               scalar A_w_override)
{
    const RatedTestConditions c = conditionsOf(unitDict, record, test, solute);
    const ModuleAtConditions r = runModuleAt(unitDict, thermo, record, solute,
        R_int, c.feedMassFraction, c.feedFlow, c.T, c.P, unitLabel,
        "rated-test probe", A_w_override);
    RatedTestPoint p;
    p.R_int        = r.R_int;
    p.R_obs        = r.R_obs;
    p.cmOverCb     = r.cmOverCb;
    p.recovery     = r.recovery;
    p.permeateFlow = r.permeateFlow;
    return p;
}

// ---------------------------------------------------------------------------
RatedTestInversion invertRatedRejection(const DictPtr& unitDict,
                                        const ThermoPackage& thermo,
                                        const MembraneModule* record,
                                        const std::string& solute,
                                        const std::string& testId,
                                        const std::string& unitLabel,
                                        scalar A_w_override,
                                        bool announce,
                                        const std::string& pHNote)
{
    const std::string who = "spiralWoundModule '" + unitLabel + "': `rejection { "
                          + solute + " fromRatedTest; }`";
    if (record == nullptr)
        throw std::runtime_error(who + " derives R_int from a module record's"
            " rated test, and this unit names no module (`module <name>;`).  A"
            " typed geometry carries no data sheet to invert -- declare R_int"
            " as a number with its `source`, or name the element's record.");
    const RatedTest& rt = selectRatedTest(*record, solute, testId, who);
    const std::string what = rt.label() + " of module '" + record->name() + "'";
    std::string caveatsOut;

    //  THE TEST'S OWN MEANING.  What the probe needs and the record does not
    //  carry refuses; what the record leaves unstated and the probe can read
    //  one way only is ANNOUNCED with that reading.  Nothing is defaulted
    //  in silence.
    if (rt.isRange())
        throw std::runtime_error(who + ": " + what + " states its rejection as"
            " a RANGE (" + fmt(rt.rejectionLow * 100.0, "%.4g") + "-"
            + fmt(rt.rejectionHigh * 100.0, "%.4g") + " %), and the inversion"
              " needs ONE observed value.  Choosing an end, or the middle, is a"
              " decision about the element -- declare R_int as a number with"
              " its `source` saying which.");
    if (rt.pressureBasis == "netDriving")
        throw std::runtime_error(who + ": " + what + " states a NET DRIVING"
            " pressure, and the probe needs the feed pressure; recovering it"
            " needs the osmotic pressure difference the sheet assumed, which"
            " it does not state.  Declare R_int as a number with its `source`.");
    if (rt.permeateFlowBasis == "separateTest")
        throw std::runtime_error(who + ": " + what + " states that its"
            " permeate flow was NOT measured in the rejection test, so"
            " permeateFlow / recovery is not the feed the rejection was"
            " measured at -- the crossflow, and so the film, would be"
            " guessed.  Declare R_int as a number with its `source`.");
    if (!rt.soluteBasis.empty() && rt.soluteBasis != rt.solute)
        throw std::runtime_error(who + ": " + what + " states its " + rt.solute
            + " AS " + rt.soluteBasis + ", and the probe feeds the component "
            + rt.solute + "; converting the stated concentration between the two"
              " formulae is not done here.  Declare R_int as a number with its"
              " `source`.");
    {
        std::string cv;
        auto add = [&](const std::string& x) { cv += (cv.empty() ? "" : "; ") + x; };
        if (record->ratedTests().size() > 1)
            add(rt.label() + " chosen, of " + std::to_string(record->ratedTests().size())
                + " on the record");
        if (rt.rejectionValueType.empty())
            add("the record does not state whether the rejection "
                + fmt(rt.rejection * 100.0, "%.4g") + " % is typical, a minimum or"
                " a maximum -- inverted as stated");
        else if (rt.rejectionValueType == "minimum")
            add("the rejection is a MINIMUM, so the derived R_int is a lower bound");
        else if (rt.rejectionValueType == "maximum")
            add("the rejection is a MAXIMUM, so the derived R_int is an upper bound");
        else if (rt.rejectionValueType == "approximate")
            add("the rejection is stated as APPROXIMATE");
        if (rt.pressureBasis.empty())
            add("the record does not state what its pressure "
                + fmt(rt.P * 1e-5, "%.4g") + " bar means -- read as the absolute"
                " feed pressure");
        else if (rt.pressureBasis == "feedGauge")
            add("the pressure is GAUGE: feed " + fmt(rt.P * 1e-5, "%.4g") + " bar(g) + "
                + fmt(standardAtmosphere * 1e-5, "%.6g") + " bar (standard atmosphere) = "
                + fmt((rt.P + standardAtmosphere) * 1e-5, "%.6g") + " bar absolute");
        if (rt.permeateFlowBasis.empty())
            add("the record does not state whether the permeate flow was measured"
                " in the same test -- the feed permeateFlow / recovery assumes it was");
        if (rt.hasPH)
            add("pH " + fmt(rt.pH, "%.3g") + (pHNote.empty()
                ? std::string(" is stated and the probe models no pH")
                : " is stated; " + pHNote));
        if (!cv.empty() && announce)
        {
            const std::string line = what + " for " + solute + ": " + cv;
            std::cout << "  [ratedTest] " << line << "\n";
            std::cerr << "[ratedTest] spiralWoundModule '" << unitLabel << "': "
                      << line << "\n";
            AdvisoryLog::instance().add("provenance", "info",
                "spiralWoundModule '" + unitLabel + "'", line);
        }
        caveatsOut = cv;
    }
    bool known = false;
    for (std::size_t i = 0; i < thermo.n(); ++i)
        if (thermo.comp(i).name() == solute) { known = true; break; }
    if (!known)
        throw std::runtime_error(who + ": " + solute + " is not a component of"
            " this case -- the rated test is run on the case's own package.");

    //  A SALT TEST IS NOT AN ION REJECTION.  The sheet rejects a NEUTRAL salt;
    //  a case that declares its solutes ion by ion would need the split of
    //  that one number between the ions, which no measurement here supplies
    //  (the zero-current field does: SDEM; or the charged pore: DSPM-DE).
    //  The charge is read through the component's OWN declared bridge (its
    //  `aqueousMapping`: ONE species, nu 1) and that species' record, never
    //  through the name -- and not through the package's aqueous chemistry,
    //  which an ideal package (this law's usual one) does not configure, so
    //  an ion declared there would read as neutral and pass in silence.
    {
        std::string ions;
        for (std::size_t i = 0; i < thermo.n(); ++i)
        {
            const Component& ci = thermo.comp(i);
            if (!ci.isNonvolatile()) continue;
            const auto& map = ci.aqueousMapping();
            if (map.size() != 1 || map.front().nu != 1.0) continue;
            int z = 0;
            try { z = electrolyte::ionCharge(map.front().species); }
            catch (const std::exception&) { z = 0; }
            if (z != 0) ions += " " + thermo.comp(i).name() + " (z = " + std::to_string(z) + ")";
        }
        if (!ions.empty())
            throw std::runtime_error(who + ": this case declares its solutes ION"
                " BY ION --" + ions + ".  A data sheet's rejection is a SALT's,"
                " one number for a neutral salt, and says nothing about how it"
                " splits between the ions.  Declare the feed by salts (components"
                " with `dissociatesTo`), or use `transport SDEM;` / `DSPM-DE;`,"
                " which derive the ions' split themselves.");
    }

    RatedTestInversion inv;
    inv.conditions = conditionsOf(unitDict, *record, rt, solute);
    inv.conditions.caveats = caveatsOut;
    const scalar target = rt.rejection;

    auto f = [&](scalar R, RatedTestPoint& p) {
        p = rateAtRatedTest(unitDict, thermo, *record, rt, solute, R, unitLabel,
                            A_w_override);
        return p.R_obs - target;
    };
    RatedTestPoint pa, pb;
    scalar a = 0.0, b = 1.0;
    scalar fa = f(a, pa), fb = f(b, pb);
    inv.R_obs_at0 = pa.R_obs;
    inv.R_obs_at1 = pb.R_obs;
    if (!(fa < 0.0 && fb > 0.0))
        throw std::runtime_error(who + ": the rated rejection of module '"
            + record->name() + "' is not reachable under this module's film"
              " model -- its observed " + fmt(target * 100.0, "%.4g") + " % must"
              " lie STRICTLY between the predicted observed rejection at R_int"
              " = 0 (" + fmt(pa.R_obs * 100.0, "%.6g") + " %) and at R_int = 1 ("
            + fmt(pb.R_obs * 100.0, "%.6g") + " %), at " + fmt(rt.feedMassFraction * 1e6, "%.0f")
            + " ppm " + solute + ", " + fmt(inv.conditions.P * 1e-5, "%.4g") + " bar, "
            + fmt(rt.T, "%.2f") + " K, feed " + fmt(inv.conditions.feedFlow * 86400.0, "%.4g")
            + " m3/d.  There is no intrinsic rejection in (0, 1) that this"
              " module turns into the sheet's number; declare R_int as a number"
              " with its `source`.");

    //  Illinois regula falsi: the bracket is kept, the stale end's weight
    //  halved, so convergence is superlinear without leaving [0, 1].
    RatedTestPoint pc = pb;
    scalar c = b, fc = fb;
    int it = 0;
    for (; it < 100; ++it)
    {
        c  = b - fb * (b - a) / (fb - fa);
        fc = f(c, pc);
        if (std::abs(fc) <= ratedInversionTolerance) break;
        if ((fc > 0.0) == (fb > 0.0)) fa *= 0.5;
        else { a = b; fa = fb; }
        b = c; fb = fc;
    }
    if (std::abs(fc) > ratedInversionTolerance)
        throw std::runtime_error(who + ": the bracketed solve did not reach"
            " |R_obs - " + fmt(target) + "| <= " + fmt(ratedInversionTolerance)
            + " in " + std::to_string(it) + " iterations (last R_int "
            + fmt(c, "%.12g") + ", residual " + fmt(fc, "%.3e") + ").");
    inv.R_int      = c;
    inv.atRoot     = pc;
    inv.residual   = fc;
    inv.iterations = it + 1;
    return inv;
}

// ---------------------------------------------------------------------------
//  THE SPLIT FORM (C198 Stage 1)
// ---------------------------------------------------------------------------
void solveSplitPassages(scalar a1, scalar Reff1, scalar a2, scalar Reff2,
                        scalar& R_acid, scalar& R_base, const std::string& who)
{
    //  p_t = (1 - a_t) pa + a_t pb ;  det = a2 - a1
    const scalar det = a2 - a1;
    if (!(std::abs(det) > 1.0e-3))
        throw std::runtime_error(who + ": the two rated tests give base"
            " fractions alpha = " + fmt(a1, "%.6g") + " and " + fmt(a2, "%.6g")
            + " -- the same pH to within the resolution of the problem.  Two"
              " equations that are one equation do not identify two"
              " permeances (the acid's and the base's); a second test needs a"
              " DIFFERENT pH.");
    const scalar p1 = 1.0 - Reff1, p2 = 1.0 - Reff2;
    const scalar pa = (p1 * a2 - a1 * p2) / det;
    const scalar pb = ((1.0 - a1) * p2 - (1.0 - a2) * p1) / det;
    if (!(pa >= 0.0) || !(pb >= 0.0))
        throw std::runtime_error(who + ": the two tests (effective passages "
            + fmt(p1, "%.6g") + " at alpha " + fmt(a1, "%.6g") + ", " + fmt(p2, "%.6g")
            + " at alpha " + fmt(a2, "%.6g") + ") imply a NEGATIVE passage ("
            + (pa < 0.0 ? "acid " + fmt(pa, "%.6g") : "base " + fmt(pb, "%.6g"))
            + ") -- no non-negative pair of permeances reproduces both.  The"
              " tests contradict the two-form model (or the pH of one of them)"
              " and nothing is clipped.");
    if (pa > 1.0 || pb > 1.0)
        throw std::runtime_error(who + ": the two tests imply a passage above"
            " 1 (acid " + fmt(pa, "%.6g") + ", base " + fmt(pb, "%.6g")
            + "), i.e. a NEGATIVE intrinsic rejection, which this law does not"
              " have.");
    R_acid = 1.0 - pa;
    R_base = 1.0 - pb;
}

namespace {

const RatedTest& splitTest(const MembraneModule* record, const std::string& component,
                           const std::string& id, const std::string& who)
{
    if (record == nullptr)
        throw std::runtime_error(who + " derives the split from rated tests of"
            " a module record, and this unit names no module.");
    const RatedTest& rt = selectRatedTest(*record, component, id, who);
    if (!rt.hasPH)
        throw std::runtime_error(who + ": " + rt.label() + " of module '"
            + record->name() + "' states no pH, and the base fraction of that"
              " test is set by it -- without the pH the test says nothing about"
              " the split.  Declare `pH <value>;` in the test (as the sheet"
              " states it).");
    return rt;
}

} // namespace

SplitRejections invertSplitFromTwoTests(const DictPtr& unitDict,
                                        const ThermoPackage& thermo,
                                        const MembraneModule* record,
                                        const std::string& component,
                                        const std::string& id1,
                                        const std::string& id2,
                                        const AlphaAtTest& alphaAt,
                                        const std::string& unitLabel,
                                        scalar A_w_override)
{
    const std::string who = "spiralWoundModule '" + unitLabel
        + "': `aqueousSplit { rejection { tests ( " + id1 + " " + id2 + " ) } }`";
    SplitRejections out;
    scalar a[2], Re[2];
    const std::string ids[2] = { id1, id2 };
    for (int t = 0; t < 2; ++t)
    {
        const RatedTest& rt = splitTest(record, component, ids[t], who);
        a[t] = alphaAt(rt);
        auto inv = invertRatedRejection(unitDict, thermo, record, component,
            ids[t], unitLabel, A_w_override, true,
            "the base fraction alpha = " + fmt(a[t], "%.5f") + " at that pH and"
            " the package's constant sets the split of the component into its"
            " two forms (aqueousSplit); R_int below is the COMPONENT's effective"
            " one at that pH");
        Re[t] = inv.R_int;
        out.alphas.push_back(a[t]);
        out.pHs.push_back(rt.pH);
        out.R_eff.push_back(inv.R_int);
        out.inversions.push_back(std::move(inv));
    }
    out.nTests = 2;
    solveSplitPassages(a[0], Re[0], a[1], Re[1], out.R_acid, out.R_base, who);
    return out;
}

SplitRejections invertSplitFromOneTest(const DictPtr& unitDict,
                                       const ThermoPackage& thermo,
                                       const MembraneModule* record,
                                       const std::string& component,
                                       const std::string& id,
                                       scalar R_base,
                                       const AlphaAtTest& alphaAt,
                                       const std::string& unitLabel,
                                       scalar A_w_override)
{
    const std::string who = "spiralWoundModule '" + unitLabel
        + "': `aqueousSplit { rejection { acid ( fromRatedTest " + id + " ); } }`";
    const RatedTest& rt = splitTest(record, component, id, who);
    SplitRejections out;
    const scalar a = alphaAt(rt);
    auto inv = invertRatedRejection(unitDict, thermo, record, component, id,
        unitLabel, A_w_override, true,
        "the base fraction alpha = " + fmt(a, "%.5f") + " at that pH and the"
        " package's constant sets the split of the component into its two forms"
        " (aqueousSplit); R_int below is the COMPONENT's effective one at that pH");
    const scalar p = 1.0 - inv.R_int, pb = 1.0 - R_base;
    if (!(a < 1.0 - 1.0e-9))
        throw std::runtime_error(who + ": at pH " + fmt(rt.pH) + " the base"
            " fraction is " + fmt(a, "%.9f") + " -- the test has no acid in it"
            " to determine the acid's permeance.");
    const scalar pa = (p - a * pb) / (1.0 - a);
    if (!(pa >= 0.0))
        throw std::runtime_error(who + ": with the base's rejection "
            + fmt(R_base, "%.6g") + " the test's effective passage "
            + fmt(p, "%.6g") + " at alpha " + fmt(a, "%.6g") + " leaves a"
            " NEGATIVE acid passage (" + fmt(pa, "%.6g") + "): the base alone"
            " would already pass more than the sheet measured.  Nothing is"
            " clipped; declare a higher base rejection or revisit the test.");
    if (pa > 1.0)
        throw std::runtime_error(who + ": the acid passage comes out "
            + fmt(pa, "%.6g") + " > 1, a negative intrinsic rejection.");
    out.R_acid = 1.0 - pa;
    out.R_base = R_base;
    out.nTests = 1;
    out.alphas.push_back(a);
    out.pHs.push_back(rt.pH);
    out.R_eff.push_back(inv.R_int);
    out.inversions.push_back(std::move(inv));
    return out;
}

// ---------------------------------------------------------------------------
WaterPermeanceDerivation deriveWaterPermeance(const DictPtr& unitDict,
                                              const ThermoPackage& thermo,
                                              const MembraneModule& record,
                                              scalar A_w_record,
                                              const std::string& solute,
                                              const std::string& testId,
                                              const std::string& unitLabel)
{
    const std::string who = "spiralWoundModule '" + unitLabel
        + "': `waterPermeance fromRatedTest;`";
    const RatedTest& rt = selectRatedTest(record, solute, testId, who);
    if (!(rt.permeateFlow > 0.0))
        throw std::runtime_error(who + ": " + rt.label() + " of module '"
            + record.name() + "' states no permeate flow.");
    if (rt.permeateFlowBasis == "separateTest")
        throw std::runtime_error(who + ": " + rt.label() + " states that its"
            " permeate flow was NOT measured in the rejection test -- the"
            " permeate flow of another test is not this feed's.  Keep the"
            " membrane record's A_w.");
    const RatedTestConditions c = conditionsOf(unitDict, record, rt, solute);

    WaterPermeanceDerivation d;
    d.A_w_record = A_w_record;
    scalar A = A_w_record;
    RatedTestInversion inv;
    for (d.rounds = 1; d.rounds <= 60; ++d.rounds)
    {
        //  (1) R_int such that the observed rejection is the sheet's, at THIS A.
        inv = invertRatedRejection(unitDict, thermo, &record, solute, testId,
                                   unitLabel, A, d.rounds == 1);
        //  (2) A such that the permeate is the sheet's, at THIS R_int.  The
        //      permeate rises with A, so the sign of f brackets it; the
        //      bracket is walked by factors of two and bisected in log A.
        auto f = [&](scalar Aa) {
            return runModuleAt(unitDict, thermo, record, solute, inv.R_int,
                       c.feedMassFraction, c.feedFlow, c.T, c.P, unitLabel,
                       "water-permeance probe", Aa).permeateFlow
                   - c.permeateSheet;
        };
        scalar lo = A, hi = A;
        if (f(A) > 0.0)
        {
            int k = 0;
            while (f(lo) > 0.0)
            {
                lo *= 0.5;
                if (++k > 60) throw std::runtime_error(who + ": no water"
                    " permeance reproduces the sheet's permeate flow (the"
                    " module passes more than " + fmt(c.permeateSheet * 86400.0)
                    + " m3/d even at vanishing A_w).");
            }
        }
        else
        {
            int k = 0;
            while (f(hi) < 0.0)
            {
                hi *= 2.0;
                if (++k > 60) throw std::runtime_error(who + ": no water"
                    " permeance reproduces the sheet's permeate flow (the"
                    " module passes less than " + fmt(c.permeateSheet * 86400.0)
                    + " m3/d at any A_w tried).");
            }
        }
        for (int it = 0; it < 200 && hi / lo > 1.0 + 1.0e-14; ++it)
        {
            const scalar mid = std::sqrt(lo * hi);
            if (f(mid) < 0.0) lo = mid; else hi = mid;
        }
        const scalar Anew = std::sqrt(lo * hi);
        const bool stationary = std::abs(Anew - A) <= 1.0e-12 * A;
        A = Anew;
        if (stationary) break;
        if (d.rounds == 60)
            throw std::runtime_error(who + ": the alternation between the"
                " rejection and the water permeance did not settle in 60"
                " rounds.");
    }
    //  The answer, announced once at the settled A_w.
    d.A_w = A;
    d.inv = invertRatedRejection(unitDict, thermo, &record, solute, testId,
                                 unitLabel, A, false);
    d.permeateGap = (d.inv.atRoot.permeateFlow - c.permeateSheet) / c.permeateSheet;
    return d;
}

} // namespace membrane
} // namespace Choupo
