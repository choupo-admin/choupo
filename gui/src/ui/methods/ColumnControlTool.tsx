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
  ColumnControlTool — the first EduTool of the SELECTION kind: it does not
  construct an answer from a diagram and it does not show what a substance is.
  It helps a reader CHOOSE a control structure for a distillation column among
  the several defensible ways of doing it, which is the difficulty the owner
  reported and the thing his students cannot do.

  THE QUESTION IS PLACEMENT, NOT DYNAMICS (heuristics-as-a-third-kind 3a).
  Where the level, flow and pressure measurements sit, which streams carry
  control valves, and above all WHICH TRAY the temperature is measured on —
  none of that needs a transient.  It needs a cross-section with the instruments
  on it, which is exactly what a P&ID is, drawn over a steady column.

  THE PAGE IS A LESSON, and it scrolls.  The degrees-of-freedom count, the
  naming convention it produces and the reason the pairing is the whole
  question come BEFORE the interactive; what the tray criteria found and what
  the choice actually depends on come AFTER it.  That prose lives in
  columnControlLesson.ts as DATA, so a test can assert the argument still runs
  end to end — prose is the part of a tool that rots with nothing failing.  It
  states a count and a convention and no rule of thumb; every rule of thumb on
  this screen is a cited record (below).

  THREE SURFACES, ONE SELECTION.

    * THE CROSS-SECTION.  The column drawn in section with its condenser,
      reflux drum, reboiler and sump; every valve and every instrument bubble
      placed, and a dashed signal line from each measurement to the valve it
      drives.  Switching the structure MOVES those lines — that is the lesson,
      and it is why the drawing is the heart of this tool rather than an
      illustration beside it.
    * THE TRAY DIAGNOSTIC.  The two classical criteria for the sensor tray,
      computed on the reader's own column from the engine's own stage
      temperatures: the steepest step in the profile, and the largest response
      to the manipulated variable.  The second costs a SECOND SOLVE, which is
      the whole reason this belongs in a simulator.
    * THE CITED HEURISTICS.  What each authority says about the structure on
      screen, with the disagreements SHOWN and never resolved by a weighting
      nobody published.

  ZERO HEURISTICS IN TYPESCRIPT, the standing "zero physics in TS" rule applied
  to guidance.  Every sentence rendered here is a record under
  data/standards/heuristics/, read by columnControlRecords.ts; the wiring of
  each structure is a record too, so the drawing cannot say something the
  catalogue does not.  What lives in this file is VIEW GEOMETRY (where a bubble
  sits) and ARITHMETIC ON ENGINE OUTPUT (a difference of two published stage
  temperatures, and a difference between two runs) — each labelled where it
  happens.

  WHAT THIS TOOL DOES NOT DO, said here rather than discovered later:

    * IT DOES NOT ANIMATE A LEVEL.  A level that moves is an accumulation term
      and needs a dynamic column; the engine has none — choupoCtrl's dynamic
      tier is DynamicCSTR and the Williams-Otto plant, and no column anywhere in
      the corpus is under control.  A fabricated transient would be exactly the
      falsely-sourced failure one layer up: a moving picture teaches a specific
      wrong thing with confidence.
    * IT DOES NOT COMPUTE A RELATIVE GAIN.  The heuristics quoted here argue
      about relative gains and Choupo publishes no gain matrix.  The records say
      so; so does the footnote.
    * IT DOES NOT RECOMMEND A STRUCTURE.  A recommendation engine that scores
      structures is rejected in the ruling 7: a weighting nobody published,
      presented as a verdict, is the worst possible artefact for a reader who
      cannot yet judge it.
\*---------------------------------------------------------------------------*/

import { useCallback, useMemo, useState } from "react";
import { lessonStepper } from "./lessonStep.js";
import {
  Alert, Badge, Box, Group, Loader, ScrollArea, SegmentedControl, Stack, Text,
  Title, Tooltip,
} from "@mantine/core";

import type { UnitProfile } from "../../adapters/SolverAdapter.js";
import { useMethodRun, type ScalarOverride } from "../../case/methodRun.js";
import { useStore } from "../../state/store.js";
import { KnobSlider, PanelNote } from "./knobPanel.js";
import {
  COLUMN_CONTROL_LIMITS, COLUMN_CONTROL_STEPS,
} from "./columnControlLesson.js";
import {
  conflictPairs, heuristicsForStructure, heuristicsForTopic,
  readHeuristicsCatalogue, stanceOn,
  type ControlLoop, type ControlStructure, type Heuristic,
} from "./columnControlRecords.js";

// ---- The engine surface this tool reads -------------------------------------
// The COLUMN PAIR is the contract, never a unit or a case name: a distillation
// column publishes a per-stage profile whose xAxis is `stage` and which carries
// a `T` column.  Nothing else in the corpus publishes that pair, and a unit
// that does is servable whatever it is called.

/** The profile's stage axis (its own `xAxis`). */
export const STAGE_COLUMN = "stage";
/** Stage temperature [K] — the one column both criteria are read from. */
export const T_COLUMN = "T";

export type KpiRow = { [key: string]: number };
export type KpiMap = { [unitName: string]: KpiRow };

export interface ColumnFeed {
  unit: string;
  profile: UnitProfile;
  kpis?: KpiRow;
}

/** Profiles carrying a stage axis and a temperature column, at least four
 *  stages long (a condenser, a reboiler and two trays is the smallest thing
 *  the tray question can be asked of).  Sorted by unit name. */
export function findColumnFeeds(
  profiles: UnitProfile[] | undefined, kpis: KpiMap | undefined,
): ColumnFeed[] {
  if (!profiles) return [];
  const out: ColumnFeed[] = [];
  for (const p of profiles) {
    if (p.xAxis !== STAGE_COLUMN) continue;
    const T = p.columns[T_COLUMN];
    const stage = p.columns[STAGE_COLUMN];
    if (!T || !stage || T.length !== stage.length || T.length < 4) continue;
    const row = kpis?.[p.unit];
    out.push(row ? { unit: p.unit, profile: p, kpis: row }
      : { unit: p.unit, profile: p });
  }
  return out.sort((a, b) => a.unit.localeCompare(b.unit));
}

// ---- AUTHORIZED arithmetic on engine output: the two criteria ---------------
//
// Neither of these solves anything.  The first is a DIFFERENCE between two
// published stage temperatures; the second is a difference between two ENGINE
// RUNS, divided by the change that separates them.  The physics is the
// engine's, twice.
//
// THE CANDIDATE SET, and it is a modelling statement rather than a convenience.
// Choupo's column numbers stage 1 as the CONDENSER and stage N as the REBOILER
// (T_top and T_bottom are the first and last entries of the profile), so
// neither is a tray and neither can carry a tray thermocouple.  The candidates
// are therefore stages 2 .. N-1, and the slope, which reads a PAIR, is offered
// only where both members are candidates.

export interface StageMetric {
  /** 1-based stage number, as the engine numbers it. */
  stage: number;
  /** The criterion's value at that stage (K/stage, or K per 1 % of handle). */
  value: number;
}

