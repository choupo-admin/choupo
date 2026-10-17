/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*  THE PLANT LAYOUT FIXTURES, shared by the tests that map, draw and export
    the engine's `layout {}` block (tests/plantLayout.test.ts, DEV.md 4c C75 /
    C80; tests/layoutExport.test.ts, C81).  Moved here VERBATIM from
    plantLayout.test.ts so the export is held to the SAME block the scene
    mapping is.  The first transcribes items of the witness
    `tutorials/plant/ammonia02_full_plant` (its converter, separator and
    let-down drum, a compressor, the control room) plus a sector area and a
    zone finding the witness does not carry. */

import type { PlantLayout } from "../src/adapters/SolverAdapter.js";

export const LAYOUT: PlantLayout = {
  items: [
    { id: "makeupComp", nonProcess: false, kind: "compressor", sector: "", shape: "box",
      orientation: "alongX", footprintFrom: "declared", x: 6, y: -8, z: 0, dx: 8, dy: 4, dz: 4,
      release: { source: "author-set", reason: "seals",
                 zones: [{ zone: 2, radius: 7.5, height: 6 }] } },
    { id: "converter", nonProcess: false, kind: "vessel", sector: "LOOP", shape: "cylinder",
      orientation: "vertical", footprintFrom: "published", x: 40, y: -6, z: 0,
      dx: 2.12843880117, dy: 2.12843880117, dz: 12.770632807 },
    { id: "separator", nonProcess: false, kind: "vessel", sector: "LOOP", shape: "cylinder",
      orientation: "vertical", footprintFrom: "published", x: 56, y: -6, z: 0,
      dx: 2.6447498572, dy: 2.6447498572, dz: 7.93424957161,
      release: { source: "author-set", reason: "drains",
                 zones: [{ zone: 0, radius: 1, height: 2 }, { zone: 1, radius: 3, height: 4 }] } },
    { id: "letdown", nonProcess: false, kind: "vessel", sector: "LOOP", shape: "cylinder",
      orientation: "vertical", footprintFrom: "published", x: 59.5, y: -6, z: 0,
      dx: 0.583390171821, dy: 0.583390171821, dz: 1.75017051546 },
    { id: "pumpHouse", nonProcess: true, kind: "building", sector: "", shape: "box",
      orientation: "alongY", footprintFrom: "declared", x: 58, y: -9, z: 0, dx: 2, dy: 3, dz: 3,
      ignition: "motors" },
  ],
  areas: [{ sector: "LOOP", xMin: 30, xMax: 70, yMin: -12, yMax: 10 }],
  separation: [{ source: "author-set", reason: "r", measure: "edgeToEdge",
                 rules: [{ a: "vessel", b: "vessel", distance: 4 }] }],
  wind: { from: 225, planNorth: 0, halfAngle: 30, reach: 60, source: "s", reason: "r" },
  findings: [
    { id: "separation:separator:letdown", kind: "separation", a: "separator", b: "letdown",
      value: 1.88592998549, limit: 4, message: "too close" },
    { id: "ignitionInZone:pumpHouse:separator#zone1", kind: "ignitionInZone",
      a: "pumpHouse", b: "separator#zone1", value: 1.2, limit: 3, message: "inside" },
    { id: "deadRule:pipeRack:pipeRack|vessel", kind: "deadRule", a: "pipeRack",
      b: "pipeRack|vessel", value: 0, limit: 5, message: "checks nothing" },
  ],
  unplaced: [], internal: [],
};

/*  THE PIPES (DEV.md 4c C80).  The fixture transcribes four pipes, the rack
    and a junction of the witness `ammonia02_full_plant` as the engine routed
    them on its stated default rack (a run of 2026-10-17), plus a two-phase
    pipe the witness does not carry. */
export const RACK = { declared: false, y: -3.14285714286, elevation: 6, laneSpacing: 0.6,
  lanesPerTier: 6, tierSpacing: 1.5, xStart: -3, xEnd: 67, reason: "default" };
export const PIPED: PlantLayout = {
  ...LAYOUT,
  pipeRack: RACK,
  junctions: [{ unit: "purgeSplit", type: "splitter", x: 37, y: -3.14285714286, z: 6 }],
  pipes: [
    { stream: "rawLiquid", fromKind: "item", from: "separator", fromUnit: "separator",
      toKind: "item", to: "letdown", toUnit: "letdown", routedBy: "rack", lane: 10,
      length: 17.1983647704, F_mass: 16.9841172009, T: 250, P: 20000000, vf: 0,
      route: [[56, -6, 7.93424957161], [56, -6, 7.5], [56, -2.24285714286, 7.5],
              [59.5, -2.24285714286, 7.5], [59.5, -6, 7.5], [59.5, -6, 1.75017051546]] },
    { stream: "letdownGas", fromKind: "item", from: "letdown", fromUnit: "letdown",
      toKind: "batteryLimit", to: "outlet", toUnit: "", routedBy: "rack", lane: 12,
      length: 16.1069723417, F_mass: 0.13090573492, T: 250, P: 2000000, vf: 1,
      route: [[59.5, -6, 1.75017051546], [59.5, -6, 9], [59.5, -4.64285714286, 9],
              [67, -4.64285714286, 9]] },
    { stream: "unreactedGas", fromKind: "item", from: "separator", fromUnit: "separator",
      toKind: "junction", to: "purgeSplit", toUnit: "purgeSplit", routedBy: "rack", lane: 11,
      length: 26.7913924288, F_mass: 87.8894853451, T: 250, P: 20000000, vf: 1,
      route: [[56, -6, 7.93424957161], [56, -6, 7.5], [56, -1.64285714286, 7.5],
              [37, -1.64285714286, 7.5], [37, -3.14285714286, 7.5], [37, -3.14285714286, 6]] },
    { stream: "flashing", fromKind: "junction", from: "purgeSplit", fromUnit: "purgeSplit",
      toKind: "item", to: "converter", toUnit: "converter", routedBy: "waypoints", lane: -1,
      length: 10, vf: 0.4,
      route: [[37, -3.14285714286, 6], [40, -3.14285714286, 6], [40, -6, 6]] },
  ],
  notRouted: [{ stream: "makeup", reason: "unit `T101` (storageTank) has no sized item" }],
};
