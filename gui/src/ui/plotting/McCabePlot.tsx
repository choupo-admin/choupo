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
  McCabePlot — the interactive McCabe-Thiele binary-distillation instrument.

  The equilibrium curve y*(x) arrives ALREADY COMPUTED by the engine (the
  T-x-y run's (x[c1], y_eq_c1) pairing — the REAL NRTL/UNIFAC/Wilson/EOS curve
  at constant P).  This component reads that frozen curve out of the CSV ONCE
  and then walks the staircase in pure TypeScript (case/mccabeThiele.ts) as the
  student turns R and q — 60 fps, NO WASM re-solve.  The curve only changes
  when P or the thermo model change (those legitimately reshape it, and the
  parent re-runs the engine then).

  The headline: drag R toward the red R_min tick and watch the staircase
  multiply into a wall slamming against the curve — the geometric reason you
  cannot distil below the minimum reflux, the thing a converged-number-in-a-box
  never shows.

  Glass-box honesty (a persistent caption): the operating lines are STRAIGHT
  because Constant Molar Overflow is assumed; y*(x) is the REAL model curve.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import { Alert, Badge, Box, Group, SegmentedControl, Slider, Stack, Switch, Text, Tooltip } from "@mantine/core";

import { Plot, PLOT_COLORS, PLOT_CONFIG, darkLayout } from "./plotly.js";
import {
  buildMccabe, eqCurveFromTxyCsv, sweepReflux, type MccabeResult, type MccabeSpec,
} from "../../case/mccabeThiele.js";

const Q_DETENTS = [
  { value: 1, label: "1 sat-liq" },
  { value: 0, label: "0 sat-vap" },
];

