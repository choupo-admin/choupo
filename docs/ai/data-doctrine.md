# Data-governance doctrine — where every number lives, and why

This is the **curator's** doctrine: a mechanical decision procedure for
WHERE a thermodynamic number belongs in `data/standards/`, the case tree,
or an operation's `constant/`.  It is the settled, ratified governance
(four-pillar design review) and it gates every component-`.dat` curation
act and every property-model PR.  Read it before you add, move, or refine a
number.  The companion files are
[`components.md`](components.md) (the catalogue field glossary),
[`thermo.md`](thermo.md) (the model shapes + the cascade table), and
[`property-architecture.md`](../property-architecture.md) (estimation is a
RESOLUTION problem solved at CURATION time — SETTLED, do not reopen).

---

## 1. The golden rule — ARITY, then SCOPE, then KIND

> **A datum's home is decided by ARITY, then by SCOPE, then by KIND — in that order.**

**(1) ARITY — how many species does the *definition* name?**
Read the quantity's definition, not its frequency of use.

- If it is well-defined with the molecule **alone on the table** — no second
  species named, **not even implicitly** — it is INTRINSIC and lives in
  `data/standards/components/<name>.dat`.
- The instant the definition must name a **partner** (a solvent, a
  counter-ion, an interaction species) — **even if that partner is water** —
  it is PAIR/SET data and lives in a **catalogue**
  (`binaryPairs/`, `henrysLaw/`, `electrolyte/`, the `solution/` tier, the
  declarative `parameters/{binary,electrolyte,eos}/` tree — e.g.
  `parameters/SRK/<i>-<j>.dat`, …), keyed by the pair, **cited per
  value**, referenced **by name** from the component.  The number is **never
  copied into the `.dat`**.

**(2) SCOPE — at what level is the number TRUE?**
A datum lives at the **highest level where it is TRUE**.  The canonical value
is a curation act in `data/standards/` (write-guarded — the engine REFUSES to
write there).  A lower node (case → sector → unit) may **OVERLAY** the value
only when the lower scope makes it *more true* — a sample-measured
refinement.  The overlay is a **patch, never a fork**: the molecule stays
whole at every level (see §3, the cascade).

**(3) KIND — is it the molecule, or the molecule-in-a-machine?**
If the number describes the molecule inside a piece of equipment — a **RATE**
(kinetics) or a **GEOMETRY/DISTRIBUTION** (PSD) — it is NOT component data at
all.  It lives in the **operation's `constant/`**
(`constant/crystallisation`, `constant/dryingKinetics`, `constant/reactions`),
keyed to the equipment.  PSD is a **stream** attribute.  A component `.dat`
at *any* level never carries a rate, a PSD, or a `thermoPackage` placeholder.

### The one test that runs all three

> *"Does this number stand alone with the molecule (→ `.dat`), require a
> partner (→ catalogue), describe a sample at one scope (→ overlay at that
> scope), or describe the equipment (→ operation `constant/`)?  And is the
> second species, the model, and the level WRITTEN DOWN where the student can
> SEE it?"*

Nothing — no solvent, no model, no level — is ever **implicit** on disk.
"implied" / "assumed" is the forbidden word; the second species, the model,
and the level are always **named in the file**.

### No juice-less files — every file carries its own explanatory content

The explicitness rule has a file-level corollary: **a content-free file is
forbidden**.  An empty role overlay, any stub that tells the reader nothing —
all the same disease.  The `package <name>;` shared-catalogue selector — the
classic juice-less one-liner — is now retired outright: `constant/propertyDict`
is ALWAYS the inline manifest (components, methods, parameter sources all IN the
case, each explaining itself; a case never reaches out to a shared registry for
its thermo).  (Sibling rule already below: a unit `constant/` never carries a
`thermoPackage` placeholder — §3.)

### Derivatives are NEVER stored — the salt-formation rule (settled 2026-06-29, forum)

