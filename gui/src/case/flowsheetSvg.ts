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
  Choupo GUI -- the coloured flowsheet as a self-contained SVG (DEV.md 4c
  C114, item 6)

  A figure for a report: the wires as the canvas draws them (the SAME path
  geometry, read off the rendered edges, with the same colour, width, dash
  and opacity), the units and the stream terminals as labelled boxes with
  the unit's own symbol, and the legend block BELOW the drawing, built from
  the one legend model the canvas shows (case/colourLegend.ts).

  Why a drawing built from data and not a screenshot of the DOM: the canvas
  nodes are HTML, and an HTML-in-SVG (`foreignObject`) figure renders
  differently in every viewer a report is opened in, and taints the canvas
  a PNG is rasterised from in some browsers.  A plain SVG of paths, rects
  and text opens identically everywhere and rasterises without that risk.
  Pure: a string in, a string out, no DOM.
\*---------------------------------------------------------------------------*/

import type { ColourLegend } from "./colourLegend.js";

export interface SvgNode {
  x: number; y: number; w: number; h: number;
  kind: "unit" | "terminal";
  label: string;
  /** Border colour (a unit's KPI colour, a terminal's phase colour). */
  stroke: string;
  /** Fill colour of the box. */
  fill: string;
  opacity?: number;
  /** The unit's symbol (48x48 viewBox path) and its tag, when it has one. */
  symbolPath?: string;
  symbolTag?: string;
  /** A second line under the name (a KPI value). */
  sub?: string;
}

export interface SvgEdge {
  /** SVG path data, in the same flow coordinates as the nodes. */
  d: string;
  stroke: string;
  width: number;
  dash?: string;
  opacity?: number;
  arrow: boolean;
}

export interface FlowsheetSvgInput {
  title: string;
  subtitle?: string;
  nodes: SvgNode[];
  edges: SvgEdge[];
  legends: ColourLegend[];
}

/** Escape text for an SVG text node / attribute. */
export function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The coordinates a path visits (every number pair), for its bounding box.
 *  The canvas's paths are M/L/Q/C commands with absolute coordinates. */
