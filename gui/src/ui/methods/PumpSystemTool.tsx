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
  PumpSystemTool — the pump curve laid over the system curve, both ENGINE
  numbers, with the operating point read off their crossing.

  SELF-FEEDING (the classroom default): the tool does not wait for the user
  to run a flowsheet.  It runs the ENGINE itself, in the browser, on its own
  witness case — tutorials/steady/hydraulics/pumpSystem01_operating_point —
  through the methodRun foundation (src/case/methodRun.ts): the knob panel's
  values are written textually into the witness dicts (ScalarOverride keeps
  units and comments; it THROWS on a missing or ambiguous key) and the WASM
  choupoSolve solves the full 13-point sweep.  Drag W_shaft and the pump
  curve shifts; "close the valve" (raise L, drop D) and the system curve
  steepens — the operating point walks, every point an engine solve.  The
  sweep's flow window itself stays FIXED at the witness's 0.4..1.6 kmol/s:
  the outerDict declares `range ( 0.4 1.6 );`, a LIST, which the scalar
  override channel cannot rewrite — a v1 limitation the knob panel states
  rather than hides (pinned in tests/pumpSystemTool.test.ts).

  A source toggle "Classroom" | "Current run" appears when the app's own run
  ALSO carries a detectable sweep; the default stays Classroom, and the old
  "run such a case first" empty state survives only under "Current run".

  Feeds: a SweepDriver CSV in the run's csvFiles bag (keys are case-root-
  relative — solverWorker.js walks /case and strips the "/case/" prefix).
  The detector is GENERIC, never a case or unit name: a sweep CSV whose
  header starts "point,streams." activates the tool when its remaining
  columns carry, for some unit prefix U, BOTH "U.dP" and "U.head_m" (the
  pump publishes that pair and nothing else does) and, for some other
  prefix Y, "Y.deltaP" (the pipe train's demand).

  The plane's standing rule is ZERO physics in TypeScript, and this tool
  carries NO closed-form exception at all — no head/pressure conversion, no
  friction formula, no pump law.  The one computation here is method
  GEOMETRY, derived in view and labelled so: linear interpolation of the
  crossing of two engine-published columns between the two bracketing sweep
  points.  The engine computed every point; only the straight line between
  neighbouring points is the view's.  Pa→bar and kmol/s→kmol/h on the axes
  are unit scaling, not physics.  The classroom knobs are the same posture:
  they edit declared dict scalars, the engine computes everything.

  THE HONESTY RULE (the point of the tool): the "pump curve" drawn here is
  whatever the pump MODEL published across the sweep, and it is labelled as
  exactly that.
    * When it FALLS with flow (the witness): it is the constant-shaft-power
      characteristic (fixed W_shaft, η) of the pump model — not a
      manufacturer's tested H(Q) curve.
    * When it is FLAT across the sweep (relative variation below 1e-9): the
      pump was specified by P_out / dP, so the "characteristic" is the
      specification echoed back — drawn greyed and dashed with the caveat
      spelled out; a real pump's pressure rise falls with flow.
  Neither is ever presented as a datasheet curve.

  Charts are inline SVG (the EpsilonNtuTool precedent) — the plotly bundle
  cannot load outside a browser, and the pure helpers here must stay
  importable by the node test runner (tests/pumpSystemTool.test.ts).
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import {
  ActionIcon, Alert, Badge, Box, Collapse, Group, Loader, SegmentedControl,
  Slider, Stack, Table, Text, Tooltip,
} from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";

import type { RunResult } from "../../adapters/SolverAdapter.js";
import { useMethodRun, type ScalarOverride } from "../../case/methodRun.js";
import { methodsToolCollapsedKey } from "../../state/prefs.js";
import { useStore } from "../../state/store.js";
import { useCollapsedFlag } from "./methodsChrome.js";

// ---- Detection: which sweep CSV feeds the tool ------------------------------

export interface PumpSystemSweep {
  /** csvFiles key of the sweep (case-root-relative, e.g. "sweep_x.csv"). */
  file: string;
  /** The swept target path, verbatim from the header (e.g. "streams.feed.F"). */
  target: string;
  /** Unit prefix publishing BOTH .dP and .head_m — the pump. */
  pumpUnit: string;
  /** Unit prefix publishing .deltaP — the pipe/system demand. */
  systemUnit: string;
  /** The swept feed flow, engine canonical basis (kmol/s). */
  F: number[];
  /** The pump's pressure RISE across the sweep, Pa ("<pumpUnit>.dP"). */
  pumpDP: number[];
  /** The system's pressure demand across the sweep, Pa ("<systemUnit>.deltaP"). */
  systemDP: number[];
  /** Every column of the CSV, verbatim, keyed by its header name — the
   *  secondary table (velocity, reynolds, dP_elevation, ...) reads these. */
  columns: { [name: string]: number[] };
}

/** Parse ONE candidate CSV against the sweep contract; null when the text is
 *  not a pump-vs-system sweep — an honest miss, never a guess. */
function parseSweepCsv(file: string, text: string): PumpSystemSweep | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 3) return null; // header + at least two sweep points
  const header = lines[0]!.split(",").map((h) => h.trim());
  if (header.length < 4) return null;
  if (header[0] !== "point" || !header[1]!.startsWith("streams.")) return null;
  const target = header[1]!;
  const rest = header.slice(2);

  const prefixOf = (name: string, suffix: string): string | null =>
    name.endsWith(suffix) && name.length > suffix.length
      ? name.slice(0, -suffix.length) : null;

  // The pump: the ONLY unit kind that publishes .dP and .head_m together.
  let pumpUnit: string | null = null;
  for (const name of rest) {
    const u = prefixOf(name, ".dP");
    if (u !== null && rest.includes(u + ".head_m")) { pumpUnit = u; break; }
  }
  if (pumpUnit === null) return null;

  // The system demand: some OTHER unit's .deltaP.
  let systemUnit: string | null = null;
  for (const name of rest) {
    const y = prefixOf(name, ".deltaP");
    if (y !== null && y !== pumpUnit) { systemUnit = y; break; }
  }
  if (systemUnit === null) return null;

  const columns: { [name: string]: number[] } = {};
  for (const h of header) columns[h] = [];
  for (const line of lines.slice(1)) {
    const f = line.split(",");
    if (f.length !== header.length) continue; // skip a malformed row, never misread it
    const nums = f.map(Number);
    if (nums.some((v) => !Number.isFinite(v))) continue;
    header.forEach((h, i) => columns[h]!.push(nums[i]!));
  }

  const F = columns[target]!;
  if (F.length < 2) return null;
  return {
    file, target, pumpUnit, systemUnit, F,
    pumpDP: columns[pumpUnit + ".dP"]!,
    systemDP: columns[systemUnit + ".deltaP"]!,
    columns,
  };
}

