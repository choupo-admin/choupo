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
  PlantLayout3D -- the plot plan the case declared, drawn in 3D (DEV.md 4c C75).

  Draws a `LayoutScene` (case/plantLayout.ts, pure and tested) with three.js
  and nothing else: no position, footprint or distance is computed here.
  three.js is loaded on demand, the first time a layout is shown, so a case
  without one never downloads it.  Orbit with the left button, pan with the
  right, zoom with the wheel.

  WHAT IS DRAWN.  Every placed item at its extents: a cylinder where the
  engine says the item is one (its sizer published a diameter and a length),
  a labelled box otherwise (a box the case declared).  Sector areas as
  outlined rectangles on the ground.  Hazardous-area zones as translucent
  cylinders whose zones differ by opacity AND edge style (solid / wire /
  dashed) AND the word in their label, so a greyscale print keeps them apart.
  An item the engine named in a finding is outlined thick and labelled
  FINDING (two channels, never colour alone); a separation shortfall is a
  dashed line labelled with both distances.  The wind is an arrow pointing
  where it blows.
\*---------------------------------------------------------------------------*/

import { useEffect, useRef, useState } from "react";
import { Text } from "@mantine/core";

import type * as T3 from "three";

import type { LayoutScene } from "../../case/plantLayout.js";

/** The least height a "fill" view draws at, so a squeezed window still
 *  shows a scene rather than a sliver. */
const FILL_MIN_HEIGHT = 240;

const COLOURS = {
  process:   0x7d8fa3,
  nonProcess: 0xc2a46b,
  flagged:   0xd9480f,
  area:      0x5c7cfa,
  zone:      0xf08c00,
  link:      0xe03131,
  wind:      0x1c7ed6,
};

/** `height` is a pixel height, or "fill": take the height of the box the
 *  view is placed in (the `?layout=` pop-out tab, DEV.md 4c C78) and follow
 *  it when the window is resized.  Either way three.js is imported only when
 *  a layout is first shown. */
export function PlantLayout3D({ scene, height = 520 }: {
  scene: LayoutScene; height?: number | "fill";
}) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

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

        const world = new THREE.Scene();
        world.add(new THREE.AmbientLight(0xffffff, 0.75));
        const sun = new THREE.DirectionalLight(0xffffff, 0.9);
        sun.position.set(1, 2, 1.5);
        world.add(sun);

        const label = (text: string, at: [number, number, number], strong = false) => {
          const d = document.createElement("div");
          d.textContent = text;
          d.style.font = `${strong ? 700 : 500} 11px var(--mantine-font-family, sans-serif)`;
          d.style.padding = "1px 4px";
          d.style.borderRadius = "3px";
          d.style.whiteSpace = "nowrap";
          d.style.color = "var(--mantine-color-text)";
          d.style.background = "light-dark(rgba(255,255,255,0.8), rgba(30,30,30,0.8))";
          if (strong) d.style.border = "2px solid currentColor";
          const o = new CSS2DObject(d);
          o.position.set(at[0], at[1], at[2]);
          world.add(o);
        };

        const [x0, , z0] = scene.min;
        const [x1, y1, z1] = scene.max;
        const span = Math.max(x1 - x0, z1 - z0, y1, 10);
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;

        //  Ground grid, 1 m per cell up to a sensible count.
        const cell = span > 200 ? 10 : span > 60 ? 5 : 1;
        const grid = new THREE.GridHelper(Math.ceil(span * 1.4 / cell) * cell,
          Math.ceil(span * 1.4 / cell), 0x999999, 0xcccccc);
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
          label(a.label, [a.x0, 0.05, a.z0]);
        }

        //  The items.
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
          world.add(mesh);
          const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geom, 30),
            new THREE.LineBasicMaterial({ color: s.flagged ? COLOURS.flagged : 0x333333,
              linewidth: s.flagged ? 3 : 1 }));
          edges.position.copy(mesh.position);
          world.add(edges);
          const tags = [s.release ? "release" : "", s.ignition ? "ignition" : ""]
            .filter(Boolean).join(", ");
          label(tags ? `${s.label} · ${tags}` : s.label,
            [s.center[0], s.center[1] + s.size[1] / 2 + 0.6, s.center[2]], s.flagged);
        }

        //  Zones: opacity + edge style + the word.
        for (const z of scene.zones) {
          const geom = new THREE.CylinderGeometry(z.radius, z.radius, z.height, 48, 1, true);
          const fill = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({
            color: COLOURS.zone, transparent: true, opacity: z.opacity,
            side: THREE.DoubleSide, depthWrite: false, wireframe: z.edge === "wire" }));
          fill.position.set(...z.center);
          world.add(fill);
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
            world.add(line);
          };
          ring(z.center[1] - z.height / 2);
          ring(z.center[1] + z.height / 2);
          label(z.label, [z.center[0] + z.radius, z.center[1] + z.height / 2, z.center[2]]);
        }

        //  Findings that join two items: a dashed line with both distances.
        for (const l of scene.links) {
          const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(
            [new THREE.Vector3(...l.from), new THREE.Vector3(...l.to)]),
            new THREE.LineDashedMaterial({ color: COLOURS.link, dashSize: 0.4, gapSize: 0.3 }));
          line.computeLineDistances();
          world.add(line);
          label(l.label, [(l.from[0] + l.to[0]) / 2, (l.from[1] + l.to[1]) / 2 + 0.5,
                          (l.from[2] + l.to[2]) / 2], true);
        }

        //  The wind.
        if (scene.wind) {
          const t = new THREE.Vector3(...scene.wind.tail);
          const h = new THREE.Vector3(...scene.wind.head);
          const dir = h.clone().sub(t);
          const len = dir.length();
          world.add(new THREE.ArrowHelper(dir.normalize(), t, len, COLOURS.wind,
            Math.min(0.25 * len, 6), Math.min(0.12 * len, 3)));
          label(scene.wind.label, scene.wind.tail);
        }

        //  North marker (plan +y is three.js -Z).
        label("N ↑ (plan +y)", [x0, 0.1, z0 - 2]);

        const camera = new THREE.PerspectiveCamera(45, width / h0, 0.1, span * 50);
        camera.position.set(cx - 0.6 * span, 0.7 * span, cz + 0.9 * span);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.target.set(cx, 0, cz);
        controls.update();

        const draw = () => { renderer.render(world, camera); labels.render(world, camera); };
        controls.addEventListener("change", draw);
        draw();

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

        cleanup = () => {
          ro.disconnect();
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
        The 3D view could not start ({error}).  It needs WebGL; the table below
        carries every position and finding the engine published.
      </Text>
    );
  //  "fill": the box sizes the view; the canvas is absolutely placed inside
  //  it so the canvas itself can never push the box taller (a feedback loop
  //  with the ResizeObserver).
  return (
    <div ref={host} style={{ position: "relative", width: "100%",
      height: height === "fill" ? "100%" : height,
      overflow: height === "fill" ? "hidden" : undefined }} />
  );
}
