/*---------------------------------------------------------------------------*\
|       \|/    C hemicals     |  Choupo: open-source, glass-box simulation    |
|      \\|//   H eat-transfer |  Version:  Choupo-dev                         |
|     \\\|///  O perations    |  Website:  https://choupo.org                 |
|      \\|//   U nits         |  Licence:  GPL-3.0-or-later                   |
|       \|/    P roperties    |  Copyright (C) 2026 Vítor Geraldes            |
|        |     O ptimization  |                                               |
\*---------------------------------------------------------------------------*/
/**
 * SolvingHalo -- the unit being solved PULSES when a run is slow (DEV.md 4c
 * C115).  Rendered inside every unit node (and every folded sector box, which
 * is a unit node too); it draws only on the ONE node the live log names, and
 * only once that unit has been in progress for a second.
 *
 * Every decision is case/runProgress.ts's (which unit, which node, the
 * threshold, the reduced-motion form, the label); this file subscribes and
 * draws.  It is an OUTLINE OUTSIDE THE BOX, in INK: colour on this canvas
 * means phase, duty tier and utility class (gui-credo §2) or the published
 * field or unit KPI the reader chose to colour by (DEV.md 4c C114), all of
 * them results the engine computed, and "the solver is here now" is none of
 * those -- so the box, its border, its selection ring and every wire keep
 * exactly the colours they had (the ring is the node's box-shadow, at most
 * 3 px out; the halo sits 8 px out, so the two never overlap).  The chip
 * carries its own surface (gui-credo: an indicator floating over the canvas
 * never relies on the page's background).  `pointer-events: none` throughout,
 * so the halo never takes a click or a drag from the node it surrounds.
 *
 * Positioned against React Flow's own node wrapper (`.react-flow__node` is
 * absolutely positioned), so the node's layout and handles are untouched.
 */
import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "@mantine/hooks";

import { useStore } from "../state/store.js";
import {
  solvingHaloView, solvingSeconds, solvingTargetOf, solvingTargets, watchSolving,
} from "../case/runProgress.js";

export function SolvingHalo({ nodeName }: { nodeName: string }) {
  const running = useStore((s) => s.runStatus === "running");
  const unit = useStore((s) => s.runProgress.unit);
  const since = useStore((s) => s.runProgress.since);
  const flowsheet = useStore((s) => s.caseFiles.flowsheet);
  const rawFiles = useStore((s) => s.caseFiles.rawFiles);
  const reduceMotion = !!useReducedMotion();

  const target = useMemo(
    () => (unit ? solvingTargetOf(unit, solvingTargets(flowsheet, rawFiles)) : null),
    [unit, flowsheet, rawFiles]);
  const mine = running && target !== null && target.node === nodeName;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => (mine ? watchSolving(since, setNow) : undefined), [mine, since]);

  const view = mine
    ? solvingHaloView(solvingSeconds(since, now), unit, target, reduceMotion)
    : null;
  if (!view) return null;
  return (
    <div
      data-solving={nodeName}
      className={`choupo-solving-halo choupo-solving-halo--${view.motion}`}
    >
      <div className="choupo-solving-ring" />
      <span className="choupo-solving-chip">{view.label}</span>
    </div>
  );
}
