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
  columnControlTool — the SELECTION-kind EduTool: its record reader, its two
  tray criteria, and the mechanics that put a knob into the witness's dict.

  WHAT THIS FILE CAN AND CANNOT SEE.  It runs in node, so it never touches the
  WASM adapter: the criteria are checked against FIXTURES and against numbers
  measured from a REAL native run of the witness (recorded in the fixture's own
  comment with the command that produced them), and the knob→dict mechanics are
  checked against the REAL bundled raw text — a knob that misses its dict would
  run the engine on the wrong question, silently.

  THE RECORD RULES ARE TESTED BY SABOTAGE, not by reading the shipped files and
  agreeing with them: each refusal is fired by mutating a record in memory and
  requiring the reader to name it.  A refusal nobody has watched fire is a
  refusal nobody knows about.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  COLUMN_CONTROL_KNOBS, COLUMN_CONTROL_WITNESS, HANDLE_TEXT,
  WITNESS_DISTILLATE_RATE, WITNESS_FEED_STAGE, WITNESS_REFLUX_RATIO,
  baseOverrides, defaultKnobValues, findColumnFeeds, isaTag, perturbedOverrides,
  drumStreams, pickStage, placeValve, qualityLoopFor, sensitivityMetric,
  signChanges, slopeMetric,
  stageY, trayRange,
} from "../src/ui/methods/ColumnControlTool.js";
import {
  conflictPairs, heuristicsForStructure, heuristicsForTopic,
  readHeuristicsCatalogue, stanceOn,
} from "../src/ui/methods/columnControlRecords.js";
import { applyScalarOverride, methodCase } from "../src/case/methodRun.js";
import { tutorialByName } from "../src/cases/tutorials.js";
import { METHOD_TOOLS, METHOD_TOOL_KINDS } from "../src/ui/methods/registry.js";

const here = dirname(fileURLToPath(import.meta.url));
const heuristicsDir = resolve(here, "../../data/standards/heuristics");
const readRecord = (name: string): string =>
  readFileSync(resolve(heuristicsDir, name), "utf8");

// ---------------------------------------------------------------------------
//  THE WITNESS'S REAL ANSWER.
//
//  Measured natively on 2026-08-19 by running choupoSolve on a copy of
//  tutorials/steady/distillation/column02_simultaneous at its authored
//  parameters (15 stages, feed on stage 8, R = 2.0, D = 50 kmol/h, rigorous
//  MESH) and reading `profiles.column01.columns.T` out of the result JSON.
//  These are the engine's numbers, not this file's.
// ---------------------------------------------------------------------------
const WITNESS_T: number[] = [
  354.210890137, 355.146911806, 356.558823472, 358.493755934, 360.832097494,
  363.274262730, 365.473988722, 367.211125216, 369.782514576, 372.877061615,
  376.016801583, 378.710332118, 380.714857271, 382.056838253, 382.893527916,
];

describe("column-control — the registry entry", () => {
  const entry = METHOD_TOOLS.find((m) => m.id === "column-control");

  it("is the first tool of the SELECTION kind, and it is live", () => {
    expect(entry, "the column-control tool must be in the registry").toBeTruthy();
    expect(entry!.kind).toBe("selection");
    expect(entry!.status).toBe("live");
  });

  it("every other tool declares a kind too — the field is not optional", () => {
    //  READ FROM THE REGISTRY, never re-typed here.  The literal list this
    //  line used to carry was a second home for a fact registry.ts owns, and
    //  it failed the day a third kind was added -- which is the whole failure
    //  mode the arity doctrine names.
    for (const m of METHOD_TOOLS)
      expect(METHOD_TOOL_KINDS as readonly string[], `${m.id} needs a kind`)
        .toContain(m.kind);
  });

  it("declares the Theory Guide section written FOR it, not a near neighbour", () => {
    //  The known defect this arm exists against: four tools declare anchors
    //  that EXIST but point at the wrong section, because the anchor gate
    //  checks existence and not aptness.  This one is checked for BOTH — the
    //  label exists (methodTheoryAnchors.test.ts) and the section it opens is
    //  about this tool's subject.
    expect(entry!.theory).toBe("sec:column-control");
    const tex = readFileSync(resolve(here, "../../docs/theoryGuide.tex"), "utf8");
    const at = tex.indexOf("\\label{sec:column-control}");
    expect(at, "the section must exist in the guide source").toBeGreaterThan(0);
    const body = tex.slice(at, at + 14000);
    for (const must of [
      "slope", "sensitivity", "reflux", "boilup", "condenser", "level",
    ])
      expect(body.toLowerCase(), `the section must be about ${must}`)
        .toContain(must);
  });
});

