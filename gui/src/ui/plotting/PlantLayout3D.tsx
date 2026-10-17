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
  PlantLayout3D -- the plot plan the case declared, drawn in 3D (DEV.md 4c
  C75, C78, C80).

  Draws a `LayoutScene` (case/plantLayout.ts, pure and tested) with three.js
  and nothing else: no position, footprint, route, length or distance is
  computed here.  three.js is loaded on demand, the first time a layout is
  shown, so a case without one never downloads it.  Orbit with the left
  button, pan with the right, zoom with the wheel.  The SAME component draws
  Reports -> "Plant layout (3D)", the `?layout=` pop-out and the EduTool
  bench, so all three get every change.

  WHAT IS DRAWN.  Every placed item at its extents: a cylinder where the
  engine says the item is one, a box otherwise.  Sector areas as outlined
  rectangles on the ground.  Hazardous-area zones as translucent cylinders
  whose zones differ by opacity AND edge style AND the word in their label
  (zone labels OFF by default: they are the first thing to crowd a plant).
  An item the engine named in a finding is outlined thick and its label
  carries a warning glyph; a separation shortfall is a dashed line tagged
  with both distances.  The wind is an arrow pointing where it blows.

  THE PIPES (C80): each published route as a translucent tube coloured by
  phase, the rack the engine routed on, the junctions on it, and an ANIMATED
  stylised flow: particles moving along the route in the direction of flow,
  SHAPED by phase (sphere liquid, octahedron vapour, the two alternating in
  a two-phase pipe -- the channel that survives greyscale), at a speed that
  is a stated monotone function of the published mass flow.  The Flow toggle
  stops them; a reader whose system asks for reduced motion starts with it
  off.

  LEGIBILITY.  A label is the item id; the rest is the hover TOOLTIP.  Labels
  that collide on screen are decluttered every frame by priority (findings,
  then items, then the rest, then zone labels).  The camera opens FITTED on
  the plant; Fit returns to it, and Plan / Elevation are fitted the same way.
\*---------------------------------------------------------------------------*/

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Button, Checkbox, Group, SegmentedControl, Text } from "@mantine/core";

import type * as T3 from "three";

import {
  cameraFit, declutter, LABEL_PRIORITY, PHASE_COLOURS, pointAlong, prefersReducedMotion,
  type LabelBox, type LayoutScene, type Phase, type ViewPreset,
} from "../../case/plantLayout.js";

/** The least height a "fill" view draws at, so a squeezed window still
 *  shows a scene rather than a sliver. */
const FILL_MIN_HEIGHT = 240;
/** The camera's vertical field of view (deg); `cameraFit` is told it. */
const FOV = 45;

const COLOURS = {
  process:   0x7d8fa3,
  nonProcess: 0xc2a46b,
  flagged:   0xd9480f,
  area:      0x5c7cfa,
  zone:      0xf08c00,
  link:      0xe03131,
  wind:      0x1c7ed6,
  rack:      0x868e96,
  junction:  0x495057,
};

interface Toggles { flow: boolean; pipes: boolean; zones: boolean; zoneLabels: boolean }

interface Api {
  setToggles(t: Toggles): void;
  fit(view: ViewPreset): void;
}

/** `height` is a pixel height, or "fill": take the height of the box the
 *  view is placed in (the `?layout=` pop-out tab, DEV.md 4c C78) and follow
 *  it when the window is resized.  Either way three.js is imported only when
 *  a layout is first shown. */
