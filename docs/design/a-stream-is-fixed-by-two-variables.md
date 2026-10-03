# A stream is fixed by two variables

**2026-10-03.**  Vítor's rule, stated on the landing case
`flash01_benzene_toluene` on 2026-10-01 and built on his standing mandate of
2026-10-03 (DEV.md §4c): *"Se especificas fração de vapor não podes
especificar uma das outras variáveis na corrente de entrada!  Como se torna
isto claro para os alunos?!"*

Every number below was produced by a command on this branch, and the command
is named.  The engine measured is the one built from this commit's source
unless stated.

---

## 1. The rule, in one sentence

By Duhem's theorem a stream of known component flows has **two** intensive
degrees of freedom.  For a **mixture**, `T` and `P` already fix the vapour
fraction, so a `vaporFraction` declared beside them is a third number on a
two-variable state: redundant when it agrees with the `(T, P)` flash and a
contradiction when it does not.  The engine now **refuses** it by name.  The
one exception is a **pure component** in two phases, whose `(T, P)` sit on its
saturation curve and genuinely do not fix the split — there `vaporFraction q`
stays the pin, and that is the only place the old writer comment *"T,P alone
do not fix the split"* was ever true.

## 2. The three defects, as measured on 2026-10-03 against `origin/main`

Scratch copies of flash01, run with `CHOUPO_HOME=<tree> choupoSolve`:

| file | exit | stream table `feed vf` | JSON `feed.H_kW` | report `H_feeds_kW` |
|---|---|---|---|---|
| as shipped (T, P, `vaporFraction 0.3039835731`) | 0 | 0.304 | 1325.78 | 1325.78 |
| `vaporFraction 0.9` | 0 | **0.900** | 1325.78 | 1325.78 |
| line removed | 0 | **0.000** | **1050.19** | 1325.78 |

1. **The WRITER** (`src/streams/StreamStateIO.cpp`, the T/P/phase block of
   `writeStreamState`) emitted `vaporFraction` for every `0 < vf < 1`, so every
   `converged/` view and every `choupo-init0` seed re-created the
   over-specification.  Measured on the tracked tree: **142** `0/` files under
   `tutorials/` declared `vaporFraction`; all 142 also declared `T` and `P`;
   **140** were mixtures (more than one non-zero component) and **2** pure
   (condenser01's condensate, reboiler_water_copper's wet vapour); **135**
   carried `0 < q < 1` and **7** exactly 0 or 1; **52 cases** in all (72 files
   under `steady/`, 70 under `plant/`).  Every stream of ammoniaStaged01–04
   carried one and the same `0.4889377827`, every stream of evaporator03 the
   same `0.3055`: the writer stamped one propagated value across a seed.
2. **The READER** (`StreamStateIO.cpp`, the THERMODYNAMIC STATE block of
   `readStreamState`) accepted all three in silence although the header
   (`StreamStateIO.H`) promised *"THREE top-level state vars over-specify ->
   FATAL"*.  With `vaporFraction 0.9` the run exited 0, the table printed
   0.900 and the first law priced the feed at its resolved 0.304: the number
   shown was not the number used.
3. **The SURFACE** printed the carried `vf`, not the resolved state
   (`Flowsheet.cpp`'s summary table and `ResultEmitter.cpp`'s `"vf"`), so with
   the line removed — the correct declaration — the feed showed `vf = 0.000`
   and a liquid enthalpy (1050.19 kW) while the first law used the resolved
   two-phase state (1325.78 kW): 275 kW of disagreement about one stream
   between two surfaces of one run.  The energy report then accused the feed
   of an *IMPOSSIBLE INLET PHASE* — reading the same carried default its own
   pricing had just resolved past.  Four readers of one stream, two answers.

## 3. What was built

