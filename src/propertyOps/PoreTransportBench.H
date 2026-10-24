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
    Choupo::PoreTransportBench

Description
    THE PORE-TRANSPORT BENCH -- the DSPM-DE transport law of the membrane
    units (unitOperations/membrane/transport/DSPM_DE.cpp), run at IMPOSED
    permeate fluxes.  The spiral-wound module closes the water flux itself
    (J_w = A_w (dP - dpi)); a nanofiltration pore model is usually STATED,
    taught and compared at a given J_v -- the way NanoFiltran (Geraldes &
    Alves, J. Membr. Sci. 321 (2008) 172-182) takes it as its input.  This
    op builds the same TransportContext the module builds, through the same
    TransportModel factory, the same `transportParameters {}` reader and
    the same Polarisation builder, hands the law `imposedJv`, and prints per
    J_v and per ION the wall and permeate concentrations and the real and
    observed rejections.  Nothing is fitted.

        operations
        (
            {
                name      base;
                type      poreTransport;
                T         298.15 K;
                membrane  NFX_nanofiltran01;        // a record with poreModel {}
                transport DSPM-DE;                  // the only law that takes J_v
                transportParameters
                {
                    poreSolver { method finiteDifference; nodes 401;
                                 wallClosure porePermeate; }
                    hindrance DechadilokDeen2006;
                    activity  ideal;
                    bulkDielectric 80;
                }
                feedMolPerM3 { NaCl 10; MgCl2 20; } // salt components, mol/m3
                J_v       ( 1e-6 5e-5 );            // m/s
                k_film    10;                       // m/s, or massTransfer {}
                polarisation { suctionCorrection GeraldesAfonso2006;
                               ionCoupling electroneutral; }
            }
        );

    `massTransfer { model StirredCell; omega; radius; viscosity; density;
    a; b; c; }` replaces `k_film` when the film coefficient is to come from
    a correlation per ion on the ion's own D.

    Diagnostics, per J_v point p (1-based) and per ion species (an ion
    carried by two salts is summed): `c_wall_<ion>_p<p>`, `c_perm_<ion>_p<p>`
    [mol/m3], `Rreal_<ion>_p<p>` = 1 - c_perm/c_wall, `Robs_<ion>_p<p>` =
    1 - c_perm/c_bulk -- NanoFiltran's two definitions -- and
    `permeateCharge_max`, the worst |sum z c_perm| / sum |z| c_perm.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <vector>

namespace Choupo {

class PoreTransportBench : public PropertyOperation
{
public:
    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict, const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override { return diag_; }
    std::vector<std::string> headline() const override
    { return { "n_points", "permeateCharge_max" }; }

private:
    inline static const std::string type_ = "poreTransport";
    std::map<std::string, scalar> diag_;
};

} // namespace Choupo
