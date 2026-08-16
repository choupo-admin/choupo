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
  DryingCurveTool -- the two classical drying diagrams for the Methods
  workspace, side by side on ONE engine run:

      X(t)   moisture content against time: a straight constant-rate stretch
             that bends into the falling-rate tail.
      R(X)   the rate against the moisture -- the plot a student is asked to
             read the CRITICAL MOISTURE off, because X_c is exactly the corner
             where a flat line starts to slope.

  SELF-FEEDING (the classroom default, the BreakthroughTool contract): the
  tool clones its bundled WITNESS case

      tutorials/batch/drying/dryer01_sucrose_tray

  (2.0 kg dry sucrose wet to X_0 = 0.30 kg/kg, exposed over 0.5 m2 to a
  DECLARED, CONSTANT air environment at 60 C and Y = 0.010 kg/kg dry),
  writes the classroom knobs into the witness's own declared dict scalars
  (methodRun's textual override -- units and comments survive; a knob that
  misses its dict THROWS), and runs choupoBatch in the browser (WASM).  When
  the app's CURRENT run also carries a trajectory a source toggle appears, and
  the activation predicate then decides under "Current run".

  ZERO physics in TypeScript -- the standing Methods rule.  Every curve is an
  ENGINE COLUMN and every number is an ENGINE KPI:

      X(t)          trajectory column  <unit>.X_kg_kg
      R(X)          trajectory columns <unit>.R_kg_m2_s against <unit>.X_kg_kg
      the corner    KPI X_critical           (a DECLARED input, echoed back)
      the asymptote KPI X_equilibrium        (a RESULT: GAB at the air's a_w)
      the break     KPI t_critical           (OBSERVED, and OMITTED when the
                                              run never saw the crossing)
      the chips     T_wb, R_constant, latentDuty_kW, latentEnergy_kJ

  Nothing is re-derived here.  The ONE authorized view operation is ORDERING
  over engine numbers: `classifyPeriods` labels each emitted sample
  constant-rate or falling-rate by comparing the engine's own X against the
  engine's own X_c, with the SAME strict inequality the engine's flux uses
  (`if (X > X_c) return R_c;` -- BatchDryer::flux_), so a sample sitting
  exactly ON X_c lands on the FALLING side in the tool exactly as it does in
  the engine.  That is a comparison of two published numbers, not a model.

  THE ABSENT t_critical IS INFORMATION, NOT A HOLE.  The engine publishes
  t_critical only when the crossing was actually observed and omits the key
  entirely otherwise -- a deliberate design choice ("an absent number is not
  faked").  This tool therefore never renders it as 0 and never blanks it: it
  reports WHICH absence it is, from the engine's other numbers alone
  (X_initial at or below X_c => there was no constant-rate period to end;
  X_final still above X_c => the run ended INSIDE the constant-rate period;
  neither => stated as unexplained rather than guessed).  The endTime knob is
  wired so a student can produce that second state on purpose.

  The chart is inline SVG (the VanHeerden / EpsilonNtu / Merkel / Levenspiel
  precedent): the plotting bundle cannot load outside a browser, and the pure
  helpers (detector, column resolver, period classifier, knob map) must stay
  importable by the node test runner (tests/dryingCurveTool.test.ts).
\*---------------------------------------------------------------------------*/

import { useCallback, useMemo, useState } from "react";
import {
  ActionIcon, Alert, Badge, Box, Collapse, Group, Loader, NumberInput,
  SegmentedControl, Slider, Text, Tooltip,
} from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";

import type { TrajectoryData } from "../../adapters/SolverAdapter.js";
import { useMethodRun, type ScalarOverride } from "../../case/methodRun.js";
import { useStore } from "../../state/store.js";
import { useCollapsedFlag } from "./methodsChrome.js";
// The padded display domain is a pure view helper with ONE home already (the
// Levenspiel-imports-Rayleigh precedent for sharing a helper between two
// method tools) -- re-declaring it here would be a second copy of the same
// arithmetic.
import { axisDomain, type Domain } from "./VanHeerdenTool.js";

/** Per-unit KPI block as the adapter delivers it (RunResult.kpis[unit]). */
export type UnitKpis = { [key: string]: number };
export type KpiMap = { [unitName: string]: UnitKpis };

// ---- The engine's emitted column names --------------------------------------
// BatchDryer::trajectoryExtras() publishes three extras and choupoBatch's
// writer prefixes each with the unit's own name:
//
//     csv << "," << unit->name() << "." << k;
//
// so the witness's trajectory.csv header reads, verbatim:
//
//     t,dryer.n_water,dryer.n_sucrose,dryer.n_N2,dryer.T,
//     dryer.X_kg_kg,dryer.R_kg_m2_s,dryer.evaporated_kg
//
// The SUFFIXES below are the contract; the prefix is whatever the case named
// its unit, which is why every lookup here goes through the resolver rather
// than a hardcoded "dryer.".

/** Moisture content on the dry-solid basis [kg water / kg dry solid]. */
export const X_COLUMN_SUFFIX = "X_kg_kg";
/** Drying flux over the exposed area [kg/(m2 s)]. */
export const R_COLUMN_SUFFIX = "R_kg_m2_s";
/** Cumulative evaporated moisture [kg] -- carried, not plotted. */
export const EVAPORATED_COLUMN_SUFFIX = "evaporated_kg";

/** The KPI keys a drying unit must publish for the two diagrams to mean
 *  anything: the corner, the asymptote, and the constant-rate flux. */
export const REQUIRED_DRYING_KPIS =
  ["X_critical", "X_equilibrium", "R_constant"] as const;

export interface DryingColumns {
  /** `<unit>.X_kg_kg` when the run carries it, else null. */
  X: string | null;
  /** `<unit>.R_kg_m2_s` when the run carries it, else null. */
  R: string | null;
  /** `<unit>.evaporated_kg` when the run carries it, else null. */
  evaporated: string | null;
}

/**
 * The column-name resolver, unit-prefix aware.  `columns` are the trajectory's
 * own names (Object.keys(trajectory.vars); a stray "t" matches nothing).  A
 * suffix that another unit happens to publish is NOT picked up -- the prefix
 * must be this unit's, exactly.
 */
export function resolveDryingColumns(
  columns: readonly string[], unit: string,
): DryingColumns {
  const pick = (suffix: string): string | null => {
    const name = `${unit}.${suffix}`;
    return columns.includes(name) ? name : null;
  };
  return {
    X: pick(X_COLUMN_SUFFIX),
    R: pick(R_COLUMN_SUFFIX),
    evaporated: pick(EVAPORATED_COLUMN_SUFFIX),
  };
}

/** Every unit name that publishes an X column, in the order the trajectory
 *  header declares them (the driver writes unit by unit, so that order is the
 *  flowsheet's own). */
export function dryingUnitsIn(columns: readonly string[]): string[] {
  const tail = `.${X_COLUMN_SUFFIX}`;
  const out: string[] = [];
  for (const c of columns) {
    if (!c.endsWith(tail)) continue;
    const unit = c.slice(0, c.length - tail.length);
    if (unit.length > 0 && !out.includes(unit)) out.push(unit);
  }
  return out;
}

// ---- Activation -------------------------------------------------------------

export interface DryingActivation {
  active: boolean;
  /** The drying unit whose columns and KPIs feed both diagrams. */
  unit: string | null;
  columns: DryingColumns;
}

const INACTIVE: DryingActivation = {
  active: false, unit: null,
  columns: { X: null, R: null, evaporated: null },
};

/**
 * Decide whether the run feeds this tool.  BOTH conditions must hold on the
 * SAME unit: the trajectory carries that unit's X and R columns, AND that
 * unit's KPI block carries the three drying KPIs the diagrams are built on.
 * A breakthrough run (c_out_/y_out_ columns, front KPIs) publishes no X
 * column and does not activate -- drawing its inventory under this tool's
 * name would be a different plot wearing this one's title.
 */
export function detectDryingCurve(
  columns: readonly string[], kpis: KpiMap | undefined,
): DryingActivation {
  if (!kpis) return INACTIVE;
  for (const unit of dryingUnitsIn(columns)) {
    const block = kpis[unit];
    if (!block) continue;
    const complete = REQUIRED_DRYING_KPIS.every((k) => {
      const v = block[k];
      return typeof v === "number" && Number.isFinite(v);
    });
    if (!complete) continue;
    const resolved = resolveDryingColumns(columns, unit);
    if (resolved.X === null || resolved.R === null) continue;
    return { active: true, unit, columns: resolved };
  }
  return INACTIVE;
}

// ---- The KPI block, verbatim ------------------------------------------------
// Every field is read straight off the engine's KPI map; a key the run did not
// publish is null and stays null.  t_critical is DELIBERATELY absent on a run
// that ended inside the constant-rate period, and `criticalTimeState` below is
// where that absence is turned into a sentence.

export interface DryingKpis {
  X_initial: number | null;
  X_final: number | null;
  X_critical: number | null;
  X_equilibrium: number | null;
  T_wb: number | null;
  R_constant: number | null;
  latentDuty_kW: number | null;
  latentEnergy_kJ: number | null;
  t_critical: number | null;
}

export function extractDryingKpis(block: UnitKpis | undefined): DryingKpis {
  const read = (key: string): number | null => {
    const v = block?.[key];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  return {
    X_initial: read("X_initial"),
    X_final: read("X_final"),
    X_critical: read("X_critical"),
    X_equilibrium: read("X_equilibrium"),
    T_wb: read("T_wb"),
    R_constant: read("R_constant"),
    latentDuty_kW: read("latentDuty_kW"),
    latentEnergy_kJ: read("latentEnergy_kJ"),
    t_critical: read("t_critical"),
  };
}

// ---- AUTHORIZED view operation: the period classifier -----------------------
// ORDERING over two engine numbers, and the ordering is the ENGINE's own.
// BatchDryer::flux_ reads:
//
//     scalar BatchDryer::flux_(scalar X) const
//     {
//         if (X > X_c_) return R_c_;
//         return R_c_ * (X - X_eq_) / (X_c_ - X_eq_);
//     }
//
// so the constant-rate branch is X STRICTLY ABOVE X_c and a sample sitting
// EXACTLY on X_c is already on the falling-rate branch.  This helper copies
// that comparison and nothing else: it computes no rate, and it never decides
// where the corner is -- the engine's X_c does.

export type DryingPeriod = "constant" | "falling";

/**
 * One label per emitted sample.  Null where the comparison cannot be made
 * (a non-finite X, or a non-finite X_c) -- an unlabelled point, never a
 * guessed one.
 */
export function classifyPeriods(
  X: readonly number[], Xc: number,
): (DryingPeriod | null)[] {
  const usableXc = Number.isFinite(Xc);
  return X.map((x) => {
    if (!usableXc || !Number.isFinite(x)) return null;
    return x > Xc ? "constant" : "falling";
  });
}

export interface PeriodSegment {
  period: DryingPeriod;
  /** First sample index of the run, inclusive. */
  start: number;
  /** One past the last sample index of the run. */
  end: number;
}

/** Contiguous runs of same-period samples, unlabelled points breaking a run.
 *  Pure index arithmetic over the classifier's output -- it is what lets the
 *  two periods be drawn in two colours without re-deciding anything. */
export function periodSegments(
  periods: readonly (DryingPeriod | null)[],
): PeriodSegment[] {
  const out: PeriodSegment[] = [];
  let current: PeriodSegment | null = null;
  for (let i = 0; i < periods.length; ++i) {
    const p = periods[i] ?? null;
    if (p === null) { current = null; continue; }
    if (current !== null && current.period === p) { current.end = i + 1; continue; }
    current = { period: p, start: i, end: i + 1 };
    out.push(current);
  }
  return out;
}

// ---- The absent t_critical, as a sentence -----------------------------------

export type CriticalTimeAbsence =
  /** X_initial is at or below X_c: the tray was already in the falling-rate
   *  period when the run started, so there was no constant-rate period to
   *  end.  The engine only records a crossing it watched happen. */
  | "startedAtOrBelowXc"
  /** X_final is still above X_c: the run ENDED inside the constant-rate
   *  period.  Extend endTime and the break time appears. */
  | "endedInConstantRate"
  /** Neither of the above can be read from the published KPIs -- said so,
   *  rather than picking whichever story fits. */
  | "unstated";

export type CriticalTimeState =
  | { present: true; t: number; note: string }
  | { present: false; t: null; absence: CriticalTimeAbsence; note: string };

/**
 * Turn the presence OR the absence of the engine's `t_critical` KPI into
 * something a student can read.  The value, when published, is the engine's
 * OBSERVED crossing (interpolated between the two accepted states that
 * bracket it), never the analytic estimate.  When it is absent this returns
 * an explanatory state -- never 0, never a blank -- and the reason is decided
 * by ordering the engine's OWN X_initial / X_final against its OWN X_c.
 */
export function criticalTimeState(k: DryingKpis): CriticalTimeState {
  if (k.t_critical !== null) {
    return {
      present: true, t: k.t_critical,
      note: "the engine OBSERVED the crossing of X_c between two accepted "
        + "states and interpolated it; dX/dt is exactly constant on that leg, "
        + "so the interpolation smooths nothing.",
    };
  }
  const Xc = k.X_critical;
  if (Xc !== null && k.X_initial !== null && k.X_initial <= Xc) {
    return {
      present: false, t: null, absence: "startedAtOrBelowXc",
      note: `no break time: the tray STARTED at X_0 = ${fmt(k.X_initial)} `
        + `kg/kg, at or below X_c = ${fmt(Xc)} kg/kg, so there was no `
        + "constant-rate period for the run to leave.",
    };
  }
  if (Xc !== null && k.X_final !== null && k.X_final > Xc) {
    return {
      present: false, t: null, absence: "endedInConstantRate",
      note: `the run ENDED INSIDE the constant-rate period -- it stopped at `
        + `X_final = ${fmt(k.X_final)} kg/kg, still above X_c = ${fmt(Xc)} `
        + "kg/kg, so the crossing never happened and the engine omits the "
        + "t_critical KPI entirely rather than faking a sentinel.  Raise "
        + "endTime and the break time appears.",
    };
  }
  return {
    present: false, t: null, absence: "unstated",
    note: "this run published no t_critical KPI, and its X_initial / X_final "
      + "/ X_critical do not say which absence it is -- reported as unknown "
      + "rather than guessed.",
  };
}

// ---- The engine's own sentence about the falling-rate law -------------------
// BatchDryer announces the law on EVERY run, and calls it what it is:
//
//   [batchDryer 'dryer'] MODELLING CHOICE, not physics: below X_c = 0.1200
//   kg/kg the flux falls LINEARLY in the free moisture, R = R_c (X - X_eq)/
//   (X_c - X_eq) -- the simplest defensible falling-rate law, and it is a
//   CHOICE this case makes
//
// The honesty chip quotes THAT, verbatim, rather than a paraphrase of it.

const MODELLING_CHOICE_MARK = "MODELLING CHOICE";
const DRYER_TAG = /\[batchDryer '([^']*)'\]/;

/**
 * The engine's own falling-rate sentence, lifted out of the run log with its
 * `[batchDryer '<unit>']` prefix stripped and nothing else changed.  Null when
 * the log carries none -- the caller then says the sentence could not be read,
 * and never invents one.  When `unit` is given, a sentence tagged for ANOTHER
 * unit is never attributed to it.
 */
export function extractFallingRateNotice(
  log: string | undefined, unit?: string | null,
): string | null {
  if (!log) return null;
  const lines = log.split("\n").filter((l) => l.includes(MODELLING_CHOICE_MARK));
  if (lines.length === 0) return null;
  const strip = (line: string): string => {
    const close = line.indexOf("] ");
    return (close >= 0 ? line.slice(close + 2) : line).trim();
  };
  if (unit === undefined || unit === null) return strip(lines[0]!);
  const mine = lines.find((l) => l.includes(`[batchDryer '${unit}']`));
  if (mine !== undefined) return strip(mine);
  // An untagged single announcement (a log shape without the unit prefix) is
  // still this run's; two candidates, or a tag naming someone else, are not.
  const tagged = lines.filter((l) => DRYER_TAG.test(l));
  if (tagged.length === 0 && lines.length === 1) return strip(lines[0]!);
  return null;
}

// ---- The classroom witness + its knob->dict map -----------------------------
// The STANDALONE feed: the tool clones this bundled tutorial, writes the knob
// values into its DECLARED dict scalars, and runs choupoBatch in the browser.
// Each knob names the FILE and dict KEY it writes; the defaults ARE the
// witness's authored values, and the test suite verifies every (file, key)
// resolves UNIQUELY against the real bundled raw text -- a knob that misses
// its dict would run the engine on the wrong question (applyScalarOverride
// throws instead).

/** Bundled identifier of the witness ("<category>/<subclass>/<case>" -- batch
 *  is a sub-classed category, so the `drying` segment is part of it). */
export const DRYING_WITNESS = "batch/drying/dryer01_sucrose_tray";

const FLOWSHEET = "system/flowsheetDict";
const CONTROL = "system/controlDict";

export interface DryingKnob {
  /** Stable id -- the key of the knob-value state bag. */
  id: string;
  /** What the student reads beside the control. */
  label: string;
  /** Witness file the knob writes into. */
  file: string;
  /** The dict key as written there. */
  key: string;
  /** The witness's own authored value -- the classroom default. */
  def: number;
  min: number;
  max: number;
  step: number;
  /** The unit the dict declares.  The knob writes the NUMBER only; the unit
   *  word in the dict survives the override untouched.  "" for keys the dict
   *  declares bare (the unit then lives in the label). */
  unit: string;
  /** One line of why this knob is here -- shown as its tooltip. */
  why: string;
}

export const DRYING_KNOBS: readonly DryingKnob[] = [
  // `T        333.15 K;` inside operation.air -- the only line-anchored `T`
  // in the flowsheetDict, so the key resolves uniquely there.
  { id: "airT", label: "air T", file: FLOWSHEET, key: "T",
    def: 333.15, min: 300, max: 373, step: 0.5, unit: "K",
    why: "the declared air environment's dry-bulb temperature: it sets the "
      + "wet bulb the surface is held at, hence the whole constant-rate "
      + "flux -- the engine recomputes T_wb by adiabatic saturation" },
  // `Y        0.010;` -- declared bare (kg/kg lives in the dict's comment).
  { id: "airY", label: "air humidity Y (kg/kg dry)", file: FLOWSHEET, key: "Y",
    def: 0.010, min: 0.001, max: 0.04, step: 0.001, unit: "",
    why: "the air's humidity ratio: it is BOTH ends of the drying problem -- "
      + "the mass-transfer driving force Y_sat(T_wb) - Y and, through the "
      + "air's water activity, the GAB equilibrium moisture X_eq the tail "
      + "aims at" },
  { id: "area", label: "exposed tray area", file: FLOWSHEET, key: "area",
    def: 0.5, min: 0.1, max: 2, step: 0.05, unit: "m2",
    why: "the exposed drying surface: it scales the evaporation rate R_c*A "
      + "without touching the flux R_c, so the whole X(t) curve compresses "
      + "in time while R(X) does not move at all" },
  { id: "criticalMoisture", label: "critical moisture X_c (kg/kg)",
    file: FLOWSHEET, key: "criticalMoisture",
    def: 0.12, min: 0.02, max: 0.28, step: 0.005, unit: "",
    why: "the MEASURED break between the two periods -- drag it and watch "
      + "the corner in R(X) move to exactly where you put it, because in "
      + "this model X_c is an input, not a result" },
  // controlDict declares `endTime 3000;` bare (the seconds live in a comment).
  { id: "endTime", label: "horizon endTime (s)", file: CONTROL, key: "endTime",
    def: 3000, min: 500, max: 20000, step: 100, unit: "",
    why: "the run's horizon.  Below the break time (~1030 s at the authored "
      + "settings) the run ENDS inside the constant-rate period, the engine "
      + "omits the t_critical KPI entirely, and this tool says which absence "
      + "that is instead of drawing a zero" },
];

// Candidate knobs deliberately ABSENT, each recorded BY KIND so a reason
// cannot rot into an accident.  The test suite pins every entry: a
// `resolves: false` row must make applyScalarOverride THROW against the real
// bundled raw text, and a `resolves: true` row must NOT -- the VanHeerden
// precedent, where the difference between "unreachable" and "reachable but
// declined" is itself part of the contract.
export type DryingAbsenceKind =
  /** The value is not the first token after the key: the line-anchored
   *  `key value [unit];` grammar cannot address it. */
  | "bracketDimensions"
  /** Declared inside a one-line `{ ... }` block, so the key is not at the
   *  start of its line and the anchored grammar never sees it. */
  | "inlineOneLineBlock"
  /** A WORD, not a scalar: the override replaces a NUMBER and nothing else. */
  | "word"
  /** Addressable, and deliberately not exposed -- with the reason stated. */
  | "addressableButDeclined";

export interface DryingAbsence {
  id: string;
  file: string;
  key: string;
  kind: DryingAbsenceKind;
  /** Whether the key resolves in the witness's raw text AT ALL -- pinned by
   *  the tests in both directions. */
  resolves: boolean;
  why: string;
}

export const DRYING_ABSENCES: readonly DryingAbsence[] = [
  { id: "k_Y", file: FLOWSHEET, key: "k_Y", kind: "bracketDimensions",
    resolves: false,
    why: "the witness declares the gas-film coefficient with bracket "
      + "dimensions (`k_Y [1 -2 -1 0 0]  0.05;`), so the number is not the "
      + "first token after the key and the line-anchored grammar does not "
      + "reach it -- the same gap BreakthroughTool records for its LDF "
      + "coefficient.  It would need a methodRun grammar extension, not a "
      + "workaround here." },
  { id: "initialMoisture", file: "0/internalState", key: "water",
    kind: "inlineOneLineBlock", resolves: false,
    why: "X_0 lives in `molarComposition { sucrose 0.14924928;  water "
      + "0.85075072; }` -- an inline ONE-LINE block, so `water` is not at "
      + "the start of its line and the anchored grammar cannot address it.  "
      + "Two fractions constrained to sum to 1 are not one scalar knob "
      + "anyway (the BreakthroughTool feed-composition precedent)." },
  { id: "carrier", file: FLOWSHEET, key: "carrier", kind: "word",
    resolves: false,
    why: "`carrier  N2;` is a WORD.  The override replaces the NUMBER of a "
      + "declared scalar, so this key does not resolve at all -- the "
      + "VanHeerden `thermalMode adiabatic;` precedent." },
  { id: "totalMoles", file: "0/internalState", key: "totalMoles",
    kind: "addressableButDeclined", resolves: true,
    why: "addressable, and deliberately not a knob: it scales the dry solid "
      + "and its moisture in the SAME proportion, so X_0 -- the quantity "
      + "both diagrams are drawn against -- does not move at all.  What it "
      + "would move is the charge, and with it the hand estimate the "
      + "witness prints in its own header; a knob that silently invalidates "
      + "the printed hand check would leave the tool teaching a case other "
      + "than the one it names." },
  { id: "deltaT", file: CONTROL, key: "deltaT",
    kind: "addressableButDeclined", resolves: true,
    why: "addressable, and deliberately not a knob: the RK4 step is a "
      + "NUMERICS choice the case header argues for (far inside the "
      + "falling-rate stability bound).  Exposing it would let a student "
      + "move the answer without moving the question." },
];

export type DryingKnobValues = { [id: string]: number };

/** The witness's authored values -- the classroom baseline. */
export function defaultKnobValues(): DryingKnobValues {
  const out: DryingKnobValues = {};
  for (const k of DRYING_KNOBS) out[k.id] = k.def;
  return out;
}

/** Knob values -> methodRun ScalarOverrides.  Non-finite values are dropped
 *  (that knob keeps the witness's authored number) -- never written as NaN. */
export function knobOverrides(values: DryingKnobValues): ScalarOverride[] {
  const out: ScalarOverride[] = [];
  for (const k of DRYING_KNOBS) {
    const v = values[k.id];
    if (v !== undefined && Number.isFinite(v))
      out.push({ file: k.file, key: k.key, value: v });
  }
  return out;
}

// The provenance line, always visible in classroom mode.
const PROVENANCE =
  `Runs tutorials/${DRYING_WITNESS} (2.0 kg dry sucrose wet to X_0 = 0.30 `
  + "kg/kg, 0.5 m2 exposed to declared 60 C air at Y = 0.010) with your "
  + "parameters, in your browser (choupoBatch WASM).  X and R are the "
  + "dryer's own trajectory columns; X_c, X_eq, T_wb, R_c and the break time "
  + "are its KPIs.";

const COLLAPSE_KEY = "choupo.methods.drying.controlsCollapsed";

// ---- Display formatting -----------------------------------------------------

function fmt(v: number | null | undefined, d = 5): string {
  return typeof v === "number" && Number.isFinite(v) ? String(Number(v.toPrecision(d))) : "—";
}
const fmtTick = (v: number) => String(Number(v.toPrecision(4)));

// ---- Chart frame (viewBox units, the sibling tools' conventions) ------------

const FW = 640, FH = 420;
const FX0 = 82, FX1 = 606, FY0 = 18, FY1 = 372;

const GRID = "var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";
const CONSTANT_COLOR = "#26c6da";   // the flat stretch: rate held at R_c
const FALLING_COLOR = "#ffb74d";    // the tail: the DECLARED linear law
const XC_COLOR = "#ef5350";         // the corner -- a declared input
const XEQ_COLOR = "#66bb6a";        // the asymptote -- an engine result
const TCRIT_COLOR = "#ba68c8";      // the observed break time

interface Frame {
  toX: (x: number) => number;
  toY: (y: number) => number;
  xDom: Domain;
  yDom: Domain;
}

function makeFrame(xDom: Domain, yDom: Domain): Frame {
  return {
    xDom, yDom,
    toX: (x) => FX0 + ((FX1 - FX0) * (x - xDom.lo)) / (xDom.hi - xDom.lo || 1),
    toY: (y) => FY1 - ((FY1 - FY0) * (y - yDom.lo)) / (yDom.hi - yDom.lo || 1),
  };
}

const ticksOf = (d: Domain) =>
  [0, 0.25, 0.5, 0.75, 1].map((f) => d.lo + f * (d.hi - d.lo));

function Axes({ frame, xLabel, yLabel }: {
  frame: Frame; xLabel: string; yLabel: string;
}): JSX.Element {
  return (
    <>
      {ticksOf(frame.xDom).map((t) => (
        <g key={`gx${t}`}>
          <line x1={frame.toX(t)} y1={FY0} x2={frame.toX(t)} y2={FY1}
            stroke={GRID} strokeWidth={0.6} />
          <text x={frame.toX(t)} y={FY1 + 16} textAnchor="middle"
            fontSize={11} fill={INK}>{fmtTick(t)}</text>
        </g>
      ))}
      {ticksOf(frame.yDom).map((t) => (
        <g key={`gy${t}`}>
          <line x1={FX0} y1={frame.toY(t)} x2={FX1} y2={frame.toY(t)}
            stroke={GRID} strokeWidth={0.6} />
          <text x={FX0 - 6} y={frame.toY(t) + 4} textAnchor="end"
            fontSize={11} fill={INK}>{fmtTick(t)}</text>
        </g>
      ))}
      <text x={(FX0 + FX1) / 2} y={FH - 6} textAnchor="middle"
        fontSize={12} fill={INK}>{xLabel}</text>
      <text x={16} y={(FY0 + FY1) / 2} textAnchor="middle" fontSize={12}
        fill={INK} transform={`rotate(-90 16 ${(FY0 + FY1) / 2})`}>
        {yLabel}
      </text>
    </>
  );
}

/** One polyline per period run.  A run that does not start at sample 0 is
 *  extended BACK by one sample so the two colours meet without a gap -- that
 *  extra point is an ENGINE sample the neighbouring run already owns, never a
 *  point this file makes up. */
function periodPolylines(
  xs: readonly number[], ys: readonly number[],
  segments: readonly PeriodSegment[], frame: Frame,
): JSX.Element[] {
  return segments.map((seg, i) => {
    const from = seg.start > 0 ? seg.start - 1 : seg.start;
    const pts: string[] = [];
    for (let j = from; j < seg.end; ++j) {
      const x = xs[j];
      const y = ys[j];
      if (x === undefined || y === undefined) continue;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      pts.push(`${frame.toX(x).toFixed(2)},${frame.toY(y).toFixed(2)}`);
    }
    if (pts.length < 2) return <g key={`seg${i}`} />;
    return (
      <polyline key={`seg${i}`} points={pts.join(" ")} fill="none"
        strokeWidth={2}
        stroke={seg.period === "constant" ? CONSTANT_COLOR : FALLING_COLOR} />
    );
  });
}

function BusyVeil({ on }: { on: boolean }): JSX.Element | null {
  if (!on) return null;
  return (
    <Box style={{ width: "100%", height: "100%", display: "flex",
      alignItems: "center", justifyContent: "center", zIndex: 1,
      background: "light-dark(rgba(255,255,255,0.5), rgba(0,0,0,0.35))" }}>
      <Loader size="sm" />
    </Box>
  );
}

// ---- Pane 1: X(t) -----------------------------------------------------------

interface XtInput {
  t: readonly number[];
  X: readonly number[];
  segments: readonly PeriodSegment[];
  k: DryingKpis;
  tCrit: CriticalTimeState;
  busyOverlay: boolean;
}

function XversusTSvg(
  { t, X, segments, k, tCrit, busyOverlay }: XtInput,
): JSX.Element {
  const guides = [k.X_critical, k.X_equilibrium]
    .filter((v): v is number => v !== null);
  const xDom = axisDomain([t], 0.02) ?? { lo: 0, hi: 1 };
  const yDom = axisDomain([X, guides], 0.08) ?? { lo: 0, hi: 1 };
  const frame = makeFrame(xDom, yDom);

  return (
    <Box style={{ flex: 1, minHeight: 0, position: "relative" }}>
      <BusyVeil on={busyOverlay} />
      <svg viewBox={`0 0 ${FW} ${FH}`} width="100%" height="100%"
        preserveAspectRatio="xMidYMid meet" role="img"
        aria-label="Drying curve: moisture content against time, the
          constant-rate stretch and the falling-rate tail in two colours,
          with the engine's critical and equilibrium moisture as guides">
        <Axes frame={frame}
          xLabel="time t (s)"
          yLabel="moisture X (kg water / kg dry solid)" />

        {/* The two engine-published levels the curve is read against. */}
        {k.X_critical !== null && (
          <g>
            <line x1={FX0} y1={frame.toY(k.X_critical)}
              x2={FX1} y2={frame.toY(k.X_critical)}
              stroke={XC_COLOR} strokeWidth={1.2} strokeDasharray="5 4" />
            <text x={FX0 + 6} y={frame.toY(k.X_critical) - 4} fontSize={10}
              fill={XC_COLOR}>X_c = {fmtTick(k.X_critical)} kg/kg</text>
          </g>
        )}
        {k.X_equilibrium !== null && (
          <g>
            <line x1={FX0} y1={frame.toY(k.X_equilibrium)}
              x2={FX1} y2={frame.toY(k.X_equilibrium)}
              stroke={XEQ_COLOR} strokeWidth={1.2} strokeDasharray="2 4" />
            <text x={FX0 + 6} y={frame.toY(k.X_equilibrium) - 4} fontSize={10}
              fill={XEQ_COLOR}>X_eq = {fmtTick(k.X_equilibrium)} kg/kg</text>
          </g>
        )}

        {periodPolylines(t, X, segments, frame)}

        {/* The break time -- the engine's OBSERVED crossing, drawn only when
            the engine published it.  Its absence is a SENTENCE below the
            chart, never a marker at zero. */}
        {tCrit.present && tCrit.t >= xDom.lo && tCrit.t <= xDom.hi && (
          <g>
            <line x1={frame.toX(tCrit.t)} y1={FY0}
              x2={frame.toX(tCrit.t)} y2={FY1}
              stroke={TCRIT_COLOR} strokeWidth={1.6} />
            <text x={frame.toX(tCrit.t) + 5} y={FY0 + 14} fontSize={10}
              fill={TCRIT_COLOR}>
              t_critical = {fmtTick(tCrit.t)} s
            </text>
          </g>
        )}

        <text x={FX1 - 6} y={FY0 + 14} textAnchor="end" fontSize={10}
          fill={CONSTANT_COLOR}>constant rate (X &gt; X_c)</text>
        <text x={FX1 - 6} y={FY0 + 28} textAnchor="end" fontSize={10}
          fill={FALLING_COLOR}>falling rate (X ≤ X_c)</text>
      </svg>
    </Box>
  );
}

// ---- Pane 2: R(X) -- the plot X_c is read off ------------------------------

interface RxInput {
  X: readonly number[];
  R: readonly number[];
  segments: readonly PeriodSegment[];
  k: DryingKpis;
  busyOverlay: boolean;
}

function RversusXSvg({ X, R, segments, k, busyOverlay }: RxInput): JSX.Element {
  const xGuides = [k.X_critical, k.X_equilibrium]
    .filter((v): v is number => v !== null);
  const yGuides = [0, ...(k.R_constant !== null ? [k.R_constant] : [])];
  const xDom = axisDomain([X, xGuides], 0.04) ?? { lo: 0, hi: 1 };
  const yDom = axisDomain([R, yGuides], 0.08) ?? { lo: 0, hi: 1 };
  const frame = makeFrame(xDom, yDom);

  const vGuide = (
    x: number, color: string, label: string, dy: number,
  ): JSX.Element | null => {
    if (x < xDom.lo || x > xDom.hi) return null;
    return (
      <g>
        <line x1={frame.toX(x)} y1={FY0} x2={frame.toX(x)} y2={FY1}
          stroke={color} strokeWidth={1.4} strokeDasharray="5 4" />
        <text x={frame.toX(x) + 4} y={FY0 + dy} fontSize={10} fill={color}>
          {label}
        </text>
      </g>
    );
  };

  return (
    <Box style={{ flex: 1, minHeight: 0, position: "relative" }}>
      <BusyVeil on={busyOverlay} />
      <svg viewBox={`0 0 ${FW} ${FH}`} width="100%" height="100%"
        preserveAspectRatio="xMidYMid meet" role="img"
        aria-label="Drying rate against moisture content: the flat
          constant-rate line, the corner at the engine's critical moisture,
          and the falling-rate segment heading for the equilibrium moisture">
        <Axes frame={frame}
          xLabel="moisture X (kg water / kg dry solid) — the run moves RIGHT to LEFT"
          yLabel="drying flux R (kg / m² s)" />

        {/* R = 0: where the declared falling-rate law sends the flux, and the
            level the tail's aim at X_eq is read against. */}
        {yDom.lo <= 0 && 0 <= yDom.hi && (
          <line x1={FX0} y1={frame.toY(0)} x2={FX1} y2={frame.toY(0)}
            stroke={INK} strokeWidth={1} strokeDasharray="2 4" />
        )}

        {/* R_c: the engine's constant-rate flux -- the flat stretch's level. */}
        {k.R_constant !== null && (
          <g>
            <line x1={FX0} y1={frame.toY(k.R_constant)}
              x2={FX1} y2={frame.toY(k.R_constant)}
              stroke={CONSTANT_COLOR} strokeWidth={1} strokeDasharray="3 4" />
            <text x={FX0 + 6} y={frame.toY(k.R_constant) - 4} fontSize={10}
              fill={CONSTANT_COLOR}>
              R_c = {k.R_constant.toExponential(4)} kg/(m² s)
            </text>
          </g>
        )}

        {periodPolylines(X, R, segments, frame)}

        {k.X_critical !== null
          && vGuide(k.X_critical, XC_COLOR,
            `X_c = ${fmtTick(k.X_critical)} — the corner`, 14)}
        {k.X_equilibrium !== null
          && vGuide(k.X_equilibrium, XEQ_COLOR,
            `X_eq = ${fmtTick(k.X_equilibrium)} — R goes to 0 here`, 30)}
      </svg>
    </Box>
  );
}

// ---- One knob control (label + exact entry + slider + its reason) -----------

function KnobControl({ k, value, onChange }: {
  k: DryingKnob;
  value: number;
  onChange: (v: number) => void;
}): JSX.Element {
  return (
    <Tooltip withArrow multiline w={330} label={k.why}>
      <Box style={{ width: 178 }}>
        <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
          {k.label}{k.unit ? ` [${k.unit}]` : ""}
        </Text>
        <NumberInput size="xs" value={value} min={k.min} max={k.max}
          step={k.step}
          onChange={(v) => {
            const n = typeof v === "number" ? v : Number(v);
            if (Number.isFinite(n)) onChange(n);
          }} />
        <Slider size="xs" mt={4} value={value} min={k.min} max={k.max}
          step={k.step} label={null} onChange={onChange} />
      </Box>
    </Tooltip>
  );
}

// ---- The tool ---------------------------------------------------------------

export function DryingCurveTool(): JSX.Element {
  const appResult = useStore((s) => s.runResult);

  // Source: the self-fed classroom witness (DEFAULT) vs the app's current run.
  // The toggle appears whenever the current run carries a trajectory at all;
  // the activation predicate then decides under "Current run", so a
  // non-drying batch run still reaches an empty state that explains itself.
  const hasAppTrajectory = appResult?.trajectory !== undefined;
  const [source, setSource] = useState<"classroom" | "current">("classroom");
  const src: "classroom" | "current" =
    hasAppTrajectory && source === "current" ? "current" : "classroom";

  const [knobs, setKnobs] = useState<DryingKnobValues>(defaultKnobValues);
  const { collapsed, toggle } = useCollapsedFlag(COLLAPSE_KEY);
  const setKnob = useCallback((id: string, v: number) => {
    setKnobs((s) => ({ ...s, [id]: v }));
  }, []);
  const knobsKey = useMemo(() => JSON.stringify(knobs), [knobs]);
  const overrides = useMemo(() => knobOverrides(knobs), [knobs]);
  const [pane, setPane] = useState<"Xt" | "RX">("Xt");

  const { result: classroom, err, busy } = useMethodRun(
    src === "classroom" ? DRYING_WITNESS : null,
    overrides, knobsKey, "choupoBatch");

  const result = src === "current" ? appResult : classroom;
  const trajectory: TrajectoryData | undefined = result?.trajectory;
  const kpis: KpiMap | undefined = result?.kpis;

  const detection = useMemo(
    () => detectDryingCurve(
      trajectory ? Object.keys(trajectory.vars) : [], kpis),
    [trajectory, kpis]);

  const view = useMemo(() => {
    if (!trajectory || !detection.active || detection.unit === null) return null;
    const { X: xCol, R: rCol } = detection.columns;
    if (xCol === null || rCol === null) return null;
    const X = trajectory.vars[xCol];
    const R = trajectory.vars[rCol];
    if (!X || !R) return null;
    const k = extractDryingKpis(kpis?.[detection.unit]);
    // The detector already required a finite X_critical; this narrows it.
    if (k.X_critical === null) return null;
    const periods = classifyPeriods(X, k.X_critical);
    return {
      unit: detection.unit,
      t: trajectory.t, X, R, k,
      segments: periodSegments(periods),
      tCrit: criticalTimeState(k),
      notice: extractFallingRateNotice(result?.log, detection.unit),
    };
  }, [trajectory, kpis, detection, result]);

  // ---- The source + classroom-knob bar (always rendered) --------------------
  const controls = (
    <Box style={{ flexShrink: 0, borderBottom:
      "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))" }}>
      <Group gap="sm" wrap="nowrap" align="center" px={12} py={6}>
        {hasAppTrajectory && (
          <SegmentedControl size="xs" value={src} style={{ flexShrink: 0 }}
            onChange={(v) => setSource(v === "current" ? "current" : "classroom")}
            data={[
              { label: "Classroom", value: "classroom" },
              { label: "Current run", value: "current" },
            ]} />
        )}
        {src === "classroom" && (
          <>
            <ActionIcon variant="subtle" size="sm" onClick={toggle}
              aria-label={collapsed
                ? "show the classroom knobs" : "hide the classroom knobs"}>
              {collapsed
                ? <IconChevronRight size={14} /> : <IconChevronDown size={14} />}
            </ActionIcon>
            <Text size="xs" fw={500} style={{ whiteSpace: "nowrap" }}>
              classroom knobs
            </Text>
            {busy && (
              <Group gap={6} wrap="nowrap" align="center">
                <Loader size="xs" />
                <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                  re-integrating the tray — seconds, not instant
                </Text>
              </Group>
            )}
          </>
        )}
        <SegmentedControl size="xs" value={pane} style={{ flexShrink: 0 }}
          onChange={(v) => setPane(v === "RX" ? "RX" : "Xt")}
          data={[
            { label: "X(t)", value: "Xt" },
            { label: "R(X)", value: "RX" },
          ]} />
      </Group>
      {src === "classroom" && (
        <>
          <Collapse in={!collapsed}>
            <Group gap="sm" px={12} pb={6} align="flex-start" wrap="wrap">
              {DRYING_KNOBS.map((k) => (
                <KnobControl key={k.id} k={k} value={knobs[k.id] ?? k.def}
                  onChange={(v) => setKnob(k.id, v)} />
              ))}
            </Group>
          </Collapse>
          <Text size="xs" c="dimmed" px={12} pb={6}>{PROVENANCE}</Text>
        </>
      )}
    </Box>
  );

  // The engine's message, verbatim — never rephrased, never swallowed.
  const alerts = src === "classroom" && err !== null ? (
    <Alert color="red" variant="light" m={12}
      title="The run refused or failed — the engine's message, verbatim">
      <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
        {err}
      </Text>
    </Alert>
  ) : null;

  // ---- No drawable view yet: per-source honest states -----------------------
  if (view === null) {
    return (
      <Box style={{ height: "100%", display: "flex", flexDirection: "column",
        minHeight: 0 }}>
        {controls}
        {alerts}
        <Box style={{ flex: 1, display: "flex", alignItems: "center",
          justifyContent: "center", padding: 12 }}>
          {src === "classroom" && err === null
            && (busy || classroom === null) ? (
              <Group gap="sm" wrap="nowrap" align="center">
                <Loader size="sm" />
                <Text size="sm" c="dimmed">
                  the engine is integrating the tray — seconds, not instant
                </Text>
              </Group>
            ) : (
              <Text size="sm" c="dimmed" ta="center" maw={500}>
                {src === "classroom"
                  ? "The classroom run finished but published no drying "
                    + "surface"
                  : "This run publishes no drying surface"}
                {" "}— the two diagrams activate when a choupoBatch unit emits
                the trajectory columns <b>{X_COLUMN_SUFFIX}</b> and{" "}
                <b>{R_COLUMN_SUFFIX}</b> AND the matching KPIs (
                {REQUIRED_DRYING_KPIS.join(", ")}), which is what a{" "}
                <code>batchDryer</code> publishes.  A batch run of any other
                kind has no drying curve to draw — run{" "}
                <code>tutorials/{DRYING_WITNESS}</code> and return here.
              </Text>
            )}
        </Box>
      </Box>
    );
  }

  const k = view.k;

  return (
    <Box style={{ height: "100%", display: "flex", flexDirection: "column",
      minHeight: 0 }}>
      {controls}
      {alerts}

      {/* Chips: each states WHAT it claims and on whose number. */}
      <Group gap="sm" wrap="wrap" align="center" px={12} py={6}
        style={{ flexShrink: 0 }}>
        <Tooltip withArrow multiline w={430}
          label={"The engine's KPI `T_wb`: the wet-bulb temperature of the "
            + "DECLARED air, found by bisecting the adiabatic-saturation "
            + "equation at Lewis = 1.  While X > X_c the model HOLDS the "
            + "surface there — which is why the flux is flat.  The solid's "
            + "own temperature is a named gap: this model does not "
            + "integrate it."}>
          <Badge variant="light" color="teal" tt="none"
            styles={{ root: { cursor: "help" } }}>
            T_wb = {fmt(k.T_wb)} K
          </Badge>
        </Tooltip>

        <Tooltip withArrow multiline w={430}
          label={"The engine's KPI `R_constant`: the constant-rate flux it "
            + "formed as k_Y (Y_sat(T_wb) − Y), the flat level in R(X).  A "
            + "flux, not a rate — multiply by the exposed area to get kg/s."}>
          <Badge variant="light" color="cyan" tt="none"
            styles={{ root: { cursor: "help" } }}>
            R_c = {k.R_constant !== null
              ? `${k.R_constant.toExponential(4)} kg/(m² s)` : "—"}
          </Badge>
        </Tooltip>

        <Tooltip withArrow multiline w={450}
          label={"The engine's KPI `X_critical` — and it is a DECLARED INPUT "
            + "echoed back, not a result: the case measures it "
            + "(operation.criticalMoisture).  So the corner in R(X) sits at "
            + "X_c BY CONSTRUCTION of the declared two-period law; reading "
            + "X_c off the plot recovers what was put in.  What the run "
            + "decides is WHEN the curve reaches it — that is t_critical."}>
          <Badge variant="light" color="red" tt="none"
            styles={{ root: { cursor: "help" } }}>
            X_c = {fmt(k.X_critical)} kg/kg (declared input)
          </Badge>
        </Tooltip>

        <Tooltip withArrow multiline w={450}
          label={"The engine's KPI `X_equilibrium` — and this one IS a "
            + "result: the GAB isotherm of the solid evaluated at the "
            + "declared air's own water activity.  The engine says so in the "
            + "log ('NOT a declared number').  It is where the falling-rate "
            + "law sends the flux to zero, so the tail aims at it and never "
            + "crosses it."}>
          <Badge variant="light" color="green" tt="none"
            styles={{ root: { cursor: "help" } }}>
            X_eq = {fmt(k.X_equilibrium)} kg/kg (GAB result)
          </Badge>
        </Tooltip>

        <Tooltip withArrow multiline w={450}
          label={"The engine's KPIs `latentDuty_kW` (the load at the "
            + "constant rate, R_c A λ(T_wb)) and `latentEnergy_kJ` (what the "
            + "whole evaporation took).  Both are the AIR's: the drying heat "
            + "comes from a declared environment OUTSIDE the campaign "
            + "boundary, so the engine publishes them as KPIs and refuses to "
            + "ledger them as a duty.  That is also why this case's campaign "
            + "energy balance reports UNAVAILABLE rather than a number."}>
          <Badge variant="light" color="orange" tt="none"
            styles={{ root: { cursor: "help" } }}>
            latent duty = {fmt(k.latentDuty_kW)} kW
            {k.latentEnergy_kJ !== null
              ? ` (${fmt(k.latentEnergy_kJ)} kJ total)` : ""}
          </Badge>
        </Tooltip>

        {/* The honesty chip: the falling-rate law is a CHOICE, and the
            engine's own sentence is quoted rather than paraphrased. */}
        <Tooltip withArrow multiline w={470}
          label={view.notice !== null
            ? `The engine announces this every run, verbatim: "${view.notice}"`
            : "This run's log did not carry the engine's own sentence, so "
              + "there is nothing to quote here.  The falling-rate law is "
              + "still a declared modelling choice — read it in the run log "
              + "rather than from a paraphrase written here."}>
          <Badge variant="light" color="grape" tt="none"
            styles={{ root: { cursor: "help" } }}>
            falling-rate law: a MODELLING CHOICE
            {view.notice === null ? " (engine wording unavailable)" : ""}
          </Badge>
        </Tooltip>
      </Group>

      {pane === "Xt" ? (
        <XversusTSvg t={view.t} X={view.X} segments={view.segments} k={k}
          tCrit={view.tCrit} busyOverlay={src === "classroom" && busy} />
      ) : (
        <RversusXSvg X={view.X} R={view.R} segments={view.segments} k={k}
          busyOverlay={src === "classroom" && busy} />
      )}

      {/* What this file computes, it declares (the standing Methods rule). */}
      <Box px={12} pb={8} style={{ flexShrink: 0 }}>
        {pane === "Xt" ? (
          <Text size="xs" c="dimmed">
            X(t) is the dryer&apos;s published column{" "}
            <b>{view.unit}.{X_COLUMN_SUFFIX}</b> against the driver&apos;s own
            {" "}t.  The colour split is the ONE thing computed here: each
            emitted sample is compared with the engine&apos;s X_c using the
            engine&apos;s own strict inequality (X &gt; X_c is constant rate),
            so a sample sitting exactly on X_c is falling-rate here for the
            same reason it is in the solver.
          </Text>
        ) : (
          <Text size="xs" c="dimmed">
            R(X) is the published column <b>{view.unit}.{R_COLUMN_SUFFIX}</b>
            {" "}plotted against <b>{view.unit}.{X_COLUMN_SUFFIX}</b> — the
            same two engine series, one against the other.  Time runs RIGHT
            to LEFT (the tray dries).  The flat stretch sits at R_c; the
            corner is at X_c; the sloping segment heads for R = 0 at X_eq,
            which is where the declared law puts it.
          </Text>
        )}

        {/* The break time — present or absent, always a sentence. */}
        <Text size="xs" c={view.tCrit.present ? "dimmed" : "orange"} mt={2}>
          {view.tCrit.present
            ? `t_critical = ${fmt(view.tCrit.t)} s — ${view.tCrit.note}`
            : `t_critical NOT PUBLISHED — ${view.tCrit.note}`}
        </Text>

        {/* The engine's own words about the law that draws the tail. */}
        <Text size="xs" c="dimmed" mt={2}>
          {view.notice !== null
            ? `Engine, verbatim: ${view.notice}`
            : "The engine's falling-rate sentence could not be read from this "
              + "run's log — it is quoted here when present, and never "
              + "paraphrased when absent."}
        </Text>
      </Box>
    </Box>
  );
}
