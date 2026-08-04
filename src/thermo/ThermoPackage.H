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
    Choupo::ThermoPackage

Description
    The COMPUTE step of the property architecture: components + the phase
    models that turn a state (T, P, composition) into K-values, fugacities,
    enthalpies, densities and transport properties.

        a case DECLARES its system INLINE   (constant/thermoPhysPropDict,
                │                            recordType thermophysicalPropertySystem)
                ▼
        ThermoPackageBuilder  ASSEMBLES     (loads + verifies + announces,
                │                            NEVER estimates)
                ▼
        ThermoPackage         COMPUTES      <- this class
                ▼
        unit ops              flash · reactor · column · crystalliser · membrane

    A ThermoPackage is ASSEMBLED, never self-read from a dictionary: the
    builder calls assembleTwoPhase / assembleNamedPhases /
    adoptElectrolytePackage with model-config dicts it prepared from the
    authored v2 blocks.  (The former `readFromDict` reader of the retired v1
    grammar is gone; the v1 grammar itself is refused at the dispatch.)

    ONE GIBBS SURFACE PER PHASE.  `phases_` holds the real structure -- each
    Phase answers fEffective(T,P,x), so the generalised K between phases α
    and β is K_i = fEff_α / fEff_β.  A vapour phase carries φ, a liquid
    phase carries γ (or the same EoS in a phiPhi world), and a named second
    liquid phase carries its own γ surface (gammaGamma / LLE).  The
    activity_ / eos_ pointers are CONVENIENCE handles on the first liquid
    and first vapour, kept for the classic two-phase VLE call sites.

    The five formulations the builder assembles into this class:
    gammaPhi · gammaGamma · phiPhi · diluteSolution · electrolyteGammaPhi.
    Authority: docs/architecture/property-architecture.md (level 2).
\*---------------------------------------------------------------------------*/

#pragma once

#include "Component.H"
#include "core/Identifiers.H"
#include "PackageAudit.H"
#include "core/Dictionary.H"
#include "core/Types.H"

#include <map>
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

// The model families this interface holds by POINTER are forward-declared
// (build hygiene 4/6): 136 translation units include ThermoPackage.H, and
// none of them needs the concrete model headers to talk to the package.
// The .cpp defines the destructor, moves and every body that dereferences
// one of these, where the types are complete.
class ActivityModel;
class Database;
class DiffusivityModel;
class ElectrolyteModel;
class EquationOfState;
class LiquidConductivityModel;
class LiquidDiffusivityModel;
class LiquidViscosityModel;
class Phase;
class PureFluidModel;
class SurfaceTensionModel;
class ThermalConductivityModel;
class TransportModel;
namespace electrolyte {
class  ReactiveVLE;
class  SpeciationSolver;
struct ReactiveVLEResult;
struct ReactiveVLEConfig;
struct SpeciationInput;
struct SpeciationResult;
}

// Which bulk phase a density() request refers to.  The caller knows the phase
// from the stream's vapour fraction -- density() does NOT guess it.
enum class DensityPhase { Liquid, Vapour };

class ThermoPackage
{
public:
    ThermoPackage();       // out-of-line (= default in the .cpp): the inline
                           //   form would need the members' dtors complete
    // Custom MOVE: a LiquidPhase borrows `&components_` for its reference
    // fugacity, so a default member-wise move would leave the moved-in phases
    // pointing at the SOURCE's emptied vector -> a dangling read in fEffective
    // (seen when a molecular package built by value in ThermoPackageBuilder is
    // returned).  Move every member, then re-point the phases at THIS vector.
    // Copy stays deleted (phases_ holds unique_ptr).  KEEP THE MEMBER LIST BELOW
    // IN SYNC with the data members if any are added.
    ThermoPackage(ThermoPackage&& o) noexcept;
    ThermoPackage& operator=(ThermoPackage&& o) noexcept;
    ~ThermoPackage();      // out-of-line: unique_ptr members of fwd-declared types

    // ThermoPackageBuilder seam: adopt an already-assembled electrolyte
    // package (components + activity + EoS) without re-reading any data
    // file.  Used only by ThermoPackageBuilder.
    void adoptElectrolytePackage(std::vector<Component> comps,
                                 std::unique_ptr<ActivityModel> act,
                                 std::unique_ptr<EquationOfState> eos);

