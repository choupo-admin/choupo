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
    Choupo::ElectrodialysisStack

Description
    An ELECTRODIALYSIS stack (type `electrodialysisStack`): N cell pairs of
    alternating cation- (CEM) and anion-exchange (AEM) membranes between a
    pair of electrodes.  An applied current drives ions OUT of the DILUATE
    channel and INTO the CONCENTRATE channel; salt is concentrated in one
    stream and removed from the other.

    GLASS-BOX equations (all printed at verbosity >= 3):

      * Faraday transfer (per cell pair, summed over N):
            n_dot_i = xi * I / (z_i F)                   [mol/s per ion]
        xi = current efficiency (default 0.9, ANNOUNCED); the counter-ions
        carried; co-ion leakage + water transport are the (1 - xi) loss.

      * Nernst membrane potential (per cell pair), from REAL activities
        (Davies via the reused electrolyte stack, speciated ONCE per pass):
            E_mem = sum over the two membranes of (R T / z F) ln(a_conc/a_dil)

      * Limiting current density (Cowan-Brown):
            i_lim = z F k c_dil / (t_cu - t_co)
        PRINTED; a LOUD warning (never a silent clamp) when i > i_lim --
        operation in the over-limiting (water-splitting) regime.

      * Ohmic potential (per cell pair):
            E_ohmic = i * (R_CEM + R_AEM + R_dil + R_conc)
        membrane area resistances from the IEM .dat; solution resistances
        from the channel geometry + a conductivity built from the ion D0
        tier (Nernst-Einstein -> equivalent conductance).

      * Stack voltage & power:
            U = N (E_mem + E_ohmic) + E_electrodes          (E_electrodes
                lumped + ANNOUNCED; no Butler-Volmer in v1)
            P = U I = W_electric  (published on an energy wire, mirroring
                                   ElectricLoad's work-stream convention)

    STREAMS:  inputs ( diluateFeed concentrateFeed );
              outputs ( diluate concentrate );
              + an electrical-work stream (energyOutputs port `power`,
                expression "W_electric").

    Components must be IONIC species present in ions.dat (Na, Cl, ... + water),
    exactly like the ionExchanger -- the case carries an ionic water analysis.

    OPERATION keys:
        N_cellpairs   (int)            number of cell pairs
        current       I [A]            applied stack current        \  give
        targetDemin   (fraction)       OR solve I for this demin ratio  /  one
        xi            current efficiency [-]   (default 0.9, announced)
        channelThickness  [m]          diluate/concentrate spacer gap
        membraneArea  [m2]             active area per membrane
        linearVelocity [m/s]           cross-flow velocity (for k)
        E_electrodes  [V]              lumped electrode overpotential (default 0)
        membrane      <name>           IEM .dat pair (default CMX_AMX)

    Sub-models: there is exactly ONE limiting-current correlation in v1
    (Cowan-Brown) and ONE mass-transfer estimate -- so they are INLINE with a
    clear comment, not a factory-for-one (the settled "no factory for a single
    model" rule).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/UnitOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class ElectrodialysisStack : public UnitOperation
{
public:
    ElectrodialysisStack() = default;

    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream> producedStreams() const override
    {
        return products_;
    }

    std::map<std::string, scalar> kpis() const override { return kpis_; }

private:
    inline static const std::string type_ = "electrodialysisStack";

    std::vector<ProcessStream>      products_;   // [0] diluate, [1] concentrate
    std::map<std::string, scalar>   kpis_;
};

} // namespace Choupo
