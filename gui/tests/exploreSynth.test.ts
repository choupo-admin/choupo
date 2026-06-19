import { describe, expect, it } from "vitest";

import { dictEquals, fromJson, parse, serialize } from "../src/dict/index.js";
import { EXPLORE_OUTPUT, synthesizeExploreCase, type ExploreSpec } from "../src/case/exploreSynth.js";

const spec: ExploreSpec = {
  components: ["ethanol", "water"],
  properties: ["Psat_ethanol", "Psat_water"],
  axis: { variable: "T", from: 250, to: 400, n: 51 },
  state: { P: 101325, composition: { ethanol: 0.5, water: 0.5 } },
};

describe("Property Explorer synthesizer", () => {
  it("builds a choupoProps propertyScan1D case (same shape an authored case has)", () => {
    const f = synthesizeExploreCase(spec);
    expect((f.controlDict as Record<string, unknown>).application).toBe("choupoProps");
    expect((f.thermoPackage as Record<string, unknown>).components).toEqual(["ethanol", "water"]);
    const ops = (f.propsDict as Record<string, unknown>).operations as Array<Record<string, unknown>>;
    expect(ops).toHaveLength(1);
    const op = ops[0]!;
    expect(op.type).toBe("propertyScan1D");
    expect((op.vary as Record<string, unknown>).variable).toBe("T");
    expect(op.properties).toEqual(["Psat_ethanol", "Psat_water"]);
    expect((op.output as Record<string, unknown>).file).toBe(EXPLORE_OUTPUT);
  });

  it("the synthesized propsDict serializes + round-trips (so the WASM adapter will accept it)", () => {
    const f = synthesizeExploreCase(spec);
    const ast = fromJson(f.propsDict!);
    const round = parse(serialize(ast));
    expect(dictEquals(round, ast)).toBe(true);
  });

  it("defaults to ideal / idealGas, honours model overrides", () => {
    const def = synthesizeExploreCase(spec);
    expect((def.thermoPackage as Record<string, unknown>).activityModel).toEqual({ model: "ideal" });
    const over = synthesizeExploreCase({ ...spec, activityModel: { model: "NRTL" } });
    expect((over.thermoPackage as Record<string, unknown>).activityModel).toEqual({ model: "NRTL" });
  });

  it("self-documents the scan mode: pure marks 'composition has no effect'", () => {
    const pure = synthesizeExploreCase({ ...spec, mode: "pure" });
    const desc = (pure.controlDict as Record<string, unknown>).description as string;
    expect(desc).toContain("pure-component");
    expect(desc).toContain("composition has no effect");
  });

  it("self-documents the scan mode: mixture marks the composition", () => {
    const mix = synthesizeExploreCase({ ...spec, mode: "mixture" });
    const desc = (mix.controlDict as Record<string, unknown>).description as string;
    expect(desc).toContain("mixture property");
  });

  it("carries non-standard component .dat bodies as extraFiles", () => {
    const f = synthesizeExploreCase({
      ...spec,
      componentFiles: { "constant/components/myComp.dat": "name myComp;\nMW 100;\n" },
    });
    expect(f.extraFiles?.["constant/components/myComp.dat"]).toContain("myComp");
  });
});

