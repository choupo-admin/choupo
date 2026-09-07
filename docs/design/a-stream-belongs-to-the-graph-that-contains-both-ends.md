# A stream belongs to the graph that contains both its ends

> **STATUS: ADR — REPLACEMENT of a ratified rule, executed 2026-09-07.**
> Level 3 (deep reference); the governing document is
> [`../architecture/stream-state-architecture.md`](../architecture/stream-state-architecture.md)
> §2.4, which this record rewrites.
>
> **The ontological argument and the rule are VÍTOR'S**, proposed on
> 2026-09-07 after he could not find the inter-sector streams of his own
> flagship plant.  **The `MAIN` amendment in §3 is the architect's**, and it is
> marked as such because it changes what his text said, not merely how it is
> implemented.
>
> This REPLACES the ownership rule ratified on 2026-07-06.  It is not a
> correction of a bug: the old rule did exactly what it said, and what it said
> was wrong about what a stream is.

---

## 1. The rule that was replaced, and why it was not a bug

Since 2026-07-06 §2.4 read:

> an internal or inter-sector stream belongs to its PRODUCING sector; an
> external inlet belongs to its CONSUMING sector; an external outlet belongs to
> its PRODUCING sector.

Four clauses, and every one of them picks **one endpoint of an edge and calls
it the owner**.  That is a choice, not a mistake, and it was made for a
concrete reason recorded at the time: drill-in.  Opening CONCENTRATION alone
needs `Magma` in CONCENTRATION's own `0/`, and filing the stream with its
producer put it there for free.

Vítor's argument is that the choice is wrong about the object:

> A unit is a NODE and belongs to a sector.  A stream is an EDGE, and an edge
> between two subgraphs belongs to neither — it belongs to the graph that
> contains both.

The failure that raised it is concrete and is the reason this is a replacement
rather than a debate: the flagship's `Magma` runs CONCENTRATION → DRYING and
was filed at `0/CONCENTRATION/Magma`, inside one of its two endpoints, where
the plant's own maintainer looked for it and did not find it.

## 2. The rule

> **A stream's state file lives at the LOWEST LEVEL of the case whose subtree
> contains EVERY ENDPOINT of that stream.**

One sentence replacing four, recursive, with no case analysis:

* internal to a sector → that sector;
* crossing two sectors → their common parent;
* a plant-boundary inlet → the plant's own level;
* shared by consumers in several sectors → their lowest common ancestor.

It applies unchanged at any fractal depth.  Implementation:
`src/streams/StreamOwnership.H` — the endpoints are the units that produce or
consume the stream, each contributing its STAMPED sector chain
(`FlatUnit::sector`, never a substring of a name), plus the DOMAIN BOUNDARY
contributing the empty chain when nobody in the case produces the stream; the
level is the longest common dotted-segment prefix of those chains.

## 3. THE AMENDMENT (the architect's) — `MAIN/` is the domain's own level

Vítor's text puts the crossing streams in `MAIN/`.  Taken literally that makes
`MAIN` mean TWO things: a sector holding units (the 2026-09-05 convention) and
the plant level holding the edges between sectors.  A name with two meanings is
the defect this project hunts everywhere else.

**RESOLUTION: `MAIN/` IS THE DOMAIN'S OWN LEVEL, not a sector like the
others.**  Plant-level UNITS live there — unchanged, exactly as 2026-09-05
ruled — and plant-level STREAMS live there, which is new.  One meaning: *the
level of the plant itself*.  A FLAT case has no geography at all (its units ARE
the plant), so the domain's own level is the view root and its state files stay
flat; nothing about a flat case changes.
[`main-is-a-sector-and-the-views-repeat-the-plant.md`](main-is-a-sector-and-the-views-repeat-the-plant.md)
§9 carries the amendment beside the convention it amends, and its title is
marked partly false in its own header.

**REJECTED**: putting the crossing streams loose at the view ROOT, beside the
sector folders.  That is the mixed level the 2026-09-05 convention was adopted
to remove — dicts, sectors and streams at one level — and the auditor found
`sugarPlantEconomicsSweep` still in it.  Its three loose files moved into
`0/MAIN/` with the rest.

## 4. A plant OUTLET does not rise, and the asymmetry is in the grammar

