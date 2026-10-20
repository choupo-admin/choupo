/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/**
 * runProgress -- WHICH UNIT IS BEING SOLVED RIGHT NOW, read from the live run
 * log (DEV.md 4c C115: "the unit being solved pulses when a run is slow").
 *
 * The worker posts every stdout line as it is printed
 * (`public/workers/solverWorker.js`, Emscripten `print`), and the steady engine
 * prints a banner before every unit it solves (`case/unitBanner.ts`, the ONE
 * reader of that banner).  So the GUI knows the unit in progress with no
 * engine change and computes nothing: it READS the banner.
 *
 * Three pieces, all pure:
 *   - the REDUCER (`progressOnChunk`): fed each log chunk with the time it
 *     arrived; a banner makes its unit current and restarts the clock (a
 *     recycle's final pass, or an outer driver's next pass, revisiting a unit
 *     MOVES the pulse); a unit-phase END line clears it; the run ending,
 *     failing or being cancelled clears it (the store's actions).
 *   - the THRESHOLD (`solvingSeconds`, `watchSolving`): nothing at all is
 *     shown before a unit has been in progress for one second -- a fast run
 *     never flickers.
 *   - the CANVAS TARGET (`solvingTargets`): the banner prints the FLATTENED
 *     name; the canvas draws a sector as one folded box.  The map is built by
 *     WALKING the case's own declaration and JOINING the names it lists (the
 *     engine's flatten joins the same chain with dots) -- never by splitting a
 *     printed name, which is the name identity CLAUDE.md §6 forbids.  A name
 *     the walk does not produce is matched to a node of exactly that name or
 *     to nothing: an unknown unit pulses nowhere rather than somewhere wrong.
 */
import { parse, toJson } from "../dict/index.js";
import type { JsonDict } from "../dict/index.js";
import { compositeMembers, resolveMemberFlowsheet } from "./toGraph.js";
import { endsUnitPhase, parseUnitBanner } from "./unitBanner.js";

// ---------------------------------------------------------------- reducer

export interface RunProgress {
  /** the flattened unit name as the banner printed it; null when no unit is
   *  known to be in progress */
  unit: string | null;
  /** its registered type word, for the label */
  type: string | null;
  /** when its banner arrived (ms, the caller's clock); null with `unit` */
  since: number | null;
  /** banners seen this run -- a revisit of the SAME unit is a new visit */
  visit: number;
  /** a partial line still waiting for its newline */
  carry: string;
}

export const IDLE_RUN_PROGRESS: RunProgress = Object.freeze({
  unit: null, type: null, since: null, visit: 0, carry: "",
}) as RunProgress;

/** Feed one log chunk (any number of lines, possibly a partial one) that
 *  arrived at `now`.  Returns the SAME object when nothing changed, so a store
 *  selector on it does not re-render on every log line. */
export function progressOnChunk(p: RunProgress, chunk: string, now: number): RunProgress {
  if (!chunk) return p;
  const text = p.carry + chunk;
  const parts = text.split("\n");
  const carry = parts.pop() ?? "";
  let next = p;
  for (const line of parts) {
    const b = parseUnitBanner(line);
    if (b) {
      next = { unit: b.qualifiedName, type: b.type, since: now,
               visit: next.visit + 1, carry: next.carry };
    } else if (next.unit !== null && endsUnitPhase(line)) {
      next = { ...next, unit: null, type: null, since: null };
    }
  }
  if (carry !== next.carry) next = { ...next, carry };
  return next;
}

// -------------------------------------------------------------- threshold

/** How long a unit must be in progress before anything is shown. */
export const SOLVING_THRESHOLD_MS = 1000;

/** Whole seconds in progress, or null while under the threshold (or idle). */
export function solvingSeconds(
  since: number | null, now: number, thresholdMs = SOLVING_THRESHOLD_MS,
): number | null {
  if (since === null) return null;
  const dt = now - since;
  return dt < thresholdMs ? null : Math.floor(dt / 1000);
}

/** Call `onTick(now)` when `since` crosses the threshold and then once a
 *  second, until the returned cancel is called.  Nothing is scheduled for a
 *  null `since`.  Uses the global timers, so fake timers drive it in tests. */
