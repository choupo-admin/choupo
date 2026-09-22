/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  EVERY SHIPPED LESSON EQUATION PARSES.

  The EduTool equations became LaTeX on 2026-09-22 and are drawn by KaTeX.
  Nothing in this suite renders a component -- vitest runs `environment:
  "node"` -- but KaTeX itself runs perfectly well in node, so the question
  "does this LaTeX parse?" is answerable here, and it is the cheapest guard
  there is against a silent regression: an unparsed formula paints a failure
  box on a student's page, and this suite turns that into a red test instead.

  COVERAGE FOLLOWS THE ABSTRACTION, NOT A HAND-KEPT LIST.  The modules are
  found the way check_lesson_symbols finds them -- every `*Lesson.ts`, plus
  any `*Tool.tsx` that carries LessonStep steps of its own -- so a new lesson
  is covered the day it lands, and a lesson that stops being one stops being
  counted.  That rule is repeated here rather than shared because the gate is
  Python and this is TypeScript; what they share is the RULE, and each states
  it in its own words.

  WHAT THIS DOES NOT CHECK, and it is the half that matters: whether the
  equation is RIGHT.  A perfectly-parsing `E = mc^3` passes here.  Whether a
  formula says what it meant before it was converted is a reading job, done
  once, by a person; this only holds the conversion from rotting afterwards.
\*---------------------------------------------------------------------------*/

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { renderTex } from "../src/ui/methods/lessonTex.js";
import type { LessonStep } from "../src/ui/methods/lessonStep.js";

const MODULES = import.meta.glob("../src/ui/methods/*.{ts,tsx}");

/** The lesson modules: every `*Lesson.ts`.  Nothing is imported here --
 *  `import.meta.glob` without `eager` hands back loaders, so the 30-odd tool
 *  modules are never executed. */
function lessonModulePaths(): string[] {
  return Object.keys(MODULES).filter((p) => p.endsWith("Lesson.ts")).sort();
}

/** A `*Tool.tsx` that draws LessonStep steps must not DECLARE them.
 *
 *  This is the invariant that makes the parse arm below complete, and it was
 *  bought rather than assumed: PONCHON_STEPS used to live inside
 *  PonchonSavaritTool.tsx, and importing that page in node dies on plotly
 *  ("self is not defined").  So the one lesson a test could not read was the
 *  one whose steps were not in a data module.  Reading the SOURCE is enough
 *  to hold the rule and costs no import.
 *
 *  Tools with their own private step type (ThielePelletTool,
 *  FlashOperatingLineTool) are a different, older shape and are not LessonStep
 *  pages; they are out of this rule by the same test the Python gate uses --
 *  whether the file speaks of LessonStep at all. */
function toolsDeclaringSteps(): string[] {
  return Object.keys(MODULES).filter((p) => {
    if (!p.endsWith("Tool.tsx")) return false;
    const src = readFileSync(fileURLToPath(new URL(p, import.meta.url)), "utf8");
    return src.includes("LessonStep") && /\n\s*formula:/.test(src);
  }).sort();
}

/** Structural, not by name: a lesson module exports its steps under its own
 *  const name (KREMSER_STEPS, PONCHON_STEPS, ...), and a list of those names
 *  here would be the hand-kept list this file just refused to keep. */
function stepsIn(mod: Record<string, unknown>): LessonStep[] {
  const out: LessonStep[] = [];
  for (const v of Object.values(mod)) {
    if (!Array.isArray(v)) continue;
    if (v.length === 0) continue;
    const first = v[0] as Record<string, unknown>;
    if (first && typeof first === "object"
        && typeof first["n"] === "number"
        && typeof first["title"] === "string"
        && typeof first["body"] === "string") {
      out.push(...(v as LessonStep[]));
    }
  }
  return out;
}

/** One LaTeX string with enough context to find it when it fails. */
interface Piece { where: string; role: string; src: string; mode: "display" | "inline"; }

async function everyPiece(): Promise<Piece[]> {
  const out: Piece[] = [];
  for (const path of lessonModulePaths()) {
    const load = MODULES[path];
    if (!load) throw new Error(`no loader for ${path}`);
    const mod = await load() as Record<string, unknown>;
    const name = path.split("/").pop() ?? path;
    for (const s of stepsIn(mod)) {
      const at = `${name} step ${s.n} (${s.title})`;
      if (s.formula) out.push({ where: at, role: "formula", src: s.formula, mode: "display" });
      for (const g of s.where ?? [])
        out.push({ where: at, role: `where sym`, src: g.sym, mode: "inline" });
      for (const d of s.derivation ?? [])
        if (d.eq) out.push({ where: at, role: "derivation eq", src: d.eq, mode: "display" });
    }
  }
  return out;
}

describe("every EduTool lesson equation is LaTeX that parses", () => {
  it("finds the lesson modules at all", () => {
    //  A check that cannot run must not pass: if the glob stops matching,
    //  this file would report a green suite over nothing.
    expect(lessonModulePaths().length).toBeGreaterThanOrEqual(23);
  });

  it("no Tool.tsx declares LessonStep steps of its own", () => {
    //  If one does, its equations are outside the parse arm below -- and a
    //  page whose equations nothing checks is exactly what this file exists
    //  to prevent.  The remedy is a `*Lesson.ts` data module beside it.
    expect(toolsDeclaringSteps()).toEqual([]);
  });

  //  The Ponchon-Savarit steps live inside a Tool.tsx, so reaching them pulls
  //  that page's imports (the plot, and through it the bundled tutorial
  //  corpus).  The generous timeout is the price of covering a lesson that
  //  does not live in a data module, and it is worth paying: the alternative
  //  is a test that silently skips the one page whose shape is different.
  it("parses every formula, derivation equation and glossed symbol", async () => {
    const pieces = await everyPiece();
    expect(pieces.length).toBeGreaterThan(500);
    const broken: string[] = [];
    for (const p of pieces) {
      const r = renderTex(p.src, p.mode);
      if (!r.ok) broken.push(`${p.where} — ${p.role}: ${r.message}\n      ${p.src}`);
    }
    expect(broken.join("\n  ")).toBe("");
  }, 180_000);

  it("reports a parse failure instead of degrading it", () => {
    const r = renderTex(String.raw`\frac{1}{`, "display");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toContain("KaTeX parse error");
      //  The source travels with the failure BECAUSE the page has to show
      //  it; an equation that did not render must be visible and repairable
      //  from what is on the screen.
      expect(r.source).toBe(String.raw`\frac{1}{`);
    }
  });

  it("renders \\ce{} — a species is DECLARED, never guessed by shape", () => {
    const r = renderTex(String.raw`\ce{CO2(aq) + H2O <=> HCO3- + H+}`, "display");
    expect(r.ok).toBe(true);
  });

  it("an empty formula is a failure, not an empty box", () => {
    expect(renderTex("   ", "display").ok).toBe(false);
  });
});
