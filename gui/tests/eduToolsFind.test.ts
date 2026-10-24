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
  The EduTools Find (DEV.md 4c C113, part 2).  Pinned: the index is DERIVED
  from the lesson modules and the tool sources (never a list); it finds a
  chapter by its title, by its text and by its equation glossary; accents,
  capitals and word order do not matter; a hit opens THE tool AT its chapter
  and its link is `?workspace=methods&tool=<id>&step=<chapter>`; and the
  index stays out of the initial bundle (a dynamic import, no Tool imported).

  The expected chapters are read off the LESSON DATA, never typed here: the
  lessons are being edited by other hands, and a test that pinned a title
  would fail on a wording fix while the Find still worked.
\*---------------------------------------------------------------------------*/

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { TOOL_LESSONS } from "virtual:edutool-lessons";

import { headingText, readEduToolSources } from "../scripts/eduToolLessonsPlugin.js";
import { fold } from "../src/search/textSearch.js";
import { chapterSlug } from "../src/ui/methods/chapters.js";
import { openEduHit } from "../src/ui/methods/EduToolsFind.js";
import {
  eduHitHref, eduToolsIndex, searchEduTools, type EduDoc,
} from "../src/ui/methods/eduToolsIndex.js";
import { LETDOWN_STEPS } from "../src/ui/methods/letdownLesson.js";
import { SINES_STEPS } from "../src/ui/methods/sinesPtaLesson.js";
import { PUMP_STEPS } from "../src/ui/methods/pumpSystemLesson.js";
import {
  METHOD_TOOLS, bootChapter, getActiveMethodTool, getMethodChapterRequest,
} from "../src/ui/methods/registry.js";

const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf-8");

