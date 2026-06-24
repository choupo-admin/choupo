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
  ABSOLUTE (global) stream numbering for a fractal case.

  A PFD number must be the SAME physical stream's identity everywhere it is
  seen -- in the parent plant AND when you drill into a sector (Vitor, 2026-06-
  15: "a numeração tem de ser absoluta para uma visão global").  Numbering each
  view 1..N independently resets the count inside every sector -- useless for a
  whole-plant reading.

  The identity problem is that ONE stream wears several names across levels:
    - inter-sector pipe:  CONCENTRATION/Magma  ==  DRYING/Magma
    - renamed boundary:   DRYING/ExhaustClean  ==  Stack (the plant's name)
    - exposed outlet:     DRYING/CY/ExhaustClean == DRYING/ExhaustClean
  All three are the same physical stream and must share ONE number.

  Solution: walk the whole tree from the ROOT, QUALIFY every connection
  endpoint with its composite path, and UNION the two ends of each connection.
  Because a child's bare boundary name `X` at path `P/CHILD` qualifies to the
  SAME string `P/CHILD/X` that the parent writes as `CHILD/X`, the union-find
  merges the cross-level aliases automatically.  Each equivalence class gets one
  number; any view resolves its LOCAL name (qualified by the view's path) to its
  class number.
\*---------------------------------------------------------------------------*/

import { parse, toJson } from "../dict/index.js";
import type { JsonDict } from "../dict/index.js";
import { rootCaseAndPath } from "../cases/tutorials.js";
import { streamNumbersForFlowsheet } from "./toGraph.js";

/** Qualify a connection endpoint name with its composite path:
 *  qual("", "Stack") = "Stack"; qual("DRYING", "ExhaustClean") =
 *  "DRYING/ExhaustClean"; qual("DRYING", "CY/ExhaustClean") =
 *  "DRYING/CY/ExhaustClean".  Descending into a child keeps the same string
 *  the parent uses, which is what unifies the aliases. */
function qual(path: string, name: string): string {
  return path ? `${path}/${name}` : name;
}

/** Minimal union-find keyed by qualified stream name, remembering first-seen
 *  order so the class numbers are deterministic. */
class UnionFind {
  private parent = new Map<string, string>();
  readonly order: string[] = [];
  find(x: string): string {
    if (!this.parent.has(x)) { this.parent.set(x, x); this.order.push(x); }
    let r = x;
    while (this.parent.get(r) !== r) r = this.parent.get(r)!;
    let c = x;
    while (this.parent.get(c) !== r) { const n = this.parent.get(c)!; this.parent.set(c, r); c = n; }
    return r;
  }
  union(a: string, b: string): void {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
  has(x: string): boolean { return this.parent.has(x); }
}

function parseFlowsheet(text: string, name: string): JsonDict | undefined {
  try { return toJson(parse(text, { sourceName: name })) as JsonDict; }
  catch { return undefined; }
}

/** Build the absolute numbering for a whole fractal case rooted at
 *  `rootFlowsheet` (its sub-sector flowsheetDicts come from `rootRawFiles`).
 *  Returns a resolver `(viewPath, localName) -> global number | undefined`.
 *  A flat (non-composite) root yields an empty union-find -> the resolver
 *  returns undefined for everything and the caller falls back to local. */
export function globalStreamNumbering(
  rootFlowsheet: JsonDict, rootRawFiles?: { [rel: string]: string },
): (path: string, name: string) => number | undefined {
  const uf = new UnionFind();
  const raw = rootRawFiles ?? {};

  const walk = (fs: JsonDict, path: string): void => {
    const children = fs["children"];
    if (!Array.isArray(children)) return;  // leaf / flat: its streams live in the parent's connections
    const conns = (fs["connections"] ?? []) as JsonDict[];
    for (const c of conns) {
      const from = String(c["from"] ?? "");
      const to = String(c["to"] ?? "");
      if (!from || !to) continue;
      const qf = qual(path, from), qt = qual(path, to);
      uf.find(qf); uf.find(qt);   // register (records order)
      uf.union(qf, qt);
    }
    for (const child of children as string[]) {
      const base = `${path ? path + "/" : ""}${child}`;
      // The tutorial registry stores a sub-flowsheet under `<child>/flowsheetDict`
      // (relative to the case root); some re-rooting paths add a `system/` segment.
      // Try BOTH -- with only the `system/` form the walk never descended into a
      // sector, so every unit->unit pipe inside a sector (50%+ of a fractal
      // plant's streams) registered nowhere and showed no PFD number.
      const text = raw[`${base}/flowsheetDict`] ?? raw[`${base}/system/flowsheetDict`];
      if (!text) continue;
      const childFs = parseFlowsheet(text, `${child}/flowsheetDict`);
      if (childFs && Array.isArray(childFs["children"])) walk(childFs, qual(path, child));
    }
  };
  walk(rootFlowsheet, "");

  // Number the classes in first-seen order (root feeds/streams first, then
  // sector internals in walk order) -- deterministic for a given plant.
  const classNum = new Map<string, number>();
  let n = 0;
  for (const name of uf.order) {
    const r = uf.find(name);
    if (!classNum.has(r)) classNum.set(r, ++n);
  }

  return (path: string, name: string): number | undefined => {
    // A name resolves to its class through several spaces:
    //   (1) a view's LOCAL name (canvas, slashes), qualified by the view path
    //       -> "DRYING/SD/Exhaust"
    //   (2) a FLATTENED result name with DOTS, RELATIVE to a drilled view
    //       ("BD.DryPowder") -> qualify by path AND convert dots
    //       -> "DRYING/BD/DryPowder"   (the Streams-table intermediates)
    //   (3) a FULLY-qualified dotted result name (root view, "A.B.C")
    //   (4) a bare root-level name (feeds / boundary outlets)
    const dotted = name.replace(/\./g, "/");
    for (const k of [qual(path, name), qual(path, dotted), dotted, name]) {
      if (uf.has(k)) return classNum.get(uf.find(k));
    }
    return undefined;
  };
}

/** The per-stream number resolver for the CURRENTLY OPEN view, keyed by the
 *  view's LOCAL stream name.  Uses the absolute (whole-plant) numbering when
 *  the view belongs to a registered fractal case; falls back to a per-view
 *  local 1..N otherwise (a flat tutorial, or an external/local case with no
 *  registry root).  Canvas badges AND the Streams `#` column share this so
 *  they always agree. */
export function streamNumberResolver(
  tutorialName: string,
  viewFlowsheet: JsonDict | undefined,
  viewRawFiles?: { [rel: string]: string },
): (name: string) => number | undefined {
  const rp = rootCaseAndPath(tutorialName);
  if (rp && rp.rootFiles.flowsheet && Array.isArray((rp.rootFiles.flowsheet as JsonDict)["children"])) {
    const g = globalStreamNumbering(rp.rootFiles.flowsheet, rp.rootFiles.rawFiles);
    return (name: string) => g(rp.subPath, name);
  }
  // Flat / non-fractal: per-view numbering (which IS global for one level).
  const local = viewFlowsheet
    ? streamNumbersForFlowsheet(viewFlowsheet, viewRawFiles)
    : new Map<string, number>();
  return (name: string) => local.get(name);
}
