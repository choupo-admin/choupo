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

/* The lin/log axis toggle (C486): the rule, the axis collection, and the
 * <Plot> wrapper that carries the toggle and flips the Plotly axis type. */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi } from "vitest";
import {
  axisScaleDecision, collectAxes, effectiveTypes, applyAxisTypes,
} from "../src/ui/plotting/axisScale.js";

const base = { declaredLog: false, name: "y" };

describe("axisScaleDecision (C486)", () => {
  it("all positive -> enabled", () => {
    expect(axisScaleDecision({ ...base, values: [1, 2e-9, 3e6] })).toEqual({ show: true, enabled: true });
  });
  it("a zero -> disabled, with the reason naming the axis", () => {
    const d = axisScaleDecision({ ...base, values: [1, 0, 2] });
    expect(d.show).toBe(true);
    expect(d.enabled).toBe(false);
    expect(d.reason).toMatch(/values <= 0 on the y axis/);
  });
  it("a negative -> disabled with reason", () => {
    const d = axisScaleDecision({ ...base, values: [3, -0.1] });
    expect(d.enabled).toBe(false);
    expect(d.reason).toBeTruthy();
  });
  it("declared log -> no toggle at all", () => {
    expect(axisScaleDecision({ ...base, values: [1, 2], declaredLog: true })).toEqual({ show: false, enabled: false });
  });
  it("NaN, null, undefined and strings are ignored, not counted as <= 0", () => {
    expect(axisScaleDecision({ ...base, values: [NaN, null, undefined, "a", 2, 5, Infinity] }).enabled).toBe(true);
  });
  it("no numeric value -> no toggle", () => {
    expect(axisScaleDecision({ ...base, values: [NaN, undefined] }).show).toBe(false);
  });
  it("a window starting at <= 0 disables; a window above 0 judges only what is inside", () => {
    expect(axisScaleDecision({ ...base, values: [1, 2], window: [0, 5] }).enabled).toBe(false);
    expect(axisScaleDecision({ ...base, values: [1, 2], rangeMode: "tozero" }).enabled).toBe(false);
    expect(axisScaleDecision({ ...base, values: [-1, 2, 3], window: [1, 5] }).enabled).toBe(true);
  });
  it("an error bar reaching <= 0 disables", () => {
    const d = axisScaleDecision({ ...base, values: [1, 2], errorLows: [0.5, -0.2] });
    expect(d.enabled).toBe(false);
    expect(d.reason).toMatch(/error bars/);
  });
});

describe("collectAxes", () => {
  it("judges the right axis on its own traces only", () => {
    const data = [
      { type: "scatter", x: [1, 2, 3], y: [1, 2, 3] },
      { type: "scatter", x: [1, 2, 3], y: [-1, 0, 1], yaxis: "y2" },
    ];
    const ax = Object.fromEntries(collectAxes({}, data).map((a) => [a.key, a]));
    expect(ax.xaxis!.enabled).toBe(true);
    expect(ax.yaxis!.enabled).toBe(true);
    expect(ax.yaxis2!.enabled).toBe(false);
    expect(ax.yaxis2!.name).toBe("right y");
  });
  it("a declared-log axis gets no toggle, the other axis does", () => {
    const axes = collectAxes({ yaxis: { type: "log" } }, [{ x: [1, 2], y: [1, 2] }]);
    expect(axes.map((a) => a.key)).toEqual(["xaxis"]);
  });
  it("error bars count (value - error <= 0)", () => {
    const data = [{ x: [1, 2], y: [1, 2], error_y: { type: "data", array: [0.5, 2], visible: true } }];
    expect(collectAxes({}, data).find((a) => a.key === "yaxis")!.enabled).toBe(false);
  });
  it("skips axes with strings or other trace types; invisible traces are not counted", () => {
    expect(collectAxes({}, [{ type: "heatmap", x: [1], y: [1], z: [[1]] }])).toEqual([]);
    expect(collectAxes({}, [{ x: ["a", "b"], y: [1, 2] }]).map((a) => a.key)).toEqual(["yaxis"]);
    expect(collectAxes({}, [{ x: [1], y: [-1], visible: false }, { x: [1], y: [2] }])
      .find((a) => a.key === "yaxis")!.enabled).toBe(true);
  });
});

describe("applyAxisTypes / effectiveTypes", () => {
  it("only type changes; a window is converted to decades", () => {
    const layout = { yaxis: { title: "y", range: [1, 100] }, xaxis: { type: "linear" } };
    const out = applyAxisTypes(layout, { yaxis: "log" });
    expect(out.yaxis.type).toBe("log");
    expect(out.yaxis.range).toEqual([0, 2]);
    expect(out.yaxis.title).toBe("y");
    expect(out.xaxis).toBe(layout.xaxis);
    expect(layout.yaxis).not.toHaveProperty("type");
  });
  it("a log choice on an axis that has become disabled falls back to linear", () => {
    const axes = collectAxes({}, [{ x: [1, 2], y: [0, 1] }]);
    expect(effectiveTypes(axes, { yaxis: "log" })).toEqual({});
  });
});

// The component: <Plot> is called as a function with useState driven by hand,
// so a click (the toggle's onToggle) is a real state change and a re-call.
const hooks = vi.hoisted(() => ({ state: undefined as any }));
vi.mock("react", async (orig) => {
  const R: any = await orig();
  return {
    ...R,
    useState: (init: any) => {
      if (hooks.state === undefined) hooks.state = init;
      return [hooks.state, (u: any) => { hooks.state = typeof u === "function" ? u(hooks.state) : u; }];
    },
  };
});
vi.mock("@mantine/core", () => ({ useComputedColorScheme: () => "light" }));
vi.mock("plotly.js-basic-dist-min", () => ({ default: {} }));
vi.mock("react-plotly.js/factory", () => ({ default: () => "RawPlot" }));

describe("<Plot> carries the toggle", () => {
  it("renders one toggle per axis and flips the Plotly axis type linear <-> log", async () => {
    const { Plot } = await import("../src/ui/plotting/plotly.js");
    hooks.state = undefined;
    const props = { data: [{ type: "scatter", x: [1, 2, 3], y: [1, 10, 100] }], layout: { yaxis: { title: "q" } } };
    const yType = (el: any) => el.props.children[0].props.layout.yaxis.type;
    let el: any = Plot(props);
    expect(el.type).toBe("div");
    expect(el.props.children[1].props.axes.map((a: any) => a.key)).toEqual(["xaxis", "yaxis"]);
    expect(yType(el)).not.toBe("log");
    el.props.children[1].props.onToggle("yaxis");
    el = Plot(props);
    expect(yType(el)).toBe("log");
    expect(el.props.children[0].props.layout.xaxis?.type).not.toBe("log");
    el.props.children[1].props.onToggle("yaxis");
    el = Plot(props);
    expect(yType(el)).not.toBe("log");
  });
  it("draws no toggle on a figure with no covered axis", async () => {
    const { Plot } = await import("../src/ui/plotting/plotly.js");
    hooks.state = undefined;
    const el: any = Plot({ data: [{ type: "heatmap", z: [[1]] }], layout: {} });
    expect(el.type).not.toBe("div");
  });
});
