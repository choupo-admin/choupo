# HANDOFF — migrating `initial{}` / `inlet{}` to `0/` in the dynamic cases (NO legacy)

**Vitor's mandate (2026-07-16, FURIOUS — do not relitigate):** state lives
ALWAYS in `0/`, one format, ZERO exceptions, ZERO legacy / dual-reader.  The
INLINE `initial{}` (holdup) and `inlet{}` (stream) blocks in the dynamic cases'
`flowsheetDict` were the exception that confuses students (some cases have
`0/`, the dynamic ones did not).  It is the dynamic twin of the
`streams{}` -> `0/` migration already done on the steady side.

**STATUS: CLOSED.  Phase A (ctrl, 9 cases) and Phase B (batch, 33 cases) are
both done and green; both binaries hard-refuse an inline block.**  What remains
is a short list of optional follow-ups at the end, none of them blocking.

> Read the "what the unit code still does" note below before filing a bug: the
> units still call `subDict("initial")` / `subDict("inlet")` **by design** —
> that is the injection target, not surviving legacy.  Mistaking one for the
> other cost a wrong entry on a release-readiness list once already.

## The problem, as it stood
- `src/unitOperations/dynamic/DynamicCSTR.cpp` read `unitDict->subDict("initial")`
  (T, P, V, totalMoles, composition = holdup) and `subDict("inlet")`
  (F, T, composition).  Likewise `BatchReactor`, `BatchStill`.
- The `0/internalState` + `0/streams` that ctrl03 carried were **written
  OUTPUT** (a t = 0 snapshot via `solutionControl { write true; }`), NOT input.
  All 42 dynamic cases read inline.
- **42 cases**: 9 `ctrl/` + 33 `batch/` with an inline `initial{}`.

## Target format for the dynamic `0/` (what the engine ALREADY writes — reused)
- **`0/internalState`** = holdup per unit: `time 0; application <ctrl|batch>;
  units { <unit> { n_i [kmol], T, V, ... } }`.
- **`0/streamFaces`** = faces: `time 0; streams { "<unit>.<face>" { bc inlet;
  F, T, P, molarFlows{...} } ... }` (the inlet face carries `bc inlet`).

## What the unit code still does, and why that is correct
The low-risk route chosen (and executed) was **INJECTION at the orchestrator**,
not rewriting three units' `initialise()`.  Before its init loop, `choupoCtrl` /
`choupoBatch` reads `0/internalState` + `0/streamFaces`, TRANSLATES them into
`initial{}` / `inlet{}` dicts and injects those into the unit dict.  The unit
code is UNCHANGED — `DynamicCSTR::initialise` still reads `subDict("initial")`,
and that is the interface the injection writes to.

The mandate is enforced where it must be, on the CASE format: a `flowsheetDict`
still carrying an inline block is REFUSED by name, in both binaries, with the
remedy (`choupoCtrl: unit '<u>' carries an inline initial{}/inlet{} block --
the initial holdup and inlet live in 0/internalState + 0/streamFaces
(bin/choupo-init0 materialises them).  Delete the inline block from
flowsheetDict.`).  Zero dual-reader.  `start steadyState` remains (a computed
seed, reading the feed from `0/streamFaces`).

## PHASE A (ctrl, 9 cases): DONE, GREEN
`choupoCtrl` injects `initial{}` / `inlet{}` from `0/internalState` +
`0/streamFaces` and refuses inline.  Migrator: `bin/curate/migrate_dyn0.py`.

- **BUG found + fixed (the writer was overwriting the AUTHORED `0/`):** the 4
  cases with `solutionControl { write true; }` (ctrl03_startup, 05, 06, 08) had
  their `0/internalState` in the engine's WRITER format (`holdupMolar` +
  `extras{F_in, z_in, T_jacket}`, with NO `V`) — because `SolutionWriter` wrote
  the t = 0 instant ON TOP of the authored `0/`, and the snapshot did not
  populate `V` (`u.V == 0` -> the line was omitted).  On the next run the seed
  read that `V`-less `0/` and blew up in `lookupScalar("V")`
  ("Dictionary 'reactor': missing V").
- **Fix:** `SolutionWriter` NEVER writes the `0/` directory (it is the authored
  input, the single source) — guard `if (solWriter && std::abs(t) > 1e-9)` in
  `choupoCtrl/main.cpp`; physical snapshots only at t > 0 (50/, 100/, ...).  The
  4 `0/` files were re-migrated to the V-form (`T, P, V, holdupMolar`), uniform
  with the other 5.

