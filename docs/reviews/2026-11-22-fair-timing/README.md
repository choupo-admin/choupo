# Choupo against Cantera: the two timings that are like with like (2026-11-22, branch `fair-timing`)

Question: the figures "Choupo 0.240 s against Cantera 0.087 s" (nox03, rtol 1e-10) put Choupo's WHOLE PROCESS
(start-up included) beside Cantera's `advance()` alone (`docs/reviews/2026-11-22-miller-bowman/timing.py`:
"solution construction and process start excluded for Cantera, the whole process for Choupo").  They were not
like with like.  Two like-with-like comparisons now exist.

Scripts (repo root, after `make all`; the nox mechanisms are built from the cases by
`docs/reviews/2026-11-22-miller-bowman/cantera_mech.py`):

* `fairtiming.py CASE integrator rtol [reps]`, CASE = nox03 | nox02 | ignition01; prints (a) and (b) below.
* `bytecompare.py LABEL` / `bytecompare.py diff A B`: the byte-identity harness (19 tracked cases, 1795 files hashed).

Machine: 4 cores, load average 4-6 while measuring (other sessions were running), best of 5.  The load shows
as noise of 10-20 % on the Choupo figures; ratios, not the last digit, are the result.

## What is inside each timer

(a) INTEGRATION ONLY.  Cantera: `ReactorNet` built, state set, then `advance()` to each write time (T and X read
at each).  Choupo: the engine's own timer, `CHOUPO_ODE_STATS=1` -> `time[ms]: integrate` (AdaptiveTimeStep.H,
`integ_->integrate()` summed over the write intervals, nothing else).  ignition01 integrates inside
`BatchReactor.cpp` on a fixed outer step, so its figure is the unit's own timer (verbosity 4, "wall ...").
(b) END TO END.  `choupoBatch CASE` as a process (parse, records, pins, Jacobian audit, integration, trajectory.csv
and the state directories) against a fresh `python3 -I` that imports cantera, loads the YAML, sets the state,
integrates and writes the same trajectory columns.  Python's `import cantera` alone is 0.15-0.17 s.

## Table (a): integration only (seconds; Choupo / Cantera = ratio)

| case | integrator | rtol | Choupo | Cantera | ratio |
|---|---|---|---|---|---|
| nox03 | Rodas4 | 1e-8 | 0.198 | 0.040 | 4.9 |
| nox03 | Rodas4 | 1e-10 | 1.356 | 0.076 | 17.8 |
| nox03 | seulex | 1e-8 | 0.109 | 0.040 | 2.7 |
| nox03 | seulex | 1e-10 | 0.225 | 0.076 | 2.9 |
| nox02 (17 vessels) | Rodas4 | 1e-8 | 1.549 | 0.036 | 42.7 |
| nox02 | Rodas4 | 1e-10 | 6.455 | 0.075 | 85.8 |
| nox02 | seulex | 1e-8 | 0.734 | 0.035 | 21 |
| nox02 | seulex | 1e-10 | 1.260 | 0.073 | 17.3 |
| ignition01 | Rodas4 | 1e-7 (hard-wired) | 0.018 | 0.004 | 4.2 |
| ignition01 | seulex | 1e-7 | 0.011 | 0.005 | 2.5 |

## Table (b): end to end, what a student waits for (seconds)

| case | integrator | rtol | `choupoBatch` | `python3` (import + load + integrate + write) | ratio |
|---|---|---|---|---|---|
| nox03 | Rodas4 | 1e-8 | 0.283 | 0.232 | 1.22 |
| nox03 | Rodas4 | 1e-10 | 1.441 | 0.248 | 5.8 |
| nox03 | seulex | 1e-8 | 0.189 | 0.224 | **0.84** |
| nox03 | seulex | 1e-10 | 0.314 | 0.270 | 1.17 |
| nox02 | Rodas4 | 1e-8 | 1.622 | 0.224 | 7.2 |
| nox02 | Rodas4 | 1e-10 | 6.542 | 0.283 | 23 |
| nox02 | seulex | 1e-8 | 0.810 | 0.190 | 4.3 |
| nox02 | seulex | 1e-10 | 1.337 | 0.276 | 4.9 |
| ignition01 | Rodas4 | 1e-7 | 0.078 | 0.141-0.209 | 0.4-0.6 |
| ignition01 | seulex | 1e-7 | 0.070 | 0.15-0.21 | 0.33-0.47 |

