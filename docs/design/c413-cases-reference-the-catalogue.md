# C413 -- Cases reference the catalogue

Design record for DEV.md 4c C413 (first item of the C414 consolidation
freeze).  Status: DESIGN, nothing built.  Written read-only on
`batch/2026-11-16` (4deb880bb) while a sweep held the machine: no binary was
run and no gate was executed for this record.  Every engine fact below
carries the `file:line` it was read at; every count comes from
`docs/audits/2026-11-16-c413-case-copies.md` or from its per-file data
(`final.json`), re-aggregated per case for section 7.

## 1. The claim, in one paragraph

A case names its components and models; the records come from
`data/standards/`.  A case carries a record of its own only when the record
is absent from the catalogue or differs from it on purpose, and then the
record says so in a parsed key.  Reproducibility moves from 6115 copies to
one line per resolved record: the case's manifest pins the computational
hash of every catalogue record its run reads; a run that finds a pin broken
names the record, and refuses when asked to be strict.  The copies come back
on demand: an exported case is a sealed case exactly as today.

This revises the 2026-06-11 credo "cases self-contained" and the paragraph of
`docs/architecture/settled-contracts.md:3137-3151` that implements it.  It
does not revise "THE SEAL MUST NOT CHANGE THE PHYSICS" (`:536`): that
contract moves, whole, to the export.

## 2. What was measured

Engine (all on the batch branch):

| fact | where |
|---|---|
| A record is resolved at ONE seam: nearest `constant/<sub>` walking up, else `data/standards/<sub>`, unless sealed | `src/thermo/RecordResolver.H:95-108` (local), `:157-160` (standards), `:314-333` (resolveRecord / resolveRequired) |
| `sealed` is one word of the nearest `constant/propertyManifest`; when true every catalogue read is forbidden | `RecordResolver.H:147-153`, `:296-303` |
| A component in an UNSEALED case: catalogue base, then a case-local file on top -- `overlayOf` = deep merge of the declared leaves, no `overlayOf` = every top-level key of the local file inserted OVER the catalogue base | `src/thermo/Database.cpp:111-138` (applyCaseOverlay), `:544-563` |
| A component in a SEALED case: the local file is the record, read alone | `Database.cpp:294-298` |
| Directory-scan registries (chemistry, Henry, assets, utilities): unsealed = catalogue files plus local files, a local file shadows the catalogue file of the SAME FILENAME; sealed = local only | `RecordResolver.H:496-513` |
| The manifest holds, per record: `type imported / adopted / merged`, `sha256`, `computationalSha256`, `origin`, `originSha256`, `release` (merged adds `overlaySha256`) | `tutorials/steady/flash/flash01_benzene_toluene/constant/propertyManifest`; writer `bin/choupo-import:1221` |
| The run verifies the claim once, at start: `imported` and `merged` are hashed, `adopted` never; the verdict `unsealed / verified / diverged` and the diverged names go into the result; `onDivergence refuse;` in the manifest stops the run | `src/thermo/SealCheck.cpp:47-225`, `src/result/ResultEmitter.cpp:123-132` |
| The computational hash (parsed content: comments, whitespace and unit spellings are cosmetic) already exists | `SealCheck.cpp:107-124`, `bin/choupo-import:120-130` (`choupoProps --canonical-hash`) |
| The consumption ledger records what a run asked the seam for, only when `CHOUPO_RECORD_LEDGER` is set; component asks are noted only in a sealed case; directory scans are NOT noted | `RecordResolver.H:268-287`, `Database.cpp:276`, `RecordResolver.H:496-513` (no `ledger::note`) |
| A shadowing local registry record is announced `[override]`, or `[sealed] ... mirror` when a manifest sits beside it | `src/core/RegistryScan.cpp:71-103` |
| The catalogue root is optional when a manifest exists (the relocation rescue) | `Database.cpp:54-98` |
| No binary takes a `--strict` flag today | grep of `src/applications/*/main.cpp`, `bin/runCase`: no hit |
| The browser build embeds the whole catalogue in every binary | `make/wasm.mk:75` (`--embed-file data/standards@/data/standards`) |
| The GUI download zips the case's own files and nothing else | `gui/src/case/saveCase.ts:83-122` (`buildCaseZip`) |
| A component record carries `formula` (grammar with a trailing charge) and `CAS`; a species record carries `formula` and `charge` | `src/thermo/ElementComposition.H:40-53`; `data/standards/components/Cl.dat` (`formula CL; CAS 22537-15-1`), `data/standards/species/Cl.dat` (`formula "Cl-"; charge -1`) |

Tree:

- 620 manifests under `tutorials/`, every one `sealed true`; 18 record files
  declare `overlayOf`.
- 6115 tracked copies in 615 `constant/` directories (613 top-level cases).
  Per directory: 7 hold only identical copies; 77 hold no stale copy; 538
  hold at least one stale copy.  The stale copies are 155 distinct catalogue
  records: `components/water.dat` 362 copies (87 directories are stale on
  water alone), other components 846, species 769, utilities 38, chemistry
  30, parameters 21, assets 9, adsorbents 5.
