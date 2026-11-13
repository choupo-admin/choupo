/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

// pumpSystemTool -- the sweep detector, the derived-in-view operating point,
// and the honesty classifier.  The fixture below is a VERBATIM copy of the
// witness case's engine output
// (tutorials/steady/hydraulics/pumpSystem01_operating_point,
// sweep_pumpSystem.csv), so every number the detector reads back is checked
// against what the engine actually wrote.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { applyScalarOverride } from "../src/case/methodRun.js";
import { tutorialByName } from "../src/cases/tutorials.js";
import {
  DEFAULT_PUMP_KNOBS,
  FLAT_REL_TOL,
  PUMP_PROVENANCE_LINE,
  PUMP_WITNESS,
  classifyPumpCharacteristic,
  findOperatingPoint,
  findPumpSystemSweep,
  pumpSystemOverrides,
} from "../src/ui/methods/PumpSystemTool.js";

// ---- Fixture: the witness case's sweep CSV, verbatim ------------------------

const WITNESS_CSV = `point,streams.feed.F,pump01.dP,pump01.head_m,pump01.P_out,P1.deltaP,P1.dP_friction,P1.dP_elevation,P1.head_loss_m,P1.velocity,P1.reynolds
0,0.4,179889,18.3962,479889,28791.3,4256.27,19553.2,0.944926,0.920317,103159
1,0.5,143911,14.717,443911,33806.1,6468.67,19553.3,1.45785,1.15039,128935
2,0.6,119926,12.2641,419926,39887.7,9125.2,19553.3,2.07989,1.38047,154711
3,0.7,102794,10.5121,402794,47033.8,12223.5,19553.4,2.81081,1.61054,180488
4,0.8,89944.4,9.19811,389944,55242.7,15762,19553.4,3.65045,1.84061,206264
5,0.9,79950.6,8.17609,379951,64513.4,19739.4,19553.4,4.59868,2.07069,232040
6,1,71955.5,7.35849,371956,74844.8,24155,19553.4,5.65541,2.30076,257816
7,1.1,65414.1,6.68953,365414,86236.4,29007.9,19553.5,6.82058,2.53084,283592
8,1.2,59962.9,6.13207,359963,98687.5,34297.7,19553.5,8.09412,2.76091,309369
9,1.3,55350.4,5.66037,355350,112198,40023.9,19553.5,9.476,2.99099,335145
10,1.4,51396.8,5.25606,351397,126767,46186.1,19553.5,10.9662,3.22106,360921
11,1.5,47970.3,4.90566,347970,142394,52784.1,19553.5,12.5646,3.45114,386697
12,1.6,44972.2,4.59905,344972,159080,59817.5,19553.5,14.2712,3.68121,412473
`;

/** The fixture truncated to sweep points 0..4 (pump above system everywhere
 *  in the window -- no sign change, so no crossing to interpolate). */
const WITNESS_CSV_ROWS_0_TO_4 =
  WITNESS_CSV.split("\n").slice(0, 6).join("\n") + "\n";

// ---- findPumpSystemSweep ----------------------------------------------------

