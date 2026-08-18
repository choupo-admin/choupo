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
  EpsilonNtuTool — the ε-NTU effectiveness chart over a SOLVED exchanger.

  SELF-FEEDING (the Methods-workspace contract, src/case/methodRun.ts): the
  tool's DEFAULT source is a CLASSROOM run — it clones its witness tutorial
  (tutorials/steady/heat/heatExchanger01_water_water), writes the student's
  knobs (A, U, each stream's flow and inlet T) into the witness's own dicts
  as textual scalar overrides, and solves it with the WASM choupoSolve in
  the browser.  Zero physics in TypeScript survives intact: the knobs edit
  DECLARED dict scalars and the ENGINE computes ε, NTU, C_r and the rest.
  The app's own flowsheet run stays available as the "Current run" source
  whenever it carries a servable exchanger KPI row.

  The one authorization this tool carries (an exception to the zero-physics-
  in-TS rule, granted because the ENGINE computes its own ε and the case's
  point is the judge): the ε(NTU, C_r) textbook closed forms drawn here are
  METHOD GEOMETRY the tool may own.  Agreement with the engine's KPI is
  VERIFICATION; disagreement means the tool picked the wrong configuration —
  never that the point moves.  The three closed forms are transcribed from
  the engine's own implementation
  (src/unitOperations/heatTransfer/HeatExchanger.cpp):

      counter-current      ε = (1−e)/(1−C_r·e),   e = exp(−NTU(1−C_r));
                           C_r→1 limit  ε = NTU/(1+NTU)
      co-current           ε = (1−exp(−NTU(1+C_r)))/(1+C_r)
      1 shell / 2N passes  ε = 2/{(1+C_r) + √(1+C_r²)(1+E)/(1−E)},
                           E = exp(−NTU·√(1+C_r²))

  Feeds: the exchanger's KPI row ("NTU", "effectiveness", "C_r", plus
  "LMTD", "Q_kW" for the side pane) and, when the run carries it, the
  21-point area profile (xAxis "position", T_hot/T_cold columns).

  Charts are parametric inline SVG (the HeatExchangerDatasheet precedent),
  NOT the plotly kit — plotly cannot load in the node test environment, and
  the closed forms + matcher here must stay importable by the tests.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import {
  Alert, Badge, Box, Group, Loader, SegmentedControl, Select, Stack, Text,
  Tooltip,
} from "@mantine/core";

import type { RunResult, UnitProfile } from "../../adapters/SolverAdapter.js";
import { KnobSlider, MethodSetupRail, PanelNote } from "./knobPanel.js";
import type { ScalarOverride } from "../../case/methodRun.js";
import { useMethodRun } from "../../case/methodRun.js";
import { useStore } from "../../state/store.js";

// ---- The closed forms (the authorized method geometry) ----------------------

export type ExchangerConfigId = "counter" | "co" | "shell2pass";

export interface ExchangerConfig {
  id: ExchangerConfigId;
  label: string;
  /** Colour + dash mirror the plotting kit's series palette (readable on
   *  both colour schemes) without importing the plotly module. */
  color: string;
  dash: string;
}

export const EXCHANGER_CONFIGS: ExchangerConfig[] = [
  { id: "counter", label: "counter-current", color: "#26c6da", dash: "" },
  { id: "co", label: "co-current", color: "#ffb74d", dash: "6 4" },
  { id: "shell2pass", label: "1 shell / 2 tube passes", color: "#ce93d8", dash: "2 3" },
];

/** The engine's own C_r→1 switch (HeatExchanger.cpp: |1−C_r| < 1e-9). */
const CR_UNITY_TOL = 1.0e-9;

/** ε(NTU, C_r) for one configuration — the PUBLIC eval the tests pin.
 *  Formulas transcribed from the engine (see the header); the NTU = 0 end
 *  evaluates to ε = 0 on every branch without special-casing (the shell
 *  form's (1+E)/(1−E) → ∞ divides out to 0 in IEEE arithmetic). */
