# The errors a student makes

*Record of the 2026-09-06 slice on tasks #62–#66, the five open items of the
2026-09-04 seven-way audit (`what-seven-readers-found-in-one-morning.md` §4).*

## 1. Why these five, together

Every other defect this project has chased was the engine being wrong.  These
five are the engine, or the guide, failing a reader who did something ordinary
and slightly wrong: forgot a key, mistyped one, copied an example out of the
manual, or believed a tutorial header.  The project's reason to exist is a
student adopting it, so a wrong answer reachable in the first hour outranks a
correlation nobody has asked for.

Each of the four defects not already verified was **re-verified against the
tree before being touched**, because a defect recorded two days ago may have
been closed since and a stale absence outliving the gap it named is a failure
mode this project has paid for.  None of the four had been closed.

---

## 2. #65 — a default that named what the factory could not build

`SpiralWoundModule.cpp` read

```cpp
MassTransferModel::New(mt->lookupWordOrDefault("model", "constant"))
```

while `MassTransferModel::registerBuiltins()` registers only `SchockMiquel`.
A `massTransfer {}` block that merely forgot its `model` key therefore died
with `unknown model 'constant'.  Registered: SchockMiquel` — naming a model the
**engine invented in its own default**, that the reader never wrote, and that
no document could have warned them against.

The history matters and decided the fix.  `constant` was a real registered
model until commit `151b654c7` (2026-08-23, "Five never-selected models leave
the tree"), which deleted it in a pruning review Vítor approved, on the ground
that a bare `k_film <value>;` scalar was already the documented way to pin a
constant coefficient and the same declaration had two homes.  What the pruning
left behind was the default string, and the class header's own built-in list,
both still naming the deleted model.

**So the fix is not to re-add the model** — that would reverse a decision taken
on good grounds — **but to remove the dishonest default.**  The block now
requires a `model` key and refuses by name when it has none, listing what is
registered and naming the other route:

```
SpiralWoundModule: the `massTransfer {}` block declares no `model` --- there is
no default film model.
  Registered: SchockMiquel
  For a FIXED coefficient declare no massTransfer block at all and give
  `k_film <value>;` in operation instead.
```

**THE RULE, which is the durable half: a default must never name what the
factory cannot build.  Where there is no honest default, refuse and name the
routes that exist.**  `src/core/RegistryRefusal.H` — the one home for an
unknown-name refusal, built the day before — states in its own words that it
cannot see this class of defect.  This is the other half of that pair.

Swept rather than assumed: every `X::New(... lookupWordOrDefault("model", D)
...)` site in `src/` was checked against its own factory's registrations.  Thirteen
sites across ten factory classes; `MassTransferModel` was the only broken one.
That sweep is now the gate (§7).

Also cleaned in passing, because a stale built-in list is the same defect in
prose: `MassTransferModel.H` and `PressureDropModel.H` both still documented a
`constant` model among their built-ins.

**Four membrane factories converted to `registryRefusal::message`** while the
file was open (`MassTransferModel`, `PressureDropModel`, `OsmoticModel`,
`membrane/TransportModel`) — each had been hand-writing its own refusal
sentence, which is a second home for the registry's vocabulary.  A student who
now types `SchokMiquel` is asked *"Did you mean 'SchockMiquel'?"* and told the
lookup is case-sensitive; before, they got the bare list.

---

## 3. #62 — the guide taught a key the parser has never read

The engine reads `standardThermochemistry { referenceState idealGas |
pureLiquid | pureSolid; }` and **defaults it to `idealGas` when absent**
(`Component::readFromDict`).  Three manuals taught a `phase` key with the
values `gas` / `liquid` / `solid`, one of them calling it *mandatory*:

* `developerGuide.tex` — the paragraph *"The `phase` field (mandatory in
  `standardThermochemistry`)"*, its three-row table and its default paragraph;
* `userGuide.tex` §components — `standardThermochemistry { dHf_298; s_298;
  phase; }` and *"the `phase` keyword (`gas` / `liquid` / `solid`)"*;
* `userGuide.tex` §data tiers — *"declare the `phase` of the tabulated
  ΔH°f explicitly"*;