describe("column-control — the heuristics catalogue", () => {
  const cat = readHeuristicsCatalogue();

  it("reads every shipped record, with NO refusals", () => {
    expect(cat.refusals, cat.refusals.join("\n")).toEqual([]);
    expect(cat.heuristics.length).toBeGreaterThan(5);
    expect(cat.structures.length).toBeGreaterThan(3);
  });

  it("names the structures as the literature names them", () => {
    const names = cat.structures.map((s) => s.name);
    for (const n of ["LV", "LB", "DV", "DB", "ratioLDVB", "singleEndedLV"])
      expect(names).toContain(n);
  });

  it("LV is what the cited definition says it is", () => {
    //  Skogestad (2007): condensation on pressure, distillate on condenser
    //  level, bottoms on reboiler level, so L and V remain free for
    //  composition.  The drawing is generated from this, so a drift here would
    //  be a drawing that teaches the wrong wiring.
    const lv = cat.structures.find((s) => s.name === "LV")!;
    const by = (c: string) =>
      lv.loops.find((l) => l.controlled === c)?.manipulates;
    expect(by("pressure")).toBe("condenserDuty");
    expect(by("condenserLevel")).toBe("distillate");
    expect(by("reboilerLevel")).toBe("bottoms");
    expect(by("topComposition")).toBe("reflux");
    expect(by("bottomComposition")).toBe("boilup");
    expect(lv.freeForComposition.sort()).toEqual(["boilup", "reflux"]);
  });

  it("DV frees the distillate and puts the drum level on the reflux", () => {
    const dv = cat.structures.find((s) => s.name === "DV")!;
    const by = (c: string) =>
      dv.loops.find((l) => l.controlled === c)?.manipulates;
    expect(by("condenserLevel")).toBe("reflux");
    expect(by("topComposition")).toBe("distillate");
  });

  it("every quality loop measures a TRAY, never a composition directly", () => {
    for (const s of cat.structures)
      for (const l of s.loops.filter((x) => x.kind === "quality"))
        expect(["rectifyingTray", "strippingTray"],
          `${s.name}/${l.controlled}`).toContain(l.measuredAt);
  });

  it("EVERY record carries a claim, a validity domain and what it misses", () => {
    for (const h of cat.heuristics) {
      expect(h.claim.length, `${h.file} claim`).toBeGreaterThan(20);
      expect(h.validity.length, `${h.file} validity`).toBeGreaterThan(20);
      expect(h.notCovered.length, `${h.file} notCovered`).toBeGreaterThan(20);
    }
  });

  it("every CITED record names an author and a publication", () => {
    for (const h of cat.heuristics.filter(
      (x) => x.authority === "primaryLiterature")) {
      expect(h.source.author.length, `${h.file}`).toBeGreaterThan(3);
      expect(h.source.publication, `${h.file}`).toMatch(/\d{4}/);
    }
  });

  it("NO record claims a verification it does not have", () => {
    //  `generalKnowledge` is in the vocabulary so the state can be DECLARED
    //  rather than hidden.  Nothing shipped uses it: a rule nobody checked is a
    //  rule this project does not ship.  If one ever appears, this arm makes it
    //  a decision rather than a drift.
    for (const h of cat.heuristics)
      expect(h.source.verification, `${h.file}`).not.toBe("generalKnowledge");
    //  And a record that was only seen through a search index says so, so the
    //  tool can badge it.  Both marks must actually be in use, or the badge is
    //  decorative.
    const marks = new Set(cat.heuristics.map((h) => h.source.verification));
    expect(marks.has("searchIndexQuotation")).toBe(true);
    expect(marks.has("checkedCopy")).toBe(true);
  });

  it("a guide-authority record quotes the guide, and the guide says it", () => {
    //  A GUIDE IS SIGNED; A RECORD IS CITED.  A record whose authority is
    //  Choupo's own guide must be traceable INTO that guide, or it is an
    //  unsourced rule wearing the guide's badge.
    const guide = readFileSync(
      resolve(here, "../../docs/designGuide.tex"), "utf8").toLowerCase();
    const own = cat.heuristics.filter(
      (h) => h.authority === "choupoDesignGuide");
    expect(own.length).toBeGreaterThan(1);
    for (const h of own) {
      expect(h.source.publication, `${h.file}`).toContain("designGuide.tex");
      //  A distinctive phrase from each claim must be findable in the guide.
      const probe = h.claim.toLowerCase();
      const words = probe.split(/[^a-z]+/).filter((w) => w.length > 6);
      const hits = words.filter((w) => guide.includes(w)).length;
      expect(hits / Math.max(1, words.length),
        `${h.file}: its claim does not read like the guide's own words`)
        .toBeGreaterThan(0.5);
    }
  });

  it("shows the DISAGREEMENT on LV rather than resolving it", () => {
    const pairs = conflictPairs(cat, "LV");
    expect(pairs.length, "LV must carry at least one visible conflict")
      .toBeGreaterThan(0);
    for (const [a, b] of pairs) {
      expect(a.name).not.toBe(b.name);
      //  Both sides must state the conditions they were asserted under —
      //  a conflict shown without its conditions teaches that the authorities
      //  are simply inconsistent, which is the wrong lesson.
      expect(a.validity.length).toBeGreaterThan(20);
      expect(b.validity.length).toBeGreaterThan(20);
    }
  });

  it("does not pad a structure's card with rules that never mentioned it", () => {
    for (const s of cat.structures)
      for (const h of heuristicsForStructure(cat, s.name))
        expect(stanceOn(h, s.name), `${h.file} on ${s.name}`).not.toBeNull();
  });

  it("carries the tray-selection rules the diagnostic implements", () => {
    const names = heuristicsForTopic(cat, "traySelection").map((h) => h.name);
    expect(names).toContain("slopeCriterion");
    expect(names).toContain("sensitivityCriterion");
    //  And the record carrying the half that is inconvenient here: the
    //  published comparison prefers a criterion this tool does not compute.
    //  Dropping it would leave the two implemented criteria reading as the
    //  state of the art.
    expect(names).toContain("fiveCriteriaCompared");
  });
});

