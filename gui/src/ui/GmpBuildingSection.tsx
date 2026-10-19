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
  GmpBuildingSection -- the GMP interior in Reports (DEV.md 4c C97 phase B).

  Shown under the plot plan when the case declares `building {}`: a legend
  (grades, airlocks, the three flow kinds), the 3D CUTAWAY -- the plot
  plan's own view (PlantLayout3D, through the renderer's one hook) with the
  rooms and flows drawn into it and a toggle per flow kind -- the 2D PLANS
  per floor as sheets a student can hand in (GmpPlanSheet.tsx, DEV.md 4c
  C103: zoning, pressure and one flow plan per kind, each with walls, doors,
  scale bar, north arrow, legend and title block, downloadable as SVG), the
  room schedule, and the engine's findings.  Every number is the engine's.
  `FloorPlanSvg` below is the compact one-drawing plan the GMP EduTool's
  exercises keep.

  The SAME section opens full-window in a tab of its own (DEV.md 4c C100):
  its "Open in new tab" writes the plot plan's own stash and opens
  `?layout=<key>&view=building` (case/layoutPopOut.ts), and that tab draws
  THIS component -- no second renderer.  In the tab the button is absent
  (no `onPopOut`) and the 3D cutaway is taller (`viewHeight`).
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import {
  Box, Button, Checkbox, Group, ScrollArea, Table, Text,
} from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";

import type { FlowKind, GmpBuilding } from "../adapters/buildingPayload.js";
import {
  buildingScene, FLOW_KINDS, FLOW_LOOK, GRADE_LOOK, GRADE_ORDER,
  withBuilding, type FloorPlan, type PlanItemSource,
} from "../case/gmpBuilding.js";
import type { LayoutScene } from "../case/plantLayout.js";
import { GmpPlanSheets } from "./GmpPlanSheet.js";
import { buildingView } from "./plotting/gmpBuildingRenderer.js";
import { PlantLayout3D } from "./plotting/PlantLayout3D.js";

export function GmpLegend({ building }: { building: GmpBuilding }) {
  const grades = GRADE_ORDER.filter((g) => building.rooms.some((r) => r.grade === g));
  return (
    <Box mb={6}>
      <Text size="xs" c="dimmed">
        Declared in <code>system/layoutDict</code>, <code>building {"{}"}</code>.  A room is
        tinted by its grade and labelled with its pressure to outside; an airlock has a
        dashed outline and names its role and regime; a room the engine named in a finding
        is outlined in orange with ⚠.  Cascade step declared: {building.minimumStep} Pa
        ({building.stepSource}).
      </Text>
      <Group gap="md" mt={4} wrap="wrap">
        {grades.map((g) => (
          <Group key={g} gap={4} wrap="nowrap">
            <span aria-hidden style={{ display: "inline-block", width: 12, height: 12,
              borderRadius: 2, background: GRADE_LOOK[g].css, opacity: 0.7 }} />
            <Text size="xs">{GRADE_LOOK[g].word}</Text>
          </Group>
        ))}
        {FLOW_KINDS.map((k) => (
          <Group key={k} gap={4} wrap="nowrap">
            <svg width={22} height={8} aria-hidden>
              <line x1={1} y1={4} x2={21} y2={4} stroke={FLOW_LOOK[k].css}
                strokeWidth={FLOW_LOOK[k].weight * 2}
                strokeDasharray={FLOW_LOOK[k].dashed ? "4 3" : undefined} />
            </svg>
            <Text size="xs">{FLOW_LOOK[k].word} flow</Text>
          </Group>
        ))}
      </Group>
    </Box>
  );
}

