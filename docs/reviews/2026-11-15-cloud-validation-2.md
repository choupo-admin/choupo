# Cloud validation, second batch (2026-11-15)

Four tasks from the laptop session, authorised by Vitor.  Each task is on its
own branch off `origin/main` (0cddb183cb), pushed; nothing was merged into
main and no golden was re-recorded unless a section says so with its rows.

## Task 1 -- `bin/runCase` prefers this tree's own build

Branch `cloud/fix-runcase-own-tree`.

**Defect.**  `bin/runCase` resolved the binary with `command -v $APP` first
and fell back to the repo-root symlink only when nothing was on PATH.  On a
machine with two checkouts, the other tree's `bin/` first on PATH made a gate
that drives `bin/runCase` judge a different engine.

**Fix.**  The repo-root symlink next to the script's parent (this tree's own
build) is taken first; PATH is the fallback, and when it is used the run says
so on one line.

**Reproduced, then fixed** (a foreign `choupoProps` that exits 3, placed
first on PATH):

| runCase | check_fit_then_simulate |
|---|---|
| origin/main | FAIL: `(e) runCase <case> props exited 3 or wrote no log.choupoProps` |
| this branch | OK (all six arms) |

**Validation.**  Every gate whose source names `runCase` (11 besides the one
above): check_bashrc_path, check_doc_references, check_duty_inversion,
check_guide_paths, check_inlet_resolution, check_lithium_routes,
check_reaction_curve, check_runcase_reports_failure, check_solid_service,
check_stream_transport_closure, check_vlle_fallback -- all exit 0.
`bin/runTests --fast`: PASS 86 / FAIL 0 / EXPECTED-FAIL 5.  Commit 4212742346.

## Task 2 -- check_gate_selftest asks for rsync before cloning its workers

Branch `cloud/fix-selftest-rsync-first`, commit ccbb0b339d.

**Defect.**  The worker pool syncs each worker's build and `data/local` with
rsync, but that sync failed only after the workers were cloned.  On a
machine without rsync, each worker left about 2 GB under
`~/.cache/choupo/gate-selftest/`, and the next run filled the disk.  This
session measured that in this container earlier on 2026-11-15.

**Fix.**  `shutil.which("rsync")` is checked right after the platform-build
precondition and before any worker is created.  If rsync is missing, the
gate refuses by name and gives the remedy.

**Shown here** (this container has no rsync): `FAILED` in 0 s, with the
message naming rsync and the install command.  The pool home holds only its
lock.

**Validation.**  `bin/integrate --plan` reaches no case, and neither `--gui`
nor `--fast` is triggered.  All 23 gates the plan lists exit 0 (apart from
the self-test itself, which refuses by design on this machine):
check_brain_fresh, check_cost_provenance, check_debt_registry,
check_design_sheet, check_doctrine, check_duplicate_keys,
check_evidence_records, check_gibbs_duhem, check_git_visibility,
check_glossary_bans, check_internal_states, check_models_catalogue,
check_origin_vocabulary, check_packing_record, check_problem_divergence,
check_ratebased_segment, check_registry_scan, check_retired_names,
check_scan_roots, check_source_headers, check_source_licence,
check_unifac_key, check_variant_same_values.  `gate_manifest.py --check`
exits 0.

**Observation, not fixed (outside the task).**  `debt_registry.py:978` pins
`check_gate_selftest.py:623 bdir.iterdir()`.  On origin/main, line 623 is
`raw = os.environ.get(var, "")`, so the citation was stale before this edit.
This edit adds lines only below it.

## Task 3 -- T_bubble iterates the incipient vapour on a gamma-phi cubic vapour (EX-04)

Branch `cloud/fix-tbubble-vapour-frame`, off origin/main c8819a5257, commit eb569ff68e.

**Defect.**  `bubbleK` (src/unitOperations/saturation/BubblePoint.cpp) gave
a gamma-phi package with a PR/SRK vapour `K(T, P, x, x)`, the vapour priced at
the liquid's composition, while `BubblePoint::pressure` iterated y.

**Fix.**  On a non-phiPhi package whose vapour fugacity depends on
composition and whose vapour association is not priced, `bubbleK` iterates
the incipient vapour with `incipientPhase::vapour`.  The seed is the Raoult K,
the same seed `pressure` uses.  The other three routes are unchanged:
- phiPhi (Wilson seed),
- an associated ideal-gas vapour (seed `K(x, x)`),
- an ideal vapour (`K(x, x)`).

`vapourAssociationPriced()` is still asked first on every call, so the
once-per-run announcement it raises on an EoS vapour is not lost to a short
circuit.

**Round trip** P_bubble(T_bubble(P)) / P - 1, pxy01's liquid (x_ethanol 0.4):

| vapour | P | origin/main | this branch |
|---|---|---|---|
| PR | 1 atm | +1.264e-4 (y 0.61576 vs 0.61603) | -2.96e-11 (y identical to 8 digits) |
| PR | 20 bar | +7.800e-4 (y 0.55213 vs 0.55423) | -2.00e-11 |
| SRK | 1 atm | -- | +1.97e-11 |
| SRK | 20 bar | -- | -2.00e-11 |

