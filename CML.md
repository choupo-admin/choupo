# CML -- Choupo's development plan (short, medium and long term)

Asked for by Vítor on 2026-10-31 ("o plano de desenvolvimento de curto,
médio e longo prazo -- vamos chamar plano CML") and NOT built that day: the
session that answered called the work schedule by that name instead.  This
file is the plan; the schedule is `PLAN.md`.  The difference, which is why
there are two files:

* **`CML.md` (this file)** says WHERE Choupo is going and WHY, in months and
  years.  It changes when the direction changes.
* **`PLAN.md`** says what is done in the next hour, the next day and the next
  three days.  It changes many times a day and is derived from this file and
  from DEV.md 4c.
* **DEV.md 4c** is the register of record: every commission, with its
  decision and its reason.  Each item below points at its entry.

Horizons, chosen by the architect (CLAUDE.md rule 00) with the reason stated:
**short = to the end of 2026** (the commissions already open and one release
a student can trust); **medium = 2027** (the first full year in which
students use Choupo, including the spring semester); **long = 2028-2029**
(the scale at which the niche is owned and others contribute).

Reviewed: 2026-11-01 (first version; the external audit Vítor relayed on
2026-10-31, C190, is integrated in sections 2 and 4).

---

## 1. The line Choupo races on, and the one it does not

Choupo does not compete on breadth -- component count, databank size,
model-list length.  A list of what another simulator has is not a plan
(C190, the comparison: what is absent stays absent unless a case in Choupo's
own domains needs it).  It competes on four things breadth-first tools do
poorly:

1. **The glass box.**  Every equation, iteration and datum visible, with its
   provenance; a refusal by name instead of a plausible number.
2. **The domains served poorly elsewhere.**  Membranes (NF/RO/ED, Vítor's
   research), aqueous electrolytes and speciation, solids, and the
   electrochemistry of the energy transition.
3. **The bridge from concept to equipment.**  A student moves from a
   functional class to a sized, costed, commercial item (C189, C192, the
   design sheets and schematics).
4. **The pedagogy.**  EduTools that replace a chapter of a textbook with a
   computation the student can open, and a first path through the corpus
   that a student can follow alone.

## 2. Short term -- to the end of 2026: a release a student can trust

**S1. No known silent wrong answer.**  The external audits of October found
wrong numbers at exit 0; each is a commission and each closes before
anything new is built on the same path.  Exit criterion: no known defect of
that shape in grammar a corpus case can reach.
Items: C185 (8) (positivity mask); C186 (5) (pressure is not a tear
variable) and the sibling outer drivers that read unconverged points
(DesignSpec, GridSweep, Sweep); C190 (10) and (13) first, then (14), (11)
measured, (15), (12); C184 P0 (the distillation step contract and the
singular-Jacobian diagnostic); C187 (1) and (2).

**S2. What a unit accepts is declared, and explained.**  C188 completed
across the units (passThrough, per-port contracts, the batch crystalliser,
the recycle question) AND the Theory Guide section Vítor asked for on
2026-10-31: why a component may be modelled, cross a unit as a declared
approximation, or be refused -- the dilute ethanol in a wine versus a second
liquid phase of benzene.

**S3. One complete membrane design path.**  From a water analysis to a
commercial module and its energy: C189 slices 5 and 6 (the shortlist with no
default score), C192 (the pressure exchanger, its sheet and schematic, an
SWRO case with energy recovery), the A_w curation of the two module records,
and the module registry's local tier.

**S4. Release Choupo-2612.**  The first since Choupo-2608 (2026-09-02); the
WASM site verified in a browser against the release; RELEASING.md followed.

**S5. The software paper.**  The JOSS submission, waiting only on facts
Vítor holds (ORCIDs, a named person's consent).

## 3. Medium term -- 2027: students use it, and the niche is owned

**M1. Students.**  The first path (`tier tutorial;`) walked by real students
in the 2027 spring semester; what they send back outranks every candidate
below.  Each confusion a student reports is a defect of the surface, not of
the student (CLAUDE.md section 10, design a screen from the user's task).

**M2. EduTools for the energy transition.**  The tree of chemistry (C191 A:
feedstocks, intermediates and products, the classical and the low-carbon
routes, every route cited); the methanation reactor and a Power-to-Gas plant
case (C191 B); quizzes on the tools that have none.

**M3. The solids chain and separations a course needs.**  From the external
opinion (C190), each with its pedagogical scope written before dispatch:
seeded crystallisation on the existing population balance; cake filtration
and washing (the crystallise -> filter -> wash demonstrator); a linear
chromatography column with fraction collection.

**M4. Robustness a student does not see.**  Distillation P1-P3 (C184),
convergence diagnostics that name the stage and the equation, the
quasi-steady seam's first law.

**M5. Validation, not only regression.**  The validation subset (answers
held to MEASUREMENTS, not to self-recorded goldens) grown to at least one
witness per niche family: NF, RO, ED, speciation, crystallisation,
adsorption.  A green suite says an answer has not moved; only this layer
says it is right.

**M6. Electrochemistry beyond electrodialysis.**  Water electrolysis
(alkaline, PEM) and its coupling to the Power-to-Gas case, on the
electrochemical potential the hierarchy already carries.

**M7. Releases.**  About one per quarter, each with its site copy verified.

**M8. Sustainability of the project (OPEN, triggered by traffic).**  The
manufacturer-sponsorship model (DEV.md 4c, the C189 entry: a manufacturer
that authorises its presence; the `partner` field the ranking never reads;
Synder Filtration first) is NOT launched before Choupo has traffic.  First
step: measure the traffic that exists (repository and site); the trigger and
the contract's legal review are decided then (the review is TalentGround's).

## 4. Long term -- 2028-2029: a reference for its own domains

**L1. Multi-scale coupling.**  The drill-in from a plant to a unit's
interior, extended to resolved models of a membrane channel or a reactor bed
where the lumped model is the limit of what a student can learn.

**L2. Bioprocess detail.**  Fermentation, downstream processing and
the membrane steps between them, on the same glass-box terms.

**L3. Others contribute.**  Other universities adopt it and send cases and
data; contribution under GPL-3.0-or-later with no CLA (CONTRIBUTING.md); the
curation rules (provenance per value, primary sources) are what make
external data acceptable.

**L4. The chemistry graph as the backbone.**  The curated graph of C191 used
to connect cases: a feedstock, its routes, the plant of each route, and the
CO2 each emits, so a student can compare a classical and a low-carbon route
end to end.

**L5. The commercial bridge at scale.**  If M8's trigger is met, the
manufacturer catalogues as a sustained relationship, never at the cost of
the neutral ranking.

## 5. What Choupo will not do (so the plan cannot drift into it)

No race on component or model counts; no proprietary or NonCommercial data
in the public tree; no Python rewrite or heavy dependency; no closed module
or dual licence; no commercial competitor named in a user-facing surface; no
gate traded for speed.  (Defined in docs/architecture/project-philosophy.md
section 4.)

## 6. How this plan is kept

* Read at the start of every session, with `PLAN.md` (CLAUDE.md rule 8).
* An item enters or leaves by a written decision in DEV.md 4c; Vítor's
  suggestions are weighed there (rule 00).
* When an item's horizon passes, it is marked done, moved, or dropped with
  its reason -- never left to go stale (CLAUDE.md section 10, this file is a
  memory).
* Vítor's Portuguese view of this plan is a private page updated FROM this
  file, never the other way round.
