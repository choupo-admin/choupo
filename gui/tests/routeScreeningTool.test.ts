/*---------------------------------------------------------------------------*\
  The route-screening EduTool (C24), held to its witness and its data.

  The page does arithmetic on a TRANSCRIPTION -- molar masses and
  stoichiometric coefficients -- so the transcription is held here to the
  records it was copied from: every MW to its catalogue component, every
  coefficient to the witness's constant/reactions.  The numbers the lesson
  QUOTES are held to the witness's golden, and the knobs to the slots the
  witness declares.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  SCREEN_LIMITS, SCREEN_SECTIONS,
} from "../src/ui/methods/routeScreeningLesson.js";
import {
  MW, PRICE_PLACEHOLDERS, ROUTES, SCREEN_WITNESS, atomEconomy, grossMargin,
  screenOverrides,
} from "../src/ui/methods/RouteScreeningTool.js";
import { applyDictOverride } from "../src/case/methodRun.js";
import { texParses } from "../src/ui/methods/lessonTex.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const tree = (rel: string): string =>
  readFileSync(new URL(`../../${rel}`, import.meta.url), "utf-8");
const read = (rel: string): string => tree(`tutorials/${SCREEN_WITNESS}/${rel}`);

const EXPECTED = read("expected");
const REACTIONS = read("constant/reactions");

function golden(unit: string, key: string): number {
  const m = EXPECTED.match(new RegExp(`^kpi\\s+${unit}\\s+${key}\\s+(\\S+)`, "m"));
  if (!m) throw new Error(`no golden row kpi ${unit} ${key}`);
  return Number(m[1]);
}

const prose = (s: string): string => s.replace(/\s+/g, " ").trim();
const body = (id: string): string =>
  prose(SCREEN_SECTIONS.find((s) => s.id === id)!.body);

describe("the transcription the arithmetic runs on", () => {
  it("every molar mass is the catalogue record's", () => {
    for (const [c, mw] of Object.entries(MW)) {
      const rec = tree(`data/standards/components/${c}.dat`);
      const m = rec.match(/^MW\s+([0-9.]+)/m);
      expect(m, `${c}.dat declares no MW`).not.toBeNull();
      expect(mw, c).toBe(Number(m![1]));
    }
  });

  it("every route's coefficients are the witness's reaction", () => {
    for (const r of ROUTES) {
      const i = REACTIONS.indexOf(`\nroute${r.key}\n`);
      expect(i, `route${r.key}`).toBeGreaterThan(0);
      const block = REACTIONS.slice(i, REACTIONS.indexOf("\n}", i));
      const declared: Record<string, number> = {};
      for (const m of block.matchAll(/component\s+(\w+);\s+nu\s+(-?[0-9.]+);/g))
        declared[m[1]!] = Number(m[2]);
      expect(declared, `route${r.key}`).toEqual(r.nu);
    }
  });

  it("every route balances its atoms", () => {
    const atoms: Record<string, [number, number, number]> = {
      CO: [1, 0, 1], H2: [0, 2, 0], methanol: [1, 4, 1], CO2: [1, 0, 2],
      water: [0, 2, 1], CH4: [1, 4, 0], O2: [0, 0, 2],
    };
    for (const r of ROUTES) {
      const net = [0, 0, 0];
      for (const [c, nu] of Object.entries(r.nu))
        atoms[c]!.forEach((a, k) => { net[k]! += nu * a; });
      expect(net, r.key).toEqual([0, 0, 0]);
    }
  });
});

describe("the filters", () => {
  it("atom economy: A and C are 100 %, B loses about a third to water", () => {
    const ae = ROUTES.map(atomEconomy);
    expect(ae[0]).toBeCloseTo(1, 6);
    expect(ae[1]).toBeCloseTo(0.640, 3);
    expect(ae[2]).toBeCloseTo(1, 3);
  });

  it("with the placeholders, C wins on paper and B loses money", () => {
    const gm = ROUTES.map((r) => grossMargin(r, PRICE_PLACEHOLDERS));
    expect(gm[2]!).toBeGreaterThan(gm[0]!);
    expect(gm[1]!).toBeLessThan(0);
  });

  it("the lesson's hydrogen arithmetic is the table's", () => {
    const perKg = (r: number) =>
      (-(ROUTES[r]!.nu["H2"] ?? 0) * MW["H2"]!) / MW["methanol"]!;
    expect(perKg(1).toFixed(2)).toBe("0.19");
    expect(perKg(0).toFixed(2)).toBe("0.13");
    expect(body("margin") + prose(SCREEN_SECTIONS[1]!.check!.a)).toContain("0.19 kg");
  });

  it("quotes the equilibrium conversions and heats the engine computes", () => {
    const eq = body("equilibrium");
    expect(eq).toContain(`${Math.round(100 * golden("equilA", "conversion_routeA"))} %`);
    expect(eq).toContain(`${Math.round(100 * golden("equilB", "conversion_routeB"))} %`);
    expect(golden("equilC", "conversion_routeC")).toBeGreaterThan(0.9999);
    const heat = body("heat");
    expect(heat).toContain(`${Math.round(-golden("stoichA", "dHrxn_kJ_per_mol"))} kJ`);
    expect(heat).toContain(`${Math.round(-golden("stoichB", "dHrxn_kJ_per_mol"))} kJ`);
    expect(heat).toContain(`${Math.round(-golden("stoichC", "dHrxn_kJ_per_mol") / 2)} kJ`);
  });

  it("the Gibbs reactor leaves route C essentially no methanol", () => {
    expect(golden("gibbsC", "y_methanol")).toBeLessThan(1e-8);
    expect(golden("gibbsC", "y_CO2")).toBeGreaterThan(0.1);
    expect(body("selectivity")).toContain("$10^{-10}$");
  });
});

describe("the page", () => {
  it("is registered, live, under reaction engineering", () => {
    const t = METHOD_TOOLS.find((m) => m.id === "route-screening");
    expect(t?.status).toBe("live");
    expect(t?.theory).toBeTruthy();
  });

  it("parses every piece of mathematics it carries", () => {
    const tex: string[] = ROUTES.map((r) => r.tex);
    for (const s of SCREEN_SECTIONS) {
      s.body.split("$").forEach((p, i) => { if (i % 2 === 1) tex.push(p); });
      if (s.eq) tex.push(s.eq);
      tex.push(...(s.where ?? []).map((g) => g.sym));
    }
    for (const t of tex) expect(texParses(t), `does not parse: ${t}`).toBe(true);
  });

  it("says the prices are placeholders, and declares none in the case", () => {
    expect(SCREEN_LIMITS.find((l) => l.id === "prices")).toBeTruthy();
    expect(read("system/flowsheetDict")).toMatch(/NO PRICE IS\s+DECLARED HERE/);
  });

  it("every knob lands on a slot the witness declares", () => {
    const files: Record<string, string> = {
      "system/flowsheetDict": read("system/flowsheetDict"),
      "0/feedSyngas": read("0/feedSyngas"),
      "0/feedCO2": read("0/feedCO2"),
      "0/feedMethane": read("0/feedMethane"),
    };
    for (const o of screenOverrides(575, 100))
      expect(() => applyDictOverride(files[o.file]!, o)).not.toThrow();
  });
});
