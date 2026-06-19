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
  StreamsWorkspace -- the Streams top-menu workspace (Fase B).

  Two-column layout:
    left   ~240 px  Navigator.  Stream hierarchy grouped by namespace
                    (Sector > Unit > stream) with phase bullets.  Pre-run
                    the tree is built from the flowsheet alone; post-run
                    we decorate with phase + mass flow from the solver.
    centre 1fr      Stream detail.  All the numbers a complex stream can
                    carry: T, P, vf, molar flow, mass flow, F_solid,
                    fluid composition, solid composition (when present),
                    and room for future tables (ionic strength, activity
                    coefficients, multi-phase α/β/γ, PSD,...).  The
                    table needs ROOM -- a slurry with 10+ ions plus a
                    PSD overflows any 380 px sidebar.

  No canvas here.  The Streams workspace exists to navigate streams and
  read their numbers; spatial context is one Esc away (canvas-only
  default).  Workspaces don't duplicate each other's purpose.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import {
  ActionIcon,
  Box,
  Group,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";

import {
  flowBasis,
  formatFlow,
  formatPressure,
  formatSig,
  formatTemperature,
  temperatureLabel,
} from "../state/displayUnits.js";
import { useStore } from "../state/store.js";
import { parse, toJson, type JsonDict, type JsonValue } from "../dict/index.js";
import type { StreamResult } from "../adapters/SolverAdapter.js";
import { findRunStream } from "./streamPopOut.js";
import { StreamsSummary } from "./StreamsSummary.js";
import { StreamsTable } from "./StreamsTable.js";
import {
  type PhaseKind,
  PHASE_GLYPH,
  phaseColor as phaseColorFor,
  classifyPhase as classify,
} from "./plotting/palette.js";

// ---- Tree model ------------------------------------------------------------

interface TreeStream {
  kind: "stream";
  /** Qualified name suitable for findRunStream() lookup, dot-separated. */
  qname: string;
  /** Display label (leaf port name). */
  label: string;
  /** Role hint for the icon. */
  role: "feed" | "product" | "internal";
}

interface TreeGroup {
  kind: "group";
  /** Section label (sector name, unit name, "Feeds", "Products"). */
  label: string;
  children: TreeNode[];
}

type TreeNode = TreeGroup | TreeStream;

// ---- Component -------------------------------------------------------------

export function StreamsWorkspace() {
  const caseFiles = useStore((s) => s.caseFiles);
  const runResult = useStore((s) => s.runResult);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const selectNode = useStore((s) => s.selectNode);
  const prefs = useStore((s) => s.displayPrefs);
  // Table = all streams side-by-side (the comparison view, and
  // the default); Detail = navigator + one stream's full numbers.
  const [view, setView] = useState<"table" | "detail">("table");

  const tree = useMemo(() => buildTree(caseFiles), [caseFiles]);

  const selectedQname =
    selectedNodeId && selectedNodeId.startsWith("stream:")
      ? selectedNodeId.slice("stream:".length)
    : null;

  const selectedStream =
    selectedQname && runResult
      ? findRunStream(runResult.streams, selectedQname)
      : null;

  return (
    <Box style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Balances + duties summary band (the global balances live HERE now,
          not as bar charts in the Plots workspace). */}
      {runResult && <StreamsSummary result={runResult} flow={prefs.flow} />}

      {/* Table = all streams side-by-side; Detail = navigator + one stream. */}
      <Group
        px="sm"
        py={4}
        gap="sm"
        style={{ borderBottom: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))", flex: "0 0 auto" }}
      >
        <SegmentedControl
          size="xs"
          value={view}
          onChange={(v) => setView(v as "table" | "detail")}
          data={[
            { label: "Table", value: "table" },
            { label: "Detail", value: "detail" },
          ]}
        />
        <Text size="xs" c="dimmed">
          {view === "table"
            ? "all streams side-by-side"
            : "navigate one stream's full numbers"}
        </Text>
      </Group>

      {view === "table" ? (
        <Box style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
          <StreamsTable />
        </Box>
      ) : (
      <Box
        style={{
          display: "grid",
          gridTemplateColumns: "240px 1fr",
          gridTemplateRows: "1fr",
          flex: 1,
          minHeight: 0,
        }}
      >
      <Box
        style={{
          borderRight: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
          background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))",
          overflow: "hidden",
          minHeight: 0,
        }}
      >
        <ScrollArea
          type="always"
          scrollbarSize={10}
          style={{ height: "100%" }}
          styles={{
            // Make the scrollbar visible enough that "deslizar para baixo"
            // is an obvious affordance, not a hidden one.
            thumb: { background: "light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-3))" },
          }}
        >
          <Navigator
            tree={tree}
            runResult={runResult}
            selectedQname={selectedQname}
            onSelect={(qn) =>
              selectNode(
                selectedQname === qn ? null : `stream:${qn}`,
              )
            }
          />
        </ScrollArea>
      </Box>

      <Box
        style={{
          background: "light-dark(var(--mantine-color-white), var(--mantine-color-dark-8))",
          overflow: "hidden",
          minHeight: 0,
          // Pin to the grid row's height.  Without this the child
          // ScrollArea's 100 % is computed against the CONTENT height
          // (the Stack grows to whatever the PSD table needs), so the
          // scrollbar has nothing to scroll against and rows under the
          // viewport are stranded.
          height: "100%",
        }}
      >
        <ScrollArea
          type="always"
          scrollbarSize={10}
          h="100%"
          styles={{ thumb: { background: "light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-3))" } }}
        >
          <Detail name={selectedQname} stream={selectedStream ?? null} />
        </ScrollArea>
      </Box>
      </Box>
      )}
    </Box>
  );
}

