# How a process design is staged

> **KIND: RESEARCH.  STATUS: EVIDENCE GATHERED, 2026-09-24.  NOT A DESIGN
> DECISION.**  Nothing here changes the engine, the corpus or any contract.
> It is the reference a staged green-ammonia sequence, and the EduTool that
> would teach it, can later be designed *from*.
>
> **Who asked, and what.**  Vítor Geraldes, who has never worked in process
> industry, asked how professional chemical engineers organise their
> simulations — in his own framing: *do they first do a Gibbs (equilibrium)
> reactor for a first analysis, and only in the final simulation put in a
> packed bed with kinetics?  Is that the only point at which the reactor is
> sized?  And at the end, in the utilities, are the heat exchangers designed
> in detail?*  He commissioned the work with an instruction on method —
> *"perde o tempo que for necessário a esclarecer tudo primeiro, vê até
> online como é feito"* — so this is sourced research, not recollection.
>
> **The evidence rule this document was written under.**  Every factual claim
> carries a source that was actually retrieved, with a URL, in §9.  Where a
> number could not be sourced it says **NOT SOURCED** and stops.  §8 is the
> list of those.  A visible gap is strictly better than an invisible
> falsehood.
>
> **No commercial process-simulation product is named anywhere below**, per
> the ruling in
> [`no-competitor-is-named-here.md`](no-competitor-is-named-here.md).  Where a
> source names one, it is paraphrased around.  Textbooks, standards bodies and
> catalysts *are* named, and should be.

---

## 0. How to read this, and what kind of document it is

Two warnings before the content.

**The primary standard in §1 is a paid document, and this is a partial
read.**  AACE International Recommended Practice 18R-97 is sold, not
published open.  What was retrieved is (i) the **complete text of the
February 2, 2005 revision**, hosted by a third party (AHE Inc.) but carrying
AACE's own copyright notice, acknowledgment list and page furniture, and
(ii) AACE's **own watermarked SAMPLE of the current August 7, 2020
revision**, which is truncated after §4 but contains Table 1 and the accuracy
discussion in full.  So §1's matrix is read from the standard itself, in two
revisions, not from a blog summary — but §§5–9 of the current revision were
not read and nothing is claimed about them.

**Practice is not uniform, and the axes of variation are named where they are
known.**  §2 in particular describes a family of stage-gate processes that
every large operator runs under its own names.  AACE 18R-97 says so itself:
*"each enterprise may have its own project and estimating processes and
terminology, and may classify estimates in particular ways"* (2005 rev.,
Purpose).  What is universal is the *shape*: definition matures, the estimate
narrows, and the model fidelity follows the definition rather than leading
it.

---

## 1. (a) The estimate classes — AACE 18R-97

### 1.1 What the standard is

*AACE International Recommended Practice No. 18R-97, "Cost Estimate
Classification System – As Applied in Engineering, Procurement, and
Construction for the Process Industries."*  It is an **addendum** to the
generic RP 17R-97; 17R-97 gives the industry-neutral matrix and 18R-97
specialises it.  Current revision **August 7, 2020**; the revision read in
full here is **February 2, 2005**.  The 2020 revision is placed in AACE's
Total Cost Management framework at *"7.3 – Cost Estimating and Budgeting."*

Its scope statement matters for how Choupo should use it: *"the term process
industries is assumed to include firms involved with the manufacturing and
production of chemicals, petrochemicals, and hydrocarbon processing.  The
common thread among these industries (for the purpose of estimate
classification) is their reliance on process flow diagrams (PFDs) and piping
and instrument diagrams (P&IDs) as primary scope defining documents."*  The
classification is anchored on **engineering deliverables**, which is exactly
why it can be mapped onto a simulation sequence at all.

### 1.2 The matrix

Table 1 of the **August 7, 2020** revision, transcribed verbatim:

| Estimate class | Maturity level of project definition deliverables (% of complete definition) | End usage (typical purpose) | Methodology (typical estimating method) | Expected accuracy range (typical variation in low and high ranges at an 80 % confidence interval) |
|---|---|---|---|---|
| Class 5 | 0 % to 2 % | Concept screening | Capacity factored, parametric models, judgment, or analogy | L: −20 % to −50 %<br>H: +30 % to +100 % |
| Class 4 | 1 % to 15 % | Study or feasibility | Equipment factored or parametric models | **L: −15 % to −30 %<br>H: +20 % to +50 %** |
| Class 3 | 10 % to 40 % | Budget authorization or control | Semi-detailed unit costs with assembly level line items | L: −10 % to −20 %<br>H: +10 % to +30 % |
| Class 2 | 30 % to 75 % | Control or bid/tender | Detailed unit cost with forced detailed take-off | L: −5 % to −15 %<br>H: +5 % to +20 % |
| Class 1 | 65 % to 100 % | Check estimate or bid/tender | Detailed unit cost with detailed take-off | L: −3 % to −10 %<br>H: +3 % to +15 % |

The **2005 revision's Figure 1** carries the identical five accuracy pairs
and identical Class 5/4/3 definition bands.  Two things moved between the
revisions and both are worth knowing:

* **Class 2 widened from "30 % to 70 %" to "30 % to 75 %", and Class 1 from
  "50 % to 100 %" to "65 % to 100 %."**
* **The confidence basis changed.**  2005: *"typical variation in low and
  high ranges after the application of contingency (determined at a 50 %
  level of confidence).  Typically, this results in a **90 % confidence**
  that the actual cost will fall within the bounds of the low and high
  ranges."*  2020: the column heading itself says *"at an **80 % confidence
  interval**"*, and the body says *"If contingency has been addressed
  appropriately approximately 80 % of projects should fall within the ranges
  shown."*  **The accuracy band is not a guarantee and its confidence level
  is itself a revisable convention.**

The 2005 revision also carries a **preparation-effort** column, dropped from
the 2020 sample's Table 1: relative to a least-cost index of 1 for Class 5,
Class 4 is 2–4, Class 3 is 3–10, Class 2 is 4–20, Class 1 is 5–100.  In
absolute terms for a US$20 000 000 plant: Class 5 *"as little as 1 hour or
less to perhaps more than 200 hours"*; Class 4 *"as little as 20 hours or
less to perhaps more than 300 hours"*; Class 3 *"150 hours or less to perhaps
more than 1 500 hours"*; Class 2 *"300 hours or less to perhaps more than
3 000"*; Class 1 *"as little as 600 hours or less, to perhaps more than
6 000."*

### 1.3 The range of ranges — how it is meant to be read

This is the question the commission asked specifically, and the 2020 revision
answers it in its own words.

**It is a RANGE OF RANGES, and the phrase is the standard's.**  2020
revision: *"it is for this reason that Table 1 provides ranges of accuracy
values.  This allows consideration of the specific circumstances inherent in
a project and an industry sector to provide realistic estimate class accuracy
range percentages."*  And, on the other side: *"this does not preclude a
specific actual project result from falling inside or outside of the
indicated range of ranges identified in Table 1."*

So a Class 4 estimate does **not** have "the accuracy −30/+50."  It has *an*
accuracy somewhere in **[−15, −30] on the low side and [+20, +50] on the
high**, and which point in that box it lands on is a property of **this**
project, not of the class.  The standard names the three drivers, in both
revisions: *"depending on the technological complexity of the project,
appropriate reference information, and the inclusion of an appropriate
contingency determination."*

Three further statements from the 2020 revision sharpen this and are the ones
that should reach a student:

1. **The bands overlap across classes.**  *"Figure 1 also illustrates that
   the estimating accuracy ranges overlap the estimate classes.  There are
   cases where a Class 5 estimate for a particular project may be as accurate
   as a Class 3 estimate for a different project.  For example, similar
   accuracy ranges may occur if the Class 5 estimate of one project that is
   based on a repeat project with good cost history and data and, whereas the
   Class 3 estimate for another is for a project involving new technology."*
   *(The grammar is the source's.)*
2. **The band is an output of risk analysis, not an input.**  *"While a
   target range may be expected for a particular estimate, the accuracy range
   should always be determined through risk analysis of the specific project
   and should never be pre-determined."*
3. **It can be much worse than the table.**  *"research indicates that for
   weak project systems, and/or complex or otherwise risky projects, the high
   ranges may be two to three times the high range indicated in Table 1."*

Point 2 is the uncomfortable one for any simulator that stamps a band from a
class number, Choupo included.  See §7.

### 1.4 Verifying Choupo's `AACE_class 4` / −30 % / +50 %

Measured in the tree, not recalled.  `src/postProcessing/EconomicsPass.cpp`
lines 774–775:

```cpp
const scalar acc_lo = (estimateClass <= 4) ? -30.0 : -15.0;
const scalar acc_hi = (estimateClass <= 4) ? +50.0 : +25.0;
```

with `estimateClass` defaulting to 4 (line 383, and `ResultRecords.H:428`),
and the pair reaching `reports/economics/cashFlow.csv` as a header comment
plus an `AACE_class` / `accuracyBand_pct` row pair.  Confirmed in a shipped
output — `tutorials/plant/greenAmmoniaIndustrialN2/reports/economics/cashFlow.csv`
line 2 reads `# AACE Class-4 estimate -- accuracy band -30% / +50%`.

**The verdict is: defensible as the pessimistic corner, wrong as "the Class 4
range", and dangerously close to a different class's number.**

* **Defensible reading.**  −30 % is exactly the low end of Class 4's low
  range [−15, −30], and +50 % is exactly the high end of its high range
  [+20, +50].  So the pair is the **worst corner of the Class 4 box** — a
  conservative choice a cost engineer would recognise, and arguably the right
  default for a teaching tool that must not flatter itself.
* **Wrong reading.**  18R-97 gives no single pair for any class.  Printing
  one pair as *the* band for Class 4 states something the standard declines
  to state, and hides the axis (complexity / reference data / contingency)
  along which it varies.
* **The trap.**  −30/+50 is *also* a number 18R-97 prints in two other
  places, both times against **Class 5**, not Class 4.  The 2005 revision's
  Figure 2a gives Class 5's *"ANSI Standard Reference Z94.2-1989 Name: Order
  of magnitude estimate (typically −30 % to +50 %)"*, and Figure 3a positions
  the ANSI Z94.0 *"Order of Magnitude Estimate −30/+50"* band against Class 5.
  Class 4's own ANSI equivalent is *"Budget estimate (typically −15 % to
  + 30 %)"*.  So a reader who knows the standard will read `Class 4` beside
  `−30/+50` as a mismatch, and be right to.

