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
  C299, second slice: the plain RESULT displays follow the Units menu's
  temperature and duty preferences.  With the default (K, kW) every string is
  the one the screen always printed; under (degC, MW) no kW / K literal is left
  on the surface and the numbers are converted (a temperature DIFFERENCE
  without the offset).  Rendered with the store mocked, as pinchUnits.test.ts.
\*---------------------------------------------------------------------------*/

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MantineProvider } from "@mantine/core";
import { ReactFlowProvider } from "@xyflow/react";

import { DEFAULT_PREFS } from "../src/state/displayUnits.js";
import { dTText, dutyFixed, dutyText, tFixed } from "../src/case/resultUnits.js";

const mock = vi.hoisted(() => ({ state: {} as Record<string, unknown>,
                                  plots: [] as Record<string, unknown>[] }));
vi.mock("../src/state/store.js", () => {
  const useStore = Object.assign(
    (sel: (s: unknown) => unknown) => sel(mock.state),
    { getState: () => mock.state, setState: () => undefined, subscribe: () => () => undefined });
  return { useStore };
});
//  Plotly itself is not run: the figure's PROPS (data, themed layout) are what
//  is read, through a stand-in for the library's React component.
vi.mock("plotly.js-basic-dist-min", () => ({ default: {} }));
vi.mock("react-plotly.js/factory", () => ({
  default: () => (props: Record<string, unknown>) => { mock.plots.push(props); return null; },
}));

import { fmtScalar } from "../src/ui/UnitNode.js";
import { KpisSection } from "../src/ui/PropertyPanel.js";
import { RunSummaryStrip } from "../src/ui/RunSummaryStrip.js";
import { EnergyBody, UtilitiesBody } from "../src/ui/ReportsWorkspace.js";
import { StreamsSummary } from "../src/ui/StreamsSummary.js";
import { Detail } from "../src/ui/StreamsWorkspace.js";
import { heatExchangerDatasheetHtml } from "../src/ui/HeatExchangerDatasheet.js";
import { columnDatasheetHtml } from "../src/ui/ColumnDatasheet.js";
import { StreamTerminal } from "../src/ui/StreamTerminal.js";
import { FirstLawPlot } from "../src/ui/plotting/FirstLawPlot.js";
import { EnergyBalancePlot } from "../src/ui/plotting/EnergyBalancePlot.js";

const SI = { ...DEFAULT_PREFS, temperature: "degC", duty: "MW" } as typeof DEFAULT_PREFS;
const wrap = (el: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(MantineProvider, null, el));
/** the text of the markup, tags and React's text-node separators removed */
const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

const GB = {
  H_feeds_kW: -8099.4, Q_boundary_kW: 1200, H_products_kW: -6899.0, residual_kW: 0.4,
  Q_heat_kW: 1500, W_shaft_kW: -300,
  residual_pct: 0.0333, residual_pct_available: true, residual_basis: "the energy exchanged",
  residual_denom_kW: 1200, n_gap: 0, n_feeds: 1, n_products: 1, datum: "elements",
} as never;

describe("resultUnits helpers", () => {
  it("default keeps toFixed; MW goes to significant figures", () => {
    expect(dutyFixed(1234.567, 1)).toBe("1234.6");
    expect(dutyText(1234.567, 1)).toBe("1234.6 kW");
    expect(dutyText(1234.567, 1, SI)).toBe("1.235 MW");
    expect(dutyText(NaN, 1, SI)).toBe("— MW");
  });
  it("a temperature difference takes no offset; an absolute one does", () => {
    expect(dTText(8.5, 1)).toBe("8.5 K");
    expect(dTText(8.5, 1, SI)).toBe("8.5 °C");
    expect(tFixed(311.66, 2, SI)).toBe("38.51");
  });
});

describe("node card: a duty stored in W", () => {
  it("default: kW as before; MW under the menu", () => {
    expect(fmtScalar(250000, "W", DEFAULT_PREFS)).toBe("250.0 kW");
    expect(fmtScalar(250000, "W", SI)).toBe("0.25 MW");
  });
});