- Nine names exist in BOTH `data/standards/components/` and
  `data/standards/species/`: CH4, Cl, H, H2, N2, NO2, NO3, O2, OH.

Two consequences decide the design and are stated here because the
commission's slice list did not have them:

1. **A case cannot be half sealed.**  `sealed` is one word per manifest, and
   538 of 615 directories mix identical and stale copies.  The migration
   therefore flips a CASE, not a copy, and needs a way to keep a stale copy
   in force inside a case that already references the catalogue (section 7,
   `held`).
2. **An unsealed case does not read a full local component alone.**  It
   inserts the local keys over the catalogue base (`Database.cpp:563`).  For
   a variation that omits a block the catalogue has, the block leaks in; for
   the chloride ion kept as a component over the catalogue's atomic chlorine
   it would add an ideal-gas heat capacity and a radical's formation
   enthalpy to an ion.  Flipping `sealed` off without changing this would
   move numbers silently.

## 3. Decisions

### D1. The manifest of pins

**File.**  The same file, `constant/propertyManifest`, one per top-level
case (the nearest-manifest walk of `RecordResolver.H:124-142` already serves
a drill-in run from a sector).  A second file would be a second home for
"what this case claims about its records".

**Format.**  One entry per catalogue record the run reads, keyed by the
standards-relative path, valued by the COMPUTATIONAL hash, sorted by path:

```
propertyManifest
{
    pins
    {
        "components/benzene.dat"  5037fc4b4aad8243202d5645341749d6566ea53c1448044154178a8aa09e8d14;
        "components/toluene.dat"  2f8c57b8dae2c4ee0627618dd83a75d58315e1478559d6e4aabe5812eefec9e4;
    }
}
```

Reasons, key by key (the amplifier rule applied):

- One hash, the computational one.  A comment or a unit spelling edited in
  the catalogue then moves no pin; the 40 IDENTICAL-COMMENTS copies are the
  measured size of that saving.  The byte hash has no reader in this form.
- No `sealed false;`, no `pinSchema`, no `type pinned`: each has one value.
  A manifest holding `pins` is a referencing case; a manifest holding
  `sealed true; records {...}` is a sealed (exported) case; a manifest
  holding both is refused by name.
- No `importedAt`, `release`, `origin`: git dates an in-tree case, the
  origin of `components/benzene.dat` is `data/standards/components/benzene.dat`
  by construction, and the dev line has no release to name.
- Local records are NOT listed.  A variation declares itself in the record
  (D2); a local-only record has no catalogue counterpart to claim anything
  about.  The `adopted` type was already "never hashed"
  (`SealCheck.cpp:101-104`): a list with no reader.
- One line per pin, so a catalogue edit is a one-line diff per reached case
  and two branches collide only when both re-pin the same record of the
  same case.  (The quoted-key scalar entry is to be confirmed against
  `src/core/Dictionary.cpp:92-96` as the builder's first measurement; if the
  tokenizer refuses it, the fallback is `"<path>" { hash <h>; }`, same
  content.)

**Who writes it.**  `bin/choupo-import --pin <case>`, by OBSERVATION: it
runs the case with the consumption ledger and writes one pin per catalogue
file the run read.  Not the first run: the engine does not write under
`constant/`, and a pin is a claim somebody made deliberately.  Not the
importer's regex closure (`bin/choupo-import:375-1187`): it mirrors the
runtime by hand and has under-staged twice; the ledger cannot drift from
what the engine does.  Its known gap (a record read only on a path this run
did not take) announces itself in this design: a later read of an unpinned
record is a drift class of its own.

The ledger must first see everything.  Two holes, both measured:
component reads in an unsealed case (`Database.cpp:276` notes only when
sealed) and every file a directory scan returns (`RecordResolver.H:496-513`
notes nothing).  Each read is noted with its home (`case` or `catalogue`).

**What a run does.**  Two checks, because they need different information:

- At start, where `verifySeal` runs today: every pin is hashed against the
  catalogue file.  Classes `changed` and `vanished`.
- At the end, before the result is emitted: the set of catalogue files read
  is compared with the pins.  Class `unpinned` (read, not pinned).  A pin
  that was not read is reported at verbosity 2 and is not a drift.

The result's `seal` block keeps its place and gains two verdicts:
`pinned` (every pin holds, nothing unpinned was read) and `drifted` (with
the records, each tagged by class).  `unsealed` keeps meaning "this case
claims nothing" and stays the verdict of a case with no manifest, which
runs from the catalogue as flash01 was measured to do.

