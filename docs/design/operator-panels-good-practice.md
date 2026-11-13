# Operator panels and alarms: good practice (the `operator-panels` EduTool)

**Kind:** design note for an EduTool page · **Status:** PAGE BUILT 2026-11-12
(DEV.md 4c C371, slice S5 of `docs/design/operator-panel-in-the-case.md`) ·
**Theory anchor:** `sec:operatorPanels` (Theory Guide) · **Shelf:**
Hydraulics & control

The page answers one question a student brings: *my process publishes dozens
of variables; what do I put in front of the operator, in what form, and which
alarms?*  It is the LESSON of the operator-panel record.  It is not the panel
workspace of that record (slices S2-S4: drawing a case's panel, the draft,
tuning, saving, the lock), none of which is built and none of which this page
builds.

## 1. Who computes what

* **The engine** runs every case and reports every fact about a panel.  The
  page clones the shipped witness
  `tutorials/batch/electrodialysis/edbatch01_constant_current` from the
  bundled corpus (`panelCaseFiles` in `gui/src/case/operatorPanels.ts`),
  changes at most ONE declared value of it for a disturbance, writes its own
  `system/panelDict` in place of the shipped one, and hands the case to
  `choupoBatch`.  The engine reads the panel after the time loop
  (`src/postProcessing/panel/PanelPass.cpp`) and publishes the result's
  `panel` block.  The page reads that block through
  `gui/src/adapters/panelPayload.ts` (types policed, nothing computed) and the
  trajectory; an answer whose panel (element names, columns, high limits) or
  first written instant (I_A, xi_eff, n_Na) does not match the request is not
  drawn (`answerMatches`).
