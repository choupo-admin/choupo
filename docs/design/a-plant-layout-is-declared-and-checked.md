# A plant layout is declared, checked and drafted

**Kind:** ADR · **Status:** SHIPPED 2026-10-17 (slice 1 of commission C75,
on stated defaults) · **Gate:** `check_plant_layout` · **Witness:**
`tutorials/plant/ammonia02_full_plant`

## 1. What was asked

Vítor, 2026-10-17, after a student of his had an assistant draw her
flowsheet's plant in 3D: *"Podes fazer um EduTool com isso, criar esse
dicionario e criar uma tool para gerar o layout 3D?"*  The commander's
reading, put to him first: the 3D picture is the easy half; what a student
learns is PLACEMENT -- separation distances, access, flow order, sectors as
areas -- and later what it costs (pipe lengths).  The same day he added the
prevailing wind and the hazardous-area (ATEX) zones: *"acrescenta o vento
dominante e as zonas ATEX"*.  Slice 1 is the dictionary, the engine check,
the draft tool and the GUI view; slice 2 (the EduTool lesson) waits on his
yes to its outline.

## 2. The grammar -- `system/layoutDict`

Optional.  Absent, no line of any output changes (measured: the 20 cases with
a sizing pass and the 73 `FASTSET` cases, console, stderr and every design
sheet, byte-identical against a build of the parent commit).

```
items
(
    { item "converter"; x 40 m; y -6 m; z 0 m; orientation vertical; }
    { item "makeupComp"; x 6 m; y -8 m; z 0 m; orientation alongX;
      footprint { length 8 m; width 4 m; height 4 m; }      // no size of its own
      release { source "..."; reason "...";
                zones ( { zone 2; radius 7.5 m; height 6 m; } ); } }
    { nonProcess "controlRoom"; kind building; x -30 m; y -40 m; z 0 m;
      orientation alongX; footprint { length 15 m; width 10 m; height 4 m; }
      ignition "non-hazardous-area electrical equipment and people"; }
);
areas { REACTION { xMin 0 m; xMax 40 m; yMin -10 m; yMax 10 m; } }   // sectored cases
separation
(
    { source "..."; reason "..."; measure edgeToEdge;
      distances ( { between ( vessel compressor ); distance 9 m; } ); }
);
wind { from 225 deg; planNorth 0 deg; halfAngle 30 deg; reach 60 m;
       source "..."; reason "..."; }
```

* **Identity is `EquipmentSizing::itemId()`** -- the design sheet's own id
  (`converter`, `column09/shell`, `DRYING.SD`); nothing splits it.
* `(x, y)` is the item's plan CENTRE, `z` its BASE elevation; plan `+y` is
  the plan's north.  A list cannot carry a unit in this grammar, so every
  length is its own `keyword value unit;`.
* `orientation` is one of `vertical`, `alongX`, `alongY` -- a cylinder's axis
  or a box's length.  Rotation by an arbitrary angle is not in this slice.
* `kind` is the design sheet's `equipment` word for a sized item and is
  REFUSED if written there (one home); a `nonProcess` item declares its own.
* An ANGLE must carry its unit (`deg`, added to `core/Units.cpp` and its GUI
  mirror as the degree of arc in radians).  The grammar's raw form is SI, and
  for an angle that is the radian, so `from 225;` would silently read as
  225 rad; it is refused instead.
* `measure` is required -- `edgeToEdge` or `centreToCentre` -- because a
  distance table means one or the other and the reader must not guess which.
* Every `separation` table, every `release` and the `wind` carry a `source`
  and a `reason`.  An `ignition` carries its reason as its value.

## 3. The footprint rule -- the item's own, or declared

| what the sizer published | footprint |
|---|---|
| `D` and `H` (vessel, stirred tank, column shell and drum, catalyst-bed shell, converter shell) | cylinder of diameter `D`, length `H` |
| `shellID` and `tubeLength`, one shell (a DESIGNED shell-and-tube) | cylinder of diameter `shellID`, length `tubeLength` |
| `chamberDiameter` and `chamberHeight` (spray dryer) | cylinder |
| anything else (a compressor's power, an evaporator's or a rated exchanger's area, a cyclone's body diameter alone, a storage tank's volume, a crystalliser's magma volume, a shell-and-tube of several shells) | **no size is invented**: the case declares `footprint { length; width; height; }`, a box |

