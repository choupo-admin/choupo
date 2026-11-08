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

#include "PR.H"

#include "core/Advisory.H"
#include "thermo/ThermoAnnounce.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <memory>
#include <sstream>
#include <vector>

namespace Choupo {

namespace {
    // Peng-Robinson universal constants.
    constexpr scalar OMEGA_A = 0.45724;
    constexpr scalar OMEGA_B = 0.07780;

    // Generalised-cubic constants for PR:  ε = 1 − √2,  σ = 1 + √2.
    const scalar SQRT2 = std::sqrt(2.0);
    const scalar EPS   = 1.0 - SQRT2;       // ≈ −0.41421
    const scalar SIG   = 1.0 + SQRT2;       // ≈  2.41421

    //  THE SLOPE m(omega) IS PR78's TWO-BRANCH FORM (2026-10-21, DEV.md 4c
    //  C123, Vitor: the 1978 branch is the correct form, not an option).
    //  Robinson & Peng, "The characterization of the heptanes and heavier
    //  fractions for the GPA Peng-Robinson programs", GPA Research Report
    //  RR-28 (1978), as the PPR78 literature restates it (Jaubert, Privat &
    //  Mutelet, AIChE J. 56 (2010) 3225, Eq. 2; Xu, Lasala, Privat &
    //  Jaubert, Int. J. Greenh. Gas Control 56 (2017) 126, Eq. 2):
    //
    //      omega <= 0.491 :  0.37464  + 1.54226 w - 0.26992 w^2
    //      omega >  0.491 :  0.379642 + 1.48503 w - 0.164423 w^2 + 0.016666 w^3
    //
    //  The break is at omega = 0.491 as printed (`<=` on the 1976 branch).
    //  Below it the two branches differ by ~1e-3 in m; above it the 1976
    //  polynomial turns over (its maximum is at w = 2.86) while the cubic
    //  keeps rising, which is why the heavier fractions needed it.  Every
    //  PPR78 / E-PPR78 kij is DEFINED on this m (their Eq. 7 carries a_i(T)),
    //  so a kij from those tables used with the 1976 slope above 0.491 would
    //  be a number under another model's name.
    constexpr scalar PR78_BREAK = 0.491;

    scalar pr_kappa(scalar omega)
    {
        if (omega <= PR78_BREAK)
            return 0.37464 + 1.54226 * omega - 0.26992 * omega * omega;
        return 0.379642 + 1.48503 * omega - 0.164423 * omega * omega
             + 0.016666 * omega * omega * omega;
    }

    std::vector<scalar> slopes(const std::vector<Component>& comps)
    {
        std::vector<scalar> m;
        m.reserve(comps.size());
        for (const auto& c : comps)
        {
            const scalar omega = c.omega();
            const scalar kappa = pr_kappa(omega);
            m.push_back(kappa);

            //  A component above the break is ANNOUNCED with the slope it
            //  got, once per process (the package is rebuilt per phase, per
            //  unit and per fit iteration; AdvisoryLog dedupes on the key).
            //  The 1976 value is printed beside it so a reader sees what the
            //  branch moved.
            if (omega > PR78_BREAK)
            {
                const scalar m76 = 0.37464 + 1.54226 * omega
                                 - 0.26992 * omega * omega;
                std::ostringstream msg;
                msg << std::fixed << std::setprecision(5)
                    << "[PR78] " << c.name() << " omega = " << omega
                    << " > 0.491: the 1978 branch applies, m = " << kappa
                    << " (the 1976 polynomial would give " << m76 << ")";
                if (thermoAnnounce()
                    && AdvisoryLog::instance().add("thermo", "info",
                           "PR78 " + c.name(), msg.str()))
                    std::cout << msg.str() << "\n";
            }
        }
        return m;
    }
}

PR::PR(const std::vector<Component>& comps,
       const std::vector<std::vector<scalar>>& kij)
  : CubicEoS("PR", Constants{ OMEGA_A, OMEGA_B, EPS, SIG }, comps,
             slopes(comps), kij)
{}

std::unique_ptr<EquationOfState>
PR::fromDict(const DictPtr& eosDict, const std::vector<Component>& comps)
{
    return std::make_unique<PR>(comps, readKij("PR", eosDict, comps));
}

} // namespace Choupo
