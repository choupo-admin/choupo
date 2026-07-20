// ganttLayout -- the campaign-sequence geometry (lanes, span, marks).
import { describe, expect, it } from "vitest";
import {
  ganttLanes, ganttSpan, ganttMarks, LANE_TOP, LANE_HEIGHT, PLOT_LEFT,
} from "../src/ui/plotting/ganttLayout.js";
import type { TimelineEvent } from "../src/adapters/SolverAdapter.js";

const ev = (o: Partial<TimelineEvent>): TimelineEvent => ({
  t: 0, kind: "recipe", action: "transfer", detail: "", trigger: "time",
  from: "", to: "", ...o,
});

describe("ganttLanes", () => {
  it("orders lanes by the campaign's story (event appearance), then idle"
     + " KPI vessels; the campaign aggregate never gets a lane", () => {
    const storyLanes = ganttLanes(["campaign", "receiver", "still"], [
      ev({ from: "reactor", to: "still" }),
      ev({ from: "still", to: "receiver" }),
    ]);
    expect(storyLanes).toEqual(["reactor", "still", "receiver"]);
    const lanes = ganttLanes(["reactor", "still"], [
      ev({ from: "still", to: "receiver" }),
      ev({ from: "receiver" }),
    ]);
    expect(lanes).toEqual(["still", "receiver", "reactor"]);
  });
  it("never invents a lane for an empty from/to", () => {
    expect(ganttLanes([], [ev({ from: "", to: "" })])).toEqual([]);
  });
});

describe("ganttSpan", () => {
  it("covers t_end and the last event, padded", () => {
    expect(ganttSpan(600, [ev({ t: 700 })])).toBeCloseTo(714);
    expect(ganttSpan(600, [ev({ t: 100 })])).toBeCloseTo(612);
  });
  it("degenerate all-zero span widens to 1 s", () => {
    expect(ganttSpan(undefined, [ev({ t: 0 })])).toBe(1);
  });
});

describe("ganttMarks", () => {
  it("places a transfer on its source lane and points at the destination", () => {
    const lanes = ["reactor", "still"];
    const m = ganttMarks(
      [ev({ t: 400, from: "reactor", to: "still", detail: "TRANSFER" })],
      lanes, 800, 700,
    )[0]!;
    expect(m.laneY).toBeCloseTo(LANE_TOP + LANE_HEIGHT * 0.5);
    expect(m.toY).toBeCloseTo(LANE_TOP + LANE_HEIGHT * 1.5);
    expect(m.x).toBeCloseTo(PLOT_LEFT + (400 / 800) * 700);
  });
  it("drops events whose acting unit has no lane, keeps to-less events", () => {
    const marks = ganttMarks(
      [ev({ from: "ghost" }), ev({ from: "still", action: "setParameter" })],
      ["still"], 100, 500,
    );
    expect(marks).toHaveLength(1);
    expect(marks[0]!.toY).toBeUndefined();
  });
});