* **The page** writes the lesson panels (the grammar of the record, section
  3), draws the worked panel and four display forms as lesson-local
  illustrations, and colours an element only where the ENGINE's alarm interval
  covers the time cursor (`inAlarmAt` asks the interval; it never compares a
  value with a limit).  Its one count is the alarm ONSETS (starts of the
  engine's intervals) inside any ten-minute window, step 5, labelled `page`.
* **Assumption** (labelled on the page): how many alarms one person can act
  on in ten minutes.  Default 2, adjustable 1-20.  It is NOT taken from a
  source.  (The UK HSE sheet CHIS6 quotes, from the EEMUA guide, no more than
  ten alarms displayed in the first ten minutes after a major upset and an
  average of no more than one in ten minutes in normal operation; NUREG-0700
  gives no figure.  The default stays the page's own assumption.)

### What the engine's panel block supplied

Per element: `kind`, `column`, `referenceColumn`, `published`, range and limit
ends, `alarmOn`, `alarmDelay`, `min`/`max`/`first`/`last`, `n`, `violated`,
`closestApproach(Fraction)`, `intervals` (alarm-active spans on the write
grid), placement, and the strings (title, reason, limit source and reason,
action, lamp words).  Per fact: an id `<kind>:<element>` with its numbers and
an English explanation (the page shows the engine's own sentence).  Messages
with their instant.  A summary with the alarm count and `alarmsMax` and its
first instant.

### The adapter change (a departure, stated)

Before this page no GUI reader carried the `panel` block: `RunResult` had no
field for it and the WASM adapter dropped it.  The page needs it, so the
adapter gained `panel?: PanelReport` (`SolverAdapter.ts`, `WasmAdapter.ts`)
and the shaping file `panelPayload.ts`.  This is the reading half S2 will
also need; it draws nothing and derives no fact.

### Rejected

* a page-side computation of the panel facts as a preview: it would be a
  second home for the engine's definitions, and the native re-run (3.4-4.4 s)
  is short enough to re-run on every change of the limit;
* a general panel renderer driven by `place`/`grid`: that is slice S2, and a
  lesson page that grew one would be the workspace under another name; the
  page draws its own six elements only;
* planting "an alarm with no action" in the exercise: S1 refuses such an
  alarm, so the defect is planted as an action that is only a description.

## 2. The steps

1. **Saturation.**  The same run twice: the 25 published series (26 columns
   of `trajectory.csv` with `t`) at 41 instants -- 1025 numbers -- against the
   six-element panel, on one of four runs.  The student writes what is
   happening, then opens the answer.
2. **Questions first.**  A table mapping task -> least information ->
   element, and the list of the 19 or so published series left off, each with
   its reason (the page's design reasoning).
3. **One value, four ways.**  i/i_lim as a bare number, on its scale with the
   limit, as a trend, as a lamp; grey while normal, colour from the engine's
   interval, always doubled by a word and a shape.  The closest approach is
   glossed as the formula the engine uses (record section 5).
4. **Hierarchy.**  Overview (one line per unit, a word, the count of active
   alarms), unit (the panel), detail (everything).
5. **Alarms.**  A slider moves the over-limiting high limit (0.25-3); each
   change re-runs the case and the page shows the engine's `violated`,
   closest approach and fact kinds (`alwaysViolated`, `neverApproached`,
   `limitOutsideRange` appear at the ends).  Then a naive panel with eight
   alarms against the worked panel's three, on a chosen run, with the page's
   onset count against the assumed handling rate.
6. **Growth.**  Three stages on the rectifier-set-too-high run: the product
   trend alone; + the over-limiting lamp; + the stack-rating bar.  Counts of
   elements and alarms per stage; the life cycle draft / tune / lock is
   described as the record's, with S1 the only slice built.
7. **Exercise.**  A panel with five planted defects; the key says which the
   engine reports and which only a person can judge.

## 3. Native runs (this tree, build of 2026-11-12, 4 cores, 2 make jobs)

Every run below is `choupoBatch` on a copy of the witness with the stated
change; seconds are wall time per run.

| run | panel | engine facts (abridged) | s |
|---|---|---|---|
| as designed | worked (shipped) | overLimiting violated 9/41 from 1600 s; currentDensity, temperature constant; alarms max 1 at 1600 s | 3.78 |
| rectifier 4.5 A | worked | voltage outOfRange (9/41, to 16.3 V); overLimiting outOfRange, violated 18/41 from 1150 s; currentDensity alwaysViolated; max 2 active | 3.54 |
| xi 0.6 | worked | overLimiting neverViolated (closest 0.12 of range); no alarm ever active; overLimiting message never fires | 3.40 |
| diluate 0.2 mol/kg | worked | diluate outOfRange 39/41 (to 2.52 S/m); no alarm ever active | ~3.5 |
| as designed | naive (8 alarms) | 6 elements violated, max 6 active at once (first at 2000 s) | ~3.6 |
| rectifier 4.5 A | naive | 7 violated incl. currentHigh alwaysViolated; max 7 active from 1400 s | ~3.6 |
| rectifier 4.5 A | growth 1 / 2 / 3 | stage 1: no fact; stage 2: lamp violated from 1150 s; stage 3: + currentDensity alwaysViolated, max 2 | ~3.6 each |
| as designed | worked, limit 0.5 | overLimiting violated 21/41 from 1000 s | ~3.6 |
| as designed | exercise | neverApproached:temperature; notPublished:diluatePH; sameQuantityAlarms on rig.i_over_ilim; constant on three elements; max 2 active | 3.82 |

**Re-run per change.**  A native run takes 3.4-4.4 s (measured 14 times,
including the 7+7 runs Playwright triggered).  That is acceptable for a
limit slider with a 300 ms debounce, so step 5 re-runs the ENGINE on every
change and no page-side preview of the facts was written.  The WASM build
was not available in this sandbox, so the browser time is not measured; it
will be slower than native.

Finding the lesson rests on: under the lower current efficiency nothing
alarms, and the unit's `deminIdeal` line moves WITH the fault, because the
unit computes Faraday's line from the declared efficiency.  The panel's
reference cannot show the fault it is made from.

## 4. Validation, as measured

* `npm run typecheck`: clean.
* `gui/tests/operatorPanels.test.ts` (11 tests, pass): the written panelDict
  parses (app's dict reader) to the shipped edbatch01 panel's `elements`,
  `messages` and `grid`; every lesson panel is well formed (unique names,
  inside the grid, no overlap, every alarm with a limit and an action, every
  limit with source and reason); the limit knob moves only the lamp; the case
  is the bundled witness with the overrides in their declared slots; the
  page's reader, through the adapter's own `extractStructured`, carries the
  ENGINE's panel block of a native run of edbatch01 unchanged (witness output
  `log.choupoBatch` and `trajectory.csv`, declared in
  `gui/tests/witnessOutputs.ts`); the stale guard refuses another panel and
  every other disturbance; the page renders its steps and limits.
* Every lesson panel was run natively (section 3) and the engine accepted it.
* Playwright at 390 and 1440 px (deviceScaleFactor 2): each step's main
  interaction driven, screenshots read, zero horizontal page overflow at
  390 px (the tables scroll inside their own box).  No emscripten here: a
  Playwright-only route hands the worker's case to the native `choupoBatch`
  of this checkout.

## 5. Not done

* No panel workspace, no drawing of an arbitrary case's panel, no draft, no
  tuning, no save, no lock (S2-S4).
* No mid-run disturbance: the unit takes none (record section 2).
* No alarm priorities in the grammar: the page states the rule, the panel
  cannot declare a priority.
* The alarm-handling rate is not taken from any source (see section 1 for
  the figures the HSE sheet quotes).

## 6. Checked against the source

Read 2026-11-13: **NUREG-0700, Revision 3** (US NRC, July 2020; full report,
558 pages, from the US DOE OSTI copy `osti.gov/biblio/1644018`, because the
nrc.gov file server refused an automated download) and **HSE, "Better alarm
handling", Chemicals Sheet No 6 (CHIS6, 2000)**, `hse.gov.uk/PuBns/chis6.pdf`,
four pages.  NOT read: ISA-18.2-2016, IEC 62682:2022, ISA-101.01-2015, the
EEMUA guide (all sold) and NUREG-0700 Revision 4 (current; per the NRC page
it updates Sections 1, 2, 6, 7 and 10 and adds Section 15, so Section 4 on
alarms is untouched but the display guidelines below, Sections 1 and 6, may
read differently in it).  NUREG numbers are guideline numbers with the page
label of Revision 3.

Status words: `read in <source>` (verdict supported / supported with a
difference); `unchecked` (its source is a paid text not read); `not addressed`
(read, and the document does not say it); `the page's own design reasoning`.
No table, threshold or figure of a standard is on the page.

| what | read in | guideline, page | verdict | status |
|---|---|---|---|---|
| an alarm must ask for an operator action; otherwise it is a trend or a message | NUREG-0700 Rev. 3; HSE CHIS6 | 4.1.1-4 (4-12): only conditions that "require operator attention or action are in the alarm state"; 4.1.2-5 (4-13); HSE p.1 "Are they all necessary, requiring operator action?" | supported | read (was: ISA-18.2, IEC 62682, EEMUA 191, unchecked) |
| one cause, one alarm | NUREG-0700 Rev. 3 | 4.1.2-9 (4-14), Table 4.1 causal and multisetpoint rows (4-3) | supported with a difference: the guide says the consequence alarm MAY be suppressed (kept retrievable, 4.1.3-2, 4.1.3-3), "only the alarm message associated with the main event may be presented", never removed; the page's reason (operators acknowledge both unread) is not in the guide | read for the rule; the reason is the page's own; ISA-18.2/IEC 62682 not read |
| alarms carry priorities | NUREG-0700 Rev. 3; HSE CHIS6 | 4.1.3-1 (4-14): "presented in prioritized form to indicate urgency"; HSE p.2 "Use about three priorities", based on consequences | supported | read |
| a normal end of batch is a message, not an alarm | NUREG-0700 Rev. 3; HSE CHIS6 | 4.1.2-5 (4-13): status indications "generally should not be presented through the alarm system display"; 6.1.2-2 (6-5); HSE p.1 "process status indicators should not be designated as alarms" | supported with a difference: "generally should not", not "never" (the guide allows them if readily told apart from alarms); the page now says "not an alarm" | read; the end-of-batch example is the page's |
| the rate of alarms a person can handle is limited; the alarm flood as the classic failure | NUREG-0700 Rev. 3; HSE CHIS6 | 4.1.2-1 (4-12): alarm system must not "overload the operator's cognitive processes"; 4.1.2-2 (4-12): "no specific guidance on the degree of alarm reduction required"; HSE p.1: 275 alarms in the last 11 minutes at Texaco Milford Haven, "alarm floods" | supported (the guide gives no figure; HSE quotes EEMUA's) | read |
| colour reserved for the abnormal (a grey panel when normal) | NUREG-0700 Rev. 3 | 1.3.8-1 (1-46) "employed conservatively and consistently"; 1.3.8-4 (1-47); 4.1.1-4 (4-12) | supported with a difference: the guide asks for conservative, consistent colour and saturated colour for critical data, and a dark board for the ALARM state; it has no "all grey when normal" rule | read for conservative use; "grey when normal" is the page's design choice; ISA-101.01 not read |
| colour always doubled by a word or a shape | NUREG-0700 Rev. 3 | 1.3.8-10 (1-50): "Color coding should be redundant with some other display feature" (monochrome, printout, colour vision impairment) | supported | read (was: ISA-101.01, NUREG-0700 Rev. 4 contents, unchecked) |
| display hierarchy overview / unit / detail | NUREG-0700 Rev. 3 | 6.1.2-1, 6.1.2-2, 6.1.2-5 (6-4 to 6-6), 6.1.3-1 (6-7), 1.1-14 (1-9) | supported with a difference: an overview showing status and alarms at a glance and leading to detail is read; three levels and a "unit" level are not in the guide, and it says no overview should be provided where it would distract (6.1.2-1) | overview read; the three-level arrangement is the page's; ISA-101.01 not read |
| start from the operator's questions; task -> minimum information -> element | NUREG-0700 Rev. 3 (principle only) | 1.5-6 (1-57): "information irrelevant to the task should not be displayed"; 1.1-1 (1-6) format follows the task | supported with a difference: the principle is in the guide; the three questions and the mapping table are the page's method | the page's own design reasoning, with the principle read |
| every alarm has a defined action (the page's exercise defect, an action that is only a description) | NUREG-0700 Rev. 3; HSE CHIS6 | 4.5-1 (4-35): response procedures for alarms that require a response; HSE p.2 "Have a defined response to each alarm", p.3 "eliminate/review alarms with no defined operator response" | supported | read |
| the limit is a trade-off (timely against nuisance), so the slider moves it | NUREG-0700 Rev. 3 | 4.1.1-2, 4.1.1-3 (4-11): "tradeoff between the timely alerting of an operator ... and the creation of nuisance alarms" | supported | read |
| four forms for one value: number, scale with limit, trend, lamp | NUREG-0700 Rev. 3 | 1.1-13 (1-9) trend graphs support projecting the future state; 1.2.11-1 (1-34) zones on a scale | supported with a difference: trend and operating-range zones read; the guide does not rank bare number, scale and lamp | read for trend and zones; the comparison is the page's |
| a complex system that works grew from a simple one that worked | Gall, Systemantics (1977) | step 6 | not addressed by either document read (NUREG 1.5-6 on simplicity is related, not the claim) | paraphrase; catalogue record verified on Open Library, wording not checked against the book |
| `neverApproached` at 0.5 of the range | the operator-panel record, section 5 | steps 5, 7 | not addressed: neither document gives a threshold | the record's default, not a practice |
| the alarm-handling rate of the slider, default 2 in ten minutes | the page's assumption | step 5 | not addressed by NUREG-0700; HSE quotes other figures (one in ten minutes average, ten in the first ten minutes after an upset) | the page's adjustable assumption, labelled on the page |
| control-room ergonomics generally | ISO 11064 series (title not verified: the official page refused the fetch) | further reading in this note only | not addressed (no rule of the page rests on it) | unchecked |
| the definitions of every fact | `src/postProcessing/panel/PanelPass.cpp`; Design Guide sec:operatorPanel | all steps | not a practice rule | engine (S1), read from the run |
| NUREG-0700 exists, is a US-government report, and has sections on information displays and alarm systems | nrc.gov NUREG-0700 Rev. 4 page; Revision 3 report | references | verified | verified open source: Rev. 3 read 2026-11-13 (kind `pdf`); Rev. 4 official page fetched 2026-11-12, body not read |

Still unchecked, by name: ISA-18.2-2016, IEC 62682:2022, ISA-101.01-2015 and
the EEMUA guide as the sources of their own wording (for every rule above
that cites them, the rule is now read elsewhere; what those texts say beyond
it is unread), and ISO 11064.

## 7. Findings about the landed S1 slice (reported here; four since fixed)

Findings 1, 2, 3 and 5 were fixed on 2026-11-13 (the review notes on S1):
the record's header names the built slices and `bin/curate/check_panel.py`;
`alarmsActive` also publishes the first instant any alarm is active, the
number of written instants with one active and those periods as intervals
(the per-instant count stays unpublished, derivable from each element's
intervals); the `sameQuantityAlarms` id names the first of its elements; and
the log and this page no longer write the maximum's instant as "first at".
They are kept below as they were found.

1. The record's header still reads "CONTRACT, not built" and names the gate
   `check_operator_panel` "(proposed)"; S1 has landed and the gate is
   `bin/curate/check_panel.py`.
2. `alarmsActive` publishes only the maximum and its first instant, not the
   per-instant count the record's section 5 describes ("per instant, the
   count of elements in alarm"); the page therefore counts onsets itself
   from the per-element intervals, labelled `page`.
3. The `sameQuantityAlarms` fact's id carries the COLUMN after the colon
   (`sameQuantityAlarms:rig.i_over_ilim`), every other fact an ELEMENT name;
   a reader that splits ids into kind and element gets a column there.
4. The record lists "an alarm with no action" among the planted defects of
   its tutorial idea, but S1 REFUSES an alarm without an action, so that
   defect cannot be planted; the page plants an action that is a sentence
   ("the voltage is high"), which only a person can judge.
5. `alarmsActive` reports the FIRST instant of the maximum; on the naive
   panel of the designed run that is the last written instant (2000 s),
   because six alarms are first active together only there.  Correct by the
   definition, and worth a sentence in the Design Guide, since a reader may
   take "first at" for the start of the flood.
