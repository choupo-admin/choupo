/*---------------------------------------------------------------------------*\
  Boundary-stream classification (shapeStreams).  A stream consumed only via a
  multi-input `inputs (...)` block (mixer feeds, a pumped recycle) must read as
  INTERMEDIATE, not a false PRODUCT -- otherwise the mass-balance plot's OUTPUTS
  bar is inflated and the global balance "doesn't close" (the acetic-acid case).
\*---------------------------------------------------------------------------*/

import { describe, it, expect } from "vitest";
import { shapeStreams } from "../src/adapters/WasmAdapter.js";

// A reactor -> flash -> column with a pumped distillate recycle (tear), and TWO
// mixers that take their feeds via `inputs (...)` (plural).
const flowsheet = {
  tearStreams: ["MeohRecycle"],
  streams: { freshMethanol: {}, freshCO: {}, MeohRecycle: {} },
  units: [
    { name: "PreheatCO", in: "freshCO", outputs: ["HotCO"] },
    { name: "Pump", in: "MeohRecycle", outputs: ["MeohRecycleHP"] },
    { name: "Mix1", inputs: ["freshMethanol", "MeohRecycleHP"], outputs: ["MeohCombined"] },
    { name: "PreheatMeoh", in: "MeohCombined", outputs: ["HotMethanol"] },
    { name: "Mix2", inputs: ["HotMethanol", "HotCO"], outputs: ["ReactorFeed"] },
    { name: "Reactor", in: "ReactorFeed", outputs: ["ReactorOut"] },
    { name: "Flash", in: "ReactorOut", outputs: ["CrudeAcid", "OffGas"] },
    { name: "Column", in: "CrudeAcid", outputs: ["MeohRecycle", "Product"] },
  ],
} as never;
const S = (F: number) => ({ F, T: 350, P: 1e5, composition: { x: 1 }, F_mass: F });
const payload = { version: 1, converged: true, components: ["x"], kpis: {}, streams: {
  freshMethanol: S(1), freshCO: S(1), MeohRecycle: S(0.3), MeohRecycleHP: S(0.3),
  HotCO: S(1), HotMethanol: S(1.3), MeohCombined: S(1.3), ReactorFeed: S(2.3),
  ReactorOut: S(2.3), CrudeAcid: S(1.5), OffGas: S(0.8), Product: S(1.2),
} } as never;

describe("shapeStreams role classification", () => {
  const role = (name: string) => {
    const out = shapeStreams(payload, { flowsheet } as never);
    return out.find((s) => s.name === name)?.role;
  };

  it("feeds = declared boundary streams (not the tear)", () => {
    expect(role("freshMethanol")).toBe("feed");
    expect(role("freshCO")).toBe("feed");
  });
  it("the tear is intermediate, not a feed", () => {
    expect(role("MeohRecycle")).toBe("intermediate");
  });
  it("streams consumed via `inputs` are intermediate, NOT false products", () => {
    expect(role("MeohRecycleHP")).toBe("intermediate");  // pump out -> Mix1 inputs
    expect(role("HotCO")).toBe("intermediate");           // preheat out -> Mix2 inputs
    expect(role("HotMethanol")).toBe("intermediate");     // preheat out -> Mix2 inputs
  });
  it("true products = produced-and-not-consumed", () => {
    expect(role("Product")).toBe("product");
    expect(role("OffGas")).toBe("product");
  });
});
