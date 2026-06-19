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

#include "Turbine.H"
#include "IsentropicCore.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

int Turbine::solve(const DictPtr& dict,
                   const ThermoPackage& thermo,
                   int verbosity)
{
    auto feedDict = dict->subDict("feed");
    auto operDict = dict->subDict("operation");
    auto compDict = dict->subDict("composition");

    const scalar F    = feedDict->lookupScalar("F", Dims::molarFlow);
    const scalar T_in = feedDict->lookupScalar("T", Dims::temperature);
    const scalar P_in = feedDict->lookupScalar("P", Dims::pressure);

    const std::size_t n = thermo.n();
    sVector y(n, 0.0);
    scalar zsum = 0.0;
    for (const auto& key : compDict->keys())
    {
        y[thermo.indexOf(key)] = compDict->lookupScalar(key);
        zsum += y[thermo.indexOf(key)];
    }
    for (auto& v : y) v /= zsum;

    // ---- Hardware --------------------------------------------------------
    const scalar W_shaft = operDict->lookupScalar("W_shaft", Dims::power);
    const scalar eta     = operDict->lookupScalar("eta");
    if (eta <= 0.0 || eta > 1.0)
        throw std::runtime_error(
            "Turbine: eta must satisfy 0 < eta <= 1 (got "
            + std::to_string(eta) + ")");
    if (W_shaft >= 0.0)
        throw std::runtime_error(
            "Turbine: W_shaft must be NEGATIVE (work is extracted from the "
            "gas).  Use a compressor block for compression.  Got "
            + std::to_string(W_shaft) + " W");

    // ---- Inlet thermo state ---------------------------------------------
    const scalar F_mol_s = F * 1000.0;                  // mol/s
    const scalar h_in    = thermo.H_real(T_in, P_in, y);
    const scalar s_in    = thermo.S_real(T_in, P_in, y);

    const scalar w_real_per_mol = W_shaft / F_mol_s;    // J/mol (negative)
    // Turbine convention: eta = w_real / w_isen  =>  w_isen = w_real / eta.
    // Both negative; |w_isen| > |w_real|.
    const scalar w_isen_per_mol = w_real_per_mol / eta;

    // ---- Discharge solve (shared core, expansion branch) ----------------
    auto disc = rotating::solveDischarge(thermo, T_in, P_in, y, h_in, s_in,
        w_real_per_mol, w_isen_per_mol,
        /*expansion=*/true, verbosity);
    if (!disc.converged)
        throw std::runtime_error(
            "Turbine: discharge solve did not converge");

    const scalar P_out      = disc.P_out;
    const scalar T_out      = disc.T_out;
    const scalar T_out_isen = disc.T_out_isen;
    const int    outerIter  = disc.outerIters;
    recordResidual(0.0);

    // ---- Diagnostics -----------------------------------------------------
    const scalar s_out_real = thermo.S_real(T_out, P_out, y);
    const scalar dS_gen     = s_out_real - s_in;
    const scalar ratio      = P_in / P_out;            // expansion ratio
    const scalar W_gen_kW   = -W_shaft / 1000.0;        // positive: generated
    const scalar W_isen_kW  = -(W_shaft / eta) / 1000.0;

    if (verbosity >= 2)
    {
        std::cout << "\n=============================  Turbine Result  ======================\n"
                  << "  Converged:       yes  (outer Newton " << outerIter << " iters)\n"
                  << "  Hardware:        W_shaft = " << std::fixed << std::setprecision(3)
                  << (W_shaft / 1000.0) << "  kW (extracted)  |   eta = "
                  << std::setprecision(4) << eta << "\n"
                  << "  P_in:            " << std::fixed << std::setprecision(3)
                  << (P_in / 1.0e5)  << "  bar     T_in:        "
                  << std::setprecision(2) << T_in   << "  K  ( " << (T_in - 273.15)  << " degC )\n"
                  << "  P_out:           " << std::fixed << std::setprecision(3)
                  << (P_out / 1.0e5) << "  bar     T_out:       "
                  << std::setprecision(2) << T_out  << "  K  ( " << (T_out - 273.15) << " degC )\n"
                  << "  Expansion ratio:    " << std::fixed << std::setprecision(3)
                  << ratio << "\n"
                  << "  T_out_isen:      " << std::fixed << std::setprecision(2)
                  << T_out_isen << "  K   (isentropic discharge --- diagnostic)\n"
                  << "  W_generated:     " << std::fixed << std::setprecision(3)
                  << W_gen_kW << "  kW   (W_isen would be "
                  << W_isen_kW << " kW)\n"
                  << "  dT:              " << std::fixed << std::setprecision(2)
                  << (T_out - T_in) << "  K          dT_isen: "
                  << (T_out_isen - T_in) << "  K\n"
                  << "  dS_gen:          " << std::scientific << std::setprecision(4)
                  << dS_gen << "  J/(mol*K)   (entropy generated by the irreversibility)\n"
                  << "=====================================================================\n\n";
    }

    // ---- Produced stream -------------------------------------------------
    produced_.clear();
    ProcessStream out;
    out.name = "out";
    out.F    = F;
    out.T    = T_out;
    out.P    = P_out;
    out.z    = y;
    out.vf   = 1.0;
    produced_.push_back(out);

    // ---- KPIs -----------------------------------------------------------
    kpis_.clear();
    kpis_["W_shaft"]     = W_shaft;            // signed (negative)
    kpis_["W_generated"] = -W_shaft;           // positive
    kpis_["W_gen_kW"]    = W_gen_kW;
    kpis_["eta_isen"]    = eta;
    kpis_["P_in"]        = P_in;
    kpis_["P_out"]       = P_out;
    kpis_["ratio"]       = ratio;
    kpis_["T_in"]        = T_in;
    kpis_["T_out"]       = T_out;
    kpis_["T_out_isen"]  = T_out_isen;
    kpis_["dT"]          = T_out - T_in;
    kpis_["dT_isen"]     = T_out_isen - T_in;
    kpis_["dS_gen"]      = dS_gen;
    kpis_["F"]           = F;

    return 0;
}

} // namespace Choupo
