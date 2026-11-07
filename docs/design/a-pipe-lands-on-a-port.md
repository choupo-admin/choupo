# A pipe lands on a port, not on the item's top centre

Status: BUILT 2026-11-05 (DEV.md 4c C229 part A, the architect's decision on
Vitor's report).  Gate `check_pipe_ports`.

## 1. What was wrong

`PlantLayout.cpp` sent EVERY pipe into and out of a placed item at its plan
centre, at its top ("Stylised: no nozzle schedule is published by any
sizer"), and a unit that realises several items was piped through the first
one the case listed.  A column's feed, reflux and bottoms met at one point on
its head; its condenser, reboiler and drum took none of the streams the unit
had.  A student group drew by hand a 3D page of the same plant whose pipe
connections were right.  The engine's layout is generated from any case and
checked (separations, zones, roads, clashes); the connections were the part
of the picture it got wrong.  `equipmentModel.ts` drew nozzles as decoration
at one place and the pipe ended at another.

## 2. The rule

Each pipe end that lands on a placed item lands on a PORT, a point on the
item's surface from three facts and nothing else:

1. the item's KIND (the sheet's `equipment` word) and its orientation select
   the geometry;
2. its SIZED dimensions (the footprint the layout already carries: diameter,
   length, height; for a column shell also the sheet's `nTrays` and
   `traySpacing`) -- never an invented one;
3. the stream's ROLE in its unit, read off the unit's DECLARED ports (the
   position in `in`/`inputs`/`outputs`, the `feeds` and `sideDraws` stages)
   and, for a drum, off the produced stream's own vapour fraction.  Never off
   a stream's name: the corpus names its streams as the author likes.

| Unit / item | Ports |
|---|---|
| distillation column | feed on the SHELL, side, at its stage's tray height; overhead at the head (top) unless a reflux drum is placed (distillate leaves its bottom) or a condenser (its outlet end); bottoms at the shell's base; side draws on the shell at their stage |
| shell-and-tube exchanger | tube inlet / outlet at the two ends of the axis; shell inlet on top at +0.35 L, shell outlet underneath at -0.35 L (counter-current); the first declared pair of a two-stream exchanger is the shell side |
| flash drum | inlet on the side at mid-height, vapour on top, liquid at the bottom (horizontal: top, top and bottom, along the axis) |
| reactor | inlet and outlet at the ends of the axis (top to bottom when vertical) |
| compressor, pump, turbine | suction / inlet at the upstream end of the axis, discharge / exhaust on top over the downstream end |
| storage tank | fill nozzle on the roof, outlet low on the shell |
| anything else | the item's top centre, `origin default`, and the run names the unit types |

A side nozzle faces the other end of its pipe (east when the other end is to
the east).  Each port has a one-metre stub (a drafting value), so the rack
route leaves from a point outside the footprint, not through the body.  The
free height of a column shell, `H - (nTrays - 1) * traySpacing`, is split
equally between head and sump: the sheet does not publish them separately,
and the error is at most the difference of the two defaults.  Two streams on
the same port stand off each other by 0.2 of the item's narrow plan
dimension, alternately.

## 3. It is a convention, and it says so

No sizer publishes a nozzle schedule, so the position is a drafting
convention, not a vendor's.  The run says so ONCE (`AdvisoryLog::
addAnnouncedOnce`, stderr, the caveat block) and the result carries it as
`layout.portConvention`; every pipe publishes `fromPort` / `toPort` (item,
port, origin `convention|declared|default`, role sentence, point) and the
GUI draws each pipe ending there.  `equipmentModel.ts` draws a nozzle at each
published port and drops the recipe's own decorative ones, so a nozzle is
never in one place and its pipe in another; the body never changes.

The case moves a port: `ports { <stream> { item <id>; side top|bottom|east|
west|north|south; [elevation <m>;] } }`.  REFUSED by name: a stream the run
does not have, an item that is not placed, an item of a unit at neither end
of the stream, an unknown side, an elevation on a top or bottom port, an
elevation outside the item.  A declared `pipes` route now begins at the port
(its stub), not at the top centre.

## 4. Measured, and not done

* Blast radius: the `layout` golden rows of pipe `length` move on every case
  with pipes; the lists are in the commit.  No finding changed verdict.
* A stream with SEVERAL consumers is still listed `notRouted` (a pipe has two
  ends).  MEASURED on the four plants with a layout (greenAmmoniaPEQ_baseCase,
  ammonia02_full_plant, aceticAcid02_plant, swro01_campoDalias): none has one.
* The router's overshoot to the rack lane was hidden by a collinear merge in
  `tidy()` when the nozzle stood on the same plan line as the fence leg
  (ammonia02's `productStored`: the pipe runs to the rack and back); the new
  port moves the nozzle off that line and the true length shows.  Not fixed
  here: it is the rack model, not the port.
* No nozzle size, no manway, no relief outlet position.

## 5. Rejected

* A nozzle schedule invented per kind with sizes: converts "no data" into
  "falsely specified".
* Reading the role from a stream's name (`distillate`, `bottoms`): a name is
  the author's, the port's position is the unit's.
* Piping every stream of a multi-item unit through one item chosen by the
  case's order: the old rule, the defect.
* Decorative nozzles kept beside the published ports: two places for one
  nozzle.
