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
    Choupo::Compressor

Description
    Credo-pure gas-phase compressor.  Hardware (what the engineer
    designs / buys) is ONLY:

        W_shaft  --  shaft power delivered to the fluid  [W, positive]
        eta      --  isentropic efficiency               [-]   (0 < eta <= 1)

    Everything else --- P_out, T_out, the discharge composition (same
    as inlet for a compressor), the gross compression ratio, the
    irreversibility-induced entropy generation --- is a RESULT.

    Physics
    -------
    Inlet state:    h_in     = H_real(T_in, P_in, y)
                    s_in     = S_real(T_in, P_in, y)

    Per-mol shaft work:
                    w_real   = W_shaft / F_mol_s             [J/mol]
                    w_isen   = eta * w_real                  [J/mol]

    Isentropic discharge state (T_out_isen, P_out_isen).  By definition
    of isentropic efficiency, the isentropic path ends at the SAME
    discharge pressure as the real path --- so P_out is what we solve
    for:

        (a)  S_real(T_out_isen, P_out, y)  ==  s_in
        (b)  H_real(T_out_isen, P_out, y)  ==  h_in + w_isen

    Two equations, two unknowns (T_out_isen, P_out).  Solved as an
    outer Newton-1D on P_out wrapping an inner Newton-1D that finds
    T_out_isen via the entropy match (a); the residual of (b) drives
    the outer iteration.  For idealGas the system decouples and the
    outer Newton converges in 1-2 steps; for SRK the coupling is
    real and 4-10 outer steps are typical.

    Real discharge T from the first-law energy balance at the now
    known P_out:

        (c)  H_real(T_out, P_out, y)  ==  h_in + w_real

    Inputs / outputs
    ----------------
        in:        feed (gas stream)
        outputs:   (out )     (compressed gas, same composition + flow)

    Dictionary form:

        {
            name        compressor01;
            type        compressor;
            in          feed;
            outputs     (out );

            operation
            {
                W_shaft     50.0 kW;       // hardware (motor rating)
                eta         0.72;          // isentropic efficiency (machine curve)
            }
        }

    or, since 2026-10-21 (DEV.md 4c C123, on the pump's precedent), eta
    plus the DISCHARGE PRESSURE the machine must reach -- the way a
    flowsheet names most of its compressors (the header it feeds):

            operation
            {
                P_out       10 bar;        // the header -> W_shaft is the RESULT
                eta         0.72;
            }

    With P_out given the isentropic path is ONE inner solve,
    S_real(T_s, P_out, y) = s_in, w_isen = H_real(T_s, P_out) - h_in,
    w_real = w_isen / eta, and T_out from (c): nothing is searched for.
    Exactly one of W_shaft and P_out is accepted (both or neither
    refuses).  A DesignSpec on $W_shaft targeting `compressor01.P_out`
    still works and solves the same equations from the outside.

    Limitation: requires a gas-phase EoS (idealGas, SRK, PengRobinson).

    LIQUID IN THE SUCTION IS REFUSED (2026-10-21 decision, DEV.md 4c).  The
    suction is read by what it means (`flashState::resolvedInletVaporFraction`:
    an authored inlet at its own (T, P, z), a produced one at its producer's
    answer); a vapour fraction below 1 refuses the unit by name, quoting it,
    with the two remedies -- a knock-out drum (`flash`) upstream, or a `pump`
    if the stream is a liquid.  Wet compression is not modelled.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/UnitOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class Compressor : public UnitOperation
{
public:
    Compressor() = default;

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
    inline static const std::string type_ = "compressor";
    std::vector<ProcessStream>      produced_;
    std::map<std::string, scalar>   kpis_;
};

} // namespace Choupo
