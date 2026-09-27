# An equilibrium that runs to completion

*2026-09-27.  A follow-up to commission C11 (DEV.md §4c;
[`a-declared-pathway-and-its-approach.md`](a-declared-pathway-and-its-approach.md)).
Status: SHIPPED.  Kind: ADR.*

## 1. The failure, reproduced

C11 recorded the Ostwald witness as NOT BUILDABLE.  Ammonia in air (10 %
NH3, O2 : N2 = 21 : 79), 1100 K, 1 bar, ideal gas, `equilibriumReactor`
with the one declared reaction

    4 NH3 + 5 O2  <->  4 NO + 6 H2O        (N 4=4, H 12=12, O 10=10)

stopped with

    ERROR: equilibriumReactor: Newton stalled at residual 17.864465
    (no feasible descent step)

reproduced on a scratch case at `main` f5e5cf3f1 before any change.  The
same feed at 5 bar stalled at 16.26, and with the N2 route declared too
(the complete set, 4 NH3 + 3 O2 <-> 2 N2 + 6 H2O) at 69.77.  C11 also
recorded, MEASURED and NOT DIAGNOSED, that the complete methanol set of
`equil02` stalled at 500 K (residual 20.7).  It is the same defect.

## 2. The root cause

`Reaction::equilibrium` prices ln Kp = 121.515 for the NO route at 1100 K.
At full conversion the declared equilibrium

    4 ln y_NH3 = 4 ln y_NO + 6 ln y_H2O - 5 ln y_O2 + ln(P/P0) - ln Kp

leaves y_NH3 = 1.12e-14 at 1 bar.  The solver at f5e5cf3f1 had two
properties that together made that answer unreachable:

* **Its unknowns were the reaction extents** (`EquilibriumReactor.cpp:156-166`
  at f5e5cf3f1, `n_i = n0_i + Sum_j nu_ij xi_j`).  Every amount is then the
  feed MINUS a multiple of an extent, and an amount of 1e-14 of the feed is
  the difference of two numbers equal to fourteen digits.  Double precision
  carries sixteen digits of n0, not of what is left of it: the answer is
  barely representable at 1e-14 and not at all at 1e-17 (the complete set's
  NH3 is 5.7e-18 at 5 bar).
* **It held every logged species above a floor** (`interiorEps = 1e-12 F_in`,
  `:172`; `isInterior`, `:173-178`; the fraction-to-boundary step,
  `:320-326`).  The answer sat below the floor, so no feasible step could
  reach it, the backtracking found no descent, and the reactor refused.  The
  refusal was honest; the formulation was what failed, not the chemistry.

The 500 K methanol stall is the same pair: CO and methanol there are traces
of the complete set's outlet, and the extent Newton could not approach them
through its own subtraction and floor.

A third, smaller silence rode with it: `lnKp = log(max(1e-300, Kp))`
(`:94` and `:423` at f5e5cf3f1) took the logarithm of an already
exponentiated constant.  A reaction with ln Kp below -690.8 was silently
FLOORED there, and one above +709.8 overflowed Kp to infinity and the
residual to a non-finite number.

## 3. What was built

**The unknowns are x_i = ln n_i** for every species a declared reaction
touches (the LOGGED species); a species no reaction touches is inert and
enters only n_total.  The reaction subspace n - n0 in span(nu) is written as
its INVARIANTS: every vector w with nu w = 0 gives one linear conservation
law W (n - n0) = 0.  For a complete set these are the element balances; for
a declared subset there are more of them, one for each pathway the list
closes.  R equilibrium equations and L - R invariants in L unknowns:

    g_j = Sum_i nu_ij (x_i - ln n_tot + ln P/P0) - ln Kp_j   = 0
    h_k = Sum_i w_ki (exp(x_i) - n0_i) / F_in                = 0

* The **equilibrium residual g is the one the extent solver had** (same
  equation, same ln units, same 1e-10 tolerance); the invariants close to
  1e-12 of the feed.
* **The Jacobian is analytic**: dg_j/dx_i = nu_ij - (Sum_l nu_lj) n_i/n_tot,
  dh_k/dx_i = w_ki n_i / F_in.
* **Independence is checked on nu, up front**, reducing the rows in declared
  order, so the refusal names the first reaction the earlier ones already
  span ("LINEARLY DEPENDENT (reaction 'x' is a combination of the reactions
  declared before it)").  The reduced rows give W directly.
* **The seed is the old interior start** (5 % of each reaction's forward and
  backward limit, the foothold repair loop, and its refusal when no reaction
  can give a species a foothold).  Its 1e-12-of-feed level is now what a
  SEED must clear to have a logarithm at all, renamed `seedFoothold`; it is
  never a bound on the answer.
