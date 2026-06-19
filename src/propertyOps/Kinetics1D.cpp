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

#include "Kinetics1D.H"
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

namespace {

// ---------------------------------------------------------------------------
//  A kinetics dataset reduced to SI columns (T [K], time [s], c [kmol/m^3]).
//  T is optional -- present only for a multi-isotherm set (the Arrhenius fit).
// ---------------------------------------------------------------------------
struct KineticData
{
    std::vector<scalar> T, t, c;
    bool hasT = false;
};

// Convert one value tagged with a named unit to canonical SI (affine units
// -- degC/degF -- route through affineToK).  Mandatory: an unknown / missing
// unit on a dataset column is an error (the glass-box discipline).
scalar convUnit(scalar v, const std::string& unit)
{
    auto spec = units::lookupUnit(unit);
    if (!spec)
        throw std::runtime_error(
            "kinetics dataset: unknown / missing unit '" + unit
            + "' on a column (declare a real unit, e.g. K, s, mol/L)");
    return spec->affine ? units::affineToK(v, unit) : v * spec->factor;
}

// Read a kinetics dataset.  Two formats:
//   (new, self-describing, units MANDATORY)
//      columns ( { name T; unit K; role independent; }
//                { name time; unit s; role independent; }
//                { name c_AcOH; unit mol/L; role dependent; } );
//      data ( <grid of bare numbers, row-major, in the column units> );
//   (legacy, flat)  data ( time c time c ... )   -- no T, taken as-is.
KineticData readKineticDataset(const std::string& path)
{
    KineticData kd;
    auto ds = Dictionary::fromFile(path);
    auto flat = ds->lookupList("data");

    if (ds->found("columns"))
    {
        auto cols = ds->lookupDictList("columns");
        const std::size_t nc = cols.size();
        if (nc < 2)
            throw std::runtime_error("kinetics dataset: need >= 2 columns");
        if (flat.empty() || flat.size() % nc != 0)
            throw std::runtime_error(
                "kinetics dataset: data length is not a multiple of the column count");

        std::vector<std::string> unit(nc);
        int iT = -1, iTime = -1, iC = -1;
        for (std::size_t j = 0; j < nc; ++j)
        {
            const std::string name = cols[j]->lookupWord("name");
            unit[j] = cols[j]->lookupWord("unit");            // MANDATORY
            const std::string role = cols[j]->lookupWordOrDefault("role", "");
            if      (name == "T" || name == "temperature")        iT = static_cast<int>(j);
            else if (name == "time" || name == "t")               iTime = static_cast<int>(j);
            if (role == "dependent")                              iC = static_cast<int>(j);
        }
        // Fallback: if no column was tagged `role dependent`, the last
        // non-(T,time) column is the measured concentration.
        if (iC < 0)
            for (std::size_t j = 0; j < nc; ++j)
                if (static_cast<int>(j) != iT && static_cast<int>(j) != iTime) iC = static_cast<int>(j);
        if (iTime < 0 || iC < 0)
            throw std::runtime_error(
                "kinetics dataset: need a `time` column and a dependent (concentration) column");

        const std::size_t rows = flat.size() / nc;
        for (std::size_t r = 0; r < rows; ++r)
        {
            kd.t.push_back(convUnit(flat[r * nc + iTime], unit[iTime]));
            kd.c.push_back(convUnit(flat[r * nc + iC],    unit[iC]));
            if (iT >= 0)
                kd.T.push_back(convUnit(flat[r * nc + static_cast<std::size_t>(iT)],
                                        unit[static_cast<std::size_t>(iT)]));
        }
        kd.hasT = (iT >= 0);
    }
    else
    {
        // Legacy flat (time, c) pairs -- single isotherm, values taken as-is.
        if (flat.empty() || flat.size() % 2 != 0)
            throw std::runtime_error("kinetics dataset: flat `data` must be an even list");
        for (std::size_t k = 0; k + 1 < flat.size(); k += 2)
        { kd.t.push_back(flat[k]); kd.c.push_back(flat[k + 1]); }
    }
    return kd;
}

// Closed-form integrated rate law c(t; k) for an nth-order single reactant.
scalar cOfTfor(int order, scalar c0, scalar tt, scalar kk)
{
    if      (order == 0) return std::max(c0 - kk * tt, 0.0);
    else if (order == 2) return c0 / (1.0 + kk * c0 * tt);
    else                 return c0 * std::exp(-kk * tt);   // order 1 (default)
}

// Fit k > 0 minimising the c-scale SSE for one isotherm: linearised
// through-origin seed, refined by golden-section (1-D, no derivative).
scalar fitRateConstant(int order, scalar c0,
                       const std::vector<scalar>& t, const std::vector<scalar>& c)
{
    scalar Sxy = 0.0, Sxx = 0.0;
    for (std::size_t i = 0; i < t.size(); ++i)
    {
        scalar y;
        if      (order == 0) y = c0 - c[i];
        else if (order == 2) y = 1.0 / c[i] - 1.0 / c0;
        else                 y = -std::log(c[i] / c0);
        Sxy += t[i] * y;  Sxx += t[i] * t[i];
    }
    const scalar seed = (Sxx > 0.0) ? std::max(Sxy / Sxx, 1e-12) : 1e-4;
    auto sse = [&](scalar kk) -> scalar
    {
        scalar s = 0.0;
        for (std::size_t i = 0; i < t.size(); ++i)
        { const scalar r = cOfTfor(order, c0, t[i], kk) - c[i]; s += r * r; }
        return s;
    };
    scalar a = std::max(seed / 50.0, 1e-15), b = seed * 50.0;
    const scalar gr = 0.6180339887498949;
    scalar c1 = b - gr * (b - a), d1 = a + gr * (b - a);
    scalar f1 = sse(c1), f2 = sse(d1);
    for (int it = 0; it < 100; ++it)
    {
        if (f1 < f2) { b = d1; d1 = c1; f2 = f1; c1 = b - gr * (b - a); f1 = sse(c1); }
        else         { a = c1; c1 = d1; f1 = f2; d1 = a + gr * (b - a); f2 = sse(d1); }
    }
    return 0.5 * (a + b);
}

} // namespace

