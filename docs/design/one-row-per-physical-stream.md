# One row per physical stream

*Status: SHIPPED 2026-09-07.  Task #145.  Found by Vítor on the live site.*

---

## 1. The symptom, and what it actually was

Vítor opened the flagship plant on www.choupo.org and saw rows in the Streams
table with no PFD number against them.

The blank number is a consequence, not the defect.  The defect is in the
ENGINE's own report:

```
tutorials/plant/ChemicalPlantTutorial/postProcessing/streamTable/0/streamTable.csv
    52 rows, 25 physical streams
```

Twenty-one alias classes appeared two or three times, byte-identical:

```
CONCENTRATION.Cond1 | Cond1 | EvapCondensate1   -> 60.000000 kmol/h, 400.300 K
CONCENTRATION.Magma | Magma                     -> 32.799445 kmol/h, 313.150 K
DRYING.ExhaustClean | ExhaustClean | Stack      -> 321.229847 kmol/h, 333.655 K
```

`SimulationResult::streams` is keyed by every NAME a stream answers to — its
qualified identity, the bare sector label the relabel pass mints, the plant's
own boundary label — and that is deliberate: a golden reads `stream Cond1 F`,
a case file cables `Stack`, a canvas edge is drawn as `Powder`, and all three
must resolve.  The table simply emitted a row per KEY.

The blank numbers follow from that.  `gui/src/case/streamNumbering.ts` issues
one ABSOLUTE number per equivalence class, resolving a name through the union
of the case's connection endpoints — so every member of a class resolves, and
a name that is in NO connection list resolves to nothing.  Measured against
the old 52-row table: **15 rows carried no number**, and all 15 are bare
sector labels no view's `connections {}` block mentions (`Cond1`, `Cond2`,
`DryPowder`, `Dust`, `Exhaust`, `ExhaustClean`, `Juice1`, `Liquid`, `Mixed`,
`Out`, `Recycle`, `Syrup`, `Vap1`, `Vap2`, `WetPowder`).  The other four bare
labels happen to be root edge names too (`Magma`, `ToConcentration`,
`ToFermentation`, `Purge`) and did resolve.  **The numbering was right; the
row list was wrong** — nothing in `streamNumbering.ts` was touched.

The state model already counted correctly: `0/` holds exactly 25 files,
because `StreamOwnership::canonicalManifest` skips a name in
`boundaryAliases` — *"an EXPLICIT label, no file"*.  One half of the engine
knew how many streams the plant has and the other half did not.

## 2. The rule

**THE ROW IS THE QUALIFIED IDENTITY.  THE PLANT LABEL IS A COLUMN.**

Measured on the real case, for the 21 duplicated classes:

| candidate for the row name | exists for | collides |
|---|---|---|
| the plant's boundary label (`Stack`) | 9 of 21 | no |
| the bare sector label (`Cond1`) | 19 of 21 | **yes** |
| the qualified identity (`DRYING.ExhaustClean`) | **21 of 21** | no |

The plant label fails on twelve — over half these streams never leave the
plant and have none.  The bare label fails on two AND collides: `DRYING.Vapour`
and `FERMENTATION.Vapour` are physically different streams whose bare name is
the same word, so naming rows by it prints two different streams identically —
the name-identity crossing settled against on 2026-09-06 (*identity is (kind,
sector, name), never name alone*).

The qualified identity exists for all of them, collides in none, and is the
name the state file is at — so the row set of `streamTable.csv` is **exactly
the key set of `choupoSolve --manifest`**, and the table and the `0/` tree
agree by construction rather than by coincidence.

What a reader would otherwise lose is the plant's own vocabulary: `Stack`,
`Powder`, `EvapCondensate1` are the names on the plant's drawing, and they are
NOT derivable from the identity.  They ride a `label` COLUMN, filled on the 9
streams that have one and empty on the rest — **empty means this stream carries
no plant-boundary name, which is a fact and not a gap.**

## 3. Where each fact lives

* **WHICH NAMES ARE LABELS** — `SimulationResult::boundaryAliases`, already the
  engine's own set, already what `canonicalManifest` skips.  The report reads
  it; nothing re-derives it.
* **THE PLANT'S OWN OUTLET NAME** — a new map,
  `Flowsheet::boundaryOutletLabelOf()` → `SimulationResult::boundaryOutletLabelOf`,
  stream identity → the outlet name the plant declared.  It is NOT
  `boundaryAliasOf` inverted, and that distinction is the whole reason it
  exists: `boundaryAliasOf` also carries the bare SECTOR labels the relabel
  pass mints (`Cond1`, `Magma`), which name no plant boundary at all, so a
  table drawing those as plant names would invent a boundary the case does not
  have.  It is filled in the one loop that consumes the ROOT's declared
  boundary outlets, and only where the label differs from the identity.
* **ROLE** — `reporting::Topology` files a renamed product under the BOUNDARY
  name (the author's vocabulary, which is right for the balance reports that
  print one line per boundary stream).  Ask it about the IDENTITY of a renamed
  product and it answers `intermediate`.  So the table's `roleOf` reads the
  boundary label: **a stream the plant DECLARED as an outlet is a product.**
  Without that, the flagship's nine products would all have read
  `intermediate` the moment the label rows stopped being drawn.  Nothing in
  `Topology` moved — the balance reports still name a product under the
  author's word, and no golden moved with it.

