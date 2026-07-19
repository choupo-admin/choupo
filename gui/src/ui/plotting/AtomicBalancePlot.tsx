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
  AtomicBalancePlot -- the GLOBAL ATOMIC balance: total kmol-atom/h in vs
  out at the plant boundary, from the engine's elementBalance artefacts.
  THIS is the conservative molar balance of a reacting plant: species moles
  may change legally (660 -> 677.8 kmol/h in the reference plant) while the
  ATOMS close.  The seal demands that EVERY element closes -- a signed
  total could cancel a +C error against a -O error -- and the compact
  indicator is the worst per-element deviation.  The per-element
  decomposition lives in the "Global elemental balance" drill-down.
\*---------------------------------------------------------------------------*/

import { Badge, Group, Stack, Text } from "@mantine/core";

import {
  atomicBalanceView,
  elementBalanceSurface,
} from "../../case/elementBalanceSurface.js";
import { Plot, PLOT_COLORS, PLOT_CONFIG, darkLayout } from "./plotly.js";

interface AtomicBalancePlotProps {
  csv?: string;
  meta?: string;
}

export function AtomicBalancePlot({ csv, meta }: AtomicBalancePlotProps) {
  const surface = elementBalanceSurface(csv, meta);

  if (!surface.present) {
    return (
      <Stack align="center" justify="center" h="100%">
        <Text c="dimmed" ta="center" maw={460}>
          No atomic balance in this run — add `elementBalance {"{ }"}` to the
          case's `controlDict.reports` block (the engine derives it from the
          component formulas / declared compositions).
        </Text>
      </Stack>
    );
  }

  if (surface.status === "UNAVAILABLE") {
    return (
      <Stack align="center" justify="center" h="100%" gap="xs">
        <Text c="orange" fw={600}>Atomic balance UNAVAILABLE</Text>
        {surface.malformedReason && (
          <Text c="dimmed" size="sm">{surface.malformedReason}</Text>
        )}
        {surface.refused.map((r) => (
          <Text key={r.species} c="dimmed" size="sm" ta="center" maw={480}>
            {r.species}: {r.reason}
          </Text>
        ))}
        <Text c="dimmed" size="xs">The mass balance stays available.</Text>
      </Stack>
    );
  }

  const v = atomicBalanceView(surface);
  const fmt = (x: number) => (Math.abs(x) >= 100 ? x.toFixed(1)
                                                  : x.toPrecision(5));

  const data = [{
    type: "bar" as const,
    x: ["atoms IN", "atoms OUT"],
    y: [v.totalInKmolAtomH, v.totalOutKmolAtomH],
    text: [`${fmt(v.totalInKmolAtomH)} kmol-atom/h`,
           `${fmt(v.totalOutKmolAtomH)} kmol-atom/h`],
    textposition: "inside" as const,
    textfont: { size: 12, color: "#10242b" },
    marker: { color: [PLOT_COLORS.series[0], PLOT_COLORS.series[1]] },
    hovertemplate: "%{x} = %{y:.6g} kmol-atom/h<extra></extra>",
  }];

  const sealed = v.allElementsClose && surface.status === "FULL";

  return (
    <Stack gap="xs" h="100%" style={{ minHeight: 0 }}>
      <Group gap="xs" wrap="wrap">
        <Badge variant="light"
          color={sealed ? "teal"
                 : surface.status === "PARTIAL" ? "yellow" : "orange"}>
          {surface.status === "PARTIAL" ? "PARTIAL — " : ""}
          atoms {sealed ? "conserved" : "residual"}:{" "}
          {v.residualKmolAtomH.toExponential(3)} kmol-atom/h · worst element
          off by {v.worstElementOffPct.toExponential(2)} %
        </Badge>
      </Group>
      {surface.status === "PARTIAL" && (
        <Text c="dimmed" size="xs">
          Declared compositions carry unaccounted mass — no complete atomic
          closure is stamped.{" "}
          {surface.partial.map((p) =>
            `${p.species} (${p.unaccounted} kg/kg)`).join(", ")}
        </Text>
      )}
      <Text c="dimmed" size="xs">
        Species moles may change legally through reactions; the ATOMS are the
        conserved molar quantity.  Per-element detail: the Global elemental
        balance view.
      </Text>
      <Plot
        data={data as never}
        layout={{
          ...darkLayout,
          title: { text: "Global atomic balance — plant boundary",
                   font: { ...darkLayout.font, size: 13 } },
          bargap: 0.45,
          showlegend: false,
          yaxis: { ...darkLayout.yaxis,
                   title: { text: "total atoms (kmol-atom/h)" } },
          xaxis: { ...darkLayout.xaxis, title: { text: "" } },
        }}
        config={PLOT_CONFIG}
        style={{ width: "100%", height: "100%" }}
        useResizeHandler
      />
    </Stack>
  );
}
