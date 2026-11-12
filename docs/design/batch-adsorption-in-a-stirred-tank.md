# Batch adsorption in a stirred tank

*EduTool `batch-adsorption`, 2026-11-12.  The page after
`adsorption-isotherms`; the record of that page is
[`adsorption-isotherms-from-laboratory-data.md`](adsorption-isotherms-from-laboratory-data.md).*

## 1. The task

"I have a tank of solution and an adsorbent with a known isotherm; how much
adsorbent do I need, is it better split into stages, and how long does it
take?"  It serves a course unit on adsorption whose problems are of these
kinds: the final concentration and the percentage removed for a given dose;
the dose for a target removal; the same adsorbent split into two successive
stages; the time to reach a target with external mass-transfer resistance and
a linear isotherm; which particle size to prefer.

## 2. What the engine has, measured

Read on 2026-11-12, not recalled:

* `src/unitOperations/batch/BatchAdsorber.{H,cpp}` -- a CLOSED, isothermal
  **gas**-solid vessel: an ideal-gas headspace, `p_i = n_gas_i R T / V_gas`,
  LDF uptake `dq_i/dt = k_i (q*_i - q_i)` with the coefficient declared in the
  case.  `FixedBedAdsorber` beside it is a gas-phase bed.
* `src/thermo/adsorbent/IsothermModel.cpp` registers `henry` and `langmuir`,
  both in partial pressure.  No Freundlich model exists anywhere in `src/`.
* No liquid-phase adsorption unit exists.

A concentration in mg/L cannot be handed to a model that reads a partial
pressure without a units lie, so **every number on the page is the page's own
arithmetic**, in `gui/src/case/batchAdsorption.ts`, and every panel is marked
`page` (computed) or `assumption` (an input).  The isotherm itself is NOT
re-implemented: `qStar` calls `isothermQ` of `gui/src/case/adsorptionIsotherms.ts`
and the single-stage dose goes through that file's `batchDose`.  The page's
one structural tie to the engine is conceptual: the film model of step 4 is
the liquid-side analogue of the LDF law the engine's `batchAdsorber`
integrates for a gas (Theory Guide `eq:ldf`).

## 3. What the page computes

One basis: c in mg/L, q in mg/g, V in L, M in g, so V c and M q are both mg.

1. **One stage.**  The root of `f(c) = V(c0 - c) + M(q0 - q*(c))` by
   bisection on `[0, c0 + M q0/V]`; `f` falls monotonically, is positive at
   the left end and negative at the right, so the bracket always holds.
   Stops at a bracket width of 1e-15 of its upper end.  The loading is taken
   from the BALANCE, not from the isotherm, so the stage balance closes to
   round-off whatever the bracket.  Closed forms beside it: linear
   `c = (V c0 + M q0)/(V + M K)`; Langmuir the positive root of
   `V c^2 + (V K_L + M q_max - A) c - A K_L = 0`, `A = V c0 + M q0`, written as
   `2 A K_L/(b + sqrt(b^2 + 4 V A K_L))` to avoid cancellation.
2. **Dose.**  `M = V(c0 - c)/(q*(c) - q0)`; for a linear isotherm
   `M = (V/K) R/(100 - R)`.  A pre-loaded adsorbent cannot take the liquid
   below `c*(q0)`, and a target there is REFUSED by name (never clipped).
3. **Stages.**  Crossflow: fresh adsorbent in each stage, any split.
   Countercurrent: one solid stream through N stages, shooting on the outlet
   concentration `c_N` (march back through
   `V(c_{k-1} - c_k) = M(q_k - q_{k+1})`, bisect until the march returns the
   declared c0; the bracket `[0, c0]` is checked, not assumed).  Each
   arrangement returns its overall and per-stage balance errors, recomputed
   from the stage states.  Best split of a fixed total between two crossflow
   stages by golden section; the unimodality it relies on is checked by the
   tests on a 999-point grid.
4. **Film kinetics.**  `-dc/dt = k_L a (c - c*(q))`, `q = V(c0 - c)/M` (fresh
   adsorbent), the particle uniformly loaded.  Linear isotherm: derived on the
   page, `c(t) = (c0/beta)[exp(-k_L a beta t) + alpha]`, `alpha = V/(M K)`,
   `beta = 1 + alpha`.  Langmuir and Freundlich: RK4 with step doubling
   (absolute tolerance 1e-9 c0 per step), and the page says that is what is
   drawn.  `k_L = Sh D_AB/d`, `Sh = 2` by default (the stagnant lower bound, which
   a stirred tank exceeds by one to two orders of magnitude, section 8; the student
   may declare another), `a = 6 M/(rho_p d V)` with `rho_p` the PARTICLE
   density.  Time to a target: closed form for linear; otherwise RK4 until the
   target is crossed, the crossing step bisected.
