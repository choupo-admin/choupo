# The column draws itself

*Task #134, Vítor's idea 2026-09-07, authorised the same day.  Rides on #79
(`one-unit-five-items-the-column-gets-a-size.md`), which is why that record's
"NOT DONE: no column SCHEMATIC" bullet is now a lie the same commit buries.*

## The question

Task #79 gave the distillation column five specification sheets — `shell`,
`trays`, `condenser`, `reboiler`, `refluxDrum`.  Two of them needed no new
work: the condenser and the reboiler are `shellTubeHX` items and the printable
exchanger datasheet already draws that kind, with its parametric bundle,
baffles and coloured nozzles.  **That is the whole reason they were free — the
datasheet follows the EQUIPMENT KIND, not the unit type.**

What had no drawing at all was the column's OWN equipment: the tower and the
tray stack.

## The rule

**The schematic is dispatched on the sheet's own `equipment` word** — the same
registered-type word the sizers are keyed on — so adding a kind is one entry in
one registry and no reader changes.  `gui/src/case/equipmentSchematic.ts` is
that registry.

**A kind with no drawing gets a LABELLED BOX**, with the equipment word, the
item name and the unit's ports on it, and a sentence saying why there is no
picture.  There is no generic vessel-ish outline that is nearly right for a
crystalliser, a cyclone and a compressor; **a labelled box beats a wrong
picture**, and nothing here approximates one kind's geometry with another's.

**A kind reaches the fallback for two DIFFERENT reasons and they are not
collapsed.**  Nothing is registered for `vessel` at all.  `shellTubeHX` is
different: Choupo HAS a schematic for it, built from the RATING geometry — tube
count, passes, baffles, pitch — which a specification sheet does not carry, and
a column's condenser has no rating unit behind it to supply one.  Saying "no
schematic for a shell-and-tube" would be false about a project that ships one.

## Why the TOWER is keyed on `sieveTrays` and not on `vessel`

The shell's own equipment word is `vessel` — because Turton prices a tower as a
vertical vessel — and it is the SAME word this column's reflux drum carries and
the same word `VesselSize` writes for every flash drum in the corpus.  Keying
the tower drawing on `vessel` would put a fourteen-tray tower inside every drum
in the tree.

**The trays are the fact that makes it a column.**  `sieveTrays` is the word
that identifies a tray tower, and the builder draws the tower from the tray
sheet TOGETHER WITH its `shell` sibling — which is why the reader gained
`unitDesignSheets()`, a lookup over every item of one unit, beside the
`(unit, equipment)` lookup that could never have served a drawing built from
two sheets at once.

## The declared / computed line, which is the important one

**A number the CASE declared must not look like a number Choupo COMPUTED.**  A
column is where that is easiest to get wrong: omit `hydraulics { diameter }`
and the pass DESIGNS the tower (`column09_tray_hydraulics`, 1.3158 m); declare
it and the pass RATES the trays against a tower the author chose
(`column10_flooding`, 1.10 m, and its trays flood at 114 %).  Publishing the
second as though it were the first would be the falsest line on the page.

**The engine already answers it, and the page reads the answer rather than
inferring one.**  `diameterDesigned` is a KPI, written by `DistillationColumn`
as a FACT precisely so that a reader downstream does not have to compare
numbers to work out which mode ran.  Absent, the drawing says *provenance not
published* and claims neither.