// ---- Navigator -------------------------------------------------------------

function Navigator({
  tree,
  runResult,
  selectedQname,
  onSelect,
}: {
  tree: TreeNode[];
  runResult: import("../adapters/SolverAdapter.js").RunResult | null;
  selectedQname: string | null;
  onSelect: (qname: string) => void;
}) {
  // Pull display prefs at the root of the navigator so every leaf row
  // formats its little inline flow label in the unit the user picked
  // from the TopBar Units menu (kmol/h, kg/s, ...).  Before this hook
  // the navigator showed raw F_mass in kg/s unconditionally, which
  // contradicted the rest of the UI when the user switched to molar
  // basis.
  const prefs = useStore((s) => s.displayPrefs);

  // Per-group collapse state, keyed by the group's path ("CONCENTRATION",
  // "CONCENTRATION>Cryst", ...).  All expanded by default; clicking a
  // sector's chevron hides its children so the student can focus on the
  // other sector without scrolling around it.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  return (
    <Stack gap={0} p="xs">
      <Text size="xs" c="dimmed" tt="uppercase" mb={6}
        style={{ letterSpacing: 0.5, fontWeight: 600 }}>
        Navigator
      </Text>
      {tree.length === 0 && (
        <Text size="xs" c="dimmed" px="xs">
          No flowsheet loaded.
        </Text>
      )}
      {tree.map((n, i) => (
        <NavRow
          key={i}
          node={n}
          path=""
          depth={0}
          runResult={runResult}
          selectedQname={selectedQname}
          onSelect={onSelect}
          collapsed={collapsed}
          onToggle={toggle}
          prefs={prefs}
        />
      ))}
    </Stack>
  );
}

