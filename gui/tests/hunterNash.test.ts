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
  hunterNash — the tie-triangle EduTool's reading, geometry and witness pins.

  WHAT THIS SUITE CANNOT SEE, stated first because it is the larger half:

  * IT NEVER RUNS THE ENGINE.  The WASM binaries need a browser; node cannot
    load them.  The cascade numbers below are a RECORDED run of
    `./choupoSolve tutorials/steady/absorption/extract01_ethanol_water_benzene`
    taken on 2026-08-18 on the tree's own build, transcribed from the result
    JSON.  The map side needs no transcription at all: the witness ships its
    own `ternary.csv`, the committed output reproduces the fresh run
    byte-for-byte, and this suite reads THAT file out of the bundled corpus.
  * IT NEVER RENDERS THE TOOL.  jsdom gives every box a zero size, so a test
    that mounted the SVG would be pinning a picture nobody can see.  The
    component is deliberately thin: the reading and the construction are in
    `case/hunterNash.ts`, which imports only types, and that is what is
    exercised here.
  * THE TOOL HAS NEVER BEEN OPENED IN A BROWSER, by anyone, because it is not
    mounted (registry.ts carries the reason and the two lines that mount it).
    No test in this repository can close that gap; `bin/checkGui` can, the day
    the page exists.

  What IS pinned: that the two witnesses are the same system, that every knob
  reaches a real declared scalar, that the reader survives the real CSV, and
  that the construction's colinearity check FIRES when the colinearity is
  broken — a check that cannot fail is not a check.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import type { StreamResult, UnitProfile } from "../src/adapters/SolverAdapter.js";
import { applyScalarOverride, methodCase } from "../src/case/methodRun.js";
import { tutorialByName } from "../src/cases/tutorials.js";
import {
  COLUMN_WITNESS, MAP_CSV, MAP_WITNESS, TIE_TRIANGLE_KNOBS,
  WITNESS_CARRIER, WITNESS_COMPONENTS, WITNESS_SOLUTE, WITNESS_SOLVENT,
  bindInlets, buildConstruction, closureGap, cornerOrder, defaultKnobValues,
  distance, findExtractorFeeds, knobOverridesFor, lineIntersection,
  pointLineDistance, project, readStageTies, readTernaryScan, worstResidual,
  type KpiMap, type Tri,
} from "../src/case/hunterNash.js";

const rawOf = (witness: string): { [rel: string]: string } => {
  const entry = tutorialByName(witness);
  expect(entry, `witness '${witness}' missing from the bundled corpus`).toBeDefined();
  expect(entry!.files.rawFiles,
    `witness '${witness}' carries no raw dicts`).toBeDefined();
  return entry!.files.rawFiles!;
};

// ---- The witnesses: bundled, and the SAME SYSTEM ----------------------------
// The whole picture rests on this.  A tie-line map of one chemistry with a
// cascade of another laid over it would look exactly as convincing and be
// worthless, and nothing on screen could reveal it.

