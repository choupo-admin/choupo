/*---------------------------------------------------------------------------*\
  THE TRAYS AT WORK (DEV.md 4c C337) -- the column datasheet's stage-by-stage
  half: elevation + small multiples on one stage axis, the tray plan, the
  selected-tray panel, the sortable stage table, the in-sample notice and the
  list of what the engine does not publish.

  THE FIXTURES ARE REAL ENGINE OUTPUT (gui/tests/fixtures/c337_*.json, each
  naming its case and the commit it was run at): the unit's KPI and profile
  blocks of the result JSON, unedited, and the design/ sheets the run wrote.
  The UnitSpec is NOT copied: each test parses the case's own flowsheetDict
  from the tree with the GUI's dict parser, so a declaration that changes in
  the case reaches these tests the next time they run.
\*---------------------------------------------------------------------------*/
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parse } from "../src/dict/parser.js";
import { toJson } from "../src/dict/json.js";
import type { UnitSpec } from "../src/case/types.js";
import type { UnitProfile } from "../src/adapters/SolverAdapter.js";
import {
  holePatch, openAreaOfPitch, pitchForOpenArea, segmentAngle, trayPlan,
} from "../src/case/trayGeometry.js";
import {
  columnStageModel, columnStageSection, declaredSI, IN_SAMPLE_STATEMENTS,
  stageFigureSvg, sheetFormat, trayPlanSvg,
} from "../src/case/columnStageSheet.js";
import { columnDatasheetHtml, columnProfileOf } from "../src/ui/ColumnDatasheet.js";
import { unitDesignSheets } from "../src/case/designSheet.js";
import { DEFAULT_PREFS } from "../src/state/displayUnits.js";

const repo = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf-8");

interface Fixture {
  case: string; commit: string; unit: string;
  kpis: { [k: string]: number };
  profile: UnitProfile;
  designFiles: { [k: string]: string };
}
const fixture = (name: string): Fixture =>
  JSON.parse(readFileSync(new URL(`./fixtures/c337_${name}.json`, import.meta.url), "utf-8"));

function unitOf(fx: Fixture): UnitSpec {
  const json = toJson(parse(repo(`${fx.case}/system/flowsheetDict`))) as { units: UnitSpec[] };
  const u = json.units.find((x) => x.name === fx.unit);
  if (!u) throw new Error(`no unit ${fx.unit} in ${fx.case}`);
  return u;
}

const C09 = fixture("column09_tray_hydraulics");
const C14 = fixture("column14_klemola_c4_splitter");
const TE6 = fixture("trayEfficiency06_syedaChuang_yanagi14");
const PK3 = fixture("packing03_schulz_delft_0p10bar");

const sheetOf = (fx: Fixture, prefs = DEFAULT_PREFS) =>
  columnDatasheetHtml(unitOf(fx), fx.kpis, fx.designFiles, prefs, fx.profile);

