/*---------------------------------------------------------------------------*\
  ThermoPackageBuilder -- see ThermoPackageBuilder.H.
  SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

#include "thermo/ThermoPackageBuilder.H"

#include "thermo/Database.H"
#include "thermo/Component.H"
#include "thermo/RecordResolver.H"
#include "thermo/ThermoAnnounce.H"   // [builder] lines: cout (pedagogy), gated at >= 2
#include "thermo/activityCoefficient/ElectrolyteActivity.H"
#include "thermo/electrolyte/PitzerSingleSalt.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"
#include "thermo/equationOfState/EquationOfState.H"

#include "thermo/ElementComposition.H"
#include "thermo/SystemClassifier.H"
#include "thermo/electrolyte/ReactiveVLE.H"

#include <cmath>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <map>
#include <memory>
#include <numeric>
#include <algorithm>
#include <set>
#include <sstream>
#include <stdexcept>
#include "thermo/ApproximationAuthorisation.H"
#include "thermo/activityCoefficient/ActivityModel.H"
#include "thermo/activityCoefficient/UNIFAC.H"
#include "thermo/activityCoefficient/UNIQUAC.H"
#include "thermo/vaporPressure/VaporPressureModel.H"

namespace fs = std::filesystem;

namespace Choupo {

// Resolve a DECLARED pair path so a RELOCATED case reads ITS OWN copy: walk UP
// from the cwd (the case) trying <dir>/<declared>; only then fall back to the
// installation repoRoot.  A sector-relative path ("constant/parameters/...")
// thus resolves inside the moved case, never the original tree.
// A v2 dict declares the INSTALLATION form (`source "data/standards/
// parameters/NRTL/<pair>.dat";`): the case constant/ MIRRORS data/standards/
// (the sealing redesign), so the same record lives case-locally at
// constant/<sub> (prefix stripped) -- the form `bin/choupo-import` writes.
// [legacy] The constant/propertyData/<...> legs serve the retired v1
// snapshots only (see the RecordResolver TODO).  A STRICTLY sealed case whose
// declared record is nowhere case-local REFUSES instead of silently reading
// the catalogue.
static std::filesystem::path resolveDeclared(const std::filesystem::path& repoRoot,
                                             const std::string& declared)
{
    namespace fs = std::filesystem;
    static const std::string pfx = "data/standards/";
    const bool stdForm = declared.rfind(pfx, 0) == 0;
    fs::path q = fs::current_path();
    for (int up = 0; up < Choupo::records::walkUpDepth; ++up)
    {
        fs::path cand = q / declared;
        if (fs::exists(cand)) return cand;
        if (stdForm)
        {
            fs::path candLocal = q / "constant" / declared.substr(pfx.size());
            if (fs::exists(candLocal)) return candLocal;
        }
        fs::path par = q.parent_path();
        if (par == q) break;
        q = par;
    }
    if (stdForm && Choupo::records::sealedStrict())
        Choupo::records::refuseSealed(declared.substr(pfx.size()),
                                      "declared parameter record");
    return repoRoot / declared;
}

namespace {

[[noreturn]] void absent(const std::string& field, const std::string& rec)
{
    throw std::runtime_error("ThermoPackageBuilder: " + field + " absent in " + rec
        + " -- curate it (the builder never estimates).");
}

DictPtr loadRec(const fs::path& f, const std::string& what)
{
    if (!fs::exists(f))
        throw std::runtime_error("ThermoPackageBuilder: " + what
            + " record not found: " + f.string());
    return Dictionary::fromFile(f.string());
}

// The component-basis ion map of a substance record: `dissociatesTo { ... }`.
DictPtr speciesMapOf(const DictPtr& rec)
{
    if (rec->found("dissociatesTo")) return rec->subDict("dissociatesTo");
    return nullptr;
}
bool hasSpeciesMap(const DictPtr& rec) { return speciesMapOf(rec) != nullptr; }

//  ---- THE aqueous activityModel, read in ONE place (2026-09-27) ----------
//  `equilibrium { aqueous { activityModel ... } }` had THREE readers -- the
//  reactive assembly, the single-salt Pitzer/eNRTL assembly and the declared
//  aqueous chemistry buildV2 attaches -- each parsing the slot its own way.
//  Two defects lived in the gaps, both measured (DEV.md 5 A5):
//
//    * `model <w>;` and `ionic <w>;` name the SAME slot (the ionic rung;
//      `model` is the older spelling the single-salt path still uses).  With
//      both present `model` won and `ionic` was never read -- so the
//      composite refusal's own advice, "declare `ionic davies;` with the
//      backbone", followed literally on a case written `model pitzerHMW;`
//      returned the SAME refusal, and `{ model davies; ionic pitzerHMW; }`
//      ran Davies at exit 0 under a pitzerHMW declaration.  Both keys
//      together now REFUSE, naming both words.
//    * `molecular <w>;` -- the composite backbone -- is served by the
//      REACTIVE shape alone; the single-salt adapter read `model` and
//      dropped `molecular NRTL;` in silence.  It says which route it read
//      (`molecular`) so the caller can refuse it where nothing serves it.
//
//  The word form `activityModel <w>;` is the ionic rung too, for every
//  reader (read from the source: two of the three called subDict() on it
//  and threw "is not a sub-dictionary", after the reactive assembly had
//  already accepted it).
struct AqueousActivityDeclaration
{
    bool        declared = false;   // the slot is present at all
    std::string ionic;              // "" = none named (reader decides)
    std::string molecular;          // "" = no backbone declared
};

AqueousActivityDeclaration readAqueousActivity(const DictPtr& aq)
{
    AqueousActivityDeclaration d;
    if (!aq || !aq->found("activityModel")) return d;
    d.declared = true;
    const EntryValue& ev = aq->entryValue("activityModel");
    if (std::holds_alternative<std::string>(ev))
    {
        d.ionic = std::get<std::string>(ev);
        return d;
    }
    auto am = aq->subDict("activityModel");
    const bool hasModel = am->found("model");
    const bool hasIonic = am->found("ionic");
    if (hasModel && hasIonic)
        throw std::runtime_error("thermophysicalPropertySystem:"
            " equilibrium.aqueous.activityModel declares BOTH `model "
            + am->lookupWord("model") + ";` and `ionic "
            + am->lookupWord("ionic") + ";` -- two names for the ONE ionic"
            " rung, and only one could ever be read (`model` shadowed"
            " `ionic`).  Keep exactly one: the composite form is"
            " `activityModel { ionic <word>; molecular <word>; }`, the"
            " single-salt form `activityModel { model Pitzer|eNRTL; }`.");
    if      (hasModel) d.ionic = am->lookupWord("model");
    else if (hasIonic) d.ionic = am->lookupWord("ionic");
    if (am->found("molecular")) d.molecular = am->lookupWord("molecular");
    return d;
}

} // namespace

//  ---- RETIRED TOP-LEVEL FORMS REFUSE BY NAME (2026-09-27, DEV.md 5 A5) ---
//  The top level of a thermophysicalPropertySystem is read key by key, and a
//  key nobody asks for is simply never seen -- so a retired form ran to exit
//  0 while the case said something the engine did not do.  Measured before
//  this was written, each on a corpus case at exit 0: `package <name>;` (the
//  selector retired 2026-07-15, whose refusal the v2 clean-slate purge
//  deleted with the v1 reader -- the property architecture went on saying
//  the runtime refuses it), `propertyPackage {}` / `thermoPackage` (v1
//  manifests), `electrolyteModel {}` (never a case block), a flat top-level
//  `activityModel` / `equationOfState` (the v1 form the thermo{} override
//  fragment already refuses by name), and `volatiles ( ... );` -- which the
//  reactive assembly READ from the top level as a fallback, a second home
//  the grammar never documented, and which it ignored in silence when
//  equilibrium{} declared its own.  A named list, not a closed key set:
//  the top level is also read by readers outside this file
//  (acceptUnverified, inherits, ...), and a closed set nobody enumerated
//  would refuse a correct case.
static void refuseRetiredTopLevel(const DictPtr& pkg)
{
    struct Retired { const char* key; const char* why; };
    static const Retired retired[] = {
        { "package",
          "`package <name>;` selected from the shared propertyPackages"
          " catalogue, RETIRED 2026-07-15 -- nothing reads the line, so the"
          " case would run on its inline declaration while naming another."
          "  This file IS the system: remove the line." },
        { "propertyPackage",
          "`propertyPackage` is the v1 manifest; the case grammar declares"
          " components / equilibrium { formulation ...; } / caloric /"
          " transport at the top level of this file"
          " (bin/curate/migrate_thermoPhysProp.py converts an old case)." },
        { "thermoPackage",
          "`thermoPackage` is the v1 grammar; the case grammar declares"
          " components / equilibrium { formulation ...; } / caloric /"
          " transport at the top level of this file"
          " (bin/curate/migrate_thermoPhysProp.py converts an old case)." },
        { "electrolyteModel",
          "there is no `electrolyteModel {}` block -- an electrolyte's model"
          " is declared where its formulation reads it:"
          " `equilibrium { formulation electrolyteGammaPhi; aqueous {"
          " activityModel { ... } } }`, or `activityModel <word>;` on a"
          " props-bench speciate op." },
        { "activityModel",
          "a top-level `activityModel` is the retired flat v1 form; declare"
          " it where the formulation reads it: `equilibrium { liquid {"
          " activityModel ...; } }` (gammaPhi / gammaGamma) or"
          " `equilibrium { aqueous { activityModel { ... } } }`"
          " (electrolyteGammaPhi)." },
        { "equationOfState",
          "a top-level `equationOfState` is the retired flat v1 form; declare"
          " it where the formulation reads it: `equilibrium { formulation"
          " phiPhi; equationOfState { model ...; } }`." },
        { "volatiles",
          "`volatiles ( ... );` belongs INSIDE `equilibrium { ... }`, beside"
          " `formulation` -- the top-level copy was a second home the"
          " reactive assembly read as a fallback and ignored whenever"
          " equilibrium{} declared its own.  Move the line into"
          " equilibrium{}." },
    };
    for (const auto& r : retired)
        if (pkg->found(r.key))
            throw std::runtime_error(std::string("thermophysicalPropertySystem:"
                " top-level `") + r.key + "` is a RETIRED form -- " + r.why);
}

//  ---- `aqueous { apparentComponents ( ... ); }` REFUSES BY NAME -----------
//  (2026-09-27, DEV.md 5 A5 remainder.)  Twenty electrolyte cases wrote this
//  list and NOTHING read it -- not this builder, not a unit, not the GUI, not
//  a tool.  Measured on all twenty before it was refused: every list named
//  exactly the salt the builder had already chosen, for its own reasons.  So
//  it agreed by coincidence and would have gone on agreeing with nothing
//  checking it: a student who edits it changes nothing, and a declaration
//  that does not bind is a comment dressed as one.  The facts it seemed to
//  state each have ONE home already:
//    * the apparent (component) basis IS `components ( ... )` -- the stream
//      carries every component in it, salts included;
//    * WHICH salt the single-salt adapter activates is decided in
//      buildElectrolyte (b1): the only component whose record carries
//      `dissociatesTo`, else the owner of the solid phase
//      constant/chemistryDict declares -- announced as
//      `[electrolyte] active salt:`;
//    * the ions come from that record's `dissociatesTo`.
//  Reading the list instead would make it a SECOND home for the active-salt
//  decision, which is the arity sin, not a fix.
static void refuseUnreadAqueousKeys(const DictPtr& pkg)
{
    if (!pkg->found("equilibrium")) return;
    auto eq = pkg->subDict("equilibrium");
    if (!eq->found("aqueous")) return;
    auto aq = eq->subDict("aqueous");
    if (!aq->found("apparentComponents")) return;
    std::string listed;
    try
    {
        for (const auto& w : aq->lookupWordList("apparentComponents"))
            listed += (listed.empty() ? "" : " ") + w;
    }
    catch (const std::exception&) { /* named below without its words */ }
    throw std::runtime_error("thermophysicalPropertySystem:"
        " `equilibrium.aqueous.apparentComponents ( " + listed + " )` is"
        " read by NOTHING in the engine -- editing it would change nothing,"
        " so it is refused rather than kept as a declaration that does not"
        " bind.  The apparent basis IS `components ( ... )`; the salt the"
        " electrolyte model activates is the component whose record carries"
        " `dissociatesTo` (with more than one, the owner of the solid phase"
        " constant/chemistryDict declares), and its ions come from that"
        " `dissociatesTo`.  Remove the line.");
}

// ---- ELECTROLYTE path: assemble a PitzerSingleSalt directly from the unified
//      substance records (no readFromDict, no loadSalt, no old catalogue) ----
static ThermoPackage buildV2Dispatch(const DictPtr& v2, const Database& db,
                                     const ChemistrySystem* chem);

