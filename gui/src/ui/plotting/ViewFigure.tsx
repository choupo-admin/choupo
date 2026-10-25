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
  ViewFigure -- ONE VIEW of a props run, drawn as a paper's figure or table
  (DEV.md 4c C147, C149).

  It DRAWS what the engine wrote and computes nothing: the series, their
  roles and sources come from the result's `postProcessing` block, the
  numbers from postProcessing/<op>/<view>.csv.  A measurement is drawn as
  markers with its error bars, another program's or a published table's
  numbers dashed, Choupo's own as a solid line, a declared `style` winning
  over the role's; series of one `group` (one ion across sources) share a
  colour, so a reader matches them at a glance.  Every figure exports as
  PNG and SVG, every view as the engine's own CSV, and under each the
  sources of its numbers are listed.
\*---------------------------------------------------------------------------*/

import { useMemo, useRef } from "react";
import { Box, Button, Group, ScrollArea, Stack, Table, Text } from "@mantine/core";
import { IconDownload } from "@tabler/icons-react";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- the basic-dist package has no types
import Plotly from "plotly.js-basic-dist-min";

import { Plot, PLOT_CONFIG, darkLayout } from "./plotly.js";
import {
  formatCell, plotSeries, tableRows,
  type PostItem, type PostPlot, type PostRowsTable, type PostSeriesTable,
} from "../../case/postProcessing.js";

/** Six hues that hold their contrast on both the light and the dark chrome. */
export const VIEW_COLOURS = ["#2f7fc1", "#d9622b", "#1f9e74", "#b4579b", "#c99400", "#4aa6d8"];

/** The colour of each series: one per group, else one per series, in order. */
export function seriesColours(item: PostPlot): Map<string, string> {
  const byGroup = new Map<string, string>();
  const out = new Map<string, string>();
  let next = 0;
  for (const s of item.series) {
    const key = s.group || `series:${s.name}`;
    if (!byGroup.has(key)) byGroup.set(key, VIEW_COLOURS[next++ % VIEW_COLOURS.length]!);
    out.set(s.name, byGroup.get(key)!);
  }
  return out;
}

/** How a series is drawn: its declared style, else its role's. */
export function seriesMode(style: string, role: string): "lines" | "markers" | "lines+markers" {
  if (style === "lines") return "lines";
  if (style === "markers") return "markers";
  if (style === "linesMarkers") return "lines+markers";
  return role === "experiment" ? "markers" : role === "computed" ? "lines" : "lines+markers";
}

