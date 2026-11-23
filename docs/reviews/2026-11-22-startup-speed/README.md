# Start-up speed (C473 f, branch `startup-speed`, 2026-11-22)

Question: a student waits for process start-up on every run (browser and command line).  callgrind on
`nox03_millerbowman_large` (fair-timing README) put it at ~470 M instructions, 34 % of a whole seulex run.

## Profile before (this tree, base 3655702cc, endTime 1e-9, callgrind, Ir)

| case | start-up Ir |
|---|---|
| nox03 (choupoBatch) | 417.5 M |
| ignition01 (choupoBatch) | 213.1 M |
| flash01 (choupoSolve) | 219.7 M |

Split on nox03: `Dictionary::fromFile` 195 M (825 opens, 750 distinct files, ~112 opened 2-4 times); of it
`HenrysLawRegistry::loadFrom` 92 M (486 files, 22 %); `computationalHash` 73 M (`verifyPinsStart` 36.8 M +
`finalizePins` 36.1 M, 57 records each: parse + canonical dump + SHA-256); thermo build 74 M (component parses).

## What changed, start-up Ir after each item (cumulative)

| step | nox03 | ignition01 | flash01 |
|---|---|---|---|
| base | 417.5 M | 213.1 M | 219.7 M |
| 1. pin-hash cache (`core/DictCanonical.cpp` `sha256OfFile`, keyed on path + size + mtime, mutex) | 379.6 M | 200.1 M | 213.9 M |
| 3a. tokenizer: word-class table, `readToken` one copy, `fromFile` one buffered read | 360.2 M | 185.8 M | 197.9 M |
| 3b. tokenizer: whitespace/comment skipping on local cursor + `memchr`, `Dictionary::insert` one lookup | 340.0 M | 171.1 M | 180.9 M |
| 2. Henry registry loads the WHOLE registry on first use (`thermo/henrysLaw/HenrysLawRegistry.cpp`) | 254.5 M | 87.5 M | 97.4 M |

Wall time, best of 9, full case, `choupoBatch`/`choupoSolve`, laptop load ~2-3:
nox03 seulex 0.127 -> 0.119 s; ignition01 0.078 -> 0.056 s; flash01 0.039 -> 0.022 s; process03_recycle 0.539 -> 0.500 s.

## Rulings and why (architect, 2026-11-22)

* Pin hash cache: allowed, nothing printed or pinned changes.
* Henry registry lazy: accepted WITH the ledger change.  The consumption ledger records what a run READ for
  its answer; a case that asks for no Henry constant no longer lists the 486 Henry files (`@ catalogue` lines).
  Catalogue integrity (every Henry file parses, no two claim a pair) is held by `check_registry_scan` (the real
  registry through a Henry-using case, arms (a) duplicate, (h) malformed, (e) identity sweep), not by every run.
  Whole registry on first use, so byPair's "Loaded: ..." listing is unchanged whenever Henry is used.
  `loadFrom` still records the data root, the seal state and the case-local directories while the working
  directory is the case's; `has`/`byPair`/`availableNames` load behind an atomic flag + mutex.
* Parser: identical Dictionary for every file.

## Fix round (review of bfb12f738)

* A failed Henry load keeps its `exception_ptr` and rethrows it without re-scanning the 486 files.
* A case that names a solvent or solute (raw-text superset on its thermoPhysPropDict, flowsheetDict, solverDict, the
  case tree and the six levels above) reads the registry in `loadFrom`, where it always did; the
  `ThermoPackage::applySolution` hook (`HenrysLawRegistry::ensureLoaded`) is the backstop.  First attempt, the hook
  alone, was measured and rejected: inside a `gridSweep` the refusal was swallowed as 9 failed passes.  Now a malformed
  catalogue Henry record gives the SAME full output (banner aside), message and exit code (2) as before at
  verbosity 0 and 3, and a `gridSweep` over a Henry case stops with the named message.
* Start-up Ir after the fix: nox03 257.4 M, ignition01 88.2 M, flash01 97.8 M (the predicate costs ~3 M).
* Ledger: `@ catalogue` lines of 342 cases lose exactly the 486 Henry files (was 412: 70 more cases name a solvent);
  `- `, `@ pin` and other lines 0 moved.
* Parser: text-mode `ifstream` (CRLF as before), `std::array` tables, no raw `new`.  sha cache key: absolute path +
  size + mtime + st_ino + st_ctim (POSIX), the parse still names the path as given; thread-safety comment corrected
  (`Dictionary::parseTime_` is a static non-atomic flag, so the claim covers the cache only).
* `bytecompare.py` now normalises the engine's own commit stamp (banner, citation block).  Byte identity retaken:
  666 cases, 44104 files, **0 moved** (base vs after).  `gui/tests/letdown` and `oneFluxManyUnits` citations re-pointed
  (ThermoPackage.cpp +5 lines) and both vitest files pass.

## Evidence (first round)

* Byte identity, whole shipped corpus (`../2026-11-22-fair-timing/bytecompare.py all`): 666 cases, 44091 files
  (stdout, stderr, exit code, every written file), base vs base-again 0 moved (the harness is deterministic),
  base vs after **0 moved**.
* Parser: `parsedump` (canonical dump + dims + unit words + names + sources + the exact error text) over 54 474
  files (every data/ and tutorials/ record, `system/`, `constant/`, `0/`, plus 13 synthetic edge files: escapes,
  comments, CR LF, empty, unterminated string/comment/brace, bad bracket set, duplicate key, bad unit, UTF-8):
  198 MB of dump, old vs new library **identical**, 288 refusals identical to the character.
* Ledger (`ledgercompare.py`, `CHOUPO_RECORD_LEDGER` on every case): 666 cases; `- `/`+ ` lines moved 0,
  `@ pin` lines moved 0, other lines moved 0; `@ catalogue` lines moved on 412 cases, each exactly 486 FEWER
  (the Henry directory), none more.  Readers of the ledger: only `bin/choupo-import` (`@ pin`, `- ` lines) and
  `check_seal_growth` (`- ` lines); nothing reads `@ catalogue`.
* Gates: `bin/runTests --fast` 88 PASS / 0 FAIL; check_pins_fresh, check_case_records, check_std_includes,
  check_wasm_dialect, check_duplicate_keys, `repoint_lesson_citations --check` (475 current) OK;
  `check_registry_scan` updated (see below) OK.
* Sabotage of the new arms: pointing arms (a) and (h) at a case that asks for no Henry constant (the engine
  then does not load the registry) makes (a), (d) and (h) FAIL ("the case RAN").

## check_registry_scan changes

Arms (a) and (d) used flash01, which asks for no Henry constant and therefore no longer loads the registry; they
now use `flash08_co2_water_package`.  (d) removes that case's `propertyManifest` first (a manifest turns the
announcement into the `[sealed]` mirror note, and every Henry-using tutorial has one).  New arm (h): a
malformed Henry record is refused by a Henry-using run.

## Not done

* The parse is still ~40 % of what is left (components 64 M, pins 33 M + caseWords 13 M, `catalogueSubOf`
  `weakly_canonical` per read path); a parse cache returning copies was not built (a copy is not much cheaper
  than the tokenize and every caller mutates).
* WASM not rebuilt here (`check_wasm_dialect` and `check_std_includes` pass; `std::mutex`/`std::atomic` are used
  single-threaded there).
* No full sweep (reason: the change reaches only start-up and byte identity on the whole corpus shows nothing moved).
