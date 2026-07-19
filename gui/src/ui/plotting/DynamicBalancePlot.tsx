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
  DynamicBalancePlot -- the choupoCtrl balance ledger over TIME, drawn from
  the engine's own balanceTrajectory.csv + .meta artefacts (accepted-step
  trapezoids in the C++ time loop; the GUI computes nothing).  Two panels:
  the mass inventory trace and the conservation RESIDUALS (mass + one line
  per element) -- a flat residual near zero is the ledger closing; a drift
  is real physics or a real bug, never hidden.  Withheld claims (elements
  on toy formulas, the energy functional) render as named states.
\*---------------------------------------------------------------------------*/

import { Badge, Group, Stack, Text } from "@mantine/core";

import { dynamicBalanceView } from "../../case/dynamicBalance.js";
import { Plot, PLOT_COLORS, PLOT_CONFIG, darkLayout } from "./plotly.js";

interface DynamicBalancePlotProps {
  trajectoryCsv?: string;
  metaCsv?: string;
}

export function DynamicBalancePlot({ trajectoryCsv, metaCsv }: DynamicBalancePlotProps) {
  const v = dynamicBalanceView(trajectoryCsv, metaCsv);

  if (!v.present) {
    const reason = v.malformedReason ?? v.materialReason;
    return (
      <Stack align="center" justify="center" h="100%">
        <Text c={reason ? "orange" : "dimmed"} fw={600}>
          {reason
            ? "Balance ledger UNAVAILABLE"
            : "No dynamic balance trajectory in this run"}
        </Text>
        {reason && (
          <Text c="dimmed" size="sm" ta="center" maw={420}>{reason}</Text>
        )}
      </Stack>
    );
  }

  const inventory = [{
    type: "scatter" as const, mode: "lines" as const,
    name: "mass inventory",
    x: v.t, y: v.massInventoryKg,
    line: { color: PLOT_COLORS.series[0], width: 2 },
    hovertemplate: "t = %{x:.4g} s<br>M = %{y:.6g} kg<extra></extra>",
  }];

  const residuals = [
    {
      type: "scatter" as const, mode: "lines" as const,
      name: "mass residual [kg]",
      x: v.t, y: v.massResidualKg,
      line: { color: PLOT_COLORS.series[1], width: 2 },
      hovertemplate: "t = %{x:.4g} s<br>mass residual = %{y:.3e} kg<extra></extra>",
    },
    ...Object.entries(v.elementResiduals).map(([sym, ys], i) => ({
      type: "scatter" as const, mode: "lines" as const,
      name: `${sym} residual [kmol-atom]`,
      x: v.t, y: ys,
      line: { color: PLOT_COLORS.series[(i + 2) % PLOT_COLORS.series.length], width: 1.5 },
      hovertemplate: `t = %{x:.4g} s<br>${sym} residual = %{y:.3e}<extra></extra>`,
    })),
  ];

  const panel = (data: unknown[], title: string, yTitle: string) => (
    <Plot
      data={data as never}
      layout={{
        ...darkLayout,
        title: { text: title, font: { ...darkLayout.font, size: 12 } },
        margin: { l: 64, r: 12, t: 34, b: 34 },
        xaxis: { ...darkLayout.xaxis, title: { text: "t (s)" } },
        yaxis: { ...darkLayout.yaxis, title: { text: yTitle },
                 exponentformat: "e" as const },
      }}
      config={PLOT_CONFIG}
      style={{ width: "100%", height: "100%", minHeight: 0 }}
      useResizeHandler
    />
  );

  return (
    <Stack gap="xs" h="100%" style={{ minHeight: 0 }}>
      <Stack gap={2}>
        <Group gap="xs" wrap="wrap">
          <Badge variant="light" color={v.materialAvailable ? "teal" : "orange"}>
            material {v.materialAvailable ? "available" : "UNAVAILABLE"}
          </Badge>
          <Badge variant="light" color={v.elementsAvailable ? "teal" : "gray"}>
            elements {v.elementsAvailable ? "available" : "UNAVAILABLE"}
          </Badge>
          <Badge variant="light" color="gray">energy UNAVAILABLE</Badge>
        </Group>
        {!v.elementsAvailable && v.elementsReason && (
          <Text c="dimmed" size="xs">elements: {v.elementsReason}</Text>
        )}
        <Text c="dimmed" size="xs">
          energy: {v.energyReason ?? "no functional declared"}
        </Text>
      </Stack>
      <Group grow align="stretch" style={{ flex: 1, minHeight: 0 }}>
        {panel(inventory, "Mass inventory M(t)", "mass (kg)")}
        {panel(residuals,
               "Conservation residuals — M(t)−M(0) − ∫(in−out)",
               "residual")}
      </Group>
    </Stack>
  );
}