export function epsilonNtu(config: ExchangerConfigId, NTU: number, Cr: number): number {
  if (config === "counter") {
    if (Math.abs(1.0 - Cr) < CR_UNITY_TOL) return NTU / (1.0 + NTU);
    const e = Math.exp(-NTU * (1.0 - Cr));
    return (1.0 - e) / (1.0 - Cr * e);
  }
  if (config === "co")
    return (1.0 - Math.exp(-NTU * (1.0 + Cr))) / (1.0 + Cr);
  // 1 shell pass, 2N tube passes (the U-tube / multi-pass TEMA E-shell).
  const root = Math.sqrt(1.0 + Cr * Cr);
  const E = Math.exp(-NTU * root);
  return 2.0 / ((1.0 + Cr) + (root * (1.0 + E)) / (1.0 - E));
}

// ---- Activation + the configuration matcher ---------------------------------

/** The KPI triple that activates the tool (HeatExchanger.cpp writes all
 *  three on every solved exchanger). */
const REQUIRED_KPIS = ["NTU", "effectiveness", "C_r"] as const;

/** Activation predicate: a unit's KPI row feeds the tool only when the whole
 *  triple is present AND finite — a partial row stays an honest empty state. */
export function hasEpsilonNtuKpis(kpis: { [k: string]: number } | undefined): boolean {
  return !!kpis && REQUIRED_KPIS.every((k) => Number.isFinite(kpis[k]));
}

/** |Δε| below this is float-precision agreement — the tool reproduced the
 *  engine's number, so the configuration is CONFIRMED. */
export const MATCH_TOL = 1.0e-9;

export interface ConfigCheck {
  id: ExchangerConfigId;
  label: string;
  /** The tool's closed-form ε at the case's exact (NTU, C_r). */
  eps: number;
  /** Signed deviation from the engine's ε (tool − engine). */
  dEps: number;
  matches: boolean;
}

export interface ConfigMatch {
  checks: ConfigCheck[];
  /** Every configuration that agrees to float precision.  More than one is
   *  legitimate where the forms coincide (C_r = 0, or NTU → 0). */
  confirmed: ExchangerConfigId[];
}

/** Cross-check the engine's (NTU, effectiveness, C_r) point against all
 *  three closed forms.  Agreement is verification; when NOTHING matches the
 *  deviations are a FINDING about the tool's geometry — the point never
 *  moves.  Returns null when the KPI row cannot feed the tool. */
export function matchConfiguration(kpis: { [k: string]: number } | undefined): ConfigMatch | null {
  if (!hasEpsilonNtuKpis(kpis) || !kpis) return null;
  const NTU = kpis["NTU"]!, epsEngine = kpis["effectiveness"]!, Cr = kpis["C_r"]!;
  const checks = EXCHANGER_CONFIGS.map((c) => {
    const eps = epsilonNtu(c.id, NTU, Cr);
    const dEps = eps - epsEngine;
    return { id: c.id, label: c.label, eps, dEps, matches: Math.abs(dEps) < MATCH_TOL };
  });
  return { checks, confirmed: checks.filter((c) => c.matches).map((c) => c.id) };
}

// ---- The classroom witness + its knob map -----------------------------------

/** The tool's own sealed tutorial, run in-browser with the student's knobs.
 *  The identifier carries the sub-class folder (the 2026-06-03 tutorial
 *  reorganisation): <category>/<subclass>/<case>. */
export const ENTU_WITNESS = "steady/heat/heatExchanger01_water_water";

/** The knob values, in the UNITS THE WITNESS DICTS DECLARE — the override is
 *  textual and keeps each scalar's unit word (m2, W/m2/K, kmol/h, K), so a
 *  knob's number IS the number written before that unit. */
export interface EntuKnobs {
  /** Exchanger area, m² (flowsheetDict `area`). */
  area_m2: number;
  /** Overall coefficient, W/m²/K (flowsheetDict `U`). */
  U_W_m2K: number;
  /** Hot stream molar flow, kmol/h (0/hot `water`). */
  hotFlow_kmolh: number;
  /** Hot inlet temperature, K (0/hot `T`). */
  hotT_K: number;
  /** Cold stream molar flow, kmol/h (0/cold `water`). */
  coldFlow_kmolh: number;
  /** Cold inlet temperature, K (0/cold `T`). */
  coldT_K: number;
}

/** The witness's authored values (flowsheetDict + 0/ as shipped). */
export const ENTU_DEFAULT_KNOBS: EntuKnobs = {
  area_m2: 10, U_W_m2K: 500,
  hotFlow_kmolh: 100, hotT_K: 360,
  coldFlow_kmolh: 120, coldT_K: 300,
};