static ThermoPackage buildElectrolyte(const std::vector<std::string>& compNames,
                                      const Database& db,
                                      bool isENRTL,
                                      const ChemistrySystem* chem)
{
    // Repo root = parent of the data/ dir (Database::currentRoot() is data/).
    const fs::path repoRoot = fs::path(Database::currentRoot()).parent_path();
    // ONE resolver (sealing redesign): a "data/standards/<sub>" rel resolves
    // case-local FIRST (constant/<sub>, then the legacy propertyData form),
    // walking UP the cascade (unit -> sector -> plant); a strictly sealed
    // case never falls back to the catalogue (resolveRecord returns empty --
    // the fs::exists guards downstream keep absence-tolerant reads tolerant).
    // A case without local records falls through to data/standards/ exactly
    // as before -- zero change for the unsealed corpus.
    auto resolve = [&](const std::string& rel) -> fs::path
    {
        static const std::string pfx = "data/standards/";
        if (rel.rfind(pfx, 0) == 0)
            return records::resolveRecord(rel.substr(pfx.size()));
        return repoRoot / rel;
    };
    // Confess the seal: if the case ships a property manifest, say so once --
    // this run reads the case's own records, never the installation catalogue.
    {
        DictPtr md = records::nearestManifest();
        if (md && thermoAnnounce())
            std::cout << "[sealed] case runs from its own constant/ records ("
                      << md->lookupWordOrDefault("catalogueRelease",
                             md->lookupWordOrDefault("defaultStandardSet", "?"))
                      << ", imported "
                      << md->lookupWordOrDefault("importedAt", "?")
                      << ") -- installation catalogue NOT consulted.\n";
    }

    // (a) component list -----------------------------------------------------
    if (compNames.empty()) absent("components", "propertyPackage");

    // (b0) the DECLARED solid phase.  Read BEFORE the salt is chosen, because
    //      it is what the case says about WHICH salt is active (b1).
    std::string phaseName;
    if (chem && chem->present && !chem->solidPhases.empty())
    {
        const auto& salts = chem->solidPhases;
        //  REFUSAL, not a warning (2026-07-27).  This adapter honours ONE
        //  salt, so a longer list can only be served by dropping the rest --
        //  and that makes the ORDER of the words decide the physics, with a
        //  warning nobody reads standing between a wrong answer and exit 0.
        //  Name every phase and stop; the remedy is the multi-salt op or a
        //  shorter list.  (Scoped to this adapter: `formulation gammaPhi`
        //  reads the whole list through aq.solidPhases and is unaffected --
        //  the four two-solid scaling tutorials all take that path.)
        if (salts.size() > 1)
        {
            std::string all;
            for (const auto& s : salts) all += (all.empty() ? "" : ", ") + s;
            throw std::runtime_error("chemistryDict declares "
                + std::to_string(salts.size()) + " solid phases (" + all
                + ") but the single-salt electrolyte adapter represents"
                " exactly ONE.  Honouring the first and ignoring the rest"
                " would let the ORDER of the list decide the answer -- so it"
                " refuses.  Remedy: declare one solid phase here, or move to"
                " the multi-salt op (eNRTL) which represents them together.");
        }
        phaseName = salts.front();
    }

    // (b1) THE ACTIVE SALT IS DECLARED, NEVER POSITIONAL (2026-09-27).
    //
    //  SUBSET-AWARE (general solver): a flowsheet may run this electrolyte
    //  world on a GLOBAL component union that carries MORE than one salt (a
    //  brine unit in a plant that also carries LiCl).  Exactly ONE salt is
    //  ACTIVE -- the single-salt Pitzer/eNRTL engine treats only it; every
    //  OTHER `dissociatesTo` component is a molecular SPECTATOR (present in
    //  the stream, ideal contribution, announced).
    //
    //  Which one used to be decided by a formula read from
    //  `data/standards/chemistry/salts/<phase>.dat` -- a directory that has
    //  not existed since chemistry/ went flat on 2026-07-01.  Outside the one
    //  case that still ships the retired snapshot, the read found nothing,
    //  the formula stayed empty, and the FIRST `dissociatesTo` component in
    //  `components ( ... )` won: the order of a word list decided the
    //  physics, at exit 0, and the choice never reached the console as a
    //  decision.  Now, in this order:
    //    1. ONE candidate: it is the salt (nothing to decide; announced).
    //    2. The declared solid phase (constant/chemistryDict `equilibria {
    //       solidPhases ( <phase> ); }`) names the active salt through the
    //       record that OWNS it -- the candidate whose own `solidPhases {}`
    //       block carries that phase.  Ownership, never name similarity.
    //    3. [legacy] an external case that still ships the retired
    //       `chemistry/salts/<phase>.dat` snapshot names its salt through
    //       that record's `formula` -- honoured, ANNOUNCED as legacy, and
    //       refused if it disagrees with rule 2.
    //    4. Anything else REFUSES, naming every candidate and the phases
    //       each owns.  Never the first in the list.
    //
    // Component BASE records keep the doctrine (records::componentBase): the
    // hand-authored constant/components/ overlay tier must NOT serve as the
    // raw base of an unsealed case -- only a legacy snapshot or a STRICTLY
    // sealed one-home record replaces the catalogue base here.
    auto stdCompPath = [&](const std::string& cn)
        { return records::componentBase(cn); };
    std::vector<DictPtr> compRecs;
    compRecs.reserve(compNames.size());
    std::vector<std::string> saltCandidates;
    for (const auto& cn : compNames)
    {
        const fs::path sp = stdCompPath(cn);
        DictPtr rec = fs::exists(sp) ? Dictionary::fromFile(sp.string()) : nullptr;
        // UNIFIED overlay (roadmap Phase A): the ONE shared entry point deep-merges a
        // case-local `overlayOf` partial over the standard, so a case-recalibrated
        // calorimetric/crystal datum reaches the crystalliser too.
        if (rec) rec = Database::applyCaseOverlay(cn, rec, sp.string()).dict;
        compRecs.push_back(rec);
        if (rec && hasSpeciesMap(rec)) saltCandidates.push_back(cn);
    }
    auto recOf = [&](const std::string& cn) -> DictPtr
    {
        for (std::size_t i = 0; i < compNames.size(); ++i)
            if (compNames[i] == cn) return compRecs[i];
        return nullptr;
    };
    auto ownsPhase = [&](const std::string& cn, const std::string& ph)
    {
        const DictPtr r = recOf(cn);
        return r && r->found("solidPhases")
            && r->subDict("solidPhases")->found(ph);
    };

    std::string activeSalt, activeWhy;
    if (saltCandidates.size() == 1)
    {
        activeSalt = saltCandidates.front();
        activeWhy  = "the only component carrying dissociatesTo";
    }
    else if (saltCandidates.size() > 1)
    {
        std::vector<std::string> owners;
        if (!phaseName.empty())
            for (const auto& cn : saltCandidates)
                if (ownsPhase(cn, phaseName)) owners.push_back(cn);
        //  The retired snapshot, read only where an external case still ships
        //  one (the resolver walks the case's own constant/ first; a strictly
        //  sealed case never probes the catalogue).
        std::string legacyOwner, legacyFormula;
        if (!phaseName.empty())
        {
            const fs::path sf =
                resolve("data/standards/chemistry/salts/" + phaseName + ".dat");
            if (!sf.empty() && fs::exists(sf))
            {
                auto sr = Dictionary::fromFile(sf.string());
                if (sr->found("formula"))
                {
                    legacyFormula = sr->lookupWord("formula");
                    for (const auto& cn : saltCandidates)
                    {
                        const DictPtr r = recOf(cn);
                        if (cn == legacyFormula
                            || (r && r->found("formula")
                                && r->lookupWord("formula") == legacyFormula))
                        { legacyOwner = cn; break; }
                    }
                }
            }
        }
        if (owners.size() > 1)
        {
            std::string all;
            for (const auto& o : owners) all += (all.empty() ? "" : ", ") + o;
            throw std::runtime_error("electrolyte package: the declared solid"
                " phase '" + phaseName + "' is owned by MORE than one salt in"
                " components ( ... ): " + all + ".  A phase names ONE active"
                " salt; two records claiming it would leave the choice to the"
                " order of the list, which this builder refuses to use.  Remedy:"
                " keep the phase in exactly one of those records.");
        }
        if (owners.size() == 1)
        {
            if (!legacyOwner.empty() && legacyOwner != owners.front())
                throw std::runtime_error("electrolyte package: two homes"
                    " disagree about the active salt.  '" + owners.front()
                    + "' owns the declared solid phase '" + phaseName
                    + "' in its own solidPhases {} block, while the retired"
                    " snapshot chemistry/salts/" + phaseName + ".dat names"
                    " formula '" + legacyFormula + "' (component '"
                    + legacyOwner + "').  Remedy: delete the legacy snapshot"
                    " (the component record is the one home).");
            activeSalt = owners.front();
            activeWhy  = "declared by constant/chemistryDict solidPhases ( "
                + phaseName + " ), a phase " + activeSalt
                + "'s own record owns";
        }
        else if (!legacyOwner.empty())
        {
            activeSalt = legacyOwner;
            activeWhy  = "[legacy] named by the retired snapshot"
                " chemistry/salts/" + phaseName + ".dat (formula "
                + legacyFormula + "); move the phase into " + legacyOwner
                + "'s solidPhases {} block";
        }
        else
        {
            std::string cands;
            for (const auto& cn : saltCandidates)
            {
                std::string owned;
                const DictPtr r = recOf(cn);
                if (r && r->found("solidPhases"))
                    for (const auto& k : r->subDict("solidPhases")->keys())
                        owned += (owned.empty() ? "" : " ") + k;
                cands += "\n    " + cn + "  (owns solid phases: "
                    + (owned.empty() ? std::string("none") : owned) + ")";
            }
            throw std::runtime_error("electrolyte package: "
                + std::to_string(saltCandidates.size()) + " components carry"
                " dissociatesTo and nothing the case declares says which one"
                " is the ACTIVE salt of this single-salt adapter -- "
                + (phaseName.empty()
                     ? std::string("constant/chemistryDict declares no solid"
                                   " phase")
                     : "the declared solid phase '" + phaseName
                       + "' is owned by none of them")
                + ".  Candidates:" + cands + "\n  Choosing the first one in"
                " components ( ... ) would let the ORDER of a word list decide"
                " the physics, so the builder refuses.  The key that settles"
                " it: constant/chemistryDict `equilibria { solidPhases ("
                " <phase> ); }` naming a phase the intended salt's record"
                " owns.  A salt that owns no phase cannot be named this way:"
                " curate a solidPhases {} block on its record, or remove the"
                " other salt(s) from components ( ... ).");
        }
    }
    if (!activeSalt.empty() && thermoAnnounce()
        && announceOnce("activeSalt:" + activeSalt + "|" + activeWhy))
    {
        std::string spect;
        for (const auto& cn : saltCandidates)
            if (cn != activeSalt) spect += (spect.empty() ? "" : " ") + cn;
        std::cout << "[electrolyte] active salt: " << activeSalt << " ("
                  << activeWhy << ")";
        if (!spect.empty())
            std::cout << "; spectator salt(s), ideal molecular contribution: "
                      << spect;
        std::cout << "\n";
    }

    // (b2) mint the components.  The salt's identity (MW, role) comes from its
    //      components/<salt>.dat record (the component base, plus a declared
    //      `overlayOf` partial) so it is byte-identical to the retired
    //      components/apparent overlay (deleted layout).  EVERY OTHER
    //      component -- the water solvent, an ethanol antisolvent, a
    //      curve-solute, a spectator salt -- is a full molecular component
    //      loaded by name (overlay honoured), so the crystalliser reads its
    //      eps/Mw/v.
    std::vector<Component> comps;
    std::size_t solventIdx = compNames.size(), soluteIdx = compNames.size();
    std::string saltName;
    DictPtr saltRec;
    for (std::size_t ci = 0; ci < compNames.size(); ++ci)
    {
        const std::string& cn = compNames[ci];
        const DictPtr& rec = compRecs[ci];
        if (!activeSalt.empty() && cn == activeSalt && saltName.empty())
        {
            saltName  = cn;
            saltRec   = rec;
            soluteIdx = comps.size();
            const scalar saltMW = rec->lookupScalar("MW");
            const std::string saltRole =
                rec->lookupWordOrDefault("role", "volatile");
            comps.push_back(Component::identity(cn, saltMW, saltRole));
            //  ...and its DECLARED IDENTITY.  Without this the salt reached
            //  the runtime with no `formula`, so the element balance could
            //  not count its atoms and published UNAVAILABLE against a record
            //  that declares `formula NaCl;` right beside the MW read above.
            comps.back().readIdentity(rec);
            //  The identity component carries name/MW/role only -- but the
            //  record it was minted FROM declares `dissociatesTo`, and that
            //  bridge is what lets a stream report its ions.  Without this
            //  line every Pitzer/eNRTL brine in the corpus printed its
            //  apparent salt and no speciation at all, while the reactive
            //  flashes printed both bases.  Same architecture, two
            //  behaviours; the bridge is the salt's own declared fact, so it
            //  travels with it.
            comps.back().readAqueousMapping(rec);
        }
        else
        {
            if (cn == "water") solventIdx = comps.size();
            comps.push_back(db.loadComponent(cn));   // solvent / antisolvent / curve-solute
        }
    }
    if (saltName.empty())
        absent("a salt component (with dissociatesTo)", "propertyPackage.components");
    if (solventIdx == compNames.size())
        absent("a water solvent", "propertyPackage.components");

    // (c) cation/anion from the salt's `dissociatesTo`: classify by CHARGE SIGN
    //     (charge via findIon: case ions.dat overlay /
    //     standards species/<ion>.dat).  loadSalt recomputes charge +
    //     stoichiometry from the catalogue, so this only needs the ion NAMES.
    std::string catName, anName;
    {
        auto d2t = speciesMapOf(saltRec);
        for (const auto& ion : d2t->keys())
        {
            auto iRec = electrolyte::findIon(ion);
            if (!iRec)
                throw std::runtime_error("propertyPackage: ion '" + ion
                    + "' not found (case ions.dat / constant/species/<ion>.dat / standards species/<ion>.dat).");
            const int z = static_cast<int>(std::lround(iRec->lookupScalar("z")));
            if      (z > 0) catName = ion;
            else if (z < 0) anName = ion;
        }
    }
    if (catName.empty() || anName.empty())
        absent("exactly one cation and one anion", saltName + ".dissociatesTo");

    // The salt's solid phase + saturation anchor are resolved by the phase NAME
    // the case declares (b0): from the salt record's own solidPhases.<phase>
    // block, else from the LEGACY homes phases/solid/<phase>.dat (rho_p, k_v)
    // and chemistry/salts/<phase>.dat (anchor), which exist in no shipped
    // standards tree and are read only for an external case that still
    // carries them -- announced when they are what served.

    //  A DECLARED SOLID PHASE MUST BE OWNED BY A RECORD (2026-09-07).  Both
    //  consumers below -- the crystal properties (c2) and the saturation
    //  anchor (f) -- were absence-tolerant, and NOTHING validated the phase
    //  NAME against anything: `ChemistrySystem::read` checks the KEYS inside
    //  `equilibria {}` and never the words inside `solidPhases ( ... )`.  So
    //  `solidPhases ( sylvite );` on a NaCl brine -- a real mineral, but
    //  potassium's -- ran to exit 0 with m_sat 1e-9, Ksp 0 and a crystalliser
    //  yield of 0.999999999868 against the correct 0.18832, seal "verified",
    //  and one line of trace that reads like physics: "Solubility c_sat(T_op)
    //  = 0.000 kg NaCl / kg water".  A phase nobody owns now refuses by name,
    //  the same posture the crystalliser already takes for a missing rho_p.
    //
    //  OWNERSHIP, NOT COMPLETENESS -- and the difference was MEASURED before
    //  this was written.  Of the corpus cases declaring a solid phase, two
    //  (flash16_calcite_precipitation, flash19_organic_and_precipitate) name
    //  `calcite`, which CaCO3.dat owns with an `equilibrium { logK25 ... }`
    //  Ksp and no `calorimetric` block at all.  That absence is legitimate:
    //  the phase's equilibrium is expressed as a mass action, not as a
    //  measured solubility, so refusing on a missing anchor would refuse a
    //  correct case.  It is refused only when NO record owns the word.  An
    //  owned phase whose anchor this adapter cannot find is ANNOUNCED below
    //  instead, because at THIS adapter that still means solubility 0.
    if (!phaseName.empty())
    {
        const bool ownedBySalt =
            saltRec && saltRec->found("solidPhases")
            && saltRec->subDict("solidPhases")->found(phaseName);
        //  The legacy homes: no such directory exists in the shipped tree,
        //  but an external case may still carry one (the builder reads them
        //  below), so ownership must ask the same three places the consumers
        //  ask -- a check narrower than its consumers refuses valid input.
        const bool ownedByLegacy =
            fs::exists(resolve("data/standards/phases/solid/"
                               + phaseName + ".dat"))
         || fs::exists(resolve("data/standards/chemistry/salts/"
                               + phaseName + ".dat"));
        if (!ownedBySalt && !ownedByLegacy)
        {
            std::string declared;
            if (saltRec && saltRec->found("solidPhases"))
                for (const auto& k : saltRec->subDict("solidPhases")->keys())
                    declared += (declared.empty() ? "" : ", ") + k;
            throw std::runtime_error("chemistryDict declares the solid phase '"
                + phaseName + "', which no record owns.  The package's salt is"
                " '" + saltName + "' and its `solidPhases {}` block declares "
                + (declared.empty()
                     ? std::string("NO solid phase at all")
                     : declared)
                + ".  Nothing else was found under"
                  " data/standards/phases/solid/ or"
                  " data/standards/chemistry/salts/ either.  Until now this"
                  " was tolerated silently and the saturation anchor stayed"
                  " ZERO, so the run reported a solubility of 0 and"
                  " crystallised essentially the whole solute at exit 0."
                  "  Remedy: name a phase '" + saltName + "' declares, or add"
                  " the phase to that component's record.");
        }
        //  Owned, but this adapter's anchor (the `calorimetric` sub-block) is
        //  absent: the solubility it will use is 0.  That is a real modelling
        //  statement and not necessarily an error -- a phase carrying only a
        //  mass-action Ksp is curated exactly that way -- so it is ANNOUNCED
        //  and judged not, the posture the extrapolated Antoine and the
        //  sub-band Davies already take.
        if (ownedBySalt
         && !saltRec->subDict("solidPhases")->subDict(phaseName)
                    ->found("calorimetric")
         && !ownedByLegacy)
        {
            //  Printed at its site as well as replayed in the end-of-run
            //  block: `core/AdvisorySummary.H` says every line it replays was
            //  already printed where it was raised, and a package that never
            //  reaches the end of a run (this one refuses on a missing
            //  vapour pressure two steps later) must still have said it.
            std::cout << "[solid phase] '" << saltName << "' declares '"
                      << phaseName << "' with no calorimetric solubility"
                         " anchor -- the saturation molality this adapter"
                         " uses is ZERO.\n";
            AdvisoryLog::instance().add("validity", "warning",
                "solid phase '" + phaseName + "'",
                "'" + saltName + "' declares this phase but no `calorimetric"
                " { solubility ... }` anchor, which is the only saturation"
                " datum this single-salt electrolyte adapter reads -- so the"
                " saturation molality it uses is ZERO and any unit asking for"
                " a solubility here will report essentially complete"
                " crystallisation.  Remedy: curate the anchor, or use a"
                " formulation that reads the phase's mass-action Ksp.");
        }
    }

    // (c2) particulate-solid properties (rho_p, k_v) from the salt record's
    //      solidPhases.<phase>.crystal block (legacy phases/solid/<phase>.dat
    //      only when an external case still ships one, announced) -- the
    //      MSMPR/PSD crystalliser reads them off the salt component.
    //      Absence-tolerant (no phase -> identity defaults, fine for non-PSD cases).
    if (!phaseName.empty())
    {
        // UNIFIED: crystal props from the salt record's solidPhases.<phase>.crystal
        // (flat rho_p/k_v); else the legacy phases/solid/<phase>.dat (nested value).
        DictPtr uCrystal;
        if (saltRec && saltRec->found("solidPhases")
            && saltRec->subDict("solidPhases")->found(phaseName)
            && saltRec->subDict("solidPhases")->subDict(phaseName)->found("crystal"))
            uCrystal = saltRec->subDict("solidPhases")->subDict(phaseName)->subDict("crystal");
        if (uCrystal)
        {
            const scalar rho = uCrystal->lookupScalarOrDefault("rho_p", 0.0);
            const scalar kv  = uCrystal->lookupScalarOrDefault("k_v", 0.5235987756);
            comps[soluteIdx].setSolid(rho, kv);
        }
        else
        {
            const fs::path sf =
                resolve("data/standards/phases/solid/" + phaseName + ".dat");
            if (fs::exists(sf))
            {
                auto sd = Dictionary::fromFile(sf.string());
                const scalar rho = sd->found("rho_p")
                    ? sd->subDict("rho_p")->lookupScalar("value") : 0.0;
                scalar kv = 0.5235987756;   // sphere default (matches readFromDict)
                if (sd->found("shape") && sd->subDict("shape")->found("k_v"))
                    kv = sd->subDict("shape")->subDict("k_v")->lookupScalar("value");
                comps[soluteIdx].setSolid(rho, kv);
                if (thermoAnnounce()
                    && announceOnce("legacyCrystal:" + phaseName))
                    std::cout << "[legacy] crystal properties of '" << phaseName
                              << "' read from the retired phases/solid/"
                              << phaseName << ".dat -- move them into "
                              << saltName << "'s solidPhases { " << phaseName
                              << " { crystal { ... } } } block.\n";
            }
        }
    }

    // (c3) liquid heat capacity from the salt's STANDARDS record (if declared) --
    //      the identity salt otherwise carries none, and the liquid sensible-
    //      enthalpy path (mixed-solvent / recycle cases) requires it.  Absence-tol.
    if (saltRec->found("liquidHeatCapacity"))
        comps[soluteIdx].setLiquidCp(saltRec->subDict("liquidHeatCapacity"));

    // (d) property method -- the SELECTION is `model eNRTL|pitzer` in the case
    //     propDict; the EQUATIONS are this C++; the PARAMETERS are the pair
    //     .dat; the EXPLANATION is the manuals.  A separate methods/<model>.dat
    //     record was pure ceremony (a referenceBasis echo, reference-free for
    //     the gamma math).
    if (thermoAnnounce())
        std::cout << "[builder] propertyMethod " << (isENRTL ? "eNRTL" : "pitzer")
                  << ": aqueous inf-dilution ion reference (per-phase);"
                  << " gamma math is reference-free (basis carried for enthalpy"
                     " honesty).\n";

    // (e) the FULL electrolyte contract, every field via the SAME SaltFromCatalogue
    //     helpers ElectrolyteActivity::configure() calls -- so the kernel (incl.
    //     dbeta*_dT), the aqueous-ion reference, the calorimetric flag and the
    //     L_phi window are byte-identical to the legacy path BY CONSTRUCTION, and
    //     loadSalt honours the case-local constant/electrolyte/ overlay.  The
    //     package's parameters.pitzerPairs path is declarative; loadSalt resolves
    //     the pair by (cation,anion) name.
    ElectrolyteAssembly assembly;
    assembly.isENRTL = isENRTL;
    double nuC = 0.0, nuA = 0.0;
    if (isENRTL)
    {
        assembly.enrtl = electrolyte::loadENRTL(catName, anName);
        nuC = assembly.enrtl.nu_c; nuA = assembly.enrtl.nu_a;
    }
    else
    {
        assembly.pitzer = electrolyte::loadSalt(catName, anName);
        nuC = assembly.pitzer.nu_c; nuA = assembly.pitzer.nu_a;
    }
    assembly.soluteIdx  = soluteIdx;
    assembly.solventIdx = solventIdx;
    assembly.soluteName = saltName;
    assembly.solventMW  = comps[solventIdx].MW();
    {
        double hf = 0.0, cp = 0.0;
        assembly.hasAqRef = electrolyte::ionAqReference(catName, anName, nuC, nuA, hf, cp);
        assembly.hfAqSum = hf;
        assembly.cpAqSum = cp;
        // Criss-Cobble 1964 T-averaged ionic Cp (JACS 86, 5390 Table II):
        // preloaded HERE (build time, never the hot path); the kernel
        // interpolates the five nodes in T.  Falls back to the constant
        // cpAq tier -- announced either way so the T-extension is never
        // silent.
        if (assembly.hasAqRef)
        {
            assembly.ccAvail = electrolyte::crissCobbleNodes(
                catName, anName, nuC, nuA, assembly.ccNodes);
            if (thermoAnnounce())
                std::cout << "[builder] ion Cp(T) for " << saltName << ": "
                          << (assembly.ccAvail
                                ? "Criss-Cobble 1964 T-averaged nodes (25-200 C, JACS 86, 5390)"
                                : "constant cpAq tier (no Criss-Cobble entry; valid near 25 C)")
                          << "\n";
        }
    }
    // calorimetricFit is per-KERNEL: only the Pitzer T-slots are calorimetrically
    // fitted, so an eNRTL package NEVER inherits the flag (its tau(T) is the
    // anchored, uncalibrated form) -- forced false + lphiValidityMax 0 (defaults).
    if (!isENRTL)
    {
        assembly.calorimetricFit = electrolyte::pairCalorimetricFit(catName, anName);
        auto pr = electrolyte::findPitzerPair(catName, anName);
        assembly.lphiValidityMax =
            pr ? pr->lookupScalarOrDefault("lphiValidityMax", 0.0) : 0.0;
    }

    // (f) the saturation/dissolution anchor from the salt record's
    //     solidPhases.<phase>.calorimetric block (the legacy
    //     chemistry/salts/<phase>.dat measuredSolubilityAnchor only when an
    //     external case still ships one, announced).  Absence-tolerant: no
    //     anchor -> solubility 0 (Ksp short-circuits to 0), announced above.
    if (!phaseName.empty())
    {
        // UNIFIED: the anchor from the salt record's solidPhases.<phase>.calorimetric
        // (solubility/dissolutionEnthalpy); else legacy chemistry/salts/<phase>.dat.
        DictPtr a;
        if (saltRec && saltRec->found("solidPhases")
            && saltRec->subDict("solidPhases")->found(phaseName)
            && saltRec->subDict("solidPhases")->subDict(phaseName)->found("calorimetric"))
            a = saltRec->subDict("solidPhases")->subDict(phaseName)->subDict("calorimetric");
        else
        {
            const fs::path cf =
                resolve("data/standards/chemistry/salts/" + phaseName + ".dat");
            if (fs::exists(cf))
            {
                auto cd = Dictionary::fromFile(cf.string());
                if (cd->found("measuredSolubilityAnchor"))
                {
                    a = cd->subDict("measuredSolubilityAnchor");
                    if (thermoAnnounce()
                        && announceOnce("legacyAnchor:" + phaseName))
                        std::cout << "[legacy] solubility anchor of '"
                                  << phaseName << "' read from the retired"
                                     " chemistry/salts/" << phaseName
                                  << ".dat -- move it into " << saltName
                                  << "'s solidPhases { " << phaseName
                                  << " { calorimetric { ... } } } block.\n";
                }
            }
        }
        if (a)
        {
            if (a->found("solubility"))
                assembly.solubility = a->subDict("solubility")->lookupScalar("value");
            if (a->found("dissolutionEnthalpy"))
                assembly.dHsolution = a->subDict("dissolutionEnthalpy")->lookupScalar("value");
        }
    }

    // (g) assemble + idealGas EoS
    std::vector<std::string> names;
    names.reserve(comps.size());
    for (const auto& c : comps) names.push_back(c.name());

    std::unique_ptr<ActivityModel> act = std::make_unique<ElectrolyteActivity>(
        names, std::move(assembly));

    DictPtr eosDict = Dictionary::fromString("model idealGas;", "ThermoPackageBuilder.eos");
    std::unique_ptr<EquationOfState> eos = EquationOfState::New(eosDict, comps);

    ThermoPackage out;
    out.adoptElectrolytePackage(std::move(comps), std::move(act), std::move(eos));
    // The world line, symmetric with the phi-phi / gamma-phi / Henry branches:
    // the liquid method slot IS the world (forum 2026-07-04).
    if (thermoAnnounce())
    {
        std::cout << "[builder] VLE world: electrolyte ("
                  << (isENRTL ? "eNRTL" : "Pitzer")
                  << " liquid gamma on the molality basis, idealGas vapour phi;"
                     " solvent VLE by Raoult)\n";
        // Capability honesty (no over-promise): the Pitzer adapter here is
        // PAIRWISE -- binary cation-anion interactions only.  A genuine mixed
        // multi-salt Pitzer/HMW also needs like-charge (theta) and ternary
        // (psi) terms; those are NOT included.  Say so, so the method name is
        // not read as full mixed-electrolyte Pitzer.
        if (!isENRTL)
            std::cout << "  [capability] Pitzer PAIRWISE-only (binary c-a pairs;"
                         " no like-charge theta / ternary psi) -- not full"
                         " mixed-electrolyte Pitzer/HMW.\n";
    }
    return out;
}