/** The lowest and highest stage a tray thermocouple could sit on. */
export function trayRange(nStages: number): { lo: number; hi: number } {
  return { lo: 2, hi: Math.max(2, nStages - 1) };
}

/** THE SLOPE CRITERION, in the source's own form: the temperature difference
 *  between ADJACENT trays, T(n+1) − T(n), attributed to the LOWER stage n of
 *  the pair.  Never a central or smoothed difference: a smoothing convention
 *  would be a second definition of somebody else's criterion, and the tool
 *  would then be reporting its own rule under his name.
 *
 *  Returned only for pairs whose BOTH members are trays. */
export function slopeMetric(T: readonly number[]): StageMetric[] {
  const n = T.length;
  const { lo, hi } = trayRange(n);
  const out: StageMetric[] = [];
  for (let s = lo; s <= hi - 1; ++s) {
    const a = T[s - 1], b = T[s];
    if (a === undefined || b === undefined) continue;
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    out.push({ stage: s, value: Math.abs(b - a) });
  }
  return out;
}

/** THE SENSITIVITY CRITERION: the stage temperature's change between the base
 *  run and a run with the manipulated variable moved, divided by the RELATIVE
 *  size of that move and expressed per 1 %.
 *
 *  Signed on purpose.  The magnitude is what the criterion ranks, but the SIGN
 *  is where the trap lives: a column's temperature response changes sign
 *  somewhere between the two ends, and a sensor placed at the crossing has
 *  almost no gain however steep the profile looks there. */
export function sensitivityMetric(
  base: readonly number[], perturbed: readonly number[], relStep: number,
): StageMetric[] {
  const n = Math.min(base.length, perturbed.length);
  if (n < 4 || !Number.isFinite(relStep) || relStep === 0) return [];
  const { lo, hi } = trayRange(n);
  const out: StageMetric[] = [];
  for (let s = lo; s <= hi; ++s) {
    const a = base[s - 1], b = perturbed[s - 1];
    if (a === undefined || b === undefined) continue;
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    out.push({ stage: s, value: (b - a) / (relStep * 100) });
  }
  return out;
}

/** WHICH STREAM LEAVING THE REFLUX DRUM IS THE LARGER ONE, from the column's
 *  own KPIs (`L_rect` and `D`, in the engine's units — only their RATIO is
 *  used, so the units cancel).
 *
 *  This is the one heuristic in the catalogue that has a number on this screen:
 *  the guide says to hold a level with the larger stream leaving that drum, and
 *  the engine already publishes both streams.  It answers WHICH IS LARGER and
 *  stops there — the rule ships no threshold (NOT-SHIPPED.md 1), so the tool
 *  must not manufacture one by declaring a ratio "large".
 *
 *  Null when either KPI is missing or non-positive: a comparison of two numbers
 *  one of which is absent is not a comparison. */
export function drumStreams(
  kpis: KpiRow | undefined,
): { L: number; D: number; ratio: number; larger: "reflux" | "distillate" } | null {
  const L = kpis?.["L_rect"], D = kpis?.["D"];
  if (typeof L !== "number" || typeof D !== "number") return null;
  if (!Number.isFinite(L) || !Number.isFinite(D) || L <= 0 || D <= 0)
    return null;
  return { L, D, ratio: L / D, larger: L > D ? "reflux" : "distillate" };
}

/** The stage a criterion selects: the largest |value|.  Null on an empty set —
 *  an honest absence, never stage 1 by default. */
export function pickStage(metrics: readonly StageMetric[]): StageMetric | null {
  let best: StageMetric | null = null;
  for (const m of metrics) {
    if (!Number.isFinite(m.value)) continue;
    if (best === null || Math.abs(m.value) > Math.abs(best.value)) best = m;
  }
  return best;
}

/** Where the signed sensitivity crosses zero: the pair of stages it changes
 *  sign between.  A sensor there is nearly deaf to the handle, which is the one
 *  thing the slope criterion cannot warn about.  Empty when the response keeps
 *  one sign across the column. */
export function signChanges(
  metrics: readonly StageMetric[],
): { below: number; above: number }[] {
  const out: { below: number; above: number }[] = [];
  for (let i = 0; i + 1 < metrics.length; ++i) {
    const a = metrics[i]!, b = metrics[i + 1]!;
    if (!Number.isFinite(a.value) || !Number.isFinite(b.value)) continue;
    if ((a.value < 0 && b.value > 0) || (a.value > 0 && b.value < 0))
      out.push({ below: a.stage, above: b.stage });
  }
  return out;
}

// ---- The classroom witness and its handles ----------------------------------
// The DEFAULT source is STANDALONE: the tool runs the engine itself, in the
// browser, on a bundled tutorial, exactly as the eleven sibling tools do.  The
// witness is the RIGOROUS MESH column (`model simultaneous`) rather than the
// bubble-point one, because the tray question is asked of the temperature
// profile and the rigorous method is the one documented to resolve it; it is
// also fifteen stages and solves in milliseconds, so two solves per knob turn
// stay interactive.

/** Bundled identifier of the witness. */
export const COLUMN_CONTROL_WITNESS = "steady/distillation/column02_simultaneous";

/** The witness's own authored values — every one of them verified against the
 *  bundled raw text by the test suite, because a knob that misses its dict runs
 *  the engine on the wrong question. */
export const WITNESS_REFLUX_RATIO = 2.0;
export const WITNESS_DISTILLATE_RATE = 50.0;
export const WITNESS_FEED_STAGE = 8;

export interface ColumnKnob {
  id: string;
  label: string;
  file: string;
  key: string;
  def: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  why: string;
}

export const COLUMN_CONTROL_KNOBS: readonly ColumnKnob[] = [
  { id: "refluxRatio", label: "reflux ratio R = L/D",
    file: "system/flowsheetDict", key: "refluxRatio",
    def: WITNESS_REFLUX_RATIO, min: 1.1, max: 6, step: 0.1, unit: "",
    why: "the reflux ratio decides which stream leaving the reflux drum is the "
      + "larger one, which is the heuristic that decides LV against DV — and it "
      + "moves the temperature profile the tray criteria are read from" },
  { id: "distillateRate", label: "distillate rate D",
    file: "system/flowsheetDict", key: "distillateRate",
    def: WITNESS_DISTILLATE_RATE, min: 20, max: 80, step: 1, unit: "kmol/h",
    why: "the material-balance handle: it sets the split before any loop is "
      + "closed, and it is the second of the two handles the sensitivity "
      + "criterion can be asked about" },
  { id: "feedStage", label: "feed stage", file: "system/flowsheetDict",
    key: "feedStage", def: WITNESS_FEED_STAGE, min: 3, max: 13, step: 1,
    unit: "",
    why: "the feed is where the profile bends; moving it moves the steep "
      + "region and therefore the tray the slope criterion picks" },
];

export type ColumnKnobValues = { [id: string]: number };

export function defaultKnobValues(): ColumnKnobValues {
  const out: ColumnKnobValues = {};
  for (const k of COLUMN_CONTROL_KNOBS) out[k.id] = k.def;
  return out;
}