Default: ANNOUNCE, by name, on stderr and in the result -- the first-year
ruling of 2026-08-02 stands.  Refusal has two declarers and one mechanism:
the case (`onDivergence refuse;`, existing, now read for pins too) and the
caller (`CHOUPO_PINS=refuse` in the environment; `runCase --strict` is its
one command-line spelling).  An environment word rather than a flag on five
binaries because the browser wrapper and `runCase` pass arguments
differently, and `CHOUPO_RECORD_LEDGER` is the precedent at the same seam.
`bin/runTests` and CI set it in every mode: in the tree a drifted pin is a
FAIL, never a line of stderr.

**How the tree stays pinned.**  A catalogue edit is committed WITH its
re-pin: `bin/choupo-import --repin <record>` rewrites that one line in every
manifest that pins the record (a grep), then the goldens say which of those
cases moved.  `bin/runTests --record` refuses to freeze a golden from a
`drifted` run and names the command, as it refuses a closure above
tolerance (rule 4b): the re-pin is the act that says "this case now follows
the new record", and a re-record must not perform it silently.  A static
gate (D6, `check_pins_fresh`) holds `changed` and `vanished` without running
a case.

What this buys beyond the commission: `grep -l '"components/water.dat"'`
over the manifests is the exact list of cases a water edit reaches.  That is
the reach index C412 needs, and the list `bin/integrate` should plan from.

### D2. How a variation is declared

Both forms, split by what the delta IS, because the engine's deep merge can
add or change leaves but cannot replace a block whose `model` changes
(merging a NASA-9 block over a polynomial block leaves the base's
coefficients beside the new ones).

- **`overlayOf <name>;`** -- a delta file: leaves added, or leaf values
  changed inside blocks the base holds with the same model.  Components
  only (`Database.cpp:111-138` is the one implementation).  It follows the
  catalogue everywhere else, and its base is pinned like any catalogue read.
- **`variationOf <name>;`** -- a full record, read ALONE, exactly as a
  sealed case reads it today.  For a block whose model changes, for a record
  that reproduces a source as a whole, and for every record kind other than
  a component.  Frozen by construction: the catalogue record is not read
  (so it is not pinned), only compared for identity (D3).

Both carry `variationReason "<one sentence>";`, required, parsed.  The
sentence is in the headers today, where nothing can require it.  The key
lives in the RECORD, not in the manifest: it travels with the file, and a
second list in the manifest could disagree with it.

