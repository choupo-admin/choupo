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
    The declared objective of `fitParameters` and the minimax search.  See
    FitObjective.H for the grammar and the reasoning.

    THE SEARCH is a plain Nelder-Mead simplex (reflection 1, expansion 2,
    contraction 1/2, shrink 1/2) on f(p) = max_k |scaled residual_k|, inside
    the parameter box (a vertex is clamped to its bounds, as the
    Levenberg-Marquardt step is).  The first vertex is the start point, so
    the returned answer can only be as good or better.  A simplex that has
    collapsed is RESTARTED around its best vertex (up to four times) until a
    restart no longer lowers the maximum by a part in a million: a
    max-function has ridges, and one pass of the simplex stops on them.
\*---------------------------------------------------------------------------*/

#include "FitObjective.H"
#include "LleResidual.H"

#include <algorithm>
#include <cmath>
#include <functional>
#include <iomanip>
#include <iostream>
#include <map>
#include <numeric>
#include <sstream>
#include <stdexcept>

namespace Choupo {
namespace fitobj {

namespace {

//  The op whose objective is being read names the refusal: `vaporPressureFit`
//  for `kind Psat` (DEV.md 4c C281 step 3), `fitParameters` for every other.
std::string WHO = "fitParameters(objective)";

[[noreturn]] void refuse(const std::string& m)
{
    throw std::runtime_error(WHO + ": " + m);
}

void requireKeys(const DictPtr& d, const std::vector<std::string>& allowed,
                 const std::string& where)
{
    for (const auto& k : d->keys())
        if (std::find(allowed.begin(), allowed.end(), k) == allowed.end())
        {
            std::string list;
            for (const auto& a : allowed) list += (list.empty() ? "" : ", ") + a;
            refuse("`" + where + "` has no entry `" + k + "`; the entries are: "
                   + list + ".");
        }
}

}  // namespace

std::string methodName(Method m)
{
    switch (m)
    {
        case Method::leastSquares: return "leastSquares";
        case Method::minimax:      return "minimax";
        default:                   return "twoStage";
    }
}

Spec read(const DictPtr& dict, const std::string& kind, bool evalMode)
{
    WHO = (kind == "Psat") ? "vaporPressureFit(objective)" : "fitParameters(objective)";
    Spec s;
    if (evalMode)
    {
        if (dict->found("objective"))
            refuse("`objective` is a FIT entry; mode evaluate scores a pair and"
                   " minimises nothing.");
        s.method = Method::leastSquares;
        return s;
    }
    if (!dict->found("objective")) return s;     // the defaults: twoStage, T absolute, composition relative
    s.declared = true;
    auto o = dict->subDict("objective");
    requireKeys(o, {"method", "scale", "maxEvaluations"}, "objective");
    const std::string m = o->lookupWordOrDefault("method", "twoStage");
    if (m == "leastSquares")      s.method = Method::leastSquares;
    else if (m == "minimax")      s.method = Method::minimax;
    else if (m == "twoStage")     s.method = Method::twoStage;
    else refuse("`objective.method " + m + ";` is not built.  The methods are"
                " leastSquares, minimax and twoStage.");
    if (o->found("maxEvaluations"))
    {
        const scalar n = o->lookupScalar("maxEvaluations");
        if (!(n >= 10.0 && n <= 1.0e6))
            refuse("`objective.maxEvaluations` = " + std::to_string(n)
                   + " -- an integer from 10 to 1000000.");
        s.maxEvaluations = static_cast<int>(n);
    }
    if (kind == "Psat")
    {
        //  vaporPressureFit: ONE residual, the pressure, judged RELATIVE to the
        //  measured value.  The temperature is the op's independent variable and
        //  carries no residual, so there is no T scale to declare.
        if (o->found("scale"))
        {
            auto sc = o->subDict("scale");
            requireKeys(sc, {"Psat"}, "objective.scale");
            s.pSat = sc->lookupWordOrDefault("Psat", s.pSat);
            if (s.pSat != "relative")
                refuse("`scale { Psat " + s.pSat + "; }` is not built: the vapour-"
                       "pressure residual is relative, (P_model - P)/P, by design"
                       " (one series spans orders of magnitude in P).");
        }
        return s;
    }
    if (o->found("scale"))
    {
        auto sc = o->subDict("scale");
        requireKeys(sc, {"T_bubble", "P_bubble", "binodal"}, "objective.scale");
        s.tBubble = sc->lookupWordOrDefault("T_bubble", s.tBubble);
        s.pBubble = sc->lookupWordOrDefault("P_bubble", s.pBubble);
        s.binodal = sc->lookupWordOrDefault("binodal", s.binodal);
        for (const std::string* w : {&s.tBubble, &s.pBubble, &s.binodal})
            if (*w != "absolute" && *w != "relative")
                refuse("a `scale` is `absolute` or `relative`, not `" + *w + "`.");
        if (s.tBubble != "absolute")
            refuse("`scale { T_bubble relative; }` is not built: a temperature is"
                   " judged in kelvin, and a relative temperature would not match"
                   " the 1/U weights of `weighting uncertainty`.");
        if (s.pBubble != "relative")
            refuse("`scale { P_bubble absolute; }` is not built: the bubble-"
                   "pressure residual is relative, by design (one isotherm spans"
                   " orders of magnitude in P).");
        if (kind == "T_bubble" && sc->found("binodal"))
            refuse("`scale { binodal ... }` belongs to `kind T_bubble+LLE;` (this"
                   " fit has no tie lines).");
    }
    s.binodalRelative = (s.binodal == "relative");
    return s;
}

void requireLeastSquares(const DictPtr& dict, const std::string& kind)
{
    if (!dict->found("objective")) return;
    auto o = dict->subDict("objective");
    const std::string m = o->lookupWordOrDefault("method", "leastSquares");
    if (m != "leastSquares")
        refuse("`kind " + kind + ";` keeps its own least-squares search; `objective"
               " { method " + m + "; }` is not built for it.  Declare `method"
               " leastSquares;` or delete the block.");
    if (o->found("scale"))
        refuse("`kind " + kind + ";` has its own residual scale; `objective.scale`"
               " is not read by it.");
}

std::string describe(const Spec& s, const std::string& kind)
{
    std::ostringstream os;
    os << "  Objective:   " << methodName(s.method)
       << (s.declared ? "" : "   (the default)") << "\n";
    switch (s.method)
    {
        case Method::leastSquares:
            os << "                sum of squared scaled residuals (Levenberg-Marquardt)\n"; break;
        case Method::minimax:
            os << "                largest scaled residual, max|r| (Nelder-Mead, from the declared start)\n"; break;
        default:
            os << "                1) sum of squares (Levenberg-Marquardt), 2) largest scaled residual,"
                  " max|r| (Nelder-Mead from the stage-1 answer); both answers kept\n";
    }
    if (kind == "Psat")
    {
        //  vaporPressureFit's stage 1 is its own linear-in-(A, B) search on
        //  log10 P, said here so the header does not claim Levenberg-Marquardt
        os.str("");
        os << "  Objective:   " << methodName(s.method)
           << (s.declared ? "" : "   (the default: no `objective {}` block declared)") << "\n";
        switch (s.method)
        {
            case Method::leastSquares:
                os << "                sum of squared residuals in log10(P) (golden-section C,"
                      " linear A, B)\n"; break;
            case Method::minimax:
                os << "                largest relative residual, max|(P_model - P)/P|"
                      " (Nelder-Mead, from the log10 least-squares answer as its start)\n"; break;
            default:
                os << "                1) sum of squared residuals in log10(P) (golden-section C,"
                      " linear A, B), 2) largest relative residual, max|(P_model - P)/P|"
                      " (Nelder-Mead from the stage-1 answer); both answers kept\n";
        }
        os << "  Scale:       Psat " << s.pSat << "  ((P_model - P)/P; T is the"
              " independent variable, no T residual)\n";
        return os.str();
    }
    if (kind == "P_bubble")
        os << "  Scale:       P_bubble " << s.pBubble << "  ((P_model - P)/P)\n";
    else
    {
        os << "  Scale:       T_bubble " << s.tBubble << "  (kelvin)";
        if (kind == "T_bubble+LLE")
            os << ",  binodal " << s.binodal
               << (s.binodalRelative ? "  ((x_model - x)/x, over sigmaRelative)"
                                     : "  (x_model - x, over sigma)");
        os << "\n";
    }
    return os.str();
}

scalar maxAbs(const sVector& r)
{
    scalar m = 0.0;
    for (const scalar v : r) m = std::max(m, std::fabs(v));
    return m;
}

namespace {

sVector clampTo(sVector x, const sVector& lo, const sVector& hi)
{
    for (std::size_t j = 0; j < x.size(); ++j) x[j] = std::clamp(x[j], lo[j], hi[j]);
    return x;
}

}  // namespace

Outcome minimise(const std::function<scalar(const sVector&)>& f, const sVector& x0,
                 const sVector& lo, const sVector& hi, int maxEvaluations,
                 int verbosity)
{
    const std::size_t n = x0.size();
    Outcome out;
    out.ran = true;
    int evals = 0;
    auto eval = [&](const sVector& x) { ++evals; return f(x); };

    sVector best = clampTo(x0, lo, hi);
    scalar  fBest = eval(best);
    out.before = fBest;

    for (int pass = 0; pass < 5 && evals < maxEvaluations; ++pass)
    {
        //  the simplex: the best vertex so far and n neighbours, each moved by 5 % of
        //  its own magnitude (at least 0.05) -- the size the parameters are quoted to
        std::vector<sVector> v(n + 1, best);
        sVector fv(n + 1, fBest);
        for (std::size_t j = 0; j < n; ++j)
        {
            const scalar step = 0.05 * std::max(std::fabs(best[j]), 1.0);
            v[j + 1][j] = best[j] + step;
            if (v[j + 1][j] > hi[j]) v[j + 1][j] = best[j] - step;
            v[j + 1] = clampTo(v[j + 1], lo, hi);
            fv[j + 1] = eval(v[j + 1]);
        }
        while (evals < maxEvaluations)
        {
            std::vector<std::size_t> idx(n + 1);
            std::iota(idx.begin(), idx.end(), std::size_t(0));
            std::sort(idx.begin(), idx.end(),
                      [&](std::size_t a, std::size_t b) { return fv[a] < fv[b]; });
            std::vector<sVector> v2; sVector f2;
            for (auto i : idx) { v2.push_back(v[i]); f2.push_back(fv[i]); }
            v = v2; fv = f2;
            scalar size = 0.0;
            for (std::size_t j = 0; j < n; ++j)
            {
                scalar mn = v[0][j], mx = v[0][j];
                for (const auto& w : v) { mn = std::min(mn, w[j]); mx = std::max(mx, w[j]); }
                size = std::max(size, (mx - mn) / std::max(std::fabs(v[0][j]), 1.0));
            }
            if (size < 1.0e-7 && (fv[n] - fv[0]) < 1.0e-9 * (1.0 + fv[0])) break;

            sVector c(n, 0.0);
            for (std::size_t i = 0; i < n; ++i)
                for (std::size_t j = 0; j < n; ++j) c[j] += v[i][j] / static_cast<scalar>(n);
            auto along = [&](scalar t) {
                sVector x(n);
                for (std::size_t j = 0; j < n; ++j) x[j] = c[j] + t * (v[n][j] - c[j]);
                return clampTo(x, lo, hi);
            };
            const sVector xr = along(-1.0);
            const scalar  fr = eval(xr);
            if (fr < fv[0])
            {
                const sVector xe = along(-2.0);
                const scalar  fe = eval(xe);
                if (fe < fr) { v[n] = xe; fv[n] = fe; } else { v[n] = xr; fv[n] = fr; }
            }
            else if (fr < fv[n - 1]) { v[n] = xr; fv[n] = fr; }
            else
            {
                const bool outside = fr < fv[n];
                const sVector xc = along(outside ? -0.5 : 0.5);
                const scalar  fc = eval(xc);
                if (fc < (outside ? fr : fv[n])) { v[n] = xc; fv[n] = fc; }
                else
                    for (std::size_t i = 1; i <= n; ++i)
                    {
                        for (std::size_t j = 0; j < n; ++j)
                            v[i][j] = v[0][j] + 0.5 * (v[i][j] - v[0][j]);
                        v[i] = clampTo(v[i], lo, hi);
                        fv[i] = eval(v[i]);
                    }
            }
        }
        std::size_t ib = 0;
        for (std::size_t i = 1; i <= n; ++i) if (fv[i] < fv[ib]) ib = i;
        const scalar fNew = fv[ib];
        const bool improved = fNew < fBest * (1.0 - 1.0e-6);
        if (fNew <= fBest) { best = v[ib]; fBest = fNew; }
        if (verbosity >= 2)
            std::cout << "    minimax pass " << (pass + 1) << ": max|r| = " << std::scientific
                      << std::setprecision(5) << fBest << "   (" << evals << " evaluations)\n";
        if (!improved) break;
        ++out.restarts;
    }
    out.x = best;
    out.after = fBest;
    out.evaluations = evals;
    return out;
}

void publish(std::map<std::string, scalar>& diag, const Spec& s,
             const sVector& ls, const sVector& fin, const Outcome& o)
{
    diag["objective_method"]    = static_cast<scalar>(s.method == Method::leastSquares ? 0
                                  : s.method == Method::minimax ? 1 : 2);   // 0 leastSquares, 1 minimax, 2 twoStage
    diag["objective_binodal_relative"] = s.binodalRelative ? 1.0 : 0.0;
    if (!o.ran) return;
    diag["minimax_max_scaled_start"]  = o.before;
    diag["minimax_max_scaled_final"]  = o.after;
    diag["minimax_evaluations"]       = static_cast<scalar>(o.evaluations);
    for (std::size_t i = 0; i < fin.size(); ++i)
    {
        diag["fit." + std::to_string(i) + ".value_leastSquares"] = ls[i];
        diag["fit." + std::to_string(i) + ".value_minimax"]      = fin[i];
    }
}

void publishBubble(std::map<std::string, scalar>& diag, const std::string& tag,
                   const sVector& u)
{
    scalar sum = 0.0, mx = 0.0;
    std::size_t n = 0;
    for (const scalar v : u)
    {
        if (std::fabs(v) >= 9.99e2) continue;
        sum += std::fabs(v);
        mx = std::max(mx, std::fabs(v));
        ++n;
    }
    diag["bubble_aad_" + tag] = n ? sum / static_cast<scalar>(n) : 0.0;
    diag["bubble_max_" + tag] = mx;
}

void printReport(std::ostream& os, const Spec& s, const std::string& unit,
                 const std::map<std::string, scalar>& diag,
                 const lle::Stats* fitLle, const lle::Stats* heldLle,
                 bool bubbleHeldOut, const std::vector<DatasetError>& heldBubble)
{
    auto get = [&](const char* k) { auto i = diag.find(k); return i == diag.end() ? 0.0 : i->second; };
    os << "\n  ERROR REPORT   (objective " << methodName(s.method) << ")\n";
    const bool P = (unit != "K");
    os << std::fixed << std::setprecision(P ? 4 : 3);
    os << "    bubble " << (P ? "pressure, RELATIVE (P_model - P)/P" : "temperature, ABSOLUTE")
       << "   mean " << get("bubble_aad_fit") << "  max " << get("bubble_max_fit")
       << (P ? "" : " K") << "   (fit set)\n";
    if (bubbleHeldOut)
        os << "    bubble " << (P ? "pressure, RELATIVE" : "temperature, ABSOLUTE")
           << "   mean " << get("bubble_aad_heldout") << "  max " << get("bubble_max_heldout")
           << (P ? "" : " K") << "   (held out)\n";
    if (heldBubble.size() > 1)
        for (const auto& d : heldBubble)
            os << "      held-out bubble set " << d.name << "  (" << d.n << " points)  mean "
               << d.mean << "  max " << d.max << (P ? "" : " K") << "\n";
    if (fitLle) lle::printBranches(os, *fitLle, "tie-line compositions, fit set:");
    if (heldLle && heldLle->ties > 0) lle::printBranches(os, *heldLle, "tie-line compositions, held out:");
    if (get("minimax_evaluations") > 0)
        os << "    stage 2 (minimax): the largest scaled residual went from "
           << std::scientific << std::setprecision(4) << get("minimax_max_scaled_start") << " to "
           << get("minimax_max_scaled_final") << " in " << static_cast<int>(get("minimax_evaluations"))
           << " evaluations; the least-squares answer is kept beside it (fit.<i>.value_leastSquares)\n";
}

}  // namespace fitobj
}  // namespace Choupo