## PHASE B (batch, 33 cases): DONE + PUSHED 2026-07-16 (`dcd74dac3`)
Solved by **VERBATIM relocation** (not canonicalisation — canonicalising is
what broke 16 cases on the first attempt): each holdup vessel's whole
`initial{}` block moves as-is into `0/internalState units{<name>}`, and
`choupoBatch` re-injects it verbatim (zero value translation).  27 cases
migrated (reactor / still / crystalliser / accumulator / adsorber, single and
multi-vessel including still06 with 7 vessels).

The 6 `fixedBedAdsorber` cases were NOT touched: their `initial{}` is
`operation.initial` (the bed's Y-profile = an operating parameter) and the
spatial state already lives in `0/bed.profile`.  The writer guard is replicated
in `choupoBatch`.  Hard inline refusal.  Corpus **280/0**.  The 42 dynamic
holdup cases (33 batch + 9 ctrl) read their initial state from `0/` — one rule,
zero exceptions.

## OPTIONAL follow-ups (non-blocking; for Vitor)
- **Format:** ctrl uses `holdupMolar` (canonicalised); batch uses verbatim
  (`totalMoles` + `molarComposition`).  Both correct, but not identical.  If you
  want ONE format, the simplest and safest is to move ctrl to verbatim too (less
  risk than the reverse).  Not urgent.
- **doctrine-gate:** the runtime inline refusal (in both binaries) already
  guarantees "no legacy" more strongly than a grep gate would; a
  `check_doctrine.py` gate would have to distinguish a unit-level `initial{}`
  from the beds' `operation.initial`, and was left out rather than risk false
  positives.
- **Writer-clobber guard:** move the `abs(t) > 1e-9` guard from the two
  `main.cpp` files INTO `SolutionWriter` (never write `timeName == "0"`), so
  both binaries are protected DRY.  Check it does not affect the authored
  `0/bed.profile` files.

## HISTORICAL — the Phase B survey (2026-07-16, before execution)
Kept because it records why the first, generic attempt failed.  33 batch cases,
5 subcategories, 6 unit types.  **Only 2 forms of initial state**, but with
edges that needed deciding before coding:

**Form 1 — a holdup cell** (`T, [P], V, totalMoles, molarComposition`):
batchReactor (batch01-08 except 05, ignition01/02, nox01, recipe02),
batchCrystalliser (batch05), batchStill (still01-06 + recipes),
batchAccumulator (still03-06, recipe04).  ~26 cases.  Edges:
  - **P omitted** = a RESULT (adsorber): do not force P; the injector computes
    and announces it.
  - **An EMPTY accumulator** (`totalMoles 0.0`, no molarComposition):
    `holdupMolar` ends up empty; the accumulator's `initialise` must accept an
    empty bed/vessel.
  - **batchAdsorber (batch09-12)**: a GAS holdup (T, V, totalMoles,
    molarComposition, P-as-result) plus an optional `initialLoading{}` (mol/kg
    on the adsorbent) — a second state field, today commented out / defaulted
    to 0.  If a case ever uses it, it must go into `0/`.

**Form 2 — a spatial bed** (`fixedBedAdsorber`, batch13-18): these already have
`0/bed.profile` / `0/ergun.profile` committed = the bed's initial spatial
profile (authored input, ALREADY in `0/`).  The inline
`initial{ molarComposition }` is only the initial gas.

**Multi-vessel / recipes** (recipe01/03/04, still03-06): 2-7 units.  The first
migrator only caught the first unit (a `re.search` for the first name/type) — it
has to iterate all of them and write one `units{ <u> {...} }` entry per vessel.
`chargeFrom` / `recipe` loads vessels AFTER t = 0 (that is not initial state; it
stays in the flowsheetDict recipe).  **This is what broke 16 cases in the
generic attempt.**

## Notes
- ctrl09 is a `dynamicCSTR`: holdup `initial{ T V totalMoles molarComposition }`,
  inlet `inlet{ F T molarComposition }` -> mapped to `0/internalState` +
  `0/streamFaces`.
- A batch (closed) vessel has NO outlet face -> `internalState` only, with no
  `bc inlet` beyond the initial charge.
- Standing constraints: no legacy, no exceptions; identity
  `Vitor Geraldes <talentgroundlda@gmail.com>`; a green corpus at every phase;
  NEVER leave the 42 broken between phases (migrate engine + cases in the SAME
  step, or use a temporary gate — but the end target is zero legacy).
