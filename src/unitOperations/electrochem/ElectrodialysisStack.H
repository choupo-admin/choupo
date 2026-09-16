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

      * Limiting current density -- TWO models since 2026-09-16, dispatched in
        `unitOperations/electrochem/LimitingCurrent.{H,cpp}` and selected
        `limitingCurrent { model GeraldesAfonso2010 | CowanBrown; }`:

            GeraldesAfonso2010 -- the PREDICTION (J. Membr. Sci. 360 (2010)
              499-508).  NO transport number is declared: the linearised
              Nernst-Planck film gives the limiting transport numbers from
              the ion diffusivities and the diluate composition (Eqs. 12/13)
              and i_lim in closed form (Eq. 15), per membrane, the lowest
              absolute value applying.  It needs the stack's OWN Sherwood
              correlation, so it is reachable only under a `stack` record.
              The membrane record's declared t_cu is ANNOUNCED beside it.

            CowanBrown -- the LEGACY single-salt working form on the membrane
              record's DECLARED t_cu, with k from a Leveque-type estimate:
                  i_lim = z F k c_dil / (t_cu - t_co)

        The DEFAULT is announced either way: GeraldesAfonso2010 where a stack
        record supplies the correlation AND every diluate ion resolves a
        diffusivity AND both signs are present, CowanBrown otherwise, naming
        which of those was missing.  Either way i_lim is PRINTED and a LOUD
        warning (never a silent clamp) fires when i > i_lim -- operation in
        the over-limiting (water-splitting) regime.

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
        stack         <name>           a `kind edStack` record in assets/ that
                                       SUPPLIES the hardware below (see THE
                                       STACK RECORD)
        current       I [A]            applied stack current        \  give
        targetDemin   (fraction)       OR solve I for this demin ratio  /  one
        xi            current efficiency [-]   (default 0.9, announced)
        E_electrodes  [V]              lumped electrode overpotential (default 0)
        limitingCurrent { model ...; } which i_lim model (see above)
        membrane      <name>           IEM .dat pair (default CMX_AMX) -- but
                                       see the refusal below
      the HARDWARE, typed inline only when the case names NO stack record:
        N_cellpairs   (int)            number of cell pairs
        channelThickness  [m]          diluate/concentrate spacer gap
        membraneArea  [m2]             active area per cell pair
        channelLength [m]              flow path length (CowanBrown k)
        linearVelocity [m/s]           cross-flow velocity (CowanBrown k)

    THE STACK RECORD (2026-09-16).  `stack <name>;` names a `kind edStack`
    record in data/standards/assets/ and the record supplies the membrane
    pair, the cell pairs, the active area, the channel and spacer, the
    hydraulic passes and the stack's OWN Sherwood correlation.  ONE home: any
    of `N_cellpairs`, `membraneArea`, `channelThickness`, `channelLength`,
    `linearVelocity`, `hydraulicPasses` or `spacerPorosity` declared BESIDE a
    stack record REFUSES by name, and so does `membrane` where the record's
    own source names a pair (where it does not -- an industrial frame taking
    any pair -- the CASE must declare one, and is told so).

    THE CROSSFLOW VELOCITY IS DERIVED, never declared: the diluate flow
    arrives on the inlet stream, so u = Q/((cellPairs/passes) W h) is a
    consequence of that flow and the channel section the record describes.
    It is printed with its arithmetic, and SUPERFICIAL because that is the
    basis the record's own correlation declares.  `linearVelocity` survives
    ONLY as a legacy key of the no-record form (default 0.05 m/s, announced).
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