The rule is keyed on the PAIR OF KEYS a sizer published, never on its kind
word, so a new sizer that publishes `D` and `H` is placed without this code
changing.  A footprint declared on an item that publishes its own size is
REFUSED: one item, one size.  A `nonProcess` item always declares a box.

Never placed on their own, and refused by name if named: `sieveTrays`
(inside the column shell), `catalystCharge` (inside the bed), `reliefValve`
(mounted on the item it protects), and every member a converter shell lists
in its `encloses` (a basket inside that shell).

## 4. What the engine does with it

Run after the sizing pass, on the direct path and on an outer driver's
representative pass (`postProcessing/layout/PlantLayout.{H,cpp}`, called from
`choupoSolve/main.cpp`).

**REFUSED** (exit 2, by name, with the remedy): a layoutDict on a run that
sized nothing; an entry that is neither or both of `item`/`nonProcess`; an
item naming no sized item (the refusal lists the placeable ones); an item
placed twice; an internal; two footprints that overlap ON THE PLAN AND IN
HEIGHT (stacking is not refused: two items whose height ranges do not meet
do not collide); an area for a sector the case does not have, or areas on a
flat case; a pair of kinds whose distance is declared twice; and every
malformed declaration (a missing length, an angle with no unit, a zone that
is not 0/1/2, a non-positive size).

**ANNOUNCED** (stderr at its site + `AdvisoryLog` category `layout`, so it
reaches the end-of-run caveat block under PLANT LAYOUT and the result JSON):

* a pair closer than its declared separation -- both distances;
* an item whose footprint is not inside its sector's declared area;
* an ignition source inside a declared ZONE ENVELOPE -- a vertical cylinder
  about the release item's plan centre, of the declared radius, from the
  item's base to the declared height above it; inside means the ignition
  item's footprint comes within the radius of that axis AND its height range
  meets the envelope's.  The distance from the axis and the radius are both
  named;
* an ignition source DOWNWIND of a release source -- the true bearing from
  the release item's centre to the ignition item's (plan bearing +
  `planNorth`) lies within `halfAngle` of the downwind direction (`from` +
  180 deg) and the centre distance is within `reach`; every number in that
  rule is declared;
* a separation rule naming a kind no placed item carries (it checks nothing);
* the sized items left unplaced.

**Announce, not refuse, for every shortfall -- the argued default.**  An
overlap is not a layout at all; a short distance IS a layout, a draft whose
shortfall the student must see and defend.  The same holds for an ignition
source in a zone: the run is a design draft, and refusing it would hide the
picture that shows the problem.  Refusing would also make the declared
numbers -- which are assumptions -- into a hard contract the engine cannot
justify.

The result JSON carries `layout {}` (items with position, extents, shape,
orientation, where the size came from, sector, hazards; areas; separation
tables; wind; findings; unplaced; internal; a summary) -- one record per line,
each carrying an `"id"`.

**Pinned by a new golden row kind, `layout`** (published => pinned): per item
`x y z dx dy dz` and `shape orientation footprintFrom` as words; per finding
`value limit`; the summary counts.  The source/reason sentences and the zone
and wind declarations are the case's own words echoed and are NOT pinned --
what they DECIDE is, through the findings and the count.  The existing kinds
could not read the block (`equipment` resolves inside `"equipment": [...]`
only), and folding layout numbers into a KPI would be a second home.

No `design/layout` file is written.  `design/` is a tree of one sheet per
physical item; a plot plan is about the PLANT, and the result block plus the
case's own layoutDict already say everything a file would.

## 5. The draft tool -- `bin/choupo-layout --draft <case> [--force]`

A bash wrapper over `choupoSolve --layout-draft` (the `choupo-lint` shape),
so the footprint rule keeps ONE home, in C++.  It solves the case, then:

1. orders the placeable items by the flowsheet's declared unit order (a valid
   flow order: the sequential-plan contract) and groups them by sector;
2. places them on one line, `y = 0`, at grade, each at the smallest `x` that
   keeps (i) a clear gap to its predecessor equal to the larger plan extent of
   the two -- a DRAFTING spacing for access, said to be one, not a safety
   distance -- and (ii) every separation the case already declared, against
   every item already placed; positions are rounded UP to the centimetre the
   file prints;
3. writes one area per sector: the items' extent, widened by half the gap to
   the neighbouring sector so adjacent areas meet midway;
4. lists, commented out, every item that publishes no size, for the student
   to place with a footprint they defend, and the internals;
