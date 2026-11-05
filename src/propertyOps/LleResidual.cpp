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
-------------------------------------------------------------------------------
Description
    See LleResidual.H.
\*---------------------------------------------------------------------------*/

#include "LleResidual.H"

#include "core/Advisory.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/flash/IsothermalFlash.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace Choupo {
namespace lle {

const Rows* current = nullptr;

namespace {

const char* const WHO = "fitParameters(T_bubble+LLE)";
const char* const propertyVLE = "binaryVLE.T_bubble";

std::string propertyOf(const EvidenceDataset& ds)
{
    auto d = Dictionary::fromFile(ds.path);
    return d->lookupWordOrDefault("property", "");
}

//  The tie line the last even row solved, shared with the odd row.
struct Cache { bool valid = false; std::size_t tie = 0; Binodal b; };
Cache s_cache;

}  // namespace

bool isMixed(const std::string& kind) { return kind == kindMixed; }

bool inRows(const Rows& r, std::size_t k) { return r.active() && r.isRow(k); }

std::vector<EvidenceDataset> vleSets(const std::vector<EvidenceDataset>& all, bool mixed)
{
    if (!mixed) return all;
    std::vector<EvidenceDataset> out;
    for (const auto& ds : all)
    {
        const std::string p = propertyOf(ds);
        if (p == propertyLLE) continue;
        if (p != propertyVLE)
            throw std::runtime_error(std::string(WHO) + ": dataset '" + ds.path
                + "' declares `property " + p + ";`.  Under `kind "
                + kindMixed + ";` every dataset is either `" + propertyVLE
                + "` (the bubble-temperature rows) or `" + propertyLLE
                + "` (the tie lines); any other kind of evidence is not read"
                  " here and is refused rather than skipped.");
        out.push_back(ds);
    }
    return out;
}

std::vector<EvidenceDataset> lleSets(const std::vector<EvidenceDataset>& all)
{
    std::vector<EvidenceDataset> out;
    for (const auto& ds : all)
        if (propertyOf(ds) == propertyLLE) out.push_back(ds);
    return out;
}

scalar readSigma(const DictPtr& resDict)
{
    if (!resDict->found("liquidLiquid"))
        throw std::runtime_error(std::string(WHO) + ": `residual { liquidLiquid"
            " { sigma <x>; origin \"...\"; } }` is REQUIRED.  The tie-line rows"
            " are (x_model - x_measured)/sigma, a dimensionless number added to"
            " the bubble-temperature rows (dT/U) in one chi2; sigma is the mole"
            " fraction the author judges equivalent to one standard uncertainty"
            " of the binodal measurement, and the engine will not choose a"
            " scale for the two kinds of evidence.");
    auto b = resDict->subDict("liquidLiquid");
    if (!b->found("sigma") || !b->found("origin"))
        throw std::runtime_error(std::string(WHO) + ": `residual.liquidLiquid`"
            " needs BOTH `sigma <mole fraction>;` and `origin \"...\";` (where"
            " that weight came from -- the measurement's own uncertainty, a"
            " stated engineering choice); a weight with no provenance cannot"
            " be told from one tuned after the fit.");
    const scalar s = b->lookupScalar("sigma");
    if (!(s > 0.0 && s < 1.0))
        throw std::runtime_error(std::string(WHO) + ": `liquidLiquid.sigma` ="
            " " + std::to_string(s) + " -- a mole fraction in (0, 1).");
    if (b->lookupWord("origin").empty())
        throw std::runtime_error(std::string(WHO) + ": `liquidLiquid.origin`"
            " is empty; an empty provenance is not a provenance.");
    return s;
}

void requireFitMode(const std::string& kind, bool evalMode,
                    const std::string& weighting)
{
    if (!isMixed(kind)) return;
    if (evalMode)
        throw std::runtime_error(std::string(WHO) + ": the tie-line residual is"
            " a FIT residual; mode evaluate scores the bubble-temperature"
            " kinds only.");
    if (weighting != "uncertainty")
        throw std::runtime_error(std::string(WHO) + ": mixed evidence needs"
            " `weighting uncertainty;`.  Bubble temperatures (kelvin) and"
            " binodal mole fractions cannot be added unweighted; with `"
            "uncertainty` both enter as dimensionless (dT/U and dx/sigma) and"
            " the weights are the ones the author declared.");
}

Rows load(const std::vector<EvidenceDataset>& sets, const std::string& comp1,
          scalar sigma, std::size_t first, const std::string& label)
{
    Rows r;
    r.first = first;
    r.sigma = sigma;
    if (sets.empty()) return r;
    if (comp1.empty())
        throw std::runtime_error(std::string(WHO) + ": `residual.components`"
            " must name the pair -- the tie-line mole fractions are those of"
            " the FIRST component named.");
    const std::vector<std::string> tNames{"T", "temperature"};
    const std::vector<std::string> loNames{"x_" + comp1 + "_phase1", "x[" + comp1 + "]_phase1"};
    const std::vector<std::string> hiNames{"x_" + comp1 + "_phase2", "x[" + comp1 + "]_phase2"};
    for (const auto& pt : EvidencePartition::loadAll(sets, tNames, loNames, label, hiNames))
    {
        if (!pt.hasZ())
            throw std::runtime_error(std::string(WHO) + ": a tie-line dataset"
                " needs the columns T, x_" + comp1 + "_phase1 and x_" + comp1
                + "_phase2 (the mole fraction of " + comp1 + " in each liquid).");
        Tie t;
        t.T = pt.x;
        t.xLo = std::min(pt.y, pt.z);
        t.xHi = std::max(pt.y, pt.z);
        if (!(t.xHi - t.xLo > 1.0e-3))
            throw std::runtime_error(std::string(WHO) + ": a tie line at T = "
                + std::to_string(t.T) + " K has both liquids at x = "
                + std::to_string(t.xLo) + " -- that is one liquid, not a tie"
                  " line.");
        r.ties.push_back(t);
    }
    return r;
}

void append(const Rows& r, sVector& xExp, sVector& tExp, sVector& pExp)
{
    for (const auto& t : r.ties)
        for (const scalar x : {t.xLo, t.xHi})
        {
            xExp.push_back(x);
            tExp.push_back(t.T);        // the tie's temperature (the validity span reads it)
            pExp.push_back(101325.0);   // unused: the liquid-liquid flash is liquid-only
        }
}

sVector head(const sVector& v, const Rows& r)
{
    if (!r.active()) return v;
    return sVector(v.begin(), v.begin() + static_cast<std::ptrdiff_t>(r.first));
}

sVector withRows(sVector w, const Rows& r)
{
    if (!r.active()) return w;
    if (w.size() != r.first)
        throw std::runtime_error(std::string(WHO) + ": " + std::to_string(w.size())
            + " bubble weights for " + std::to_string(r.first)
            + " bubble rows (internal).");
    w.insert(w.end(), r.size(), 1.0 / r.sigma);
    return w;
}

Binodal solveTie(const ThermoPackage& thermo, scalar T, scalar xLo, scalar xHi,
                 std::size_t i1, std::size_t i2)
{
    Binodal out;
    FlashOptions opts;
    opts.phaseSet  = PhaseSet::LL;
    opts.verbosity = 0;
    //  The tie line is the same for any feed inside the model's gap; the
    //  measured pair brackets where the gap is, so feeds are taken between
    //  its two compositions, the middle first.
    for (const scalar f : {0.5, 0.25, 0.75, 0.1, 0.9})
    {
        FlashInput in;
        in.F = 1.0;
        in.T = T;
        in.P = 101325.0;
        in.z = sVector(thermo.n(), 0.0);
        const scalar z1 = xLo + f * (xHi - xLo);
        in.z[i1] = z1;
        in.z[i2] = 1.0 - z1;
        try
        {
            const FlashSolution s = IsothermalFlash::solveCore(in, thermo, opts);
            if (s.liquidLiquid && s.x.size() == thermo.n() && s.y.size() == thermo.n()
                && std::fabs(s.x[i1] - s.y[i1]) > 1.0e-3)
            {
                out.split = true;
                out.xLo = std::min(s.x[i1], s.y[i1]);
                out.xHi = std::max(s.x[i1], s.y[i1]);
                return out;
            }
        }
        catch (const std::exception& e)
        {
            //  ONE liquid in the package is a property of the CASE, not of a
            //  feed: refuse by name instead of reading it as "no split".
            if (std::string(e.what()).find("needs >= 2 liquid phases") != std::string::npos)
                throw std::runtime_error(std::string(WHO) + ": the case's"
                    " thermophysicalPropertySystem carries ONE liquid phase, and the"
                    " tie-line residual asks the liquid-liquid flash, which needs"
                    " two.  Declare them as binary01_lle_water_nbutanol does:"
                    " `equilibrium { formulation gammaGamma; liquid { activityModel"
                    " { ... } } liquidPhases ( { name liquid1; } { name liquid2; } );"
                    " vapour { fugacityModel idealGas; } }` (both liquids share the"
                    " one activity model, so the pair being fitted is one number).");
            /* any other failure: a feed with no answer -- try the next */
        }
    }
    return out;
}

scalar row(const ThermoPackage& thermo, const Rows& r, std::size_t k,
           std::size_t i1, std::size_t i2, const sVector* weights)
{
    const std::size_t j = k - r.first;
    const std::size_t t = j / 2;
    const bool hi = (j % 2) == 1;
    if (!hi || !s_cache.valid || s_cache.tie != t)
    {
        s_cache.b = solveTie(thermo, r.ties[t].T, r.ties[t].xLo, r.ties[t].xHi, i1, i2);
        s_cache.tie = t;
        s_cache.valid = true;
    }
    if (!s_cache.b.split) return penalty;
    const scalar meas  = hi ? r.ties[t].xHi : r.ties[t].xLo;
    const scalar model = hi ? s_cache.b.xHi : s_cache.b.xLo;
    return (model - meas) * (weights ? (*weights)[k] : 1.0);
}

void requireSplitAtStart(const Rows& r, const sVector& res)
{
    if (!r.active()) return;
    std::size_t nBad = 0;
    for (std::size_t t = 0; t < r.ties.size(); ++t)
        if (std::fabs(res[r.first + 2 * t]) >= 9.99e2) ++nBad;
    if (nBad == r.ties.size())
        throw std::runtime_error(std::string(WHO) + ": at the STARTING parameters"
            " the model predicts ONE liquid at all " + std::to_string(nBad)
            + " measured tie line(s).  The penalty for a missing split is flat,"
              " so the search has no gradient to follow and would not move.  A"
              " start that splits nothing cannot locate the gap: begin from"
              " parameters that predict a split (a literature pair, or a hand"
              " choice with the right sign of the interaction) -- an ideal"
              " start (all zero) never does.");
    if (nBad > 0)
        std::cerr << "[fitParameters] LLE: at the starting parameters the model"
                     " leaves " << nBad << " of " << r.ties.size()
                  << " measured tie line(s) as ONE liquid (penalised rows); the"
                     " fit proceeds on the others.\n";
}

Stats statsOf(const Rows& r, const sVector& u)
{
    Stats s;
    s.ties = r.ties.size();
    std::size_t n = 0;
    scalar sum = 0.0;
    for (std::size_t t = 0; t < r.ties.size(); ++t)
    {
        const scalar a = u[r.first + 2 * t], b = u[r.first + 2 * t + 1];
        if (std::fabs(a) >= 9.99e2 || std::fabs(b) >= 9.99e2) { ++s.penalisedTies; continue; }
        sum += std::fabs(a) + std::fabs(b);
        n += 2;
        s.maxAbs = std::max(s.maxAbs, std::max(std::fabs(a), std::fabs(b)));
    }
    s.aad = n ? sum / static_cast<scalar>(n) : 0.0;
    return s;
}

Stats heldOut(const ThermoPackage& thermo, const Rows& r, std::size_t i1,
              std::size_t i2, int verbosity, scalar band)
{
    Stats s;
    s.ties = r.ties.size();
    scalar sum = 0.0;
    std::size_t n = 0;
    for (const auto& t : r.ties)
    {
        const Binodal b = solveTie(thermo, t.T, t.xLo, t.xHi, i1, i2);
        if (!b.split)
        {
            ++s.penalisedTies;
            std::cerr << "[fitParameters] LLE held-out: at T = " << t.T
                      << " K two liquids were MEASURED (x = " << t.xLo << " | "
                      << t.xHi << ") and the fitted model predicts ONE.\n";
            continue;
        }
        const scalar da = std::fabs(b.xLo - t.xLo), db = std::fabs(b.xHi - t.xHi);
        sum += da + db;
        n += 2;
        s.maxAbs = std::max(s.maxAbs, std::max(da, db));
        if (verbosity >= 3)
            std::cout << "      [LLE held-out] T = " << t.T << " K  measured "
                      << t.xLo << " | " << t.xHi << "  model " << b.xLo << " | "
                      << b.xHi << "\n";
    }
    s.aad = n ? sum / static_cast<scalar>(n) : 0.0;
    //  THE HELD-OUT TIE LINES, in words: a tie line the model leaves ONE
    //  liquid was named above and is a MISS of the verdict, never a skip.
    if (verbosity >= 2)
        std::cout << "\n  HELD-OUT TIE LINES\n"
                  << "    tie lines   " << s.ties << "   (one liquid predicted at "
                  << s.penalisedTies << ")\n"
                  << "    AAD         " << std::fixed << std::setprecision(5)
                  << s.aad << "   (mole fraction, band " << band
                  << " declared before the fit)\n";
    return s;
}

void publish(std::map<std::string, scalar>& diag, const Rows& fit,
             const sVector& u)
{
    if (!fit.active()) return;
    const Stats s = statsOf(fit, u);
    diag["lle_n_ties"]            = static_cast<scalar>(s.ties);
    diag["lle_penalised_ties"]    = static_cast<scalar>(s.penalisedTies);
    diag["lle_aad_dx"]            = s.aad;
    diag["lle_max_abs_dx"]        = s.maxAbs;
    if (s.penalisedTies > 0)
        std::cerr << "[fitParameters] LLE: " << s.penalisedTies << " of "
                  << s.ties << " fit tie line(s) are ONE liquid in the fitted"
                     " model (penalised rows, excluded from the statistics).\n";
}

void publishHeldOut(std::map<std::string, scalar>& diag, const Stats& held)
{
    diag["lle_n_ties_heldout"]         = static_cast<scalar>(held.ties);
    diag["lle_penalised_ties_heldout"] = static_cast<scalar>(held.penalisedTies);
    diag["lle_aad_dx_heldout"]         = held.aad;
}

void requireBands(const EvidencePartition& part, bool bubbleHeldOut, bool lleHeldOut)
{
    if (lleHeldOut && !part.hasLleBand())
        throw std::runtime_error(std::string(WHO) + ": a held-out tie-line"
            " dataset is declared and `acceptance { maxLLE <x>; }` is not.  The"
            " band for the binodal (mean absolute deviation of the mole"
            " fractions) must be declared BEFORE the fit like `maxAAD`; with"
            " none the held-out deviation would be reported with no verdict"
            " and could be read as agreement.");
    if (bubbleHeldOut && !part.hasAcceptance())
        return;   // the bubble rule's own heldOutPerformed, unchanged
}

std::string verdict(const EvidencePartition& part, const std::string& bubbleVerdict,
                    bool bubbleHeldOut, bool lleHeldOut, const Stats& held)
{
    if (!lleHeldOut) return bubbleVerdict;
    //  the binodal band, and a missing split is a miss, named by the run
    const bool lleOk = held.penalisedTies == 0 && held.aad <= part.lleBand();
    if (!lleOk) return "notValidated";
    if (!bubbleHeldOut) return "validated";   // the band declared for the binodal alone
    return bubbleVerdict;
}

PublishedTable fitPointsTable(const ThermoPackage& thermo, const Rows& r,
                              std::size_t i1, std::size_t i2)
{
    PublishedTable tab;
    tab.name = "fitPointsLLE";
    tab.description = "one row per tie line: the measured binodal compositions"
                      " and the fitted ones (NaN where the model leaves one liquid)";
    tab.columns.push_back({ "tie", "-" });
    tab.columns.push_back({ "T_K", "K" });
    tab.columns.push_back({ "x_lo_measured", "-" });
    tab.columns.push_back({ "x_lo_model", "-" });
    tab.columns.push_back({ "x_hi_measured", "-" });
    tab.columns.push_back({ "x_hi_model", "-" });
    std::size_t k = 0;
    for (const auto& t : r.ties)
    {
        const Binodal b = solveTie(thermo, t.T, t.xLo, t.xHi, i1, i2);
        const scalar nan = std::nan("");
        tab.rows.push_back({ static_cast<scalar>(++k), t.T, t.xLo,
                             b.split ? b.xLo : nan, t.xHi, b.split ? b.xHi : nan });
    }
    return tab;
}

std::string recordBlock(const EvidencePartition& part, const Rows& fit,
                        const Stats& inSample, const Stats* held, scalar band)
{
    if (!fit.active()) return {};
    scalar tlo = 1e30, thi = -1e30;
    for (const auto& t : fit.ties) { tlo = std::min(tlo, t.T); thi = std::max(thi, t.T); }
    std::ostringstream os;
    os << std::fixed;
    os << "\n    //  LIQUID-LIQUID EVIDENCE (DEV.md 4c C226): this pair was regressed\n"
          "    //  to measured binodal compositions as well as bubble temperatures,\n"
          "    //  and DECLARES that it splits the liquid.  The band was declared\n"
          "    //  before the fit; bin/curate/check_regressed_pairs.py (arm f) holds\n"
          "    //  the equation to the measured tie lines of the evidence.\n"
          "    liquidLiquid true;\n"
          "    gap\n    {\n"
       << "        ties         " << fit.ties.size() << ";\n"
       << std::setprecision(2)
       << "        T            { min " << tlo << " K; max " << thi << " K; }\n"
       << std::setprecision(6)
       << "        band_dx      " << band << ";   // mole fraction, mean |dx|, declared before the fit\n"
       << "        sigma_dx     " << fit.sigma << ";   // the weight of the tie-line rows\n";
    if (held && held->ties > 0)
        os << "        aad_dx       " << held->aad << ";   // HELD-OUT tie lines\n"
           << "        heldOutTies  " << held->ties << ";\n"
           << "        basis        heldOut;\n";
    else
        os << "        aad_dx       " << inSample.aad << ";   // IN-SAMPLE: no tie line was held out\n"
           << "        heldOutTies  0;\n"
           << "        basis        inSample;\n";
    os << "    }\n";
    (void)part;
    return os.str();
}

}  // namespace lle
}  // namespace Choupo
