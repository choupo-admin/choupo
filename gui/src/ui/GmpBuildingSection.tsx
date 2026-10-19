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
  rooms and flows drawn into it and a toggle per flow kind -- a 2D PLAN per
  floor in SVG (which needs no WebGL and prints), and the room schedule and
  the engine's findings as tables.  Every number is the engine's.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import { Box, Checkbox, Group, ScrollArea, SegmentedControl, Table, Text } from "@mantine/core";

import type { FlowKind, GmpBuilding } from "../adapters/buildingPayload.js";
import {
  buildingScene, floorPlans, FLOW_KINDS, FLOW_LOOK, GRADE_LOOK, GRADE_ORDER, ROLE_WORD,
  withBuilding, type FloorPlan, type PlanItemSource,
} from "../case/gmpBuilding.js";
import type { LayoutScene } from "../case/plantLayout.js";
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

export function GmpBuildingSection({ building, scene, items = [] }: {
  building: GmpBuilding; scene: LayoutScene;
  /** The plot plan's placed items: the ones a room lists are drawn on its
   *  floor's plan (DEV.md 4c C100). */
  items?: PlanItemSource[];
}) {
  const bs = useMemo(() => buildingScene(building), [building]);
  const plans = useMemo(() => floorPlans(building, items), [building, items]);
  const shown = useMemo(() => withBuilding(scene, bs), [scene, bs]);
  const [flows, setFlows] = useState<Record<FlowKind, boolean>>(
    { personnel: true, material: true, waste: true });
  const [rooms, setRooms] = useState(true);
  //  One view per scene; its toggles are pushed to it, never a re-mount.
  const view = useMemo(() => buildingView(bs, flows, rooms),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bs]);
  const [floor, setFloor] = useState(plans[0]?.floor ?? "");
  const plan = plans.find((p) => p.floor === floor) ?? plans[0];
  const present = new Set(building.flows.map((f) => f.kind));

  const toggles = (
    <>
      <Checkbox size="xs" label="Rooms" checked={rooms}
        onChange={(e) => { const on = e.currentTarget.checked; setRooms(on); view.setRooms(on); }} />
      {FLOW_KINDS.filter((k) => present.has(k)).map((k) => (
        <Checkbox key={k} size="xs" label={k[0]!.toUpperCase() + k.slice(1)} checked={flows[k]}
          onChange={(e) => {
            const next = { ...flows, [k]: e.currentTarget.checked };
            setFlows(next);
            view.setFlows(next);
          }} />
      ))}
    </>
  );

  return (
    <Box mt="md" data-gmp-building>
      <Text size="sm" fw={600}>GMP interior -- {building.name}</Text>
      <Text size="xs" c="dimmed" mb={4}>
        {building.rooms.length} rooms on {building.floors.length} floor(s),{" "}
        {Number(building.floorArea.toFixed(1))} m²; {building.findings.length} finding(s).
        {" "}{building.reason}
      </Text>
      <GmpLegend building={building} />
      <PlantLayout3D scene={shown} extend={view.extend} toolbarExtra={toggles} />
      {plan && (
        <Box mt="sm">
          <Group gap="sm" mb={4}>
            <Text size="sm" fw={600}>Plan</Text>
            {plans.length > 1 && (
              <SegmentedControl size="xs" value={plan.floor} onChange={setFloor}
                data={plans.map((p) => ({ value: p.floor, label: `${p.floor} (${p.elevation} m)` }))} />
            )}
          </Group>
          <FloorPlanSvg plan={plan} flows={flows} />
        </Box>
      )}
      <Text size="sm" fw={600} mt="sm">Room schedule</Text>
      <ScrollArea>
        <Table striped withTableBorder fz="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>room</Table.Th><Table.Th>floor</Table.Th><Table.Th>role</Table.Th>
              <Table.Th>grade</Table.Th><Table.Th>p to outside [Pa]</Table.Th>
              <Table.Th>declared</Table.Th><Table.Th>area [m²]</Table.Th>
              <Table.Th>notes</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {building.rooms.map((r) => (
              <Table.Tr key={r.name}>
                <Table.Td>{r.name}</Table.Td><Table.Td>{r.floor}</Table.Td>
                <Table.Td>{ROLE_WORD[r.role]}{r.regime ? ` (${r.regime})` : ""}</Table.Td>
                <Table.Td>{r.grade}</Table.Td><Table.Td>{r.pressureToOutside}</Table.Td>
                <Table.Td>{r.pressure} vs {r.relativeTo}</Table.Td>
                <Table.Td>{Number(r.area.toFixed(2))}</Table.Td>
                <Table.Td>{[r.containment ? "containment" : "",
                            r.atexZone !== undefined ? `zone ${r.atexZone}` : "",
                            r.ignition ? `ignition: ${r.ignition}` : "",
                            r.equipment.join(", ")].filter(Boolean).join("; ")}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
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
