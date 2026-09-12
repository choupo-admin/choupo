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
  /** The two components of the binary, as a PAIR — the order is not read.
   *  Which of them the axes carry is the CSV's own statement (see below). */
  compA: string;
  compB: string;
  P: number;        // case pressure (Pa) — the curve is frozen at this P
}) {
  const prefs = useStore((s) => s.displayPrefs);
  const Tu = prefs.temperature, Pu = prefs.pressure;
  const tUnit = temperatureLabel(Tu);
  const tConv = (K: number) => kToDisplay(K, Tu);

  const curve = useMemo(() => eqCurveFromTxyCsv(csv), [csv]);

  // The feed composition z (mole fraction of the curve's indexed component —
  // `axisComp` below).  A knob the student drags along the diagonal.
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

  //  WHICH COMPONENT THE AXES CARRY IS THE CSV'S OWN STATEMENT.  The engine
  //  sweeps x of the MORE VOLATILE component of the pair
  //  (methodFeeds.binaryVleSpec reorders by Tb so y*(x) sits above the
  //  diagonal), and `eqCurveFromTxyCsv` reads that name straight off the header
  //  `x[<comp>]`.  So the pair arrives here as a SET and the axis component is
  //  read, never inferred from the argument order: a caller that listed the
  //  pair the other way round previously labelled BOTH axes, both badges and
  //  the feed guide for the component that is not on them.
  const axisComp = curve.comp;
  const partnerComp = compA === axisComp ? compB : compA;

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
      type: "scatter", mode: "lines", name: `feed z (${axisComp})`,
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
    //  THE FLASH OPERATING LINE -- the construction this diagram exists for,
    //  and the one it did not draw until 2026-09-12 (Vitor, on the live app:
    //  "aqui aparece a recta operatoria famosa de um flash!  Nao e a regra da
    //  alavanca!").  What stood here instead were the LEVER-RULE arms on a
    //  horizontal tie-line.  The two are not alternatives of equal standing:
    //
    //    the OPERATING LINE SOLVES the flash -- an overall balance
    //    F z = L x + V y, drawn as a straight line, whose INTERSECTION with
    //    y*(x) IS the answer.  Give a student z and V/F and this construction
    //    hands them x and y with a ruler;
    //
    //    the lever arms MEASURE the split once x and y are already known.
    //
    //  So the line is drawn and the arms are not.  The lever arithmetic is NOT
    //  lost: it stays in the caption below, stated as
    //  V/F = (z - x)/(y - x) over the numbers the plot is showing.  One
    //  construction on the canvas, saying one thing.
    //
    //  From F z = L x + V y with L = F(1 - VF) and V = F VF:
    //        y = z/VF - x (1 - VF)/VF
    //  Two identities make this self-checking, and both are worth knowing:
    //  at x = z it gives y = z, so the line ALWAYS passes through the feed
    //  point on the 45-degree diagonal; and it passes through (xLiq, yVap)
    //  because that pair is what the flash solved.  A line that misses either
    //  is a line drawn from the wrong numbers.
    const VF = Math.min(Math.max(sol.VF, 1e-9), 1 - 1e-9);
    const m = -(1 - VF) / VF;          // slope: -L/V
    const b = z / VF;                  // intercept: (F/V) z

    //  CLIP TO THE UNIT SQUARE rather than let Plotly autorange: a mole
    //  fraction axis may not show a value it cannot have, and at VF -> 0 the
    //  slope runs to -infinity.  Collect where the line crosses the four
    //  sides, keep the points inside the box, and take the two extremes.
    const inBox = (v: number) => v >= -1e-9 && v <= 1 + 1e-9;
    const pts: Array<[number, number]> = [];
    for (const x of [0, 1]) { const y = b + m * x; if (inBox(y)) pts.push([x, y]); }
    for (const y of [0, 1]) { const x = (y - b) / m; if (inBox(x)) pts.push([x, y]); }
    pts.sort((p, q) => p[0] - q[0]);
    const lo = pts[0], hi = pts[pts.length - 1];
    //  The fallback is the VERTICAL line x = z, which is what the operating
    //  line BECOMES at the bubble point (V/F -> 0, slope -> -infinity): a
    //  degenerate case drawn honestly rather than dropped.
    const opX = (lo && hi && pts.length >= 2) ? [lo[0], hi[0]] : [z, z];
    const opY = (lo && hi && pts.length >= 2) ? [lo[1], hi[1]] : [0, 1];

    traces.push(
      {
        type: "scatter", mode: "lines",
        name: `operating line (slope −L/V = ${m.toFixed(3)})`,
        x: opX, y: opY,
        line: { color: PLOT_COLORS.warm, width: 2.5 },
        hovertemplate: `operating line: y = ${b.toFixed(3)} − ${Math.abs(m).toFixed(3)} x<extra></extra>`,
      },
      //  THE ANSWER IS THE INTERSECTION, so it is marked ON the curve and
      //  nowhere else -- one point, not a row of three.
      {
        type: "scatter", mode: "markers+text", name: "flash point (x, y)",
        x: [sol.xLiq], y: [sol.yVap],
        text: [`x=${sol.xLiq.toFixed(3)}, y=${sol.yVap.toFixed(3)}`],
        textposition: "top left",
        marker: { color: PLOT_COLORS.accent, size: 11, symbol: "circle",
                  line: { color: PLOT_COLORS.warm, width: 1.5 } },
        textfont: { size: 11 },
        hovertemplate: `x=%{x:.3f}<br>y=%{y:.3f}<extra>flash</extra>`,
      },
      //  Drops to BOTH axes: x is read below, y is read at the left, off the
      //  same point.  Without them a reader has to eyeball the ordinate.
      {
        type: "scatter", mode: "lines",
        x: [sol.xLiq, sol.xLiq], y: [0, sol.yVap],
        line: { color: PLOT_COLORS.accent, width: 1, dash: "dot" },
        showlegend: false, hoverinfo: "skip",
      },
      {
        type: "scatter", mode: "lines",
        x: [0, sol.xLiq], y: [sol.yVap, sol.yVap],
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
        <Badge size="lg" variant="light" color="cyan" tt="none">x ({axisComp}) = {sol.xLiq.toFixed(3)}</Badge>
        <Badge size="lg" variant="light" color="orange" tt="none">y ({axisComp}) = {sol.yVap.toFixed(3)}</Badge>
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
            text: `Binary flash  ·  ${axisComp} / ${partnerComp}  ·  P = ${formatSig(paToDisplay(P, Pu))} ${pressureLabel(Pu)}`,
            font: { ...darkLayout.font, size: 14 },
          },
          //  `constrain: "domain"` IS LOAD-BEARING, not tidiness.  The y axis below
          //  carries `scaleanchor: "x"` so the 45-degree diagonal is drawn at 45
          //  degrees -- correct, and required of an x-y equilibrium diagram.  But
          //  Plotly satisfies that ratio by default by WIDENING THE RANGE of the
          //  anchored axis, not by shrinking the drawing area: in a box four times
          //  wider than tall the declared [0, 1] was silently stretched to about
          //  [-1.5, 2.5], so a MOLE FRACTION axis showed negative values and values
          //  above one, with the equilibrium curve squeezed into the middle third.
          //  "domain" moves the give to the plot area instead.  Measured on the
          //  rendered page, not reasoned about.
          xaxis: { ...darkLayout.xaxis, title: { text: `x of ${axisComp} (liquid)` }, range: [0, 1], constrain: "domain" },
          yaxis: { ...darkLayout.yaxis, title: { text: `y of ${axisComp} (vapour)` }, range: [0, 1], scaleanchor: "x", scaleratio: 1 },
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
