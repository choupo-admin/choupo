# Review: the phiPhi dew- and bubble-point fix (EX-05)

Date 2026-11-15.  Subject: `origin/fix/dewpoint-phiphi` at 2788b59f9.
Rows DP-01..DP-06 in docs/reviews/LEDGER.tsv (reviewer branch
worktree-agent-ae45bfe59e297d27b, a0f92b491).  First review of a change to
the shared saturation solvers, on the session's strongest model.

Verdict: not ready (two S2, two S3, two S4).  The fix is right where the
builder measured it: envelope05's 77 points match an independent Newton PR
phi-phi solver to 0.0005 K, no golden moved, 53 cases byte-identical.  But
the new dew-point refusal rejects correct pure-fluid and azeotropic dew
points, and a near-critical bubble point is published as converged at a
wrong T.

## What was run

Both commits built, each with its own library; an independent PR phi-phi
solver (full Newton on (ln K, T) continued in P) and an SRK one for column08;
58 shipped cases on both commits (all 19 phiPhi, every dewT/bubbleT unit,
T_bubble key, envelope/scan op, plus column14, ammoniaPEQ03, temperature02,
hda), every output compared after normalisation; about 20 probes (pure
fluids, a CO2/ethane azeotrope at kij 0.13, near-critical mixtures, a lean
gas); 7 sabotages.  No full sweep.

## What holds

* envelope05: dew 208.5608 (1 bar), 235.8177 (5), 249.4723 (10), 263.6140
  (20), 271.3760 (30), 276.0337 (40) K; bubble 201.0126 (45), 201.9554 (46),
  205.6524 (50), 214.5677 (60) K, all within 0.0005 K of the independent
  solver.
* No golden moved: 53 cases byte-identical, envelope01-04 differ only by four
  added diagnostics; no shipped phiPhi case runs a bubble point outside
  envelope05 (column08 takes its own route; relief01 never reaches its fire
  scenario).  Gamma-phi byte-identical.

## Rows

* **DP-01 (S2)**: DewPoint.cpp:116 refuses any dew point with x = y, which is
  always true for one component and at an azeotrope: pure propane at 10 bar
  300.0733 K reported NO (exit 2), nButane at 5 bar 323.5036 K NO, the
  CO2/ethane azeotrope at 20 bar 247.6830 K NO; all converged on f6d3f25c2.
  Removing the clause alone is not the fix: pure CH4 at 20 bar is then
  accepted as 200.0000 K.  Refuse x = y only when the cubic's two roots
  coincide.
* **DP-02 (S2)**: envelope05's feed at 82 bar: bubble 234.0275 K "yes",
  exit 0, against an independent 235.255 K (f6d3f25c2 said NO); successive
  substitution collapses to y = z, `incipientPhase`'s converged flag ignored
  (BubblePoint.cpp:61-64, DewPoint.cpp:84-88).
* **DP-03 (S3)**: asymmetric brackets: the dewT unit passes 200 K
  (DewPoint.cpp:268), bubble keeps 200 K (BubblePoint.cpp:151); envelope05
  misses bubble points at 1-43 bar (true 113.8-199.1 K) and its golden pins
  that; PhaseEnvelope.cpp:320, 343, 380 still say 200-700 K.
* **DP-04 (S3)**: two sabotages uncaught (Wilson seed -> Raoult; the
  compDelta clause removed alone).
* **DP-05 (S4)**: column08's feed dew points move 378.94 -> 380.06 K and
  435.23 -> 435.48 K (q 1.4762 -> 1.4724, 1.8623 -> 1.8603), unpinned; the
  new values are correct (independent SRK 380.0620 K).
* **DP-06 (S4)**: the Theory Guide paragraph and check_phase_envelope.py
  docstrings do not match the code.

## Sabotage table

| sabotage | gate | envelope05 golden | column08 golden |
|---|---|---|---|
| one-pass shape | FAIL | FAIL | PASS |
| Wilson seed -> Raoult K | PASS | PASS | PASS (uncaught) |
| Wilson seed -> K = 1 | FAIL | FAIL | PASS |
| trivial-root test removed | PASS | FAIL (one row) | PASS |
| bubbleK back to y = x | FAIL | FAIL | PASS |
| dew tolerance 1e-3 | PASS | FAIL (one row) | PASS |
| compDelta clause removed alone | PASS | PASS | PASS (uncaught) |

(Written into the tree by the coordinator from the reviewer's report.)

## Round 2 and landing (2026-11-15): 3d39de689

DP-01..06 answered: the refusal is the coincident-root test (pure propane,
nButane and the CO2/ethane azeotrope converge at the independent values;
pure CH4 at 20 bar is a genuine dew point, 165.6442 K, and at 60 bar is
refused); the incipient phase's converged flag honoured, the 82 bar bubble
point refused with the physics named; 100-700 K for every phiPhi caller;
column08's feed dew points pinned.  The Raoult-seed sabotage stays
uncaught: both seeds converge to identical answers on every probe.
