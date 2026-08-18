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
  MerkelTool — the Merkel cooling-tower diagram: the air-saturation enthalpy
  curve h*(T) above, the operating line below, and the area between them
  shaded — that area IS the enthalpy driving force the Merkel number
  integrates, which is the whole pedagogy of the plot.

  SELF-FEEDING (the Methods-workspace contract): the DEFAULT mode is
  STANDALONE — the tool runs the ENGINE itself, in the browser, on its own
  witness case (tutorials/steady/heat/coolingTower01_merkel, bundled
  identifier "steady/heat/coolingTower01_merkel"), with a compact knob
  panel writing declared dict scalars (hot-water T and flow, ambient-air T,
  moisture and dry-air flow, the packing's Merkel number) through
  methodRun's textual ScalarOverride.  The knobs write NUMBERS into the
  witness dicts; the WASM engine computes everything — an infeasible
  construction (a pinched L/G, a below-wet-bulb target) REFUSES with the
  engine's own named message, shown verbatim: that refusal is the pedagogy.
  When the app's CURRENT run also carries a cooling tower, a source toggle
  offers "Current run" beside the classroom witness.

  Feeds (either source): the coolingTower unit's PUBLISHED profile (xAxis
  "T_K", columns h_operating_kJ_kg + h_saturation_kJ_kg, 41 points spanning
  [T_water_out, T_water_in], markers at both water ends) and its KPI row
  (range_K, approach_K, T_wb_in, merkelNumber, merkelNumber_chebyshev4,
  L_over_G, evaporation_pct_of_L, Q_kW, ...).  Detection is by the COLUMN
  PAIR, never a unit or case name.

  ZERO physics in TypeScript, no exception here: no enthalpy, no humidity,
  no integral is computed in this file.  The tool DRAWS the engine's
  published curves and numbers.  The only computation is axis scaling
  (K → °C on the display axis is unit scaling) and ONE ratio of two
  engine-published KPIs: |merkelNumber_chebyshev4 − merkelNumber| /
  merkelNumber — the CTI Chebyshev-4 hand method held against the engine's
  converged integral.  On the witness that deviation is ~4.3e-5: the hand
  method is nearly exact for smooth curves, and when the deviation is small
  the chip SAYS so instead of manufacturing drama (the Kremser-pattern
  lesson — a classroom method judged against the run, on the run's own
  numbers).

  Charts are inline SVG (the EpsilonNtuTool / PumpSystemTool precedent) —
  the plotly bundle cannot load outside a browser, and the pure helpers
  here (plus the knob→override map, verified against the REAL witness raw
  text) must stay importable by the node test runner
  (tests/merkelTool.test.ts).
\*---------------------------------------------------------------------------*/

import { useCallback, useMemo, useState } from "react";
import {
  Alert, Badge, Box, Group, Loader, SegmentedControl, Select, Text, Tooltip,
} from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";

import type { UnitProfile } from "../../adapters/SolverAdapter.js";
import {
  KnobField, KnobSlider, MethodSetupRail, PanelNote,
} from "./knobPanel.js";
import { useMethodRun, type ScalarOverride } from "../../case/methodRun.js";
import { useStore } from "../../state/store.js";

// ---- Detection: which units feed the tool -----------------------------------

/** The column pair that IS the Merkel diagram — the coolingTower unit
 *  publishes both on every solve, and nothing else does. */
export const OPERATING_COLUMN = "h_operating_kJ_kg";
export const SATURATION_COLUMN = "h_saturation_kJ_kg";

export type KpiRow = { [key: string]: number };
export type KpiMap = { [unitName: string]: KpiRow };

export interface MerkelUnit {
  unit: string;
  profile: UnitProfile;
  /** The unit's KPI row when the run carries one — absent rows stay absent,
   *  the diagram still draws and the chips show honest dashes. */
  kpis?: KpiRow;
}

/** Units whose profile carries BOTH enthalpy columns (plus its own xAxis
 *  column, equal length ≥ 2) — the cooling towers of the solved case.
 *  Never a unit-name match: the columns are the contract. */
