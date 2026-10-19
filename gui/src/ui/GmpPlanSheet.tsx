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
  GmpPlanSheet -- the GMP floor plans as SHEETS a student can hand in
  (DEV.md 4c C103).  A set of plans per floor, one selected at a time:
  zoning, pressure, and one flow plan per kind; each a self-contained SVG
  sheet -- walls, doors, stairs, the equipment to scale, room labels that
  fit or fall back to the room's number, a scale bar, a north arrow, a
  legend, the footnotes that say what is drawn rather than published, and a
  title block -- drawn in ink on white paper whatever the app's theme, so the
  "Download SVG" file and a print read as the screen does.  Below it, the
  ROOM SCHEDULE, which resolves every number on every plan.

  All geometry is case/gmpPlanSheet.ts (pure, tested); this file only draws.
\*---------------------------------------------------------------------------*/

import { useId, useMemo, useRef, useState } from "react";
import {
  Box, Button, Group, ScrollArea, SegmentedControl, Table, Text,
} from "@mantine/core";
import { IconDownload } from "@tabler/icons-react";

import type { BuildingRoom, FlowKind, GmpBuilding } from "../adapters/buildingPayload.js";
import { envelope, FLOW_LOOK, GRADE_LOOK, GRADE_ORDER, OUTSIDE_STUB, type PlanItemSource } from "../case/gmpBuilding.js";
import {
  cascadeArrow, CHAR_EM, fitRoomLabel, flowRoutes, LINE_EM, PLAN_SHEET_WORD, planDoors,
  planFootnotes, planSheetKinds, roomNumbers, roomSchedule, scaleBarLength, scheduleCsv,
  wrapText, type PlanDoor, type PlanSheetKind, type Pt,
} from "../case/gmpPlanSheet.js";
import { downloadTextFile } from "../case/saveCase.js";

//  Paper and ink: a drawing is read on white, in the app and on paper.
const INK = "#212529";
const MUTED = "#6c757d";
const PAPER = "#ffffff";
const FLAG = "#e8590c";
const BREAK = "#c92a2a";

const ROLE_ABBR: Record<string, string> = {
  personnelAirlock: "PAL", materialAirlock: "MAL", gowning: "GOW",
};
const fmtP = (p: number) => `${p > 0 ? "+" : ""}${Number(p.toFixed(1))} Pa`;

/** A room's fill on the pressure plan: one shade per published pressure
 *  level, light to deep blue with rank; below outside in orange. */
function pressureShades(rooms: BuildingRoom[]): Map<number, string> {
  const levels = [...new Set(rooms.map((r) => r.pressureToOutside))].sort((a, b) => a - b);
  const pos = levels.filter((p) => p >= 0), neg = levels.filter((p) => p < 0);
  const out = new Map<number, string>();
  pos.forEach((p, i) => {
    const t = pos.length > 1 ? i / (pos.length - 1) : 0.5;
    out.set(p, `hsl(210, 75%, ${Math.round(95 - 33 * t)}%)`);
  });
  neg.forEach((p, i) => {
    const t = neg.length > 1 ? 1 - i / (neg.length - 1) : 0.5;
    out.set(p, `hsl(28, 90%, ${Math.round(90 - 18 * (1 - t))}%)`);
  });
  return out;
}

const leafOf = (s: string) => s.slice(s.lastIndexOf("/") + 1) || s;
const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, "_");

interface SheetProps {
  building: GmpBuilding;
  floor: string;
  kind: PlanSheetKind;
  items: PlanItemSource[];
  caseName: string;
}

/** One sheet: the plan of one floor in one plan type, as an SVG.  Plan
 *  coordinates are metres with y north; the SVG flips y (north up). */