    // Two-phase (liquid, vapour) assembly.  Consumes MODEL CONFIG dicts
    // (the factory-input form -- activity model + pairs, EoS model + kij --
    // prepared by ThermoPackageBuilder::buildV2 from the authored
    // sub-blocks): loads/canonicalises the components, injects the
    // component-intrinsic UNIFAC groups / UNIQUAC r,q, builds the two
    // phases, runs the phiPhi coherence check + world announcement and the
    // audits.  `world` is "gammaPhi" or "phiPhi"; for phiPhi pass the
    // ideal-activity placeholder as activityDict.
    void assembleTwoPhase(const std::vector<std::string>& names,
                          const DictPtr& activityDict,
                          const DictPtr& eosDict,
                          const std::string& world,
                          const Database& db,
                          const DictPtr& transportDict = nullptr,
                          const DictPtr& pureFluidsDict = nullptr);

    // NAMED-phase assembly (gammaGamma LLE/VLLE): each config dict is one
    // phase ({name; type; activity{...}} or {name; type vapor; eos{...}}),
    // prepared by buildV2.  Every phase is built; the convenience
    // activity_/eos_ pointers come from the first liquid/vapour; audits run.
    void assembleNamedPhases(const std::vector<std::string>& names,
                             const std::vector<DictPtr>& phaseConfigs,
                             const Database& db);

    // The dissolution wiring (Henry solvent + solutes): validates every
    // declared
    // solute's pair file (fail-closed, never a silent Raoult fallback) and
    // prints the LOUD per-pair Henry announcement.  Call AFTER the
    // components are loaded (an assemble* call).
    void applySolution(const std::string& solvent,
                       const std::vector<std::string>& solutes);

    std::size_t n() const { return components_.size(); }
    const Component& comp(std::size_t i) const { return components_.at(i); }
    std::size_t indexOf(const std::string& name) const;

    // ----- Single-phase access (legacy VLE convenience) -------------------
    // K_i = γ_i Psat_i / (φ_i P), computed via the first liquid and first
    // vapor phases registered (typical VLE setup).
    scalar K(std::size_t i, scalar T_K, scalar P_Pa,
             const sVector& x, const sVector& y) const;

    sVector Kvec(scalar T_K, scalar P_Pa,
                 const sVector& x, const sVector& y) const;

    sVector Kvec_Raoult(scalar T_K, scalar P_Pa) const;

    //  ---- STAGE EQUILIBRIUM: the K-values an EQUILIBRIUM STAGE sees -----
    //
    //  `Kvec` is the MOLECULAR K-value surface and has no reactive branch,
    //  so a tray in a speciating world has no equilibrium to ask for.  A
    //  sour-water stripper is the case that needs one: strip CO2 and the
    //  liquid pH rises, the rising pH converts NH4+ back to free NH3, and
    //  the NH3 then strips -- the separation and the speciation are the
    //  same problem, which no molecular K can express.
    //
    //  This is the ONE entry a staged unit calls.  Under a molecular
    //  package it IS `Kvec` (bit-identical, so every existing column is
    //  untouched).  Under a reactive package it runs the reactive flash at
    //  the stage's own (T, P, z) and reads back the EFFECTIVE APPARENT
    //  K_i = y_i / x_i.
    //
    //  What that is, and is not.  The apparent components remain the
    //  state, as the two-bases doctrine requires -- the chemistry is
    //  internal to the stage exactly as it is internal to a flash, and the
    //  Jacobian above sees apparent components only.  It is NOT a rigorous
    //  species-basis MESH: the chemistry is re-solved inside each residual
    //  evaluation (the nested posture the two-liquid flash already uses),
    //  and it costs one reactive flash per stage per iteration.  A case
    //  that runs it must SAY so; scope:
    //  docs/design/sour-water-stripper-scope.md.
    //
    //  `zStage` is the stage's overall apparent composition (the feed to
    //  its own equilibrium).  A component absent from both phases returns
    //  K = 0 rather than a division by zero -- an absent species has no
    //  partition coefficient, and inventing one would put a number where
    //  the model has none.
    sVector stageK(scalar T_K, scalar P_Pa, const sVector& zStage,
                   const sVector& x, const sVector& y) const;   // .cpp

    // ----- Phase access (multi-phase generalisation) ---------------------
    std::size_t       nPhases()                       const { return phases_.size(); }
    const Phase&      phase(std::size_t k)            const;   // .cpp (fwd-decl Phase)
    std::size_t       phaseIndexByName(const std::string& name) const;
    std::vector<std::size_t> phasesOfType(const std::string& typeName) const;