describe("findPumpSystemSweep -- the generic sweep-CSV detector", () => {
  it("detects the witness sweep with its units, target, and 13 points", () => {
    const sweep = findPumpSystemSweep({ "sweep_pumpSystem.csv": WITNESS_CSV });
    expect(sweep).not.toBeNull();
    expect(sweep!.file).toBe("sweep_pumpSystem.csv");
    expect(sweep!.target).toBe("streams.feed.F");
    expect(sweep!.pumpUnit).toBe("pump01");
    expect(sweep!.systemUnit).toBe("P1");
    expect(sweep!.F).toHaveLength(13);
    expect(sweep!.pumpDP).toHaveLength(13);
    expect(sweep!.systemDP).toHaveLength(13);
    // Spot values, verbatim from the CSV.
    expect(sweep!.F[0]).toBe(0.4);
    expect(sweep!.F[12]).toBe(1.6);
    expect(sweep!.pumpDP[0]).toBe(179889);
    expect(sweep!.pumpDP[12]).toBe(44972.2);
    expect(sweep!.systemDP[0]).toBe(28791.3);
    expect(sweep!.systemDP[12]).toBe(159080);
    // Every engine column travels verbatim in the columns bag.
    expect(sweep!.columns["P1.reynolds"]![0]).toBe(103159);
    expect(sweep!.columns["pump01.head_m"]![5]).toBe(8.17609);
    expect(sweep!.columns["P1.dP_elevation"]![6]).toBe(19553.4);
  });

  it("returns null when nothing satisfies the contract", () => {
    expect(findPumpSystemSweep(undefined)).toBeNull();
    expect(findPumpSystemSweep({})).toBeNull();
    // A CSV that is not a streams sweep at all.
    expect(findPumpSystemSweep({
      "trajectory.csv": "t,T\n0,300\n1,310\n",
    })).toBeNull();
  });

  it("requires the pump's dP + head_m PAIR, not dP alone", () => {
    // Same sweep, head_m column renamed away: no unit publishes the pair.
    const noPair = WITNESS_CSV.replace("pump01.head_m", "pump01.other");
    expect(findPumpSystemSweep({ "sweep.csv": noPair })).toBeNull();
  });

  it("requires the system deltaP on a DIFFERENT unit than the pump", () => {
    // The demand column moved onto the pump's own prefix: no system unit.
    const samePrefix = WITNESS_CSV.replace("P1.deltaP", "pump01.deltaP");
    expect(findPumpSystemSweep({ "sweep.csv": samePrefix })).toBeNull();
  });

  it("still detects the 5-point truncated window", () => {
    const sweep = findPumpSystemSweep({ "sweep.csv": WITNESS_CSV_ROWS_0_TO_4 });
    expect(sweep).not.toBeNull();
    expect(sweep!.F).toHaveLength(5);
    expect(sweep!.F[4]).toBe(0.8);
  });
});

// ---- findOperatingPoint -----------------------------------------------------

describe("findOperatingPoint -- the derived-in-view crossing", () => {
  const sweep = findPumpSystemSweep({ "sweep_pumpSystem.csv": WITNESS_CSV })!;

  it("brackets the witness crossing between F = 0.9 and F = 1.0", () => {
    const op = findOperatingPoint(sweep.F, sweep.pumpDP, sweep.systemDP);
    expect(op).not.toBeNull();
    expect(op!.lowerIndex).toBe(5);
    expect(op!.upperIndex).toBe(6);
    expect(sweep.F[op!.lowerIndex]).toBe(0.9);
    expect(sweep.F[op!.upperIndex]).toBe(1);
  });

  it("pins the interpolated crossing (a view-geometry pin)", () => {
    // These two numbers are VIEW GEOMETRY, not an engine golden: they are the
    // straight-line crossing between the two bracketing engine points
    // (F 0.9: pump 79950.6 / system 64513.4; F 1: pump 71955.5 /
    // system 74844.8), computed once with this module and pinned as observed.
    // The engine computed the four bracketing numbers; the line between them
    // is the view's.  A moved pin means the view's interpolation changed,
    // never that the engine's sweep did.
    const op = findOperatingPoint(sweep.F, sweep.pumpDP, sweep.systemDP)!;
    expect(op.F).toBeCloseTo(0.9842343055138734, 9);
    expect(op.dP).toBeCloseTo(73215.98303986031, 9);
    // The crossing is the same point on BOTH lines: interpolating the system
    // column at the same parameter lands on the same pressure.
    const t = (op.F - 0.9) / (1 - 0.9);
    const systemAtT = 64513.4 + t * (74844.8 - 64513.4);
    expect(systemAtT).toBeCloseTo(op.dP, 6);
  });

  it("returns the exact grid point when the crossing sits on one", () => {
    const op = findOperatingPoint([1, 2, 3], [5, 4, 3], [3, 4, 5]);
    expect(op).not.toBeNull();
    expect(op!.lowerIndex).toBe(1);
    expect(op!.upperIndex).toBe(1);
    expect(op!.F).toBe(2);
    expect(op!.dP).toBe(4);
  });

  it("finds NO crossing in the truncated 0..4 window -- and never extrapolates", () => {
    const sub = findPumpSystemSweep({ "sweep.csv": WITNESS_CSV_ROWS_0_TO_4 })!;
    // Pump sits above the system demand at every point in this window; the
    // real crossing (near F = 0.984) is OUTSIDE it, and the answer is null,
    // never an extrapolated guess.
    expect(findOperatingPoint(sub.F, sub.pumpDP, sub.systemDP)).toBeNull();
  });
});

