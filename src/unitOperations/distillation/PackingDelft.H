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
    Choupo::PackingDelft

    THE DELFT MODEL of a corrugated structured packing (Olujic, Kamerbeek &
    de Graauw, Chem. Eng. Process. 38 (1999) 683), as tabulated in its
    working form by Fair, Seibert, Behrens, Saraber & Olujic, Ind. Eng. Chem.
    Res. 39 (2000) 1788, Table 2 (Eqs 1-16, p. 1789: geometry, loading,
    HETP) and Table 4 (Eqs 30-55, p. 1791: holdup, preloading pressure drop,
    effective area, mass-transfer coefficients).  It is the model Schulz et
    al. (2018) compare their A3-500M data with.

    Read from the tables as printed, with ONE reading stated: in psi (Table
    4, Eq 43) the sign inside (d_c^2 ... h_pe^2/tan^2 alpha)^0.5 is not
    legible in the scan; it is taken as MINUS, the chord of the column
    section a channel of an element crosses (with a plus the wall fraction
    would exceed its geometric bound).

    The loading-region enhancement (Table 2, Eqs 8-10) multiplies the
    preloading drop only above the loading-point F-factor F_G,lp.  The model
    has no flooding criterion of its own; `flooded` is never set.  The
    effective area is Table 4's (1 - Omega)/(1 + A/u_Ls^B), A = 2.143e-6,
    B = 1.5 (complete wetting otherwise); Schulz omit only a further
    large-area correction (Olujic et al. 2004) that is not in this table.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PackingRBF.H"

namespace Choupo
{

class PackingDelft
{
public:
    struct Geometry
    {
        scalar ap    = 0.0;   // m2/m3
        scalar eps   = 0.0;
        scalar alpha = 0.0;   // corrugation angle from the horizontal, rad
        scalar b     = 0.0;   // corrugation base, m
        scalar h     = 0.0;   // corrugation height (crimp), m
        scalar hpe   = 0.0;   // element height, m
        scalar hpb   = 0.0;   // bed height, m
        scalar dc    = 0.0;   // column diameter, m
        scalar Omega = 0.0;   // fraction of the surface occupied by holes
    };

    //  The same state and result records as the Rocha-Bravo-Fair model, so
    //  the bed integration reads either.
    static PackingRBF::Result evaluate(const Geometry& g, const PackingRBF::State& s);
};

} // namespace Choupo
