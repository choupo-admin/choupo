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

/*---------------------------------------------------------------------------*\
  whyDidItNotDry -- the dryer redesign of C508 (page A "Why did it not dry?",
  the cards C4, C5, C7 of the drying page, the bill of tests C10 and the
  reference drawer C12), held to what the engine's own goldens say.

  The verdict function is PURE over engine numbers; the tests feed it the
  numbers of the witnesses' `expected` files (the committed goldens, parsed
  here), so a verdict that disagrees with the engine's own announced state
  fails by name.  The engine is not run here (the in-browser run needs a
  browser); every override is proved to RESOLVE against the bundled text, and
  the cited engine lines are held to the words the page says they hold.
\*---------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";

import { REPO } from "./witnessOutputs.js";
import { applyDictOverride } from "../src/case/methodRun.js";
import { tutorialByName } from "../src/cases/tutorials.js";
import {
  VERDICT_CASES, VERDICT_TOLERANCE, W_EVAP_STARVED, W_SOLID_RICH, W_SOLID_STARVED,
  W_SPRAY_BASE, W_SPRAY_COARSE, W_TRAY, authoredFlow, declaredNumber, dryFromWet,
  dryerVerdict, scaledFlowOverrides, shareRemoved, timeToReach, waterPerTonneProduct,
  wetFromDry, type DryerFacts,
} from "../src/ui/methods/dryingBalance.js";
import {
  AIR_KNOB, AIR_SWEEP, HUMID_DAYS, HUMID_END_TIME, SPEC_KNOB, WhyDidItNotDryTool,
} from "../src/ui/methods/WhyDidItNotDryTool.js";
import {
  CHAMBER_HEIGHTS, COLLAPSE_LOADINGS, PHI_STEPS, WHEEL_SPEEDS, levelAtPhi, sprayOverrides,
} from "../src/ui/methods/DryingCards.js";
import { TRAY_DRY_SOLID_KG, DryingCurveTool, DRYING_KNOBS, knobOverrides, defaultKnobValues }
  from "../src/ui/methods/DryingCurveTool.js";
import { DryerSelectionTool } from "../src/ui/methods/DryerSelectionTool.js";
import { decidedRows, measuredRows } from "../src/ui/methods/DryerTestsCard.js";
import { WHY_QUIZ, WHY_STEPS } from "../src/ui/methods/whyDidItNotDryLesson.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";

const read = (rel: string): string => readFileSync(join(REPO, rel), "utf-8");

/** The kpi rows of a case's golden `expected`: { unit: { key: value } }. */
function golden(caseDir: string): { [unit: string]: { [key: string]: number } } {
  const out: { [unit: string]: { [key: string]: number } } = {};
  for (const line of read(`${caseDir}/expected`).split("\n")) {
    const m = /^kpi\s+(\S+)\s+(\S+)\s+(\S+)/.exec(line);
    if (!m) continue;
    (out[m[1]!] ??= {})[m[2]!] = Number(m[3]);
  }
  return out;
}

const D = "tutorials/steady/drying";
function factsFrom(caseDir: string, unit: string): DryerFacts {
  const b = golden(caseDir)[unit]!;
  const get = (k: string): number | null => (k in b ? b[k]! : null);
  return {
    Xinitial: get("X_initial"), Xfinal: get("X_final"), Xeq: get("X_equilibrium"),
    exhaustAw: get("exhaust_humidity"), Tout: get("T_out"), Twb: get("T_wetbulb"),
    residence: get("residenceTime"),
  };
}

