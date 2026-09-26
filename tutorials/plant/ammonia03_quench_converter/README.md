# ammonia03_quench_converter — designing the converter, not just running it

The same synthesis loop as `ammonia02_full_plant` — 200 bar, makeup 1980 kmol/h
N₂ + 5940 kmol/h H₂ (exactly 3:1) + 80 kmol/h Ar, refrigerated separator at
250 K, 3 % purge, SRK fugacity with measured N₂–NH₃ and H₂–NH₃ Henry pairs —
with **one thing changed: the converter.**  ammonia02 has a single adiabatic
bed.  This case has **three adiabatic beds with cold-shot quench between
them**, which is what the BASF account of Haber–Bosch describes when it says
the reacting hot gas is cooled with a supply of cold gas *inside* the reactor.

Run it:

```
runCase tutorials/plant/ammonia03_quench_converter
```


## 1. Why a converter is quenched

Ammonia synthesis is **exothermic** *and* **reversible**, and those two facts
pull in opposite directions.

* Exothermic → an adiabatic bed **heats itself** as it converts.  Its state
  moves up a straight line in the (conversion, temperature) plane: every mole
  of NH₃ formed buys a fixed number of degrees.
* Reversible → the **equilibrium conversion falls** as the temperature rises.
  The target retreats as you chase it.

Between them there is a **locus of maximum rate**: at any conversion there is
one temperature where the forward and reverse rates are furthest apart, and
that temperature **descends** as conversion rises.  A single adiabatic bed
crosses that locus early and then spends the rest of itself on the wrong side
of it, running into a receding equilibrium.

A quench converter follows the locus instead — in a staircase.  Inside a bed
the gas climbs its adiabatic line; at the cold shot it drops **vertically**
(cold gas removes heat, and dilutes, but converts nothing).  **Up, down, up,
down, up.**  That zigzag is the whole design.

**The picture is Dyson and Simon's.**  The rate contours in the
conversion–temperature plane, the descending locus of maximum rate, and a
cold-shot trajectory drawn as a zigzag about it, are **Figure 2** of
D. C. Dyson and J. M. Simon, *A kinetic expression with diffusion correction
for ammonia synthesis on industrial catalyst*, **Ind. Eng. Chem. Fundam. 7
(1968) 605–610**.  This case executes that figure with equilibrium beds.
Their rate law is what would put the contours on it; see §6.


## 2. What the beds actually do

Measured, this run:

| | feed T | feed y(NH₃) | exit T | exit y(NH₃) | ΔT | gas through it | NH₃ made |
|---|---|---|---|---|---|---|---|
| **bed 1** | 683.15 K | 1.11 % | 841.28 K | 10.61 % | +158.1 K | 12 523 kmol/h | 1075.2 kmol/h |
| **bed 2** | 682.05 K | 7.12 % | 797.93 K | 14.77 % | +115.9 K | 18 109 kmol/h | 1207.7 kmol/h |
| **bed 3** | 680.61 K | 10.59 % | 777.51 K | 17.28 % | +96.9 K | 24 362 kmol/h | 1391.0 kmol/h |

Read it as the staircase:

* **The three inlets are the same temperature** (683.2 / 682.1 / 680.6 K —
  a spread of 2.54 K).  That is not an accident, it is the design rule of §3.
* **Each exit is cooler than the last.**  841 → 798 → 778 K.  Every bed ends
  on the equilibrium curve, and each one meets it further along and lower
  down.
* **Each bed makes MORE ammonia than the one before it**, while its
  temperature rise gets smaller.  Two things are happening at once: the later
  beds carry more gas (the cold shots join in), and they work against a
  **cooler, therefore richer, equilibrium.**
* **The cold shot dilutes as well as cools.**  Bed 1 leaves at 10.61 % NH₃ and
  bed 2 starts at 7.12 %.  A vertical drop on the temperature axis is also a
  step backwards on the conversion axis — you pay for the cooling with
  unconverted-looking gas.  That is the trade the split has to price.


## 3. The design variable is the split

`system/flowsheetDict`:

```
{ name quenchSplit;  type splitter;  in mixed;
  outputs ( toFEHE  quench1  quench2 );
  operation { fractions ( 0.47  0.25  0.28 ); } }
```

Three numbers.  **Choosing them is designing the reactor.**  Everything else in
the converter is a consequence.

**How they were chosen, and it is a constraint, not an optimum.**  With the
interchanger fixed at 375 m², the FEHE branch and the two cold shots trade
against each other in opposite directions:

* send **less** to the interchanger → a smaller stream through the same area →
  bed 1 enters **hotter**, and there is more cold gas left, so beds 2 and 3
  enter **colder**;
