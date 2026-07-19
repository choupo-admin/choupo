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
  MolarBalancePlot -- TWO plant-boundary totals: molar IN and molar OUT
  (fluid + solids via MW).  No species stacking (that lives in the stream
  tables) and NO physical lie: in a reacting flowsheet total moles are not
  conserved, so the difference reads "net molar change (OUT − IN)"; the
  word "closure" appears only for a non-reactive case.  A solid with a
  missing MW makes the claim PARTIAL naming the component.
\*---------------------------------------------------------------------------*/

import { Badge, Group, Stack, Text } from "@mantine/core";

import type { StreamResult } from "../../adapters/SolverAdapter.js";
import { molarBalanceView } from "../../case/molarBalance.js";
import { flowBasis, type FlowUnit } from "../../state/displayUnits.js";
import { Plot, PLOT_COLORS, PLOT_CONFIG, darkLayout } from "./plotly.js";

interface MolarBalancePlotProps {
  streams: StreamResult[];
  componentMolarMass?: { [component: string]: number };
  reactive: boolean;
  flowUnit: FlowUnit;
}

export function MolarBalancePlot({
  streams, componentMolarMass, reactive, flowUnit,
}: MolarBalancePlotProps) {
  const v = molarBalanceView(streams, componentMolarMass, reactive);

  if (!v.present) {
    return (
      <Stack align="center" justify="center" h="100%">
        <Text c="dimmed">No boundary streams classified in this run.</Text>
      </Stack>
    );
  }

  // Molar y-unit: honour a molar display unit; force kmol/h otherwise.
  const yUnit: FlowUnit = flowBasis(flowUnit) === "molar"
    ? flowUnit
    : flowUnit.endsWith("/s") ? "kmol/s" : "kmol/h";
  const factor = yUnit.endsWith("/h") ? 3600.0 : 1.0;
  const scale = yUnit.startsWith("mol") ? 1000.0 : 1.0;
  const f = factor * scale;
  const fmt = (x: number) => (Math.abs(x) >= 100 ? x.toFixed(1)
                                                  : x.toPrecision(4));

  const data = [{
    type: "bar" as const,
    x: ["molar IN", "molar OUT"],
    y: [v.inKmolS * f, v.outKmolS * f],
    text: [`${fmt(v.inKmolS * f)} ${yUnit}`, `${fmt(v.outKmolS * f)} ${yUnit}`],
    textposition: "inside" as const,
    textfont: { size: 12, color: "#10242b" },
    marker: { color: [PLOT_COLORS.series[0], PLOT_COLORS.series[1]] },
    hovertemplate: "%{x} = %{y:.6g} " + yUnit + "<extra></extra>",
  }];

  const net = v.netKmolS * f;
  const nonReactiveClosed = !v.reactive
    && Math.abs(v.netKmolS) <= 1e-9 * Math.max(v.inKmolS, v.outKmolS, 1e-30);

  return (
    <Stack gap="xs" h="100%" style={{ minHeight: 0 }}>
      <Group gap="xs" wrap="wrap">
        {v.reactive ? (
          <Badge variant="light" color="blue">
            net molar change (OUT − IN) {fmt(net)} {yUnit} — moles are NOT
            conserved through reactions; the chemical invariant is the
            ELEMENT balance
          </Badge>
        ) : (
          <Badge variant="light" color={nonReactiveClosed ? "teal" : "yellow"}>
            non-reactive closure: OUT − IN = {fmt(net)} {yUnit}
          </Badge>
        )}
        {v.partialMissingMW.length > 0 && (
          <Badge variant="light" color="orange">
            PARTIAL — solids without MW excluded:{" "}
            {v.partialMissingMW.join(", ")}
          </Badge>
        )}
      </Group>
      <Plot
        data={data as never}
        layout={{
          ...darkLayout,
          title: { text: `Molar balance — plant boundary (${yUnit})`,
                   font: { ...darkLayout.font, size: 13 } },
          bargap: 0.45,
          showlegend: false,
          yaxis: { ...darkLayout.yaxis,
                   title: { text: `molar flow (${yUnit})` } },
          xaxis: { ...darkLayout.xaxis, title: { text: "" } },
        }}
        config={PLOT_CONFIG}
        style={{ width: "100%", height: "100%" }}
        useResizeHandler
      />
    </Stack>
  );
}
