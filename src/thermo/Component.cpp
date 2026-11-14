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
#include "core/Advisory.H"
#include "thermo/AtomicWeights.H"
#include "thermo/ElementComposition.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"   // electrolyte::ionCharge (dissociatesTo -> cation/anion)

#include "thermo/Database.H"
#include "thermo/VapourAssociation.H"
#include "core/Constants.H"
#include "core/Dimensions.H"

#include <cmath>
#include <filesystem>
#include <memory>
#include <stdexcept>
#include <variant>
#include "thermo/vaporPressure/VaporPressureModel.H"
#include "thermo/heatCapacity/HeatCapacityModel.H"
#include "thermo/transport/LiquidViscosityModel.H"
#include "thermo/transport/LiquidConductivityModel.H"
#include "thermo/SurfaceTensionModel.H"
#include "thermo/PropertyDomainError.H"

namespace Choupo {

// ---- Out-of-line special members + model accessors (hygiene 5/6) -----------
//  The correlation models are forward-declared in the header; everything
//  that needs their complete types lives here.
Component::Component()  = default;
Component::~Component() = default;
Component::Component(Component&&) noexcept            = default;
Component& Component::operator=(Component&&) noexcept = default;

const VaporPressureModel& Component::vp() const       { return *vp_; }
const HeatCapacityModel&  Component::cpLiquid() const { return *cpLiq_; }
const HeatCapacityModel&  Component::cpIdealGas() const { return *cpGas_; }
const HeatCapacityModel&  Component::cpSolid() const  { return *cpSolid_; }

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
    //  Stamp the owner here too -- this setter is the OTHER way a liquid Cp
    //  reaches a component, and a warning that names its component on one
    //  path and not the other is worse than one that never names it: the
    //  reader learns to expect a name and then silently gets none.
    if (!d->found("owner")) d->insert("owner", name_);
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

// The IDENTITY fields -- who this substance is, as its record declares it.
//
// Same seam, same cause as readAqueousMapping below, one field over.  The
// electrolyte builder mints its salt with identity() above, which carries
// name, MW and role and nothing else, so `formula NaCl;` -- written plainly in
// the record, three lines from the MW the same call had just read -- never
// reached the runtime.  The element balance counts atoms from a formula, so
// every Pitzer/eNRTL case in the corpus published
//
//     status,UNAVAILABLE
//     refusedSpecies.NaCl,"component 'NaCl': no molecular formula declared"
//
// about a component that declares one.  The datum was never missing; the mint
// dropped it, and the report faithfully said what the runtime could see.
//
// (Pseudo-components -- dowthermA, hitecSalt, a petroleum cut, polystyrene --
// have no molecular formula to declare, and their UNAVAILABLE is the honest
// answer.  This changes nothing for them.)
void Component::readIdentity(const DictPtr& d)
{
    if (d->found("aliases")) aliases_ = d->lookupWordList("aliases");
    formula_ = d->lookupWordOrDefault("formula", "");
    cas_     = d->lookupWordOrDefault("CAS", "");
    //  The liquid molar volume is a declared fact of the same kind: a vessel
    //  with a LEVEL (dynamicTank, dynamicCSTR `volumeMode variable`, C205)
    //  derives its volume from the package's liquid density, and a salt
    //  minted by identity() would otherwise refuse as "declares no Vliq" about
    //  a record that does.  No standard-catalogue salt declares one, so no
    //  existing case reads a different number.
    Vliq_    = d->lookupScalarOrDefault("Vliq", 0.0);
    readVliqT(d);
}

//  `VliqT` -- the temperature the record's `Vliq` belongs to (C378).  Read
//  at the two sites that read `Vliq` (identity() and the full record), so
//  it lives in one method.  A temperature of nothing is refused.
void Component::readVliqT(const DictPtr& d)
{
    hasVliqT_ = d->found("VliqT");
    VliqT_    = hasVliqT_ ? d->lookupScalar("VliqT", Dims::temperature) : 298.15;
    if (!hasVliqT_) return;
    if (!(Vliq_ > 0.0))
        throw std::runtime_error("component '" + name_ + "': `VliqT` is"
            " declared but `Vliq` is not -- VliqT is the temperature the"
            " liquid molar volume Vliq belongs to, and there is no volume for"
            " it to qualify.  Declare `Vliq` (m^3/mol) beside it, or remove"
            " `VliqT`.");
    if (!(VliqT_ > 0.0) || !std::isfinite(VliqT_))
        throw std::runtime_error("component '" + name_ + "': `VliqT` fails"
            " its lower bound: it must be a positive temperature (read "
            + std::to_string(VliqT_) + " K).");
}

// The component -> aqueous-species bridge, TYPED AT LOAD (the loader
// contract of the 2026-07-25 identifier-typing decision): the general
// `aqueousMapping ( { species X; nu n; } ... )` block wins; a salt's
// `dissociatesTo` converts to the same typed structure.  No block, no
// bridge -- name identity is never assumed.
//
// It lives in its OWN method because the ThermoPackageBuilder's electrolyte
// path does NOT go through readFromDict: it mints the salt as an IDENTITY
// component (name + MW + role) and so inherited no bridge at all, which is
// why every Pitzer/eNRTL brine in the corpus reported its apparent
// components and not one ion.  Two parses of one block would be the arity
// sin; one method called from both places is the fix.
void Component::readAqueousMapping(const DictPtr& d)
{
    aqueousMapping_.clear();
    if (d->found("aqueousMapping"))
    {
        for (const auto& e : d->lookupDictList("aqueousMapping"))
            aqueousMapping_.push_back(
                { SpeciesId(e->lookupWord("species")),
                  e->lookupScalarOrDefault("nu", 1.0) });
    }
    else if (d->found("dissociatesTo"))
    {
        auto d2t = d->subDict("dissociatesTo");
        for (const auto& ion : d2t->keys())
            aqueousMapping_.push_back(
                { SpeciesId(ion), d2t->lookupScalar(ion) });
    }
    else if (d->found("solidPhases"))
    {
        //  A MINERAL'S BRIDGE IS ITS OWN DISSOLUTION (2026-07-27).  A record
        //  like calcite already states the stoichiometry:
        //
        //      solidPhases { calcite { dissolutionReaction
        //          { masters ( {ion Ca; nu 1;} {ion HCO3; nu 1;} {ion H; nu -1;} ); } } }
        //
        //  Asking the author to ALSO write `aqueousMapping ( Ca:1, HCO3:1 )`
        //  would put the same stoichiometry in a second place three lines
        //  away -- the arity sin, in one file.  So it is derived: the
        //  dissolution's masters, less H and OH.
        //
        //  H is dropped because it is not a family total: it is the mediator
        //  every family shares, and it is closed by electroneutrality inside
        //  the speciation, never carried as a component's contribution.  That
        //  is exactly why feeding calcite MOVES the pH without anyone writing
        //  an equation for it.
        //
        //  All declared phases of one component must dissolve to the same
        //  ions (calcite and aragonite do -- they are polymorphs), so the
        //  FIRST is read and any disagreement refuses rather than picking.
        auto sp = d->subDict("solidPhases");
        const auto phases = sp->keys();

        std::vector<SpeciesStoich> derived;
        std::string from;
        for (const auto& ph : phases)
        {
            auto pd = sp->subDict(ph);
            if (!pd->found("dissolutionReaction")) continue;
            auto dr = pd->subDict("dissolutionReaction");
            if (!dr->found("masters")) continue;
            std::vector<SpeciesStoich> here;
            for (const auto& m : dr->lookupDictList("masters"))
            {
                const std::string ion = m->lookupWord("ion");
                if (ion == "H" || ion == "OH") continue;
                here.push_back({ SpeciesId(ion),
                                 m->lookupScalarOrDefault("nu", 1.0) });
            }
            if (derived.empty()) { derived = here; from = ph; continue; }
            bool same = here.size() == derived.size();
            for (std::size_t k = 0; same && k < here.size(); ++k)
                same = here[k].species.key == derived[k].species.key
                    && here[k].nu == derived[k].nu;
            if (!same)
                throw std::runtime_error("Component '" + name_ + "': solid"
                    " phases '" + from + "' and '" + ph + "' dissolve to"
                    " DIFFERENT ion sets, so the component's aqueous bridge is"
                    " ambiguous -- declare `aqueousMapping` explicitly, or"
                    " split the component.");
        }
        aqueousMapping_ = std::move(derived);
    }
}

Component::HansenBlock Component::readHansenBlock(const DictPtr& h,
                                                  const std::string& owner)
{
    //  THE HANSEN BLOCK, all-or-nothing.  A partial trio is refused rather
    //  than half-read: a lone dD is not partial information about the split,
    //  it is a coordinate that will be plotted somewhere wrong.  Same posture
    //  as the pcsaft association trio.
    const bool hasD = h->found("dD"), hasP = h->found("dP"),
               hasH = h->found("dH");
    if (!(hasD && hasP && hasH))
        throw std::runtime_error("component '" + owner + "': the `hansen {}`"
            " block must declare ALL THREE of dD, dP and dH (Pa^0.5)."
            "  A partial triple is not partial information about the"
            " cohesive-energy split -- it is a coordinate that would be"
            " plotted somewhere wrong.  Declare the three, or remove the"
            " block and keep the honest absence.");
    HansenBlock out;
    out.dD = h->lookupScalar("dD");
    out.dP = h->lookupScalar("dP");
    out.dH = h->lookupScalar("dH");
    if (out.dD < 0 || out.dP < 0 || out.dH < 0)
        throw std::runtime_error("component '" + owner + "': a `hansen {}`"
            " component is negative.  Each is the square root of a"
            " non-negative energy density and cannot be.");
    //  THE TEMPERATURE IS PART OF THE PLACEMENT, not a detail (DEV.md 4c
    //  C128, adjustment 4).  Refused rather than defaulted: a default of
    //  25 C would be right for most compilations and silently wrong for the
    //  first record placed at another temperature, with nothing on any
    //  surface to say so.
    if (!h->found("Tref"))
        throw std::runtime_error("component '" + owner + "': the `hansen {}`"
            " block declares no `Tref` -- the temperature its dD/dP/dH were"
            " placed at.  The engine applies NO temperature correction to a"
            " Hansen triple, so every run states this temperature beside the"
            " values; a triple with no temperature is a number from an"
            " unstated state.  Declare `Tref 298.15 K;` (or whatever the"
            " source states) inside the block.");
    out.Tref = h->lookupScalar("Tref");
    if (!(out.Tref > 0))
        throw std::runtime_error("component '" + owner + "': `hansen.Tref`"
            " must be a positive absolute temperature.");
    //  R0 is a SOLUTE's measured interaction radius.  Optional, because a
    //  solvent has none; refused when declared non-positive, because a
    //  zero radius would turn every RED into a division by zero that still
    //  reads as a number.
    if (h->found("R0"))
    {
        out.R0 = h->lookupScalar("R0");
        if (!(out.R0 > 0))
            throw std::runtime_error("component '" + owner + "': `hansen.R0`"
                " must be positive (Pa^0.5) -- it is the radius of the"
                " solute's solubility sphere.  Omit it when the record"
                " declares none; the hansenMixture op then publishes Ra"
                " alone and no RED.");
        out.hasR0 = true;
    }
    return out;
}

void Component::readFromDict(const DictPtr& d)
{
    // The component grammar is FLAT (name; MW; Tc; ...; the named model
    // sub-blocks).  A reference-state block at top level is not part of it
    // -- refuse loudly, never read it silently.
    for (const char* blk : {"identity", "critical", "liquidPure", "gasIdeal",
                             "component"})
        if (d->found(blk))
            throw std::runtime_error("component .dat: '" + std::string(blk)
                + "{}' is not the component grammar -- the layout is FLAT"
                " (bin/curate/migrate_component_blocks.py converts a"
                " block-form file; component{speciesMap} is spelled"
                " `dissociatesTo { ... }`).");

    name_    = d->lookupWordOrDefault("name", "");
    readIdentity(d);

    MW_      = d->lookupScalar       ("MW");
    Tc_      = d->lookupScalarOrDefault("Tc",      0.0);
    Pc_      = d->lookupScalarOrDefault("Pc",      0.0);
    omega_   = d->lookupScalarOrDefault("omega",   0.0);
    Tb_      = d->lookupScalarOrDefault("Tb",      0.0);
    Hvap_Tb_ = d->lookupScalarOrDefault("HvapTb",  0.0);
    Vliq_    = d->lookupScalarOrDefault("Vliq",    0.0);
    readVliqT(d);
    //  A saturated-liquid volume exists only below the critical point: a
    //  datum at or above Tc is not one (docs/design/liquid-volume-datum-
    //  temperature.md, grammar line 3).
    if (hasVliqT_ && Tc_ > 0.0 && VliqT_ >= Tc_)
        throw std::runtime_error("component '" + name_ + "': `VliqT` fails"
            " its upper bound: " + std::to_string(VliqT_) + " K is at or above the critical"
            " temperature Tc = " + std::to_string(Tc_) + " K.  A liquid"
            " molar volume belongs to a temperature below Tc, where a"
            " saturated liquid exists; state the temperature the measured"
            " volume was taken at.");
    solPar_  = d->lookupScalarOrDefault("solubilityParameter", 0.0);

    //  THE HANSEN TRIPLE, all-or-nothing.  A partial trio is refused rather
    //  than half-read: a lone dD is not partial information about the split,
    //  it is a coordinate that will be plotted somewhere wrong.  Same posture
    //  as the pcsaft association trio one block down.
    if (d->found("hansen"))
    {
        const HansenBlock h = readHansenBlock(d->subDict("hansen"), name_);
        hansenD_    = h.dD;
        hansenP_    = h.dP;
        hansenH_    = h.dH;
        hansenTref_ = h.Tref;
        hansenR0_   = h.hasR0 ? h.R0 : 0.0;
        hansenSet_  = true;
    }
    diffusionVolume_ = d->lookupScalarOrDefault("diffusionVolume", 0.0);

    // Lennard-Jones (12-6) force constants (intrinsic): `lennardJones { sigma
    // [0 1 0 0 0] <m>; epsOverK <K> K; provenance {...} }`.  Read by the
    // Chapman-Enskog gas viscosity -- ONE home, never re-declared per case.
    // The CHECKED lookups: sigma must be declared as a LENGTH (the record
    // writes the bracket form because angstrom is not a named unit) and
    // eps/k as a TEMPERATURE; a bare number is accepted as canonical SI by
    // the Dictionary contract, a wrong dimension refuses with the mismatch.
    if (d->found("lennardJones"))
    {
        auto lj = d->subDict("lennardJones");
        const bool hasS = lj->found("sigma"), hasE = lj->found("epsOverK");
        if (!hasS || !hasE)
            throw std::runtime_error("component '" + name_ + "': the"
                " `lennardJones {}` block is PARTIAL -- `sigma` (a length)"
                " and `epsOverK` (a temperature) must both be declared.  A"
                " pair potential with one constant is not half a potential;"
                " curate the missing value from the primary source"
                " (bin/curate/propose_lennard_jones.py drafts both from"
                " Svehla 1962), or remove the block and keep the honest"
                " absence.");
        ljSigma_ = lj->lookupScalar("sigma",    Dims::length);
        ljEpsK_  = lj->lookupScalar("epsOverK", Dims::temperature);
        if (ljSigma_ <= 0.0 || ljEpsK_ <= 0.0)
            throw std::runtime_error("component '" + name_ + "': lennardJones"
                " sigma and epsOverK must both be positive (sigma "
                + std::to_string(ljSigma_) + " m, epsOverK "
                + std::to_string(ljEpsK_) + " K declared).");
        //  Provenance is PER VALUE: Svehla codes sigma and eps/k separately,
        //  and He's sigma is a graphical fit while its eps/k is quantum-
        //  mechanical.  The origin word goes through the one vocabulary
        //  (core/Origin.H); an unknown word resolves to `unattributed`, which
        //  the Chapman-Enskog model announces rather than reading as fact.
        if (lj->found("provenance"))
        {
            auto pv = lj->subDict("provenance");
            auto readOne = [&](const char* key, Origin& o, std::string& m)
            {
                if (!pv->found(key)) return;
                const auto& ev = pv->entryValue(key);
                if (!std::holds_alternative<DictPtr>(ev)) return;
                auto sub = std::get<DictPtr>(ev);
                o = originFromWord(sub->lookupWordOrDefault("origin", "unattributed"));
                m = sub->lookupWordOrDefault("method", "");
            };
            readOne("sigma",    ljSigmaOrigin_, ljSigmaMethod_);
            readOne("epsOverK", ljEpsKOrigin_,  ljEpsKMethod_);
            ljSource_  = pv->lookupWordOrDefault("source", "");
            ljLicence_ = pv->lookupWordOrDefault("licence", "");
        }
    }

    // Liquid transport blocks kept RAW (each model reads its own sub-block).
    associationFactor_ = d->lookupScalarOrDefault("associationFactor", 1.0);   // Wilke-Chang
    if (d->found("liquidViscosity"))
        liquidViscDict_ = d->subDict("liquidViscosity");
    if (d->found("liquidThermalConductivity"))
        liquidCondDict_ = d->subDict("liquidThermalConductivity");
    if (d->found("surfaceTension"))   // stored sigma(T), read by StoredCorrelation
        surfaceTensionDict_ = d->subDict("surfaceTension");

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
    // A LUMPED solute with no ion map declares `dissociation nu` directly
    // (the colligative factor is its only speciation fact; a non-electrolyte
    // defaults to 1).  Two fields must never encode one fact -- when the map
    // exists, it is canonical and nu derives from it.
    if (d->found("dissociatesTo"))
    {
        nu_ = 0.0;
        auto d2t = d->subDict("dissociatesTo");
        for (const auto& ion : d2t->keys()) nu_ += d2t->lookupScalar(ion);
    }
    else
        nu_ = d->lookupScalarOrDefault("dissociation", 1.0);

    readAqueousMapping(d);

    // Aqueous-speciation FACT (substance-level, classifier-read; ratified
    // 2026-07-26): `aqueousSpeciation none;` = curated fact that the
    // component does NOT join the aqueous equilibrium speciation network;
    // `aqueousSpeciation <setName>;` names its canonical equilibrium set.
    // ABSENT = UNKNOWN -- the classifier refuses an unknown molecular
    // component inside an electrolyte system (with the curation remedy).
    // Vapour-phase reactions (acetic dimerisation) are NOT part of this
    // fact -- they stay on the vapour/gas-liquid records.
    if (d->found("aqueousSpeciation"))
    {
        aqueousSpeciationDeclared_ = true;
        aqueousSpeciation_ = d->lookupWord("aqueousSpeciation");
    }

    // Role / category ----------------------------------------------
    // `role <word>;` -- volatile (default) / solute / nonvolatile / radical.
    if (d->found("nonvolatile"))
        throw std::runtime_error("Component '" + name_ + "': `nonvolatile` is"
            " not a component key -- the category is `role nonvolatile;`.");
    if (d->found("role"))
    {
        role_ = d->lookupWord("role");
        if (role_ != "volatile" && role_ != "solute"
         && role_ != "nonvolatile" && role_ != "radical")
            throw std::runtime_error("Component '" + name_ +
                "': role '" + role_ + "' is not one of"
                " volatile / solute / nonvolatile / radical");
    }

    //  `volatility { class; normalBoilingPoint; }` -- the SUBSTANCE's physics,
    //  orthogonal to `role` (which is the CASE's modelling class).  The two
    //  reference process simulators both keep these apart -- one as a
    //  participation Type beside a case-scoped Henry list, the other as
    //  boolean facts beside the stored boiling point -- and Choupo's own
    //  corpus reinvented the split in prose (14 staged files annotate their
    //  role as "CASE role, not a claim about the physics"; the curated tier
    //  carries a vapour-phase heat-transfer fluid declared unable to boil).
    //  Forum: docs/design/role-vocabulary-forum-2026-08-02.md.
    //
    //  ABSENCE IS NOT A CLAIM: no block means UNKNOWN, never "nonvolatile".
    if (d->found("volatility"))
    {
        auto vd = d->subDict("volatility");
        volatilityClass_ = vd->lookupWord("class");
        if (volatilityClass_ != "volatile"
         && volatilityClass_ != "nonvolatile"
         && volatilityClass_ != "decomposes")
            throw std::runtime_error("Component '" + name_ +
                "': volatility.class '" + volatilityClass_ + "' is not one of"
                " volatile / nonvolatile / decomposes");
        //  A claim of volatility must be FALSIFIABLE -- it needs the datum
        //  that makes it checkable, not an opinion.  That datum is the
        //  component's OWN `Tb`, which every record already has a home for:
        //  the block must NOT restate it (a second home for one number is
        //  the arity sin, and dowthermA already carries a cited Tb 530.15
        //  that until now influenced nothing).
        if (vd->found("normalBoilingPoint") || vd->found("Tb"))
            throw std::runtime_error("Component '" + name_ +
                "': volatility{} must NOT restate the boiling point -- `Tb`"
                " is a component-level datum with one home, and this block"
                " declares only the CLASS.  Remove it here; the engine reads"
                " the record's own Tb.");
        if (volatilityClass_ == "volatile" && Tb_ <= 0.0)
            throw std::runtime_error("Component '" + name_ +
                "': volatility.class volatile without a component-level"
                " `Tb` -- a volatility claim must be falsifiable, and Tb is"
                " the datum that makes it so (declare `Tb <K>;` with its"
                " citation, or say `class decomposes` if it never boils)");
    }

    //  `noncondensable true;` -- a permanent gas.  A curated FACT, not an
    //  inference from Tc: the record states it, the GUI catalogue has read it
    //  for a long time, and now the property builder does too.
    if (d->found("noncondensable"))
        noncondensable_ = (d->lookupWord("noncondensable") == "true");

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
    //  THE VAPOUR-PRESSURE LAW (C398 slice (b)): the block holds one law
    //  (today's `model` shape) or several named laws with one `preferred`
    //  (RecordLaws.H).  The preferred law is built here; a case pin may
    //  replace it ONCE at package assembly (pinLaw).  A block of several laws
    //  has no legacy reading, so it must say which one is the record's.
    //  (needsVP without the block was refused above; a block on a
    //  non-volatile is permitted -- the unit tests use one; the runtime
    //  ignores it.)
    if (d->found("vaporPressure"))
    {
        auto blk = recordLaws::parse(d->subDict("vaporPressure"), "vaporPressure", name_,
                                     [](const std::string& w) { return VaporPressureModel::hasModel(w); });
        if (blk.preferred < 0)
            throw std::runtime_error("Component '" + name_ + "': vaporPressure holds "
                + std::to_string(blk.laws.size()) + " laws (" + blk.names() + ") and"
                " marks none `preferred` -- write `preferred <name>;` in the block: the"
                " record's one value of the property is a curation decision, never the"
                " order of the laws.");
        laws_["vaporPressure"] = blk;
        buildVP_(std::size_t(blk.preferred));
        lawChoice_["vaporPressure"] = { blk.laws[std::size_t(blk.preferred)].name,
            blk.laws[std::size_t(blk.preferred)].type,
            blk.laws.size() == 1 ? "the record's one law" : "the record's preferred law" };
    }

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

    //  K_b IS DERIVED, not read (AR3, ruled 2026-08-05).  Whatever the two
    //  blocks above supplied is demoted to an ANCHOR -- a measured value
    //  that validates the derivation -- and the derivation wins:
    //
    //        K_b = R * Tb^2 * M / dHvap(Tb)          [K.kg/mol]
    //
    //  R in J/(mol.K), Tb in K, MW in kg/kmol (== g/mol, hence /1000 to
    //  reach kg/mol), Hvap_Tb in J/mol.  The comment in `anchors{}` had
    //  named K_b a stored derivative for some time; nothing acted on it,
    //  and water.dat's rounded 0.512 sat 0.18 % from the 0.512942 its OWN
    //  Tb/MW/HvapTb imply.  That difference went straight into every
    //  evaporator's boiling-point elevation.
    //
    //  When the inputs are absent the declared value is USED and the run
    //  says so (K_b_derived() == false).  A record that supplies neither
    //  keeps K_b = 0, exactly as before.
    //  THE DERIVATION IS OPT-IN, and this cost one wrong answer to learn.
    //  Deriving whenever Tb/MW/Hvap exist means EVERY solvent acquires a
    //  boiling-point elevation -- including cases that deliberately model
    //  without one.  evaporator04 reproduces textbook Example 10.2 "without BPE",
    //  and its own record says so in words: "no K_b (BPE neglected)".  The
    //  first draft gave it BPE = 0.41 K and moved its area 4.75 %.  That is
    //  not a refined constant, it is a DIFFERENT MODEL.
    //
    //  An absent `K_b` is the author declaring "no BPE here", and an absence
    //  must keep meaning what it meant.  So the derivation replaces a
    //  DECLARED K_b -- fixing the stored-derivative sin where the number
    //  actually lives -- and invents nothing where none was declared.
    reviewStatus_ = d->lookupWordOrDefault("reviewStatus", "");
    reviewReason_ = d->lookupWordOrDefault("reviewReason", "");

    K_b_anchor_ = K_b_;
    if (K_b_anchor_ > 0.0 && Tb_ > 0.0 && MW_ > 0.0 && Hvap_Tb_ > 0.0)
    {
        K_b_ = constant::R * Tb_ * Tb_ * (MW_ / 1000.0) / Hvap_Tb_;
        K_b_derived_ = true;
    }

    //  THE DISSOLUTION HEAT of this substance's own solid, INDEPENDENT of
    //  which aqueous-bridge branch the record took above: a mineral whose
    //  bridge IS its dissolution and a salt that declares `dissociatesTo`
    //  both carry it, and the first draft read it inside the bridge's
    //  else-if -- so it was parsed for one kind of record and silently not
    //  for the other.
    //
    //  It is the SAME curated number the speciation solver reads for K(T)
    //  (calcite: -28078.8 J/mol, USGS PHREEQC).  One home.
    //
    //  SEVERAL phases with DIFFERENT dH leaves it ABSENT: polymorphs dissolve
    //  to the same ions but not with the same heat, and reading the first
    //  would let the order of the file decide the energy.
    if (d->found("solidPhases"))
    {
        auto spd = d->subDict("solidPhases");
        for (const auto& ph : spd->keys())
        {
            auto pd = spd->subDict(ph);
            if (!pd->found("equilibrium")) continue;
            auto eq = pd->subDict("equilibrium");
            if (eq->found("dH")) dHdissByPhase_[ph] = eq->lookupScalar("dH");
        }
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
                kvDeclared_ = cr->found("k_v");
                break;
            }
    }
    if (!hasSolid_ && d->found("solid"))   // flat solid{} fallback (physical solid)
    {
        auto sd = d->subDict("solid");
        hasSolid_ = true;
        rho_p_ = sd->lookupScalarOrDefault("rho_p", 0.0);
        k_v_   = sd->lookupScalarOrDefault("k_v", 0.5235987756);  // sphere
        kvDeclared_ = sd->found("k_v");
    }

