# A plant that closed on its cooling water

**Kind:** ADR · **Status:** SHIPPED 2026-09-08 · **Authority:** delegated by
Vítor to the commander ("Decide tu com a info que tens!"); ships on the stated
default recorded here.

---

## 0. The invariant, first, because everything below is subordinate to it

**THE SEPARATION IS PRESENTATION, NEVER VALIDATION SCOPE.**  Excluding a
utility from the *presented* process material summary must NEVER exclude it
from a physical check.  The per-unit balances, the element balance, the energy
balance and every explicitly modelled material boundary keep covering ALL
streams, utilities included.  ONLY the plant-level material SUMMARY gains a
second scope.

This sentence is at the top of `src/streams/UtilityCircuit.H`, at the top of
`src/streams/UtilityCircuit.cpp`, and in the comment beside the code that
computes the two scopes in `src/reporting/MassBalanceReport.cpp`.  A reader who
finds the declaration being used to skip a stream anywhere else is looking at a
defect, not at this design.

## 1. The measurement

`tutorials/plant/ammonia02_full_plant` models its cooling water as an explicit
process stream: `cw` -> `waterCooler` (a `heatExchanger`) -> `cwOut`.  Its own
`reports/balances/massBalance.csv`, before this slice:

```
component      in_kg_per_h      out_kg_per_h            net
N2              55 465.74          6 894.79      -48 570.95
H2              11 975.04          1 488.58      -10 486.46
NH3                  0.00         59 055.67      +59 055.67
Ar               3 195.84          3 195.84           +0.00
water        9 007 500.00      9 007 500.00         0.0000
TOTAL        9 078 136.62      9 078 134.89   closure 100.0000 %
```

The cooling water is **99.222 %** of the mass in that balance.  The real
process material is 70 636.62 kg/h and the product is 0.65 % of the reported
total; the dilution factor is 128.5, so a **1 % loss of syngas would read as
0.008 %** — invisible at the four decimals the report prints.  That
`100.0000 %` passed by DILUTION, not by conservation.

And the same plant treats its other three utilities — `steamLP`,
`electricity`, `refrigerationNH3` — as ALLOCATED duties, outside the material
balance entirely.  One plant, two conventions, and the noisier one won.

## 2. Four binding constraints, and who corrected what

An external reviewer (ASTRA) corrected four points of an earlier draft.  Each
correction is recorded here with what it replaced, because the reasoning is
the part that must survive:

1. **The criterion is "transfers matter across the process boundary", NOT
   "contacts the process."**  The draft used the second phrasing.  It is
   rhetoric: it can only be taken on the author's word.  The first is
   checkable — from the topology and from conservation — and the engine checks
   it.

2. **`reason` is OPTIONAL, not mandatory.**  The draft required a free-text
   `reason`, by analogy with the Hermia blocking laws in the membrane module
   (`docs/design/` and CLAUDE.md §6: a blocking law REQUIRES a `reason`).  The
   analogy is FALSE and the record must say so: Hermia's `reason` states a
   MECHANISM the engine cannot verify — a deposited cake or a covered pore,
   which only the author knows — so prose is the only evidence available
   there.  Here the claim IS verifiable and this slice verifies it.
   **Mandatory prose where verification exists is friction, not rigour.**  An
   optional free-text `note` is offered instead.

3. **Component-wise conservation across the pair is NECESSARY but NOT
   SUFFICIENT, and it is NOT a universal law of utilities.**  A cooling tower
   with makeup, evaporation, drift and blowdown is a legitimate plant and does
   NOT conserve across two streams.  So the refusal says the **two-stream
   closed-circuit DECLARATION is false** and names the streams to model —
   never "your utility is leaking".  The error is in the declaration.

4. **The load-bearing invariant of §0**, which replaced a draft that spoke of
   "excluding utilities from the balance" without saying from WHICH balance.

## 3. The grammar

