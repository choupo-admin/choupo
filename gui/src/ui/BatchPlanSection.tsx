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
  BatchPlanSection -- the Reports section of a BATCH PLAN (DEV.md 4c C99,
  C110 G5): the plan's summary, its trains, its stages, its findings, and
  the first campaign's GANTT CHART drawn from the data the engine published.

  The chart is a self-contained SVG sheet -- one block per train on its own
  time axis, one row per published stage (and per published segment that
  names no stage), one bar per published Gantt row, the limiting stage
  marked, T_L dimensioned between two published bar starts, the occupancy
  of every stage beside its row, a legend, footnotes and a title block --
  drawn in ink on white paper whatever the app's theme, so the "Download
  SVG" file and a print read as the screen does (the C103 floor-plan rule).

  All geometry is case/batchGantt.ts (pure, tested); this file only draws.
  Nothing here computes a time, an occupancy or a verdict.
\*---------------------------------------------------------------------------*/

import { useId, useMemo, useRef } from "react";
import { Box, Button, Group, ScrollArea, Table, Text } from "@mantine/core";
import { IconDownload } from "@tabler/icons-react";

import type { BatchPlan } from "../adapters/batchPlanPayload.js";
import {
  GANTT, LOT_KIND, ganttFigure, kindColour, kindLegend, lotColour, type GanttFigure,
} from "../case/batchGantt.js";
import { downloadTextFile } from "../case/saveCase.js";
import { useNarrowViewport } from "./methods/methodsChrome.js";

