# The proofs of nine again, after C500, C504, C514, C516, C517 (C492 engine half), 2026-11-25

A MEASUREMENT behind a gate.  Engine of this branch (origin/main e59b529fbf, the 1125b landing, plus the proofs
tool).  377 cases: 364 steady and 13 plant cases that `choupoSolve` runs; one case at a time per worker, three
workers, nice 12.  The corpus verdict is now held by the NIGHTLY gate `check_proofs` against
`bin/curate/proofs_ledger.tsv`; the end-to-end run of that gate took 526 s and agreed with the hand-merged table
below (the gate is deterministic over the corpus).  Earlier measurement, before the five fixes:
`2026-11-25-proofs-corpus.md`.

## The table

| proof | HOLDS | VIOLATES | NOT JUDGED | before the fixes (HOLDS / VIOLATES / NOT JUDGED) |
|---|---|---|---|---|
| T1 homogeneity (feeds x2, sizes by the per-unit rule) | 191 | 2 | 184 | 97 / 2 / 277 |
| T2 component order reversed | 323 | 4 | 50 | 272 / 54 / 50 |
| T3 unit writing (SI) | 359 | 2 | 16 | 358 / 2 / 16 |
| T4 closures recomputed outside the engine | 249 | 1 | 127 | 250 / 0 / 126 |
| T5 admissibility | 343 | 0 | 34 | 343 / 0 / 33 |
| T6 no-op restart from converged/ | 322 | 2 | 53 | 318 / 6 / 52 |

T2 went from 54 violations to 4: the columns (C504), the membranes, electrodialysis and PhaseChanger (C514) are
fixed.  T6 lost stripper01/02 and marcilla01/02 (C516).  T1 judges 94 more cases (the per-unit rule).

NOT JUDGED, by reason (the classes pinned in the ledger): 16 base refuses (every proof); T1 22 outerDict, 23 a size
outside a unit block (sectored sub-flowsheets), 15 feeds not identifiable, 1 flat-sheet cell, 1 `$variable` size, and
about 120 in 26 unit types with no rule yet (the largest: distillationColumn 14 -- the tray ones -- heatExchanger 12,
electrodialysisStack 10, evaporator 9, sprayDryer 8, pipe 7, cyclone 6, turbine 6); T2 34 single-component; T4 47
stream blocks the reader does not handle, 18 flowsheets it cannot parse, 16 sweep cases with no engine report, 10 with
no converged/, 5 pseudo-components, 5 non-unique state files, 7 text values; T5 18 results with no streams;
T6 37 with no converged/.

## The violations, triaged (11 rows in the ledger, none new)

| proof | case | class | reproduction (one line) |
|---|---|---|---|
| T1 | extract02_declared_interior | ENGINE solver tolerance (LL solver stops at 1e-8, x2 feeds move the raffinate benzene 3.1e-7) | `bin/curate/proofs.py T1 --case=tutorials/steady/absorption/extract02_declared_interior` |
| T1 | gibbs06_h2_flame_radicals | ENGINE solver tolerance (`GibbsMethod.cpp:128`, absolute 1e-8 residual; burnt H 1.35e-7) | `... T1 --case=tutorials/steady/gibbs/gibbs06_h2_flame_radicals` |
| T2 | totalReflux01_c6c7_yanagiRun628 | ENGINE, C514 left it open: `alpha_mean` takes component 0 | reverse `components`, read `kpis/column/alpha_mean` (1.90 -> 0.53) |
| T2 | flash20_ethanol_water_pcsaft | ENGINE: the multi-start Gibbs split depends on the order at 7e-6 | `... T2 --case=tutorials/steady/flash/flash20_ethanol_water_pcsaft` |
| T2 | vlle03_audit_artificial, vlle05_produced_feed | ENGINE: three-phase flash order dependence 9e-7 (F_vapor 0.005158982796 / 0.005158983493); C514 fixed the large part | `... T2 --case=tutorials/steady/flash/vlle03_audit_artificial` |
| T3 | flash20, process05_isomerization_recycle | ENGINE solver tolerance amplifying a 1e-16 rewrite (1e-8; a recycle 4e-7) | `... T3 --case=...` |
| T4 | membrane08_softened_scaling | ENGINE, known debt (check_element_closure pin): the resin takes Na, Ca, Mg, K that no stream carries; the streams close 100.0308 % in mass while the engine says 100.0000 | `... T4 --case=tutorials/steady/membranes/membrane08_softened_scaling` |
| T6 | extract02_declared_interior, ed07_feed_and_bleed | ENGINE solver tolerance (9.6e-7; a recycle at 1e-4 moves 1.5e-4) | `... T6 --case=...` |