* `theoryGuide.tex` — *"The `phase` keyword of the previous subsection"*,
  where that subsection is correctly about `referenceState`.

**Reproduced, not supposed.**  On a copy of `crystalliser01_sugar`, sucrose's
`referenceState pureSolid;` was replaced by `phase solid;` — exactly what the
Developer Guide instructed — and the run:

| | curated record | guide's `phase solid;` |
|---|---|---|
| exit code | 0 | 0 |
| cooling duty | 271.7 kW | **264.5 kW** |
| heat of crystallisation | 4377.5 J/mol | **0.0 J/mol** |
| what the run said about it | — | nothing |

The only new line in the log is an advisory asking for sucrose's `Tc`, `Tb` and
`HvapTb` — an ideal-gas vaporisation leg the author never asked for, and
precisely the shape the Developer Guide's own pitfall box names: *an error
message that is advice which creates the bug.*  A curator following it would
supply the gas data and convert an honest complaint into a silent wrong answer.

Fixed everywhere the word was taught, in the guides and in the tree:

* the four guide sites above, with a new pitfall box in the Developer Guide
  carrying the measurement;
* **the Developer Guide's component-record example** (see §4 — it was wrong in
  six ways at once, `phase` among them);
* **`bin/curate/import_gibbs_nasa.py`, which WRITES `phase gas;`** into every
  record it imports — the tool sowing the dead key;
* **`EstimateComponent.cpp`**, which writes into every generated component
  proposal the advice *"declare standardThermochemistry { phase gas; Hf …;
  S ?; }"* — three key names at once that the parser does not read (the real
  ones are `referenceState`, `dHf_298`, `s_298`).  The three committed
  `.estimated.dat` records carrying that text were corrected too;
* **ten live records**, `tutorials/plant/twoSectorDemo/constant/components/comp{A..J}.dat`,
  which declared `phase gas;` inside `standardThermochemistry`.  They are the
  only records in any loadable tier that did.  Their answers do not move: the
  key was unread and the default is `idealGas`, which is what `phase gas` meant.
* two stale engine comments (`Flowsheet.cpp`, `ThermoPackage.cpp`) still
  describing the field as `standardThermochemistry.phase`.

**NOT done, and it is deliberate.**  The audit reserved *"whether an unread key
inside a component record should REFUSE or announce"* as a contract decision.
It still is.  A first draft of this slice was going to make `phase` refuse
inside `standardThermochemistry`; that would have pre-empted a decision Vítor
holds, so it was dropped.  Until it is taken, the guides are the only thing
standing between a reader and a silently wrong rung, which is why the pitfall
box says so on the page.

Measured while deciding: the block's whole vocabulary across every loadable
tier is `dHf_298`, `s_298`, `referenceState`, `dGf_298` and the three rung
sub-blocks — a closed set, so a refusal would break nothing today.  Also found
and NOT acted on: **`dGf_298` appears in 58 records and the engine reads it
nowhere**, while `Component.cpp`'s own comment calls it *"optional — formation
Gibbs, used for validation"*.  That is a second instance of the same class and
belongs with the same decision.

---

## 4. #64 — guide examples that send a student into a refusal

The original audit thread named five and is not recoverable; the list was
re-derived by sweeping the manuals mechanically and running what could be run.

**One listing accounts for a complete dead end, and it is the one a reader
follows to add a component.**  `developerGuide.tex`'s component-file example
was wrong in **six** ways, each of which was reproduced by writing the listing
verbatim into a case's `constant/components/` and running it:

| the guide wrote | the parser reads | what the reader gets |
|---|---|---|
| `component <name>;` | `name <name>;` | hard refusal about `component{}` **blocks**, a grammar they never used |
| `mw 78.11;` | `MW` | `missing scalar entry 'MW'` |
| `Hvap_Tb 30720.0;` | `HvapTb` | silently 0 |
| `vaporPressure { A; B; C; }` | `coefficients (A B C);` | `missing list entry 'coefficients'` |
| `coeffs ( … );` | `coefficients ( … );` | `missing list entry 'coefficients'` |
| `Tmin`/`Tmax` | `Trange (lo hi);` | silently no validity window |

