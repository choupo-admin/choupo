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
  BreakthroughTool — the adsorption-breakthrough method construction for the
  Methods workspace (the registry's "breakthrough" entry).

  SELF-FEEDING (the classroom default): the tool no longer waits for the user
  to run a flowsheet.  It clones its bundled WITNESS case
  (tutorials/batch/adsorber/batch13_breakthrough_co2 — 15% CO2 in He on a
  zeolite-13X fixed bed), writes the classroom knobs into the witness's own
  declared dict scalars (methodRun's textual override — units and comments
  survive; a knob that misses its dict THROWS), and runs choupoBatch in the
  browser (WASM).  When the app's CURRENT run also carries a trajectory, a
  source toggle offers "Current run" beside the classroom witness; the old
  honest empty state lives only there.

  ZERO physics in TypeScript — the standing Methods rule.  Everything drawn
  here is ENGINE-EMITTED:

      the curve        result.trajectory columns  <unit>.c_out_<i> / .y_out_<i>
      the front        KPIs t_breakthrough_5pct_<i> / t_50_<i> /
                       t_breakthrough_95pct_<i> / t_stoichiometric_<i>
      the table        retention_factor_<i>, qbar_<i>_final,
                       c_out_over_cin_final_<i>
      the caption      Pe, t_end

  Nothing is re-derived: the three percentage crossings and the stoichiometric
  front come off the KPI block verbatim; the ideal square wave is pure GEOMETRY
  over the KPI t_st (a step, two horizontal segments); the only arithmetic is
  the display normalisation c/c_in, and its anchor c_in is taken FROM THE RUN
  ITSELF — the late plateau via the engine's c_out_over_cin_final_<i> KPI.
  When that KPI is absent the curve is drawn unnormalised and the caption says
  so: c_in is never invented.  The knobs turn declared dict scalars only; the
  engine recomputes q*, R_f, t_st and the whole front itself on every run.

  Activation is a predicate over the run (either source): the trajectory must
  carry outlet columns (c_out_/y_out_) AND some unit's KPIs must carry a
  t_stoichiometric_* key.  A holdup-only adsorber run (batch09: n_/q_/p_
  columns, no outlet history) does NOT activate — there is no breakthrough
  curve to draw, and drawing the inventory instead would be a different plot
  wearing this one's name.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import {
  ActionIcon, Alert, Box, Collapse, Group, Loader, NumberInput,
  SegmentedControl, Stack, Switch, Table, Text,
} from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";

import type { TrajectoryData } from "../../adapters/SolverAdapter.js";
import { useMethodRun, type ScalarOverride } from "../../case/methodRun.js";
import { useStore } from "../../state/store.js";
import { useCollapsedFlag } from "./methodsChrome.js";
import {
  TrajectoryPlot, type EventMarker, type GhostTrace,
} from "../plotting/TrajectoryPlot.js";
import { PLOT_COLORS } from "../plotting/plotly.js";

/** Per-unit KPI block as the adapter delivers it (RunResult.kpis[unit]). */
export type UnitKpis = { [key: string]: number };
export type KpiMap = { [unitName: string]: UnitKpis };

// ---- Activation -------------------------------------------------------------
// A predicate over the two engine surfaces the tool reads, exported for the
// test to exercise against the real column-header shapes (batch13 activates,
// batch09 must not — it tracks bed holdup, not the outlet).

/** Trajectory columns that carry an outlet history: <unit>.c_out_<i> etc. */
const OUTLET_RE = /\.(c_out|y_out)_/;
/** KPI keys that carry the engine's stoichiometric front per component. */
const STOICH_RE = /^t_stoichiometric_(.+)$/;
/** Thermal-overlay columns a wall-cooled run adds (batch22). */
const THERMAL_RE = /\.(T_out|T_max)$/;

export interface BreakthroughActivation {
  active: boolean;
  /** The fixed-bed unit whose KPIs carry the front construction. */
  unit: string | null;
  /** Front components <i>, read off the t_stoichiometric_<i> KPI keys. */
  components: string[];
  /** One outlet column per front component (c_out_ preferred over y_out_). */
  outletColumns: string[];
  /** true when every plotted column is a concentration (c_out_ family) —
   *  the only family the c/c_in normalisation anchor applies to. */
  concentrationBasis: boolean;
  /** The unit's thermal columns (T_out/T_max), empty on an isothermal run. */
  thermalColumns: string[];
}

