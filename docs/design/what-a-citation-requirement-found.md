# What a citation requirement found

*Record of the 2026-08-28/29 slice: defining every symbol on every EduTool
lesson page, and the eight engine defects that fell out of doing it by reading
the source instead of the page.*

---

## 1. The ask, and why it was not a writing job

The owner, reviewing the tools:

> "nos EduTools tens de ter cuidado e garantir que as variaveis são todas
> definidas para os alunos náo se sentirem perdidos. Não sejas yes man e ve se
> isto faz sentido"

The measurement, taken before anything was written: **133 symbol uses across
sixteen lesson modules where the LETTER never appeared outside a formula.** A
student meeting `Me = KaV/L` or `c_s` or `θ` on a page had nothing to read.

The obvious response is to write 133 definitions. That response is wrong, and
the reason is the project's own standing rule: **a missing definition is
visible and a wrong one is not.** A student who cannot find what `c_s` means
knows they cannot find it. A student who reads a confident, fluent, incorrect
definition learns something false and has no signal that they did. Written
from memory, at that volume, a meaningful fraction would have been wrong.

So the constraint came first: **every symbol needs a `file:line` citation into
the engine, and the parent verifies them mechanically.** Eleven agents, one per
lesson, each forbidden to write a file or run a git command — they produce a
report, nothing else.

## 2. The finding is the method

The citation requirement was introduced to make the definitions *checkable*.
What it actually did was change what the agents **read**. A definition written
against a page paraphrases the page. A definition that must carry a line number
forces someone to open the unit that computes the answer — and once you are
reading `CoolingTower.cpp` to find out what `cp_L` is, you notice that the page
above it is wrong.

Eight defects came out of eleven reports, none of them the thing anybody was
looking for. Two of the eight are in files this session had already read for
other reasons, without seeing them.

### 2a. The cooling tower contradicted itself inside one step

`merkelLesson.ts` step 3 said:

> "The ratio that couples the two sides is L/G … and on the diagram it is the
> slope of the operating line."

The engine's operating line is `h1 + LG*cpL*(T - T_out)`. The diagram's
vertical axis is an enthalpy and its horizontal one a temperature, so the slope
carries `cp_L`. **The step's own formula, two lines below, was already
correct** — `h(T) = h_air,in + (L·cp_L / G)(T − T_water,out)`. The prose and
the equation on one page disagreed, and the equation was right.

A reader who trusts the sentence and checks the units finds the mismatch and
concludes they have misunderstood. That is the characteristic cost of a wrong
definition: it does not look like an error, it looks like the reader's failure.

### 2b. A declared hypothesis the code does not implement

`CoolingTower.H` listed among its stated assumptions:

> "cp of liquid water, carrier and vapour are evaluated once at the arithmetic
> mean of the relevant inlet/outlet temperatures."