describe("the moisture bases are identities, and the ratios are ratios", () => {
  it("w = X/(1+X) and X = w/(1-w) invert each other", () => {
    for (const X of [0.001, 0.1, 1, 1.5, 12])
      expect(dryFromWet(wetFromDry(X))).toBeCloseTo(X, 12);
    expect(wetFromDry(1)).toBe(0.5);
    expect(dryFromWet(1)).toBe(Infinity);
  });
  it("fifty to ten percent wet removes almost nine tenths; ten to five about half", () => {
    expect(shareRemoved(dryFromWet(0.5), dryFromWet(0.1))).toBeGreaterThan(0.88);
    expect(shareRemoved(dryFromWet(0.5), dryFromWet(0.1))).toBeLessThan(0.9);
    expect(shareRemoved(dryFromWet(0.1), dryFromWet(0.05))).toBeCloseTo(0.526, 2);
    expect(waterPerTonneProduct(1, 0)).toBe(1000);
  });
  it("the engine's own wet-basis kpi equals w(X_final) in every witness that publishes both", () => {
    for (const c of VERDICT_CASES) {
      const b = golden(`${D}/${c.witness.split("/").pop()}`)[c.unit]!;
      expect(100 * wetFromDry(b["X_final"]!), c.id).toBeCloseTo(b["moisture_pct_wb"]!, 6);
    }
  });
  it("the starved crystal leaves a sixth of its mass as water and 86 percent of its water in it", () => {
    const b = golden(`${D}/evapDryer02_energy_limited`)["dryer"]!;
    expect(b["moisture_pct_wb"]).toBeGreaterThan(16);
    expect(b["moisture_pct_wb"]).toBeLessThan(17);
    expect(1 - shareRemoved(b["X_initial"]!, b["X_final"]!)).toBeGreaterThan(0.86);
    expect(1 - shareRemoved(b["X_initial"]!, b["X_final"]!)).toBeLessThan(0.87);
  });
});

describe("the verdict orders the engine's numbers, and prints the numbers it used", () => {
  const v = (dir: string, unit: string, kin: boolean) =>
    dryerVerdict(factsFrom(`${D}/${dir}`, unit), kin);

  it("solidDryer01: isotherm-bound (X_final equals X_eq)", () => {
    expect(v("solidDryer01_sugar", "solidDryer", false).verdict).toBe("isotherm-bound");
  });
  it("solidDryer02: air-limited, the exhaust saturated", () => {
    const r = v("solidDryer02_starved_air", "solidDryer", false);
    expect(r.verdict).toBe("air-limited");
    expect(r.detail).toBe("exhaust saturated");
  });
  it("evapDryer02: air-limited, the gas at its wet bulb, with no isotherm", () => {
    const r = v("evapDryer02_energy_limited", "dryer", false);
    expect(r.verdict).toBe("air-limited");
    expect(r.detail).toBe("gas at its wet bulb");
    expect(r.used.map((u) => u.name)).not.toContain("X_eq");
  });
  it("evapDryer01: dry, and honestly not classified", () => {
    const r = v("evapDryer01_nacl", "dryer", false);
    expect(r.verdict).toBe("not-classified");
    expect(r.reason).toMatch(/no water is left/);
  });
  it("sprayDryer06: time-limited; sprayDryer01: isotherm-bound", () => {
    expect(v("sprayDryer06_rea", "dryer", true).verdict).toBe("time-limited");
    expect(v("sprayDryer01_sugar", "dryer", true).verdict).toBe("isotherm-bound");
  });
  it("sprayDryer02's chamber is a few percent above its floor and the declared tolerance says so", () => {
    const f = factsFrom(`${D}/sprayDryer02_residence_sweep`, "dryer");
    expect(f.Xfinal! / f.Xeq! - 1).toBeGreaterThan(VERDICT_TOLERANCE.iso);
    expect(dryerVerdict(f, true).verdict).toBe("time-limited");
  });
  it("a unit without a clock is never called time-limited", () => {
    const f = factsFrom(`${D}/sprayDryer06_rea`, "dryer");
    expect(dryerVerdict(f, false).verdict).toBe("not-classified");
  });
  it("a run with no X_final is not classified, never guessed", () => {
    const f: DryerFacts = { Xinitial: null, Xfinal: null, Xeq: null, exhaustAw: null, Tout: null, Twb: null, residence: null };
    expect(dryerVerdict(f, true).verdict).toBe("not-classified");
  });
  it("the verdict is pure: the same numbers give the same result", () => {
    const f = factsFrom(`${D}/solidDryer02_starved_air`, "solidDryer");
    expect(dryerVerdict(f, false)).toEqual(dryerVerdict({ ...f }, false));
  });
  it("the tolerances are the declared ones", () => {
    expect(VERDICT_TOLERANCE).toEqual({ sat: 0.01, floorK: 0.5, iso: 0.01, dry: 1e-6 });
  });
});