function NavRow({
  node, path, depth, runResult, selectedQname, onSelect, collapsed, onToggle, prefs,
}: {
  node: TreeNode;
  path: string;
  depth: number;
  runResult: import("../adapters/SolverAdapter.js").RunResult | null;
  selectedQname: string | null;
  onSelect: (qname: string) => void;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  prefs: import("../state/displayUnits.js").DisplayPrefs;
}) {
  if (node.kind === "group") {
    const id = path ? `${path}>${node.label}` : node.label;
    const isCollapsed = collapsed.has(id);
    return (
      <Stack gap={0}>
        <Group
          gap={4}
          wrap="nowrap"
          style={{
            cursor: "pointer",
            padding: `4px 6px 2px ${4 + depth * 12}px`,
          }}
          onClick={() => onToggle(id)}
        >
          <ActionIcon
            variant="transparent"
            size="xs"
            c="dimmed"
            onClick={(e) => { e.stopPropagation(); onToggle(id); }}
          >
            {isCollapsed
              ? <IconChevronRight size={12} />
              : <IconChevronDown  size={12} />}
          </ActionIcon>
          <Text
            size="xs"
            fw={600}
            c={depth === 0 ? "accent" : "var(--mantine-color-text)"}
            tt={depth === 0 ? "uppercase" : undefined}
            style={{ letterSpacing: depth === 0 ? 0.4 : 0 }}
          >
            {node.label}
          </Text>
        </Group>
        {!isCollapsed && node.children.map((c, i) => (
          <NavRow
            key={i}
            node={c}
            path={id}
            depth={depth + 1}
            runResult={runResult}
            selectedQname={selectedQname}
            onSelect={onSelect}
            collapsed={collapsed}
            onToggle={onToggle}
            prefs={prefs}
          />
        ))}
      </Stack>
    );
  }
  const matched = runResult ? findRunStream(runResult.streams, node.qname) : undefined;
  const phase: PhaseKind = matched ? classify(matched) : "liquid";
  const isSelected = selectedQname === node.qname;
  return (
    <Group
      gap={6}
      wrap="nowrap"
      style={{
        cursor: "pointer",
        padding: `3px 8px 3px ${6 + depth * 12}px`,
        background: isSelected ? "light-dark(var(--mantine-color-gray-2), var(--mantine-color-dark-5))" : undefined,
        borderLeft: isSelected
          ? "2px solid var(--mantine-color-accent-3)"
        : "2px solid transparent",
      }}
      onClick={() => onSelect(node.qname)}
    >
      <Box
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          background: matched ? phaseColorFor(phase, prefs.colorScheme) : "light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-3))",
          flexShrink: 0,
        }}
      />
      {matched && (
        <Text size="9px" c="dimmed" ff="monospace" title={phase} style={{ width: 22, flexShrink: 0 }}>
          {PHASE_GLYPH[phase]}
        </Text>
      )}
      <Text size="xs" c="var(--mantine-color-text)">
        {node.label}
      </Text>
      {matched && (() => {
        const isMass = flowBasis(prefs.flow) === "mass";
        const v = isMass ? matched.F_mass : matched.F;
        if (v === undefined || !Number.isFinite(v) || v === 0) return null;
        return (
          <Text size="10px" c="dimmed" ff="monospace" style={{ marginLeft: "auto" }}>
            {formatFlow(v, prefs.flow)}
          </Text>
        );
      })()}
    </Group>
  );
}

// ---- Detail panel ----------------------------------------------------------