export function McCabePlot(
  { csv, compA, compB, P }: { csv: string; compA: string; compB: string; P: number },
) {
  // Read the engine's equilibrium curve y*(x) out of the T-x-y CSV.  This is
  // the ONLY bridge from physics — everything below is pure geometry.
  const curve = useMemo(() => eqCurveFromTxyCsv(csv, compA), [csv, compA]);

  // SET values (the problem statement): a sharp split by default.
  const [xD, setXD] = useState(0.95);
  const [xW, setXW] = useState(0.05);
  const [xF, setXF] = useState(0.5);
  const [totalCondenser, setTotalCondenser] = useState(true);
  // KNOBS (the consequence you feel continuously).
  const [R, setR] = useState(2.0);
  const [q, setQ] = useState(1.0);
  const [useFactor, setUseFactor] = useState(false); // R vs R/R_min binding
  const [tab, setTab] = useState<"construction" | "sensitivity">("construction");

  if (!curve) {
    return (
      <Box style={{ padding: 16 }}>
        <Text size="sm" c="dimmed">
          Computing the binary equilibrium curve y*(x)… (needs the T-x-y run's
          y_eq_{compA} column).
        </Text>
      </Box>
    );
  }

  // R_min for THIS q, computed from the frozen curve (cheap, geometry only).
  const rMinForQ = useMemo(() => {
    const base: MccabeSpec = { xF, xD, xW, R, q, totalCondenser, partialReboiler: true };
    return buildMccabe(curve, base).rMin;
  }, [curve, xF, xD, xW, q, totalCondenser, R]);

  // When the "× R_min" binding is on, the slider sets R/R_min; convert to R.
  const effectiveR = useFactor ? Math.max(0, R) * rMinForQ : R;
  const spec: MccabeSpec = { xF, xD, xW, R: effectiveR, q, totalCondenser, partialReboiler: true };
  const res: MccabeResult = useMemo(() => buildMccabe(curve, spec), [curve, xF, xD, xW, effectiveR, q, totalCondenser]);

  // approach-to-pinch: 0 (far) → 1 (at the cliff).  Fills + reddens.
  const approach = res.rMin > 1e-9 ? Math.max(0, Math.min(1, res.rMin / Math.max(effectiveR, res.rMin))) : 0;

  return (
    <Stack gap="sm" style={{ height: "100%" }}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <SegmentedControl size="xs" value={tab} onChange={(v) => setTab(v as "construction" | "sensitivity")}
          data={[{ label: "Construction", value: "construction" }, { label: "Sensitivity N(R)", value: "sensitivity" }]} />
        <ReadoutStrip res={res} effectiveR={effectiveR} />
      </Group>

      {/* THE banners — never a silent failure; the geometry of why is announced. */}
      {res.azeotrope && (
        <Alert color="orange" variant="light" title="Azeotrope — the staircase cannot cross y = x" py={6}>
          <Text size="xs">
            The equilibrium curve meets the 45° line at x ≈ {res.azeotrope.x.toFixed(3)} — no operating
            line steps past it. A simple column cannot purify beyond the azeotrope (e.g. why ethanol/water
            stops near ~89 mol%). Choose feed/product specs on one side of it.
          </Text>
        </Alert>
      )}
      {res.pinched && !res.azeotrope && (
        <Alert color="red" variant="light" title="Pinched — infinite stages" py={6}>
          <Text size="xs">
            R = {effectiveR.toFixed(3)} ≤ R_min(q) = {res.rMin.toFixed(3)}: the operating line touches the
            equilibrium curve{res.pinch ? ` at the pinch x ≈ ${res.pinch.x.toFixed(3)}` : ""} — the staircase
            is trapped and N → ∞. Raise the reflux above R_min.
          </Text>
        </Alert>
      )}

      <Box style={{ flex: 1, minHeight: 360, position: "relative" }}>
        {tab === "construction"
          ? <ConstructionPlot curve={curve} res={res} spec={spec} compA={compA} compB={compB} P={P} />
          : <SensitivityPlot curve={curve} spec={spec} effectiveR={effectiveR} />}
      </Box>

      {/* KNOBS — exactly the two whose consequence you feel, plus the binding. */}
      <Stack gap={6}>
        <Group gap="lg" align="center" wrap="wrap">
          <Box style={{ minWidth: 280, flex: 1 }}>
            <Group justify="space-between" gap={4}>
              <Text size="xs" fw={600}>
                {useFactor ? "R / R_min" : "Reflux ratio  R"} = {(useFactor ? R : effectiveR).toFixed(2)}
              </Text>
              <Tooltip label="bind the slider to R_min (× minimum reflux) instead of the absolute reflux ratio — '1.3× minimum' is often the better design lens" multiline w={260} withArrow>
                <Switch size="xs" checked={useFactor} label="× R_min" onChange={(e) => setUseFactor(e.currentTarget.checked)}
                  styles={{ label: { fontSize: 11 } }} />
              </Tooltip>
            </Group>
            <Slider
              value={R}
              min={useFactor ? 1.0 : 0.1}
              max={useFactor ? 5 : Math.max(8, res.rMin * 4)}
              step={useFactor ? 0.02 : 0.05}
              onChange={setR}
              color={approach > 0.85 ? "red" : "accent"}
              // the red R_min tick — you SEE how close to the cliff you are
              marks={useFactor ? [{ value: 1, label: "R_min" }] : [{ value: res.rMin, label: "R_min" }]}
              label={(v) => (useFactor ? `${v.toFixed(2)}×` : v.toFixed(2))}
            />
          </Box>
          <Box style={{ minWidth: 220, flex: 1 }}>
            <Text size="xs" fw={600}>Feed quality  q = {q.toFixed(2)} ({qRegime(q)})</Text>
            <Slider value={q} min={-0.5} max={1.5} step={0.05} onChange={setQ} color="accent"
              marks={Q_DETENTS} label={(v) => v.toFixed(2)} />
          </Box>
        </Group>

        {/* approach-to-pinch bar: fills and reddens as R → R_min */}
        <Group gap="xs" align="center">
          <Text size="xs" c="dimmed" w={120}>approach to pinch</Text>
          <Box style={{ flex: 1, height: 8, borderRadius: 4, background: "rgba(128,128,128,0.18)", overflow: "hidden" }}>
            <Box style={{ width: `${(approach * 100).toFixed(0)}%`, height: "100%",
              background: approach > 0.85 ? "#ff5252" : approach > 0.6 ? "#ffb74d" : PLOT_COLORS.accent,
              transition: "width 80ms linear" }} />
          </Box>
        </Group>

        {/* SET values — the problem statement (compact, not knobs) */}
        <Group gap="lg" wrap="wrap">
          <SetField label={`x_D (${compA})`} value={xD} onChange={(v) => setXD(clamp(v, xF + 0.01, 0.999))} />
          <SetField label={`x_W (${compA})`} value={xW} onChange={(v) => setXW(clamp(v, 0.001, xF - 0.01))} />
          <SetField label={`x_F (${compA})`} value={xF} onChange={(v) => setXF(clamp(v, xW + 0.01, xD - 0.01))} />
          <Tooltip label="total condenser: the distillate is liquid of composition x_D (no equilibrium stage).  partial condenser: the condenser IS one equilibrium stage — the count goes up by exactly one." multiline w={280} withArrow>
            <Switch size="xs" checked={!totalCondenser} label="partial condenser (+1 stage)"
              onChange={(e) => setTotalCondenser(!e.currentTarget.checked)} styles={{ label: { fontSize: 11 } }} />
          </Tooltip>
        </Group>

        {/* GLASS-BOX honesty caption — the single assumption, made visible. */}
        <Text size="xs" c="dimmed">
          Operating lines are STRAIGHT because Constant Molar Overflow (equimolar latent heats) is assumed;
          the equilibrium curve y*(x) is the REAL model curve at this P — not a constant-α toy. For
          energy-rigorous staging (CMO relaxed) the MESH <code>distillationColumn</code> is the truth; the
          Fenske/Underwood closed forms in <code>shortcutColumn</code> are the matching shortcut anchors for
          N_min / R_min.
        </Text>
      </Stack>
    </Stack>
  );
}

