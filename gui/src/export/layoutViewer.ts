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
  THE EXPORTED PAGE'S VIEWER -- the script "Export as page" inlines (DEV.md
  4c C81).

  Compiled ONCE, with three.js, into one IIFE by scripts/layoutViewerPlugin.ts
  and carried as a string into every exported file by case/layoutExport.ts.
  It is the app's own code, not a second copy: it reads the layout block the
  page embeds, maps it with `layoutScene` (case/plantLayout.ts) and draws it
  with `mountLayoutScene` (ui/plotting/layoutRenderer.ts) -- exactly what
  Reports, the `?layout=` tab and the EduTool bench run.  What is new here is
  only the wiring of the page's plain HTML toolbar to that view.

  `sceneOf` is exported (the IIFE's global `ChoupoLayoutViewer`) so a test
  can run the COMPILED bundle and hold its mapping equal to the app's on the
  same block -- the proof that the file draws what the app drew.

  A reader whose system asks for reduced motion opens the page with the flow
  off (the Flow box turns it on); a browser without WebGL gets a sentence
  saying so, and the tables below the view carry everything.
\*---------------------------------------------------------------------------*/

import {
  AmbientLight, ArrowHelper, BoxGeometry, BufferGeometry, CylinderGeometry, DirectionalLight,
  DoubleSide, EdgesGeometry, GridHelper, Group, Line, LineBasicMaterial, LineDashedMaterial,
  LineLoop, LineSegments, Mesh, MeshBasicMaterial, MeshStandardMaterial, OctahedronGeometry,
  PerspectiveCamera, PlaneGeometry, Raycaster, Scene, SphereGeometry, Vector2, Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";

import type { PlantLayout } from "../adapters/SolverAdapter.js";
import { EXPORT_IDS } from "../case/layoutExport.js";
import { layoutScene, prefersReducedMotion, type ViewPreset } from "../case/plantLayout.js";
import { mountLayoutScene, type LayoutView, type Toggles } from "../ui/plotting/layoutRenderer.js";

/** The app's mapping, as compiled into this bundle (for the test). */
export const sceneOf = layoutScene;

const THREE = {
  AmbientLight, ArrowHelper, BoxGeometry, BufferGeometry, CylinderGeometry, DirectionalLight,
  DoubleSide, EdgesGeometry, GridHelper, Group, Line, LineBasicMaterial, LineDashedMaterial,
  LineLoop, LineSegments, Mesh, MeshBasicMaterial, MeshStandardMaterial, OctahedronGeometry,
  PerspectiveCamera, PlaneGeometry, Raycaster, Scene, SphereGeometry, Vector2, Vector3,
  WebGLRenderer,
};

function boot(): void {
  const data = document.getElementById(EXPORT_IDS.data);
  const host = document.getElementById(EXPORT_IDS.view) as HTMLDivElement | null;
  const error = document.getElementById(EXPORT_IDS.error);
  if (!data || !host) return;
  const say = (text: string) => {
    if (!error) return;
    error.textContent = text;
    error.hidden = false;
  };
  let scene;
  try {
    scene = layoutScene(JSON.parse(data.textContent ?? "") as PlantLayout);
  } catch (e) {
    say(`The embedded layout could not be read (${e instanceof Error ? e.message : String(e)}).`);
    return;
  }
  if (!scene) { say("The embedded layout places no item, so there is nothing to draw."); return; }

  const box = (id: string) => document.getElementById(id) as HTMLInputElement | null;
  const flowBox = box(EXPORT_IDS.flow);
  if (flowBox && prefersReducedMotion()) {
    flowBox.checked = false;
    flowBox.title = "Your system asks for reduced motion, so the flow starts off";
  }
  const read = (): Toggles => ({
    pipes: box(EXPORT_IDS.pipes)?.checked ?? true,
    flow: flowBox?.checked ?? false,
    zones: box(EXPORT_IDS.zones)?.checked ?? true,
    zoneLabels: box(EXPORT_IDS.zoneLabels)?.checked ?? false,
  });
  const presetNow = (): ViewPreset => {
    const c = document.querySelector<HTMLInputElement>(
      `input[name="${EXPORT_IDS.preset}"]:checked`);
    return c && (c.value === "plan" || c.value === "elevation") ? c.value : "3d";
  };

  let view: LayoutView;
  try {
    view = mountLayoutScene({ THREE, OrbitControls, CSS2DRenderer, CSS2DObject }, host, scene,
      { height: "fill", toggles: read(), view: presetNow() });
  } catch (e) {
    say(`The 3D view could not start (${e instanceof Error ? e.message : String(e)}).  It needs`
      + " WebGL; the tables below carry every position, pipe and finding the engine published.");
    return;
  }

  const zl = box(EXPORT_IDS.zoneLabels);
  const sync = () => {
    const t = read();
    if (zl) zl.disabled = !t.zones;
    view.setToggles(t);
  };
  for (const id of [EXPORT_IDS.pipes, EXPORT_IDS.flow, EXPORT_IDS.zones, EXPORT_IDS.zoneLabels])
    box(id)?.addEventListener("change", sync);
  document.getElementById(EXPORT_IDS.fit)?.addEventListener("click", () => view.fit(presetNow()));
  for (const r of Array.from(document.querySelectorAll<HTMLInputElement>(
    `input[name="${EXPORT_IDS.preset}"]`)))
    r.addEventListener("change", () => view.fit(presetNow()));
  sync();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
}