    // Generalised K-value between phases α and β  (K_i = x_i^β / x_i^α):
    //     K_i = fEff_α(x_α)_i / fEff_β(x_β)_i
    sVector Kvec_phases(std::size_t alpha, std::size_t beta,
                        scalar T_K, scalar P_Pa,
                        const sVector& x_alpha,
                        const sVector& x_beta) const;

    // ---- Mixture enthalpy [J/mol of feed] -------------------------------
    scalar Hliquid (scalar T_K, const sVector& x, scalar Tref_K = 298.15) const;
    scalar Hvapour (scalar T_K, const sVector& y, scalar Tref_K = 298.15) const;
    scalar Hmixture(scalar T_K, scalar V_over_F,
                    const sVector& x, const sVector& y,
                    scalar Tref_K = 298.15) const;

    // ---- Ideal-gas mixture H and S (NIST/JANAF reference state) ---------
    //
    //   H_ig(T, y)     = Σ yᵢ · h_pure_ig_i(T)
    //                    = Σ yᵢ [ Hf°_i,298 + ∫_298^T Cp_ig_i(T') dT' ]
    //                                                              [J/mol]
    //
    //   S_ig(T, P, y)  = Σ yᵢ · s_pure_ig_i(T)              (pure-state)
    //                  −  R · Σ yᵢ · ln(yᵢ)                 (mixing)
    //                  −  R · ln(P / P_ref)                 (pressure)
    //                                                              [J/(mol·K)]
    //
    //   with P_ref = 1 bar = 1e5 Pa (convention of the S°_298 values in
    //   the.dat standardThermochemistry blocks --- JANAF / NIST reference state).
    //   Requires every component in the mixture to carry a `standardThermochemistry`
    //   block; otherwise the underlying h_pure_ig / s_pure_ig throw with
    //   a clear error.
    //
    //   The PAIR is reference-consistent --- δh = T δs along reversible
    //   paths --- so it is the right primitive for compressor / turbine
    //   work, where the isentropic step asks `S_ig(T_out_isen, P_out, y)
    //   = S_ig(T_in, P_in, y)`.
    scalar H_ig(scalar T_K, const sVector& y) const;
    scalar S_ig(scalar T_K, scalar P_Pa, const sVector& y) const;

    // Ideal-gas mixture Cp [J/(mol·K)] --- Σ yᵢ Cp_ig_i(T).  Cheap helper
    // for diagnostic output (γ = Cp/(Cp−R) etc.).
    scalar Cp_ig(scalar T_K, const sVector& y) const;

    // Real-gas mixture H and S, combining the ideal-gas reference with
    // the departure functions of the EoS:
    //
    //     H_real(T, P, y) = H_ig(T, y)        + eos.H_residual(T, P, y)
    //     S_real(T, P, y) = S_ig(T, P, y)     + eos.S_residual(T, P, y)
    //
    // For idealGas these coincide with the _ig methods (residuals = 0);
    // for SRK / PR they pick up the cubic-EoS departures.  These are the
    // primitives the compressor / turbine unit ops consume.
    scalar H_real(scalar T_K, scalar P_Pa, const sVector& y) const;
    scalar S_real(scalar T_K, scalar P_Pa, const sVector& y) const;

    // ---- ABSOLUTE (elements-reference) enthalpy for energy balances ------
    //
    // The Hliquid / Hvapour pair above uses the SENSIBLE+latent datum
    // (h_liq_i(Tref) = 0 PER component), which is fine for non-reacting
    // units --- the per-component zero cancels in h_out - h_in.  But it
    // does NOT carry the heat of formation, so an energy balance ACROSS
    // a reactor misses the heat of reaction entirely.
    //
    // These methods use the ELEMENTS reference (Hf at 298.15 K, the same
    // datum as H_ig), so the reaction enthalpy emerges automatically as
    // the difference of formation enthalpies.  This is the datum an
    // energy balance must use to close through a reactor.
    //
    //   H_liquid_formation(T, x) = Σ xᵢ [ h_pure_ig_i(T) − Δhvap_i(T) ]
    //   H_stream_formation(T,P,vf,z) = (1−vf)·H_liquid_formation
    //                                + vf·H_real          [J/mol]
    //
    // Both require every component present to carry `standardThermochemistry`
    // (for h_pure_ig) and Watson data (for Δhvap); they throw otherwise,
    // and the energy-balance report falls back to the sensible datum
    // with a flagged note.
    scalar H_liquid_formation(scalar T_K, const sVector& x) const;
    scalar H_stream_formation(scalar T_K, scalar P_Pa, scalar vapFrac,
                              const sVector& z) const;

