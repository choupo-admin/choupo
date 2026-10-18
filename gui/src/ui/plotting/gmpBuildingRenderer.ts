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
  gmpBuildingRenderer -- the GMP interior drawn INTO the plot plan's scene
  (DEV.md 4c C97 phase B), through layoutRenderer's one hook
  (`MountOptions.extend`), with no React and no three.js import of its own:
  the classes come in on the hook's context, so the app's lazy chunk and the
  exported page's bundle both serve it.

  A CUTAWAY: each room a translucent box tinted by its grade, with no roof,
  its floor a stronger slab of the same tint (the slab is what the hover
  reads, so an item standing in the room keeps its own tooltip); an airlock's
  outline dashed and its label naming its role and regime; a room the engine
  named in a finding outlined in safety orange.  Each flow a thin rod from
  room to room through the middle of the shared wall, an arrowhead on every
  step pointing the way it goes, lifted by kind (case/gmpBuilding.ts
  FLOW_LOOK) -- waste in dashes.  `setFlows` and `setRooms` toggle them.
\*---------------------------------------------------------------------------*/

import type * as T3 from "three";

import type { FlowKind } from "../../adapters/buildingPayload.js";
import type { BuildingScene, SceneRoom } from "../../case/gmpBuilding.js";
import { LABEL_PRIORITY, type Vec3 } from "../../case/plantLayout.js";
import type { SceneExtension, SceneExtensionContext } from "./layoutRenderer.js";

const FLAG = 0xe8590c;
const ROD = 0.09;        // m, a flow's rod radius (drawing)
const HEAD = 0.45;       // m, an arrowhead's radius (drawing)
const DASH = [0.9, 0.6]; // m, a waste rod's dash and gap (drawing)

export interface BuildingView {
  extend: SceneExtension;
  setFlows(on: Record<FlowKind, boolean>): void;
  setRooms(on: boolean): void;
}

export function buildingView(bs: BuildingScene, initialFlows: Record<FlowKind, boolean>,
                             initialRooms = true): BuildingView {
  let flowsOn = { ...initialFlows };
  let roomsOn = initialRooms;
  let ctx: SceneExtensionContext | null = null;
  let roomGroup: T3.Group | null = null;
  let roomLabels: T3.Object3D[] = [];
  const flowGroups = new Map<FlowKind, T3.Group>();

  const apply = () => {
    if (roomGroup) roomGroup.visible = roomsOn;
    for (const l of roomLabels) l.visible = roomsOn;
    for (const [k, g] of flowGroups) g.visible = flowsOn[k];
    ctx?.redraw();
  };

  const extend: SceneExtension = (c) => {
    ctx = c;
    flowGroups.clear();
    roomLabels = [];
    const { THREE, world } = c;
    roomGroup = new THREE.Group();
    world.add(roomGroup);

    const boxEdges = (r: SceneRoom): T3.Vector3[] => {
      const [cx, cy, cz] = r.center;
      const [sx, sy, sz] = r.size;
      const x = [cx - sx / 2, cx + sx / 2], y = [cy - sy / 2, cy + sy / 2],
            z = [cz - sz / 2, cz + sz / 2];
      const v = (i: number, j: number, k: number) => new THREE.Vector3(x[i]!, y[j]!, z[k]!);
      const pts: T3.Vector3[] = [];
      for (const j of [0, 1]) for (const k of [0, 1]) pts.push(v(0, j, k), v(1, j, k));
      for (const i of [0, 1]) for (const k of [0, 1]) pts.push(v(i, 0, k), v(i, 1, k));
      for (const i of [0, 1]) for (const j of [0, 1]) pts.push(v(i, j, 0), v(i, j, 1));
      return pts;
    };

    for (const r of bs.rooms) {
      const walls = new THREE.Mesh(
        new THREE.BoxGeometry(r.size[0], r.size[1], r.size[2]),
        new THREE.MeshStandardMaterial({ color: r.colour, transparent: true,
          opacity: r.airlock ? 0.22 : 0.14, depthWrite: false, side: THREE.DoubleSide,
          roughness: 0.9, metalness: 0 }));
      walls.position.set(...r.center);
      walls.userData.noAO = true;
      roomGroup.add(walls);

      const slab = new THREE.Mesh(
        new THREE.BoxGeometry(r.size[0], 0.06, r.size[2]),
        new THREE.MeshStandardMaterial({ color: r.colour, transparent: true, opacity: 0.55,
          depthWrite: false, roughness: 0.95, metalness: 0 }));
      slab.position.set(r.center[0], r.center[1] - r.size[1] / 2 + 0.03, r.center[2]);
      slab.userData.tooltip = r.tooltip;
      slab.userData.noAO = true;
      roomGroup.add(slab);
      c.pickables.push(slab);

      const edges = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(boxEdges(r)),
        r.airlock
          ? new THREE.LineDashedMaterial({ color: r.flagged ? FLAG : r.colour,
              dashSize: 0.5, gapSize: 0.35 })
          : new THREE.LineBasicMaterial({ color: r.flagged ? FLAG : r.colour }));
      if (r.airlock) edges.computeLineDistances();
      roomGroup.add(edges);
      roomLabels.push(c.label(r.label, r.labelAt,
        r.flagged ? LABEL_PRIORITY.finding : LABEL_PRIORITY.item, r.flagged));
    }

    const up = new THREE.Vector3(0, 1, 0);
    const rod = (g: T3.Group, a: Vec3, b: Vec3, radius: number, mat: T3.Material) => {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
      const d = B.clone().sub(A);
      const len = d.length();
      if (len < 1e-6) return;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 8), mat);
      m.position.copy(A.clone().add(B).multiplyScalar(0.5));
      m.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(up, d.normalize()));
      m.userData.noAO = true;
      g.add(m);
    };
    for (const f of bs.flows) {
      let g = flowGroups.get(f.kind);
      if (!g) { g = new THREE.Group(); flowGroups.set(f.kind, g); world.add(g); }
      const mat = new THREE.MeshBasicMaterial({ color: f.broken ? FLAG : f.colour });
      const r0 = ROD * (f.weight > 1 ? 1.7 : 1);
      for (let i = 0; i + 1 < f.points.length; ++i) {
        const a = f.points[i]!, b = f.points[i + 1]!;
        if (f.dashed) {
          const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
          const len = A.distanceTo(B);
          for (let s = 0; s < len; s += DASH[0]! + DASH[1]!) {
            const e = Math.min(len, s + DASH[0]!);
            const p = A.clone().lerp(B, s / len), q = A.clone().lerp(B, e / len);
            rod(g, [p.x, p.y, p.z], [q.x, q.y, q.z], r0, mat);
          }
        } else rod(g, a, b, r0, mat);
        //  The arrowhead, at the segment's middle, pointing the flow's way.
        const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
        const d = B.clone().sub(A);
        if (d.length() > 1.2) {
          const head = new THREE.Mesh(new THREE.CylinderGeometry(0, HEAD, 1.1, 12), mat);
          head.position.copy(A.clone().add(B).multiplyScalar(0.5));
          head.quaternion.copy(new THREE.Quaternion().setFromUnitVectors(up, d.normalize()));
          head.userData.tooltip = [`${f.kind} flow "${f.name}"`,
            ...(f.broken ? ["⚠ a step of it crosses no declared door, stair or lift"] : [])];
          head.userData.noAO = true;
          g.add(head);
          c.pickables.push(head);
        }
      }
    }
    apply();
  };

  return {
    extend,
    setFlows(on) { flowsOn = { ...on }; apply(); },
    setRooms(on) { roomsOn = on; apply(); },
  };
}