export function baseOverrides(values: ColumnKnobValues): ScalarOverride[] {
  const out: ScalarOverride[] = [];
  for (const k of COLUMN_CONTROL_KNOBS) {
    const v = values[k.id];
    if (v !== undefined && Number.isFinite(v))
      out.push({ file: k.file, key: k.key, value: v });
  }
  return out;
}

/** The two handles the witness's declared specification actually exposes.
 *
 *  A Choupo column is specified by (R, D), so those two moves span the plane —
 *  but only ONE of them is a textbook manipulated variable on its own, and the
 *  tool says which.  `reflux` raises R with D held, which moves the REFLUX L
 *  alone.  `distillate` raises D and lowers R together so that L = R·D is
 *  unchanged, which moves the DISTILLATE alone; without that compensation,
 *  "changing D" at a fixed RATIO would move both streams and the sensitivity
 *  would belong to no handle at all. */
export type Handle = "reflux" | "distillate";

/** The perturbed run's overrides: the base knobs with ONE handle moved by
 *  `relStep` (a fraction, e.g. 0.01 for 1 %).
 *
 *  This is case AUTHORING, not physics: it writes two declared dict scalars so
 *  that the engine is asked a second, precisely-stated question.  The identity
 *  L = R·D that the `distillate` branch preserves is the definition of the
 *  reflux ratio, not a model. */
export function perturbedOverrides(
  values: ColumnKnobValues, handle: Handle, relStep: number,
): ScalarOverride[] {
  const R = values["refluxRatio"] ?? WITNESS_REFLUX_RATIO;
  const D = values["distillateRate"] ?? WITNESS_DISTILLATE_RATE;
  const out = baseOverrides(values);
  const put = (key: string, value: number) => {
    const at = out.findIndex((o) => o.key === key);
    if (at >= 0) out[at] = { ...out[at]!, value };
    else out.push({ file: "system/flowsheetDict", key, value });
  };
  if (handle === "reflux") {
    put("refluxRatio", R * (1 + relStep));
  } else {
    put("distillateRate", D * (1 + relStep));
    put("refluxRatio", R / (1 + relStep));
  }
  return out;
}

/** What each handle IS, in one line, for the panel and the footnote. */
export const HANDLE_TEXT: { [k in Handle]: { label: string; means: string } } = {
  reflux: {
    label: "reflux L",
    means: "R is raised with D held, so the reflux is the only stream that "
      + "moves — the first manipulated variable of the LV configuration.",
  },
  distillate: {
    label: "distillate D",
    means: "D is raised and R lowered together so that L = R·D is unchanged, "
      + "so the distillate is the only stream that moves — the manipulated "
      + "variable the DV configuration frees.",
  },
};

/** The quality loop a structure would drive with this handle, or null when the
 *  structure does not free that stream for composition.  Null is a RESULT: it
 *  means the reader has chosen a handle this structure spends on an inventory,
 *  and the tool says so rather than drawing a loop that does not exist. */
export function qualityLoopFor(
  structure: ControlStructure | null, handle: Handle,
): ControlLoop | null {
  if (!structure) return null;
  return structure.loops.find(
    (l) => l.kind === "quality" && l.manipulates === handle) ?? null;
}

// ---- The provenance line ----------------------------------------------------

const PROVENANCE =
  `Runs tutorials/${COLUMN_CONTROL_WITNESS} TWICE with your parameters, in `
  + "your browser (choupoSolve WASM): once as declared, once with the "
  + "manipulated variable moved.  Every temperature is the column's own "
  + "published stage profile; this file takes differences of them and draws "
  + "the result.";

// ---- View geometry: where an instrument sits on the section -----------------
//
// A LAYOUT TABLE, not a claim.  The catalogue declares WHICH measurement drives
// WHICH valve; these numbers say where on the drawing each of those names is,
// and nothing else.  A name the catalogue introduces and this table does not
// place is reported rather than skipped — a silently undrawn loop is a
// structure the reader would believe they had seen.

const FW = 620, FH = 470;
const SHELL_X0 = 132, SHELL_X1 = 214, SHELL_TOP = 96, SHELL_BOT = 392;

interface Pt { x: number; y: number }

const VALVE_AT: { [name: string]: Pt } = {
  condenserDuty: { x: 388, y: 44 },
  distillate: { x: 500, y: 158 },
  reflux: { x: 268, y: 122 },
  boilup: { x: 388, y: 448 },
  bottoms: { x: 500, y: 424 },
  //  The feed valve rides the FEED STAGE, so it is placed per run rather than
  //  here (see `placeValve`).  No structure in the catalogue drives it today —
  //  a throughput loop would — and a valve nailed to one y would have been
  //  quietly wrong the first time one did.
};

const POINT_AT: { [name: string]: Pt } = {
  overhead: { x: 292, y: 62 },
  refluxDrum: { x: 420, y: 122 },
  sump: { x: 173, y: 420 },
  refluxLine: { x: 300, y: 100 },
  feedLine: { x: 60, y: 214 },
  // the two tray points are POSITIONED PER RUN (they depend on the stage the
  // criteria select), so they are filled in by `trayPoint` below.
};

/** The y of a stage on the shell.  Stage 1 is the condenser and stage N the
 *  reboiler — neither is on the shell — so the N-2 trays are spread over it. */
export function stageY(stage: number, nStages: number): number {
  const trays = Math.max(1, nStages - 2);
  const i = Math.min(Math.max(stage - 2, 0), trays - 1);
  return SHELL_TOP + ((i + 0.5) * (SHELL_BOT - SHELL_TOP)) / trays;
}

const trayPoint = (stage: number, nStages: number): Pt =>
  ({ x: SHELL_X1 + 10, y: stageY(stage, nStages) });

/** Where a valve sits.  Everything but the feed is fixed furniture; the feed
 *  valve follows the feed stage, because the feed pipe does. */
export function placeValve(
  name: string, feedStage: number, nStages: number,
): Pt | null {
  if (name === "feed")
    return { x: 86, y: stageY(feedStage, nStages) };
  return VALVE_AT[name] ?? null;
}

/** The two-letter ISA tag for a controlled variable.  A tag this table does not
 *  know is drawn with its own first two letters rather than omitted. */
export function isaTag(controlled: string): string {
  const map: { [k: string]: string } = {
    pressure: "PC",
    condenserLevel: "LC",
    reboilerLevel: "LC",
    topComposition: "TC",
    bottomComposition: "TC",
    refluxFlow: "FC",
    feedFlow: "FC",
  };
  return map[controlled] ?? controlled.slice(0, 2).toUpperCase();
}

// ---- Display helpers --------------------------------------------------------

const fmt = (v: number | null | undefined, d = 4): string =>
  typeof v === "number" && Number.isFinite(v) ? v.toPrecision(d) : "—";

const GRID = "var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";
const STEEL = "#8d9aa8";
const SIGNAL = "#9575cd";
const HOT = "#ffb74d";
const COLD = "#26c6da";
const PICKED = "#66bb6a";
const WARN = "#ef5350";

// ---- The cross-section ------------------------------------------------------

