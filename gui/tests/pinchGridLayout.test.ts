// pinchGridLayout -- the classical grid-diagram geometry (Pareto filter +
// show-all override, lanes incl. utility tails, the explicit shifted-T axis
// with ticks, the responsive name column, full-span stream segments, match
// lines).  View-side only: the filter must never change the numbers, only
// what is drawn.
import { describe, expect, it } from "vitest";
import {
  paretoFilter, gridLanes, gridAxis, gridLeft, gridTicks, gridSegments,
  gridMatchLines, utilitySegments, xOfShifted,
  LANE_TOP, LANE_HEIGHT, GROUP_GAP, UTIL_LANE_HEIGHT, AXIS_STRIP, PLOT_RIGHT,
  MIN_MATCH_SEP, MIN_SEG_PX, MIN_LEFT, MAX_LEFT, NAME_CHAR_PX,
} from "../src/ui/plotting/pinchGridLayout.js";
import { computePinch } from "../src/case/pinch.js";
import type { ThermalStream, HeatMatch } from "../src/case/pinch.js";

const st = (o: Partial<ThermalStream>): ThermalStream => ({
  unit: "u", kind: "hot", Ts: 450, Tt: 350, Q_kW: 100, ...o,
});
const mt = (o: Partial<HeatMatch>): HeatMatch => ({
  hot: "H", cold: "C", capKW: 100, side: "above", ...o,
});
const NO_UTIL = { hotUtility: false, coldUtility: false };

describe("paretoFilter", () => {
  const streams = [
    st({ unit: "big", kind: "hot", Q_kW: 300 }),
    st({ unit: "mid", kind: "cold", Ts: 300, Tt: 400, Q_kW: 150 }),
    st({ unit: "small", kind: "hot", Q_kW: 30 }),
    st({ unit: "tiny", kind: "cold", Ts: 300, Tt: 400, Q_kW: 20 }),
  ];

  it("references the TOTAL heating+cooling demand and omits strictly-below streams", () => {
    const f = paretoFilter(streams, 5);          // ref 500 kW -> cutoff 25 kW
    expect(f.refKW).toBeCloseTo(500);
    expect(f.thresholdKW).toBeCloseTo(25);
    expect(f.kept.map((s) => s.unit)).toEqual(["big", "mid", "small"]);
    expect(f.omitted.map((s) => s.unit)).toEqual(["tiny"]);
    expect(f.omittedKW).toBeCloseTo(20);         // the announced total
  });

  it("keeps a stream sitting EXACTLY at the threshold", () => {
    const f = paretoFilter(
      [st({ unit: "big", Q_kW: 95 }), st({ unit: "edge", kind: "cold", Ts: 300, Tt: 400, Q_kW: 5 })],
      5,                                          // ref 100 -> cutoff 5; 5 is NOT < 5
    );
    expect(f.omitted).toEqual([]);
    expect(f.kept.map((s) => s.unit)).toEqual(["big", "edge"]);
  });

  it("0 % shows all (the footer's Show-all override); negative / NaN behave as 0", () => {
    // the inline "Show all" button re-filters at 0 %: everything returns
    expect(paretoFilter(streams, 0).kept).toHaveLength(4);
    expect(paretoFilter(streams, 0).omitted).toEqual([]);
    expect(paretoFilter(streams, -3).omitted).toEqual([]);
    expect(paretoFilter(streams, NaN).omitted).toEqual([]);
  });
});

describe("gridLanes", () => {
  const kept = [
    st({ unit: "h1" }),
    st({ unit: "c1", kind: "cold", Ts: 300, Tt: 400 }),
    st({ unit: "h2" }),
  ];

  it("stacks hot lanes on top, then the gap, then the cold lanes, order preserved", () => {
    const lanes = gridLanes(kept, NO_UTIL);
    expect(lanes.hot.map((l) => l.stream.unit)).toEqual(["h1", "h2"]);
    expect(lanes.utilHotY).toBeNull();
    expect(lanes.utilColdY).toBeNull();
    expect(lanes.hot[0]!.y).toBeCloseTo(LANE_TOP + LANE_HEIGHT * 0.5);
    expect(lanes.hot[1]!.y).toBeCloseTo(LANE_TOP + LANE_HEIGHT * 1.5);
    const coldTop = LANE_TOP + LANE_HEIGHT * 2 + GROUP_GAP;
    expect(lanes.cold[0]!.y).toBeCloseTo(coldTop + LANE_HEIGHT * 0.5);
    expect(lanes.lanesBottom).toBeCloseTo(coldTop + LANE_HEIGHT + 6);
    expect(lanes.height).toBeCloseTo(lanes.lanesBottom + AXIS_STRIP);
  });

  it("adds thin utility lanes above the hot block and below the cold block", () => {
    const lanes = gridLanes(kept, { hotUtility: true, coldUtility: true });
    expect(lanes.utilHotY).toBeCloseTo(LANE_TOP + UTIL_LANE_HEIGHT / 2);
    // the hot block moves down by the utility lane
    expect(lanes.hot[0]!.y).toBeCloseTo(LANE_TOP + UTIL_LANE_HEIGHT + LANE_HEIGHT * 0.5);
    const coldTop = LANE_TOP + UTIL_LANE_HEIGHT + LANE_HEIGHT * 2 + GROUP_GAP;
    expect(lanes.cold[0]!.y).toBeCloseTo(coldTop + LANE_HEIGHT * 0.5);
    expect(lanes.utilColdY).toBeCloseTo(coldTop + LANE_HEIGHT + UTIL_LANE_HEIGHT / 2);
    expect(lanes.lanesBottom).toBeCloseTo(coldTop + LANE_HEIGHT + UTIL_LANE_HEIGHT + 6);
  });
});