describe("the two witnesses — bundled, and one system", () => {
  it("both are in the bundled corpus, each with its own binary", () => {
    expect(rawOf(MAP_WITNESS)["system/controlDict"]).toContain("choupoProps");
    expect(rawOf(COLUMN_WITNESS)["system/controlDict"]).toContain("choupoSolve");
    expect(tutorialByName(MAP_WITNESS)!.category).toBe("props");
    expect(tutorialByName(COLUMN_WITNESS)!.category).toBe("steady");
  });

  it("the map witness declares the propertyScanTernary LLE op and its CSV", () => {
    const propsDict = rawOf(MAP_WITNESS)["system/propsDict"]!;
    expect(propsDict).toMatch(/type\s+propertyScanTernary\s*;/);
    expect(propsDict).toMatch(/mode\s+lle\s*;/);
    expect(propsDict).toContain(MAP_CSV);
  });

  it("the column witness declares the extractor and its solvent species", () => {
    const fs = rawOf(COLUMN_WITNESS)["system/flowsheetDict"]!;
    expect(fs).toMatch(/type\s+extractor\s*;/);
    expect(fs).toMatch(new RegExp(`solvent\\s+${WITNESS_SOLVENT}\\s*;`));
  });

  it("BOTH declare the same components, in the order the scan CSV uses", () => {
    for (const w of [MAP_WITNESS, COLUMN_WITNESS]) {
      const thermo = rawOf(w)["constant/thermoPhysPropDict"]!;
      const m = /components\s*\(([^)]*)\)/.exec(thermo);
      expect(m, `no components( ) list in ${w}`).toBeTruthy();
      expect(m![1]!.trim().split(/\s+/)).toEqual([...WITNESS_COMPONENTS]);
    }
  });

  it("their thermo dicts differ ONLY in the phase names and the vapour block", () => {
    const map = rawOf(MAP_WITNESS)["constant/thermoPhysPropDict"]!;
    const col = rawOf(COLUMN_WITNESS)["constant/thermoPhysPropDict"]!;
    // Normalise the two KNOWN, harmless differences and nothing else:
    //   * the liquid phases are named liq1/liq2 on the map and
    //     raffinate/extract on the column (a name, not a model);
    //   * the map declares a vapour fugacity model its `mode lle` run
    //     (PhaseSet::LL) never reaches.
    const norm = (s: string) => s
      .replace(/name\s+(liq1|raffinate)\s*;/, "name PHASE_A;")
      .replace(/name\s+(liq2|extract)\s*;/, "name PHASE_B;")
      .replace(/\n\s*vapour\s*\{[^}]*\}\n/, "\n");
    expect(norm(map).trim(), "the two witnesses' thermo declarations have "
      + "diverged beyond the phase names and the vapour block — the map's "
      + "tie-lines and the column's stages are no longer the same physics")
      .toBe(norm(col).trim());
  });

  it("their SEALED records are byte-identical, not merely equivalent", () => {
    // The declarations agreeing is not the same claim as the records
    // resolving identically.  Both witnesses ship their own sealed copies;
    // compare every one of them.
    const map = rawOf(MAP_WITNESS), col = rawOf(COLUMN_WITNESS);
    const sealed = (r: { [k: string]: string }) => Object.keys(r)
      .filter((k) => k.startsWith("constant/components/")
        || k.startsWith("constant/parameters/"))
      .sort();
    const keys = sealed(map);
    expect(keys.length, "the map witness ships no sealed records — this test "
      + "would then be comparing two empty sets").toBeGreaterThan(0);
    expect(keys).toEqual(sealed(col));
    for (const k of keys)
      expect(map[k], `sealed record '${k}' differs between the witnesses`)
        .toBe(col[k]);
  });

  it("the declared roles are the witnesses' own words", () => {
    const feed = rawOf(COLUMN_WITNESS)["0/feed"]!;
    expect(feed).toMatch(new RegExp(`^\\s*${WITNESS_CARRIER}\\s`, "m"));
    expect(feed).toMatch(new RegExp(`^\\s*${WITNESS_SOLUTE}\\s`, "m"));
    expect(feed).not.toMatch(new RegExp(`^\\s*${WITNESS_SOLVENT}\\s`, "m"));
    expect(rawOf(COLUMN_WITNESS)["0/solvent"]!)
      .toMatch(new RegExp(`^\\s*${WITNESS_SOLVENT}\\s`, "m"));
  });
});

// ---- The knob map -----------------------------------------------------------

