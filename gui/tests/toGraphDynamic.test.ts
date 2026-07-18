/*---------------------------------------------------------------------------*\
  toGraph dynamic-holdup synthesis tests.

  A dynamicCSTR declares its feed in the 0/streams inlet face + its jacket in
  `operation{}` instead of the steady in/outputs keys, so without the
  synthesis branch it renders as a LONE BOX.  readFlowsheet must grow:
    - a `<unit>.feed` feed terminal (read from the 0/streams face),
    - a `<unit>.out` product terminal (the engine's stream key),
    - a jacket UTILITY stub (dutyPort:"jacket") when operation.UA > 0.
  These tests pin that down so the lone-box regression can't return.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { parse, toJson } from "../src/dict/index.js";
import type { JsonDict } from "../src/dict/index.js";
import { flowsheetToGraph } from "../src/case/toGraph.js";

// The authored dynamic state: 0/streams carries the inlet FACE (the engine's
// grammar -- bc inlet, T, P, per-species molarFlows).
const ZERO_STREAMS = `
time 0;
streams
{
    "reactor.feed"
    {
        bc          inlet;
        T           330.0;
        P           101325;
        molarFlows  { compA 1.389e-8; compB 0.0; }
    }
}
`;

// The authored initial holdup (0/internalState): the jacket tier compares
// T_jacket against this T.
const ZERO_INTERNAL = `
time 0;
units
{
    "reactor"
    {
        type    dynamicCSTR;
        T       320.0;
        P       101325;
        V       0.001;
        holdupMolar { compA 0.012; compB 0.0; }
    }
}
`;

function graphFrom(text: string) {
  const fs = toJson(parse(text, { sourceName: "flowsheetDict" })) as JsonDict;
  return flowsheetToGraph(fs, {
    "0/streams": ZERO_STREAMS,
    "0/internalState": ZERO_INTERNAL,
  });
}

// A jacket-bearing dynamicCSTR (UA > 0, jacket warmer than the cold start).
const CSTR_TEXT = `
units
(
    {
        name        reactor;
        type        dynamicCSTR;
        operation
        {
            UA           50.0;
            T_jacket     360.0 K;
        }
        reaction    compA_to_compB;
    }
);
`;

describe("toGraph — dynamicCSTR grows feed/product/jacket from its sub-dicts", () => {
  const g = graphFrom(CSTR_TEXT);
  const ids = new Set(g.nodes.map((n) => n.id));

  it("synthesises a feed terminal from the 0/streams inlet face", () => {
    expect(ids.has("stream:reactor.feed")).toBe(true);
    const feed = g.nodes.find((n) => n.id === "stream:reactor.feed")!;
    expect((feed.data as { role?: string }).role).toBe("feed");
    // inlet T 330 K canonicalises into the StreamSpec.
    const spec = (feed.data as { stream?: { T: number; composition: Record<string, number> } }).stream;
    expect(spec?.T).toBeCloseTo(330.0, 6);
    expect(spec?.composition).toMatchObject({ compA: 1.0 });
  });

  it("synthesises a product terminal named `<unit>.out` (the engine stream key)", () => {
    expect(ids.has("stream:reactor.out")).toBe(true);
    const out = g.nodes.find((n) => n.id === "stream:reactor.out")!;
    expect((out.data as { role?: string }).role).toBe("product");
  });

  it("docks a jacket utility stub (heating: jacket above the holdup)", () => {
    const jacket = g.nodes.find((n) => n.id === "duty:reactor:jacket");
    expect(jacket).toBeDefined();
    expect((jacket!.data as { dutyPort?: string }).dutyPort).toBe("jacket");
    expect((jacket!.data as { role?: string }).role).toBe("utility");
    expect((jacket!.data as { tier?: string }).tier).toBe("heating");
  });

  it("draws the feed→reactor and reactor→out edges plus the jacket edge", () => {
    const edgeLabels = g.edges.map((e) => e.label);
    expect(edgeLabels).toContain("reactor.feed");
    expect(edgeLabels).toContain("reactor.out");
    expect(g.edges.some((e) => e.id === "e:duty:reactor:jacket")).toBe(true);
  });

  it("no longer a lone box — the reactor has both an inbound and an outbound edge", () => {
    const intoReactor = g.edges.filter((e) => e.target === "unit:reactor"
      && (e.data as { kind?: string } | undefined)?.kind !== "duty");
    const outOfReactor = g.edges.filter((e) => e.source === "unit:reactor");
    expect(intoReactor.length).toBeGreaterThanOrEqual(1);
    expect(outOfReactor.length).toBeGreaterThanOrEqual(1);
  });
});

describe("toGraph — dynamic synthesis is additive (cooling jacket + no-UA + explicit wiring)", () => {
  it("a jacket COLDER than the start docks as a cooling stub", () => {
    const cold = CSTR_TEXT.replace("T_jacket     360.0 K;", "T_jacket     300.0 K;");
    const g = graphFrom(cold);
    const jacket = g.nodes.find((n) => n.id === "duty:reactor:jacket");
    expect((jacket!.data as { tier?: string }).tier).toBe("cooling");
  });

  it("UA = 0 (adiabatic) grows NO jacket stub", () => {
    const adiabatic = CSTR_TEXT.replace("UA           50.0;", "UA           0.0;");
    const g = graphFrom(adiabatic);
    expect(g.nodes.some((n) => n.id === "duty:reactor:jacket")).toBe(false);
    // ... but the feed/product still synthesise.
    expect(g.nodes.some((n) => n.id === "stream:reactor.feed")).toBe(true);
  });

  it("an author who wires the unit by hand keeps control (no synthesis)", () => {
    const explicit = `
units
(
    {
        name   reactor;
        type   dynamicCSTR;
        in     myFeed;
        outputs ( myProduct );
        operation { UA 50.0; T_jacket 360.0 K; }
    }
);
`;
    const g = graphFrom(explicit);
    // The author's names win; no `reactor.feed`/`reactor.out` synthesised.
    expect(g.nodes.some((n) => n.id === "stream:reactor.feed")).toBe(false);
    expect(g.edges.some((e) => e.label === "myFeed")).toBe(true);
    expect(g.edges.some((e) => e.label === "myProduct")).toBe(true);
  });
});
