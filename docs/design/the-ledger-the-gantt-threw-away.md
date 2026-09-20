# The ledger the Gantt threw away

*2026-09-20.  A `gui/`-only slice: no engine change, no golden re-recorded,
no dict key added.*

## The rule

**A number the engine published for a reader to act on must be DRAWN, and a
number the engine REFUSED must look refused.**

`published ⇒ pinned` closed for the two batch campaign ledgers that morning
(`126165e29`, the `ledger` golden row kind).  `published ⇒ drawn` had not, and
this is it.

## What was measured

The task this began as was titled "the Gantt nobody built".  **That was
false.**  A Gantt exists and ships — `gui/src/ui/plotting/GanttPlot.tsx` +
`ganttLayout.ts`, the "Campaign sequence" item in `PlotsWorkspace.tsx`, fed by
`result.timeline`.  This slice EXTENDS it (`check_mass_closure`'s rule:
extended, not multiplied).

A second premise was dropped after measuring: **the timeline is not a parallel
second home.**  `src/applications/choupoBatch/main.cpp` builds it BY ITERATING
`transfers`, exactly as `SimulationResult.H:201` claims.  There was no arity
defect to fix.

**The real defect is that the projection throws the quantities away.**  On
`tutorials/batch/recipes/recipe04_charge_enthalpy`, reproduced:

```
ledger record:  { "tStart":100, "tEnd":100, "from":"hot", "to":"cold",
                  "kind":"discrete", "dn": { "ethanol": 0.0005 },
                  "H_kJ": -136.599454691 }
timeline entry: "detail": "TRANSFER 0.0005 kmol hot -> cold"
```

The per-component map is summed to a total and the 136.6 kJ that travelled
with it is gone.  The Gantt's hover showed that string.

**And the ENERGY ledger reached no drawing at all.**  `grep -rn
"transfers\|energyLedger" gui/src/` returned two unrelated hits.  Every
campaign's heat history — the segment, its kind, its basis, its service
temperature, its validity — was emitted and invisible.

### The whole batch corpus, swept

Every `tutorials/batch` case was run and its result JSON parsed (48 runs).

| | |
|---|---|
| cases publishing `energyLedger` | 28 |
| cases publishing `transfers` | 26 |
| **cases with an `energyLedger` and NO timeline** | **10** |
| energy records total | 51 |
| priced | 46 — of which **4 are EXACTLY 0** |
| **UNPRICEABLE** | **5** |
| zero-span (impulse) records | 2 |
| records carrying `T_service_K` | 49 — **including refused ones** |
| records with an empty `basis` | 0 |
| cases where NO energy scale exists | 4 |

## The absence contract, and why it is the honesty half

`src/result/ResultEmitter.cpp` (~898, ~921) writes `H_kJ` **only when**
`H_valid` and `E_kJ` **only when** `E_valid`.  **Neither boolean is emitted** —
measured on the JSON, not assumed; the brief this slice was written from named
`E_valid === false` as a field a reader could test, and there is no such field.
So on the reader's side **the number's PRESENCE is its validity**.

An absent number therefore means UNPRICEABLE, never zero — and the corpus
contains BOTH states at once, which is what makes the distinction
load-bearing rather than pedantic:

* `still06_ledger_mixed_validity` carries priced and refused records on one
  vessel, in both ledgers;
* `batch14_transport_only`, `batch16_ergun_profile`, `batch24_blowdown_inert`
  and `recipe01_react_then_distill` each publish a record whose `E_kJ` is
  **exactly 0** — a measurement;
* `batch03_consecutive` refuses **every** record it has.

`r.E_kJ ?? 0` draws all of those the same way.

## The encoding, with the arguments