A new top-level block in `system/flowsheetDict`, beside `units ( ... )`:

```
utilities
(
    {
        name     CW1;
        service  coolingWater;   // resolves data/standards/utilities/<service>.dat
        supply   cw;             // the stream entering the plant
        return   cwOut;          // the stream leaving it
        note     "closed cooling-water circuit";   // OPTIONAL
    }
);
```

**Why it lives there.**  It is TOPOLOGY — which EDGES form an auxiliary
circuit.  It is not state, so it does not belong in `0/<stream>`: those files
carry STATE and are rewritten in `converged/`, and a role that a solve
rewrites is not a role.  It is not a port property either, because a stream is
an EDGE and declaring its role at ONE endpoint is exactly the producer rule
this project replaced on 2026-09-07 (`a-stream-belongs-to-the-graph-that-
contains-both-ends.md`).

**Absent the block a case is byte-identical**, and that was verified rather
than asserted: `ammonia02_full_plant` was run before the change and again after
it with no block, and its whole console output, its `massBalance.csv` and its
result JSON diffed clean.  The result JSON block is emitted only when a circuit
is DECLARED, so the object's presence is itself the answer to "was anything
declared here".

## 4. The seam

`reporting::Topology` already carried the precedent: `observedFeeds` /
`balanceFeeds` is a class of feed deliberately excluded from the boundary
count for a stated reason (a feed consumed only by observer units, 2026-08-29).
Declared utility streams are the same shape — a set of names the presented
summary leaves out — so no parallel machinery was built.

The declaration itself has ONE home, `src/streams/UtilityCircuit.{H,cpp}`
(band 3), and three callers:

* `Flowsheet::solve` reads it and validates it — the STRUCTURAL half at the
  flatten seam, where the topology is final and before any state work, so a
  false declaration refuses before a solve rather than after one; the
  CONSERVATION half once the plan has converged (a non-converged registry is
  not an answer, and refusing on one would accuse the case of something the
  solver has not finished saying).
* `MassBalanceReport` asks it only for the set of names to present apart.
* `allocateUtilities` asks which unit each circuit serves.

One function moved to make this possible: `componentMassFlow` went from
`reporting/BalanceMath.H` (band 1) to `streams/StreamMass.H` (band 3), beside
the two total-mass views it belongs with; `reporting` keeps the
`reporting::componentMassFlow` spelling as an alias, so every existing caller
reads exactly the same function.  Writing the loop a second time in band 3
would have been a second home for the one arithmetic every balance surface
uses.

## 5. The refusals

Each names the DECLARATION as the false thing, because that is what has been
contradicted — the plant is whatever the plant is, and the block is a claim
about it.

| what | where |
|---|---|
| a missing or empty required key | `read` |
| `supply` and `return` are the same stream | `read` |
| two circuits share a name | `read` |
| a stream claimed by two circuits (its mass would be subtracted twice) | `read` |
| `service` is not a record in the utility catalogue — through `registryRefusal::message`, the ONE home of that sentence | `read` |
| a named stream no unit mentions | `validateTopology` |
| `supply` is PRODUCED inside the plant (not a boundary inlet) | `validateTopology` |
| `return` is CONSUMED inside the plant (not a boundary outlet) — matter that re-enters the process is process matter | `validateTopology` |
| the two ends are not ONE unit's utility side | `validateTopology` |
| the pair does not conserve component-wise (tolerance `kConservationRelTol`, named in the source, not a literal at the site) | `validateConservation` |

**Two of these deserve their reasoning written down.**

*The one-unit rule.*  The two-stream form says: this matter enters, serves ONE
piece of equipment, and leaves unchanged.  A branched header — a splitter to
three exchangers and a mixer back — is a perfectly real plant and is NOT this
declaration, so the refusal names the declaration as the thing that does not
fit and points at the two shapes that do (one circuit per served unit, or
leave the block off).  This is a deliberate narrow V1; §8 records it as not
done.

