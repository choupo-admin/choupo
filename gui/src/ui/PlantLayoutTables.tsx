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

import { Box, Group, ScrollArea, Table, Text } from "@mantine/core";

import type { PlantLayout } from "../adapters/SolverAdapter.js";
import { endName, phaseCss, PHASE_WORDS, phaseOf, SPEED_RULE, type Phase } from "../case/plantLayout.js";

/** The particle each phase carries, as a word for the legend. */
const PARTICLE_WORD: Record<Phase, string> = {
  liquid: "spheres", vapour: "octahedra", twoPhase: "spheres and octahedra", unknown: "cubes",
};

/** How to read the 3D view (shapes, zones, pipes, controls). */
export function PlantLayoutLegend({ pipes = false }: { pipes?: boolean }) {
  return (
    <Box mb={6}>
      <Text size="xs" c="dimmed">
        Declared in <code>system/layoutDict</code>.  Cylinders are items whose sizer published a
        diameter and a length; boxes are footprints the case declared.  Translucent cylinders
        are the declared hazardous-area zones (zone 0 densest and solid-edged, zone 1 wire,
        zone 2 faint and dashed).  A label is the item id (⚠ marks an item the engine named in
        a finding); hover an item or a pipe for the rest.  Drag to orbit, right-drag to pan,
        wheel to zoom; Fit frames the plant again.
      </Text>
      {pipes && (
        <>
          <Group gap="md" mt={4} wrap="wrap">
            {(["liquid", "vapour", "twoPhase"] as Phase[]).map((ph) => (
              <Group key={ph} gap={4} wrap="nowrap">
                <span aria-hidden style={{ display: "inline-block", width: 14, height: 6,
                  borderRadius: 3, background: phaseCss(ph) }} />
                <Text size="xs">{PHASE_WORDS[ph]}: {PARTICLE_WORD[ph]}</Text>
              </Group>
            ))}
          </Group>
          <Text size="xs" c="dimmed" mt={2}>
            Pipes are routed and measured by the engine (up to the rack, along it, down), and
            the particles move in the direction of flow; {SPEED_RULE}.  The Flow box stops them.
          </Text>
        </>
      )}
    </Box>
  );
}

/** The pipe register: one row per pipe the engine routed, then what it did
 *  not route and why.  Every number is the engine's (the stream table's
 *  T, P and mass flow; the route's own length). */
export function PipeRegister({ layout }: { layout: PlantLayout }) {
  const pipes = layout.pipes ?? [];
  const notRouted = layout.notRouted ?? [];
  if (pipes.length === 0 && notRouted.length === 0) return null;
  const fx = (v: number | undefined, d: number) =>
    v === undefined || !Number.isFinite(v) ? "" : v.toFixed(d);
  const total = pipes.reduce((a, p) => a + p.length, 0);
  const k = layout.pipeRack;
  return (
    <>
      <ScrollArea type="auto" mt="xs">
        <Table striped withTableBorder fz="xs" ff="monospace" miw={860} captionSide="top">
          <Table.Caption style={{ textAlign: "left" }}>
            Pipe register: routed and measured by the engine; no pressure drop and no cost
            yet (the next slice).
            {k && (k.declared
              ? <> Rack declared by the case at y = {k.y.toFixed(1)} m, {k.elevation.toFixed(1)} m up.</>
              : <> No rack declared: the engine&apos;s stated default at y = {k.y.toFixed(1)} m,
                  {" "}{k.elevation.toFixed(1)} m up.</>)}
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
            {pipes.map((p) => {
              const ph = phaseOf(p.vf);
              return (
                <Table.Tr key={p.stream}>
                  <Table.Td>{p.label ? `${p.stream} (${p.label})` : p.stream}</Table.Td>
                  <Table.Td>{endName(p.fromKind, p.from)} → {endName(p.toKind, p.to)}</Table.Td>
                  <Table.Td>
                    <span aria-hidden style={{ display: "inline-block", width: 10, height: 6,
                      borderRadius: 3, marginRight: 4, background: phaseCss(ph) }} />
                    {PHASE_WORDS[ph]}
                  </Table.Td>
                  <Table.Td ta="right">{fx(p.T, 1)}</Table.Td>
                  <Table.Td ta="right">{p.P === undefined ? "" : fx(p.P / 1e5, 2)}</Table.Td>
                  <Table.Td ta="right">{p.F_mass === undefined ? "" : p.F_mass.toPrecision(4)}</Table.Td>
                  <Table.Td ta="right">
                    {p.length.toFixed(1)}{p.routedBy === "waypoints" ? " (declared route)" : ""}
                  </Table.Td>
                </Table.Tr>
              );
            })}
            {pipes.length > 0 && (
              <Table.Tr>
                <Table.Td colSpan={6} ta="right">{pipes.length} pipes, in all</Table.Td>
                <Table.Td ta="right">{total.toFixed(1)}</Table.Td>
              </Table.Tr>
            )}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      {notRouted.length > 0 && (
        <Text size="xs" c="dimmed" mt={4} component="div">
          Not routed (the engine&apos;s reasons):
          <ul style={{ margin: "2px 0 0 18px", padding: 0 }}>
            {notRouted.map((n) => <li key={n.stream}><code>{n.stream}</code>: {n.reason}</li>)}
          </ul>
        </Text>
      )}
    </>
  );
}

