// Copyright (C) 2026 Vítor Geraldes
// SPDX-License-Identifier: GPL-3.0-or-later
//
//  Holds the reader of a profile column's unit (views::profileColumnUnitOf) on
//  the keys that went wrong: `extent_kmol_h` was read as `h` and `r_mol_gcat_s`
//  as `s` (C477, 2026-11-25).  Built and run by check_postprocessing arm (k).
#include "postProcessing/views/RunPublications.H"

#include <iostream>
#include <string>
#include <utility>
#include <vector>

int main()
{
    using Choupo::views::profileColumnUnitOf;
    const std::vector<std::pair<std::string, std::string>> want = {
        { "extent_kmol_h",  "kmol/h" },   // a compound suffix is read whole
        { "flow_kg_h",      "kg/h" },
        { "dP_column_kPa",  "kPa" },      // a non-unit word before the unit
        { "Q_kW",           "kW" },
        { "r_mol_gcat_s",   "" },         // a compound the registry lacks: no unit, not `s`
        { "stage",          "-" },
        { "T",              "K" },
        { "x_benzene",      "-" },
        { "lnKa",           "" },
        { "h_backup_mm",    "mm" },
        { "floodApproach",  "" },
    };
    int bad = 0;
    for (const auto& [k, u] : want)
    {
        const std::string got = profileColumnUnitOf(k);
        if (got != u)
        {
            std::cout << "PROFILE_UNITS_FAIL " << k << " -> '" << got << "', expected '" << u << "'\n";
            ++bad;
        }
    }
    if (bad) return 1;
    std::cout << "PROFILE_UNITS_OK " << want.size() << " keys\n";
    return 0;
}
