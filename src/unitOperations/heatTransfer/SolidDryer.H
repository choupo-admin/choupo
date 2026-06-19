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
    Choupo::SolidDryer

Description
    Solid dryer (contact / through-circulation) --- additional drying of a
    wet powder, downstream of a spray dryer or filter.

    Takes a WET solid (crystals/powder in s[] carrying residual moisture as
    bound water in the fluid flow F) and dries it further toward the
    EQUILIBRIUM moisture of the material at the drying-air condition:

        X_final  =  min(X_in,  X_e )
        X_e      =  GAB(a_w = relativeHumidity )   on the solid's sorption isotherm

    where X = kg water / kg dry solid.  The removed water leaves as vapour;
    the duty Q = water_removed · ΔHvap is a RESULT.

    Equilibrium vs kinetics, the project rule: the equilibrium isotherm lives
    on the solid component's `sorption {}` block; a falling-rate KINETICS
    (constant/dryingKinetics, the residence-limited X) would refine this --
    here the steady model dries to equilibrium (enough residence assumed).

    Hardware-only operation: the drying-air `airTemperature` + `relativeHumidity`.
    Inputs (wetSolid );   Outputs (drySolid  vapour );
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

namespace Choupo {

class SolidDryer : public UnitOperation
{
public:
    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream>    producedStreams() const override { return produced_; }
    std::map<std::string, scalar> kpis()            const override { return kpis_; }

private:
    inline static const std::string type_ = "solidDryer";
    std::vector<ProcessStream>       produced_;
    std::map<std::string, scalar>    kpis_;
};

} // namespace Choupo
