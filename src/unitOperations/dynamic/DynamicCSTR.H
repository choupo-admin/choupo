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
    Choupo::DynamicCSTR

Description
    Continuous-flow Stirred Tank Reactor as a dynamic unit op.
    Constant volume (incompressible liquid; F_out = F_in by overall
    mass balance).  State variables:

        n_i  [kmol]   — moles of component i in the tank
        T    [K]      — tank temperature (perfectly mixed)

    Governing equations:

        dn_i/dt = F_in · z_in_i  -  F_out · (n_i / n_total)  +  ν_i · r(T, n) · V

        (Σ_i n_i · Cp_liq_i(T))  ·  dT/dt
            =   F_in · Cp_in_avg · (T_in - T)              [convective]
              + (UA / 1000) · (T_jacket - T)                [jacket heat in kJ/s]
              - r · V · ΔH_rxn                              [reaction heat]

    Cp units throughout are J/(mol·K) which is numerically identical
    to kJ/(kmol·K); with n in kmol the totals come out in kJ/K and
    energy rates in kJ/s, so dT/dt is in K/s without explicit factor
    conversions (UA is the exception --- documented in W/K and
    divided by 1000 inside).

    Manipulated variables exposed to controllers:
        T_jacket     [K]    jacket coolant temperature
        T_in         [K]    inlet temperature
        F_in         [kmol/s]  inlet flow

    Controlled variables exposed:
        T            current tank temperature
        n_total      total moles in the tank
        x_<name>     mole fraction of named species
\*---------------------------------------------------------------------------*/

#pragma once

#include "DynamicUnitOperation.H"

namespace Choupo {

class DynamicCSTR : public DynamicUnitOperation
{
public:
    DynamicCSTR() = default;

    const std::string& type() const override { return type_; }

    void initialise(const DictPtr&        unitDict,
                    const ThermoPackage&  thermo,
                    const DictPtr&        reactionsDict) override;

    void step(scalar t, scalar dt) override;

    // ---- Packed-ODE form (the adaptive driver) ----------------------
    //   Clean ODE on (n_0..n_{N-1}, T) with the MVs (T_jacket, T_in, F_in)
    //   held constant across the sub-step, so choupoCtrl can sub-step the
    //   plant between controller samples with the stiff integrator.
    bool    hasOdeForm() const override { return true; }
    sVector odeState()   const override;
    void    setOdeState(const sVector& y) override;
    sVector odeDerivative(const sVector& y) const override { return derivatives_(y); }
    std::size_t odeNPositive() const override { return n_.size(); }

    sVector stateVector() const override;
    std::vector<std::string> stateLabels() const override;

    ContinuousStream outletStream() const override;

    bool             hasInlet()    const override { return true; }
    ContinuousStream inletStream() const override;

    void   setMV(const std::string& key, scalar value) override;
    scalar getCV(const std::string& key) const override;

    std::vector<std::string> availableMVs() const override;
    std::vector<std::string> availableCVs() const override;

    // Accessors for diagnostic prints.
    scalar T()          const { return T_; }
    scalar T_jacket()   const { return T_jacket_; }
    scalar T_in()       const { return T_in_; }
    scalar F_in()       const { return F_in_; }
    const sVector& n()  const { return n_; }

private:
    inline static const std::string type_ = "dynamicCSTR";

    struct ReactionSpec
    {
        std::string              name;
        std::vector<std::size_t> comps;
        std::vector<scalar>      nu;
        std::vector<scalar>      order;
        scalar                   A_pre = 0;
        scalar                   Ea    = 0;
        scalar                   dH    = 0;
    };

    const ThermoPackage*     thermo_ = nullptr;

    // ---- State variables --------------------------------------------
    sVector  n_;                  // kmol per component
    scalar   T_ = 0;              // K

    // ---- Geometric / operating parameters ---------------------------
    scalar   V_ = 0;              // m³  reactor volume (constant)
    scalar   P_ = 1.0;             // bar (not used in liquid-only balance)

    // Inlet (continuously charged)
    sVector  z_in_;               // mole fractions in inlet (Σ=1)
    scalar   F_in_  = 0;          // kmol/s
    scalar   T_in_  = 0;          // K

    // Jacket
    scalar   UA_ = 0;             // W/K
    scalar   T_jacket_ = 0;       // K  (MV)

    // Reactions
    std::vector<ReactionSpec>  reactions_;

    // ---- Helpers ----------------------------------------------------
    scalar rateOfReaction_(const ReactionSpec& rxn,
                           scalar T,
                           const sVector& n,
                           scalar V) const;

    // packed = (n_0..n_{N-1}, T)  → dydt of same packing
    sVector derivatives_(const sVector& packed) const;

    // Relax the holdup ODE to its steady fixed point at the current feed /
    // UA / T_jacket and adopt that (n_i, T) as the t=0 state.  Used by
    // `initial { start steadyState; }`.  Announces the seeded operating point.
    void seedFromSteady();
};

} // namespace Choupo