describe("a time is READ off the engine's column, between two emitted samples", () => {
  it("interpolates linearly, and says null when the run never got there", () => {
    const t = [0, 100, 200, 300], X = [0.3, 0.2, 0.1, 0.05];
    expect(timeToReach(t, X, 0.15)).toBeCloseTo(150, 12);
    expect(timeToReach(t, X, 0.1)).toBe(200);
    expect(timeToReach(t, X, 0.01)).toBeNull();
    expect(timeToReach(t, X, 0.5)).toBe(0);
    expect(timeToReach(t, X, NaN)).toBeNull();
  });
  it("the free-moisture level is a definition: 1 at the corner, 0 on the floor", () => {
    expect(levelAtPhi(0.0159, 0.12, 1)).toBeCloseTo(0.12, 12);
    expect(levelAtPhi(0.0159, 0.12, 0)).toBeCloseTo(0.0159, 12);
    expect([...PHI_STEPS]).toEqual([...PHI_STEPS].sort((a, b) => b - a));
  });
});

describe("every override resolves against the bundled text, in the declared unit", () => {
  it("the four verdict witnesses, and the tray and the spray witness, are bundled", () => {
    for (const w of [W_SOLID_RICH, W_SOLID_STARVED, W_EVAP_STARVED, W_SPRAY_COARSE, W_SPRAY_BASE, W_TRAY])
      expect(tutorialByName(w)?.files.rawFiles, w).toBeDefined();
    for (const c of VERDICT_CASES)
      expect(c.witness.split("/").pop(), c.id).toBeTruthy();
  });
  it("the air knob's default is the case's own authored total, and its box holds the sweep", () => {
    expect(authoredFlow(W_SOLID_RICH, "0/hotAir", ["water", "N2", "O2", "Ar"])).toBeCloseTo(AIR_KNOB.def, 6);
    for (const q of AIR_SWEEP) {
      expect(q).toBeGreaterThanOrEqual(10);
      expect(q).toBeLessThanOrEqual(AIR_KNOB.max);
    }
    expect(AIR_KNOB.def).toBeGreaterThanOrEqual(AIR_KNOB.min);
    expect(AIR_KNOB.def).toBeLessThanOrEqual(AIR_KNOB.max);
  });
  it("the air overrides apply to the real 0/hotAir, keep the unit, and keep the composition", () => {
    const raw = tutorialByName(W_SOLID_RICH)!.files.rawFiles!["0/hotAir"]!;
    const ov = scaledFlowOverrides(W_SOLID_RICH, "0/hotAir", ["water", "N2", "O2", "Ar"], 0.25);
    let text = raw;
    for (const o of ov) text = applyDictOverride(text, o);
    const nums = (t: string): number[] =>
      ["water", "N2", "O2", "Ar"].map((s) => Number(new RegExp(`^\\s*${s}\\s+([-+0-9.eE]+)\\s*kmol/h;`, "m").exec(t)![1]));
    const before = nums(raw), after = nums(text);
    for (let i = 0; i < 4; ++i) expect(after[i]! / before[i]!).toBeCloseTo(0.25, 8);
    expect(text).toContain("kmol/h;");
  });
  it("a species the stream does not declare throws instead of running", () => {
    expect(() => scaledFlowOverrides(W_SOLID_RICH, "0/hotAir", ["unobtainium"], 2)).toThrow(/unobtainium/);
    expect(() => scaledFlowOverrides("steady/drying/nope", "0/hotAir", ["N2"], 2)).toThrow();
  });
  it("the humid-day overrides (Y, endTime) resolve on the tray, and every Y is below saturation at 333.15 K", () => {
    const raws = tutorialByName(W_TRAY)!.files.rawFiles!;
    for (const Y of HUMID_DAYS) {
      applyDictOverride(raws["system/flowsheetDict"]!, { file: "system/flowsheetDict", key: "Y", value: Y });
      expect(Y).toBeLessThan(0.15);
    }
    applyDictOverride(raws["system/controlDict"]!, { file: "system/controlDict", key: "endTime", value: HUMID_END_TIME });
    expect(SPEC_KNOB.def).toBeGreaterThanOrEqual(SPEC_KNOB.min);
  });
  it("the spray grid's overrides resolve on sprayDryer01, in the declared units", () => {
    const raw = tutorialByName(W_SPRAY_BASE)!.files.rawFiles!["system/flowsheetDict"]!;
    for (const H of CHAMBER_HEIGHTS)
      for (const rpm of WHEEL_SPEEDS) {
        let text = raw;
        for (const o of sprayOverrides(H, rpm)) text = applyDictOverride(text, o);
        expect(text).toMatch(new RegExp(`chamberHeight\\s+${H}\\s*m;`));
        expect(text).toMatch(new RegExp(`wheelSpeed\\s+${rpm};`));
      }
  });
  it("the loading knob writes the area m_s/L, and the engine's charge is the typed 2.0 kg", () => {
    const k = DRYING_KNOBS.find((x) => x.id === "area")!;
    expect(k.toDict!(k.def)).toBeCloseTo(k.dictDef!, 12);
    expect(k.toDict!(8)).toBeCloseTo(TRAY_DRY_SOLID_KG / 8, 12);
    const ov = knobOverrides({ ...defaultKnobValues(), area: 8 }).find((o) => o.key === "area")!;
    expect(ov.value).toBeCloseTo(0.25, 12);
    const b = golden("tutorials/batch/drying/dryer01_sucrose_tray");
    expect(b["campaign"]!["mass_kg_initial"]! / (1 + b["dryer"]!["X_initial"]!)).toBeCloseTo(TRAY_DRY_SOLID_KG, 6);
    for (const L of COLLAPSE_LOADINGS) {
      expect(L).toBeGreaterThanOrEqual(k.min);
      expect(L).toBeLessThanOrEqual(k.max);
    }
  });
});

