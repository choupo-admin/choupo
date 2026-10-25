/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/**
 * unitBanner -- the ONE reader of the per-unit banner the steady engine prints
 * into its run log (DEV.md 4c C115).
 *
 * `Flowsheet::runUnit` (src/unitOperations/flowsheet/Flowsheet.cpp) prints,
 * before every unit it solves NON-quietly,
 *
 *     >>>  Unit [k]:  <qualified.name>   (type = <T>)
 *
 * Two readers need it: the Log workspace's jump list (post-run, the whole log)
 * and the run-progress tracker that makes the unit being solved pulse on the
 * canvas (live, one line at a time).  They read it through THIS module, so the
 * two can never disagree about what a banner is.
 *
 * WHAT THE LOG DOES NOT SAY, stated so no reader infers it:
 *   - a recycle's sweeps run QUIET (`sweep(quiet = true)` in the same
 *     file): inside a converging recycle no banner names the unit, so nothing
 *     here can tell which unit the solver is in.  The banners return in the
 *     "Final pass with full unit logging".
 *   - only `choupoSolve` prints banners.  choupoBatch, choupoCtrl,
 *     choupoSemiContinuous and choupoProps print none, and a reader of this
 *     module finds no unit in their logs -- which is the truth, not a fault.
 *   - there is no "unit finished" line.  A unit is in progress from its banner
 *     until the next banner, or until one of the UNIT-PHASE END lines below.
 */

/** One parsed banner. */
export interface UnitBanner {
  /** the engine's `[k]`: the unit's index in its solve order */
  unitIndex: number;
  /** the FLATTENED name exactly as printed (`CONCENTRATION.Evap1`, `Mixer`) */
  qualifiedName: string;
  /** the registered type word (`evaporator`) */
  type: string;
}

/** A banner and the 1-based log line it sits on. */
export interface UnitBannerAt extends UnitBanner {
  line: number;
}

const BANNER = /^>>>\s+Unit\s+\[(\d+)\]:\s+(\S+)\s+\(type\s*=\s*(\S+)\s*\)/;

/** Parse ONE log line; null when it is not a unit banner. */
export function parseUnitBanner(line: string): UnitBanner | null {
  const m = BANNER.exec(line);
  if (!m) return null;
  return { unitIndex: parseInt(m[1]!, 10), qualifiedName: m[2]!, type: m[3]! };
}

/** Every banner of a whole log, in log order (= solve order). */
export function parseUnitBanners(log: string): UnitBannerAt[] {
  const out: UnitBannerAt[] = [];
  if (!log) return out;
  const lines = log.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const b = parseUnitBanner(lines[i] ?? "");
    if (b) out.push({ ...b, line: i + 1 });
  }
  return out;
}

/**
 * Lines after which NO unit is being solved by name, printed by the same
 * `Flowsheet.cpp`:
 *   - the flowsheet summary header, printed once every unit has run -- what
 *     follows (stream table, balances, reports, post-processing) is not a
 *     unit's solve, and pulsing the last unit through it would blame it for
 *     the reports' time;
 *   - the recycle outer-loop header, after which the sweeps are QUIET (see
 *     the header of this module).
 */
export function endsUnitPhase(line: string): boolean {
  return /^=+\s+Flowsheet summary\s+=+/.test(line)
      || /^Recycle outer loop \(/.test(line);
}

/*  OPERATION BANNERS (DEV.md 4c C154).  choupoProps prints one per operation,
 *  `>>>  Operation [k]:  <name>   (type = <T>)` (src/applications/
 *  choupoProps/main.cpp) -- the same shape, another word.  The log
 *  navigator said "No unit banners found" over a props log carrying 22 of
 *  them; it lists these where the log has no unit banner. */
const OP_BANNER = /^>>>\s+Operation\s+\[(\d+)\]:\s+(\S+)\s+\(type\s*=\s*(\S+)\s*\)/;

/** Every OPERATION banner of a props log, in log order (= run order). */
export function parseOperationBanners(log: string): UnitBannerAt[] {
  const out: UnitBannerAt[] = [];
  if (!log) return out;
  const lines = log.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = OP_BANNER.exec(lines[i] ?? "");
    if (m) out.push({ unitIndex: parseInt(m[1]!, 10), qualifiedName: m[2]!, type: m[3]!, line: i + 1 });
  }
  return out;
}

/** A repeated ANNOUNCEMENT of the log, grouped: the engine prints a
 *  `[tag] ...` line at every site that raises it (a J_v imposed at every
 *  point, an unreviewed record per component), and a reader scanning a log
 *  of 800 lines needs the kinds and their counts first.  Lines are grouped
 *  by their tag and their text with numbers and quoted names folded, so
 *  "[DSPM-DE] J_v IMPOSED by the caller (1e-06 m/s)" and "(5e-05 m/s)" are
 *  one kind; the count and every line stay, nothing is dropped. */
export interface AnnouncementGroup {
  tag: string;
  /** the first line's text, as printed */
  example: string;
  count: number;
  /** 1-based log lines, in order */
  lines: number[];
}

export function groupAnnouncements(log: string): AnnouncementGroup[] {
  const by = new Map<string, AnnouncementGroup>();
  if (!log) return [];
  const lines = log.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] ?? "";
    if (l.includes("<<<Choupo:result-begin>>>")) break;
    const m = /^\s*\[([A-Za-z][A-Za-z0-9 _-]*)\]\s+(.*)$/.exec(l);
    if (!m) continue;
    const tag = m[1]!;
    const norm = m[2]!
      .replace(/'[^']*'|"[^"]*"/g, "'…'")
      .replace(/[-+]?\d+(\.\d+)?([eE][-+]?\d+)?/g, "#")
      .slice(0, 80);
    const key = `${tag}\u0000${norm}`;
    const g = by.get(key) ?? { tag, example: m[2]!.trim(), count: 0, lines: [] };
    g.count++; g.lines.push(i + 1);
    by.set(key, g);
  }
  return [...by.values()].sort((a, b) => b.count - a.count || a.lines[0]! - b.lines[0]!);
}