*The empty catalogue.*  Found by running the witness: from inside a case
directory with no `CHOUPO_HOME` the data root is empty and EVERY
directory-scan registry loads nothing — so the first version refused a
`coolingWater` that exists, quoting `registryRefusal`'s own "nothing is
registered at all" sentence and then failing the case anyway.  **A tool that
could not look must not report what it did not see** (2026-09-06), and the
mirror is just as bad: an empty registry is not evidence about a name.  An
empty catalogue now ANNOUNCES that the service word was not checked (with the
remedy, and it rides `AdvisoryLog` into the end-of-run caveat block); a LOADED
catalogue that lacks the word refuses by name.

## 6. What the engine publishes

* `massBalance.csv` **gains rows and moves none**.  `TOTAL` and `closure_pct`
  are the same rows in the same places and remain the TOTAL scope; appended
  after them, only when a block is declared: one `utility.<name>` row per
  circuit, `PROCESS_TOTAL`, and `process_closure_pct` (following the file's own
  `closure_pct,,,<value>` convention, `n/a` under the same rule).
* the result JSON gains `globalMassBoundary`, ONE object on ONE line, keyed
  consistently with `globalEnergyBoundary`: both scopes' in/out/closure, the
  excluded utility mass and its fraction of the total, the circuit count.  The
  engine decides and the GUI draws (2026-09-05); a `null` closure rather than a
  0.0000 where there is no boundary to close over.
* the run **ANNOUNCES** the narrowing, on the console and on `AdvisoryLog`:
  *"excluded 9007500.000 kg/h declared as utility (99.222 % of the total)
  across 1 declared circuit(s); process closure 99.998 % computed on 70636.620
  kg/h.  The TOTAL scope above is unchanged and still counts every boundary
  stream."*  A student must SEE the decision, never discover it.
* the utility ALLOCATION report lists the circuit.  Before this, `cw` carried
  no `category`, so `waterCooler` fell to the process-process rule and was
  reported as *carried by "its own process streams (heatExchanger)"* — true of
  a process-process exchanger and false of this one, which is served by a plant
  utility.  It now reads *"(carried: declared utility circuit CW1
  (coolingWater))"*, so there is one home for "what utilities does this plant
  use" and it names the service the CASE declared rather than one this pass
  would have picked.

## 7. Published implies pinned

The process closure is a number a reader acts on, so the golden format must be
able to read it, in the same commit (2026-08-12).  No new KIND was needed: the
`boundary` kind's `name` column was a fixed word (`global`) naming the one
ledger that existed, and it now SELECTS the ledger — `global` ->
`globalEnergyBoundary`, `mass` -> `globalMassBoundary`.  Every row recorded
before today resolves exactly as it did, an unknown ledger word yields empty
(the row reports MISSING, never a silent pass), and `--record-append`'s
hard-coded kind allowlist already carries `boundary`, so nothing is dropped in
silence there.

**And that change had to reach a SECOND gate, which is how a "published implies
pinned" fix nearly became a trap.**  `check_energy_boundary_pinned` read EVERY
`boundary` row as a first-law row, because until today every one was: a
`boundary mass ...` row in a golden would have been reported as *"pins a field
the run does not emit"*.  Measured by adding one such row to a corpus golden by
hand — the gate FAILED — so recording the mass rows would have broken a gate
about energy.  It now reads the `global` rows, COUNTS the rows naming another
ledger and says so in its claim (dropping them silently would hide that a
second ledger exists at all), and the golden file was restored.

`--record` generation emits four rows for a declaring case — `process_in`,
`process_out`, `process_closure_pct`, `utility_excluded_kg_per_h` — and none
for a case that declares nothing.  What is pinned is the PROCESS scope,
because that is what the declaration produced: the total closure on such a
plant is diluted by the circuit's own mass and would pass whatever the process
did.