* **Reader** (`src/streams/StreamStateIO.cpp`, "A STREAM IS FIXED BY TWO
  VARIABLES"): a file declaring `T`, `P` and `vaporFraction` with more than
  one present fluid component refuses.  For `0 < q < 1` the message quotes the
  rule (TWO intensive variables, Duhem), the three values and the component
  list, and the two remedies — delete the line and let `(T, P)` resolve the
  split; or, if the quality is the specification, the `(T, q)`/`(P, q)`
  closure must be *solved*, which this engine does not do today (said
  plainly, not invented).  For `q` exactly 0 or 1 it says the number is a
  single phase spelled as a number and names `phase liquid;` / `phase gas;`.
  A pure component keeps the current behaviour.
* **Writer** (same file, `writeStreamState`): `vaporFraction` is written only
  for a pure two-phase stream.  A mixture's split is what its `(T, P)` give
  and is not written; `phase gas` is written exactly where it always was.
* **Surface** (`src/unitOperations/flowsheet/Flowsheet.cpp`, "THE STATE AN
  UNPINNED INLET SHOWS IS THE STATE IT MEANS"): after the solve and before
  anything prints, every **unpinned** stream that **no unit produces** is
  resolved once at its own `(T, P, z)` through `flashState::equilibriumAt`,
  the one home, and `vf` carries that answer to the table, the JSON, the
  energy report's label check and its pricing.  The post-solve enthalpy block
  moved before the table and prices through the same home
  (`twoPhaseSplit` → `hOfState`) instead of its own `solveCore` call and
  hand blend — the report and the JSON are now the same arithmetic, which
  also means the supercritical-root discard and the resolved-precipitate rung
  reach the JSON's `H`.  A resolved inlet hands its solution to the enthalpy
  pass rather than being flashed twice.
* **Corpus**: `bin/curate/migrate_overspecified_vf.py` (one shot, idempotent,
  `--check`): 133 mixture lines deleted, 7 replaced by `phase liquid;` (6) /
  `phase gas;` (1), 2 pure pins kept.  flash01 declares `T` and `P` only.
  Two headers (column14/15 `0/feed`) and one flowsheetDict header (column14)
  that said *"the vaporFraction below MUST stay equal to that V/F … the engine
  does not tie them together"* were rewritten by hand: the engine resolves
  the feed and refuses a contradicting `feedQuality` (2026-09-12), so the
  key is a cross-check, not a second declaration.
* **Gate**: `bin/curate/check_overspecified_stream.py`, six arms (§6).
* **Three remedies that told a reader to write the refused line** were
  rewritten: `DistillationColumn.cpp`'s feedQuality refusal (now names
  `phase liquid;`/`phase gas;` for a saturated feed, and says the engine
  does not solve `T` from `q` for a two-phase one), its multi-feed `quality`
  refusal, and `EnergyBalanceReport.cpp`'s impossible-label remedy.  Advice
  that creates the next refusal is advice that creates the bug.

## 4. Decisions taken, and the alternatives rejected

* **Produced streams are not re-resolved for display.**  A stream a unit
  produced carries that unit's resolved answer (a re-flash is idempotent,
  R-E1) and may have been resolved in a per-unit thermo world; re-resolving
  it in the global world for the table would overwrite one world's answer
  with another's.  So the pass covers domain inlets and orphan authored
  states only.  REJECTED: resolving every unpinned stream.
* **The registry's `vf` is updated, not a display copy.**  A display-only
  copy would have left the energy report's label check reading the default
  and accusing every migrated feed of an impossible phase (the
  `check_impossible_phase_pins` ratchet would then have failed on dozens of
  cases for a label nothing declared).  Updating the one field the four
  readers share makes them agree by construction.  REJECTED: a second field
  for the shown value.
