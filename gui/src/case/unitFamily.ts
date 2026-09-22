/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/**
 * unitFamily -- the PFD SILHOUETTE a unit operation is drawn with.
 *
 * WHY THIS EXISTS.  Vítor, testing the flowsheet: the boxes carry no large
 * symbol of the unit operation, so they are hard to understand.  Measured,
 * the cause is worse than the complaint: the engine registers 51 unit types
 * and `unitIcons.tsx` mapped 24 of them.  The other 27 -- `gibbsReactor`,
 * `flash`, `column`, `evaporator`, `pipe` among them -- all fell to
 * `default: return IconAdjustments`, the generic settings-sliders glyph.  The
 * symbol was not small; for more than half the engine it was ABSENT AND
 * FAKED, silently, which is the shape this project refuses everywhere in the
 * solver and had never looked for in the canvas.  His own screenshot shows
 * it: the `Converter` node is a `gibbsReactor` wearing the sliders.
 *
 * A chemical engineer reads a flowsheet BY SHAPE.  A column is a tall
 * cylinder, an exchanger a circle, a compressor a trapezoid; the vocabulary
 * is the lesson, and a sheet of identical boxes teaches none of it.
 *
 * WHY FAMILIES AND NOT ONE DRAWING PER TYPE.  Fifty-one drawings is not the
 * problem -- keeping them is.  A hand-kept per-type table is what drifted to
 * 24, and it drifted in SILENCE because the default never complained.  Eleven
 * families cover every type, each type lands somewhere honest, and a new unit
 * either joins a family or is REFUSED by check_unit_families, which recounts
 * against the engine's own registry.  The table cannot go quietly short again.
 *
 * WHAT IS DELIBERATELY NOT DONE, and it is the further half: the NODE'S OWN
 * OUTLINE still is a rectangle.  Morphing the box itself into the silhouette
 * is what a printed PFD does, and it is the stronger lesson -- but in React
 * Flow the connection handles are positioned against the node's box, so
 * changing the outline moves where every wire lands.  That is a layout
 * change with a blast radius across every case, and it is not taken tonight.
 * The silhouette is drawn LARGE inside the box instead.
 *
 * AND WHERE THERE IS NO HONEST SHAPE, THERE IS NONE.  `bubbleT` and `dewT`
 * are Newton solves on a saturation condition, not equipment; `electricLoad`
 * is a stream-less sink for shaft work.  They get `calculator`, whose
 * silhouette is deliberately not equipment -- the 2026-09-07 ruling, "a
 * labelled box beats a wrong picture", applied rather than re-argued.
 */

/** The eleven silhouettes, plus the honest non-equipment one. */
export type UnitFamily =
  | "column" | "vessel" | "exchanger" | "reactor" | "machine"
  | "solidsSeparator" | "membrane" | "adsorber" | "dryer"
  | "junction" | "transport" | "calculator";

export interface FamilySpec {
  family: UnitFamily;
  /** the word a reader sees when asked what this shape is */
  label: string;
  /**
   * The silhouette, an SVG path on a 0 0 48 48 viewBox, drawn with
   * `fill: none` and a 2.2 stroke so it reads as an outline at 34 px.
   */
  path: string;
}

export const FAMILIES: readonly FamilySpec[] = [
  {
    family: "column",
    label: "column",
    //  Tall cylinder with trays -- the one silhouette every process student
    //  recognises before they can name it.
    path: "M16 6h16v36H16z M16 14h16 M16 22h16 M16 30h16 M16 38h16",
  },
  {
    family: "vessel",
    label: "vessel / drum",
    //  Horizontal drum with dished ends: a flash, a knock-out, a tank.
    path: "M10 16h28 M10 32h28 M10 16a6 8 0 000 16 M38 16a6 8 0 010 16",
  },
  {
    family: "exchanger",
    label: "heat exchanger",
    //  The circle with the through-tube, and the zigzag that says "heat".
    path: "M24 24m-17 0a17 17 0 1034 0a17 17 0 10-34 0 M10 24h6l4-7 8 14 4-7h6",
  },
  {
    family: "reactor",
    label: "reactor",
    //  Vessel with an agitator: the shaft and two blades.
    path: "M12 12h24v28a4 4 0 01-4 4H16a4 4 0 01-4-4z M24 12v16 M17 28h14",
  },
  {
    family: "machine",
    label: "pump / compressor / turbine",
    //  The trapezoid of a rotating machine, with its shaft.
    path: "M12 14l24 8v10L12 38z M36 22v4 M8 26h4",
  },
  {
    family: "solidsSeparator",
    label: "cyclone / filter",
    //  The cyclone: a short barrel over a cone, with the tangential inlet.
    path: "M14 10h20v10l-10 22-10-22z M34 14h8",
  },
  {
    family: "membrane",
    label: "membrane module",
    //  A module shell with the SELECTIVE BARRIER down the middle -- the
    //  barrier is the whole point and is drawn dashed to say "permeable".
    path: "M8 14h32v20H8z M24 14v20 M14 24h6 M28 24h6",
  },
  {
    family: "adsorber",
    label: "adsorber bed",
    //  A vertical vessel PACKED: the bed hatching is the fact.
    path: "M16 8h16v32H16z M16 16h16 M16 24h16 M16 32h16 M20 8v32 M28 8v32",
  },
  {
    family: "dryer",
    label: "dryer",
    //  An inclined drum with the solids falling through -- the rotary/spray
    //  silhouette reduced to its inclination and its curtain.
    path: "M8 18h32v14H8z M14 32v6 M22 32v6 M30 32v6 M8 18l6-6h26l-6 6",
  },
  {
    family: "junction",
    label: "mixer / splitter / valve",
    //  The valve bow-tie: two triangles meeting on the stem.
    path: "M10 14l14 10-14 10z M38 14L24 24l14 10z M24 24v-10 M18 14h12",
  },
  {
    family: "transport",
    label: "pipe / conveyor",
    //  A run of line with its flanges: transport, not transformation.
    path: "M6 20h36v8H6z M14 18v12 M34 18v12",
  },
  {
    family: "calculator",
    label: "calculated state (not equipment)",
    //  DELIBERATELY NOT EQUIPMENT: a bracketed expression.  bubbleT, dewT
    //  and electricLoad are solves and sinks, and giving them a vessel would
    //  be the wrong picture this project already ruled against.
    path: "M16 10h-6v28h6 M32 10h6v28h-6 M20 24h8",
  },
] as const;