A plant INLET is a stream the plant DECLARES: `PlantSteam { to
CONCENTRATION/Steam; }` — the identity is `PlantSteam`, a name at the plant's
own level, and CONCENTRATION's `Steam` is a port.  So the domain boundary is a
genuine second endpoint and the file rises to `0/MAIN/PlantSteam`.

A plant OUTLET is the opposite shape: `Powder { from DRYING/DryPowder; }` — the
identity is `DRYING.DryPowder`, and `Powder` is a LABEL.  §2.4's own alias rule
already says a boundary alias is a label, not a second state file.  So the
product stays with the sector that owns the identity.

This was **measured before it was argued.**  Read symmetrically — every plant
outlet rising to the domain level too — the flagship's `DRYING.Vapour` (labelled
`DryerVapour`) and `FERMENTATION.Vapour` (labelled `EthanolVapour`) would both
resolve to `MAIN/Vapour`: one canonical file for two streams, which
`StreamOwnership::canonicalManifest` refuses by construction, naming both IDs.
The literal reading of "a plant boundary inlet/outlet → the plant's own level"
is therefore not implementable without also changing what a boundary alias is,
which nothing here authorises.  **Recorded as a doubt rather than settled
silently**: if a future case wants its products at the plant level, what has to
be decided first is whether the plant's LABEL becomes the file's name.

## 5. What moved (M1), measured before anything was touched

Produced by the engine's own `--manifest`, one row per graph stream, against
the tree as it stood:

| case | streams | moved | unchanged |
|---|---|---|---|
| `plant/ChemicalPlantTutorial` | 25 | **4** | 21 |
| `plant/esterification2sector` | 4 | 2 | 2 |
| `plant/lithiumBrinePlant` | 15 | 7 | 8 |
| `plant/sugarPlantEconomicsSweep` | 25 | 7 | 18 |
| `steady/flowsheets/plant01_two_sectors` | 5 | 2 | 3 |
| `steady/flowsheets/plant02_basename_twins` | 4 | 2 | 2 |
| `steady/flowsheets/composite01_two_flashes` (flat) | 5 | **0** | 5 |
| `plant/hda` (flat) | 10 | **0** | 10 |

**24 files moved; 69 stayed; every flat case is untouched.**  The flagship's
four are `0/CONCENTRATION/PlantSteam`, `0/DRYING/DryingAir`, `0/DRYING/BdAir`
(three plant inlets) and `0/CONCENTRATION/Magma` (the crossing) → `0/MAIN/`;
the three streams already in `MAIN/` stay.  `esterification2sector`'s
`0/REACTION/` and `lithiumBrinePlant`'s `0/CARBONATION/` and `0/HOTAIR/` become
empty and disappear — every stream those sectors touch either crosses or enters
from outside.

**PATHS MOVED; NUMBERS DID NOT**, and that was proved rather than argued.  Every
one of the twelve cases run before and after produced a **byte-identical
stdout**, and every artefact — `converged/` contents, `design/`, `economics/`,
every report CSV — is byte-identical too.  The only differences anywhere are
(i) the locations of the 24 files and (ii) the `sector` COLUMN of
`streamTable.csv` on sectored cases, described in §7.

## 6. M2 — the instability, measured, and why it is not a veto

The level is a function of the WHOLE topology, so **adding one consumer in
another sector moves a file that was written correctly yesterday.**  That is
inherent to the rule, not an accident of this corpus, and it was measured
before the rule was adopted:

| | streams |
|---|---|
| already at the domain level (cannot rise further) | 27 |
| at a sector level — ONE cross-sector edge from rising | **51** |
| in the flat cases measured (one level; cannot move) | 15 |

Every sector-internal stream in the corpus is one edge away.  It is **not** a
veto, for three reasons:

1. **It is never silent.**  A file whose computed level differs from where it
   sits makes the 0/ completeness check REFUSE, and the refusal names the MOVE
   and both addresses rather than reporting an unrelated MISSING and an
   unrelated ORPHAN:
   ```
   RELOCATED  0/CONCENTRATION/Magma  ->  0/MAIN/Magma  (the same file, at the
              level that now contains every endpoint of its stream)
   ```
   The engine never moves a state file and never reads one it cannot place.
2. **The edit that triggers it is the edit that changes what the stream IS.**
   Wiring `DRYING.Dust` into FERMENTATION stops it being internal to DRYING.
   The file moving is the state tree reporting a topology change, not churn.
