/*  COMPLETE 0/ -- THE BROWSER MATERIALISES THE STATE THE ENGINE ALREADY KNOWS
 *  HOW TO WRITE (DEV.md 4c C200, phase B'; docs/design/an-llm-learns-choupo-
 *  from-a-brief.md section 4.3).
 *
 *  The engine refuses a case whose 0/ lacks a graph stream, and
 *  `choupoSolve -init0` (the C++ that `bin/choupo-init0` wraps) writes the
 *  missing ones from the AUTHORED inlets and the declared tear seeds.  An
 *  assistant that writes only controlDict, flowsheetDict, thermoPhysPropDict,
 *  solverDict and those authored files can then be run in the browser: this
 *  module is the pure half of that path (the worker runs `-init0`, the
 *  adapter returns `init0Files`).  ONE home for the materialisation: the
 *  engine's.  Nothing here estimates a stream.
 *
 *  Rules kept from the engine, not re-decided here:
 *    - an existing file is NEVER overwritten (the harvest keeps only paths the
 *      case did not already have, and says so for any that it refused);
 *    - what was generated is NAMED, per file, and the engine's own
 *      `[init0]` lines are shown -- never silently;
 *    - generated files live under 0/, so the Case tree already draws them as
 *      initial state (caseTree.kindOf); `generatedFiles` only marks WHICH of
 *      them the engine wrote rather than the student.
 */

import type { CaseFiles } from "./types.js";
import { readEdges, zeroStatePath } from "./toGraph.js";

/*  THE ENGINE'S OWN REFUSAL, matched by its words.
 *
 *    src/unitOperations/flowsheet/Flowsheet.cpp:2417
 *      "Flowsheet: 0/ COMPLETENESS violated BEFORE the solve (graph stream IDs != 0/ state files):"
 *    src/unitOperations/flowsheet/Flowsheet.cpp:2426 (and main.cpp:1272)
 *      "  MISSING  0/<path>  (graph stream, no state file)"
 *    src/unitOperations/flowsheet/Flowsheet.cpp:2435
 *      "... fix the state tree (bin/choupo-init0 materialises missing files; ..."
 *
 *  Only MISSING lines are offered the action: an ORPHAN or a RELOCATED file
 *  is a mistake in what exists, which -init0 does not repair.  */
export const COMPLETENESS_MARK = "0/ COMPLETENESS violated";

export interface Incomplete0 {
  /** `0/`-relative paths the engine named MISSING. */
  missing: string[];
  /** Orphan / relocated lines, kept so the offer can say they remain. */
  other: string[];
}

export function parseIncomplete0(log: string): Incomplete0 | null {
  if (!log.includes(COMPLETENESS_MARK)) return null;
  const missing: string[] = [];
  const other: string[] = [];
  for (const raw of log.split("\n")) {
    const line = raw.replace(/^\[stderr\]\s*/, "");
    let m = /^\s*MISSING\s+0\/(\S+)\s+\(graph stream, no state file\)/.exec(line);
    if (m) { missing.push(m[1]!); continue; }
    m = /^\s*(ORPHAN|RELOCATED)\s+0\/\S+/.exec(line);
    if (m) other.push(line.trim());
  }
  return missing.length > 0 ? { missing, other } : null;
}

/** Is `p` a path the engine's -init0 may have written (0/ state or interior)? */
export const isZeroPath = (p: string): boolean => p.startsWith("0/");

export interface Init0Harvest {
  next: CaseFiles;
  /** Case-relative paths written into the case (all under 0/). */
  generated: string[];
  /** Paths the engine returned that the case already had: NOT overwritten. */
  kept: string[];
}

/** Carry the files an -init0 run wrote into the case.  New paths under 0/
 *  only; both the run copy (`extraFiles`) and the viewer copy (`rawFiles`),
 *  as the clipboard bridge does for any non-dict file. */
export function harvestInit0(caseFiles: CaseFiles,
  files: { [relPath: string]: string } | undefined): Init0Harvest {
  const extra = { ...(caseFiles.extraFiles ?? {}) };
  const raw = { ...(caseFiles.rawFiles ?? {}) };
  const generated: string[] = [];
  const kept: string[] = [];
  for (const p of Object.keys(files ?? {}).sort()) {
    if (!isZeroPath(p)) continue;                      // -init0 writes 0/ only
    if (extra[p] !== undefined || raw[p] !== undefined) { kept.push(p); continue; }
    extra[p] = files![p]!;
    raw[p] = files![p]!;
    generated.push(p);
  }
  if (generated.length === 0) return { next: caseFiles, generated, kept };
  return { next: { ...caseFiles, extraFiles: extra, rawFiles: raw }, generated, kept };
}

/** The engine's own announcement lines of an -init0 run (`[init0] ...`),
 *  verbatim, in order.  The student is shown THESE, not a paraphrase. */
export function init0Announcements(log: string): string[] {
  return log.split("\n")
    .map((l) => l.replace(/^\[stderr\]\s*/, ""))
    .filter((l) => /\[init0\]|choupo-init0:/.test(l))
    .map((l) => l.trimEnd());
}

/** A CHEAP HINT that 0/ lacks a named stream -- never the authority (that is
 *  the engine's refusal, parseIncomplete0).  Named edges of a flat
 *  `connections {}` block plus the boundary inlets, each looked up with the
 *  same rule the GUI uses everywhere (zeroStatePath).  A false offer is
 *  harmless: -init0 never overwrites. */
export function probablyMissingZero(caseFiles: CaseFiles): string[] {
  const fs = caseFiles.flowsheet;
  if (!fs) return [];
  const have = { ...(caseFiles.rawFiles ?? {}), ...(caseFiles.extraFiles ?? {}) };
  const names = new Set<string>();
  for (const e of readEdges(fs)) if (e.name) names.add(e.name);
  const b = fs["boundary"];
  const inl = b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>)["inlets"] : undefined;
  if (Array.isArray(inl)) for (const x of inl) if (typeof x === "string") names.add(x);
  return [...names].filter((n) => zeroStatePath(have, n) === undefined).sort();
}

/** The log block appended after the action, so the Log keeps the record. */
export function completeZeroLogLines(h: Init0Harvest, announcements: string[]): string[] {
  const out = ["[case] Complete 0/: ran the engine's own -init0 (the browser's bin/choupo-init0)"];
  out.push(...announcements.map((l) => "  " + l));
  if (h.generated.length === 0) out.push("[case] Complete 0/: no file was generated.");
  else out.push(`[case] Complete 0/: ${h.generated.length} file(s) generated, marked in the Case tree: `
    + h.generated.join(", "));
  for (const p of h.kept) out.push(`[case] ${p}: already in the case -- kept, not overwritten`);
  return out;
}

/** The badge's tooltip -- what "generated" tells the reader. */
export const GENERATED_ZERO_HINT =
  "Written by the engine's own -init0 (Case > Complete 0/), not by you: an initial "
  + "ESTIMATE propagated from your authored inlets and tear seeds. Edit it freely; "
  + "the solver overwrites what it computes, and -init0 never overwrites a file you wrote.";

/** Is this 0/ file still exactly what -init0 wrote?  Editing it (or opening
 *  another case) makes the answer no, so nothing needs resetting. */
export function isGeneratedZero(path: string,
  raw: { [relPath: string]: string } | undefined,
  generated: { [relPath: string]: string }): boolean {
  return generated[path] !== undefined && raw?.[path] === generated[path];
}