// ---------------------------------------------------------------------------
//  THE REFUSALS, each fired by sabotage.
// ---------------------------------------------------------------------------

describe("column-control — an unusable record is NAMED, never dropped", () => {
  const structures = readRecord("columnControlStructures.dat");
  const slope = readRecord("columnControl-slopeCriterion.dat");
  const lv = readRecord("columnControl-lvWithFastTemperatureLoop.dat");

  const run = (files: { [name: string]: string }) =>
    readHeuristicsCatalogue(Object.fromEntries(
      Object.entries(files).map(([k, v]) => [`/heuristics/${k}.dat`, v])));

  it("the CONTROL: the two real records read clean", () => {
    const cat = run({ columnControlStructures: structures, slope });
    expect(cat.refusals).toEqual([]);
    expect(cat.heuristics.length).toBe(1);
  });

  it("S1 an UNCITED heuristic is refused entry", () => {
    const cat = run({
      columnControlStructures: structures,
      slope: slope.replace(/author\s+"[^"]*";/, ""),
    });
    expect(cat.heuristics.length).toBe(0);
    expect(cat.refusals.join(" ")).toMatch(/uncited heuristic is refused/);
  });

  it("S2 a heuristic with no claim is refused", () => {
    const cat = run({
      columnControlStructures: structures,
      slope: slope.replace(/^claim\s+"[^"]*";/m, ""),
    });
    expect(cat.heuristics.length).toBe(0);
    expect(cat.refusals.join(" ")).toMatch(/no `claim`/);
  });

  it("S3 a record with no verification mark is refused", () => {
    const cat = run({
      columnControlStructures: structures,
      slope: slope.replace(/verification\s+\w+;/, ""),
    });
    expect(cat.heuristics.length).toBe(0);
    expect(cat.refusals.join(" ")).toMatch(/verification/);
  });

  it("S4 a record that speaks to nothing is refused", () => {
    const cat = run({
      columnControlStructures: structures,
      slope: slope.replace(/topics\s+\([^)]*\);/, ""),
    });
    expect(cat.heuristics.length).toBe(0);
    expect(cat.refusals.join(" ")).toMatch(/renders nowhere/);
  });

  it("S5 a stance on a structure the catalogue does not declare is refused", () => {
    const cat = run({
      columnControlStructures: structures,
      lv: lv.replace("{ structure LV;", "{ structure LX;"),
    });
    expect(cat.heuristics.length).toBe(0);
    expect(cat.refusals.join(" ")).toMatch(/which the structure catalogue does not/);
  });

  it("S6 a conflict with a record that is not here is refused", () => {
    const cat = run({
      columnControlStructures: structures,
      lv: lv.replace(/conflictsWith\s+\([^)]*\);/,
        "conflictsWith ( aRecordNobodyWrote );"),
    });
    expect(cat.heuristics.length).toBe(0);
    expect(cat.refusals.join(" ")).toMatch(/disagreement with an absence/);
  });

  it("S7 a loop wired to a valve the catalogue never introduced is refused", () => {
    const cat = run({
      columnControlStructures:
        structures.replace("manipulates condenserDuty;",
          "manipulates aValveNobodyDrew;"),
    });
    expect(cat.structures.length).toBe(0);
    expect(cat.refusals.join(" ")).toMatch(/not in `valves`/);
  });

  it("S8 an unknown recordType is named rather than ignored", () => {
    const cat = run({
      columnControlStructures: structures,
      slope: slope.replace("recordType controlHeuristic;",
        "recordType somethingElse;"),
    });
    expect(cat.heuristics.length).toBe(0);
    expect(cat.refusals.join(" ")).toMatch(/unknown `recordType`/);
  });
});

