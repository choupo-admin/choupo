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
  TimeScrubber -- scrub the OpenFOAM-style real-time instants a dynamic run
  (choupoBatch / choupoCtrl) wrote.  A slider walks the written physical times;
  the panel shows each unit's HOLDUP state at the selected instant (T, V, mole
  inventory, any extras = conversion / supersaturation) PLUS the instantaneous
  outlet face for continuous units.  A T(t) line beneath marks where on the
  trajectory the scrubber sits, so the student SEES the reactor evolve.

  Pure visualiser (gui-credo): reads result.instants (+ result.trajectory for
  the marked line); no editing, no save.  The data is the C++ engine's own
  <t>/internalState dicts, parsed back by parseDynamicInstants.
\*---------------------------------------------------------------------------*/

import { Badge, Box, Group, Slider, Stack, Table, Text } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";

import type { DynamicInstants, InstantUnit } from "../../case/dynamicInstants.js";
import type { TrajectoryData } from "../../adapters/SolverAdapter.js";
import { Plot, PLOT_COLORS, PLOT_CONFIG, darkLayout } from "./plotly.js";

const fmt = (n: number): string =>
  Math.abs(n) >= 1e4 || (n !== 0 && Math.abs(n) < 1e-3)
    ? n.toExponential(3)
    : String(+n.toFixed(4));