/** One floor's plan in SVG: metres as units, plan north up. */
export function FloorPlanSvg({ plan, flows }: { plan: FloorPlan; flows: Record<FlowKind, boolean> }) {
  const [x, y, w, h] = plan.viewBox;
  const font = Math.max(0.6, Math.min(w, h) / 32);
  return (
    <svg viewBox={`${x} ${y} ${w} ${h}`} role="img"
      aria-label={`Plan of floor ${plan.floor}`}
      style={{ width: "100%", maxHeight: 420, background: "light-dark(#fff, #1a1b1e)" }}>
      <defs>
        {FLOW_KINDS.map((k) => (
          <marker key={k} id={`gmp-arrow-${k}`} viewBox="0 0 10 10" refX={8} refY={5}
            markerWidth={5} markerHeight={5} orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={FLOW_LOOK[k].css} />
          </marker>
        ))}
      </defs>
      {plan.rooms.map((r) => (
        <g key={r.name}>
          <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} fillOpacity={0.28}
            stroke={r.flagged ? "#e8590c" : r.fill} strokeWidth={r.flagged ? font / 4 : font / 8}
            strokeDasharray={r.airlock ? `${font / 2} ${font / 3}` : undefined} />
          {r.containment && (
            <rect x={r.x + font / 3} y={r.y + font / 3} width={r.w - (2 * font) / 3}
              height={r.h - (2 * font) / 3} fill="none" stroke={r.fill} strokeWidth={font / 10} />
          )}
          {(() => {
            //  The label sits at the TOP of the room (the flows cross its
            //  middle), shrunk to the room's width where it is narrow.
            const longest = Math.max(...r.lines.map((t) => t.length), 1);
            const f = Math.min(font, (0.95 * r.w) / (0.58 * longest));
            return r.lines.map((t, i) => (
              <text key={i} x={r.x + r.w / 2} y={r.y + f * (1.25 + 1.15 * i)}
                fontSize={f} textAnchor="middle" fill="currentColor">{t}</text>
            ));
          })()}
        </g>
      ))}
      {plan.items.map((it) => (
        <g key={`item-${it.id}`}>
          <title>{`${it.id} -- in room ${it.room}`}</title>
          {it.circle
            ? <circle cx={it.x + it.w / 2} cy={it.y + it.h / 2} r={it.w / 2}
                fill="#495057" fillOpacity={0.55} stroke="#212529" strokeWidth={font / 10} />
            : <rect x={it.x} y={it.y} width={it.w} height={it.h}
                fill="#495057" fillOpacity={0.55} stroke="#212529" strokeWidth={font / 10} />}
          <text x={it.x + it.w / 2} y={it.y + it.h + font * 0.8} fontSize={font * 0.6}
            textAnchor="middle" fill="currentColor">{it.id}</text>
        </g>
      ))}
      {plan.flows.filter((f) => flows[f.kind]).map((f, i) => (
        <polyline key={`${f.name}-${i}`} fill="none" stroke={f.css}
          strokeWidth={(font / 6) * f.weight}
          strokeDasharray={f.dashed ? `${font / 1.5} ${font / 2.5}` : undefined}
          markerMid={`url(#gmp-arrow-${f.kind})`} markerEnd={`url(#gmp-arrow-${f.kind})`}
          points={f.points.map(([px, py]) => `${px},${py}`).join(" ")} />
      ))}
    </svg>
  );
}

/** The toggles that drive a building drawn into a plot-plan view: the rooms
 *  and one per flow kind the building declares.  Plain props, so a test can
 *  render it (DEV.md 4c C100). */
export function BuildingToggles({ building, rooms, flows, onRooms, onFlows }: {
  building: GmpBuilding; rooms: boolean; flows: Record<FlowKind, boolean>;
  onRooms(on: boolean): void; onFlows(next: Record<FlowKind, boolean>): void;
}) {
  const present = new Set(building.flows.map((f) => f.kind));
  return (
    <>
      <Checkbox size="xs" label="Rooms" checked={rooms}
        title="The building's interior: its rooms, tinted by grade (and the equipment they hold)"
        onChange={(e) => onRooms(e.currentTarget.checked)} />
      {FLOW_KINDS.filter((k) => present.has(k)).map((k) => (
        <Checkbox key={k} size="xs" label={k[0]!.toUpperCase() + k.slice(1)} checked={flows[k]}
          onChange={(e) => onFlows({ ...flows, [k]: e.currentTarget.checked })} />
      ))}
    </>
  );
}

