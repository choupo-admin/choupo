# Module boundaries — the contract, and the measured state

> **AUTHORITY: LEVEL 1**, ratified 2026-08-04.  Authority map:
> [`README.md`](README.md).
>
> §1–§3 are the CONTRACT.  §4–§8 are the MEASUREMENT that produced it: the
> dependency graph the code actually has, from every `#include "..."` under
> `src/`.  The two are kept apart deliberately.  The measurement did not
> *become* the rule — three of its findings are recorded as **violations of the
> rule**, with removal conditions, rather than being blessed into it.  A
> boundary document that ratifies whatever the code happens to do is the
> architecture emerging accidentally from the code, which is the failure the
> governance principle names.

Reproduce with the snippet in §5.  Counts are include-site counts, not file
counts, and self-edges within a subsystem are excluded.

---

## 1. The layering

```
applications
   └─ outerDriver ─ postProcessing ─ reporting
        └─ result ─ io ─ unitOperations ─ propertyOps ─ control
             └─ thermo ─ streams ─ materials ─ solver
                  └─ core                       (the bottom: depends on nothing)
```

**A subsystem may depend downward and sideways within its band.  It may not
depend upward, and the graph must be acyclic.**  These are invariants I17 and
I18 in [`global-invariants.md`](global-invariants.md), and both are currently
violated by measured code (§5, §6) — stated as violations with removal
conditions, never as licence.

**Three placements, 2026-08-05, closing D1 and D6.**  The diagram above drew
five bands over twelve subsystems while `src/` held fourteen; `io` and
`curation` were simply absent, and `check_layering` reported them *unchecked,
not clean* rather than defaulting them into the bottom band where nothing can
violate.  A band is now declared for each, and `result` is the new home ruling
§7.2 gave `SimulationResult`:

* **`result`** (`SimulationResult`, `ResultEmitter`, `UnitProfile`) sits beside
  `unitOperations`.  It names what the pipeline produced, so it reads
  `streams` and `thermo`.
* **`io`** (`SolutionWriter`) sits beside `result`, because that is the only
  band left once the graph is measured: it *reads* `result`, and
  `unitOperations` *reads it*, and those two are the same band.
* **`curation`** (`AqueousGraph`) is **not in the stack at all** — see the
  tooling plane below.

**`io` was split, and a single `io` subsystem was the mistake.**  It briefly
held two unlike things: `SolutionWriter`, which interprets domain meaning (it
writes stream state per the stream-state contract), and `OdsWriter`, which is
generic mechanics — a spreadsheet container built on `core/MiniZip.H`, whose
header includes `<string>` and nothing else.  Generic mechanics sit low:
`OdsWriter` moved to `core`, beside the zip writer it was already using, and
`io` keeps only the domain half.  Lumping the two would have pinned a
filesystem primitive to whatever band the domain reader needed.

**THE TOOLING PLANE — `curation` sits beside the stack, not inside it.**  It
was first placed in band 1, beside `reporting`, on the argument that it has
reporting's shape: a consumer of the engine producing an artefact for a human.
That is true, and it is the wrong conclusion.  `curation` is not part of the
thermodynamic execution stack, and a *band* grants a permission it must never
have — "things at this level may reach sideways to you".  So it is a plane
with a rule strictly stronger than any band:

> **A tooling subsystem may read the runtime.  NOTHING in the runtime may read
> a tooling subsystem, at any band, sideways included.  Only `applications/`
> may join the two planes**, because a binary's `main` is where a tool is
> assembled and that is the only legitimate meeting point.

`check_layering` enforces it, and enforcing it required a fix worth naming: the
gate skips subsystems it has no band for, so with `curation` outside `BANDS`
the new rule could never have fired.  A check that cannot run must not pass —
the edge walk now covers the bands *and* the plane.

Each placement was checked the only way a placement can be: it introduces **no
new upward edge and no new cycle**, and `check_layering` now measures all
fifteen subsystems instead of excluding two.

**The first draft of this paragraph put `io` a band lower**, beside `streams`,
reasoning that `SolutionWriter` is the persistence face of the stream-state
contract — it writes `0/` and `converged/`.  That reads well and it is wrong:
the writer also reads the whole `SimulationResult`, so one band lower makes
`io → result` an upward edge.  Re-running the gate is what caught it, one
minute after the prose was written.  Worth recording, because the failure mode
is the one this document exists to prevent — **a placement argued from what a
subsystem is FOR, rather than measured from what it DEPENDS ON.**  The
narrative was about persistence; the include graph was about the result
record, and the include graph is what the compiler obeys.