export function findMerkelUnits(
  profiles: UnitProfile[] | undefined,
  kpis: KpiMap | undefined,
): MerkelUnit[] {
  if (!profiles) return [];
  const out: MerkelUnit[] = [];
  for (const p of profiles) {
    const T = p.columns[p.xAxis];
    const op = p.columns[OPERATING_COLUMN];
    const sat = p.columns[SATURATION_COLUMN];
    if (!T || !op || !sat) continue;
    if (T.length < 2 || op.length !== T.length || sat.length !== T.length) continue;
    const row = kpis?.[p.unit];
    out.push(row ? { unit: p.unit, profile: p, kpis: row } : { unit: p.unit, profile: p });
  }
  return out.sort((a, b) => a.unit.localeCompare(b.unit));
}

// ---- The hand-method check (the ONE allowed KPI arithmetic) -----------------

/** Below this relative deviation the CTI Chebyshev-4 hand method reproduced
 *  the engine's converged integral — the chip says "nearly exact" rather
 *  than manufacturing drama. */
export const NEARLY_EXACT_TOL = 1.0e-3;

export interface ChebyshevCheck {
  /** The engine's converged Merkel integral (KPI "merkelNumber"). */
  merkel: number;
  /** The engine's CTI Chebyshev-4 evaluation (KPI "merkelNumber_chebyshev4"). */
  chebyshev4: number;
  /** |chebyshev4 − merkel| / merkel — a ratio of two engine-published KPIs,
   *  the only computation this tool owns beyond axis scaling. */
  relDeviation: number;
  nearlyExact: boolean;
}

/** Both operands are engine-published KPIs; the tool computes nothing but
 *  their relative deviation.  Null when either KPI is missing/non-finite or
 *  the converged integral is zero — an honest absence, never a guess. */
export function chebyshevDeviation(kpis: KpiRow | undefined): ChebyshevCheck | null {
  if (!kpis) return null;
  const merkel = kpis["merkelNumber"];
  const chebyshev4 = kpis["merkelNumber_chebyshev4"];
  if (merkel === undefined || chebyshev4 === undefined) return null;
  if (!Number.isFinite(merkel) || !Number.isFinite(chebyshev4) || merkel === 0) return null;
  const relDeviation = Math.abs(chebyshev4 - merkel) / Math.abs(merkel);
  return { merkel, chebyshev4, relDeviation, nearlyExact: relDeviation < NEARLY_EXACT_TOL };
}

// ---- Display-unit scaling (unit scaling only — no physics) ------------------

/** K → °C on the display axis.  Exported so the test can pin that the tool's
 *  axis transform is unit scaling and nothing more. */
export const kelvinToC = (T_K: number): number => T_K - 273.15;

// ---- The classroom witness + its knob→dict map ------------------------------
// The STANDALONE feed: the tool clones this bundled tutorial, writes the knob
// values into its declared dict scalars (methodRun's textual override — units
// and comments survive), and runs choupoSolve in the browser.  Each knob names
// the FILE and dict KEY it writes; the defaults ARE the witness's authored
// values, and the test suite verifies every (file, key) resolves uniquely
// against the real bundled raw text — a knob that misses its dict would run
// the engine on the wrong question.

/** Bundled identifier of the witness case ("<category>/<subclass>/<case>" —
 *  steady is a sub-classed category, so the `heat` segment is part of it). */
export const MERKEL_WITNESS = "steady/heat/coolingTower01_merkel";

export interface MerkelKnob {
  /** Stable id — the key of the knob-value state bag. */
  id: string;
  /** What the student reads beside the control. */
  label: string;
  /** Witness file the knob writes into (e.g. "0/hotWater"). */
  file: string;
  /** The dict key as written there (e.g. "T", "water", "merkelNumber"). */
  key: string;
  /** The witness's own authored value — the classroom default. */
  def: number;
  min: number;
  max: number;
  step: number;
  /** The unit the dict declares.  The knob writes the NUMBER only; the
   *  unit word in the dict survives the override untouched.  "" for the
   *  dimensionless Merkel number. */
  unit: string;
}

