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

/*---------------------------------------------------------------------------*\
  thielePelletTool — the readings, the knob map and the view geometry behind
  the EduTools "Catalyst pellet (Thiele modulus)" construction.

  WHAT THIS SUITE CANNOT SEE, stated rather than stubbed:

    * IT NEVER RUNS THE ENGINE.  choupoProps is WebAssembly and needs a
      browser; every reading below is exercised against CSV text written to the
      documented header, and against the REAL bundled witness dicts for the
      knob map.  So this suite proves the tool asks the engine the right
      question and reads the right columns — it proves nothing about the
      numbers the engine answers with.  Those are the C++ side's own gate
      (bin/curate/check_thiele_pellet.py recomputes the closed forms in Python)
      and the case's golden `expected`.
    * IT CANNOT SEE LAYOUT.  In jsdom every box is 0x0 and nothing is ever on
      top of anything, so no test here can tell whether the three cross-sections
      fit beside each other, whether the knob panel folds, or whether a control
      is covered.  bin/checkGui is the harness that asks that question in a real
      Chromium at a real viewport; this file does not pretend to.
    * IT DOES NOT RENDER THE TOOL.  The component is deliberately thin over
      case/thielePellet.ts, so the logic is reachable with no mock at all; a
      shallow render that asserted a `<circle>` exists would pin the drawing's
      spelling and nothing about its correctness.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import type { OperationResult } from "../src/adapters/SolverAdapter.js";
import {
  CATALYST_DAT, FIELD_CSV, GEOMETRIES, PROPS_DICT, RATE_CONSTANT_LADDER,
  REFINEMENT_CSV, SWEEP_CSV, THIELE_KNOBS, THIELE_LIMITS, THIELE_WITNESS,
  WITNESS_CATALYST, defaultKnobValues, dimensionKey, fieldBands, fieldColor,
  nearestLadderIndex, overridesFor, readEtaPhiSweep, readPelletDiagnostics,
  readPelletField, fieldTemperatureRange, temperatureColor,
} from "../src/case/thielePellet.js";
import { applyScalarOverride, methodCase } from "../src/case/methodRun.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { tutorialByName } from "../src/cases/tutorials.js";

const here = dirname(fileURLToPath(import.meta.url));

/** The number a dict declares for `key`, read straight out of raw dict text.
 *  Used to check that a knob's default landed where the knob says it does. */
function declaredNumber(raw: string, key: string): number | null {
  const m = new RegExp(`^[ \\t]*${key}[ \\t]+([-+0-9.eE]+)`, "m").exec(raw);
  return m ? Number(m[1]) : null;
}

// ---- The witness -------------------------------------------------------------

