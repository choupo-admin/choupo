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

#include "ENRTLMixedSolventOp.H"
#include "thermo/electrolyte/ENRTLMixedSolvent.H"

#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace Choupo {

int ENRTLMixedSolventOp::run(const DictPtr& dict, const ThermoPackage& /*thermo*/,
                             int verbosity)
{
    electrolyte::ENRTLMixedSolvent model;   // defaults = published NaCl/water-ethanol

    // Optional overrides (another alcohol / salt -- every value a curated cite)
    if (dict->found("salt"))
    {
        auto s = dict->subDict("salt");
        model.tau_OH_ca = s->lookupScalarOrDefault("tau_OH_ca", model.tau_OH_ca);
        model.tau_ca_OH = s->lookupScalarOrDefault("tau_ca_OH", model.tau_ca_OH);
        model.tau_C2_ca = s->lookupScalarOrDefault("tau_C2_ca", model.tau_C2_ca);
        model.tau_ca_C2 = s->lookupScalarOrDefault("tau_ca_C2", model.tau_ca_C2);
    }
    if (dict->found("alcohol"))
    {
        auto a = dict->subDict("alcohol");
        model.Xseg      = a->lookupScalarOrDefault("X",  model.Xseg);
        model.Zseg      = a->lookupScalarOrDefault("Z",  model.Zseg);
        model.MwAlcohol = a->lookupScalarOrDefault("MW", model.MwAlcohol);
    }

    std::ofstream csv(dict->subDict("output")->lookupWord("file"));
    if (!csv.is_open())
        throw std::runtime_error("enrtlMixedSolvent: cannot open output file");
    csv << "wt_alcohol,m,gamma_exp,gamma_calc,err_pct\n" << std::setprecision(8);

    if (verbosity >= 2)
        std::cout << "  eNRTL (Chen & Song 2004, segment-based): local = segment NRTL"
                     " (OH/C2H4/c/a), PDH = component scale, reference = infinite"
                     " dilution in the MIXED solvent (no Born on this route).\n";

    double sumAbsTot = 0.0; int nTot = 0;
    for (const auto& sys : dict->lookupDictList("systems"))
    {
        const double wt   = sys->lookupScalar("wtAlcohol");
        const double Aphi = sys->lookupScalar("Aphi");
        const double we   = wt / 100.0;
        const double yAlc = (we / model.MwAlcohol)
                          / ((we / model.MwAlcohol) + ((1.0 - we) / model.MwWater));

        double sumAbs = 0.0; int n = 0;
        for (const auto& p : sys->lookupDictList("data"))
        {
            const double m    = p->lookupScalar("m");
            const double gExp = p->lookupScalar("gamma");
            const double gCal = model.gammaPM(m, yAlc, Aphi);
            const double err  = 100.0 * (gCal - gExp) / gExp;
            sumAbs += std::fabs(err); ++n;
            csv << wt << "," << m << "," << gExp << "," << gCal << "," << err << "\n";
        }
        if (n == 0) continue;
        const double aad = sumAbs / n;
        sumAbsTot += sumAbs; nTot += n;

        std::ostringstream key; key << "AAD_wt" << static_cast<int>(wt) << "_pct";
        diag_[key.str()] = aad;
        if (verbosity >= 1)
            std::cout << "  " << std::setw(3) << static_cast<int>(wt)
                      << " wt% alcohol: AAD " << std::fixed << std::setprecision(2)
                      << aad << " % over " << n << " points\n" << std::defaultfloat;
    }
    if (nTot == 0)
        throw std::runtime_error("enrtlMixedSolvent: no data points in `systems`");

    diag_["AAD_total_pct"] = sumAbsTot / nTot;
    diag_["n_points"]      = static_cast<scalar>(nTot);
    if (verbosity >= 1)
        std::cout << "  TOTAL: AAD " << std::fixed << std::setprecision(2)
                  << sumAbsTot / nTot << " % over " << nTot << " points"
                  << std::defaultfloat << "\n";
    return 0;
}

} // namespace Choupo