Neither half is true. The carrier and vapour cp's are at `0.5*(T_air,in +
T_water,in)` — the two **inlets**. The liquid cp is at `0.5*(T_water,in +
298.15)` — a fixed 25 °C surrogate, and **not an outlet mean at all**.

The reason is good, and that is what makes the vagueness costly: in RATING mode
the water outlet is precisely the unknown being solved, so forming the constant
from it would make the integrand depend on the answer. The header now says
that, and says that it is a real approximation at the cold end of a tower whose
outlet is far from 25 °C. A vague claim was hiding a defensible design decision
*and* an honest limitation, both.

A test was pinning the vague sentence (`toContain("evaluated once at the")`).
It pins the specific one now.

### 2c. The claim this project wrote about itself, and got wrong

`bjerrumLesson.ts`, and the sealed witness case's own header, and the
registry, and the generated tutorials guide, and — worst — **a passing test**:

> "there is no pH input anywhere in Choupo, by a settled decision"

`Speciate.cpp:214-225` accepts **both** `pH <number>;` and `pH solve;`, and
`SpeciationSolver.H:45-50` documents the two closures side by side as "two
closures, the case picks one".

Six places. One of them a green test asserting the page says it. **A test over
a false claim is worse than no test**: it converts an error into a maintained
invariant, and every future reader who wonders is answered by the suite.

The true version is stronger than the false one, which is the usual outcome and
is worth stating as a general expectation rather than a happy accident here.
The given-pH mode exists because a laboratory sheet reports a **measured** pH,
which is a datum. What it costs is the electroneutrality row: the run then
reports the net charge the composition carries instead of forcing it to zero,
and says so on the console in those words. A textbook Bjerrum diagram drawn
that way is a sequence of compositions no beaker can hold. The witness declares
`pH solve;` **instead** — so the lesson is now that the axis being a result is
a CHOICE, visible in one word of the case file, rather than an absence in the
engine. That is a better lesson and it happens to be true.

### 2d. Three numeric drifts in prose nothing was checking

The same witness teaches through prose that **quotes numbers**, and those
numbers live in two homes that cannot share a variable (a case header the
solver reads past, a TypeScript module the browser reads) while being DERIVED
from a third (the golden). The arity sin with prose on top.

* `gamma_CO3` at the second crossover: **0.81** in the lesson, **0.82** in the
  case header. The golden says **0.8130**.
* The second crossover pH: both pages said **10.269**, which is the pH of the
  nearest computed BEAKER — where the ratio of the two species is 0.982, i.e.
  not equal. The interpolated crossing is **10.262**. The FIRST crossover *was*
  interpolated correctly, so the two had not even been done the same way. Both
  pages now say the crossovers are interpolated, because the axis is 44 sampled
  beakers and not a continuum, and quoting an interpolated value without saying
  so is how 10.269 got there.
* **A reported drift that was not one**: "0.9997" against "0.99966" for the
  sum-to-one dip. Both are correct roundings of 0.999657. Recorded here because
  a report that checks and finds nothing is worth as much as one that finds
  something, and because taking an agent's finding at face value is the failure
  mode on the other side.

`check_bjerrum_prose` recomputes the four quoted quantities and the dip from the
golden and requires both prose homes to carry them, plus a negative on the
overstatement. When the two homes are prose in two languages that cannot share
a variable, **a gate that recomputes is the only available single source.**

### 2e. FUG: three places where an absence came back as a number

Reported by the shortcut-column glosser, all three at exit 0 with a plausible
answer.

**The feed bubble point.** `Tref = bub.converged ? bub.T : Tf`. That bubble
point is the method's **only** thermodynamic evaluation: every relative
volatility, and hence N_min, θ, R_min, N and the feed stage, comes from it. A
failed bubble point did not produce an error; it produced a column designed for
a different mixture state. Refuses now, naming three remedies.

**The operating reflux.** `R = 1.3 * Rmin`, commented "sensible default". It IS
the usual rule of thumb — which is exactly what made the silence expensive
rather than harmless. The stage count is what a student reads off this unit, R
is what decides it, and a number the engine chose is one nobody can defend when
asked at a viva why the column has 22 stages. Refused, with both spellings
shown and the computed R_min quoted so a factor can be picked from it.

Measured before deciding, because inferring the corpus from a few cases is a
mistake this project has already paid for once: **both** cases in the corpus
already declare `refluxFactor 1.3`. The default branch was reached by nothing,
and an unexercised branch is one nothing tests. Neither golden moves.

**The feed stage**, published as 0.0 when Kirkbride could not be formed. Stage 0
is not a stage; a reader takes it for the top of the column. Withheld now (the
batch dryer's `t_critical` precedent: absent and zero are different claims).

**And what is true about that third one:** the branch is **latent, not live**.
Reaching it needs the heavy key absent from the distillate or the light key
absent from the feed, and *both are refused earlier* by Underwood's own
no-sign-change check. So `feed_stage 0.0` was never actually published. The
withholding is a guard against that ordering changing; arm (c) of the gate pins
the **unreachability** rather than the withholding, and the OK line says so.
Crediting a guard with coverage it lacks is the error this project keeps
finding inside its own gates.

### 2f. Two units, one diagram, two densities — NOT fixed

The pump-system page draws two curves whose intersection is the operating
point. The pump builds liquid density from the component record's constant
`Vliq` (≈997 kg/m³ for the witness's water); the pipe asks the thermo package,
which uses saturated Rackett (877 kg/m³ in the golden) and **announces about
itself** that it runs ~12 % low for water at 25 °C.

Each side is honest alone. Nothing says the two sides of the *same page*
disagree. The consequence is precise and now stated in the gloss of `ρ`:
**pressures may be compared across the crossing** (both curves are in Pa, the
intersection is meaningful); **heads may not**, because each was divided by a
different ρ.

Deliberately not unified. The obvious move — make the pump ask the package —
would make the answer **worse** for water, since it is Rackett that declares
itself weak, not `Vliq`. Choosing which route is authoritative is a model and
curation decision, it moves hydraulics goldens, and it is the owner's.
Registered as a task with three options and a recommendation (announce when a
flowsheet puts a pump and a pipe on one line with densities differing by more
than a threshold — the "announce, do not judge" posture the rest of the engine
uses), rather than decided here.

### 2g. Two smaller ones, kept because they are the same shape

The Merkel number `KaV/L`: **K, a and V never appear apart** anywhere in the
unit — no variable, no dict key, no correlation. So the Merkel number sizes
nothing by itself, and the gloss says so. The drying page's `k_Y` is declared
equipment data with no Sherwood, Reynolds or Schmidt correlation behind it
anywhere in the unit: raising the air temperature moves the driving force and
leaves `k_Y` exactly where it was typed. Neither is a defect in the engine.
Both are facts a student would otherwise assume the other way, and assuming a
correlation exists where none does is how a design gets defended on a claim
nobody made.

## 3. A correction to my own brief

The brief handed to the Hunter-Nash glosser listed "the drying rate" among the
meanings of `R`. The corpus writes that `N`. The clause was dropped and never
reached the page. R is overloaded four ways without it (raffinate, reflux
ratio, the gas constant, the heat-removal curve), which was the point.

## 4. What is NOT established

`check_lesson_symbols` says it in its own OK line, and it is the half that
matters: **it does not check whether a definition is correct, whether it is
useful, or whether the symbol needed one.** `X — the reflux ratio` on the
drying page would pass it and be nonsense. The citations were verified
mechanically against the named files, which establishes that the line exists
and says roughly what the report claims; it does not establish that the
*physics* of every gloss is right. Sixteen lessons of prose have had one pass
by one reader.

The chemical-formula filter is by SHAPE and is occasionally wrong in both
directions — it once ate its own subject (a bare capital read as a formula, so
`X`, `Y`, `R`, `A`, `N`, `L` and `V` were all skipped and the gate reported
green over the exact symbols it existed for; caught only because a stale pin
fired on an unrelated lesson and the count looked too good).

## 5. Gates

`check_lesson_symbols` (16 of 16 lessons, debt discharged; the empty waiver
dict is kept rather than deleted, because an empty waiver list is the claim
"nothing is excused here") · `check_bjerrum_prose` (4 sabotages) ·
`check_shortcut_column_refusals` (3 arms + a negative, arm (c) pinning
unreachability rather than claiming coverage).
