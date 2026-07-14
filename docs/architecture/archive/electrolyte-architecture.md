> **SUPERSEDED / ARCHIVED (2026-07-14).** Describes the pre-A1..A3 electrolyte
> mechanism (single `activityModel` slot, RTTI `dynamic_cast`, an `electrolyte{}`
> block inside the salt .dat) — all replaced. The living authorities are
> `architecture/property-architecture.md` and `architecture/electrolyte-data-architecture.md`.
> Kept only for the reasoning trail. Do NOT implement from this file.

# Electrolyte organization — SHIPPED (classical, OpenFOAM-style) 2026-06-08

**SETTLED — do not relitigate.** Electrolyte activity is **one option of the single
`activityModel` slot**, exactly like NRTL — NOT a parallel `electrolyteModel{}` block.

```
components       ( water NaCl );
activityModel    { model pitzer; }    // (eNRTL is the next option of this slot)
equationOfState  { model idealGas; }
```

- **`pitzer` is registered in the `ActivityModel` factory.** `ElectrolyteActivity`
  (`src/thermo/activityCoefficient/ElectrolyteActivity.{H,cpp}`) IS-A `ActivityModel`
  AND implements the `ElectrolyteModel` interface. `gamma(T,x)` returns 1 for the
  nonvolatile salt and `a_w/x_w` for the solvent; the molality+charge surface
  (`waterActivity`/`gammaPM`/`osmotic`/`solubility`/`saturationKsp`) is the side interface.
- **`ThermoPackage`** recovers it by `dynamic_cast<ElectrolyteModel*>(activity_.get())`
  (`hasElectrolyte()`/`electrolyte()`) — the `dynamic_cast<Wilson*>` precedent — and
  `configure(components_)` wires it (Wilson::setMolarVolumes precedent). No `electrolyteModel`
  block, no `electrolyte_` member.
- **Data lives with the species, declared ONCE, called by name:**
  - salt dissociation + solubility → `electrolyte { cation; anion; solubility; }` block IN the
    salt's `data/standards/components/<salt>.dat` (a field, not a folder — flat-components intact);
  - ion charge + MW → `data/standards/electrolyte/ions.dat`;
  - Pitzer pair params → `data/standards/electrolyte/pairs.dat`.
  The case re-types NOTHING chemical.
- **Consumers** (`Evaporator` BPE from `a_w`, `Crystalliser` saturation from `Ksp`) read
  `thermo.electrolyte()`. No per-unit hack.
- **Regression-safe:** molecular cases never name `pitzer` → `dynamic_cast` is null →
  byte-identical. 137/1 (the 1 = pre-existing process05). Electrolyte KPIs byte-identical
  before/after the reorg (BPE 5.302332 K, Ksp 38.4846, yield 18.83%).
- **Scope:** single salt, 25 C. Multi-salt brine (theta/psi mixing) + T-dependence are the
  next slices; eNRTL is the next `activityModel` option. WASM rebuild needed for the GUI to
  see `pitzer` (`make wasm-gui`).

---

# Electrolyte architecture — design forum synthesis (build spec)

_Output of the 4-perspective design forum (run 2026-06-08). This is the blueprint
for the DEFERRED core integration (ElectrolyteModel sibling + ThermoPackage wiring),
to be built under supervision. The data catalogue, single-salt kernel, and the
`pitzerActivity` op are already done and validated (see PROVENANCE.md / VALIDATION.md)._

## Base design

SIBLING base 'ElectrolyteModel', NOT an extension of ActivityModel. Decisive, all four perspectives agree. Create src/thermo/electrolyte/ElectrolyteModel.{H,cpp} as an independent abstract base with its own explicit factory (registerModel/New/registerBuiltins, no macros, called explicitly in each main.cpp next to ActivityModel::registerBuiltins). Built-ins: reg("pitzer", ...) now, reg("eNRTL", ...) later.