**A third arrangement already exists inside the tree and matches neither.**
`docs/design-heuristics.md` carries a hand-written AACE table putting
Class 5 at −30/+50 and Class 4 at −20/+30, with Class 3 at −15/+20, Class 2
at −10/+15 and Class 1 at −5/+10.  Against 18R-97 (either revision) all five
rows are wrong, and the Class 4 maturity band there ("1-15 %") is right while
Class 5's ("0-2 %") is right and Class 3's ("10-40 %") is right — so the
maturity column was copied correctly and the accuracy column was not.  That
is the arity sin in a doc: **the estimate-class table has two homes in this
repository and they disagree with each other and with the standard.**

---

## 2. (b) The project stages, and which model belongs to each

### 2.1 The two vocabularies, and how they line up

There are two overlapping naming systems and confusing them is the commonest
error.

* **FEL (Front-End Loading)** is the owner's **stage-gate governance**
  framework — FEL-1/2/3, sometimes with an FEL-0 and an FEL-4.
* **FEED (Front-End Engineering Design)**, also called **basic engineering**,
  is the **engineering activity** performed inside the last front-end stage.
  Steven King CEng MIChemE, writing in IChemE's *The Chemical Engineer*
  (27 March 2025), states the identity plainly: FEED is *"also called 'basic
  engineering' or 'FEL-3'."*

The Wikipedia article on front-end loading, which cites CII's Best Practices
Guide (2012) and the PDRI, lays out five phases — FEL 0 Conceptualization,
FEL 1 Feasibility Evaluation, FEL 2 Preliminary Design, FEL 3 Basic Design,
FEL 4 Project Execution — and identifies FEL 3 explicitly as *"FEED
(Front-End Engineering Design) or Basic Engineering."*  It gives the share of
total investment each phase consumes (FEL 0: 1–5 %; FEL 1: 5–15 %; FEL 2:
10–20 %; FEL 3: 15–30 %; FEL 4: 50–70 %+) but **does not give cost-estimate
accuracy ranges**, which is worth saying because several secondary sources
attach accuracy figures to FEL stages as though the FEL framework supplied
them.  It does not; AACE does.

### 2.2 The deliverable maturity matrix — the load-bearing evidence

This is the part of 18R-97 that answers "which model belongs to each stage",
because in the process industries the *estimate class is defined by which
drawings exist and how finished they are*.  Figure 4 of the 2005 revision,
transcribed.  The maturity letters are the standard's: blank = *"development
of the deliverable has not begun"*; **S** = Started, *"limited to sketches,
rough outlines, or similar levels of early completion"*; **P** =
Preliminary, *"work on the deliverable is advanced.  Interim, cross-functional
reviews have usually been conducted"*; **C** = Complete, *"reviewed and
approved as appropriate."*

| Engineering deliverable | Class 5 | Class 4 | Class 3 | Class 2 | Class 1 |
|---|---|---|---|---|---|
| Block Flow Diagrams | S/P | P/C | C | C | C |
| Plot Plans | — | S | P/C | C | C |
| Process Flow Diagrams (PFDs) | — | S/P | P/C | C | C |
| Utility Flow Diagrams (UFDs) | — | S/P | P/C | C | C |
| Piping & Instrument Diagrams (P&IDs) | — | S | P/C | C | C |
| **Heat & Material Balances** | — | **S** | **P/C** | **C** | **C** |
| Process Equipment List | — | S/P | P/C | C | C |
| Utility Equipment List | — | S/P | P/C | C | C |
| Electrical One-Line Drawings | — | S/P | P/C | C | C |
| **Specifications & Datasheets** | — | **S** | **P/C** | **C** | **C** |
| General Equipment Arrangement Drawings | — | S | P/C | C | C |
| Spare Parts Listings | — | — | S/P | P | C |
| Mechanical Discipline Drawings | — | — | S | P | P/C |
| Electrical Discipline Drawings | — | — | S | P | P/C |
| Instrumentation/Control System Discipline Drawings | — | — | S | P | P/C |
| Civil/Structural/Site Discipline Drawings | — | — | S | P | P/C |

**Read the Heat & Material Balances row and the Specifications & Datasheets
row together, because between them they answer the commission's second
question.**  At Class 5 *neither exists*.  At Class 4 both are merely
*Started*.  Only at Class 3 are they *Preliminary-to-Complete*.  So the
heat and material balance — which is what a process simulation *is* — and
the equipment datasheets mature **together**, one class at a time, and
neither is finished before the other.

The class descriptions say the same thing in prose.  Class 4: *"Typically,
engineering is from 1 % to 15 % complete, and would comprise at a minimum the
following: plant capacity, block schematics, indicated layout, process flow
diagrams (PFDs) for main process systems, and **preliminary engineered
process and utility equipment lists**."*  Class 3: *"process flow diagrams,
utility flow diagrams, preliminary piping and instrument diagrams, plot plan,
developed layout drawings, and **essentially complete engineered process and
utility equipment lists**."*  Class 2: *"process flow diagrams, utility flow
diagrams, piping and instrument diagrams, **heat and material balances**,
final plot plan, final layout drawings, complete engineered process and
utility equipment lists, single line diagrams for electrical, electrical
equipment and motor schedules, **vendor quotations**, detailed project
execution plans …"*

**Vendor quotations are named for the first time at Class 2.**  That is not
the same as "vendors first get involved at Class 2" — see §2.4.

### 2.3 What each stage decides, and at what simulation fidelity

Assembling the retrieved sources into one table.  The AACE column is the
standard's; the rest is attributed per row.

| Stage (common names) | AACE class | What the simulation is used to DECIDE | Fidelity actually used | Deliverables |
|---|---|---|---|---|
| Concept screening / appraisal / FEL-1 | 5 | Is there a process at all?  Which route?  Is it worth a study? | Block-level balances; yield/stoichiometric or equilibrium reactors; shortcut separations | Block flow diagrams (S/P) |
| Feasibility / pre-FEED / FEL-2 | 4 | Which of the shortlisted options; is it technically and economically feasible; is there a budget case | PFD-level flowsheet with recycles converged; equilibrium or approach-to-equilibrium reactors; shortcut or partly rigorous columns; assumed U on exchangers | PFDs (S/P), UFDs (S/P), preliminary equipment lists, first H&MB (S) |
| FEED / basic engineering / FEL-3 | 3 | Sanction.  What exactly is being bought, and at what cost | Rigorous, converged H&MB; rate-based or rigorous stage models; reactor on real kinetics where they exist; exchangers rated against geometry | Approved-for-design P&IDs, essentially complete equipment lists, equipment datasheets, hydraulics and line sizing, relief studies |
| Detailed design / EPC execution | 2 → 1 | Nothing about the process; how to build it | The simulation is now a *reference*, revalidated against vendor-selected equipment | Mechanical/electrical/civil drawings, vendor quotations, isometrics, construction packages |

Sources for the fidelity column, which is the column a textbook rarely states
outright:

* **Tom Baxter CEng FIChemE**, *The Chemical Engineer*, 29 August 2024, on
  the concept/select stage: *"A first pass at process and utility flow
  diagrams, a preliminary heat and mass balance, mechanical equipment list,
  and coarse layout will be undertaken."*  So at concept there is already a
  *mechanical equipment list* — a list, not a design.  And on the gating
  role of the balance: *"The heat and mass balance (H&MB) is a hugely
  important piece of work and many FEED activities cannot begin until there
  is an approved heat and mass balance."*
* **Steven King**, *The Chemical Engineer*, 27 March 2025, on FEED's
  deliverables, listed: comprehensive PFDs; a firm basis-of-design document;
  hydraulic studies and line sizing; preliminary pressure-relief studies;
  *"detailed simulations with heat and mass balances"*; *"approved for design
  piping and instrumentation diagrams (P&IDs)"*; equipment data sheets and
  specifications; refinement of the basis of safety; trip and alarm schedule;
  cause-and-effect matrix.  He gives FEED's cost estimate as *"a refined cost
  estimate, typically to within +/−10–20 % of the total project cost"* —
  note this is *narrower* than AACE's Class 3, and is one author's figure,
  not the standard's.
* **On reactor fidelity specifically**, the Northwestern University
  *processdesign* wiki (McCormick School of Engineering, senior design
  course resource) sets out the ladder: a **conversion** reaction operates
  *"on a stoichiometric basis"*; an **equilibrium** reaction *"require[s] the
  equilibrium constant (Keq) as input"*; a **kinetic** reaction needs
  *"reaction constants, k, activation energies, E, and the pre-exponential
  factors, A"* plus reaction order and is *"best simulated using a CSTR or a
  PFR"*; and the **Gibbs** reactor *"does not require a reaction set to be
  attached"* and is useful when *"the user does not possess any data
  pertinent to the reaction."*  Crucially it adds: *"at the very least, the
  Gibbs Reactor can provide simulation estimates as a starting point for a
  more rigorous simulation through another reactor type."*  **That sentence
  is the direct textual support for the practice Vítor guessed at.**

### 2.4 When equipment sizing first happens, and when it is firmed up

The answer is **not** "once, at the end."  Sizing happens **four times, at
increasing fidelity, and each time for a different purpose**:

1. **Concept (Class 5).**  Capacity-factored or parametric.  18R-97: Class 5
   methods are *"cost/capacity curves and factors, scale of operations
   factors, Lang factors, Hand factors, Chilton factors, Peters-Timmerhaus
   factors, Guthrie factors, and other parametric and modeling techniques."*
   **Note that no individual item is sized at all** — the whole plant is
   scaled from a reference plant.  Often *"little more than proposed plant
   type, location, and capacity are known."*
