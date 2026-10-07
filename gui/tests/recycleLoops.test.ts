import { describe, it, expect } from "vitest";
import { loopMembership } from "../src/case/recycleLoops";

const loops = [{ tear: "recycle", units: ["mixer", "reactor", "splitter"],
                 streams: ["mixed", "out", "recycle"] }];

describe("recycle loop membership comes from the engine's list", () => {
  it("a stream on the loop is on it; one off it is not", () => {
    const m = loopMembership(loops, () => undefined);
    expect(m.streamOnLoop("recycle")).toBe(true);
    expect(m.streamOnLoop("feed")).toBe(false);
    expect(m.unitOnLoop("reactor")).toBe(true);
    expect(m.unitOnLoop("flash")).toBe(false);
  });

  it("a canvas label resolves through the run's own stream, never by its tail", () => {
    const m = loopMembership(
      [{ tear: "LOOP.recycle", units: ["LOOP.mixer"], streams: ["LOOP.recycle"] }],
      (label) => (label === "recycle" ? "LOOP.recycle" : undefined));
    expect(m.streamOnLoop("recycle")).toBe(true);
    //  a different pipe sharing the leaf word is NOT on the loop
    expect(m.streamOnLoop("OTHER.recycle")).toBe(false);
  });

  it("a sector box is on the loop when the engine stamped a loop unit with it", () => {
    const m = loopMembership(
      [{ tear: "LOOP.recycle", units: ["LOOP.mixer"], streams: ["LOOP.recycle"] }],
      () => undefined, { "LOOP.mixer": "LOOP" });
    expect(m.unitOnLoop("LOOP")).toBe(true);
    expect(m.unitOnLoop("DRYING")).toBe(false);
  });

  it("no published loop draws nothing", () => {
    const m = loopMembership(undefined, () => undefined);
    expect(m.any).toBe(false);
    expect(m.streamOnLoop("x")).toBe(false);
  });
});