// ---- classifyPumpCharacteristic ---------------------------------------------

describe("classifyPumpCharacteristic -- the honesty classifier", () => {
  it("calls a synthetic flat column flat-by-spec", () => {
    expect(classifyPumpCharacteristic([250000, 250000, 250000, 250000]))
      .toBe("flat-by-spec");
  });

  it("stays flat-by-spec under float jitter below the relative band", () => {
    const base = 250000;
    const jitter = base * FLAT_REL_TOL * 0.1;
    expect(classifyPumpCharacteristic([base, base + jitter, base - jitter]))
      .toBe("flat-by-spec");
  });

  it("calls the witness's falling column constant-power", () => {
    const sweep = findPumpSystemSweep({ "sweep_pumpSystem.csv": WITNESS_CSV })!;
    expect(classifyPumpCharacteristic(sweep.pumpDP)).toBe("constant-power");
  });
});

// ---- The standalone classroom feed: knobs vs the REAL witness ---------------
// These tests never touch WASM: they resolve every knob's ScalarOverride
// against the witness's actual bundled raw dict text — the same text
// methodCase() clones at run time — so a knob that would silently miss (or
// ambiguously hit) its dict fails HERE, not in a browser.

describe("the standalone classroom feed -- knobs against the bundled witness", () => {
  const entry = tutorialByName(PUMP_WITNESS);

  it("finds the witness in the bundled corpus, with its raw dicts", () => {
    expect(PUMP_WITNESS).toBe("steady/hydraulics/pumpSystem01_operating_point");
    expect(entry).toBeDefined();
    const raws = entry!.files.rawFiles!;
    expect(raws).toBeDefined();
    expect(raws["system/flowsheetDict"]).toContain("W_shaft");
    expect(raws["system/outerDict"]).toContain("sweep_pumpSystem.csv");
  });

  it("every knob's ScalarOverride resolves UNIQUELY against the raw text", () => {
    const raws = entry!.files.rawFiles!;
    const overrides = pumpSystemOverrides(DEFAULT_PUMP_KNOBS);
    // The five declared knobs: W_shaft, eta (pump) + D, L, dz (pipe).
    expect(overrides.map((o) => o.key).sort())
      .toEqual(["D", "L", "W_shaft", "dz", "eta"]);
    for (const o of overrides) {
      const raw = raws[o.file];
      expect(raw, `witness carries ${o.file}`).toBeDefined();
      // No override declares an occurrence: each key must be unique in its
      // file, and applyScalarOverride throws if it is absent OR ambiguous.
      expect(o.occurrence).toBeUndefined();
      const rewritten = applyScalarOverride(raw!, { ...o, value: 123.456 });
      expect(rewritten).not.toBe(raw);
      expect(rewritten).toContain("123.456");
    }
  });

  it("keeps the declared unit word when rewriting a knob", () => {
    const raw = entry!.files.rawFiles!["system/flowsheetDict"]!;
    const out = applyScalarOverride(raw,
      { file: "system/flowsheetDict", key: "W_shaft", value: 3.5 });
    expect(out).toMatch(/W_shaft\s+3\.5\s+kW;/);
  });

  it("throws on a bogus key -- a knob must never silently miss its dict", () => {
    const raw = entry!.files.rawFiles!["system/flowsheetDict"]!;
    expect(() => applyScalarOverride(raw,
      { file: "system/flowsheetDict", key: "noSuchKnob", value: 1 }))
      .toThrow(/not found/);
  });

  it("cannot rewrite the sweep 'range' -- the list limitation is real", () => {
    // The outerDict declares `range ( 0.4 1.6 );` — a LIST.  ScalarOverride
    // rewrites `key <number> [unit];` scalars only, so the swept window stays
    // the witness's in v1; this test pins that the limitation the knob panel
    // states is a fact of the override channel, not a choice of the tool.
    const raw = entry!.files.rawFiles!["system/outerDict"]!;
    expect(raw).toMatch(/range\s+\(\s*0\.4\s+1\.6\s*\)\s*;/);
    expect(() => applyScalarOverride(raw,
      { file: "system/outerDict", key: "range", value: 0.5 }))
      .toThrow(/not found/);
  });

  it("the provenance line matches the witness: name and 13-point claim", () => {
    expect(PUMP_PROVENANCE_LINE).toBe(
      "Runs tutorials/steady/hydraulics/pumpSystem01_operating_point "
      + "(13-point sweep) with your parameters, in your browser.");
    expect(PUMP_PROVENANCE_LINE).toContain("tutorials/" + PUMP_WITNESS);
    // The "(13-point sweep)" claim is the witness's own nPoints, not prose.
    expect(entry!.files.rawFiles!["system/outerDict"]).toMatch(/nPoints\s+13\s*;/);
  });

  it("the default knobs are the witness's own authored values", () => {
    // Booting the classroom must reproduce the sealed case bit-for-bit:
    // writing each default back over the raw text is a no-op number-wise.
    const fs = entry!.files.rawFiles!["system/flowsheetDict"]!;
    expect(fs).toMatch(/W_shaft\s+2\.0\s+kW;/);
    expect(fs).toMatch(/eta\s+0\.65\s*;/);
    expect(fs).toMatch(/D\s+0\.1\s+m;/);
    expect(fs).toMatch(/L\s+50\.0\s+m;/);
    expect(fs).toMatch(/dz\s+2\.0\s+m;/);
    expect(DEFAULT_PUMP_KNOBS).toEqual(
      { W_shaft: 2.0, eta: 0.65, D: 0.1, L: 50.0, dz: 2.0 });
  });
});

