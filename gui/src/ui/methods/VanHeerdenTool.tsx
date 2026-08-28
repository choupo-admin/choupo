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
  VanHeerdenTool — the ignition / extinction diagram for the Methods
  workspace: heat GENERATED G(T) against heat REMOVED R(T), both drawn from
  the non-isothermal CSTR's OWN published profile.

  The construction, in the witness's own words (its flowsheetDict header):
  eliminate the extents and what remains is ONE equation in the temperature,
  phi(T) = H_out(T) − H_in − Q_ext(T) = 0 — the textbook "heat generated
  equals heat removed".  "The generation curve G(T) is a sigmoid (the rate
  saturates once the reactant is gone); the removal line R(T) = F cp (T −
  T_in) is straight (adiabatic: the only sink is the sensible heat that
  leaves with the product).  A straight line can cut a sigmoid THREE times:
  the extinguished state, an unstable middle state, and the ignited state."

  SELF-FEEDING (the Methods-workspace contract): the DEFAULT mode is
  STANDALONE — the tool runs the ENGINE itself, in the browser
  (choupoSolve WASM), on its own witness
      tutorials/steady/reactors/cstr05_multiplicity
  (bundled identifier "steady/reactors/cstr05_multiplicity"), with a compact
  knob panel writing DECLARED dict scalars through methodRun's textual
  ScalarOverride.  When the app's CURRENT run carries a servable CSTR
  profile (the G_kW + R_kW column pair), a source toggle offers "Current
  run" beside the classroom witness.

  THE DECISIVE KNOB IS T_guess, and the case says why: "Choupo scans, finds
  them all, prints them, and reports the one nearest `T_guess`.  Change
  T_guess and the reactor moves to another branch — the same equipment, the
  same feed, a different answer.  That is not a numerical defect; it is the
  physics, and it is why real reactors need a start-up procedure."  Drag
  T_guess here and the REPORTED marker jumps between the crossings, on the
  same G/R pair.

  ZERO physics in TypeScript.  Every curve is an engine column: the CSTR's
  profile (xAxis "T_K", columns T_K / G_kW / R_kW / phi_kW over the engine's
  own steady-state scan grid) and its KPI row (steadyStates, T_out,
  dT_rise, T_guess, T).  The crossings are NOT re-detected here — they are
  the engine's own `markers`, one per root, bisected on the engine's grid
  and labelled "steady state 1..N" with " (reported)" appended to the one
  the run returns.

  Two AUTHORIZED VIEW-GEOMETRY exceptions, each labeled where it happens:
    * `classifySteadyStates` — ORDERING over the engine's marker numbers:
      sort the roots by T, parse the "(reported)" suffix (never guess it),
      and with exactly THREE roots flag the MIDDLE one as the unstable
      state.  That is index arithmetic on engine output, not a stability
      analysis; with any other count the tool makes NO unstable claim.
    * `interpolateAt` — piecewise-linear interpolation of a published
      column at the engine's own root temperature, so the crossing dot can
      sit ON the drawn curve.  It reads the engine's points; it never finds
      a crossing.
  The one arithmetic beyond that is `ignitionSpan` — the difference of the
  highest and lowest engine-published root temperatures, which is the
  practical meaning of multiplicity (how far the reactor jumps at ignition).

  The chart is inline SVG (the EpsilonNtu / Merkel / Levenspiel precedent) —
  the plotting bundle cannot load outside a browser, and the pure helpers
  (detector, marker classifier, axis helpers, knob map) must stay importable
  by the node test runner (tests/vanHeerdenTool.test.ts).

  THE PAGE IS A SCROLLING LESSON, not an instrument panel: the definitions
  (steps 1-3 of `vanHeerdenLesson.ts`) sit ABOVE the diagram, the consequences
  the diagram exists for — ignition/extinction hysteresis, and which handles
  actually move the removal line — sit BELOW it, and the knobs live in a
  two-column grid beside the plot rather than in a docked rail.  The prose is
  DATA (`VAN_HEERDEN_STEPS` / `VAN_HEERDEN_LIMITS`) so the node test runner can
  assert it still says what it is supposed to say.  There is ONE lesson
  renderer, hoisted above BOTH returns: the no-surface branch shows the same
  steps and the same limits as the branch that has a diagram, because the
  argument is worth reading whether or not a curve arrived.
\*---------------------------------------------------------------------------*/

import { useCallback, useMemo, useState } from "react";
import {
  Alert, Badge, Box, Group, Loader, SegmentedControl, Stack, Switch, Text,
  Title, Tooltip,
} from "@mantine/core";

import type { ProfileMarker, UnitProfile } from "../../adapters/SolverAdapter.js";
import { useMethodRun, type ScalarOverride } from "../../case/methodRun.js";
import { useStore } from "../../state/store.js";
import { KnobSlider, PanelNote } from "./knobPanel.js";
import { VAN_HEERDEN_LIMITS, VAN_HEERDEN_STEPS } from "./vanHeerdenLesson.js";

// ---- Detection: which engine surface feeds the tool -------------------------
// The COLUMN PAIR is the contract, never a unit or a case name (the Merkel
// posture).  A non-isothermal CSTR publishes G_kW and R_kW at every point of
// the temperature scan it already walks; an isothermal one publishes no
// profile at all, so it cannot be mistaken for a servable feed.

/** The engine's temperature axis column (the profile's own `xAxis`). */
export const T_COLUMN = "T_K";
/** Heat GENERATED by the reaction, at the feed temperature [kW]. */
export const G_COLUMN = "G_kW";
/** Heat REMOVED — sensible heat leaving with the product, plus exchanger [kW]. */
export const R_COLUMN = "R_kW";
/** The engine's own residual, phi = R − G [kW] — zero at every crossing. */
export const PHI_COLUMN = "phi_kW";

