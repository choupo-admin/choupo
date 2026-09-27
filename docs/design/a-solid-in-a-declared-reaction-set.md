# A solid in a declared reaction set

*2026-09-27.  Commission C14, slice 2 (DEV.md §4c; slice 1 built graphite and
the `gibbsReactor`'s pure-solid phase).  Status: SHIPPED.  Kind: ADR.*

## 1. What was missing

Slice 1 gave the catalogue solid carbon (`components/graphite.dat`, NASA
TM-4513, `referenceState pureSolid;`) and gave the `gibbsReactor` a phase of
its own for it.  The `equilibriumReactor` -- the level of equilibrium where the
author declares the REACTIONS -- had none: `Reaction::equilibrium` prices every
participant on `g_pure_ig`, which a pureSolid record refuses (the reference
rung), and the solver gives every participant a logarithm of a mole fraction.
So the classic declared-pathways lesson, a steam reformer with Boudouard and
methane cracking left off the list, could not be built, and the
`declared-pathways` EduTool said so in a limit named `carbon-not-buildable`.

## 2. The formulation

A pure solid `s` is its own phase: its chemical potential is its pure-solid
standard potential, activity one, no mixing term.  So in a declared reaction
`j` it LEAVES ln Q and enters ln K through that potential:

    ln K_j = -(Sum_fluid nu_ij g_i(T) + nu_sj g_s(T)) / RT

`pureSolidPhase::reactionEquilibrium` computes it as `Reaction::equilibrium`
over the fluid participants (the ONE home of ln K for a gas reaction) minus
`nu_s g_s/RT`, and returns `Reaction::equilibrium` untouched for a reaction
with no pure solid.  `sumNu` is the FLUID sum: a solid adds nothing to the
pressure term.

The solver (record
[`an-equilibrium-that-runs-to-completion.md`](an-equilibrium-that-runs-to-completion.md))
has unknowns x_i = ln n_i for every participant and closes the reaction
subspace through the invariants W (n - n0) = 0.  A solid participant keeps its
column of nu and of W, but its unknown is not a logarithm -- it may be zero --
and it has two MODES, one unknown each, so the Newton stays square:

| mode | the solid's unknown | enters g_j | enters h_k |
|---|---|---|---|
| ABSENT | lambda_s = ln a_s (n_s = 0) | + nu_sj lambda_s | w_ks (0 - n0_s) |
| PRESENT | v_s = n_s / F (a_s = 1) | nothing | w_ks (v_s F - n0_s) |

Absent, the declared set equilibrates along every combination of its reactions
that deposits no solid, and lambda_s is the activity of the solid that such an
answer leaves -- the declared-route analogue of the Gibbs reactor's
`sum pi_k A_ks - g_s/RT`.  The Jacobian columns are exact (`nu_sj` and 0
absent; 0 and `w_ks` present); the solid is excluded from n_total, from the
fluid sum of nu, and from the step control (its unknown is linear in the
residual).  The fluid columns, the seed, the step control and the extents
recovery are the ln-n solver's, unchanged; a case with no solid participant
takes exactly that path.

**The phase set is decided as the `gibbsReactor` decides it** (slice 1): every
solid absent first; a solid with ln a_s > `kLnActivityAppears` (1e-10, the
same number) APPEARS, and the set is re-solved with it present, warm-started
from the solid-free answer.  The declared equilibrium is a constrained minimum
of a convex G over the reaction subspace, so a_s > 1 in the solid-free answer
means depositing the solid lowers G, and the present-mode answer must carry
n_s > 0 -- which the reactor CHECKS and refuses to publish otherwise.  Every
solid still absent is re-tested at the new answer.  Two supersaturated at once
is a multi-solid active set and is refused by name, as in slice 1.  The
verdict, APPEARS or ABSENT with the activity that decided it, is printed and
logged in the Gibbs reactor's own sentence, and the deposit leaves in the
outlet's `s[]` (the crystalliser's magma convention slice 1 used), priced on
the solid rung.  `newtonIterations` counts both solves.

