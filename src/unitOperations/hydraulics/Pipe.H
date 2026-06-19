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
    Choupo::Pipe

Description
    A single-phase incompressible PIPE / hydraulics element.  It computes
    the pressure DROP a liquid stream suffers flowing through a length of
    pipe, and hands on an outlet stream identical to the inlet except for
    the reduced pressure.

    THE CREDO (information follows the streams).  A pipe is NOT a machine:
    it has no shaft, no duty, no pressure knob.  ΔP is therefore a COMPUTED
    RESULT of the GEOMETRY (D, L, roughness, elevation, fittings) and the
    FLOW (velocity, density, viscosity) -- NEVER a spec.  Asking for a
    target ΔP or P_out would be a DesignSpec the topology cannot know; that
    is the job of a pump (raise P) or a valve (set a let-down P).  The pipe
    only DISSIPATES, exactly as much as the physics says.

    PHYSICS (v1, single-phase liquid).  Mechanical energy balance with the
    Darcy-Weisbach friction term, the minor-loss (fittings) term, and the
    static-head term:

        ΔP  =  [ f·(L/D) + Σ K ] · (ρ v² / 2)   +   ρ g Δz
               \________________/   \_______/       \_____/
                 distributed +        velocity        elevation
                 minor losses          head           (rise: +ΔP)

    with
        v   = Q_vol / A        ,  A = π D² / 4   ,  Q_vol = (F·MW)/ρ ... = ṅ·v̄
        Re  = ρ v D / μ
        ε/D = roughness / D    (relative roughness)

    The liquid is INCOMPRESSIBLE and the temperature is held (the viscous
    dissipation of a well-insulated short line raises T negligibly; the
    energy that disappears as ΔP is the irreversibility, accounted in the
    pressure, not re-injected as heat -- consistent with the valve credo).

    FRICTION-FACTOR sub-models (the `model` slot, like the cyclone's five):

        model Churchill;   // DEFAULT.  One explicit correlation valid across
                           //   laminar, transition AND turbulent Re, all ε/D.
                           //   Churchill (1977).
        model Haaland;     // explicit turbulent approximation to Colebrook,
                           //   ~2 % of it; laminar branch 64/Re below 2300.
        model Colebrook;   // implicit Colebrook-White, solved by fixed-point
                           //   iteration (the classical turbulent reference);
                           //   laminar branch 64/Re below 2300.

    In the laminar regime (Re < 2300) every model returns the exact 64/Re;
    the choice only matters in the turbulent regime.  The regime is
    ANNOUNCED in the report.

    GAS / compressible flow is a documented FUTURE extension: for a
    compressible fluid ρ varies along the pipe and the integration is not a
    single (ρ, v) evaluation -- that needs the isothermal- or adiabatic-
    compressible pipe equation and is deliberately out of scope for v1.

    Dictionary form:

        {
            name        P1;
            type        pipe;
            model       Churchill;        // optional: Churchill (default) |
            in          feed;             //           Haaland | Colebrook
            outputs     ( downstream );

            operation
            {
                geometry
                {
                    D          0.1   m;      // internal diameter
                    L          50.0  m;      // straight length
                    roughness  4.6e-5 m;     // absolute wall roughness ε
                    dz         5.0   m;      // outlet-minus-inlet elevation
                                             //   (rise costs pressure)
                    fittings                 // optional minor losses
                    (
                        { K 0.9; count 2; }  // 2 elbows, K = 0.9 each
                        { K 10.0;         }  // 1 globe valve, K = 10
                    );
                }

                // viscosity  1.0e-3 Pa.s;   // optional override; otherwise
                //                            //   taken from the thermoPackage
                //                            //   liquidViscosity model
            }
        }

    KPIs:  deltaP, P_in, P_out, velocity, reynolds, frictionFactor,
           regime (0 = laminar, 1 = transition, 2 = turbulent), dP_friction,
           dP_fittings, dP_elevation, head_loss_m, density, viscosity.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/UnitOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class Pipe : public UnitOperation
{
public:
    Pipe() = default;

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
    inline static const std::string type_ = "pipe";
    std::vector<ProcessStream>      produced_;
    std::map<std::string, scalar>   kpis_;
};

} // namespace Choupo
