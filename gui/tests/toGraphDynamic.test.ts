/*---------------------------------------------------------------------------*\
  toGraph on a dynamic-holdup unit (the ratified state layout, task #186).

  A dynamicCSTR declares its feed and its product like every other unit
  (`in feed;` + `outputs ( product );`), the feed's state lives in its own
  file `0/feed` and the vessel's starting holdup in `0/internalStates/reactor`.
  So there is NO synthesis any more: readFlowsheet reads the stream from its
  file exactly as it reads a steady stream, and grows
    - the feed terminal from `0/feed`,
    - the product terminal from the declared output,
    - a jacket UTILITY stub (dutyPort:"jacket") when operation.UA > 0, whose
      heating/cooling tier compares T_jacket with the holdup's own T.
  The retired shape (`0/streamFaces`, `0/internalState`) is NOT read -- a
  case still carrying it is refused by the engine, and the canvas draws no
  face it would have to pretend to understand.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";

import { parse, toJson } from "../src/dict/index.js";
import type { JsonDict } from "../src/dict/index.js";
import { flowsheetToGraph } from "../src/case/toGraph.js";

// The feed's state: ONE file, the canonical stream grammar.
const ZERO_FEED = `
componentMolarFlows
{
    compA   1.389e-8 kmol/s;
    compB   0.0 kmol/s;
}
T   330.0 K;
P   101325 Pa;
`;

// The vessel's starting holdup: the jacket tier compares T_jacket with this T.
const ZERO_HOLDUP = `
recordType  internalState;
unit        "reactor";
equipment   dynamicCSTR;
holdup
{
    T       320.0;
    P       101325;
    V       0.001;
    holdupMolar { compA 0.012; compB 0.0; }
}
`;

function graphFrom(text: string, files?: { [k: string]: string }) {
  const fs = toJson(parse(text, { sourceName: "flowsheetDict" })) as JsonDict;
  return flowsheetToGraph(fs, files ?? {
    "0/feed": ZERO_FEED,
    "0/internalStates/reactor": ZERO_HOLDUP,
  });
}

// A jacket-bearing dynamicCSTR (UA > 0, jacket warmer than the cold start).
const CSTR_TEXT = `
units
(
    {
        name        reactor;
        type        dynamicCSTR;
        in          feed;
        outputs     ( product );
        operation
        {
            UA           50.0;
            T_jacket     360.0 K;
        }
        reaction    compA_to_compB;
    }
);
`;

describe("toGraph — a dynamicCSTR draws its declared streams and its jacket", () => {
  const g = graphFrom(CSTR_TEXT);
  const ids = new Set(g.nodes.map((n) => n.id));

  it("reads the feed terminal from its own file 0/feed", () => {
    expect(ids.has("stream:feed")).toBe(true);
    const feed = g.nodes.find((n) => n.id === "stream:feed")!;
    expect((feed.data as { role?: string }).role).toBe("feed");
    const spec = (feed.data as { stream?: { T: number; composition: Record<string, number> } }).stream;
    expect(spec?.T).toBeCloseTo(330.0, 6);
    expect(spec?.composition).toMatchObject({ compA: 1.0 });
  });

  it("draws the declared product terminal", () => {
    expect(ids.has("stream:product")).toBe(true);
    const out = g.nodes.find((n) => n.id === "stream:product")!;
    expect((out.data as { role?: string }).role).toBe("product");
  });

  it("docks a jacket utility stub (heating: jacket above the holdup)", () => {
    const jacket = g.nodes.find((n) => n.id === "duty:reactor:jacket");
    expect(jacket).toBeDefined();
    expect((jacket!.data as { dutyPort?: string }).dutyPort).toBe("jacket");
    expect((jacket!.data as { role?: string }).role).toBe("utility");
    expect((jacket!.data as { tier?: string }).tier).toBe("heating");
  });

  it("draws the feed→reactor and reactor→product edges plus the jacket edge", () => {
    const edgeLabels = g.edges.map((e) => e.label);
    expect(edgeLabels).toContain("feed");
    expect(edgeLabels).toContain("product");
    expect(g.edges.some((e) => e.id === "e:duty:reactor:jacket")).toBe(true);
  });
});

describe("toGraph — the jacket tier reads the holdup record", () => {
  it("a jacket COLDER than the holdup's start docks as a cooling stub", () => {
    const cold = CSTR_TEXT.replace("T_jacket     360.0 K;", "T_jacket     300.0 K;");
    const g = graphFrom(cold);
    const jacket = g.nodes.find((n) => n.id === "duty:reactor:jacket");
    expect((jacket!.data as { tier?: string }).tier).toBe("cooling");
  });

  it("UA = 0 (adiabatic) grows NO jacket stub, and the streams still draw", () => {
    const adiabatic = CSTR_TEXT.replace("UA           50.0;", "UA           0.0;");
    const g = graphFrom(adiabatic);
    expect(g.nodes.some((n) => n.id === "duty:reactor:jacket")).toBe(false);
    expect(g.nodes.some((n) => n.id === "stream:feed")).toBe(true);
  });

  it("the retired files are not read: no face terminal is synthesised from them", () => {
    const bare = CSTR_TEXT.replace("        in          feed;\n", "")
      .replace("        outputs     ( product );\n", "");
    const g = graphFrom(bare, {
      "0/streamFaces": 'time 0; faces { "reactor.feed" { bc inlet; T 330; P 1e5; molarFlows { compA 1e-8; } } }',
      "0/internalState": 'time 0; units { "reactor" { T 320; P 1e5; V 0.001; holdupMolar { compA 0.012; } } }',
    });
    expect(g.nodes.some((n) => n.id === "stream:reactor.feed")).toBe(false);
    expect(g.nodes.some((n) => n.id === "stream:reactor.out")).toBe(false);
  });
});