2. **Feasibility (Class 4).**  **This is where per-item sizing first
   appears.**  18R-97 Class 4 methods: *"equipment factors, Lang factors,
   Hand factors, Chilton factors, Peters-Timmerhaus factors, Guthrie factors,
   the Miller method, gross unit costs/ratios."*  An *equipment-factored*
   estimate requires a size per item, because the factor multiplies a
   purchased cost that a size produced.  Hence the deliverable *"preliminary
   engineered process and utility equipment lists"* at Class 4 and
   *Specifications & Datasheets: S*.  **This is the stage Choupo's
   `SizingPass` + `CostingPass` + `EconomicsPass` chain already serves.**
3. **FEED (Class 3).**  Sizes become *specifications*.  King's FEED list
   includes *"equipment data sheets and specifications."*  18R-97 Class 3
   requires *"essentially complete engineered process and utility equipment
   lists"* and moves Specifications & Datasheets to P/C.  Methods become
   *"semi-detailed unit costs with assembly level line items"* — deterministic
   rather than stochastic.
4. **Detailed design (Class 2–1).**  The size is now the **vendor's**, and
   the engineering contractor's job is to check it and integrate it.

**When vendor involvement starts.**  King: procurement *"begins during FEED
for 'long-lead items'"*, and in detailed design the designers work
*"iteratively with vendors."*  AACE names *"vendor quotations"* as a Class 2
input deliverable.  Reconciling the two: **vendors are engaged for long-lead
items during FEED (Class 3), but firm quotations underpinning the estimate
are a Class 2 fact.**  That is a genuine difference in what the two sources
are describing — engagement versus a priced deliverable — not a
contradiction.

**Varies by company, and here is the axis:** whether a Class 3 estimate is
the *last* estimate taken.  18R-97 says so directly: *"In many owner
organizations, a Class 3 estimate may be the last estimate required and could
well form the only basis for cost/schedule control."*  An owner-operator
doing a modest revamp may never produce Class 2; a lump-sum-turnkey EPC
contractor bidding a grassroots plant certainly will.

---

## 3. (c) Approach to equilibrium, and ammonia synthesis kinetics

### 3.1 The two definitions, and why they are not interchangeable

There are (at least) two quantities called "approach to equilibrium", and the
sources retrieved here use both.  **They answer different questions and are
not convertible without a model.**

**(i) The TEMPERATURE approach (ATE), the one field engineers mean.**
Johnson Matthey's *Guide to Approach-to-Equilibrium* defines it: *"Approach-
to-Equilibrium (ATE) indicates how close a reaction is to its equilibrium
position by measuring the distance between the equilibrium position (maximum
achievable conversion under a given set of conditions) and the achieved
conversion at the unit outlet conditions.  ATE is shown in temperature units,
with an ATE of zero indicating that the reaction is at equilibrium."*

The construction is: take the **actual outlet composition**; ask at what
temperature that composition *would be* the equilibrium composition; the
difference between that temperature and the actual outlet temperature is the
ATE.  JM's worked steam-reforming example: *"at the tube outlet temperature
of 808 °C the CH₄ slip is 4.60 mol%; however, that CH₄ slip corresponds to an
equilibrium temperature of 796 °C, hence the ATE = 12 °C."*

Two properties of the temperature approach that a student must carry:

* **It has a sign convention set by the reaction's thermodynamics, and it
  never crosses zero.**  JM: *"the reaction profile curve will never
  cross-over the equilibrium curve (meaning that the ATE will never be less
  than 0 °C)."*  For an endothermic reaction like steam reforming, the actual
  outlet is *short of* equilibrium, so the equivalent equilibrium temperature
  is *lower* than the real one.  For an **exothermic** reaction like ammonia
  synthesis the inequality runs the other way — conversion short of
  equilibrium corresponds to a *higher* equivalent equilibrium temperature —
  and this is why the engine's sign handling matters (§7).
* **It is a catalyst-ageing diagnostic as much as a design parameter.**  JM:
  *"In steam reforming catalysts ATE is normally close to, but rarely zero,
  at start-of-run, and it increases gradually as the catalyst ages."*  And
  *"the ATE in all shift converter types is expected to gradually increase as
  the catalyst deactivates."*  So an ATE declared in a design case is a
  **statement about end-of-run catalyst performance**, not a numerical
  convenience.

JM also warn that ATE inherits the measurement error of the outlet
temperature: *"the true tube outlet temperature is difficult to measure, this
value is normally inferred from the nearest thermocouple reading by assuming
a heat loss.  … If the assumed heat loss is too great, an artificially high
ATE will be reported, and vice versa."*

**(ii) The FRACTIONAL / extent approach.**  The actual conversion (or
product mole fraction) divided by the equilibrium value at the *same*
temperature and pressure.  Nadiri et al. (*ChemCatChem* 2024, e202400890,
doi:10.1002/cctc.202400890) use exactly this, under the name *efficiency*:
*"Efficiency is defined as the ratio of the mole fraction of ammonia at the
outlet to the maximum achievable mole fraction (at equilibrium) of
ammonia."*  In their laboratory data it ranges from near zero to *"An 80 %
efficiency is reached at approximately 723 K"*, and at 598 K it moves from
0.057 to 0.19 as the H₂:N₂ ratio falls from 3.8 to 0.93.

**Why they are not interchangeable.**  The temperature approach is a
*horizontal* distance on a conversion-versus-temperature plot; the fractional
approach is a *vertical* one.  Converting between them requires the slope of
the equilibrium curve at that point, which depends on ΔH_rxn, pressure and
composition.  For a strongly temperature-sensitive equilibrium a 10 K
approach is a small fractional shortfall; for a flat one it is a large one.
**A case that declares one must say which it declares.**

### 3.2 How the approach is used in early-stage design

The practice, assembled from the sources: at Class 5/4 the designer has no
kinetics and no catalyst volume, so the reactor is modelled as an equilibrium
or Gibbs unit and then **detuned** by an approach, so that the flowsheet
downstream sees a realistic outlet rather than a thermodynamic limit it will
never reach.  The approach is a **single number that stands in for the entire
kinetic model**, and it is chosen from experience, a licensor's guarantee, or
plant data.

Sourced anchor for the magnitude in the analogous reforming case: *"Large
scale industrial steam methane reformers have been designed to obtain an
approach to equilibrium of 5-20 °C at the outlet"* — this appeared as a
patent-literature statement in retrieved search results (US patent corpus,
via the `equilibrium temperature approach` search) and is **corroborated in
order of magnitude** by JM's independent 12 °C worked example.  Both are
steam reforming, not ammonia synthesis.

**For ammonia synthesis converters specifically: NOT SOURCED.**  See §8.
No retrievable open-literature source gave a typical design ATE, in kelvin,
for an ammonia synthesis converter bed outlet.  A search result reported a
patent describing *"an approach to equilibrium of 10 °C"* as *"a reasonable
approach obtainable in practice"*, but the document itself was not retrieved
and read, so that number is **not carried here as fact**.  One genuinely
relevant and retrievable number exists and is a different quantity: Yancy-
Caballero, Biegler and Guirardello, citing Elnashaie and Alhabdan (1989),
state *"the effectiveness factor for ammonia synthesis is between 0.3-0.5"* —
that is a pore-diffusion effectiveness, not an approach to equilibrium, and
conflating the two would be exactly the error §3.1 warns about.

### 3.3 Temkin–Pyzhev

**Primary citation.**  M. Temkin and V. Pyzhev, *Kinetics of ammonia
synthesis on promoted iron catalysts*, **Acta Physicochimica U.R.S.S. 12
(1940)**.  **The page range is contested across secondary citation databases**
— 327–356, 217–229 and 217–222 all appear in retrieved records, and a Bureau
of Mines abstract index gives a *different* primary, *Jour. Phys. Chem.
(U.S.S.R.) 13 (1939) 851–867*, with *Chem. Abs.* 34 (1940) 6512.  **The
original was not retrieved and the page range is NOT SOURCED**; the 1939
Russian-language paper and the 1940 Acta Physicochimica paper may be the same
work in two venues, but that was not established.

**The form.**  Written for the forward rate of NH₃ formation:

```
r = k₁ · p_N2 · ( p_H2³ / p_NH3² )^α   −   k₂ · ( p_NH3² / p_H2³ )^(1−α)
```

with **α = 0.5** for promoted iron in the original.  The retrieved index
entry states the forward half directly: *"The rate of formation of NH3 is
given by v=k1PN2 (P3H2/P2HN3)a with a=0.5."*  The α parameter is the
**fractional order that arises from the Temkin non-uniform-surface treatment
of nitrogen adsorption**, and is not a fitted exponent free to take any
value; Yancy-Caballero et al. note that in later work *"the empirical
parameter α usually takes values between 0.5 and 0.75 in literature (Dyson
and Simon, 1968)."*

### 3.4 Dyson & Simon (1968) — found, and already in the Choupo tree

**Citation.**  D. C. Dyson and J. M. Simon, *A kinetic expression with
diffusion correction for ammonia synthesis on industrial catalyst*, **Ind.
Eng. Chem. Fundam. 7 (1968) 605–610**, doi:10.1021/i160028a013.

**What it changes.**  Two things, and only the first is usually remembered:

1. **Activities replace partial pressures**, because an ammonia loop runs at
   ~300 atm where the gas is strongly non-ideal.  Yancy-Caballero et al.:
   *"a modified form of the Temkin equation based on fugacities was presented
   by Dyson and Simon (1968) in order to take into account the highly
   non-ideal behaviour of the system due to the temperature and pressure
   conditions typically used in the process (around 670 K and 300 atm)"*, and
   the consequence — *"Dyson and Simon used activity instead of partial
   pressure in the original Temkin rate expression, which led to the
   elimination of the dependency of rate constants on pressure."*
2. **A tabulated diffusion correction** — an effectiveness factor as a
   polynomial in temperature and nitrogen conversion, fitted per pressure
   level.

**The rate expression**, as printed by Yancy-Caballero et al. (their Eq. 5)
and independently by Nadiri et al. (their Eq. 16), in agreeing form:

```
R_NH3 = 2 k [ K_a² · a_N2 · ( a_H2³ / a_NH3² )^α  −  ( a_NH3² / a_H2³ )^(1−α) ]
```

