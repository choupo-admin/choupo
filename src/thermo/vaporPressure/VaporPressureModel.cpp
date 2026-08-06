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
