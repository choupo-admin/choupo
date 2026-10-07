/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/**
 * recycleLoops -- which wires and units belong to a recycle LOOP, read from
 * the engine's `recycleLoops` result block (DEV.md 4c C42).
 *
 * A recycle is the LOOP, not the one edge the solver cuts: everything inside
 * it converges together.  The engine's sequential-plan validator already
 * finds each tear's cycle to judge the plan, and publishes it; this module
 * only turns that list into membership tests for the canvas.  It detects
 * nothing -- re-deriving cycles here would be a second home for the plan
 * contract's cycle detection.
 *
 * Names are matched EXACTLY: a stream through the resolved run stream's own
 * name (the canvas hands the resolver), a unit by its name or, on a sectored
 * view, by the SECTOR the engine stamped it with (`unitSectors`).  Never by a
 * name's tail.
 */
import type { RecycleLoop } from "../adapters/SolverAdapter";

export interface LoopMembership {
  /** is this wire (by its canvas label) a stream on any loop? */
  streamOnLoop(label: string): boolean;
  /** is this unit or sector box (by its node name) on any loop? */
  unitOnLoop(name: string): boolean;
  /** whether any loop was published at all */
  any: boolean;
}

export function loopMembership(
  loops: readonly RecycleLoop[] | undefined,
  resolveStreamName: (label: string) => string | undefined,
  unitSectors?: Readonly<Record<string, string>>,
): LoopMembership {
  const streams = new Set<string>();
  const units = new Set<string>();
  for (const l of loops ?? []) {
    for (const s of l.streams) streams.add(s);
    for (const u of l.units) {
      units.add(u);
      const sec = unitSectors?.[u];
      if (sec) units.add(sec);
    }
  }
  return {
    any: streams.size > 0 || units.size > 0,
    streamOnLoop: (label) => {
      if (streams.has(label)) return true;
      const q = resolveStreamName(label);
      return q !== undefined && streams.has(q);
    },
    unitOnLoop: (name) => units.has(name),
  };
}