const INACTIVE: BreakthroughActivation = {
  active: false, unit: null, components: [], outletColumns: [],
  concentrationBasis: false, thermalColumns: [],
};

/**
 * Decide whether the run feeds this tool.  `columns` are the trajectory's
 * column names (Object.keys(trajectory.vars); a stray "t" is harmless — it
 * matches nothing).  Both conditions must hold on the SAME unit: outlet
 * columns in the trajectory AND a t_stoichiometric_* key in that unit's KPIs.
 */
export function detectBreakthrough(
  columns: string[],
  kpis: KpiMap | undefined,
): BreakthroughActivation {
  if (!kpis || !columns.some((c) => OUTLET_RE.test(c))) return INACTIVE;

  for (const [unit, block] of Object.entries(kpis)) {
    const components = Object.keys(block)
      .map((k) => STOICH_RE.exec(k)?.[1])
      .filter((c): c is string => c !== undefined);
    if (components.length === 0) continue;

    // One column per front component, the concentration family first.
    const outletColumns: string[] = [];
    let allConcentration = true;
    for (const comp of components) {
      const cCol = `${unit}.c_out_${comp}`;
      const yCol = `${unit}.y_out_${comp}`;
      if (columns.includes(cCol)) outletColumns.push(cCol);
      else if (columns.includes(yCol)) {
        outletColumns.push(yCol);
        allConcentration = false;
      }
    }
    if (outletColumns.length === 0) continue;

    return {
      active: true, unit, components, outletColumns,
      concentrationBasis: allConcentration,
      thermalColumns: columns.filter(
        (c) => c.startsWith(`${unit}.`) && THERMAL_RE.test(c)),
    };
  }
  return INACTIVE;
}

// ---- The KPI-emitted front markers -----------------------------------------
// All four verbatim from the unit's KPI block; a missing key is null (drawn as
// nothing), never re-derived from the curve.

export interface FrontMarkers {
  t5: number | null;
  t50: number | null;
  t95: number | null;
  tStoich: number | null;
}