// ---- REACTIVE electrolyte assembly (speciation-integration spike, section
//      6b of the property authority).  The case declares, inside
//      equilibrium { formulation electrolyteGammaPhi; }:
//
//          aqueous
//          {
//              activityModel { ionic davies; }     // the ionic rung (+ an
//                                                  //   optional `molecular`
//                                                  //   backbone)
//          }
//          vapour    { fugacityModel idealGas; }
//          volatiles ( NH3 water );                // gas-liquid records serve these
//
//      The reactive shape and its master families are DERIVED from the
//      components' own `aqueousSpeciation` / `aqueousMapping` facts; the
//      `speciation { masters ( ... ); }` block that once declared them is
//      RETIRED and refused (buildV2Dispatch).
//
//      Streams stay on the APPARENT component basis; the package carries a
//      ReactiveVLE engine the flash delegates to.  Every mapping is VERIFIED
//      here (declare -> verify -> refuse): marker elements, master coverage,
//      gas-liquid records -- the ratified refusal wording when the chemistry
//      set cannot close the apparent basis.
// ============================================================================
static ThermoPackage buildReactiveElectrolyte(const DictPtr& v2,
                                              const Database& db,
                                              const DictPtr& eq,
                                              const DictPtr& aq,
                                              const ChemistrySystem* chem)
{
    // (a) models of the two phases -- the IONIC rung is the DECLARED model,
    //     verified against what the speciation kernel actually serves
    //     (davies, pitzerHMW), + an OPTIONAL molecular backbone model
    //     (mixed-solvent v1: `activityModel { ionic davies; molecular
    //     NRTL; }`); anything else refuses NAMED (never a silent
    //     downgrade).  The legacy single-word `model davies;` stays valid
    //     (ionic davies, no molecular model).
    //
    //     S5(b), 2026-08-24, the architect's close-the-seams ruling.  A
    //     davies-only guard stood here while cfg.activityModel already
    //     flowed through to the SpeciationSolver, whose factory serves
    //     pitzerHMW as well -- so the guard was the ONLY thing between the
    //     declared grammar and the served grammar, and the LLM-authoring
    //     benchmark found the drift (the engine refused the kit's own
    //     example).  edwardsPitzer stays refused HERE, and the reason is
    //     STANDARD-STATE COHERENCE, not capability: its Henry records are
    //     the Edwards-Hkgatm convention (served by the speciate op's
    //     vapour{} block), while this path's volatility comes from the
    //     gas-liquid chemistry records on the PHREEQC-gasMolal convention
    //     -- serving it would mix standard states silently, which is the
    //     D2 identity contract's one unforgivable (a hybrid nobody
    //     published).
    //  ONE reader of the slot (readAqueousActivity): `model` and `ionic`
    //  together refuse, so the advice below -- "declare `ionic ...;`" -- is
    //  read whichever spelling the case started from.
    const AqueousActivityDeclaration aqDecl = readAqueousActivity(aq);
    if (!aqDecl.declared)
        throw std::runtime_error("thermophysicalPropertySystem: the REACTIVE"
            " electrolyteGammaPhi shape declares no"
            " `equilibrium.aqueous.activityModel` -- declare the ionic rung,"
            " `activityModel { ionic davies; }` or `{ ionic pitzerHMW; }`.");
    const std::string actModel =
        aqDecl.ionic.empty() ? std::string("davies") : aqDecl.ionic;
    const std::string molecularModel = aqDecl.molecular;   // "" = none
    if (actModel == "edwardsPitzer")
        throw std::runtime_error("thermophysicalPropertySystem: the REACTIVE"
            " electrolyteGammaPhi slice does not serve edwardsPitzer, and"
            " the reason is standard-state coherence, not capability: its"
            " Henry records are the Edwards-Hkgatm convention (referenced to"
            " the water saturation pressure, unsymmetric Eq 8 gamma*),"
            " while this path's volatility comes from the gas-liquid"
            " chemistry records on the PHREEQC-gasMolal convention --"
            " mixing them would price a hybrid nobody published.  For the"
            " Edwards stack use a choupoProps speciate op with a vapour{}"
            " block (see edwards02_table7_vle); for this path declare"
            " `ionic davies;` or `ionic pitzerHMW;` IN PLACE OF the"
            " edwardsPitzer word.");
    if (actModel != "davies" && actModel != "pitzerHMW")
        throw std::runtime_error("thermophysicalPropertySystem: the REACTIVE"
            " electrolyteGammaPhi slice serves ionic davies or ionic"
            " pitzerHMW (the speciation kernel's registered engines); '"
            + actModel + "' declared.");
    //  The COMPOSITE routes were ratified ON DAVIES (mixed-solvent v1's
    //  multiplicative a_w decomposition and the second liquid's equality
    //  both carry Davies-validated postures) -- running pitzerHMW under
    //  either would be a physics claim nobody checked.  Refused by name,
    //  never silently narrowed.
    if (actModel == "pitzerHMW" && !molecularModel.empty())
        throw std::runtime_error("thermophysicalPropertySystem: the composite"
            " mixed-solvent route (`activityModel { ionic ...; molecular"
            " ...; }`) is ratified on ionic davies; pitzerHMW under the"
            " molecular backbone is its own slice (unvalidated) -- declare"
            " `ionic davies;` IN PLACE OF the pitzerHMW word (one ionic key,"
            " `model` or `ionic`, never both), or drop the backbone.");
    if (actModel == "pitzerHMW" && eq->found("organic"))
        throw std::runtime_error("thermophysicalPropertySystem: the reactive"
            " second liquid (`equilibrium { organic {...} }`) is ratified on"
            " ionic davies; pitzerHMW under the organic split is its own"
            " slice (unvalidated) -- declare `ionic davies;` IN PLACE OF the"
            " pitzerHMW word, with the organic block, or drop it.");
    //  The backbone serves the models it can actually WIRE.  NRTL and
    //  UNIQUAC need a curated record per pair (parameters/NRTL/ and
    //  parameters/UNIQUAC/ -- UNIQUAC added 2026-08-10 for the Marcilla S5b
    //  witness: the corpus carries a CITED Winkelman 2009 water/1-butanol
    //  UNIQUAC set that opens the LLE gap the UNIFAC VLE table misses);
    //  UNIFAC needs none at all -- it is predictive from the group
    //  decomposition each component already carries.  The guard that
    //  admitted only NRTL gave its own reason as "the curated pair records
    //  live in parameters/NRTL/", which is a DATA-availability argument and
    //  simply does not apply to a group-contribution method (2026-07-27).
    //  Anything else still refuses by name.
    if (!molecularModel.empty()
        && molecularModel != "NRTL" && molecularModel != "UNIFAC"
        && molecularModel != "UNIQUAC")
        throw std::runtime_error("thermophysicalPropertySystem: the molecular"
            " backbone of the reactive slice serves NRTL (curated pairs in"
            " parameters/NRTL/), UNIQUAC (curated pairs in"
            " parameters/UNIQUAC/ + each component's `uniquac { r; q; }`)"
            " or UNIFAC (predictive, from each component's"
            " declared `groups { unifac ( ... ) }`) -- '"
            + molecularModel + "' declared.");
    const std::string vap = eq->subDict("vapour")->lookupWord("fugacityModel");
    if (vap != "idealGas")
        throw std::runtime_error("thermophysicalPropertySystem: the reactive"
            " electrolyte path serves vapour idealGas in this slice ('"
            + vap + "' declared).");

    // (b) apparent components (molecular records; overlays honoured).  The
    //     aqueous solvent is DECLARED (`aqueous { solvent <name>; }`,
    //     defaulting to water as the aqueous formulation's reference) -- the
    //     classifier never recognises a solvent by name.
    const auto names = v2->lookupWordList("components");
    const std::string solventName =
        aq->found("solvent") ? aq->lookupWord("solvent") : "water";
    std::vector<Component> comps;
    comps.reserve(names.size());
    std::size_t solventIdx = names.size();
    for (const auto& cn : names)
    {
        if (cn == solventName) solventIdx = comps.size();
        comps.push_back(db.loadComponent(cn));
    }
    if (solventIdx == names.size())
        absent("the declared aqueous solvent '" + solventName + "'",
               "reactive electrolyteGammaPhi components");

    // (b2) CLASSIFY the system from canonical component facts (the
    //      ThermoResolver contract, ratified 2026-07-26): every conclusion
    //      announced, an UNKNOWN molecular component refused with the
    //      curation remedy.  No name is special-cased anywhere below.
    const SystemClassification sysc =
        classifySystem(comps, names, solventName);
    if (!sysc.refusals.empty())
    {
        std::string msg = "ThermoResolver refused the system:";
        for (const auto& r : sysc.refusals) msg += "\n  " + r;
        throw std::runtime_error(msg);
    }
    for (const auto& cc : sysc.components)
        if (cc.kind == ComponentClassification::Kind::HenrySolute)
            throw std::runtime_error("ThermoResolver: '" + cc.name
                + "' is a dissolved-gas solute (Henry convention) -- wiring"
                  " a nonionising gas through the REACTIVE shape's"
                  " gas-liquid records is a later, deliberate slice; today"
                  " give it a speciation set (if it reacts) or use the"
                  " diluteSolution world.");
    if (thermoAnnounce())
        for (const auto& line : sysc.report)
            std::cout << line << "\n";

    // (b3) the AUTHORISED-approximation profile (delimited, never global):
    //      `approximations { idealMolecularVLE { components ( ... ); } }`.
    //      The block's presence is the authorisation; the builder refuses
    //      the approximation for any component not explicitly listed, and
    //      refuses listing a component the classifier did not find
    //      MolecularNonionising (an authorisation must not reclassify).
    //  (The ONE PARSE of the block for the activity models happens earlier,
    //  at the top of buildV2Dispatch -- every formulation passes through it,
    //  this one does not.)

    std::set<std::string> idealMolecularVLE;
    std::string approximationReason;     // optional declared justification
    if (v2->found("approximations"))
    {
        auto ap = v2->subDict("approximations");
        if (ap->found("idealMolecularVLE"))
        {
            auto im = ap->subDict("idealMolecularVLE");
            for (const auto& w : im->lookupWordList("components"))
                idealMolecularVLE.insert(w);
            approximationReason = im->lookupWordOrDefault("reason", "");
        }
    }
    for (const auto& w : idealMolecularVLE)
    {
        bool ok = false;
        for (const auto& cc : sysc.components)
            if (cc.name == w
             && cc.kind == ComponentClassification::Kind::MolecularNonionising)
                ok = true;
        if (!ok)
            throw std::runtime_error("approximations.idealMolecularVLE lists"
                " '" + w + "', which the classifier did not find to be a"
                " molecular nonionising component of this system -- the"
                " authorisation is delimited and may not reclassify.");
        if (!molecularModel.empty())
            throw std::runtime_error("approximations.idealMolecularVLE lists"
                " '" + w + "' while the case ALSO declares `molecular "
                + molecularModel + ";` -- an authorisation may not shadow a"
                " declared model; drop one of the two.");
    }
    if (molecularModel.empty())
        for (const auto& cc : sysc.components)
            if (cc.kind == ComponentClassification::Kind::MolecularNonionising
             && !idealMolecularVLE.count(cc.name))
                throw std::runtime_error("ThermoResolver: no molecular"
                    " backbone model is declared (mixed-solvent v1:"
                    " `activityModel { ionic davies; molecular NRTL; }`) and"
                    " the ideal molecular VLE approximation is NOT authorised"
                    " for '" + cc.name + "' -- declare the model, authorise"
                    " the approximation at the TOP LEVEL of the system"
                    " (approximations { idealMolecularVLE { components ( "
                    + cc.name + " ); } }, beside `components`), or remove the"
                    " component.");
    //  The approximation is a DELIBERATE case override of the recommended
    //  composite mixed-solvent electrolyte v1 route -- announced as such
    //  (flash12 audit, 2026-07-26), with the case's declared reason when it
    //  carries one.  The builder never selects the approximation because it
    //  believes the recommended model unavailable: authorisation is the
    //  block's presence, nothing else.
    if (thermoAnnounce() && molecularModel.empty()
        && !idealMolecularVLE.empty())
    {
        std::cout << "[resolver] case overrides recommendation: composite"
                     " mixed-solvent electrolyte v1\n"
                     "[resolver]     -> electrolyteGammaPhi + ideal molecular"
                     " VLE for";
        for (const auto& cc : sysc.components)
            if (idealMolecularVLE.count(cc.name))
                std::cout << " " << cc.name;
        std::cout << "\n";
        if (!approximationReason.empty())
            std::cout << "[resolver] reason: " << approximationReason << "\n";
        for (const auto& cc : sysc.components)
            if (idealMolecularVLE.count(cc.name))
                std::cout <<
                    "[resolver] p_" << cc.name << " = x_" << cc.name
                    << " * psat_" << cc.name << "(T)\n"
                    "[resolver] " << cc.name << "-" << solventName
                    << " liquid nonideality neglected\n";
    }

    // (c) the apparent -> master mapping by MARKER ELEMENT (the spike's
    //     collapse contract): each non-solvent apparent component must own a
    //     unique non-H/O element; the declared master carrying that element
    //     anchors its family.  Not closable -> the ratified refusal.
    electrolyte::ReactiveVLEConfig cfg;
    cfg.apparent   = names;
    cfg.solventIdx = solventIdx;
    cfg.solventMW  = comps[solventIdx].MW() * 1.0e-3;   // g/mol -> kg/mol
    cfg.activityModel = actModel;
    //  ---- THE MASTERS ARE DERIVED, NOT DECLARED (2026-07-27) --------------
    //  A master is the species that anchors a family's total.  WHICH species
    //  that is was already decided, twice over, before any case is written:
    //  the catalogue wrote CO3 as formed FROM HCO3 (and not the reverse,
    //  because carbonate is a vanishing minority at neutral pH), and each
    //  component declares the bridge that says which family it joins.
    //
    //  So the set is exactly the union of the components' declared
    //  `aqueousMapping` targets, less H and OH -- the mediators every family
    //  shares, which anchor none.  Checked against the corpus before the
    //  change: SEVEN of seven cases that declared `masters` derive to the
    //  identical list.
    //
    //  Declaring it as well was the `introduces` sin -- a list derivable from
    //  what is already written is redundant or a trap, because the day it
    //  disagrees with the derivation nothing says which wins.  Worse, the
    //  builder was already doing the derivation: its refusals ("declared
    //  master X has no species record", "component bridges to TWO declared
    //  masters") were it checking whether a human had retyped correctly a
    //  list it could compute.  So the field is REFUSED, not merely ignored:
    //  no dual reader, no fallback.
    std::vector<std::string> masters;
    {
        if (aq->found("speciation")
            && aq->subDict("speciation")->found("masters"))
            throw std::runtime_error("thermophysicalPropertySystem: `speciation"
                " { masters ( ... ); }` is RETIRED -- the master set is DERIVED"
                " from the components' declared aqueousMapping bridges (the"
                " union of their target species, less the H/OH mediators)."
                "  Declaring it as well gives one fact two homes.  Remove the"
                " speciation block; the run announces the derived set.");
        std::set<std::string> u;
        for (std::size_t i = 0; i < names.size(); ++i)
            if (comps[i].hasAqueousMapping())
                for (const auto& ms : comps[i].aqueousMapping())
                    if (ms.species.key != "H" && ms.species.key != "OH")
                        u.insert(ms.species.key);
        masters.assign(u.begin(), u.end());
        if (thermoAnnounce())
        {
            std::cout << "[chemistry] masters DERIVED from the declared"
                         " component bridges:";
            for (const auto& m : masters) std::cout << " " << m;
            std::cout << "\n";
        }
    }
    std::set<std::string> markersSeen;
    for (std::size_t i = 0; i < names.size(); ++i)
    {
        if (i == solventIdx) continue;

        //  A MolecularNonionising component anchors NO family: it stays in
        //  the liquid composition, the balances and the enthalpy, and its
        //  VLE rides the molecular BACKBONE -- gamma = 1 when the ideal
        //  approximation is authorised, or the declared molecular model
        //  (mixed-solvent v1) when the case wires one.  Either way the
        //  route was validated above; unauthorised+unmodelled has refused.
        if (sysc.components[i].kind
            == ComponentClassification::Kind::MolecularNonionising)
        {
            auto cp = std::make_shared<Component>(db.loadComponent(names[i]));
            //  ...UNLESS it is a PERMANENT GAS.  The molecular backbone is a
            //  liquid mixture priced on the Lewis-Randall pure-liquid
            //  reference, and a species above its critical temperature has no
            //  pure liquid to reference: putting nitrogen there evaluates its
            //  Antoine correlation at 313 K against a Trange of (50, 126) and
            //  a critical temperature of 126 K -- an extrapolation of 190
            //  degrees past the point where the curve stops meaning anything,
            //  reported as a partial pressure.  A permanent gas dissolves by
            //  HENRY's law, which in this shape is its gas-liquid record, and
            //  if it carries none the ReactiveVLE constructor refuses it by
            //  name with the curation remedy (2026-07-27).
            //
            //  `noncondensable true;` is a curated component fact, not an
            //  inference from Tc -- the record states it (N2, O2, CO2).
            //  It REFUSES rather than routing itself: the Henry rung for a
            //  nonionising dissolved gas inside the REACTIVE shape is the
            //  slice this builder already names when it meets a `role solute`
            //  component, and meeting the same physics by a different fact
            //  does not make it built.  What is missing is small and specific
            //  -- the gas's DISSOLVED amount has to enter the speciation as a
            //  total, and the only record naming that species is its own
            //  gas-liquid record (`dissolvedSpecies N2`), which the solver
            //  reads and this builder does not.  Writing the bridge a second
            //  time on the component would be a second home for one fact, and
            //  the coherence gate says so in as many words: a bridge IS
            //  participation, and `aqueousSpeciation none` would then be
            //  lying (2026-07-27).
            //  A permanent gas takes the HENRY rung through its gas-liquid
            //  record.  Its FAMILY is built by ReactiveVLE's constructor, from
            //  that record's `dissolvedSpecies` -- the one curated home for
            //  which species is dissolved nitrogen.  Declaring the bridge on
            //  the component instead would be a second home for one fact, and
            //  check_resolver_coherence refuses it by name (a bridge IS
            //  participation, so `aqueousSpeciation none;` would be lying).
            //
            //  The basis-rank conclusion below is UNAFFECTED: this adds one
            //  column whose only nonzero entry is a NEW row, which raises the
            //  rank by exactly one and keeps full column rank if it held.
            if (cp->isNoncondensable())
            {
                cfg.dissolvedGases.insert(i);
                //  Carry Tc to the solver, which is the only place that also
                //  has a temperature.  "Permanent gas" is a relation between
                //  Tc and T, not a property of a substance, and THIS scope
                //  cannot see T -- see ReactiveVLEConfig::criticalTOfGas.
                cfg.criticalTOfGas[i] = cp->Tc();
                if (thermoAnnounce())
                    std::cout << "[resolver] " << names[i] << ": permanent gas"
                                 " (noncondensable) -- HENRY rung through its"
                                 " gas-liquid record, not the Raoult backbone"
                                 " (no pure liquid to reference above Tc); its"
                                 " dissolved amount is an aqueous total\n";
                continue;
            }
            cfg.nonreactive.insert(i);
            cfg.psatOf[i] =
                [cp](scalar T) { return cp->vp().Psat_Pa(T); };
            continue;
        }

        //  THE DECLARED BRIDGE, read as the stoichiometric VECTOR it is
        //  (general salt reconstruction, 2026-07-27 -- ADR
        //  docs/design/general-salt-reconstruction-proposal.md).  A component's
        //  column of the map m = A n is every declared-master term of its
        //  bridge, with its coefficient; H/OH are the shared mediators of all
        //  families and are closed by electroneutrality, so they are never
        //  declared masters and fall out here without a special case.
        //
        //  It used to pick ONE master and refuse on two, because a salt could
        //  not be represented at all.  It can now: CaCO3 contributes +1 Ca AND
        //  +1 HCO3, and the totals accumulate.  A 1-master component is the
        //  strict special case (a column with a single +1) and is unchanged.
        auto bridgeOf = [&](std::size_t ci)
            -> std::vector<std::pair<SpeciesId, scalar>>
        {
            std::vector<std::pair<SpeciesId, scalar>> out;
            if (comps[ci].hasAqueousMapping())
                for (const auto& ms : comps[ci].aqueousMapping())
                {
                    if (std::find(masters.begin(), masters.end(),
                                  ms.species.key) == masters.end())
                        continue;
                    out.emplace_back(ms.species, scalar(ms.nu));
                }
            return out;
        };

        if (comps[i].hasAqueousMapping())
        {
            auto bridge = bridgeOf(i);
            if (bridge.empty())
                throw std::runtime_error("reactive electrolyteGammaPhi:"
                    " component '" + names[i] + "' declares an aqueousMapping,"
                    " but every species it maps onto is a mediator (H/OH),"
                    " and a mediator anchors no family -- the masters are"
                    " DERIVED from the components' bridges, so name the"
                    " family's own species in this component's bridge:"
                    " `aqueousMapping ( { species <master>; nu <n>; } ... );`"
                    " on its record or its case overlay.  (The old"
                    " `speciation { masters ( ... ); }` block is RETIRED and"
                    " refused.)");
            for (const auto& [m, nu] : bridge)
            {
                (void)nu;
                // generic lookup: a master may be NEUTRAL (dissolved Ethanol,
                // O2(aq)) -- findIon is the ion-physics wrapper, not this seam
                if (!electrolyte::findAqueousSpecies(m.key))
                    throw std::runtime_error("reactive electrolyteGammaPhi:"
                        " master '" + m.key + "' (derived from the"
                        " component's aqueousMapping) has no species record"
                        " (species/<name>.dat).");
            }
            cfg.families.push_back({ i, std::string(), std::move(bridge) });
            continue;
        }

        const auto ec = parseElementalFormula(comps[i].formula());
        if (!ec.available)
            throw std::runtime_error("reactive electrolyteGammaPhi: apparent"
                " component '" + names[i] + "' has no parseable formula ("
                + ec.reason + ") -- the marker-element collapse needs one.");
        std::string marker;
        for (const auto& [el, cnt] : ec.atoms)
            if (el != "H" && el != "O")
            {
                if (!marker.empty())
                    throw std::runtime_error("reactive electrolyteGammaPhi:"
                        " apparent component '" + names[i] + "' carries TWO"
                        " candidate marker elements (" + marker + ", " + el
                        + ") -- the spike's collapse contract needs exactly"
                        " one; generalised salt reconstruction is a later,"
                        " deliberate slice.");
                marker = el;
            }
        if (marker.empty())
            throw std::runtime_error("reactive electrolyteGammaPhi: apparent"
                " component '" + names[i] + "' has no non-H/O marker element"
                " -- it cannot anchor an aqueous family distinct from the"
                " solvent.");
        if (!markersSeen.insert(marker).second)
            throw std::runtime_error("ThermoPackage build refused: two"
                " apparent components share the marker element '" + marker
                + "' -- the chemistry set cannot map all aqueous species"
                " back to the declared apparent-component basis.");
        // The declared master whose species formula carries the marker --
        //  refusing when MORE THAN ONE does (inference may never pick by
        //  declaration order; the typed bridge exists for exactly that case).
        std::vector<std::string> carrying;
        for (const auto& m : masters)
        {
            auto rec = electrolyte::findAqueousSpecies(m);
            if (!rec)
                throw std::runtime_error("reactive electrolyteGammaPhi:"
                    " derived master '" + m + "' has no species record"
                    " (species/<name>.dat).");
            const auto mec = parseElementalFormula([&]{
                // the bridged species row exposes its formula as `ion`
                std::string f = rec->lookupWordOrDefault("ion",
                                rec->lookupWordOrDefault("formula", m));
                while (!f.empty() && (f.back() == '+' || f.back() == '-'))
                    f.pop_back();
                return f; }());
            if (mec.available && mec.atoms.count(marker))
                carrying.push_back(m);
        }
        if (carrying.empty())
            throw std::runtime_error("ThermoPackage build refused: chemistry"
                " set cannot map all aqueous species back to the declared"
                " apparent-component basis -- no derived master carries the"
                " marker element '" + marker + "' of apparent component '"
                + names[i] + "'.");
        if (carrying.size() > 1)
            throw std::runtime_error("reactive electrolyteGammaPhi: two"
                " derived masters (" + carrying[0] + ", " + carrying[1]
                + ") carry the marker element '" + marker + "' of apparent"
                " component '" + names[i] + "' -- element inference cannot"
                " tell them apart; declare the typed bridge on the component"
                " (aqueousMapping ( { species <master>; nu 1; } );).");
        //  FALLBACK for an undeclared component: one marker element, one
        //  master, coefficient +1 -- exactly the old contract, kept for the
        //  records that have not declared a bridge.  A component that DOES
        //  declare one never reaches here, which is also how the
        //  shared-marker clash above stops being a problem for salts.
        cfg.families.push_back(
            { i, marker, { { SpeciesId(carrying[0]), scalar(1.0) } } });
    }

    //  ---- THE SECOND LIQUID: declared here, refused here ------------------
    //  Read and validated BEFORE any solver wiring, so an ill-formed
    //  declaration never reaches the Newton.  Absent = the reactive path is
    //  exactly what it was.
    std::vector<std::string> organicMembers;
    std::string              organicSolvent, organicReason, organicModel;
    if (eq->found("organic"))
    {
        //  EXACTLY ONE second liquid.  Two `organic` blocks parse without
        //  complaint and the LAST one wins -- so the order of the file
        //  decides which solvent is announced, while the answer comes out
        //  identical to the single-organic case because only one is ever
        //  built.  Reproduced: declaring a second block with `solvent
        //  ethanol` printed "solvent ethanol" and still returned the
        //  benzene-rich phase, which is a report that does not describe the
        //  computation.
        //
        //  A third liquid is a DECLARED limitation of this engine (one
        //  aqueous, one organic).  A limitation that refuses is a boundary;
        //  one that silently keeps the last block is a wrong answer wearing
        //  a green run.
        {
            std::size_t nOrg = 0;
            for (const auto& k : eq->keys()) if (k == "organic") ++nOrg;
            if (nOrg > 1)
                throw std::runtime_error("thermoPhysPropDict: `equilibrium`"
                    " declares " + std::to_string(nOrg) + " `organic` blocks."
                    "  This engine represents ONE second liquid (one aqueous,"
                    " one organic); a second block is parsed, announced, and"
                    " then ignored -- the file's order would decide which"
                    " solvent is reported while the answer came from the"
                    " other.  Declare one organic phase, or admit the extra"
                    " members into it.");
        }
        auto org = eq->subDict("organic");
        organicSolvent = org->lookupWord("solvent");
        organicMembers = org->lookupWordList("members");
        if (org->found("activityModel"))
        {
            const EntryValue& oev = org->entryValue("activityModel");
            organicModel = std::holds_alternative<std::string>(oev)
                ? std::get<std::string>(oev)
                : org->subDict("activityModel")->lookupWord("model");
        }
        if (org->found("reason")) organicReason = org->lookupWord("reason");

        //  (1) BOTH LIQUIDS, ONE MODEL.  The coupling is an equality of
        //  ACTIVITY -- gamma_aq x_aq = gamma_org x_org -- so the same
        //  physical state must give the same gamma on both sides.  Two
        //  models would make the residual measure their disagreement
        //  instead of the distance from equilibrium: not an approximation
        //  with an error bar, a meaningless number.
        if (molecularModel.empty())
            throw std::runtime_error("thermophysicalPropertySystem: an"
                " `organic` liquid is declared, but the aqueous phase has no"
                " `molecular` backbone model -- the two liquids are coupled"
                " by equality of ACTIVITY, so both must be priced by the SAME"
                " model.  Declare activityModel { ionic davies; molecular"
                " <NRTL|UNIQUAC|UNIFAC>; } on the aqueous phase.");
        if (!organicModel.empty() && organicModel != molecularModel)
            throw std::runtime_error("thermophysicalPropertySystem: the"
                " organic phase declares activityModel '" + organicModel
                + "' while the aqueous molecular backbone declares '"
                + molecularModel + "' -- gamma_aq x_aq = gamma_org x_org is an"
                " equality of ACTIVITY, and two different models make that"
                " residual measure their own disagreement rather than the"
                " distance from equilibrium.  Declare the same model on both,"
                " or drop the organic phase.");

        //  (2) NO IONS.  Every member must be a curated non-participant in
        //  the aqueous speciation network.  Silently dropping an ionising
        //  member would give the author an organic phase missing the very
        //  component they thought they put in it.
        //
        //  THE AQUEOUS SOLVENT IS ADMISSIBLE (2026-08-10, the marcilla01
        //  finding): a butanol-rich organic liquid is ~50 mol% water, and
        //  with the organic DRY by construction the butanol/water activity
        //  equality has NO root -- the split the paper measured was
        //  unrepresentable, not merely inaccurate.  Declaring the solvent a
        //  member prices the WET organic: its equality carries the ionic
        //  a_w factor (the multiplicative decomposition this formulation
        //  already states), and the speciation's molality basis is the
        //  aqueous liquid's water alone.  Ions still refuse -- ion
        //  partitioning into a low-permittivity solvent is different
        //  physics; water crossing is the same physics both sides already
        //  price.
        for (const auto& mn : organicMembers)
        {
            auto it = std::find(names.begin(), names.end(), mn);
            if (it == names.end())
                throw std::runtime_error("thermophysicalPropertySystem: the"
                    " organic phase lists member '" + mn + "', which is not a"
                    " component of this system.");
            const std::size_t mi = std::size_t(it - names.begin());
            const auto kind = sysc.components[mi].kind;
            if (kind == ComponentClassification::Kind::AqueousSolvent)
            {
                if (mn == organicSolvent)
                    throw std::runtime_error("thermophysicalPropertySystem:"
                        " the organic phase declares the AQUEOUS solvent '"
                        + mn + "' as its own solvent -- a second liquid whose"
                        " solvent is the aqueous solvent is the aqueous phase"
                        " wearing another name.  Declare the organic-majority"
                        " member as `solvent` and list '" + mn + "' as a"
                        " member.");
                continue;                      // wet organic: admissible
            }
            if (kind != ComponentClassification::Kind::MolecularNonionising)
                throw std::runtime_error("thermophysicalPropertySystem:"
                    " organic-phase member '" + mn + "' takes part in the"
                    " aqueous speciation network (aqueousSpeciation is not"
                    " `none`) -- this slice admits NO ions or reacting"
                    " species in the second liquid.  Ion partitioning into a"
                    " low-permittivity solvent is different physics with its"
                    " own parameters; remove the member, or model it in the"
                    " aqueous phase alone.");
        }
        if (std::find(organicMembers.begin(), organicMembers.end(),
                      organicSolvent) == organicMembers.end())
            throw std::runtime_error("thermophysicalPropertySystem: the"
                " organic phase's declared solvent '" + organicSolvent
                + "' is not in its own `members` list.");

        //  (3) THE APPROXIMATION IS ANNOUNCED, EVERY RUN.  What is excluded
        //  from this phase is not a detail: the water-solvent immiscibility
        //  that CAUSES the split is declared rather than computed, and the
        //  partition of whatever crosses rests on binaries with no ternary
        //  term.  A comment in a dict is not an announcement.
        if (thermoAnnounce())
        {
            std::cout << "[resolver] second liquid DECLARED: organic (solvent "
                      << organicSolvent << "; members";
            for (const auto& mn : organicMembers) std::cout << " " << mn;
            std::cout << ") -- priced by " << molecularModel
                      << ", the same model as the aqueous backbone\n"
                         "[resolver] APPROXIMATION: this phase exists by"
                         " DECLARATION.  The immiscibility that would cause"
                         " the split is not computed, so what partitions here"
                         " rests on binaries with no ternary term.\n";
            if (std::find(organicMembers.begin(), organicMembers.end(),
                          solventName) != organicMembers.end())
                std::cout << "[resolver] WET organic: the aqueous solvent '"
                          << solventName << "' is a declared member --"
                             " its cross-liquid equality carries the ionic"
                             " a_w factor, and the speciation's molality"
                             " basis is the aqueous liquid's solvent alone\n";
            if (!organicReason.empty())
                std::cout << "[resolver] reason: " << organicReason << "\n";
        }
        for (const auto& mn : organicMembers)
            cfg.organic.members.push_back(std::size_t(
                std::find(names.begin(), names.end(), mn) - names.begin()));
        cfg.organic.solventIdx = std::size_t(
            std::find(names.begin(), names.end(), organicSolvent)
            - names.begin());
        cfg.organic.reason = organicReason;
    }

    // (c2) the MOLECULAR BACKBONE (mixed-solvent v1, ratified 2026-07-26):
    //      the declared solvent + the nonreactive molecular components on
    //      the ion-free x-basis.  With `molecular NRTL;` declared the FULL
    //      curated pair model is wired -- never a gammaInfinity constant --
    //      and every backbone pair must have its parameters/NRTL/ record:
    //      declare -> verify -> refuse.
    //  ---- CAN THIS BASIS REPRESENT ITS OWN ANSWER?  (general salt
    //  reconstruction, 2026-07-27) ------------------------------------------
    //  The forward map m = A n always works.  The BACKWARD one -- reading the
    //  converged species state back as flowsheet components, which every
    //  stream table and every component-named report does -- is n = A^-1 m,
    //  and it is unique iff A has FULL COLUMN RANK.  A deficiency of k means
    //  k degrees of freedom: k different component vectors give the SAME
    //  species totals, so the labels are a choice and no arithmetic can make
    //  it for us.  This is the (c-1)(a-1) theorem, computed rather than
    //  assumed: c cations and a anions give exactly (c-1)(a-1).
    //
    //  Refusal, not a warning: the physics is fine either way (elements and
    //  charge cross the boundary regardless), but a report that NAMES
    //  components would be quietly picking one of k answers.  Choosing the
    //  projection convention is its own declared slice; until a case declares
    //  one, a deficient basis stops here.
    //
    //  Nothing in the corpus today is deficient -- every component is
    //  1-master with a distinct master, so A is a partial permutation and is
    //  full rank by construction.
    if (!cfg.families.empty())
    {
        //  A: rows = declared masters, columns = families.
        std::vector<std::size_t> rowOf;               // master index -> row
        std::map<std::string, std::size_t> rowIdx;
        for (const auto& m : masters)
            if (!rowIdx.count(m)) { rowIdx[m] = rowIdx.size(); rowOf.push_back(0); }
        const std::size_t nr = rowIdx.size(), nc = cfg.families.size();
        std::vector<std::vector<double>> A(nr, std::vector<double>(nc, 0.0));
        for (std::size_t c = 0; c < nc; ++c)
            for (const auto& [master, nu] : cfg.families[c].mapping)
            {
                auto it = rowIdx.find(master.key);
                if (it != rowIdx.end()) A[it->second][c] += double(nu);
            }

        //  Rank by Gaussian elimination with partial pivoting -- the same
        //  hand-rolled arithmetic NewtonND uses, on a matrix whose dimensions
        //  are single digits in every case that exists.
        std::size_t rank = 0;
        for (std::size_t c = 0; c < nc && rank < nr; ++c)
        {
            std::size_t piv = rank;
            for (std::size_t r = rank; r < nr; ++r)
                if (std::fabs(A[r][c]) > std::fabs(A[piv][c])) piv = r;
            if (std::fabs(A[piv][c]) < 1.0e-12) continue;   // no pivot here
            std::swap(A[rank], A[piv]);
            for (std::size_t r = 0; r < nr; ++r)
            {
                if (r == rank) continue;
                const double f = A[r][c] / A[rank][c];
                for (std::size_t k = c; k < nc; ++k) A[r][k] -= f * A[rank][k];
            }
            ++rank;
        }

        if (rank < nc)
        {
            std::string cols;
            for (const auto& f : cfg.families)
                cols += (cols.empty() ? "" : ", ") + cfg.apparent.at(f.apparentIdx);
            throw std::runtime_error("reactive electrolyteGammaPhi: the"
                " declared component basis (" + cols + ") maps onto "
                + std::to_string(rank) + " independent master total(s) but has "
                + std::to_string(nc) + " components -- "
                + std::to_string(nc - rank) + " degree(s) of freedom.  Reading"
                " the converged species state back as these components is"
                " therefore NOT unique: that many different component vectors"
                " give the same species totals, so any component-named report"
                " would be silently picking one of them.  The physics is"
                " unaffected (elements and charge cross the boundary either"
                " way) -- the LABELS are a choice, and a choice must be"
                " declared.  Remedy: drop a redundant component from the"
                " case's basis, or wait for the declared projection"
                " convention (a named, separate slice).");
        }
        if (thermoAnnounce())
            std::cout << "[basis] component -> master map: " << nc
                      << " component(s), rank " << rank
                      << " -- the converged state reads back uniquely\n";
    }

    //  ---- THE ADMITTED SOLIDS reach the kernel (2026-07-27) ---------------
    //  constant/chemistryDict says WHICH solid phases this system may form;
    //  the speciation kernel already precipitates them, multi-mineral, with
    //  an active-set complementarity and the H+ leg fed back.  Until now the
    //  reactive flash simply never asked -- it recorded the list and reported
    //  saturation indices climbing past zero while forming nothing.
    //
    //  The list is passed through UNFILTERED and UNTRUNCATED: every phase the
    //  case admits, in the order it declared them, because the kernel serves
    //  them together.  (The single-salt Pitzer adapter is the one that can
    //  only carry one, and it refuses a longer list rather than picking.)
    if (chem && chem->present && !chem->solidPhases.empty())
    {
        cfg.admittedSolids = chem->solidPhases;
        //  WHO OWNS each admitted phase.  Declared, never guessed: a
        //  component's own record names the solid phases it can form
        //  (`solidPhases { calcite { ... } }`), which is the same block the
        //  crystal properties are read from.  Matching `calcite` to `CaCO3`
        //  by name or formula would be the kind of similarity inference this
        //  tree bans everywhere else, and it would be wrong the first time a
        //  polymorph pair (calcite / aragonite) both resolved.
        for (std::size_t i = 0; i < comps.size(); ++i)
        {
            const fs::path sp = records::componentBase(comps[i].name());
            if (!fs::exists(sp)) continue;
            DictPtr rec = Dictionary::fromFile(sp.string());
            if (rec)
                rec = Database::applyCaseOverlay(comps[i].name(), rec,
                                                 sp.string()).dict;
            if (!rec || !rec->found("solidPhases")) continue;
            auto sp_d = rec->subDict("solidPhases");
            for (const auto& phase : cfg.admittedSolids)
                if (sp_d->found(phase) && !cfg.solidOwner.count(phase))
                    cfg.solidOwner[phase] = i;
        }
        if (thermoAnnounce())
        {
            std::cout << "[chemistry] admitted solid phase(s):";
            for (const auto& s : cfg.admittedSolids)
            {
                std::cout << " " << s;
                auto it = cfg.solidOwner.find(s);
                if (it != cfg.solidOwner.end())
                    std::cout << " (" << comps[it->second].name() << ")";
                else std::cout << " (no declared owner -- stays in the report)";
            }
            std::cout << " -- they may precipitate to their SI = 0 ceiling."
                         "  A CEILING, not a deposition rate: infinite time,"
                         " no nucleation barrier.\n";
        }
    }

    cfg.molecularModelName = molecularModel;
    cfg.backbone.push_back(solventIdx);
    for (std::size_t i = 0; i < names.size(); ++i)
        if (cfg.nonreactive.count(i)) cfg.backbone.push_back(i);
    //  UNIFAC backbone: no pair records, so nothing to resolve or verify --
    //  but it is an ESTIMATE, and it says so on every run.  A student reading
    //  a group-contribution gamma must never mistake it for a regressed one.
    if (molecularModel == "UNIFAC")
    {
        std::vector<std::string> bNames;
        for (auto b : cfg.backbone) bNames.push_back(names[b]);
        auto bComps = std::make_shared<std::vector<Component>>();
        for (const auto& bn : bNames)
        {
            Component c = db.loadComponent(bn);
            if (!c.hasGroups("unifac"))
                throw std::runtime_error("thermophysicalPropertySystem:"
                    " `molecular UNIFAC;` declared, but backbone component '"
                    + bn + "' carries no `groups { unifac ( ... ) }` block --"
                    " curate its group decomposition, or declare NRTL with"
                    " curated pairs instead.");
            bComps->push_back(std::move(c));
        }
        auto activityDict = std::make_shared<Dictionary>("activity");
        activityDict->insert("model", std::string("UNIFAC"));
        //  The decomposition lives in each component's .dat and is resolved
        //  HERE, at the site that holds the Component objects -- so a
        //  case-local component overlay is respected.  Same helper the
        //  molecular gammaPhi path uses; there is one injection contract, not
        //  two.
        const DictPtr injected =
            injectUnifacGroups(activityDict, bNames, *bComps);
        std::shared_ptr<ActivityModel> mm(
            ActivityModel::New(injected, *bComps));
        cfg.molecularGamma =
            [mm, bComps](scalar T, const sVector& x) -> sVector
            { return mm->gamma(T, x); };
        if (thermoAnnounce())
        {
            std::cout << "[resolver] liquid molecular backbone: UNIFAC (";
            for (std::size_t bi = 0; bi < bNames.size(); ++bi)
                std::cout << (bi ? " " : "") << bNames[bi];
            std::cout << ") -- PREDICTIVE group contribution, an ESTIMATE:"
                         " no pair was regressed for this system\n"
                         "[resolver] ions: Davies on water-referenced"
                         " molality (mixed-solvent transfer term: named"
                         " gap)\n";
        }
    }

    if (molecularModel == "NRTL")
    {
        std::vector<std::string> bNames;
        for (auto b : cfg.backbone) bNames.push_back(names[b]);
        auto bComps = std::make_shared<std::vector<Component>>();
        for (const auto& bn : bNames)
            bComps->push_back(db.loadComponent(bn));
        auto activityDict = std::make_shared<Dictionary>("activity");
        activityDict->insert("model", std::string("NRTL"));
        std::vector<DictPtr> pairDicts;
        for (std::size_t bi = 0; bi < bNames.size(); ++bi)
            for (std::size_t bj = bi + 1; bj < bNames.size(); ++bj)
            {
                std::string a = bNames[bi], b = bNames[bj];
                if (b < a) std::swap(a, b);
                const std::string rel = "parameters/NRTL/" + a + "-" + b
                                        + ".dat";
                fs::path rec = records::resolveRecord(rel);
                if (rec.empty() || !fs::exists(rec))
                    throw std::runtime_error("thermophysicalPropertySystem:"
                        " `molecular NRTL;` declared, but the backbone pair"
                        " record data/standards/" + rel + " (or the sealed"
                        " case-local constant/" + rel + ") does not exist --"
                        " curate the pair or drop the molecular model.");
                DictPtr r = Dictionary::fromFile(rec.string());
                DictPtr coef = r->found("parameters") ? r->subDict("parameters")
                                                      : r;
                auto p = std::make_shared<Dictionary>(a + "-" + b);
                for (const auto& k : coef->keys())
                {
                    const EntryValue& ev2 = coef->entryValue(k);
                    if (std::holds_alternative<scalar>(ev2)
                        || std::holds_alternative<std::string>(ev2))
                        p->insert(k, ev2);
                }
                pairDicts.push_back(p);
                if (thermoAnnounce())
                    std::cout << "[builder] molecular backbone pair " << a
                              << "-" << b << "  --- " << rec.string() << "\n";
            }
        activityDict->insert("pairs", EntryValue(pairDicts));
        std::shared_ptr<ActivityModel> mm(
            ActivityModel::New(activityDict, *bComps));
        cfg.molecularGamma =
            [mm, bComps](scalar T, const sVector& x) -> sVector
            { return mm->gamma(T, x); };
        if (thermoAnnounce())
        {
            std::cout << "[resolver] liquid molecular backbone: NRTL (";
            for (std::size_t bi = 0; bi < bNames.size(); ++bi)
                std::cout << (bi ? " " : "") << bNames[bi];
            std::cout << ") -- curated pair records (composite mixed-solvent electrolyte v1)\n"
                         "[resolver] ions: Davies on water-referenced"
                         " molality (mixed-solvent transfer term: named"
                         " gap)\n";
            for (const auto& cc : sysc.components)
                if (cc.kind
                    == ComponentClassification::Kind::MolecularNonionising)
                    std::cout << "[resolver] p_" << cc.name << " = gamma_NRTL"
                              << " * x_" << cc.name << " * psat_" << cc.name
                              << "(T)\n";
        }
    }

    //  UNIQUAC backbone (2026-08-10, the Marcilla S5b remedy): the same
    //  record-per-pair posture as NRTL -- parameters/UNIQUAC/<a>-<b>.dat,
    //  case-local overlay honoured through the same resolveRecord seam --
    //  plus each component's own `uniquac { r; q; }` structural constants,
    //  injected by the ONE helper every other UNIQUAC consumer uses.  The
    //  tau form is Winkelman's a + b*T + c*T^2 (the UNIQUAC.cpp contract).
    if (molecularModel == "UNIQUAC")
    {
        std::vector<std::string> bNames;
        for (auto b : cfg.backbone) bNames.push_back(names[b]);
        auto bComps = std::make_shared<std::vector<Component>>();
        for (const auto& bn : bNames)
            bComps->push_back(db.loadComponent(bn));
        auto activityDict = std::make_shared<Dictionary>("activity");
        activityDict->insert("model", std::string("UNIQUAC"));
        std::vector<DictPtr> pairDicts;
        for (std::size_t bi = 0; bi < bNames.size(); ++bi)
            for (std::size_t bj = bi + 1; bj < bNames.size(); ++bj)
            {
                std::string a = bNames[bi], b = bNames[bj];
                if (b < a) std::swap(a, b);
                const std::string rel = "parameters/UNIQUAC/" + a + "-" + b
                                        + ".dat";
                fs::path rec = records::resolveRecord(rel);
                if (rec.empty() || !fs::exists(rec))
                    throw std::runtime_error("thermophysicalPropertySystem:"
                        " `molecular UNIQUAC;` declared, but the backbone"
                        " pair record data/standards/" + rel + " (or the"
                        " sealed case-local constant/" + rel + ") does not"
                        " exist -- curate the pair or drop the molecular"
                        " model.");
                DictPtr r = Dictionary::fromFile(rec.string());
                DictPtr coef = r->found("parameters") ? r->subDict("parameters")
                                                      : r;
                auto p = std::make_shared<Dictionary>(a + "-" + b);
                for (const auto& k : coef->keys())
                {
                    const EntryValue& ev2 = coef->entryValue(k);
                    if (std::holds_alternative<scalar>(ev2)
                        || std::holds_alternative<std::string>(ev2))
                        p->insert(k, ev2);
                }
                pairDicts.push_back(p);
                if (thermoAnnounce())
                    std::cout << "[builder] molecular backbone pair " << a
                              << "-" << b << "  --- " << rec.string() << "\n";
            }
        activityDict->insert("pairs", EntryValue(pairDicts));
        injectUniquacRQ(activityDict, bNames, *bComps);
        std::shared_ptr<ActivityModel> mm(
            ActivityModel::New(activityDict, *bComps));
        cfg.molecularGamma =
            [mm, bComps](scalar T, const sVector& x) -> sVector
            { return mm->gamma(T, x); };
        if (thermoAnnounce())
        {
            std::cout << "[resolver] liquid molecular backbone: UNIQUAC (";
            for (std::size_t bi = 0; bi < bNames.size(); ++bi)
                std::cout << (bi ? " " : "") << bNames[bi];
            std::cout << ") -- curated pair records, tau = exp(-(a + b T +"
                         " c T^2)/T), r/q from each component's own record\n"
                         "[resolver] ions: Davies on water-referenced"
                         " molality (mixed-solvent transfer term: named"
                         " gap)\n";
        }
    }

    // (d) volatiles: each is an apparent component served by a gas-liquid
    //     record keyed by the component's FORMULA (water -> H2O).
    //  ONE home: `equilibrium { volatiles ( ... ); }`.  The top-level copy
    //  this loop used to fall back on is refused by name in build()
    //  (refuseRetiredTopLevel), so an absent list is simply empty here and
    //  the named refusal below fires.
    for (const auto& vn : eq->found("volatiles")
                              ? eq->lookupWordList("volatiles")
                              : std::vector<std::string>{})
    {
        std::size_t idx = names.size();
        for (std::size_t i = 0; i < names.size(); ++i)
            if (names[i] == vn) { idx = i; break; }
        if (idx == names.size())
            throw std::runtime_error("reactive electrolyteGammaPhi: volatile"
                " '" + vn + "' is not a declared apparent component.");
        cfg.volatiles.push_back(idx);
        //  A nonreactive molecular volatile rides its own psat (ideal
        //  Raoult, authorised) -- no gas-liquid record, so no gas key.
        if (cfg.nonreactive.count(idx)) continue;
        cfg.gasOf[idx] = comps[idx].formula().empty() ? vn
                                                      : comps[idx].formula();
    }
    if (cfg.volatiles.empty())
        throw std::runtime_error("reactive electrolyteGammaPhi: no volatiles"
            " declared in `equilibrium { volatiles ( ... ); }` -- a reactive"
            " VLE with no transferable species is a speciation-only problem"
            " (use the props speciate op).");

    //  The banner states the model that RUNS, never a fixed word (the
    //  Edwards lesson, 2026-08-04: a banner keyed on one model and
    //  defaulting for the rest describes a model that is not running --
    //  this line said "davies" verbatim on the first pitzerHMW run).
    if (thermoAnnounce())
        std::cout << "[v2 native] equilibrium electrolyteGammaPhi (REACTIVE"
                     " speciation shape): aqueous " << actModel
                  << " speciation network +"
                     " gas-liquid transfer records; ions excluded from the"
                     " vapour; streams stay on the APPARENT component basis"
                     " (unit-local speciation, section 6b).\n";

    // (e) base molecular package (H, density, stream plumbing) + the engine.
    //     The ReactiveVLE constructor re-verifies every record it will need
    //     (gas-liquid entries, master coverage) -- assembly-time refusals.
    ThermoPackage out;
    auto idealAct = std::make_shared<Dictionary>("activityModel");
    idealAct->insert("model", std::string("ideal"));
    auto eosDict = std::make_shared<Dictionary>("equationOfState");
    eosDict->insert("model", std::string("idealGas"));
    out.assembleTwoPhase(names, idealAct, eosDict, "gammaPhi", db);
    out.adoptReactiveEngine(
        std::make_unique<electrolyte::ReactiveVLE>(std::move(cfg)));
    return out;
}

