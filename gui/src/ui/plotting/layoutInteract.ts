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
/*---------------------------------------------------------------------------*\
  THE PLOT PLAN'S INTERACTION LAYER (DEV.md 4c C229): the guided tour, the
  three cameras, "Go to...", colour by a published quantity, the minimap, the
  click cards and the headline panel.

  ONE HOME, FOR THE APP AND THE EXPORTED PAGE.  This is plain DOM on top of
  the renderer's own canvas, mounted by `mountLayoutScene`, so Reports, the
  `?layout=` tab, the EduTool bench AND the page "Export as page" saves get
  all of it from the same code (the exported bundle compiles this file with
  the renderer).  The LOGIC lives in pure modules with tests -- case/
  layoutTour, layoutCamera, layoutColour, layoutCards, layoutFacts -- and
  this file only turns their answers into elements and moves the camera.

  NOTHING IS WRITTEN PER PLANT and nothing is computed here: every sentence
  of the tour is a field of the result (hover a line: its source key), every
  colour a published value, every card row a sheet or stream entry.  Where a
  surface has the layout block alone (the exported page) the view offers what
  that carries -- pipe T and P, phase, flow, sectors, items -- and says that
  the sheets and the composition need the run.

  LAYOUT OF THE CONTROLS.  Top-left: camera and "Go to...".  Top-right: the
  colour selector and its legend.  Bottom-left: the minimap.  Bottom-right: the
  headline.  The tour sits at the bottom, a card at the right.  Below
  COMPACT_WIDTH px the minimap and the headline start folded, the controls
  are behind one button, and a card or the tour becomes a sheet over the
  lower part of the scene -- never over the whole of it.

  NO PARTICLE SPEED IS INVENTED: the engine publishes no line velocity (a pipe
  has no sized diameter), so the particles stay stylised and the legend says
  so; the day a velocity is published, `ScenePipe` gains the field and
  `particleSpeed` is replaced by it.
\*---------------------------------------------------------------------------*/

import type * as T3 from "three";
import type { OrbitControls as OrbitControlsT } from "three/examples/jsm/controls/OrbitControls.js";

import type { PlantLayout } from "../../adapters/SolverAdapter.js";
import {
  aheadOf, ease, freeBounds, freeLooking, freePoseFor, fromMini, gotoList, keyAction, lerp3,
  look, minimapOf, NO_KEYS, poseFor, stepFree, toMini, EYE_HEIGHT,
  type CameraMode, type FreeState, type GoTo, type Keys, type Minimap,
} from "../../case/layoutCamera.js";
import { itemCard, pipeCard, type Card } from "../../case/layoutCards.js";
import {
  availableModes, colourPipes, css, type ColourMode, type Legend,
} from "../../case/layoutColour.js";
import { layoutKpis, type LayoutFacts } from "../../case/layoutFacts.js";
import { tourOf, type TourStep } from "../../case/layoutTour.js";
import { UTILITY_FAMILY_WORDS, utilityColour, type LayoutScene, type Vec3 } from "../../case/plantLayout.js";

/** Below this width (px) the layer starts folded and sheets replace panels. */
export const COMPACT_WIDTH = 560;
/** The tour's "Continue" advances by itself every this many milliseconds. */
export const TOUR_AUTO_MS = 9000;
/** A flight between two poses lasts this long (ms). */
export const FLIGHT_MS = 1100;

export interface InteractionContext {
  THREE: Pick<typeof T3, "BufferGeometry" | "LineSegments" | "LineBasicMaterial" | "Vector3">;
  el: HTMLDivElement;
  dom: HTMLCanvasElement;
  camera: T3.PerspectiveCamera;
  controls: OrbitControlsT;
  world: T3.Scene;
  scene: LayoutScene;
  layout?: PlantLayout;
  facts?: LayoutFacts | null;
  pickables: T3.Object3D[];
  fov: number;
  heightOf(): number;
  draw(): void;
  /** Paint pipe i with colours[i]; `solid` makes the tubes near-opaque (a
   *  continuous scale reads badly through a 45 % tube). */
  paintPipes(colours: number[], solid: boolean): void;
  /** Mark pipe i as the selected one (or none). */
  selectPipe(index: number | null): void;
  /** The first visible pickable under normalised device coordinates (-1..1). */
  raycast(nx: number, ny: number): T3.Object3D | null;
  /** Called by the renderer at the end of every frame it draws. */
  onFrame: Array<() => void>;
}

