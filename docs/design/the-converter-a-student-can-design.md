# The converter a student can design

*Record of the slice of 2026-09-21: `ammonia03_quench_converter`, and the Dyson
& Simon (1968) rate law as a cited object.*

---

## 1. What was asked, and what was measured first

BASF's account of Haber–Bosch says the reacting hot gas in the ammonia reactor
is cooled with a supply of cold gas.  That is **quench between catalyst beds,
inside the reactor**.  `tutorials/plant/ammonia02_full_plant` has ONE adiabatic
`gibbsReactor` and recovers its heat AFTERWARDS in a feed-effluent exchanger.
Different things — and the difference is the whole of converter design.

Everything else in ammonia02 matches: 200 bar, makeup 1980 kmol/h N₂ +
5940 kmol/h H₂ (exactly 3:1) + 80 kmol/h Ar, refrigerated separator, 3 % purge,
Henry-law dissolved gases with their cited pairs.  None of it moved.

---

## 2. Part A — the case, and it needed no engine code

`ammonia03_quench_converter` is three adiabatic `gibbsReactor` beds with a
`splitter` upstream of the interchanger and two `mixer`s between the beds.
Every unit already existed.

Measured, against ammonia02's single bed:

| | one bed | three beds + quench |
|---|---|---|
| converter exit | 10.75 % NH₃ at 839.6 K | 17.28 % NH₃ at 777.5 K |
| per-pass N₂ conversion | 17.84 % | 28.80 % |
| recycle | 32 545 kmol/h | 18 645 kmol/h |
| H₂ lost in the purge | 724.8 kmol/h | 414.8 kmol/h |
| product | 3498.7 kmol/h | 3719.8 kmol/h (+6.3 %) |

**The gain arrives through the purge, not through the equilibrium.**  A loop
that converts more per pass recirculates less, and the purge is a fixed
*fraction* of the recycle.

**The split is chosen by LIGHT-OFF, not by an optimum.**  47/25/28 is the one
value at which all three beds enter within 2.6 K of each other, at the 683 K
ammonia02's own converter already uses.  Below it beds 2 and 3 go cold; above
it bed 1 does.

### THE FINDING, and it is a property of the model

**With every bed at equilibrium, the converter exit depends only on HOW MUCH
gas bypassed the interchanger, never on WHERE the quench enters.**  Measured:
moving the quench from 25/28 to 50/3 drives bed 2's inlet from 682 K to 605 K
— a completely different reactor — and moves the exit **by nothing at five
figures**.  That is exact, not numerical: with the last bed at equilibrium the
outlet is fixed by the total enthalpy entering the converter.

And **the model rewards over-quenching**: 35/30/35 gives the best product in
the table (3737.7 kmol/h) while putting beds 2 and 3 forty kelvin below
light-off, where a real catalyst would not reach the equilibrium the model
hands it.  *When a model's optimum sits outside the region the model is valid
in, the answer is not the optimum.*

Both facts are one fact: **there is no rate law**, and that is what Part B is.

### The bed count was measured, not assumed

1 / 2 / 3 / 4 beds give 3498.7 / 3663.2 / 3719.8 / 3742.9 kmol/h.  Three
captures 90.5 % of what four buys over one.  A fourth is +0.6 % and its case is
economic — which this case deliberately cannot make.

### No cost, and the refusal is the mechanism

A bed's size is its catalyst volume; a catalyst volume is a kinetic result.
The three beds are declared in `system/postDict` **with no design basis**, so
the sizing pass refuses them by name on every run and the case carries no
`costing` and no `economics` block.  An absence the engine states on every run
is a fact; an absence in a comment is a sentence.

**ammonia02's own converter cost stands, and it rests on an author-set 80 m³.**
This case declines to divide that number by three, because no rule exists for
doing so.

---

## 3. Part B — the rate law as a cited object

`src/unitOperations/reactor/kinetics/AmmoniaSynthesisRate.{H,cpp}`: Dyson &
Simon, Ind. Eng. Chem. Fundam. 7 (1968) 605–610, Eqs 2, 6–8, 18, 19, 39 with
Table I, and 40.  Built the way this tree builds correlations — a declared
`validityWindow()`, a `citation()`, and `verify()` anchors — and **wired by a
bench** (`ammoniaRateBench`, witness
`tutorials/props/kinetics/ammoniaRate01_dyson_simon`), because an unwired
self-check is a no-silent-crutch violation.

**It is NOT a factory family.**  There is one ammonia rate law in this tree, and
a registry with one entry is a taxonomy with no second member.  When a second
arrives the three members are already the base class's interface.

**Nothing is wired into a reactor.**  The four reactors that read
`catalystLoading` still evaluate at bulk conditions and still announce η = 1;
that announcement's meaning is unchanged.

### The anchors say what KIND of claim they are