* **Units that read `vf` bare are NOT changed here** (valve, adiabatic flash,
  exchanger, storage tank, mixer basis).  They see the carried default during
  the solve, as before; the constitution's layer 2 in the consuming unit's
  world is each unit's to adopt through `resolveStreamThermalState`, and the
  measurement in §5 says no shipped case is moved by it today.  Named in
  `docs/ai/pitfalls.md` and in the gate's NOT CHECKED line.  REJECTED:
  resolving domain inlets BEFORE the solve so those readers see the resolved
  value — it would be layer 2 taken by accident in the global world rather
  than the unit's, on a path every case goes through, with nothing in the
  corpus asking for it.
* **The 0/1 files became `phase` pins, not unpinned streams.**  `vaporFraction
  0` and `phase liquid;` build the identical `ProcessStream` (vf 0,
  `phasePinned`), so no physics moved; stripper01/02's declared saturated
  liquid at a `(T, P)` whose own equilibrium is two-phase stays a declaration
  the engine honours (R-E2) and stays pinned in `check_impossible_phase_pins`.
  REJECTED: deleting those lines (it would move stripper01/02's answers, a
  curation decision the brief left to measurement and the record to Vítor).
* **The pure-component flash at saturation is left as it is.**  It returns its
  bisection midpoint (`the-word-that-was-not-there.md`); that is why the
  pure pin is kept and is information.  NOT touched.

## 5. What moved: the measurement

`bin/runTests <the 52 cases>` on the migrated tree with the new engine:
**PASS 52 / FAIL 0, zero golden rows moved** — flash01, the four
ammoniaStaged plants, ChemicalPlantTutorial, sugarPlantEconomicsSweep,
column14/15, stripper01/02 and the rest all reproduce every pinned row.  Why
nothing moved, by class:

* the isothermal flash re-resolves an unpinned feed itself (R-E1), so its
  `Q` and split are the same whether the file says `0.304` or nothing;
* the column resolves its feed through `resolveStreamThermalState` and finds
  the same split the writer had stamped (column14/15's `feedQuality` cross-
  check still agrees);
* init0 seeds for produced streams are overwritten by the solve;
* the 7 `phase` rewrites build the identical stream;
* only 7 golden rows in the corpus pin a stream's `vf`, none in these cases;
  no golden pins a stream's `H`.

The brief anticipated rows moving because a unit read the carried `vf`.  None
did: no migrated file feeds a bare reader with a two-phase mixture.