describe("gridLeft (responsive name column)", () => {
  it("grows with the longest name and stays within bounds", () => {
    expect(gridLeft(["H", "C"])).toBe(MIN_LEFT);
    const long = "FERMENTATION.Fermentor";     // 22 chars -- clipped by the old fixed 150
    expect(gridLeft(["H", long])).toBe(20 + long.length * NAME_CHAR_PX);  // 174
    expect(gridLeft([long])).toBeGreaterThan(150);
    expect(gridLeft(["x".repeat(80)])).toBe(MAX_LEFT);
    expect(gridLeft([])).toBe(MIN_LEFT);
  });
});

describe("gridAxis + xOfShifted", () => {
  const kept = [st({ unit: "H" }), st({ unit: "C", kind: "cold", Ts: 300, Tt: 400 })];

  it("covers every shifted endpoint (hot -d/2, cold +d/2), padded; high T sits LEFT", () => {
    const axis = gridAxis(kept, 10, null, 866); // shifted: hot 445..345, cold 305..405
    expect(axis.tLo).toBeCloseTo(305 - 0.04 * 140);
    expect(axis.tHi).toBeCloseTo(445 + 0.04 * 140);
    expect(axis.left).toBe(MIN_LEFT);
    expect(axis.plotWidth).toBeCloseTo(866 - MIN_LEFT - PLOT_RIGHT);   // 700
    expect(xOfShifted(axis.tHi, axis)).toBeCloseTo(axis.left);
    expect(xOfShifted(axis.tLo, axis)).toBeCloseTo(axis.left + axis.plotWidth);
    expect(xOfShifted(440, axis)).toBeLessThan(xOfShifted(350, axis));
  });

  it("always includes the pinch (drawable even when filtering trims the extremes)", () => {
    const axis = gridAxis([st({ unit: "H", Ts: 400, Tt: 380 })], 10, 340, 800);
    expect(axis.tLo).toBeLessThan(340);
  });

  it("degenerate spans widen instead of collapsing", () => {
    const empty = gridAxis([], 10, null, 800);
    expect(empty.tHi).toBeGreaterThan(empty.tLo);
    const iso = gridAxis([], 10, 340, 800);      // only the pinch point
    expect(iso.tHi - iso.tLo).toBeGreaterThan(0.5);
    expect(iso.tLo).toBeLessThan(340);
    expect(iso.tHi).toBeGreaterThan(340);
  });

  it("narrow container: plotWidth clamps and the svg claims the INTRINSIC width", () => {
    const axis = gridAxis(kept, 10, null, 390);  // phone-width container
    expect(axis.plotWidth).toBe(240);            // the usable floor
    // left + plot + right exceeds the container -> the wrapper's
    // overflowX:auto scrolls instead of clipping (forum #95 P1)
    expect(axis.left + axis.plotWidth + PLOT_RIGHT).toBeGreaterThan(390);
  });
});

describe("gridTicks (the explicit shifted-T axis)", () => {
  it("produces round 1-2-5 ticks inside the domain, a handful of them", () => {
    const kept = [st({ unit: "H" }), st({ unit: "C", kind: "cold", Ts: 300, Tt: 400 })];
    const axis = gridAxis(kept, 10, null, 866); // domain ~299.4 .. 450.6
    const ticks = gridTicks(axis);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(ticks.length).toBeLessThanOrEqual(8);
    for (const t of ticks) {
      expect(t).toBeGreaterThanOrEqual(axis.tLo);
      expect(t).toBeLessThanOrEqual(axis.tHi + 1e-9);
      expect(t % 50).toBeCloseTo(0);            // range 151 K -> step 50, round values
    }
    expect(ticks).toEqual([300, 350, 400, 450]);
  });
});

