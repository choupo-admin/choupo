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
    This file is part of Choupo.  GPL-3.0-or-later, see LICENSE.

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
-------------------------------------------------------------------------------
Description
    See BatchPublications.H.
\*---------------------------------------------------------------------------*/

#include "postProcessing/views/BatchPublications.H"

#include <cmath>
#include <limits>

namespace Choupo {
namespace views {

std::string kpiUnitOfKey(const std::string& key)
{
    if (key == "t_end" || key == "tauIgnition") return "s";
    if (key == "T_final") return "K";
    if (key == "P_final") return "Pa";
    if (key == "totalMoles_final") return "kmol";
    if (key.rfind("n_", 0) == 0 && key.size() > 8
        && key.compare(key.size() - 6, 6, "_final") == 0) return "kmol";
    return std::string();
}

std::vector<Publication> publicationsOfBatchRun(const std::vector<BatchVesselRecord>& vessels)
{
    std::vector<Publication> out;
    for (const auto& v : vessels)
    {
        Publication pub;
        pub.name = "unit:" + v.name;
        pub.type = v.type;
        for (const auto& [k, x] : v.kpis)
        {
            pub.diagnostics[k] = x;
            pub.units[k] = kpiUnitOfKey(k);
        }
        const std::size_t nc = v.componentNames.size();
        const std::size_t nr = v.t.size();
        int iNO = -1, iNO2 = -1;
        for (std::size_t i = 0; i < nc; ++i)
        {
            if (v.componentNames[i] == "NO")  iNO  = static_cast<int>(i);
            if (v.componentNames[i] == "NO2") iNO2 = static_cast<int>(i);
        }
        const bool nox = iNO >= 0 && iNO2 >= 0;
        //  the components that ever held material
        std::vector<std::size_t> used;
        for (std::size_t i = 0; i < nc; ++i)
        {
            bool any = false;
            for (std::size_t r = 0; r < nr; ++r) any = any || v.n[r][i] > 0.0;
            if (any) used.push_back(i);
        }
        auto fracOf = [&](std::size_t r, std::size_t i) -> scalar
        {
            scalar tot = 0.0;
            for (std::size_t k = 0; k < nc; ++k) tot += v.n[r][k];
            return tot > 0.0 ? v.n[r][i] / tot : 0.0;
        };
        if (nr > 0)
        {
            for (std::size_t i : used)
            {
                const scalar x = fracOf(nr - 1, i);
                const std::string c = v.componentNames[i];
                pub.diagnostics["x_" + c + "_final"]   = x;
                pub.units["x_" + c + "_final"]         = "-";
                pub.diagnostics["ppm_" + c + "_final"] = 1.0e6 * x;
                pub.units["ppm_" + c + "_final"]       = "ppm";
            }
            if (nox)
            {
                pub.diagnostics["ppm_NOx_final"] =
                    1.0e6 * (fracOf(nr - 1, iNO) + fracOf(nr - 1, iNO2));
                pub.units["ppm_NOx_final"] = "ppm";
            }
        }
        PublishedTable t;
        t.name = "trajectory";
        t.description = "the vessel's write grid (trajectory.csv), one row per write point";
        t.columns.push_back({ "t", "s" });
        t.columns.push_back({ "T", "K" });
        for (std::size_t i : used) t.columns.push_back({ "x_" + v.componentNames[i], "-" });
        for (std::size_t i : used) t.columns.push_back({ "ppm_" + v.componentNames[i], "ppm" });
        if (nox) t.columns.push_back({ "ppm_NOx", "ppm" });
        for (const auto& e : v.extraNames)
            t.columns.push_back({ e, e.rfind("cum", 0) == 0 ? "kmol" : "-" });
        for (std::size_t r = 0; r < nr; ++r)
        {
            if (v.dropTimeZero && v.t[r] <= 0.0) continue;
            std::vector<scalar> row{ v.t[r], v.T[r] };
            for (std::size_t i : used) row.push_back(fracOf(r, i));
            for (std::size_t i : used) row.push_back(1.0e6 * fracOf(r, i));
            if (nox) row.push_back(1.0e6 * (fracOf(r, iNO) + fracOf(r, iNO2)));
            for (std::size_t k = 0; k < v.extraNames.size(); ++k)
                row.push_back(k < v.extras[r].size() ? v.extras[r][k]
                                                    : std::numeric_limits<scalar>::quiet_NaN());
            t.rows.push_back(std::move(row));
        }
        pub.tables.push_back(std::move(t));
        out.push_back(std::move(pub));
    }
    return out;
}

} // namespace views
} // namespace Choupo
