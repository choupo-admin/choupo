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
  Profile plot.  Renders one 1-D internal sweep from a unit op (PFR axial
  profile, distillation stage profile,...) on linear axes.

  The unit declares its independent variable via `xAxis`; every other
  column is drawn as a separate trace.  To keep wildly different scales
  legible on the same chart we split them by column-name heuristic:

      LEFT axis  (default):  F_*    molar flows           [mol/s]
                             x_*, y_*  mole fractions     [0, 1]
      RIGHT axis (y2):       T      temperature           [K]
                             X      conversion            [0, 1]

  The chart picks the right-axis title from whichever right-side trace
  is present.  When no column maps to the right axis the secondary axis
  is hidden.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import { Group, SegmentedControl, Stack, Text } from "@mantine/core";

import type { UnitProfile } from "../../adapters/SolverAdapter.js";
import { Plot, PLOT_COLORS, PLOT_CONFIG, darkLayout } from "./plotly.js";

export function ProfilePlot({ profiles }: { profiles: UnitProfile[] }) {
  const [unitName, setUnitName] = useState<string>(
    () => profiles[0]?.unit ?? "",
  );
  const active = useMemo(
    () => profiles.find((p) => p.unit === unitName) ?? profiles[0],
    [profiles, unitName],
  );

  if (!active) {
    return (
      <Stack align="center" justify="center" h="100%">
        <Text c="dimmed" size="sm">
          No internal profiles for this case.
        </Text>
      </Stack>
    );
  }

  const x = active.columns[active.xAxis] ?? [];
  const seriesKeys = Object.keys(active.columns).filter(
    (k) => k !== active.xAxis,
  );

  const onRight = (k: string) => k === "T" || k === "X" || k === "grade_efficiency";
  const rightLabels = seriesKeys.filter(onRight);
  // Particle-size distributions (cyclone) read best on a log diameter axis.
  const logX = active.xAxis === "diameter_micron";

  const traces = seriesKeys.map((k, i) => ({
    type: "scatter" as const,
    mode: "lines+markers" as const,
    name: k,
    x,
    y: active.columns[k],
    yaxis: onRight(k) ? ("y2" as const) : ("y" as const),
    line: {
      color: PLOT_COLORS.series[i % PLOT_COLORS.series.length],
      width: 2,
    },
    marker: { size: 4 },
    hovertemplate: `${active.xAxis}=%{x:.3g}<br>${k}=%{y:.4g}<extra></extra>`,
  }));

  const rightTitle = rightLabels.includes("T")
    ? rightLabels.length > 1
      ? rightLabels.join(", ")
    : "T (K)"
  : rightLabels.includes("grade_efficiency")
      ? "η (grade efficiency)"
    : rightLabels.includes("X")
        ? "X (conversion)"
      : "";
  const rightRange: [number, number] | undefined =
    rightLabels.length === 1 &&
    (rightLabels[0] === "X" || rightLabels[0] === "grade_efficiency")
      ? [0, 1]
    : undefined;
  const leftTitle = seriesKeys.some((k) => k.startsWith("massFrac"))
    ? "mass fraction"
  : seriesKeys.some((k) => k.startsWith("x_") || k.startsWith("y_"))
      ? "mole fraction"
    : seriesKeys.some((k) => k.startsWith("F_"))
        ? "molar flow (mol/s)"
      : "value";

  // Vertical marker lines (e.g. the column's feed stage) + a small
  // text annotation hanging off the top of the plot.
  const markerShapes = (active.markers ?? []).map((m) => ({
    type: "line" as const,
    xref: "x" as const,
    yref: "paper" as const,
    x0: m.x,
    x1: m.x,
    y0: 0,
    y1: 1,
    line: {
      color: PLOT_COLORS.warm,
      width: 1.2,
      dash: "dash" as const,
    },
  }));
  const markerAnnotations = (active.markers ?? []).map((m) => ({
    x: m.x,
    y: 1,
    xref: "x" as const,
    yref: "paper" as const,
    text: m.label,
    showarrow: false,
    yanchor: "bottom" as const,
    font: { color: PLOT_COLORS.warm, size: 11 },
    bgcolor: PLOT_COLORS.background,
    borderpad: 2,
  }));

  return (
    <Stack gap={0} h="100%">
      {profiles.length > 1 && (
        <Group justify="center" py={4}>
          <SegmentedControl
            size="xs"
            value={active.unit}
            onChange={setUnitName}
            data={profiles.map((p) => ({ label: p.unit, value: p.unit }))}
          />
        </Group>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>
        <Plot
          data={traces}
          layout={{
...darkLayout,
            title: {
              text: `Profile  ·  ${active.unit}`,
              font: {...darkLayout.font, size: 14 },
            },
            xaxis: {
...darkLayout.xaxis,
              title: { text: active.xAxis },
...(logX ? { type: "log" as const } : {}),
            },
            yaxis: {
...darkLayout.yaxis,
              title: { text: leftTitle },
            },
            yaxis2:
              rightLabels.length > 0
                ? {
                    overlaying: "y" as const,
                    side: "right" as const,
                    title: { text: rightTitle, standoff: 8 },
                    gridcolor: "transparent",
                    zerolinecolor: PLOT_COLORS.grid,
                    linecolor: PLOT_COLORS.axis,
                    tickfont: { color: PLOT_COLORS.text, size: 11 },
                    showgrid: false,
...(rightRange ? { range: rightRange } : {}),
                  }
              : undefined,
            shapes: markerShapes,
            annotations: markerAnnotations,
            legend: {...darkLayout.legend, x: 0.02, y: 0.98 },
          }}
          config={PLOT_CONFIG}
          style={{ width: "100%", height: "100%" }}
          useResizeHandler
        />
      </div>
    </Stack>
  );
}
