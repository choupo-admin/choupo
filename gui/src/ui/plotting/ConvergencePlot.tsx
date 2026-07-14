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
  Convergence plot.  Residual vs iteration on a semi-log y axis -- one
  curve per loop (e.g. reactor Newton, separator Wegstein).  Classic
  diagnostic that students should read before trusting a result.
\*---------------------------------------------------------------------------*/

import type { ConvergenceCurve } from "../../adapters/SolverAdapter.js";
import { Box, Text } from "@mantine/core";
import { Plot, PLOT_COLORS, PLOT_CONFIG, darkLayout } from "./plotly.js";

// Engine default recycle tolerance (`recycleTol` in the solver).  Drawn as a
// reference line so the global mass/energy curves can be read against it.
const DEFAULT_RECYCLE_TOL = 1e-5;

export function ConvergencePlot({
  curves,
  tolerance = DEFAULT_RECYCLE_TOL,
}: {
  curves: ConvergenceCurve[];
  tolerance?: number;
}) {
  // A converged inner solve can report residual EXACTLY 0 (or below machine
  // precision); on a log axis that is -infinity and the curve plunges
  // vertically to the floor -- a visualisation artefact, not a divergence.
  // Clamp to a visible floor and mark that point as "converged" instead of
  // letting it spike off the bottom.
  const FLOOR = 1e-13;

  // The GLOBAL recycle residual (mass / energy balance, feed-normalised) is the
  // headline the student reads; the per-unit INNER solves (each unit's own
  // Newton/Wegstein) are secondary diagnostics that converge quadratically and
  // so drop steeply at the end (correct, but they crowd the headline).  Draw
  // the global curves bold and the inner solves thin + faded so the steep
  // unit-level drops read as background, not as the main signal.
  const isGlobal = (label: string) =>
    /global|mass balance|energy balance/i.test(label);

  // --- the teaching line: read the curves, state what the student is seeing.
  // A GLOBAL (recycle) curve means a tear loop closed; only inner solves means
  // a single-pass case whose "convergence" is one unit's own Newton march.
  const globals = curves.filter((c) => isGlobal(c.label));
  const lead = globals[0] ?? curves.reduce(
    (a, b) => (b.residuals.length > (a?.residuals.length ?? 0) ? b : a),
    curves[0]);
  const lesson = (() => {
    if (!lead || lead.residuals.length === 0) return null;
    const r0 = lead.residuals[0] ?? 0;
    const rN = lead.residuals[lead.residuals.length - 1] ?? 0;
    const nOuter = lead.residuals.length;
    const conv = rN <= tolerance || rN <= 1e-10;
    const exp = (v: number) => (v > 0 ? v.toExponential(1) : "0");
    if (globals.length > 0) {
      // recycle: the tear loop
      return conv
        ? `Recycle converged in ${nOuter} outer iteration${nOuter === 1 ? "" : "s"}: the global balance residual fell ${exp(r0)} → ${exp(rN)}. Each iteration re-runs the units with the updated tear stream; convergence is the tear stream no longer changing (the fixed point) — THIS is why the loop closes, not a number of passes you chose.`
        : `Recycle did NOT reach tolerance in ${nOuter} iterations (residual ${exp(rN)} > ${exp(tolerance)}): the tear loop is still moving. Watch for a residual that rises (a blow-up, marked) vs one that plateaus (a slow but stable march).`;
    }
    // single pass: the inner solve
    return `Single-pass case: no recycle loop. The curve is one unit's own inner solve (Newton/Wegstein) marching its residual ${exp(r0)} → ${exp(rN)} to the equation set's root — the ${conv ? "solve converged" : "solve is still moving"}. A steady flowsheet with a recycle would add a bold GLOBAL curve here.`;
  })();

  const data = curves.map((c, i) => {
    const global = isGlobal(c.label);
    const y = c.residuals.map((r) => (r > FLOOR ? r : FLOOR));
    const convergedAt = c.residuals.findIndex((r) => r <= FLOOR);
    const color = global
      ? (/energy/i.test(c.label) ? PLOT_COLORS.warm : PLOT_COLORS.accent)
      : PLOT_COLORS.series[i % PLOT_COLORS.series.length];
    return {
      type: "scatter" as const,
      mode: "lines+markers" as const,
      name: global ? c.label : c.label + " (inner)",
      x: c.residuals.map((_, k) => k + 1),
      y,
      line: { color, width: global ? 3 : 1, dash: global ? undefined : ("dot" as const) },
      marker: {
        size: global ? 8 : 5,
        // flag the converged-to-zero point with a check-like ring, not a plunge
        symbol: c.residuals.map((_, k) => (k === convergedAt ? "circle-open" : "circle")),
      },
      opacity: global ? 1 : 0.45,
      hovertemplate:
        "iter %{x}<br>r = %{y:.2e}" +
        (convergedAt >= 0 ? " (converged at floor)" : "") +
        "<extra>" + c.label + "</extra>",
    };
  });

  // Longest curve sets the x-extent the tolerance line spans.
  const maxIter = curves.reduce((m, c) => Math.max(m, c.residuals.length), 0);
  const showTol = tolerance > 0 && maxIter > 0;

  // Model-refinement restarts (e.g. CMO -> full-MESH, or non-reactive ->
  // reactive): a residual that JUMPS UP by orders of magnitude AFTER a prior
  // phase had already converged is NOT a divergence -- it is a more rigorous
  // model taking over from the cheap one's converged profile (the warm-started
  // ladder).  Auto-detect and mark them so the spike reads as "new model", not
  // a blow-up.  (The x-axis is the OUTER march -- pseudo-time in steady state,
  // i.e. the path to the fixed point, NOT physical time.)
  const switchIters = new Set<number>();
  for (const c of curves)
    for (let k = 1; k < c.residuals.length; k++) {
      const prev = c.residuals[k - 1] ?? 0, cur = c.residuals[k] ?? 0;
      if (prev > FLOOR && prev < 0.1 && cur > prev * 50) switchIters.add(k + 1);
    }

  const shapes: Record<string, unknown>[] = [];
  const annotations: Record<string, unknown>[] = [];
  if (showTol) {
    shapes.push({
      type: "line", xref: "x", yref: "y",
      x0: 1, x1: maxIter, y0: tolerance, y1: tolerance,
      line: { color: PLOT_COLORS.grid, width: 1, dash: "dash" },
    });
    annotations.push({
      xref: "paper", yref: "y", x: 0.02, y: tolerance,
      xanchor: "left", yanchor: "bottom",
      text: `tol ${tolerance.toExponential(0)}`,
      showarrow: false,
      font: {...darkLayout.font, size: 10, color: PLOT_COLORS.grid },
    });
  }
  for (const it of switchIters) {
    shapes.push({
      type: "line", xref: "x", yref: "paper",
      x0: it - 0.5, x1: it - 0.5, y0: 0, y1: 1,
      line: { color: PLOT_COLORS.warm, width: 1, dash: "dot" },
    });
    annotations.push({
      xref: "x", yref: "paper", x: it - 0.5, y: 1,
      xanchor: "left", yanchor: "top",
      text: " model refines ↑",
      showarrow: false,
      font: {...darkLayout.font, size: 9, color: PLOT_COLORS.warm },
    });
  }

  return (
    <Box style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", minHeight: 0 }}>
      {lesson && (
        <Text size="xs" c="dimmed" px="sm" py={6}
          style={{ borderBottom: "1px solid #333", lineHeight: 1.35 }}>
          {lesson}
        </Text>
      )}
      <Box style={{ flex: 1, minHeight: 0 }}>
    <Plot
      data={data}
      layout={{
...darkLayout,
        title: { text: "Convergence residuals — global (bold) vs inner solves (faded)", font: {...darkLayout.font, size: 13 } },
        xaxis: {...darkLayout.xaxis,
          title: { text: "iteration  (pseudo-time — the march to the fixed point, not physical time)" },
          dtick: 1 },
        yaxis: {
...darkLayout.yaxis,
          title: { text: "residual (feed-normalised)" },
          type: "log",
          exponentformat: "power",
        },
        legend: {...darkLayout.legend, x: 0.98, y: 0.98, xanchor: "right" },
        shapes: shapes as never,
        annotations: annotations as never,
      }}
      config={PLOT_CONFIG}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
    />
      </Box>
    </Box>
  );
}
