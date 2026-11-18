/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
-------------------------------------------------------------------------------
Description
    ThermoPackage::flowCurveFor (declared in ThermoPackage.H, C421 (7)), defined
    HERE so that ThermoPackage.cpp keeps its line numbers (the EduTool lessons
    cite it by line).
\*---------------------------------------------------------------------------*/

#include "thermo/ThermoPackage.H"

namespace Choupo {

const rheology::FlowCurve* ThermoPackage::flowCurveFor(const sVector& x) const
{
    if (flowCurves_.empty()) return nullptr;
    std::vector<std::size_t> set;
    for (std::size_t i = 0; i < x.size() && i < components_.size(); ++i)
        if (x[i] > 0.0) set.push_back(i);
    for (const auto& c : flowCurves_)
        if (c.set == set) return &c;
    return nullptr;
}

} // namespace Choupo