**The provenance travels in TWO channels at once** — the ink colour (green for
Choupo, grey for the case, the same colours as the page's section headers) and
the WORD in brackets.  Colour alone is not readable aloud, does not survive a
greyscale print and is not what a reader quotes in a report.

The three classes are the exchanger sheet's own, and there is no fourth:
`SIZED BY CHOUPO` (read from `design/…`, never recomputed) · `RATING RESULT`
(what the tray-hydraulics pass published) · `DECLARED BY THE CASE` (the
author's `operation {}`).  `feedStage` and `nStages` are KPIs and are
nonetheless in the THIRD class, because both are echoes of the case's own
declaration — a KPI is not automatically a Choupo answer.

## The swage: the drawing shows the tower the engine sized

`ColumnSize` sizes the shell STRAIGHT and says so: a swaged tower is an
ECONOMIC choice, Choupo prices no transition cone, so it publishes ONE shell
`D`, both SECTION diameters and their gap and leaves the comparison to the
reader.  **So no drawing here ever shows a transition cone**, and it is not a
threshold this module applies — it is that the engine publishes one diameter.
What the drawing does show is the narrower section's requirement as a DASHED
outline, AT SCALE, which on the witness means it very nearly coincides with the
wall: 8.08 % of 1.32 m is two pixels.  That IS the finding, so it is annotated
rather than exaggerated — a dashed line pushed apart to be visible would be a
drawing of a gap that is not there.

## What the drawing does NOT claim

* **To scale, or honestly not.**  The shell is drawn at the sheet's own H and D
  in one scale when the aspect ratio allows it (the witness is 6.99, and it
  is), and the caption says which.  A picture that quietly abandons its scale
  is one a reader measures anyway.
* **The stack's vertical position is not published.**  The sheet gives H and
  the tray spacing but not how the leftover height splits between the
  disengagement space above and the sump below — both are sizer assumptions and
  only their NAMES reach the sheet.  So the stack is drawn centred and the
  caption says the split is unknown.
* **No nozzle size and no mechanical specification.**  Every nozzle is a stub
  with a service label.  The page states, in its own footer, that it carries no
  nozzle sizes or ratings, no facings, gaskets, manholes or handholes, no head
  type, no supports or skirt, no insulation and no code stamp, because Choupo
  computes none of them.
* **The tray internals are schematic.**  Weir and downcomer are indicated and
  no dimension is put on them.
* **The auxiliaries are drawn only where the run sized them.**  A column whose
  case declares no `refluxDrum {}` block gets no drum in the picture.

## Traps paid for

* **PROSE DOES NOT GO IN AN SVG.**  An SVG has no line wrap and no reflow, so a
  sentence longer than the viewBox is cut at both ends without a word.  It
  happened twice in one afternoon — the swage note under the tower and the
  "why there is no schematic" line under the fallback box were both rendered
  and both truncated mid-word.  Both are HTML now, beside the picture, where
  they wrap.  Only LABELS live in the drawing.
* **A LINE'S LABEL IS PLACED, NEVER GUESSED FROM ITS MIDPOINT.**  The first
  version put each connector's label at the polyline's middle vertex, which
  dropped *overhead vapour* on top of the condenser box and *to reboiler* on
  top of *return*.  A picture whose labels collide is a picture a reader has to
  decode, and the coordinates are known at the call site.
* **A FIXTURE SEARCH OVER A WHOLE FILE IS BLIND TO A SIBLING.**
  `check_design_sheet` arm (l) held the GUI's transcribed sheets by asking
  whether each line appears ANYWHERE in the test file.  That was exact while a
  file held one fixture and went blind the day one held three: the column's
  shell, trays and reflux-drum sheets carry the SAME three port blocks, so a
  drifted temperature in one was still found — in a sibling.  Measured, not
  supposed: the sabotage SURVIVED the first version of the arm.  Each fixture
  is now matched against ONE template literal, split on UNESCAPED backticks
  (the sheets' own header comments contain backticks, and splitting on those
  cut every fixture in half and made the arm accuse correct fixtures).
* **A DEFERRAL EXPIRES THE DAY ITS REASON DOES.**  Arm (l) deliberately did not
  hold the port blocks, on the stated ground that no GUI reader read them.  The
  column schematic reads them — it colours each nozzle by the temperature the
  run wrote — and the moment it did, the stirred-tank fixture turned out to
  carry no port blocks at all.  Held now.
* **A TUTORIAL HEADER TEACHING THE OPPOSITE OF ITS OWN RUN.**  Found by reading
  the witness rather than the brief.  `column09`'s header said "the stripping
  trays are not the tight ones here, because the vapour volumetric flow falls
  faster than the capacity".  The run's own printed table says otherwise on
  both counts and always did: the vapour velocity RISES across the feed
  (1.044 → 1.092 m/s) and the flood approach never once falls (63.7 % on the
  top tray, monotonically to 80.0 % on stage 14, which is the tray that sets
  the 1.316 m tower).  It mattered here because the new drawing marks stage 14
  as the worst tray, two clicks from a header saying its section is not the
  tight one.  Corrected in the case header, in the generated
  `tutorialsGuide-steady.tex` and in the rebuilt `tutorialsGuide.pdf`; no
  number moved and no golden moved.

## What is NOT done, said plainly

* **No handoff / mechanical block** (task #142).  Real data sheets MARK the
  cells somebody else fills rather than leaving them blank — API 610
  colour-codes each cell by who fills it, Hanford writes "By Vendor" under
  "PRELIMINARY LOADS", Gladwin titles its block "PRELIMINARY Nozzle Schedule".
  Building that needs its own rulings (two different absences need two
  different words) and it is not taken here.  What IS done is the weaker,
  sufficient thing: the drawing does not IMPLY a nozzle size or a manhole it
  has not computed.
* **No packed column.**  No packing model exists anywhere in the engine
  (measured 2026-09-07), so there is nothing to draw.  That would be new
  physics and it is Vítor's decision.
* **The RATING-mode label is not exercised by a corpus case.**  Only
  `column09_tray_hydraulics` ships a `system/postDict`, and it runs in DESIGN
  mode; `column10_flooding` declares its diameter but has no sizing pass and
  therefore no specification sheet to read.  The rating arm of the test is a
  CONSTRUCTION — the column09 sheets with `diameterDesigned 0` — and the test
  says so at the fixture rather than leaving the next reader to assume a
  witness exists.
* **No new engine number.**  Everything on the page was already published by
  #79 or by the tray-hydraulics pass.  The only engine-side change in this
  slice is in the GUI's sheet READER, which now carries the `inlets {}` /
  `outlets {}` blocks the writer has always written.
* **No `equipment` word gained a schematic except `sieveTrays`.**  Seven kinds
  (`vessel`, `stirredTank`, `crystalliser`, `evaporator`, `cyclone`,
  `sprayDryer`, `compressor`) get the labelled box, and that is the honest
  state rather than a deficiency this slice was asked to hide.

## Gates

`check_design_sheet` arm (l), EXTENDED rather than multiplied: it now holds the
header words, every `sizing {}` triple AND every port line of the column's
`shell`, `trays` and `refluxDrum` sheets to what the run just wrote, in the
test file that transcribes each one — which test file holds a fixture is part
of the entry, because a single hard-coded path would have reported the column
fixtures as checked while holding them to nothing.

Three sabotages, by hand, all caught after the arm was fixed:

1. one port temperature drifts in ONE of three identical fixtures — **survived
   the first version of the arm**, which is what forced the per-literal match;
2. a `sizing {}` value drifts (`swageGap`);
3. the whole column fixture file is removed.

`gui/tests/columnDatasheet.test.ts` carries 23 tests over the reader, the
registry, the tower builder and the printable page, including both directions
of the declared/computed label and the state where the run published no
provenance at all.

## Files

* `gui/src/case/equipmentSchematic.ts` — the registry, the fallback box, the
  tower builder, the provenance vocabulary.
* `gui/src/case/designSheet.ts` — `DesignPort`, `unitDesignSheets()`.
* `gui/src/ui/ColumnDatasheet.tsx` — the printable page and its `.ods` export.
* `gui/src/ui/PropertyPanel.tsx`, `gui/src/ui/ReportsWorkspace.tsx` — the two
  entry points.
* `bin/curate/check_design_sheet.py` — arm (l).
