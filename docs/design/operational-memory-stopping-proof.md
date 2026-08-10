# Operational memory — the stopping proof, and the campaign's closure

> **KIND: RECORD · STATUS: CAMPAIGN CLOSED 2026-08-10.**  Vítor's
> operational-memory ruling set a concrete success criterion — *given a
> proposed change, a fresh agent must identify the canonical owner, likely
> consumers, invariants at risk, relevant ADRs, focused tests and
> representative witnesses BEFORE editing* — and demanded a bounded plan
> with a stopping condition.  This page is that stop: two impact briefs
> filled **only by querying the artefacts**, verified against the tree.
> When a future change finds a gap in the memory, the gap is fixed as part
> of that change's slice — there is no enrichment campaign to resume.

## What was built (M1–M4, one commit each)

| artefact | kind | gate |
|---|---|---|
| `docs/architecture/ownership-index.md` — 25 features → owner/producers/consumers/Never/Contract/Witness/Gates | human, pointers only | `check_ownership_index` (resolvability) |
| `generated/codeMap.json` — 423 classes, compiler-truth include graph (282 TUs), 182 registry entries, binaries; limitations embedded | generated (`bin/curate/code_map.py`) | `--check` staleness arm |
| `generated/caseManifest.json` — 341 cases: roles + declared surface; reverse indices byApplication/byUnitType/byModel/byOp | generated (`bin/curate/case_manifest.py`) | `--check` staleness arm |
| `DEV.md` §6a/§6b — the testing ladder + the mandatory impact brief | convention | review |

Construction itself caught five defects — an index row filing the
post-processors in the wrong directory, propsDict activity models missing
from `byModel`, a false positive that was in the *checking grep* rather than
the artefact, a class-scan assumption disproved (below), and a
discriminates-nothing flag (below).  Every one was caught by an artefact's
own gate or by the cold queries, none by a regression.

## Brief A: the LITERAL completed diagMeanIonic brief (ChatGPT correction 1)

The demanded form — every field filled, written as it should have existed
before the 2026-08-10 `diagMeanIonic` edit, from the artefacts:

```
INTENDED CHANGE:   Publish gamma_pm as a speciate-op diagnostic
                   (diagMeanIonic pairs -> gamma_pm_X_Y): the engine
                   publishes only single-ion gammas, and published-table
                   comparisons are hand-combined in headers, where one has
                   already gone stale.
CANONICAL OWNER:   src/propertyOps/Speciate.cpp (index T5, the op's
                   diagnostics surface).
WHY THIS OWNER:    Diagnostics keys are minted where the op assembles its
                   result; the kernel (SpeciationSolver) must not learn
                   about publication surfaces (layering).
EXPECTED FILES:    src/propertyOps/Speciate.cpp;
                   gui/schemas/operations/speciate.schema.json (new key --
                     additionalProperties FALSE, omission REFUSES);
                   docs/propsGuide-operations.tex + docs/ai/
                     schemas-reference.md (GENERATED from the schema);
                   bin/curate/check_mean_ionic.py (new gate);
                   generated/gateManifest.json;
                   pitzer_seawater_verify/system/propsDict + expected.
KNOWN PRODUCERS:   SpeciationSolver::SpeciesRow (gamma, z) -- public.
KNOWN CONSUMERS:   result-JSON diagnostics -> runTests get_diag (goldens +
                   anchors); the schema; the two generated docs; the V&V §3
                   rows quoting gamma_pm agreements.
INVARIANTS AT RISK: F2 (stoichiometry from CHARGES, never a salt name);
                   arity (gamma_pm computed in ONE place).
PROHIBITED:        a second stoichiometry parser; a name->nu lookup.
APPLICABLE ADRS:   CLAUDE.md §5 (F2; A3 selector keys).
FOCUSED TESTS:     check_mean_ionic, check_schema_coverage,
                   gate_manifest --check, runTests on declaring cases.
REPRESENTATIVE WITNESS: propsBench (pitzer_gamma_hamer_wu).
POSSIBLE DOWNSTREAM: caseManifest byOp[speciate] = 10 candidates; only
                   declaring cases gain golden rows.
FULL REGRESSION?   NO -- additive optional key.  (The anchor-claim-column
                   runTests edit beside it IS cross-cutting and rides the
                   declared batch-closure regression.)
DEFINITION OF DONE: engine + schema + regenerated docs + sabotaged gate +
                   declaring-case goldens + witness green, ONE commit.
```