5. **Biot.**  `Bi = k_L R_p/D_e`, `D_e` an input marked `assumption`; the
   internal resistance over the film's is `Bi/5` in Glueckauf's LDF
   approximation (series `1/k_L + R_p/(5 D_e)`), and the page warns when it
   exceeds 0.1.  No pore-diffusion solver.

## 4. Findings, measured (the tests hold each)

* Closed forms against the root solve: Langmuir agrees to < 1e-12 relative
  at M from 1 to 2000 g, fresh and pre-loaded; linear to < 1e-13.
* Every arrangement (crossflow and countercurrent, N = 1..4, three
  isotherms) closes its balance, overall and stage by stage, below 1e-10
  (measured values are of order 1e-16).
* **The best two-stage crossflow split.**  Linear: exactly one half at every
  dose (`|f - 0.5| < 1e-6`, equal to the equal-split outlet to 1e-12), as the
  algebra says.  Favourable Langmuir (`q_max` 200 mg/g, `K_L` 4 mg/L) and
  Freundlich (`K_F` 30, `n` 0.3), 100 L at 50 mg/L, M = 20, 50, 100 g: the
  optimum puts MORE than half in the first stage.  Langmuir at 50 g:
  f* = 0.687, c_out 0.922 mg/L against 1.146 mg/L for an equal split (removal
  98.16 % against 97.71 % -- a small change in removal and a 20 % change in
  what is left).  Freundlich at 20 g: f* = 0.519, an almost negligible gain.
  An UNFAVOURABLE Freundlich (`n` 1.5) puts LESS than half in the first
  stage (f* = 0.432).  So "equal split is optimal" is true for the linear
  isotherm only, and the size of the departure depends on the isotherm and
  the dose.
* Countercurrent beats crossflow at equal mass for N >= 2 on all three
  isotherms; for the linear one, two stages give `c2/c0 = 1/(1 + a + a^2)`
  against `1/(1 + a/2)^2` (a = 1: 1/3 against 1/2.25).
* When the dose saturates the solid (Langmuir, 10 g in 100 L at 50 mg/L, the
  solid at 89 % of `q_max`), staging buys almost nothing (35.6 % removal in one
  stage, 36.2 % in four crossflow, 37.0 % countercurrent): the capacity, not
  the equilibrium concentration, is the limit.
* Linear kinetic closed form against RK4 on the same ODE: < 1e-8 mg/L at
  every step; its derivative satisfies the ODE to 1e-6 (central difference);
  the time to a target by the closed form and by the RK4 route (the same
  isotherm written as Freundlich with n = 1) agree to 1e-7.
* Time scales as d^2 for all three isotherms (ratio 4.000000 at 2d, to 1e-6),
  because d only multiplies k_L a when Sh is fixed.  That is the still-liquid
  result: in a stirred tank Sh grows with d (Treybal Eq. 11.29) and the time
  grows nearer d^1.2 (section 8).
* **The Biot number does not depend on the particle diameter at fixed Sh.**
  `Bi = (Sh/2) D_AB/D_e`; at Sh = 2 it is `D_AB/D_e`, larger than one for any
  porous particle, so the internal resistance is at least a fifth of the
  film's and the film-only model is flagged at every diameter.  The brief
  asked for a flag "when the chosen particle size makes the film-only model
  unreliable"; under this model the particle size does not enter, and the page
  says so.  The size enters through Sh in an agitated tank (Treybal Eq. 11.29; Harriott
  1962 is cited as further reading), which the page lets the student declare.

## 5. Proposal for the engine side (NOT built)

A liquid-phase batch adsorber would share almost everything with
`batchAdsorber`: replace the ideal-gas headspace by a liquid inventory
`n_liq_i = V c_i`, read the isotherm in concentration, and keep the LDF law
(whose coefficient for a film-controlled particle is `3 k_L/(R_p) /
(rho_p dq*/dc)` in the linear limit).  It needs (a) a liquid-phase isotherm
record grammar in concentration with a declared basis, (b) a Freundlich
`IsothermModel` (with the refusal that it has no Henry limit), and (c) a
decision on whether the film coefficient is declared or correlated.  Each is
an architecture change and is Vítor's to authorise; the isotherm page's
record proposes (a) and (b) as well.

