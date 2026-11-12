# Pack: recycles (loops in a steady flowsheet)

budget: 1850 words (~2960 tokens)

Read this pack when a stream returns upstream: unconverted feed recycled, a
vapour or liquid returned to a mixer, a purge loop.  Binary: `choupoSolve`.
A flowsheet with NO loop needs no `solverDict`, no tear, no seed.

## 1. The rule: declared order, plus one cut per loop

* Units run **in the order you declare them in `units ( ... )`**.  The engine
  never re-sorts.
* Every material input of a unit is exactly one of:
  1. a **domain inlet** (no unit produces it; you author its `0/` file);
  2. the output of an **EARLIER** unit in the list;
  3. a **declared tear**.
* A **tear** is the one stream per loop that is read before it is produced.
  You choose it, name it in `system/solverDict`, and seed it in `0/`.
* Which stream to tear: the one whose value you can estimate best, usually
  the recycle stream entering the mixer that closes the loop.  One tear per
  independent loop.
* Every stream has exactly ONE producer.
* Decision: a loop exists -> `solverDict` + tear + seed.  No loop but a unit
  declared before its producer -> that is an ORDER mistake: reorder the units,
  do not declare a tear.

## 2. `system/solverDict` keys

```
tearStreams      ( recycle );     // REQUIRED when a loop exists; list of stream names
recycleSolver    Newton;          // Newton (default) | Wegstein | DominantEigenvalue
recycleTol       1e-8;            // relative tolerance; default 1e-5
recycleMaxIter   50;              // default 100
recycleWegsteinQmin  -1.0;        // Wegstein only; default -1.0; -0.7 = more damping
recycleWegsteinQmax   0.0;        // Wegstein only; default 0.0
recycleDEDamping     0.7;         // DominantEigenvalue only; Orbach-Crowe Eq 18 alpha in (0,1]; default 0.7 (the paper's)
recycleDELambdaTol   0.01;        // DominantEigenvalue only; two successive lambda agree within this fraction; default 0.01
recycleDELambdaMax   0.9;         // DominantEigenvalue only; refuse a move when |lambda| is above; default 0.9 (Choupo's bound)
recycleDEMinCosine   0.9;         // DominantEigenvalue only; refuse a move when differences are not parallel; default 0.9 (Choupo's guard)
```

* `Newton`: unknowns are, per tear stream, every component molar flow, T and
  P; one full sweep of all units per residual evaluation.  Typically 3-10
  iterations.  Use it by default.
* `Wegstein`: accelerated successive substitution.  Use for counter-current
  cascades with several tears, or when Newton wanders; lower
  `recycleWegsteinQmin` to damp over-shoot.  An energy heat-link feedback
  (see the energy documentation) forces Wegstein, announced.
* `DominantEigenvalue`: the dominant eigenvalue method of Orbach & Crowe,
  Can. J. Chem. Eng. 49 (1971) 509.  Direct substitution; lambda is the
  ratio of norms of two consecutive differences (their Eq 17); once two
  successive lambda agree it MOVES to X_n-1 + alpha (X_n - X_n-1)/(1 - lambda)
  (Eq 18), then iterates at least three more passes.  With alpha = 1 the move
  is exact in one step on a linear map with one mode excited; the default
  alpha = 0.7 is the paper's damping.  A solver aid, so it reports aloud: the
  numbers above are announced (defaults marked "(default)"), each move prints
  its lambda, and a refused move (|lambda| above the bound, or differences
  not parallel -- a complex dominant pair, which the paper handles with
  iterates half a period apart and Choupo does NOT) falls back to direct
  substitution and prints why.  Opt-in, and honest about its reach: it is
  built for slow geometric loops (lambda near 1); on loops that already
  converge in a handful of passes it matches or trails Wegstein.  A
  recycleSolver word that is none of the three REFUSES, naming them.
* The tolerance is RELATIVE (flows scaled by the tear's total flow, T and P
  by their own value).  `1e-5` is loose; `1e-8` is a good report value.
* These keys live in `solverDict`; do not scatter them elsewhere.

## 3. The tear seed: `0/<tearStream>`

