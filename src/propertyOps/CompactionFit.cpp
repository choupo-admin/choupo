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

#include "CompactionFit.H"
#include "FitAlgebra.H"
#include "CompactionLaws.H"   // the two curves, forward and inverse: ONE home (C270)

#include "core/Dimensions.H"
#include "core/Dictionary.H"
#include "thermo/RecordResolver.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <functional>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

namespace {

constexpr scalar kPi = 3.14159265358979323846;

//  A self-describing dataset: `columns ( { name; unit; } ... )` + a flat
//  `data ( ... )` grid -- the experiments grammar every props bench reads.
//  Units are CHECKED against what this bench reads and nothing is converted:
//  a column in another unit refuses, naming the unit expected.
struct Dataset
{
    std::string path;
    std::vector<std::string> name, unit;
    std::vector<scalar> flat;
    std::size_t nc = 0, nRows = 0;

    int col(const std::string& nm, const std::string& u,
            const std::string& site) const
    {
        for (std::size_t c = 0; c < nc; ++c)
            if (name[c] == nm)
            {
                if (unit[c] != u)
                    throw std::runtime_error(site + ": dataset '" + path
                        + "' column '" + nm + "' declares unit '" + unit[c]
                        + "'; this bench reads it in " + u + " and converts"
                          " nothing -- declare the column in that unit");
                return static_cast<int>(c);
            }
        return -1;
    }
    scalar at(std::size_t r, int c) const { return flat[r * nc + std::size_t(c)]; }
};

Dataset readDataset(std::string path, const std::string& site)
{
    if (path.size() < 4 || path.substr(path.size() - 4) != ".dat") path += ".dat";
    DictPtr ds = Dictionary::fromFile(path);
    Dataset d;
    d.path = path;
    const auto cols = ds->lookupDictList("columns");
    d.flat = ds->lookupList("data");
    d.nc = cols.size();
    if (d.nc == 0 || d.flat.empty() || d.flat.size() % d.nc != 0)
        throw std::runtime_error(site + ": dataset '" + path + "' -- "
            + std::to_string(d.flat.size()) + " values do not fill rows of "
            + std::to_string(d.nc) + " columns");
    d.nRows = d.flat.size() / d.nc;
    for (const auto& c : cols)
    {
        d.name.push_back(c->lookupWord("name"));
        if (!c->found("unit"))
            throw std::runtime_error(site + ": dataset '" + path + "' column '"
                + d.name.back() + "' declares no unit (use '-' for a"
                  " dimensionless column)");
        d.unit.push_back(c->lookupWord("unit"));
    }
    return d;
}

//  Ordinary least squares on a straight line y = m x + q, with the
//  standard errors of both coefficients.  Nothing more: every model below
//  is fitted on the line its authors wrote, so the arithmetic is the one a
//  student can repeat in a spreadsheet.
struct Line
{
    scalar m = 0, q = 0, R2 = 0, se_m = 0, se_q = 0, rss = 0;
    std::size_t n = 0;
};

Line fitLine(const std::vector<scalar>& x, const std::vector<scalar>& y)
{
    Line L;
    L.n = x.size();
    const scalar n = static_cast<scalar>(x.size());
    scalar sx = 0, sy = 0;
    for (std::size_t i = 0; i < x.size(); ++i) { sx += x[i]; sy += y[i]; }
    const scalar xb = sx / n, yb = sy / n;
    scalar sxx = 0, sxy = 0, syy = 0;
    for (std::size_t i = 0; i < x.size(); ++i)
    {
        sxx += (x[i] - xb) * (x[i] - xb);
        sxy += (x[i] - xb) * (y[i] - yb);
        syy += (y[i] - yb) * (y[i] - yb);
    }
    if (sxx <= 0.0)
        throw std::runtime_error("compactionFit: every point in the window has"
            " the same abscissa -- a line through them is undetermined");
    L.m = sxy / sxx;
    L.q = yb - L.m * xb;
    for (std::size_t i = 0; i < x.size(); ++i)
    {
        const scalar r = y[i] - (L.m * x[i] + L.q);
        L.rss += r * r;
    }
    L.R2 = (syy > 0.0) ? 1.0 - L.rss / syy : 1.0;
    const scalar s2 = L.rss / (n - 2.0);
    L.se_m = std::sqrt(s2 / sxx);
    L.se_q = std::sqrt(s2 * (1.0 / n + xb * xb / sxx));
    return L;
}

//  THE POINT-COUNT RULE, one home for all three models.
void requirePoints(std::size_t nIn, const std::string& site,
                   const std::string& window)
{
    if (nIn == 0)
        throw std::runtime_error(site + ": the declared window " + window
            + " holds NO point of the dataset -- nothing to fit.  Check the"
              " window against the dataset's own range (the window is the"
              " case's declaration, never chosen by the op).");
    if (nIn < 4)
        throw std::runtime_error(site + ": the declared window " + window
            + " holds " + std::to_string(nIn) + " point(s); a two-parameter"
              " line needs at least parameters + 2 = 4, so that the residuals"
              " carry at least two degrees of freedom.  Widen the window or"
              " take a dataset with more pressures.");
}

std::string fmt(const char* f, double v)
{
    char b[64];
    std::snprintf(b, sizeof(b), f, v);
    return b;
}

std::string datasetOf(const DictPtr& block, const DictPtr& op,
                      const std::string& site)
{
    if (block->found("dataset")) return block->lookupWord("dataset");
    if (op->found("dataset"))    return op->lookupWord("dataset");
    throw std::runtime_error(site + ": no `dataset` -- declare one on the op"
        " or inside this model's block");
}

//  Relative density of every row, from whichever density column the
//  dataset carries (exactly one).
std::vector<scalar> relativeDensity(const Dataset& d, const DictPtr& op,
                                    const std::string& site, std::string& basis)
{
    const int cD   = d.col("D", "-", site);
    const int cEps = d.col("porosity", "-", site);
    const int cRho = d.col("density", "g/cm3", site);
    const int nDecl = (cD >= 0) + (cEps >= 0) + (cRho >= 0);
    if (nDecl != 1)
        throw std::runtime_error(site + ": dataset '" + d.path + "' must carry"
            " EXACTLY ONE of `D` [-] (relative density), `porosity` [-] or"
            " `density` [g/cm3] (with the op's `trueDensity`); it carries "
            + std::to_string(nDecl));
    std::vector<scalar> D(d.nRows);
    scalar rhoTrue = 0.0;
    if (cRho >= 0)
    {
        if (!op->found("trueDensity"))
            throw std::runtime_error(site + ": the dataset gives the compact's"
                " `density`; declare the material's `trueDensity` (e.g."
                " `trueDensity 1.59 g/cm3;`, helium pycnometry, with its"
                " source) so D = density / trueDensity");
        rhoTrue = op->lookupScalar("trueDensity", Dims::density) / 1000.0;   // g/cm3
        basis = "D = density / trueDensity (" + fmt("%.4g", rhoTrue) + " g/cm3)";
    }
    else if (cEps >= 0) basis = "D = 1 - porosity";
    else                basis = "D as tabulated";
    for (std::size_t r = 0; r < d.nRows; ++r)
        D[r] = (cD >= 0) ? d.at(r, cD)
             : (cEps >= 0) ? 1.0 - d.at(r, cEps)
             : d.at(r, cRho) / rhoTrue;
    return D;
}

void readWindow(const DictPtr& b, const std::string& site, scalar& lo, scalar& hi)
{
    if (!b->found("Pmin") || !b->found("Pmax"))
        throw std::runtime_error(site + ": declare the pressure window `Pmin"
            " <p> MPa; Pmax <p> MPa;` -- the region the model is fitted on is"
            " the case's declaration, never chosen silently by the op");
    lo = b->lookupScalar("Pmin", Dims::pressure) / 1.0e6;
    hi = b->lookupScalar("Pmax", Dims::pressure) / 1.0e6;
    if (!(hi > lo))
        throw std::runtime_error(site + ": Pmax must exceed Pmin");
}

//  THE FITTED CURVE OVER THE POINTS IT WAS FITTED ON, and nowhere else: a
//  line drawn across the whole dataset would show the model where the case
//  declared it does NOT hold (the curved ends of a Heckel plot).  21 points
//  between the smallest and largest abscissa inside the window.
PublishedTable fittedCurve(const std::string& name, const std::string& what,
                           const PublishedTable::Column& xc,
                           const PublishedTable::Column& yc,
                           const std::vector<scalar>& xin,
                           const std::function<scalar(scalar)>& f)
{
    PublishedTable t;
    t.name = name;
    t.description = what;
    t.columns = { xc, yc };
    const scalar lo = *std::min_element(xin.begin(), xin.end());
    const scalar hi = *std::max_element(xin.begin(), xin.end());
    for (int i = 0; i <= 20; ++i)
    {
        const scalar xv = lo + (hi - lo) * scalar(i) / 20.0;
        t.rows.push_back({ xv, f(xv) });
    }
    return t;
}

} // namespace