New gate arm `check_phase_envelope` (n) holds it to 1e-9 on P and 1e-8 on y,
at 1 atm and at 20 bar.  Sabotage: the arm run against a build without the
fix FAILS with +1.264e-4 and +7.800e-4.

**Reach, measured.**
- `bin/integrate --plan` maps BubblePoint.cpp to 1022 cases by unit type.
- The change cannot move a case on an ideal-gas vapour, because that path is
  the old one.
- Every case declaring a cubic vapour anywhere (`fugacityModel SRK |
  PengRobinson | PR`, or `eos SRK | PengRobinson`; 32 cases) plus pxy01 was
  run with `--scope`: 36 PASS, 2 FAIL.
- **Two cases moved, 9 golden rows.  They were changed BY HAND, row by row.**
  A `--record` of ammoniaPEQ03 was tried first.  It re-pinned about 300
  stream rows that drift only at round-off (1e-11 relative) and appended two
  new rows to envelope03, so it was undone.

| case | row | was | now | why |
|---|---|---|---|---|
| ammoniaPEQ03_basicDesign | LetdownHP/psv fire_T1 [K] | 325.904286868 | 325.621274845 | the fire case boils the liquid at its bubble point at P1 (`BubblePoint::compute`, ReliefValveSize.cpp), and its incipient vapour is now its own composition, richer in the dissolved gases than y = x |
| | fire_lambda [J/mol] | 15081.4485755 | 14944.7834542 | lambda = sum y_i dHvap_i, and the gases (above their Tc) carry none: -0.9 % |
| | fire_W [kg/h] | 185.646823998 | 186.565079118 | W = Q / lambda x M_v |
| | fire_M [kg/kmol] | 16.1487373966 | 16.0815525468 | M of the incipient vapour |
| | fire_Z | 0.867976241709 | 0.870456373265 | Z of that vapour at P1, T_b |
| | fire_k | 1.30717138389 | 1.30801751255 | Cp/Cv of that vapour |
| | fire_A [mm2] | 11.4264652981 | 11.5157483791 | the API 520 area from W, Z, k, M: +0.8 % |
| envelope03_c3c4c5_both_stop | bubble_points | 63 | 44 | see below |
| | bubble_stopped_bar | 64 | 45 | see below |

**envelope03, the move that changes what a student sees.**  The bubble
branch now stops at 45 bar (last point 395.780 K at 44 bar) instead of 64
bar.  The iterated incipient vapour is about 63 % propane.  By Kay's rule its
pseudo-critical point is about 395 K and 40 bar, so at 45 bar it is losing
its vapour root.  P_bubble on the same package (which always iterated y)
already jumps between roots above 397 K: y 0.629 -> 0.572 -> 0.644 -> 0.554
at 397, 398, 400 and 405 K.  The old 64 bar came from reading phi at the
heavier liquid composition, which keeps a vapour root longer.  The dew
branch is unchanged (47 bar), and the case still shows both branches
stopping, which is what it exists for.  Its header, its description, the
generated Tutorials Guide and the GUI test that holds the counts
(gui/tests/phaseEnvelopeLens.test.ts: four pins, 64 -> 45 and 63 -> 44) say
so.

**Absences buried in the same commit.**  These places named the y = x frame
as a current limitation, and each now says it is fixed:
- pxy01's header and the Tutorials Guide generated from it;
- Theory Guide `sec:bubble-pressure`;
- the relief sizer's seed comment (ReliefValveSize.cpp);
- BubblePoint.cpp's seed comment;
- BubblePoint.H.

Line citations that the edits moved, all updated:
- the two GUI log anchors into BubblePoint.cpp (gui/src/ui/methods/runLog.ts,
  393 -> 414 and 447 -> 468);
- the overpressure lesson's citation of the governing-scenario line in
  ReliefValveSize.cpp (gui/src/ui/methods/overpressureLesson.ts, 542 -> 545).

**Validation.**
- `--scope` over the 33 cubic-vapour cases: PASS 38 / FAIL 0 after the 9
  rows.
- `--fast`: PASS 86 / FAIL 0 / EXPECTED-FAIL 5.
- The seven generator checks the plan names (code_map, gate_manifest,
  gen_citation, gen_theory_bibliography, gen_tutorials_guide,
  props_ops_reference, release_inventory): all exit 0.
- Theory Guide and Tutorials Guide PDFs rebuilt with `make -B`.
- `--gui`: PASS 48 / FAIL 1 (check_gate_selftest, rsync).
- The plan's 96 gates: 94 exit 0, apart from two that are not from this
  branch:
  - check_gate_selftest refuses for want of rsync, the task 2 defect.  Run
    on this branch it again left 3 GB of half-made pools and filled the disk
    mid-validation.  The pools were removed, and the gates that died of
    "No space left on device" were re-run green.
  - check_thermo_limits FAILS arms (c) and (d): "the trivial bubble/dew root
    was published as converged" on flash09's phiPhi SRK liquid.  **It fails
    identically with origin/main's BubblePoint.cpp compiled into this
    tree**, and (d) is the dew point, which this branch does not touch.  It
    is a regression already on main c8819a5257 and is reported here, not
    fixed.
