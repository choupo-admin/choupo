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
  RayleighTool — the Rayleigh batch-distillation construction for the Methods
  workspace: plot 1/(y*(x) − x) against the pot composition x, and the area
  under that curve between the run's own final x_W and the charge x_0 IS
  ln(W_0/W) — the historical GRAPHICAL integration of the Rayleigh equation

      ln(W_0/W) = ∫_{x_W}^{x_0} dx / (y*(x) − x).

  SELF-FEEDING (the Methods-workspace contract): the DEFAULT mode is the
  classroom witness tutorials/batch/still/still01_benzene_toluene (1 mol of
  equimolar benzene/toluene at 1.013 bar, ideal Raoult declared, a constant
  vapour offtake stripping 90 % of the pot over 600 s), cloned from the
  bundled corpus with the knob values written into its DECLARED dict scalars
  (methodRun's textual override — units and comments survive; a knob that
  misses its dict THROWS), and integrated by choupoBatch in the browser.
  When the app's CURRENT run carries a servable still trajectory, a source
  toggle offers "Current run" beside the witness.

  TWO engine feeds, both in-browser:
    * the STILL: choupoBatch on the parameterized witness — trajectory
      columns <unit>.n_<comp> / <unit>.T (main.cpp writes them), the pot
      integrated rigorously by RK4 with a bubble-point y* at every stage;
    * the CURVE: y*(x) from a choupoProps binary-VLE sweep (binaryVleSpec →
      synthesizeExploreCase → the WASM adapter — the same feeding machinery
      as the Explorer / McCabe), declaring the SAME package the witness
      declares (ideal γ, ideal-gas vapour) at the knob P.

  ZERO physics in TypeScript, with ONE AUTHORIZED METHOD-GEOMETRY EXCEPTION:
  forming the integrand 1/(y* − x) from the engine's own curve points and
  taking its trapezoid area in view between the engine's own final x_W and
  x_0 (`buildConstruction` / `trapezoidAreaInView`).  That area is the
  graphical method itself — the thing being taught — and every ordinate in
  it is engine-published.  Everything else is display arithmetic on engine
  numbers, stated where it happens: W = Σ n_i is a sum of the trajectory's
  own mole columns, x = n_i/W the basis arithmetic on the same columns,
  ln(W_0/W) a logarithm of a ratio of two engine holdups, and bar → Pa on
  the curve-spec pressure is unit scaling.  No equilibrium, no enthalpy, no
  integration of the STILL happens here.

  The deviation chip is honest about what the witness models: BOTH sides are
  the same declared chemistry (ideal Raoult, the vapour leaving at y*(x) of
  the pot), so the gap between the graphical area and the engine's rigorous
  ln(W_0/W) measures the graphical method's finite resolution — the curve's
  trapezoid grid and the trajectory's write interval — not different physics.

  The construction pane is inline SVG (the Merkel / EpsilonNtu precedent);
  the pot trajectory (W and x_W vs t) rides the existing TrajectoryPlot
  seam.  Pure helpers (detector, integrator, construction builder, knob map)
  are exported for the node test runner (tests/rayleighTool.test.ts).
\*---------------------------------------------------------------------------*/

import { useEffect, useMemo, useRef, useState } from "react";
import { lessonStepper } from "./lessonStep.js";
import {
  Alert, Badge, Box, Group, Loader, SegmentedControl, Slider, Stack,
  Text, Title, Tooltip,
} from "@mantine/core";

import { resolveAdapter } from "../../adapters/index.js";
import type { TrajectoryData } from "../../adapters/SolverAdapter.js";
import { CATALOGUE } from "../../case/catalogue.js";
import {
  EXPLORE_OUTPUT, synthesizeExploreCase, type ExploreSpec,
} from "../../case/exploreSynth.js";
import { eqCurveFromTxyCsv, type EqCurve } from "../../case/mccabeThiele.js";
import { binaryVleSpec } from "../../case/methodFeeds.js";
import { useMethodRun, type ScalarOverride } from "../../case/methodRun.js";
import { useStore } from "../../state/store.js";
import { BatchStaircasePlot, type StaircaseInstant }
  from "./BatchStaircasePlot.js";
import { RAYLEIGH_LIMITS, RAYLEIGH_STEPS } from "./rayleighLesson.js";
import { KnobNumber, PanelNote } from "./knobPanel.js";
import { TrajectoryPlot } from "../plotting/TrajectoryPlot.js";

// ---- Activation -------------------------------------------------------------
// A predicate over the trajectory: the classical Rayleigh construction needs a
// BINARY pot being STRIPPED.  choupoBatch writes one `<unit>.n_<comp>` column
// per (unit, component) plus `<unit>.T` (applications/choupoBatch/main.cpp),
// so a servable unit is one with exactly TWO mole columns whose total holdup
// falls over the run — a reactor at constant holdup, a receiver that GAINS
// moles, or a ternary pot all stay honestly inactive.

const MOLE_RE = /^(.+)\.n_([^.]+)$/;

/** Relative holdup drop below which the pot is not being distilled (a pure
 *  no-op run has nothing to construct over). */
export const MIN_RELATIVE_STRIP = 1.0e-6;

export interface RayleighActivation {
  active: boolean;
  /** The still unit whose pot feeds the construction. */
  unit: string | null;
  /** The two pot components, in the mole-column order. */
  components: string[];
  /** "<unit>.n_<comp>" trajectory columns, same order as `components`. */
  moleColumns: string[];
  /** "<unit>.T" when the trajectory carries it. */
  tempColumn: string | null;
  /** Why the run cannot serve, when a nameable reason exists. */
  reason: string | null;
}

const INACTIVE = (reason: string | null): RayleighActivation => ({
  active: false, unit: null, components: [], moleColumns: [],
  tempColumn: null, reason,
});