with `a_i = y_i · φ_i · P`, `k` the **reverse** rate constant on an Arrhenius
form, and the equilibrium constant from the Gillespie–Beattie correlation
that Dyson & Simon adopt:

```
log₁₀ K_a = −2.691122·log₁₀T − 5.519265e-5·T + 1.848863e-5·T² + 2001.6/T + 2.6899
```

Yancy-Caballero et al. use **α = 0.5**, **k₀ = 8.849 × 10¹⁴** and an
activation energy of **170 560**, and the effectiveness factor as

```
η = b₀ + b₁T + b₂X_N2 + b₃T² + b₄X_N2² + b₅T³ + b₆X_N2³
```

*"with X_N2 the conversion based on nitrogen.  Constants b_i in this relation
were given by Dyson and Simon (1968) at different pressures."*

**A units defect in that source, reported rather than repeated.**  The paper
writes the activation energy as *"Ea = 170560 kJ·mol⁻¹"*.  That is off by a
factor of 1000 — 170 560 kJ/mol is not a chemical activation energy.  The
number is consistent with **170 560 J/mol ≈ 170.6 kJ/mol**, a plausible value
for this system, but *this document does not assert that reading as
established*; it records that the source's stated unit cannot be right, and
that the correct unit must be taken from Dyson & Simon's own paper, which was
not retrieved.  **The activation energy and pre-exponential are therefore
NOT SOURCED at the level of a usable number.**

**Choupo already carries this.**  `tutorials/props/kinetics/ammoniaRate01_dyson_simon`
implements the correlation as a verified object, citing *"Equations 2, 6–8,
18, 19, 39 with Table I, and 40"* of the paper, with a declared validity
window (150–300 atm; ξ tabulated at 150, 225 and 300 atm; 6–10 mm particles;
fitted on 3:1 H₂/N₂ with 12.7 % inerts) and five verification anchors, each
labelled `theory` or `arithmetic` and **none** labelled `measured`.  Its
README carries a warning that matters to anyone building the sequence:
**Dyson & Simon use ξ for the effectiveness factor and η for nitrogen
conversion, the opposite of `CatalystPellet.H` and of most textbooks.**  The
case's own note on provenance: *"Nothing in this case is measured by Choupo:
the data these equations were fitted to are Nielsen, Kjær and Hansen's
(J. Catalysis 3 (1964) 68)."*

### 3.5 Ruthenium catalysts — what could and could not be established

**Established.**  The Kellogg Advanced Ammonia Process (KAAP) uses a
**ruthenium catalyst, co-promoted, on a graphitic support**, developed by
Kellogg with BP.  Retrieved sources report activity *"as much as 20 times
greater than that of traditional ammonia catalysts"*, operation *"at
pressures down to 90 bar"*, and a **four-bed converter with iron in the first
three beds and ruthenium in the fourth** — a hybrid, not a wholesale
replacement.

**NOT ESTABLISHED.**  No rate expression, no α, no activation energy and no
pre-exponential for a ruthenium ammonia catalyst was retrieved.  Search
results named *Kowalczyk et al. (1996)* as the likely kinetics reference, but
that paper was not retrieved and nothing from it is reported here.  **The
hydrogen inhibition that distinguishes Ru kinetics from Fe kinetics is
mentioned in the literature at the level of search summaries only, and is not
carried here as a sourced claim.**

---

## 4. (d) Heat exchanger design: where it leaves the simulator

### 4.1 The division of labour

Three activities, usually three different people, often three different
organisations:

| Activity | Question answered | Who | When |
|---|---|---|---|
| **Process simulation** | What duty, between what temperatures, on what streams? | Process engineer, owner or FEED contractor | Class 5 → 3 |
| **Thermal / hydraulic design (rating)** | What geometry delivers that duty within the pressure drop, and what U does that geometry actually give? | Heat-transfer specialist, or the exchanger vendor | Late FEED → detailed design |
| **Mechanical design** | Will it hold pressure, and can it be built? | Pressure-vessel engineer / fabricator | Detailed design |

**The simulation's job is the duty and the temperatures, not the exchanger.**
At early stages it either (i) specifies a duty or an outlet temperature and
lets `A` follow from an assumed `U` and the LMTD, or (ii) specifies an
approach temperature and lets the duty follow.  The Northwestern
*processdesign* wiki states the design equation in the form the whole
practice rests on:

```
Q = U · A · F · ΔT_avg
```

where *"F = correction factor for deviation from cocurrent or countercurrent
flow"* and ΔT_avg is *"average temperature difference for true cocurrent or
countercurrent flow."*

### 4.2 When the assumed U is replaced by a calculated one, and what feeds back

**It is replaced when geometry exists** — that is, when someone has chosen a
shell type, a tube diameter, a length, a pass arrangement and a baffle
spacing, and can therefore compute a tube-side and a shell-side film
coefficient and add them in series with the wall and the fouling
resistances.  Before geometry, `U` is a lookup; after geometry, `U` is a
result.  This is why the transition falls at the **FEED/detailed-design
boundary** in §2.3's table and not earlier: FEED produces the datasheet that
fixes enough geometry for a rating.

**What feeds back into the simulation.**  Three things, in decreasing
frequency:

1. **The area, and therefore the cost.**  The commonest outcome is simply
   that the rating returns a larger area than the assumed-U estimate, and the
   capital number moves.
2. **The pressure drop.**  The rating returns a ΔP the flowsheet did not
   have.  On a recycle loop this changes compressor duty, which changes the
   flowsheet, which changes the duty — a genuine iteration.
3. **The achievable approach.**  If the rating cannot make the specified
   outlet temperature within an acceptable `F` (§4.3), the *specification*
   changes, and every downstream unit sees it.

**NOT SOURCED at the level of a quotable rule:** no retrieved source stated a
single rule for "at what stage does the assumed U get replaced."  The
staging above is inferred from the deliverable maturity matrix (§2.2 —
Specifications & Datasheets: S at Class 4, P/C at Class 3) plus King's FEED
deliverable list, and is presented as inference, not as a quoted practice.

### 4.3 The LMTD correction factor F, and the minimum approach

**F** corrects the counter-current LMTD for the fact that a multi-pass
exchanger is partly co-current.  As a temperature *cross* develops — the cold
outlet rising above the hot outlet — `F` falls, and it falls steeply.

**The design rule, from retrieved secondary sources (see §8 for the
caveat):** the *Heat Exchanger Design Handbook* is reported to advise a
**minimum F of 0.75**, and *Perry's Chemical Engineers' Handbook* is reported
to treat *"LMTD correction factors lower than 0.8"* as indicating inefficient
design.  The remedy when `F` falls below the limit is **not** to accept a
huge area but to **add shells in series** — retrieved sources give `F ≥ 0.75`
or `0.8` for E-shells and `F ≥ 0.9` for F-shells as the per-shell criterion,
the number of shells being chosen so each stays out of the steep region.
**These figures come from secondary engineering sources, not from the
handbooks themselves, which were not retrieved.**

Why the rule exists, and this part is not in dispute: near the steep region a
small error in an inlet temperature produces a large error in `A`, so a
design at `F = 0.7` is not merely expensive, it is **not robust** — the area
is a strong function of data the designer does not know precisely.

**The minimum approach temperature** is the other half of the same subject
and comes from a different discipline — **pinch analysis**, §5.  It is not an
exchanger property; it is a *network* decision that each exchanger then
inherits.

### 4.4 TEMA and ASME — who does what

**TEMA** (Tubular Exchanger Manufacturers Association) standards *"establish
a common set of rules for the design, fabrication, tolerances, testing,
installation, and maintenance of tubular exchangers"*, and are a
**supplement** to the pressure-vessel code rather than a replacement: they
add *"mechanical detail like tubesheet thickness, baffle spacing, tie-rod
arrangement, nozzle loads, corrosion allowances."*  TEMA recognises three
construction classes by service severity — **Class R** (refinery and
petroleum), **Class B** (chemical process), **Class C** (general commercial)
— with *"Class C … the least restrictive class, and Class R … the most
stringent."*  TEMA also supplies the three-letter shell/head/rear-end type
code that a datasheet uses to name a configuration (an "AES", a "BEM").

**ASME Boiler and Pressure Vessel Code, Section VIII** governs the
pressure-retaining **mechanical** design.  The usual division: the thermal
designer fixes geometry, the pressure-vessel engineer or the fabricator's
engineering department then does the Section VIII Division 1 calculation for
shell, channel, tubesheet, flanges and any expansion joint, to TEMA's
supplementary rules.  **In practice the mechanical design is very often the
vendor's**, delivered against a datasheet the process organisation wrote —
which is exactly why *"vendor quotations"* is an AACE Class 2 deliverable and
not a Class 3 one.

Towler & Sinnott's structure corroborates the split without needing to be
quoted: Chapter 12 is *Heat Transfer Equipment* (§12.3 Overall Heat Transfer
Coefficient, §12.4 Fouling Factors, §12.6 Mean Temperature Difference) and
Chapter 13 is a separate *Mechanical Design of Process Equipment* opening at
§13.2 *Pressure Vessel Codes and Standards*.

**Varies by company, on one clear axis:** whether the operator keeps an
in-house heat-transfer group.  Large refiners and licensors do and will rate
exchangers themselves before going to market; a smaller owner buys the
rating with the exchanger and receives it as a vendor deliverable.  Both are
normal.

---

## 5. (e) The ordering: pinch → utility selection → exchanger network → ISBL/OSBL

### 5.1 Where pinch sits: the onion

The canonical statement is the **onion diagram**, and Linnhoff March's
*Introduction to Pinch Technology* (© 1998) gives it in one paragraph:

> *"The design of a process starts with the reactors (in the 'core' of the
> onion).  Once feeds, products, recycle concentrations and flowrates are
> known, the separators (the second layer of the onion) can be designed.  The
> basic process heat and material balance is now in place, and the heat
> exchanger network (the third layer) can be designed.  The remaining heating
> and cooling duties are handled by the utility system (the fourth layer)."*

