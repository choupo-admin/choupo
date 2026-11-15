# Review: the Explorer's P-x-y and mixture-envelope lenses

Date 2026-11-15.  Subject: `origin/explorer/envelope-pxy` at bfddadd2e.
Rows EX-01..EX-08 in docs/reviews/LEDGER.tsv (reviewer branch
`review/ex-explorer-envelope-pxy`, 1e11db7d7).

Verdict: the P-x-y half holds; the envelope half is not ready (two S2: a
false "never started", and an ideal-liquid envelope drawn for water +
organics with no warning).  Leaving phiPhi out is right: its dew points are
an engine defect (EX-05).  The merge is clean.

## What was run

Native build (`make -j4`), npm ci; envelope01-03 and pxy01 natively plus
about 25 scratch variants; the lenses' exact cases dumped through
envelopePlan, binaryPxySpec and serialiseCase; an independent
modified-Raoult check and an independent PR phi-phi check; 7 GUI sabotages
and 1 C++ sabotage; `bin/runTests --scope pxy01`; `bin/runTests --gui -j4`
49 / 0 (gui-tests, typecheck and check_citation included); `git merge-tree`
clean; check_guide_anchors OK (261); check_doctrine clean.  No full sweep,
no make wasm.

## What holds (measured)

* pxy01 by hand (the case's NRTL pair, the records' Antoine laws): all 21
  points to about 1e-11; water end 31471.14 Pa, ethanol end 72217.58 Pa; the
  scan's peak 72691.57 Pa at x = 0.9 (true maximum 72692.86 Pa at x =
  0.8943); measured at 343.15 K (Voutsas et al. 2011): 72.54-72.67 kPa at x
  0.895-0.902, the engine within 0.2 %; a maximum-pressure azeotrope at 70 C
  is physically right.
* Round trip on an ideal-gas vapour: T_bubble 353.500724827 K, P_bubble
  101325.000002 Pa (by hand 101325.0000021).
* P_bubble uses the package's own vapour (BubblePoint.cpp:186-197); the
  0.01 bar floor is the solver's constant (BubblePoint.cpp:200), printed,
  and the lens counts the missing rows.
* The lens's branch verdicts match the engine for envelope01-03; envelope02
  no longer stops (the C245 claim true); the cricondentherm is published only
  for an interior maximum (PhaseEnvelope.cpp:262-282); the CSV and the report
  never join the branches.
* On envelope01 the gamma-phi dew curve agrees with an independent PR
  phi-phi within about 1 K (207.3/208.6 K at 1 bar, 249.6/249.5 K at 10 bar,
  about 275/276.0 K at 40 bar).
* Docs: sec:bubble-pressure and sec:mixture-envelope match the code; anchors
  wired and tested; the four PDFs carry the sections; no commercial
  simulator named.

## Rows

* **EX-01 (S2)**: PhaseEnvelope.cpp:157-166 ends a branch at its first failed
  pressure and :294-301 then says "NO converged point at any pressure"; the
  lens and a test pin "never started".  envelope01's own feed has bubble
  points at 55-56 bar (204.406, 204.873 K); a CH4 0.3 / propane 0.4 /
  nButane 0.3 feed "never started" from 1-60 bar gives 31 bubble points from
  30-60 bar.
* **EX-02 (S2)**: the envelope always uses an ideal liquid and is offered for
  water + organics without the ideal-mixing warning (ExploreWorkspace.tsx:1192);
  water + benzene bubble at 1 bar 362.204 K against a heteroazeotrope near
  342 K.
* **EX-03 (S3)**: "never joined" and "star only where reported" live in a
  figure memo no test renders; both sabotages pass all 24 tests.
* **EX-04 (S3)**: T_bubble uses the y = x vapour (BubblePoint.cpp:51-57),
  P_bubble iterates y; under PR at x = 0.4: 1 atm round trip +1.3e-4, 20 bar
  +7.8e-4 (y 0.55213 vs 0.55423).
* **EX-05 (S2, engine)**: phiPhi DewPoint on envelope01's lean gas: 209.609 K
  at 5 bar, 220.057 K at 10 bar, fatal at 1, 20 and 40 bar, against an
  independent PR 235.8 and 249.5 K.  Likely cause: the `ideal` activity
  placeholder of a phiPhi package (ThermoPackageBuilder.cpp:3068-3071) makes
  DewPoint take one outer pass (DewPoint.cpp:69-71), so the incipient liquid
  is never iterated away from x = y.
* **EX-06 (S3)**: P-x-y drawn with a supercritical component (to 317.6 bar on
  a continued Antoine law); the warning only in the footer.
* **EX-07 (S4)**: pxy01's water Psat from Antoine (31.471 kPa vs IAPWS-95
  31.20 kPa), not stated in the header.
* **EX-08 (S3)**: the round-trip golden row's state P equals its expected
  answer, so a P_bubble returning the state pressure passes it.

## Sabotage table

| # | sabotage | caught by | result |
|---|---|---|---|
| 1 | join the branches in readEnvelopeCsv | phaseEnvelopeLens test | CAUGHT |
| 2 | join the branches in the figure | nothing | MISSED |
| 3 | star an unreported cricondentherm in the report | phaseEnvelopeLens test | CAUGHT |
| 4 | star one in the figure | nothing | MISSED |
| 5 | interpolate unanswered P-x-y rows | pxyLens test | CAUGHT |
| 6 | swap the axis component | pxyLens tests | CAUGHT |
| 7 | treat never-started as stopped | phaseEnvelopeLens test | CAUGHT |
| 8 | P_bubble returns the state P | pxy01 peak row, pxyLens test | CAUGHT (round-trip row blind) |

(Written into the tree by the coordinator from the reviewer's hand-back:
the harness refuses report files written by a subagent.)

## Round 2 and landing (2026-11-15): 9e597393e

The builder answered EX-01..03 and EX-06..08 (a branch now marches past
failures to its first converged point; the envelope lens takes the T-x-y's
activity models and flags a split binary liquid; the figure built by a
tested pure function; the round-trip row at 0.5 atm) and documented EX-04;
the three sabotages the review left uncaught are now caught.  Merged on
main after C398 (c)+(d): --fast 87/0, --scope over pxy01 and envelope01-04
6/0, --gui 49/0; the route bench re-recorded (5 new sealed copies
relabelled, no value moved).