export function watchSolving(
  since: number | null,
  onTick: (now: number) => void,
  clock: () => number = Date.now,
  thresholdMs = SOLVING_THRESHOLD_MS,
): () => void {
  if (since === null) return () => {};
  let interval: ReturnType<typeof setInterval> | undefined;
  const timeout = setTimeout(() => {
    onTick(clock());
    interval = setInterval(() => onTick(clock()), 1000);
  }, Math.max(0, since + thresholdMs - clock()));
  return () => {
    clearTimeout(timeout);
    if (interval !== undefined) clearInterval(interval);
  };
}

// ---------------------------------------------------------- canvas target

/** Where on the canvas a banner's unit is drawn. */
export interface SolvingTarget {
  /** the canvas unit node's NAME (its id is `unit:<node>`) */
  node: string;
  /** set when the unit sits INSIDE that folded sector box */
  inSector: boolean;
}

function parseDict(text: string, name: string): JsonDict | undefined {
  try {
    return toJson(parse(text, { sourceName: name })) as JsonDict;
  } catch {
    return undefined;
  }
}

/** Every flattened unit name under a composite member, by JOINING the names
 *  its declaration lists (inline units and member folders, recursively). */
function leafNames(
  fs: JsonDict, base: string, prefix: string,
  rawFiles: { [relPath: string]: string } | undefined, out: string[],
): void {
  const units = fs["units"];
  if (Array.isArray(units))
    for (const u of units)
      if (u && typeof u === "object" && !Array.isArray(u)) {
        const n = (u as JsonDict)["name"];
        if (typeof n === "string") out.push(`${prefix}.${n}`);
      }
  for (const m of compositeMembers(fs)) {
    const q = `${prefix}.${m}`;
    const r = resolveMemberFlowsheet(rawFiles, base, m);
    const child = r ? parseDict(r.text, `${m}/flowsheetDict`) : undefined;
    if (r && child && typeof child["type"] !== "string") leafNames(child, r.base, q, rawFiles, out);
    else out.push(q);
  }
}

const cache = new WeakMap<JsonDict, {
  rawFiles: { [relPath: string]: string } | undefined;
  map: Map<string, SolvingTarget>;
}>();

/** flattened unit name -> the canvas node it is drawn in, for the units the
 *  canvas FOLDS into a sector box.  A unit the canvas draws as itself (a flat
 *  case, a drilled view, a dignified unit at the root) is not in the map: its
 *  banner name IS its node name (see `solvingTargetOf`). */
export function solvingTargets(
  flowsheet: JsonDict | undefined,
  rawFiles: { [relPath: string]: string } | undefined,
): Map<string, SolvingTarget> {
  if (!flowsheet) return new Map();
  const hit = cache.get(flowsheet);
  if (hit && hit.rawFiles === rawFiles) return hit.map;
  const map = new Map<string, SolvingTarget>();
  for (const m of compositeMembers(flowsheet)) {
    const r = resolveMemberFlowsheet(rawFiles, "", m);
    const child = r ? parseDict(r.text, `${m}/flowsheetDict`) : undefined;
    if (!r || !child || typeof child["type"] === "string") continue;   // drawn as itself
    const names: string[] = [];
    leafNames(child, r.base, m, rawFiles, names);
    for (const q of names) map.set(q, { node: m, inSector: true });
  }
  cache.set(flowsheet, { rawFiles, map });
  return map;
}

/** The canvas node a banner's unit is drawn in: a folded sector box when the
 *  walk put it in one, else the node of EXACTLY that name.  The caller checks
 *  the node exists; a name that matches none pulses nowhere. */
export function solvingTargetOf(
  unit: string, targets: Map<string, SolvingTarget>,
): SolvingTarget {
  return targets.get(unit) ?? { node: unit, inSector: false };
}

// ------------------------------------------------------------------ view

/** What the canvas draws for the unit in progress -- decided here, drawn by
 *  ui/SolvingHalo.tsx.  null: draw nothing (under the threshold, or idle). */
export interface SolvingHaloView {
  /** `pulse` animates the outline; `static` is the reduced-motion form */
  motion: "pulse" | "static";
  /** the chip over the box.  A folded sector names the unit inside it AS THE
   *  ENGINE PRINTED IT -- the full flattened name, never a tail cut from it. */
  label: string;
}

export function solvingHaloView(
  seconds: number | null, unit: string | null, target: SolvingTarget | null,
  reduceMotion: boolean,
): SolvingHaloView | null {
  if (seconds === null || unit === null || target === null) return null;
  const what = target.inSector ? `solving ${unit}` : "solving";
  return { motion: reduceMotion ? "static" : "pulse", label: `${what} · ${seconds} s` };
}
