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
    Choupo::BatchReactor

Description
    Batch reactor with one or more Arrhenius-type reactions.  State:
    mole numbers n_i and (in adiabatic mode) temperature T.  Volume V
    is held constant (constant-density liquid assumption).

    Governing equations:

        dn_i/dt  =  Σ_r  ν_{i,r}  ·  r_r(T, n)  ·  V

    Mode `isothermal`  → T held at T_setpoint, no energy balance.
    Mode `adiabatic`   → energy balance added:

        dT/dt  =  −  Σ_r  r_r(T, n) · V · ΔH_r   /   ( Σ_i n_i · Cp_liq_i(T) )

    The numerator and denominator share a factor of 1000 (mol/kmol)
    that cancels when n is in kmol and Cp in J/(mol·K), so dT/dt is
    in K/s as expected.

    Each reaction supplies its own kinetic parameters (A, Ea) and an
    optional `dH_rxn` (heat of reaction at the operating temperature,
    in J per mole of limiting reactant consumed; negative ⇒ exothermic).
    For we treat dH_rxn as constant with T --- the Cp adjustment
    via Kirchhoff is scheduled for if needed.

    Integration: classical RK4 on the packed state vector
    (n_0,..., n_{N-1}, T), with the time step set by `controlDict.deltaT`.
\*---------------------------------------------------------------------------*/

#pragma once

#include "BatchUnitOperation.H"

namespace Choupo {

class BatchReactor : public BatchUnitOperation
{
public:
    BatchReactor() = default;

    const std::string& type() const override { return type_; }

    void initialise(const DictPtr&        unitDict,
                    const ThermoPackage&  thermo,
                    const DictPtr&        reactionsDict) override;

    void step(scalar t, scalar dt) override;

    const BatchState& state() const override { return state_; }

    void setOperationParameter(const std::string& key, scalar value) override;

protected:
    BatchState& mutableState() override { return state_; }

private:
    inline static const std::string type_ = "batchReactor";

    // Per-reaction kinetic + thermo data
    struct ReactionSpec
    {
        std::string              name;
        std::vector<std::size_t> comps;   // component indices listed in stoichiometry
        std::vector<scalar>      nu;      // signed stoichiometric coefficients
        std::vector<scalar>      order;   // power-law orders (positive = reactant)
        scalar                   A_pre = 0;     // pre-exponential
        scalar                   Ea    = 0;     // activation energy [J/mol]
        scalar                   dH    = 0;     // heat of reaction  [J/mol of limiting reactant]
        bool                     reversible = false;  // k_rev = k_fwd / K_eq (detailed balance)
    };

    enum class Mode { Isothermal, Adiabatic };

    BatchState                  state_;
    const ThermoPackage*        thermo_ = nullptr;
    std::vector<ReactionSpec>   reactions_;
    Mode                        mode_       = Mode::Isothermal;
    scalar                      T_setpoint_ = 0;

    // Rate r [kmol/(m³·s)] of a single reaction at (T, n, V).
    scalar rateOfReaction_(const ReactionSpec& rxn,
                           scalar T,
                           const sVector& n,
                           scalar V) const;

    // Combined derivatives for the packed state.
    //   packed[0..n-1] = mole numbers (kmol)
    //   packed[n]      = temperature (K)
    // Returns derivatives in the same packing.  For isothermal mode
    // the temperature derivative is forced to zero.
    sVector derivatives_(const sVector& packed) const;
};

} // namespace Choupo