**No golden was recorded.**  `ammonia02_full_plant`'s `expected` was already
stale before this slice (126 of its rows mismatch, from an unrelated first-law
fix landed earlier the same day) and re-recording it is RESERVED for Vítor.
Measured after this change: still exactly 126 mismatching rows — this slice
moves no pinned number.

## 8. What is NOT done, and why

* **A BRANCHED HEADER.**  One circuit is one supply, one return, one served
  unit.  A splitter-and-mixer header refuses with the reason and the two
  shapes that do work.  Widening it needs a rule for what "the circuit" is when
  its interior streams are also in the graph, which is a design question and
  not an implementation gap.
* **NO SECOND SCOPE ANYWHERE ELSE.**  Deliberately (§0).  The energy balance,
  the element balance and every per-unit balance still count the utility, and
  they must.
* **THE `category` OVERLAP IS NAMED, NOT CLOSED.**  A `0/<stream>` file may
  already carry `category <word>;`, which sums a service's consumption into
  `reports/utilities/consumption.csv`.  That is an aggregation LABEL and this
  is a BOUNDARY declaration — two questions — but they are two places where a
  reader learns that a stream is a utility, and only one of them is checked.
  `docs/ai/dict-syntax.md` states the difference for a case author.  Unifying
  them (a circuit implying a category, or a category implying nothing) moves
  the consumption totals of every utility tutorial and is not this slice's to
  take.
* **THE .ods SPREADSHEET SHEET STILL SHOWS THE TOTAL SCOPE ONLY.**
  `SpreadsheetReport` builds its own boundary sums from the same
  `componentMassFlow` and knows nothing of the declaration.  That is not
  wrong — the total scope is a real scope and the sheet says nothing false —
  but it is a surface where the two scopes could be shown side by side, and it
  is not done here.
* **NO CROSS-CHECK OF THE SERVICE AGAINST THE STREAM.**  A circuit declaring
  `service coolingWater` on a stream of toluene is accepted.  The catalogue
  record carries `components ( water )`, so the check is available — and it
  would accuse a legitimate hot-oil loop modelled with a pseudo-component
  whose name differs from the record's.  Named rather than half-built.
* **NO GUI DRAWING — and the GUI is a SECOND HOME for this balance, which is a
  finding rather than a gap.**  `globalMassBoundary` travels and nothing in
  `gui/` reads it; what the Streams summary and the Mass Balance plot draw
  today is `gui/src/case/balances.ts::massBalance`, which sums the streams
  ITSELF from feed/product roles.  That is exactly the shape the first-law
  slice closed on 2026-09-05, one balance over: the GUI computed a boundary
  sum of its own and disagreed with the engine's ledger by an order of
  magnitude.  It has not (yet) been caught disagreeing here — the GUI already
  honours `observed` feeds, so the two agree on today's corpus — but it will
  now show the DILUTED total on a plant that declares a circuit, because it
  cannot know a declaration exists.  Wiring it to draw `globalMassBoundary`
  (both scopes) is the natural next slice and is deliberately not taken here:
  it is GUI work with its own tests, and this slice's subject is the engine.
* **`bin/choupo-init0` DOES NOT VALIDATE THE BLOCK.**  `choupoSolve` and
  `choupo-lint` both refuse a false declaration; the `-init0` path skips it,
  because it exists to MATERIALISE a `0/` tree and bails before the topology
  work the checks read.  A case whose block is wrong is told so the first time
  it is linted or run, which is the next thing anybody does.
* **STEADY ONLY.**  The block is read by `Flowsheet::solve`, so it means
  nothing to `choupoBatch` or `choupoCtrl` — those carry their own campaign
  ledgers and their own utility allocation, and giving one meaning here that
  it does not have there would be worse than the current silence.  A batch
  case that declares one gets no error and no effect; making that a refusal
  needs a home for the block in the batch reader, which this slice does not
  build.