## 2. Record resolution belongs to thermo — through ONE seam

*Ratified 2026-08-04, against an external proposal that `src/thermo/` must not
touch the filesystem.  That proposal is REJECTED, and the reasoning is recorded
because it is the kind that returns.*

`records::resolveRecord` is not filesystem access.  It is **seal-aware
provenance resolution**: under `sealed true;` it deliberately refuses the
installation catalogue so that a case reproduces from its own closure.  *Which
parameterisation is in force* is a thermodynamic question, and a layer that
does not know thermodynamics cannot answer it.

Three reasons the general advice fails here:

1. Moving resolution out relocates a thermo DECISION to a layer that cannot
   make it.
2. It relitigates a closed decision — exact-name `components/<name>.dat`
   lookup, settled 2026-06-07, O(1), no startup directory walk
   ([`project-philosophy.md`](project-philosophy.md) §5).
3. Decisively: an ingestion boundary would need to know, ahead of time, every
   record every model might read.  That is exactly the dependency-closure
   problem that produced the 2026-08-04 sealing defect — a new activity model's
   parameter home was unknown to the importer, so the sealed case kept 9 of its
   28 pair parameters and still ran, still converged, and silently answered as a
   different model.  The proposal moves that problem one layer up and makes it
   harder: thermo knows what it needs; an ingestion layer must guess.

**The defect underneath is ARITY, not layering.**  Record resolution has three
independent implementations and no declared contract, so `bin/choupo-import`
must know each separately.  The rule:

> **Thermo owns record resolution, through exactly one seam
> (`records::resolveRecord`), and a model must be able to DECLARE which records
> it consumes, so the sealing closure asks instead of guessing.**

`PitzerHMW`, `EdwardsCatalogue` and `Database` are conformant under this rule.
The declarable-consumption half is not built; it is debt D3 in §8, and until it
exists every new record home must be added to the importer's closure in the
same commit that introduces it.

## 3. Where shared logic lives

*Ratified 2026-08-04.  Supersedes the weaker "below its lowest consumer" I
first proposed, which would have dragged reporting vocabulary into `core`.*

> **Shared logic goes to the lowest NEUTRAL layer that can own its concepts
> without acquiring upward dependencies.**

The word doing the work is *neutral*.  Do not mechanically move a
reporting-domain concept downward because a lower consumer wants a piece of it
— **extract the genuinely neutral calculation or model instead**, and leave the
domain concern where it belongs.  A second consumer in a lower layer is a
signal that a neutral calculation is buried inside a domain helper, not that
the domain helper is in the wrong place.

Applied to the three sites measured in §7:

| helper | verdict |
|---|---|
| `missingEnthalpyData` | The calculation is `thermo.hasEnthalpyDatum(i)` over present species — a **thermo query wearing a reporting jacket**.  Extracts downward whole. |
| `ModelBoundaryAudit` | **Splits.**  `ΔH = H_down(T,P,z) − H_up(T,P,z)` at one state is neutral thermo; formatting and printing it stay in `reporting`. |
| `closures::rackettVliq` | A thermo correlation misplaced in `propertyOps`.  Moves outright — and `DerivedClosures.H` already documents this answer for its own `AmbroseWalton` entry ("runtime and estimator share ONE implementation"), so the file contradicts itself today. |

---

# The measurement

## 4. Why this document did not exist, and what that cost

Of the eight constitutional documents, module boundaries was the only one with
**zero coverage** — no document anywhere states which subsystem may depend on
which.  The cost is not hypothetical.  Adding `EdwardsCatalogue.cpp` on
2026-08-04 required deciding whether a `src/thermo/` component may read the
filesystem.  It may, in practice: `PitzerHMW`, `Database` and now
`EdwardsCatalogue` all do.  But that was settled by *imitation* — the new file
copied what the neighbouring file did — and a paragraph was written into its
header justifying the split.

That is exactly how erosion works.  Every individual decision is defensible,
no document is contradicted, and the boundary moves anyway.

## 5. The measured graph

Subsystems under `src/`, by file count:

| subsystem | files | | subsystem | files |
|---|---:|---|---|---:|
| `unitOperations` | 175 | | `reporting` | 31 |
| `thermo` | 164 | | `solver` | 27 |
| `propertyOps` | 70 | | `outerDriver` | 15 |
| `core` | 32 | | `applications` | 12 |
| `postProcessing` | 32 | | `control` | 12 |
| | | | `streams` | 12 |
| | | | `materials` | 3 |
| | | | `curation`, `io` | 2 each |

