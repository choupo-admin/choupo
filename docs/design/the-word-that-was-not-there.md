# The word that was not there

**2026-09-12.**  Diagnosis and fix of the evaporator family's plant-boundary
first-law debt — `-6162.50 kW` on `evaporator02_triple_effect_sugar` and five
cases clustered at `-485` / `-821 kW` — and of `phasechange01_partial_condenser`
(`-898.64 kW`), which turned out to be the same family with a worse symptom.

Every number below was produced by a command, and the command is named.  The
engine measured is the one built from this commit's source unless stated.

---

## 1. What was wrong, in one sentence

An evaporator's chest steam had **no home at all** for its thermal state: the
case file did not declare a phase and the unit never asked for one.  The
engine's default for the missing word is *liquid*, so the plant's entire energy
input was priced as liquid water at the boundary while the unit spent its full
latent heat on the process.

This is the fourth member of the family CLAUDE.md §6 names — *the state a unit
computes with is not the state its streams carry* — and the first where the
second home is a **missing word** rather than a conflicting one.  The three
earlier members each had two answers to one question (a dict key, a fixed
correction, an internal re-flash).  Here there was one answer, silently
supplied by a default, and nothing to contradict.  **An absent declaration is
harder to see than a contradictory one, because there is nothing to compare.**

---

## 2. How it was found, and the test that could have killed it

Six cases carried residuals that agreed far too well:

```
  -6162.50 kW  evaporator02_triple_effect_sugar
   -821.35 kW  evaporator08_naoh_dilution_heat
   -485.97 kW  evaporator07_nacl_enrtl
   -485.69 kW  evaporator06_nacl_pitzer
   -485.69 kW  model2_pitzer_evaporator
   -485.18 kW  evaporator09_nacl_sucrose_brine
```

Two agree to the last digit across a Pitzer and an eNRTL package; a third and a
fourth sit beside them across a different solute.  **Numbers that close across
cases which differ in their thermodynamics are a property of something those
cases share.**  The hypothesis was tested rather than assumed: `diff -r` put
`evaporator06` and `model2` at two numbers and a comment apart, and the shared
artefact was one stream file.

`duty_kW` is **identical** — `487.489506466` — in all four of the `-485` cases,
because `Q = F_chest · ΔHvap(T_steam)` and all four read the same chest file
(45 kmol/h at 401.6288333 K).  `evaporator08` differs only in carrying 75
kmol/h.  The residual is that duty minus a small model gap.  They are
near-copies and the diff is one missing line.

---

## 3. The proof

`src/reporting/EnergyBalanceReport.cpp` prices every boundary stream through
`reporting::streamH_elements`.  Instrumented (a scratchpad build, never
committed), `evaporator06` reports:

```
stream=saturatedSteam130C  T=401.628833 P=270000  vfCarried=0  pinned=0  H_kW=-3482.361748
stream=condensate          T=401.628833 P=100000  vfCarried=0  pinned=0  H_kW=-3482.361748
```

Identical.  **The chest leg delivers exactly 0.000000 kW** where the unit's
model delivers 487.49 kW.  The unit's side, in `Evaporator.cpp` as it stood:

| line | what it did |
|---|---|
| `:64` | `auto steamDict = ins[1];` |
| `:86` | read **`T`** only — its own comment said *"F is ignored here"* |
| `:285` | read **`F`** |
| `:288` | `Q_J_s = F_steam_mol_s * dHvap_at_steam;` |
| `:523` | emitted the condensate at `vf = 0.0`, `phasePinned` never set |

`vf` appeared nowhere in the file except on the three outlets.  Line 288
**asserts** a complete condensation and nothing checked it.

### The decomposition, and it closes

Measured on `evaporator06`: the chest ΔH *if the steam were vapour* is
`-2978.768401 - (-3482.361748)` = **503.593347 kW**; the unit's `duty_kW` is
**487.489506466 kW**; the process enthalpy rise on the package surface is
**485.694245503 kW**.

