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
  surface.  Every number is the engine's: positions, extents, the measured
  and the declared distance of every finding.  The tables repeat what the
  3D view draws so a reader without WebGL loses nothing.
\*---------------------------------------------------------------------------*/

import { ScrollArea, Table, Text } from "@mantine/core";

import type { PlantLayout } from "../adapters/SolverAdapter.js";

/** How to read the 3D view (shapes, zones, controls). */
export function PlantLayoutLegend() {
  return (
    <Text size="xs" c="dimmed" mb={6}>
      Declared in <code>system/layoutDict</code>.  Cylinders are items whose sizer published a
      diameter and a length; boxes are footprints the case declared.  Translucent cylinders
      are the declared hazardous-area zones (zone 0 densest and solid-edged, zone 1 wire,
      zone 2 faint and dashed).  Drag to orbit, right-drag to pan, wheel to zoom.
    </Text>
  );
}

/** The findings, the placed items and the notes on what was not placed. */
export function PlantLayoutTables({ layout }: { layout: PlantLayout }) {
  const f2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : "?");
  return (
    <>
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