export function PlanSheetSvg({ building: b, floor, kind, items, caseName,
                               svgRef }: SheetProps & { svgRef?: React.Ref<SVGSVGElement> }) {
  const uid = useId().replace(/:/g, "");
  const env = useMemo(() => envelope(b), [b]);
  const doors = useMemo(() => planDoors(b), [b]);
  const routes = useMemo(() => flowRoutes(b, doors), [b, doors]);
  const numbers = useMemo(() => roomNumbers(b), [b]);
  const shades = useMemo(() => pressureShades(b.rooms), [b]);
  const flagged = useMemo(() => {
    const names = new Set(b.rooms.map((r) => r.name));
    const s = new Set<string>();
    for (const f of b.findings) for (const n of [f.a, f.b]) if (names.has(n)) s.add(n);
    return s;
  }, [b]);

  const fl = b.floors.find((f) => f.name === floor);
  const rooms = b.rooms.filter((r) => r.floor === floor);
  const here = new Set(rooms.map((r) => r.name));
  const floorDoors = doors.filter((d) => d.placed !== "none" && d.floors.includes(floor));
  const floorItems = items.filter((i) => i.room && here.has(i.room));
  //  A room holding equipment keeps its label at the top, clear of the items.
  const holds = new Set(floorItems.map((i) => i.room!));
  const flowKind: FlowKind | null =
    kind === "personnel" || kind === "material" || kind === "waste" ? kind : null;
  //  A flow plan draws, and keys, only the flows that have a part on this floor.
  const kindRoutes = flowKind
    ? routes.filter((r) => r.kind === flowKind && (r.legs.some((l) => l.floor === floor)
        || r.floorChanges.some((x) => x.floor === floor)))
    : [];

  //  ---- the sheet's frame (SVG units = metres) ---------------------------
  const W = env.x1 - env.x0, H = env.y1 - env.y0;
  const font = Math.min(3, Math.max(0.3, Math.max(W, H) / 75));
  const small = 0.72 * font;
  const pad = OUTSIDE_STUB + 2.5 * font;
  const X0 = env.x0 - pad, X1 = env.x1 + pad;
  const Y0 = -env.y1 - pad, Y1 = -env.y0 + pad;
  const planW = X1 - X0;
  const sy = (y: number) => -y;
  const P = (p: Pt) => `${p[0]},${sy(p[1])}`;

  const footChars = Math.max(30, Math.floor(planW / (CHAR_EM * small)));
  const footLines = planFootnotes(kind).flatMap((n, i) =>
    wrapText(`${i + 1}. ${n}`, footChars));
  const bandTop = Y1 + font;
  const bandH = 4 * font + footLines.length * LINE_EM * small;

  //  The legend, as rows a column stacks.
  const panelW = 30 * font;
  const panelX = X1 + 1.5 * font;
  const legendChars = Math.floor((panelW - 3.5 * font) / (CHAR_EM * small));
  type Row = { sym: JSX.Element | null; lines: string[]; head?: boolean; red?: number };
  const rows: Row[] = [];
  const sw = (fill: string, extra: Partial<React.SVGProps<SVGRectElement>> = {}) =>
    (y: number) => <rect x={panelX} y={y - 0.75 * small} width={2.4 * font} height={1.1 * small}
      fill={fill} stroke={INK} strokeWidth={font / 14} {...extra} />;
  const symRows: { draw: (y: number) => JSX.Element; text: string }[] = [];
  if (kind === "zoning") {
    for (const g of GRADE_ORDER.filter((x) => b.rooms.some((r) => r.grade === x)))
      symRows.push({ draw: sw(GRADE_LOOK[g].css, { fillOpacity: 0.35 }), text: GRADE_LOOK[g].word });
    if (b.rooms.some((r) => r.role !== "room"))
      symRows.push({ draw: sw(PAPER, { strokeDasharray: `${font / 2.5} ${font / 4}` }),
        text: "airlock, dashed: PAL personnel, MAL material, GOW gowning; its regime (cascade, bubble, sink) follows" });
    if (b.rooms.some((r) => r.containment))
      symRows.push({ draw: (y) => (<g>{sw(PAPER)(y)}<rect x={panelX + font / 4} y={y - 0.75 * small + font / 4}
          width={2.4 * font - font / 2} height={1.1 * small - font / 2} fill="none" stroke={INK}
          strokeWidth={font / 14} /></g>),
        text: "contained room (double line; \"cont.\" in its label)" });
    if (b.rooms.some((r) => r.atexZone !== undefined))
      symRows.push({ draw: sw(`url(#${uid}-hatch)`), text: "hazardous area (hatched): \"Ex z<zone>\" in its label" });
    if (b.rooms.some((r) => r.ignition))
      symRows.push({ draw: (y) => <text x={panelX + 1.2 * font} y={y} fontSize={small}
          textAnchor="middle" fill={INK}>ign.</text>,
        text: "ignition source declared in the room" });
    if (flagged.size > 0)
      symRows.push({ draw: sw(PAPER, { stroke: FLAG, strokeWidth: font / 5 }),
        text: "⚠ a room an engine finding names (see Findings)" });
  } else if (kind === "pressure") {
    const levels = [...shades.keys()].sort((a, c) => c - a);
    for (const p of levels) symRows.push({ draw: sw(shades.get(p)!), text: `${fmtP(p)} to outside` });
    symRows.push({ draw: (y) => <line x1={panelX} y1={y - 0.3 * small} x2={panelX + 2.4 * font}
        y2={y - 0.3 * small} stroke={INK} strokeWidth={font / 7} markerEnd={`url(#${uid}-cascade)`} />,
      text: "air through a door, from the higher to the lower pressure; the number is the step [Pa]; a door with no arrow joins two rooms at one pressure" });
  } else if (flowKind) {
    const look = FLOW_LOOK[flowKind];
    symRows.push({ draw: (y) => <line x1={panelX} y1={y - 0.3 * small} x2={panelX + 2.4 * font}
        y2={y - 0.3 * small} stroke={look.css} strokeWidth={font / 5}
        markerEnd={`url(#${uid}-flow-${flowKind})`} />,
      text: `${look.word} flow, door to door, in the direction of the arrows` });
    if (kindRoutes.some((r) => !r.connected))
      symRows.push({ draw: (y) => <line x1={panelX} y1={y - 0.3 * small} x2={panelX + 2.4 * font}
          y2={y - 0.3 * small} stroke={look.css} strokeWidth={font / 5}
          strokeDasharray={`${font / 1.6} ${font / 2.6}`} />,
        text: "dashed: a flow the engine found NOT connected; x marks the step" });
  }
  //  Common symbols.
  symRows.push({ draw: (y) => (<g>
      <line x1={panelX} y1={y - 0.3 * small} x2={panelX + 0.7 * font} y2={y - 0.3 * small}
        stroke={INK} strokeWidth={font / 5} />
      <line x1={panelX + 1.7 * font} y1={y - 0.3 * small} x2={panelX + 2.4 * font}
        y2={y - 0.3 * small} stroke={INK} strokeWidth={font / 5} />
      <line x1={panelX + 0.7 * font} y1={y - 0.8 * small} x2={panelX + 0.7 * font}
        y2={y + 0.2 * small} stroke={INK} strokeWidth={font / 12} />
      <line x1={panelX + 1.7 * font} y1={y - 0.8 * small} x2={panelX + 1.7 * font}
        y2={y + 0.2 * small} stroke={INK} strokeWidth={font / 12} /></g>),
    text: "door (gap in the wall; position drawn, see note 2)" });
  if (doors.some((d) => d.type !== "door" && d.placed === "overlap" && d.floors.includes(floor)))
    symRows.push({ draw: (y) => stairSymbol([panelX, y - 0.8 * small], [2.4 * font, 1.1 * small], "stair", font),
      text: "stair or lift (lift: crossed box)" });
  if (floorItems.length > 0)
    symRows.push({ draw: sw("#adb5bd"), text: "equipment, to scale (the engine's footprint)" });
  rows.push({ sym: null, lines: ["LEGEND"], head: true });
  for (const r of symRows) rows.push({ sym: null, lines: wrapText(r.text, legendChars) });
  const flowKeyRows: Row[] = [];
  if (flowKind) {
    flowKeyRows.push({ sym: null, lines: ["FLOWS"], head: true });
    for (const r of kindRoutes) {
      const from = r.path[0] ?? "", to = r.path[r.path.length - 1] ?? "";
      const lines = wrapText(`${r.name}: ${from} -> ${to}`, legendChars);
      const red = lines.length;
      if (!r.connected) {
        const why = r.breaks.map((x) => x.message).join("; ") || r.reason;
        lines.push(...wrapText(`NOT CONNECTED: ${why}`, legendChars));
      }
      flowKeyRows.push({ sym: null, lines, red });
    }
    if (kindRoutes.length === 0)
      flowKeyRows.push({ sym: null, lines: [`no ${flowKind} flow on this floor`] });
  }
  const rowH = (r: Row) => (r.lines.length * LINE_EM * small) + 0.5 * small;
  let ly = Y0 + 1.5 * font;
  const legendY: number[] = [];
  for (const r of rows) { legendY.push(ly); ly += rowH(r); }
  const keyY: number[] = [];
  ly += 0.5 * font;
  for (const r of flowKeyRows) { keyY.push(ly); ly += rowH(r); }

  //  The title block, under the legend.
  const tbRows: [string, string][] = [
    ["case", caseName || "(case not named)"],
    ["building", b.name || "(not named)"],
    ["floor", `${floor}${fl ? `, floor at ${Number(fl.elevation.toFixed(2))} m` : ""}`],
    ["plan", PLAN_SHEET_WORD[kind]],
    ["drawn by", "Choupo, from the engine's building block"],
    ["scale", "see the scale bar; north up"],
  ];
  const tbLineH = 1.5 * small;
  const tbValueChars = Math.floor((panelW - 6.5 * font) / (CHAR_EM * small));
  const tbWrapped = tbRows.map(([k, v]) => [k, wrapText(v, tbValueChars)] as const);
  const tbH = tbWrapped.reduce((s, [, v]) => s + v.length * tbLineH, 0) + 0.6 * font;
  const contentBottom = Math.max(Y1 + bandH + font, ly + font + tbH);
  const tbY = contentBottom - tbH;
  const sheetX0 = X0 - font, sheetY0 = Y0 - font;
  const sheetW = panelX + panelW + font - sheetX0;
  const sheetH = contentBottom + font - sheetY0;

  //  ---- room labels --------------------------------------------------------
  const labelOf = (r: BuildingRoom): string[][] => {
    const num = numbers.get(r.name) ?? "";
    const warn = kind === "zoning" && flagged.has(r.name) ? "⚠ " : "";
    const head = `${warn}${num} ${r.name}`;
    if (kind === "zoning") {
      const second = [r.grade,
        r.role !== "room" ? `${ROLE_ABBR[r.role] ?? r.role} ${r.regime}` : "",
        r.containment ? "cont." : "",
        r.atexZone !== undefined ? `Ex z${r.atexZone}` : "",
        r.ignition ? "ign." : ""].filter(Boolean).join(" ");
      return [[head, second], [`${warn}${num}`, second], [`${warn}${num}`]];
    }
    if (kind === "pressure") {
      const p = fmtP(r.pressureToOutside);
      return [[head, p], [num, p], [num, `${r.pressureToOutside > 0 ? "+" : ""}${Number(r.pressureToOutside.toFixed(1))}`], [num]];
    }
    return [[head], [num]];
  };

  const wall = font / 5;   // drawn wall line, ~0.2 m at this building's scale
  const tagR = 0.75 * small;

  return (
    <svg ref={svgRef} xmlns="http://www.w3.org/2000/svg"
      viewBox={`${sheetX0} ${sheetY0} ${sheetW} ${sheetH}`} role="img"
      aria-label={`Plan of floor ${floor} -- ${PLAN_SHEET_WORD[kind]}`}
      data-plan-kind={kind} data-plan-floor={floor}
      fontFamily="Helvetica, Arial, sans-serif"
      style={{ width: "100%", height: "auto", display: "block", background: PAPER }}>
      <defs>
        <pattern id={`${uid}-hatch`} patternUnits="userSpaceOnUse" width={font * 0.9}
          height={font * 0.9} patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={font * 0.9} stroke={BREAK} strokeWidth={font / 12}
            strokeOpacity={0.6} />
        </pattern>
        <marker id={`${uid}-cascade`} viewBox="0 0 10 10" refX={8} refY={5}
          markerWidth={4} markerHeight={4} orient="auto">
          <path d="M0,0 L10,5 L0,10 z" fill={INK} />
        </marker>
        {(["personnel", "material", "waste"] as FlowKind[]).map((k) => (
          <marker key={k} id={`${uid}-flow-${k}`} viewBox="0 0 10 10" refX={8} refY={5}
            markerWidth={4} markerHeight={4} orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill={FLOW_LOOK[k].css} />
          </marker>
        ))}
      </defs>
      <rect x={sheetX0} y={sheetY0} width={sheetW} height={sheetH} fill={PAPER} />
      <rect x={sheetX0 + font / 2} y={sheetY0 + font / 2} width={sheetW - font}
        height={sheetH - font} fill="none" stroke={INK} strokeWidth={font / 10} />

      {/* rooms: fill by plan type */}
      {rooms.map((r) => {
        const x = r.xMin, y = sy(r.yMax), w = r.xMax - r.xMin, h = r.yMax - r.yMin;
        const fill = kind === "zoning" ? GRADE_LOOK[r.grade].css
          : kind === "pressure" ? (shades.get(r.pressureToOutside) ?? PAPER) : PAPER;
        const opacity = kind === "zoning" ? 0.3 : 1;
        return (
          <g key={`fill-${r.name}`}>
            <rect x={x} y={y} width={w} height={h} fill={fill} fillOpacity={opacity} stroke="none" />
            {kind === "zoning" && r.atexZone !== undefined && (
              <rect x={x} y={y} width={w} height={h} fill={`url(#${uid}-hatch)`} stroke="none" />
            )}
          </g>
        );
      })}
      {/* equipment, to scale */}
      {floorItems.map((it) => {
        const x = it.x - it.dx / 2, y = sy(it.y + it.dy / 2);
        const circle = it.shape === "cylinder" && it.orientation === "vertical";
        return (
          <g key={`item-${it.id}`}>
            <title>{`${it.id} -- in room ${it.room}`}</title>
            {circle
              ? <circle cx={it.x} cy={sy(it.y)} r={it.dx / 2} fill="#adb5bd"
                  stroke={INK} strokeWidth={font / 14} />
              : <rect x={x} y={y} width={it.dx} height={it.dy} fill="#adb5bd"
                  stroke={INK} strokeWidth={font / 14} />}
            <text x={it.x} y={sy(it.y) + Math.min(it.dy, it.dx) / 2 + 0.85 * small * 0.75}
              fontSize={0.75 * small} textAnchor="middle" fill={INK}>{it.id}</text>
          </g>
        );
      })}
      {/* walls: every room's outline; airlocks dashed on the zoning plan */}
      {rooms.map((r) => {
        const x = r.xMin, y = sy(r.yMax), w = r.xMax - r.xMin, h = r.yMax - r.yMin;
        const flag = kind === "zoning" && flagged.has(r.name);
        return (
          <g key={`wall-${r.name}`}>
            <rect x={x} y={y} width={w} height={h} fill="none" stroke={INK} strokeWidth={wall} />
            {kind === "zoning" && r.role !== "room" && (
              <rect x={x + wall * 1.5} y={y + wall * 1.5} width={w - wall * 3} height={h - wall * 3}
                fill="none" stroke={INK} strokeWidth={wall / 2}
                strokeDasharray={`${font / 2.5} ${font / 4}`} />
            )}
            {kind === "zoning" && r.containment && (
              <rect x={x + wall * 3} y={y + wall * 3} width={w - wall * 6} height={h - wall * 6}
                fill="none" stroke={INK} strokeWidth={wall / 2} />
            )}
            {flag && (
              <rect x={x + wall} y={y + wall} width={w - 2 * wall} height={h - 2 * wall}
                fill="none" stroke={FLAG} strokeWidth={wall * 1.4} />
            )}
          </g>
        );
      })}
      {/* doors as gaps with jambs; stairs and lifts as symbols */}
      {floorDoors.map((d) => <DoorSymbol key={d.id} d={d} font={font} wall={wall} sy={sy} />)}

      {/* the pressure cascade across each door */}
      {kind === "pressure" && floorDoors.map((d) => {
        const a = cascadeArrow(d, b, 1.7 * font);
        if (!a) return null;
        const mx = (a.from[0] + a.to[0]) / 2, my = (a.from[1] + a.to[1]) / 2;
        const vertical = d.wall!.orient === "h";
        return (
          <g key={`cascade-${d.id}`}>
            <title>{`${a.high} -> ${a.low}: ${a.dP} Pa`}</title>
            <line x1={a.from[0]} y1={sy(a.from[1])} x2={a.to[0]} y2={sy(a.to[1])}
              stroke={INK} strokeWidth={font / 7} markerEnd={`url(#${uid}-cascade)`} />
            <text x={vertical ? mx + 0.45 * small : mx} y={vertical ? sy(my) + 0.35 * small : sy(my) - 0.45 * small}
              fontSize={0.85 * small} textAnchor={vertical ? "start" : "middle"} fill={INK}
              stroke={PAPER} strokeWidth={small / 6} paintOrder="stroke">{Number(a.dP.toFixed(1))}</text>
          </g>
        );
      })}

      {/* the flows of one kind, door to door */}
      {flowKind && kindRoutes.map((r) => (
        <g key={`route-${r.name}`} data-flow={r.name}>
          {r.legs.filter((l) => l.floor === floor).map((l, i) => (
            <polyline key={i} fill="none" stroke={FLOW_LOOK[r.kind].css}
              strokeWidth={font / 5} strokeLinejoin="round" strokeLinecap="round"
              strokeDasharray={!r.connected || l.broken ? `${font / 1.6} ${font / 2.6}` : undefined}
              points={l.points.map(P).join(" ")} />
          ))}
          {r.arrows.filter((a) => a.floor === floor).map((a, i) => {
            const s = font * 0.55;
            const ang = Math.atan2(-a.dir[1], a.dir[0]);
            const tip: Pt = [a.at[0], sy(a.at[1])];
            const pts = [[0, 0], [-1.6 * s, -0.7 * s], [-1.6 * s, 0.7 * s]].map(([u, v]) =>
              `${tip[0] + u! * Math.cos(ang) - v! * Math.sin(ang)},${tip[1] + u! * Math.sin(ang) + v! * Math.cos(ang)}`);
            return <polygon key={`a${i}`} points={pts.join(" ")} fill={FLOW_LOOK[r.kind].css} />;
          })}
          {r.breaks.filter((x) => x.floor === floor).map((x, i) => (
            <g key={`b${i}`}>
              <title>{x.message}</title>
              <text x={x.at[0]} y={sy(x.at[1]) + 0.4 * font} fontSize={1.3 * font}
                fontWeight={700} textAnchor="middle" fill={BREAK}>x</text>
            </g>
          ))}
          {r.floorChanges.filter((x) => x.floor === floor).map((x, i) => (
            <text key={`f${i}`} x={x.at[0]} y={sy(x.at[1]) - 1.9 * font} fontSize={0.62 * small}
              textAnchor="middle" fill={INK} stroke={PAPER} strokeWidth={small / 6}
              paintOrder="stroke">{`${r.tag} ${x.text}`}</text>
          ))}
          {r.end && r.end.floor === floor && (
            <g>
              <circle cx={r.end.at[0] + tagR * 1.2} cy={sy(r.end.at[1]) - tagR * 1.2} r={tagR}
                fill={PAPER} stroke={FLOW_LOOK[r.kind].css} strokeWidth={font / 10} />
              <text x={r.end.at[0] + tagR * 1.2} y={sy(r.end.at[1]) - tagR * 1.2 + 0.32 * small}
                fontSize={0.8 * small} textAnchor="middle" fill={INK}>{r.tag}</text>
            </g>
          )}
        </g>
      ))}

      {/* room labels: fit, or the room's number (the schedule resolves it) */}
      {rooms.map((r) => {
        const w = r.xMax - r.xMin, h = r.yMax - r.yMin;
        const fit = fitRoomLabel(w, h, labelOf(r), font, 0.7 * font);
        const top = sy(r.yMax);
        const y0 = (kind !== "zoning" && !holds.has(r.name)) || fit.mode === "tag"
          ? top + h / 2 - ((fit.lines.length - 1) * LINE_EM * fit.font) / 2 + 0.35 * fit.font
          : top + fit.font * 1.25;
        return (
          <g key={`label-${r.name}`} data-room-label={r.name} data-label-mode={fit.mode}>
            <title>{`${numbers.get(r.name)} ${r.name} -- ${r.grade}, ${fmtP(r.pressureToOutside)} to outside`}</title>
            {fit.lines.map((t, i) => (
              <text key={i} x={r.xMin + w / 2} y={y0 + i * LINE_EM * fit.font} fontSize={fit.font}
                fontWeight={i === 0 ? 600 : 400} textAnchor="middle" fill={INK}
                stroke={PAPER} strokeWidth={fit.font / 5}
                paintOrder="stroke">{t}</text>
            ))}
          </g>
        );
      })}

      {/* scale bar and north arrow, under the plan */}
      <ScaleBar x={X0 + font} y={bandTop + 1.4 * font} maxLen={0.3 * W} font={font} small={small} />
      <NorthArrow x={X0 + 0.42 * planW} y={bandTop + 0.2 * font} font={font} small={small} />
      {footLines.map((t, i) => (
        <text key={`fn${i}`} x={X0} y={bandTop + 3.6 * font + i * LINE_EM * small}
          fontSize={small * 0.9} fill={MUTED}>{t}</text>
      ))}

      {/* legend */}
      <line x1={panelX - 0.75 * font} y1={Y0} x2={panelX - 0.75 * font} y2={contentBottom}
        stroke={INK} strokeWidth={font / 12} />
      {rows.map((r, i) => {
        const y = legendY[i]!;
        const sym = i > 0 ? symRows[i - 1]!.draw(y) : null;
        return (
          <g key={`lg${i}`}>
            {sym}
            {r.lines.map((t, j) => (
              <text key={j} x={r.head ? panelX : panelX + 3 * font} y={y + j * LINE_EM * small}
                fontSize={r.head ? small * 1.05 : small} fontWeight={r.head ? 700 : 400}
                fill={INK}>{t}</text>
            ))}
          </g>
        );
      })}
      {flowKeyRows.map((r, i) => {
        const y = keyY[i]!;
        const route = i > 0 ? kindRoutes[i - 1] : undefined;
        return (
          <g key={`fk${i}`}>
            {route && (
              <g>
                <circle cx={panelX + tagR} cy={y - 0.32 * small} r={tagR} fill={PAPER}
                  stroke={FLOW_LOOK[route.kind].css} strokeWidth={font / 10} />
                <text x={panelX + tagR} y={y} fontSize={0.8 * small} textAnchor="middle"
                  fill={INK}>{route.tag}</text>
              </g>
            )}
            {r.lines.map((t, j) => (
              <text key={j} x={r.head ? panelX : panelX + 3 * font}
                y={y + j * LINE_EM * small}
                fontSize={r.head ? small * 1.05 : small} fontWeight={r.head ? 700 : 400}
                fill={r.red !== undefined && j >= r.red ? BREAK : INK}>{t}</text>
            ))}
          </g>
        );
      })}

      {/* title block */}
      <rect x={panelX} y={tbY} width={panelW} height={tbH} fill="none" stroke={INK}
        strokeWidth={font / 10} />
      {(() => {
        let y = tbY + 0.3 * font;
        return tbWrapped.map(([k, v], i) => {
          const top = y;
          y += v.length * tbLineH;
          return (
            <g key={`tb${i}`}>
              {i > 0 && <line x1={panelX} y1={top} x2={panelX + panelW} y2={top} stroke={INK}
                strokeWidth={font / 20} />}
              <text x={panelX + 0.5 * font} y={top + 1.05 * small} fontSize={0.85 * small}
                fill={MUTED}>{k}</text>
              {v.map((t, j) => (
                <text key={j} x={panelX + 6 * font} y={top + 1.05 * small + j * tbLineH}
                  fontSize={small} fontWeight={k === "plan" ? 700 : 400} fill={INK}>{t}</text>
              ))}
            </g>
          );
        });
      })()}
    </svg>
  );
}