const BY_FAMILY = new Map(FAMILIES.map((f) => [f.family, f]));

export function familySpec(family: UnitFamily): FamilySpec {
  const hit = BY_FAMILY.get(family);
  if (!hit) throw new Error(`unitFamily: no silhouette for family '${family}'`);
  return hit;
}

/**
 * Every unit type the engine registers, and the silhouette it is drawn with.
 *
 * EXHAUSTIVE BY CONTRACT, not by hope: `check_unit_families` reads
 * `src/unitOperations/UnitOperation.cpp` and fails when a registered type is
 * missing here OR when a key here names no registered type.  That gate is
 * the reason this is a GUI table at all -- without it we would be rebuilding
 * the drift that produced 24 of 51.
 *
 * Aliases are listed with their target and share its family, because they
 * construct the same class: `column` is `distillationColumn`, `FUG` is
 * `shortcutColumn`, `extract` is `extractor`, `MHeatX` is `multiStreamHX`,
 * `REquil` is `equilibriumReactor`, `boiler` and `condenser` are
 * `phaseChanger`.
 */
export const UNIT_FAMILY: { readonly [type: string]: UnitFamily } = {
  //  COLUMNS -- a tall shell whose work is done by stages inside it.
  distillationColumn: "column",
  column: "column",                 // alias of distillationColumn
  shortcutColumn: "column",
  FUG: "column",                    // alias of shortcutColumn
  absorber: "column",
  stripper: "column",
  extractor: "column",
  extract: "column",                // alias of extractor

  //  VESSELS -- a shell where a phase split happens or material sits.
  flash: "vessel",
  adiabaticFlash: "vessel",
  isothermalFlash: "vessel",
  storageTank: "vessel",
  //  A crystalliser is an agitated vessel; it is filed here rather than with
  //  the reactors because what a reader must recognise is the vessel, and
  //  the MSMPR's agitator is not what distinguishes it on a sheet.
  crystalliser: "vessel",

  //  EXCHANGERS -- heat crosses, composition does not.
  heatExchanger: "exchanger",
  multiStreamHX: "exchanger",
  MHeatX: "exchanger",              // alias of multiStreamHX
  heater: "exchanger",
  phaseChanger: "exchanger",
  boiler: "exchanger",              // alias of phaseChanger
  condenser: "exchanger",           // alias of phaseChanger
  evaporator: "exchanger",
  //  A cooling tower IS a heat exchanger to the atmosphere.  Its own
  //  hyperboloid silhouette is famous and is NOT drawn: Choupo's is a
  //  utility model, and a natural-draught tower would be a wrong picture of
  //  the mechanical-draught unit most plants actually have.
  coolingTower: "exchanger",

  //  REACTORS -- composition changes by reaction.
  cstr: "reactor",
  pfr: "reactor",
  gibbsReactor: "reactor",
  conversionReactor: "reactor",
  equilibriumReactor: "reactor",
  REquil: "reactor",                // alias of equilibriumReactor

  //  ROTATING MACHINES -- shaft work crosses the boundary.
  pump: "machine",
  compressor: "machine",
  turbine: "machine",

  //  SOLIDS SEPARATION by inertia or by a barrier.
  cyclone: "solidsSeparator",
  bagFilter: "solidsSeparator",

  //  MEMBRANES -- a selective barrier.
  membraneSW: "membrane",
  spiralWoundModule: "membrane",
  electrodialysisStack: "membrane",

  //  ADSORBERS -- a packed bed that loads and regenerates.
  psa: "adsorber",
  tsaTwinBed: "adsorber",
  ionExchanger: "adsorber",

  //  DRYERS -- water leaves a solid.
  solidDryer: "dryer",
  sprayDryer: "dryer",
  evaporativeDryer: "dryer",

  //  JUNCTIONS -- the topology bends, nothing is transformed.
  mixer: "junction",
  splitter: "junction",
  valve: "junction",
  //  gasSolidSplitter is an IDEAL spec'd split whose PSD passes unchanged --
  //  it is a splitter, not a cyclone, and drawing it as one would claim a
  //  separation mechanism the unit does not model.
  gasSolidSplitter: "junction",

  //  TRANSPORT -- material moves, unchanged.
  pipe: "transport",
  pneumaticConveyor: "transport",

  //  NOT EQUIPMENT.
  bubbleT: "calculator",
  dewT: "calculator",
  electricLoad: "calculator",
};

/**
 * The silhouette for a type, or null when the type is unknown here.
 *
 * NULL IS THE HONEST ANSWER and the caller draws the labelled box with the
 * type's own word.  It must never fall back to a shape: a wrong silhouette
 * is a claim about what the unit IS, and the generic-glyph default this
 * module replaces is exactly what that costs.
 */
export function familyOf(type: string | undefined): UnitFamily | null {
  if (!type) return null;
  return UNIT_FAMILY[type] ?? null;
}

/** Every type the table covers, for the gate and for tests. */
export function coveredTypes(): string[] {
  return Object.keys(UNIT_FAMILY).sort();
}
