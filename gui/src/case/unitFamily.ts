/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/**
 * unitFamily -- the PFD symbol a unit operation is drawn with.
 *
 * WHY THIS FILE WAS REWRITTEN THE DAY AFTER IT SHIPPED.  It first grouped the
 * engine's 51 registered types into ELEVEN families, and Vítor found the
 * consequence within the hour: `mixer` and `quenchSplit` wore the same
 * bow-tie.  A mixer and a splitter are OPPOSITE operations.  Nor were they
 * alone -- `pump`, `compressor` and `turbine` shared one trapezoid, and the
 * five reactors shared one stirred vessel.
 *
 * THE REASONING ERROR IS WORTH MORE THAN THE FIX.  The families were argued
 * on MAINTENANCE: a hand-kept per-type table is what had drifted to 24 of 51
 * in the first place.  But the same slice shipped `check_unit_families`,
 * which recounts against the engine's registry -- so maintenance was already
 * solved, and the coarseness went on being paid for a problem that no longer
 * existed.  GRANULARITY MUST FOLLOW MEANING, and a gate that prevents drift
 * is what makes fine granularity affordable.
 *
 * THE RULE, AND IT IS NOT A JUDGEMENT.  `UnitOperation::registerBuiltins()`
 * maps each registered NAME to the C++ CLASS it constructs: 51 names, 42
 * classes.  The nine names that share a class are the same object under two
 * words (`flash` and `isothermalFlash`; `boiler`, `condenser` and
 * `phaseChanger`; `column` and `distillationColumn`; ...).  So:
 *
 *     TWO TYPES SHARE A SYMBOL IF AND ONLY IF THEY CONSTRUCT THE SAME CLASS.
 *
 * Nothing here decides what "looks similar enough".  The engine has already
 * answered, in the only place that can be checked, and `check_unit_families`
 * derives the map from that source and refuses any sharing the engine did not
 * sanction -- and equally refuses two classes drawn with the same path.
 *
 * WHAT A SYMBOL MUST SHOW is the thing that makes the block that block: the
 * agitator on a CSTR, the serpentine tube on a PFR, the packing on an
 * absorber and the trays on a distillation column, the fan on a mechanical-
 * draught cooling tower.  Where the distinction is a SPECIFICATION rather
 * than hardware it is NOT drawn -- an isothermal and an adiabatic flash are
 * one drum, and the badge under the name says which.  (The adiabatic one is
 * the exception that proves it: insulation IS hardware.)
 *
 * WHERE THERE IS NO HONEST SHAPE THERE IS NONE.  `bubbleT`, `dewT` and
 * `electricLoad` are a saturation solve, a saturation solve and a stream-less
 * work sink; they get drawings that are deliberately not equipment, per the
 * 2026-09-07 ruling that a labelled box beats a wrong picture.  For the same
 * reason the cooling tower is NOT the famous natural-draught hyperboloid:
 * Choupo's is a utility model, and most plants run induced draught.
 *
 * DRAWN IN INK, not in the brand accent -- see UnitNode.tsx for why.
 */

/** One drawing, keyed by the ENGINE CLASS it depicts. */
export interface UnitSymbolSpec {
  /** the C++ class in src/unitOperations, as UnitOperation.cpp constructs it */
  cls: string;
  /** the word a reader sees when asked what this shape is */
  label: string;
  /**
   * The silhouette, an SVG path on a 0 0 48 48 viewBox, drawn with
   * `fill: none` and a 2.2 stroke so it reads as an outline at 41 px.
   */
  path: string;
}

