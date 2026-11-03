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
-------------------------------------------------------------------------------
Description
    The Bell-Delaware bench -- see BellDelawareBench.H.
\*---------------------------------------------------------------------------*/

#include "BellDelawareBench.H"

#include "unitOperations/heatTransfer/htc/BellDelaware.H"

#include <iomanip>
#include <iostream>
#include <sstream>

namespace Choupo {

int BellDelawareBench::run(const DictPtr& dict,
                           const ThermoPackage& /*thermo*/,
                           int verbosity)
{
    diag_.clear();
    const bellDelaware::Spec  spec  = bellDelaware::readSpec(
        dict->subDict("geometry"), dict->subDict("bellDelaware"), true);
    const bellDelaware::Fluid fluid = bellDelaware::readFluid(
        dict->subDict("shellFluid"));
    const bellDelaware::Result r = bellDelaware::rate(spec, fluid);

    diag_["Sm"] = r.Sm;          diag_["Vmax"] = r.Vmax;
    diag_["Re"] = r.Re;          diag_["Pr"] = r.Pr;
    diag_["h_ideal"] = r.h_ideal;
    diag_["Fc"] = r.Fc;          diag_["Jc"] = r.Jc;
    diag_["Ssb"] = r.Ssb;        diag_["Stb"] = r.Stb;
    diag_["leakageRatio"] = r.leakageRatio;
    diag_["leakageSplit"] = r.leakageSplit;
    diag_["Fbp"] = r.Fbp;        diag_["Nc"] = r.Nc;
    diag_["JL"] = r.JL;          diag_["JB"] = r.JB;
    diag_["h_shell"] = r.h;      diag_["J_combined"] = r.combined;
    if (r.hasDp)
    {
        diag_["Kf"] = r.Kf;      diag_["dp_cross"] = r.dpc;
        diag_["Ncw"] = r.Ncw;    diag_["Sw"] = r.Sw;
        diag_["dp_window"] = r.dpw;
        diag_["nBaffles"] = r.nBaffles;
        diag_["dP_shell"] = r.dP;
    }

    if (verbosity >= 1)
    {
        std::ostringstream os;
        os << std::setprecision(5);
        os << "\n========  Bell-Delaware shell side (ideal bank "
           << spec.idealBank << ")  ========\n"
           << "  S_m = " << r.Sm << " m2   V_max = " << r.Vmax
           << " m/s   Re = " << r.Re << "   Pr = " << r.Pr << "\n"
           << "  ideal h = " << r.h_ideal << " W/m2K\n"
           << "  F_c = " << r.Fc << "   J_c = " << r.Jc << "\n"
           << "  S_sb = " << r.Ssb << "   S_tb = " << r.Stb
           << "   (S_sb+S_tb)/S_m = " << r.leakageRatio
           << "   S_sb/(S_sb+S_tb) = " << r.leakageSplit << "\n"
           << "  F_bp = " << r.Fbp << "   N_c = " << r.Nc
           << "   N_ss/N_c = " << r.NssOverNc << "\n"
           << "  J_L = " << r.JL << " (declared)   J_B = " << r.JB
           << " (declared)\n"
           << "  h = " << r.h << " W/m2K\n";
        if (r.hasDp)
            os << "  K_f = " << r.Kf << "   dp_cross = " << r.dpc
               << " Pa   N_cw = " << r.Ncw << "   S_w = " << r.Sw
               << " m2   dp_window = " << r.dpw << " Pa\n"
               << "  shell dP = " << r.dP << " Pa  (" << r.nBaffles
               << " baffles, R_L = " << r.RL << ", R_B = " << r.RB << ")\n";
        for (const auto& a : r.assumptions) os << "  [assumption] " << a << "\n";
        os << "==========================================================\n";
        std::cout << os.str();
    }
    return 0;
}

} // namespace Choupo
