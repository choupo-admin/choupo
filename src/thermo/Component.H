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
    Choupo::Component

Description
    A pure-component bundle: identification, critical constants, and the
    pure-component thermodynamic sub-models (vapour pressure, ideal-gas
    Cp, liquid Cp, latent heat).  Loaded from a single dictionary file
    typically stored in $CHOUPO_HOME/data/standards/components/
    (exact-name O(1) lookup; see docs/architecture/property-architecture.md).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Identifiers.H"
#include "core/Dictionary.H"
#include "core/Origin.H"
#include "core/Types.H"

#include <map>
#include <memory>
#include <string>
#include <utility>
#include <vector>

namespace Choupo {

// The correlation models a component holds by POINTER are forward-declared
// (build hygiene 5/6): 174 translation units include Component.H and only
// ~30 evaluate a correlation -- those include the model header themselves.
class VaporPressureModel;
class HeatCapacityModel;

class Component
{
public:
    // Special members are OUT-OF-LINE (defined = default in the .cpp): the
    // inline forms would need the fwd-declared members' dtors complete.
    Component();
    ~Component();
    Component(Component&&) noexcept;
    Component& operator=(Component&&) noexcept;
    Component(const Component&)            = delete;
    Component& operator=(const Component&) = delete;

    // Load from a dictionary representing a single component file.
    void readFromDict(const DictPtr& dict);

    // Mint a bare IDENTITY component (name + MW + role), for the
    // ThermoPackageBuilder: it assembles a package from the unified substance
    // records, and readFromDict above parses only the OLD inline form
    // (`MW 58.44;`).  The role carries volatility (a nonvolatile salt has
    // K_i = 0 and is not counted as a volatile by the evaporator/flash) --
    // the substance record declares it.
    static Component identity(const std::string& name, scalar MW,
                              const std::string& role = "volatile");

    // ---- Identification ----------------------------------------------------
    const std::string& name()    const { return name_;    }
    const std::vector<std::string>& aliases() const { return aliases_; }
    const std::string& formula() const { return formula_; }
    const std::string& cas()     const { return cas_;     }

    // ---- Bulk physical constants -------------------------------------------
    scalar MW()    const { return MW_;    }   // [kg/kmol]
    scalar Tc()    const { return Tc_;    }   // [K]
    scalar Pc()    const { return Pc_;    }   // [bar]
    scalar omega() const { return omega_; }   // acentric factor [-]
    scalar Tb()    const { return Tb_;    }   // normal boiling point [K]
    scalar Hvap_Tb() const { return Hvap_Tb_; } // latent heat at Tb [J/mol]
    scalar Vliq()  const { return Vliq_;  }   // liquid molar volume at 25 °C [m³/mol]

    // ---- Standard-state thermo (Gibbs reactor & related) -------------------
    // Standard enthalpy of formation at 298.15 K, ideal-gas reference [J/mol].
    // Standard absolute (third-law) molar entropy at 298.15 K, ideal-gas
    // reference [J/(mol·K)].  Both optional in the.dat file; their absence
    // is detected by `hasGibbsData()` so that thermal unit ops without a
    // chemistry need can still load the component.
    scalar Hf298() const { return Hf298_; }
    scalar S298()  const { return S298_;  }
    bool   hasGibbsData() const { return hasGibbsData_; }
    // Phase in which Hf298_ is tabulated -- one of "gas" (default,
    // matches NIST/JANAF convention), "liquid" (some solvent
    // tables), or "solid" (crystalline nonvolatiles like sucrose).
    // Determines the reference path h_formation() walks to reach a
    // stream's (T, target_phase).
    const std::string& naturalPhase() const { return naturalPhase_; }
    //  The word the RECORD wrote, verbatim ("idealGas" when it wrote nothing
    //  and took the default).  A refusal quotes what the curator typed, not
    //  the engine's internal phase word -- otherwise the reader is told about
    //  a key they cannot find in their own file.
    const std::string& referenceStateWord() const { return refStateWord_; }
    //  Is this record's formation datum ON the ideal-gas rung?
    //
    //  Deliberately SEPARATE from `hasCpIdealGas()`, which answers a question
    //  about the Cp block alone.  A router needs both, and conflating them
    //  would have changed the routing of the 87 records that carry a gas Cp
    //  and no `standardThermochemistry{}` at all.  True when the record
    //  declares no rung, because the default IS idealGas.
    bool datumOnIdealGasRung() const { return naturalPhase_ == "gas"; }

    //  ---- THE RUNGS THIS RECORD KNOWS ------------------------------------
    //  A substance has one standard state per phase and a record may declare
    //  more than one.  Keyed by the DECLARED word (`idealGas` / `pureLiquid`
    //  / `pureSolid`), so a caller asks for the rung it needs rather than
    //  crossing to it and hoping.
    //
    //  This is what lets a potential become an INTERFACE rather than a
    //  primitive (`ice-as-a-solid-phase-of-the-solvent.md` step 2): you
    //  cannot ask a species for mu0 on a phase until its record can answer
    //  for that phase.
    struct Rung { scalar Hf298 = 0.0; scalar S298 = 0.0; };
    bool hasRung(const std::string& r) const { return rungs_.count(r) != 0; }
    const Rung& rung(const std::string& r) const;   // .cpp -- throws by name
    std::vector<std::string> declaredRungs() const;  // .cpp

