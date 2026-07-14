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

#include "HConsistency.H"

#include "thermo/Component.H"
#include "thermo/ThermoPackage.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

int HConsistency::run(const DictPtr& dict, const ThermoPackage& thermo,
                      int verbosity)
{
    diag_.clear();
    const scalar T  = dict->lookupScalarOrDefault("temperature", 350.0);
    const scalar dT = 0.01;                        // K, central FD
    const auto names = dict->lookupWordList("components");

    auto leg = [&](std::size_t i, scalar Tq, const char* ph) -> scalar
    {
        return thermo.speciesPhaseEnthalpy(i, Tq, 1.0e5, ph,
                   ThermoPackage::ReferenceContext::StandardPhase);
    };
    auto rel = [](scalar got, scalar want) -> scalar
    {
        return std::abs(got - want)
             / std::max({ std::abs(want), std::abs(got), 1.0 });
    };

    std::cout << "\n  hConsistency: the STATE identities of the canonical"
                 " enthalpy surface (forum #106)\n"
              << "    at T = " << T << " K, central FD dT = " << dT << " K\n"
              << "    check 1: dh_liq/dT == Cp_liquid    check 2:"
                 " dh_gas/dT == Cp_idealGas\n"
              << "    check 3: [h_g - h_liq](298.15) == vaporisation anchor"
                 "    check 4: Kirchhoff on Hvap_state\n";

    scalar worst = 0.0;
    for (const auto& nm : names)
    {
        const std::size_t i = thermo.indexOf(nm);
        const Component&  c = thermo.comp(i);

        // 1. liquid slope vs the DECLARED liquid Cp.
        const scalar dhL = (leg(i, T + dT, "liquid") - leg(i, T - dT, "liquid"))
                         / (2.0 * dT);
        const scalar e1  = rel(dhL, c.cpLiquid().Cp(T));

        // 2. gas slope vs the DECLARED ideal-gas Cp.
        const scalar dhG = (leg(i, T + dT, "gas") - leg(i, T - dT, "gas"))
                         / (2.0 * dT);
        const scalar e2  = rel(dhG, c.cpIdealGas().Cp(T));

        // 3. the 298.15 K vaporisation anchor: the phase legs must differ
        //    at the datum by EXACTLY the anchor the formation paths use.
        const scalar dH298   = leg(i, 298.15, "gas") - leg(i, 298.15, "liquid");
        const scalar anchor  = c.Hvap_latent(298.15);
        const scalar e3      = rel(dH298, anchor);

        // 4. Kirchhoff on the STATE Hvap: d(h_g - h_liq)/dT == Cp_g - Cp_liq.
        const scalar dHvapdT =
            ((leg(i, T + dT, "gas") - leg(i, T + dT, "liquid"))
           - (leg(i, T - dT, "gas") - leg(i, T - dT, "liquid"))) / (2.0 * dT);
        const scalar kirchhoff = c.cpIdealGas().Cp(T) - c.cpLiquid().Cp(T);
        const scalar e4 = rel(dHvapdT, kirchhoff);

        diag_[nm + "_dhliq_vs_cpliq_rel"] = e1;
        diag_[nm + "_dhgas_vs_cpig_rel"]  = e2;
        diag_[nm + "_anchor298_rel"]      = e3;
        diag_[nm + "_kirchhoff_rel"]      = e4;
        worst = std::max({ worst, e1, e2, e3, e4 });

        if (verbosity >= 2)
            std::cout << "    " << std::setw(12) << nm
                      << std::scientific << std::setprecision(2)
                      << "  1:" << e1 << "  2:" << e2
                      << "  3:" << e3 << "  4:" << e4 << "\n";
    }
    diag_["worst_rel_err"] = worst;

    // The FD itself carries O(dT^2) truncation on a curved Cp(T); 1e-6
    // relative is far above that floor and far below any physical claim.
    constexpr scalar gate = 1.0e-6;
    if (worst > gate)
        throw std::runtime_error("hConsistency: the canonical surface"
            " VIOLATES a state identity (worst rel err "
            + std::to_string(worst) + " > " + std::to_string(gate)
            + ") -- a leg is not integrating its own phase's Cp");
    std::cout << "    worst rel err = " << std::scientific
              << std::setprecision(3) << worst << "  (gate " << gate
              << ")  -- surface CONSISTENT\n";
    return 0;
}

} // namespace Choupo