The arity test has a sharp corollary: **a number FIXED by an exact identity to
data already in the tree is a DERIVATIVE, and a tree never stores its
derivatives.**  The canonical case is a salt's *solid* formation enthalpy —
`Hf_solid = Σνᵢ·hfAq_i − dH_soln`, pinned by the aqueous ions
(`species/aqueous.dat` `hfAq`) and the heat of solution (the component's
`electrolyte { dissolutionEnthalpy }`).  Writing it a *third*, component-level
`standardThermochemistry` literal is the **arity-1 sin in its purest form**: a second
source of truth that drifts silently from the two primaries that determine it
(it drifted 7 J/mol on day one).  Derive it once, at load, announced — never
store it.  `bin/curate/check_ion_pins.py` **exits 1** if any component carrying
`dissolutionEnthalpy` also carries a `standardThermochemistry` block.  *(Contrast the
property-architecture's curation-time resolution: that is for a datum the engine
CANNOT otherwise reach — a Joback `Tc` — never a value the engine already
derives live.  Property-architecture answers HOW a MISSING datum is filled;
arity-1 answers WHERE a PRESENT one lives.)*

---

## 2. The water decision — strict purity, an aqueous TIER, a LOUD default

Water gets **NO exemption** from the arity test.  An "in-water" property is
pair data wearing a convenience hat — it does **not** go in `<name>.dat`.

Putting an in-water property in the component with water as the *implied*
solvent is the commercial black-box sin in miniature: the student opens
`sucrose.dat`, cannot see that a **second species was silently assumed**,
then runs an ethanol-solvent case and inherits a water number with no
warning.  **Forbidden.**

**The sharp criterion:** *a property is INTRINSIC iff its definition names
only the compound.  The moment the definition forces you to name a partner —
even the word "aqueous" — it is PAIR data and lives in a catalogue.  The test
is the DEFINITION, not the frequency of use.*

| Quantity | Definition names… | Arity | Home |
|---|---|---|---|
| crystalline ΔH_f, S°, Cp_solid/liquid, Tc, Pc, ω, MW, Vliq | the pure compound + its elements | 1 | `components/<name>.dat` |
| ΔH_soln (crystal → **aqueous**) | solute **+ water** | 2 | `solution/<solute>-water.dat` |
| aqueous Hf°, S°(aq), Cp°(aq) at ∞-dilution | ion **+ water** (the solvation state IS water) | 2 | `species/aqueous.dat` |
| NRTL/Wilson τ, Henry H, Pitzer β, EOS k_ij | i **+** j | 2 | the relevant pair catalogue |

### Water's one earned privilege — a TIER, not a slot

Water is ubiquitous enough to earn **one canonical, named, by-name aqueous
reference tier in the catalogue** — and it already physically exists for ions
in `data/standards/species/aqueous.dat` (`hfAq / sAq / cpAq` at infinite
dilution, H⁺(aq)=0 convention, Wagman/NBS 1982; `NaOH.dat` points at it by
name).  The privilege is: **water alone gets a dedicated reference tier
referenced by name — that tier is a catalogue file, never a component slot.**

For *molecular* solutes the sibling tier is **`data/standards/solution/`**
(`solution/<solute>-<solvent>.dat`) — the molecular-solute counterpart of the
ionic `ions.dat`.

### The default-solvent rule — the convenience, delivered honestly

The package declares a default solvent once (it already does for Henry's law:
`solvent water;`).  When an "in-solvent" property is needed and no solvent is
named at the call site, the resolver uses the default **and announces it on
every run**:

```
[thermo] solution property dHsoln(sucrose): solvent not named at use -> DEFAULT solvent = water
         source: solution/sucrose-water.dat  [Putnam & Kilday 1986]   origin: literature
```