## 6. Limits

One temperature, no heat of adsorption; one solute; a perfectly mixed tank;
Sh = 2 is a lower bound for a stirred tank and gives times one to two orders of
magnitude too long for one (section 8); the particle is uniformly loaded
(no internal gradient solved -- only flagged by Bi).  The example isotherms
are the page's own illustrative numbers, not measurements, and say so.

## 7. Source check -- every published form the page states, against the book it came from

Read on 2026-11-12 in the library copies named below (page numbers are the books' printed
numbers; Ruthven is a scan, OCR'd and read as images, the others by text with the equation
images rendered where the text layer drops them).  The page was first written from memory;
this table is what reading did to it.

Works read: **G** Geankoplis, Hersel & Lepek, *Transport Processes and Separation Process
Principles*, 5th ed., Pearson 2018, ch. 28 and sec. 21.3; **S** Seader, Henley & Roper,
*Separation Process Principles with Applications Using Process Simulators*, 4th ed., Wiley
2016, ch. 15 (the first draft named the 3rd ed. of 2011; the copy in hand is the 4th and
every page below is its); **T** Treybal, *Mass-Transfer Operations*, 3rd ed., McGraw-Hill
1980, ch. 11; **R** Ruthven, *Principles of Adsorption and Adsorption Processes*, Wiley 1984,
ch. 6; **dH** de Haan, Eral & Schuur, *Industrial Separation Processes*, 2nd ed., De Gruyter
2020, ch. 6.  Wankat (2nd ed., ch. 17) has no batch-stage or film-rate equation and is not
cited by a row.  The course slides were used as a guide to notation only.  The isotherm rows
were checked in section 7 of the isotherm page's record, which this page imports; they are
repeated here with their pages.