**A solid NO declared reaction touches (an OBSERVER).**  It cannot form -- no
pathway to it is declared -- but its activity in the outlet is a well-defined
number when the outlet's fluid is in COMPLETE internal equilibrium: fit the
element potentials to mu_i/RT = g_i/RT + ln(y_i P/P0) over every fluid species
present, and read ln a_s = Sum_k pi_k A_ks - g_s/RT
(`pureSolidPhase::activityFromFluid`, atoms from the records' own formulas
through the one elemental parser).  Above one, the declared list is holding a
SUPERSATURATED outlet: a metastable state the declaration asserts, and the size
of that assertion.  The fit residual decides whether the potentials exist: a
fluid equilibrated along a declared SUBSET of its reactions -- or carrying a
species no declared reaction touches -- has none, the activity of a solid is
then a property of the ROUTE that would form it, and the reactor refuses it by
name and publishes no number.  Every fluid species present enters the fit, not
only the ones a reaction touches: an unequilibrated inert is exactly what makes
the activity route-dependent (sabotage S4 below).

## 3. One home

Everything the two reactors both need lives in
`src/unitOperations/reactor/PureSolidPhase.{H,cpp}`: which record IS a pure
solid (its own `referenceState` word), the appearance threshold, g and h on
the solid rung, the solid-aware ln K, the APPEARS / ABSENT sentence, the KPI
names (`n_solid_<s>_mol_s`, `activity_<s>`, `F_solid_kmol_h`) and the
element-potential activity.  Slice 1's `GibbsSolidPhase.cpp` and
`GibbsReactor.cpp` were moved onto it (the verdict sentence, the KPIs, the
threshold, the rung), and every one of the 33 `gibbsReactor`,
`equilibriumReactor` and `gibbsMap` cases in the corpus prints byte-identical
output against a build of 43c0238bc (only the banner and the tree path
differ).  The include rides `GibbsMethod.H`, so no line of `GibbsReactor.cpp`
that an EduTool cites moved.  A source arm of the gate holds both reactors to
the one home.

## 4. The witness

`tutorials/steady/reactors/equil04_reforming_carbon_declared_pathways`, the
shape of equil02/equil03: methane and steam at S/C 1.0, 900 K, 1 bar, ideal
gas; one feed, three reactors.  The conditions were chosen from the
recomputation (the reaction route of `check_gibbs_solid_phase.py` swept over
800-1100 K, 1-20 bar, S/C 0.5-2.0): at 900 K and 1 bar carbon forms at
S/C 1.0 (a_C 1.58) and not at S/C 1.5 (a_C 0.92), and S/C 1.0 is a round
number with a visible deposit.

| reactor | declares | outlet (measured 2026-09-27) |
|---|---|---|
| `gibbs` | every species, graphite included | graphite 0.2168 mol / mol CH4 (21.7 % of the carbon); solid-free a_C 1.580 |
| `complete` | steamReforming, waterGasShift, methaneCracking | the Gibbs outlet, gas and graphite, within 1e-9 relative |
| `declared` | steamReforming, waterGasShift | no graphite; the solid-free gas; `activity_graphite` 1.580 |

