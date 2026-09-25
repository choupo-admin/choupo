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
 * THE RULE, IN ONE LINE: **SHAPE IS THE EQUIPMENT, TAG IS THE CALCULATION
 * MODEL.**
 *
 * THREE ROUNDS GOT HERE, AND THE THIRD IS A CORRECTION OF MY OWN REASONING.
 *
 * Round one replaced a per-type icon table that had gone silently short -- 24
 * of the engine's 51 types drew the generic settings-sliders glyph through a
 * `default:` -- with eleven FAMILIES plus a gate recounting against the
 * registry.  Round two: Vítor found `mixer` and a splitter wearing one
 * bow-tie within the hour, and so were pump/compressor/turbine and all five
 * reactors.  The families had been argued on MAINTENANCE, which the same
 * commit's gate had already solved, so the coarseness was paid for a problem
 * that no longer existed.  42 drawings, one per engine class.
 *
 * ROUND THREE, and it is the honest half.  Held against how a process
 * flowsheet is actually drawn on an engineering sheet, three things were
 * wrong:
 *
 *   1. NO NOZZLES.  A PFD symbol carries its connections; without them a
 *      drawing is an icon, not a process block.  Short stubs now, on the
 *      axis the stream actually takes (side for through-flow, top for
 *      vapour, bottom for liquid or solids).  Deliberately SHORT and without
 *      arrowheads: the canvas already draws directed wires, and at 41 px an
 *      arrowhead is mush.
 *
 *   2. RECTANGLES FOR VESSELS.  A pressure vessel is a capsule with dished
 *      heads, and that is what every simulator draws.  The flash drums, the
 *      reactors, the columns and the beds are capsules now.
 *
 *   3. I DREW DIFFERENCES THAT ARE NOT HARDWARE -- the real error.  Round two
 *      gave `gibbsReactor` a vessel over a MINIMUM CURVE and
 *      `equilibriumReactor` a vessel with a DOUBLE ARROW, inventing physical
 *      distinctions for three blocks that have no distinct hardware at all:
 *      RStoic, REquil and RGibbs are one vessel with three SPECIFICATIONS.
 *      It contradicted this module's own rule, stated in round two, that a
 *      specification is not drawn -- and the round-two text even used the
 *      flash pair to say so, while giving the adiabatic flash an invented
 *      insulation jacket.
 *
 * So a symbol may carry a TAG, and FOUR groups share a shape and differ by
 * it, which is exactly the convention a student meets elsewhere:
 *
 *      vessel reactor   CONV  ·  EQ  ·  GIBBS
 *      flash drum       T     ·  Q=0
 *      trayed column    MESH  ·  FUG
 *      packed column    ABS   ·  STR
 *
 * TWO CLASSES MAY SHARE A SHAPE ONLY IF THEIR TAGS DIFFER AND NEITHER IS
 * EMPTY.  Sharing both is refused by `check_unit_families`, which still
 * derives which names are ONE object from `UnitOperation::registerBuiltins()`
 * -- 51 names, 42 classes -- so nothing here decides what "looks similar
 * enough".  That question is what produced the bow-tie.
 *
 * WHERE THE DIFFERENCE IS REAL HARDWARE IT IS STILL DRAWN: a CSTR has an
 * agitator and a PFR is a tube, and no tag replaces that.
 *
 * WHERE THERE IS NO HONEST SHAPE THERE IS NONE.  `bubbleT`, `dewT` and
 * `electricLoad` are two saturation solves and a stream-less work sink, drawn
 * as bubbles, a droplet and a motor -- deliberately not equipment, per the
 * 2026-09-07 ruling that a labelled box beats a wrong picture.  The cooling
 * tower is NOT the natural-draught hyperboloid: Choupo's is a utility model
 * and most plants run induced draught, so it gets a fan over packing.
 *
 * COLOUR IS NOT USED TO CLASSIFY.  A second proposal coloured the symbols by
 * family (reaction red, heat amber, separation blue).  It is refused, and not
 * on taste: on this canvas colour ALREADY means phase (cyan liquid, orange
 * vapour, purple two-phase), duty tier and utility class, all of them RESULTS
 * the engine computes.  A fixed equipment colour puts a second grammar of
 * colour on the same picture, and a blue vessel among blue wires stops saying
 * which of the two it means.  Symbols in ink; colour for what is computed.
 */

