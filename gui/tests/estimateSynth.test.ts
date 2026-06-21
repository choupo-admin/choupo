import { describe, expect, it } from "vitest";

import { synthesizeExploreCase, type ExploreSpec } from "../src/case/exploreSynth.js";

const base = {
  components: [], properties: [],
  axis: { variable: "T", from: 0, to: 1, n: 2 },
  state: { composition: {} },
};

describe("synthesizeExploreCase — estimate branch (G3)", () => {
  it("emits a one-op estimateComponent case (Joback default, proposal auto, water placeholder)", () => {
    const files = synthesizeExploreCase({
      ...base,
      estimate: {
        component: "pentadiene",
        groups: [{ group: "eCH2", count: 1 }, { group: "eCH", count: 3 }, { group: "CH3", count: 1 }],
      },
    } as ExploreSpec);
    const ops = files.propsDict!.operations as Array<Record<string, unknown>>;
    expect(ops).toHaveLength(1);
    expect(ops[0]!.type).toBe("estimateComponent");
    expect(ops[0]!.component).toBe("pentadiene");
    expect(ops[0]!.model).toBe("Joback");
    expect(ops[0]!.output).toEqual({ proposal: "auto" });
    expect(ops[0]!.groups).toHaveLength(3);
    expect(ops[0]!.reference).toBeUndefined();
    // estimateComponent reads its groups from the op; the thermoPackage just needs
    // a placeholder component to load (the new compound can't be listed — it has no .dat yet).
    expect((files.thermoPackage as Record<string, unknown>).components).toEqual(["water"]);
  });

  it("includes a reference block (SI) only when provided", () => {
    const files = synthesizeExploreCase({
      ...base,
      estimate: {
        component: "x", groups: [{ group: "CH3", count: 2 }],
        reference: { Tb: 300, Tc: 500, Pc: 3.7e6 },
      },
    } as ExploreSpec);
    const ops = files.propsDict!.operations as Array<Record<string, unknown>>;
    expect(ops[0]!.reference).toEqual({ Tb: 300, Tc: 500, Pc: 3.7e6 });
  });

  it("Van Krevelen polymer mode: model + polymer{packing} block, no reference", () => {
    const files = synthesizeExploreCase({
      ...base,
      estimate: {
        component: "polystyrene", estimator: "VanKrevelen",
        groups: [{ group: "CH2", count: 1 }, { group: "CH", count: 1 },
                 { group: "ACH", count: 5 }, { group: "AC", count: 1 }],
        polymer: { packing: 1.6, state: "amorphous" },
      },
    } as ExploreSpec);
    const ops = files.propsDict!.operations as Array<Record<string, unknown>>;
    expect(ops[0]!.model).toBe("VanKrevelen");
    expect(ops[0]!.polymer).toEqual({ packing: 1.6, state: "amorphous" });
    expect(ops[0]!.groups).toHaveLength(4);
  });

  it("Yang 2020 polymer mode: model Yang2020, no polymer block (Tg needs no packing)", () => {
    const files = synthesizeExploreCase({
      ...base,
      estimate: {
        component: "pvc", estimator: "Yang2020",
        groups: [{ group: "CH2", count: 1 }, { group: "CHCl", count: 1 }],
      },
    } as ExploreSpec);
    const ops = files.propsDict!.operations as Array<Record<string, unknown>>;
    expect(ops[0]!.model).toBe("Yang2020");
    expect(ops[0]!.polymer).toBeUndefined();
  });
});
