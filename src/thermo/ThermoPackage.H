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
    Aggregate of components + mixture models (activity coefficient model
    for the liquid phase, equation of state for the vapour phase).
    Provides K-values  K_i = γ_i Psat_i / (φ_i P)  for two-phase L-V
    flash calculations.

    Dictionary form (a `thermoPackage`):

        components (benzene  toluene);

        activityModel
        {
            model       ideal;
        }

        equationOfState
        {
            model       idealGas;
        }
\*---------------------------------------------------------------------------*/

#pragma once

#include "Component.H"
#include "Database.H"
#include "PackageAudit.H"
#include "activityCoefficient/ActivityModel.H"
#include "electrolyte/ElectrolyteModel.H"
#include "core/Dictionary.H"
#include "core/Types.H"
#include "equationOfState/EquationOfState.H"
#include "phase/Phase.H"
#include "pureFluid/PureFluidModel.H"
#include "SurfaceTensionModel.H"
#include "transport/TransportModel.H"
#include "transport/ThermalConductivityModel.H"
#include "transport/DiffusivityModel.H"
#include "transport/LiquidViscosityModel.H"
#include "transport/LiquidConductivityModel.H"
#include "transport/LiquidDiffusivityModel.H"

#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {

// Which bulk phase a density() request refers to.  The caller knows the phase
// from the stream's vapour fraction -- density() does NOT guess it.
enum class DensityPhase { Liquid, Vapour };

class ThermoPackage
{
public:
    void readFromDict(const DictPtr& dict, const Database& db);

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

    // ----- Phase access (multi-phase generalisation) ---------------------
    std::size_t       nPhases()                       const { return phases_.size(); }
    const Phase&      phase(std::size_t k)            const { return *phases_.at(k); }
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
    //   the.dat gibbsFormation blocks --- JANAF / NIST reference state).
    //   Requires every component in the mixture to carry a `gibbsFormation`
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
    // Both require every component present to carry `gibbsFormation`
    // (for h_pure_ig) and Watson data (for Δhvap); they throw otherwise,
    // and the energy-balance report falls back to the sensible datum
    // with a flagged note.
    scalar H_liquid_formation(scalar T_K, const sVector& x) const;
    scalar H_stream_formation(scalar T_K, scalar P_Pa, scalar vapFrac,
                              const sVector& z) const;

    // ---- Per-natural-phase stream enthalpy (Choupo-native) --------------
    //
    // Same formation reference as H_stream_formation but each component
    // contributes from ITS OWN tabulated phase (gibbsFormation.phase).
    // Sucrose (phase=solid) integrates Cp_liquid as the dissolved-solute
    // approximation -- it never has to invent a Cp_ig the way the
    // strict-IG path forces.  Reaction enthalpy still emerges as
    // h_out − h_in because every species carries its own Hf°.
    //
    //   H_stream(T, P, vf, z) = Σ z_i [ (1−vf)·h_i^{liq}(T) + vf·h_i^{gas}(T) ]
    //
    // Components absent from a phase (x[i] = 0 in that phase by
    // composition, or solute can't be vapour) are silently skipped, so a
    // sucrose-bearing liquid stream does NOT throw when vf > 0 with
    // x_sucrose_vap = 0.
    scalar H_stream(scalar T_K, scalar P_Pa, scalar vapFrac,
                    const sVector& z) const;

    const std::vector<Component>& components() const { return components_; }
    const ActivityModel&    activity() const { return *activity_; }

    // Electrolyte (ionic) activity model.  It is just the activity model when an
    // electrolyte one (pitzer) was selected -- recovered by downcast over
    // activity_ (the dynamic_cast<Wilson*> precedent), null for molecular cases.
    bool hasElectrolyte() const
    { return dynamic_cast<const ElectrolyteModel*>(activity_.get()) != nullptr; }
    const ElectrolyteModel& electrolyte() const
    { return *dynamic_cast<const ElectrolyteModel*>(activity_.get()); }
    const EquationOfState&  eos()      const { return *eos_;      }
    bool                    hasEos()   const { return eos_ != nullptr; }

    // Minimum-parameter-set audit findings (per model x component x property:
    // MISSING / ESTIMATED / PLACEHOLDER), computed once at assembly.  Drives the
    // gap report + the result-JSON honesty surface.  See PackageAudit.H.
    const std::vector<AuditFinding>& auditFindings() const { return auditFindings_; }

    // Transport properties.  Optional `transport { model Chung; }`
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
    const PureFluidModel&    pureFluid(std::size_t i) const
    { return *pureFluid_.at(i); }
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

private:
    // Load-time helper: expand any predefined-mixture tokens in `names`
    // (data/standards/mixtures/<token>.dat) into their member component
    // names, de-duplicated against names already present and across
    // mixtures, capturing member mole fractions into `seedByName`.  Announces
    // every splice + dedup reconciliation LOUDLY on stderr.  Leaves plain
    // component tokens untouched.
    static std::vector<std::string>
    expandMixtures(const std::vector<std::string>& names,
                   const Database& db,
                   std::map<std::string, scalar>& seedByName);


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
    std::map<std::size_t,
             std::unique_ptr<PureFluidModel>> pureFluid_;   // by component index
    std::map<std::size_t, scalar>             mixtureSeed_;  // by component index
    std::vector<AuditFinding>                 auditFindings_;
};

} // namespace Choupo