/** Per-unit KPI block as the adapter delivers it (RunResult.kpis[unit]). */
export type KpiRow = { [key: string]: number };
export type KpiMap = { [unitName: string]: KpiRow };

export interface VanHeerdenFeed {
  unit: string;
  profile: UnitProfile;
  /** The unit's KPI row when the run carries one — an absent row keeps the
   *  diagram drawable and the chips honestly dashed. */
  kpis?: KpiRow;
}

/** Profiles carrying the Van Heerden pair: the profile's own xAxis column
 *  plus G_kW and R_kW, all the same length ≥ 2.  Sorted by unit name. */
export function findVanHeerdenFeeds(
  profiles: UnitProfile[] | undefined,
  kpis: KpiMap | undefined,
): VanHeerdenFeed[] {
  if (!profiles) return [];
  const out: VanHeerdenFeed[] = [];
  for (const p of profiles) {
    const T = p.columns[p.xAxis];
    const G = p.columns[G_COLUMN];
    const R = p.columns[R_COLUMN];
    if (!T || !G || !R) continue;
    if (T.length < 2 || G.length !== T.length || R.length !== T.length) continue;
    const row = kpis?.[p.unit];
    out.push(row
      ? { unit: p.unit, profile: p, kpis: row }
      : { unit: p.unit, profile: p });
  }
  return out.sort((a, b) => a.unit.localeCompare(b.unit));
}

// ---- AUTHORIZED view geometry 1: the marker classifier ----------------------
// The engine publishes ONE marker per root it found, labelled "steady state
// <k>" with " (reported)" appended to the one the run returned.  This helper
// PARSES that label (never guesses which is reported), orders the roots by
// temperature, and — with exactly THREE — flags the middle one.  Ordering over
// engine numbers; no stability analysis is performed here, and none is
// claimed for any other root count.

/** The suffix the engine appends to the marker of the root it reported. */
export const REPORTED_SUFFIX = " (reported)";

export interface SteadyState {
  /** The root temperature, verbatim from the engine's marker [K]. */
  T: number;
  /** The engine's marker label, verbatim. */
  label: string;
  /** Parsed from the label's `(reported)` suffix — the branch this run
   *  actually returned (the one nearest T_guess). */
  reported: boolean;
  /** Position in ascending temperature order, 0-based. */
  order: number;
  /** The MIDDLE of exactly three crossings — the state no start-up
   *  procedure can hold.  False for every root of any other count: with
   *  one crossing there is nothing to be unstable about, and beyond three
   *  the tool would be asserting more than the ordering supports. */
  unstable: boolean;
}

/** Engine markers → ordered, classified steady states.  Non-finite marker
 *  positions are dropped (an unusable annotation, never a fabricated root). */
export function classifySteadyStates(
  markers: readonly ProfileMarker[] | undefined,
): SteadyState[] {
  if (!markers) return [];
  const usable = markers.filter((m) => Number.isFinite(m.x));
  const sorted = [...usable].sort((a, b) => a.x - b.x);
  const three = sorted.length === 3;
  return sorted.map((m, i) => ({
    T: m.x,
    label: m.label,
    reported: m.label.endsWith(REPORTED_SUFFIX),
    order: i,
    unstable: three && i === 1,
  }));
}

/** The state this run REPORTED, as the engine's own label says.  Null when
 *  no marker carries the suffix — an honest absence, never the nearest
 *  guess. */
export function reportedState(states: readonly SteadyState[]): SteadyState | null {
  return states.find((s) => s.reported) ?? null;
}

/** Ignited − extinguished [K]: the difference of the highest and lowest
 *  engine-published root temperatures — how far the reactor jumps when it
 *  lights.  Null unless there are at least two roots (one root is one
 *  branch, and a span of zero would read as a measurement). */
export function ignitionSpan(states: readonly SteadyState[]): number | null {
  if (states.length < 2) return null;
  const lo = states[0]!.T;
  const hi = states[states.length - 1]!.T;
  return Number.isFinite(hi - lo) ? hi - lo : null;
}

// ---- AUTHORIZED view geometry 2: axis helpers -------------------------------

export interface Domain { lo: number; hi: number }

/** Padded [lo, hi] over the finite values of one or more series — display
 *  scaling only.  Null when nothing finite is present; a flat series gets a
 *  symmetric unit band so the polyline still has somewhere to sit. */
export function axisDomain(
  series: readonly (readonly number[])[], padFrac = 0.06,
): Domain | null {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const s of series) {
    for (const v of s) {
      if (!Number.isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  if (hi === lo) return { lo: lo - 0.5, hi: hi + 0.5 };
  const pad = (hi - lo) * padFrac;
  return { lo: lo - pad, hi: hi + pad };
}

/** Piecewise-linear read of a published column at `x`, over the engine's own
 *  ascending x samples.  Used ONLY to place a dot on the drawn curve at a
 *  root the ENGINE found — it never searches for a crossing.  Null outside
 *  the sampled range or on a malformed pair. */
export function interpolateAt(
  xs: readonly number[], ys: readonly number[], x: number,
): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2 || !Number.isFinite(x)) return null;
  const first = xs[0]!;
  const last = xs[n - 1]!;
  if (x < Math.min(first, last) || x > Math.max(first, last)) return null;
  for (let i = 0; i < n - 1; ++i) {
    const a = xs[i]!;
    const b = xs[i + 1]!;
    const inSpan = (a <= x && x <= b) || (b <= x && x <= a);
    if (!inSpan) continue;
    const ya = ys[i]!;
    const yb = ys[i + 1]!;
    if (!Number.isFinite(ya) || !Number.isFinite(yb)) return null;
    if (a === b) return ya;
    return ya + ((yb - ya) * (x - a)) / (b - a);
  }
  return null;
}