    //  The DISSOLUTION enthalpy of this substance's own solid phase [J/mol],
    //  read from its `solidPhases { <phase> { equilibrium { dH ... } } }` --
    //  the SAME curated number the speciation solver uses for K(T), never a
    //  second copy.  Absent when the record declares none, or when it
    //  declares SEVERAL solid phases with different values: polymorphs
    //  dissolve to the same ions but not with the same heat, and picking one
    //  would let the order of the file decide the energy.
    //  Keyed by PHASE NAME, because a substance may declare several and they
    //  do NOT share the heat: CaCO3 carries aragonite (-25731.6 J/mol) and
    //  calcite (-28078.8).  Which one applies is the CASE's declaration
    //  (`chemistryDict: solidPhases ( calcite )`), never this record's order.
    const std::map<std::string, scalar>& dHdissolutionByPhase() const
    { return dHdissByPhase_; }
    // Per-component enthalpy at (T, target_phase) referenced to the
    // formation datum at 298 K in the natural phase.  Reaction enthalpy
    // emerges naturally as h_out − h_in because every species carries
    // its own Hf°.  Throws when the path requires Cp / Hvap data that
    // the .dat does not provide.
    scalar h_formation(scalar T_K, const std::string& targetPhase) const;

    //  The ABSOLUTE entropy at (T, targetPhase), the companion h_formation
    //  never had -- and its absence is what made water's liquid datum look
    //  MISSING when it was merely underived (2026-08-07).
    //
    //  THE VAPORISATION LEG IS NOT Hvap/T, and that is the whole difficulty.
    //  dS = Hvap/Tb holds only where the two states are in EQUILIBRIUM.  At
    //  298 K liquid water and its 1-bar standard-state vapour are not: the
    //  vapour pressure is 0.0317 bar, so the transfer does work against the
    //  pressure difference and
    //
    //      dG_vap(T) = -R T ln(Psat(T)/P0)
    //      dS_vap(T) = (Hvap(T) - dG_vap(T)) / T
    //
    //  Measured on water at 298.15 K: this route gives S(liquid) = 68.06
    //  against CODATA's 69.95, while the enthalpy leg gives -286391 against
    //  -285830.  Both are off, and they are off in OPPOSITE directions, so
    //  G = H - TS closes to +2 J/mol and the derived logK25 of
    //  water-dissociation lands at -13.9975 against -13.9980 from the stored
    //  pair.  A potential is what the equilibrium needs, and the potential is
    //  right even where its two halves are each a little wrong.
    //
    //  Throws when the path needs a Psat the record does not carry -- a
    //  nonvolatile has no vaporisation leg and must not be given a fabricated
    //  one.
    scalar s_formation(scalar T_K, const std::string& targetPhase) const;

    //  g = h - T*s on ONE phase, from ONE datum: OpenFOAM's identity, and the
    //  surface a standard-state potential must present before it can be an
    //  interface rather than a primitive.  See
    //  docs/design/ice-as-a-solid-phase-of-the-solvent.md.
    scalar g_formation(scalar T_K, const std::string& targetPhase) const;

    // ---- Pure-component models ---------------------------------------------
    bool   hasVaporPressure() const { return vp_ != nullptr; }
    const VaporPressureModel& vp() const;              // .cpp (fwd-decl model)
    bool   hasCpLiquid()   const { return cpLiq_  != nullptr; }
    bool   hasCpIdealGas() const { return cpGas_  != nullptr; }
    bool   hasCpSolid()    const { return cpSolid_ != nullptr; }
    const HeatCapacityModel& cpLiquid()   const;       // .cpp
    const HeatCapacityModel& cpIdealGas() const;       // .cpp
    const HeatCapacityModel& cpSolid()    const;       // .cpp

    // ---- Non-volatile / dissolved-solute extensions ---------------
    // Solutes like NaCl, glucose, MgSO4 are loaded as Components but with
    // `nonvolatile true;` in the.dat: Antoine / Cp blocks are then optional
    // and the VLE machinery treats them as never going to vapour (K_i = 0).
    // `dissociation nu` is the van't Hoff factor used by the osmotic-pressure
    // calculation in membrane modules (NaCl → ν = 2, MgCl2 → ν = 3, glucose
    // → ν = 1).  Default `nonvolatile = false`, `dissociation = 1`.
    bool   isNonvolatile() const { return role_ == "nonvolatile"; }
    scalar dissociation() const { return nu_; }