interface SectionInput {
  structure: ControlStructure;
  nStages: number;
  feedStage: number;
  /** The tray the selected criterion picked, when one was computed. */
  sensorStage: number | null;
  /** WHICH criterion picked it.  Named on the drawing, because "the criterion"
   *  is exactly the word this tool exists to stop anybody using: the two do not
   *  agree, and a tray number quoted without its criterion is incomplete. */
  sensorCriterion: "sensitivity" | "slope" | null;
  /** Which quality loop the sensor tray belongs to (null when the chosen
   *  handle is not free for composition in this structure). */
  sensorLoop: ControlLoop | null;
  busyOverlay: boolean;
}

function ColumnSection(
  { structure, nStages, feedStage, sensorStage, sensorCriterion, sensorLoop,
    busyOverlay }: SectionInput,
): JSX.Element {
  const trays: number[] = [];
  for (let s = 2; s <= nStages - 1; ++s) trays.push(s);

  const unplaced = structure.loops
    .filter((l) => placeValve(l.manipulates, feedStage, nStages) === null
      || (l.measuredAt !== "rectifyingTray" && l.measuredAt !== "strippingTray"
        && !POINT_AT[l.measuredAt]))
    .map((l) => l.controlled);

  const pointOf = (loop: ControlLoop): Pt | null => {
    if (loop.measuredAt === "rectifyingTray"
      || loop.measuredAt === "strippingTray") {
      if (sensorLoop && loop.controlled === sensorLoop.controlled
        && sensorStage !== null)
        return trayPoint(sensorStage, nStages);
      //  The OTHER quality loop: this tool computes one tray at a time, so its
      //  sensor is drawn at the middle of its own section and labelled as not
      //  selected.  Drawing it at a computed-looking position would claim a
      //  result nobody asked for.
      const mid = loop.measuredAt === "rectifyingTray"
        ? Math.max(2, Math.round(nStages * 0.3))
        : Math.min(nStages - 1, Math.round(nStages * 0.72));
      return trayPoint(mid, nStages);
    }
    return POINT_AT[loop.measuredAt] ?? null;
  };

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
        aria-label={`Cross-section of a two-product distillation column under `
          + `the ${structure.name} control structure, with the instrument `
          + `bubbles, the control valves and the signal line from each `
          + `measurement to the valve it drives`}>

        {/* ---- the vessel ---- */}
        <rect x={SHELL_X0} y={SHELL_TOP} width={SHELL_X1 - SHELL_X0}
          height={SHELL_BOT - SHELL_TOP} fill="none" stroke={STEEL}
          strokeWidth={2} rx={6} />
        {trays.map((s) => (
          <line key={`t${s}`} x1={SHELL_X0 + 6} y1={stageY(s, nStages)}
            x2={SHELL_X1 - 6} y2={stageY(s, nStages)} stroke={GRID}
            strokeWidth={1} />
        ))}
        <text x={(SHELL_X0 + SHELL_X1) / 2} y={SHELL_TOP - 10}
          textAnchor="middle" fontSize={11} fill={INK}>
          {nStages} stages
        </text>

        {/* condenser, drum, reboiler */}
        <rect x={330} y={44} width={104} height={34} fill="none"
          stroke={STEEL} strokeWidth={1.6} rx={4} />
        <text x={382} y={65} textAnchor="middle" fontSize={10} fill={INK}>
          condenser
        </text>
        <rect x={330} y={104} width={104} height={38} fill="none"
          stroke={STEEL} strokeWidth={1.6} rx={4} />
        <text x={382} y={127} textAnchor="middle" fontSize={10} fill={INK}>
          reflux drum
        </text>
        <rect x={330} y={396} width={104} height={36} fill="none"
          stroke={STEEL} strokeWidth={1.6} rx={4} />
        <text x={382} y={418} textAnchor="middle" fontSize={10} fill={INK}>
          reboiler
        </text>

        {/* ---- the piping ---- */}
        {/* overhead vapour: top of the shell to the condenser */}
        <polyline points={`${(SHELL_X0 + SHELL_X1) / 2},${SHELL_TOP} `
          + `${(SHELL_X0 + SHELL_X1) / 2},62 330,62`} fill="none"
          stroke={HOT} strokeWidth={2} />
        {/* condenser to drum */}
        <line x1={382} y1={78} x2={382} y2={104} stroke={COLD} strokeWidth={2} />
        {/* coolant into the condenser */}
        <line x1={388} y1={20} x2={388} y2={44} stroke={COLD} strokeWidth={2} />
        <text x={396} y={26} fontSize={10} fill={INK}>coolant</text>
        {/* drum to reflux, back into the top of the shell */}
        <polyline points={`330,122 ${SHELL_X1},122`} fill="none" stroke={COLD}
          strokeWidth={2} />
        <text x={276} y={114} fontSize={10} fill={INK}>reflux L</text>
        {/* drum to distillate */}
        <polyline points="434,122 470,122 470,158 520,158" fill="none"
          stroke={COLD} strokeWidth={2} />
        <text x={504} y={150} fontSize={11} fill={INK}>D</text>
        {/* sump to reboiler and back */}
        <polyline points={`${SHELL_X1},414 300,414 300,414 330,414`}
          fill="none" stroke={STEEL} strokeWidth={2} />
        <polyline points={`330,400 300,400 300,${SHELL_BOT} `
          + `${SHELL_X1},${SHELL_BOT}`} fill="none" stroke={HOT}
          strokeWidth={2} />
        <text x={244} y={396} fontSize={10} fill={INK}>boilup V</text>
        {/* steam into the reboiler */}
        <line x1={388} y1={432} x2={388} y2={458} stroke={HOT} strokeWidth={2} />
        <text x={396} y={456} fontSize={10} fill={INK}>steam</text>
        {/* bottoms */}
        <polyline points="434,424 520,424" fill="none" stroke={STEEL}
          strokeWidth={2} />
        <text x={504} y={416} fontSize={11} fill={INK}>B</text>
        {/* the sump itself */}
        <line x1={SHELL_X0} y1={SHELL_BOT} x2={SHELL_X0} y2={424}
          stroke={STEEL} strokeWidth={2} />
        <line x1={SHELL_X1} y1={SHELL_BOT} x2={SHELL_X1} y2={424}
          stroke={STEEL} strokeWidth={2} />
        <line x1={SHELL_X0} y1={424} x2={SHELL_X1} y2={424} stroke={STEEL}
          strokeWidth={2} />
        {/* feed */}
        <polyline points={`40,${stageY(feedStage, nStages)} `
          + `${SHELL_X0},${stageY(feedStage, nStages)}`} fill="none"
          stroke={STEEL} strokeWidth={2} />
        <text x={40} y={stageY(feedStage, nStages) - 8} fontSize={10} fill={INK}>
          feed (stage {feedStage})
        </text>

        {/* ---- the valves ---- */}
        {structure.loops.map((l) => {
          const v = placeValve(l.manipulates, feedStage, nStages);
          if (!v) return null;
          return (
            <g key={`v${l.controlled}`}>
              <path d={`M ${v.x - 8} ${v.y - 7} L ${v.x + 8} ${v.y + 7} `
                + `L ${v.x + 8} ${v.y - 7} L ${v.x - 8} ${v.y + 7} Z`}
                fill="none" stroke={STEEL} strokeWidth={1.6} />
            </g>
          );
        })}

        {/* ---- the loops: a bubble, a signal line, a valve ---- */}
        {structure.loops.map((l) => {
          const p = pointOf(l);
          const v = placeValve(l.manipulates, feedStage, nStages);
          if (!p || !v) return null;
          const isSensor = sensorLoop !== null
            && l.controlled === sensorLoop.controlled;
          const isUnpicked = l.kind === "quality" && !isSensor;
          const colour = isSensor ? PICKED
            : l.kind === "quality" ? INK : SIGNAL;
          return (
            <g key={`l${l.controlled}`}>
              <polyline points={`${p.x},${p.y} ${(p.x + v.x) / 2},${p.y} `
                + `${(p.x + v.x) / 2},${v.y} ${v.x},${v.y}`}
                fill="none" stroke={colour} strokeWidth={1.2}
                strokeDasharray="4 3" opacity={isUnpicked ? 0.45 : 1} />
              <circle cx={p.x} cy={p.y} r={11} fill="var(--mantine-color-body)"
                stroke={colour} strokeWidth={isSensor ? 2 : 1.4}
                opacity={isUnpicked ? 0.55 : 1} />
              <text x={p.x} y={p.y + 3.5} textAnchor="middle" fontSize={9}
                fill={colour} opacity={isUnpicked ? 0.7 : 1}>
                {isaTag(l.controlled)}
              </text>
              {l.ratioWith && (
                <text x={p.x} y={p.y - 15} textAnchor="middle" fontSize={8}
                  fill={colour}>
                  ratio ÷ {l.ratioWith}
                </text>
              )}
            </g>
          );
        })}

        {/* the computed tray, named on the drawing */}
        {sensorStage !== null && sensorLoop !== null && (
          <text x={trayPoint(sensorStage, nStages).x + 16}
            y={trayPoint(sensorStage, nStages).y + 3.5} fontSize={10}
            fill={PICKED}>
            stage {sensorStage} — picked by the{" "}
            {sensorCriterion === "sensitivity"
              ? "sensitivity criterion" : "slope criterion"}
          </text>
        )}
        {sensorLoop === null && (
          <text x={244} y={FH - 8} fontSize={10} fill={WARN}>
            the chosen handle is not free for composition in this structure —
            see the note below
          </text>
        )}
        {/* A LOOP THIS TABLE CANNOT PLACE IS REPORTED, NOT SKIPPED.  The
            catalogue may introduce a measurement point or a valve the layout
            has no coordinates for; drawing four loops of five in silence would
            be a structure the reader believes they have seen. */}
        {unplaced.length > 0 && (
          <text x={20} y={FH - 8} fontSize={10} fill={WARN}>
            not drawn (no place on this layout): {unplaced.join(", ")}
          </text>
        )}
      </svg>
    </Box>
  );
}