Sub-class by sub-class (counts from the audit; the (a) split is by the
audit's stated reasons and is approximate until slice 4 reads each file):

| sub-class | n | form | notes |
|---|---|---|---|
| (a) diffusion volume added (rate-based, tray-efficiency) | 36 | PROMOTE, then delete | literature values; until promoted, `overlayOf` |
| (a) isoButene formation enthalpy | 2 | PROMOTE, then delete | one measured leaf |
| (a) Lennard-Jones constants added (transport02) | 7 | `overlayOf` | additive |
| (a) flame-range heat capacity (combustion, gibbs06) | 28 | `variationOf` | block model changes; a named catalogue variant is a later curation act |
| (a) published K(T), a paper's ion data, a COSMO variant, the case's own regressed or fitted pair, per-ion permeabilities, ion transport values | ~33 | `variationOf` | the record reproduces a source |
| (b) sucrose with a `sorption` block | 13 | `overlayOf` | additive, sample-specific |
| (b) isotherms of a case's sorbent, polystyrene sample | 25 | `variationOf` | isotherms are not components |
| (c) merged at seal | 43 | `overlayOf` | the delta is recovered (slice 4) |
| (c) hand-made deltas (solvents, overlay01/02) | 22 | `overlayOf` | most already are; add the reason |
| (d) synthetic stand-ins (compA...) | 30 | `variationOf` | the catalogue's compA has another molar mass |
| (d) ion held as a component under a catalogue name | 29 | `distinctFrom` | D3 |
| (d) teaching variants, witnesses, grammar fixtures | 22 | `variationOf` | the record is the subject |
| (e) unexplained | 50 | read each | section 7, slice 5 |
| local-only | 262 | unchanged | no declaration: there is nothing to vary |

Engine change that goes with it, the one place the unsealed path moves: a
local full record is read alone when it declares `variationOf`; the
top-level insertion over the catalogue base (`Database.cpp:563`) stays only
for an UNDECLARED shadow, which is announced as such (and is a refusal under
`CHOUPO_PINS=refuse`), so a user's existing unsealed case keeps its numbers
and learns the key.  No tracked case is in that state: all 620 are sealed.

### D3. The name-collision rule

A local record whose name resolves to a catalogue record must say which of
three things it is, and the engine checks the claim against identity fields
both records carry: the parsed `formula` (atoms and charge,
`ElementComposition.H:40-53`), `charge` where the kind has it, and `CAS`.

| declaration | identity check | result |
|---|---|---|
| `overlayOf X` / `variationOf X` | no shared identity field may disagree | disagreement REFUSES, naming both formulas |
| `distinctFrom X` | at least one shared identity field must disagree | agreement REFUSES ("this is the same species: declare a variation") |
| none | compared all the same | disagreement REFUSES always; agreement is the undeclared shadow of D2 |

`distinctFrom` is read alone, like a variation, and carries
`variationReason`.  The check has ONE home, `records::checkShadow(local,
catalogue)`, called where a local file wins over a catalogue file:
`Database::loadComponent`, `resolveRecord`, `resolveRequired`,
`scanRecordDir`.  Identity is compared for components and species; other
kinds (a pair, an isotherm, an asset) have no identity field beyond their
name and take the declaration alone.

The dangerous direction is the other one -- the local ion record DELETED,
and `Cl` falling through to atomic chlorine with exit 0.  Three things stop
it, none of them a guess about intent: (i) the migration never deletes a
(d) record; (ii) the catalogue's `components/Cl.dat` is not in that case's
pins, so the read is `unpinned`, announced by name and refused in the suite;
(iii) `--pin` prints every record it ADDS to a manifest, so pinning a
radical into an electrodialysis case is a diff a reviewer reads.

Two catalogue records must be respelled for the comparison to see them:
`components/Cl.dat` (`formula CL`) and the hypochlorous acid record
(`HOCL`) carry the source's upper-case spelling, which the formula grammar
cannot read as chlorine.  A curation edit of two leaves, with their re-pin.

What this rule does not solve, and should not pretend to: the same name
meaning an ion in `species/` and a radical in `components/` is a collision
between two catalogue namespaces (nine names, listed in section 2).
`distinctFrom` makes each case honest about it; removing it needs a
component declared FROM a species, which is engine work outside C413 (open
question Q3).

### D4. Write-then-read (membrane24)

`constant/assets/NF270_FdL2021.dat` stays local and tracked: it is the
PRODUCT of the case (Properties mode writes it, `system/propsDict:126`;
Process mode reads it), it has no catalogue counterpart, and the manifest
does not claim it today.  Under this design it is an ordinary local-only
record: never pinned (a pin describes a catalogue read), never declared
(nothing to vary).  The tracked copy stays so Process mode runs without
Properties mode having run first, and the golden holds the pair together.

The rule that generalises it, held by a gate: **a path a case's own run
writes (`record "constant/..."`) may not have a catalogue record of the same
standards-relative path.**  Otherwise deleting the product would silently
resolve the catalogue's record.  `refuseStandardsWrite`
(`RecordResolver.H:222-237`) already covers the opposite direction.

The curation cases (curate02, 04-14) are different and need no exception:
their pair copy is the catalogue's record (11 of 13 identical), so it is
deleted and pinned.  If the catalogue pair is refitted, the re-pin moves
that case's "catalogue vs refit" row in a commit that names it, which is
the audit's request ("pin by sha") met by the ordinary mechanism.  curate05
and curate12 hold pairs that exist only in the case: local.

### D5. Export

An exported case is a SEALED case, in today's grammar, read by today's
engine path: copies of every pinned record under `constant/`, and a manifest
with `sealed true; records {...}`.  Not "copies plus pins": copies beside
pins would be undeclared shadows of catalogue names (D3) on the reader's
machine.

- **CLI.**  `bin/choupo-import --seal <case> --to <dir>` copies the case and
  seals the copy with the existing transaction (`bin/choupo-import:1623-2065`:
  staged, validated with the catalogue hidden, and held to the case's own
  golden by `validate_staged_agrees`, `:1470`).  "The seal must not change
  the physics" is proven there, per export.  A bare `choupo-import <case>`
  on a case that holds `pins` refuses and names `--pin` and `--seal --to`;
  on a case that holds none it seals in place as it always has.
- **GUI.**  `buildCaseZip` (`gui/src/case/saveCase.ts:83`) gains the
  materialised records.  Source: the catalogue embedded in the browser
  binaries (`make/wasm.mk:75`), read from the worker's file system for
  exactly the pinned paths -- the GUI's own catalogue globs cover
  components and three pair families only (`gui/src/case/catalogue.ts:140`,
  the pair globs at `:95-101` of their module), so they cannot serve species
  or chemistry.  The manifest it writes needs no canonical hasher in
  TypeScript: `computationalSha256` IS the pin, and `sha256` is the byte
  hash of the file it just read.  The zip is refused while the last run's
  verdict is `drifted`.  Gate: the zip of one witness equals
  `--seal --to` of the same case, file for file (in `--gui`).
- "Open Case from .zip" reads a sealed case, as now.

The GUI's lesson text that teaches the seal
(`gui/src/ui/methods/caseAssembly.ts:374-403`, `dataSourcesLesson.ts`) is
rewritten in the slice that changes the behaviour, and the records panel
shows each record with its home: `catalogue (pinned)`, `overlay of`,
`variation of`, `local`.  The engine already publishes the home per
component (`Database.cpp:320-324`).

### D6. Gates

Named gates whose subject is the seal:

| gate | becomes |
|---|---|
| `check_seal_drift` (informational: copies older than the catalogue) | `check_pins_fresh`: every pin equals the computational hash of its catalogue file; exit 1 on `changed` / `vanished`.  Static, every mode. |
| `check_sealed_corpus` (every case carries its copies) | `check_case_records`: every top-level case has a manifest; no local record is computationally identical to the catalogue record of its name (the copies may not come back); every local record with a catalogue homonym declares one of the three keys with a reason; `held` only shrinks (section 7); no run-written path has a catalogue homonym (D4).  The live-overlay exemption disappears: an overlay case is pinned like any other. |
| `check_seal_verdict` | keeps its five probes on a fixture it seals itself with `--seal --to` (its base, utility01, will no longer be sealed in the tree); gains PINNED, DRIFTED-changed, DRIFTED-unpinned, REFUSE by environment, and "pins and sealed together refuse". |
| `check_seal_schema` | unchanged in claim; fixture sealed by export.  `migrate_seal_schema.py` has no in-tree subject left and is retired with the migration. |
| `check_seal_growth` | already builds its own sealed mini case: stays as the export's growth test; gains the pin form of (b): a `$variable` that reaches a new species is `unpinned` until `--pin`. |
| `check_registry_scan` | the `[sealed] ... mirror` wording (`RegistryScan.cpp:71-103`) is kept for sealed cases; a declared variation is announced as one, an undeclared shadow as one. |

New: `check_shadow_identity` (D3: the six sabotages -- ion over radical
undeclared, declared variation with another formula, `distinctFrom` on the
same species, missing reason, deleted (d) record under strict, a pin added
for a homonym).

Gates and tools that READ case copies without being about the seal -- 49
`check_*.py` name a `constant/<kind>/` path, 5 of them a specific tutorial's
record, and ten walk `tutorials/**/constant` (`check_asset_homes`,
`check_electrolyte_sidecars`, `check_no_unit_chemistry`, `check_ion_pins`,
`check_provenance_home`, `check_regressed_pairs`, `debt_registry`,
`add_tutorial_headers`, `migrate_thermoPhysProp`, `migrate_seal_schema`),
plus the record-content gates that judge every tracked record
(`check_review_status`, `check_source_licence`, `check_record_law_values`,
`check_record_primitives`, `check_duplicate_keys`, `check_legacy_schema`,
`check_variant_same_values`, `check_water_one_home`,
`check_property_route_bench`).  One rule for all of them:

- a gate that judges RECORDS keeps walking what is tracked; it now sees the
  catalogue once and the ~630 local records, and any count it pins in its
  claim line is re-observed in the slice that moves it;
- a gate that reads ONE case's record by path (the pattern "parsed from the
  case's own sealed record", e.g. `bin/runTests:4313`, `:6533`, `:6581`,
  `:6632`) asks one helper, `bin/curate/case_records.py:record_path(case,
  sub)` -- local file, else the catalogue file -- the Python face of the
  resolver.  Slice 0 lands the helper and converts the callers BEFORE any
  copy is deleted, so slice 2 finds no gate reading a file that is gone.

