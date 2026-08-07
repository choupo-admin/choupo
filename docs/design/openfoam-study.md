# What OpenFOAM does, and what Choupo should take from it

> **Status.** A STUDY, written 2026-08-07 on Vítor's instruction: *go and learn
> first, no deliverable*.  Nothing here is implemented.  Every recommendation
> is a proposal awaiting his word, per the standing propose-then-code rule.
> Level 3 (design reference).  Judged throughout against the constitution
> (`project-philosophy.md`) and against one question: **what does the student
> see?**

Choupo already imitates OpenFOAM in the places it decided to: the case
directory shape, the dictionary format, the branch-and-tag layout (revised
2026-07-29 after checking rather than remembering what OpenFOAM actually
does).  This study looks at three further places, two where OpenFOAM is ahead
and one where Choupo's divergence is deliberate and should stay.

---

## 1 · Phase declaration — OpenFOAM has one uniform list; Choupo special-cases

**What OpenFOAM does.**  A multiphase case declares its phases as a NAMED
LIST, then gives each one a sub-dictionary whose `type` says what that phase
*is*:

```
type   interfaceCompositionPhaseChangeTwoPhaseSystem;   // the SYSTEM model
phases (gas liquid);

gas    { type multiComponentPhaseModel;  diameterModel …; }
liquid { type purePhaseModel;            diameterModel none; }
```

The phase's `type` selects which equations it participates in — a
`purePhaseModel` solves momentum and energy, a `pureIsothermalPhaseModel`
holds temperature fixed and solves no energy equation.  Relations between
phase PAIRS get their own notation, and it distinguishes direction:
`(gas in liquid)` and `(liquid in gas)` for drag and heat transfer,
`(gas and liquid)` for surface tension.  Asymmetric relations read
asymmetrically; symmetric ones read symmetrically.

**What Choupo does.**  The `gammaGamma` reader special-cases by phase kind:

```
equilibrium
{
    formulation  gammaGamma;
    liquidPhases ( { name liq1; … } { name liq2; … } );
    vapour       { fugacityModel idealGas; }
}
```

Liquids are a list; the vapour is a singular block; **a solid cannot be
declared at all**.  `ThermoPackageBuilder` then flattens these into a
`phaseConfigs` vector in a fixed order, and `IsothermalFlash` consumed that
vector *by position* until 2026-08-07.

**Why this matters beyond tidiness.**  The missing solid declaration is not an
oversight to be patched — it is what a kind-by-kind grammar does when a new
kind arrives.  `SolidPhase` exists, computes a correct pure-crystal fugacity,
and is verified; it has no door because the grammar has a slot for liquids and
a slot for vapour and no slot for anything else.  OpenFOAM would have had the
slot for free, because its list does not know what kinds exist.

**Recommendation (proposal only).**  Move toward a uniform
`phases ( … )` list with per-phase `type`, keeping `formulation` as the
system-level selector it already is.  This is the natural home for a
crystallising solid, and it removes the positional coupling permanently rather
than guarding it.  It is a grammar migration across every `gammaGamma` case,
so it is not small, and it should not be started to make one witness case
possible — see `solid-formation-routes.md` §4.

**What NOT to take.**  OpenFOAM's pair notation `(gas in liquid)` is elegant
and Choupo does not need it: its pair data (NRTL, Henry, Pitzer) is already
per-pair in `parameters/`, keyed by the two names, and a second syntax for the
same relation would be a second home.

---

## 2 · Refusal messages — OpenFOAM is mechanically consistent; Choupo is eloquent and uneven

**What OpenFOAM does.**  It has ONE macro, `FatalIOErrorInLookup`, and every
selection-table failure goes through it:

```
Unknown asymmetric matrix solver PCG
Valid asymmetric matrix solvers are : 3 ( PBiCG PBiCGStab smoothSolver GAMG )
```

The list is printed **from the selection table itself**, at the moment of
failure.  It cannot drift, it is never stale, and the count is there because
it costs nothing to print.

**What Choupo does — measured, and the measurement is the finding.**  There
are 86 `unknown …` refusals in `src/`.  I tried to count how many name the
valid options and got **58 missing** on the first pass and **0 missing** on
the second, because the first detector missed the word "Registered" and the
second matched any of a dozen words anywhere near the throw.  Both numbers are
wrong, and a third automated attempt would only be wrong differently.  *This
is the week's own lesson arriving in the study of it: a measurement taken once
and then quoted is a derived fact with a second home.*  So no count is quoted
here.  What I did instead was read four at random, and they turned out to be
four DIFFERENT failure modes — which is more useful than any count:

