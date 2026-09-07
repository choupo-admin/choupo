# Three silences at exit 0

*Slice date 2026-09-07.  One record for three defects, because they share one
rule and were paid for together.*

---

## 1. The rule they share

The engine promises, in its own words and in three separate headers, that it
will either **refuse** what it cannot honour or **announce** what it had to
assume.  In the three places below it did neither: it produced a plausible
number, exited 0, and said nothing that would let a reader tell.

Two of the three were found by changing **one character** in a corpus case.
That is the property worth remembering — not the three bugs, but the fact that
a single transposed letter, in a slot the project's own convention calls a
model selector, was enough to swap the physics with the suite green.

The three are:

| # | Where | What it did |
|---|---|---|
| 1 | four unit ops read `model` through a bare `if`-chain whose **else is a catch-all** | any unrecognised word silently selected the default |
| 2 | `choupoSolve`'s only `printAdvisorySummary` call sat inside the `else` of `if (outerDict)` | every case with an outer driver printed no caveat block and no divergence banner |
| 3 | the electrolyte builder's solid-phase lookup was absence-tolerant and nothing validated the **name** | a phase no record owns gave saturation 0 and crystallised the whole solute |

---

## 2. Silence 1 — the `model` slot guessed

`type` then `model` then `operation` is the project convention, and where the
`model` slot reaches a **factory** it has been safe since 2026-09-06: the
factory refuses an unregistered name through `registryRefusal::message`, which
is the one home for that sentence.  Four unit operations do not reach a
factory.  They dispatch through `if` / `else if` with a plain `return` at the
end, so the last branch answered for every word nobody had written a branch
for.

Measured on the corpus, before anything was changed:

* `crystalliser02_msmpr`, `model MSMPR;` → `MSMRP;` — **exit 0**, yield
  `0.395775569169` where the population balance reports `0.277787256689`
  (+42 %), and all twelve population-balance KPIs (`mu0`, `mu3`, `n0`,
  `nucleationRate`, `growthRate`, `L_dominant`, …) simply absent from the
  result.
* `sprayDryer04_profiles`, `langrishKockel` → `langrishKocke` — **exit 0** and
  **every KPI byte-identical**.  The only difference on disk is
  `reports/unitOperations/dryer/profile.csv`, which stopped being an axial
  profile (`z_m,T_gas,T_particle,X_moisture,…`) and became a size distribution
  (`diameter_micron,massFrac`).  **No golden can ever see this**, which is the
  sharpest argument in the slice: the corpus's regression instrument is blind
  to it by construction.
* `column02_simultaneous`, `simultaneous` → `simultaneou` — **exit 0**, the
  Wang-Henke bubble-point sweep (`iterations 79`) in place of the MESH Newton
  (`iterations 5`), publishing a different KPI set.
* `column04_multifeed_sidedraw`, a side draw's `phase liquid;`/`vapour;`.  This
  fifth site was found by scan and not by run, so it was **run**: `phase
  vapou;` produced a result byte-identical to `phase liquid;`, while the vapour
  draw actually asked for moves `Q_reboiler_kW` from 1516.14 to 1664.78 (≈10 %)
  and `x_D_LK` from 0.9659 to 0.9460.  Same shape, confirmed, fixed.
* `pneumaticConveyor02_bends`, a bend's `type longRadius;`.  A mistyped
  geometry priced the long-radius ratio 0.75 **and the run then printed the
  mistyped word beside that ratio**, as though it had been understood.

**The fix.** Each chain refuses a word it does not know, through
`registryRefusal::message` so the wording keeps one home.  A chain is not a
registry, so the function gained one parameter — the list's LABEL, `"Accepted"`
instead of `"Registered"` — and nothing else about the sentence moved: the
order, the closest-name suggestion (`Did you mean 'MSMPR'?`), the
case-sensitivity line are still decided in `src/core/RegistryRefusal.{H,cpp}`.

**What this changes for a case author, said plainly:** a case carrying a
mistyped model word now FAILS. That is the point. The corpus was surveyed
first — every `model`, `phase` and bend `type` word the tutorials write is
inside the enumerations — and no case had to be edited.

**What was NOT done.** The bend `type` check runs even when `exitRatio`
overrides the ratio, because the word is a claim about the geometry and reaches
the log either way. And two more if-chains that read a declared word the same
way — `HeatExchanger` (`epsNTU`) and `BatchStill` (`rayleigh`) — are **not**
covered; they were outside this slice and are named here and in the gate so the
next reader does not mistake five for the whole population.

---

## 3. Silence 2 — no caveat block under an outer driver

`src/core/AdvisorySummary.H` states the contract in its own words:

> A run with no advisories prints one line confirming that — silence from this
> block must mean "the engine raised nothing", never "the block did not run".

The only call to it in `choupoSolve` sat inside the `else` of
`if (outerDict)`, and `printProblemDivergence` was the line above it. So for
every case that ships an outerDict, the block did not run.