Three tools outside the gates must change in slice 0 or they will lie:

- `bin/curate/suite_reuse.py` (C394): a case's reuse key must include the
  hash of every catalogue file it pins.  Today the copies are in the case,
  so the case's files are the key; after C413 a water edit changes the
  result and none of the case's files until the re-pin.
- `bin/integrate`: a change under `data/standards/<sub>` reaches the cases
  that pin `<sub>`.
- `bin/curate/reclaim_sealed_record.py`, `seal_reference_records.py`:
  retired or repointed at `--pin`; decided when read in slice 0.

### D8. What is NOT changed

- **The precedence order**, `inline / case-local / snapshot > standards >
  local > idealDefault`.  It already does the right thing: flash01 with its
  copies and manifest deleted was measured by the coordinator to run from
  the catalogue with exit 0.  C413 adds no tier and reorders none.
- **The sealed path of the engine**: `sealed true` still forbids the
  catalogue, `verifySeal` still verifies, the relocation rescue still
  holds.  It now serves exports and any user who wants a frozen case.
- **`overlayOf`** as implemented, apart from the required reason.
- **`data/local`**: still the private gap-filling tier, still announced
  `[local] UNVERIFIED`, never pinned (a pin names a public catalogue record;
  the public tree ships the tier empty).
- **`components/` flat, exact-name lookup**, and the rule that the engine
  never writes the catalogue.
- **Local-only records** (262), **the consumption ledger's opt-in file**,
  **the importer's fail-closed transaction** for a seal.

## 4. Documents this revises (rule 4d: same slices as the behaviour)

`docs/architecture/settled-contracts.md` (the self-contained paragraph at
`:3137`; a pointer at `:536` that the contract now binds the export),
`CLAUDE.md` section 7 (two sentences on pins beside the precedence line),
`docs/ai/data-doctrine.md`, `docs/ai/case-layout.md`, `docs/ai/pitfalls.md`,
the Tutorials Guide's case-anatomy section, the README of
`constant/propertyManifest` written by the importer, the GUI lesson named in
D5, `BRAIN.md` (FACTS counts regenerate; one row in WHAT CHANGED LAST).

