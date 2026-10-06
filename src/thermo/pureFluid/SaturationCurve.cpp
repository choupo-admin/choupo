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

#include "thermo/pureFluid/SaturationCurve.H"

#include "core/Advisory.H"
#include "thermo/Component.H"
#include "thermo/pureFluid/PureFluidModel.H"
#include "thermo/vaporPressure/VaporPressureModel.H"

#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>

namespace Choupo {

namespace {

//  The method has no saturation curve at T: say so ONCE per component and
//  side, then let the record answer.  A pass that already holds the key
//  stops before the sentence is built -- the K-value is asked for on every
//  flash iteration (the PairSpanGuard shape, thermo/PairAudit.H).
void announceOutsideWindow(const Component& c, const PureFluidModel& pf,
                           scalar T_K, scalar lo, scalar hi)
{
    const bool above = (T_K > hi);
    const std::string key = "pureFluidSaturationWindow:" + c.name()
                          + (above ? ":above" : ":below");
    if (AdvisoryLog::instance().passHas(key)) return;

    std::ostringstream m;
    m << "the declared pure-fluid method " << pf.type() << " defines the"
         " saturation curve of '" << c.name() << "' on " << lo << " .. " << hi
      << " K only; asked at T = " << T_K << " K ("
      << (above ? "ABOVE its critical point, where no saturation curve"
                  " exists"
                : "BELOW its triple point, where its liquid line does not"
                  " exist")
      << "), the component record's own vapour-pressure correlation answers"
         " there instead, extrapolated as it is for every other component --"
         " a K-value or humidity at that temperature is not on "
      << pf.type() << "'s curve";

    if (!AdvisoryLog::instance().addAnnouncedOnce(key, "validity", "warning",
                                                   "component '" + c.name()
                                                   + "'", m.str()))
        return;
    std::cerr << "[pure-fluid] " << c.name() << ": " << m.str() << ".\n";
}

} // anonymous namespace

scalar saturationPressure(const Component& c, const PureFluidModel* pf,
                          scalar T_K)
{
    if (pf)
    {
        const auto w = pf->saturationWindow();
        if (T_K >= w.first && T_K <= w.second)
            return pf->p_sat(T_K);
        if (!c.hasVaporPressure())
        {
            std::ostringstream m;
            m << "saturationPressure: '" << c.name() << "' was asked for its"
                 " saturation pressure at T = " << T_K << " K, outside the"
                 " window of its declared pure-fluid method " << pf->type()
              << " (" << w.first << " .. " << w.second << " K), and its"
                 " record declares no vapour-pressure correlation to answer"
                 " there.  Curate a `vaporPressure {}` block on the record,"
                 " or keep the state inside the method's window.";
            throw std::runtime_error(m.str());
        }
        announceOutsideWindow(c, *pf, T_K, w.first, w.second);
    }
    return c.vp().Psat_Pa(T_K);
}

} // namespace Choupo
