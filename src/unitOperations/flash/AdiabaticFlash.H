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
    Choupo::AdiabaticFlash

Description
    Adiabatic (or fixed-duty) flash:  given F, z, P_out and a heat duty Q
    (default 0), find the outlet temperature T such that

        H_out(T, V(T), x(T), y(T))  =  H_in + Q / F

    H_in is the inlet molar enthalpy at (T_feed, P_feed) treated as a
    sub-cooled liquid feed.  The outlet is the equilibrium two-phase
    state at (T, P_out).

    Algorithm:  nested 1-D Newton in T (outer) over isothermal-flash
    inner calls.  Each inner call already iterates on composition; the
    outer convergence on T is typically 4–8 iterations.

    A 2-D simultaneous Newton over (T, V) is cleaner for industrial use,
    but the nested form is far more pedagogically transparent: the
    student sees the energy-balance residual depend on a converged
    isothermal flash.
\*---------------------------------------------------------------------------*/

#pragma once

#include "IsothermalFlash.H"
#include "core/Dictionary.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/UnitOperation.H"

#include <string>

namespace Choupo {

class AdiabaticFlash : public UnitOperation
{
public:
    AdiabaticFlash() = default;

    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream> producedStreams() const override { return produced_; }

private:
    inline static const std::string type_ = "adiabaticFlash";
    std::vector<ProcessStream>      produced_;   // liquid + vapor outlets
};

} // namespace Choupo
