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
Class
    Choupo::PropertyScanBinary

    The BINARY liquid-liquid teaching instrument: the molar Gibbs energy of
    mixing g_mix(x1) = R T [ x1 (ln x1 + ln gamma1) + x2 (ln x2 + ln gamma2) ]
    swept across composition, PLUS the two coexisting liquid compositions read
    from a single liquid-liquid IsothermalFlash (PhaseSet::LL) at z = (0.5,0.5).
    The two binodal points sit ON the g_mix curve and share its common tangent
    -- so the student reads the two-liquid split straight off the diagram (the
    common-tangent construction IS the concept), rather than trusting a drawn
    dome.  No fit: the tangent points come from the engine flash, the curve from
    the same gamma model.  A miscible system (no LL split) is reported honestly.

    OPTIONAL `stability { feed { <comp> <z>; } }` (2026-11-25, the how-many-
    phases EduTool): absent, nothing below changes.  Present, the operation
    publishes three more tables on the same grid -- `activity` (ln gamma and
    a_i = x_i gamma_i), `tpd` (the tangent-plane distance tm(y) of the declared
    feed along the trial composition) and `stationary` (the verdict of the
    engine's own Michelsen test, solver::michelsenTPD, on that feed) -- plus
    `binodalActivity` (a_i in each coexisting liquid), and runs the flash at
    verbosity 3 so its Michelsen line is in the log.

    Output (LONG-form CSV; the GUI's binary-LLE plot reads it):

        x1,gmix_J_per_mol,role,beta

    `role` = curve (a g_mix sample) | binodal (one of the two coexisting liquid
    compositions; `beta` carries its phase fraction).  Exactly zero or two
    binodal rows are emitted.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class PropertyScanBinary : public PropertyOperation
{
public:
    PropertyScanBinary() = default;

    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override
    {
        return diag_;
    }

    //  THE LLE MAP AS TABLES AND A FIGURE (C480).  Before, the map existed only
    //  as the CSV it wrote.  Two tables, the very rows of that CSV:
    //  `gmix` (x1 [-], gmix [J/mol]: the swept curve) and `binodal` (x1, gmix,
    //  beta: the two coexisting liquids -- empty when the model predicts
    //  miscibility).  The default view draws the curve, the two binodal points
    //  and the common tangent through them (a line of the two points).
    std::vector<PublishedTable> publishedTables() const override { return tables_; }
    std::string diagnosticUnit(const std::string& key) const override
    {
        if (key == "T") return "K";
        if (key == "split") return "-";
        return {};
    }
    std::string defaultViews(const std::string& opName) const override;

private:
    std::vector<PublishedTable> tables_;
    std::vector<PublishedTable> extraTables_;
    bool        stability_ = false;
    bool        split_ = false;
    std::string comp1_;
    inline static const std::string type_ = "propertyScanBinary";
    std::map<std::string, scalar>   diag_;
};

} // namespace Choupo
