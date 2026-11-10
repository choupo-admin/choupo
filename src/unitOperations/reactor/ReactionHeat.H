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
Function
    Choupo::reactionHeat

    ONE shared resolver for the heat of reaction, so every reactor -- steady
    (conversion / yield / gibbs / CSTR / PFR) AND time-dependent (batchReactor,
    dynamicCSTR) -- speaks the SAME enthalpy base: the elements / formation
    datum.  The heat of reaction is

          dH_rxn(T) = Σ νᵢ · hᵢ(T)          [J per mole of extent]

    where each hᵢ carries ΔHf°(elements, 25 °C) from its standardThermochemistry{} block
    (phase-aware: h_pure_ig for "gas", h_formation(T,"liquid") otherwise).

    The reactions-dict `dH_rxn` key is DEMOTED to an explicit, announced,
    cross-checked OVERRIDE -- used only when a reacting species deliberately
    lacks formation data (toy / lumped / measured-ΔH pedagogy):

      (a) every species carries standardThermochemistry  -> the formation value is
          authoritative (sourceOut = "formation"); a present `dictOverride`
          is CROSS-CHECKED and a mismatch beyond tolerance is WARNED aloud,
          never silently overriding the curated value;
      (b) any species lacks standardThermochemistry      -> fall back to `dictOverride`
          and LOUDLY announce "dict OVERRIDE -- no formation datum"
          (sourceOut = "dict-override");
      (c) neither formation data nor a dict value -> WARN aloud and return 0
          (sourceOut = "none"); we never throw (backwards-compat / numerical
          honesty: no silent thermally-neutral crutch).

    This is the single source of truth.  Called ONCE per reaction at set-up
    (never in the integration hot loop), so its announcements are cheap.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"
#include "core/Dictionary.H"
#include "core/ProblemDivergence.H"

#include <cstddef>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

class ThermoPackage;

// Resolve the heat of reaction (J per mole of extent) on the elements/formation
// datum, with the dict value demoted to an announced, cross-checked override.
// `comps`/`nu` are the parallel stoichiometry vectors; `phase` is "gas" or
// "liquid"; `context` labels the announcements; `verbosity` gates the
// informational source line (warnings always print).  `sourceOut` reports
// which branch was taken ("formation" / "dict-override" / "none").
scalar reactionHeat(const ThermoPackage&            thermo,
                    const std::vector<std::size_t>& comps,
                    const std::vector<scalar>&      nu,
                    scalar                          T,
                    const std::string&              phase,
                    std::optional<scalar>           dictOverride,
                    const std::string&              context,
                    int                             verbosity,
                    std::string&                    sourceOut);

//  ---- C288: a MEASURED heat of reaction, declared by the case -------------
//  `heatOfReaction { value; T; phase; method; source; reason; }` on a reaction
//  entry.  The bare `dH_rxn X;` key keeps exactly its meaning (the heat when
//  formation data is missing, a cross-check warning otherwise) and is read by
//  the SAME parser as the shorthand of a block with no provenance (`bare`).
struct DeclaredHeat
{
    scalar      value_J_per_mol = 0.0;   // per mole of extent, nu as written
    bool        bare   = false;          // true: the `dH_rxn` key, no provenance
    scalar      T_K    = 0.0;            // block only
    std::string phase;                   // block only: liquid | gas
    std::string method;                  // block only: calorimetry | vantHoff
    std::string source;                  // block only, non-empty
    std::string reason;                  // block only, non-empty
};

struct HeatCorrection
{
    bool         active    = false;      // a measured block AND full formation data
    scalar       declared  = 0.0;        // J/mol at T_K, phase
    scalar       formation = 0.0;        // J/mol, reactionHeat at the SAME T_K, phase
    scalar       delta     = 0.0;        // declared - formation (J/mol of extent)
    // What to hand reactionHeat() as its `dictOverride`: the value for the
    // bare key (unchanged behaviour) or for a block whose species lack
    // formation data (it is then the heat itself); nullopt when a block is
    // active (the formation route stays the heat, `delta` is the correction).
    std::optional<scalar> overrideForResolver;
    DeclaredHeat decl;
};

// Reads `heatOfReaction {}` and/or `dH_rxn` from a reaction dict.  Refuses by
// name: both present; a block with a missing/empty field; a bad phase/method.
std::optional<DeclaredHeat> parseDeclaredHeat(const Dictionary& rxn,
                                              const std::string& context);

// delta = declared - formation at the declared T and phase.  Computed and
// announced only; NO reactor applies it yet (C288 slices 2-4).
HeatCorrection resolveDeclaredHeat(const ThermoPackage&            thermo,
                                   const std::vector<std::size_t>& comps,
                                   const std::vector<scalar>&      nu,
                                   const std::optional<DeclaredHeat>& decl,
                                   const std::string&              context,
                                   int                             verbosity);

// equilibriumReactor / gibbsReactor: throws if `rxn` declares `heatOfReaction`.
void refuseDeclaredHeat(const Dictionary& rxn, const std::string& unitType,
                        const std::string& physicalReason);

// reactive column: prints one divergence line if `rxn` declares `heatOfReaction`.
void announceDeclaredHeatDivergence(const Dictionary& rxn, const std::string& context);

} // namespace Choupo
