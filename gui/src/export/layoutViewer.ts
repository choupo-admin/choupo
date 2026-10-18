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

  THE PAGE'S PANELS (DEV.md 4c C91), wired here and decided in
  case/layoutPanels.ts: the view fills the window below its toolbar until
  the reader drags its lower edge (remembered in this browser), a Full
  screen button (the Fullscreen API, else a fixed overlay; Esc leaves
  both), and every section folds as the reader last left it.  Every store
  access goes through state/prefs.ts, which swallows a blocked store.

  A reader whose system asks for reduced motion opens the page with the flow
  off (the Flow box turns it on); a browser without WebGL gets a sentence
  saying so, and the tables below the view carry everything.
\*---------------------------------------------------------------------------*/

import {
  ACESFilmicToneMapping, ArrowHelper, BoxGeometry, BufferGeometry, CanvasTexture,
  CylinderGeometry, DirectionalLight, DoubleSide, Fog, Group, HalfFloatType, LineSegments,
  HemisphereLight, InstancedMesh, Line, LineBasicMaterial, LineDashedMaterial, LineLoop, Matrix4,
  Mesh, MeshBasicMaterial, MeshLambertMaterial, MeshStandardMaterial, OctahedronGeometry,
  PCFSoftShadowMap,
  PerspectiveCamera, PlaneGeometry, PMREMGenerator, Quaternion, Raycaster, RepeatWrapping, Scene,
  SphereGeometry, SRGBColorSpace, TorusGeometry, Vector2, Vector3, WebGLRenderer,
  WebGLRenderTarget,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/examples/jsm/renderers/CSS2DRenderer.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

import type { PlantLayout } from "../adapters/SolverAdapter.js";
import { EXPORT_IDS } from "../case/layoutExport.js";
import { clampViewHeight, fillHeight, fullscreenMode } from "../case/layoutPanels.js";
import { hasFlag, PREF_KEYS, readFlag, readRaw, writeFlag, writeRaw } from "../state/prefs.js";
import {
  initialQuality, layoutScene, prefersReducedMotion, rememberQuality,
  type RenderQuality, type ViewPreset,
} from "../case/plantLayout.js";
import {
  mountLayoutScene, type LayoutModules, type LayoutView, type Toggles,
} from "../ui/plotting/layoutRenderer.js";

/** The app's mapping, as compiled into this bundle (for the test). */
export const sceneOf = layoutScene;

const MODULES: LayoutModules = {
  THREE: {
    ACESFilmicToneMapping, ArrowHelper, BoxGeometry, BufferGeometry, CanvasTexture,
    CylinderGeometry, DirectionalLight, DoubleSide, Fog, Group, HalfFloatType, LineSegments,
    HemisphereLight, InstancedMesh, Line, LineBasicMaterial, LineDashedMaterial, LineLoop, Matrix4,
    Mesh, MeshBasicMaterial, MeshLambertMaterial, MeshStandardMaterial, OctahedronGeometry,
  PCFSoftShadowMap,
    PerspectiveCamera, PlaneGeometry, PMREMGenerator, Quaternion, Raycaster, RepeatWrapping, Scene,
    SphereGeometry, SRGBColorSpace, TorusGeometry, Vector2, Vector3, WebGLRenderer,
    WebGLRenderTarget,
  },
  OrbitControls, CSS2DRenderer, CSS2DObject, RoomEnvironment, mergeGeometries,
  post: { EffectComposer, RenderPass, GTAOPass, OutlinePass, OutputPass },
};

/** Each <details data-section> opens as the reader last left it, and
 *  remembers the next toggle.  Without a stored answer the markup's own
 *  default stands. */
function wireSections(): void {
  for (const d of Array.from(document.querySelectorAll<HTMLDetailsElement>("details[data-section]"))) {
    const key = d.dataset.key;
    if (!key) continue;
    if (hasFlag(key)) d.open = !readFlag(key);
    d.addEventListener("toggle", () => writeFlag(key, !d.open));
  }
}

/** The view's height: the reader's dragged one, else what fills the window
 *  below its top; its lower edge is the drag handle (pointer, arrows,
 *  double-click to fill again).  The renderer follows the box ("fill"). */
function wireViewHeight(host: HTMLDivElement): void {
  const handle = document.getElementById(EXPORT_IDS.resize);
  const fill = () => fillHeight(host.getBoundingClientRect().top + window.scrollY, window.innerHeight);
  const stored = Number(readRaw(PREF_KEYS.layoutExportViewHeight) ?? NaN);
  const set = (px: number) => { host.style.height = `${px}px`; };
  set(Number.isFinite(stored) && stored > 0 ? clampViewHeight(stored, window.innerHeight, fill())
    : fill());
  if (!handle) return;
  const commit = (px: number) => {
    const v = clampViewHeight(px, window.innerHeight, fill());
    set(v);
    writeRaw(PREF_KEYS.layoutExportViewHeight, String(v));
  };
  handle.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    const y0 = e.clientY, h0 = host.getBoundingClientRect().height;
    try { handle.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    const move = (ev: PointerEvent) =>
      set(clampViewHeight(h0 + ev.clientY - y0, window.innerHeight, h0));
    const up = (ev: PointerEvent) => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      commit(h0 + ev.clientY - y0);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  });
  handle.addEventListener("keydown", (e) => {
    const h = host.getBoundingClientRect().height;
    if (e.key === "ArrowDown") { e.preventDefault(); commit(h + 16); }
    else if (e.key === "ArrowUp") { e.preventDefault(); commit(h - 16); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); commit(fill()); }
  });
  handle.addEventListener("dblclick", () => {
    set(fill());
    writeRaw(PREF_KEYS.layoutExportViewHeight, "");
  });
}

