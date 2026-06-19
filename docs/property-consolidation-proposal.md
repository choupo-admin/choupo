# Component Identity, Estimation & Transport — Consolidation Proposal

**Forum chair consolidation · 2026-06-06 · for Vítor's GO/NO-GO**
Scope: how a component is identified, activated, estimated, and how transport
properties fit the property architecture. Built strictly **ON** the SETTLED
2026-06-05 contract (`docs/property-architecture.md`). No code written until
approved. *(Working proposal — not the settled contract; fold in on GO.)*

Produced by a 15-expert forum (5 thermodynamics/transport professors, 5
petroleum thermophysical-data directors, 5 simulator R&D directors), grounded
on 6 ground-truth code/data readers and an adversarial 3-lens cross-examination
of every decision. 62 agents total.

---

## 1. THE ONE MENTAL MODEL

A **component** in Choupo is a single glass-box `.dat` file named after the
compound: the **filename is its identity**, the `CAS` field inside is its
citation, and each property sits in **its own visible slot** carrying both a
number and (in one consolidated `provenance` block) where that number came
from — measured, fitted, predicted, or group-estimated. You don't get an
auto-selected method: for each property family you **SEE the model forms on
offer and pick one** (Psat: Antoine vs Ambrose-Walton; γ: NRTL/Wilson/UNIFAC/
ideal; EOS: SRK/PR; viscosity: Andrade vs Vogel), where the EOS drives only
`Z / v_molar / H_res / S_res`, activity models drive γ, and transport
correlations stand alone — a sibling of the EOS, never a child.

**The sentence a student holds:**
> *A component is one glass-box `.dat` named after the compound — the filename
> is its identity; inside, every property sits in its own visible slot, stamped
> with where its value came from and which model produces it.*

