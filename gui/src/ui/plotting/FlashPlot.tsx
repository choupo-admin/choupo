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
  FlashPlot — the binary isothermal flash on the x-y diagram, the next member of
  the operating-line graphical-method family (after the T-x-y boiling envelope).

  The equilibrium curve y*(x) crosses the bridge ONCE (the engine's T-x-y run at
  the case P + γ-model); this component reimplements NO physics — it consumes
  that frozen curve (case/binaryFlash.ts) and draws the GRAPHICAL construction,
  redrawing at 60 fps as the student turns a knob (no WASM re-run):
    · the real equilibrium curve y*(x) + the 45° line,
    · the FEED z marked on both axes,
    · the horizontal TIE-LINE from the liquid x_liq to the vapour y_vap,
    · the LEVER-RULE segments on the tie-line (the two arms whose ratio IS V/F),
    · live badges: V/F, x, y, the flash regime.

  Knobs: a flash is fixed by 2 of {T, P, V/F} (Duhem).  P + the γ-model are
  frozen in the curve; the student turns T (the well-conditioned pair Choupo
  teaches) and SEES V/F as a RESULT — or switches to "spec V/F" (turn V/F, read
  T).  At the bubble point V/F→0 (all liquid); at the dew point V/F→1 (all
  vapour); outside the envelope the feed is single-phase and the tie-line
  collapses (an honest banner, no phantom split).
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import { Alert, Badge, Group, SegmentedControl, Slider, Stack, Text } from "@mantine/core";

import { Plot, PLOT_COLORS, PLOT_CONFIG, darkLayout } from "./plotly.js";
import { useStore } from "../../state/store.js";
import { kToDisplay, temperatureLabel, paToDisplay, pressureLabel, formatSig } from "../../state/displayUnits.js";
import {
  eqCurveFromTxyCsv, envelopeAtFeed, flashAtT, flashAtVF, leverSegments,
} from "../../case/binaryFlash.js";

