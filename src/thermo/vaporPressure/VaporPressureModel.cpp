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

#include "VaporPressureModel.H"
#include "Antoine.H"
#include "AmbroseWalton.H"

#include "core/Advisory.H"

#include <iomanip>
#include <iostream>
#include <map>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>

namespace Choupo {

std::map<std::string, VaporPressureModel::Factory>&
VaporPressureModel::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void VaporPressureModel::registerModel(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<VaporPressureModel>
VaporPressureModel::New(const DictPtr& dict)
{
    const std::string modelName = dict->lookupWord("model");
    auto it = registry().find(modelName);
    if (it == registry().end())
        throw std::runtime_error("Unknown vapor-pressure model '" + modelName +
            "'.  Available: " + [&]() {
                std::string s;
                for (const auto& kv : registry()) s += " " + kv.first;
                return s.empty() ? std::string(" (none)") : s;
            }());
    auto m = it->second(dict);
    //  ONE place stamps the owner, for every model -- the same reason the
    //  check itself lives on the base.  `Component::readFromDict` injects
    //  `owner` into the sub-dict before calling here.
    if (m && dict->found("owner")) m->setOwner(dict->lookupWord("owner"));
    if (m && dict->found("Tc"))    m->setCriticalT(dict->lookupScalar("Tc"));
    return m;
}

//  Trim a temperature for a message: 354.07 stays, 354.000000 does not.
static std::string trimNum(scalar v)
{
    std::ostringstream os;
    os << std::setprecision(6) << v;
    return os.str();
}

void VaporPressureModel::noteRange(scalar T_K) const
{
    if (announcedOutside_) return;                 // one bool test, hot path

    const auto [lo, hi] = range();
    if (lo == 0.0 && hi == 0.0) return;            // no window declared
    if (hi <= lo)               return;            // not a window; not ours to judge
    if (T_K >= lo && T_K <= hi) return;

    announcedOutside_ = true;
    const std::string who =
        owner_.empty() ? modelName() + " vapour pressure"
                       : "component '" + owner_ + "'";

    //  TWO PHYSICALLY DIFFERENT SITUATIONS, and the corpus made the
    //  distinction unavoidable rather than nice-to-have (measured 2026-08-06:
    //  111 of 332 cases evaluate outside a window, and the excursions are
    //  BIMODAL -- a cluster of a few kelvin, and a cluster of hundreds).
    //
    //    * ABOVE Tc there is NO vapour-liquid saturation at all.  N2 in
    //      `gibbs06_h2_flame_radicals` is asked for a saturation pressure at
    //      2400 K against a critical temperature of 126.2 K -- nineteen times
    //      Tc.  Calling that "extrapolated beyond the fit" is not merely
    //      imprecise, it is WRONG in a way that teaches the wrong physics: it
    //      implies a curve exists that could be extended further.  None does.
    //      The substance stopped being a vapour and became a gas 2274 K ago.
    //
    //    * BELOW Tc and outside the window is a genuine extrapolation of a
    //      real curve, and the honest report is exactly that.
    //
    //  The branch is on Tc -- a datum every record already carries -- NOT on
    //  the size of the excursion.  A magnitude threshold was considered and
    //  rejected: it is an arbitrary constant, and it would hide precisely the
    //  case where a fit degrades sharply just past its edge.
    const bool supercritical = (Tc_declared_ > 0.0 && T_K > Tc_declared_);

    if (supercritical)
    {
        AdvisoryLog::instance().add(
            "validity", "warning", who,
            "vapour pressure requested at T = " + trimNum(T_K) + " K, ABOVE"
            " its critical temperature Tc = " + trimNum(Tc_declared_)
            + " K -- there is no saturation state there; the value returned"
              " is not a vapour pressure");
        std::cerr << "[psat] " << who << ": vapour pressure requested at T = "
                  << trimNum(T_K) << " K, ABOVE its critical temperature Tc = "
                  << trimNum(Tc_declared_) << " K.\n     Above Tc a substance"
                     " is a GAS, not a vapour: no pressure condenses it and no"
                     " vapour-liquid saturation curve exists to evaluate.  The"
                     " number returned by " << modelName() << " there is not a"
                     " vapour pressure, and anything computed from it (a"
                     " K-value, a Raoult partial pressure) inherits that.\n";
        return;
    }

    AdvisoryLog::instance().add(
        "validity", "warning", who,
        "vapour pressure evaluated at T = " + trimNum(T_K) + " K, OUTSIDE its"
        " declared Trange (" + trimNum(lo) + " " + trimNum(hi)
        + ") -- extrapolated, still returned");
    std::cerr << "[psat] " << who << ": " << modelName()
              << " evaluated at T = " << trimNum(T_K)
              << " K, OUTSIDE its declared Trange (" << trimNum(lo) << " "
              << trimNum(hi) << ").\n     The saturation pressure is"
                 " extrapolated: it is still returned (I4 -- extrapolation is"
                 " a legitimate choice), but it is no longer covered by the"
                 " fit, and every K-value computed from it inherits that.\n";
}

void VaporPressureModel::registerBuiltins()
{
    registerModel("Antoine",
        [](const DictPtr& d) -> std::unique_ptr<VaporPressureModel>
        { return std::make_unique<Antoine>(d); });

    registerModel("AmbroseWalton",
        [](const DictPtr& d) -> std::unique_ptr<VaporPressureModel>
        { return std::make_unique<AmbroseWalton>(d); });
}

} // namespace Choupo