/*---------------------------------------------------------------------------*\
  The x-y construction: y*(x) + 45° + ROL + q-line + SOL + staircase.
\*---------------------------------------------------------------------------*/
function ConstructionPlot(
  { curve, res, spec, compA, compB, P }:
  { curve: ReturnType<typeof eqCurveFromTxyCsv>; res: MccabeResult; spec: MccabeSpec; compA: string; compB: string; P: number },
) {
  const cx = curve!.pts.map((p) => p.x);
  const cy = curve!.pts.map((p) => p.y);
  const { xD, xW, xF } = spec;

  const data: Record<string, unknown>[] = [
    // 45° reference
    { type: "scatter", mode: "lines", name: "y = x", x: [0, 1], y: [0, 1],
      line: { color: PLOT_COLORS.axis, width: 1, dash: "dash" }, hoverinfo: "skip" },
    // the REAL equilibrium curve y*(x)
    { type: "scatter", mode: "lines", name: `y*(x) — equilibrium (real)`, x: cx, y: cy,
      line: { color: PLOT_COLORS.accent, width: 2.5 },
      hovertemplate: `x: %{x:.4f}<br>y*: %{y:.4f}<extra></extra>` },
  ];

  if (!res.azeotrope) {
    // rectifying operating line: from the feed intersection up to (xD,xD)
    const fi = res.feedInt;
    data.push({
      type: "scatter", mode: "lines", name: "rectifying line",
      x: [Math.max(0, fi.x), xD], y: [res.rol.m * Math.max(0, fi.x) + res.rol.b, xD],
      line: { color: PLOT_COLORS.warm, width: 2 }, hoverinfo: "skip",
    });
    // q-line: from (xF,xF) to the feed intersection (vertical when q=1)
    data.push({
      type: "scatter", mode: "lines", name: "q-line",
      x: [xF, fi.x], y: [xF, fi.y],
      line: { color: PLOT_COLORS.series[4], width: 2, dash: "dot" }, hoverinfo: "skip",
    });
    // stripping operating line: from (xW,xW) to the feed intersection
    data.push({
      type: "scatter", mode: "lines", name: "stripping line",
      x: [xW, fi.x], y: [xW, fi.y],
      line: { color: PLOT_COLORS.warm2, width: 2 }, hoverinfo: "skip",
    });
    // the staircase
    data.push({
      type: "scatter", mode: "lines", name: `staircase — N = ${fmtN(res.nStages)}`,
      x: res.staircase.map((p) => p.x), y: res.staircase.map((p) => p.y),
      line: { color: PLOT_COLORS.text, width: 1.4 },
      hovertemplate: `x: %{x:.4f}<br>y: %{y:.4f}<extra>stage</extra>`,
    });
    // the feed stage corner (distinct marker)
    const feedCorner = stageCorner(res, res.feedStage);
    if (feedCorner) {
      data.push({
        type: "scatter", mode: "markers", name: `feed stage ${res.feedStage}`,
        x: [feedCorner.x], y: [feedCorner.y],
        marker: { color: PLOT_COLORS.series[5], size: 11, symbol: "diamond", line: { color: "#fff", width: 1 } },
        hovertemplate: `feed stage ${res.feedStage}<extra></extra>`,
      });
    }
    // the spec points
    data.push({
      type: "scatter", mode: "markers", name: "x_D, x_F, x_W",
      x: [xD, xF, xW], y: [xD, xF, xW],
      marker: { color: PLOT_COLORS.warm, size: 7, symbol: "circle-open", line: { width: 2 } },
      hoverinfo: "skip",
    });
  }
  // the pinch (red ring) when one exists
  if (res.pinch) {
    data.push({
      type: "scatter", mode: "markers", name: "pinch",
      x: [res.pinch.x], y: [res.pinch.y],
      marker: { color: "#ff5252", size: 12, symbol: "circle-open", line: { width: 2.5 } },
      hovertemplate: `pinch x ≈ ${res.pinch.x.toFixed(3)}<extra></extra>`,
    });
  }

  return (
    <Plot
      data={data}
      layout={{
        ...darkLayout,
        title: { text: `McCabe-Thiele · ${compA} / ${compB} · P = ${(P / 1e5).toFixed(3)} bar`,
          font: { ...darkLayout.font, size: 14 } },
        xaxis: { ...darkLayout.xaxis, title: { text: `liquid mole fraction x (${compA})` }, range: [0, 1], autorange: false },
        yaxis: { ...darkLayout.yaxis, title: { text: `vapour mole fraction y (${compA})` }, range: [0, 1], autorange: false },
        legend: { ...darkLayout.legend, orientation: "h", y: -0.18, x: 0.5, xanchor: "center" },
        margin: { ...darkLayout.margin, t: 44, b: 70 },
      }}
      config={PLOT_CONFIG}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
    />
  );
}

