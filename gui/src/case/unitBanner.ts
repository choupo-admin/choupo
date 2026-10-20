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