**Outside the 52, the surface pass moved the FIRST LAW of seven cases**,
found by `check_energy_closure` (its ratchet reads the engine's own report)
and re-measured with `--seed`.  Every one is the same mechanism — the report
now prices an unpinned domain inlet on the state it has, where it had
priced the carried default (vf = 0, a liquid), the V2 debt DEV.md §5 names:

| case | before | after | |
|---|---|---|---|
| `tsa01_co2_twin_bed` | 1.1120 % | 0.0000 % | closes; pin removed (and its `IMPOSSIBLE_PHASE_CASES` pin with it) |
| `perUnitThermo01_srk_nrtl` | 128.8000 % | 0.1210 % | closes; pin removed |
| `esterification2sector` | 170.9790 % | 44.9270 % | re-pinned |
| `acetone05_luyben_absorber` | −40.5770 kW | +3.1179 kW | re-pinned |
| `coolingTower01_merkel` | −14.5302 kW | +1.5666 kW | re-pinned |
| `acetone07_luyben_column_C2` | 0.0000 % | **196.7990 %** | JOINED the ledger |
| `column03_azeotrope_mesh` | 0.0000 % | **60.8760 %** | JOINED the ledger |

The last two are the substantive finding.  Each is a `model simultaneous;`
column whose feed declares no phase and whose own `(T, P)` equilibrium is
not the saturated liquid its `feedQuality 1.0` says (column03's 30/70
ethanol/water at 363 K is single-phase VAPOUR; DEV.md §5 recorded it on
2026-10-01).  The column's resolver returns the CARRIED vf for a converged
single-phase answer (the *"unmistakable is not a channel the engine reads"*
shape), so the column priced a liquid; the report priced the same default;
both sides agreed and the plant "closed at 0.0000 kW".  Now the report
prices the feed the case has and the column still prices the declared
liquid, and the latent heat of the feed is the whole residual — **a gap that
was always there, made visible.**  Making the column read the resolved
single-phase answer makes both cases REFUSE their `feedQuality` (the
2026-09-12 cross-check), and what each case then becomes — feed `T` moved to
its bubble point, or the column re-specified for a vapour feed — is a
pedagogical decision about the case that is Vítor's (DEV.md §5, "NOT YET
DECIDED").  So they are PINNED as measured, not fixed, and their golden
`boundary residual_kW 0` rows will MOVE: the moved-row list for the
commander, not recorded here.

`tsa01` and `flash10_ch4propane_pcsaft` also left `IMPOSSIBLE_PHASE_CASES`
(the two numerically clean pins): the label the report checks is the resolved
state now, so the line is not printed.  The dict is empty and stays declared.

## 6. The gate and its sabotages

`check_overspecified_stream`: (a) the refusal and its full text on a fixture
mixture; (b) the pure exception accepted; (c) `vaporFraction 0`/`1` naming
`phase`; (d) flash01: JSON `feed.vf` = flash `V_over_F`, JSON `feed.H_kW` =
report `H_feeds_kW`, no impossible-phase accusation, no `vaporFraction` in
`converged/feed`; (e) condenser01's pure wet condensate written back WITH its
pin; (f) the corpus carries no mixture file with all three, counted by the
migration tool's own classifier (one home).

Sabotages performed by hand (`scratchpad/sabotage.py`: apply, read back,
rebuild where `src/` moved, run the gate, revert, rebuild), 2026-10-03:

| sabotage | predicted | observed |
|---|---|---|
| S1 reader refusal disabled (`nPresent > 1` → `> 99`) | (a), (c), (d) | **(a), (c)** — three refusals did not fire; (d) did NOT, because flash01 declares T and P only and the reader's rule has no bearing on it |
| S2 writer's pure-only condition removed | (d) converged arm | (d): `vaporFraction` written into `converged/feed` for the mixture |
| S3 post-solve resolution pass disabled | (d) vf, H_kW, label | **first run: vf and H_kW only** (0 vs 0.30398357314; 1050.19 vs 1325.78 kW).  The label arm matched the report FILE's phrase `IMPOSSIBLE INLET PHASE` against stdout, where the sentence is `[phase] stream 'feed' is priced as LIQUID … cannot hold that label` — an arm that could never fire.  Regex corrected, S3 re-run: all three fire |
| S4 `vaporFraction 0.3;` re-added to flash02's `0/feed` | (f) | (f), naming the file, q and component count |
| S5 pure exception removed (`> 1` → `>= 1`) | (b), (e) | (b), (e) — condenser01 refuses its own `0/condensate` as a "MIXTURE of 1 components (water)", a sentence only this sabotage can produce |

Two predictions were wrong, in opposite directions: S1 reached fewer arms
than predicted (the gate's fixture and the shipped case are independent
witnesses, which is the point), and S3 reached fewer than predicted because
one arm was dead — *a pattern anchored where its subject does not live is a
check that cannot fire* (the 2026-09-03 dossier lesson, paid for again).

## 7. Validation

_(filled in after the full suite)_

## 8. Where the brief and the tree disagreed

The commander's corpus measurement (2026-10-03) said 103 files / 47 cases /
101 mixtures / 94 two-phase / 7 zero-or-one.  The tree says **142 files / 52
cases / 140 mixtures / 135 two-phase / 7 zero-or-one** (`git ls-files` over
`tutorials/*/0/**`, comments stripped, non-zero components counted).  The
seven 0/1 files and the shape of the finding agree; the counts do not, and
the larger ones are the ones used here.  Nothing else in the brief was
contradicted by measurement.