WHY sibling, not extend: (1) Different independent variable -- ActivityModel::gamma(scalar T_K, const sVector& x) is MOLE-FRACTION + charge-blind; Pitzer is MOLALITY [mol/kg solvent] + needs signed charges and ionic strength I=1/2 sum(m_i z_i^2). (2) Different reference state -- molecular gamma is symmetric (Raoult, gamma->1 at pure); electrolyte is unsymmetric (gamma*->1 at infinite dilution). (3) Different return surface -- molecular returns one sVector; electrolyte returns per-ion gamma PLUS gamma_pm, osmotic phi, water activity a_w. Cramming these into gamma(T,x) either pollutes the molecular signature with charge/molality side-channels (every NRTL/Wilson/UNIFAC student reads 'what is z doing here?') or hides a molality conversion in the call -- both anti-glass-box. (4) REGRESSION SAFETY IS STRUCTURAL: ActivityModel is untouched, so the 135 molecular cases cannot be disturbed -- they do not link a symbol that changed. This is worth more than any code sharing.

KEEP PitzerSingleSalt.H FROZEN AS-IS. It is validated (NaCl AAD 0.17%, CaCl2 0.49%) and becomes the analytic golden-master ORACLE: a single-salt system run through the new multi-ion PitzerMultiIon must reproduce PitzerSingleSalt::gammaPM(m) to ~1e-9. Free, rigorous regression for the new multi-ion sums (covers CaCl2 2:1 and the Cphi->C_ca conversion). The new multi-ion model reuses its g/g'/h kernels but is a NEW class.

Files NEW: src/thermo/electrolyte/{ElectrolyteModel.H,ElectrolyteModel.cpp,PitzerMultiIon.H,PitzerMultiIon.cpp,IonSystem.H,ElectrolyteCatalogue.{H,cpp},PitzerConstants.H}. KEEP PitzerSingleSalt.H. REPLACE later: propertyOps/PitzerActivity becomes a thin driver over ThermoPackage::electrolyte() so the math lives in ONE place (the model), never duplicated in the op.

## Interface

```cpp
// src/thermo/electrolyte/ElectrolyteModel.H -- the sibling base + factory
namespace Choupo {
class ElectrolyteModel {
public:
  virtual ~ElectrolyteModel() = default;
  // Bundle: every electrolyte consumer wants these TOGETHER (shared I, sqrt I, B/C sums
  // computed once -> no drift between independently-rounded calls, cheaper).
  struct Result {
    sVector gammaIon;       // gamma*_i per ION, molality/unsymmetric basis (size = nIons)
    scalar  gammaPM = 1;    // mean ionic activity coeff of the declared/reported salt
    scalar  phi     = 1;    // osmotic coefficient
    scalar  aWater  = 1;    // solvent (water) activity
    scalar  ionicStrength = 0;  // I [mol/kg] -- surfaced because it IS the story
  };
  virtual std::size_t nIons() const = 0;
  virtual const std::vector<std::string>& ionNames() const = 0;
  // THE hot path: m = molalities [mol/kg] aligned to ionNames(). T explicit (25 C-only
  // math for slice 1, but signature already T-aware so T-dependence is additive later).
  virtual Result evaluate(scalar T_K, const sVector& m) const = 0;
  virtual const std::string& modelName() const = 0;
  // Factory handed the resolved ion names + Database (loads the pair table for exactly
  // those ions). Same shape/ceremony as ActivityModel::Factory.
  using Factory = std::function<std::unique_ptr<ElectrolyteModel>(
      const DictPtr&, const std::vector<std::string>& ionNames, const Database&)>;
  static void registerModel(const std::string& name, Factory f);
  static std::unique_ptr<ElectrolyteModel> New(
      const DictPtr&, const std::vector<std::string>& ionNames, const Database&);
  static void registerBuiltins();   // reg("pitzer", ...); later reg("eNRTL", ...)
private:
  static std::map<std::string, Factory>& registry();
};
}

PitzerMultiIon : public ElectrolyteModel implements the Pitzer-Harvie-Weare (1984) multicomponent equations (exactly what PHREEQC pitzer.dat is parameterised for):
  I = 1/2 sum_i m_i z_i^2 ;  Z = sum_i m_i |z_i|
  F = -A_phi[sqrt I/(1+b sqrt I) + (2/b)ln(1+b sqrt I)] + sum_c sum_a m_c m_a B'_ca  (+Phi' deferred)
  ln gamma_M = z_M^2 F + sum_a m_a (2 B_Ma + Z C_Ma) + |z_M| sum_c sum_a m_c m_a C_ca  (+theta/psi/lambda deferred)
  ln gamma_X = mirror for anions
  phi-1 = (2/sum m)[ -A_phi I^{3/2}/(1+b sqrt I) + sum_c sum_a m_c m_a (B^phi_ca + Z C_ca) ] (+theta/psi deferred)
  ln a_w = -(M_w/1000) phi sum_i m_i
  gamma_pm = (gamma_M^{nu_c} gamma_X^{nu_a})^{1/nu}
B_ca/B'_ca/B^phi use the same g(alpha sqrt I)/g'(alpha sqrt I) functions already inlined in PitzerSingleSalt::h; alpha1=2.0 (1.4 for 2:2 when beta2!=0), alpha2=12.

CRITICAL CONVERSION (highest-risk, silent at 1:1): PHREEQC -C0 column is C^phi, NOT C_ca. Single-salt uses Cg=1.5*Cphi internally; the multi-ion ln gamma needs C_ca = C^phi/(2 sqrt(|z_c z_a|)). Convert ONCE at load in the catalogue, STORE BOTH (C^phi for phi, C_ca for ln gamma). Wrong the first time someone runs CaCl2/MgSO4 if skipped.

SLICE 1 SCOPE: Debye-Huckel + cation-anion double sum (beta0/beta1/beta2/Cphi) only. DEFER theta (like-charge mixing), psi (triplets), lambda (neutral-ion), and Pitzer's E-theta(I) higher-order electrostatic asymmetric-mixing/J-functions (set E-theta=0). theta/psi are ZERO for single salt and the brine differentiator; recommend shipping theta+psi in slice 1 (Na/K/Ca/Cl/SO4 seawater is Vitor's adjacent turf) but lambda/E-theta deferred. Flag every gap loudly in the header exactly as PitzerSingleSalt.H already does. With theta/psi/lambda off the kernel reduces EXACTLY to PitzerSingleSalt (the oracle test). Pre-index every pair/triplet to integer ion offsets at construction so evaluate() is pure double arithmetic -- no map lookups, no provenance on the hot path.

Shared constants in PitzerConstants.H included by both kernels: b=1.2; A_phi(25C). NOTE A_phi mismatch -- single-salt uses 0.3915; for the 1e-9 oracle cross-check both MUST include the SAME constant from PitzerConstants.H (pick 0.3915 to match the frozen, validated kernel; do not silently switch to 0.391475).
```

