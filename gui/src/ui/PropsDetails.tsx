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

  DEV.md 4c C154: an operation whose type declares how its numbers tabulate
  (`x-choupo.pointTable`) shows that SCIENTIFIC table first -- one row per
  point and ion, with the op's own units -- and its raw diagnostics after it,
  folded; a lone figure takes the pane's whole width (`auto-fit`, never an
  empty track beside it).

  DEV.md 4c C172 (item 6, content the engine published that no screen
  showed beside the fit): a FIT's details open with what it was given and
  what it was held to -- each dataset marked FIT or HELD OUT, the band
  declared before the fit, the held-out statistic in its own unit, the
  curation verdict WITH the identifiability beside it, and the fitted
  parameters as symbols with units (case/fitEvidence.ts); an operation's own
  typed panel (the Audit's, before C172) follows its numbers; the thermo
  package's details carry the readiness and the decision ledger; and a
  record or a proposal a run wrote is shown as the text it is.
\*---------------------------------------------------------------------------*/

import { useState, type ReactNode } from "react";
import { Anchor, Badge, Box, Button, Group, ScrollArea, Stack, Table, Text } from "@mantine/core";
import { IconFileCode, IconHelp } from "@tabler/icons-react";

import type { OperationResult, RunResult } from "../adapters/SolverAdapter.js";
import type { PostItem, PostReference } from "../case/postProcessing.js";
import { operationMapMeta } from "../case/operationSchemas.js";
import { pointTable, type PointTableDecl } from "../case/opPointTable.js";
import {
  domIdOfView, neighbours, viewDomId, viewsOf,
  type MapNode, type MapTarget, type PropsMap,
} from "../case/propsMap.js";
import { heldOutStatistic, inSampleStatistic, unitCell, type VerdictRow } from "../case/reviewScreen.js";
import { fitEvidence, fittedParameters, readable, ROLE_WORD } from "../case/fitEvidence.js";
import { valuesAt } from "../case/fileTraffic.js";
import type { JsonDict } from "../dict/index.js";
import { ViewFigure } from "./plotting/ViewFigure.js";
import { CURATION_COLOUR } from "./FitStatsPanel.js";

const KIND_WORD: Record<string, string> = {
  data: "DATA", model: "MODEL", operation: "OPERATION", view: "VIEW", unit: "PROCESS UNIT",
};

/** The figure items of the run, keyed by the DOM id a view member carries. */
export function itemsByDomId(items: PostItem[] | undefined): Map<string, PostItem> {
  const out = new Map<string, PostItem>();
  for (const it of items ?? []) out.set(viewDomId(it.origin, it.op, it.name), it);
  return out;
}

export function FigureGrid({ items, csvFiles, linkOf, references }: {
  items: PostItem[]; csvFiles: { [f: string]: string };
  /** the dict block a figure is declared in, when it has one */
  linkOf?: (it: PostItem) => MapTarget | undefined;
  /** the run's references, cited in an exported CSV */
  references?: readonly PostReference[];
}) {
  const plots = items.filter((i) => i.kind === "plot");
  const tables = items.filter((i) => i.kind === "table");
  const cell = (it: PostItem) => {
    const link = linkOf?.(it);
    return (
      <Box key={`${it.origin}/${it.op}/${it.name}`} id={viewDomId(it.origin, it.op, it.name)}
        style={{ minWidth: 0, scrollMarginTop: 8 }}>
        <ViewFigure item={it} csv={csvFiles[it.file]} references={references} />
        {link && link.kind === "case" && <CaseLink t={link} small />}
      </Box>
    );
  };
  return (
    <Stack gap="md">
      {plots.length > 0 && (
        <Box style={{ display: "grid", gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 440px), 1fr))" }}>
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
    <Anchor component="button" type="button" size={small ? "11px" : "xs"} data-case-link={t.path}
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
        <Text size="11px" fw={700} c="dimmed" style={{ letterSpacing: 0.5 }}>{KIND_WORD[kind] ?? kind}</Text>
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
      <Text size="11px" c="dimmed" tt="uppercase" fw={700} mb={2}>{title}</Text>
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

/** The op's numbers as its type tabulates them (case/opPointTable.ts): the
 *  first table, then any further ones the type declares. */
export function PointTableViews({ r }: { r: OperationResult }) {
  const meta = operationMapMeta(r.type);
  const decls = [meta?.pointTable, ...(meta?.pointTables ?? [])];
  return <>{decls.map((decl, i) => <PointTableView key={i} decl={decl} r={r} />)}</>;
}

function PointTableView({ decl, r }: { decl: PointTableDecl | undefined; r: OperationResult }) {
  const t = pointTable(decl, r);
  if (!t) return null;
  const fmt = (v: number | null) => (v === null ? "" : Number(v.toPrecision(6)).toString());
  const head = (c: { label: string; unit: string }) => (c.unit && c.unit !== "-" ? `${c.label} [${c.unit}]` : c.label);
  return (
    <Box data-review="point-table">
      <Text size="11px" c="dimmed" tt="uppercase" fw={700} mb={2}>{t.title}</Text>
      {t.definitions && <Text size="xs" c="dimmed" mb={4}>{t.definitions}</Text>}
      <ScrollArea type="auto">
        <Table fz="xs" verticalSpacing={1} withTableBorder withColumnBorders striped style={{ minWidth: 560 }}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>point</Table.Th>
              {t.columns.slice(0, t.nPerPoint).map((c, i) =>
                <Table.Th key={`p${i}`} style={{ whiteSpace: "nowrap" }}>{head(c)}</Table.Th>)}
              {t.perIon && <Table.Th>ion</Table.Th>}
              {t.columns.slice(t.nPerPoint).map((c, i) =>
                <Table.Th key={`i${i}`} style={{ whiteSpace: "nowrap" }}>{head(c)}</Table.Th>)}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {t.rows.map((row) => (
              <Table.Tr key={`${row.point}:${row.ion}`}>
                <Table.Td ff="monospace">{row.point}</Table.Td>
                {row.cells.slice(0, t.nPerPoint).map((v, i) =>
                  <Table.Td key={`p${i}`} ff="monospace" ta="right">{fmt(v)}</Table.Td>)}
                {t.perIon && <Table.Td ff="monospace" fw={600}>{row.ion}</Table.Td>}
                {row.cells.slice(t.nPerPoint).map((v, i) =>
                  <Table.Td key={`i${i}`} ff="monospace" ta="right">{fmt(v)}</Table.Td>)}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Box>
  );
}

export function Diagnostics({ r, folded }: { r: OperationResult; folded?: boolean }) {
  const [all, setAll] = useState(false);
  const keys = Object.keys(r.diagnostics);
  const head = (r.headline ?? []).filter((k) => k in r.diagnostics);
  const order = [...head, ...keys.filter((k) => !head.includes(k))];
  const shown = all ? order : order.slice(0, 16);
  if (order.length === 0) return null;
  const body = (
    <>
      <ScrollArea type="auto">
        <Table fz="xs" verticalSpacing={1} withTableBorder style={{ maxWidth: 640 }}>
          <Table.Tbody>
            {shown.map((k) => (
              <Table.Tr key={k}>
                <Table.Td ff="monospace" fw={head.includes(k) ? 700 : 400}>{k}</Table.Td>
                <Table.Td ff="monospace" ta="right">{Number(r.diagnostics[k]).toPrecision(6)}</Table.Td>
                {(() => {
                  const u = unitCell(r, k);
                  return u.published
                    ? <Table.Td ff="monospace" c="dimmed" data-unit={k}>{u.text}</Table.Td>
                    : <Table.Td c="dimmed" fs="italic" fz="11px" data-unit={k} data-unit-missing=""
                        title="The engine published no unit for this number.">{u.text}</Table.Td>;
                })()}
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
    </>
  );
  const title = `Its numbers (${order.length}) -- the engine's own diagnostics, as it keys them`;
  if (folded)
    return (
      <details data-review="raw-diagnostics">
        <summary style={{ cursor: "pointer" }}>
          <Text span size="11px" c="dimmed" tt="uppercase" fw={700}>{title}</Text>
        </summary>
        <Box mt={4}>{body}</Box>
      </details>
    );
  return (
    <Box>
      <Text size="11px" c="dimmed" tt="uppercase" fw={700} mb={2}>{title}</Text>
      {body}
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

/* The parts of a fit's details, each drawn where the Workflow reads it
 * (DEV.md 4c C172 slice 3): what the fit was GIVEN and what it was HELD TO
 * in the inspector's "what it reads", what it FOUND in the step's results,
 * its VERDICT with the identifiability beside it in the inspector's last
 * section.  FitEvidence composes all four, as slice 1 drew them. */

/** The curation verdict and, BESIDE it, the identifiability -- a different
 *  question (are the fitted parameters separately determined?), never merged
 *  into it (DEV.md 4c C172 item 6). */
export function FitVerdict({ r }: { r: OperationResult | undefined }) {
  if (!r) return null;
  const cur = r.curation ?? {};
  const ident = r.diagnostics?.["identifiable"];
  return (
    <Group gap={6} wrap="wrap" data-fit-verdict="">
      <Text size="11px" c="dimmed" tt="uppercase" fw={700}>verdict</Text>
      {cur["verdict"]
        ? <Badge size="md" color={CURATION_COLOUR[cur["verdict"]] ?? "gray"} variant="filled" style={{ textTransform: "none" }}
            title="Did the model survive evidence it never saw, inside a band declared before the fit?">{cur["verdict"]}</Badge>
        : <Text size="xs" c="dimmed">none published</Text>}
      {typeof ident === "number" && (
        <Badge size="md" color={ident > 0.5 ? "gray" : "red"} variant="outline" style={{ textTransform: "none" }}
          data-identifiable={ident > 0.5 ? "1" : "0"}
          title="A different question: are the fitted parameters separately determined by the data?">
          {ident > 0.5 ? "identifiable" : "not identifiable"}
        </Badge>
      )}
    </Group>
  );
}

/** What the fit found: the parameters as symbols with units. */
export function FittedParametersBlock({ op, r }: { op: JsonDict | null; r: OperationResult | undefined }) {
  const params = fittedParameters(op, r);
  if (params.length === 0) return null;
  return (
    <Box data-review="fitted-parameters">
      <Text size="11px" c="dimmed" tt="uppercase" fw={700} mb={2}>What it found -- the fitted parameters</Text>
      <Stack gap={1}>
        {params.map((p) => {
          const v = readable(p.value, p.unit, p.ci95);
          return (
            <Text key={p.index} size="sm" ff="monospace" data-fitted-parameter={p.path} title={p.path}>
              <b>{p.symbol}</b>{p.qualifier ? <Text span c="dimmed" size="xs"> ({p.qualifier})</Text> : null}
              {" = "}{v.value}{v.ci ? ` ± ${v.ci}` : ""}{" "}
              {v.unit ? v.unit : <Text span c="dimmed" size="xs" fs="italic">unit not published</Text>}
              {p.title && <Text span c="dimmed" size="xs" ff="body">  {p.title}</Text>}
            </Text>
          );
        })}
      </Stack>
      {params.some((p) => p.ci95 !== null) && (
        <Text size="xs" c="dimmed">± is the half-width of the 95 % confidence interval the fit publishes.</Text>
      )}
    </Box>
  );
}

/** What the fit was given: each dataset FIT or HELD OUT. */
export function EvidenceTable({ op, onDataset, compact }: {
  op: JsonDict | null; onDataset?: (dataset: string) => void;
  /** the inspector's form: one line per dataset (its file name and its
   *  role), the two roles explained once below */
  compact?: boolean;
}) {
  const ev = fitEvidence(op);
  if (ev.length === 0) return null;
  if (compact)
    return (
      <Box data-review="evidence">
        {ev.map((e) => (
          <Group key={e.dataset} gap={6} wrap="nowrap" data-evidence-role={e.role} title={e.dataset}>
            <Badge size="md" variant={e.role === "fit" ? "light" : "outline"} color={e.role === "fit" ? "gray" : "cyan"}
              style={{ textTransform: "none", overflow: "visible", flex: "0 0 auto", minWidth: 86 }}>{ROLE_WORD[e.role]}</Badge>
            {onDataset
              ? <Anchor component="button" type="button" size="xs" ff="monospace" truncate onClick={() => onDataset(e.dataset)}>
                  {e.dataset.split("/").pop()}</Anchor>
              : <Text size="xs" ff="monospace" truncate>{e.dataset.split("/").pop()}</Text>}
          </Group>
        ))}
        <Text size="11px" c="dimmed" mt={2}>
          FIT: the parameters were fitted to it.  HELD OUT: never seen by the fit -- what is drawn for it is a prediction.
        </Text>
      </Box>
    );
  return (
    <Box>
      <Text size="11px" c="dimmed" tt="uppercase" fw={700} mb={2}>
        What it was given -- the evidence, partitioned before the fit
      </Text>
      <Table fz="xs" verticalSpacing={1} withTableBorder style={{ maxWidth: 640 }} data-review="evidence">
        <Table.Tbody>
          {ev.map((e) => (
            <Table.Tr key={e.dataset} data-evidence-role={e.role}>
              <Table.Td ff="monospace" style={{ wordBreak: "break-all" }}>
                {onDataset
                  ? <Anchor component="button" type="button" size="xs" ff="monospace" onClick={() => onDataset(e.dataset)}>{e.dataset}</Anchor>
                  : e.dataset}
              </Table.Td>
              <Table.Td style={{ whiteSpace: "nowrap", width: 90 }}>
                <Badge size="md" variant={e.role === "fit" ? "light" : "outline"}
                  color={e.role === "fit" ? "gray" : "cyan"} style={{ textTransform: "none", overflow: "visible" }}>
                  {ROLE_WORD[e.role]}
                </Badge>
              </Table.Td>
              <Table.Td c="dimmed">{e.role === "fit" ? "the parameters were fitted to it"
                : "never seen by the fit: what is drawn for it is a PREDICTION"}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Box>
  );
}

/** What the fit was held to (the band declared before it) and what it did
 *  on the held-out evidence.  Before a run, the band the dict DECLARES. */
export function BandBlock({ op, r }: { op: JsonDict | null; r: OperationResult | undefined }) {
  const cur = r?.curation ?? {};
  const held = r ? heldOutStatistic(r) : null;
  const inS = r ? inSampleStatistic(r) : null;
  const declared = op ? valuesAt(op, "acceptance.maxAAD").filter((v) => v !== "(inline)")[0] : undefined;
  const unitOf = (u: string, published: boolean) => (u === "%" ? " %" : published ? ` ${u}` : "");
  if (!(cur["acceptanceMaxAADPct"] || held || inS || declared)) return null;
  return (
    <Box data-review="band">
      <Text size="11px" c="dimmed" tt="uppercase" fw={700} mb={2}>What it was held to, and what it did</Text>
      {cur["acceptanceMaxAADPct"] ? (
        <Text size="xs">band: {cur["acceptanceMaxAADPct"] === "none declared before the fit"
          ? "none declared before the fit"
          //  the band in the word it was DECLARED in, as the engine publishes
          //  it (C172): `points` for a membrane fit, never a guessed unit
          : `AAD ≤ ${cur["acceptanceMaxAADPct"]}${cur["acceptanceUnit"] ? ` ${cur["acceptanceUnit"]}` : ""}, declared before the fit`}
          {cur["acceptanceOrigin"] ? <Text span c="dimmed"> -- {cur["acceptanceOrigin"]}</Text> : null}</Text>
      ) : declared ? (
        <Text size="xs">band: AAD ≤ {declared}, declared before the fit (acceptance.maxAAD)</Text>
      ) : null}
      {held && (
        <Text size="xs" data-held-out-statistic={held.key}>held out: <b>{Number(held.value.toPrecision(4))}{unitOf(held.unit, held.published)}</b>
          <Text span c="dimmed"> ({held.key}{held.published ? "" : ", no unit published"})</Text></Text>
      )}
      {inS && (
        <Text size="xs">in sample: {Number(inS.value.toPrecision(4))}{unitOf(inS.unit, inS.published)}
          <Text span c="dimmed"> ({inS.key})</Text></Text>
      )}
      {cur["heldOutStatistic"] && <Text size="xs" c="dimmed">the statistic: {cur["heldOutStatistic"]}</Text>}
      {cur["partitionFingerprint"] && (
        <Text size="xs" c="dimmed">evidence partition frozen before the fit · fingerprint {cur["partitionFingerprint"]}</Text>
      )}
    </Box>
  );
}

/** A FIT, as a reader judges it: what it saw, what it was held to, what it
 *  found (DEV.md 4c C172 item 6; case/fitEvidence.ts). */
export function FitEvidence({ op, r }: { op: JsonDict | null; r: OperationResult | undefined }) {
  return (
    <Stack gap="xs" data-review="fit-evidence">
      <FitVerdict r={r} />
      <FittedParametersBlock op={op} r={r} />
      <EvidenceTable op={op} />
      <BandBlock op={op} r={r} />
    </Stack>
  );
}

/** A file a run wrote, shown as the text it is. */
export function WrittenFile({ path, text, why }: { path: string; text: string; why: string }) {
  return (
    <Box data-review="written-file" data-written={path}>
      <Text size="11px" c="dimmed" tt="uppercase" fw={700} mb={2}>{why}</Text>
      <Text size="xs" ff="monospace" mb={4}>{path}</Text>
      <ScrollArea h={320} type="auto"
        style={{ border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))", borderRadius: 6 }}>
        <Text component="pre" size="xs" ff="monospace" p="xs" m={0} style={{ whiteSpace: "pre" }}>{text}</Text>
      </ScrollArea>
    </Box>
  );
}

export function SelectionDetails({ id, map, result, rows, strip, onSelect, onActivate, folderOps,
  opPanel, propsDict, packageDetails, caseFiles }: {
  id: string;
  map: PropsMap;
  result: RunResult | undefined;
  rows: VerdictRow[];
  /** the verdict strip, drawn for the rows given */
  strip: (rows: VerdictRow[]) => ReactNode;
  onSelect: (id: string) => void;
  onActivate: (t: MapTarget) => void;
  folderOps: (id: string) => string[];
  /** an operation's own typed panel (DEV.md 4c C172) */
  opPanel?: (op: string) => ReactNode | undefined;
  /** the case's propsDict: a fit's declared evidence and parameters */
  propsDict?: JsonDict | null;
  /** what the THERMO PACKAGE's details carry: its readiness and the ledger */
  packageDetails?: ReactNode;
  /** the case's files, for a record a run wrote into it */
  caseFiles?: Record<string, string>;
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
  const opDict = !many && kind === "operation"
    ? (Array.isArray(propsDict?.["operations"]) ? propsDict!["operations"] as JsonDict[] : [])
        .find((o) => o && typeof o === "object" && !Array.isArray(o) && o["name"] === first.member.label) ?? null
    : null;
  const isFit = !many && kind === "operation" && first.member.detail === "fitParameters";
  const panel = !many && kind === "operation" ? opPanel?.(first.member.label) : undefined;
  //  a record or a proposal the run wrote, by the path its node names
  const writtenPath = kind === "view" && first.role === "record" ? (first.member.detail.split(": ").pop() ?? "")
    : kind === "view" && first.role === "proposal" ? first.member.label : "";
  const proposalText = writtenPath ? result?.proposals?.[writtenPath] : undefined;
  const recordText = writtenPath && first.role === "record"
    ? (result?.caseWrites?.[writtenPath] ?? caseFiles?.[writtenPath]) : undefined;

  return (
    <Stack gap="md" data-review="details" data-selected={id}>
      <Header kind={kind} title={title} detail={detail} onActivate={onActivate}
        help={first.member.target} source={many ? undefined : first.member.source} />
      {kind === "operation" && strip(rows.filter((r) => opNames.includes(r.name)))}
      {isFit && <FitEvidence op={opDict} r={results[0]} />}
      {kind === "operation" && !many && results[0] && <PointTableViews r={results[0]} />}
      {kind === "operation" && !many && results[0] && (
        <Diagnostics r={results[0]} folded={!!operationMapMeta(results[0].type)?.pointTable} />
      )}
      {kind === "operation" && !ran && <Text size="sm" c="dimmed">Run the workflow: its numbers and figures appear here.</Text>}
      {panel && ran && (
        <Box data-review="op-panel">
          <Text size="11px" c="dimmed" tt="uppercase" fw={700} mb={4}>Its own panel</Text>
          <Box style={{ position: "relative", height: "70vh", minHeight: 420,
            border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))", borderRadius: 6,
            overflow: "hidden" }}>{panel}</Box>
        </Box>
      )}
      {first.id === "package" && packageDetails}
      {proposalText !== undefined && (
        <WrittenFile path={writtenPath} text={proposalText}
          why="the proposal this run wrote -- a draft for a human to promote; File > Download case (.zip) carries it" />
      )}
      {recordText !== undefined && (
        <WrittenFile path={writtenPath} text={recordText}
          why="the record this run wrote into the case -- the flowsheet reads it" />
      )}
      {writtenPath && first.role === "proposal" && proposalText === undefined && ran && (
        <Text size="sm" c="dimmed">This run published no {writtenPath}.</Text>
      )}
      <NodeList title={kind === "view" ? "drawn from" : "reads"} ids={up} map={map} onSelect={onSelect} />
      <NodeList title={kind === "view" ? "" : "feeds"} ids={down.filter((d) => !d.startsWith("view:"))} map={map} onSelect={onSelect} />
      <Box>
        <Text size="11px" c="dimmed" tt="uppercase" fw={700} mb={4}>
          {kind === "view" ? "The figure" : `Figures it ${kind === "operation" ? "feeds" : "appears in"} (${viewIds.length})`}
        </Text>
        {figures.length > 0
          ? <FigureGrid items={figures} csvFiles={csv} references={result?.postProcessing?.references} />
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
