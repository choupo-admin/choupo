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

    THE PHYSICS.  Up to four phases at once -- ideal-gas vapour, a speciated
    aqueous liquid, an optional second (organic) liquid, and precipitating
    solids:
      * liquid speciation by the existing SpeciationSolver (closed system,
        pH SOLVED -- electroneutrality is one of its equations; Davies
        gammas; K(T) anchored analytic / van't Hoff, announced), including
        the minerals the case ADMITS in constant/chemistryDict, which reach
        their SI = 0 ceiling by the solver's own active-set complementarity;
      * phase transfer of each declared VOLATILE through its curated
        gas-liquid equilibrium record (chemistry/, recordType
        gasLiquidEquilibrium, PHREEQC convention  a(dissolved) = K(T) *
        p_gas[atm]).  Water's own record (H2O.dat) supplies the solvent VLE
        -- Raoult emerges as a_w/K, no separate Antoine wiring;
      * the MOLECULAR BACKBONE beside the ions: nonionising condensables
        priced on the pure-component (Raoult) reference by the declared
        molecular activity model, or by an authorised ideal (gamma = 1).
        The solvent activity decomposes multiplicatively, a_w = gamma_w x_w
        * aw_ionic, so nothing is counted twice;
      * PERMANENT GASES (noncondensable) leave that backbone -- a species
        far above its critical temperature has no pure liquid to reference
        -- and dissolve on the Henry rung of their own gas record;
      * a SECOND LIQUID when the case declares `equilibrium { organic {...} }`:
        both liquids share the molecular model (two models would make the
        residual measure their disagreement) and they leave as ONE apparent
        liquid, so the stream table and the outer Newton's dimension are
        unchanged and the no-organic path is byte-identical;
      * ions are EXCLUDED from the vapour by construction.

    NUMERICS.  Mathematically simultaneous, numerically nested (the ratified
    posture): an OUTER Newton on the vaporised moles of each volatile (log
    variables keep them positive), whose residuals are the gas-liquid
    equilibria; each residual evaluation re-solves the INNER liquid
    speciation (mass balances + mass action + electroneutrality) at the
    current liquid totals, and -- when an organic phase is declared -- the
    liquid-liquid split, by a Newton on the equality of ACTIVITY.  Gibbs
    DECIDES which phase set is being solved; the Newton only SOLVES it.
    Phase appearance/disappearance is an OUTER decision, tested on the feed,
    re-tested at the answer, announced both ways.

    The run only reports convergence when the JOINT residual set -- phase
    equilibria AND the speciation's own closures -- is satisfied at the
    accepted state.  Never flash-once/speciate-once.

    Every tolerance, cap, seed and iteration count lives in ONE named block
    at the top of the .cpp (`namespace num`), with the three that are
    load-bearing physics rather than housekeeping called out there: the
    smooth vaporisation cage, the two competing seeds, and the Gibbs margin
    the second liquid must beat before it is admitted.

    COLLAPSE RULE (spike contract, refused when not closable).  Each
    non-solvent apparent component owns a unique MARKER ELEMENT (NH3 -> N);
    every model species carrying that element collapses into that component's
    apparent total; the solvent absorbs the H/O residual.  Apparent totals
    are conserved exactly (the reactions conserve elements).  The builder
    REFUSES a chemistry set whose species cannot be mapped back this way.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Identifiers.H"
#include "core/Types.H"
#include "solver/Convergence.H"
#include "thermo/electrolyte/SpeciationSolver.H"

#include <functional>
#include <map>
#include <memory>
#include <set>
#include <string>
#include <vector>

namespace Choupo {
namespace electrolyte {

struct ReactiveVLEConfig
{
    // Apparent components, index-aligned with the package component vector.
    std::vector<std::string> apparent;
    std::size_t              solventIdx = 0;     // the water solvent

    // A non-solvent apparent component's CONTRIBUTION to the aqueous master
    // totals -- its column of the map  m = A n  (general salt reconstruction,
    // 2026-07-27; ADR docs/design/general-salt-reconstruction-proposal.md).
    //
    // It used to be ONE master with an implicit coefficient of 1, which every
    // component the reactive path had seen happened to fit (NH3 -> NH4+,
    // acetic -> Acetate-, CO2 -> HCO3-, H2S -> HS-).  A SALT does not:
    // dissolved CaCO3 IS calcium and carbonate at once, spanning two families
    // with a proton leg besides.  So the single master became the
    // stoichiometric VECTOR that the record already curates -- a component's
    // `aqueousMapping`, or a salt's `solidPhases.<phase>.dissolutionReaction`.
    //
    // A 1-master component is the strict special case: a column with a single
    // +1.  Everything that ran before this change runs identically after it.
    struct Family
    {
        std::size_t apparentIdx = 0;
        std::string marker;                      // e.g. "N" -- FALLBACK only,
                                                 // empty when declared
        //  (master, nu): NH3 -> {(NH4, +1)}; CaCO3 -> {(Ca,+1),(HCO3,+1)}.
        //  The H+ leg is NOT carried here: H is the shared mediator of every
        //  family and is closed by electroneutrality, never by a total.
        std::vector<std::pair<SpeciesId, scalar>> mapping;
    };
    std::vector<Family> families;

    // Volatile apparent components (by index) and the GAS name of the
    // gas-liquid record that serves each (component formula: water -> H2O).
    std::vector<std::size_t>           volatiles;
    std::map<std::size_t, std::string> gasOf;

    std::string activityModel = "davies";       // spike rung (announced)
    scalar      solventMW     = 18.015e-3;      // kg/mol (for the kgw basis)

    // NONREACTIVE MOLECULAR components (classifier: MolecularNonionising):
    // part of the liquid composition, the balances and the enthalpy --
    // OUTSIDE the aqueous speciation network.  No family, no master, no
    // gas-liquid record.  Their VLE rides the MOLECULAR BACKBONE below:
    // ideal Raoult (gamma = 1, authorised by the case's delimited
    // approximations block) or the declared molecular activity model.
    std::set<std::size_t>                                 nonreactive;
    std::map<std::size_t, std::function<scalar(scalar)>> psatOf; // Pa(T[K])

    //  PERMANENT GASES on the HENRY rung (N2, O2 -- `noncondensable true;`).
    //  Nonionising like the components above, and NOT on the molecular
    //  backbone: the backbone prices a liquid on the pure-component
    //  (Raoult) reference and a species above its critical temperature has no
    //  pure liquid to reference -- nitrogen's Antoine correlation stops at
    //  126 K and the cases that carry it run at 300.
    //
    //  Their dissolved amount is a TOTAL the aqueous system carries, so each
    //  one anchors a family like any other component.  What it does NOT do is
    //  declare that bridge on the component record: the dissolved species is
    //  already curated, once, in the gas-liquid record's `dissolvedSpecies`,
    //  and writing it again would be a second home for one fact (the
    //  coherence gate says so in as many words -- a bridge IS participation,
    //  so `aqueousSpeciation none;` would then be lying).  So the family is
    //  built in THIS class's constructor, where the gas records are loaded,
    //  from the typed reference they already carry (2026-07-27).
    std::set<std::size_t>                                 dissolvedGases;

    //  ---- THE CRITICAL TEMPERATURE OF EACH FLAGGED GAS --------------------
    //  Carried so the SOLVER can check what the BUILDER cannot.
    //
    //  `noncondensable true;` is a CASE-level modelling class, not a physical
    //  fact about a substance: a vapour is a gaseous substance BELOW its
    //  critical temperature (condensable by pressure alone) and a permanent
    //  gas is one above it, so "permanent gas" is a RELATION between Tc and
    //  the local temperature.  No substance IS a gas; a substance is a gas AT
    //  a temperature.  (OpenFOAM carries no such flag at all -- in
    //  multiphaseEuler's homogeneousCondensation a species simply never
    //  condenses when its saturation pressure exceeds the total pressure, so
    //  the behaviour emerges from the equation.)
    //
    //  Both sites that read `isNoncondensable()` are BUILD-time and have no
    //  temperature, so the contradiction can only be seen here.  Rather than
    //  re-reading the record in the solver -- a second home for one fact --
    //  the builder, which already holds the Component, attaches its Tc.
    //  Absent or 0 means the record declares none and nothing is claimed.
    //
    //  Record, with the sources and the rejected alternatives:
    //  docs/design/vapour-or-gas-is-a-state.md
    std::map<std::size_t, scalar>                         criticalTOfGas;

    //  ---- ADMITTED SOLID PHASES (from constant/chemistryDict) -------------
    //  The minerals this system may PRECIPITATE, passed straight through to
    //  the speciation kernel's `equilibrate` list.  EMPTY = the path this
    //  class has always taken, byte-identical by construction.
    //
    //  It is availability, not presence: whether any of them actually forms
    //  is the answer.  And the answer is a thermodynamic CEILING -- SI driven
    //  to 0, infinite time, no nucleation barrier -- never a deposition rate.
    //
    //  Note what does NOT change: the APPARENT basis.  Dissolved CaCO3 and
    //  solid CaCO3 are the same flowsheet component, so precipitation moves
    //  nothing between components; it moves material between PHASES inside
    //  the bottoms.  What it does change, and materially, is the speciation
    //  the rest of the flash sees -- the ions removed from solution stop
    //  buffering, and the H+ leg of a carbonate dissolution moves the pH.
    std::vector<std::string> admittedSolids;

    //  ...and WHICH COMPONENT owns each of them: phase name -> apparent
    //  index.  The sentence above -- "dissolved CaCO3 and solid CaCO3 are the
    //  same flowsheet component" -- is only actionable if the code can say
    //  which component that is, and it is NOT the mineral's name (calcite is
    //  CaCO3, gypsum is CaSO4:2H2O).  The owner is DECLARED: the component's
    //  record carries `solidPhases { <phase> { ... } }`, so the map is read
    //  off the records, never matched by name or by formula similarity.
    //
    //  A phase with no declared owner is absent from this map, and its
    //  precipitate stays where it always was -- inside the speciation report.
    //  That is the honest degradation: unowned matter cannot be moved into a
    //  phase of a component nobody named.
    std::map<std::string, std::size_t> solidOwner;

    //  ---- THE SECOND LIQUID (declared, not discovered) --------------------
    //  A benzene-rich organic phase alongside the aqueous one.  EMPTY means
    //  no second liquid was declared, and the solver must then take a path
    //  indistinguishable from the one it took before this field existed --
    //  that is the mitigation for adding unknowns to a Newton every reactive
    //  tutorial depends on.
    //
    //  members are apparent-component INDICES.  The list is explicit, never
    //  inferred: what a phase admits is a modelling decision with consequences
    //  the author must own (the excluded water-benzene immiscibility is a far
    //  bigger approximation than the excluded 0.2 mol% of water).
    //
    //  The organic phase is priced by the SAME molecular model as the aqueous
    //  backbone, and that is not a convenience.  The coupling is
    //      gamma_aq * x_aq = gamma_org * x_org,
    //  an equality of ACTIVITY, so the same physical state must give the same
    //  gamma on both sides.  Two different models would make the residual
    //  measure their disagreement instead of the distance from equilibrium.
    struct OrganicPhase
    {
        std::vector<std::size_t> members;      // apparent-component indices
        std::size_t              solventIdx = 0;
        std::string              reason;       // the declared approximation
    };
    OrganicPhase organic;                      // members empty = not declared

    // The liquid's MOLECULAR BACKBONE (mixed-solvent v1, ratified
    // 2026-07-26): the declared solvent + the nonreactive molecular
    // components, mole fractions on the ION-FREE basis.  When the case
    // declares `activityModel { ionic davies; molecular NRTL; }` the
    // builder wires `molecularGamma` (the FULL curated pair model -- never
    // a gammaInfinity constant): p_co = gamma*x*psat, and the solvent's
    // total activity DECOMPOSES multiplicatively,
    //     a_w = gamma_w(x_backbone) * x_w(backbone) * aw_ionic(speciation)
    // (the speciation aw knows only the aqueous molalities; the backbone
    // factor knows only the molecular mixture -- no double counting).
    // Ions stay Davies on WATER-REFERENCED molality and the network K's
    // stay water-referenced: the mixed-solvent transfer term is a NAMED
    // gap, announced.  Empty molecularGamma = gammas of 1 (the authorised
    // ideal route; the backbone x-basis still applies).
    std::vector<std::size_t>                       backbone;
    std::function<sVector(scalar, const sVector&)> molecularGamma;
    //  The NAME of that model, for the announcements.  A glass box that says
    //  "NRTL backbone" while a UNIFAC gamma is doing the work is telling the
    //  student the wrong thing about the number in front of them; the label
    //  used to be a hardcoded string (found 2026-07-27).
    std::string                                    molecularModelName;
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

    //  THE CONVERGENCE VERDICT OF THE OUTER NEWTON, in full: the raw
    //  (dimensional) residual at the seed and at the answer, the NORMALIZED
    //  residual at both, the achieved reduction, and the criterion that
    //  decided.  The raw number is kept because it is the physically
    //  interpretable one; the normalized number is the one the verdict is
    //  taken on.  Contract: solver/Convergence.H.
    solver::ResidualReport outerResidual;

    // The (T,P)-ACTING observables of the saturation pre-check, [atm]: the
    // sum of equilibrium partial pressures over the fully speciated liquid,
    // and -- when a volatile declares vapour dimerisation -- its
    // monomer/dimer split.  These are what a temperature sweep reads (the
    // flash publishes them as KPIs): both K(T) legs are van't Hoff in T, so
    // pEqSum climbs and the dimer share falls as T rises.  In a TWO-PHASE
    // result pEqSum equals P by construction (the vapour partials sum to P).
    scalar pEqSumAtm = 0.0;
    scalar pMonoAtm  = 0.0;
    scalar pDimerAtm = 0.0;
    bool   dimerOn   = false;

    // Ideal-Raoult contribution of each authorised nonreactive molecular
    // volatile, [atm] -- KPI-bound as p_<component>_atm.
    std::map<std::string, scalar> pMolecularAtm;

    //  THE INCIPIENT PARTIAL PRESSURES, per APPARENT component and index-
    //  aligned with the package's component vector, [atm]: the equilibrium
    //  partial pressure of each volatile over the FULLY SPECIATED liquid at
    //  v = 0.  Their sum is pEqSumAtm, which is what the saturation
    //  pre-check compares against P; this vector is the same quantity kept
    //  component by component instead of collapsed.
    //
    //  Why it has to exist.  A column stage needs a K-VALUE, and a K-value
    //  is an INCIPIENT quantity -- it is defined over a liquid whether or
    //  not a vapour phase happens to be present.  Reading K = y/x off a
    //  flash gives zero for every component the moment the trial state is
    //  subsaturated, and a MESH handed a column of zeros has a singular
    //  Jacobian and stops without moving (measured, on the sour-water
    //  witness: "Newton iters: 0").  With these partials the stage K is
    //  (p_i / P) / x_i, which is the ordinary gamma-phi K generalised to a
    //  liquid whose speciation sets the volatility -- and which agrees with
    //  y/x exactly when a vapour IS present, since then the partials sum to
    //  P by construction.
    //
    //  A nonvolatile keeps 0: no vapour route, no partial pressure, and
    //  saying so is the point (see stageK's ABSENT MEANS ABSENT).
    //  Where a volatile declares vapour dimerisation the entry is the
    //  APPARENT (monomer-basis) partial p_mono + 2*p_dimer, because the
    //  apparent component counts a dimer as two monomers everywhere else.
    sVector pEqAtm;

    // Two-phase dimer accounting (the re-weighted vapour balance,
    // 2026-07-26): TRUE dimer moles per mole of FEED, and the association
    // enthalpy [J/mol dimer] -- the vapour's true enthalpy is the apparent
    // (monomer-basis) enthalpy plus tDim*dH exactly (h_dim = 2 h_mono + dH),
    // so the flash duty is CORRECTED, never silently monomer-priced.
    scalar vapDimerMolPerMolFeed = 0.0;
    scalar dimDH_J               = 0.0;

    //  The SECOND LIQUID at the accepted state, per APPARENT component and
    //  index-aligned with the package's component vector, per ONE MOLE OF
    //  FEED (the basis of xApp/yApp).  EMPTY when one liquid -- the absence
    //  of a phase, not a phase of zero.
    //
    //  Only the ORGANIC side: the aqueous is the liquid minus it, so the two
    //  close by subtraction.  Publishing both would put one quantity in two
    //  homes and let them disagree in the last digits, which is exactly the
    //  closure a stream file's decomposition is checked on.
    sVector nOrgApp;
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

    //  THE CONVERGENCE CONTRACT of the outer phase-equilibrium Newton --
    //  the OpenFOAM triple, normalized residual, one shared implementation
    //  (solver/Convergence.H).  Installed by whoever holds the case's
    //  system/solverDict (choupoSolve's runSimulation for the global
    //  package, Flowsheet::thermoFor for a per-unit thermo{} world).  Never
    //  called => the documented defaults, which are ANNOUNCED on first use
    //  so a default is never mistaken for a number nobody chose.
    void setConvergence(const solver::ConvergenceControls& c, bool defaulted)
    { conv_ = c; convDefaulted_ = defaulted; }

    const solver::ConvergenceControls& convergence() const { return conv_; }

    // A species' composition in MASTERS -- the NETWORK's own stoichiometry,
    // which is the only thing that can collapse a speciation back onto the
    // component basis.  A master returns itself with nu = 1; a derived species
    // returns the formation reaction's master list (CaHCO3+ -> Ca(+1),
    // HCO3(+1); CO3-2 -> HCO3(+1), H(-1)).  Empty when the name is unknown.
    //
    // Exposed because the STREAM layer verifies the report-only `speciation`
    // block's closure, and re-deriving the stoichiometry there would be a
    // second home for the network (aqueous-stream-basis, 2026-07-27).
    std::vector<std::pair<std::string, scalar>>
    masterComposition(const std::string& species) const;

    // Speciate a material AS A LIQUID -- no phase split, no flash.  This is
    // what a stream REPORT needs: the decomposition must describe the material
    // the stream file carries, so that it collapses back onto it exactly.
    // Running the flash instead would describe the LIQUID THAT WOULD FORM,
    // which is a different material and does not close against the file
    // (found the day the feed grew a speciation block, 2026-07-27).
    // `nApp` is apparent amounts in the package's component order.
    SpeciationResult speciateAsLiquid(scalar T_K, const sVector& nApp) const;

private:
    ReactiveVLEConfig                 cfg_;
    std::unique_ptr<SpeciationSolver> spec_;
    // Gas-liquid K(T) per volatile (anchored analytic > van't Hoff > flat --
    // the same K(T) doctrine as the speciation records, mirrored here).
    scalar gasLogK(const GasEntry& g, scalar T_K) const;
    const GasEntry* gasFor(std::size_t appIdx) const;

    //  Announces, ONCE per instance, every component declared a permanent gas
    //  that is being solved BELOW its own critical temperature -- where it is
    //  in fact a condensable vapour.  Never refuses and never re-routes: the
    //  declaration is a legitimate modelling simplification (a psychrometric
    //  carrier), and silently deriving the routing instead would change
    //  answers across the corpus, which is a physics change wearing a
    //  refactor's clothes.  This is the ratified `role` vs `volatility{}`
    //  shape one axis over: the flag is the case's modelling class, Tc is the
    //  substance's physics, and the engine announces the contradiction rather
    //  than obeying it in silence.
    void noteSubcriticalGases(scalar T_K) const;
    mutable bool announcedSubcritical_ = false;

    //  The outer Newton's convergence controls (see setConvergence).
    solver::ConvergenceControls conv_{};
    bool                        convDefaulted_ = true;
    mutable bool                convAnnounced_ = false;
};

} // namespace electrolyte
} // namespace Choupo