Reading: Choupo spends 0.06-0.09 s outside the integrator on every case (below); Cantera-in-Python spends
0.15-0.28 s outside its integrator (interpreter, `import cantera`, `Solution()`).  On nox03 with seulex the
two end-to-end times are level (0.84-1.17); on a small mechanism Choupo is about twice as fast end to end; the
integration itself is 2.7-2.9x slower on nox03 with seulex, 17-21x on nox02, and Rodas4 is 5-86x.  The nox02
gap is the largest: the 17 isothermal vessels are integrated one by one by Choupo (an energy row of zeros and
the same sparse machinery) against Cantera's constant-pressure reactor with the temperature held.

Caveats, each of which flatters Choupo or Cantera by a known amount:

* Equal rtol is not equal accuracy.  Against Cantera rtol 1e-12 on the output grid (species above x = 1e-6):
  Choupo Rodas4 1e-8 2.6e-5, seulex 1e-8 1.5e-4, seulex 1e-10 9.4e-4 (the dense-output floor of the previous
  review), against Cantera 6e-7 and 5e-9 at the same rtols.  Cantera is the more accurate at each rtol, so the
  equal-accuracy gap is wider than the table; the script prints the figures per run.
* ignition01 has no tracked Cantera mechanism: Cantera's bundled `h2o2.yaml` is the stand-in (same species,
  comparable size, other rate constants).  Only the timing is informative.  Its rtol is hard-wired to 1e-7 in
  `BatchReactor.cpp` (`ctrl.rtol`), so the 1e-8 and 1e-10 rows are one measurement.
* The atol of the two codes are numerically equal (1e-12 / 1e-15 / 1e-18) and mean different things (kmol of a
  species against a mass fraction); this is the convention of the earlier `timing.py`, kept for comparability.

## Start-up profile (callgrind, nox03 with endTime 1e-6, instructions, inclusive; baseline cfb0db0f2)

Total 542 M instructions (about 0.08 s).  Direct callees of `main` plus what sits inside them:

| item | instructions | share |
|---|---|---|
| Henry-pair registry load (486 files parsed and, in the pin check, hashed) | 92.6 M | 17 % |
| `vapourAssociation::find`: the `chemistry/` scan taken once per component formula (17 times) | 94.4 M | 17 % |
| thermo package build (component records, 68.6 M in `Database::loadComponent`) | 82.2 M | 15 % |
| `emitResultJson` = `records::finalizePins` = `computationalHash` over the pinned records (sha256) | 72.7 M | 13 % |
| `BatchReactor::initialise` (reaction set-up; contains the analytic-Jacobian audit, 36 M) | 46.5 M | 9 % |
| `verifyPinsStart` (hashes the pinned records once at start) | 37.4 M | 7 % |
| the one integration step | 41 M | 8 % |
| (all of the above parse `.dat` files: `Dictionary::fromFile`, 825 calls) | 195 M | 36 % |

Files opened by the run (strace): `parameters/Henry/` 526, `chemistry/` 236, `assets/` 109, the NASA table 72,
the case's own components 32, RRHO 27, `components/` 25.  Top five by inclusive cost: `Dictionary::fromFile`
(36 %), `HenrysLawRegistry::loadFrom` (17 %), `vapourAssociation::find` -> `scanRecordDir` (17 %),
`ThermoPackageBuilder::build` (15 %), `records::computationalHash` (13 %).  Self cost is flat (Tokenizer::next 7 %,
memcmp 6.5 %, malloc/free 12 % together).  Output writing is under 1 % (`SolutionWriter` does not appear).

Dominant item that is NOT in the three frozen files and is a pure waste: the `chemistry/` scan in `find`.
Fixed (below).  The others are design, not waste: the Henry catalogue and the pinned records are read and
hashed because a pin must notice a relevant record that ARRIVED; making them lazy changes what a run reads and
hashes, so it is a decision for the architect, not a bit-identical fix.

## The fix (src/thermo/VapourAssociation.H, `vapourAssociation::find`)