The dominant edges are exactly what the layering in
[`CHOUPO-CONSTITUTION.md`](CHOUPO-CONSTITUTION.md) §5 implies:
`unitOperations -> thermo` (154), `thermo -> core` (116),
`unitOperations -> core` (96), `applications -> thermo` (93),
`propertyOps -> thermo` (75).  The spine is sound.

## 6. Findings

The layering the existing documents *imply* — never state — is:

```
applications
   └─ outerDriver ─ postProcessing ─ reporting
        └─ unitOperations ─ propertyOps ─ control
             └─ thermo ─ streams ─ materials ─ solver
                  └─ core                       (the bottom: depends on nothing)
```

Measured against that, four findings.

### F1 — `core` reaches UP, in three places

A bottom layer that includes its dependents is not a bottom layer.

| site | includes |
|---|---|
| `core/SimulationResult.H:50` | `streams/ProcessStream.H` |
| `core/SimulationResult.H:51` | `thermo/SaturationCurves.H` |
| `core/SimulationResult.H:52` | `unitOperations/UnitProfile.H` |
| `core/ResultEmitter.cpp:30` | `thermo/SealCheck.H` |

Three of the four are one file, and it is the obvious suspect: a
`SimulationResult` is the *output* of the whole pipeline, so it names the
things the pipeline produced.  The header already shows the author noticing —
`UnitProfile.H` carries the inline comment *"profiles only — never the unit-op
hierarchy (build hygiene)"*, which is a boundary rule written in a comment
because there was nowhere else to write it.

This is arguably not erosion at all but a **misplacement**: `SimulationResult`
may simply not belong in `core`.  That is a question, not a defect, and it is
in §4.

### F2 — three dependency CYCLES

| cycle | sites |
|---|---|
| `solver` ↔ `thermo` | `solver/StabilityTest.H:67` -> `thermo/phase/Phase.H`; `thermo/SaturationCurves.cpp`, `thermo/electrolyte/ReactiveVLE.cpp`, `thermo/electrolyte/SpeciationSolver.cpp` -> `solver/` |
| `unitOperations` ↔ `propertyOps` | `unitOperations/separation/IonExchanger.cpp:32` -> `propertyOps/Exchange.H`; 9 edges back |
| `reporting` ↔ `postProcessing` | `reporting/{Economics,Design}Report.cpp:30` -> `postProcessing/PostProcessor.H`; `postProcessing/EconomicsPass.cpp:32` -> `reporting/OdsWriter.H` |

Each has a plausible story.  Michelsen's stability test *is* a thermodynamic
criterion solved by a numerical method, so `solver` ↔ `thermo` may be
irreducible.  `IonExchanger` reusing `propertyOps::readExchange` avoids a
second parser for one declaration — the arity doctrine argues *for* it.  And a
costing pass writing a spreadsheet is a pass using a writer.

Plausible is not the same as intended.  A cycle means neither subsystem can be
understood, tested or replaced without the other, and three of them means the
"layers" are three fewer than the diagram claims.

### F3 — `../` escapes out of the include convention

Thirteen sites use relative `../` includes instead of the subsystem-rooted
form, and **eight of them cross a subsystem boundary**.  The two kinds are not
equally bad: `../LU.H` (in `src/solver/ODE/`) stays *inside* its own subsystem
and is cosmetic, while `../thermo/Database.H` (in `src/curation/`) crosses one
— a boundary crossing written in a form that no grep for
`#include "thermo/` will find.

The second kind matters because it makes the boundary **unmeasurable by the
obvious method** — which is how a survey like this one silently
under-reports.

### F4 — the shared-helper pattern: a lower layer reaching up for arity-1

I first flagged `unitOperations -> reporting` as an edge with no story.  Reading
the three sites, there IS a story, it is the same one each time, and it is more
interesting than a violation:

| site | includes | for |
|---|---|---|
| `unitOperations/flowsheet/Flowsheet.cpp:35` | `reporting/BalanceMath.H` | `missingEnthalpyData` — naming the no-datum species |
| `unitOperations/flowsheet/Flowsheet.cpp:36` | `reporting/ModelBoundaryAudit.H` | the H-jump audit at a model boundary |
| `thermo/ThermoPackage.cpp:59` | `propertyOps/DerivedClosures.H` | `closures::rackettVliq` — the liquid molar volume |