- `bin/integrate --plan` reports a FULL SWEEP REACHED (BubblePoint.H is
  included by sizers that register no type).  It was not launched: it is
  Vítor's decision.  The header changed only in a comment, and the kernel's
  reach is the cubic-vapour cases, all of which were run.

**A finding, not fixed.**  `P_bubble` on envelope03's package returns a
"converged" pressure at 398-415 K while its incipient vapour jumps between
roots.  It refuses nothing there.  That is BubblePoint::pressure as it was on
main; it needs its own slice (a root-continuity or supercritical-vapour
refusal).

## Task 4 -- the liquid-stability probe refuses on a one-liquid package

Branch `cloud/fix-gammaphi-stability-probe`, off origin/main c8819a5257, commit 2e8ee42653.

**Defect, and why it is a package limitation and not a probe bug.**
`liquid_stable` (src/propertyOps/PropertyEvaluator.cpp) decides by a
liquid-liquid flash (`IsothermalFlash::solveCore`, `PhaseSet::LL`), and that
flash needs two liquid phases in the package.  A gammaPhi package carries one
liquid by design, so on one the flash throws "LL flash needs >= 2 liquid
phases".  The probe's `catch (...) { ...; return 1.0; }` turned that throw
into "one stable liquid".

Reproduced: envelope04's own probe point (equimolar water + benzene, 1 bar,
UNIFAC + PR) on a gammaPhi package printed `"liquid_stable": 1` with exit 0.
On envelope04's gammaGamma package the same model answers 0.

**Fix.**  The probe now counts the package's liquid phases
(`thermo.phasesOfType("liquid")`, the same rule the flash uses) before doing
anything else.  With fewer than two it refuses by name and names the remedy:
`formulation gammaGamma;` with the same activity model on both
`liquidPhases`, which is exactly the package the Explorer builds for this
probe.  The other exits of the catch are unchanged; see the open item below.

**Who could be affected, measured.**
- One corpus case asks for `liquid_stable`: envelope04, which is gammaGamma
  and unchanged (`--scope` PASS).
- The GUI never sends the probe a one-liquid package:
  - `methodFeeds.ts` sets `vleTwoLiquid` with `liquid_stable`;
  - `exploreSynth.ts` builds gammaGamma for `vleTwoLiquid`;
  - `phaseEnvelopeLens.ts` builds gammaGamma.

**New gate arm** `check_phase_envelope` (m) holds both halves.  The gammaPhi
package must refuse and name both the probe and gammaGamma; the gammaGamma
package must answer 0.

**Validation.**  `bin/integrate --plan` reaches 0 cases and no `--gui` or
`--fast`.  It does report a FULL SWEEP REACHED, because PropertyEvaluator.cpp
is a shared path of choupoProps.  That sweep was NOT launched: it is Vítor's
decision, and the edit enters only the `liquid_stable` branch, whose only
corpus caller is envelope04.  Run instead:
- `--scope` envelope04: PASS 2 / FAIL 0;
- `--fast`: PASS 86 / FAIL 0 / EXPECTED-FAIL 5;
- `code_map --check` and `gate_manifest --check`: exit 0;
- the 52 gates the plan lists: 51 exit 0.  check_gate_selftest exits 1,
  because this container has no rsync, which is task 2's refusal working,
  not this edit.

**Open, not done (outside the task).**  The probe's catch still turns any
other exception from the LL flash into "stable", and a solve that returns
`converged = false` is read as "no split".  Whether a non-converged LL search
should refuse too is a separate decision.

## For the laptop

- **Branches to integrate, one per task, each off origin/main:**
  - `cloud/fix-runcase-own-tree` (4212742346);
  - `cloud/fix-selftest-rsync-first` (ccbb0b339d);
  - `cloud/fix-tbubble-vapour-frame` (eb569ff68e; 9 golden rows, listed in
    its section and commit);
  - `cloud/fix-gammaphi-stability-probe` (2e8ee42653).
- Tasks 3 and 4 both add an arm to `bin/curate/check_phase_envelope.py`,
  in different hunks: (n) after arm (g), (m) after arm (l).
- **Main at c8819a5257 fails check_thermo_limits (c)/(d)** (trivial phiPhi
  bubble and dew roots published as converged on flash09's SRK liquid).
- **Integrate task 2 first if any machine lacks rsync.**  Without it, every
  validation that runs check_gate_selftest leaves gigabytes of worker pools
  behind; it filled this container's disk during task 3.
- Nothing was merged into main.  No full sweep was launched: the plans of
  tasks 3 and 4 report one reached, which stays Vítor's decision.
