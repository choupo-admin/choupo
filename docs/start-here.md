# Start here — nine cases, in this order

`listCases` lists every tutorial in the corpus — several hundred.  That is a
reference, not a way in: it is organised by what each case IS, and a person
arriving needs to know what to open FIRST.

This is the way in.  **Nine cases, each introducing exactly one new idea, each
resting on the one before.**  Run them in order and at the end you will have
followed a published industrial process from a single equilibrium calculation
to a closed flowsheet with a recycle — and, more to the point, you will be able
to say where its errors come from.

Every case here is verified on every run of the test suite, so none of them is
going to fail on you for a reason that is not yours.

**No terminal?  The browser runs the same engine.**  Every case below is in
the app at [choupo.org/app](https://www.choupo.org/app) — *Browse tutorials*,
then navigate to the case by the path in its name (flash01 is under
*steady / Phase equilibrium & flash*).  Press *Run*; the full solver log —
the same one this guide keeps telling you to read — is the *Log* tab.

```bash
source etc/bashrc          # gives you runCase, listCases
runCase tutorials/steady/flash/flash01_benzene_toluene
less tutorials/steady/flash/flash01_benzene_toluene/log.choupoSolve
```

**The second line is not optional, and it is the one people skip.**  `runCase`
prints a SUMMARY to your terminal — what was assembled, whether the balances
closed, and every caveat the run raised.  The glass box itself, every Newton
iteration and every K-value, goes to `log.choupoSolve` beside the case.  The
last line `runCase` prints is the path to it.

Read the `system/flowsheetDict` of each case before you run it, and that log
after.  Both are written to be read; that is the whole point of the project.

Two things worth knowing before you start.  A case keeps its previous log:
re-running refuses rather than overwrite it (`runCase -f` to replace, `-a` to
append) — a result you have not read yet is not scratch space.  And the last
case on this list is a whole plant with a recycle: it takes minutes, where the
first eight take seconds.

---

### 1. One equilibrium, and nothing hidden
`tutorials/steady/flash/flash01_benzene_toluene`

Two components, Raoult's law, one isothermal flash at 370 K and 1 bar.  Small
enough to check with a pen.  Open the log and find the **Rachford-Rice Newton
iterations** — printed at the default verbosity, not in a debug mode, and the
habit the rest of the corpus depends on.

Your terminal will also carry three validity notices, and they are worth a
minute each.  Benzene's vapour pressure is evaluated at 370 K, past the top of
its fitted range — so is the enthalpy path the energy report integrates.  The
third is the interesting one: toluene is flagged at **380.25 K, a temperature
you never declared** — the solver visited it while probing the phase boundary,
and the announcement is about that trial state, not about your flash.  All
three return their answer anyway.  That is the project's posture in the first
case you run — announce, never silently refuse and never silently pretend —
and it starts with the solver's own footsteps.

*New idea: a case is a directory of text files, and the answer is computed in
front of you.*

### 2. The model is a choice, and the choice shows
`tutorials/props/compare/compare_activity_etoh_water`

The same ethanol/water mixture under **three** activity models — ideal, NRTL,
Wilson — side by side against temperature.  No unit operation yet, on purpose.

*New idea: before any equipment, the thermodynamics.  Ideal is a model, not the
absence of one.*

### 3. The same flash, now non-ideal
`tutorials/steady/flash/flash02_ethanol_water`

Step 1's calculation on step 2's mixture: 50/50 ethanol/water at 355 K under
NRTL.  Compare what comes out against what step 2 led you to expect.

*New idea: the model choice arrives in the answer of a unit.*

### 4. Many stages instead of one
`tutorials/steady/distillation/column01_benzene_toluene`

A benzene/toluene column by the sequential bubble-point method (Wang-Henke).
The same equilibrium as step 1, solved on every tray at once.

*New idea: a unit operation is a stack of equilibria plus a material and
energy balance.*

### 5. Where the default method breaks
`tutorials/steady/distillation/column03_azeotrope_mesh`

Ethanol/water under NRTL, through an azeotrope, by the rigorous simultaneous
MESH Newton.  Step 4's method is documented as unstable here — that is why
this one exists.

*New idea: numerical method is part of the model.  A solver that cannot reach
the answer is not a detail.*

### 6. Composition changes for a second reason
`tutorials/steady/reactors/cstr01_first_order`

A CSTR: esterification of acetic acid with ethanol, ~53 % conversion.  Until
now composition changed because phases separated; here it changes because
molecules react.

*New idea: chemistry beside phase equilibrium, and the heat that comes with
it.*

### 7. Units wired together
`tutorials/steady/flowsheets/composite01_two_flashes`

Two flashes in series as one composite node.  The output of one is the input
of the next, and the plant-boundary balance closes over both.

*New idea: a flowsheet is a graph, and the streams between units live in their
own files.*

### 8. The answer stops being a sequence
`tutorials/steady/flowsheets/ammonia01_synthesis_loop`

The Haber-Bosch loop: a real-gas Gibbs converter, a chill-flash, and the
unreacted gas going back to the front — with a purge holding the inert argon
at steady state.  A recycle cannot be solved by running the units in order,
so the solver tears the loop and iterates.

*New idea: recycle.  A modest per-pass conversion becomes a high overall one,
and the purge is what makes the loop finite.*

### 9. A published process, and where its error comes from
`tutorials/plant/acetonePlant`

Acetone from 2-propanol — W. L. Luyben, *Ind. Eng. Chem. Res.* **50** (2011)
1206 — closed, with the isopropanol recycle.  Everything above, at once.

It makes **85 % of his acetone at a purity that misses his spec**.  Read its
`CLAUDE.md`: every one of those differences traces to a measurement made
*before* the unit that carries it was built.  Two of the seven cases that led
here **wrote down what the columns would do before the columns existed**, and
were right.

*New idea: a simulation is a claim, and a claim is only worth what you can say
about its error.*

---

## What this path is not

* **Not a syllabus.**  It is a sequence chosen so each case leans on the last;
  a course has other constraints, and the person teaching one should reorder
  this freely.
* **Not the whole corpus.**  Batch reactors and recipes, dynamic control loops,
  electrolytes and crystallisation, membranes, adsorption, pinch analysis,
  parameter fitting, sizing and costing — none of that is here.  See
  [`tutorials-catalogue.md`](tutorials-catalogue.md) once you want the
  reference rather than the way in.
* **Not a substitute for the guides.**  `docs/userGuide.tex` and
  `docs/theoryGuide.tex` are where the grammar and the equations live.

## If something does not run

Every case listed here is checked by `bin/runTests` on every run, so a failure
is a real signal.  Check first that your build matches your tree — `make all`
— because the suite refuses to run at all when it does not, and for good
reason.