std::string CompactionFit::diagnosticUnit(const std::string& key) const
{
    auto ends = [&](const char* s)
    {
        const std::string t(s);
        return key.size() >= t.size()
            && key.compare(key.size() - t.size(), t.size(), t) == 0;
    };
    if (ends("_pct")) return "%";
    if (ends("_MPa")) return "MPa";
    if (ends("_perMPa")) return "1/MPa";
    return "-";
}

int CompactionFit::run(const DictPtr& dict, const ThermoPackage& /*thermo*/,
                       int verbosity)
{
    diag_.clear();
    tables_.clear();
    const std::string opName = dict->lookupWordOrDefault("name", "compactionFit");
    const std::string material = dict->lookupWordOrDefault("material", "(material not named)");
    const std::string site = "compactionFit '" + opName + "'";
    DictPtr reported = dict->found("reported") ? dict->subDict("reported") : nullptr;

    if (!dict->found("heckel") && !dict->found("kawakita") && !dict->found("ryshkewitch"))
        throw std::runtime_error(site + ": declare at least one model block --"
            " `heckel {}`, `kawakita {}` or `ryshkewitch {}`");

    std::cout << "\n========  Compaction bench: " << material << "  ========\n"
              << "  ONE material, fitted on the straight line each model's authors"
                 " wrote (ordinary least\n  squares).  A blend is NOT an excipient:"
                 " no mixture rule is implemented, so these numbers\n  stand in"
                 " for the formulation only as far as this material dominates it.\n";

    //  The paper's own value beside the fitted one: printed and published,
    //  never used to tune anything.
    auto compare = [&](const std::string& key, const std::string& diagKey,
                       scalar fitted, const Dimensions* dims, scalar toUnit,
                       const std::string& unit)
    {
        if (!reported || !reported->found(key)) return;
        const scalar v = dims ? reported->lookupScalar(key, *dims) * toUnit
                              : reported->lookupScalar(key);
        diag_["paper_" + diagKey] = v;
        const scalar dev = (v != 0.0) ? 100.0 * (fitted - v) / v : 0.0;
        diag_["dev_" + diagKey + "_pct"] = dev;
        std::cout << "      " << key << ": fitted " << fmt("%.4g", fitted) << " "
                  << unit << "   the source reports " << fmt("%.4g", v) << " "
                  << unit << "   (" << fmt("%+.1f", dev) << " %)\n";
    };
    (void)verbosity;

    // ===================================================================
    //  HECKEL
    // ===================================================================
    if (dict->found("heckel"))
    {
        const DictPtr b = dict->subDict("heckel");
        const std::string s = site + " heckel";
        const Dataset d = readDataset(datasetOf(b, dict, s), s);
        const int cP = d.col("P", "MPa", s);
        if (cP < 0) throw std::runtime_error(s + ": dataset '" + d.path + "' has no `P` [MPa] column");
        std::string basis;
        const std::vector<scalar> D = relativeDensity(d, dict, s, basis);
        scalar lo, hi;
        readWindow(b, s, lo, hi);
        const std::string win = "[" + fmt("%g", lo) + ", " + fmt("%g", hi) + "] MPa";
        std::vector<scalar> x, y;
        for (std::size_t r = 0; r < d.nRows; ++r)
        {
            const scalar P = d.at(r, cP);
            if (P < lo || P > hi) continue;
            if (!(D[r] > 0.0 && D[r] < 1.0))
                throw std::runtime_error(s + ": row " + std::to_string(r + 1)
                    + " has relative density " + fmt("%g", D[r]) + " inside the"
                      " window; ln(1/(1 - D)) needs 0 < D < 1");
            x.push_back(P);
            y.push_back(compactionLaw::heckelOrdinate(D[r]));
        }
        requirePoints(x.size(), s, win);
        const Line L = fitLine(x, y);
        const scalar t = fitAlgebra::tCrit95(static_cast<int>(L.n) - 2);
        const scalar Py = 1.0 / L.m;
        const scalar DA = compactionLaw::heckelInterceptDensity(L.q);
        std::cout << "\n  HECKEL  ln(1/(1 - D)) = K P + A     (Heckel, Trans. Metall. Soc."
                     " AIME 221 (1961) 671-675 and 1001-1008)\n"
                  << "    D the relative density of the compact (" << basis << "), P the"
                     " compaction pressure.\n"
                  << "    Valid only on the LINEAR region, declared by the case: " << win;
        if (b->found("reason")) std::cout << "\n    (" << b->lookupWord("reason") << ")";
        std::cout << "\n    " << L.n << " of " << d.nRows << " points in the window.\n"
                  << "    K  = " << fmt("%.5g", L.m) << " +/- " << fmt("%.2g", t * L.se_m)
                  << " 1/MPa (95 %)    A = " << fmt("%.5g", L.q) << " +/- "
                  << fmt("%.2g", t * L.se_q) << "\n"
                  << "    Py = 1/K = " << fmt("%.4g", Py) << " MPa    D_A = 1 - exp(-A) = "
                  << fmt("%.4g", DA) << "    R2 = " << fmt("%.6f", L.R2) << "\n"
                  << "    Reading Py: a LOW mean yield pressure (well under ~100 MPa) is a"
                     " material that deforms\n    plastically; a HIGH one fragments"
                     " (brittle).  In-die and out-of-die Py differ: the in-die\n    value"
                     " carries the elastic recovery the out-of-die one has already lost.\n";
        diag_["heckel_K_perMPa"] = L.m;
        diag_["heckel_K_ci95_perMPa"] = t * L.se_m;
        diag_["heckel_A"] = L.q;
        diag_["heckel_A_ci95"] = t * L.se_q;
        diag_["heckel_Py_MPa"] = Py;
        diag_["heckel_Py_ci95_MPa"] = Py * (t * L.se_m) / L.m;
        diag_["heckel_DA"] = DA;
        diag_["heckel_R2"] = L.R2;
        diag_["n_heckel"] = static_cast<scalar>(L.n);
        compare("Py", "heckel_Py_MPa", Py, &Dims::pressure, 1.0e-6, "MPa");
        compare("A", "heckel_A", L.q, nullptr, 1.0, "");

        PublishedTable tab;
        tab.name = "heckel";
        tab.description = "every row of the dataset: the pressure, the relative density, the"
                          " Heckel ordinate, the fitted line at that pressure, the residual"
                          " and whether the row is inside the declared window";
        tab.columns = { {"P_MPa", "MPa"}, {"D", "-"}, {"lnInvPorosity", "-"},
                        {"lnInvPorosity_fit", "-"}, {"residual", "-"}, {"inWindow", "-"} };
        std::cout << "      P [MPa]        D     ln(1/(1-D))      fit     residual   window\n";
        for (std::size_t r = 0; r < d.nRows; ++r)
        {
            const scalar P = d.at(r, cP);
            const bool in = (P >= lo && P <= hi);
            const scalar yy = (D[r] > 0.0 && D[r] < 1.0) ? compactionLaw::heckelOrdinate(D[r])
                                                          : std::numeric_limits<scalar>::quiet_NaN();
            const scalar yf = compactionLaw::heckelLine(L.m, L.q, P);
            tab.rows.push_back({ P, D[r], yy, yf, yy - yf, in ? 1.0 : 0.0 });
            char line[160];
            std::snprintf(line, sizeof(line), "    %9.3f  %8.4f  %12.5f  %10.5f  %+10.5f   %s\n",
                          double(P), double(D[r]), double(yy), double(yf), double(yy - yf),
                          in ? "in" : "out");
            std::cout << line;
        }
        tables_.push_back(std::move(tab));
        tables_.push_back(fittedCurve("heckelLine",
            "the fitted Heckel line over the declared window's points only",
            { "P_MPa", "MPa" }, { "lnInvPorosity_fit", "-" }, x,
            [&](scalar P) { return compactionLaw::heckelLine(L.m, L.q, P); }));
    }

    // ===================================================================
    //  KAWAKITA
    // ===================================================================
    if (dict->found("kawakita"))
    {
        const DictPtr b = dict->subDict("kawakita");
        const std::string s = site + " kawakita";
        const Dataset d = readDataset(datasetOf(b, dict, s), s);
        const int cP = d.col("P", "MPa", s);
        if (cP < 0) throw std::runtime_error(s + ": dataset '" + d.path + "' has no `P` [MPa] column");
        const int cC = d.col("C", "-", s);
        const int cV = d.col("V", "mL", s);
        std::vector<scalar> C(d.nRows);
        std::string basis;
        if (cC >= 0)
        {
            for (std::size_t r = 0; r < d.nRows; ++r) C[r] = d.at(r, cC);
            basis = "C as tabulated";
        }
        else if (cV >= 0)
        {
            if (!b->found("initialVolume"))
                throw std::runtime_error(s + ": the dataset gives `V` [mL]; declare"
                    " the powder's `initialVolume <V0> mL;` (the bulk volume before"
                    " compaction) so C = (V0 - V)/V0");
            const scalar V0 = b->lookupScalar("initialVolume", Dims::volume) * 1.0e6;   // mL
            for (std::size_t r = 0; r < d.nRows; ++r) C[r] = (V0 - d.at(r, cV)) / V0;
            basis = "C = (V0 - V)/V0, V0 = " + fmt("%.4g", V0) + " mL";
        }
        else
        {
            if (!b->found("initialRelativeDensity"))
                throw std::runtime_error(s + ": the dataset carries neither `C` [-]"
                    " nor `V` [mL]; to read C from the relative density declare"
                    " `initialRelativeDensity <D0>;` (bulk density / true density,"
                    " with its source) so C = 1 - D0/D (the mass is conserved)");
            const scalar D0 = b->lookupScalar("initialRelativeDensity");
            std::string rb;
            const std::vector<scalar> D = relativeDensity(d, dict, s, rb);
            for (std::size_t r = 0; r < d.nRows; ++r) C[r] = 1.0 - D0 / D[r];
            basis = "C = 1 - D0/D, D0 = " + fmt("%.4g", D0) + " (" + rb + ")";
        }
        scalar lo, hi;
        readWindow(b, s, lo, hi);
        const std::string win = "[" + fmt("%g", lo) + ", " + fmt("%g", hi) + "] MPa";
        std::vector<scalar> x, y;
        for (std::size_t r = 0; r < d.nRows; ++r)
        {
            const scalar P = d.at(r, cP);
            if (P < lo || P > hi) continue;
            if (!(C[r] > 0.0))
                throw std::runtime_error(s + ": row " + std::to_string(r + 1)
                    + " has volume strain C = " + fmt("%g", C[r]) + " inside the"
                      " window; P/C needs C > 0");
            x.push_back(P);
            y.push_back(P / C[r]);
        }
        requirePoints(x.size(), s, win);
        const Line L = fitLine(x, y);
        const scalar a = 1.0 / L.m;
        const scalar bk = L.m / L.q;
        std::cout << "\n  KAWAKITA  P/C = P/a + 1/(a b)     (Kawakita & Ludde, Powder Technol."
                     " 4 (1970/71) 61-68)\n"
                  << "    C = (V0 - V)/V0 the engineering volume strain (" << basis << ").\n"
                  << "    a the limiting strain (close to the initial porosity of the bed),"
                     " 1/b a pressure\n    related to the particles' yield stress.  Window "
                  << win << ", " << L.n << " of " << d.nRows << " points.\n"
                  << (b->found("reason") ? "    (" + b->lookupWord("reason") + ")\n" : std::string())
                  << "    a = " << fmt("%.5g", a) << "    b = " << fmt("%.5g", bk)
                  << " 1/MPa    1/b = " << fmt("%.4g", 1.0 / bk) << " MPa    R2 = "
                  << fmt("%.6f", L.R2) << "\n";
        diag_["kawakita_a"] = a;
        diag_["kawakita_b_perMPa"] = bk;
        diag_["kawakita_invb_MPa"] = 1.0 / bk;
        diag_["kawakita_R2"] = L.R2;
        diag_["n_kawakita"] = static_cast<scalar>(L.n);
        compare("a", "kawakita_a", a, nullptr, 1.0, "");
        compare("invb", "kawakita_invb_MPa", 1.0 / bk, &Dims::pressure, 1.0e-6, "MPa");

        PublishedTable tab;
        tab.name = "kawakita";
        tab.description = "every row of the dataset: the pressure, the volume strain, P/C, the"
                          " fitted line, the residual and the window flag";
        tab.columns = { {"P_MPa", "MPa"}, {"C", "-"}, {"P_over_C_MPa", "MPa"},
                        {"P_over_C_fit_MPa", "MPa"}, {"residual_MPa", "MPa"}, {"inWindow", "-"} };
        for (std::size_t r = 0; r < d.nRows; ++r)
        {
            const scalar P = d.at(r, cP);
            const scalar yy = (C[r] > 0.0) ? P / C[r] : std::numeric_limits<scalar>::quiet_NaN();
            const scalar yf = L.m * P + L.q;
            tab.rows.push_back({ P, C[r], yy, yf, yy - yf, (P >= lo && P <= hi) ? 1.0 : 0.0 });
        }
        tables_.push_back(std::move(tab));
        tables_.push_back(fittedCurve("kawakitaLine",
            "the fitted Kawakita line over the declared window's points only",
            { "P_MPa", "MPa" }, { "P_over_C_fit_MPa", "MPa" }, x,
            [&](scalar P) { return L.m * P + L.q; }));
    }

    // ===================================================================
    //  RYSHKEWITCH-DUCKWORTH
    // ===================================================================
    if (dict->found("ryshkewitch"))
    {
        const DictPtr b = dict->subDict("ryshkewitch");
        const std::string s = site + " ryshkewitch";
        const Dataset d = readDataset(datasetOf(b, dict, s), s);
        std::string rb;
        const std::vector<scalar> D = relativeDensity(d, dict, s, rb);
        const int cS = d.col("sigma_t", "MPa", s);
        const int cF = d.col("F", "N", s);
        const int cd = d.col("d", "mm", s);
        const int ct = d.col("t", "mm", s);
        std::vector<scalar> sig(d.nRows);
        std::string sbasis;
        if (cS >= 0 && cF >= 0)
            throw std::runtime_error(s + ": the dataset carries both `sigma_t` and"
                " `F` -- a strength is tabulated or computed, never both");
        if (cS >= 0)
        {
            for (std::size_t r = 0; r < d.nRows; ++r) sig[r] = d.at(r, cS);
            sbasis = "sigma_t as tabulated";
        }
        else if (cF >= 0)
        {
            if (cd < 0 || ct < 0)
                throw std::runtime_error(s + ": the dataset gives the crushing force"
                    " `F` [N]; it needs the tablet's `d` [mm] and `t` [mm] columns too");
            for (std::size_t r = 0; r < d.nRows; ++r)
                sig[r] = 2.0 * d.at(r, cF) / (kPi * d.at(r, cd) * d.at(r, ct));   // N/mm2 = MPa
            sbasis = "sigma_t = 2F/(pi d t), flat-faced cylinder (Fell & Newton,"
                     " J. Pharm. Sci. 59 (1970) 688-691)";
        }
        else
            throw std::runtime_error(s + ": the dataset carries no strength -- a"
                " `sigma_t` [MPa] column, or `F` [N] with `d` [mm] and `t` [mm]");
        const bool windowed = b->found("porosityMin") || b->found("porosityMax");
        const scalar emin = b->lookupScalarOrDefault("porosityMin", 0.0);
        const scalar emax = b->lookupScalarOrDefault("porosityMax", 1.0);
        const std::string win = windowed
            ? "porosity [" + fmt("%g", emin) + ", " + fmt("%g", emax) + "]"
            : "every row (no porosity window declared)";
        std::vector<scalar> x, y;
        for (std::size_t r = 0; r < d.nRows; ++r)
        {
            const scalar e = 1.0 - D[r];
            if (e < emin || e > emax) continue;
            if (!(sig[r] > 0.0))
                throw std::runtime_error(s + ": row " + std::to_string(r + 1)
                    + " has tensile strength " + fmt("%g", sig[r]) + " MPa; ln(sigma_t)"
                      " needs sigma_t > 0");
            x.push_back(e);
            y.push_back(std::log(sig[r]));
        }
        requirePoints(x.size(), s, win);
        const Line L = fitLine(x, y);
        const scalar t = fitAlgebra::tCrit95(static_cast<int>(L.n) - 2);
        const scalar s0 = std::exp(L.q);
        const scalar kb = -L.m;
        std::cout << "\n  RYSHKEWITCH-DUCKWORTH  sigma_t = sigma_0 exp(-k_b eps)     (Ryshkewitch,"
                     " J. Am. Ceram. Soc. 36 (1953)\n    65-68; Duckworth, ibid. 36 (1953) 68)."
                     "  Fitted as ln(sigma_t) = ln(sigma_0) - k_b eps.\n"
                  << "    eps = 1 - D the porosity (" << rb << "); " << sbasis << ".\n"
                  << "    sigma_0 is the strength EXTRAPOLATED to zero porosity -- a property"
                     " of the line,\n    not a tablet anyone pressed.  Fitted on " << win
                  << ", " << L.n << " of " << d.nRows << " points.\n"
                  << (b->found("reason") ? "    (" + b->lookupWord("reason") + ")\n" : std::string())
                  << "    sigma_0 = " << fmt("%.4g", s0) << " MPa    k_b = " << fmt("%.4g", kb)
                  << " +/- " << fmt("%.2g", t * L.se_m) << " (95 %)    R2 = "
                  << fmt("%.6f", L.R2) << "  (on ln sigma_t)\n";
        diag_["ryshkewitch_sigma0_MPa"] = s0;
        diag_["ryshkewitch_kb"] = kb;
        diag_["ryshkewitch_kb_ci95"] = t * L.se_m;
        diag_["ryshkewitch_R2"] = L.R2;
        diag_["n_ryshkewitch"] = static_cast<scalar>(L.n);
        compare("sigma0", "ryshkewitch_sigma0_MPa", s0, &Dims::pressure, 1.0e-6, "MPa");
        compare("kb", "ryshkewitch_kb", kb, nullptr, 1.0, "");

        PublishedTable tab;
        tab.name = "ryshkewitch";
        tab.description = "every row of the dataset: the porosity, the tensile strength, the"
                          " fitted strength, the residual on ln(sigma_t) and the window flag";
        tab.columns = { {"porosity", "-"}, {"sigma_t_MPa", "MPa"}, {"sigma_t_fit_MPa", "MPa"},
                        {"residual_lnSigma", "-"}, {"inWindow", "-"} };
        for (std::size_t r = 0; r < d.nRows; ++r)
        {
            const scalar e = 1.0 - D[r];
            const scalar sf = compactionLaw::rdStrength(s0, kb, e);
            const scalar res = (sig[r] > 0.0) ? std::log(sig[r]) - std::log(sf)
                                              : std::numeric_limits<scalar>::quiet_NaN();
            tab.rows.push_back({ e, sig[r], sf, res, (e >= emin && e <= emax) ? 1.0 : 0.0 });
        }
        tables_.push_back(std::move(tab));
        tables_.push_back(fittedCurve("ryshkewitchLine",
            "the fitted Ryshkewitch-Duckworth curve over the porosities it was fitted on",
            { "porosity", "-" }, { "sigma_t_fit_MPa", "MPa" }, x,
            [&](scalar e) { return compactionLaw::rdStrength(s0, kb, e); }));
    }

    if (reported && reported->found("source"))
        std::cout << "\n  Reported values above are the source's own (" << reported->lookupWord("source")
                  << "): a cross-check, never a tuning target.\n";

    //  The CSV, written FROM the published tables (one block per model).
    if (dict->found("output"))
    {
        const std::string f = dict->subDict("output")->lookupWord("file");
        records::refuseStandardsWrite("compactionFit", "file", f);
        std::ofstream csv(f);
        for (const auto& t : tables_)
        {
            csv << "# " << t.name << "\n";
            for (std::size_t c = 0; c < t.columns.size(); ++c)
                csv << (c ? "," : "") << t.columns[c].name;
            csv << "\n";
            for (const auto& row : t.rows)
            {
                for (std::size_t c = 0; c < row.size(); ++c) csv << (c ? "," : "") << row[c];
                csv << "\n";
            }
        }
    }
    std::cout << "=============================================\n";
    return 0;
}

