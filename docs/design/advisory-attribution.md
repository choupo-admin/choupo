# Which state is this advisory about?

*Settled and built 2026-08-24.  The second of the two defects named as
blockers for v2608; the first was the energy report's guessed phase label
(`docs/design/glass-box-reading-benchmark-2026-08-24.md`, F1).*

---

## 1  The defect

`core/AdvisorySummary.H` exists because *a warning a thousand lines above the
answer has been delivered and not received*.  It replays every announcement at
the end of the run, grouped, where a reader will meet it.  It worked.

Then the reactive path reintroduced the same failure from the other side.  Not
too few announcements — too many.

`column13_sour_water_stage_identity` ends with **103 advisories**, ninety-nine
of them the same sentence:

```
- speciation: Davies activity at I = 1.66 mol/kg -- beyond its ~0.5 mol/kg
  trust range; speciation and SI are INDICATIVE (use Pitzer for quantitative work)
- speciation: Davies activity at I = 1.22 mol/kg -- beyond its ~0.5 mol/kg ...
- speciation: Davies activity at I = 0.85 mol/kg -- beyond its ~0.5 mol/kg ...
                                    ... ninety-six more ...
```

Twelve of those describe **published** numbers: the converged streams whose
`speciation {}` blocks sit in `converged/`, at ionic strengths of 0.64, 1.31,
4.26 and 8.01 mol/kg — genuinely beyond Davies' band, genuinely worth telling
the reader.  The other ninety-five describe compositions that appear **nowhere
in the answer**, including ionic strengths of 8.01, 7.93 and 6.77 mol/kg in
states no sour water is ever in.

Ninety-nine near-identical sentences are read by nobody.  So the twelve true
caveats were delivered and not received — **the block's own failure mode,
returning by a different road.**

### Why they exist at all

An iterative solver **walks**.  It evaluates the physics at compositions it
invented, reads the residual, and throws nearly all of them away.  Seeds,
backtracks, caged steps, finite-difference Jacobian columns, whole discarded
phase passes.  On an electrolyte feed most of those states are out of band, so
most of them raise a caveat.

An advisory about a discarded trial is **not a caveat about the answer**.  It
is a fact about the path.  Nothing distinguished the two.

---

## 2  The shape of the fix

An advisory carries two more fields, and **both are stamped by the sink**, not
by the 111 sites that raise them:

| field    | meaning |
|----------|---------|
| `where`  | the innermost open `AdvisoryFrame`'s label |
| `status` | `accepted` — describes a state the run published<br>`trial` — describes a state a solver visited and may have discarded |

A solver declares what it is doing with a scope-bound `AdvisoryFrame`:

```cpp
AdvisoryFrame walk("reactive equilibrium: outer Newton search");
...                                  // every advisory raised in here is `trial`
walk.close();                        // the search is over; what follows IS the answer
```

Three rules, each of which cost something to get right:

* **The default is `accepted`.**  A site that says nothing keeps exactly its
  old behaviour.  Nothing is silently demoted to a footnote by a mechanism
  nobody opted into, and a run whose solvers open no frames prints what it
  printed before this existed.
* **`trial` wins up the stack.**  A converged sub-solve inside a discarded
  trial is still discarded.
* **Status only ever moves toward the answer.**  The same sentence is usually
  raised first by some trial and only later at the answer; if dedup simply
  suppressed the second, the entry would keep the status of whichever
  evaluation happened to run first.  Iteration order would decide truth.  So
  an `accepted` add **promotes** a matching `trial` entry in place; a `trial`
  add never demotes an `accepted` one.

The end-of-run block then **partitions** — it does not deduplicate.  Nothing
inspects two messages and decides they mean the same thing; that is a
similarity heuristic and heuristics rot.  It reads one field the engine
stamped at the moment of the raise:

```
  MODEL ASSUMPTIONS  (8)
    - speciation: Davies activity at I = 0.64 mol/kg -- beyond its ~0.5 ...
    - speciation: Davies activity at I = 1.31 mol/kg -- ...
    - speciation: Davies activity at I = 8.01 mol/kg -- ...
    - stream 'stageMix': priced on the state it CARRIES ...
    ...

  THE SOLVER'S PATH  (95)
    Raised while evaluating states a solver visited and did NOT publish.
    They caution about no number in this run's answer; they describe how it
    was reached.  Full text in the result JSON (status "trial").
    - adiabaticFlash outlet-T search: 5 advisories
    - column 'distillationColumn' MESH search: 3 advisories
    - reactive equilibrium: outer Newton search: 87 advisories
```

**103 lines became 12**, and every one of the twelve is about a number in the
answer.  The other ninety-five are counted, attributed, and ride in full in the
result JSON where a reader who wants the path can read the path.

---

## 3  Where the frames go — and how that was found

The first draft framed the **MESH column's Newton**, on the reasoning that
column13 is a column case.  That demoted 7 of 103.

The second added the **adiabatic flash's outlet-T search** (its bisection
probes, its bracketing, and the two extra flashes the central-difference
`dH/dT` costs per iteration).  That took it to 42 of 103 — and left `I = 8.01`
still marked as the answer, which is what said the search was not over.

The third put the frame where the advisories are actually **born**:
`ReactiveVLE`'s outer Newton.  That is the innermost search, and the column's
MESH, the flash's T loop and the energy report's per-stream pricing all reach
it.  **One frame there serves every caller**, including callers that have
never heard of advisories.

That is the finding worth keeping: *frame the search where the search is, not
at every caller.*  The instrumentation found its own answer — each partial fix
made the remaining flood point at the next culprit.

### The prior art was already in the file

`ReactiveVLE` had solved this exact problem for the inner speciation's
**verbosity**, and got it right on 2026-07-27: first call carries the
activation trace, the middle calls are silent, and *the final call — on the
converged state — carries the result diagnostics.*  It was fixed then because
the block reported the **initial guess's** pH as though it were the answer
(pH 10.164 against a converged 9.900; with a salt in the system the gap reached
1.7 pH units).

The advisories had the identical defect, one field over, and kept it three
fields longer.

---

## 4  A data race, closed on the way

The sink is written from inside `newtonND`'s **finite-difference Jacobian**,
which the MESH column runs on a thread pool (`opts.parallel = true`; the
residual is asserted pure).  `AdvisoryLog::add` did an unguarded linear scan
and `push_back` on a shared `std::vector`.  That is a data race — undefined
behaviour — and it had been there since the parallel Jacobian shipped.

It did **not** manifest in 18 consecutive runs of column13 on a two-thread box:
identical count, identical order, every time.  That is evidence about *that
machine*, not about the contract.  A thirty-thread box is a different
experiment, and UB owes nobody a crash.

One mutex now guards the entries, the frame stack, and every read of either;
`entries()` returns a copy rather than a reference, because handing out a
reference to a vector the class mutates under a lock hands out the race the
lock just closed.

**No test here demonstrates the absence of UB, and none is claimed.**

---

## 5  What was measured, not assumed

### `walk.close()` in `ReactiveVLE` is, today, inert

Sabotage 1 removed it — expecting the over-demotion arm to fire.  **It did
not.**  Measured directly, with and without the close, column13's tally is
byte-identical:

```
   12  accepted
    5  trial   adiabaticFlash outlet-T search
    3  trial   column 'distillationColumn' MESH search
   87  trial   reactive equilibrium: outer Newton search
```

Every accepted advisory on that case arrives by a path that opens no frame at
all: the post-solve pass in `Flowsheet::solve` that speciates each converged
stream as a liquid (confirmed under a debugger — `frames=0`).  It raises the
same sentences and reaches the reader anyway.

The close **stays**, for two reasons that are not "it might help":