export const MERKEL_KNOBS: readonly MerkelKnob[] = [
  { id: "hotWaterT", label: "hot water in T", file: "0/hotWater", key: "T",
    def: 318.15, min: 303.15, max: 343.15, step: 0.5, unit: "K" },
  { id: "waterFlow", label: "water flow L", file: "0/hotWater", key: "water",
    def: 100, min: 10, max: 300, step: 5, unit: "kmol/h" },
  { id: "airT", label: "air in T", file: "0/air", key: "T",
    def: 298.15, min: 273.15, max: 313.15, step: 0.5, unit: "K" },
  { id: "airMoisture", label: "air moisture (humidity)", file: "0/air", key: "water",
    def: 1.3, min: 0, max: 5, step: 0.1, unit: "kmol/h" },
  { id: "dryAirFlow", label: "dry air flow G", file: "0/air", key: "N2",
    def: 65, min: 20, max: 200, step: 5, unit: "kmol/h" },
  { id: "merkelNumber", label: "Merkel number KaV/L", file: "system/flowsheetDict",
    key: "merkelNumber", def: 1.5, min: 0.2, max: 5, step: 0.05, unit: "" },
];

export type MerkelKnobValues = { [id: string]: number };

/** The witness's authored values — the classroom baseline. */
export function defaultKnobValues(): MerkelKnobValues {
  const out: MerkelKnobValues = {};
  for (const k of MERKEL_KNOBS) out[k.id] = k.def;
  return out;
}

/** Knob values → methodRun ScalarOverrides.  Non-finite values are dropped
 *  (that knob keeps the witness's authored number) — never written as NaN. */
export function knobOverrides(values: MerkelKnobValues): ScalarOverride[] {
  const out: ScalarOverride[] = [];
  for (const k of MERKEL_KNOBS) {
    const v = values[k.id];
    if (v !== undefined && Number.isFinite(v))
      out.push({ file: k.file, key: k.key, value: v });
  }
  return out;
}

// The provenance line, stated where the knobs are.
const PROVENANCE =
  "Runs tutorials/steady/heat/coolingTower01_merkel with your parameters, "
  + "in your browser.";

// ---- Chart frame (viewBox units, the sibling tools' conventions) ------------

const FW = 640, FH = 420;
const FX0 = 62, FX1 = 606, FY0 = 16, FY1 = 372;

const GRID = "var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";
const SAT_COLOR = "#ffb74d";      // warm — the saturation curve h*(T) above
const OP_COLOR = "#26c6da";       // cool — the operating line below
const AREA_COLOR = "#26c6da";     // the shaded driving force (light fill)
const FLOOR_COLOR = "#ff8a65";    // the T_wb thermodynamic-floor tick
const MARKER_COLOR = "var(--mantine-color-dimmed)";

const fmt = (v: number | undefined, d = 4) =>
  v !== undefined && Number.isFinite(v) ? v.toPrecision(d) : "—";
const fmtTick = (v: number) => String(Number(v.toPrecision(4)));

// The engine's own announcement, quoted — the tool asserts none of it.
const METHOD_HYPOTHESES =
  "Lewis = 1 · L constant inside the integral (loss reported) · saturated "
  + "exit air — the engine announces these on every solve.";

// ---- The workspace tool -----------------------------------------------------

