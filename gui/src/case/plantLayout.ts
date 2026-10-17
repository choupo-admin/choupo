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
  THE PLANT LAYOUT -- the scene, with no drawing in it (DEV.md 4c C75).

  The engine reads `system/layoutDict`, checks it against the sized items and
  publishes `layout {}` on the result: every item's plan centre, base
  elevation and EXTENTS (its sizer's own diameter and length, or the box the
  case declared), the sector areas, the wind, the hazardous-area zones and the
  findings.  This module maps that block onto a 3D scene description, so the
  three.js component (ui/plotting/PlantLayout3D.tsx) draws and decides
  nothing, and the mapping can be tested without a WebGL context.

  ZERO LAYOUT HERE (gui-credo; "THE ENGINE DECIDES, THE GUI DRAWS").  No
  footprint, no position, no distance and no finding is computed: a solid is
  the engine's extents at the engine's position, and an item is flagged
  because the engine published a finding that names it.  What IS done here is
  coordinate bookkeeping: the plan's (x, y, z-up) becomes three.js's (X, Y-up,
  Z = -y), so plan north (+y) points into the screen; and the wind arrow's
  direction is the trigonometry of the angle the CASE declared.

  A KIND WITH NO DRAWING IS A LABELLED BOX (CLAUDE.md "the datasheet follows
  the equipment kind"): the engine already says which items are cylinders --
  the ones whose sizer published a diameter and a length -- and every other
  item is the box the case declared.  Nothing here guesses a nicer shape.

  GREYSCALE SURVIVES.  The three zones differ by OPACITY, by EDGE STYLE (solid
  / wire / dashed) and by a LABEL carrying the word, never by colour alone.
\*---------------------------------------------------------------------------*/

import type { PlantLayout, LayoutItem } from "../adapters/SolverAdapter.js";

export type Vec3 = [number, number, number];

/** One solid: a cylinder (along `axis`) or a box, in three.js coordinates. */
export interface SceneSolid {
  id: string;
  kind: string;
  sector: string;
  shape: "cylinder" | "box";
  /** three.js axis of a cylinder: "y" stands, "x"/"z" lie on the ground. */
  axis: "x" | "y" | "z";
  center: Vec3;
  /** Extents along three.js X, Y (up), Z. */
  size: Vec3;
  nonProcess: boolean;
  footprintFrom: "published" | "declared";
  ignition: boolean;
  release: boolean;
  /** The engine published a finding naming this item. */
  flagged: boolean;
  /** The text drawn beside it: the item id, its kind, and what the engine
   *  says about where its size came from. */
  label: string;
}

/** One hazardous-area envelope: a vertical cylinder. */
export interface SceneZone {
  itemId: string;
  zone: number;
  /** Centre of the cylinder (three.js), its radius and height. */
  center: Vec3;
  radius: number;
  height: number;
  /** Fill opacity, and the edge style -- the two non-colour channels. */
  opacity: number;
  edge: "solid" | "wire" | "dashed";
  label: string;
}

export interface SceneArea {
  sector: string;
  /** Ground rectangle in three.js X/Z. */
  x0: number; x1: number; z0: number; z1: number;
  label: string;
}

/** A line between two items the engine named in one finding. */
export interface SceneLink {
  findingId: string;
  kind: string;
  from: Vec3;
  to: Vec3;
  label: string;
}

export interface SceneWind {
  /** Arrow tail and head (three.js), the head pointing where the wind GOES. */
  tail: Vec3;
  head: Vec3;
  label: string;
}

export interface LayoutScene {
  solids: SceneSolid[];
  zones: SceneZone[];
  areas: SceneArea[];
  links: SceneLink[];
  wind: SceneWind | null;
  /** Bounding box of everything drawn, for the camera. */
  min: Vec3;
  max: Vec3;
}

/** Plan (x, y, z-up) to three.js (X, Y-up, Z). */
export function toThree(x: number, y: number, z: number): Vec3 {
  return [x, z, -y];
}

const FINDING_KINDS_THAT_FLAG = new Set(
  ["separation", "outsideArea", "ignitionInZone", "ignitionDownwind"]);

/** The item ids a finding names.  `b` of a zone finding is
 *  `<release item>#zone<n>`; of an area finding a SECTOR (not an item). */
function namedItems(kind: string, a: string, b: string): string[] {
  if (kind === "outsideArea") return [a];
  if (kind === "ignitionInZone") return [a, b.split("#zone")[0] ?? b];
  return [a, b];
}

function fmt(v: number): string {
  if (!Number.isFinite(v)) return "?";
  return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2);
}

