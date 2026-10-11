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
  The pressure-letdown EduTool (C64), held to the tree and to the open
  implementation its valve relations were read from.

  What it holds, block by block:
    * the shelf, the kind, and the links both ways with overpressure (a
      `leadsTo` in each direction that lands on a step the other page has);
    * the valve arithmetic against the doctest values of the `fluids`
      control-valve functions it was read from (the standard was not read;
      these are the numbers that implementation prints), and its own
      continuity at the choke;
    * the witness's two inlets against the plant's converged files, the
      props witness's liquid against letdown01's own converged drum liquid
      and its temperature against the ValveHP T_out golden, and the shipped
      pressures against SHIPPED_P_OUT;
    * the storage-pressure override, applied to the real witness;
    * the numbers the page's prose and the registry line state, recomputed
      from the goldens (the hand estimate of the flash, the volume ratio,
      the pressure ratio of 70, the valve closing on the report's surface);
    * the drawings, rendered on the shipped numbers, with no NaN and an
      aria-label each;
    * the lesson text: no quotation marks, every equation parses, every
      engine citation lands on the line it names.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { methodCase } from "../src/case/methodRun.js";
import { tutorialByName } from "../src/cases/tutorials.js";
import {
  LETDOWN_PLANT, LETDOWN_PROPS, LETDOWN_WITNESS, SHIPPED_P_OUT, VALVES,
  cavitationIndex, chokedLiquidDrop, chokedPressureRatio,
  criticalPressureRatio, expansionFactor, flashFractionEstimate,
  liquidCriticalRatioFactor, liquidRegime, nozzleFlowFraction, stagedDrop,
  stagesToAvoidVapour, storagePressureOverride, valveFlowFraction,
  venaContractaPressure,
} from "../src/ui/methods/letdown.js";
import {
  BubbleCollapseDrawing, ChokedFlowChart, InstallationDrawing,
  RecoveryDrawing, SeriesDrawing, StagesDrawing, TrimsDrawing,
  ValveProfileDrawing,
} from "../src/ui/methods/letdownDrawings.js";
import {
  LETDOWN_LIMITS, LETDOWN_SOURCES, LETDOWN_STEPS,
} from "../src/ui/methods/letdownLesson.js";
import { OVERPRESSURE_STEPS } from "../src/ui/methods/overpressureLesson.js";
import { texParses } from "../src/ui/methods/lessonTex.js";
import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { witnessOutput } from "./witnessRead.js";

const tree = (rel: string): string =>
  readFileSync(new URL(`../../${rel}`, import.meta.url), "utf-8");
const rel = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);
const FLOWSHEET = "system/flowsheetDict";
const PROPS = "system/propsDict";

/** A `kpi <unit> <key> <value>` / `diag <op> <key> <value>` golden row. */
function golden(caseDir: string, kind: string, name: string, key: string): number {
  const m = new RegExp(`^${kind}\\s+${name}\\s+${key}\\s+([-+0-9.eE]+)`, "m")
    .exec(tree(`tutorials/${caseDir}/expected`));
  if (!m) throw new Error(`${caseDir}: no golden ${kind} ${name}.${key}`);
  return Number(m[1]);
}

/** The component flows [kmol/h] of a stream file, or of a `composition {}`
 *  block, in file order. */
function flows(text: string): { [c: string]: number } {
  const out: { [c: string]: number } = {};
  for (const m of text.matchAll(/^\s*([A-Za-z0-9]+)\s+([-+0-9.eE]+)\s+kmol\/h;/gm))
    out[m[1]!] = Number(m[2]);
  return out;
}
function compositionOf(propsDict: string, op: string): { [c: string]: number } {
  const at = propsDict.search(new RegExp(`\\bname\\s+${op}\\s*;`));
  const blk = /composition\s*\{([^}]*)\}/.exec(propsDict.slice(at))![1]!;
  const out: { [c: string]: number } = {};
  for (const e of blk.matchAll(/([A-Za-z0-9_]+)\s+([-+0-9.eE]+)\s*;/g)) out[e[1]!] = Number(e[2]);
  return out;
}
const scalar = (text: string, key: string): number =>
  Number(new RegExp(`^${key}\\s+([-+0-9.eE]+)`, "m").exec(text)![1]);

