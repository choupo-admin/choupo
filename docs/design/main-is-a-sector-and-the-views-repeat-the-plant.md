# MAIN is a sector, and the views repeat the plant

> **THE TITLE IS NOW PARTLY FALSE, and §9 says so.**  `MAIN/` is the DOMAIN'S
> OWN LEVEL, not a sector like the others (amended 2026-09-07).  Everything
> else this record rules still stands; read §9 before §2.
>
> **STATUS: CONVENTION + FINDING, executed 2026-09-05.**  Level 3 (deep
> reference under the stream-state architecture); the governing document is
> [`../architecture/stream-state-architecture.md`](../architecture/stream-state-architecture.md) §2.
> Vítor brought the reading from a ChatGPT discussion of the flagship's full
> directory tree; the decision is mine, and the consequence below was
> predicted before it was tried.

---

## 1. What the flagship's own header said, and what its root did

`ChemicalPlantTutorial/system/flowsheetDict` declares a naming convention —
*SECTORS in CAPS, Units in PascalCase, Streams in PascalCase, Components in
lowercase* — and then lists `sectors ( JuiceSplitter CONCENTRATION DRYING
FERMENTATION )`: a PascalCase unit folder at the plant root beside three
CAPS sector folders.  In the Case tree, and in `0/` and `converged/`, that
put three plant-level streams (`RawJuice`, `ToConcentration`,
`ToFermentation`) at the root beside the sector folders, so a student read
four kinds of thing at one level: dicts, a unit, sectors, streams.

## 2. The convention

**In a fractal case, a folder in CAPS is always a SECTOR, and a plant-level
unit lives in one — conventionally `MAIN/`.**  The plant's geography is then
one list, `MAIN · CONCENTRATION · DRYING · FERMENTATION`, and every VIEW of
the case repeats it:

```
0/               MAIN/ CONCENTRATION/ DRYING/ FERMENTATION/   the state before solving (authored)
converged/       MAIN/ CONCENTRATION/ DRYING/ FERMENTATION/   the steady solution
   …/<stream>    a FILE in a state view is a STREAM   — the boundary of the snapshot
   …/internalStates/<SECTOR>/<unit>  a UNIT'S INTERIOR: one file per unit, under its own root (2026-09-06)
design/          …/<unit>/<equipment>                          one specification sheet per item
iterations/      numerical history — how the solver got there, never physical time
postProcessing/  the reports derived from the result
```

with `system/` (HOW this level is solved) and `constant/` (WITH WHAT physics
and data) at every level of the fractal — the plant, a sector, a unit — and
never inside the geography.  The nine-line language a student learns:

```
constant        what we know
system          how we solve
MAIN/SECTORS    where we are in the plant
0               where we started (streams, and what is inside each unit)
converged       where we ended   (the same two halves, solved)
design          how big the equipment is
iterations      how the solver got there
postProcessing  what we report
```

## 3. What fell out of the existing rule, with no new rule

The engine already owns stream state by the top-level sector of the unit
that produces (or, for a plant inlet, consumes) a stream
(`SolutionWriter::sectorOf`).  Moving `JuiceSplitter/` into `MAIN/` moved
`RawJuice`, `ToConcentration` and `ToFermentation` into `0/MAIN/` and
`converged/MAIN/` by that rule alone — `choupo-lint` named the three
MISSING and three ORPHAN files before the run, and the golden passed
unchanged after the move (no unit the golden pins changed its name; the
splitter pins nothing).  `check_sector_hierarchy` reads the `sectors ( … )`
list and decides leaf vs composite by the presence of `type`, so it counted
four declared sectors without being told.  **The architecture already
wanted this convention; the case was the one not following it.**

## 4. Rejected

* **Forcing `MAIN/` on flat cases.**  A single flash is a `flowsheetDict` of
  length 1 and its units ARE the plant; the constitution forbids a mass
  migration of the ~400 flat tutorials, and the 2026-09-04 ruling that
  *empty is not a sector called root* stands: a flat case gains no key, no
  banner, no folder.
* **The engine inferring "sector" from capital letters.**  Kind comes from
  the dictionary's structure (a member with `type` is a leaf); the name is a
  convention for humans, and reading it back would be name identity.
