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
    Choupo::membrane::GelPolarisation

Description
    ULTRAFILTRATION BY GEL POLARISATION (Michaels, Chem. Eng. Prog. 64(12)
    (1968) 31-43; Blatt, Dravid, Michaels & Nelsen, in Membrane Science and
    Technology, Plenum (1970) 47-97) -- transport law `gelPolarisation`,
    Vitor's ruling 2026-09-30.

    A UF membrane passes the solvent by viscous flow through its pores, so
    far from the limit the flux is pressure-controlled, J = A_w dP, with the
    osmotic pressure of a MACROMOLECULAR solute neglected (it is small at the
    molar concentrations a protein reaches -- the assumption of the gel
    model, stated here and on the run).  The retained solute accumulates at
    the wall by the film law with a convective permeate:

        (c_m - c_p) / (c_b - c_p) = exp(J / k),     c_p = S c_m

    where S is the solute's INTRINSIC sieving coefficient, DECLARED by the
    case (no MWCO model yet -- the ruling; the case must say where its S
    comes from).  Solved for the wall:

        c_m = c_b e / (1 - S + S e),     e = exp(J / k).

    When the pressure-controlled flux would push the gel-forming solute's
    wall concentration above its gel concentration c_g, the wall is pinned
    at c_g and the flux becomes MASS-TRANSFER controlled, independent of
    pressure (the plateau every UF student is shown):

        J_lim = k ln( c_g (1 - S) / (c_b - S c_g) ),

    which is Michaels' J = k ln(c_g / c_b) when S = 0.  At c_b >= c_g the
    channel is gelled through and J = 0.  Every solute leaves by convection,
    J_s = J c_p.

    Declared in the unit's `operation` (the spiral-wound module and the
    batch diafilter read `transportParameters {}` alike):

        transport  gelPolarisation;
        transportParameters
        {
            gel
            {
                solute    BSA;          // the gel-forming solute
                c_gel     250;          // its gel concentration, kg/m3
                sieving   { BSA 0.0; }  // S for EVERY solute
                source    "...";        // where c_g and S come from
            }
        }

    The film coefficient is the Polarisation object's k for each solute (a
    declared k_film or the module's correlation); the suction corrections
    of that object are NOT applied here -- the gel model is the classic
    film law, said on the run.
\*---------------------------------------------------------------------------*/

#pragma once

#include "TransportModel.H"

#include <map>
#include <string>

namespace Choupo {
namespace membrane {

class GelPolarisation : public TransportModel
{
public:
    const std::string& type() const override
    { static const std::string t = "gelPolarisation"; return t; }

    void readParameters(const DictPtr& params) override;

    TransportSolution localFluxes(const TransportContext& ctx) const override;

private:
    bool                          read_ = false;
    std::string                   gelSolute_;
    scalar                        cGelMass_ = 0.0;    // kg/m3
    std::map<std::string, scalar> sieving_;
};

} // namespace membrane
} // namespace Choupo