describe("the index is derived", () => {
  it("pairs each tool with the lesson modules its source imports", () => {
    const s = readEduToolSources();
    expect(s.lessons.letdown).toEqual(["letdownLesson"]);
    expect(s.lessons["pump-system"]).toEqual(["pumpSystemLesson"]);
    // A tool drawn INSIDE MethodsWorkspace.tsx is read from its function body.
    expect(s.lessons.mccabe).toEqual(["mccabeLesson"]);
    expect(s.lessons.psychro).toEqual(["psychroLesson"]);
    // The virtual module the app imports is the same derivation.
    expect(TOOL_LESSONS).toEqual(s.lessons);
  });

  it("every lesson module is drawn by some tool (none is unreachable to the Find)", () => {
    const paired = new Set(Object.values(TOOL_LESSONS).flat());
    const modules = Object.keys(import.meta.glob("../src/ui/methods/*Lesson.ts"))
      .map((p) => p.replace(/^.*\//, "").replace(/\.ts$/, ""));
    expect(modules.length).toBeGreaterThan(30);
    expect(modules.filter((m) => !paired.has(m))).toEqual([]);
  });

  it("every live tool has a row, and lessons give it chapters", () => {
    const docs = eduToolsIndex();
    for (const t of METHOD_TOOLS.filter((m) => m.status === "live")) {
      expect(docs.some((d) => d.tool === t.id && d.kind === "tool"), t.id).toBe(true);
    }
    expect(docs.filter((d) => d.tool === "letdown" && d.kind === "step").length)
      .toBe(LETDOWN_STEPS.length);
    // The newest tool (C143, landed after this index was written) is indexed
    // chapter by chapter with no edit here: the index is DERIVED.
    expect(docs.filter((d) => d.tool === "sines-pta" && d.kind === "step").length)
      .toBe(SINES_STEPS.length);
  });

  it("reads a notes page's own plain-text headings, skipping expressions", () => {
    expect(headingText("2 · A thermometer measures T")).toBe("2 · A thermometer measures T");
    expect(headingText("6 · <M t=\"T\" /> is not K")).toBe("6 · T is not K");
    expect(headingText("{s.title}")).toBeNull();
    const docs = eduToolsIndex().filter((d) => d.tool === "what-is-temperature" && d.kind === "heading");
    expect(docs.length).toBeGreaterThan(3);
  });
});

/** The chapters of a lesson whose title or text carries `word`. */
function chaptersWith(steps: readonly { title: string; body: string }[], word: string): string[] {
  return steps.filter((s) => fold(`${s.title} ${s.body}`).includes(fold(word)))
    .map((s) => chapterSlug(s.title));
}

describe("searching", () => {
  it("'cavitation' finds the letdown and the pump pages at the right chapters", () => {
    const hits = searchEduTools(eduToolsIndex(), "cavitation");
    const at = (tool: string) => hits.filter((h) => h.doc.tool === tool && h.doc.chapterKey)
      .map((h) => h.doc.chapterKey);
    const letdown = chaptersWith(LETDOWN_STEPS, "cavitation");
    expect(letdown.length).toBeGreaterThan(0);
    for (const k of letdown) expect(at("letdown")).toContain(k);
    expect(at("pump-system").length).toBeGreaterThan(0);
    // Every chapter hit shows an excerpt or a title that carries the word.
    for (const h of hits.filter((x) => x.doc.kind === "step")) {
      const shown = fold(`${h.doc.chapter} ${h.excerpt?.hit ?? ""}`);
      expect(shown.includes("cavitation") || fold(h.doc.text).includes("cavitation")).toBe(true);
    }
  });

  it("is case- and accent-insensitive", () => {
    const a = searchEduTools(eduToolsIndex(), "cavitation").map((h) => h.doc);
    const b = searchEduTools(eduToolsIndex(), "CAVITATIÓN").map((h) => h.doc);
    expect(b).toEqual(a);
  });

  it("several words, any order, all must match", () => {
    const one = searchEduTools(eduToolsIndex(), "NPSH cavitation");
    const two = searchEduTools(eduToolsIndex(), "cavitation NPSH");
    expect(one.map((h) => h.doc)).toEqual(two.map((h) => h.doc));
    expect(one.length).toBeGreaterThan(0);
    for (const h of one) {
      const all = fold(`${h.doc.chapter} ${h.doc.text} ${h.doc.toolLabel} ${h.doc.f.glossary}`);
      expect(all.includes("npsh") && all.includes("cavitation"), h.doc.chapter ?? "").toBe(true);
    }
    expect(chaptersWith(PUMP_STEPS, "npsh").some((k) =>
      one.some((h) => h.doc.tool === "pump-system" && h.doc.chapterKey === k))).toBe(true);
  });

  it("finds a chapter by a word only its BODY carries", () => {
    const step = LETDOWN_STEPS.find((s) => s.body.length > 200)!;
    const word = (step.body.match(/[A-Za-z]{10,}/g) ?? [])
      .find((w) => !fold(step.title).includes(fold(w)))!;
    const hits = searchEduTools(eduToolsIndex(), word, 500);
    expect(hits.some((h) => h.doc.tool === "letdown" && h.doc.chapterKey === chapterSlug(step.title)))
      .toBe(true);
  });

  it("finds a chapter by its equation glossary", () => {
    const docs = eduToolsIndex();
    const step = LETDOWN_STEPS.find((s) => (s.where ?? []).some((g) => g.means.length > 20))!;
    const g = step.where!.find((x) => x.means.length > 20)!;
    const hits = searchEduTools(docs, g.means, 500);
    expect(hits.some((h) => h.doc.tool === "letdown" && h.doc.chapterKey === chapterSlug(step.title)))
      .toBe(true);
  });

  it("a tool name alone lists the tool once, not every chapter of it", () => {
    const tool = METHOD_TOOLS.find((t) => t.id === "letdown")!;
    const hits = searchEduTools(eduToolsIndex(), tool.label);
    expect(hits[0]!.doc.tool).toBe("letdown");
    expect(hits[0]!.doc.kind).toBe("tool");
  });
});

describe("opening a hit", () => {
  it("opens THE tool AT the chapter, and the link says so", () => {
    const h = searchEduTools(eduToolsIndex(), "cavitation")
      .find((x) => x.doc.tool === "letdown" && x.doc.kind === "step")!;
    openEduHit(h.doc);
    expect(getActiveMethodTool()).toBe("letdown");
    expect(getMethodChapterRequest()?.key).toBe(h.doc.chapterKey);
    expect(getMethodChapterRequest()?.tool).toBe("letdown");
    const href = eduHitHref(h.doc);
    const q = new URLSearchParams(href.slice(1));
    expect(q.get("workspace")).toBe("methods");
    expect(q.get("tool")).toBe("letdown");
    expect(q.get("step")).toBe(h.doc.chapterKey);
  });

  it("a tool row opens the tool at its top (no step)", () => {
    const d = eduToolsIndex().find((x) => x.tool === "kremser" && x.kind === "tool") as EduDoc;
    expect(new URLSearchParams(eduHitHref(d).slice(1)).has("step")).toBe(false);
  });

  it("the boot reads `&step=` beside a live tool, and only there", () => {
    const g = globalThis as { window?: unknown };
    const saved = g.window;
    try {
      g.window = { location: { search: "?workspace=methods&tool=letdown&step=cavitation" } };
      expect(bootChapter()).toBe("cavitation");
      g.window = { location: { search: "?workspace=methods&tool=nonsense&step=cavitation" } };
      expect(bootChapter()).toBeNull();
    } finally {
      g.window = saved;
    }
  });
});

describe("loaded lazily", () => {
  it("nothing in the initial bundle imports the index statically", () => {
    for (const f of ["../src/ui/MethodsWorkspace.tsx", "../src/ui/MenuBar.tsx",
                     "../src/ui/methods/EduToolsFind.tsx"]) {
      const s = src(f);
      expect(s, f).not.toMatch(/^import\s+(?!type\b)[^;]*eduToolsIndex/m);
    }
    expect(src("../src/ui/methods/EduToolsFind.tsx")).toMatch(/import\("\.\/eduToolsIndex\.js"\)/);
  });

  it("the index imports no Tool component", () => {
    expect(src("../src/ui/methods/eduToolsIndex.ts")).not.toMatch(/from\s+"[^"]*Tool(\.js)?"/);
  });
});
