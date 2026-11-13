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
    Choupo::liquidProperty::MassWithoutVolume

Description
    THE DECLARED HYPOTHESIS `massWithoutVolume` as a leaf (DEV.md 4c C378
    pilot; docs/design/density-pilot-plan.md section 6).  A component the
    case lists in

        approximations { massWithoutVolume { components ( NaCl );
                         maxMassFraction 0.05; reason "..."; } }

    keeps its mass and adds NO volume to `idealMixing`:

        rho = sum_all x_i M_i / sum_unlisted x_i v_i
            = rho_rest / (1 - w_listed)          (one listed solute)

    It is the LAST leaf of a component (a measured or catalogue volume always
    wins), never stands in front of a solution record that applies, and is
    bounded: when the SUM of the listed components' mass fractions in the
    liquid exceeds `maxMassFraction` the request is a typed domain error
    naming the bound and that the case declared it (`IdealMixing`).  No
    neutral value enters a mean: without the declaration a component with no
    volume is refused (rule 6 of the routes record).
\*---------------------------------------------------------------------------*/

#pragma once

#include "DensityLeaf.H"

namespace Choupo {
namespace liquidProperty {

class MassWithoutVolume : public DensityLeaf
{
public:
    explicit MassWithoutVolume(const Binding& b) : DensityLeaf(b) {}

    std::string id() const override { return "massWithoutVolume"; }
    scalar      molarVolume(scalar, scalar) const override { return 0.0; }
    std::string routeKey() const override { return "massWithoutVolume"; }
    int         routeRank() const override { return 30; }
    std::string routeWords(const std::vector<std::string>& listed) const override;
    std::string statedDatum() const override;
    std::string datum() const override { return statedDatum(); }
    std::string origin() const override { return "assumed"; }
    bool        isMassless() const override { return true; }
    //  A component with no volume has no volume to compress: it does not stop
    //  the mixture's pressure statement from being the other leaves'.
    bool        pressureApplied() const override { return true; }
};

} // namespace liquidProperty
} // namespace Choupo
