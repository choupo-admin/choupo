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
  ReviewScreen -- A PROPS CASE'S RESULTS (DEV.md 4c C149, C151).

  Three panes, the pipeline-browser layout (ParaView) read through
  "overview first, zoom and filter, details on demand" (Shneiderman 1996):

    LEFT    the CASE TREE -- Data, Models, Operations by discipline (each op
            with its views), Records produced, My plots (PropsTree)
    CENTRE  the CALCULATION MAP -- the case drawn as a flowsheet of its
            calculation, read-only and derived (PropsMap, case/propsMap.ts)
    BELOW   the DETAILS of what is selected in either (PropsDetails), under a
            seam the reader drags (C153: the map is a TOP panel of the panel
            contract, its height a reader preference; folding it is "figures
            full height"; a selection made while this pane is too short to
            show its summary opens it -- ui/propsSplit.ts); with nothing
            selected, the OVERVIEW:
              1. what the run did -- one verdict row per operation
              2. (thermo readiness, where the case creates a component)
              3. figures, then parameters and tables -- every view
              4. other plots -- every other CSV the run wrote, collapsed
              5. audit, collapsed -- the raw panels this screen replaced

  One selection: a click on the map, a node of the tree or an operation's row
  selects the same object everywhere.  F1 opens what it is about: a model's
  theory, an operation's section, a view's figure, a dataset's file.  Every
  operation and every declared view links to its block in system/propsDict.

  Nothing here computes a number (reviewScreen.ts for the strip,
  postProcessing.ts for the views, propsMap.ts for the map).
\*---------------------------------------------------------------------------*/

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { ActionIcon, Badge, Box, Button, Group, ScrollArea, Select, Stack, Table, Text, Tooltip } from "@mantine/core";
import { useMediaQuery, useReducedMotion } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconChevronsDown, IconChevronsUp, IconFileCode } from "@tabler/icons-react";

import type { RunResult } from "../adapters/SolverAdapter.js";
import type { JsonDict } from "../dict/index.js";
import { viewGroups, type PostItem, type ViewGroup } from "../case/postProcessing.js";
import { verdictRows, type VerdictRow } from "../case/reviewScreen.js";
import { PROPS_DISCIPLINES } from "../case/operationSchemas.js";
import {
  caseTree, derivePropsMap, PROPS_DICT_PATH, type CaseTreeNode, type MapTarget, type MyPlot,
} from "../case/propsMap.js";
import { locatePropsBlocks } from "../case/propsDictLocate.js";
import { useStore } from "../state/store.js";
import { openGuide } from "../help/guideLinks.js";
import { CURATION_COLOUR } from "./FitStatsPanel.js";
import { CsvAutoPlot, dropPointColumn } from "./plotting/CsvAutoPlot.js";
import { PropsMapCanvas } from "./PropsMap.js";
import { PropsTree } from "./PropsTree.js";
import { CaseLink, FigureGrid, SelectionDetails } from "./PropsDetails.js";
import { useMeasuredBoxHeight } from "./methods/methodsChrome.js";
import {
  PROPS_MAP_PANEL, PanelResizeHandle, panelBoxProps, shownTopPanelPx, usePanel, type PanelHandle,
} from "./panelContract.js";
import {
  PANELS, clampSize, forgetPanelSize, hasPanelSize, loadPanelSize, savePanelSize,
} from "../state/prefs.js";
import { autoMapPx, DETAILS_FLOOR_PX, openDetailsCap } from "./propsSplit.js";

function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <Box mb={6}>
      <Text size="11px" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: 0.5 }}>{children}</Text>
      {hint && <Text size="xs" c="dimmed">{hint}</Text>}
    </Box>
  );
}

function pct(v: number | null): string {
  return v === null ? "" : `${v.toPrecision(3)} %`;
}

/** Rows shown before the strip folds: a case of twenty operations must not
 *  push its figures below the fold. */
const STRIP_ROWS = 8;