describe("Properties panel: Latest results", () => {
  const kpis = { Q_kW: 1234.5, T: 350, V_over_F: 0.3 };
  beforeEach(() => { mock.state = { displayPrefs: { ...DEFAULT_PREFS } }; });
  it("default: kW and K labels and values as before", () => {
    const t = text(wrap(createElement(KpisSection, { kpis })));
    expect(t).toContain("Q (duty) [kW]");
    expect(t).toContain("1230");           // 3 significant figures
    expect(t).toContain("T [K]");
    expect(t).toContain("350");
  });
  it("°C + MW: labels and values follow, V/F untouched", () => {
    mock.state = { displayPrefs: SI };
    const t = text(wrap(createElement(KpisSection, { kpis })));
    expect(t).toContain("Q (duty) [MW]");
    expect(t).toContain("1.23");
    expect(t).toContain("T [°C]");
    expect(t).toContain("76.9");           // 350 K = 76.85 degC
    expect(t).not.toContain("[kW]");
    expect(t).not.toContain("[K]");
  });
});

describe("Run summary strip: the energy residual", () => {
  const run = { status: "done", log: "", streams: [], globalEnergyBoundary: GB } as never;
  beforeEach(() => {
    mock.state = { runResult: run, runStatus: "done", displayPrefs: { ...DEFAULT_PREFS },
                   setActiveWorkspace: () => undefined };
  });
  it("default: residual 0.4 kW (0.0333 %)", () => {
    const t = text(wrap(createElement(RunSummaryStrip)));
    expect(t).toContain("residual 0.4 kW (0.0333 %)");
  });
  it("MW: the residual converts, the percent does not", () => {
    mock.state = { ...mock.state, displayPrefs: SI };
    const t = text(wrap(createElement(RunSummaryStrip)));
    expect(t).toContain("residual 0.0004 MW (0.0333 %)");
    expect(t).not.toContain(" kW");
  });
});

describe("Reports: first-law table and utilities", () => {
  beforeEach(() => { mock.state = { displayPrefs: { ...DEFAULT_PREFS } }; });
  it("default: the table prints the kW it always did", () => {
    const t = text(wrap(createElement(EnergyBody, { gb: GB })));
    expect(t).toContain("-8099.4 kW");
    expect(t).toContain("1200.0 kW");
    expect(t).toContain("0.400 kW");
  });
  it("MW: every figure converts; the percent stays a percent", () => {
    mock.state = { displayPrefs: SI };
    const t = text(wrap(createElement(EnergyBody, { gb: GB })));
    expect(t).toContain("-8.099 MW");
    expect(t).toContain("1.2 MW");
    expect(t).toContain("0.0004 MW");
    expect(t).toContain("0.0333");
    expect(t).not.toMatch(/\bkW\b/);
  });
  it("no scale for a percent: the sentence names the picked unit", () => {
    mock.state = { displayPrefs: SI };
    const t = text(wrap(createElement(EnergyBody,
      { gb: { ...(GB as object), residual_pct: null, residual_pct_available: false } as never })));
    expect(t).toContain("the MW above is the whole of what is known");
  });
  const rows = [{ utility: "steamLP", tier: "heating", duty_kW: 2500, kg_s: 1, MW: 2.5, eur_h: 10 }] as never;
  it("utilities: the duty column header and value follow", () => {
    const d = text(wrap(createElement(UtilitiesBody, { rows, economics: undefined })));
    expect(d).toContain("duty (kW)");
    expect(d).toContain("2500.0");
    mock.state = { displayPrefs: SI };
    const m = text(wrap(createElement(UtilitiesBody, { rows, economics: undefined })));
    expect(m).toContain("duty (MW)");
    expect(m).toContain("steamLP heating 2.5 ");
  });
});

describe("Streams tab: summary band and stream detail", () => {
  const result = {
    status: "done", log: "", streams: [],
    globalEnergyBoundary: GB,
    kpis: { col: { Q_reboiler_kW: 4000, Q_condenser_kW: -3900 } },
  } as never;
  beforeEach(() => { mock.state = { displayPrefs: { ...DEFAULT_PREFS } }; });
  it("default and MW", () => {
    const d = text(wrap(createElement(StreamsSummary, { result, flow: "kmol/h" })));
    expect(d).toContain("1200.0");
    expect(d).toContain("4000.0 kW");
    mock.state = { displayPrefs: SI };
    const m = text(wrap(createElement(StreamsSummary, { result, flow: "kmol/h" })));
    expect(m).toContain("col 4 MW");
    expect(m).toContain("boundary Q +1.2 MW");
    expect(m).not.toMatch(/\bkW\b/);
  });
  const stream = { name: "s1", role: "product", T: 300, P: 1e5, F: 0.001, H: -2e5, H_kW: 1234.5,
                   composition: { A: 1 }, vf: 0 } as never;
  it("the Energy table's Ḣ row", () => {
    mock.state = { displayPrefs: { ...DEFAULT_PREFS }, caseFiles: {}, runResult: { streams: [], componentMolarMass: {} } };
    const d = text(wrap(createElement(Detail, { name: "s1", stream })));
    expect(d).toContain("Ḣ (kW)");
    expect(d).toContain("1234.50");
    mock.state = { ...mock.state, displayPrefs: SI };
    const m = text(wrap(createElement(Detail, { name: "s1", stream })));
    expect(m).toContain("Ḣ (MW)");
    expect(m).toContain("1.2345");
  });
});