    // ---- The SUBSTANCE's volatility, orthogonal to the case's `role` ------
    //  `role` says how THIS CASE models the component; `volatility` states
    //  what the SUBSTANCE is, with the datum that makes the claim falsifiable.
    //  Empty class == UNKNOWN (absence is not a claim) -- the engine announces
    //  the gap where volatility matters and never reads it as "nonvolatile".
    //  Forum: docs/design/role-vocabulary-forum-2026-08-02.md.
    const std::string& volatilityClass() const { return volatilityClass_; }
    bool   hasVolatilityDeclaration() const { return !volatilityClass_.empty(); }
    //  The falsifying datum is the record's OWN canonical Tb -- one number,
    //  one home; this block never restates it (the reader refuses if it tries).
    scalar declaredBoilingPoint() const { return Tb_; }            // K, 0 = none
    //  The announceable contradiction: the case models K = 0 while the record
    //  says the substance boils.  LEGAL (a case-scoped simplification) and
    //  never silent.
    bool   modelledAgainstItsOwnVolatility() const
    { return isNonvolatile() && volatilityClass_ == "volatile"; }

    // ---- Solid phase ----------------------------------------------
    // Optional `solid { rho_p; k_v; }` block for particulate solids.
    //   rho_p : particle (true) density [kg/m^3] --- used by gas-solid
    //           separation (the cyclone d50).
    //   k_v : volume shape factor (V = k_v d^3; sphere = π/6 ≈ 0.5236).
    //           The number<->mass bridge a population balance will need;
    //           defaults to a sphere.
    // Reserved extension points (added when crystallisation/reaction-with-
    // solid land): dHf_solid, s_solid --- their heat will emerge from the
    // elements reference, like any reaction heat.  Cp_solid is now BUILT (a
    // real `solidHeatCapacity {}` block -> cpSolid(); see hasCpSolid()), and
    // the enthalpy of fusion already lives in sublimation{}.Hfus -> subHfus().
    bool   hasSolid() const { return hasSolid_; }
    scalar rho_p()    const { return rho_p_; }   // particle density [kg/m^3]
    scalar k_v()      const { return k_v_; }     // volume shape factor [-]
    // The ThermoPackageBuilder loads these from the substance record's linked
    // phases/solid record into the identity salt (the MSMPR/PSD crystalliser reads
    // them); for a readFromDict component they come from the `solid {}` block.
    void   setSolid(scalar rho_p, scalar k_v) { rho_p_ = rho_p; k_v_ = k_v; }
    // Set the liquid heat capacity from a `liquidHeatCapacity {}` dict (the
    // builder loads it from the substance record into the identity salt -- needed
    // by the liquid sensible-enthalpy path in mixed-solvent / recycle cases).
    void   setLiquidCp(const DictPtr& d);

    // Read the identity fields (aliases / formula / CAS) from a substance
    // record.  Same two callers and the same reason as readAqueousMapping
    // below: a component minted by identity() above carries name/MW/role only,
    // so the formula its record declares never reached the element balance,
    // and every brine reported "no molecular formula declared" about a record
    // that has one.  ONE parse, two callers.
    void   readIdentity(const DictPtr& d);

    // Read the component -> aqueous-species bridge from a substance record
    // (`aqueousMapping`, or `dissociatesTo`, or a mineral's own dissolution).
    // readFromDict calls it; the ThermoPackageBuilder's electrolyte path calls
    // it too, because that path mints the salt with identity() above and would
    // otherwise carry no bridge -- which is why a Pitzer brine used to report
    // its apparent salt and not one ion.  ONE parse, two callers.
    void   readAqueousMapping(const DictPtr& d);

    // ---- Sublimation reference state (the solid-vapour P-T anchor) ---------
    // Optional `sublimation { tripleT <K>; tripleP <Pa>; Hfus <J/mol>;
    //   Hsub <J/mol>; }` block.  Intrinsic pure-compound constants that anchor
    //   the Clausius-Clapeyron sublimation line and the triple point of the
    //   P-T phase diagram (purePhaseDiagram reads them from HERE first, falling
    //   back to its op-dict `solid{}` block for backward compat).  ABSENT =
    //   today's behaviour exactly (L-V + critical only); every existing .dat is
    //   unaffected.  The fusion-line SLOPE needs deltaVfus, which stays an
    //   op-dict input (a sample/measurement quantity), so the component block
    //   carries the four sublimation/triple constants only.
    bool   hasSublimation() const { return hasSublimation_; }
    scalar subTripleT() const { return subTripleT_; }  // triple-point T [K]
    scalar subTripleP() const { return subTripleP_; }  // triple-point P [Pa]
    scalar subHfus()    const { return subHfus_; }     // enthalpy of fusion [J/mol]
    scalar subHsub()    const { return subHsub_; }     // enthalpy of sublimation [J/mol]

    // ---- Sorption isotherm ----------------------------------------
    // Optional `sorption { Xm; C; K; }` block --- the GAB water-sorption
    // isotherm of the MATERIAL: a THERMODYNAMIC EQUILIBRIUM relation
    // (equilibrium moisture vs water activity).  GAB:
    //   Xe = Xm·C·K·aw / [(1-K·aw)(1-K·aw+C·K·aw)]  (kg water / kg dry solid).
    // Sample-specific material data (the student supplies it).  NOTE: the
    // critical moisture Xc and the drying-RATE curve are KINETICS, not
    // equilibrium --- they live in constant/dryingKinetics, NOT here (the
    // same split between the isotherm and the drying curve).
    bool   hasSorption() const { return hasSorption_; }
    scalar sorpXm()      const { return sorpXm_; }   // GAB monolayer moisture
    scalar sorpC()       const { return sorpC_;  }   // GAB energy constant
    scalar sorpK()       const { return sorpK_;  }   // GAB multilayer factor