/*---------------------------------------------------------------------------*\
  Sensitivity: N(R) with the R_min asymptote + the N_min floor.
\*---------------------------------------------------------------------------*/
function SensitivityPlot(
  { curve, spec, effectiveR }:
  { curve: ReturnType<typeof eqCurveFromTxyCsv>; spec: MccabeSpec; effectiveR: number },
) {
  const sweep = useMemo(() => sweepReflux(curve!, spec, 70, 6), [curve, spec.xF, spec.xD, spec.xW, spec.q]);
  const pts = sweep.points.filter((p) => Number.isFinite(p.N));

  const data: Record<string, unknown>[] = [
    { type: "scatter", mode: "lines+markers", name: "N(R)",
      x: pts.map((p) => p.R), y: pts.map((p) => p.N),
      line: { color: PLOT_COLORS.accent, width: 2 }, marker: { size: 3 },
      hovertemplate: `R: %{x:.3f}<br>N: %{y}<extra></extra>` },
  ];
  // the current operating point (linked to the R-knob)
  if (Number.isFinite(effectiveR)) {
    const here = buildMccabe(curve!, { ...spec, R: effectiveR });
    if (Number.isFinite(here.nStages)) {
      data.push({ type: "scatter", mode: "markers", name: "you are here",
        x: [effectiveR], y: [here.nStages],
        marker: { color: PLOT_COLORS.warm, size: 12, symbol: "circle", line: { color: "#fff", width: 1 } },
        hovertemplate: `R = ${effectiveR.toFixed(3)}<br>N = ${here.nStages}<extra></extra>` });
    }
  }

  const yTop = Math.max(...pts.map((p) => p.N), sweep.nMin) * 1.15 + 2;
  const shapes = [
    // R_min vertical asymptote
    { type: "line", x0: sweep.rMin, x1: sweep.rMin, y0: 0, y1: yTop,
      line: { color: "#ff5252", width: 1.5, dash: "dash" } },
    // N_min floor
    { type: "line", x0: sweep.rMin, x1: pts.length ? pts[pts.length - 1]!.R : sweep.rMin, y0: sweep.nMin, y1: sweep.nMin,
      line: { color: PLOT_COLORS.series[4], width: 1, dash: "dot" } },
  ];

  return (
    <Plot
      data={data}
      layout={{
        ...darkLayout,
        title: { text: `N(R) — R_min = ${sweep.rMin.toFixed(3)} (red), N_min = ${sweep.nMin} (floor)`,
          font: { ...darkLayout.font, size: 14 } },
        xaxis: { ...darkLayout.xaxis, title: { text: "reflux ratio R" } },
        yaxis: { ...darkLayout.yaxis, title: { text: "equilibrium stages N" }, range: [0, yTop], autorange: false },
        legend: { ...darkLayout.legend, orientation: "h", y: -0.2, x: 0.5, xanchor: "center" },
        annotations: [
          { x: sweep.rMin, y: yTop * 0.92, text: "R_min — N → ∞", showarrow: false,
            font: { color: "#ff5252", size: 11 }, xanchor: "left" },
        ],
        shapes,
        margin: { ...darkLayout.margin, t: 44, b: 60 },
      }}
      config={PLOT_CONFIG}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
    />
  );
}

