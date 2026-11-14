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

#include <cmath>
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

//  The join's announcement (see saturationPressure): once per component and
//  side, with the factor that was applied.
void announceJoin(const Component& c, const PureFluidModel& pf, scalar T_K,
                  scalar edge, scalar scale, bool above)
{
    const std::string key = "pureFluidSaturationJoin:" + c.name()
                          + (above ? ":above" : ":below");
    if (AdvisoryLog::instance().passHas(key)) return;

    std::ostringstream m;
    m << "asked at T = " << T_K << " K, " << (above ? "above" : "below")
      << " the " << pf.type() << " saturation window of '" << c.name()
      << "', the record's vapour-pressure correlation answers SCALED by the "
      << pf.type() << "/record ratio at the window edge (" << edge
      << " K: factor " << scale << "), so the saturation pressure is"
         " continuous across the edge -- a numerical join for a solver in"
         " transit, not a measured vapour pressure";
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

        //  THE JOIN (C245 slice 5a, audit Rank 8).  The record's correlation
        //  and the method's curve disagree at the window edge (water's
        //  Antoine against IF97: +17.6 % at 647.096 K, 0.07 % at 273.15 K),
        //  so switching from one to the other was a STEP in Psat.  Outside
        //  the window the record's curve is SCALED by the method/record
        //  ratio at the edge: the value is continuous there (to round-off)
        //  and the record's shape carries on, itself continued by the base
        //  class beyond its own windows.  Announced once per component and
        //  side.
        const bool above = (T_K > w.second);
        const scalar edge = above ? w.second : w.first;
        const scalar rec  = c.vp().Psat_Pa(edge);
        const scalar scale = (rec > 0.0 && std::isfinite(rec))
                           ? pf->p_sat(edge) / rec : 1.0;
        announceJoin(c, *pf, T_K, edge, scale, above);
        return scale * c.vp().Psat_Pa(T_K);
    }
    //  NO MODEL AT ALL: refuse by name, never dereference an absent
    //  correlation (`Component::vp()` does not check, and a null model is a
    //  segmentation fault no caller's `catch` can see).
    if (!c.hasVaporPressure())
    {
        std::ostringstream m;
        m << "saturationPressure: '" << c.name() << "' was asked for its"
             " saturation pressure at T = " << T_K << " K, but its record"
             " declares no vapour-pressure correlation and the package"
             " selects no pure-fluid method for it, so nothing can answer."
             "  Curate a `vaporPressure {}` block on the record, select a"
             " pure-fluid method for it in the thermophysical system, or do"
             " not ask a saturation question of a component that has none.";
        throw std::runtime_error(m.str());
    }
    return c.vp().Psat_Pa(T_K);
}

} // namespace Choupo
