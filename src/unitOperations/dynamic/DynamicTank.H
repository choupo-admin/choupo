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
    Choupo::DynamicTank

Description
    A liquid storage / buffer TANK with a LEVEL -- the unit on which the most
    common control loop of a plant (inventory) can be shown (DEV.md 4c C205,
    slice 1).  Named `dynamicTank` beside `dynamicCSTR`: "dynamic" because it
    is integrated in time, "tank" because it holds a liquid and reacts nothing.

    State:  n_i [kmol] (the inventory) and H [kJ] (the stored enthalpy on the
    elements datum, the package's mixture liquid surface); T is a READOUT,
    recovered from H(n, T) by the Newton of VariableVolumeHoldup.

        dn_i/dt = ndot_in,i  -  F_out x_i
        dH/dt   = F_in h(z_in, T_in)  -  F_out h(x, T)  +  (UA/1000)(T_j - T)

    The liquid volume is V = sum n_i MW_i / rho(T, P, x) from the CASE's
    package, the level h = V / (pi D^2/4) of the declared vertical cylinder;
    running dry or overflowing REFUSES at that instant (no clamp).  The
    outflow is ONE of two DECLARED modes:

      mode flow   F_out is a manipulated flow (mv F_out, a flow-controlled
                  pump): the level INTEGRATES (no self-regulation);
      mode valve  Q = Cv x opening x sqrt(dP/rho),  F_out = Q rho / MW_avg,
                  dP = P + rho g h - P_downstream  (mv opening): the level
                  SELF-REGULATES to the h* where the valve passes the inflow.

    The arithmetic of the volume, the level, the valve and the refusals is
    VariableVolumeHoldup's, shared with the variable-volume vessels to come.

    Manipulated variables:  F_in [kmol/s], T_in [K], T_jacket [K],
                            componentMolarFlow.<c>, and F_out (mode flow) or
                            opening (mode valve).
    Controlled variables:   level [m], volume [m3], T, F_in, F_out, T_in,
                            T_jacket, n_total, x_<c>, and opening (valve).

    Declared in the unit's dicts (flowsheetDict `operation`):
        geometry { shape verticalCylinder; diameter ..; height ..; }
        outflow  { mode flow;  F <kmol/s>; }
               | { mode valve; opening <0..1>; valve { Cv <m2>;
                                          downstreamPressure <Pa>; } }
        UA <W/K>; T_jacket <K>;       // optional jacket, default adiabatic
    and the initial holdup in 0/internalStates/<unit>: T, P (the pressure
    over the liquid), the composition and EITHER totalMoles/holdupMolar OR
    `level` (m).
\*---------------------------------------------------------------------------*/

#pragma once

#include "DynamicUnitOperation.H"
#include "VariableVolumeHoldup.H"

namespace Choupo {

class DynamicTank : public DynamicUnitOperation
{
public:
    DynamicTank() = default;

    const std::string& type() const override { return type_; }

    void initialise(const DictPtr&        unitDict,
                    const ThermoPackage&  thermo,
                    const DictPtr&        reactionsDict) override;

    void step(scalar t, scalar dt) override;

    sVector stateVector() const override;
    std::vector<std::string> stateLabels() const override;

    ContinuousStream outletStream() const override;

    bool             hasInlet()    const override { return true; }
    bool             setsOutletFlow() const override { return true; }   // valve or manipulated flow
    ContinuousStream inletStream() const override;
    bool acceptsRoutedInlet() const override { return true; }
    void setInletStream(const ContinuousStream& s) override;

    //- The whole integrated state IS the holdup: n and H (T is its readout).
    //  The valve opening / F_out / T_jacket are manipulated variables (the
    //  operation's or a controller's), like dynamicCSTR's T_jacket.
    bool holdupRecord(HoldupRecord& h) const override;

    BalanceSnapshot balanceSnapshot() const override;

    void   setMV(const std::string& key, scalar value) override;
    scalar getCV(const std::string& key) const override;
    std::vector<std::string> availableMVs() const override;
    std::vector<std::string> availableCVs() const override;

private:
    inline static const std::string type_ = "dynamicTank";

    enum class Outflow { flow, valve };

    //- Everything the right-hand side needs from a state (n, H).
    struct Resolved
    {
        scalar T = 0;
        VariableVolumeHoldup::LiquidState liquid;
        scalar F_out = 0;       // kmol/s
    };
    Resolved resolve_(const sVector& n, scalar H, bool strict) const;
    sVector  derivatives_(const sVector& y) const;
    //- Refuse a dry / overflowing / reversing state at instant t.
    void     checkAccepted_(scalar t) const;
    void     announceSteadyLevel_() const;

    const ThermoPackage* thermo_ = nullptr;

    // ---- state ----
    sVector n_;                 // kmol
    scalar  H_ = 0;             // kJ
    scalar  T_ = 0;             // K (readout)
    scalar  P_ = 101325.0;      // Pa over the liquid
    scalar  t_ = 0;             // last accepted instant

    // ---- declared ----
    VariableVolumeHoldup::VerticalCylinder geom_;
    Outflow outflow_ = Outflow::flow;
    scalar  F_out_set_ = 0;     // kmol/s (mode flow; the MV)
    scalar  opening_   = 1;     // 0..1   (mode valve; the MV)
    VariableVolumeHoldup::Valve valve_;
    scalar  UA_ = 0;            // W/K
    scalar  T_jacket_ = 0;      // K

    // ---- inlet (authoritative: per-component molar flows) ----
    sVector nDotIn_;            // kmol/s
    sVector z_in_;              // derived
    scalar  F_in_ = 0;          // derived
    scalar  T_in_ = 0;
    void    applyInletFlows_();
};

} // namespace Choupo