export const SYMBOLS: readonly UnitSymbolSpec[] = [
  //  ---- REACTORS.  Five classes, five drawings: a student who cannot tell
  //  an RCSTR from an RPlug on the sheet has not been taught the difference.
  { cls: "CSTR", label: "stirred-tank reactor (CSTR)",
    //  Vessel, shaft, TWO impellers -- the agitation is the model.
    path: "M12 10h24v26a4 4 0 01-4 4H16a4 4 0 01-4-4z M24 10v20 "
        + "M18 22h12 M18 30h12" },
  { cls: "PFR", label: "plug-flow reactor (tubular)",
    //  A serpentine TUBE.  Nothing is mixed; everything travels.
    path: "M10 13h27a5 5 0 010 10H11a5 5 0 000 10h27" },
  { cls: "ConversionReactor", label: "conversion reactor (stoichiometric)",
    //  A box the reaction passes THROUGH: conversion is declared, not solved.
    path: "M10 13h28v22H10z M15 24h14 M27 20l5 4-5 4" },
  { cls: "GibbsReactor", label: "Gibbs reactor (free-energy minimum)",
    //  The vessel over a MINIMUM: what this reactor does is minimise G.
    path: "M12 10h24v26a4 4 0 01-4 4H16a4 4 0 01-4-4z "
        + "M16 20q8 14 16 0 M24 28v4" },
  { cls: "EquilibriumReactor", label: "equilibrium reactor",
    //  The vessel with the equilibrium double arrow.
    path: "M12 10h24v26a4 4 0 01-4 4H16a4 4 0 01-4-4z "
        + "M17 21h14 M28 18l3 3-3 3 M31 29H17 M20 26l-3 3 3 3" },

  //  ---- PHASE SPLIT.  A flash drum is a drum; the SPEC is what differs, and
  //  the spec is written on the badge, not drawn.
  { cls: "IsothermalFlash", label: "flash drum (isothermal)",
    //  Vertical drum, dished ends, a LIQUID LEVEL and a vapour outlet.
    path: "M16 12v22 M32 12v22 M16 12a8 4 0 0116 0 M16 34a8 4 0 0016 0 "
        + "M16 28h16 M24 8V4 M32 36h6" },
  { cls: "AdiabaticFlash", label: "flash drum (adiabatic)",
    //  The same drum INSULATED -- the double wall is the adiabatic claim.
    path: "M16 12v22 M32 12v22 M16 12a8 4 0 0116 0 M16 34a8 4 0 0016 0 "
        + "M16 28h16 M24 8V4 M12 13v22 M36 13v22" },

  //  ---- HEAT.  Four different blocks; Aspen draws Heater and HeatX apart
  //  and so must we.
  { cls: "Heater", label: "heater / cooler (one stream)",
    //  One stream and a heating element: no second side to draw.
    path: "M11 15h26v18H11z M16 21l4 8 4-8 4 8 4-8 M6 24h5 M37 24h5" },
  { cls: "HeatExchanger", label: "heat exchanger (shell and tube)",
    path: "M24 24m-16 0a16 16 0 1032 0a16 16 0 10-32 0 "
        + "M10 24h6l4-7 8 14 4-7h6" },
  { cls: "MultiStreamHX", label: "multi-stream exchanger (cold box)",
    //  A block that SEVERAL streams cross -- the plate-fin/cold-box shape.
    path: "M12 12h24v24H12z M6 18h36 M6 24h36 M6 30h36" },
  { cls: "PhaseChanger", label: "boiler / condenser (phase change)",
    //  A shell with a CONDENSING COIL: the phase change is the duty.
    path: "M9 14h30v20H9z M14 20c4 0 4 8 8 8s4-8 8-8 4 8 8 8" },
  { cls: "Evaporator", label: "evaporator",
    //  Vessel, calandria at the base, vapour off the top.
    path: "M14 14h20v16a7 7 0 01-7 7h-6a7 7 0 01-7-7z "
        + "M18 26h12 M18 30h12 M24 14V6 M24 6h9" },
  { cls: "CoolingTower", label: "cooling tower (mechanical draught)",
    //  A FAN over packing.  NOT the natural-draught hyperboloid: Choupo's is
    //  a utility model and most plants run induced draught.
    path: "M12 18h24v18H12z M24 18V9 M15 9h18 M17 13h14 M16 26h16 M16 31h16" },

  //  ---- ROTATING MACHINES.  Three symbols, and the trapezoids point
  //  opposite ways because the gas is compressed one way and expanded the
  //  other; a single "machine" shape hid exactly that.
  { cls: "Compressor", label: "compressor",
    //  Tall inlet, short discharge: volume falls.
    path: "M13 11l22 8v10L13 37z M35 19v10 M8 24h5" },
  { cls: "Turbine", label: "turbine / expander",
    //  Short inlet, tall discharge: volume rises.
    path: "M13 19l22-8v26l-22-8z M13 19v10 M35 24h5" },
  { cls: "Pump", label: "pump (centrifugal)",
    //  The circle with the impeller triangle and the discharge riser.
    path: "M24 28m-13 0a13 13 0 1026 0a13 13 0 10-26 0 "
        + "M19 34l12-6-12-6z M24 15V7 M24 7h9" },
  //  ---- TOPOLOGY.  The four that collided, and the collision is the whole
  //  reason this file was rewritten: a mixer and a splitter are opposite
  //  operations and wore one bow-tie.
  { cls: "Mixer", label: "mixer",
    //  Streams CONVERGE.  Read left to right: many in, one out.
    path: "M8 12l14 10 M8 36l14-10 M8 24h14 M22 24h18 M22 18v12" },
  { cls: "Splitter", label: "splitter",
    //  Streams DIVERGE.  The mirror, and unmistakably so.
    path: "M8 24h18 M26 24l14-10 M26 24l14 10 M26 24h14 M26 18v12" },
  { cls: "Valve", label: "valve",
    //  The bow-tie is the VALVE's own symbol and belongs to nothing else.
    path: "M10 14l14 10-14 10z M38 14L24 24l14 10z M24 24v-9 M18 15h12" },
  { cls: "GasSolidSplitter", label: "gas-solid splitter (ideal)",
    //  A splitter whose branches are PHASES -- the solids branch carries the
    //  particles.  It models no mechanism, so it is not drawn as a cyclone.
    path: "M8 24h18 M26 24l14-10 M26 24l14 10 "
        + "M32 33a1.6 1.6 0 103.2 0a1.6 1.6 0 10-3.2 0 "
        + "M37 36a1.6 1.6 0 103.2 0a1.6 1.6 0 10-3.2 0" },

  //  ---- COLUMNS.  Four classes.  Trays and packing are different hardware
  //  and are drawn differently; the shortcut column is a DIFFERENT CLASS from
  //  the rigorous one, so it gets its own mark rather than borrowing.
  { cls: "DistillationColumn", label: "distillation column (trayed)",
    path: "M16 6h16v36H16z M16 14h16 M16 22h16 M16 30h16 M16 38h16" },
  { cls: "ShortcutColumn", label: "shortcut column (FUG)",
    //  A column whose INTERIOR IS NOT RESOLVED: the trays are short marks,
    //  because Fenske-Underwood-Gilliland returns a NUMBER of stages, never
    //  a stage-by-stage profile.  The drawing says which question was asked.
    path: "M16 6h16v36H16z M20 15h8 M20 23h8 M20 31h8 M20 39h8" },
  { cls: "Absorber", label: "absorber (packed)",
    //  PACKING, and a solvent entering at the top: the solute leaves the GAS.
    path: "M16 6h16v36H16z M18 13q6 7 12 0 M18 22q6 7 12 0 M18 31q6 7 12 0 "
        + "M24 6V2 M21 5l3 3 3-3" },
  { cls: "Stripper", label: "stripper (packed)",
    //  The same packing, the arrow REVERSED: the solute leaves the LIQUID.
    path: "M16 6h16v36H16z M18 13q6 7 12 0 M18 22q6 7 12 0 M18 31q6 7 12 0 "
        + "M24 6V2 M21 3l3-3 3 3" },
  { cls: "Extractor", label: "liquid-liquid extractor",
    //  Two liquids inside one shell: the droplets are the second phase.
    path: "M16 6h16v36H16z M20 13a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0 "
        + "M24 24a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0 "
        + "M19 33a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0" },

  //  ---- SOLIDS.
  { cls: "Cyclone", label: "cyclone",
    //  Barrel over cone, with the TANGENTIAL inlet that makes it a cyclone.
    path: "M14 10h20v10l-10 22-10-22z M34 14h8 M24 10V4" },
  { cls: "BagFilter", label: "bag filter",
    //  The BAGS are the equipment; a box would be any vessel.
    path: "M10 10h28v10H10z M15 20v14a2 2 0 004 0V20 M24 20v14a2 2 0 004 0V20 "
        + "M33 20v10a2 2 0 004 0V20" },
  { cls: "Crystalliser", label: "crystalliser",
    //  An agitated vessel carrying CRYSTALS -- the population is the point.
    path: "M12 10h24v24a6 6 0 01-6 6H18a6 6 0 01-6-6z M24 10v10 "
        + "M19 20h10 M19 30l3-3 3 3-3 3z M27 34l2.5-2.5 2.5 2.5-2.5 2.5z" },
  { cls: "PneumaticConveyor", label: "pneumatic conveyor",
    //  A duct carrying PARTICLES: transport with a load, not an empty pipe.
    path: "M6 17h30l6 7-6 7H6z M12 22a1.5 1.5 0 103 0a1.5 1.5 0 10-3 0 "
        + "M20 27a1.5 1.5 0 103 0a1.5 1.5 0 10-3 0 "
        + "M27 21a1.5 1.5 0 103 0a1.5 1.5 0 10-3 0" },

  //  ---- DRYERS.  Three classes and three mechanisms.
  { cls: "SprayDryer", label: "spray dryer",
    //  Chamber, ATOMISER at the top, the spray cone below it.
    path: "M13 8h22v20l-11 13-11-13z M24 8V3 M20 14l4-4 4 4 "
        + "M19 20l-1 4 M24 21v4 M29 20l1 4" },
  { cls: "SolidDryer", label: "rotary dryer",
    //  An INCLINED rotating drum on its rollers.
    path: "M8 20l30-8 2 8-30 8z M14 30v4 M32 25v4 "
        + "M12 36a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0 "
        + "M30 31a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0" },
  { cls: "EvaporativeDryer", label: "evaporative (through-flow) dryer",
    //  A chamber the DRYING AIR passes through, vapour leaving the top.
    path: "M12 14h24v20H12z M6 24h6 M36 24h6 "
        + "M18 14v-6 M24 14v-8 M30 14v-6" },

  //  ---- SORPTION BEDS.  Three classes; what differs is how they regenerate.
  { cls: "PSA", label: "pressure-swing adsorber",
    //  A packed bed with the PRESSURE swing marked on it.
    path: "M16 8h16v32H16z M16 16h16 M16 24h16 M16 32h16 "
        + "M36 14v14 M33 17l3-3 3 3" },
  { cls: "TSATwinBed", label: "temperature-swing adsorber (twin bed)",
    //  TWO beds, because the pair IS the unit: one adsorbs while one bakes.
    path: "M9 10h13v28H9z M9 19h13 M9 28h13 "
        + "M26 10h13v28H26z M26 19h13 M26 28h13" },
  { cls: "IonExchanger", label: "ion-exchange bed",
    //  A bed of RESIN BEADS, not a hatched packing.
    path: "M15 8h18v32H15z "
        + "M18 16a2 2 0 104 0a2 2 0 10-4 0 M26 16a2 2 0 104 0a2 2 0 10-4 0 "
        + "M18 24a2 2 0 104 0a2 2 0 10-4 0 M26 24a2 2 0 104 0a2 2 0 10-4 0 "
        + "M22 32a2 2 0 104 0a2 2 0 10-4 0" },

  //  ---- MEMBRANES.
  { cls: "SpiralWoundModule", label: "spiral-wound membrane module",
    //  A pressure vessel with the SPIRAL inside it.
    path: "M8 14h32v20H8z M14 24a5 5 0 1110 0a5 5 0 11-8 4 M28 14v20" },
  { cls: "ElectrodialysisStack", label: "electrodialysis stack",
    //  A STACK of alternating membranes between two electrodes.
    path: "M10 12v24 M38 12v24 M16 14v20 M20 14v20 M24 14v20 M28 14v20 "
        + "M32 14v20 M6 20h8 M10 16v8 M34 20h8" },

  //  ---- TRANSPORT AND STORAGE.
  { cls: "Pipe", label: "pipe run",
    path: "M6 20h36v8H6z M14 18v12 M34 18v12" },
  { cls: "StorageTank", label: "storage tank",
    //  A tank with a ROOF and a level -- not a flash drum: nothing splits.
    path: "M12 16h24v24H12z M12 16l12-7 12 7 M12 30h24" },

  //  ---- NOT EQUIPMENT.  A saturation solve and a work sink are not drawn as
  //  vessels: the 2026-09-07 ruling, a labelled box beats a wrong picture.
  { cls: "BubblePoint", label: "bubble-point calculation (not equipment)",
    //  BUBBLES leaving a liquid: the first vapour.
    path: "M10 36h28 "
        + "M18 30a3 3 0 106 0a3 3 0 10-6 0 M27 22a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0 "
        + "M19 18a2 2 0 104 0a2 2 0 10-4 0" },
  { cls: "DewPoint", label: "dew-point calculation (not equipment)",
    //  A DROPLET: the first liquid.
    path: "M24 8c7 11 9 14 9 19a9 9 0 01-18 0c0-5 2-8 9-19z" },
  { cls: "ElectricLoad", label: "electrical load (not equipment)",
    //  A motor with the supply: shaft work crossing the boundary, no stream.
    path: "M24 26m-13 0a13 13 0 1026 0a13 13 0 10-26 0 "
        + "M26 17l-6 11h8l-6 9 M24 13V5" },
] as const;

