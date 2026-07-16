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
    typically stored in $CHOUPO_HOME/data/components/.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Origin.H"
#include "core/Types.H"
#include "vaporPressure/VaporPressureModel.H"
#include "heatCapacity/HeatCapacityModel.H"

#include <map>
#include <memory>
#include <string>
#include <utility>
#include <vector>

namespace Choupo {

class Component
{
public:
    Component() = default;

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
    // Per-component enthalpy at (T, target_phase) referenced to the
    // formation datum at 298 K in the natural phase.  Reaction enthalpy
    // emerges naturally as h_out − h_in because every species carries
    // its own Hf°.  Throws when the path requires Cp / Hvap data that
    // the .dat does not provide.
    scalar h_formation(scalar T_K, const std::string& targetPhase) const;

    // ---- Pure-component models ---------------------------------------------
    bool   hasVaporPressure() const { return vp_ != nullptr; }
    const VaporPressureModel& vp() const { return *vp_; }
    bool   hasCpLiquid()   const { return cpLiq_  != nullptr; }
    bool   hasCpIdealGas() const { return cpGas_  != nullptr; }
    bool   hasCpSolid()    const { return cpSolid_ != nullptr; }
    const HeatCapacityModel& cpLiquid()   const { return *cpLiq_; }
    const HeatCapacityModel& cpIdealGas() const { return *cpGas_; }
    const HeatCapacityModel& cpSolid()    const { return *cpSolid_; }

    // ---- Non-volatile / dissolved-solute extensions ---------------
    // Solutes like NaCl, glucose, MgSO4 are loaded as Components but with
    // `nonvolatile true;` in the.dat: Antoine / Cp blocks are then optional
    // and the VLE machinery treats them as never going to vapour (K_i = 0).
    // `dissociation nu` is the van't Hoff factor used by the osmotic-pressure
    // calculation in membrane modules (NaCl → ν = 2, MgCl2 → ν = 3, glucose
    // → ν = 1).  Default `nonvolatile = false`, `dissociation = 1`.
    bool   isNonvolatile() const { return role_ == "nonvolatile"; }
    scalar dissociation() const { return nu_; }

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
    // species/aqueous.dat + parameters/electrolyte/pitzer/.  Intrinsic salt chemistry,
    // declared once -- the electrolyte ActivityModel (pitzer) reads it.
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
    scalar K_b() const { return K_b_; }
    scalar K_f() const { return K_f_; }
    bool   hasEbulioscopic() const { return K_b_ > 0.0 || K_f_ > 0.0; }

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
    std::string name_, formula_, cas_;
    std::vector<std::string> aliases_;   // friendly aliases (C4H10 for nButane, ...)
    scalar      MW_      = 0.0;
    scalar      Tc_      = 0.0;
    scalar      Pc_      = 0.0;
    scalar      omega_   = 0.0;
    scalar      Tb_      = 0.0;
    scalar      Hvap_Tb_ = 0.0;
    scalar      Vliq_    = 0.0;
    scalar      Hf298_   = 0.0;
    scalar      S298_    = 0.0;
    bool        hasGibbsData_ = false;
    std::string naturalPhase_ = "gas";   // gas | liquid | solid (default IG/NIST/JANAF)

    // Solute support
    scalar      nu_          = 1.0;       // van't Hoff factor for osmotic pressure

    // Role / category:  volatile (default), solute, nonvolatile, radical.
    // Populated by readFromDict from either `role <word>;` directly or from
    // the legacy `nonvolatile true;` shortcut.
    std::string role_ = "volatile";

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
    std::map<std::string, std::vector<std::pair<std::string, int>>> groups_;

    // UNIQUAC van der Waals structural parameters (intrinsic; `uniquac { r; q; }`).
    // 0 when absent -> the case must supply them, else UNIQUAC throws.
    scalar rUq_ = 0.0;
    scalar qUq_ = 0.0;

    // COSMO-SAC surface data (intrinsic): named parameter sets by set name.
    std::map<std::string, CosmoSet> cosmoSets_;
};

} // namespace Choupo
