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
  C299: the Units menu reaches the Pinch page.  A duty unit exists
  (displayUnits.ts), temperature differences convert WITHOUT the offset, and
  every printed number / label of the page follows temperature + duty.  The
  default (K, kW) must print exactly what the page printed before.
\*---------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";

import {
  DEFAULT_PREFS, DUTY_UNITS, cpLabel, cpToDisplay, dKToDisplay, formatDuty,
  kWToDisplay,
} from "../src/state/displayUnits.js";
import { pinchUnits, pinchStatusLine } from "../src/case/pinchUnits.js";
import { PinchView } from "../src/ui/PinchView.js";
import { PinchGridPlot } from "../src/ui/plotting/PinchGridPlot.js";
import { pinchFromEngine } from "../src/case/pinch.js";

// react-dom/server renders from the store's INITIAL state, so the page is
// driven through a stand-in for the hook that reads a mutable state object.
const mock = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock("../src/state/store.js", () => {
  const useStore = Object.assign(
    (sel: (s: unknown) => unknown) => sel(mock.state),
    { getState: () => mock.state, setState: () => undefined, subscribe: () => () => undefined });
  return { useStore };
});

describe("duty unit", () => {
  it("default is kW and the list is the five of the menu", () => {
    expect(DEFAULT_PREFS.duty).toBe("kW");
    expect(DUTY_UNITS).toEqual(["kW", "MW", "kJ/h", "GJ/h", "kcal/h"]);
  });
  it("converts kW to each unit", () => {
    expect(kWToDisplay(1000, "kW")).toBe(1000);
    expect(kWToDisplay(1000, "MW")).toBeCloseTo(1, 12);
    expect(kWToDisplay(1, "kJ/h")).toBe(3600);
    expect(kWToDisplay(1000, "GJ/h")).toBeCloseTo(3.6, 12);
    expect(kWToDisplay(1, "kcal/h")).toBeCloseTo(860.4206, 3);
    expect(formatDuty(2500, "MW")).toBe("2.5");
    expect(formatDuty(NaN, "MW")).toBe("—");
  });
  it("a temperature difference takes no offset; CP is duty per difference", () => {
    expect(dKToDisplay(20, "degC")).toBe(20);
    expect(dKToDisplay(20, "K")).toBe(20);
    expect(cpToDisplay(10, "MW", "degC")).toBeCloseTo(0.01, 12);
    expect(cpLabel("MW", "degC")).toBe("MW/°C");
    expect(cpLabel("kW", "K")).toBe("kW/K");
  });
});

describe("pinchUnits", () => {
  const def = pinchUnits(DEFAULT_PREFS);
  const si = pinchUnits({ temperature: "degC", duty: "MW" });
  it("default: three significant figures (C304; the old literals were 95454 / 95454.3 / 311.66)", () => {
    expect(def.tLabel).toBe("K");
    expect(def.Q(95454.3)).toBe("95500");
    expect(def.Q(95454.3, 1)).toBe("95500");   // the decimals argument is ignored
    expect(def.T(311.66, 2)).toBe("312");
    expect(def.dT(20)).toBe("20");
  });
  it("°C + MW", () => {
    expect(si.tLabel).toBe("°C");
    expect(si.qLabel).toBe("MW");
    expect(si.T(311.66, 2)).toBe("38.5");         // offset applied to a temperature
    expect(si.dT(20)).toBe("20");                 // ... not to a difference
    expect(si.Q(95454.3, 1)).toBe("95.5");        // the same 3 significant figures
    expect(si.CP(331, 3)).toBe("0.331");
    expect(si.cpLabel).toBe("MW/°C");
  });
  it("status line follows both prefs and the significant figures", () => {
    const p = { streams: [1, 2], dTmin: 20, QhMin: 0, QcMin: 95454.3, pinchShift: 829.64 };
    expect(pinchStatusLine(p, def)).toBe(
      "2 process streams in the engine's population (reports/pinch/population.csv) "
      + "· ΔTmin 20 K · targets 0 kW hot / 95500 kW cold · pinch T* 830 K.");
    const s = pinchStatusLine(p, si);
    expect(s).toContain("ΔTmin 20 °C");
    expect(s).toContain("0 MW hot / 95.5 MW cold");
    expect(s).toContain("pinch T* 556 °C");
    expect(s).not.toMatch(/\bkW\b|\d K\b/);
  });
});

// ---- the page itself, rendered under a non-default setting ------------------