describe("letdown: the shelf, the kind and the links", () => {
  const t = METHOD_TOOLS.find((m) => m.id === "letdown");
  it("is a live construction on the Hydraulics & control shelf", () => {
    expect(t?.discipline).toBe("Hydraulics & control");
    expect(t?.kind).toBe("construction");
    expect(t?.status).toBe("live");
  });
  it("its last step leads to a step the overpressure page has", () => {
    const lt = LETDOWN_STEPS.find((s) => s.leadsTo)!.leadsTo!;
    expect(lt.tool).toBe("overpressure");
    expect(METHOD_TOOLS.find((m) => m.id === "overpressure")?.label.toLowerCase())
      .toContain(lt.toolLabel.toLowerCase());
    expect(OVERPRESSURE_STEPS.map((s) => s.title)).toContain(lt.stepTitle);
  });
  it("the overpressure page's critical-flow step leads back to a step this page has", () => {
    const back = OVERPRESSURE_STEPS.filter((s) => s.leadsTo?.tool === "letdown");
    expect(back.map((s) => s.n)).toEqual([8]);
    expect(t?.label.toLowerCase()).toContain(back[0]!.leadsTo!.toolLabel.toLowerCase());
    expect(LETDOWN_STEPS.map((s) => s.title)).toContain(back[0]!.leadsTo!.stepTitle);
  });
  it("the page links to the overpressure and pump-system tools", () => {
    const src = tree("gui/src/ui/methods/LetdownTool.tsx");
    expect(src).toContain('setActiveMethodTool("overpressure")');
    expect(src).toContain('setActiveMethodTool("pump-system")');
  });
  it("names witnesses the bundled corpus carries", () => {
    for (const w of [LETDOWN_WITNESS, LETDOWN_PROPS])
      expect(tutorialByName(w), w).toBeDefined();
  });
});

describe("letdown: the valve arithmetic against the fluids implementation", () => {
  //  The values the fluids 1.0.27 doctests print, recomputed by this page's
  //  own functions.
  it("F_F(70.1 kPa, 22.12 MPa) = 0.94424 (FF_critical_pressure_ratio_l)", () => {
    expect(rel(liquidCriticalRatioFactor(70100, 22120000), 0.9442375225233299)).toBeLessThan(1e-12);
  });
  it("the liquid choke at P1 = 680 kPa, F_L = 0.6 sits at P2 = 458.89 kPa (control_valve_choke_P_l)", () => {
    const P1 = 680000;
    const P2 = P1 - chokedLiquidDrop(P1, 69682.89291024722, 22048320.0, 0.6);
    expect(rel(P2, 458887.5306077305)).toBeLessThan(1e-12);
  });
  it("the gas choke at x_T = 1, k = 1.3, P1 = 1 bar sits at P2 = 7142.86 Pa (control_valve_choke_P_g)", () => {
    const P2 = 1e5 * (1 - chokedPressureRatio(1.3, 1.0));
    expect(rel(P2, 7142.857142857143)).toBeLessThan(1e-12);
  });
  it("x = 0.544 is not choked at F_gamma = 0.929, x_T = 0.6 (is_choked_turbulent_g)", () => {
    expect(0.544 < chokedPressureRatio(0.929 * 1.4, 0.6)).toBe(true);
  });
  it("the cavitation index of (1 MPa, 0.8 MPa, 0.2 MPa) is 4 (cavitation_index)", () => {
    expect(cavitationIndex(1e6, 8e5, 2e5)).toBe(4);
  });
  it("Y is 2/3 at the choke and the flow curves reach 1 there, continuously", () => {
    const k = 1.4, xT = 0.7, xc = chokedPressureRatio(k, xT);
    expect(expansionFactor(xc, k, xT)).toBeCloseTo(2 / 3, 12);
    expect(valveFlowFraction(xc * (1 - 1e-9), k, xT)).toBeCloseTo(1, 6);
    expect(valveFlowFraction(0.99, k, xT)).toBe(1);
    const xs = 1 - criticalPressureRatio(k);
    expect(nozzleFlowFraction(xs * (1 - 1e-9), k)).toBeCloseTo(1, 6);
    expect(nozzleFlowFraction(0.99, k)).toBe(1);
  });
  it("the vena-contracta pressure is the definition of F_L, inverted", () => {
    const P1 = 20e5, P2 = 3e5, FL = 0.9;
    const Pvc = venaContractaPressure(P1, P2, FL);
    expect(rel((P1 - P2) / (P1 - Pvc), FL * FL)).toBeLessThan(1e-12);
  });
  it("the regimes: flashing below Pv, cavitation when only the dip is, none otherwise", () => {
    expect(liquidRegime(20e5, 1e5, 1.9e5, 0.9)).toBe("flashing");
    expect(liquidRegime(20e5, 3e5, 1.9e5, 0.9)).toBe("cavitation");
    expect(liquidRegime(20e5, 15e5, 1.9e5, 0.9)).toBe("neither");
  });
  it("equal-ratio stages close on P2, and the fewest that avoid vapour is minimal", () => {
    const s = stagedDrop(20e5, 3e5, 5, 0.9);
    expect(s).toHaveLength(5);
    expect(s[4]!.P_out).toBe(3e5);
    expect(rel(s[0]!.P_in / s[0]!.P_out, s[3]!.P_in / s[3]!.P_out)).toBeLessThan(1e-12);
    const n = stagesToAvoidVapour(20e5, 3e5, 1.9e5, 0.9)!;
    expect(n).toBeGreaterThan(1);
    expect(stagedDrop(20e5, 3e5, n, 0.9).every((q) => q.P_vc > 1.9e5)).toBe(true);
    expect(stagedDrop(20e5, 3e5, n - 1, 0.9).every((q) => q.P_vc > 1.9e5)).toBe(false);
    //  and no count helps once the outlet itself is below Pv
    expect(stagesToAvoidVapour(20e5, 1e5, 1.9e5, 0.9)).toBeNull();
  });
});

