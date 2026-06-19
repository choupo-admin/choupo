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

#include "VleConsistency.H"
#include "core/Dictionary.H"
#include "core/Units.H"
#include "thermo/ThermoPackage.H"
#include "thermo/Component.H"

#include <algorithm>
#include <cmath>
#include <fstream>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

namespace {
scalar convUnit(scalar v, const std::string& unit)
{
    // Dimensionless mole fractions: no conversion.
    if (unit == "frac" || unit == "-" || unit == "[-]" || unit == "dimensionless"
        || unit == "none" || unit == "mol/mol")
        return v;
    auto spec = units::lookupUnit(unit);
    if (!spec) throw std::runtime_error("vleConsistency dataset: unknown unit '" + unit + "'");
    return spec->affine ? units::affineToK(v, unit) : v * spec->factor;
}
}

int VleConsistency::run(const DictPtr& dict,
                        const ThermoPackage& thermo,
                        int verbosity)
{
    diag_.clear();

    const std::string comp = dict->lookupWord("component");
    scalar P_Pa;
    if (dict->found("state") && dict->subDict("state")->found("P"))
        P_Pa = dict->subDict("state")->lookupScalar("P");
    else
        P_Pa = dict->lookupScalar("P");

    // Reference component (the x1/y1 column) + its binary partner.
    std::size_t i1 = thermo.n(), i2 = thermo.n();
    for (std::size_t i = 0; i < thermo.n(); ++i)
        if (thermo.comp(i).name() == comp) i1 = i;
    if (i1 == thermo.n())
        throw std::runtime_error("vleConsistency: component '" + comp + "' not in the thermo package");
    const std::string partner = dict->lookupWordOrDefault("partner", "");
    if (!partner.empty())
        for (std::size_t i = 0; i < thermo.n(); ++i)
            if (thermo.comp(i).name() == partner) i2 = i;
    else if (thermo.n() == 2)
        i2 = (i1 == 0) ? 1 : 0;
    if (i2 == thermo.n())
        throw std::runtime_error("vleConsistency: specify `partner` (the package has >2 components)");

    // -- read the measured (x1, T, y1) dataset (self-describing columns) ----
    auto ds = Dictionary::fromFile(dict->lookupWord("dataset"));
    auto cols = ds->lookupDictList("columns");
    auto flat = ds->lookupList("data");
    const std::size_t nc = cols.size();
    if (nc < 3 || flat.empty() || flat.size() % nc != 0)
        throw std::runtime_error("vleConsistency dataset: need >=3 columns + a matching data grid");
    int cx = -1, cT = -1, cy = -1;
    std::vector<std::string> unit(nc);
    const std::string xName = "x[" + comp + "]", yName = "y[" + comp + "]";
    for (std::size_t j = 0; j < nc; ++j)
    {
        const std::string name = cols[j]->lookupWord("name");
        unit[j] = cols[j]->lookupWord("unit");
        // Accept both the "measured" names (x[c], T, y[c]) AND the model-scan
        // aliases (T_bubble, y_eq_<c>) so ONE self-describing dataset serves
        // the experimental overlay AND this consistency test.
        if      (name == xName)                       cx = static_cast<int>(j);
        else if (name == yName || name == "y_eq_" + comp) cy = static_cast<int>(j);
        else if (name == "T" || name == "temperature" || name == "T_bubble") cT = static_cast<int>(j);
    }
    if (cx < 0 || cT < 0 || cy < 0)
        throw std::runtime_error("vleConsistency dataset needs columns " + xName + ", T, " + yName);
    const std::size_t N = flat.size() / nc;

    // -- gamma_i straight from the data: modified Raoult, Psat from Antoine ---
    struct Pt { scalar x1, T, lnG1, lnG2; };
    std::vector<Pt> pts;
    for (std::size_t r = 0; r < N; ++r)
    {
        const scalar x1 = convUnit(flat[r * nc + cx], unit[cx]);
        const scalar T  = convUnit(flat[r * nc + cT], unit[cT]);
        const scalar y1 = convUnit(flat[r * nc + cy], unit[cy]);
        const scalar x2 = 1.0 - x1, y2 = 1.0 - y1;
        if (x1 <= 0.0 || x1 >= 1.0) continue;   // pure ends: gamma is 0/0; gamma^inf handled below
        const scalar Ps1 = thermo.comp(i1).vp().Psat_Pa(T);
        const scalar Ps2 = thermo.comp(i2).vp().Psat_Pa(T);
        const scalar g1 = y1 * P_Pa / (x1 * Ps1);
        const scalar g2 = y2 * P_Pa / (x2 * Ps2);
        if (g1 <= 0.0 || g2 <= 0.0) continue;
        pts.push_back({ x1, T, std::log(g1), std::log(g2) });
    }
    std::sort(pts.begin(), pts.end(), [](const Pt& a, const Pt& b) { return a.x1 < b.x1; });
    if (pts.size() < 3)
        throw std::runtime_error("vleConsistency: need >=3 interior points with positive gamma");

    // -- Herington area test (companion) ------------------------------------
    scalar A = 0.0, sumAbs = 0.0, Tmin = pts.front().T, Tmax = pts.front().T;
    for (std::size_t k = 0; k + 1 < pts.size(); ++k)
    {
        const scalar dx = pts[k + 1].x1 - pts[k].x1;
        const scalar f0 = pts[k].lnG1 - pts[k].lnG2;
        const scalar f1 = pts[k + 1].lnG1 - pts[k + 1].lnG2;
        A      += 0.5 * (f0 + f1) * dx;
        sumAbs += 0.5 * (std::abs(f0) + std::abs(f1)) * dx;
    }
    for (const auto& p : pts) { Tmin = std::min(Tmin, p.T); Tmax = std::max(Tmax, p.T); }
    const scalar D = (sumAbs > 0.0) ? 100.0 * std::abs(A) / sumAbs : 0.0;
    const scalar J = 150.0 * (Tmax - Tmin) / Tmin;        // isobaric T-range correction
    const bool herPass = std::abs(D - J) < 10.0;

    // -- pointwise Gibbs-Duhem slope residual (the direct/point flavour) -----
    //    x1 d(lnG1)/dx1 + x2 d(lnG2)/dx2 ~ 0  (ISOTHERMAL form; isobaric adds a
    //    small -Hmix/RT^2 dT/dx term -- stated as a caveat).
    auto out = dict->subDict("output");
    std::ofstream csv(out->lookupWord("file"));
    if (!csv.is_open())
        throw std::runtime_error("vleConsistency: cannot open output file");
    csv << "x1,lnGamma1,lnGamma2,lnRatio,gdResidual\n";
    scalar gdMax = 0.0, gdSum = 0.0; int gdN = 0;
    for (std::size_t k = 0; k < pts.size(); ++k)
    {
        scalar resid = std::numeric_limits<scalar>::quiet_NaN();
        if (k > 0 && k + 1 < pts.size())
        {
            const scalar dX = pts[k + 1].x1 - pts[k - 1].x1;
            const scalar dlnG1 = (pts[k + 1].lnG1 - pts[k - 1].lnG1) / dX;
            const scalar dlnG2 = (pts[k + 1].lnG2 - pts[k - 1].lnG2) / dX;
            resid = pts[k].x1 * dlnG1 + (1.0 - pts[k].x1) * dlnG2;
            gdMax = std::max(gdMax, std::abs(resid));
            gdSum += std::abs(resid); ++gdN;
        }
        csv << pts[k].x1 << "," << pts[k].lnG1 << "," << pts[k].lnG2 << ","
            << (pts[k].lnG1 - pts[k].lnG2) << "," << resid << "\n";
    }
    const scalar gdMean = gdN ? gdSum / static_cast<scalar>(gdN)
                              : std::numeric_limits<scalar>::quiet_NaN();

    // gamma^inf: the dilute-end measured points (a first proxy; extrapolation TODO).
    const scalar g1inf = std::exp(pts.front().lnG1);   // x1 smallest -> comp dilute
    const scalar g2inf = std::exp(pts.back().lnG2);     // x1 largest  -> partner dilute

    diag_["n_points"]       = static_cast<scalar>(pts.size());
    diag_["herington_D"]    = D;
    diag_["herington_J"]    = J;
    diag_["herington_pass"] = herPass ? 1.0 : 0.0;
    diag_["gd_max_resid"]   = gdMax;
    diag_["gd_mean_resid"]  = gdMean;
    diag_["gamma1_inf"]     = g1inf;
    diag_["gamma2_inf"]     = g2inf;

    if (verbosity >= 2)
        std::cout << "  VleConsistency (" << comp << "/" << thermo.comp(i2).name()
                  << ", " << pts.size() << " pts):\n"
                  << "    Herington area: D=" << D << ", J=" << J
                  << " -> |D-J|=" << std::abs(D - J)
                  << (herPass ? "  PASS (<10)" : "  FAIL (>=10)") << "\n"
                  << "    Gibbs-Duhem slope residual (isothermal form): max="
                  << gdMax << ", mean=" << gdMean << "\n"
                  << "    gamma_inf: " << comp << "=" << g1inf
                  << ", " << thermo.comp(i2).name() << "=" << g2inf << "\n";
    return 0;
}

} // namespace Choupo