describe("the bill of tests reads the cases' own numbers", () => {
  it("each measured row carries a number the case declares, and none is typed in the page", () => {
    const rows = measuredRows();
    expect(rows[0]!.value).toContain("0.12");
    expect(rows[0]!.value).toContain("0.15");
    expect(rows[2]!.value).toBe("0.05");
    expect(rows[3]!.value).toBe("0.045, 6, 0.96");
    expect(declaredNumber(W_TRAY, "system/flowsheetDict", "T", "air")).toBeCloseTo(333.15, 6);
    expect(decidedRows().map((r) => r.value)).toEqual(["333.15", "0.01", "0.5", "5", "20000"]);
    expect(declaredNumber(W_TRAY, "system/flowsheetDict", "nothingHere")).toBeNull();
  });
  it("the right-hand column re-uses the books' list, not a copy of it", () => {
    for (const r of [...measuredRows(), ...decidedRows()]) expect(r.book.length).toBeGreaterThan(5);
    expect(measuredRows()[0]!.book).toMatch(/Drying kinetics/);
  });
});

describe("the pages", () => {
  const html = (c: () => JSX.Element): string =>
    renderToStaticMarkup(createElement(MantineProvider, null, createElement(c)));

  it("page A is registered on the Separations shelf and routes to its own tool", () => {
    const t = METHOD_TOOLS.find((x) => x.id === "why-did-it-not-dry")!;
    expect(t.label).toBe("Why did it not dry?");
    expect(t.discipline).toBe("Separations & phase equilibria");
    expect(t.status).toBe("live");
    expect(read("gui/src/ui/MethodsWorkspace.tsx")).toContain('tool === "why-did-it-not-dry"');
    expect(read("docs/theoryGuide.tex")).toContain(`\\label{${t.theory}}`);
  });
  it("the ids and the theory links of the two old pages stay", () => {
    for (const id of ["drying", "dryer-selection", "psychro"]) {
      const t = METHOD_TOOLS.find((x) => x.id === id)!;
      expect(t, id).toBeDefined();
      expect(t.theory).toBe("ch:drying");
    }
  });
  it("page A shows its three cards, its tolerances, its no-kinetics notice and no particle temperature", () => {
    const h = html(WhyDidItNotDryTool);
    for (const a of ['data-card="basis"', 'data-card="ceilings"', 'data-card="humid-day"',
      "data-tolerances", "data-no-kinetics", "Why did it not dry?", "Ten percent of what?"])
      expect(h, a).toContain(a);
    expect(h).toContain("no kinetics");
    expect(h).not.toMatch(/T_particle|particle temperature [=:]/);
  });
  it("the drying page shows the three new cards after the original five steps", () => {
    const h = html(DryingCurveTool);
    expect(h).toContain("The drying curve, and what decides the time");
    expect(h).toContain("6 · To dry faster, load less");
    expect(h).toContain("8 · The spray chamber");
  });
  it("the selection page opens on the selector, in four named parts: choose, ask of the product (the bill of tests), the gas arrangements, the sale", () => {
    const h = html(DryerSelectionTool);
    const at = (needle: string): number => h.indexOf(needle);
    const parts = ["Choose: which dryers stay in the race", "What to ask of the product",
      "Which way the gas meets the solid", "What the sale does not show"].map((t) => at(`>${t}</h4>`));
    for (const p of parts) expect(p).toBeGreaterThan(0);
    expect([...parts].sort((a, b) => a - b)).toEqual(parts);
    // the selector comes before any table; the bill of tests sits in part B, the arrangements in C
    expect(at("data-dryer-tree")).toBeGreaterThan(parts[0]!);
    expect(at("data-dryer-tree")).toBeLessThan(at("data-dryer-comparison"));
    expect(at("data-dryer-tree")).toBeLessThan(at("data-table=\"muj-1.1\""));
    expect(at('data-card="bill-of-tests"')).toBeGreaterThan(parts[1]!);
    expect(at('data-card="bill-of-tests"')).toBeLessThan(parts[2]!);
    expect(at('data-section="arrangements"')).toBeGreaterThan(parts[1]!);
    expect(at('data-section="arrangements"')).toBeLessThan(parts[2]!);
    for (const needle of ["Ask the tree", "data-habitual-tables", "data-dryer-energy", "The nine side by side",
      "data-checklist-table", "The drum dryer in two books"])
      expect(h.indexOf(needle), needle).toBeGreaterThan(0);
    // no drawer: nothing the chapter menu lists is hidden in a closed <details>
    expect(h).not.toContain('data-drawer="reference"');
    expect(h).toContain("data-dryer-parts");
  });
});