Measured: `gibbs04_wgs_temperature_sweep` carries four advisories in its result
JSON — *"vapour pressure requested at T = 900 K, ABOVE its critical temperature
Tc = 132.85 K … the value returned is not a vapour pressure"* — and printed no
caveat block. Move its `system/outerDict` aside and the block appears.

The sibling of this defect was fixed on 2026-09-04: a declared `reports {}`
that silently did not run under a sweep now announces itself by name. Its two
neighbours in the same `if` were left silent. This closes them.

### 3a. WHICH PASS — the decision, taken and stated

An outer driver runs the simulator many times. The block reports **exactly one
of those passes, named**:

* a driver with a **representative pass** (optimisation, designSpec) reports
  that pass — it is the answer the run is about;
* a driver **without** one (sweep, grid, Pareto) reports its **last** pass,
  because `AdvisoryLog` is cleared at the top of every pass *by design* ("so a
  sweep/optim gets per-pass advisories") and that is the pass the sink holds.

Every run now prints a scope line before the block, naming the driver, the
number of passes and which one the block is about, e.g.

```
  [caveats] this run made 13 simulator passes under the `sweep` outer driver.
  What follows describes the LAST pass only; every other pass's advisories ride
  in that pass's own result block.
```

**It is NOT the union across passes**, and the reasons are already written down
in the tree rather than invented here:

1. `AdvisorySummary.H` §*THE PATH IS NOT THE ANSWER* (2026-08-24) rejects
   enumerating advisories raised at states the run visited and left — column13
   printed 99 Davies warnings of which one described the answer, so "the true
   caveat was delivered and not received". A sweep's other design points are
   that class one level up: gibbs04's union would be 13 × 4 = 52 near-identical
   sentences, and the block exists precisely to stop that.
2. The same header states it is "a PARTITION, NOT A DEDUPLICATION. Nothing
   here inspects two messages and decides they mean the same thing." A union
   across passes would be readable only after doing exactly that.

The count-only option (option (c) of the brief) was rejected because the count
alone hides the content — a reader of gibbs04 needs the sentence saying the
returned number is not a vapour pressure, not a tally — and because the counted
rendering is already reserved in this block for `trial`-stamped advisories.
One rendering, two meanings, is the arity sin in a heading.

The pass counter lives at the **one door every pass goes through** (the
`simulate` lambda in `choupoSolve/main.cpp`) rather than on `OuterDriver`,
where five drivers would each have had to maintain it.

### 3b. RESERVED for Vítor — task #77

Whether a sweep should also **write** `converged/` and
`converged/problemDivergence` is not decided here. A driver with no
representative pass still writes neither, and inventing a "representative pass"
to make it write one would answer the question by accident — the same reasoning
the 2026-09-04 slice used for the reports chain.

`CLAUDE.md` said `problemDivergence` was written "**ALWAYS**". Under an
outerDict it was written not at all. The sentence has been corrected to what
the engine does, with the reserved half named.

### 3c. A placement note

On the direct path the block prints *before* the result JSON, so a reader who
stops at the human-readable output still meets it. Under an outer driver the
driver emits its own JSON inside `run()`, before control returns, so the block
can only come after it. It is the last thing on screen, which is the same
intent reached from the other side.

---

## 4. Silence 3 — a declared solid phase nobody owned

`ThermoPackageBuilder`'s single-salt electrolyte adapter resolves a solid
phase's crystal properties and its saturation anchor from the phase NAME the
case declares in `constant/chemistryDict`. Both lookups were absence-tolerant,
and the comment said so: *"Absence-tolerant: no anchor → solubility 0 (Ksp
short-circuits to 0)"*. Nothing validated the name.
`ChemistrySystem::read` validates the KEYS inside `equilibria {}` and never the
words inside `solidPhases ( … )`.

Measured on `crystalliser05_nacl_pitzer`, changing only `constant/chemistryDict`:

| declaration | exit | `m_sat` | `Ksp_activity` | `yield` |
|---|---|---|---|---|
| `solidPhases ( halite );` (correct) | 0 | 6.144 | 38.4846 | 0.18832 |
| `solidPhases ( sylvite );` (a real mineral — KCl's) | **0** | 1e-9 | 0 | **0.999999999868** |
| `solidPhases ( nosuchphase );` | **0** | 1e-9 | 0 | **0.999999999868** |

with `"converged": true`, seal `"verified"`, a caveat block listing three
unrelated advisories and not this, and one line of trace that reads like
physics: `Solubility c_sat(T_op) = 0.000 kg NaCl / kg water`.

### 4a. The trap, and the measurement that decided the shape

The absence-tolerant path might be legitimate somewhere, so it was measured
before anything was made to refuse. Across the 28 corpus `chemistryDict` files
declaring `solidPhases`, every declared phase was resolved against the record
that owns it:

* **26 declarations resolve to an owning record with a `calorimetric` anchor** —
  `halite` on `NaCl`, `sylvite` on `KCl`, `sodiumHydroxide` on `NaOH`.
* **2 declarations name a phase that IS owned and carries NO anchor**:
  `flash16_calcite_precipitation` and `flash19_organic_and_precipitate` declare
  `calcite`, which `CaCO3.dat` owns with an
  `equilibrium { logK25 1.879; dH -28078.8; … }` mass action and no
  `calorimetric` block at all. **That absence is legitimate**: the phase's
  equilibrium is expressed as a mass action, not as a measured solubility.
  (Both cases take the reactive builder, not this adapter — but the principle
  binds regardless.)
* **8 declarations across 4 membrane/optimisation cases** (`calcite`, `gypsum`)
  belong to `formulation gammaPhi`, which reads the whole list by a different
  route and is untouched here.

So the refusal is on **OWNERSHIP, not completeness**. Refusing a phase with no
anchor would have refused two correct cases. Refusing a phase no record owns
refuses nothing the corpus declares.

### 4b. What the engine does now

* A declared phase that **no record owns** REFUSES by name, naming the phase,
  the salt component whose `solidPhases {}` was searched, and what that block
  actually declares:

  > `chemistryDict declares the solid phase 'sylvite', which no record owns.
  > The package's salt is 'NaCl' and its solidPhases {} block declares halite.
  > … Remedy: name a phase 'NaCl' declares, or add the phase to that
  > component's record.`

  Ownership asks the same three places the consumers ask — the salt record's
  own `solidPhases {}`, plus the legacy `phases/solid/` and `chemistry/salts/`
  homes, which no longer exist in the shipped tree but may exist in an external
  case. A check narrower than its consumers refuses valid input.

* A phase that **is** owned but carries no `calorimetric` anchor is
  **ANNOUNCED**, at its site and in the end-of-run block, and judged not — the
  posture the extrapolated Antoine and the sub-band Davies already take. At
  this adapter that absence still means saturation zero, and the reader has to
  be told.

---

## 5. Gates

Extended, not multiplied.

* **`check_model_default_registered`** gained arm (d), which **runs** each of
  the five if-chain sites twice from a scratch copy of a corpus case: once with
  the word mutated (must refuse, naming the word AND listing what the site
  accepts) and once with an accepted **alias** (must not refuse). The pair is
  the point — a site that refused every word would pass the first half alone.
  The gate had named this exact gap in its own blind-spot list; that paragraph
  is now the arm.
* **`check_caveat_surface`** gained arm (e), which runs a sweep and a
  designSpec and requires the block, the scope line and the right word for
  which pass each describes. Its arm (d) was green while silence 2 stood
  because it is a SOURCE check and cannot see an enclosing `if` — the string
  `printAdvisorySummary(` was present in all four binaries the whole time.
* **`check_v2_refusals`** gained the solid-phase arm, in three parts: an
  unowned phase refuses with its message; the phase the salt really owns runs
  clean to exit 0; an owned phase with no anchor is announced and not refused.

Nine sabotages were performed by hand, each restored and the engine rebuilt;
the observed lines are recorded in each gate's own docstring beside the arm
they test. Two of them found defects in the work rather than confirming it:

* **S2** showed the gate's failure message quoted the crystalliser's "+42 %
  yield" for every site, which was false of four of the five. A failure message
  carrying one site's fact to another teaches the reader to distrust it.
* **S5 survived its first run** in a weaker form. The probe asked for `Z` on a
  salt with no ideal-gas datum, so a sabotaged run still exited 1 and the gate
  reported only "refused but WITHOUT the named message" instead of "ACCEPTED
  (exit 0)". **A probe that cannot reach exit 0 cannot tell a silent acceptance
  from an unrelated refusal.** The op was changed to `electrolyteActivity`,
  which exercises the assembled package and returns 0.

---

## 6. Not in this slice, said plainly

The active-salt-by-declaration-order defect, the crystalliser's missing size
axis, `choupo-drill`, the `docs/ai/` retired-shape prose, the remaining
hand-rolled factory refusals, and every gate defect found by the same audit.
Each is its own slice.

Also not done, and each for a reason:

* **The anchor announcement has no corpus witness.** No shipped case reaches
  this adapter with an owned phase lacking an anchor, and one cannot easily be
  built: the adapter resolves the salt from the STANDARDS base, so a wholly
  case-local salt is not recognised as one, and `dolomite` — the only salt in
  the standards tree whose phase carries no anchor — refuses on a missing
  `vaporPressure` block before the phase is read. The gate reaches it through a
  case-local `overlayOf` that ADDS a phase to `NaCl`; that is a fixture, not a
  case, and this paragraph is the record of it.
* **Whether the pass the block names is the right one to report** is a stated
  decision (§3a), not something a gate can derive, and the gate says so.
* **Whether a sweep writes `converged/`** is Vítor's (§3b).