// ---- The tray-selection chart -----------------------------------------------

interface TrayChartInput {
  T: readonly number[];
  slope: readonly StageMetric[];
  sens: readonly StageMetric[];
  slopePick: StageMetric | null;
  sensPick: StageMetric | null;
  handle: Handle;
  busyOverlay: boolean;
}

const CX0 = 62, CX1 = 292, CY0 = 20, CY1 = 396;   // the profile panel
const DX0 = 356, DX1 = 596;                        // the criteria panel

function TrayChart(
  { T, slope, sens, slopePick, sensPick, handle, busyOverlay }: TrayChartInput,
): JSX.Element {
  const n = T.length;
  const finite = T.filter((v) => Number.isFinite(v));
  //  A profile with nothing finite in it is drawable as an empty frame rather
  //  than as NaN coordinates, which SVG renders as an invisible nothing with no
  //  hint that anything went wrong.
  const tLo = finite.length ? Math.min(...finite) : 0;
  const tHi = finite.length ? Math.max(...finite) : 1;
  const y = (stage: number) =>
    CY0 + ((CY1 - CY0) * (stage - 1)) / Math.max(1, n - 1);
  const xT = (t: number) =>
    CX0 + ((CX1 - CX0) * (t - tLo)) / Math.max(1e-9, tHi - tLo);

  const maxSlope = Math.max(1e-9, ...slope.map((m) => Math.abs(m.value)));
  const maxSens = Math.max(1e-9, ...sens.map((m) => Math.abs(m.value)));
  const halfWidth = (DX1 - DX0) / 2;
  const mid = (DX0 + DX1) / 2;

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
        aria-label="Stage temperature profile beside the two tray-selection
          criteria, with the stage each one selects marked">

        {/* ---- the profile ---- */}
        <text x={(CX0 + CX1) / 2} y={12} textAnchor="middle" fontSize={11}
          fill={INK}>stage temperature (K)</text>
        <polyline
          points={T.map((t, i) => Number.isFinite(t)
            ? `${xT(t).toFixed(2)},${y(i + 1).toFixed(2)}` : "")
            .filter(Boolean).join(" ")}
          fill="none" stroke={HOT} strokeWidth={2} />
        {T.map((t, i) => Number.isFinite(t) ? (
          <circle key={`p${i}`} cx={xT(t)} cy={y(i + 1)} r={2} fill={HOT} />
        ) : null)}
        <text x={CX0} y={CY1 + 18} fontSize={10} fill={INK}>
          {fmt(tLo, 5)}
        </text>
        <text x={CX1} y={CY1 + 18} textAnchor="end" fontSize={10} fill={INK}>
          {fmt(tHi, 5)}
        </text>
        <text x={16} y={(CY0 + CY1) / 2} fontSize={10} fill={INK}
          transform={`rotate(-90 16 ${(CY0 + CY1) / 2})`}>
          stage (1 = condenser, {n} = reboiler)
        </text>

        {/* ---- the two criteria, back to back ---- */}
        <line x1={mid} y1={CY0} x2={mid} y2={CY1} stroke={GRID}
          strokeWidth={1} />
        <text x={DX0} y={12} fontSize={10} fill={COLD}>
          slope |T(n+1)−T(n)|
        </text>
        <text x={DX1} y={12} textAnchor="end" fontSize={10} fill={SIGNAL}>
          sensitivity to {HANDLE_TEXT[handle].label}
        </text>
        {slope.map((m) => (
          <rect key={`s${m.stage}`}
            x={mid - (halfWidth * Math.abs(m.value)) / maxSlope}
            y={y(m.stage) - 5}
            width={(halfWidth * Math.abs(m.value)) / maxSlope} height={10}
            fill={COLD} opacity={slopePick?.stage === m.stage ? 1 : 0.45} />
        ))}
        {sens.map((m) => (
          <rect key={`v${m.stage}`} x={mid}
            y={y(m.stage) - 5}
            width={(halfWidth * Math.abs(m.value)) / maxSens} height={10}
            fill={m.value < 0 ? WARN : SIGNAL}
            opacity={sensPick?.stage === m.stage ? 1 : 0.45} />
        ))}
        {slopePick && (
          <text x={DX0 - 4} y={y(slopePick.stage) + 3.5} textAnchor="end"
            fontSize={10} fill={COLD}>
            {slopePick.stage}
          </text>
        )}
        {sensPick && (
          <text x={DX1 + 4} y={y(sensPick.stage) + 3.5} fontSize={10}
            fill={SIGNAL}>
            {sensPick.stage}
          </text>
        )}
        <text x={mid} y={CY1 + 18} textAnchor="middle" fontSize={9} fill={INK}>
          bars are scaled to each criterion&apos;s own maximum — the two are
          not comparable in size, only in WHICH stage they pick
        </text>
        <text x={DX1} y={CY1 + 32} textAnchor="end" fontSize={9} fill={WARN}>
          a red bar is a NEGATIVE gain: the temperature falls when the handle
          rises
        </text>
      </svg>
    </Box>
  );
}