/*  ---- geometry, pure ----------------------------------------------------*/
describe("tray geometry from the declared fractions", () => {
  it("the downcomer chord encloses exactly the declared area fraction", () => {
    for (const f of [0.05, 0.08, 0.12, 0.1238, 0.2]) {
      const th = segmentAngle(f);
      expect((th - Math.sin(th)) / (2 * Math.PI)).toBeCloseTo(f, 10);
      const p = trayPlan(1.2, f);
      expect(p.A_d / p.A_T).toBeCloseTo(f, 12);
      //  the segment area from the chord, independently: R^2 acos(c/R) - c sqrt(R^2 - c^2)
      const R = 0.6, c = p.chordOffset;
      const seg = R * R * Math.acos(c / R) - c * Math.sqrt(R * R - c * c);
      expect(seg / p.A_T).toBeCloseTo(f, 9);
      expect(p.A_a).toBeCloseTo(p.A_T * (1 - 2 * f), 12);  // TrayHydraulics.cpp:321
    }
  });
  it("column09's declared 0.12 implies a chord of 0.764 D, and its 0.77 D weir 'goes with' it", () => {
    const p = trayPlan(1.22206, 0.12, 0.77, 0.10);
    expect(p.chordFraction).toBeCloseTo(0.7642, 4);
    expect(p.weirFraction).toBe(0.77);
    expect(p.A_h).toBeCloseTo(0.10 * p.A_a, 12);
  });
  it("the hole patch's counted open area is the declared one within 2 %", () => {
    for (const [d, phi] of [[0.005, 0.10], [0.0127, 0.1387], [0.003, 0.06], [0.0127, 0.15]] as const) {
      const pitch = pitchForOpenArea(d, phi);
      expect(openAreaOfPitch(d, pitch)).toBeCloseTo(phi, 12);
      const hp = holePatch(d, pitch, 8);
      expect(Math.abs(hp.countedOpenArea / phi - 1)).toBeLessThan(0.02);
      //  every hole lies wholly inside the window
      for (const [x, y] of hp.holes) {
        expect(x - d / 2).toBeGreaterThanOrEqual(-1e-12);
        expect(x + d / 2).toBeLessThanOrEqual(hp.width + 1e-12);
        expect(y - d / 2).toBeGreaterThanOrEqual(-1e-12);
        expect(y + d / 2).toBeLessThanOrEqual(hp.height + 1e-12);
      }
    }
  });
  it("refuses a geometry that has no tray", () => {
    expect(() => trayPlan(1, 0.5)).toThrow();
    expect(() => holePatch(0.01, 0.005)).toThrow();
  });
  it("reads a declared length through the dict's unit table", () => {
    expect(declaredSI("1.22 m")).toBeCloseTo(1.22, 12);
    expect(declaredSI("50 mm")).toBeCloseTo(0.05, 12);
    expect(declaredSI(0.61)).toBe(0.61);
    expect(declaredSI("18.5 degC")).toBeUndefined();   // affine: not a length
  });
});

/*  ---- the model, from the real runs --------------------------------------*/
describe("the stage model reads what the engine published", () => {
  it("column09: 14 trays enumerated by the hydraulics, the reboiler not a tray, worst = KPI floodStage", () => {
    const m = columnStageModel(unitOf(C09), C09.kpis, C09.profile)!;
    expect(m.kind).toBe("trays");
    expect(m.rows).toHaveLength(15);
    expect(m.rows.filter((r) => r.isTray)).toHaveLength(C09.kpis["nTrays"]!);
    expect(m.rows[14]!.isTray).toBe(false);
    expect(m.worst).toBe(C09.kpis["floodStage"]);
    const w = m.rows.find((r) => r.stage === m.worst)!;
    expect(w.flood).toBe(C09.kpis["floodApproach_max"]);       // the same number, not a recomputation
    expect(m.feeds).toEqual([{ stage: 8, name: "feed", who: "declared" }]);
    //  keys not declared: picked from the profile and the sheet says so
    expect(m.keysFrom).toBe("profile");
    expect(m.lk).toBe("benzene"); expect(m.hk).toBe("toluene");
    //  section flows straight from the KPIs, split at the feed
    expect(m.rows[0]!.V).toBe(C09.kpis["V_rect"]);
    expect(m.rows[7]!.V).toBe(C09.kpis["V_strip"]);
    expect(m.rows[7]!.flowFromSection).toBe(true);
  });
  it("trayEfficiency06: per-stage V and computed E_MV; light key declared", () => {
    const m = columnStageModel(unitOf(TE6), TE6.kpis, TE6.profile)!;
    expect(m.efficiencyModel).toBe("SyedaChuang");
    expect(m.keysFrom).toBe("declared");
    expect(m.lk).toBe("cyclohexane");
    expect(m.rows[0]!.V! * 3600).toBeCloseTo(TE6.profile.columns["V_kmol_h"]![0]!, 9);
    expect(m.rows[0]!.E).toBe(TE6.profile.columns["E_MV"]![0]);
    expect(m.missing.join(" ")).toMatch(/liquid molar flow of each stage/);
  });
  it("column14: no hydraulics -- no stage is called a tray, and the absence is listed", () => {
    const m = columnStageModel(unitOf(C14), C14.kpis, C14.profile)!;
    expect(m.hasHydraulics).toBe(false);
    expect(m.rows.every((r) => r.isTray === undefined)).toBe(true);
    expect(m.worst).toBeUndefined();
    expect(m.declaredMurphree).toBeCloseTo(1.191, 12);
    expect(m.missing.join(" ")).toMatch(/declared no `hydraulics \{\}` block/);
  });
  it("packing03: the bed profile, z from the bottom", () => {
    const m = columnStageModel(unitOf(PK3), PK3.kpis, PK3.profile)!;
    expect(m.kind).toBe("packed");
    expect(m.rows).toHaveLength(101);
    expect(m.rows[0]!.z).toBe(0);
    expect(m.rows[100]!.HETP).toBe(PK3.profile.columns["HETP"]![100]);
    expect(m.lk).toBe("pXylene");
    expect(m.missing.join(" ")).toMatch(/local approach to flood/);
  });
  it("no profile, no model", () => {
    expect(columnStageModel(unitOf(C09), C09.kpis, undefined)).toBeNull();
    expect(columnProfileOf([C09.profile], "nope")).toBeUndefined();
    expect(columnProfileOf([C09.profile], "column09")).toBe(C09.profile);
  });
});