// ============================================================================
// THE case grammar: recordType thermophysicalPropertySystem, schemaVersion 2
// -- physically-decomposed blocks (equilibrium / caloric / volumetric /
// transport / pureFluids / aqueousProperties), every route DECLARED and
// VERIFIED against what the engine implements; a route that does not match
// REFUSES loudly (never a decorative declaration).  The dispatch below
// assembles each formulation directly from its authored sub-blocks.

// THE aqueous-chemistry declaration, hoisted OUT of the formulation.
//
// `equilibrium { aqueous { ... } }` used to be readable only inside
// `formulation electrolyteGammaPhi`, which demands `volatiles` -- so a
// liquid-only electrolyte case (an RO vessel speciating its brine for a
// scaling audit) had no way to declare its chemistry at all.  It wrote the
// harmless placeholder `gammaPhi / ideal` and the unit op invented an
// activity model of its own.  A hidden default is what a grammar with no slot
// for the truth produces; the cure is the slot, not a rule against defaults.
//
// The declaration is now read for EVERY formulation, and the admitted solid
// phases ride in from constant/chemistryDict (WHICH equilibria/phases belong
// to this system) -- so a unit asking "what may precipitate here?" and "on
// which activity model?" has ONE declared answer to read.
ThermoPackage ThermoPackageBuilder::buildV2(const DictPtr& v2, const Database& db,
                                            const ChemistrySystem* chem)
{
    ThermoPackage out = buildV2Dispatch(v2, db, chem);

    auto eq = v2->subDict("equilibrium");
    const bool hasAq = eq->found("aqueous");
    if (hasAq || (chem && !chem->solidPhases.empty()))
    {
        ThermoPackage::AqueousChemistry aq;
        if (hasAq)
        {
            auto a = eq->subDict("aqueous");
            //  `model <w>;` == `ionic <w>;` -- the aqueous chemistry's model
            //  is the IONIC surface either way (the molecular backbone is
            //  phase VLE, not speciation).  ONE reader of the slot, so both
            //  keys together refuse here exactly as in the assemblies.
            const AqueousActivityDeclaration decl = readAqueousActivity(a);
            if (decl.declared)
                aq.activityModel =
                    decl.ionic.empty() ? std::string("davies") : decl.ionic;
            if (a->found("speciation"))
            {
                auto sp = a->subDict("speciation");
                if (sp->found("masters")) aq.masters = sp->lookupWordList("masters");
                aq.speciationBlock = sp;   // D-R1: the networkScope trio rides
                                           // whole to the ONE parse in the solver
            }
        }
        if (chem) aq.solidPhases = chem->solidPhases;

        // THE BRIDGE: each component's DECLARED aqueous mapping (its
        // `aqueousMapping` block, or `dissociatesTo` converted at load),
        // collected here so the two identity spaces meet in exactly one
        // audited seam.  No declaration, no bridge -- and a unit that needs
        // one refuses by component name.  (Existence of each target species
        // is enforced at the use boundary -- findAqueousSpecies /
        // SpeciationSolver -- where the case's sealed closure is the law.)
        for (const auto& c : out.components())
            if (c.hasAqueousMapping())
                aq.aqueousMapping[ComponentId(c.name())] = c.aqueousMapping();

        out.declareAqueousChemistry(std::move(aq));
    }
    return out;
}