3. **The rule it replaces had the same class of instability**, and quieter: a
   stream moved when its producer moved sector, and a producerless stream's
   owner flipped from its consumer to its producer the moment one appeared —
   with nothing but a generic MISSING/ORPHAN pair to say so.

## 7. M3 — who else derives a stream's directory

Swept again after the 2026-09-06 consolidation.  **Three sites outside
`ownershipPath`**, all closed here, plus one gate assertion:

* `Flowsheet.cpp`, two refusal messages, spelled the path by DOTTING the
  qualified stream name — `author 0/FERMENTATION.Recycle` — which names a file
  that has never existed at that address.  They ask the manifest now.
* `bin/choupo-drill` wrote the child's `0/<SECTOR>/<key>` itself.  It asks the
  engine now (§8).
* `src/reporting/StreamTableReport.cpp`'s `sector` COLUMN re-derived "the
  producer's, else the first consumer's", under a comment claiming *"the same
  rule `StreamOwnership::ownershipPath` files the state file by, so this column
  and that folder cannot disagree."*  **They disagreed the moment the rule
  changed**: `BdAir`'s file went to `MAIN/` and the column went on saying
  `DRYING`.  A restatement is exactly what goes quietly false when the thing it
  restates moves.  The column asks the one home now and reports THE LEVEL,
  which is the fact a reader of a stream table wants — *where do I find this
  stream's file*.  This is the only OUTPUT content this slice changes, and it
  is a label, never a number.
* `bin/curate/check_drill_in.py` asserted the flipped inlet's state at
  `0/<sector>/<name>`; it now asserts `0/MAIN/`, which is the claim worth
  making.

NOT a fourth home, and named so nobody counts it as one: `SolutionWriter::
sectorOf` buckets the per-sector `converged/` VIEWS and the `iterations/`
instants by top-level sector.  That is a view of UNITS, not the address of a
stream's file, and it keeps the chain's HEAD by the 2026-09-04 decision.

## 8. Drill-in: broken already, and fixed here

