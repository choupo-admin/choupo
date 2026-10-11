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
    This file is part of CHOUPO.

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
  A DOCKED STUB IS AN ANNOTATION OF ITS UNIT, NOT A FREE NODE (DEV.md 4c C59,
  the stub follow-up, 2026-10-11).

  A utility / duty / power stub says "this unit exchanges heat or work with
  the plant's utilities".  It has no place of its own on the drawing: it is
  where its unit is.  So its position is never stored ABSOLUTELY.  It is the
  owner's position plus an OFFSET, and the offset is

    - the one the reader CHOSE, when the reader dragged the stub himself
      (stored, as an offset, so the stub still follows its unit), else
    - the automatic offset toGraph gives it (above or below the box).

  Why this is a rule and not a detail: the canvas used to snapshot every node,
  stubs included, at absolute coordinates.  Where a unit had been placed by a
  curated `.cho` and its stub had not, the snapshot froze the stub at the
  AUTOMATIC position of a unit that was no longer there -- the owner saw a
  row of DUTY stubs across the top of the green-ammonia plant, a canvas away
  from the coolers they belong to, and treated as his own arrangement.

  Pure: no React, no storage.  The canvas (ui/FlowCanvas.tsx) and the layout
  corpus test both resolve an arrangement through `resolveArrangement`, so
  what the test measures is what the reader sees.
\*---------------------------------------------------------------------------*/

import { placeUnsavedNodes, type XY } from "./flowsheetLayout.js";

const STUB_PREFIX = "duty:";

/** The node id of a unit's docked stub: `duty:<unit>:<port>`.  The ONE place
 *  the id is minted (toGraph.ts calls it); `stubOwnerOf` reads it back. */
export function stubNodeId(unit: string, port: string): string {
  return `${STUB_PREFIX}${unit}:${port}`;
}

/** The owning unit's NODE id (`unit:<name>`) of a stub id, or undefined for
 *  any node that is not a docked stub.  The port is the text after the LAST
 *  colon, so a unit name that carries a colon still resolves. */
export function stubOwnerOf(id: string): string | undefined {
  if (!id.startsWith(STUB_PREFIX)) return undefined;
  const k = id.lastIndexOf(":");
  if (k <= STUB_PREFIX.length) return undefined;
  return `unit:${id.slice(STUB_PREFIX.length, k)}`;
}

export function isStubId(id: string): boolean {
  return stubOwnerOf(id) !== undefined;
}

/** Split a set of ABSOLUTE positions (a `.cho` written before stubs were
 *  relative) into the free nodes and each stub's offset from its owner.  A
 *  stub whose owner the set does not name is dropped: an offset needs both
 *  ends, and the automatic offset docks it. */
export function splitStubPositions(
  abs: { [id: string]: XY },
): { nodes: { [id: string]: XY }; stubs: { [id: string]: XY } } {
  const nodes: { [id: string]: XY } = {};
  const stubs: { [id: string]: XY } = {};
  for (const [id, p] of Object.entries(abs)) if (!isStubId(id)) nodes[id] = { x: p.x, y: p.y };
  for (const [id, p] of Object.entries(abs)) {
    const owner = stubOwnerOf(id);
    if (owner === undefined) continue;
    const o = nodes[owner];
    if (o) stubs[id] = { x: p.x - o.x, y: p.y - o.y };
  }
  return { nodes, stubs };
}

/** Every node's offset from its owner as the automatic layout drew it. */
export function automaticStubOffsets(
  ids: string[], auto: Map<string, XY>,
): Map<string, XY> {
  const out = new Map<string, XY>();
  for (const id of ids) {
    const owner = stubOwnerOf(id);
    if (owner === undefined) continue;
    const a = auto.get(id);
    const o = auto.get(owner);
    if (a && o) out.set(id, { x: a.x - o.x, y: a.y - o.y });
  }
  return out;
}

/** Re-dock every stub on its owner: owner position + (the reader's offset,
 *  else the automatic one).  Stubs named in `free` keep the position they
 *  carry (the reader is dragging them right now).  Returns a NEW map. */
export function dockStubs(
  positions: Map<string, XY>,
  stubIds: string[],
  autoOffsets: Map<string, XY>,
  userOffsets: { [id: string]: XY },
  free: ReadonlySet<string> = new Set(),
): Map<string, XY> {
  const out = new Map(positions);
  for (const id of stubIds) {
    if (free.has(id)) continue;
    const owner = stubOwnerOf(id);
    const op = owner !== undefined ? positions.get(owner) : undefined;
    const off = userOffsets[id] ?? autoOffsets.get(id);
    if (!op || !off) continue;
    out.set(id, { x: op.x + off.x, y: op.y + off.y });
  }
  return out;
}

/** WHERE EVERY NODE IS DRAWN, given the automatic layout and an arrangement:
 *  saved free nodes exactly where they were saved, unsaved free nodes beside a
 *  saved neighbour (`placeUnsavedNodes`), and every stub docked on its owner. */
export function resolveArrangement(
  ids: string[],
  auto: Map<string, XY>,
  arrangement: { nodes: { [id: string]: XY }; stubs?: { [id: string]: XY } },
  size: (id: string) => { w: number; h: number },
  neighbours: (id: string) => string[],
): Map<string, XY> {
  const free = ids.filter((id) => !isStubId(id));
  const stubs = ids.filter(isStubId);
  // A stub position that reached `nodes` anyway (a hand-edited marker) is
  // not a free node: never honour it absolutely.
  const saved: { [id: string]: XY } = {};
  for (const [id, p] of Object.entries(arrangement.nodes)) if (!isStubId(id)) saved[id] = p;
  const placed = placeUnsavedNodes(free, auto, saved, size,
    (id) => neighbours(id).filter((n) => !isStubId(n)));
  return dockStubs(placed, stubs, automaticStubOffsets(ids, auto), arrangement.stubs ?? {});
}