| term | kW | what it is |
|---|---:|---|
| **D1** | −503.593347 | the chest latent heat the boundary never credits |
| **D2** | +16.103841 | `Component::Hvap_latent` (Watson, `Component.cpp:1285`) against the package's own vapour−liquid gap on `H_stream_formation` |
| **D3** | +1.795261 | the unit's `Q_required` (ideal-liquid Cp + pure-solvent ΔHvap) against the package's process enthalpy rise |
| **sum** | **−485.694245** | the published `residual_kW = -485.694245503`, to 1e-8 kW |

The same three terms close on all five single-effect cases:

| case | duty kW | D1 | D2 | D3 | published residual | after the fix |
|---|---:|---:|---:|---:|---:|---:|
| evaporator06_nacl_pitzer | 487.4895 | −503.5933 | +16.1038 | +1.7953 | −485.694246 | **+17.899101** |
| evaporator07_nacl_enrtl | 487.4895 | −503.5933 | +16.1038 | +1.5231 | −485.966424 | **+17.626923** |
| evaporator09_nacl_sucrose_brine | 487.4895 | −503.5933 | +16.1038 | +2.3063 | −485.183190 | **+18.410157** |
| model2_pitzer_evaporator | 487.4895 | −503.5933 | +16.1038 | +1.7953 | −485.694246 | **+17.899101** |
| evaporator08_naoh_dilution_heat | 812.4825 | −839.3222 | +26.8397 | −8.8637 | −821.346206 | **+17.976039** |

### Why the case files looked right

The case's own Antoine, computed from `constant/components/water.dat`
coefficients `(5.40221 1838.675 -31.737)`:

```
T = 401.628833 K  ->  Psat = 270000.72 Pa     (declared P = 270000 Pa)
T = 392.178114 K  ->  Psat = 200000.00 Pa     (declared P = 200000 Pa)
```

The declared `T` **is** the saturation temperature at the declared `P`.  The
state is correct and incomplete: a saturated supply sits exactly ON the
saturation curve, **the one place where (T, P) cannot say which side of it you
are on** — and the default for the missing word is liquid.

---

## 4. A pure-component flash asked a question on the saturation curve has no answer

This deserves its own name, because it is a trap independent of the
evaporator and it can cancel itself out of sight.

`evaporator02` is on a molecular package, so `flashState::twoPhaseSplit`
actually re-solves unpinned streams.  Its chest steam and its `cond1` are the
**same pure water at the same (392.1781136 K, 200000 Pa)**, and the resolver
returned, for both:

```
vfResolved = 0.500000000   regime = two-phase
```

Exactly one half, on two different streams.  That is not a resolution: for a
single component at its saturation point every K-value is identically 1, so the
Rachford-Rice residual is zero for *every* V/F in [0, 1] and the bisection
returns its own midpoint.  **The flash was asked a question that has no answer
and returned the initial guess.**

The consequence is arithmetic: half a latent heat invented on the inlet and
half on the outlet, **2796.44 kW apiece** — and, because they are the same
state, they cancelled *exactly*.  The plant reported a chest that delivered
nothing, and there was no asymmetry anywhere to suggest a numerical fault.

Two lessons ride with it:

* **Two wrong numbers that cancel are invisible.**  The 0.5 would have been
  obvious on either stream alone; on both it produced a clean zero.
* **A degenerate root looks like a converged one.**  `fs.converged` was true.
  Nothing in the return value distinguishes "the equations pinned this answer"
  from "the equations admit every answer and this is where I started".

The fix taken here is at the unit, not the flash: the evaporator **declares**
its three outlet states (§5.3) so nothing re-solves them.  Making the flash
itself refuse a degenerate pure-component root at saturation is a wider change
with a corpus-wide blast radius and is **not taken here**; it is named in §9.

---

## 5. The fix

### 5.1  One home for "what phase is this stream in"