function stairSymbol(at: Pt, size: Pt, type: string, font: number): JSX.Element {
  const [x, y] = at, [w, h] = size;
  const treads = 6;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={PAPER} stroke={INK} strokeWidth={font / 12} />
      {type === "lift"
        ? <path d={`M${x},${y} L${x + w},${y + h} M${x + w},${y} L${x},${y + h}`} stroke={INK}
            strokeWidth={font / 16} />
        : Array.from({ length: treads - 1 }, (_, i) => (
            <line key={i} x1={x + (w * (i + 1)) / treads} y1={y} x2={x + (w * (i + 1)) / treads}
              y2={y + h} stroke={INK} strokeWidth={font / 18} />
          ))}
    </g>
  );
}

function DoorSymbol({ d, font, wall, sy }: {
  d: PlanDoor; font: number; wall: number; sy: (y: number) => number;
}) {
  if (d.type !== "door") {
    if (!d.size) return null;
    const [w, h] = d.size;
    return (
      <g>
        <title>{`${d.type}: ${d.a} -- ${d.b}`}</title>
        {stairSymbol([d.at[0] - w / 2, sy(d.at[1]) - h / 2], [w, h], d.type, font)}
      </g>
    );
  }
  if (!d.wall) return null;
  const half = d.width / 2;
  const [x, y] = [d.at[0], sy(d.at[1])];
  const t = wall * 1.6;
  const v = d.wall.orient === "v";
  return (
    <g>
      <title>{`door: ${d.a} -- ${d.b}`}</title>
      {v
        ? <rect x={x - t} y={y - half} width={2 * t} height={2 * half} fill={PAPER} />
        : <rect x={x - half} y={y - t} width={2 * half} height={2 * t} fill={PAPER} />}
      {v
        ? (<g stroke={INK} strokeWidth={wall / 2}>
            <line x1={x - t} y1={y - half} x2={x + t} y2={y - half} />
            <line x1={x - t} y1={y + half} x2={x + t} y2={y + half} />
          </g>)
        : (<g stroke={INK} strokeWidth={wall / 2}>
            <line x1={x - half} y1={y - t} x2={x - half} y2={y + t} />
            <line x1={x + half} y1={y - t} x2={x + half} y2={y + t} />
          </g>)}
    </g>
  );
}