## Integration (regression-safe)

ADDITIVE, regression-green BY CONSTRUCTION. ThermoPackage gains exactly ONE optional member + ONE guarded read block; no existing method changes signature; the molecular path (activity_, Phase::fEffective, K, Kvec, H_ig, all 135 cases) is byte-for-byte identical when no ions are present.

ThermoPackage.H (private, additive):
  std::unique_ptr<ElectrolyteModel> electrolyte_;   // null for every molecular case
  std::vector<IonSpec>              ions_;           // name, z, MW from ions.dat
  std::vector<Dissociation>         dissoc_;         // component -> (ion, nu) list
Public accessors (additive):
  bool hasElectrolyte() const { return electrolyte_ != nullptr; }
  const ElectrolyteModel& electrolyte() const { return *electrolyte_; }
  sVector ionMolalities(const sVector& z) const;    // VISIBLE x->molality helper

ThermoPackage::readFromDict -- append AFTER the existing activity/EoS/audit blocks, guarded so molecular cases NEVER enter it:
  if (dict->found("electrolyte")) {
    auto ed = dict->subDict("electrolyte");
    ions_   = ElectrolyteCatalogue::loadIons(ed->lookupWordList("ions"), db);
    dissoc_ = parseDissociation(ed, ions_, components_);
    std::vector<std::string> ionNames; for (auto& s : ions_) ionNames.push_back(s.name);
    electrolyte_ = ElectrolyteModel::New(ed, ionNames, db);  // factory: pitzer
  }
The branch is decided ONCE at load ('does the dict have an electrolyte block?'). No runtime molecular-vs-electrolyte dispatch in the hot K-value path.

