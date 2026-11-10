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

#include "VaporPressureFit.H"
#include "EvidencePartition.H"
#include "CurationDossier.H"
#include "FitObjective.H"
#include "core/Constants.H"
#include "core/Dictionary.H"
#include "core/Units.H"

#include "thermo/RecordResolver.H"
#include <algorithm>
#include <cmath>
#include <sstream>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {


int VaporPressureFit::run(const DictPtr& dict,
                          const ThermoPackage& /*thermo*/,
                          int verbosity)
{
    diag_.clear();
    const std::string comp = dict->lookupWordOrDefault("component", "");

    // -- THE EVIDENCE PARTITION, frozen before a single point is fitted ----
    //  The fitter below is handed `T`/`y`, which are built from the FIT
    //  datasets only.  It is not forbidden to touch the held-out points; it
    //  is never given them.
    const std::string label = "vaporPressureFit" + (comp.empty() ? "" : " (" + comp + ")");
    const auto part = EvidencePartition::read(dict, label);
    //  the band judges the RELATIVE held-out AAD; another unit is refused
    //  before the fit (DEV.md 4c C172)
    part.requireBandInUnitOf(HeldOutStatistic::relativeAAD(), label);
    part.announce(label, verbosity);

    //  THE OBJECTIVE (DEV.md 4c C281 step 3): the SAME declared block as
    //  `fitParameters`, read through its one home (FitObjective) -- default
    //  twoStage, the pressure residual relative.  Read before the fit, and the
    //  header says which objective produced the numbers below.
    const fitobj::Spec objSpec = fitobj::read(dict, "Psat", /*evalMode*/ false);
    if (verbosity >= 1) std::cout << fitobj::describe(objSpec, "Psat");

    const std::vector<std::string> xN{ "T", "temperature" };
    const std::vector<std::string> yN{ "Psat", "P", "psat" };

    //  A point is admissible when Psat > 0 -- log10 needs it.  Applied
    //  identically to both roles, because a filter that differs between them
    //  would make the held-out comparison measure the filter.
    auto admissible = [](const std::vector<EvidencePoint>& raw,
                         std::vector<scalar>& T, std::vector<scalar>& y)
    {
        for (const auto& pt : raw)
        {
            if (pt.y <= 0.0) continue;                       // P in Pa
            T.push_back(pt.x);
            y.push_back(std::log10(pt.y / units::bar_to_Pa));
        }
    };

    std::vector<scalar> T, y;                                 // y = log10(Psat[bar])
    admissible(EvidencePartition::loadAll(part.fit(), xN, yN, label), T, y);

    std::vector<scalar> Tv, yv;                               // held-out
    admissible(EvidencePartition::loadAll(part.validation(), xN, yN, label), Tv, yv);
    part.requireNonEmptyValidation(Tv.size(), label);

    if (T.size() < 3)
        throw std::runtime_error(label + ": need >= 3 admissible (T, Psat)"
            " fitting points; got " + std::to_string(T.size()) + ".");

    scalar Tmin = 1e30, Tmax = 0.0;
    for (scalar t : T) { Tmin = std::min(Tmin, t); Tmax = std::max(Tmax, t); }

    // -- fit log10(P) = A − B/(T+C): linear (A,B) for fixed C, golden-section C -
    auto solveAtC = [&](scalar C, scalar& A, scalar& B) -> scalar
    {
        scalar su = 0, sy = 0, suu = 0, suy = 0; const scalar n = static_cast<scalar>(T.size());
        for (std::size_t i = 0; i < T.size(); ++i)
        {
            const scalar u = 1.0 / (T[i] + C);
            su += u; sy += y[i]; suu += u * u; suy += u * y[i];
        }
        const scalar denom = suu - su * su / n;
        const scalar m = (denom != 0.0) ? (suy - su * sy / n) / denom : 0.0;  // slope y vs u = -B
        B = -m; A = sy / n - m * su / n;
        scalar sse = 0.0;
        for (std::size_t i = 0; i < T.size(); ++i)
        {
            const scalar yh = A - B / (T[i] + C);
            sse += (y[i] - yh) * (y[i] - yh);
        }
        return sse;
    };
    // C must keep (T+C) > 0 for every point; search below Tmin.
    scalar Clo = -(Tmin) + 5.0, Chi = 300.0;
    const scalar gr = 0.6180339887498949;
    scalar a = Clo, b = Chi, A1 = 0, B1 = 0, A2 = 0, B2 = 0;
    scalar c1 = b - gr * (b - a), d1 = a + gr * (b - a);
    scalar f1 = solveAtC(c1, A1, B1), f2 = solveAtC(d1, A2, B2);
    for (int it = 0; it < 120; ++it)
    {
        if (f1 < f2) { b = d1; d1 = c1; f2 = f1; c1 = b - gr * (b - a); f1 = solveAtC(c1, A1, B1); }
        else         { a = c1; c1 = d1; f1 = f2; d1 = a + gr * (b - a); f2 = solveAtC(d1, A2, B2); }
    }
    scalar C = 0.5 * (a + b), A = 0, B = 0;
    solveAtC(C, A, B);

    //  relative pressure residual of a curve at one point, (P_model - P)/P
    auto relAt = [](scalar Aa, scalar Bb, scalar Cc, scalar t, scalar ylog)
    { return std::pow(10.0, (Aa - Bb / (t + Cc)) - ylog) - 1.0; };
    auto relStats = [&](scalar Aa, scalar Bb, scalar Cc, const std::vector<scalar>& Ts,
                        const std::vector<scalar>& ys, scalar& mean, scalar& mx)
    {
        mean = 0.0; mx = 0.0;
        for (std::size_t i = 0; i < Ts.size(); ++i)
        {
            const scalar r = std::abs(relAt(Aa, Bb, Cc, Ts[i], ys[i]));
            mean += r; mx = std::max(mx, r);
        }
        if (!Ts.empty()) mean /= static_cast<scalar>(Ts.size());
    };

    //  STAGE 2 (twoStage / minimax): the largest RELATIVE pressure residual
    //  over the FIT points, minimised by the one minimax search in
    //  FitObjective, started from the least-squares answer above.  The held-out
    //  points are never handed to it.
    //
    //  THE SEARCH COORDINATES.  (A, B, C) are almost collinear over one
    //  laboratory's range -- a long, narrow valley in which the simplex crawls
    //  and stops on the valley floor still descending (measured on curate33:
    //  1500 evaluations left the maximum 0.6 % above where 4700 put it, and the
    //  held-out AAD moved from 7.5 % to 9.4 % between the two).  So the search
    //  moves the curve's own log10 P at three temperatures of the fit range
    //  (its ends and its middle), which are nearly independent, and maps them
    //  back to (A, B, C) in closed form (three-point Antoine).  The objective
    //  and the answer are the same curve; only the coordinates differ.  A trial
    //  whose curve leaves T + C > 0 on a fit point is infeasible.
    const sVector lsV{ A, B, C };
    fitobj::Outcome obj2;
    if (objSpec.runsMinimax())
    {
        const scalar t1 = Tmin, t3 = Tmax, t2 = 0.5 * (Tmin + Tmax);
        auto toABC = [&](const sVector& v, scalar& Aa, scalar& Bb, scalar& Cc) -> bool
        {
            const scalar d12 = v[0] - v[1], d23 = v[1] - v[2];
            if (!(std::abs(d23) > 0.0)) return false;
            const scalar r = d12 / d23;
            const scalar den = r * (t2 - t3) - (t1 - t2);
            if (!(std::abs(den) > 0.0)) return false;
            Cc = ((t1 - t2) * t3 - r * (t2 - t3) * t1) / den;
            if (!(t1 + Cc > 0.0)) return false;
            Bb = d12 * (t1 + Cc) * (t2 + Cc) / (t1 - t2);
            Aa = v[0] + Bb / (t1 + Cc);
            return std::isfinite(Aa) && std::isfinite(Bb) && std::isfinite(Cc);
        };
        auto f = [&](const sVector& v)
        {
            scalar Aa, Bb, Cc;
            if (!toABC(v, Aa, Bb, Cc)) return 1.0e30;
            scalar m = 0.0;
            for (std::size_t i = 0; i < T.size(); ++i)
            {
                const scalar r = std::abs(relAt(Aa, Bb, Cc, T[i], y[i]));
                if (!std::isfinite(r)) return 1.0e30;
                m = std::max(m, r);
            }
            return m;
        };
        const sVector v0{ A - B / (t1 + C), A - B / (t2 + C), A - B / (t3 + C) };
        sVector lo(3), hi(3);
        for (int k = 0; k < 3; ++k) { lo[k] = v0[k] - 0.5; hi[k] = v0[k] + 0.5; }   // a factor ~3 in P
        if (verbosity >= 2)
            std::cout << "  Stage 2:     minimising the largest relative pressure residual,"
                         " max|(P_model - P)/P|, from the least-squares answer\n"
                         "               (searching log10 P at " << t1 << ", " << t2 << " and "
                      << t3 << " K; mapped back to A, B, C)\n";
        obj2 = fitobj::minimise(f, v0, lo, hi, objSpec.maxEvaluations, verbosity);
        scalar Aa, Bb, Cc;
        if (toABC(obj2.x, Aa, Bb, Cc)) { A = Aa; B = Bb; C = Cc; }
    }
    scalar sse = 0.0;
    for (std::size_t i = 0; i < T.size(); ++i)
    {
        const scalar yh = A - B / (T[i] + C);
        sse += (y[i] - yh) * (y[i] - yh);
    }
    {
        //  both answers kept (fit.<i>.value_leastSquares / value_minimax, i = A, B, C)
        fitobj::publish(diag_, objSpec, lsV, sVector{ A, B, C }, obj2);
        scalar m = 0.0, x = 0.0;
        relStats(A, B, C, T, y, m, x);
        diag_["relErr_mean_fit_pct"] = 100.0 * m;
        diag_["relErr_max_fit_pct"]  = 100.0 * x;
        if (obj2.ran)
        {
            relStats(lsV[0], lsV[1], lsV[2], T, y, m, x);
            diag_["relErr_mean_fit_pct_leastSquares"] = 100.0 * m;
            diag_["relErr_max_fit_pct_leastSquares"]  = 100.0 * x;
        }
    }

    scalar ybar = 0; for (scalar v : y) ybar += v; ybar /= static_cast<scalar>(y.size());
    scalar ssTot = 0; for (scalar v : y) ssTot += (v - ybar) * (v - ybar);
    const scalar R2 = (ssTot > 0.0) ? 1.0 - sse / ssTot : 0.0;

    // Clausius–Clapeyron dHvap with the (T+C) correction, at the highest T.
    const scalar dHvap = constant::R * std::log(10.0) * B
                       * (Tmax / (Tmax + C)) * (Tmax / (Tmax + C));   // J/mol

    // -- output: T, Psat_data, Psat_fit (bar) -------------------------------
    const std::string outFile_ = dict->subDict("output")->lookupWord("file");
    records::refuseStandardsWrite("vaporPressureFit", "file", outFile_);
    std::ofstream csv(outFile_);
    csv << "T_K,Psat_data,Psat_fit\n";   // Psat in canonical SI (Pa); GUI display-converts
    std::vector<std::size_t> order(T.size());
    for (std::size_t i = 0; i < T.size(); ++i) order[i] = i;
    std::sort(order.begin(), order.end(), [&](std::size_t i, std::size_t j) { return T[i] < T[j]; });
    for (std::size_t k : order)
        csv << T[k] << "," << std::pow(10.0, y[k]) * units::bar_to_Pa << ","
            << std::pow(10.0, A - B / (T[k] + C)) * units::bar_to_Pa << "\n";

    // -- HELD-OUT VALIDATION, on evidence the fit above never saw ----------
    //  The four quantities this operation can report are kept APART on
    //  purpose: the in-sample R2 says how well the model reproduces what it
    //  was given; the held-out statistics say whether it survives evidence it
    //  never saw.  Merging them into one "good fit" number is exactly the
    //  claim this contract exists to prevent.
    if (part.engaged() && !Tv.empty())
    {
        scalar sse_v = 0.0, aad = 0.0;
        for (std::size_t i = 0; i < Tv.size(); ++i)
        {
            const scalar r = yv[i] - (A - B / (Tv[i] + C));       // in log10(bar)
            sse_v += r * r;
            aad   += std::abs(std::pow(10.0, -r) - 1.0);          // relative in P
        }
        const scalar rms_v = std::sqrt(sse_v / static_cast<scalar>(Tv.size()));
        const scalar aad_v = 100.0 * aad / static_cast<scalar>(Tv.size());

        scalar Tvmin = 1e30, Tvmax = 0.0;
        for (scalar t : Tv) { Tvmin = std::min(Tvmin, t); Tvmax = std::max(Tvmax, t); }
        const bool overlaps = !(Tvmax < Tmin || Tvmin > Tmax);

        diag_["n_heldout"]          = static_cast<scalar>(Tv.size());
        diag_["rms_heldout_log10P"] = rms_v;
        diag_["aad_heldout_pct"]    = aad_v;
        {
            scalar m = 0.0, x = 0.0;
            relStats(A, B, C, Tv, yv, m, x);
            diag_["relErr_max_heldout_pct"] = 100.0 * x;
            if (obj2.ran)
            {
                //  the least-squares answer, held out on the same points: what
                //  the second stage bought (or cost) on evidence it never saw
                relStats(lsV[0], lsV[1], lsV[2], Tv, yv, m, x);
                diag_["aad_heldout_pct_leastSquares"]    = 100.0 * m;
                diag_["relErr_max_heldout_pct_leastSquares"] = 100.0 * x;
            }
        }

        if (verbosity >= 2)
        {
            std::cout << "    HELD-OUT VALIDATION (" << Tv.size()
                      << " pts, " << Tvmin << "-" << Tvmax << " K): AAD "
                      << aad_v << " %, max " << diag_["relErr_max_heldout_pct"]
                      << " % (relative in P), RMS " << rms_v << " in log10(P)\n";
            if (obj2.ran)
                std::cout << "      (the stage-1 least-squares answer on the same points: AAD "
                          << diag_["aad_heldout_pct_leastSquares"] << " %, max "
                          << diag_["relErr_max_heldout_pct_leastSquares"] << " %)\n";
            //  A caller-side independence fact: the partition class settles
            //  identity, the caller has the numbers and settles domain.
            //  THE VERDICT, said out loud -- but only against a band the
            //  case declared BEFORE the fit.  With no band the run reports
            //  the residuals and claims nothing, which is honest rather than
            //  incomplete.
            if (part.hasAcceptance())
                std::cout << "    -> "
                          << (aad_v <= part.acceptanceMaxAADPct()
                                ? "VALIDATED" : "NOT VALIDATED")
                          << " against the pre-declared band (maxAAD "
                          << part.acceptanceMaxAADPct() << " %)\n"
                          << "       band origin: " << part.acceptanceOrigin()
                          << "\n";
            else
                std::cout << "    -> held-out validation PERFORMED; no"
                             " acceptance band was declared, so no verdict is"
                             " claimed on these residuals.\n";
            if (overlaps)
                std::cout << "      [independence] the held-out temperature"
                             " range OVERLAPS the fitted one -- interpolation,"
                             " not extrapolation.  A finding for the reviewer,"
                             " not an error.\n";
        }
    }
    else if (part.validationRefused())
    {
        //  R1.  The chi-square below is IN-SAMPLE and is labelled so; it is
        //  not an external validation and must never be presented as one.
        std::cout << "    VALIDATION REFUSED:\n"
                  << "    No independent experimental evidence remains after"
                     " fitting.\n"
                  << "    R2 = " << R2 << " is IN-SAMPLE (the model reproducing"
                     " the very points it was fitted to).\n";
        diag_["n_heldout"] = 0.0;
    }

    // -- THE CURATION DOSSIER.  Evidence semantics, not runtime data: it
    //  lands in <case>/curation/, which no resolver root reaches.
    {
        CurationDossier::PropertyRecord rec;
        rec.property   = "vapourPressure";
        rec.opName     = dict->lookupWordOrDefault("name", "vaporPressureFit");
        rec.opType     = "vaporPressureFit";
        rec.model      = "Antoine  log10(Psat[bar]) = A - B/(T + C)";
        rec.parameters = { {"A", A}, {"B", B}, {"C", C} };
        rec.engaged     = part.engaged();
        rec.fingerprint = part.fingerprint();
        rec.fitSets        = part.fit();
        rec.validationSets = part.validation();
        rec.fitMin = Tmin; rec.fitMax = Tmax; rec.domainUnit = "K";
        rec.nFit   = T.size();
        rec.r2InSample = R2;
        rec.heldOut = part.engaged() && !Tv.empty();
        if (rec.heldOut)
        {
            scalar lo = 1e30, hi = 0.0;
            for (scalar t : Tv) { lo = std::min(lo, t); hi = std::max(hi, t); }
            rec.valMin = lo; rec.valMax = hi; rec.nValidation = Tv.size();
            rec.rmsHeldOut    = diag_["rms_heldout_log10P"];
            rec.rmsUnit       = "log10(P)";
            rec.aadHeldOutPct = diag_["aad_heldout_pct"];
        }
        rec.hasAcceptance   = part.hasAcceptance();
        rec.acceptMaxAADPct = part.acceptanceMaxAADPct();
        rec.acceptOrigin    = part.acceptanceOrigin();
        rec.verdict = CurationDossier::verdictOf(part, rec.heldOut,
                                                 rec.aadHeldOutPct);

    //  THE CURATION AXIS reaches the machine channel (2026-09-04).  The
    //  verdict this op computes went to the console and the curation dossier
    //  and stopped there; the result JSON carried its numbers and not its
    //  judgement, so no golden could pin it and the GUI could not show it.
    //  Kept beside the dossier record so the two cannot say different words.
    curation_["verdict"] = rec.verdict;
    if (part.engaged())
    {
        curation_["partitionFingerprint"] = part.fingerprint();
        if (part.hasAcceptance())
        {
            std::ostringstream ab;
            ab << part.acceptanceMaxAADPct();
            curation_["acceptanceMaxAADPct"] = ab.str();
            curation_["acceptanceOrigin"]    = part.acceptanceOrigin();
            curation_["acceptanceUnit"]      = part.acceptanceUnit();   // the band's own word (C172)
        }
        else
            curation_["acceptanceMaxAADPct"] = "none declared before the fit";
    }
        if (part.validationRefused())
            rec.refusal = "No independent experimental evidence remains after fitting.";
        CurationDossier::instance().add(comp, std::move(rec));
    }

    diag_["A"]               = A;
    diag_["B"]               = B;
    diag_["C"]               = C;
    diag_["R2"]              = R2;
    diag_["n_points"]        = static_cast<scalar>(T.size());
    diag_["dHvap_kJ_per_mol"] = dHvap / 1000.0;

    if (verbosity >= 2)
        std::cout << "  VaporPressureFit (" << comp << ", " << T.size() << " pts):\n"
                  << "    Antoine  log10(Psat[bar]) = " << A << " - " << B
                  << "/(T" << (C >= 0 ? "+" : "") << C << ")   R2 = " << R2
                  << "   (objective " << fitobj::methodName(objSpec.method) << ")\n"
                  << "    fit set: relative error in P mean " << diag_["relErr_mean_fit_pct"]
                  << " %, max " << diag_["relErr_max_fit_pct"] << " %"
                  << (obj2.ran ? "  (least squares alone: mean "
                                 + std::to_string(diag_["relErr_mean_fit_pct_leastSquares"])
                                 + " %, max "
                                 + std::to_string(diag_["relErr_max_fit_pct_leastSquares"]) + " %)"
                               : std::string())
                  << "\n"
                  << "    Clausius-Clapeyron dHvap(" << Tmax << " K) = "
                  << dHvap / 1000.0 << " kJ/mol\n";
    return 0;
}

} // namespace Choupo