**Verification against the real change (commits 6b999215..b4885b64), with
the accounting the correction demands:**

* **Captured**: the three consumers discovered on the day by three
  sequential gate FAILURES (schema-coverage → generated-docs →
  gate-manifest) all appear above by lookup.  Three commits become one.
* **False negative (1)**: the V&V §3 row quoting the seawater agreement —
  a prose consumer the T5 index row did not name.  Fixed: the row now
  names it.
* **False positives (by design, declared)**: `byOp[speciate]` lists 10
  candidate cases; 2 were touched.  Candidates are published as
  candidates, never as "affected" — the manifest's own limitation states
  this.

## Brief B (cold): "the `equilibriumState` cross-reference in `calculated{}`" (the next real slice)

```
CANONICAL OWNER:      ownership-index S2/S3 -> src/streams/SpeciationBlock.cpp
                      + the calculated{} writer in src/streams/StreamStateIO.cpp
COMPILE-TIME REACH:   codeMap.includesReverse[SpeciationBlock.H] = 3 TUs
                      (SpeciationBlock.cpp, IsothermalFlash.cpp,
                      Flowsheet.cpp); StreamStateIO.H = 3 TUs
INVARIANTS AT RISK:   S2 Never: a COPY of the equilibrium state under
                      calculated{} (Vítor 2026-08-10: cross-reference only);
                      THE TWO BASES placement
APPLICABLE ADRS:      stream-state-architecture.md; aqueous-analysis-inlet-
                      scope.md §8–9; the 2026-08-10 ruling (refuse
                      stale/missing/incompatible target; witness that a
                      canonical-state change cannot leave a second
                      apparently-valid equilibriumState)
FOCUSED TESTS:        check_both_bases, check_phase_speciation,
                      check_aqueous_analysis, check_material_wrapper
WITNESS:              reactiveMultiphaseFlash (+ aqueousAnalysisInlet)
DOWNSTREAM:           caseManifest: aqueousChemistry cases = 43 (the
                      population whose streams carry speciation blocks)
FULL REGRESSION?      no — reader/writer of one optional block; becomes YES
                      only if the block's grammar forces a corpus rewrite
```

Two things the cold queries corrected in the QUERIER, which is the point:
`SpeciationBlock.H` declares **no class** of that name (namespace-level
functions — the map knew, session memory did not), and the first
`equilibrium` flag in the manifest matched 321/341 cases because
`equilibrium {}` is the standard grammar wrapper — replaced by
`aqueousChemistry` (43/341), which discriminates.

## The four corrections (ChatGPT via Vítor, post-approval), reconciled

1. **Literal brief** — delivered above, all fields, verified with FN/FP
   accounting.  2. **Non-exclusive roles** — already built as `roles[]`
   (a case holds several); the `[] = tutorial` default was the one
   violation and is corrected: an empty list now means "no special-role
   marker detected (auditable markers only)", never an affirmative
   pedagogical classification.  3. **codeMap strictly factual** — the
   sections were never merged into one dependency relation; a per-section
   `provenance` object now states how each was obtained (compiler
   dependency · textual declaration · explicit registration · filesystem),
   distinct from `limitations` (what each cannot claim).  Ownership and
   consumer SEMANTICS stay in the human index (A2), never inferred here.
   4. **Independently runnable gates** — already true by construction:
   `check_ownership_index.py`, `code_map.py --check`,
   `case_manifest.py --check` each run standalone in seconds, no corpus.

## The stopping condition, exercised

Both briefs were fillable by lookup; both were verified against the tree;
the artefacts' own gates hold.  **The campaign is closed.**  What remains is
practice, not construction: fill §6b before non-trivial edits, keep the
index's row when a slice ships a new subsystem, and let the three gates
fail loudly when the memory rots.
