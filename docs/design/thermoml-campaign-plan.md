# ThermoML campaign — Pareto execution plan to 31 August

**Status: PLAN.  Not started.**  Supersedes the scope limit in
`evidence-partition-slice-plan.md` §8 ("nothing beyond… is after the release"):
the ThermoML pipeline is now **in** the pre-September target.

---

## 0. The finding that shortens the path

**The calculation half of "PhaseQ" is already built.**  `choupoProps` registers
**28 operations**, and the ones this campaign needs already exist:

| Need | Already exists |
|---|---|
| binary parameter regression | `fitParameters` — Levenberg-Marquardt, bounded params by dotted path, χ², confidence intervals, pivot-ratio identifiability, `fit_history.csv`, `parity.csv` |
| VLE data-quality screening | `vleConsistency` — whose own header says *"test the DATA, not just fit a model"* |
| pure-property correlation fits | `vaporPressureFit` (Antoine), `heatCapacityFit` (polynomial) |
| filling gaps by estimation | `estimateComponent` — Joback + Lee-Kesler, glass-box build-up, `[estimate]` announced |
| enthalpy consistency | `hConsistency` |
| activity / binary visualisation | `activityCoefficients`, `propertyScanBinary`, `gibbsMap` |
| dataset intake from file | `dataset "constant/experiments/<name>.dat"` — used by 5 ops today |
| provenance + review + advisories | typed `origin`, `reviewStatus`, `promotedDespite`, `AdvisoryLog` |

**So the shortest path is not "build a PhaseQ". It is: supply ThermoML evidence
to machinery that already computes, and put the evidence contract around it.**

Two things are genuinely missing, and only two:

1. **Supply** — ThermoML archive → local cache → index → `experimentalDataset`.
2. **Contract** — pre-declared FIT/HELD-OUT partition, dossier, human promotion.

Everything else is wiring.

---

## 1. Slices, ordered by dependency

Notation: **⟂** = can be built in parallel with the previous slice (no shared
files).

### S0 — Archive reconnaissance  ⟵ *unblocks S3, S4, S7; do first*