## 5. Risks

| risk | held by |
|---|---|
| An unsealed run reads MORE than the sealed one did (a Henry pair or a chemistry record the catalogue gained since the seal) | slice 2's byte-identical proof per case; such a case does not flip in slice 2 and is listed |
| The observation misses a record read on a path the pinning run did not take | `unpinned` at the run that takes it; strict in the suite |
| 5500 deletions and 613 manifests in one landing collide with every open branch | the freeze (C414): nothing else is open; the slice is generated by a script that is re-run on the merge, never merged by hand |
| A gate silently judges fewer files and stays green | D6: claim lines re-observed in the same slice; the helper lands first |
| The download leaves the browser without its records | the zip gate; refusal on `drifted` |

## 6. Slice 0 and 1 -- the mechanism (no case moves)

**Slice 0, tools (no engine change).**  `case_records.py` and the
conversion of the gates that read one case's record by path;
`suite_reuse.py` keyed on pins; `bin/integrate` reach.  Runs: `--gui` is
not reached; each converted gate with `--only`; `--fast`.  Expected moved
rows: none.

**Slice 1, engine and importer.**  The ledger sees every read; `pins`
parsed and verified (start and end); verdicts `pinned` / `drifted`;
`CHOUPO_PINS`; `variationOf`, `distinctFrom`, `variationReason`,
`checkShadow`; `held` (section 7); `--pin`, `--repin`, `--seal --to`;
`check_pins_fresh`, `check_case_records` (in its transitional form),
`check_shadow_identity`, the new probes of `check_seal_verdict`; the two
formula respellings; the record schemas (`gui/schemas/records/`) accept the
three keys.  ONE witness flips: flash01, whose two copies are deleted and
pinned, with its output compared byte for byte against the sealed run of
the same commit, the `seal` block apart.

Every other case is still sealed and meets none of the new conditions, so
the evidence for "no case moved" is rule 4c's: byte-identical results on
the witnesses, not a sweep.  Runs: build; the seal gates; `--fast`; `--gui`
(the lesson cites `Database.cpp` by line, and lines move); the batch's one
sweep at the end.  Expected moved rows: flash01's verdict row if a golden
pins `seal.verdict` (to be measured first; if it does, 613 such rows move
in slice 2, one reason for all).

## 7. Migration

The unit is the case.  A case flips in ONE step from `sealed true; records`
to `pins`, and at that step each of its copies takes one of four fates:

- identical (3433): deleted, pinned;
- variation or local-only (602): kept; declared where it has a homonym;
- stale (2080): kept IN FORCE and listed in the manifest under
  `held { "<path>" <hash of the copy>; }`.

`held` is the transitional block that consequence 1 of section 2 requires.
A held copy is read alone, announced `[held] <path>: catalogue copy older
than the catalogue`, and verified against its own hash.  No record file is
edited to mark it, so its bytes -- and the case's numbers -- are provably
those of the sealed run.  `check_case_records` counts held entries and lets
the count only fall; when it reaches zero the grammar is removed and `held`
is refused.  It is debt with a number (2080 stale copies, plus the variations until slice 4) instead of drift nobody saw.

**Slice 2 -- flip every case; delete the identical copies.**  A script, per
case: write `pins` from an observed run, delete identical copies, write
`held`, drop `records`.  Proof per case: the result is byte-identical to
the sealed run, the `seal` block apart.  A case that is not (section 5,
first risk) stays sealed and is listed with the record that differs.
Size: 613 manifests rewritten, about 3433 files deleted, no golden value
moved.  Runs: this IS a change to the resolution path of every case, so it
takes the full sweep, launched after `--fast`, with that sentence as its
written reason; it is the batch's one sweep.  Slice 2 edits NO record file:
a variation that has a catalogue homonym (about 340) is also listed under
`held`, read alone as the sealed run read it, and leaves `held` in slice 4
when it gains its declaration.  The count therefore starts near 2420.

**Slice 3 -- re-point the stale copies, by record.**  For each record:
delete the held copies, `--repin`, run the cases that held it; most stay
byte-identical (the changed block is not read) and the ones that move are
re-recorded with the record's reason in the commit.  Batches:

| batch | records | copies | expected movement |
|---|---|---|---|
| 3a water | 1 | 362 | the saturation-pressure law of 2026-11-16: every case reading water's vapour pressure near its window edges; 87 directories become free of held copies |
| 3b species | 59 | 769 | the diffusivities read at their pages (C403: two values corrected by 4-6 %): membrane and electrodialysis cases; speciation cases only where a formation value was re-read |
| 3c other components | 76 | 846 | per record; ethanol 92, N2 82, CO2 68, benzene 59, H2 48 first |
| 3d the rest | 19 | 103 | utilities 38, chemistry 30, parameters 21, assets 9, adsorbents 5 |