// ---- The heuristic card -----------------------------------------------------

function HeuristicCard(
  { h, structure }: { h: Heuristic; structure: string },
): JSX.Element {
  const st = stanceOn(h, structure);
  const cited = h.authority === "primaryLiterature";
  return (
    <Box style={{ borderLeft: `3px solid ${
      st === "favours" ? PICKED : st === "warnsAgainst" ? WARN : SIGNAL}`,
    paddingLeft: 10, marginBottom: 12 }}>
      <Group gap={6} wrap="wrap" align="center" mb={2}>
        {st && (
          <Badge size="xs" variant="light" tt="none"
            color={st === "favours" ? "green"
              : st === "warnsAgainst" ? "red" : "grape"}>
            {st === "favours" ? "favours this structure"
              : st === "warnsAgainst" ? "warns against this structure"
                : st === "conditional" ? "conditional on this structure"
                  : "neutral"}
          </Badge>
        )}
        <Badge size="xs" variant="outline" tt="none"
          color={cited ? "blue" : "orange"}>
          {cited ? "cited" : "Choupo's own guide (signed)"}
        </Badge>
        <Tooltip withArrow multiline w={430} label={h.source.verificationNote}>
          <Badge size="xs" variant="light" tt="none"
            color={h.source.verification === "checkedCopy" ? "teal"
              : h.source.verification === "searchIndexQuotation" ? "yellow"
                : "red"}
            styles={{ root: { cursor: "help" } }}>
            {h.source.verification === "checkedCopy" ? "checked copy"
              : h.source.verification === "searchIndexQuotation"
                ? "citation not opened"
                : "UNVERIFIED — general knowledge"}
          </Badge>
        </Tooltip>
      </Group>
      <Text size="sm" style={{ lineHeight: 1.35 }}>{h.claim}</Text>
      <Text size="xs" c="dimmed" mt={3}>
        {h.source.author}{h.source.year ? ` (${h.source.year})` : ""},{" "}
        <i>{h.source.title}</i>. {h.source.publication}
        {h.source.locus ? ` — ${h.source.locus}` : ""}
      </Text>
      {h.validity && (
        <Text size="xs" c="dimmed" mt={3}>
          <b>Asserted for:</b> {h.validity}
        </Text>
      )}
      {h.notCovered && (
        <Text size="xs" c="dimmed" mt={2}>
          <b>Does not cover:</b> {h.notCovered}
        </Text>
      )}
    </Box>
  );
}

// ---- The tool ---------------------------------------------------------------

