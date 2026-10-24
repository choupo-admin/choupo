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
    Choupo::PolarisationIndex

Description
    THE POLARISATION-INDEX BENCH -- the glass-box surface of the
    multi-ionic concentration-polarisation model of Geraldes & Afonso,
    J. Membr. Sci. 300 (2007) 20-27 (unitOperations/membrane/massTransfer/
    Polarisation.H, the ONE home of the wall concentration).

    Given a mass-transfer correlation, a set of ions (each a component of
    the package with a declared aqueous bridge, so its charge and its
    diffusivity are read off the species record, never off a name) and a
    table of measured operating points (C_{i,b}, C_{i,p}, J_v), the op
    prints per point what the module computes silently at every channel
    node: the per-ion k_{c,i}, phi_i and Xi_i, the wall concentration
    C_{i,m}, the polarisation index Gamma_i = (C_{i,m} - C_{i,b})/C_{i,b},
    the interface potential gradient xi and the electroneutrality residual
    sum_i z_i C_{i,m}.  It is what Fig. 7 of the paper plots (open symbols)
    and what a gate can recompute independently.

        operations
        (
            {
                name     table1;
                type     polarisationIndex;
                T        298.15 K;
                massTransfer { model StirredCell; omega 41.9; radius 2.4 cm;
                               viscosity 8.97e-4; density 1000; }
                polarisation { suctionCorrection GeraldesAfonso2006;
                               ionCoupling electroneutral; }
                ions     ( dye Cl Na );
                closeBy  Na;      // bulk AND permeate of this ion from
                                  // electroneutrality (the paper's Table 1)
                dataset  "constant/experimental/bowen1998_table1";
            }
        );

    The dataset is the experiments grammar (`columns ( { name; unit; } )`
    + a flat `data ( ... )` table): one column `C_b_<ion>` and one
    `C_p_<ion>` per MEASURED ion in mol/m3, and `J_v` in m/s.  The
    `closeBy` ion is derived, never listed.

    Diagnostics: `k_<ion>` (m/s), `Re`, `n_rows`, `Gamma_<ion>_r<n>` and
    `xi_r<n>` per row, `chargeResidual_max`; every one carries its unit.

    PUBLISHED TABLE `rows` (DEV.md 4c C147): one row per operating point --
    `row`, `J_v_mps`, per ion `C_b_<ion>_molm3`, `C_p_<ion>_molm3`,
    `C_m_<ion>_molm3`, `k_<ion>_mps`, `phi_<ion>`, `Xi_<ion>`, `Gamma_<ion>`,
    `Robs_<ion>` = 1 - C_p/C_b (what the cell measures) and `Rreal_<ion>` =
    1 - C_p/C_m (what the membrane does), and `xi_Vpm` -- so a
    `system/postProcessDict` draws one series per ion over the rows (the
    paper's Fig. 7) instead of a list of keys.  Nothing here is a fit: the
    correlation's constants and the ions' D are the case's inputs, the
    Gamma are predictions, and the bench says which is which.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <vector>

namespace Choupo {

class PolarisationIndex : public PropertyOperation
{
public:
    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict, const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override { return diag_; }
    std::vector<std::string> headline() const override
    { return { "n_rows", "chargeResidual_max", "Re" }; }
    std::vector<PublishedTable> publishedTables() const override { return tables_; }
    std::string diagnosticUnit(const std::string& key) const override;

private:
    inline static const std::string type_ = "polarisationIndex";
    std::map<std::string, scalar> diag_;
    std::vector<PublishedTable> tables_;
};

} // namespace Choupo