/** THE GMP INTERIOR IN A PLOT-PLAN VIEW -- one implementation, two callers
 *  (DEV.md 4c C100): the main plot plan in Reports and the GMP section
 *  below it.  Returns the scene with the building's shell drawn as GLASS
 *  (`withBuilding`; a finding on the shell is its outline and label, never
 *  an opaque fill -- `partMaterialKey`), the renderer's one hook drawing the
 *  rooms and flows into it, and the toggles for its toolbar, all ON.  With
 *  no building, the scene unchanged and no hook. */
export function useBuildingOverlay(building: GmpBuilding | undefined, scene: LayoutScene) {
  const bs = useMemo(() => (building ? buildingScene(building) : null), [building]);
  const shown = useMemo(() => (bs ? withBuilding(scene, bs) : scene), [scene, bs]);
  const [flows, setFlows] = useState<Record<FlowKind, boolean>>(
    { personnel: true, material: true, waste: true });
  const [rooms, setRooms] = useState(true);
  //  One view per scene; its toggles are pushed to it, never a re-mount.
  const view = useMemo(() => (bs ? buildingView(bs, flows, rooms) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bs]);
  const toggles = building && view ? (
    <BuildingToggles building={building} rooms={rooms} flows={flows}
      onRooms={(on) => { setRooms(on); view.setRooms(on); }}
      onFlows={(next) => { setFlows(next); view.setFlows(next); }} />
  ) : null;
  return { shown, extend: view?.extend, toggles, flows };
}

export function GmpBuildingSection({ building, scene, items = [], caseName = "", onPopOut,
                                    viewHeight }: {
  building: GmpBuilding; scene: LayoutScene;
  /** The plot plan's placed items: the ones a room lists are drawn on its
   *  floor's plan (DEV.md 4c C100). */
  items?: PlanItemSource[];
  /** The case's name, for the plans' title block (DEV.md 4c C103). */
  caseName?: string;
  /** Open this section full-window in a tab of its own; absent, no button
   *  (the tab itself draws the section without one). */
  onPopOut?: () => void;
  /** The 3D cutaway's height in pixels (the view's own default when absent). */
  viewHeight?: number;
}) {
  const { shown, extend, toggles } = useBuildingOverlay(building, scene);

  return (
    <Box mt="md" data-gmp-building>
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
        <Text size="sm" fw={600}>GMP interior -- {building.name}</Text>
        {onPopOut && (
          <Button size="compact-xs" variant="default" style={{ flex: "0 0 auto" }}
            leftSection={<IconExternalLink size={13} />}
            title="Open the GMP building (cutaway, plans per floor, room schedule, findings) full-window in a new browser tab"
            onClick={onPopOut}>
            Open in new tab
          </Button>
        )}
      </Group>
      <Text size="xs" c="dimmed" mb={4}>
        {building.rooms.length} rooms on {building.floors.length} floor(s),{" "}
        {Number(building.floorArea.toFixed(1))} m²; {building.findings.length} finding(s).
        {" "}{building.reason}
      </Text>
      <GmpLegend building={building} />
      <PlantLayout3D scene={shown} height={viewHeight} extend={extend} toolbarExtra={toggles} />
      {/* The plans per floor (zoning, pressure, one per flow kind) and the
          room schedule -- the sheets a student hands in (DEV.md 4c C103). */}
      <Box mt="sm">
        <GmpPlanSheets building={building} items={items} caseName={caseName} />
      </Box>
      <Text size="sm" fw={600} mt="sm">Findings</Text>
      {building.findings.length === 0
        ? <Text size="xs" c="dimmed">The engine raised none on this building.</Text>
        : (
          <ScrollArea>
            <Table striped withTableBorder fz="xs">
              <Table.Thead>
                <Table.Tr><Table.Th>kind</Table.Th><Table.Th>what the engine said</Table.Th></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {building.findings.map((f) => (
                  <Table.Tr key={f.id}>
                    <Table.Td>{f.kind}</Table.Td><Table.Td>{f.message}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        )}
    </Box>
  );
}
