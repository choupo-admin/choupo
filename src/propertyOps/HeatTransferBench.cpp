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

#include "HeatTransferBench.H"
#include "ReynoldsSweep.H"

#include "unitOperations/heatTransfer/htc/HeatTransferCorrelation.H"
#include "unitOperations/heatTransfer/htc/PhaseChangeHTC.H"

#include <fstream>
#include <iomanip>
#include <memory>
#include <vector>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace Choupo {

int HeatTransferBench::run(const DictPtr& dict,
                           const ThermoPackage& /*thermo*/,
                           int verbosity)
{
    diag_.clear();
    const scalar aadTol = dict->lookupScalarOrDefault("aadTolerance", 0.05);

    // Make sure the correlations are registered (idempotent).
    HeatTransferCorrelation::registerBuiltins();
    PhaseChangeHTC::registerBuiltins();
    // Phase-change film theory carries genuine scatter vs experiment; its
    // anchor tolerance is honest (~15 %), separate from the single-phase pin.
    const scalar pcTol = dict->lookupScalarOrDefault("aadTolerancePhaseChange",
                                                     0.15);

    std::ostringstream os;
    os << "\n========  Heat-transfer correlation bench (verify vs published Nu)"
          "  ========\n";

    bool allPass = true;
    for (const auto& name : HeatTransferCorrelation::availableTypes())
    {
        auto corr = HeatTransferCorrelation::New(name);
        const auto v = corr->verify();
        const bool pass = (v.dev <= aadTol);
        allPass = allPass && pass;

        diag_["dev_" + name]          = v.dev;
        diag_["Nu_choupo_" + name]    = v.Nu_choupo;
        diag_["Nu_published_" + name] = v.Nu_published;

        os << "  " << std::left << std::setw(14) << name
           << "  Nu_choupo = " << std::fixed << std::setprecision(2)
           << std::setw(8) << v.Nu_choupo
           << "  Nu_pub = " << std::setw(8) << v.Nu_published
           << "  AAD = " << std::setprecision(3) << (100.0 * v.dev) << " %  "
           << (pass ? "[PASS]" : "[FAIL]") << "\n"
           << "                  anchor: " << v.anchor << "\n";
    }
    os << "  AAD tolerance = " << std::setprecision(1) << (100.0 * aadTol)
       << " %  (honours textbook rounding + the correlations' own scatter)\n";

    // ---- Phase-change (film condensation) anchors ------------------------
    os << "  -- phase-change film coefficients (vs published h-bar) --\n";
    for (const auto& name : PhaseChangeHTC::availableTypes())
    {
        auto corr = PhaseChangeHTC::New(name);
        const auto v = corr->verify();
        const bool pass = (v.dev <= pcTol);
        allPass = allPass && pass;

        diag_["dev_" + name]          = v.dev;
        diag_["h_choupo_" + name]     = v.h_choupo;
        diag_["h_published_" + name]  = v.h_published;

        os << "  " << std::left << std::setw(14) << name
           << "  h_choupo = " << std::fixed << std::setprecision(1)
           << std::setw(8) << v.h_choupo
           << "  h_pub = " << std::setw(8) << v.h_published
           << "  AAD = " << std::setprecision(3) << (100.0 * v.dev) << " %  "
           << (pass ? "[PASS]" : "[FAIL]") << "\n"
           << "                  anchor: " << v.anchor << "\n";
    }
    os << "  phase-change AAD tolerance = " << std::setprecision(1)
       << (100.0 * pcTol) << " %  (laminar film theory's honest scatter)\n"
       << "====================================================================="
          "============\n";

    // ---- The sweep -- optional (2026-10-20, DEV.md 4c C119) --------------
    //
    //  Every single-phase correlation on one logarithmic grid of Re at each
    //  declared Pr, one CSV row per (Pr, Re) with each correlation's Nu and
    //  its own window flag.  The correlations are functions of Re and Pr
    //  alone, so each is handed a UNIT FLUID -- rho = mu = lambda = d_h = 1,
    //  u = Re, cp = Pr -- whose Reynolds and Prandtl numbers ARE the grid
    //  point; the dimensional context is how the class is called, not a
    //  physical fluid.  Heating side (Dittus-Boelter n = 0.4), as the unit's
    //  default.  Kern is a SHELL-side correlation whose Re is built on the
    //  crossflow velocity and the equivalent diameter: it is evaluated on the
    //  same numbers and is not a tube correlation.
    if (dict->found("sweep"))
    {
        auto sw = dict->subDict("sweep");
        const auto grid = correlationSweep::readReynoldsGrid(sw, "heatTransferBench");
        const std::vector<scalar> prs = sw->lookupList("Pr");
        if (prs.empty())
            throw std::runtime_error("heatTransferBench: sweep.Pr must list at"
                " least one Prandtl number, e.g. Pr ( 0.7 7 );");
        for (scalar pr : prs)
            if (!(pr > 0.0))
                throw std::runtime_error("heatTransferBench: sweep.Pr holds a"
                    " non-positive value -- a Prandtl number is cp mu / lambda > 0.");

        const auto names = HeatTransferCorrelation::availableTypes();
        std::vector<std::unique_ptr<HeatTransferCorrelation>> corrs;
        for (const auto& n : names) corrs.push_back(HeatTransferCorrelation::New(n));

        std::ofstream csv(grid.file);
        if (!csv)
            throw std::runtime_error("heatTransferBench: cannot write the sweep"
                " CSV '" + grid.file + "'.");
        csv << "Pr,Re";
        for (const auto& n : names) csv << ",Nu_" << n << ",in_" << n;
        csv << "\n" << std::setprecision(17);

        std::size_t rows = 0;
        for (scalar pr : prs)
            for (scalar Re : grid.Re)
            {
                HeatTransferContext c;
                c.rho = 1.0; c.mu = 1.0; c.lambda = 1.0; c.d_h = 1.0;
                c.u = Re;   c.cp = pr;  c.heating = true;
                csv << pr << "," << Re;
                for (const auto& corr : corrs)
                {
                    const auto r = corr->evaluate(c);
                    csv << "," << r.Nu << "," << (r.inValidity ? 1 : 0);
                }
                csv << "\n";
                ++rows;
            }
        diag_["sweep_rows"] = scalar(rows);

        os << "  ---- the sweep ----\n"
           << "  " << names.size() << " correlations x " << prs.size()
           << " Prandtl number(s) x " << grid.Re.size() << " Reynolds numbers ("
           << std::scientific << std::setprecision(3) << grid.Re.front()
           << " .. " << grid.Re.back() << ") -> " << grid.file << "\n"
           << "  Each correlation is handed a unit fluid whose Re and Pr ARE"
              " the grid point;\n  heating side (Dittus-Boelter n = 0.4).  Kern"
              " is shell-side (Re on the crossflow\n  velocity and the"
              " equivalent diameter), evaluated on the same numbers.\n";
    }
    os << "\n";

    if (verbosity >= 1) std::cout << os.str();
    diag_["allPass"] = allPass ? 1.0 : 0.0;

    if (!allPass)
        throw std::runtime_error("heatTransferBench: a correlation deviates from"
            " its published Nu anchor beyond the AAD tolerance -- check the"
            " coefficient/formula, do not loosen the tolerance silently.");
    return 0;
}

} // namespace Choupo