**The four orthogonal axes** (recite, don't cram):
- **IDENTITY** — the filename is the compound the student types in
  `components ( ... )`; `CAS` is the citation/audit key, not the lookup key.
- **DATA** — the `.dat` itself, placed by the four location axioms.
- **ORIGIN** — every value stamped: *measured · user-entered · fitted ·
  predicted (corresponding-states/UNIFAC) · group-estimated*.
- **METHOD** — each property family keeps its own explicit model factory; you
  pick because you SAW it. EOS → `Z/v/H_res/S_res`; activity → γ; transport
  stands alone.

---

## 2. Q1 — IDENTITY: name, CAS, the two-names bug

### The scheme
- **Canonical key = the `.dat` filename stem**, which MUST equal the in-file
  `name` field. This is the *one identity the student types*.
- **`formula` and `CAS` are metadata** for human cross-reference and search,
  **never lookup keys**. Formula is provably non-unique (`C2H6O` = ethanol *and*
  dimethyl ether), so it can never be a key.
- **No alias/synonym table.** That is precisely the Aspen "is it IPA /
  isopropanol / propan-2-ol / 67-63-0" bagunça we reject. For 59 components it
  earns nothing.

### Why the "two names" symptom happens, and how it dies
Investigation found the symptom is **not** in resolution code (resolution is
pure filename-stem; verified `Database.cpp:118`). It is two real things:

1. **Presentation** — the GUI catalogue can render `name` and `formula` as two
   equal-weight tokens. **Fix:** render exactly ONE primary label (`name`);
   demote `formula · CAS` to a single quiet dimmed secondary line. Keep
   `formulaIfDistinct()`'s suppression of redundant formulae (He/He, N2/N2).

2. **Real data bug — duplicate-CAS twins (CONFIRMED).** `C3H8.dat` +
   `propane.dat` both carry CAS `74-98-6`; `NH3.dat` + `ammonia.dat` both carry
   CAS `7664-41-7`, with **divergent constants** (the genuine defect — same
   molecule, different numbers).

### Concrete `.dat` field design + guards
The schema needs **no new identity fields** — `name`, `formula`, `CAS` already
exist. We add **guards**, not data:

- **Load-time guard (`Database::loadComponent`), ONE uniform rule** — replace
  the silent filename fallback. If `name` is present and ≠ filename stem → loud
  `[identity]` warning, keep the filename stem as canonical (it is already the
  resolution key everywhere). If `name` absent → insert the stem + emit
  `[identity] component 'X': name inferred from filename`. *(warn-and-use-key,
  not hard-throw — a throw would change behaviour on the FROZEN catalogue, and
  the no-silent-crutch credo mandates "announce", not "abort".)*
- **Build-time / regression guard** (`bin/runTests`, a curation check — NOT the
  hot path): (1) `name` == filename stem; (2) stems unique; (3) **duplicate-CAS
  audit** — any real CAS (excluding sentinels `00-00-0`/`n/a`) in >1 file is a
  hard error. This is CAS's one legitimate role: a de-dup audit gate, never a
  lookup key.

---

## 3. Q2 — ACTIVATION

**Activation is ONE act in every case:** the student writes the name into
`components ( ... );` in `constant/thermoPackage`. No GUI checkbox, no
auto-registry, no hidden setup. The Property Explorer catalogue is
**search/preview only — it never activates a component** (honours the
GUI-runner-not-editor credo).

**(a) Fully-curated compound:** write the name → loader resolves
`constant/components/<name>.dat` (case-local overlay) then
`data/standards/components/<name>.dat` → clean load. Overlays announced loud
(`[overlay]`, `[backfill]`).

**(b) No-data compound:** the load **FAILS LOUDLY** — never a silent ideal/
blank/stub. We make the throw **remedy-bearing** and *constructible*:

```
Database: component 'pentadiene' not found.
  looked in: (no case-local constant/components/pentadiene.dat)
         and: <CHOUPO_HOME>/data/standards/components/pentadiene.dat
  remedy: if it genuinely doesn't exist, create a case-local proposal —
      add an estimateComponent operation to your propsDict
        (component pentadiene; groups ( ... );  // Joback groups, see docs/ai/components.md)
      run: choupoProps <caseDir>
      REVIEW the generated constant/components/pentadiene.estimate-<date>.dat,
      fill the gaps, then mv it to constant/components/pentadiene.dat
  if you expected it to exist: check spelling/casing — lookup is by exact
      <name>.dat (CAS/aliases are NOT resolved).
```

*(Correction from cross-examination: `estimateComponent` is a propsDict
OPERATION run as `choupoProps <caseDir>` needing a Joback `groups ( ... )`
block — NOT a bare `choupoProps estimateComponent <name>` CLI verb.)*

---

## 4. Q3 — GROUP-ESTIMATED COMPONENTS

**Decision: a fully group-estimated species is NOT a separate entity, class,
mode, flag, or naming namespace.** It is an **ordinary component `.dat` whose
values all carry `origin = estimate/predictive`** — produced by
`choupoProps estimateComponent` (Joback + Ambrose-Walton Psat + Rackett Vliq).
Estimate-ness is a property of **values** (via provenance), never of identity.
No `EstimatedComponent` class, no `isEstimated` boolean, no permanent `_est`
suffix — any of those would fork identity and re-create the two-names problem.

**Honesty enforced by four existing LOUD mechanisms (kept):**
1. the `.estimate-<date>.dat` proposal filename (REVIEW marker, dropped on
   promotion — `EstimateComponent.cpp:238`);
2. per-value provenance naming the method;
3. the `[estimate]` load announcement (`Database.cpp`);
4. **HALT-with-remedy** when a gap is consumed where flash/VLE needs it.

**Promotion** (rename `.estimate-<date>.dat` → `<name>.dat`) is the student's
deliberate act of ownership.

**Two factual corrections folded in:**
- **UNIFAC groups do NOT live in the component `.dat`.** They are declared
  per-component in the case `thermoPackage` `activityModel.groups` block
  (`UNIFAC.cpp:67`) — a mixture-level concern (axiom 2). The estimator writes
  estimated **constants** into the `.dat`; the group breakdown for predictive γ
  is a separate, deliberate second step.
- **Joback group vocabulary ≠ UNIFAC subgroup vocabulary** (Joback
  `arCH/ketone/ester` vs UNIFAC `ACH/CH3CO/CH2COO`). Not interchangeable; the
  estimate proposal should emit a commented-out TODO template for the UNIFAC
  group block so the student sees it is a second step, never auto-bridged.

**Transport on a pure estimate:** Chung gas viscosity / Eucken gas λ come for
free (read Tc/Pc/ω/MW/Cp). Liquid viscosity (Andrade/Vogel A,B) is left ABSENT
and refused with a remedy — never faked from groups.

---

## 5. Q4 — ONE COMPONENT, REAL + ESTIMATED MIXED

**This is the NORMAL case, not an exception** — and it already works two ways:
- **Within one file:** one `.dat` carries some measured, some fitted, some
  estimated values.
- **Across files (runtime overlay):** case-local
  `constant/components/<name>.dat` overlays standard field-by-field, with loud
  `[overlay]` / `[backfill]` / `[estimate]` logs (`Database.cpp:122-169`).

**Organization (settled):** ONE `.dat`, one value per property on its data
line, a **SINGLE consolidated `provenance` block** keyed by property name (or
by a named group of related constants). NEVER inline per-value comment soup as
the canonical store, NEVER a separate side-file, NEVER `PropertyResult<T>` on
the solver hot path.

**Finish the keystone (the half-built foundation).** Promote the free-text
`provenance{}` block to **STRUCTURED per-value records**:

```
provenance {
    Tc      { origin experimental; method "Poling App.A"; validity (250 560) [K]; uncertainty 0.5 [K]; }
    omega   { origin predictive;   method "Lee-Kesler from (Tb,Tc,Pc)"; }
    Psat    { origin predictive;   method "Ambrose-Walton"; validity (273 373) [K]; }
    muLiq   { origin regressed;    method "Andrade fit to NIST mu(T)"; validity (273 373) [K]; uncertainty "2% AAD"; }
}
```

- **Formalize the `Origin` enum:** `experimental | user | regressed |
  predictive | estimate(GC)` — all FIVE (do not collapse `predictive` into
  `estimate`; corresponding-states Psat is predictive but NOT group
  contribution).
- **Emit provenance to the result JSON** via a new sibling channel in
  `ResultEmitter` modeled on the existing `thermoResolution` block. Load/store
  at the Component **data-load boundary only** — never thread a templated
  carrier into value accessors or any flash/Newton path.
- **GUI chip:** one compact origin chip per property row, the **text label
  always naming the origin verbatim** (exp / user / reg / pred / GC),
  method+validity+uncertainty on hover. Colour is a trust gradient
  (green=experimental → teal=regressed → blue=user → amber=predictive →
  orange=estimate), plus a distinct grey "unattributed" state.
- **Roll out honestly:** ship enum + schema + parser + JSON + grey chip FIRST,
  with the 3 already-annotated files (`ammonia`, `acetone`, `propane`) migrated
  as worked examples. **Do NOT mass-backfill** the other 56 files' origins —
  inventing sources is false provenance. The chip truthfully shows "3
  attributed, 56 unattributed" until curated.

---

## 6. Q5 — VISCOSITY / TRANSPORT: kill the EOS coupling

### The bug (CONFIRMED in source)
`gui/src/ui/ExploreWorkspace.tsx`: line 74 lumps `viscosity_liquid` +
`thermal_conductivity_liquid` (and `Cp_ig`!) into `MIXTURE_PROPS`; line 336
gates the EOS picker on `scanMode === "mixture"`; line 90 carries a **false
comment** `transport → EoS`; line 231 always writes
`equationOfState: { model: eos }` into the spec. **The engine never couples
transport to the EOS** — `PropertyEvaluator.cpp:110-113` shows only
`Z / v_molar / H_R / S_R` call `thermo.eos()`; viscosity/conductivity/
diffusivity take only `(T, x)`. The EOS picker on a transport scan is **a
control that does not change the answer** — the exact Aspen lie Choupo refutes.
**The fix is GUI-only; the engine is already correct.**

### The fix (GUI-only)
1. **Gate by a POSITIVE allowlist, not by subtraction:**
   ```ts
   const EOS_PROPS = ["Z", "v_molar", "H_real", "S_real"];   // props that call eos()
   const showEos = isVle || plotType === "ternary"
                 || (plotType === "scan" && EOS_PROPS.includes(property));
   ```
   This also correctly stops showing the EOS picker for `Cp_ig`.
2. **New `TRANSPORT_PROPS` category** covering liquid AND gas transport.
3. **Render a TRANSPORT-MODEL picker** (never an EOS picker) bound to the real
   factory registries: liquid viscosity Andrade(default)/Vogel; liquid
   conductivity SatoRiedel(default)/Latini — a control that **moves the curve**.
4. **Delete the false line-90 comment**; add a `TRANSPORT_PROPS` branch to
   `theoryAnchor` pointing at a transport chapter, not `ch:fugacity`.
5. **Mirror the gate in the request builder** — omit the `equationOfState`
   block (line 231) when no scanned property consumes the EOS.
6. **Dependency hint** (no silent crutch): liquid diffusivity/conductivity pull
   solvent `liquidViscosity` (`ThermoPackage.cpp:533`); surface a one-line
   "needs liquidViscosity" hint in the picker.

### Correct model families (all already in `src/thermo/transport/`)
- **Liquid viscosity** = Andrade `ln μ = A + B/T`, Vogel `ln μ = A + B/(T−C)`,
  mixed by Grunberg-Nissan.
- **Gas viscosity** = Chung corresponding-states (Tc/Pc/ω/MW), mixed by Wilke.
- **Liquid thermal conductivity** = Sato-Riedel (+ Latini).
- **Gas thermal conductivity** = Eucken (`λ = (Cp_ig + 5R/4)·μ/M`, from gas μ).
- **Gas diffusivity** = Fuller. **Liquid diffusivity** = Wilke-Chang (+ Scheibel).

The genuine model CHOICE is **within a family** (Andrade vs Vogel), never
across to the EOS. **Files to change:** `gui/src/ui/ExploreWorkspace.tsx` only.
**No engine change.**

---

## 7. Q6 — DATA & SCHEMA for transport

### Where it lives (settled, already implemented)
- **DATA** = the component `.dat` (axiom 1): existing blocks
  `liquidViscosity { andrade {A; B;} vogel {A; B; C;} }`, `associationFactor`
  (Wilke-Chang φ), `diffusionVolume` (Fuller). Add `liquidConductivity {}`
  only later, only where a fit is needed.
- **MODEL SELECTION** = the `thermoPackage` `transport {}` block — a **SIBLING**
  of `equationOfState{}`, never a child, never inside the component file.
- Chung/Eucken need **no new fields**. No new schema, no separate transport
  data file.

### SHIP-LIST — close the liquid-viscosity gap (only 5/59 populated today)
Ship Andrade `{A,B}` (Vogel where μ(T) spans wide): **AMMONIA FIRST**
(flagship — Rankine/absorption-cooling, currently missing), then **acetone →
nHexane → nButanol → propane → aceticAcid → ethylAcetate → isopropanol**, plus
`associationFactor` for all alcohols. Atoms/radicals/salts stay absent by
design (a transport plot HALTS loudly rather than fabricating).

**Mandatory curation discipline per value (blocking):**
1. **Convention normalisation** — convert every sourced set into the engine's
   exact form `ln(μ/Pa·s) = A + B/T` (or `A + B/(T−C)`, C in K). Record the
   original form + algebraic conversion as an inline comment (a log10/cP slip
   passes the NaN guard silently). Cross-check one point: μ_water(25°C)=0.890
   mPa·s, μ_ammonia(liq,−33.3°C)≈0.255 mPa·s, μ_acetone(25°C)=0.306 mPa·s.
2. **CAS-pinned isomer** — nButanol = 1-butanol (71-36-3), isopropanol =
   propan-2-ol (67-63-0), nHexane = pure 110-54-3, etc.
3. **Validity `Trange`** in the block.
4. **AAD validation case** — every fluid ships
   `tutorials/props/compare/compare_visc_liquid_<fluid>` with a small cited
   measured μ(T) table reporting AAD%. Citations from public correlation FORMS
   (Poling/Reid/Prausnitz App. A/B, NIST, DIPPR forms) — licence-clean, never
   copyrighted table dumps.

---

## 8. Q7 — INFORMATION ARCHITECTURE: what makes it NOT Aspen

| Axis | Choupo | Aspen failure it kills |
|---|---|---|
| IDENTITY | the filename you type | name/synonym/CAS disambiguation zoo |
| DATA | one `.dat`, four axioms | scattered databanks + opaque method sets |
| ORIGIN | per-value chip, visible | "where did this number come from?" — unanswerable |
| METHOD | one explicit factory per family, you pick because you SAW | property-method matrix + recommended-badge |

**Anti-Aspen guarantees:** no property-method matrix, no databank zoo, no alias
soup, no recommended-badge, no hidden coupling, **no EOS-knob-on-transport**.
Every control either changes the answer or doesn't exist. Estimation is
resolved at curation time into a glass-box `.dat` you review and promote — never
a runtime decision tree firing inside Newton.

---

## 9. AMENDMENTS TO THE SETTLED CONTRACT

**None.** Every decision here EXECUTES the SETTLED 2026-06-05 contract rather
than amending it:
- Q4's structured per-value provenance + `Origin` enum + result-JSON emission
  **is** the contract's named keystone debt #1 (finishing, not changing).
- Q5/Q6 transport uses the existing model-factory plane — no parallel `I*`
  taxonomy, no `PropertyResult<T>`, no runtime resolver.
- Q1's CAS-as-audit-only, Q3's value-not-identity estimate-ness, and the four
  data axioms are all within the contract.

One **clarification** (not an amendment): the contract's "keyed by property
name" should read "keyed by property name (or a named group of related
constants)" so the written rule matches the shipping files (e.g. `acetone.dat`
groups `MW/Tc/Pc/omega` under `constants`).

