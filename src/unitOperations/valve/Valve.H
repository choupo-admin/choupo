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
    Choupo::Valve

Description
    Credo-pure throttle valve.  An isenthalpic (Joule-Thomson) pressure
    reduction: the stream loses pressure across the restriction with NO
    shaft work and NO heat exchange, so its enthalpy is conserved,

        H_out(T_out, P_out)  =  H_in(T_feed)            (adiabatic, W = 0)

    The ONLY operation parameter is the downstream pressure:

        operation { P 1 bar; }     // P_out  (must be <= inlet P)

    T_out and the vapour fraction are RESULTS, not specs.  A sub-cooled
    liquid throttled below its bubble pressure partially vaporises: the
    block flashes the stream adiabatically at P_out, so vf > 0 emerges
    naturally (Joule-Thomson + flash cooling drop the temperature).

    The valve emits ONE combined outlet stream (overall composition
    unchanged, vf computed).  It does NOT separate the phases --- that is
    the job of a downstream drum (an `isothermalFlash` whose `operation`
    is empty, inheriting T and P from the stream the valve hands it).

    This is the pressure half of the "information follows the streams"
    credo: pressure rides on the stream and changes ONLY where a real
    device changes it.  A valve drops it (irreversibly, dissipating the
    surplus mechanical energy); a pump/compressor raises it; a separator
    has no pressure knob at all.  To raise pressure, or to RECOVER the
    expansion energy instead of dissipating it, use a pump / compressor /
    turbine --- each a visible box, never hidden inside another unit.

    Feed is treated as a sub-cooled liquid at T_feed (same reference
    convention as AdiabaticFlash); H_in cancels by anchoring Tref = T_feed.

    Algorithm: nested 1-D Newton in T_out (outer) over isothermal-flash
    inner calls at (T, P_out), identical in spirit to AdiabaticFlash ---
    the difference is only the spec (P_out is given, the energy input is
    zero) and the single combined output.

    Dictionary form:

        {
            name        V1;
            type        valve;
            in          hotLiquid;
            outputs     ( throttled );

            operation
            {
                P    1 bar;       // downstream pressure (RESULT: T_out, vf)
            }
        }
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/UnitOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class Valve : public UnitOperation
{
public:
    Valve() = default;

    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream> producedStreams() const override
    {
        return produced_;
    }

    std::map<std::string, scalar> kpis() const override
    {
        return kpis_;
    }

private:
    inline static const std::string type_ = "valve";
    std::vector<ProcessStream>      produced_;
    std::map<std::string, scalar>   kpis_;
};

} // namespace Choupo