Each is a **shared helper placed in the higher layer**.  `BalanceMath.H` says so
in its own header: *"so the CSV writers and the ODS spreadsheet report compute
identical numbers from one source of truth"* — it exists to satisfy the ARITY
doctrine, one home per derived fact.  Then a second consumer appeared in a lower
layer, and the only way to keep arity-1 was to reach up.

So two doctrines collide here, and the project has written down only one of
them.  Arity-1 says *do not copy the helper down*.  Layering says *do not depend
upward*.  Both are right; the resolution neither document states is that
**shared code sinks to below its lowest consumer** — `BalanceMath` and
`ModelBoundaryAudit` belong under `core` (or a `balance/` of their own), and
`rackettVliq` belongs in `thermo`, where the other correlations already live.

That resolution is a decision, not an observation, so it is question 5 below.
What is observable is that all three edges have the same cause, which makes
this the cheapest of the four findings to fix and the most likely to recur:
every future shared helper will land in whichever layer its FIRST consumer
happened to be in.

## 7. What the rulings settled

All five questions this audit raised were ruled on 2026-08-04.

| # | question | ruling |
|---|---|---|
| 1 | May `src/thermo/` read the filesystem? | **Yes, through one seam.**  §2 — the proposal to forbid it was rejected; the real defect is arity. |
| 2 | Does `SimulationResult` belong in `core`? | **No.**  It is the pipeline's OUTPUT and names what the pipeline produced; it is the cause of three of the four `core`-reaches-up edges.  Moves to its own `result/` band above `core`.  Debt D1. |
| 3 | Are the three cycles accepted or scheduled? | **`solver` ↔ `thermo`: ACCEPTED and documented** — Michelsen's stability test is a thermodynamic criterion solved numerically, and the dependency is irreducible without a worse abstraction.  **The other two: SCHEDULED.**  Debt D2. |
| 4 | Where does a shared helper live? | §3, with the neutrality refinement. |
| 5 | Is `CLAUDE.md` constitutional? | **No.**  The binding rules moved to [`project-philosophy.md`](project-philosophy.md); `CLAUDE.md` references and defines nothing. |

## 8. Debt register — the violations this contract creates

Ratifying §1 makes three measured facts into violations.  They are entered
here with removal conditions rather than being smoothed into the rule.

**D1 — `core` reaches up (F1, THREE sites).  PAID 2026-08-05.**  Measuring the
header showed *why* it reached up, and it was not the reason the ruling
assumed.  `core/SimulationResult.H` declared TWO different things: the result
record — which necessarily reads `streams`, `thermo` and `unitOperations` —
and `FlatUnit`, four strings of pure topology that read nothing.  Because they
shared a header, `core` inherited the first one's dependencies, and
`streams/StreamOwnership.H` was paying that entire bill to obtain four strings.
`SimulationResult` and `ResultEmitter` moved to the new `result/` band per
ruling §7.2; `FlatUnit` stayed in `core/FlatUnit.H`, where it always belonged.
`core` now includes nothing but `core/`.

**D2 — two scheduled cycles (F2).  PAID 2026-08-05, both.**  Each was ONE
shared concept filed inside one of its two consumers, and each was paid by
§3's rule — the lowest NEUTRAL layer that can own it:

* `unitOperations` ↔ `propertyOps`: `readExchange` reads the `exchange {}`
  block into a speciation input, and a props BENCH and a process UNIT both
  need it.  It was in `namespace propertyOps`; it is now
  `thermo/electrolyte/ExchangeInput.H`, per §2 (record resolution belongs to
  thermo).  The extraction *confirmed* neutrality rather than assuming it —
  the moved code referenced no `propertyOps` symbol at all.
* `reporting` ↔ `postProcessing`: `OdsWriter` is a spreadsheet serialiser
  whose header includes `<string>` and whose body includes `core/MiniZip.H`.
  It moved to `io`, below both consumers.

A third cycle appeared and was paid in the same pass: moving `SimulationResult`
into `result/` left it including `unitOperations/UnitProfile.H` while
`unitOperations` included it back.  A profile is something the pipeline
PRODUCED, so `UnitProfile.H` moved to `result/` too.  `solver` ↔ `thermo`
stays, ACCEPTED per ruling §7.3.

