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
  ClosedLoopPlot -- the Control Room's specialised TrajectoryPlot.  It composes
  the additive props the renderer now accepts into the closed-loop control
  story:

      PV    (the controlled variable, e.g. TC1.PV / reactor.T) -- bold hero
      SP    (the setpoint) -- a dashed REFERENCE LINE, not a data trace
      ±band  (±2% / ±5% settling envelope) shaded around SP
      MV    (the manipulated variable, e.g. TC1.MV / jacket T) on the RIGHT axis
             so the student watches it slam toward its clamp (saturation)
      markers  vertical dotted lines at each disturbance step (from the dict)
      ghost  the faded previous run drawn underneath

  ZERO physics: every series is a column of the choupoCtrl `trajectory`; the
  setpoint, band and markers come from the controller layer the dict declared.
\*---------------------------------------------------------------------------*/

import { useMemo } from "react";

import type { TrajectoryData } from "../../adapters/SolverAdapter.js";
import type {
  ControllerKnobs,
  ScheduleKnobs,
} from "../../case/controllerKnobs.js";
import { PLOT_COLORS } from "./plotly.js";
import {
  TrajectoryPlot,
  type EventMarker,
  type GhostTrace,
  type ReferenceLine,
} from "./TrajectoryPlot.js";

/** A pinned / ghost snapshot: a labelled previous PV trace + its IAE. */
export interface PinnedRun {
  label: string;
  t: number[];
  pv: number[];
  iae?: number;
  color?: string;
  opacity?: number;
}

export interface ClosedLoopPlotProps {
  trajectory: TrajectoryData;
  pid: ControllerKnobs;
  schedules: ScheduleKnobs[];
  /** The setpoint to draw (defaults to pid.setpoint; the live slider may move it
   *  as a preview before the next run). */
  setpoint?: number;
  /** Settling band half-fraction (0.02 = ±2%).  Drawn around the setpoint. */
  bandFraction?: number;
  /** Faded previous-run PV + any pinned snapshots. */
  ghosts?: PinnedRun[];
  /** Optional x-axis zoom (Track|Reject auto-zoom). */
  xRange?: [number, number];
  /** Opt-in: also draw the reactor's OUTLET COMPOSITION (the control objective)
   *  on the left (moles) axis.  Off by default -- the closed-loop story is
   *  T(t); composition is the "did the disturbance corrupt my product" lens. */
  showComposition?: boolean;
  /** The disturbance/forcing controller's name (a `type Signal`).  Its `<name>.MV`
   *  column carries the forcing wave value(t) -- the engine's OWN forcing trace,
   *  drawn on the secondary (T) axis so the student sees the input wave under the
   *  PV response.  Schedule disturbances already ride via `schedules`. */
  signalName?: string;
  /** The actuated MV of the forcing signal (for the trace label, e.g. "T_in"). */
  signalMv?: string;
}

/** Which trajectory column carries the PID's PV (controlled variable).  Tries,
 *  in order: "<name>.PV", "<unit>.<cv>", then the first column matching the
 *  cv name. */
function resolvePvKey(traj: TrajectoryData, pid: ControllerKnobs): string | undefined {
  const keys = Object.keys(traj.vars);
  const candidates = [
    `${pid.name}.PV`,
    pid.measure ? `${pid.measure.unit}.${pid.measure.cv}` : undefined,
  ].filter((k): k is string => !!k);
  for (const c of candidates) if (keys.includes(c)) return c;
  // Fallback: a column ending in .PV
  return keys.find((k) => k.endsWith(".PV"));
}

/** Which trajectory column carries the PID's MV (manipulated variable). */
function resolveMvKey(traj: TrajectoryData, pid: ControllerKnobs): string | undefined {
  const keys = Object.keys(traj.vars);
  const candidates = [`${pid.name}.MV`].filter((k): k is string => !!k);
  for (const c of candidates) if (keys.includes(c)) return c;
  return keys.find((k) => k.endsWith(".MV"));
}