/** Knob → dict-scalar map.  Each key is UNIQUE in its file (T lives once per
 *  stream because every stream has its OWN 0/ file; `water` is the single
 *  component of each stream's componentMolarFlows) — verified against the
 *  real bundled raw text by tests/epsilonNtuTool.test.ts, and enforced at
 *  run time by applyScalarOverride, which throws on 0 or >1 matches. */
export function entuOverrides(k: EntuKnobs): ScalarOverride[] {
  return [
    { file: "system/flowsheetDict", key: "area", value: k.area_m2 },
    { file: "system/flowsheetDict", key: "U", value: k.U_W_m2K },
    { file: "0/hot", key: "water", value: k.hotFlow_kmolh },
    { file: "0/hot", key: "T", value: k.hotT_K },
    { file: "0/cold", key: "water", value: k.coldFlow_kmolh },
    { file: "0/cold", key: "T", value: k.coldT_K },
  ];
}

/** Slider affordances only (labels + ranges) — the ENGINE judges the values;
 *  an infeasible pick surfaces as the engine's own error, verbatim. */
const KNOB_SPECS: {
  id: keyof EntuKnobs; label: string; unit: string;
  min: number; max: number; step: number;
}[] = [
  { id: "area_m2", label: "area A", unit: "m²", min: 1, max: 40, step: 0.5 },
  { id: "U_W_m2K", label: "U", unit: "W/m²/K", min: 100, max: 2000, step: 25 },
  { id: "hotFlow_kmolh", label: "hot flow", unit: "kmol/h", min: 10, max: 300, step: 5 },
  { id: "hotT_K", label: "hot inlet T", unit: "K", min: 310, max: 390, step: 1 },
  { id: "coldFlow_kmolh", label: "cold flow", unit: "kmol/h", min: 10, max: 300, step: 5 },
  { id: "coldT_K", label: "cold inlet T", unit: "K", min: 275, max: 350, step: 1 },
];

// The knob panel's fold and width are the PANEL's (ui/methods/knobPanel.tsx),
// under the ONE key the preference registry owns.  This file's own key and its
// try/catch pair are gone with the horizontal knob strip they served.

// ---- Chart geometry (SVG helpers) -------------------------------------------

const NTU_MAX = 6;
const CR_FAMILY = [0, 0.25, 0.5, 0.75, 1];
const N_PTS = 121;

// Family-plot frame (viewBox units).
const FW = 640, FH = 420;
const FX0 = 54, FX1 = 616, FY0 = 14, FY1 = 378;

const ntuToX = (ntu: number) => FX0 + ((FX1 - FX0) * ntu) / NTU_MAX;
const epsToY = (eps: number) => FY1 - (FY1 - FY0) * Math.min(1, Math.max(0, eps));

/** One ε(NTU) polyline at fixed (config, C_r), NTU ∈ [0, NTU_MAX]. */
function familyPath(config: ExchangerConfigId, Cr: number): string {
  const pts: string[] = [];
  for (let i = 0; i < N_PTS; i++) {
    const ntu = (i * NTU_MAX) / (N_PTS - 1);
    const eps = epsilonNtu(config, ntu, Cr);
    pts.push(`${ntuToX(ntu).toFixed(2)},${epsToY(eps).toFixed(2)}`);
  }
  return pts.join(" ");
}

// The families are pure geometry with no inputs — 3 configurations × 5
// capacity ratios, computed once at module load, never per render.
const FAMILIES = EXCHANGER_CONFIGS.map((c) => ({
  config: c,
  lines: CR_FAMILY.map((Cr) => ({ Cr, path: familyPath(c.id, Cr) })),
}));

const GRID = "var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";
const POINT = "#ff8a65";   // the kit's warm2 — the engine's answer
const HOT = "#ff8a65", COLD = "#80deea";   // profile pane traces

const fmt = (v: number | undefined, d = 4) =>
  v !== undefined && Number.isFinite(v) ? v.toPrecision(d) : "—";

const HAIRLINE =
  "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))";

// ---- The area-profile lookup ------------------------------------------------

/** The exchanger's 21-point area profile, when the run carries it: the unit's
 *  own row with xAxis "position" and both temperature columns. */