Peeled one at a time, the reader hits four consecutive refusals and two
silences before the record loads.  The listing is now the real grammar,
cross-checked against `data/standards/components/benzene.dat`, which is the
compound it was always describing.

**What was swept and came back clean**, recorded so nobody re-derives it:

* every `type`/`model`/`activityModel`/`fugacityModel`/`method` value in every
  `[language=dict]` listing in every manual, against the registered names — two
  hits, both false positives (a reaction-kinetics `type powerLaw` and the
  Developer Guide's hypothetical `isothermalSplitter`);
* every key in every dict listing against the set of dict keys the engine looks
  up anywhere — the survivors were all reached through helper lambdas
  (`recycleSolver`, `recycleMaxIter`, `recycleWegsteinQmin/Qmax` are read by
  `recScalar`/`recWord`, which take `const char*`);
* the five `thermoPhysPropDict`-shaped listings in the User Guide, **run**: the
  `gammaPhi`, `diluteSolution`, `gammaGamma` and reactive-distillation examples
  all load and solve.  The `gammaGamma` one *differs* from the corpus form (it
  declares an `activityModel` inside each `liquidPhases` entry where every
  corpus case declares one shared `liquid { activityModel {…} }`), but it runs;
  it is not a refusal and was left alone.

So: **one guide listing carrying six defects, not five separate listings.**
Whether the original five were counted differently cannot be recovered, and
saying so is better than presenting a number that matches by coincidence.

---

## 5. #66 — six tutorial headers the run contradicts

A header is prose about a run; the run is the fact.  Every correction below
moves the HEADER, never a golden — and no golden moved in this slice.

Derived by two mechanical sweeps (golden key names appearing in headers with a
number; unit-aware `label ~ number unit` claims) plus a hand audit of the 23
cases that declare `tier tutorial;` — the first path a student is offered.

| case | the header said | the run says |
|---|---|---|
| `steady/heat/heatExchanger01_water_water` | `LMTD ~ 22 K` | **18.758 K** — and the header's own cross-check (`U·A·LMTD ~ Q`) fails on its own number: 5000 × 22 = 110 kW against the run's 93.8 kW |
| `batch/combustion/ignition01_h2o2` | `T_final = 2785 K`, `tau_ign ~ 16 us` | **2641.5 K**, **9 µs** |
| `steady/evaporation/evaporator01_brine` | `Economy ≈ V_evap / F_steam ≈ 0.99` | **0.820** (a KPI the run publishes, not one of the header's own hedged hand-estimates) |
| `steady/flowsheets/process03_recycle` | "converts ~25 % per pass … with ~80 % recycle" | **80.9 % per pass**, **60 % recycled** — the two numbers are each other's, and the file's own unit comment already said "~80 % per pass" |
| `steady/flowsheets/process02_with_design` | `hotStream (~359 K, 0.9 % vap)`, heater "lands ~5 K above reactor outlet", flash "inherits ~359 K" | **361.9 K**, **0.022 % vapour**, **+11.9 K** |
| `batch/still/still01_benzene_toluene` | `L(600 s) = 1 mmol − 0.9 mmol = 0.1 mmol`, `(≈ 90 mmol over 600 s)` | the charge is **1 mol** (`totalMoles 1.0e-3;` kmol) and the offtake **0.9 mol**; the header's own preceding sentence says "1 mol" — 1000× out in one line and 10× out in the other |

`docs/tutorialsGuide-*.tex` is a generated view of these headers and was
regenerated in the same commit.

**RESERVED, untouched, and it is the right call:** `membrane01`'s flux (header
20–25 LMH, engine 47.78 LMH).  20–25 LMH is the physically typical seawater RO
figure, so the header may be right and the model wrong; rewriting the header to
match would pin a possibly-wrong answer as the reference.  The golden pins the
answer, so it has not moved; the header's numbers were never pinned by anything.

**What the sweeps could NOT see**, so nobody reads more into the six than is
there: a header claim whose label does not match any golden key, a claim in
prose without a number, and any case outside the 23 tier-tutorial cases that
neither sweep flagged.  Every candidate the sweeps raised was read in context;
all but the six above were dismissed as false positives, and they fall into four
recurring shapes worth knowing before running the sweep again: a declared INPUT
quoted back in the header (`merkelNumber 1.5`, `nStages 15`), a historical value
the header explicitly labels as historical (`utility01`'s NTU 13.8, which its
own paragraph is about), a unit mismatch between a header's kW and a golden's W,
and the same KPI name carried by two different units of the same case.

---

## 6. #63 — the typo that changes the model

Two halves.

### (b) the mistyped VALUE — already closed

Closed on 2026-09-06 by commit `cb8995777`: `src/core/RegistryRefusal.H` is the
ONE home for an unknown-name refusal, six factories converted, and
`dictAudit::editDistance` made Damerau–Levenshtein so a transposition costs 1.
Four more factories were converted here (§2).  Nothing was redone.

### (a) the mistyped KEY — MEASURED, and NOT wired.  A decision is needed.

`dictAudit::auditTree` is called on `postDict`, `solverDict` and `outerDict`,
and `dictAudit::audit` on each unit's `operation {}` block.  It is called on
**nothing else** — in particular not on `constant/thermoPhysPropDict`, which is
where a student writes physics.

**Reproduced.**  On a copy of `crystalliser05_nacl_pitzer`:

* `compositionBasis molarity;` — the right key, a value the builder rejects —
  refuses by name: *"the electrolyte surface is molality-based"*.  Correct.
* `compositionBasi molarity;` — **one character dropped** — exit 0, a full
  answer, the refusal never fires, and **nothing says a word**.  The declaration
  the author believed they had made simply is not there.

**The measurement, which is what the DictAudit header demands before its own
scope is widened.**  A throwaway patch called `auditTree` on the package dict
and the corpus was walked — every `choupoSolve` case under `tutorials/steady`,
`tutorials/plant` and `tutorials/electrochem` that ships a golden:

> **27 findings, three classes, zero false positives.**
>
> * `equilibrium.aqueous.apparentComponents ( … )` — **15 cases** (the
>   `crystalliser05…12`, `overlay02`, `evaporator06…09` family).  Read by
>   nothing in `src/`.
> * `equilibrium.liquid { fugacityRoute …; root …; }` and the same for
>   `vapour` — **3 cases** (`flash09_n2ch4_stryjek`,
>   `flash10_ch4propane_pcsaft`, `cavett01_recycle_train`).  The whole block is
>   unread.
> * `caloric.liquid.root` / `caloric.vapour.root` — the same 3 cases.
>   `departureRoute` beside it IS verified; `root` is not.

The second and third classes are the substantive finding: a `phiPhi` case
**declares which cubic root each phase takes** and the engine decides for
itself.  That is not a typo, it is a grammar question.

**It is NOT wired, and the reason is the brief's own test.**  The walk is clean
in the sense that matters — it reports no key that another reader legitimately
consumes — but shipping it would print a `[dict]` warning on 16 curated
tutorials, and resolving those three keys means either teaching the engine to
read `root`/`fugacityRoute`/`apparentComponents` or deleting an author's
declaration about physics from three curated reference cases.  Both are
thermo-grammar decisions, which are Vítor's, and September's rule is that the
engine is frozen by default.  **The wiring is one line** in
`src/applications/choupoSolve/main.cpp` beside the three that are already
there:

```cpp
if (packageDict)
    dictAudit::report(dictAudit::auditTree(*packageDict,
                                           "thermoPhysPropDict"), verbosity);
```

**The other half of the same question was measured and is NOT clean, which is
worth recording so it is not tried again.**  Auditing the unit-level dict in
`flowsheetDict` — the siblings of `type`, where `modl simultaneous;` on a
column is silent today and runs Wang-Henke — produces **806 findings** over the
same corpus, 723 of them the key `outputs`, plus `sector`, `thermo`,
`propertyContextBase`, `model`, `operation` and `tolerance`/`maxIter`.  Every
one is read by a consumer that does not read it off this dict object.  That is
exactly the noise `DictAudit.H`'s scope note is about, and a diagnostic that
cries about legitimate keys teaches the author to skip all of them.  **The
unit-level dict cannot be audited by read-tracking as it stands.**

---

## 7. The gate

`bin/curate/check_model_default_registered.py` — **NEW**, and it is a new gate
in a month whose rule is *no new gates*, so it is flagged for a ruling rather
than presented as settled.  It makes ONE claim: every factory call site in
`src/` whose argument carries a literal `lookupWordOrDefault("model", D)` has a
default `D` that its own class registers.  Both sides are recounted on every
run, never transcribed.  It carries the construct itself as a **probe** (a
scanner that has stopped matching its own shape would pass arm (a) trivially,
since every real site would then be invisible) and a **negative** (a default
that IS registered must not be reported).

Four sabotages, all firing:

1. reintroduce `"constant"` in `SpiralWoundModule` → names the site, the
   default and what is registered;
2. break the call-site regex → the probe arm fires and says arm (a) is proving
   nothing;
3. rename `OsmoticModel`'s `vanHoff` registration → both of its call sites
   reported;
4. make the comparison report everything → the gate refuses (through arm (a) as
   well as the negative; the two share a code path, so S4 cannot isolate the
   negative arm — recorded rather than claimed otherwise).

**What it does not check, and this is the neighbouring defect it leaves open:**
a default consumed by an if-CHAIN rather than a factory.  `HeatExchanger`
(`epsNTU`), `Crystalliser` (`equilibrium`), `SprayDryer` (`marshall`) and
`BatchStill` (`rayleigh`) each read a `model` word and fall through to a default
branch.  Those defaults are reachable, so this gate's claim holds trivially —
but a **mistyped** model name in such a chain falls into the default instead of
refusing: `model MSMR;` on a crystalliser silently runs the equilibrium model,
`model geomtry;` on an exchanger silently runs eps-NTU.  That is the same family
as #63 and needs its own rule; it was measured and left, not fixed, because
turning four silent fall-throughs into refusals is an engine behaviour change
under a freeze.

> **PARTLY CLOSED 2026-09-07** — and the half that closed is written here
> because the paragraph above is the kind of sentence a later reader loads as
> still true.  The crystalliser and the spray dryer now REFUSE an unrecognised
> `model` word, as do the distillation column's `model` slot, its side draws'
> `phase` and the pneumatic conveyor's bend `type` — five sites, through
> `registryRefusal::message`, gated by arm (d) of this same gate.  What was
> measured in the meantime is why it was worth doing: `MSMRP` on
> `crystalliser02_msmpr` reported a yield 42 % out, and `langrishKocke` on
> `sprayDryer04_profiles` reported EVERY KPI byte-identical while running a
> different chamber model.  **`HeatExchanger` (`epsNTU`) and `BatchStill`
> (`rayleigh`) are still open**, and `model geomtry;` on an exchanger still
> runs eps-NTU silently.  Record:
> [`three-silences-at-exit-zero.md`](three-silences-at-exit-zero.md).

`#62` has **no gate**, deliberately: the only mechanical claim available is
"no `phase` key inside a `standardThermochemistry` block", and writing it would
pre-empt the reserved refuse-or-announce decision.  The two writers that were
sowing the key are fixed instead, which removes the regression path.

---

## 8. What was deliberately not done

* The `phase`/`referenceState` **engine half** — reserved (§3).
* The **`dGf_298` unread key** in 58 records — the same reserved decision (§3).
* **Wiring the `thermoPhysPropDict` audit** — measured, clean, one line, waiting
  on a grammar decision about `root` / `fugacityRoute` / `apparentComponents`
  (§6).
* **Auditing the unit-level dict** — measured and rejected on the evidence
  (§6).
* **Refusing a mistyped model name in the four if-chain units** (§7).
* **`membrane01`'s flux header** — reserved (§5).
* Re-deriving the original five-and-six counts of #64 and #66 to match.  What is
  here is what was measured; the counts happen to land at one listing with six
  defects and six drifted headers, and no attempt was made to make them agree
  with a number from a thread nobody can read.