* send **more** → bed 1 enters **colder**, beds 2 and 3 **hotter**.

There is exactly one value where all three beds enter at the same temperature,
and at 47 % that temperature is **683 K — the light-off inlet ammonia02's own
converter already uses.**  Below it bed 2 and bed 3 go cold; above it bed 1
does.  So the split here is fixed by **light-off at every bed**, not by an
optimum, and §5 says why the model cannot supply an optimum.

The two cold shots are then sized by the heat each bed puts in.  Note that
**cold shot 2 is the larger (28 % against 25 %) even though bed 2's
temperature rise is the smaller** (116 K against 158 K): bed 2 is carrying
half again as much gas, so there is more heat to take out of it.


## 4. What it buys, against ammonia02

Identical feed, pressure, purge, separator and let-down.  Only the converter
and the interchanger sized for it differ.

| | ammonia02 — one bed | ammonia03 — three beds + quench |
|---|---|---|
| converter exit | **10.75 % NH₃ at 839.6 K** | **17.28 % NH₃ at 777.5 K** |
| per-pass N₂ conversion | 17.84 % | **28.80 %** |
| loop circulation | 40 545 kmol/h | 26 645 kmol/h |
| recycle | 32 545 kmol/h | 18 645 kmol/h (−42.7 %) |
| purge (3 % of recycle) | 1006 kmol/h | 577 kmol/h |
| H₂ lost in the purge | 724.8 kmol/h | 414.8 kmol/h |
| **product** | **3498.7 kmol/h** (60.7 t/h) | **3719.8 kmol/h** (64.6 t/h, **+6.3 %**) |
| interchanger | 1500 m², 117.2 MW | 375 m², 31.2 MW |
| cooling-water duty | 57.8 MW | 66.2 MW |

**The product gain is not simply the extra equilibrium conversion.**  It is
that a loop converting more per pass has to recirculate less; the purge is a
fixed *fraction* of the recycle, so a smaller recycle throws away less
hydrogen.  The converter design reaches the product through the purge.

Two costs, both stated rather than hidden:

* **8.4 MW more goes to the cooling water.**  The effluent leaves the
  interchanger at 632 K instead of 486 K, because the interchanger only has
  47 % of the feed to heat.  A real plant recovers that heat in a waste-heat
  boiler.  This case does not add one: that is a separate design act, and
  adding it would change two things at once.
* **The recycle compressor is now oversized.**  It still takes 4000 kW on a
  circulation 43 % smaller, so it discharges at 258 bar into a mixer that runs
  at 245 bar.  Left visible on purpose — a converter redesign propagates into
  the machines, and the run shows it.


## 5. What a BAD split costs — measured, same hardware

Same 375 m² interchanger, same everything; only the three fractions move.

| toFEHE / q1 / q2 | bed inlets (K) | bed exits (K) | converter exit | product kmol/h |
|---|---|---|---|---|
| **0.47 / 0.25 / 0.28** (this case) | 683 / 682 / 681 | 841 / 798 / 778 | 17.28 % | **3719.8** |
| 0.90 / 0.05 / 0.05 — barely any quench | **577** / 774 / 771 | 797 / 793 / 789 | 15.82 % | 3686.2 |
| 0.70 / 0.15 / 0.15 | **619** / 736 / 733 | 813 / 796 / 785 | 16.29 % | 3697.8 |
| 0.35 / 0.30 / 0.35 — over-quenched | 720 / **643** / **651** | 859 / 794 / 771 | 18.18 % | 3737.7 |
| 0.47 / **0.50 / 0.03** — all in one shot | 683 / **605** / 767 | 841 / 779 / 778 | 17.28 % | **3719.8** |

Three lessons, and the third is the most important one in this case.

1. **Too little quench wastes the beds** (row 2).  With 90 % of the gas going
   through the interchanger there is not enough area to heat it: bed 1 enters
   at **577 K**, cold enough that a real catalyst would barely be alive, and
   the two cold shots are then too small to move anything.  Beds 2 and 3 enter
   at 774 and 771 K — the gas never comes back down, and the converter behaves
   almost like one long bed.
2. **Over-quenching looks BETTER in this model and is worse in a reactor**
   (row 4).  Product rises to 3737.7 kmol/h, the best number in the table.
   But beds 2 and 3 now enter at **643 K and 651 K**, 30–40 K below the
   light-off this loop was designed around.  The model rewards it because an
   equilibrium bed does not care how fast it gets there.  A real bed does, and
   this one would not reach the equilibrium the model hands it.  **When a
   model's optimum sits outside the region the model is valid in, the answer
   is not the optimum — it is that you need a better model.**