//  Paper and ink: a drawing is read on white, in the app and on paper.
const INK = "#212529";
const MUTED = "#6c757d";
const PAPER = "#ffffff";
const GRID = "#dee2e6";
const LIMIT = "#c92a2a";

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "—");
const pct = (v: number, d = 1) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)} %` : "—");
const leafOf = (s: string) => s.slice(s.lastIndexOf("/") + 1) || s;
const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "_");
const tickText = (h: number) => (Number.isInteger(h) ? String(h) : String(Number(h.toPrecision(6))));

/** The Gantt sheet, as an SVG. */
export function BatchGanttSvg({ plan, fig, caseName, svgRef }: {
  plan: BatchPlan; fig: GanttFigure; caseName: string;
  svgRef?: React.Ref<SVGSVGElement>;
}) {
  const uid = useId().replace(/:/g, "");
  const G = GANTT;
  const plotR = fig.plotX + G.plotW;
  const occX = plotR + 14;
  const segKinds = fig.kinds.filter((k) => k !== LOT_KIND);
  const hatchId = (k: string) => `${uid}-hatch-${safe(k)}`;
  const s = plan.summary;
  return (
    <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${fig.width} ${fig.height}`} width={fig.width} height={fig.height}
      role="img" aria-label="Batch plan: Gantt chart of the first campaign"
      data-batch-gantt=""
      fontFamily="Helvetica, Arial, sans-serif"
      style={{ width: "100%", minWidth: 900, height: "auto", display: "block", background: PAPER }}>
      <defs>
        {segKinds.map((k) => (
          <pattern key={k} id={hatchId(k)} width="6" height="6" patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)">
            <rect width="6" height="6" fill={kindColour(k, fig.kinds)} fillOpacity={0.25} />
            <line x1="0" y1="0" x2="0" y2="6" stroke={kindColour(k, fig.kinds)} strokeWidth="2.4" />
          </pattern>
        ))}
      </defs>
      <rect x={0} y={0} width={fig.width} height={fig.height} fill={PAPER} />

      {/* Title block */}
      <text x={G.marginL} y={20} fontSize={15} fontWeight={700} fill={INK}>
        Batch plan — Gantt chart of the first campaign
      </text>
      <text x={G.marginL} y={38} fontSize={11} fill={MUTED}>
        {`${leafOf(caseName) || "case"} · product ${s.product || "—"} · lot ${fmt(s.lotSize, 1)} kg · `
          + `${s.lotsPerYear} lots a year · ${fmt(s.production, 0)} kg a year · times in hours`}
      </text>

      {fig.trains.map((t) => {
        const tr = t.train;
        const xOf = (h: number) => fig.plotX + h * t.scale;
        const rowsTop = t.axisY;
        const lastRow = t.rows.at(-1);
        const rowsBot = lastRow ? lastRow.y + lastRow.h : rowsTop;
        return (
          <g key={t.name} data-train={t.name}>
            <text x={G.marginL} y={t.y + 15} fontSize={13} fontWeight={700} fill={INK}>
              {`Train ${t.name}`}
            </text>
            <text x={G.marginL + 150} y={t.y + 15} fontSize={11} fill={INK}>
              {tr
                ? `T_L = ${fmt(tr.cycleTime)} h (limiting: ${tr.limitingStage || "—"}) · `
                  + `${tr.lotsPerCampaign} lots a campaign · span ${fmt(tr.campaignSpan)} h `
                  + `+ changeover ${fmt(tr.changeover)} h = ${fmt(tr.campaignDuration)} h · `
                  + `${tr.campaigns} campaigns a year · train occupancy ${pct(tr.occupancy)}`
                : "(no train record published)"}
            </text>
            {/* the train's own time axis */}
            {t.ticks.map((h) => (
              <g key={h}>
                <line x1={xOf(h)} x2={xOf(h)} y1={rowsTop} y2={rowsBot} stroke={GRID} strokeWidth={0.8} />
                <line x1={xOf(h)} x2={xOf(h)} y1={rowsTop - 4} y2={rowsTop} stroke={INK} strokeWidth={0.8} />
                <text x={xOf(h)} y={rowsTop - 6} fontSize={9.5} fill={INK} textAnchor="middle">
                  {tickText(h)}
                </text>
              </g>
            ))}
            <line x1={fig.plotX} x2={plotR} y1={rowsTop} y2={rowsTop} stroke={INK} strokeWidth={0.9} />
            <text x={plotR} y={rowsTop - 17} fontSize={9.5} fill={MUTED} textAnchor="end">time [h]</text>
            <text x={occX} y={rowsTop - 6} fontSize={9.5} fill={INK}>occupancy</text>
            {/* T_L: a dimension between two published bar starts */}
            {t.cycleDim && (
              <g data-cycle-dim="">
                <line x1={t.cycleDim.x0} x2={t.cycleDim.x1} y1={t.cycleDim.y} y2={t.cycleDim.y}
                  stroke={LIMIT} strokeWidth={1} />
                <line x1={t.cycleDim.x0} x2={t.cycleDim.x0} y1={t.cycleDim.y - 4} y2={t.cycleDim.y + 4}
                  stroke={LIMIT} strokeWidth={1} />
                <line x1={t.cycleDim.x1} x2={t.cycleDim.x1} y1={t.cycleDim.y - 4} y2={t.cycleDim.y + 4}
                  stroke={LIMIT} strokeWidth={1} />
                <text x={t.cycleDim.x1 + 4} y={t.cycleDim.y + 3.5} fontSize={9.5} fill={LIMIT}>
                  {`T_L = ${fmt(tr?.cycleTime ?? NaN)} h`}
                </text>
              </g>
            )}
            {t.rows.map((r, i) => {
              const st = r.stage;
              const mid = r.y + r.h / 2;
              return (
                <g key={r.key} data-row={r.key}>
                  {i % 2 === 1 && (
                    <rect x={G.marginL} y={r.y} width={occX - G.marginL + G.occW - 14} height={r.h}
                      fill="#f8f9fa" />
                  )}
                  {r.limiting && (
                    <rect x={G.marginL} y={r.y + 1} width={3} height={r.h - 2} fill={LIMIT} />
                  )}
                  <text x={G.marginL + 8} y={mid - 2} fontSize={11}
                    fontWeight={r.limiting ? 700 : 400} fill={INK}>
                    {r.label}{r.limiting ? "  ◆ limiting" : ""}
                  </text>
                  <text x={G.marginL + 8} y={mid + 10} fontSize={9} fill={MUTED}>
                    {st
                      ? `${st.type} · cycle ${fmt(st.cycleTime)} h · ${st.unitsInstalled} unit`
                        + `${st.unitsInstalled === 1 ? "" : "s"}`
                        + (st.outOfPhase > 1 ? ` (${st.outOfPhase} out of phase)` : "")
                      : "segment (not a stage)"}
                  </text>
                  {st && (
                    <g data-occupancy={st.name}>
                      <rect x={occX} y={mid - 5} width={70} height={10} fill="none" stroke={MUTED}
                        strokeWidth={0.6} />
                      <rect x={occX} y={mid - 5}
                        width={Math.max(0, Math.min(1, Number.isFinite(st.occupancy) ? st.occupancy : 0)) * 70}
                        height={10} fill={r.limiting ? LIMIT : MUTED} fillOpacity={0.55} />
                      <text x={occX + 76} y={mid + 3.5} fontSize={10} fill={INK}>{pct(st.occupancy)}</text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}

      {/* the bars: one per published Gantt row */}
      {fig.bars.map((b) => {
        const lot = b.kind === LOT_KIND;
        const fill = lot ? lotColour(b.stageType, fig.stageTypes) : `url(#${hatchId(b.kind)})`;
        const title = lot
          ? `${b.src.stage} · lot ${b.src.lot} · unit ${b.src.unit} · ${fmt(b.src.start)}–${fmt(b.src.end)} h`
          : `${b.kind} · ${b.src.stage} · ${fmt(b.src.start)}–${fmt(b.src.end)} h`;
        return (
          <g key={b.src.id || `${b.rowKey}:${b.src.start}`} data-bar={b.kind}>
            <title>{title + (b.src.product ? ` · ${b.src.product}` : "")}</title>
            <rect x={b.x} y={b.y} width={Math.max(b.w, 1)} height={b.h}
              fill={fill} fillOpacity={lot ? 0.85 : 1}
              stroke={lot ? (b.limiting ? LIMIT : PAPER) : kindColour(b.kind, fig.kinds)}
              strokeWidth={lot ? (b.limiting ? 1.6 : 0.8) : 1.2}
              strokeDasharray={lot ? undefined : "4 2"} />
            {b.label && (
              <text x={b.x + b.w / 2} y={b.y + b.h / 2 + 3.5} fontSize={9.5}
                fill={lot ? PAPER : INK} fontWeight={lot ? 600 : 400} textAnchor="middle">
                {b.label}
              </text>
            )}
            {b.labelOutside && (
              <text x={b.x + Math.max(b.w, 1) + 3} y={b.y + b.h / 2 + 3.5} fontSize={9}
                fill={kindColour(b.kind, fig.kinds)} fontStyle="italic">
                {b.labelOutside}
              </text>
            )}
          </g>
        );
      })}

      {/* Legend and footnotes */}
      <g data-legend="" fontSize={10} fill={INK}>
        {(() => {
          let y = fig.legendY;
          const out: React.ReactNode[] = [];
          const line = (key: string, swatch: React.ReactNode, text: string) => {
            out.push(
              <g key={key}>
                <g transform={`translate(${G.marginL}, ${y})`}>{swatch}</g>
                <text x={G.marginL + 34} y={y + 9}>{text}</text>
              </g>);
            y += G.legendLineH;
          };
          for (const t of fig.stageTypes)
            line(`type:${t}`,
              <rect width={26} height={11} fill={lotColour(t, fig.stageTypes)} fillOpacity={0.85} />,
              `lot of a ${t || "—"} stage: one stage cycle (charge + process + discharge + clean), `
                + "lot number inside");
          for (const k of segKinds)
            line(`kind:${k}`,
              <rect width={26} height={11} fill={`url(#${hatchId(k)})`}
                stroke={kindColour(k, fig.kinds)} strokeDasharray="4 2" />,
              kindLegend(k));
          line("limiting",
            <g><rect width={26} height={11} fill="none" stroke={LIMIT} strokeWidth={1.6} />
               <rect width={3} height={11} fill={LIMIT} /></g>,
            "the limiting stage (sets T_L, the train's cycle time); T_L dimensioned between "
              + "its lot-1 and lot-2 starts");
          line("occ",
            <rect width={26} height={11} fill={MUTED} fillOpacity={0.55} />,
            "occupancy: the stage's busy hours over its train's available hours a year, as published");
          line("note1", <g />,
            "Every bar is a published Gantt row (start, end, out-of-phase unit); where charge, process, "
              + "discharge and clean fall inside a bar is not published, so it is not drawn.");
          line("note2", <g />,
            "The first campaign of each train only; later campaigns repeat it, shifted by the campaign "
              + "duration (the last may hold fewer lots).  Each train on its own time axis.");
          return out;
        })()}
      </g>
    </svg>
  );
}

/** The Reports section: summary, Gantt (with download), trains, stages,
 *  findings. */
export function BatchPlanSection({ plan, caseName = "" }: { plan: BatchPlan; caseName?: string }) {
  const fig = useMemo(() => ganttFigure(plan), [plan]);
  const svgRef = useRef<SVGSVGElement>(null);
  const narrow = useNarrowViewport();
  const s = plan.summary;
  const download = () => {
    const el = svgRef.current;
    if (!el) return;
    const text = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(el)}\n`;
    downloadTextFile(text, `${safe(leafOf(caseName) || "case")}_batchPlan-gantt.svg`, "image/svg+xml");
  };
  return (
    <Box data-batch-plan>
      <Text size="sm" mb={6}>
        Product <strong>{s.product || "—"}</strong>: {fmt(s.productPerYear, 0)} kg a year declared,{" "}
        lots of <strong>{fmt(s.lotSize, 1)} kg</strong> ({s.lotRule}
        {s.lotStream ? ` on ${s.lotStream}` : ""}{s.lotLimitingStage ? `, limited by ${s.lotLimitingStage}` : ""}),{" "}
        <strong>{s.lotsPerYear} lots a year</strong> = {fmt(s.production, 0)} kg; equivalent{" "}
        {fmt(s.equivalentHours, 0)} h at the flowsheet rate (stream factor {fmt(s.streamFactor, 3)}).
      </Text>
      {fig && (
        <>
          <Group gap="sm" mb={6} align="center">
            <Text size="sm" fw={600}>Gantt chart — first campaign</Text>
            <Button size="compact-xs" variant="default" leftSection={<IconDownload size={13} />}
              title="Save the Gantt chart as an SVG file (to print or to put in a report)"
              onClick={download}>
              Download SVG
            </Button>
          </Group>
          {narrow && <Text size="xs" c="dimmed" mb={4}>Swipe sideways to read the whole chart.</Text>}
          <Box data-pan-x="" style={{ width: "100%", overflowX: "auto",
                                      border: "1px solid var(--mantine-color-default-border)" }}>
            <BatchGanttSvg plan={plan} fig={fig} caseName={caseName} svgRef={svgRef} />
          </Box>
        </>
      )}

      <Text size="sm" fw={600} mt="md" mb={4}>Trains</Text>
      <ScrollArea type="auto">
        <Table striped withTableBorder fz="xs" ff="monospace" miw={760}>
          <Table.Thead><Table.Tr>
            <Table.Th>train</Table.Th><Table.Th>limiting stage</Table.Th>
            <Table.Th ta="right">T_L (h)</Table.Th><Table.Th ta="right">lots / campaign</Table.Th>
            <Table.Th ta="right">campaigns / yr</Table.Th><Table.Th ta="right">span (h)</Table.Th>
            <Table.Th ta="right">changeover (h)</Table.Th><Table.Th ta="right">required (h/yr)</Table.Th>
            <Table.Th ta="right">available (h/yr)</Table.Th><Table.Th ta="right">occupancy</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {plan.trains.map((t) => (
              <Table.Tr key={t.name}>
                <Table.Td>{t.name}</Table.Td><Table.Td>{t.limitingStage}</Table.Td>
                <Table.Td ta="right">{fmt(t.cycleTime)}</Table.Td>
                <Table.Td ta="right">{t.lotsPerCampaign}</Table.Td>
                <Table.Td ta="right">{t.campaigns}</Table.Td>
                <Table.Td ta="right">{fmt(t.campaignSpan)}</Table.Td>
                <Table.Td ta="right">{fmt(t.changeover)}</Table.Td>
                <Table.Td ta="right">{fmt(t.requiredTime, 1)}</Table.Td>
                <Table.Td ta="right">{fmt(t.availableTime, 0)}</Table.Td>
                <Table.Td ta="right">{pct(t.occupancy)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      <Text size="sm" fw={600} mt="md" mb={4}>Stages</Text>
      <ScrollArea type="auto">
        <Table striped withTableBorder fz="xs" ff="monospace" miw={1000}>
          <Table.Thead><Table.Tr>
            <Table.Th>stage</Table.Th><Table.Th>train</Table.Th><Table.Th>type</Table.Th>
            <Table.Th ta="right">units</Table.Th>
            <Table.Th ta="right">charge</Table.Th><Table.Th ta="right">process</Table.Th>
            <Table.Th ta="right">discharge</Table.Th><Table.Th ta="right">clean</Table.Th>
            <Table.Th ta="right">cycle (h)</Table.Th><Table.Th ta="right">start (h)</Table.Th>
            <Table.Th ta="right">utilisation</Table.Th><Table.Th ta="right">busy (h/yr)</Table.Th>
            <Table.Th ta="right">occupancy</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {plan.stages.map((st) => (
              <Table.Tr key={st.name}>
                <Table.Td fw={st.limiting ? 700 : undefined}>
                  {st.name}{st.limiting ? " ◆" : ""}
                </Table.Td>
                <Table.Td>{st.train}</Table.Td><Table.Td>{st.type}</Table.Td>
                <Table.Td ta="right">{st.unitsInstalled}
                  {st.outOfPhase > 1 ? ` (${st.outOfPhase} o.o.p.)` : ""}</Table.Td>
                <Table.Td ta="right">{fmt(st.chargeTime)}</Table.Td>
                <Table.Td ta="right">{fmt(st.processTime)}</Table.Td>
                <Table.Td ta="right">{fmt(st.dischargeTime)}</Table.Td>
                <Table.Td ta="right">{fmt(st.cleanTime)}</Table.Td>
                <Table.Td ta="right">{fmt(st.cycleTime)}</Table.Td>
                <Table.Td ta="right">{fmt(st.offset)}</Table.Td>
                <Table.Td ta="right">{pct(st.utilisation)}</Table.Td>
                <Table.Td ta="right">{fmt(st.busyHours, 1)}</Table.Td>
                <Table.Td ta="right">{pct(st.occupancy)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      <Text size="xs" c="dimmed" mt={2}>
        ◆ the limiting stage of its train.  Utilisation is the stage's effective cycle over its
        train's T_L; occupancy its busy hours over its train's available hours a year.
      </Text>

      {plan.findings.length > 0 && (
        <>
          <Text size="sm" fw={600} mt="md" mb={4}>Findings</Text>
          {plan.findings.map((f) => (
            <Text key={f.id} size="xs" c="orange" mb={2}>
              <strong>{f.kind}</strong> ({f.subject}): {f.message}
            </Text>
          ))}
        </>
      )}
      {s.unplannedUnits.length > 0 && (
        <Text size="xs" c="dimmed" mt="xs">
          Units in no stage of the plan: {s.unplannedUnits.join(", ")}.
        </Text>
      )}
    </Box>
  );
}