/** Decide whether a run feeds this tool.  `columns` are the trajectory column
 *  names; `vars` the series (required for a verdict — without data the falling
 *  holdup cannot be attested, so the answer is inactive, never a guess). */
export function detectRayleighStill(
  columns: string[],
  vars: { [name: string]: number[] } | undefined,
): RayleighActivation {
  const byUnit = new Map<string, { comps: string[]; cols: string[] }>();
  for (const c of columns) {
    const m = MOLE_RE.exec(c);
    if (!m || m[1] === undefined || m[2] === undefined) continue;
    const entry = byUnit.get(m[1]) ?? { comps: [], cols: [] };
    entry.comps.push(m[2]);
    entry.cols.push(c);
    byUnit.set(m[1], entry);
  }
  if (byUnit.size === 0) return INACTIVE("no <unit>.n_<comp> pot columns");

  let reason: string | null = null;
  const note = (r: string) => { if (reason === null) reason = r; };
  for (const unit of [...byUnit.keys()].sort()) {
    const entry = byUnit.get(unit)!;
    if (entry.comps.length !== 2) {
      note(`${unit}: the classical construction needs a BINARY pot `
        + `(${entry.comps.length} n_<comp> columns found)`);
      continue;
    }
    if (!vars) { note("no trajectory series to attest a falling holdup"); continue; }
    const s0 = vars[entry.cols[0]!];
    const s1 = vars[entry.cols[1]!];
    if (!s0 || !s1 || s0.length < 2 || s0.length !== s1.length) {
      note(`${unit}: mole columns missing or shorter than 2 samples`);
      continue;
    }
    if (![...s0, ...s1].every(Number.isFinite)) {
      note(`${unit}: non-finite holdup samples`);
      continue;
    }
    const W0 = s0[0]! + s1[0]!;
    const Wend = s0[s0.length - 1]! + s1[s1.length - 1]!;
    if (!(W0 > 0) || (W0 - Wend) / W0 <= MIN_RELATIVE_STRIP) {
      note(`${unit}: pot holdup does not fall over the run — nothing is `
        + "being distilled");
      continue;
    }
    return {
      active: true, unit, components: entry.comps, moleColumns: entry.cols,
      tempColumn: columns.includes(`${unit}.T`) ? `${unit}.T` : null,
      reason: null,
    };
  }
  return INACTIVE(reason);
}

// ---- The pot history --------------------------------------------------------
// Display arithmetic on the engine's own trajectory columns, stated: W = Σ n_i
// (a sum of the two mole columns), x = n_light/W (basis arithmetic on the same
// columns), ln(W_0/W) a logarithm of their ratio.  The LIGHT component is read
// off the run itself — the pot concentrates in the heavy, so the component
// whose pot mole fraction FALLS is the one distilling over (a data read, not
// a volatility model).

export interface PotHistory {
  W: number[];
  xLight: number[];
  light: string;
  heavy: string;
  W0: number;
  Wend: number;
  x0: number;
  xEnd: number;
  lnW0overW: number;
}

export function potHistory(
  vars: { [name: string]: number[] },
  activation: RayleighActivation,
): PotHistory | null {
  if (!activation.active || activation.moleColumns.length !== 2) return null;
  const sA = vars[activation.moleColumns[0]!];
  const sB = vars[activation.moleColumns[1]!];
  const cA = activation.components[0]!;
  const cB = activation.components[1]!;
  if (!sA || !sB || sA.length < 2 || sA.length !== sB.length) return null;
  const n = sA.length;
  const W: number[] = [];
  const xA: number[] = [];
  for (let i = 0; i < n; ++i) {
    const w = sA[i]! + sB[i]!;
    if (!Number.isFinite(w) || w <= 0) return null;
    W.push(w);
    xA.push(sA[i]! / w);
  }
  // The depleting component is the light one; a tie keeps the column order.
  const lightIsA = xA[0]! - xA[n - 1]! >= 0;
  const xLight = lightIsA ? xA : xA.map((v) => 1 - v);
  return {
    W, xLight,
    light: lightIsA ? cA : cB,
    heavy: lightIsA ? cB : cA,
    W0: W[0]!, Wend: W[n - 1]!,
    x0: xLight[0]!, xEnd: xLight[n - 1]!,
    lnW0overW: Math.log(W[0]! / W[n - 1]!),
  };
}

// ---- The AUTHORIZED method geometry -----------------------------------------
// The one physics-adjacent computation this tool owns: the integrand
// 1/(y* − x) formed pointwise from the ENGINE's equilibrium curve, and its
// trapezoid area in view over [x_W, x_0].  This IS the graphical Rayleigh
// method; every ordinate in it is an engine-published (x, y*) pair.

/** Driving forces at or below this are dropped (the integrand diverges where
 *  y* meets x — the curve's own endpoints at x = 0 and x = 1). */
export const MIN_DRIVING_FORCE = 1.0e-9;

export interface AreaPoint { x: number; f: number; }

/** Trapezoid area under the piecewise-linear f(x) through `pts` between a and
 *  b (a < b), interpolating the end ordinates.  Points are sorted internally;
 *  non-finite points are dropped.  Returns null when the window is not fully
 *  covered by the points — a partial area would silently understate the
 *  integral. */