export function ColumnControlTool(): JSX.Element {
  const catalogue = useMemo(() => readHeuristicsCatalogue(), []);
  const appResult = useStore((s) => s.runResult);

  const [structureName, setStructureName] = useState<string>("LV");
  const structure = catalogue.structures.find((s) => s.name === structureName)
    ?? catalogue.structures[0] ?? null;
  const [handle, setHandle] = useState<Handle>("reflux");
  const [view, setView] = useState<"section" | "tray" | "rules">("section");
  const [stepPct, setStepPct] = useState(1);

  const [knobs, setKnobs] = useState<ColumnKnobValues>(defaultKnobValues);
  const setKnob = useCallback((id: string, v: number) => {
    setKnobs((s) => ({ ...s, [id]: v }));
  }, []);

  // Source: the self-fed classroom witness (DEFAULT) vs the app's current run.
  const appFeed = useMemo(
    () => findColumnFeeds(appResult?.profiles, appResult?.kpis)[0] ?? null,
    [appResult]);
  const [source, setSource] = useState<"classroom" | "current">("classroom");
  const src: "classroom" | "current" =
    appFeed !== null && source === "current" ? "current" : "classroom";
  const showToggle = appFeed !== null || source === "current";

  const relStep = stepPct / 100;
  const baseKey = useMemo(() => JSON.stringify(knobs), [knobs]);
  const pertKey = useMemo(
    () => JSON.stringify([knobs, handle, relStep]), [knobs, handle, relStep]);
  const baseOv = useMemo(() => baseOverrides(knobs), [knobs]);
  const pertOv = useMemo(
    () => perturbedOverrides(knobs, handle, relStep), [knobs, handle, relStep]);

  const witness = src === "classroom" ? COLUMN_CONTROL_WITNESS : null;
  const baseRun = useMethodRun(witness, baseOv, baseKey, "choupoSolve");
  const pertRun = useMethodRun(witness, pertOv, pertKey, "choupoSolve");
  const busy = baseRun.busy || pertRun.busy;

  const feed = useMemo(
    () => (src === "current" ? appFeed
      : findColumnFeeds(baseRun.result?.profiles, baseRun.result?.kpis)[0]
        ?? null),
    [src, appFeed, baseRun.result]);
  const pertFeed = useMemo(
    () => (src === "current" ? null
      : findColumnFeeds(pertRun.result?.profiles, pertRun.result?.kpis)[0]
        ?? null),
    [src, pertRun.result]);

  const view0 = useMemo(() => {
    if (!feed) return null;
    const T = feed.profile.columns[T_COLUMN];
    if (!T) return null;
    const slope = slopeMetric(T);
    const Tp = pertFeed?.profile.columns[T_COLUMN];
    const sens = Tp ? sensitivityMetric(T, Tp, relStep) : [];
    return {
      unit: feed.unit, T, nStages: T.length, slope, sens,
      slopePick: pickStage(slope), sensPick: pickStage(sens),
      crossings: signChanges(sens),
      drum: drumStreams(feed.kpis),
    };
  }, [feed, pertFeed, relStep]);

  const sensorLoop = qualityLoopFor(structure, handle);
  const sensorCriterion: "sensitivity" | "slope" | null =
    view0?.sensPick ? "sensitivity" : view0?.slopePick ? "slope" : null;
  const sensorStage = view0?.sensPick?.stage ?? view0?.slopePick?.stage ?? null;
  const feedStage = Math.round(knobs["feedStage"] ?? WITNESS_FEED_STAGE);

  const controls = (
    <>
      {showToggle && (
        <SegmentedControl size="xs" value={src} fullWidth
          onChange={(v) => setSource(v === "current" ? "current" : "classroom")}
          data={[{ label: "Classroom", value: "classroom" },
            { label: "Current run", value: "current" }]} />
      )}
      <Box>
        <Text size="xs" c="dimmed" mb={2}>view</Text>
        <SegmentedControl size="xs" value={view} fullWidth orientation="vertical"
          onChange={(v) => setView(v as "section" | "tray" | "rules")}
          data={[
            { label: "Cross-section (P&ID)", value: "section" },
            { label: "Tray selection", value: "tray" },
            { label: "Cited heuristics", value: "rules" },
          ]} />
      </Box>
      <Box>
        <Text size="xs" c="dimmed" mb={2}>control structure</Text>
        <SegmentedControl size="xs" value={structureName} fullWidth
          orientation="vertical" onChange={setStructureName}
          data={catalogue.structures.map((s) => ({
            label: s.name, value: s.name }))} />
      </Box>
      <Box>
        <Text size="xs" c="dimmed" mb={2}>
          manipulated variable the temperature loop will use
        </Text>
        <SegmentedControl size="xs" value={handle} fullWidth
          onChange={(v) => setHandle(v as Handle)}
          data={[{ label: "reflux L", value: "reflux" },
            { label: "distillate D", value: "distillate" }]} />
        <Text size="xs" c="dimmed" mt={3} style={{ lineHeight: 1.25 }}>
          {HANDLE_TEXT[handle].means}
        </Text>
      </Box>
      {src === "classroom" && (
        <>
          {busy && (
            <Group gap={6} wrap="nowrap" align="center">
              <Loader size="xs" />
              <Text size="xs" c="dimmed">
                two solves — the base column and the perturbed one
              </Text>
            </Group>
          )}
          {COLUMN_CONTROL_KNOBS.map((k) => (
            <KnobSlider key={k.id} knob={k} value={knobs[k.id] ?? k.def}
              onChange={(v) => setKnob(k.id, v)} />
          ))}
          <KnobSlider
            knob={{ id: "step", label: "perturbation for the sensitivity",
              min: 0.25, max: 5, step: 0.25, unit: "% of the handle",
              why: "the sensitivity criterion is a finite difference, so it has "
                + "a step size; move it and watch the SELECTED stage stay put "
                + "while the magnitude drifts — that is what tells you the "
                + "answer is not an artefact of the step" }}
            value={stepPct} onChange={setStepPct} showWhy />
          <PanelNote>{PROVENANCE}</PanelNote>
        </>
      )}
      {src === "current" && (
        <PanelNote>
          Reading the app&apos;s current run. Only the SLOPE criterion is
          available on it: the sensitivity criterion needs a second solve with
          the manipulated variable moved, and a finished run is one operating
          point.
        </PanelNote>
      )}
    </>
  );

  const engineErr = baseRun.err ?? pertRun.err;
  const alerts = (
    <>
      {src === "classroom" && engineErr !== null && (
        <Alert color="red" variant="light" m={12}
          title="The run refused or failed — the engine's message, verbatim">
          <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
            {engineErr}
          </Text>
        </Alert>
      )}
      {catalogue.refusals.length > 0 && (
        <Alert color="orange" variant="light" m={12}
          title={`${catalogue.refusals.length} heuristic record(s) could not `
            + "be read, and each is named rather than dropped"}>
          {catalogue.refusals.map((r) => (
            <Text key={r} size="xs" ff="monospace">{r}</Text>
          ))}
        </Alert>
      )}
    </>
  );


  /*  ONE renderer for the lesson, above BOTH returns: the page that has a
   *  structure catalogue and the page that could not read one show the same
   *  steps.  A sibling tool once shipped the explanation only in the branch
   *  that HAD a drawing, so it vanished exactly when there was nothing to
   *  explain -- that is the shape this avoids. */
  const lessonStep = lessonStepper(COLUMN_CONTROL_STEPS);

  const lessonHead = (
    <Box>
      <Title order={3}>
        Controlling a column: five valves, and why the choice is yours
      </Title>
      <Text size="sm" c="dimmed" mt={4}>
        The first of these pages that does not build you an answer.  Every
        structure below is defensible; what is worth learning is how to choose
        between them, and what the choice depends on.
      </Text>
    </Box>
  );

  const lessonLimits = (
    <Box>
      <Title order={5}>What this does not model</Title>
      <Box mt={4} style={{ display: "grid", columnGap: 16, rowGap: 6,
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        {COLUMN_CONTROL_LIMITS.map((l) => (
          <Text key={l.id} size="xs" c="dimmed">
            <b>{l.title}</b> {l.body}
          </Text>
        ))}
      </Box>
    </Box>
  );

  if (!structure) {
    return (
      <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
        <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
          {lessonHead}
          {alerts}
          {[1, 2, 3].map(lessonStep)}
          <Box>
            <Text size="sm" c="dimmed">
              No control structure could be read from
              data/standards/heuristics/ — the drawing is declared there, and
              this tool draws nothing it cannot read.  The refusals above name
              every record that could not be used; the lesson below is
              unaffected, because the count and the convention are not
              heuristics.
            </Text>
          </Box>
          <Stack gap={8} style={{ maxWidth: 280 }}>{controls}</Stack>
          {[4, 5].map(lessonStep)}
          {lessonLimits}
        </Stack>
      </Box>
    );
  }

  const rules = heuristicsForStructure(catalogue, structure.name);
  const trayRules = heuristicsForTopic(catalogue, "traySelection");
  const conflicts = conflictPairs(catalogue, structure.name);

  const chips = (
    <Group gap="sm" wrap="wrap" align="center">
      <Tooltip withArrow multiline w={430} label={structure.summary}>
        <Badge variant="light" color="grape" tt="none"
          styles={{ root: { cursor: "help" } }}>
          {structure.label}
        </Badge>
      </Tooltip>
      <Tooltip withArrow multiline w={440}
        label={"The largest |T(n+1) − T(n)| over the stages that are trays "
          + "(stage 1 is the condenser and the last stage the reboiler, so "
          + "neither can carry a tray thermocouple).  Read off ONE solved "
          + "profile — the criterion a student can apply with a ruler."}>
        <Badge variant="light" color="cyan" tt="none"
          styles={{ root: { cursor: "help" } }}>
          slope picks {view0?.slopePick
            ? `stage ${view0.slopePick.stage} (${fmt(view0.slopePick.value, 4)} K`
              + ` between it and stage ${view0.slopePick.stage + 1})`
            : "—"}
        </Badge>
      </Tooltip>
      <Tooltip withArrow multiline w={440}
        label={"The largest |ΔT| per 1 % move of the manipulated variable, "
          + "from a SECOND solve of the same column.  This is the number a "
          + "published table cannot give you: it belongs to this column at "
          + "these settings with this handle."}>
        <Badge variant="light" color="violet" tt="none"
          styles={{ root: { cursor: "help" } }}>
          sensitivity picks {view0?.sensPick
            ? `stage ${view0.sensPick.stage} `
              + `(${view0.sensPick.value >= 0 ? "+" : ""}`
              + `${fmt(view0.sensPick.value, 3)} K per 1 % of `
              + `${HANDLE_TEXT[handle].label})`
            : src === "current" ? "— (needs a second solve)" : "—"}
        </Badge>
      </Tooltip>
      {view0?.drum && (
        <Tooltip withArrow multiline w={450}
          label={"Choupo's Design Guide says to hold a level with the LARGER "
            + "stream leaving that drum, and both streams are on this run's "
            + "KPI row (L_rect and D), so the rule has a number here: "
            + `L/D = ${fmt(view0.drum.ratio, 4)}.  What the rule does NOT `
            + "ship is a THRESHOLD — the published forms disagree about "
            + "where 'larger' starts to matter, none could be pinned to a "
            + "checked page, and so this chip says which is larger and stops "
            + "there."}>
          <Badge variant="light" color="orange" tt="none"
            styles={{ root: { cursor: "help" } }}>
            leaving the drum: L/D = {fmt(view0.drum.ratio, 4)} — the{" "}
            {view0.drum.larger === "reflux" ? "reflux" : "distillate"} is the
            {" "}larger stream
          </Badge>
        </Tooltip>
      )}
      {view0?.slopePick && view0.sensPick && (
        <Badge variant="light" tt="none"
          color={view0.slopePick.stage === view0.sensPick.stage
            ? "green" : "orange"}>
          {view0.slopePick.stage === view0.sensPick.stage
            ? "the two criteria agree"
            : `the two criteria DISAGREE — ${view0.slopePick.stage} against `
              + `${view0.sensPick.stage}`}
        </Badge>
      )}
    </Group>
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
          <Title order={5}>Now wire one of them onto a solved column</Title>
          <Text size="sm" mt={4}>
            <b>Cross-section</b> draws the structure you select as a P&amp;ID
            over a steady column: every valve, every instrument bubble, and a
            dashed signal line from each measurement to the valve it drives.
            Change the structure and watch the lines move — that is the whole
            selection, made visible.  <b>Tray selection</b> puts the engine&apos;s
            own stage-temperature profile beside the two criteria of step 4 and
            marks the tray each one picks.  <b>Cited heuristics</b> shows what
            published authorities said about the structure on screen, including
            where two of them disagree.  Nothing on any of the three is scored
            or ranked.
          </Text>
        </Box>

        {chips}

        <Box style={{ display: "grid", gap: 14,
          gridTemplateColumns: "minmax(200px, 240px) 1fr" }}>
          <Stack gap={8}>{controls}</Stack>
          <Box style={{ minWidth: 0, height: 500, display: "flex",
            flexDirection: "column" }}>
            {view === "section" ? (
              <ColumnSection structure={structure}
                nStages={view0?.nStages ?? 15} feedStage={feedStage}
                sensorStage={sensorStage} sensorCriterion={sensorCriterion}
                sensorLoop={sensorLoop}
                busyOverlay={src === "classroom" && busy} />
            ) : view === "tray" ? (
              view0 ? (
                <TrayChart T={view0.T} slope={view0.slope} sens={view0.sens}
                  slopePick={view0.slopePick} sensPick={view0.sensPick}
                  handle={handle} busyOverlay={src === "classroom" && busy} />
              ) : (
                <Box style={{ flex: 1, display: "flex", alignItems: "center",
                  justifyContent: "center", padding: 12 }}>
                  {busy ? <Loader size="sm" /> : (
                    <Text size="sm" c="dimmed" ta="center" maw={520}>
                      No column profile yet — the diagnostic activates when a
                      solved unit publishes a per-stage profile whose axis is{" "}
                      <b>{STAGE_COLUMN}</b> and which carries a{" "}
                      <b>{T_COLUMN}</b> column, which is what a{" "}
                      <code>distillationColumn</code> emits.
                    </Text>
                  )}
                </Box>
              )
            ) : (
              <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto">
                <Box p={12}>
                  <Text size="xs" c="dimmed" mb={8}>
                    What the authorities say about <b>{structure.label}</b>.
                    Where two disagree, both are shown with the conditions each
                    assumed; nothing here is scored, weighted or reconciled.
                  </Text>
                  {rules.length === 0 && (
                    <Text size="sm" c="dimmed" mb={12}>
                      No record in the catalogue takes a stance on this
                      structure. That is an absence of evidence, not a verdict —
                      silence is not a neutral opinion, and this tool does not
                      manufacture one.
                    </Text>
                  )}
                  {rules.map((h) => (
                    <HeuristicCard key={h.file} h={h}
                      structure={structure.name} />
                  ))}
                  {conflicts.map(([a, b]) => (
                    <Alert key={`${a.name}|${b.name}`} color="orange"
                      variant="light" mb={12}
                      title="Two authorities disagree here — deliberately not resolved">
                      <Text size="xs">
                        <b>{a.source.author} ({a.source.year})</b> {a.claim}
                      </Text>
                      <Text size="xs" mt={4}>
                        <b>{b.source.author} ({b.source.year})</b> {b.claim}
                      </Text>
                      <Text size="xs" mt={6} c="dimmed">
                        Read the two <i>Asserted for</i> lines above: the
                        conditions are not the same, and which of them is yours
                        is the judgement this tool exists to hand back to you
                        rather than make.
                      </Text>
                    </Alert>
                  ))}
                  <Text size="xs" c="dimmed" mt={16} mb={6}
                    style={{ fontWeight: 600 }}>
                    On choosing the tray
                  </Text>
                  {trayRules.map((h) => (
                    <HeuristicCard key={`t${h.file}`} h={h}
                      structure={structure.name} />
                  ))}
                </Box>
              </ScrollArea>
            )}
          </Box>
        </Box>

        {/* What this file computes, it declares (the standing EduTools rule). */}
        <Box>
          {sensorLoop === null && (
            <Text size="xs" c="red">
              In {structure.name}, {HANDLE_TEXT[handle].label} is not free for
              composition — it is spent on{" "}
              {structure.loops.find((l) => l.manipulates === handle)?.controlled
                ?? "an inventory"}. The sensitivity above is a valid
              perturbation of this column, but no loop in this structure would
              use it; the structure that frees this handle is the one to switch
              to.
            </Text>
          )}
          {view0 && view0.crossings.length > 0 && (
            <Text size="xs" c="dimmed">
              The response to {HANDLE_TEXT[handle].label} changes SIGN between
              stage {view0.crossings[0]!.below} and{" "}
              {view0.crossings[0]!.above}: a sensor there has almost no gain,
              whatever the profile looks like. The slope criterion cannot see
              this, because it never asks the handle a question.
            </Text>
          )}
          <Text size="xs" c="dimmed">
            Every temperature above is the column&apos;s own published stage
            profile; this file takes a difference between adjacent stages, and a
            difference between two engine runs, and draws them. It computes no
            relative gain — the engine publishes no gain matrix — and it shows
            no transient: a level that moves is an accumulation term, the engine
            has no dynamic column, and a fabricated response would teach a
            specific wrong thing with confidence.
          </Text>
        </Box>

        {lessonStep(4)}
        {lessonStep(5)}

        {lessonLimits}
      </Stack>
    </Box>
  );
}