---

## 10. PARETO BUILD PLAN (20% effort → 80% value)

| # | Step | Files | What the student SEES | Effort |
|---|---|---|---|---|
| **1 ⭐ EARLY WIN** | **Kill the viscosity-EOS coupling** | `gui/.../ExploreWorkspace.tsx` (74, 90, 130/231, 336, theoryAnchor + transport picker) | Dead EOS knob vanishes from transport scans; a real Andrade/Vogel picker that *moves the curve*; gas+liquid family fully exposed | XS — GUI only |
| **2 ⭐ EARLY WIN** | **Ship ammonia liquid viscosity + AAD case** (then ship-list) | `data/standards/components/ammonia.dat` (+ others); new `tutorials/props/compare/compare_visc_liquid_<fluid>`; backfill water as template | Rankine/absorption cases finally evaluate μ_liq; AAD% vs measured printed aloud | S per fluid |
| **3** | **Identity guards + duplicate-CAS audit** | `src/thermo/Database.cpp` (loud `[identity]`); `catalogue.ts` + `bin/runTests` (name==stem, unique stems, dup-CAS hard error) | A curator typo or twin becomes a loud error | S |
| **4** | **Resolve the two CAS twins** (curation act, your go) | Keep `NH3.dat` (wired into 2 tutorials + `NH3-water.dat` Henry pair + `role solute;`), fold `ammonia.dat`'s extras in, set `name ammonia;`, delete `ammonia.dat`; keep `propane.dat`, delete `C3H8.dat` after grep | One molecule, one file, one set of numbers | S |
| **5** | **Remedy-bearing missing-component error** | `src/thermo/Database.cpp` (~118) | Dead-end "not found" → copy-pasteable recipe | XS |
| **6** | **Presentation: one primary label** | `catalogue.ts` + compound browser | `name` primary, `formula · CAS` quiet secondary — displayed two-names gone | XS |
| **7 KEYSTONE** | **Structured per-value provenance + `Origin` enum + result-JSON + GUI chip** | new `Origin` enum, `Component` load-boundary parse, `ResultEmitter` sibling channel, migrate 3 annotated `.dat`, GUI chip + grey state | Origin chip per property row — "See, then decide" embodied; 3 attributed / 56 honestly unattributed | M — do NOT mass-backfill |
| **8** | **Escalate silent UNIFAC ideality** | `UNIFAC.cpp` → route missing-groups-in-a-mixture through `AdvisoryLog` (mirror NRTL/Wilson); pure scan stays a note | γ=1-because-missing surfaces as a structured GUI warning | S |