    // ---- THE canonical per-species phase leg (forum #103/#105) ----------
    //
    // ONE function owns the species -> phase -> elements-datum enthalpy
    // rung, and every consumer -- H_liquid_formation's molecular loop,
    // reactionHeat's formation branch, and through them every balance,
    // duty and published stream H -- reads it, so two surfaces can never
    // drift again (the batch05/batch01 phantom-residual lesson).
    //
    //   liquid:  solution-tier solute -> Hf_crystal + dHsoln + INT cp_aq
    //            (the m->0 STANDARD state -- see ReferenceContext)
    //            volatile              -> h_pure_ig(T) - Hvap(T)
    //   gas:     h_pure_ig(T)
    //
    // ReferenceContext is the TYPED contract for what the returned number
    // means for composition-dependent chemistry (#103: never pretend a
    // per-species API carries a partial molar quantity):
    //   StandardPhase -- the species' STANDARD-state leg in the phase
    //     (infinite dilution for a dissolved solute; the only context
    //     today).  A real partial-molar evaluation needs the full mixture
    //     state and would be a FUTURE context, not an overload of this one.
    // Throws (never a silent fallback) when the species has no route in
    // the requested phase.
    enum class ReferenceContext { StandardPhase };
    scalar speciesPhaseEnthalpy(std::size_t i, scalar T_K, scalar P_Pa,
                                const std::string& phase,
                                ReferenceContext ctx) const;

    // ---- LEGACY per-natural-phase blend -- NOT a balance surface ---------
    //
    // The pre-unification blend (each component from ITS OWN tabulated
    // phase, blend-by-z): it drifts from the canonical surface by the
    // Watson-vs-Kirchhoff path difference and misses the solution tier,
    // which is exactly the phantom residual the batch ledger exposed
    // (forum #102.10/#103).  It SURVIVES under this deliberately awkward
    // name for TWO purposes only, both non-published:
    //   * the recycle TEAR residual (a convergence norm, any consistent
    //     surface works, robustness matters more than the datum);
    //   * the ANNOUNCED degraded fallback for a stream .H whose species
    //     cannot price on the canonical surface (the enthalpy-GAP path).
    // It must NEVER enter an energy balance, a duty, or a closed stream
    // .H -- the check_h_surface gate enforces the authorized-locus list.
    scalar H_blendPerNaturalPhase(scalar T_K, scalar P_Pa, scalar vapFrac,
                                  const sVector& z) const;

    const std::vector<Component>& components() const { return components_; }
    const ActivityModel&    activity() const { return *activity_; }
    bool hasActivity() const { return activity_ != nullptr; }

    // Does component i have ANY route to an ELEMENTS-datum enthalpy that the
    // H_*_formation kernels actually honour?  The two such routes:
    //   (1) a `standardThermochemistry{}` block (the normal formation datum), or
    //   (2) the electrolyte AQUEOUS infinite-dilution ion reference, when the
    //       package's salt is calorimetrically fitted AND its ions carry the
    //       slice-2 aqueous tier (hasAqueousReference()).
    // This is the predicate the ENERGY balance uses to tell a genuine
    // missing-DATA skip (a present species with no datum -> REFUSE, name it)
    // from a composition skip (z_i = 0 -> legitimately silent).  It must agree
    // with what H_liquid_formation / H_ig will compute, so it gates the
    // electrolyte route exactly as the kernel does (calorimetricFit) -- never
    // a false "has datum" that the kernel would then throw on.
    bool hasEnthalpyDatum(std::size_t i) const;

    // ---- Aqueous-solution tier (data/standards/solution/) ----------------
    // Standard enthalpy of solution [J/mol] of a DISSOLVED molecular solute
    // (crystal -> solvent, the dissolved-vs-crystalline rung), resolved
    // through the package's default solvent.  Returns nullopt when component
    // `i` is not a solution-tier dissolved solute (volatile species, or a
    // solute with no solution/<solute>-<solvent>.dat entry).  ANNOUNCES the
    // default-solvent resolution on first use (deduped); FAILS WITH A REMEDY
    // if an off-default solvent is named but no matching pair exists (the
    // no-silent-crutch credo, applied to solvents).  The crystalliser reads
    // the SAME number so its duty and the elements-datum stream balance
    // reconcile from one sourced value.
    std::optional<scalar> dHsolnForSolute(std::size_t i) const;