function ScaleBar({ x, y, maxLen, font, small }: {
  x: number; y: number; maxLen: number; font: number; small: number;
}) {
  const L = scaleBarLength(maxLen);
  const lead = L / Math.pow(10, Math.floor(Math.log10(L)));
  const n = lead === 2 ? 4 : 5;
  const h = 0.5 * font;
  return (
    <g data-scale-bar={L}>
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x={x + (L * i) / n} y={y} width={L / n} height={h}
          fill={i % 2 === 0 ? INK : PAPER} stroke={INK} strokeWidth={font / 20} />
      ))}
      <text x={x} y={y - 0.3 * font} fontSize={small} textAnchor="middle" fill={INK}>0</text>
      <text x={x + L} y={y - 0.3 * font} fontSize={small} textAnchor="middle" fill={INK}>{`${L} m`}</text>
    </g>
  );
}

function NorthArrow({ x, y, font, small }: { x: number; y: number; font: number; small: number }) {
  const s = 1.1 * font;
  return (
    <g data-north-arrow>
      <path d={`M${x},${y} L${x + 0.6 * s},${y + 2 * s} L${x},${y + 1.5 * s} L${x - 0.6 * s},${y + 2 * s} Z`}
        fill={INK} />
      <text x={x} y={y + 2 * s + 1.1 * small} fontSize={small} fontWeight={700}
        textAnchor="middle" fill={INK}>N</text>
    </g>
  );
}

