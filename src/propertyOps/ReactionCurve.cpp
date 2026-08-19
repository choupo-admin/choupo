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

#include "ReactionCurve.H"

#include "core/Advisory.H"
#include "core/Dimensions.H"
#include "solver/NelderMead.H"

#include <algorithm>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <limits>
#include <sstream>
#include <stdexcept>

namespace fs = std::filesystem;

namespace Choupo {

namespace {

//  Round-trip-exact formatting, same convention as the other bench ops: a
//  published number a gate re-reads must be the number the engine used.
std::string fmtG(scalar v)
{
    std::ostringstream os;
    os << std::setprecision(15) << v;
    return os.str();
}

std::string sci(scalar v, int digits = 4)
{
    std::ostringstream os;
    os << std::scientific << std::setprecision(digits) << v;
    return os.str();
}

// ---------------------------------------------------------------------------
//  The trajectory, as choupoCtrl writes it: a header row of column names, the
//  first of which is `t`, then one row per written snapshot.
// ---------------------------------------------------------------------------
struct Trajectory
{
    std::vector<std::string>          columns;
    std::vector<std::vector<scalar>>  values;   // [column][row]
};

std::vector<std::string> splitCsv(const std::string& line)
{
    std::vector<std::string> out;
    std::string cell;
    std::istringstream is(line);
    while (std::getline(is, cell, ','))
    {
        //  Trim: the writer emits no spaces, but a hand-edited file might.
        const auto b = cell.find_first_not_of(" \t\r\n");
        const auto e = cell.find_last_not_of(" \t\r\n");
        out.push_back(b == std::string::npos ? std::string()
                                             : cell.substr(b, e - b + 1));
    }
    return out;
}

Trajectory readTrajectory(const std::string& path, const std::string& locus)
{
    if (!fs::exists(path))
        throw std::runtime_error(locus + ": the trajectory file '" + path
            + "' does not exist.  This operation ANALYSES a step response; it"
              " does not run one -- the experiment is choupoCtrl's and the"
              " identification is this bench's, and keeping them apart is what"
              " stops a second time loop being written beside the first."
              "  Run the dynamic experiment in this case directory first"
              " (`runCase <case>` or `choupoCtrl <case>`), then run"
              " choupoProps on the same directory.");

    std::ifstream f(path);
    if (!f)
        throw std::runtime_error(locus + ": cannot open the trajectory file '"
            + path + "'.");

    Trajectory tr;
    std::string line;
    if (!std::getline(f, line))
        throw std::runtime_error(locus + ": the trajectory file '" + path
            + "' is empty -- it carries no header row.");
    tr.columns = splitCsv(line);
    if (tr.columns.empty() || tr.columns.front() != "t")
        throw std::runtime_error(locus + ": the trajectory file '" + path
            + "' does not begin with a `t` column.  This reader expects the"
              " layout choupoCtrl writes: `t` first, then one column per unit"
              " state and per controller SP/PV/MV.");
    tr.values.resize(tr.columns.size());

    std::size_t row = 0;
    while (std::getline(f, line))
    {
        if (line.find_first_not_of(" \t\r\n") == std::string::npos) continue;
        const auto cells = splitCsv(line);
        ++row;
        if (cells.size() != tr.columns.size())
            throw std::runtime_error(locus + ": trajectory row "
                + std::to_string(row) + " of '" + path + "' carries "
                + std::to_string(cells.size()) + " field(s) against "
                + std::to_string(tr.columns.size()) + " header column(s).");
        for (std::size_t c = 0; c < cells.size(); ++c)
        {
            try { tr.values[c].push_back(std::stod(cells[c])); }
            catch (const std::exception&)
            {
                throw std::runtime_error(locus + ": trajectory row "
                    + std::to_string(row) + ", column '" + tr.columns[c]
                    + "' of '" + path + "' does not parse as a number ('"
                    + cells[c] + "').");
            }
        }
    }
    if (tr.values.front().size() < 3)
        throw std::runtime_error(locus + ": the trajectory file '" + path
            + "' carries fewer than three rows -- there is no response in it.");

    //  Time must advance.  A record whose clock stalls or runs backwards
    //  cannot be segmented, and a silent sort would invent an experiment.
    const auto& t = tr.values.front();
    for (std::size_t i = 1; i < t.size(); ++i)
        if (!(t[i] > t[i - 1]))
            throw std::runtime_error(locus + ": the trajectory's `t` column"
                " does not increase strictly at row " + std::to_string(i + 1)
                + " (" + fmtG(t[i - 1]) + " -> " + fmtG(t[i]) + ").");
    return tr;
}

std::size_t columnIndex(const Trajectory& tr, const std::string& name,
                        const std::string& role, const std::string& locus)
{
    for (std::size_t c = 0; c < tr.columns.size(); ++c)
        if (tr.columns[c] == name) return c;

    std::string all;
    for (std::size_t c = 0; c < tr.columns.size(); ++c)
        all += (c ? ", " : "") + tr.columns[c];
    throw std::runtime_error(locus + ": the declared `" + role + "` column '"
        + name + "' is not in the trajectory.  The columns it carries are: "
        + all + ".  A controller's manipulated variable appears as"
        " `<controller>.MV`; a unit's state appears as `<unit>.<state>`.");
}

// ---------------------------------------------------------------------------
//  One step and the response that follows it.
// ---------------------------------------------------------------------------
struct Segment
{
    int         index = 0;
    std::size_t iBefore = 0;      // last sample carrying the OLD input
    std::size_t iEnd    = 0;      // last sample of this segment (inclusive)

    scalar tStepLower = 0.0, tStepUpper = 0.0, tEnd = 0.0;
    scalar u_before = 0.0, u_after = 0.0, du = 0.0;
    scalar y_before = 0.0, y_end = 0.0, dy = 0.0;

    scalar preStepSteadyMetric = 0.0;
    scalar settleMetric        = 0.0;