* **A synthetic `MAIN` the GUI invents** for plant-level units the author did
  not place in one — the tree draws the disk.

## 5. Not verified, said plainly

Whether real students find the regular geography easier — the argument is
the reviewer's three imagined readers and one shared reading of the tree,
not a measurement.  The four-task exercise proposed to Vítor (find the
fermentor's declared volume; the converged temperature of `Out`; Evap2's
sized area; which files the next run overwrites) is how it would be measured.

---

## 8.  AMENDED 2026-09-06 — the views carry the units' INTERIORS too

`internalStates/`, listed above as a view of its own the day this record was
written, was RETIRED one day later.  It was the wrong neighbour: `design/` is
a DERIVATIVE (equipment sizing computed from the answer) and a stage profile
is STATE, so a unit's interior belongs INSIDE the view that holds the streams
it sits between — `0/internalStates/<SECTOR>/<unit>` and
`converged/internalStates/<SECTOR>/<unit>`, ONE file per unit with one block
per kind (amended the same day, task #105: a directory per unit beside the
stream files lasted one morning).

**Nothing in this record's ruling changed.**  A CAPS folder is still always a
sector, a plant-level unit still lives in one, every view still repeats the
one geography, and `system/`/`constant/` still sit at every level and never
inside it.  What changed is what a view holds at the END of that geography:
the stream files, flat, and — under the view's own `internalStates/`, which
repeats the geography once more — one file per unit.  The reading, in one
line: the view shows the boundary directly; the interior is namespaced inside
the same view.  The eight-line language above is the nine-line one with the
retired top-level view removed and `0/` told what it now carries.

Record:
[`a-state-directory-is-a-restartable-snapshot.md`](a-state-directory-is-a-restartable-snapshot.md).

---

## 9.  AMENDED 2026-09-07 — `MAIN/` is the domain's own LEVEL, not a sector

§2 above says *a folder in CAPS is always a SECTOR, and a plant-level unit
lives in one — conventionally `MAIN/`*.  On 2026-09-07 Vítor proposed replacing
the stream-ownership rule of 2026-07-06: **a stream's state file lives at the
LOWEST LEVEL of the case whose subtree contains EVERY ENDPOINT of that stream**
(record:
[`a-stream-belongs-to-the-graph-that-contains-both-ends.md`](a-stream-belongs-to-the-graph-that-contains-both-ends.md)).
His text put the streams that cross two sectors in `MAIN/`.

Taken literally that would make `MAIN` mean TWO things at once — a sector
holding units, and the plant level holding the edges BETWEEN sectors — which is
the name-with-two-meanings defect this project hunts everywhere else.  **The
resolution is the architect's, and it is recorded as an amendment rather than
as part of the proposal: `MAIN/` IS THE DOMAIN'S OWN LEVEL.**  Plant-level
UNITS live there, exactly as §2 ruled and with nothing changed about how they
get there; plant-level STREAMS live there too, which is new.  One meaning: *the
level of the plant itself*, and both kinds of thing that belong to the plant
itself sit in it.

**REJECTED, and it is worth saying why**: putting the crossing streams loose at
the view ROOT, beside the sector folders.  That is precisely the mixed level §1
describes and §2 was adopted to remove — four kinds of thing at one level — and
the auditor found `sugarPlantEconomicsSweep` still in it, with `RawJuice`,
`ToConcentration` and `ToFermentation` loose in `0/`.  Those three moved into
`0/MAIN/` with the rest.

**What §3 of this record predicted is now half retired, and the half that
retired is the interesting one.**  §3 says the convention *fell out of the
existing rule with no new rule*, because the engine owned stream state by the
producing unit's sector.  That rule is the one replaced.  What falls out of the
NEW rule is stronger and needs no coincidence: a plant-level unit's streams are
at the plant level because that is where their endpoints are, and so are the
plant's inlets and the sector crossings.  The geography a view repeats is
unchanged — `MAIN · CONCENTRATION · DRYING · FERMENTATION` — and `MAIN/` is now
the first name in it for a reason rather than by convention alone.

§4's rejections all stand: no `MAIN/` is forced on a flat case (its units ARE
the plant, and its state files stay flat at the view root), the engine still
never infers "sector" from capital letters, and the GUI still draws the disk.