export function PlantLayout3D({ scene, height = 520 }: {
  scene: LayoutScene; height?: number | "fill";
}) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reduced = useMemo(() => prefersReducedMotion(), []);
  const [toggles, setTogglesState] = useState<Toggles>(
    { flow: !reduced, pipes: true, zones: true, zoneLabels: false });
  const [view, setView] = useState<ViewPreset>("3d");
  //  The setup is async; it reads the CURRENT toggles and view when it
  //  finishes, so a click made while three.js loads is not lost.
  const togglesRef = useRef(toggles);
  togglesRef.current = toggles;
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => { api.current?.setToggles(toggles); }, [toggles]);

  useEffect(() => {
    let disposed = false;
    let cleanup: () => void = () => {};
    (async () => {
      try {
        const THREE = await import("three");
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
        const { CSS2DRenderer, CSS2DObject } =
          await import("three/examples/jsm/renderers/CSS2DRenderer.js");
        const el = host.current;
        if (disposed || !el) return;

        const heightOf = () =>
          height === "fill" ? Math.max(el.clientHeight, FILL_MIN_HEIGHT) : height;
        const width = Math.max(el.clientWidth, 320);
        const h0 = heightOf();
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        renderer.setSize(width, h0);
        renderer.setClearColor(0x000000, 0);
        if (height === "fill") {
          renderer.domElement.style.position = "absolute";
          renderer.domElement.style.top = "0";
          renderer.domElement.style.left = "0";
        }
        el.appendChild(renderer.domElement);
        const labels = new CSS2DRenderer();
        labels.setSize(width, h0);
        labels.domElement.style.position = "absolute";
        labels.domElement.style.top = "0";
        labels.domElement.style.left = "0";
        labels.domElement.style.pointerEvents = "none";
        el.appendChild(labels.domElement);

        //  The hover tooltip: one absolutely placed box, filled from the
        //  scene's own tooltip lines.
        const tip = document.createElement("div");
        Object.assign(tip.style, {
          position: "absolute", pointerEvents: "none", display: "none",
          font: "500 11px var(--mantine-font-family, sans-serif)",
          lineHeight: "1.35", padding: "4px 6px", borderRadius: "4px",
          maxWidth: "320px", zIndex: "2",
          color: "var(--mantine-color-text)",
          background: "light-dark(rgba(255,255,255,0.95), rgba(30,30,30,0.95))",
          border: "1px solid light-dark(#ced4da, #495057)",
        } as Partial<CSSStyleDeclaration>);
        el.appendChild(tip);

        const world = new THREE.Scene();
        world.add(new THREE.AmbientLight(0xffffff, 0.75));
        const sun = new THREE.DirectionalLight(0xffffff, 0.9);
        sun.position.set(1, 2, 1.5);
        world.add(sun);

        //  ---- labels, decluttered by priority -----------------------------
        interface Lbl { obj: T3.Object3D; el: HTMLDivElement; priority: number;
                        group: "zone" | "always"; w: number; h: number }
        const lbls: Lbl[] = [];
        const label = (text: string, at: [number, number, number], priority: number,
                       strong = false, group: Lbl["group"] = "always") => {
          const d = document.createElement("div");
          d.textContent = text;
          d.style.font = `${strong ? 700 : 500} 11px var(--mantine-font-family, sans-serif)`;
          d.style.padding = "1px 4px";
          d.style.borderRadius = "3px";
          d.style.whiteSpace = "nowrap";
          d.style.color = "var(--mantine-color-text)";
          d.style.background = "light-dark(rgba(255,255,255,0.85), rgba(30,30,30,0.85))";
          if (strong) d.style.border = "2px solid currentColor";
          const o = new CSS2DObject(d);
          o.position.set(at[0], at[1], at[2]);
          world.add(o);
          lbls.push({ obj: o, el: d, priority, group, w: 0, h: 0 });
        };

        const [x0, , z0] = scene.min;
        const [x1, y1, z1] = scene.max;
        const span = Math.max(x1 - x0, z1 - z0, y1, 10);
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;

        //  Ground grid, under everything drawn.
        const cell = span > 200 ? 10 : span > 60 ? 5 : 1;
        const grid = new THREE.GridHelper(Math.ceil(span * 1.2 / cell) * cell,
          Math.ceil(span * 1.2 / cell), 0x999999, 0xcccccc);
        grid.position.set(cx, 0, cz);
        (grid.material as T3.Material).transparent = true;
        (grid.material as T3.Material).opacity = 0.35;
        world.add(grid);

        //  Sector areas: an outline on the ground and a faint fill.
        for (const a of scene.areas) {
          const w = a.x1 - a.x0, d = a.z1 - a.z0;
          const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
            new THREE.MeshBasicMaterial({ color: COLOURS.area, transparent: true,
              opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
          plane.rotation.x = -Math.PI / 2;
          plane.position.set((a.x0 + a.x1) / 2, 0.01, (a.z0 + a.z1) / 2);
          world.add(plane);
          const pts = [[a.x0, a.z0], [a.x1, a.z0], [a.x1, a.z1], [a.x0, a.z1]]
            .map(([x, z]) => new THREE.Vector3(x, 0.02, z));
          world.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),
            new THREE.LineBasicMaterial({ color: COLOURS.area })));
          label(a.label, [a.x0, 0.05, a.z0], LABEL_PRIORITY.other);
        }

        //  The items.  Each mesh carries its tooltip for the hover.
        const pickables: T3.Object3D[] = [];
        for (const s of scene.solids) {
          const colour = s.flagged ? COLOURS.flagged
            : s.nonProcess ? COLOURS.nonProcess : COLOURS.process;
          let geom: T3.BufferGeometry;
          if (s.shape === "cylinder") {
            const along = s.axis === "x" ? s.size[0] : s.axis === "z" ? s.size[2] : s.size[1];
            const across = s.axis === "x" ? s.size[1] : s.size[0];
            geom = new THREE.CylinderGeometry(across / 2, across / 2, along, 32);
            if (s.axis === "x") geom.rotateZ(Math.PI / 2);
            if (s.axis === "z") geom.rotateX(Math.PI / 2);
          } else {
            geom = new THREE.BoxGeometry(s.size[0], s.size[1], s.size[2]);
          }
          const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({
            color: colour, roughness: 0.7, metalness: 0.1 }));
          mesh.position.set(...s.center);
          mesh.userData.tooltip = s.tooltip;
          world.add(mesh);
          pickables.push(mesh);
          const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geom, 30),
            new THREE.LineBasicMaterial({ color: s.flagged ? COLOURS.flagged : 0x333333,
              linewidth: s.flagged ? 3 : 1 }));
          edges.position.copy(mesh.position);
          world.add(edges);
          label(s.label, [s.center[0], s.center[1] + s.size[1] / 2 + 0.6, s.center[2]],
            s.flagged ? LABEL_PRIORITY.finding : LABEL_PRIORITY.item, s.flagged);
        }

        //  Zones: opacity + edge style + the word (the word on demand).
        const zoneGroup = new THREE.Group();
        world.add(zoneGroup);
        for (const z of scene.zones) {
          const geom = new THREE.CylinderGeometry(z.radius, z.radius, z.height, 48, 1, true);
          const fill = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({
            color: COLOURS.zone, transparent: true, opacity: z.opacity,
            side: THREE.DoubleSide, depthWrite: false, wireframe: z.edge === "wire" }));
          fill.position.set(...z.center);
          zoneGroup.add(fill);
          const ring = (y: number) => {
            const pts: T3.Vector3[] = [];
            for (let k = 0; k <= 64; k++) {
              const t = (k / 64) * 2 * Math.PI;
              pts.push(new THREE.Vector3(z.center[0] + z.radius * Math.cos(t), y,
                                         z.center[2] + z.radius * Math.sin(t)));
            }
            const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
              z.edge === "dashed"
                ? new THREE.LineDashedMaterial({ color: COLOURS.zone, dashSize: 0.8, gapSize: 0.6 })
                : new THREE.LineBasicMaterial({ color: COLOURS.zone }));
            line.computeLineDistances();
            zoneGroup.add(line);
          };
          ring(z.center[1] - z.height / 2);
          ring(z.center[1] + z.height / 2);
          label(z.label, [z.center[0] + z.radius, z.center[1] + z.height / 2, z.center[2]],
            LABEL_PRIORITY.zone, false, "zone");
        }

        //  Findings that join two items: a dashed line, tagged short.
        for (const l of scene.links) {
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(
            [new THREE.Vector3(...l.from), new THREE.Vector3(...l.to)]),
            new THREE.LineDashedMaterial({ color: COLOURS.link, dashSize: 0.4, gapSize: 0.3 }));
          line.computeLineDistances();
          world.add(line);
          label(l.label, [(l.from[0] + l.to[0]) / 2, (l.from[1] + l.to[1]) / 2 + 0.5,
                          (l.from[2] + l.to[2]) / 2], LABEL_PRIORITY.finding, true);
        }

        //  ---- the pipes (C80) ---------------------------------------------
        const pipeGroup = new THREE.Group();
        world.add(pipeGroup);
        if (scene.rack) {
          const r = scene.rack;
          const rackMat = new THREE.MeshStandardMaterial({ color: COLOURS.rack, roughness: 0.8 });
          const top = r.tiers[r.tiers.length - 1]!;
          for (const x of r.portals) {
            for (const dz of [-r.halfWidth, r.halfWidth]) {
              const col = new THREE.Mesh(new THREE.BoxGeometry(0.2, top, 0.2), rackMat);
              col.position.set(x, top / 2, r.zc + dz);
              pipeGroup.add(col);
            }
            for (const ty of r.tiers) {
              const beam = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 2 * r.halfWidth), rackMat);
              beam.position.set(x, ty - 0.35, r.zc);
              pipeGroup.add(beam);
            }
          }
          label(r.label, [r.x0, top + 1, r.zc], LABEL_PRIORITY.other);
        }
        for (const j of scene.junctions) {
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12),
            new THREE.MeshStandardMaterial({ color: COLOURS.junction }));
          m.position.set(...j.at);
          m.userData.tooltip = [j.label, "a junction on the rack: an unsized unit the pipes pass through"];
          pipeGroup.add(m);
          pickables.push(m);
          label(j.label, [j.at[0], j.at[1] + 0.9, j.at[2]], LABEL_PRIORITY.other);
        }
        const tubeMat = new Map<Phase, T3.Material>();
        const partMat = new Map<Phase, T3.Material>();
        for (const ph of ["liquid", "vapour", "twoPhase", "unknown"] as Phase[]) {
          tubeMat.set(ph, new THREE.MeshStandardMaterial({ color: PHASE_COLOURS[ph],
            transparent: true, opacity: 0.5, roughness: 0.4, depthWrite: false }));
          partMat.set(ph, new THREE.MeshStandardMaterial({ color: PHASE_COLOURS[ph],
            emissive: PHASE_COLOURS[ph], emissiveIntensity: 0.35 }));
        }
        const sphereG = new THREE.SphereGeometry(0.24, 10, 8);
        const octaG = new THREE.OctahedronGeometry(0.3);
        const cubeG = new THREE.BoxGeometry(0.32, 0.32, 0.32);
        const up = new THREE.Vector3(0, 1, 0);
        interface Particle { mesh: T3.Mesh; s: number; speed: number; points: [number, number, number][] }
        const particles: Particle[] = [];
        for (const p of scene.pipes) {
          const mat = tubeMat.get(p.phase)!;
          for (let i = 1; i < p.points.length; i++) {
            const a = new THREE.Vector3(...p.points[i - 1]!);
            const b = new THREE.Vector3(...p.points[i]!);
            const d = b.clone().sub(a);
            const len = d.length();
            if (len < 1e-6) continue;
            const tube = new THREE.Mesh(new THREE.CylinderGeometry(p.radius, p.radius, len, 10, 1), mat);
            tube.position.copy(a.clone().add(b).multiplyScalar(0.5));
            tube.quaternion.setFromUnitVectors(up, d.normalize());
            tube.userData.tooltip = p.tooltip;
            pipeGroup.add(tube);
            pickables.push(tube);
          }
          //  Particles: one per ~2.5 m of drawn route, 3 to 60, evenly spaced.
          let drawn = 0;
          for (let i = 1; i < p.points.length; i++) {
            const a = p.points[i - 1]!, b = p.points[i]!;
            drawn += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
          }
          const n = Math.max(3, Math.min(60, Math.round(drawn / 2.5)));
          for (let k = 0; k < n; k++) {
            const geo = p.phase === "liquid" ? sphereG : p.phase === "vapour" ? octaG
              : p.phase === "twoPhase" ? (k % 2 ? sphereG : octaG) : cubeG;
            const mesh = new THREE.Mesh(geo, partMat.get(p.phase)!);
            const q = { mesh, s: (k * drawn) / n, speed: p.speed, points: p.points };
            mesh.position.set(...pointAlong(q.points, q.s));
            pipeGroup.add(mesh);
            particles.push(q);
          }
        }

        //  The wind.
        if (scene.wind) {
          const t = new THREE.Vector3(...scene.wind.tail);
          const h = new THREE.Vector3(...scene.wind.head);
          const dir = h.clone().sub(t);
          const len = dir.length();
          world.add(new THREE.ArrowHelper(dir.normalize(), t, len, COLOURS.wind,
            Math.min(0.25 * len, 6), Math.min(0.12 * len, 3)));
          label(scene.wind.label, scene.wind.tail, LABEL_PRIORITY.other);
        }

        //  North marker (plan +y is three.js -Z).
        label("N ↑ (plan +y)", [scene.fitMin[0], 0.1, scene.fitMin[2] - 2], LABEL_PRIORITY.other);

        const far = Math.max(span, scene.fitMax[0] - scene.fitMin[0],
                             scene.fitMax[2] - scene.fitMin[2]) * 50;
        const camera = new THREE.PerspectiveCamera(FOV, width / h0, 0.1, far);
        const controls = new OrbitControls(camera, renderer.domElement);

        //  ---- drawing, with the labels decluttered ----------------------
        let tg: Toggles = togglesRef.current;
        const v = new THREE.Vector3();
        const declutterLabels = () => {
          const w = renderer.domElement.clientWidth || width;
          const h = renderer.domElement.clientHeight || h0;
          const boxes: LabelBox[] = [];
          lbls.forEach((l, i) => {
            const wanted = l.group !== "zone" || (tg.zones && tg.zoneLabels);
            if (!wanted) { l.el.style.visibility = "hidden"; return; }
            l.obj.getWorldPosition(v);
            v.project(camera);
            if (v.z > 1 || v.z < -1) { l.el.style.visibility = "hidden"; return; }
            if (!(l.w > 0)) { l.w = l.el.offsetWidth; l.h = l.el.offsetHeight; }
            boxes.push({ key: String(i), priority: l.priority,
              x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h, w: l.w || 60, h: l.h || 16 });
          });
          const keep = declutter(boxes);
          for (const b of boxes)
            lbls[Number(b.key)]!.el.style.visibility = keep.has(b.key) ? "visible" : "hidden";
        };
        const draw = () => {
          renderer.render(world, camera);
          labels.render(world, camera);
          declutterLabels();
        };

        const fit = (preset: ViewPreset) => {
          const w = Math.max(el.clientWidth, 320);
          const { position, target } = cameraFit(scene.fitMin, scene.fitMax, preset, FOV,
                                                 w / heightOf());
          camera.position.set(...position);
          controls.target.set(...target);
          controls.update();
          draw();
        };
        controls.addEventListener("change", draw);

        //  ---- the flow animation -----------------------------------------
        let raf = 0;
        let last = 0;
        const tick = (now: number) => {
          const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
          last = now;
          for (const q of particles) {
            q.s += q.speed * dt;
            q.mesh.position.set(...pointAlong(q.points, q.s));
          }
          draw();
          raf = requestAnimationFrame(tick);
        };
        const apply = (t: Toggles) => {
          tg = t;
          zoneGroup.visible = t.zones;
          pipeGroup.visible = t.pipes;
          const run = t.flow && t.pipes && particles.length > 0;
          if (run && !raf) { last = 0; raf = requestAnimationFrame(tick); }
          if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
          draw();
        };

        //  ---- hover ------------------------------------------------------
        const ray = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        const onMove = (e: PointerEvent) => {
          const r = renderer.domElement.getBoundingClientRect();
          mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
          ray.setFromCamera(mouse, camera);
          const hit = ray.intersectObjects(pickables, false)
            .find((x) => x.object.visible && x.object.parent?.visible !== false);
          const lines = hit?.object.userData.tooltip as string[] | undefined;
          if (!lines) { tip.style.display = "none"; return; }
          tip.replaceChildren(...lines.map((t, i) => {
            const d = document.createElement("div");
            d.textContent = t;
            if (i === 0) d.style.fontWeight = "700";
            return d;
          }));
          tip.style.display = "block";
          const x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
          tip.style.left = `${Math.min(x, Math.max(0, r.width - 330))}px`;
          tip.style.top = `${Math.min(y, Math.max(0, r.height - 120))}px`;
        };
        const onLeave = () => { tip.style.display = "none"; };
        renderer.domElement.addEventListener("pointermove", onMove);
        renderer.domElement.addEventListener("pointerleave", onLeave);

        const ro = new ResizeObserver(() => {
          const w = Math.max(el.clientWidth, 320);
          const h = heightOf();
          renderer.setSize(w, h);
          labels.setSize(w, h);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          draw();
        });
        ro.observe(el);

        api.current = { setToggles: apply, fit };
        fit(viewRef.current);
        apply(togglesRef.current);

        cleanup = () => {
          api.current = null;
          if (raf) cancelAnimationFrame(raf);
          ro.disconnect();
          renderer.domElement.removeEventListener("pointermove", onMove);
          renderer.domElement.removeEventListener("pointerleave", onLeave);
          controls.dispose();
          world.traverse((o) => {
            const m = o as T3.Mesh;
            m.geometry?.dispose?.();
            const mat = m.material as T3.Material | T3.Material[] | undefined;
            if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose?.();
          });
          renderer.dispose();
          el.replaceChildren();
        };
      } catch (e) {
        if (!disposed)
          setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { disposed = true; cleanup(); };
  }, [scene, height]);

  if (error)
    return (
      <Text size="sm" c="red">
        The 3D view could not start ({error}).  It needs WebGL; the tables below
        carry every position, pipe and finding the engine published.
      </Text>
    );
  const hasPipes = scene.pipes.length > 0;
  const toggle = (k: keyof Toggles) => (e: ChangeEvent<HTMLInputElement>) =>
    setTogglesState((t) => ({ ...t, [k]: e.currentTarget.checked }));
  const toolbar = (
    <Group gap="xs" wrap="wrap" mb={4} style={{ flex: "0 0 auto" }}>
      <Button size="compact-xs" variant="default"
        title="Frame the plant again (the placed process items and the pipes)"
        onClick={() => api.current?.fit(view)}>
        Fit
      </Button>
      <SegmentedControl size="xs" value={view}
        data={[{ value: "3d", label: "3D" }, { value: "plan", label: "Plan" },
               { value: "elevation", label: "Elevation" }]}
        onChange={(v) => { setView(v as ViewPreset); api.current?.fit(v as ViewPreset); }} />
      {hasPipes && <Checkbox size="xs" label="Pipes" checked={toggles.pipes} onChange={toggle("pipes")} />}
      {hasPipes && (
        <Checkbox size="xs" label="Flow" checked={toggles.flow} onChange={toggle("flow")}
          title={reduced ? "Your system asks for reduced motion, so the flow starts off" : undefined} />
      )}
      {scene.zones.length > 0 && (
        <Checkbox size="xs" label="Zones" checked={toggles.zones} onChange={toggle("zones")} />
      )}
      {scene.zones.length > 0 && (
        <Checkbox size="xs" label="Zone labels" checked={toggles.zoneLabels}
          disabled={!toggles.zones} onChange={toggle("zoneLabels")} />
      )}
    </Group>
  );
  //  "fill": the box sizes the view; the canvas is absolutely placed inside
  //  it so the canvas itself can never push the box taller (a feedback loop
  //  with the ResizeObserver).
  if (height === "fill")
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
        <div style={{ padding: "0 16px" }}>{toolbar}</div>
        <div ref={host} style={{ position: "relative", width: "100%", flex: "1 1 auto",
          minHeight: FILL_MIN_HEIGHT, overflow: "hidden" }} />
      </div>
    );
  return (
    <>
      {toolbar}
      <div ref={host} style={{ position: "relative", width: "100%", height }} />
    </>
  );
}
