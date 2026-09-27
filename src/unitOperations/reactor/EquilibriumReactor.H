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
Description
    Stoichiometric EQUILIBRIUM reactor (the "REquil" of process simulators).
    You give a SET of R independent reactions; the reactor drives them to
    SIMULTANEOUS chemical equilibrium via each reaction's temperature-dependent
    equilibrium constant Kp_j(T), from the species' Gibbs-of-formation data
    (K = exp(-dG deg/RT)) -- NO kinetics, NO residence time.  The R extents are a
    RESULT: the coupled gas-phase (ideal) equilibrium system
        Kp_j = PROD_i (p_i/P deg)^nu_ij,   n_i = n_i0 + SUM_j nu_ij xi_j
    is solved by a Newton on x_i = ln n_i (analytic Jacobian), with the
    reaction subspace written as the invariants of the declared set, so a
    reaction that runs almost to completion leaves its limiting species at
    its own value (1e-14, 1e-300) instead of behind a subtraction; the
    extents are recovered from the solved amounts (record
    docs/design/an-equilibrium-that-runs-to-completion.md).  This is the
    reforming/shift/synthesis workhorse
    (e.g. water-gas-shift + methanation together).  Distinct from
    `conversionReactor` (extent SPECIFIED), `gibbsReactor` (Gibbs minimisation,
    NO reactions given -- cannot restrict which reactions equilibrate), and
    `cstr`/`pfr` (equilibrium reached only KINETICALLY, needing rate data).

    The declared SET is the kinetic knowledge: a reaction left out of the list
    is one the author knows is too slow to matter here, and leaving it out
    changes the answer (a Gibbs reactor over the same species would run it).

    TEMPERATURE APPROACH (C11, 2026-09-27) -- the second knob.
    `operation { temperatureApproach <dT>; }` is a GLOBAL MAGNITUDE (>= 0 K);
    a reaction's own entry in constant/reactions may carry
    `temperatureApproach <dT>;`, overriding it for that reaction (0 exempts
    it).  The engine assigns the DIRECTION per reaction on the one rule
    (TemperatureApproach.H, shared with `gibbsReactor`): a probe solve at the
    physical T says which way each reaction RUNS from this feed; exothermic as
    it runs -> Kp_j at T + |dT|, endothermic -> Kp_j at T - |dT|, both of
    which push Kp_j against the direction the reaction runs.  Announced per
    reaction; KPIs `temperatureApproach_K` (the global magnitude) and
    `T_Kp_<name>` (where each Kp was evaluated).  The reactor stays
    ISOTHERMAL at T: outlet state and duty are at the physical T.  A negative
    magnitude REFUSES by name; absent the key the run is the one it always
    was.  NOT here: an adiabatic mode, and any Kp beyond the ideal-gas rung.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/UnitOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class EquilibriumReactor : public UnitOperation
{
public:
    EquilibriumReactor() = default;

    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream> producedStreams() const override { return produced_; }
    std::map<std::string, scalar> kpis() const override { return kpis_; }

private:
    inline static const std::string type_ = "equilibriumReactor";
    std::vector<ProcessStream>     produced_;
    std::map<std::string, scalar>  kpis_;
};

} // namespace Choupo