const POP = [
  "unit,kpi,role,side,T_in_K,T_out_K,Q_kW,CP_kW_K,reason",
  "hotA,Q,segment,hot,500,400,-1000,10,",
  "coldB,Q,segment,cold,300,450,1500,10,",
].join("\n");
const TABLE = [
  "interval,T_star_hi_K,T_star_lo_K,cpHot,cpCold,dH_kW,cascade_in_kW,cascade_out_kW,corrected_in_kW,corrected_out_kW,tag,hot_streams,cold_streams",
  "1,490,440,10,0,500,0,500,500,1000,,hotA,",
  "2,440,310,0,10,-1300,500,-800,1000,-300,pinch,,coldB",
].join("\n");
const CURVES = [
  "curve,T_K,H_kW",
  "hot,400,0", "hot,500,1000",
  "cold,300,0", "cold,450,1500",
].join("\n");
const SUMMARY = ["key,value", "class,interiorPinch", "n_pinches,1", "pinch_T_star_K,440",
  "H_pinch_kW,500"].join("\n");

const run = {
  status: "done", log: "", streams: [],
  kpis: { pinch: { Q_H_min_kW: 500, Q_C_min_kW: 0, Q_recovery_max_kW: 1000,
    T_pinch_K: 440, T_pinch_hot_K: 450, T_pinch_cold_K: 430, dTmin_K: 20,
    Q_heat_current_kW: 1500, Q_cool_current_kW: 1000 } },
  csvFiles: {
    "reports/pinch/population.csv": POP,
    "reports/pinch/problemTable.csv": TABLE,
    "reports/pinch/compositeCurves.csv": CURVES,
    "reports/pinch/summary.csv": SUMMARY,
  },
} as never;

function page(): string {
  return renderToStaticMarkup(createElement(MantineProvider, null, createElement(PinchView)));
}

describe("Pinch page under the Units menu", () => {
  beforeEach(() => {
    mock.state = { runResult: run, displayPrefs: { ...DEFAULT_PREFS }, setDisplayPrefs: () => undefined };
  });
  it("default (K, kW): the literals the page always had", () => {
    const h = page();
    expect(h).toContain("targets 500 kW hot / 0 kW cold");
    expect(h).toContain("ΔTmin 20 K");
    expect(h).toContain("pinch T* 440 K");
    expect(h).toContain("heat flow rate (kW)");
    expect(h).toContain("T (K)");
    expect(h).toContain("T_in (K)");
    expect(h).toContain("|Q| (kW)");
  });
  it("°C + MW: no K or kW left on the page, numbers converted", () => {
    mock.state = { ...mock.state, displayPrefs: { ...DEFAULT_PREFS, temperature: "degC", duty: "MW" } };
    const h = page();
    expect(h).toContain("targets 0.5 MW hot / 0 MW cold");
    expect(h).toContain("ΔTmin 20 °C");
    expect(h).toContain("pinch T* 167 °C");          // 440 K - 273.15 = 166.85, 3 s.f.
    expect(h).toContain("heat flow rate (MW)");
    expect(h).toContain("T (°C)");
    expect(h).toContain("T_in (°C)");
    expect(h).toContain("|Q| (MW)");
    expect(h).toContain("MW/°C");
    expect(h).toContain("Q_H,min 0.5 MW (hot utility)");
    expect(h).toContain("227");                       // hotA T_in 500 K in °C, 3 s.f.
    expect(h).not.toMatch(/\d kW\b|\(kW\)|kW\/K/);
    // (lesson prose below the figure is not a result display and still says K)
    for (const lit of ["T (K)", "T_in (K)", "T_out (K)", "shifted T* (K)", "ΔTmin 20 K", "440.0 K"])
      expect(h).not.toContain(lit);
  });
  it("grid view: axis, stream ends, duties and tooltips in °C and MW", () => {
    mock.state = { runResult: run, displayPrefs: { ...DEFAULT_PREFS, temperature: "degC", duty: "MW" },
      setDisplayPrefs: () => undefined };
    const g = renderToStaticMarkup(createElement(PinchGridPlot,
      { pinch: pinchFromEngine(run)!, paretoPct: 0 }));
    expect(g).toContain("ΔT<sub>min</sub> = 20 °C");
    expect(g).toContain("shifted temperature T* (°C)");
    expect(g).toContain("1 MW");                        // hotA duty 1000 kW
    expect(g).toContain("227 °C");                      // tooltip: hotA Ts = 500 K, 3 s.f.
    expect(g).toContain("CP ≈ 0.01 MW/°C");
    expect(g).toContain("hot utility");
    expect(g).not.toMatch(/\d kW\b|kW\/K|\d K\b/);
  });
});
