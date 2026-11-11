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
    Choupo::StoredCorrelation

Description
    Liquid surface tension from a MEASURED correlation stored on the
    component record, with Brock-Bird as the announced fallback:

        sigma(T) = A tau^n + B tau^(n+1),     tau = 1 - T/Tc       [N/m]

    read from the component's own optional block

        surfaceTension { A; B; Tc; n; Tmin; Tmax; }

    (A [N/m]; B [N/m], default 0; Tc [K]; n dimensionless; Tmin/Tmax the
    validity window [K]).  With B = 0 this is the Guggenheim power law,
    whose two parameters (A, n) the records of DEV.md 4c C327/C328 fit to
    every laboratory the ThermoML archive holds.

    THE WINDOW IS ANNOUNCED, NEVER ENFORCED: outside [Tmin, Tmax] the value
    is still returned and the extrapolation is announced once per component
    through the AdvisoryLog (wording of the viscosity models).  A component
    WITHOUT the block is evaluated by Brock-Bird and the model SAYS SO, once
    per component -- never silently.  The mixture rule stays in
    ThermoPackage::surfaceTension.

    Selected with  surfaceTension { model StoredCorrelation; }, and the
    DEFAULT when `model` is omitted: every shipped case that reads a surface
    tension names `model BrockBird;` itself (the v2 grammar requires the
    word), so no shipped output moves (DEV.md 4c C328).

SourceFiles
    StoredCorrelation.cpp
\*---------------------------------------------------------------------------*/

#pragma once

#include "thermo/SurfaceTensionModel.H"
#include "BrockBird.H"

namespace Choupo {

class StoredCorrelation : public SurfaceTensionModel
{
public:
    explicit StoredCorrelation(const DictPtr& dict) : fallback_(dict) {}

    const std::string& modelName() const override { return name_; }
    scalar sigmaPure(const Component& c, scalar T_K) const override;

    // The stored power law: one home for the arithmetic.
    static scalar kernel(scalar A, scalar B, scalar n, scalar Tc, scalar T);

private:
    inline static const std::string name_ = "StoredCorrelation";
    BrockBird fallback_;
};

} // namespace Choupo