| anchor | kind | what it proves |
|---|---|---|
| forward/reverse = (Ka/Q)² | theory | Eq 19 and Eq 2 are the *same* equilibrium — an identity at every composition |
| V₃ = 0 at the Gillespie–Beattie equilibrium | theory | the same statement in the form a student needs |
| Ka(700 K) from Eq 2 | arithmetic | five coefficients typed correctly.  Nothing about ammonia |
| ξ(300 atm, 700 K, η = 0.2) from Eq 39 | arithmetic | seven more coefficients |
| ξ falls with pressure | theory | the ordering pore diffusion requires; the only check that reads all 21 of Table I's constants |

**None is `measured`, and the run says so.**  The data these equations were
fitted to are Nielsen, Kjær and Hansen's and are not in this tree.

### THE SYMBOL COLLISION, and it is the durable half

> Dyson & Simon write **ξ** for the EFFECTIVENESS FACTOR and **η** for the
> CONVERSION OF NITROGEN.  `CatalystPellet.H` — and most of the
> reaction-engineering literature — writes **η** for the EFFECTIVENESS FACTOR.

The same two letters, swapped.  A reader who carries η across from the reactor
side reads a conversion as an effectiveness factor and sizes a bed several-fold
wrong, silently.  The engine keeps the paper's letters (every number in it is
read off the paper's own equations) and says so at every surface that prints
either one.

### Every branch refuses or announces, and none defaults

* **No default particle size.**  Undeclared → refuses.  Below 6 mm → ξ = 1
  exactly, announced as **the authors' own position** and explicitly
  distinguished from the reactors' η = 1, which says the correction is
  *unpriced*.  Above 10 mm → refuses.
* **Pressure.**  Table I is three columns, not a function.  Between them,
  linear interpolation, **announced with both endpoints as Choupo's choice**.
  Outside 150–300 atm the rate (Eq 19) **announces** and Eq 39 **refuses** —
  the asymmetry is that one is a closed expression and the other is a table.
* **An unphysical ξ is announced and returned UNCLAMPED.**  At 900 K and 5 %
  conversion the cubic returns **−0.0942**.  Clamping would hide that the
  caller has walked off a table whose domain the paper never states.

### The locus, and what it is for

At 300 atm on the paper's reference mixture the temperature of greatest net
rate is **900 K (window edge) / 867 K / 794 K** at η = 0.05 / 0.15 / 0.25.
**It descends** — and that descent is the curve ammonia03 zigzags about.  Until
this slice nothing in Choupo could draw it.

### A cross-check nobody had made

Evaluated at ammonia03's own bed states, the rate falls **926-fold** from the
converter inlet (929.13 kmol/m³/h) to its exit (1.0031).  At bed 1's outlet —
which the flowsheet solved as an EQUILIBRIUM — the rate is **9.341, not zero**.
That is two independent equilibria disagreeing: solved out at 841.28 K and
200 bar from bed 1's own feed, Dyson & Simon give x(NH₃) = 0.106761 and
Choupo's SRK Gibbs minimisation 0.1060861 — **0.636 % apart, Choupo the more
conservative.**  It is the first independent check in this corpus of the
ammonia equilibrium every one of its plant cases rests on.

---

## 4. Traps paid for

* **A transcription is a second home.**  The witness declares three gases
  copied from ammonia03's converged answer, so `check_ammonia_rate` RUNS
  ammonia03 and holds them to it.
* **A sabotage that trips an anchor masks the arm behind it.**  S1 (a Table I
  sign flipped) was caught by the bench's own anchor throwing, so the
  independent recomputation never ran.  S1b then moved a coefficient **no
  anchor reads** — the 150 atm column — and **survived**, because the
  recomputation only covered the locus, which runs at exactly 300 atm.  The
  declared states sit at 200 bar and therefore read that column *through the
  interpolation rule*; recomputing them closed the hole and now prices the
  interpolation as well.
* **A route stored is not a route announced.**  The sub-6 mm ξ = 1 carried its
  attribution in a struct field nothing printed.  The gate found it.
* **A bracketed prefix is not a kind.**  The gate's first kind scan swept the
  whole log and reported `[unphysical]`, `[interpolated]` and `[unmarked]` as
  anchor kinds — making the gate's own claim line false.  It reads the
  self-check block only.

## 5. NOT done, named

* **No cost for any ammonia converter.**  It is in none of the eight
  Guthrie/Turton sets, and costing a fabricated heavy-wall shell needs a
  currency per kilogram nobody has supplied.  An invented correlation turns
  *uncosted* into *falsely costed*, which no reader and no gate can detect.
* **No bed.**  Nothing integrates an axial profile, and nothing here carries a
  pressure drop, a bulk density or a space velocity.  Wiring this rate into a
  reactor is new physics.
* **Chapman–Enskog-style diffusion**, Temkin–Pyzhev as a second member of the
  family, and any comparison against a measured ammonia rate — this tree holds
  none.
* **The recycle compressor is now oversized** for the smaller circulation
  (4000 kW discharging to 258 bar into a 245 bar mixer).  Left visible.
* **`CostingPass`'s INCOMPLETE label does not fire for units lost at the
  SIZING stage.**  `SizingPass` names them; the costing TOTALS line does not
  carry the label, because it is driven by costing failures alone.  Found here
  and not fixed — Part A was to add no engine code.