describe("letdown: the witnesses, held to what they copy", () => {
  const raw = tutorialByName(LETDOWN_WITNESS)!.files.rawFiles!;
  const praw = tutorialByName(LETDOWN_PROPS)!.files.rawFiles!;
  for (const s of ["RawLiquid", "Purge"]) {
    it(`0/${s} is the plant's converged/${s}, to the digit`, () => {
      const conv = witnessOutput(`tutorials/${LETDOWN_PLANT}`, `converged/${s}`);
      const mine = raw[`0/${s}`]!;
      expect(flows(mine)).toEqual(flows(conv));
      expect(scalar(mine, "T")).toBe(scalar(conv, "T"));
      expect(scalar(mine, "P")).toBe(scalar(conv, "P"));
    });
  }
  it("ships the plant's two drum pressures and the purge header, in valve order", () => {
    const P = [...raw[FLOWSHEET]!.matchAll(/^\s*P\s+([0-9.]+)\s+bar;/gm)]
      .map((m) => Number(m[1]) * 1e5);
    expect(P).toEqual(VALVES.map((v) => SHIPPED_P_OUT[v]));
    const plant = tutorialByName(LETDOWN_PLANT)!.files.rawFiles!;
    expect(plant["LetdownHP/system/flowsheetDict"]).toMatch(/P\s+20 bar;/);
    expect(plant["StorageFlash/system/flowsheetDict"]).toMatch(/P\s+1\.01325 bar;/);
  });
  it("the storage-pressure override moves ValveLP and nothing else", () => {
    const d = methodCase(LETDOWN_WITNESS, storagePressureOverride(5e5)).rawFiles![FLOWSHEET]!;
    const P = [...d.matchAll(/^\s*P\s+([0-9.]+)\s+bar;/gm)].map((m) => Number(m[1]));
    expect(P).toEqual([20, 5, 2]);
  });
  it("the props witness's purge is the witness's 0/Purge", () => {
    const comp = compositionOf(praw[PROPS]!, "purge");
    expect(comp).toEqual(flows(raw["0/Purge"]!));
  });
  it("the props witness's liquid is letdown01's own converged drum liquid at ValveHP's T_out", () => {
    const conv = witnessOutput(`tutorials/${LETDOWN_WITNESS}`, "converged/LetdownLiquid");
    const props = praw[PROPS]!;
    const at = props.search(/\bname\s+liquidLP\s*;/);
    expect(compositionOf(props, "liquidLP")).toEqual(flows(conv));
    const T = Number(/T\s+([0-9.]+)\s+K;/.exec(props.slice(at))![1]);
    expect(rel(T, golden(LETDOWN_WITNESS, "kpi", "ValveHP", "T_out"))).toBeLessThan(1e-8);
  });
});