So the ordering is **reactor → separators → heat exchanger network →
utilities**, and it is a *dependency* ordering, not a fashion: each layer
needs the previous layer's answer as its input.  This is the same structure
Douglas formalised as five decision levels — input information and
batch-versus-continuous; input/output structure; recycle structure;
separation system; heat exchanger networks — in *A hierarchical decision
procedure for process synthesis*, **AIChE Journal 31(3) (1985) 353–362**,
doi:10.1002/aic.690310302.

**Relative to flowsheet convergence, pinch comes AFTER.**  Linnhoff March:
*"A Pinch Analysis starts with the heat and material balance for the
process."*  You cannot build a composite curve without knowing every
stream's CP and its start and target temperatures, and those are outputs of
a converged flowsheet.  **Relative to utility selection, pinch comes
BEFORE** — that is the whole point of the grand composite curve (§5.3).

**But the arrow also runs backwards, and this is the part students miss.**
Linnhoff March: *"Using Pinch Technology, it is possible to identify
appropriate changes in the core process conditions that can have an impact on
energy savings (onion layers one and two)."*  A pinch analysis can send you
back to change a reactor temperature or a column pressure.  The onion is a
*first-pass* ordering inside an iteration, not a one-way pipeline.

IPIECA (November 2022) states the project-timing consequence: *"Pinch
analysis is best performed during the early project design phase as
modifications to the heat exchanger network are most cost-effective then"*,
while remaining viable for brownfield retrofit at higher implementation cost.
Their reported prize: operational cost reduction of *"8 %–25 % of purchased
fuel for heating"* and GHG reduction *"up to 25 % of total refinery GHG
emissions"*, with a case-study result of 8 % total energy savings.

### 5.2 ΔT_min as an energy/capital trade-off, and how it is chosen

ΔT_min is the minimum temperature difference permitted anywhere in the
network.  **Reduce it and you recover more heat (lower utility bill) but need
more area (higher capital); raise it and the reverse.**  The optimum is where
the sum of annualised capital and annual energy is least.  Linnhoff March
call this *"an optimum DTmin for the network ahead of design"* — *ahead of
design* being the operative phrase: it is a **target**, set before any
exchanger is placed.

They are equally clear about what the targeting assumes, and it is a real
limitation: *"the capital cost targeting algorithm is based on the
simplifying assumption that any hot stream can match against any cold
stream.  It does not consider matching constraints between specific hot and
cold streams.  Therefore the capital cost targeting technique and DTmin
optimisation is particularly applicable for systems with fewer matching
constraints."*

**Typical values — Linnhoff March Table 2**, described as *"values based on
Linnhoff March's application experience"*:

| Industrial sector | Experience ΔT_min | Their stated reason |
|---|---|---|
| Oil refining | **20–40 °C** | *"Relatively low heat transfer coefficients, parallel composite curves in many applications, fouling of heat exchangers"* |
| Petrochemical | **10–20 °C** | *"Reboiling and condensing duties provide better heat transfer coefficients, low fouling"* |
| Chemical | **10–20 °C** | *"As for Petrochemicals"* |
| Low temperature processes | **3–5 °C** | *"Power requirement for refrigeration system is very expensive.  DTmin decreases with low refrigeration temperatures"* |

The Northwestern *processdesign* wiki, citing Towler & Sinnott (2013), gives
the wider textbook band: *"Typical choices for minimum approach temperatures
are between 5 °C and 30 °C."*

**The deep point in that table is that ΔT_min is a proxy for heat transfer
coefficient.**  Refining sits at 20–40 °C *because its U values are low and
it fouls*, not because refiners are less ambitious.  A student who reads
ΔT_min as a free knob has missed it.

**And it is not one number.**  Linnhoff March's Table 3 gives separate
process-to-utility approaches, *"experience based … useful in identifying
targets for appropriate utility loads at various utility levels"*:

| Match | ΔT_min | Their stated reason |
|---|---|---|
| Steam against process stream | **10–20 °C** | *"Good heat transfer coefficient for steam condensing or evaporation"* |
| Refrigeration against process stream | **3–5 °C** | *"Refrigeration is expensive"* |
| Flue gas against process stream | **40 °C** | *"Low heat transfer coefficient for flue gas"* |
| Flue gas against steam generation | **25–40 °C** | *"Good heat transfer coefficient for steam"* |
| Flue gas against air (e.g. air preheat) | **50 °C** | *"Air on both sides.  Depends on acid dew point temperature"* |
| Cooling water against process stream | **15–20 °C** | *"Depends on whether or not CW is competing against refrigeration.  Summer/Winter operations should be considered"* |

They say explicitly that the process–process and process–utility approaches
are different declarations: *"This approach temperature does not have to be
the same as the process DTmin and can be different for each utility."*
Choupo already makes exactly this separation — see §7.

### 5.3 The grand composite curve and utility LEVEL selection

**Why the composite curves are not enough.**  Linnhoff March: the composite
curves *"provide targets for the extreme utility levels"* only; as
intermediate levels are added *"the shape of the composite curves will change
with every new utility level addition and the overall construction becomes
quite complex for several utility levels.  The composite curves are therefore
a difficult tool for setting loads for the multiple utility levels."*

**What the GCC is.**  Shift every hot stream down by ½ΔT_min and every cold
stream up by ½ΔT_min, so the shifted composites touch at the pinch; the GCC
is then the *enthalpy difference between the shifted composites* plotted
against shifted temperature.  The construction *"automatically ensures that
there is at least DTmin temperature difference between the hot and cold
process streams."*  Utilities are shifted the same way — *"steam used at
200 °C will be shown at 190 °C if the DTmin is 20 °C"* — so that touching the
curve means meeting the approach.

**How levels are selected from it**, in their words:

> *"The target for MP steam is set by simply drawing a horizontal line at the
> MP steam temperature level starting from the vertical (shifted temperature)
> axis until it touches the grand composite curve.  The remaining heating
> duty is then satisfied by the HP steam.  This maximises the MP consumption
> prior to the use of the HP steam and therefore minimises the total utilities
> cost.  Similar construction is performed below the pinch to maximise the use
> of cooling water prior to the use of refrigeration."*

The point where a level touches is a **utility pinch**: *"A violation of a
utility pinch (cross utility pinch heat flow) results in shifting of heat
load from a cheaper utility level to a more expensive utility level"* —
distinct from a *process pinch* violation, which *"results in an overall heat
load penalty for the utilities."*  **Two different sins with two different
costs, and only the second wastes energy; the first wastes money.**

A furnace is handled differently because its supply is a sloping line, not a
horizontal one: *"The flue gas flowrate is set … by drawing a sloping line
starting from the MP steam temperature to theoretical flame temperature."*

Their summary: *"the grand composite curve is one of the basic tools used in
pinch analysis for selection of appropriate utility levels and for targeting
for a given set of multiple utility levels."*

### 5.4 Are utilities modelled as streams inside the simulation?

**Both, at different stages, and the change of treatment is itself a stage
marker.**

* **Early (Class 5/4).**  Utilities are *not* streams.  Each duty is a
  number, and the utility is a price per kW·h or per tonne of steam attached
  to that number after the fact.  This is what Choupo's `utilityAllocation`
  report does.
* **Through the pinch/HEN step.**  Utilities appear as **temperature levels
  with loads** — the GCC construction of §5.3 — still not as streams in the
  flowsheet.
* **Later (Class 3 and beyond).**  The utility system becomes its own model.
  Retrieved research literature on steam-utility-network modelling describes
  the practice: the steam system is modelled separately, and the coupling is
  that *"changes in steam consumption and production resulting from process
  HEN retrofits affect overall steam network balances,"* with the effect
  running through to *"generation of shaft power in turbines, and fuel
  consumption."*  The observation from the same literature is worth carrying:
  *"less emphasis is placed on quantifying the impact on fuel use and
  cogeneration within the broader utility system"* than on the process-side
  saving — a known gap in ordinary practice, not just in teaching.

The reason the site utility system is a *separate* model is structural: it
serves several process units at once, so it cannot sit inside any one of
their flowsheets.  Linnhoff March make this the fourth onion layer and note
*"The process utility system may be a part of a centralised site-wide utility
system."*

### 5.5 ISBL / OSBL / offsites

**Definitions.**  The battery limit is a boundary drawn around the process
equipment.  Ereev and Patel (*Journal of Business Chemistry* **9**(1), 2012,
pp. 30–, Utrecht University) put it: fixed-capital investment divides into
*"inside battery limits (ISBL or IBL) and outside battery limits or off-sites
(OSBL or OBL),"* with OSBL comprising *"expenses for land, yard improvements
such as fences or roads, various buildings and service facilities (e.g.
boilers, cooling towers, facilities for compressed air or steam generation).
The latter are commonly referred to as 'off-sites'."*

The Northwestern *processdesign* wiki, citing Towler & Sinnott (2013),
Peters et al. (2002) and Garrett (1989), gives the same split with the
working factors:

| Item | Rule of thumb, as stated |
|---|---|
| ISBL | *"the cost of procuring and installing all process equipment"* |
| OSBL | *"If not a lot of information ins available, a rule of thumb is to use 40 % of the ISBL costs as an estimate for OSBL"* *(sic)* |
| Engineering | from *"10 % of the ISBL"* to *"30 % of the ISBL and up to all of the OSBL,"* depending on company size and in-house capability |
| Contingency | *"An absolute minimum for contingency charges is 10 % of the ISBL and OSBL, with a more realistic value being closer to 40 %"* |
| Working capital | *"seven weeks of productions costs minus two weeks of feedstocks costs"* or *"10-20 % of annual operating costs"* |

**Why the split matters to the staging question, and it is not bookkeeping.**
**OSBL is where the utilities live.**  So the moment §5.3's grand composite
curve picks which steam levels the plant will have, it has sized a large part
of the OSBL — the boiler, the header pressures, the cooling tower duty, the
refrigeration package.  *Utility selection is an OSBL capital decision taken
with a process-side tool.*  That is the single most useful thing in this
section for a teaching sequence: it closes the loop from (e) back to (a).

