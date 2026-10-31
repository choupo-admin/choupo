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

RatedTestConditions conditionsOf(const DictPtr& unitDict,
                                 const MembraneModule& record,
                                 const std::string& solute)
{
    const RatedTest& rt = record.ratedTest();
    RatedTestConditions c;
    c.module           = record.name();
    c.solute           = solute;
    c.feedMassFraction = rt.feedMassFraction;
    c.P                = rt.P;
    c.P_permeate       = unitDict->subDict("operation")
                             ->lookupScalar("P_permeate", Dims::pressure);
    c.T                = rt.T;
    c.recoverySheet    = rt.recovery;
    c.permeateSheet    = rt.permeateFlow;
    c.rejectionSheet   = rt.rejection;
    c.feedFlow         = rt.permeateFlow / rt.recovery;
    return c;
}

} // namespace

// ---------------------------------------------------------------------------
RatedTestPoint rateAtRatedTest(const DictPtr& unitDict,
                               const ThermoPackage& thermo,
                               const MembraneModule& record,
                               const std::string& solute,
                               scalar R_int,
                               const std::string& unitLabel)
{
    const RatedTestConditions c = conditionsOf(unitDict, record, solute);

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
                                        const std::string& unitLabel)
{
    const std::string who = "spiralWoundModule '" + unitLabel + "': `rejection { "
                          + solute + " fromRatedTest; }`";
    if (record == nullptr)
        throw std::runtime_error(who + " derives R_int from a module record's"
            " rated test, and this unit names no module (`module <name>;`).  A"
            " typed geometry carries no data sheet to invert -- declare R_int"
            " as a number with its `source`, or name the element's record.");
    const RatedTest& rt = record->ratedTest();
    if (!rt.declared)
        throw std::runtime_error(who + ": module '" + record->name() + "' ("
            + record->sourcePath() + ") carries no `ratedTest {}` -- there is"
              " no observed rejection to invert.  Declare R_int as a number with"
              " its `source`.");
    if (rt.solute != solute)
        throw std::runtime_error(who + ": module '" + record->name() + "' was"
            " rated on " + rt.solute + ", not on " + solute + " -- a data sheet's"
            " test says nothing about another solute.  Only `" + rt.solute
            + " fromRatedTest;` can be derived; declare " + solute + "'s R_int as"
              " a number with its `source`.");
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
    inv.conditions = conditionsOf(unitDict, *record, solute);
    const scalar target = rt.rejection;

    auto f = [&](scalar R, RatedTestPoint& p) {
        p = rateAtRatedTest(unitDict, thermo, *record, solute, R, unitLabel);
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
            + " ppm " + solute + ", " + fmt(rt.P * 1e-5, "%.4g") + " bar, "
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
