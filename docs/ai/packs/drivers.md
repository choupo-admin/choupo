# Pack: drivers (sweeps, design specs, optimisation, Pareto fronts: `system/outerDict`)

budget: 1400 words (~2240 tokens)

Read after the brief (`docs/ai/brief.md`). A driver wraps `choupoSolve`: drop a `system/outerDict` into a steady case and the binary loops the simulator with modified inputs, one driver per case, selected by `type`. Full reference: `docs/ai/outer-drivers.md`; the unit schemas say "for 'I need P_out = X' wrap the unit in a DesignSpec": that is section 3. A transient case (`choupoBatch`, `choupoCtrl`) is varied by editing its dicts, not by a driver of this kind. Fitting measured data is NOT a driver: it is `fitParameters` under `choupoProps` (pack `properties`).

## 1. Which driver

| Question | `type` |
|---|---|
| "How does X trend with T?" (one knob, a range) | `sweep` |
| "A map over two knobs" | `gridSweep` |
| "What area gives exactly 4500 kg/h?" (as many knobs as specs) | `designSpec` |
| "Which reflux minimises the reboiler vapour?" (a best value) | `optimization` (`method nelderMead;`, `sqp;` or `mads;`) |
| "The purity-energy trade-off curve" | `paretoSweep` |
| "One more point" | edit the dict and rerun; no driver |
| "How exposed is the NPV to the price or the discount rate?" | NO driver: `economics { sensitivity {} }` in the postDict (pack `design-cost`) |

## 2. Paths: how a driver reaches a number

Each pass re-reads the case from disk, writes the new value at a dot-and-bracket path, and runs; the case on disk is never changed.
```
units[0].operation.refluxRatio     // first unit (0-indexed); `units[0].operation.T`
streams.feed.P                     // a feed stream's field (F, T, P), applied over the 0/ value each pass
variables.nMods                    // a case $variable
reactions.myRxn.kinetics.A         // an Arrhenius prefactor
```
Values written to a path are RAW canonical SI (K, Pa, kmol/s): a `sweep` `range` carries NO unit suffix (a `designSpec` `manipulate`, `value` and `tol` do take them). RESULTS are read back by a different, dotted path: `<unitName>.<kpi>` (any KPI the unit publishes; run the case once at verbosity 3 and read them off) or `<streamName>.<field>` (`F`, `T`, `P`, `vf`; `F_mass` in a `designSpec` only).

## 3. designSpec: N knobs, N targets (the Newton-ND)

The knob is a case-level `$variable`, declared in `flowsheetDict` and referenced by the unit. From `tutorials/steady/rotating/compressor02_designspec_pout`:
```
// system/flowsheetDict
variables { W_shaft 10.0 kW; }                              // initial guess
units ( { name compressor; type compressor; in feed; outputs ( out );
          operation { W_shaft $W_shaft; eta 0.75; } } );
```
```
// system/outerDict
type designSpec;
manipulate ( { variable W_shaft; min 1.0 kW; max 100.0 kW; } );   // `initial` is optional: absent, it starts at the case value
targets    ( { path compressor.P_out; value 8.0 bar; tol 200 Pa; } );
options    { maxIter 30; tolF 1.0; fdStep 1.0e-3; }
```
- `dim(manipulate)` MUST equal `dim(targets)`; the variable MUST exist in `variables {}` or the driver refuses.
- A target is a value (`path`, `value`, `tol`), an equality (`lhs`, `rhs`, `tol`: equal areas, equal duties; `tutorials/steady/optimisation/designSpec01_triple_equal_areas`) or `largestOf ( a b ... ); value; tol;` (the smallest knob at which every named quantity is within the bound).
- A stream can be the knob: `{ variable streams.utilitySteam.F; initial 400 kmol/h; min ..; max ..; }` (here `initial` is required).
- After convergence the simulator is replayed once at the design point, so the case ends with its full output and its `reports {}`.
- A recycle inside the loop is fine; the driver converges the recycle in every pass. Give it a feasible box: an evaluation that fails is an infinite penalty (announced).

## 4. sweep and gridSweep