**A caution on the 40 %.**  It is a rule of thumb for *"if not a lot of
information is available"* — an early-class device that a Class 3 estimate
replaces with a real offsites take-off.  A green-ammonia plant with its own
electrolysis and air separation is precisely the case where 40 % is likely to
be wrong, because the "utilities" are most of the plant.

---

## 6. The direct answer to the question as asked

Vítor asked three yes/no-shaped questions.  Here they are answered plainly,
with the corrections his framing needs.

### "Do they first do a Gibbs reactor, and only in the final simulation put in a packed bed with kinetics?"

**Broadly yes — but the reason is not the one the framing implies, and there
is a step in between that matters more than either end.**

*Yes*, in that the fidelity ladder is real and it is climbed in that
direction: stoichiometric/yield → equilibrium or Gibbs → equilibrium with an
approach → kinetic CSTR/PFR → heterogeneous packed bed with a pellet
effectiveness factor.  The Northwestern teaching wiki says it in as many
words: the Gibbs reactor is used when *"the user does not possess any data
pertinent to the reaction"* and *"at the very least … can provide simulation
estimates as a starting point for a more rigorous simulation through another
reactor type."*

*But the driver is data availability, not stage.*  A Gibbs reactor is used
early **because nobody has the kinetics yet** — they are the licensor's, or
they have not been measured. If a company owns the kinetics from day one (as
a licensor does for its own process), it may use the kinetic model from the
very first screening flowsheet.  **The ladder is climbed as information
arrives, and the project stages are just when information usually arrives.**

*And the missing middle step is the approach to equilibrium* (§3).  Real
practice does not jump from "equilibrium" to "packed bed"; it inserts an
**equilibrium reactor detuned by an approach** — a temperature approach, or a
fractional one — so that the flowsheet downstream sees a realistic outlet
long before anybody has a rate law.  That single number is how the early
flowsheet stays honest.  A Gibbs reactor run at true equilibrium gives a
conversion no real converter achieves, and every downstream unit is then
sized against a fiction.

### "Is that the only point at which the reactor is sized?"

**No.  This is the correction his framing most needs.**

The reactor gets a **volume** at least three times, and they are three
*different* numbers computed three *different* ways:

1. **Early (Class 5/4):** from a **space velocity** or a catalyst
   productivity taken from the literature, a licensor's leaflet, or a similar
   plant.  `V = V̇ / SV`.  No kinetics involved at all.  This is arithmetic on
   the flowsheet's own throughput, and it is enough to cost the vessel.
   *This is what Choupo's green ammonia plant does today — see §7.*
2. **FEED (Class 3):** from an **integrated rate law with an effectiveness
   factor**, giving a bed depth and a volume that satisfy a specified outlet.
   Now the approach-to-equilibrium of step (i) becomes a *prediction* rather
   than an assumption, and the two can be compared — which is the whole
   pedagogical payoff of building the sequence.
3. **Detailed design / vendor:** the **licensor or catalyst supplier**
   guarantees a charge volume and an activity, usually with a performance
   warranty, and the number in the datasheet becomes theirs.

So the kinetic model does not *first* size the reactor; it **checks and
refines a size that a space velocity already produced**, and it answers
questions the space velocity cannot — bed depth, pressure drop, hot-spot
temperature, the penalty for over-quenching, and what happens as the catalyst
ages.

### "At the end, in the utilities, are the heat exchangers designed in detail?"

**Half yes, and the half that is wrong is an ordering error worth naming.**

*Yes* that detailed thermal and mechanical exchanger design — TEMA geometry,
tube layout, rating against real film coefficients, ASME Section VIII wall
calculation — happens **late**, at the FEED/detailed-design boundary, and is
frequently the **vendor's** work against a datasheet the process organisation
wrote (§4).

*But the exchangers are not decided "in the utilities" and they are not
decided at the end.*  The onion has heat exchange as layer **three** and
utilities as layer **four** (§5.1), and that order is a dependency: **the
heat exchanger network is designed first, and what it cannot recover is what
the utility system is then sized to supply.**  Utilities are the *remainder*.
A design that picks its steam levels first and then tries to integrate has
inverted the problem and will buy utilities it did not need.

And the *decisive* exchanger decision — ΔT_min — is taken **before** any
exchanger is designed, *"ahead of design"* in Linnhoff March's phrase, as a
network target from an energy/capital trade-off.  Every individual
exchanger then inherits it.  **So the network decision is early and the
equipment decision is late, and both are called "heat exchanger design."**

---

## 7. What this means for Choupo

**Factual mapping only.  No proposal is made here.**  Everything below was
measured in the tree on 2026-09-24, not recalled.  Two facts supplied in the
commission were wrong and are corrected in place.

### 7.1 Path corrections

* **`src/postProcessing/pinch/` does not exist.**  The pinch pass is
  `src/postProcessing/PinchPass.{H,cpp}`, directly in `src/postProcessing/`
  beside `SizingPass`, `CostingPass` and `EconomicsPass`.  The only
  subdirectories there are `sizing/` and `costing/`.
* **`tutorials/plant/greenAmmoniaPlant` does not exist.**  The ammonia cases
  are `tutorials/plant/greenAmmoniaIndustrialN2` (the sectored plant, four
  sectors, three property packages), `tutorials/plant/ammonia02_full_plant`,
  `tutorials/plant/ammonia03_quench_converter`,
  `tutorials/steady/flowsheets/ammonia01_synthesis_loop`,
  `tutorials/steady/gibbs/gibbs10_ammonia_fugacity` and
  `tutorials/props/kinetics/ammoniaRate01_dyson_simon`.

### 7.2 Stages the engine can already serve

**Class 5 / concept.**  Partly.  `conversionReactor`, `equilibriumReactor`
(alias `REquil`) and `gibbsReactor` are all registered
(`src/unitOperations/UnitOperation.cpp:150-155`), and `shortcutColumn`
(`FUG`) serves shortcut separation.  What is absent is the *capacity-factored
whole-plant* estimate — the six-tenths rule applied to a plant, not an item —
which is Class 5's actual methodology and which `CostingPass` (per-item
Guthrie) does not do.

**Class 4 / feasibility.  This is Choupo's natural home, and the fit is
close.**  18R-97's Class 4 methodology is *"equipment factored or parametric
models"*, and its deliverables are PFDs (S/P), preliminary equipment lists,
H&MB (S), Specifications & Datasheets (S).  Choupo produces: a converged
flowsheet with a heat and material balance; a specification sheet per
equipment item at `design/<SECTOR>/<unit>/<equipmentTag>`; an
equipment-factored capital cost through `CostingPass`/Guthrie; and a DCF
appraisal through `EconomicsPass`.  **The Class-4 stamp on `cashFlow.csv` is
therefore the right class** — it is the band beside it that is the problem
(§1.4).

**Class 3 / FEED.**  Partly, and unevenly.  For *exchangers* the engine can
already do Class 3 work (§7.4).  For *reactors* it cannot (§7.3).

**Class 2 / Class 1.**  No.  Nothing in the engine reads a vendor quotation,
and nothing should.

### 7.3 The reactor: what exists and what the gap is

| Capability | Status in the tree |
|---|---|
| Equilibrium / Gibbs reactor | **Yes.**  `gibbsReactor`, `equilibriumReactor` |
| **Temperature approach to equilibrium** | **Yes, on `gibbsReactor` only.**  It reads `operation.temperatureApproach` (`GibbsReactor.cpp`, the `[gibbs] temperatureApproach` announcement), announces it, and publishes `kpis_["temperatureApproach_K"]`.  `equilibriumReactor` reads NO approach key (this row used to say it read `operation.approachTemperature` at `EquilibriumReactor.cpp:65`; that file reads no such key -- corrected 2026-09-26).  `gibbsReactor`'s own second key, `approachTemperature`, was retired the same day and is refused by name |
| Fractional / extent approach | **No.**  Neither reactor exposes the §3.1(ii) definition |
| Kinetic PFR | **Yes.**  `pfr`, with multi-reaction support, non-isothermal operation, hot-spot tracking (`T_max`, `hotSpot_dT`) — and, since 2026-09-26, a GAS-phase bed on a cited rate law: `kinetics { type dysonSimon1968; }` (stage D, `tutorials/plant/ammoniaStaged04_kinetic`) |
| `catalystLoading` | **Yes**, on `cstr`, `pfr`, `batchReactor`, `dynamicCSTR` — a kg-catalyst-per-m³ unit conversion |
| Pellet effectiveness factor η | **No — announced as absent.**  `CatalystPellet.{H,cpp}` announces that η is being taken as 1 and judges nothing (CLAUDE.md §6, 2026-08-18).  It does not multiply the rate |
| **Reactor volume as an ENGINE OUTPUT** | **Yes, by a DesignSpec (2026-09-26).**  `pfr` is a rating model (`V_R` is what it is given), so the engine-computed volume is the outer driver's answer: stage D varies `$V_bed` until the bed's own `approach_K` KPI hits the per-bed 5 K of US 5,352,428 — 6.9898 m³ on the loop of stages A–C, beside stage C's 18.6290 m³ space-velocity vessel.  `gibbsReactor` still publishes no volume at all (verified: no `V` key among its 20 KPIs), which is right: an equilibrium reactor has no length scale |
| **A reactor SIZER** | **No.**  `EquipmentSize::registerBuiltins` registers exactly nine sizers — `stirredTank`, `shellTubeHX`, `evaporator`, `crystalliser`, `sprayDryer`, `cyclone`, `compressor`, `vessel`, `distillationColumn`.  No reactor of any kind |
| Dyson & Simon correlation | **Yes**, as a verified correlation object with citation, validity window and five labelled anchors — in the **props bench** AND, since 2026-09-26, wired into `pfr` (`kinetics { type dysonSimon1968; }`; the pellet correction of Eq 39 is a declared route, `effectivenessFactor intrinsic | dysonSimonEq39`, with no default) |

**The gap named below WAS exactly §6's step (2), and stage D closes it on
the staged loop (2026-09-26; the flagship itself is unchanged and still sizes
its converter the way this paragraph describes).**  Measured on the flagship: the green
ammonia plant's converter is sized as a **`vessel`** with a hand-declared
volume, in `tutorials/plant/greenAmmoniaIndustrialN2/system/postDict`:

```
{ unitName LOOP.Converter;  type vessel;  material SS316;
  designRules { volume 28.0;  L_over_D 6.0;  pressureDesign 240.0;
                corrosionAllow 0.004;  jointEfficiency 1.0; } }
```

with the case's own comment stating the provenance: *"28 m3 of catalyst plus
internals, from a space velocity of ~20000 Nm3/m3/h at this flow."*  **That
is step (1) of §6's three-step answer, done by hand, outside the engine, and
the engine cannot presently check it** — which is precisely the pedagogy the
staged sequence would supply.

`tutorials/plant/ammonia03_quench_converter` already names this gap in its
own README, quoted in the Dyson-Simon case: it *"cannot size a bed, it cannot
tell a good injection point from a bad one, and it rewards over-quenching
into a region where a real catalyst is too slow to reach the equilibrium the
model hands it."*

### 7.4 Heat exchangers: the engine already has both fidelities, in two homes

**This is the most useful thing measured here, and it is a finding.**

`src/unitOperations/heatTransfer/HeatExchanger.cpp` has **two modes**:

* **Lumped mode** (line 609-611): reads `operation.area` and `operation.U`.
  The assumed-U posture of §4.1.
* **Geometry mode** (lines 227-479): reads `tubeID`, `tubeOD`, `tubeLength`,
  `nTubes`, `passes`, `shellID`, `baffleSpacing`, `tubePitch` and a wall
  conductivity (`wallK`, or resolved from `wallMaterial` through
  `MaterialRegistry`), applies Gnielinski on the tube side and Kern on the
  shell side by default, and **computes** `U = 1.0 / Rsum` (line 479).
  The calculated-U posture of §4.2.

The multi-pass penalty that §4.3 calls `F` is present, though not as an
explicit `F`: for `tubePasses >= 2` the unit switches to the 1-shell-pass /
2N-tube-pass ε-NTU relation, with the source comment naming the equivalence —
*"one tube pass runs co-current (the built-in LMTD F-correction, F<1), which
is exactly why a multi-pass exchanger needs more area for the same duty."*
**There is no `F ≥ 0.75` guard and no shells-in-series rule anywhere in the
tree** — searched across `src/`: no `Fcorr` or `correctionFactor` identifier
exists anywhere, and the only `Ft` symbols are unrelated local residual
vectors in `membrane/transport/SDEM.cpp` and
`membrane/massTransfer/Polarisation.cpp`.