`bin/choupo-drill` **could not drill 2 of the flagship's 4 sectors** before this
slice (task #125), and the reason is the same class of defect: it looked the
parent's state up by the CONSUMING PORT'S basename.  `PlantSteam { to
CONCENTRATION/Steam; }` sent it looking for a file called `Steam`, so it
blamed the parent for state the parent had.  DRYING worked by a **coincidence
of naming** — that sector's ports happen to be spelled like the streams that
feed them — and DRYING was the only flagship sector the gate exercised.

Observed before the change:

```
=== CONCENTRATION
choupo-drill: parent converged/ missing state for: PlantSteam (as Steam), ToConcentration (as DilutedJuice)
=== FERMENTATION
choupo-drill: parent converged/ missing state for: ToFermentation (as Must)
```

The tool now asks `choupoSolve --manifest` for BOTH manifests — the parent's
and the child's — and copies stream by stream, joining on the stream's
IDENTITY.  A stream keeps its identity across the drill except where its
producer LEFT the domain, and that correspondence is in the tool's own kept-edge
list; what the tool does not do is decide how a `<member>/<port>` reference is
spelled as an identity (the flatten seam spells it `<member>.<port>` for a
composite member and `<port>` for a leaf), so it proposes both spellings and
requires the published manifest to confirm exactly one, refusing by name if two
match.

All five sectors drill and SOLVE, and the child's `0/` shows the rule working
in the direction that makes drill-in the point rather than the obstacle — a
stream that was a CROSSING in the parent is a BOUNDARY in the child, so it sits
at the CHILD'S own level:

```
CONCENTRATION  0/CONCENTRATION/{Cond1,Cond2,Juice1,Magma,Syrup,Vap1,Vap2}
               0/MAIN/{PlantSteam,ToConcentration}
DRYING         0/DRYING/{DryPowder,Dust,Exhaust,ExhaustClean,Vapour,WetPowder}
               0/MAIN/{BdAir,DryingAir,Magma}
FERMENTATION   0/FERMENTATION/{Liquid,Mixed,Out,Purge,Recycle,Vapour}
               0/MAIN/ToFermentation
```

`Magma` is at `0/CONCENTRATION/Magma` in the drilled CONCENTRATION (there it is
that sector's product) and at `0/MAIN/Magma` in the drilled DRYING (there it
enters from outside).  The 2026-07-06 argument that the producer rule is *what
makes drill-in work* is answered: the drilled sector gets its own `Magma`
either way, and now the two other sectors can be drilled at all.

## 9. `choupoSolve --manifest`

New read-only mode: prints the canonical manifest, `streamId TAB relative state
path`, fenced by `[manifest] begin` / `[manifest] end`, and stops **before** the
0/ completeness check — because the tools that ask (a drill materialising a
child `0/`; a migration) ask precisely when the tree is not yet complete.  It
exists so the rule has ONE home that others can consult: the third replica of
this rule was written by exactly such a tool and got it wrong on its first
outing.

## 10. Gates

`check_sector_hierarchy` EXTENDED (not multiplied — it already owns the stream
side of the sector question, arm (g)):

* **(h)** the computed level recomputed from the AUTHORED root `connections {}`
  block of two fractal witnesses and compared with the published manifest — an
  inlet and a sector-to-sector crossing at `MAIN/`, a plant outlet LABEL leaving
  the file with the sector that owns the identity, a stream no root edge
  mentions staying inside its sector, nothing loose at the view root;
* **(i)** the run's own `streamTable.csv` `crossing` column — computed by a
  reader that asks the topology directly — agrees: every crossing stream is in
  NEITHER endpoint's folder.  `MAIN` is discounted as an endpoint, because the
  §3 amendment makes it the level above every sector;
* **(j)** a flat case gains nothing: no `MAIN/`, no folder at all;
* **(k)** a file left at the address the retired rule gave is REFUSED and the
  move is ANNOUNCED with both addresses — fired on a COPY in a temp directory,
  so the gate never mutates the tree;
* arm **(g)** gains a third role: the ownership rule reads the chain WHOLE now,
  so it must consume the stamped `SectorOfUnit` rather than call the head
  accessor, while the two readers that still want a chain's head must still go
  through `topLevelSector`.

`check_drill_in` gains CONCENTRATION and FERMENTATION — *a gate whose only
witness satisfies the rule by accident is a gate nothing tests* — and asserts
the flipped inlet's state at the child's own level.

Seven by-hand sabotages, recorded verbatim in
`check_sector_hierarchy`'s docstring.  **One touched a source file and rebuilt,
and it ran under `destructive_session.py`'s journal**, because that is the only
safe way to do it.  Two of them (S1: the defect itself in the tree; S2: the
rule itself, in source) produced the same coarse line —
`tutorials/plant/ChemicalPlantTutorial does not run.` — and that is recorded
exactly as observed, because it says something true and useful: **on a migrated
corpus the ENGINE refuses a misplaced file before any arm here can speak.**
Arms (h)/(i) are therefore not what catches a moved FILE; they catch a moved
RULE, and arm (k) is the one that reads the refusal.

## 11. NOT DONE, said plainly

* **Nesting deeper than one level is unexercised.**  The rule reads the chain
  whole, so a stream internal to `A.B` would live at `A/B/`; no corpus case
  puts a sector inside a sector, so nothing distinguishes that from `A/`.  The
  `converged/` per-sector VIEWS and the `design/` sheets keep the chain's HEAD
  (a 2026-09-04 decision about a derivative, deliberately not touched here), so
  on a doubly nested case the two conventions would differ.  No case makes
  them, and the gate says so instead of implying coverage.
* **The GUI is out of this slice** and three of its comments still describe the
  retired rule — `gui/src/ui/TopBar.tsx`, `gui/src/cases/tutorials.ts`,
  `gui/src/case/toGraph.ts` — plus a `caseTree.test.ts` fixture that uses
  `converged/CONCENTRATION/Magma` as a path string (it tests tree grouping, not
  ownership, so it is correct as a test and stale as an example).  Named, not
  fixed.
* **`tutorials/plant/twoSectorDemo`'s two sub-cases** ship `0/<UNIT>/<stream>`
  trees — a unit-named directory in a FLAT case, which neither the old rule nor
  the new one produces.  They fail today for an unrelated reason (45 NRTL pairs
  with no parameters, refused before any state is read) and fail identically
  after, so nothing here touches them.
* **Whether a stream's `0/` file holds the right NUMBERS.**  This slice is
  about the address.  A file at the right address with the wrong contents
  passes every arm added here, and the golden is what says otherwise.
