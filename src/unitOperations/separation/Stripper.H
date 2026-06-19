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
    Choupo::Stripper

Description
    Counter-current multistage gas stripper --- the inverse of the
    absorber.  A rich liquid enters the top; a lean stripping gas (air,
    steam, N2) enters the bottom; over N theoretical stages the solute
    transfers OUT of the liquid INTO the gas.  Same coupled mass + energy
    stage solver as the absorber (the tridiagonal is identical: liquid
    enters the top, gas the bottom) --- only which stream carries the
    solute (here the liquid) and the reported results differ.

    Credo-pure hardware: the operation block carries only `stages`.  The
    per-solute removal (stripping recovery) is a RESULT.

    Key dimensionless group is the STRIPPING factor S_i = K_i V / L
    (= 1/A, the inverse of the absorption factor): S > 1 strips well.
    Raising T (warmer gas/steam) raises K and so S --- but stripping is
    ENDOTHERMIC (desorption), so the column COOLS, which lowers K and
    self-limits the stripping (the mirror image of the absorber's exotherm).
    K_i for a Henry-law solute is H_i(T)/P; the energy balance falls back
    to isothermal when Cp / heat-of-solution data are absent.

    EXPLICIT ASSUMPTIONS (glass-box): counter-current, N equilibrium
    stages, constant L/V (dilute), lean entering gas, solvent stays in
    the liquid (no evaporation).

    Inputs  (liquidFeed  strippingGas );
    outputs (strippedLiquid  richGas );
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

namespace Choupo {

class Stripper : public UnitOperation
{
public:
    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream>    producedStreams() const override { return produced_; }
    std::map<std::string, scalar> kpis()            const override { return kpis_; }
    std::optional<UnitProfile>    profile()         const override { return profile_; }

private:
    inline static const std::string type_ = "stripper";
    std::vector<ProcessStream>       produced_;
    std::map<std::string, scalar>    kpis_;
    std::optional<UnitProfile>       profile_;
};

} // namespace Choupo