| Site | Shape | Verdict |
|---|---|---|
| `UnitOperation::New` | iterates `registry()` and prints every key | **correct** — this is the OpenFOAM pattern |
| `HeatCapacityModel::New` | `"Unknown heat-capacity model '" + name + "'"` | names nothing; the student must read source |
| `ODEIntegrator::New` | `"(known: RK4, EulerSI, Rosenbrock23)"` — hardcoded | **a second home for the registry**; drifts the day a fourth is registered |
| `TransportModel::New` | `"Registered: see TransportModel::availableModels()."` | names a remedy the student cannot perform from a dict |

The third is the interesting one.  It looks helpful and it is the arity sin in
a refusal message — the same defect this project has been chasing in data,
sitting in the one place a student reads when they are already stuck.

**Recommendation (proposal only).**  One shared helper that every factory's
`New` calls, printing the registry's own keys, so no message can hold its own
copy of the list.  Then a gate that FAILS on any `unknown …` throw that does
not go through it — enumerable by construction, unlike the census I could not
automate.  This is the highest student-value change in the study and the
cheapest: a student who misspells `model Wilson;` should be told what is
available, in the terminal, without opening C++.

---

## 3 · Where Choupo is right to diverge — do not "adopt" these

* **Run-time selection macros.**  OpenFOAM registers types with
  `addToRunTimeSelectionTable` macros.  Choupo rejects this deliberately
  (`registerBuiltins()`, called explicitly in `main.cpp`): the student sees
  where types come from, and the static-init order fiasco cannot bite.  The
  OpenFOAM error-message pattern above is worth taking; the registration
  mechanism that produces it is not.  **These are separable and this study
  recommends only the first.**
* **`system/fvSolution` numerical tuning.**  OpenFOAM's control dictionaries
  are large because the numerics are the user's problem.  Choupo's stance —
  every solver aid explicit, announced when it binds, never silent — is the
  anti-ASCEND position and is better for teaching.
* **Tutorials as the documentation.**  OpenFOAM's tutorials are famously the
  real manual, which works for practitioners and strands beginners.  Choupo
  already has the better arrangement: a tutorial corpus AND prose guides AND
  `docs/ai/` for LLM-assisted authoring.  Keep all three.

---

## 3a · Its predecessor, and a difference in evidence that matters

[`theory-in-class-structure-study.md`](theory-in-class-structure-study.md)
(2026-08-06) asked five deeper questions of OpenFOAM, Cantera and DWSIM — the
phase primitive (μ, f or G), whether the standard state is an object, whether
the equilibrium criterion is written once, extensibility, and how a size
distribution is represented.  It does not overlap this study, which is about
the DECLARATION SURFACE a student types and the MESSAGE they get back.  Read
it first for anything touching the thermo spine.

**It is also better-evidenced than this one, and the difference should be
stated rather than left for a reader to discover.**  That study read
`OpenFOAM/OpenFOAM-dev`, `Cantera/cantera` and `DanWBR/dwsim` from clones at
depth 1.  This study read documentation pages, one tutorial dictionary and one
header, over the web.  For §1 that is adequate — a tutorial's
`phaseProperties` IS the declaration surface, and the surface is the subject.
For §2 it is thinner: the `FatalIOErrorInLookup` pattern is confirmed from the
error header and three independent quotations of its output, but I did not
verify how consistently OpenFOAM's own code routes through it.  The Choupo
half of §2 is first-hand and is the part the recommendation rests on.

## 4 · What this study did not examine

Named, because a study that implies breadth it does not have is the same
defect as a gate that does.

* **Only three areas.**  Phase declaration, refusal messages, and the
  divergences above.  Not examined: OpenFOAM's mesh/field abstractions (no
  Choupo analogue), its `functionObjects` (Choupo's post-processing chain
  covers the ground), its parallel decomposition (Choupo is serial by design).
* **No engine change was made, and no number in the corpus moved.**  Per the
  instruction: learn first.
* **The refusal census is unfinished.**  I could not automate it honestly and
  did not hand-count 86 sites; the recommendation in §2 is written so that the
  gate, not a person, becomes the census.

---

## Sources

* [OpenFOAM 2.3.0 multiphase modelling](https://openfoam.org/release/2-3-0/multiphase/)
* [`phaseProperties`, bubbleColumnEvaporating tutorial](https://github.com/OpenFOAM/OpenFOAM-4.x/blob/master/tutorials/multiphase/reactingTwoPhaseEulerFoam/laminar/bubbleColumnEvaporating/constant/phaseProperties)
* [Population balance modelling in OpenFOAM](https://openfoam.org/guides/population-balance-openfoam/)
* [`error.H` — the FatalIOError machinery](https://www.openfoam.com/documentation/guides/latest/api/error_8H_source.html)
* [User guide §6.3, solution and algorithm control](https://www.openfoam.com/documentation/user-guide/6-solving/6.3-solution-and-algorithm-control)