**D3 — a model cannot declare what it consumes (§2).  HALF PAID 2026-08-05: the resolver seam now carries a CONSUMPTION LEDGER, and `bin/choupo-import` refuses an under-staged seal by name — verified by reproducing the Edwards defect, which it catches earlier than the golden did.  The observation half is done; the DECLARATION half (shape (b)) is not, so the hand-written closure stays.**  Until it can, the
sealing closure must be taught each new record home by hand.  *Removal
condition:* a model declares its record dependencies, `bin/choupo-import`
enumerates them, and the closure stops being a hand-maintained list.  This is
the debt that produced the 2026-08-04 sealing defect and will produce the next
one.

**IT DID, TWICE, ON 2026-08-05.**  Five sealed cases stayed blind to a new
`reviewStatus` field and two to a corrected `Trange` until a human knew to
re-import them.  Neither is a defect in the seal — a snapshot is supposed to
be a snapshot — but both needed someone to know WHICH cases, which is the
same missing link seen from the other end.  The closure is **21 hand-written
`want(...)` calls** today.  Proposal, awaiting a ruling:
[`model-declared-record-homes.md`](../design/model-declared-record-homes.md)
— two shapes weighed, one recommended, and a named half it does NOT solve.
**This is the one remaining debt in this register that is blocked on a
decision rather than on work.**

**D4 — NINE boundary-crossing `../` includes (F3 said eight).  PAID
2026-08-05.**  Eight were rewritten to their subsystem-rooted form
(`"core/Identifiers.H"`, not `"../../core/Identifiers.H"`), which `-Isrc`
already made valid.  The ninth was the different animal named below —
`core/Banner.cpp` reaching into the generated tree — and it is gone too:
`-I.` puts the project root on the include path, so `generated/gitVersion.H`
is reachable by its own rooted name.  That mattered more than tidiness: **a
rule with a named exception is weaker than a rule.**  The contract is now
simply *no `../` include leaves its own subsystem*, and the four that remain
(`solver/ODE` → `../LU.H`, `membrane/transport` → `../osmotic/`) stay inside
one, which is legal and always was.

**D5 — PAID 2026-08-05: the gate ASSERTS I17.**
`check_layering` pins the measured violations, so a NEW upward edge or cycle
fails while the known ones remain declared.  It shipped pinning five upward
edges and eight cycles; **four of the five and six of the eight are now gone**,
and the gate's own stale-pin arm is what proved each removal real — deleting a
pin whose violation still existed would have failed.
D7 was paid the same day, the last upward pin is deleted, and the gate now
asserts instead of bounding.
**I19 is a separate case and will not get a gate.**  "The lowest NEUTRAL layer
that can own its concepts" is a judgement about meaning, not a measurable
property of an include graph.  Saying so is better than leaving it implied.

**D6 — `io` and `curation` have no declared band.  PAID 2026-08-05.**  Both are
placed in §1, and `check_layering` measures all fifteen subsystems with nothing
excluded.  The placements were derived from the graph, not argued from purpose
— see the note in §1 about the draft that got `io` wrong by reasoning about
what it is *for*.

**D7 — `unitOperations` → `reporting`, the last upward edge.  PAID
2026-08-05, in two halves that were different problems.**

*First half:* `missingEnthalpyData`, one symbol out of `BalanceMath.H`.  The
debt was first recorded claiming the blocker was that `BalanceMath` needs a
flash to price a two-phase enthalpy — true of the header, irrelevant, because
`Flowsheet` never used that part.  **An edge is a dependency on what is USED,
not on the file it arrived in.**  §3 had already ruled the function "a thermo
query wearing a reporting jacket"; it moved to `thermo/EnthalpyDatum.H`.  Its
first signature took a `ProcessStream&`, compiled, and created a `thermo` ↔
`streams` cycle that had never existed — the gate failed on the next run, and
the fix was to pass the two composition vectors, because a thermo query has no
business knowing what a stream *is*.

*Second half:* `ModelBoundaryAudit`, which needed a **decision about where a
finding record lives** — the engine produces it, the result carries it, and
filed only with the result it sat in band 2 where nothing below could name it.

Settled against DWSIM rather than argued from taste, and that repository gave
both halves of the answer.  `DWSIM.Interfaces` has **zero** project
references — a pure contracts assembly at the bottom, which is what `core` is
here.  And `DWSIM.FlowsheetSolver` references `DWSIM.Inspector`, whose same
assembly holds `Window.vb` (`Imports System.Windows.Forms`) and references
`DWSIM.Controls.DockPanel` — so **DWSIM's flowsheet solver has a compile-time
path to a docking-panel GUI toolkit**, because the diagnostics subsystem was
allowed to own its own presentation and the solver had to reach it.  That is
the mature form of the defect Choupo had.