/*---------------------------------------------------------------------------*\
  Small UI helpers.
\*---------------------------------------------------------------------------*/
function ReadoutStrip({ res, effectiveR }: { res: MccabeResult; effectiveR: number }) {
  const ratio = res.rMin > 1e-9 ? effectiveR / res.rMin : Infinity;
  return (
    <Group gap={6} wrap="wrap" justify="flex-end">
      <Badge size="sm" variant="light" tt="none" color={res.pinched || res.azeotrope ? "red" : "teal"}>
        N = {res.pinched || res.azeotrope ? "∞" : `${res.nStagesFractional.toFixed(1)} → ${res.nStages}`}
      </Badge>
      {!res.pinched && !res.azeotrope && (
        <Badge size="sm" variant="light" tt="none" color="grape">feed stage {res.feedStage}</Badge>
      )}
      <Badge size="sm" variant="light" tt="none" color="orange">N_min = {res.nMin}</Badge>
      <Badge size="sm" variant="light" tt="none" color="red">R_min = {res.rMin.toFixed(3)}</Badge>
      {Number.isFinite(ratio) && (
        <Badge size="sm" variant="light" tt="none" color={ratio < 1.05 ? "red" : "blue"}>R/R_min = {ratio.toFixed(2)}</Badge>
      )}
    </Group>
  );
}

function SetField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Box style={{ minWidth: 130 }}>
      <Text size="xs" c="dimmed">{label} = {value.toFixed(3)}</Text>
      <Slider size="xs" value={value} min={0.001} max={0.999} step={0.005} onChange={onChange} color="gray"
        label={(v) => v.toFixed(3)} />
    </Box>
  );
}

function qRegime(q: number): string {
  if (Math.abs(q - 1) < 1e-6) return "saturated liquid";
  if (Math.abs(q) < 1e-6) return "saturated vapour";
  if (q > 1) return "subcooled liquid";
  if (q > 0) return "two-phase feed";
  return "superheated vapour";
}

function fmtN(n: number): string { return Number.isFinite(n) ? String(n) : "∞"; }

function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }

/** The (x,y) corner where the n-th stage step lands on the equilibrium curve.
 *  The staircase polyline is [start, curve1, opline1, curve2, opline2, …]; the
 *  curve corner of stage k is at index 2k−1. */
function stageCorner(res: MccabeResult, stage: number): { x: number; y: number } | null {
  const idx = 2 * stage - 1;
  return res.staircase[idx] ?? null;
}
