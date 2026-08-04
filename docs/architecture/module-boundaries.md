# Module boundaries — MEASURED, not yet ratified

> **STATUS: EVIDENCE, NOT AUTHORITY.**  This document reports the dependency
> graph the code actually has, measured from every `#include "..."` under
> `src/`.  It does **not** define the rule, because no document ever has, and
> inventing one retroactively would be the architecture emerging accidentally
> from the code — precisely what the governance principle forbids.
>
> Authority map: [`README.md`](README.md).  When Vítor rules on the questions
> at the end, this file becomes level 1 (a boundary contract) and grows a gate;
> until then it is a survey with an open finding list.

Reproduce with the snippet in §5.  Counts are include-site counts, not file
counts, and self-edges within a subsystem are excluded.

---

## 1. Why this document did not exist, and what that cost

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

## 2. The measured graph

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

## 3. Findings

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

## 4. The questions only the architect can answer

1. **May a `src/thermo/` component read the filesystem?**  `PitzerHMW`,
   `Database` and `EdwardsCatalogue` do.  Either that is the rule — thermo owns
   its own record resolution — or those three are violations and record access
   belongs behind an interface `core` or `io` provides.
2. **Does `SimulationResult` belong in `core`?**  It is the reason for three of
   the four `core`-reaches-up edges.  Moving it to its own `result/` subsystem
   would make `core` a true bottom layer at the cost of one rename.
3. **Are the three cycles ACCEPTED or SCHEDULED?**  Each needs a verdict:
   accepted-and-documented (with the reason recorded here) or entered in the
   debt register with a removal condition.
4. **Where does a SHARED helper live?**  Proposed (F4): below its lowest
   consumer, always — so a second consumer in a lower layer MOVES the helper
   rather than creating an upward edge.  This is the rule that would have
   placed `BalanceMath`, `ModelBoundaryAudit` and `rackettVliq` correctly on
   the day each was written.
5. **Is `CLAUDE.md` constitutional?**  It carries the "Things to NEVER do"
   list — the project philosophy — while the authority index places level-4
   documents as "derived DESCRIPTION of the contract, never its definition".
   Both statements cannot hold.

## 5. Reproducing the measurement

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
