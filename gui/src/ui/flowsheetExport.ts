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
  Choupo GUI -- export the coloured flowsheet as SVG or PNG (DEV.md 4c C114)

  The DOM half of the export: it READS what the canvas drew -- each wire's
  path and its computed stroke, width, dash and opacity (so a dimmed wire is
  dimmed in the figure, and a CSS colour variable arrives as the colour it
  resolved to), each node's position and measured size -- and hands that to
  the pure figure builder (case/flowsheetSvg.ts).  The PNG is the same SVG
  rasterised at twice its size; it contains no HTML, so no browser taints
  the canvas it is drawn on.
\*---------------------------------------------------------------------------*/

import type { ReactFlowInstance } from "@xyflow/react";

import type { ColourLegend } from "../case/colourLegend.js";
import { buildFlowsheetSvg, type SvgEdge, type SvgNode } from "../case/flowsheetSvg.js";
import { symbolOf } from "../case/unitFamily.js";
import { downloadTextFile } from "../case/saveCase.js";

export interface ExportRequest {
  format: "svg" | "png";
  wrapper: HTMLElement;
  rf: ReactFlowInstance;
  legends: ColourLegend[];
  title: string;
  subtitle: string;
  /** A unit's colour and second line, when units are coloured by a KPI. */
  unitInfo: (unitName: string) => { stroke: string; sub: string } | null;
  fileStem: string;
}

/** The opacity an element is actually painted with: its own times every
 *  ancestor's up to the canvas wrapper (the stale-run dimming sits on an
 *  ancestor). */
function effectiveOpacity(el: Element, stop: Element): number {
  let o = 1;
  for (let e: Element | null = el; e && e !== stop.parentElement; e = e.parentElement) {
    const v = parseFloat(getComputedStyle(e).opacity);
    if (Number.isFinite(v)) o *= v;
  }
  return o;
}

export function collectFigure(req: ExportRequest): { nodes: SvgNode[]; edges: SvgEdge[] } {
  const nodes: SvgNode[] = [];
  for (const n of req.rf.getNodes()) {
    if (n.hidden) continue;
    const internal = req.rf.getInternalNode(n.id);
    const pos = internal?.internals.positionAbsolute ?? n.position;
    const w = n.measured?.width ?? n.width ?? 0;
    const h = n.measured?.height ?? n.height ?? 0;
    if (!(w > 0 && h > 0)) continue;
    const d = n.data as {
      unit?: { name?: string; type?: string };
      name?: string; label?: string; phaseColor?: string;
    };
    const op = typeof n.style?.opacity === "number" ? n.style.opacity : undefined;
    if (n.type === "unitNode" && d.unit) {
      const sym = symbolOf(d.unit.type);
      const info = req.unitInfo(d.unit.name ?? "");
      nodes.push({ x: pos.x, y: pos.y, w, h, kind: "unit", label: d.unit.name ?? n.id,
                   stroke: info?.stroke ?? "#555", fill: "#ffffff", opacity: op,
                   symbolPath: sym?.path, symbolTag: sym?.tag, sub: info?.sub });
    } else {
      nodes.push({ x: pos.x, y: pos.y, w, h, kind: "terminal",
                   label: d.name ?? d.label ?? n.id.replace(/^stream:/, ""),
                   stroke: d.phaseColor ?? "#777", fill: "#f6f7f8", opacity: op });
    }
  }
  const edges: SvgEdge[] = [];
  for (const p of Array.from(req.wrapper.querySelectorAll("path.react-flow__edge-path"))) {
    const d = p.getAttribute("d");
    if (!d) continue;
    const cs = getComputedStyle(p);
    const dash = cs.strokeDasharray && cs.strokeDasharray !== "none" ? cs.strokeDasharray : undefined;
    edges.push({
      d,
      stroke: cs.stroke && cs.stroke !== "none" ? cs.stroke : "#888",
      width: parseFloat(cs.strokeWidth) || 1.5,
      dash,
      opacity: effectiveOpacity(p, req.wrapper),
      arrow: !!p.getAttribute("marker-end"),
    });
  }
  return { nodes, edges };
}

export async function exportFlowsheetFigure(req: ExportRequest): Promise<void> {
  const { nodes, edges } = collectFigure(req);
  const svg = buildFlowsheetSvg({ title: req.title, subtitle: req.subtitle,
                                  nodes, edges, legends: req.legends });
  if (req.format === "svg") {
    downloadTextFile(`<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`,
                     `${req.fileStem}_flowsheet.svg`, "image/svg+xml");
    return;
  }
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("svg")); img.src = url; });
    //  2x for a crisp figure, but never wider than 6000 px: a plant drawn
    //  5000 flow units wide would otherwise make a 10 000 px PNG.
    const scale = Math.max(0.5, Math.min(2, 6000 / Math.max(1, img.width)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(img.width * scale);
    canvas.height = Math.ceil(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    if (!blob) return;
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `${req.fileStem}_flowsheet.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(href), 0);
  } finally {
    URL.revokeObjectURL(url);
  }
}