export function pathPoints(d: string): { x: number; y: number }[] {
  const nums = (d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push({ x: nums[i]!, y: nums[i + 1]! });
  return out;
}

const PAD = 24;
const LEGEND_ROW = 64;
const FONT = "Inter, Helvetica, Arial, sans-serif";
const MONO = "JetBrains Mono, Menlo, Consolas, monospace";

function fmtN(v: number): string {
  return String(Math.round(v * 100) / 100);
}

/** One legend block, drawn at (x, y); returns its height. */
function legendSvg(lg: ColourLegend, x: number, y: number, idx: number, out: string[]): number {
  let cx = x;
  const head = `${lg.title}${lg.unit ? ` [${lg.unit}]` : ""}`
    + (lg.qualifiers.length ? ` — ${lg.qualifiers.join(", ")}` : "");
  out.push(`<text x="${fmtN(x)}" y="${fmtN(y + 12)}" font-family="${FONT}" font-size="12" font-weight="700" fill="#222">${xmlEscape(head)}</text>`);
  let rowY = y + 20;
  if (lg.stops.length > 1) {
    const gid = `lg${idx}`;
    const stops = lg.stops.map((c, i) =>
      `<stop offset="${fmtN((100 * i) / (lg.stops.length - 1))}%" stop-color="${c}"/>`).join("");
    out.push(`<defs><linearGradient id="${gid}" x1="0" x2="1" y1="0" y2="0">${stops}</linearGradient></defs>`);
    out.push(`<rect x="${fmtN(cx)}" y="${fmtN(rowY)}" width="200" height="10" rx="2" fill="url(#${gid})" stroke="#888" stroke-width="0.5"/>`);
    lg.ticks.forEach((t, i) => {
      const tx = lg.ticks.length === 1 ? cx + 100 : cx + (200 * i) / (lg.ticks.length - 1);
      const anchor = lg.ticks.length === 1 ? "middle" : i === 0 ? "start" : i === lg.ticks.length - 1 ? "end" : "middle";
      out.push(`<text x="${fmtN(tx)}" y="${fmtN(rowY + 22)}" text-anchor="${anchor}" font-family="${MONO}" font-size="10" fill="#333">${xmlEscape(t)}</text>`);
    });
    cx += 216;
  } else if (lg.stops.length === 1) {
    out.push(`<rect x="${fmtN(cx)}" y="${fmtN(rowY)}" width="18" height="10" rx="2" fill="${lg.stops[0]}"/>`);
    out.push(`<text x="${fmtN(cx + 24)}" y="${fmtN(rowY + 9)}" font-family="${MONO}" font-size="10" fill="#333">${xmlEscape(lg.ticks[0] ?? "")}</text>`);
    cx += 140;
  }
  for (const sw of lg.extras) {
    out.push(`<rect x="${fmtN(cx)}" y="${fmtN(rowY + 3)}" width="18" height="4" rx="1" fill="${sw.colour}"/>`);
    out.push(`<text x="${fmtN(cx + 24)}" y="${fmtN(rowY + 9)}" font-family="${MONO}" font-size="10" fill="#333">${xmlEscape(sw.label)}</text>`);
    cx += 34 + 6.2 * sw.label.length;
  }
  if (lg.notes.length) {
    out.push(`<text x="${fmtN(x)}" y="${fmtN(rowY + 38)}" font-family="${FONT}" font-size="10" fill="#555">${xmlEscape(lg.notes.join(" · "))}</text>`);
  }
  return LEGEND_ROW;
}

/** The scale the title and the legend are drawn at, for a drawing `width`
 *  flow units wide: 1 up to 1000, then growing with the width. */
export function legendScale(width: number): number {
  return Math.max(1, Math.min(8, width / 1000));
}

/** The whole figure. */
export function buildFlowsheetSvg(inp: FlowsheetSvgInput): string {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const grow = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  };
  for (const n of inp.nodes) { grow(n.x, n.y); grow(n.x + n.w, n.y + n.h); }
  for (const e of inp.edges) for (const p of pathPoints(e.d)) grow(p.x, p.y);
  if (!(x1 > x0)) { x0 = 0; y0 = 0; x1 = 400; y1 = 200; }
  //  THE LEGEND SCALES WITH THE DRAWING.  A plant is several thousand flow
  //  units wide, and a 10 px legend under it shrinks to nothing when the
  //  figure is fitted to a report page -- so the title and the legend are
  //  drawn at a scale `k` that keeps them about a ninth of the width.
  const k = legendScale(x1 - x0);
  const head = 40 * k;
  const legendH = inp.legends.length * LEGEND_ROW * k;
  const W = Math.max(x1 - x0 + 2 * PAD, 560);
  const H = y1 - y0 + 2 * PAD + head + legendH + PAD;
  const ox = PAD - x0, oy = PAD + head - y0;

  const body: string[] = [];
  // Arrowheads: one marker per colour actually used.
  const markers = new Map<string, string>();
  for (const e of inp.edges) {
    if (!e.arrow || markers.has(e.stroke)) continue;
    markers.set(e.stroke, `ah${markers.size}`);
  }
  const defs = [...markers.entries()].map(([c, id]) =>
    `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="6" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M0,0 L10,5 L0,10 z" fill="${c}"/></marker>`).join("");

  body.push(`<g transform="translate(${PAD},0) scale(${fmtN(k)})">`);
  body.push(`<text x="0" y="24" font-family="${FONT}" font-size="15" font-weight="700" fill="#111">${xmlEscape(inp.title)}</text>`);
  if (inp.subtitle)
    body.push(`<text x="0" y="38" font-family="${FONT}" font-size="10" fill="#555">${xmlEscape(inp.subtitle)}</text>`);
  body.push(`</g>`);

  body.push(`<g transform="translate(${fmtN(ox)},${fmtN(oy)})">`);
  for (const e of inp.edges) {
    const attrs = [
      `d="${xmlEscape(e.d)}"`, `fill="none"`, `stroke="${e.stroke}"`,
      `stroke-width="${fmtN(e.width)}"`,
      e.dash ? `stroke-dasharray="${xmlEscape(e.dash)}"` : "",
      e.opacity !== undefined && e.opacity < 1 ? `opacity="${fmtN(e.opacity)}"` : "",
      e.arrow ? `marker-end="url(#${markers.get(e.stroke)})"` : "",
    ].filter(Boolean).join(" ");
    body.push(`<path ${attrs}/>`);
  }
  for (const n of inp.nodes) {
    const op = n.opacity !== undefined && n.opacity < 1 ? ` opacity="${fmtN(n.opacity)}"` : "";
    body.push(`<g${op}>`);
    body.push(`<rect x="${fmtN(n.x)}" y="${fmtN(n.y)}" width="${fmtN(n.w)}" height="${fmtN(n.h)}" rx="${n.kind === "unit" ? 8 : 4}" fill="${n.fill}" stroke="${n.stroke}" stroke-width="${n.kind === "unit" ? 2 : 1.5}"/>`);
    let tx = n.x + 10;
    if (n.symbolPath) {
      const s = Math.min(36, n.h - 12);
      const sy = n.y + (n.h - s) / 2;
      body.push(`<g transform="translate(${fmtN(tx)},${fmtN(sy)}) scale(${fmtN(s / 48)})"><path d="${xmlEscape(n.symbolPath)}" fill="none" stroke="#222" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`
        + (n.symbolTag ? `<text x="24" y="27" text-anchor="middle" font-family="${FONT}" font-size="${n.symbolTag.length > 3 ? 8 : 10}" font-weight="700" fill="#222">${xmlEscape(n.symbolTag)}</text>` : "")
        + `</g>`);
      tx += s + 8;
    }
    const cy = n.y + n.h / 2 + (n.sub ? -2 : 4);
    body.push(`<text x="${fmtN(tx)}" y="${fmtN(cy)}" font-family="${FONT}" font-size="${n.kind === "unit" ? 13 : 11}" font-weight="${n.kind === "unit" ? 700 : 600}" fill="#111">${xmlEscape(n.label)}</text>`);
    if (n.sub)
      body.push(`<text x="${fmtN(tx)}" y="${fmtN(cy + 14)}" font-family="${MONO}" font-size="10" fill="#333">${xmlEscape(n.sub)}</text>`);
    body.push(`</g>`);
  }
  body.push(`</g>`);

  const ly = y1 - y0 + 2 * PAD + head;
  body.push(`<g transform="translate(${PAD},${fmtN(ly)}) scale(${fmtN(k)})">`);
  let ry = 0;
  inp.legends.forEach((lg, i) => { ry += legendSvg(lg, 0, ry, i, body); });
  body.push(`</g>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${fmtN(W)}" height="${fmtN(H)}" viewBox="0 0 ${fmtN(W)} ${fmtN(H)}">`
    + `<defs>${defs}</defs>`
    + `<rect x="0" y="0" width="${fmtN(W)}" height="${fmtN(H)}" fill="#ffffff"/>`
    + body.join("")
    + `</svg>`;
}