function findAreaProfile(profiles: UnitProfile[] | undefined, unit: string | undefined):
  UnitProfile | undefined {
  if (!profiles || !unit) return undefined;
  return profiles.find((p) => p.unit === unit && p.xAxis === "position"
    && !!p.columns["T_hot"] && !!p.columns["T_cold"]);
}

// ---- The workspace tool -----------------------------------------------------

type Source = "classroom" | "run";

export function EpsilonNtuTool(): JSX.Element {
  const appResult = useStore((s) => s.runResult);

  // Does the APP's run carry a servable exchanger row?  Only then does the
  // source toggle appear — the classroom witness never depends on it.
  const appServable = useMemo(() => {
    const k = appResult?.kpis ?? {};
    return Object.keys(k).some((u) => hasEpsilonNtuKpis(k[u]));
  }, [appResult]);

  const [source, setSource] = useState<Source>("classroom");

  // ---- The classroom knobs + the self-feeding engine run -------------------
  const [knobs, setKnobs] = useState<EntuKnobs>(ENTU_DEFAULT_KNOBS);
  const overridesKey = JSON.stringify(knobs);
  const overrides = useMemo(() => entuOverrides(knobs), [knobs]);
  const { result: classroomResult, err, busy } = useMethodRun(
    source === "classroom" ? ENTU_WITNESS : null,
    overrides, overridesKey, "choupoSolve");

  const result: RunResult | null =
    source === "classroom" ? classroomResult : appResult;
  const kpisByUnit = result?.kpis ?? {};

  // Every unit whose KPI row carries the full (NTU, effectiveness, C_r)
  // triple — the exchangers of the solved case.
  const units = useMemo(
    () => Object.keys(kpisByUnit).filter((u) => hasEpsilonNtuKpis(kpisByUnit[u])).sort(),
    [kpisByUnit]);
  const [picked, setPicked] = useState<string | null>(null);
  const unit = picked && units.includes(picked) ? picked : units[0];
  const kpis = unit ? kpisByUnit[unit] : undefined;

  const match = useMemo(() => matchConfiguration(kpis), [kpis]);
  const profile = useMemo(
    () => findAreaProfile(result?.profiles, unit), [result, unit]);

  /* The setup panel's content: the source, the exchanger knobs, the
     provenance.  The unit picker and the cross-check chip stay in the content
     column, where SolvedView renders them beside the chart. */
  const setup = (
    <>
      {(appServable || source === "run") && (
        <SegmentedControl size="xs" value={source} fullWidth
          onChange={(v) => setSource(v === "run" ? "run" : "classroom")}
          data={[
            { label: "Classroom", value: "classroom" },
            { label: "Current run", value: "run" },
          ]} />
      )}
      {source === "classroom" && (
        <>
          {KNOB_SPECS.map((spec) => (
            <KnobSlider key={spec.id} knob={spec} value={knobs[spec.id]}
              onChange={(v) => setKnobs((k) => ({ ...k, [spec.id]: v }))} />
          ))}
          <PanelNote>
            Runs tutorials/steady/heat/heatExchanger01_water_water with your
            parameters, in your browser.
          </PanelNote>
        </>
      )}
    </>
  );

  return (
    <MethodSetupRail title="exchanger knobs" setup={setup}>
      {/* The engine's error, VERBATIM — never paraphrased. */}
      {source === "classroom" && err && (
        <Alert color="red" variant="light" mx={12} my={6} py={6}
          title="The engine refused this run" style={{ flexShrink: 0 }}>
          <Text size="xs" style={{ whiteSpace: "pre-wrap",
            fontFamily: "var(--mantine-font-family-monospace)" }}>
            {err}
          </Text>
        </Alert>
      )}

      {(!unit || !kpis || !match) ? (
        // ---- No servable point in the active source. -----------------------
        <Box style={{ flex: 1, display: "flex", alignItems: "center",
          justifyContent: "center", padding: 24 }}>
          {source === "run" ? (
            <Text size="sm" c="dimmed" ta="center" maw={460}>
              No exchanger point in this run.  The ε-NTU chart activates when a
              solved unit's KPI row carries all of <b>NTU</b>, <b>effectiveness</b>
              {" "}and <b>C_r</b> — run a case with a heat-exchanger unit first.
              The families alone would be a textbook page, not your case.
            </Text>
          ) : busy ? (
            <Group gap="xs" wrap="nowrap">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">
                Solving the classroom exchanger in your browser…
              </Text>
            </Group>
          ) : (
            <Text size="sm" c="dimmed" ta="center" maw={460}>
              {err
                ? "The classroom run did not produce an exchanger point — the engine's message above says why."
                : "Waiting for the classroom run…"}
            </Text>
          )}
        </Box>
      ) : (
        <SolvedView units={units} unit={unit} onPick={setPicked}
          kpis={kpis} match={match} profile={profile}
          busy={source === "classroom" && busy} />
      )}
    </MethodSetupRail>
  );
}