// ---- The classroom witness + its knob→dict map ------------------------------
// The STANDALONE feed: the tool clones this bundled tutorial, writes the knob
// values into its DECLARED dict scalars (methodRun's textual override — units
// and comments survive; a knob that misses its dict THROWS), and runs
// choupoSolve in the browser.  Every (file, key) is verified against the REAL
// bundled raw text by the test suite.
//
// Knobs deliberately ABSENT, each with its reason recorded — and the test
// suite pins WHICH KIND of absence each one is, so a reason cannot rot into
// an accident:
//
//   * `thermalMode adiabatic;` — a WORD, not a scalar.  The override grammar
//     replaces the NUMBER of a declared `key value [unit];` and nothing else,
//     so this key does not resolve at all (pinned: zero matches).  Switching
//     the case to `heatExchange` would also require UA and T_coolant keys the
//     witness does not declare — that is authoring new dict content, not
//     turning a declared knob.
//   * `P 101325 Pa;` in 0/feed — declared and perfectly addressable (pinned:
//     it DOES resolve), but the witness runs a liquid-phase rate law whose
//     concentrations come from Vliq: P never reaches the physics, and a knob
//     that does not reach the physics is a placebo control (the Rayleigh
//     "decorative V" precedent).
//   * the Arrhenius `A` and `Ea` in constant/reactions — both addressable
//     (pinned: they DO resolve), deliberately not exposed.  Two reasons: the
//     Van Heerden construction is an OPERATING one (same equipment, same
//     chemistry, a different start-up), and the witness's reaction header
//     states its kinetics are "a teaching variant" whose pre-exponential was
//     "retuned so that k(350 K) is unchanged" — a knob that silently breaks
//     that calibration would leave the tool teaching a case other than the
//     one it names.
//
// One DIFFERENCE from the Levenspiel witnesses, recorded because it looks
// like a contradiction: cstr01 declares `operation { V_R 0.005; }` INLINE on
// one line, out of the line-anchored grammar's reach — cstr05 declares the
// same key on its OWN line inside a multi-line `operation { … }` block, so
// here V_R IS addressable and IS a knob.  The absence over there was never
// about the key; it was about the line.

/** Bundled identifier of the witness ("<category>/<subclass>/<case>" —
 *  steady is a sub-classed category, so the `reactors` segment is part of
 *  it). */
export const VAN_HEERDEN_WITNESS = "steady/reactors/cstr05_multiplicity";

export interface VanHeerdenKnob {
  /** Stable id — the key of the knob-value state bag. */
  id: string;
  /** What the student reads beside the control. */
  label: string;
  /** Witness file the knob writes into (e.g. "0/feed"). */
  file: string;
  /** The dict key as written there. */
  key: string;
  /** The witness's own authored value — the classroom default. */
  def: number;
  min: number;
  max: number;
  step: number;
  /** The unit the dict declares.  The knob writes the NUMBER only; the unit
   *  word in the dict survives untouched.  "" for keys the dict declares
   *  bare (the unit then lives in the label). */
  unit: string;
  /** One line of why this knob is here — shown under the control. */
  why: string;
}

export const VAN_HEERDEN_KNOBS: readonly VanHeerdenKnob[] = [
  // cstr05 declares `T_guess 380;` BARE (the K is implied by the dimension
  // check), so the dict unit is the empty word and the label carries the K.
  { id: "T_guess", label: "T_guess (K) — which branch is reported",
    file: "system/flowsheetDict", key: "T_guess",
    def: 380, min: 280, max: 430, step: 2.5, unit: "",
    why: "the engine reports the root NEAREST this temperature — the same "
      + "equipment and feed, a different answer; watch the reported marker "
      + "jump" },
  { id: "feedT", label: "feed T", file: "0/feed", key: "T",
    def: 300, min: 280, max: 360, step: 1, unit: "K",
    why: "the feed enters cold, where the rate is negligible; raise it and "
      + "the removal line slides along with the whole balance" },
  { id: "ethanol", label: "feed ethanol (limiting)", file: "0/feed",
    key: "ethanol", def: 0.5, min: 0.1, max: 2, step: 0.05, unit: "kmol/h",
    why: "how much chemical energy the feed carries, and how steep the "
      + "removal line is" },
  { id: "aceticAcid", label: "feed acetic acid", file: "0/feed",
    key: "aceticAcid", def: 0.5, min: 0.1, max: 2, step: 0.05, unit: "kmol/h",
    why: "the co-reactant — it dilutes and it carries sensible heat" },
  // `V_R 0.005;` is declared bare too (m³ lives in the dict's comment).
  { id: "V_R", label: "reactor volume V_R (m³)", file: "system/flowsheetDict",
    key: "V_R", def: 0.005, min: 0.001, max: 0.02, step: 0.001, unit: "",
    why: "residence time: it stretches the generation sigmoid against a "
      + "removal line that does not move" },
];

export type VanHeerdenKnobValues = { [id: string]: number };

/** The witness's authored values — the classroom baseline. */
export function defaultKnobValues(): VanHeerdenKnobValues {
  const out: VanHeerdenKnobValues = {};
  for (const k of VAN_HEERDEN_KNOBS) out[k.id] = k.def;
  return out;
}

