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
  EVERY FLOWSHEET VIEW OF THE TUTORIAL CORPUS, as the canvas receives it --
  each case's root view and every sector view below it, with the files
  toGraph reads and the case's own .cho layout where it ships one.  Shared
  by the corpus-wide layout measurement (flowsheetLayoutCorpus.test.ts,
  C59) and the zoom-range test (flowsheetViewport.test.ts, C102).
\*---------------------------------------------------------------------------*/

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { parse, toJson } from "../src/dict/index.js";
import type { JsonDict } from "../src/dict/index.js";
import type { FlowsheetGraph } from "../src/case/toGraph.js";
import type { XY } from "../src/case/flowsheetLayout.js";
import { resolveArrangement } from "../src/case/stubDocking.js";
import { layoutFromChoText } from "../src/state/layout.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const TUTORIALS = join(HERE, "..", "..", "tutorials");
const CATEGORIES = ["steady", "unsteady", "ctrl", "batch", "props", "plant"];

/** Every folder carrying a flowsheetDict, with the files toGraph reads,
 *  keyed relative to that folder (as the canvas receives them). */
export interface View { id: string; dir: string; flowsheet: JsonDict; raw: { [rel: string]: string }; cho?: string }

function filesUnder(dir: string, base: string, out: { [rel: string]: string }): void {
  for (const nm of readdirSync(dir)) {
    const p = join(dir, nm);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) {
      if (/^(converged|design|reports|iterations|constant|docs|ai|\d.*)$/.test(nm) && nm !== "0") continue;
      filesUnder(p, base, out);
    } else if (nm === "flowsheetDict" || nm === "solverDict" || nm.endsWith(".cho")) {
      out[relative(base, p)] = readFileSync(p, "utf8");
    }
  }
}

function flowsheetPath(dir: string): string | undefined {
  for (const p of [join(dir, "system", "flowsheetDict"), join(dir, "flowsheetDict")])
    if (existsSync(p)) return p;
  return undefined;
}

export function collectViews(): View[] {
  const views: View[] = [];
  const visit = (dir: string) => {
    const fp = flowsheetPath(dir);
    if (fp) {
      let fs: JsonDict | undefined;
      try { fs = toJson(parse(readFileSync(fp, "utf8"), { sourceName: fp })) as JsonDict; }
      catch { fs = undefined; }
      // A leaf (one unit in its own folder) is not a flowsheet a reader
      // arranges; only flat lists and composites are measured.
      if (fs && fs["type"] === undefined && (fs["units"] !== undefined || fs["sectors"] !== undefined)) {
        const raw: { [rel: string]: string } = {};
        filesUnder(dir, dir, raw);
        const marker = readdirSync(dir).find((n) => n.endsWith(".cho"));
        views.push({
          id: relative(TUTORIALS, dir), dir, flowsheet: fs, raw,
          cho: marker ? readFileSync(join(dir, marker), "utf8") : undefined,
        });
      }
    }
    for (const nm of readdirSync(dir)) {
      if (/^(system|constant|0|converged|design|reports|iterations|docs|ai|curation)$/.test(nm)) continue;
      const p = join(dir, nm);
      try { if (statSync(p).isDirectory()) visit(p); } catch { /* skip */ }
    }
  };
  for (const c of CATEGORIES) {
    const root = join(TUTORIALS, c);
    if (existsSync(root)) visit(root);
  }
  return views;
}

export function curatedPositions(graph: FlowsheetGraph, cho: string): Map<string, XY> | null {
  const saved = layoutFromChoText(cho);
  if (Object.keys(saved.nodes).length === 0) return null;
  const nb = new Map<string, string[]>();
  for (const e of graph.edges) {
    nb.set(e.source, [...(nb.get(e.source) ?? []), e.target]);
    nb.set(e.target, [...(nb.get(e.target) ?? []), e.source]);
  }
  // The SAME resolution the canvas draws (case/stubDocking.ts): saved units
  // and terminals exactly, every stub docked on its unit.
  return resolveArrangement(
    graph.nodes.map((n) => n.id), new Map(graph.nodes.map((n) => [n.id, n.position])), saved,
    (id) => { const s = graph.sizes.get(id) ?? { width: 190, height: 84 }; return { w: s.width, h: s.height }; },
    (id) => nb.get(id) ?? [],
  );
}