    // ---- Solubility: solid-liquid EQUILIBRIUM, c_sat(T) -----------
    // Optional `solubility { coefficients (a b c...); dHcryst X; }` block on a
    // crystallising SOLUTE.  Saturation concentration c_sat(T) = Σ a_i·(T-273.15)^i
    // in kg solute / kg solvent (assumes the usual solvent, water).  EQUILIBRIUM
    // data (like the sorption isotherm), used by the crystalliser's yield --- the
    // crystallisation KINETICS (k_n, k_g) are separate, in constant/crystallisation.
    bool   hasSolubility() const { return !solubilityCoeffs_.empty(); }
    scalar c_sat(scalar T_K) const;            // kg solute / kg solvent
    scalar dHcryst() const { return dHcryst_; } // J/mol released on crystallising
    // Provenance of dHcryst: "" = unstated, "asserted"/"disabled" = a DECLARED
    // simplification (an intentional value, e.g. 0, that is NOT measured -- the
    // crystalliser announces it so a false zero cannot pass as chemistry).
    const std::string& dHcrystOrigin() const { return dHcrystOrigin_; }

    // ---- Electrolyte: salt dissociation map (electrolyte activity) -----------
    // The salt's cation/anion are DERIVED from its `dissociatesTo` block (the old
    // `electrolyte { cation; anion; }` input is gone); the ion names resolve in
    // species/<name>.dat + parameters/Pitzer/.  Intrinsic salt chemistry,
    // declared once -- the electrolyte ActivityModel (pitzer) reads it.
    // ---- The component -> aqueous-species bridge (TYPED at load) ----------
    //  From the record's `aqueousMapping ( { species X; nu n; } ... )`, or its
    //  legacy `dissociatesTo { X n; }` converted at load.  NEVER inferred from
    //  the name -- a component with neither block has NO aqueous mapping, and
    //  a unit that needs one refuses by name (AqueousChemistry::singleMaster).
    bool hasAqueousMapping() const { return !aqueousMapping_.empty(); }
    const std::vector<SpeciesStoich>& aqueousMapping() const
    { return aqueousMapping_; }

    // Aqueous-speciation FACT (see the .cpp parse note): "none" = curated
    // non-participant; "<setName>" = its canonical equilibrium set; when
    // !aqueousSpeciationDeclared() the fact is UNKNOWN (absence-tolerant in
    // molecular systems, refused by the classifier in electrolyte ones).
    bool aqueousSpeciationDeclared() const { return aqueousSpeciationDeclared_; }
    const std::string& aqueousSpeciation() const { return aqueousSpeciation_; }

    // `noncondensable true;` -- a PERMANENT gas: above its critical
    // temperature at any condition the case describes, so it has no pure
    // liquid to reference and cannot be a member of a liquid mixture priced
    // on the Lewis-Randall (Raoult) basis.  Its dissolution is Henry's law,
    // which in the reactive shape is its gas-liquid record.  The fact was
    // curated on N2/O2/CO2 and read by the GUI catalogue long before the
    // property builder consulted it (2026-07-27).
    bool   isNoncondensable() const { return noncondensable_; }

    bool   hasElectrolyteSpec()  const { return hasElec_; }
    const std::string& electrolyteCation() const { return elecCation_; }
    const std::string& electrolyteAnion()  const { return elecAnion_; }
    scalar relativePermittivity() const { return relPermittivity_; }  // 0 if absent

    // ---- Transport: Fuller diffusion volume -----------------------
    // Σv, the sum of atomic diffusion increments used by the Fuller-
    // Schettler-Giddings binary gas diffusivity (e.g. N2 = 18.5, H2O = 13.1).
    // Optional top-level `diffusionVolume <Σv>;` in the.dat.  Zero if absent.
    scalar diffusionVolume()    const { return diffusionVolume_; }
    bool   hasDiffusionVolume() const { return diffusionVolume_ > 0.0; }

    // ---- Transport: liquid-viscosity parameters -------------------
    // Optional `liquidViscosity { andrade { A; B; } vogel { A; B; C; } }`
    // block on the.dat.  The selected liquid-viscosity model (Andrade /
    // Vogel) reads its OWN named sub-block from here; the parameters are
    // FITTED per component.  The whole block is exposed raw so each model
    // picks what it needs (and so a new model can be added without touching
    // Component).
    bool           hasLiquidViscosity()   const { return liquidViscDict_ != nullptr; }
    const DictPtr& liquidViscosityDict()  const { return liquidViscDict_; }

    // ---- Transport: Wilke-Chang association factor ----------------
    // φ for the liquid-diffusivity Wilke-Chang correlation when this
    // component is the SOLVENT (water 2.6, methanol 1.9, ethanol 1.5,
    // unassociated 1.0).  Optional top-level `associationFactor <φ>;`;
    // defaults to 1.0 (unassociated).
    scalar associationFactor() const { return associationFactor_; }