* **NOTHING CAN TELL THAT A PLANT *SHOULD* HAVE DECLARED ONE.**  A case that
  dilutes its own balance with an undeclared utility passes exactly as before,
  and the gate says so in its own "what this does not check".

## 9. The gate

`bin/curate/check_mass_closure.py`, EXTENDED rather than duplicated:

* it reads the PROCESS closure where one is published and the TOTAL otherwise,
  and its claim line says which it used and over how many cases;
* a REFUSAL arm builds four invalid declarations — supply == return, a service
  outside the catalogue, a supply that is not a boundary inlet, and a pair that
  does not conserve — in TEMPORARY COPIES of two corpus cases, and requires each
  to refuse AND to name why.  The shipped witness is valid, so without these
  probes the refusals would be a guard nothing tests.
* it never patches a source file and never rebuilds the engine (2026-08-18:
  only `check_gate_selftest` may take that shape).

**Two base cases, and the choice is load-bearing.**
`flash01_benzene_toluene` is the smallest case with the shape three probes
need: one boundary INLET and two boundary OUTLETS at ONE unit.  That shape is
also what makes the conservation probe possible at all — `supply feed; return
vapor;` is a pair at one unit that genuinely does not conserve, because the
liquid leaves too.  What it cannot offer is a VALID circuit, so a probe built
on it is distinguished only by its MESSAGE: strip one guard and another
refuses instead.  `ammonia02_full_plant` ships a valid declaration, so the
service probe spoils exactly one field of it and can be ACCEPTED at exit 0
when its guard is removed — the strongest form a probe takes.

Seven sabotages, recorded in the gate's own docstring beside the arms they
attack.  Three are worth repeating here:

* **S6 shows a gate can go on PASSING while its own claim goes false.**  With
  the gate reverted to reading the total closure only, everything still passed
  — and the process-scope count in its claim line silently fell from 1 to 0
  while a case was publishing one.  That is why the claim names the scope it
  used and counts the two separately.
* **S7 was intended as a negative and FAILED instead, correctly.**  Deleting
  the witness's `utilities` block left the service probe's spoiler matching
  nothing, and the arm refuses to file an unmodified run as evidence: *a
  spoiler that matches nothing proves nothing.*  A side effect worth knowing —
  the witness declaration can no longer be deleted in silence.
* **S1 and S3 land through the MESSAGE, not the exit code**, because a later
  guard catches the same probe once the one under test is gone.  A probe that
  asserted only a non-zero exit would have passed both.

## 9b. Found on the way, not fixed, and NOT this slice's

Running `check_energy_boundary_pinned` over the whole corpus (the suite runs
it from its cache; standalone it re-runs every case, which is why it is
rarely run that way) reports ONE failure:
`tutorials/steady/gibbs/gibbs06_h2_flame_radicals` publishes a
`globalEnergyBoundary` and its golden pins no `boundary global` row at all.

It is not caused by this slice, and that was CHECKED rather than assumed: the
gate as it stands at HEAD, unmodified, reports the same three lines against
this engine.  Nothing here touches the energy report, that case, or its
golden.  The remedy the gate itself names is `bin/runTests --record-append` on
that case — a golden write, which is RESERVED for Vítor.  Reported rather than
taken.

## 10. Rejected alternatives

* **A `reason` key.**  See constraint 2.  Rejected on the argument, not on
  taste.
* **A per-stream `utility true;` in `0/<stream>`.**  It is state, rewritten by
  `converged/`, and it declares an edge's role at neither of its ends.
* **A flag on the unit port.**  The producer rule, replaced 2026-09-07.
* **Reusing `category`.**  It answers a different question (§8) and carries no
  pairing, so nothing could be verified from it.
* **Replacing the total closure with the process one.**  The total scope is
  what the report has always published and is the honest number for a case
  that declares nothing; and a scope that silently changed meaning would be
  worse than the dilution it fixed.