| | |
|---|---|
| **Capability** | One real ThermoML file on disk, plus the archive's true size, download URL, checksum availability and licence text. |
| **Files** | none (a report + one sample file into `thirdParty/thermoml/`) |
| **Witness** | the sample parses with a stock XML reader; its property names are transcribed into the design note |
| **Refusal witness** | — |
| **Gate** | — |
| **Depends on** | network access to NIST (blocked in this session; **runs on Vítor's machine or an unproxied environment**) |
| **Out of scope** | any parsing code |

**This is the true critical path.**  Writing a ThermoML parser without a
specimen is guesswork, and guesswork here is expensive because the schema is an
IUPAC standard with deep nesting.  Everything downstream of S4 waits on this,
and it is a one-hour job with a working network.

---

### S1 — The evidence/partition contract  ⟂ *(independent of ThermoML)*

| | |
|---|---|
| **Capability** | `evidence ( { dataset …; identity { doi; sha256 }; role fit\|validation; } … )`, parsed once, frozen before any fit runs; the fitter receives **only** the fit subset |
| **Files** | `src/propertyOps/EvidencePartition.{H,cpp}` (new); `VaporPressureFit.cpp`, `HeatCapacityFit.cpp` consume it |
| **Witness** | water: vapour pressure fitted on set A, validated on held-out set B → **VALIDATED** |
| **Refusal witness** | water: liquid Cp with all evidence consumed → **`VALIDATION REFUSED: No independent experimental evidence remains after fitting.`** with χ² labelled in-sample |
| **Gate** | `check_evidence_partition` — partition honoured (validation points provably absent from the fitted residuals, checked by value); R1 missing-validation; R2 missing `role`; R3 identity collision across roles; R4 empty validation set after domain filtering; R5 `role validation` where no fit ran |
| **Depends on** | nothing |
| **Out of scope** | ThermoML, dossier, promotion, binary systems |

`role` has **no default** — a defaulted role silently makes everything a fitting
dataset and re-creates the in-sample problem invisibly.

---

### S2 — Curation dossier + human promotion

| | |
|---|---|
| **Capability** | `<case>/curation/<component>.dossier` written; `bin/curate/promote-from-dossier` moves an approved property into `data/standards/` |
| **Files** | `src/propertyOps/CurationDossier.{H,cpp}` (new); `bin/curate/promote-from-dossier` (new) |
| **Witness** | the S1 witness emits a dossier carrying identities, partition + its fingerprint, in-sample and held-out residuals **separately labelled**, refusals, `reviewStatus unreviewed` |
| **Refusal witness** | promoting a REFUSED or in-sample-only property is refused by name; promoting without promoter/date/grounds is refused |
| **Gate** | `check_curation_dossier` — includes the negative: a `choupoSolve` run of a case carrying `curation/` resolves **nothing** from it |
| **Depends on** | S1 |
| **Out of scope** | machine-readable external-vs-sealed evidence availability |

The dossier home is `<case>/curation/` because record resolution looks only in
`<case>/constant/<sub>`, `data/standards/`, `data/local/` — so "invisible to the
solver" is a fact about the code, not a promise.

---

### S3 — `thermoml sync` + local index  ⟂ *(Python; independent of S1/S2)*

| | |
|---|---|
| **Capability** | `bin/choupo-thermoml sync` downloads the official NIST bulk archive → `thirdParty/thermoml/` (already gitignored by `thirdParty/*`), records integrity, builds `index.json`; `--update` is explicit, never silent |
| **Files** | `bin/choupo-thermoml` (new) |
| **Witness** | second run is offline and instant; index round-trips |
| **Refusal witness** | corrupted/partial download refuses rather than indexing; a stale index against a changed cache refuses |
| **Gate** | `check_thermoml_index` — index rebuilds identically from the cache; **skips with UNAVAILABLE (never PASS) when no cache is present** |
| **Depends on** | S0 |
| **Out of scope** | parsing property values (that is S4) |

**Integrity, stated honestly.**  If NIST publishes a checksum → verify against
it and record `integrity verified`.  If not → hash what was downloaded and
record `integrity recorded`, meaning *a record of what was obtained*, not a
verification against the source.  Never print "verified" without verifying.

`CHOUPO_THERMOML_HOME` overrides the cache location — a class of 30 students
must be able to share one copy.

**No network code in C++.**  `choupoProps` compiles to WebAssembly and runs in
the browser; a binary that opens HTTPS is impossible on that target and would
require a new dependency. The sync is a curation tool; the engine only ever
reads the cache.

---

### S4 — ThermoML → `experimentalDataset` (pure-component properties)

| | |
|---|---|
| **Capability** | a ThermoML file becomes one or more datasets Choupo's existing ops can read, carrying DOI, T/P domain, n points, reported uncertainty |
| **Files** | `bin/choupo-thermoml` (extract subcommand); dataset writer in the `constant/experiments/` grammar |
| **Witness** | vapour pressure, liquid density and Cp extracted from a real archive file with DOI and uncertainty preserved |
| **Refusal witness** | an unsupported property type is **named and skipped loudly**, never silently dropped |
| **Gate** | `check_thermoml_extract` — round-trip on a committed **minimal synthetic** ThermoML fixture (so the gate runs with no archive present) |
| **Depends on** | S0, S3 |
| **Out of scope** | phase-equilibrium types (S7) |

---

### S5 — `choupoProps search`

| | |
|---|---|
| **Capability** | search by name, CAS, InChI, InChIKey; report property, chemical system, T, P, composition, n points, DOI, uncertainty |
| **Files** | `src/propertyOps/ThermoMLSearch.{H,cpp}` (new, reads the index only) |
| **Witness** | `choupoProps search acetophenone` lists datasets with their DOIs |
| **Refusal witness** | unknown identifier refuses naming the four searchable key kinds; missing index refuses telling the user to `sync` |
| **Gate** | `check_thermoml_search` on the fixture index |
| **Depends on** | S3 |
| **Out of scope** | ranking, relevance heuristics |

---

### S6 — `curateComponent` (pure component, end to end)  ⟵ **the September minimum**

| | |
|---|---|
| **Capability** | identity → evidence → declared partition → fit → held-out validation → estimated gaps → refusals → dossier |
| **Files** | `src/propertyOps/CurateComponent.{H,cpp}` (new) — an orchestrator over S1/S2/S4/S5 and `estimateComponent`; **no new physics** |
| **Witness** | a component absent from `data/standards/`, curated from archive evidence, ending in a dossier |
| **Refusal witness** | a property with no held-out evidence → `VALIDATION REFUSED`; a property with no evidence at all → **MISSING**, refusing at point of use and naming the curation act, never silently estimated |
| **Gate** | `check_curate_component` — the four statuses (measured / fitted / validated / estimated) are **separately labelled and never merged** |
| **Depends on** | S1, S2, S4, S5 |
| **Out of scope** | binary systems |

**Partition rule.**  A student cannot hand-pick DOIs for 30 components, so an
automatic rule is allowed — but it must be **declared and deterministic**
(`partition { rule byDoiOrder; nFit 2; }`), recorded in the dossier, and it may
**never be re-run after residuals are seen**.  Automatic-and-declared is not
tuning; re-partitioning after a bad result is.

---

### S7 — Phase-equilibrium datasets (VLE / LLE / SLE)

| | |
|---|---|
| **Capability** | ingest binary VLE, LLE and SLE/freezing datasets into the same `experimentalDataset` form |
| **Files** | `bin/choupo-thermoml` (extract, extended) |
| **Witness** | a binary VLE dataset extracted with its T, P, x, y and DOI |
| **Refusal witness** | a phase-equilibrium type Choupo cannot represent is **named**, not approximated |
| **Gate** | `check_thermoml_phase_extract` on fixtures |
| **Depends on** | S4 |
| **Out of scope** | VLLE beyond what the existing three-phase flash represents |

---

### S8 — `fitBinary` — regression against existing models

| | |
|---|---|
| **Capability** | ThermoML binary datasets → consistency screening → pre-declared split → `fitParameters` → held-out validation → dossier |
| **Files** | `src/propertyOps/FitBinary.{H,cpp}` (new orchestrator over `vleConsistency` + `fitParameters`); **no new activity models** |
| **Witness** | one binary, NRTL or UNIQUAC (both already in Choupo), validated on a held-out dataset |
| **Refusal witness** | a requested model that does not exist in Choupo is **reported as absent** — no new physics is opened to fill the gap |
| **Gate** | `check_fit_binary` — the split is honoured; the four metrics stay distinct |
| **Depends on** | S1, S7 |
| **Out of scope** | new EOS, new activity models, ternary regression |

---

### S9 — The four metrics, kept apart

| | |
|---|---|
| **Capability** | `experimental evidence` · `consistency check` · `fit quality` · `held-out validation quality` reported as four separate verdicts, never merged into one "good fit" |
| **Files** | dossier writer + op headlines |
| **Witness** | a dataset that **passes consistency but fails held-out validation**, and one that fails consistency yet fits well — the two cases that prove the metrics are not the same number |
| **Gate** | `check_metric_separation` |
| **Depends on** | S2, S8 |

---

## 2. Critical path and parallelism

```
S0 ──┬─► S3 ──► S4 ──► S5 ──┐
     │                       ├──► S6  ← September minimum
S1 ──┴──► S2 ──────────────┘
                 S4 ──► S7 ──► S8 ──► S9
```

S1 and S3 share no files and can be built in either order; **S1 does not wait on
the network**, so it starts immediately while S0 is being obtained.

## 3. Where scope is cut if time runs short

Stated in advance, so the decision is not made under pressure:

1. **S9** collapses into S8's output (metrics still separate, just fewer gates).
2. **S8** drops → binaries are searchable and extractable but regression stays
   manual through `fitParameters`.
3. **S7** drops → pure components only.

**S6 is the floor.**  It is the demonstration in the brief, and it is not
negotiable: search → evidence → fit → held-out → estimate → dossier.

## 4. Risks, named

* **The schema is the dominant unknown.**  S0 removes it in an hour; until then
  every estimate downstream of S4 is soft.
* **Archive size** decides class logistics (individual download vs shared copy)
  and is unknown.
* **Licence.**  Nothing in this plan redistributes the archive — official
  download to a gitignored cache only — so the unresolved downstream question
  stays off the critical path. It must stay that way: **no archive content in
  the release tarball.**
* **Twenty days** with `runTests` at ~35 minutes per full pass. The ladder holds:
  affected gate → class witness → one full regression per landed slice.

## 5. Scope fence

Confined to `src/propertyOps/`, `bin/`, `docs/`, and new tutorial cases.

**Not opened:** new EOS, new activity models, new physics, flowsheet engine,
unit operations, AI/RAG, GUI work, large manual recuration.  If a model needed
by a dataset does not exist in Choupo, the tool **reports its absence** and does
not open physics to cover it.