**Build by trial-and-error:** steps 1 and 2 are the smallest visible slices —
ship them, see them, iterate. `bin/runTests` after any engine/data step;
`make wasm-gui` after engine changes the GUI consumes.

*Recommended first move: GO on steps 1 + 2 (pure early wins — GUI-only fix +
ammonia data) to validate the direction before the keystone (step 7).*

---

## 11. Forum validation — compound generation, "one engine, two surfaces" (2026-06-06)

A 21-agent forum (12 experts incl. 4 solver architects + a 4-attack red-team)
validated the decision to do compound generation by estimation on BOTH the
Explorer and choupoProps. **Verdict: GO-WITH-AMENDMENTS** — 12/12 endorse,
**0/12 "breaks the solver", 0/4 red-team attacks land.**

**Does it break the solver development sequence? NO** (verified in code, not
asserted): estimation lives entirely in **Layer 3** (`EstimateComponent.cpp`, a
curation-time `PropertyOperation`); the simulator core (`solver`,
`unitOperations`, `flowsheet`, `streams`) has **zero references** to it. Every
planned change is at the **data boundary** (`Component::readFromDict`, the `.dat`
grammar) or the **emission boundary** (`ResultEmitter`) — outside the numerical
loop.

**THE ONE RULE that keeps the engine safe:** *provenance and estimators live at
the data + validation boundary ONLY — never threaded through the solver as a
`PropertyResult<T>`, never a runtime resolver, never a per-unit runtime estimate*
(already a settled 2026-06-05 rejection — hold it).