describe("the classroom witness — bundled, choupoProps, one thielePellet op", () => {
  it("is in the bundled corpus with its raw dicts", () => {
    const entry = tutorialByName(THIELE_WITNESS);
    expect(entry, `witness '${THIELE_WITNESS}' missing from the bundled corpus`)
      .toBeDefined();
    expect(entry!.category).toBe("props");
    expect(entry!.subclass).toBe("reactor");
    expect(entry!.files.rawFiles).toBeDefined();
    expect(entry!.files.rawFiles!["system/controlDict"]).toContain("choupoProps");
  });

  it("declares the operation, its three CSV outputs and its sweep", () => {
    const raw = tutorialByName(THIELE_WITNESS)!.files.rawFiles!;
    const props = raw[PROPS_DICT]!;
    expect(props).toContain("type       thielePellet;");
    // The three output paths the tool reads back out of the run.  A renamed
    // output here would leave the tool drawing nothing, silently.
    expect(props).toContain(FIELD_CSV);
    expect(props).toContain(SWEEP_CSV);
    expect(props).toContain(REFINEMENT_CSV);
    expect(props).toMatch(/sweep\s*\{/);
  });

  it("carries the catalyst record the geometry knob rewrites", () => {
    const raw = tutorialByName(THIELE_WITNESS)!.files.rawFiles!;
    const cat = raw[CATALYST_DAT];
    expect(cat, `the tool rewrites '${CATALYST_DAT}', which the witness must carry`)
      .toBeDefined();
    expect(cat!).toContain("kind catalyst;");
    expect(cat!).toContain(WITNESS_CATALYST);
    // The record says of ITSELF that it is a teaching surrogate, in a field the
    // engine parses and announces.  The tool's honesty block cites this; if the
    // record is ever promoted to a cited one, that block is the thing to fix.
    expect(cat!).toContain("origin teachingSurrogate;");
  });
});

// ---- The knob map, against the REAL bundled raw text -------------------------

describe("the temperature field — the optional columns the thermal block adds", () => {
  //  THE WITNESS DECLARES `thermal {}` (2026-08-27), so its field CSV carries
  //  two extra columns.  These pin the reader's two forms, because the header
  //  check is an EQUALITY against a closed list: get it wrong and the tool
  //  refuses a real file, or worse, reads one positionally and mis-columns it.

  const BASE = "geometry,phi,phi_char,xi,c_over_cs,c_over_cs_closedForm,"
    + "absDeviation";
  const withT = BASE + ",T_over_Ts,T_K\n"
    + "sphere,1,3,0,0.3,0.3,0,1.28,736.65\n"
    + "sphere,1,3,1,1,1,0,1,573.15\n";
  const withoutT = BASE + "\n"
    + "sphere,1,3,0,0.3,0.3,0\n"
    + "sphere,1,3,1,1,1,0\n";

  it("reads the temperature columns when they are there", () => {
    const r = readPelletField(withT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.read.rows[0]!.tK).toBeCloseTo(736.65, 6);
    expect(r.read.rows[1]!.tK).toBeCloseTo(573.15, 6);
    //  The surface is the reference: T/T_s is exactly 1 there, by
    //  construction of Prater's relation at c = c_s.
    expect(r.read.rows[1]!.tOverTs).toBeCloseTo(1, 12);
  });

  it("still reads an isothermal field, carrying UNDEFINED and not zero", () => {
    const r = readPelletField(withoutT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    //  `undefined` means "this run published no temperature".  A 0 there
    //  would be a temperature of absolute zero, and a 1 would be a claim that
    //  the pellet is isothermal -- two different statements, neither true.
    expect(r.read.rows[0]!.tK).toBeUndefined();
    expect(r.read.rows[0]!.tOverTs).toBeUndefined();
  });

  it("refuses a header that is neither form, rather than reading it by index", () => {
    const drifted = BASE.replace("c_over_cs", "c_over_cS") + "\n"
      + "sphere,1,3,0,0.3,0.3,0\n";
    expect(readPelletField(drifted).ok).toBe(false);
  });

  it("reports no temperature range for an isothermal field", () => {
    const r = readPelletField(withoutT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    //  Null, never a degenerate {lo: 0, hi: 0}: the toggle keys on this, and
    //  a zero-width range would offer the reader a picture that does not
    //  exist.
    expect(fieldTemperatureRange(r.read.rows)).toBeNull();
  });

  it("spans the published temperatures, and the bands carry them", () => {
    const r = readPelletField(withT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const range = fieldTemperatureRange(r.read.rows);
    expect(range).not.toBeNull();
    expect(range!.lo).toBeCloseTo(573.15, 6);
    expect(range!.hi).toBeCloseTo(736.65, 6);
    //  A band inherits its inner row's temperature -- the same rule the
    //  concentration bands already follow, so the two pictures are painted
    //  from the same geometry and cannot disagree about where a ring is.
    const bands = fieldBands(r.read.rows, 8);
    expect(bands[0]!.tK).toBeCloseTo(736.65, 6);
  });

  it("gives the hottest colour to the hottest point and they differ", () => {
    //  Not a claim about the palette: a claim that the ramp is not constant,
    //  which is what a reader relies on when they read the picture.
    expect(temperatureColor(1)).not.toEqual(temperatureColor(0));
  });
});

describe("the knob map — every target resolves against the real raw text", () => {
  it("every knob's override resolves uniquely, the dict unit surviving", () => {
    const raw = tutorialByName(THIELE_WITNESS)!.files.rawFiles!;
    for (const k of THIELE_KNOBS) {
      // The dimension knob's FILE is the catalyst record and its KEY depends on
      // the geometry; it is exercised in the geometry suite below.
      if (k.file === null) continue;
      const body = raw[k.file];
      expect(body, `knob '${k.id}' names missing file '${k.file}'`).toBeDefined();
      const out = applyScalarOverride(body!,
        { file: k.file, key: k.key!, value: 123.456, occurrence: k.occurrence });
      expect(out).not.toBe(body);
      const unit = k.unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      expect(out, `knob '${k.id}' (${k.file}:${k.key})`).toMatch(
        new RegExp(`^[ \\t]*${k.key}[ \\t]+123\\.456[ \\t]*${unit}[ \\t]*;`, "m"));
    }
  });

  it("the defaults ARE the witness's authored values", () => {
    // Not byte-neutrality: the override writes `3` where the record declares
    // `3.0`, which is the same number and a different string.  What must hold
    // is that the knob's stated default is the number the witness declares —
    // otherwise the tool's first frame is not the tutorial's answer.
    const raw = tutorialByName(THIELE_WITNESS)!.files.rawFiles!;
    for (const k of THIELE_KNOBS) {
      if (k.file === null) continue;
      // `nodes` is declared twice (the op's grid and the sweep's); the knob
      // names which occurrence it means, and the first is the op's own.
      const body = raw[k.file]!;
      expect(declaredNumber(body, k.key!), `knob '${k.id}' default`).toBe(k.def);
    }
    expect(declaredNumber(raw[CATALYST_DAT]!, "radius"))
      .toBe(THIELE_KNOBS.find((k) => k.id === "dimension")!.def);
  });

  it("the `nodes` knob names its occurrence — it is declared twice", () => {
    const props = tutorialByName(THIELE_WITNESS)!.files.rawFiles![PROPS_DICT]!;
    const knob = THIELE_KNOBS.find((k) => k.id === "nodes")!;
    expect(knob.occurrence, "an ambiguous key with no occurrence would throw")
      .toBe(1);
    // Without the occurrence it is genuinely ambiguous — which is the refusal
    // that makes the declaration necessary rather than decorative.
    expect(() => applyScalarOverride(props,
      { file: PROPS_DICT, key: "nodes", value: 201 })).toThrow(/matches 2 times/);
    const out = applyScalarOverride(props,
      { file: PROPS_DICT, key: "nodes", value: 801, occurrence: 1 });
    expect(declaredNumber(out, "nodes")).toBe(801);
    expect(out, "the sweep's own grid must be untouched").toContain("nodes      201;");
  });

  it("a bogus key throws rather than silently running the wrong question", () => {
    expect(() => methodCase(THIELE_WITNESS,
      [{ file: PROPS_DICT, key: "noSuchKnob", value: 1 }])).toThrow(/noSuchKnob/);
    expect(() => methodCase(THIELE_WITNESS,
      [{ file: "system/noSuchDict", key: "T", value: 1 }])).toThrow(/noSuchDict/);
  });
});

// ---- The three geometries ----------------------------------------------------

describe("the geometry rewrite — three shapes out of one witness", () => {
  const rawCatalyst = () =>
    tutorialByName(THIELE_WITNESS)!.files.rawFiles![CATALYST_DAT]!;

  /** Apply a tool override set to the witness's catalyst record only, the way
   *  `methodCase` does, so the assertions below read the text the engine would. */
  function rewrittenCatalyst(geometry: (typeof GEOMETRIES)[number]): string {
    const files = methodCase(THIELE_WITNESS,
      overridesFor(defaultKnobValues(), geometry));
    // methodCase returns parsed CaseFiles; the raw bodies ride along on it.
    const body = files.rawFiles?.[CATALYST_DAT];
    expect(body, "the cloned case must still carry the catalyst record")
      .toBeDefined();
    return body!;
  }

  it("clones cleanly for all three shapes", () => {
    for (const g of GEOMETRIES) {
      const files = methodCase(THIELE_WITNESS,
        overridesFor(defaultKnobValues(), g));
      expect(files.controlDict["application"]).toBe("choupoProps");
    }
  });

  it("writes the shape word for EVERY geometry, the witness's own included", () => {
    for (const g of GEOMETRIES)
      expect(rewrittenCatalyst(g)).toMatch(new RegExp(`^\\s*geometry\\s+${g};`, "m"));
    // The sphere override is a no-op on the text and must still have FOUND the
    // key: a silent no-op is exactly what the uniqueness rule exists to catch.
    expect(rewrittenCatalyst("sphere")).toMatch(/^\s*geometry\s+sphere;/m);
  });

  it("renames the characteristic dimension for the slab, and only the slab", () => {
    expect(dimensionKey("slab")).toBe("halfThickness");
    expect(dimensionKey("cylinder")).toBe("radius");
    expect(dimensionKey("sphere")).toBe("radius");

    const slab = rewrittenCatalyst("slab");
    expect(slab).toMatch(/^\s*halfThickness\s+1\.5\s*mm\s*;/m);
    // The engine REFUSES a slab that declares `radius`, so the old key must be
    // gone rather than merely shadowed.
    expect(slab).not.toMatch(/^\s*radius\s+/m);

    for (const g of ["cylinder", "sphere"] as const) {
      const body = rewrittenCatalyst(g);
      expect(body).toMatch(/^\s*radius\s+1\.5\s*mm\s*;/m);
      expect(body).not.toMatch(/^\s*halfThickness\s+/m);
    }
  });

  it("the rename carries the record's own number AND its unit across", () => {
    // The half-thickness is the sphere's radius verbatim — the tool says so on
    // screen (THIELE_LIMITS 'same-dimension'), and this is the mechanism.
    expect(declaredNumber(rewrittenCatalyst("slab"), "halfThickness"))
      .toBe(declaredNumber(rawCatalyst(), "radius"));
    expect(rewrittenCatalyst("slab")).toContain("mm;");
  });

  it("the dimension knob writes through the renamed key", () => {
    const knobs = { ...defaultKnobValues(), dimension: 2.75 };
    const files = methodCase(THIELE_WITNESS, overridesFor(knobs, "slab"));
    expect(declaredNumber(files.rawFiles![CATALYST_DAT]!, "halfThickness"))
      .toBe(2.75);
    const sph = methodCase(THIELE_WITNESS, overridesFor(knobs, "sphere"));
    expect(declaredNumber(sph.rawFiles![CATALYST_DAT]!, "radius")).toBe(2.75);
  });

  it("the rename comes BEFORE the scalar that writes the renamed key", () => {
    const ov = overridesFor(defaultKnobValues(), "slab");
    const rename = ov.findIndex((o) => "from" in o);
    const scalar = ov.findIndex((o) => "value" in o && o.key === "halfThickness");
    expect(rename, "the slab override set must carry a rename").toBeGreaterThanOrEqual(0);
    expect(scalar).toBeGreaterThanOrEqual(0);
    expect(rename).toBeLessThan(scalar);
  });

  it("a non-finite knob value is DROPPED, never written as NaN", () => {
    const ov = overridesFor({ ...defaultKnobValues(), tau: NaN }, "sphere");
    expect(ov.some((o) => "value" in o && o.key === "tau")).toBe(false);
    expect(ov.every((o) => !("value" in o) || Number.isFinite(o.value))).toBe(true);
  });
});

// ---- Reading the concentration field ----------------------------------------

const FIELD_HEAD = "geometry,phi,phi_char,xi,c_over_cs,"
  + "c_over_cs_closedForm,absDeviation";

const fieldCsv = (rows: string[]): string => [FIELD_HEAD, ...rows].join("\n");

describe("readPelletField", () => {
  it("reads the documented columns, in file order", () => {
    const r = readPelletField(fieldCsv([
      "sphere,1.0161,3.0483,0,0.289874,0.289873,1e-6",
      "sphere,1.0161,3.0483,0.5,0.5,0.5,0",
      "sphere,1.0161,3.0483,1,1,1,0",
    ]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.read.geometry).toBe("sphere");
    expect(r.read.phi).toBeCloseTo(1.0161, 6);
    expect(r.read.phiChar).toBeCloseTo(3.0483, 6);
    expect(r.read.rows.map((x) => x.xi)).toEqual([0, 0.5, 1]);
    expect(r.read.rows[0]!.u).toBeCloseTo(0.289874, 9);
    expect(r.read.rows[0]!.uClosed).toBeCloseTo(0.289873, 9);
    expect(r.read.skippedRows).toBe(0);
    expect(r.read.xiMonotonic).toBe(true);
  });

  it("refuses a CSV that is not the field, naming the header it needs", () => {
    const r = readPelletField("geometry,phi,eta\nsphere,1,0.6\n");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.why).toContain(FIELD_HEAD);
    expect(r.why).toContain("geometry,phi,eta");
  });

  it("refuses a field carrying more than one geometry", () => {
    const r = readPelletField(fieldCsv([
      "sphere,1,3,0,0.3,0.3,0",
      "sphere,1,3,1,1,1,0",
      "slab,3,3,0,0.1,0.1,0",
      "slab,3,3,1,1,1,0",
    ]));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.why).toContain("2 geometries");
  });

  it("counts unreadable rows rather than dropping them silently", () => {
    const r = readPelletField(fieldCsv([
      "sphere,1,3,0,0.3,0.3,0",
      "sphere,1,3,junk,0.5,0.5,0",
      "sphere,1,3",
      "sphere,1,3,1,1,1,0",
    ]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.read.rows).toHaveLength(2);
    expect(r.read.skippedRows).toBe(2);
  });

  it("FLAGS a non-monotonic xi instead of re-sorting it", () => {
    const r = readPelletField(fieldCsv([
      "sphere,1,3,1,1,1,0",
      "sphere,1,3,0,0.3,0.3,0",
    ]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.read.xiMonotonic).toBe(false);
    expect(r.read.rows.map((x) => x.xi), "the rows stay in file order")
      .toEqual([1, 0]);
  });

  it("refuses a field with fewer than two usable rows", () => {
    const r = readPelletField(fieldCsv(["sphere,1,3,0,0.3,0.3,0"]));
    expect(r.ok).toBe(false);
  });
});

// ---- Reading the eta(phi) family --------------------------------------------

const SWEEP_HEAD = "geometry,phi,phi_char,eta,eta_closedForm,"
  + "relDeviation,eta_flux";

const sweepCsv = (rows: string[]): string => [SWEEP_HEAD, ...rows].join("\n");

describe("readEtaPhiSweep", () => {
  it("groups by geometry in first-seen order, points in file order", () => {
    const r = readEtaPhiSweep(sweepCsv([
      "slab,0.1,0.1,0.9967,0.9967,1e-9,0.9967",
      "slab,10,10,0.1,0.1,1e-4,0.1",
      "sphere,0.1,0.3,0.998,0.998,1e-9,0.998",
      "sphere,10,30,0.28,0.28,9e-4,0.28",
    ]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.read.series.map((s) => s.geometry)).toEqual(["slab", "sphere"]);
    expect(r.read.series[0]!.points.map((p) => p.phi)).toEqual([0.1, 10]);
    expect(r.read.series[1]!.points[1]!.phiChar).toBe(30);
    expect(r.read.skippedRows).toBe(0);
  });

  it("refuses a CSV that is not the family", () => {
    const r = readEtaPhiSweep(FIELD_HEAD + "\nsphere,1,3,0,0.3,0.3,0\n");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.why).toContain(SWEEP_HEAD);
  });

  it("rejects a non-positive modulus — the abscissa is logarithmic", () => {
    const r = readEtaPhiSweep(sweepCsv([
      "slab,0,0,1,1,0,1",
      "slab,1,1,0.76,0.76,1e-6,0.76",
      "slab,10,10,0.1,0.1,1e-4,0.1",
    ]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.read.skippedRows).toBe(1);
    expect(r.read.series[0]!.points).toHaveLength(2);
  });

  it("refuses when no geometry has two usable points", () => {
    const r = readEtaPhiSweep(sweepCsv(["slab,1,1,0.76,0.76,1e-6,0.76"]));
    expect(r.ok).toBe(false);
  });
});

// ---- The view geometry -------------------------------------------------------

describe("fieldBands — a stride over published rows, never an interpolation", () => {
  const rows = Array.from({ length: 401 }, (_, i) => ({
    xi: i / 400, u: 1 - 0.7 * (1 - i / 400), uClosed: 0, absDev: 0,
  }));

  it("reduces to at most the requested band count", () => {
    expect(fieldBands(rows, 90).length).toBeLessThanOrEqual(90);
    expect(fieldBands(rows, 90).length).toBeGreaterThan(10);
  });

  it("every band's fill and both its edges are PUBLISHED values", () => {
    const xis = new Set(rows.map((r) => r.xi));
    const us = new Set(rows.map((r) => r.u));
    for (const b of fieldBands(rows, 90)) {
      expect(xis.has(b.from)).toBe(true);
      expect(xis.has(b.to)).toBe(true);
      expect(us.has(b.u), "a band fill that is not a published c/c_s would be "
        + "an interpolation").toBe(true);
    }
  });

  it("spans the whole published field, centre to surface", () => {
    const b = fieldBands(rows, 90);
    expect(b[0]!.from).toBe(rows[0]!.xi);
    expect(b[b.length - 1]!.to).toBe(rows[rows.length - 1]!.xi);
  });

  it("is empty rather than wrong on a degenerate field", () => {
    expect(fieldBands([], 90)).toEqual([]);
    expect(fieldBands([rows[0]!], 90)).toEqual([]);
    expect(fieldBands(rows, 0)).toEqual([]);
  });
});

describe("fieldColor", () => {
  it("is an rgb() fill across the whole range", () => {
    for (const u of [0, 0.25, 0.5, 0.75, 1])
      expect(fieldColor(u)).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
  });

  it("clamps rather than refusing — a converged field can overshoot by round-off", () => {
    expect(fieldColor(1.0000001)).toBe(fieldColor(1));
    expect(fieldColor(-1e-12)).toBe(fieldColor(0));
    expect(fieldColor(NaN)).toBe(fieldColor(0));
  });

  it("a dead core and a surface do not look the same", () => {
    expect(fieldColor(0)).not.toBe(fieldColor(1));
    expect(fieldColor(0)).not.toBe(fieldColor(0.5));
  });
});

describe("nearestLadderIndex", () => {
  it("finds each rung exactly", () => {
    RATE_CONSTANT_LADDER.forEach((k, i) => {
      expect(nearestLadderIndex(k)).toBe(i);
    });
  });

  it("snaps a typed value to the nearest rung in log space", () => {
    expect(nearestLadderIndex(45)).toBe(RATE_CONSTANT_LADDER.indexOf(40));
    expect(nearestLadderIndex(1e6)).toBe(RATE_CONSTANT_LADDER.length - 1);
  });

  it("answers the first rung for a value with no logarithm", () => {
    expect(nearestLadderIndex(0)).toBe(0);
    expect(nearestLadderIndex(-1)).toBe(0);
    expect(nearestLadderIndex(NaN)).toBe(0);
  });
});

// ---- The operation's own diagnostics ----------------------------------------

describe("readPelletDiagnostics", () => {
  const op = (over: { [k: string]: number }): OperationResult[] => [
    { name: "somethingElse", type: "propertyScan1D", diagnostics: { phi: 999 } },
    {
      name: "any name at all", type: "thielePellet",
      diagnostics: {
        phi: 1.0161, phi_char: 3.0483, eta: 0.665742, eta_closedForm: 0.665742,
        c_centre: 0.289874, weiszPrater: 0.68735, gates_pass: 1, ...over,
      },
    },
  ];

  it("selects by the operation's TYPE, never by its name", () => {
    const d = readPelletDiagnostics(op({}));
    expect(d).not.toBeNull();
    expect(d!.phi).toBeCloseTo(1.0161, 9);
    expect(d!.eta).toBeCloseTo(0.665742, 9);
    expect(d!.weiszPrater).toBeCloseTo(0.68735, 9);
  });

  it("is null when the run carries no pellet operation", () => {
    expect(readPelletDiagnostics(undefined)).toBeNull();
    expect(readPelletDiagnostics([
      { name: "x", type: "propertyScan1D", diagnostics: {} },
    ])).toBeNull();
  });

  it("leaves an absent diagnostic UNDEFINED — never a zero that reads like a measurement", () => {
    const d = readPelletDiagnostics([
      { name: "p", type: "thielePellet", diagnostics: { phi: 1 } },
    ])!;
    expect(d.phi).toBe(1);
    expect(d.eta).toBeUndefined();
    expect(d.dEff).toBeUndefined();
    expect(d.gatesPass).toBeUndefined();
  });

  it("carries the operation's own PASS/FAIL verdict", () => {
    expect(readPelletDiagnostics(op({ gates_pass: 1 }))!.gatesPass).toBe(true);
    expect(readPelletDiagnostics(op({ gates_pass: 0 }))!.gatesPass).toBe(false);
  });
});

// ---- The registry entry, and the mount ---------------------------------------

describe("the EduTools entry", () => {
  const entry = METHOD_TOOLS.find((t) => t.id === "thiele");

  it("is registered, live, and a construction", () => {
    expect(entry, "the Thiele tool must be in METHOD_TOOLS").toBeDefined();
    expect(entry!.status).toBe("live");
    expect(entry!.kind).toBe("construction");
    expect(entry!.theory).toBe("ch:thiele");
    // Ratified naming: operation-first, method in parentheses.
    expect(entry!.label).toMatch(/^Catalyst pellet \(.*\)$/);
  });

  it("EVERY live tool is mounted in the workspace dispatch", () => {
    // The dispatch's fallback refuses by name now, so an unmounted id is
    // visible rather than silently drawing another tool — but a registry entry
    // that reaches the refusal is still a page with no construction on it.
    const src = readFileSync(
      resolve(here, "../src/ui/MethodsWorkspace.tsx"), "utf8");
    for (const t of METHOD_TOOLS.filter((m) => m.status === "live")) {
      expect(src, `live tool '${t.id}' has no branch in MethodsWorkspace's `
        + "dispatch — it would render the UnmountedTool refusal")
        .toContain(`tool === "${t.id}"`);
    }
  });
});

// ---- What the view says about its own limits --------------------------------

describe("THIELE_LIMITS — the claim and its limits, on screen", () => {
  it("carries a body for every entry and unique ids", () => {
    const ids = THIELE_LIMITS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of THIELE_LIMITS) {
      expect(l.title.trim().length).toBeGreaterThan(0);
      expect(l.body.trim().length).toBeGreaterThan(40);
    }
  });

  // The four the brief made non-negotiable, each pinned by the claim it must
  // make rather than by its wording — a caption a maintainer rephrases should
  // not fail, a claim they delete must.
  it("states that the model is ISOTHERMAL and FIRST ORDER only", () => {
    const l = THIELE_LIMITS.find((x) => x.id === "isothermal")!;
    expect(`${l.title} ${l.body}`).toMatch(/isothermal/i);
    expect(`${l.title} ${l.body}`).toMatch(/first order/i);
    expect(l.body, "multiplicity is the reason, and it must be said")
      .toMatch(/steady states/i);
  });

  it("states that the catalyst record is a TEACHING SURROGATE", () => {
    const l = THIELE_LIMITS.find((x) => x.id === "surrogate")!;
    expect(l.title).toMatch(/teaching surrogate/i);
    expect(l.body).toMatch(/tortuosity/i);
    expect(l.body, "and what IS verified, which does not depend on it")
      .toMatch(/closed form/i);
  });

  it("states that NO REACTOR APPLIES eta yet", () => {
    const l = THIELE_LIMITS.find((x) => x.id === "no-reactor")!;
    expect(l.title).toMatch(/no reactor applies/i);
    // The four reactors by name: a student must not leave thinking their
    // packed bed has been corrected.
    for (const r of ["cstr", "pfr", "batchReactor", "dynamicCSTR"])
      expect(l.body).toContain(r);
    expect(l.body).toMatch(/undersized/i);
  });

  it("states that the external film is neglected", () => {
    const l = THIELE_LIMITS.find((x) => x.id === "film")!;
    expect(`${l.title} ${l.body}`).toMatch(/film/i);
  });

  it("states that the three shapes share ONE characteristic dimension", () => {
    const l = THIELE_LIMITS.find((x) => x.id === "same-dimension")!;
    expect(l.title).toMatch(/characteristic dimension/i);
    expect(l.body).toMatch(/half-thickness/i);
  });
});
