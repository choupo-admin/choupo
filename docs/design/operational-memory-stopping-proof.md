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

## Brief A (cold): "add the osmotic coefficient to `diagMeanIonic`"

Filled from the artefacts alone:

```
CANONICAL OWNER:      ownership-index T5 -> src/propertyOps/Speciate.cpp
PRODUCERS:            SpeciationSolver rows (codeMap: Speciate.cpp reaches
                      src/thermo/electrolyte/SpeciationSolver.H)
CONSUMERS:            T5 row: speciate.schema.json (additionalProperties
                      false), generated docs (propsGuide-operations.tex,
                      schemas-reference.md), goldens/anchors of declaring
                      cases; caseManifest: byOp[speciate] = 10 cases,
                      anchored = {hamer_wu, seawater, flash09}
INVARIANTS AT RISK:   T5 Never: stoichiometry from a salt name (F2)
FOCUSED TESTS:        check_mean_ionic, check_schema_coverage,
                      gate_manifest --check
WITNESS:              propsBench
FULL REGRESSION?      no — additive diagnostics key
```

Verified: those are exactly the consumers the real `diagMeanIonic` change
(commits 6b999215..b4885b64) hit — and yesterday they were discovered by
three sequential gate FAILURES instead of one lookup.  The brief converts
three commits into one.

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

## The stopping condition, exercised

Both briefs were fillable by lookup; both were verified against the tree;
the artefacts' own gates hold.  **The campaign is closed.**  What remains is
practice, not construction: fill §6b before non-trivial edits, keep the
index's row when a slice ships a new subsystem, and let the three gates
fail loudly when the memory rots.