/** The findings, the placed items and the notes on what was not placed. */
export function PlantLayoutTables({ layout }: { layout: PlantLayout }) {
  const f2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : "?");
  return (
    <>
      <PipeRegister layout={layout} />
      {layout.findings.length > 0 && (
        <ScrollArea type="auto" mt="xs">
          <Table striped withTableBorder fz="xs" miw={760} captionSide="top">
            <Table.Caption style={{ textAlign: "left" }}>
              Findings -- announced by the engine, never refused: a layout that is too close
              is a draft the student must see and defend.
            </Table.Caption>
            <Table.Thead><Table.Tr>
              <Table.Th>Finding</Table.Th>
              <Table.Th ta="right">Measured (m)</Table.Th>
              <Table.Th ta="right">Declared (m)</Table.Th>
              <Table.Th>What the engine said</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody>
              {layout.findings.map((f) => (
                <Table.Tr key={f.id}>
                  <Table.Td ff="monospace">{f.kind}</Table.Td>
                  <Table.Td ta="right" ff="monospace">{f.kind === "outsideArea" || f.kind === "deadRule" || f.kind === "sizingRefused" ? "" : f2(f.value)}</Table.Td>
                  <Table.Td ta="right" ff="monospace">{f.kind === "outsideArea" || f.kind === "sizingRefused" ? "" : f2(f.limit)}</Table.Td>
                  <Table.Td>{f.message}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}
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
            {layout.items.map((i) => (
              <Table.Tr key={i.id}>
                <Table.Td>{i.id}</Table.Td>
                <Table.Td>{i.nonProcess ? `${i.kind} (non-process)` : i.kind}</Table.Td>
                <Table.Td>{i.sector}</Table.Td>
                <Table.Td>{i.shape} {i.orientation}</Table.Td>
                <Table.Td ta="right">{f2(i.x)}, {f2(i.y)}, {f2(i.z)}</Table.Td>
                <Table.Td ta="right">{f2(i.dx)} x {f2(i.dy)} x {f2(i.dz)}</Table.Td>
                <Table.Td>{i.footprintFrom === "published" ? "its own sizing" : "declared"}</Table.Td>
                <Table.Td>
                  {[i.release ? `release (zones ${i.release.zones.map((z) => z.zone).join(", ") || "none"})` : "",
                    i.ignition ? "ignition" : ""].filter(Boolean).join("; ")}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      {(layout.unplaced.length > 0 || layout.internal.length > 0) && (
        <Text size="xs" c="dimmed" mt={4}>
          {layout.unplaced.length > 0 && <>Sized but not placed: {layout.unplaced.join(", ")}.  </>}
          {layout.internal.length > 0 && <>Inside or on another item, never placed alone: {layout.internal.join(", ")}.</>}
        </Text>
      )}
      {layout.separation.length > 0 && (
        <Text size="xs" c="dimmed" mt={4}>
          Separation distances are the case's own
          ({layout.separation.map((t) => t.source).join("; ")}).
          {layout.wind && <>  Wind: {layout.wind.source}.</>}
        </Text>
      )}
    </>
  );
}
