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
\*---------------------------------------------------------------------------*/

#include "MassWithoutVolume.H"

#include "thermo/ApproximationAuthorisation.H"
#include "thermo/ThermoPackage.H"

#include <cstdio>
#include <string>
#include <vector>

namespace Choupo {
namespace liquidProperty {

std::string MassWithoutVolume::statedDatum() const { return comp().name(); }

std::string MassWithoutVolume::routeWords(const std::vector<std::string>& listed) const
{
    std::string names;
    for (std::size_t k = 0; k < listed.size(); ++k) names += (k ? ", " : "") + listed[k];
    if (names.empty()) names = comp().name();
    const auto& a = ApproximationAuthorisation::instance();
    char b[48];
    std::snprintf(b, sizeof b, "%.6g", a.maxMassFractionWithoutVolume());
    return "the case's hypothesis massWithoutVolume: " + names + " keep their mass and"
           " add no volume, while the sum of their mass fractions stays at or below "
           + b + " (\"" + a.reasonMassWithoutVolume() + "\")";
}

} // namespace liquidProperty
} // namespace Choupo
