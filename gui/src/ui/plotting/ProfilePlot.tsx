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
  column is a series.  A series never shares an axis with a quantity of
  another kind: the series are GROUPED by what they are
  (`case/profileSeries.ts`: temperature, liquid fractions, vapour
  fractions, activity coefficients, reaction extent, ...) and every group
  is its own panel, stacked on the shared x axis, with an axis title that
  is true for what it draws.  A staged column opens on temperature, the
  liquid fractions of the components that matter and the reaction extent;
  the other groups are a chip away and every series is in the legend.
\*---------------------------------------------------------------------------*/

import { useEffect, useMemo, useState } from "react";
import { Chip, Group, SegmentedControl, Stack, Text } from "@mantine/core";

import type { UnitProfile } from "../../adapters/SolverAdapter.js";
import {
  groupProfileSeries, initiallyDrawn, panelDomains,
  type ProfileGroup,
} from "../../case/profileSeries.js";
import { Plot, PLOT_COLORS, PLOT_CONFIG, darkLayout } from "./plotly.js";

export function ProfilePlot(
  { profiles, unit }: { profiles: UnitProfile[]; unit?: string },
) {
  const [unitName, setUnitName] = useState<string>(
    () => unit ?? profiles[0]?.unit ?? "",
  );
  //  DRIVEN FROM OUTSIDE, but still selectable from inside.  The plots
  //  navigator can now select a unit directly (its sector tree), and the
  //  SegmentedControl below stays live so the plot is still usable on its
  //  own.  An effect rather than a controlled prop, because the two must not
  //  fight: the outside sets the unit when it changes, the user moves freely
  //  afterwards.
  useEffect(() => { if (unit !== undefined) setUnitName(unit); }, [unit]);
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
      {/* keyed by unit: the chips and the legend state start from the rule
          for each unit and are the reader's afterwards */}
      <ProfileBody key={active.unit} profile={active} />
    </Stack>
  );
}

function ProfileBody({ profile: active }: { profile: UnitProfile }) {
  const groups = useMemo(
    () => groupProfileSeries(active.columns, active.xAxis),
    [active],
  );
  const [shown, setShown] = useState<Set<string>>(
    () => new Set(groups.filter((g) => g.defaultOn).map((g) => g.id)),
  );
  const [drawn, setDrawn] = useState<Set<string>>(() => {
    const d = new Set<string>();
    for (const g of groups) initiallyDrawn(g, active.columns).forEach((k) => d.add(k));
    return d;
  });

  const x = active.columns[active.xAxis] ?? [];
  const panels: ProfileGroup[] = groups.filter((g) => shown.has(g.id));
  const domains = panelDomains(panels.map((g) => g.weight));
  // Particle-size distributions (cyclone) read best on a log diameter axis.
  const logX = active.xAxis === "diameter_micron";

  //  One colour per LEGEND NAME, so a component keeps its colour in the liquid
  //  and the vapour panel.
  const colourOf = useMemo(() => {
    const names: string[] = [];
    for (const g of groups) for (const k of g.keys) {
      const l = g.label(k);
      if (!names.includes(l)) names.push(l);
    }
    return (l: string) => PLOT_COLORS.series[names.indexOf(l) % PLOT_COLORS.series.length];
  }, [groups]);

  const traceKeys: string[] = [];
  const traces: any[] = [];
  panels.forEach((g, pi) => {
    const ax = pi === 0 ? "" : String(pi + 1);
    for (const k of g.keys) {
      const colour = colourOf(g.label(k));
      const common = {
        name: g.label(k),
        x,
        y: active.columns[k],
        xaxis: "x",
        yaxis: `y${ax}`,
        legendgroup: g.id,
        legendgrouptitle: { text: g.chip, font: { size: 11 } },
        visible: drawn.has(k) ? true : ("legendonly" as const),
        hovertemplate: `${active.xAxis}=%{x:.3g}<br>${k}=%{y:.4g}<extra></extra>`,
      };
      traceKeys.push(k);
      traces.push(
        g.kind === "bar"
          ? { ...common, type: "bar" as const, marker: { color: colour }, width: 0.7 }
          : {
              ...common,
              type: "scatter" as const,
              mode: "lines+markers" as const,
              line: { color: colour, width: 2 },
              marker: { size: 4 },
            },
      );
    }
  });

  const lastY = panels.length <= 1 ? "y" : `y${panels.length}`;
  const yaxes: Record<string, unknown> = {};
  panels.forEach((g, pi) => {
    yaxes[pi === 0 ? "yaxis" : `yaxis${pi + 1}`] = {
      ...darkLayout.yaxis,
      domain: domains[pi],
      anchor: "x",
      title: { text: g.title, font: { size: 11 }, standoff: 6 },
      automargin: true,
      ...(g.range ? { range: g.range } : {}),
    };
  });

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

  const toggleGroup = (id: string) =>
    setShown((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  //  The legend click is the reader's, kept in state (a re-render on a chip
  //  must not undo it); the double-click isolate is not offered.
  const onLegendClick = (ev: any) => {
    const k = traceKeys[ev.curveNumber];
    if (k === undefined) return false;
    setDrawn((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
    return false;
  };

  return (
    <>
      {groups.length > 1 && (
        <Group gap={6} px="sm" py={4} wrap="wrap" data-testid="profile-groups">
          <Text size="xs" c="dimmed">Show</Text>
          {groups.map((g) => (
            <Chip
              key={g.id}
              size="xs"
              variant="outline"
              checked={shown.has(g.id)}
              onChange={() => toggleGroup(g.id)}
            >
              {g.chip}
            </Chip>
          ))}
        </Group>
      )}
      <div style={{ flex: 1, minHeight: 0 }}>
        {panels.length === 0 ? (
          <Stack align="center" justify="center" h="100%">
            <Text c="dimmed" size="sm">Choose a group of series above.</Text>
          </Stack>
        ) : (
          <Plot
            data={traces}
            layout={{
              ...darkLayout,
              margin: { l: 64, r: 150, t: 40, b: 44 },
              //  left-aligned: the feed marker's label hangs off the top of the
              //  plot and a centred title ran under it
              title: {
                text: `Profile  ·  ${active.unit}`,
                font: { ...darkLayout.font, size: 14 },
                x: 0.01, xanchor: "left",
              },
              xaxis: {
                ...darkLayout.xaxis,
                title: { text: active.xAxis },
                anchor: lastY,
                ...(logX ? { type: "log" as const } : {}),
              },
              ...yaxes,
              shapes: markerShapes,
              annotations: markerAnnotations,
              legend: {
                ...darkLayout.legend,
                x: 1.01, xanchor: "left", y: 1, yanchor: "top",
                groupclick: "toggleitem",
              },
              bargap: 0.25,
            }}
            config={PLOT_CONFIG}
            style={{ width: "100%", height: "100%" }}
            useResizeHandler
            onLegendClick={onLegendClick}
            onLegendDoubleClick={() => false}
          />
        )}
      </div>
    </>
  );
}
