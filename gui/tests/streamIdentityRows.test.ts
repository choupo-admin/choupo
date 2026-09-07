/*---------------------------------------------------------------------------*\
  ONE ROW PER PHYSICAL STREAM.

  The engine's result payload is keyed by every NAME a stream answers to: its
  qualified identity (`DRYING.ExhaustClean`), the bare sector label the relabel
  pass mints (`ExhaustClean`), and the plant's own boundary label (`Stack`).
  All three must resolve, because a golden, a case file and a canvas edge each
  speak a different one.  A TABLE, though, must draw the pipe once -- the
  flagship plant printed 52 rows for 25 pipes, and the duplicates rendered with
  a blank PFD number because a bare sector label is in no view's connection
  list and so belongs to no numbering class.

  The engine decides which names are labels and publishes the answer per stream
  (`aliasOf`); the adapter applies it and moves the extra names into
  `streamAliases`, so every surface that tabulates or sums streams counts each
  pipe once WITHOUT a de-duplication rule of its own.  These tests pin that
  seam: what is dropped, what the drop must not break, and the role a plant
  outlet keeps once its label row is gone.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { shapeStreams, shapeStreamAliases } from "../src/adapters/WasmAdapter.js";
import { findRunStream } from "../src/ui/streamPopOut.js";
import type { StreamResult } from "../src/adapters/SolverAdapter.js";

//  A two-sector plant in the flagship's shape: two sectors each producing a
//  stream the plant exports under its own name, and -- the case that makes
//  name identity impossible -- a `Vapour` in BOTH sectors.
const flowsheet = {
  sectors: ["DRYING", "FERMENTATION"],
  boundary: { inlets: ["Air"], outlets: ["Stack", "EthanolVapour"] },
  connections: {
    Air: { to: "DRYING/Air" },
    Stack: { from: "DRYING/Vapour" },
    EthanolVapour: { from: "FERMENTATION/Vapour" },
  },
} as never;

const S = (F: number, extra: Record<string, unknown> = {}) => ({
  F, T: 350, P: 1e5, composition: { x: 1 }, F_mass: F, ...extra,
});

const payload = {
  version: 1, converged: true, components: ["x"], kpis: {},
  streams: {
    Air: S(1),
    "DRYING.Vapour": S(0.4, { boundaryLabel: "Stack" }),
    "FERMENTATION.Vapour": S(0.6, { boundaryLabel: "EthanolVapour" }),
    // the plant's own labels -- the same two pipes under the author's names
    Stack: S(0.4, { aliasOf: "DRYING.Vapour" }),
    EthanolVapour: S(0.6, { aliasOf: "FERMENTATION.Vapour" }),
  },
} as never;

describe("one row per physical stream", () => {
  const rows = shapeStreams(payload, { flowsheet } as never);

  it("drops the label entries -- three pipes, three rows", () => {
    expect(rows.map((s) => s.name).sort()).toEqual(
      ["Air", "DRYING.Vapour", "FERMENTATION.Vapour"],
    );
  });

  it("a stream the plant declared as an outlet keeps its product role", () => {
    // Without the engine's `boundaryLabel` these two read `intermediate`: the
    // root dict names the OUTLETS `Stack` and `EthanolVapour`, and nothing in
    // it mentions `DRYING.Vapour` at all.
    const role = (n: string) => rows.find((s) => s.name === n)?.role;
    expect(role("DRYING.Vapour")).toBe("product");
    expect(role("FERMENTATION.Vapour")).toBe("product");
    expect(role("Air")).toBe("feed");
  });

  it("carries the plant's own name for the row, as a field not a row", () => {
    const label = (n: string) => rows.find((s) => s.name === n)?.boundaryLabel;
    expect(label("DRYING.Vapour")).toBe("Stack");
    expect(label("FERMENTATION.Vapour")).toBe("EthanolVapour");
    expect(label("Air")).toBeUndefined();   // never leaves under another name
  });

  it("the dropped names become the alias map", () => {
    expect(shapeStreamAliases(payload)).toEqual({
      Stack: "DRYING.Vapour",
      EthanolVapour: "FERMENTATION.Vapour",
    });
  });

  it("a payload with no labels gets no alias map at all", () => {
    const flat = {
      version: 1, converged: true, components: ["x"], kpis: {},
      streams: { feed: S(1), product: S(1) },
    } as never;
    expect(shapeStreamAliases(flat)).toBeUndefined();
    expect(shapeStreams(flat, { flowsheet: { streams: { feed: {} },
      units: [{ name: "U", in: "feed", outputs: ["product"] }] } } as never)
      .map((s) => s.name).sort()).toEqual(["feed", "product"]);
  });
});

describe("a lookup by the author's name still finds the pipe", () => {
  const rows = shapeStreams(payload, { flowsheet } as never) as StreamResult[];
  const aliases = shapeStreamAliases(payload)!;

  it("resolves a plant label to the identity that carries the values", () => {
    expect(findRunStream(rows, "Stack", aliases)?.name).toBe("DRYING.Vapour");
  });

  it("resolves a canvas endpoint written with a slash", () => {
    expect(findRunStream(rows, "DRYING/Vapour", aliases)?.name)
      .toBe("DRYING.Vapour");
  });

  //  THE REASON THE MAP EXISTS.  `findRunStream`'s last resort is a LEAF
  //  match, and both these pipes have the leaf `Vapour`: `EthanolVapour`
  //  ends with it, so the guess would have taken the plant's ethanol product
  //  to whichever `*.Vapour` the list happened to hold first.  Identity is
  //  (kind, sector, name), never name alone.
  it("takes the engine's answer, not the leaf guess, when leaves collide", () => {
    expect(findRunStream(rows, "EthanolVapour", aliases)?.name)
      .toBe("FERMENTATION.Vapour");
  });
});
