import { describe, expect, it } from "vitest";

import {
  COL_UNITS, detectCategoricalCsv, hasSiColumns, unitFromTokens,
} from "../src/ui/plotting/csvShape.js";
import {
  DEFAULT_PREFS,
  effectiveConcentrationUnit,
  molalToDisplay,
} from "../src/state/displayUnits.js";

// The speciate ops emit species tables (categorical first column); the
// scalingScan op emits a numeric recovery sweep.  Shapes copied from
// tutorials/props/electrolyte/scaling_ro_brackish.
const SPECIATE = [
  "species,molality,activity,gamma",
  "Ca,1.92208549e-03,1.04202255e-03,5.42131219e-01",
  "Cl,1.23999999e-02,1.06401509e-02,8.58076690e-01",
  "CaSO4aq,3.89409503e-03,3.89409503e-03,1.00000000e+00",
].join("\n");

const SCALING = [
  "recovery,I,SI_calcite,SI_gypsum",
  "0.00,2.56444993e-02,3.27846477e-01,-1.37241132e+00",
  "0.05,2.69543807e-02,3.64712385e-01,-1.34169522e+00",
].join("\n");

describe("csvShape — categorical (species-table) detection", () => {
  it("detects the speciate shape: non-numeric first column, numeric values", () => {
    const cat = detectCategoricalCsv(SPECIATE);
    expect(cat).not.toBeNull();
    expect(cat!.xName).toBe("species");
    expect(cat!.labels).toEqual(["Ca", "Cl", "CaSO4aq"]);
    expect(cat!.valueCols.map((c) => c.name)).toEqual(["molality", "activity", "gamma"]);
    expect(cat!.valueCols[0]!.values[1]).toBeCloseTo(1.24e-2, 6);
  });

  it("a numeric scan is NOT categorical", () => {
    expect(detectCategoricalCsv(SCALING)).toBeNull();
  });

  it("one numeric first-column cell disqualifies (a scan with a bad row keeps the line plot)", () => {
    expect(detectCategoricalCsv("species,molality\nCa,1e-3\n42,2e-3")).toBeNull();
  });

  it("needs at least one numeric value column to plot", () => {
    expect(detectCategoricalCsv("species,note\nCa,low\nCl,high")).toBeNull();
  });
});

describe("csvShape — SI = 0 saturation-line trigger", () => {
  it("fires when SI_* value columns are plotted (scalingScan)", () => {
    expect(hasSiColumns(["recovery", "I", "SI_calcite", "SI_gypsum"])).toBe(true);
  });

  it("fires on methodCompare-merged SI columns (SI_<mineral>__<model>)", () => {
    expect(hasSiColumns(["recovery", "SI_calcite__Pitzer"])).toBe(true);
  });

  it("stays off without SI columns, and never keys on the x column", () => {
    expect(hasSiColumns(["T", "Psat_water"])).toBe(false);
    expect(hasSiColumns(["SI_calcite"])).toBe(false);
  });
});

describe("displayUnits — concentration preference", () => {
  it("defaults to canonical mol/kg", () => {
    expect(DEFAULT_PREFS.concentration).toBe("mol/kg");
  });

  it("mol/kg <-> mmol/kg is exact, no molar mass needed", () => {
    expect(molalToDisplay(1.922e-3, "mol/kg")).toBeCloseTo(1.922e-3, 9);
    expect(molalToDisplay(1.922e-3, "mmol/kg")).toBeCloseTo(1.922, 6);
  });

  it("mg/L needs a molar mass: NaN without one (never invented), exact with one", () => {
    expect(Number.isNaN(molalToDisplay(1e-3, "mg/L"))).toBe(true);
    // Ca (40.078 g/mol): 1 mmol/kg ≈ 40.078 mg/L at rho ~ 1 kg/L
    expect(molalToDisplay(1e-3, "mg/L", 40.078)).toBeCloseTo(40.078, 6);
  });

  it("the effective unit falls back to mol/kg when no molar-mass map exists", () => {
    expect(effectiveConcentrationUnit("mg/L", false)).toBe("mol/kg");
    expect(effectiveConcentrationUnit("mg/L", true)).toBe("mg/L");
    expect(effectiveConcentrationUnit("mmol/kg", false)).toBe("mmol/kg");
  });
});

