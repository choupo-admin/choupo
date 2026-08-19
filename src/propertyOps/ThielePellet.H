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
    Choupo::ThielePellet

Description
    The PROPS BENCH for the single catalyst pellet: it resolves the pellet and
    its effective diffusivity, solves the intraparticle boundary-value problem
    numerically, VERIFIES that answer against the closed form, and publishes
    three things a reader can draw --

      * the intraparticle CONCENTRATION FIELD c(r)/c_s against the normalised
        coordinate (the thing the owner asked to see);
      * the EFFECTIVENESS FACTOR eta and the THIELE MODULUS phi that produced
        it, as diagnostics;
      * swept, the classical eta(phi) family over the three geometries.

    THE PHYSICS IS NOT HERE.  It is in
    `unitOperations/reactor/pellet/PelletDiffusion.{H,cpp}`, where the four
    reactors that today assume eta = 1 will reach it.  A bench that carried its
    own copy of the pellet equation would be a second implementation of one
    model -- the arity sin -- and the GUI tool that draws this must be a VIEW
    over engine numbers for the same reason.

    THE OPERATION DICT

        {
            name       thiele_CO_alumina;
            type       thielePellet;

            catalyst   aluminaSphere3mm;     // a `kind catalyst;` asset record
            species    CO;                   // the diffusing reactant
            T          573.15 K;
            P          1 atm;                // gas route only

            rateConstant     12.0;           // 1/s, per unit PELLET volume
            // rateConstantMass 9.2e-3;      // m3/(kg.s); x rho_particle

            diffusion
            {
                medium           gas;        // gas | liquid
                counterDiffusing N2;         // the binary partner
            }

            nodes 401;                       // grid POINTS, must be ODD

            sweep                            // optional: the eta(phi) family
            {
                phi        ( 0.1 10.0 );     // GENERALISED modulus range
                points     21;               // log-spaced, endpoints included
                geometries ( slab cylinder sphere );
                nodes      201;
            }

            refinement { nodes ( 51 101 201 401 ); }   // optional order study

            verification { field 1e-4; eta 1e-4; sweep 5e-3; }   // optional

            output
            {
                field      pelletConcentrationField.csv;
                sweep      pelletEtaPhi.csv;
                refinement pelletGridRefinement.csv;
            }
        }

    THE PUBLISHED CSV COLUMNS, stated here because a second author draws them:

      field       geometry, phi, phi_char, xi, c_over_cs,
                  c_over_cs_closedForm, absDeviation
      sweep       geometry, phi, phi_char, eta, eta_closedForm,
                  relDeviation, eta_flux
      refinement  geometry, phi, nodes, h, eta, eta_closedForm, relDeviation

    `xi` is the normalised coordinate measured from the pellet CENTRE: r/R for
    a sphere or a cylinder, x/L for a slab.  ONE column, not two aliases -- a
    duplicated coordinate is a second home for one number.

    WHAT THIS OP DOES NOT DO, and will not be made to do: decide whether
    diffusion matters in the reader's case.  It publishes phi, eta, the field
    and the Weisz-Prater observable modulus, and it announces what it assumed;
    judging is not its job, the same posture the engine takes over the
    extrapolated sub-273 K Antoine.  The SWEEP in particular is a PARAMETRIC
    FAMILY over phi -- only the case's own point uses the resolved k, D_eff and
    pellet dimension, and the op says so aloud.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class ThielePellet : public PropertyOperation
{
public:
    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override { return diag_; }

    std::vector<std::string> headline() const override
    {
        return { "phi", "eta", "eta_relDeviation", "D_eff" };
    }

private:
    inline static const std::string type_ = "thielePellet";
    std::map<std::string, scalar> diag_;
};

} // namespace Choupo
