# A sector recovered by splitting a name, and the crossings nobody could see

*Record of the 2026-09-06 slice (task #106).  It finishes the 2026-09-04
[hierarchy slice](the-hierarchy-that-only-existed-in-the-name.md) on the
stream side, and answers a question Vítor asked by being confused.*

---

## 1.  Part A — two readers still split the name

On 2026-09-04 the sector stopped being recovered from a name and started
travelling as data: `Flowsheet::flattenNode` knows each leaf's owning sector
exactly (`nsPrefix` IS the parent chain), and `FlatUnit::sector` carries it.
That slice's record states the reason in one line: recovering the sector
downstream by splitting the last dot is **name identity** — right on today's
corpus, silently wrong for the first unit whose name carries a dot for
another reason — and it converted the four DESIGN and COSTING readers.

It did not convert the STREAM side, because the stream side splits on the
FIRST dot rather than the last, and the gate arm written that day looks for a
last-dot substring.  Two copies survived, and they decide something more
consequential than a table heading:

* `src/streams/StreamOwnership.H` — `sectorOf(unitName)` decides **which
  sector folder a stream's state file lives in**.  A wrong answer here files
  `converged/<WRONG>/<stream>` and, on the next run, reports the stream
  MISSING and a file ORPHAN.
* `src/io/SolutionWriter.cpp` — `sectorOf(dottedUnit)` buckets the per-sector
  `converged/` **views**, and the dynamic instants ride the same function.

A third site had already been converted in spirit but not in fact:
`Flowsheet::runInit0`'s `pathOf` delegates to `StreamOwnership`, so
`choupo-init0` inherited whichever rule that header held.

**The sweep.**  Every split on a single-dot literal in `src/` was read —
nineteen sites, of which two are the rule itself.  The other **seventeen**
split a dotted string and NONE of them recovers a sector:

| what is split | where |
|---|---|
| a unit PORT reference, `<unit>.<port>` in `energyInputs { from … }` | `UtilityAllocationReport.cpp` ×2, `Flowsheet.cpp` ×2 |
| a dictionary PATH, `units[0].operation.refluxRatio` | `OptimizationDriver.cpp`, `FitParameters.cpp` ×2, `Flowsheet.cpp` (stream override) |
| a response / computed key, `<unit>.<kpi>` or `<stream>.<field>` | `ResponseExtractor.cpp` ×2, `ComputedReport.cpp`, `OptimizationDriver.cpp` |
| a bounds reference, `<feed>.F` | `Flowsheet.cpp` |
| a stream BASENAME (the relabel pass, and the file-naming rule) | `Flowsheet.cpp`, `StreamOwnership.H` |
| a DECIMAL POINT in a formatted number | `PolynomialCp.cpp`, `SolutionWriter.cpp` |
| a FILE EXTENSION | `Exchange.cpp` |

Those are different grammars with their own declared shapes, and none of them
is asked "which sector".

**A third splitter does exist, and it is deliberately not fixed here.**
`gui/src/ui/LogWorkspace.tsx:114` groups the log's jump list by
`qname.indexOf(".")`.  It parses the qualified name out of the run LOG with a
regular expression and has no unit, no topology and no stamp available at
that point — it genuinely has only a name.  This slice does not touch the GUI
(scope), and the honest thing at such a call site is to say so rather than
split quietly; it is recorded here and named in `check_sector_hierarchy`'s
own "not checked" list.

### The fix

`core/FlatUnit.H` gains the ONE home for reading a stamped chain:

```cpp
inline std::string topLevelSector(const std::string& stampedSector);
```

`FlatUnit::sector` holds the FULL dotted parent chain (`A.B` for a doubly
nested unit).  The stream-ownership rule wants the chain's HEAD, because a
state file lives FLAT under its top-level sector — *a unit is not a
subdomain* (`stream-state-architecture.md` §2.4), and that layout is
ratified.  **Reading the head of the chain is not the act that was banned.**
The banned act is guessing a fact that was never stored, out of a name that
was never promised to carry it.  The chain is the engine's own list of sector
names, joined at the moment it knew them; taking its first element recovers a
value that was PUT there.  The distinction is written at the function.

`StreamOwnership::ownershipPath` now takes a `SectorOfUnit` map (unit name ->
stamped chain) alongside the producer/first-consumer maps;
`canonicalManifest` builds it from the topology it is already handed, and
`runInit0` builds it from the flattened dicts' own `sector` key — the same
key `Flowsheet::solve` reads at line 2524.  `SolutionWriter::sectorOf` takes
a `FlatUnit` instead of a string.

### It moved nothing, and that was the expectation

Every unit in the corpus is named `<its own sector chain>.<leaf>`, so the
split and the stamp agree today; the slice is about the day one is not.
Measured rather than assumed, three ways:

* **60 units across the nine `tutorials/plant/` cases plus
  `composite01_two_flashes`, `plant01_two_sectors` and the flat
  `process02_with_design`, 32 of them dotted, 0 disagreements** between the
  first dot-segment of the name and the head of the published `unitSectors`
  stamp.
* **Byte-identical output.**  All 12 cases re-run before and after: stdout,
  stderr and every file under `0/`, `converged/`, `design/`, `reports/` and
  `postProcessing/` — `diff -r` exit 0.
* **`choupo-init0 --force` on a copy of the flagship** resolved all 25 graph
  streams to their existing files (`25 graph streams == 25 state files`), so
  the pre-solve path assembly lands where the tracked `0/` already is.
* And swept once more over the whole suite's cached run outputs — 367 units,
  24 of them dotted, again 0 disagreements.  (Fewer dotted than the plant set
  because the cache holds only cases that exited 0; the plant measurement
  above is the one that covers every sectored case.)

---

## 2.  Part B — the crossings nobody could see

Vítor opened `tutorials/plant/ChemicalPlantTutorial` and asked why `0/MAIN/`
holds three streams, when MAIN is where he expected the inter-sector
connections to be.

**The engine is right and the question is fair.**  A stream lives with the
unit that PRODUCES it, which is what makes drill-in work: CONCENTRATION
opened alone needs its own `Magma` in its own `0/`.  So `Magma` is filed
under CONCENTRATION even though it crosses into DRYING.  What was missing is
that **nothing anywhere showed the crossings together**: the wiring is in the
root `connections {}` block — topology, which never lives in a state view —
and the state is scattered across one folder per sector.

`postProcessing/streamTable/0/streamTable.csv` is the natural home and
carried no sector column at all.  It now carries two, fed by the same stamped
fact part A establishes:

| column | meaning |
|---|---|
| `sector` | the OWNERSHIP rule's answer — the producer's sector, or the first consumer's for a stream nobody produces — so the column names the folder the state file is actually in |
| `crossing` | `FROM->TO` when the producing and consuming units sit in different sectors, empty otherwise |

On the flagship this reads:

```
CONCENTRATION.Magma   intermediate  CONCENTRATION  CONCENTRATION->DRYING
MAIN.ToConcentration  intermediate  MAIN           MAIN->CONCENTRATION
MAIN.ToFermentation   intermediate  MAIN           MAIN->FERMENTATION
```

Three crossings, on one screen, beside the state — which is the answer to
the question that was asked.

### Empty is not a sector called "root"

The 2026-09-04 ruling applies unchanged: **a case whose units carry no sector
gets NEITHER column** — not two empty ones, which would be a format change
claiming a structure that is not there.  Verified the same way that ruling
was: a build with part B reverted, the same 36 cases run twice, `diff -rq`
naming exactly **two** differing files — `plant01_two_sectors` and
`ChemicalPlantTutorial`, the only two cases in the set whose units carry a
stamped sector.  Every flat case, and every stdout including theirs, is
byte-identical.

`composite01_two_flashes` declares a `sectors ( … )` list and is NOT one of
the two: its members are LEAF units (their dicts declare a `type`), so
`nsPrefix` stays empty and no unit is stamped.  That is the engine's own test
at the flatten seam, and the columns follow it rather than the word
`sectors`.

### A bare label is the same stream under the author's own name

The first cut printed `(no sector)` against half the plant's rows, including
`Magma` — the very stream that raised the question.  The relabel pass creates
a BARE copy of each unambiguously-named qualified stream, because the
author's connection KEY is the bare edge name and the reports speak the
author's vocabulary.  That copy appears in no unit's `ins` or `outs`, so
asking the topology about it answers "nobody owns this".

It is resolved through the **declared bridge** the relabel pass already
recorded (`result.boundaryAliasOf`), never by matching a bare name against
the tail of a qualified one — which would be the same name identity, added
back one file over, on the day it was removed.

And a stream the flat topology does not know at all gets an **empty** cell,
not `(no sector)`.  `(no sector)` is a fact about a UNIT at the plant root,
and saying it about a stream nobody owns would be an answer where there is
none.

---

## 3.  Rejected alternatives

* **Split the dotted name in the two stream readers and leave it.**  It works
  on every case in the corpus, which is exactly what makes it dangerous: the
  failure is silent, and its blast radius is `converged/` rather than a table
  heading.
* **Put the whole chain in the path** (`A/B/<stream>` for a doubly nested
  unit).  Tempting, since `internalStates/` already nests that way — but it
  MOVES a stream file, and where a stream file lives is ratified
  (2026-07-06) and out of this slice.  The head of the chain is taken, and
  the asymmetry with the interior tree is recorded here rather than resolved.
* **Widen the `sector` column to the full chain.**  Same reason: it would
  stop naming the folder the file is in, which is the column's whole job.
* **A `crossings.csv` of its own.**  The information is one attribute of a
  stream that already has a row; a second artefact would be a second home for
  the topology.
* **Fix `LogWorkspace.tsx` by passing the topology in.**  Out of scope (no GUI
  change in this slice) and not free: the jump list is built from log TEXT,
  and giving it the result topology couples a log view to a solved run it does
  not otherwise need.

---

## 4.  Deliberately NOT done

* **No stream file moved**, no new folder, nothing renamed.
* **No GUI change.**  `LogWorkspace.tsx` still splits, knowingly, and is named
  in the gate's own not-checked list.
* **Nesting deeper than one level is still unexercised.**  No corpus case
  nests twice; the stream side keeps the chain's head by design and the
  interior tree nests — two answers that agree on every case that exists.
* **`docs/userGuide.tex` was not touched.**  Its one-line summary of the
  stream table (`role, F, F_mass, T, P, vf, compositions`) was already an
  abbreviation — it omits `solids_kg_per_h` and `enthalpy_kW` too — so it is
  not falsified by two more columns, and editing a `.tex` obliges a PDF
  rebuild under `check_guide_pdf_fresh`.  The columns are documented in
  `docs/engine-capabilities.md`.

---

## 5.  Gate

`bin/curate/check_sector_hierarchy.py` gains **arm (g)**, beside the arm (d)
that already guards the design and costing readers, because no OUTPUT arm can
tell a correct stamp from a correct split on a corpus where the two agree.

Arm (g) holds the three files that carry the stream-side rule, in the **two
roles** they have — a distinction the first draft got wrong, failing the gate
on correct code:

* the two that READ a chain's head (`StreamOwnership.H`, `SolutionWriter.cpp`)
  must do it through `topLevelSector`;
* the one that SUPPLIES the stamp (`Flowsheet.cpp`, for `choupo-init0`) must
  build a `SectorOfUnit` from the flattened dict's own `sector` key;
* none of the three may take a single-dot split of a UNIT NAME.

The last is the arm that has to be careful about what it forbids.  A split of
a STREAM name (`stream.rfind('.')` — the file's own basename rule) and a
prefix test (`nm.rfind(".tmp_", 0)`) are different acts and stay legal, so the
detector requires the literal to be a BARE dot and the subject to be a
unit-ish identifier.  It carries a **PROBE** holding the three removed
constructs verbatim and fails if it stops flagging them: a detector that
cannot fire reports nothing when the defect returns.

Four sabotages, all applied by hand to the source between the run and the
check and restored immediately; nothing was rebuilt, because this arm reads
source.  The observed lines are in the gate's own docstring.  **S1 survived
its first form**: the "calls `topLevelSector`" half stayed green because the
file's BLOCK comment names the function and only `//` comments were being
stripped — *these files argue about the rule in their headers, and prose is
not a call.*

`check_internal_states` named this split-vs-stamp gap in its own "not
checked" list on 2026-09-06; that bullet and its OK line now say it is closed
and where.  The absence is buried in the same commit as the thing that filled
it.

---

## 6.  What is NOT gated, said plainly

* **Whether a unit name and its stamp agree.**  On this corpus they do, unit
  for unit — which is why every output arm is blind to the whole question.
* **The GUI.**  Named above.
* **Whether `crossing` is TRUE of the plant.**  The gate does not recompute
  the flowsheet's edges; the column is derived from the same topology every
  other report reads, and a wrong topology would be wrong everywhere at once.