const BY_CLASS = new Map(SYMBOLS.map((s) => [s.cls, s]));

/**
 * Every registered type and the ENGINE CLASS it constructs.
 *
 * Transcribed from `UnitOperation::registerBuiltins()`, which is the only
 * place the answer exists, and re-derived from that same source by
 * `check_unit_families` on every run -- so a type added, renamed or repointed
 * at another class fails here rather than arriving on screen as a wrong
 * picture or a missing one.  A name sharing a class with another IS that
 * other thing: the engine constructs one object for both words.
 */
export const UNIT_CLASS: { readonly [type: string]: string } = {
  cstr: "CSTR",
  pfr: "PFR",
  conversionReactor: "ConversionReactor",
  gibbsReactor: "GibbsReactor",
  equilibriumReactor: "EquilibriumReactor",
  REquil: "EquilibriumReactor",
  isothermalFlash: "IsothermalFlash",
  flash: "IsothermalFlash",
  adiabaticFlash: "AdiabaticFlash",
  bubbleT: "BubblePoint",
  dewT: "DewPoint",
  heater: "Heater",
  heatExchanger: "HeatExchanger",
  multiStreamHX: "MultiStreamHX",
  MHeatX: "MultiStreamHX",
  evaporator: "Evaporator",
  phaseChanger: "PhaseChanger",
  boiler: "PhaseChanger",
  condenser: "PhaseChanger",
  sprayDryer: "SprayDryer",
  solidDryer: "SolidDryer",
  evaporativeDryer: "EvaporativeDryer",
  coolingTower: "CoolingTower",
  crystalliser: "Crystalliser",
  compressor: "Compressor",
  turbine: "Turbine",
  pump: "Pump",
  electricLoad: "ElectricLoad",
  mixer: "Mixer",
  splitter: "Splitter",
  valve: "Valve",
  storageTank: "StorageTank",
  pipe: "Pipe",
  pneumaticConveyor: "PneumaticConveyor",
  distillationColumn: "DistillationColumn",
  column: "DistillationColumn",
  absorber: "Absorber",
  stripper: "Stripper",
  cyclone: "Cyclone",
  bagFilter: "BagFilter",
  gasSolidSplitter: "GasSolidSplitter",
  ionExchanger: "IonExchanger",
  psa: "PSA",
  tsaTwinBed: "TSATwinBed",
  extractor: "Extractor",
  extract: "Extractor",
  electrodialysisStack: "ElectrodialysisStack",
  shortcutColumn: "ShortcutColumn",
  FUG: "ShortcutColumn",
  spiralWoundModule: "SpiralWoundModule",
  membraneSW: "SpiralWoundModule",
};

/**
 * The symbol for a type, or null when the type is unknown here.
 *
 * NULL IS THE HONEST ANSWER and the caller draws the labelled box with the
 * type's own word.  It must never fall back to a shape: a wrong symbol is a
 * claim about what the unit IS, and the generic-glyph default this module
 * replaced is exactly what that costs.
 */
export function symbolOf(type: string | undefined): UnitSymbolSpec | null {
  if (!type) return null;
  const cls = UNIT_CLASS[type];
  return cls ? (BY_CLASS.get(cls) ?? null) : null;
}

/** Every type the table covers, for the gate and for tests. */
export function coveredTypes(): string[] {
  return Object.keys(UNIT_CLASS).sort();
}

/** Every class drawn, in the order the sheet lists them. */
export function drawnClasses(): string[] {
  return SYMBOLS.map((s) => s.cls);
}