    // ---- Role flag ------------------------------------------------
    // Selects which VLE machinery the thermo package applies to this
    // component when computing K-values:
    //
    //   "volatile"     (default)  K_i = gamma_i * P^sat_i / (phi_i * P)
    //   "solute"                  K_i = H_i(T) / P    when a HenrysLaw
    //                             entry exists for (this, solvent); else
    //                             falls back to the "volatile" path
    //   "nonvolatile"             K_i = 0  identically (NaCl, glucose, MgSO4)
    //   "radical"                 gas-phase-only species; like nonvolatile
    //                             for flash purposes but allowed in
    //                             gas-phase Gibbs equilibrium (OH, H, O,...)
    //
    // Legacy compat: a.dat with `nonvolatile true;` and no `role` keyword
    // is mapped to role = "nonvolatile".  When both are present, an
    // explicit `role` takes precedence.
    const std::string& role() const { return role_; }

    // ---- Ebulioscopic / cryoscopic --------------------------------
    // Solvent-only properties: the molal boiling-point elevation constant
    //     K_b [K·kg/mol]   ΔT = K_b · m   for a dilute non-volatile solute,
    // and the molal freezing-point depression constant K_f.  Both default
    // to zero when the.dat does not declare them.  Pure-component datum,
    // independent of the dissolved species.
    //  K_b IS A DERIVATIVE, and since 2026-08-05 it is computed, not stored
    //  (Vitor's ruling on AR3).  For a dilute ideal solution the molal
    //  boiling-point elevation constant is DEFINED by
    //
    //        K_b = R * Tb^2 * M / dHvap(Tb)
    //
    //  and this record already declares all three inputs.  Storing K_b
    //  beside them was the arity sin in its textbook form -- and the copies
    //  HAD drifted: water.dat carried the rounded 0.512 against 0.512942
    //  from its own Tb/MW/HvapTb, 0.18 % apart, feeding straight into every
    //  evaporator's BPE.  `anchors{}` said so in a comment ("K_b is a
    //  stored derivative ... not written in new files") and nothing acted
    //  on it; a described contract is not a consolidated one.
    //
    //  A DECLARED K_b IS NOT DELETED -- it becomes what `anchors{}` always
    //  called it: a measured value that VALIDATES the derivation.  That is
    //  not a second home for the number, because it is never the answer;
    //  it is a cross-check, and the run announces the comparison.
    //  `K_b()` returns the derived value whenever the inputs exist.
    scalar K_b() const { return K_b_; }

    //  K_f IS DERIVED (2026-08-07), by the condition this comment set for
    //  itself one day earlier.
    //
    //  It was written on 2026-08-06 to say the opposite: the molal
    //  FREEZING-POINT DEPRESSION constant was parsed, exposed here, and
    //  consumed by NOTHING, while its twin K_b fed every evaporator's BPE --
    //  the parsed-and-never-read shape this project closed twice in two days
    //  (PolynomialCp's Tmin_/Tmax_, assigned and never compared;
    //  `reviewStatus`, sitting in a banner the parser discards).  A datum the
    //  engine reads and never uses is a promise the record makes and the
    //  engine breaks, so the STATUS was written down rather than the gap
    //  papered over.
    //
    //  THE PROMOTION HAPPENED BY THAT CONDITION, verbatim:
    //
    //        K_f = R * Tf^2 * M / dHfus(Tf)
    //
    //  exactly parallel to K_b.  When the old note was written, NO record in
    //  the tree declared a heat of fusion, and it said so and refused to
    //  supply 6.01 kJ/mol from memory -- a visible gap beats an invisible
    //  falsehood.  Its stated condition for promotion was "a record declaring
    //  `Hfus` with a primary citation, and a unit operation that needs
    //  freezing-point depression".  BOTH now hold: water.dat carries an
    //  IAPWS-cited `sublimation { Hfus 6008.0; }` and
    //  `triplePoint { T 273.16; }`, and SolidPhase's pure-crystal fugacity is
    //  the consumer.
    //
    //  So K_f follows K_b's shape: the DERIVATION is the value, the declared
    //  number becomes the validating anchor, and both are announced.  For
    //  water they differ by 0.39 % (1.8603 derived against 1.853 declared) --
    //  two independent primaries disagreeing, which is a finding and not an
    //  error, and the calorimetric datum is the one that wins.
    //
    //  A record with no Hfus keeps its declared K_f untouched: an absence
    //  must go on meaning what it meant.
    //
    //  ONE THING THE PROMOTION EXPOSED, worth carrying forward.  The gate
    //  guarding the old status was armed on THIS ACCESSOR -- it failed the
    //  day anything called `K_f()`.  Nothing ever did: SolidPhase consumes
    //  the INPUTS, `subHfus()` and `subTripleT()`, so the promotion walked
    //  straight past the trip-wire and `check_ebullioscopic` went on printing
    //  "K_f is REFERENCE-ONLY ... it cannot be derived" while the engine
    //  derived it.  A status guard armed on one of two routes guards neither.
    //  K_f's checks now live in `check_ice_freezing`, beside the phase that
    //  consumes it.
    scalar K_f() const { return K_f_; }

