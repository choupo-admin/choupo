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
    reactorOutlet implementation -- see ReactorOutlet.H for the rule and why
    it has one home.
\*---------------------------------------------------------------------------*/

#include "ReactorOutlet.H"

#include "core/Advisory.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/flash/StreamEquilibrium.H"   // the ONE equilibrium home

#include <cmath>
#include <cstdio>
#include <iomanip>
#include <iostream>
#include <string>

namespace Choupo {
namespace reactorOutlet {

OutletState outletState(scalar               T,
                        scalar               P,
                        const sVector&       zout,
                        bool                 pinned_in,
                        scalar               vf_in,
                        const ThermoPackage& thermo,
                        const std::string&   unitType,
                        const std::string&   unitName)
{
    OutletState o;
    const std::string locus = unitType + " '" + unitName + "' outlet";
    if (thermo.phasesOfType("vapor").empty())
    {
        o.vf     = vf_in;
        o.origin = "the package has no vapour phase; the inlet's vf stands";
        return o;
    }
    std::string deferred;
    bool discarded = false;
    const auto fs = flashState::equilibriumAt(T, P, zout, /*pinned=*/false,
                                              vf_in, thermo, locus, "model",
                                              &deferred, nullptr, &discarded);
    if (fs)
    {
        o.vf     = flashState::vapourFractionOf(*fs);
        o.origin = "resolved at its own (T, P, z)";
    }
    else if (discarded)
    {
        o.vf     = 1.0;
        o.origin = "the one fluid phase above every present Tc"
                   " (a two-phase root was discarded)";
    }
    else
    {
        o.vf     = vf_in;
        o.origin = "the inlet's vf, CARRIED: the outlet's own equilibrium"
                   " could not be resolved";
        const std::string msg =
            "the outlet's own equilibrium at (T, P, z) could not be resolved,"
            " so it carries the inlet's vapour fraction"
            + (deferred.empty() ? std::string() : " -- " + deferred);
        if (AdvisoryLog::instance().addAnnouncedOnce(
                unitType + ".outletUnresolved." + unitName,
                "model", "warning", locus, msg))
            std::cerr << "[" << unitType << "] " << locus << ": " << msg << "\n";
    }

    //  The departure from a DECLARED inlet phase, said once.  Only a pinned
    //  SINGLE phase is a declaration of a phase (a pinned pure quality is a
    //  point on a saturation curve, and a product of another composition is
    //  not on it).
    const bool declaredSingle =
        pinned_in && (vf_in <= 1.0e-9 || vf_in >= 1.0 - 1.0e-9);
    if (declaredSingle && std::fabs(o.vf - vf_in) > 1.0e-9)
    {
        const std::string declared = (vf_in >= 0.5) ? "gas" : "liquid";
        const std::string msg =
            "the inlet DECLARES `phase " + declared + ";`, and that is a"
            " declaration about the inlet: the outlet, at another composition,"
            " is published at its own equilibrium at (T, P, z), which is not"
            " all " + declared + " -- its vapour fraction is printed with the"
            " unit.  If the reactor is meant to hold the " + declared
            + " phase, declare a pressure at which its product does";
        if (AdvisoryLog::instance().addAnnouncedOnce(
                unitType + ".departsFromDeclaredInletPhase." + unitName,
                "model", "info", locus, msg))
            std::cerr << "[" << unitType << "] " << locus << ": " << msg << "\n";
    }
    return o;
}

void printOutletState(const OutletState& o)
{
    const auto prec = std::cout.precision();
    std::cout << "  outlet vf = " << std::setprecision(6) << o.vf
              << "  (" << o.origin << ")\n";
    std::cout.precision(prec);
}

void announceEnergyRungMismatch(const std::string& unitType,
                                const std::string& unitName,
                                const std::string& mode,
                                scalar             T_out,
                                scalar             vf_in,
                                scalar             vf_out,
                                scalar             Q_published_kW)
{
    if (std::fabs(vf_out - vf_in) <= 1.0e-9) return;
    const std::string locus = unitType + " '" + unitName + "' outlet";
    char buf[512];
    std::snprintf(buf, sizeof buf,
        "the %s energy balance that set T_out = %.4f K was solved on the"
        " INLET's phase rung (vf = %.6g), but the outlet's own equilibrium at"
        " that T is vf = %.6g -- so T_out is not the %s temperature of the"
        " state published, and the published Q_kW = %.4f kW (H_out - H_in of"
        " that state) carries the enthalpy of a phase change the balance did"
        " not see",
        mode.c_str(), T_out, vf_in, vf_out, mode.c_str(), Q_published_kW);
    const std::string msg = std::string(buf)
        + ".  This energy solve is not yet on the surface its streams are"
          " priced on (CLAUDE.md §6).  If the reactor is meant to hold the"
          " inlet's phase, declare a pressure at which its product does";
    if (AdvisoryLog::instance().addAnnouncedOnce(
            unitType + ".energyRungMismatch." + unitName,
            "model", "warning", locus, msg))
        std::cerr << "[" << unitType << "] " << locus << ": " << msg << "\n";
}

} // namespace reactorOutlet
} // namespace Choupo