Same grammar as an inlet (T and P, one material form):
```
componentMolarFlows { N2 3 kmol/h;  propane 40 kmol/h;  nButane 10 kmol/h; }
T  270 K;
P  8 bar;
```
* You write it.  `bin/choupo-init0 <case>` (the app's *Case > Complete 0/*)
  fills every OTHER stream by propagating from the inlets and the seeds.
* It only has to be in range: right components, flow within a factor of a few.
  Give every recycled component a small positive flow (a component seeded at
  zero is hard to grow back).
* A graph stream with no `0/` file is refused before any unit runs:
  `0/ COMPLETENESS violated BEFORE the solve ... MISSING  0/recycle`.
* Never put `vaporFraction` beside T and P on a mixture (refused).

## 4. Refusals a newcomer meets

All are one error, exit 2, headed `Flowsheet: the declared unit order is not a
valid sequential plan:` (`Flowsheet.cpp:2510-2524`, texts `:4381-4560`):

* `MISSING TEAR: stream 'recycle' closes the material cycle  M1 -> F1 -> S1
  --recycle--> M1  but is not declared a tear.`  Add it to `tearStreams`.
* `INVALID ORDER: unit 'X' consumes stream 'Y' but is declared BEFORE its
  producer 'Z', and the edge lies on no cycle`.  Reorder.  The message ends
  with `A valid declaration order:  ...`, ready to paste.
* The other tear refusals, each meaning "a tear exists only where a real
  loop is cut": `FORWARD TEAR` (tear only consumed after its producer),
  `OFF-CYCLE TEAR` (points backwards but is on no cycle), `INLET TEAR`
  (nothing produces it), `UNCONSUMED TEAR` (nothing reads it), `UNKNOWN TEAR`
  (misspelled).  Remove or fix the entry.
* `DUPLICATE unit name`, and `stream ... is produced by BOTH ...`: names and
  producers are unique.

## 5. Purge: why a loop needs one

At steady state every component entering the loop must leave it.  A component
that no reaction consumes and that the product streams do not remove (an
inert such as N2 or Ar, or a light impurity) can leave only through a purge.
**Without a purge its concentration in the loop is unbounded**: each pass adds
more, and the tear does not converge.

Build the purge as a `splitter` on the recycle stream:
`fractions ( 0.95 0.05 ); outputs ( recycle purge );`
* Steady inert balance: inert fed fresh = inert leaving by purge + product.
* A smaller purge fraction raises the inert level in the loop (larger
  equipment, lower driving force) but loses less useful material; choose it
  so the inert level stays below what the units tolerate (hand-estimate it).
* Take the purge where the inert is most concentrated (vapour from a flash,
  not the liquid).

## 6. Non-convergence

`WARNING: recycle did NOT converge in N iterations`: the run exits **1** and
`converged/` is NOT written.  Remedies in order: (1) check each unit is
exactly specified and a purge exists; (2) improve the seed; (3) raise
`recycleMaxIter`; (4) switch Newton <-> Wegstein; (5) ease a very sharp
specification inside the loop (e.g. 99.9 % recovery).

## 7. Units used in the example

* `mixer`: `inputs ( a b ); outputs ( m );` `operation {}` = adiabatic, outlet
  P = lowest inlet P.  `operation { T <K>; }` fixes T (its duty is published).
* `isothermalFlash`: `in <s>; outputs ( liquid  vapor );` (LIQUID first).
  `operation { T <K>; P <bar>; }`; an omitted one is inherited from the feed.
  Two numbers fix the flash; the duty is a RESULT.
* `splitter`: `in <s>; outputs ( a b );` `operation { fractions ( fa fb ); }`
  (should sum to 1; otherwise normalised with a warning).  Every outlet has the
  inlet's T, P and composition: it separates nothing.

## 8. Example: flash with vapour recycle and purge

Fresh feed 100 kmol/h (2 % N2, 60 % propane, 38 % n-butane) at 300 K, 8 bar is
mixed with recycled vapour and flashed at 270 K, 8 bar; 90 % of the vapour is
recycled, 10 % purged.  Hand estimate before running: the 2 kmol/h of N2 leave
by purge and liquid only, the liquid dissolves little N2, so the purge carries
most of it and the recycle is N2-rich.

`system/controlDict`
```
application   choupoSolve;
description   "Flash with partial vapour recycle and purge";
verbosity     3;
```
`system/flowsheetDict`
```
units
(
    {
        name     M1;
        type     mixer;
        inputs   ( fresh  recycle );
        outputs  ( mixed );
        operation {}
    }
    {
        name     F1;
        type     isothermalFlash;
        in       mixed;
        outputs  ( liquid  vapor );
        operation { T 270 K;  P 8 bar; }
    }
    {
        name     S1;
        type     splitter;
        in       vapor;
        outputs  ( recycle  purge );
        operation { fractions ( 0.9  0.1 ); }
    }
);
```
`system/solverDict`
```
tearStreams      ( recycle );
recycleSolver    Newton;
recycleTol       1e-8;
recycleMaxIter   50;
```
`constant/thermoPhysPropDict`
```
recordType    thermophysicalPropertySystem;
schemaVersion 2;

components ( N2  propane  nButane );

equilibrium
{
    formulation phiPhi;
    equationOfState { model SRK; mixingRule vanDerWaalsOneFluid; }
    liquid { fugacityRoute equationOfState; root liquid; }
    vapour { fugacityRoute equationOfState; root vapour; }
}

caloric
{
    energyBasis elementsDatum;
    liquid { departureRoute equilibriumEquationOfState; root liquid; }
    vapour { departureRoute equilibriumEquationOfState; root vapour; }
}
```
`0/fresh`
```
componentMolarFlows { N2 2 kmol/h;  propane 60 kmol/h;  nButane 38 kmol/h; }
T  300 K;
P  8 bar;
```
`0/recycle` (tear seed)
```
componentMolarFlows { N2 3 kmol/h;  propane 40 kmol/h;  nButane 10 kmol/h; }
T  270 K;
P  8 bar;
```
Result as run: exit 0, `Recycle converged in 3 Newton iteration(s)
(|r|2 = 4.7e-14)`; liquid 98.59 kmol/h (N2 1.16 %), purge 1.41 kmol/h
(N2 60.3 %), recycle 12.71 kmol/h; global mass closure 100.000 %, energy
residual 0.0000 kW.  N2 check: 0.0116 x 98.59 + 0.6031 x 1.412 = 1.99 = 2.
Delete `solverDict` and the run refuses with `MISSING TEAR: stream 'recycle'
closes the material cycle  M1 -> F1 -> S1 --recycle--> M1`.

<!-- RUN: scratch case; CHOUPO_HOME=/home/vitor/Choupo bin/choupo-init0 . ; choupoSolve .  -> exit 0, converged.
     Variants run: empty solverDict -> exit 2, MISSING TEAR text above; Wegstein + recycleMaxIter 2 + recycleTol 1e-12 -> exit 1, "recycle did NOT converge", no converged/; 0/recycle deleted -> "0/ COMPLETENESS violated". -->
<!-- SOURCES (src/unitOperations/flowsheet/Flowsheet.cpp unless noted)
 tearStreams read from solverDict: :2455; flowsheetDict fallback :339; surfaced :2225.
 recycleMaxIter default 100, recycleTol default 1e-5, recycleSolver default Newton: :3067-3077 (solverDict first, flowsheetDict fallback).
 recycleWegsteinQmin -1.0 / Qmax 0.0: :3203-3204.  Energy feedback forces Wegstein: :3084-3088.
 Newton unknowns = component flows + T + P per tear: :3300-3330; relative scaling :3335-3350.
 validateSequentialPlan and every refusal text: :4381-4560; assembled and thrown :2501-2515.
 Non-converged: "WARNING: recycle did NOT converge" :3272 (Wegstein), :3450 (Newton); return planConverged ? 0 : 1 :4042.
 Exit 2 on a thrown refusal: src/applications/choupoSolve/main.cpp:1627 (measured).
 0/ completeness message: measured in the run.
 Mixer operation { T }: src/unitOperations/mixer/Mixer.cpp:101-105.
 Splitter fractions and normalising warning: src/unitOperations/mixer/Splitter.cpp:90-100.
 Flash T/P from operation else feed: src/unitOperations/flash/IsothermalFlash.cpp:2086-2091; outputs (liquid vapor): docs/ai/unit-ops.md:53 and measured.
-->
