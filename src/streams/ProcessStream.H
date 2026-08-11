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
#include <memory>

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

    //  Was `vf` AUTHORED as a pin, or merely CARRIED?  (R-E2, 2026-08-09.)
    //  The constitution's pins -- `vaporFraction q;` and `phase gas|liquid;`
    //  -- are physical CONSTRAINTS a case declares on a boundary stream, and
    //  a constraint may legitimately cost energy even at unchanged (T, P).
    //  A vf a producing unit wrote is not a constraint: it is that unit's
    //  answer.  The two are indistinguishable in `vf` alone, which is why
    //  the flag exists -- the file reader sets it, nothing else does, and
    //  ABSENCE OF A PIN IS NEVER A PIN (an unpinned stream's phase is the
    //  result of equilibrium at its own T, P, z).
    //  Record: docs/design/tp-stream-energy-coherence.md R-E1/R-E2, caveat C1.
    bool        phasePinned = false;
    // Specific molar enthalpy at the ELEMENTS reference (formation
    // datum, 298.15 K).  Populated by Flowsheet::solve once the case
    // has converged, via thermo.H_stream_formation(T, P, vf, z) when
    // every component carries `standardThermochemistry`; left at 0 otherwise.
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
    // Components genuinely PRESENT in this stream (z_i > 0 or s_i > 0) that
    // carry NO elements-datum enthalpy (no standardThermochemistry, no aqueous-ion
    // reference).  Non-empty => H / H_flow_kW are missing BY MISSING DATA, not
    // by composition -- so the energy-balance report / GUI energy plot must
    // REFUSE and name these, never silently drop the stream (the no-silent-
    // crutch credo).  Empty for every fully-curated stream.  Filled post-solve.
    std::vector<std::string> H_missing;
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

    // ---- Aqueous speciation: a REPORT-ONLY decomposition, never state -----
    //  What the reactive package actually solved inside this stream's liquid:
    //  the ions and dissolved molecules, with the network they belong to.
    //
    //  It is NOT a second home for the material.  The material is z/F/s on the
    //  apparent component basis, which is what crosses a model boundary and
    //  what every unit reads; this decomposes it, and collapses back through
    //  the components' declared bridges exactly.  Delete it and the case is
    //  unchanged -- that is the test of whether a field is state.  It is
    //  written to the stream file and VERIFIED on read (closure), then
    //  discarded: the reader never uses it to build the stream.
    //
    //  Held by shared_ptr so the common case -- every non-reactive stream in
    //  the corpus -- carries one null pointer and nothing else.
    struct Speciation
    {
        std::string network;   // WHICH chemistry set these names belong to
        //  Always "stoichiometric" when the SOLVER wrote it: the totals came
        //  from the components through the declared bridges, so H/OH are
        //  excluded mediators and the set does not close in charge.  An
        //  `analytical` set is what a LABORATORY writes, and it does.
        std::string basis = "stoichiometric";
        //  WHO answered for this decomposition (basis-reconciliation spike,
        //  2026-08-03): "solved:<unit>" = the chemistry was resolved there;
        //  "transported:<unit>" = the block crossed that unit as carried
        //  matter, chemistry NOT re-run.  Empty = a pre-spike block (the
        //  post-solve pass); the stream-file writer stamps it when set.
        std::string origin;
        //  AND AT WHAT STATE it was solved.  A transported block rides a
        //  stream whose T has moved -- a heater is a heater -- so the
        //  speciation on the file is the UPSTREAM equilibrium carried
        //  forward, not the equilibrium at the temperature printed beside
        //  it.  0 = unstamped (pre-spike).
        scalar solvedT = 0.0;   // [K]
        scalar solvedP = 0.0;   // [Pa]

        //  ...AND WHETHER IT IS STILL AN EQUILIBRIUM *HERE*.
        //
        //  An equilibrium is not a composition: it is a RELATION between
        //  composition and a thermodynamic state.  A composition solved at
        //  313 K does not become the equilibrium composition at 332 K by
        //  being carried there with a note saying where it came from --
        //  stamping the provenance makes the datum traceable, not valid.
        //  So the two claims are separated: the AMOUNTS remain a true
        //  material inventory (the transport conserved them exactly), while
        //  every equilibrium-derived quantity -- pH first among them --
        //  stops being reported for the new state.
        //
        //  Staleness is DECIDED, not assumed: the block goes stale when a
        //  state variable the equilibrium depends on has actually moved
        //  outside a unit authorised to recompute it.  A pump that carries
        //  a brine at constant T and P across a model boundary leaves a
        //  block that is still the equilibrium of that material; a heater
        //  does not.  (Counsel, 2026-08-03: "transportar os montantes pode
        //  ser correcto; transportar a alegação de equilíbrio não é.")
        bool equilibriumValidHere = true;
        std::vector<std::pair<std::string, scalar>> flows;  // species [kmol/s]
        scalar      pH = 0.0;
        bool        pH_valid = false;
    };
    std::shared_ptr<const Speciation> speciation;   // null = none, the default

    // ---- The AQUEOUS ANALYSIS this stream was DECLARED as -----------------
    //  INVENTORY IS NOT MEASUREMENT.  `speciesMolarFlows` declares an
    //  inventory -- flows the author has already reconciled, on which charge
    //  closure is a CONTRACT and a violation is refused.  `aqueousAnalysis`
    //  declares a MEASUREMENT: mg/L off a laboratory sheet, with
    //  uncertainties, which is exactly the thing that does not close and is
    //  supposed to be reconciled.  Keeping them apart is what let the seventh
    //  canonical form be ADDED rather than an existing one CHANGED.
    //
    //  What is held here is LAYER 2: the reconciliation the reader performed
    //  between the measurement (layer 1, the authored `0/` file, which is
    //  never rewritten -- O1) and the equilibrium (layer 3).  It is
    //  report-only in exactly the sense `speciation` is: the material is
    //  F/z/s on the component basis, and deleting this record changes no
    //  answer.  It exists so the resolved snapshot can say WHAT WAS ADJUSTED
    //  and BY HOW MUCH -- the one fact no arithmetic on the answer recovers.
    //
    //  Set by the stream-file READER only, on the stream whose `0/` file
    //  carried the analysis; written into `converged/<stream>` under
    //  `calculated {}`.  Null on every other stream, which is the negative
    //  the gate pins: the machinery does not switch itself on.
    struct AnalysisReconciliation
    {
        //  What one CONSTRAINT did to one measured quantity -- two different
        //  numbers that are easy to confuse and must not be:
        //    causedSigma  how much of THIS ROW's correction that law caused
        //                 (the exact KKT part -- they sum to the correction);
        //    closure      how much of THAT LAW's own residue this row's
        //                 correction removed (coeff * correction, e.g.
        //                 equivalents of charge for electroneutrality).
        struct ConstraintRole
        {
            std::string constraint;
            scalar      causedSigma = 0.0;
            scalar      closure     = 0.0;
        };

        struct Analyte
        {
            std::string species;          // the MASTER this row reports
            std::string label;            // the author's own row key
            std::string element;          // set => the row totals an ELEMENT
            std::string asFormula;        // reported-as surrogate ("" = none)
            //  THE ANALYTICAL QUALIFIER (slice C, ruled 2026-08-10): what
            //  KIND of concentration the row reports -- `dissolved` (the
            //  meaning the inversion implements), `total` or `freeIon`
            //  (both parsed and preserved; their RESOLUTION refuses until
            //  their thermodynamic meaning is honoured).  There is NO
            //  default: sample preparation is a fact about the laboratory,
            //  and Choupo cannot infer it safely.
            std::string qualifier;              // resolved (row or block)
            bool        qualifierFromDefault = false;
            scalar      perFormulaUnit = 1.0;   // species per surrogate unit
            scalar      uncertaintyPct = 0.0;   // 0 = not declared
            std::string uncertaintyOrigin;      // HOW that sigma was arrived at
            scalar      measured   = 0.0; // [kmol/s] as measured
            scalar      reconciled = 0.0; // [kmol/s] after the rule
            scalar      sigma      = 0.0; // [kmol/s] absolute uncertainty

            //  THE NORMALIZED CORRECTION -- the number that says whether a
            //  measurement was nudged or overruled.  A per-cent correction
            //  cannot say that: 5 % of a well-measured ion is a scandal and
            //  5 % of a poorly-measured one is nothing.
            scalar      correctionSigma = 0.0;
            std::string responsibleConstraint;   // the largest part
            scalar      responsibleShare  = 0.0; // |largest| / Sum|parts|
            bool        atNonNegativityBound = false;

            std::vector<ConstraintRole> roles;
        };

        //  ONE enforced conservation law, as it was applied.
        struct Constraint
        {
            std::string name;      // "electroneutrality", "elemental...:Ca"
            std::string family;    // the `enforce ( ... )` word
            std::string meaning;   // one sentence, for the reader
            scalar      residualBefore = 0.0;
            scalar      residualAfter  = 0.0;
            scalar      multiplier     = 0.0;
            bool        binding        = false;
        };

        std::string basis;             // the declared reporting basis
        std::string defaultQualifier;  // block-level analytical qualifier ("" = none declared)

        //  SLICE B, as CORRECTED (2026-08-10): the honest DIRECT closure.
        //  `provenance derivedDiluteVolume;` computes
        //      rho = rhoWaterKell(T_sample) + soluteMass
        //  and records BOTH terms -- a derivation, named as one.  The first
        //  build wrapped this constant-in-rho formula in an "iteration" and
        //  was REJECTED: an update independent of the iterate is a direct
        //  calculation wearing a loop.  `provenance iterative` stays REFUSED
        //  until a composition-dependent volume closure exists to define a
        //  real fixed point -- slice B is BLOCKED on that machinery, not
        //  completed (scope doc 10.6).
        scalar densityRhoWater   = 0.0;        // rhoWaterKell(T_sample) [kg/m3]
        scalar densitySoluteMass = 0.0;        // Sum solutes [kg per m3 of solution]
        //  RUNG 1 (ruled 2026-08-11): the selected volumetric formulation
        //  and, for standardStateVolumes, the per-master contributions --
        //  kept term by term so the written record is re-derivable by hand
        //  and so the gate can check the convention-invariance premise
        //  (Sum n z = 0) from the record itself.
        std::string densityMethod;             // "" = measured (no slot)
        scalar      densityVolumeFrac = 0.0;   // phi = Sum n V0 per L    [-]
        struct VolumetricTerm
        {
            std::string master;
            scalar      molPerL   = 0.0;       // [mol/L solution]
            scalar      V0_cm3mol = 0.0;       // conventional            [cm3/mol]
            scalar      MW_gmol   = 0.0;       // [g/mol]
            scalar      z         = 0.0;       // charge
            std::string convention;
        };
        std::vector<VolumetricTerm> densityTerms;
        std::string method;            // "" = none declared (pass-through)
        std::string methodAsWritten;   // the author's spelling (sugar kept)
        std::string adjustedSpecies;   // "" = nothing adjusted
        std::string densityProvenance; // "measured" (A1 accepts no other)

        scalar sampleT              = 0.0;   // [K]   0 = not declared
        scalar density              = 0.0;   // [kg/m3]
        scalar volumetricFlow       = 0.0;   // [m3/s]
        scalar solventMassFlow      = 0.0;   // [kg/s] (the molality route)
        scalar closureTolerancePct  = 0.0;   // the band, as applied
        bool   closureToleranceDefaulted = false;   // announced when true
        scalar maximumCorrectionPct = 0.0;   // 0 = no rule declared

        //  The charge residue, both as a signed EQUIVALENT flow [kmol/s of
        //  charge] and as the ion-balance error the water industry quotes,
        //      CBE % = 100 (Sum cations - Sum anions) / (Sum cations + Sum anions),
        //  both taken on the equivalent basis.  Two spellings of one fact,
        //  and the percentage is what a limit is declared in.
        scalar imbalanceBefore    = 0.0;
        scalar imbalanceAfter     = 0.0;
        scalar imbalancePctBefore = 0.0;
        scalar imbalancePctAfter  = 0.0;

        scalar pH        = 0.0;
        bool   pH_valid  = false;   // a MEASURED pH, never a balancing variable

        //  ---- WEIGHTED LEAST SQUARES (A2) ---------------------------------
        //  Empty when the method is not WLS.  `enforced` is what the case
        //  DECLARED in `enforce ( ... )`; `constraints` is what that expanded
        //  to, one row per law actually applied.
        std::vector<std::string> enforced;
        std::vector<Constraint>  constraints;
        scalar objective            = 0.0;   // Sum ((x-m)/sigma)^2 at the answer
        int    qpIterations         = 0;
        scalar maxCorrectionSigma   = 0.0;   // 0 = no sigma limit declared
        std::string uncertaintyPolicy;       // how sigmas were resolved, named

        std::vector<Analyte> analytes;      // in declared order
        //  The reconciled conserved inventory: master -> [kmol/s], sorted.
        std::vector<std::pair<std::string, scalar>> conservedInventory;
    };
    std::shared_ptr<const AnalysisReconciliation> analysis;

    //  The SECOND LIQUID, per component [kmol/s], when the package declares
    //  one and it is PRESENT.  Null = one liquid -- the absence of a phase,
    //  never a phase of zero.
    //
    //  Report-only, like `speciation`: F/z stay the APPARENT material of both
    //  liquids together and the two leave through one nozzle.  Only the
    //  ORGANIC side is held; the aqueous is `F*z - organic`, so the
    //  decomposition sums back EXACTLY by subtraction rather than by two
    //  independently-rounded vectors agreeing -- and that sum is what the
    //  stream-file reader checks.
    //
    //  It exists so a stream can say WHICH material its speciation
    //  decomposes: the ions are in the aqueous phase and nowhere else.
    std::shared_ptr<const sVector> organicLiquid;
};

} // namespace Choupo