IONS ARE NOT Components. Do NOT push ions through components_ and do NOT bolt a charge field onto Component -- that pollutes the molecular path and tempts a runtime branch. Ions live in the model's own IonSystem (name, z, MW from ions.dat). The solvent (water) stays a normal Component; solventName() already exists. This cleanly separates the molality world (electrolyte) from the mole-fraction world (molecular gamma-phi), which is the whole point of the sibling base. (Vitor's request 'ions called by name from a case' is honoured via the `ions ( Na Cl );` word-list resolving against ions.dat -- they are named species, just not molecular Components.)

CASE SYNTAX (additive sibling block in thermoPackage; molecular keys untouched, every existing dict parses identically):
  components ( H2O NaCl );       // molecular/neutral species as today
  solvent    H2O;
  activityModel { model ideal; } // molecular path -- untouched
  electrolyte {
    model pitzer;
    ions ( Na Cl );              // dict-safe SHORT names from ions.dat (see data_format)
    dissociation { NaCl ( Na 1  Cl 1 ); }   // how a declared component dissolves into ions
    // optional: reportSalt NaCl;  (which gamma_pm to surface as a KPI)
  }

FIRST CONSUMER = the osmotic-pressure path (membrane module / the rewritten pitzerActivity propertyOp): a_w -> Pi = -(RT/V_w) ln a_w is exactly NF/RO needs, and where validation data exists. Wiring electrolyte gamma into FLASH K-values is a LATER slice -- do not attempt in slice 1. Consumers call only when hasElectrolyte(): sVector m = thermo.ionMolalities(z); auto r = thermo.electrolyte().evaluate(T_K, m);

main.cpp (all four apps): add ElectrolyteModel::registerBuiltins(); beside the existing registerBuiltins() calls. eNRTL later = one more registerModel("eNRTL", ...) line, zero structural change -- the payoff of the sibling base.

## Data format

TWO flat catalogue files, list-of-dicts, mirroring the UNIFAC two-file precedent (groups.dat + interactions.dat). RETIRE the per-salt scaffold (NaCl.dat, CaCl2.dat).

  data/standards/electrolyte/
    ions.dat    # species registry: name, z, MW, longName            (the groups.dat analogue)
    pairs.dat   # binary cation-anion + theta + psi + lambda blocks   (the interactions.dat analogue)
    README.md   # provenance manifest (ref.N -> primary citation) + 'how to add a pair' + dropped-data honesty note
    INDEX.md    # generated coverage matrix (cations x anions, cell=has-B0) -- a VIEW, not storage

WHY one pairs.dat, NOT per-ion files and NOT per-salt files:
 - A Pitzer parameter is RELATIONAL (54 B0 pairs, 30 theta, 59 psi, 26 lambda); beta0(Na,Cl) has no natural home in either ion's file. Per-ion files re-introduce the SO4-2.dat filename problem 23x.
 - Per-salt files encode the WRONG primitive: CaCl2 and MgCl2 would each privately re-store Cl- and re-store the salt's component, the binaryPairs combinatorial explosion already rejected for NRTL. Pitzer is about REUSED ION PAIRS, not salts -- the Na-Cl row must serve pure NaCl AND a 5-ion brine. Show that with one row per interaction.
 - This does NOT relitigate 'components/ stays flat': that rule is O(1) by SINGLE name -> file-per-entity. A pair is keyed by TWO+ names with no natural filename and natural ordering varies in nature (PHREEQC writes both `Cl- Na+` and `Na+ Cl-`). The catalogue is ~170 rows, read ONCE at package construction into an in-memory map, never on the hot path. Exactly the UNIFAC situation, already settled as two files. Ions are a NEW feature catalogue under data/standards/electrolyte/, like binaryPairs/, henry/, unifac/.

DICT-TOKEN PROBLEM (SO4-2, B(OH)4-, Mg+2 break the tokenizer: +,-,(,) and digit adjacency). The existing scaffold ALREADY solved this -- it writes `species Na; z 1;` (dict-safe short name, no +/-). Adopt that: ions carry TWO names -- a dict-safe `name` (bare word: Na, Cl, Ca, SO4, Mg) the case and tokenizer hold, and a `key`/`formula` (the chemistry string, QUOTED) for provenance/display. The case author writes `ions ( Na Cl SO4 );` -- never SO4-2. More pedagogically legible too. SLICE-1 limit: restrict to paren-free ions (Na,Cl,K,Ca,Mg,SO4,...); defer borate/carbonate complexes (B(OH)4-, ...) which need lambda anyway -- documented limit, not a bug.

