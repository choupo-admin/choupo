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

    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
-------------------------------------------------------------------------------
Class
    Choupo::electrolyte::ReactiveVLE

Description
    COUPLED chemical + phase equilibrium for a volatile weak electrolyte --
    the NH3/water spike of the speciation-integration programme
    (docs/architecture/property-architecture.md section 6b, ratified
    2026-07-25).

    THE CONTRACT (unit-local speciation).  Streams are persisted on the
    APPARENT component basis only -- the stream-state constitution is
    untouched, and no ion is ever written to a 0/ file.  The mandatory flow:

        apparent stream state (T, P, apparent totals)
            -> expand to model aqueous species     (inside THIS class)
            -> SIMULTANEOUS speciation + phase equilibrium
            -> collapse to apparent phase totals  (inside THIS class)
            -> apparent outlet streams

    The model species (NH4+, H+, OH-, ...) exist only in the internal state
    and in the detailed report.  UNITS NEVER IMPLEMENT CHEMISTRY: a unit op
    calls ThermoPackage::equilibrate(), which delegates here.

    THE PHYSICS (spike scope).  Aqueous liquid + ideal-gas vapour:
      * liquid speciation by the existing SpeciationSolver (closed system,
        pH SOLVED -- electroneutrality is one of its equations; Davies
        gammas; K(T) anchored analytic / van't Hoff, announced);
      * phase transfer of each declared VOLATILE through its curated
        gas-liquid equilibrium record (chemistry/, recordType
        gasLiquidEquilibrium, PHREEQC convention  a(dissolved) = K(T) *
        p_gas[atm]).  Water's own record (H2O.dat) supplies the solvent VLE
        -- Raoult emerges as a_w/K, no separate Antoine wiring;
      * ions are EXCLUDED from the vapour by construction.

    NUMERICS.  Mathematically simultaneous, numerically nested (the ratified
    posture): an OUTER Newton on the vaporised moles of each volatile (log
    variables keep them positive), whose residuals are the gas-liquid
    equilibria; each residual evaluation re-solves the INNER liquid
    speciation (mass balances + mass action + electroneutrality) at the
    current liquid totals.  The run only reports convergence when the JOINT
    residual set -- phase equilibria AND the speciation's own closures --
    is satisfied at the accepted state.  Never flash-once/speciate-once.

    COLLAPSE RULE (spike contract, refused when not closable).  Each
    non-solvent apparent component owns a unique MARKER ELEMENT (NH3 -> N);
    every model species carrying that element collapses into that component's
    apparent total; the solvent absorbs the H/O residual.  Apparent totals
    are conserved exactly (the reactions conserve elements).  The builder
    REFUSES a chemistry set whose species cannot be mapped back this way.
\*---------------------------------------------------------------------------*/

#pragma once

#include "../../core/Identifiers.H"
#include "core/Types.H"
#include "thermo/electrolyte/SpeciationSolver.H"

#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {
namespace electrolyte {

struct ReactiveVLEConfig
{
    // Apparent components, index-aligned with the package component vector.
    std::vector<std::string> apparent;
    std::size_t              solventIdx = 0;     // the water solvent

    // Non-solvent apparent family: marker element + the aqueous MASTER whose
    // total carries the family (NH3 -> marker N, master NH4).
    struct Family
    {
        std::size_t apparentIdx = 0;
        std::string marker;                      // e.g. "N"
        SpeciesId   master;                      // e.g. "NH4"
    };
    std::vector<Family> families;

    // Volatile apparent components (by index) and the GAS name of the
    // gas-liquid record that serves each (component formula: water -> H2O).
    std::vector<std::size_t>           volatiles;
    std::map<std::size_t, std::string> gasOf;

    std::string activityModel = "davies";       // spike rung (announced)
    scalar      solventMW     = 18.015e-3;      // kg/mol (for the kgw basis)
};

struct ReactiveVLEResult
{
    bool   converged = false;
    scalar V_over_F  = 0.0;
    sVector xApp, yApp;            // apparent mole fractions, liquid / vapour
    // The INTERNAL true state -- report-only, never persisted:
    SpeciationResult trueState;
    scalar pH = 7.0;
    // Joint residuals at the ACCEPTED state (all must pass together):
    scalar resPhaseMax   = 0.0;    // worst gas-liquid equilibrium residual
    scalar resSpeciation = 0.0;    // inner Newton residual at acceptance
    std::string diagnostic;
    int    iterations = 0;
};

class ReactiveVLE
{
public:
    // Builds the internal SpeciationSolver and VERIFIES the configuration is
    // servable: every declared volatile has a gas-liquid record; every
    // family's master exists in the network; refusals are named (the
    // builder surfaces them at assembly, never at solve time).
    explicit ReactiveVLE(ReactiveVLEConfig cfg);
    ~ReactiveVLE();

    // TP equilibrium of an apparent feed: F [kmol/s] with apparent mole
    // fractions z.  Returns the apparent phase split + the internal true
    // state.  Throws (named) on non-convergence -- never a silent partial
    // answer.
    ReactiveVLEResult solve(scalar T_K, scalar P_Pa, scalar F,
                            const sVector& zApp, int verbosity) const;

    const ReactiveVLEConfig& config() const { return cfg_; }

private:
    ReactiveVLEConfig                 cfg_;
    std::unique_ptr<SpeciationSolver> spec_;
    // Gas-liquid K(T) per volatile (anchored analytic > van't Hoff > flat --
    // the same K(T) doctrine as the speciation records, mirrored here).
    scalar gasLogK(const GasEntry& g, scalar T_K) const;
    const GasEntry* gasFor(std::size_t appIdx) const;
};

} // namespace electrolyte
} // namespace Choupo
