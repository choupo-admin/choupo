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
  C110 G2/G5): the plan's summary, the GANTT CHART drawn from the bars the
  engine published, its trains, its stages (and, with several products, its
  products and their per-product times), its findings.

  The chart is a self-contained SVG sheet -- one block per train (one
  product: its first campaign; several: its year, then each product's first
  campaign), one row per published stage and per train-level segment row,
  one bar per published Gantt row, the limiting stage marked, T_L
  dimensioned between two published bar starts, the published occupancy
  beside every row, a legend, footnotes and a title block -- drawn in ink on
  white paper whatever the app's theme, so the "Download SVG" file and a
  print read as the screen does (the C103 floor-plan rule).

  All geometry is case/batchGantt.ts (pure, tested); this file only draws.
  Nothing here computes a time, an occupancy or a verdict.  A field the
  engine did not publish is NAMED above the chart, never defaulted.
\*---------------------------------------------------------------------------*/

import { useId, useMemo, useRef } from "react";
import { Box, Button, Group, ScrollArea, Table, Text } from "@mantine/core";
import { IconDownload } from "@tabler/icons-react";

import type {
  BatchPlan, MultiProductPlan, SingleProductPlan,
} from "../adapters/batchPlanPayload.js";
import {
  GANTT, LOT_KIND, ganttFigure, kindColour, kindLegend, lotColour, productColour,
  type GanttBarGeom, type GanttFigure,
} from "../case/batchGantt.js";
import { downloadTextFile } from "../case/saveCase.js";
import { useNarrowViewport } from "./methods/methodsChrome.js";

//  Paper and ink: a drawing is read on white, in the app and on paper.
const INK = "#212529";
const MUTED = "#6c757d";
const PAPER = "#ffffff";
const GRID = "#dee2e6";
const BAND = "#f8f9fa";
const LIMIT = "#c92a2a";

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "—");
const pct = (v: number, d = 1) => (Number.isFinite(v) ? `${(v * 100).toFixed(d)} %` : "—");
const cnt = (v: number) => (Number.isFinite(v) ? String(v) : "—");
const leafOf = (s: string) => s.slice(s.lastIndexOf("/") + 1) || s;
const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "_");
const tickText = (h: number) => (Number.isInteger(h) ? String(h) : String(Number(h.toPrecision(6))));

function barFill(b: GanttBarGeom, fig: GanttFigure, hatch: (k: string) => string): string {
  if (b.kind === LOT_KIND)
    return fig.multiProduct ? productColour(b.src.product, fig.products)
      : lotColour(b.stageType, fig.stageTypes);
  if (b.kind === "campaign") return productColour(b.src.product, fig.products);
  return `url(#${hatch(b.kind)})`;
}

function barTitle(b: GanttBarGeom): string {
  const g = b.src;
  const when = `${fmt(g.start)}–${fmt(g.end)} h`;
  const who = g.product ? ` · ${g.product}` : "";
  if (b.kind === LOT_KIND) return `${g.stage} · lot ${g.lot} · unit ${g.unit} · ${when}${who}`;
  if (b.kind === "campaign") return `campaign ${g.campaign} · ${g.lots} lots · ${when}${who}`;
  return `${b.kind}${g.stage && g.stage !== b.kind ? ` · ${g.stage}` : ""} · ${when}${who}`;
}

