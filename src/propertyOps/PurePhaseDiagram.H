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
    Choupo::PurePhaseDiagram

Description
    The pure-compound P-T phase diagram for ONE component.  Emits the
    coexistence curves as a long-form CSV (P in Pa):

        T,P,curve

    with `curve` in { saturation, sublimation, fusion } plus single marker
    rows `critical` and `triple`.  Curves:

      * saturation (liquid-vapour): P_sat(T) from the triple point (or a low
        T) up to the critical point, via the component's vapour-pressure model
        (use AmbroseWalton for validity to Tc).
      * sublimation (solid-vapour): Clausius-Clapeyron from a low T to the
        triple point, P = P_t · exp[-(ΔH_sub/R)(1/T - 1/T_t)].
      * fusion (solid-liquid): the Clapeyron melting line from the triple
        point upward, T(P) = T_t + (T_t·ΔV_fus/ΔH_fus)(P - P_t); ΔV_fus < 0
        for water gives the characteristic backward-leaning line.

    The solid curves are drawn ONLY when an optional `solid {}` block supplies
    the triple point + ΔH_fus + ΔH_sub + ΔV_fus (most compounds lack it, so
    the diagram gracefully degrades to liquid-vapour + critical point).

    Dictionary form:

        {
            name      pd;
            type      purePhaseDiagram;
            grid      { n 40; }
            solid     { tripleT 273.16;  tripleP 611.657;   // K, Pa
                        Hfus 6010;  Hsub 51059;             // J/mol
                        deltaVfus -1.63e-6; }               // m^3/mol
            output    { file phase.csv; }
        }

    The thermoPackage must hold EXACTLY ONE component with a vapour-pressure
    model and Tc/Pc.  Physics lives here (Clapeyron); the GUI only draws it.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <string>

namespace Choupo {

class PurePhaseDiagram : public PropertyOperation
{
public:
    PurePhaseDiagram() = default;

    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override { return diag_; }

private:
    inline static const std::string type_ = "purePhaseDiagram";
    std::map<std::string, scalar>   diag_;
};

} // namespace Choupo