`find` called `records::scanRecordDir("chemistry")` (directory listing of ~236 catalogue files, sort, shadow
rule, merge) on EVERY call, once per component formula, and again from `Component::datumBridge298`.  The
listing is now cached, keyed on its identity: the working directory, the sealed flag, the two directories
`scanRecordDir` reads (nearest `constant/chemistry`, the catalogue's `chemistry/`; `data/local` is not read) and
their modification times, under a mutex.  A record added to or removed from either (a browser session whose WASM
module stays loaded) moves a mtime and the listing is re-taken (checked: add and remove a case-local record
between two calls, found / none as expected).  The per-file parse cache was already there, keyed on the path.  Order and content of the listing are the same, `checkLocalShadow` is idempotent
per (record, file) (PinCheck.cpp, `checked` set), so nothing observable changes.

* instructions: `find` inclusive 94.4 M -> 10.3 M; `scanRecordDir` 86 M (17 calls) -> 5 M (1 call);
  start-up 542 M -> 470 M instructions (the two runs differ in integrator settings by a few M).
* wall: about 0.080-0.089 s -> 0.078 s outside the integrator; inside the noise of a loaded machine
  (load 4-6), so the instruction count is the figure.
* byte identity: `bytecompare.py` before and after, 19 tracked cases (batch: nox02, nox03 x2, ignition01 x2,
  ignition04, kinetics02; ctrl: 01, 11, 12; unsteady: 01, 06; steady: cstr01, cstr04, cstr07, aceticAcid01,
  ammoniaReactor02, column05_reactive_methylacetate (the acetic dimer), process03_recycle), stdout, stderr,
  exit code and every file written, wall-time and timestamp lines dropped: 1795 files, 0 moved.  WHOLE CORPUS (`bytecompare.py LABEL all`: every tutorial of steady, unsteady, ctrl,
  batch, props, plant; curation excluded): 666 cases, 44091 files, before and after, 0 moved (17 cases exit
  non-zero in both: the deliberate refusal cases).  Two baseline
  runs agree with each other (0 moved), so the harness itself is deterministic.

## Not done / next

* Pin hashing is done twice per run (`verifyPinsStart` 37 M at the start, `finalizePins` 71 M at the end, 15-22 %
  of start-up together): a per-process cache of file hash keyed on (path, size, mtime) would halve it.  It
  changes no output but lives in `PinCheck.cpp`; not taken, to keep this slice to its core.
* The Henry registry reads 486 files for a case with no Henry pair; lazy loading would change which files a run
  reads and hashes (the pin set), so it needs a ruling.
* `Dictionary` parse itself: 825 files, 236 K instructions each; the tokenizer builds a `std::string` per token.
  A 2x speed-up of it is worth about 10 % of start-up.
* nox02 is the large gap (17-86x in integration): it is not a start-up problem.

## Retaken on the merged tree (fair-timing + origin/claude/choupo-simulator-new-session-s494v2 at 41506dbbb: seulex, rhs-speed, the `find` fix)

Machine load average 1.6-3.0 on 4 cores (lower than the first tables, which ran at 4-6), best of 5.  Seconds.

| case | integrator | rtol | (a) Choupo | (a) Cantera | (a) ratio | (b) `choupoBatch` | (b) `python3` | (b) ratio | (a) before |
|---|---|---|---|---|---|---|---|---|---|
| nox03 | Rodas4 | 1e-8 | 0.255 | 0.047 | 5.5 | 0.353 | 0.258 | 1.36 | 0.198 / 4.9 |
| nox03 | Rodas4 | 1e-10 | 1.245 | 0.138 | 9.0 | 1.343 | 0.302 | 4.4 | 1.356 / 17.8 |
| nox03 | seulex | 1e-8 | 0.103 | 0.046 | 2.25 | 0.212 | 0.251 | 0.84 | 0.109 / 2.7 |
| nox03 | seulex | 1e-10 | 0.213 | 0.085 | 2.5 | 0.316 | 0.309 | 1.02 | 0.225 / 2.9 |
| nox02 | Rodas4 | 1e-8 | 1.576 | 0.043 | 36 | 1.694 | 0.253 | 6.7 | 1.549 / 43 |
| nox02 | Rodas4 | 1e-10 | 6.817 | 0.078 | 88 | 6.908 | 0.280 | 25 | 6.455 / 86 |
| nox02 | seulex | 1e-8 | 0.717 | 0.041 | 17.6 | 0.808 | 0.234 | 3.4 | 0.734 / 21 |
| nox02 | seulex | 1e-10 | 1.320 | 0.079 | 16.6 | 1.417 | 0.288 | 4.9 | 1.260 / 17.3 |

Reading: the ratios moved mostly because Cantera's own times moved with the load (0.138 against 0.076 for
nox03 at 1e-10 shows a noisy Cantera run), not because Choupo changed: Choupo's integrate times are within
the noise of the earlier ones (nox03 seulex 0.103 against 0.109, nox02 seulex 0.717 against 0.734).  The
rhs-speed work is not visible at this resolution on these cases.  Accuracy figures are unchanged.

