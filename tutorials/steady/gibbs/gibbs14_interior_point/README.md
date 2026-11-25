# `gibbs14_interior_point` — the Gibbs reactor solved by the interior point

**THE CASE.**  gibbs07's cooled water-gas shift (1 CO : 3 H2O at 350 K, 1 bar; the
excess steam condenses), with one line changed: `model interiorPoint;`.  The
answer is the same equilibrium — liquid fraction **0.1426**<!--golden: kpi wgs liquidFraction-->,
y(H2O) in the gas **0.4168**<!--golden: kpi wgs y_water-->, the same element potentials — reached by a
different road, and that road is what this case shows.

## 1. What the student sees

* **The iteration table** (the run prints it at `verbosity 3`; `interiorPoint { log ipLog.csv; }`
  writes it as a CSV for a plot): `mu`, the dual infeasibility, the element-balance infeasibility
  `theta` and the step lengths, one row per iteration.  The solve takes
  **12**<!--golden: kpi wgs ip_iterations--> iterations and needs no seed.
* **The barrier emptying.**  The only variable with a bound that can be active is the liquid water
  (a phase that can vanish), so the barrier parameter `mu` acts on it alone and falls from 0.1 to
  about 1e-9 along the table.  The gas species carry **no** barrier: their entropy term
  `n ln(n/N)` already repels zero, and a barrier on top would only leave a trace species wrong by
  `mu/n` (design record `docs/design/interior-point.md`, review R1).
* **The bridge.**  The multipliers `lambda` of the three element balances ARE the element
  potentials of gibbs07, with the opposite sign: `pi = -lambda` (Theory Guide
  `sec:gibbs-interior-point`).  The run prints `lambda`, `pi = -lambda` and the `pi` the
  element-potential Newton reaches when started from it (it needs 0 iterations: it is
  already there).  The KPIs `lambda_C`, `lambda_H`, `lambda_O` are `pi RT` exactly as in gibbs07; `ip_lambda_C`
  is the raw multiplier, **-17.26**<!--golden: kpi wgs ip_lambda_C -->.

## 2. Things to try

* `barrier everyAmount;` in the `interiorPoint` block: a barrier on every amount, then the element-potential
  polish (which is published).  Same answer, more iterations; compare the iteration counts.  The case
  `gibbs06_h2_flame_radicals` makes the difference large: with a barrier the radicals are off by up to
  2 % until the polish.
* Put `model elementPotential;` back: the amounts agree with this run to 2e-7 (the element-potential
  method closes its element balance only to 1e-8 mol/s and finds the liquid by bisection).

## 3. Where it is enforced

`check_gibbs_interior_point` runs this reactor's family (gibbs01-07, 12 and claus01) under both methods
and requires the same amounts, the same element potentials, `pi = -lambda`, and by-name refusals of a pure
solid (slice B2) and a real-gas package (slice B3).