5. writes NO separation table, wind or zone -- commented templates only, with
   the sentence that Choupo ships none.

It refuses BEFORE solving when `system/layoutDict` exists and `--force` was
not given, and refuses before writing when the run sized nothing.  With
`--force` it carries the existing file's separation tables, wind, declared
footprints, non-process items and hazard declarations into the new draft.
The same run then CHECKS the draft it wrote, so the proposal is proved to
parse and to hold.  The file's header says it is a proposal the student must
own -- the `choupo-init0` / `choupo-resolve --draft` posture.

## 6. The GUI -- Reports, "Plant layout (3D)"

An earned section, shown only when the result carries a layout.
`gui/src/case/plantLayout.ts` (pure, vitest) maps the block onto a scene --
coordinate bookkeeping (plan `(x, y, z-up)` to three.js `(X, Y-up, Z = -y)`)
and the trigonometry of the declared wind angle, nothing else.
`ui/plotting/PlantLayout3D.tsx` draws it: cylinders where the engine says
cylinder, labelled boxes otherwise (*a labelled box beats a wrong picture*),
sector areas on the ground, zones as translucent cylinders distinguished by
OPACITY, EDGE STYLE (solid / wire / dashed) and the WORD in their label --
never colour alone, so a greyscale print keeps them apart -- flagged items
labelled FINDING, a separation shortfall as a dashed line carrying both
distances, a wind arrow.  Tables below repeat every position and finding, so
a reader without WebGL loses nothing.

**The dependency: three.js** (`three@^0.170.0`, MIT; types `@types/three`,
MIT, dev only).  Measured: `plotly.js-basic-dist-min`, which the GUI ships,
has NO 3D traces.  The alternatives were Plotly's gl3d bundle (a second,
larger Plotly distribution beside the one the app already loads, and its
mesh3d traces have no cylinder primitive -- every vessel would be a
hand-triangulated mesh) and three.js (the conventional WebGL library, a
cylinder and a box are primitives, orbit controls and HTML labels ship with
it).  three.js is loaded with a dynamic `import()` the first time a layout is
shown, so a session that never opens one never downloads it; it is
JavaScript, no WebAssembly, and touches nothing of the engine's WASM build.
`gui/public/THIRD_PARTY_NOTICES` is regenerated from the lockfile.

## 7. The witness

`ammonia02_full_plant` -- a flat synthesis loop, 0.15 s, seven sized items:
three vessels with their own D and H, two compressors and two RATED
exchangers that publish no size and so declare boxes; a control room as a
non-process ignition source; a separation table, a wind and zones on the
hydrogen-bearing items.  Its file was started with the draft tool and moved
by hand.  **One pair is deliberately too close** (the let-down drum 1.9 m
from the separator against 4 m declared), so the shipped case shows the
announcement a student must learn to read; the refusals and the other
announcements are FIXTURES the gate builds, not defects in a tutorial.
Every number in the file that is not the engine's own size is an author-set
assumption, said so in those words: *"a citation invented for a round number
converts unsourced into falsely sourced."*

## 8. Rejected

* **A shipped spacing or zoning table.**  CCPS, GAP 2.5.2, Mecklenburgh,
  IEC 60079-10-1, EI 15 and API RP 505 grant no redistribution (CLAUDE.md
  §10); every number is the case's own.
* **Inventing a footprint** for an item with no published size (a
  compressor's box from its power by some correlation).  It would be a size
  nobody declared and no sizer computed -- the "default nobody declared".
* **Refusing a short distance** (argued in §4).
* **The layout check as a `postDict` pass.**  A layout is not post-processing
  of the flowsheet's result in the sense the chain uses -- it is a separate
  declaration about the plant, and its own file keeps the postDict a pure
  parameter file.
* **The draft tool in Python**, re-deriving the footprint from the design
  sheets: a second home for the footprint rule.
* **A `design/layout` sheet** (§4).
* **Plotly gl3d** (§6).

## 9. Not in this slice, named

Pipe lengths and their cost (the next slice: it needs a pipe-rack model and a
routing rule); structures, racks and multi-level steel (elevation is declared
but nothing checks access); rotation by an arbitrary angle; a stacking or
support check; the EduTool lesson (slice 2, awaiting Vítor's yes to its
outline); whether any declared distance or zone extent is SENSIBLE -- by
design that is the author's to defend.
