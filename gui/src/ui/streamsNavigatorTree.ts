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
  streamsNavigatorTree -- the Streams workspace's Detail navigator, as data.
  Pure (no React), so a test can build it from a real case.

  Moved out of StreamsWorkspace.tsx (DEV.md 4c C110 G6) when the walk was
  found blind to a plant whose sectors live under `sectors/<name>/`
  (tutorials/plant/lithiumBrinePlant): it looked for each member only at
  `<name>/`, found nothing, and the navigator said "No flowsheet loaded."
  over a loaded, solved plant.  Members are now resolved by `memberFolder`
  (case/toGraph.ts), which mirrors the engine's resolveMemberBase.
\*---------------------------------------------------------------------------*/

import { compositeMembers, memberFolder, readEdges, topologyFeedNames } from "../case/toGraph.js";
import { parse, toJson, type JsonDict, type JsonValue } from "../dict/index.js";
import type { CaseFiles } from "../case/types.js";

// ---- Tree model ------------------------------------------------------------

export interface TreeStream {
  kind: "stream";
  /** Qualified name suitable for findRunStream() lookup, dot-separated. */
  qname: string;
  /** Display label (leaf port name). */
  label: string;
  /** Role hint for the icon. */
  role: "feed" | "product" | "internal";
}

export interface TreeGroup {
  kind: "group";
  /** Section label (sector name, unit name, "Feeds", "Products"). */
  label: string;
  children: TreeNode[];
}

export type TreeNode = TreeGroup | TreeStream;


export function leafName(qname: string): string {
  const i = Math.max(qname.lastIndexOf("."), qname.lastIndexOf("/"));
  return i < 0 ? qname : qname.slice(i + 1);
}

// ---- Tree builder ----------------------------------------------------------

/** The navigator's tree for a case.  Exported for the test
 *  (gui/tests/streamsNavigatorTree.test.ts). */
export function buildTree(caseFiles: CaseFiles): TreeNode[] {
  const out: TreeNode[] = [];
  const fs = caseFiles.flowsheet;
  if (!fs) return out;

  // Flat case: just a units list at top level.
  if (Array.isArray(fs["units"])) {
    addUnitsGroup(out, "Units", fs["units"] as JsonValue[], "");

    // Plus any explicit feed streams at the top level.
    const feeds = collectFeedNames(fs);
    if (feeds.length > 0) {
      out.unshift({
        kind: "group",
        label: "Feeds",
        children: feeds.map((f) => streamLeaf(f, "feed")),
      });
    }
    return out;
  }

  // Composite case: walk children recursively using rawFiles.  The plant's
  // feeds and products are read from its TOPOLOGY -- a legacy `boundary {}`
  // block, or the named-edge `connections {}` (an edge with no producer is a
  // feed, one with no consumer a product) -- since a plant written in the
  // named-edge grammar declares no `boundary` at all.
  const rawFiles = caseFiles.rawFiles ?? {};
  const inlets = topologyFeedNames(fs);
  const outlets = topologyProductNames(fs);

  if (inlets.length > 0) {
    out.push({
      kind: "group",
      label: "Feeds (plant)",
      children: inlets.map((v) => streamLeaf(String(v), "feed")),
    });
  }

  walkChildren(out, fs, "", "", 0, rawFiles);

  if (outlets.length > 0) {
    out.push({
      kind: "group",
      label: "Products (plant)",
      children: outlets.map((v) => streamLeaf(String(v), "product")),
    });
  }

  return out;
}