/** One drawing, keyed by the ENGINE CLASS it depicts. */
export interface UnitSymbolSpec {
  /** the C++ class in src/unitOperations, as UnitOperation.cpp constructs it */
  cls: string;
  /** the word a reader sees when asked what this shape is */
  label: string;
  /**
   * The symbol, an SVG path on a 0 0 48 48 viewBox, drawn with `fill: none`
   * and a 2.2 stroke so it reads as an outline at 41 px.  Nozzles included.
   */
  path: string;
  /**
   * The CALCULATION MODEL, drawn inside the shape, for a shape shared by more
   * than one class.  Absent where the shape is the class's alone.  Kept to a
   * few characters: it is rendered at ~9 px inside a 41 px symbol.
   */
  tag?: string;
}

//  Shared geometry, written once so a shape shared by two classes is the SAME
//  string and the gate's duplicate test means something.
const VESSEL =                      // vertical capsule, dished heads
  "M15 14a9 6 0 0118 0v20a9 6 0 01-18 0z";
const COLUMN_SHELL =                // tall capsule
  "M16 10a8 5 0 0116 0v28a8 5 0 01-16 0z";
const SIDE_NOZZLES = " M3 24h5 M40 24h5";
//  A stirred vessel WITH continuous flow: the CSTR and its transient sibling.
const STIRRED_FLOW =
  "M15 14a9 6 0 0118 0v20a9 6 0 01-18 0z M24 8v14 M18 22h12 M18 28h12"
  + " M3 18h5 M40 30h5 M24 6V2";
//  A BATCH vessel is closed to continuous flow, and that IS hardware: it is
//  charged from the top and discharged from the bottom, with no side pair.
//  So the batch units are not "the steady ones tagged" -- their nozzles
//  differ, which is a real difference and is drawn.
const BATCH_NOZZLES = " M24 6V2 M24 42v4";
const TOP_NOZZLE = " M24 6V2";
const BOTTOM_NOZZLE = " M24 42v4";

