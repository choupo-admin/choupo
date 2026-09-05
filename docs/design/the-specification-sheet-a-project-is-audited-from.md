# The specification sheet a project is audited from

*2026-09-04.  Vítor: "um aluno chega com o projeto final, e eu queria poder
ver na tree de diccionarios, por cada operação unitária, a folha de
especificações: correntes de entrada, de saída, dimensionamento.  Isso faz
parte de um bom projeto e devia de ser facil de auditar."*

Both architecture decisions this needed were delegated to me the same day
("peço-te para decidires e eu depois logo vejo se é intuitivo, fácil de ler e
de usar"), with a second instruction that shaped the result more than either:
*"inspira-te no OpenFOAM e vê como o dimensionamento pode ser incluído de
forma elegante na estrutura.  Isso é muito importante para o simulador poder
crescer sem dores."*

---

## 1.  What was there

Three answers, in three unrelated places, none of them per unit and none of
them where anybody audits.

* **Inlets and outlets per unit** existed — `byUnit/<unit>/ports`
  (`SolutionWriter.cpp:359`) — but ONLY under `iterations/`, which is
  numerical history, is gated by `solutionControl { write true; }`, and is off
  by default.  `converged/` is written by `StreamStateIO::writeStateDir`
  (`main.cpp:945`), a different writer, and has no per-unit view at all.
* **Sizing** existed in two flat CSVs and on the console.
* **Cost** beside it, in a third file.

And `design/` was a directory NAME, ratified in
`docs/architecture/stream-state-architecture.md:97` on 2026-07-06, that
nothing had ever written.

## 2.  The decisions, and what argued them

### D1 — the sheet is keyed on the EQUIPMENT, with the unit as its parent

    design/<SECTOR>/<unit>/<equipmentTag>
    design/<unit>/<equipmentTag>              (a flat case)

Vítor asked for a sheet per unit operation.  §2.8 of the constitution says a
flowsheet unit is a MATHEMATICAL operation while design equipment is a
PHYSICAL object, and that one unit may realise MANY items (a column model →
shell + condenser + reboiler + reflux drum + pumps).  The implemented pipeline
is 1:1.

Resolved by making the SHAPE 1:N with N = 1.  Every unit directory has exactly
one child today; the day a column yields five, the directory gains siblings
and nothing above it changes.  That honours §2.8 without building the
`system/designDict` it names — which has no reader anywhere in `src/`, and
which nobody can fill in for a corpus where no case needs it yet.

### D2 — a photograph, not a seam

The tree is removed and rewritten whole on every run, exactly as `converged/`
is.  Nothing reads it back.

That is not a defect and it is not an arity violation.  The arity doctrine
binds AUTHORED inputs; the line it draws is authored versus machine-written,
and `converged/` has been on the machine-written side since 2026-07-06.  A
file regenerated whole each run cannot drift from what produced it.

It is written as a DICTIONARY rather than a CSV, in Choupo's own grammar, and
that is the half that pays later: the day the economics reads `design/` back
— a separate binary, a drill-in that re-costs from disk — the seam is already
readable.  OpenFOAM's property, for OpenFOAM's reason: a field that is written
is a field that can be read.

### D3 — a sheet is one page

`stream-state-architecture.md:97` specifies `EV-101/{design,geometry,rating}`
— three files per item.  Overruled, on the criterion Vítor gave for judging
this work: for a pump that is fragmentation, and somebody auditing wants to
open ONE thing and read it top to bottom.  The ratified line is now wrong
about the shape and says so.

### D4 — the unit is declared where the value is computed

This is the OpenFOAM lesson, and it is the durable half of the slice.

In OpenFOAM a field file declares its own `dimensions`, so no reader needs an
external table and adding a field touches no reader.  In Choupo,
`EquipmentSizing::values` was `map<string, scalar>` — bare keys — and the
units lived in two places, neither readable by a machine: a `//` comment
beside each sizer's local variable, and a hand-written table four call frames
away inside the pass that PRINTS the table (`V_R [m3]`, `A [m2]`, `t_wall *
1000` for millimetres).  A sizer inventing a key that table did not know
printed it with no unit at all.

Worse, and found by doing the migration: **the values are not all canonical
SI, and nothing said so.**  `power` and `Q_kW` are kW; `pressureDesign` is bar
(the costing model's own local is called `P_des_bar`); `design_targetSize_um`
is micrometres; `design_wheelSpeed_rpm` is rpm.  Six keys carry their unit
inside the KEY NAME, which is the name identity this project bans for the
sector and bans here for the same reason.  A student reading `power 145.2` off
a sheet takes it for watts.

`EquipmentSizing::set(key, value, unit)` is the one door; 45 assignments
across 8 sizers migrated; nothing converted, because rebasing on SI would move
numbers in every golden that pins them — a scientific change riding on a
formatting one.  The unit is a NAMED unit, spelled as the dict grammar spells
it, not the `[M L T Theta N]` exponent vector, which the grammar also accepts
in a different slot and which would read as noise on a sheet a student hands
in.  `developerGuide.tex`'s "Adding a sizing model" template — the copy-paste
a contributor learns the contract from — taught the old pattern and was
rewritten in the same commit, because it is what kept PRODUCING the defect.

### D5 — the form is fixed, the `sizing {}` content is the type's own

Header, `inlets {}`, `outlets {}`, `sizing {}`, `cost {}`, always in that
order.  What is inside `sizing {}` is whatever the registered `EquipmentSize`
subclass computed, each value carrying the unit that sizer declared.  A new
sizer writes its own keys with its own units and NO reader changes.

That is `boundaryField { patch { type ...; } }`: the file's shape is fixed and
the block's content is chosen by a registered type.  `EquipmentSize::New` was
already that factory; this makes the file follow it.

### D6 — `design/` at the case root, not inside the unit folder

`sectors/<S>/unitOperations/<u>/` already exists and would read better.  Three
reasons against, the third decisive:

1. It is OPTIONAL.  Measured: 2 of 423 runnable cases use it (the lithium
   brine plant and esterification2sector, seven folders between them).  Every
   other case declares its units inline.
2. Review is two tasks, not one.  For "what did this student size, and what
   does it cost", scattered folders mean N places; for "show me the
   crystalliser", the unit folder wins.  Neither is better.
3. **The economics must ENUMERATE all equipment** — capital by sector, Lang
   factor, cash flow.  If the sheets live inside optional folders, that
   enumeration becomes a tree WALK whose result depends on an AUTHORING
   choice.  A single uniform directory is what makes the next layer writable
   at all.

The bridge for (2) is a symlink from the unit folder, and the pattern already
exists in the tree (`byUnit/<u>/streamFaces -> ../../streamFaces`).  Not built
here.

### D7 — the cost belongs on the sheet

`economics/` also exists (a ratified name, also unwritten).  The sheet carries
THIS equipment's cost because an auditor who has just read what was sized
should not open another file to learn what it costs.  `economics/` answers a
different question — capital by sector, cash flow, IRR — none of which fits on
one item's page.  Both are projections of one computed record.

## 3.  What the slice paid for

**A dimensionless value must declare its dimensionlessness.**  The writer
first omitted the unit word for a `-` unit, so a ratio read `L_over_D 2.5;` —
which is the grammar's raw-SI form, meaning "the caller asserts the
dimensions", and is indistinguishable, to a reader AND to a gate, from a value
whose unit somebody forgot.  That ambiguity is the exact defect the slice
exists to end.  It now writes `L_over_D [0 0 0 0 0] 2.5;` — the same grammar's
other legal spelling, and what that spelling is FOR.  Found by the gate
reporting `L_over_D carries NO UNIT` about a value that declares `-`
correctly: **a false positive that was really a format defect.**

**A port mass that is not `F_massTotal` drops the crystals.**  The first draft
computed `F * Σ z_i MW_i` by hand and printed it as `mdot`.  On
ChemicalPlantTutorial's Magma stream that is 437 kg/h short — the crystals —
while the unit's own balance closed at 100.0000 %.  `StreamMass.H` exists
because Vítor hit exactly this on flash21 on 2026-08-09, and its header says
in as many words that balance and stream-table surfaces call the total.  A
specification sheet is one of those surfaces.  **I re-implemented a
computation that has a home, and the home's comment describes my mistake.**

**A gate that rebuilds the engine is the shape that poisoned the tree.**  The
first draft of `check_design_sheet` proved the unit refusal by patching
`StirredTank.cpp`, running `make`, and rebuilding in a `finally`.  That is
precisely the 2026-08-18 incident: `finally` does not run against the SIGKILL
`gate_manifest.py` uses to time gates out.  `check_gate_selftest` is the one
gate allowed it, under `destructive_session.py`'s journal.  Replaced by a
source arm; the refusal was fired BY HAND, once, under the journal.

**That by-hand firing found a second defect** — which is why it was worth
doing rather than trusting the guard's existence.  The refusal was a `throw`
from inside the per-unit loop, so it aborted the whole walk: `heater`'s sheet
was already on disk, `reactor`'s was refused, and the run left a PARTIAL tree
with one line on stderr.  A directory that lies by omission, read as complete.
Same failure the report chain was fixed for on 2026-08-27.  A refused unit is
now skipped by name, writes no sheet at all, every other unit still gets its
page, and the refusals print together and ALWAYS.

**`**/design/` swallows this project's design RECORDS.**  The obvious
`.gitignore` rule also matches `docs/design/`.  The 135 tracked files would
have survived (git never ignores a tracked file) and every NEW record would
have been ignored in silence — in a tree whose own rule is to write the record
before promoting.  Scoped to `tutorials/**/design/` plus the one case root
that lives inside `docs/design/`, and verified both ways with
`git check-ignore` before the line was written.  The gate checks both
directions for the same reason.

**Why the ignore rule is not tidiness.**  The GUI bundle is a Vite glob over
`tutorials/*/*/**/*` that inlines every match as a raw string into the browser
build (`gui/src/cases/tutorials.ts:64`).  A committable run output is a run
output BAKED INTO THE SHIPPED SITE — one machine's stale sizing served to
every visitor before they run anything.  That is why the glob is safe today,
and it stays safe only while every generated tree is listed.  A second lock
went into the glob itself, because the first is one `.gitignore` edit away
from being gone and the failure is invisible.

**`bin/cleanCase` would have left the tree behind**, announcing a removal
count.  Its pattern list is fixed and its numeric sweep explicitly spares any
name with a letter.  Fixed — and while there, two more: `--help` ran
`sed -n '3,12p'`, which is the ASCII logo and the first line of the GPL
notice, so the one command a reader types before deleting files printed no
usage at all; and the "Removes:" list is now paired with a "deliberately NOT
removed" list, because a cleaner's list is read as the list of what is
generated.  `converged/` and `postProcessing/` are both generated and both
spared — `converged/` because a drill-in materialises a child case's `0/` FROM
it — and that is recorded as an open question rather than answered by a
pattern nobody argued for.

## 4.  What this does NOT do

* **No `system/designDict`.**  The unit→equipment mapping stays 1:1 until a
  case needs otherwise.  The directory SHAPE is what buys the future.
* **No new sizing content.**  The sheet draws what `SizingPass` computes.  No
  pipe sizer exists; vessels have no head thickness; exchangers have no pass
  count.  A sheet that draws what exists is auditable; one that fills gaps is
  not.
* **It does not make `design`/`economics` reports run by default.**  RESERVED
  for Vítor, and untouched — the sheets ride on a `sizing {}` PASS in
  `postDict`, which is a different declaration from the `reports {}` block.
* ~~It does not reach the GUI.~~  **Slice 2 shipped 2026-09-05.**  The case
  file tree grouped by the FIRST path segment and drew the rest as one row,
  and the MEMFS harvest was a single hard-coded `startsWith()` on the
  converged/ path — so `design/` would have arrived as a flat list under one
  header.  Now: the tree is RECURSIVE on the real path separator
  (`gui/src/ui/caseTree.ts`, pure and tested; `CaseWorkspace.tsx` draws it),
  collapse state is keyed on the full prefix (the case's `system/` and a
  sector's `system/` fold independently — keying on the segment was name
  identity applied to a UI), and single-child folder chains squash into one
  label while keeping the real path as identity.  The worker selects
  run-output trees from ONE list, `OUTPUT_ROOTS = ["converged", "design"]`,
  each on its own channel: `designFiles` is a separate `RunResult` field
  because `convergedFiles`' non-empty guard is read as "the run converged",
  and "no sizing pass" must stay a different fact from "did not solve".
  The tree change is visible on EVERY case, not only the nine that size —
  `constant/components/water.dat` is now a folder and a file, as it always
  was on disk.  Test: `gui/tests/caseTree.test.ts` (7 shape arms + 4 wiring
  arms that read the worker and adapter as text, because a test over the pure
  functions alone would pass with the wiring missing).  Record of the slice
  and its six mapped routes: task #74's description, folded here.
* **No number is validated.**  The gate checks that two surfaces AGREE and
  that mass is conserved; nothing here says a size is right.

## 5.  Gate

`check_design_sheet` — eight arms, of which the load-bearing one reads a
report this writer does not produce (`massBalance_byUnit.csv`), because that
is the only arm that could catch a port mass computed without the crystals,
and it did.

## 9. Slice 3 (2026-09-05, same day as slice 2): the tree says what KIND of folder it draws

Vítor, on the flagship's Case tree: *"as cores podem ser melhoradas… vê com os
generais se os alunos acham aquilo intuitivo.  Este caso é muito importante
porque eles vão terminar com um caso tão ou mais complexo que estes."*  A
review with three students' eyes (one from `flash01`, one who authored two
sectors, one asking "what did the run produce and what did I write") found
the same fact under all three confusions: the tree distinguished two kinds
(`system/`/`constant/` yellow, everything else cyan) and sorted the rest
alphabetically, so on the flagship `converged/` sat between two sectors **and
read as a fifth sector**, and nothing marked the folders the run overwrites.
The code knew — the worker harvests exactly the run outputs, the workspace
merges them from their own result fields — and threw the fact away before
drawing.  It lived in five places (worker list, two result fields, the
workspace merge, `CaseIntro`'s own positive keep-list) and as a
classification in none.

**Adopted.**  `caseTree.kindOf()` is the ONE home: `declared` (`system/`,
`constant/`) · `state0` (`0/`) · `sector` (any other folder — a sector IS a
case) · `output` (`RUN_OUTPUT_ROOTS`: `converged/ design/ iterations/
economics/ postProcessing/` and numeric instants).  Order by kind then name
(README · declared · `0/` · sectors · outputs); declared yellow, `0/` the
same family lighter, sectors cyan with a sitemap glyph, outputs dimmed with
a `run output` badge at the root whose tooltip says *edit `system/` or `0/`
instead*.  `CaseIntro` filters by `kindOf` instead of its positive list —
which had silently hidden every sector of a fractal case from the intro
(task #81, closed here).  The worker's harvest list is pinned as a SUBSET of
`RUN_OUTPUT_ROOTS` (it harvests what MEMFS produces today; the tree
classifies what the disk can hold).

**Trap paid for, predicted by the reviewer and then met:** `squash()` joins
`DRYING` + `system` into one label with prefix `DRYING/system`; a kind read
from the tail called that node *declared* and sorted the sector FIRST at the
root, above `system/` itself.  A node's kind is decided on its first OWN
segment (`nodeKind`), never on a squashed tail; the test that caught it is
kept.

**Rejected:** a synthetic "Sectors" heading (invents a level the disk does
not have — the tree's founding rule), hiding or collapsing outputs (the third
student needs to see them), colouring leaves by extension (noise in a pane
this narrow — weight carries more than hue).  **Not verified:** whether real
students find it intuitive; three imagined readers are a design argument,
not a measurement.