export function trapezoidAreaInView(
  pts: readonly AreaPoint[], a: number, b: number,
): number | null {
  if (!Number.isFinite(a) || !Number.isFinite(b) || !(a < b)) return null;
  const s = pts
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.f))
    .slice()
    .sort((p, q) => p.x - q.x);
  if (s.length < 2) return null;
  const COVER_EPS = 1.0e-12;
  if (s[0]!.x > a + COVER_EPS || s[s.length - 1]!.x < b - COVER_EPS) return null;

  const fAt = (x: number): number => {
    for (let i = 1; i < s.length; ++i) {
      if (x <= s[i]!.x) {
        const p = s[i - 1]!, q = s[i]!;
        const w = q.x - p.x;
        return w > 0 ? p.f + ((q.f - p.f) * (x - p.x)) / w : q.f;
      }
    }
    return s[s.length - 1]!.f;
  };

  let area = 0;
  let xPrev = a;
  let fPrev = fAt(a);
  for (const p of s) {
    if (p.x <= a) continue;
    const x = Math.min(p.x, b);
    const f = x === p.x ? p.f : fAt(x);
    area += 0.5 * (fPrev + f) * (x - xPrev);
    xPrev = x; fPrev = f;
    if (p.x >= b) break;
  }
  if (xPrev < b) area += 0.5 * (fPrev + fAt(b)) * (b - xPrev);
  return area;
}

export interface RayleighConstruction {
  /** Finite integrand samples 1/(y* − x), one per engine curve point. */
  pts: AreaPoint[];
  /** The view window [a, b] = [x_W(t_end), x_0], from the run itself. */
  a: number;
  b: number;
  /** Trapezoid area in view; null when the window is not covered (e.g. the
   *  driving force vanished inside it), 0 for a degenerate window. */
  area: number | null;
}

/** The graphical construction off the two engine feeds: the curve supplies
 *  every (x, y*) pair, the pot trajectory supplies the window. */
export function buildConstruction(
  curve: EqCurve, pot: PotHistory,
): RayleighConstruction {
  const pts: AreaPoint[] = [];
  for (const p of curve.pts) {
    const d = p.y - p.x;
    if (Number.isFinite(d) && d > MIN_DRIVING_FORCE) pts.push({ x: p.x, f: 1 / d });
  }
  const a = Math.min(pot.xEnd, pot.x0);
  const b = Math.max(pot.xEnd, pot.x0);
  return { pts, a, b, area: b > a ? trapezoidAreaInView(pts, a, b) : 0 };
}

// ---- The classroom witness + its knob→dict map ------------------------------
// The STANDALONE feed: the tool clones this bundled tutorial, writes the knob
// values into its DECLARED dict scalars (methodRun's textual override — units
// and comments survive), and runs choupoBatch in the browser.  Each knob names
// the FILE and dict KEY it writes; the defaults ARE the witness's authored
// values, and the test suite verifies every (file, key) resolves uniquely
// against the real bundled raw text — a knob that misses its dict would run
// the engine on the wrong question (applyScalarOverride throws instead).
//
// Candidate knobs deliberately ABSENT, and why is worth recording:
//   * x_0, the charge composition — the witness declares it as a one-line
//     inline block (`molarComposition { benzene 0.5; toluene 0.5; }` in
//     0/internalState), which the line-anchored `key value [unit];` override
//     grammar cannot address (and two fractions constrained to sum to 1 are
//     not one scalar knob anyway) — the same gap BreakthroughTool records for
//     its feed composition;
//   * V, the pot volume — the witness's own dict comment marks it
//     "decorative; not used in mass balance": a knob that does not reach the
//     physics would be a placebo control;
//   * a reboiler DUTY — still01's rayleigh model declares the offtake as a
//     molar rate (F_vap), not a heat duty; the knobs turn what the dicts
//     declare, never an invented handle.

/** Bundled identifier of the witness case ("<category>/<subclass>/<case>" —
 *  batch is a sub-classed category, so the `still` segment is part of it). */
/** The SECOND witness: the same still with a rectifying column on top, so
 *  there are stages to draw.  still01 has none, and a construction with no
 *  stages cannot show the thing this section exists for. */
export const RECTIFIER_WITNESS = "batch/still/still04_rectifier_benzene_toluene";

/** Ideal stages ABOVE the pot, as still04 declares them.  Read here rather
 *  than assumed: the staircase walks this many plus one, and the extra step
 *  is the pot itself. */
export const RECTIFIER_TRAYS = 3;

/** Lift (t, x_pot, x_D, R) out of the rectifier run's trajectory.  Every
 *  value is the engine's; the only arithmetic is the pot mole fraction from
 *  its own mole columns, which is a ratio and not a model. */
export function rectifierInstants(
  traj: { t?: number[]; vars?: Record<string, number[]> } | undefined,
): StaircaseInstant[] {
  const v = traj?.vars;
  const t = traj?.t;
  if (!v || !t) return [];
  const nb = v["still.n_" + WITNESS_LIGHT];
  const nt = v["still.n_" + WITNESS_HEAVY];
  const xD = v["still.xD_" + WITNESS_LIGHT];
  const R = v["still.R"];
  if (!nb || !nt || !xD || !R) return [];
  const out: StaircaseInstant[] = [];
  for (let i = 0; i < t.length; ++i) {
    const tot = (nb[i] ?? 0) + (nt[i] ?? 0);
    if (!(tot > 0)) continue;
    const d = xD[i], r = R[i];
    if (!Number.isFinite(d) || !Number.isFinite(r)) continue;
    out.push({ t: t[i]!, xPot: nb[i]! / tot, xD: d!, R: r! });
  }
  return out;
}

export const RAYLEIGH_WITNESS = "batch/still/still01_benzene_toluene";

/** The witness pair, light first (benzene boils at ~353 K, toluene ~384 K —
 *  the witness's own header names benzene the more volatile, α ≈ 2.4). */
export const WITNESS_LIGHT = "benzene";
export const WITNESS_HEAVY = "toluene";

const FLOWSHEET = "system/flowsheetDict";

export interface RayleighKnob {
  /** Stable id — the key of the knob-value state bag. */
  id: string;
  /** What the student reads beside the control. */
  label: string;
  /** Witness file the knob writes into. */
  file: string;
  /** The dict key as written there. */
  key: string;
  /** The witness's own authored value — the classroom default. */
  def: number;
  min: number;
  max: number;
  step: number;
  /** The unit the dict declares.  The knob writes the NUMBER only; the unit
   *  word in the dict survives the override untouched.  "" for keys the dict
   *  declares bare (raw SI — the unit lives in the label instead). */
  unit: string;
}

