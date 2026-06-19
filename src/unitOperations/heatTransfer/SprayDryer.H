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
    Choupo::SprayDryer

Description
    Spray dryer (rotary-atomiser, single-stage) -- PHASE 1.

    A solution/suspension is atomised into droplets and dried by hot air;
    the solvent evaporates into the air and the dissolved solid leaves as a
    powder with a real particle size.  This phase-1 model couples four
    pieces, each a textbook correlation (not CFD):

      1. Mass + energy balance (adiabatic): all feed solvent evaporates
         (dry powder assumed in phase 1); the air cools from T_in to T_out.
      2. Atomisation (Friedman rotary-disc correlation): droplet Sauter
         diameter d32 from the disc speed/diameter, feed rate and liquid
         properties; the droplet shrinks to the powder particle diameter
         as the solvent leaves.  -> the powder stream carries a `psd`.
      3. Droplet wet-bulb temperature (psychrometric, Lewis ~ 1): the
         surface temperature during the constant-rate period.
      4. Heat/mass transfer (Ranz-Marshall, on the transport layer):
         Nu, Sh -> h, k_c -> the constant-rate drying time, reported.

    Hardware-only operation block (the credo): the atomiser wheel speed
    and diameter (+ optional liquid viscosity / surface tension, default
    water).  T_out, the droplet/particle sizes, h, k_c and the drying time
    are RESULTS.

    Inputs (feed dryingAir );   Outputs (powder exhaustAir );

    PHASE 2 (later): a sorption isotherm (GAB) + the falling-rate period +
    a residence time will replace the "dry powder" assumption with a real
    residual moisture X_final.
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

namespace Choupo {

class SprayDryer : public UnitOperation
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
    inline static const std::string type_ = "sprayDryer";
    std::vector<ProcessStream>       produced_;
    std::map<std::string, scalar>    kpis_;
    std::optional<UnitProfile>       profile_;
};

} // namespace Choupo
