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
    Choupo::CakeFilter

Description
    CONSTANT-PRESSURE CAKE FILTRATION, WITH OPTIONAL DISPLACEMENT WASHING
    (DEV.md 4c C361 slice 4; docs/design/c361-solids-processing.md section 8).

    THE LAW (Geankoplis, Hersel & Lepek, 5th ed., section 24.2, pp.
    1078-1090): the cake and the medium are two resistances in series,

        dt/dV = mu alpha c_S V / (A^2 dp) + mu R_m / (A dp) = K_p V + B
                                                          (eqs. 24.2-13..15)
        t     = K_p V^2 / 2 + B V                         (eq. 24.2-17)

    mu the FILTRATE's viscosity (the package's), alpha the specific cake
    resistance, R_m the medium's, c_S the kg of dry solids per m3 of
    FILTRATE, dp the pressure drop.  A compressible cake is alpha = alpha_0
    dp^s (eq. 24.2-11).  Ruth (1935) derived the integrated law; it is
    implemented here as Geankoplis prints it.

    c_S IS NOT AN INPUT.  The cake holds m kg of wet cake per kg of dry
    solids (`wetToDryCakeRatio`, DECLARED: cake moisture is a measurement of
    the cake, not a property any model here predicts).  The liquid the cake
    keeps, (m - 1) W, leaves with it; the rest is filtrate.  c_S = W / V
    follows from that balance and equals Geankoplis eq. 24.2-10, c_S = rho
    c_x / (1 - m c_x), printed beside it.

    HOW A CYCLIC FILTER SITS IN A STEADY FLOWSHEET (the settled contract "A
    BATCH PLANT IS DESIGNED ON THE STEADY BALANCE"): the streams are the
    CYCLE-AVERAGED flows -- the steady balance per unit time -- and the cycle
    is a design result computed on them, never a second time axis:

      rotaryDrum   continuous rotary vacuum drum (Geankoplis eqs. 24.2-23 to
                   24.2-26): a fraction f of each revolution (the
                   submergence) forms cake.  Declare EITHER the cycle time
                   t_c (the area is the result, eq. 24.2-26) OR the area
                   (t_c is the result, the same equation solved for t_c).
      batchPress   a batch press or leaf filter (eqs. 24.2-17, -19, -20):
                   the area, the filtrate collected per cycle V_f and the
                   cleaning time are declared; the filtration time, the
                   washing time, the cycle time and the number of presses
                   needed to pass the average feed are results.

    WASHING (optional; the wash liquor is a REAL second inlet and the spent
    wash a real third outlet).  The washing RATE is the final filtration
    rate (eq. 24.2-19; a press washed through the cake, one quarter of it,
    eq. 24.2-20).  The SOLUTE REMAINING in the cake, R, after a wash ratio N
    (wash volume / volume of liquid in the cake, Perry 9th ed. p. 18-76) is
    one of:
      displacement  R = max(0, 1 - N): the wash liquor replaces the cake
                    liquor volume for volume without mixing -- the
                    definition of ideal displacement, an upper bound;
      tabulated     R(N) from the case's wash test, interpolated linearly in
                    (N, ln R) -- the coordinates of Perry's correlation
                    "log R vs. N" (eq. 18-71, p. 18-76), which Perry names
                    and does not parametrise.
    No book in the literature folder prints a washing-efficiency LAW with
    constants (docs/design/c361-solids-processing.md 8.6); none is invented.

    MASS: every solid leaves in the cake (the medium retains every particle:
    stated, not computed).  The liquid splits by one fraction (the cake's
    retained liquor); the wash replaces (1 - R) of that liquor by volume,
    componentwise, and the spent wash is the DIFFERENCE, so cake + filtrate
    + spent wash = feed + wash per component to the last bit (printed).
    ENERGY: no work, no heat; the wash must arrive at the feed's temperature
    (an enthalpy balance across the cake is not built), every product
    leaves at the feed's T and P.

    REFUSED, by name: a feed with no solids or no liquid; `alpha` beside
    `alpha0`/`compressibility`, or either of those two alone; a cake that
    would hold more liquid than the slurry brings; both or neither of
    `cycleTime` and `area` on a drum; a drum whose medium alone exceeds the
    submergence time; a wash with solids, at another temperature, or that
    cannot supply the liquor it displaces; a drum that cannot wash within the
    unsubmerged part of its revolution; a wash ratio outside a tabulated
    test.

    Inputs ( slurry [wash] );   outputs ( cake filtrate [spentWash] );
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class CakeFilter : public UnitOperation
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
    std::string                   type_ = "cakeFilter";
    std::vector<ProcessStream>    produced_;
    std::map<std::string, scalar> kpis_;
    std::optional<UnitProfile>    profile_;
};

} // namespace Choupo