**But the SIZER does not use the unit's answer.**
`src/postProcessing/sizing/ShellTubeHX.cpp` lines 62-69 reads `U` and `LMTD`
from the author's `designRules` block and computes `A = Q/(U·LMTD)`, with
`basis "A = Q/(U*LMTD) with U and LMTD author-set"`.  Verified in the
flagship's `postDict`: `designRules { U 550.0; LMTD 150.0; pressureDesign
240.0; }` on `LOOP.FEHE`.  **So the same plant can have a unit that computes
U from geometry and a sizer that costs it on a declared U, and nothing
compares the two.**  That is the §4.2 feedback loop, present in both halves
and not connected.

### 7.5 Pinch and utilities: what exists

`src/postProcessing/PinchPass.{H,cpp}`, declared `pinchPass { dTmin 10 K; }`:

* **Phase P1 (targets)** — the Linnhoff-Flower problem table printed cascade
  by cascade, `pinch.Q_H_min_kW`, `pinch.Q_C_min_kW`, `pinch.T_pinch_K`, and
  `reports/pinch/compositeCurves.csv` carrying hot / cold / hotShifted /
  coldShifted polylines.
* **Phase P2 (analysis)** — the candidate-match table
  `reports/pinch/candidateMatches.csv` with the CP rule binding at the pinch,
  plus the coursework violation diagnostics (heater below pinch, cooler above
  pinch).
* **Phase P3 (area/cost targets) is UNAUTHORISED** and not built.  So the
  **ΔT_min optimisation of §5.2 — the energy/capital trade-off that actually
  chooses the number — does not exist in the engine.**  `dTmin` is declared,
  never optimised.
* **The grand composite curve is NOT built.**  `compositeCurves.csv` carries
  the composites and their shifted forms, which is the *input* to the GCC
  construction, but the GCC itself (the enthalpy difference between the
  shifted composites, plotted against shifted temperature) is not computed
  and no utility level is selected from one.  **So §5.3 — utility *level*
  selection — is exactly the capability the engine does not have.**

**On the two ΔT_min declarations, the engine is already right and it is
worth recording.**  `PinchPass.H` states: *"`dTmin` here is the
PROCESS-process approach of the targeting exercise, declared in this pass's
own block.  The `utilityAllocation` report's `dTmin` is the duty-to-UTILITY
approach, declared in that report's block; the two are separate declarations
because they are separate physical approaches (same 10 K default)."*  That is
precisely Linnhoff March's distinction (§5.2): *"This approach temperature
does not have to be the same as the process DTmin and can be different for
each utility."*  **Choupo separated them for its own reasons and landed on
the industry's rule.**  What it does not yet have is *per-utility* approaches
— Linnhoff March's Table 3 gives six different values, and
`UtilityAllocationReport.cpp:452` reads one scalar.

**Utility allocation** exists: `UtilityAllocationReport` +
`UtilityCatalogue::pickForDuty(heating, T, dTmin)`, over a catalogue of ten
media (`steamLP/MP/HP`, `coolingWater`, `chilledWater`, `dowthermA`,
`hitecSalt`, `refrigerationNH3`, `refrigerationPG`, `electricity`).  This is
the §5.4 *early* treatment — utilities as prices on duties — and it is the
right one for Class 4.  Choupo also has the 2026-09-08 `utilities ( ... )`
declaration in `flowsheetDict` for auxiliary circuits carried as real
streams, which is the *later* treatment.  **Both §5.4 postures exist; what
does not exist is any statement of which stage each belongs to.**

### 7.6 ISBL / OSBL

**Not represented.**  `EconomicsPass` and `CostingPass` were searched: there
is no ISBL/OSBL split, no offsites factor and no battery-limit concept
anywhere in `src/` at all — `grep -i "isbl\|osbl\|battery limit\|offsite"`
over the whole source tree returns nothing.  The capital number is an
accumulation of per-item `bareModuleCost` and `totalModuleCost` over the
units the author listed in `sizing { units (...) }` (`CostingPass.cpp:126,
158-159`) — i.e. **pure ISBL, with no OSBL added and nothing saying so.**
Against the
§5.5 rule of thumb (OSBL ≈ 40 % of ISBL for an early estimate) that is a
systematic understatement of fixed capital by roughly a factor of 1.4 before
engineering and contingency, on every costed case in the corpus.  *Whether
that matters is a decision, not a finding; the finding is that the split does
not exist.*

The 2026-09-04 sector hierarchy (`FlatUnit::sector` stamped at the flatten
seam, carried into `EquipmentSizing` and `CostBreakdown`, with per-sector
capital subtotals) is structurally the nearest thing in the tree to a
battery-limit partition — but a sector is a *geographical* level of the
plant, not a capital-accounting boundary, and nothing maps one onto the
other.

### 7.7 The estimate-class table's two homes

Recorded plainly because it is the arity sin in doc form (§1.4): the AACE
class/accuracy mapping exists **twice** in this repository — hard-coded at
`EconomicsPass.cpp:774-775` (Class ≤ 4 → −30/+50) and hand-written as a table
in `docs/design-heuristics.md` (Class 5 → −30/+50, Class 4 → −20/+30) — and
the two disagree with each other, and both disagree with 18R-97.  There is no
gate over either.

---

## 8. Not sourced

Every claim that could not be established, listed rather than smoothed over.

1. **A typical approach-to-equilibrium value, in kelvin, for an AMMONIA
   SYNTHESIS converter bed outlet.**  Not found in any retrievable open
   source.  A search snippet reported a patent calling *"an approach to
   equilibrium of 10 °C … a reasonable approach obtainable in practice"*, but
   the patent was not retrieved, and a patent's own design basis is in any
   case not a statement of industry practice.  The steam-reforming figures
   (JM's worked 12 °C; a reported 5–20 °C design range) are **a different
   reaction** and are not transferable, not least because the sign of the
   approach reverses between an endothermic and an exothermic equilibrium.
2. **The activation energy and pre-exponential factor of the Dyson & Simon
   rate constant, at a usable precision.**  The one retrieved source giving
   numbers (`k₀ = 8.849 × 10¹⁴`, `Ea = 170560`) states the energy unit as
   `kJ·mol⁻¹`, which is wrong by three orders of magnitude, and the original
   paper was not retrieved to settle it.
3. **The page range of Temkin & Pyzhev (1940)**, and whether the 1940 *Acta
   Physicochimica U.R.S.S.* paper and the 1939 *Jour. Phys. Chem. (U.S.S.R.)*
   13, 851–867 paper are the same work.  Four mutually inconsistent page
   ranges appear across retrieved citation databases.
4. **Any rate expression, α, activation energy or pre-exponential for a
   ruthenium (KAAP-class) ammonia catalyst.**  Only qualitative activity and
   pressure claims were retrieved.
5. **A table of typical overall heat transfer coefficients** from an
   authoritative retrievable source.  The VDI Heat Atlas section and the
   Towler & Sinnott table are both behind access controls; the Northwestern
   wiki's exchanger page carries no U table.  **No U value of any kind is
   quoted in this document.**
6. **The `F ≥ 0.75` rule from its own handbooks.**  The attributions to the
   *Heat Exchanger Design Handbook* and to *Perry's* in §4.3 come from
   retrieved secondary engineering sources that quote them; neither handbook
   was retrieved.  Treat 0.75 / 0.8 / 0.9 as reported-not-verified.
7. **A quotable rule for the exact stage at which an assumed U is replaced by
   a calculated one.**  §4.2's staging is inferred from AACE's deliverable
   maturity matrix plus King's FEED deliverable list, and is labelled as
   inference in place.
8. **Sections 5–9 and the Appendix of AACE 18R-97 rev. 2020**, including its
   Table 3 (the current deliverables/maturity matrix) and its Project
   Definition Rating System section.  The AACE sample truncates after §4.
   §2.2's matrix is the **2005** revision's Figure 4.
9. **The full text of AACE 17R-97**, the generic recommended practice that
   18R-97 is an addendum to.  Not retrieved.
10. **Whether Choupo's `AACE_class` default of 4 and its band were ever
    deliberately chosen against 18R-97.**  No design record, commit message
    or comment in the tree explains the pairing; `EconomicsPass.cpp` states
    the numbers and not their provenance.
11. **Towler & Sinnott's own wording** for any of the rules of thumb in
    §5.5.  Only the Elsevier front matter (table of contents) was retrieved
    from the book itself; the factors are quoted from the Northwestern wiki,
    which cites Towler & Sinnott (2013) for them.  **The book is cited here
    for structure, never for a number.**
12. **Any figure for what fraction of real projects actually follow the
    staged sequence described in §2.**  Practice varies and the axes named in
    §2.4 and §4.4 are the ones the sources named; there may be others.

---

## 9. Sources

All URLs retrieved on **2026-09-24**.

### A. Retrieved and read in full

1. **AACE International Recommended Practice No. 18R-97**, *Cost Estimate
   Classification System – As Applied in Engineering, Procurement, and
   Construction for the Process Industries*, revision **February 2, 2005**,
   © 2005 AACE Inc.  Complete 8-page text, hosted by AHE Inc.
   <https://aheinc.ca/wp-content/uploads/2018/12/AACE-Cost-Estimate-Classification-System.pdf>
   *(A third-party host of the AACE document itself, carrying AACE's
   copyright notice, acknowledgment list and page furniture — not a
   summary.)*
2. **AACE International Recommended Practice No. 18R-97**, revision
   **August 7, 2020**.  AACE's own watermarked SAMPLE; complete through §4,
   including Table 1 and the accuracy discussion.
   <https://web.aacei.org/docs/default-source/toc/toc_18r-97.pdf>
3. **Linnhoff March**, *Introduction to Pinch Technology*, © 1998.  Hosted by
   the University of Oklahoma School of Chemical Engineering.
   <https://www.ou.edu/class/che-design/a-design/Introduction%20to%20Pinch%20Technology-LinhoffMarch.pdf>
4. **Johnson Matthey**, *Guide to Approach-to-Equilibrium* (flyer, c. 2020).
   <https://matthey.com/documents/161599/441284/JM+Guide+to+ATE+flier+(c2020)+.pdf/77700e80-2ca4-0c9e-3a34-738a2145168f?t=1653488896115>
5. **D. M. Yancy-Caballero, L. T. Biegler and R. Guirardello**, *Optimization
   of an ammonia synthesis reactor using a penalty method*, **Chemical
   Engineering Transactions 43 (2015)**, AIDIC.
   <https://www.aidic.it/cet/15/43/217.pdf>
6. **S. Nadiri, A. Attari Moghaddam, J. Folke, H. Ruland, B. Shu,
   R. Fernandes, R. Schlögl and U. Krewer**, *Ammonia synthesis rate over a
   wide operating range: from experiments to validated kinetic models*,
   **ChemCatChem (2024) e202400890**, doi:10.1002/cctc.202400890.  Accepted
   Article, Max Planck Society repository copy.
   <https://pure.mpg.de/rest/items/item_3608464_2/component/file_3608958/content>
7. **S. Y. Ereev and M. K. Patel**, *Standardized cost estimation for new
   technologies (SCENT) – methodology and tool*, **Journal of Business
   Chemistry 9(1) (2012)**, Utrecht University / Institute of Business
   Administration.
   <https://www.businesschemistry.org/wp-content/uploads/2020/09/3_JoBC_2012_Vol9_Iss1_EreevPatel.pdf>
8. **G. Towler and R. Sinnott**, *Chemical Engineering Design: Principles,
   Practice and Economics of Plant and Process Design* — **front matter and
   complete table of contents only** (Elsevier sample chapters, 1st ed.,
   final proof dated 30.10.2007).  **Cited for structure, never for a
   number.**
   <https://booksite.elsevier.com/samplechapters/9780750684231/Sample_Chapters/01~Front_Matter.PDF>

### B. Retrieved as rendered pages

9. **Steven King CEng MIChemE**, *Demystifying Engineering Projects Part 3:
   FEED and Detailed Design*, **The Chemical Engineer** (IChemE),
   27 March 2025.
   <https://www.thechemicalengineer.com/features/demystifying-engineering-projects-part-3-feed-and-detailed-design/>
10. **Steven King CEng MIChemE**, *Demystifying Engineering Projects Part 2:
    Feasibility and Pre-FEED*, **The Chemical Engineer**, 27 February 2025.
    **Partially paywalled** — only the opening was retrieved, and nothing
    beyond it is claimed.
    <https://www.thechemicalengineer.com/features/demystifying-engineering-projects-part-2-feasibility-and-pre-feed/>
11. **Tom Baxter CEng FIChemE**, *The Design Process: From Concept to Heat
    and Mass Balance*, **The Chemical Engineer**, 29 August 2024.
    <https://www.thechemicalengineer.com/features/the-design-process-from-concept-to-heat-and-mass-balance/>
12. **Ipieca**, *Pinch analysis (2022)*, Energy Efficiency Compendium,
    November 2022.
    <https://www.ipieca.org/resources/energy-efficiency-compendium/pinch-analysis-2022>
13. **Northwestern University, McCormick School of Engineering**,
    *processdesign* wiki — *Pinch analysis*.  Cites Biegler/Grossmann/
    Westerberg (1997), Seider/Seader/Lewin (2004), Towler & Sinnott (2013),
    Turton et al. (2012).
    <https://processdesign.mccormick.northwestern.edu/index.php/Pinch_analysis>
14. **Northwestern University**, *processdesign* wiki — *Reactors*.
    <https://processdesign.mccormick.northwestern.edu/index.php/Reactors>
15. **Northwestern University**, *processdesign* wiki — *Heat exchanger*.
    Cites Wilcox (2009), Towler & Sinnott (2012, 2013), Seider/Seader/Lewin
    (2004).
    <https://processdesign.mccormick.northwestern.edu/index.php/Heat_exchanger>
16. **Northwestern University**, *processdesign* wiki — *Estimation of
    capital*.  Cites Garrett (1989), Peters et al. (2002), Towler & Sinnott
    (2013).
    <https://processdesign.mccormick.northwestern.edu/index.php/Estimation_of_capital>
17. **Wikipedia**, *Front-end loading*.  Cites CII Best Practices Guide
    (2012) and the PDRI.
    <https://en.wikipedia.org/wiki/Front-end_loading>

### C. Bibliographic records verified, full text NOT retrieved

18. **J. M. Douglas**, *A hierarchical decision procedure for process
    synthesis*, **AIChE Journal 31(3) (1985) 353–362**,
    doi:10.1002/aic.690310302.  Citation and abstract verified; the article
    page returned HTTP 403.
    <https://aiche.onlinelibrary.wiley.com/doi/10.1002/aic.690310302>
19. **D. C. Dyson and J. M. Simon**, *A kinetic expression with diffusion
    correction for ammonia synthesis on industrial catalyst*, **Ind. Eng.
    Chem. Fundam. 7 (1968) 605–610**, doi:10.1021/i160028a013.  Citation
    verified through two independent retrieved sources (items 5 and 6) and
    the ACS record; the paper itself was not retrieved.
    <https://pubs.acs.org/doi/10.1021/i160028a013>
20. **M. Temkin and V. Pyzhev**, *Kinetics of ammonia synthesis on promoted
    iron catalysts*, **Acta Physicochimica U.R.S.S. 12 (1940)**.  **Page
    range disputed** — see §8.3.  A US Bureau of Mines literature-abstract
    index gives a possibly-identical work as *Jour. Phys. Chem. (U.S.S.R.)*
    **13 (1939) 851–867**, *Chem. Abs.* 34 (1940) 6512.
    <https://fischer-tropsch.org/Bureau_of_Mines/abs_of_lit/lit-abs/3300/lit3368.htm>

### D. Claims resting on search-result snippets only

Flagged in place in the body.  These are **reported, not verified**:

21. The `F ≥ 0.75` / `0.8` / `0.9` design limits and their attributions to
    the *Heat Exchanger Design Handbook* and *Perry's Chemical Engineers'
    Handbook* (§4.3).
22. The TEMA Class R / B / C descriptions and the statement of TEMA's scope
    (§4.4); tema.org itself was not retrieved.
23. The ASME Section VIII Division 1 division of labour for exchanger
    mechanical design (§4.4).
24. The statement that *"Large scale industrial steam methane reformers have
    been designed to obtain an approach to equilibrium of 5-20 °C at the
    outlet"* (§3.2), which appeared in patent-corpus search results.
25. The separate-steam-utility-network modelling practice described in §5.4.
26. The KAAP ruthenium catalyst facts in §3.5 — the graphitic support, the
    ~20× activity claim, the 90 bar operating pressure and the four-bed
    Fe/Fe/Fe/Ru arrangement.

### E. Tree facts

All verified on 2026-09-24 by reading the files named, at the line numbers
given in §7.  `src/postProcessing/EconomicsPass.cpp`,
`src/core/ResultRecords.H`, `src/postProcessing/SizingPass.{H,cpp}`,
`src/postProcessing/sizing/{EquipmentSize,ShellTubeHX}.cpp`,
`src/postProcessing/PinchPass.{H,cpp}`,
`src/unitOperations/UnitOperation.cpp`,
`src/unitOperations/reactor/{GibbsReactor,EquilibriumReactor,PFR,CSTR}.cpp`,
`src/unitOperations/heatTransfer/HeatExchanger.cpp`,
`src/reporting/UtilityAllocationReport.cpp`, `data/standards/utilities/`,
`docs/design-heuristics.md`,
`tutorials/plant/greenAmmoniaIndustrialN2/{system/postDict,system/flowsheetDict,reports/economics/cashFlow.csv}`,
`tutorials/props/kinetics/ammoniaRate01_dyson_simon/README.md`.
