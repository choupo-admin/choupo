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
  fluidisationLab.test — the fluidisation laboratory, the `fluidised-beds`
  page's pop-out tab: its pure drawing (gui/src/case/fluidisationLab.ts),
  its URL, its notebook's reveal, and the one quantity it added to the
  page's arithmetic (`particulateExpansion`).

  Every number the laboratory shows is called from case/fluidisedBeds.ts;
  these tests hold the DRAWING to those numbers: nothing moves below u_mf,
  the drawn height is the computed one, a void's diameter is Mori and Wen's
  at its height, the voids' mean area is the computed bubble fraction, dots
  leave only above u_t, and reduced motion gives still frames.  No engine
  runs here: there is no engine model.
\*---------------------------------------------------------------------------*/

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { describe, expect, it } from "vitest";

import {
  LAB_DEFAULT_KINDS, LAB_U_START, columnState, columnsFromPage, directionOf, encodeLab, gasOf,
  heightAtAge, labFrame, nextInventory, parseLab, revealOf, voidsAt, type ColumnInputs,
  type LabColumnSpec,
} from "../src/case/fluidisationLab.js";
import { PARTICLES } from "../src/case/fluidisedBedPresets.js";
import {
  bedPressureDrop, bubbleAt, ergunGradient, geldartGroup, minimumFluidisation, moriWenDiameter,
  particulateExpansion, regimeMap, terminalVelocity, weightGradient, type Gas,
} from "../src/case/fluidisedBeds.js";
import { FluidisedBedsTool } from "../src/ui/methods/FluidisedBedsTool.js";
import { FLUID_STEPS } from "../src/ui/methods/fluidisedBedsLesson.js";
import { FluidisationLabTab, NOT_SHOWN } from "../src/ui/methods/FluidisationLabTab.js";

const setup = parseLab("?fluidlab=1").setup!;
const gas: Gas = gasOf(setup);
const spec = (id: string): LabColumnSpec => {
  const x = PARTICLES.find((p) => p.id === id)!;
  return { kind: x.id, d_um: x.d_um, rhoP: x.rhoP, eps: x.eps, F: x.F };
};
const inputs = (id: string): ColumnInputs => ({
  spec: spec(id), gas, LmfFull: 1, Dt: 1, orificesPerM2: 1000, Dg_cm2s: 0.2,
});
const rel = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);

describe("the presets and their groups, as the page's own geldartGroup returns them", () => {
  it("covers the four groups, and a bare link opens three different ones", () => {
    const groupOf = (id: string): string => {
      const s = spec(id);
      return geldartGroup(s.d_um, (s.rhoP - gas.rhoG) / 1000);
    };
    expect(PARTICLES.map((p) => groupOf(p.id))).toEqual(["B", "A", "C", "D"]);
    expect(LAB_DEFAULT_KINDS.map(groupOf)).toEqual(["A", "B", "D"]);
    expect(setup.columns.map((c) => c.kind)).toEqual([...LAB_DEFAULT_KINDS]);
  });

  it("opens from the page with the page's particle first, then other groups, group C last", () => {
    expect(columnsFromPage(spec("sand"), gas).map((c) => c.kind)).toEqual(["sand", "catalyst", "grain"]);
    expect(columnsFromPage(spec("fine"), gas).map((c) => c.kind)).toEqual(["fine", "sand", "catalyst"]);
    const own: LabColumnSpec = { kind: "own", d_um: 500, rhoP: 2500, eps: 0.4, F: 0 };
    expect(columnsFromPage(own, gas)[0]).toEqual(own);
  });
});

describe("the URL carries every input, and refuses what does not read", () => {
  it("round-trips a set-up, an own particle included", () => {
    const s = { ...setup, u: 0.0123, columns: [spec("sand"), { kind: "own", d_um: 500, rhoP: 2500, eps: 0.4, F: 0 }] };
    const back = parseLab(`?${encodeLab(s)}`).setup!;
    expect(back).toEqual(s);
  });
  it("starts with the gas almost off on a bare link", () => {
    expect(setup.u).toBe(LAB_U_START);
  });
  it("refuses by name", () => {
    expect(parseLab("?fluidlab=1&gas=xenon").refused).toMatch(/xenon/);
    expect(parseLab("?fluidlab=1&u=abc").refused).toMatch(/not a number/);
    expect(parseLab("?fluidlab=1&c=sand,unobtainium").refused).toMatch(/unobtainium/);
    expect(parseLab("?fluidlab=1&c=sand,sand,sand,sand").refused).toMatch(/one to three/);
    expect(parseLab("?fluidlab=1&L=0").refused).toMatch(/bed height/);
  });
});