Each batch names its moved rows per record in the commit (rule 00: the list
and the reason are written).  A case that carries an `anchor` row (25
cases) is re-pointed only with its anchor re-read: if the anchor is met
with the catalogue record, re-point; if it is met only with the old value,
the copy becomes a `variationOf` with that reason, and the catalogue record
gets a review row.  Runs: per batch, the cases that held the record
(`--scope`, which carries the conservation gates) -- the reach is exact,
it is the list of manifests; C412's representatives replace the full list
once C412 exists.  No full sweep per batch: one at the end of slice 3.

**Slice 4 -- declare the variations; re-express the overlays.**  (a), (b),
(d) per the table in D2: add the key and the reason to about 250 record
files, hold each case byte-identical.  (c): the 43 `merged` records become
delta files; the delta is recovered from the pre-seal overlay in git
history (the manifest's `overlaySha256` identifies the blob) or, failing
that, as the top-level difference from the catalogue blob named by
`originSha256`.  The base then is today's catalogue, not the one at seal,
so a merged record whose base has since moved is a re-point as well and
moves with slice 3's reasons.  The 22 hand-made deltas gain the reason.
Size: about 315 record files.  Runs: the cases touched, `--scope`.

**Slice 5 -- read the (e) records.**  50 copies in 39 directories, each
read against the catalogue record: legacy grammar or an older vintage with
equal numbers is re-pointed; a different number is either a variation with
its reason or a correction owed to the catalogue.  A reading task, sized as
one: no script decides these.

**Slice 6 -- promote.**  Curation acts, each with its source read at the
page (the standing rule): the Fuller diffusion volumes (4 records, 36
copies), isoButene's formation enthalpy (2), then the audit's local-only
candidates in the order a second case needs them.  The ionic-component
shims (61 local-only, 29 colliding) wait for Q3.  Each promotion deletes
the copies it replaces and pins the record.

**Slice 7 -- close.**  `held` empty and its grammar removed;
`migrate_seal_schema.py` retired; documents of section 4 final; guides
rebuilt; one full sweep with every closure named.

Expected end state: about 5500 files gone from `tutorials/`, about 630
local records each either declared or absent from the catalogue, 613
manifests of one line per record, and a catalogue edit that costs one line
per case it reaches.

## 8. Open questions

- **Q1. `data/curation/`.**  `check_seal_drift` walks its manifests too
  (since C295) and the audit covered `tutorials/` only.  Same treatment
  assumed; its copies must be classified before slice 2 includes them.
- **Q2. The golden and the verdict.**  Whether any golden pins
  `seal.verdict`; decides if slice 2 moves 613 rows or none.
- **Q3. Ions as components.**  `distinctFrom` makes 29 records honest; the
  clean end is a component declared from a species, so the name `Cl` in a
  membrane case IS `species/Cl.dat`.  Engine work, after the freeze.
- **Q4. More read at run than sealed.**  How many cases the first risk of
  section 5 catches is unknown until slice 2's script runs; each is a
  finding about a catalogue record that arrived after the case was sealed.
- **Q5. One writer of the sealed manifest.**  D5 gives the GUI a small
  second writer held equal to the importer's by a gate.  Moving both into
  the engine (materialise from the observed ledger) would leave one, and
  would let the 800-line regex closure retire; not needed for C413.
- **Q6. The quoted-key scalar** in `pins` (D1): one measurement.
- **Q7. Undeclared shadows in users' cases** are announced, and refused only
  under strict.  Whether a later release refuses them outright is a
  backwards-compatibility decision to take with a release, not here.

## 9. As built -- slices 0 and 1 (2026-11-16, branch c413/pins)

What was built is the section 6 mechanism, with the deviations the build
forced.  Each is a measurement, not a preference.

1. **Pins are what the run CONSUMED, plus the ABSENCES that could change a
   resolution (round 2, ruling PN-02).**  Measured on flash01: the run parses 562
   catalogue files (486 Henry pairs, 35 assets, 13 solution pairs, 10 utilities,
   15 adsorption equilibria, 2 components, 1 chemistry record) because the
   registries load whole directories, but it uses a handful.  A first build
   pinned each scanned directory by a hash (10 lines); that made one Henry edit
   reach every case, the cascade C413 removes, and the form is DELETED.  Now the
   engine (`PinCheck.cpp`, one home) applies the relevance rule to what was
   parsed: a Henry or solution pair `A-B` is consumed when A and B are both
   loaded components; an asset or utility when the case's text names it; an
   adsorption equilibrium when its adsorbent is named and its species loaded;
   every record outside those scanned directories when parsed (read by name).
   For the pair directories, every ordered pair of loaded components that does
   NOT exist is pinned `absent`, so adding it later is `appeared`.  The same
   function computes the end check and the importer's proposal (`@ pin` lines of
   the ledger), so they cannot drift.  flash01's manifest is 7 lines.  Cost to
   decide before slice 2: absences grow with n(n-1) per directory in the number
   of loaded components (ed cases with three species: 12 lines; a plant with
   thirty species: 1740).  An unrelated Henry edit leaves flash01 `pinned`; a
   benzene-toluene pair that arrives, or a benzene edit, is a drift
   (`check_shadow_identity`).