function HoldupCard({ unit, components }: { unit: InstantUnit; components: string[] }) {
  const moles = components.filter((c) => unit.holdupMolar[c] !== undefined);
  const extras = unit.extras ? Object.entries(unit.extras) : [];
  const outlet = unit.outletMolarFlows
    ? components.filter((c) => unit.outletMolarFlows![c] !== undefined)
    : [];

  return (
    <Box
      style={{
        border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
        borderRadius: 6,
        padding: 12,
        minWidth: 240,
      }}
    >
      <Group gap={8} mb={6}>
        <Text fw={600} c="accent.3" size="sm">{unit.name}</Text>
        <Badge size="xs" variant="light" color="gray">{unit.type}</Badge>
      </Group>

      <Group gap="lg" mb={8}>
        <Box>
          <Text size="xs" c="dimmed">T</Text>
          <Text size="sm" ff="monospace">{fmt(unit.T)} K</Text>
        </Box>
        {unit.V !== undefined && (
          <Box>
            <Text size="xs" c="dimmed">V</Text>
            <Text size="sm" ff="monospace">{fmt(unit.V)} m³</Text>
          </Box>
        )}
        <Box>
          <Text size="xs" c="dimmed">P</Text>
          <Text size="sm" ff="monospace">{fmt(unit.P / 1000)} kPa</Text>
        </Box>
      </Group>

      {extras.length > 0 && (
        <Group gap="lg" mb={8}>
          {extras.map(([k, v]) => (
            <Box key={k}>
              <Text size="xs" c="dimmed">{k}</Text>
              <Text size="sm" ff="monospace">{fmt(v)}</Text>
            </Box>
          ))}
        </Group>
      )}

      {moles.length > 0 && (
        <>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} mt={4} mb={2}>
            Holdup inventory [kmol]
          </Text>
          <Table fz="xs" ff="monospace" w="auto" verticalSpacing={2}>
            <Table.Tbody>
              {moles.map((c) => (
                <Table.Tr key={c}>
                  <Table.Td c="dimmed">{c}</Table.Td>
                  <Table.Td ta="right">{fmt(unit.holdupMolar[c]!)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </>
      )}

      {outlet.length > 0 && (
        <>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} mt={8} mb={2}>
            Outlet face [kmol/s]
          </Text>
          <Table fz="xs" ff="monospace" w="auto" verticalSpacing={2}>
            <Table.Tbody>
              {outlet.map((c) => (
                <Table.Tr key={c}>
                  <Table.Td c="dimmed">{c}</Table.Td>
                  <Table.Td ta="right">{fmt(unit.outletMolarFlows![c]!)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </>
      )}
    </Box>
  );
}

/** A compact T(t) line with a vertical marker at the scrubbed time.  Uses the
 *  per-instant holdup T (always present) so it works even without a separate
 *  trajectory.csv. */
function ScrubLine({
  instants,
  tNow,
}: {
  instants: DynamicInstants;
  tNow: number;
}) {
  // One T(t) trace per unit, from the holdup temperatures.
  const unitNames = instants.instants[0]?.units.map((u) => u.name) ?? [];
  const ts = instants.instants.map((i) => i.t);

  const traces = unitNames.map((name, idx) => {
    const ys = instants.instants.map(
      (i) => i.units.find((u) => u.name === name)?.T ?? NaN,
    );
    const color = PLOT_COLORS.series[idx % PLOT_COLORS.series.length]!;
    return {
      type: "scatter" as const,
      mode: "lines" as const,
      name: `${name}.T`,
      x: ts,
      y: ys,
      line: { color, width: 2 },
      hovertemplate: `${name}.T<br>t = %{x:.1f} s<br>T = %{y:.3f} K<extra></extra>`,
    };
  });

  const tMin = ts[0] ?? 0;
  const tMax = ts[ts.length - 1] ?? 1;

  return (
    <Plot
      data={traces}
      layout={{
        ...darkLayout,
        title: { text: "Holdup T(t) — scrubbed time marked", font: { ...darkLayout.font, size: 13 } },
        xaxis: { ...darkLayout.xaxis, title: { text: "t [s]" }, range: [tMin, tMax] },
        yaxis: { ...darkLayout.yaxis, title: { text: "T [K]" } },
        legend: { ...darkLayout.legend, x: 0.02, y: 0.98 },
        shapes: [
          {
            type: "line",
            x0: tNow,
            x1: tNow,
            y0: 0,
            y1: 1,
            yref: "paper",
            line: { color: PLOT_COLORS.accent, width: 2, dash: "dot" },
          },
        ],
      }}
      config={PLOT_CONFIG}
      style={{ width: "100%", height: "100%" }}
      useResizeHandler
    />
  );
}

export function TimeScrubber({
  instants,
  trajectory,
}: {
  instants: DynamicInstants;
  trajectory?: TrajectoryData;
}) {
  // The slider walks instant INDEX (times are unevenly spaced sometimes).
  const n = instants.instants.length;
  const [idx, setIdx] = useState(0);

  // A fresh run resets to the first instant.
  useEffect(() => {
    setIdx(0);
  }, [instants]);

  const safeIdx = Math.min(idx, n - 1);
  const current = instants.instants[safeIdx]!;

  const marks = useMemo(() => {
    // Label only the ends + middle so the rail does not clutter.
    const labelIdx = new Set([0, Math.floor(n / 2), n - 1]);
    const tlabel = (t: number) => (t >= 1000 ? `${(t / 1000).toFixed(1)}k` : `${t}`);
    return instants.instants.map((i, k) => ({
      value: k,
      label: labelIdx.has(k) ? tlabel(i.t) : undefined,
    }));
  }, [instants, n]);

  // `trajectory` is intentionally accepted but the ScrubLine derives T(t) from
  // the instants themselves (always available); the prop is kept for callers
  // that want to pass it and for a future composition-trace overlay.
  void trajectory;

  return (
    <Stack gap={8} h="100%" p="sm">
      <Group justify="space-between" wrap="nowrap">
        <Text size="xs" c="dimmed">
          {instants.application === "batch" ? "Batch" : "Dynamic"} transient —
          {" "}{n} written instants
        </Text>
        <Badge variant="light" color="cyan" size="lg" ff="monospace">
          t = {current.t} s
        </Badge>
      </Group>

      <Slider
        min={0}
        max={Math.max(0, n - 1)}
        step={1}
        value={safeIdx}
        onChange={setIdx}
        marks={marks}
        label={(v) => `${instants.instants[v]?.t ?? ""} s`}
        color="cyan"
        mb={4}
      />

      <Group align="flex-start" gap="md" wrap="wrap" mt={20}>
        {current.units.map((u) => (
          <HoldupCard key={u.name} unit={u} components={instants.components} />
        ))}
      </Group>

      <Box style={{ flex: 1, minHeight: 160 }}>
        <ScrubLine instants={instants} tNow={current.t} />
      </Box>
    </Stack>
  );
}