    //  The declared anchor, 0 if the record declares none, and whether K_b
    //  above came from the derivation or fell back to the anchor.  Both are
    //  for the glass-box report: a student must be able to see which.
    scalar K_b_anchor()  const { return K_b_anchor_;  }
    bool   K_b_derived() const { return K_b_derived_; }
    scalar K_f_anchor()  const { return K_f_anchor_;  }
    bool   K_f_derived() const { return K_f_derived_; }

    // ---- Review status (AP2, 2026-08-05) --------------------------
    //  A record's REVIEW STATE is a fact the engine must act on, so it
    //  lives in a PARSED field -- not in the banner comment.
    //
    //  67 records carried "PROPOSAL TIER -- UNVERIFIED" in a comment the
    //  parser discards, so the announce-or-refuse doctrine could never
    //  see it.  `interim_review_dossier.py` had already called
    //  `reviewStatus` the PREFERRED form and free-text markers "a legacy
    //  fallback" -- yet exactly ONE record used it and NO engine code
    //  read it.  Written, never consolidated.
    //
    //  `interim`  -- imported / unreviewed; announced on consumption.
    //  `reviewed` -- a human checked it against primary sources.
    //  ABSENT     -- unmarked.  That is the corpus default and it is NOT
    //                read as reviewed: an absence is not a claim either way.
    const std::string& reviewStatus() const { return reviewStatus_; }
    const std::string& reviewReason() const { return reviewReason_; }

    // ---- Enthalpy helpers ---------------------------------------------------
    // Reference state: pure liquid at Tref.
    // H_liq(T)  = ∫_{Tref}^T Cp_liq(T') dT'
    // H_vap(T)  = H_liq(T) + ΔHvap(T)
    //
    // Latent heat ΔHvap(T) is obtained from the Watson correlation
    //     ΔHvap(T) = HvapTb · ((Tc - T)/(Tc - Tb))^0.38
    // which requires Tc, Tb and HvapTb to be supplied in the.dat file.

    scalar Hliq_pure   (scalar T_K, scalar Tref_K = 298.15) const;
    scalar Hvap_pure   (scalar T_K, scalar Tref_K = 298.15) const;
    scalar Hvap_latent (scalar T_K) const;

    // ---- Absolute (ideal-gas) thermo at T -- Gibbs reactor consumers --------
    //   h_pure_ig(T)  = Hf298 + ∫_{298.15}^{T} cp_ig(T') dT'             [J/mol]
    //   s_pure_ig(T)  = S298  + ∫_{298.15}^{T} cp_ig(T')/T' dT'      [J/(mol·K)]
    //   g_pure_ig(T)  = h_pure_ig(T) − T · s_pure_ig(T)                  [J/mol]
    // Pressure dependence is the ideal-gas RT ln(P/P°) term, applied at the
    // call site rather than inside the Component so the convention stays
    // explicit.  Throws if hasGibbsData() == false or if cpGas_ is absent.
    scalar h_pure_ig(scalar T_K) const;
    scalar s_pure_ig(scalar T_K) const;
    scalar g_pure_ig(scalar T_K) const;

    // ---- Declared elemental composition (optional; validated at read) -------
    //  For a substance WITHOUT a single molecular formula (assay cut,
    //  polymer, mixture): basis massFraction (kg/kg + a MANDATORY
    //  unaccountedMassFraction, even when zero) or formulaUnit (atomCounts
    //  whose Sum n*AW must reproduce MW).  Parsed + refused loudly in
    //  readFromDict -- the resolver receives only validated data.
    struct ElementalDeclaration
    {
        enum class Basis { none, massFraction, formulaUnit };
        Basis                         basis = Basis::none;
        std::map<std::string, scalar> massFractions;   // kg/kg
        scalar                        unaccountedMassFraction = 0.0;
        std::map<std::string, scalar> atomCounts;      // per formula unit
    };
    bool hasElementalDeclaration() const
    { return elementalDecl_.basis != ElementalDeclaration::Basis::none; }
    const ElementalDeclaration& elementalDeclaration() const
    { return elementalDecl_; }

    // ---- Per-value provenance (the keystone) --------------------------------
    // Parsed from the .dat `provenance {}` block.  DATA/VALIDATION boundary
    // ONLY — NEVER read from a value accessor / phase / K-value / flash (THE
    // ONE RULE).  Used by the curation tools + the result-JSON emitter.
    bool hasProvenance() const { return !provenanceMap_.empty(); }
    const std::map<std::string, OriginInfo>& provenance() const { return provenanceMap_; }
    OriginInfo provenanceFor(const std::string& field) const   // never throws
    {
        auto it = provenanceMap_.find(field);
        return it == provenanceMap_.end() ? OriginInfo{} : it->second;
    }