**Colour = `kind`, from an OPEN palette.**  The canon in
`SimulationResult.H`'s comment — `reaction | sensible | latent | mixing |
impulse | externalH | shaftWork | heatLoss` — **is stale**, and nothing in the
engine or the GUI reads it.  Measured against the seven assignment sites
(`grep` on `src/unitOperations/batch/*.cpp`) and against the corpus:

* **four kinds the engine writes are ABSENT from the canon**: `reboiler` (11
  records), `condenser` (11), `adsorption` (9), `wallHeat` (1);
* **five of the canon's words appear NOWHERE**: `sensible`, `mixing`,
  `externalH`, `shaftWork`, `heatLoss`.

**The `transfers` canon is stale too**, which the brief had not measured: the
comment says `"discrete" | "continuous" | "external"`, and the corpus also
carries `feedAmendment` (34 records — the commonest of all) and
`externalIntake` (2).

So the palette is **not a copy of either list**.  It is keyed on the words the
writers assign, and an unknown kind gets a deterministic hashed colour and
appears in the legend under its own name.  **That is why this slice adds no
gate over the vocabulary: there is no closed list left to go stale.**  Fixing
the two comments is deliberately out of scope here — it is an `src/` edit, and
this slice makes none.

**Height ∝ |E_kJ|, and THE REFERENCE IS PRINTED.**  Normalised to the run's
own largest |E|, with the legend stating `full height = <max> kJ`.  A height
encoding whose reference is not printed is the 2026-09-08 rule — *the
numerical FLOOR is not a scale* — one drawing along.  Where there is **no**
scale the legend says WHICH of two states it is: `all refused`
(`batch03_consecutive`) or `every priced record is exactly zero` (the three
adsorber cases).  Both are 0/0 if divided, and both occur.

**Sign is DIRECTION.**  `E_kJ > 0` is heat ADDED to the vessel, so positive
draws up from the band baseline and negative down.  This teaches the sign
convention, which is the thing students get wrong.  Verified on the rendered
SVG: `batch01_first_order`'s single reaction record at −210.15 kJ draws
downward from the baseline at full half-band height.

**UNPRICEABLE is HATCHED at full band height, with NO direction.**  The
load-bearing rule.  A zero-height bar at the baseline is exactly what zero
looks like, and the engine declined to say which side of the baseline this
segment is on.  The fill is a PATTERN and not a colour on purpose: a reader
scanning the band sees a texture that is not a magnitude at all, where any
solid fill — however pale — would still be a height to compare.

**A priced EXACT ZERO is a zero-height tick on the baseline.**  The minimum
visible height is given to a tiny NON-ZERO record only.  Raising a measured
zero to it would make it look like a small duty — the `?? 0` fabrication
wearing the opposite sign.

**An IMPULSE is drawn at the minimum width and flagged.**  Two corpus records
have `tEnd === tStart` and real energy (65.5 and 67.4 kJ); a zero-width tile
is invisible.  It is widened to 3 px, dashed, and says *instantaneous* in its
hover — the engine itself excludes impulses from every peak KPI because they
have no modelled duration, so a tile wide enough to see must not also claim
an interval.

**A lane with no energy record gets no band AND no height.**  An empty band
reads as "no heat"; *this vessel ledgers no segment* is a different fact.  A
run with no energy ledger at all draws **byte-identically to before this
existed** — asserted in the tests against the formula the plot used, the same
posture the engine takes where a case declares no utility circuit.

**Why the height encoding was not refused outright.**  It could have been: a
bar height is a magnitude claim, and the ledger's numbers span four orders of
magnitude within one corpus.  It survives because the comparison it invites
is the one that is valid — *within one run, against a printed reference* —
and because the alternative (colour-only, or a list) throws away the one
thing a time-axis drawing is for: seeing at a glance where a campaign's heat
went.  The reference being PRINTED is what makes the claim checkable rather
than suggestive.

## What is NOT drawn

* **Two records refused over the same interval on the same lane draw one
  rectangle.**  `still06`'s potA is exactly that (reboiler and condenser, both
  unpriceable over [0, 200]): the second paints over the first, only its
  outline colour survives, and the `<title>` reaches the topmost.  Found by
  looking at the rendered drawing.  NOT fixed, because every fix costs the
  claim the form exists to make — nesting or splitting the rectangles gives a
  refusal a height, and a height is a magnitude.  The pop-out lists every
  record with its own reason, which is where a reader counts them.
* **No total, anywhere.**  Summing `dn` is the collapse being undone; summing
  `E_kJ` is the campaign balance, which is engine-owned and already drawn by
  `CampaignBalancePlot`.
* **The first-law Sankey / waterfall** (task #87) — a different drawing on a
  different ledger, RESERVED for Vítor.
* **`processMode`** or any new declared dict key.
* **Nothing is validated.**  This draws what the engine published; that the
  numbers are RIGHT is not a claim this slice makes or could make.

## The gate decision

**No new python gate.  The vitest tests are the instrument**, and
`bin/runTests --gui` runs them.  The argument:

1. Every claim here is a property of a **pure projection of a JSON block**,
   which vitest asserts directly.  A python gate reading TypeScript source for
   `?? 0` would be a grep-shaped proxy for a test that already exists.
2. The one claim that WOULD be structural — "every kind the engine writes has
   a colour" — was **designed out** rather than gated: the palette has an
   open fallback, so there is no closed list to go stale and nothing for a
   gate to check.  Removing the possibility of staleness beats gating it.
3. Extending `check_campaign_ledger_pinned` was considered and rejected on its
   own subject line: that gate's question is whether the ledgers are
   FALSIFIABLE by a golden, which is an engine-and-golden question.  Whether a
   browser draws them is not.

## Sabotages

All fired **by hand** and restored (sha256 compared; `ganttLayout.ts` is
byte-identical to its pre-sabotage state).  Predicted / happened:

| | sabotage | result |
|---|---|---|
| S1 | energy reader defaults a missing `E_kJ` to 0 | **9 tests RED** — as predicted |
| S2 | material reader defaults a missing `H_kJ` to 0 | 4 RED — as predicted |
| S3 | a priced EXACT ZERO raised to the minimum bar height | 2 RED — as predicted |
| S4 | a REFUSED record drawn as a zero-height baseline tick | 2 RED — as predicted |
| S5 | every lane given an energy band unconditionally | 4 RED — as predicted |
| S6 | a run with no scale given a silent scale of 1 kJ | 2 RED — as predicted |
| S7 | the legend prints nothing where there is no scale | 3 RED — as predicted |
| S8 | the reader collapses `dn` to a total (the original defect) | 4 RED — as predicted |
| S9 | the matcher picks ONE record where several match | 1 RED — as predicted |
| S10 | availability narrowed back to `hasTimeline` | **SURVIVED** — see below |
| S11 | an instantaneous impulse given zero width | 1 RED — as predicted |
| S12 | every unknown kind lumped into one constant grey | **SURVIVED** — see below |

**S10 SURVIVED, and it is the most valuable line here.**  The availability
widening is the single decision that makes ten corpus cases' energy history
reachable at all, and narrowing it back left **all 4053 tests green**.  It had
been written inline in a `useMemo` inside `PlotsWorkspace.tsx`, and **nothing
in this repository renders a React component** — there is no testing-library,
no jsdom harness.  A decision living where no test can reach it is a guard
nothing tests.  Fixed by extracting it to `campaignLedger.hasCampaignSequence`
— pure, and a fact about the ledgers, so it belongs there anyway — and
re-fired: 2 RED.

The same reasoning found a second one before it was sabotaged: the legend's
scale SENTENCE was being built inside the component, where nothing could
assert it, **and** the pop-out was building its own copy of the same claim —
two homes for "what full height meant".  It is now `energyScaleSentence`, one
home, tested, shared.

**S12 SURVIVED.**  The colour test asserted only that an unknown kind gets a
stable, well-formed colour; a constant `#888888` satisfies both, and two new
kinds in one band would have been one colour.  The arm now asserts what the
code can actually keep — that the fallback is **not a constant**, and that no
unknown kind borrows a known kind's colour — deliberately NOT that any two
differ, because a 6-colour ring hashed by name can collide.  Re-fired: 1 RED.

## Looking at it

`make wasm` cannot run in this environment (no emscripten), so the app has no
in-browser batch run to draw and the delivered page was **not** exercised.
Said plainly rather than reported as verified (the 2026-09-06 rule: a tool
that cannot look must refuse, not guess).

What WAS looked at: the component was rendered to static SVG with
`react-dom/server` from the **real result JSON of six corpus cases** and
screenshotted in a browser, and the rendered geometry was then checked
numerically against the ledger values rather than by eye —
`batch01`'s −210.15 kJ drawing downward at exactly half-band; `recipe02`'s
three reaction bars at 1.80 / 15.00 / 7.70 px against a 145.267 kJ reference
(0.12, 1.00, 0.5135 of half-band, exact); its two impulses 3 px wide, dashed,
drawn upward; `still06`'s four refusals at full 30 px height with the hatch
fill and their kind colour as outline; `batch14`'s priced zero as a
zero-height line ON the baseline.  The pop-out tables were rendered and read
the same way.

The pure module was also driven over **every** batch case's real output (48
runs, 51 energy and 69 material records): nothing threw, no tile had a
non-finite coordinate or a zero width, every refused record's hover said
UNPRICEABLE, and every run produced a non-empty scale sentence.