export function MerkelTool(): JSX.Element {
  // The app's CURRENT run — the secondary source, offered only when it
  // carries a tower.
  const result = useStore((s) => s.runResult);
  const currentUnits = useMemo(
    () => findMerkelUnits(result?.profiles, result?.kpis),
    [result]);

  // Source: the self-fed classroom witness (DEFAULT) vs the current run.
  // The toggle appears once the current run carries a tower, and stays while
  // the user is on "Current run" so they can always come back.
  const [source, setSource] = useState<"classroom" | "current">("classroom");
  const mode = source;
  const showToggle = currentUnits.length > 0 || source === "current";

  // The classroom knobs (defaults = the witness's authored values) and the
  // collapsible panel state, persisted per browser.
  const [knobs, setKnobs] = useState<MerkelKnobValues>(defaultKnobValues);
  const overridesKey = useMemo(() => JSON.stringify(knobs), [knobs]);
  const overrides = useMemo(() => knobOverrides(knobs), [knobs]);
  const setKnob = useCallback((id: string, v: number) => {
    setKnobs((s) => ({ ...s, [id]: v }));
  }, []);
  /* The fold and the width are the panel's (ui/methods/knobPanel.tsx).  This
   * tool used to carry its own try/catch pair around localStorage — the fourth
   * hand-rolled copy of a posture the state layer already owned. */

  // The self-run: debounced in-browser choupoSolve on the parameterized
  // witness.  Witness null in "Current run" mode — no engine run there.
  const { result: classroomResult, err, busy } = useMethodRun(
    mode === "classroom" ? MERKEL_WITNESS : null,
    overrides, overridesKey, "choupoSolve");
  const classroomUnits = useMemo(
    () => findMerkelUnits(classroomResult?.profiles, classroomResult?.kpis),
    [classroomResult]);

  const units = mode === "classroom" ? classroomUnits : currentUnits;
  const [picked, setPicked] = useState<string | null>(null);
  const active = (picked && units.find((u) => u.unit === picked)) || units[0];

  const check = useMemo(
    () => chebyshevDeviation(active?.kpis), [active]);

  const sourceToggle = showToggle ? (
    <SegmentedControl size="xs" value={mode} fullWidth
      onChange={(v) => setSource(v as "classroom" | "current")}
      data={[
        { label: "Classroom", value: "classroom" },
        { label: "Current run", value: "current" },
      ]} />
  ) : null;

  /* The setup panel's content: the source, the tower picker, the knobs and the
     provenance.  The chips stay in the content column beside the diagram —
     inputs left, published numbers right. */
  const setup = (
    <>
      {sourceToggle}
      {active && units.length > 1 && (
        <KnobField label="tower">
          <Select size="xs" data={units.map((u) => u.unit)} value={active.unit}
            w="100%" onChange={(v) => setPicked(v)} allowDeselect={false} />
        </KnobField>
      )}
      {mode === "classroom" && (
        <>
          {busy && (
            <Group gap={6} wrap="nowrap" align="center">
              <Loader size="xs" />
              <Text size="xs" c="dimmed">re-solving the tower…</Text>
            </Group>
          )}
          {MERKEL_KNOBS.map((k) => (
            <KnobSlider key={k.id} knob={k} value={knobs[k.id] ?? k.def}
              onChange={(v) => setKnob(k.id, v)} />
          ))}
          <PanelNote>{PROVENANCE}</PanelNote>
        </>
      )}
    </>
  );

  // ---- Honest empty state — only inside "Current run" mode: no tower
  // profile in the app's run, no diagram (the classroom source never needs
  // one, it feeds itself). ----------------------------------------------------
  if (mode === "current" && !active) {
    return (
      <MethodSetupRail title="classroom parameters" setup={setup}>
        <Box style={{ flex: 1, display: "flex", alignItems: "center",
          justifyContent: "center", padding: 24 }}>
          <Text size="sm" c="dimmed" ta="center" maw={520}>
            No cooling-tower profile in this run.  The Merkel diagram activates
            when a solved unit publishes a profile carrying both{" "}
            <b>{OPERATING_COLUMN}</b> and <b>{SATURATION_COLUMN}</b> columns —
            run a case with a <b>coolingTower</b> unit first, e.g.{" "}
            <code>tutorials/steady/heat/coolingTower01_merkel</code>, then
            return here.
          </Text>
        </Box>
      </MethodSetupRail>
    );
  }

  return (
    <MethodSetupRail title="classroom parameters" setup={setup}>
      {/* The published numbers: the KPI line and the hand-method cross-check.
          They report, so they stay beside the diagram, never in the panel. */}
      <Box style={{
        flexShrink: 0, padding: "6px 12px",
        borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
      }}>
        <Group gap="sm" wrap="wrap" align="center">
          {active && (
            <Text size="xs" c="dimmed">
              {active.unit}
              {" "}· range {fmt(active.kpis?.["range_K"])} K
              {" "}· approach {fmt(active.kpis?.["approach_K"])} K (over T_wb)
              {" "}· Me {fmt(active.kpis?.["merkelNumber"])}
              {" "}· L/G {fmt(active.kpis?.["L_over_G"])}
              {" "}· evaporation {fmt(active.kpis?.["evaporation_pct_of_L"], 3)} % of L (= make-up)
              {" "}· Q {fmt(active.kpis?.["Q_kW"])} kW
            </Text>
          )}
          {check && (
            <Tooltip withArrow multiline w={380}
              label={"Both operands are engine-published KPIs: the converged "
                + `integral Me = ${fmt(check.merkel, 8)} and the CTI Chebyshev-4 `
                + `evaluation ${fmt(check.chebyshev4, 8)}.  The tool computes only `
                + "their relative deviation — no integral is evaluated in the GUI."}>
              <Badge color={check.nearlyExact ? "teal" : "orange"} variant="light"
                tt="none" styles={{ root: { cursor: "help" } }}
                style={{ flexShrink: 0 }}>
                CTI Chebyshev-4 vs converged integral:
                {" "}Δ = {check.relDeviation.toExponential(2)}
                {check.nearlyExact && " — the hand method is nearly exact for smooth curves"}
              </Badge>
            </Tooltip>
          )}
        </Group>
      </Box>

      {/* The engine's refusal, verbatim — a pinched L/G or a below-wet-bulb
          construction refuses with a named message, and that refusal IS the
          pedagogy.  Nothing is rephrased. */}
      {mode === "classroom" && err && (
        <Alert color="orange" variant="light" m={12} py={8}
          icon={<IconAlertTriangle size={16} />}
          title="The engine did not solve this construction"
          style={{ flexShrink: 0 }}>
          <Text size="xs" style={{ whiteSpace: "pre-wrap" }}>{err}</Text>
        </Alert>
      )}

      {active ? (
        <MerkelDiagram active={active}
          busyOverlay={mode === "classroom" && busy} />
      ) : mode === "classroom" && !err ? (
        <Box style={{ flex: 1, display: "flex", alignItems: "center",
          justifyContent: "center", gap: 8 }}>
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            running coolingTower01_merkel in your browser…
          </Text>
        </Box>
      ) : null}
    </MethodSetupRail>
  );
}

