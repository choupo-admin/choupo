// Tests for the variable-knob path: parseScalarString (the shared "<n> [unit]"
// reader), numericOperationKeys accepting unit-bearing scalars, and
// collectVariableKnobs reading the variables {} block with its usedBy index.

import { describe, expect, it } from "vitest";

import { parseScalarString, type JsonValue } from "../src/dict/json.js";
import { numericOperationKeys } from "../src/case/sweepSynth.js";
import { collectVariableKnobs } from "../src/case/variableKnobs.js";

describe("parseScalarString", () => {
  it("reads a number with a known unit (value as written)", () => {
    expect(parseScalarString("1.01325 bar")).toEqual({ value: 1.01325, unit: "bar" });
    expect(parseScalarString("100 kmol/h")).toEqual({ value: 100, unit: "kmol/h" });
    expect(parseScalarString("-3.5e2 K")).toEqual({ value: -350, unit: "K" });
  });
  it("reads a bare number (no unit)", () => {
    expect(parseScalarString("1.5")).toEqual({ value: 1.5 });
    expect(parseScalarString("42")).toEqual({ value: 42 });
  });
  it("rejects non-scalars and unknown units", () => {
    expect(parseScalarString("$press")).toBeNull();
    expect(parseScalarString("loose")).toBeNull();
    expect(parseScalarString("1.0 fortnights")).toBeNull();
    expect(parseScalarString("")).toBeNull();
  });
});

describe("numericOperationKeys", () => {
  it("accepts unit-bearing scalars (strings), not just bare numbers", () => {
    const op = {
      P: "1.01325 bar", // unit-bearing -> was dropped before the fix
      T: 350, // bare number
      label: "ideal", // word -> not a knob
      ref: "$press", // reference -> not a knob
    };
    expect(numericOperationKeys(op).sort()).toEqual(["P", "T"]);
  });
  it("is empty for an absent block", () => {
    expect(numericOperationKeys(undefined)).toEqual([]);
  });
});

describe("collectVariableKnobs", () => {
  const flowsheet: JsonValue = {
    variables: {
      press: "1.01325 bar", // unit-bearing
      ratio: 2.5, // bare number
      label: "ignore-me", // not numeric -> skipped
    },
    streams: { feed: { F: "100 kmol/h", T: "360 K" } },
    units: [
      { name: "flashDrum", operation: { P: "$press", T: "350 K" } },
      { name: "split", operation: { fraction: "$ratio" } },
    ],
  };

  it("yields numeric knobs with their declared unit", () => {
    const knobs = collectVariableKnobs(flowsheet);
    const press = knobs.find((k) => k.name === "press");
    const ratio = knobs.find((k) => k.name === "ratio");
    expect(press).toMatchObject({ name: "press", value: 1.01325, unit: "bar" });
    expect(ratio).toMatchObject({ name: "ratio", value: 2.5, unit: undefined });
  });

  it("skips non-numeric declarations", () => {
    const knobs = collectVariableKnobs(flowsheet);
    expect(knobs.some((k) => k.name === "label")).toBe(false);
  });

  it("builds the usedBy reverse index of every $ref site", () => {
    const knobs = collectVariableKnobs(flowsheet);
    expect(knobs.find((k) => k.name === "press")!.usedBy).toEqual([
      "units[0].operation.P",
    ]);
    expect(knobs.find((k) => k.name === "ratio")!.usedBy).toEqual([
      "units[1].operation.fraction",
    ]);
  });

  it("returns [] when there is no variables block", () => {
    expect(collectVariableKnobs({ units: [] })).toEqual([]);
    expect(collectVariableKnobs(undefined)).toEqual([]);
  });
});
