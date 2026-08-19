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
    Choupo::EnthalpyConcentration

    THE ENTHALPY-CONCENTRATION LOCUS of a binary at one pressure -- the data
    an enthalpy-concentration (Ponchon-Savarit) construction is drawn on, and
    the first surface in the engine that publishes SATURATED-PHASE ENTHALPY
    AGAINST COMPOSITION.  A McCabe-Thiele diagram carries equilibrium and
    material balance under CONSTANT MOLAR OVERFLOW; this locus carries the
    enthalpy too, so abandoning that assumption becomes something a reader can
    SEE rather than be told.  Nothing here is a construction: the op publishes
    the two saturation curves and the equilibrium ties, and a drawing tool
    adds the difference point and the lever arms.

    EVERY ROW IS ONE EQUILIBRIUM.  A row carries BOTH ends of a tie line --
    the liquid (x1, h_liquid) and the vapour (y1, H_vapour) that are in
    equilibrium with each other -- at the ONE temperature they share.  So a
    consumer never pairs rows by index and never interpolates one end of a
    tie; and the two saturation curves are simply the two ends read off the
    same rows.  `role` says which composition was the GRID node:

        role bubble : x1 = the uniform grid node.  T_K is its bubble
                      temperature and y1 = K(T,x)*x1 is the vapour in
                      equilibrium with it.
        role dew    : y1 = the uniform grid node.  T_K is its dew
                      temperature and x1 is the liquid in equilibrium
                      with it.

    Both roles are solved through the SAME saturation kernel
    (`BubblePoint::compute`): the dew locus of a binary IS the image of its
    bubble locus under the equilibrium map, so a dew node is found by
    inverting  y_eq(x) = y1  rather than by a second residual with a second
    tolerance.  Two independent solvers would give tie lines that land NEAR
    the vapour curve instead of ON it, and a Ponchon construction whose ties
    miss the curve they end on is exactly the geometry the diagram is for.

    THE DATUM IS THE PROJECT'S ONE DATUM -- the elements at 298.15 K:

        h_liquid  = ThermoPackage::H_liquid_formation(T_sat, x)
        H_vapour  = ThermoPackage::H_stream_formation(T_sat, P, 1.0, y)

    the same two calls every energy balance, duty and published stream H is
    priced on.  A component that cannot reach that datum is REFUSED BY NAME
    with the remedy; the op NEVER substitutes a private Cp integral, because
    the construction's lever arms are enthalpy DIFFERENCES and an
    inconsistent datum would draw a diagram that is geometrically pretty,
    physically meaningless, and shows nothing on its face to say so.

    Output: `output.file` (a regular CSV table) plus the `.meta` sidecar
    beside it (the data/metadata separation the element-balance and ctrl
    ledgers already use).  The sidecar states the components, the pressure,
    THE DATUM, which routes computed each column, what is omitted, and the
    reason for every refused node.  An offset in the datum cancels in the
    construction's lever arms -- which is exactly why a consumer must be able
    to read what the axis means instead of assuming it.

        CSV : x1,y1,T_K,h_liquid_J_per_mol,H_vapour_J_per_mol,role,status
        meta: key,value
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class EnthalpyConcentration : public PropertyOperation
{
public:
    EnthalpyConcentration() = default;

    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override
    {
        return diag_;
    }

    std::vector<std::string> headline() const override
    {
        return { "lambda_min_J_per_mol", "lambda_max_J_per_mol",
                 "n_nodes", "n_refused" };
    }

private:
    inline static const std::string type_ = "enthalpyConcentration";
    std::map<std::string, scalar>   diag_;
};

} // namespace Choupo
