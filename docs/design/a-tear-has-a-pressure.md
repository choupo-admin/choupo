# A tear has a pressure

*Kind: ADR.  Status: BUILT 2026-11-01 (DEV.md 4c C186 item 5 and the open
note on the sibling drivers).  Gate: `check_driver_convergence`.*

---

## 1. The two defects, reproduced before they were fixed

| # | repro | main answered | the answer |
|---|---|---|---|
| A | mixer(feed 5 bar + recycle) -> pipe (about 2 bar drop, no pump or valve) -> splitter, the recycle torn, Newton | "Recycle converged in 1 Newton iteration(s) (\|r\|2 = 1.086e-10)", exit 0; the tear is handed 5.000 bar and the loop returns 3.006 bar, and the next pass would hand it lower still | refuse: the loop has no pressure-consistent steady state |
| B1 | `sweep` over an unconverged recycle (cavett01, `recycleMaxIter 2`) | the table holds the last iterate's responses as numbers | those points are failed: nan, named |
| B2 | `gridSweep` over the same | only a THROW was a failed point; an unconverged point published numbers | the same |
| B3 | `designSpec` over the same | the targets were read off the last iterate and Newton "solved" them | an unconverged evaluation is infeasible, named with its point |

## 2. Why A happened

`packTears` (Wegstein) and `packFlow` (Newton) carried F, z (or the component
flows) and T per tear, and not P.  The tear stream's P in the next sweep was
whatever the previous sweep's producing unit had left in the registry: a
function of the PATH, not a variable of the problem.  A loop whose units drop
the pressure and nothing in it sets one returns a lower P every pass and the
test, which never looked at P, saw a fixed point.

## 3. The rule

**Pressure is a tear variable.**  P rides in both tear vectors (Wegstein:
`[F, z..., T, P]` with P in bar, so the absolute L2 norm weighs it as it
weighs K and kmol/s; Newton: `[F_i..., T, P]` scaled by P), is set from the
trial vector before each sweep, and is part of the convergence test.  When a
recycle does not converge, every tear whose pressure is the reason is named,
with the pressure it was handed and the one the loop returned
(`[recycle] tear 'recycle': the loop does not close on PRESSURE ...`), on
stdout, stderr and the advisory log; the run exits non-zero and writes no
`converged/`.  A loop that does set a pressure (a valve to a fixed P, a pump
to a head) converges as before.

**Every outer driver reads a point through `simulationFailure`.**  The one
verdict moved from `OptimizationDriver.cpp`'s anonymous namespace to
`ResponseExtractor.{H,cpp}` so `sweep`, `gridSweep` and `designSpec` call the
same function: a failed point is named with its coordinates, counted, and a
sweep publishes it as `nan` (never as numbers); a run whose every point
failed refuses by name; `designSpec` throws `InfeasibleTrial` for a
trial and refuses the replay at the design point.

## 4. Corpus reach (measured, 2026-11-01)

The new binary was run over the 260 outerDict-free choupoSolve steady and
plant cases: 26 enter a recycle loop, none prints a pressure refusal.  The
scoped suite over those plus every tear case and every outerDict case
(53 cases) moved two golden rows, each listed to the commander and not
re-recorded; see the commit message.

## 5. Found, not fixed

`Flowsheet.cpp` `runUnit` (`if (s.P <= 0.0) s.P = P_inherit;`) replaces a
non-positive published pressure with the inlet pressure.  The pipe publishes
a NEGATIVE outlet pressure when its drop exceeds the inlet and warns; the
registry then holds the inlet's P, so a pressure-inconsistent loop with a
large drop reaches a spurious fixed point (Wegstein, 0.099 bar) that the new
test correctly cannot see through.  The gate's fixture uses a small drop for
that reason.  The sentinel "0 means the unit did not set P" is legitimate; a
NEGATIVE P is a different fact and deserves its own refusal, which needs the
corpus measured (trial iterates of Newton probes may be negative and
recover).  Open.

## 6. The gate

`check_driver_convergence` builds its fixtures from text (a pipe01-data
water loop, with and without a valve; cavett01 copies at `recycleMaxIter`
2, 8 and 300) and checks: (a) the pressure loop refuses under Newton and
Wegstein while the valve loop converges; (b) all-fail sweep/gridSweep/
designSpec refuse by name, name the points and write nan only; (c) a partly
failing sweep has as many nan rows as FAILED lines, finite elsewhere; (d)
the converging copy is unchanged; (e) every `simulator_(` call in the three
drivers is followed by `simulationFailure(` before its result is read, the
verdict is defined once, and the tear packers carry P.

Sabotages (by hand, restored, engine rebuilt) are recorded in the gate's
docstring.