ThermoPackage ThermoPackageBuilder::build(const DictPtr& pkg, const Database& db,
                                          const ChemistrySystem* chem)
{
    // The active-chemistry SELECTION lives in constant/chemistryDict and
    // arrives as the `chem` object -- never inside the system dict.
    refuseRetiredTopLevel(pkg);
    refuseUnreadAqueousKeys(pkg);
    if (pkg->found("chemistry"))
        throw std::runtime_error("thermophysicalPropertySystem: the"
            " active-chemistry selection is not declared here -- it lives in"
            " constant/chemistryDict (recordType chemistrySystem;"
            " equilibria { solidPhases ( ... ); }).");
    // ONE dispatch point, EXHAUSTIVE: an implemented formulation assembles
    // directly; everything else gets a NAMED refusal, never a silent path.
    if (pkg->lookupWordOrDefault("recordType", "") == "thermophysicalPropertySystem")
    {
        if (pkg->lookupScalarOrDefault("schemaVersion", 0) != 2)
            throw std::runtime_error("thermophysicalPropertySystem requires"
                " schemaVersion 2;");
        if (v2NativeFormulation(pkg))
            return buildV2(pkg, db, chem);
        if (pkg->found("aqueousProperties"))
            throw std::runtime_error("thermophysicalPropertySystem: an"
                " aqueousProperties system is read by the speciation ops"
                " (caseAqueousSurface) and choupoProps builds its solvent"
                " basis -- a full ThermoPackage build from it is not a"
                " defined operation.");
        if (!pkg->found("equilibrium"))
            throw std::runtime_error("thermophysicalPropertySystem: required"
                " block 'equilibrium' (or aqueousProperties) is absent.");
        const std::string f = pkg->subDict("equilibrium")
                                 ->lookupWordOrDefault("formulation", "");
        if (pkg->found("transport") || pkg->found("pureFluids"))
            throw std::runtime_error("thermophysicalPropertySystem:"
                " transport/pureFluids on formulation '" + f + "' is not"
                " wired natively -- name the concrete case (the gammaPhi"
                " wiring exists; extending it is a per-formulation act,"
                " never a silent drop).");
        throw std::runtime_error("thermophysicalPropertySystem: formulation '"
            + f + "' is not implemented -- have: gammaPhi | gammaGamma |"
            " phiPhi | diluteSolution | electrolyteGammaPhi (+"
            " aqueousProperties read by the speciation ops).");
    }

    throw std::runtime_error("ThermoPackageBuilder::build: the case system"
        " must declare `recordType thermophysicalPropertySystem;` -- that is"
        " the ONE case grammar.");
}

