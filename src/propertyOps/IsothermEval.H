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
    Choupo::IsothermEval

Description
    choupoProps operation `isothermEval` --- evaluate ONE curated adsorption
    isotherm record (adsorbent x adsorbate, from the pair catalogue
    data/standards/parameters/adsorption/equilibria/, or a case-local
    overlay via the AdsorbentRegistry cascade) on a declared (T, p) grid,
    and run the A1b physics gates of the adsorption contract (sections 2/5):

      (a) HENRY LIMIT      q(T, p_low)/p_low -> henryLimit(T) = dq_dp(T, 0)
                           as p_low -> 0; checked at p_low = 1e-3 * p_ref
                           (p_ref = 1 Pa, the canonical-SI unit pressure) to
                           1e-6 relative.
      (b) SATURATION       q monotonically non-decreasing in p along the grid
                           AND q(T, p_big) -> q_sat with p_big chosen so
                           b(T)*p_big = 1e4 (theta = 0.9999); Henry-model
                           records have no saturation --- the gate reports
                           that trait instead of pretending.
      (c) ANCHOR PIN       the loaded model's affinity(tRef) reproduces the
                           record's raw b_298 (langmuir) / its Henry
                           coefficient reproduces H_298 (henry) to 1e-12 ---
                           loader arithmetic vs record, no drift.
      (d) UNIT INVARIANCE  optional `unitTwin <adsorbent>;` names a twin
                           adsorbent whose record declares the SAME physics
                           in a DIFFERENT pressureBasis (Pa vs bar); every
                           grid point must agree to 1e-12 relative.

    Dictionary form (grid values are RAW canonical SI: T [K], p [Pa]):

        {
            name       eval_13x_co2;
            type       isothermEval;
            adsorbent  zeolite13X;
            adsorbate  CO2;
            grid     { T ( 293.15 313.15 333.15 );  p ( 1.0e3 1.0e4 1.0e5 ); }
            unitTwin   zeolite13X_paTwin;          // optional, gate (d)
            output   { file isotherm_13x_co2.csv; } // optional q(T,p) table
        }

    KPIs (diagnostics): per grid temperature T<i> --- henry_T<i>
    [mol/kg/Pa], b_T<i> in the record's DECLARED basis; qsat + tRef; each
    gate as 0/1 plus its measured deviation.  A failed gate FAILS the run
    (non-zero rc) --- these are gates, not decoration.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <string>
#include <vector>

namespace Choupo {

class IsothermEval : public PropertyOperation
{
public:
    IsothermEval() = default;

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
        return { "gates_pass", "qsat", "henry_T0" };
    }

private:
    inline static const std::string type_ = "isothermEval";
    std::map<std::string, scalar>   diag_;
};

} // namespace Choupo
