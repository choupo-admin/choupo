<!--
  Choupo — Property-model architecture (DEV reference).
  The standing design contract for the property-model TREE: how it is shaped,
  how provenance flows, what we deliberately reject, and the repeatable recipe
  for grafting a new model so the tree scales without entropy.
  Audience: an LLM or human EDITING the engine (same audience as CLAUDE.md),
  NOT a case author (that is docs/ai/). Gates every property-model PR.
  Consolidated 2026-06-05 from a max-effort review of the property abstraction.

  NAME TWIN (deliberate, 2026-07-16): docs/architecture/property-architecture.md
  is the CONSOLIDATED PROPERTY AUTHORITY (level 2 under the Constitution); THIS
  root file is the level-3 model/curation-doctrine deep reference it folds in.
  Where they disagree, the architecture/ file wins. Authority map:
  docs/architecture/README.md.
-->

# Property-model architecture

## 0. Design stance (the one sentence)

**Property estimation is a RESOLUTION problem solved at CURATION time — not a
calculation problem solved at runtime.** The resolution is a glass-box artefact
on disk (a `.dat` the student reviews and promotes), never a hidden decision
tree firing inside a Newton iteration. This is the fork that separates Choupo
from an Aspen-style backend, and it is non-negotiable.

Corollary: provenance lives at the **data boundary** and the **validation
boundary**. It is NEVER carried through the hot numerical path. A curated value
(`Tc` of benzene) carries "Joback, ±2 %, valid subcritical"; a *model* (Antoine-fit
vs Ambrose-Walton-predicted) carries its origin once per package; a transient
γ inside Rachford-Rice carries nothing — it inherits the model's provenance.

---

## 1. The three layers (the brief fuses 1 and 3 — keep them apart)

```
  Layer 3  CURATION TOOLS (choupoProps)         estimate · fit · validate
           the resolver lives HERE (curation-time), writes Layer 1
                         │ produces provenance-stamped data
                         ▼
  Layer 1  CURATED DATA + per-value provenance  Component + <name>.dat
           every value: { origin, method, source, validity, uncertainty }
                         │ consumed by
                         ▼
  Layer 2  MODEL INTERFACES (explicit factories)  VaporPressureModel,
           ActivityModel, EquationOfState, HeatCapacityModel, Phase,
           ElectrolyteModel(planned) …  ← the flash consumes ONLY these
```

- **Layer 1 — identity & curated data.** A `Component` is its NAME + curated
  values. Molecular groups are an OPTIONAL, EXPLICIT, declared attribute (used by
  Joback estimate + UNIFAC) — never the identity, never parsed from structure.
- **Layer 2 — model interfaces.** Already present and already correct: the flash
  consumes `ThermoPackage` (interfaces), never a concrete model — proven by the
  per-unit `thermo{}` override. Do NOT add a parallel interface taxonomy
  (`IConstantEstimator`/`ITemperatureModel`/…); the existing factories ARE the
  interfaces. A constant-estimator is a Layer-3 tool, not a Layer-2 model.
- **Layer 3 — curation tools.** `estimateComponent` (CREATE + the curation-time
  resolver), `fitParameters` (regress), the validation weapon (AAD vs data).
  The **priority chain** (experimental → user → regressed → predictive(UNIFAC/
  corr.-states) → group-contribution) is the resolver's default ORDER, executed
  here, recorded as Layer-1 provenance.

---

## 2. Provenance — the keystone to build (fissure nº1, done right)

Structured, per-value, written by the curation resolver, read by `Component`,
emitted in the result JSON (the GUI already has the channel). NOT a template
threaded through the solver.

```
provenance
{
    Tc    { origin estimate;    method "Joback (Joback & Reid 1987)";       uncertainty 0.02; validity "subcritical"; }
    omega { origin estimate;    method "Lee-Kesler from (Tb,Tc,Pc)";        uncertainty 0.03; }
    Psat  { origin predictive;  method "Ambrose-Walton corresponding states"; validity "Tr 0.5-1.0; degrades polar/associating"; }
    NRTL  { origin regressed;   method "LM fit vs Carey&Lewis 1932";        uncertainty 0.005; }
}
```

