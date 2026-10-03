# The approach direction is read from the answer, never from the seed

*2026-10-03.  DEV.md §5 entry of 2026-10-01 ("AN ADIABATIC
`temperatureApproach` CAN TAKE THE WRONG SIGN FROM ITS SEED"), taken on
Vítor's standing mandate of 2026-10-03 (DEV.md §4c preamble).  Gate:
`check_adiabatic_approach_direction`.  Witness:
`tutorials/steady/gibbs/gibbs13_adiabatic_approach_direction`.  Engine:
`src/unitOperations/reactor/GibbsReactor.{H,cpp}` (the adiabatic branch of
`solve()` and `approachDirection`).  Level 3 under
[`a-declared-pathway-and-its-approach.md`](a-declared-pathway-and-its-approach.md)
and the 2026-09-26 sign ruling recorded in
`src/unitOperations/reactor/TemperatureApproach.H`.*

## 1. The defect

`temperatureApproach` is a MAGNITUDE; the engine assigns the sign from the
thermicity of the overall transformation feed → equilibrium, by van 't Hoff
(exothermic → the REACTION equilibrium is evaluated at T + |dT|, endothermic
→ T − |dT|; `TemperatureApproach.H`, one home).  `GibbsReactor::
approachDirection` reads that thermicity by solving the true equilibrium
from the feed at a temperature T and pricing H(equilibrium, T) − H(feed, T)
on the package's own surface.

In **isothermal** mode T is `operation.T`, the physical temperature, and the
reading is at the answer by construction.  In **adiabatic** mode the physical
temperature is the answer of an outer Newton, and the function was called
with that Newton's SEED, `operation.T` — the announcement said so: *"read at
the seed T, the physical T being the answer"*.

A feed that already carries product is itself at equilibrium at some
temperature T\*.  Seeded ABOVE T\*, the equilibrium at the seed holds less
product than the feed, so the transformation feed → equilibrium(seed) is the
DECOMPOSITION, endothermic; the engine assigned T − |dT|, which for an
exothermic synthesis moves the evaluated equilibrium TOWARD more product,
and the bed ended more converted than its own dT = 0 outlet.  The aid helped
instead of hurting.  Seeded below T\*, the same case took the other sign.
Found by Vítor while checking a design-project group's report ("with a 10 K
approach the conversion comes out very high").

## 2. What was measured first

The commander's 2026-10-01 measurement used a scratch copy of
`ammoniaStaged03_approach`'s `constant/` with a converter inlet gas this
tree does not carry.  It was reproduced here on a feed authored for the
purpose and then shipped as the witness: N2 19, H2 57, NH3 16, Ar 8 mol%,
10 000 kmol/h, 415 °C in, 150 bar, adiabatic, dT = 10 K, over the
`ammoniaStaged03` package (SRK vapour) — the witness's own gammaPhi/SRK
package gives the same numbers to every printed digit, as a single gas phase
must.  Baseline binary = this tree at the parent commit:

| run | seed | sign | outlet T | y_NH3 |
|---|---|---|---|---|
| old rule, hot seed | 768.15 K | − | 734.235 K | 0.19322 |
| old rule, cold seed | 708.15 K | + | 721.052 K | 0.18355 |
| dT = 0 | either | — | 727.625 K | 0.18836 |

So the hot-seeded bed published 0.49 percentage points MORE ammonia than
its own equilibrium outlet, 6.6 K hotter, at exit 0.  The commander's
numbers on his gas (473.6 °C / 19.73 % against the correct 460.4 °C /
18.74 %, equilibrium 470.4 °C / ~18.8 %) are the same shape.

**One premise of the brief was wrong and is corrected here:** the seed is
`operation.T`, not the `0/<outlet>` file.  `UnitInputs.cpp:248-254` hands
the unit its feed from the inlet stream; nothing hands it the outlet
estimate, and `GibbsReactor.cpp` reads `T_guess` from its own `operation`
dict.  The witness therefore seeds through `operation.T`, and its `0/out`
header says so, so nobody tries to reproduce the defect by editing the
wrong file.

**Corpus reach**, verified rather than assumed: the five flowsheetDicts that
declare `temperatureApproach` are `greenAmmoniaIndustrialN2/Converter`
(gibbsReactor, isothermal, 733.15 K), `ammoniaStaged02` (declared `0`,
isothermal), `ammoniaStaged03` (isothermal, 700 K), `equil02` and
`ladder01` (`equilibriumReactor`, a different unit, isothermal).  No corpus
case declares an approach on an adiabatic gibbsReactor, so no golden could
move, and none did (§5).

## 3. The rule

**In adiabatic mode the direction is read from the dT = 0 ADIABATIC
answer.**  The bed is solved once with no approach (the same outer Newton,
from `operation.T`); its root T0 is the state THIS bed reaches with no
approach, which no seed can move; `approachDirection` is called at T0 — the
probe equilibrium it solves there IS the dT = 0 outlet — and the thermicity
of feed → that state decides the sign; the magnitude is applied with that
sign and the bed is re-solved from T0.  The announcement names T0, the seed
the probe started from, its iteration count, whether it converged, and the
enthalpy change it read, and says that the seed cannot move the sign.  The
probe's cost is published as `approachProbeOuterIterations`.

Why T0 rather than, say, the feed temperature: the thermicity of feed →
equilibrium(T_feed) is also seed-free, but for a feed past its own
equilibrium at T_feed (a quench stage) it reads the wrong transformation —
the bed will not run decomposition at the feed temperature, it will run
whatever closes the energy balance.  Feed → equilibrium(T0) is the
transformation the bed actually performs.

Isothermal mode is byte-identical: `ammoniaStaged03_approach` (isothermal
with an approach, on a recycle) diffed byte-for-byte between the parent
build and this one, as did the two dT = 0 scratch runs.  The claim in the
brief that the isothermal direction never depended on a seed HOLDS:
`approachDirection(…, T_guess, …)` on the isothermal path receives the
physical T.

The generalisation, which is the durable half: **a solver aid's direction is
read from the answer, never from the seed.**  A seed is the one input the
2026-05-30 rule allows a solver to own; a sign that a seed can move is a
seed deciding the answer.

## 4. The cost

One extra outer Newton on T.  On the witness: the dT = 0 probe takes 5 outer
iterations from the hot seed (4 from the cold one) and the re-solve from T0
takes 4 — against 5 (hot) / 4 (cold) for the single old solve.  So the
adiabatic approach roughly doubles the outer cost, each outer iteration
being three inner Gibbs solves (central differences).  On a one-unit case it
is milliseconds; on `ammonia03_quench_converter`'s three beds on a tear it
would be measurable, but that case declares no approach.

## 5. Validation (CLAUDE.md §10, sized by reach)

The change is confined to the adiabatic branch of one unit and to the
message of one function.  Run: every corpus case whose flowsheetDict names a
`gibbsReactor` (31 cases including the witness) against its golden —
0 moved rows outside the witness; `check_adiabatic_approach_direction`,
`check_reaction_subset_approach`, `check_gibbs_solid_phase`,
`check_compile_clean`, `check_wasm_dialect`, `check_layering`; and
`bin/runTests --gui`, because `GibbsReactor.cpp`'s line numbers moved and
four EduTool lessons cite it by `file:line` (every citation re-pointed and
each verified to land on the statement it names; one pre-existing stale
citation found on the way, `ClausGibbsTool.tsx` citing the adiabatic energy
residual at `188-214`, where the `approachTemperature` refusal lived, now
pointed at the residual).  No full suite: nothing outside the adiabatic
branch moved.

## 6. Gate and sabotages

`check_adiabatic_approach_direction` (docstring carries the arms).  By-hand
sabotages, each restored by copy and `make`, results as measured:

* **S1** — direction read at the seed again (`T_guess` in place of `r0.x`
  at the adiabatic call): CAUGHT by (a) hot 734.235 K / 0.19322 against
  cold 721.052 K / 0.18355 and the sign word −/+, by (b) on both T and NH3,
  by (c) T0 announced as the seed, by (f) the source arm.
* **S2** — the `(adiabatic mode: …)` clause dropped from the message:
  CAUGHT by (c) alone; (a), (b), (d) pass — the answer is right and the
  reader is not told what decided it, which is why (c) exists.
* **S3** — `approachProbeOuterIterations` not published: CAUGHT by (d)
  alone.

(The measured outputs of each sabotage are in the gate's docstring; this
section is the summary.)

## 7. Not in this slice, said plainly

* An unconverged dT = 0 probe is ANNOUNCED through
  `announceOuterNotConverged` and the direction is read at its last
  iterate; no corpus case reaches it and the gate says so.
* The `gibbsMap` props op is unchanged: it is isothermal per cell.
* The EduTool `approach-to-equilibrium` gained two sentences on the
  adiabatic reading and the witness; a page or a slider on the defect is
  pedagogy and is Vítor's.