function Detail({
  name, stream,
}: {
  name: string | null;
  stream: StreamResult | null;
}) {
  const prefs = useStore((s) => s.displayPrefs);

  if (!name) {
    return (
      <Stack align="center" justify="center" h="100%" p="xl" gap="sm">
        <Text c="dimmed" size="xl" fw={600}>
          Pick a stream
        </Text>
        <Text c="dimmed" size="sm" ta="center" maw={420}>
          The navigator on the left lists every stream in the plant,
          grouped by sector and unit operation.  Click one to see its
          full state.
        </Text>
      </Stack>
    );
  }
  if (!stream) {
    return (
      <Stack p="xl" gap="sm" maw={680}>
        <Text fw={700} size="xl" c="var(--mantine-color-text)">{leafName(name)}</Text>
        <Text size="xs" c="dimmed" ff="monospace">{name}</Text>
        <Text c="dimmed" size="sm" mt="md">
          No run data for this stream.  Press <kbd>Ctrl</kbd>+<kbd>Enter</kbd>{" "}
          to execute the case, then come back.
        </Text>
      </Stack>
    );
  }

  const phase = classify(stream);
  const isMass = flowBasis(prefs.flow) === "mass";
  const flowValue = isMass ? stream.F_mass ?? 0 : stream.F;
  const totalSolid = stream.F_solid_mass ?? 0;

  return (
    <Stack p="xl" gap="lg" maw={1100}>
      {/* Header band: name + phase chip + qualified path */}
      <Stack gap={6}>
        <Group gap={12} wrap="nowrap" align="center">
          <Box
            style={{
              width: 14, height: 14, borderRadius: 7,
              background: phaseColorFor(phase, prefs.colorScheme),
              flexShrink: 0,
            }}
          />
          <Text fw={700} size="28px" c="var(--mantine-color-text)" style={{ lineHeight: 1 }}>
            {leafName(name)}
          </Text>
          <Text
            size="xs"
            fw={700}
            tt="uppercase"
            ff="monospace"
            style={{
              color: phaseColorFor(phase, prefs.colorScheme),
              padding: "3px 8px",
              borderRadius: 4,
              border: `1px solid ${phaseColorFor(phase, prefs.colorScheme)}`,
              letterSpacing: 0.8,
            }}
          >
            {phase}
          </Text>
        </Group>
        <Text size="xs" c="dimmed" ff="monospace">{name}</Text>
      </Stack>

      {/* State table.  Three columns so a wide screen reads as a single
          band rather than a thin vertical column. */}
      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="xl">
        <StatTable
          title="State"
          rows={[
            ["T", `${formatTemperature(stream.T, prefs.temperature)} ${temperatureLabel(prefs.temperature)}`],
            ["P", `${formatPressure(stream.P, prefs.pressure)} ${prefs.pressure}`],
            ["vf", stream.vf?.toFixed(3) ?? "—"],
          ]}
        />
        <StatTable
          title="Flow"
          rows={[
            [`Total (${prefs.flow})`, formatFlow(flowValue, prefs.flow)],
            ...(!isMass && stream.F_mass !== undefined
              ? ([["F_mass", `${stream.F_mass.toExponential(3)} kg/s`]] as [string, string][])
              : []),
            ...(totalSolid > 0
              ? ([["F_solid", `${totalSolid.toExponential(3)} kg/s`]] as [string, string][])
              : []),
          ]}
        />
        <StatTable
          title="Energy"
          rows={
            stream.H !== undefined
              ? [
                  ["H (kJ/mol)",  (stream.H / 1e3).toFixed(3)],
                  // H_dot = F [kmol/s] * 1000 mol/kmol * H [J/mol] = W; show kW
                  ["Ḣ (kW)",
                    ((stream.F * stream.H * 1000) / 1e3).toFixed(2),
                  ],
                ]
              : [["H", "—  (no thermo data)"]]
          }
        />
        <StatTable
          title="Identity"
          rows={[
            ["role", stream.role],
            ["components", String(Object.keys(stream.composition).filter((c) => (stream.composition[c] ?? 0) > 0).length)],
            ...(stream.solids
              ? ([["solid species", String(Object.keys(stream.solids).length)]] as [string, string][])
              : []),
          ]}
        />
      </SimpleGrid>

      {/* Composition + solids side by side when both present, so a slurry
          reads as one wide band instead of two stacked half-pages. */}
      <SimpleGrid
        cols={{ base: 1, md: stream.solids && Object.keys(stream.solids).length > 0 ? 2 : 1 }}
        spacing="xl"
      >
        <CompositionTable
          title="Composition (mol %)"
          comp={stream.composition}
        />
        {stream.solids && Object.keys(stream.solids).length > 0 && (
          <CompositionTable
            title="Solids (kg/s)"
            comp={stream.solids}
            format="exp"
          />
        )}
      </SimpleGrid>

      {/* PSD: shown when the producer wrote one.  A solid-bearing stream
          without psd (e.g. equilibrium crystalliser, solid dryer)
          renders an explanatory note instead of silently omitting it,
          so the student knows the data is missing for a model reason
          rather than a UI bug. */}
      {totalSolid > 0 && (
        <PSDBlock psd={stream.psd ?? null} />
      )}
    </Stack>
  );
}

