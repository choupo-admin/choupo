/*---------------------------------------------------------------------------*\
  Colour by a published field (case/streamColouring.ts, DEV.md 4c C114) --
  the rules the canvas paints by, held without React:

    * a field is OFFERED only when a stream publishes it (density is not, so
      it never appears; pH only where speciation publishes it);
    * a stream lacking the field is NO DATA, never a zero;
    * per-component values come from the ONE shared conversion
      (computePerStream), so mass fractions and flows match the Streams table;
    * log scale: positive values only, a published zero is "below range";
    * the diverging unit map is centred at zero (heating red, cooling blue);
    * a threshold dims what lies outside -- and what has no data;
    * "follow a molecule": width = its own flow, with a stated floor.
\*---------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";

import type { StreamResult } from "../src/adapters/SolverAdapter.js";
import { computePerStream } from "../src/case/streamComposition.js";
import {
  activeFieldKey, autoRange, availableFields, availableUnitKpis, colourOfValue,
  colourUnits, divergingColour, fieldDisplay, fieldLabel, followFields, followWidth,
  insideThreshold, parseFieldKey, probeRows, resolveScale, scalePosition, scaleTicks,
  streamFieldValue, BELOW_RANGE_COLOUR, FOLLOW_ABSENT_PX, FOLLOW_FLOOR_PX,
  FOLLOW_SPAN_PX, NO_DATA_COLOUR,
} from "../src/case/streamColouring.js";
import { streamLegend, unitLegend } from "../src/case/colourLegend.js";
import { gradientColor } from "../src/ui/plotting/palette.js";
import { DEFAULT_PREFS } from "../src/state/displayUnits.js";

const MW = { NH3: 17.031, H2: 2.016, N2: 28.014 };

const feed: StreamResult = {
  name: "syngas", role: "feed", F: 1, T: 300, P: 2e6, vf: 1,
  F_mass: 0.75 * 2.016 + 0.25 * 28.014, H_kW: -5,
  composition: { H2: 0.75, N2: 0.25, NH3: 0 },
};
const product: StreamResult = {
  name: "ammonia", role: "product", F: 0.2, T: 250, P: 1.5e6, vf: 0,
  F_mass: 0.2 * 17.031, H: -70000,
  composition: { H2: 0, N2: 0, NH3: 1 },
};
//  A brine with speciation: the only stream that publishes a pH.
const brine: StreamResult = {
  name: "brine", role: "intermediate", F: 0.5, T: 320, P: 1e5, vf: 0,
  composition: { NH3: 0.01, H2: 0, N2: 0 },
  speciation: { network: "n", basis: "b", pH: 9.2, flows: {} },
};
//  An old/partial stream that does not list NH3 at all.
const silent: StreamResult = {
  name: "mystery", role: "intermediate", F: 0.1, T: 310, P: 1e5,
  composition: { water: 1 },
};

const streams = [feed, product, brine, silent];
const per = computePerStream(streams, MW);

describe("field availability -- only what the run publishes", () => {
  const keys = availableFields(streams, per).map((f) => f.key);
  it("offers the published scalars, pH because one stream speciates", () => {
    for (const k of ["T", "P", "vf", "F", "F_mass", "H_kW", "pH"]) expect(keys).toContain(k);
  });
  it("never offers density -- no stream publishes one", () => {
    expect(keys.some((k) => /rho|dens/i.test(k))).toBe(false);
  });
  it("offers per-component fields, the mass ones only where MW is known", () => {
    expect(keys).toContain("x:NH3");
    expect(keys).toContain("w:NH3");
    expect(keys).toContain("n:NH3");
    expect(keys).toContain("m:NH3");
    // water has no MW in the map: its mole fraction is published, its mass
    // fraction would be invented.
    expect(keys).toContain("x:water");
    expect(keys).not.toContain("w:water");
  });
  it("pH is not offered on a run with no speciation", () => {
    const k2 = availableFields([feed, product], computePerStream([feed, product], MW)).map((f) => f.key);
    expect(k2).not.toContain("pH");
  });
});

describe("values -- no data is never a zero", () => {
  it("a stream that does not list the component has NO DATA", () => {
    expect(streamFieldValue(silent, per["mystery"], "x:NH3")).toBeUndefined();
  });
  it("a listed component at zero IS a published zero", () => {
    expect(streamFieldValue(feed, per["syngas"], "x:NH3")).toBe(0);
  });
  it("pH only where speciation publishes it", () => {
    expect(streamFieldValue(brine, per["brine"], "pH")).toBe(9.2);
    expect(streamFieldValue(feed, per["syngas"], "pH")).toBeUndefined();
  });
  it("H_kW falls back to F*H (kmol/s x J/mol = kW), the engine's own pair", () => {
    expect(streamFieldValue(product, per["ammonia"], "H_kW")).toBeCloseTo(0.2 * -70000, 9);
    expect(streamFieldValue(silent, per["mystery"], "H_kW")).toBeUndefined();
  });
  it("mass fraction and component flows come from the shared conversion", () => {
    const w = streamFieldValue(feed, per["syngas"], "w:N2")!;
    expect(w).toBeCloseTo(0.25 * 28.014 / (0.75 * 2.016 + 0.25 * 28.014), 12);
    expect(w).toBeCloseTo(per["syngas"]!.massFrac["N2"]!, 15);
    expect(streamFieldValue(product, per["ammonia"], "n:NH3")).toBeCloseTo(0.2, 12);
    expect(streamFieldValue(product, per["ammonia"], "m:NH3")).toBeCloseTo(0.2 * 17.031, 12);
  });
  it("a stream with no colour field is drawn NO_DATA grey", () => {
    const rs = resolveScale([1, 2], "linear", null);
    expect(colourOfValue(undefined, rs, "turbo")).toBe(NO_DATA_COLOUR);
  });
});

describe("scale -- auto, fixed, log with zeros", () => {
  it("auto range spans the values given", () => {
    expect(autoRange([3, undefined, 1, 2], "linear")).toEqual({ min: 1, max: 3 });
  });
  it("a log auto range ignores non-positive values", () => {
    expect(autoRange([0, 1e-6, 0.5, -1], "log")).toEqual({ min: 1e-6, max: 0.5 });
  });
  it("on a log scale a zero is BELOW RANGE, not the bottom colour", () => {
    const rs = resolveScale([0, 1e-6, 0.5], "log", null)!;
    expect(scalePosition(0, rs)).toBe("below");
    expect(colourOfValue(0, rs, "turbo")).toBe(BELOW_RANGE_COLOUR);
    expect(colourOfValue(1e-6, rs, "turbo")).toBe(gradientColor(0, "turbo"));
    expect(colourOfValue(0.5, rs, "turbo")).toBe(gradientColor(1, "turbo"));
  });
  it("log position is linear in log10 (a decade per equal step)", () => {
    const rs = resolveScale([1e-4, 1], "log", null)!;
    expect(scalePosition(1e-2, rs)).toBeCloseTo(0.5, 12);
    expect(scaleTicks(rs)[1]).toBeCloseTo(1e-2, 12);   // geometric mid
  });
  it("a fixed range wins, and values outside take the end colours", () => {
    const rs = resolveScale([1, 2, 3], "linear", { min: 0, max: 10 })!;
    expect(rs.origin).toBe("fixed");
    expect(scalePosition(5, rs)).toBeCloseTo(0.5, 12);
    expect(scalePosition(50, rs)).toBe(1);
    expect(scalePosition(-5, rs)).toBe(0);
  });
  it("a fixed log range must be positive, else the auto range is used", () => {
    const rs = resolveScale([1e-3, 1], "log", { min: 0, max: 1 })!;
    expect(rs.origin).toBe("auto");
  });
  it("a degenerate range draws the mid colour", () => {
    const rs = resolveScale([370, 370], "linear", null)!;
    expect(rs.degenerate).toBe(true);
    expect(colourOfValue(370, rs, "turbo")).toBe(gradientColor(0.5, "turbo"));
  });
});

describe("diverging unit map -- centred at zero", () => {
  it("heating (+) is red, cooling (-) is blue, zero is the centre", () => {
    expect(divergingColour(0, 100)).toBe(gradientColor(0.5, "coolwarm"));
    expect(divergingColour(100, 100)).toBe(gradientColor(1, "coolwarm"));
    expect(divergingColour(-100, 100)).toBe(gradientColor(0, "coolwarm"));
    expect(divergingColour(-50, 100)).toBe(gradientColor(0.25, "coolwarm"));
  });
  it("units without the KPI are absent (drawn neutral), not zero", () => {
    const kpis = { H1: { Q_kW: 120, T_out: 400 }, C1: { Q_kW: -80 }, P1: { W_kW: 3 } };
    const uc = colourUnits(kpis, "Q_kW", "diverging", "turbo")!;
    expect(uc.colour.has("P1")).toBe(false);
    expect(uc.maxAbs).toBe(120);
    expect(uc.colour.get("H1")).toBe(gradientColor(1, "coolwarm"));
    expect(uc.colour.get("C1")).toBe(gradientColor(0.5 - 0.5 * 80 / 120, "coolwarm"));
  });
  it("KPIs are listed most-shared first", () => {
    const k = availableUnitKpis({ A: { Q_kW: 1, x: 2 }, B: { Q_kW: 3 } });
    expect(k[0]).toEqual({ key: "Q_kW", count: 2 });
  });
  it("the unit legend says it is centred at 0 and names units without it", () => {
    const uc = colourUnits({ H1: { Q_kW: 120 }, C1: { Q_kW: -80 } }, "Q_kW", "diverging", "turbo")!;
    const lg = unitLegend("Q_kW", uc, "turbo", null, true);
    expect(lg.qualifiers).toContain("centred at 0");
    expect(lg.ticks).toEqual(["-120", "0", "120"]);
    expect(lg.extras[0]!.label).toBe("no Q_kW");
  });
});

describe("threshold", () => {
  it("dims outside, keeps inside, and dims what has no data", () => {
    const th = { min: 0.1, max: Infinity };
    expect(insideThreshold(0.5, th)).toBe(true);
    expect(insideThreshold(0.01, th)).toBe(false);
    expect(insideThreshold(undefined, th)).toBe(false);
    expect(insideThreshold(undefined, null)).toBe(true);
  });
});

describe("follow a molecule", () => {
  it("width grows with the square root of its own flow, with a stated floor", () => {
    expect(followWidth(1, 1)).toBeCloseTo(FOLLOW_FLOOR_PX + FOLLOW_SPAN_PX, 12);
    expect(followWidth(0.25, 1)).toBeCloseTo(FOLLOW_FLOOR_PX + FOLLOW_SPAN_PX * 0.5, 12);
    // a trace at a millionth stays visible above the floor
    expect(followWidth(1e-6, 1)).toBeGreaterThanOrEqual(FOLLOW_FLOOR_PX);
    expect(followWidth(0, 1)).toBe(FOLLOW_ABSENT_PX);
    expect(followWidth(undefined, 1)).toBe(FOLLOW_ABSENT_PX);
  });
  it("follows the Units menu's basis", () => {
    expect(followFields("NH3", { ...DEFAULT_PREFS, flow: "kmol/h" }))
      .toEqual({ colour: "x:NH3", width: "n:NH3" });
    expect(followFields("NH3", { ...DEFAULT_PREFS, flow: "kg/h" }))
      .toEqual({ colour: "w:NH3", width: "m:NH3" });
  });
  it("the legend states the width rule and its floor", () => {
    const rs = resolveScale([0, 1], "linear", null);
    const lg = streamLegend({ field: "x:NH3", scale: rs, map: "turbo", prefs: DEFAULT_PREFS,
      anyNoData: true, anyBelow: false, threshold: null, follow: "NH3" });
    expect(lg.title).toBe("NH3 mole fraction");
    expect(lg.notes.join(" ")).toContain(`floor ${FOLLOW_FLOOR_PX} px`);
    expect(lg.extras.map((e) => e.label)).toContain("no data");
  });
});

describe("keys, labels, units", () => {
  it("parses scalar and component keys and refuses junk", () => {
    expect(parseFieldKey("T")).toEqual({ kind: "T" });
    expect(parseFieldKey("x:NH3")).toEqual({ kind: "x", component: "NH3" });
    expect(parseFieldKey("q:NH3")).toBeNull();
    expect(parseFieldKey("rho")).toBeNull();
    expect(fieldLabel("w:NH3")).toBe("NH3 mass fraction");
  });
  it("a pre-C114 persisted mode keeps its meaning", () => {
    expect(activeFieldKey({ colorMode: "temperature", colorField: "x:NH3" })).toBe("T");
    expect(activeFieldKey({ colorMode: "pressure", colorField: "T" })).toBe("P");
    expect(activeFieldKey({ colorMode: "phase", colorField: "T" })).toBeNull();
    expect(activeFieldKey({ colorMode: "field", colorField: "x:NH3" })).toBe("x:NH3");
  });
  it("the legend speaks the Units menu: temperature in degC, a log qualifier", () => {
    const prefs = { ...DEFAULT_PREFS, temperature: "degC" as const };
    expect(fieldDisplay("T", prefs).unit).toBe("°C");
    expect(fieldDisplay("T", prefs).toDisplay(300)).toBeCloseTo(26.85, 9);
    const rs = resolveScale([1e-3, 1], "log", null);
    const lg = streamLegend({ field: "x:NH3", scale: rs, map: "turbo", prefs,
      anyNoData: false, anyBelow: true, threshold: null, follow: null });
    expect(lg.qualifiers).toContain("log scale");
    expect(lg.extras.map((e) => e.colour)).toContain(BELOW_RANGE_COLOUR);
  });
  it("a molar flow under a mass-basis Units menu keeps its own basis", () => {
    expect(fieldDisplay("F", { ...DEFAULT_PREFS, flow: "kg/h" }).unit).toBe("kmol/h");
    expect(fieldDisplay("m:NH3", { ...DEFAULT_PREFS, flow: "kg/s" }).unit).toBe("kg/s");
  });
});

describe("probe -- every published field, in the reader's units", () => {
  it("lists the scalars the stream publishes and its components", () => {
    const rows = probeRows(feed, per["syngas"], DEFAULT_PREFS);
    const labels = rows.map((r) => r.label);
    expect(labels).toContain("Temperature");
    expect(labels).toContain("Vapour fraction");
    expect(labels).not.toContain("pH (speciation)");
    expect(labels).toContain("x H2");
    expect(rows.find((r) => r.label === "Pressure")!.value).toBe("20 bar");
  });
});