/** The classroom knobs — all engine-side levers.  W_0 and F_vap·t_end set how
 *  deep the strip goes (and with it the area's window), T seeds the first
 *  bubble-point solve, and P moves the whole y*(x) curve — the same P is
 *  handed to the curve sweep, so the construction and the still can never run
 *  at two different pressures. */
export const RAYLEIGH_KNOBS: readonly RayleighKnob[] = [
  // 0/internalState declares `totalMoles 1.0e-3;` BARE (kmol in a comment).
  { id: "charge", label: "charge W0 (kmol)", file: "0/internalState",
    key: "totalMoles", def: 1.0e-3, min: 1.0e-4, max: 1.0e-2, step: 1.0e-4,
    unit: "" },
  { id: "chargeT", label: "charge T", file: "0/internalState", key: "T",
    def: 365, min: 300, max: 383, step: 1, unit: "K" },
  { id: "P", label: "still pressure P", file: FLOWSHEET, key: "P",
    def: 1.013, min: 0.3, max: 3, step: 0.05, unit: "bar" },
  // flowsheetDict declares `F_vap 1.5e-6;` BARE (kmol/s in a comment).
  { id: "F_vap", label: "vapour offtake F_vap (kmol/s)", file: FLOWSHEET,
    key: "F_vap", def: 1.5e-6, min: 1.0e-7, max: 1.0e-5, step: 1.0e-7,
    unit: "" },
  // controlDict declares `endTime 600;` BARE (raw SI seconds).
  { id: "endTime", label: "horizon endTime (s)", file: "system/controlDict",
    key: "endTime", def: 600, min: 60, max: 3600, step: 30, unit: "" },
];

export type RayleighKnobValues = { [id: string]: number };

/** The witness's authored values — the classroom baseline. */
export function defaultKnobValues(): RayleighKnobValues {
  const out: RayleighKnobValues = {};
  for (const k of RAYLEIGH_KNOBS) out[k.id] = k.def;
  return out;
}

/** Knob values → methodRun ScalarOverrides.  Non-finite values are dropped
 *  (that knob keeps the witness's authored number) — never written as NaN. */
export function knobOverrides(values: RayleighKnobValues): ScalarOverride[] {
  const out: ScalarOverride[] = [];
  for (const k of RAYLEIGH_KNOBS) {
    const v = values[k.id];
    if (v !== undefined && Number.isFinite(v))
      out.push({ file: k.file, key: k.key, value: v });
  }
  return out;
}

// The provenance line, always visible in classroom mode.
const PROVENANCE =
  `Runs tutorials/${RAYLEIGH_WITNESS} (1 mol equimolar benzene/toluene, `
  + "ideal Raoult declared, 1.013 bar) with your parameters, in your browser "
  + "(choupoBatch WASM); y*(x) is a separate in-browser choupoProps sweep "
  + "declaring the witness's own package (ideal γ, ideal-gas vapour) at "
  + "your P.";

/** Points on the y*(x) sweep — also the trapezoid grid of the in-view area,
 *  which is exactly the "resolution of the graphical method" the deviation
 *  chip talks about. */
const CURVE_POINTS = 121;

// ---- The equilibrium-curve run ----------------------------------------------
// The SAME feeding machinery the Explorer / McCabe use (resolveAdapter("wasm")
// over a synthesized choupoProps case), reduced to the one-CSV shape this tool
// needs — view plumbing replicated from MethodsWorkspace's useEngineCsv, not
// physics.  Debounced; a newer spec aborts the in-flight run.

function useExploreCsv(spec: ExploreSpec | null): {
  csv: string | null; err: string | null; busy: boolean;
} {
  const [csv, setCsv] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const runSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!spec) {
      abortRef.current?.abort();
      setCsv(null); setErr(null); setBusy(false);
      return;
    }
    const t = setTimeout(() => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const seq = ++runSeq.current;
      setBusy(true); setErr(null);
      void (async () => {
        try {
          const resolved = await resolveAdapter("wasm");
          if (seq !== runSeq.current) return;
          if (resolved.kind === "unavailable") {
            setErr(resolved.fallbackReason
              ?? "The real solver could not be loaded (build the WASM).");
            setBusy(false);
            return;
          }
          const result = await resolved.adapter.run(
            synthesizeExploreCase(spec), () => {}, ctrl.signal, "choupoProps");
          if (seq !== runSeq.current) return;
          const out = result.csvFiles?.[EXPLORE_OUTPUT];
          if (out) { setCsv(out); setErr(null); }
          else {
            const detail = result.log.split("\n").map((l) => l.trim()).reverse()
              .find((l) => /(?:error|fatal|refused|failed)/i.test(l));
            setErr(result.status !== "done"
              ? `choupoProps did not finish${detail ? `: ${detail}` : "."}`
              : "No data — the engine returned an empty result for this sweep.");
          }
        } catch (e) {
          if (seq === runSeq.current && !ctrl.signal.aborted)
            setErr(e instanceof Error ? e.message : String(e));
        } finally {
          if (seq === runSeq.current) setBusy(false);
        }
      })();
    }, 300);
    return () => clearTimeout(t);
  }, [spec]);
  return { csv, err, busy };
}

// ---- Display formatting -----------------------------------------------------

function fmt(v: number | null | undefined, d = 5): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toPrecision(d) : "—";
}

// ---- The construction chart (inline SVG, the Merkel frame conventions) ------

const FW = 640, FH = 420;
const FX0 = 62, FX1 = 606, FY0 = 16, FY1 = 372;