    // Sublimation reference state (the solid-vapour P-T anchor): triple point +
    // the fusion/sublimation enthalpies of the Clausius-Clapeyron lines.  Parsed
    // after solid{}; ABSENT leaves every field 0 and hasSublimation_ false, i.e.
    // exactly today's behaviour (the P-T diagram stays L-V + critical only).
    // The triple point is an intrinsic property in its OWN block -- NOT a
    // sublimation correlation: `triplePoint { T; P; }`.
    if (d->found("triplePoint"))
    {
        auto tp = d->subDict("triplePoint");
        subTripleT_ = tp->lookupScalarOrDefault("T", 0.0);
        subTripleP_ = tp->lookupScalarOrDefault("P", 0.0);
    }
    //  `VliqT` below the triple point is a volume of no stable liquid (C378,
    //  review VT-02): refused when the record declares `triplePoint.T`.
    if (hasVliqT_ && subTripleT_ > 0.0 && VliqT_ < subTripleT_)
        throw std::runtime_error("component '" + name_ + "': `VliqT` fails"
            " its lower bound: " + std::to_string(VliqT_) + " K is below the"
            " record's triple point `triplePoint.T` = "
            + std::to_string(subTripleT_) + " K, where no stable liquid"
            " exists.  State the temperature the measured volume was taken at.");
    // The sublimation-curve inputs (fusion / sublimation latent heats); a REAL
    // sublimation-pressure correlation, when one exists, is its own block.
    if (d->found("sublimation"))
    {
        auto sb = d->subDict("sublimation");
        hasSublimation_ = true;
        subHfus_    = sb->lookupScalarOrDefault("Hfus", 0.0);
        subHsub_    = sb->lookupScalarOrDefault("Hsub", 0.0);
    }