ions.dat schema (one row per species; from SOLUTION_MASTER_SPECIES):
  ions ( { name Na;  formula "Na+";   z  1;  MW 22.9898; long "sodium ion"; source "PHREEQC pitzer.dat (USGS, public domain)"; }
         { name Cl;  formula "Cl-";   z -1;  MW 35.453;  long "chloride"; ... }
         { name Ca;  formula "Ca+2";  z  2;  MW 40.08;  ... }
         { name SO4; formula "SO4-2"; z -2;  MW 96.06;  ... } );    // ~23 rows
  NOTE: PHREEQC's MW column for sulfate is 32.064 (the S atom, gfw of element), NOT 96.06 of SO4 -- the importer must compute the ION molar mass, not copy the element gfw column blindly.

pairs.dat schema (sub-lists per parameter family):
  binary ( { c Na;  a Cl;   b0 0.0765; b1 0.2664; b2 0;     Cphi 0.00127; source "Pitzer & Mayorga 1973, JPC 77:2300"; }
           { c Ca;  a Cl;   b0 0.3159; b1 1.614;  b2 0;     Cphi 1.4e-4; source "..."; }
           { c Mg;  a SO4;  b0 0.2135; b1 3.343;  b2 -37.23; Cphi 0.025; source "Pitzer 1991 (2:2)"; validation "pending"; } );
  theta  ( { i Na; j K;  theta -0.012; source "..."; } );          // slice 1/2
  psi    ( { i Ca; j Na; k Cl; psi -0.0148; source "..."; } );     // slice 1/2
  lambda ( { n CO2; ion Na; lambda 0.085; source "..."; } );       // deferred slice
 - Store only b2; the loader DERIVES alpha1=1.4 when b2!=0 else 2.0 (alpha is derived, not primary data -- storing it invites inconsistency). Document the rule in README.
 - Drop the PHREEQC T/P coefficient tail (take only the FIRST numeric column = 25 C base); record validity "298.15 K". Reserve a betaT(...) sub-list for the later T-slice.

PROVENANCE: per-row `source` = the per-VALUE primary citation (Pitzer & Mayorga 1973 1:1/2:1; 1974 2:2; Pitzer 1991 monograph for ref.3). PHREEQC pitzer.dat is the public-domain CHANNEL, not the citation -- cite the PRIMARY per the project rule. USGS public-domain means even the no-grant exclusion does not bite -- cleanest possible provenance.

POPULATION (deterministic, auditable): a ONE-SHOT curation tool committed alongside its output (engine refuses to write under data/standards/). Parse SOLUTION_MASTER_SPECIES -> ions.dat (compute ion MW, parse z from suffix, cross-check, drop redox/gas pseudo-species but keep neutrals CO2/B(OH)3/H4SiO4 with z 0 for lambda). Join -B0/-B1/-B2/-C0 on the unordered {cation,anion} set (b1=0 if absent etc.), canonicalize ion order by sign of z, sort for stable diffs, map `# ref.N` comments to the README manifest, emit per-row source + a coverage receipt to stdout.

## Build steps