**Honest correction to this proposal:** the four qualities are **two foundation
grafts + two wiring gaps**, not "mostly wiring":
- *auditable* = FOUNDATION (the keystone: `Origin` enum + provenance parse + JSON);
- *flexible* = FOUNDATION (there is exactly ONE estimator today — Joback is
  hardcoded in an anonymous namespace; needs a Layer-3 `ConstantEstimator`
  factory plane). **Do not budget "flexible" as trailing wiring.**
- *intuitive* = WIRING (the friction fix);
- *validatable* = WIRING on the Explorer side (`exploreSynth` must emit
  `experimental{}`; the engine `AadCompare`/`validation[]` already exists).

**Required amendments:**
1. **Kill the word "promote" in the GUI sense.** The Explorer act is: **DOWNLOAD
   a dated `constant/components/<name>.estimate-DATE.dat` proposal via
   user-initiated Save-As**; the GUI never writes `<name>.dat` in place and never
   persists silently. *Promotion = the student's `mv`/rename on disk.* Codify as
   `gui-credo.md` guard-rail 6.
2. **Provenance parser = parse-if-present, NEVER hard-throw** (56/59 files have no
   structured provenance → grey "unattributed" chip; mirror the identity guard).
3. **Keep the NaN/inf guard inert** — emit provenance via `esc()` (quoted) +
   `num()` (non-finite→null), like `thermoResolution`.
