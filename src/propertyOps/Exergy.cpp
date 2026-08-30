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

#include "Exergy.H"
#include "thermo/ThermoPackage.H"

#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

int Exergy::run(const DictPtr& dict,
                const ThermoPackage& globalThermo,
                int verbosity)
{
    auto override = thermoForOp(dict);
    const ThermoPackage& thermo = override ? *override : globalThermo;

    const std::string opName = dict->lookupWordOrDefault("name", "?");

    if (dict->lookupWordOrDefault("chemical", "false") == "true")
        throw std::runtime_error("exergy '" + opName + "': CHEMICAL exergy"
            " is not implemented -- it needs a standard-environment model"
            " (Szargut's reference substances, or another), which is a"
            " curated, primary-cited data decision this engine does not"
            " take on its own.  Remove `chemical true;`; the op computes"
            " the PHYSICAL (thermo-mechanical) exergy.");

    //  The dead state is the problem's declaration, never a default: an
    //  exergy is a statement about a state AND an environment.
    if (!dict->found("deadState"))
        throw std::runtime_error("exergy '" + opName + "': no `deadState {}`"
            " declared.  An exergy is measured against an ENVIRONMENT, and"
            " which one is the case author's fact, not the engine's --"
            " declare `deadState { T0 298.15 K;  P0 1 bar; }` (or your"
            " site's own).");
    auto dead = dict->subDict("deadState");
    const scalar T0 = dead->lookupScalar("T0", Dims::temperature);
    const scalar P0 = dead->lookupScalar("P0", Dims::pressure);

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

    //  ---- every number an engine call; the arithmetic is two differences
    //  and one product.  Same composition at both states, so the datum,
    //  the s_298 anchors, the mixing term and the reference pressure all
    //  cancel in dh and ds -- the exergy is datum-independent, which is
    //  what makes it comparable between models.
    const scalar h  = thermo.H_real(T,  P_Pa, z);
    const scalar s  = thermo.S_real(T,  P_Pa, z);
    const scalar h0 = thermo.H_real(T0, P0,   z);
    const scalar s0 = thermo.S_real(T0, P0,   z);

    const scalar dh   = h - h0;
    const scalar T0ds = T0 * (s - s0);
    const scalar b    = dh - T0ds;

    if (verbosity >= 2)
    {
        //  Save/restore the stream state: the result-JSON emitter writes
        //  under the AMBIENT precision (recorded defect, task #34), so an
        //  op that leaks its table formatting truncates the machine channel.
        const auto savedFlags = std::cout.flags();
        const auto savedPrec  = std::cout.precision();
        std::cout << "\n==========================  exergy: " << opName
                  << "  ==========================\n"
                  << "  State:      T = " << std::fixed << std::setprecision(2)
                  << T << " K,  P = " << (P_Pa / 1.0e5) << " bar\n"
                  << "  Dead state: T0 = " << T0 << " K,  P0 = "
                  << (P0 / 1.0e5) << " bar  (declared by the case)\n\n"
                  << std::setprecision(4)
                  << "  h - h0            = " << std::setw(14) << dh
                  << "  J/mol   (H_real at both states)\n"
                  << "  T0 * (s - s0)     = " << std::setw(14) << T0ds
                  << "  J/mol   (S_real at both states)\n"
                  << "  ------------------------------------------\n"
                  << "  b_physical        = " << std::setw(14) << b
                  << "  J/mol   = (h - h0) - T0*(s - s0)\n\n"
                  << "  Physical (thermo-mechanical) exergy only: the least"
                  " work to build this state\n  from the dead state -- or the"
                  " most work its return can deliver -- through a\n  reversible"
                  " path exchanging heat with the T0 environment.  CHEMICAL"
                  " exergy\n  (composition vs the environment's) is not"
                  " computed; it needs a standard-\n  environment model the"
                  " catalogue does not carry.\n"
                  << "==========================================================================\n\n";
        std::cout.flags(savedFlags);
        std::cout.precision(savedPrec);
    }

    diag_.clear();
    diag_["T"]    = T;
    diag_["P"]    = P_Pa;
    diag_["T0"]   = T0;
    diag_["P0"]   = P0;
    diag_["h"]    = h;
    diag_["h0"]   = h0;
    diag_["s"]    = s;
    diag_["s0"]   = s0;
    diag_["dh"]   = dh;
    diag_["T0ds"] = T0ds;
    diag_["b_physical"] = b;

    return 0;
}

} // namespace Choupo