function VerdictStrip({ rows, ran, selected, onSelect, linkOf }: {
  rows: VerdictRow[]; ran: boolean;
  selected?: string | null;
  onSelect?: (id: string) => void;
  linkOf?: (op: string) => MapTarget | undefined;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, STRIP_ROWS);
  return (
    <>
    <ScrollArea type="auto">
      <Table withTableBorder fz="xs" verticalSpacing={3} data-review="verdicts"
        style={{ minWidth: 640 }}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>operation</Table.Th>
            <Table.Th>what it did</Table.Th>
            <Table.Th>verdict</Table.Th>
            <Table.Th ta="right">points</Table.Th>
            <Table.Th ta="right">AAD vs data</Table.Th>
            <Table.Th ta="right">held-out AAD</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {shown.map((r, i) => {
            const link = linkOf?.(r.name);
            const isSel = selected === `op:${r.name}`;
            return (
            <Table.Tr key={r.name} data-verdict-row={r.name}
              style={{ ...(!r.ran && ran ? { opacity: 0.6 } : {}),
                ...(isSel ? { background: "light-dark(var(--mantine-color-yellow-1), rgba(250,204,21,0.18))" } : {}) }}>
              <Table.Td style={{ whiteSpace: "nowrap" }}>
                <Group gap={4} wrap="nowrap">
                  {link && link.kind === "case" && (
                    <Tooltip label={`its block in ${link.path} (lines ${link.line}-${link.endLine})`} withArrow>
                      <ActionIcon size={16} variant="subtle" aria-label="open in Case"
                        onClick={() => window.dispatchEvent(new CustomEvent("choupo:openCase", { detail: link }))}>
                        <IconFileCode size={12} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  <Text span size="xs" ff="monospace" fw={600}
                    style={onSelect ? { cursor: "pointer", textDecoration: "underline dotted" } : undefined}
                    onClick={() => onSelect?.(`op:${r.name}`)}>{r.name}</Text>
                  <Text span size="xs" c="dimmed"> · {r.type}</Text>
                </Group>
              </Table.Td>
              <Table.Td>
                {/* the type's sentence once per run of one type, not twenty times */}
                <Text size="xs" c="dimmed" lineClamp={2}>
                  {i > 0 && shown[i - 1]!.type === r.type ? "″" : r.did}
                </Text>
              </Table.Td>
              <Table.Td>
                {r.verdict ? (
                  <Badge size="sm" variant="light" color={CURATION_COLOUR[r.verdict] ?? "gray"}
                    style={{ textTransform: "none" }}>{r.verdict}</Badge>
                ) : (
                  <Text size="xs" c="dimmed">{!ran ? "not run" : r.ran ? "no claim" : "no result"}</Text>
                )}
              </Table.Td>
              <Table.Td ta="right" ff="monospace">
                {r.points && (
                  <Tooltip label={`the op's ${r.points.key}`} withArrow>
                    <span>{r.points.value}</span>
                  </Tooltip>
                )}
              </Table.Td>
              <Table.Td ta="right" ff="monospace">{pct(r.aadPct)}</Table.Td>
              <Table.Td ta="right" ff="monospace">{pct(r.heldOutAadPct)}</Table.Td>
            </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </ScrollArea>
    {rows.length > STRIP_ROWS && (
      <Button size="compact-xs" variant="subtle" mt={4} onClick={() => setAll(!all)}>
        {all ? "show the first " + STRIP_ROWS : "show all " + rows.length + " operations"}
      </Button>
    )}
    </>
  );
}

function groupTitle(g: ViewGroup, ops: JsonDict[]): string {
  if (g.origin === "declared") return "Declared in the propsDict (`views`)";
  const op = ops.find((o) => o && typeof o === "object" && !Array.isArray(o) && o["name"] === g.op);
  const type = op && typeof op["type"] === "string" ? op["type"] : "";
  return `${g.op}${type ? ` · ${type}` : ""} — default views`;
}

function ViewGrid({ groups, ops, csvFiles, kind, linkOf }: {
  groups: ViewGroup[]; ops: JsonDict[]; csvFiles: { [f: string]: string };
  kind: "plot" | "table";
  linkOf: (it: PostItem) => MapTarget | undefined;
}) {
  const shown = groups
    .map((g) => ({ g, items: g.items.filter((i) => i.kind === kind) }))
    .filter((x) => x.items.length > 0);
  if (shown.length === 0)
    return <Text size="sm" c="dimmed">No {kind === "plot" ? "figure" : "table"} published.</Text>;
  return (
    <Stack gap="md">
      {shown.map(({ g, items }) => (
        <Box key={`${g.origin}:${g.op}`}>
          <Text size="xs" fw={600} mb={4} ff={g.origin === "default" ? "monospace" : undefined}>
            {groupTitle(g, ops)}
          </Text>
          <FigureGrid items={items} csvFiles={csvFiles} linkOf={linkOf} />
        </Box>
      ))}
    </Stack>
  );
}

/** The CSVs a run wrote that no view draws: the free auto-plots the Plots tab
 *  used to hold for a props case, one home now. */
export function otherCsvFiles(csvFiles: { [f: string]: string } | undefined): string[] {
  return Object.keys(csvFiles ?? {})
    .filter((f) => !f.startsWith("postProcessing/") && !/(^|\/)exp_/.test(f))
    .sort();
}

/* ---- My plots: per-viewer, per-case (localStorage, a convenience) -------- */

const plotsKey = (caseKey: string) => `choupo.myPlots.${caseKey}`;
function loadPlots(caseKey: string): MyPlot[] {
  try {
    const v = JSON.parse(localStorage.getItem(plotsKey(caseKey)) ?? "[]");
    return Array.isArray(v) ? v.filter((p) => p && typeof p.file === "string") : [];
  } catch { return []; }
}
function savePlots(caseKey: string, plots: MyPlot[]) {
  try { localStorage.setItem(plotsKey(caseKey), JSON.stringify(plots)); } catch { /* private window */ }
}

function OtherPlots({ files, csvFiles }: { files: string[]; csvFiles: { [f: string]: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <details data-review="other-plots" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary style={{ cursor: "pointer" }}>
        <Text span size="11px" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: 0.5 }}>
          Other plots
        </Text>
        <Text span size="xs" c="dimmed"> — {files.length} CSV file(s) the run wrote that no view draws,
          plotted as they are (+ under My plots keeps one)</Text>
      </summary>
      {open && (
        <Stack gap="md" mt="xs">
          {files.map((f) => (
            <Box key={f} style={{ border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
              borderRadius: 6, padding: 8 }}>
              <Text size="xs" ff="monospace" mb={4}>{f}</Text>
              <CsvAutoPlot csv={dropPointColumn(csvFiles[f] ?? "")} filename={f} />
            </Box>
          ))}
        </Stack>
      )}
    </details>
  );
}

export function ReviewScreen({ ops, result, readiness, audit, propsDict, thermo, rawFiles, caseKey, flowsheet }: {
  ops: JsonDict[];
  result: RunResult | undefined;
  /** the thermo readiness, drawn here (a case that creates a component) */
  readiness?: ReactNode;
  /** the full surface the screen replaces as the landing, collapsed below it */
  audit: ReactNode;
  propsDict?: JsonDict | null;
  thermo?: JsonDict | null;
  rawFiles?: Record<string, string>;
  /** the case's name: My plots are remembered per case */
  caseKey?: string;
  /** a two-mode case's flowsheet (the units that read a fitted record) */
  flowsheet?: JsonDict | null;
}) {
  const ran = result?.status === "done";
  const rows = verdictRows(ops, result?.operationResults ?? [], result?.validation);
  const block = result?.postProcessing;
  const groups = block ? viewGroups(block) : [];
  const csvFiles = result?.csvFiles ?? {};
  const openCaseAt = useStore((s) => s.openCaseAt);
  const setCaseMode = useStore((s) => s.setCaseMode);
  const selectNode = useStore((s) => s.selectNode);
  const narrow = useMediaQuery("(max-width: 900px)") ?? false;

  const [selected, setSelected] = useState<string>("");
  //  a selection asked for from outside (a unit's link to its fit, C152)
  const propsFocus = useStore((s) => s.propsFocus);
  useEffect(() => { if (propsFocus) setSelected(propsFocus.id); }, [propsFocus]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [treeOpen, setTreeOpen] = useState(false);
  const key = caseKey ?? "case";
  const [myPlots, setMyPlots] = useState<MyPlot[]>(() => loadPlots(key));
  useEffect(() => { setMyPlots(loadPlots(key)); setSelected(""); }, [key]);

  const map = useMemo(() => derivePropsMap({
    propsDict, thermo, rawFiles, post: block ?? null, results: result?.operationResults, expanded, flowsheet,
  }), [propsDict, thermo, rawFiles, block, result, expanded, flowsheet]);
  const verdicts = useMemo(() => new Map(rows.filter((r) => r.verdict).map((r) => [r.name, r.verdict])), [rows]);
  const tree = useMemo(() => caseTree(map, propsDict, PROPS_DISCIPLINES, myPlots, verdicts),
    [map, propsDict, myPlots, verdicts]);
  const where = useMemo(() => locatePropsBlocks(rawFiles?.[PROPS_DICT_PATH]), [rawFiles]);

  const folderOps = useCallback((id: string): string[] => {
    const find = (ns: CaseTreeNode[]): CaseTreeNode | undefined => {
      for (const n of ns) { if (n.id === id) return n; const c = find(n.children); if (c) return c; }
      return undefined;
    };
    return (find(tree)?.children ?? []).map((c) => c.id);
  }, [tree]);

  //  the selection, as the map draws it: a member, or the block of a folder's first op
  const mapSelected = selected.startsWith("folder:type:")
    ? (map.blockOf.get(folderOps(selected)[0] ?? "") ?? null)
    : selected || null;

  const activate = useCallback((t: MapTarget) => {
    if (t.kind === "guide") openGuide(t.url);
    else if (t.kind === "case") openCaseAt(t.path, t.line, t.endLine);
    else if (t.kind === "view") setSelected(`view:${t.domId}`);
    else if (t.kind === "process") { setCaseMode("process"); selectNode(`unit:${t.unit}`); }
    else notifications.show({ message: t.label, color: "gray", autoClose: 4000 });
  }, [openCaseAt, setCaseMode, selectNode]);

  //  the DOORS a figure or a verdict row opens on its declaring block
  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<MapTarget>).detail;
      if (t && t.kind === "case") openCaseAt(t.path, t.line, t.endLine);
    };
    window.addEventListener("choupo:openCase", on);
    return () => window.removeEventListener("choupo:openCase", on);
  }, [openCaseAt]);

  const targetOf = useCallback((id: string): MapTarget | undefined => {
    if (!id) return undefined;
    const ids = id.startsWith("folder:type:") ? folderOps(id) : [id];
    const n = map.nodes.find((x) => x.id === ids[0]);
    if (n) return n.member.target;
    const b = map.blocks.find((x) => x.id === id);
    return b?.members[0]?.target;
  }, [map, folderOps]);

  //  F1 with something selected opens what it is about -- ahead of the
  //  workspace's own F1 (capture phase, stopped), which keeps its answer for
  //  the screen with nothing selected.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key !== "F1" || !selected) return;
      const t = targetOf(selected);
      if (!t) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      activate(t);
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  }, [selected, targetOf, activate]);

  const opLink = useCallback((op: string): MapTarget | undefined => {
    const l = where.operations.get(op);
    return l ? { kind: "case", path: PROPS_DICT_PATH, line: l.line, endLine: l.endLine, label: `${op} in system/propsDict` } : undefined;
  }, [where]);
  const figureLink = useCallback((it: PostItem): MapTarget | undefined => {
    const l = it.origin === "declared" ? where.views.get(it.name) : where.operations.get(it.op);
    return l ? { kind: "case", path: PROPS_DICT_PATH, line: l.line, endLine: l.endLine,
      label: `${it.name} in system/propsDict` } : undefined;
  }, [where]);

  const addPlot = (file: string) => {
    const p: MyPlot = { id: `${Date.now().toString(36)}`, file, title: file.split("/").pop() ?? file };
    const next = [...myPlots, p];
    setMyPlots(next); savePlots(key, next); setSelected(`myplot:${p.id}`);
  };
  const removePlot = (id: string) => {
    const next = myPlots.filter((p) => `myplot:${p.id}` !== id);
    setMyPlots(next); savePlots(key, next);
    if (selected === id) setSelected("");
  };

  const strip = (rs: VerdictRow[]) =>
    <VerdictStrip rows={rs} ran={ran} selected={selected} onSelect={setSelected} linkOf={opLink} />;

  const otherFiles = otherCsvFiles(csvFiles);
  const isFolderOverview = selected.startsWith("folder:") && !selected.startsWith("folder:type:");

  let details: ReactNode;
  if (selected === "myplot:new") {
    details = (
      <Stack gap="xs" data-review="new-plot">
        <SectionTitle hint="Any CSV the run wrote, drawn as it is -- kept under My plots in this browser.">
          New plot
        </SectionTitle>
        {Object.keys(csvFiles).length === 0
          ? <Text size="sm" c="dimmed">Run properties first: a plot draws a file the run wrote.</Text>
          : <Select data={Object.keys(csvFiles).sort()} placeholder="choose a CSV file" searchable
              maw={520} onChange={(v) => v && addPlot(v)} comboboxProps={{ withinPortal: true }} />}
      </Stack>
    );
  } else if (selected.startsWith("myplot:")) {
    const p = myPlots.find((x) => `myplot:${x.id}` === selected);
    const csv = p ? csvFiles[p.file] : undefined;
    details = (
      <Stack gap="xs" data-review="my-plot">
        <SectionTitle hint={p?.file}>{p?.title ?? "plot"}</SectionTitle>
        {csv ? <CsvAutoPlot csv={dropPointColumn(csv)} filename={p!.file} />
          : <Text size="sm" c="dimmed">{ran ? `The run wrote no ${p?.file}.` : "Run properties to draw it."}</Text>}
      </Stack>
    );
  } else if (selected && !isFolderOverview) {
    details = (
      <SelectionDetails id={selected} map={map} result={result} rows={rows} strip={strip}
        onSelect={setSelected} onActivate={activate} folderOps={folderOps} />
    );
  } else {
    details = (
      <Stack gap="lg" data-review="overview">
        <Box>
          <SectionTitle hint={ran ? "Click an operation for its numbers and figures; the icon opens its block in system/propsDict."
            : "Run properties: each operation reports here."}>
            What the run did
          </SectionTitle>
          {strip(rows)}
        </Box>
        {readiness && (
          <Box>
            <SectionTitle hint="This case creates or estimates a component: is the thermo ready for it?">
              Thermo readiness
            </SectionTitle>
            <Box style={{ position: "relative", height: "70vh", minHeight: 420 }}>{readiness}</Box>
          </Box>
        )}
        <Box>
          <SectionTitle hint="Each operation's default views, and the ones the propsDict declares -- every point the engine's.">
            Figures
          </SectionTitle>
          {ran
            ? <ViewGrid groups={groups} ops={ops} csvFiles={csvFiles} kind="plot" linkOf={figureLink} />
            : <Text size="sm" c="dimmed">Not run yet.</Text>}
        </Box>
        <Box>
          <SectionTitle>Parameters and tables</SectionTitle>
          {ran
            ? <ViewGrid groups={groups} ops={ops} csvFiles={csvFiles} kind="table" linkOf={figureLink} />
            : <Text size="sm" c="dimmed">Not run yet.</Text>}
        </Box>
        {ran && otherFiles.length > 0 && <OtherPlots files={otherFiles} csvFiles={csvFiles} />}
        <details data-review="audit">
          <summary style={{ cursor: "pointer" }}>
            <Text span size="11px" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: 0.5 }}>
              Audit
            </Text>
            <Text span size="xs" c="dimmed"> — the raw diagnostics, the decision ledger, the thermo
              readiness and every operation&apos;s own panel</Text>
          </summary>
          <Box mt="xs" style={{ position: "relative", height: "78vh", minHeight: 480,
            display: "flex", flexDirection: "column",
            border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
            borderRadius: 6, overflow: "hidden" }}>
            {audit}
          </Box>
        </details>
      </Stack>
    );
  }

  const handlers = useMemo(() => ({
    selected: mapSelected,
    onSelect: (blockId: string, memberId?: string) => {
      const b = map.blocks.find((x) => x.id === blockId);
      setSelected(memberId ?? (b && b.members.length === 1 ? b.members[0]!.id : blockId));
    },
    onActivate: activate,
    onToggle: (g: string) => setExpanded((s) => {
      const n = new Set(s);
      if (n.has(g)) n.delete(g); else n.add(g);
      return n;
    }),
  }), [mapSelected, activate, map]);

  const treePane = (
    <PropsTree tree={tree} selected={selected || null} onSelect={(id) => { setSelected(id); setTreeOpen(false); }}
      onNewPlot={() => setSelected("myplot:new")} onRemovePlot={removePlot} />
  );
  /*  THE SPLIT (DEV.md 4c C153).  The map is a TOP panel; its size is the
   *  reader's once dragged and C151's computed height until then
   *  (`autoMapPx`), so the contract runs CONTROLLED here: this component owns
   *  the one value and writes it to the one key (PANELS.propsMap).  Reset
   *  (double-click, Enter on the seam) forgets the drag and returns to the
   *  computed height rather than to a fixed number. */
  const reduceMotion = useReducedMotion();
  const split = useMeasuredBoxHeight<HTMLDivElement>();
  const mapSpec = PROPS_MAP_PANEL.prefs.size;
  const [mapPref, setMapPref] = useState<number | null>(
    () => (hasPanelSize(PANELS.propsMap) ? loadPanelSize(PANELS.propsMap) : null));
  //  the affordance's cap on the map's DRAWN height: render-only, dropped the
  //  moment the reader drags or resets (ui/propsSplit.ts)
  const [mapCap, setMapCap] = useState<number | null>(null);
  const onMapPx = useCallback((px: number) => {
    setMapPref(clampSize(px, PROPS_MAP_PANEL.prefs.size));
    setMapCap(null);
    savePanelSize(PANELS.propsMap, px);
  }, []);
  const autoPx = autoMapPx(map.height, narrow);
  //  What is DRAWN: the preference (or the computed height), fitted into the
  //  split render-only, then the affordance's cap.  The contract is handed
  //  THIS number, so a drag or an arrow key starts from the seam the reader
  //  sees -- handed the stored size instead, a map fitted from 1485 px down to
  //  689 px did not move until the pointer had travelled 800 px (measured).
  const fittedMap = shownTopPanelPx(clampSize(mapPref ?? autoPx, mapSpec), 0, split.height,
    DETAILS_FLOOR_PX, mapSpec);
  const shownMap = mapCap !== null ? Math.min(fittedMap, mapCap) : fittedMap;
  const controlled = useMemo(() => ({ value: shownMap, onValue: onMapPx }), [shownMap, onMapPx]);
  const contract = usePanel(PROPS_MAP_PANEL, { controlled });
  const resetMap = useCallback(() => {
    forgetPanelSize(PANELS.propsMap);
    setMapPref(null);
    setMapCap(null);
  }, []);
  const mapPanel: PanelHandle = useMemo(() => ({
    ...contract,
    reset: resetMap,
    onKeyDown: (e: ReactKeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); resetMap(); return; }
      contract.onKeyDown(e);
    },
  }), [contract, resetMap]);
  const mapBox = panelBoxProps(mapPanel, !!reduceMotion, shownMap);

  //  A SELECTION THAT CANNOT BE SEEN IS NOT AN ANSWER: when something is
  //  selected and the details pane is too short for its summary, open it.
  const lastSelected = useRef(selected);
  useEffect(() => {
    if (selected === lastSelected.current) return;
    lastSelected.current = selected;
    if (!selected || mapPanel.collapsed) return;
    const cap = openDetailsCap(split.height, shownMap, mapSpec);
    if (cap !== null) setMapCap(cap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const selLink = selected.startsWith("op:") ? opLink(selected.slice(3)) : undefined;

  const centre = (
    <Box style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, height: "100%" }}>
      <Box px="md" pt="sm" style={{ flex: "0 0 auto" }}>
        <Group justify="space-between" mb={4} wrap="nowrap">
          <SectionTitle hint={narrow ? undefined : mapPanel.collapsed ? "Folded: the details and figures have the whole height."
            : "Data, models, operations, views -- derived from system/propsDict.  Click to select, F1 or double-click to open; drag the seam under it to resize."}>
            Calculation map
          </SectionTitle>
          <Group gap={4} wrap="nowrap">
            {narrow && (
              <Button size="compact-xs" variant="default" onClick={() => setTreeOpen(!treeOpen)}>
                {treeOpen ? "Hide the case tree" : "Case tree"}
              </Button>
            )}
            <Tooltip withArrow multiline maw={300} label={mapPanel.collapsed
              ? "Show the calculation map again, at the height you left it"
              : "Fold the calculation map away: the details and figures take the whole height (the map's size is kept)"}>
              <Button size="compact-xs" variant="default" data-review="figures-full-height"
                aria-expanded={!mapPanel.collapsed}
                leftSection={mapPanel.collapsed ? <IconChevronsDown size={13} /> : <IconChevronsUp size={13} />}
                onClick={mapPanel.toggle}>
                {mapPanel.collapsed ? "Show the map" : "Figures full height"}
              </Button>
            </Tooltip>
          </Group>
        </Group>
        {narrow && treeOpen && (
          <Box style={{ height: 320, border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))",
            borderRadius: 6, marginBottom: 8 }}>{treePane}</Box>
        )}
      </Box>
      <Box ref={split.ref} data-review="split"
        style={{ flex: "1 1 0px", minHeight: 0, display: "flex", flexDirection: "column" }}>
        {!mapPanel.collapsed && (
          <>
            <Box data-panel={mapBox["data-panel"]} style={{ ...mapBox.style, flex: "0 0 auto" }}>
              <Box px="md" pb={4} style={{ height: "100%", boxSizing: "border-box" }}>
                <PropsMapCanvas map={map} handlers={handlers} wide={!narrow} />
              </Box>
            </Box>
            <PanelResizeHandle panel={mapPanel} />
          </>
        )}
        <Box data-review="details-pane"
          style={{ flex: "1 1 0px", minHeight: 0, display: "flex", flexDirection: "column",
            borderTop: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-4))" }}>
          <Group px="md" gap={8} wrap="nowrap"
            style={{ flex: `0 0 ${DETAILS_FLOOR_PX - 1}px`, minHeight: 0, overflow: "hidden" }}>
            <Text size="11px" c="dimmed" tt="uppercase" fw={700} style={{ letterSpacing: 0.5, whiteSpace: "nowrap" }}>
              {selected ? "Details" : "Overview"}
            </Text>
            {selected && (
              <>
                <Button size="compact-xs" variant="subtle" onClick={() => setSelected("")}>← overview</Button>
                {selLink && <CaseLink t={selLink} onOpen={activate} />}
              </>
            )}
          </Group>
          <ScrollArea style={{ flex: 1, minHeight: 0 }} type="auto">
            <Box px="md" pb="sm" style={{ maxWidth: 1600 }}>{details}</Box>
          </ScrollArea>
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box data-review="screen" style={{ position: "absolute", inset: 0, display: "grid",
      gridTemplateColumns: narrow ? "minmax(0, 1fr)" : "250px minmax(0, 1fr)" }}>
      {!narrow && (
        <Box style={{ minHeight: 0, borderRight: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
          background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))" }}>
          {treePane}
        </Box>
      )}
      {centre}
    </Box>
  );
}