/** Scan the run's csvFiles bag (keys sorted, so the pick is deterministic)
 *  for the first CSV satisfying the sweep contract. */
export function findPumpSystemSweep(
  csvFiles: RunResult["csvFiles"] | undefined,
): PumpSystemSweep | null {
  if (!csvFiles) return null;
  for (const file of Object.keys(csvFiles).sort()) {
    const text = csvFiles[file];
    if (typeof text !== "string") continue;
    const sweep = parseSweepCsv(file, text);
    if (sweep) return sweep;
  }
  return null;
}

// ---- The operating point (derived in view) ----------------------------------

export interface OperatingPoint {
  /** Interpolated crossing flow, engine canonical basis (kmol/s). */
  F: number;
  /** Interpolated crossing pressure (Pa). */
  dP: number;
  /** The two bracketing sweep rows (equal when the crossing sits exactly on
   *  a grid point — then the ENGINE computed the crossing itself). */
  lowerIndex: number;
  upperIndex: number;
}

/** Detect the sign change of (pumpDP − systemDP) along the sweep grid and
 *  linearly interpolate the crossing within the bracketing segment.  This is
 *  the tool's ONE derived-in-view computation: the engine computed every
 *  point, the straight line between two neighbouring points is the view's.
 *  Null when the difference never changes sign — no crossing inside the
 *  swept window, and the tool NEVER extrapolates beyond it. */
