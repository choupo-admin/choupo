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
    Choupo::TransportModel

Description
    Selectable membrane-transport law for the spiral-wound module.  Given the
    LOCAL bulk state at one z station (the TransportContext) it returns the
    coupled water flux J_w, the wall/permeate concentrations c_m / c_p and the
    solute flux J_s (the TransportSolution).  The unit op marches this along
    the channel; the transport law is the load-bearing local non-linearity.

    Explicit-factory pattern, parallel to MassTransferModel / OsmoticModel /
    PressureDropModel.  A `transport <name>;` keyword in the unit's operation
    picks the concrete law; without it `solutionDiffusion` (the baseline) is
    used.  Built-ins:

        solutionDiffusion  --  the classical solution-diffusion law with
                               film-model concentration polarisation and a
                               van't-Hoff / Pitzer osmotic back-pressure.  An
                               inner Newton-1D in J_w resolves the coupled
                               flux–polarisation–osmotic non-linearity.

    The interface is kept clean so a charged transport law (Donnan-steric pore
    model, DSPM-DE) can drop in later as a sibling: the membrane handle and an
    activity/speciation hook already ride in the context, unused by the
    solution-diffusion baseline.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <cstddef>
#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {

class ThermoPackage;
class Membrane;
class OsmoticModel;
namespace electrolyte { class SpeciationSolver; }

// The membrane transport factory lives in a nested namespace: the name
// `TransportModel` is already taken in `Choupo` by the thermo property
// (viscosity) transport model (src/thermo/transport/), an unrelated concept.
namespace membrane {

// ---- The result of the local J_w–c_m–c_p problem at one z station ----------
struct TransportSolution
{
    scalar              J_w;        // water flux at this z [m/s]
    std::vector<scalar> c_m;        // membrane-wall concentration [kmol/m^3]
    std::vector<scalar> c_p;        // permeate-side concentration [kmol/m^3]
    std::vector<scalar> J_s;        // solute flux [kmol/(m^2.s)]
};

// ---- The inputs to the local problem at one z station ----------------------
//
//  A single bundle passed to TransportModel::localFluxes, replacing the old
//  positional argument list.  It carries the bulk state and every model
//  handle the local law may consult; a model reads only the fields it needs
//  (solution-diffusion ignores `membrane` and `speciation`, which are
//  forward-looking hooks for a future charged-NP / DSPM-DE model).
//
//  Pressures are in Pa; temperature in K; concentrations in kmol/m^3.
//  `c_b` is the local BULK (feed-side) solute concentration vector; the film
//  model raises it to the wall concentration c_m internally.
struct TransportContext
{
    const ThermoPackage&            thermo;     // global component package
    const std::vector<std::size_t>& soluteIdx;  // solute slots in thermo
    const std::vector<scalar>&      B_s;        // per-solute permeability
    scalar                          A_w;        // water permeability [m/(s.Pa)]
    scalar                          k_film;     // film coefficient [m/s]
    scalar                          P_feed_Pa;  // feed-side pressure [Pa]
    scalar                          P_perm_Pa;  // permeate pressure  [Pa]
    scalar                          T_K;        // temperature [K]
    const std::vector<scalar>&      c_b;        // local bulk solute conc.
    const OsmoticModel&             osm;        // osmotic-pressure model
    const Membrane*                 membrane;   // membrane handle (hook)
    const electrolyte::SpeciationSolver* speciation; // activity hook
};

class TransportModel
{
public:
    using Factory = std::function<std::unique_ptr<TransportModel>()>;

    virtual ~TransportModel() = default;

    virtual const std::string& type() const = 0;

    // Read model-specific parameters from the `transport {... }` block, if any.
    virtual void readParameters(const DictPtr& /*transportDict*/) {}

    // Solve the coupled local J_w–c_m–c_p problem at fixed bulk state.
    virtual TransportSolution localFluxes(const TransportContext& ctx) const = 0;

    // ---- Factory ----
    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<TransportModel> New(const std::string& name);
    static std::vector<std::string> availableTypes();
    static void registerBuiltins();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace membrane
} // namespace Choupo