export function extractFrontMarkers(
  unitKpis: UnitKpis | undefined,
  component: string,
): FrontMarkers {
  const read = (key: string): number | null => {
    const v = unitKpis?.[key];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  return {
    t5: read(`t_breakthrough_5pct_${component}`),
    t50: read(`t_50_${component}`),
    t95: read(`t_breakthrough_95pct_${component}`),
    tStoich: read(`t_stoichiometric_${component}`),
  };
}

// ---- The normalisation decision --------------------------------------------
// c/c_in is drawn ONLY when c_in is anchored by the run itself: the outlet's
// late plateau (last sample of c_out_<i>) divided by the engine's
// c_out_over_cin_final_<i> KPI.  Missing KPI, or a plateau the anchor cannot
// divide through (zero / non-finite), means UNNORMALISED — and the caption
// carries which of the two was used.  c_in is never invented.

export interface NormalisationDecision {
  /** Per-component c_in when every front component is anchored; null => raw. */
  cIn: { [component: string]: number } | null;
  /** Stated under the plot: which anchor was used, or why none. */
  caption: string;
}

export function decideNormalisation(
  unitKpis: UnitKpis | undefined,
  components: string[],
  lastOutlet: { [component: string]: number },
): NormalisationDecision {
  const cIn: { [component: string]: number } = {};
  const unanchored: string[] = [];
  for (const comp of components) {
    const ratio = unitKpis?.[`c_out_over_cin_final_${comp}`];
    const plateau = lastOutlet[comp];
    if (
      typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0 &&
      typeof plateau === "number" && Number.isFinite(plateau) && plateau > 0
    ) {
      cIn[comp] = plateau / ratio;
    } else {
      unanchored.push(comp);
    }
  }
  if (components.length > 0 && unanchored.length === 0) {
    return {
      cIn,
      caption: "Normalised to c/c_in — c_in anchored by the run's own late "
        + "plateau via the engine KPI c_out_over_cin_final.",
    };
  }
  return {
    cIn: null,
    caption: `Unnormalised outlet history — no engine anchor for c_in (`
      + `c_out_over_cin_final missing or plateau unusable for: `
      + `${unanchored.join(", ") || "all components"}); c_in is never invented.`,
  };
}

// ---- The ideal square wave --------------------------------------------------
// Pure geometry over the KPI t_st: a step from 0 to the plateau at
// t_stoichiometric.  The area between it and the real curve is the front
// spreading — what the caption attributes to Pe and heat effects.

export function idealSquareWave(
  tStoich: number, t0: number, tEnd: number, plateau: number,
): { t: number[]; y: number[] } {
  return { t: [t0, tStoich, tStoich, tEnd], y: [0, 0, plateau, plateau] };
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
// Two candidate knobs are deliberately ABSENT, and why is worth recording:
//   * feed composition — the witness declares it as a one-line inline block
//     (`feed { molarComposition { CO2 0.15; He 0.85; } }`), which the
//     line-anchored `key value [unit];` override grammar cannot address (and
//     two fractions constrained to sum to 1 are not one scalar knob anyway);
//   * the LDF coefficient k — declared with bracket dimensions
//     (`CO2 [0 0 -1 0 0] 0.05;`), a form the same grammar does not parse.
// Both would need a methodRun grammar extension, not a workaround here.

/** Bundled identifier of the witness case ("<category>/<subclass>/<case>" —
 *  batch is a sub-classed category, so the `adsorber` segment is part of it). */
export const BREAKTHROUGH_WITNESS = "batch/adsorber/batch13_breakthrough_co2";

const FLOWSHEET = "system/flowsheetDict";

export interface BreakthroughKnob {
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
   *  word in the dict survives the override untouched. */
  unit: string;
}

/** The classroom knobs.  All engine-side levers: u and L move the
 *  stoichiometric front (t_st = (L/u)·R_f — the ENGINE derives it), T reaches
 *  the isotherm through the record's van't Hoff dH_ads, P moves c_in = P/RT
 *  and the CO2 partial pressure, and endTime is the horizon — slow the front
 *  down and the student must extend it to SEE the breakthrough. */
export const BREAKTHROUGH_KNOBS: readonly BreakthroughKnob[] = [
  { id: "u", label: "superficial velocity u", file: FLOWSHEET, key: "u",
    def: 0.05, min: 0.01, max: 0.2, step: 0.005, unit: "m/s" },
  { id: "L", label: "bed length L", file: FLOWSHEET, key: "L",
    def: 0.5, min: 0.1, max: 2, step: 0.05, unit: "m" },
  { id: "T", label: "bed temperature T", file: FLOWSHEET, key: "T",
    def: 298, min: 273, max: 373, step: 5, unit: "K" },
  { id: "P", label: "pressure P", file: FLOWSHEET, key: "P",
    def: 1, min: 0.5, max: 5, step: 0.25, unit: "bar" },
  // controlDict declares `endTime 4200;` BARE (raw SI seconds; the "s" lives
  // in a comment) — so this knob's dict unit is the empty word, and the label
  // carries the seconds instead.
  { id: "endTime", label: "horizon endTime (s)", file: "system/controlDict",
    key: "endTime", def: 4200, min: 500, max: 20000, step: 100, unit: "" },
];

export type BreakthroughKnobValues = { [id: string]: number };

/** The witness's authored values — the classroom baseline. */
export function defaultKnobValues(): BreakthroughKnobValues {
  const out: BreakthroughKnobValues = {};
  for (const k of BREAKTHROUGH_KNOBS) out[k.id] = k.def;
  return out;
}

/** Knob values → methodRun ScalarOverrides.  Non-finite values are dropped
 *  (that knob keeps the witness's authored number) — never written as NaN. */
export function knobOverrides(values: BreakthroughKnobValues): ScalarOverride[] {
  const out: ScalarOverride[] = [];
  for (const k of BREAKTHROUGH_KNOBS) {
    const v = values[k.id];
    if (v !== undefined && Number.isFinite(v))
      out.push({ file: k.file, key: k.key, value: v });
  }
  return out;
}

// The provenance line, always visible in classroom mode.
const PROVENANCE =
  `Runs tutorials/${BREAKTHROUGH_WITNESS} (15% CO2 in He on a zeolite-13X `
  + "fixed bed) with your parameters, in your browser (choupoBatch WASM).";

const COLLAPSE_KEY = "choupo.methods.breakthrough.controlsCollapsed";

// ---- Display formatting -----------------------------------------------------

function fmt(v: number | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? v.toPrecision(6) : "—";
}

// ---- The tool ---------------------------------------------------------------

export function BreakthroughTool(): JSX.Element {
  const appResult = useStore((s) => s.runResult);

  // ---- Source: the classroom witness run vs the app's current run.  The
  // toggle appears whenever the current run carries a trajectory at all; the
  // activation predicate then decides under "Current run", so a holdup-only
  // run (batch09) still reaches the honest empty state that explains itself.
  const hasAppTrajectory = appResult?.trajectory !== undefined;
  const [source, setSource] = useState<"classroom" | "current">("classroom");
  const src: "classroom" | "current" =
    hasAppTrajectory && source === "current" ? "current" : "classroom";

  // ---- Classroom knobs → witness overrides → in-browser choupoBatch --------
  const [knobs, setKnobs] = useState<BreakthroughKnobValues>(defaultKnobValues);
  const { collapsed, toggle } = useCollapsedFlag(COLLAPSE_KEY);
  const { result: classroom, err, busy } = useMethodRun(
    src === "classroom" ? BREAKTHROUGH_WITNESS : null,
    knobOverrides(knobs), JSON.stringify(knobs), "choupoBatch");

  const result = src === "current" ? appResult : classroom;
  const trajectory: TrajectoryData | undefined = result?.trajectory;
  const kpis: KpiMap | undefined = result?.kpis;
  const [thermal, setThermal] = useState(false);

  const detection = useMemo(
    () => detectBreakthrough(trajectory ? Object.keys(trajectory.vars) : [], kpis),
    [trajectory, kpis]);

  // Everything the plot needs, computed once per run.  All numbers here are
  // engine-emitted; the only arithmetic is the anchored display division.
  const view = useMemo(() => {
    if (!trajectory || !detection.active || detection.unit === null) return null;
    const unitKpis = kpis?.[detection.unit];

    // The late plateau per component: the LAST sample of its outlet column.
    const lastOutlet: { [component: string]: number } = {};
    detection.components.forEach((comp, i) => {
      const col = detection.outletColumns[i];
      const ys = col !== undefined ? trajectory.vars[col] : undefined;
      const last = ys?.[ys.length - 1];
      if (typeof last === "number") lastOutlet[comp] = last;
    });

    // Normalisation only applies on the concentration family — the anchor KPI
    // is a c-ratio; a y_out-only run stays raw with its basis stated.
    const norm: NormalisationDecision = detection.concentrationBasis
      ? decideNormalisation(unitKpis, detection.components, lastOutlet)
      : { cIn: null, caption: "y_out mole-fraction basis — plotted unnormalised "
          + "(the c_in anchor KPI is a concentration ratio)." };

    // The displayed trajectory: outlet columns (divided by the anchored c_in
    // and renamed when normalised, verbatim otherwise) + the thermal columns
    // carried over untouched.  TrajectoryPlot then selects via filterVars.
    const vars: { [name: string]: number[] } = {};
    const plotted: string[] = [];
    detection.components.forEach((comp, i) => {
      const col = detection.outletColumns[i];
      const ys = col !== undefined ? trajectory.vars[col] : undefined;
      if (col === undefined || ys === undefined) return;
      const cInComp = norm.cIn?.[comp];
      if (cInComp !== undefined) {
        const name = `${col}/c_in`;
        vars[name] = ys.map((v) => v / cInComp);
        plotted.push(name);
      } else {
        vars[col] = ys;
        plotted.push(col);
      }
    });
    for (const tc of detection.thermalColumns) {
      const ys = trajectory.vars[tc];
      if (ys !== undefined) vars[tc] = ys;
    }

    // The four KPI-emitted front times per component: three vertical markers +
    // the stoichiometric front as the ideal square wave.
    const t0 = trajectory.t[0] ?? 0;
    const tEnd = (typeof unitKpis?.["t_end"] === "number"
      ? unitKpis["t_end"] : undefined) ?? trajectory.t[trajectory.t.length - 1] ?? 0;
    const many = detection.components.length > 1;
    const markers: EventMarker[] = [];
    const ghost: GhostTrace[] = [];
    detection.components.forEach((comp) => {
      const m = extractFrontMarkers(unitKpis, comp);
      const tag = many ? ` (${comp})` : "";
      if (m.t5 !== null) markers.push({ x: m.t5, label: `t_5%${tag}` });
      if (m.t50 !== null) markers.push({ x: m.t50, label: `t_50%${tag}` });
      if (m.t95 !== null) markers.push({ x: m.t95, label: `t_95%${tag}` });
      if (m.tStoich !== null) {
        const plateau = norm.cIn !== null ? 1 : lastOutlet[comp] ?? 0;
        const wave = idealSquareWave(m.tStoich, t0, tEnd, plateau);
        ghost.push({
          name: `ideal front at t_st${tag}`, t: wave.t, y: wave.y,
          side: "left", color: PLOT_COLORS.warm2, opacity: 0.85,
        });
      }
    });

    const pe = unitKpis?.["Pe"];
    return {
      unit: detection.unit, unitKpis, norm, markers, ghost,
      data: { t: trajectory.t, vars } satisfies TrajectoryData,
      plotted,
      leftTitle: detection.concentrationBasis
        ? (norm.cIn !== null ? "c/c_in [-]" : "c_out") : "y_out [-]",
      pe: typeof pe === "number" && Number.isFinite(pe) ? pe : null,
    };
  }, [trajectory, kpis, detection]);

  // ---- The source + classroom-knob bar (always rendered) --------------------
  const controls = (
    <Box style={{ flexShrink: 0, borderBottom:
      "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))" }}>
      <Group gap="sm" wrap="nowrap" align="center" px={12} py={6}>
        {hasAppTrajectory && (
          <SegmentedControl size="xs" value={src}
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
                  re-integrating — seconds, not instant
                </Text>
              </Group>
            )}
          </>
        )}
      </Group>
      {src === "classroom" && (
        <>
          <Collapse in={!collapsed}>
            <Group gap="sm" px={12} pb={4} align="flex-end" wrap="wrap">
              {BREAKTHROUGH_KNOBS.map((k) => (
                <NumberInput key={k.id} size="xs" w={140}
                  label={k.unit ? `${k.label} [${k.unit}]` : k.label}
                  value={knobs[k.id]} min={k.min} max={k.max} step={k.step}
                  onChange={(v) => {
                    const num = typeof v === "number" ? v : Number(v);
                    if (Number.isFinite(num))
                      setKnobs((s) => ({ ...s, [k.id]: num }));
                  }} />
              ))}
            </Group>
          </Collapse>
          <Text size="xs" c="dimmed" px={12} pb={6}>{PROVENANCE}</Text>
        </>
      )}
    </Box>
  );

  // ---- No drawable view yet: per-source honest states -----------------------
  if (view === null) {
    return (
      <Box style={{ height: "100%", display: "flex", flexDirection: "column",
        minHeight: 0 }}>
        {controls}
        {src === "classroom" && err !== null && (
          <Alert color="red" variant="light" m={12}
            title="The engine refused or failed — its message, verbatim">
            <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
              {err}
            </Text>
          </Alert>
        )}
        {src === "classroom" && err === null && (
          <Box style={{ flex: 1, display: "flex", alignItems: "center",
            justifyContent: "center", padding: 12 }}>
            {busy || classroom === null ? (
              <Group gap="sm" wrap="nowrap" align="center">
                <Loader size="sm" />
                <Text size="sm" c="dimmed">
                  the engine is integrating the bed — seconds, not instant
                </Text>
              </Group>
            ) : (
              <Text size="sm" c="dimmed" ta="center" maw={460}>
                The classroom run finished but did not publish the
                breakthrough surfaces (c_out_/y_out_ columns +
                t_stoichiometric_* KPIs) — nothing honest to draw.
              </Text>
            )}
          </Box>
        )}
        {src === "current" && (
          <Box style={{ flex: 1, display: "flex", alignItems: "center",
            justifyContent: "center", padding: 12 }}>
            <Text size="sm" c="dimmed" ta="center" maw={460}>
              Adsorption breakthrough needs a fixed-bed choupoBatch run with
              OUTLET tracking: a trajectory carrying c_out_/y_out_ columns and
              the engine's front KPIs (t_stoichiometric_*). A holdup-only
              adsorber run has no breakthrough curve to draw.
            </Text>
          </Box>
        )}
      </Box>
    );
  }

  const hasThermal = detection.thermalColumns.length > 0;
  const filterVars = [
    ...view.plotted,
    ...(thermal && hasThermal ? detection.thermalColumns : []),
  ];

  return (
    <Box style={{ height: "100%", display: "flex", flexDirection: "column",
      minHeight: 0 }}>
      {controls}

      {/* A knob run that failed keeps the previous curve on screen — the
          engine's message rides above it, verbatim, never swallowed. */}
      {src === "classroom" && err !== null && (
        <Alert color="red" variant="light" m={12}
          title="The engine refused or failed — its message, verbatim">
          <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>
            {err}
          </Text>
        </Alert>
      )}

      {/* Toolbar: the thermal overlay toggle, honest when there is nothing
          to overlay. */}
      <Group gap="sm" wrap="nowrap" align="center" px={12} py={6}
        style={{ flexShrink: 0 }}>
        <Switch size="xs" label="thermal overlay (T_out / T_max)"
          checked={thermal && hasThermal} disabled={!hasThermal}
          onChange={(e) => setThermal(e.currentTarget.checked)} />
        {!hasThermal && (
          <Text size="xs" c="dimmed">isothermal run — no thermal columns</Text>
        )}
      </Group>

      {/* The engine's curve + the KPI front construction. */}
      <Box style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
        <TrajectoryPlot
          data={view.data}
          filterVars={filterVars}
          mvVars={detection.thermalColumns}
          eventMarkers={view.markers}
          ghost={view.ghost}
          leftTitle={view.leftTitle}
          rightTitle="T [K]"
          title={`Breakthrough — ${view.unit}`}
        />
      </Box>

      {/* Caption: the pedagogy of the construction + the normalisation
          provenance, both stated rather than implied. */}
      <Stack gap={2} px={12} py={4} style={{ flexShrink: 0 }}>
        <Text size="xs" c="dimmed">
          The area between the real curve and the ideal square wave at t_st is
          the front spreading that the Peclet number
          ({view.pe !== null ? `Pe = ${fmt(view.pe)}` : "Pe not emitted"}) and
          heat effects buy.
        </Text>
        <Text size="xs" c="dimmed">{view.norm.caption}</Text>
      </Stack>

      {/* The KPI table: one row per front component, each number verbatim
          from the engine with its one-line meaning. */}
      <Box px={12} pb={8} style={{ flexShrink: 0, overflowX: "auto" }}>
        <Table withTableBorder withColumnBorders
          style={{ fontSize: 12 }} verticalSpacing={2}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>component</Table.Th>
              <Table.Th>retention_factor</Table.Th>
              <Table.Th>qbar_final</Table.Th>
              <Table.Th>c_out/c_in final</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {detection.components.map((comp) => (
              <Table.Tr key={comp}>
                <Table.Td>{comp}</Table.Td>
                <Table.Td>{fmt(view.unitKpis?.[`retention_factor_${comp}`])}</Table.Td>
                <Table.Td>{fmt(view.unitKpis?.[`qbar_${comp}_final`])}</Table.Td>
                <Table.Td>{fmt(view.unitKpis?.[`c_out_over_cin_final_${comp}`])}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        <Text size="xs" c="dimmed" mt={4}>
          retention_factor: how many hold-up times the front lags the carrier —
          the bed's dynamic capacity for the component.{" "}
          qbar_final: bed-average adsorbed loading at t_end — the capacity the
          run actually used.{" "}
          c_out/c_in final: the late plateau — 1 means the bed is fully broken
          through.
        </Text>
      </Box>
    </Box>
  );
}