    // Electrolyte (ionic) activity model.  It is just the activity model when an
    // electrolyte one (pitzer) was selected -- recovered by an interface downcast
    // over activity_, null for molecular cases.  (This MI bridge is Workstream
    // A2's target; the construction-time configure/setMolarVolumes downcasts are
    // gone -- models self-configure from the components in their constructors.)
    bool hasElectrolyte() const;                        // .cpp (ActivityModel)
    const ElectrolyteModel& electrolyte() const;        // .cpp
    const EquationOfState&  eos()      const;           // .cpp
    bool                    hasEos()   const { return eos_ != nullptr; }

    // ---- Declared aqueous chemistry (INDEPENDENT of the formulation) ------
    //  A case whose liquid IS an aqueous electrolyte solution declares that
    //  ONCE -- `equilibrium { aqueous { ... } }` -- whether or not it also
    //  computes a phase equilibrium.  Before this, the `aqueous` block was
    //  readable only inside `formulation electrolyteGammaPhi`, which demands
    //  `volatiles`; a liquid-only case (an RO vessel speciating its brine for
    //  scaling) therefore had NO way to declare its chemistry, wrote the
    //  harmless placeholder `gammaPhi / ideal`, and the unit invented an
    //  activity model of its own.  That is how a hidden default is born: not
    //  by carelessness, but by a grammar with no slot for the truth.
    //
    //  UNITS NEVER CHOOSE AN AQUEOUS ACTIVITY MODEL.  A unit needing aqueous
    //  chemistry reads this; when nothing is declared it REFUSES, naming the
    //  block the case must add.  Never a default, never a guess.
    struct AqueousChemistry
    {
        bool                     declared = false;
        std::string              activityModel;   // davies | Pitzer | eNRTL
        std::vector<std::string> masters;         // the speciation network
        std::vector<std::string> solidPhases;     // admitted (constant/chemistryDict)
        DictPtr                  speciationBlock; // the case's raw speciation{}
                                                  // sub-dict -- carried WHOLE so
                                                  // the D-R1 networkScope parse
                                                  // has exactly one home
                                                  // (SpeciationSolver::applyNetworkScope)

        // THE component -> aqueous-species bridge, stoichiometric and
        // DECLARED (a component's `aqueousMapping` block, or its legacy
        // `dissociatesTo` converted at load; never name identity).  Built
        // once by the ThermoPackageBuilder, validated against the species
        // registry -- the ONLY place the two identity spaces meet.
        std::map<ComponentId, std::vector<SpeciesStoich>> aqueousMapping;

        //- The bridge for a unit that requires a one-to-one component: its
        //  single master species.  Refuses, by name, a component with no
        //  declared mapping or with a multi-species one.
        const SpeciesId& singleMaster(const ComponentId& c) const
        {
            auto it = aqueousMapping.find(c);
            if (it == aqueousMapping.end() || it->second.empty())
                throw std::runtime_error("aqueousMapping: component '" + c.key
                    + "' declares no aqueous mapping.  Add to its component"
                      " record:\n    aqueousMapping ( { species " + c.key
                    + "; nu 1; } );\n(or a dissociatesTo block for a salt)."
                      "  No name-identity fallback is applied.");
            if (it->second.size() > 1)
                throw std::runtime_error("aqueousMapping: component '" + c.key
                    + "' maps to " + std::to_string(it->second.size())
                    + " species -- this operation needs a single-master"
                      " component (feed the ions, not the salt).");
            return it->second.front().species;
        }
    };

    void declareAqueousChemistry(AqueousChemistry a)
    { aqueous_ = std::move(a); aqueous_.declared = true; }
    const AqueousChemistry& aqueousChemistry() const { return aqueous_; }

    //- THE aqueous speciation query.  The unit supplies the STATE it wants
    //  speciated (totals, T, the pH closure, which admitted solids to index);
    //  the PACKAGE supplies the model, because choosing one is not a unit's
    //  business.  Every consumer -- membrane scaling, ion exchange, a report --
    //  comes through here, so there is one speciation in a case, not one per
    //  unit.  Refuses when the case declared no aqueous chemistry: a missing
    //  declaration is an error to be fixed, never a default to be applied.
    electrolyte::SpeciationResult
    speciateAqueous(const electrolyte::SpeciationInput& in,
                    int verbosity) const;               // .cpp

    //- The speciation engine itself, for the queries that are not one solve
    //  (mineral molar masses, K(T) read-outs).  Same refusal, same single
    //  source of the model.
    const electrolyte::SpeciationSolver& speciator() const;   // .cpp