* **Step control** adapted from the control factor of Gordon & McBride's
  CEA (NASA RP-1311, 1994): a species above y = 1e-8 moves by at most a
  factor e^2 per iteration, a trace species that rises may not pass
  y = 1e-4 in one step, and a trace species that falls is not held at all.
  CEA also caps by the change of ln n_total; that term is omitted here.
  Without the control a strongly favoured reaction overshoots its products
  by orders of magnitude on the first step (measured on a hexadecane
  combustion probe at 300 K, ln Kp = 8243: the uncontrolled iteration
  wandered to a singular Jacobian; the controlled one converged in 15
  iterations with hexadecane at ln n = -4114).  Then Armijo backtracking on
  ||F||^2; forty halvings without a decrease THROWS.
* **The outlet is exp(x)** for the logged species and the feed for the inert
  ones: a trace species is published at its own value, never as a
  difference, and nothing is clamped or snapped.
* **The extents are recovered** from n - n0 by weighted least squares,
  (nu D nu^T) xi = nu D (n - n0) with D = 1/(n + n0).  n - n0 lies in the
  span of nu to the invariant tolerance, so every weighting returns the same
  extents up to round-off; D decides WHICH round-off, so a trace product
  (methanol at 1.8e-10 in equil02's complete set) fixes its reaction's
  extent to its own digits.  The unweighted form was measured first and
  moved that extent by 2e-6 relative against the old solver, all of it the
  absolute noise of the major species.  The KPIs, the duty and the approach
  probe read these extents exactly as before.
* **ln Kp is carried, not re-derived**: `Reaction::Equilibrium` gained
  `lnKp = -dG/RT` (Reaction.H, the struct; Reaction.cpp, the return line --
  the line count of `Reaction::equilibrium` unchanged, because
  `equilibriumLandscapesLesson` cites Reaction.cpp:136-149).  The
  `1e-300` floor is gone.

**Two representation limits remain, and each is SAID when it binds.**  A
converged ln n below about -745 has no double: that species is published as
exactly 0 and the run announces its ln n (console + `AdvisoryLog`).  A Kp
beyond a double is not published as the KPI `Kp_<name>` (it would be inf or
0); the run announces its ln Kp instead.  Neither touches the solve, which
reads only logarithms.  Both were fired by hand on the hexadecane probe.

**Convergence.H.**  The unit did not route its verdict through
`src/solver/Convergence.H` before this change, and it does not now: the
equilibrium residual is already in ln units, a relative error of Q_j, so its
raw tolerance is a verdict and not an unscaled magnitude.  Wiring it is a
separate question for the normalized-residual record's §4 list, not done
here.

## 4. Rejected alternatives

* **Loosen the floor** (1e-12 -> 1e-30 of the feed).  Rejected in C11 and
  again here: the floor was not the only obstacle.  The extents would still
  place the answer behind a subtraction, which cannot represent 1e-17 of a
  feed at all, and a smaller floor only moves the stall to the next
  reaction that runs a little further.
* **Extents with a logarithmic barrier** (interior-point on xi).  It removes
  the floor but not the subtraction: the barrier term ln(n0 - |nu| xi) is
  evaluated on exactly the difference that loses its digits.  An
  equilibrium at 1e-30 of the feed is still not representable.
* **A per-reaction change of variable** (solve for the ln of each reaction's
  limiting species).  Works for one reaction, but which species is limiting
  depends on the answer, and in a coupled set one species is shared by
  several reactions; a choice made in code would be a rule nobody declared.
* **Reuse the Gibbs reactor's solver with W as the "element" matrix.**  The
  declared-set equilibrium IS a Gibbs minimum under the invariants W, and
  that is how this record reads the complete-set agreement.  But W carries
  non-integer and negative entries, `gibbsReactor` takes species with atom
  lists, and `GibbsReactor.cpp` is cited by line from six files under
  `gui/src`.
  The structure is shared; the code is not, and saying so is cheaper than
  a refactor with that reach.
* **Keep the extent solver and fall back to ln n when it stalls.**  Two
  formulations with a silent switch between them is the crutch §10 rules
  out, and a fallback is only tried on the cases that already failed, so
  its behaviour on the others would be tested by nobody.
* **A ln n Newton without step control.**  Measured to fail (above).

## 5. What it changed, measured

Every case that runs `equilibriumReactor` in the corpus is two:
`equil01_reforming` and `equil02_methanol_declared_pathways` (every
`gibbsReactor` case was run too; GibbsReactor is untouched).  Against a
build of f5e5cf3f1, every number in the result JSON of both cases agrees to
1e-9 relative except:

| number | f5e5cf3f1 | this change | why |
|---|---|---|---|
| equil01 `newtonIterations` | 10 | 12 | a different formulation takes a different path |
| equil01 `newtonResidual` | 3.26e-13 | 8.9e-16 | the same, below the golden's 1e-9 absolute floor |
| equil02 `complete.newtonIterations` | 36 | 14 | as above |
| equil02 `declared.newtonIterations` | 9 | 7 | as above |
| energy-closure residuals | 0 to 2e-13 kW | 4e-14 to 4e-11 kW | the invariants close to 1e-12 of the feed, not to the last bit; below the microwatt floor runTests applies |

equil02's complete set now agrees with the Gibbs reactor on EVERY species
to the last printed digit (methanol at 1.76e-10 included); the extent
solver differed from it by 5e-11 relative on methanol.  equil02 swept over
350-1200 K at 1, 50 and 200 bar converges everywhere under the new solver;
the old one, at 50 bar, stalled at 350, 400, 450 and 500 K.  The C11 500 K stall is
therefore DIAGNOSED: it was this formulation.  (At 450 K and below, at
50 bar, the Gibbs reactor and the complete set part company, and the reason
is the PHASE, not the reactions: the Gibbs reactor's `gas + liquid` method
condenses water there -- liquid fraction 0.28 at 450 K, 0.42 at 350 K,
condensate stream emitted -- while `equilibriumReactor` is gas-only.  The
page's temperature slider stays at 525-625 K.)

The golden row that moves is `equil01 kpi reformer newtonIterations` (10 ->
12).  It was NOT re-recorded: a moved row goes to Vítor first.

## 6. The witness

`tutorials/steady/reactors/equil03_ammonia_oxidation_declared_pathways`,
the shape of equil02: one feed, three reactors.  At 1100 K and 5 bar:

| reactor | declares | outlet |
|---|---|---|
| `gibbs` | every species | y_N2 0.742405, y_NO 6.78e-5, y_NH3 5.66e-18 |
| `complete` | both routes | the Gibbs outlet, every species to the last printed digit |
| `declared` | the NO route only | y_NO 0.0976, conversion 1, y_NH3 1.68e-14 |

The declared y_NH3 recomputes by hand from the case's own ln Kp (121.515)
and outlet fractions to 1.6765e-14.  The exclusion of the N2 route is the
student's premise, cited to nothing: nothing in the tree documents the
selectivity of an ammonia-oxidation catalyst.  Sealed (Choupo-2608).  No
golden recorded (no `--record` authority); the rows a record would add are
in the general's report.

## 7. The gate, and the sabotages

`bin/curate/check_reaction_subset_approach.py` gained three arms:

* **(j)** equil03: the complete set reproduces the Gibbs reactor on every
  species above 1e-30 (1e-6 relative), the NH3 at 5.7e-18 included; the
  declared list leaves the fed N2 untouched; the declared NH3 is recomputed
  from the declared equilibrium with the run's own Kp (1e-6), and must sit
  below the old 1e-12 floor.
* **(k)** a dependent set (the NO route declared twice over beside the
  complete list) refuses naming the doubled reaction.  A REGRESSION GUARD,
  not a discriminator: the extent solver refused the same set by its
  Jacobian pivot.
* **(l)** a BUILT fixture (unsealed, catalogue records): 2 C16H34 + 49 O2
  <-> 32 CO2 + 34 H2O at 300 K, ln Kp 8243.  It must converge, publish the
  hexadecane as exactly 0 with its ln n announced, and withhold `Kp_burn`
  with its ln Kp announced.  No corpus case reaches either limit.

By-hand sabotages, each restored and rebuilt:

| sabotage | result |
|---|---|
| S1 the engine library of f5e5cf3f1 swapped in | (j): "Newton stalled at residual 16.255028" |
| S2 the outlet published as n0 + nu xi (the subtraction) | (j): complete NH3 0 against Gibbs 5.66e-18; declared NH3 1.67549e-14 against the hand value 1.67654e-14 |
| S3 the N2 route opened in the witness's declared list | (j): "N2 moved" |
| S4 the step control removed | SURVIVED arms (a)-(k): no corpus witness needs it.  (l) was then built for it, and caught it: "Newton on ln n stalled at residual 21.896798" |
| S5 the underflow announcement removed | (l) |
| S6 Kp published unconditionally | (l): Kp_burn published, the withholding not announced |

S4 is the durable half: a control that only an extreme case needs is a
control no witness tests, and it went unguarded until a fixture was built
for it.  A trap paid for while sabotaging: restoring a source with its OLD
modification time (`shutil.copy2`) left make believing the sabotaged object
was current, so the tree ran the sabotaged engine after the "restore" until
the source was touched and rebuilt.  Restore with a NEW mtime.

## 8. NOT done

* The duty of `equilibriumReactor` still sums `h_pure_ig` (named in C11's
  record, §7; untouched).
* Convergence.H (§3).
* A liquid phase: `equilibriumReactor` stays gas-only, which is where the
  Gibbs reactor and the complete set part company below about 450 K at
  50 bar on equil02.  (A PURE SOLID phase is not a liquid and was added
  the same day on top of this formulation, C14 slice 2: a solid
  participant's column carries ln a_s while it is absent and n_s/F while
  it is present, and a case with no solid takes the path described here,
  byte for byte -- record
  [`a-solid-in-a-declared-reaction-set.md`](a-solid-in-a-declared-reaction-set.md).)
