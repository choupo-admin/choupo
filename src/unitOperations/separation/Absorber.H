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
    Choupo::Absorber

Description
    Counter-current multistage gas absorber, solved by the Kremser
    (Souders-Brown) group method.  A gas enters the bottom carrying one
    or more soluble species; a lean solvent enters the top; over N
    theoretical stages the solutes transfer into the liquid.

    Hardware-only operation block (the credo): the parameter is the
    NUMBER OF THEORETICAL STAGES `stages` --- the physical height of the
    column.  The recovery of each solute is a RESULT, not a spec.  "How
    many stages for 95 % recovery?" is a DesignSpec on `$stages`, not a
    mode of this unit.

    Per-component absorption factor and Kremser fraction absorbed:

        A_i  =  L / (K_i · V)
        f_i  =  (A_i^{N+1} − A_i) / (A_i^{N+1} − 1)        (A_i ≠ 1)
             =  N / (N+1)                                   (A_i = 1)

    K_i comes from the thermo package, so a solute-role species with a
    Henry's-law entry uses K_i = H_i(T)/P automatically; inerts fall
    back to Raoult/γ-φ (large K → A ≈ 0 → stay in the gas).

    EXPLICIT ASSUMPTIONS (glass-box --- stated, not hidden):
      1. counter-current, N equilibrium stages;
      2. isothermal at the gas-feed temperature;
      3. constant absorption factor (dilute: L, V ~ constant down the
         column);
      4. lean entering solvent (x_in of each solute ~ 0);
      5. no solvent evaporation (transfer is gas → liquid only).

    Inputs  (gasFeed  solvent );   outputs (cleanGas  richLiquid );
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

namespace Choupo {

class Absorber : public UnitOperation
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
    inline static const std::string type_ = "absorber";
    std::vector<ProcessStream>       produced_;
    std::map<std::string, scalar>    kpis_;
    std::optional<UnitProfile>       profile_;
};

} // namespace Choupo