// ---- The solved-exchanger rendering (either source) -------------------------

function SolvedView({ units, unit, onPick, kpis, match, profile, busy }: {
  units: string[];
  unit: string;
  onPick: (u: string | null) => void;
  kpis: { [k: string]: number };
  match: ConfigMatch;
  profile: UnitProfile | undefined;
  /** A classroom re-run is in flight — Loader over the chart, the previous
   *  point stays visible under it (never a blank flash per slider tick). */
  busy: boolean;
}): JSX.Element {
  const NTU = kpis["NTU"]!, eps = kpis["effectiveness"]!, Cr = kpis["C_r"]!;
  const px = ntuToX(Math.min(NTU, NTU_MAX)), py = epsToY(eps);
  const offChart = NTU > NTU_MAX;
  const confirmedLabels = match.checks.filter((c) => c.matches).map((c) => c.label);

  // The cross-check chip's tooltip always carries all three deviations —
  // verification shown, never implied.
  const deviationLines = match.checks.map((c) =>
    `${c.label}: ε = ${fmt(c.eps, 6)}  (Δε = ${c.dEps.toExponential(2)})`);

  return (
    <>
      {/* Toolbar: the unit picker + the cross-check chip. */}
      <Box style={{
        flexShrink: 0, minHeight: 44, padding: "6px 12px", overflowX: "auto", overflowY: "hidden",
        borderBottom: HAIRLINE,
      }}>
        <Group gap="sm" wrap="nowrap" align="center" style={{ minWidth: "fit-content" }}>
          <Group gap={4} wrap="nowrap" align="center">
            <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>exchanger</Text>
            <Select size="xs" data={units} value={unit} w={180}
              onChange={(v) => onPick(v)} allowDeselect={false}
              disabled={units.length < 2} />
          </Group>
          <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
            NTU {fmt(NTU)} · ε {fmt(eps)} · C_r {fmt(Cr)}
          </Text>
          <Tooltip withArrow multiline w={340}
            label={deviationLines.join("\n")}
            styles={{ tooltip: { whiteSpace: "pre-line" } }}>
            {confirmedLabels.length > 0 ? (
              <Badge color="teal" variant="light" tt="none" style={{ flexShrink: 0 }}>
                configuration confirmed: {confirmedLabels.join(" = ")}
              </Badge>
            ) : (
              <Badge color="orange" variant="light" tt="none" style={{ flexShrink: 0 }}>
                no configuration matches — a finding
              </Badge>
            )}
          </Tooltip>
        </Group>
      </Box>

      {/* The pedagogy line, stated before the plot. */}
      <Text size="xs" c="dimmed" px={12} py={4} style={{ flexShrink: 0 }}>
        Families are the textbook closed forms; the engine's answer is the
        point.  C_r = 0 is the phase-change limit (a condensing or boiling
        stream at constant T) where all three configurations collapse to
        ε = 1 − e<sup>−NTU</sup>.
      </Text>

      {/* No-match FINDING: all three deviations shown; the point never moves. */}
      {confirmedLabels.length === 0 && (
        <Alert color="orange" variant="light" mx={12} mb={4} py={6}
          title="Finding: the tool's geometry disagrees with the engine"
          style={{ flexShrink: 0 }}>
          <Stack gap={2}>
            {match.checks.map((c) => (
              <Text key={c.id} size="xs">
                {c.label}: ε = {fmt(c.eps, 6)} (Δε = {c.dEps.toExponential(3)})
              </Text>
            ))}
            <Text size="xs" c="dimmed">
              The engine's point never moves — a disagreement means this tool
              picked the wrong configuration for the unit, not that the
              engine's ε is in doubt.
            </Text>
          </Stack>
        </Alert>
      )}

      {/* Main row: the family chart + the area-profile side pane. */}
      <Box style={{ flex: 1, minHeight: 0, display: "flex", gap: 12,
        padding: "0 12px 8px", overflow: "hidden" }}>
        {/* ---- ε vs NTU families ---- */}
        <Box style={{ flex: 2, minWidth: 0, display: "flex",
          flexDirection: "column", position: "relative" }}>
          <Group gap="md" wrap="wrap" py={2} style={{ flexShrink: 0 }}>
            {EXCHANGER_CONFIGS.map((c) => (
              <Group key={c.id} gap={4} wrap="nowrap" align="center">
                <svg width={26} height={8} aria-hidden>
                  <line x1={1} y1={4} x2={25} y2={4} stroke={c.color}
                    strokeWidth={2} strokeDasharray={c.dash || undefined} />
                </svg>
                <Text size="xs" c="dimmed">{c.label}</Text>
              </Group>
            ))}
            <Group gap={4} wrap="nowrap" align="center">
              <svg width={12} height={12} aria-hidden>
                <circle cx={6} cy={6} r={4} fill={POINT} />
              </svg>
              <Text size="xs" c="dimmed">the engine's answer ({unit})</Text>
            </Group>
          </Group>
          <Box style={{ flex: 1, minHeight: 0 }}>
            <svg viewBox={`0 0 ${FW} ${FH}`} width="100%" height="100%"
              preserveAspectRatio="xMidYMid meet"
              role="img" aria-label="effectiveness versus NTU families">
              {/* grid + axes */}
              {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                <g key={`gx${n}`}>
                  <line x1={ntuToX(n)} y1={FY0} x2={ntuToX(n)} y2={FY1}
                    stroke={GRID} strokeWidth={n === 0 ? 1.4 : 0.6} />
                  <text x={ntuToX(n)} y={FY1 + 16} textAnchor="middle"
                    fontSize={11} fill={INK}>{n}</text>
                </g>
              ))}
              {[0, 0.2, 0.4, 0.6, 0.8, 1].map((e) => (
                <g key={`gy${e}`}>
                  <line x1={FX0} y1={epsToY(e)} x2={FX1} y2={epsToY(e)}
                    stroke={GRID} strokeWidth={e === 0 ? 1.4 : 0.6} />
                  <text x={FX0 - 6} y={epsToY(e) + 4} textAnchor="end"
                    fontSize={11} fill={INK}>{e.toFixed(1)}</text>
                </g>
              ))}
              <text x={(FX0 + FX1) / 2} y={FH - 6} textAnchor="middle"
                fontSize={12} fill={INK}>NTU = UA / C_min</text>
              <text x={14} y={(FY0 + FY1) / 2} textAnchor="middle" fontSize={12}
                fill={INK} transform={`rotate(-90 14 ${(FY0 + FY1) / 2})`}>
                ε (effectiveness)
              </text>
              {/* the families: 3 configurations × C_r = 0, 0.25, 0.5, 0.75, 1 */}
              {FAMILIES.map(({ config, lines }) =>
                lines.map(({ Cr: cr, path }) => (
                  <polyline key={`${config.id}-${cr}`} points={path} fill="none"
                    stroke={config.color} strokeWidth={cr === 0 ? 1.8 : 1.1}
                    strokeDasharray={config.dash || undefined}
                    opacity={cr === 0 ? 0.95 : 0.75} />
                )))}
              {/* C_r labels ride the counter-current family's right edge (the
                  co-current / shell curves order the same way — see legend) */}
              {CR_FAMILY.map((cr) => (
                <text key={`crlab${cr}`} x={FX1 + 3}
                  y={epsToY(epsilonNtu("counter", NTU_MAX, cr)) + 4}
                  fontSize={10} fill={INK}>{cr}</text>
              ))}
              <text x={FX1 + 3} y={FY0 + 2} fontSize={10} fill={INK}>C_r</text>
              {/* the case's point, with guides to both axes */}
              <line x1={px} y1={py} x2={px} y2={FY1} stroke={POINT}
                strokeWidth={0.8} strokeDasharray="3 3" />
              <line x1={FX0} y1={py} x2={px} y2={py} stroke={POINT}
                strokeWidth={0.8} strokeDasharray="3 3" />
              <circle cx={px} cy={py} r={5} fill={POINT}
                stroke="var(--mantine-color-body)" strokeWidth={1.5} />
              <text x={px + 8} y={py - 8} fontSize={11} fill={POINT}>
                {offChart ? `NTU ${fmt(NTU, 3)} (beyond axis) · ` : ""}ε = {fmt(eps)}
              </text>
            </svg>
          </Box>
          {/* Classroom re-run in flight: Loader OVER the chart, previous
              point visible underneath. */}
          {busy && (
            <Box style={{ position: "absolute", inset: 0, display: "flex",
              alignItems: "center", justifyContent: "center",
              pointerEvents: "none" }}>
              <Loader size="sm" />
            </Box>
          )}
        </Box>

        {/* ---- Side pane: the area profile the ε summarises ---- */}
        <Box style={{ flex: 1, minWidth: 220, maxWidth: 340, display: "flex",
          flexDirection: "column",
          borderLeft: HAIRLINE,
          paddingLeft: 12 }}>
          <Text size="xs" fw={600} c="dimmed" py={2} style={{ flexShrink: 0 }}>
            T along the area — the approach the ε summarises
          </Text>
          <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
            LMTD {fmt(kpis["LMTD"])} K · Q {fmt(kpis["Q_kW"])} kW
          </Text>
          {profile ? (
            <Box style={{ flex: 1, minHeight: 0 }}>
              <ProfileSvg profile={profile} />
            </Box>
          ) : (
            <Text size="xs" c="dimmed" mt={8}>
              This run carries no area profile for {unit} — the engine writes
              a 21-point T_hot/T_cold sweep on every solved exchanger; re-run
              the case to see the two curves approach.
            </Text>
          )}
        </Box>
      </Box>
    </>
  );
}