    // Per-method molecular group decomposition, from the optional `groups {
    // joback ( {group; count;} ... ); unifac ( ... ); }` block.  Method-keyed
    // because Joback groups != UNIFAC groups.  It is the RECIPE a group-
    // contribution estimator / UNIFAC consumes (so the decomposition lives ONCE
    // with the compound, not re-typed per case).  Empty if the .dat omits it.
    // UNIQUAC structural parameters (van der Waals r, q) -- intrinsic, glass-box.
    scalar rUniquac()  const { return rUq_; }
    scalar qUniquac()  const { return qUq_; }
    bool   hasUniquac() const { return rUq_ > 0.0 && qUq_ > 0.0; }

    // PC-SAFT segment parameters (intrinsic, glass-box): segment number m,
    // segment diameter sigma [Angstrom], segment energy epsilon/k [K].  ONE
    // home in the component's `pcsaft { m; sigma; epsilonK; }` block.
    scalar pcsaftM()     const { return pcM_; }
    scalar pcsaftSigma() const { return pcSigma_; }   // Angstrom
    scalar pcsaftEpsK()  const { return pcEpsK_; }
    bool   hasPcsaft()   const { return pcM_ > 0.0 && pcSigma_ > 0.0
                                     && pcEpsK_ > 0.0; }

    // PC-SAFT association (Wertheim TPT1, approved 2026-08-02): the site
    // scheme NAME (Huang-Radosz vocabulary: 2B, 4C), the association energy
    // eps^AB/k [K] and the association volume kappa^AB [-].  All three live
    // together in the same `pcsaft {}` block; a PARTIAL trio refuses at load
    // (see the parse).  An empty scheme means non-associating -- exactly the
    // pre-association behaviour.
    const std::string& pcsaftAssocScheme() const { return pcAssocScheme_; }
    scalar pcsaftEpsABK()  const { return pcEpsAB_; }
    scalar pcsaftKappaAB() const { return pcKappaAB_; }
    bool   hasPcsaftAssociation() const { return !pcAssocScheme_.empty(); }

    // COSMO-SAC surface data (intrinsic).  A component may carry SEVERAL named
    // parameter SETS (unlike Joback's single set) -- one per source/variant --
    // in its `cosmo { <setName> { variant; source; area; volume; sigmaProfile (…); } }`
    // block; the case's `activityModel { model cosmoSAC; source <setName>; }` picks one.
    struct CosmoSet
    {
        std::string model;                // e.g. COSMOSAC (the family)
        std::string variant;              // e.g. 2002 -> which constants
        std::string source;               // provenance (databank + primary)
        scalar area   = 0.0;              // cavity surface area [A^2]
        scalar volume = 0.0;              // cavity volume [A^3]
        std::vector<scalar> sigmaProfile; // p(sigma) [A^2 per bin] on the model grid
    };
    std::vector<std::string> cosmoSetNames() const;
    bool hasCosmoSet(const std::string& name) const { return cosmoSets_.count(name) > 0; }
    const CosmoSet& cosmoSet(const std::string& name) const;   // throws if absent
    // The lone set's name when exactly one is declared (the natural default); "" otherwise.
    std::string defaultCosmoSet() const
    { return cosmoSets_.size() == 1 ? cosmoSets_.begin()->first : std::string(); }

    bool hasGroups(const std::string& method) const { return groups_.count(method) > 0; }
    const std::vector<std::pair<std::string, int>>& groupsFor(const std::string& method) const
    {
        static const std::vector<std::pair<std::string, int>> empty;
        auto it = groups_.find(method);
        return it == groups_.end() ? empty : it->second;
    }
    std::vector<std::string> groupMethods() const   // which methods carry a decomposition
    {
        std::vector<std::string> m;
        for (const auto& kv : groups_) m.push_back(kv.first);
        return m;
    }

private:
    //  Refuses when the formation datum is NOT on the ideal-gas rung; `fn` is
    //  the caller's name, so the message says which surface was asked for.
    void requireIdealGasRung(const char* fn) const;

    std::string name_, formula_, cas_;
    std::vector<std::string> aliases_;   // friendly aliases (C4H10 for nButane, ...)
    scalar      MW_      = 0.0;
    scalar      Tc_      = 0.0;
    scalar      Pc_      = 0.0;
    scalar      omega_   = 0.0;
    scalar      Tb_      = 0.0;
    scalar      Hvap_Tb_ = 0.0;
    scalar      K_b_anchor_ = 0.0;   // declared value, kept as a cross-check
    scalar      K_f_anchor_  = 0.0;  // ditto for the cryoscopic twin
    bool        K_f_derived_ = false;
    bool        K_b_derived_ = false; // true when K_b_ came from R Tb^2 M / dHvap
    std::string reviewStatus_;        // interim | reviewed | (absent = unmarked)
    std::string reviewReason_;
    scalar      Vliq_    = 0.0;
    scalar      Hf298_   = 0.0;
    scalar      S298_    = 0.0;
    bool        hasGibbsData_ = false;
    std::string naturalPhase_ = "gas";   // gas | liquid | solid (default IG/NIST/JANAF)
    std::string refStateWord_ = "idealGas";   // the record's own word, verbatim
    std::map<std::string, Rung> rungs_;   // every standard state the record declares
    std::map<std::string, scalar> dHdissByPhase_;   // phase -> dH [J/mol]