describe("letdown: the numbers the prose states, recomputed from the goldens", () => {
  const vfLP = golden(LETDOWN_WITNESS, "kpi", "ValveLP", "vf");
  //  6 %, not 3 % (C65 item d).  The valve now balances on the package's
  //  formation surface, whose latent heat at 239 K is the Watson crossing at
  //  298 K plus the liquid and ideal-gas Cp legs plus the SRK departure --
  //  about 4 % below the record's HvapTb, which is the lambda this estimate
  //  divides by -- so the engine flashes about 4 % more than the estimate.
  it("the hand estimate of the flash lands within 6 % of the engine's vf", () => {
    const raw = tutorialByName(LETDOWN_WITNESS)!.files.rawFiles!;
    const nh3 = raw["constant/components/NH3.dat"]!;
    const cp = Number(/liquidHeatCapacity\s*\{[^}]*coefficients\s*\(\s*([0-9.]+)\s*\)/.exec(nh3)![1]);
    const lambda = Number(/^HvapTb\s+([0-9.]+)/m.exec(nh3)![1]);
    const est = flashFractionEstimate(cp,
      golden(LETDOWN_WITNESS, "kpi", "ValveLP", "T_in"),
      golden(LETDOWN_WITNESS, "kpi", "ValveLP", "T_out"), lambda);
    expect(rel(est, vfLP)).toBeLessThan(0.06);
  });
  it("the volume grows 'about forty times' (the registry line)", () => {
    const r = golden(LETDOWN_WITNESS, "kpi", "ValveLP", "volumeRatio");
    expect(r).toBeGreaterThan(35);
    expect(r).toBeLessThan(48);
    expect(METHOD_TOOLS.find((m) => m.id === "letdown")!.teaches).toContain("about forty times");
  });
  it("the purge's pressure ratio of 70, and its choke at the engine's k", () => {
    const P1 = golden(LETDOWN_WITNESS, "kpi", "PurgeValve", "P_in");
    const P2 = golden(LETDOWN_WITNESS, "kpi", "PurgeValve", "P_out");
    expect(P1 / P2).toBe(70);
    const k = golden(LETDOWN_PROPS, "diag", "purge", "gamma");
    //  step 4: "close to one half"
    expect(Math.abs(criticalPressureRatio(k) - 0.5)).toBeLessThan(0.05);
    expect((P1 - P2) / P1).toBeGreaterThan(chokedPressureRatio(k, 0.95));
  });
  it("the second throttle flashes at the plant's store: P2 below the engine's Pv", () => {
    const Pv = golden(LETDOWN_PROPS, "diag", "liquidLP", "Psat_NH3");
    expect(SHIPPED_P_OUT.ValveLP).toBeLessThan(Pv);
    expect(SHIPPED_P_OUT.ValveHP).toBeGreaterThan(Pv);
  });
  it("the valve closes on the report's surface, and the gas valve cools (step 6)", () => {
    //  C65 item d: the valve prices both ends through flashState::priceState,
    //  so the plant's first law closes and the purge shows its Joule-Thomson
    //  cooling.  The old limit ("about 39 kW") is gone with the gap, and the
    //  energy-closure gate no longer pins this case.
    const r = golden(LETDOWN_WITNESS, "boundary", "global", "residual_kW");
    expect(Math.abs(r)).toBeLessThan(0.01);
    expect(golden(LETDOWN_WITNESS, "kpi", "PurgeValve", "dT")).toBeLessThan(-1);
    expect(LETDOWN_LIMITS.find((l) => l.id === "valve-surface")).toBeUndefined();
    expect(tree("bin/curate/check_energy_closure.py"))
      .not.toMatch(/letdown01_ammonia_flashing":/);
  });
});

describe("letdown: the drawings render on the shipped numbers", () => {
  const svgs = [
    createElement(ValveProfileDrawing, { P1: 20e5, P2: 1.01325e5, Pvc: -0.4e5, Pv: 1.894e5 }),
    createElement(ValveProfileDrawing, { P1: 20e5, P2: 4e5, Pvc: 1e5, Pv: 1.894e5 }),
    createElement(ChokedFlowChart, {
      valve: [[0, 0], [0.5, 0.9], [1, 1]], nozzle: [[0, 0], [0.47, 1], [1, 1]],
      xCh: 0.7, xNozzle: 0.47, xCase: 0.986 }),
    createElement(StagesDrawing, { stages: stagedDrop(20e5, 3e5, 4, 0.9), Pv: 1.894e5 }),
    createElement(TrimsDrawing),
    createElement(InstallationDrawing),
    createElement(SeriesDrawing),
    createElement(RecoveryDrawing, { P_kW: 222.5, eta: 0.75 }),
    createElement(BubbleCollapseDrawing),
  ];
  it("eight drawings (nine renders), each an SVG with an aria-label and no NaN", () => {
    for (const el of svgs) {
      const html = renderToStaticMarkup(el);
      expect(html.startsWith("<svg")).toBe(true);
      expect(html).toMatch(/role="img"/);
      expect(html).toMatch(/aria-label="[^"]{40,}"/);
      expect(html).not.toMatch(/NaN|Infinity|undefined/);
    }
  });
});

describe("letdown: the lesson text", () => {
  it("quotes nothing", () => {
    for (const s of LETDOWN_STEPS) {
      expect(s.body, `step ${s.n}`).not.toMatch(/["“”]/);
      expect(s.note ?? "", `step ${s.n}`).not.toMatch(/["“”]/);
    }
  });
  it("every equation parses", () => {
    for (const s of LETDOWN_STEPS) {
      if (s.formula) expect(texParses(s.formula), `step ${s.n}`).toBe(true);
      for (const w of s.where ?? []) expect(texParses(w.sym), `step ${s.n} ${w.sym}`).toBe(true);
    }
  });
  it("every engine citation lands on the line it names", () => {
    //  What each cited line must say.  A citation not in this map fails: a
    //  new one is added here, with the words it is cited for.
    const expectAt: { [cite: string]: string } = {
      "src/unitOperations/valve/Valve.H:32": "isenthalpic",
      "src/unitOperations/valve/Valve.cpp:147": "flashState::priceState(T, Pout",
      "src/unitOperations/valve/Valve.cpp:263": "HOMOGENEOUS, NO SLIP",
      "src/thermo/ThermoPackage.cpp:1875": "ThermoPackage::density",
      "src/unitOperations/flash/StreamEquilibrium.H:822": "inline scalar priceState(",
      "src/propertyOps/PropertyPoint.cpp:73": "Cp_ig / (Cp_ig - constant::R)",
      "src/propertyOps/PropertyEvaluator.cpp:167": "thermo.Psat(i, T)",
    };
    const text = LETDOWN_STEPS.map((s) => `${s.body} ${s.note ?? ""}`).join(" ");
    const cites = [...text.matchAll(/(src\/[A-Za-z0-9_/]+\.(?:H|cpp)):(\d+)/g)];
    expect(cites.length).toBeGreaterThanOrEqual(7);
    for (const m of cites) {
      const key = `${m[1]}:${m[2]}`;
      expect(expectAt[key], `uncatalogued citation ${key}`).toBeDefined();
      const line = tree(m[1]!).split("\n")[Number(m[2]) - 1] ?? "";
      expect(line, key).toContain(expectAt[key]!);
    }
  });
  it("names each source it leans on, and says which were not read", () => {
    const ids = LETDOWN_SOURCES.map((s) => s.id);
    for (const id of ["fluids", "iec-60534-2-1", "iec-60534-8", "eu-noise", "coolprop"])
      expect(ids).toContain(id);
    for (const id of ["iec-60534-2-1", "iec-60534-8", "isa-rp75-23"])
      expect(LETDOWN_SOURCES.find((s) => s.id === id)!.used).toMatch(/NOT READ/);
  });
});
