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

#include "ThermoPackage.H"

#include "PackageAudit.H"
#include "ThermoAnnounce.H"   // load-phase announcement gate (verbosity contract)
#include "activityCoefficient/Wilson.H"
#include "activityCoefficient/UNIFAC.H"
#include "activityCoefficient/UNIQUAC.H"
#include "activityCoefficient/ElectrolyteActivity.H"
#include "core/Constants.H"
#include "henrysLaw/HenrysLawRegistry.H"
#include "solution/SolutionRegistry.H"
#include "propertyOps/DerivedClosures.H"   // closures::rackettVliq (liquid Vm)
#include "core/Advisory.H"
#include "thermo/RecordResolver.H"   // case-local mirrored constant/mixtures/ (sealing)

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <filesystem>
#include <iostream>
#include <map>
#include <memory>
#include <optional>
#include <stdexcept>

namespace Choupo {

// Pure-fluid routing helper (defined below): returns the component index to
// route through when the phase is effectively pure in a flagged component;
// throws LOUDLY when a flagged component is present but mixed; nullopt = use
// the generic chain.
static std::optional<std::size_t>
pureFluidRoute(const std::map<std::size_t, std::unique_ptr<PureFluidModel>>& pf,
               const std::vector<Component>& comps,
               const sVector& z);

void ThermoPackage::adoptElectrolytePackage(std::vector<Component> comps,
                                            std::unique_ptr<ActivityModel> act,
                                            std::unique_ptr<EquationOfState> eos)
{
    components_ = std::move(comps);
    activity_   = std::move(act);
    eos_        = std::move(eos);
}

std::vector<std::string>
ThermoPackage::loadComponentSet(std::vector<std::string> names,
                                const Database& db)
{
    // ----- TRACK A: predefined-mixture expansion (`air`, ...) -------------
    // Splice any token that names a data/standards/mixtures/<token>.dat file
    // into its member component names (de-duplicated), capturing the member
    // mole fractions to seed a feed stream's composition.  Plain component
    // tokens pass through untouched; the normal flat-by-name load then runs
    // on the expanded list.  Announced LOUDLY (see expandMixtures).
    std::map<std::string, scalar> seedByName;
    names = expandMixtures(names, db, seedByName, &mixtureMembersByToken_);

    // ALIAS canonicalisation (forum 2026-06-29) -- THE single chokepoint, reusing
    // the expandMixtures token-rewrite slot.  Map each token to its canonical
    // component stem BEFORE the names vector fans out to loadComponent, to the
    // binary-pair filename builder, to indexOf/name_, and to the Henry lookup --
    // so the WHOLE engine (pairs included) only ever sees canonical names and the
    // pair/Henry files stay alive with zero registry change.  Announced LOUD.
    for (auto& nm : names)
    {
        const std::string canon = db.canonicalName(nm);
        if (canon != nm)
        {
            if (thermoAnnounce())
                std::cerr << "[alias] component '" << nm << "' -> canonical '"
                          << canon << "'\n";
            nm = canon;
        }
    }

    components_.clear();
    components_.reserve(names.size());
    for (const auto& n : names) components_.push_back(db.loadComponent(n));

    // Re-key the captured mixture seeds by post-expansion component index.
    mixtureSeed_.clear();
    if (!seedByName.empty())
    {
        scalar sum = 0.0;
        for (const auto& [nm, x] : seedByName)
            sum += x;
        for (const auto& [nm, x] : seedByName)
        {
            const std::size_t i = indexOf(nm);   // present by construction
            mixtureSeed_[i] = (sum > 0.0) ? x / sum : 0.0;
        }
    }
    return names;
}

void ThermoPackage::assemblePhiPhi(const std::vector<std::string>& namesIn,
                                   const DictPtr& eosDict,
                                   const Database& db)
{
    // v2-NATIVE phiPhi assembly (migration step 2 pilot): the same
    // invariants readFromDict establishes for `vleWorld phiPhi;`, built
    // straight from the v2 sub-blocks -- no v1-shaped dict, no text.
    if (namesIn.empty())
        throw std::runtime_error("thermophysicalPropertySystem: 'components'"
            " list is empty");
    const auto names = loadComponentSet(namesIn, db);

    solventName_.clear();
    declaredSolutes_.clear();
    vleWorld_ = "phiPhi";

    // ONE Gibbs surface, two roots: the liquid phase carries an ideal
    // activity placeholder (unused in the phi-phi K), the vapour the EoS --
    // the same two implicit phases the flat reader builds.
    phases_.clear();
    auto idealAct = std::make_shared<Dictionary>("activity");
    idealAct->insert("model", std::string("ideal"));
    auto liqDict = std::make_shared<Dictionary>("liquid");
    liqDict->insert("type",     std::string("liquid"));
    liqDict->insert("name",     std::string("liquid"));
    liqDict->insert("activity", EntryValue(idealAct));
    phases_.push_back(Phase::New(liqDict, names, components_));
    auto vapDict = std::make_shared<Dictionary>("vapor");
    vapDict->insert("type", std::string("vapor"));
    vapDict->insert("name", std::string("vapor"));
    vapDict->insert("eos",  EntryValue(eosDict));
    phases_.push_back(Phase::New(vapDict, names, components_));

    activity_ = ActivityModel::New(idealAct, components_);
    eos_      = EquationOfState::New(eosDict, components_);
    if (!eos_ || eos_->isIdeal())
        throw std::runtime_error("thermoPackage: vleWorld phiPhi needs a real"
            " cubic EoS (SRK/PengRobinson), not idealGas.");
    if (thermoAnnounce())
        std::cout << "VLE world: phi-phi (K = phi_L/phi_V, "
                  << eos_->modelName() << " both phases)\n";

    auditFindings_ = collectAuditFindings(components_, activity_.get(), eos_.get());
    auditPackage(components_, activity_.get(), eos_.get());
    pureFluid_.clear();
}

void ThermoPackage::readFromDict(const DictPtr& dict, const Database& db)
{
    auto names = dict->lookupWordList("components");
    if (names.empty())
        throw std::runtime_error("thermoPackage: 'components' list is empty");
    names = loadComponentSet(names, db);

    // Designated solvent -----------------------------------------
    // Optional `solvent <name>;` keyword.  Used by the K-value selector
    // to look up Henry's law constants for components flagged
    // `role solute;` in their.dat.  Defaults to the component with the
    // largest molar mass when not declared --- a usable but crude
    // heuristic; the case author should set it explicitly when running
    // an absorption / stripping case.
    solventName_ = dict->lookupWordOrDefault("solvent", "");
    vleWorld_    = dict->lookupWordOrDefault("vleWorld", "gammaPhi");
    // Assembly-level Henry solutes (see header note): each MUST have a pair
    // file for the declared solvent -- an explicit request with missing data
    // is an ERROR, never a silent Raoult fallback.
    if (dict->found("solutes"))
    {
        declaredSolutes_ = dict->lookupWordList("solutes");
        if (solventName_.empty())
            throw std::runtime_error("thermoPackage: `solutes (...)` declared"
                " but no `solvent <name>;` -- name the solvent they dissolve in.");
        for (const auto& sol : declaredSolutes_)
        {
            (void)indexOf(sol);   // throws if not a package component
            if (!HenrysLawRegistry::has(sol, solventName_))
                throw std::runtime_error("thermoPackage: solute '" + sol
                    + "' declared but no Henry pair parameters/Henry/" + sol + "-"
                    + solventName_ + ".dat exists -- add the pair (or remove '"
                    + sol + "' from `solutes`).");
        }
    }

    // LOUD Henry announcement (no silent physics): the moment a solvent is
    // declared, say WHICH solutes will dissolve by Henry's law, with WHICH
    // constants, from WHICH pair file -- the "juice" a 2-line role overlay
    // points at.  Anyone reading the run log sees the dissolution physics.
    // Gated at the load-phase announce level (verbosity 0/1 runs stay silent).
    if (!solventName_.empty() && thermoAnnounce())
    {
        for (const auto& c : components_)
        {
            const bool declared = std::find(declaredSolutes_.begin(),
                declaredSolutes_.end(), c.name()) != declaredSolutes_.end();
            if (c.role() != "solute" && !declared) continue;
            if (!HenrysLawRegistry::has(c.name(), solventName_)) continue;
            const auto& hl = HenrysLawRegistry::byPair(c.name(), solventName_);
            if (!announceOnce("henryPair:" + c.name() + "-" + solventName_))
                continue;   // pass-7: a second configure in the same run
                            // re-printed the line with different printf --
                            // the student asked if H had CHANGED mid-run
            std::cout << "[henry] " << c.name() << " in " << solventName_
                      << ":  H_ref = " << hl.H_ref() << " Pa (" << hl.T_ref()
                      << " K),  dH_diss = " << hl.dHdiss() / 1000.0 << " kJ/mol";
            if (hl.v_inf() > 0.0)
                std::cout << ",  v_inf = " << hl.v_inf() * 1.0e6
                          << " cm^3/mol (Krichevsky-Kasarnovsky Poynting)";
            if (hl.margulesA() != 0.0)
                std::cout << ",  Margules A = " << hl.margulesA()
                          << " J/mol (Krichevsky-Ilinskaya gamma*)";
            std::cout << "  --- pair file parameters/Henry/" << c.name() << "-"
                      << solventName_ << ".dat\n";
        }
    }

    // Transport models (viscosity; thermal conductivity &
    // diffusivity).  The `transport {... }` block carries the viscosity
    // model directly (legacy `model Chung;`) plus optional sub-blocks for
    // the other transport properties.
    if (dict->found("transport"))
    {
        auto td = dict->subDict("transport");
        // CANONICAL hierarchy (Vitor 2026-07-04: "poe ordem nisto!"): every
        // transport property gets its own named sub-block,
        //     transport { viscosity { model Chung; }
        //                 thermalConductivity { model Eucken; } ... }
        // The bare legacy `model Chung;` at transport level (gas viscosity
        // implied) stays ACCEPTED for old cases -- a degenerate form, like the
        // flat thermoPackage itself.
        transport_ = td->found("viscosity")
                   ? TransportModel::New(td->subDict("viscosity"))
                   : TransportModel::New(td);
        if (td->found("thermalConductivity"))
            thermalConductivity_ =
                ThermalConductivityModel::New(td->subDict("thermalConductivity"));
        if (td->found("diffusivity"))
            diffusivity_ = DiffusivityModel::New(td->subDict("diffusivity"));
        // Liquid transport.
        if (td->found("liquidViscosity"))
            liquidViscosity_ =
                LiquidViscosityModel::New(td->subDict("liquidViscosity"));
        if (td->found("liquidConductivity"))
            liquidConductivity_ =
                LiquidConductivityModel::New(td->subDict("liquidConductivity"));
        if (td->found("liquidDiffusivity"))
            liquidDiffusivity_ =
                LiquidDiffusivityModel::New(td->subDict("liquidDiffusivity"));
        if (td->found("surfaceTension"))
            surfaceTension_ =
                SurfaceTensionModel::New(td->subDict("surfaceTension"));
    }

    // Per-node binary-pair search base (Item 0b): the Flowsheet injects
    // `binaryPairsBase` at the thermo level for a unit that owns a local
    // constant/binaryPairs folder.  Push it DOWN into the activityModel
    // sub-dict ONCE, before it is copied into the liquid Phase below -- so
    // BOTH the Phase's activity model (used by the flash) AND the legacy
    // activity_ pointer search that node FIRST.  NRTL reads it; other models
    // ignore it.
    for (const char* pdKey : {"binaryPairsBase", "activeComponents"})
        if (dict->found(pdKey) && dict->found("activityModel"))
        {
            auto am = dict->subDict("activityModel");
            if (!am->found(pdKey))
                am->insert(pdKey, dict->entryValue(pdKey));
        }

    phases_.clear();

    // -----  Branch on syntax style  ------------------------------------
    // (a) Legacy:    activityModel {... }  +  equationOfState {... }
    // (b) Explicit:  phases ( {... } {... } );
    if (dict->found("phases"))
    {
        auto pList = dict->lookupDictList("phases");
        if (pList.empty())
            throw std::runtime_error("thermoPackage: 'phases' list is empty");
        // Push the per-node pair-search base into EACH liquid phase's activity
        // block too (line 229 only reached the single legacy activityModel): an
        // LLE world declared as `phases ( {activity NRTL} {activity NRTL} )` needs
        // every phase's NRTL to search the node's propertyData first, or the
        // settler collapses to one phase (ideal, no pairs).
        for (const auto& pd : pList)
        {
            for (const char* pdKey : {"binaryPairsBase", "activeComponents"})
                if (dict->found(pdKey) && pd->found("activity")
                    && !pd->subDict("activity")->found(pdKey))
                    pd->subDict("activity")->insert(pdKey,
                                                    dict->entryValue(pdKey));
            phases_.push_back(Phase::New(pd, names, components_));
        }
    }
    else
    {
        // Build implicit (liquid, vapor) phases from legacy keys.
        auto liqDict = std::make_shared<Dictionary>("liquid");
        liqDict->insert("type",    std::string("liquid"));
        liqDict->insert("name",    std::string("liquid"));
        liqDict->insert("activity", dict->entryValue("activityModel"));
        phases_.push_back(Phase::New(liqDict, names, components_));

        auto vapDict = std::make_shared<Dictionary>("vapor");
        vapDict->insert("type",    std::string("vapor"));
        vapDict->insert("name",    std::string("vapor"));
        vapDict->insert("eos",      dict->entryValue("equationOfState"));
        phases_.push_back(Phase::New(vapDict, names, components_));
    }

    // Re-parse activity/EoS for legacy compatibility (cheap, runs once).
    DictPtr activityRef, eosRef;
    if (dict->found("activityModel"))
        activityRef = dict->subDict("activityModel");
    else if (dict->found("phases"))
    {
        // Pick first liquid phase's activity block
        for (const auto& pd : dict->lookupDictList("phases"))
            if (pd->found("activity")) { activityRef = pd->subDict("activity"); break; }
    }
    if (dict->found("equationOfState"))
        eosRef = dict->subDict("equationOfState");
    else if (dict->found("phases"))
    {
        for (const auto& pd : dict->lookupDictList("phases"))
            if (pd->found("eos")) { eosRef = pd->subDict("eos"); break; }
    }

    if (activityRef)
    {
        // UNIFAC groups are INTRINSIC component data: fill them in from each
        // component's .dat (`groups { unifac (...) }`) when not declared inline,
        // so they live ONCE in the component, not re-declared per case.
        activityRef = injectUnifacGroups(activityRef, names, components_);
        injectUniquacRQ(activityRef, names, components_);   // UNIQUAC r/q from the component .dat
        // Models self-configure from the RESOLVED components in their
        // constructors (Wilson reads Vliq, ElectrolyteActivity wires the salt's
        // electrolyte{} block) -- no dynamic_cast / setMolarVolumes / configure
        // two-phase dance.
        activity_ = ActivityModel::New(activityRef, components_);
    }
    if (eosRef) eos_ = EquationOfState::New(eosRef, components_);
    // phi-phi world coherence (AFTER the EoS exists): a real cubic is required.
    if (vleWorld_ == "phiPhi" && (!eos_ || eos_->isIdeal()))
        throw std::runtime_error("thermoPackage: vleWorld phiPhi needs a real"
            " cubic EoS (SRK/PengRobinson), not idealGas.");
    // Announce the world HERE, the one point BOTH entry paths cross: a legacy
    // thermoPackage selecting `vleWorld phiPhi;` directly AND the builder
    // (which writes that key into the dict it synthesises).  Same physics,
    // same announcement.  gammaPhi is the default world; the flash K-header
    // names its gamma/phi models per run.
    if (vleWorld_ == "phiPhi" && thermoAnnounce())
        std::cout << "VLE world: phi-phi (K = phi_L/phi_V, "
                  << eos_->modelName() << " both phases)\n";

    // Validation boundary (no silent crutch): confront each model's minimum-
    // parameter-set manifest against the components.  Store the findings (for the
    // gap report + result JSON) AND warn aloud.  Warn-only; never the hot path.
    auditFindings_ = collectAuditFindings(components_, activity_.get(), eos_.get());
    auditPackage(components_, activity_.get(), eos_.get());

    // ----- Pure-fluid absolute-property override (IF97 et al.) ------------
    //   pureFluids { water { method IF97; } }
    // Attach a PureFluidModel to a named component by index.  The kernel
    // speaks per-mass, so hand it the component's MW [g/mol] to bridge.
    pureFluid_.clear();
    if (dict->found("pureFluids"))
    {
        auto pf = dict->subDict("pureFluids");
        for (const auto& key : pf->keys())
        {
            const std::size_t i = indexOf(key);   // throws if not a component
            pureFluid_[i] = PureFluidModel::New(pf->subDict(key),
                                                components_[i].MW());
        }
        // Glass-box: announce the override as loudly as the per-unit thermo
        // cascade.  IF97 carries the IAPWS triple-point datum, regions 1/2/4.
        for (std::size_t i = 0; i < n(); ++i)
            if (pureFluid_.count(i))
            {
                const std::string t = pureFluid_.at(i)->type();
                std::cout << components_[i].name() << ": PureFluidModel " << t;
                if (t == "IF97")
                    std::cout << " (IAPWS-IF97, triple-point datum, regions 1/2/4)";
                std::cout << '\n';
            }
    }
}

std::size_t ThermoPackage::phaseIndexByName(const std::string& name) const
{
    for (std::size_t k = 0; k < phases_.size(); ++k)
        if (phases_[k]->name() == name) return k;
    throw std::runtime_error("ThermoPackage: no phase named '" + name + "'");
}

std::vector<std::size_t>
ThermoPackage::phasesOfType(const std::string& typeName) const
{
    std::vector<std::size_t> out;
    for (std::size_t k = 0; k < phases_.size(); ++k)
        if (phases_[k]->typeName() == typeName) out.push_back(k);
    return out;
}

sVector ThermoPackage::Kvec_phases(std::size_t alpha, std::size_t beta,
    scalar T, scalar P,
    const sVector& xA, const sVector& xB) const
{
    const auto fA = phases_.at(alpha)->fEffective(T, P, xA);
    const auto fB = phases_.at(beta) ->fEffective(T, P, xB);
    sVector K(n());
    for (std::size_t i = 0; i < n(); ++i) K[i] = fA[i] / fB[i];
    return K;
}

std::size_t ThermoPackage::indexOf(const std::string& name) const
{
    for (std::size_t i = 0; i < components_.size(); ++i)
        if (components_[i].name() == name) return i;
    // Alias fallback (forum 2026-06-29): a component referenced by a friendly
    // alias ('C4H10' for nButane, ...) resolves here too, so a composition,
    // reaction or stream may use any alias, not only the canonical name.
    for (std::size_t i = 0; i < components_.size(); ++i)
        for (const auto& a : components_[i].aliases())
            if (a == name) return i;
    throw std::runtime_error("ThermoPackage: component '" + name + "' not loaded");
}

// ---- TRACK A: predefined-mixture expansion ------------------------------
//
// A mixture file (data/standards/mixtures/<token>.dat) is an EXPANSION
// TABLE, not a component.  For each token in `names` that resolves to such a
// file, replace it with its member component names (de-duplicated against the
// names already present AND across mixtures) and accumulate the member mole
// fractions into `seedByName`.  Plain component tokens are passed through.
// Glass-box: every splice + every dedup reconciliation prints on stderr,
// mirroring the [overlay]/[local] style in Database.cpp.
std::vector<std::string>
ThermoPackage::expandMixtures(const std::vector<std::string>& names,
                             const Database& db,
                             std::map<std::string, scalar>& seedByName,
                             std::map<std::string, std::map<std::string, scalar>>* membersByToken)
{
    namespace fs = std::filesystem;
    (void)db;   // mixtures now resolve through RecordResolver (case-local first)

    std::vector<std::string> out;
    out.reserve(names.size());
    auto already = [&out](const std::string& n)
    {
        for (const auto& e : out) if (e == n) return true;
        return false;
    };

    for (const auto& token : names)
    {
        // Sealing redesign: a predefined mixture is a property record like any
        // other -- resolve it through RecordResolver so a SEALED case reads its
        // own MIRRORED constant/mixtures/<token>.dat and NEVER the installation
        // catalogue (resolveRecord returns an empty path when sealedStrict and
        // the record is absent locally -> the token is treated as a plain
        // component, exactly as an unknown catalogue file would be).
        const fs::path mixFile =
            records::resolveRecord("mixtures/" + token + ".dat");
        if (mixFile.empty() || !fs::exists(mixFile))
        {
            // Plain component token -- keep it (dedup defensively).
            if (!already(token)) out.push_back(token);
            else if (thermoAnnounce())
                std::cerr << "[mixture] component '" << token
                          << "' already present -- duplicate dropped.\n";
            continue;
        }

        // It is a predefined mixture: read members + fractions.
        DictPtr mix = Dictionary::fromFile(mixFile.string());
        auto members = mix->lookupDictList("members");
        if (members.empty())
            throw std::runtime_error(
                "mixture '" + token + "': 'members' list is empty ("
                + mixFile.string() + ")");

        std::string announce = "[mixture] '" + token + "' -> ";
        bool first = true;
        for (const auto& m : members)
        {
            const std::string comp = m->lookupWord("component");
            const scalar      x    = m->lookupScalar("x");

            if (!first) announce += " + ";
            first = false;
            announce += comp + " (" + std::to_string(x) + ")";

            // Seed accumulates even across mixtures sharing a member.
            seedByName[comp] += x;
            if (membersByToken) (*membersByToken)[token][comp] = x;   // per-token membership

            if (already(comp))
            {
                if (thermoAnnounce())
                    std::cerr << "[mixture] reconciliation: '" << token
                              << "' member '" << comp << "' is already in the "
                                 "component set -- expanded ONCE (its mole "
                                 "fraction still seeds the feed).\n";
                continue;
            }
            out.push_back(comp);
        }
        announce += "  [" + mixFile.string() + "]";
        if (thermoAnnounce()) std::cerr << announce << "\n";
    }

    return out;
}

sVector ThermoPackage::mixtureSeedVector() const
{
    if (mixtureSeed_.empty()) return {};
    sVector z(components_.size(), 0.0);
    scalar sum = 0.0;
    for (const auto& [i, x] : mixtureSeed_) { z[i] = x; sum += x; }
    if (sum > 0.0) for (auto& v : z) v /= sum;
    return z;
}

bool ThermoPackage::isHenrySolute(std::size_t i) const
{
    // MIRRORS the Henry branch in Kvec below (same predicate, one truth): a
    // `role solute;` component OR an assembly-declared solute, with a named
    // solvent and an existing (solute, solvent) Henry pair.
    if (i >= n() || solventName_.empty()) return false;
    const std::string& role = components_[i].role();
    const bool declared = std::find(declaredSolutes_.begin(),
        declaredSolutes_.end(), components_[i].name()) != declaredSolutes_.end();
    return (role == "solute" || declared)
        && HenrysLawRegistry::has(components_[i].name(), solventName_);
}

scalar ThermoPackage::K(std::size_t i, scalar T, scalar P,
                        const sVector& x, const sVector& y) const
{
    auto gam = activity_->gamma(T, x);
    auto phi = eos_     ->phi  (T, P, y);
    scalar Psat = components_[i].vp().Psat_Pa(T);
    return gam[i] * Psat / (phi[i] * P);
}

sVector ThermoPackage::Kvec(scalar T, scalar P,
                            const sVector& x, const sVector& y) const
{
    // World 2 (phi-phi): K_i = phi_i^L(x)/phi_i^V(y), the SAME cubic both
    // phases -- one Gibbs surface, two roots.  Composition dependence is
    // handled by the flash's own outer iteration (it re-calls Kvec at the
    // current x,y exactly as it does for gamma(x)).
    if (vleWorld_ == "phiPhi")
    {
        const auto phiV = eos_->phi      (T, P, y);
        const auto phiL = eos_->phiLiquid(T, P, x);
        sVector Kpp(n());
        for (std::size_t i = 0; i < n(); ++i)
            Kpp[i] = (phiV[i] > 0.0) ? phiL[i] / phiV[i] : 0.0;
        return Kpp;
    }
    auto gam = activity_->gamma(T, x);
    auto phi = eos_     ->phi  (T, P, y);
    sVector K(n());
    for (std::size_t i = 0; i < n(); ++i)
    {
        // Nonvolatile solutes (NaCl, glucose,...) never enter the
        // vapour: K = 0 identically.  Radicals are similarly ineligible
        // for VLE (gas-phase-only species; OH, H, O).
        const std::string& role = components_[i].role();
        if (role == "nonvolatile" || role == "radical")
        { K[i] = 0.0; continue; }

        // Solutes (CO2, NH3, O2, H2S,...) follow Henry's law when an
        // entry exists for (solute, solvent).  Otherwise fall back to
        // the Raoult/γ-φ form below.
        const bool henrySolute = (role == "solute"
             || std::find(declaredSolutes_.begin(), declaredSolutes_.end(),
                          components_[i].name()) != declaredSolutes_.end());
        if (henrySolute && !solventName_.empty()
         && HenrysLawRegistry::has(components_[i].name(), solventName_))
        {
            const auto& hl = HenrysLawRegistry::byPair(components_[i].name(), solventName_);
            // Full unsymmetric-convention gas solubility (Prausnitz Ch. 10):
            //   y phi^V P = x gamma2* H(T) exp[ v_inf (P - Ps_solvent)/RT ]
            // -> K = gamma2* H(T) Poynting / (phi^V P).  With v_inf = A = 0
            // this is the textbook H/P at low P (phi^V -> 1), byte-identical;
            // v_inf > 0 adds the Krichevsky-Kasarnovsky Poynting term and
            // margulesA != 0 the Krichevsky-Ilinskaya activity coefficient.
            scalar Hcorr = hl.H(T);
            if (hl.v_inf() > 0.0)
            {
                // Poynting anchored at the SOLVENT's saturation pressure.
                scalar Ps = 0.0;
                const std::size_t sIdx = indexOf(solventName_);
                if (components_[sIdx].hasVaporPressure())
                    Ps = components_[sIdx].vp().Psat_Pa(T);
                Hcorr *= std::exp(hl.v_inf() * (P - Ps)
                                  / (constant::R * T));
            }
            if (hl.margulesA() != 0.0)
            {
                // Unsymmetric gamma2*: ln g2* = (A/RT)(x1^2 - 1), x1 = solvent.
                const scalar x1 = x[indexOf(solventName_)];
                Hcorr *= std::exp(hl.margulesA() / (constant::R * T)
                                  * (x1 * x1 - 1.0));
            }
            K[i] = Hcorr / (phi[i] * P);
            continue;
        }

        scalar Psat = components_[i].vp().Psat_Pa(T);
        K[i] = gam[i] * Psat / (phi[i] * P);
    }
    return K;
}

sVector ThermoPackage::Kvec_Raoult(scalar T, scalar P) const
{
    sVector K(n());
    for (std::size_t i = 0; i < n(); ++i)
    {
        const std::string& role = components_[i].role();
        if (role == "nonvolatile" || role == "radical")
        { K[i] = 0.0; continue; }
        const bool henrySolute = (role == "solute"
             || std::find(declaredSolutes_.begin(), declaredSolutes_.end(),
                          components_[i].name()) != declaredSolutes_.end());
        if (henrySolute && !solventName_.empty()
         && HenrysLawRegistry::has(components_[i].name(), solventName_))
        {
            const auto& hl = HenrysLawRegistry::byPair(components_[i].name(), solventName_);
            K[i] = hl.H(T) / P;
            continue;
        }
        K[i] = components_[i].vp().Psat_Pa(T) / P;
    }
    return K;
}

scalar ThermoPackage::Hliquid(scalar T, const sVector& x, scalar Tref) const
{
    // Pure-fluid override (IF97 et al.): a phase effectively pure in a flagged
    // component reads the fundamental-equation package on its own datum.  No
    // pressure is supplied here (sensible-datum convenience path), so we take
    // the saturated-liquid state p = psat(T) -- region 1.  The package datum
    // cancels in h_out - h_in, exactly as the per-component sensible zero does.
    if (!pureFluid_.empty())
        if (auto i = pureFluidRoute(pureFluid_, components_, x))
        {
            const PureFluidModel& m = *pureFluid_.at(*i);
            return m.h_molar(T, m.p_sat(T));
        }

    scalar h = 0.0;
    for (std::size_t i = 0; i < n(); ++i)
    {
        // Skip components that are not present (x = 0).  Component
        // property evaluation may throw on missing data (a nonvolatile
        // solute has no Antoine / Hvap), and a multiplication by zero
        // does not save us if the call throws BEFORE the multiplication.
        if (x[i] <= 0.0) continue;
        h += x[i] * components_[i].Hliq_pure(T, Tref);
    }
    return h;
}

scalar ThermoPackage::Hvapour(scalar T, const sVector& y, scalar Tref) const
{
    // Pure-fluid override: saturated-vapour state p = psat(T) -- region 2.
    if (!pureFluid_.empty())
        if (auto i = pureFluidRoute(pureFluid_, components_, y))
        {
            const PureFluidModel& m = *pureFluid_.at(*i);
            // Just inside region 2: evaluate marginally below psat so the
            // router lands on the vapour side of the saturation line.
            const scalar ps = m.p_sat(T);
            return m.h_molar(T, ps * (1.0 - 1.0e-9));
        }

    scalar h = 0.0;
    for (std::size_t i = 0; i < n(); ++i)
    {
        if (y[i] <= 0.0) continue;
        h += y[i] * components_[i].Hvap_pure(T, Tref);
    }
    return h;
}

scalar ThermoPackage::Hmixture(scalar T, scalar V,
                               const sVector& x, const sVector& y,
                               scalar Tref) const
{
    return (1.0 - V) * Hliquid(T, x, Tref) + V * Hvapour(T, y, Tref);
}

// ---- Pure-fluid override helpers ----------------------------------------

bool ThermoPackage::isEffectivelyPure(const sVector& z, std::size_t i,
                                      scalar thr)
{
    return i < z.size() && z[i] >= thr;
}

std::vector<std::string> ThermoPackage::pureFluidSelections() const
{
    std::vector<std::string> out;
    for (std::size_t i = 0; i < n(); ++i)
        if (pureFluid_.count(i))
            out.push_back(components_[i].name()
                          + ": PureFluidModel " + pureFluid_.at(i)->type());
    return out;
}

// A flagged pure-fluid component (IF97 water) in a REAL mixture is a hard
// error in v1 -- the method has no mixture meaning.  No silent fallback.
// Returns the component index to route through if (and only if) the phase is
// effectively pure in a flagged component; otherwise std::nullopt (= generic
// chain).  Throws LOUDLY when a flagged component is present but NOT pure.
static std::optional<std::size_t>
pureFluidRoute(const std::map<std::size_t, std::unique_ptr<PureFluidModel>>& pf,
               const std::vector<Component>& comps,
               const sVector& z)
{
    for (const auto& kv : pf)
    {
        const std::size_t i = kv.first;
        const scalar zi = (i < z.size()) ? z[i] : 0.0;
        if (zi <= 1.0e-12) continue;                 // absent: nothing to route
        if (ThermoPackage::isEffectivelyPure(z, i))
            return i;                                // pure -> use the package
        // present but mixed -> refuse, naming the component and its fraction.
        char buf[64];
        std::snprintf(buf, sizeof(buf), "%.3g", static_cast<double>(zi));
        throw std::runtime_error(
            std::string("PureFluidModel ") + kv.second->type()
            + " is a pure-water property method; component '" + comps[i].name()
            + "' is x=" + buf + " in this phase -- " + kv.second->type()
            + " cannot do mixtures (v1). Remove the pureFluids "
            + kv.second->type()
            + " selection for this case or use the generic thermo.");
    }
    return std::nullopt;
}

// ---- Ideal-gas mixture H and S (NIST/JANAF reference state) -------------
//
// Both h_pure_ig and s_pure_ig in Component throw if `standardThermochemistry` is
// absent --- the error propagates here so the caller sees exactly which
// component is missing data.

scalar ThermoPackage::H_ig(scalar T, const sVector& y) const
{
    scalar h = 0.0;
    for (std::size_t i = 0; i < n(); ++i)
    {
        // Skip absent components (y = 0).  h_pure_ig THROWS for a species with
        // no idealGasHeatCapacity (a nonvolatile solute -- sucrose -- never in
        // the vapour), and C++ evaluates h_pure_ig(T) BEFORE the multiply, so
        // the *= 0 does not save us.  Without this guard the elements datum
        // threw on every vapour-bearing unit and the balance silently fell to
        // sensible -- the SAME guard Hliquid/Hvapour already carry.  One datum
        // everywhere (elements, 25 C); no sensible fallback.
        if (y[i] <= 0.0) continue;
        h += y[i] * components_[i].h_pure_ig(T);
    }
    return h;
}

scalar ThermoPackage::S_ig(scalar T, scalar P_Pa, const sVector& y) const
{
    constexpr scalar P_ref = 1.0e5;        // 1 bar, JANAF / NIST convention

    scalar s = 0.0;
    for (std::size_t i = 0; i < n(); ++i)
    {
        s += y[i] * components_[i].s_pure_ig(T);
        if (y[i] > 1.0e-30)
            s -= constant::R * y[i] * std::log(y[i]);     // mixing term
    }
    s -= constant::R * std::log(P_Pa / P_ref);            // pressure term
    return s;
}

scalar ThermoPackage::Cp_ig(scalar T, const sVector& y) const
{
    scalar cp = 0.0;
    for (std::size_t i = 0; i < n(); ++i)
    {
        if (!components_[i].hasCpIdealGas())
            throw std::runtime_error(
                "ThermoPackage::Cp_ig: component '" + components_[i].name()
                + "' has no idealGasHeatCapacity block in its.dat");
        cp += y[i] * components_[i].cpIdealGas().Cp(T);
    }
    return cp;
}

scalar ThermoPackage::H_real(scalar T, scalar P_Pa, const sVector& y) const
{
    // Pure-fluid override (IF97 et al.): a phase effectively pure in a flagged
    // component reads the fundamental-equation package's ABSOLUTE molar
    // enthalpy directly at (T, P).  Mirrors the routing in H_stream /
    // H_stream_formation / Hliquid / Hvapour so the SAME IF97 datum is used on
    // every channel -- here it lets the rotating-machinery isentropic core
    // (Turbine / Compressor, which consume H_real / S_real) run on real steam
    // instead of the ideal gas.  Additive: only fires when a pureFluids{}
    // component is selected AND the phase is effectively pure in it; the
    // generic ideal-gas + EoS-residual path is byte-identical otherwise.
    if (!pureFluid_.empty())
        if (auto i = pureFluidRoute(pureFluid_, components_, y))
            return pureFluid_.at(*i)->h_molar(T, P_Pa);

    return H_ig(T, y)
         + (eos_ ? eos_->H_residual(T, P_Pa, y) : 0.0);
}

// Default-solvent resolver for the aqueous-solution tier.  A DISSOLVED
// molecular solute (nonvolatile, crystalline-Hf datum) whose heat of solution
// lives in data/standards/solution/<solute>-<solvent>.dat sits one rung ABOVE
// the crystal on the SAME elements floor:  h_aq = Hf_crystal + dHsoln + INTcp.
// This resolves WHICH solvent the dHsoln is read for and returns dHsoln [J/mol]
// (nullopt when the component is not such a solute).
std::optional<scalar> ThermoPackage::dHsolnForSolute(std::size_t i) const
{
    if (i >= n()) return std::nullopt;
    const Component& c = components_[i];

    // Only a dissolved molecular solute with a CRYSTALLINE formation datum
    // (standardThermochemistry.phase solid) takes the aqueous rung.  Volatile species
    // and liquid/gas-datum components are untouched (byte-identical path).
    if (!c.isNonvolatile() || !c.hasGibbsData() || c.naturalPhase() != "solid")
        return std::nullopt;

    // Resolve the solvent.  The package's declared `solvent` wins; when none
    // is named, DEFAULT to water and ANNOUNCE it (deduped, every run).
    const bool   defaulted = solventName_.empty();
    const std::string solvent = defaulted ? "water" : solventName_;

    if (SolutionRegistry::has(c.name(), solvent))
    {
        const SolutionPair& sp = SolutionRegistry::byPair(c.name(), solvent);
        if (defaulted)
            if (AdvisoryLog::instance().add("thermo", "info", "solution",
                    "dHsoln(" + c.name() + "): solvent not named -> DEFAULT = water; "
                    "solution/" + c.name() + "-water.dat"
                    + (sp.source().empty() ? "" : "  [" + sp.source() + "]")))
                std::cerr << "[thermo] dHsoln(" << c.name()
                          << "): solvent not named -> DEFAULT = water; "
                          << "solution/" << c.name() << "-water.dat\n";
        return sp.dHsoln();
    }

    // Off-default solvent named, but no matching pair -> FAIL WITH A REMEDY
    // (never silently substitute the water number).
    if (!defaulted)
        throw std::runtime_error(
            "dHsoln(" + c.name() + ") requested in solvent '" + solvent
            + "'; only the standard solution/ pairs exist (e.g. "
            + c.name() + "-water).  Provide solution/" + c.name() + "-"
            + solvent + ".dat or set `solvent water;` explicitly.");

    // Default solvent (water) but no sucrose-water-style entry: this solute
    // simply has no curated heat of solution yet -> stays on the crystal rung.
    return std::nullopt;
}

bool ThermoPackage::hasEnthalpyDatum(std::size_t i) const
{
    if (i >= n()) return false;
    // Route 1: the ordinary formation datum.  A standardThermochemistry{} block lets
    // h_pure_ig / h_formation place the species on the elements reference
    // (the generic loop in H_liquid_formation / H_ig).
    if (components_[i].hasGibbsData()) return true;
    // Route 2: the electrolyte aqueous infinite-dilution ion reference.  A
    // strong electrolyte has no pure-liquid datum; H_liquid_formation places
    // its salt via aqueousSaltEnthalpy() -- but ONLY when calorimetricFit() is
    // on AND the ions carry the aqueous tier.  Gate identically so this
    // predicate never claims a datum the kernel would throw on.
    if (hasElectrolyte())
    {
        const ElectrolyteModel& el = electrolyte();
        // Gate IDENTICALLY to the kernel (forum 2026-06-28): the aqueous ion
        // reference is a datum whenever the ions carry it, independent of the
        // calorimetric L_phi fit -- else the predicate denies a datum the kernel
        // now places, resurrecting the silent sensible fallback.
        if (el.hasAqueousReference() && i == el.soluteIndex())
            return true;
    }
    return false;
}

scalar ThermoPackage::H_liquid_formation(scalar T, const sVector& x) const
{
    // Pure-fluid override (IF97 et al.): a phase effectively pure in a flagged
    // component reads the fundamental-equation package on ITS OWN datum.  For
    // a pure neutral substance the elements (Hf) datum and the package datum
    // differ only by a CONSTANT offset, which cancels in h_out - h_in for a
    // pure-water case -- the v1 contract.  Saturated-liquid pressure (region 1).
    if (!pureFluid_.empty())
        if (auto i = pureFluidRoute(pureFluid_, components_, x))
        {
            const PureFluidModel& m = *pureFluid_.at(*i);
            return m.h_molar(T, m.p_sat(T));
        }

    // Liquid on the ELEMENTS reference: ideal gas (which carries Hf via
    // h_pure_ig) minus the latent heat of vaporisation.
    //
    // PER-ROLE BRANCH (electrolyte-enthalpy slice 4, settled design +
    // Vitor's framing -- docs/electrolyte-enthalpy-spec.md sec.2-3): a strong
    // electrolyte has NO pure-liquid reference (no liquid NaOH at 80 C), so
    // its molecular term is physically empty.  When the package carries a
    // CALORIMETRICALLY FITTED salt with the aqueous ion tier, the salt
    // contributes  h_ions_aq(T) + L_phi(m,T)  (the infinite-dilution ion
    // reference + the measured-and-fitted heat-of-dilution curve) and the
    // SOLVENT stays molecular.  Same elements datum (the H+(aq)=0 convention
    // cancels for a neutral salt), so reaction enthalpies still emerge as
    // h_out - h_in.  Unfitted salts (calorimetricFit false -- e.g. a case-local
    // overlay without the T-slots; the STANDARDS NaCl/KCl are fitted since the
    // 2026-07-02 Parker refit) keep
    // the legacy path BYTE-IDENTICAL -- and keep announcing the omission.
    if (hasElectrolyte())
    {
        const ElectrolyteModel& el = electrolyte();
        const std::size_t is = el.soluteIndex(), iw = el.solventIndex();
        // GATE DECOUPLED (forum 2026-06-28): the aqueous infinite-dilution ION
        // REFERENCE (hfAqSum + cpAqSum*(T-298), exact, calorimetry-FREE) triggers
        // on hasAqueousReference() ALONE; the finite-concentration L_phi term is
        // gated SEPARATELY (inside aqueousSaltEnthalpy, by calorimetricFit).  The
        // old `calorimetricFit() &&` conflated the two, so an unfitted salt (one WITHOUT the Parker-refit T-slots; NaCl/KCl are both FITTED since 2026-07-02)
        // fell through to h_pure_ig and threw -> silently caught -> sensible.  The
        // ion sum lands on the SAME elements datum (H+(aq)=0 cancels, neutral salt).
        if (el.hasAqueousReference()
            && is < n() && iw < n() && x[is] > 1.0e-12 && x[iw] > 1.0e-12)
        {
            const scalar m = x[is] / (x[iw] * components_[iw].MW() * 1.0e-3);
            scalar h = x[is] * el.aqueousSaltEnthalpy(m, T);
            // LOUD per-species announcement (forum 2026-06-28: the pedagogical win
            // the rejected `liquidEnthalpy` menu was reaching for -- SEE the
            // reference, never PICK it).  Deduped once per salt per run.
            if (AdvisoryLog::instance().add("thermo", "info",
                    "H_liquid '" + el.soluteName() + "'",
                    "aqueous infinite-dilution ion reference"))
                std::cerr << "[thermo] H_liquid(" << el.soluteName()
                          << "): aqueous infinite-dilution ION reference, "
                          << "sum(nu*hfAq) = " << el.aqueousSaltEnthalpy(0.0, 298.15) * 1.0e-3
                          << " kJ/mol (ions.dat, elements/25C datum); "
                          << (el.calorimetricFit()
                                  ? "L_phi heat-of-dilution ON (calorimetric fit)"
                                  : "L_phi OFF (no calorimetricFit -- valid at low molality)")
                          << "\n";
            for (std::size_t i = 0; i < n(); ++i)
            {
                if (i == is) continue;
                if (x[i] <= 1.0e-12) continue;   // skip negligible (FP noise / absent co-salt)
                // A co-dissolved nonvolatile salt (e.g. KHT alongside KCl) has no
                // pure-liquid datum either; route it through the crystalline rung
                // when it carries one, else the generic molecular leg.
                if (auto dHsoln = dHsolnForSolute(i))
                {
                    const Component& c = components_[i];
                    scalar cpAq = c.hasCpLiquid() ? c.cpLiquid().H(T, 298.15) : 0.0;
                    h += x[i] * (c.Hf298() + *dHsoln + cpAq);
                    continue;
                }
                // Canonical phase leg (#106): the SAME Kirchhoff-
                // consistent liquid rung every balance reads.
                h += x[i] * speciesPhaseEnthalpy(i, T, 1.0e5, "liquid",
                                        ReferenceContext::StandardPhase);
            }
            return h;
        }
    }
    scalar h = 0.0;
    for (std::size_t i = 0; i < n(); ++i)
    {
        if (x[i] <= 0.0) continue;
        // ONE canonical leg per species (forum #103/#105): the body moved
        // verbatim into speciesPhaseEnthalpy so reactionHeat and every
        // balance read the SAME rung -- byte-identical here by construction.
        h += x[i] * speciesPhaseEnthalpy(i, T, 1.0e5, "liquid",
                                         ReferenceContext::StandardPhase);
    }
    // MOLECULAR twin (spec sec.8b): for a molecular mixture the symmetric
    // frame IS correct -- ideal mixing + H^E from the SAME G^E that gives the
    // VLE.  Gated exactly like the electrolyte branch: only when EVERY pair of
    // the activity model carries a measured-H_E calorimetric refit
    // (`calorimetricFit true;` per pair).  Default false everywhere today ->
    // byte-identical; the heats of mixing stay an announced omission until a
    // pair is genuinely refit.
    if (!hasElectrolyte() && activity_ && activity_->calorimetricFit())
        h += activity_->excessEnthalpy(T, x);
    return h;
}

scalar ThermoPackage::speciesPhaseEnthalpy(std::size_t i, scalar T,
                                           scalar /*P_Pa*/,
                                           const std::string& phase,
                                           ReferenceContext /*ctx*/) const
{
    // THE canonical per-species phase leg (forum #103/#105/#106) -- the ONE
    // place a species' elements-datum enthalpy in a phase is defined.
    // ReferenceContext::StandardPhase is the only context today (the
    // enum exists so a future partial-molar evaluation is a NEW context
    // with the full mixture state, never a reinterpretation of this one).
    // P is unused by the ideal legs but part of the contract.
    //
    // THE STATE IDENTITY (#106, the reopened gate): the leg is anchored on
    // the 298.15 K formation datum and integrated with the TARGET PHASE's
    // OWN Cp -- Component::h_formation -- so dh_phase/dT == Cp_phase by
    // construction and Hvap_state(T) = h_g(T) - h_liq(T) obeys Kirchhoff
    // automatically.  The earlier h_pure_ig - Hvap_Watson(T) liquid leg is
    // GONE: its slope was Cp_ig - dHvap_W/dT, silently overriding the
    // component's declared liquid Cp (the mheatx +10% was the executable
    // proof).  Watson survives as the independent latentHeat correlation
    // for estimation/validation/announced fallback -- it never defines the
    // state enthalpy used by a balance when both phases' Cp exist.
    if (i >= n())
        throw std::runtime_error("speciesPhaseEnthalpy: component index "
            + std::to_string(i) + " out of range");
    const Component& c = components_[i];

    if (phase == "gas")
        return c.h_formation(T, "gas");

    // DISSOLVED-vs-CRYSTALLINE rung (aqueous-solution tier): a nonvolatile
    // solute with a crystalline Hf datum and a solution/<solute>-<solvent>
    // entry sits one rung ABOVE the crystal on the SAME elements floor:
    //   h_aq(T) = Hf_crystal + dHsoln + INT_298^T cp_aq dT'
    // (cp_aq from the solution/ entry when given, else the component's
    // liquidHeatCapacity -- the dissolved-solute Cp).  This is the m->0
    // STANDARD state: for chemistry whose enthalpy genuinely depends on
    // molality, the finite-concentration part lives in the MIXTURE calls
    // (L_phi in the electrolyte branch), never here.
    if (auto dHsoln = dHsolnForSolute(i))
    {
        scalar cpAq;
        if (SolutionRegistry::has(c.name(),
                solventName_.empty() ? "water" : solventName_)
         && SolutionRegistry::byPair(c.name(),
                solventName_.empty() ? "water" : solventName_).hasCpAq())
            cpAq = SolutionRegistry::byPair(c.name(),
                solventName_.empty() ? "water" : solventName_).cpAq()
                * (T - 298.15);
        else
            cpAq = c.hasCpLiquid() ? c.cpLiquid().H(T, 298.15) : 0.0;
        return c.Hf298() + *dHsoln + cpAq;
    }
    if (c.hasCpLiquid())
        return c.h_formation(T, "liquid");
    // A species with NO liquid Cp (a permanent / supercritical gas -- H2,
    // N2 -- appearing as a dissolved trace in a liquid stream) has no
    // pure-liquid rung to integrate.  The honest future home is the
    // dissolved-gas HENRY rung; until it exists, the Watson-slope leg
    // survives as the ANNOUNCED fallback (#106: estimation/validation/
    // fallback -- explicitly announced, never the silent state surface).
    if (AdvisoryLog::instance().add("thermo", "warning",
            "speciesPhaseEnthalpy " + c.name(),
            "no liquidHeatCapacity: liquid leg falls back to the"
            " Watson-slope form h_ig - Hvap(T) (a dissolved-gas Henry rung"
            " is the honest future home)"))
        std::cerr << "[thermo] " << c.name() << ": no liquidHeatCapacity --"
                     " liquid leg uses the ANNOUNCED Watson-slope fallback\n";
    return c.h_pure_ig(T) - c.Hvap_latent(T);
}

scalar ThermoPackage::H_stream_formation(scalar T, scalar P_Pa,
                                         scalar vapFrac,
                                         const sVector& z) const
{
    // Pure-fluid override: here the actual stream pressure IS known, so route
    // the whole stream through the fundamental-equation package at (T, P_Pa).
    // The IF97 router picks region 1/2 from (p,T); a single-phase pure-water
    // stream gets its absolute h directly.  (A genuinely two-phase pure-water
    // stream on the saturation line is handled by the per-phase liquid/vapour
    // routing in H_liquid_formation / Hvapour; the well-conditioned default
    // single-phase path is this one.)
    if (!pureFluid_.empty())
    {
        if (auto i = pureFluidRoute(pureFluid_, components_, z))
        {
            const PureFluidModel& m = *pureFluid_.at(*i);
            if (vapFrac <= 0.0 || vapFrac >= 1.0)
                return m.h_molar(T, P_Pa);
            // Two-phase pure water: split on the saturation line.
            return (1.0 - vapFrac) * m.h_molar(T, m.p_sat(T))
                 +        vapFrac  * m.h_molar(T, m.p_sat(T) * (1.0 - 1.0e-9));
        }
    }

    if (vapFrac <= 0.0) return H_liquid_formation(T, z);

    // NONVOLATILE species (no priceable ideal-gas leg -- sucrose, salts)
    // are WHOLLY liquid at ANY vapour fraction: their share contributes the
    // liquid leg at full weight and is zeroed out of the vapour half, so a
    // solute-bearing stream never routes through h_pure_ig (which throws).
    // All-volatile streams are BYTE-IDENTICAL to the plain blend -- hNonvol
    // is 0 and zV == z.  This replaces the old blend surface's silent
    // "skip the impossible phase" with an explicit, conserving rule.
    sVector zV = z;
    scalar  hNonvol = 0.0;
    for (std::size_t i = 0; i < n() && i < z.size(); ++i)
    {
        if (z[i] <= 0.0) continue;
        if (!components_[i].hasCpIdealGas())
        {
            hNonvol += z[i] * speciesPhaseEnthalpy(
                i, T, P_Pa, "liquid", ReferenceContext::StandardPhase);
            zV[i] = 0.0;
        }
    }
    if (vapFrac >= 1.0) return hNonvol + H_real(T, P_Pa, zV);
    return (1.0 - vapFrac) * H_liquid_formation(T, z)
         + vapFrac * (hNonvol + H_real(T, P_Pa, zV));
}

scalar ThermoPackage::H_blendPerNaturalPhase(scalar T, scalar P_Pa,
                               scalar vapFrac, const sVector& z) const
{
    // Pure-fluid override: same routing as H_stream_formation (the actual
    // stream pressure is known here too).
    if (!pureFluid_.empty())
        if (auto i = pureFluidRoute(pureFluid_, components_, z))
        {
            const PureFluidModel& m = *pureFluid_.at(*i);
            if (vapFrac <= 0.0 || vapFrac >= 1.0)
                return m.h_molar(T, P_Pa);
            return (1.0 - vapFrac) * m.h_molar(T, m.p_sat(T))
                 +        vapFrac  * m.h_molar(T, m.p_sat(T) * (1.0 - 1.0e-9));
        }

    // NOTE: H_stream is the blend-by-z form (each component smeared over BOTH
    // phases by the SAME vapFrac); the energy-balance report and the published
    // stream .H now run on H_stream_formation (the canonical h_ig − ΔHvap
    // surface), so this path is no longer on the closure hot path.  It survives
    // for the recycle tear residual and PhaseChanger duty steps.
    //
    // The per-phase guards below are by PHASE VALIDITY, not a swallowed data
    // gap: under blend-by-z a NONVOLATILE solute (sucrose, NaCl) is nominally
    // "in the vapour half" at vf>0 even though it has no gas phase -- its
    // h_formation(T,"gas") legitimately has no path, and the correct physics is
    // to omit that (non-existent) vapour contribution, NOT to throw.  This is a
    // real phase fact (the species cannot be a vapour), the OPPOSITE of the
    // datum-fallback the energy balance deleted: there we throw on a genuine
    // missing-Hf gap; here we skip a phase the species cannot occupy.  Absent
    // species (z=0) are skipped first by composition.
    scalar H = 0.0;
    for (std::size_t i = 0; i < n(); ++i)
    {
        if (z[i] <= 0.0) continue;
        if (vapFrac < 1.0)
        {
            try {
                H += z[i] * (1.0 - vapFrac)
                   * components_[i].h_formation(T, "liquid");
            } catch (const std::exception&) {}   // species cannot be liquid here
        }
        if (vapFrac > 0.0)
        {
            try {
                H += z[i] * vapFrac
                   * components_[i].h_formation(T, "gas");
            } catch (const std::exception&) {}    // species cannot be vapour here
        }
    }
    return H;
}

scalar ThermoPackage::S_real(scalar T, scalar P_Pa, const sVector& y) const
{
    // Pure-fluid override: same routing as H_real -- the fundamental-equation
    // package gives the ABSOLUTE molar entropy at (T, P) on its own datum.
    // The isentropic step (S_out = S_in) is datum-independent, so a pure-water
    // turbine/compressor expands on the IF97 entropy surface.  Additive:
    // byte-identical when no pureFluids{} component is effectively pure here.
    if (!pureFluid_.empty())
        if (auto i = pureFluidRoute(pureFluid_, components_, y))
            return pureFluid_.at(*i)->s_molar(T, P_Pa);

    return S_ig(T, P_Pa, y)
         + (eos_ ? eos_->S_residual(T, P_Pa, y) : 0.0);
}

scalar ThermoPackage::viscosityGas(scalar T, const sVector& y) const
{
    // Pure-fluid override (e.g. water + IF97): a phase effectively pure in a
    // flagged component is served by its own fundamental-equation transport
    // release.  The (rho,T) kernel needs a pressure; with no P on this legacy
    // accessor the SATURATION pressure at T is the physical convention (the
    // saturated-vapour state).  Mixed-but-flagged -> pureFluidRoute throws.
    if (!pureFluid_.empty())
        if (auto i = pureFluidRoute(pureFluid_, components_, y))
        {
            const PureFluidModel& m = *pureFluid_.at(*i);
            static bool announced = false;
            if (!announced)
            {
                std::cout << "water viscosity: IAPWS R12-08 (industrial,"
                             " critical enhancement off)\n";
                announced = true;
            }
            return m.mu(T, m.p_sat(T));
        }
    if (!transport_)
        throw std::runtime_error("ThermoPackage::viscosityGas: no transport"
            " model --- add `transport { viscosity { model Chung; } }` to the"
            " thermoPackage, or `transport Chung;` under propertyMethods in"
            " the propertyPackage.");
    const std::size_t N = n();
    sVector eta(N, 0.0);
    for (std::size_t i = 0; i < N; ++i)
        eta[i] = transport_->viscosityGasPure(components_[i], T);

    // Wilke mixing rule for low-pressure gas viscosity.
    scalar mu = 0.0;
    for (std::size_t i = 0; i < N; ++i)
    {
        if (y[i] <= 0.0) continue;
        scalar denom = 0.0;
        for (std::size_t j = 0; j < N; ++j)
        {
            if (y[j] <= 0.0) continue;
            const scalar Mi = components_[i].MW(), Mj = components_[j].MW();
            const scalar t = 1.0 + std::sqrt(eta[i] / eta[j]) * std::pow(Mj / Mi, 0.25);
            const scalar phi = (t * t) / std::sqrt(8.0 * (1.0 + Mi / Mj));
            denom += y[j] * phi;
        }
        if (denom > 0.0) mu += y[i] * eta[i] / denom;
    }
    return mu;
}

scalar ThermoPackage::thermalConductivityGas(scalar T, const sVector& y) const
{
    if (!pureFluid_.empty())
        if (auto i = pureFluidRoute(pureFluid_, components_, y))
        {
            const PureFluidModel& m = *pureFluid_.at(*i);
            static bool announced = false;
            if (!announced)
            {
                std::cout << "water thermal conductivity: IAPWS R15-11"
                             " (background, critical enhancement off)\n";
                announced = true;
            }
            return m.lambda(T, m.p_sat(T));
        }
    if (!thermalConductivity_)
        throw std::runtime_error("ThermoPackage::thermalConductivityGas: no"
            " model --- add `transport { thermalConductivity { model Eucken;"
            " } }` to the thermoPackage (a propertyPackage's propertyMethods"
            " `transport` slot covers gas viscosity only).");
    if (!transport_)
        throw std::runtime_error("ThermoPackage::thermalConductivityGas: Eucken"
            " needs the gas viscosity --- add `transport { viscosity { model Chung; } }`"
            " alongside the thermalConductivity sub-block (or `transport Chung;`"
            " under propertyMethods in a propertyPackage).");
    const std::size_t N = n();
    sVector lam(N, 0.0), eta(N, 0.0);
    for (std::size_t i = 0; i < N; ++i)
    {
        if (y[i] <= 0.0) continue;          // only species actually present
        if (!components_[i].hasCpIdealGas())
            throw std::runtime_error("ThermoPackage::thermalConductivityGas:"
                " component '" + components_[i].name() + "' has no"
                " idealGasHeatCapacity block (Eucken needs Cp).");
        eta[i] = transport_->viscosityGasPure(components_[i], T);
        const scalar cp = components_[i].cpIdealGas().Cp(T);
        lam[i] = thermalConductivity_->conductivityGasPure(components_[i], T, eta[i], cp);
    }

    // Wassiljewa mixing rule, with Mason-Saxena interaction factors A_ij
    // identical to the Wilke phi_ij used for viscosity.
    scalar k = 0.0;
    for (std::size_t i = 0; i < N; ++i)
    {
        if (y[i] <= 0.0) continue;
        scalar denom = 0.0;
        for (std::size_t j = 0; j < N; ++j)
        {
            if (y[j] <= 0.0) continue;
            const scalar Mi = components_[i].MW(), Mj = components_[j].MW();
            const scalar t = 1.0 + std::sqrt(eta[i] / eta[j]) * std::pow(Mj / Mi, 0.25);
            const scalar phi = (t * t) / std::sqrt(8.0 * (1.0 + Mi / Mj));
            denom += y[j] * phi;
        }
        if (denom > 0.0) k += y[i] * lam[i] / denom;
    }
    return k;
}

scalar ThermoPackage::diffusivityGas(scalar T, scalar P_Pa,
                                     std::size_t i, std::size_t j) const
{
    if (!diffusivity_)
        throw std::runtime_error("ThermoPackage::diffusivityGas: no model ---"
            " add `transport { diffusivity { model Fuller; } }` to the"
            " thermoPackage (a propertyPackage's propertyMethods `transport`"
            " slot covers gas viscosity only).");
    return diffusivity_->diffusivityGasBinary(components_.at(i), components_.at(j), T, P_Pa);
}

scalar ThermoPackage::viscosityLiquid(scalar T, const sVector& x) const
{
    if (!pureFluid_.empty())
        if (auto i = pureFluidRoute(pureFluid_, components_, x))
        {
            const PureFluidModel& m = *pureFluid_.at(*i);
            static bool announced = false;
            if (!announced)
            {
                std::cout << "water viscosity: IAPWS R12-08 (industrial,"
                             " critical enhancement off)\n";
                announced = true;
            }
            return m.mu(T, m.p_sat(T));   // saturated-liquid state
        }
    if (!liquidViscosity_)
        throw std::runtime_error("ThermoPackage::viscosityLiquid: no model ---"
            " add `transport { liquidViscosity { model Andrade; } }` to the"
            " thermoPackage (a propertyPackage's propertyMethods `transport`"
            " slot covers gas viscosity only).");
    // Grunberg-Nissan (no interaction term): ln μ_mix = Σ xᵢ ln μᵢ.
    const std::size_t N = n();
    scalar lnmu = 0.0, xsum = 0.0;
    for (std::size_t i = 0; i < N; ++i)
    {
        if (x[i] <= 0.0) continue;
        lnmu += x[i] * std::log(liquidViscosity_->viscosityLiquidPure(components_[i], T));
        xsum += x[i];
    }
    if (xsum <= 0.0)
        throw std::runtime_error("ThermoPackage::viscosityLiquid: empty composition");
    return std::exp(lnmu / xsum);                       // Pa·s
}

scalar ThermoPackage::thermalConductivityLiquid(scalar T, const sVector& x) const
{
    if (!pureFluid_.empty())
        if (auto i = pureFluidRoute(pureFluid_, components_, x))
        {
            const PureFluidModel& m = *pureFluid_.at(*i);
            static bool announced = false;
            if (!announced)
            {
                std::cout << "water thermal conductivity: IAPWS R15-11"
                             " (background, critical enhancement off)\n";
                announced = true;
            }
            return m.lambda(T, m.p_sat(T));   // saturated-liquid state
        }
    if (!liquidConductivity_)
        throw std::runtime_error("ThermoPackage::thermalConductivityLiquid: no"
            " model --- add `transport { liquidConductivity { model"
            " SatoRiedel; } }` to the thermoPackage (a propertyPackage's"
            " propertyMethods `transport` slot covers gas viscosity only).");
    // Mass-fraction weighting: λ_mix = Σ wᵢ λᵢ.
    const std::size_t N = n();
    scalar Mbar = 0.0;
    for (std::size_t i = 0; i < N; ++i)
        if (x[i] > 0.0) Mbar += x[i] * components_[i].MW();
    if (Mbar <= 0.0)
        throw std::runtime_error("ThermoPackage::thermalConductivityLiquid: empty composition");
    scalar k = 0.0;
    for (std::size_t i = 0; i < N; ++i)
    {
        if (x[i] <= 0.0) continue;
        const scalar w = x[i] * components_[i].MW() / Mbar;
        k += w * liquidConductivity_->conductivityLiquidPure(components_[i], T);
    }
    return k;                                           // W/(m·K)
}

scalar ThermoPackage::diffusivityLiquid(scalar T, std::size_t i, std::size_t j) const
{
    if (!liquidDiffusivity_)
        throw std::runtime_error("ThermoPackage::diffusivityLiquid: no model ---"
            " add `transport { liquidDiffusivity { model WilkeChang; } }` to the"
            " thermoPackage (a propertyPackage's propertyMethods `transport`"
            " slot covers gas viscosity only).");
    if (!liquidViscosity_)
        throw std::runtime_error("ThermoPackage::diffusivityLiquid: needs the"
            " solvent viscosity --- add a `liquidViscosity` model alongside"
            " (in the thermoPackage's transport{} block).");
    // i = solute, j = solvent.
    const scalar muB =
        liquidViscosity_->viscosityLiquidPure(components_.at(j), T);
    return liquidDiffusivity_->diffusivityLiquidBinary(components_.at(i), components_.at(j), T, muB);
}

scalar ThermoPackage::surfaceTension(scalar T, const sVector& x) const
{
    // Pure-fluid override (water + IF97 -> R1-76).  sigma is a saturation-
    // line property, so it takes only T -- no pressure to bridge.
    if (!pureFluid_.empty())
        if (auto i = pureFluidRoute(pureFluid_, components_, x))
        {
            const PureFluidModel& m = *pureFluid_.at(*i);
            static bool announced = false;
            if (!announced)
            {
                std::cout << "water surface tension: IAPWS R1-76 (saturation"
                             " line)\n";
                announced = true;
            }
            return m.sigma(T);
        }
    if (!surfaceTension_)
        throw std::runtime_error("ThermoPackage::surfaceTension: no model ---"
            " add `transport { surfaceTension { model BrockBird; } }` to the"
            " thermoPackage (a propertyPackage's propertyMethods `transport`"
            " slot covers gas viscosity only).");
    // Mole-fraction average of the pure-component surface tensions (v1).
    const std::size_t N = n();
    scalar s = 0.0, xsum = 0.0;
    for (std::size_t i = 0; i < N; ++i)
    {
        if (x[i] <= 0.0) continue;
        s    += x[i] * surfaceTension_->sigmaPure(components_[i], T);
        xsum += x[i];
    }
    if (xsum <= 0.0)
        throw std::runtime_error("ThermoPackage::surfaceTension: empty composition");
    return s / xsum;                                    // N/m
}

scalar ThermoPackage::density(scalar T, scalar P_Pa, const sVector& z,
                              DensityPhase ph) const
{
    const std::size_t N = n();

    // Mean molar mass [kg/mol] (MW() is kg/kmol, so /1000).
    scalar Mbar = 0.0, zsum = 0.0;
    for (std::size_t i = 0; i < N; ++i)
        if (z[i] > 0.0) { Mbar += z[i] * components_[i].MW(); zsum += z[i]; }
    if (zsum <= 0.0)
        throw std::runtime_error("ThermoPackage::density: empty composition");
    Mbar = (Mbar / zsum) / 1000.0;                       // kg/mol

    // (1) Pure-fluid override (water + IF97 -> rho = MW / v_molar).  IF97's
    //     own kg/m³ density is reached here through the (T,P) v_molar contract.
    if (!pureFluid_.empty())
        if (auto i = pureFluidRoute(pureFluid_, components_, z))
        {
            const PureFluidModel& m = *pureFluid_.at(*i);
            static bool announced = false;
            if (!announced)
            {
                std::cout << "density: IAPWS fundamental equation"
                             " (rho = MW / v_molar)\n";
                announced = true;
            }
            const scalar Mi = components_[*i].MW() / 1000.0;   // kg/mol
            const scalar vm = m.v_molar(T, P_Pa);             // m³/mol
            if (vm <= 0.0)
                throw std::runtime_error("ThermoPackage::density: pure-fluid"
                    " v_molar <= 0");
            return Mi / vm;                                    // kg/m³
        }

    // (2) Vapour -> MW_avg / molar volume from the EoS.
    if (ph == DensityPhase::Vapour)
    {
        if (!eos_)
            throw std::runtime_error("ThermoPackage::density: vapour density"
                " needs an equationOfState block (idealGas/SRK/PR).");
        // Normalised composition for the EoS.
        sVector y(N, 0.0);
        for (std::size_t i = 0; i < N; ++i) y[i] = z[i] / zsum;
        const scalar vm = eos_->molarVolume(T, P_Pa, y);      // m³/mol
        if (vm <= 0.0)
            throw std::runtime_error("ThermoPackage::density: EoS molar volume"
                " <= 0");
        return Mbar / vm;                                     // kg/m³
    }

    // (3) Liquid -> saturated-liquid Rackett, mole-weighted molar volume.
    static bool announcedRackett = false;
    if (!announcedRackett)
    {
        std::cout << "liquid density: Rackett (saturated correlation --"
                     " an ESTIMATE; known weak for water, ~12% low at 25 C:"
                     " check against a measured density where it matters)\n";
        announcedRackett = true;
    }
    scalar Vmix = 0.0;                                          // m³/mol
    for (std::size_t i = 0; i < N; ++i)
    {
        if (z[i] <= 0.0) continue;
        const Component& c = components_[i];
        const scalar Tc = c.Tc(), Pc_Pa = c.Pc() * 1.0e5, omega = c.omega();
        if (Tc <= 0.0 || Pc_Pa <= 0.0)
            throw std::runtime_error("ThermoPackage::density: liquid (Rackett)"
                " needs Tc and Pc for component '" + c.name() + "'.");
        Vmix += (z[i] / zsum) * closures::rackettVliq(T, Tc, Pc_Pa, omega);
    }
    if (Vmix <= 0.0)
        throw std::runtime_error("ThermoPackage::density: Rackett molar volume"
            " <= 0");
    return Mbar / Vmix;                                         // kg/m³
}

} // namespace Choupo