function PSDBlock({
  psd,
}: {
  psd: { diameter: number[]; massFrac: number[] } | null;
}) {
  if (!psd || psd.diameter.length === 0) {
    return (
      <Stack gap={4}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}
          style={{ letterSpacing: 0.5 }}>
          Particle-size distribution
        </Text>
        <Text size="sm" c="dimmed">
          Not computed by the producer of this stream.  PSD is generated
          only by units that solve a population balance (MSMPR / FVM
          crystalliser, spray dryer, cyclone cut, bag-filter cake).
          For an equilibrium crystalliser the magma carries the crystal
          mass but no size distribution -- switch the unit's{" "}
          <Text span ff="monospace">model</Text> to{" "}
          <Text span ff="monospace">MSMPR</Text> or{" "}
          <Text span ff="monospace">FVM</Text> if you need one.
        </Text>
      </Stack>
    );
  }
  // Compute moments for a one-line summary: d10, d50, d90 (volume basis).
  const cumulative = (() => {
    const out: number[] = [];
    let sum = 0;
    for (const f of psd.massFrac) { sum += f; out.push(sum); }
    return out;
  })();
  const quantile = (q: number): number => {
    for (let i = 0; i < cumulative.length; i++) {
      if (cumulative[i]! >= q) return psd.diameter[i]! * 1e6; // micron
    }
    return psd.diameter[psd.diameter.length - 1]! * 1e6;
  };
  const d10 = quantile(0.1);
  const d50 = quantile(0.5);
  const d90 = quantile(0.9);

  return (
    <Stack gap={4}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}
        style={{ letterSpacing: 0.5 }}>
        Particle-size distribution
      </Text>
      <Text size="xs" c="dimmed" ff="monospace">
        {psd.diameter.length} bins  ·  d10 = {d10.toFixed(1)} µm
        ·  d50 = {d50.toFixed(1)} µm  ·  d90 = {d90.toFixed(1)} µm
      </Text>
      <Table verticalSpacing={3} fz="xs" mt={4}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th style={{ color: "var(--mantine-color-dimmed)", width: 120 }}>
              diameter (µm)
            </Table.Th>
            <Table.Th style={{ color: "var(--mantine-color-dimmed)", width: 130 }}>
              mass fraction
            </Table.Th>
            <Table.Th style={{ color: "var(--mantine-color-dimmed)" }}>
              cumulative
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {psd.diameter.map((d, i) => (
            <Table.Tr key={i}>
              <Table.Td style={{
                color: "light-dark(var(--mantine-color-gray-8), var(--mantine-color-dark-0))",
                fontFamily: "JetBrains Mono, monospace",
              }}>
                {(d * 1e6).toFixed(2)}
              </Table.Td>
              <Table.Td style={{
                color: "light-dark(var(--mantine-color-gray-8), var(--mantine-color-dark-0))",
                fontFamily: "JetBrains Mono, monospace",
              }}>
                {(psd.massFrac[i] ?? 0).toExponential(3)}
              </Table.Td>
              <Table.Td style={{
                color: "var(--mantine-color-dimmed)",
                fontFamily: "JetBrains Mono, monospace",
              }}>
                {((cumulative[i] ?? 0) * 100).toFixed(1)} %
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

// Plain-language glossary for the cryptic stream-state labels.  A student
// who has never met "vf" or "Ḣ" gets a one-line explanation on hover instead
// of having to guess.  Matched by a prefix of the row label (labels carry
// units, e.g. "Ḣ (kW)").
const FIELD_HELP: { match: string; help: string }[] = [
  { match: "vf", help: "Vapour fraction: mole fraction of the stream that is vapour (0 = all liquid, 1 = all vapour)." },
  { match: "Ḣ", help: "Enthalpy flow = molar flow × molar enthalpy. The energy the stream carries per unit time." },
  { match: "H ", help: "Molar enthalpy: energy content per mole, relative to the package's reference state." },
  { match: "F_mass", help: "Mass flow rate of the stream (kg per unit time)." },
  { match: "F_solid", help: "Solid mass flow rate (the suspended-solids part of a slurry)." },
  { match: "F ", help: "Molar flow rate of the stream (kmol per unit time)." },
];

function helpFor(label: string): string | null {
  const hit = FIELD_HELP.find((h) => label.startsWith(h.match) || label === h.match.trim());
  return hit ? hit.help : null;
}

function StatTable({
  title, rows,
}: {
  title: string;
  rows: [string, string][];
}) {
  return (
    <Stack gap={4}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}
        style={{ letterSpacing: 0.5 }}>
        {title}
      </Text>
      <Table verticalSpacing={4} fz="sm">
        <Table.Tbody>
          {rows.map(([k, v]) => {
            const help = helpFor(k);
            return (
            <Table.Tr key={k}>
              <Table.Td style={{ color: "var(--mantine-color-dimmed)", width: 130 }}>
                {help ? (
                  <Tooltip label={help} multiline w={240} withArrow position="left">
                    <span style={{ borderBottom: "1px dotted light-dark(var(--mantine-color-gray-4), var(--mantine-color-dark-3))", cursor: "help" }}>
                      {k}
                    </span>
                  </Tooltip>
                ) : (
                  k
                )}
              </Table.Td>
              <Table.Td style={{
                color: "light-dark(var(--mantine-color-gray-8), var(--mantine-color-dark-0))",
                fontFamily: "JetBrains Mono, monospace",
              }}>
                {v}
              </Table.Td>
            </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function CompositionTable({
  title, comp, format = "frac",
}: {
  title: string;
  comp: { [component: string]: number };
  format?: "frac" | "exp";
}) {
  const entries = Object.entries(comp).filter(([, v]) => v > 0);
  if (entries.length === 0) return null;
  return (
    <Stack gap={4}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}
        style={{ letterSpacing: 0.5 }}>
        {title}
      </Text>
      <Table verticalSpacing={4} fz="sm">
        <Table.Tbody>
          {entries.map(([k, v]) => (
            <Table.Tr key={k}>
              <Table.Td style={{ color: "light-dark(var(--mantine-color-gray-8), var(--mantine-color-dark-0))", width: 180 }}>
                {k}
              </Table.Td>
              <Table.Td style={{
                color: "light-dark(var(--mantine-color-gray-8), var(--mantine-color-dark-0))",
                fontFamily: "JetBrains Mono, monospace",
                textAlign: "right",
              }}>
                {format === "exp" ? v.toExponential(3) : formatSig(v * 100) + " %"}
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function leafName(qname: string): string {
  const i = Math.max(qname.lastIndexOf("."), qname.lastIndexOf("/"));
  return i < 0 ? qname : qname.slice(i + 1);
}

// ---- Tree builder ----------------------------------------------------------

function buildTree(caseFiles: import("../case/types.js").CaseFiles): TreeNode[] {
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

  // Composite case: walk children recursively using rawFiles.
  const rawFiles = caseFiles.rawFiles ?? {};
  const inlets = (((fs["boundary"] ?? {}) as JsonDict)["inlets"] ?? []) as JsonValue[];
  const outlets = (((fs["boundary"] ?? {}) as JsonDict)["outlets"] ?? []) as JsonValue[];

  if (inlets.length > 0) {
    out.push({
      kind: "group",
      label: "Feeds (plant)",
      children: inlets.map((v) => streamLeaf(String(v), "feed")),
    });
  }

  walkChildren(out, fs, "", 0, rawFiles);

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
  depth: number,
  rawFiles: Record<string, string>,
): void {
  const children = fs["children"];
  if (!Array.isArray(children)) return;
  for (const cv of children as JsonValue[]) {
    const childName = String(cv);
    const childPrefix = prefix ? `${prefix}.${childName}` : childName;
    const childFs = readChildFlowsheet(rawFiles, prefix ? prefix.replaceAll(".", "/") + "/" + childName : childName);
    if (!childFs) continue;

    if (Array.isArray(childFs["children"])) {
      // Sector group
      const group: TreeGroup = { kind: "group", label: childName, children: [] };
      walkChildren(group.children, childFs, childPrefix, depth + 1, rawFiles);
      out.push(group);
    } else if (typeof childFs["type"] === "string") {
      // Leaf unit
      const outlets = (((childFs["boundary"] ?? {}) as JsonDict)["outlets"] ?? []) as JsonValue[];
      const unitGroup: TreeGroup = {
        kind: "group",
        label: childName,
        children: outlets.map((v) => {
          const port = String(v);
          return streamLeaf(`${childPrefix}.${port}`, "internal", port);
        }),
      };
      out.push(unitGroup);
    }
  }
}

function addUnitsGroup(out: TreeNode[], label: string, units: JsonValue[], prefix: string) {
  const group: TreeGroup = { kind: "group", label, children: [] };
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
    group.children.push(unitGroup);
  }
  out.push(group);
}

function collectFeedNames(fs: JsonDict): string[] {
  const streamsBlock = (fs["streams"] ?? {}) as JsonDict;
  const declared = Object.keys(streamsBlock);
  // The set of feeds is the streams BLOCK keys MINUS any name that appears
  // as a unit's output (which means it is internally produced).
  const produced = new Set<string>();
  for (const uv of (fs["units"] ?? []) as JsonValue[]) {
    if (!uv || typeof uv !== "object" || Array.isArray(uv)) continue;
    const u = uv as JsonDict;
    for (const ov of (u["outputs"] ?? []) as JsonValue[]) produced.add(String(ov));
  }
  return declared.filter((n) => !produced.has(n));
}

function readChildFlowsheet(
  rawFiles: Record<string, string>,
  childPrefix: string,
): JsonDict | null {
  const path = `${childPrefix}/system/flowsheetDict`;
  const text = rawFiles[path];
  if (!text) return null;
  try {
    return toJson(parse(text, { sourceName: path })) as JsonDict;
  } catch {
    return null;
  }
}

function streamLeaf(qname: string, role: TreeStream["role"], label?: string): TreeStream {
  return {
    kind: "stream",
    qname,
    role,
    label: label ?? leafName(qname),
  };
}
