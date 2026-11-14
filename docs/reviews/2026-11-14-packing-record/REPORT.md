# Review: C398 slice (e), the packing as an asset record

Date 2026-11-14.  Subject: `origin/c398/slice-e-packing-record` at
ffd49f585, on main afa154705.  Rows PK-01..PK-10 in docs/reviews/LEDGER.tsv
(PK- because PR-01..PR-10 are taken by the C389 price review).  No tracked
source edited; sabotages done in a scratch copy of `src/` and build.

Verdict: the slice does what it claims: no number moves, both catalogue
records match their pages, and the records are found in every set-up that
could be run.  But two refusals give a false reason or a false remedy,
installed and borrowed values skip the range check, and the gate missed six
of the eight sabotages tried.

## What holds (measured)

**(1) No shipped number moved.**  17 cases run with the branch binary and
data and with a parent build at afa154705 (packing01-04, ratebased01-04,
totalReflux01, trayEfficiency01, column01, column14, coolingTower01, cstr07,
ed03_stack_record, membrane15_module_nf270_4040, sprayDryer07): full stdout
and stderr byte-identical apart from the commit stamp in the banner and the
citation block.  The parent build was the builder's scratch tree; every file
under `src/`, `make/` and `Makefile` was checked against `git archive
afa154705` (all identical) and the binary is newer than all of them.
`bin/runTests --scope packing05 packing01 -j2`: PASS 3 / FAIL 0.

**(2) Every value in the two catalogue records matches the page it cites**
(PDFs in ~/Choupo-Literature/Articles/Distillation/).
* SulzerBX: Rocha, Bravo & Fair 1993, Table IV, p. 649: a_p 492, S 0.009 m,
  epsilon 0.90, "316 SS (sheet or gauze)"; 1996 Table 1, p. 1661: 492 and
  0.90, note a gives 60 deg for Sulzer BX; p. 1665: Eq 14 and "except for
  Sulzer BX where eq 14 was used for a_e".
* MontzB1-250: Fair et al. 2000, Table 1, p. 1789: 244, 0.980, 45 deg,
  h_pe 0.194, b 0.0225, h 0.0120, s 0.01645, "shallow embossed,
  unperforated"; p. 1788 says "sheet metal packings"; Eq 2 gives 243.70 and
  Eq 3 gives 0.016449, as the record says.
* The witness's case-local MontzA3-500M against Schulz 2018 section 2, p.
  764: 500 nominal, 478 installed, 60 deg, about 0.92, gauze, and the
  unperforated/perforated contradiction: all as stated.

**(3) The printed source of each value is true** for the witness and its
variants: installed replacing nominal, installed with no nominal, borrowed,
nominal; a sheet-metal record under Rocha-Bravo-Fair, run on a probe: F_SE
printed from the record, KPIs equal to an inline twin exactly; lengths in mm
in a record give the same KPIs as in m.  Exception: PK-04.

**(4) Every refusal fires and names the right field:** missing field (names
field, correlation and record), geometry key beside `record`, `installed`
without `source`, `installed { diameter }`, `borrowed` without `reason`,
borrowed from its own record, borrowed field the source lacks, unknown record
(also for a borrow), RANDOM record, a field installed and borrowed at once,
installed or borrowed value the model does not read, two case-local files with
one name.  Exceptions: PK-01, PK-02.

**(6) The registry finds records in every set-up that could be run:** sealed
witness with the catalogue hidden (`CHOUPO_HOME=/nonexistent`): runs, KPIs
equal; unsealed (manifest and mirror removed) with `CHOUPO_HOME`: SulzerBX
read from the catalogue, KPIs equal; unsealed without `CHOUPO_HOME` from the
repo root: runs; from the case directory without `CHOUPO_HOME` the run dies
earlier at `Database`, as every unsealed case does.  `choupo-import` re-seals
the witness after its SulzerBX mirror is deleted: mirror byte-identical,
manifest identical, 28 golden rows reproduce with the catalogue hidden.  A
Delft case naming `MontzB1-250` gets it mirrored and runs hidden.  GUI (read,
not run): the whole case tree is bundled (`gui/src/cases/tutorials.ts:69`);
each run creates a fresh WASM instance (`gui/public/workers/solverWorker.js`),
so the `call_once` at `PackingRecord.cpp:353-354` cannot leak between runs;
the sweep's 14 passes in one process share one correct registry; the witness
sweep prints no unread-key line.

Other checks: `packing {}` on any other column model is refused at
`DistillationColumn.cpp:1336`, so a record cannot be silently ignored.  Gates
check_packing_record, feature_documented, guide_anchors, sealed_corpus,
seal_drift, asset_homes, record_form, source_licence, doctrine,
theory_citations: all OK.