export const SYMBOLS: readonly UnitSymbolSpec[] = [
  //  ---- REACTORS.  Real hardware differences are drawn; specifications are
  //  tagged.  CSTR and PFR are hardware; the other three are one vessel.
  { cls: "CSTR", label: "stirred-tank reactor (CSTR)",
    path: STIRRED_FLOW, tag: "SS" },
  { cls: "DynamicCSTR", label: "stirred-tank reactor, transient",
    //  THE SAME EQUIPMENT.  A dynamic CSTR has the same shell, the same
    //  agitator and the same nozzles as the steady one; what differs is that
    //  the holdup is an integrated STATE rather than a parameter, which is a
    //  SOLUTION MODE and not hardware.  Drawing it differently would be the
    //  invented-difference error this module was corrected for.
    path: STIRRED_FLOW, tag: "d/dt" },
  { cls: "PFR", label: "plug-flow reactor (tubular)",
    //  A serpentine TUBE in a shell: nothing is mixed, everything travels.
    path: "M8 12h32v24H8z M13 18h22a3 3 0 010 6H13a3 3 0 000 6h22"
        + SIDE_NOZZLES },
  { cls: "ConversionReactor", label: "conversion reactor (stoichiometric)",
    path: VESSEL + SIDE_NOZZLES, tag: "CONV" },
  { cls: "EquilibriumReactor", label: "equilibrium reactor",
    path: VESSEL + SIDE_NOZZLES, tag: "EQ" },
  { cls: "GibbsReactor", label: "Gibbs reactor (free-energy minimum)",
    path: VESSEL + SIDE_NOZZLES, tag: "GIBBS" },

  //  ---- PHASE SPLIT.  One drum; isothermal and adiabatic are SPECS.
  { cls: "IsothermalFlash", label: "flash drum (isothermal)",
    path: VESSEL + " M15 30h18" + " M3 24h5" + TOP_NOZZLE + BOTTOM_NOZZLE,
    tag: "T" },
  { cls: "AdiabaticFlash", label: "flash drum (adiabatic)",
    path: VESSEL + " M15 30h18" + " M3 24h5" + TOP_NOZZLE + BOTTOM_NOZZLE,
    tag: "Q=0" },

  //  ---- HEAT.  Five different blocks, five shapes.
  { cls: "Heater", label: "heater / cooler (one stream)",
    //  One stream and a heating element: there is no second side to draw.
    path: "M11 15h26v18H11z M16 21l4 8 4-8 4 8 4-8" + SIDE_NOZZLES },
  { cls: "HeatExchanger", label: "heat exchanger (shell and tube)",
    path: "M24 24m-15 0a15 15 0 1030 0a15 15 0 10-30 0"
        + " M11 24h6l4-7 8 14 4-7h6" + SIDE_NOZZLES
        + " M24 9V3 M24 39v6" },
  { cls: "MultiStreamHX", label: "multi-stream exchanger (cold box)",
    path: "M12 10h24v28H12z M6 17h36 M6 24h36 M6 31h36" },
  { cls: "PhaseChanger", label: "boiler / condenser (phase change)",
    //  A shell with a condensing coil: the phase change IS the duty.
    path: "M10 16a6 8 0 000 16h28a6 8 0 000-16z"
        + " M15 21c4 0 4 6 8 6s4-6 8-6" + SIDE_NOZZLES },
  { cls: "Evaporator", label: "evaporator",
    //  Vessel with the calandria at the base and vapour off the top.
    path: VESSEL + " M18 30h12 M18 34h12" + " M3 20h5" + TOP_NOZZLE
        + BOTTOM_NOZZLE },
  { cls: "CoolingTower", label: "cooling tower (mechanical draught)",
    //  A FAN over packing.  Not the natural-draught hyperboloid.
    path: "M12 18h24v20H12z M24 18V10 M15 10h18 M16 26h16 M16 32h16"
        + " M3 24h9 M36 30h9" },

  //  ---- ROTATING MACHINES.  The trapezoids point opposite ways because the
  //  gas is compressed one way and expanded the other.
  { cls: "Compressor", label: "compressor",
    path: "M14 12l20 8v8L14 36z" + " M4 24h10 M34 24h10" },
  { cls: "Turbine", label: "turbine / expander",
    path: "M14 20l20-8v24l-20-8z" + " M4 24h10 M34 24h10" },
  { cls: "Pump", label: "pump (centrifugal)",
    //  The circle with its impeller triangle and the discharge riser.
    path: "M24 28m-12 0a12 12 0 1024 0a12 12 0 10-24 0 M19 34l12-6-12-6z"
        + " M4 28h8 M24 16V6 M24 6h8" },

  //  ---- TOPOLOGY.  The four that collided in round two.
  { cls: "Mixer", label: "mixer",
    //  Streams CONVERGE: many in, one out.
    path: "M6 12l16 11 M6 36l16-11 M6 24h16 M22 18v12 M22 24h20" },
  { cls: "Splitter", label: "splitter",
    //  Streams DIVERGE: the mirror, and unmistakably so.
    path: "M42 12L26 23 M42 36L26 25 M42 24H26 M26 18v12 M26 24H6" },
  { cls: "Valve", label: "valve",
    //  The bow-tie is the VALVE's own symbol and belongs to nothing else.
    path: "M11 15l13 9-13 9z M37 15L24 24l13 9z M24 24v-9 M18 15h12"
        + " M3 24h8 M37 24h8" },
  { cls: "GasSolidSplitter", label: "gas-solid splitter (ideal)",
    //  A splitter whose branches are PHASES.  It models no mechanism, so it
    //  is not drawn as a cyclone.
    path: "M6 24h20 M26 24l16-10 M26 24l16 10 M26 18v12"
        + " M33 33a1.6 1.6 0 103.2 0a1.6 1.6 0 10-3.2 0"
        + " M38 36a1.6 1.6 0 103.2 0a1.6 1.6 0 10-3.2 0" },

  //  ---- COLUMNS.  Trays and packing are different hardware.  Rigorous vs
  //  shortcut, and absorber vs stripper, are not: they are tagged.
  { cls: "DistillationColumn", label: "distillation column (trayed)",
    path: COLUMN_SHELL + " M17 18h14 M17 26h14 M17 34h14"
        + " M3 24h13" + TOP_NOZZLE + BOTTOM_NOZZLE, tag: "MESH" },
  { cls: "ShortcutColumn", label: "shortcut column (Fenske-Underwood-Gilliland)",
    path: COLUMN_SHELL + " M17 18h14 M17 26h14 M17 34h14"
        + " M3 24h13" + TOP_NOZZLE + BOTTOM_NOZZLE, tag: "FUG" },
  { cls: "Absorber", label: "absorber (packed)",
    path: COLUMN_SHELL + " M18 16q6 6 12 0 M18 24q6 6 12 0 M18 32q6 6 12 0"
        + " M3 34h13" + TOP_NOZZLE + BOTTOM_NOZZLE, tag: "ABS" },
  { cls: "Stripper", label: "stripper (packed)",
    path: COLUMN_SHELL + " M18 16q6 6 12 0 M18 24q6 6 12 0 M18 32q6 6 12 0"
        + " M3 34h13" + TOP_NOZZLE + BOTTOM_NOZZLE, tag: "STR" },
  { cls: "Extractor", label: "liquid-liquid extractor",
    //  Two liquids inside one shell: the droplets are the second phase.
    path: COLUMN_SHELL
        + " M20 17a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0"
        + " M24 27a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0"
        + " M19 35a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0"
        + " M3 16h13 M32 34h13" + TOP_NOZZLE + BOTTOM_NOZZLE },

  //  ---- SOLIDS.
  { cls: "Cyclone", label: "cyclone",
    //  Barrel over cone, with the TANGENTIAL inlet that makes it a cyclone.
    path: "M15 12h18v10l-9 20-9-20z M33 16h9" + TOP_NOZZLE + BOTTOM_NOZZLE },
  { cls: "BagFilter", label: "bag filter",
    //  The BAGS are the equipment; a box would be any vessel.
    path: "M10 12h28v9H10z M10 21l6 12h16l6-12"
        + " M16 21v9a2 2 0 004 0v-9 M25 21v9a2 2 0 004 0v-9"
        + " M3 16h7" + TOP_NOZZLE + " M24 33v12" },
  { cls: "Crystalliser", label: "crystalliser",
    //  An agitated vessel carrying CRYSTALS: the population is the point.
    path: VESSEL + " M24 8v12 M19 20h10"
        + " M19 30l3-3 3 3-3 3z M27 34l2.5-2.5 2.5 2.5-2.5 2.5z"
        + " M3 20h5" + TOP_NOZZLE + BOTTOM_NOZZLE },
  { cls: "PneumaticConveyor", label: "pneumatic conveyor",
    //  A duct carrying PARTICLES: transport with a load, not an empty pipe.
    path: "M4 18h30l8 6-8 6H4z"
        + " M12 22a1.6 1.6 0 103.2 0a1.6 1.6 0 10-3.2 0"
        + " M20 27a1.6 1.6 0 103.2 0a1.6 1.6 0 10-3.2 0"
        + " M27 21a1.6 1.6 0 103.2 0a1.6 1.6 0 10-3.2 0" },

  //  ---- DRYERS.  Three mechanisms, three shapes.
  { cls: "SprayDryer", label: "spray dryer",
    //  Chamber, ATOMISER at the top, the spray cone under it.
    path: "M13 10h22v18l-11 14-11-14z" + TOP_NOZZLE + " M20 14l4-4 4 4"
        + " M19 21l-1 4 M24 22v4 M29 21l1 4 M35 16h8" + BOTTOM_NOZZLE },
  { cls: "SolidDryer", label: "rotary dryer",
    //  An INCLINED rotating drum on its rollers.
    path: "M8 20l30-7 2 8-30 7z M14 30v4 M32 26v4"
        + " M12 36a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0"
        + " M30 32a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0"
        + " M2 16h6 M40 25h6" },
  { cls: "EvaporativeDryer", label: "evaporative (through-flow) dryer",
    //  A chamber the DRYING AIR passes through, vapour leaving the top.
    path: "M12 14h24v20H12z M18 14V8 M24 14V6 M30 14V8" + SIDE_NOZZLES },

  //  ---- SORPTION BEDS.  What differs is how they regenerate.
  { cls: "PSA", label: "pressure-swing adsorber",
    path: VESSEL + " M15 20h18 M15 28h18" + TOP_NOZZLE + BOTTOM_NOZZLE
        + " M39 18v12 M36 21l3-3 3 3" },
  { cls: "TSATwinBed", label: "temperature-swing adsorber (twin bed)",
    //  TWO beds, because the pair IS the unit: one adsorbs while one bakes.
    path: "M8 13a6 4 0 0112 0v22a6 4 0 01-12 0z M8 21h12 M8 29h12"
        + " M28 13a6 4 0 0112 0v22a6 4 0 01-12 0z M28 21h12 M28 29h12"
        + " M14 9V4 M34 9V4" },
  { cls: "IonExchanger", label: "ion-exchange bed",
    //  A bed of RESIN BEADS, not a hatched packing.
    path: VESSEL
        + " M19 19a2 2 0 104 0a2 2 0 10-4 0 M26 19a2 2 0 104 0a2 2 0 10-4 0"
        + " M19 26a2 2 0 104 0a2 2 0 10-4 0 M26 26a2 2 0 104 0a2 2 0 10-4 0"
        + " M22 33a2 2 0 104 0a2 2 0 10-4 0" + TOP_NOZZLE + BOTTOM_NOZZLE },

  //  ---- MEMBRANES.
  { cls: "SpiralWoundModule", label: "spiral-wound membrane module",
    //  A pressure vessel with the SPIRAL inside it.
    path: "M8 16a5 8 0 000 16h32a5 8 0 000-16z"
        + " M15 24a4 4 0 118 0a4 4 0 11-6.5 3 M28 16v16"
        + " M3 24h5 M40 24h5 M34 32v8" },
  { cls: "ElectrodialysisStack", label: "electrodialysis stack",
    //  A STACK of alternating membranes between two electrodes.
    path: "M10 12v24 M38 12v24 M16 14v20 M20 14v20 M24 14v20 M28 14v20"
        + " M32 14v20 M4 18h6 M4 30h6 M38 18h6 M38 30h6" },

  //  ---- TRANSPORT AND STORAGE.
  { cls: "Pipe", label: "pipe run",
    path: "M4 20h40v8H4z M14 18v12 M34 18v12" },
  { cls: "StorageTank", label: "storage tank",
    //  A tank with a ROOF and a level: nothing splits here.
    path: "M12 16h24v24H12z M12 16l12-7 12 7 M12 30h24"
        + " M3 22h9 M24 40v5" },

  //  ---- BATCH VESSELS (choupoBatch) and the ONE lumped benchmark.
  //  These are NOT the steady units with a tag: a batch vessel is CLOSED to
  //  continuous flow, charged from the top and discharged from the bottom,
  //  and that is hardware rather than a solution mode.
  { cls: "BatchReactor", label: "batch reactor",
    path: VESSEL + " M24 8v14 M18 22h12 M18 28h12" + BATCH_NOZZLES },
  { cls: "BatchCrystalliser", label: "batch crystalliser",
    //  Closed, well mixed, and carrying the CRYSTAL population that is its
    //  whole subject (the dynamic sibling of the steady MSMPR).
    path: VESSEL + " M24 8v12 M19 20h10"
        + " M19 29l3-3 3 3-3 3z M27 33l2.5-2.5 2.5 2.5-2.5 2.5z"
        + BATCH_NOZZLES },
  { cls: "BatchStill", label: "batch still (Rayleigh)",
    //  A POT boiled off with the vapour taken overhead: no reflux, no plates
    //  -- so no column shell, and the take-off is drawn where it leaves.
    path: VESSEL + " M18 32c3-3 6 3 9 0 M18 36c3-3 6 3 9 0"
        + " M24 8V2 M24 2h10" },
  { cls: "BatchAccumulator", label: "receiver / accumulator (passive)",
    //  A PASSIVE vessel: it does nothing on its own and is only charged, so
    //  it carries an inlet and a level and no agitator, coil or outlet.
    path: VESSEL + " M15 30h18 M24 6V2" },
  { cls: "BatchAdsorber", label: "batch adsorber (closed contactor)",
    //  A CLOSED gas-solid contacting vessel: a headspace over the adsorbent
    //  with the jacket that pins its temperature.  The jacket is the mark
    //  that separates it from a flow-through bed.
    path: VESSEL + " M15 28h18 M18 32a2 2 0 104 0a2 2 0 10-4 0"
        + " M26 32a2 2 0 104 0a2 2 0 10-4 0"
        + " M11 18v14 M37 18v14" + BATCH_NOZZLES },
  { cls: "FixedBedAdsorber", label: "fixed-bed adsorber (breakthrough)",
    //  A PACKED bed the gas passes THROUGH -- the axial flow is the model,
    //  so the nozzles are the through pair and the bed is hatched.
    path: VESSEL + " M15 19h18 M15 26h18 M15 33h18" + BATCH_NOZZLES },
  { cls: "BatchDryer", label: "batch tray dryer",
    //  A TRAY of wet solid in air of declared condition: the tray is the
    //  equipment, and the moisture leaves upward.
    path: "M10 18h28v16H10z M14 26h20 M18 18v-5 M24 18v-7 M30 18v-5"
        + " M24 34v10" },
  { cls: "BatchDiafilter", label: "batch diafiltration rig",
    //  A stirred hold-up vessel with the MEMBRANE module it recirculates
    //  through: the loop is the rig, and it is what the unit models.
    path: "M8 12a7 5 0 0114 0v16a7 5 0 01-14 0z M15 8v8"
        + " M28 18h14v10H28z M35 18v10 M22 23h6 M42 23h3 M15 33v7" },
  { cls: "BatchElectrodialysis", label: "batch electrodialysis rig",
    //  BOTH TANKS and the stack between them: the unit holds the diluate
    //  and the concentrate, and a rig that could not see the second one
    //  could not compute its own voltage.
    path: "M4 14h10v20H4z M34 14h10v20H34z"
        + " M19 12v24 M23 12v24 M27 12v24 M31 12v24"
        + " M14 20h5 M31 20h3 M14 30h5 M31 30h3" },
  { cls: "WilliamsOttoPlant", label: "Williams-Otto plant (one lumped unit)",
    //  NOT ONE PIECE OF EQUIPMENT.  Its own header says "the Williams-Otto
    //  plant as ONE dynamic unit" -- a whole benchmark plant lumped into a
    //  block -- so it is drawn as a boxed FLOWSHEET rather than as a vessel
    //  it is not: the 2026-09-07 ruling, a labelled box beats a wrong
    //  picture, applied rather than re-argued.
    path: "M6 10h36v28H6z M13 18a3 3 0 106 0a3 3 0 10-6 0"
        + " M29 18a3 3 0 106 0a3 3 0 10-6 0"
        + " M13 30a3 3 0 106 0a3 3 0 10-6 0"
        + " M19 18h10 M16 21v6 M22 30h13 M35 21v9" + SIDE_NOZZLES },

  //  ---- NOT EQUIPMENT.
  { cls: "BubblePoint", label: "bubble-point calculation (not equipment)",
    //  BUBBLES leaving a liquid: the first vapour.
    path: "M10 36h28 M18 30a3 3 0 106 0a3 3 0 10-6 0"
        + " M27 22a2.5 2.5 0 105 0a2.5 2.5 0 10-5 0"
        + " M19 18a2 2 0 104 0a2 2 0 10-4 0" },
  { cls: "DewPoint", label: "dew-point calculation (not equipment)",
    //  A DROPLET: the first liquid.
    path: "M24 8c7 11 9 14 9 19a9 9 0 01-18 0c0-5 2-8 9-19z" },
  { cls: "ElectricLoad", label: "electrical load (not equipment)",
    //  A motor with its supply: shaft work crossing the boundary, no stream.
    path: "M24 27m-12 0a12 12 0 1024 0a12 12 0 10-24 0"
        + " M26 19l-6 10h8l-6 9 M24 15V5" },
] as const;

