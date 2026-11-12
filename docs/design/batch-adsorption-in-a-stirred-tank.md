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
   drawn.  `k_L = Sh D_AB/d`, `Sh = 2` by default (stagnant bound, the student
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
  Freundlich (`K_F` 30, `1/n` 0.3), 100 L at 50 mg/L, M = 20, 50, 100 g: the
  optimum puts MORE than half in the first stage.  Langmuir at 50 g:
  f* = 0.687, c_out 0.922 mg/L against 1.146 mg/L for an equal split (removal
  98.16 % against 97.71 % -- a small change in removal and a 20 % change in
  what is left).  Freundlich at 20 g: f* = 0.519, an almost negligible gain.
  An UNFAVOURABLE Freundlich (`1/n` 1.5) puts LESS than half in the first
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
  isotherm written as Freundlich with 1/n = 1) agree to 1e-7.
* Time scales as d^2 for all three isotherms (ratio 4.000000 at 2d, to 1e-6),
  because d only multiplies k_L a when Sh is fixed.
* **The Biot number does not depend on the particle diameter at fixed Sh.**
  `Bi = (Sh/2) D_AB/D_e`; at Sh = 2 it is `D_AB/D_e`, larger than one for any
  porous particle, so the internal resistance is at least a fifth of the
  film's and the film-only model is flagged at every diameter.  The brief
  asked for a flag "when the chosen particle size makes the film-only model
  unreliable"; under this model the particle size does not enter, and the page
  says so.  The size enters through Sh in an agitated tank (Harriott 1962,
  cited as further reading), which the page lets the student declare.

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
Sh = 2 is a lower bound for a stirred tank; the particle is uniformly loaded
(no internal gradient solved -- only flagged by Bi).  The example isotherms
are the page's own illustrative numbers, not measurements, and say so.

## 7. To check against the source

One row per equation, constant or number the page states from a published
work.  `unchecked` means written from the published form as remembered;
`derived here and tested` means derived on the page and verified numerically
by `gui/tests/batchAdsorption.test.ts`.  No row has been read back against
the book or paper it names; the reviewing session holds them.  Lesson file:
`gui/src/ui/methods/batchAdsorptionLesson.ts`; arithmetic:
`gui/src/case/batchAdsorption.ts`.

| What | Published work | Where on the page | Status |
|---|---|---|---|
| Linear isotherm `q = K c` | Ruthven, *Principles of Adsorption and Adsorption Processes*, Wiley 1984 | step 1; `qStar` (reused `isothermQ`) | unchecked |
| Langmuir isotherm `q = q_max c/(K_L + c)` | Langmuir, J. Am. Chem. Soc. 40 (1918) 1361-1403, doi:10.1021/ja02242a004 | step 1; `qStar` | unchecked |
| Freundlich isotherm `q = K_F c^(1/n)` | Freundlich, Z. Phys. Chem. 57U (1907) 385-470, doi:10.1515/zpch-1907-5723 | step 1; `qStar` | unchecked |
| Batch solute balance `V c0 + M q0 = V c + M q`, operating line of slope `-V/M` | Seader, Henley & Roper, *Separation Process Principles*, 3rd ed., Wiley 2011, sec. 15.5; Treybal, *Mass-Transfer Operations*, 3rd ed., McGraw-Hill 1980 | step 1; `stageEquilibrium` | derived here and tested (balance closes to 1e-10) -- textbook form unchecked |
| Linear closed form `c = (V c0 + M q0)/(V + M K)`; Langmuir quadratic | (algebra on the balance) | step 1; `closedFormC` | derived here and tested (against the bisection, 1e-12) |
| Dose `M = V(c0 - c)/(q*(c) - q0)`, linear `M = (V/K) R/(100 - R)` | Seader et al. 3rd ed. sec. 15.5 | step 2; `doseFor` (through `batchDose`) | derived here and tested |
| Crossflow and countercurrent stage balances; linear two-stage results `1/(1 + a/2)^2`, `1/(1 + a + a^2)` | Treybal 3rd ed. (multistage crosscurrent / countercurrent adsorption) | step 3; `crossflow`, `countercurrent` | derived here and tested (1e-12) -- textbook form unchecked |
| Equal split optimal for a linear isotherm; not for Langmuir/Freundlich | none (measured here) | step 3 note; `bestTwoStageSplit` | derived here and tested |
| Film rate `-V dc/dt = V k_L a (c - c*)` | Ruthven 1984 (external film resistance) | step 4 | unchecked |
| Closed form `c(t) = (c0/beta)[exp(-k_L a beta t) + alpha]`, `alpha = V/(M K)`, `beta = 1 + alpha` | none (derived on the page) | step 4; `linearFilmC`, `timeToTarget` | derived here and tested (against RK4, 1e-8 mg/L; ODE residual 1e-6) |
| `Sh = 2` for a sphere in a stagnant fluid | Harriott, AIChE J. 8 (1962) 93-101, doi:10.1002/aic.690080122 (further reading; also standard in any transport text) | step 4; `filmCoefficients` | unchecked |
| Specific external area `a = 6 M/(rho_p d V)` for spheres, `rho_p` the particle density | (geometry of spheres) | step 4; `filmCoefficients` | derived here and tested (hand value) |
| Time scales as `d^2` at fixed Sh | none (consequence of the two lines above) | step 4 note | derived here and tested (ratio 4 to 1e-6) |
| Glueckauf series resistance `1/k_L + R_p/(5 D_e)`, ratio `Bi/5` | Glueckauf, Trans. Faraday Soc. 51 (1955) 1540-1551, doi:10.1039/TF9555101540 | step 5; `biot` | unchecked (the factor 5 is from the LDF approximation as remembered) |
| Biot number `Bi = k_L R_p/D_e`, and `Bi = (Sh/2) D_AB/D_e` | (definition; the second form derived here) | step 5; `biot` | derived here and tested -- the definition's convention (radius, D_e on the whole particle) unchecked |
| Threshold `Bi/5 > 0.1` for "unreliable" | none: this page's rule of thumb | step 5 | a stated choice, not from a source |
| Example isotherm parameters (200 mg/g, 4 mg/L; 30, 0.3; 5 L/g), `rho_p` 800 kg/m^3, `D_AB` 1e-9 m^2/s, `D_e` 1e-10 m^2/s | none: this page's illustrative numbers | isotherm panel and step 4/5 defaults | not from a source, labelled so |