No violation is a case defect; two are a limit of the proof that was FIXED, not ledgered: tray hydraulics and the
first rules (below).  Two items to watch: the T4 row of membrane08 is a mass closure the engine reports as exact
while its own streams disagree by 0.03 % (C258 asks for a named stream; the engine half is open); the T2 rows are
phase-split solves whose path depends on the order at the 1e-6 level, which a tighter tolerance would remove.

## What the first run of the T1 per-unit rules found in the PROOF

Each was a VIOLATES that the hand check traced to the rule, not the engine; each is fixed in `proofs.py`:
`Q_per_mol` and `xi_mol_per_s` classified by name against their dimension; `Q_recovery_max_kW` read as a recovery
fraction; `UA` and `vessels` not recognised as sizes (so left unscaled, the exact failure "never mark HOLDS what was
not scaled consistently" forbids, here showing as a VIOLATES); and the tray columns: scaling the diameter by sqrt(2)
moves `dP_column_kPa` by 4 % in rating AND design mode, because a tray's liquid load is per length of weir (~D) and
the vapour velocity per area (~D^2): no single D keeps both.  Tray hydraulics are therefore NOT degree-one
homogeneous and the column is NOT JUDGED by name (`hydraulics` in the reason), not scaled and not ignored.

## The time-integrated binaries (109 cases: 80 batch, 21 ctrl, 8 semi-continuous), by hand, NOTHING PINNED

Tool `bin/curate/proofs_time.py`, same loop.

| proof | HOLDS | VIOLATES | NOT JUDGED |
|---|---|---|---|
| T3 unit writing | 79 (73 batch, 4 ctrl, 2 semi) | 0 | 30 (27 have no bar/kmol/h/kW value to rewrite, 3 base refuse) |
| T4 atoms of a closed vessel, 0 to the last instant | 7 | 0 | 102 (open systems, recipes, vessels whose holdup is not the whole inventory: solid, adsorbed, permeate, distillate; 18 state files the reader cannot parse) |
| T6 restart from an interior instant | 29 (23 batch, 6 semi) | 3 | 77 |

T6 NOT JUDGED: 21 ctrl cases by contract (a controller's memory is in no state record, settled-contracts.md), 43 refused
by name by the engine (`notRestored`: a vessel whose state is more than its holdup -- adsorbers, beds, stills, dryers,
diafilters) or declaring absolute times (`writeStart`, `rateOfProduction time`, the sensitivity of an ignition delay),
10 with fewer than 3 written instants.  The one finding: **batch02_adiabatic, batch04_transient_dirs and
batch06_adaptive_runaway end 6 mK (1.8e-5 relative) from the uninterrupted run when restarted from t = 300 s of 600**
(T_final 322.2480 against 322.2422, n_aceticAcid 1.1e-4), although the state file carries 17 digits and the isothermal
twin batch01 restarts to 0.00e+00.  ENGINE candidate, not diagnosed (the adiabatic energy balance after a restart: the
datum or the volume it reseeds).  Reproduction: `bin/curate/proofs_time.py T6 --case=tutorials/batch/reactor/batch02_adiabatic`.
Cumulative ledgers (energy, utilities, RTD areas, initial inventory) cover only the restarted segment and are not
compared; that is stated in the tool, not a defect.

## The cheap tier (T4 and T5 in the ordinary sweep): proposed, NOT implemented

The sweep keeps each case's stdout in `build/suiteOutputs/` and the in-place `converged/`, so T5 (no engine) could
read both.  Measured: T5 costs well under a second per case; T4 sums to 160 s on one process (37 s for the largest
plant), about 25 s on a pool of eight.  T5 fits the minute but its subject is refused by the engine itself since C498
(0 violations in 343 and nothing left to catch; CLAUDE.md 4e(4)); T4 does not fit one minute until the independent
reader learns the 47 stream-block kinds and 18 flowsheet layouts it refuses.  Proposal: revisit T4 when its NOT JUDGED
count has halved.
