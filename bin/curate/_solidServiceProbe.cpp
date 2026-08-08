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
Application (curation probe -- built and run by check_solid_service.py)
    _solidServiceProbe <admittedMineral>

    Migration S2b evidence: the SolidEquilibriumService, fed the SAME
    aqueous state as the spike's D3 and an admitted list taken from a real
    case declaration (the gate parses flash16's chemistryDict and passes
    it on argv -- assembly from the case's own words, not a hand-built
    closure), must reproduce the provider's INTERNAL equilibrate oracle:
    formed amount, final SI ~ 0, same pH.  The sinks the service consumed
    are echoed so the gate can assert the S2a resolution carried the
    chained carbonate stoichiometry rather than a hand copy.
\*---------------------------------------------------------------------------*/

#include "thermo/Database.H"
#include "thermo/electrolyte/SpeciationSolver.H"
#include "thermo/solidEquilibrium/SolidEquilibriumService.H"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <iostream>
#include <string>

using namespace Choupo;

int main(int argc, char** argv)
{
    if (argc < 2)
    {
        std::cerr << "usage: _solidServiceProbe <admittedMineral>\n";
        return 2;
    }
    const std::string admitted = argv[1];
    const char* h = std::getenv("CHOUPO_HOME");
    Database db(std::string(h ? h : ".") + "/data");

    electrolyte::SpeciationSolver provider("davies");
    auto mkIn = [&]()
    {
        electrolyte::SpeciationInput in;
        in.totals[SpeciesId("Ca")]   = 5e-3;   // mol/kg water
        in.totals[SpeciesId("HCO3")] = 1e-2;
        in.solvePH = true;
        in.T = 298.15;
        in.announceClosure = false;
        return in;
    };

    //  ORACLE: the provider's internal equilibrate, untouched.
    auto inO = mkIn();
    inO.equilibrate = { admitted };
    const auto oracle = provider.solve(inO, 0);
    const double nOracle = oracle.precipitated.count(admitted)
                         ? oracle.precipitated.at(admitted) : -1.0;

    //  THE SERVICE, general route: same state, the admitted list from the
    //  case declaration, the probed-Jacobian solver.
    const auto svc = solidEq::SolidEquilibriumService::equilibrateMinerals(
        provider, mkIn(), { admitted }, 0,
        solidEq::SolidEquilibriumService::Route::general);

    //  THE SERVICE, coupled route (S3): the same door invoking the
    //  provider's own simultaneous solve -- must equal the oracle exactly.
    const auto svcC = solidEq::SolidEquilibriumService::equilibrateMinerals(
        provider, mkIn(), { admitted }, 0,
        solidEq::SolidEquilibriumService::Route::coupled);
    const double nCoupled = svcC.formed.count(admitted)
                          ? svcC.formed.at(admitted) : -1.0;
    const double nSvc = svc.formed.count(admitted)
                      ? svc.formed.at(admitted) : -1.0;
    const double siSvc = svc.aqueous.SI.count(admitted)
                       ? svc.aqueous.SI.at(admitted) : 99.0;

    std::string legs;
    for (const auto& s : svc.sinks)
        for (const auto& [m, nu] : s.masterNu)
            legs += (legs.empty() ? "" : " ") + m + ":" + std::to_string(nu);

    std::printf("<<<JSON\n{\"admitted\": \"%s\", "
                "\"nOracle\": %.17g, \"nService\": %.17g, "
                "\"nCoupled\": %.17g, "
                "\"siService\": %.17g, "
                "\"pHOracle\": %.17g, \"pHService\": %.17g, "
                "\"pHCoupled\": %.17g, "
                "\"outerIters\": %d, \"events\": %zu, "
                "\"sinkLegs\": \"%s\"}\nJSON>>>\n",
                admitted.c_str(), nOracle, nSvc, nCoupled, siSvc,
                oracle.pH, svc.aqueous.pH, svcC.aqueous.pH,
                svc.outerIters, svc.events.size(), legs.c_str());
    return 0;
}
