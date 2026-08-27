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

#include "PhaseEnvelope.H"
#include "core/Advisory.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/saturation/BubblePoint.H"
#include "unitOperations/saturation/DewPoint.H"

#include <algorithm>
#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace Choupo {

namespace {

struct Pt { scalar P = 0, T = 0; };

std::string fmt(scalar v, int prec = 3)
{
    std::ostringstream os;
    os << std::fixed << std::setprecision(prec) << v;
    return os.str();
}

//  A traced branch, plus WHY it stopped.  The reason is a first-class field
//  and not a log line, because "the curve turns back here" and "the solver
//  needed a better guess" are different findings and the reader must be able
//  to tell them apart from the output alone.
struct Branch
{
    std::vector<Pt> pts;
    scalar          stoppedAt = 0.0;    // Pa, the first pressure that failed
    bool            ranOut    = false;  // reached the requested top instead
    bool            rootJump  = false;  // it CONVERGED -- to another root
};

} // namespace

int PhaseEnvelope::run(const DictPtr& dict,
                       const ThermoPackage& thermo,
                       int verbosity)
{
    const std::size_t n = thermo.n();

    // ---- the feed, which is the whole point: an envelope belongs to ONE z --
    auto zdict = dict->subDict("composition");
    sVector z(n, 0.0);
    scalar zsum = 0.0;
    for (const auto& k : zdict->keys())
    {
        z[thermo.indexOf(k)] = zdict->lookupScalar(k);
        zsum += z[thermo.indexOf(k)];
    }
    if (zsum <= 0.0)
        throw std::runtime_error("phaseEnvelope: the `composition {}` block is"
            " empty or sums to zero -- an envelope is a curve for ONE feed and"
            " there is no default feed to fall back on.");
    if (std::fabs(zsum - 1.0) > 1.0e-9)
    {
        //  NORMALISED AND SAID SO.  Silently rescaling a feed changes which
        //  curve is drawn, and the reader compares it against a published
        //  envelope for the composition they typed.
        std::cout << "  [envelope] the feed sums to " << fmt(zsum, 6)
                  << ", normalised to 1.\n";
        for (auto& v : z) v /= zsum;
    }
    if (n < 2)
        throw std::runtime_error("phaseEnvelope: a P-T envelope needs at least"
            " two components.  A pure compound has no envelope -- its"
            " liquid-vapour coexistence is a single LINE, which is what the"
            " `purePhaseDiagram` op draws.");

    auto pd = dict->subDict("pressure");
    const scalar P0 = pd->lookupScalar("from", Dims::pressure);
    const scalar P1 = pd->lookupScalar("to",   Dims::pressure);
    const int    np = static_cast<int>(pd->lookupScalarOrDefault("n", 40.0));
    if (!(P1 > P0) || np < 2)
        throw std::runtime_error("phaseEnvelope: `pressure { from; to; n; }`"
            " needs to > from and n >= 2.");

    // ---- march each branch, and remember WHERE each one died --------------
    //
    //  THE MARCH IS IN PRESSURE, and that choice is what bounds the answer.
    //  T_bubble(P) is single-valued to the critical point, so the bubble
    //  branch traces cleanly.  The dew branch is NOT single-valued in P: above
    //  the cricondenbar no dew point exists, and below it there are two --
    //  the retrograde pair.  So the dew march is expected to stop, and where
    //  it stops is a RESULT, not a failure to tune away.
    //  A CONVERGED POINT IS NOT NECESSARILY A POINT ON THIS CURVE, and the
    //  first version of this op learned that the hard way.  Both saturation
    //  solvers bracket T in [200, 700] K and are warm-started from the
    //  previous step; with a wide bracket, Newton can converge to a DIFFERENT
    //  root and report success.  On a C3/C4/C5 feed the bubble branch rose
    //  243 -> 332 K to 16 bar and then came back at 268 K -- a bubble
    //  temperature FALLING as pressure rises, which is thermodynamically
    //  impossible -- and the cricondentherm detector duly read the resulting
    //  spike on the dew branch as a maximum and published 371.492 K.  A
    //  plausible number, confidently reported, from a root nobody asked for.
    //
    //  So each accepted point must be CONTINUOUS with the branch it joins:
    //
    //    * the BUBBLE curve is monotonically increasing in P up to the
    //      critical point -- that is physics, not a heuristic -- so a step
    //      that lowers T is rejected outright;
    //    * the DEW curve is NOT monotone (the cricondentherm is an interior
    //      maximum), so it gets a continuity test instead: a step far larger
    //      than the branch's own recent steps is a jump, not a curve.
    //
    //  A rejected step ENDS the branch and is recorded as a ROOT JUMP, which
    //  is a different finding from a turning point and is reported as one.
    auto typicalStep = [](const std::vector<Pt>& v) -> scalar
    {
        if (v.size() < 3) return 0.0;
        std::vector<scalar> d;
        for (std::size_t i = 1; i < v.size(); ++i)
            d.push_back(std::fabs(v[i].T - v[i-1].T));
        std::sort(d.begin(), d.end());
        return d[d.size() / 2];
    };

    Branch bub, dew;
    scalar Tguess_b = 0.0, Tguess_d = 0.0;
    for (int i = 0; i < np; ++i)
    {
        const scalar P = P0 + (P1 - P0) * i / (np - 1);

        if (bub.stoppedAt == 0.0)
        {
            auto r = BubblePoint::compute(thermo, z, P, Tguess_b);
            const bool ok = r.converged && r.T > 0.0;
            const bool falls = ok && !bub.pts.empty() && r.T < bub.pts.back().T;
            if (ok && !falls)
            { bub.pts.push_back({P, r.T}); Tguess_b = r.T; }
            else
            { bub.stoppedAt = P; bub.rootJump = falls; }
        }
        if (dew.stoppedAt == 0.0)
        {
            auto r = DewPoint::compute(thermo, z, P, Tguess_d);
            const bool ok = r.converged && r.T > 0.0;
            const scalar typ = typicalStep(dew.pts);
            const bool jump = ok && typ > 0.0 && !dew.pts.empty()
                           && std::fabs(r.T - dew.pts.back().T) > 8.0 * typ;
            if (ok && !jump)
            { dew.pts.push_back({P, r.T}); Tguess_d = r.T; }
            else
            { dew.stoppedAt = P; dew.rootJump = jump; }
        }
    }
    bub.ranOut = (bub.stoppedAt == 0.0);
    dew.ranOut = (dew.stoppedAt == 0.0);

    if (bub.pts.empty() && dew.pts.empty())
        throw std::runtime_error("phaseEnvelope: neither branch converged at"
            " any pressure in the requested range.  That is a statement about"
            " the RANGE, not about the mixture: check that `pressure { from;"
            " to; }` brackets the two-phase region for this feed.");

    // ---- the CSV, which is what a plot consumes ---------------------------
    if (dict->found("output"))
    {
        const std::string file = dict->subDict("output")->lookupWord("file");
        std::ofstream csv(file);
        if (!csv.is_open())
            throw std::runtime_error("phaseEnvelope: cannot open output file '"
                                     + file + "'");
        csv << "P_Pa,T_K,curve\n";
        for (const auto& p : bub.pts) csv << p.P << ',' << p.T << ",bubble\n";
        for (const auto& p : dew.pts) csv << p.P << ',' << p.T << ",dew\n";
    }

    // ---- the console table ------------------------------------------------
    //  THE METHOD'S BOUNDARY IS STATED ALWAYS, not only when a branch happens
    //  to stop at a turning point.  The first version put it inside the
    //  stopped-branch message, so neither witness printed it: one branch ran
    //  out of range, the others stopped on a root jump, and both paths return
    //  before it.  A limitation that only announces itself on one of three
    //  outcomes is a limitation the reader meets by luck.
    std::cout << "\n  P-T PHASE ENVELOPE at fixed feed, marched in PRESSURE\n"
                 "      This trace does NOT close the nose.  A"
                 " pressure-marched specification cannot pass the\n"
                 "      cricondenbar, where the dew curve ceases to be"
                 " single-valued in P, nor the critical\n"
                 "      point, where the two branches merge and the Jacobian"
                 " degenerates.  Closing it needs\n"
                 "      arc-length continuation with a switching"
                 " specification (Michelsen, Fluid Phase\n"
                 "      Equilib. 4 (1980) 1) -- a different algorithm, not a"
                 " tolerance, and not implemented.\n\n"
                 "      bubble: " << bub.pts.size() << " point(s)"
                 "      dew: " << dew.pts.size() << " point(s)\n\n"
              << "      " << std::left << std::setw(12) << "P [bar]"
              << std::right << std::setw(14) << "T_bubble [K]"
              << std::setw(14) << "T_dew [K]" << "\n";
    const std::size_t rows = std::max(bub.pts.size(), dew.pts.size());
    const std::size_t stride = rows > 14 ? rows / 12 : 1;
    for (std::size_t i = 0; i < rows; i += stride)
    {
        const scalar P = (i < bub.pts.size()) ? bub.pts[i].P
                       : (i < dew.pts.size()) ? dew.pts[i].P : 0.0;
        std::cout << "      " << std::left << std::setw(12) << fmt(P / 1.0e5, 3)
                  << std::right << std::setw(14)
                  << (i < bub.pts.size() ? fmt(bub.pts[i].T, 3) : "--")
                  << std::setw(14)
                  << (i < dew.pts.size() ? fmt(dew.pts[i].T, 3) : "--") << "\n";
    }

    diag_["bubble_points"] = static_cast<scalar>(bub.pts.size());
    diag_["dew_points"]    = static_cast<scalar>(dew.pts.size());

    // ---- WHERE IT STOPPED, AND WHY -- the part that is the deliverable ----
    //
    //  A branch that ends is the normal outcome of this method, not an
    //  incident.  What must never happen is the reader taking the last point
    //  for the cricondentherm: the true extremum is PAST where a
    //  pressure-marched trace can look, so the last point is a lower bound on
    //  it and nothing more.
    //  THE CRICONDENTHERM, WHEN THE TRACE ACTUALLY BRACKETS IT.  Marching in
    //  PRESSURE, the temperature maximum is NOT a turning point for the
    //  specification -- T_dew(P) stays single-valued through it -- so the
    //  trace walks straight over it and the maximum is visible in the data.
    //  (The first version of this op claimed the opposite in its own
    //  announcement, and the first run refuted it: the dew branch peaked at
    //  274.687 K and came back down.  What a P-march cannot pass is the
    //  CRICONDENBAR.)  Reported only when an INTERIOR point is higher than
    //  both neighbours -- an endpoint maximum means the range stops there,
    //  which is a statement about the range.
    auto cricondentherm = [&](const Branch& b, const char* what)
    {
        if (b.pts.size() < 3) return;
        std::size_t best = 0;
        for (std::size_t i = 1; i + 1 < b.pts.size(); ++i)
            if (b.pts[i].T > b.pts[best].T) best = i;
        if (best == 0 || best + 1 >= b.pts.size()) return;
        if (!(b.pts[best].T > b.pts[best-1].T && b.pts[best].T > b.pts[best+1].T))
            return;
        std::cout << "\n      CRICONDENTHERM on the " << what << " branch:"
                     " the highest temperature at which this feed can hold\n"
                     "      any " << (std::string(what) == "dew" ? "liquid" : "vapour")
                  << " is bracketed at " << fmt(b.pts[best].T, 3) << " K near "
                  << fmt(b.pts[best].P / 1.0e5, 3) << " bar -- a BRACKETED"
                     " maximum of the traced points,\n      not a refined"
                     " extremum: the true peak lies between "
                  << fmt(b.pts[best-1].P / 1.0e5, 3) << " and "
                  << fmt(b.pts[best+1].P / 1.0e5, 3) << " bar and this op does"
                     " not solve for it.\n";
        diag_[std::string(what) + "_cricondentherm_K"] = b.pts[best].T;
    };
    cricondentherm(dew, "dew");
    cricondentherm(bub, "bubble");

    auto report = [&](const char* what, const Branch& b, const char* turning)
    {
        //  A BRANCH THAT NEVER STARTED IS NOT A BRANCH THAT STOPPED, and the
        //  first version conflated them: it reported "stopped at 1.000 bar,
        //  last converged point 0.000 K at 0.000 bar", which is a sentence
        //  about nothing.  The distinction is not cosmetic -- an empty branch
        //  usually means the range or the solver's own temperature bracket
        //  excludes it, and that is a different remedy from a turning point.
        if (b.pts.empty())
        {
            std::ostringstream m;
            m << "the " << what << " branch produced NO converged point at any"
              << " pressure in the requested range.  This is not a turning"
              << " point: the branch never started.  The usual causes are a"
              << " pressure range that does not reach it, or a "
              << what << " temperature outside the saturation solver's own"
              << " bracket (200-700 K), which a light feed's bubble line sits"
              << " below.  Nothing is drawn for it and nothing is claimed"
              << " about it.";
            if (AdvisoryLog::instance().add("approximation", "warning",
                                            std::string("phaseEnvelope ") + what,
                                            m.str()))
                std::cout << "\n      " << m.str() << "\n";
            return;
        }
        if (b.ranOut)
        {
            std::cout << "\n      The " << what << " branch reached the top of"
                         " the requested range without stopping.  That means\n"
                         "      the range does not yet contain its turning"
                         " point -- not that the branch has none.\n";
            return;
        }
        const scalar lastT = b.pts.back().T;
        const scalar lastP = b.pts.back().P;
        std::ostringstream m;
        if (b.rootJump)
        {
            m << "the " << what << " branch stopped at "
              << fmt(b.stoppedAt / 1.0e5, 3) << " bar because the saturation"
              << " solve CONVERGED THERE TO A DIFFERENT ROOT -- the step was"
              << " discontinuous with the curve it would have joined ("
              << (std::string(what) == "bubble"
                    ? "a bubble temperature falling as pressure rises, which"
                      " is impossible"
                    : "a step many times the branch's own recent steps")
              << ").  Both saturation solvers bracket T in 200-700 K and are"
              << " warm-started, so a wide bracket lets Newton land elsewhere"
              << " and report success.  The point was DISCARDED rather than"
              << " drawn: a converged point is not necessarily a point on this"
              << " curve.  The last kept point is " << fmt(lastT, 3) << " K at "
              << fmt(lastP / 1.0e5, 3) << " bar, and it is where the trace"
              << " became untrustworthy -- not a feature of the mixture.";
            if (AdvisoryLog::instance().add("approximation", "warning",
                                            std::string("phaseEnvelope ") + what,
                                            m.str()))
                std::cout << "\n      " << m.str() << "\n";
            return;
        }
        m << "the " << what << " branch stopped at "
          << fmt(b.stoppedAt / 1.0e5, 3) << " bar; the last converged point is "
          << fmt(lastT, 3) << " K at " << fmt(lastP / 1.0e5, 3) << " bar.  A"
          << " pressure-marched trace cannot pass " << turning << ", where the"
          << " curve ceases to be single-valued in P, nor the critical point,"
          << " where the two branches merge and the Jacobian degenerates."
          << "  The last point is therefore a STOPPING point and not an"
          << " extremum of anything: it is where this specification runs out,"
          << " which the physics does not mark.  Closing the nose needs"
          << " arc-length continuation with a switching specification"
          << " (Michelsen 1980), which is not implemented -- a different"
          << " algorithm, not a tolerance.";
        if (AdvisoryLog::instance().add("approximation", "warning",
                                        std::string("phaseEnvelope ") + what,
                                        m.str()))
            std::cout << "\n      " << m.str() << "\n";
    };
    report("bubble", bub, "the cricondenbar");
    report("dew", dew, "the cricondenbar");

    if (!bub.ranOut) diag_["bubble_stopped_bar"] = bub.stoppedAt / 1.0e5;
    if (!dew.ranOut) diag_["dew_stopped_bar"]    = dew.stoppedAt / 1.0e5;

    (void)verbosity;
    return 0;
}

} // namespace Choupo