// ---- The module-source honesty scan -----------------------------------------

describe("the module source carries the honesty annotations", () => {
  const src = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)),
      "../src/ui/methods/PumpSystemTool.tsx"),
    "utf8");

  it("never presents either curve as a manufacturer's -- the caveat is present", () => {
    expect(src).toContain("not a manufacturer");
  });

  it("labels the interpolated crossing as derived in view", () => {
    expect(src).toContain("derived in view");
  });

  it("says plainly when there is no crossing in the window", () => {
    expect(src).toContain("no crossing inside the swept window");
  });

  it("states the fixed-range limitation in the knob panel, not a comment", () => {
    expect(src).toContain("cannot rewrite");
    expect(src).toContain("range ( 0.4 1.6 );");
  });

  // AMENDED TWICE ON 2026-08-18, and the second amendment changed the SUBJECT.
  //
  // Morning: the check stopped scanning for a literal key and asked the rule in
  // `state/prefs.ts` for its output instead.  Afternoon: this tool's knobs
  // became part of the ONE docked EduTools setup panel
  // (ui/methods/knobPanel.tsx), whose fold and width live under a single
  // registry entry for all twelve tools — so there is no per-tool fold left to
  // persist, and a test that still demanded one would be demanding the defect.
  //
  // What is checked now is what the claim became: this tool declares NO fold
  // key of its own, and the panel it docks in is the shared one.  The fold's
  // own behaviour (storage, junk tolerance, the measured auto-collapse) is
  // pinned where it lives, in tests/panelPrefs.test.ts and
  // tests/panelContract.test.ts.
  it("declares no fold key of its own — the panel owns the fold", async () => {
    const mod = await import("../src/ui/methods/PumpSystemTool.js");
    for (const name of Object.keys(mod)) {
      expect(name).not.toMatch(/COLLAPSED_KEY$/);
    }
    expect(src).not.toContain("methodsToolCollapsedKey");
    expect(src).not.toContain("MethodSetupRail");
  });
});