export function findOperatingPoint(
  F: number[], pumpDP: number[], systemDP: number[],
): OperatingPoint | null {
  const n = Math.min(F.length, pumpDP.length, systemDP.length);
  for (let i = 0; i < n; ++i) {
    const d0 = pumpDP[i]! - systemDP[i]!;
    if (d0 === 0) {
      // The crossing sits exactly on a sweep point — nothing to interpolate.
      return { F: F[i]!, dP: pumpDP[i]!, lowerIndex: i, upperIndex: i };
    }
    if (i + 1 >= n) break;
    const d1 = pumpDP[i + 1]! - systemDP[i + 1]!;
    if (d0 * d1 < 0) {
      const t = d0 / (d0 - d1);
      return {
        F: F[i]! + t * (F[i + 1]! - F[i]!),
        dP: pumpDP[i]! + t * (pumpDP[i + 1]! - pumpDP[i]!),
        lowerIndex: i,
        upperIndex: i + 1,
      };
    }
  }
  return null;
}

// ---- The honesty classifier -------------------------------------------------

/** Relative variation below this across the whole sweep means the pump
 *  column is FLAT — the run echoed a P_out / dP specification back. */
export const FLAT_REL_TOL = 1.0e-9;

/** What the pump column IS, so the plot can say so:
 *    "flat-by-spec"    the pump was specified by P_out / dP and the sweep
 *                      echoes that specification — not a characteristic;
 *    "constant-power"  the pump model's rise falls with flow — the
 *                      constant-shaft-power characteristic (fixed W_shaft, η),
 *                      still not a manufacturer's tested H(Q) curve. */
export function classifyPumpCharacteristic(
  pumpDP: number[],
): "flat-by-spec" | "constant-power" {
  let lo = Infinity, hi = -Infinity;
  for (const v of pumpDP) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!(hi > -Infinity)) return "flat-by-spec"; // an empty column varies by nothing
  const scale = Math.max(Math.abs(lo), Math.abs(hi));
  if (scale === 0) return "flat-by-spec";
  return (hi - lo) / scale < FLAT_REL_TOL ? "flat-by-spec" : "constant-power";
}

// ---- The standalone classroom feed (methodRun) ------------------------------

/** The witness case, by its bundled-corpus identifier: <category>/<subclass>/
 *  <shortName> (steady is a sub-classed category — the identifier carries the
 *  hydraulics/ segment; verified against tutorialByName in the tests). */
export const PUMP_WITNESS = "steady/hydraulics/pumpSystem01_operating_point";

/** The classroom knobs — each one a declared scalar of the witness's
 *  system/flowsheetDict, edited TEXTUALLY (units and comments survive; the
 *  override throws on a missing or ambiguous key).  Values are in the units
 *  the dict declares (`W_shaft <n> kW;`, lengths in m), because the override
 *  replaces only the NUMBER and the unit word stays. */
export interface PumpSystemKnobs {
  /** Pump shaft power, kW (`W_shaft` — the pump curve's level). */
  W_shaft: number;
  /** Pump efficiency, dimensionless (`eta`). */
  eta: number;
  /** Pipe internal diameter, m (`D` — drop it to "close the valve"). */
  D: number;
  /** Straight pipe length, m (`L` — raise it to "close the valve"). */
  L: number;
  /** Static rise outlet-over-inlet, m (`dz` — the elevation term). */
  dz: number;
}

/** The witness's own authored values — the tool boots on the sealed case,
 *  bit-for-bit, before the student touches anything. */
export const DEFAULT_PUMP_KNOBS: PumpSystemKnobs = {
  W_shaft: 2.0, eta: 0.65, D: 0.1, L: 50.0, dz: 2.0,
};

/** Knob → dict-scalar map.  Every key was verified UNIQUE in its file's raw
 *  text (no `occurrence` needed) — pinned against the real bundled witness in
 *  tests/pumpSystemTool.test.ts.  NOTE the sweep's `range ( 0.4 1.6 );` is a
 *  LIST, which ScalarOverride cannot rewrite — the flow window stays the
 *  witness's for v1, and the knob panel says so. */
export function pumpSystemOverrides(k: PumpSystemKnobs): ScalarOverride[] {
  return [
    { file: "system/flowsheetDict", key: "W_shaft", value: k.W_shaft },
    { file: "system/flowsheetDict", key: "eta", value: k.eta },
    { file: "system/flowsheetDict", key: "D", value: k.D },
    { file: "system/flowsheetDict", key: "L", value: k.L },
    { file: "system/flowsheetDict", key: "dz", value: k.dz },
  ];
}

/** Where the classroom numbers come from, stated verbatim in the UI. */
export const PUMP_PROVENANCE_LINE =
  "Runs tutorials/steady/hydraulics/pumpSystem01_operating_point "
  + "(13-point sweep) with your parameters, in your browser.";

