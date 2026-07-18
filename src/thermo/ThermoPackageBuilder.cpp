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

#include <cmath>
#include <filesystem>
#include <iomanip>
#include <iostream>
#include <numeric>
#include <sstream>
#include <stdexcept>

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

// The component-basis ion map (speciesMap) of a raw substance record: the UNIFIED
// component.speciesMap if present, else the legacy top-level dissociatesTo.
DictPtr speciesMapOf(const DictPtr& rec)
{
    if (rec->found("component") && rec->subDict("component")->found("speciesMap"))
        return rec->subDict("component")->subDict("speciesMap");
    if (rec->found("dissociatesTo")) return rec->subDict("dissociatesTo");
    return nullptr;
}
bool hasSpeciesMap(const DictPtr& rec) { return speciesMapOf(rec) != nullptr; }

} // namespace

// ---- ELECTROLYTE path: assemble a PitzerSingleSalt directly from the unified
//      substance records (no readFromDict, no loadSalt, no old catalogue) ----
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

    // (b) identify the salt: the ONE component whose STANDARDS record carries a
    //     `dissociatesTo` block (formula-like ion stoichiometry).  Its identity
    //     (MW, role) comes from components/<salt>.dat, read from STANDARDS (raw, no
    //     case-local overlay) so it is byte-identical to the retired
    //     components/apparent overlay (deleted layout).  EVERY OTHER component
    //     -- the water solvent, an ethanol
    //     antisolvent, a curve-solute -- is a full molecular component loaded by
    //     name (overlay honoured), so the crystalliser reads its eps/Mw/v.
    // Component BASE records keep the doctrine (records::componentBase): the
    // hand-authored constant/components/ overlay tier must NOT serve as the
    // raw base of an unsealed case -- only a legacy snapshot or a STRICTLY
    // sealed one-home record replaces the catalogue base here.
    auto stdCompPath = [&](const std::string& cn)
        { return records::componentBase(cn); };

    // SUBSET-AWARE (general solver): a flowsheet may run this electrolyte world
    // on a GLOBAL component union that carries MORE than one salt (a brine unit
    // in a plant that also has, say, a Li2CO3 sector).  The ACTIVE salt is the
    // one the package's chemistry.salts declares (its formula maps to a
    // component); any OTHER dissociatesTo component is a molecular SPECTATOR
    // (present in the stream, ideal contribution -- the single-salt Pitzer
    // engine treats only the active salt, announced).  With no chemistry.salts
    // and a single salt, this is byte-identical to the old "exactly one" rule.
    std::string activeSaltFormula;
    if (chem && chem->present && !chem->solidPhases.empty())
    {
        const auto& slist = chem->solidPhases;
        {
            const fs::path sf = resolve("data/standards/chemistry/salts/" + slist.front() + ".dat");
            if (fs::exists(sf))
            {
                auto sr = Dictionary::fromFile(sf.string());
                if (sr->found("formula")) activeSaltFormula = sr->lookupWord("formula");
            }
        }
    }

    std::vector<Component> comps;
    std::size_t solventIdx = compNames.size(), soluteIdx = compNames.size();
    std::string saltName;
    DictPtr saltRec;
    for (const auto& cn : compNames)
    {
        const fs::path sp = stdCompPath(cn);
        DictPtr rec = fs::exists(sp) ? Dictionary::fromFile(sp.string()) : nullptr;
        // UNIFIED overlay (roadmap Phase A): the ONE shared entry point deep-merges a
        // case-local `overlayOf` partial over the standard, so a case-recalibrated
        // calorimetric/crystal datum reaches the crystalliser too.
        if (rec) rec = Database::applyCaseOverlay(cn, rec, sp.string()).dict;
        // Is THIS component the active salt?  Yes if it is the only dissociatesTo
        // component, or if it matches the chemistry-declared active salt formula.
        const bool isSalt = rec && hasSpeciesMap(rec)
            && (activeSaltFormula.empty() || cn == activeSaltFormula
                || (rec->found("formula") && rec->lookupWord("formula") == activeSaltFormula));
        if (isSalt && saltName.empty())
        {
            saltName  = cn;
            saltRec   = rec;
            soluteIdx = comps.size();
            // MW / nonvolatile may be FLAT (legacy layout: NaCl, KCl) or nested in
            // an identity{} block (reference-state layout: NaOH).  Read either.
            DictPtr idRec = rec->found("identity") ? rec->subDict("identity") : rec;
            const scalar saltMW = idRec->found("MW")
                ? idRec->lookupScalar("MW") : rec->lookupScalar("MW");
            const std::string nv = rec->found("nonvolatile")
                ? rec->lookupWordOrDefault("nonvolatile", "false")
                : idRec->lookupWordOrDefault("nonvolatile", "false");
            const std::string saltRole = (nv == "true") ? "nonvolatile" : "volatile";
            comps.push_back(Component::identity(cn, saltMW, saltRole));
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

    // The salt's solid phase + saturation anchor are resolved by the phase NAME the
    // package declares in chemistry.salts -> phases/solid/<phase>.dat (rho_p,k_v)
    // and chemistry/salts/<phase>.dat (anchor).  Absence-tolerant.
    std::string phaseName;
    if (chem && chem->present && !chem->solidPhases.empty())
    {
        const auto& salts = chem->solidPhases;
        phaseName = salts.front();
        if (salts.size() > 1 && thermoAnnounce())
            std::cout << "[builder] chemistryDict solidPhases lists " << salts.size()
                      << " phases but the single-salt adapter honours ONLY '"
                      << salts.front() << "' -- the rest are IGNORED (multi-salt"
                         " needs the eNRTL multi-salt op).\n";
    }

    // (c2) particulate-solid properties (rho_p, k_v) from phases/solid/<phase>.dat
    //      -- the MSMPR/PSD crystalliser reads them off the salt component.
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
    //     the gamma math) -- retired 2026-07-18 (Codex "não inventar gramática").
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

    // (f) the saturation/dissolution anchor from chemistry/salts/<phase>.dat
    //     (measuredSolubilityAnchor).  Absence-tolerant: no anchor -> solubility 0
    //     (Ksp short-circuits to 0).
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
                    a = cd->subDict("measuredSolubilityAnchor");
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

// ---- MOLECULAR path: degenerate (component basis == species basis, i.e. no
//      dissociation; no chemistry, no ions).  Read
//      the binary pair from the NEW location, inline it into an in-memory
//      thermoPackage, and reuse readFromDict -- which for a molecular activity
//      model reads the pair from the dict (Phase-1 inline), touching NO old
//      pair catalogue (parameters/<MODEL>/).  Same builder entry, no special architecture (U4).
// Translate the package's per-phase method slots (forum A2: vapour/transport
// are first-class methods, never flat folklore keys) into the runtime models.
static std::string vapourModelOf(const DictPtr& pkg)
{
    const auto pm = pkg->subDict("propertyMethods");
    const std::string v = pm->found("vapour") ? pm->lookupWord("vapour")
                                              : std::string("builtin.idealGas");
    if (v == "builtin.idealGas")      return "idealGas";
    if (v.rfind("eos.", 0) == 0)      return v.substr(4);      // eos.SRK -> SRK
    throw std::runtime_error("propertyPackage: unsupported vapour method '" + v
        + "' (have builtin.idealGas, eos.<Model>).");
}
// A3 for the EoS: the package may declare parameters.kijPairs { N2-CH4 "path"; }
// -- each record is loaded (refuse loudly if the file is missing/bad) and
// inlined as binaryInteractions into the synthesized equationOfState{} block,
// which SRK/PR::fromDict already consumes.  No kijPairs -> kij = 0, announced
// by the EoS itself being predictive-degraded (the record is where the cited
// value lives; NEVER invent one inline).
static std::string eosLineOf(const DictPtr& pkg)
{
    const fs::path repoRoot = fs::path(Database::currentRoot()).parent_path();
    std::ostringstream e;
    e << "equationOfState { model " << vapourModelOf(pkg) << "; ";
    if (pkg->found("parameters") && pkg->subDict("parameters")->found("kijPairs"))
    {
        auto kp = pkg->subDict("parameters")->subDict("kijPairs");
        e << "binaryInteractions ( ";
        for (const auto& key : kp->keys())
        {
            auto rec = loadRec(resolveDeclared(repoRoot, kp->lookupWord(key)), "kij pair " + key);
            // Round-3 fix P3: a kij is REGRESSED AGAINST one specific cubic --
            // an SRK kij fed to Peng-Robinson is silent parameter abuse.  The
            // record's `eos` field must match the package's declared model.
            {
                const std::string recEos =
                    rec->lookupWordOrDefault("eos", "");
                const std::string pkgEos = vapourModelOf(pkg);
                if (recEos.empty() && thermoAnnounce())
                    std::cout << "[builder] kij pair " << key << ": record"
                                 " carries NO eos field -- cannot verify it was"
                                 " regressed for " << pkgEos << "; using it"
                                 " UNVERIFIED.\n";
                if (!recEos.empty() && recEos != pkgEos)
                    throw std::runtime_error("propertyPackage: kij pair " + key
                        + " was regressed for eos " + recEos
                        + " but this package declares " + pkgEos
                        + " -- kij values are NOT transferable between cubics;"
                        " provide a " + pkgEos + "-regressed pair record.");
            }
            e << "{ i " << rec->lookupWord("i") << "; j " << rec->lookupWord("j")
              << "; kij " << rec->lookupScalar("kij") << "; } ";
            // The builder line carries only the CITATION (which record file the
            // pair came from); the VALUE is announced where it is CONSUMED --
            // '[eos] kij(i,j) = ...' in SRK/PR::fromDict -- so the legacy
            // inline-binaryInteractions route passes the same announcement point.
            if (thermoAnnounce())
                std::cout << "[builder] kij pair " << rec->lookupWord("i") << "-"
                          << rec->lookupWord("j")
                          << "  --- " << kp->lookupWord(key) << "\n";
        }
        e << "); ";
    }
    e << "}\n";
    return e.str();
}

static std::string transportModelOf(const DictPtr& pkg)
{
    const auto pm = pkg->subDict("propertyMethods");
    return pm->found("transport") ? pm->lookupWord("transport") : std::string();
}

// solution.henryDilute -- the dilute-solution method (professors' forum
// 2026-07-04, amendment A1: per-group rungs).  The package's solution{} block
// names solvent + solutes; parameters.henryPairs declares each pair's FILE,
// verified here (A3: refuse loudly, naming the missing file).  Assembly is the
// proven synthesized-dict route: the ThermoPackage runs the same K path as the
// legacy solvent/solutes keys -- byte-identical by construction.
static ThermoPackage buildSolutionHenry(const DictPtr& pkg, const Database& db)
{
    const fs::path repoRoot = fs::path(Database::currentRoot()).parent_path();
    const std::vector<std::string> compNames = pkg->lookupWordList("components");
    if (!pkg->found("solution"))
        absent("solution { solvent <c>; solutes ( ... ); }", "propertyPackage");
    auto sol = pkg->subDict("solution");
    const std::string solvent = sol->lookupWord("solvent");
    const auto solutes = sol->lookupWordList("solutes");
    if (solutes.empty()) absent("a non-empty solutes ( ... )", "propertyPackage.solution");

    // A3: every declared solute pair -- declared path exists AND parseable.
    if (!(pkg->found("parameters") && pkg->subDict("parameters")->found("henryPairs")))
        absent("parameters.henryPairs", "propertyPackage");
    auto hp = pkg->subDict("parameters")->subDict("henryPairs");
    for (const auto& su : solutes)
    {
        const std::string key = su + "-" + solvent;
        if (!hp->found(key))
            throw std::runtime_error("propertyPackage: solute '" + su
                + "' declared in solution{} but parameters.henryPairs has no '"
                + key + "' entry -- declare the pair file.");
        auto rec = loadRec(resolveDeclared(repoRoot, hp->lookupWord(key)), "Henry pair " + key);
        (void)rec;   // parse = the verification; the runtime registry re-reads it
    }
    // The per-GROUP reference rungs are FIXED by the diluteSolution formulation
    // (solvent pureLiquidRaoult, solutes infiniteDilutionHenry) -- announced
    // directly; the methods/henryDilute.dat ceremony record was retired
    // 2026-07-18 (the selection is the propDict formulation, not a file).
    if (thermoAnnounce())
        std::cout << "[builder] propertyMethod solution.henryDilute:"
                     " per-GROUP rungs solvent pureLiquidRaoult,"
                     " solutes infiniteDilutionHenry\n";
    // The world line, symmetric with the other liquid-method branches.
    if (thermoAnnounce())
        std::cout << "[builder] VLE world: gamma-phi with Henry solutes"
                     "(Raoult solvent + infinite-dilution solutes, K = gamma* H(T) Poynting / (phi_V P); "
                  << vapourModelOf(pkg) << " vapour phi)\n";
    std::ostringstream txt;
    txt << "components ( ";
    for (const auto& c : compNames) txt << c << " ";
    txt << ");\n";
    txt << "activityModel { model ideal; }\n";   // the solvent's Raoult side
    txt << eosLineOf(pkg);
    const std::string tr = transportModelOf(pkg);
    if (!tr.empty()) txt << "transport { viscosity { model " << tr << "; } }\n";
    txt << "solvent " << solvent << ";\n";
    txt << "solutes ( ";
    for (const auto& su : solutes) txt << su << " ";
    txt << ");\n";
    DictPtr tdict = Dictionary::fromString(txt.str(), "ThermoPackageBuilder.solution");
    ThermoPackage out;
    out.readFromDict(tdict, db);
    return out;
}

static ThermoPackage buildMolecularActivity(const DictPtr& pkg, const Database& db,
                                            const std::string& model,
                                            const ChemistrySystem* chem)
{
    const fs::path repoRoot = fs::path(Database::currentRoot()).parent_path();
    const std::vector<std::string> compNames = pkg->lookupWordList("components");

    // Active-set projection: forward the context's declared domain into every
    // synthesized activity block (the NRTL ctor consumes it -- pair matrix +
    // announcement restrict to the domain; components stay GLOBAL).
    std::string activeTxt;
    if (pkg->found("activeComponents"))
    {
        activeTxt = " activeComponents ( ";
        for (const auto& a : pkg->lookupWordList("activeComponents"))
            activeTxt += a + " ";
        activeTxt += ");";
    }

    // activity.ideal has NO pair parameters (gamma = 1 identically): synthesize
    // directly -- an EoS-centred package (vapour eos.SRK + kijPairs) is the use.
    if (model == "ideal")
    {
        std::ostringstream txt;
        txt << "components ( ";
        for (const auto& c : compNames) txt << c << " ";
        txt << ");\nactivityModel { model ideal; }\n";
        txt << eosLineOf(pkg);
        const std::string tr = transportModelOf(pkg);
        if (!tr.empty()) txt << "transport { viscosity { model " << tr << "; } }\n";
        if (thermoAnnounce())
            std::cout << "[builder] VLE world: gamma-phi (ideal liquid gamma, "
                      << vapourModelOf(pkg) << " vapour phi)\n";
        DictPtr tdict = Dictionary::fromString(txt.str(), "ThermoPackageBuilder.ideal");
        ThermoPackage out;
        out.readFromDict(tdict, db);
        return out;
    }
    // No INLINE parameters.binaryPairs -> resolve the pairs from the case's
    // pair CATALOGUE (parameters/<MODEL>/), the SAME path thermoFor uses for a per-unit molecular
    // override.  This is the standalone/plant alignment (ChatGPT s32): the ACTIVE
    // liquid method defines the world -- a unit that INHERITS an electrolyte context
    // but selects `activity.<model>` gets a molecular gamma with its pairs loaded
    // from the catalogue; the inherited salt chemistry stays AVAILABLE but INACTIVE
    // (it never activates the electrolyte path nor demands eNRTL/Pitzer parameters).
    const bool hasInlinePairs = pkg->found("parameters")
        && pkg->subDict("parameters")->found("binaryPairs")
        && !pkg->subDict("parameters")->subDict("binaryPairs")->keys().empty();
    // Multi-phase LLE: the propertyDict may declare 2+ LIQUID phases explicitly
    // (an NRTL gamma-gamma settler needs them, or the LL flash sees only 1 phase).
    // Translate the F2 `phases { <name> { type liquid; activityModel <M>; } }` into
    // the internal `phases ( { name; type; activity { model } } )` list; a vapour
    // phase closes it.  Absent -> the single implicit liquid via activityModel.
    std::string phasesTxt;
    if (pkg->found("phases"))
    {
        auto ph = pkg->subDict("phases");
        for (const auto& pn : ph->keys())
        {
            auto pd = ph->subDict(pn);
            const std::string ptype = pd->lookupWordOrDefault("type", "liquid");
            std::string pmodel = model;
            if (pd->found("activityModel")) pmodel = pd->lookupWord("activityModel");
            else if (pd->found("activity") && pd->subDict("activity")->found("model"))
                pmodel = pd->subDict("activity")->lookupWord("model");
            phasesTxt += "    { name " + pn + "; type " + ptype
                       + "; activity { model " + pmodel + ";" + activeTxt
                       + " } }\n";
        }
        phasesTxt += "    { name vapour; type vapor; eos { model idealGas; } }\n";
    }

    if (!hasInlinePairs)
    {
        std::ostringstream txt;
        txt << "components ( ";
        for (const auto& c : compNames) txt << c << " ";
        txt << ");\n";
        if (!phasesTxt.empty()) txt << "phases (\n" << phasesTxt << ");\n";
        else                    txt << "activityModel { model " << model << ";"
                                    << activeTxt << " }\n";
        txt << eosLineOf(pkg);
        const std::string tr = transportModelOf(pkg);
        if (!tr.empty()) txt << "transport { viscosity { model " << tr << "; } }\n";
        if (thermoAnnounce())
            std::cout << "[builder] VLE world: gamma-phi (" << model
                      << " liquid gamma from the binaryPairs catalogue, "
                      << vapourModelOf(pkg) << " vapour phi)"
                      << ((chem && chem->present) ? "; inherited chemistry INACTIVE" : "")
                      << "\n";
        DictPtr tdict = Dictionary::fromString(txt.str(), "ThermoPackageBuilder.molecularCatalogue");
        ThermoPackage out;
        out.readFromDict(tdict, db);
        return out;
    }
    auto params = pkg->subDict("parameters");
    auto binPairs = params->subDict("binaryPairs");
    if (binPairs->keys().empty()) absent("a binaryPairs entry", "propertyPackage.parameters");
    // Inline EVERY declared pair (round-3 fix P1: the first cut consumed only
    // keys().front(), silently DROPPING the other pairs of a ternary+ system
    // -- the cardinal sin).  Full precision so gamma matches byte-for-byte.
    // Build the inline pairs body ONCE -- shared by the single-liquid
    // activityModel and by EVERY liquid phase of a multi-phase LLE world (a
    // gamma-gamma settler declared with a `phases {}` block needs the same gamma
    // on each liquid, or the LL flash sees only one phase).
    std::ostringstream pairsBody;
    pairsBody << std::setprecision(15);
    for (const auto& key : binPairs->keys())
    {
        auto pairRec = loadRec(resolveDeclared(repoRoot, binPairs->lookupWord(key)),
                               "binary pair " + key);
        // pass-7 (professor): the inlined numbers LAUNDERED the catalogue
        // provenance to 'inline' -- announce the source file per pair, the
        // same pattern the kij route uses, so the selector headers' promise
        // ('every parameter with its source') holds on this path too.
        if (thermoAnnounce())
            std::cout << "[builder] binary pair " << key << "  --- "
                      << binPairs->lookupWord(key) << "\n";
        auto pp = pairRec->subDict("parameters");
        pairsBody << "{ i " << pp->lookupWord("i") << "; j " << pp->lookupWord("j") << "; ";
        for (const char* k : {"a_ij", "b_ij", "a_ji", "b_ji", "c_ij", "c_ji", "alpha"})
            if (pp->found(k)) pairsBody << k << " " << pp->lookupScalar(k) << "; ";
        // Honesty flag rides along (pass-3: dropping it silently DISARMED the
        // H^E calorimetric gate for package-loaded pairs vs legacy-inlined).
        if (pp->found("calorimetricFit"))
            pairsBody << "calorimetricFit " << pp->lookupWord("calorimetricFit") << "; ";
        else if (pairRec->found("calorimetricFit"))
            pairsBody << "calorimetricFit " << pairRec->lookupWord("calorimetricFit") << "; ";
        pairsBody << "} ";
    }
    const std::string amBody = "model " + model + "; pairs ( " + pairsBody.str() + ")";

    std::ostringstream txt;
    txt << std::setprecision(15);
    txt << "components ( ";
    for (const auto& c : compNames) txt << c << " ";
    txt << ");\n";
    if (pkg->found("phases"))
    {
        txt << "phases (\n";
        auto ph = pkg->subDict("phases");
        for (const auto& pn : ph->keys())
        {
            const std::string ptype = ph->subDict(pn)->lookupWordOrDefault("type", "liquid");
            txt << "    { name " << pn << "; type " << ptype
                << "; activity { " << amBody << "; } }\n";
        }
        txt << "    { name vapour; type vapor; eos { model idealGas; } }\n);\n";
    }
    else
    {
        txt << "activityModel { " << amBody << "; }\n";
        txt << eosLineOf(pkg);
    }

    // The world line, symmetric with the phi-phi / Henry / electrolyte branches.
    if (thermoAnnounce())
        std::cout << "[builder] VLE world: gamma-phi (" << model
                  << " liquid gamma, " << vapourModelOf(pkg) << " vapour phi)\n";
    DictPtr tdict = Dictionary::fromString(txt.str(), "ThermoPackageBuilder.molecular");
    ThermoPackage out;
    out.readFromDict(tdict, db);
    return out;
}


// ============================================================================
// v2 CONTRACT (SPIKE, 2026-07-17): recordType thermophysicalPropertySystem,
// schemaVersion 2 -- the Carlos/Claude physically-decomposed grammar
// (equilibrium / caloric / volumetric / transport / aqueousProperties blocks;
// no propertyMethods{}, no global parameters{} bag; every route DECLARED and
// VERIFIED against what the engine actually implements).  The spike TRANSLATES
// a v2 dict into the v1 in-memory package the existing assembly consumes --
// physics byte-identical BY CONSTRUCTION; the dict becomes a true glass-box
// statement of what runs.  Declared routes that do not match the implemented
// branch REFUSE loudly (never a decorative declaration -- the Codex-audit
// lesson).  Grammar surface implemented: T2 (molecular gammaPhi), T7
// (electrolyteGammaPhi), T8 (aqueousProperties).  chemistry{} stays inline
// TRANSITIONALLY (the chemistryDict grammar is not ratified).  The corpus-wide
// migration wave is the ARCHITECT's decision, not this spike's.

ThermoPackage ThermoPackageBuilder::build(const DictPtr& pkg, const Database& db,
                                          const ChemistrySystem* chem)
{
    // The active-chemistry SELECTION lives in constant/chemistryDict
    // (ratified 2026-07-18) and arrives as the `chem` object -- a
    // chemistry{} block inside the package/system dict is RETIRED.
    if (pkg->found("chemistry"))
        throw std::runtime_error("propertyPackage: the inline `chemistry {}`"
            " block is RETIRED (2026-07-18) -- the active-chemistry selection"
            " lives in constant/chemistryDict (recordType chemistrySystem;"
            " equilibria { solidPhases ( ... ); }).  Move the block there.");
    // v2 contract: ONE dispatch point, EXHAUSTIVE (the scaffold is DEAD --
    // Codex-ratified 2026-07-18): a claimed formulation assembles natively;
    // everything else gets a NAMED refusal, never a silent fallback.
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

    // GATE: parameters{} only carries the known parameter FAMILIES.  An unknown
    // key here is a silent no-op (a declaration nothing reads) -- the exact bug
    // class of a mis-spelled or mechanically-renamed block (`parameters.parameters`,
    // Codex audit 2026-07-16).  Refuse loudly instead of ignoring.
    if (pkg->found("parameters"))
        for (const auto& key : pkg->subDict("parameters")->keys())
            if (key != "binaryPairs" && key != "henryPairs" && key != "kijPairs")
                throw std::runtime_error("propertyPackage: unknown parameters."
                    + key + " -- nothing reads it (a silent declaration).  Known"
                    " families: binaryPairs, henryPairs, kijPairs.  Pitzer/eNRTL"
                    " pairs resolve by cation-anion NAME from parameters/"
                    "{Pitzer,eNRTL}/ (cite them in a comment, not a block).");

    // Dispatch on the selected liquid property method (U4: ONE builder for
    // electrolyte AND molecular).  electrolyte.* -> direct assembly from the new
    // records; activity.* -> inline-pair readFromDict.  No special branch downstream.
    if (!(pkg->found("propertyMethods")
          && pkg->subDict("propertyMethods")->found("liquid")))
        absent("propertyMethods.liquid", "propertyPackage");
    const std::string liquid = pkg->subDict("propertyMethods")->lookupWord("liquid");

    if (liquid == "electrolyte.pitzer" || liquid == "electrolyte.eNRTL")
    {
        const auto pm = pkg->subDict("propertyMethods");
        // Round-4 (professor): this path serves ONLY the ideal-gas vapour; a
        // package declaring another vapour method was silently overridden.
        // A3: refuse instead.  (buildV2 applies the same refusals on the
        // authored grammar -- one contract, two assemblies.)
        const std::string v = pm->found("vapour") ? pm->lookupWord("vapour")
                                                  : std::string("builtin.idealGas");
        if (v != "builtin.idealGas")
            throw std::runtime_error("propertyPackage: the electrolyte liquid"
                " path serves vapour builtin.idealGas only; got '" + v +
                "'. Declare builtin.idealGas (or ask for the eos-vapour"
                " extension).");
        if (pm->found("transport"))
            throw std::runtime_error("propertyPackage: the electrolyte liquid path"
                " does not yet wire a transport method -- remove the transport slot"
                " (or ask for the extension); silently ignoring it would be a"
                " declared-and-dropped lie (A3).");
        return buildElectrolyte(pkg->lookupWordList("components"), db,
                                /*isENRTL=*/liquid == "electrolyte.eNRTL", chem);
    }
    if (liquid.rfind("eos.", 0) == 0)
    {
        // World 2 opt-in (forum: the liquid slot IS the world).  The SAME
        // cubic must serve both phases -- mixed slots are two Gibbs surfaces
        // pretending to be one VLE: REFUSE.
        const std::string vap = pkg->subDict("propertyMethods")->found("vapour")
            ? pkg->subDict("propertyMethods")->lookupWord("vapour") : "";
        if (vap != liquid)
            throw std::runtime_error("propertyPackage: liquid " + liquid
                + " (phi-phi) requires vapour " + liquid + " -- the SAME cubic"
                " on both phases (one Gibbs surface); got vapour '" + vap + "'.");
        const std::vector<std::string> compNames = pkg->lookupWordList("components");
        std::ostringstream txt;
        txt << "components ( ";
        for (const auto& c : compNames) txt << c << " ";
        txt << ");\nactivityModel { model ideal; }\n";   // unused in phi-phi K
        txt << eosLineOf(pkg);
        const std::string tr = transportModelOf(pkg);
        if (!tr.empty()) txt << "transport { viscosity { model " << tr << "; } }\n";
        txt << "vleWorld phiPhi;\n";
        // The phi-phi world line is announced by readFromDict itself (it reads
        // the `vleWorld phiPhi;` written just above) -- ONE announcement point
        // for both entry paths, this builder AND a legacy thermoPackage that
        // selects the world directly.  The other branches announce here.
        DictPtr tdict = Dictionary::fromString(txt.str(), "ThermoPackageBuilder.phiPhi");
        ThermoPackage out;
        out.readFromDict(tdict, db);
        return out;
    }
    if (liquid == "solution.henryDilute")
        return buildSolutionHenry(pkg, db);
    if (liquid.rfind("activity.", 0) == 0)
        return buildMolecularActivity(pkg, db, liquid.substr(9), chem);

    throw std::runtime_error("ThermoPackageBuilder: unsupported liquid propertyMethod '"
        + liquid + "' (have electrolyte.pitzer, electrolyte.eNRTL, activity.<model>, solution.henryDilute).");
}

// ---- v2-NATIVE path (migration steps 1-2 pilot: the phiPhi world) ----------
// docs/architecture/v2-native-migration.md.  No v1-shaped dict, no
// synthesized text: the authored equilibrium{} block is read directly and
// the package assembled via ThermoPackage::assembleTwoPhase.

bool ThermoPackageBuilder::v2NativeFormulation(const DictPtr& v2)
{
    if (!v2->found("equilibrium")) return false;
    auto eq = v2->subDict("equilibrium");
    const std::string form = eq->lookupWordOrDefault("formulation", "");
    // chemistry{} inline is RETIRED (refused by the build dispatch); the
    // defensive guard keeps an unmigrated stray on the loud path.
    if (v2->found("chemistry")) return false;
    // The activeComponents pair-domain projection (forum M6) is wired
    // natively for the gamma worlds; other formulations do not consume it.
    if (v2->found("activeComponents")
        && form != "gammaPhi" && form != "gammaGamma")
        return false;
    if (form == "gammaPhi")
    {
        // Wave G (2026-07-18): ALL authored gammaPhi shapes -- ideal/word,
        // source pairs, inline pairs, a cosmoSAC set selector, transport,
        // pureFluids.  Explicit `phases` stays out (that IS gammaGamma).
        if (v2->found("phases")) return false;
        return eq->subDict("liquid")->found("activityModel");
    }
    // The other formulations carry no transport/pureFluids wiring natively
    // yet -- a system declaring them stays on the scaffold.
    if (v2->found("transport") || v2->found("pureFluids"))
        return false;
    if (form == "phiPhi") return true;
    if (form == "gammaGamma") return true;   // both pair forms wired natively
    if (form == "diluteSolution") return true;
    if (form == "electrolyteGammaPhi") return true;
    return false;
}

ThermoPackage ThermoPackageBuilder::buildV2(const DictPtr& v2, const Database& db,
                                            const ChemistrySystem* chem)
{
    (void)chem;   // the native formulations so far carry no chemistry (the
                  // electrolyte wave consumes it when it lands)
    if (!v2NativeFormulation(v2))
        throw std::runtime_error("ThermoPackageBuilder::buildV2: this system's"
            " formulation/shape is not on the native path yet -- gate the"
            " call with v2NativeFormulation().");
    if (!v2->found("components"))
        throw std::runtime_error("thermophysicalPropertySystem: required key"
            " 'components' is absent");
    auto eq = v2->subDict("equilibrium");
    const std::string form = eq->lookupWord("formulation");

    // Declared caloric routes must state what runs (declared+verified) --
    // the same refusals the scaffold applies, one contract, two assemblies.
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
    // sub-blocks skipped, as the scaffold does).
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
        if (!eq->found("liquidPhases"))
            throw std::runtime_error("thermophysicalPropertySystem: required"
                " key 'equilibrium.liquidPhases ( { name } ... )' is absent");
        // ONE fact in ONE home: coexisting liquids share the activity model
        // declared at equilibrium.liquid; a phase overrides only when its
        // model is intentionally different.
        DictPtr shared;
        if (eq->found("liquid") && eq->subDict("liquid")->found("activityModel"))
            shared = eq->subDict("liquid")->subDict("activityModel");
        std::vector<DictPtr> phaseConfigs;
        std::string phaseNames;
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
        // idealGas vapour (Raoult solvent VLE) -- the same refusals the
        // scaffold applies, then straight into the record-driven electrolyte
        // assembly (which consumes the chem OBJECT for its active salt).
        auto aq = eq->subDict("aqueous");
        auto am = aq->subDict("activityModel");
        const std::string model = am->lookupWord("model");
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
        // T6: solvent on the Raoult rung, solutes on infinite-dilution Henry
        // -- the rungs ARE the formulation; declaring others refuses.
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
        // (`source <setName>`) rides along verbatim (the 2026-07-15
        // contract).  Exactly the scaffold's contract, no text emission.
        auto activityDict = std::make_shared<Dictionary>("activityModel");
        std::string model;
        const EntryValue& ev = liq->entryValue("activityModel");
        if (std::holds_alternative<std::string>(ev))
            model = std::get<std::string>(ev);
        else
        {
            auto am = liq->subDict("activityModel");
            model = am->lookupWord("model");
            // Parity gate: an unknown key here would be a silently-dropped
            // declaration (the decorative sin) -- refuse.  `pairs()` is the
            // RETIRED flat form; the authored grammar is binaryParameters{}.
            for (const auto& k : am->keys())
                if (k != "model" && k != "source" && k != "binaryParameters")
                    throw std::runtime_error("thermophysicalPropertySystem:"
                        " activityModel key '" + k + "' is not part of the"
                        " authored grammar (have: model / source /"
                        " binaryParameters" + std::string(k == "pairs"
                            ? "; the flat `pairs()` form is RETIRED --"
                              " write binaryParameters { <i>-<j> {...} }"
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
                        " only `model <X>;` (the selectable-rule wave comes"
                        " later, never by accident).");
                auto mb = std::make_shared<Dictionary>(mrow.v1key);
                mb->insert("model", pb->entryValue("model"));
                transportDict->insert(mrow.v1key, EntryValue(mb));
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

    // Native EoS config: model + binaryInteractions with each declared
    // SOURCE record loaded, eos-match-verified and inlined as the {i;j;kij}
    // dicts the EoS constructors consume (the same refusals + citation
    // announce as the scaffold path -- one contract, two assemblies).
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