describe("datasheets", () => {
  const hx = { name: "heater", type: "heatExchanger", inputs: ["a", "b"], outputs: ["c", "d"],
               operation: {} } as never;
  const rating = { U: 600, area: 0.1, LMTD: 8.5, Q_kW: 400 };
  it("heat exchanger: duty and LMTD", () => {
    const d = text(heatExchangerDatasheetHtml(hx, rating, [], undefined)!);
    expect(d).toContain("400.0 kW");
    expect(d).toContain("8.5 K");
    const m = text(heatExchangerDatasheetHtml(hx, rating, [], undefined, SI)!);
    expect(m).toContain("0.4 MW");
    expect(m).toContain("8.5 °C");
    expect(m).not.toContain("400.0 kW");
  });
  const col = { name: "C1", type: "distillationColumn", inputs: ["f"], outputs: ["d", "b"],
                operation: {} } as never;
  const k = { Q_condenser_kW: -3900, Q_reboiler_kW: 4000, nTrays: 20 };
  it("column: condenser / reboiler duty", () => {
    const d = text(columnDatasheetHtml(col, k, undefined));
    expect(d).toContain("-3900.0 / 4000.0 kW");
    const m = text(columnDatasheetHtml(col, k, undefined, SI));
    expect(m).toContain("-3.9 / 4 MW");
  });
});

describe("plots: every printed number follows; the geometry stays in kW", () => {
  const lastPlot = () => mock.plots[mock.plots.length - 1]!;
  it("first law: default prints kW, MW rescales traces, window and text", () => {
    mock.plots.length = 0;
    wrap(createElement(FirstLawPlot, { boundary: GB }));
    const d = lastPlot();
    const dText = JSON.stringify(d);
    expect(dText).toContain(" kW");
    mock.plots.length = 0;
    wrap(createElement(FirstLawPlot, { boundary: GB, duty: "MW" }));
    const m = lastPlot();
    const mText = JSON.stringify(m);
    expect(mText).not.toContain(" kW");
    expect(mText).toContain(" MW");
    const dr = (d.layout as { yaxis: { range: number[] } }).yaxis.range;
    const mr = (m.layout as { yaxis: { range: number[] } }).yaxis.range;
    expect(mr[0]).toBeCloseTo(dr[0]! / 1000, 9);
    expect(mr[1]).toBeCloseTo(dr[1]! / 1000, 9);
  });
  it("energy balance: default kW, MW in title, labels and hover", () => {
    const streams = [
      { name: "in", role: "feed", F: 1, H: -1e5, H_kW: -2000, composition: {} },
      { name: "out", role: "product", F: 1, H: -1e5, H_kW: -1800, composition: {} },
    ] as never;
    mock.plots.length = 0;
    wrap(createElement(EnergyBalancePlot, { streams, added: { qBoundaryKw: 200 } }));
    const d = JSON.stringify(lastPlot());
    expect(d).toContain("plant boundary (kW)");
    expect(d).toContain("-2000 kW");
    mock.plots.length = 0;
    wrap(createElement(EnergyBalancePlot, { streams, added: { qBoundaryKw: 200 }, duty: "MW" }));
    const m = JSON.stringify(lastPlot());
    expect(m).toContain("plant boundary (MW)");
    expect(m).toContain("-2 MW");
    expect(m).not.toMatch(/\bkW\b/);
  });
});

describe("canvas: the duty stub", () => {
  const data = { name: "Q1", role: "duty", dutyPort: "Q", tier: "heating", dutyKW: 2500.04 };
  const stub = () => text(wrap(createElement(ReactFlowProvider, null,
    createElement(StreamTerminal, { data, selected: false } as never))));
  it("default: kW; MW under the menu", () => {
    mock.state = { displayPrefs: { ...DEFAULT_PREFS } };
    expect(stub()).toContain("Q = +2500.0 kW");
    mock.state = { displayPrefs: SI };
    expect(stub()).toContain("Q = +2.5 MW");
  });
});