/** The room schedule: one row per published room, the key to every number
 *  on every plan. */
export function RoomScheduleTable({ building }: { building: GmpBuilding }) {
  const rows = useMemo(() => roomSchedule(building), [building]);
  return (
    <ScrollArea>
      <Table striped withTableBorder fz="xs" data-room-schedule>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>no.</Table.Th><Table.Th>room</Table.Th><Table.Th>floor</Table.Th>
            <Table.Th>role</Table.Th><Table.Th>grade</Table.Th><Table.Th>regime</Table.Th>
            <Table.Th ta="right">p to outside [Pa]</Table.Th><Table.Th>declared [Pa]</Table.Th>
            <Table.Th ta="right">area [m²]</Table.Th>
            <Table.Th ta="right">height [m]</Table.Th><Table.Th ta="right">occupancy</Table.Th>
            <Table.Th>ATEX</Table.Th><Table.Th>equipment</Table.Th><Table.Th>notes</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r) => (
            <Table.Tr key={r.name}>
              <Table.Td>{r.number}</Table.Td><Table.Td>{r.name}</Table.Td>
              <Table.Td>{r.floor}</Table.Td><Table.Td>{r.role}</Table.Td>
              <Table.Td>{r.grade}</Table.Td><Table.Td>{r.regime}</Table.Td>
              <Table.Td ta="right">{r.pressureToOutside}</Table.Td><Table.Td>{r.declared}</Table.Td>
              <Table.Td ta="right">{Number(r.area.toFixed(2))}</Table.Td>
              <Table.Td ta="right">{r.height}</Table.Td>
              <Table.Td ta="right">{r.occupancy}</Table.Td>
              <Table.Td>{r.atexZone}</Table.Td><Table.Td>{r.equipment}</Table.Td>
              <Table.Td>{r.notes}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </ScrollArea>
  );
}

