import { describe, expect, it } from "vitest";

import {
  applyTuning,
  collectControllerKnobs,
  interactingToParallel,
  parallelToInteracting,
} from "../src/case/controllerKnobs.js";
import type { JsonDict } from "../src/dict/index.js";

// The ctrl02_disturbance_rejection flowsheet, parsed to JSON (the shape
// toJson produces: `controllers` is a list-of-dicts).  FeedDist (Schedule)
// first, then TC1 (PID) -- index 1.
const CTRL02: JsonDict = {
  units: [{ name: "reactor", type: "dynamicCSTR" }],
  controllers: [
    {
      name: "FeedDist",
      type: "Schedule",
      actuator: { unit: "reactor", mv: "T_in" },
      schedule: [
        { time: 0, value: 320.0 },
        { time: 700, value: 305.0 },
        { time: 1300, value: 335.0 },
      ],
    },
    {
      name: "TC1",
      type: "PID",
      measurement: { unit: "reactor", cv: "T" },
      actuator: { unit: "reactor", mv: "T_jacket" },
      setpoint: 350.0,
      gains: { Kp: 4.0, Ki: 0.04, Kd: 0.0 },
      output: { min: 280.0, max: 420.0, bias: 320.0 },
    },
  ],
};

describe("collectControllerKnobs — lifting the PID + schedule from ctrl02", () => {
  it("finds the PID at its authored index with the right gains + setpoint", () => {
    const { pid } = collectControllerKnobs(CTRL02);
    expect(pid).not.toBeNull();
    expect(pid!.index).toBe(1);
    expect(pid!.name).toBe("TC1");
    expect(pid!.kp).toBe(4.0);
    expect(pid!.ki).toBe(0.04);
    expect(pid!.kd).toBe(0.0);
    expect(pid!.setpoint).toBe(350.0);
    expect(pid!.outMin).toBe(280.0);
    expect(pid!.outMax).toBe(420.0);
    expect(pid!.measure).toEqual({ unit: "reactor", cv: "T" });
    expect(pid!.actuate).toEqual({ unit: "reactor", mv: "T_jacket" });
  });

  it("builds indexed setScalarAtPath targets that match the authored list", () => {
    const { pid } = collectControllerKnobs(CTRL02);
    expect(pid!.targetPaths).toEqual({
      kp: "controllers[1].gains.Kp",
      ki: "controllers[1].gains.Ki",
      kd: "controllers[1].gains.Kd",
      setpoint: "controllers[1].setpoint",
    });
  });

  it("lifts every Schedule controller's step train (for the disturbance markers)", () => {
    const { schedules } = collectControllerKnobs(CTRL02);
    expect(schedules).toHaveLength(1);
    expect(schedules[0]!.name).toBe("FeedDist");
    expect(schedules[0]!.actuate).toEqual({ unit: "reactor", mv: "T_in" });
    expect(schedules[0]!.schedule).toEqual([
      { time: 0, value: 320.0 },
      { time: 700, value: 305.0 },
      { time: 1300, value: 335.0 },
    ]);
  });

  it("reads gains written as unit-bearing strings too (e.g. '4.0')", () => {
    const withStrings: JsonDict = {
      controllers: [
        { name: "C", type: "PID", setpoint: "350 K", gains: { Kp: "4.0", Ki: "0.04", Kd: "0" } },
      ],
    };
    const { pid } = collectControllerKnobs(withStrings);
    expect(pid!.kp).toBe(4.0);
    expect(pid!.ki).toBe(0.04);
    expect(pid!.setpoint).toBe(350);
  });

  it("returns { pid: null } when there is no PID (the workspace gate)", () => {
    const noPid: JsonDict = { controllers: [{ name: "S", type: "Schedule", schedule: [] }] };
    expect(collectControllerKnobs(noPid).pid).toBeNull();
    expect(collectControllerKnobs({ units: [] }).pid).toBeNull();
    expect(collectControllerKnobs(undefined).pid).toBeNull();
  });
});

describe("parallel <-> interacting identity (Kp/Ki/Kd <-> Kc/τI/τD)", () => {
  it("Kc=Kp · τI=Kp/Ki · τD=Kd/Kp", () => {
    const twin = parallelToInteracting(4.0, 0.04, 8.0);
    expect(twin.kc).toBe(4.0);
    expect(twin.tauI).toBeCloseTo(100, 9); // 4.0 / 0.04
    expect(twin.tauD).toBeCloseTo(2.0, 9); // 8.0 / 4.0
  });

  it("Ki=0 => τI is infinite (no integral action)", () => {
    expect(parallelToInteracting(4.0, 0, 0).tauI).toBe(Infinity);
  });

  it("Kp=0 => τD collapses to 0 (no proportional base, undefined ratio handled)", () => {
    expect(parallelToInteracting(0, 0, 5).tauD).toBe(0);
  });

  it("round-trips: parallel -> interacting -> parallel is identity", () => {
    const a = parallelToInteracting(4.0, 0.04, 8.0);
    const back = interactingToParallel(a.kc, a.tauI, a.tauD);
    expect(back.kp).toBeCloseTo(4.0, 9);
    expect(back.ki).toBeCloseTo(0.04, 9);
    expect(back.kd).toBeCloseTo(8.0, 9);
  });

  it("interacting -> parallel: infinite τI yields Ki=0", () => {
    const p = interactingToParallel(4.0, Infinity, 0);
    expect(p.ki).toBe(0);
    expect(p.kp).toBe(4.0);
  });
});

describe("applyTuning — patching the PID without mutating the input", () => {
  it("replaces only the named gains at the PID's index", () => {
    const { pid } = collectControllerKnobs(CTRL02);
    const next = applyTuning(CTRL02, pid!, { kp: 12, ki: 0.08 }) as JsonDict;
    const ctl = (next.controllers as JsonDict[])[1]!;
    expect((ctl.gains as JsonDict).Kp).toBe(12);
    expect((ctl.gains as JsonDict).Ki).toBe(0.08);
    expect((ctl.gains as JsonDict).Kd).toBe(0.0); // untouched
    // Schedule controller at index 0 is untouched.
    expect((next.controllers as JsonDict[])[0]!.name).toBe("FeedDist");
  });

  it("patches the setpoint scalar", () => {
    const { pid } = collectControllerKnobs(CTRL02);
    const next = applyTuning(CTRL02, pid!, { setpoint: 360 }) as JsonDict;
    expect((next.controllers as JsonDict[])[1]!.setpoint).toBe(360);
  });

  it("does NOT mutate the original flowsheet JSON (clone-edit-run)", () => {
    const { pid } = collectControllerKnobs(CTRL02);
    applyTuning(CTRL02, pid!, { kp: 99 });
    const orig = (CTRL02.controllers as JsonDict[])[1]!;
    expect((orig.gains as JsonDict).Kp).toBe(4.0); // unchanged
  });
});