1. That pass speciates a stream's *overall* composition as a liquid, which for
   a two-phase stream is a different state from the converged equilibrium
   liquid the Newton just solved.  They coincide on this corpus; they are not
   the same computation.
2. Without it, whether the reader is told anything about the answer would
   depend on an unrelated pass in another subsystem continuing to exist.  **A
   contract that holds by coincidence is not a contract.**

What is *not* claimed is that any corpus case demonstrates it.  None does, and
the gate says so.

### The `I = 8.01` block is real

Four of the streams carry only 1.4–1.9 mol of water, so their molalities —
and their ionic strengths — are genuinely that high.  Those blocks are in
`converged/`.  A student reading them gets Davies numbers sixteen times beyond
the model's trust range, and the caveat block now says so in eight lines
instead of hiding it in a hundred and three.

---

## 6  The gate

`bin/curate/check_advisory_attribution.py`, wired into `bin/runTests`.

It pins **both directions**, because the dangerous failure of this design is
not the flood — which is merely unreadable — but **over-demotion**, which is
silence wearing the fix's clothes.  A frame left open across the converged
re-evaluation would file every true caveat under "the solver's path", and the
block would go quieter than it was before any of this existed.

Five sabotages.  **The first survived**, and is recorded as having survived:
it attacked one caller when the arm it was meant to prove needed the mechanism
attacked instead (sabotage 5, `bool trial = true` unconditionally in the sink).

Sabotage 5's own first run then found a defect **inside the gate**: the
accepted counter matched every line starting `"    - "` in the whole block, and
the path section's per-frame lines start exactly that way — so with everything
demoted it counted 3 and the `accepted == 0` clause could never fire.  It had
also been over-reporting the healthy case as 15 when the truth is 12.  *A
counter that measures the wrong thing, inside the gate built to catch exactly
that.*

---

## 7  What this does NOT do — named, not implied

* **Most iterative solvers are still unframed.**  Three opt in.  The recycle
  Wegstein, the Gibbs multi-start, the MESH's Wang-Henke sweep, and both time
  integrators still report their paths as though they were their answers.
  This is a deliberate boundary of the slice, not a claim of completeness.
* **It does not judge whether a `trial` advisory is uninteresting.**  They ride
  in full in the JSON precisely because neither the engine nor the gate can
  make that judgement.
* **It does not summarise the range a search spanned** ("I from 0.59 to 2.39").
  The sink stores the advisory's *text*, not the number inside it, and
  recovering it would mean parsing the sentence — a second, weaker home for a
  quantity the raising site already had in hand.
* **It does not deduplicate.**  Two differently-worded advisories are never
  judged "the same fact".

## 8  What the corpus says

Full suite, 365 cases compared against their pre-change output:

| | cases |
|---|---|
| **untouched** — same caveats, no path section at all | **326** |
| changed | 17 |
| **silenced** — accepted advisories went to zero | **0** |

The 326 are the design's central claim holding: a case whose solvers open no
frame prints exactly what it printed before this existed.  The zero is the
arm that mattered — no case lost a caveat about its answer.

The worst offender was never column13:

| case | before | about the answer | attributed to a search |
|---|---|---|---|
| `stripper02_sour_water_h2s` | 385 | 12 | 375 |
| `stripper01_sour_water` | 120 | 7 | 114 |
| `column13_sour_water_stage_identity` | 107 | 12 | 95 |
| `flash13_acetic_ethanol_vacuum_flash` | 29 | 5 | 24 |
| `column08_radfrac_multidraw` | 16 | 8 | 8 |
| `basis01_two_unit_chain` | 15 | 9 | 6 |

Every remaining case in the changed set moves by single digits.

## 9  Numbers moved

**None.**  `bin/runTests --witnesses` 15/15 unchanged; the advisory list is a
top-level result block that no golden row kind can read, so no `expected` file
could have been pinning it — which is, itself, the 2026-08-12 lesson: *a result
block the golden format cannot read arrives unpinned.*  What pins this one is
the gate.