const BY_CLASS = new Map(SYMBOLS.map((s) => [s.cls, s]));

/**
 * Every registered type and the ENGINE CLASS it constructs.
 *
 * Transcribed from `UnitOperation::registerBuiltins()`, which is the only
 * place the answer exists, and re-derived from that same source by
 * `check_unit_families` on every run -- so a type added, renamed or repointed
 * at another class fails there rather than arriving on screen as a wrong
 * picture or a missing one.  A name sharing a class with another IS that
 * other thing: the engine constructs one object for both words.
 */
export const UNIT_CLASS: { readonly [type: string]: string } = {
  cstr: "CSTR",
  //  DynamicUnitOperation's registry (choupoCtrl + choupoSemiContinuous).
  dynamicCSTR: "DynamicCSTR",
  williamsOttoPlant: "WilliamsOttoPlant",
  //  BatchUnitOperation's registry (choupoBatch).
  batchReactor: "BatchReactor",
  batchStill: "BatchStill",
  batchAccumulator: "BatchAccumulator",
  batchCrystalliser: "BatchCrystalliser",
  batchAdsorber: "BatchAdsorber",
  fixedBedAdsorber: "FixedBedAdsorber",
  batchDiafilter: "BatchDiafilter",
  batchDryer: "BatchDryer",
  batchElectrodialysis: "BatchElectrodialysis",
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
