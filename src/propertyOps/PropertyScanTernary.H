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
    Choupo::PropertyScanTernary

Description
    Walk the ternary composition simplex (x1 + x2 + x3 = 1) at a FIXED
    (T, P) and, at every interior node, run the isothermal VLLE flash to
    classify the phase regime (1-phase / VL / LL / VLLE) and collect the
    liquid-liquid tie-lines.  It is the ternary phase-diagram service.

    REUSE, not reimplementation: every node calls the SAME
    `IsothermalFlash::solveCore(...)` the isothermalFlash unit op calls
    (Michelsen-TPD + Gibbs-energy minimisation, multi-start Nelder-Mead),
    so the diagram and a single flash CANNOT disagree.  No physics is
    written here --- the op is a triangular loop + a classifier + a CSV
    writer.

    Dictionary form (note: NO composition under `state` --- the grid IS
    the composition; T and P are the fixed flash conditions):

        {
            name    lle;
            type    propertyScanTernary;
            state   { T 350 K;  P 1 bar; }
            grid    { n 24; }            // intervals per triangle edge
            tieStride 3;                 // emit a tie-line every k-th split node
            output  { file ternary.csv; }
        }

    Requires a thermoPackage with EXACTLY 3 components and a VLLE-capable
    model set (an activity model with a real LL gap, e.g. NRTL, + a vapour
    model), exactly like the vlle03_audit_artificial tutorial.

    Output (LONG-form CSV; the GUI's TernaryPlot reads it):

        x1,x2,x3,region,region_id,kind,tieline_id,beta_vapor,beta_alpha,beta_beta

    `kind` = node (a classified grid point) | tie (one endpoint of a
    liquid-liquid tie-line; the two endpoints share tieline_id).  `region`
    is exactly one of ONE_PHASE | VL | LL | VLLE.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <string>

namespace Choupo {

class PropertyScanTernary : public PropertyOperation
{
public:
    PropertyScanTernary() = default;

    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override
    {
        return diag_;
    }

private:
    inline static const std::string type_ = "propertyScanTernary";
    std::map<std::string, scalar>   diag_;
};

} // namespace Choupo