function walkChildren(
  out: TreeNode[],
  fs: JsonDict,
  prefix: string,
  dir: string,
  depth: number,
  rawFiles: Record<string, string>,
): void {
  //  `dir` is the folder of the flowsheet whose members these are ("" = the
  //  case root).  A member is resolved by the ONE rule the engine uses
  //  (`memberFolder`, mirroring resolveMemberBase): `unitOperations/<m>/`,
  //  `sectors/<m>/` or `<m>/`.  This walk used to look only at `<m>/`, so a
  //  plant whose sectors live under `sectors/` (lithiumBrinePlant,
  //  esterification2sector) drew an EMPTY navigator -- "No flowsheet
  //  loaded." over a loaded, solved plant (DEV.md 4c C110 G6).
  const children = compositeMembers(fs);
  for (const childName of children) {
    const childPrefix = prefix ? `${prefix}.${childName}` : childName;
    const found = memberFolder(rawFiles, childName, dir);
    const childFs = found ? parseFlowsheet(found.text, `${found.dir}/flowsheetDict`) : null;
    if (!found || !childFs) continue;

    if (compositeMembers(childFs).length > 0) {
      // Sector group: its own members, resolved under its own folder.
      const group: TreeGroup = { kind: "group", label: childName, children: [] };
      walkChildren(group.children, childFs, childPrefix, found.dir, depth + 1, rawFiles);
      out.push(group);
    } else if (Array.isArray(childFs["units"])) {
      // Sector whose units are INLINE blocks in its own flowsheetDict.
      const group: TreeGroup = { kind: "group", label: childName, children: [] };
      addUnitsGroupInto(group.children, childFs["units"] as JsonValue[], childPrefix);
      out.push(group);
    } else if (typeof childFs["type"] === "string") {
      // Leaf unit in its own folder: what it produces is its `outputs`
      // list, or the legacy `boundary { outlets }`.
      const outlets = unitOutletNames(childFs);
      const unitGroup: TreeGroup = {
        kind: "group",
        label: childName,
        children: outlets.map((port) => streamLeaf(`${childPrefix}.${port}`, "internal", port)),
      };
      out.push(unitGroup);
    }
  }
}

/** What a leaf unit's own folder says it produces. */
function unitOutletNames(fs: JsonDict): string[] {
  const asList = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x)) : [];
  const outputs = asList(fs["outputs"]);
  if (outputs.length > 0) return outputs;
  return asList(((fs["boundary"] ?? {}) as JsonDict)["outlets"]);
}

/** A plant's products, from its topology: a legacy `boundary { outlets }`
 *  or a named edge with a producer and no consumer. */
function topologyProductNames(fs: JsonDict): string[] {
  const out = new Set<string>();
  const b = ((fs["boundary"] ?? {}) as JsonDict)["outlets"];
  if (Array.isArray(b)) for (const v of b) out.add(String(v));
  for (const e of readEdges(fs)) if (e.from && !e.to && e.name) out.add(e.name);
  return [...out];
}

function parseFlowsheet(text: string, sourceName: string): JsonDict | null {
  try {
    return toJson(parse(text, { sourceName })) as JsonDict;
  } catch {
    return null;
  }
}

function addUnitsGroup(out: TreeNode[], label: string, units: JsonValue[], prefix: string) {
  const group: TreeGroup = { kind: "group", label, children: [] };
  addUnitsGroupInto(group.children, units, prefix);
  out.push(group);
}

function addUnitsGroupInto(into: TreeNode[], units: JsonValue[], prefix: string) {
  for (const uv of units) {
    if (!uv || typeof uv !== "object" || Array.isArray(uv)) continue;
    const u = uv as JsonDict;
    const name = String(u["name"]);
    const outputs = (u["outputs"] ?? []) as JsonValue[];
    const unitGroup: TreeGroup = {
      kind: "group",
      label: name,
      children: outputs.map((v) => {
        const port = String(v);
        return streamLeaf(prefix ? `${prefix}.${port}` : port, "internal", port);
      }),
    };
    into.push(unitGroup);
  }
}

function collectFeedNames(fs: JsonDict): string[] {
  // Stream role is inferred from TOPOLOGY (the stream-state architecture):
  // a feed is consumed by a unit and produced by none.
  return topologyFeedNames(fs);
}

function streamLeaf(qname: string, role: TreeStream["role"], label?: string): TreeStream {
  return {
    kind: "stream",
    qname,
    role,
    label: label ?? leafName(qname),
  };
}