1. Slice 0 -- scaffolding, regression untouched. Add ElectrolyteModel.{H,cpp} (abstract base + factory + empty registerBuiltins) and PitzerConstants.H (b, A_phi shared with PitzerSingleSalt). Wire ElectrolyteModel::registerBuiltins() into all four main.cpp beside existing calls. No model registered yet. Build native + run bin/runTests -> 135 still green (nothing references the new base).
2. Data + catalogue loader. Write the one-shot importer (bin/curate/pitzerImport.*) from /tmp/pitzer.dat; generate data/standards/electrolyte/{ions.dat,pairs.dat,README.md,INDEX.md} (commit tool AND output). Add ElectrolyteCatalogue.{H,cpp} + IonSystem.H to load both files (resolve ion names->z/MW, build integer-indexed pair map, convert C^phi->C_ca storing BOTH, derive alpha from b2). Unit-check the loader by hand-printing a few rows. Retire scaffold NaCl.dat/CaCl2.dat ONLY after grep confirms no src/tutorial references the file path (the two propsDict tutorials reference salt NAME via the op, repoint them in step 5). runTests green.
3. PitzerMultiIon model. Implement evaluate() with DH + cation-anion double sum (+theta+psi if shipping in slice 1; lambda/E-theta deferred and header-flagged). Register reg(pitzer,...) in ElectrolyteModel::registerBuiltins(). ORACLE TEST: a {Na,Cl} system reproduces PitzerSingleSalt::gammaPM(m) to ~1e-9 across 0.1-6 mol/kg; add CaCl2 (2:1, exercises C_ca conversion) and MgSO4 (2:2, exercises beta2/alpha switch). runTests green.
4. ThermoPackage integration. Add electrolyte_ member + guarded if(dict->found(electrolyte)) block + ions_/dissoc_ + ionMolalities()/hasElectrolyte()/electrolyte() accessors + parseDissociation + assembly-time electroneutrality check that REPORTS ALOUD. Molecular path untouched. runTests green (no molecular case has the block).
5. Rewrite propertyOps/PitzerActivity as a thin driver over ThermoPackage::electrolyte() (delete the salt-keyed scaffold math; single source = the model). Repoint the two existing tutorials (pitzer01_nacl, pitzer02_cacl2) to the new electrolyte{} + ions() syntax; add expected golden masters (cross-checked vs Robinson & Stokes / the single-salt oracle). Add a seawater multi-salt tutorial (Na/K/Ca/Cl/SO4) with golden master. Full bin/runTests green; rebuild WASM (make wasm-gui) so the GUI sees the model.
6. DOCS + memo: docs/ai/{components,unit-ops,pitfalls}.md note the electrolyte{} block + ions catalogue; CLAUDE.md adds the ElectrolyteModel sibling base to the architecture list + the slice scope/gaps; NOTICE adds PHREEQC/USGS public-domain manifest entry. eNRTL left as a documented future registerModel slot.

## Risks

- C^phi vs C_ca conversion is the single highest-risk item: SILENT at 1:1 (sqrt|z_c z_a|=1), WRONG at 2:1/2:2. Mitigate by converting at load, storing both, and shipping CaCl2 + MgSO4 golden masters so it can never regress to a 1:1-only assumption.
- A_phi constant mismatch: single-salt PitzerSingleSalt uses 0.3915; some literature uses 0.391475. The 1e-9 oracle cross-check REQUIRES both kernels share one constant from PitzerConstants.H -- use 0.3915 to match the frozen validated kernel; do not silently switch.
- beta2/alpha coupling: alpha1 must flip to 1.4 whenever beta2!=0 (2:2 salts). Drive it from b2 in pairs.dat (DERIVED, not stored per row) -- explicit, no hidden charge-sniffing heuristic.
- Deferred terms: E-theta(I) higher-order electrostatic asymmetric mixing (the J-functions) and lambda neutral-ion are omitted in slice 1; if theta/psi are also deferred, multi-salt brine phi will subtly drift and a sharp student will notice. Recommend shipping theta+psi in slice 1 (seawater is the differentiator); flag every gap loudly in the header exactly as PitzerSingleSalt.H does -- honest scope, not a silent crutch.
- Tokenizer + paren ion names: B(OH)4-, B4O5(OH)4-2 break the dict list parser. Slice 1 = paren-free ions only via the dict-safe `name` field; defer complexes (they need lambda anyway). Documented limit.
- MW provenance trap: PHREEQC's master-species gfw column is the ELEMENT mass (e.g. 32.064 for S under SO4-2), not the ion's molar mass. The importer must compute the ION MW, not copy the column. Likewise un-validated 2:2 rows (MgSO4) must ship with source '...; validation pending' rather than implying parity with the validated 1:1 set -- run them through the kernel vs Robinson & Stokes and record AAD before claiming good.
- Electroneutrality: a mis-specified dissociation can yield a non-neutral ion set. Add an assembly-time sum(m_i z_i)~=0 check that ANNOUNCES (validation boundary, not hot path) -- loud error, never silent renormalisation (no-silent-crutch credo).
- Single-source-of-math: ensure the rewritten pitzerActivity op and any membrane consumer both call ThermoPackage::electrolyte(); do not let a second copy of the Pitzer equations survive in the propertyOp.