/*  ---- the rendered sheet ------------------------------------------------*/
describe("the rendered sheet (trayed column, two section diameters)", () => {
  const html = sheetOf(C09);
  it("draws the elevation, the plan, the window bars, the table and the script", () => {
    expect(html).toContain(`id="cs-root"`);
    expect(html).toContain("column elevation and per-stage profiles");
    expect(html).toContain("tray plan view");
    expect(html).toContain("◀ worst: tray 7");
    expect(html).toMatch(/80 % of flood/);
    //  the selected panel opens on the worst tray, the others hidden
    expect(html).toMatch(/<div class="cs-stage" data-stage="7">/);
    expect(html).toMatch(/<div class="cs-stage" data-stage="6" hidden>/);
    //  one click target per stage
    expect(html.match(/class="cs-hit"/g)).toHaveLength(15);
    expect(html).toContain("cs-sortable");
    expect(html).toContain("<script>");
    //  the two sections (KPIs diameter_rectifying / _stripping) drawn as such
    expect(html).toContain(`class="cs-ghost"`);
    expect(html).toMatch(/stripping section needs only ⌀ 0\.969 m/);
    //  the hole patch prints its own counted open area and calls itself a drawing aid
    expect(html).toMatch(/DRAWING AID, NOT A DESIGN/);
    //  the weir and the chord the area implies are compared, and agree here
    expect(html).toMatch(/the same chord to within 1 %/);
  });
  it("lists every hydraulic quantity the operating window would need", () => {
    for (const q of ["uVapour", "uFlood", "u_hMin", "h_bMax", "psi_mean", "x_D_LK"])
      expect(html).toContain(q);
    expect(html).toMatch(/Why bars and not an operating window/);
  });
  it("draws the condenser and reboiler with the run's duties, in the units menu", () => {
    const k = C09.kpis;
    const def = sheetOf(C09);
    expect(def).toContain(`${Number(k["Q_reboiler_kW"]!.toPrecision(3))} kW`);
    const mw = sheetOf(C09, { ...DEFAULT_PREFS, duty: "MW", temperature: "degC", pressure: "kPa", sigFigs: 4 });
    expect(mw).toContain(`${Number((k["Q_reboiler_kW"]! / 1000).toPrecision(4))} MW`);
    expect(mw).toContain("T (°C)");
    expect(mw).toContain("ΔP (kPa)");
  });
  it("the table's sort orders are SortableTable's own (numeric, missing last both ways)", () => {
    const m = /data-orders='([^']+)'/.exec(html)!;
    const orders = JSON.parse(m[1]!) as { [k: string]: { asc: number[]; desc: number[] } };
    const fl = C09.profile.columns["floodApproach"]!;
    //  the reboiler row has no flood: last in BOTH directions
    expect(orders["flood"]!.asc.at(-1)).toBe(14);
    expect(orders["flood"]!.desc.at(-1)).toBe(14);
    expect(fl[orders["flood"]!.desc[0]!]).toBe(C09.kpis["floodApproach_max"]);
    expect(orders["stage"]!.asc).toEqual([...Array(15).keys()]);
  });
  it("the tray stack is to scale when the tray spacing and the diameter allow it", () => {
    const u = unitOf(C09);
    const m = columnStageModel(u, C09.kpis, C09.profile)!;
    const shell = unitDesignSheets(C09.designFiles, "column09").sheets.find((s) => s.item === "shell") ?? null;
    const fig = stageFigureSvg({ model: m, unit: u, kpis: C09.kpis, shell, fmt: sheetFormat(), selected: 7 });
    expect(fig.toScale).toBe(true);
    expect(fig.notes[0]).toMatch(/TO SCALE/);
  });
});