// ---- The formulation dispatch: the authored equilibrium{} block is read
// directly and the package assembled via the ThermoPackage assemblies.

bool ThermoPackageBuilder::v2NativeFormulation(const DictPtr& v2)
{
    if (!v2->found("equilibrium")) return false;
    auto eq = v2->subDict("equilibrium");
    const std::string form = eq->lookupWordOrDefault("formulation", "");
    // The active-chemistry selection lives in constant/chemistryDict; a
    // stray inline block lands on the dispatch's loud refusal.
    if (v2->found("chemistry")) return false;
    // The activeComponents pair-domain projection (forum M6) is wired
    // natively for the gamma worlds; other formulations do not consume it.
    if (v2->found("activeComponents")
        && form != "gammaPhi" && form != "gammaGamma")
        return false;
    if (form == "gammaPhi")
    {
        // Every authored gammaPhi shape: ideal/word, source pairs, inline
        // pairs, a cosmoSAC set selector, transport, pureFluids.  Explicit
        // `phases` stays out (that IS gammaGamma).
        if (v2->found("phases")) return false;
        return eq->subDict("liquid")->found("activityModel");
    }
    // The other formulations carry no transport/pureFluids wiring yet -- a
    // system declaring them lands on the dispatch's named refusal.
    if (v2->found("transport") || v2->found("pureFluids"))
        return false;
    if (form == "phiPhi") return true;
    if (form == "gammaGamma") return true;   // both pair forms wired natively
    if (form == "diluteSolution") return true;
    if (form == "electrolyteGammaPhi") return true;
    return false;
}