//  D8b (2026-09-21).  The axis labeller walked EVERY "_"-separated token of a
//  column name and took the first with a known unit.  Measured over the 872
//  distinct column names the corpus's own CSVs carry, 67 came back with a
//  WRONG unit.  The rule now reads the HEAD of the name only -- the first
//  token always, the second only as a whole word.
describe("column units — the dimension is read from the HEAD of the name", () => {
  const unit = (col: string) => unitFromTokens(col.split("_"));

  it("takes the quantity at the head", () => {
    expect(unit("Psat_ethanol")).toBe("Pa");
    expect(unit("T")).toBe("K");
    expect(unit("mu_gas_N2")).toBe("Pa·s");
    expect(unit("viscosity_liquid")).toBe("Pa·s");
    expect(unit("rho_liquid_water")).toBe("kg/m³");
  });

  it("accepts the SECOND token only as a whole word", () => {
    //  the labeller's own documented example, and the reason the window is
    //  two tokens wide rather than one
    expect(unit("thermal_conductivity_liquid")).toBe("W/(m·K)");
    expect(unit("thermal_conductivity")).toBe("W/(m·K)");
    //  ...but a LONE LETTER at index 1 is a subject or a unit suffix, never
    //  the quantity: `rig.U_V` is volts, and it read as m3/mol.
    expect(unit("rig.U_V")).toBe("");
    expect(unit("m_H")).toBe("");
    expect(unit("F_P")).toBe("");
  });

  it("never reads a dimension out of a deep token", () => {
    //  THE DEFECT: a dimensionless saturation index given an ENTROPY unit,
    //  because the walk reached the `S` of `labile_S`.  That also tore the
    //  column out of the SI panel onto an axis of its own -- the columns are
    //  grouped by resolved unit.
    expect(unit("SI_labile_S")).toBe("");
    expect(unit("SI_aragonite")).toBe("");
    expect(unit("SI_calcite")).toBe("");
    //  ...and the flow and rate columns that read as J/mol or J/(mol K)
    //  because their name spells its own unit out at the end.  (The COUNT of
    //  them lives in ONE place, the module header's measurement; a number
    //  repeated in a comment is a second home for a fact.)
    expect(unit("n_Ca_kmol_per_h")).toBe("");
    expect(unit("mass_flow_kg_per_h")).toBe("");
    expect(unit("rig.kappa_dil_S_per_m")).toBe("");
    expect(unit("cost_EUR_per_h")).toBe("");
    expect(unit("L_over_D")).toBe("");
  });

  it("puts every SI_<mineral> column on ONE axis", () => {
    //  the grouping consequence, stated as the grouping: same unit => same
    //  panel, and the SI = 0 reference line belongs to that panel.
    const cols = ["SI_aragonite", "SI_calcite", "SI_gypsum", "SI_labile_S", "SI_halite"];
    expect(new Set(cols.map(unit)).size).toBe(1);
  });

  it("states the limit it does NOT reach", () => {
    //  MEASURED, and it is not what a first draft of this arm predicted: after
    //  the head rule, NO corpus column still resolves a WRONG unit at index 1
    //  (the only two that resolve there at all are `thermal_conductivity` and
    //  `thermal_conductivity_liquid`, both right).  Every wrong unit that
    //  survives sits at index ZERO -- a one-letter quantity key colliding with
    //  a DIFFERENT quantity spelled with the same letter.  No rule about
    //  POSITION can see these; only a column that declares its own dimension
    //  can, which is the engine's own 2026-09-04 rule one plane down.
    expect(unit("D_rectifying")).toBe("m\u00b2/s");     //  a column DIAMETER, in m
    expect(unit("H_kW")).toBe("J/mol");              //  an enthalpy FLOW, in kW
    expect(unit("V_R")).toBe("m\u00b3/mol");            //  a reactor VOLUME, in m3
    expect(unit("X_moisture")).toBe("mol frac");     //  a mass ratio, kg/kg
  });

  it("declares no unit for a name that carries none", () => {
    expect(unit("recovery")).toBe("");
    expect(unit("curve")).toBe("");
    expect(unit("")).toBe("");
    expect(unitFromTokens([])).toBe("");
  });

  it("the table it reads is the ONE table", () => {
    //  COL_UNITS lived inside CsvAutoPlot.tsx, which plotly makes unimportable
    //  in this suite -- so the table nothing could reach was the table nothing
    //  could test.
    expect(COL_UNITS["psat"]).toBe("Pa");
    expect(COL_UNITS["hmass"]).toBe("J/kg");
  });
});