/** Knob values → methodRun ScalarOverrides.  Non-finite values are dropped
 *  (that knob keeps the witness's authored number) — never written as NaN. */
export function knobOverrides(values: VanHeerdenKnobValues): ScalarOverride[] {
  const out: ScalarOverride[] = [];
  for (const k of VAN_HEERDEN_KNOBS) {
    const v = values[k.id];
    if (v !== undefined && Number.isFinite(v))
      out.push({ file: k.file, key: k.key, value: v });
  }
  return out;
}

// The provenance line, always visible in classroom mode.
const PROVENANCE =
  `Runs tutorials/${VAN_HEERDEN_WITNESS} with your parameters, in your `
  + "browser (choupoSolve WASM).  G, R and phi are the reactor's own "
  + "published profile columns over the engine's steady-state scan grid; "
  + "the crossings are the engine's own markers, never re-detected here.";

// ---- AUTHORIZED view geometry 3: keeping two annotations off each other -----
//
// THE DEFECT THIS EXISTS FOR, from the owner's own screen (1368 px, the
// vanheerden tool): the series legend sits at the frame's top-right, anchored
// to FX1, and a crossing's "405.9 K" label is drawn at the crossing's own x in
// the SAME top band.  When a root lands near the right of the temperature
// domain — which is exactly where the IGNITED state lives, the one the reader
// is looking for — the two are painted over each other.  SVG has no layout
// engine to notice: text is placed where it is told and overlaps in silence.
//
// REPRODUCED AND MEASURED, in Chromium, on this frame's own geometry fed with
// the REAL engine output (native choupoSolve on the witness
// cstr05_multiplicity: T over 275–431.707 K, roots at 300.425 / 345.541 /
// 405.904 K, the third reported).  In a 1021x637 mount at the app's own font:
//
//     OLD   "G(T) — heat generated"  x 778.5  w 156.7
//           "405.9 K — reported"     x 806.0  w 132.3   ->  129.2 px of
//                                                           horizontal overlap
//                                                           over 14 px of rows
//     NEW   the same label at x 661.6, y 77 (below the legend block)
//           ->  0 collisions among all five annotations
//
// The browser measured the text; nothing above is an estimate.  The engine run
// was native because the bundled WASM does not complete this witness in this
// container — see the report accompanying the change.
//
// The rule below is a LAYOUT rule and not a nudge for one string: any label
// whose horizontal extent reaches into the legend's column is pushed BELOW the
// legend block, and any label that would run past the frame's right edge is
// anchored on its other side instead.  Both are decided from the text's own
// estimated width, so a longer label (a longer number, the " — unstable"
// clause) moves too.

/** Advance width of a string at `fontSize`, in viewBox units.
 *
 *  DECLARED AS AN ESTIMATE, because that is what it is: the browser knows the
 *  real advance and nothing outside a layout pass can ask it.  0.52 em per
 *  character is the measured mean for the digits, spaces and Latin letters
 *  these annotations are made of in the UI's sans stack — it errs high on
 *  punctuation, which is the safe direction here (an over-estimated label is
 *  moved out of the way slightly too eagerly; an under-estimated one collides). */
export const CHAR_ADVANCE_EM = 0.52;

export function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * CHAR_ADVANCE_EM * fontSize;
}

export interface AnnotationPlacement {
  x: number;
  y: number;
  anchor: "start" | "end";
}

/** Where a crossing's label goes, given what else is already on the frame.
 *
 *  `xPx` is the crossing's own x in viewBox units, `textPx` its estimated
 *  width, `row` its position in the ladder of alternating rows the tool has
 *  always used (so two adjacent crossings do not stack on one line), and
 *  `legend` the block that must not be written over: its LEFT edge and the y
 *  its last line ends at.
 *
 *  Pure and exported: the whole point of the rule is that it can be checked
 *  without a browser, and the node test runner has no layout engine. */
export function placeCrossingLabel(
  xPx: number, textPx: number, row: number,
  legend: { left: number; bottom: number },
  frame: { right: number; top: number },
): AnnotationPlacement {
  const GAP = 4;
  // Right edge first: a label that would run out of the frame is anchored on
  // the other side of its own line rather than clipped by the viewBox.
  const fitsRight = xPx + GAP + textPx <= frame.right;
  const anchor: "start" | "end" = fitsRight ? "start" : "end";
  const x = fitsRight ? xPx + GAP : xPx - GAP;
  const right = fitsRight ? x + textPx : x;
  const y = frame.top + 14 + (row % 2) * 30;
  // Then the legend's column: an overlap in x means the two would share the
  // band, so this one drops below the legend's last line.
  const clearsLegend = right <= legend.left;
  return { x, y: clearsLegend ? y : Math.max(y, legend.bottom + 13), anchor };
}

// ---- Display formatting -----------------------------------------------------

function fmt(v: number | null | undefined, d = 5): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toPrecision(d) : "—";
}
const fmtTick = (v: number) => String(Number(v.toPrecision(4)));

// ---- Chart frame (viewBox units, the sibling tools' conventions) ------------

const FW = 640, FH = 420;
const FX0 = 70, FX1 = 606, FY0 = 16, FY1 = 372;

const GRID = "var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";
const G_COLOR = "#ffb74d";          // warm — heat GENERATED (the sigmoid)
const R_COLOR = "#26c6da";          // cool — heat REMOVED (the line)
const PHI_COLOR = "#ff8a65";        // the engine's residual, phi = R − G
const REPORTED_COLOR = "#66bb6a";   // the branch this run reports
const UNSTABLE_COLOR = "#ef5350";   // the middle crossing of three
const GUESS_COLOR = "var(--mantine-color-dimmed)";

