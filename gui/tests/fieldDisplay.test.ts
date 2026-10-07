//  C49 (2026-10-07): the Properties panel converted a temperature DIFFERENCE
//  as an absolute temperature (temperatureApproach 5 K -> -268 degC) and
//  never converted a scalar written with its unit (T 733.15 K stayed in K).
import { describe, expect, it } from "vitest";
import { operationSchemaFor } from "../src/case/operationSchemas.js";
import type { OperationField } from "../src/case/operationSchemas.js";
import { displayHint, fieldValueToSI, renderFieldValue } from "../src/ui/fieldDisplay.js";
import { DEFAULT_PREFS } from "../src/state/displayUnits.js";

const degC = { ...DEFAULT_PREFS, temperature: "degC" as const };
const kelvin = { ...DEFAULT_PREFS, temperature: "K" as const };

function field(unitType: string, key: string): OperationField {
  const f = operationSchemaFor(unitType)?.fields.find((x) => x.key === key);
  if (!f) throw new Error(`no field ${unitType}.${key}`);
  return f;
}

describe("temperature difference vs absolute temperature", () => {
  const approach = field("gibbsReactor", "temperatureApproach");
  const T = field("gibbsReactor", "T");

  it("the schema marks the approach a difference and T an absolute value", () => {
    expect(approach.quantity).toBe("temperatureDifference");
    expect(T.quantity).toBeUndefined();
  });

  it("a 5 K approach reads 5 in degC, never -268", () => {
    const r = renderFieldValue(approach, 5, degC)!;
    expect(Number(r.displayValue)).toBe(5);
    expect(r.displayUnit).toBe("°C");
  });

  it("superheat and subcool are differences too", () => {
    for (const t of ["phaseChanger", "condenser", "boiler"])
      for (const k of ["superheat", "subcool"])
        expect(field(t, k).quantity).toBe("temperatureDifference");
  });

  it("a difference written in degF converts by the scale only", () => {
    expect(fieldValueToSI(approach, "9 degF")).toBeCloseTo(5, 12);
    expect(fieldValueToSI(approach, "5 degC")).toBe(5);
  });
});

describe("a scalar written WITH its unit follows the Units menu", () => {
  const T = field("gibbsReactor", "T");
  const P = field("gibbsReactor", "P");

  it("T 733.15 K reads 460 degC", () => {
    const r = renderFieldValue(T, "733.15 K", degC)!;
    expect(Number(r.displayValue)).toBeCloseTo(460, 6);
    expect(r.displayUnit).toBe("°C");
  });

  it("T 460 degC reads 733 K", () => {
    expect(fieldValueToSI(T, "460 degC")).toBeCloseTo(733.15, 9);
  });

  it("P 150 bar is converted to SI before formatting", () => {
    expect(fieldValueToSI(P, "150 bar")).toBe(1.5e7);
  });

  it("a unit of another family is never converted across dimensions", () => {
    expect(fieldValueToSI(T, "150 bar")).toBeUndefined();
    expect(renderFieldValue(T, "150 bar", degC)).toBeNull();
  });

  it("the editable field shows a hint only when the menu differs from the file", () => {
    expect(displayHint(T, "733.15 K", degC)).toMatch(/^= 460(\.0*)? °C$/);
    expect(displayHint(T, "733.15 K", kelvin)).toBeNull();
    expect(displayHint(T, "460 degC", degC)).toBeNull();
  });
});
