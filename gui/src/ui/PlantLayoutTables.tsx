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
  PlantLayoutTables -- the engine's layout block as tables, and the legend
  that says how the 3D view reads (DEV.md 4c C75, C78).

  Two surfaces draw the same block: the Reports section "Plant layout (3D)"
  and its pop-out tab (`?layout=`).  Both draw these tables beside the same
  PlantLayout3D, so the tables have ONE home here rather than one copy per
  surface -- the PIPE REGISTER (DEV.md 4c C80) included: one row per pipe
  the engine routed, its two ends, its phase, the stream's T, P and mass
  flow, and the engine's own length, then every stream it did not route,
  with the engine's reason.  Every number is the engine's: positions, extents, the measured
  and the declared distance of every finding.  The tables repeat what the
  3D view draws so a reader without WebGL loses nothing.
\*---------------------------------------------------------------------------*/

//  SECTIONS (DEV.md 4c C91).  With `sectioned`, each table sits under a
//  heading the reader folds and unfolds, remembered per browser
//  (case/layoutPanels.ts, keys in state/prefs.ts); the `?layout=` tab draws
//  them so.  Reports keeps the plain stack.
//
//  The words and cells come from case/layoutTables.ts (pure, since C81): the
//  page "Export as page" writes draws the SAME rows, so what a student shares
//  is what they saw.  This file only lays them out.

import type { ReactNode } from "react";
import { Box, Group, ScrollArea, Table, Text, UnstyledButton } from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";

import type { PlantLayout } from "../adapters/SolverAdapter.js";
import { phaseCss, PHASE_WORDS } from "../case/plantLayout.js";
import {
  FINDINGS_CAPTION, findingRows, itemRows, layoutNotes, LEGEND_CONTROLS, LEGEND_PHASES,
  LEGEND_PIPES, LEGEND_SHAPES, PARTICLE_WORD, PIPE_REGISTER_CAPTION, pipeRegister,
  PLOT_CAPTION, plotSummary, ROADS_CAPTION, roadSummary,
} from "../case/layoutTables.js";
import { layoutSection, type LayoutSectionId } from "../case/layoutPanels.js";
import { useCollapsedFlag } from "./methods/methodsChrome.js";

/** One collapsible section (C91): a heading the reader clicks, its fold
 *  remembered in this browser.  A folded body is NOT rendered (not merely
 *  hidden), so nothing in it can be tabbed into. */
export function LayoutSectionBox({ id, children, extra }: {
  id: LayoutSectionId; children: ReactNode; extra?: string;
}) {
  const s = layoutSection(id);
  const { collapsed, toggle } = useCollapsedFlag(s.key, s.defaultCollapsed);
  const Icon = collapsed ? IconChevronRight : IconChevronDown;
  return (
    <Box mt={6} data-layout-section={id}>
      <UnstyledButton onClick={toggle} aria-expanded={!collapsed}
        style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <Icon size={14} color="var(--mantine-color-dimmed)" />
        <Text size="sm" fw={600}>{s.title}</Text>
        {extra && <Text size="xs" c="dimmed">· {extra}</Text>}
      </UnstyledButton>
      {!collapsed && children}
    </Box>
  );
}

/** How to read the 3D view (shapes, zones, pipes, controls). */
export function PlantLayoutLegend({ pipes = false }: { pipes?: boolean }) {
  return (
    <Box mb={6}>
      <Text size="xs" c="dimmed">
        Declared in <code>system/layoutDict</code>.  {LEGEND_SHAPES}  {LEGEND_CONTROLS}
      </Text>
      {pipes && (
        <>
          <Group gap="md" mt={4} wrap="wrap">
            {LEGEND_PHASES.map((ph) => (
              <Group key={ph} gap={4} wrap="nowrap">
                <span aria-hidden style={{ display: "inline-block", width: 14, height: 6,
                  borderRadius: 3, background: phaseCss(ph) }} />
                <Text size="xs">{PHASE_WORDS[ph]}: {PARTICLE_WORD[ph]}</Text>
              </Group>
            ))}
          </Group>
          <Text size="xs" c="dimmed" mt={2}>{LEGEND_PIPES}</Text>
        </>
      )}
    </Box>
  );
}

/** The pipe register: one row per pipe the engine routed, then what it did
 *  not route and why.  Every number is the engine's (the stream table's
 *  T, P and mass flow; the route's own length). */