export function FlashPlot({ csv, compA, compB, P }: {
  csv: string;
  compA: string;
  compB: string;
  P: number;        // case pressure (Pa) — the curve is frozen at this P
}) {
  const prefs = useStore((s) => s.displayPrefs);
  const Tu = prefs.temperature, Pu = prefs.pressure;
  const tUnit = temperatureLabel(Tu);
  const tConv = (K: number) => kToDisplay(K, Tu);

  const curve = useMemo(() => eqCurveFromTxyCsv(csv), [csv]);

  // The feed composition z (mole fraction of compA = the curve's indexed
  // component).  A knob the student drags along the diagonal.
  const [z, setZ] = useState(0.5);
  // spec mode: T (default — read V/F) or V/F (read T).  Duhem: pick 2 of {T,P,VF}.
  const [spec, setSpec] = useState<"T" | "VF">("T");
  // the temperature knob, stored as a 0..1 position WITHIN the feed's
  // [bubble, dew] window so dragging always lands inside the two-phase region.
  const [tPos, setTPos] = useState(0.5);
  const [vfTarget, setVfTarget] = useState(0.5);

  const env = useMemo(() => (curve ? envelopeAtFeed(curve, z) : null), [curve, z]);

  if (!curve || !env) {
    return (
      <Alert color="yellow" variant="light" title="No equilibrium curve">
        The binary T-x-y curve could not be read — pick exactly two VLE-able components.
      </Alert>
    );
  }

  const Tlo = Math.min(env.Tbubble, env.Tdew);
  const Thi = Math.max(env.Tbubble, env.Tdew);
  const Tflash = Tlo + (Thi - Tlo) * tPos;

  const sol = spec === "T" ? flashAtT(curve, z, Tflash) : flashAtVF(curve, z, vfTarget);
  const seg = leverSegments(sol);
  const twoPhase = sol.regime === "two-phase";

  // ----- traces -----
  const diag = { x: [0, 1], y: [0, 1] };
  const traces: any[] = [
    {
      type: "scatter", mode: "lines", name: "y = x",
      x: diag.x, y: diag.y,
      line: { color: PLOT_COLORS.accent2, width: 1, dash: "dot" },
      hoverinfo: "skip",
    },
    {
      type: "scatter", mode: "lines", name: "equilibrium y*(x)",
      x: curve.x, y: curve.yEq,
      line: { color: PLOT_COLORS.accent, width: 2.5 },
      hovertemplate: `x=%{x:.3f}<br>y*=%{y:.3f}<extra>equilibrium</extra>`,
    },
    // feed z: a vertical guide on x = z up to the diagonal (where the feed
    // point sits, z on both coordinates) — the lever pivots here.
    {
      type: "scatter", mode: "lines", name: `feed z (${compA})`,
      x: [z, z], y: [0, z],
      line: { color: PLOT_COLORS.warm2, width: 1, dash: "dash" },
      hoverinfo: "skip",
    },
    {
      type: "scatter", mode: "markers+text", name: "feed z",
      x: [z], y: [z], text: [`z=${z.toFixed(3)}`], textposition: "bottom right",
      marker: { color: PLOT_COLORS.warm2, size: 9, symbol: "diamond" },
      textfont: { color: PLOT_COLORS.warm2, size: 11 },
      hovertemplate: `feed z=%{x:.3f}<extra></extra>`,
    },
  ];

  if (twoPhase) {
    // the TIE-LINE: horizontal chord at the equilibrium level from (x_liq, y_vap)
    // to (y_vap, y_vap) — the equilibrium ties the liquid x_liq to the vapour
    // y_vap at the same flash condition.  Drawn at y = y_vap so the chord lands
    // on the curve at x_liq and on the diagonal at y_vap.
    const yv = sol.yVap;
    traces.push(
      {
        type: "scatter", mode: "lines", name: "tie-line",
        x: [sol.xLiq, sol.yVap], y: [yv, yv],
        line: { color: PLOT_COLORS.warm, width: 2 },
        hovertemplate: `tie-line<extra></extra>`,
      },
      // the LEVER-RULE arms split at the feed pivot z: liquidArm (z→x_liq, ∝ V)
      // and vapourArm (z→y_vap, ∝ L), drawn as two coloured segments + labels.
      {
        type: "scatter", mode: "lines", name: "liquid arm (∝ V)",
        x: [sol.xLiq, z], y: [yv, yv],
        line: { color: PLOT_COLORS.series[4], width: 6 },
        opacity: 0.7, hoverinfo: "skip",
      },
      {
        type: "scatter", mode: "lines", name: "vapour arm (∝ L)",
        x: [z, sol.yVap], y: [yv, yv],
        line: { color: PLOT_COLORS.series[5], width: 6 },
        opacity: 0.7, hoverinfo: "skip",
      },
      // the three knot points: liquid on the curve, feed pivot, vapour on the diagonal
      {
        type: "scatter", mode: "markers+text",
        x: [sol.xLiq, z, sol.yVap], y: [yv, yv, yv],
        text: [`x=${sol.xLiq.toFixed(3)}`, "", `y=${sol.yVap.toFixed(3)}`],
        textposition: "top center",
        marker: {
          color: [PLOT_COLORS.accent, PLOT_COLORS.warm2, PLOT_COLORS.warm],
          size: [9, 7, 9], symbol: ["circle", "x", "square"],
        },
        textfont: { size: 11 },
        showlegend: false,
        hovertemplate: `%{x:.3f}<extra></extra>`,
      },
      // a dotted drop from the vapour knot on the diagonal down to the x-axis
      // (so y_vap is read on the SAME x-axis the liquid is) — pedagogical.
      {
        type: "scatter", mode: "lines",
        x: [sol.xLiq, sol.xLiq], y: [0, yv],
        line: { color: PLOT_COLORS.accent, width: 1, dash: "dot" },
        showlegend: false, hoverinfo: "skip",
      },
    );
  }

  const regimeColor = twoPhase ? "teal" : "orange";
  const regimeLabel = sol.regime === "two-phase" ? "two-phase (V + L)"
    : sol.regime === "all-liquid" ? "single phase — all liquid (V/F = 0)"
    : "single phase — all vapour (V/F = 1)";

  return (
    <Stack gap="xs" style={{ height: "100%" }}>
      {/* live readout badges */}
      <Group gap="xs" wrap="wrap">
        <Badge size="lg" variant="filled" color="accent" tt="none">V/F = {sol.VF.toFixed(3)}</Badge>
        <Badge size="lg" variant="light" color="cyan" tt="none">x ({compA}) = {sol.xLiq.toFixed(3)}</Badge>
        <Badge size="lg" variant="light" color="orange" tt="none">y ({compA}) = {sol.yVap.toFixed(3)}</Badge>
        <Badge size="lg" variant="light" color="grape" tt="none">
          T = {formatSig(tConv(sol.T))} {tUnit}{spec === "VF" ? " (result)" : ""}
        </Badge>
        <Badge size="lg" variant="outline" color={regimeColor} tt="none">{regimeLabel}</Badge>
      </Group>

      {/* the construction caption — glass-box, persistent */}
      <Text size="xs" c="dimmed">
        A binary isothermal flash is fixed by 2 numbers (Duhem): P = {formatSig(paToDisplay(P, Pu))} {pressureLabel(Pu)}
        {" "}and the γ-model are frozen in the curve below — turn {spec === "T" ? "T" : "V/F"} and read the split.
        The curve is the REAL model curve (the engine's y*(x), not a sketch). Lever rule:
        {" "}V/F = (z − x)/(y − x) = {seg.liquidArm.toFixed(3)} / {seg.total.toFixed(3)} = {Number.isFinite(seg.vfFromArms) ? seg.vfFromArms.toFixed(3) : "—"}.
      </Text>

      {sol.note && (
        <Alert color="orange" variant="light" py={6}>
          <Text size="xs">{sol.note} — at this condition the feed does not split, so there is no tie-line to draw.</Text>
        </Alert>
      )}

      {/* knobs */}
      <Group gap="lg" align="center" wrap="wrap">
        <Group gap={6} align="center">
          <Text size="xs" c="dimmed" w={64}>feed z</Text>
          <Slider w={170} min={0.01} max={0.99} step={0.01} value={z}
            onChange={setZ} label={(v) => v.toFixed(2)} color="orange" />
        </Group>
        <SegmentedControl size="xs" value={spec}
          onChange={(v) => setSpec(v as "T" | "VF")}
          data={[{ label: "spec T", value: "T" }, { label: "spec V/F", value: "VF" }]} />
        {spec === "T" ? (
          <Group gap={6} align="center">
            <Text size="xs" c="dimmed" w={64}>T (flash)</Text>
            <Slider w={210} min={0} max={1} step={0.005} value={tPos}
              onChange={setTPos}
              label={() => `${formatSig(tConv(Tflash))} ${tUnit}`} color="grape"
              marks={[
                { value: 0, label: `bubble` },
                { value: 1, label: `dew` },
              ]} />
          </Group>
        ) : (
          <Group gap={6} align="center">
            <Text size="xs" c="dimmed" w={64}>V/F</Text>
            <Slider w={210} min={0} max={1} step={0.005} value={vfTarget}
              onChange={setVfTarget} label={(v) => v.toFixed(3)} color="accent"
              marks={[{ value: 0, label: "bubble" }, { value: 1, label: "dew" }]} />
          </Group>
        )}
      </Group>

      <Text size="xs" c="dimmed">
        feed bubble point {formatSig(tConv(env.Tbubble))} {tUnit} (V/F → 0) ·
        feed dew point {formatSig(tConv(env.Tdew))} {tUnit} (V/F → 1)
      </Text>

      <Plot
        data={traces}
        layout={{
          ...darkLayout,
          title: {
            text: `Binary flash  ·  ${compA} / ${compB}  ·  P = ${formatSig(paToDisplay(P, Pu))} ${pressureLabel(Pu)}`,
            font: { ...darkLayout.font, size: 14 },
          },
          xaxis: { ...darkLayout.xaxis, title: { text: `x of ${compA} (liquid)` }, range: [0, 1] },
          yaxis: { ...darkLayout.yaxis, title: { text: `y of ${compA} (vapour)` }, range: [0, 1], scaleanchor: "x", scaleratio: 1 },
          legend: { ...darkLayout.legend, x: 0.02, y: 0.98 },
          showlegend: true,
        }}
        config={PLOT_CONFIG}
        style={{ width: "100%", flex: 1, minHeight: 0 }}
        useResizeHandler
      />
    </Stack>
  );
}
