/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  methodOrigins -- EVERY EDUTOOL SAYS WHERE ITS NUMBERS COME FROM
  (DEV.md 4c C112, points 15 and 18).

  The ruling: a visible ORIGIN mark per value, or per panel where every value
  shares one -- engine, page, reference, assumption (originKinds.ts) -- and no
  per-value provenance sheet.  Each tool's registry entry declares the set of
  origins its pages carry (`origins`), the tool frame draws that set as the
  legend, and the homepage prints it on the tool's card.  This file holds the
  declaration and the drawing together, for EVERY live tool at once, the list
  of tools derived from METHOD_TOOLS and the component that draws each one
  derived from the dispatch in MethodsWorkspace.tsx (the methodMounting
  precedent: never a hand-kept list).

  The arms:
    (a) every live tool declares `origins`, each a known word, no repeats,
        in the canonical order (so a reader of the registry meets them the
        way the legend prints them);
    (b) DECLARED => DRAWN: every declared origin appears on at least one
        OriginMark (or a Panel's required `origin`) in the tool's own source;
    (c) DRAWN => DECLARED: no mark in the source names an origin the entry
        does not declare (the legend would then hide it);
    (d) an EMPTY declaration draws no mark, and a non-empty one draws at
        least one -- empty is a statement ("no result on this page"), not a
        way to skip the check;
    (e) every mark's `of` is a LITERAL the parser can read -- a computed
        `of={x}` would make (b) and (c) blind to it;
    (f) the frame draws the legend from the active tool's declaration;
    (g) point 17's shared half: every EduTools run hook publishes the
        engine's own warnings (case/engineCaveats.ts) and the frame draws
        them, so a knob that takes a witness outside a model's validity is
        said, in the engine's words, on every engine-run page.

  BLIND SPOT, said plainly: this reads source text.  It sees that each origin
  a tool claims is drawn somewhere on its page and that none is drawn which is
  not claimed; it does NOT see a result panel that carries no mark at all, nor
  whether a mark's word is TRUE of the numbers beside it.  Both of those were
  established by reading each page when the marks were placed, and stay the
  author's responsibility -- a test that claimed more would be the
  over-broad claim C112 exists to remove.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { METHOD_TOOLS } from "../src/ui/methods/registry.js";
import { ORIGIN_KINDS, ORIGIN_MEANING, type OriginKind } from "../src/ui/methods/originKinds.js";
import { caveatsOf } from "../src/case/engineCaveats.js";
import type { RunResult } from "../src/adapters/SolverAdapter.js";

const read = (rel: string): string =>
  readFileSync(new URL(rel, import.meta.url), "utf-8");

const WORKSPACE = read("../src/ui/MethodsWorkspace.tsx");

/** The two tools whose components live INSIDE MethodsWorkspace.tsx: their
 *  source is the body of the named function, not the whole file (the file
 *  holds both, and the legend's own code). */
const IN_FILE: Readonly<Record<string, string>> = {
  mccabe: "McCabeTool",
  psychro: "PsychroTool",
};

function functionBody(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) return "";
  const next = src.indexOf("\nfunction ", start + 1);
  return next < 0 ? src.slice(start) : src.slice(start, next);
}

/** The source that draws a tool, from the dispatch the app actually runs. */
function sourceOf(id: string): { file: string; src: string } | null {
  if (IN_FILE[id]) {
    return { file: `MethodsWorkspace.tsx#${IN_FILE[id]}`,
      src: functionBody(WORKSPACE, IN_FILE[id]!) };
  }
  const arm = new RegExp(`tool === "${id}" \\? <(\\w+)`).exec(WORKSPACE);
  if (!arm) return null;
  const comp = arm[1]!;
  const lazy = new RegExp(
    `const ${comp} = lazy\\(\\(\\) =>\\s*import\\("\\./methods/(\\w+)\\.js"\\)`)
    .exec(WORKSPACE);
  if (!lazy) return null;
  const file = `methods/${lazy[1]}.tsx`;
  return { file, src: read(`../src/ui/${file}`) };
}