4. **Pin the shared estimation path FIRST** — golden-master `expected` for the 3
   `estimate_*` tutorials + ONE native↔WASM parity assertion (today none exist;
   the one real red-team hit).
5. **A new estimation method = a registered `ConstantEstimator` sub-model**, never
   a second op or an inline `if`/branch.
6. **No fake backfill** — the grey "unattributed" chip IS the honest state.

**Ratified dependency-safe build sequence** (runTests 134-green after every step;
smallest safe first move = step i):
- **(i)** friction fix + pin the physics (golden masters + native↔WASM parity);
- **(ii)** FLEXIBLE FOUNDATION — extract Joback into a registered
  `ConstantEstimator` base + `model` slot, behaviour-identical
  (**before** the keystone, so provenance can record *which* estimator);
- **(iii)** KEYSTONE as ONE atomic schema commit — `Origin` enum +
  parse-and-preserve provenance + result-JSON + fold in `AadCompare` (auditable
  and validatable become ONE record);
- **(iv)** Explorer G1/G2/G3 + `experimental{}` measured-data overlay (TS only);
- **(v)** multi-method comparison UI (TS only).

**The sentence to ratify (refined by the forum):**
> *"Generating a component by estimation is the one authoring act the Property
> Explorer may do, because it is see-then-decide: the engine does all the physics
> (zero TS), the result is a reviewable case-local `.estimate-DATE.dat` proposal
> the student DOWNLOADS via Save-As and promotes by hand on disk, and
> `data/standards/` stays frozen — the GUI never writes a `<name>.dat` in place
> and never persists silently."*