/** localStorage home of the knob-panel fold (persisted across sessions).  The
 *  key is DERIVED from the tool id by the one rule in `state/prefs.ts`; the
 *  name says WHICH fold, because three modules used to export the same name
 *  for three different keys. */
export const PUMP_CONTROLS_COLLAPSED_KEY =
  methodsToolCollapsedKey("pump-system");

// Slider bounds: UI affordances only — the range a classroom drag covers,
// never a physical claim.  The engine judges whatever number arrives.
const KNOB_META: {
  field: keyof PumpSystemKnobs;
  label: string; unit: string; min: number; max: number; step: number;
}[] = [
  { field: "W_shaft", label: "W_shaft (pump shaft power)", unit: "kW",
    min: 0.5, max: 6, step: 0.05 },
  { field: "eta", label: "\u03B7 (pump efficiency)", unit: "",
    min: 0.3, max: 0.9, step: 0.01 },
  { field: "D", label: "D (pipe diameter)", unit: "m",
    min: 0.06, max: 0.16, step: 0.002 },
  { field: "L", label: "L (pipe length)", unit: "m",
    min: 10, max: 200, step: 1 },
  { field: "dz", label: "dz (static rise)", unit: "m",
    min: 0, max: 10, step: 0.25 },
];

// ---- Display-unit scaling (unit scaling only — no physics) ------------------

const PA_TO_BAR = 1.0e-5;          // pressure display: Pa → bar
const KMOLPS_TO_KMOLPH = 3600;     // flow display: kmol/s → kmol/h

// ---- Chart frame (viewBox units, the EpsilonNtuTool conventions) ------------

const FW = 640, FH = 420;
const FX0 = 62, FX1 = 606, FY0 = 16, FY1 = 372;

const GRID = "var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";
const PUMP_COLOR = "#26c6da";      // the kit's cool series — the pump's rise
const PUMP_FLAT_COLOR = "var(--mantine-color-dimmed)"; // greyed: spec echo
const SYSTEM_COLOR = "#ffb74d";    // warm — the system's demand
const POINT_COLOR = "#ff8a65";     // the crossing chip's marker

const fmt = (v: number, d = 4) => Number.isFinite(v) ? v.toPrecision(d) : "—";
const fmtTick = (v: number) => String(Number(v.toPrecision(4)));

// The honesty labels, verbatim on both the chart and the caption.
const CONSTANT_POWER_LABEL =
  "constant-shaft-power characteristic (fixed W_shaft, \u03B7) of the pump "
  + "model \u2014 not a manufacturer's tested H(Q) curve";
const FLAT_BY_SPEC_LABEL =
  "flat line: the P_out / dP specification echoed back across the sweep, "
  + "not a pump characteristic and not a manufacturer's curve \u2014 a real "
  + "pump's pressure rise falls with flow";
const DERIVED_IN_VIEW_LABEL =
  "derived in view by linear interpolation between the two bracketing sweep "
  + "points \u2014 the engine computed every point, the line between them is "
  + "the view's";

// ---- One knob row (a labelled slider — writes a number, computes nothing) ---

function KnobSlider(props: {
  label: string; unit: string; min: number; max: number; step: number;
  value: number; onChange: (v: number) => void;
}): JSX.Element {
  return (
    <Box style={{ flex: 1, minWidth: 150 }}>
      <Group justify="space-between" gap={4} wrap="nowrap">
        <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
          {props.label}
        </Text>
        <Text size="xs" ff="monospace" style={{ whiteSpace: "nowrap" }}>
          {props.value}{props.unit ? ` ${props.unit}` : ""}
        </Text>
      </Group>
      <Slider size="xs" min={props.min} max={props.max} step={props.step}
        value={props.value} onChange={props.onChange} label={null} />
    </Box>
  );
}

// ---- The workspace tool -----------------------------------------------------