/** Full screen: the toolbar and the view together (the stage), the browser's
 *  own where it is granted, else fixed over the window (class `max`); Esc
 *  or the button leaves either. */
function wireFullscreen(): void {
  const btn = document.getElementById(EXPORT_IDS.full) as HTMLButtonElement | null;
  const host = document.getElementById(EXPORT_IDS.stage);
  if (!btn || !host) return;
  const label = () => {
    const on = !!document.fullscreenElement || host.classList.contains("max");
    btn.textContent = on ? "Exit full screen" : "Full screen";
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  };
  btn.addEventListener("click", () => {
    if (document.fullscreenElement) { void document.exitFullscreen?.(); return; }
    if (host.classList.contains("max")) { host.classList.remove("max"); label(); return; }
    if (fullscreenMode(document, host) === "api")
      host.requestFullscreen().catch(() => { host.classList.add("max"); label(); });
    else { host.classList.add("max"); label(); }
  });
  document.addEventListener("fullscreenchange", label);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && host.classList.contains("max")) { host.classList.remove("max"); label(); }
  });
}

function boot(): void {
  wireSections();
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

  wireViewHeight(host);
  wireFullscreen();
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
  //  The quality the reader chose before (in this browser), else this
  //  device's default; the page's radio group is set to it before the view
  //  starts.
  const qualityRadio = (q: RenderQuality) =>
    document.getElementById(`${EXPORT_IDS.quality}-${q}`) as HTMLInputElement | null;
  const first = initialQuality();
  const radio = qualityRadio(first);
  if (radio) radio.checked = true;
  const qualityNow = (): RenderQuality =>
    qualityRadio("fast")?.checked ? "fast" : "high";

  let view: LayoutView;
  try {
    view = mountLayoutScene(MODULES, host, scene,
      { height: "fill", toggles: read(), view: presetNow(), quality: qualityNow() });
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
  for (const r of Array.from(document.querySelectorAll<HTMLInputElement>(
    `input[name="${EXPORT_IDS.quality}"]`)))
    r.addEventListener("change", () => {
      const q = qualityNow();
      rememberQuality(q);
      view.setQuality(q);
    });
  sync();
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
}