describe("the particulate band: Ergun with the voidage free (added to fluidisedBeds.ts)", () => {
  const p = { d: 70e-6, rhoP: 1500 }, eps = 0.45;
  const mf = minimumFluidisation(p, gas, eps);
  it("is the packed bed at u_mf and carries the weight at its voidage above it", () => {
    expect(particulateExpansion(mf.u, p, gas, eps, 1, mf.u)).toBeNull();
    const u = 1.4 * mf.u;
    const pe = particulateExpansion(u, p, gas, eps, 1, mf.u)!;
    expect(pe.eps).toBeGreaterThan(eps);
    expect(rel(ergunGradient(u, p.d, pe.eps, gas).total, weightGradient(pe.eps, p, gas))).toBeLessThan(1e-9);
    //  the same particles: (1 - eps_mf) L_mf = (1 - eps) H
    expect(rel((1 - pe.eps) * pe.H, (1 - eps) * 1)).toBeLessThan(1e-12);
    //  just above u_mf the bed has barely moved
    expect(particulateExpansion(mf.u * (1 + 1e-9), p, gas, eps, 1, mf.u)!.H).toBeCloseTo(1, 6);
  });
});

describe("the drawing is a pure function of the computed state and time", () => {
  it("below u_mf nothing moves and the bed has its packed height", () => {
    for (const id of ["catalyst", "sand", "grain"]) {
      const mf = minimumFluidisation({ d: spec(id).d_um * 1e-6, rhoP: spec(id).rhoP }, gas, spec(id).eps);
      const st = columnState(inputs(id), 0.5 * mf.u, 1);
      expect(st.phase).toBe("fixed");
      expect(st.H).toBe(1);
      const a = labFrame(st, 0), b = labFrame(st, 7.3);
      expect(b.dots).toEqual(a.dots);
      expect(a.voids).toHaveLength(0);
      expect(a.flying).toHaveLength(0);
      expect(Math.max(...a.dots.map((d) => d.y))).toBeLessThanOrEqual(1);
    }
  });

  it("above u_mf the dots move and the bed is drawn at the computed height", () => {
    const st = columnState(inputs("sand"), 0.15, 1);
    expect(st.phase).toBe("bubbling");
    const f = labFrame(st, 1.1);
    expect(f.bedTop).toBe(st.bubbleBed!.H);
    expect(f.bedTop).toBeGreaterThan(1);
    expect(labFrame(st, 1.1).dots).not.toEqual(labFrame(st, 2.4).dots);
    expect(Math.max(...f.dots.map((d) => d.y))).toBeLessThanOrEqual(f.bedTop! + 1e-12);
  });

  it("in the particulate band the bed expands with no voids, at the computed height", () => {
    const c = inputs("catalyst");
    const p = { d: c.spec.d_um * 1e-6, rhoP: c.spec.rhoP };
    const m = regimeMap(p, gas, c.spec.eps, c.spec.F, 0.006);
    expect(m.at).toBe("particulate (no bubbles)");
    const st = columnState(c, 0.006, 1);
    expect(st.phase).toBe("particulate");
    expect(st.H).toBe(particulateExpansion(0.006, p, gas, c.spec.eps, 1, m.umf)!.H);
    const f = labFrame(st, 3);
    expect(f.voids).toHaveLength(0);
    expect(f.bedTop).toBe(st.H);
  });

  it("each void has Mori and Wen's diameter at its height, and rises at the computed u_b", () => {
    const st = columnState(inputs("sand"), 0.15, 1);
    const b = st.bubbleInput!;
    const vs = voidsAt(st, 5);
    expect(vs.length).toBeGreaterThan(0);
    for (const v of vs) expect(rel(2 * v.r, moriWenDiameter(v.y, b).db)).toBeLessThan(1e-12);
    //  the rise table integrates dh/u_b: a void's rise over a short time is u_b dt
    const r = st.rise!, h0 = 0.3 * st.H!;
    const age0 = r.tau[60]!, dt = 1e-3;
    expect(heightAtAge(r, age0)).toBeCloseTo(r.hs[60]!, 12);
    const v = (heightAtAge(r, age0 + dt) - r.hs[60]!) / dt;
    expect(rel(v, bubbleAt(r.hs[60]!, b, true).ub)).toBeLessThan(1e-2);
    void h0;
  });

  it("the voids' mean area fraction in the drawn slice is the computed bubble fraction", () => {
    const st = columnState(inputs("sand"), 0.15, 1);
    const H = st.H!, Dt = 1;
    let sum = 0, n = 0;
    for (let t = 0; t < 200; t += 0.05) {
      sum += voidsAt(st, t).reduce((s, v) => s + Math.PI * v.r * v.r, 0) / (Dt * H);
      n++;
    }
    expect(rel(sum / n, st.bubbleBed!.deltaMean)).toBeLessThan(0.05);
  });

  it("dots leave only above the terminal velocity, and the column then empties", () => {
    const sand = spec("sand");
    const ut = terminalVelocity({ d: sand.d_um * 1e-6, rhoP: sand.rhoP }, gas).u;
    const below = columnState(inputs("sand"), 0.95 * ut, 1);
    expect(below.carriedOut).toBe(false);
    for (const t of [0, 1, 5]) expect(labFrame(below, t).flying).toHaveLength(0);
    expect(nextInventory(1, 5, 0.95 * ut, ut)).toBe(1);
    const above = columnState(inputs("sand"), 1.2 * ut, 1);
    expect(above.carriedOut).toBe(true);
    const f = labFrame(above, 2);
    expect(f.flying.length).toBeGreaterThan(0);
    expect(Math.min(...f.flying.map((d) => d.y))).toBeGreaterThanOrEqual(f.bedTop ?? 0);
    //  the column empties, and the instruments follow what remains
    let inv = 1;
    for (let k = 0; k < 1000 && inv > 0; k++) inv = nextInventory(inv, 0.05, 1.2 * ut, ut);
    expect(inv).toBe(0);
    const empty = columnState(inputs("sand"), 1.2 * ut, 0);
    expect(empty.phase).toBe("empty");
    expect(empty.dP).toBe(0);
    expect(labFrame(empty, 3).dots).toHaveLength(0);
    const half = columnState(inputs("sand"), 0.15, 0.5);
    expect(half.dP).toBe(bedPressureDrop(0.15, half.p, gas, sand.eps, 0.5, half.mf.u));
  });

  it("the pressure drop is the page's, called", () => {
    for (const u of [0.01, 0.04, 0.3]) {
      const st = columnState(inputs("sand"), u, 1);
      expect(st.dP).toBe(bedPressureDrop(u, st.p, gas, spec("sand").eps, 1, st.mf.u));
      expect(st.regime).toBe(regimeMap(st.p, gas, spec("sand").eps, 0, u).at);
    }
  });

  it("reduced motion gives still frames with the same numbers", () => {
    for (const u of [0.15, 0.006]) {
      const st = columnState(inputs(u > 0.1 ? "sand" : "catalyst"), u, 1);
      const a = labFrame(st, 0.7, true), b = labFrame(st, 9.1, true);
      expect(b).toEqual(a);
      expect(a.bedTop).toBe(st.H);
    }
  });

  it("a cohesive group C column is drawn packed at every velocity, with the page's sentence", () => {
    for (const u of [1e-4, 0.002, 0.05]) {
      const st = columnState(inputs("fine"), u, 1);
      expect(st.phase).toBe("cohesive");
      expect(st.H).toBe(1);
      expect(labFrame(st, 0).dots).toEqual(labFrame(st, 4).dots);
      expect(labFrame(st, 4).flying).toHaveLength(0);
      expect(st.notes.join(" ")).toMatch(/Cohesive/);
    }
  });

  it("beyond bubbling no voids are drawn and the height is flagged", () => {
    const st = columnState(inputs("grain"), 5, 1);
    expect(st.regime).toBe("turbulent");
    expect(st.phase).toBe("beyond");
    const f = labFrame(st, 1);
    expect(f.voids).toHaveLength(0);
    expect(f.bedTopDashed).toBe(true);
    expect(st.notes.join(" ")).toMatch(/outside its regime/);
  });
});

