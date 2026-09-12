# The first law drawn as the equation — Q and W told apart

*2026-09-12.  Vítor designed the figure; this record is what building it
required, what it found, and what it deliberately did not do.*

---

## 1. The figure, as the architect specified it

Vítor's own words, and they are the specification:

> two columns.  On the left the inlet and outlet enthalpies — green positive,
> red negative; where the red subtracts from the green it is drawn as
> translucent red OVER the green, with a **white line at the transition
> marking the level**.  On the right the same construction for Q and W, in
> their own two colours, translucent on subtraction, white line at the final
> value.  **The right-hand line must land at the same level as the left:
> Ho − Hi = Q − W.**

The figure IS the first law.  A student reads the identity off the picture,
and reads its violation off the gap between the two white lines.

## 2. Why it could not be drawn

The engine published **one** number for the whole right-hand side:
`globalEnergyBoundary.Q_boundary_kW`, and its own comment in
`src/reporting/EnergyBalanceReport.cpp` has said since a turbine first
appeared there that *"a turbine's shaft work IS counted"* in it.  Heat and
shaft work arrived added together.

A GUI that separated them by summing per-unit KPIs itself would be exactly
the second home removed on 2026-09-05 — the one that showed the flagship
plant violating the first law by 372.5 kW where the engine's ledger closed it
at 34.4 kW.  *The engine decides, the GUI draws.*  So the split had to be
published, or the figure could not be honest.

**How badly the single total hides the physics, measured rather than argued:**

| case | `Q_boundary_kW` | `Q_heat_kW` | `W_shaft_kW` |
|---|---|---|---|
| `rankine02_water` | 2.1e-10 | **+8.839** | **−8.839** |
| `ammonia02_full_plant` | −9 633 | **−37 633** | **+28 000** |
| `combined02_brayton_rankine_shaft` | −242.6 | +407.4 | −650 |

`rankine02` is the argument in one row: the total says *nothing crosses this
boundary*, about a plant that takes 8.84 kW in as heat and puts 8.84 kW out
through a shaft.

## 3. What was built — the split is ADDITIVE and closes by construction

`Q_heat_kW` and `W_shaft_kW` are published **beside** `Q_boundary_kW`, which
keeps its meaning and its value **to the last bit**: no number recorded before
this slice moved, and 157 corpus goldens confirm it.

The decomposition closes *by construction*, not to within a tolerance.  The
report accumulates the **work** items at exactly the sites and under exactly
the conditions `globalQext` is accumulated, and **derives the heat by
subtraction**:

```cpp
const scalar Wshaft = globalWshaft;
const scalar Qheat  = Qext - Wshaft;      // one side stored, the other derived
```

That is the `phases {}` rule of 2026-07-30 — *splits close by SUBTRACTION,
one side stored and the other derived, so two roundings cannot drift apart.*
Two independently accumulated sums would agree only to ~1e-12, and
`Q_heat + W_shaft == Q_boundary` would become a tolerance rather than an
identity.  **Sabotage S2 measured the consequence**: a faithful parallel
accumulator passes every output arm of the gate, because the two sums agree
to well inside printing precision.  Only a *source* check can see it.

### The kind has ONE home, and there is no catch-all

`src/reporting/BalanceMath.H` carried a `std::set` of the nine energy-item KPI
names.  It is now a `std::map<std::string, EnergyItemKind>` — the same nine
names, each declaring `Heat` or `Work` — and `isEnergyItemKpi` reads its keys.
Membership and kind therefore cannot disagree, and **a KPI cannot become an
energy item without a human saying which side of the first law it is on**: the
map is the set, so there is no default bucket to absorb an unclassified name.
That is the reaction-`order` shape of 2026-08-05 (five readers, five defaults,
a silent zero) refused in advance.

`Heat` and `Work` are the whole vocabulary.  An item that is genuinely neither
is a decision for a maintainer, not a third bucket added quietly.

### Signs, stated once

Every energy item in this engine is positive when energy is **added to the
process streams**.  A turbine's `W_shaft_kW` is therefore negative, and the
textbook *W* (work done **by** the fluid) is `−W_shaft_kW`.  The ledger
carries one convention; a reader that wants the other negates.  The figure's
right-hand column is labelled `Q` and `−W` for exactly this reason, and the
hover says it.

## 4. Published implies pinned

The `boundary` golden kind already selects its ledger by its `name` column, so
it was **extended, not multiplied**: `boundary global W_shaft_kW`.

* The generator writes that row when `|W_shaft_kW| ≥ 1 W` — the **same floor,
  in the same one home**, as the `residual_kW` row, for the same reason:
  below it the split is not a fact about the plant.  **12 corpus cases** cross
  it.
* `Q_heat_kW` gets **no row of its own, deliberately**.  It is
  `Q_boundary_kW − W_shaft_kW`, and both of those are pinned, so a third row
  would be a third home for a number two already fix exactly — the arity sin,
  inside a golden.
* `check_energy_boundary_pinned` **ratchets**: a run publishing work above the
  floor and pinning no row FAILS, so a case that gains a compressor fails
  until its golden gains the row.

## 5. What the gate holds, and the blind spot it cannot close

Three new arms, on the gate that already held this ledger:

* **(c) the split sums back** to `Q_boundary_kW` on every published block.
* **(d) published is pinned**, ratcheting, for the work term.
* **(e) the classification is real**, on six named witnesses asserted as
  *shapes* and never as values: a work-only plant publishes
  `W == Q_boundary, Q_heat == 0`; a heat-only plant the mirror; a net-work
  producer publishes both, with heat **in** and work **out**.