describe("the knob map — every target resolves against the real raw text", () => {
  it("every knob's override resolves uniquely, the dict unit surviving", () => {
    for (const k of TIE_TRIANGLE_KNOBS) {
      expect(k.targets.length, `knob '${k.id}' has no targets`).toBeGreaterThan(0);
      for (const t of k.targets) {
        const raw = rawOf(t.witness)[t.file];
        expect(raw, `knob '${k.id}' names missing file '${t.file}' in `
          + `'${t.witness}'`).toBeDefined();
        const out = applyScalarOverride(raw!,
          { file: t.file, key: k.key, value: 123.456 });
        expect(out).not.toBe(raw);
        const line = new RegExp(
          `^[ \\t]*${k.key}[ \\t]+123\\.456[ \\t]*`
          + k.unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[ \\t]*;", "m");
        expect(out, `knob '${k.id}' (${t.witness} ${t.file}:${k.key})`)
          .toMatch(line);
      }
    }
  });

  it("the defaults ARE the witnesses' authored values — byte-neutral", () => {
    for (const k of TIE_TRIANGLE_KNOBS)
      for (const t of k.targets) {
        const raw = rawOf(t.witness)[t.file]!;
        expect(applyScalarOverride(raw, { file: t.file, key: k.key, value: k.def }),
          `default for knob '${k.id}' moved '${t.witness}'`).toBe(raw);
      }
  });

  it("methodCase clones BOTH witnesses with the full default knob set", () => {
    const defaults = defaultKnobValues();
    const map = methodCase(MAP_WITNESS, knobOverridesFor(defaults, MAP_WITNESS));
    expect(map.controlDict["application"]).toBe("choupoProps");
    const col = methodCase(COLUMN_WITNESS, knobOverridesFor(defaults, COLUMN_WITNESS));
    expect(col.controlDict["application"]).toBe("choupoSolve");
    expect(col.flowsheet).toBeDefined();
  });

  it("a NaN knob is dropped rather than written into a dict", () => {
    const broken = { ...defaultKnobValues(), stages: NaN };
    expect(knobOverridesFor(broken, COLUMN_WITNESS).map((o) => o.key))
      .not.toContain("stages");
  });

  it("REFUSED KNOB: the map's T is unreachable, so there is no T knob", () => {
    // The column's `temperature 298.15 K;` IS addressable...
    const col = rawOf(COLUMN_WITNESS)["system/flowsheetDict"]!;
    expect(() => applyScalarOverride(col,
      { file: "system/flowsheetDict", key: "temperature", value: 310 })).not.toThrow();
    // ...but the map's sits in an INLINE sub-dict (`state { T 298.15 K; … }`)
    // that the line-anchored grammar cannot reach.  A knob that moved one and
    // not the other would draw one temperature's stages on another
    // temperature's map, so the knob is refused rather than half-wired.
    const map = rawOf(MAP_WITNESS)["system/propsDict"]!;
    expect(map).toContain("298.15");
    expect(() => applyScalarOverride(map,
      { file: "system/propsDict", key: "T", value: 310 })).toThrow(/T/);
    expect(TIE_TRIANGLE_KNOBS.map((k) => k.key))
      .not.toContain("temperature");
  });

  it("RECORDED ABSENCE: the map's grid n is out of the grammar's reach", () => {
    const map = rawOf(MAP_WITNESS)["system/propsDict"]!;
    expect(map).toMatch(/grid\s*\{\s*n\s+\d+\s*;/);
    expect(() => applyScalarOverride(map,
      { file: "system/propsDict", key: "n", value: 24 })).toThrow(/n/);
  });
});

// ---- The scan reader, against the REAL bundled CSV --------------------------

const mapCsv = (): string => {
  const csv = rawOf(MAP_WITNESS)[MAP_CSV];
  expect(csv, `${MAP_WITNESS} does not ship ${MAP_CSV} — this suite reads the `
    + "engine's own committed output and cannot substitute one").toBeDefined();
  return csv!;
};

describe("readTernaryScan — over the engine's own committed phase map", () => {
  it("reads every row: nodes, paired tie-lines, nothing skipped", () => {
    const r = readTernaryScan(mapCsv());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Counts as the committed CSV carries them (tieStride 4, grid n 16).
    // They move if the witness is re-run with different settings — which is a
    // change worth noticing, not a flake.
    expect(r.read.nodes.length).toBe(105);
    expect(r.read.ties.length).toBe(18);
    expect(r.read.skippedRows).toBe(0);
    expect(r.read.unpairedTies).toBe(0);
  });

  it("every tie END is a composition that closes", () => {
    const r = readTernaryScan(mapCsv());
    if (!r.ok) throw new Error(r.why);
    for (const tie of r.read.ties)
      for (const end of tie.ends)
        expect(closureGap(end), `tie ${tie.id} end does not sum to 1`)
          .toBeLessThan(1e-8);
  });

  it("reports the shallowest published split rather than filtering on it", () => {
    const r = readTernaryScan(mapCsv());
    if (!r.ok) throw new Error(r.why);
    // A pure minimum over the engine's own beta columns.  On this map it is
    // 1e-4 at six two-liquid nodes: splits that shallow are all but
    // single-phase, and the tool QUOTES that rather than dropping them.
    expect(r.read.minorBetaMin).not.toBeNull();
    expect(r.read.minorBetaMin!).toBeGreaterThan(0);
    expect(r.read.minorBetaMin!).toBeLessThan(1e-3);
    expect(r.read.minorBetaMinCount).toBeGreaterThanOrEqual(1);
    // and nothing was dropped for being shallow
    expect(r.read.nodes.filter((n) => n.region === "LL").length).toBeGreaterThan(
      r.read.minorBetaMinCount);
  });

  it("REFUSES a scalar-surface CSV instead of drawing tie-lines over it", () => {
    const r = readTernaryScan("x1,x2,x3,T_bubble\n0.2,0.3,0.5,350\n");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.why).toMatch(/phase map/i);
  });

  it("REFUSES an empty CSV", () => {
    expect(readTernaryScan("").ok).toBe(false);
  });

  it("counts a lone tie row as unpaired rather than drawing half a line", () => {
    const header = "x1,x2,x3,region,region_id,kind,tieline_id,"
      + "beta_vapor,beta_alpha,beta_beta";
    const r = readTernaryScan(
      `${header}\n0.1,0.2,0.7,LL,2,tie,7,0,0,0\n`);
    if (!r.ok) throw new Error(r.why);
    expect(r.read.ties.length).toBe(0);
    expect(r.read.unpairedTies).toBe(1);
  });

  it("counts a malformed row rather than silently dropping it", () => {
    const header = "x1,x2,x3,region,region_id,kind,tieline_id,"
      + "beta_vapor,beta_alpha,beta_beta";
    const r = readTernaryScan(`${header}\n0.1,0.2\n`);
    if (!r.ok) throw new Error(r.why);
    expect(r.read.skippedRows).toBe(1);
  });
});

// ---- The recorded cascade ---------------------------------------------------
// A RECORDED run, transcribed from the result JSON of
//   ./choupoSolve tutorials/steady/absorption/extract01_ethanol_water_benzene
// on 2026-08-18.  Regenerate by re-running that case and reading
// profiles.extractor01.columns / kpis.extractor01 / streams out of the
// <<<Choupo:result-begin>>> block.

const CASCADE_PROFILE: UnitProfile = {
  unit: "extractor01",
  xAxis: "stage",
  columns: {
    stage: [1, 2, 3, 4, 5],
    F_extract: [0.0359293973028, 0.0361560836087, 0.0361448210002,
      0.0360650515383, 0.0355660630142],
    F_raffinate: [0.0280050184609, 0.027995715597, 0.027910434535,
      0.0274103571408, 0.0251772962492],
    xE_water: [0.00617947221867, 0.00614453951182, 0.00615471082141,
      0.00605333161255, 0.00526384781352],
    xE_ethanol: [0.068277518917, 0.0682625439376, 0.0679634668215,
      0.0662985286915, 0.0547466999672],
    xE_benzene: [0.925543008864, 0.925592916551, 0.925881822357,
      0.927648139696, 0.939989452219],
    xR_water: [0.793549045122, 0.79375892322, 0.795893894347,
      0.809490082838, 0.873762110653],
    xR_ethanol: [0.198959734551, 0.198755813954, 0.196728983963,
      0.184079401902, 0.123095760707],
    xR_benzene: [0.00749122032748, 0.00748526282565, 0.00737712169005,
      0.00643051525967, 0.00314212864009],
  },
};

const CASCADE_KPIS: KpiMap = {
  extractor01: {
    F_feed: 0.0277777777778,
    F_solvent: 0.0333333333333,
    F_extract: 0.0359293973028,
    F_raffinate: 0.0251772962492,
    stages: 5,
    splitStages: 5,
    recovery_ethanol: 0.441759080105,
    soluteRecovery: 0.441759080105,
    massClosure: 7.22873301889e-05,
  },
};

const stream = (
  name: string, role: StreamResult["role"], F: number,
  composition: { [c: string]: number },
): StreamResult => ({ name, role, F, T: 298.15, P: 101325, composition });

const CASCADE_STREAMS: StreamResult[] = [
  stream("feed", "feed", 0.0277777777778, { water: 0.8, ethanol: 0.2, benzene: 0 }),
  stream("solvent", "feed", 0.0333333333333, { water: 0, ethanol: 0, benzene: 1 }),
  stream("extract", "product", 0.0359293973028,
    { water: 0.0061738946719, ethanol: 0.0683066596138, benzene: 0.925519445714 }),
  stream("raffinate", "product", 0.0251772962492,
    { water: 0.873814212497, ethanol: 0.123051356374, benzene: 0.00313443112834 }),
];

const ORDER = cornerOrder(WITNESS_COMPONENTS,
  [WITNESS_CARRIER, WITNESS_SOLVENT, WITNESS_SOLUTE]);

function buildFromRecorded(profile = CASCADE_PROFILE) {
  const feeds = findExtractorFeeds([profile], CASCADE_KPIS, WITNESS_COMPONENTS);
  expect(feeds.length).toBe(1);
  const inlets = bindInlets(CASCADE_STREAMS, feeds[0]!.kpis, WITNESS_COMPONENTS);
  if (!inlets.ok) throw new Error(inlets.why);
  const built = buildConstruction(
    inlets.feed, inlets.solvent, feeds[0]!.stages, ORDER);
  if (!built.ok) throw new Error(built.why);
  return built.construction;
}

describe("the cascade reader", () => {
  it("detects the extractor by its COLUMNS, not by any name", () => {
    const feeds = findExtractorFeeds([CASCADE_PROFILE], CASCADE_KPIS,
      WITNESS_COMPONENTS);
    expect(feeds.length).toBe(1);
    expect(feeds[0]!.stages.length).toBe(5);
    expect(feeds[0]!.stages[0]!.stage).toBe(1);
  });

  it("does not claim a distillation profile (a stage axis is not enough)", () => {
    const column: UnitProfile = {
      unit: "col1", xAxis: "stage",
      columns: { stage: [1, 2, 3], T: [350, 355, 360], x_benzene: [0.9, 0.5, 0.1] },
    };
    expect(findExtractorFeeds([column], { col1: CASCADE_KPIS["extractor01"]! },
      WITNESS_COMPONENTS)).toEqual([]);
  });

  it("readStageTies returns NOTHING when one component's column is missing", () => {
    const cols = { ...CASCADE_PROFILE.columns };
    delete cols["xE_benzene"];
    expect(readStageTies({ ...CASCADE_PROFILE, columns: cols },
      WITNESS_COMPONENTS)).toEqual([]);
  });

  it("binds the inlets by the cascade's own terminal FLOWS", () => {
    const r = bindInlets(CASCADE_STREAMS, CASCADE_KPIS["extractor01"]!,
      WITNESS_COMPONENTS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.feed.name).toBe("feed");
    expect(r.solvent.name).toBe("solvent");
  });

  it("REFUSES when two inlets carry the same flow — ambiguity is not guessed", () => {
    const twins = CASCADE_STREAMS.map((s) => s.role === "feed"
      ? { ...s, F: 0.0277777777778 } : s);
    const r = bindInlets(twins, CASCADE_KPIS["extractor01"]!, WITNESS_COMPONENTS);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.why).toMatch(/not decidable|same flow/i);
  });

  it("REFUSES when the run publishes fewer than two inlets", () => {
    const r = bindInlets(CASCADE_STREAMS.filter((s) => s.name !== "solvent"),
      CASCADE_KPIS["extractor01"]!, WITNESS_COMPONENTS);
    expect(r.ok).toBe(false);
  });
});