describe("gridSegments", () => {
  const kept = [
    st({ unit: "H" }),                                          // hot 450 -> 350
    st({ unit: "C", kind: "cold", Ts: 300, Tt: 400 }),          // cold 300 -> 400
    st({ unit: "RB", kind: "cold", Ts: 371.5, Tt: 372.5, Q_kW: 890 }),  // iso reboil band
  ];
  const lanes = gridLanes(kept, NO_UTIL);
  const axis = gridAxis(kept, 10, null, 866);
  const segs = gridSegments(lanes, 10, axis);

  it("hot runs left->right, cold right->left, at the lane centres, FULL span", () => {
    const h = segs.find((s) => s.unit === "H")!;
    const c = segs.find((s) => s.unit === "C")!;
    expect(h.x1).toBeCloseTo(xOfShifted(445, axis));   // supply, shifted
    expect(h.x2).toBeCloseTo(xOfShifted(345, axis));
    expect(h.x1).toBeLessThan(h.x2);                    // hot ->
    expect(c.x1).toBeGreaterThan(c.x2);                 // cold <-
    // a real temperature span draws at its TRUE extent
    expect(h.xd1).toBeCloseTo(h.x1);
    expect(h.xd2).toBeCloseTo(h.x2);
    expect(h.y).toBeCloseTo(lanes.hot[0]!.y);
    expect(c.y).toBeCloseTo(lanes.cold[0]!.y);
  });

  it("widens a near-isothermal band to MIN_SEG_PX, midpoint + direction preserved", () => {
    const rb = segs.find((s) => s.unit === "RB")!;
    expect(Math.abs(rb.x2 - rb.x1)).toBeLessThan(MIN_SEG_PX);   // truly narrow here
    expect(Math.abs(rb.xd2 - rb.xd1)).toBeCloseTo(MIN_SEG_PX);
    expect((rb.xd1 + rb.xd2) / 2).toBeCloseTo((rb.x1 + rb.x2) / 2);
    expect(Math.sign(rb.xd2 - rb.xd1)).toBe(Math.sign(rb.x2 - rb.x1)); // cold stays <-
  });
});

describe("utilitySegments", () => {
  const kept = [st({ unit: "H" }), st({ unit: "C", kind: "cold", Ts: 300, Tt: 400 })];
  const axis = gridAxis(kept, 10, 375, 866);
  const lanes = gridLanes(kept, { hotUtility: true, coldUtility: true });
  const pinchX = xOfShifted(375, axis);
  const right = axis.left + axis.plotWidth;

  it("hot tail spans the ABOVE-pinch zone (arrow at the pinch), cold the BELOW zone", () => {
    const [hotU, coldU] = utilitySegments(lanes, axis, pinchX);
    expect(hotU!.kind).toBe("hotUtility");
    expect(hotU!.y).toBeCloseTo(lanes.utilHotY!);
    expect(hotU!.x1).toBeCloseTo(axis.left + 2);
    expect(hotU!.x2).toBeCloseTo(pinchX - 4);           // -> points at the pinch
    expect(coldU!.kind).toBe("coldUtility");
    expect(coldU!.y).toBeCloseTo(lanes.utilColdY!);
    expect(coldU!.x1).toBeCloseTo(right - 2);
    expect(coldU!.x2).toBeCloseTo(pinchX + 4);          // <- points at the pinch
    expect(coldU!.x1).toBeGreaterThan(coldU!.x2);
  });

  it("no pinch -> full-width tails; no utility lanes -> nothing", () => {
    const full = utilitySegments(lanes, axis, null);
    expect(full).toHaveLength(2);
    expect(full[0]!.x2).toBeCloseTo(right - 4);
    expect(utilitySegments(gridLanes(kept, NO_UTIL), axis, pinchX)).toEqual([]);
  });

  it("skips a tail whose zone is too narrow to draw", () => {
    const nearLeft = axis.left + 8;                     // hot zone < 12 px
    const only = utilitySegments(lanes, axis, nearLeft);
    expect(only).toHaveLength(1);
    expect(only[0]!.kind).toBe("coldUtility");
  });
});