/** The DISTURBANCE column: a Schedule controller's MV mirrors the inlet-T it
 *  drives (it has no PV).  Prefer the first schedule whose actuator is the
 *  feed temperature; fall back to the first schedule's `<name>.MV`. */
function resolveDistKey(
  traj: TrajectoryData, schedules: ScheduleKnobs[], pidMvKey: string | undefined,
): string | undefined {
  const keys = Object.keys(traj.vars);
  const tempActuated = schedules.find(
    (s) => s.actuate && (s.actuate.mv === "T_in" || s.actuate.mv === "T"));
  for (const s of [tempActuated, ...schedules].filter((x): x is ScheduleKnobs => !!x)) {
    const k = `${s.name}.MV`;
    if (keys.includes(k) && k !== pidMvKey) return k;
  }
  return undefined;
}

/** Outlet-composition columns (the control objective): mole / fraction traces
 *  the trajectory already carries (n_<comp> or x_<comp>), for the opt-in lens. */
function resolveCompKeys(traj: TrajectoryData): string[] {
  return Object.keys(traj.vars).filter((k) => /(^|[._])(n_|x_)/.test(k));
}

export function ClosedLoopPlot(props: ClosedLoopPlotProps) {
  const { trajectory, pid, schedules, ghosts, xRange, showComposition, signalName, signalMv } = props;
  const setpoint = props.setpoint ?? pid.setpoint;
  const bandFraction = props.bandFraction ?? 0.02;

  const pvKey = useMemo(() => resolvePvKey(trajectory, pid), [trajectory, pid]);
  const mvKey = useMemo(() => resolveMvKey(trajectory, pid), [trajectory, pid]);
  // The forcing trace: a `type Signal` controller writes its forcing value(t)
  // into `<name>.MV` (setpoint() == lastMV()).  Prefer that engine column; else
  // fall back to a Schedule controller's MV (the staircase disturbance).
  const sigKey = useMemo(() => {
    if (!signalName) return undefined;
    const k = `${signalName}.MV`;
    return Object.keys(trajectory.vars).includes(k) ? k : undefined;
  }, [trajectory, signalName]);
  // The inlet-T disturbance the Schedule controller drives -- a STREAM property
  // (the feed's temperature), drawn as a named band on the secondary (T) axis.
  const distKey = useMemo(
    () => sigKey ?? resolveDistKey(trajectory, schedules, mvKey),
    [sigKey, trajectory, schedules, mvKey]);
  // Outlet composition (the objective): opt-in, on the left moles axis.
  const compKeys = useMemo(
    () => (showComposition ? resolveCompKeys(trajectory) : []), [trajectory, showComposition]);

  // Keep PV + MV (+ the disturbance band, + opt-in composition).  The control
  // story is T(t); without the opt-in the mole columns stay dropped.  When
  // PV/MV can't be resolved, fall back to showing everything so it's never blank.
  const filterVars = useMemo(() => {
    const keep = [pvKey, mvKey, distKey, ...compKeys].filter((k): k is string => !!k);
    return keep.length > 0 ? keep : undefined;
  }, [pvKey, mvKey, distKey, compKeys]);

  // Axis assignment.  The disturbance (inlet T) shares the reactor-T (right)
  // axis.  The MANIPULATED variable (jacket) saturates far above the PV (it
  // slams to its 420 K clamp), so left on the same axis as the PV it stretches
  // the range and squashes the 320->350 K stabilisation into the lower third.
  // When the moles (left) axis is free (composition lens off) the MV gets its
  // OWN left axis — both stories then fill their axes.  With composition shown
  // the left axis is taken by moles, so the MV falls back to the right axis.
  const mvOnLeft = !showComposition && !!mvKey;
  const mvVars = useMemo(
    () => (mvOnLeft ? [distKey] : [mvKey, distKey]).filter((k): k is string => !!k),
    [mvOnLeft, mvKey, distKey]);
  const lvVars = useMemo(
    () => (mvOnLeft && mvKey ? [mvKey] : []), [mvOnLeft, mvKey]);
  const renameVars = useMemo(() => {
    if (!distKey) return undefined;
    const label = sigKey
      ? `forcing — ${signalMv ?? "input"} [K]`
      : "inlet T [K] — disturbance";
    return { [distKey]: label };
  }, [distKey, sigKey, signalMv]);

  // The setpoint as a dashed reference line.
  const referenceLines: ReferenceLine[] = useMemo(
    () => [{ y: setpoint, label: `SP ${setpoint.toFixed(1)}`, dashed: true, color: PLOT_COLORS.accent2 }],
    [setpoint],
  );

  // Disturbance markers from every Schedule controller (skip the t=0 nominal).
  const eventMarkers: EventMarker[] = useMemo(() => {
    const out: EventMarker[] = [];
    for (const s of schedules) {
      const sorted = [...s.schedule].sort((a, b) => a.time - b.time);
      sorted.forEach((step, i) => {
        if (step.time <= 0) return; // the nominal start is not a disturbance
        const prev = sorted[i - 1]?.value;
        const arrow = prev !== undefined ? (step.value < prev ? "▼" : "▲") : "•";
        const dv = prev !== undefined ? step.value - prev : 0;
        const sign = dv >= 0 ? "+" : "";
        out.push({
          x: step.time,
          label: `${arrow} ${s.actuate?.mv ?? "dist"} ${sign}${dv.toFixed(0)}`,
          color: PLOT_COLORS.warm,
        });
      });
    }
    return out;
  }, [schedules]);

  // Ghost PV traces (previous run faded + pinned snapshots with IAE in legend).
  // Trim each to the active x-window too, so a Track|Reject zoom is not defeated
  // by a full-span ghost dragging the auto-range back out.
  const ghost: GhostTrace[] = useMemo(
    () =>
      (ghosts ?? []).map((g) => {
        let gt = g.t, gy = g.pv;
        if (xRange) {
          const [x0, x1] = xRange;
          const gtt: number[] = [];
          const gyy: number[] = [];
          g.t.forEach((ti, i) => {
            if (ti >= x0 - 1e-9 && ti <= x1 + 1e-9) { gtt.push(ti); gyy.push(g.pv[i]!); }
          });
          if (gtt.length > 0) { gt = gtt; gy = gyy; }
        }
        return {
          name: g.iae !== undefined ? `${g.label} · IAE ${formatIae(g.iae)}` : g.label,
          t: gt,
          y: gy,
          side: "right" as const,
          color: g.color ?? PLOT_COLORS.axis,
          opacity: g.opacity ?? 0.35,
        };
      }),
    [ghosts, xRange],
  );

  // Apply the x-zoom by trimming the trajectory time vector for the renderer's
  // band span (the renderer reads t[0]/t[last]); the actual axis range is set
  // via a thin wrapper layout override is not exposed, so we trim here.
  const view = useMemo<TrajectoryData>(() => {
    if (!xRange) return trajectory;
    const [x0, x1] = xRange;
    const idx: number[] = [];
    trajectory.t.forEach((ti, i) => { if (ti >= x0 - 1e-9 && ti <= x1 + 1e-9) idx.push(i); });
    if (idx.length === 0) return trajectory;
    const vars: { [k: string]: number[] } = {};
    for (const [k, ys] of Object.entries(trajectory.vars)) vars[k] = idx.map((i) => ys[i]!);
    return { t: idx.map((i) => trajectory.t[i]!), vars };
  }, [trajectory, xRange]);

  return (
    <TrajectoryPlot
      data={view}
      title="Closed loop — T(t)"
      filterVars={filterVars}
      mvVars={mvVars.length > 0 ? mvVars : undefined}
      lvVars={lvVars.length > 0 ? lvVars : undefined}
      leftTitle={mvOnLeft ? "MV [K]" : undefined}
      renameVars={renameVars}
      referenceLines={referenceLines}
      eventMarkers={eventMarkers}
      band={{ y: setpoint, half: bandFraction * setpoint, label: `±${(bandFraction * 100).toFixed(0)}%` }}
      ghost={ghost}
    />
  );
}

function formatIae(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return v.toExponential(2);
}