describe("the rendered sheet (computed efficiency, in-sample)", () => {
  const html = sheetOf(TE6);
  it("prints the model header's in-sample statement, cited by file:line", () => {
    expect(html).toContain("In-sample.");
    expect(html).toContain("TrayEfficiency.H:136-139");
    expect(html).toContain("Tray efficiency COMPUTED by <b>SyedaChuang</b>");
    expect(html).toContain("Murphree E_MV");
  });
  it("draws the declared hole pitch and says why its open area differs from A_h/A_a", () => {
    const u = unitOf(TE6);
    const plan = trayPlanSvg(u, TE6.kpis, null, sheetFormat())!;
    const text = plan.notes.join(" ");
    expect(text).toMatch(/declared `holePitch`/);
    expect(text).toMatch(/unperforated/);
    //  the Yanagi tray: A_d/A_T 0.1238 implies 0.771 D, Table I's weir is 0.7833 D
    expect(text).toMatch(/does not require them to agree/);
  });
  it("opens with no sizing pass: the profile alone is something to show", () => {
    expect(Object.keys(TE6.designFiles)).toHaveLength(0);
    expect(html).toContain("The sizing pass did not run");
    expect(html).toContain(`id="cs-root"`);
  });
});

describe("the rendered sheet (no hydraulics: column14)", () => {
  const html = sheetOf(C14);
  it("draws stages, not trays, and no flood panel", () => {
    expect(html).toContain(`id="cs-root"`);
    expect(html).not.toContain("Approach to flood");
    expect(html).toContain("Murphree efficiency DECLARED by the case: E_MV = 1.19");
    expect(html.match(/class="cs-hit"/g)).toHaveLength(75);
    expect(html).not.toContain("tray plan view");
  });
});

describe("the rendered sheet (packed column)", () => {
  const html = sheetOf(PK3);
  it("draws the bed to scale, its HETP profile and opens on the largest local HETP", () => {
    expect(html).toContain("Packed column");
    expect(html).toContain("RATING RESULT  ·  the packed-bed march");
    expect(html).toContain("The bed is drawn TO SCALE");
    expect(html).toContain("HETP (local)");
    expect(html).toContain("It opens on the largest local HETP");
    expect(html).toMatch(/Distributors, collectors and the bed support are NOT drawn/);
    expect(html.match(/class="cs-hit"/g)).toHaveLength(101);
    const hetp = PK3.profile.columns["HETP"]!;
    const iMax = hetp.indexOf(Math.max(...hetp));
    expect(html).toContain(`<div class="cs-stage" data-stage="${iMax + 1}">`);
  });
});

describe("the theme and the print", () => {
  it("the page defines its tokens for light, dark and print", () => {
    const html = sheetOf(C09);
    expect(html).toMatch(/@media \(prefers-color-scheme: dark\)\{:root:not\(\[data-theme="light"\]\)/);
    expect(html).toMatch(/:root\[data-theme="dark"\]/);
    expect(html).toMatch(/@media print/);
  });
});

/*  ---- the quotations are the header's own words ---------------------------*/
describe("in-sample statements are read back from the engine header", () => {
  for (const [model, q] of Object.entries(IN_SAMPLE_STATEMENTS)) {
    it(`${model}: ${q.cite}`, () => {
      const m = /^(.+):(\d+)-(\d+)$/.exec(q.cite)!;
      const lines = repo(m[1]!).split("\n").slice(Number(m[2]) - 1, Number(m[3]));
      const norm = (s: string) => s.replace(/\s+/g, " ").trim();
      expect(norm(lines.join(" "))).toContain(norm(q.text));
    });
  }
  it("every case of section() returns null without a profile", () => {
    expect(columnStageSection(unitOf(C09), C09.kpis, undefined, null)).toBeNull();
  });
});