// ---- The side-pane profile chart --------------------------------------------

function ProfileSvg({ profile }: { profile: UnitProfile }): JSX.Element {
  const pos = profile.columns[profile.xAxis] ?? [];
  const hot = profile.columns["T_hot"] ?? [];
  const cold = profile.columns["T_cold"] ?? [];
  const all = [...hot, ...cold].filter((v) => Number.isFinite(v));
  const tMin = Math.min(...all), tMax = Math.max(...all);
  const pad = Math.max(0.5, 0.05 * (tMax - tMin));
  const lo = tMin - pad, hi = tMax + pad;
  const xMax = Math.max(...pos, 1e-12);

  const W = 300, H = 240, X0 = 44, X1 = 288, Y0 = 10, Y1 = 204;
  const toX = (p: number) => X0 + ((X1 - X0) * p) / xMax;
  const toY = (t: number) => Y1 - ((Y1 - Y0) * (t - lo)) / (hi - lo);
  const line = (col: number[]) =>
    col.map((t, i) => `${toX(pos[i] ?? 0).toFixed(2)},${toY(t).toFixed(2)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img" aria-label="hot and cold temperature along the exchanger area">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <line key={`pgx${f}`} x1={toX(f * xMax)} y1={Y0} x2={toX(f * xMax)} y2={Y1}
          stroke={GRID} strokeWidth={0.6} />
      ))}
      {[lo, (lo + hi) / 2, hi].map((t) => (
        <g key={`pgy${t}`}>
          <line x1={X0} y1={toY(t)} x2={X1} y2={toY(t)} stroke={GRID} strokeWidth={0.6} />
          <text x={X0 - 4} y={toY(t) + 4} textAnchor="end" fontSize={10} fill={INK}>
            {t.toFixed(1)}
          </text>
        </g>
      ))}
      <polyline points={line(hot)} fill="none" stroke={HOT} strokeWidth={1.8} />
      <polyline points={line(cold)} fill="none" stroke={COLD} strokeWidth={1.8} />
      <text x={X0 + 4} y={Y0 + 12} fontSize={10} fill={HOT}>T_hot</text>
      <text x={X0 + 4} y={Y1 - 6} fontSize={10} fill={COLD}>T_cold</text>
      <text x={(X0 + X1) / 2} y={H - 18} textAnchor="middle" fontSize={10} fill={INK}>
        position (fraction of area)
      </text>
      <text x={12} y={(Y0 + Y1) / 2} textAnchor="middle" fontSize={10} fill={INK}
        transform={`rotate(-90 12 ${(Y0 + Y1) / 2})`}>T (K)</text>
    </svg>
  );
}