export function axisTitle(a: { label: string; unit: string }): string {
  return a.unit && a.unit !== "-" ? `${a.label} [${a.unit}]` : a.label;
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The file name an export carries: the view's folder and name. */
function exportName(item: PostItem): string {
  return `${item.op || "case"}_${item.name}`;
}

function ExportButtons({ item, csv, png }: {
  item: PostItem; csv: string; png?: (f: "png" | "svg") => void;
}) {
  return (
    <Group gap={4} justify="flex-end" wrap="nowrap">
      {png && <Button size="compact-xs" variant="default" leftSection={<IconDownload size={12} />}
        onClick={() => png("png")}>PNG</Button>}
      {png && <Button size="compact-xs" variant="default" leftSection={<IconDownload size={12} />}
        onClick={() => png("svg")}>SVG</Button>}
      <Button size="compact-xs" variant="default" leftSection={<IconDownload size={12} />}
        onClick={() => download(`${exportName(item)}.csv`, csv)}>CSV</Button>
    </Group>
  );
}

function PlotFigure({ item, csv }: { item: PostPlot; csv: string }) {
  const gd = useRef<HTMLElement | null>(null);
  const pts = useMemo(() => plotSeries(item, csv), [item, csv]);
  const colours = useMemo(() => seriesColours(item), [item]);
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const traces: any[] = item.series.map((s) => {
    const p = pts.get(s.name)!;
    const mode = seriesMode(s.style, s.role);
    const colour = colours.get(s.name)!;
    const dash = s.role === "reference" ? "dash" : s.role === "difference" ? "dot" : "solid";
    const filled = s.role === "experiment" || mode === "markers";
    const t: any = {
      type: "scatter", mode, name: s.label, x: p.x, y: p.y,
      line: { color: colour, width: s.role === "computed" ? 2.2 : 1.6, dash },
      marker: { color: filled ? colour : "rgba(0,0,0,0)", size: filled ? 7 : 6,
                symbol: s.role === "reference" ? "square-open" : filled ? "circle" : "circle-open",
                line: { color: colour, width: 1.4 } },
      hovertemplate: `${s.label}<br>%{x:.5g}, %{y:.5g}<extra>${s.role}</extra>`,
    };
    if (s.yError && p.yError.some((e) => e !== null))
      t.error_y = { type: "data", array: p.yError.map((e) => e ?? 0), visible: true,
                    color: colour, thickness: 1.2, width: 4 };
    return t;
  });
  if (item.type === "parity" && item.series.length > 0) {
    //  the line a perfect model would sit on -- drawn from the data's own range
    const all = item.series.flatMap((s) => [...pts.get(s.name)!.x, ...pts.get(s.name)!.y]);
    if (all.length > 0) {
      const lo = Math.min(...all), hi = Math.max(...all);
      traces.unshift({ type: "scatter", mode: "lines", name: "fitted = measured",
        x: [lo, hi], y: [lo, hi], hoverinfo: "skip",
        line: { color: "#868e96", width: 1, dash: "dot" } });
    }
  }
  const layout: any = {
    ...darkLayout,
    autosize: true,
    margin: { l: 64, r: 16, t: 8, b: 48 },
    xaxis: { ...darkLayout.xaxis, title: { text: axisTitle(item.xAxis) },
             type: item.xAxis.scale === "log" ? "log" : "linear", automargin: true },
    yaxis: { ...darkLayout.yaxis, title: { text: axisTitle(item.yAxis) },
             type: item.yAxis.scale === "log" ? "log" : "linear", automargin: true },
    //  below the axis title, never over it: anchored by its top, well clear
    legend: { ...darkLayout.legend, orientation: "h", x: 0, y: -0.3, yanchor: "top", font: { size: 11 } },
    showlegend: traces.length > 1,
  };
  if (item.type === "residuals")
    layout.shapes = [{ type: "line", xref: "paper", x0: 0, x1: 1, y0: 0, y1: 0,
                       line: { color: "#868e96", width: 1, dash: "dot" } }];
  const save = (format: "png" | "svg") => {
    if (gd.current)
      void (Plotly as any).downloadImage(gd.current, { format, filename: exportName(item),
                                                      width: 1200, height: 800, scale: 2 });
  };
  const nLegend = traces.length;
  return (
    <Stack gap={4}>
      <ExportButtons item={item} csv={csv} png={save} />
      <Box style={{ height: 340 + 20 * Math.max(0, Math.ceil(nLegend / 2) - 1) }}
        data-view-plot={`${item.op || "case"}/${item.name}`}>
        <Plot data={traces} layout={layout} config={{ ...PLOT_CONFIG,
            toImageButtonOptions: { ...PLOT_CONFIG.toImageButtonOptions, filename: exportName(item) } }}
          useResizeHandler style={{ width: "100%", height: "100%" }}
          onInitialized={(_f: any, el: HTMLElement) => { gd.current = el; }}
          onUpdate={(_f: any, el: HTMLElement) => { gd.current = el; }} />
      </Box>
    </Stack>
  );
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

function TableFigure({ item, csv }: { item: PostSeriesTable | PostRowsTable; csv: string }) {
  const cells = useMemo(() => tableRows(item, csv), [item, csv]);
  const head = item.shape === "series"
    ? [axisTitle(item.x), ...item.columns.map((c) =>
        c.relative ? `${c.label} [%]` : axisTitle(c))]
    : ["", ...item.columns.map((c) => axisTitle(c))];
  const rowLabel = (k: string, r: number) => {
    if (item.shape === "series") return formatCell(Number(k));
    const row = item.rows[r];
    if (!row) return k;
    return row.unit && row.unit !== "-" ? `${row.label} [${row.unit}]` : row.label;
  };
  const rowRelative = (r: number) => item.shape === "rows" && item.rows[r]?.relative === true;
  const rowRole = (r: number) => (item.shape === "rows" ? item.rows[r]?.role ?? "" : "");
  return (
    <Stack gap={4}>
      <ExportButtons item={item} csv={csv} />
      <ScrollArea type="auto">
        <Table striped withTableBorder withColumnBorders fz="xs" verticalSpacing={3}
          data-view-table={`${item.op || "case"}/${item.name}`}>
          <Table.Thead>
            <Table.Tr>
              {head.map((h, i) => <Table.Th key={i} style={{ whiteSpace: "nowrap" }}>{h}</Table.Th>)}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {cells.keys.map((k, r) => (
              <Table.Tr key={r} style={rowRole(r) === "difference"
                  ? { fontStyle: "italic" } : rowRole(r) === "computed" ? { fontWeight: 600 } : undefined}>
                <Table.Td style={{ whiteSpace: "nowrap" }}>{rowLabel(k, r)}</Table.Td>
                {cells.cells[r]!.map((v, c) => (
                  <Table.Td key={c} ta="right" ff="monospace" style={{ whiteSpace: "nowrap" }}>
                    {formatCell(v, rowRelative(r)
                      || (item.shape === "series" && item.columns[c]?.relative === true))}
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Stack>
  );
}

function Sources({ item }: { item: PostItem }) {
  const rows: { label: string; source: string }[] =
    item.kind === "plot" ? item.series.map((s) => ({ label: s.label, source: s.source }))
    : item.shape === "series" ? item.columns.map((c) => ({ label: c.label, source: c.source ?? "" }))
    : item.rows.map((r) => ({ label: r.label, source: r.source }));
  return (
    <details>
      <summary style={{ cursor: "pointer" }}>
        <Text span size="xs" c="dimmed">Where every number comes from</Text>
      </summary>
      <Stack gap={2} mt={4}>
        {rows.map((r, i) => (
          <Text key={i} size="xs" c="dimmed"><Text span fw={600}>{r.label}</Text> — {r.source}</Text>
        ))}
        <Text size="xs" c="dimmed" ff="monospace">{item.file}</Text>
      </Stack>
    </details>
  );
}

/** One view, drawn: its title, the figure or table, its exports, its sources. */
export function ViewFigure({ item, csv }: { item: PostItem; csv: string | undefined }) {
  return (
    <Box data-view={`${item.op || "case"}/${item.name}`}
      style={{ border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
               borderRadius: 6, padding: "8px 10px",
               background: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-7))",
               minWidth: 0 }}>
      <Stack gap={6}>
        <Text size="sm" fw={600} style={{ lineHeight: 1.3 }}>{item.title}</Text>
        {csv === undefined ? (
          <Text size="sm" c="red.5">
            The run wrote no {item.file} -- the engine's views did not finish (see the Log).
          </Text>
        ) : item.kind === "plot" ? (
          <PlotFigure item={item} csv={csv} />
        ) : (
          <TableFigure item={item} csv={csv} />
        )}
        <Sources item={item} />
      </Stack>
    </Box>
  );
}