## 4. The GUI draws; it does not de-duplicate

Doing the de-duplication a second time in TypeScript would be a second home
for the rule, and the two surfaces could then disagree about how many streams
a plant has.  So the ENGINE publishes the answer per stream in the result
JSON — `aliasOf` on a label entry, `boundaryLabel` on an identity that has one
— and the adapter APPLIES it:

* `shapeStreams` drops the entries carrying `aliasOf`, so `RunResult.streams`
  is one entry per pipe and every surface that TABULATES or SUMS streams
  counts each once **without a filter of its own**.  The alternative was the
  same one-line rule in eight places (`MassBalancePlot`, `EnergyBalancePlot`,
  `balances.ts`, `molarBalance.ts`, `WhatIfTab`, the table, the pop-out, the
  .ods export).
* the dropped names become `RunResult.streamAliases` (alias → identity), and
  `findRunStream` consults it FIRST.  This is not only transport: that
  function's last resort is a LEAF match, and `EthanolVapour` ends with
  `Vapour`, so the guess would have taken the plant's ethanol product to
  whichever `*.Vapour` the list happened to hold first.  There are two of them
  in this plant.
* the table and the pop-out gain the same `Plant label` column the CSV has.

## 5. Measured

* **The flagship: 52 rows → 25**, and all 25 resolve to a PFD number
  (`gui/tests/streamNumbering.test.ts`, against the case's real dicts).  The
  blank numbers are gone because the duplicate rows are gone — the numbering
  was not touched.
* **`boundaryAliasOf` already closed all 27 alias names** (every alias row in
  the old table resolved its `sector` column through it, and none was empty).
  What it could NOT do is say which of them is a PLANT name: 9 of the 27 are,
  18 are bare sector labels the relabel pass minted.  That distinction is the
  new map, and it is the only fact this slice had to add.
* **A flat case is byte-identical**, verified against a build of the previous
  commit rather than argued: of the 82 corpus cases that publish a stream
  table, **78 are byte-identical across their WHOLE run-output tree**
  (`reports/`, `postProcessing/`, `converged/`, `design/`, `iterations/`), 2
  differ — `ChemicalPlantTutorial` and `plant01_two_sectors`, the two sectored
  plants — and 2 fail to run identically on both binaries (the `userops`
  cases, which need a compiler and exit 2 either way).  The result JSON of a
  flat case is byte-identical too.
* **`phases.csv` was duplicated the same way** and is fixed by the same list
  (16 rows → 7 on the flagship).

## 6. Not done, deliberately

* **THE CYCLONE.**  `DRYING/CY` (Lapple, 0.4 m) recovers EXACTLY zero: `Dust`
  is 0.000000 kmol/h and 0.000000 kg/h because `Exhaust` carries 0.000000
  solids into it, so `RecoveredDust` — one of the plant's nine declared
  boundary outlets — is an empty product.  That is a separate finding and it
  is RESERVED for Vítor.  Nothing here touches it.
* **`Topology`'s products/feeds sets.**  They still hold the boundary NAME, so
  the mass, element and energy balance reports still print `Stack` rather than
  `DRYING.ExhaustClean`.  Changing that would rename rows in three reports for
  no reader's benefit, and the comment that put them there argues its case.
  The consequence is stated rather than hidden: **the same physical stream is
  named `DRYING.ExhaustClean` in the stream table and `Stack` in the balance
  reports**, and the `label` column is what lets a reader join them.
* **The GUI's own role inference.**  `WasmAdapter::shapeStreams` still works
  the feed/product classification out from the flowsheetDict rather than
  reading a role the engine published.  It is a second home for a topology
  fact and it was already one; this slice only teaches it to read the engine's
  boundary label, which is what the identity rows need.  Unifying it is a
  separate decision.

## 7. Gate

`check_sector_hierarchy` arm (l) — extended, not multiplied: that gate already
runs the fractal witness, already reads `streamTable.csv` and already has the
canonical manifest in hand.

The arm checks that the row set is EXACTLY the manifest's keys (no duplicate
id, no extra, none missing), that the `label` column exists and every value in
it is a boundary outlet **the AUTHORED root dict declares** (never the
engine's own conclusion — a label naming anything else would be a boundary the
case does not have), that a labelled row is filed as a `product`, and that the
FLAT witness gains no such column.

Six sabotages, all fired BY HAND between the gate's own run of the case and
its read of the table — this gate re-runs the case, so a table edited
beforehand is simply rewritten — and nothing was rebuilt.  They are recorded
verbatim in the gate's own docstring.

**Found by running them**, and worth generalising: the first cut of the arm
bound its declared-outlet set to a local named `declared`, which is the name
arm (a) holds the case's SECTOR list in.  The gate PASSED, and its own OK line
then reported the plant's nine boundary outlets as its four sectors.  *A gate's
claim is the line it prints, and a shadowed local made that line false without
failing anything.*