// ---- The construction, and the check that it can FAIL -----------------------

describe("the Hunter-Nash construction over the recorded cascade", () => {
  it("locates Δ and every operating leg", () => {
    const c = buildFromRecorded();
    expect(c.delta).not.toBeNull();
    expect(c.legs.length).toBe(5);
    expect(c.legs.filter((l) => l.byConstruction).length).toBe(1);
    expect(c.legs[4]!.byConstruction).toBe(true);
  });

  it("Δ falls OUTSIDE the triangle — a difference is not a stream", () => {
    const c = buildFromRecorded();
    // Every real composition projects inside the unit triangle; Δ does not,
    // which is exactly why the tool offers a frame that contains it.
    const inside = c.delta!.x >= 0 && c.delta!.x <= 1
      && c.delta!.y >= 0 && c.delta!.y <= Math.sqrt(3) / 2;
    expect(inside).toBe(false);
  });

  it("the colinearity claim SURVIVES the rigorous cascade", () => {
    const c = buildFromRecorded();
    const worst = worstResidual(c);
    expect(worst).not.toBeNull();
    // Triangle-edge units.  The cascade itself stops at a column closure of
    // 1e-4, so the residual is that tolerance showing through — the recorded
    // value is 1.2e-4.  The bound is deliberately loose enough not to pin the
    // solver's noise floor and tight enough that a broken construction cannot
    // pass it (the sabotage below lands two orders of magnitude above it).
    expect(worst!).toBeLessThan(1e-3);
  });

  it("the leg that DEFINED Δ closes exactly, and is marked as no evidence", () => {
    const c = buildFromRecorded();
    const closing = c.legs[4]!;
    expect(closing.byConstruction).toBe(true);
    expect(closing.residual!).toBeLessThan(1e-12);
    // worstResidual must not count it — a tautology is not a measurement.
    expect(worstResidual(c)).toBeGreaterThan(closing.residual!);
  });

  it("SABOTAGE: move one stage's extract and the residual fires", () => {
    // A check that cannot fail is not a check.  Displace E₃ by 2 % of the
    // benzene axis, keeping the composition closed, and the colinearity of
    // (Δ, R₂, E₃) must break loudly.
    const cols = { ...CASCADE_PROFILE.columns };
    const e = [...cols["xE_ethanol"]!]; const b = [...cols["xE_benzene"]!];
    e[2] = e[2]! + 0.02; b[2] = b[2]! - 0.02;
    const c = buildFromRecorded({
      ...CASCADE_PROFILE,
      columns: { ...cols, xE_ethanol: e, xE_benzene: b },
    });
    const worst = worstResidual(c);
    expect(worst).not.toBeNull();
    expect(worst!).toBeGreaterThan(1e-2);
  });

  it("the mixing point agrees with the lever rule it did not use", () => {
    const c = buildFromRecorded();
    expect(c.mixingGeometric).not.toBeNull();
    expect(c.mixingGap).not.toBeNull();
    // Two independent determinations: a line crossing, and (F·z_F + S·z_S)/
    // (F+S) from published flows.  The recorded gap is 2.8e-4 of a triangle
    // edge — the cascade's own overall-balance error, seen geometrically.
    expect(c.mixingGap!).toBeLessThan(1e-3);
    expect(c.mixingGap!).toBeGreaterThan(0);
  });

  it("SABOTAGE: break the overall balance and the mixing gap opens", () => {
    const bad = CASCADE_STREAMS.map((s) =>
      s.name === "solvent" ? { ...s, F: 0.05 } : s);
    const feeds = findExtractorFeeds([CASCADE_PROFILE], CASCADE_KPIS,
      WITNESS_COMPONENTS);
    // The binding is by FLOW, so a solvent stream that no longer matches the
    // cascade's F_solvent is REFUSED before it can be drawn — the earlier of
    // the two honest outcomes.
    const inlets = bindInlets(bad, feeds[0]!.kpis, WITNESS_COMPONENTS);
    expect(inlets.ok).toBe(false);
  });

  it("reports a composition that does not close instead of renormalising", () => {
    const cols = { ...CASCADE_PROFILE.columns };
    const w = [...cols["xR_water"]!]; w[4] = w[4]! + 0.01;
    const c = buildFromRecorded({
      ...CASCADE_PROFILE, columns: { ...cols, xR_water: w },
    });
    expect(c.openCompositions.length).toBe(1);
    expect(c.openCompositions[0]).toMatch(/R_5/);
  });
});

