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
  eduToolLessonsPlugin -- WHICH LESSON MODULES EACH EDUTOOL DRAWS, read off
  the source at build time (DEV.md 4c C113, part 2).

  The EduTools Find indexes the lesson modules (`methods/*Lesson.ts`), and a
  hit must open the TOOL that draws that lesson.  Nothing in the tree records
  that pairing as data: a tool's arm in MethodsWorkspace.tsx names a
  component, the component's file imports its lesson.  Writing the pairing
  down by hand would be a second home for a fact the imports already state,
  and it would go stale the first time a tool gained a second lesson.  So it
  is DERIVED, here, from the same two facts a reader would follow:

    1. MethodsWorkspace.tsx: `tool === "<id>" ? <XTool />` and
       `const XTool = lazy(() => import("./methods/XTool.js"))`;
    2. that file's `import ... from "./<name>Lesson.js"` lines (a tool drawn
       by a function INSIDE MethodsWorkspace.tsx -- McCabe, psychrometry --
       is read from that function's body and the lesson identifiers it uses).

  It also lifts each tool's own plain-text `<Title order={4|5}>` headings,
  because sixteen tools carry their chapters inline and have no lesson
  module: without this their chapters would be unfindable.  A heading whose
  text is an expression (`{s.title}`) is skipped -- the lesson module that
  supplies it is already indexed.

  Why a build-time plugin and not a runtime read: the Find loads lazily, and
  reading the tool SOURCES at run time would ship 1.7 MB of TSX text to answer
  a question whose answer is a few hundred bytes.  The virtual module carries
  only the answer.
\*---------------------------------------------------------------------------*/

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { Plugin } from "vite";

export const EDUTOOL_LESSONS_ID = "virtual:edutool-lessons";
const RESOLVED_ID = `\0${EDUTOOL_LESSONS_ID}`;

const UI_DIR = fileURLToPath(new URL("../src/ui/", import.meta.url));
const WORKSPACE = `${UI_DIR}MethodsWorkspace.tsx`;

export interface EduToolSources {
  /** tool id -> the lesson modules it draws (basenames, e.g. "letdownLesson"). */
  lessons: Record<string, string[]>;
  /** tool id -> the plain-text headings its own source writes. */
  headings: Record<string, string[]>;
  /** Absolute paths read, for the dev watcher. */
  files: string[];
}

/** The text of a `<Title ...>` child, or null when it is not plain text. */
export function headingText(inner: string): string | null {
  // `<M t="T_{90}" />` is the notes pages' inline maths: keep its source.
  let t = inner.replace(/<M\s+t="([^"]*)"\s*\/>/g, "$1");
  t = t.replace(/<[^>]+>/g, "");
  if (/[{}]/.test(t.replace(/\{"\s*"\}/g, " "))) return null;
  t = t.replace(/\{"\s*"\}/g, " ").replace(/&apos;/g, "'").replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
  return t || null;
}

export function headingsOf(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/<Title\s+order=\{([45])\}[^>]*>([\s\S]*?)<\/Title>/g)) {
    const h = headingText(m[2]!);
    if (h && !out.includes(h)) out.push(h);
  }
  return out;
}

function lessonImportsOf(src: string): { module: string; names: string[] }[] {
  const out: { module: string; names: string[] }[] = [];
  for (const m of src.matchAll(
    /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+"\.\/(?:methods\/)?(\w+Lesson)\.js"/g)) {
    out.push({
      module: m[2]!,
      names: m[1]!.split(",").map((x) => x.replace(/\btype\b/, "").trim().split(/\s+as\s+/).pop()!)
        .filter(Boolean),
    });
  }
  return out;
}

/** The body of `function <name>(` inside `src`, up to the next top-level
 *  function -- enough to ask which lesson identifiers it uses. */
function functionBody(src: string, name: string): string | null {
  const start = src.search(new RegExp(`\\nfunction ${name}\\s*\\(`));
  if (start < 0) return null;
  const next = src.slice(start + 1).search(/\n(?:export\s+)?function \w+/);
  return next < 0 ? src.slice(start) : src.slice(start, start + 1 + next);
}

/** Derive the pairing from MethodsWorkspace.tsx and the tool files. */
export function deriveEduToolSources(
  workspaceSrc: string,
  readTool: (file: string) => string | null,
): EduToolSources {
  const lazyFile = new Map<string, string>();
  for (const m of workspaceSrc.matchAll(
    /const\s+(\w+)\s*=\s*lazy\(\(\)\s*=>\s*import\("\.\/methods\/(\w+)\.js"\)/g)) {
    lazyFile.set(m[1]!, m[2]!);
  }
  const workspaceLessons = lessonImportsOf(workspaceSrc);
  const lessons: Record<string, string[]> = {};
  const headings: Record<string, string[]> = {};
  const files: string[] = [];
  for (const m of workspaceSrc.matchAll(/tool === "([\w-]+)"\s*\?\s*\(?\s*<(\w+)/g)) {
    const id = m[1]!;
    const comp = m[2]!;
    const file = lazyFile.get(comp);
    if (file) {
      const src = readTool(file);
      if (src === null) continue;
      files.push(`${UI_DIR}methods/${file}.tsx`);
      lessons[id] = [...new Set(lessonImportsOf(src).map((x) => x.module))];
      headings[id] = headingsOf(src);
    } else {
      const body = functionBody(workspaceSrc, comp);
      if (body === null) continue;
      lessons[id] = workspaceLessons
        .filter((x) => x.names.some((n) => new RegExp(`\\b${n}\\b`).test(body)))
        .map((x) => x.module);
      headings[id] = headingsOf(body);
    }
  }
  return { lessons, headings, files };
}

export function readEduToolSources(): EduToolSources {
  const ws = readFileSync(WORKSPACE, "utf8");
  const out = deriveEduToolSources(ws, (file) => {
    const p = `${UI_DIR}methods/${file}.tsx`;
    return existsSync(p) ? readFileSync(p, "utf8") : null;
  });
  out.files.push(WORKSPACE);
  return out;
}

/** `import("virtual:edutool-lessons")` -- the pairing as data. */
export function eduToolLessonsPlugin(): Plugin {
  return {
    name: "choupo-edutool-lessons",
    resolveId(id) {
      return id === EDUTOOL_LESSONS_ID ? RESOLVED_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_ID) return null;
      const s = readEduToolSources();
      for (const f of s.files) this.addWatchFile(f);
      return `export const TOOL_LESSONS = ${JSON.stringify(s.lessons)};\n`
        + `export const TOOL_HEADINGS = ${JSON.stringify(s.headings)};\n`;
    },
  };
}
