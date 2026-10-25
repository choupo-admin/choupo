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
                membrane  NanoFiltranExample;       // a record with poreModel {}
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

    Two optional keys (DEV.md 4c C145, the NanoFiltran paper's cases):
      chargeDensity -38.2;      // mol/m3, signed: replaces the membrane
                                // record's X_d for THIS op (a charge fitted
                                // as a function of the feed has no single
                                // value a record could carry); announced
      profile pore_N350.csv;    // write every point's solved pore: x over
                                // the equivalent thickness dx/A_k, each ion
                                // species' c [mol/m3] and psi [V] (a run
                                // output, like every props CSV)

    Diagnostics, per J_v point p (1-based) and per ion species (an ion
    carried by two salts is summed): `c_bulk_<ion>_p<p>` (the feed the point
    sees, so a plot of rejection against feed concentration reads its
    abscissa off the run), `c_wall_<ion>_p<p>`, `c_perm_<ion>_p<p>`
    [mol/m3], `Rreal_<ion>_p<p>` = 1 - c_perm/c_wall, `Robs_<ion>_p<p>` =
    1 - c_perm/c_bulk -- NanoFiltran's two definitions -- and
    `permeateCharge_max`, the worst |sum z c_perm| / sum |z| c_perm.  Where
    the law solved a pore (DSPM-DE, every positive J_v): `dPsi_m_V_p<p>`,
    the potential difference across the membrane as Geraldes & Alves (2008)
    define it (their Table 2's Delta Psi_m: the permeate's potential
    against the feed-side solution at the wall, psi_m = 0, both Donnan jumps
    included; volts with the CODATA R and F), and `poreNewton_p<p>` /
    `poreContinuations_p<p>`, the station's Newton iterations and whether it
    took the continuation -- the first point from the seed, each later one
    warm-started from the point before it -- and `poreNodes_p<p>`, the node
    count the pore was solved on (the abscissa of a grid study).  Every
    diagnostic publishes its unit (diagnosticUnit).

    PUBLISHED TABLES (DEV.md 4c C147), named so a view (the propsDict's
    `views`, or this op's defaults) draws them: `points`, one row per J_v point carrying the per-point diagnostics
    as columns (c_bulk_/c_wall_/c_perm_<ion>_molm3, Rreal_/Robs_<ion>, and
    dPsi_m_V, poreNewton, poreNodes where a pore was solved); and `pore`,
    every point's solved pore -- point, Jv_mps, node, xi, x_um,
    c_<ion>_molm3, psi_V: the columns of the `profile` CSV, which is written
    FROM it -- with or without the CSV.
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
    std::vector<PublishedTable> publishedTables() const override { return tables_; }
    std::string diagnosticUnit(const std::string& key) const override;
    //  DEFAULT VIEWS (DEV.md 4c C149): the observed rejection of every ion
    //  against J_v where the op ran two points or more, and -- where the op
    //  writes its profile -- the ions and the potential across the pore of
    //  its last point.
    std::string defaultViews(const std::string& opName) const override;

private:
    inline static const std::string type_ = "poreTransport";
    std::map<std::string, scalar> diag_;
    std::vector<PublishedTable> tables_;
    std::vector<std::string> ions_;          // the ion species, first-appearance order
    std::vector<std::string> poreIons_;      // those the pore carries (an excluded one does not)
    std::size_t nPoints_ = 0;
    bool profileWritten_ = false;
};

} // namespace Choupo