/** Comments stripped, so a mark quoted in a comment is not counted as drawn. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Every origin word a source DRAWS: OriginMark `of`, and a Panel's `origin`. */
function drawnKinds(src: string): { kinds: Set<string>; marks: number; literal: number } {
  const c = code(src);
  const kinds = new Set<string>();
  let literal = 0;
  const lit = /(?:<OriginMark\s+of|\borigin)=(?:\{\[([^\]]*)\]\}|"(\w+)")/g;
  for (const m of c.matchAll(lit)) {
    literal += 1;
    if (m[2]) kinds.add(m[2]);
    else for (const w of (m[1] ?? "").matchAll(/"(\w+)"/g)) kinds.add(w[1]!);
  }
  //  A page-local Panel that FORWARDS a required `origin` prop to its mark
  //  (`<OriginMark of={origin}`) is a wrapper, not a mark: the Panel CALLS
  //  carry the literals, and the type makes the prop mandatory.  It is
  //  excused only where the prop is declared required, so an optional
  //  `origin?:` cannot open a hole here.
  const forwarders = (c.match(/<OriginMark\s+of=\{origin\}/g) ?? []).length;
  if (forwarders > 0 && !/\borigin:\s*OriginKind\b/.test(c)) {
    throw new Error("a mark forwards `origin` from a prop that is not a "
      + "required OriginKind");
  }
  const marks = (c.match(/<OriginMark\s+of=|<Panel\b[^>]*\borigin=/g) ?? []).length
    - forwarders;
  return { kinds, marks, literal };
}

const LIVE = METHOD_TOOLS.filter((t) => t.status === "live");

describe("every EduTool declares where its numbers come from", () => {
  it("is checked over the whole live registry, not a sample", () => {
    expect(LIVE.length, "no live tools -- the registry read nothing")
      .toBeGreaterThan(40);
  });

  it("(a) declares known origin words, once each, in the legend's order", () => {
    for (const t of LIVE) {
      expect(Array.isArray(t.origins), `${t.id}: no \`origins\` declared`).toBe(true);
      for (const k of t.origins)
        expect(ORIGIN_KINDS as readonly string[], `${t.id}: unknown origin "${k}"`)
          .toContain(k);
      expect(new Set(t.origins).size, `${t.id}: an origin is repeated`)
        .toBe(t.origins.length);
      const order = t.origins.map((k) => ORIGIN_KINDS.indexOf(k));
      expect([...order].sort((x, y) => x - y), `${t.id}: origins out of order`)
        .toEqual(order);
    }
  });

  it("(b, c, d, e) draws exactly the origins it declares", () => {
    for (const t of LIVE) {
      const s = sourceOf(t.id);
      expect(s, `${t.id}: no component found in MethodsWorkspace's dispatch`)
        .not.toBeNull();
      const { kinds, marks, literal } = drawnKinds(s!.src);
      for (const k of t.origins)
        expect([...kinds], `${t.id} (${s!.file}) declares "${k}" and draws no `
          + "mark carrying it -- the legend would claim an origin the page "
          + "never shows").toContain(k);
      for (const k of kinds)
        expect(t.origins as readonly string[], `${t.id} (${s!.file}) draws a "${k}" `
          + "mark its registry entry does not declare -- the legend would hide "
          + "it").toContain(k as OriginKind);
      if (t.origins.length === 0)
        expect(marks, `${t.id}: declares no result, yet draws a mark`).toBe(0);
      else
        expect(marks, `${t.id}: declares origins and draws no mark`)
          .toBeGreaterThan(0);
      expect(literal, `${t.id} (${s!.file}): a mark's \`of\` is not a literal the `
        + "check can read").toBe(marks);
    }
  });

  it("(f) the tool frame draws the legend from the active tool's declaration", () => {
    expect(code(WORKSPACE)).toMatch(/<OriginLegend\s+origins=\{active\.origins\}/);
  });

  it("(g) the frame draws the engine's own caveats, and every run hook publishes them", () => {
    //  DEV.md 4c C112 point 17: a knob at its extreme takes a witness out of
    //  a model's validity and the ENGINE says so; the page must not drop it.
    expect(code(WORKSPACE)).toMatch(/<EngineCaveats\s*\/>/);
    const run = code(read("../src/case/methodRun.ts"));
    expect((run.match(/usePublishCaveats\(/g) ?? []).length,
      "useCaseFilesRun and useMethodRunSweep must both publish").toBe(2);
    expect(code(read("../src/case/engineSeries.ts"))).toMatch(/usePublishCaveats\(state\.results\)/);
    const list = caveatsOf([
      { advisories: [
        { category: "validity", severity: "warning", locus: "component 'NH3'",
          message: "integrated outside its declared Trange" },
        { category: "init", severity: "info", locus: "tear", message: "seeded" },
      ] } as unknown as RunResult,
      null,
    ]);
    expect(list).toEqual([{ category: "validity", locus: "component 'NH3'",
      message: "integrated outside its declared Trange" }]);
  });

  it("every origin word has a meaning to print", () => {
    for (const k of ORIGIN_KINDS)
      expect(ORIGIN_MEANING[k].length, `"${k}" has no meaning`).toBeGreaterThan(20);
  });
});