describe("gridMatchLines", () => {
  const kept = [st({ unit: "H" }), st({ unit: "C", kind: "cold", Ts: 300, Tt: 400 })];
  const lanes = gridLanes(kept, NO_UTIL);
  const axis = gridAxis(kept, 10, null, 866);

  it("joins the two lane centres inside the pair's shifted-T overlap, physics carried through", () => {
    const { drawn, hidden } = gridMatchLines(
      [mt({ capKW: 150, side: "below" })], lanes, 10, axis);
    expect(hidden).toBe(0);
    const m = drawn[0]!;
    expect(m.yHot).toBeCloseTo(lanes.hot[0]!.y);
    expect(m.yCold).toBeCloseTo(lanes.cold[0]!.y);
    // overlap = [345, 405] shifted -> placed at its midpoint 375
    expect(m.x).toBeCloseTo(xOfShifted(375, axis));
    expect(m.capKW).toBe(150);
    expect(m.side).toBe("below");
  });

  it("counts (never draws) a match whose endpoint stream was Pareto-omitted", () => {
    const { drawn, hidden } = gridMatchLines(
      [mt({}), mt({ cold: "Ghost" })], lanes, 10, axis);
    expect(drawn).toHaveLength(1);
    expect(hidden).toBe(1);
  });

  it("nudges coincident match lines apart, staying inside the feasible band", () => {
    const kept3 = [
      st({ unit: "H" }),
      st({ unit: "C1", kind: "cold", Ts: 300, Tt: 400 }),
      st({ unit: "C2", kind: "cold", Ts: 300, Tt: 400 }),
    ];
    const lanes3 = gridLanes(kept3, NO_UTIL);
    const axis3 = gridAxis(kept3, 10, null, 866);
    const { drawn } = gridMatchLines(
      [mt({ cold: "C1" }), mt({ cold: "C2" })], lanes3, 10, axis3);
    expect(drawn).toHaveLength(2);
    expect(drawn[1]!.x - drawn[0]!.x).toBeGreaterThanOrEqual(MIN_MATCH_SEP - 1e-9);
    // both stay inside the overlap band [345, 405] shifted
    const xLeft = xOfShifted(405, axis3);
    const xRight = xOfShifted(345, axis3);
    for (const m of drawn) {
      expect(m.x).toBeGreaterThanOrEqual(xLeft);
      expect(m.x).toBeLessThanOrEqual(xRight);
    }
  });
});

// Hermetic regression distilled from plant/ChemicalPlantTutorial (the case in
// the forum-#93 screenshot; duties/temperatures from its converged run): every
// heat SOURCE (~313-315 K) is colder than every heat SINK (~320-396 K), so the
// screening's empty match list is PHYSICALLY CORRECT (not a rendering bug) and
// the utility targets equal today's duties -- exactly what the grid must
// annotate.  Also pins the announced Pareto omission (FERMENTATION.Flash).
describe("ChemicalPlantTutorial-shaped case (zero-recovery, no matches)", () => {
  const runResult = {
    status: "done", log: "", streams: [],
    kpis: {
      "CONCENTRATION.Cryst": { Q_kW: -132.3, T: 313.15 },
      "CONCENTRATION.Evap1": { Q_kW: 651.3, T: 395.37 },
      "CONCENTRATION.Evap2": { Q_kW: 357.6, T: 392.05 },
      "DRYING.SD": { Q_kW: 342.8, T: 333.65 },
      "FERMENTATION.Fermentor": { Q_kW: -147.1, T: 314.95 },
      "FERMENTATION.Flash": { Q_kW: 59.9, T: 320.0 },
    },
  } as never;
  const flowsheet = { units: [] } as never;

  it("no candidate matches AND the targets equal the current duties", () => {
    const p = computePinch(runResult, flowsheet, 10)!;
    expect(p.streams).toHaveLength(6);
    expect(p.matches).toEqual([]);
    expect(p.QhMin).toBeCloseTo(p.QhNow, 6);     // zero composite overlap
    expect(p.QcMin).toBeCloseTo(p.QcNow, 6);
    expect(p.QhNow).toBeCloseTo(1411.6, 1);
    expect(p.QcNow).toBeCloseTo(279.4, 1);
    expect(p.pinchHot).toBeCloseTo(329.5, 1);
    expect(p.pinchCold).toBeCloseTo(319.5, 1);
  });

  it("the default 5 % Pareto cutoff omits exactly FERMENTATION.Flash, announced", () => {
    const p = computePinch(runResult, flowsheet, 10)!;
    const f = paretoFilter(p.streams, 5);        // ref ~1691 kW -> cutoff ~84.6 kW
    expect(f.refKW).toBeCloseTo(1691.0, 1);
    expect(f.omitted.map((s) => s.unit)).toEqual(["FERMENTATION.Flash"]);
    expect(f.omittedKW).toBeCloseTo(59.9, 1);
    expect(f.kept).toHaveLength(5);
  });
});