    // ---- Reactive equilibrium (unit-local speciation; section 6b) ---------
    //  Attached by the builder when the case declares the REACTIVE shape of
    //  electrolyteGammaPhi (aqueous speciation + volatile molecular species).
    //  UNITS NEVER IMPLEMENT CHEMISTRY: a unit op with a reactive package
    //  calls equilibrate() and receives the APPARENT phase split; the true
    //  species live only in the result's internal state (report-only).
    void adoptReactiveEngine(std::unique_ptr<electrolyte::ReactiveVLE> e);
    bool hasReactiveEquilibrium() const { return reactive_ != nullptr; }
    electrolyte::ReactiveVLEResult equilibrate(scalar T_K, scalar P_Pa,
        scalar F, const sVector& zApparent, int verbosity) const;   // .cpp

    //  The DECLARED component -> master bridge, read-only, for the code that
    //  has to cross the basis at the STREAM boundary: a feed written in the
    //  aqueous-species basis (a water analysis, measured in ions) has to be
    //  projected onto the components the flowsheet shares.  It is the same
    //  map `m = A n` the basis-rank test already validates, and exposing it
    //  is not a new authority -- reading it here is what stops the stream
    //  layer from re-deriving one (aqueous-stream-basis, 2026-07-27).
    //  Null when the package is not reactive.
    const electrolyte::ReactiveVLEConfig* reactiveConfig() const;   // .cpp

    //  A species' composition in MASTERS, from the reactive engine's network
    //  (see ReactiveVLE::masterComposition).  Empty when not reactive or the
    //  name is unknown.
    std::vector<std::pair<std::string, scalar>>
    speciesMasterComposition(const std::string& species) const;    // .cpp

    //  Speciate a material AS A LIQUID (no flash) -- what a stream report
    //  needs, so the decomposition describes the material the stream carries.
    electrolyte::SpeciationResult
    speciateReactiveAsLiquid(scalar T_K, const sVector& nApp) const;  // .cpp

    // Minimum-parameter-set audit findings (per model x component x property:
    // MISSING / ESTIMATED / PLACEHOLDER), computed once at assembly.  Drives the
    // gap report + the result-JSON honesty surface.  See PackageAudit.H.
    const std::vector<AuditFinding>& auditFindings() const { return auditFindings_; }

    // Transport properties.  Canonical `transport { viscosity { model Chung; } }`
    // (bare legacy `model Chung;` at transport level still accepted).
    // in the thermo package.  `viscosityGas` mixes the pure-component gas
    // viscosities by Wilke's rule.  Throws if no transport block was set.
    bool   hasTransport() const { return transport_ != nullptr; }
    scalar viscosityGas(scalar T_K, const sVector& y) const;

    // Gas thermal conductivity: optional sub-block
    // `transport { thermalConductivity { model Eucken; } }`.  Eucken needs
    // the gas viscosity, so a viscosity model (e.g. Chung) must also be
    // present.  Wassiljewa / Mason-Saxena mixing rule.  Throws if no
    // thermalConductivity sub-block was set.
    bool   hasThermalConductivity() const { return thermalConductivity_ != nullptr; }
    scalar thermalConductivityGas(scalar T_K, const sVector& y) const;

    // Binary gas diffusivity: optional sub-block
    // `transport { diffusivity { model Fuller; } }`.  D_AB between
    // components i and j [m²/s].  Throws if no diffusivity sub-block was set.
    bool   hasDiffusivity() const { return diffusivity_ != nullptr; }
    scalar diffusivityGas(scalar T_K, scalar P_Pa,
                          std::size_t i, std::size_t j) const;

    // Liquid transport: optional sub-blocks of `transport`
    //   liquidViscosity   { model Andrade;    }   // ln μ = A + B/T  (Pa·s)
    //   liquidConductivity{ model SatoRiedel; }   // W/(m·K)
    //   liquidDiffusivity { model WilkeChang; }   // D°_AB [m²/s], i=solute, j=solvent
    // Mixture rules: Grunberg-Nissan (viscosity), mass-fraction (conductivity).
    // diffusivityLiquid needs the solvent viscosity, so a liquidViscosity
    // model must be present alongside.  Each throws if its sub-block is absent.
    bool   hasLiquidViscosity()    const { return liquidViscosity_ != nullptr; }
    scalar viscosityLiquid(scalar T_K, const sVector& x) const;
    bool   hasLiquidConductivity() const { return liquidConductivity_ != nullptr; }
    scalar thermalConductivityLiquid(scalar T_K, const sVector& x) const;
    bool   hasLiquidDiffusivity()  const { return liquidDiffusivity_ != nullptr; }
    scalar diffusivityLiquid(scalar T_K, std::size_t i, std::size_t j) const;

