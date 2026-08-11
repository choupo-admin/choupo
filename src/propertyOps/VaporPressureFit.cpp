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
#include "core/Constants.H"
#include "core/Dictionary.H"
#include "core/Units.H"

#include <algorithm>
#include <cmath>
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
    part.announce(label, verbosity);

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
    const scalar sse = solveAtC(C, A, B);

    scalar ybar = 0; for (scalar v : y) ybar += v; ybar /= static_cast<scalar>(y.size());
    scalar ssTot = 0; for (scalar v : y) ssTot += (v - ybar) * (v - ybar);
    const scalar R2 = (ssTot > 0.0) ? 1.0 - sse / ssTot : 0.0;

    // Clausius–Clapeyron dHvap with the (T+C) correction, at the highest T.
    const scalar dHvap = constant::R * std::log(10.0) * B
                       * (Tmax / (Tmax + C)) * (Tmax / (Tmax + C));   // J/mol

    // -- output: T, Psat_data, Psat_fit (bar) -------------------------------
    std::ofstream csv(dict->subDict("output")->lookupWord("file"));
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

        if (verbosity >= 2)
        {
            std::cout << "    HELD-OUT VALIDATION (" << Tv.size()
                      << " pts, " << Tvmin << "-" << Tvmax << " K): AAD "
                      << aad_v << " %, RMS " << rms_v << " in log10(P)\n";
            //  A caller-side independence fact: the partition class settles
            //  identity, the caller has the numbers and settles domain.
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

    diag_["A"]               = A;
    diag_["B"]               = B;
    diag_["C"]               = C;
    diag_["R2"]              = R2;
    diag_["n_points"]        = static_cast<scalar>(T.size());
    diag_["dHvap_kJ_per_mol"] = dHvap / 1000.0;

    if (verbosity >= 2)
        std::cout << "  VaporPressureFit (" << comp << ", " << T.size() << " pts):\n"
                  << "    Antoine  log10(Psat[bar]) = " << A << " - " << B
                  << "/(T" << (C >= 0 ? "+" : "") << C << ")   R2 = " << R2 << "\n"
                  << "    Clausius-Clapeyron dHvap(" << Tmax << " K) = "
                  << dHvap / 1000.0 << " kJ/mol\n";
    return 0;
}

} // namespace Choupo
