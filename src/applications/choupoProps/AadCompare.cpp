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

#include "AadCompare.H"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <fstream>
#include <sstream>

namespace Choupo {

namespace {

std::string trim(const std::string& s)
{
    std::size_t a = s.find_first_not_of(" \t\r\n");
    if (a == std::string::npos) return "";
    std::size_t b = s.find_last_not_of(" \t\r\n");
    return s.substr(a, b - a + 1);
}

bool iequals(const std::string& a, const std::string& b)
{
    if (a.size() != b.size()) return false;
    for (std::size_t i = 0; i < a.size(); ++i)
        if (std::tolower((unsigned char)a[i]) != std::tolower((unsigned char)b[i])) return false;
    return true;
}

struct Csv { std::vector<std::string> headers; std::vector<std::vector<double>> rows; bool ok = false; };

Csv readCsv(const std::string& path)
{
    Csv c;
    std::ifstream f(path);
    if (!f) return c;
    std::string line;
    if (!std::getline(f, line)) return c;
    { std::stringstream ss(line); std::string cell;
      while (std::getline(ss, cell, ',')) c.headers.push_back(trim(cell)); }
    while (std::getline(f, line))
    {
        if (trim(line).empty()) continue;
        std::vector<double> row; std::stringstream ss(line); std::string cell;
        bool bad = false;
        while (std::getline(ss, cell, ','))
        {
            try { row.push_back(std::stod(trim(cell))); }
            catch (...) { bad = true; break; }
        }
        if (!bad && row.size() == c.headers.size()) c.rows.push_back(std::move(row));
    }
    c.ok = (c.headers.size() >= 2 && c.rows.size() >= 2);
    return c;
}

// Linear interpolation of (xs, ys) at x.  xs MUST be sorted ascending.
// Returns false (out of range) if x is strictly outside [xs.front, xs.back].
bool interp(const std::vector<double>& xs, const std::vector<double>& ys, double x, double& out)
{
    if (xs.empty()) return false;
    if (x < xs.front() || x > xs.back()) return false;
    // upper_bound -> first element strictly greater than x
    std::size_t hi = std::upper_bound(xs.begin(), xs.end(), x) - xs.begin();
    if (hi == 0) { out = ys.front(); return true; }
    if (hi >= xs.size()) { out = ys.back(); return true; }
    const std::size_t lo = hi - 1;
    const double x0 = xs[lo], x1 = xs[hi];
    if (x1 == x0) { out = ys[lo]; return true; }
    const double t = (x - x0) / (x1 - x0);
    out = ys[lo] + t * (ys[hi] - ys[lo]);
    return true;
}

} // namespace

std::vector<AadRecord> computeAad(const std::string& expCsvPath,
                                  const std::vector<std::string>& expColSiUnits,
                                  const std::vector<std::string>& modelCsvPaths,
                                  const std::vector<std::string>& modelNames)
{
    std::vector<AadRecord> out;

    Csv exp = readCsv(expCsvPath);
    if (!exp.ok)
    {
        AadRecord r; r.status = "modelCsvMissing";
        r.note = "could not read experimental CSV " + expCsvPath;
        out.push_back(r); return out;
    }
    const std::string absName = exp.headers[0];   // abscissa = column 0

    for (std::size_t mi = 0; mi < modelNames.size(); ++mi)
    {
        const std::string& mname = modelNames[mi];
        const std::string  mpath = mi < modelCsvPaths.size() ? modelCsvPaths[mi] : "";

        if (mpath.empty())
        { AadRecord r; r.model = mname; r.status = "noModelOp";
          r.note = "no operation named '" + mname + "' with an output.file"; out.push_back(r); continue; }

        Csv mod = readCsv(mpath);
        if (!mod.ok)
        { AadRecord r; r.model = mname; r.status = "modelCsvMissing";
          r.note = "could not read model CSV " + mpath; out.push_back(r); continue; }

        // Abscissa header must match (case-insensitive, trimmed): refuse to guess.
        if (!iequals(mod.headers[0], absName))
        { AadRecord r; r.model = mname; r.status = "abscissaMismatch";
          r.note = "dataset abscissa '" + absName + "' != model '" + mod.headers[0] + "'";
          out.push_back(r); continue; }

        // Sorted model abscissa once.
        std::vector<std::size_t> order(mod.rows.size());
        for (std::size_t i = 0; i < order.size(); ++i) order[i] = i;
        std::sort(order.begin(), order.end(),
                  [&](std::size_t a, std::size_t b){ return mod.rows[a][0] < mod.rows[b][0]; });
        std::vector<double> mAbs(order.size());
        for (std::size_t i = 0; i < order.size(); ++i) mAbs[i] = mod.rows[order[i]][0];

        bool anyChannel = false;
        // Each dependent exp column (j >= 1) that the model also has -> a channel.
        for (std::size_t je = 1; je < exp.headers.size(); ++je)
        {
            const std::string prop = exp.headers[je];
            // find model column with the same name
            std::size_t jm = mod.headers.size();
            for (std::size_t k = 1; k < mod.headers.size(); ++k)
                if (iequals(mod.headers[k], prop)) { jm = k; break; }
            if (jm == mod.headers.size())
            { AadRecord r; r.model = mname; r.property = prop; r.status = "noModelColumn";
              r.note = "model '" + mname + "' has no column '" + prop + "'"; out.push_back(r); continue; }
            anyChannel = true;

            // classify by DECLARED SI unit of the exp column
            const std::string siu = je < expColSiUnits.size() ? expColSiUnits[je] : "SI";
            std::string kind, unit;
            if (siu == "K")       { kind = "temperature"; unit = "K"; }
            else if (siu == "-")  { kind = "fraction";    unit = "-"; }
            else                  { kind = "relative";    unit = siu; }   // Pa, SI, ...

            // model values sorted to mAbs order
            std::vector<double> mVal(order.size());
            for (std::size_t i = 0; i < order.size(); ++i) mVal[i] = mod.rows[order[i]][jm];

            AadRecord r; r.model = mname; r.property = prop; r.kind = kind; r.unit = unit;
            r.nMeas = (int)exp.rows.size();
            double sumAbs = 0.0; int nAbs = 0;
            double sumRel = 0.0; int nRel = 0;
            const double floor = (kind == "relative") ? (unit == "Pa" ? 1.0 : 1e-9) : 0.0;

            for (const auto& row : exp.rows)
            {
                const double x = row[0], d = row[je];
                double m;
                if (!interp(mAbs, mVal, x, m)) { r.nOutOfRange++; continue; }
                if (!std::isfinite(m) || !std::isfinite(d)) { r.nNonFinite++; continue; }
                const double ad = std::fabs(m - d);
                sumAbs += ad; nAbs++;
                if (kind == "relative")
                {
                    if (std::fabs(d) < floor) { r.nNearZeroSkipped++; continue; }
                    sumRel += ad / std::fabs(d); nRel++;
                }
            }

            // primary count = points entering the PRIMARY metric
            const int primaryN = (kind == "relative") ? nRel : nAbs;
            r.nUsed = primaryN;

            if (primaryN == 0) { r.status = "noOverlap"; out.push_back(r); continue; }

            if (kind == "relative")
            { r.hasRel = true; r.aadRelPct = (sumRel / nRel) * 100.0;
              if (nAbs > 0) { r.hasAbs = true; r.aadAbs = sumAbs / nAbs; } }
            else
            { r.hasAbs = true; r.aadAbs = sumAbs / nAbs; }

            // status
            if (kind == "temperature" && r.hasAbs && r.aadAbs > 50.0)
            { r.status = "suspectedUnitMismatch";
              r.note = "temperature AAD > 50 K -- suspected unit/origin mismatch between dataset and model"; }
            else if (r.nOutOfRange > 0) r.status = "partialCoverage";
            else if (primaryN < 3)      r.status = "tooFewPoints";
            else                        r.status = "ok";

            out.push_back(r);
        }

        if (!anyChannel && !exp.headers.empty())
        { /* model matched abscissa but shared no dependent column: already emitted
             per-column noModelColumn records above; nothing extra to add. */ }
    }

    return out;
}

} // namespace Choupo