`flashState::StreamThermalState` + `resolveStreamThermalState` now live in
`src/unitOperations/flash/StreamEquilibrium.H`, beside the `twoPhaseSplit`
primitive they call.  They were written on 2026-09-12 inside
`DistillationColumn.cpp` for the feed-quality slice, and a second unit needed
the identical sentence in the same week.  `DistillationColumn.cpp` keeps a
`using` alias so its own vocabulary (a column's inlet is a *feed*) is
unchanged; all 21 distillation cases pass with no golden movement, which is
what a pure move should do.

`Flowsheet::streamToDict` now carries `phasePinned` and `streamName` on
multi-inlet stream dicts — the same two facts the single-inlet `feed {}` block
has carried since the column slice.  Without them a multi-inlet unit cannot
tell an authored pin from an upstream answer (R-E2), and a refusal it raises
cannot say *which* inlet is at fault.  The evaporator's chest is inlet 2 of 2.

### 5.2  The unit refuses a chest that is not vapour

`Evaporator.cpp` resolves the chest stream's thermal state and refuses by name
when it is not vapour, naming both remedies with the file path filled in — the
posture and, where the sentence fits, the wording of
`DistillationColumn::refuseContradictoryFeedQuality`.  The engine does not
choose between the model and the stream.

### 5.3  The three outlets are declarations

`conc`, `vap` and `cond` are now `phasePinned = true`.  The unit *states* that
the liquor leaves at its boiling point, the solvent vapour is vapour and the
condensate is the spent chest; a declaration is never re-solved.  This is what
removes `evaporator02`'s E2 (2796.44 kW) and E3 (703.80 kW).

### 5.4  The condensate leaves at the chest's pressure

It was written as `cond.P = 0.0` and filled in by `Flowsheet.cpp:1438`'s
`if (s.P <= 0.0) s.P = P_inherit`, where `P_inherit` is the **first** input's
pressure — the process feed, not the steam chest.  On `evaporator06` that put a
128.48 °C condensate at 1 bar, a state whose own Psat is 2.7 bar: superheated
vapour by a factor of 2.7, labelled `vf = 0`.  Nothing caught it because the
electrolyte packages register no `"vapor"`-typed phase
(`thermo.phasesOfType("vapor").size() == 0`, measured) and never re-solve
anything.  **A pressure taken from the wrong inlet is the same arity defect as
a phase taken from nowhere**, and it was a trap waiting for the day those
packages gain a vapour phase.

### 5.5  The data

`phase gas;` on the chest file of eight cases — `evaporator01, 02, 06, 07, 08,
09` and `thermoTest/model1, model2` — each with the reason written beside it, so
a student who opens the file meets the trap rather than a silent correction.

---

## 6. evaporator02 is not the same defect scaled

Measured stepwise, each step one change, the residual read from the engine:

| step | change | residual kW | Δ |
|---|---|---:|---:|
| baseline | — | **−6162.501950** | |
| +E2 | `cond` pinned liquid | −3366.063407 | +2796.438543 |
| +E3 | `conc` pinned liquid | −2662.264636 | +703.798772 |
| +E1 | `phase gas;` on the chest | **+134.174058** | +2796.438694 |

`−6162.501950 + 2796.438694 + 2796.438543 + 703.798772 = +134.174058`, exact to
1e-6 kW.  So 45 % of that plant's residual is the missing word, 45 % is the
degenerate flash on an unpinned outlet, 11 % is the unit's colligative BPE
disagreeing with the package's own bubble point, and 2 % is §8.

---

## 7. Five things the work found that were not predicted

### 7.1  "Unmistakable" is not a channel the engine reads

`phasechange01_partial_condenser` feeds a **benzene/toluene 50/50 mixture at
390 K and 1 bar** to a condenser.  The engine's own resolution finds that state
single-phase vapour — its outlet, 22.5 K colder, is only 40 % condensed — and
the engine read the feed as LIQUID anyway.  The
mechanism is *not* §3's saturation-curve ambiguity: a stream with no declared
phase is priced on the `vf` it carries unless the resolution returns a genuine
**two-phase split**, and `twoPhaseSplit` discards a converged single-phase
answer.  So the resolution said "all vapour", the split said "nothing", and the
carried default `0` stood.

Verified directly: an evaporator chest set to 430 K at 200 kPa — 37.8 K of
superheat, no ambiguity anywhere — makes the new refusal print

```
vapour fraction 0.000000 (carried by the stream (single phase))
```

Here the cost was not confined to a report, because `phaseChanger` **does**
read the stream (`PhaseChanger.cpp:183`).  The condenser published
`Q_latent_kW = +370.98` — a positive latent term on a unit whose whole subject
is condensation — with `Q_sensible_kW = -1001.49` making the total come out
right.  *The total was right and both halves were wrong.*  With `phase gas;` the
plant closes at **0.0000 kW** (from −898.639930) and the split reads
`Q_latent -556.47 / Q_sensible -74.04`.  Its pin is **removed** from
`check_energy_closure.KNOWN_OPEN` rather than re-measured, because a stale pin
is a claim about the engine that stopped being true.

And the case's own header had said `feedVapour (superheated, 1 bar, 390 K,
vf = 1)` since it was written.  **Prose is not a channel the engine reads
either.**

### 7.2  A tear seed is an inlet on the first pass

`evaporator05_counter_current` declares its units in liquid-flow order, so each
effect's heating vapour is produced by a unit that runs later and `V1`/`V2` are
declared tears.  Their `0/` seeds gave `(T, P)` and no phase, so on the first
Wegstein pass **effect3's chest was liquid** — and the new refusal caught it,
in a case whose *live* steam was correctly declared and which nobody had
flagged.  Both seeds now declare `phase gas;`.  Its golden does not move: the
tear converges onto the produced, correctly-pinned vapour, so only the starting
point was wrong.  That is the refusal earning its keep on the first day.

### 7.3  A case whose chest was already right, improved by the outlet pins

`designSpec01_triple_equal_areas` declares `phase gas;` **and** a category on
its `utilitySteam_200kPa`, so §5.5 does not touch it.  Its pin moved anyway:
**118.0420 % -> 2.3240 %**, measured by `check_energy_closure --seed` over the
full steady corpus.  That improvement is §5.3 alone — the three outlet
declarations, stopping the re-solve of `cond` and `L3`.  So the two halves of
this fix are genuinely independent, and the outlet half reaches a case the
chest half does not.  It stays pinned (2.324 % is outside the 1.0 % band) and
was re-measured, never hand-edited.

### 7.4  Two goldens were already stale, and re-recording exposed it

`--record` rewrites a whole `expected` file, so it refreshes rows the fix did
not touch.  On `evaporator07_nacl_enrtl` and `model2_pitzer_evaporator` it moved
**19 `kpi`/`stream` rows each** beyond the 2 predicted — and none of them is
caused by this work.  Proof: the engine at the previous commit (`94832f472`),
running the case files as they were shipped, already printed today's values.

| row | shipped golden | this engine, unchanged case | relative |
|---|---:|---:|---:|
| `T_steam` | 401.62883329 | 401.6288333 | 2.5e-11 |
| `T_boil` | 389.441595628 | 389.441595638 | 2.6e-11 |
| `duty` | 487489.506474 | 487489.506466 | 1.6e-11 |
| `P` (ev07) | 160656.854439 | 160656.854494 | 3.4e-10 |

`T_steam` is a direct dict lookup of a literal — no arithmetic can move it — so
the golden was recorded when something upstream differed, and the drift (at
most 3.4e-10 relative, against a 1e-4 tolerance) was never visible.  Both files
were last touched by `bac3fd7f2` (2026-09-05), which used `--record-append`:
that mode ADDS rows and never refreshes the ones already there.  **A partial
re-record leaves the rest of the file dated at some earlier engine, and nothing
says which rows are which.**  Recorded here rather than hidden in a diff, so
nobody reads those 19 rows as a consequence of the chest fix.

### 7.5  Five evaporator cases are invisible, not clean

`evaporator01`, `03`, `04`, `05` and `model1` are absent from
`check_energy_closure`'s ledgers, and it is tempting to read that as health.
It is not: their energy balance is **REFUSED** for want of an enthalpy datum
(`NaCl`, and the Portuguese-named `agua`/`solidos`), so there is no residual to
judge.  Two of them (`01`, `model1`) carried the identical undeclared chest.
Their goldens move by **zero rows**, measured — the fix is free there and makes
them correct for the day those data land.

---

## 8. What remains, and it is reserved

After the fix the five single-effect cases sit at **+17.6 … +18.4 kW** and
`evaporator02` at **+134.17 kW**.  That is **D2 + D3**: the unit prices its duty
on `Component::Hvap_latent` — the Watson correlation from the record's
`Tc`/`Tb`/`HvapTb` — while its streams are priced on `H_stream_formation`,
whose vapour−liquid gap is `∫cp_ig − ∫cp_liq` on the two formation data.  For
water at 401.6288 K:

```
Watson                 38 999.16 J/mol
H_stream_formation     40 287.47 J/mol      3.30 % apart
```

and part of that gap is water's liquid Cp being integrated **28.6 K past its
declared `Trange (273 373)`** — the run announces the extrapolation, and
declaring the chest correctly removes one instance of it (the `EXTRAPOLATIONS
AND VALIDITY` block drops from 4 entries to 3).

**This is RESERVED for Vítor.**  It is the two-enthalpy-surfaces family proper,
it is real physics work, and choosing which surface is right is not a decision
an assistant takes.

**No pin is removed by this commit except `phasechange01`'s**, which is removed
rather than re-measured because it closes exactly (§7.1); `designSpec01`'s is
re-measured downward (§7.3).  The band in
`check_energy_closure` is 1.0 kW and every one of the six evaporator cases is
still above it.  The debt shrank by a factor of **27** (6296.68 kW of the
6162.50 across ev02, and 96 % of each single-effect case) and remains a debt
with a name and a number.

---

## 9. Judgement calls, recorded so they are not re-opened

### 9.1  `category` on the chest steam — NOT taken, and why

Adding `category MP_steam_270kPa;` beside `phase gas;` was measured on
`evaporator06`.  It works, and it works well: `BalanceMath.H` then computes
`qBoundary = H(supply) − H(return) = 503.5933 kW`, the per-unit row gains a real
`energy_closure_pct` of 96.45, and the alarm **fires**:

```
ENERGY BALANCE FAILED -- unit 'evap'
 dH = 485.694246 kW vs declared items 503.593347 kW  (96.445723 % closure)