2. **The ledger notes at `Dictionary::fromFile`, not at the resolver seam.**
   Fifteen registries scan `data/standards/` directly; a read log at the seam
   would still be a subset.  `core/ReadLog.H` is the one note; a hash or an
   identity comparison pauses it (`readlog::Pause`).  The ledger file gains
   `@ catalogue <sub>` / `@ case <sub>` lines; the importer's reader ignores
   every line that does not start with `- `.
3. **Pin values are quoted** (`"<hash>"`): a hash of digits only parses as a
   number.  Q6 is answered: the quoted-key scalar entry parses.
4. **flash01's copies were stale**, not identical (the catalogue's benzene and
   toluene gained blocks since the seal), so the record's rule would have put
   them under `held`.  The witness was flipped with `--repoint` (delete the
   stale copy, follow the catalogue) as the brief asked: every number and
   every written file is byte-identical, and eight stdout lines differ
   because they name the record's HOME (`sealed case copy ...` becomes
   `catalogue data/standards/...`) and the package identity.  The held form
   (`--pin --from-sealed` without `--repoint`) is byte-identical to the
   sealed run apart from the seal block and two `[held]` lines, which is the
   proof slice 2 will use: a held copy is labelled as the sealed copy it was.
5. **`check_seal_drift` and `check_sealed_corpus` are kept, not renamed.**
   610 cases are still sealed and those gates still judge them; the pin-form
   gates are new beside them (`check_pins_fresh`, `check_case_records`,
   `check_shadow_identity`).  Slice 2 retires the old ones when the last copy
   goes.  `check_seal_verdict` gained the pin probes.
6. **Announcements, and where the refusal binds.**  D3 says an undeclared
   shadow that disagrees on identity "refuses always".  Built: it refuses for a
   case that holds `pins`; for a legacy UNSEALED case it is ANNOUNCED
   (`[shadow] ... DIFFERENT species ... declare distinctFrom`), because the
   gates that copy a sealed ion case out without its manifest
   (`check_unit_acceptance` ran four such probes) and the unsealed demos
   (overlay02, solvent02, solvent03) are exactly the cases that carry the
   undeclared record, and refusing them before slice 4 declares the 29 ion
   records would move numbers' availability, not numbers.  A declaration the
   identity CONTRADICTS (`variationOf` with another formula, `distinctFrom` on
   the same species) refuses always: it is new grammar with no legacy.  A
   missing `variationReason` is announced only for a case that holds `pins`.
   Strict (`CHOUPO_PINS=refuse`) binds only a case that holds `pins`.  The
   switch to "refuses always" is a one-line change when slice 4 lands.
7. **`held` is a ceiling in `check_case_records` (`HELD_CEILING`, 0 today)**,
   lowered by whoever re-points a held copy.
8. **The gates that copy a witness for a probe** (`check_record_law_pins`
   copied flash01 and rewrote its benzene record) drop a manifest that holds
   `pins`: the probe is the unsealed case it behaves as without it.
9. **The GUI lesson `caseAssembly`** (which walks flash01's files) was rewritten
   for the pin form in the same slice, as D5 required.
10. **Not built here, by the brief:** slice 2 (the 613 flips), the GUI export
    (`buildCaseZip`), the WASM rebuild.  The browser build is stale: an old
    engine meets a `pins` manifest as an unclaimed manifest and runs from the
    embedded catalogue (verdict `unsealed`).

### Round 2 (review PN, rulings of 2026-11-16)

PN-01: `--repin` locates the `pins {}` block on the comment-masked text (it used
the first occurrence of the word, which is in the header comment) and handles
`absent`.  PN-02: above.  PN-03: the manifest walk is cached per working
directory, the shadow rule runs once per (record, file), the catalogue identity
is parsed once; edbatch01 sealed 2.65 s against main's 2.70 s, pinned 2.66 s, and
the getcwd count equals main's.  PN-04: the three pin gates run before any mode
branches in `bin/runTests`; flash01 is in FASTSET; a case refused by its pins
prints the pin's `ERROR:` line instead of "crashed/aborted"; CHOUPO_PINS=refuse
is set for the cases the suite runs, not for the gates (a gate that makes an
unsealed fixture out of a sealed ion case tests something else).  PN-05:
`--pin` refuses a local homonym that is neither deleted, held nor declared.
PN-06: a held copy is identity-checked; the held announcement no longer says
"older than the catalogue"; an unsealed case under CHOUPO_PINS=refuse refuses an
identity-disagreeing shadow.  PN-07: a record that does not parse is refused,
never hashed as empty; "the run CONTINUES" is not printed under strict.