    //  K_f, by the condition its own header set: a cited Hfus and a consumer.
    //  Same shape as K_b -- the derivation replaces a DECLARED value and
    //  invents nothing where none was declared.
    //
    //  IT MUST SIT AFTER THE `sublimation {}` PARSE, and the first draft did
    //  not: placed beside K_b's derivation it read subHfus_ = 0 and the
    //  condition was never true, so the promotion would have been a no-op
    //  that looked like working code.
    K_f_anchor_ = K_f_;
    if (K_f_anchor_ > 0.0 && subTripleT_ > 0.0 && MW_ > 0.0 && subHfus_ > 0.0)
    {
        K_f_ = constant::R * subTripleT_ * subTripleT_
             * (MW_ / 1000.0) / subHfus_;
        K_f_derived_ = true;
    }

    if (d->found("sorption"))
    {
        auto sd = d->subDict("sorption");
        hasSorption_ = true;
        //  GAB: all three parameters are REQUIRED.  A missing C or K used to
        //  read as 0 and give X_eq = 0 at exit 0 (review SP-04).
        for (const char* key : {"Xm", "C", "K"})
            if (!sd->found(key))
                throw std::runtime_error("component '" + name_ + "': the"
                    " `sorption {}` block (GAB water-sorption isotherm) does"
                    " not declare `" + std::string(key) + "`.  The isotherm"
                    " needs Xm (monolayer moisture, kg/kg), C (energy constant)"
                    " and K (multilayer factor), all three, from a measured"
                    " isotherm of THIS material; none is assumed.  Declare it in"
                    " the component record or in the case's constant/components/"
                    + name_ + ".");
        sorpXm_ = sd->lookupScalar("Xm");
        sorpC_  = sd->lookupScalar("C");
        sorpK_  = sd->lookupScalar("K");
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

    //  STAMP THE OWNER so a Cp warning can name its component.
    //
    //  `PolynomialCp` has always read an `owner` key for its announcements,
    //  and NOTHING EVER SET ONE -- no record declares it and no caller
    //  injected it, so every validity-window message this engine has printed
    //  said "polynomial Cp declares ..." with no subject.  In a flowsheet of
    //  twenty components that is a warning the reader cannot act on, which is
    //  most of the way to no warning at all.
    //
    //  The name is known HERE and nowhere below, so here is where it attaches
    //  (buildCp_ stamps it into the chosen law's dictionary).
    //
    //  THE HEAT-CAPACITY LAWS (C398 slice (b)): each block holds one law
    //  (today's shape) or several named laws with one `preferred`.  The
    //  ideal-gas law is read first because a corresponding-states liquid law
    //  (RowlinsonBondi) consumes it (SL-05: the PREFERRED ideal-gas law, or
    //  the case's pin, is the one injected, and the view prints which).  The
    //  objects are still built liquid first, as before, so construction
    //  order changes nothing that was built.
    for (const char* key : { "idealGasHeatCapacity", "liquidHeatCapacity", "solidHeatCapacity" })
    {
        if (!d->found(key)) continue;
        auto blk = recordLaws::parse(d->subDict(key), key, name_,
                                     [](const std::string& w) { return HeatCapacityModel::hasModel(w); });
        if (blk.preferred < 0)
            throw std::runtime_error("Component '" + name_ + "': " + key + " holds "
                + std::to_string(blk.laws.size()) + " laws (" + blk.names() + ") and"
                " marks none `preferred` -- write `preferred <name>;` in the block.");
        laws_[key] = blk;
        lawChoice_[key] = { blk.laws[std::size_t(blk.preferred)].name,
            blk.laws[std::size_t(blk.preferred)].type,
            blk.laws.size() == 1 ? "the record's one law" : "the record's preferred law" };
    }
    for (const char* key : { "liquidHeatCapacity", "idealGasHeatCapacity", "solidHeatCapacity" })
        if (laws_.count(key))
            buildCp_(key, std::size_t(laws_.at(key).preferred));

    // ---- Optional Gibbs-formation block (consumed by the Gibbs reactor) ----
    // standardThermochemistry
    // {
    //     dHf_298    -241830;         // J/mol, on the referenceState below
    //     s_298         188.83;       // J/(mol·K), third-law absolute
    //     referenceState  idealGas;   // OPTIONAL.  Standard state the values
    //                                 // are tabulated on.  Defaults to
    //                                 // idealGas (the NIST / JANAF
    //                                 // convention).  pureLiquid for data
    //                                 // tabulated in liquid form; pureSolid
    //                                 // for crystalline nonvolatiles
    //                                 // (sucrose) whose Hf cannot be
    //                                 // referenced to gas because the
    //                                 // compound never vaporises.
    // }
    // dHf_298 (formation), s_298 (ABSOLUTE third-law entropy), dGf_298 (optional --
    // formation Gibbs, used for validation; the engine derives G from dHf + s + the
    // elemental standard entropies).  The `referenceState` names the thermodynamic
    // STANDARD STATE the values are on (not merely the physical phase): idealGas
    // (298.15 K, 1 bar -- the default, at 1 bar), pureLiquid, pureSolid.
    if (d->found("standardThermochemistry"))
    {
        auto g = d->subDict("standardThermochemistry");
        Hf298_         = g->lookupScalar("dHf_298");
        S298_          = g->lookupScalar("s_298");
        const std::string ref = g->lookupWordOrDefault("referenceState", "idealGas");
        refStateWord_ = ref;
        if      (ref == "idealGas")   naturalPhase_ = "gas";
        else if (ref == "pureLiquid") naturalPhase_ = "liquid";
        else if (ref == "pureSolid")  naturalPhase_ = "solid";
        else throw std::runtime_error("Component '" + name_ +
                "': standardThermochemistry.referenceState must be idealGas / "
                "pureLiquid / pureSolid, got '" + ref + "'");
        hasGibbsData_  = true;
        rungs_[ref] = { Hf298_, S298_ };

        //  ---- ADDITIONAL RUNGS (2026-08-07) ---------------------------------
        //  A substance has ONE standard state per phase, and there is nothing
        //  odd about a record knowing more than one of them.  Water is the
        //  case that forced it: `water.dat` carries only the IDEAL-GAS datum,
        //  so an aqueous reaction wanting the LIQUID one has nowhere to read
        //  it, and `water-dissociation` derives logK25 -12.4986 against a
        //  stored -14 -- a factor of 32 in K, from reading the right number
        //  off the wrong rung.  Twelve of the seventy-seven chemistry records
        //  are blocked by exactly that.
        //
        //  The grammar is the tree's existing named-sub-block shape (as
        //  `solidPhases { calcite {...} }` and `cosmo { VT2005 {...} }` are),
        //  so nothing already written changes:
        //
        //      standardThermochemistry
        //      {
        //          dHf_298  -241826.0;      // the DECLARED referenceState
        //          s_298     188.834;
        //          referenceState idealGas;
        //          pureLiquid { dHf_298 -285830.0; s_298 69.95; source "..."; }
        //      }
        //
        //  ARITY: each rung's pair has exactly ONE home.  A sub-block naming
        //  the SAME rung as the top level is a second home for one fact and is
        //  refused, rather than silently preferred in one direction.
        for (const char* r : { "idealGas", "pureLiquid", "pureSolid" })
        {
            if (!g->found(r)) continue;
            if (std::string(r) == ref)
                throw std::runtime_error("Component '" + name_ +
                    "': standardThermochemistry declares referenceState " + ref +
                    " AND a `" + r + "{}` sub-block -- that is two homes for one"
                    " datum.  Put the values at the top level (they are the"
                    " declared rung) or change referenceState.");
            auto rd = g->subDict(r);
            rungs_[r] = { rd->lookupScalar("dHf_298"), rd->lookupScalar("s_298") };
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
    // ---- Declared elemental composition (optional; REFUSED loudly when
    //      malformed -- a case-local block can never bypass curation) -------
    if (d->found("elementalComposition"))
    {
        auto ec = d->subDict("elementalComposition");
        auto fail = [&](const std::string& why) -> void
        {
            throw std::runtime_error("component '" + name_
                + "' elementalComposition{}: " + why);
        };
        const std::string basis = ec->lookupWordOrDefault("basis", "");
        if (basis == "massFraction")
        {
            elementalDecl_.basis = ElementalDeclaration::Basis::massFraction;
            if (!ec->found("massFractions"))
                fail("basis massFraction requires a massFractions{} block");
            auto mf = ec->subDict("massFractions");
            if (mf->keys().empty())
                fail("massFractions{} is empty");
            scalar sum = 0.0;
            for (const auto& sym : mf->keys())
            {
                if (atomicWeight(sym) <= 0.0)
                    fail("'" + sym + "' is not an element");
                const scalar w = mf->lookupScalar(sym);
                if (!std::isfinite(w) || w < 0.0)
                    fail("massFractions." + sym
                         + " must be finite and >= 0");
                elementalDecl_.massFractions[sym] = w;
                sum += w;
            }
            // MANDATORY even when zero -- absence is a refusal, never a
            // default, and the remainder is never a pseudo-element.
            if (!ec->found("unaccountedMassFraction"))
                fail("unaccountedMassFraction is MANDATORY in basis"
                     " massFraction (declare 0.0 explicitly)");
            const scalar un = ec->lookupScalar("unaccountedMassFraction");
            if (!std::isfinite(un) || un < 0.0)
                fail("unaccountedMassFraction must be finite and >= 0");
            elementalDecl_.unaccountedMassFraction = un;
            if (std::abs(sum + un - 1.0) > kTolMassFraction)
                fail("Sum(massFractions) + unaccountedMassFraction = "
                     + std::to_string(sum + un) + " != 1 (tolerance "
                     + std::to_string(kTolMassFraction) + " kg/kg)");
        }
        else if (basis == "formulaUnit")
        {
            elementalDecl_.basis = ElementalDeclaration::Basis::formulaUnit;
            if (ec->found("unaccountedMassFraction"))
                fail("unaccountedMassFraction has no meaning in basis"
                     " formulaUnit -- FORBIDDEN");
            if (!ec->found("atomCounts"))
                fail("basis formulaUnit requires an atomCounts{} block");
            auto ac = ec->subDict("atomCounts");
            if (ac->keys().empty())
                fail("atomCounts{} is empty");
            scalar mwSum = 0.0;
            for (const auto& sym : ac->keys())
            {
                const scalar aw = atomicWeight(sym);
                if (aw <= 0.0) fail("'" + sym + "' is not an element");
                const scalar n = ac->lookupScalar(sym);
                if (!std::isfinite(n) || n <= 0.0)
                    fail("atomCounts." + sym + " must be finite and > 0");
                elementalDecl_.atomCounts[sym] = n;
                mwSum += n * aw;
            }
            // The unit is only legal when MW IS that unit's molar mass.
            if (MW_ <= 0.0
                || std::abs(mwSum - MW_) / MW_ > kTolMWRel)
                fail("Sum(atomCounts * atomicWeight) = "
                     + std::to_string(mwSum) + " kg/kmol does not reproduce"
                     " MW = " + std::to_string(MW_) + " (tolerance "
                     + std::to_string(kTolMWRel * 100.0)
                     + " % -- a chain-average MW must use basis"
                     " massFraction)");
        }
        else
            fail("basis must be massFraction or formulaUnit (got '"
                 + basis + "')");

        // Provenance is a DATA/VALIDATION gate (it never alters atoms):
        // the block demands provenance.elementalComposition with an
        // attributed origin and a non-empty method.
        bool provOk = false;
        if (d->found("provenance"))
        {
            auto pv = d->subDict("provenance");
            if (pv->found("elementalComposition"))
            {
                auto pe = pv->subDict("elementalComposition");
                const std::string org =
                    pe->lookupWordOrDefault("origin", "unattributed");
                const std::string method =
                    pe->lookupWordOrDefault("method", "");
                // Normalise through the canonical Origin vocabulary: a typo
                // ("literatre") folds to unattributed and REFUSES -- the
                // raw string comparison would bless any garbage word.
                provOk = (originFromWord(org) != Origin::unattributed)
                       && !method.empty();
            }
        }
        if (!provOk)
            fail("provenance.elementalComposition{} with an attributed"
                 " origin and a non-empty method is REQUIRED (the"
                 " composition is a curated datum, never anonymous)");
    }

    if (d->found("provenance"))
    {
        auto p = d->subDict("provenance");
        //  PER-LAW PROVENANCE (C398 slice (b)): for a property block of
        //  several named laws, its provenance entry holds one sub-entry per
        //  law, named as the law: `provenance { liquidViscosity { vogel {
        //  origin ...; } } }`.  Each is filed as "<property>/<law>", and the
        //  property's own entry is the CHOSEN law's (the preferred one; a pin
        //  re-files it, pinLaw).  An entry with its own `origin` is today's
        //  per-property shape, read unchanged.
        std::vector<std::pair<std::string, DictPtr>> entries;
        for (const auto& k : p->keys())
        {
            const auto& ev = p->entryValue(k);
            DictPtr blk = d->found(k) && std::holds_alternative<DictPtr>(d->entryValue(k))
                        ? d->subDict(k) : nullptr;
            if (std::holds_alternative<DictPtr>(ev) && blk
                && !std::get<DictPtr>(ev)->found("origin"))
            {
                bool perLaw = false;
                for (const auto& lk : std::get<DictPtr>(ev)->keys())
                    if (blk->found(lk) && std::holds_alternative<DictPtr>(blk->entryValue(lk))
                        && std::holds_alternative<DictPtr>(std::get<DictPtr>(ev)->entryValue(lk)))
                    {
                        perLaw = true;
                        entries.push_back({ k + "/" + lk, std::get<DictPtr>(ev)->subDict(lk) });
                    }
                if (perLaw)
                {
                    std::string chosen = blk->lookupWordOrDefault("preferred", "");
                    if (lawChoice_.count(k)) chosen = lawChoice_.at(k).law;
                    if (!chosen.empty() && std::get<DictPtr>(ev)->found(chosen))
                        entries.push_back({ k, std::get<DictPtr>(ev)->subDict(chosen) });
                    continue;
                }
            }
            entries.push_back({ k, std::holds_alternative<DictPtr>(ev) ? std::get<DictPtr>(ev) : nullptr });
        }
        for (const auto& [k, entryDict] : entries)
        {
            OriginInfo oi;
            if (entryDict)
            {
                auto sub = entryDict;
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
            else if (p->found(k) && std::holds_alternative<std::string>(p->entryValue(k)))
            {
                oi.raw = std::get<std::string>(p->entryValue(k));
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

    // PC-SAFT segment parameters (intrinsic): `pcsaft { m; sigma; epsilonK; }`.
    // Read by the PCSAFT EoS -- ONE home, never re-declared per case.
    if (d->found("pcsaft"))
    {
        auto pc = d->subDict("pcsaft");
        pcM_     = pc->lookupScalarOrDefault("m", 0.0);
        pcSigma_ = pc->lookupScalarOrDefault("sigma", 0.0);
        pcEpsK_  = pc->lookupScalarOrDefault("epsilonK", 0.0);

        // Association trio (Wertheim TPT1): assocScheme + epsAB_K + kappaAB.
        // All three or none -- a record carrying only part of the trio is a
        // curation error, refused HERE at load (a partial set silently read
        // as non-associating would run wrong thermo with no announcement).
        pcAssocScheme_ = pc->lookupWordOrDefault("assocScheme", "");
        pcEpsAB_       = pc->lookupScalarOrDefault("epsAB_K", 0.0);
        pcKappaAB_     = pc->lookupScalarOrDefault("kappaAB", 0.0);
        const bool any = !pcAssocScheme_.empty()
                      || pcEpsAB_ > 0.0 || pcKappaAB_ > 0.0;
        if (any && (pcAssocScheme_.empty() || pcEpsAB_ <= 0.0
                    || pcKappaAB_ <= 0.0))
            throw std::runtime_error("Component '" + name_ + "': the pcsaft"
                " association trio is PARTIAL -- `assocScheme` (2B|4C),"
                " `epsAB_K` [K] and `kappaAB` [-] must all be declared"
                " together (or none, for a non-associating fluid).  Curate"
                " the missing value(s) from the primary source.");
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
            cs.model   = s->lookupWordOrDefault("model", "COSMOSAC");
            cs.variant = s->lookupWordOrDefault("variant", "2002");
            cs.source  = s->lookupWordOrDefault("source", "undeclared");
            cs.protocol = s->lookupWordOrDefault("protocol", "");
            cs.area    = s->lookupScalarOrDefault("area", 0.0);
            cs.volume  = s->lookupScalarOrDefault("volume", 0.0);
            if (s->found("sigmaProfile"))
                cs.sigmaProfile = s->lookupList("sigmaProfile");
            // LICENCE SEPARATION (VT-2005 scrub, 2026-07-26): a set marked `installed
            // false;` ships as an external REFERENCE (no unconfirmed values).
            // The user's own copy, installed by bin/choupo-import-cosmo,
            // lives in data/local/cosmo/<set>/<component>.dat (gitignored)
            // and is loaded here when present.  Absent -> the set stays
            // profile-less and the CosmoSac model refuses BY NAME at use.
            if (s->lookupWordOrDefault("installed", "true") == "false"
                && cs.sigmaProfile.empty())
            {
                namespace fs = std::filesystem;
                const fs::path lp = fs::path(Database::currentRoot())
                    / "local" / "cosmo" / setName / (name_ + ".dat");
                if (fs::exists(lp))
                {
                    auto ld = Dictionary::fromFile(lp.string());
                    cs.area   = ld->lookupScalar("area");
                    cs.volume = ld->lookupScalar("volume");
                    cs.sigmaProfile = ld->lookupList("sigmaProfile");
                    cs.source += "  [local install: data/local/cosmo/"
                               + setName + "/" + name_ + ".dat -- UNVERIFIED]";
                }
            }
            cosmoSets_[setName] = std::move(cs);
        }
    }

    // Relative permittivity (dielectric constant) -- used by the mixed-solvent
    // electrolyte activity (eNRTL) for the drowning-out / Born effect.  Optional.
    relPermittivity_ = d->lookupScalarOrDefault("relativePermittivity", 0.0);

    // Salt dissociation map for the electrolyte activity model.  cation/anion are
    // ion NAMES into species/<name>.dat + parameters/Pitzer/; solubility is the
    // salt's measured saturation molality.  INTRINSIC salt chemistry, declared ONCE
    // here -- called by name, never re-typed per case.
    // Ion decomposition for electrolyte-aware unit ops (DSPM-DE membrane): derive
    // cation/anion from `dissociatesTo` (the formula-like ion stoichiometry) by
    // charge sign, resolved through species/aqueous.  (The old `electrolyte{}`
    // block is gone; dHsoln/solubility live in the salt's own
    // solidPhases.<phase>.calorimetric block, read via the model.)
    if (d->found("dissociatesTo"))
    {
        auto d2t = d->subDict("dissociatesTo");
        try
        {
            for (const auto& ion : d2t->keys())
            {
                const int z = electrolyte::ionCharge(SpeciesId(ion));
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
// back to Cp_liquid -- legacy-identical); and the solid<->liquid legs apply
// the genuine enthalpy of fusion (subHfus_) for a MELTING solid, while a
// DISSOLVED solute keeps Hfus ~ 0 (it goes into solution, never melts).
// ONE thermochemical definition per substance -- every phase enthalpy is a
// consistent VIEW of the record's single datum plus its declared transition
// data, never a separately curated route; a leg whose transition datum is
// absent REFUSES naming the remedy (R-E3/R-E4,
// docs/design/tp-stream-energy-coherence.md).
scalar Component::h_formation(scalar T, const std::string& targetPhase) const
{
    if (!hasGibbsData_)
        throw std::runtime_error("Component '" + name_ +
            "': h_formation needs standardThermochemistry block in .dat");

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
        //  ANNOUNCED, never silent: for an electrolyte solute the liquid
        //  block can be the aqueous APPARENT-MOLAL Cp -- possibly negative
        //  -- so a crystal duty priced through it can be wrong in sign at
        //  exit 0.  ANY record without the block reaches it, curated pureSolid
        //  ones included (several lack it; no count is kept here -- list them
        //  with docs/reviews/2026-11-12-solid-properties/solid_catalogue_census.py).
        //  Its announced sibling was 200 lines away in this same file.
        if (AdvisoryLog::instance().add("thermo", "warning",
                "solidEnthalpy " + name_,
                "no solidHeatCapacity: the solid sensible leg integrates the"
                " LIQUID Cp (the historical Cp_solid ~ Cp_liquid"
                " approximation).  For a solute whose liquid block is the"
                " aqueous apparent-molal Cp this can be wrong in magnitude"
                " and sign -- add a solidHeatCapacity{} block."))
            std::cerr << "[thermo] " << name_ << ": no solidHeatCapacity --"
                         " solid sensible leg uses the ANNOUNCED Cp_liquid"
                         " fallback\n";
        return cpLiqIntegral(Tend);
    };

    // Hvap_latent at 298 K (when needed).  Sucrose-like solids never need
    // it (they never go through a gas leg); volatile species always have it.
    auto hvap298 = [&]() -> scalar { return datumBridge298().H; };

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
    if (naturalPhase_ == "gas" && targetPhase == "solid")
    {
        // Gas-natural -> solid VIEW of the one datum (R-E4,
        // docs/design/tp-stream-energy-coherence.md): condense (-Hvap) and
        // freeze (-Hfus) at 298 K, then integrate Cp_solid up to T.  The
        // fusion heat is DECLARED transition data, never manufactured: a
        // record without it has no crossing here, and a silent Hfus = 0
        // would omit the whole duty of a freezer.
        if (subHfus_ <= 0.0)
            throw std::runtime_error("Component '" + name_ +
                "': h_formation gas-natural -> solid needs the enthalpy of"
                " fusion -- declare sublimation { Hfus <J/mol>; } (with a"
                " citation) in the component .dat");
        return Hf298_ - hvap298() - subHfus_ + cpSolidIntegral(T);
    }
    if (naturalPhase_ == "liquid" && targetPhase == "solid")
    {
        // Mirror of the solid -> liquid leg above, SAME (b)-discriminator:
        // a record that opts into melting data (real solidHeatCapacity{}
        // AND real Hfus) freezes at 298 K and integrates the solid Cp; a
        // record declaring neither keeps the legacy dissolved-solute
        // reading byte-identically -- an absence keeps meaning what it
        // meant (R-E4).
        const bool meltingSolid = (cpSolid_ != nullptr) && (subHfus_ > 0.0);
        if (meltingSolid)
            return Hf298_ - subHfus_ + cpSolidIntegral(T);    // freezes: -Hfus
        return Hf298_ + cpLiqIntegral(T);                     // dissolved: Hfus ≈ 0
    }

    throw std::runtime_error("Component '" + name_ +
        "': unhandled phase combination natural='" + naturalPhase_
        + "', target='" + targetPhase + "'");
}

//  The ENTROPY crossing -- h_formation's missing companion.
//
//  Written 2026-08-07, after check_record_form caught a second formation
//  datum being stored on water.dat.  The datum was not missing; the PATH to
//  it was.  Enthalpy had a crossing (Watson Hvap) and entropy had none, so
//  anything needing a standard-state POTENTIAL on a phase other than the
//  record's own had nowhere to go.
scalar Component::s_formation(scalar T_K, const std::string& targetPhase) const
{
    if (!hasGibbsData_)
        throw std::runtime_error("Component '" + name_ +
            "': s_formation needs a standardThermochemistry block");

    auto sLiqIntegral = [&](scalar Tend) -> scalar {
        if (!cpLiq_)
            throw std::runtime_error("Component '" + name_ +
                "': s_formation liquid leg needs liquidHeatCapacity");
        return cpLiq_->S(Tend, 298.15);
    };
    auto sGasIntegral = [&](scalar Tend) -> scalar {
        if (!cpGas_)
            throw std::runtime_error("Component '" + name_ +
                "': s_formation gas leg needs idealGasHeatCapacity");
        return cpGas_->S(Tend, 298.15);
    };
    auto sSolidIntegral = [&](scalar Tend) -> scalar {
        if (cpSolid_) return cpSolid_->S(Tend, 298.15);
        return sLiqIntegral(Tend);            // the same legacy fallback as h
    };

    //  dS of vaporisation at 298 K.  NOT Hvap/T -- see the header: the two
    //  standard states are not in equilibrium there, so the transfer does
    //  work against the pressure difference and the Gibbs term must be
    //  carried explicitly.
    auto sVap298 = [&]() -> scalar {
        if (!vp_)
            throw std::runtime_error("Component '" + name_ +
                "': s_formation crosses a vaporisation leg, which needs a"
                " vaporPressure model -- a nonvolatile has no such leg and"
                " must be asked for its own phase instead.");
        const scalar Psat = datumBridge298().pRefPa;   // = Psat unless associated
        if (!(Psat > 0.0))
            throw std::runtime_error("Component '" + name_ +
                "': non-positive Psat(298.15 K); the vaporisation entropy"
                " leg cannot be taken.");
        const scalar dG = -constant::R * 298.15
                        * std::log(Psat / constant::Pref);
        return (datumBridge298().H - dG) / 298.15;
    };

    if (naturalPhase_ == targetPhase)
    {
        if (naturalPhase_ == "gas")    return S298_ + sGasIntegral(T_K);
        if (naturalPhase_ == "liquid") return S298_ + sLiqIntegral(T_K);
        if (naturalPhase_ == "solid")  return S298_ + sSolidIntegral(T_K);
    }
    if (naturalPhase_ == "gas" && targetPhase == "liquid")
        return S298_ - sVap298() + sLiqIntegral(T_K);
    if (naturalPhase_ == "liquid" && targetPhase == "gas")
        return S298_ + sVap298() + sGasIntegral(T_K);
    //  Solid <-> liquid mirrors h_formation's DISSOLVED default: a solute
    //  goes into solution rather than melting, so no fusion entropy is
    //  released.  A record that opts in to real melting (a solid Cp AND a
    //  fusion enthalpy) gets the fusion term at 298 K.
    if (naturalPhase_ == "solid" && targetPhase == "liquid")
    {
        const bool melting = (cpSolid_ != nullptr) && (subHfus_ > 0.0);
        return S298_ + (melting ? subHfus_ / 298.15 : 0.0) + sLiqIntegral(T_K);
    }
    if (naturalPhase_ == "liquid" && targetPhase == "solid")
        return S298_ + sLiqIntegral(T_K);
    if (naturalPhase_ == "solid" && targetPhase == "gas")
        throw std::runtime_error("Component '" + name_ +
            "': s_formation solid -> gas (sublimation) is not modelled, as in"
            " h_formation");

    throw std::runtime_error("Component '" + name_ +
        "': s_formation unhandled phase combination natural='" + naturalPhase_
        + "', target='" + targetPhase + "'");
}

scalar Component::g_formation(scalar T_K, const std::string& targetPhase) const
{
    return h_formation(T_K, targetPhase) - T_K * s_formation(T_K, targetPhase);
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

const Component::DatumBridge298& Component::datumBridge298() const
{
    if (bridgeResolved_) return bridge_;
    bridge_.H = Hvap_latent(298.15);
    bridge_.pRefPa = vp_ ? vp().Psat_Pa(298.15) : 0.0;
    bridge_.associated = false;
    if (vp_ && bridge_.pRefPa > 0.0 && !formula_.empty())
    {
        if (auto dim = vapourAssociation::find(formula_))
        {
            //  THE BRIDGE IS THE ARITHMETIC THE ENGINE WILL UNDO (DEV.md 4c
            //  C201 item 3).  The record's HvapTb is the APPARENT heat
            //  measured at Tb, to a vapour that is mostly dimer.  It is put on
            //  the MONOMER basis where it was measured (Tb, at Psat(Tb), the
            //  same saturated-vapour split the vapour model uses), and the
            //  monomer heat is carried to 298.15 K by KIRCHHOFF on this
            //  record's OWN heat capacities -- the very Cp_ig and liquid Cp
            //  the package prices the two phases with, called here, never
            //  re-transcribed.  So the latent heat the package prices at Tb
            //  is the record's HvapTb by construction: one surface, one
            //  arithmetic.  Watson was tried first and rejected on
            //  measurement: on the apparent heat it gave a bridge of 56.7
            //  kJ/mol (NBS 52.25) and 29.3 at Tb (24.38); on the monomer 54.6
            //  and 27.15 -- an empirical slope the package's own Cp's then
            //  contradict.  A record with no liquid Cp keeps Watson on the
            //  monomer, ANNOUNCED, because there is no Cp to integrate.
            const scalar atm = 101325.0;
            const auto svTb = vapourAssociation::saturated(
                *dim, Tb_, vp().Psat_Pa(Tb_) / atm);
            const scalar assocTb = -dim->dH * svTb.xi;
            const scalar hMonoTb = Hvap_Tb_ + assocTb;
            const bool kirchhoff = hasCpLiquid() && hasCpIdealGas();
            scalar hMono298 = 0.0;
            std::string rule;
            if (kirchhoff)
            {
                const scalar dCpInt = cpIdealGas().H(Tb_, 298.15)
                                    - cpLiquid().H(Tb_, 298.15);
                hMono298 = hMonoTb - dCpInt;
                rule = "Kirchhoff on the record's own Cp_ig and liquid Cp"
                       " (Tb -> 298.15 K adds " + std::to_string(-dCpInt / 1000.0)
                       + " kJ/mol)";
            }
            else
            {
                hMono298 = (298.15 >= Tc_) ? 0.0
                    : hMonoTb * std::pow((Tc_ - 298.15) / (Tc_ - Tb_), 0.38);
                rule = "Watson on the monomer (exponent 0.38): the record"
                       " carries no liquid or ideal-gas heat capacity to"
                       " integrate, so the latent heat priced at Tb will not"
                       " equal HvapTb";
            }
            const auto sv = vapourAssociation::saturated(*dim, 298.15,
                                                         bridge_.pRefPa / atm);
            bridge_.H = hMono298;
            bridge_.pRefPa = sv.pMonoAtm * atm;
            bridge_.associated = true;
            const std::string msg = "liquid bridged to the datum's ideal-gas"
                " MONOMER: Hvap_mono(Tb = " + std::to_string(Tb_)
                + " K) = apparent " + std::to_string(Hvap_Tb_ / 1000.0)
                + " + dimer dissociation " + std::to_string(assocTb / 1000.0)
                + " (xi = " + std::to_string(svTb.xi)
                + " dimer per mol vaporised) = " + std::to_string(hMonoTb / 1000.0)
                + " kJ/mol; carried to 298.15 K by " + rule + " = "
                + std::to_string(bridge_.H / 1000.0)
                + " kJ/mol  (from " + dim->record
                + ", source: " + dim->source + ")";
            if (AdvisoryLog::instance().add("thermo", "info",
                    "datumBridge " + name_, msg))
                std::cerr << "[thermo] " << name_ << ": " << msg << "\n";
        }
    }
    bridgeResolved_ = true;
    return bridge_;
}

void Component::requireWatsonSlopeLiquidFallback(const char* leg) const
{
    //  THE ONE HOME of "may this component's LIQUID leg fall back to the
    //  Watson-slope form h_ig - Hvap(T)?" (DEV.md 4c C162).  Both liquid legs
    //  call it before they take the fallback: `Hliq_pure` below (the SENSIBLE
    //  leg) and `ThermoPackage::speciesPhaseEnthalpy` (the FORMATION-DATUM
    //  leg, which the energy report and every `flashState::priceState` unit
    //  price on since DEV.md 4c C65).  Until 2026-10-25 only the sensible leg
    //  refused; the formation leg announced the fallback for a nonvolatile
    //  and went on -- one decision with two homes, the settled rule enforced
    //  on the leg the main path does NOT use.  Why each refusal exists is
    //  written at the call site in `Hliq_pure`.
    if (isNonvolatile())
        throw std::runtime_error("Component '" + name_ +
            "': liquidHeatCapacity missing, and this component is declared"
            " `role nonvolatile;` -- the ideal-gas fallback the engine uses"
            " for a dissolved permanent gas is FORBIDDEN here (a"
            " nonvolatile's enthalpy must not route through the ideal-gas"
            " reference).  Give it a liquidHeatCapacity block, or price it"
            " on the solid/aqueous rung.  (Refused on the " + leg +
            " liquid leg.)");

    if (!cpGas_)
        throw std::runtime_error("Component '" + name_ +
            "': liquidHeatCapacity missing — required for enthalpy, and"
            " there is no idealGasHeatCapacity to fall back on either, so"
            " no rung can be integrated.  Add one of the two blocks."
            "  (Refused on the " + leg + " liquid leg.)");
}

scalar Component::Hliq_pure(scalar T, scalar Tref) const
{
    if (!cpLiq_)
    {
        //  THE SAME ANSWER THE OTHER LEG ALREADY GAVE.
        //
        //  ThermoPackage::speciesPhaseEnthalpy has handled this case since the
        //  formation-datum leg was written: a permanent or supercritical gas
        //  (H2, N2) appearing as a DISSOLVED TRACE in a liquid stream has no
        //  pure-liquid rung to integrate, so the liquid leg falls back to
        //  h_ig - dHvap(T) and says so.  This leg refused instead, and the
        //  disagreement was invisible until a flowsheet used both: the acetone
        //  plant's column converged and then refused to price its condenser
        //  over a hydrogen mole fraction of order 1e-9, in a run whose own log
        //  had already announced the fallback for the very same component.
        //
        //  Above Tc the Watson latent heat is zero, so this returns the
        //  ideal-gas sensible enthalpy -- a dissolved permanent gas carrying
        //  its gas-phase enthalpy, i.e. zero heat of solution.  That is the
        //  zero-order approximation, it is the one the other leg already
        //  makes, and the honest home for both remains the dissolved-gas
        //  HENRY rung named in ThermoPackage.cpp.  What changed is that the
        //  engine now gives ONE answer rather than two.
        //
        //  TWO CASES KEEP THE REFUSAL, and neither is a technicality:
        //
        //  (1) A NONVOLATILE.  "A nonvolatile salt must NEVER route its
        //      enthalpy through the ideal-gas reference" is settled doctrine
        //      (2026-06-29); a dissolved salt takes the solid/aqueous rung and
        //      has no vaporisation leg to subtract.  Falling back here would
        //      hand it exactly the reference the doctrine forbids.
        //  (2) NO IDEAL-GAS Cp EITHER.  Then there is nothing to integrate on
        //      any rung, and the remedy is data, not a branch.
        //
        //  Both refusals live in ONE home, `requireWatsonSlopeLiquidFallback`
        //  above, which the formation-datum leg calls too (DEV.md 4c C162).
        requireWatsonSlopeLiquidFallback("sensible");

        //  DEDUP THROUGH THE SINK, not through a flag on this object -- and
        //  the first version got that wrong in a way worth keeping.  A
        //  `mutable bool` here announced FOUR times for one component,
        //  because the package copies its Components and each copy carried a
        //  fresh flag.  AdvisoryLog::add() already dedups process-wide and
        //  returns whether the entry was new, which is exactly the question,
        //  so the log line rides on it.  That is also what the formation-datum
        //  leg does: fixing a decision with two homes by adding a second
        //  announce-once mechanism would have been the same defect again.
        if (AdvisoryLog::instance().add("thermo", "warning",
                "liquidEnthalpy " + name_,
                "no liquidHeatCapacity: the SENSIBLE liquid leg falls back to"
                " the Watson-slope form h_ig - Hvap(T), the same fallback the"
                " formation-datum leg already used (a dissolved-gas Henry rung"
                " is the honest future home)"))
            std::cerr << "[thermo] " << name_ << ": no liquidHeatCapacity --"
                         " sensible liquid leg uses the ANNOUNCED Watson-slope"
                         " fallback\n";
        return cpIdealGas().H(T, Tref) - Hvap_latent(T);
    }
    return cpLiq_->H(T, Tref);
}

scalar Component::Hvap_pure(scalar T, scalar Tref) const
{
    return Hliq_pure(T, Tref) + Hvap_latent(T);
}

//  A rung is not a preference -- it is what the tabulated numbers MEAN.
//
//  h_pure_ig / s_pure_ig read Hf298_ and S298_ straight off the record and
//  integrate the ideal-gas Cp on top.  That is only arithmetic if the record's
//  datum is on the ideal-gas rung.  When it declares `pureSolid` or
//  `pureLiquid`, the same arithmetic returns a number wrong by a heat of
//  sublimation or vaporisation -- silently, with the right sign and a
//  plausible magnitude, which is the worst way to be wrong.
//
//  The refusal exists because the OLD one pointed the wrong way.  A pureSolid
//  record without an `idealGasHeatCapacity{}` block used to fail with "needs
//  idealGasHeatCapacity block in .dat" -- advice which, if followed, produces
//  exactly the silent error above.  Measured 2026-08-06: 18 catalogue records
//  declare a non-gas rung and none carries a gas Cp, so the corpus is clean
//  today by coincidence, not by construction.
const Component::Rung& Component::rung(const std::string& r) const
{
    auto it = rungs_.find(r);
    if (it == rungs_.end())
    {
        std::string have;
        for (const auto& kv : rungs_) have += (have.empty() ? "" : ", ") + kv.first;
        throw std::runtime_error("Component '" + name_ + "': no standard-state"
            " datum on the '" + r + "' rung.  This record declares: "
            + (have.empty() ? std::string("none") : have)
            + ".  Add a `" + r + " { dHf_298 ...; s_298 ...; }` sub-block to"
              " standardThermochemistry, with its citation -- do NOT reach for"
              " another rung's numbers, which is wrong by a heat of phase"
              " change.");
    }
    return it->second;
}

std::vector<std::string> Component::declaredRungs() const
{
    std::vector<std::string> out;
    out.reserve(rungs_.size());
    for (const auto& kv : rungs_) out.push_back(kv.first);
    return out;
}

void Component::requireIdealGasRung(const char* fn) const
{
    if (naturalPhase_ == "gas") return;
    const std::string crossing =
        (naturalPhase_ == "solid") ? "sublimation" : "vaporisation";
    throw std::runtime_error("Component '" + name_ + "': " + fn +
        "(T) evaluates the IDEAL-GAS rung, but this record declares"
        " standardThermochemistry.referenceState " + refStateWord_ +
        " -- dHf_298 and s_298 are tabulated on the " + naturalPhase_ +
        " standard state, so reading them here would be wrong by a heat of "
        + crossing + ".  Use h_formation(T, phase), which takes the"
        " transition at 298 K.  Do NOT 'fix' this by adding an"
        " idealGasHeatCapacity{} block: the Cp is not what is missing.");
}

scalar Component::h_pure_ig(scalar T) const
{
    if (!hasGibbsData_)
        throw std::runtime_error("Component '" + name_ +
            "': h_pure_ig(T) needs a standardThermochemistry block in its .dat");
    requireIdealGasRung("h_pure_ig");
    if (!cpGas_)
        throw std::runtime_error("Component '" + name_ +
            "': h_pure_ig(T) needs an idealGasHeatCapacity block in its .dat");
    //  ONE implementation of the standard-state enthalpy, not two.
    //
    //  This is `h_formation(T, "gas")` and always was -- the arithmetic was
    //  written twice, and rule 4 of class-structure.md says a derived
    //  quantity is computed in one place.  Verified before the change and
    //  again after: BIT-IDENTICAL across all 247 catalogue records at 300 /
    //  500 / 900 K, zero differences.
    //
    //  The two guards above stay AHEAD of the delegation on purpose.
    //  h_formation would refuse a solid-rung record as "sublimation not
    //  modelled" -- a true sentence about the wrong problem, since the
    //  reader's actual fault is a mislabelled rung.  A refactor that keeps
    //  the answer and loses the diagnosis has not kept the behaviour.
    return h_formation(T, "gas");
}

scalar Component::s_pure_ig(scalar T) const
{
    if (!hasGibbsData_)
        throw std::runtime_error("Component '" + name_ +
            "': s_pure_ig(T) needs a standardThermochemistry block in its .dat");
    requireIdealGasRung("s_pure_ig");
    if (!cpGas_)
        throw std::runtime_error("Component '" + name_ +
            "': s_pure_ig(T) needs an idealGasHeatCapacity block in its .dat");
    return s_formation(T, "gas");        // one implementation -- see h_pure_ig
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

//  ---- SEVERAL NAMED LAWS PER PROPERTY (DEV.md 4c C398, slice (b)) -----------

namespace {

//  A heat-capacity law with a HARD window: every evaluation outside it throws
//  the typed domain error whose remedy names the record's other laws.  Only a
//  law that declares `domain` is wrapped, so every existing law is the object
//  it always was.
class DomainBoundCp : public HeatCapacityModel
{
public:
    DomainBoundCp(std::unique_ptr<HeatCapacityModel> inner, recordLaws::Block blk,
                  std::size_t idx, std::string what)
    :   inner_(std::move(inner)), blk_(std::move(blk)), idx_(idx), what_(std::move(what)),
        lo_(blk_.laws[idx].domainLo), hi_(blk_.laws[idx].domainHi)
    {}
    scalar Cp(scalar T) const override { check(T); return inner_->Cp(T); }
    scalar H(scalar T, scalar Tref) const override { check(T); return inner_->H(T, Tref); }
    scalar S(scalar T, scalar Tref) const override { check(T); return inner_->S(T, Tref); }
    const std::string& modelName() const override { return inner_->modelName(); }
private:
    void check(scalar T) const
    { if (T < lo_ || T > hi_) recordLaws::throwOutsideDomain(blk_, idx_, T, what_); }
    std::unique_ptr<HeatCapacityModel> inner_;
    recordLaws::Block blk_;
    std::size_t idx_;
    std::string what_;
    scalar lo_, hi_;
};

} // namespace

void Component::buildVP_(std::size_t idx)
{
    const recordLaws::Block& blk = laws_.at("vaporPressure");
    const recordLaws::Law& L = blk.laws.at(idx);
    DictPtr vpd = L.body;
    //  Corresponding-states models (AmbroseWalton) need Tc/Pc/omega, which
    //  live at COMPONENT level, not in the law -- inject them so the record
    //  declares each fact once (`vaporPressure { model AmbroseWalton; }`).
    //  Antoine ignores the extra keys, so this is harmless for data-based
    //  models.  Tb travels too: AmbroseWalton compares it against the curve's
    //  own normal boiling point and says so when they differ (C281 step 1).
    //  The NAME travels with the model: a validity warning that cannot say
    //  WHICH component it is about is a warning the reader cannot act on.
    //  (SL-05: these are the facts injected into a vapour-pressure law; the
    //  resolved view lists them.)
    if (!vpd->found("Tc"))    vpd->insert("Tc",    Tc_);
    if (!vpd->found("Pc"))    vpd->insert("Pc",    Pc_);
    if (!vpd->found("omega")) vpd->insert("omega", omega_);
    if (!vpd->found("Tb") && Tb_ > 0.0) vpd->insert("Tb", Tb_);
    if (!vpd->found("owner")) vpd->insert("owner", name_);
    vp_ = VaporPressureModel::New(vpd);
    if (L.hasDomain)
    {
        recordLaws::Block copy = blk;
        vp_->setHardDomain(L.domainLo, L.domainHi, [copy, idx](scalar T)
            { recordLaws::throwOutsideDomain(copy, idx, T, "vapour pressure"); });
    }
}

void Component::buildCp_(const std::string& key, std::size_t idx)
{
    const recordLaws::Block& blk = laws_.at(key);
    const recordLaws::Law& L = blk.laws.at(idx);
    DictPtr body = L.body;
    if (!body->found("owner")) body->insert("owner", name_);
    if (key == "liquidHeatCapacity")
    {
        //  A CORRESPONDING-STATES liquid Cp (RowlinsonBondi) needs Tc, omega
        //  and the IDEAL-GAS Cp -- all three of which live at component level.
        //  Inject them, exactly as the vapour-pressure law's Tc/Pc/omega are,
        //  so the record declares each fact ONCE.  The ideal-gas law injected
        //  is the CHOSEN one (the record's preferred, or the case's pin:
        //  SL-05), as a DICT, not a built model: handing over a half-built
        //  object to save one parse is how construction order becomes a
        //  silent dependency.  A pin of the ideal-gas law re-injects it.
        if (!body->found("Tc") && Tc_ > 0.0) body->insert("Tc",    Tc_);
        if (!body->found("omega"))           body->insert("omega", omega_);
        if (laws_.count("idealGasHeatCapacity"))
        {
            const auto& ig = laws_.at("idealGasHeatCapacity");
            const auto& chosen = lawChoice_.count("idealGasHeatCapacity")
                ? lawChoice_.at("idealGasHeatCapacity").law : std::string();
            const int gi = ig.indexOf(chosen) >= 0 ? ig.indexOf(chosen) : ig.preferred;
            DictPtr igBody = ig.laws.at(std::size_t(gi)).body;
            if (body->found("idealGasHeatCapacity")
                && std::holds_alternative<DictPtr>(body->entryValue("idealGasHeatCapacity")))
            {
                //  Re-injection after a pin replaces only what this reader
                //  injected (one of the record's own ideal-gas laws, by
                //  identity): a law that DECLARES its own ideal-gas block keeps it.
                const DictPtr held = std::get<DictPtr>(body->entryValue("idealGasHeatCapacity"));
                for (const auto& g : ig.laws)
                    if (g.body == held) { body->erase("idealGasHeatCapacity"); break; }
            }
            if (!body->found("idealGasHeatCapacity"))
                body->insert("idealGasHeatCapacity", EntryValue(igBody));
        }
    }
    auto m = HeatCapacityModel::New(body);
    if (L.hasDomain)
        m = std::make_unique<DomainBoundCp>(std::move(m), blk, idx, key);
    if      (key == "liquidHeatCapacity")   cpLiq_   = std::move(m);
    else if (key == "idealGasHeatCapacity") cpGas_   = std::move(m);
    else                                    cpSolid_ = std::move(m);
}

const recordLaws::Block* Component::recordLaws(const std::string& property) const
{
    auto it = laws_.find(property);
    if (it != laws_.end()) return &it->second;
    if (lawsError_.count(property)) return nullptr;
    //  The three liquid transport blocks are parsed HERE, at the first
    //  request: a record that is never priced for a property is never
    //  refused for it (a refusal waits for first use, as it always did).
    DictPtr block = property == "liquidViscosity"           ? liquidViscDict_
                  : property == "liquidThermalConductivity" ? liquidCondDict_
                  : property == "surfaceTension"            ? surfaceTensionDict_ : nullptr;
    if (!block) return nullptr;
    try
    {
        std::function<bool(const std::string&)> isType;
        if (property == "liquidViscosity")
            isType = [](const std::string& w) { return LiquidViscosityModel::hasModel(w); };
        else if (property == "liquidThermalConductivity")
            isType = [](const std::string& w) { return LiquidConductivityModel::hasModel(w); };
        else
            isType = [](const std::string& w) { return SurfaceTensionModel::hasModel(w); };
        laws_[property] = recordLaws::parse(block, property, name_, isType);
        return &laws_.at(property);
    }
    catch (const std::exception& e)
    {
        lawsError_[property] = e.what();
        return nullptr;
    }
}

std::string Component::lawsError(const std::string& property) const
{
    (void)recordLaws(property);
    auto it = lawsError_.find(property);
    return it == lawsError_.end() ? std::string() : it->second;
}

Component::LawChoice Component::lawChoice(const std::string& property) const
{
    auto it = lawChoice_.find(property);
    return it == lawChoice_.end() ? LawChoice{} : it->second;
}

void Component::pinLaw(const std::string& property, const std::string& law,
                       const std::string& reason)
{
    const bool built = property == "vaporPressure" || property == "idealGasHeatCapacity"
                    || property == "liquidHeatCapacity" || property == "solidHeatCapacity";
    if (!built)
        throw std::logic_error("Component::pinLaw: '" + property + "' is chosen by the"
            " package, not held by the component");
    const recordLaws::Block* blk = recordLaws(property);
    if (!blk)
        throw std::runtime_error("pin of " + name_ + "'s " + property + " law `" + law
            + "`: the record has no " + property + " block, so it has no law to pin.");
    const int idx = blk->indexOf(law);
    if (idx < 0)
        throw std::runtime_error("pin of " + name_ + "'s " + property + " law `" + law
            + "`: the record has no law of that name -- its laws are: " + blk->names()
            + (blk->shape != recordLaws::Block::Shape::namedLaws
                 ? " (a block of one unnamed law; a pin names a law of a block of several)"
                 : ""));
    lawChoice_[property] = { law, blk->laws[std::size_t(idx)].type, "case pin (reason: " + reason + ")" };
    if (property == "vaporPressure") buildVP_(std::size_t(idx));
    else                             buildCp_(property, std::size_t(idx));
    //  SL-05: the liquid law that consumes the ideal-gas one follows the pin.
    if (property == "idealGasHeatCapacity" && laws_.count("liquidHeatCapacity")
        && lawChoice_.count("liquidHeatCapacity"))
    {
        const auto& lb = laws_.at("liquidHeatCapacity");
        const int li = lb.indexOf(lawChoice_.at("liquidHeatCapacity").law);
        buildCp_("liquidHeatCapacity", std::size_t(li >= 0 ? li : lb.preferred));
    }
    //  The property's provenance is the chosen law's, where the record files
    //  one per law.
    auto pv = provenanceMap_.find(property + "/" + law);
    if (pv != provenanceMap_.end()) provenanceMap_[property] = pv->second;
}

} // namespace Choupo