| # | form the page states | where I read it | page (file:line) | verdict |
|---|---|---|---|---|
| 1 | linear isotherm `q = K c` | G Eq. (28.1-1) p. 1348; R Eq. (2.29) p. 50 | batchAdsorption.ts:72 (`qStar`, the isotherm page's `isothermQ`) | matches |
| 2 | Langmuir `q = q_max c/(K_L + c)` | G Eq. (28.1-3) p. 1348 (`q_o c/(K + c)`); S Eq. (15-24) p. 464 | batchAdsorption.ts:72 | matches (Langmuir 1918 itself is not in hand) |
| 3 | Freundlich `q = K_F c^n`, n the exponent | G Eq. (28.1-2) p. 1348 (`q = K c^n`, "the dimensionless exponent n"). T writes `Y* = m X^n` (Eq. 11.5, p. 589), the exponent on the LOADING, so his n is this page's 1/n; S writes `q = k p^(1/n)` (15-19) and, for the slurry, `c* = (q/k)^n` (15-78, p. 480). Three books, three conventions | batchAdsorption.ts:72, :89-90 | matches G. **Corrected by the integration**: the first draft wrote the exponent as `1/n` (S's form); it is now `n` as G and the course slides write it, and the refusal message, units `(mg/g)(mg/L)^(-n)`, tests and guides follow. No number moved: the stored second parameter was always the exponent itself |
| 4 | batch solute balance `V c0 + M q0 = V c + M q`; operating line of slope `-V/M` | G Eq. (28.2-1) p. 1350 (`q_F M + c_F S = q M + c S`); S Eq. (15-77) p. 480 (`c_F Q = c Q + q S`); T Eq. (11.4) p. 588 (`L_s(Y0 - Y1) = S_s(X1 - X0)`, slope `-S_s/L_s`); dH exercises 3 and 4 pp. 189-190 use it | batchAdsorption.ts:111-128 (`stageEquilibrium`); lesson step 1 | matches. T works in solute-free mass ratios `Y`, `X`; the page in a constant-volume concentration `c` (T's footnote p. 588 allows it for dilute solutions) |
| 5 | closed forms: linear `c = (V c0 + M q0)/(V + M K)`; Langmuir quadratic | algebra on row 4; held against the bisection by the tests (1e-12) | batchAdsorption.ts:132-143 | derived here and tested; not printed in this form in a book in hand |
| 6 | dose `M = V(c0 - c)/(q*(c) - q0)`; linear `M = (V/K) R/(100 - R)` | T Eq. (11.7) p. 589 (Freundlich, fresh adsorbent: `S_s/L_s = (Y0 - Y1)/(Y1/m)^(1/n)`); G Example 28.2-1 p. 1350 (the isotherm page's test holds 1.405 kg against the book's 1.40) | batchAdsorption.ts:155-172 | matches |
| 7 | crossflow stage balances, fresh adsorbent in each stage | T Eqs. (11.8), (11.9) p. 590 | batchAdsorption.ts:197-212 | matches (T: seldom economical to use more than two stages) |
| 8 | countercurrent: one solid stream, `V(c_{k-1} - c_k) = M(q_k - q_{k+1})`, `q_{N+1} = 0` | T Eq. (11.14) p. 592 and Fig. 11.20; T p. 592 "countercurrent operation is superior to both" | batchAdsorption.ts:222-268 | matches; the page's shooting on `c_N` replaces T's staircase on the diagram |
| 9 | linear isotherm, two stages: crossflow equal split `c2/c0 = 1/(1 + a/2)^2`, countercurrent `1/(1 + a + a^2)`, `a = M K/V` | derived (section 9); T p. 594 says the linear countercurrent case is the Kremser equations | lesson step 3 | derived here and tested; equals the Kremser result for N = 2 |
| 10 | equal split of a fixed dose between two crossflow stages is optimal ONLY for a linear isotherm | T p. 590: "the least total amount of adsorbent will require unequal dosages in each stage except where the equilibrium isotherm is linear"; T Problem 11.4: "prove ... when the adsorption isotherm is linear, the least total adsorbent results if the amounts used in each stage are equal"; T Eq. (11.13) p. 591 for Freundlich | batchAdsorption.ts:271-281 | matches (derivation in section 9). T says "unequal" only; the DIRECTION (more than half in the first stage for a favourable isotherm, less for an unfavourable) is this page's finding, measured and confirmed by an independent program (section 9). T minimises the total adsorbent for a fixed final concentration, the page minimises the final concentration for a fixed total: the same optimum, and the test holds the page's best split to T's Eq. (11.13) |
| 11 | film rate, perfectly mixed tank: `-dc/dt = k_L a (c - c*)`, `a` the external area per unit volume of liquid | S Eq. (15-76) p. 480 (the same symbols); T Eq. (11.36) p. 604 (`-dc/(a_pL dtheta) = k_L(c - c*)`, `a_pL = a_pS S_s/V_L`). R was named in the first draft; R ch. 6 treats external film resistance only qualitatively, for binary sorption (sec. 6.7, p. 199), and has no batch film rate law | batchAdsorption.ts:326-330 (`filmRate`) | matches S and T. **Corrected**: the source is S and T, not R |
| 12 | closed form `c(t) = (c0/beta)[exp(-k_L a beta t) + alpha]`, `alpha = V/(M K)`, `beta = 1 + alpha` | S Eq. (15-80) p. 480 with (15-81), (15-82): `beta = 1 + Q/(S k)`, `alpha = Q/(S k)` (S's linear isotherm is `c* = q/k`, so S's `k` is this page's K); T Eq. (11.40) p. 604 (`m = 1/K`); derived independently (section 9) | batchAdsorption.ts:336-340 (`linearFilmC`), :394-441 (`timeToTarget`) | matches, term by term, in S and in T |
| 13 | the page's RK4 on a nonlinear isotherm, held to a published answer | S Example 15.10 (a) p. 481: batch phenol, Freundlich, `k_c a = 2.5e-3 1/s`, `S/Q = 10 g/L`, 10 to 0.57 mmol/L, "t = 1,140 s" by MATLAB `ode45`. The page's `timeToTarget` gives 1,158 s (1.6 % higher); an independent RK4 in Python gives 1,158.4 s; the book's constants are rounded (`0.1057`, a printed `0.10` where `0.010` is meant) | gui/tests/batchAdsorption.test.ts ("held to the books") | matches within the book's own rounding |
| 14 | `k_L = Sh D_AB/d` with `Sh = 2` for a sphere in a stagnant liquid | G sec. 21.3 p. 903: for flow past single spheres at very low Re the Sherwood number "should approach a value of 2.0", derived from the stagnant-medium Eq. (19.1-24), "natural convection effects could increase" it; T Eq. (11.29) p. 603 has the same constant 2 | batchAdsorption.ts:315-323 | matches as a bound. **Judged**: as a DEFAULT for a stirred tank it misleads by one to two orders of magnitude (section 8); the wording is corrected |
| 15 | external area `a = 6 M/(rho_p d V)`, `rho_p` the particle density | T p. 604 (`a_pL = a_pS S_s/V_L`) and Eq. (11.32) `a_p = 6 phi_s/d_p`: area per volume of sphere is `6/d`; S Example 15.10 uses 5 m2/kg of particles | batchAdsorption.ts:315-323 | matches (geometry of spheres) |
| 16 | a stirred tank's film coefficient is above the stagnant bound and depends on power per volume and size | T Eqs. (11.28)-(11.29) p. 603: `Sh_L = 2 + 0.47 Re_p^0.62 (d_i/T)^0.17 Sc^0.36` for `d_p < 2 mm`, `Re_p = d_p^(4/3) (P g_c/v_L)^(1/3) rho^(2/3)/mu`; S p. 480: external control, and Example 15.10 `k_c = 5e-5 m/s` "confirmed in a well-agitated vessel". Harriott 1962 is not in hand | tool panel, lesson step 4 note and limit `sherwood` | matches; the page's wording changed (section 8) |
| 17 | Glueckauf series resistance `1/k_ov = 1/k_L + R_p/(5 D_e)`; internal over film `= Bi/5` | S Eq. (15-100) p. 483: `1/(k K) = R_p/(3 k_c) + R_p^2/(15 D_e)`, the film term being `1/(k_c a_v)` with `a_v = 3/R_p`, so internal over film is `k_c R_p/(5 D_e)` = `Bi/5`; T Eqs. (11.31), (11.33)-(11.34) pp. 603-604 (`k_s a_p = 60 D_s/d_p^2`, resistances add); Glueckauf 1955 itself is not in hand | batchAdsorption.ts:444-446 (`biot`) | matches in S and T |
| 18 | Biot number `Bi = k_L R_p/D_e`: the radius, and `D_e` on the whole particle | S Eq. (15-98) p. 483: `D_e (dc/dr) = k_c (c - c_Rp)` at `R_p`, "D_e is the effective diffusivity in the particle" -- the boundary condition whose dimensionless form is `Bi = k_c R_p/D_e` | batchAdsorption.ts:444-446 | matches the convention |
| 19 | `Bi = (Sh/2) D_AB/D_e`, independent of `d` at fixed Sh | algebra: `Bi = (Sh D_AB/d)(d/2)/D_e` | batchAdsorption.ts:444; test | derived here and tested; correct, and an artefact of fixing Sh (section 8) |
| 20 | threshold `Bi/5 > 0.1` for "unreliable" | none | batchAdsorption.ts:444-446 | a stated choice, not from a source |
| 21 | example isotherm parameters, `rho_p`, `D_AB`, `D_e` | none: the page's illustrative numbers | batchAdsorption.ts:460-480; tool defaults | not from a source, and labelled so |

Counts: 21 rows.  Match the books: 14 (rows 1, 2, 4, 6, 7, 8, 10, 12, 13, 14 as a bound, 15, 16, 17, 18).
Differ, corrected: 2 (row 3, the exponent's convention, by the integration; row 11, the source of the
film law is S and T, not R).  Derived here and tested, not printed in this form in a book in hand: 3
(rows 5, 9, 19).  Not from a source, labelled: 2 (rows 20, 21).  Beyond the rows, one judgement: row 14's
default misleads (section 8) and its wording is corrected.  Not found in hand: the original papers
(Langmuir 1918, Freundlich 1907, Glueckauf 1955, Harriott 1962); their content was reached through G,
S and T.
Two of the page's numbers recomputed by hand after the exponent rename: 17.457 mg/L at 20 g
(Langmuir 200 and 4, 100 L at 50 mg/L: `c^2 - 6c - 200 = 0`) and 40.50 g for 90 % removal
(`100 x 45/(200 x 5/9)`); both unchanged.

## 8. Is `Sh = 2` a sound default for a stirred tank?  No, and the page now says so

`Sh = 2` is the right limit for a sphere in still liquid (G p. 903; T Eq. 11.29's constant), and
a lower bound for a tank.  What it is not is the value a stirred tank has.  Two books in hand
give the size of the gap:

* T Eqs. (11.28)-(11.29), particles under 2 mm: at 1 kW/m3 in water (`rho` 1000, `mu` 1e-3 Pa s,
  `Sc` 1000 for `D` 1e-9) and `d_p` 0.5 mm, `Re_p` is about 400 and `Sh` is about 190
  (`d_i/T` taken as 1/3).
* S Example 15.10: `k_c = 5e-5 m/s` for 1.5 mm particles "in a well-agitated vessel", that is
  `Sh` about 75 at `D` 1e-9.

So with `Sh = 2` the page's `k_L a` is 40 to 100 times too small and every time it prints is that
much too long: the page's own default (0.5 mm, 20 g in 100 L) has a time constant of hours where a
tank of that size equilibrates in minutes.  Two statements on the page depend on fixing `Sh` and
were put more generally than they hold: "time scales as `d^2`" and "Bi does not depend on the
diameter".  In a stirred tank (T, `d_p < 2 mm`) `Sh - 2` grows as `d^0.83`, so `k_L` falls as
`d^-0.17`, `k_L a` as `d^-1.17`, the time grows as about `d^1.2`, and `Bi` rises with the diameter.

What was changed: the tool's Sherwood paragraph, the step 4 note, the limit `sherwood`, the Biot
sentence and the guides say this plainly and attribute it; the `d^2` and `Bi` statements are marked
as the fixed-`Sh` result.  What is PROPOSED, not built (new physics on a page whose job here was
to integrate and check): a default `Sh` from T Eq. (11.29), with the power per volume and `d_i/T` as
two new inputs and the liquid's density and viscosity, `Sc = mu/(rho D_AB)`, the computed value shown
beside the declared one.  That removes the misleading default; until then the printed times are an
upper bound and the page says so.

## 9. The two derivations the review asked for

**Equal split, linear isotherm.**  `q = K c`, `A = M K/V`, fractions `f` and `1 - f` of `M` in two
crossflow stages with fresh adsorbent: stage 1, `V(c0 - c1) = f M K c1`, gives `c1 = c0/(1 + f A)`;
stage 2 likewise `c2 = c1/(1 + (1 - f) A)`.  So `c2/c0 = 1/[(1 + f A)(1 + (1 - f) A)]`, and the
denominator is `1 + A + A^2 f(1 - f)`, which is largest, so `c2` least, at `f = 1/2` for every
`A > 0`.  For Freundlich `q = K c^n` with fresh adsorbent, the total adsorbent
`V/K [(c0 - c1)/c1^n + (c1 - c2)/c2^n]` is stationary in `c1` when `(c1/c2)^n - n c0/c1 = 1 - n`
(T's Eq. 11.13 with his `1/n` written `n`); the equal split is not a solution of it for `n != 1`.
Measured with an independent program (pure Python bisection and golden section, not the page's
code): Langmuir `q_max` 200, `K_L` 4, 100 L at 50 mg/L: best `f` = 0.617, 0.687, 0.613 at M = 20, 50,
100 g (the page's default is the first: 61.7 %), with `c2` = 16.099, 0.9217, 0.1280 against 16.175,
1.1462, 0.1383 for an equal split; Freundlich `K_F` 30, `n` 0.3: 0.519, 0.559, 0.660; unfavourable
`n` 1.5: 0.432, 0.423, 0.418; linear: 0.5000 to six places.  A scan of Langmuir over M from 0.5 to
20000 g and `K_L` from 0.5 to 500 mg/L gave `f` of at least 0.50002 everywhere; Freundlich `n` from
0.1 to 0.99 gave at least 0.5, and `n` from 1.01 to 2 gave at most 0.5.  One edge: Freundlich with
`n` near 0.1 and a very large dose has its optimum on the boundary `f = 1` (all the adsorbent in
one stage).

**Film closed form, linear isotherm.**  `V dc/dt = -k_L (a V)(c - c*)` with `a` the area per
volume of liquid, i.e. `dc/dt = -k_L a (c - c*)` (S Eq. 15-76).  For fresh adsorbent the balance
`M q = V(c0 - c)` and `c* = q/K` give `c* = alpha (c0 - c)`, `alpha = V/(M K)`.  Then
`dc/dt = -k_L a [(1 + alpha) c - alpha c0] = -k_L a beta (c - alpha c0/beta)`, which integrates from
`c(0) = c0` to `c - alpha c0/beta = c0 (1 - alpha/beta) exp(-k_L a beta t)`, and `1 - alpha/beta =
1/beta`, so `c(t) = (c0/beta)[exp(-k_L a beta t) + alpha]`: the page's expression
(batchAdsorption.ts:336-340), S Eq. (15-80) and T Eq. (11.40).  The page's RK4 route agrees with
it to 1e-7 in `t`, and agrees with S Example 15.10 on the nonlinear case (row 13).