That one line delivers the water-is-implied ergonomics **and** shows (a) a
default was applied, (b) which solvent, (c) which file, (d) the primary source
— the four things a black-box simulator hides.  **Off-default it fails with a remedy:** if the
case's actual solvent is not the default and no matching pair exists, the
resolver **refuses** ("dHsoln(sucrose) requested in solvent ethanol; only
sucrose-water exists; provide solution/sucrose-ethanol.dat or accept water
explicitly") — never silently substitutes the water number.

---

## 3. The fractal cascade — overlay-and-add is the only verb

**The invariant:** *a component is ONE molecule.  A datum lives at the highest
level where it is TRUE; a lower node only OVERLAYS when it is MORE true for
that scope.  The molecule is WHOLE at every level — materialise it at any node
and it is a complete component.  Equipment turns data into a RATE or a
GEOMETRY; that is never component data.*

| Level | MAY add | MAY NOT add | Overlay merges… |
|---|---|---|---|
| **standard** `data/standards/components/<name>.dat` | the canonical molecule: identity, critical, gasIdeal, liquidPure, solid, transport, `eosParameters{}`; the FROZEN truth | sample-specific data; equipment rates/PSD; **engine REFUSES to write here** | — (base) |
| **catalogue** `data/standards/<feature>/<pair>.dat` (binaryPairs, henrysLaw, electrolyte, **solution**, unifac, `parameters/{binary,electrolyte,eos}/` — e.g. `parameters/SRK/<i>-<j>.dat`) | PAIR/SET/ion-tier data with no single owning molecule (NRTL τ, Henry, Pitzer β, k_ij, ΔH_soln-in-water) | anything ownable by one molecule alone | — (base, per pair) |
| **case** `<case>/constant/components/<name>.dat`, `constant/<feature>/<pair>.dat` | sample-refined molecular **blocks**; case-local pairs/ions the case uses (self-containment) | a NEW molecule's identity (MW/Tc/Pc are born only at standard); equipment rates/PSD | **top-level BLOCK** |
| **sector** `<case>/<sector>/constant/…` | the SAME, scoped to the sector (a sector = a thermo region) | re-hosting the whole molecule; equipment physics | top-level BLOCK |
| **unit** `<case>/<sector>/<unit>/constant/…` | the SAME molecular-refinement overlay; **AND** the unit's EQUIPMENT files (`constant/crystallisation`, `constant/dryingKinetics`, `constant/reactions`) | re-hosting the molecule; a `thermoPackage` placeholder (shadows the case default, breaks the run) | top-level BLOCK |

**Resolution precedence, lowest → highest:** `local < standard < case <
sector < unit` (the `Database` walk-up already gives unit→sector→case; pairs
resolve `standard < caseRoot < perNode`).

### The declarative layer — `propertyMethods/` + the inline package manifest (2026-07-04 grammar)

One further standards home, plus the case-inline package manifest, carries
the DECLARATIVE layer the 2026-07-04 grammar reads from:

* **`data/standards/propertyMethods/<family>/<name>.dat`** — one record per
  method (`activity/NRTL`, `solution/henryDilute`, `eos/{SRK,PengRobinson}`,
  `electrolyte/{pitzer,eNRTL}`, `transport/chung`), each carrying its
  per-GROUP `referenceBasis` rungs (amendment A1) and its `requires{}` /
  `provides{}` contract.
* The property package is the manifest INLINE in the case's
  `constant/propertyDict` — there is no shared `propertyPackages/` catalogue
  (the `package <name>;` selector was retired; every case is self-contained).

The contract is **declare → verify → refuse**: the package DECLARES its
parameter files (`parameters { henryPairs {…} kijPairs {…} }`, pointing into
`henrysLaw/` and `parameters/{binary,electrolyte,eos}/`), and the
`ThermoPackageBuilder` VERIFIES every declared file at assembly — a
declared-but-missing/unparseable entry REFUSES loudly, naming the entry to
add, and each loaded pair is announced with its source (`[builder]` /
`[henry]` lines).  The builder loads and assembles; it NEVER estimates.

### THE MERGE SEMANTICS — block-by-block, NOT field-by-field

The overlay merges **top-level-key-by-key**, NOT field-by-field inside a
sub-dict.  An overlay carrying `solid { rho_p 1610; }` replaces the **entire**
`solid{}` block — the standard's `k_v` is **lost**, not deep-merged.

A reference-state block (`solid{}`, `gasIdeal{}`, `liquidPure{}`, each
`eosParameters.<model>{}`) is the **atomic unit of physical meaning** — you
override a reference state, not a stray scalar inside one.  Deep-merging a
lone scalar across a block boundary would silently mix a sample's `rho_p` with
the catalogue's `k_v` — the exact **hidden-hybrid** the engine warns about.

> **The curator MUST copy the whole block they refine.**  A lone-scalar
> overlay is the forbidden hidden hybrid.

The one correct exception already coded is the `isEstimate` `[backfill]`
guard, which announces per-key when the frozen catalogue fills an estimate's
gap — that stays.

**The three (and only three) legal lower-node moves:**
1. refine a component **block** → `constant/components/<name>.dat` overlay
   (whole block);
2. refine/supply a pair or model-param block →
   `constant/<feature>/<pair>.dat` or an `eosParameters{}` overlay;
3. supply equipment physics → the operation's own `constant/<physics>`.

A node can do **nothing else** — it cannot mint a molecule mid-tree, cannot
redefine an intrinsic field's *meaning*, cannot hide a rate inside a
component.

---

## 4. Model extensibility — `eosParameters{ <model>{…} }`

A parameter lives at the **highest tier where it is TRUE** — the same
definition test as §2, asked of the *model*: *does the number require you to
name the model?*

1. **GENERATED from the corresponding-states triad → stays in the standard
   `.dat`, untouched.**  Any model that needs only `{Tc, Pc, ω}` (every cubic:
   SRK, PR, RK, PT, a new α-function) **reads the triad off the Component and
   derives its own `a_c, b, m, α(T)` in source**.  Adding such a model touches
   **zero data files** (this is why adding PR after SRK touched no `.dat`).  Do
   **not** pre-bake `a_c` into the `.dat` — that duplicates a value the model
   owns and lets the two drift.
2. **Model-specific PURE parameters that CANNOT be generated → a
   `model`-keyed sub-block on the component**, read as a raw sub-dict (exactly
   like the live `liquidViscosity{}` pattern):
   ```
   // inside the component .dat — ADDITIVE; never disturbs the triad
   eosParameters
   {
       PCSAFT  { m 2.4653;  sigma 3.6478e-10;  epsilon_k 287.35;
                 provenance { origin regressed; method "Gross & Sadowski 2001 Table 1"; } }
       // a future EOS adds its OWN key here; SRK/PR appear in NO key (they read Tc,Pc,omega)
   }
   ```
   Each factory reads **its own** sub-block by name and ignores the rest.  One
   molecule carries SRK + PR + PC-SAFT + the next EOS simultaneously, never
   colliding, each with its own `provenance{}`.
3. **PAIR parameters (k_ij and friends) → the declarative parameter
   catalogue**, `data/standards/parameters/SRK/<i>-<j>.dat` (siblings:
   `parameters/<MODEL>/` for activity pairs, `parameters/electrolyte/` for
   Pitzer/eNRTL), mirroring `binaryPairs/NRTL/<i>-<j>.dat`, declared in the
   propertyPackage (`parameters { kijPairs { N2-CH4 "…"; } }`) and announced
   at assembly (`[builder] kij(N2,CH4) = 0.0289 --- <file>`), with the
   always-permitted inline override in the package.

**The boundary test (tier-1 vs tier-2):** *could ANY model in principle
consume this number (Tc, Pc, ω, MW)? → shared intrinsic field.  Does it only
have meaning INSIDE one model's equation (PC-SAFT's segment number m)? → that
model's key in `eosParameters{}`.*