describe("the notebook: predict, then reveal", () => {
  it("reveals nothing until a velocity is typed, then the difference against the page's", () => {
    expect(revealOf("", 0.05).ok).toBe(false);
    expect(revealOf("abc", 0.05).ok).toBe(false);
    expect(revealOf(-1, 0.05).ok).toBe(false);
    const r = revealOf("0.055", 0.05);
    expect(r.ok && r.diffPct).toBeCloseTo(10, 10);
  });
  it("marks a reading going up or coming down", () => {
    expect(directionOf(undefined, 0.1)).toBe("up");
    const prev = { col: 0, u: 0.1, dP: 1, H: 1, dir: "up" as const };
    expect(directionOf(prev, 0.2)).toBe("up");
    expect(directionOf(prev, 0.05)).toBe("down");
  });
});

describe("the page and the lesson point to the laboratory", () => {
  const wrap = (el: React.ReactElement): string => renderToStaticMarkup(createElement(MantineProvider, null, el));
  it("the page carries the button and says the dots are a drawing", () => {
    const html = wrap(createElement(FluidisedBedsTool));
    expect(html).toContain("Open the laboratory (new tab)");
    expect(html).toContain("not a simulation");
  });
  it("the lesson names the laboratory and what it is for", () => {
    expect(FLUID_STEPS.map((s) => s.body).join(" ")).toMatch(/laboratory/);
  });
  it("the tab refuses a URL that does not read, and lists what it does not show", () => {
    expect(NOT_SHOWN.join(" ")).toMatch(/hysteresis/);
    expect(NOT_SHOWN.join(" ")).toMatch(/mixed bed/);
    //  server rendering: no window, so the tab reads an empty search (the bare link)
    const html = wrap(createElement(FluidisationLabTab));
    expect(html).toContain("Fluidisation laboratory");
    expect(html).toContain("No particle is simulated");
  });
});