## What rhs-speed gained in a REAL run, in instructions (callgrind, `cgrun.sh`)

The micro-benchmark claimed rhs 277.6 k -> 167.6 k Ir per call with T varied per call to defeat the per-T memo.
In a real run T also changes at every call (it is an integrated variable), so the memo answers almost nothing and
the benchmark describes the real run.  nox03, rtol 1e-8, atol 1e-15, whole process under callgrind, both trees
with the `find` fix so that the start-up is the same.  OLD = cfb0db0f2 (seulex, no rhs-speed); NEW = merged tree
with rhs-speed (41506dbbb).  `rhs calls` = `BatchReactor::derivatives_` calls (3065 seulex, 5117 Rodas4: the
algorithms are unchanged, outputs identical).

| integrator | build | total Ir | integrate Ir (`AdaptiveTimeStepper::advance`) | rhs Ir (inclusive) | rhs calls | Ir per rhs call | Jacobian Ir |
|---|---|---|---|---|---|---|---|
| seulex | OLD | 1 703 M | 1 310 M | 817 M | 3065 | 266.6 k | 71 M |
| seulex | NEW | 1 396 M | 997 M | 519.5 M | 3065 | 169.5 k | 55 M |
| Rodas4 | OLD | 2 854 M | 2 461 M | 1 372 M | 5117 | 268.2 k | (not read) |
| Rodas4 | NEW | 2 237 M | 1 836 M | 872.8 M | 5117 | 170.6 k | 440 M |

Per call: -36 % (seulex) and -36 % (Rodas4), the benchmark's -40 % within a few points.  Whole process: -18 %
(seulex), -22 % (Rodas4).  The wall effect is smaller than the instruction effect on this machine under load
(first table of the merged tree), and the start-up (about 470 M Ir, 34 % of the new seulex total) is untouched.

Top inclusive functions of the NEW seulex run (Ir, share of 1 396 M), wrappers and `main` left out:

| function | Ir | share |
|---|---|---|
| `AdaptiveTimeStepper::advance` / `Seulex::integrate` | 997 M | 71 % |
| `BatchReactor::derivatives_` (the rhs, 3065 calls) | 519.5 M | 37 % |
| of it `rateOfReaction_` (235 reactions) | 298.8 M | 21 % |
| `SparseLU::factor` (635 factorisations, 383 k Ir each) | 243 M | 17 % |
| `Dictionary::fromFile` (start-up, 825 files) | 195 M | 14 % |
| `SparseLU::solve` | 105 M | 7.5 % |
| `BatchReactor::gibbsAt_` (31.6 k per rhs call, still) | 96.9 M | 6.9 % |
| `HenrysLawRegistry::loadFrom` (start-up) | 92 M | 6.6 % |
| `Reaction::equilibriumKcWithFactor` | 80.6 M | 5.8 % |
| `odeJacobianSparse` (92 builds) | 55 M | 4 % |

What the next speed slice should attack: (1) the sparse linear algebra, factor + solve = 348 M = 25 % of the
run and 35 % of the integration (seulex factorises 635 times for 104 steps: the extrapolation tableau re-factors
for every stage sequence; a factor reused across the order-k tableau columns that share h/n, or a cheaper
numeric-only refactor, is the lever); (2) the rhs still costs 97 k Ir per call in `rateOfReaction_` and 31.6 k in
`gibbsAt_` + 26 k in the equilibrium constants: the 51 species' g(T) are recomputed at each new T (a per-call
cost that no memo can hit), so the real saving is in evaluating g(T) and K_c(T) from fitted tables or from the
NASA-9 pieces once per T with shared exp/pow (exp + pow are 7.5 % of the run in libm); (3) start-up, 34 % of the
process (above).
