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
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  GibbsMapOp --- iso-line EQUILIBRIUM MAPS over the (T, P) plane: the Gibbs
  reactor's answer (element-potential minimisation, the SAME kernel) swept
  over a temperature x pressure grid, with a chosen metric per cell.
  Forum-ratified design: docs/design/gibbs-map-forum-2026-07-02.md.

  Dictionary form:

        {
            name      nh3_map;
            type      gibbsMap;
            elements  ( N H );
            species   ( { name N2;  atoms ( 2 0 ); }
                        { name H2;  atoms ( 0 2 ); }
                        { name NH3; atoms ( 1 3 ); } );
            feed      { N2 1.0; H2 3.0; }               // moles (basis-free)
            Tgrid     { from 573.15; to 973.15; n 25; } // K
            Pgrid     { from 1.0e5; to 3.0e7; n 25; log true; }  // Pa
            temperatureApproach 0.0;                     // K [optional]
            metric    { type moleFraction; species NH3; }
            // or:     { type elementYield; element N; product NH3; }
            anchors   ( { T 673.15; P 1.0e6; } ... );    // golden pin points
            output    { file nh3_map.csv; }
        }

  CSV columns: T_K, P_Pa, deltaT_K, converged, metric, x_<species...> --
  deltaT as a COLUMN so downstream plots can never orphan it (the forum's
  point-of-consumption rule); unconverged cells carry metric = NaN and
  converged = 0 (the GUI hatches them -- NEVER interpolated).  Anchor KPIs
  embed the approach in their NAME (metric_T673_P10atm_dT25) so a changed
  deltaT breaks goldens loudly.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

namespace Choupo {

class GibbsMapOp : public PropertyOperation
{
public:
    const std::string& type() const override
    { static const std::string t = "gibbsMap"; return t; }

    int run(const DictPtr& dict, const ThermoPackage& thermo, int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override { return diag_; }

    std::vector<std::string> headline() const override { return headline_; }

private:
    std::map<std::string, scalar> diag_;
    std::vector<std::string> headline_;
};

} // namespace Choupo
