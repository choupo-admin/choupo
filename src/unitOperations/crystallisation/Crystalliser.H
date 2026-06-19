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
    Choupo::Crystalliser

Description
    Cooling crystalliser (steady-state, the most common teaching model).

    A solution is cooled to an operating temperature; the solute's
    solubility falls, so the excess crystallises out.  The mother liquor
    leaves SATURATED at the operating temperature; the crystal YIELD is set
    by that solubility:

        crystals = solute_in  -  c_sat(T_op) · solvent

    where c_sat(T) [kg solute / kg solvent] is the solid-liquid EQUILIBRIUM
    curve carried on the solute component (`solubility { coefficients (...) }`).
    This is the steady "yield" crystalliser; the crystallisation KINETICS
    (nucleation/growth k_n, k_g, which set the particle-size distribution and
    the dynamic population balance) are separate --- equilibrium vs kinetics,
    the same split as the dryer's isotherm vs drying curve.

    One product stream: the MAGMA --- crystals in s[] (solid phase) suspended
    in the saturated mother liquor in z[] (liquid).  A downstream filter /
    centrifuge (future) would split them.

    Operation parameter: `operatingTemperature` (the temperature the
    crystalliser holds --- an operating setpoint, like a reactor's
    T_setpoint).  The cooling DUTY Q, the yield and c_sat are RESULTS.

    Two `model`s (keyword), picked by `model <name>;` :

      * `equilibrium` (default) --- the cooling-crystalliser yield above.
        Mother liquor leaves exactly saturated; needs only c_sat(T).

      * `MSMPR` --- the steady continuous mixed-suspension mixed-product-
        removal crystalliser with KINETICS, solved by the method of
        moments.  The population balance for size-independent
        growth has the closed form n(L) = n0 exp(-L/(G tau)); its moments
        mu_j = n0 (G tau)^{j+1} j! close with no L-grid.  Growth
        G = k_g (S-1)^g and nucleation B0 = k_b (S-1)^b M_T^j set the PSD;
        the steady supersaturation S = c/c_sat is a RESULT, found by a
        Newton-1D that balances the kinetic crystal production Q*M_T
        against the solute removed from the liquor.  The kinetics live in
        `constant/crystallisation`, referenced by `crystallisation <name>;`
        at unit level (equipment-dependent, like reactions / dryingCurve);
        the equilibrium c_sat(T) stays on the component.dat.  KPIs:
        supersaturation S, G, B0, n0, moments, dominant size L_d = 3 G tau,
        mean sizes, CV, magma density M_T.  Profile: n(L) (the log-linear
        line) + the product PSD bins.

    Inputs (feed );   Outputs (magma );
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

#include <optional>

namespace Choupo {

class Crystalliser : public UnitOperation
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
    int solveEquilibrium    (const DictPtr& dict, const ThermoPackage& thermo, int verbosity);
    int solveMSMPR          (const DictPtr& dict, const ThermoPackage& thermo, int verbosity);
    int solveDiscretizedPBE (const DictPtr& dict, const ThermoPackage& thermo, int verbosity);

    inline static const std::string type_ = "crystalliser";
    std::vector<ProcessStream>       produced_;
    std::map<std::string, scalar>    kpis_;
    std::optional<UnitProfile>       profile_;
};

} // namespace Choupo