/** The Gantt sheet, as an SVG. */
export function BatchGanttSvg({ plan, fig, caseName, svgRef }: {
  plan: BatchPlan; fig: GanttFigure; caseName: string;
  svgRef?: React.Ref<SVGSVGElement>;
}) {
  const uid = useId().replace(/:/g, "");
  const G = GANTT;
  const plotR = fig.plotX + G.plotW;
  const occX = plotR + 14;
  const hatchKinds = fig.kinds.filter((k) => k !== LOT_KIND && k !== "campaign");
  const hatchId = (k: string) => `${uid}-hatch-${safe(k)}`;
  const s = plan.summary;
  const title = plan.multiProduct
    ? "Batch plan — Gantt chart of the year, campaign by campaign"
    : "Batch plan — Gantt chart of the first campaign";
  const sub = plan.multiProduct
    ? `${leafOf(caseName) || "case"} · ${plan.products.length} products in the order `
      + `${plan.summary.campaignOrder.join(" → ") || "—"} · ${cnt(s.lotsPerYear)} lots a year · `
      + `${fmt(s.production, 0)} kg a year · times in hours`
    : `${leafOf(caseName) || "case"} · product ${plan.summary.product || "—"} · lot `
      + `${fmt(plan.summary.lotSize, 1)} kg · ${cnt(s.lotsPerYear)} lots a year · `
      + `${fmt(s.production, 0)} kg a year · times in hours`;
  return (
    <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${fig.width} ${fig.height}`} width={fig.width} height={fig.height}
      role="img" aria-label={title}
      data-batch-gantt=""
      fontFamily="Helvetica, Arial, sans-serif"
      style={{ width: "100%", minWidth: 900, height: "auto", display: "block", background: PAPER }}>
      <defs>
        {hatchKinds.map((k) => (
          <pattern key={k} id={hatchId(k)} width="6" height="6" patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)">
            <rect width="6" height="6" fill={kindColour(k, fig.kinds)} fillOpacity={0.25} />
            <line x1="0" y1="0" x2="0" y2="6" stroke={kindColour(k, fig.kinds)} strokeWidth="2.4" />
          </pattern>
        ))}
      </defs>
      <rect x={0} y={0} width={fig.width} height={fig.height} fill={PAPER} />

      {/* Title block */}
      <text x={G.marginL} y={20} fontSize={15} fontWeight={700} fill={INK}>{title}</text>
      <text x={G.marginL} y={38} fontSize={11} fill={MUTED}>{sub}</text>

      {fig.blocks.map((blk) => {
        const xOf = (h: number) => fig.plotX + (h - blk.t0) * blk.scale;
        const rowsTop = blk.axisY;
        const lastRow = blk.rows.at(-1);
        const rowsBot = lastRow ? lastRow.y + lastRow.h : rowsTop;
        const rightHead = blk.role === "first" ? "utilisation" : "occupancy";
        return (
          <g key={blk.key} data-block={blk.key} data-role={blk.role}>
            <text x={G.marginL} y={blk.y + 15} fontSize={blk.role === "first" ? 12 : 13}
              fontWeight={700} fill={blk.role === "first" ? productColour(blk.product, fig.products) : INK}>
              {blk.title}
            </text>
            <text x={G.marginL} y={blk.y + 29} fontSize={10.5} fill={INK}>{blk.detail}</text>
            {blk.ticks.map((h) => (
              <g key={h}>
                <line x1={xOf(h)} x2={xOf(h)} y1={rowsTop} y2={rowsBot} stroke={GRID} strokeWidth={0.8} />
                <line x1={xOf(h)} x2={xOf(h)} y1={rowsTop - 4} y2={rowsTop} stroke={INK} strokeWidth={0.8} />
                <text x={xOf(h)} y={rowsTop - 6} fontSize={9.5} fill={INK} textAnchor="middle">
                  {tickText(h)}
                </text>
              </g>
            ))}
            <line x1={fig.plotX} x2={plotR} y1={rowsTop} y2={rowsTop} stroke={INK} strokeWidth={0.9} />
            <text x={plotR} y={rowsTop - 17} fontSize={9.5} fill={MUTED} textAnchor="end">
              {blk.role === "single" ? "time from the campaign's start [h]"
                : "time from the start of the year's first campaign [h]"}
            </text>
            <text x={occX} y={rowsTop - 6} fontSize={9.5} fill={INK}>{rightHead}</text>
            {blk.availableX !== null && (
              <g data-available="">
                <line x1={blk.availableX} x2={blk.availableX} y1={rowsTop} y2={rowsBot}
                  stroke={LIMIT} strokeWidth={1.2} strokeDasharray="5 3" />
                <text x={blk.availableX - 3} y={rowsBot + 11} fontSize={9.5} fill={LIMIT}
                  textAnchor="end">{`available ${fmt(blk.availableHours, 0)} h`}</text>
              </g>
            )}
            {blk.cycleDim && (
              <g data-cycle-dim="">
                <line x1={blk.cycleDim.x0} x2={blk.cycleDim.x1} y1={blk.cycleDim.y}
                  y2={blk.cycleDim.y} stroke={LIMIT} strokeWidth={1} />
                <line x1={blk.cycleDim.x0} x2={blk.cycleDim.x0} y1={blk.cycleDim.y - 4}
                  y2={blk.cycleDim.y + 4} stroke={LIMIT} strokeWidth={1} />
                <line x1={blk.cycleDim.x1} x2={blk.cycleDim.x1} y1={blk.cycleDim.y - 4}
                  y2={blk.cycleDim.y + 4} stroke={LIMIT} strokeWidth={1} />
                <text x={blk.cycleDim.x1 + 4} y={blk.cycleDim.y + 3.5} fontSize={9.5} fill={LIMIT}>
                  {`T_L = ${fmt(blk.cycleDim.hours)} h`}
                </text>
              </g>
            )}
            {blk.rows.map((r, i) => {
              const mid = r.y + r.h / 2;
              const two = r.sub !== "";
              return (
                <g key={r.key} data-row={r.key}>
                  {i % 2 === 1 && (
                    <rect x={G.marginL} y={r.y} width={occX - G.marginL + G.occW - 14} height={r.h}
                      fill={BAND} />
                  )}
                  {r.limiting && (
                    <rect x={G.marginL} y={r.y + 1} width={3} height={r.h - 2} fill={LIMIT} />
                  )}
                  <text x={G.marginL + 8} y={two ? mid - 2 : mid + 3.5} fontSize={11}
                    fontWeight={r.limiting ? 700 : 400} fill={INK}>
                    {r.label}{r.limiting ? (blk.role === "first" ? " ◆" : "  ◆ limiting") : ""}
                  </text>
                  {two && (
                    <text x={G.marginL + 8} y={mid + 10} fontSize={9} fill={MUTED}>{r.sub}</text>
                  )}
                  {r.right && (
                    <g data-occupancy={r.key}>
                      <rect x={occX} y={mid - 5} width={70} height={10} fill="none" stroke={MUTED}
                        strokeWidth={0.6} />
                      <rect x={occX} y={mid - 5}
                        width={Math.max(0, Math.min(1, Number.isFinite(r.rightValue) ? r.rightValue : 0)) * 70}
                        height={10} fill={r.limiting ? LIMIT : MUTED} fillOpacity={0.55} />
                      <text x={occX + 76} y={mid + 3.5} fontSize={10} fill={INK}>
                        {r.right.replace(/^util\. /, "")}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        );
      })}

      {/* the bars: one per published Gantt row (per block it falls in) */}
      {fig.bars.map((b) => {
        const lot = b.kind === LOT_KIND;
        const solid = lot || b.kind === "campaign";
        const fill = barFill(b, fig, hatchId);
        return (
          <g key={`${b.block}:${b.src.id || `${b.rowKey}:${b.src.start}`}`} data-bar={b.kind}>
            <title>{barTitle(b)}</title>
            <rect x={b.x} y={b.y} width={Math.max(b.w, 1)} height={b.h}
              fill={fill} fillOpacity={lot ? 0.85 : b.kind === "campaign" ? 0.35 : 1}
              stroke={solid ? (lot && b.limiting ? LIMIT : b.kind === "campaign" ? fill : PAPER)
                : kindColour(b.kind, fig.kinds)}
              strokeWidth={lot ? (b.limiting ? 1.6 : 0.8) : 1.2}
              strokeDasharray={solid ? undefined : "4 2"} />
            {b.label && (
              <text x={b.x + b.w / 2} y={b.y + b.h / 2 + 3.5} fontSize={9.5}
                fill={lot ? PAPER : INK} fontWeight={lot ? 600 : 400} textAnchor="middle">
                {b.label}
              </text>
            )}
            {b.labelOutside && (
              <text x={b.labelBefore ? b.x - 3 : b.x + Math.max(b.w, 1) + 3}
                y={b.y + b.h / 2 + 3.5} fontSize={9} textAnchor={b.labelBefore ? "end" : "start"}
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
          if (fig.multiProduct)
            for (const p of fig.products)
              line(`product:${p}`,
                <rect width={26} height={11} fill={productColour(p, fig.products)} fillOpacity={0.85} />,
                `${p}: its lots (one stage cycle each, lot number inside) and, lighter, its campaigns`);
          else
            for (const t of fig.stageTypes)
              line(`type:${t}`,
                <rect width={26} height={11} fill={lotColour(t, fig.stageTypes)} fillOpacity={0.85} />,
                `lot of a ${t || "—"} stage: one stage cycle (charge + process + discharge + clean), `
                  + "lot number inside");
          for (const k of hatchKinds)
            line(`kind:${k}`,
              <rect width={26} height={11} fill={`url(#${hatchId(k)})`}
                stroke={kindColour(k, fig.kinds)} strokeDasharray="4 2" />,
              kindLegend(k));
          line("limiting",
            <g><rect width={26} height={11} fill="none" stroke={LIMIT} strokeWidth={1.6} />
               <rect width={3} height={11} fill={LIMIT} /></g>,
            "the limiting stage (sets T_L, the cycle time); T_L dimensioned between its lot-1 and "
              + "lot-2 starts");
          line("occ",
            <rect width={26} height={11} fill={MUTED} fillOpacity={0.55} />,
            fig.multiProduct
              ? "occupancy (the year): busy hours over the train's available hours; utilisation "
                + "(a first campaign): the product's effective cycle over its T_L -- both as published"
              : "occupancy: the stage's busy hours over its train's available hours a year, as published");
          if (fig.multiProduct)
            line("avail",
              <line x1={13} x2={13} y1={0} y2={11} stroke={LIMIT} strokeWidth={1.2} strokeDasharray="5 3" />,
              "the train's available hours a year, as published");
          line("note1", <g />,
            "Every bar is a published Gantt row (start, end, out-of-phase unit); where charge, process, "
              + "discharge and clean fall inside a lot is not published, so it is not drawn.");
          line("note2", <g />,
            fig.multiProduct
              ? "The engine publishes the lots of each product's FIRST campaign only; later campaigns "
                + "repeat it (the last may hold fewer lots).  Each block on its own window of the year."
              : "The first campaign of each train only; later campaigns repeat it, shifted by the "
                + "campaign duration (the last may hold fewer lots).  Each train on its own time axis.");
          return out;
        })()}
      </g>
    </svg>
  );
}