export function PipeRegister({ layout }: { layout: PlantLayout }) {
  const reg = pipeRegister(layout);
  if (!reg) return null;
  return (
    <>
      <ScrollArea type="auto" mt="xs">
        <Table striped withTableBorder fz="xs" ff="monospace" miw={860} captionSide="top">
          <Table.Caption style={{ textAlign: "left" }}>
            {PIPE_REGISTER_CAPTION}{reg.rack ? ` ${reg.rack}` : ""}
          </Table.Caption>
          <Table.Thead><Table.Tr>
            <Table.Th>Stream</Table.Th>
            <Table.Th>From → to</Table.Th>
            <Table.Th>Phase</Table.Th>
            <Table.Th ta="right">T (K)</Table.Th>
            <Table.Th ta="right">P (bar)</Table.Th>
            <Table.Th ta="right">Flow (kg/s)</Table.Th>
            <Table.Th ta="right">Length (m)</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {reg.rows.map((r) => (
              <Table.Tr key={r.stream}>
                <Table.Td>{r.stream}</Table.Td>
                <Table.Td>{r.ends}</Table.Td>
                <Table.Td>
                  <span aria-hidden style={{ display: "inline-block", width: 10, height: 6,
                    borderRadius: 3, marginRight: 4, background: phaseCss(r.phase) }} />
                  {r.phaseWord}
                </Table.Td>
                <Table.Td ta="right">{r.T}</Table.Td>
                <Table.Td ta="right">{r.P}</Table.Td>
                <Table.Td ta="right">{r.flow}</Table.Td>
                <Table.Td ta="right">{r.length}</Table.Td>
              </Table.Tr>
            ))}
            {reg.total && (
              <Table.Tr>
                <Table.Td colSpan={6} ta="right">{reg.total.label}</Table.Td>
                <Table.Td ta="right">{reg.total.length}</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      {reg.notRouted.length > 0 && (
        <Text size="xs" c="dimmed" mt={4} component="div">
          Not routed (the engine&apos;s reasons):
          <ul style={{ margin: "2px 0 0 18px", padding: 0 }}>
            {reg.notRouted.map((n) => <li key={n.stream}><code>{n.stream}</code>: {n.reason}</li>)}
          </ul>
        </Text>
      )}
    </>
  );
}

/** THE PLOT (DEV.md 4c C82): the engine's area, its footprints' share, the
 *  margin and whose it is, the rule quoted, and one row per sector. */
export function PlotArea({ layout }: { layout: PlantLayout }) {
  const v = plotSummary(layout);
  if (!v) return null;
  return (
    <Box mt="xs">
      <Text size="sm">{v.headline}</Text>
      <Text size="xs" c="dimmed">{v.margin}</Text>
      {v.notes.map((n) => <Text key={n} size="xs" c="dimmed">{n}</Text>)}
      <Text size="xs" c="dimmed">{v.rule}</Text>
      {v.sectors.length > 0 && (
        <ScrollArea type="auto" mt={4}>
          <Table striped withTableBorder fz="xs" ff="monospace" miw={520} captionSide="top">
            <Table.Caption style={{ textAlign: "left" }}>{PLOT_CAPTION}</Table.Caption>
            <Table.Thead><Table.Tr>
              <Table.Th>Sector</Table.Th>
              <Table.Th>Area from</Table.Th>
              <Table.Th ta="right">Plot (m²)</Table.Th>
              <Table.Th ta="right">Footprints (m²)</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              {v.sectors.map((s) => (
                <Table.Tr key={s.sector}>
                  <Table.Td>{s.sector}</Table.Td>
                  <Table.Td>{s.from}</Table.Td>
                  <Table.Td ta="right">{s.plotArea}</Table.Td>
                  <Table.Td ta="right">{s.footprintArea}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
    </Box>
  );
}

/** THE ROADS (DEV.md 4c C90): the engine's totals, the case's headroom and
 *  access distance, and one row per road. */
export function RoadNetwork({ layout }: { layout: PlantLayout }) {
  const v = roadSummary(layout);
  if (!v) return null;
  return (
    <Box mt="xs">
      <Text size="sm">{v.headline}</Text>
      {v.notes.map((n) => <Text key={n} size="xs" c="dimmed">{n}</Text>)}
      <ScrollArea type="auto" mt={4}>
        <Table striped withTableBorder fz="xs" miw={640} captionSide="top">
          <Table.Caption style={{ textAlign: "left" }}>{ROADS_CAPTION}</Table.Caption>
          <Table.Thead><Table.Tr>
            <Table.Th>Road</Table.Th>
            <Table.Th ta="right">Width (m)</Table.Th>
            <Table.Th ta="right">Length (m)</Table.Th>
            <Table.Th>A gate reaches it</Table.Th>
            <Table.Th>Why (the case's)</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {v.rows.map((r) => (
              <Table.Tr key={r.road}>
                <Table.Td ff="monospace">{r.road}</Table.Td>
                <Table.Td ta="right" ff="monospace">{r.width}</Table.Td>
                <Table.Td ta="right" ff="monospace">{r.length}</Table.Td>
                <Table.Td>{r.reached}</Table.Td>
                <Table.Td>{r.reason}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Box>
  );
}

/** The plot, the roads, the findings, the pipe register, the placed items
 *  and the notes on what was not placed.  `sectioned` (C91): each under a
 *  heading the reader folds. */
export function PlantLayoutTables({ layout, sectioned = false }: {
  layout: PlantLayout; sectioned?: boolean;
}) {
  const findings = findingRows(layout);
  const notes = layoutNotes(layout);
  const wrap = (id: LayoutSectionId, show: boolean, node: ReactNode, extra?: string) =>
    !show ? null : sectioned ? <LayoutSectionBox id={id} extra={extra}>{node}</LayoutSectionBox>
      : node;
  const findingsTable = findings.length > 0 && (
        <ScrollArea type="auto" mt="xs">
          <Table striped withTableBorder fz="xs" miw={760} captionSide="top">
            <Table.Caption style={{ textAlign: "left" }}>{FINDINGS_CAPTION}</Table.Caption>
            <Table.Thead><Table.Tr>
              <Table.Th>Finding</Table.Th>
              <Table.Th ta="right">Measured (m)</Table.Th>
              <Table.Th ta="right">Declared (m)</Table.Th>
              <Table.Th>What the engine said</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              {findings.map((f, i) => (
                <Table.Tr key={layout.findings[i]!.id}>
                  <Table.Td ff="monospace">{f.kind}</Table.Td>
                  <Table.Td ta="right" ff="monospace">{f.measured}</Table.Td>
                  <Table.Td ta="right" ff="monospace">{f.declared}</Table.Td>
                  <Table.Td>{f.message}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
  );
  const itemsTable = (
    <>
      <ScrollArea type="auto" mt="xs">
        <Table striped withTableBorder fz="xs" ff="monospace" miw={760}>
          <Table.Thead><Table.Tr>
            <Table.Th>Item</Table.Th>
            <Table.Th>Kind</Table.Th>
            <Table.Th>Sector</Table.Th>
            <Table.Th>Shape</Table.Th>
            <Table.Th ta="right">x, y, z (m)</Table.Th>
            <Table.Th ta="right">extents (m)</Table.Th>
            <Table.Th>Size from</Table.Th>
            <Table.Th>Hazard</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {itemRows(layout).map((r) => (
              <Table.Tr key={r.id}>
                <Table.Td>{r.id}</Table.Td>
                <Table.Td>{r.kind}</Table.Td>
                <Table.Td>{r.sector}</Table.Td>
                <Table.Td>{r.shape}</Table.Td>
                <Table.Td ta="right">{r.position}</Table.Td>
                <Table.Td ta="right">{r.extents}</Table.Td>
                <Table.Td>{r.sizeFrom}</Table.Td>
                <Table.Td>{r.hazard}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      {(notes.unplaced || notes.internal) && (
        <Text size="xs" c="dimmed" mt={4}>
          {notes.unplaced && <>{notes.unplaced}  </>}
          {notes.internal}
        </Text>
      )}
      {notes.sources && <Text size="xs" c="dimmed" mt={4}>{notes.sources}</Text>}
    </>
  );
  const nPipes = layout.pipes?.length ?? 0;
  return (
    <>
      {wrap("plot", !!layout.plot, <PlotArea layout={layout} />,
            layout.plot ? `${layout.plot.plotArea.toFixed(0)} m²` : undefined)}
      {wrap("roads", !!layout.roadNetwork, <RoadNetwork layout={layout} />,
            layout.roadNetwork ? `${layout.roadNetwork.length.toFixed(0)} m,`
              + ` ${layout.roadNetwork.pavedArea.toFixed(0)} m² paved` : undefined)}
      {wrap("findings", !!findingsTable, findingsTable, `${findings.length}`)}
      {wrap("pipes", nPipes > 0 || (layout.notRouted?.length ?? 0) > 0,
            <PipeRegister layout={layout} />, `${nPipes} routed`)}
      {wrap("items", true, itemsTable, `${layout.items.length} placed`)}
    </>
  );
}
