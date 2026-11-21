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
    Choupo::ConvectiveDryer

Description
    A CONTINUOUS CONVECTIVE DRYER on the material's characteristic drying
    curve (commission C26 slice 2, 2026-09-29).  A wet sorbing solid and a
    hot-air stream meet over a declared gas-solid contact area A, flowing
    co-current, counter-current or cross-flow; the solid's moisture X falls along the
    contact area at the local rate

        R = R_c f(Phi),   R_c = k_Y (Y_sat(T_wb) - Y),
        Phi = (X - X_eq) / (X_c - X_eq)                 (DryingCurve.H)

    where the wet bulb T_wb, the saturation humidity and the equilibrium
    moisture X_eq (GAB, the solid's `sorption {}` record) are all read at
    the LOCAL air -- which cools and humidifies as it dries the solid.
    That is what the batch tray cannot show: the same material, the same
    curve, and a rate that falls because the AIR is used up, not only
    because the solid is drier.

    ONE differential equation.  With xi the fraction of the contact area
    passed by the solid,

        S dX/dxi = - R A                                      [kg/s]

    the air's humidity and temperature are ALGEBRAIC in X: the water
    balance between the solid inlet and xi gives Y (co-current
    Y = Y_in + S (X_in - X)/G; counter-current Y = Y_out - S (X_in - X)/G),
    and the adiabatic ENTHALPY balance over the same control volume gives
    the air temperature, both streams priced on the package's own formation
    surface -- the same surface the plant energy report prices them on, so
    the unit's first law closes by construction and is published as a KPI
    (`energyResidual_kW`) rather than asserted.  Co-current integrates
    forward from the known inlets; counter-current does not know the
    exhaust, and SHOOTS on the dry-solid moisture X_out (bisection on the
    mismatch X(xi = 1) - X_out) until the air arriving at xi = 1 is the air
    fed.

    Operation (no default except nSteps, announced):
        area              <m2>      gas-solid contact area -- EQUIPMENT data
        k_Y               [1 -2 -1 0 0] <v>   gas-film coefficient
        criticalMoisture  <kg/kg>   MEASURED on the material
        flow              cocurrent | countercurrent | crossflow
        drivingForce      logMean | inlet     (crossflow only; default logMean)
        dryingCurve { ... }         optional, DryingCurve.H (absent = linear)
        nSteps            <n>       RK4 steps along the area (default 100)

    CROSS-FLOW (`flow crossflow;`, 2026-11-21).  The solid travels in plug
    flow along the dryer and EVERY length element is fed with the inlet air,
    which leaves it once and is mixed with the air of the others (the
    through-circulation belt, the plug-flow fluid bed): Mujumdar, Handbook of
    Industrial Drying 3rd ed. (2006), s.3.6.2.3.1, Eq. 3.66-3.78, Fig. 3.8,
    printed pp. 65-66; the parallel-flow forms it derives from are Eq. 3.12-
    3.15 (p. 57), the co- and counter-current cases s.3.6.2.1-2 (pp. 63-64).
    The air is distributed uniformly along the length (Eq. 3.76).  The rate
    of an element then depends on the solid's X ALONE -- fresh air, so
    Y* = Y_sat(T_wb of the INLET air) and X_eq of the inlet air:
        dX/dxi = - Wdot(X)/S,   Y_2 - Y_1 = Wdot(X)/G          (3.66, 3.68)
        drivingForce logMean:  G ln[(Y*-Y_1)/(Y*-Y_2)] = k_Y A f(Phi)
                                                               (3.70, 3.73)
        drivingForce inlet  :  Wdot = k_Y A f(Phi) (Y* - Y_1)  (3.70, 3.72)
    and the air leaving each element has the temperature of that element's
    enthalpy balance (3.69), priced on the package's formation surface; the
    exhaust is the mix of the N elements, so the first law closes by
    summation.  The solid sits at the inlet air's wet bulb all along (it
    leaves there).  REFUSED by name: air recirculation between elements,
    axial dispersion (Mujumdar 3.79-3.84), a two-dimensional bed (s.3.6.2.3.2),
    a non-uniform air distribution, and an element whose air would saturate.

    HYPOTHESES, each announced at run time: the solid surface sits at the
    LOCAL wet bulb in BOTH periods (its warm-up toward the air temperature
    in the falling period is NOT modelled -- the batch dryer's named gap);
    Lewis = 1 in the wet-bulb equation; one k_Y over the whole area; no
    axial mixing; no re-wetting (R >= 0: a solid below the local X_eq stops
    drying, it does not sorb back); adiabatic shell; the bound moisture
    priced as liquid water (no heat of sorption).

        inputs  ( wetSolid  hotAir );   outputs ( drySolid  humidExhaust );

SourceFiles
    ConvectiveDryer.cpp
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

#include <map>
#include <optional>

namespace Choupo {

class ConvectiveDryer : public UnitOperation
{
public:
    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream>    producedStreams() const override { return produced_; }
    //  Only the particulate flag is stated (C445): the unit dries a granular
    //  solid but carries no size distribution, so its acceptance stays
    //  undeclared in every other respect.
    UnitAcceptance acceptance() const override
    { UnitAcceptance a; a.particulateSolids = true; return a; }
    std::map<std::string, scalar> kpis()            const override { return kpis_; }
    std::optional<UnitProfile>    profile()         const override { return profile_; }

private:
    inline static const std::string type_ = "convectiveDryer";
    std::vector<ProcessStream>       produced_;
    std::map<std::string, scalar>    kpis_;
    std::optional<UnitProfile>       profile_;
};

} // namespace Choupo