// The formulation dispatch proper.  Wrapped by buildV2 below, which attaches
// the DECLARED AQUEOUS CHEMISTRY -- a declaration that must not depend on
// which phase equilibrium (if any) the case computes.
static ThermoPackage buildV2Dispatch(const DictPtr& v2, const Database& db,
                                     const ChemistrySystem* chem)
{
    (void)chem;   // consumed by the electrolyte formulation only

    //  THE ONE PARSE of the case's authorised approximations.  It sits HERE,
    //  at the single dispatch every v2 formulation passes through, and not
    //  beside the `idealMolecularVLE` reader inside the electrolyte branch --
    //  a parse reachable on one formulation out of five would leave the other
    //  four in the NotRead state, and NotRead means "may not refuse".  The
    //  authorisation would then be silently unenforceable on exactly the
    //  molecular cases the contract exists for.
    //
    //  Activity models see only their own sub-dict and can never reach the
    //  top level; they consult ApproximationAuthorisation instead of
    //  re-parsing -- one parse, several callers, never a second copy.
    ApproximationAuthorisation::instance().readFrom(v2);

    if (!ThermoPackageBuilder::v2NativeFormulation(v2))
        throw std::runtime_error("ThermoPackageBuilder::buildV2: this system's"
            " formulation/shape is not on the native path yet -- gate the"
            " call with v2NativeFormulation().");
    if (!v2->found("components"))
        throw std::runtime_error("thermophysicalPropertySystem: required key"
            " 'components' is absent");
    auto eq = v2->subDict("equilibrium");
    const std::string form = eq->lookupWord("formulation");

    //  The authorisation has ONE home, the TOP LEVEL (parsed just above).
    //  Written inside equilibrium{} -- the natural place to put it, beside
    //  the models it qualifies -- it was never read: measured, the resolver
    //  refusal that advises the block kept firing, and on a case that needed
    //  no authorisation the block sat there in silence.  Refused by name.
    if (eq->found("approximations"))
        throw std::runtime_error("thermophysicalPropertySystem:"
            " `approximations { ... }` is declared inside `equilibrium {}`,"
            " where nothing reads it -- it lives at the TOP LEVEL of the"
            " system, beside `components`.  Move the block out of"
            " equilibrium{}.");

    // Declared caloric routes must state what runs (declared+verified).
    DictPtr cal = v2->found("caloric") ? v2->subDict("caloric") : nullptr;
    if (cal && cal->found("energyBasis")
        && cal->lookupWord("energyBasis") != "elementsDatum")
        throw std::runtime_error("thermophysicalPropertySystem: "
            "caloric.energyBasis '" + cal->lookupWord("energyBasis")
            + "' -- the engine carries ONE enthalpy datum (the elements at"
            " 298.15 K): declare `energyBasis elementsDatum;`.");
    auto verifyCal = [&](const char* phase, const char* key,
                         const std::string& implemented)
    {
        if (!cal || !cal->found(phase)) return;
        auto ph = cal->subDict(phase);
        if (ph->found(key) && ph->lookupWord(key) != implemented)
            throw std::runtime_error("thermophysicalPropertySystem: caloric."
                + std::string(phase) + "." + key + " '" + ph->lookupWord(key)
                + "' is DECLARED but the engine implements '" + implemented
                + "' for this formulation -- a route declaration must state"
                " what runs.");
    };

    // Pair resolution shared by gammaPhi and gammaGamma: an activityModel
    // block's binaryParameters entries -- `source "file"` loads the ONE
    // curated record (citation announced); an inline coefficient block is
    // copied verbatim (entry values, full precision; nested provenance
    // sub-blocks skipped).
    const fs::path repoRoot = fs::path(Database::currentRoot()).parent_path();
    auto resolveActivity = [&](const DictPtr& am) -> DictPtr
    {
        auto activityDict = std::make_shared<Dictionary>("activity");
        activityDict->insert("model", am->lookupWord("model"));
        if (!am->found("binaryParameters")) return activityDict;
        auto bp = am->subDict("binaryParameters");
        std::vector<DictPtr> pairDicts;
        for (const auto& pr : bp->keys())
        {
            auto pd = bp->subDict(pr);
            DictPtr coef = pd;
            if (pd->found("source"))
            {
                const std::string src = pd->lookupWord("source");
                coef = loadRec(resolveDeclared(repoRoot, src),
                               "binary pair " + pr);
                if (coef->found("parameters")) coef = coef->subDict("parameters");
                if (thermoAnnounce())
                    std::cout << "[builder] binary pair " << pr
                              << "  --- " << src << "\n";
            }
            auto p = std::make_shared<Dictionary>(pr);
            for (const auto& k : coef->keys())
            {
                const EntryValue& ev = coef->entryValue(k);
                if (std::holds_alternative<scalar>(ev)
                    || std::holds_alternative<std::string>(ev))
                    p->insert(k, ev);        // verbatim; skip nested blocks
            }
            pairDicts.push_back(p);
        }
        if (!pairDicts.empty())
            activityDict->insert("pairs", EntryValue(pairDicts));
        return activityDict;
    };

    if (form == "gammaGamma")
    {
        //  C3 (ruled 2026-08-08, migration S4a): the UNIFORM declaration --
        //  `equilibrium.phases ( { name ...; type liquid|vapor|solid; ... } )`
        //  -- COEXISTS with the liquidPhases/vapour form; declaring both is
        //  two authorities on one phase set and refuses.  A `solid` entry
        //  carries `component <name>;` (+ optional `mode`) to the Phase
        //  factory's SolidPhase, whose own refusals name any missing datum.
        //  What CONSUMES a declared solid is the flash's business (S4b) --
        //  today it refuses with both routes named, and that refusal
        //  becoming REACHABLE from a case is exactly this slice's point.
        const bool uniform = eq->found("phases");
        if (uniform && (eq->found("liquidPhases") || eq->found("vapour")))
            throw std::runtime_error("thermophysicalPropertySystem: "
                "equilibrium declares BOTH the uniform `phases ( ... )` list "
                "and the liquidPhases/vapour form -- two authorities on one "
                "phase set.  Keep exactly one.");
        if (!uniform && !eq->found("liquidPhases"))
            throw std::runtime_error("thermophysicalPropertySystem: required"
                " key 'equilibrium.liquidPhases ( { name } ... )' is absent"
                " (or declare the uniform `phases ( { name; type; ... } ... )`"
                " list)");
        // ONE fact in ONE home: coexisting liquids share the activity model
        // declared at equilibrium.liquid; a phase overrides only when its
        // model is intentionally different.
        DictPtr shared;
        if (eq->found("liquid") && eq->subDict("liquid")->found("activityModel"))
            shared = eq->subDict("liquid")->subDict("activityModel");
        std::vector<DictPtr> phaseConfigs;
        std::string phaseNames;
        if (uniform)
        {
            for (const auto& ph : eq->lookupDictList("phases"))
            {
                const std::string pname = ph->lookupWord("name");
                const std::string ptype = ph->lookupWord("type");
                phaseNames += (phaseNames.empty() ? "" : ", ") + pname
                            + " (" + ptype + ")";
                auto pc = std::make_shared<Dictionary>(pname);
                pc->insert("name", pname);
                pc->insert("type", ptype);
                if (ptype == "liquid")
                {
                    DictPtr am = ph->found("activityModel")
                               ? ph->subDict("activityModel") : shared;
                    if (!am)
                        throw std::runtime_error("thermophysicalPropertySystem:"
                            " phases entry '" + pname + "' (liquid) has no"
                            " activityModel and equilibrium.liquid declares no"
                            " shared one.");
                    auto act = resolveActivity(am);
                    if (v2->found("activeComponents"))
                        act->insert("activeComponents",
                                    v2->entryValue("activeComponents"));
                    if (v2->found("binaryPairsBase"))
                        act->insert("binaryPairsBase",
                                    v2->entryValue("binaryPairsBase"));
                    pc->insert("activity", EntryValue(act));
                }
                else if (ptype == "vapor" || ptype == "vapour")
                {
                    pc->insert("type", std::string("vapor"));
                    auto ed = std::make_shared<Dictionary>("eos");
                    ed->insert("model", ph->lookupWord("fugacityModel"));
                    pc->insert("eos", EntryValue(ed));
                }
                else if (ptype == "solid")
                {
                    //  The crystal's identity travels; SolidPhase itself
                    //  refuses a missing `component` with the remedy.
                    if (ph->found("component"))
                        pc->insert("component", ph->entryValue("component"));
                    pc->insert("mode", ph->found("mode")
                        ? ph->entryValue("mode")
                        : EntryValue(std::string("crystallizing")));
                }
                else
                    throw std::runtime_error("thermophysicalPropertySystem: "
                        "phases entry '" + pname + "' declares type '" + ptype
                        + "' -- the uniform list knows liquid, vapor and "
                        "solid.");
                phaseConfigs.push_back(pc);
            }
            if (thermoAnnounce())
                std::cout << "[v2 native] equilibrium gammaGamma, UNIFORM "
                             "phases list: " << phaseNames
                          << " -- ONE Gibbs surface per phase (C3 grammar).\n";
            ThermoPackage out;
            out.assembleNamedPhases(v2->lookupWordList("components"),
                                    phaseConfigs, db);
            return out;
        }
        for (const auto& ph : eq->lookupDictList("liquidPhases"))
        {
            const std::string pname = ph->lookupWord("name");
            phaseNames += (phaseNames.empty() ? "" : ", ") + pname;
            DictPtr am = ph->found("activityModel") ? ph->subDict("activityModel")
                                                    : shared;
            if (!am)
                throw std::runtime_error("thermophysicalPropertySystem:"
                    " gammaGamma phase '" + pname + "' has no activityModel and"
                    " equilibrium.liquid declares no shared one.");
            auto pc = std::make_shared<Dictionary>(pname);
            pc->insert("name", pname);
            pc->insert("type", std::string("liquid"));
            // Each phase OWNS its activity config (resolveActivity builds a
            // fresh dict per call -- no shared mutation between phases).
            auto act = resolveActivity(am);
            if (v2->found("activeComponents"))
                act->insert("activeComponents",
                            v2->entryValue("activeComponents"));
            if (v2->found("binaryPairsBase"))
                act->insert("binaryPairsBase",
                            v2->entryValue("binaryPairsBase"));
            pc->insert("activity", EntryValue(act));
            phaseConfigs.push_back(pc);
        }
        if (eq->found("vapour"))
        {
            const std::string vap =
                eq->subDict("vapour")->lookupWord("fugacityModel");
            auto ed = std::make_shared<Dictionary>("eos");
            ed->insert("model", vap);
            auto pc = std::make_shared<Dictionary>("vapor");
            pc->insert("name", std::string("vapor"));
            pc->insert("type", std::string("vapor"));
            pc->insert("eos",  EntryValue(ed));
            phaseConfigs.push_back(pc);
        }
        if (thermoAnnounce())
            std::cout << "[v2 native] equilibrium gammaGamma: named liquid"
                         " phases (" << phaseNames << ") each on its own gamma"
                         " surface"
                      << (eq->found("vapour") ? ", vapour phi present (VLLE)"
                                              : ", no vapour (LLE)")
                      << " -- ONE Gibbs surface per phase, split by direct"
                         " minimisation.  Assembled NATIVELY from the v2"
                         " grammar (no translated intermediate).\n";
        ThermoPackage out;
        out.assembleNamedPhases(v2->lookupWordList("components"),
                                phaseConfigs, db);
        return out;
    }

    if (form == "electrolyteGammaPhi")
    {
        // The electrolyte world: aqueous Pitzer/eNRTL on the molality basis,
        // idealGas vapour (Raoult solvent VLE); the record-driven electrolyte
        // assembly consumes the chem OBJECT for its active salt.
        //
        // REACTIVE shape (speciation-integration spike, section 6b): an
        // `aqueous { speciation {...} }` block declares the coupled
        // chemical + phase equilibrium of volatile weak electrolytes --
        // dispatched to its own assembly below, same formulation family
        // (never a sixth formulation).
        auto aq = eq->subDict("aqueous");

        //  THE REACTIVE SHAPE IS DERIVED FROM A FACT (2026-07-27), not
        //  selected by the presence of a block.  A system is reactive when a
        //  component DECLARES that it joins an aqueous speciation network --
        //  `aqueousSpeciation <setName>;`, the canonical substance-level fact
        //  the classifier already reads.  Nothing else can decide it: a case
        //  cannot make a salt reactive by writing a block, nor make ammonia
        //  unreactive by omitting one.
        //
        //  Checked over the corpus before the change: 22 electrolyteGammaPhi
        //  cases, and the split is exact -- every case that declared a
        //  `speciation` block has at least one component carrying the fact,
        //  and every case without one has none.  The block was a second name
        //  for something already written on the substances.
        if (aq->found("speciation"))
            throw std::runtime_error("thermophysicalPropertySystem: the"
                " `aqueous { speciation { ... } }` block is RETIRED.  Which"
                " species anchor the families, and whether the system is"
                " reactive at all, are DERIVED from the components' own"
                " declared facts (`aqueousSpeciation` and `aqueousMapping`)"
                " -- writing them here gives one fact two homes.  Remove the"
                " block; the run announces what it derived.");

        bool reactiveShape = false;
        for (const auto& cn : v2->lookupWordList("components"))
        {
            const Component c = db.loadComponent(cn);
            if (c.aqueousSpeciationDeclared() && c.aqueousSpeciation() != "none")
            { reactiveShape = true; break; }
        }
        if (reactiveShape)
        {
            return buildReactiveElectrolyte(v2, db, eq, aq, chem);
        }
        //  ONE reader of the slot.  The single-salt Pitzer/eNRTL adapter has
        //  no molecular backbone -- the composite `molecular <w>;` is served
        //  by the REACTIVE shape alone -- so a declared backbone here was
        //  dropped in silence (measured: `{ model Pitzer; molecular NRTL; }`
        //  ran Pitzer alone at exit 0).  It refuses now, naming the route
        //  that does serve it.
        const AqueousActivityDeclaration decl = readAqueousActivity(aq);
        if (!decl.declared || decl.ionic.empty())
            throw std::runtime_error("thermophysicalPropertySystem:"
                " electrolyteGammaPhi needs its aqueous model declared --"
                " `aqueous { activityModel { model Pitzer|eNRTL; } }`.");
        if (!decl.molecular.empty())
            throw std::runtime_error("thermophysicalPropertySystem: the"
                " aqueous activityModel declares `molecular "
                + decl.molecular + ";`, but this system is not REACTIVE (no"
                " component declares `aqueousSpeciation <setName>;`), so it"
                " runs on the single-salt " + decl.ionic + " adapter, which"
                " has no molecular backbone and would drop the key.  The"
                " composite mixed-solvent route (`ionic davies; molecular"
                " <NRTL|UNIQUAC|UNIFAC>;`) is served by the reactive shape"
                " only -- remove `molecular`, or model the system on that"
                " route.");
        const std::string model = decl.ionic;
        if (model != "Pitzer" && model != "eNRTL")
            throw std::runtime_error("thermophysicalPropertySystem: "
                "electrolyteGammaPhi activityModel '" + model
                + "' -- implemented: Pitzer | eNRTL.");
        if (aq->found("compositionBasis")
            && aq->lookupWord("compositionBasis") != "molality")
            throw std::runtime_error("thermophysicalPropertySystem: the"
                " electrolyte surface is molality-based.");
        const std::string vap = eq->subDict("vapour")->lookupWord("fugacityModel");
        if (vap != "idealGas")
            throw std::runtime_error("thermophysicalPropertySystem: the"
                " electrolyte path serves vapour idealGas only (as today).");
        verifyCal("aqueous", "enthalpyRoute", "ionicReferencePlusExcess");
        verifyCal("vapour", "enthalpyRoute", "idealGasCp");
        if (thermoAnnounce())
            std::cout << "[v2 native] equilibrium electrolyteGammaPhi: aqueous "
                      << model << " (molality); vapour idealGas.  caloric:"
                         " aqueous ionicReferencePlusExcess (aqueous"
                         " inf-dilution ion datum + L_phi), vapour idealGasCp"
                         " (elements datum).  Assembled NATIVELY from the v2"
                         " grammar (no translated intermediate).\n";
        return buildElectrolyte(v2->lookupWordList("components"), db,
                                /*isENRTL=*/model == "eNRTL", chem);
    }

    if (form == "diluteSolution")
    {
        // diluteSolution: solvent on the Raoult rung, solutes on
        // infinite-dilution Henry -- the rungs ARE the formulation;
        // declaring others refuses.
        auto liq = eq->subDict("liquid");
        auto sol = liq->subDict("solvent");
        auto sus = liq->subDict("solutes");
        if (sol->found("standardState")
            && sol->lookupWord("standardState") != "pureLiquid")
            throw std::runtime_error("thermophysicalPropertySystem: the Henry"
                " solvent sits on the pureLiquid (Raoult) rung.");
        if (sus->found("standardState")
            && sus->lookupWord("standardState") != "infiniteDilution")
            throw std::runtime_error("thermophysicalPropertySystem: Henry"
                " solutes sit on the infiniteDilution rung -- that is the"
                " DEFINITION of the convention.");
        if (sus->lookupWordOrDefault("solutionModel", "henryDilute") != "henryDilute")
            throw std::runtime_error("thermophysicalPropertySystem: solutes"
                " solutionModel implemented: henryDilute.");
        const std::string solvent = sol->lookupWord("component");
        const auto solutes = sus->lookupWordList("components");
        if (solutes.empty())
            throw std::runtime_error("thermophysicalPropertySystem:"
                " diluteSolution declares no solutes.");

        // A3: every declared solute pair -- declared record exists AND
        // parses (fail-closed); the runtime registry re-reads it.
        if (!sus->found("binaryParameters"))
            throw std::runtime_error("thermophysicalPropertySystem:"
                " diluteSolution solutes need binaryParameters { <solute>-"
                + solvent + " { source \"...\"; } ... } -- the cited Henry"
                " records.");
        auto bp = sus->subDict("binaryParameters");
        for (const auto& su : solutes)
        {
            const std::string key = su + "-" + solvent;
            if (!bp->found(key))
                throw std::runtime_error("thermophysicalPropertySystem: solute '"
                    + su + "' declared but binaryParameters has no '" + key
                    + "' entry -- declare the pair file.");
            const std::string src = bp->subDict(key)->lookupWord("source");
            (void)loadRec(resolveDeclared(repoRoot, src), "Henry pair " + key);
            if (thermoAnnounce())
                std::cout << "[builder] Henry pair " << key << "  --- " << src
                          << "\n";
        }

        // G5: a REAL vapour phi rides the same EoS wiring as gammaPhi.
        const std::string vap = eq->subDict("vapour")->lookupWord("fugacityModel");
        auto eosDict = std::make_shared<Dictionary>("equationOfState");
        eosDict->insert("model", vap);
        auto idealAct = std::make_shared<Dictionary>("activityModel");
        idealAct->insert("model", std::string("ideal"));   // the solvent's Raoult side

        if (thermoAnnounce())
            std::cout << "[v2 native] equilibrium diluteSolution: solvent on"
                         " Raoult, solutes on infinite-dilution Henry"
                         " (K = gamma* H(T) / phi P); vapour phi " << vap
                      << "; pairs declared inside the solutes group."
                         "  Assembled NATIVELY from the v2 grammar (no"
                         " translated intermediate).\n";
        ThermoPackage out;
        out.assembleTwoPhase(v2->lookupWordList("components"), idealAct,
                             eosDict, "gammaPhi", db);
        out.applySolution(solvent, solutes);
        return out;
    }

    if (form == "gammaPhi")
    {
        auto liq = eq->subDict("liquid");
        if (liq->found("standardState")
            && liq->lookupWord("standardState") != "pureLiquid")
            throw std::runtime_error("thermophysicalPropertySystem: gammaPhi"
                " liquid standardState must be pureLiquid (Henry/electrolyte"
                " formulations carry the other conventions).");
        verifyCal("liquid", "enthalpyRoute", "pureCpPlusExcess");
        verifyCal("vapour", "enthalpyRoute", "idealGasCp");

        // Activity config: the model word; SOURCE pairs loaded from their
        // records (whitelisted coefficient keys + the calorimetricFit honesty
        // flag, citation announced); INLINE pairs copied verbatim from the
        // authored dict (the dict OWNS the numbers -- fitting /
        // self-contained cases); a cosmoSAC parameter-SET selector
        // (`source <setName>`) rides along verbatim.
        auto activityDict = std::make_shared<Dictionary>("activityModel");
        std::string model;
        const EntryValue& ev = liq->entryValue("activityModel");
        if (std::holds_alternative<std::string>(ev))
            model = std::get<std::string>(ev);
        else
        {
            auto am = liq->subDict("activityModel");
            model = am->lookupWord("model");
            // An unknown key here would be a silently-dropped declaration
            // -- refuse.
            for (const auto& k : am->keys())
                if (k != "model" && k != "source" && k != "binaryParameters")
                    throw std::runtime_error("thermophysicalPropertySystem:"
                        " activityModel key '" + k + "' is not part of the"
                        " grammar (have: model / source / binaryParameters"
                        + std::string(k == "pairs"
                            ? "; pairs are declared as binaryParameters"
                              " { <i>-<j> {...} }"
                            : "") + ").");
            if (am->found("source"))
                activityDict->insert("source", am->entryValue("source"));
            if (am->found("binaryParameters"))
            {
                const fs::path repoRoot =
                    fs::path(Database::currentRoot()).parent_path();
                auto bp = am->subDict("binaryParameters");
                std::vector<DictPtr> pairDicts;
                bool anySource = false, anyInline = false;
                for (const auto& pr : bp->keys())
                {
                    auto pd = bp->subDict(pr);
                    if (pd->found("source"))
                    {
                        anySource = true;
                        const std::string src = pd->lookupWord("source");
                        auto pairRec = loadRec(resolveDeclared(repoRoot, src),
                                               "binary pair " + pr);
                        if (thermoAnnounce())
                            std::cout << "[builder] binary pair " << pr
                                      << "  --- " << src << "\n";
                        auto pp = pairRec->subDict("parameters");
                        auto p = std::make_shared<Dictionary>(pr);
                        p->insert("i", pp->entryValue("i"));
                        p->insert("j", pp->entryValue("j"));
                        for (const char* k : {"a_ij", "b_ij", "a_ji", "b_ji",
                                              "c_ij", "c_ji", "alpha"})
                            if (pp->found(k)) p->insert(k, pp->entryValue(k));
                        // Honesty flag rides along (the H^E calorimetric gate).
                        if (pp->found("calorimetricFit"))
                            p->insert("calorimetricFit",
                                      pp->entryValue("calorimetricFit"));
                        else if (pairRec->found("calorimetricFit"))
                            p->insert("calorimetricFit",
                                      pairRec->entryValue("calorimetricFit"));
                        pairDicts.push_back(p);
                    }
                    else
                    {
                        anyInline = true;
                        auto p = std::make_shared<Dictionary>(pr);
                        for (const auto& k : pd->keys())
                        {
                            const EntryValue& pv = pd->entryValue(k);
                            if (std::holds_alternative<scalar>(pv)
                                || std::holds_alternative<std::string>(pv))
                                p->insert(k, pv);   // verbatim, full precision
                            else
                                throw std::runtime_error(
                                    "thermophysicalPropertySystem: inline pair"
                                    " key '" + k + "' is neither scalar nor"
                                    " word.");
                        }
                        pairDicts.push_back(p);
                    }
                }
                if (anySource && anyInline)
                    throw std::runtime_error(
                        "thermophysicalPropertySystem: binaryParameters mixes"
                        " source-form and inline-form pairs -- one dict, one"
                        " form (STRICT).");
                if (!pairDicts.empty())
                    activityDict->insert("pairs", EntryValue(pairDicts));
            }
        }
        activityDict->insert("model", model);
        // Active-set projection (forum M6): the declared pair domain rides
        // into the activity config -- the NRTL restricts its pair matrix +
        // announcement to it (components stay GLOBAL; doctrine untouched).
        if (v2->found("activeComponents"))
            activityDict->insert("activeComponents",
                                 v2->entryValue("activeComponents"));
        // Per-node pair home (Flowsheet-injected plumbing, not authored
        // grammar): the NRTL searches the node's constant/parameters FIRST.
        if (v2->found("binaryPairsBase"))
            activityDict->insert("binaryPairsBase",
                                 v2->entryValue("binaryPairsBase"));

        const std::string vap = eq->subDict("vapour")->lookupWord("fugacityModel");
        auto eosDict = std::make_shared<Dictionary>("equationOfState");
        eosDict->insert("model", vap);

        // T13 transport: the authored phase-structured block maps onto the
        // canonical flat hierarchy -- as DICT OBJECTS (no text emission);
        // mixingRule stays non-selectable (refused, never by accident).
        DictPtr transportDict;
        if (v2->found("transport"))
        {
            struct Map { const char* v2phase; const char* v2prop; const char* v1key; };
            static const Map maps[] = {
                {"vapour", "viscosity",           "viscosity"},
                {"vapour", "thermalConductivity", "thermalConductivity"},
                {"vapour", "diffusivity",         "diffusivity"},
                {"liquid", "viscosity",           "liquidViscosity"},
                {"liquid", "thermalConductivity", "liquidConductivity"},
                {"liquid", "diffusivity",         "liquidDiffusivity"},
                {"interface", "surfaceTension",   "surfaceTension"},
            };
            auto tr = v2->subDict("transport");
            transportDict = std::make_shared<Dictionary>("transport");
            for (const auto& mrow : maps)
            {
                if (!tr->found(mrow.v2phase)) continue;
                auto ph = tr->subDict(mrow.v2phase);
                if (!ph->found(mrow.v2prop)) continue;
                auto pb = ph->subDict(mrow.v2prop);
                if (pb->found("mixingRule"))
                    throw std::runtime_error("thermophysicalPropertySystem:"
                        " transport mixingRule is not SELECTABLE yet -- the"
                        " implemented rule is announced by the model; declare"
                        " only `model <X>;` (a selectable rule is a future,"
                        " deliberate extension -- never an accident).");
                auto mb = std::make_shared<Dictionary>(mrow.v1key);
                mb->insert("model", pb->entryValue("model"));
                transportDict->insert(mrow.v1key, EntryValue(mb));
            }

            //  A DECLARED TRANSPORT BLOCK THAT MAPS TO NOTHING IS REFUSED.
            //
            //  This loop walks a fixed table of (phase, property) pairs and
            //  skips anything it does not recognise.  A block written in the
            //  FLAT legacy dialect -- `transport { thermalConductivity Eucken;
            //  diffusivity Fuller; }` -- matches no row, so every key in it
            //  was dropped and `transportDict` came out EMPTY BUT NON-NULL:
            //  readTransportBlock then ran over nothing, the package reported
            //  no diffusivity and no thermal conductivity, and the run said
            //  nothing at all.  psychro01_n2_water declared exactly that, with
            //  a comment above it saying the op "computes it from these models
            //  rather than assuming the coincidence" -- and the op had never
            //  once seen them.  A declaration nobody reads is a comment.
            if (transportDict->keys().empty())
            {
                std::string declared;
                for (const auto& k : tr->keys())
                {
                    if (!declared.empty()) declared += ", ";
                    declared += k;
                }
                throw std::runtime_error("thermophysicalPropertySystem:"
                    " the `transport {}` block declares " + declared
                    + " and NOT ONE of those reaches a model.  This grammar is"
                      " PHASE-STRUCTURED: write `transport { vapour {"
                      " thermalConductivity { model Eucken; } diffusivity {"
                      " model Fuller; } } }`, with `liquid {}` for"
                      " liquidViscosity / liquidConductivity /"
                      " liquidDiffusivity and `interface {}` for"
                      " surfaceTension.  The flat form"
                      " (`thermalConductivity Eucken;` directly under"
                      " transport) is silently DROPPED, which is why this"
                      " refuses rather than running without the models you"
                      " asked for.");
            }
        }
        // G4: pureFluids{} rides verbatim -- a per-component multi-property
        // surface override, announced.
        DictPtr pureFluidsDict;
        if (v2->found("pureFluids"))
        {
            pureFluidsDict = v2->subDict("pureFluids");
            if (thermoAnnounce())
            {
                std::string names;
                for (const auto& k : pureFluidsDict->keys())
                    names += (names.empty() ? "" : ", ") + k;
                std::cout << "[v2 native] pureFluids override (" << names
                          << "): the declared surface REPLACES the"
                             " component-correlation routes it covers --"
                             " saturation dome (Psat), caloric (h/s/Cp),"
                             " volumetric (v/rho) and transport, on that"
                             " component only.\n";
            }
        }

        if (thermoAnnounce())
            std::cout << "[v2 native] equilibrium gammaPhi: liquid activity."
                      << model << "; vapour " << vap
                      << (transportDict ? "; per-property transport (T13)" : "")
                      << ".  Assembled NATIVELY from the v2 grammar (no"
                         " translated intermediate).\n";

        ThermoPackage out;
        out.assembleTwoPhase(v2->lookupWordList("components"), activityDict,
                             eosDict, "gammaPhi", db, transportDict,
                             pureFluidsDict);
        return out;
    }

    auto eos = eq->subDict("equationOfState");
    const std::string model = eos->lookupWord("model");
    if (model != "SRK" && model != "PengRobinson" && model != "PCSAFT")
        throw std::runtime_error("thermophysicalPropertySystem: phiPhi"
            " equationOfState '" + model + "' -- implemented: SRK |"
            " PengRobinson | PCSAFT (the non-associating PC-SAFT core).");
    // The vdW-one-fluid mixing rule is the CUBIC combining rule; PC-SAFT
    // has its own (sigma arithmetic, epsilon geometric) -- do not impose it.
    if (model != "PCSAFT" && eos->found("mixingRule")
        && eos->lookupWord("mixingRule") != "vanDerWaalsOneFluid")
        throw std::runtime_error("thermophysicalPropertySystem: the cubic"
            " mixing rule implemented is vanDerWaalsOneFluid.");

    // phiPhi: departure from the SAME EoS on both phases.
    verifyCal("liquid", "departureRoute", "equilibriumEquationOfState");
    verifyCal("vapour", "departureRoute", "equilibriumEquationOfState");

    // EoS config: model + binaryInteractions with each declared SOURCE
    // record loaded, eos-match-verified and inlined as the {i;j;kij} dicts
    // the EoS constructors consume (refusals + citation announced).
    auto eosDict = std::make_shared<Dictionary>("equationOfState");
    eosDict->insert("model", model);
    if (eos->found("binaryInteractions"))
    {
        const fs::path repoRoot = fs::path(Database::currentRoot()).parent_path();
        auto bi = eos->subDict("binaryInteractions");
        std::vector<DictPtr> pairDicts;
        for (const auto& key : bi->keys())
        {
            auto decl = bi->subDict(key);
            if (!decl->found("source"))
                throw std::runtime_error("thermophysicalPropertySystem: phiPhi"
                    " binaryInteractions." + key + " needs `source \"<pair"
                    " record>\";` (the cited kij record; never an invented"
                    " inline number).");
            auto rec = loadRec(resolveDeclared(repoRoot, decl->lookupWord("source")),
                               "kij pair " + key);
            const std::string recEos = rec->lookupWordOrDefault("eos", "");
            if (recEos.empty() && thermoAnnounce())
                std::cout << "[builder] kij pair " << key << ": record"
                             " carries NO eos field -- cannot verify it was"
                             " regressed for " << model << "; using it"
                             " UNVERIFIED.\n";
            if (!recEos.empty() && recEos != model)
                throw std::runtime_error("propertyPackage: kij pair " + key
                    + " was regressed for eos " + recEos
                    + " but this package declares " + model
                    + " -- kij values are NOT transferable between models;"
                    " provide a " + model + "-regressed pair record.");
            auto p = std::make_shared<Dictionary>(key);
            p->insert("i",   rec->entryValue("i"));
            p->insert("j",   rec->entryValue("j"));
            p->insert("kij", rec->entryValue("kij"));
            pairDicts.push_back(p);
            if (thermoAnnounce())
                std::cout << "[builder] kij pair " << rec->lookupWord("i") << "-"
                          << rec->lookupWord("j")
                          << "  --- " << decl->lookupWord("source") << "\n";
        }
        eosDict->insert("binaryInteractions", EntryValue(pairDicts));
    }

    if (thermoAnnounce())
        std::cout << "[v2 native] equilibrium phiPhi: " << model << " on BOTH"
                     " phases (one Gibbs surface, two roots); kij declared"
                     " inside the EoS block.  caloric: departure from the SAME"
                     " EoS (elements datum).  Assembled NATIVELY from the v2"
                     " grammar (no translated intermediate).\n";

    ThermoPackage out;
    auto idealAct = std::make_shared<Dictionary>("activityModel");
    idealAct->insert("model", std::string("ideal"));   // unused in the phi-phi K
    out.assembleTwoPhase(v2->lookupWordList("components"), idealAct, eosDict,
                         "phiPhi", db);
    return out;
}

} // namespace Choupo