function SingleTables({ plan }: { plan: SingleProductPlan }) {
  return (
    <>
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
                <Table.Td ta="right">{cnt(t.lotsPerCampaign)}</Table.Td>
                <Table.Td ta="right">{cnt(t.campaigns)}</Table.Td>
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
                <Table.Td ta="right">{cnt(st.unitsInstalled)}
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
    </>
  );
}

function MultiTables({ plan }: { plan: MultiProductPlan }) {
  const order = plan.summary.campaignOrder.length > 0
    ? plan.summary.campaignOrder : plan.products.map((p) => p.name);
  const byOrder = <T extends { product: string }>(xs: T[]) =>
    [...xs].sort((a, b) => order.indexOf(a.product) - order.indexOf(b.product));
  return (
    <>
      <Text size="sm" fw={600} mt="md" mb={4}>Products, in the campaign order</Text>
      <ScrollArea type="auto">
        <Table striped withTableBorder fz="xs" ff="monospace" miw={760}>
          <Table.Thead><Table.Tr>
            <Table.Th>product</Table.Th><Table.Th>then</Table.Th>
            <Table.Th ta="right">declared (kg/yr)</Table.Th><Table.Th>lot rule</Table.Th>
            <Table.Th ta="right">lot (kg)</Table.Th><Table.Th ta="right">lots / yr</Table.Th>
            <Table.Th ta="right">made (kg/yr)</Table.Th><Table.Th ta="right">equivalent (h)</Table.Th>
            <Table.Th>own balance</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {[...plan.products].sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name))
              .map((p) => (
                <Table.Tr key={p.name}>
                  <Table.Td>{p.name}</Table.Td><Table.Td>{p.next}</Table.Td>
                  <Table.Td ta="right">{fmt(p.perYear, 0)}</Table.Td><Table.Td>{p.lotRule}</Table.Td>
                  <Table.Td ta="right">{fmt(p.lotSize, 1)}</Table.Td>
                  <Table.Td ta="right">{cnt(p.lotsPerYear)}</Table.Td>
                  <Table.Td ta="right">{fmt(p.production, 0)}</Table.Td>
                  <Table.Td ta="right">{fmt(p.equivalentHours, 0)}</Table.Td>
                  <Table.Td>{p.ownBalance.join(", ")}</Table.Td>
                </Table.Tr>
              ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      <Text size="sm" fw={600} mt="md" mb={4}>Trains, and each product on each train</Text>
      <ScrollArea type="auto">
        <Table striped withTableBorder fz="xs" ff="monospace" miw={900}>
          <Table.Thead><Table.Tr>
            <Table.Th>train</Table.Th><Table.Th>product</Table.Th><Table.Th>limiting stage</Table.Th>
            <Table.Th ta="right">T_L (h)</Table.Th><Table.Th ta="right">campaigns</Table.Th>
            <Table.Th ta="right">lots, last</Table.Th><Table.Th ta="right">span (h)</Table.Th>
            <Table.Th ta="right">starts (h)</Table.Th><Table.Th ta="right">clean after (h)</Table.Th>
            <Table.Th ta="right">required (h/yr)</Table.Th>
            <Table.Th ta="right">available (h/yr)</Table.Th><Table.Th ta="right">occupancy</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {plan.trains.map((t) => [
              <Table.Tr key={t.name}>
                <Table.Td fw={700}>{t.name}</Table.Td>
                <Table.Td>{`${cnt(t.lotsPerCampaign)} lots a campaign · changeover ${fmt(t.changeover)} h`}</Table.Td>
                <Table.Td /><Table.Td />
                <Table.Td ta="right">{cnt(t.campaigns)}</Table.Td><Table.Td /><Table.Td /><Table.Td />
                <Table.Td ta="right">{fmt(t.changeoverHours, 1)}</Table.Td>
                <Table.Td ta="right">{fmt(t.requiredTime, 1)}</Table.Td>
                <Table.Td ta="right">{fmt(t.availableTime, 0)}</Table.Td>
                <Table.Td ta="right">{pct(t.occupancy)}</Table.Td>
              </Table.Tr>,
              ...byOrder(plan.productTrains.filter((x) => x.train === t.name)).map((x) => (
                <Table.Tr key={`${t.name}:${x.product}`}>
                  <Table.Td /><Table.Td>{x.product}</Table.Td><Table.Td>{x.limitingStage}</Table.Td>
                  <Table.Td ta="right">{fmt(x.cycleTime)}</Table.Td>
                  <Table.Td ta="right">{cnt(x.campaigns)}</Table.Td>
                  <Table.Td ta="right">{cnt(x.lotsLastCampaign)}</Table.Td>
                  <Table.Td ta="right">{fmt(x.campaignSpan)}</Table.Td>
                  <Table.Td ta="right">{fmt(x.start, 1)}</Table.Td>
                  <Table.Td ta="right">{fmt(x.productChangeover)}</Table.Td>
                  <Table.Td ta="right">{fmt(x.requiredTime, 1)}</Table.Td>
                  <Table.Td /><Table.Td />
                </Table.Tr>
              )),
            ])}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      <Text size="xs" c="dimmed" mt={2}>
        A train row's "clean after" column is its year's changeover hours.
      </Text>

      <Text size="sm" fw={600} mt="md" mb={4}>Stages</Text>
      <ScrollArea type="auto">
        <Table striped withTableBorder fz="xs" ff="monospace" miw={860}>
          <Table.Thead><Table.Tr>
            <Table.Th>stage</Table.Th><Table.Th>train</Table.Th><Table.Th>type</Table.Th>
            <Table.Th>sized for</Table.Th><Table.Th ta="right">units</Table.Th>
            <Table.Th ta="right">product clean (h)</Table.Th>
            <Table.Th ta="right">max utilisation</Table.Th><Table.Th ta="right">busy (h/yr)</Table.Th>
            <Table.Th ta="right">occupancy</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {plan.stages.map((st) => (
              <Table.Tr key={st.name}>
                <Table.Td>{st.name}</Table.Td><Table.Td>{st.train}</Table.Td>
                <Table.Td>{st.type}</Table.Td><Table.Td>{st.sizingProduct}</Table.Td>
                <Table.Td ta="right">{cnt(st.unitsInstalled)}
                  {st.outOfPhase > 1 ? ` (${st.outOfPhase} o.o.p.)` : ""}</Table.Td>
                <Table.Td ta="right">{fmt(st.productChangeover)}</Table.Td>
                <Table.Td ta="right">{pct(st.maxUtilisation)}</Table.Td>
                <Table.Td ta="right">{fmt(st.busyHours, 1)}</Table.Td>
                <Table.Td ta="right">{pct(st.occupancy)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      <Text size="sm" fw={600} mt="md" mb={4}>Each product at each stage</Text>
      <ScrollArea type="auto">
        <Table striped withTableBorder fz="xs" ff="monospace" miw={1000}>
          <Table.Thead><Table.Tr>
            <Table.Th>product</Table.Th><Table.Th>stage</Table.Th>
            <Table.Th ta="right">charge</Table.Th><Table.Th ta="right">process</Table.Th>
            <Table.Th ta="right">discharge</Table.Th><Table.Th ta="right">clean</Table.Th>
            <Table.Th ta="right">cycle (h)</Table.Th><Table.Th ta="right">start (h)</Table.Th>
            <Table.Th ta="right">utilisation</Table.Th><Table.Th ta="right">clean after (h)</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {byOrder(plan.productStages).map((x) => (
              <Table.Tr key={`${x.product}:${x.stage}`}>
                <Table.Td>{x.product}</Table.Td>
                <Table.Td fw={x.limiting ? 700 : undefined}>{x.stage}{x.limiting ? " ◆" : ""}</Table.Td>
                <Table.Td ta="right">{fmt(x.chargeTime)}</Table.Td>
                <Table.Td ta="right">{fmt(x.processTime)}</Table.Td>
                <Table.Td ta="right">{fmt(x.dischargeTime)}</Table.Td>
                <Table.Td ta="right">{fmt(x.cleanTime)}</Table.Td>
                <Table.Td ta="right">{fmt(x.cycleTime)}</Table.Td>
                <Table.Td ta="right">{fmt(x.offset)}</Table.Td>
                <Table.Td ta="right">{pct(x.utilisation)}</Table.Td>
                <Table.Td ta="right">{fmt(x.changeoverAfter)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      <Text size="xs" c="dimmed" mt={2}>
        ◆ the stage that limits the product on its train.  "Clean after" is the clean the
        product's last campaign took at the stage before the next product.
      </Text>
    </>
  );
}

/** The Reports section: summary, Gantt (with download), the tables, the
 *  findings. */
export function BatchPlanSection({ plan, caseName = "" }: { plan: BatchPlan; caseName?: string }) {
  const fig = useMemo(() => ganttFigure(plan), [plan]);
  const svgRef = useRef<SVGSVGElement>(null);
  const narrow = useNarrowViewport();
  const download = () => {
    const el = svgRef.current;
    if (!el) return;
    const text = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(el)}\n`;
    downloadTextFile(text, `${safe(leafOf(caseName) || "case")}_batchPlan-gantt.svg`, "image/svg+xml");
  };
  return (
    <Box data-batch-plan>
      {plan.multiProduct ? (
        <Text size="sm" mb={6}>
          <strong>{plan.products.length} products</strong> in single-product campaigns, in the
          declared order <strong>{plan.summary.campaignOrder.join(" → ") || "—"}</strong>:{" "}
          {fmt(plan.summary.productPerYear, 0)} kg a year declared,{" "}
          <strong>{cnt(plan.summary.lotsPerYear)} lots a year</strong> ={" "}
          {fmt(plan.summary.production, 0)} kg; equivalent {fmt(plan.summary.equivalentHours, 0)} h
          at the flowsheet rate (stream factor {fmt(plan.summary.streamFactor, 3)}).
        </Text>
      ) : (
        <Text size="sm" mb={6}>
          Product <strong>{plan.summary.product || "—"}</strong>:{" "}
          {fmt(plan.summary.productPerYear, 0)} kg a year declared, lots of{" "}
          <strong>{fmt(plan.summary.lotSize, 1)} kg</strong> ({plan.summary.lotRule}
          {plan.summary.lotStream ? ` on ${plan.summary.lotStream}` : ""}
          {plan.summary.lotLimitingStage ? `, limited by ${plan.summary.lotLimitingStage}` : ""}),{" "}
          <strong>{cnt(plan.summary.lotsPerYear)} lots a year</strong> ={" "}
          {fmt(plan.summary.production, 0)} kg; equivalent {fmt(plan.summary.equivalentHours, 0)} h
          at the flowsheet rate (stream factor {fmt(plan.summary.streamFactor, 3)}).
        </Text>
      )}
      {plan.missing.length > 0 && (
        <Text size="xs" c="red" mb={6} data-batch-plan-missing="">
          The engine's batch plan does not carry {plan.missing.length === 1 ? "a field" : "fields"}{" "}
          this report reads, so {plan.missing.length === 1 ? "it is" : "they are"} shown as "—" and
          nothing is put in {plan.missing.length === 1 ? "its" : "their"} place:{" "}
          {plan.missing.slice(0, 12).join(", ")}
          {plan.missing.length > 12 ? `, and ${plan.missing.length - 12} more` : ""}.
        </Text>
      )}
      {fig && (
        <>
          <Group gap="sm" mb={6} align="center">
            <Text size="sm" fw={600}>
              {plan.multiProduct ? "Gantt chart — the year, then each product's first campaign"
                : "Gantt chart — first campaign"}
            </Text>
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

      {plan.multiProduct ? <MultiTables plan={plan} /> : <SingleTables plan={plan} />}

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
      {plan.summary.unplannedUnits.length > 0 && (
        <Text size="xs" c="dimmed" mt="xs">
          Units in no stage of the plan: {plan.summary.unplannedUnits.join(", ")}.
        </Text>
      )}
    </Box>
  );
}