/** The plans of a building: a floor, a plan type, the sheet, a download. */
export function GmpPlanSheets({ building, items = [], caseName = "" }: {
  building: GmpBuilding; items?: PlanItemSource[]; caseName?: string;
}) {
  const kinds = useMemo(() => planSheetKinds(building), [building]);
  const floors = useMemo(() => [...building.floors].sort((a, c) => a.elevation - c.elevation),
    [building]);
  const [floor, setFloor] = useState(floors[0]?.name ?? "");
  const [kind, setKind] = useState<PlanSheetKind>("zoning");
  const svgRef = useRef<SVGSVGElement>(null);
  const shownFloor = floors.some((f) => f.name === floor) ? floor : floors[0]?.name ?? "";
  const shownKind = kinds.includes(kind) ? kind : "zoning";
  if (!shownFloor) return null;
  const stem = `${safe(leafOf(caseName) || "case")}_${safe(building.name || "building")}`;

  const download = () => {
    const el = svgRef.current;
    if (!el) return;
    const text = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(el)}\n`;
    downloadTextFile(text, `${stem}_${safe(shownFloor)}_${shownKind}-plan.svg`, "image/svg+xml");
  };

  return (
    <Box data-gmp-plans>
      <Group gap="sm" mb={6} wrap="wrap" align="center">
        <Text size="sm" fw={600}>Plans</Text>
        {floors.length > 1 && (
          <SegmentedControl size="xs" value={shownFloor} onChange={setFloor}
            data={floors.map((p) => ({ value: p.name, label: `${p.name} (${p.elevation} m)` }))} />
        )}
        <SegmentedControl size="xs" value={shownKind} onChange={(v) => setKind(v as PlanSheetKind)}
          data={kinds.map((k) => ({ value: k, label: PLAN_SHEET_WORD[k].replace(" plan", "") }))} />
        <Button size="compact-xs" variant="default" leftSection={<IconDownload size={13} />}
          title="Save this plan as an SVG file (a drawing to scale, to print or to put in a report)"
          onClick={download}>
          Download SVG
        </Button>
      </Group>
      <Box style={{ border: "1px solid var(--mantine-color-default-border)" }}>
        <PlanSheetSvg building={building} floor={shownFloor} kind={shownKind} items={items}
          caseName={caseName} svgRef={svgRef} />
      </Box>
      <Group justify="space-between" mt="sm" mb={4} align="center">
        <Text size="sm" fw={600}>Room schedule</Text>
        <Button size="compact-xs" variant="default" leftSection={<IconDownload size={13} />}
          title="Save the room schedule as a CSV file"
          onClick={() => downloadTextFile(scheduleCsv(roomSchedule(building)),
            `${stem}_roomSchedule.csv`, "text/csv")}>
          Download CSV
        </Button>
      </Group>
      <RoomScheduleTable building={building} />
    </Box>
  );
}
