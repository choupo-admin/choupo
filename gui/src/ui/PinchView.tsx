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
  Pinch workspace: the hot + cold COMPOSITE CURVES of the solved flowsheet, with
  the minimum hot/cold utility targets, the pinch temperature, and the heat that
  integration could recover vs the utilities you pay for today.  Plus the
  classical GRID DIAGRAM (streams as lanes, the pinch as a vertical line, the
  candidate matches as connections) with a Pareto filter that omits minor
  streams from the drawing -- announced, never silent, numbers unchanged.
  Computed in the browser from the run (computePinch); the menu entry is greyed
  until a run makes it computable.
\*---------------------------------------------------------------------------*/

import { useMemo, useState, type ComponentProps } from "react";
import { Box, Group, NumberInput, SegmentedControl, Stack, Text, Badge, Tooltip } from "@mantine/core";

import { useStore } from "../state/store.js";
import { computePinch } from "../case/pinch.js";
import { Plot, PLOT_CONFIG, darkLayout } from "./plotting/plotly.js";
import { PinchGridPlot } from "./plotting/PinchGridPlot.js";

export function PinchView() {
  const runResult = useStore((s) => s.runResult);
  const flowsheet = useStore((s) => s.caseFiles.flowsheet);
  const paretoPct = useStore((s) => s.displayPrefs.pinchParetoPct);
  const setPrefs = useStore((s) => s.setDisplayPrefs);
  const [dTmin, setDTmin] = useState(10);
  const [view, setView] = useState<"composite" | "gcc" | "grid">("composite");

  const pinch = useMemo(() => computePinch(runResult, flowsheet, dTmin), [runResult, flowsheet, dTmin]);

  if (!pinch) {
    return (
      <Box p="xl">
        <Text c="dimmed">
          No heat duties to integrate yet. <strong>Run the flowsheet</strong> — the pinch
          analysis needs the converged duties + stream temperatures (at least one heating
          and one cooling duty).
        </Text>
      </Box>
    );
  }

  const recov = pinch.QhNow - pinch.QhMin;

  // Composite-curve traces, with the pinch marked by dashed lines at the hot &
  // cold pinch temperatures (where the curves come within ΔTmin).
  const compositeData = [
    {
      type: "scatter" as const, mode: "lines+markers" as const, name: "Hot composite (cool)",
      x: pinch.hotComposite.map((p) => p[0]), y: pinch.hotComposite.map((p) => p[1]),
      line: { color: "#ff5252", width: 2.5 }, marker: { size: 4 },
      hovertemplate: "H %{x:.0f} kW<br>T %{y:.1f} K<extra>hot</extra>",
    },
    {
      type: "scatter" as const, mode: "lines+markers" as const, name: "Cold composite (heat)",
      x: pinch.coldComposite.map((p) => p[0]), y: pinch.coldComposite.map((p) => p[1]),
      line: { color: "#4dabf7", width: 2.5 }, marker: { size: 4 },
      hovertemplate: "H %{x:.0f} kW<br>T %{y:.1f} K<extra>cold</extra>",
    },
  ];
  const pinchShapes = pinch.pinchHot == null ? [] : [
    { type: "line" as const, xref: "paper" as const, x0: 0, x1: 1, y0: pinch.pinchHot, y1: pinch.pinchHot,
      line: { color: "#ff5252", width: 1, dash: "dot" as const } },
    { type: "line" as const, xref: "paper" as const, x0: 0, x1: 1, y0: pinch.pinchCold!, y1: pinch.pinchCold!,
      line: { color: "#4dabf7", width: 1, dash: "dot" as const } },
  ];

  // Grand Composite Curve: net heat cascade vs shifted T; touches H=0 at the
  // pinch (marked).  Pockets = internal recovery; the tails are the utilities.
  const gccData = [
    {
      type: "scatter" as const, mode: "lines" as const, name: "Grand composite",
      x: pinch.gcc.map((p) => p[0]), y: pinch.gcc.map((p) => p[1]),
      line: { color: "#69db7c", width: 2.5 },
      hovertemplate: "net H %{x:.0f} kW<br>T* %{y:.1f} K<extra></extra>",
    },
    ...(pinch.pinchShift == null ? [] : [{
      type: "scatter" as const, mode: "text+markers" as const, name: "pinch",
      x: [0], y: [pinch.pinchShift], text: ["pinch"], textposition: "middle right" as const,
      marker: { color: "#ffd43b", size: 10, symbol: "circle" as const },
      textfont: { color: "#ffd43b" }, hoverinfo: "skip" as const, showlegend: false,
    }]),
  ];

  type PlotData = ComponentProps<typeof Plot>["data"];
  const isGcc = view === "gcc";

  return (
    <Stack gap="xs" h="100%" style={{ minHeight: 0 }} p="sm">
      <Group justify="space-between" align="center">
        <Group gap="lg">
          <Stat label="Hot utility" now={pinch.QhNow} min={pinch.QhMin} />
          <Stat label="Cold utility" now={pinch.QcNow} min={pinch.QcMin} />
          <Box>
            <Text size="xs" c="dimmed">Pinch</Text>
            {pinch.pinchHot != null ? (
              <>
                <Text size="xs" ff="monospace">
                  <span style={{ display: "inline-block", width: 40, opacity: 0.7 }}>hot</span>
                  {pinch.pinchHot.toFixed(1)} K
                </Text>
                <Text size="xs" ff="monospace">
                  <span style={{ display: "inline-block", width: 40, opacity: 0.7 }}>cold</span>
                  {pinch.pinchCold!.toFixed(1)} K
                </Text>
              </>
            ) : (
              <Text size="sm" ff="monospace">—</Text>
            )}
          </Box>
          {recov > 0.5 ? (
            <Badge color="teal" variant="light" size="lg" styles={{ root: { textTransform: "none" } }}>
              ↓ {recov.toFixed(0)} kW recoverable each side
            </Badge>
          ) : (
            /* THE one no-recovery statement (causal) -- the stats above
               already show Current = Target; nothing below repeats it. */
            <Badge color="gray" variant="light" size="lg" styles={{ root: { textTransform: "none" } }}>
              no composite overlap at ΔTmin = {dTmin} K — utilities cover every duty
            </Badge>
          )}
        </Group>
        <Group gap={10} align="center">
          <SegmentedControl size="xs" value={view}
            onChange={(v) => setView(v as "composite" | "gcc" | "grid")}
            data={[
              { label: "Composite", value: "composite" },
              { label: "Grand composite", value: "gcc" },
              { label: "Grid", value: "grid" },
            ]} />
          <Group gap={6} align="center">
            <Text size="xs" c="dimmed">ΔT<sub>min</sub></Text>
            <NumberInput value={dTmin} onChange={(v) => setDTmin(typeof v === "number" ? v : 10)}
              min={1} max={60} step={1} w={90} size="xs" suffix=" K" />
          </Group>
          {view === "grid" && (
            <Group gap={6} align="center">
              <Tooltip label="minor streams below this % of process duty are omitted from the grid drawing only — targets always count every stream" multiline w={230} withArrow>
                <Text size="xs" c="dimmed" style={{ cursor: "help" }}>cutoff</Text>
              </Tooltip>
              <NumberInput value={paretoPct}
                onChange={(v) => setPrefs({ pinchParetoPct: typeof v === "number" ? Math.max(0, Math.min(50, v)) : 5 })}
                min={0} max={50} step={1} w={80} size="xs" suffix=" %" />
            </Group>
          )}
        </Group>
      </Group>

      <Box style={{ flex: 1, minHeight: 0, overflowY: view === "grid" ? "auto" : undefined }}>
        {view === "grid" ? (
          <PinchGridPlot pinch={pinch} paretoPct={paretoPct} />
        ) : (
        <Plot
          data={(isGcc ? gccData : compositeData) as PlotData}
          layout={{
...darkLayout,
            title: { text: isGcc
              ? `Grand composite curve  ·  ΔTmin = ${dTmin} K`
              : `Composite curves  ·  ΔTmin = ${dTmin} K`, font: {...darkLayout.font, size: 14 } },
            xaxis: {...darkLayout.xaxis, title: { text: isGcc ? "Net heat flow  H (kW)" : "Cumulative enthalpy  H (kW)" } },
            yaxis: {...darkLayout.yaxis, title: { text: isGcc ? "Shifted T*  (K)" : "T (K)" } },
            legend: {...darkLayout.legend, x: 0.02, y: 0.98 },
            shapes: isGcc ? [] : pinchShapes,
          }}
          config={PLOT_CONFIG}
          style={{ width: "100%", height: "100%" }}
          useResizeHandler
        />
        )}
      </Box>

      {pinch.matches.length > 0 && (
        <Box>
          <Text size="xs" c="dimmed" mb={2}>
            Candidate matches (heuristic screening — direct shifted-T overlap only, it can miss
            feasible counter-current pairs; respect the pinch ~{pinch.pinchHot?.toFixed(0)} K; the
            agent sizes them, you re-run).  Hand these to the 🤖 console as heat-links:
          </Text>
          <Group gap={6}>
            {pinch.matches.slice(0, 6).map((m, i) => (
              <Badge key={i} variant="light" size="sm"
                color={m.side === "above" ? "orange" : "cyan"}
                styles={{ root: { textTransform: "none" } }}
                title={`${m.hot} (hot) can heat ${m.cold} (cold) — ${m.side} the pinch`}>
                {m.hot} → {m.cold} · ≤{m.capKW.toFixed(0)} kW · {m.side}
              </Badge>
            ))}
          </Group>
        </Box>
      )}
      <Text size="xs" c="dimmed">
        {pinch.streams.length} thermal streams · heating duties are cold streams (need heat),
        cooling duties are hot streams.
        {recov > 0.5 &&
          ` The composite overlap (${recov.toFixed(0)} kW) is recoverable by heat integration; the tails are the minimum utilities.`}
      </Text>
    </Stack>
  );
}

// The two quantities NAMED (forum #93: "1412 → 1412" said neither which was
// the target nor why they might be equal): Current = what the flowsheet pays
// today; Target = the minimum the pinch analysis says is needed.
function Stat({ label, now, min }: { label: string; now: number; min: number }) {
  return (
    <Box>
      <Text size="xs" c="dimmed">{label}</Text>
      <Text size="xs" ff="monospace">
        <span style={{ display: "inline-block", width: 56, opacity: 0.7 }}>Current</span>
        <span style={{ color: "var(--mantine-color-gray-5)" }}>{now.toFixed(0)} kW</span>
      </Text>
      <Text size="xs" ff="monospace">
        <span style={{ display: "inline-block", width: 56, opacity: 0.7 }}>Target</span>
        <strong style={{ color: "var(--mantine-color-teal-4)" }}>{min.toFixed(0)} kW</strong>
      </Text>
    </Box>
  );
}