const GRID = "var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";
const CURVE_COLOR = "#26c6da";     // the integrand off the engine's curve
const AREA_COLOR = "#26c6da";      // the shaded ln(W0/W) area (light fill)
const MARKER_COLOR = "#ffb74d";    // the window ends x_W / x_0

const fmtTick = (v: number) => String(Number(v.toPrecision(3)));

/** Linear interpolation on the sorted finite integrand points (drawing only —
 *  the AREA number comes from trapezoidAreaInView, never from pixels). */
function interpF(s: readonly AreaPoint[], x: number): number | null {
  if (s.length < 2 || x < s[0]!.x || x > s[s.length - 1]!.x) return null;
  for (let i = 1; i < s.length; ++i) {
    if (x <= s[i]!.x) {
      const p = s[i - 1]!, q = s[i]!;
      const w = q.x - p.x;
      return w > 0 ? p.f + ((q.f - p.f) * (x - p.x)) / w : q.f;
    }
  }
  return s[s.length - 1]!.f;
}

function ConstructionSvg({ con, pot, busyOverlay }: {
  con: RayleighConstruction;
  pot: PotHistory;
  /** A newer classroom run is in flight: keep the last chart visible and
   *  overlay a loader — never a blank. */
  busyOverlay: boolean;
}): JSX.Element {
  const s = [...con.pts].sort((p, q) => p.x - q.x);

  // Drawn domain: the window padded 15 % each side, clipped to [0, 1] and to
  // the curve's finite coverage (the integrand diverges at the endpoints).
  const span = Math.max(con.b - con.a, 1e-6);
  const xLo = Math.max(0, con.a - 0.15 * span, s[0]?.x ?? 0);
  const xHi = Math.min(1, con.b + 0.15 * span, s[s.length - 1]?.x ?? 1);
  const drawn = s.filter((p) => p.x >= xLo && p.x <= xHi);
  if (drawn.length < 2) {
    return (
      <Text size="sm" c="dimmed" p={12}>
        The engine&apos;s y*(x) points leave no finite integrand inside the
        run&apos;s window — nothing honest to draw.
      </Text>
    );
  }

  const fHi = Math.max(...drawn.map((p) => p.f)) * 1.06;
  const toX = (x: number) => FX0 + ((FX1 - FX0) * (x - xLo)) / (xHi - xLo || 1);
  const toY = (f: number) => FY1 - ((FY1 - FY0) * f) / (fHi || 1);

  const curveLine = drawn
    .map((p) => `${toX(p.x).toFixed(2)},${toY(p.f).toFixed(2)}`).join(" ");

  // The shaded area: interpolated end ordinates + interior points, closed to
  // the f = 0 baseline (the integral IS the area down to zero).
  const fA = interpF(s, con.a);
  const fB = interpF(s, con.b);
  const areaPts: string[] = [];
  if (fA !== null && fB !== null && con.b > con.a) {
    areaPts.push(`${toX(con.a).toFixed(2)},${toY(fA).toFixed(2)}`);
    for (const p of drawn) {
      if (p.x > con.a && p.x < con.b)
        areaPts.push(`${toX(p.x).toFixed(2)},${toY(p.f).toFixed(2)}`);
    }
    areaPts.push(`${toX(con.b).toFixed(2)},${toY(fB).toFixed(2)}`);
    areaPts.push(`${toX(con.b).toFixed(2)},${toY(0).toFixed(2)}`);
    areaPts.push(`${toX(con.a).toFixed(2)},${toY(0).toFixed(2)}`);
  }

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => xLo + f * (xHi - xLo));
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * fHi);

  const marker = (x: number, label: string) => (
    <g>
      <line x1={toX(x)} y1={FY0 + 10} x2={toX(x)} y2={FY1}
        stroke={MARKER_COLOR} strokeWidth={1.4} strokeDasharray="3 3" />
      <text x={toX(x) + 4} y={FY0 + 20} fontSize={10} fill={MARKER_COLOR}>
        {label}
      </text>
    </g>
  );

  return (
    <Box style={{ flex: 1, minHeight: 0, position: "relative" }}>
      {busyOverlay && (
        <Box style={{ position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 1,
          background: "light-dark(rgba(255,255,255,0.5), rgba(0,0,0,0.35))" }}>
          <Loader size="sm" />
        </Box>
      )}
      <svg viewBox={`0 0 ${FW} ${FH}`} width="100%" height="100%"
        preserveAspectRatio="xMidYMid meet" role="img"
        aria-label="Rayleigh construction: 1/(y*−x) versus pot composition,
          area shaded between the final and initial compositions">
        {xTicks.map((t) => (
          <g key={`gx${t}`}>
            <line x1={toX(t)} y1={FY0} x2={toX(t)} y2={FY1}
              stroke={GRID} strokeWidth={0.6} />
            <text x={toX(t)} y={FY1 + 16} textAnchor="middle"
              fontSize={11} fill={INK}>{fmtTick(t)}</text>
          </g>
        ))}
        {yTicks.map((f) => (
          <g key={`gy${f}`}>
            <line x1={FX0} y1={toY(f)} x2={FX1} y2={toY(f)}
              stroke={GRID} strokeWidth={0.6} />
            <text x={FX0 - 6} y={toY(f) + 4} textAnchor="end"
              fontSize={11} fill={INK}>{fmtTick(f)}</text>
          </g>
        ))}
        <text x={(FX0 + FX1) / 2} y={FH - 6} textAnchor="middle"
          fontSize={12} fill={INK}>
          x — pot mole fraction {pot.light}
        </text>
        <text x={14} y={(FY0 + FY1) / 2} textAnchor="middle" fontSize={12}
          fill={INK} transform={`rotate(-90 14 ${(FY0 + FY1) / 2})`}>
          1 / (y* − x)
        </text>

        {/* the shaded area = ln(W0/W) in the graphical method */}
        {areaPts.length > 0 && (
          <polygon points={areaPts.join(" ")} fill={AREA_COLOR}
            opacity={0.15} stroke="none" />
        )}

        {/* the integrand off the engine's curve */}
        <polyline points={curveLine} fill="none" stroke={CURVE_COLOR}
          strokeWidth={2} />

        {/* the window ends, from the run itself */}
        {marker(con.a, `x_W(t_end) = ${fmt(con.a, 4)}`)}
        {marker(con.b, `x_0 = ${fmt(con.b, 4)}`)}
      </svg>
    </Box>
  );
}