std::string CompactionFit::defaultViews(const std::string& op) const
{
    std::string v;
    for (const auto& t : tables_)
    {
        if (t.name == "heckel")
            v += "{ name heckel; type series; op " + op + "; title \"" + op + ": Heckel plot --"
                 " the line is fitted on the declared window and drawn only there\"; xAxis { label \"P\"; }"
                 " yAxis { label \"ln(1/(1 - D))\"; } series ("
                 " { name data; label \"data\"; op " + op + "; table heckel; x P_MPa; y lnInvPorosity; style markers; }"
                 " { name fit; label \"K P + A\"; op " + op + "; table heckelLine; x P_MPa; y lnInvPorosity_fit; style lines; } ); }\n";
        else if (t.name == "kawakita")
            v += "{ name kawakita; type series; op " + op + "; title \"" + op + ": Kawakita plot\";"
                 " xAxis { label \"P\"; } yAxis { label \"P/C\"; } series ("
                 " { name data; label \"data\"; op " + op + "; table kawakita; x P_MPa; y P_over_C_MPa; style markers; }"
                 " { name fit; label \"P/a + 1/(a b)\"; op " + op + "; table kawakitaLine; x P_MPa; y P_over_C_fit_MPa; style lines; } ); }\n";
        else if (t.name == "ryshkewitch")
            v += "{ name ryshkewitch; type series; op " + op + "; title \"" + op + ": tensile"
                 " strength against porosity (Ryshkewitch-Duckworth)\"; xAxis { label \"porosity\"; }"
                 " yAxis { label \"sigma_t\"; } series ("
                 " { name data; label \"data\"; op " + op + "; table ryshkewitch; x porosity; y sigma_t_MPa; style markers; }"
                 " { name fit; label \"sigma_0 exp(-k_b eps)\"; op " + op + "; table ryshkewitchLine; x porosity; y sigma_t_fit_MPa; style lines; } ); }\n";
    }
    return v;
}

} // namespace Choupo