So: the eight plain records moved to `core/ResultRecords.H` (all verified pure
data), and the AUDIT moved to `unitOperations/flowsheet/` beside its only
consumer — the engine computes and announces, `reporting` draws afterwards
from `result.modelBoundaries`.  §3's "it splits" verdict rested on an
assumption the measurement contradicted: both halves have one caller,
`Flowsheet`, and none in `reporting` at all.
Full record: [`where-a-finding-record-lives.md`](../design/where-a-finding-record-lives.md).

**I17 IS NOW ASSERTED, NOT BOUNDED.**  `PINNED_UP` is empty: there is no upward
edge in the runtime graph and no pin excusing one.  I18 is asserted up to the
single ACCEPTED `solver` ↔ `thermo` cycle (§7.3), which stays in the pin list
rather than being silently tolerated, so the stale-pin arm still covers it —
an acceptance that outlives its subject is a licence.  Four sabotages verify
it: a new upward edge, a runtime subsystem reading a tool, the accepted cycle
vanishing, and a new subsystem with no declared band.

## 9. Reproducing the measurement

```python
import re, collections
from pathlib import Path
SRC = Path("src")
top = lambda p: p.relative_to(SRC).parts[0]
edges = collections.Counter()
for f in SRC.rglob("*"):
    if f.suffix not in (".H", ".cpp"): continue
    a = top(f)
    for m in re.finditer(r'#include\s+"([^"]+)"', f.read_text()):
        cand = SRC / m.group(1)
        b = top(cand) if cand.exists() else a
        if b != a: edges[(a, b)] += 1
for (a, b), n in sorted(edges.items(), key=lambda x: -x[1]):
    print(f"{a:<18} -> {b:<18} {n}")
```

Note what this snippet CANNOT see, per F3: a `../`-relative include that
crosses a subsystem.  A boundary gate built on this method must resolve those
first, or it will report a clean graph over a dirty one.

---

## Measured again, by a gate this time (2026-08-05)

`bin/curate/check_layering.py` walks the include graph on every suite run.
Its first run disagreed with the hand measurement of 2026-08-04 recorded in
F1/F2 above, and the hand count was the one that was short:

| | hand-counted (F1/F2) | measured by the gate |
|---|---|---|
| upward edges | 3 (all from `core`) | **5** — also `thermo` → `propertyOps`, `unitOperations` → `reporting` |
| cycles | 3 | **8** |

Five of the eight cycles are the upward edges seen from the other side —
`core` includes `streams` *and* `streams` includes `core`. That is one defect
describable two ways, and it is listed under both because it violates two
different invariants (I17 and I18); a gate reporting only one would let the
other regress unnoticed.

**Two subsystems are absent from the layering in §1 entirely: `io` and
`curation`.** The diagram draws five bands over twelve subsystems and `src/`
holds fourteen. They are excluded from both checks and reported as
**unchecked, not clean** — placing a subsystem is an architecture decision,
and a gate that guessed would become the author of the layering it checks.

### D6 — `io` and `curation` have no declared band

*Removal condition:* §1 places both, with the same care as the other twelve,
and `check_layering` moves them from its unplaced list into `BANDS`.

**This is the third hand-compiled count corrected by a gate on 2026-08-05** —
after the species-citation list (17 named, 18 found) and the founding-decision
index (5 claimed, 2 real). Same cause each time: *a measurement taken once and
then remembered is a derived fact with a second home.* A gate recounts.

### The `../` counts, separated (2026-08-05)

D4's number moved because two different things were being counted together.
Of thirteen `../` includes in `src/`:

- **nine CROSS a subsystem** — the ones D4 is about;
- **four stay INSIDE one** (`solver/ODE` → `../LU.H`,
  `unitOperations/membrane/transport` → `../osmotic/`) and are legal.

One of the nine is a different animal again: `core/Banner.cpp` →
`../../generated/gitVersion.H` leaves `src/` entirely, into the generated
tree. It is named here rather than folded into the subsystem count.

**`check_layering` shipped with a blind spot and it is now fixed.** The first
version mapped an include with `inc.split("/")[0]`, which for `"../thermo/..."`
yields `".."` — not a subsystem, so the edge was silently dropped and all nine
were invisible. That is exactly the defect D4 exists to remove, committed by
the gate written to measure it. No upward edge was hidden on the day (the nine
resolve downward), but a `../` include *can* be upward. Sabotage-verified: a
`../`-form upward include now fails the gate, and did not before.