    // Surface tension: optional sub-block `transport { surfaceTension {
    // model BrockBird; } }`.  A genuinely new property KIND.  When a phase
    // is effectively pure in a pure-fluid-flagged component (water + IF97),
    // the fundamental-equation package's own sigma(T) is used (R1-76);
    // otherwise the generic correlation; otherwise it throws asking for a
    // surfaceTension sub-block.  Mixture rule: mole-fraction average (v1).
    bool   hasSurfaceTension() const { return surfaceTension_ != nullptr; }
    scalar surfaceTension(scalar T_K, const sVector& x) const;

    // Mass density rho [kg/m³] of a phase at (T, P, z).  Three branches that
    // mirror the pure-fluid routing idiom:
    //   (1) a pure-fluid-flagged component carrying the phase (IF97 water)
    //       -> MW / v_molar from the fundamental-equation package;
    //   (2) Vapour -> MW_avg / molarVolume from the EoS (idealGas/SRK/PR);
    //   (3) Liquid -> the saturated-liquid Rackett correlation, mole-weighted.
    // The phase is an EXPLICIT argument (the caller knows it from the vapour
    // fraction -- no phase guessing).  Throws with a clear message when the
    // chosen branch lacks the data it needs (no EoS for vapour; no Tc/Pc for
    // Rackett).
    scalar density(scalar T_K, scalar P_Pa, const sVector& z,
                   DensityPhase ph) const;

    // Designated solvent -----------------------------------------
    // The component name nominated by `solvent <name>;` in the thermo
    // package, used as the second key of the HenrysLaw lookup whenever a
    // solute-role component appears in the mixture.  Empty if absent;
    // in that case the Henry path is silently bypassed and a solute
    // falls back to the Raoult/γ-φ K-value.
    const std::string& solventName() const { return solventName_; }

    // The VLE world in force ("gammaPhi" default, "phiPhi" when the package /
    // thermoPackage selected `liquid eos.<Model>` / `vleWorld phiPhi;`).  The
    // flash reads it to print the K-value header in the framing the K actually
    // uses (phi-phi shows NO gamma and NO Psat -- they play no part in its K).
    const std::string& vleWorld() const { return vleWorld_; }

    // True when component i takes the HENRY K path in Kvec: role `solute` or
    // assembly-declared in `solutes ( ... )`, a solvent is named, and the
    // (solute, solvent) Henry pair exists.  Lets the flash header say
    // "K from Henry pair ..." instead of showing a Psat the K never touched.
    bool isHenrySolute(std::size_t i) const;

    // ---- Pure-fluid absolute-property override (IF97 et al.) -------------
    //
    // A `pureFluids { water { method IF97; } }` block in the thermoPackage
    // attaches a PureFluidModel to a component by index.  When a phase is
    // EFFECTIVELY PURE in that component (x_i >= 0.999), the enthalpy /
    // entropy / volume / cp contributions are taken from the fundamental-
    // equation package on ITS OWN datum, instead of the generic chain.
    // In a real mixture the flagged component is refused LOUDLY (v1: IF97
    // is a pure-water method).  Mirrors the electrolyte per-role branch.
    bool                     hasPureFluid(std::size_t i) const
    { return pureFluid_.count(i) > 0; }
    const PureFluidModel&    pureFluid(std::size_t i) const;   // .cpp
    // True iff component i carries essentially all of the phase (x_i >= thr).
    static bool isEffectivelyPure(const sVector& z, std::size_t i,
                                  scalar thr = 0.999);
    // For the glass-box run header: list of "<component>: PureFluidModel <type>"
    // selections, in component order.  Empty when none are flagged.
    std::vector<std::string> pureFluidSelections() const;