    scalar K = 0.0, tau = 0.0, theta = 0.0;
    bool   thetaAtLowerBound = false;
    scalar K_steadyState = 0.0, K_relativeDeviation = 0.0;
    scalar rmse = 0.0, rmseRelative = 0.0;
    scalar maxAbsResidual = 0.0, maxAbsResidualRelative = 0.0;
    scalar R2 = 0.0;
    scalar tauTwoPoint = 0.0, thetaTwoPoint = 0.0;
    int    nmIterations = 0;
    int    nmRestarts = 0;
    bool   nmConverged = false;
    std::size_t nPoints = 0;
};

//  The FOPDT unit step shape at one time, measured from the step origin.
scalar fopdtShape(scalar tRel, scalar tau, scalar theta)
{
    const scalar a = tRel - theta;
    if (a <= 0.0) return 0.0;
    return 1.0 - std::exp(-a / tau);
}

//  Linear interpolation of the time at which y first reaches `target`.
//  Returns a negative number when the response never reaches it.
scalar crossingTime(const std::vector<scalar>& t, const std::vector<scalar>& y,
                    std::size_t i0, std::size_t i1,
                    scalar yBefore, scalar dy, scalar fraction)
{
    const scalar target = yBefore + fraction * dy;
    for (std::size_t i = i0 + 1; i <= i1; ++i)
    {
        const scalar a = (y[i - 1] - yBefore) / dy;
        const scalar b = (y[i]     - yBefore) / dy;
        if ((a < fraction && b >= fraction) || (a > fraction && b <= fraction))
        {
            const scalar denom = y[i] - y[i - 1];
            const scalar w = (std::abs(denom) > 0.0)
                           ? (target - y[i - 1]) / denom : 0.0;
            return t[i - 1] + w * (t[i] - t[i - 1]) - t[i0];
        }
    }
    return -1.0;
}

// ---------------------------------------------------------------------------
//  The published tuning rules.  Each carries its own attribution string, and
//  that string is written into the CSV beside the numbers -- a setting quoted
//  without its source is a setting nobody can check.
// ---------------------------------------------------------------------------
struct Setting
{
    std::string rule, source, form;
    scalar Kc = 0.0;
    scalar Ti = 0.0;      // s
    scalar Td = 0.0;      // s
    //  STRUCTURAL, not numeric: a P controller HAS no integral term, whereas a
    //  PID whose theta came out zero has one of magnitude zero.  Testing
    //  `Ti > 0` would print those two the same way and teach the reader that
    //  an absent term and a zero term are one thing.
    bool   hasTi = false;
    bool   hasTd = false;
};

const char* ZN_SOURCE =
    "Ziegler & Nichols, Trans. ASME 64 (1942) 759-768 -- open-loop"
    " (process reaction curve) settings, R = K/tau and L = theta";
const char* CC_SOURCE =
    "Cohen & Coon, Trans. ASME 75 (1953) 827-834";
const char* IMC_SOURCE =
    "Rivera, Morari & Skogestad, Ind. Eng. Chem. Process Des. Dev. 25 (1986)"
    " 252-265 -- FOPDT with a first-order Pade delay";
const char* SK_SOURCE =
    "Sundaresan & Krishnaswamy, Can. J. Chem. Eng. 56 (1978) 257-262";

} // anonymous namespace


int ReactionCurve::run(const DictPtr& dict,
                       const ThermoPackage& /*thermo*/,
                       int verbosity)
{
    diag_.clear();

    const std::string opName = dict->lookupWordOrDefault("name", "reactionCurve");
    const std::string locus  = "reactionCurve '" + opName + "'";

    // ---------------------------------------------------------------------
    //  The record, and the two columns that make it an experiment.
    // ---------------------------------------------------------------------
    const std::string path = dict->lookupWordOrDefault("trajectory",
                                                       "trajectory.csv");
    const Trajectory tr = readTrajectory(path, locus);

    const std::string uName = dict->lookupWord("manipulated");
    const std::string yName = dict->lookupWord("measured");
    if (uName == yName)
        throw std::runtime_error(locus + ": `manipulated` and `measured` name the same"
            " column ('" + uName + "').  A step response relates two different"
            " signals; regressing a column onto itself identifies nothing.");

    const std::size_t cU = columnIndex(tr, uName, "manipulated", locus);
    const std::size_t cY = columnIndex(tr, yName, "measured",    locus);

    const std::vector<scalar>& t = tr.values.front();
    const std::vector<scalar>& u = tr.values[cU];
    const std::vector<scalar>& y = tr.values[cY];
    const std::size_t n = t.size();

    //  The sampling interval: the MEDIAN of the record's own spacing, so a
    //  short final step (endTime not a multiple of writeInterval) cannot
    //  redefine the resolution of the whole record.
    std::vector<scalar> gaps;
    gaps.reserve(n - 1);
    for (std::size_t i = 1; i < n; ++i) gaps.push_back(t[i] - t[i - 1]);
    std::sort(gaps.begin(), gaps.end());
    const scalar dtSample = gaps[gaps.size() / 2];

    // ---------------------------------------------------------------------
    //  Step detection.  A change in the input column between two consecutive
    //  samples brackets the step: it happened in (t[i-1], t[i]].  The record
    //  cannot resolve it better than that, so the bracket is PUBLISHED and
    //  the lower edge is used as the origin -- which makes the identified
    //  theta an upper bound within one sampling interval, said aloud rather
    //  than absorbed.
    // ---------------------------------------------------------------------
    const scalar uScale = [&]{
        scalar lo = u.front(), hi = u.front();
        for (auto v : u) { lo = std::min(lo, v); hi = std::max(hi, v); }
        return std::max(hi - lo, std::numeric_limits<scalar>::min());
    }();

    std::vector<std::size_t> changes;
    for (std::size_t i = 1; i < n; ++i)
        if (std::abs(u[i] - u[i - 1]) > 1.0e-9 * uScale) changes.push_back(i);

    if (changes.empty())
        throw std::runtime_error(locus + ": the input column '" + uName
            + "' never changes over the record -- there is no step to identify"
              " a reaction curve from.  Drive the manipulated variable with a"
              " `Schedule` or a `Signal { type step; }` controller in the"
              " dynamic case, and check that `manipulated` names the column that"
              " actually moves.");

    std::vector<Segment> segs;
    for (std::size_t k = 0; k < changes.size(); ++k)
    {
        Segment s;
        s.index      = static_cast<int>(k + 1);
        s.iBefore    = changes[k] - 1;
        s.iEnd       = (k + 1 < changes.size()) ? changes[k + 1] - 1 : n - 1;
        s.tStepLower = t[s.iBefore];
        s.tStepUpper = t[changes[k]];
        s.tEnd       = t[s.iEnd];
        s.u_before   = u[s.iBefore];
        s.u_after    = u[changes[k]];
        s.du         = s.u_after - s.u_before;
        s.y_before   = y[s.iBefore];
        s.y_end      = y[s.iEnd];
        s.dy         = s.y_end - s.y_before;
        s.nPoints    = s.iEnd - s.iBefore + 1;
        segs.push_back(s);
    }

    // ---------------------------------------------------------------------
    //  Settling: the refusal this operation is built around.
    // ---------------------------------------------------------------------
    scalar settleTol = 0.005, settleWindow = 0.15;
    bool settleDefaulted = true;
    if (dict->found("settling"))
    {
        auto sd = dict->subDict("settling");
        settleTol    = sd->lookupScalarOrDefault("tolerance", settleTol);
        settleWindow = sd->lookupScalarOrDefault("window",    settleWindow);
        settleDefaulted = false;
    }
    if (settleDefaulted)
        AdvisoryLog::instance().add("model", "info", locus,
            "no `settling {}` block was declared; the steady-state test uses"
            " the DEFAULT tolerance 0.005 over the final 0.15 of each segment."
            "  That tolerance is what decides whether a time constant is"
            " reported at all, so it is a declaration worth making rather than"
            " inheriting.");
    if (!(settleTol > 0.0) || !(settleWindow > 0.0) || !(settleWindow < 1.0))
        throw std::runtime_error(locus + ": `settling.tolerance` must be"
            " positive and `settling.window` must lie strictly between 0 and 1"
            " (it is the FINAL FRACTION of each segment the steady-state test"
            " looks at).");

    const std::size_t minPoints = static_cast<std::size_t>(std::lround(
        dict->lookupScalarOrDefault("minimumPoints", 20.0)));

    for (auto& s : segs)
    {
        if (s.nPoints < minPoints)
            throw std::runtime_error(locus + ": segment "
                + std::to_string(s.index) + " (step at t in ("
                + fmtG(s.tStepLower) + ", " + fmtG(s.tStepUpper) + "]) carries"
                " only " + std::to_string(s.nPoints) + " sample(s) against the"
                " " + std::to_string(minPoints) + " this bench requires to"
                " regress three parameters.  Reduce `writeInterval` in the"
                " dynamic case, or hold each step longer.");

        if (!(std::abs(s.du) > 0.0))
            throw std::runtime_error(locus + ": segment "
                + std::to_string(s.index) + " has a zero input change.");

        //  A response that never moved cannot be identified, and a gain read
        //  off it would be an arbitrary ratio of two roundings.
        scalar yLo = y[s.iBefore], yHi = y[s.iBefore];
        for (std::size_t i = s.iBefore; i <= s.iEnd; ++i)
        { yLo = std::min(yLo, y[i]); yHi = std::max(yHi, y[i]); }
        const scalar span = yHi - yLo;
        if (!(std::abs(s.dy) > 0.0) || std::abs(s.dy) < 1.0e-6 * std::max(span, std::abs(s.y_before)))
            throw std::runtime_error(locus + ": segment "
                + std::to_string(s.index) + " shows no response: the output '"
                + yName + "' changed by " + sci(s.dy) + " over a step of "
                + sci(s.du) + " in '" + uName + "'.  Either the two columns"
                " are not causally connected, or the step is too small to move"
                " the plant out of its own rounding.");

        //  PRE-STEP STEADINESS.  A gain is the ratio of two STEADY states; a
        //  step applied to a plant still moving measures the transient it
        //  interrupted, not a gain.
        const scalar wDur = settleWindow * (s.tEnd - s.tStepLower);
        std::size_t iPre = s.iBefore;
        while (iPre > 0 && t[s.iBefore] - t[iPre - 1] <= wDur) --iPre;
        scalar preMetric = 0.0;
        for (std::size_t i = iPre; i <= s.iBefore; ++i)
            preMetric = std::max(preMetric,
                                 std::abs(y[i] - s.y_before) / std::abs(s.dy));
        s.preStepSteadyMetric = preMetric;
        if (iPre == s.iBefore)
            throw std::runtime_error(locus + ": segment "
                + std::to_string(s.index) + " begins with no record before its"
                " step, so this bench cannot verify that the plant was steady"
                " when the step was applied.  Hold the base value for at least"
                " " + fmtG(wDur) + " s before the first step.");
        if (preMetric > settleTol)
            throw std::runtime_error(locus + ": segment "
                + std::to_string(s.index) + " was stepped while the plant was"
                " still moving.  Over the " + fmtG(wDur) + " s before the step"
                " at t = " + fmtG(s.tStepLower) + " s the output '" + yName
                + "' still varied by " + sci(preMetric) + " of the step change"
                " it then made, against the declared `settling.tolerance` "
                + fmtG(settleTol) + ".  A gain is the ratio of two STEADY"
                " states -- lengthen the hold before this step, or relax"
                " `settling.tolerance` if you accept the bias and mean to"
                " report it.");

        //  SETTLING.  Measured as the largest excursion from the segment's own
        //  final value over its final `window`, as a fraction of the step
        //  change.  A response still on its way to somewhere gives a time
        //  constant that is a fiction.
        std::size_t iSet = s.iEnd;
        while (iSet > s.iBefore && s.tEnd - t[iSet - 1] <= wDur) --iSet;
        scalar setMetric = 0.0;
        for (std::size_t i = iSet; i <= s.iEnd; ++i)
            setMetric = std::max(setMetric,
                                 std::abs(y[i] - s.y_end) / std::abs(s.dy));
        s.settleMetric = setMetric;
        if (setMetric > settleTol)
            throw std::runtime_error(locus + ": segment "
                + std::to_string(s.index) + " NEVER SETTLED.  Over the final "
                + fmtG(wDur) + " s of the segment (t = " + fmtG(t[iSet])
                + " to " + fmtG(s.tEnd) + " s) the output '" + yName + "' was"
                " still moving by " + sci(setMetric) + " of its own step"
                " change, against the declared `settling.tolerance` "
                + fmtG(settleTol) + ".  The steady-state gain and the time"
                " constant are BOTH read off the end of the curve, so neither"
                " means anything here: K would be the change so far rather"
                " than the change, and tau would be whatever exponential"
                " happens to pass through an unfinished transient.  Hold this"
                " step longer (raise `endTime` in the dynamic case, or move"
                " the next schedule entry later), or -- if the plant really"
                " does not settle -- identify it with a method that does not"
                " assume it does.  This bench will not report a time constant"
                " for a response that has not finished.");
    }

    // ---------------------------------------------------------------------
    //  THE REGRESSION.  For a trial (tau, theta) the amplitude a = K*du is
    //  LINEAR, so it is eliminated in closed form and the search runs over
    //  two parameters only.  Nelder-Mead is the project's shared simplex
    //  (solver/NelderMead.H) -- no second optimiser is written here.
    //  Coordinates are normalised (log tau against the two-point seed, theta
    //  against the segment length) so the simplex's own step sizes are
    //  meaningful whatever the units of the columns.
    // ---------------------------------------------------------------------
    for (auto& s : segs)
    {
        const scalar L = s.tEnd - s.tStepLower;

        //  The two-point construction: arithmetic a student can repeat with a
        //  ruler, and the independent check on the regression.
        const scalar t353 = crossingTime(t, y, s.iBefore, s.iEnd,
                                         s.y_before, s.dy, 0.353);
        const scalar t853 = crossingTime(t, y, s.iBefore, s.iEnd,
                                         s.y_before, s.dy, 0.853);
        if (t353 > 0.0 && t853 > t353)
        {
            s.tauTwoPoint   = 0.67 * (t853 - t353);
            s.thetaTwoPoint = 1.3 * t353 - 0.29 * t853;
        }

        const scalar tauRef = (s.tauTwoPoint > dtSample) ? s.tauTwoPoint
                                                         : std::max(dtSample, 0.1 * L);

        auto sse = [&](const sVector& x, scalar* aOut) -> scalar
        {
            const scalar tau   = tauRef * std::exp(x[0]);
            const scalar theta = x[1] * L;
            scalar gg = 0.0, gz = 0.0;
            for (std::size_t i = s.iBefore; i <= s.iEnd; ++i)
            {
                const scalar g = fopdtShape(t[i] - s.tStepLower, tau, theta);
                gg += g * g;
                gz += g * (y[i] - s.y_before);
            }
            if (!(gg > 0.0)) { if (aOut) *aOut = 0.0; return 1.0e300; }
            const scalar a = gz / gg;
            if (aOut) *aOut = a;
            scalar S = 0.0;
            for (std::size_t i = s.iBefore; i <= s.iEnd; ++i)
            {
                const scalar g = fopdtShape(t[i] - s.tStepLower, tau, theta);
                const scalar r = (y[i] - s.y_before) - a * g;
                S += r * r;
            }
            return S;
        };

        sVector x0 = { 0.0,
                       (s.thetaTwoPoint > 0.0)
                           ? std::min(0.9, s.thetaTwoPoint / L) : 0.0 };
        sVector lo = { std::log(std::max(0.1 * dtSample, 1.0e-12) / tauRef), 0.0 };
        sVector hi = { std::log(20.0 * L / tauRef), 0.9 };

        //  THE OBJECTIVE IS NORMALISED BY ITS OWN SEED VALUE, and that is not
        //  cosmetic.  `solver::NelderMead` floors the scale of its f-range
        //  test at 1 (`fScale = max(1, |fBest|)`), so for an objective whose
        //  absolute size is far below 1 -- and a sum of squared kmol residuals
        //  is around 1e-11 here -- `tolF` silently stops being a RELATIVE
        //  tolerance and becomes an absolute one.  Fed the raw sum of squares
        //  this fit stopped after NINE iterations, reporting `converged` at a
        //  point an independent search beat by 2.5 % in SSE.  Dividing by the
        //  seed's own value puts the objective at 1 where the shared solver's
        //  test means what it says; nothing in the shared solver is changed,
        //  and every other caller keeps its behaviour.
        scalar S0 = sse(x0, nullptr);
        if (!(S0 > 0.0)) S0 = 1.0;

        solver::NMOptions opts;
        opts.tolX              = 1.0e-12;
        opts.tolF              = 1.0e-14;
        opts.maxIter           = 4000;
        opts.simplexInitFactor = 0.20;
        opts.absStep           = 0.05;

        //  RESTARTED FROM ITS OWN ANSWER.  A Nelder-Mead simplex can collapse
        //  onto a subspace and then declare its own flatness a minimum; the
        //  standard remedy is to rebuild the simplex at the best point and go
        //  again.  Restarts stop when one buys less than 1e-12 of the
        //  objective, and the count is PUBLISHED as `nmRestarts` rather than
        //  described in prose.
        solver::NMResult nm = solver::nelderMead(
            [&](const sVector& x) { return sse(x, nullptr) / S0; },
            x0, lo, hi, opts);
        int restarts = 0;
        for (; restarts < 5; ++restarts)
        {
            const solver::NMResult again = solver::nelderMead(
                [&](const sVector& x) { return sse(x, nullptr) / S0; },
                nm.x, lo, hi, opts);
            const bool improved = again.f < nm.f * (1.0 - 1.0e-12);
            if (again.f < nm.f) nm = again;
            if (!improved) break;
        }

        scalar a = 0.0;
        const scalar S = sse(nm.x, &a);
        s.tau   = tauRef * std::exp(nm.x[0]);
        s.theta = nm.x[1] * L;
        s.K     = a / s.du;
        s.nmIterations = nm.iterations;
        s.nmRestarts   = restarts;
        s.nmConverged  = nm.converged;
        s.thetaAtLowerBound = (s.theta <= 1.0e-12 * L);

        s.K_steadyState = s.dy / s.du;
        s.K_relativeDeviation =
            std::abs(s.K - s.K_steadyState) / std::abs(s.K_steadyState);

        s.rmse = std::sqrt(S / static_cast<scalar>(s.nPoints));
        s.rmseRelative = s.rmse / std::abs(s.dy);
        scalar mx = 0.0, ybar = 0.0;
        for (std::size_t i = s.iBefore; i <= s.iEnd; ++i) ybar += y[i];
        ybar /= static_cast<scalar>(s.nPoints);
        scalar sst = 0.0;
        for (std::size_t i = s.iBefore; i <= s.iEnd; ++i)
        {
            const scalar fit = s.y_before
                + a * fopdtShape(t[i] - s.tStepLower, s.tau, s.theta);
            mx = std::max(mx, std::abs(y[i] - fit));
            sst += (y[i] - ybar) * (y[i] - ybar);
        }
        s.maxAbsResidual = mx;
        s.maxAbsResidualRelative = mx / std::abs(s.dy);
        s.R2 = (sst > 0.0) ? 1.0 - S / sst : 0.0;

        if (!nm.converged)
            AdvisoryLog::instance().add("model", "warning", locus,
                "the regression for segment " + std::to_string(s.index)
                + " stopped on `" + nm.reason + "` rather than on its"
                  " tolerances, so (K, tau, theta) below is the best point the"
                  " simplex reached and not a converged minimum.  Its residual"
                  " is published beside it -- read that before quoting the"
                  " triple.");
        if (s.thetaAtLowerBound)
            AdvisoryLog::instance().add("model", "warning", locus,
                "segment " + std::to_string(s.index) + ": the dead time"
                " reached its LOWER BOUND of zero.  The bound is there because"
                " a negative dead time is not causal, and it BINDS here -- the"
                " best FOPDT description of this response has no delay at all."
                "  Every tuning rule that divides by theta is therefore"
                " undefined and is refused below by name.");
        else if (s.theta <= dtSample)
            AdvisoryLog::instance().add("model", "warning", locus,
                "segment " + std::to_string(s.index) + ": the identified dead"
                " time (" + fmtG(s.theta) + " s) is not larger than the"
                " trajectory's own sampling interval (" + fmtG(dtSample)
                + " s), so it is not RESOLVED by this record -- it is a number"
                  " smaller than the grid it was measured on.  Rules that"
                  " divide by theta are refused below.  Reduce `writeInterval`"
                  " in the dynamic case if you need it resolved.");
    }

    //  The sampling bracket, stated once for the whole record.
    AdvisoryLog::instance().add("model", "info", locus,
        "each step is bracketed by the record's own sampling: the input"
        " changes somewhere in (t[i-1], t[i]], and the LOWER edge is used as"
        " the origin of every reaction curve.  The identified dead time is"
        " therefore an UPPER bound within one sampling interval ("
        + fmtG(dtSample) + " s); the true theta lies in [theta - "
        + fmtG(dtSample) + ", theta].  Nothing in this record can narrow that"
        " -- only a smaller `writeInterval` can.");

    //  THE SURROGATE STATEMENT.  Not a claim about the plant -- this bench
    //  sees a trajectory and never the model that produced it -- but a claim
    //  about what was DELIVERED, with the number that makes it falsifiable.
    scalar worstRel = 0.0;
    for (const auto& s : segs) worstRel = std::max(worstRel, s.rmseRelative);
    AdvisoryLog::instance().add("model", "warning", locus,
        "AN FOPDT MODEL IS A SURROGATE.  What is published below is the best"
        " first-order-plus-dead-time description of THIS response to THIS"
        " step, over THIS operating point -- it is not a property of the"
        " plant, and this bench cannot inspect the plant to say how far the"
        " two differ in general.  What it CAN say is how far they differ over"
        " the record it was shown: the worst per-segment r.m.s. residual is "
        + sci(worstRel, 3) + " of that segment's own step change, and every"
        " segment's residual is published beside its own triple.  A tuning"
        " rule applied to these three numbers is tuned for the surrogate, not"
        " for the plant.");

    // ---------------------------------------------------------------------
    //  STEP-SIZE SENSITIVITY.  A gain identified from one step and then
    //  quoted as the plant's gain is a remembered measurement dressed as a
    //  property.  With more than one step the spread is MEASURED; with one it
    //  is said plainly that it was not.
    // ---------------------------------------------------------------------
    auto spread = [&](scalar Segment::*f) -> scalar
    {
        scalar lo = segs.front().*f, hi = segs.front().*f, sum = 0.0;
        for (const auto& s : segs)
        { lo = std::min(lo, s.*f); hi = std::max(hi, s.*f); sum += s.*f; }
        const scalar mean = sum / static_cast<scalar>(segs.size());
        return (std::abs(mean) > 0.0) ? (hi - lo) / std::abs(mean) : 0.0;
    };
    const scalar Kspread     = spread(&Segment::K);
    const scalar tauSpread   = spread(&Segment::tau);
    const scalar thetaSpread = spread(&Segment::theta);

    std::vector<scalar> magnitudes;
    for (const auto& s : segs) magnitudes.push_back(std::abs(s.du));
    const scalar magLo = *std::min_element(magnitudes.begin(), magnitudes.end());
    const scalar magHi = *std::max_element(magnitudes.begin(), magnitudes.end());
    const bool magnitudeVaried = (magHi - magLo) > 1.0e-9 * magHi;

    if (segs.size() < 2)
        AdvisoryLog::instance().add("model", "warning", locus,
            "THE SENSITIVITY TO STEP SIZE WAS NOT MEASURED.  This record"
            " carries ONE step, so the identified (K, tau, theta) is a single"
            " measurement and nothing here says how much of it is a property"
            " of the plant and how much is a property of the step it was"
            " asked with.  Add further steps -- of a different magnitude AND"
            " of the opposite sign -- to the dynamic case's schedule, and this"
            " bench will publish the spread.");
    else if (!magnitudeVaried)
        AdvisoryLog::instance().add("model", "warning", locus,
            "the sensitivity to step DIRECTION was measured across "
            + std::to_string(segs.size()) + " segments, but every step has the"
              " same magnitude (" + fmtG(magHi) + "), so the sensitivity to"
              " step SIZE was NOT measured.  Add a step of a different"
              " magnitude to the dynamic case's schedule.");
    else
        AdvisoryLog::instance().add("model", "info", locus,
            "the sensitivity to step size WAS measured, over "
            + std::to_string(segs.size()) + " steps spanning |du| = "
            + fmtG(magLo) + " to " + fmtG(magHi) + ".  Across them the"
              " identified gain spans " + sci(Kspread, 3) + " of its own mean,"
              " the time constant " + sci(tauSpread, 3) + " and the dead time "
            + sci(thetaSpread, 3) + ".  Those three numbers are the honest"
              " uncertainty on a triple quoted from any ONE of these steps;"
              " where the normalised curves in the published curve CSV fail to"
              " superpose is where the plant is nonlinear.");

    // ---------------------------------------------------------------------
    //  THE TUNING RULES.
    // ---------------------------------------------------------------------
    std::vector<std::string> rules  = { "zieglerNichols", "cohenCoon" };
    std::vector<std::string> forms  = { "PI", "PID" };
    scalar lambda = 0.0;
    std::string lambdaHow;
    bool lambdaPerSegment = false;
    scalar lambdaRelative = 0.0;

    if (dict->found("tuning"))
    {
        auto td = dict->subDict("tuning");
        if (td->found("rules")) rules = td->lookupWordList("rules");
        if (td->found("forms")) forms = td->lookupWordList("forms");

        const bool wantsImc =
            std::find(rules.begin(), rules.end(), "imcLambda") != rules.end();
        if (td->found("lambda"))
        {
            auto ld = td->subDict("lambda");
            const bool hasValue = ld->found("value");
            const bool hasRel   = ld->found("relativeToTau");
            if (hasValue == hasRel)
                throw std::runtime_error(locus + ": `tuning.lambda` must"
                    " declare EXACTLY one of `value <time>;` (an absolute"
                    " closed-loop time constant) or `relativeToTau <factor>;`"
                    " (a multiple of the identified tau).  Both together are"
                    " two homes for one number; neither leaves the closed-loop"
                    " speed undeclared.");
            if (hasValue)
            {
                lambda = ld->lookupScalar("value", Dims::time);
                lambdaHow = "declared absolute lambda = " + fmtG(lambda) + " s";
            }
            else
            {
                lambdaRelative   = ld->lookupScalar("relativeToTau");
                lambdaPerSegment = true;
                lambdaHow = "lambda = " + fmtG(lambdaRelative)
                          + " * tau, per segment";
            }
            if (!(lambda > 0.0) && !(lambdaRelative > 0.0))
                throw std::runtime_error(locus + ": `tuning.lambda` must be"
                    " strictly positive -- a closed loop cannot be asked to"
                    " respond in zero time.");
        }
        else if (wantsImc)
            throw std::runtime_error(locus + ": the `imcLambda` rule was"
                " requested but no `tuning.lambda {}` was declared.  Lambda is"
                " the desired CLOSED-LOOP time constant: it is the engineer's"
                " choice of how fast the loop should be, not something the"
                " open-loop record can tell you, and this bench will not"
                " invent one.  Declare `lambda { relativeToTau 1.0; }` (a"
                " closed loop as fast as the plant) or `lambda { value <t>"
                " s; }`.  Rivera, Morari & Skogestad (1986) recommend keeping"
                " lambda above roughly 0.8 theta for robustness; that"
                " recommendation is theirs to make and yours to apply.");
    }

    for (const auto& r : rules)
        if (r != "zieglerNichols" && r != "cohenCoon" && r != "imcLambda")
            throw std::runtime_error(locus + ": unknown tuning rule '" + r
                + "'.  This bench ships exactly three, each attributed to a"
                  " primary in its published `source` column: zieglerNichols"
                  " (Trans. ASME 64, 1942), cohenCoon (Trans. ASME 75, 1953)"
                  " and imcLambda (Rivera, Morari & Skogestad, 1986).  A rule"
                  " that cannot be cited is not shipped -- inventing a"
                  " citation turns unsourced into falsely sourced.");
    for (const auto& fm : forms)
        if (fm != "P" && fm != "PI" && fm != "PID")
            throw std::runtime_error(locus + ": unknown controller form '" + fm
                + "'.  Declare P, PI or PID.");

    std::vector<std::pair<int, Setting>> settings;
    std::vector<std::string> tuningRefusals;

    for (const auto& s : segs)
    {
        const scalar K = s.K, tau = s.tau, th = s.theta;
        const bool thetaUsable = (th > dtSample);
        const scalar r = thetaUsable ? th / tau : 0.0;
        const scalar lam = lambdaPerSegment ? lambdaRelative * tau : lambda;

        for (const auto& rule : rules)
        {
            for (const auto& fm : forms)
            {
                Setting st;
                st.rule = rule;
                st.form = fm;

                if (rule == "zieglerNichols")
                {
                    st.source = ZN_SOURCE;
                    if (!thetaUsable)
                    {
                        tuningRefusals.push_back("segment "
                            + std::to_string(s.index) + ", zieglerNichols "
                            + fm + ": Kc is proportional to tau/(K*theta) and"
                              " theta is not resolved by this record");
                        continue;
                    }
                    if      (fm == "P")  { st.Kc = tau / (K * th); }
                    else if (fm == "PI") { st.Kc = 0.9 * tau / (K * th);
                                           st.Ti = 3.33 * th; }
                    else                 { st.Kc = 1.2 * tau / (K * th);
                                           st.Ti = 2.0 * th;
                                           st.Td = 0.5 * th; }
                }
                else if (rule == "cohenCoon")
                {
                    st.source = CC_SOURCE;
                    if (!thetaUsable)
                    {
                        tuningRefusals.push_back("segment "
                            + std::to_string(s.index) + ", cohenCoon " + fm
                            + ": every Cohen-Coon setting carries a tau/theta"
                              " factor and theta is not resolved by this"
                              " record");
                        continue;
                    }
                    const scalar base = (1.0 / K) * (tau / th);
                    if      (fm == "P")  { st.Kc = base * (1.0 + r / 3.0); }
                    else if (fm == "PI") { st.Kc = base * (0.9 + r / 12.0);
                                           st.Ti = th * (30.0 + 3.0 * r)
                                                      / (9.0 + 20.0 * r); }
                    else                 { st.Kc = base * (4.0 / 3.0 + r / 4.0);
                                           st.Ti = th * (32.0 + 6.0 * r)
                                                      / (13.0 + 8.0 * r);
                                           st.Td = th * 4.0 / (11.0 + 2.0 * r); }
                }
                else   // imcLambda
                {
                    st.source = IMC_SOURCE;
                    if (fm == "P")
                    {
                        tuningRefusals.push_back("segment "
                            + std::to_string(s.index) + ", imcLambda P:"
                              " Rivera, Morari & Skogestad (1986) publish no"
                              " P-only entry for a FOPDT model -- the IMC"
                              " filter always produces integral action, and"
                              " writing a P setting here would be algebra of"
                              " this bench's own invention under their name");
                        continue;
                    }
                    st.Kc = (1.0 / K) * (tau + 0.5 * th) / (lam + 0.5 * th);
                    st.Ti = tau + 0.5 * th;
                    if (fm == "PID")
                        st.Td = tau * th / (2.0 * tau + th);
                }
                st.hasTi = (fm != "P");
                st.hasTd = (fm == "PID");
                settings.emplace_back(s.index, st);
            }
        }
    }

    if (!tuningRefusals.empty())
    {
        std::string msg = "some tuning settings were REFUSED rather than"
            " produced, each for a stated reason: ";
        for (std::size_t i = 0; i < tuningRefusals.size(); ++i)
            msg += (i ? "; " : "") + tuningRefusals[i];
        msg += ".  The identification itself stands -- what is refused is"
               " turning it into a controller setting the rule's own algebra"
               " cannot define.";
        AdvisoryLog::instance().add("refusal", "warning", locus, msg);
    }

    // ---------------------------------------------------------------------
    //  Which segment the headline reports.
    // ---------------------------------------------------------------------
    int reference = static_cast<int>(std::lround(
        dict->lookupScalarOrDefault("reference", 1.0)));
    if (reference < 1 || reference > static_cast<int>(segs.size()))
        throw std::runtime_error(locus + ": `reference` selects segment "
            + std::to_string(reference) + ", but this record holds "
            + std::to_string(segs.size()) + " step segment(s).");
    const Segment& ref = segs[static_cast<std::size_t>(reference - 1)];
    if (!dict->found("reference") && segs.size() > 1)
        AdvisoryLog::instance().add("model", "info", locus,
            "no `reference` segment was declared; the headline diagnostics"
            " report segment 1 of " + std::to_string(segs.size()) + ".  Every"
            " segment's own triple is in the published segments CSV -- the"
            " headline is a choice of which step to quote, not a summary of"
            " all of them.");

    // ---------------------------------------------------------------------
    //  Report.
    // ---------------------------------------------------------------------
    if (verbosity >= 2)
    {
        std::cout << "\n=========================  reactionCurve  =========================\n"
                  << "  Trajectory:   " << path << "  (" << n << " rows, "
                  << "sampling " << fmtG(dtSample) << " s)\n"
                  << "  Manipulated:  " << uName << "   (the step)\n"
                  << "  Measured:     " << yName << "   (the response)\n"
                  << "  Steps found:  " << segs.size() << "\n\n"
                  << "  seg      du        dy          K          tau [s]   "
                     " theta [s]   rmse/|dy|   R2\n";
        for (const auto& s : segs)
            std::cout << "  " << std::setw(3) << s.index
                      << "  " << std::setw(10) << sci(s.du, 2)
                      << "  " << std::setw(10) << sci(s.dy, 2)
                      << "  " << std::setw(12) << sci(s.K, 5)
                      << "  " << std::setw(10) << fmtG(s.tau).substr(0, 9)
                      << "  " << std::setw(10) << fmtG(s.theta).substr(0, 9)
                      << "  " << std::setw(10) << sci(s.rmseRelative, 2)
                      << "  " << fmtG(s.R2).substr(0, 8) << "\n";

        std::cout << "\n  ---- the identification, segment " << reference
                  << " (the headline) ----\n"
                  << "    K     = " << fmtG(ref.K) << "   ["
                  << yName << " per " << uName << "]\n"
                  << "    tau   = " << fmtG(ref.tau) << " s\n"
                  << "    theta = " << fmtG(ref.theta) << " s"
                  << (ref.thetaAtLowerBound ? "   (AT ITS LOWER BOUND)" : "")
                  << "\n"
                  << "    fit:    rmse = " << sci(ref.rmse) << " ("
                  << sci(ref.rmseRelative, 3) << " of |dy|),  max |residual| = "
                  << sci(ref.maxAbsResidual) << " ("
                  << sci(ref.maxAbsResidualRelative, 3) << "),  R2 = "
                  << fmtG(ref.R2) << "\n"
                  << "    K from the settled end points = "
                  << fmtG(ref.K_steadyState) << "   (rel. deviation from the"
                     " regression " << sci(ref.K_relativeDeviation, 3) << ")\n"
                  << "    two-point construction (" << SK_SOURCE << "):"
                     "  tau = " << fmtG(ref.tauTwoPoint)
                  << " s, theta = " << fmtG(ref.thetaTwoPoint) << " s\n"
                  << "    settling metric " << sci(ref.settleMetric, 3)
                  << " and pre-step steadiness " << sci(ref.preStepSteadyMetric, 3)
                  << ", both against tolerance " << fmtG(settleTol) << "\n";

        std::cout << "\n  ---- the classical rules, and their disagreement ----\n"
                  << "  seg  rule             form     Kc            "
                     "Ti [s]        Td [s]\n";
        for (const auto& [segIdx, st] : settings)
            std::cout << "  " << std::setw(3) << segIdx
                      << "  " << std::left << std::setw(16) << st.rule
                      << std::setw(6) << st.form << std::right
                      << "  " << std::setw(12) << sci(st.Kc, 5)
                      << "  " << std::setw(12)
                      << (st.hasTi ? sci(st.Ti, 5) : std::string("-"))
                      << "  " << std::setw(12)
                      << (st.hasTd ? sci(st.Td, 5) : std::string("-"))
                      << "\n";
        if (!lambdaHow.empty())
            std::cout << "    IMC closed-loop speed: " << lambdaHow << "\n";
        std::cout << "    Sources are written into the tuning CSV's `source`"
                     " column; the three rules disagree by construction --\n"
                     "    they optimise different things, and none of them is"
                     " the engine's recommendation.\n";
    }

    // ---------------------------------------------------------------------
    //  Published CSVs.
    // ---------------------------------------------------------------------
    std::string segCsv, curveCsv, tuneCsv;
    if (dict->found("output"))
    {
        auto o = dict->subDict("output");
        segCsv   = o->lookupWordOrDefault("segments", "");
        curveCsv = o->lookupWordOrDefault("curve",    "");
        tuneCsv  = o->lookupWordOrDefault("tuning",   "");
    }

    if (!segCsv.empty())
    {
        std::ofstream f(segCsv);
        if (!f) throw std::runtime_error(locus + ": cannot write '" + segCsv + "'.");
        f << "segment,tStepLower,tStepUpper,tEnd,nPoints,sampleInterval,"
             "u_before,u_after,du,y_before,y_end,dy,"
             "preStepSteadyMetric,settleMetric,settleTolerance,"
             "K,tau,theta,thetaAtLowerBound,thetaSampleUncertainty,"
             "K_steadyState,K_relativeDeviation,"
             "rmse,rmse_relative,maxAbsResidual,maxAbsResidual_relative,R2,"
             "tau_twoPoint,theta_twoPoint,nmIterations,nmRestarts,nmConverged\n";
        for (const auto& s : segs)
            f << s.index << ',' << fmtG(s.tStepLower) << ',' << fmtG(s.tStepUpper)
              << ',' << fmtG(s.tEnd) << ',' << s.nPoints << ',' << fmtG(dtSample)
              << ',' << fmtG(s.u_before) << ',' << fmtG(s.u_after) << ',' << fmtG(s.du)
              << ',' << fmtG(s.y_before) << ',' << fmtG(s.y_end) << ',' << fmtG(s.dy)
              << ',' << fmtG(s.preStepSteadyMetric) << ',' << fmtG(s.settleMetric)
              << ',' << fmtG(settleTol)
              << ',' << fmtG(s.K) << ',' << fmtG(s.tau) << ',' << fmtG(s.theta)
              << ',' << (s.thetaAtLowerBound ? 1 : 0) << ',' << fmtG(dtSample)
              << ',' << fmtG(s.K_steadyState) << ',' << fmtG(s.K_relativeDeviation)
              << ',' << fmtG(s.rmse) << ',' << fmtG(s.rmseRelative)
              << ',' << fmtG(s.maxAbsResidual) << ',' << fmtG(s.maxAbsResidualRelative)
              << ',' << fmtG(s.R2)
              << ',' << fmtG(s.tauTwoPoint) << ',' << fmtG(s.thetaTwoPoint)
              << ',' << s.nmIterations << ',' << s.nmRestarts
              << ',' << (s.nmConverged ? 1 : 0) << '\n';
        if (verbosity >= 2)
            std::cout << "    segments -> " << segCsv << "\n";
    }

    if (!curveCsv.empty())
    {
        std::ofstream f(curveCsv);
        if (!f) throw std::runtime_error(locus + ": cannot write '" + curveCsv + "'.");
        f << "segment,t,tRelative,u,y,yFit,residual,yNormalised,yFitNormalised\n";
        for (const auto& s : segs)
        {
            const scalar a = s.K * s.du;
            for (std::size_t i = s.iBefore; i <= s.iEnd; ++i)
            {
                const scalar tRel = t[i] - s.tStepLower;
                const scalar fit  = s.y_before
                                  + a * fopdtShape(tRel, s.tau, s.theta);
                f << s.index << ',' << fmtG(t[i]) << ',' << fmtG(tRel)
                  << ',' << fmtG(u[i]) << ',' << fmtG(y[i]) << ',' << fmtG(fit)
                  << ',' << fmtG(y[i] - fit)
                  << ',' << fmtG((y[i] - s.y_before) / s.dy)
                  << ',' << fmtG((fit  - s.y_before) / s.dy) << '\n';
            }
        }
        if (verbosity >= 2)
            std::cout << "    reaction curves -> " << curveCsv << "\n";
    }

    if (!tuneCsv.empty())
    {
        std::ofstream f(tuneCsv);
        if (!f) throw std::runtime_error(locus + ": cannot write '" + tuneCsv + "'.");
        f << "segment,du,rule,source,form,Kc,Ti,Td,KcK,thetaOverTau\n";
        for (const auto& [segIdx, st] : settings)
        {
            const Segment& s = segs[static_cast<std::size_t>(segIdx - 1)];
            f << segIdx << ',' << fmtG(s.du) << ',' << st.rule
              << ",\"" << st.source << "\"," << st.form
              << ',' << fmtG(st.Kc)
              << ',' << (st.hasTi ? fmtG(st.Ti) : std::string(""))
              << ',' << (st.hasTd ? fmtG(st.Td) : std::string(""))
              << ',' << fmtG(st.Kc * s.K) << ',' << fmtG(s.theta / s.tau) << '\n';
        }
        if (verbosity >= 2)
            std::cout << "    tuning settings -> " << tuneCsv << "\n";
    }

    // ---------------------------------------------------------------------
    //  Diagnostics.  The headline triple carries its own quality, never
    //  alone: a fitted parameter with no residual is a number the reader
    //  cannot judge.
    // ---------------------------------------------------------------------
    diag_["segments"]              = static_cast<scalar>(segs.size());
    diag_["reference_segment"]     = static_cast<scalar>(reference);
    diag_["sampleInterval_s"]      = dtSample;
    diag_["K"]                     = ref.K;
    diag_["tau_s"]                 = ref.tau;
    diag_["theta_s"]               = ref.theta;
    diag_["theta_atLowerBound"]    = ref.thetaAtLowerBound ? 1.0 : 0.0;
    diag_["theta_sampleUncertainty_s"] = dtSample;
    diag_["K_steadyState"]         = ref.K_steadyState;
    diag_["K_relativeDeviation"]   = ref.K_relativeDeviation;
    diag_["fit_rmse"]              = ref.rmse;
    diag_["fit_rmse_relative"]     = ref.rmseRelative;
    diag_["fit_maxAbsResidual_relative"] = ref.maxAbsResidualRelative;
    diag_["fit_R2"]                = ref.R2;
    diag_["tau_twoPoint_s"]        = ref.tauTwoPoint;
    diag_["theta_twoPoint_s"]      = ref.thetaTwoPoint;
    diag_["settleMetric"]          = ref.settleMetric;
    diag_["preStepSteadyMetric"]   = ref.preStepSteadyMetric;
    diag_["settleTolerance"]       = settleTol;
    diag_["K_spread_relative"]     = Kspread;
    diag_["tau_spread_relative"]   = tauSpread;
    diag_["theta_spread_relative"] = thetaSpread;
    diag_["stepSizeVaried"]        = magnitudeVaried ? 1.0 : 0.0;
    diag_["du_magnitude_min"]      = magLo;
    diag_["du_magnitude_max"]      = magHi;

    //  Per-segment, so a golden can pin every step and not only the headline.
    for (const auto& s : segs)
    {
        const std::string p = "seg" + std::to_string(s.index) + "_";
        diag_[p + "du"]            = s.du;
        diag_[p + "K"]             = s.K;
        diag_[p + "tau_s"]         = s.tau;
        diag_[p + "theta_s"]       = s.theta;
        diag_[p + "rmse_relative"] = s.rmseRelative;
        diag_[p + "settleMetric"]  = s.settleMetric;
    }

    //  The settings, keyed by RULE and FORM so a changed rule reports itself
    //  by name in the key rather than by a silently different number.
    for (const auto& [segIdx, st] : settings)
        if (segIdx == reference)
        {
            diag_["tuning_" + st.rule + "_" + st.form + "_Kc"] = st.Kc;
            if (st.hasTi)
                diag_["tuning_" + st.rule + "_" + st.form + "_Ti_s"] = st.Ti;
            if (st.hasTd)
                diag_["tuning_" + st.rule + "_" + st.form + "_Td_s"] = st.Td;
        }

    if (verbosity >= 2)
        std::cout << "===================================================================\n\n";

    return 0;
}

} // namespace Choupo