From `tutorials/steady/flash/flash06_sweep_T`:
```
type sweep;
parameter { target units[0].operation.T; range ( 360.0 385.0 ); nPoints 26; }   // raw SI, nPoints >= 2
responses ( flash01.V_over_F  flash01.Q_kW  flash01.F_alpha  flash01.F_beta );
report { format csv; file sweep_flashT.csv; }
```
A point that fails is written as `nan`, the sweep continues, exit code 1. Responses are unit KPIs or stream `F T P vf` (no compositions: use a unit KPI such as `column01.x_D_LK`). A distillation trend: `tutorials/steady/optimisation/sensitivity01_column_reflux`; a feasibility map beside it: `sensitivity02_feasibility_map`. Two knobs, from `tutorials/steady/flash/flash07_gridsweep_TP`:
```
type gridSweep;
parameters ( { target units[0].operation.T; range ( 355.0 385.0 ); nPoints 7; }
             { target units[0].operation.P; range ( 50000.0 200000.0 ); nPoints 7; } );
responses ( flashDrum.V_over_F );
report { format csv; file gridsweep_TP.csv; }
```
`gridSweep` does not run the postDict chain; `sweep` does, per converged point.

## 5. optimization

From `tutorials/steady/optimisation/optim01_column_reflux`:
```
type optimization;  method nelderMead;                 // | sqp
variables ( { path units[0].operation.refluxRatio; min 3.0; max 5.0; initial 4.0; }
            { path units[0].operation.feedStage;   min 6;   max 12; } );
objective { kind kpi; path column01.V_strip; sense minimise; }    // kind: kpi | stream | cost | costTotal; sense minimise (default) | maximise
options   { maxIter 80; tolX 5e-3; tolF 1e-4; simplexInit 0.15; }
report    { file optimization_history.csv; }
```
- `cost` and `costTotal` objectives REQUIRE a `system/postDict` with sizing and costing (`tutorials/steady/optimisation/optim02_process_cost`, `optim05_reactor_npv`). A driver reports on its run header whether the postDict chain is applied.
- Nelder-Mead is unconstrained (bounds are a hard box). Constraints are `method sqp;` (smooth, shadow prices) or `method mads;` (derivative-free, integer variables native, `options { maxEvaluations; tolX; seed; }`, witness `optim07_mads_mixed_column`):
```
constraints ( { kpi vessel.maxSI_gypsum_wall; atMost 0.0; } );        // atMost | atLeast | equals <rhs>; tol
```
  Witness `tutorials/steady/optimisation/optim04_membrane_recovery_scaling` (`variables ( { path streams.feed.P; min 10.0 bar; max 30.0 bar; } { path variables.nMods; ... } )`, objective maximise `vessel.water_recovery`).
- A variable the objective does not depend on just floats (the header of `optim01_column_reflux` says so): an integer variable such as `feedStage` is carried as continuous and rounded by the unit; a true integer search: `tutorials/steady/optimisation/optim06_integer_stages`.
- Without a constraint a minimum often sits on a bound (R at the floor): add a purity constraint under `sqp`, or use the Pareto front.

## 6. paretoSweep: the front by epsilon-constraint

From `tutorials/steady/optimisation/pareto01_purity_energy`: one constrained SQP run per point, the second objective becomes a swept bound.
```
type paretoSweep;  method sqp;
variables ( { path units[0].operation.refluxRatio; min 1.5; max 6.0; initial 3.0; } );
objective { kind kpi; path column01.V_strip; sense minimise; }
tradeoff  { kpi column01.x_D_LK; bound atLeast; range ( 0.96 0.994 ); nPoints 5; }
report    { file pareto.csv; }
```
`pareto.csv` keeps failed and infeasible points, marked. The constraint multiplier printed per point is the marginal price of purity.

## 7. Pitfalls

- A `sweep` range with a unit suffix (`360 K`): not accepted; write the SI number.
- A sweep over a `$variable` target, a stream target and a unit target all work; a path that does not exist is refused by name: check the index (`units[0]` is the FIRST unit of `flowsheetDict`).
- `designSpec` with more knobs than targets (or fewer): refused. Pick one knob per spec.
- A response that is a composition: not available in a sweep; use the unit's KPI.
- `fitBinaryPair` is retired and refused: use `fitParameters` in `choupoProps`.
- The CSV the driver writes is plotted by one click in the GUI; tell the student to run the case and click the chip.
- Guides: `docs/ai/outer-drivers.md`; Tutorials Guide `docs/tutorialsGuide-steady.tex` (sweep and optimisation chapters).

<!-- RUN: flash06, compressor02, optim01, pareto01 and flash07 are golden-checked by bin/runTests.
     SOURCES: docs/ai/outer-drivers.md sections 1-4; docs/ai/unit-ops.md lines 4635-4690; the outerDict of every case named above.
-->
