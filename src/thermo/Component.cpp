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
\*---------------------------------------------------------------------------*/

#include "Component.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"   // electrolyte::ionCharge (dissociatesTo -> cation/anion)

#include <cmath>
#include <stdexcept>
#include <variant>

namespace Choupo {

Component Component::identity(const std::string& name, scalar MW,
                              const std::string& role)
{
    Component c;
    c.name_ = name;
    c.MW_   = MW;
    c.role_ = role;
    return c;
}

void Component::setLiquidCp(const DictPtr& d)
{
    cpLiq_ = HeatCapacityModel::New(d);
}

std::vector<std::string> Component::cosmoSetNames() const
{
    std::vector<std::string> names;
    names.reserve(cosmoSets_.size());
    for (const auto& kv : cosmoSets_) names.push_back(kv.first);
    return names;
}

const Component::CosmoSet& Component::cosmoSet(const std::string& name) const
{
    auto it = cosmoSets_.find(name);
    if (it == cosmoSets_.end())
        throw std::runtime_error("Component '" + name_ + "': no COSMO parameter set '"
            + name + "'.");
    return it->second;
}

void Component::readFromDict(const DictPtr& d)
{
    // ---- Reference-state block layout: the DUAL-READER (forum 2026-06-11) --
    // NEW component .dats group data by DECLARED REFERENCE STATE (identity /
    // critical / gasIdeal / liquidPure / solid / aqueousInfDil / anchors /
    // transport -- docs/thermo-hierarchy.md plane A); LEGACY flat files read
    // forever, unchanged.  This pre-pass lifts each block datum onto the
    // legacy key the reader below consumes: block-first, flat-fallback, and a
    // LOUD refusal when ONE datum appears in both forms (no silent shadowing).
    {
        auto lift = [&](const char* block, const char* key, const char* legacy)
        {
            if (!d->found(block)) return;
            auto b = d->subDict(block);
            if (!b->found(key)) return;
            if (d->found(legacy))
            {
                // The TIER MERGE (proposed < standards < case-local) can
                // legitimately put the same datum in both forms (a flat legacy
                // base under a block-form overlay).  Tolerate AGREEMENT; refuse
                // only a real conflict.  Sub-dict entries can't be compared
                // cheaply -- the block wins there (case-local overlay wins by
                // the same precedence rule).
                bool conflict = false;
                try { conflict = (d->lookupWord(legacy) != b->lookupWord(key)); }
                catch (const std::exception&)
                {
                    try { conflict = std::fabs(d->lookupScalar(legacy)
                                             - b->lookupScalar(key)) > 1e-12; }
                    catch (const std::exception&) { conflict = false; }
                }
                if (conflict)
                    throw std::runtime_error("component .dat: '" + std::string(legacy)
                        + "' is defined BOTH flat and inside " + block
                        + "{} with DIFFERENT values -- keep exactly one.");
            }
            d->insert(legacy, b->entryValue(key));
        };
        lift("identity",   "name",    "name");
        lift("identity",   "formula", "formula");
        lift("identity",   "CAS",     "CAS");
        lift("identity",   "MW",      "MW");
        lift("critical",   "Tc",      "Tc");
        lift("critical",   "Pc",      "Pc");
        lift("critical",   "omega",   "omega");
        lift("liquidPure", "Tb",      "Tb");
        lift("liquidPure", "HvapTb",  "HvapTb");
        lift("liquidPure", "Vliq",    "Vliq");
        lift("liquidPure", "Psat",    "vaporPressure");      // Psat IS f°(T)
        lift("liquidPure", "Cp",      "liquidHeatCapacity");
        lift("gasIdeal",   "Cp",      "idealGasHeatCapacity");
        lift("solid",      "Cp",      "solidHeatCapacity");
        lift("transport",  "diffusionVolume",   "diffusionVolume");
        lift("transport",  "associationFactor", "associationFactor");
        lift("transport",  "liquidViscosity",   "liquidViscosity");
        // UNIFIED substance file: the apparent-component ion map is authored as
        // component.speciesMap; lift it onto the legacy `dissociatesTo` key so
        // every reader below is unchanged (speciesMap renames dissociatesTo).
        lift("component",  "speciesMap",        "dissociatesTo");
        // (gasIdeal/solid Hf_298+S_298 -> the formation datum, and
        //  anchors{K_b,K_f}, are handled at their read sites below;
        //  aqueousInfDil{} is the electrolyte-enthalpy tier, parse-tolerated.)
    }

    name_    = d->lookupWordOrDefault("name", "");
    if (d->found("aliases")) aliases_ = d->lookupWordList("aliases");
    formula_ = d->lookupWordOrDefault("formula", "");
    cas_     = d->lookupWordOrDefault("CAS", "");

    MW_      = d->lookupScalar       ("MW");
    Tc_      = d->lookupScalarOrDefault("Tc",      0.0);
    Pc_      = d->lookupScalarOrDefault("Pc",      0.0);
    omega_   = d->lookupScalarOrDefault("omega",   0.0);
    Tb_      = d->lookupScalarOrDefault("Tb",      0.0);
    Hvap_Tb_ = d->lookupScalarOrDefault("HvapTb",  0.0);
    Vliq_    = d->lookupScalarOrDefault("Vliq",    0.0);
    diffusionVolume_ = d->lookupScalarOrDefault("diffusionVolume", 0.0);

    // Liquid-viscosity parameters: keep the raw `liquidViscosity`
    // block so the selected model (Andrade / Vogel) reads its own sub-block.
    // Wilke-Chang association factor (solvent) defaults to 1.0.
    associationFactor_ = d->lookupScalarOrDefault("associationFactor", 1.0);
    if (d->found("liquidViscosity"))
        liquidViscDict_ = d->subDict("liquidViscosity");

    // Non-volatile / solute extensions.  When `nonvolatile true;`
    // is set, the component is dissolved-only: Antoine and Cp blocks are
    // not required, and the VLE machinery (Kvec, flash, bubble-T) treats
    // it as K = 0 (never appears in the vapour).  `dissociation nu` is the
    // van't Hoff factor used by the osmotic-pressure formula in membrane
    // modules: 1 for non-electrolyte (glucose), 2 for fully-dissociated
    // 1-1 salt (NaCl, NaOH, KCl), 3 for 1-2 / 2-1 (MgCl2, Na2SO4), and so
    // on.  Real solutions deviate from full dissociation; for the
    // ideal-dilute van't Hoff form is the pedagogical baseline.
    // DERIVED from the ion map, never stored twice: nu = Σ coefficients of
    // dissociatesTo (1 + 1 = 2 for NaCl/LiCl, 1 + 2 = 3 for CaCl2/Na2SO4).
    // Only when there is no map do we read the legacy `dissociation` field
    // (a non-electrolyte defaults to 1).  Two fields must never encode one
    // fact -- the map is canonical.
    if (d->found("dissociatesTo"))
    {
        nu_ = 0.0;
        auto d2t = d->subDict("dissociatesTo");
        for (const auto& ion : d2t->keys()) nu_ += d2t->lookupScalar(ion);
    }
    else
        nu_ = d->lookupScalarOrDefault("dissociation", 1.0);

    // Role / category ----------------------------------------------
    // Explicit `role <word>;` wins; otherwise legacy `nonvolatile true;`
    // maps to role = "nonvolatile"; otherwise default "volatile".
    if (d->found("role"))
    {
        role_ = d->lookupWord("role");
        if (role_ != "volatile" && role_ != "solute"
         && role_ != "nonvolatile" && role_ != "radical")
            throw std::runtime_error("Component '" + name_ +
                "': role '" + role_ + "' is not one of"
                " volatile / solute / nonvolatile / radical");
    }
    else if (d->lookupWordOrDefault("nonvolatile", "false") == "true")
    {
        role_ = "nonvolatile";
    }

    const bool needsVP = (role_ == "volatile" || role_ == "solute");
    if (needsVP && !d->found("vaporPressure"))
        // A Joback ESTIMATE leaves vaporPressure as a declared GAP (commented
        // out -- Joback gives no Antoine).  Fail with a component-aware,
        // remedy-bearing message instead of the bare parser exception.
        throw std::runtime_error("Component '" + name_ +
            "': no 'vaporPressure' block.  If this is a Joback estimate, Psat is a"
            " declared GAP (group contribution gives no Antoine) -- this case needs"
            " VLE/flash, so fit it (choupoProps vaporPressureFit) or supply a"
            " corresponding-states model before using the component.");
    // Build the vapour-pressure model.  Corresponding-states models
    // (AmbroseWalton) need Tc/Pc/omega, which live at COMPONENT level, not in
    // the `vaporPressure {}` block -- inject them so the case author declares
    // them once (`vaporPressure { model AmbroseWalton; }`).  Antoine ignores
    // the extra keys, so this is harmless for data-based models.
    auto buildVP = [&]() -> std::unique_ptr<VaporPressureModel>
    {
        auto vpd = d->subDict("vaporPressure");
        if (!vpd->found("Tc"))    vpd->insert("Tc",    Tc_);
        if (!vpd->found("Pc"))    vpd->insert("Pc",    Pc_);
        if (!vpd->found("omega")) vpd->insert("omega", omega_);
        return VaporPressureModel::New(vpd);
    };
    if (needsVP)
        vp_ = buildVP();
    else if (d->found("vaporPressure"))
        // Permit a vapour-pressure block on a non-volatile / radical
        // component (used by the unit-tests; the runtime ignores it).
        vp_ = buildVP();

    // Ebulioscopic / cryoscopic constants --------------------------
    // Only sensible on solvents (water, ethanol,...).  Optional.
    if (d->found("ebulioscopic"))
    {
        auto eb = d->subDict("ebulioscopic");
        K_b_ = eb->lookupScalarOrDefault("K_b", 0.0);
        K_f_ = eb->lookupScalarOrDefault("K_f", 0.0);
        if (d->found("anchors") && (d->subDict("anchors")->found("K_b")
                                 || d->subDict("anchors")->found("K_f")))
            throw std::runtime_error("Component '" + name_ + "': K_b/K_f defined "
                "BOTH in ebulioscopic{} and anchors{} -- keep exactly one.");
    }
    else if (d->found("anchors"))
    {
        // NEW form: measured anchors that VALIDATE derivatives.  K_b is a
        // stored derivative (R Tb^2 MW / HvapTb) and is not written in new
        // files; K_f stays measured until Tfus/Hfus land in a fusion block.
        auto an = d->subDict("anchors");
        K_b_ = an->lookupScalarOrDefault("K_b", 0.0);
        K_f_ = an->lookupScalarOrDefault("K_f", 0.0);
    }

    // UNIFIED substance file: crystal props live under solidPhases.<phase>.crystal;
    // read the FIRST phase's crystal here (the molecular crystalliser reads one
    // ρ_p/k_v off the component).  Fallback to the legacy flat solid{} block.
    if (d->found("solidPhases"))
    {
        // Read crystal props from the FIRST phase that carries a crystal{} block
        // (many mineral phases are SI-only -- no crystal; e.g. silica's polymorphs
        // fold in for equilibria while its sand rho_p stays in the flat solid{}).
        auto sp = d->subDict("solidPhases");
        for (const auto& ph : sp->keys())
            if (sp->subDict(ph)->found("crystal"))
            {
                auto cr = sp->subDict(ph)->subDict("crystal");
                hasSolid_ = true;
                rho_p_ = cr->lookupScalarOrDefault("rho_p", 0.0);
                k_v_   = cr->lookupScalarOrDefault("k_v", 0.5235987756);
                break;
            }
    }
    if (!hasSolid_ && d->found("solid"))   // flat solid{} fallback (physical solid)
    {
        auto sd = d->subDict("solid");
        hasSolid_ = true;
        rho_p_ = sd->lookupScalarOrDefault("rho_p", 0.0);
        k_v_   = sd->lookupScalarOrDefault("k_v", 0.5235987756);  // sphere
    }

    // Sublimation reference state (the solid-vapour P-T anchor): triple point +
    // the fusion/sublimation enthalpies of the Clausius-Clapeyron lines.  Parsed
    // after solid{}; ABSENT leaves every field 0 and hasSublimation_ false, i.e.
    // exactly today's behaviour (the P-T diagram stays L-V + critical only).
    if (d->found("sublimation"))
    {
        auto sb = d->subDict("sublimation");
        hasSublimation_ = true;
        subTripleT_ = sb->lookupScalarOrDefault("tripleT", 0.0);
        subTripleP_ = sb->lookupScalarOrDefault("tripleP", 0.0);
        subHfus_    = sb->lookupScalarOrDefault("Hfus", 0.0);
        subHsub_    = sb->lookupScalarOrDefault("Hsub", 0.0);
    }

    if (d->found("sorption"))
    {
        auto sd = d->subDict("sorption");
        hasSorption_ = true;
        sorpXm_ = sd->lookupScalarOrDefault("Xm", 0.0);
        sorpC_  = sd->lookupScalarOrDefault("C",  0.0);
        sorpK_  = sd->lookupScalarOrDefault("K",  0.0);
        // Xc (critical moisture) is KINETICS, not equilibrium -> it lives in
        // constant/dryingKinetics, read by the dryer, not on the component.
    }

    if (d->found("solubility"))
    {
        auto sd = d->subDict("solubility");
        solubilityCoeffs_ = sd->lookupList("coefficients");   // c_sat(T) polynomial in T[°C]
        // dHcryst: an intentional 0 here is a DECLARED simplification (the
        // sibling `dHcrystOrigin`/comment says so), not measured chemistry --
        // the crystalliser announces the zero-duty path it takes.
        dHcryst_       = sd->lookupScalarOrDefault("dHcryst", 0.0);
        dHcrystOrigin_ = sd->lookupWordOrDefault("dHcrystOrigin", "");
    }

    if (d->found("liquidHeatCapacity"))
        cpLiq_ = HeatCapacityModel::New(d->subDict("liquidHeatCapacity"));
    if (d->found("idealGasHeatCapacity"))
        cpGas_ = HeatCapacityModel::New(d->subDict("idealGasHeatCapacity"));
    // A REAL solid heat capacity (same HeatCapacityModel factory as the liquid
    // and ideal-gas Cp).  Optional: ABSENT leaves cpSolid_ null and the solid
    // enthalpy path falls back to Cp_liquid (the historical "Cp_solid ~
    // Cp_liquid" approximation) -- so every existing .dat stays byte-identical.
    // Only a .dat that ADDS `solidHeatCapacity {}` gets the true solid Cp.
    if (d->found("solidHeatCapacity"))
        cpSolid_ = HeatCapacityModel::New(d->subDict("solidHeatCapacity"));

    // ---- Optional Gibbs-formation block (consumed by the Gibbs reactor) ----
    // gibbsFormation
    // {
    //     dHf_298    -241830;       // J/mol, in the natural phase below
    //     s_298         188.83;     // J/(mol·K), third-law absolute
    //     phase       gas;          // OPTIONAL.  Phase in which dHf_298 is
    //                               // tabulated.  Defaults to "gas" (the
    //                               // NIST / JANAF convention).
    //                               // Set "liquid" for solvents tabulated
    //                               // in liquid form; set "solid" for
    //                               // crystalline nonvolatiles (sucrose)
    //                               // whose Hf cannot be referenced to gas
    //                               // because the compound never vaporises.
    // }
    if (d->found("gibbsFormation"))
    {
        auto g = d->subDict("gibbsFormation");
        Hf298_         = g->lookupScalar("dHf_298");
        S298_          = g->lookupScalar("s_298");
        naturalPhase_  = g->lookupWordOrDefault("phase", "gas");
        if (naturalPhase_ != "gas" && naturalPhase_ != "liquid" && naturalPhase_ != "solid")
            throw std::runtime_error("Component '" + name_ +
                "': gibbsFormation.phase must be gas / liquid / solid, got '"
                + naturalPhase_ + "'");
        hasGibbsData_  = true;
    }

    // NEW form (forum 2026-06-11): the formation datum lives INSIDE the block
    // of its reference state -- gasIdeal{Hf_298; S_298;} or solid{Hf_298;
    // S_298;} -- and the `phase` keyword dies because the block IS the phase.
    {
        auto blockHasFormation = [&](const char* block)
        { return d->found(block) && d->subDict(block)->found("Hf_298"); };
        const bool gi = blockHasFormation("gasIdeal");
        const bool so = blockHasFormation("solid");
        if ((gi || so) && hasGibbsData_)
            throw std::runtime_error("Component '" + name_ + "': the formation "
                "datum is defined BOTH in gibbsFormation{} and in a reference-"
                "state block -- keep exactly one.");
        if (gi && so)
            throw std::runtime_error("Component '" + name_ + "': Hf_298 in BOTH "
                "gasIdeal{} and solid{} -- the engine carries ONE formation "
                "datum today; keep the natural phase's.");
        if (gi || so)
        {
            auto b = d->subDict(gi ? "gasIdeal" : "solid");
            Hf298_        = b->lookupScalar("Hf_298");
            S298_         = b->lookupScalar("S_298");
            naturalPhase_ = gi ? "gas" : "solid";
            hasGibbsData_ = true;
        }
    }

    // ---- Per-value provenance (the keystone; parse-if-present, never throws) -
    // Two grammars exist in the catalogue: a flat free-text form (acetone /
    // propane:  provenance { vaporPressure "NIST ..."; }  -> stored as `raw`),
    // and a structured per-field form (NH3.liquidViscosity { origin regressed;
    // method "..."; validity (223 323); }).  Discriminate the EntryValue variant
    // BEFORE any subDict() call (subDict throws on a non-dict entry).  Anything
    // unexpected is stored as an empty record -- this is a side-channel that
    // NEVER feeds the solver, only the curation tools + the result JSON.
    if (d->found("provenance"))
    {
        auto p = d->subDict("provenance");
        for (const auto& k : p->keys())
        {
            OriginInfo oi;
            const auto& ev = p->entryValue(k);
            if (std::holds_alternative<DictPtr>(ev))
            {
                auto sub = std::get<DictPtr>(ev);
                oi.origin        = originFromWord(sub->lookupWordOrDefault("origin", "unattributed"));
                oi.method        = sub->lookupWordOrDefault("method", "");
                oi.methodVersion = sub->lookupWordOrDefault("methodVersion", "");
                oi.note          = sub->lookupWordOrDefault("notes", "");
                // `uncertainty` has two grammars: free text ("~2% AAD") and the
                // structured { status ...; reason "..."; } sub-dict of the
                // estimate contract.  Discriminate the variant -- this block is
                // parse-if-present, so a sub-dict must not throw the word lookup.
                if (sub->found("uncertainty"))
                {
                    const auto& uv = sub->entryValue("uncertainty");
                    if (std::holds_alternative<std::string>(uv))
                    {
                        oi.uncertainty = std::get<std::string>(uv);
                    }
                    else if (std::holds_alternative<DictPtr>(uv))
                    {
                        auto u = std::get<DictPtr>(uv);
                        oi.uncertainty = u->lookupWordOrDefault("status", "");
                        const std::string reason = u->lookupWordOrDefault("reason", "");
                        if (!reason.empty())
                            oi.uncertainty +=
                                (oi.uncertainty.empty() ? "" : " -- ") + reason;
                    }
                }
                if (sub->found("validity"))
                {
                    auto v = sub->lookupList("validity");
                    if (v.size() == 2)
                    { oi.hasValidity = true; oi.validityMin = v[0]; oi.validityMax = v[1]; }
                }
            }
            else if (std::holds_alternative<std::string>(ev))
            {
                oi.raw = std::get<std::string>(ev);
            }
            // else (scalar / list / list-of-dicts / Reference): empty record.
            provenanceMap_[k] = oi;
        }
    }

    // ---- Per-method molecular group decomposition (the curation recipe) -------
    // `groups { joback ( {group; count;} ... ); unifac ( ... ); }` -- method-keyed
    // (Joback groups != UNIFAC groups).  A side-channel: it feeds the curation-time
    // estimators / UNIFAC, never the solver hot path.  Parse-if-present, never throws.
    if (d->found("groups"))
    {
        try
        {
            auto gp = d->subDict("groups");
            for (const auto& method : gp->keys())
            {
                std::vector<std::pair<std::string, int>> list;
                for (const auto& g : gp->lookupDictList(method))
                {
                    const std::string nm = g->lookupWordOrDefault("group", "");
                    const int cnt = static_cast<int>(g->lookupScalarOrDefault("count", 1.0));
                    if (!nm.empty()) list.emplace_back(nm, cnt);
                }
                if (!list.empty()) groups_[method] = std::move(list);
            }
        }
        catch (...) { /* malformed groups block -- ignored (side-channel) */ }
    }

    // UNIQUAC van der Waals structural parameters (intrinsic): `uniquac { r; q; }`.
    // Read by ThermoPackage::injectUniquacRQ into the activity model, so they live
    // ONCE in the component, not re-declared per case.
    if (d->found("uniquac"))
    {
        auto u = d->subDict("uniquac");
        rUq_ = u->lookupScalarOrDefault("r", 0.0);
        qUq_ = u->lookupScalarOrDefault("q", 0.0);
    }

    // COSMO-SAC surface data (intrinsic): `cosmo { <setName> { variant; source;
    // area; volume; sigmaProfile ( ... ); } }`.  ONE or MORE named parameter sets
    // (VT2005, LVPP, ...) living ONCE in the component; the CosmoSac model picks a
    // set by name.  Consumed by the CosmoSac activity model.
    if (d->found("cosmo"))
    {
        auto c = d->subDict("cosmo");
        for (const auto& setName : c->keys())
        {
            auto s = c->subDict(setName);
            CosmoSet cs;
            cs.variant = s->lookupWordOrDefault("variant", "cosmoSAC2002");
            cs.source  = s->lookupWordOrDefault("source", "undeclared");
            cs.area    = s->lookupScalarOrDefault("area", 0.0);
            cs.volume  = s->lookupScalarOrDefault("volume", 0.0);
            if (s->found("sigmaProfile"))
                cs.sigmaProfile = s->lookupList("sigmaProfile");
            cosmoSets_[setName] = std::move(cs);
        }
    }

    // Relative permittivity (dielectric constant) -- used by the mixed-solvent
    // electrolyte activity (eNRTL) for the drowning-out / Born effect.  Optional.
    relPermittivity_ = d->lookupScalarOrDefault("relativePermittivity", 0.0);

    // Salt dissociation map for the electrolyte activity model.  cation/anion are
    // ion NAMES into species/aqueous/ + parameters/electrolyte/pitzer/; solubility is the
    // salt's measured saturation molality.  INTRINSIC salt chemistry, declared ONCE
    // here -- called by name, never re-typed per case.
    // Ion decomposition for electrolyte-aware unit ops (DSPM-DE membrane): derive
    // cation/anion from `dissociatesTo` (the formula-like ion stoichiometry) by
    // charge sign, resolved through species/aqueous.  (The old `electrolyte{}`
    // block is gone; dHsoln/solubility live in chemistry/salts, read via the model.)
    if (d->found("dissociatesTo"))
    {
        auto d2t = d->subDict("dissociatesTo");
        try
        {
            for (const auto& ion : d2t->keys())
            {
                const int z = electrolyte::ionCharge(ion);
                if      (z > 0) elecCation_ = ion;
                else if (z < 0) elecAnion_  = ion;
            }
        }
        catch (...) { elecCation_.clear(); elecAnion_.clear(); }
        hasElec_ = !elecCation_.empty() && !elecAnion_.empty();
    }
}

// Per-component enthalpy at (T, target_phase) referenced to formation.
// Path: from the tabulated Hf at 298 K in the natural phase, integrate Cp
// in the natural phase up to T, then apply a phase transition at T if
// target differs.  Phase transitions are taken at 298 K to keep the
// implementation honest with the data Choupo carries (every component
// has Hvap_Tb + Watson for the latent at any T).  Cp_solid is now a REAL
// model when the .dat carries a solidHeatCapacity{} block (else it falls
// back to Cp_liquid -- legacy-identical); and the solid->liquid leg applies
// the genuine enthalpy of fusion (subHfus_) for a MELTING solid, while a
// DISSOLVED solute keeps Hfus ~ 0 (it goes into solution, never melts).
scalar Component::h_formation(scalar T, const std::string& targetPhase) const
{
    if (!hasGibbsData_)
        throw std::runtime_error("Component '" + name_ +
            "': h_formation needs gibbsFormation block in .dat");

    // Integrators -- throws clearly if the relevant Cp model is missing.
    auto cpGasIntegral = [&](scalar Tend) -> scalar {
        if (!cpGas_)
            throw std::runtime_error("Component '" + name_ +
                "': h_formation gas leg needs idealGasHeatCapacity");
        return cpGas_->H(Tend, 298.15);
    };
    auto cpLiqIntegral = [&](scalar Tend) -> scalar {
        if (!cpLiq_)
            throw std::runtime_error("Component '" + name_ +
                "': h_formation liquid leg needs liquidHeatCapacity");
        return cpLiq_->H(Tend, 298.15);
    };
    // Solid sensible heat ∫_{298}^{T} Cp_solid dT'.  When a REAL
    // solidHeatCapacity{} block is present, integrate the true solid Cp;
    // otherwise fall back to Cp_liquid -- the historical "Cp_solid ~
    // Cp_liquid" approximation, which keeps every block-less .dat
    // byte-identical.  (Throws only if BOTH are missing -- a genuine gap.)
    auto cpSolidIntegral = [&](scalar Tend) -> scalar {
        if (cpSolid_) return cpSolid_->H(Tend, 298.15);
        return cpLiqIntegral(Tend);          // graceful fallback (legacy)
    };

    // Hvap_latent at 298 K (when needed).  Sucrose-like solids never need
    // it (they never go through a gas leg); volatile species always have it.
    auto hvap298 = [&]() -> scalar { return Hvap_latent(298.15); };

    if (naturalPhase_ == targetPhase)
    {
        if (naturalPhase_ == "gas")    return Hf298_ + cpGasIntegral(T);
        if (naturalPhase_ == "liquid") return Hf298_ + cpLiqIntegral(T);
        // Solid -> solid: integrate the REAL solid Cp when the .dat carries a
        // solidHeatCapacity{} block; fall back to Cp_liquid otherwise (legacy
        // "Cp_solid ~ Cp_liquid", so block-less solids are byte-identical).
        if (naturalPhase_ == "solid")  return Hf298_ + cpSolidIntegral(T);
    }
    // Cross-phase paths: take the transition at 298 K, then integrate in
    // the target phase up to T.
    if (naturalPhase_ == "gas" && targetPhase == "liquid")
        return Hf298_ - hvap298() + cpLiqIntegral(T);
    if (naturalPhase_ == "liquid" && targetPhase == "gas")
        return Hf298_ + hvap298() + cpGasIntegral(T);
    if (naturalPhase_ == "solid" && targetPhase == "liquid")
    {
        // Two physically-distinct cases share this leg:
        //
        //  (a) a genuinely-DISSOLVED solute (NaCl, glucose, dissolved sucrose):
        //      it never melts -- it goes into SOLUTION, so the fusion enthalpy
        //      is NOT released.  Hfus ~ 0 is correct, and Cp_liquid is the
        //      sensible heat of the dissolved species.  This is the DEFAULT and
        //      keeps every existing solute .dat byte-identical.
        //
        //  (b) a true MELTING solid (a pure crystal taken to its liquid):
        //      the latent heat of fusion IS absorbed.  We detect this by the
        //      .dat carrying BOTH a real solidHeatCapacity{} block AND a real
        //      enthalpy of fusion (sublimation{}.Hfus -> subHfus_).  The
        //      transition is taken at 298 K (the engine's documented
        //      convention) then Cp_liquid integrates up to T.
        //
        // The discriminator is conservative: a .dat must OPT IN to (b) by
        // supplying both pieces of melting data; a dissolved solute supplies
        // neither and stays on path (a).
        const bool meltingSolid = (cpSolid_ != nullptr) && (subHfus_ > 0.0);
        if (meltingSolid)
            return Hf298_ + subHfus_ + cpLiqIntegral(T);     // melts: +Hfus
        return Hf298_ + cpLiqIntegral(T);                     // dissolved: Hfus ≈ 0
    }
    if (naturalPhase_ == "solid" && targetPhase == "gas")
        throw std::runtime_error("Component '" + name_ +
            "': sublimation (solid -> gas) not modelled; the solute should"
            " not appear in a vapour stream");
    if (naturalPhase_ == "liquid" && targetPhase == "solid")
        return Hf298_ + cpLiqIntegral(T);                     // melts back as liquid

    throw std::runtime_error("Component '" + name_ +
        "': unhandled phase combination natural='" + naturalPhase_
        + "', target='" + targetPhase + "'");
}

scalar Component::Hvap_latent(scalar T) const
{
    if (Tc_ <= 0.0 || Tb_ <= 0.0 || Hvap_Tb_ <= 0.0)
        throw std::runtime_error("Component '" + name_ +
            "': Watson ΔHvap requires Tc, Tb and HvapTb");
    if (T >= Tc_) return 0.0;          // supercritical
    const scalar num = Tc_ - T;
    const scalar den = Tc_ - Tb_;
    return Hvap_Tb_ * std::pow(num / den, 0.38);
}

scalar Component::Hliq_pure(scalar T, scalar Tref) const
{
    if (!cpLiq_)
        throw std::runtime_error("Component '" + name_ +
            "': liquidHeatCapacity missing — required for enthalpy");
    return cpLiq_->H(T, Tref);
}

scalar Component::Hvap_pure(scalar T, scalar Tref) const
{
    return Hliq_pure(T, Tref) + Hvap_latent(T);
}

scalar Component::h_pure_ig(scalar T) const
{
    if (!hasGibbsData_)
        throw std::runtime_error("Component '" + name_ +
            "': h_pure_ig(T) needs gibbsFormation block in.dat");
    if (!cpGas_)
        throw std::runtime_error("Component '" + name_ +
            "': h_pure_ig(T) needs idealGasHeatCapacity block in.dat");
    return Hf298_ + cpGas_->H(T, 298.15);
}

scalar Component::s_pure_ig(scalar T) const
{
    if (!hasGibbsData_)
        throw std::runtime_error("Component '" + name_ +
            "': s_pure_ig(T) needs gibbsFormation block in.dat");
    if (!cpGas_)
        throw std::runtime_error("Component '" + name_ +
            "': s_pure_ig(T) needs idealGasHeatCapacity block in.dat");
    return S298_ + cpGas_->S(T, 298.15);
}

scalar Component::g_pure_ig(scalar T) const
{
    return h_pure_ig(T) - T * s_pure_ig(T);
}

// Saturation concentration c_sat(T) = Σ a_i (T-273.15)^i  [kg solute/kg solvent].
// Polynomial in Celsius (the form solubility tables come in).  Clamped >= 0.
scalar Component::c_sat(scalar T_K) const
{
    const scalar Tc = T_K - 273.15;
    scalar c = 0.0, p = 1.0;
    for (scalar a : solubilityCoeffs_) { c += a * p; p *= Tc; }
    return std::max(0.0, c);
}

} // namespace Choupo
