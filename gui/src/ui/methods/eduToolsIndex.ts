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
  eduToolsIndex -- the text index the EduTools Find searches (DEV.md 4c
  C113, part 2).  LOADED LAZILY: the Find imports this module the first time
  it opens, so the lesson text is not in the bundle a reader downloads to
  open a case, and no Tool component is imported (the tools stay `lazy()`).

  BUILT FROM THE LESSONS, never from a list kept beside them:
    * the registry (`METHOD_TOOLS`) gives each live tool its name, its
      discipline shelf and its `teaches` line;
    * every `methods/*Lesson.ts` module is read whole, and its exports are
      classified by SHAPE -- an array of `{ n, title, body }` is a list of
      steps, `{ id, title, body }` a list of limits, `{ cite }` a list of
      sources -- so a new lesson, or a new export in an old one, is indexed
      without anyone touching this file;
    * which tool draws which lesson is read off the source at build time
      (scripts/eduToolLessonsPlugin.ts), as are the plain-text headings of
      the pages that carry their chapters inline.

  WHAT A STEP CONTRIBUTES: its title, its body, its note, every derivation
  sentence, and its equation glossary (`where[].means`, `where[].unit`, and
  the symbol with its backslashes dropped) -- the brief's "equation glossary
  terms".  The LaTeX of an equation itself is not indexed: `\frac{\Delta
  p}{\rho g}` is not a word anyone types.

  RANKING.  Each term scores the best field it matched in -- the tool's name
  100, the chapter title 50, the glossary 12, the discipline / teaches line
  10, the chapter text 5 -- and the record's score is the sum.  A chapter
  must match at least one term in its OWN fields, or every chapter of a tool
  whose name matches would be listed: the tool's own row answers that.
\*---------------------------------------------------------------------------*/

import { TOOL_HEADINGS, TOOL_LESSONS } from "virtual:edutool-lessons";

import { excerptAround, fold, parseQuery, termMatches, type Term } from "../../search/textSearch.js";
import { chapterSlug, isSourcesHeading } from "./chapters.js";
import { METHOD_TOOLS, type MethodToolId } from "./registry.js";

export type EduDocKind = "tool" | "step" | "limit" | "source" | "heading";

export interface EduDoc {
  tool: MethodToolId;
  toolLabel: string;
  discipline: string;
  kind: EduDocKind;
  /** The chapter as the page titles it (null for the tool's own row). */
  chapter: string | null;
  /** The `&step=` key that opens the page there (null: the top). */
  chapterKey: string | null;
  /** The prose an excerpt is cut from. */
  text: string;
  /** Folded haystacks. */
  f: { title: string; glossary: string; text: string; toolName: string; shelf: string };
}

type LessonModule = Record<string, unknown>;

// Every lesson module, eagerly INSIDE this lazily-loaded chunk.
const LESSONS = import.meta.glob<LessonModule>("./*Lesson.ts", { eager: true });

function lessonModule(name: string): LessonModule | undefined {
  return LESSONS[`./${name}.ts`];
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null;
const str = (x: unknown): string => (typeof x === "string" ? x : "");

/** A symbol as words: `\Delta p_{\mathrm{v}}` -> "Delta p v". */
function symbolWords(sym: string): string {
  return sym.replace(/\\(mathrm|text|mathit|operatorname|ce)\b/g, "")
    .replace(/\\/g, "").replace(/[{}_^$]/g, " ").replace(/\s+/g, " ").trim();
}

function glossaryOf(o: Record<string, unknown>): string {
  const where = Array.isArray(o.where) ? o.where : [];
  return where.filter(isObj)
    .map((g) => `${symbolWords(str(g.sym))} ${str(g.means)} ${str(g.unit)}`).join(" · ");
}

function stepText(o: Record<string, unknown>): string {
  const deriv = Array.isArray(o.derivation)
    ? o.derivation.filter(isObj).map((d) => str(d.step)).join(" ") : "";
  return [str(o.body), deriv, str(o.note)].filter(Boolean).join(" ");
}

/** Classify one export of a lesson module by its shape. */
function docsOfExport(value: unknown): { kind: EduDocKind; title: string; key: string;
  text: string; glossary: string }[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isObj)) return [];
  const rows = value as Record<string, unknown>[];
  if (rows.every((r) => typeof r.title === "string" && typeof r.body === "string")) {
    const steps = rows.every((r) => typeof r.n === "number");
    return rows.map((r) => {
      const title = str(r.title);
      return {
        kind: steps ? "step" as const : "limit" as const,
        title,
        key: steps ? chapterSlug(title) : `limits/${chapterSlug(title)}`,
        text: steps ? stepText(r) : str(r.body),
        glossary: glossaryOf(r),
      };
    });
  }
  if (rows.every((r) => typeof r.cite === "string")) {
    return rows.map((r) => ({
      kind: "source" as const,
      title: "Sources",
      key: "sources",
      text: [str(r.cite), str(r.used), str(r.text)].filter(Boolean).join(" — "),
      glossary: "",
    }));
  }
  return [];
}

function makeDoc(
  tool: (typeof METHOD_TOOLS)[number], kind: EduDocKind, chapter: string | null,
  chapterKey: string | null, text: string, glossary: string,
): EduDoc {
  return {
    tool: tool.id, toolLabel: tool.label, discipline: tool.discipline, kind,
    chapter, chapterKey, text,
    f: {
      title: fold(chapter ?? ""),
      glossary: fold(glossary),
      text: fold(text),
      toolName: fold(`${tool.label} ${tool.id}`),
      shelf: fold(`${tool.discipline} ${tool.teaches}`),
    },
  };
}

/** Build the index.  Exported pure (it reads only bundled data) for tests. */
export function buildEduToolsIndex(): EduDoc[] {
  const docs: EduDoc[] = [];
  for (const tool of METHOD_TOOLS) {
    if (tool.status !== "live") continue;
    docs.push(makeDoc(tool, "tool", null, null, tool.teaches, ""));
    const seenTitles = new Set<string>();
    for (const modName of TOOL_LESSONS[tool.id] ?? []) {
      const mod = lessonModule(modName);
      if (!mod) continue;
      for (const value of Object.values(mod)) {
        for (const d of docsOfExport(value)) {
          if (d.kind !== "source") seenTitles.add(chapterSlug(d.title));
          docs.push(makeDoc(tool, d.kind, d.title, d.key, d.text, d.glossary));
        }
      }
    }
    // The page's own headings: a chapter no lesson module titles.
    for (const h of TOOL_HEADINGS[tool.id] ?? []) {
      const key = chapterSlug(h);
      if (!key || seenTitles.has(key)) continue;
      seenTitles.add(key);
      const k = isSourcesHeading(h) ? "sources" : key;
      docs.push(makeDoc(tool, "heading", h, k, "", ""));
    }
  }
  return docs;
}

let INDEX: EduDoc[] | null = null;
export function eduToolsIndex(): EduDoc[] {
  if (!INDEX) INDEX = buildEduToolsIndex();
  return INDEX;
}

/** Weights, in the order the file header states. */
export const EDU_FIELD_WEIGHT = {
  toolName: 100, title: 50, glossary: 12, shelf: 10, text: 5,
} as const;
type EduField = keyof typeof EDU_FIELD_WEIGHT;
const OWN: readonly EduField[] = ["title", "glossary", "text"];
const TOOL: readonly EduField[] = ["toolName", "shelf"];

export interface EduHit {
  doc: EduDoc;
  score: number;
  excerpt: { before: string; hit: string; after: string } | null;
}

/** Every chapter (and tool) matching ALL the terms, best first. */
export function searchEduTools(docs: readonly EduDoc[], query: string, limit = 80): EduHit[] {
  const terms = parseQuery(query);
  if (terms.length === 0) return [];
  const scored: { doc: EduDoc; score: number }[] = [];
  for (const doc of docs) {
    const s = scoreDoc(terms, doc);
    if (s !== null) scored.push({ doc, score: s });
  }
  scored.sort((a, b) => b.score - a.score
    || a.doc.toolLabel.localeCompare(b.doc.toolLabel)
    || (a.doc.chapter ?? "").localeCompare(b.doc.chapter ?? ""));
  return scored.slice(0, limit).map(({ doc, score }) => ({
    doc, score,
    excerpt: excerptAround(doc.text, terms.filter((t) => termMatches(t, doc.f.text)), 60),
  }));
}

function scoreDoc(terms: readonly Term[], doc: EduDoc): number | null {
  const fields: readonly EduField[] = doc.kind === "tool" ? TOOL : [...OWN, ...TOOL];
  let score = 0;
  let own = false;
  for (const t of terms) {
    let best = 0;
    for (const k of fields) {
      if (termMatches(t, doc.f[k])) {
        best = Math.max(best, EDU_FIELD_WEIGHT[k]);
        if (doc.kind !== "tool" && OWN.includes(k)) own = true;
      }
    }
    if (best === 0) return null;
    score += best;
  }
  if (doc.kind !== "tool" && !own) return null;
  // Same score: a chapter that matched in its title before one that matched
  // in a paragraph, and a step before a source.
  if (doc.kind === "source") score -= 1;
  return score;
}

/** The deep link a hit opens: `?workspace=methods&tool=<id>[&step=<key>]`,
 *  on the current page's path. */
export function eduHitHref(doc: EduDoc, base = ""): string {
  const q = new URLSearchParams({ workspace: "methods", tool: doc.tool });
  if (doc.chapterKey) q.set("step", doc.chapterKey);
  return `${base}?${q.toString()}`;
}