## Rows

**PK-01 (S2): an unknown `model` word gets a false refusal.**  The comment at
`PackingRecord.cpp:460-461` says the solver refuses an unknown model word
"with the same message as the inline form"; false once `installed` or
`borrowed` is present.  The witness with `model Billet;` stops at :473-481
with "`installed { specificArea }` is not read by `model Billet;` (it reads
)."; without `installed` it says "`borrowed { corrugationSide }` is not read
by `model Billet;`".

**PK-02 (S2): the refusal for `surface` or `surfaceEnhancement` typed beside
`record` points to a remedy the reader refuses.**  The message at :375-382
suggests `installed { surfaceEnhancement ...; }`, refused at :396-401
("unknown installed packing value"), and `borrowed { surface {...} }`,
refused at :420-422; for `surface` it also contradicts its own "(cannot be
installed)".  Both reproduced on witness copies.

**PK-03 (S3): installed and borrowed values are never range-checked.**  The
record reader checks ranges (:167-174); installed and borrowed values at :402
and :453 are not.  The witness with `installed { voidFraction 1.5; }` exits 0
with HETP 0.215746 m; the same 1.5 in a record is refused.  The inline form
also accepts 1.5 (before this slice too): a hole in the slice's own contract,
not a regression.

**PK-04 (S3): a borrowed estimate loses its mark.**  If the source record
marks a field `origin estimated`, the borrowed copy prints with no estimate
mark (:528-535); the same field taken as nominal is marked (:540-542).
Reproduced by marking SulzerBX's corrugationSide estimated in an unsealed copy.

**PK-05 (S3): the gate's unread-key arm is blind.**
`check_packing_record.py:182` only checks that the audit does not name
`record`, `installed` or `borrowed`.  Sabotage: disable `transferReads` in
`solvePackedReadingRecord`: the witness then tells the user 8 keys "had NO
effect on this run" (P, condenser, totalReflux, diameter, height, ...) and the
gate still prints OK.

**PK-06 (S3): the gate misses most other sabotages of its subject** (table
below): two of eight caught.

**PK-07 (S3): nothing checked pins the catalogue numbers.**  Arm (3) checks
MontzB1-250 for exit 0 and labels only (HETP 0.378252 printed, not compared);
no shipped case uses MontzB1-250; the witness reads the sealed mirror of
SulzerBX, so a later edit of either catalogue record moves no golden; only
`check_seal_drift` looks at the SulzerBX mirror (by reading).

**PK-08 (S4): record name and file name can differ.**  The registry finds a
record by its `name` field; the seal mirrors by file name
(`bin/choupo-import:1799-1800`).  A record in `SomethingElse.dat` runs
unsealed and could not be sealed; no gate requires name == file name for
`kind packing`.

**PK-09 (S4):** borrowing from an `arrangement random` record is accepted
without a word; only the column's own record is checked (:362-367).
Reproduced.

**PK-10 (S4):** MembraneRegistry's list of asset kinds does not name
`packing`, in its refusal (`MembraneRegistry.cpp:96-97`) or its comment
(:72-74), which says "when a kind is added, add it there too".

## Sabotage table

| # | sabotage (file) | gate |
|---|---|---|
| E1 | installed-without-nominal label -> "nominal (record)" (PackingRecord.cpp) | MISSED |
| E2 | transferReads disabled (DistillationColumn.cpp) | MISSED (run then names 8 false unread keys) |
| E3 | surface inserted as "gauze" always | MISSED |
| E4 | record range check off | MISSED |
| E5 | `surface` removed from typed-beside list | MISSED |
| E6 | "BORROWED" label replaced | CAUGHT (arm 1) |
| E7 | `installed` source not required | CAUGHT (arm 5) |
| E8 | estimate mark on nominal dropped | MISSED |

## Outside this slice (seen, not counted)

* Re-sealing from today's catalogue fails: re-sealing packing01, or the
  witness, with their mirrored components removed fails with flooding at all
  14 points, because the sealed xylene records carry a case-added
  `diffusionVolume 132.0` (C329) that `data/standards/components/pXylene.dat`
  lacks.  The witness re-seals fine when its authored components are kept.
  Older than this slice.
* The importer stamps mirrored records "(Choupo-2608 release)" even for
  records that did not exist in 2608 (SulzerBX mirror, line 1).

## What could not be reached

* The GUI (no browser; code paths read only).  `modelDocs.ts` links the
  packing model words but not `record`; no precedent for record keys.
* Byte-identity: 17 of the builder's 45 cases.
* Billet's correlation and random packings: not implemented.

(Written into the tree by the coordinator from the reviewer's hand-back: the
harness refuses report files written by a subagent.)