**Glass-box requirement (non-negotiable):** a model with **no** required
`eosParameters.<model>` block on a component **fails with a remedy** ("PCSAFT
needs m,sigma,epsilon_k for 'X'; none in catalogue/case/node; fit them with
choupoProps or pick SRK/PR which run off Tc,Pc,omega") — **never** a silent
corresponding-states fallback.

---

## 5. The glass-box origin line — the anti-black-box stance

**The governing test:** *a student points at any number or any model on
screen and asks "where did THIS come from?" — and the run already answered it,
at the point of use.*

- **No value without a unit comment** (mandated 2026-06-11).
- **No estimated/regressed value without a `provenance{ origin · method }`
  entry** (the live `OriginInfo` struct parses it).  A `.dat` violating either
  is a **curation defect**.
- Reference-state block headers
  (`identity/critical/gasIdeal/liquidPure/solid/aqueousInfDil/anchors/transport`
  + `eosParameters` + the referenced `solution/` pair file) make the file read
  as the γ-φ / EOS equation itself.  **The second species and the model are
  always named in the file**, never implied.

At thermo-build the run prints, per consumed value,
**LEVEL · MODEL · SOLVENT-TIER · ORIGIN · SOURCE**:
```
[thermo] property origins (this run):
  benzene.Tc          = 562.05 K    | level: standard | intrinsic                    | origin: literature [Poling 5th, App. A]
  benzene.eosParam.PCSAFT.epsilon_k | level: case     | model: PCSAFT                | origin: regressed  [Gross&Sadowski 2001]
  sucrose.dHsoln      = 5.40 kJ/mol  | level: standard | pair: sucrose-WATER (DEFAULT)| origin: literature [Putnam&Kilday 1986]
  ethanol-water NRTL                 | level: standard | model: NRTL                  | origin: regressed  [Carey&Lewis 1932]
  hexane-heptane NRTL                | level: (none)   | model: NRTL                  | DEFAULTED TO IDEAL  <- fit or add
```
This is the screen a commercial simulator's property-method dropdown is built to
suppress.

---

## 6. Two worked placements

### Sucrose

| Property | Value / source | Arity / Kind | Home |
|---|---|---|---|
| MW, role, Vliq, `solid{rho_p,k_v}` | 342.297; nonvolatile; 1590 kg/m³; k_v 0.524 | arity-1 intrinsic | `components/sucrose.dat` (kept) |
| crystalline ΔH_f, S° | −2226.1 kJ/mol, 392.4 J/mol·K, **phase solid** | arity-1 intrinsic | `components/sucrose.dat` `standardThermochemistry{}` (kept) |
| ΔH_soln (crystal → aqueous) | +5.40 kJ/mol [Putnam & Kilday 1986] | arity-2 (solute+water) | `solution/sucrose-water.dat`; `sucrose.dat` references by name |
| c_sat(T) solubility (kg/kg water) | existing block | strictly arity-2 SLE | **tolerated legacy** in `sucrose.dat`; comment upgraded "solvent = water, declared" |
| sorption isotherm (this powder) | measured per sample | sample-specific arity-1 | **case** `constant/components/sucrose.dat` overlay (whole `sorption{}` block) |
| crystallisation k_n, k_g; PSD | nucleation/growth rates | KIND = rate / distribution | the crystalliser **unit's** `constant/crystallisation`; PSD is a **stream** attribute |

### A gas with a new EOS

Gas = methane (already carries `{Tc,Pc,ω}`).  New EOS = `pcSaft`, needing
`{m, σ, ε/k}`.
1. SRK/PR on this gas need **no data** — they derive `a_c,b,κ` from the triad.
2. PC-SAFT's `{m,σ,ε/k}` go in a `model`-keyed `eosParameters{ PCSAFT{…} }`
   block (research path: a `constant/components/methane.dat` overlay carrying
   *only* that block; promotion path: the same block in the standard `.dat`,
   primary-cited).
3. k_ij → the `data/standards/parameters/eos/` catalogue (the shipped
   cubic home is `parameters/SRK/<i>-<j>.dat`; a new EOS family adds
   its own keyed folder there) or inline.
4. The run prints `[thermo] EOS = PCSAFT — methane: m,sigma,epsilon/k from
   eosParameters.PCSAFT [Gross&Sadowski 2001] origin: regressed`; a missing
   block fails with a remedy.

---

### One-line doctrine for the ledger

> **Arity decides the home (arity-1 → `components/<name>.dat`; arity-2 → a
> catalogue, water included, with water's ubiquity earning a single canonical
> by-name aqueous tier and a LOUD default-solvent line — never an implied
> slot).  Models ride corresponding states off `critical{}` or carry a
> `model`-keyed `eosParameters{}` sub-block, selected by the explicit factory,
> overridable per node by a BLOCK-by-block fractal overlay.  A component is one
> molecule, whole at every level; equipment physics is a rate or a geometry,
> never a component property.  No second species, no model, and no level is
> ever implicit on disk — the student SEES it on every run, which is the one
> thing a black-box simulator is built to hide.**
