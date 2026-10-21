# Evidence as a first-class object: the dataset, the fit, the Explorer

**Status: PROPOSED 2026-10-20 (DEV.md 4c C117), put to Vítor before any
code.  Local tier first; promotion to `data/standards/` stays a human act.
CUT DOWN THE SAME DAY on Vítor's objection ("Achas que é preciso complicar
tanto, se o LLM consegue trabalhar com menos?  Os humanos também se
desenrascam!"): §7 is the minimal shape that meets the acceptance test; §2-§5
stay as the full design that §7 can grow into, nothing in them is scheduled.**

## 1. The five conditions (Vítor, 2026-10-20) and where each lands

| # | Condition | Where it is honoured |
|---|---|---|
| 1 | identity, source, units, conditions, uncertainty, version; reusable by any model | the dataset grammar (§2): the grammar `bin/choupo-thermoml extract-vle` already writes, plus `datasetId`, `revision`, `licence` |
| 2 | fit/validation is NOT a property of the dataset | already true: the role lives in the fit's dossier (`evidence { datasets ( { role fit; ... } ) }`), never in the file; a gate refuses a `role` word inside a dataset |
| 3 | public promotion needs review and redistribution rights; never automatic | `records::refuseStandardsWrite` (the engine cannot write under standards); `promote-from-dossier` stays the only door; a dataset without `licence` cannot be promoted |
| 4 | the Explorer overlays measurements on several models and shows residuals at the measured conditions; no regression in the frontend | residuals and AAD are computed by `choupoProps` (the `experimental {}` overlay, whose AAD the `aad` golden row already pins); the GUI draws them |
| 5 | private datasets and parameters usable without publishing | the `data/local/` tier (engine precedence already announces `[local] UNVERIFIED`), and in the browser a private bundle loaded into the tab (C107's reader), never uploaded anywhere: the engine runs in the tab |

## 2. Files

```
data/local/evidence/                      (gitignored, like the rest of data/local)
  components/<name>/<datasetId>.dat       pure properties: Psat(T), Cp(T), rho(T), mu(T) ...
  pairs/<a>-<b>/<datasetId>.dat           binary: VLE T-x-y / P-x-y, LLE, gamma-inf, hE
  ternary/<a>-<b>-<c>/<datasetId>.dat
data/local/parameters/<MODEL>/<a>-<b>.dat   (exists; read by NRTL/UNIQUAC/Wilson, announced UNVERIFIED)
data/local/dossiers/<subject>/<fitId>.dossier   the fit records (roles, partition fingerprint, verdict)
tutorials/<...>/constant/experiments/<datasetId>.dat   a self-contained tutorial keeps its own copy
```

The folder is a courtesy for humans.  The SUBJECT is read from the file
(`system ( methanol water )` or `component methanol;`), the components in
catalogue order, and the index refuses a file whose folder disagrees with its
own declaration -- the folder is never the authority.

Dataset grammar = the one in use (`property; system|component; pressure|
temperature (held constant); provenance { source measured; reviewStatus;
citation; doi; archiveFile; sha256; identity { <comp> { cas; inchiKey } } };
uncertainty { <column> { kind; level; unit; values () } }; selection {};
columns (); data ()`), plus three keys:

- `datasetId <stem>;` -- equals the filename stem; the key a dossier cites.
- `revision 1;` -- a corrected transcription is a NEW file (`<stem>.r2.dat`),
  never an edit: a dossier cites `sha256` of the data block, so a dataset
  can never change under a fit that used it.
- `licence <word>;` -- required to promote; `measuredValuesFromCitedArticle`
  (facts reported in the cited article, the archive's arrangement not
  reproduced) is the normal word; a no-grant table is refused by
  `check_source_licence`.

Identity: the SUBJECT KEY is the catalogue component NAME (the engine's
canonical key); the dataset's `cas`/`inchiKey` are CHECKED against the
record it names (C13's alias rule), and a mismatch refuses.

## 3. Indexing

No hand-kept list.  ONE pure function, `indexEvidence(files)`, derives per
dataset: subject kind and key, property, held conditions, number of points,
doi, sha256, reviewStatus, licence, tier (standards / local / case).  It has
three callers that must agree:

1. the Vite virtual module `virtual:local-evidence` (the plugin that already
   aggregates `data/local/components` for the dev GUI does the same for
   `evidence/`, `parameters/`, `dossiers/`);
2. the case loader (a tutorial's `constant/experiments/` is case evidence,
   as `constant/components/` is a case component), so the hosted site shows
   the evidence the bundled tutorials carry even with `data/local` empty;
3. the private-bundle loader on the hosted site (C107's `caseArchive.ts`
   reader pointed at a `data/local` folder or .zip): the bundle lives in
   the tab's memory only.

Engine side: `dataset` paths in a propsDict resolve case-relative, then
`$CHOUPO_HOME/data/local/evidence/`, then `data/standards/evidence/` (the
three-tier precedence components already have), the tier ANNOUNCED.  Later,
`bin/curate/evidence_index.py -> generated/evidenceIndex.json` for the
standards tier, gated fresh like the release inventory.

Gate `check_evidence_records`: grammar; `datasetId` = stem; `sha256` matches
the data block; identity matches the catalogue; no `role` inside a dataset;
`licence` present on anything under standards; a folder that disagrees with
its file.

## 4. How the Explorer gets candidates and data

- CANDIDATE MODELS for a pair = every parameter record for that pair, in any
  tier (`pairsCatalogue.ts` already globs standards NRTL/Wilson/UNIQUAC;
  it gains the local virtual module and the open case's `constant/
  parameters`), each a DISTINCT candidate labelled by tier and provenance
  (DECHEMA literature set vs a student's fit are two candidates of one
  model), plus the predictive models that need no pair (UNIFAC; COSMO-SAC
  where installed; ideal).
- CURVES: as today, the Explorer synthesises a props case
  (`case/exploreSynth.ts`) and runs `choupoProps` in WASM -- the chosen
  candidate's parameters INLINE in the synthesised `thermoPhysPropDict`
  (the v2 grammar already takes a `binaryParameters` block), so a private
  record works on the hosted site with no file path.
- MEASUREMENTS AND RESIDUALS: the synthesised case embeds the chosen
  datasets as case files and declares `experimental ( { dataset; models
  (...) } )`; the ENGINE evaluates each candidate at the measured
  conditions and publishes residuals and AAD (where the overlay publishes
  only the AAD today, the op gains the per-point residual column -- published
  => pinned, the `aad` row kind extended).  The GUI draws points with their
  uncertainty bars, the curves, a residual panel per candidate, the AAD
  table, and the dossier verdict where a dossier cites that candidate.
  The GUI fits nothing.
- URL: `?workspace=explore&pair=methanol-water&view=evidence&datasets=<id>,
  <id>&models=<candidateId>,...` -- a professor can paste it.

## 5. Stages, each verifiable, URLs preserved

0. Contract: the grammar keys, the gate, the two curate04 datasets copied to
   `data/local/evidence/pairs/methanol-water/` as the witness.
1. Engine: tiered `dataset` resolution; per-point residuals in the overlay.
2. GUI plumbing: the virtual modules, `indexEvidence`, the private bundle.
3. Explorer: the PAIR as a subject; the Evidence view.
4. C116: one Explore (`?workspace=properties` kept as a redirect).

Acceptance (Vítor's test): open the Explorer, pick methanol + water, see the
two studies (doi 10.1016/j.jct.2009.11.020 and 10.1021/je200341c) against
the standards NRTL, curate04's fitted NRTL (local), UNIQUAC, Wilson, UNIFAC
and ideal, with residuals -- without opening the curation case.

## 6. Open for Vítor

(a) the subject key by catalogue name with CAS/InChIKey checked (proposed),
or by InChIKey; (b) `licence` required on every dataset even in local
(proposed: required, so a promotion never discovers it missing); (c) the
private bundle on the hosted site (proposed: yes).

## 7. The minimal shape (what is actually scheduled)

What exists is enough for an LLM and a human; only the SHOWING is missing.

- Files: ONE flat folder `data/local/evidence/` (and a tutorial's own
  `constant/experiments/`), the dataset grammar UNCHANGED -- it already
  carries the system, the citation, the DOI, the sha256, the uncertainties
  and the units.  The filename is the id; a corrected transcription is a new
  file; `licence` is asked for at PROMOTION, not before.  No `datasetId`,
  `revision` or folder-per-subject keys.
- Index: none.  The dev GUI's existing plugin that aggregates
  `data/local/components` globs `data/local/evidence/*.dat` and
  `data/local/parameters/**/*.dat` too; the GUI reads each file's own
  header (it parses `.dat` already).  The hosted site shows the evidence the
  bundled tutorials carry; a student with private data runs the dev GUI
  (`bin/runGui`).  No private-bundle loader for now.
- Engine: nothing, unless the scan cannot be evaluated AT the measured x
  values (`propertyScan1D` takes `from/to/n` only, PropertyScan1D.cpp:73-78)
  -- then the one addition is an explicit `points ( ... )` list, so the
  residual is engine-minus-measurement at the measured condition and the GUI
  only subtracts.
- Explorer: the PAIR as a subject and an Evidence view -- datasets found by
  the pair's two names, every parameter record of any tier a candidate,
  curves and values at the measured points from `choupoProps`, residuals and
  AAD shown, the dossier verdict where one exists.  URL as in §4.
- Gate: a dataset must parse and carry `citation` and `sha256`; no more.

Two stages: (1) the plugin glob and the methanol-water witness copied from
curate04; (2) the Explorer view.  C116 (one Explore) after.

## 8. Built (2026-10-20, G18) -- what §7 became in the tree

Stage 1, plumbing.  `data/local/evidence/` exists as the private tier's home
(README tracked, every `.dat` gitignored); `gui/scripts/localCataloguePlugin.ts`
bundles it and `data/local/parameters/**` as two more virtual modules beside
the component one; `gui/src/case/evidence.ts` reads every dataset's OWN header
(the grammar unchanged, converted to SI by the declared units) from three
tiers -- `data/local`, the bundled tutorials' `constant/experiments/`, the
open case -- merged by `sha256`, the subject read from `system ( a b )` /
`component x;` and matched order-free; `gui/src/case/pairsCatalogue.ts`
carries the three tiers of pair records as DISTINCT entries with the
`parameters {}` block verbatim and a provenance label.  Gate
`check_evidence_records`: every dataset parses, cites and carries a sha256,
declares no `role`; the local home is tracked and ignored.

Engine.  `propertyScan1D` takes `vary { points ( ... ) }` beside the grid
form (`src/propertyOps/PropertyScan1D.cpp`, ONE home for the grid): the
values in the order written, canonical SI, announced (`[scan] evaluating at N
DECLARED point(s)`), refused by name beside `from/to/n/step`, as a scalar, or
empty.  Witness `tutorials/props/compare/evidence01_methanol_water_points`
(the held-out study at its 13 x, NRTL / UNIFAC / ideal); the gate's arms (d)
and (e) hold the CSV to the dataset's x and the three refusals.

Stage 2, the view.  `gui/src/ui/explore/EvidenceLens.tsx`, offered as the
lens `evidence` when a dataset for the pair exists in some tier
(`exploreViews.viewsFor`, now taking the open case's files): the datasets and
the candidate models (`gui/src/case/evidenceSynth.ts`: every pair record of
every tier, UNIFAC where both carry groups, COSMO-SAC only where a profile is
installed, ideal) as checkboxes; ONE choupoProps run per candidate, the
candidate's parameters inline, a `points` op per (dataset, isobar) and a grid
curve per isobar; residual = engine minus measurement, AAD = the mean of the
residuals drawn, the dossier verdict beside a candidate whose record names the
case the dossier belongs to.  URL `?workspace=properties&components=a,b&lens=
evidence&datasets=...&models=...` (absent lists mean all; every older address
unchanged).  On a phone the two lists fold behind one button.

Not built, as §7 said: no index, no private bundle, no `datasetId`/`revision`/
`licence` keys, no `data/standards/evidence/` yet (the gate reads it the day
it exists), no per-point residual in the engine's `experimental {}` overlay
(the GUI reads the engine's values at the points instead).  C116 after.