export function PumpSystemTool(): JSX.Element {
  // The app's own run — the "Current run" source, when it carries a sweep.
  const appResult = useStore((s) => s.runResult);
  const appSweep = useMemo(
    () => findPumpSystemSweep(appResult?.csvFiles), [appResult]);

  // The classroom knobs + the standalone in-browser engine run.
  const [knobs, setKnobs] = useState<PumpSystemKnobs>(DEFAULT_PUMP_KNOBS);
  const [sourceChoice, setSourceChoice] =
    useState<"classroom" | "current">("classroom");
  // The toggle exists only while the app run carries a detectable sweep;
  // without one the tool is ALWAYS the classroom (its whole point).
  const source: "classroom" | "current" =
    appSweep ? sourceChoice : "classroom";
  const classroom = source === "classroom";

  // One shared, junk-tolerant fold hook instead of a hand-rolled try/catch pair.
  const { collapsed, toggle: toggleCollapsed } =
    useCollapsedFlag(PUMP_CONTROLS_COLLAPSED_KEY);

  const overridesKey = JSON.stringify(knobs);
  const overrides = useMemo(() => pumpSystemOverrides(knobs), [knobs]);
  const { result: methodResult, err, busy } = useMethodRun(
    classroom ? PUMP_WITNESS : null, overrides, overridesKey, "choupoSolve");

  const sweep = useMemo(
    () => classroom ? findPumpSystemSweep(methodResult?.csvFiles) : appSweep,
    [classroom, methodResult, appSweep]);
  const op = useMemo(
    () => sweep ? findOperatingPoint(sweep.F, sweep.pumpDP, sweep.systemDP) : null,
    [sweep]);
  const character = useMemo(
    () => sweep ? classifyPumpCharacteristic(sweep.pumpDP) : null,
    [sweep]);

  // ---- Top chrome: source toggle + the collapsible knob panel ---------------
  const chrome = (
    <Box style={{
      flexShrink: 0, padding: "6px 12px",
      borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
    }}>
      <Group gap="sm" wrap="nowrap" align="center">
        {classroom && (
          <ActionIcon variant="subtle" color="gray" size="sm"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "expand parameter controls"
                                  : "collapse parameter controls"}>
            {collapsed ? <IconChevronRight size={14} />
                       : <IconChevronDown size={14} />}
          </ActionIcon>
        )}
        <Text size="xs" fw={600} style={{ whiteSpace: "nowrap" }}>
          {classroom ? "Classroom parameters" : "Current run"}
        </Text>
        {appSweep && (
          <SegmentedControl size="xs" value={source}
            onChange={(v) =>
              setSourceChoice(v === "current" ? "current" : "classroom")}
            data={[
              { label: "Classroom", value: "classroom" },
              { label: "Current run", value: "current" },
            ]} />
        )}
        <Text size="xs" c="dimmed" style={{
          flex: 1, minWidth: 0, overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {classroom
            ? PUMP_PROVENANCE_LINE
            : "Reading the sweep CSV of the run you launched."}
        </Text>
      </Group>
      {classroom && (
        <Collapse in={!collapsed}>
          <Group gap="md" wrap="wrap" pt={6} align="flex-end">
            {KNOB_META.map((m) => (
              <KnobSlider key={m.field} label={m.label} unit={m.unit}
                min={m.min} max={m.max} step={m.step}
                value={knobs[m.field]}
                onChange={(v) =>
                  setKnobs((k) => ({ ...k, [m.field]: v }))} />
            ))}
          </Group>
          <Text size="xs" c="dimmed" pt={4}>
            Each drag rewrites the declared dict scalar and re-solves the whole
            sweep in the engine — close the valve (raise L, drop D) and watch
            the operating point walk.  The swept flow window itself is fixed at
            the witness&apos;s 0.4–1.6 kmol/s: the outerDict declares{" "}
            <code>range ( 0.4 1.6 );</code>, a list, which the scalar-override
            channel cannot rewrite (v1).
          </Text>
        </Collapse>
      )}
    </Box>
  );

  // ---- Engine errors, verbatim ---------------------------------------------
  const errorAlert = classroom && err ? (
    <Alert color="red" variant="light" mx={12} mt={8} py={6}
      title="The engine did not deliver a sweep">
      <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
        {err}
      </Text>
    </Alert>
  ) : null;

  // ---- Body -----------------------------------------------------------------
  let body: JSX.Element;
  if (sweep && character) {
    const flat = character === "flat-by-spec";

    // Display units (unit scaling only): kmol/s → kmol/h, Pa → bar.
    const Fd = sweep.F.map((v) => v * KMOLPS_TO_KMOLPH);
    const pumpBar = sweep.pumpDP.map((v) => v * PA_TO_BAR);
    const systemBar = sweep.systemDP.map((v) => v * PA_TO_BAR);

    const xLo = Math.min(...Fd), xHi = Math.max(...Fd);
    const yHi = 1.06 * Math.max(...pumpBar, ...systemBar);
    const toX = (f: number) => FX0 + ((FX1 - FX0) * (f - xLo)) / (xHi - xLo || 1);
    const toY = (p: number) => FY1 - ((FY1 - FY0) * p) / (yHi || 1);
    const line = (col: number[]) =>
      col.map((p, i) => `${toX(Fd[i]!).toFixed(2)},${toY(p).toFixed(2)}`).join(" ");

    const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => xLo + f * (xHi - xLo));
    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yHi);

    const opX = op ? toX(op.F * KMOLPS_TO_KMOLPH) : 0;
    const opY = op ? toY(op.dP * PA_TO_BAR) : 0;
    const onGridPoint = op !== null && op.lowerIndex === op.upperIndex;

    // Secondary columns: everything the engine published beyond the two curves.
    const secondaryNames = Object.keys(sweep.columns).filter((n) =>
      n !== "point" && n !== sweep.target
      && n !== sweep.pumpUnit + ".dP" && n !== sweep.systemUnit + ".deltaP");

    body = (
      <>
        {/* Toolbar: what was detected + the operating-point chip. */}
        <Box style={{
          flexShrink: 0, minHeight: 44, padding: "6px 12px",
          overflowX: "auto", overflowY: "hidden",
          borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
        }}>
          <Group gap="sm" wrap="nowrap" align="center" style={{ minWidth: "fit-content" }}>
            <Badge variant="light" color="gray" tt="none" style={{ flexShrink: 0 }}>
              pump {sweep.pumpUnit} · system {sweep.systemUnit} · {sweep.F.length} points
            </Badge>
            <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
              swept: {sweep.target} ({sweep.file})
            </Text>
            {op ? (
              <Tooltip withArrow multiline w={360}
                label={onGridPoint
                  ? "The crossing sits exactly on a sweep point — the engine computed it; nothing was interpolated."
                  : DERIVED_IN_VIEW_LABEL}>
                <Badge color="teal" variant="light" tt="none"
                  styles={{ root: { cursor: "help" } }} style={{ flexShrink: 0 }}>
                  operating point: F* = {fmt(op.F * KMOLPS_TO_KMOLPH)} kmol/h ·
                  {" "}ΔP* = {fmt(op.dP * PA_TO_BAR)} bar
                </Badge>
              </Tooltip>
            ) : (
              <Badge color="orange" variant="light" tt="none" style={{ flexShrink: 0 }}>
                no crossing inside the swept window
              </Badge>
            )}
          </Group>
        </Box>

        {/* The honesty line, stated before the plot. */}
        <Text size="xs" c="dimmed" px={12} py={4} style={{ flexShrink: 0 }}>
          {flat
            ? <>The pump column is flat across the sweep: {FLAT_BY_SPEC_LABEL}.</>
            : <>The falling pump curve is the {CONSTANT_POWER_LABEL}.</>}
          {" "}Axes show bar and kmol/h — unit scaling of the engine&apos;s Pa and
          kmol/s, nothing more.
          {!op && <>
            {" "}The two curves do not cross between F ={" "}
            {fmt(xLo)} and {fmt(xHi)} kmol/h; widen the sweep in the case&apos;s{" "}
            outerDict — this view never extrapolates.
          </>}
        </Text>

        {/* Main row: the chart + the secondary-columns table. */}
        <Box style={{ flex: 1, minHeight: 0, display: "flex", gap: 12,
          padding: "0 12px 8px", overflow: "hidden", position: "relative" }}>
          {/* Busy overlay: a fresh classroom solve is running; the previous
              sweep stays visible underneath. */}
          {classroom && busy && (
            <Box style={{ position: "absolute", inset: 0, zIndex: 5,
              display: "flex", alignItems: "center", justifyContent: "center",
              pointerEvents: "none" }}>
              <Loader size="sm" />
            </Box>
          )}
          {/* ---- Pump vs system, in pressure ---- */}
          <Box style={{ flex: 2, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <Group gap="md" wrap="wrap" py={2} style={{ flexShrink: 0 }}>
              <Group gap={4} wrap="nowrap" align="center">
                <svg width={26} height={8} aria-hidden>
                  <line x1={1} y1={4} x2={25} y2={4}
                    stroke={flat ? PUMP_FLAT_COLOR : PUMP_COLOR} strokeWidth={2}
                    strokeDasharray={flat ? "6 4" : undefined} />
                </svg>
                <Text size="xs" c="dimmed">
                  pump ΔP ({sweep.pumpUnit}){flat ? " — flat by specification" : ""}
                </Text>
              </Group>
              <Group gap={4} wrap="nowrap" align="center">
                <svg width={26} height={8} aria-hidden>
                  <line x1={1} y1={4} x2={25} y2={4} stroke={SYSTEM_COLOR} strokeWidth={2} />
                </svg>
                <Text size="xs" c="dimmed">system demand ({sweep.systemUnit})</Text>
              </Group>
              {op && (
                <Group gap={4} wrap="nowrap" align="center">
                  <svg width={12} height={12} aria-hidden>
                    <circle cx={6} cy={6} r={4} fill={POINT_COLOR} />
                  </svg>
                  <Text size="xs" c="dimmed">
                    operating point{onGridPoint ? " (on a sweep point)" : " (derived in view)"}
                  </Text>
                </Group>
              )}
            </Group>
            <Box style={{ flex: 1, minHeight: 0 }}>
              <svg viewBox={`0 0 ${FW} ${FH}`} width="100%" height="100%"
                preserveAspectRatio="xMidYMid meet"
                role="img" aria-label="pump pressure rise and system pressure demand versus flow">
                {/* grid + axes */}
                {xTicks.map((f) => (
                  <g key={`gx${f}`}>
                    <line x1={toX(f)} y1={FY0} x2={toX(f)} y2={FY1}
                      stroke={GRID} strokeWidth={0.6} />
                    <text x={toX(f)} y={FY1 + 16} textAnchor="middle"
                      fontSize={11} fill={INK}>{fmtTick(f)}</text>
                  </g>
                ))}
                {yTicks.map((p) => (
                  <g key={`gy${p}`}>
                    <line x1={FX0} y1={toY(p)} x2={FX1} y2={toY(p)}
                      stroke={GRID} strokeWidth={p === 0 ? 1.4 : 0.6} />
                    <text x={FX0 - 6} y={toY(p) + 4} textAnchor="end"
                      fontSize={11} fill={INK}>{fmtTick(p)}</text>
                  </g>
                ))}
                <text x={(FX0 + FX1) / 2} y={FH - 6} textAnchor="middle"
                  fontSize={12} fill={INK}>
                  {sweep.target} (kmol/h)
                </text>
                <text x={14} y={(FY0 + FY1) / 2} textAnchor="middle" fontSize={12}
                  fill={INK} transform={`rotate(-90 14 ${(FY0 + FY1) / 2})`}>
                  ΔP (bar)
                </text>

                {/* the engine's two columns */}
                <polyline points={line(pumpBar)} fill="none"
                  stroke={flat ? PUMP_FLAT_COLOR : PUMP_COLOR}
                  strokeWidth={flat ? 1.4 : 2}
                  strokeDasharray={flat ? "6 4" : undefined}
                  opacity={flat ? 0.8 : 1} />
                <polyline points={line(systemBar)} fill="none"
                  stroke={SYSTEM_COLOR} strokeWidth={2} />
                {/* the engine's actual sweep points, so nobody mistakes the
                    polylines for continuous engine output */}
                {pumpBar.map((p, i) => (
                  <circle key={`pp${i}`} cx={toX(Fd[i]!)} cy={toY(p)} r={2.2}
                    fill={flat ? PUMP_FLAT_COLOR : PUMP_COLOR} />
                ))}
                {systemBar.map((p, i) => (
                  <circle key={`sp${i}`} cx={toX(Fd[i]!)} cy={toY(p)} r={2.2}
                    fill={SYSTEM_COLOR} />
                ))}

                {/* the flat-by-spec annotation rides the line itself */}
                {flat && (
                  <text x={(FX0 + FX1) / 2} y={toY(pumpBar[0] ?? 0) - 8}
                    textAnchor="middle" fontSize={10} fill={INK}>
                    specification echoed back — not a pump characteristic
                  </text>
                )}

                {/* the crossing, with guides to both axes */}
                {op && (
                  <g>
                    <line x1={opX} y1={opY} x2={opX} y2={FY1} stroke={POINT_COLOR}
                      strokeWidth={0.8} strokeDasharray="3 3" />
                    <line x1={FX0} y1={opY} x2={opX} y2={opY} stroke={POINT_COLOR}
                      strokeWidth={0.8} strokeDasharray="3 3" />
                    <circle cx={opX} cy={opY} r={5} fill={POINT_COLOR}
                      stroke="var(--mantine-color-body)" strokeWidth={1.5} />
                    <text x={opX + 8} y={opY - 8} fontSize={11} fill={POINT_COLOR}>
                      F* = {fmt(op.F * KMOLPS_TO_KMOLPH)} kmol/h ·
                      {" "}ΔP* = {fmt(op.dP * PA_TO_BAR)} bar
                    </text>
                  </g>
                )}
              </svg>
            </Box>
          </Box>

          {/* ---- Side pane: the engine's secondary columns, verbatim ---- */}
          <Box style={{ flex: 1, minWidth: 240, maxWidth: 380, display: "flex",
            flexDirection: "column",
            borderLeft: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
            paddingLeft: 12 }}>
            <Text size="xs" fw={600} c="dimmed" py={2} style={{ flexShrink: 0 }}>
              The sweep&apos;s other columns — engine numbers, verbatim
            </Text>
            <Box style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
              <Table fz="xs" verticalSpacing={2} horizontalSpacing={6}
                striped withRowBorders={false} stickyHeader>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{sweep.target}</Table.Th>
                    {secondaryNames.map((n) => <Table.Th key={n}>{n}</Table.Th>)}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {sweep.F.map((f, i) => (
                    <Table.Tr key={i}>
                      <Table.Td>{String(f)}</Table.Td>
                      {secondaryNames.map((n) => (
                        <Table.Td key={n}>{String(sweep.columns[n]![i])}</Table.Td>
                      ))}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Box>
          </Box>
        </Box>

        {/* The pedagogy line, under the chart. */}
        <Stack gap={2} px={12} pb={6} style={{ flexShrink: 0 }}>
          <Text size="xs" c="dimmed">
            Every point on both curves is an engine solve of the whole case at
            that feed flow.  The operating point is where the pump&apos;s published
            rise ({sweep.pumpUnit}.dP) meets the pipe train&apos;s published demand
            ({sweep.systemUnit}.deltaP)
            {op && !onGridPoint && <> — {DERIVED_IN_VIEW_LABEL}</>}.
          </Text>
        </Stack>
      </>
    );
  } else if (classroom) {
    // No sweep yet in classroom mode: the engine is (about to be) running, or
    // it refused — the refusal rides the Alert above, verbatim.
    body = (
      <Box style={{ flex: 1, display: "flex", alignItems: "center",
        justifyContent: "center", padding: 24 }}>
        {!err && (
          <Stack align="center" gap={8}>
            <Loader size="sm" />
            <Text size="xs" c="dimmed">
              running choupoSolve on the witness sweep in your browser…
            </Text>
          </Stack>
        )}
      </Box>
    );
  } else {
    // ---- Honest empty state, "Current run" source only: no sweep, no chart.
    body = (
      <Box style={{ flex: 1, display: "flex", alignItems: "center",
        justifyContent: "center", padding: 24 }}>
        <Text size="sm" c="dimmed" ta="center" maw={520}>
          No pump-vs-system sweep in this run.  This tool reads a{" "}
          <b>SweepDriver CSV</b> from an <code>outerDict</code> sweep over{" "}
          <code>streams.&lt;inlet&gt;.F</code> on a case with a pump and a pipe
          train: the header must carry the pump&apos;s <code>&lt;unit&gt;.dP</code>{" "}
          + <code>&lt;unit&gt;.head_m</code> pair and another unit&apos;s{" "}
          <code>&lt;unit&gt;.deltaP</code> demand.  Run such a case — e.g.{" "}
          <code>tutorials/steady/hydraulics/pumpSystem01_operating_point</code>{" "}
          — then return here, or switch back to Classroom.
        </Text>
      </Box>
    );
  }

  return (
    <Box style={{ width: "100%", height: "100%", display: "flex",
      flexDirection: "column", overflow: "hidden" }}>
      {chrome}
      {errorAlert}
      {body}
    </Box>
  );
}
