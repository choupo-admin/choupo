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
    Choupo::BatchStill

Description
    Simple batch still (Rayleigh distillation, no reflux, no plates).
    A pot of liquid is boiled off at a constant molar vaporisation
    rate F_vap; the rising vapour is assumed to be in equilibrium with
    the boiling liquid (T = T_bubble(x, P)) and is removed from the
    vessel immediately.  Mass balance:

        dn_i / dt  =  - F_vap  ·  y_i*(T, x)

    where T = T_bubble(x, P) and y* = K(T, x) · x are obtained at each
    RK4 stage by reusing `BubblePoint::compute`.

    The temperature is NOT integrated --- it is an algebraic function
    of composition through the bubble-point equation.  The pressure is
    held constant (constant-P pot, typical of atmospheric batch
    distillations).  Volume is also held constant for bookkeeping; for
    Rayleigh the volume actually shrinks (or the liquid level drops),
    but with a constant-density-liquid assumption this is decorative
    rather than load-bearing.

    Classical Rayleigh integration gives, for an ideal binary with
    constant relative volatility α and lightest component subscript 1:

           ln(L / L_0)  =  (1 / (α - 1))
                            ·  [ ln(x_1 / x_1_0)
                               + α · ln((1 - x_1_0) / (1 - x_1)) ]

    so a benzene/toluene case with α ≈ 2.4 has a closed-form residue
    curve to compare against the integrator.

    With NRTL azeotropes (e.g. ethanol/water) the bubble-T algorithm
    handles the activity term automatically; starting the still above
    the azeotrope makes the still composition climb TOWARD the
    azeotrope and stall there --- a pedagogically vivid demo of the
    azeotrope as a kinetic barrier to further enrichment.
\*---------------------------------------------------------------------------*/

#pragma once

#include "BatchUnitOperation.H"

namespace Choupo {

class BatchStill : public BatchUnitOperation
{
public:
    BatchStill() = default;

    const std::string& type() const override { return type_; }

    void initialise(const DictPtr&        unitDict,
                    const ThermoPackage&  thermo,
                    const DictPtr&        reactionsDict) override;

    void step(scalar t, scalar dt) override;

    const BatchState& state() const override { return state_; }

    void setOperationParameter(const std::string& key, scalar value) override;
    void notifyStateChanged() override;

    // The vapour removed since the last call, condensed for a receiver
    //: returns the buffered moles at the pot T/P and clears the
    // buffer.  The recipe layer routes this to a `dischargeTo` target.
    BatchState takeContinuousDischarge() override;

protected:
    BatchState& mutableState() override { return state_; }

private:
    inline static const std::string type_ = "batchStill";

    BatchState                  state_;
    const ThermoPackage*        thermo_     = nullptr;
    scalar                      F_vap_      = 0;      // kmol/s
    scalar                      P_op_       = 0;      // bar
    scalar                      T_warm_     = 0;      // last bubble-T --- used as Newton seed
    sVector                     vapourBuf_;           // kmol vaporised since last discharge

    // dn_i/dt = -F_vap · y_i* at current packed state (just n[]).
    // Also writes the bubble-T into T_warm_ for the next call's seed
    // and (after step()) into state_.T for trajectory writeout.
    sVector derivatives_(const sVector& n_vec);
};

} // namespace Choupo
