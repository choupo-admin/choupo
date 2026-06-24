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
Struct
    Choupo::ProcessStream

Description
    A material stream travelling between unit operations: name, T, P,
    total molar flow, composition, and (optionally) vapour fraction.

    Kept as a plain struct because flowsheet wiring is the only thing
    that reads/writes it — no methods, no invariants beyond what the
    code that produced it guarantees.

    Units (all SI canonical):

        F   total molar flow      [kmol/s]   ← changed from kmol/h
        T   temperature           [K]
        P   pressure              [Pa]
        z   mole fractions       (dimensionless, Σ z = 1)
        vf  vapour fraction       (dimensionless)

    Mass-basis flow is a *derived view*, not a stored field --- there
    is exactly one source of truth for the flow (F, molar).  Use the
    free function `F_mass(stream, thermo)` (declared in ThermoPackage.H)
    to obtain kg/s when needed.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <string>
#include <vector>

namespace Choupo {

// Particle-size distribution of a stream's solid phase.
// Discretised into bins: `diameter[k]` is the representative size of
// bin k [m]; `massFrac[k]` its fraction of the total solid mass
// (Σ massFrac = 1).  Empty for streams with no solids.
struct ParticleSizeDistribution
{
    std::vector<scalar> diameter;    // m
    std::vector<scalar> massFrac;    // fraction of solid mass per bin (Σ = 1)

    bool empty() const { return diameter.empty(); }
};

struct ProcessStream
{
    std::string name;
    scalar      F  = 0.0;        // total molar flow      [kmol/s]
    scalar      T  = 0.0;        // temperature           [K]
    scalar      P  = 0.0;        // pressure              [Pa]
    sVector     z;               // mole fractions       (Σ z = 1)
    scalar      vf = 0.0;        // vapour fraction       [-]
    // Specific molar enthalpy at the ELEMENTS reference (formation
    // datum, 298.15 K).  Populated by Flowsheet::solve once the case
    // has converged, via thermo.H_stream_formation(T, P, vf, z) when
    // every component carries `gibbsFormation`; left at 0 otherwise.
    // Units: J/mol.  Reaction-consistent -- the heat of reaction
    // emerges as h_out - h_in across a reactor.
    //
    // PRINCIPLE (settled 2026-06-08, forum 5/5): *H is the conserved
    // truth; T is the model-dependent readout of it.*  Because this datum
    // is a single globally-consistent zero (the elements/formation
    // reference), H is comparable ACROSS thermo models -- so at a model
    // boundary (a unit's `thermo {}` override) Choupo holds (T,P,z) and
    // lets H STEP (visible), rather than silently flexing T to force H
    // continuous.  A model boundary is not a physical device; there is no
    // real dT to absorb.  See CLAUDE.md sec.10 + docs/ai/energy.md sec.7.
    scalar      H  = 0.0;        // specific enthalpy      [J/mol]  (FLUID phase)
    bool        H_valid = false; // true iff H was computed (not zero by default)
    // Total FLOW enthalpy [kW] = F*H (fluid) + Σ s[i]*h°(solid,T) (crystals).
    // The .H above is the fluid molar enthalpy only; a solid product (sucrose
    // Powder) carries its mass in s[], NOT in F*H -- so the boundary energy
    // balance / GUI must read THIS field to count the crystals (else a solid
    // product shows ~no enthalpy and the plant balance is short by the crystal
    // formation enthalpy).  Filled post-solve alongside H.
    scalar      H_flow_kW = 0.0;
    bool        H_flow_valid = false;
    // ---- Solid phase -------------------------------------------
    // Particulate solids carried alongside the fluid, indexed by the SAME
    // components as `z` --- so a species can be BOTH dissolved (z[i]) and
    // a crystal (s[i]) at once (the basis for crystallisation: mass moves
    // z[i] <-> s[i]).  s[i] = molar flow of component i AS SOLID [kmol/s].
    // F / z / vf describe the FLUID phases only; the solid is carried
    // alongside.  Empty `s` (or all zero) = no solids.  `psd` is the size
    // distribution of the combined solid phase.
    sVector                   s;     // solid molar flow per component [kmol/s]
    ParticleSizeDistribution  psd;   // particle-size distribution
    // Demand-driven flag.  Set true when the stream was declared
    // with `state saturatedVapour/Liquid` and no F --- typically a
    // utility (heating steam, cooling water) supplied by a plant header
    // at whatever flow the consuming unit op needs.  The Flowsheet
    // writes F back to the registry after the consuming unit's solve()
    // so the Streams panel shows the actual demand.
    bool        demandDriven = false;
    // Utility category.  Optional tag used for utility-
    // consumption aggregation across the flowsheet.  When non-empty,
    // the consuming unit op reports its F_mass under this category
    // in `utilitiesConsumed()`, and the UtilityReportPass sums all
    // contributions by category.  Examples: "LP_steam_170kPa",
    // "coolingWater_298K", "compressedAir_8bar".  Streams without a
    // category are process streams (feed, product, intermediate).
    std::string category;
};

} // namespace Choupo