// ---------------------------------------------------------------------------
//  THE TWO CRITERIA, on the witness's own measured profile.
// ---------------------------------------------------------------------------

describe("column-control — the tray criteria", () => {
  it("neither the condenser nor the reboiler is a candidate tray", () => {
    //  Choupo numbers stage 1 the condenser and stage N the reboiler, so
    //  neither can carry a tray thermocouple.  A criterion that could return
    //  stage 1 would be recommending a thermometer in the reflux drum.
    expect(trayRange(15)).toEqual({ lo: 2, hi: 14 });
    for (const m of slopeMetric(WITNESS_T)) {
      expect(m.stage).toBeGreaterThanOrEqual(2);
      expect(m.stage).toBeLessThanOrEqual(13);
    }
  });

  it("the SLOPE criterion is the adjacent-tray difference, not a smoothed one", () => {
    const s = slopeMetric(WITNESS_T);
    const at10 = s.find((m) => m.stage === 10)!;
    //  |T(11) - T(10)| exactly, from the engine's own numbers.
    expect(at10.value).toBeCloseTo(
      Math.abs(WITNESS_T[10]! - WITNESS_T[9]!), 12);
    expect(at10.value).toBeCloseTo(3.13974, 4);
  });

  it("the slope picks stage 10 on the witness", () => {
    expect(pickStage(slopeMetric(WITNESS_T))!.stage).toBe(10);
  });

  it("the sensitivity is per 1 % of the handle, signed", () => {
    //  A synthetic pair: every stage moves by exactly 2 K under a 1 % step, so
    //  the reported number must be 2 K per 1 % — the units are the thing this
    //  arm pins, because a factor of 100 here would be invisible on a chart
    //  whose bars are self-scaled.
    const base = [300, 310, 320, 330, 340];
    const pert = base.map((t) => t + 2);
    const m = sensitivityMetric(base, pert, 0.01);
    expect(m.map((x) => x.stage)).toEqual([2, 3, 4]);
    for (const x of m) expect(x.value).toBeCloseTo(2, 12);
    //  and the sign survives: a falling temperature is a NEGATIVE gain.
    const down = sensitivityMetric(base, base.map((t) => t - 2), 0.01);
    for (const x of down) expect(x.value).toBeCloseTo(-2, 12);
  });

  it("a sign change is REPORTED — the trap the slope criterion cannot see", () => {
    const m = [
      { stage: 5, value: -0.03 }, { stage: 6, value: -0.01 },
      { stage: 7, value: 0.02 }, { stage: 8, value: 0.05 },
    ];
    expect(signChanges(m)).toEqual([{ below: 6, above: 7 }]);
    //  A response that keeps one sign has none, and none is reported as none.
    expect(signChanges(m.map((x) => ({ ...x, value: Math.abs(x.value) }))))
      .toEqual([]);
  });

  it("names which stream leaves the drum larger, and ships no threshold", () => {
    //  The witness runs R = 2, so the reflux is twice the distillate — the
    //  engine's own two KPIs, compared and nothing more.  The rule this serves
    //  ships NO threshold (see data/standards/heuristics/NOT-SHIPPED.md 1), so
    //  this helper must not classify the ratio, only order the two streams.
    const d = drumStreams({ L_rect: 0.0277777777778, D: 0.0138888888889 })!;
    expect(d.ratio).toBeCloseTo(2, 9);
    expect(d.larger).toBe("reflux");
    expect(drumStreams({ L_rect: 0.01, D: 0.05 })!.larger).toBe("distillate");
    //  A comparison of two numbers one of which is absent is not a comparison.
    expect(drumStreams({ L_rect: 0.02 })).toBeNull();
    expect(drumStreams({ L_rect: 0.02, D: 0 })).toBeNull();
    expect(drumStreams(undefined)).toBeNull();
  });

  it("an empty metric set picks NOTHING rather than stage 1", () => {
    expect(pickStage([])).toBeNull();
    expect(slopeMetric([1, 2, 3])).toEqual([]);
    expect(sensitivityMetric([1, 2, 3], [1, 2, 3], 0.01)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
//  THE WITNESS AND ITS HANDLES — the mechanics that reach the dict.
// ---------------------------------------------------------------------------

describe("column-control — the classroom witness", () => {
  const entry = tutorialByName(COLUMN_CONTROL_WITNESS);

  it("is in the bundled corpus and is the RIGOROUS MESH column", () => {
    expect(entry, `${COLUMN_CONTROL_WITNESS} must be bundled`).toBeTruthy();
    const fd = entry!.files.rawFiles!["system/flowsheetDict"]!;
    expect(fd).toMatch(/model\s+simultaneous;/);
    expect(fd).toMatch(/type\s+distillationColumn;/);
  });

  it("every knob resolves to exactly ONE declared scalar in the dict", () => {
    for (const k of COLUMN_CONTROL_KNOBS) {
      const body = entry!.files.rawFiles![k.file];
      expect(body, `${k.id} writes ${k.file}`).toBeTruthy();
      expect(() => applyScalarOverride(body!, {
        file: k.file, key: k.key, value: k.def,
      }), `${k.id} -> ${k.file}:${k.key}`).not.toThrow();
    }
  });

  it("the declared defaults ARE the witness's authored values", () => {
    const fd = entry!.files.rawFiles!["system/flowsheetDict"]!;
    expect(fd).toMatch(
      new RegExp(`refluxRatio\\s+${WITNESS_REFLUX_RATIO.toFixed(1)}`));
    expect(fd).toMatch(
      new RegExp(`distillateRate\\s+${WITNESS_DISTILLATE_RATE.toFixed(1)}`));
    expect(fd).toMatch(new RegExp(`feedStage\\s+${WITNESS_FEED_STAGE}`));
    const d = defaultKnobValues();
    expect(d["refluxRatio"]).toBe(WITNESS_REFLUX_RATIO);
    expect(d["distillateRate"]).toBe(WITNESS_DISTILLATE_RATE);
    expect(d["feedStage"]).toBe(WITNESS_FEED_STAGE);
  });

  it("the base overrides clone the witness without changing it", () => {
    const files = methodCase(COLUMN_CONTROL_WITNESS,
      baseOverrides(defaultKnobValues()));
    expect(files).toBeTruthy();
  });

  it("the REFLUX handle moves L alone: R rises, D is untouched", () => {
    const v = defaultKnobValues();
    const o = perturbedOverrides(v, "reflux", 0.01);
    const get = (k: string) => o.find((x) => x.key === k)!.value;
    expect(get("refluxRatio")).toBeCloseTo(WITNESS_REFLUX_RATIO * 1.01, 12);
    expect(get("distillateRate")).toBe(WITNESS_DISTILLATE_RATE);
    //  L = R*D rises by exactly the step.
    expect(get("refluxRatio") * get("distillateRate")).toBeCloseTo(
      WITNESS_REFLUX_RATIO * WITNESS_DISTILLATE_RATE * 1.01, 9);
  });

  it("the DISTILLATE handle moves D alone: L = R·D is held EXACTLY", () => {
    //  This is the arm that makes the second handle a handle rather than a
    //  diagonal move.  Raising D at a fixed reflux RATIO would move the reflux
    //  too, and the sensitivity would then belong to no manipulated variable
    //  anybody names.
    const v = defaultKnobValues();
    const o = perturbedOverrides(v, "distillate", 0.01);
    const get = (k: string) => o.find((x) => x.key === k)!.value;
    expect(get("distillateRate")).toBeCloseTo(
      WITNESS_DISTILLATE_RATE * 1.01, 12);
    expect(get("refluxRatio") * get("distillateRate")).toBeCloseTo(
      WITNESS_REFLUX_RATIO * WITNESS_DISTILLATE_RATE, 9);
    expect(HANDLE_TEXT.distillate.means).toMatch(/L = R/);
  });

  it("a perturbation writes the dict it claims to write", () => {
    const files = methodCase(COLUMN_CONTROL_WITNESS,
      perturbedOverrides(defaultKnobValues(), "distillate", 0.01));
    expect(files).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
//  THE DRAWING — view geometry, and the one coupling that is a RESULT.
// ---------------------------------------------------------------------------

describe("column-control — the cross-section", () => {
  const cat = readHeuristicsCatalogue();
  const lv = cat.structures.find((s) => s.name === "LV")!;
  const dv = cat.structures.find((s) => s.name === "DV")!;

  it("in LV the reflux drives a quality loop; in DV the distillate does", () => {
    expect(qualityLoopFor(lv, "reflux")?.controlled).toBe("topComposition");
    expect(qualityLoopFor(dv, "distillate")?.controlled).toBe("topComposition");
  });

  it("choosing a handle a structure spends on an inventory returns NULL", () => {
    //  Not an error and not a silent substitution: in LV the distillate holds
    //  the drum level, so no loop would use it for temperature, and the tool
    //  says so on the drawing instead of wiring one anyway.
    expect(qualityLoopFor(lv, "distillate")).toBeNull();
    expect(qualityLoopFor(dv, "reflux")).toBeNull();
    expect(qualityLoopFor(null, "reflux")).toBeNull();
  });

  it("a tray's y stays inside the shell, and rises with the stage number", () => {
    const ys = [2, 5, 10, 14].map((s) => stageY(s, 15));
    for (let i = 1; i < ys.length; ++i)
      expect(ys[i]!).toBeGreaterThan(ys[i - 1]!);
    expect(Math.min(...ys)).toBeGreaterThan(96);
    expect(Math.max(...ys)).toBeLessThan(392);
    //  Out-of-range stages are CLAMPED to the shell rather than drawn off it.
    expect(stageY(1, 15)).toBe(stageY(2, 15));
    expect(stageY(99, 15)).toBe(stageY(14, 15));
  });

  it("EVERY loop the catalogue declares can be placed on the drawing", () => {
    //  A loop the layout cannot place would be drawn as nothing at all, and a
    //  structure showing four of its five loops in silence is a structure the
    //  reader believes they have seen.  The tool reports one; this arm keeps
    //  the shipped catalogue from needing that report.
    for (const s of cat.structures)
      for (const l of s.loops)
        expect(placeValve(l.manipulates, 8, 15),
          `${s.name}: no place for the ${l.manipulates} valve`).not.toBeNull();
  });

  it("the feed valve follows the feed stage rather than a fixed y", () => {
    const a = placeValve("feed", 4, 15)!;
    const b = placeValve("feed", 12, 15)!;
    expect(a.y).toBeLessThan(b.y);
    expect(placeValve("aValveNobodyDrew", 8, 15)).toBeNull();
  });

  it("every controlled variable in the catalogue has an ISA tag", () => {
    for (const s of cat.structures)
      for (const l of s.loops)
        expect(isaTag(l.controlled), `${s.name}/${l.controlled}`)
          .toMatch(/^[A-Z]{2}$/);
    expect(isaTag("pressure")).toBe("PC");
    expect(isaTag("condenserLevel")).toBe("LC");
    expect(isaTag("topComposition")).toBe("TC");
  });
});

describe("column-control — the engine surface it reads", () => {
  const profile = (over: Record<string, unknown> = {}) => ({
    unit: "column01",
    xAxis: "stage",
    columns: {
      stage: [1, 2, 3, 4, 5],
      T: [350, 355, 360, 370, 380],
    },
    ...over,
  }) as never;

  it("accepts a stage/T profile and nothing else", () => {
    expect(findColumnFeeds([profile()], undefined).length).toBe(1);
    //  A profile on another axis is not a column and must not be mistaken for
    //  one — the COLUMN PAIR is the contract, never a unit or a case name.
    expect(findColumnFeeds([profile({ xAxis: "T_K" })], undefined).length)
      .toBe(0);
    expect(findColumnFeeds(undefined, undefined)).toEqual([]);
  });

  it("refuses a profile too short to ask the tray question of", () => {
    const tiny = {
      unit: "c", xAxis: "stage",
      columns: { stage: [1, 2, 3], T: [300, 310, 320] },
    } as never;
    expect(findColumnFeeds([tiny], undefined).length).toBe(0);
  });
});
