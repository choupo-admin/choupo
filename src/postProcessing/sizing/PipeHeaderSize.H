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
    Choupo::PipeHeaderSize

Description
    A HEADER IS SIZED BY ITS VELOCITY (DEV.md 4c C199, the pipe and header
    sizer).  The feed, brine and permeate headers of a vessel rack carry the
    flow of a whole train, and the drawing of a rack showed them dashed
    because no pipe was sized.  This sizer is the smallest honest answer:
    it reads a line's volumetric flow from the NAMED stream (per train where
    `perTrain yes;`), takes a DECLARED velocity window and a DECLARED list of
    inside diameters the case can buy, picks the smallest diameter whose
    velocity is inside the window, and publishes the pressure drop per metre
    at that diameter.  No pipe schedule table is carried (ASME B36.10, DIN and
    ISO tables are no-grant standards): the list is the CASE's, author-set,
    with the reason.

    DECLARED (every number carries origin, source, reason; nothing defaults):

        headers ( { role feed; stream roFeed; [velocity / nominalSizes /
                    roughness / viscosity override] } ... );
        velocity     { min <m/s>; max <m/s>; origin; source; reason; }
        nominalSizes { sizes ( { insideDiameter <m>; } ... ); origin; source;
                       reason; }
        roughness    { value <m>; source; reason; }
        frictionModel <word>;       (a registered FrictionFactorCorrelation)
        viscosity    { value <Pa.s>; source; reason; }   (optional: otherwise
                       the case's liquid-viscosity model; neither REFUSES)

    A block may sit on the entry (shared by its headers) or on one header
    (which wins).  A missing block, a window with min >= max, an empty list or
    a diameter that is not positive REFUSES by name.

    READ: the stream's mass flow, temperature and pressure; the density is
    `phaseDensity::of` (the case's package, announced); the viscosity as
    above.  Q_train = m / rho / trains.

    COMPUTED (the gate recomputes every one from the case's dicts):

        D_required = sqrt( 4 Q / (pi v_max) )   the smallest bore at v_max
        D_nominal  = the smallest declared bore >= D_required, provided its
                     velocity v = 4 Q / (pi D^2) is still >= v_min; if none
                     fits the sizer REFUSES, naming the window, the required
                     bore and the list
        Re         = rho v D / mu
        f          = the declared correlation at (Re, eps / D)
        dP/L       = f / D x rho v^2 / 2        (Darcy-Weisbach; Pa/m)

    PUBLISHED, units on every key: requiredInsideDiameter, nominalInsideDiameter,
    headerNominalDiameter (= the nominal bore; the key the GUI's rack
    elevation reads), velocity, velocityMin, velocityMax, flow, density,
    viscosity, reynolds, frictionFactor, pressureDropPerMetre.  NOT COSTED (no
    cost set is read); NOT PLACED (a header is part of the rack the plot plan
    places; the routed pipes of C80 stay the layout's).

    NOT MODELLED, said in the basis: the header's length and fittings (the
    drop is per metre, not total), the wall thickness and pressure class, the
    change of flow along a manifold (the header is sized at the full flow of a
    train, the most severe reading), surge.
\*---------------------------------------------------------------------------*/

#pragma once

#include "EquipmentSize.H"

#include <string>
#include <vector>

namespace Choupo {

class PipeHeaderSize : public EquipmentSize
{
public:
    const std::string& type() const override { return type_; }

    std::vector<EquipmentSizing> size(const std::string& unitName,
        const SimulationResult& result,
        const Material&         material,
        const DictPtr&          designRules) const override;

private:
    inline static const std::string type_ = "pipeHeader";
};

} // namespace Choupo
