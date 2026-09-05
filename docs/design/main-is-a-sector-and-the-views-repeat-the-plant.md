# MAIN is a sector, and the views repeat the plant

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
design/          …/<unit>/<equipment>                          one specification sheet per item
internalStates/  …/<unit>/<kind>                               what happens INSIDE the equipment (written 2026-09-05)
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
0               where we started
converged       where we ended
design          how big the equipment is
internalStates  what happens inside it
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