* **(f) one home**, in source: the kind map is the only list, and the heat
  half must be *derived*.

**Arm (c) is structurally blind to a mis-attributed W, and always will be.**
Because the heat is derived by subtracting the work from the total, a wrong
work term is absorbed by the heat term and the sum closes either way.
Sabotage **S6 survived the gate** on exactly that: counting the `electricLoad`
generator's `W_shaft_kW` into the boundary sum nets the turbine's own work to
zero, and the sum still closed.  What caught it was the **golden** —
`combined02: boundary.global.W_shaft_kW: got 0 expected -650` — i.e. arm (d)'s
row doing its job one layer up.  `combined02` was then added as a witness
(it is the corpus's only plant carrying an `electricLoad`) so the gate catches
it too.  The record of that is the point: *the gate holds the structure, the
pinned row holds the attribution, and neither is redundant.*

Eight sabotages, each applied, read back off disk, rebuilt where C++ moved,
run and reverted; the table is in the gate's own docstring, S6's survival
included.

## 6. The figure

`gui/src/case/firstLaw.ts` is the geometry — pure, tested, no drawing.
`gui/src/ui/plotting/FirstLawPlot.tsx` draws it.  Both read only
`globalEnergyBoundary`; neither reaches for a stream or a KPI.

**It does not replace `EnergyBalancePlot`, and the reason is that they answer
different questions.**  That one is the boundary's *stream inventory* — what
each feed and product carries, with the engine's net Q as one more bar.  This
one is the *balance* — does the law hold, and by how much does it fail.  Both
are in the Plots nav, each hinting at the other.

### The one thing the specification could not settle, and how it was settled

Stream enthalpies are on the **elements datum**, so their absolute values are
set by the reference and not by the process — the engine says so itself.
Measured across the 153 corpus goldens that pin this ledger: **the median
|ΔH| is 1.3 % of the larger of |ΣH_in|, |ΣH_out|, and 90 of them are under
2 %.**  Drawn to the bars' own extent, the *level* — the whole point of the
figure — is a sliver on most cases.  On `pump01_water` it is 0.700 kW against
bars of 2864 kW.

So the y window is scaled to the **process** quantities (both levels, Q, W,
the residual) and the enthalpy bars are allowed to run out of it.  **Nothing
informative is lost**, and that is a property of Vítor's construction rather
than a hope: above the level a column is uniformly translucent-over-solid, so
the clipped part looks the same all the way up.  The two enthalpy terms are
stated as numbers in the caption regardless, with the datum named.

### Readable without colour

Green/red is the classic colour-vision trap and colour does not survive a
greyscale print (2026-09-07).  So every term carries its algebraic label and
its signed value as **text**, both levels are annotated with their value, and
the white level line is drawn over a dark halo — which keeps it visible on the
light chrome, the dark chrome and a monochrome printout alike.

## 7. The console line, folded into the same slice

`[report] globalEnergyBoundary -> …` printed the residual as a **percentage**
when a scale existed and in **kW** only when none did.  Measured: `column01`
printed `24.682 %` for 631.96 kW and `pump01` printed `65.000 %` for 1.3 kW —
**the line ranked the pump as nearly three times the worse offender while
being three orders of magnitude smaller.**

That is the 2026-09-08 rule — *the numerical floor is not a scale* — biting
from the other end.  **A ratio without its scale misleads exactly as badly as
a scale without its ratio.**  The line now carries the kW **always** and the
percentage **in addition** when the engine has a scale for one:

```
  [report] globalEnergyBoundary -> …  (residual 631.9561 kW; |in-out|/in = 24.682 %)
  [report] globalEnergyBoundary -> …  (residual -6162.5019 kW; NO EXCHANGED-ENERGY SCALE -- percentage unavailable)
```

Nothing new is derived — `residual` is the number that block already computes
and already writes to the CSV and the JSON.  The **no-scale form is
byte-identical** to what it was, so the reader that parses it sees no change
there; only the with-scale form gains the kW before the ratio it already had.
Every reader of that line was swept for first.

## 8. Not done, named

* **WASM is not rebuilt.**  The browser will not see `Q_heat_kW` /
  `W_shaft_kW` until `make wasm-gui` runs; the figure then draws one
  right-hand term and says the engine published only the sum, which is the
  correct behaviour for an old result but is not what this tree should serve.
* **No golden pins a `Q_heat_kW` row** — by design (§4), but it means a future
  engine that stopped deriving the heat and got the arithmetic wrong would be
  caught by the gate and not by any golden.
* **`W_hydraulic_kW` and `Q_removed_kW` are classified and published by
  nobody.**  They sit in the kind map and no unit in the tree emits them (the
  pump emits `W_hydraulic`, without the `_kW`).  Their kind is a contract
  awaiting a publisher, not a fact about any current run — said here rather
  than implied by their presence.
* **No witness covers a misclassified bare `Q_kW` on a heat-only plant**:
  sabotage S8 was caught by the mixed pair, because `column01`'s heat items
  are `Q_reboiler_kW` and `Q_condenser_kW`.
* **The per-unit first law is untouched.**  The figure is the PLANT boundary;
  the waterfall view that would teach *enthalpy is a property of streams, heat
  and work are transfers at units* still needs the per-unit ledger on the
  result (task #87, Vítor's).
* **Kinetic and potential energy** remain outside the engine's ledger and this
  figure says nothing about them either.