int Kinetics1D::run(const DictPtr& dict,
                    const ThermoPackage& /*thermo*/,
                    int verbosity)
{
    // -- rate law: order + initial concentration --------------------------
    auto rate = dict->subDict("rate");
    const int order = static_cast<int>(rate->lookupScalar("order"));
    scalar c0;
    if (rate->found("c0"))                          c0 = rate->lookupScalar("c0");
    else if (dict->found("state") && dict->subDict("state")->found("c0"))
                                                    c0 = dict->subDict("state")->lookupScalar("c0");
    else throw std::runtime_error("kinetics1D: need an initial concentration c0 (in rate{} or state{})");

    const std::string comp = dict->lookupWordOrDefault("component", "");
    const std::string col  = comp.empty() ? "concentration" : "c_" + comp;
    auto out = dict->subDict("output");
    const std::string outFile = out->lookupWord("file");

    // -- lab data (if any) ------------------------------------------------
    KineticData kd;
    if (dict->found("dataset"))
    {
        try { kd = readKineticDataset(dict->lookupWord("dataset")); }
        catch (const std::exception& ex)
        { std::cerr << "  kinetics1D: dataset load skipped (" << ex.what() << ")\n"; }
    }

    // -- which parameters does the op ask us to FIT? ----------------------
    std::vector<std::string> fitList;
    if (dict->found("fit")) fitList = dict->lookupWordList("fit");
    auto wants = [&](const std::string& p)
    { return std::find(fitList.begin(), fitList.end(), p) != fitList.end(); };
    const bool wantArrhenius = wants("Ea") || wants("k0");

    // distinct temperatures present in the data
    std::vector<scalar> temps;
    if (kd.hasT)
        for (scalar T : kd.T)
        {
            bool seen = false;
            for (scalar u : temps) if (std::abs(u - T) < 1e-6) seen = true;
            if (!seen) temps.push_back(T);
        }
    std::sort(temps.begin(), temps.end());

    // =====================================================================
    //  ARRHENIUS FIT  --  multi-isotherm -> k0, Ea  (the generalisation)
    //  Per temperature: fit k(T) on that isotherm.  Then the Arrhenius line
    //  ln k = ln k0 - (Ea/R)(1/T) by linear least squares.  Ea comes out of
    //  the SLOPE -- which is exactly what the student should SEE.
    // =====================================================================
    if (wantArrhenius && temps.size() >= 2)
    {
        std::vector<scalar> Tj, kj, invT, lnk;
        for (scalar T : temps)
        {
            std::vector<scalar> tt, cc;
            for (std::size_t i = 0; i < kd.T.size(); ++i)
                if (std::abs(kd.T[i] - T) < 1e-6) { tt.push_back(kd.t[i]); cc.push_back(kd.c[i]); }
            if (tt.size() < 2) continue;
            const scalar k = fitRateConstant(order, c0, tt, cc);
            Tj.push_back(T); kj.push_back(k); invT.push_back(1.0 / T); lnk.push_back(std::log(k));
        }
        if (invT.size() < 2)
            throw std::runtime_error(
                "kinetics1D: Arrhenius fit needs >= 2 temperatures each with >= 2 points");

        const std::size_t M = invT.size();
        scalar sx = 0, sy = 0, sxx = 0, sxy = 0;
        for (std::size_t i = 0; i < M; ++i)
        { sx += invT[i]; sy += lnk[i]; sxx += invT[i] * invT[i]; sxy += invT[i] * lnk[i]; }
        const scalar den = static_cast<scalar>(M) * sxx - sx * sx;
        const scalar b = (static_cast<scalar>(M) * sxy - sx * sy) / den;   // slope = -Ea/R
        const scalar a = (sy - b * sx) / static_cast<scalar>(M);           // intercept = ln k0
        const scalar Ea = -b * constant::R;     // J/mol  (R in J/(mol·K))
        const scalar k0 = std::exp(a);

        scalar meanY = sy / static_cast<scalar>(M), ssTot = 0, ssRes = 0;
        for (std::size_t i = 0; i < M; ++i)
        {
            const scalar pred = a + b * invT[i];
            ssRes += (lnk[i] - pred) * (lnk[i] - pred);
            ssTot += (lnk[i] - meanY) * (lnk[i] - meanY);
        }
        const scalar R2 = (ssTot > 0.0) ? (1.0 - ssRes / ssTot) : 0.0;

        // Output a RICH long-format CSV the GUI plots two ways (toggle):
        //   c-t isotherms -- the smooth fitted curve c(t) per T (grid) + the raw
        //     data points (c_data filled only at measured times);
        //   Arrhenius     -- the per-T k_T (constant within each T block) gives
        //     ln k vs 1/T.  One file feeds both views; nothing is hidden.
        scalar tmax = 0.0;
        for (scalar tt : kd.t) tmax = std::max(tmax, tt);
        scalar tFrom = 0.0, tTo = tmax;
        std::size_t ng = 61;
        if (dict->found("time"))
        {
            auto tb = dict->subDict("time");
            tFrom = tb->lookupScalarOrDefault("from", 0.0);
            tTo   = tb->lookupScalar("to");
            ng    = tb->found("n") ? static_cast<std::size_t>(tb->lookupScalar("n")) : 61;
        }
        if (ng < 2) ng = 2;

        std::ofstream csv(outFile);
        if (!csv.is_open())
            throw std::runtime_error("kinetics1D: cannot open '" + outFile + "'");
        csv << "T_K,time,c_fit,c_data,k_T\n";
        for (std::size_t j = 0; j < Tj.size(); ++j)
        {
            const scalar T = Tj[j], k = kj[j];
            // smooth fitted curve on the time grid (c_data left empty)
            for (std::size_t i = 0; i < ng; ++i)
            {
                const scalar tt = tFrom + (tTo - tFrom) * static_cast<scalar>(i)
                                                        / static_cast<scalar>(ng - 1);
                csv << T << "," << tt << "," << cOfTfor(order, c0, tt, k) << ",," << k << "\n";
            }
            // raw data points for this isotherm (c_data filled)
            for (std::size_t i = 0; i < kd.T.size(); ++i)
                if (std::abs(kd.T[i] - T) < 1e-6)
                    csv << T << "," << kd.t[i] << "," << cOfTfor(order, c0, kd.t[i], k)
                        << "," << kd.c[i] << "," << k << "\n";
        }

        diag_.clear();
        diag_["order"]          = static_cast<scalar>(order);
        diag_["fitted"]         = 1.0;
        diag_["arrhenius"]      = 1.0;
        diag_["n_temps"]        = static_cast<scalar>(M);
        diag_["Ea"]             = Ea;            // J/mol
        diag_["Ea_kJ_per_mol"]  = Ea / 1000.0;
        diag_["k0"]             = k0;
        diag_["R2"]             = R2;
        if (verbosity >= 2)
            std::cout << "  Kinetics1D: ARRHENIUS fit (order " << order << ", "
                      << M << " temperatures): Ea = " << Ea / 1000.0
                      << " kJ/mol, k0 = " << k0 << ", R2 = " << R2 << "\n";
        return 0;
    }
    // Asked for Arrhenius but the data cannot support it -> honest hard error
    // (a single isotherm fixes one point on the ln k vs 1/T line, never a slope).
    if (wantArrhenius && temps.size() < 2)
        throw std::runtime_error(
            "kinetics1D: `fit ( k0 Ea )` (Arrhenius) needs data at >= 2 temperatures "
            "-- a `T` column with >= 2 distinct values.  This dataset has "
            + std::to_string(temps.size())
            + ".  Add isotherms, or drop the Arrhenius fit and fit a single k(T).");

    // =====================================================================
    //  SINGLE-ISOTHERM: forward model (k declared) OR fit k from the data.
    // =====================================================================
    auto t = dict->subDict("time");
    const scalar t0 = t->lookupScalarOrDefault("from", 0.0);
    const scalar t1 = t->lookupScalar("to");
    const std::size_t n = t->found("n")
        ? static_cast<std::size_t>(t->lookupScalar("n")) : 51;
    if (n < 2) throw std::runtime_error("kinetics1D: time.n must be >= 2");

    scalar k;
    bool fitted = false;
    if (rate->found("k"))
        k = rate->lookupScalar("k");
    else if (rate->found("k0"))
    {
        const scalar k0 = rate->lookupScalar("k0");
        const scalar Ea = rate->lookupScalar("Ea");
        const scalar T  = rate->lookupScalar("T");
        k = k0 * std::exp(-Ea / (constant::R * T));
    }
    else
    {
        if (kd.t.size() < 2)
            throw std::runtime_error(
                "kinetics1D: to FIT k the op must name a `dataset` with >= 2 points; "
                "otherwise declare `k` (forward model).");
        k = fitRateConstant(order, c0, kd.t, kd.c);
        fitted = true;
    }

    std::ofstream csv(outFile);
    if (!csv.is_open())
        throw std::runtime_error("kinetics1D: cannot open '" + outFile + "'");
    csv << "time," << col << "\n";
    for (std::size_t i = 0; i < n; ++i)
    {
        const scalar tt = t0 + (t1 - t0) * static_cast<scalar>(i)
                                         / static_cast<scalar>(n - 1);
        csv << tt << "," << cOfTfor(order, c0, tt, k) << "\n";
    }
    if (verbosity >= 2)
        std::cout << "  Kinetics1D: wrote " << n << " rows (order " << order
                  << ", " << (fitted ? "FITTED k = " : "k = ") << k << ") to '"
                  << outFile << "'\n";

    diag_.clear();
    diag_["n_points"] = static_cast<scalar>(n);
    diag_["order"]    = static_cast<scalar>(order);
    diag_["k"]        = k;
    diag_["fitted"]   = fitted ? 1.0 : 0.0;

    // Residuals + R^2 against the lab data (the auditable evidence).
    if (!kd.t.empty())
    {
        const std::size_t N = kd.t.size();
        scalar chi2 = 0.0, maxAbs = 0.0, sumC = 0.0;
        for (std::size_t i = 0; i < N; ++i) sumC += kd.c[i];
        const scalar meanC = sumC / static_cast<scalar>(N);
        scalar ssTot = 0.0;
        for (std::size_t i = 0; i < N; ++i)
        {
            const scalar r = cOfTfor(order, c0, kd.t[i], k) - kd.c[i];
            chi2  += r * r;
            maxAbs = std::max(maxAbs, std::abs(r));
            ssTot += (kd.c[i] - meanC) * (kd.c[i] - meanC);
        }
        diag_["chi2"]          = chi2;
        diag_["rms"]           = std::sqrt(chi2 / static_cast<scalar>(N));
        diag_["n_data"]        = static_cast<scalar>(N);
        diag_["max_abs_resid"] = maxAbs;
        diag_["R2"]            = (ssTot > 0.0) ? (1.0 - chi2 / ssTot) : 0.0;
        if (verbosity >= 2)
            std::cout << "    " << (fitted ? "least-squares fit" : "forward model")
                      << " vs '" << dict->lookupWord("dataset")
                      << "': RMS = " << std::sqrt(chi2 / static_cast<scalar>(N))
                      << ", R2 = " << diag_["R2"] << " (" << N << " pts)\n";
    }
    return 0;
}

} // namespace Choupo