    // Solute support
    scalar      nu_          = 1.0;       // van't Hoff factor for osmotic pressure

    // Role / category:  volatile (default), solute, nonvolatile, radical.
    // Populated by readFromDict from either `role <word>;` directly or from
    // the legacy `nonvolatile true;` shortcut.
    std::string role_ = "volatile";
    //  The substance's own volatility (see volatilityClass()).  Empty ==
    //  UNKNOWN: absence is not a claim, and must never be read as
    //  "nonvolatile" -- that conflation is the defect this block exists to
    //  end.  The falsifying datum stays the canonical Tb_ -- one home.
    std::string volatilityClass_;
    bool        noncondensable_ = false;

    // Ebulioscopic / cryoscopic constants: solvent-only.
    scalar      K_b_ = 0.0;               // [K·kg/mol]
    scalar      K_f_ = 0.0;               // [K·kg/mol]

    // Solid phase: optional `solid { rho_p; k_v; }` block.
    bool        hasSolid_ = false;
    scalar      rho_p_    = 0.0;          // particle density [kg/m^3]
    scalar      k_v_      = 0.5235987756; // volume shape factor (sphere = π/6)

    // Sublimation reference state: optional `sublimation { tripleT; tripleP;
    // Hfus; Hsub; }` block (solid-vapour P-T anchor).  Absent => unaffected.
    bool        hasSublimation_ = false;
    scalar      subTripleT_ = 0.0;       // triple-point T [K]
    scalar      subTripleP_ = 0.0;       // triple-point P [Pa]
    scalar      subHfus_    = 0.0;       // enthalpy of fusion [J/mol]
    scalar      subHsub_    = 0.0;       // enthalpy of sublimation [J/mol]

    // Sorption isotherm: optional `sorption { Xm; C; K; }` block
    // (thermodynamic equilibrium ONLY; Xc is kinetics -> constant/dryingKinetics).
    bool        hasSorption_ = false;
    scalar      sorpXm_   = 0.0;          // GAB monolayer moisture [kg/kg]
    scalar      sorpC_    = 0.0;          // GAB energy constant [-]
    scalar      sorpK_    = 0.0;          // GAB multilayer factor [-]

    // Solubility: optional `solubility { coefficients (...); dHcryst; }`.
    std::vector<scalar> solubilityCoeffs_;   // c_sat(T) = Σ a_i (T-273.15)^i [kg/kg]
    scalar      dHcryst_  = 0.0;          // J/mol released on crystallising
    std::string dHcrystOrigin_;          // "asserted"/"disabled" = declared simplification

    bool        hasElec_  = false;       // salt carries an electrolyte{} block
    std::string elecCation_, elecAnion_; // ion names, derived from dissociatesTo
    std::vector<SpeciesStoich> aqueousMapping_;  // the typed bridge (see accessor)
    bool        aqueousSpeciationDeclared_ = false;  // fact present on record
    std::string aqueousSpeciation_;                  // "none" | <setName>
    scalar      relPermittivity_ = 0.0;  // dielectric constant (mixed-solvent eNRTL)

    // Transport: Fuller diffusion volume Σv; 0 if not declared.
    scalar      diffusionVolume_ = 0.0;

    // Transport: liquid-viscosity parameters; raw block, null if absent.
    DictPtr     liquidViscDict_     = nullptr;
    scalar      associationFactor_  = 1.0;     // Wilke-Chang φ (solvent)

    std::unique_ptr<VaporPressureModel> vp_;
    std::unique_ptr<HeatCapacityModel>  cpLiq_;
    std::unique_ptr<HeatCapacityModel>  cpGas_;
    // Optional `solidHeatCapacity {}` (same factory as liquid/gas Cp).  When
    // ABSENT, the solid enthalpy path falls back to Cp_liquid -- so every
    // legacy .dat is byte-identical; only a .dat that ADDS the block changes.
    std::unique_ptr<HeatCapacityModel>  cpSolid_;

    // Per-value provenance, parsed-if-present (side-channel; never the hot path).
    std::map<std::string, OriginInfo> provenanceMap_;
    ElementalDeclaration elementalDecl_;
    std::map<std::string, std::vector<std::pair<std::string, int>>> groups_;

    // UNIQUAC van der Waals structural parameters (intrinsic; `uniquac { r; q; }`).
    // 0 when absent -> the case must supply them, else UNIQUAC throws.
    scalar rUq_ = 0.0;
    scalar qUq_ = 0.0;
    scalar pcM_ = 0.0, pcSigma_ = 0.0, pcEpsK_ = 0.0;   // PC-SAFT segment params
    std::string pcAssocScheme_;                          // "" = non-associating
    scalar pcEpsAB_ = 0.0, pcKappaAB_ = 0.0;             // PC-SAFT association

    // COSMO-SAC surface data (intrinsic): named parameter sets by set name.
    std::map<std::string, CosmoSet> cosmoSets_;
};

} // namespace Choupo