// ---- The tool ---------------------------------------------------------------

export function RayleighTool(): JSX.Element {
  const appResult = useStore((s) => s.runResult);

  // ---- Source: the classroom witness run vs the app's current run.  The
  // toggle appears only when the current run carries a SERVABLE still
  // trajectory (a binary pot being stripped) — a run with nothing to serve
  // never offers a mode whose only content would be an apology.
  const appDetection = useMemo(
    () => detectRayleighStill(
      appResult?.trajectory ? Object.keys(appResult.trajectory.vars) : [],
      appResult?.trajectory?.vars),
    [appResult]);
  const [source, setSource] = useState<"classroom" | "current">("classroom");
  const src: "classroom" | "current" =
    appDetection.active && source === "current" ? "current" : "classroom";

  // ---- Classroom knobs → witness overrides → in-browser choupoBatch --------
  const [knobs, setKnobs] = useState<RayleighKnobValues>(defaultKnobValues);
  const { result: classroom, err, busy } = useMethodRun(
    src === "classroom" ? RAYLEIGH_WITNESS : null,
    knobOverrides(knobs), JSON.stringify(knobs), "choupoBatch");

  const result = src === "current" ? appResult : classroom;
  const trajectory: TrajectoryData | undefined = result?.trajectory;

  const detection = useMemo(
    () => detectRayleighStill(
      trajectory ? Object.keys(trajectory.vars) : [], trajectory?.vars),
    [trajectory]);
  const pot = useMemo(
    () => (trajectory && detection.active
      ? potHistory(trajectory.vars, detection) : null),
    [trajectory, detection]);

  // ---- The y*(x) sweep (classroom only): the witness's own declared package
  // (ideal γ, ideal-gas vapour) at the knob P.  bar → Pa is unit scaling.
  const knobP = knobs["P"];
  const P_Pa = (typeof knobP === "number" && Number.isFinite(knobP)
    ? knobP : 1.013) * 1.0e5;
  const spec = useMemo<ExploreSpec | null>(
    () => (src === "classroom"
      ? binaryVleSpec({
          pair: [WITNESS_LIGHT, WITNESS_HEAVY], catalogue: CATALOGUE,
          kind: "mccabe", activity: "ideal", eos: "idealGas",
          P: P_Pa, n: CURVE_POINTS, localUnifac: {},
        })
      : null),
    [src, P_Pa]);
  const { csv: curveCsv, err: curveErr, busy: curveBusy } = useExploreCsv(spec);
  const curve = useMemo(
    () => (curveCsv ? eqCurveFromTxyCsv(curveCsv, WITNESS_LIGHT) : null),
    [curveCsv]);

  /*  THE STAGES, ASKED FOR BY NAME.  A batch still with trays is a McCabe
   *  construction that MOVES: the pot depletes, the distillate gets leaner,
   *  and the whole staircase slides down the curve.  That is what a column
   *  diagram cannot show, and it is why this runs a SECOND witness --
   *  still04, which declares a rectifier with trays -- rather than trying to
   *  draw stages on a still that has none.  */
  const rect = useMethodRun(
    src === "classroom" ? RECTIFIER_WITNESS : null, [], "rect", "choupoBatch");
  const instants = useMemo(
    () => rectifierInstants(rect.result?.trajectory), [rect.result]);
  const [tIdx, setTIdx] = useState(0);
  const at: StaircaseInstant | null =
    instants.length > 0
      ? instants[Math.min(tIdx, instants.length - 1)]!
      : null;

  const con = useMemo(
    () => (curve && pot && src === "classroom"
      ? buildConstruction(curve, pot) : null),
    [curve, pot, src]);

  // The chip arithmetic: |area − ln| / ln on two numbers already on screen.
  const relDev = con?.area != null && pot && pot.lnW0overW > 0
    ? Math.abs(con.area - pot.lnW0overW) / pot.lnW0overW
    : null;

  // The pot trajectory view: W = Σ n_i and x_light, display arithmetic on the
  // engine's own mole columns (stated in the module header).
  const trajView = useMemo(() => {
    if (!trajectory || !pot || detection.unit === null) return null;
    const wName = `${detection.unit}.W`;
    const xName = `${detection.unit}.x_${pot.light}`;
    return {
      data: {
        t: trajectory.t,
        vars: { [wName]: pot.W, [xName]: pot.xLight },
      } satisfies TrajectoryData,
      wName, xName,
    };
  }, [trajectory, pot, detection]);

  // ---- The setup panel's content: source, knobs, provenance ----------------
  const controls = (
    <>
      {(appDetection.active || source === "current") && (
        <SegmentedControl size="xs" value={src} fullWidth
          onChange={(v) => setSource(v === "current" ? "current" : "classroom")}
          data={[
            { label: "Classroom", value: "classroom" },
            { label: "Current run", value: "current" },
          ]} />
      )}
      {src === "classroom" && (
        <>
          {busy && (
            <Group gap={6} wrap="nowrap" align="center">
              <Loader size="xs" />
              <Text size="xs" c="dimmed">
                re-integrating the still — seconds, not instant
              </Text>
            </Group>
          )}
          {curveBusy && !busy && (
            <Group gap={6} wrap="nowrap" align="center">
              <Loader size="xs" />
              <Text size="xs" c="dimmed">sweeping y*(x)</Text>
            </Group>
          )}
          {RAYLEIGH_KNOBS.map((k) => (
            <KnobNumber key={k.id}
              label={k.unit ? `${k.label} [${k.unit}]` : k.label}
              value={knobs[k.id] ?? k.def} min={k.min} max={k.max} step={k.step}
              onChange={(v) => setKnobs((st) => ({ ...st, [k.id]: v }))} />
          ))}
          <PanelNote>{PROVENANCE}</PanelNote>
        </>
      )}
    </>
  );

  // The engine's messages, verbatim — never rephrased, never swallowed.
  const alerts = (
    <>
      {src === "classroom" && err !== null && (
        <Alert color="red" variant="light" m={12}
          title="The still run refused or failed — the engine's message, verbatim">
          <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
            {err}
          </Text>
        </Alert>
      )}
      {src === "classroom" && curveErr !== null && (
        <Alert color="orange" variant="light" m={12}
          title="The y*(x) sweep failed — the engine's message, verbatim">
          <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
            {curveErr}
          </Text>
        </Alert>
      )}
    </>
  );

  /*  ONE renderer for the lesson, above BOTH returns.  The empty state and
   *  the full page must show the same steps, and a second copy of this
   *  function would be two homes for one page. */
  const lessonStep = lessonStepper(RAYLEIGH_STEPS);

  // ---- No drawable pot yet: per-source honest states ------------------------
  if (pot === null || trajView === null) {
    /*  THE LESSON SURVIVES A RUN THAT PRODUCED NOTHING.
     *
     *  This branch used to return the knobs and an apology and nothing else,
     *  so the explanation vanished exactly when there was no diagram to
     *  explain -- which is the opposite of what an EduTool is for.  A reader
     *  whose browser cannot run the engine should still be able to learn the
     *  method; only the interactive is missing, and the page says which.  */
    return (
      <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
        <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
        <Box>
          <Title order={3}>Batch distillation, and a staircase that moves</Title>
          <Text size="sm" c="dimmed" mt={4}>
            The fourth time you meet this construction — and the first time it
            will not hold still, because what you are separating is being
            consumed while you separate it.
          </Text>
        </Box>
        {alerts}
        {lessonStep(1)}
        {lessonStep(2)}
        {lessonStep(3)}
        {lessonStep(4)}
        <Stack gap={8} style={{ maxWidth: 280 }}>{controls}</Stack>
        <Box style={{ display: "flex", alignItems: "center",
          justifyContent: "center", padding: 12 }}>
          {src === "classroom" && err === null && (busy || classroom === null) ? (
            <Group gap="sm" wrap="nowrap" align="center">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">
                the engine is integrating the still — seconds, not instant
              </Text>
            </Group>
          ) : (
            <Text size="sm" c="dimmed" ta="center" maw={480}>
              {src === "classroom"
                ? "The classroom run finished but its trajectory does not "
                  + "serve the Rayleigh construction"
                : "This run's trajectory does not serve the Rayleigh "
                  + "construction"}
              {detection.reason ? ` — ${detection.reason}.` : "."}
              {" "}It needs a binary pot (two n_&lt;comp&gt; columns on one
              unit) whose holdup falls over the run.
            </Text>
          )}
        </Box>
        <Box>
          <Title order={5}>What this does not model</Title>
          <Box mt={4} style={{ display: "grid", columnGap: 16, rowGap: 6,
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            {RAYLEIGH_LIMITS.map((l) => (
              <Text key={l.id} size="xs" c="dimmed">
                <b>{l.title}</b> {l.body}
              </Text>
            ))}
          </Box>
        </Box>
        </Stack>
      </Box>
    );
  }


  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>

      <Box>
        <Title order={3}>Batch distillation, and a staircase that moves</Title>
        <Text size="sm" c="dimmed" mt={4}>
          The fourth time you meet this construction — and the first time it
          will not hold still, because what you are separating is being
          consumed while you separate it.
        </Text>
      </Box>

      {alerts}

      {lessonStep(1)}
      {lessonStep(2)}

      <Box>
        <Title order={5}>The Rayleigh integral, on the engine’s own curve</Title>
        <Text size="sm" mt={4}>
          The shaded area and the engine’s own holdups are two routes to one
          number.  Turn the knobs and watch them stay together — or come
          apart, which is the more instructive outcome.
        </Text>
      </Box>

      <Box style={{ display: "grid", gap: 14,
        gridTemplateColumns: "minmax(200px, 240px) 1fr" }}>
        <Stack gap={8}>{controls}</Stack>
        <Box style={{ minWidth: 0 }}>

      {/* Chips: the two sides of the identity + the window's far end. */}
      <Group gap="sm" wrap="wrap" align="center" px={12} py={6}
        style={{ flexShrink: 0 }}>
        <Tooltip withArrow multiline w={420}
          label={"ln(W0/W) is a logarithm of the ratio of the engine's own "
            + "first and last pot holdups (W = Σ n_i over the trajectory's "
            + "mole columns) — the RIGOROUS side, integrated by the engine's "
            + "RK4 with a bubble-point y* at every stage."}>
          <Badge variant="light" color="cyan" tt="none"
            styles={{ root: { cursor: "help" } }}>
            engine ln(W0/W) = {fmt(pot.lnW0overW)}
          </Badge>
        </Tooltip>
        <Tooltip withArrow multiline w={420}
          label={"The GRAPHICAL side: trapezoids over the engine's own "
            + `y*(x) points (${CURVE_POINTS}-point sweep), integrated in `
            + "view between the run's own x_W(t_end) and x_0 — the one "
            + "authorized geometric computation this tool owns.  null means "
            + "the window is not covered by finite integrand points."}>
          <Badge variant="light" color="orange" tt="none"
            styles={{ root: { cursor: "help" } }}>
            area in view = {src === "current" ? "classroom-only" : fmt(con?.area)}
          </Badge>
        </Tooltip>
        {relDev !== null && (
          <Tooltip withArrow multiline w={440}
            label={"Both sides model the SAME chemistry — the witness "
              + "declares ideal Raoult (γ = 1) and its vapour leaves at "
              + "y*(x) of the pot, and the sweep declares the same package "
              + "at the same P — so this gap measures the graphical "
              + "method's finite resolution (the curve's trapezoid grid and "
              + "the trajectory's write interval), not different physics."}>
            <Badge variant="light"
              color={relDev < 0.02 ? "teal" : "yellow"} tt="none"
              styles={{ root: { cursor: "help" } }}>
              graphical vs rigorous: Δ = {relDev.toExponential(2)}
            </Badge>
          </Tooltip>
        )}
        <Text size="xs" c="dimmed">
          final x_{pot.light} = {fmt(pot.xEnd, 4)} · W {fmt(pot.W0, 4)} →{" "}
          {fmt(pot.Wend, 4)} kmol
        </Text>
      </Group>

      {/* Left: the construction; right: the pot trajectory. */}
      <Group gap={0} wrap="nowrap" align="stretch"
        style={{ flex: 1, minHeight: 0 }}>
        <Box style={{ flex: "1 1 58%", minWidth: 0, minHeight: 0,
          display: "flex", flexDirection: "column", padding: "0 4px 4px 12px" }}>
          {src === "classroom" && con ? (
            <ConstructionSvg con={con} pot={pot}
              busyOverlay={busy || curveBusy} />
          ) : src === "classroom" ? (
            <Box style={{ flex: 1, display: "flex", alignItems: "center",
              justifyContent: "center" }}>
              {curveErr === null ? (
                <Group gap="sm" wrap="nowrap" align="center">
                  <Loader size="sm" />
                  <Text size="sm" c="dimmed">sweeping y*(x) in your browser…</Text>
                </Group>
              ) : (
                <Text size="sm" c="dimmed" ta="center" maw={420}>
                  No y*(x) curve — the construction cannot be drawn (the
                  sweep&apos;s message is above, verbatim).
                </Text>
              )}
            </Box>
          ) : (
            <Box style={{ flex: 1, display: "flex", alignItems: "center",
              justifyContent: "center" }}>
              <Text size="sm" c="dimmed" ta="center" maw={440}>
                The graphical construction is drawn in Classroom mode, where
                the y*(x) sweep runs the witness&apos;s own declared package
                (ideal Raoult).  This run&apos;s thermodynamic package is not
                re-assembled here, and integrating under a curve from a
                different model would compare the still against the wrong
                physics.  The trajectory and ln(W0/W) are this run&apos;s own
                numbers.
              </Text>
            </Box>
          )}
        </Box>
        <Box style={{ flex: "1 1 42%", minWidth: 0, minHeight: 0,
          overflow: "hidden" }}>
          <TrajectoryPlot
            data={trajView.data}
            filterVars={[trajView.wName, trajView.xName]}
            mvVars={[trajView.xName]}
            leftTitle="pot holdup W [kmol]"
            rightTitle={`x_${pot.light} [-]`}
            title={`Pot trajectory — ${detection.unit ?? ""}`}
          />
        </Box>
      </Group>

      {/* The pedagogy line, stated rather than implied. */}
      <Text size="xs" c="dimmed" px={12} pb={6} style={{ flexShrink: 0 }}>
        The shaded area ∫ dx/(y*(x) − x) over [x_W, x_0] IS ln(W0/W) in the
        classical graphical Rayleigh method — integrated in view from the
        engine&apos;s equilibrium curve (trapezoids over its published
        points).  W and x are display arithmetic on the trajectory&apos;s own
        mole columns; every y* and every holdup is the engine&apos;s.
      </Text>
        </Box>
      </Box>

      {lessonStep(3)}

      {/*  THE STAGES, MOVING.  A second witness (still04) with a real
          rectifier, scrubbed in time -- what a column diagram cannot show. */}
      {src === "classroom" && curve && (
        <Box>
          <Title order={5}>Drag the clock and watch the stages slide</Title>
          {rect.busy && (
            <Group gap={6} wrap="nowrap" mt={6}>
              <Loader size="xs" />
              <Text size="xs" c="dimmed">solving the rectifier campaign…</Text>
            </Group>
          )}
          {rect.err && (
            <Alert color="red" variant="light" mt={6}
              title="choupoBatch (WASM)">
              <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
                {rect.err}
              </Text>
            </Alert>
          )}
          {at && (
            <>
              <Text size="sm" mt={4}>
                The same still with a {RECTIFIER_TRAYS}-tray column above the
                pot, run at constant reflux.  Every value on the diagram —
                x_D, R and the pot — is this instant of the engine’s own
                campaign; the staircase is geometry on them.
              </Text>
              <Box mt={8}>
                <Text size="xs" c="dimmed" mb={2}>time through the batch</Text>
                <Slider min={0} max={instants.length - 1} step={1}
                  value={Math.min(tIdx, instants.length - 1)}
                  onChange={setTIdx} label={null} />
              </Box>
              <Box mt={10} style={{ maxWidth: 640 }}>
                <BatchStaircasePlot curve={curve} at={at}
                  trays={RECTIFIER_TRAYS} light={WITNESS_LIGHT} />
              </Box>
            </>
          )}
        </Box>
      )}

      {lessonStep(4)}

      <Box>
        <Title order={5}>What this does not model</Title>
        <Box mt={4} style={{ display: "grid", columnGap: 16, rowGap: 6,
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          {RAYLEIGH_LIMITS.map((l) => (
            <Text key={l.id} size="xs" c="dimmed">
              <b>{l.title}</b> {l.body}
            </Text>
          ))}
        </Box>
      </Box>
      </Stack>
    </Box>
  );
}
