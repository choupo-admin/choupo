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
    Choupo::Pump

Description
    Credo-pure liquid pump.  Adds shaft work to an INCOMPRESSIBLE
    liquid, raising its pressure.  Because v ~ const for a liquid the
    discharge state is a closed-form expression --- no EoS, no Newton.

    Operation parameters --- eta (always) PLUS exactly ONE spec:
        eta      --  pump (hydraulic + isentropic) efficiency  [-]
        and ONE of:
        W_shaft  --  shaft power delivered to the liquid  [W, positive]
                       -> the pressure rise is the RESULT
        P_out    --  required discharge pressure          [Pa]
        dP       --  required pressure rise               [Pa]
                       -> the shaft power is the RESULT

    Because the liquid is incompressible (v ~ const), the relation
        ΔP = eta · W_shaft / Q_vol    <->    W_shaft = Q_vol · ΔP / eta
    is invertible in CLOSED FORM (Q_vol = F · v, set by the feed), so
    EITHER direction is one-shot --- no Newton, no EoS, and crucially
    NO DesignSpec.  Giving P_out (the header pressure a pump must reach)
    is the natural engineering spec and is just as direct as giving the
    motor power; requiring exactly one keeps the DOF honest.

    Physics (incompressible, v = Σ x_i v_liq,i  ~ const):
        w_real  = W_shaft / F_mol_s            [J/mol]
        w_isen  = eta * w_real                 [J/mol]   (useful v·ΔP)
        ΔT      = (w_real - w_isen) / Cp_liq   [K]     (dissipation)
        T_out   = T_in + ΔT                                    (RESULT)

    NOTE (revises an earlier stance): specifying P_out on a pump is NOT
    "a DesignSpec disguised".  A DesignSpec is only needed when the TARGET
    lives elsewhere in the flowsheet; the discharge pressure is a LOCAL
    algebraic inversion of the same closed form, so it stays a one-shot
    spec.  A pressure let-down (P_out < P_in) is a 'valve', not a pump.

    Dictionary form (pressure-spec, the common case):

        {
            name        pump01;
            type        pump;
            in          feed;
            outputs     (out );

            operation
            {
                P_out      30 bar;        // header it feeds  (RESULT: W_shaft)
                eta        0.65;          // pump efficiency
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

class Pump : public UnitOperation
{
public:
    Pump() = default;

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
    inline static const std::string type_ = "pump";
    std::vector<ProcessStream>      produced_;
    std::map<std::string, scalar>   kpis_;
};

} // namespace Choupo