// ---- The diagram (either source; the rendering path is unchanged) -----------

function MerkelDiagram({ active, busyOverlay }: {
  active: MerkelUnit;
  /** A newer classroom run is in flight: keep the last diagram visible and
   *  overlay a loader — never a blank. */
  busyOverlay: boolean;
}): JSX.Element {
  const { profile, kpis } = active;
  const T_K = profile.columns[profile.xAxis]!;
  const hOp = profile.columns[OPERATING_COLUMN]!;
  const hSat = profile.columns[SATURATION_COLUMN]!;
  const n = T_K.length;

  // Display axis: °C (unit scaling of the engine's Kelvin, nothing more).
  const Tc = T_K.map(kelvinToC);
  const tWb = kpis?.["T_wb_in"];
  const tWbC = tWb !== undefined && Number.isFinite(tWb) ? kelvinToC(tWb) : undefined;

  // The x-domain includes the T_wb floor when the KPI carries it, so the
  // approach gap is VISIBLE — the water-out end stops short of the floor.
  const xLoData = Math.min(Tc[0]!, Tc[n - 1]!);
  const xHiData = Math.max(Tc[0]!, Tc[n - 1]!);
  const xLo = (tWbC !== undefined ? Math.min(tWbC, xLoData) : xLoData) - 1;
  const xHi = xHiData + 1;
  const yLoData = Math.min(...hOp, ...hSat);
  const yHiData = Math.max(...hOp, ...hSat);
  const yPad = 0.06 * (yHiData - yLoData || 1);
  const yLo = yLoData - yPad, yHi = yHiData + yPad;

  const toX = (t: number) => FX0 + ((FX1 - FX0) * (t - xLo)) / (xHi - xLo || 1);
  const toY = (h: number) => FY1 - ((FY1 - FY0) * (h - yLo)) / (yHi - yLo || 1);
  const line = (col: number[]) =>
    col.map((h, i) => `${toX(Tc[i]!).toFixed(2)},${toY(h).toFixed(2)}`).join(" ");

  // The shaded driving force: saturation curve forward, operating line back.
  const areaPoints =
    hSat.map((h, i) => `${toX(Tc[i]!).toFixed(2)},${toY(h).toFixed(2)}`)
      .concat([...hOp].map((h, i) => ({ h, i })).reverse()
        .map(({ h, i }) => `${toX(Tc[i]!).toFixed(2)},${toY(h).toFixed(2)}`))
      .join(" ");

  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => xLo + f * (xHi - xLo));
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => yLo + f * (yHi - yLo));

  return (
    <>
      {/* The pedagogy line, stated before the plot. */}
      <Text size="xs" c="dimmed" px={12} py={4} style={{ flexShrink: 0 }}>
        Both curves are the engine&apos;s published profile ({n} points).  The
        shaded band between h*(T) and the operating line IS the enthalpy
        driving force the Merkel number integrates; the water can at best
        reach T_wb — the thermodynamic floor the approach is measured over.
        The °C axis is unit scaling of the engine&apos;s Kelvin, nothing more.
      </Text>

      {/* ---- The Merkel diagram ---- */}
      <Box style={{ flex: 1, minHeight: 0, display: "flex",
        flexDirection: "column", padding: "0 12px 4px", overflow: "hidden" }}>
        <Group gap="md" wrap="wrap" py={2} style={{ flexShrink: 0 }}>
          <Group gap={4} wrap="nowrap" align="center">
            <svg width={26} height={8} aria-hidden>
              <line x1={1} y1={4} x2={25} y2={4} stroke={SAT_COLOR} strokeWidth={2} />
            </svg>
            <Text size="xs" c="dimmed">h*(T) — saturated air at the water T</Text>
          </Group>
          <Group gap={4} wrap="nowrap" align="center">
            <svg width={26} height={8} aria-hidden>
              <line x1={1} y1={4} x2={25} y2={4} stroke={OP_COLOR} strokeWidth={2} />
            </svg>
            <Text size="xs" c="dimmed">operating line — bulk air enthalpy</Text>
          </Group>
          <Group gap={4} wrap="nowrap" align="center">
            <svg width={14} height={12} aria-hidden>
              <rect x={1} y={2} width={12} height={8} fill={AREA_COLOR} opacity={0.15} />
            </svg>
            <Text size="xs" c="dimmed">the driving force (shaded)</Text>
          </Group>
          {tWbC !== undefined && (
            <Group gap={4} wrap="nowrap" align="center">
              <svg width={26} height={8} aria-hidden>
                <line x1={1} y1={4} x2={25} y2={4} stroke={FLOOR_COLOR}
                  strokeWidth={1.4} strokeDasharray="3 3" />
              </svg>
              <Text size="xs" c="dimmed">T_wb,in — the thermodynamic floor</Text>
            </Group>
          )}
        </Group>
        <Box style={{ flex: 1, minHeight: 0, position: "relative" }}>
          {busyOverlay && (
            <Box style={{ position: "absolute", inset: 0, display: "flex",
              alignItems: "center", justifyContent: "center", zIndex: 1,
              background: "light-dark(rgba(255,255,255,0.5), rgba(0,0,0,0.35))" }}>
              <Loader size="sm" />
            </Box>
          )}
          <svg viewBox={`0 0 ${FW} ${FH}`} width="100%" height="100%"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Merkel diagram: air enthalpy versus water temperature">
            {/* grid + axes */}
            {xTicks.map((t) => (
              <g key={`gx${t}`}>
                <line x1={toX(t)} y1={FY0} x2={toX(t)} y2={FY1}
                  stroke={GRID} strokeWidth={0.6} />
                <text x={toX(t)} y={FY1 + 16} textAnchor="middle"
                  fontSize={11} fill={INK}>{fmtTick(t)}</text>
              </g>
            ))}
            {yTicks.map((h) => (
              <g key={`gy${h}`}>
                <line x1={FX0} y1={toY(h)} x2={FX1} y2={toY(h)}
                  stroke={GRID} strokeWidth={0.6} />
                <text x={FX0 - 6} y={toY(h) + 4} textAnchor="end"
                  fontSize={11} fill={INK}>{fmtTick(h)}</text>
              </g>
            ))}
            <text x={(FX0 + FX1) / 2} y={FH - 6} textAnchor="middle"
              fontSize={12} fill={INK}>water temperature (°C)</text>
            <text x={14} y={(FY0 + FY1) / 2} textAnchor="middle" fontSize={12}
              fill={INK} transform={`rotate(-90 14 ${(FY0 + FY1) / 2})`}>
              h (kJ/kg dry air)
            </text>

            {/* the shaded driving force, UNDER the curves */}
            <polygon points={areaPoints} fill={AREA_COLOR} opacity={0.15}
              stroke="none" />

            {/* the engine's two curves */}
            <polyline points={line(hSat)} fill="none" stroke={SAT_COLOR}
              strokeWidth={2} />
            <polyline points={line(hOp)} fill="none" stroke={OP_COLOR}
              strokeWidth={2} />
            <text x={toX(Tc[n - 1]!) - 6} y={toY(hSat[n - 1]!) + 14}
              textAnchor="end" fontSize={10} fill={SAT_COLOR}>h*(T)</text>
            <text x={toX(Tc[n - 1]!) - 6} y={toY(hOp[n - 1]!) - 8}
              textAnchor="end" fontSize={10} fill={OP_COLOR}>operating</text>

            {/* the profile markers, verbatim (water in / water out) */}
            {(profile.markers ?? []).map((m, i) => (
              <g key={`mk${i}`}>
                <line x1={toX(kelvinToC(m.x))} y1={FY0 + 10}
                  x2={toX(kelvinToC(m.x))} y2={FY1}
                  stroke={MARKER_COLOR} strokeWidth={0.8} strokeDasharray="4 3" />
                <text x={toX(kelvinToC(m.x)) + 4} y={FY0 + 20}
                  fontSize={10} fill={INK}>{m.label}</text>
              </g>
            ))}

            {/* the T_wb thermodynamic floor, from the KPI row */}
            {tWbC !== undefined && (
              <g>
                <line x1={toX(tWbC)} y1={FY0 + 10} x2={toX(tWbC)} y2={FY1}
                  stroke={FLOOR_COLOR} strokeWidth={1.4} strokeDasharray="3 3" />
                <line x1={toX(tWbC) - 6} y1={FY1} x2={toX(tWbC) + 6} y2={FY1}
                  stroke={FLOOR_COLOR} strokeWidth={2.5} />
                <text x={toX(tWbC) + 4} y={FY1 - 8} fontSize={10}
                  fill={FLOOR_COLOR}>
                  T_wb,in = {fmt(tWbC, 4)} °C — thermodynamic floor
                </text>
              </g>
            )}
          </svg>
        </Box>
      </Box>

      {/* The engine's method hypotheses, quoted — never asserted here. */}
      <Text size="xs" c="dimmed" px={12} pb={6} style={{ flexShrink: 0 }}>
        {METHOD_HYPOTHESES}
      </Text>
    </>
  );
}