export interface InteractionHandle { dispose(): void }

type El = HTMLElement;
function h(tag: string, style: Partial<CSSStyleDeclaration> | null, text?: string,
           kids: (El | null | false)[] = []): El {
  const e = document.createElement(tag);
  if (style) Object.assign(e.style, style);
  if (text !== undefined) e.textContent = text;
  for (const k of kids) if (k) e.appendChild(k);
  return e;
}

const PANEL: Partial<CSSStyleDeclaration> = {
  font: "500 11px var(--mantine-font-family, sans-serif)", lineHeight: "1.35",
  color: "var(--mantine-color-text)",
  background: "light-dark(rgba(255,255,255,0.93), rgba(30,30,30,0.93))",
  border: "1px solid light-dark(#ced4da, #495057)", borderRadius: "6px", padding: "5px 7px",
  pointerEvents: "auto", boxSizing: "border-box",
};

function button(label: string, title: string, on: () => void, active = false): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.title = title;
  b.setAttribute("aria-label", title);
  Object.assign(b.style, {
    font: "500 11px var(--mantine-font-family, sans-serif)", padding: "2px 7px", cursor: "pointer",
    borderRadius: "4px", color: "inherit",
    border: "1px solid light-dark(#adb5bd, #6c757d)",
    background: active ? "light-dark(#d0ebff, #1c4a6e)" : "light-dark(#f8f9fa, #343a40)",
  } as Partial<CSSStyleDeclaration>);
  b.addEventListener("click", on);
  return b;
}

function select(options: { value: string; label: string }[], value: string,
                on: (v: string) => void, title: string): HTMLSelectElement {
  const s = document.createElement("select");
  s.title = title;
  s.setAttribute("aria-label", title);
  Object.assign(s.style, {
    font: "500 11px var(--mantine-font-family, sans-serif)", maxWidth: "150px", padding: "1px 2px",
    color: "inherit", background: "light-dark(#f8f9fa, #343a40)",
    border: "1px solid light-dark(#adb5bd, #6c757d)", borderRadius: "4px",
  } as Partial<CSSStyleDeclaration>);
  for (const o of options) {
    const op = document.createElement("option");
    op.value = o.value;
    op.textContent = o.label;
    s.appendChild(op);
  }
  s.value = value;
  s.addEventListener("change", () => on(s.value));
  return s;
}

