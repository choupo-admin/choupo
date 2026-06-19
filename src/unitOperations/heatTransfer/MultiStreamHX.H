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
    Choupo::MultiStreamHX

Description
    Multi-stream heat exchanger (the Aspen MHeatX analogue): N hot + M cold
    process streams exchanging heat inside ONE adiabatic shell.

    THE SPEC (glass-box, "information follows the streams"):  every inlet
    stream carries its OWN outlet target temperature (`outlet { <name> { T
    ...; } }`).  The unit then does an ENERGY-BALANCE VERIFICATION, not a
    rating:

       1. per-stream duty   Q_k = F_k · ( h_k(T_out) − h_k(T_in) )   [W]
          using the same formation / sensible enthalpy machinery the rest
          of Choupo uses (H_stream when every component carries a formation
          datum; Hliquid otherwise -- the per-component zero cancels here
          because no reaction happens inside an exchanger);
       2. hot duty  = Σ (releasing streams, Q_k < 0),
          cold duty = Σ (absorbing streams, Q_k > 0);
       3. IMBALANCE = Σ Q_k over ALL streams.  For a truly adiabatic shell
          this is zero.  A non-zero value is the EXTERNAL duty the bundle
          would have to import/export -- the unit REPORTS it honestly and
          never invents an outlet the topology cannot know (the no-magic
          credo).  A tolerance (`operation.tolerance`, default 1 % of the
          larger of |hot|,|cold|) decides PASS / warning.

    THE INTERNAL PINCH (what the student SEES):  the unit builds the hot and
    cold COMPOSITE CURVES (cumulative Q vs T, all hot streams pooled, all
    cold streams pooled) and walks them to report the minimum approach
    temperature dT_min inside the bundle -- the in-unit pinch, pairing with
    Choupo's flowsheet-level pinch analysis.  A non-positive dT_min means a
    temperature CROSS (the requested outlets violate the 2nd law for a
    single adiabatic bundle): reported as a hard warning.

    ASSUMPTIONS (glass-box -- stated, not hidden):
      1. sensible heat (and any latent captured by the enthalpy datum across
         the declared inlet->outlet path); composites built from the two
         enthalpy end-points per stream (piecewise-linear in Q-T);
      2. single adiabatic shell -- no heat lost to surroundings beyond the
         reported imbalance;
      3. counter-current composite convention for the approach (hot pooled
         high->low, cold pooled low->high).

    Inputs  ( hot1 hot2 ... cold1 ... );  any number, any order.
    Outputs ( hot1Out hot2Out ... );  one per inlet, SAME ORDER as inputs.

    Aliases:  `multiStreamHX`, `MHeatX`.
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

namespace Choupo {

class MultiStreamHX : public UnitOperation
{
public:
    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream>    producedStreams() const override { return produced_; }
    std::map<std::string, scalar> kpis()            const override { return kpis_; }

private:
    inline static const std::string type_ = "multiStreamHX";
    std::vector<ProcessStream>       produced_;
    std::map<std::string, scalar>    kpis_;
};

} // namespace Choupo