`Origin` enum (the brief's one genuinely-good import):
`experimental | user | regressed | predictive | estimate(GC)`.

Rule: **no silent number, no silent extrapolation.** A value used outside its
`validity` flags loudly; a gap-bearing estimate used where VLE/flash needs it
fails with a remedy-bearing message (already true for the Psat/s_298 gaps).

The foundation is half-built: `estimateComponent`'s promoted `.dat` already
writes a free-text `provenance{}` naming the method per derived quantity. The
work is to make it **structured per-value** (origin + validity + uncertainty),
fold the **validation AAD into it** (and into the Decision Ledger, pinnable),
and carry it to the result JSON.

---

## 3. What we REJECT from the Aspen-style brief (do not relitigate)

| Rejected | Why |
|---|---|
| Structure-first identity (SMILES/InChI/MolecularGraph) + RDKit/SMARTS fragmentation | Declaring groups and SEEING them sum IS the lesson; RDKit hides it. Also a heavy dep (zero-deps is settled). Groups stay declared+optional. |
| `PropertyResult<T>` carried through the flash engine | Wrong scope. Provenance belongs to data + validation, never the hot path. |
| Runtime `PropertyResolver` (resolve at flash-time) | Anti-glass-box. Choupo resolves at curation-time and writes a reviewable `.dat`. |
| Parallel interface set (`IConstantEstimator`/`ITemperatureModel`/`IFugacityModel`) | The existing factories already are the interfaces; estimators are Layer-3 tools. |
| C++20 · CMake · Eigen · PC-SAFT · COSMO-SAC · CAPE-OPEN · open-core commercial GUI | Contradict settled decisions (C++17, Make, zero-deps, GPL + cautious-deps, reputational-not-commercial). |

What the brief gets RIGHT and we ADOPT: the `Origin` enum + per-value
provenance; the priority-chain resolver (at curation-time); validation-first /
AAD% as a public benchmark (the weapon, now folded into the record).

---

## 4. The recipe — grafting a model so the tree scales

Each property KIND is a factory-rooted subtree. Adding a branch is a fixed,
five-step act; if any step is skipped the PR is not done.

1. **Interface** — inherit the property's base (`VaporPressureModel`,
   `ActivityModel`, `EquationOfState`, `HeatCapacityModel`, `ElectrolyteModel`,
   …). If the property has no base yet, create one (explicit factory:
   `registerType` / `New` / `registerBuiltins`, registered in `main.cpp`).
2. **Data** — pure-compound → `data/standards/components/`; pair/triplet →
   `data/standards/<feature>/` (axiom 2); cited in the file header,
   license-clean. The catalogue is FROZEN (write-guard); new data is a curation
   act, never an engine write.
3. **Provenance** — the model declares its `Origin`; values it consumes carry
   theirs. A predictive/corresponding-states model states its validity range.
4. **Validation case** — a `props/compare/...` case overlaying the model on
   MEASURED data, scored by the AAD weapon. **No model is "done" without an AAD
   vs reference within published tolerance** (validation-first gate). Cite the
   data source; provenance of new measured/parameter data is Vítor's to confirm.
5. **Docs + regression** — `docs/ai/` catalogue entry (case-author audience);
   `bin/runTests` green; rebuild WASM if the GUI needs the model.

Glass-box check before merge: can a student SEE every term? (Joback groups
summing; UNIFAC combinatorial vs residual; Pitzer's Debye-Hückel + virial terms;
the AAD vs data.) If a number appears without a visible origin, the branch is
wrong.

---

## 5. The tree today (and where it grows)

```
VaporPressureModel   ── Antoine(data) · AmbroseWalton(predictive)
ActivityModel        ── ideal · NRTL · Wilson · UNIFAC(predictive)   [→ electrolyte: see §6]
EquationOfState      ── idealGas · SRK · PR
HeatCapacityModel    ── polynomial …
Phase / Henry / transport(viscosity·diffusivity·conductivity) / membrane
Curation (Layer 3)   ── estimateComponent(Joback+LeeKesler+AmbroseWalton+Rackett)
                        · fitParameters(LM,promote,identifiability) · vleConsistency
                        · validation weapon (AAD)
```

Known debts to clear as the tree grows (ranked):
1. **Per-value provenance + `Origin`** (§2) — the keystone; prerequisite for
   electrolytes.
2. **Retire `FitBinaryPair`** → migrate `fitNRTL01` to `fitParameters` (the
   canonical engine; duality is live).
3. **Validation into the Decision Ledger** + pinnable.

---

## 6. Worked example — electrolytes (the next branch, the recipe applied)

Pareto: aqueous strong electrolytes, single + MIXED salts, via **Pitzer**
(the brine/NF-RO domain). Defer eNRTL (mixed solvent), weak-electrolyte
speciation, electrolyte EoS.

- **Lift, don't greenfield.** A functional single-1:1-salt Pitzer osmotic
  coefficient already exists, but buried under `unitOperations/membrane/osmotic/`
  with a too-thin interface (`{c, nu, T}` — no ion charges, no mixture ionic
  strength, no curated params; φ only, no γ±; `I≈m≈c` conflates molarity/molality).
- **Branch:** new `ElectrolyteModel` base under `src/thermo/electrolyte/`
  (Pitzer + a DebyeHuckel limiting-law baseline). Given ion molalities + T →
  `I = ½ Σ mᵢzᵢ²`, osmotic coefficient φ, mean activity γ±, individual ion γᵢ
  (for Donnan).
- **Data (§4.2):** `data/standards/parameters/electrolyte/pitzer/` — per
  cation-anion pair β⁰,β¹,(β²),Cφ (`pairs/`); like-charge θ; triplet ψ
  (`mixing/`). THIS is the mixed-salt enabler. Cited (USGS PHREEQC pitzer.dat,
  public domain; Pitzer 1991 / Robinson & Stokes lineage); shipped and running.
- **Membrane delegates** to the thermo `ElectrolyteModel` (single source of
  truth) → real Δπ for mixed brines.
- **Validation (§4.4):** scan γ±(m) 0→6 m, overlay Pitzer vs Debye-Hückel-limit
  vs ideal(van't Hoff) vs Robinson-Stokes data; AAD weapon scores it. The lesson:
  φ < 1 for seawater is why van't Hoff over-estimates Δπ.
- **Provenance pays off here most:** ion-activity validity ranges (Pitzer to
  I~6 m per pair) are exactly what the per-value provenance (§2) must carry.