export function mountInteraction(c: InteractionContext): InteractionHandle {
  const { scene, el, camera, controls, dom } = c;
  const compact = el.clientWidth < COMPACT_WIDTH;
  const layer = h("div", { position: "absolute", inset: "0", pointerEvents: "none", zIndex: "3",
                           overflow: "hidden" });
  el.appendChild(layer);
  el.tabIndex = 0;
  el.style.outline = "none";

  //  ---- state -----------------------------------------------------------
  let mode: CameraMode = "orbit";
  let free: FreeState = freeLooking([0, EYE_HEIGHT, 0], [0, EYE_HEIGHT, -1]);
  const keys: Keys = { ...NO_KEYS };
  let colourMode: ColourMode = { kind: "phase" };
  let selected: Card | null = null;
  let tour: TourStep[] | null = null;
  let tourAt = -1;
  let tourTimer = 0;
  let raf = 0;
  let last = 0;
  let flight: { t0: number; ms: number; step: (u: number) => void } | null = null;

  const facts = c.facts ?? null;
  const modes = availableModes(scene.pipes, facts);
  const aspect = () => Math.max(el.clientWidth, 320) / c.heightOf();

  //  ---- camera ----------------------------------------------------------
  const apply = () => {
    if (mode === "orbit") return;
    camera.position.set(...free.pos);
    camera.lookAt(...aheadOf(free, 10));
    c.draw();
  };
  const center = (): Vec3 => [(scene.fitMin[0] + scene.fitMax[0]) / 2, 0,
                              (scene.fitMin[2] + scene.fitMax[2]) / 2];
  const stopFlight = () => { flight = null; };
  const tickLoop = () => {
    if (!raf) { last = 0; raf = requestAnimationFrame(loop); }
  };
  const loop = (now: number) => {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    let again = false;
    if (flight) {
      const u = Math.min(1, (now - flight.t0) / flight.ms);
      flight.step(ease(u));
      if (u >= 1) flight = null; else again = true;
    }
    if (mode !== "orbit" && (keys.fwd || keys.back || keys.left || keys.right || keys.up || keys.down)) {
      free = stepFree(free, keys, dt, mode, freeBounds(scene, mode),
                      mode === "drone" ? Math.max(8, Math.hypot(scene.max[0] - scene.min[0],
                                                                 scene.max[2] - scene.min[2]) / 8) : undefined);
      apply();
      again = true;
    }
    if (again) raf = requestAnimationFrame(loop);
  };

  /** Fly the camera to look at a box, in the current mode. */
  const flyToBox = (min: Vec3, max: Vec3, ms = FLIGHT_MS) => {
    if (mode === "orbit") {
      const to = poseFor(min, max, c.fov, aspect());
      const p0: Vec3 = [camera.position.x, camera.position.y, camera.position.z];
      const t0: Vec3 = [controls.target.x, controls.target.y, controls.target.z];
      flight = { t0: performance.now(), ms, step: (u) => {
        camera.position.set(...lerp3(p0, to.position, u));
        controls.target.set(...lerp3(t0, to.target, u));
        controls.update();
        c.draw();
      } };
    } else {
      const to = freePoseFor(min, max, mode, c.fov, aspect());
      const from = free;
      let dyaw = to.yaw - from.yaw;
      dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      flight = { t0: performance.now(), ms, step: (u) => {
        free = { pos: lerp3(from.pos, to.pos, u), yaw: from.yaw + dyaw * u,
                 pitch: from.pitch + (to.pitch - from.pitch) * u };
        apply();
      } };
    }
    tickLoop();
  };

  const setMode = (next: CameraMode) => {
    if (next === mode) return;
    stopFlight();
    if (next === "orbit") {
      //  Back to orbit: look at the point ahead (at least 15 m away).
      const d = Math.max(15, Math.hypot(free.pos[0] - center()[0], free.pos[2] - center()[2]));
      const t = aheadOf(free, Math.min(d, 80));
      t[1] = Math.max(0, t[1]);
      mode = "orbit";
      controls.enabled = true;
      camera.position.set(free.pos[0], Math.max(free.pos[1], 3), free.pos[2]);
      controls.target.set(...t);
      controls.update();
      c.draw();
    } else {
      const wasOrbit = mode === "orbit";
      mode = next;
      controls.enabled = false;
      if (wasOrbit) {
        //  Step down to the ground at the camera's own spot, clamped to the
        //  walkable box, facing the plant.
        const b = freeBounds(scene, next);
        const x = Math.min(b.max[0], Math.max(b.min[0], camera.position.x));
        const z = Math.min(b.max[2], Math.max(b.min[2], camera.position.z));
        const y = next === "walk" ? EYE_HEIGHT : Math.max(camera.position.y, b.min[1]);
        free = freeLooking([x, y, z], [center()[0], next === "walk" ? EYE_HEIGHT : 0, center()[2]]);
      } else {
        free = { ...free, pos: [free.pos[0], next === "walk" ? EYE_HEIGHT : Math.max(free.pos[1], 4), free.pos[2]] };
      }
      apply();
    }
    renderControls();
    el.focus({ preventScroll: true });
  };

  //  ---- colour ----------------------------------------------------------
  let legend: Legend | null = null;
  const recolour = () => {
    const col = colourPipes(scene.pipes, colourMode, facts);
    legend = col.legend;
    c.paintPipes(col.colours, colourMode.kind !== "phase");
    renderLegend();
    drawMini();
    c.draw();
  };

  //  ---- selection and highlight ----------------------------------------
  const marks: T3.LineSegments[] = [];
  const clearMarks = () => {
    for (const m of marks.splice(0)) { c.world.remove(m); m.geometry.dispose(); (m.material as T3.Material).dispose(); }
  };
  const markBox = (min: Vec3, max: Vec3, colour: number) => {
    const v = (i: number, j: number, k: number) => new c.THREE.Vector3(
      i ? max[0] : min[0], j ? max[1] : min[1], k ? max[2] : min[2]);
    const pts: T3.Vector3[] = [];
    for (const j of [0, 1]) for (const k of [0, 1]) pts.push(v(0, j, k), v(1, j, k));
    for (const i of [0, 1]) for (const k of [0, 1]) pts.push(v(i, 0, k), v(i, 1, k));
    for (const i of [0, 1]) for (const j of [0, 1]) pts.push(v(i, j, 0), v(i, j, 1));
    const m = new c.THREE.LineSegments(new c.THREE.BufferGeometry().setFromPoints(pts),
      new c.THREE.LineBasicMaterial({ color: colour, depthTest: false, transparent: true }));
    m.renderOrder = 999;
    c.world.add(m);
    marks.push(m);
  };
  const highlight = (itemIds: string[], pipeIndex: number | null) => {
    clearMarks();
    for (const s of scene.solids)
      if (itemIds.includes(s.id))
        markBox([s.center[0] - s.size[0] / 2 - 0.15, s.center[1] - s.size[1] / 2, s.center[2] - s.size[2] / 2 - 0.15],
                [s.center[0] + s.size[0] / 2 + 0.15, s.center[1] + s.size[1] / 2 + 0.15, s.center[2] + s.size[2] / 2 + 0.15],
                0x00b4d8);
    c.selectPipe(pipeIndex);
    c.draw();
  };
  const select_ = (card: Card | null, itemIds: string[] = [], pipeIndex: number | null = null) => {
    selected = card;
    if (!tour) highlight(itemIds, pipeIndex);
    renderCard();
  };

  const onClick = (e: PointerEvent, ray: (x: number, y: number) => T3.Object3D | null) => {
    const r = dom.getBoundingClientRect();
    const hit = ray(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const pick = hit?.userData.pick as { kind: "item" | "pipe"; id: string } | undefined;
    if (!pick) { select_(null); return; }
    if (pick.kind === "item") {
      const s = scene.solids.find((x) => x.id === pick.id);
      if (s) select_(itemCard(s, facts), [s.id]);
    } else {
      const i = scene.pipes.findIndex((p) => p.id === pick.id);
      if (i >= 0) select_(pipeCard(scene.pipes[i]!, facts), [], i);
    }
  };

  //  ---- the tour --------------------------------------------------------
  const tourSteps = () => (tour ??= tourOf(scene, c.layout, facts));
  const showStep = (i: number) => {
    const steps = tourSteps();
    if (steps.length === 0) return;
    tourAt = Math.max(0, Math.min(steps.length - 1, i));
    const st = steps[tourAt]!;
    selected = null;
    clearMarks();
    highlight(st.itemIds, null);
    const f = st.focus;
    const grown: [Vec3, Vec3] = [[f.min[0], f.min[1], f.min[2]], [f.max[0], f.max[1], f.max[2]]];
    flyToBox(grown[0], grown[1]);
    renderCard();
    renderTour();
  };
  const startTour = () => {
    if (tourSteps().length === 0) return;
    renderCard();
    showStep(0);
  };
  const endTour = () => {
    window.clearInterval(tourTimer);
    tourTimer = 0;
    tourAt = -1;
    clearMarks();
    c.selectPipe(null);
    c.draw();
    renderTour();
    renderControls();
  };

  //  ---- the controls (top-left) ----------------------------------------
  const controlsBox = h("div", { ...PANEL, position: "absolute", left: "6px", top: "6px",
    display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center", maxWidth: "calc(100% - 12px)" });
  let controlsOpen = !compact;
  const goto = gotoList(scene);
  function renderControls() {
    controlsBox.replaceChildren();
    if (compact) controlsBox.appendChild(button(controlsOpen ? "Hide controls" : "Controls",
      "Show or hide the camera, tour and colour controls", () => { controlsOpen = !controlsOpen; renderControls(); renderColour(); }));
    if (!controlsOpen) return;
    const tourBtn = button(tourAt >= 0 ? "Tour (on)" : "Tour", "Guided tour, generated from the result",
      () => (tourAt >= 0 ? endTour() : startTour()), tourAt >= 0);
    controlsBox.append(
      button("Orbit", "Orbit camera: drag to turn, right-drag to pan, wheel to zoom", () => setMode("orbit"), mode === "orbit"),
      button("Walk", "Walk at eye height: W A S D or arrows, drag to look, Shift to run", () => setMode("walk"), mode === "walk"),
      button("Drone", "Fly: W A S D move where you look, E / Q up and down, drag to look", () => setMode("drone"), mode === "drone"),
      select([{ value: "", label: "Go to..." }, ...goto.map((g: GoTo) => ({
        value: g.id, label: g.kind === "item" ? `  ${g.label}` : g.label }))], "",
        (v) => { const g = goto.find((x) => x.id === v); if (g) flyToBox(g.min, g.max); renderControls(); },
        "Fly to a sector or an item"),
      tourBtn);
    if (mode !== "orbit")
      controlsBox.appendChild(h("span", { opacity: "0.75" }, mode === "walk"
        ? "W A S D / arrows · drag to look · Shift runs" : "W A S D fly · E / Q up, down · drag to look"));
  }

  //  ---- colour selector and legend (top-right) -----------------------
  const colourBox = h("div", { ...PANEL, position: "absolute", right: "6px",
    ...(compact ? { bottom: "40px", maxWidth: "62%", maxHeight: "34%", overflowY: "auto" }
                : { top: "6px", maxWidth: "260px" }) });
  function renderColour() { renderLegend(); }
  function renderLegend() {
    colourBox.replaceChildren();
    colourBox.style.display = (compact && (!controlsOpen || tourAt >= 0)) ? "none" : "block";
    const opts: { value: string; label: string }[] = [{ value: "phase", label: "Colour by phase" }];
    if (modes.T) opts.push({ value: "T", label: "Colour by temperature" });
    if (modes.P) opts.push({ value: "P", label: "Colour by pressure" });
    if (modes.x) opts.push({ value: "x", label: "Colour by mole fraction" });
    const row = h("div", { display: "flex", gap: "4px", flexWrap: "wrap", alignItems: "center" });
    row.appendChild(select(opts, colourMode.kind, (v) => {
      colourMode = v === "x" ? { kind: "x", component: facts?.components[0] ?? "" }
        : { kind: v as "phase" | "T" | "P" };
      recolour();
    }, "What the pipes are coloured by"));
    if (colourMode.kind === "x" && facts)
      row.appendChild(select(facts.components.map((k) => ({ value: k, label: k })),
        colourMode.component, (v) => { colourMode = { kind: "x", component: v }; recolour(); },
        "The component whose mole fraction colours the pipes"));
    colourBox.appendChild(row);
    if (legend) {
      colourBox.appendChild(h("div", { fontWeight: "700", marginTop: "4px" }, legend.title));
      if (legend.kind === "category") {
        for (const e of legend.entries)
          colourBox.appendChild(h("div", { display: "flex", gap: "5px", alignItems: "center" }, undefined, [
            h("span", { width: "14px", height: "8px", background: css(e.colour), borderRadius: "2px", flex: "0 0 auto" }),
            h("span", null, e.label)]));
      } else if (legend.entries.length > 0 && legend.ticks) {
        const grad = `linear-gradient(to right, ${legend.entries.map((e) => css(e.colour)).join(", ")})`;
        colourBox.appendChild(h("div", { height: "10px", marginTop: "3px", borderRadius: "2px", background: grad,
          border: "1px solid light-dark(#868e96, #adb5bd)" }));
        colourBox.appendChild(h("div", { display: "flex", justifyContent: "space-between", gap: "4px" },
          undefined, legend.ticks.map((t) => h("span", { fontSize: "10px" }, t))));
      }
      for (const n of legend.notes) colourBox.appendChild(h("div", { opacity: "0.8", marginTop: "2px" }, n));
    }
    colourBox.appendChild(h("div", { opacity: "0.8", marginTop: "3px" },
      "Particles: stylised. The engine publishes no line velocity; speed only grows with the mass flow."));
    //  UTILITY LINES (C268 slice 2): a fixed colour per service family, the words beside it.
    const fams: string[] = [];
    for (const u of scene.utilityLines) if (!fams.includes(u.family)) fams.push(u.family);
    if (fams.length > 0) {
      colourBox.appendChild(h("div", { fontWeight: "700", marginTop: "6px" }, "Utility lines (declared, unsized)"));
      for (const f of fams)
        colourBox.appendChild(h("div", { display: "flex", gap: "5px", alignItems: "center" }, undefined, [
          h("span", { width: "14px", height: "4px", background: css(utilityColour(f)), borderRadius: "2px", flex: "0 0 auto" }),
          h("span", null, UTILITY_FAMILY_WORDS[f] ?? f)]));
    }
  }

  //  ---- the minimap (bottom-left) -------------------------------------
  const MW = compact ? 120 : 168, MH = compact ? 90 : 126;
  const miniBox = h("div", { ...PANEL, position: "absolute", left: "6px", bottom: "6px", padding: "3px" });
  const cv = document.createElement("canvas");
  cv.width = MW; cv.height = MH;
  Object.assign(cv.style, { display: "block", width: `${MW}px`, height: `${MH}px`, cursor: "crosshair" });
  let miniOpen = !compact;
  const miniToggle = button(miniOpen ? "Map ▾" : "Map ▸", "Show or hide the plan minimap", () => {
    miniOpen = !miniOpen; miniToggle.textContent = miniOpen ? "Map ▾" : "Map ▸";
    cv.style.display = miniOpen ? "block" : "none"; });
  Object.assign(miniToggle.style, { marginBottom: "2px" });
  cv.style.display = miniOpen ? "block" : "none";
  miniBox.append(miniToggle, cv);
  const mm: Minimap = minimapOf(
    [Math.min(scene.fitMin[0], scene.plot?.x0 ?? Infinity), 0, Math.min(scene.fitMin[2], scene.plot?.z0 ?? Infinity)],
    [Math.max(scene.fitMax[0], scene.plot?.x1 ?? -Infinity), 0, Math.max(scene.fitMax[2], scene.plot?.z1 ?? -Infinity)],
    MW, MH);
  const drawMini = () => {
    const g = cv.getContext("2d");
    if (!g || !miniOpen) return;
    g.clearRect(0, 0, MW, MH);
    g.fillStyle = "rgba(120,140,100,0.25)";
    g.fillRect(0, 0, MW, MH);
    const P = (x: number, z: number) => toMini(mm, x, z);
    if (scene.plot) {
      const [a, b] = P(scene.plot.x0, scene.plot.z0), [d, e] = P(scene.plot.x1, scene.plot.z1);
      g.strokeStyle = "#868e96"; g.setLineDash([3, 2]); g.strokeRect(a, b, d - a, e - b); g.setLineDash([]);
    }
    g.strokeStyle = "#5c7cfa";
    for (const ar of scene.areas) {
      const [a, b] = P(ar.x0, ar.z0), [d, e] = P(ar.x1, ar.z1);
      g.strokeRect(a, b, d - a, e - b);
    }
    const col = colourPipes(scene.pipes, colourMode, facts).colours;
    scene.pipes.forEach((p, i) => {
      g.strokeStyle = css(col[i]!); g.lineWidth = 1.5; g.beginPath();
      p.points.forEach((q, k) => { const [x, y] = P(q[0], q[2]); if (k === 0) g.moveTo(x, y); else g.lineTo(x, y); });
      g.stroke();
    });
    g.lineWidth = 1;
    for (const s of scene.solids) {
      const [a, b] = P(s.center[0] - s.size[0] / 2, s.center[2] - s.size[2] / 2);
      g.fillStyle = s.flagged ? "#e8590c" : s.nonProcess ? "#cbb994" : "#495057";
      g.fillRect(a, b, Math.max(2, s.size[0] * mm.scale), Math.max(2, s.size[2] * mm.scale));
    }
    //  The camera: a dot and the heading wedge.
    const cp = mode === "orbit" ? camera.position : { x: free.pos[0], z: free.pos[2] };
    const dir = new c.THREE.Vector3(); camera.getWorldDirection(dir);
    const [px, py] = P(cp.x, cp.z);
    const yaw = Math.atan2(dir.x, -dir.z);
    g.fillStyle = "rgba(255,212,59,0.35)"; g.strokeStyle = "#f08c00";
    g.beginPath(); g.moveTo(px, py);
    g.arc(px, py, 22, yaw - Math.PI / 2 - 0.45, yaw - Math.PI / 2 + 0.45); g.closePath(); g.fill();
    g.beginPath(); g.arc(px, py, 3.2, 0, 2 * Math.PI); g.fillStyle = "#f08c00"; g.fill(); g.stroke();
  };
  const onMiniClick = (e: PointerEvent) => {
    const r = cv.getBoundingClientRect();
    const [x, z] = fromMini(mm, ((e.clientX - r.left) / r.width) * MW, ((e.clientY - r.top) / r.height) * MH);
    stopFlight();
    if (mode === "orbit") {
      const dx = x - controls.target.x, dz = z - controls.target.z;
      const p0: Vec3 = [camera.position.x, camera.position.y, camera.position.z];
      const t0: Vec3 = [controls.target.x, controls.target.y, controls.target.z];
      flight = { t0: performance.now(), ms: 700, step: (u) => {
        camera.position.set(p0[0] + dx * u, p0[1], p0[2] + dz * u);
        controls.target.set(t0[0] + dx * u, t0[1], t0[2] + dz * u);
        controls.update(); c.draw();
      } };
    } else {
      const b = freeBounds(scene, mode);
      free = { ...free, pos: [Math.min(b.max[0], Math.max(b.min[0], x)), free.pos[1],
                              Math.min(b.max[2], Math.max(b.min[2], z))] };
      apply();
    }
    tickLoop();
  };
  cv.addEventListener("pointerdown", onMiniClick);

  //  ---- the headline panel (bottom-right) ------------------------------
  const kpis = facts?.kpis ?? (c.layout ? layoutKpis(c.layout) : []);
  const kpiBox = h("div", { ...PANEL, position: "absolute", right: "6px", bottom: "6px", maxWidth: "210px" });
  let kpiOpen = !compact;
  const renderKpis = () => {
    kpiBox.replaceChildren(button(kpiOpen ? "Headline ▾" : "Headline ▸",
      "Show or hide the plant's headline numbers", () => { kpiOpen = !kpiOpen; renderKpis(); }));
    if (kpiOpen)
      for (const k of kpis) {
        const row = h("div", { display: "flex", justifyContent: "space-between", gap: "10px", marginTop: "2px" },
          undefined, [h("span", { opacity: "0.8" }, k.label), h("b", { whiteSpace: "nowrap" }, k.value)]);
        row.title = `from the result: ${k.source}`;
        kpiBox.appendChild(row);
      }
    if (kpiOpen && !facts)
      kpiBox.appendChild(h("div", { opacity: "0.7", marginTop: "3px" },
        "Layout block only: costs, sheets and composition need the run."));
  };
  if (kpis.length === 0) kpiBox.style.display = "none";

  //  ---- the card (right) and the tour (bottom) ---------------------------
  const cardBox = h("div", { ...PANEL, position: "absolute", display: "none",
    overflowY: "auto", ...(compact ? { left: "6px", right: "6px", bottom: "6px", maxHeight: "42%" }
                                   : { left: "6px", top: "44px", maxWidth: "290px", maxHeight: "55%" }) });
  function renderCard() {
    cardBox.replaceChildren();
    cardBox.style.display = selected ? "block" : "none";
    if (!selected) return;
    const x = button("×", "Close the card", () => select_(null));
    Object.assign(x.style, { float: "right" });
    cardBox.append(x, h("div", { fontWeight: "700", fontSize: "12px" }, selected.title),
                   h("div", { opacity: "0.75", marginBottom: "3px" }, selected.subtitle));
    const t = document.createElement("table");
    t.style.borderCollapse = "collapse";
    for (const r of selected.rows) {
      const tr = document.createElement("tr");
      tr.append(h("td", { opacity: "0.75", paddingRight: "8px", verticalAlign: "top", whiteSpace: "nowrap" }, r.label),
                h("td", { fontWeight: "600" }, r.value));
      t.appendChild(tr);
    }
    cardBox.appendChild(t);
    for (const n of selected.notes) cardBox.appendChild(h("div", { marginTop: "4px", opacity: "0.85" }, n));
  }
  const tourBox = h("div", { ...PANEL, position: "absolute", display: "none", left: "50%",
    transform: "translateX(-50%)", bottom: "6px", width: compact ? "calc(100% - 12px)" : "min(520px, 56%)",
    maxHeight: compact ? "44%" : "46%", overflowY: "auto", padding: "7px 9px" });
  if (compact) Object.assign(tourBox.style, { left: "6px", transform: "none" });
  function renderTour() {
    tourBox.replaceChildren();
    const steps = tour;
    tourBox.style.display = steps && tourAt >= 0 ? "block" : "none";
    renderLegend();
    if (!steps || tourAt < 0) return;
    const st = steps[tourAt]!;
    const auto = tourTimer !== 0;
    tourBox.append(
      h("div", { display: "flex", justifyContent: "space-between", gap: "8px" }, undefined, [
        h("b", { fontSize: "12px" }, st.title), h("span", { opacity: "0.7" }, `${tourAt + 1} / ${steps.length}`)]),
      h("ul", { margin: "3px 0 5px 14px", padding: "0" }, undefined, st.lines.map((l) => {
        const li = h("li", { marginBottom: "2px" }, l.text);
        li.title = `from the result: ${l.source}`;
        return li;
      })),
      h("div", { display: "flex", gap: "4px", flexWrap: "wrap" }, undefined, [
        button("Previous", "Previous stop", () => { stopAuto(); showStep(tourAt - 1); }),
        button("Next", "Next stop", () => { stopAuto(); showStep(tourAt + 1); }),
        button(auto ? "Pause" : "Continue", "Advance by itself every few seconds", () => {
          if (auto) { stopAuto(); renderTour(); return; }
          tourTimer = window.setInterval(() => {
            if (tourAt >= steps.length - 1) { stopAuto(); renderTour(); return; }
            showStep(tourAt + 1);
          }, TOUR_AUTO_MS);
          renderTour();
        }, auto),
        button("Exit", "Leave the tour", () => endTour())]));
  }
  const stopAuto = () => { window.clearInterval(tourTimer); tourTimer = 0; };

  //  ---- touch pads (walk / drone) -----------------------------------------
  const pads = h("div", { position: "absolute", left: "8px", bottom: compact ? "100px" : "150px",
    display: "none", gridTemplateColumns: "repeat(3, 30px)", gap: "3px", pointerEvents: "auto" });
  const pad = (label: string, key: keyof Keys, col: number, row: number, t: string) => {
    const b = button(label, t, () => undefined);
    Object.assign(b.style, { gridColumn: String(col), gridRow: String(row), height: "30px", touchAction: "none" });
    const set = (v: boolean) => { keys[key] = v; if (v) tickLoop(); };
    b.addEventListener("pointerdown", (e) => { e.preventDefault(); set(true); });
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, () => set(false));
    pads.appendChild(b);
  };
  pad("▲", "fwd", 2, 1, "Forward"); pad("◀", "left", 1, 2, "Left"); pad("▶", "right", 3, 2, "Right");
  pad("▼", "back", 2, 3, "Back"); pad("↑", "up", 1, 1, "Up (drone)"); pad("↓", "down", 3, 1, "Down (drone)");
  const padsVisible = () => { pads.style.display = mode === "orbit" ? "none" : "grid"; };

  layer.append(controlsBox, colourBox, miniBox, kpiBox, cardBox, tourBox, pads);

  //  ---- input -----------------------------------------------------------
  let down: { x: number; y: number; id: number; moved: boolean } | null = null;
  const onDown = (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
    if (mode !== "orbit") { stopFlight(); try { dom.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
    el.focus({ preventScroll: true });
  };
  const onMoveDrag = (e: PointerEvent) => {
    if (!down || e.pointerId !== down.id) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) down.moved = true;
    if (mode !== "orbit" && down.moved) {
      free = look(free, e.movementX ?? dx, e.movementY ?? dy);
      if (e.movementX === undefined) { down.x = e.clientX; down.y = e.clientY; }
      apply();
    }
  };
  const onUp = (e: PointerEvent) => {
    if (down && e.pointerId === down.id && !down.moved) onClick(e, c.raycast);
    down = null;
  };
  const onKey = (e: KeyboardEvent, v: boolean) => {
    if (mode === "orbit") return;
    const a = keyAction(e.code);
    if (!a) return;
    e.preventDefault();
    keys[a] = v;
    if (v) tickLoop();
  };
  const kd = (e: KeyboardEvent) => onKey(e, true), ku = (e: KeyboardEvent) => onKey(e, false);
  dom.addEventListener("pointerdown", onDown);
  dom.addEventListener("pointermove", onMoveDrag);
  window.addEventListener("pointerup", onUp);
  el.addEventListener("keydown", kd);
  el.addEventListener("keyup", ku);
  const blur = () => { for (const k of Object.keys(keys) as (keyof Keys)[]) keys[k] = false; };
  el.addEventListener("blur", blur);

  c.onFrame.push(() => { drawMini(); padsVisible(); });

  renderControls(); renderLegend(); renderKpis(); renderCard(); renderTour();
  recolour();

  return {
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      window.clearInterval(tourTimer);
      clearMarks();
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointermove", onMoveDrag);
      window.removeEventListener("pointerup", onUp);
      el.removeEventListener("keydown", kd);
      el.removeEventListener("keyup", ku);
      el.removeEventListener("blur", blur);
      layer.remove();
    },
  };
}