// ---- The view geometry, on its own -----------------------------------------

describe("the view geometry", () => {
  it("projects the three pure components onto the three corners", () => {
    const id: [number, number, number] = [0, 1, 2];
    expect(project([1, 0, 0] as Tri, id)).toEqual({ x: 0, y: 0 });
    expect(project([0, 1, 0] as Tri, id)).toEqual({ x: 1, y: 0 });
    expect(project([0, 0, 1] as Tri, id).y).toBeCloseTo(Math.sqrt(3) / 2, 12);
  });

  it("the corner order is the DECLARED roles, not the CSV order", () => {
    // carrier bottom-left, solvent bottom-right, solute at the apex.
    expect(ORDER).toEqual([0, 2, 1]);
    const apex = project([0, 1, 0] as Tri, ORDER);   // pure ethanol
    expect(apex.y).toBeCloseTo(Math.sqrt(3) / 2, 12);
  });

  it("cornerOrder REFUSES a role the scan does not carry", () => {
    expect(() => cornerOrder(WITNESS_COMPONENTS, ["water", "toluene", "ethanol"]))
      .toThrow(/toluene/);
  });

  it("lineIntersection returns null on parallel lines, never a huge number", () => {
    expect(lineIntersection({ x: 0, y: 0 }, { x: 1, y: 0 },
      { x: 0, y: 1 }, { x: 1, y: 1 })).toBeNull();
    const p = lineIntersection({ x: 0, y: 0 }, { x: 1, y: 1 },
      { x: 0, y: 1 }, { x: 1, y: 0 });
    expect(p!.x).toBeCloseTo(0.5, 12);
    expect(p!.y).toBeCloseTo(0.5, 12);
  });

  it("pointLineDistance measures perpendicular distance, null on a point", () => {
    expect(pointLineDistance({ x: 0, y: 2 }, { x: 0, y: 0 }, { x: 1, y: 0 }))
      .toBeCloseTo(2, 12);
    expect(pointLineDistance({ x: 0, y: 2 }, { x: 1, y: 1 }, { x: 1, y: 1 }))
      .toBeNull();
  });

  it("distance and closureGap are what they say", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(closureGap([0.5, 0.25, 0.25] as Tri)).toBeCloseTo(0, 12);
    expect(closureGap([0.5, 0.25, 0.3] as Tri)).toBeCloseTo(0.05, 12);
  });
});