describe("scaling-scan synthesis (SI vs recovery)", () => {
  // Same dict grammar as tutorials/props/electrolyte/scaling_ro_brackish.
  const sspec: ExploreSpec = {
    components: ["water"],
    properties: [],
    axis: { variable: "T", from: 0, to: 1, n: 2 },   // unused
    state: { composition: { water: 1 } },
    scaling: {
      totals: { Ca: 0.0021, SO4: 0.0026, HCO3: 0.003 },
      pH: 7.8,
      from: 0, to: 0.85, n: 18,
    },
  };

  it("builds a scalingScan op carrying totals / pH / recovery", () => {
    const f = synthesizeExploreCase(sspec);
    expect((f.controlDict as Record<string, unknown>).application).toBe("choupoProps");
    // water is the only component — the ions live in the op's totals, and the
    // speciation catalogue resolves engine-side (data/standards/electrolyte/).
    expect((f.thermoPackage as Record<string, unknown>).components).toEqual(["water"]);
    const ops = (f.propsDict as Record<string, unknown>).operations as Array<Record<string, unknown>>;
    expect(ops).toHaveLength(1);
    const op = ops[0]!;
    expect(op.type).toBe("scalingScan");
    expect(op.pH).toBe(7.8);
    // The basis is MANDATORY engine-side (units law): each total carries mol/kg.
    expect(op.totals).toEqual({ Ca: "0.0021 mol/kg", SO4: "0.0026 mol/kg", HCO3: "0.003 mol/kg" });
    expect(op.recovery).toEqual({ from: 0, to: 0.85, n: 18 });
    expect((op.output as Record<string, unknown>).file).toBe(EXPLORE_OUTPUT);
  });

  it("the synthesized scaling propsDict serializes + round-trips", () => {
    const f = synthesizeExploreCase(sspec);
    const ast = fromJson(f.propsDict!);
    const round = parse(serialize(ast));
    expect(dictEquals(round, ast)).toBe(true);
  });

  it("pH: 'solve' emits the word `pH solve;` (electroneutrality closure)", () => {
    const f = synthesizeExploreCase({ ...sspec, scaling: { ...sspec.scaling!, pH: "solve" } });
    const op = ((f.propsDict as Record<string, unknown>).operations as Array<Record<string, unknown>>)[0]!;
    expect(op.pH).toBe("solve");
    // The dict text must carry the engine grammar verbatim (the same form
    // tutorials/props/electrolyte/scaling_ro_brackish authors by hand).
    const text = serialize(fromJson(f.propsDict!));
    expect(text).toMatch(/pH\s+solve;/);
    // and it round-trips
    const ast = fromJson(f.propsDict!);
    expect(dictEquals(parse(text), ast)).toBe(true);
  });

  it("a numeric pH still emits a plain scalar (given, held)", () => {
    const f = synthesizeExploreCase(sspec);
    const op = ((f.propsDict as Record<string, unknown>).operations as Array<Record<string, unknown>>)[0]!;
    expect(op.pH).toBe(7.8);
    expect(op.atmosphere).toBeUndefined();   // closed system: no atmosphere {}
    expect(serialize(fromJson(f.propsDict!))).toMatch(/pH\s+7.8;/);
  });

  it("pCO2atm emits `atmosphere { pCO2 <v> atm; }` (open system, unit mandatory)", () => {
    const f = synthesizeExploreCase({
      ...sspec,
      scaling: { ...sspec.scaling!, pH: "solve", pCO2atm: 4.2e-4 },
    });
    const op = ((f.propsDict as Record<string, unknown>).operations as Array<Record<string, unknown>>)[0]!;
    // the atm suffix is MANDATORY engine-side: a partial pressure declares its basis
    expect(op.atmosphere).toEqual({ pCO2: "0.00042 atm" });
    const text = serialize(fromJson(f.propsDict!));
    expect(text).toMatch(/pCO2\s+0.00042 atm;/);
    expect(dictEquals(parse(text), fromJson(f.propsDict!))).toBe(true);
  });

  it("T emits a raw-SI `temperature <K>;` and is omitted when unset", () => {
    const warm = synthesizeExploreCase({
      ...sspec,
      scaling: { ...sspec.scaling!, T: 313.15 },
    });
    const opWarm = ((warm.propsDict as Record<string, unknown>).operations as Array<Record<string, unknown>>)[0]!;
    expect(opWarm.temperature).toBe(313.15);
    const def = synthesizeExploreCase(sspec);
    const opDef = ((def.propsDict as Record<string, unknown>).operations as Array<Record<string, unknown>>)[0]!;
    expect(opDef.temperature).toBeUndefined();  // engine default 298.15 K
  });

  it("activityModel: 'pitzer' emits `activityModel pitzer;`; davies/undefined omits it (default)", () => {
    // Pitzer (brine-grade) is emitted explicitly and round-trips verbatim.
    const pz = synthesizeExploreCase({
      ...sspec,
      scaling: { ...sspec.scaling!, activityModel: "pitzer" },
    });
    const opPz = ((pz.propsDict as Record<string, unknown>).operations as Array<Record<string, unknown>>)[0]!;
    expect(opPz.activityModel).toBe("pitzer");
    const text = serialize(fromJson(pz.propsDict!));
    expect(text).toMatch(/activityModel\s+pitzer;/);
    expect(dictEquals(parse(text), fromJson(pz.propsDict!))).toBe(true);

    // Davies is the engine default -> the key is OMITTED to keep the default path.
    const dv = synthesizeExploreCase({
      ...sspec,
      scaling: { ...sspec.scaling!, activityModel: "davies" },
    });
    const opDv = ((dv.propsDict as Record<string, unknown>).operations as Array<Record<string, unknown>>)[0]!;
    expect(opDv.activityModel).toBeUndefined();
    expect(serialize(fromJson(dv.propsDict!))).not.toMatch(/activityModel/);

    // Likewise omitted when the field is absent entirely.
    const def = synthesizeExploreCase(sspec);
    const opDef = ((def.propsDict as Record<string, unknown>).operations as Array<Record<string, unknown>>)[0]!;
    expect(opDef.activityModel).toBeUndefined();
  });

  it("equilibrium OFF (default): no equilibrate{} / feedFlow — SI-only path byte-identical", () => {
    const f = synthesizeExploreCase(sspec);
    const op = ((f.propsDict as Record<string, unknown>).operations as Array<Record<string, unknown>>)[0]!;
    expect(op.equilibrate).toBeUndefined();
    expect(op.feedFlow).toBeUndefined();
    expect(serialize(fromJson(f.propsDict!))).not.toMatch(/equilibrate/);
  });

  it("equilibrium ON: emits `equilibrate { minerals ( calcite gypsum ); }`", () => {
    const f = synthesizeExploreCase({
      ...sspec,
      scaling: { ...sspec.scaling!, equilibrate: ["calcite", "gypsum"] },
    });
    const op = ((f.propsDict as Record<string, unknown>).operations as Array<Record<string, unknown>>)[0]!;
    // same grammar as tutorials/props/electrolyte/precipitation_ro_brackish
    expect(op.equilibrate).toEqual({ minerals: ["calcite", "gypsum"] });
    const text = serialize(fromJson(f.propsDict!));
    expect(text).toMatch(/equilibrate\s*\{[\s\S]*minerals\s*\(\s*calcite\s+gypsum\s*\)/);
    // round-trips verbatim
    expect(dictEquals(parse(text), fromJson(f.propsDict!))).toBe(true);
  });

  it("feedFlow rides ON equilibrium and carries the m3/h basis", () => {
    const f = synthesizeExploreCase({
      ...sspec,
      scaling: { ...sspec.scaling!, equilibrate: ["calcite", "gypsum"], feedFlowM3h: 10 },
    });
    const op = ((f.propsDict as Record<string, unknown>).operations as Array<Record<string, unknown>>)[0]!;
    expect(op.feedFlow).toBe("10 m3/h");
    expect(serialize(fromJson(f.propsDict!))).toMatch(/feedFlow\s+10 m3\/h;/);
  });

  it("feedFlow without equilibrate is DROPPED (the engine refuses a bare feedFlow)", () => {
    const f = synthesizeExploreCase({
      ...sspec,
      scaling: { ...sspec.scaling!, feedFlowM3h: 10 },   // no equilibrate
    });
    const op = ((f.propsDict as Record<string, unknown>).operations as Array<Record<string, unknown>>)[0]!;
    expect(op.equilibrate).toBeUndefined();
    expect(op.feedFlow).toBeUndefined();
  });

  it("equilibrium composes with pitzer (both legal together)", () => {
    const f = synthesizeExploreCase({
      ...sspec,
      scaling: { ...sspec.scaling!, activityModel: "pitzer", equilibrate: ["calcite", "gypsum"], feedFlowM3h: 12.6 },
    });
    const op = ((f.propsDict as Record<string, unknown>).operations as Array<Record<string, unknown>>)[0]!;
    expect(op.activityModel).toBe("pitzer");
    expect(op.equilibrate).toEqual({ minerals: ["calcite", "gypsum"] });
    expect(op.feedFlow).toBe("12.6 m3/h");
    expect(dictEquals(parse(serialize(fromJson(f.propsDict!))), fromJson(f.propsDict!))).toBe(true);
  });
});

describe("steam-tables synthesis (IAPWS-IF97)", () => {
  // Same dict grammar as tutorials/props/steam/steam01_if97_verification:
  // exactly ONE mode block per op, raw scalars canonical SI (K, Pa).
  const base: Omit<ExploreSpec, "steam"> = {
    components: ["water"],
    properties: [],
    axis: { variable: "T", from: 0, to: 1, n: 2 },   // unused
    state: { composition: { water: 1 } },
  };

  it("saturation mode builds a steamTables op with the saturation block only", () => {
    const f = synthesizeExploreCase({
      ...base,
      steam: { mode: "saturation", from: 273.16, to: 623.15, n: 60 },
    });
    expect((f.controlDict as Record<string, unknown>).application).toBe("choupoProps");
    // IF97 is the water formulation — water alone is the component set.
    expect((f.thermoPackage as Record<string, unknown>).components).toEqual(["water"]);
    const ops = (f.propsDict as Record<string, unknown>).operations as Array<Record<string, unknown>>;
    expect(ops).toHaveLength(1);
    const op = ops[0]!;
    expect(op.type).toBe("steamTables");
    expect(op.saturation).toEqual({ from: 273.16, to: 623.15, n: 60 });
    expect(op.isobar).toBeUndefined();   // the engine refuses two mode blocks
    expect(op.point).toBeUndefined();
    expect((op.output as Record<string, unknown>).file).toBe(EXPLORE_OUTPUT);
  });

  it("the saturation propsDict serializes + round-trips (WASM adapter will accept it)", () => {
    const f = synthesizeExploreCase({
      ...base,
      steam: { mode: "saturation", from: 273.16, to: 623.15, n: 60 },
    });
    const ast = fromJson(f.propsDict!);
    const text = serialize(ast);
    expect(text).toMatch(/type\s+steamTables;/);
    expect(text).toMatch(/saturation/);
    expect(dictEquals(parse(text), ast)).toBe(true);
  });

  it("isobar mode builds the isobar block carrying P (raw SI Pa)", () => {
    const f = synthesizeExploreCase({
      ...base,
      steam: { mode: "isobar", P: 1.0e5, from: 293.15, to: 573.15, n: 57 },
    });
    const op = ((f.propsDict as Record<string, unknown>).operations as Array<Record<string, unknown>>)[0]!;
    expect(op.type).toBe("steamTables");
    expect(op.isobar).toEqual({ P: 1.0e5, from: 293.15, to: 573.15, n: 57 });
    expect(op.saturation).toBeUndefined();
    expect((op.output as Record<string, unknown>).file).toBe(EXPLORE_OUTPUT);
  });

  it("the isobar propsDict serializes + round-trips", () => {
    const f = synthesizeExploreCase({
      ...base,
      steam: { mode: "isobar", P: 1.0e6, from: 293.15, to: 523.15, n: 47 },
    });
    const ast = fromJson(f.propsDict!);
    const round = parse(serialize(ast));
    expect(dictEquals(round, ast)).toBe(true);
  });

  it("isobar without an explicit P defaults to 1 bar (1e5 Pa)", () => {
    const f = synthesizeExploreCase({
      ...base,
      steam: { mode: "isobar", from: 293.15, to: 573.15, n: 57 },
    });
    const op = ((f.propsDict as Record<string, unknown>).operations as Array<Record<string, unknown>>)[0]!;
    expect((op.isobar as Record<string, unknown>).P).toBe(1.0e5);
  });
});
