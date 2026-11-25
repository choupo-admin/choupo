# binary04_tangent_plane_water_nbutanol -- how many phases? The tangent plane of water + 1-butanol (cited UNIQUAC)

## The question

A solver has found two liquids with equal activities in both components.  Is
that the answer?  Equal fugacities are only a *necessary* condition of
equilibrium at fixed T and P.  The trivial solution (two identical "phases",
K = 1) meets them at every composition, a split that is only a local minimum of
the Gibbs energy can meet them, and so can a split into the wrong number of
phases.  The equilibrium state is the **global minimum of G**, and what tells a
solver that a phase is *absent* from its answer is Michelsen's tangent-plane
test: draw the tangent to g_mix at the feed z and ask whether the curve dips
below it anywhere.

This case is [`binary01_lle_water_nbutanol`](../binary01_lle_water_nbutanol/)
(the same water / 1-butanol system, the same cited UNIQUAC set of
Winkelman et al., Fluid Phase Equilibria 284 (2009) 71-79, Table 2, 298.15 K,
1 bar) with the optional **`stability` block** of `propertyScanBinary` switched
on.  The EduTool *How many phases? Gibbs energy and the tangent plane* reads
its tables.

## The block

```
stability { feed { water 0.80; } }      // the feed the tangent-plane test is run on
```

The feed defaults to the flash feed.  A case without the block is byte-for-byte
what it was: binary01's tables, CSV and printed output are unchanged.  With it,
besides `gmix` and `binodal`, the operation publishes

| table | columns | what it is |
|---|---|---|
| `activity` | x1, lnGamma1, lnGamma2, a1, a2 | ln gamma and the activity a_i = x_i gamma_i of both components on the grid (100 nodes: x1 = i/100): the iso-activity conditions are read off it |
| `binodalActivity` | x1, lnGamma1, lnGamma2, a1, a2 | the same quantities in each of the two liquids of the flash: equal in the two rows at equilibrium |
| `tpd` | y1, tm | tm(y) = sum_i y_i [ln y_i + ln gamma_i(y) - ln z_i - ln gamma_i(z)] for the declared feed z, along the trial composition y |
| `stationary` | feed1, unstable, tmMin, y1 | the verdict of the engine's own Michelsen test (`solver::michelsenTPD`, `src/solver/StabilityTest.cpp`, called, not re-implemented) on that feed |

and the flash is run at verbosity 3, so the log carries its own Michelsen line
beside the two liquids it found.

## What the run says

```bash
runCase tutorials/props/scan/binary04_tangent_plane_water_nbutanol
```

The feed z = 0.80 (20 mol % butanol) lies inside the miscibility gap.  The
engine's test says **UNSTABLE** -- a phase is absent from a one-liquid answer --
with a lowest tangent-plane distance of tm_min = -0.0366<!--golden: diag lle tpdTmMin-->
(the engine's own modified form, 1 + sum Y (ln Y + ln gamma - h - 1), whose
value at a stationary point is 1 - sum Y) at an incipient phase of
y1 = 0.9821<!--golden: diag lle tpdTrialY1-->, i.e. the water-rich liquid.  The page's own
distance tm(y), computed from the `activity` table, goes down to
-0.0359<!--golden: diag lle tpdGridMin--> at y1 = 0.98<!--golden: diag lle tpdGridMinY1--> on the 100-node grid (the same sign; the two forms
are not equal in value away from a stationary point and are quoted separately).

The flash then finds the two liquids, printed in the log and tabulated in
`binodal`: x1 = 0.980798 and 0.509981 (water-rich and butanol-rich), phase
fractions 0.615991 and 0.384009 for the feed z = 0.80 (the lever rule on the two
compositions gives the same), with equal activities in both liquids
(`binodalActivity`: a1 = 0.985495 and a2 = 0.595831 in each).  These binodal
numbers are the log's and the CSV's; the golden pins the verdict and the
distances above.

## What the checks hold it to

`gui/tests/howManyPhases.test.ts` (read by the EduTool) holds the page to this
run: g_mix in J/mol equals R T sum x_i ln a_i of the `activity` table; for the
declared feed the tm(y) computed from the table equals the engine's `tpd`
table to 1e-9 and tm(z) = 0; the two liquids have equal activities and tm = 0
seen from each other, to the flash's tolerance; the flash's phase fractions are
the lever rule on its two liquids; and the page's verdict (a negative tm
somewhere) is the engine's at the declared feed and follows the binodal for
every other feed on the grid.

## Limits

* One binary on one liquid surface at one T and P.  A ternary, or a model with
  a second hump, has stationary points that are not the global minimum; this
  binary has the trivial solution and the true pair, and no local split.
* The tables are sampled on the grid; a feed closer than one node to a binodal
  composition is decided by the engine's test, not by the table.
* The stability block's feed is one composition; the engine's Michelsen test is
  run once, on it.
* Michelsen's paper (Fluid Phase Equilibria 9, 1982, pp. 1-19) was not read for
  this case; it is cited as the origin of the criterion through the engine's own
  bibliography, and the equations are re-derived from the chemical potential
  (Theory Guide section `sec:tangent-plane`).