Recomputed by hand from the declared outlet by either excluded route:
a_C = K_crack p_CH4 / p_H2^2 = 3.2283 x 0.15681 / 0.56603^2 = 1.5800, and
a_C = K_boud p_CO^2 / p_CO2 = 5.5887 x 0.12036^2 / 0.05124 = 1.5800 (K_boud
read from the same reactor with Boudouard declared in cracking's place).  They
agree because reforming and the shift are the complete set for the five gases.
Every equation balanced by atom count in the case's `constant/reactions`.

**The brief was wrong in one place, and the case says so.**  It asked for a
complete set of four -- reforming, shift, Boudouard AND cracking.  Six species
over three elements admit three independent reactions, and Boudouard =
cracking - reforming + shift; the reactor refuses the four, naming boudouard
(as it refuses any dependent set).  The complete set here is three, with
cracking; declaring Boudouard in its place gives the same outlet to 1e-9 --
which the gate holds, and which is itself a lesson (an equilibrium does not
care which route reaches it).

Measured beyond the witness (probes, not shipped): S/C 3.0 leaves graphite
absent everywhere (a_C 0.294, the three reactors agree); reforming +
cracking only, and cracking alone, both deposit (a declared subset WITH the
solid); a 10 K temperature approach on the complete set converges and shifts
cracking to T - 10 K (endothermic as it runs) -- the per-reaction approach
applies to a solid reaction without anything special, so nothing was refused
there.  A solid in the feed is refused by the unit (its own guard); on the
witness's own streams the reference-rung refusal fires first, upstream.

## 5. The gate

`bin/curate/check_reaction_subset_approach.py`, arms (m)-(t), against the
reaction-based recomputation of `check_gibbs_solid_phase.py` (shared, now
parametrised by case and able to return the solid-free equilibrium):
(m) complete set and Gibbs reactor both equal to the route, graphite included;
(n) the declared set's gas equals the route's solid-free equilibrium, no
graphite, and its activity > 1 equals the route's; the supersaturation is
announced and reaches the caveat block; (o) the complete set's duty recomputed
on the records with graphite on its solid rung, and the plant first law;
(p) C/H/O closure on both equilibriumReactors; (q) Boudouard in place of
cracking is the same outlet, and all four refuse naming boudouard; (r) S/C 3
leaves it absent at the route's activity; (s) an unequilibrated species
present means no activity, refused by name; (t) the one home (source arm).
Seven by-hand sabotages, all caught -- listed with their output in the gate's
docstring.  S4 is the durable one: fitting the element potentials over the
REACTING species only (what the first draft did) publishes an activity for a
gas that has none.  The draft was caught by (s) while it was being written,
because the first probe for (s) -- reforming alone on the witness feed -- was
not a counter-example at all: with no CO2 fed, reforming IS the complete set
for the four gases present.  A probe has to be a case where the claim is
false.

## 6. The lesson

The `declared-pathways` EduTool's `carbon-not-buildable` limit is gone and a
`carbon-formation` example replaces it, on the pattern of the ammonia one:
numbers measured on the witness, every engine claim cited by `file:line`, and
the premise stated honestly -- the declared list does not say carbon cannot
form (the outlet says it can, by a factor of 1.58); it says the catalyst is
assumed not to form it.  No catalyst is cited.

## 7. Rejected

* **Price a solid through `Reaction::equilibrium` itself** (a solid-aware
  loop inside `Reaction.cpp`).  It changes the one home of ln K for every
  kinetic reactor too (their Kc would then carry a solid's activity), and
  `Reaction.cpp:136-149` is cited by line from an EduTool.  The fluid part is
  still `Reaction::equilibrium`; only the solid term is added beside it.
* **Carry the solid's amount as ln n like a gas.**  An absent solid has no
  logarithm, and a present one has no mole fraction; the two-mode column is
  what makes "absent" an answer rather than a floor.
* **Solve the present mode first and drop the solid if n_s < 0.**  Exact by
  convexity, but it decides the phase set on a different test from the
  Gibbs reactor's, and the student would read two reactors saying the same
  thing for two different reasons.
* **Test the observer solid along one chosen route** (cracking, say).  Where
  the gas is fully equilibrated every route agrees and the element
  potentials say so without choosing; where it is not, choosing one would
  answer a question the declaration did not ask.

## 8. NOT done

Two solids at once (refused); a solid in the feed (refused); the duty still
sums `h_pure_ig` for the fluid (the C11 record's open item -- the solid term is
on its own rung); non-ideal fugacities; an adiabatic mode; the `gibbsMap` op.
