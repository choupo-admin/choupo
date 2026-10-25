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
  PropsDetails -- THE PANEL THAT FOLLOWS THE SELECTION (DEV.md 4c C151).

  ParaView's rule: the panels below the pipeline show the SELECTED object.
  Select an operation and this shows what it did (its verdict row), its
  numbers, and every figure it feeds; select a dataset and it shows where the
  file is, who reads it, and the figures it appears in; a model, its role, its
  theory and the ops that use it; a view, the figure itself and its sources.
  Every object carries the same two doors: its block in the dict that
  declares it (the Case tab, lines marked) and F1 to its theory.

  It computes nothing: the figures are ViewFigure over the engine's CSVs, the
  numbers the op's own diagnostics, the wiring the map's (case/propsMap.ts).
\*---------------------------------------------------------------------------*/

import { useState, type ReactNode } from "react";
import { Anchor, Badge, Box, Button, Group, ScrollArea, Stack, Table, Text } from "@mantine/core";
import { IconFileCode, IconHelp } from "@tabler/icons-react";

import type { OperationResult, RunResult } from "../adapters/SolverAdapter.js";
import type { PostItem } from "../case/postProcessing.js";
import {
  domIdOfView, neighbours, viewDomId, viewsOf,
  type MapNode, type MapTarget, type PropsMap,
} from "../case/propsMap.js";
import type { VerdictRow } from "../case/reviewScreen.js";
import { ViewFigure } from "./plotting/ViewFigure.js";

const KIND_WORD: Record<string, string> = {
  data: "DATA", model: "MODEL", operation: "OPERATION", view: "VIEW", unit: "PROCESS UNIT",
};

/** The figure items of the run, keyed by the DOM id a view member carries. */
export function itemsByDomId(items: PostItem[] | undefined): Map<string, PostItem> {
  const out = new Map<string, PostItem>();
  for (const it of items ?? []) out.set(viewDomId(it.origin, it.op, it.name), it);
  return out;
}

export function FigureGrid({ items, csvFiles, linkOf }: {
  items: PostItem[]; csvFiles: { [f: string]: string };
  /** the dict block a figure is declared in, when it has one */
  linkOf?: (it: PostItem) => MapTarget | undefined;
}) {
  const plots = items.filter((i) => i.kind === "plot");
  const tables = items.filter((i) => i.kind === "table");
  const cell = (it: PostItem) => {
    const link = linkOf?.(it);
    return (
      <Box key={`${it.origin}/${it.op}/${it.name}`} id={viewDomId(it.origin, it.op, it.name)}
        style={{ minWidth: 0, scrollMarginTop: 8 }}>
        <ViewFigure item={it} csv={csvFiles[it.file]} />
        {link && link.kind === "case" && <CaseLink t={link} small />}
      </Box>
    );
  };
  return (
    <Stack gap="md">
      {plots.length > 0 && (
        <Box style={{ display: "grid", gap: 12,
          gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 440px), 1fr))" }}>
          {plots.map(cell)}
        </Box>
      )}
      {tables.length > 0 && <Stack gap="md">{tables.map(cell)}</Stack>}
    </Stack>
  );
}

/** The door to a block in a dict file. */
export function CaseLink({ t, small, onOpen }: { t: MapTarget; small?: boolean; onOpen?: (t: MapTarget) => void }) {
  if (t.kind !== "case") return null;
  const where = t.line ? `${t.path}, lines ${t.line}-${t.endLine ?? t.line}` : t.path;
  return (
    <Anchor component="button" type="button" size={small ? "10px" : "xs"} data-case-link={t.path}
      onClick={() => (onOpen ? onOpen(t) : window.dispatchEvent(new CustomEvent("choupo:openCase", { detail: t })))}
      title={`Open ${where} in the Case tab`}>
      <Group gap={3} wrap="nowrap" component="span">
        <IconFileCode size={small ? 11 : 13} />
        <span>{small ? `declared in ${t.path}` : where}</span>
      </Group>
    </Anchor>
  );
}

function Header({ kind, title, detail, help, source, onActivate }: {
  kind: string; title: string; detail: string; help?: MapTarget; source?: MapTarget;
  onActivate: (t: MapTarget) => void;
}) {
  return (
    <Box>
      <Group gap={6} wrap="nowrap">
        <Text size="10px" fw={700} c="dimmed" style={{ letterSpacing: 0.5 }}>{KIND_WORD[kind] ?? kind}</Text>
        <Text size="sm" fw={700} ff="monospace" truncate>{title}</Text>
      </Group>
      {detail && <Text size="xs" c="dimmed" mt={2}>{detail}</Text>}
      <Group gap="md" mt={4}>
        {help && help.kind !== "case" && (
          <Button size="compact-xs" variant="light" leftSection={<IconHelp size={13} />}
            onClick={() => onActivate(help)} title={help.label}>
            {help.kind === "view" ? "Show the figure" : help.kind === "process" ? "Show it in Process (F1)" : "Theory (F1)"}
          </Button>
        )}
        {help && help.kind === "case" && (
          <Button size="compact-xs" variant="light" leftSection={<IconFileCode size={13} />}
            onClick={() => onActivate(help)}>Open the file (F1)</Button>
        )}
        {source && <CaseLink t={source} onOpen={onActivate} />}
      </Group>
    </Box>
  );
}