interface ChartInput {
  T: readonly number[];
  G: readonly number[];
  R: readonly number[];
  phi: readonly number[] | null;
  states: readonly SteadyState[];
  /** The engine's own T_guess KPI — the tick that explains WHICH root the
   *  run reported.  Null when the run published none. */
  T_guess: number | null;
  showPhi: boolean;
  /** A newer classroom run is in flight: keep the last chart visible and
   *  overlay a loader — never a blank. */
  busyOverlay: boolean;
}

/** The legend's own wording, in ONE place: it is both drawn and MEASURED (the
 *  block a crossing label must keep clear is as wide as its widest line), and
 *  two copies of a string would let the drawing and the measurement disagree. */
const LEGEND_TEXT = {
  G: "G(T) — heat generated",
  R: "R(T) — heat removed",
  phi: "phi = R − G (engine residual)",
} as const;

/** The legend's three baselines, top-right of the frame. */
const LEGEND_ROWS = [FY0 + 16, FY0 + 31, FY0 + 46] as const;

function VanHeerdenSvg(
  { T, G, R, phi, states, T_guess, showPhi, busyOverlay }: ChartInput,
): JSX.Element {
  /* The block the crossing labels must not be written over.  It is anchored to
   * the frame's right edge, so its LEFT edge is that minus its widest line; its
   * bottom is the last baseline actually drawn, which is the phi row only when
   * phi is on — turning the residual off gives the labels a row back. */
  const legendLines = showPhi && phi
    ? [LEGEND_TEXT.G, LEGEND_TEXT.R, LEGEND_TEXT.phi]
    : [LEGEND_TEXT.G, LEGEND_TEXT.R];
  const legendBlock = {
    left: FX1 - 6 - Math.max(...legendLines.map((t) => estimateTextWidth(t, 10))),
    bottom: LEGEND_ROWS[legendLines.length - 1]!,
  };

  const xDom = axisDomain([T], 0.02) ?? { lo: 0, hi: 1 };
  const yDom = axisDomain(
    showPhi && phi ? [G, R, phi] : [G, R], 0.08) ?? { lo: 0, hi: 1 };

  const toX = (x: number) =>
    FX0 + ((FX1 - FX0) * (x - xDom.lo)) / (xDom.hi - xDom.lo || 1);
  const toY = (y: number) =>
    FY1 - ((FY1 - FY0) * (y - yDom.lo)) / (yDom.hi - yDom.lo || 1);

  const ticks = (d: Domain) =>
    [0, 0.25, 0.5, 0.75, 1].map((f) => d.lo + f * (d.hi - d.lo));
  const xTicks = ticks(xDom);
  const yTicks = ticks(yDom);

  const line = (ys: readonly number[]) => {
    const pts: string[] = [];
    for (let i = 0; i < Math.min(T.length, ys.length); ++i) {
      const x = T[i]!, y = ys[i]!;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      pts.push(`${toX(x).toFixed(2)},${toY(y).toFixed(2)}`);
    }
    return pts.join(" ");
  };

  const zeroInView = yDom.lo <= 0 && 0 <= yDom.hi;

  /* A fixed height, because the page SCROLLS: inside a scrolling column there
   * is no flex parent to stretch against, and an `svg` at height 100 % of an
   * auto-height box collapses to nothing. */
  return (
    <Box style={{ position: "relative", width: "100%", height: 460 }}>
      {busyOverlay && (
        <Box style={{ position: "absolute", inset: 0, display: "flex",
          alignItems: "center", justifyContent: "center", zIndex: 1,
          background: "light-dark(rgba(255,255,255,0.5), rgba(0,0,0,0.35))" }}>
          <Loader size="sm" />
        </Box>
      )}
      <svg viewBox={`0 0 ${FW} ${FH}`} width="100%" height="100%"
        preserveAspectRatio="xMidYMid meet" role="img"
        aria-label="Van Heerden diagram: heat generated and heat removed
          versus reactor temperature, with the engine's steady-state
          crossings marked">
        {/* grid + axes */}
        {xTicks.map((t) => (
          <g key={`gx${t}`}>
            <line x1={toX(t)} y1={FY0} x2={toX(t)} y2={FY1}
              stroke={GRID} strokeWidth={0.6} />
            <text x={toX(t)} y={FY1 + 16} textAnchor="middle"
              fontSize={11} fill={INK}>{fmtTick(t)}</text>
          </g>
        ))}
        {yTicks.map((t) => (
          <g key={`gy${t}`}>
            <line x1={FX0} y1={toY(t)} x2={FX1} y2={toY(t)}
              stroke={GRID} strokeWidth={0.6} />
            <text x={FX0 - 6} y={toY(t) + 4} textAnchor="end"
              fontSize={11} fill={INK}>{fmtTick(t)}</text>
          </g>
        ))}
        <text x={(FX0 + FX1) / 2} y={FH - 6} textAnchor="middle"
          fontSize={12} fill={INK}>reactor temperature T (K)</text>
        <text x={14} y={(FY0 + FY1) / 2} textAnchor="middle" fontSize={12}
          fill={INK} transform={`rotate(-90 14 ${(FY0 + FY1) / 2})`}>
          heat rate (kW)
        </text>

        {/* the zero line — where phi crosses it, the reactor can sit */}
        {zeroInView && (
          <line x1={FX0} y1={toY(0)} x2={FX1} y2={toY(0)}
            stroke={INK} strokeWidth={1} strokeDasharray="2 4" />
        )}

        {/* the engine's residual, phi = R − G (secondary trace) */}
        {showPhi && phi && (
          <>
            <polyline points={line(phi)} fill="none" stroke={PHI_COLOR}
              strokeWidth={1.4} strokeDasharray="5 3" />
            <text x={FX1 - 6} y={LEGEND_ROWS[2]} textAnchor="end" fontSize={10}
              fill={PHI_COLOR}>{LEGEND_TEXT.phi}</text>
          </>
        )}

        {/* the two curves the construction IS */}
        <polyline points={line(R)} fill="none" stroke={R_COLOR}
          strokeWidth={2} />
        <polyline points={line(G)} fill="none" stroke={G_COLOR}
          strokeWidth={2} />
        <text x={FX1 - 6} y={LEGEND_ROWS[0]} textAnchor="end" fontSize={10}
          fill={G_COLOR}>{LEGEND_TEXT.G}</text>
        <text x={FX1 - 6} y={LEGEND_ROWS[1]} textAnchor="end" fontSize={10}
          fill={R_COLOR}>{LEGEND_TEXT.R}</text>

        {/* T_guess: the engine's own KPI, and the whole reason ONE of the
            crossings below is the reported one */}
        {T_guess !== null && T_guess >= xDom.lo && T_guess <= xDom.hi && (
          <g>
            <line x1={toX(T_guess)} y1={FY1 - 26} x2={toX(T_guess)} y2={FY1}
              stroke={GUESS_COLOR} strokeWidth={1.2} strokeDasharray="2 2" />
            <text x={toX(T_guess)} y={FY1 - 30} textAnchor="middle"
              fontSize={10} fill={INK}>
              T_guess {fmtTick(T_guess)} K
            </text>
          </g>
        )}

        {/* the crossings — the ENGINE's markers, verbatim.  Their labels are
            PLACED (placeCrossingLabel): out of the legend's column and inside
            the frame, both decided from the label's own estimated width. */}
        {states.map((s, i) => {
          const color = s.reported
            ? REPORTED_COLOR : s.unstable ? UNSTABLE_COLOR : INK;
          const gy = interpolateAt(T, G, s.T);
          const text = `${fmtTick(s.T)} K`
            + (s.reported ? " — reported" : "")
            + (s.unstable ? " — unstable" : "");
          const spot = placeCrossingLabel(
            toX(s.T), estimateTextWidth(text, 10), i, legendBlock,
            { right: FX1, top: FY0 });
          return (
            <g key={`ss${i}`}>
              <line x1={toX(s.T)} y1={FY0} x2={toX(s.T)} y2={FY1}
                stroke={color} strokeWidth={s.reported ? 2 : 1.2}
                strokeDasharray={s.reported ? undefined : "4 3"} />
              {gy !== null && (
                <circle cx={toX(s.T)} cy={toY(gy)} r={s.reported ? 5 : 3.5}
                  fill={s.reported ? color : "none"} stroke={color}
                  strokeWidth={1.6} />
              )}
              <text x={spot.x} y={spot.y} textAnchor={spot.anchor}
                fontSize={10} fill={color}>
                {text}
              </text>
              {s.unstable && (
                <text x={spot.x} y={spot.y + 12} textAnchor={spot.anchor}
                  fontSize={9} fill={color}>
                  no start-up procedure can hold it
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </Box>
  );
}

// ---- The tool ---------------------------------------------------------------

export function VanHeerdenTool(): JSX.Element {
  const appResult = useStore((s) => s.runResult);

  // Source: the self-fed classroom witness (DEFAULT) vs the app's current
  // run.  The toggle appears only once the current run carries a servable
  // CSTR profile, and stays while the user is on it so they can come back.
  const appFeed = useMemo(
    () => findVanHeerdenFeeds(appResult?.profiles, appResult?.kpis)[0] ?? null,
    [appResult]);
  const [source, setSource] = useState<"classroom" | "current">("classroom");
  const src: "classroom" | "current" =
    appFeed !== null && source === "current" ? "current" : "classroom";
  const showToggle = appFeed !== null || source === "current";

  // The classroom knobs (defaults = the witness's authored values) + the
  // persisted fold.
  const [knobs, setKnobs] = useState<VanHeerdenKnobValues>(defaultKnobValues);
  const setKnob = useCallback((id: string, v: number) => {
    setKnobs((s) => ({ ...s, [id]: v }));
  }, []);
  const knobsKey = useMemo(() => JSON.stringify(knobs), [knobs]);
  const overrides = useMemo(() => knobOverrides(knobs), [knobs]);
  const [showPhi, setShowPhi] = useState(false);

  const run = useMethodRun(
    src === "classroom" ? VAN_HEERDEN_WITNESS : null,
    overrides, knobsKey, "choupoSolve");
  const busy = run.busy;

  const feed = useMemo(
    () => (src === "current"
      ? appFeed
      : findVanHeerdenFeeds(run.result?.profiles, run.result?.kpis)[0] ?? null),
    [src, appFeed, run.result]);

  const view = useMemo(() => {
    if (!feed) return null;
    const T = feed.profile.columns[feed.profile.xAxis];
    const G = feed.profile.columns[G_COLUMN];
    const R = feed.profile.columns[R_COLUMN];
    if (!T || !G || !R) return null;
    const phi = feed.profile.columns[PHI_COLUMN] ?? null;
    const states = classifySteadyStates(feed.profile.markers);
    return {
      unit: feed.unit, kpis: feed.kpis, T, G, R,
      phi: phi && phi.length === T.length ? phi : null,
      states,
      reported: reportedState(states),
      span: ignitionSpan(states),
    };
  }, [feed]);

  // The engine's own count, beside the markers it drew.  They come from the
  // same solve and must agree; when they do not, the tool SAYS so rather
  // than choosing one (a diagram that quietly outvoted the KPI would be the
  // silence the witness argues against).
  const kpiCount = view?.kpis?.["steadyStates"];
  const countsDisagree =
    typeof kpiCount === "number" && Number.isFinite(kpiCount)
    && view !== null && view.states.length > 0
    && Math.round(kpiCount) !== view.states.length;

  const sourceToggle = showToggle ? (
    <SegmentedControl size="xs" value={src} fullWidth
      onChange={(v) => setSource(v === "current" ? "current" : "classroom")}
      data={[
        { label: "Classroom", value: "classroom" },
        { label: "Current run", value: "current" },
      ]} />
  ) : null;

  /* The controls: the source, the option, the knobs, the provenance.  A LIST
     and nothing about where it sits — the page puts it in the column beside
     the diagram. */
  const controls = (
    <>
      {sourceToggle}
      <Switch size="xs" checked={showPhi} label="phi = R − G"
        onChange={(e) => setShowPhi(e.currentTarget.checked)} />
      {src === "classroom" && (
        <>
          {busy && (
            <Group gap={6} wrap="nowrap" align="center">
              <Loader size="xs" />
              <Text size="xs" c="dimmed">
                re-solving the reactor — seconds, not instant
              </Text>
            </Group>
          )}
          {VAN_HEERDEN_KNOBS.map((k) => (
            <KnobSlider key={k.id} knob={k} value={knobs[k.id] ?? k.def}
              onChange={(v) => setKnob(k.id, v)} />
          ))}
          <PanelNote>{PROVENANCE}</PanelNote>
        </>
      )}
    </>
  );

  // The engine's message, verbatim — never rephrased, never swallowed.
  const alerts = src === "classroom" && run.err !== null ? (
    <Alert color="red" variant="light" m={12}
      title="The run refused or failed — the engine's message, verbatim">
      <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
        {run.err}
      </Text>
    </Alert>
  ) : null;

  /*  ONE renderer for the lesson, above BOTH returns.  A tool that carried its
   *  explanation only in the branch that HAD a diagram would lose it exactly
   *  when there was nothing to explain, and this construction's argument is
   *  worth reading whether or not a curve arrived. */
  const lessonStep = (n: number) => {
    const st = VAN_HEERDEN_STEPS.find((x) => x.n === n);
    if (!st) return null;
    return (
      <Box key={n}>
        <Title order={5}>{st.n} · {st.title}</Title>
        <Text size="sm" mt={4}>{st.body}</Text>
        {st.formula && (
          <Box my={8} px="sm" py={6}
            style={{ border: "1px solid var(--mantine-color-default-border)",
              borderRadius: 4 }}>
            <Text size="sm" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
              {st.formula}
            </Text>
          </Box>
        )}
        {st.note && <Text size="sm" c="dimmed">{st.note}</Text>}
      </Box>
    );
  };

  const lessonHead = (
    <Box>
      <Title order={3}>
        Ignition and extinction: the answers a reactor can actually hold
      </Title>
      <Text size="sm" c="dimmed" mt={4}>
        The same equipment and the same feed can have three steady states — one
        of which no start-up procedure can hold, and two which stop existing
        altogether if you push a parameter far enough.
      </Text>
    </Box>
  );

  const lessonLimits = (
    <Box>
      <Title order={5}>What this does not model</Title>
      <Box mt={4} style={{ display: "grid", columnGap: 16, rowGap: 6,
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        {VAN_HEERDEN_LIMITS.map((l) => (
          <Text key={l.id} size="xs" c="dimmed">
            <b>{l.title}</b> {l.body}
          </Text>
        ))}
      </Box>
    </Box>
  );

  if (view === null) {
    return (
      <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
        <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
          {lessonHead}
          {alerts}
          {[1, 2, 3, 4, 5].map(lessonStep)}
          <Box style={{ display: "grid", gap: 14,
            gridTemplateColumns: "minmax(200px, 240px) 1fr" }}>
            <Stack gap={8}>{controls}</Stack>
            <Box style={{ minWidth: 0, display: "flex", alignItems: "center",
              justifyContent: "center", padding: 12 }}>
              {src === "classroom" && run.err === null
                && (busy || run.result === null) ? (
                  <Group gap="sm" wrap="nowrap" align="center">
                    <Loader size="sm" />
                    <Text size="sm" c="dimmed">
                      the engine is scanning the energy balance — seconds, not
                      instant
                    </Text>
                  </Group>
                ) : (
                  <Text size="sm" c="dimmed" ta="center" maw={520}>
                    {src === "classroom"
                      ? "The classroom run finished but published no Van "
                        + "Heerden surface"
                      : "This run publishes no Van Heerden surface"}
                    {" "}— the diagram activates when a solved unit publishes a
                    profile carrying both <b>{G_COLUMN}</b> and <b>{R_COLUMN}</b>
                    {" "}columns, which is what a NON-ISOTHERMAL{" "}
                    <code>cstr</code> emits over its steady-state scan.  An
                    isothermal CSTR has no such scan and no such profile — run{" "}
                    <code>tutorials/{VAN_HEERDEN_WITNESS}</code> and return
                    here.
                  </Text>
                )}
            </Box>
          </Box>
          {lessonLimits}
        </Stack>
      </Box>
    );
  }

  const T_out = view.kpis?.["T_out"];
  const dT_rise = view.kpis?.["dT_rise"];
  const T_guess = view.kpis?.["T_guess"];

  const chips = (
      /* Chips: what each one claims, and on whose number. */
      <Group gap="sm" wrap="wrap" align="center"
        style={{ flexShrink: 0 }}>
        <Tooltip withArrow multiline w={430}
          label={"The engine's own KPI `steadyStates` — how many roots its "
            + "scan of phi(T) = 0 bisected, over the bracket it announces in "
            + "the log.  The diagram's vertical lines are the matching "
            + "`markers`, from the same solve.  Three means the removal line "
            + "cuts the generation sigmoid three times; one means it does "
            + "not."}>
          <Badge variant="light" color="grape" tt="none"
            styles={{ root: { cursor: "help" } }}>
            {typeof kpiCount === "number"
              ? `${Math.round(kpiCount)} steady state`
                + `${Math.round(kpiCount) === 1 ? "" : "s"} (engine KPI)`
              : `${view.states.length} crossing`
                + `${view.states.length === 1 ? "" : "s"} marked (no KPI)`}
          </Badge>
        </Tooltip>

        <Tooltip withArrow multiline w={430}
          label={"The branch this run REPORTS, from the KPIs T_out and "
            + "dT_rise — the root nearest T_guess"
            + (typeof T_guess === "number" ? ` = ${fmt(T_guess, 5)} K` : "")
            + ".  dT_rise is the engine's own T_out − T_feed.  Move T_guess "
            + "and this chip follows the reported marker onto another "
            + "branch: the same equipment, the same feed, a different "
            + "answer."}>
          <Badge variant="light" color="teal" tt="none"
            styles={{ root: { cursor: "help" } }}>
            reported T_out = {fmt(T_out)} K
            {typeof dT_rise === "number" && Number.isFinite(dT_rise)
              ? ` (dT_rise = ${dT_rise >= 0 ? "+" : ""}${fmt(dT_rise)} K)`
              : ""}
          </Badge>
        </Tooltip>

        {view.states.length === 3 && view.span !== null && (
          <Tooltip withArrow multiline w={450}
            label={"Ignited minus extinguished: the difference of the "
              + "highest and lowest root temperatures the ENGINE published "
              + "as markers — arithmetic on two of its numbers, no model of "
              + "its own.  This is the practical meaning of multiplicity: "
              + "the jump the reactor makes when it lights, and the drop it "
              + "makes when it goes out.  The middle crossing between them "
              + "is a steady state no start-up procedure can hold."}>
            <Badge variant="light" color="orange" tt="none"
              styles={{ root: { cursor: "help" } }}>
              ignited − extinguished = {fmt(view.span)} K
              {" "}({fmt(view.states[2]!.T)} K vs {fmt(view.states[0]!.T)} K)
            </Badge>
          </Tooltip>
        )}

        {countsDisagree && (
          <Text size="xs" c="red">
            the KPI says {Math.round(kpiCount as number)} steady states while
            the profile carries {view.states.length} markers — reported, not
            reconciled here.
          </Text>
        )}
      </Group>
  );

  const provenance = (
      /* What this file computes, it declares (the standing Methods rule). */
      <Box style={{ flexShrink: 0 }}>
        <Text size="xs" c="dimmed">
          G(T), R(T) and phi(T) are the reactor&apos;s published profile
          columns {G_COLUMN} / {R_COLUMN} / {PHI_COLUMN} on the engine&apos;s
          own scan grid, and phi = R − G is an identity there, not a second
          model.  The crossings are the engine&apos;s {view.states.length}
          {" "}markers, verbatim; this file only ORDERS them by temperature,
          reads the &quot;(reported)&quot; suffix off the label the engine
          wrote, and — with exactly three — marks the middle one.  Nothing
          here re-detects a root or judges a branch&apos;s stability.
        </Text>
        {view.states.length !== 3 && view.states.length > 0 && (
          <Text size="xs" c="dimmed">
            {view.states.length === 1
              ? "One crossing: a single steady state, and no unstable state "
                + "to claim — this reactor has no ignition to talk about at "
                + "these settings."
              : `${view.states.length} crossings: the middle-of-three rule `
                + "does not apply, so no state is labelled unstable here."}
          </Text>
        )}
      </Box>
  );

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
        {lessonHead}
        {alerts}

        {lessonStep(1)}
        {lessonStep(2)}
        {lessonStep(3)}

        <Box>
          <Title order={5}>Now read the diagram the engine scanned</Title>
          <Text size="sm" mt={4}>
            Below are the two curves, drawn from the reactor&apos;s own
            published columns, with a vertical line at every root the engine
            bisected.  Read the slopes where they cross: at the outer
            crossings the removal line is the steeper of the two, and at the
            middle one it is not.  Then move <code>T_guess</code> and watch
            which crossing the run REPORTS change without the diagram moving
            at all — same equipment, same feed, a different answer, decided by
            where you started.
          </Text>
        </Box>

        {chips}

        <Box style={{ display: "grid", gap: 14,
          gridTemplateColumns: "minmax(200px, 240px) 1fr" }}>
          <Stack gap={8}>{controls}</Stack>
          <Stack gap={8} style={{ minWidth: 0 }}>
            <VanHeerdenSvg
              T={view.T} G={view.G} R={view.R} phi={view.phi}
              states={view.states} showPhi={showPhi}
              T_guess={typeof T_guess === "number" && Number.isFinite(T_guess)
                ? T_guess : null}
              busyOverlay={src === "classroom" && busy} />
            {provenance}
          </Stack>
        </Box>

        {lessonStep(4)}
        {lessonStep(5)}

        {lessonLimits}
      </Stack>
    </Box>
  );
}
