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
RatedTestPoint rateAtRatedTest(const DictPtr& unitDict,
                               const ThermoPackage& thermo,
                               const MembraneModule& record,
                               const RatedTest& test,
                               const std::string& solute,
                               scalar R_int,
                               const std::string& unitLabel)
{
    const RatedTestConditions c = conditionsOf(unitDict, record, test, solute);

    //  THE PROBE DICT: a deep copy of the unit's own (an alias would rewrite
    //  the case's), one element in one vessel, no scaling audit, the rated
    //  solute's R a number.
    DictPtr probe = unitDict->deepCopy();
    probe->erase("scaling");
    DictPtr op = probe->subDict("operation");
    op->insert("elements", 1.0, Dims::dimensionless);
    op->insert("vessels",  1.0, Dims::dimensionless);
    DictPtr rej = op->subDict("transportParameters")->subDict("rejection");
    rej->erase(solute);
    rej->insert(solute, R_int, Dims::dimensionless);

    //  THE RATED FEED: water + the solute at feedMassFraction, its volume
    //  closed on the module's own solution density (rho_feed, the key
    //  toBulk reads), so the probe's volumetric feed is exactly c.feedFlow.
    const std::size_t iW = thermo.aqueousSolventIndex();
    const std::size_t iS = thermo.indexOf(solute);
    const scalar rho  = op->lookupScalarOrDefault("rho_feed", 1000.0);
    const scalar w    = c.feedMassFraction;
    const scalar nS   = w / thermo.comp(iS).MW();             // kmol/kg
    const scalar nW   = (1.0 - w) / thermo.comp(iW).MW();
    const scalar F    = c.feedFlow * rho * (nS + nW);         // kmol/s
    DictPtr feed = probe->subDict("feed");
    feed->insert("F", F);
    feed->insert("T", c.T);
    feed->insert("P", c.P);
    auto comp = std::make_shared<Dictionary>("composition");
    for (std::size_t i = 0; i < thermo.n(); ++i)
        comp->insert(thermo.comp(i).name(),
                     i == iS ? nS / (nS + nW) : (i == iW ? nW / (nS + nW) : 0.0));
    probe->insert("composition", comp);

    SpiralWoundModule m;
    {
        //  A trial: what the probe raises is about the rated test, not about
        //  the case's answer (core/Advisory.H, the partition).
        AdvisoryFrame frame("rated-test inversion of '" + unitLabel + "'", true);
        SilenceCout quiet;
        try { m.solve(probe, thermo, 0); }
        catch (const std::exception& e)
        {
            throw std::runtime_error("spiralWoundModule '" + unitLabel + "':"
                " the rated-test probe of module '" + record.name() + "' ("
                + fmt(w * 1e6, "%.0f") + " ppm " + solute + ", "
                + fmt(c.P * 1e-5, "%.3g") + " bar, " + fmt(c.T, "%.2f")
                + " K) at R_int = " + fmt(R_int, "%.10g") + " failed: "
                + e.what());
        }
    }
    const auto k = m.kpis();
    auto get = [&](const std::string& key) {
        const auto it = k.find(key);
        if (it == k.end())
            throw std::runtime_error("rated-test probe: the module published"
                " no `" + key + "`.");
        return it->second;
    };
    RatedTestPoint p;
    p.R_int        = R_int;
    p.R_obs        = get("R_obs_" + solute);
    p.cmOverCb     = 1.0 + get("Gamma_" + solute + "_avg");
    p.recovery     = get("water_recovery");
    p.permeateFlow = get("J_w_avg") * record.activeArea_m2();
    return p;
}

// ---------------------------------------------------------------------------
RatedTestInversion invertRatedRejection(const DictPtr& unitDict,
                                        const ThermoPackage& thermo,
                                        const MembraneModule* record,
                                        const std::string& solute,
                                        const std::string& testId,
                                        const std::string& unitLabel)
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
            add("pH " + fmt(rt.pH, "%.3g") + " is stated and the probe models no pH");
        if (!cv.empty())
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
        p = rateAtRatedTest(unitDict, thermo, *record, rt, solute, R, unitLabel);
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

} // namespace membrane
} // namespace Choupo