function solidOf(it: LayoutItem, flagged: boolean): SceneSolid {
  //  three.js extents: X = plan dx, Y = dz (up), Z = plan dy.
  const size: Vec3 = [it.dx, it.dz, it.dy];
  const center = toThree(it.x, it.y, it.z + 0.5 * it.dz);
  const axis: "x" | "y" | "z" =
    it.orientation === "alongX" ? "x" : it.orientation === "alongY" ? "z" : "y";
  const what = it.nonProcess ? `${it.kind} (non-process)` : it.kind;
  const sizeWord = it.footprintFrom === "declared" ? "declared box" : "own sizing";
  return {
    id: it.id, kind: it.kind, sector: it.sector,
    shape: it.shape, axis, center, size,
    nonProcess: it.nonProcess, footprintFrom: it.footprintFrom,
    ignition: !!it.ignition, release: !!it.release, flagged,
    label: `${it.id} · ${what} · ${sizeWord}`
      + (flagged ? " · FINDING" : ""),
  };
}

const ZONE_STYLE: Record<number, { opacity: number; edge: SceneZone["edge"] }> = {
  0: { opacity: 0.45, edge: "solid" },
  1: { opacity: 0.25, edge: "wire" },
  2: { opacity: 0.12, edge: "dashed" },
};

/** The scene for one published layout block.  Returns null when there is
 *  nothing to draw -- an absent layout draws no frame at all. */
export function layoutScene(layout: PlantLayout | undefined): LayoutScene | null {
  if (!layout || layout.items.length === 0) return null;

  const flaggedIds = new Set<string>();
  for (const f of layout.findings)
    if (FINDING_KINDS_THAT_FLAG.has(f.kind))
      for (const id of namedItems(f.kind, f.a, f.b)) flaggedIds.add(id);

  const solids = layout.items.map((it) => solidOf(it, flaggedIds.has(it.id)));
  const byId = new Map(layout.items.map((it) => [it.id, it]));

  const zones: SceneZone[] = [];
  for (const it of layout.items)
    for (const z of it.release?.zones ?? []) {
      const st = ZONE_STYLE[z.zone] ?? ZONE_STYLE[2]!;
      zones.push({
        itemId: it.id, zone: z.zone,
        center: toThree(it.x, it.y, it.z + 0.5 * z.height),
        radius: z.radius, height: z.height,
        opacity: st.opacity, edge: st.edge,
        label: `zone ${z.zone} · ${it.id}`,
      });
    }

  const areas: SceneArea[] = layout.areas.map((a) => ({
    sector: a.sector,
    x0: a.xMin, x1: a.xMax, z0: -a.yMax, z1: -a.yMin,
    label: `sector ${a.sector}`,
  }));

  const links: SceneLink[] = [];
  for (const f of layout.findings) {
    if (f.kind !== "separation" && f.kind !== "ignitionDownwind") continue;
    const a = byId.get(f.a), b = byId.get(f.b);
    if (!a || !b) continue;
    const ha = a.z + 0.5 * a.dz, hb = b.z + 0.5 * b.dz;
    links.push({
      findingId: f.id, kind: f.kind,
      from: toThree(a.x, a.y, ha), to: toThree(b.x, b.y, hb),
      label: f.kind === "separation"
        ? `${fmt(f.value)} m < ${fmt(f.limit)} m`
        : `downwind, ${fmt(f.value)} m`,
    });
  }

  //  Bounds over solids, zones and areas.
  const min: Vec3 = [Infinity, 0, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  const grow = (p: Vec3) => {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k]!, p[k]!);
      max[k] = Math.max(max[k]!, p[k]!);
    }
  };
  for (const s of solids) {
    grow([s.center[0] - s.size[0] / 2, s.center[1] - s.size[1] / 2, s.center[2] - s.size[2] / 2]);
    grow([s.center[0] + s.size[0] / 2, s.center[1] + s.size[1] / 2, s.center[2] + s.size[2] / 2]);
  }
  for (const z of zones) {
    grow([z.center[0] - z.radius, z.center[1] - z.height / 2, z.center[2] - z.radius]);
    grow([z.center[0] + z.radius, z.center[1] + z.height / 2, z.center[2] + z.radius]);
  }
  for (const a of areas) { grow([a.x0, 0, a.z0]); grow([a.x1, 0, a.z1]); }

  //  The wind arrow: the CASE's angles, drawn upwind of the plant pointing
  //  across it.  `from` is a true bearing, `planNorth` the true bearing of
  //  the plan's +y; the plan bearing the wind blows TOWARD is
  //  from + 180 - planNorth, clockwise from +y.
  let wind: SceneWind | null = null;
  if (layout.wind) {
    const w = layout.wind;
    const toward = ((w.from + 180 - w.planNorth) * Math.PI) / 180;
    const ux = Math.sin(toward), uy = Math.cos(toward);   // plan unit vector
    const cx = (min[0] + max[0]) / 2, cy = -(min[2] + max[2]) / 2;
    const span = Math.max(max[0] - min[0], max[2] - min[2], 1);
    const tailR = 0.75 * span, headR = 0.45 * span;
    const top = Math.max(max[1], 1) + 2;
    wind = {
      tail: toThree(cx - ux * tailR, cy - uy * tailR, top),
      head: toThree(cx - ux * headR, cy - uy * headR, top),
      label: `wind from ${fmt(w.from)}° (true)`,
    };
    grow(wind.tail); grow(wind.head);
  }

  return { solids, zones, areas, links, wind, min, max };
}
