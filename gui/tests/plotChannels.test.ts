/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
// No two series of one figure told apart by colour alone (DEV.md 4c C168
// slice 2, ruling (d); the audit's AC8: NanoFiltran's Fig. 3 drew Na+, Mg2+
// and Cl- as three solid lines and three open squares differing in colour
// only).
import { describe, expect, it } from "vitest";

import { withSecondChannel } from "../src/case/plotChannels.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
const look = (t: any) => `${t.mode}|${t.marker?.symbol ?? "circle"}|${t.line?.dash ?? "solid"}`;

describe("withSecondChannel", () => {
  it("gives lines that differ only by colour a dash each, the first kept solid", () => {
    const d = ["Na+", "Mg2+", "Cl-"].map((n) => ({ type: "scatter", mode: "lines", name: n, line: { color: n } }));
    const o = withSecondChannel(d);
    expect(new Set(o.map(look)).size).toBe(3);
    expect(o[0].line.dash).toBeUndefined();
    expect(o[0].line.color).toBe("Na+");
  });

  it("gives markers a shape each and KEEPS their fill (open stays open)", () => {
    const d = ["Na+", "Mg2+", "Cl-"].map((n) => ({ type: "scatter", mode: "markers", name: n,
      marker: { symbol: "square-open", color: n } }));
    const o = withSecondChannel(d);
    expect(new Set(o.map(look)).size).toBe(3);
    for (const t of o) expect(String(t.marker.symbol)).toMatch(/-open$/);
  });

  it("never overwrites a declared dash, and never assigns one the figure already uses", () => {
    const d: any[] = [
      { type: "scatter", mode: "lines", name: "NanoFiltran", line: { dash: "dash" } },
      { type: "scatter", mode: "lines", name: "a" },
      { type: "scatter", mode: "lines", name: "b" },
    ];
    const o = withSecondChannel(d);
    expect(o[0].line.dash).toBe("dash");
    expect(o[1].line?.dash).toBeUndefined();
    expect(o[2].line.dash).toBeDefined();
    expect(o[2].line.dash).not.toBe("dash");
  });

  it("lines sharing a DECLARED dash keep it and gain a sparse marker shape each", () => {
    const d = ["Na+", "Mg2+", "Cl-"].map((n) => ({ type: "scatter", mode: "lines", name: n,
      line: { dash: "solid", color: n } }));
    const o = withSecondChannel(d);
    for (const t of o) expect(t.line.dash).toBe("solid");
    expect(o[0].mode).toBe("lines");
    expect(o[1].mode).toBe("lines+markers");
    expect(o[1].marker.maxdisplayed).toBeGreaterThan(0);
    expect(o[1].marker.symbol).not.toBe(o[2].marker.symbol);
  });

  it("reads an INVISIBLE marker as no marker, and makes the one it adds visible", () => {
    //  NanoFiltran's rejection figure: three solid lines whose open markers
    //  are drawn in rgba(0,0,0,0) -- the shapes differed and nobody saw them
    const d = ["Na", "Cl", "Mg"].map((n, i) => ({ type: "scatter", mode: "lines+markers", name: n,
      line: { dash: "solid", color: `c${i}` },
      marker: { color: "rgba(0, 0, 0, 0)", symbol: "circle-open", line: { color: `c${i}` } } }));
    const o = withSecondChannel(d);
    expect(o[1].marker.color).toBe("c1");
    expect(o[2].marker.color).toBe("c2");
    expect(o[1].marker.symbol).not.toBe(o[2].marker.symbol);
  });

  it("leaves a figure whose series already differ alone, and mutates nothing", () => {
    const d = [
      { type: "scatter", mode: "markers", name: "measured" },
      { type: "scatter", mode: "lines", name: "model" },
    ];
    const frozen = JSON.stringify(d);
    expect(withSecondChannel(d)).toEqual(d);
    expect(JSON.stringify(d)).toBe(frozen);
  });

  it("does not touch a non-series trace (a heatmap)", () => {
    const d = [{ type: "heatmap", z: [[1]] }, { type: "heatmap", z: [[2]] }];
    expect(withSecondChannel(d)).toEqual(d);
  });
});
