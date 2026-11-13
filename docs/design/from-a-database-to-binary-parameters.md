# From a database to binary parameters — an EduTool and a ThermoML reader

*2026-11-12.  DEV.md 4c C332 item 3 (Vítor: "Aprovo tudo!") and C334: a page
on how a ThermoML file becomes an NRTL pair, with the curation pipeline of
C282-C300 as the lesson, a map of which measurement constrains which
parameter, and a live part built around the student's task: "I have a
ThermoML file for my pair; what parameters does it give, and how good are
they?".  It sits on the shelf "Property data & parameters", after
least-squares on that shelf and on the path "From a measurement to a
parameter".  The same work delivers the TypeScript ThermoML reader that
C289 (the Explorer overlay) will use.*

## 1. What was built

| file | what |
|---|---|
| `gui/src/case/thermomlReader.ts` | the reader (section 2); imports nothing |
| `gui/src/ui/methods/databaseToParametersFit.ts` | the pipeline's rule as a case the engine runs, and the reading of its parity table |
| `gui/src/ui/methods/databaseToParametersLesson.ts` | the eight steps, the quoted record, the counts, the map, the limits, `CITATIONS` |
| `gui/src/ui/methods/DatabaseToParametersTool.tsx` | the page |
| `gui/tests/thermomlReader.test.ts` + `thermomlParity.py` + `thermomlShapes.synthetic.xml` | the reader held to the Python extractor |
| `gui/tests/databaseToParametersFit.test.ts` | the rule read back from the pipeline's source; the case run on the native engine |
| `gui/tests/databaseToParametersLesson.test.ts` | citations, quoted lines, counts recounted with git, the page rendered |
| `docs/design/from-a-database-to-binary-parameters.mount.patch` | NOT applied: the mount (section 6) |

## 2. The reader, and how it is held to the extractor

`bin/choupo-thermoml` is the reader of record: every curated pair was fitted
to what it wrote.  `thermomlReader.ts` transcribes it function by function.

**API** (all pure, no DOM, no React):

* `parseXml(text) -> XmlNode` -- a small XML reader with ElementTree's
  semantics where they matter (`tag` is the local name, `text` is `.text`:
  the character data before the first child, comments skipped and the text
  around them joined, entities and CDATA decoded); refuses malformed XML,
  `--` in a comment, an undefined entity, a second root (`XmlParseError`).
* `readThermoML(text, { multiIsotherm? }) -> ThermoMLFile` -- citation fields,
  `compounds` (orgNum, name, formula, InChI, InChIKey, CAS) and every block
  read BOTH ways: `bubbleT` (`_one_bubble_block`) and `bubbleP`
  (`_one_bubbleP_block`), each a record, `{ refused }` in the extractor's
  words, or `{ error }` where Python would raise something other than a
  refusal.  Refuses the v5 dialect and unparseable files (`ThermoMLRefusal`).