    // ---- Predefined-mixture composition seeds (TRACK A: `air` et al.) ----
    //
    // When `components ( air )` is listed, the loader splices `air` open into
    // its member components (N2/O2/Ar) and captures the member mole fractions
    // here -- a per-component seed for any feed stream that omits an explicit
    // composition.  The map is keyed by COMPONENT INDEX (post-expansion) and
    // holds the renormalised seed over the components contributed by mixtures.
    // Empty when no predefined mixture was used (the overwhelmingly common
    // case).  Glass-box: the splice is announced on stderr at load time.
    //
    // A stream that DOES declare its own composition wins -- this is only a
    // default for the "I just wrote `components ( air )`" convenience.  The
    // seed sums to 1.0 over the mixture-contributed components.
    bool   hasMixtureSeed() const { return !mixtureSeed_.empty(); }
    const std::map<std::size_t, scalar>& mixtureSeed() const
    { return mixtureSeed_; }
    // The seed as a full z-vector over all components (0 for non-mixture
    // members), renormalised to sum 1.0; empty vector when no seed exists.
    sVector mixtureSeedVector() const;
    // Predefined-mixture MEMBERSHIP by token (`air` -> {N2:0.7808, O2:0.2095,
    // Ar:0.0093}) -- lets a STREAM write `air 50 kmol/h;` and have the reader
    // splice it into its member component flows.  Empty when no mixture was used.
    const std::map<std::string, std::map<std::string, scalar>>&
    mixtureMembersByToken() const { return mixtureMembersByToken_; }

private:
    // Load-time helper: expand any predefined-mixture tokens in `names`
    // (data/standards/mixtures/<token>.dat) into their member component
    // names, de-duplicated against names already present and across
    // mixtures, capturing member mole fractions into `seedByName`.  Announces
    // every splice + dedup reconciliation LOUDLY on stderr.  Leaves plain
    // component tokens untouched.
    // Shared config readers (used by the v2-native assemblies): the
    // canonical flat transport hierarchy and the pureFluids override.
    void readTransportBlock(const DictPtr& td);
    void readPureFluids(const DictPtr& pf);

    static std::vector<std::string>
    expandMixtures(const std::vector<std::string>& names,
                   const Database& db,
                   std::map<std::string, scalar>& seedByName,
                   std::map<std::string, std::map<std::string, scalar>>* membersByToken = nullptr);

    // Load-time helper for the v2-native assemblies:
    // mixture expansion + alias canonicalisation + flat-by-name component
    // load + mixture-seed re-keying.  Returns the post-expansion canonical
    // names (the vector the phases and pair-file builders consume).
    std::vector<std::string>
    loadComponentSet(std::vector<std::string> names, const Database& db);


    std::vector<Component>                 components_;
    std::vector<std::unique_ptr<Phase>>    phases_;
    // Legacy convenience pointers (also populated when phases are built):
    std::unique_ptr<ActivityModel>          activity_;
    std::unique_ptr<EquationOfState>        eos_;
    std::unique_ptr<TransportModel>           transport_;
    std::unique_ptr<ThermalConductivityModel> thermalConductivity_;
    std::unique_ptr<DiffusivityModel>         diffusivity_;
    std::unique_ptr<LiquidViscosityModel>     liquidViscosity_;
    std::unique_ptr<LiquidConductivityModel>  liquidConductivity_;
    std::unique_ptr<LiquidDiffusivityModel>   liquidDiffusivity_;
    std::unique_ptr<SurfaceTensionModel>      surfaceTension_;
    std::string                               solventName_;
    // Henry solutes declared at ASSEMBLY level: `solutes ( H2 N2 );` next to
    // `solvent`.  The USER-FACING convention is the propertyPackage's
    // solution{} block; the ThermoPackageBuilder translates it to this key
    // when synthesising the runtime dict.  A listed component takes the Henry
    // K path exactly as `role solute;` would, with NO component-file overlay.
    std::vector<std::string>                  declaredSolutes_;
    // The VLE world (forum 2026-07-04: THE LIQUID METHOD SLOT IS THE WORLD).
    // Assembly-level: the Builder writes `vleWorld phiPhi;` when the package
    // declares `liquid eos.<Model>` (same cubic both phases).  Default gammaPhi.
    std::string                               vleWorld_ = "gammaPhi";
    std::map<std::size_t,
             std::unique_ptr<PureFluidModel>> pureFluid_;   // by component index
    std::map<std::size_t, scalar>             mixtureSeed_;  // by component index
    std::map<std::string, std::map<std::string, scalar>> mixtureMembersByToken_;  // token -> {member:x}
    std::vector<AuditFinding>                 auditFindings_;
    // Reactive coupled speciation+VLE engine (null for every non-reactive
    // package; the flash delegates to it when present).
    std::unique_ptr<electrolyte::ReactiveVLE> reactive_;
    AqueousChemistry                         aqueous_;
    // Built on first use from the DECLARED model; mutable so a const
    // query can materialise it without the case pre-paying for a
    // speciation it may never ask for.
    mutable std::unique_ptr<electrolyte::SpeciationSolver> speciator_;
};

} // namespace Choupo
