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
  ElementBalancePlot -- the steady plant-boundary ELEMENT conservation
  report (reports/balances/elementBalance.csv + .meta) rendered verbatim:
  per-element IN vs OUT bars in kmol-atom/h with the closure in the hover.
  The FULL / PARTIAL / UNAVAILABLE status and its named reasons come from
  the engine's sidecar -- no atom or formula computation in TypeScript.
\*---------------------------------------------------------------------------*/

import { Badge, Group, Stack, Text } from "@mantine/core";

import { elementBalanceSurface } from "../../case/elementBalanceSurface.js";
import { Plot, PLOT_COLORS, PLOT_CONFIG, darkLayout } from "./plotly.js";

interface ElementBalancePlotProps {
  csv?: string;
  meta?: string;
}

export function ElementBalancePlot({ csv, meta }: ElementBalancePlotProps) {
  const v = elementBalanceSurface(csv, meta);

  if (!v.present) {
    return (
      <Stack align="center" justify="center" h="100%">
        <Text c="dimmed" ta="center" maw={440}>
          No element balance in this run — add `elementBalance {"{ }"}` to the
          case's `controlDict.reports` block.
        </Text>
      </Stack>
    );
  }

  if (v.status === "UNAVAILABLE") {
    return (
      <Stack align="center" justify="center" h="100%" gap="xs">
        <Text c="orange" fw={600}>Element balance UNAVAILABLE</Text>
        {v.refused.map((r) => (
          <Text key={r.species} c="dimmed" size="sm" ta="center" maw={480}>
            {r.species}: {r.reason}
          </Text>
        ))}
        {v.missingStreams.map((s) => (
          <Text key={s} c="dimmed" size="sm">stream {s}: no state in the result</Text>
        ))}
        <Text c="dimmed" size="xs">The mass balance stays available.</Text>
      </Stack>
    );
  }

  const data = [
    {
      type: "bar" as const, name: "IN",
      x: v.rows.map((r) => r.element),
      y: v.rows.map((r) => r.inKmolAtomH),
      marker: { color: PLOT_COLORS.series[0] },
      hovertemplate: "%{x} IN = %{y:.6g} kmol-atom/h<extra></extra>",
    },
    {
      type: "bar" as const, name: "OUT",
      x: v.rows.map((r) => r.element),
      y: v.rows.map((r) => r.outKmolAtomH),
      marker: { color: PLOT_COLORS.series[1] },
      hovertemplate: "%{x} OUT = %{y:.6g} kmol-atom/h<extra></extra>",
    },
  ];

  const worstOff = Math.max(0,
    ...v.rows.map((r) => Math.abs(r.closurePct - 100.0)));

  return (
    <Stack gap="xs" h="100%" style={{ minHeight: 0 }}>
      <Group gap="xs" wrap="wrap">
        <Badge variant="light"
          color={v.status === "PARTIAL" ? "yellow"
                 : worstOff <= 0.01 ? "teal" : "orange"}>
          {v.status === "PARTIAL" ? "PARTIAL" : "element conservation"} — worst
          closure off by {worstOff.toExponential(2)} %
        </Badge>
      </Group>
      {v.status === "PARTIAL" && (
        <Text c="dimmed" size="xs">
          Declared compositions carry unaccounted mass — the shown elements
          are usable; no complete elemental closure is stamped.{" "}
          {v.partial.map((p) => `${p.species} (${p.unaccounted} kg/kg)`).join(", ")}
        </Text>
      )}
      <Plot
        data={data as never}
        layout={{
          ...darkLayout,
          title: { text: "Element balance — plant boundary (kmol-atom/h)",
                   font: { ...darkLayout.font, size: 13 } },
          barmode: "group",
          bargap: 0.35,
          yaxis: { ...darkLayout.yaxis,
                   title: { text: "kmol-atom/h" },
                   exponentformat: "e" as const },
          xaxis: { ...darkLayout.xaxis, title: { text: "" } },
        }}
        config={PLOT_CONFIG}
        style={{ width: "100%", height: "100%" }}
        useResizeHandler
      />
    </Stack>
  );
}