* `selectBlock(file, "bubbleT" | "bubbleP", block?)` --
  `extract_binary_bubble[P]`: the one interpretable block, or the refusal that
  lists them (choosing is the curator's act).
* `interiorIndices(points)`, `bubbleTDataRows(rec, keep)`,
  `bubblePDataRows(rec, keep)`, `uncertaintyValues(u, keep)` -- what the
  COMMANDS write: x to `8.4f`, T or P to `.6g`, the uncertainty list to `g`.
* `pyFloat`, `pyRepr`, `pyRound6`, `pyFixed`, `pyFixedW`, `pyG` -- Python's
  `float()`, `repr()`, `round(x, 6)` and f-string formats, computed on the
  EXACT decimal value of the double, rounding half to even.

**Not in the reader**, on purpose: the identity join (the extractor joins by
InChIKey through `identity.json`, which is not in the tree; the reader
returns the archive's own identifiers and the caller joins), the companion
vapour block, the v5 dialect.

**How it is held.**  `gui/tests/thermomlParity.py` imports the extractor
read-only and reports, per block, what `_one_bubble_block` and
`_one_bubbleP_block` return, the file-level choice, and the rows the
COMMANDS write (it runs `cmd_extract_vle --interior-only --no-vapour` and
`cmd_extract_px` into a temporary directory, with a temporary
`identity.json` mapping each compound's own InChIKey to its own name, so the
real join code runs and no cache is touched).  `thermomlReader.test.ts`
requires the same outcome per block and geometry, every float equal to the
last bit, every refusal in the same words, the same file-level choice and the
same written rows.  The fixtures are synthetic: a twelve-shape file written
for this (isobar with a held-constant pressure and the composition naming the
second compound, two isobars with one missing uncertainty, an isotherm, two
isotherms, y without x, a ternary, a pressure in MPa, a repeated row, a
missing pressure uncertainty, a pure component, two properties, a second
bubble-T block) and curate03's two fixtures.  A Python-formatting arm holds
`pyG`, `pyFixed`, `pyRepr` and `pyRound6` to Python on tricky values (ties,
`0.0078125`, `999999.5`, `1e16`).

**Real archive files, run locally and NOT committed** (the archive at
`.claude/worktrees/review-newcomer/thirdParty/thermoml`, read-only), through
the opt-in arm `CHOUPO_THERMOML_PARITY_FILES` on 2026-11-12:

* the 316 article files named by the curation cases'
  `constant/archiveDatasets`: every block agrees, **20 188 written rows**
  identical;
* 300 further files drawn at random (seed 334) from the 11 923 in the cache:
  every block agrees, **1 114 written rows** identical.

One difference was found on the way, in the FIXTURE: the parity run refused
the first shapes file because a comment contained `--`, which XML forbids and
the TypeScript reader had accepted; the reader now refuses it too.

## 3. The live fit

The browser cannot fetch a ThermoML file: NIST's per-article URL sends no
CORS header, so the student downloads it and loads it.  The page then:

1. lists every block with the reader's verdict and the pipeline's
   (`pipelineIssues`: an uncertainty on every point, at least five interior
   points, at most 110 kPa);
2. asks the student to name the two compounds from the catalogue, the ones
   with the file's formula listed first -- a filter, never the join
   (`candidatesFor`; C2H6O lists ethanol and dimethyl ether);
3. writes a case (`pairFitCaseFiles`): the dataset in the extractor's form,
   NRTL with a = 0 and alpha = 0.30, b_ij and b_ji from 0 within +/-3000 K,
   one `fitParameters` op, and runs it with `useCaseFilesRun` (the shared
   run hook; no shared file was edited) in choupoProps: **stage A**
   `leastSquares` on every interior point, outliers beyond 3 K (20 % for a
   pressure, a block whole beyond half) read from the engine's `parity.csv`;
   **stage B** `twoStage` with those rows as `discard ( ... )`;
4. grades the largest error over the kept points (1 / 2 / 4 K, 5 / 10 / 20 %)
   and applies the C300 cap: one file is one laboratory, so an in-sample
   clean is always shown capped at warning.

Every number of the rule is read back from the pipeline's source by
`databaseToParametersFit.test.ts` (`pairs_c283.py:73, 86, 87, 254`,
`pairs_px.py:70, 71`, `bin/choupo-curate:109`), and `gradeOf`/`capOf` are
compared with `pairs_c283.grade_of` / `cap_grade` run in Python.

**Tested how.**  The browser runs the WASM build, which was NOT built here
(`make wasm` is slow and shared): the in-browser run is untested by this
slice.  The SAME case was run on the native choupoProps of this tree
(`make all`), stage A then B, from curate03's synthetic fixture, and a
bubble-pressure case from the shapes file; the page's largest error agrees
with the engine's own `bubble_max_fit` to 1e-3 K.  With no native build that
arm is skipped, never passed.

**A real file, locally (not committed).**  je5007373 (acetone + methanol,
101.3 kPa, 34 points) through the page's modules on the native engine: with
the compounds named in the block's order, b_acetone-methanol = 383.4 K,
b_methanol-acetone = -100.9 K, no outlier, largest error 0.236 K: in-sample
clean, capped at warning (one laboratory).  The catalogue record of the same
pair, fitted to seven laboratories, carries 103.6 K and 112.5 K at 0.622 K
(`acetone-methanol.dat:49, 51, 65`): very different parameters of similar
quality, which is what its `maxAbsCorr 0.99722744` (line 154) says.  With the
two names swapped -- x labelled as the wrong compound -- the same file gave
five outliers and a severe grade: the reason the join is the student's act
and the page prints which compound x belongs to.

**Not run on the page**, and the page says so: the pipeline's second start,
the one-liquid check (arm f of `check_regressed_pairs`), the other
laboratories of the pair, UNIQUAC and Wilson.

## 4. The counts the page quotes

Measured at commit `42c1dcbde` (2026-11-12), over
`data/standards/parameters/{NRTL,UNIQUAC,Wilson}/*.dat`, comments stripped:
558 NRTL, 220 UNIQUAC, 524 Wilson; of the NRTL records 490 cite exactly one
distinct DOI, 546 say `heldOut none`, 17 are `fitGrade severe`, 395 carry a
`fitGradeCap`, 0 say `humanReviewed true` or `review { by human }`.
`databaseToParametersLesson.test.ts` recounts them with `git cat-file` AT
THAT COMMIT, so the page stays checkable after the catalogue grows; the page
prints the commit and the date.

## 5. What was verified about the pipeline, and one correction to the brief

Read in this tree: C300 rules 1, 2 and 4 are implemented
(`src/thermo/FitGrade.H`, `pairs_c283.py:149`, `ReviewRecord.cpp`); rule 3
applies to NEW promotions (`pairs_c283.py:164`, `NOT_PROMOTED_GRADES`), but
the 17 severe NRTL records promoted before it are still in the default
catalogue (`binary-pairs-from-open-measurements.md:1335`, "measured, not
done").  The page says exactly that; the brief's sentence "severe leaves the
default catalogue" is true of new fits only.

## 6. The mount (not applied here)

`registry.ts`, `MethodsWorkspace.tsx` and `lessonReferences.json` are the
laptop session's.  `from-a-database-to-binary-parameters.mount.patch` applies
ON TOP OF `where-to-find-property-data.mount.patch` (C322), which creates the
shelf and the path.  It adds the id `database-to-parameters`, the registry
entry on "Property data & parameters" right after `property-trust`
(origins engine, page, reference), the step after `least-squares` in
`measurement-to-parameter` (sle-pair and salt-mixing follow it when they
land), the workspace arm, three verified references (Renon & Prausnitz 1968,
Frenkel et al. 2003, the NIST archive record) and the page's
`<LessonReferences>` line.  Least-squares moving onto the shelf (C332 item 2)
is the laptop's edit and is not in the patch.  After applying, regenerate
`generated/methodTools.json` (`node bin/curate/method_tools.mjs`) and
re-observe `check_method_tools` and `check_lesson_references` with
`gate_manifest --only`.

## 7. Not done

The y column (`_vapour_series`), multi-file fits (all laboratories of a pair),
the one-liquid check in the browser, an overlay of the catalogue record's
curve on the student's points (C289 will draw it with this reader), and the
WASM run.

## Review is not validation

Review is not validation (DEV.md 4c C296/C297, cited here because the dated register moves every day and a line number into it does not hold): a record says WHO reviewed it; what a reviewer cannot change stays in the record as fitted.
