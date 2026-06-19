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

#include "PropertyPoint.H"
#include "core/Constants.H"
#include "thermo/ThermoPackage.H"

#include <iomanip>
#include <iostream>

namespace Choupo {

int PropertyPoint::run(const DictPtr& dict,
                       const ThermoPackage& globalThermo,
                       int verbosity)
{
    // Per-op thermo override (the `thermo {}` block on the operation,
    // when present, REPLACES the matching model sub-dicts).  Used for
    // side-by-side audit points across models (e.g. SRK vs PR Z).
    auto override = thermoForOp(dict);
    const ThermoPackage& thermo = override ? *override : globalThermo;

    auto stateDict = dict->subDict("state");
    auto compDict  = stateDict->subDict("composition");

    const scalar T    = stateDict->lookupScalar("T", Dims::temperature);
    const scalar P_Pa = stateDict->lookupScalar("P", Dims::pressure);

    const std::size_t n = thermo.n();
    sVector z(n, 0.0);
    scalar zsum = 0.0;
    for (const auto& key : compDict->keys())
    {
        std::size_t i = thermo.indexOf(key);
        z[i] = compDict->lookupScalar(key);
        zsum += z[i];
    }
    for (auto& v : z) v /= zsum;

    // Compute everything --- cheap.
    const scalar H_ig   = thermo.H_ig(T, z);
    const scalar S_ig   = thermo.S_ig(T, P_Pa, z);
    const scalar Cp_ig  = thermo.Cp_ig(T, z);
    const scalar gamma  = Cp_ig / (Cp_ig - constant::R);

    const scalar Zval   = thermo.eos().Z(T, P_Pa, z);
    const scalar vmol   = thermo.eos().molarVolume(T, P_Pa, z);
    const scalar H_R    = thermo.eos().H_residual(T, P_Pa, z);
    const scalar S_R    = thermo.eos().S_residual(T, P_Pa, z);
    const scalar H_real = H_ig + H_R;
    const scalar S_real = S_ig + S_R;

    if (verbosity >= 2)
    {
        std::cout << "\n==========================  PropertyPoint  ==========================\n"
                  << "  State:           T = " << std::fixed << std::setprecision(2) << T
                  << " K   ( " << (T - 273.15) << " degC )\n"
                  << "                   P = " << std::fixed << std::setprecision(2)
                  << (P_Pa / 1.0e5) << " bar   ( " << P_Pa << " Pa )\n"
                  << "  Composition (mole frac):\n";
        for (std::size_t i = 0; i < n; ++i)
            if (z[i] > 1.0e-12)
                std::cout << "    " << std::setw(16) << std::left
                          << thermo.comp(i).name() << "  "
                          << std::fixed << std::setprecision(6) << z[i] << "\n";

        std::cout << "\n  Ideal-gas MIXTURE:\n"
                  << "    H_ig         = " << std::scientific << std::setprecision(6)
                  << H_ig << "  J/mol\n"
                  << "    S_ig         = " << std::fixed << std::setprecision(4)
                  << S_ig << "  J/(mol*K)\n"
                  << "    Cp_ig        = " << std::fixed << std::setprecision(4)
                  << Cp_ig << "  J/(mol*K)\n"
                  << "    gamma=Cp/Cv  = " << std::fixed << std::setprecision(4)
                  << gamma << "\n"
                  << "\n  EoS = " << thermo.eos().modelName()
                  << "  (vapour root):\n"
                  << "    Z            = " << std::fixed << std::setprecision(6)
                  << Zval << "\n"
                  << "    v_molar      = " << std::scientific << std::setprecision(5)
                  << vmol << "  m3/mol\n"
                  << "    H_residual   = " << std::scientific << std::setprecision(5)
                  << H_R << "  J/mol\n"
                  << "    S_residual   = " << std::fixed << std::setprecision(4)
                  << S_R << "  J/(mol*K)\n"
                  << "    H_real       = " << std::scientific << std::setprecision(6)
                  << H_real << "  J/mol\n"
                  << "    S_real       = " << std::fixed << std::setprecision(4)
                  << S_real << "  J/(mol*K)\n"
                  << "=====================================================================\n\n";
    }

    diag_.clear();
    diag_["T"]       = T;
    diag_["P"]       = P_Pa;
    diag_["H_ig"]    = H_ig;
    diag_["S_ig"]    = S_ig;
    diag_["Cp_ig"]   = Cp_ig;
    diag_["gamma"]   = gamma;
    diag_["Z"]       = Zval;
    diag_["v_molar"] = vmol;
    diag_["H_R"]     = H_R;
    diag_["S_R"]     = S_R;
    diag_["H_real"]  = H_real;
    diag_["S_real"]  = S_real;

    // Transport properties: added to the diagnostics ONLY when the package
    // can supply them (a pure-fluid IAPWS route, or a generic transport
    // block).  Each is guarded -- a package without a model simply omits the
    // key, so existing propertyPoint cases are unaffected (additive).
    try { diag_["viscosity"]            = thermo.viscosityGas(T, z); }            catch (...) {}
    try { diag_["thermal_conductivity"] = thermo.thermalConductivityGas(T, z); }  catch (...) {}
    try { diag_["surface_tension"]      = thermo.surfaceTension(T, z); }          catch (...) {}

    return 0;
}

} // namespace Choupo