function NodeList({ title, ids, map, onSelect }: {
  title: string; ids: string[]; map: PropsMap; onSelect: (id: string) => void;
}) {
  const nodes = ids.map((i) => map.nodes.find((n) => n.id === i)).filter((n): n is MapNode => !!n);
  if (nodes.length === 0) return null;
  return (
    <Box>
      <Text size="10px" c="dimmed" tt="uppercase" fw={700} mb={2}>{title}</Text>
      <Group gap={4}>
        {nodes.map((n) => (
          <Button key={n.id} size="compact-xs" variant="default" onClick={() => onSelect(n.id)}
            title={n.member.detail}>
            <Text span size="xs" ff="monospace">{n.member.label}</Text>
          </Button>
        ))}
      </Group>
    </Box>
  );
}

function Diagnostics({ r }: { r: OperationResult }) {
  const [all, setAll] = useState(false);
  const keys = Object.keys(r.diagnostics);
  const head = (r.headline ?? []).filter((k) => k in r.diagnostics);
  const order = [...head, ...keys.filter((k) => !head.includes(k))];
  const shown = all ? order : order.slice(0, 16);
  if (order.length === 0) return null;
  return (
    <Box>
      <Text size="10px" c="dimmed" tt="uppercase" fw={700} mb={2}>
        Its numbers ({order.length}) -- the engine's own diagnostics
      </Text>
      <ScrollArea type="auto">
        <Table fz="xs" verticalSpacing={1} withTableBorder style={{ maxWidth: 560 }}>
          <Table.Tbody>
            {shown.map((k) => (
              <Table.Tr key={k}>
                <Table.Td ff="monospace" fw={head.includes(k) ? 700 : 400}>{k}</Table.Td>
                <Table.Td ff="monospace" ta="right">{Number(r.diagnostics[k]).toPrecision(6)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      {order.length > 16 && (
        <Button size="compact-xs" variant="subtle" onClick={() => setAll(!all)}>
          {all ? "show the first 16" : `show all ${order.length}`}
        </Button>
      )}
    </Box>
  );
}

/** The ids a selection covers: a member, a block's members, a type folder's
 *  ops. */
export function selectionIds(map: PropsMap, id: string, folderOps: (id: string) => string[]): string[] {
  if (id.startsWith("folder:type:")) return folderOps(id);
  const b = map.blocks.find((x) => x.id === id);
  if (b) return b.members.map((m) => m.id);
  return [id];
}

export function SelectionDetails({ id, map, result, rows, strip, onSelect, onActivate, folderOps }: {
  id: string;
  map: PropsMap;
  result: RunResult | undefined;
  rows: VerdictRow[];
  /** the verdict strip, drawn for the rows given */
  strip: (rows: VerdictRow[]) => ReactNode;
  onSelect: (id: string) => void;
  onActivate: (t: MapTarget) => void;
  folderOps: (id: string) => string[];
}) {
  const ids = selectionIds(map, id, folderOps);
  const nodes = ids.map((i) => map.nodes.find((n) => n.id === i)).filter((n): n is MapNode => !!n);
  const first = nodes[0];
  const items = itemsByDomId(result?.postProcessing?.items);
  const csv = result?.csvFiles ?? {};
  const ran = result?.status === "done";
  if (!first) return <Text size="sm" c="dimmed">Nothing of this case is called {id}.</Text>;

  const kind = first.kind;
  const many = nodes.length > 1;
  const block = map.blocks.find((b) => b.id === id);
  const title = block && many ? block.title : many ? `${nodes.length} × ${first.member.detail}` : first.member.label;
  const detail = block && many ? `${block.role} -- ${nodes.map((n) => n.member.label).join(", ")}`
    : many ? nodes.map((n) => n.member.label).join(", ") : first.member.detail;
  const opNames = nodes.filter((n) => n.id.startsWith("op:")).map((n) => n.member.label);
  const up = [...new Set(ids.flatMap((i) => neighbours(map, i).up))].filter((x) => !ids.includes(x));
  const down = [...new Set(ids.flatMap((i) => neighbours(map, i).down))].filter((x) => !ids.includes(x));
  const viewIds = viewsOf(map, ids);
  const figures = viewIds.map((v) => items.get(domIdOfView(v))).filter((x): x is PostItem => !!x);
  const results = (result?.operationResults ?? []).filter((r) => opNames.includes(r.name));

  return (
    <Stack gap="md" data-review="details" data-selected={id}>
      <Header kind={kind} title={title} detail={detail} onActivate={onActivate}
        help={first.member.target} source={many ? undefined : first.member.source} />
      {kind === "operation" && strip(rows.filter((r) => opNames.includes(r.name)))}
      {kind === "operation" && !many && results[0] && <Diagnostics r={results[0]} />}
      {kind === "operation" && !ran && <Text size="sm" c="dimmed">Run properties: its numbers and figures appear here.</Text>}
      <NodeList title={kind === "view" ? "drawn from" : "reads"} ids={up} map={map} onSelect={onSelect} />
      <NodeList title={kind === "view" ? "" : "feeds"} ids={down.filter((d) => !d.startsWith("view:"))} map={map} onSelect={onSelect} />
      <Box>
        <Text size="10px" c="dimmed" tt="uppercase" fw={700} mb={4}>
          {kind === "view" ? "The figure" : `Figures it ${kind === "operation" ? "feeds" : "appears in"} (${viewIds.length})`}
        </Text>
        {figures.length > 0
          ? <FigureGrid items={figures} csvFiles={csv} />
          : <Text size="sm" c="dimmed">{ran ? "No figure draws from it." : "Not run yet."}</Text>}
      </Box>
      {viewIds.length > figures.length && ran && (
        <Group gap={4}>
          <Badge size="xs" color="orange" variant="light" style={{ textTransform: "none" }}>
            {viewIds.length - figures.length} declared view(s) the run did not publish
          </Badge>
        </Group>
      )}
    </Stack>
  );
}