```

The `Evaporator` already propagates the tag to its condensate, so tagging the
supply tags **both ends** — the condition `BalanceMath.H` says in its own words
nothing in the corpus has ever satisfied (*"ten cases tag a supply, zero tag the
other end"*).  This is the diagnostic that would have caught the whole thing.

It is still not taken here, for three reasons, and the position was re-examined
after the rest was built rather than inherited:

1. **It answers a different question.**  `phase` is a fact about the stream's
   state and the first law is wrong without it.  `category` is a fact about the
   stream's *role* in a utility register — it changes which ledger the case
   sits in, what the Utility-consumption table prints, and what the costing
   pass can allocate.  Bundling a reporting-scope change into a physics fix
   makes the physics fix unreviewable.
2. **It moves the case between the gate's two ledgers.**  With a category,
   `globalExchanged` gains `|qBoundary|`, so `evaporator06`'s residual acquires
   a percentage (3.554 %) and leaves `KNOWN_OPEN_KW` for `KNOWN_OPEN`.  That is
   a real improvement and it is a separate, deliberate act.
3. **The word is not free.**  `MP_steam_270kPa` is not one of the ten names in
   `data/standards/utilities/` (`steamMP` is).  Choosing what a tutorial's chest
   steam is *called* is a curation decision with a catalogue behind it.

**Recommendation, stated so the next reader can act on it rather than
re-derive it:** tag the chest steam of every evaporator case, as its own slice,
using catalogue-resolvable names, and expect the six kW pins to become
percentage pins.  It is worth doing; it is not this commit.

### 9.2  Making `twoPhaseSplit` report a single-phase resolution — NOT taken

§7.1 shows the fallback is the carried `vf`, which is `0` by default, so **any**
undeclared superheated vapour anywhere in the corpus is priced as a liquid at
the boundary.  That is wider than the evaporators and the remedy is not obvious
(a converged single-phase answer genuinely is not a split, and the header says
so deliberately).  Changing it would re-price every undeclared stream in the
corpus at once.  Named here, measured on one case, not fixed.

### 9.3  Refusing a degenerate pure-component root — NOT taken

§4.  Same reason: the blast radius is the corpus, and the unit-level fix
(declare your outlets) removes every instance this family owns.

---

## 10. Gate

`bin/curate/check_evaporator_chest_phase.py`, wired into `bin/runTests`.  It
builds the offending case itself — a fixture, not a corpus case — and requires
the refusal to fire AND to name the remedy, because `RegistryRefusal.H` carries
41 sentences, not one of them fired by any gate or case, and the shipped cases
are now correct so no corpus run can reach this message again.

Seven sabotages, each applied, read back off disk, the engine rebuilt, the gate
run, then reverted with md5 checked.  **Two results did not match the
prediction, and they are the half worth reading:**

* **S3** (narrow the rule to the DECLARED field instead of resolving) is caught
  **structurally and not behaviourally**.  Arms (a), (c)'s refusal test and (d)
  all still pass, because the carried default is `0` in every fixture this gate
  can build.  What fires is the one-home arm (g) and (c)'s secondary test on the
  `origin` wording.  The arm that CAN separate the two rules by their answers
  lives on a column (`check_feed_thermal_state` arm (d)), and this gate says so
  in its own docstring rather than implying a discrimination it does not have.
* **S4** (unpin `cond` only) is caught by arm (e) *because it counts*.  Measured
  rather than asserted: arm (e) was temporarily rewritten as a presence test and
  S4 re-run against it — the gate exited **0** and printed no (e) line at all.
  Two correct sites answered for the third.

---

## 11. The recorded golden diff

Seven cases re-recorded, VALUES compared (whitespace and column width
excluded).  The 19 extra rows on `evaporator07` and `model2` are the stale
refresh of §7.4 and are not caused by this work.

| case | rows | values moved | which |
|---|---:|---:|---|
| `evaporator02_triple_effect_sugar` | 110 | 3 | `H_feeds_kW` −132109.319944 → −129312.881251 · `H_products_kW` −125946.817994 → −129447.055309 · `residual_kW` −6162.50194992 → **134.17405801** |
| `evaporator06_nacl_pitzer` | 44 | 2 | `H_feeds_kW` −11607.3310955 → −11103.7377485 · `residual_kW` −485.694245503 → **17.8991014921** |
| `model2_pitzer_evaporator` | 44 | 2 + 19 stale | same two as ev06, + §7.4 |
| `evaporator07_nacl_enrtl` | 43 | 2 + 19 stale | `H_feeds_kW` −11605.8481963 → −11102.2548493 · `residual_kW` −485.966424059 → **17.6269229367**, + §7.4 |
| `evaporator08_naoh_dilution_heat` | 44 | 2 | `H_feeds_kW` −13938.0949533 → −13098.7727083 · `residual_kW` −821.34620613 → **17.9760388627** |
| `evaporator09_nacl_sucrose_brine` | 44 | 2 | `H_feeds_kW` −12347.5644289 → −11843.9710819 · `residual_kW` −485.183190331 → **18.4101566647** |
| `phasechange01_partial_condenser` | 24 | 5 | `H_feeds_kW` 1229.90196807 → 2128.54189855 · `residual_kW` −898.639930477 → **0** · `Q_latent_kW` **+370.981855874 → −556.472786717** · `Q_sensible_kW` −1001.49072428 → −74.0360816882 · `vf_in` 0 → 1 |

**One row deserves a note, because a later reader will want to "fix" it.**
`phasechange01`'s golden now carries `boundary global residual_kW 0  1e-4`.  A
FRESH record would not write that row at all: `bin/runTests`' generator emits
a residual only when `|v| >= 1e-3` kW (the column13 nanowatt rule, one home).
It survives because `--record` refreshes the VALUE of a row the file already
carries rather than regenerating the file, and the row is there because the
case did not close until today.  Leave it: `within_tol` falls back to an
ABSOLUTE comparison when the reference is within 1e-9 of zero, so this row pins
the plant closed to within **0.1 W** — a strictly stronger claim than the
generator would have made, on a case whose whole point is now that it closes.

Not re-recorded, verified to move **zero** rows: `evaporator01_brine`,
`evaporator05_counter_current`, `model1_lumped_evaporator`.  Verified to pass
unchanged: all 21 `tutorials/steady/distillation/` cases (the §5.1 move),
`ChemicalPlantTutorial`, `sugarPlantEconomicsSweep`, `designSpec01`,
`evaporator03/04`, and 66 cases across the absorption, heat, power,
flowsheets, utilities, drying and crystallisation families.

Ledger (`check_energy_closure`, re-seeded over the full steady corpus, never
hand-edited): `phasechange01_partial_condenser` REMOVED from `KNOWN_OPEN`
(142.5260 %, now closes); `designSpec01_triple_equal_areas` 118.0420 % →
2.3240 %; the six evaporator entries in `KNOWN_OPEN_KW` re-measured as above.
`userOp01_yield_reactor` (−3.7126 kW) carried across unchanged — the gate's own
docstring says a standalone `--seed` cannot see a `code/` case and silently
omits it.

---

## 12. A note on `gate_manifest`, so the next reader does not misattribute it

`gate_manifest.py --check` was **already failing at HEAD**, for FOUR gates that
carried no manifest entry — `check_energy_closure`, `check_feed_thermal_state`,
`check_srk_h2n2_aad` and `check_utility_tag_symmetry`.  **None of them is this
slice's.**  Recorded because a red `--check` on this commit would otherwise read
as this commit's doing.

`generated/gateManifest.json` here goes 192 -> 197: FIVE entries added, none
removed, and **no existing entry changed** (diffed against HEAD rather than
assumed).  One is this slice's own gate.  The other four are the pre-existing
gaps, closed because `--check` gates the suite and a commit lands only on
FAIL 0 — and because the act is MECHANICAL rather than editorial: `--only`
DERIVES each claim by running the gate, so the entry asserts only "this gate
printed this sentence and exited 0".  Checked before doing it: none of the
three foreign gates reads `gui/`, where another general was working, so none
could capture a half-finished state.  If you would rather they travelled with
their own work, that split is one `git checkout` of this file away.

One thing measured rather than assumed while doing it: the merge reported the
gate ran in **0.2 s**, which looked like a cached claim rather than a real
observation.  It is real — timed directly at **240 ms**.  The fixtures are
one-unit cases and the two corpus witnesses are small.

---

## 13. What was NOT done

* No change to `Hvap_latent` or to any enthalpy surface (§8).
* No `category` (§9.1), no flash change (§9.2, §9.3).
* No change to the evaporator's duty model, its BPE route, or its
  `Q_required` — the residual those produce is §8's and is reserved.
