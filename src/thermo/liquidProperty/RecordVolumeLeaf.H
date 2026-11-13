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
Class
    Choupo::liquidProperty::RecordVolumeLeaf

Description
    THE COMPONENT RECORD'S OWN LIQUID VOLUME, on the route its data support
    (DEV.md 4c C378 pilot; plan section 1, the three `recordVolume` rows).
    Registered three times, once per route:

        recordVolume.anchoredRackett   `Vliq` at `VliqT` (25 C when absent),
                                       carried in T by Rackett's shape
        recordVolume.flatVliq          `Vliq` with no critical constants:
                                       the datum, no temperature effect
        recordVolume.bareRackett       no `Vliq`: Rackett from Tc, Pc, omega
                                       (an estimate; origin `estimated`)

    KEPT BIT FOR BIT: the volume is `ThermoPackage::liquidMolarVolumeOf`,
    the per-component body of the package's own liquid density, so a set
    priced by `idealMixing` over these leaves equals `ThermoPackage::density`
    to the last bit (the route bench checks it).  Pressure is not applied
    (Rackett and a stored volume carry none); above a component's critical
    temperature the volume is refused by name, a hard limit.
\*---------------------------------------------------------------------------*/

#pragma once

#include "DensityLeaf.H"

namespace Choupo {
namespace liquidProperty {

class RecordVolumeLeaf : public DensityLeaf
{
public:
    RecordVolumeLeaf(const Binding& b, int route);

    std::string id() const override;
    scalar      molarVolume(scalar T_K, scalar P_Pa) const override;
    std::string routeKey() const override;
    int         routeRank() const override;
    std::string routeWords(const std::vector<std::string>& statedAt) const override;
    std::string statedDatum() const override;
    std::string datum() const override;
    std::string origin() const override;

private:
    int route_;
};

} // namespace liquidProperty
} // namespace Choupo
