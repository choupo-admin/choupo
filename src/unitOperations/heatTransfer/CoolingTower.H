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
    Choupo::CoolingTower

Description
    Counter-current evaporative water cooling tower, Merkel's enthalpy
    driving-force model (Merkel 1925).  The construction lives on ONE
    diagram: air enthalpy h against water temperature T.  The saturation
    curve h*(T) is the enthalpy of air saturated at the local water
    temperature; the operating line is the air-side energy balance
    h(T) = h_in + (L cpL / G) (T - T_out); and the tower characteristic

        Me = Ka V / L = INT_{T_out}^{T_in}  cpL dT / (h*(T) - h(T))

    is the Merkel number.  Two spec modes, EXACTLY ONE declared:

        merkelNumber  <Me>;     RATING -- the packing is given, the cold-water
                                temperature is the RESULT (bisection on T_out;
                                Me(T_out) is monotone, diverging at the
                                wet-bulb floor and vanishing at T_in);
        T_water_out   <T>;      DESIGN -- the duty is given, the required
                                Me is the RESULT.

    Method hypotheses, each ANNOUNCED at run time, never silent:

      * Lewis factor = 1 (Merkel): the enthalpy potential lumps sensible
        and latent transfer.  For air-water this is a near-coincidence
        (Le ~ 0.87-1), and it is what makes h the single driving force.
      * The water loss by evaporation is NEGLECTED inside the integral
        (L held constant along the packing, the classical Merkel form);
        the loss itself is REPORTED from the air-side humidity gain, and
        the water outlet flow honours it, so the boundary mass balance
        is exact even though the integrand's L is not.
      * The exit air is assumed SATURATED (h*(T_air_out) = h_air_out):
        Merkel resolves the air enthalpy profile, not its humidity, so
        the exit state needs one closing assumption and this is the
        classical one -- stated, and good near design loadings.
      * cp of liquid water, carrier and vapour are evaluated ONCE and
        held constant down the packing.  The carrier and vapour cp's are
        taken at the mean of the two INLETS, 0.5*(T_air,in + T_water,in).
        The liquid cp is taken at 0.5*(T_water,in + 298.15 K) -- a fixed
        25 C surrogate standing in for the water outlet, and NOT an
        inlet/outlet mean, because in RATING mode the water outlet is
        precisely the unknown being solved: forming the constant from it
        would make the integrand depend on the answer.  Stated rather
        than smoothed over: this is a real approximation at the cold end
        of a tower whose outlet is far from 25 C.

    The integral is a composite Simpson rule on a fixed fine grid (the
    converged answer); the classical CTI four-point Chebyshev estimate is
    published BESIDE it (`merkelNumber_chebyshev4`) so the hand method's
    deviation from the converged integral is visible -- the deviation is
    the lesson, exactly as the Kremser shortcut beside the stagewise
    absorber.

    The Merkel diagram itself is published as the unit's PROFILE
    (xAxis T_K, columns h_operating / h_saturation, kJ per kg dry air),
    which is how it reaches the GUI without a new transport.

        inputs  ( hotWater  air );   outputs ( coolWater  humidAir );

    Refusals, each naming its remedy: missing/ambiguous stream roles;
    both or neither spec key; a design T_water_out at or below the inlet
    wet-bulb (the thermodynamic floor) or at/above the water inlet; an
    operating line that touches the saturation curve (pinched -- lower
    L/G: more air or less water); and any missing property datum
    (vapour pressure, liquid/gas Cp, latent heat) by component and slot.
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

#include <map>
#include <optional>

namespace Choupo {

class CoolingTower : public UnitOperation
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
    inline static const std::string type_ = "coolingTower";
    std::vector<ProcessStream>       produced_;
    std::map<std::string, scalar>    kpis_;
    std::optional<UnitProfile>       profile_;
};

} // namespace Choupo