3. **Where you inject is INVISIBLE here** (row 5).  Moving quench from
   25/28 to 50/3 drives bed 2's inlet down to 605 K — a completely different
   reactor — and the converter exit does not move **to five figures**.  That is
   exact, not a numerical accident: with the last bed at equilibrium, the exit
   is fixed by the total enthalpy entering the converter, and that depends only
   on how much gas bypassed the interchanger — not on how it was divided
   between the injection points.  The split that a real designer agonises over
   is the one thing this model cannot see.


## 6. What this model does NOT contain — read before quoting a number

Every bed here is a `gibbsReactor`.  It computes the **equilibrium** state, in
adiabatic mode, which is the same as saying **the bed is infinitely long**.
There is no rate law, no catalyst, no particle size, no approach to
equilibrium and no pressure drop anywhere in this case.  Consequently:

* **No bed can be sized.**  `system/postDict` declares all three anyway, with
  no design basis, so that the engine refuses them **by name on every run**:

  ```
  bed1  FAILED: Vessel: unit 'bed1' needs a design basis in designRules
        -- one of spaceVelocity [1/h], residenceTime [s], or volume [m^3]
  ^ 3 unit(s) could not be SIZED and are therefore absent from `sizings`
    (and so from costing): bed1 bed2 bed3
  ```

  An absence the engine states on every run is a fact; an absence recorded
  only in a comment is a sentence.  (Since 2026-09-26 a bed CAN be sized in
  this engine — `pfr` on `kinetics { type dysonSimon1968; }` with a
  DesignSpec on its approach-to-equilibrium KPI, see
  `tutorials/plant/ammoniaStaged04_kinetic` — but not THIS case's beds,
  which stay equilibrium beds by construction.)
* **This case publishes NO cost and NO appraisal.**  There is no `costing` and
  no `economics` block.  With the converter unsized, a capital total would omit
  the most expensive item in a 200-bar loop, and an NPV built on it would be a
  confident number about a plant with no reactor.  For the loop appraisal read
  ammonia02 — and read its converter's 80 m³ knowing it is an author-set
  volume, not a computed one.
* **The peak temperature is not improved.**  Bed 1 still reaches 841 K, within
  2 K of ammonia02's single bed.  Quench does not cool the first bed; it
  rescues the ones after it.  Lowering the peak means lowering bed 1's *inlet*,
  which trades against rate — a trade this model cannot price either.
* Fresh, clean, fully reduced catalyst is implied everywhere.  Nothing here
  models poisoning, ageing, or reduction.


## 7. Is three the right number of beds?

Measured.  Each row is the same loop with N beds, the interchanger and the
splits re-tuned so that every bed enters at roughly 683 K:

| beds | interchanger | total cold shot | converter exit | product kmol/h | gain over previous | recycle |
|---|---|---|---|---|---|---|
| 1 (= ammonia02) | 1500 m² | 0 % | 10.75 % @ 839.6 K | 3498.7 | — | 32 545 |
| 2 | 640 m² | 34 % | 14.95 % @ 796.3 K | 3663.2 | **+164.5** | 22 200 |
| **3 (this case)** | 375 m² | 53 % | 17.28 % @ 777.5 K | **3719.8** | **+56.6** | 18 645 |
| 4 | 285 m² | 64 % | 18.46 % @ 769.0 K | 3742.9 | **+23.1** | 17 194 |

Each bed buys roughly a third of what the one before it bought.  Three beds
capture **90.5 %** of everything four beds capture over a single bed; a fourth
buys 23 kmol/h, **+0.6 %**.  Whether that pays for a fourth bed, its shell and
its quench nozzle is an **economic** question, and this case deliberately
publishes no cost, so it does not pretend to answer it.  Three is where the
knee is, and it is where industrial quench converters sit.


## 8. Things to try

1. **Move one number.**  Change `0.47  0.25  0.28` and re-run.  Watch the three
   bed inlet temperatures in the log and the converter exit composition.  Try
   to beat 3719.8 kmol/h *without* letting any bed inlet fall below 683 K.
2. **Break the split deliberately** — `0.90 0.05 0.05` — and read what bed 1's
   inlet does.  Then ask why the case cannot tell you the bed is dead.
3. **Take the cold shot from the WRONG place.**  Move `quenchSplit` downstream
   of the interchanger (split `preheatedFeed` instead of `mixed`) and see what
   a hot "cold shot" is worth.
4. **Add a fourth bed.**  It is four lines: one more outlet on `quenchSplit`,
   one more `mixer`, one more `gibbsReactor`, and `hotEffluent` moves to the
   new last bed.  Nothing else in the case changes — which is the point of
   building a reactor out of units that already exist.
5. Then read §6 again, and notice that every one of these experiments is about
   a **temperature trajectory** the model cannot price the *rate* along.
