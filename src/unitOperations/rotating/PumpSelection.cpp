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

#include "PumpSelection.H"
#include "core/Dimensions.H"
#include "thermo/liquidProperty/ExperimentsFile.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <stdexcept>

namespace Choupo {
namespace pumpSelection {

scalar specificSpeed(scalar n_rpm, scalar Q_m3s, scalar H_m)
{
    return n_rpm * std::sqrt(Q_m3s) / std::pow(H_m, 0.75);          // Eq. (T3.4.15), fq = 1
}

std::string efficiencyWindowRefusal(scalar Q, scalar nq)
{
    char b[420];
    if (Q < 0.005)
    {
        std::snprintf(b, sizeof b, "the efficiency correlation (Gulich Eq. T3.9.1, Table 3.9, p. 163) is"
            " valid for Q >= 0.005 m3/s and this duty is %.5g m3/s: a small pump's efficiency is"
            " dominated by roughness and mechanical losses the correlation does not carry (p. 134);"
            " type `eta` yourself or give the maker's `curve`", static_cast<double>(Q));
        return b;
    }
    if (nq < 10.0 || nq > 100.0)
    {
        std::snprintf(b, sizeof b, "the specific speed nq = %.4g lies outside 10..100, the span of"
            " Gulich's single-stage radial correlation (Eq. T3.9.1 and Fig. 3.26, pp. 132, 163);"
            " semi-axial and axial pumps (Eq. T3.9.3) are not built: type `eta` or give a `curve`",
            static_cast<double>(nq));
        return b;
    }
    return "";
}

scalar etaOptimum(scalar Q, scalar nq)
{
    const scalar QRef = 1.0;                                        // m3/s
    const scalar a    = (Q <= 1.0) ? 1.0 : 0.5;
    const scalar r    = QRef / Q;
    const scalar m    = 0.1 * a * std::pow(r, 0.15) * std::pow(45.0 / nq, 0.06);
    const scalar t    = 0.35 - std::log10(nq / 23.0);
    return 1.0 - 0.095 * std::pow(r, m) - 0.3 * t * t * std::pow(r, 0.05);   // Eq. (T3.9.1)
}

scalar etaUncertainty(scalar etaOpt) { return 0.2 * (1.0 - etaOpt); }   // Eq. (T3.9.10)

void suctionSpecificSpeedClass(const std::string& cls, scalar& lo, scalar& hi, std::string& rowText)
{
    struct Row { const char* key; scalar lo, hi; const char* text; };
    static const Row rows[] = {
        { "standardAxialInlet",    160.0, 220.0, "Standard impellers for axial inlet or between-bearing pumps, u1 < 50 m/s" },
        { "suctionImpellerAxial",  220.0, 280.0, "Suction impellers for axial inlet, u1 < 35 m/s" },
        { "betweenBearings",       180.0, 240.0, "Suction impellers of between-bearing pumps, single or double-entry, u1 < 50 m/s" },
        { "highPressure",          160.0, 190.0, "High pressure pumps designed for short cavity length, u1 > 50 m/s" },
        { "inducer",               400.0, 700.0, "Industrial inducers (Sect. 7.7.4), u1 < 35 (45) m/s" },
    };
    std::string known;
    for (const Row& r : rows)
    {
        known += (known.empty() ? "" : ", ") + std::string(r.key);
        if (cls == r.key) { lo = r.lo; hi = r.hi; rowText = r.text; return; }
    }
    throw std::runtime_error("pump selection: impeller class `" + cls + "` -- Table D6.1 of Gulich"
        " (p. 320) is read for: " + known + ".  Or declare `suctionSpecificSpeed <nss>;` yourself"
        " (a maker's number).");
}

scalar npsh3FromNss(scalar n_rpm, scalar Q_bep, scalar nss)
{
    return std::pow(n_rpm * std::sqrt(Q_bep) / nss, 1.0 / 0.75);    // Eq. (6.7) inverted
}

scalar npshAvailable(scalar p_abs, scalar p_v, scalar rho, scalar z_e, scalar c_e, scalar Hv_s)
{
    return (p_abs - p_v) / (rho * g) + z_e + c_e * c_e / (2.0 * g) - Hv_s;   // Eq. (T2.2.8)
}

scalar npshaMinimum(scalar npsh3)
{
    return std::max(1.25 * npsh3, npsh3 + 0.6);                     // Table 6.2, p. 379
}

Curve::At Curve::at(scalar q, const std::string& who) const
{
    if (Q.size() < 2) throw std::runtime_error(where + ": the curve has no rows.");
    const scalar eps = 1.0e-9 * Q.back();
    if (q < Q.front() - eps || q > Q.back() + eps)
    {
        char b[520];
        std::snprintf(b, sizeof b, "%s: the flow %.6g m3/h lies OUTSIDE the range of the pump curve"
            " `%s` (%.6g .. %.6g m3/h, %s).  The engine does not extrapolate a manufacturer's curve: a point"
            " below its first row or beyond its last is not on it (the pump would be run in a region the maker"
            " never published).  Change the duty, or declare the curve of a larger or smaller pump.",
            who.c_str(), static_cast<double>(q * 3600.0), name.c_str(),
            static_cast<double>(Q.front() * 3600.0), static_cast<double>(Q.back() * 3600.0), where.c_str());
        throw std::runtime_error(b);
    }
    std::size_t k = 1;
    while (k + 1 < Q.size() && q > Q[k]) ++k;
    const scalar f = (q - Q[k - 1]) / (Q[k] - Q[k - 1]);
    auto lin = [&](const std::vector<scalar>& v) { return v[k - 1] + f * (v[k] - v[k - 1]); };
    return { lin(H), lin(eta), lin(NPSHr) };
}

Curve readCurve(const std::string& name, const std::string& citedBy)
{
    const experiments::File f = experiments::readFile(name, "pumpCurve", citedBy);
    Curve c;
    c.name = name; c.where = f.where; c.citation = f.citation;
    static const char* allowed[] = { "provenance", "system", "property", "conditions", "columns", "data", "uncertainty" };
    for (const auto& k : f.dict->keys())
        if (std::find_if(std::begin(allowed), std::end(allowed), [&](const char* a) { return k == a; }) == std::end(allowed))
            throw std::runtime_error(f.where + ": key `" + k + "` -- a pump curve record carries provenance, property,"
                " conditions, columns, data (and optionally uncertainty).");
    const DictPtr pv = f.dict->subDict("provenance");
    c.kind  = pv->lookupWordOrDefault("kind", "");
    c.basis = pv->lookupWordOrDefault("basis", "");
    if (c.kind != "measured" && c.kind != "adopted" && c.kind != "illustrative")
        throw std::runtime_error(f.where + ": `provenance { kind " + c.kind + "; }` -- measured (a maker's published or"
            " tested curve), adopted (read from a cited figure) or illustrative (constructed to teach, labelled so; required).");
    if (c.basis.empty())
        throw std::runtime_error(f.where + ": `provenance` states no `basis \"...\";` -- what the rows are, in the source's words.");
    if (!f.dict->found("conditions"))
        throw std::runtime_error(f.where + ": `conditions { speed <n> rpm; fluid \"...\"; npshCriterion NPSH3; }` is required.");
    const DictPtr cd = f.dict->subDict("conditions");
    c.speed_rpm = cd->lookupScalar("speed", Dims::inverseTime) * 60.0;
    c.fluid     = cd->lookupWordOrDefault("fluid", "");
    if (c.fluid.empty())
        throw std::runtime_error(f.where + ": `conditions { fluid \"...\"; }` -- the liquid and temperature of the test"
            " (the head of a curve is a head, in metres, of THAT liquid).");
    if (cd->lookupWordOrDefault("npshCriterion", "") != "NPSH3")
        throw std::runtime_error(f.where + ": `conditions { npshCriterion NPSH3; }` is required -- the NPSHr column is read as"
            " the NPSH of the 3 % head drop (the definition ISO 9906 fixes for the acceptance test); the margin rule of"
            " Gulich Table 6.2 (p. 379) is written on that NPSH3.");

    std::vector<experiments::ColumnRole> roles;
    std::vector<std::string> names;
    if (f.dict->found("columns") && f.dict->hasDictList("columns"))
        for (const auto& col : f.dict->lookupDictList("columns"))
        {
            const std::string cn = col->lookupWordOrDefault("name", "");
            if (std::find(names.begin(), names.end(), cn) != names.end())
                throw std::runtime_error(f.where + ": column `" + cn + "` twice.");
            names.push_back(cn);
            experiments::ColumnRole r;
            if (cn == "Q")         { r.dims = Dims::volumetricFlow; r.what = "a volumetric flow"; }
            else if (cn == "H")    { r.dims = Dims::length;         r.what = "a head (length of liquid column)"; }
            else if (cn == "NPSHr"){ r.dims = Dims::length;         r.what = "an NPSH (length)"; }
            else if (cn == "eta")  { r.dims = Dims::dimensionless;  r.what = "an efficiency"; }
            else throw std::runtime_error(f.where + ": column `" + cn + "` -- a pump curve reads Q, H, eta and NPSHr.");
            roles.push_back(r);
        }
    for (const char* need : { "Q", "H", "eta", "NPSHr" })
        if (std::find(names.begin(), names.end(), need) == names.end())
            throw std::runtime_error(f.where + ": the curve has no `" + std::string(need) + "` column (it reads Q, H, eta and NPSHr).");
    if (names.size() != 4)
        throw std::runtime_error(f.where + ": a pump curve has exactly FOUR columns: Q, H, eta, NPSHr.");
    const experiments::Table t = experiments::readTable(f.dict, roles, f.where);
    if (t.rows() < 3)
        throw std::runtime_error(f.where + ": a curve of fewer than three rows is not a curve (" + std::to_string(t.rows()) + " given).");
    auto col = [&](const char* n) -> const std::vector<scalar>&
    { return t.si[static_cast<std::size_t>(std::find(names.begin(), names.end(), n) - names.begin())]; };
    c.Q = col("Q"); c.H = col("H"); c.eta = col("eta"); c.NPSHr = col("NPSHr");
    for (std::size_t r = 0; r < c.Q.size(); ++r)
    {
        if (r > 0 && !(c.Q[r] > c.Q[r - 1]))
            throw std::runtime_error(f.where + ": the rows must be in strictly increasing Q (row " + std::to_string(r + 1) + ").");
        if (!(c.eta[r] > 0.0 && c.eta[r] <= 1.0))
            throw std::runtime_error(f.where + ": eta of row " + std::to_string(r + 1) + " is outside (0, 1].");
        if (!(c.H[r] > 0.0) || !(c.NPSHr[r] > 0.0))
            throw std::runtime_error(f.where + ": H and NPSHr must be positive (row " + std::to_string(r + 1) + ").");
    }
    return c;
}

} // namespace pumpSelection
} // namespace Choupo