describe("the lesson and its claims", () => {
  it("four steps, each glossed, and every quiz question tests a real step", () => {
    expect(WHY_STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4]);
    for (const q of WHY_QUIZ) for (const n of q.steps) expect(WHY_STEPS.some((s) => s.n === n)).toBe(true);
    for (const s of WHY_STEPS) expect((s.where ?? []).length, `step ${s.n}`).toBeGreaterThan(0);
  });
  it("the units have the kinetics the page says they do not have", () => {
    for (const f of ["SolidDryer.cpp", "EvaporativeDryer.cpp"])
      expect(read(`src/unitOperations/heatTransfer/${f}`), f).not.toMatch(/residenceTime|tau_dry_constant|t_constant_rate/);
    expect(read("src/unitOperations/heatTransfer/SprayDryer.cpp")).toMatch(/kpis_\["residenceTime"\]/);
  });
  it("the cited engine lines say what the page says they say", () => {
    //  ANCHORS: repoint_lesson_citations keeps the prose citations of the two
    //  dryer pages on these lines.
    const ANCHORS: [string, number, string][] = [
      ["src/unitOperations/heatTransfer/SolidDryer.cpp", 268, "T_floor = psychrometry::gasWetBulb"],
      ["src/unitOperations/heatTransfer/SprayDryer.cpp", 665, "const scalar d   = (d32 > 0.0)"],
      ["src/unitOperations/heatTransfer/SprayDryer.cpp", 772, "Residence time = chamber height"],
      ["src/unitOperations/heatTransfer/SprayDryer.cpp", 921, "Tpz = T_wb + (Tgz - T_wb)"],
    ];
    for (const [file, line, text] of ANCHORS)
      expect(read(file).split("\n")[line - 1], `${file}:${line}`).toContain(text);
  });
});

describe("two texts that stated what the goldens deny are corrected", () => {
  it("evapDryer02 no longer says 16.6 wt% of the water stays", () => {
    for (const f of ["system/controlDict", "system/flowsheetDict"]) {
      const t = read(`${D}/evapDryer02_energy_limited/${f}`);
      expect(t, f).not.toMatch(/16\.6 wt% of the water stays/);
      expect(t, f).toMatch(/86 %/);
    }
  });
  it("the sugar plant's DRYING headers no longer say the exhaust carries fines to a working cyclone", () => {
    const t = read("tutorials/plant/ChemicalPlantTutorial/system/flowsheetDict")
      + read("tutorials/plant/ChemicalPlantTutorial/system/controlDict");
    expect(t).not.toMatch(/carrying fines|carries fines|carry fines/);
    const g = read("tutorials/plant/ChemicalPlantTutorial/expected");
    expect(g).toMatch(/kpi\s+DRYING\.CY\s+solidsIn_mass\s+0\s/);
  });
});
