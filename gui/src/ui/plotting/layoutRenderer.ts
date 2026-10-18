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
  layoutRenderer -- the three.js drawing of a `LayoutScene`, with no React in
  it (DEV.md 4c C75, C78, C80, C81, C88).

  Moved VERBATIM out of PlantLayout3D.tsx on 2026-10-17 (C81) when a second
  caller arrived: the self-contained page "Export as page" writes
  (case/layoutExport.ts, export/layoutViewer.ts) draws the plant with THIS
  function, compiled into the page together with three.js and the SAME pure
  mapping (case/plantLayout.ts).  So the app's three surfaces (Reports, the
  `?layout=` tab, the EduTool bench) and every exported file draw one scene
  one way; there is no second copy of the drawing to drift.

  three.js is handed IN (`LayoutModules`), never imported here: the app
  imports it on demand the first time a layout is shown, the exported page
  carries it bundled, and this module type-checks against both without
  pulling three.js into the index chunk.  Everything used is three.js itself
  or an addon it ships (`three/examples/jsm`): no other library, so the
  exported page still opens with no network.

  WHAT IS DRAWN (C88: "the layout made to look like a plant").  Every placed
  item is drawn BY ITS EQUIPMENT KIND (case/equipmentModel.ts, pure and
  tested): a vessel with its 2:1 heads and a skirt or legs, a tall item with
  a caged ladder and platforms, an exchanger with its channel head, flanges,
  nozzles and saddles, a storage tank with its cone roof, a stirred tank
  with its agitator drive, a compressor on its skid; a kind with no drawing
  keeps the plain cylinder or box.  The BODY fills the engine's envelope and
  nothing else; ladders, platforms, nozzles and saddles are decoration (that
  module's header says which and why).  Materials are physically based --
  stainless shells, painted steel, concrete -- lit by an environment map and
  a sun with soft shadows, tone-mapped (ACES) to sRGB, with ambient
  occlusion; on a ground of grass, the plot in gravel and each sector area a
  concrete pad.  Hazardous-area zones are translucent cylinders whose zones
  differ by opacity AND edge style AND the word in their label (zone labels
  OFF by default: they are the first thing to crowd a plant).  An item the
  engine named in a finding is painted safety orange, outlined (in "high"
  quality) and its label carries a warning glyph; a separation shortfall is
  a dashed line tagged with both distances.  The wind is an arrow pointing
  where it blows.

  THE PIPES (C80, C88): each published route as a translucent tube coloured
  by phase, with a BEND at every corner of the route (the route itself is the
  engine's; the bend radius is drawing, a few pipe radii), on a steel rack
  with portals, tier beams and longitudinal stringers; the junctions on it;
  and an ANIMATED stylised flow: particles moving along the route in the
  direction of flow, SHAPED by phase (sphere liquid, octahedron vapour, the
  two alternating in a two-phase pipe -- the channel that survives
  greyscale), at a speed that is a stated monotone function of the published
  mass flow.

  THE ROADS (C90): each road the engine checked as asphalt on its centre
  line and width, with white edge lines and a dashed centre line that stop
  where the road meets another; the gate's barrier arm, red and white,
  across the road at the point the engine published; the site buildings by
  their kind (case/equipmentModel.ts SITE_MODELS).  The rack's portals give
  way to a road that passes under it (case/plantLayout.ts rackPortals).

  QUALITY.  "high" adds the soft shadows, the ambient occlusion and the
  finding outline and renders at the device pixel ratio; "fast" drops all
  three and renders at one pixel per CSS pixel, for a weak laptop.  The
  scene is the same either way.

  LEGIBILITY.  A label is the item id; the rest is the hover TOOLTIP.  Labels
  that collide on screen are decluttered every frame by priority (findings,
  then items, then the rest, then zone labels).  The camera opens FITTED on
  the plant; `fit` returns to it, and Plan / Elevation are fitted the same
  way.  Orbit with the left button (one finger), pan with the right (two
  fingers), zoom with the wheel (pinch).
\*---------------------------------------------------------------------------*/

import type * as T3 from "three";
import type { OrbitControls as OrbitControlsT } from "three/examples/jsm/controls/OrbitControls.js";
import type {
  CSS2DObject as CSS2DObjectT, CSS2DRenderer as CSS2DRendererT,
} from "three/examples/jsm/renderers/CSS2DRenderer.js";
import type { RoomEnvironment as RoomEnvironmentT } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { mergeGeometries as mergeGeometriesT } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { EffectComposer as EffectComposerT } from "three/examples/jsm/postprocessing/EffectComposer.js";
import type { RenderPass as RenderPassT } from "three/examples/jsm/postprocessing/RenderPass.js";
import type { GTAOPass as GTAOPassT } from "three/examples/jsm/postprocessing/GTAOPass.js";
import type { OutlinePass as OutlinePassT } from "three/examples/jsm/postprocessing/OutlinePass.js";
import type { OutputPass as OutputPassT } from "three/examples/jsm/postprocessing/OutputPass.js";

import { equipmentDrawing, type Part, type PartRole } from "../../case/equipmentModel.js";
import {
  cameraFit, declutter, LABEL_PRIORITY, PHASE_COLOURS, pointAlong,
  type LabelBox, type LayoutScene, type Phase, type RenderQuality, type Vec3, type ViewPreset,
} from "../../case/plantLayout.js";

/** The least height a "fill" view draws at, so a squeezed window still
 *  shows a scene rather than a sliver. */
export const FILL_MIN_HEIGHT = 240;
/** The camera's vertical field of view (deg); `cameraFit` is told it. */
export const FOV = 45;

const COLOURS = {
  area:      0x5c7cfa,
  zone:      0xf08c00,
  link:      0xe03131,
  wind:      0x1c7ed6,
  outline:   0xff4d00,
};

/** The look of each part role (case/equipmentModel.ts): colour, metalness,
 *  roughness.  `body` is chosen per item (process / non-process / flagged). */
const ROLE_LOOK: Record<Exclude<PartRole, "body">, [number, number, number]> = {
  steel:    [0x56606b, 0.7, 0.5],     // painted structural steel
  grating:  [0x6f757c, 0.6, 0.75],
  safety:   [0xe3ad00, 0.2, 0.45],    // handrails, ladder cages, guards
  machine:  [0x3b6a8a, 0.35, 0.45],
  motor:    [0x2d5ea8, 0.3, 0.4],
  concrete: [0xb7b2a8, 0.0, 0.95],
  glass:    [0x3d5a73, 0.6, 0.15],    // glazing
  roof:     [0x7a8791, 0.6, 0.45],    // profiled steel sheet
};

/** Road surface and markings (C90). */
const ROAD_LOOK = {
  asphalt: [62, 64, 66] as [number, number, number],
  edge: 0xf1f3f5,
  centre: 0xf1f3f5,
  barrierRed: 0xd9480f,
  barrierWhite: 0xf8f9fa,
};
/** Marking width, edge-line inset from the paved edge, and the centre line's
 *  dash and gap (m): drawing conventions, not a road standard's. */
const MARKING = { width: 0.15, inset: 0.3, dash: 3, gap: 3 };
const BODY_LOOK = {
  process:    [0xd3d8de, 0.85, 0.3] as [number, number, number],   // stainless
  nonProcess: [0xcbb994, 0.05, 0.85] as [number, number, number],  // a building's render
  flagged:    [0xe8590c, 0.25, 0.45] as [number, number, number],  // safety orange
};

/** What the reader switched on. */
export interface Toggles { flow: boolean; pipes: boolean; zones: boolean; zoneLabels: boolean }

/** The three.js classes the drawing uses -- named, so the exported page's
 *  bundle can leave the rest of three.js out (export/layoutViewer.ts). */
export type ThreeUsed = Pick<typeof T3,
  "ACESFilmicToneMapping" | "ArrowHelper" | "BoxGeometry" | "BufferGeometry" | "CanvasTexture" | "LineSegments"
  | "CylinderGeometry" | "DirectionalLight" | "DoubleSide" | "Fog" | "Group"
  | "HalfFloatType" | "HemisphereLight" | "InstancedMesh" | "Line" | "LineBasicMaterial"
  | "LineDashedMaterial" | "LineLoop" | "Matrix4" | "Mesh" | "MeshBasicMaterial" | "MeshLambertMaterial"
  | "MeshStandardMaterial" | "OctahedronGeometry" | "PCFSoftShadowMap" | "PerspectiveCamera"
  | "PlaneGeometry" | "PMREMGenerator" | "Quaternion" | "Raycaster" | "RepeatWrapping" | "Scene"
  | "SphereGeometry" | "SRGBColorSpace" | "TorusGeometry" | "Vector2" | "Vector3"
  | "WebGLRenderer" | "WebGLRenderTarget">;

/** The post-processing passes "high" quality uses. */
export interface PostModules {
  EffectComposer: typeof EffectComposerT;
  RenderPass: typeof RenderPassT;
  GTAOPass: typeof GTAOPassT;
  OutlinePass: typeof OutlinePassT;
  OutputPass: typeof OutputPassT;
}

/** three.js and the addons the drawing uses, handed in by the caller.
 *  `post` absent: the view renders directly (no ambient occlusion and no
 *  outline even in "high"), and says nothing is missing because nothing
 *  the engine published depends on it. */
export interface LayoutModules {
  THREE: ThreeUsed;
  OrbitControls: typeof OrbitControlsT;
  CSS2DRenderer: typeof CSS2DRendererT;
  CSS2DObject: typeof CSS2DObjectT;
  RoomEnvironment: typeof RoomEnvironmentT;
  mergeGeometries: typeof mergeGeometriesT;
  post?: PostModules;
}

/** A mounted view: what the toolbar drives, and how to take it down. */
export interface LayoutView {
  setToggles(t: Toggles): void;
  setQuality(q: RenderQuality): void;
  fit(view: ViewPreset): void;
  dispose(): void;
}

export interface MountOptions {
  /** A pixel height, or "fill": take the height of the box `el` is and
   *  follow it when the window is resized. */
  height: number | "fill";
  toggles: Toggles;
  view: ViewPreset;
  /** Default "high". */
  quality?: RenderQuality;
}

/** THE SCENE IS ALWAYS IN DAYLIGHT (DEV.md 4c C90).  Until 2026-10-18 the
 *  sky, the lights, the grass, the gravel and the pads followed the page's
 *  colour scheme (the app's, else `prefers-color-scheme`) into a NIGHT
 *  palette, so a reader whose browser is dark opened an exported page on a
 *  near-black scene -- the export has no app scheme to read, and fell to the
 *  system's -- while the app in its light scheme showed the day.  A plot
 *  plan is a drawing of ground, steel and sky, and one plant is drawn one
 *  way: only the page CHROME (labels, tooltips, panels) follows the theme,
 *  through CSS `light-dark()`, and nothing here reads the scheme. */
export const DAYLIGHT = {
  exposure: 1.0,
  skyTop: "#6f9fd8",
  skyHorizon: "#dbe6ef",
  environment: 0.55,
  hemisphereSky: 0xdfeeff,
  hemisphereGround: 0x5b6a48,
  hemisphere: 0.9,
  sunColour: 0xfff1dc,
  sun: 2.8,
  grass: [98, 126, 70] as [number, number, number],
  gravel: [150, 144, 133] as [number, number, number],
  grid: 0x55524c,
  pad: [196, 193, 186] as [number, number, number],
} as const;

/** Draw `scene` into `el` and return the handle.  Throws what three.js
 *  throws (no WebGL); the caller says so in words. */
export function mountLayoutScene(m: LayoutModules, el: HTMLDivElement, scene: LayoutScene,
                                 opts: MountOptions): LayoutView {
  const { THREE, OrbitControls, CSS2DRenderer, CSS2DObject } = m;
  const height = opts.height;
  const heightOf = () =>
    height === "fill" ? Math.max(el.clientHeight, FILL_MIN_HEIGHT) : height;
  const width = Math.max(el.clientWidth, 320);
  const h0 = heightOf();
  let quality: RenderQuality = opts.quality ?? "high";
  const dpr = window.devicePixelRatio || 1;
  const pixelRatio = () => (quality === "high" ? Math.min(dpr, 2) : 1);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(width, h0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = DAYLIGHT.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = quality === "high";
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  //  The plant does not move: the shadow map is drawn once and again only
  //  when what casts a shadow changes (quality, the pipes toggle).
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
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

  const disposables: { dispose(): void }[] = [];
  const keep = <D extends { dispose(): void }>(d: D): D => { disposables.push(d); return d; };

  const [x0, , z0] = scene.min;
  const [x1, y1, z1] = scene.max;
  const span = Math.max(x1 - x0, z1 - z0, y1, 10);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;

  //  ---- sky, environment, light -----------------------------------------
  const world = new THREE.Scene();
  const skyTop = DAYLIGHT.skyTop;
  const skyHorizon = DAYLIGHT.skyHorizon;
  const sky = (() => {
    const c = document.createElement("canvas");
    c.width = 2; c.height = 256;
    const g = c.getContext("2d");
    if (g) {
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, skyTop);
      grad.addColorStop(1, skyHorizon);
      g.fillStyle = grad;
      g.fillRect(0, 0, 2, 256);
    }
    const t = keep(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  world.background = sky;
  world.fog = new THREE.Fog(skyHorizon, span * 2.5, span * 9);

  //  Image-based light from three.js's own neutral room: the reflections a
  //  metal surface needs to read as metal.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new m.RoomEnvironment();
  const envTex = keep(pmrem.fromScene(room, 0.04).texture);
  room.dispose();
  pmrem.dispose();
  world.environment = envTex;
  world.environmentIntensity = DAYLIGHT.environment;

  world.add(new THREE.HemisphereLight(DAYLIGHT.hemisphereSky, DAYLIGHT.hemisphereGround,
                                      DAYLIGHT.hemisphere));
  const sun = new THREE.DirectionalLight(DAYLIGHT.sunColour, DAYLIGHT.sun);
  //  From the south-east and high: the shadows fall to the north-west, beside
  //  the items as the default camera (south-west) sees them.
  const sunDir = new THREE.Vector3(0.55, 1.0, 0.45).normalize();
  const reach = Math.hypot(x1 - x0, z1 - z0) / 2 + y1 + 5;
  sun.position.set(cx + sunDir.x * reach * 2, sunDir.y * reach * 2, cz + sunDir.z * reach * 2);
  sun.target.position.set(cx, 0, cz);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -reach;
  sun.shadow.camera.right = reach;
  sun.shadow.camera.top = reach;
  sun.shadow.camera.bottom = -reach;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = reach * 4;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04 * Math.max(1, reach / 50);
  sun.shadow.radius = 3;
  world.add(sun);
  world.add(sun.target);

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

  //  ---- the ground: grass, the plot in gravel, a concrete pad per sector --
  /** A small tiling noise texture: the grain that keeps a large flat
   *  colour from reading as a CAD fill.  Drawing only. */
  const noise = (base: [number, number, number], amp: number, repeat: number) => {
    const n = 128;
    const c = document.createElement("canvas");
    c.width = n; c.height = n;
    const g = c.getContext("2d");
    if (g) {
      const img = g.createImageData(n, n);
      let seed = 1234567;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < n * n; i++) {
        const k = (rnd() - 0.5) * 2 * amp;
        img.data[4 * i] = Math.max(0, Math.min(255, base[0] + k));
        img.data[4 * i + 1] = Math.max(0, Math.min(255, base[1] + k));
        img.data[4 * i + 2] = Math.max(0, Math.min(255, base[2] + k));
        img.data[4 * i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    }
    const t = keep(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    return t;
  };
  /** A ground layer; `layer` orders the coplanar layers by polygon offset
   *  (0 on top), so no layer needs lifting off the grade.  Lambert, not
   *  PBR: a matte ground looks the same and costs a fraction per pixel,
   *  and the ground is most of the pixels. */
  const groundMat = (tex: T3.Texture, layer: number) => keep(new THREE.MeshLambertMaterial({
    map: tex,
    polygonOffset: true, polygonOffsetFactor: layer, polygonOffsetUnits: layer,
  }));
  const groundPlane = (w: number, d: number, at: [number, number], mat: T3.Material) => {
    const p = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, d)), mat);
    p.rotation.x = -Math.PI / 2;
    p.position.set(at[0], 0, at[1]);
    p.receiveShadow = true;
    world.add(p);
    return p;
  };
  const plotRect = scene.plot
    ?? { x0: x0 - 5, x1: x1 + 5, z0: z0 - 5, z1: z1 + 5 };
  {
    //  Grass round the plot, as four strips (not one plane under it: the
    //  ground is most of the pixels, and nothing is drawn twice).
    const G = span * 7;
    const grass = groundMat(noise(DAYLIGHT.grass, 18, 1), 4);
    (grass.map as T3.Texture).repeat.set(G / 2, G / 2);
    const { x0: px0, x1: px1, z0: pz0, z1: pz1 } = plotRect;
    const gx0 = cx - G, gx1 = cx + G, gz0 = cz - G, gz1 = cz + G;
    const strip = (ax: number, bx: number, az: number, bz: number) => {
      if (bx - ax <= 0 || bz - az <= 0) return;
      const p = groundPlane(bx - ax, bz - az, [(ax + bx) / 2, (az + bz) / 2], grass);
      //  The grain stays the same size on every strip.
      const g = p.geometry as T3.BufferGeometry;
      const uv = g.getAttribute("uv") as T3.BufferAttribute;
      for (let i = 0; i < uv.count; i++)
        uv.setXY(i, (ax + uv.getX(i) * (bx - ax) - gx0) / (2 * G),
                    (az + (1 - uv.getY(i)) * (bz - az) - gz0) / (2 * G));
      uv.needsUpdate = true;
    };
    strip(gx0, gx1, gz0, pz0);
    strip(gx0, gx1, pz1, gz1);
    strip(gx0, px0, pz0, pz1);
    strip(px1, gx1, pz0, pz1);
    const w = px1 - px0, d = pz1 - pz0;
    const gravel = groundMat(noise(DAYLIGHT.gravel, 30, 1), 2);
    (gravel.map as T3.Texture).repeat.set(w / 3, d / 3);
    groundPlane(w, d, [(px0 + px1) / 2, (pz0 + pz1) / 2], gravel);
  }

  //  Ground grid over the plot only, faint: the scale a reader measures
  //  against (1, 5 or 10 m cells, on whole metres of the plan).
  {
    const cell = span > 200 ? 10 : span > 60 ? 5 : 1;
    const pts: T3.Vector3[] = [];
    const { x0: px0, x1: px1, z0: pz0, z1: pz1 } = plotRect;
    for (let x = Math.ceil(px0 / cell) * cell; x <= px1; x += cell)
      pts.push(new THREE.Vector3(x, 0.02, pz0), new THREE.Vector3(x, 0.02, pz1));
    for (let z = Math.ceil(pz0 / cell) * cell; z <= pz1; z += cell)
      pts.push(new THREE.Vector3(px0, 0.02, z), new THREE.Vector3(px1, 0.02, z));
    world.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: DAYLIGHT.grid, transparent: true,
                                    opacity: 0.18, depthWrite: false })));
  }

  //  Sector areas: a concrete pad and its outline.
  for (const a of scene.areas) {
    const w = a.x1 - a.x0, d = a.z1 - a.z0;
    const pad = groundMat(noise(DAYLIGHT.pad, 10, 1), 0);
    (pad.map as T3.Texture).repeat.set(w / 4, d / 4);
    groundPlane(w, d, [(a.x0 + a.x1) / 2, (a.z0 + a.z1) / 2], pad);
    const pts = [[a.x0, a.z0], [a.x1, a.z0], [a.x1, a.z1], [a.x0, a.z1]]
      .map(([x, z]) => new THREE.Vector3(x, 0.03, z));
    world.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: COLOURS.area, fog: false })));
    label(a.label, [a.x0, 0.05, a.z0], LABEL_PRIORITY.other);
  }

  //  The plot (C82): the engine's published rectangle, a dashed outline on
  //  the ground and its area as the label.
  if (scene.plot) {
    const a = scene.plot;
    const pts = [[a.x0, a.z0], [a.x1, a.z0], [a.x1, a.z1], [a.x0, a.z1]]
      .map(([x, z]) => new THREE.Vector3(x, 0.04, z));
    const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({ color: COLOURS.area, dashSize: 2, gapSize: 1.5, fog: false }));
    outline.computeLineDistances();
    world.add(outline);
    label(a.label, [a.x1, 0.05, a.z1], LABEL_PRIORITY.other);
  }

  //  ---- the items, by kind -----------------------------------------------
  const std = (look: [number, number, number]) => keep(new THREE.MeshStandardMaterial({
    color: look[0], metalness: look[1], roughness: look[2] }));
  const roleMat = new Map<PartRole, T3.Material>();
  for (const [role, look] of Object.entries(ROLE_LOOK)) roleMat.set(role as PartRole, std(look));
  const bodyMat = {
    process: std(BODY_LOOK.process),
    nonProcess: std(BODY_LOOK.nonProcess),
    flagged: std(BODY_LOOK.flagged),
  };

  const up = new THREE.Vector3(0, 1, 0);
  const segs = (r: number) => (r < 0.06 ? 6 : r < 0.3 ? 12 : r < 2 ? 32 : 48);
  /** A part (equipmentModel's description) as a three.js geometry. */
  const geometryOf = (p: Part): T3.BufferGeometry => {
    let g: T3.BufferGeometry;
    const toAxis = (a: "x" | "y" | "z") => {
      if (a === "x") g.rotateZ(-Math.PI / 2);   // +y to +x
      else if (a === "z") g.rotateX(Math.PI / 2); // +y to +z
    };
    switch (p.prim) {
      case "box":
        g = new THREE.BoxGeometry(p.size[0], p.size[1], p.size[2]);
        if (p.yaw) g.rotateY(p.yaw);
        break;
      case "cylinder": {
        const r = Math.max(p.rStart, p.rEnd);
        //  CylinderGeometry's theta is measured from +Z toward +X; the
        //  model's phi from +X toward +Z: theta = pi/2 - phi.
        g = p.arc
          ? new THREE.CylinderGeometry(p.rEnd, p.rStart, p.length, segs(r), 1, false,
              Math.PI / 2 - (p.arc[0] + p.arc[1]), p.arc[1])
          : new THREE.CylinderGeometry(p.rEnd, p.rStart, p.length, segs(r), 1, false);
        if (typeof p.axis === "string") toAxis(p.axis);
        else g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up,
          new THREE.Vector3(...p.axis).normalize()));
        break;
      }
      case "head":
        g = new THREE.SphereGeometry(p.r, segs(p.r), 10, 0, 2 * Math.PI, 0, Math.PI / 2);
        g.scale(1, p.depth / p.r, 1);
        if (p.sign < 0) g.rotateX(Math.PI);
        toAxis(p.axis);
        break;
      case "ring":
        g = new THREE.TorusGeometry(p.R, p.r, 5, Math.max(8, Math.round(24 * p.arc[1])), p.arc[1]);
        g.rotateX(Math.PI / 2);     // the XY ring into the XZ plane, theta = phi
        g.rotateY(-p.arc[0]);       // start at phi = arc[0]
        break;
      case "prism": {
        //  A three-sided cylinder whose first vertex points UP once its axis
        //  is turned to plan x: apex at +1, base at -1/2, half-width
        //  sqrt(3)/2; then moved and scaled onto the declared base, width
        //  and rise.  Flat-shaded (non-indexed), as a roof's planes are.
        g = new THREE.CylinderGeometry(1, 1, p.length, 3, 1, false, -Math.PI / 2);
        g.rotateZ(-Math.PI / 2);            // +y to +x: the old -x becomes +y
        g.translate(0, 0.5, 0);
        g.scale(1, p.rise / 1.5, p.width / Math.sqrt(3));
        if (p.axis === "z") g.rotateY(Math.PI / 2);
        g = g.toNonIndexed();
        g.computeVertexNormals();
        break;
      }
    }
    g.translate(p.at[0], p.at[1], p.at[2]);
    return g;
  };

  const pickables: T3.Object3D[] = [];
  const flaggedMeshes: T3.Object3D[] = [];
  for (const s of scene.solids) {
    const drawing = equipmentDrawing(s);
    const tooltip = [...s.tooltip.slice(0, 2), `drawn as: ${drawing.describes}`,
                     ...s.tooltip.slice(2)];
    //  The material of a part: a FLAGGED item's envelope parts are safety
    //  orange whatever they are made of (its decoration keeps its own);
    //  otherwise the role's, `body` being the item's own.
    const matOf = (p: Part): [string, T3.Material] => {
      if (s.flagged && !p.decoration) return ["flagged", bodyMat.flagged];
      if (p.role !== "body") return [p.role, roleMat.get(p.role)!];
      return s.nonProcess ? ["nonProcess", bodyMat.nonProcess] : ["process", bodyMat.process];
    };
    const byMat = new Map<string, { mat: T3.Material; geoms: T3.BufferGeometry[]; envelope: boolean }>();
    for (const p of drawing.parts) {
      const [key, mat] = matOf(p);
      const e = byMat.get(key) ?? { mat, geoms: [], envelope: false };
      e.geoms.push(geometryOf(p));
      e.envelope ||= !p.decoration;
      byMat.set(key, e);
    }
    const group = new THREE.Group();
    group.position.set(...s.center);
    for (const { mat, geoms: g0, envelope } of byMat.values()) {
      //  One mesh per material: a ladder of a hundred rungs is one draw.
      //  A roof prism is non-indexed; merging needs one kind, so a group
      //  holding both goes non-indexed whole.
      const geoms = g0.some((g) => !g.index) && g0.some((g) => g.index)
        ? g0.map((g) => { if (!g.index) return g; const n = g.toNonIndexed(); g.dispose(); return n; })
        : g0;
      const merged = geoms.length === 1 ? geoms[0]! : m.mergeGeometries(geoms, false);
      if (geoms.length > 1) for (const g of geoms) g.dispose();
      if (!merged) continue;
      keep(merged);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.tooltip = tooltip;
      group.add(mesh);
      pickables.push(mesh);
      if (s.flagged && envelope) flaggedMeshes.push(mesh);
    }
    world.add(group);
    label(s.label, [s.center[0], s.center[1] + s.size[1] / 2 + 0.6, s.center[2]],
      s.flagged ? LABEL_PRIORITY.finding : LABEL_PRIORITY.item, s.flagged);
  }

  //  ---- the roads (C90): asphalt, edge and centre lines, the barrier ------
  if (scene.roads.length > 0) {
    const asphalt = groundMat(noise(ROAD_LOOK.asphalt, 10, 1), -1);
    (asphalt.map as T3.Texture).repeat.set(span / 4, span / 4);
    const markings: T3.BufferGeometry[] = [];
    /** A flat marking strip from (ax, az) to (bx, bz), `w` wide, at grade. */
    const strip = (ax: number, az: number, bx: number, bz: number, w: number) => {
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-3) return;
      const g = new THREE.PlaneGeometry(len, w);
      g.rotateX(-Math.PI / 2);
      g.rotateY(-Math.atan2(bz - az, bx - ax));
      g.translate((ax + bx) / 2, 0.01, (az + bz) / 2);
      markings.push(g);
    };
    const pavedPlane = (x0: number, x1: number, z0: number, z1: number) => {
      const p = groundPlane(x1 - x0, z1 - z0, [(x0 + x1) / 2, (z0 + z1) / 2], asphalt);
      //  The grain stays one size on every slab.
      const g = p.geometry as T3.BufferGeometry;
      const uv = g.getAttribute("uv") as T3.BufferAttribute;
      for (let i = 0; i < uv.count; i++)
        uv.setXY(i, (x0 + uv.getX(i) * (x1 - x0)) / span, (z0 + (1 - uv.getY(i)) * (z1 - z0)) / span);
      uv.needsUpdate = true;
      p.userData.tooltip = undefined;
      return p;
    };
    for (const r of scene.roads) {
      const h = r.width / 2;
      const n = r.points.length;
      for (let i = 0; i + 1 < n; i++) {
        const a = r.points[i]!, b = r.points[i + 1]!;
        const x0 = Math.min(a[0], b[0]) - h, x1 = Math.max(a[0], b[0]) + h;
        const z0 = Math.min(a[2], b[2]) - h, z1 = Math.max(a[2], b[2]) + h;
        const slab = pavedPlane(x0, x1, z0, z1);
        slab.userData.tooltip = r.tooltip;
        pickables.push(slab);
        //  Markings stop a road-width short of a corner or a junction, and
        //  run to a free end.
        const dx = Math.sign(b[0] - a[0]), dz = Math.sign(b[2] - a[2]);
        const startFree = i === 0 && r.freeStart, endFree = i + 2 === n && r.freeEnd;
        const t0 = startFree ? 0.5 : h + 0.5, t1 = endFree ? 0.5 : h + 0.5;
        const ax = a[0] + dx * t0, az = a[2] + dz * t0;
        const bx = b[0] - dx * t1, bz = b[2] - dz * t1;
        if ((bx - ax) * dx + (bz - az) * dz <= 0) continue;
        const ox = -dz * (h - MARKING.inset), oz = dx * (h - MARKING.inset);
        strip(ax + ox, az + oz, bx + ox, bz + oz, MARKING.width);
        strip(ax - ox, az - oz, bx - ox, bz - oz, MARKING.width);
        const len = Math.hypot(bx - ax, bz - az);
        for (let s = 0; s + MARKING.dash <= len + 1e-9; s += MARKING.dash + MARKING.gap)
          strip(ax + dx * s, az + dz * s, ax + dx * (s + MARKING.dash), az + dz * (s + MARKING.dash),
                MARKING.width);
      }
      const mid = r.points[Math.floor((n - 1) / 2)]!, nxt = r.points[Math.floor((n - 1) / 2) + 1]!;
      label(r.road, [(mid[0] + nxt[0]) / 2, 0.3, (mid[2] + nxt[2]) / 2], LABEL_PRIORITY.other,
            r.disconnected);
    }
    if (markings.length) {
      const merged = m.mergeGeometries(markings, false);
      for (const g of markings) g.dispose();
      if (merged) {
        keep(merged);
        world.add(new THREE.Mesh(merged, keep(new THREE.MeshLambertMaterial({
          color: ROAD_LOOK.edge, polygonOffset: true, polygonOffsetFactor: -2,
          polygonOffsetUnits: -2 }))));
      }
    }
  }
  //  A gate's barrier arm: a post and a red-and-white striped arm across
  //  the road (drawing, at the point the engine published for the gate).
  for (const b of scene.barriers) {
    const [px, , pz] = b.post, [ex, ey, ez] = b.end;
    const post = new THREE.Mesh(keep(new THREE.BoxGeometry(0.35, ey + 0.2, 0.35)),
                                roleMat.get("steel")!);
    post.position.set(px, (ey + 0.2) / 2, pz);
    post.castShadow = true;
    world.add(post);
    const len = Math.hypot(ex - px, ez - pz);
    const stripes = Math.max(2, Math.round(len / 0.6));
    const red = std([ROAD_LOOK.barrierRed, 0.1, 0.5]);
    const white = std([ROAD_LOOK.barrierWhite, 0.1, 0.5]);
    for (let k = 0; k < stripes; k++) {
      const t0 = k / stripes, t1 = (k + 1) / stripes;
      const seg = new THREE.Mesh(keep(new THREE.BoxGeometry(len / stripes, 0.1, 0.1)),
                                 k % 2 ? white : red);
      seg.position.set(px + (ex - px) * (t0 + t1) / 2, ey, pz + (ez - pz) * (t0 + t1) / 2);
      seg.rotation.y = -Math.atan2(ez - pz, ex - px);
      seg.castShadow = true;
      world.add(seg);
    }
  }

  //  ---- zones: opacity + edge style + the word (the word on demand) ------
  const zoneGroup = new THREE.Group();
  world.add(zoneGroup);
  for (const z of scene.zones) {
    const geom = new THREE.CylinderGeometry(z.radius, z.radius, z.height, 48, 1, true);
    const fill = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({
      color: COLOURS.zone, transparent: true, opacity: z.opacity, fog: false, toneMapped: false,
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
          ? new THREE.LineDashedMaterial({ color: COLOURS.zone, dashSize: 0.8, gapSize: 0.6,
                                           fog: false, toneMapped: false })
          : new THREE.LineBasicMaterial({ color: COLOURS.zone, fog: false, toneMapped: false }));
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
      new THREE.LineDashedMaterial({ color: COLOURS.link, dashSize: 0.4, gapSize: 0.3,
                                     fog: false, toneMapped: false }));
    line.computeLineDistances();
    world.add(line);
    label(l.label, [(l.from[0] + l.to[0]) / 2, (l.from[1] + l.to[1]) / 2 + 0.5,
                    (l.from[2] + l.to[2]) / 2], LABEL_PRIORITY.finding, true);
  }

  //  ---- the pipes (C80) and their rack -----------------------------------
  const pipeGroup = new THREE.Group();
  world.add(pipeGroup);
  if (scene.rack) {
    //  A drawing of a rack, not a structural design: H-section portals at
    //  the scene's portal spacing (RACK_PORTAL_SPACING) on concrete
    //  pedestals, a beam per tier the lanes use, a stringer along each edge
    //  of each tier.  The tiers and the width are the engine's.
    const r = scene.rack;
    const top = r.tiers[r.tiers.length - 1]!;
    const steel: T3.BufferGeometry[] = [];
    const concrete: T3.BufferGeometry[] = [];
    const bx = (sx: number, sy: number, sz: number, x: number, y: number, z: number,
                into: T3.BufferGeometry[]) => {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      g.translate(x, y, z);
      into.push(g);
    };
    const w = 2 * r.halfWidth + 0.4;
    for (const x of r.portals) {
      for (const dz of [-r.halfWidth - 0.2, r.halfWidth + 0.2]) {
        bx(0.3, top, 0.3, x, top / 2, r.zc + dz, steel);
        bx(0.7, 0.3, 0.7, x, 0.15, r.zc + dz, concrete);
      }
      for (const ty of r.tiers) bx(0.25, 0.3, w, x, ty - 0.35, r.zc, steel);
    }
    for (const ty of r.tiers)
      for (const dz of [-r.halfWidth - 0.2, r.halfWidth + 0.2])
        bx(r.x1 - r.x0, 0.22, 0.18, (r.x0 + r.x1) / 2, ty - 0.35, r.zc + dz, steel);
    for (const [geoms, role] of [[steel, "steel"], [concrete, "concrete"]] as const) {
      const merged = m.mergeGeometries(geoms, false);
      for (const g of geoms) g.dispose();
      if (!merged) continue;
      keep(merged);
      const mesh = new THREE.Mesh(merged, roleMat.get(role)!);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      pipeGroup.add(mesh);
    }
    label(r.label, [r.x0, top + 1, r.zc], LABEL_PRIORITY.other);
  }
  const junctionMat = std([0x3f474f, 0.75, 0.4]);
  for (const j of scene.junctions) {
    const mesh = new THREE.Mesh(keep(new THREE.SphereGeometry(0.45, 20, 14)), junctionMat);
    mesh.position.set(...j.at);
    mesh.castShadow = true;
    mesh.userData.tooltip = [j.label, "a junction on the rack: an unsized unit the pipes pass through"];
    pipeGroup.add(mesh);
    pickables.push(mesh);
    label(j.label, [j.at[0], j.at[1] + 0.9, j.at[2]], LABEL_PRIORITY.other);
  }

  const tubeMat = new Map<Phase, T3.Material>();
  for (const ph of ["liquid", "vapour", "twoPhase", "unknown"] as Phase[])
    tubeMat.set(ph, keep(new THREE.MeshStandardMaterial({ color: PHASE_COLOURS[ph],
      transparent: true, opacity: 0.45, roughness: 0.2, metalness: 0.1, depthWrite: false })));
  /** One pipe as ONE geometry: a straight run per leg of the engine's route
   *  and a bend at each corner (radius a few pipe radii, never more than
   *  half the shorter leg -- drawing, not routing). */
  const pipeGeometry = (pts: Vec3[], radius: number): T3.BufferGeometry | null => {
    const P = pts.map((q) => new THREE.Vector3(...q));
    //  Drop repeated points (a zero-length leg has no direction).
    const Q = P.filter((q, i) => i === 0 || q.distanceTo(P[i - 1]!) > 1e-6);
    if (Q.length < 2) return null;
    const parts: T3.BufferGeometry[] = [];
    const trimStart: number[] = Q.map(() => 0);   // trim at the START of leg i
    const trimEnd: number[] = Q.map(() => 0);     // trim at the END of leg i
    const radial = radius < 0.2 ? 10 : 14;
    for (let i = 1; i + 1 < Q.length; i++) {
      const a = Q[i]!.clone().sub(Q[i - 1]!), b = Q[i + 1]!.clone().sub(Q[i]!);
      const la = a.length(), lb = b.length();
      a.normalize(); b.normalize();
      const cosA = Math.max(-1, Math.min(1, a.dot(b)));
      const alpha = Math.acos(cosA);                  // the turn
      if (alpha < 1e-3 || alpha > Math.PI - 1e-3) continue;
      let Rb = Math.max(4 * radius, 0.6);
      const tmax = 0.5 * Math.min(la, lb);
      let t = Rb * Math.tan(alpha / 2);
      if (t > tmax) { t = tmax; Rb = t / Math.tan(alpha / 2); }
      trimEnd[i - 1] = t;
      trimStart[i] = t;
      //  The torus arc from the end of the incoming leg to the start of the
      //  outgoing one: local X = -n, local Y = a (n: toward b, normal to a).
      const n = b.clone().sub(a.clone().multiplyScalar(cosA)).normalize();
      const X = n.clone().negate();
      const Z = new THREE.Vector3().crossVectors(X, a);
      const centre = Q[i]!.clone().sub(a.clone().multiplyScalar(t)).add(n.clone().multiplyScalar(Rb));
      const g = new THREE.TorusGeometry(Rb, radius, radial, Math.max(6, Math.round(alpha * 8)), alpha);
      g.applyMatrix4(new THREE.Matrix4().makeBasis(X, a, Z).setPosition(centre));
      parts.push(g);
    }
    for (let i = 0; i + 1 < Q.length; i++) {
      const s = Q[i]!, e = Q[i + 1]!;
      const d = e.clone().sub(s);
      const len = d.length() - trimStart[i]! - trimEnd[i]!;
      if (len < 1e-4) continue;
      d.normalize();
      const g = new THREE.CylinderGeometry(radius, radius, len, radial, 1, true);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, d));
      const mid = s.clone().add(d.clone().multiplyScalar(trimStart[i]! + len / 2));
      g.translate(mid.x, mid.y, mid.z);
      parts.push(g);
    }
    if (parts.length === 0) return null;
    //  Torus and open cylinder carry the same attributes; merge to one.
    const merged = m.mergeGeometries(parts, false);
    for (const g of parts) g.dispose();
    return merged;
  };

  interface Particle { mesh: T3.InstancedMesh; index: number; s: number; speed: number;
                       points: Vec3[] }
  const particles: Particle[] = [];
  //  One instanced mesh per (phase, shape): a few draws for every particle.
  const sphereG = keep(new THREE.SphereGeometry(0.24, 10, 8));
  const octaG = keep(new THREE.OctahedronGeometry(0.3));
  const cubeG = keep(new THREE.BoxGeometry(0.32, 0.32, 0.32));
  const want = new Map<string, { geo: T3.BufferGeometry; phase: Phase; n: number }>();
  const plan: { key: string; s: number; speed: number; points: Vec3[] }[] = [];
  for (const p of scene.pipes) {
    const geo = pipeGeometry(p.points, p.radius);
    if (geo) {
      keep(geo);
      const tube = new THREE.Mesh(geo, tubeMat.get(p.phase)!);
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
      const [g, shape] = p.phase === "liquid" ? [sphereG, "s"] : p.phase === "vapour" ? [octaG, "o"]
        : p.phase === "twoPhase" ? (k % 2 ? [sphereG, "s"] : [octaG, "o"]) : [cubeG, "c"];
      const key = `${p.phase}:${shape}`;
      const w = want.get(key) ?? { geo: g, phase: p.phase, n: 0 };
      w.n += 1;
      want.set(key, w);
      plan.push({ key, s: (k * drawn) / n, speed: p.speed, points: p.points });
    }
  }
  const instanced = new Map<string, T3.InstancedMesh>();
  const used = new Map<string, number>();
  for (const [key, w] of want) {
    const mat = keep(new THREE.MeshStandardMaterial({ color: PHASE_COLOURS[w.phase],
      emissive: PHASE_COLOURS[w.phase], emissiveIntensity: 0.45, roughness: 0.35 }));
    const im = new THREE.InstancedMesh(w.geo, mat, w.n);
    im.userData.noAO = true;
    instanced.set(key, im);
    used.set(key, 0);
    pipeGroup.add(im);
  }
  const mtx = new THREE.Matrix4();
  for (const q of plan) {
    const im = instanced.get(q.key)!;
    const index = used.get(q.key)!;
    used.set(q.key, index + 1);
    const at = pointAlong(q.points, q.s);
    im.setMatrixAt(index, mtx.makeTranslation(at[0], at[1], at[2]));
    particles.push({ mesh: im, index, s: q.s, speed: q.speed, points: q.points });
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
  const camera = new THREE.PerspectiveCamera(FOV, width / h0, Math.max(0.1, span / 2000), far);
  const controls = new OrbitControls(camera, renderer.domElement);
  //  Keep the camera above the grade: under the ground is not a view.
  controls.maxPolarAngle = Math.PI / 2 - 0.02;

  //  ---- post-processing ("high" only), built on first use -------------
  let composer: EffectComposerT | null = null;
  let postFailed = !m.post;
  const buildComposer = (): EffectComposerT | null => {
    if (postFailed || !m.post) return null;
    try {
      const P = m.post;
      const w = Math.max(el.clientWidth, 320), h = heightOf();
      const target = new THREE.WebGLRenderTarget(w * pixelRatio(), h * pixelRatio(),
        { type: THREE.HalfFloatType, samples: 4 });
      const c = new P.EffectComposer(renderer, target);
      c.setPixelRatio(pixelRatio());
      c.addPass(new P.RenderPass(world, camera));
      const ao = new P.GTAOPass(world, camera, w, h);
      ao.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1, thickness: 1, scale: 1 });
      ao.blendIntensity = 0.9;
      //  What the occlusion is computed from: the solid meshes only -- not
      //  the translucent zones and pipes, not the flow particles, not the
      //  sky (a background is no geometry).
      const cache = new Map<T3.Object3D, boolean>();
      let bg: T3.Scene["background"] = null;
      ao.overrideVisibility = () => {
        bg = world.background;
        world.background = null;
        world.traverse((o) => {
          cache.set(o, o.visible);
          const mat = (o as T3.Mesh).material as T3.Material | T3.Material[] | undefined;
          const see = !(o as T3.Line).isLine && !o.userData.noAO
            && !(mat && !Array.isArray(mat) && mat.transparent);
          if (!see) o.visible = false;
        });
      };
      ao.restoreVisibility = () => {
        world.traverse((o) => { const v = cache.get(o); if (v !== undefined) o.visible = v; });
        cache.clear();
        world.background = bg;
      };
      c.addPass(ao);
      if (flaggedMeshes.length > 0) {
        const o = new P.OutlinePass(new THREE.Vector2(w, h), world, camera, flaggedMeshes);
        o.visibleEdgeColor.set(COLOURS.outline);
        o.hiddenEdgeColor.set(0x8a2a00);
        o.edgeStrength = 4;
        o.edgeThickness = 1.5;
        c.addPass(o);
      }
      c.addPass(new P.OutputPass());
      c.setSize(w, h);
      return c;
    } catch {
      postFailed = true;   // render directly; nothing published depends on it
      return null;
    }
  };

  //  ---- drawing, with the labels decluttered ----------------------
  let tg: Toggles = opts.toggles;
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
    const keepLbl = declutter(boxes);
    for (const b of boxes)
      lbls[Number(b.key)]!.el.style.visibility = keepLbl.has(b.key) ? "visible" : "hidden";
  };
  const draw = () => {
    if (quality === "high") composer ??= buildComposer();
    if (quality === "high" && composer) composer.render();
    else renderer.render(world, camera);
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
      const at = pointAlong(q.points, q.s);
      q.mesh.setMatrixAt(q.index, mtx.makeTranslation(at[0], at[1], at[2]));
    }
    for (const im of instanced.values()) im.instanceMatrix.needsUpdate = true;
    draw();
    raf = requestAnimationFrame(tick);
  };
  const apply = (t: Toggles) => {
    const shadowsMove = !tg || tg.pipes !== t.pipes;
    tg = t;
    zoneGroup.visible = t.zones;
    pipeGroup.visible = t.pipes;
    if (shadowsMove) renderer.shadowMap.needsUpdate = true;
    const run = t.flow && t.pipes && particles.length > 0;
    if (run && !raf) { last = 0; raf = requestAnimationFrame(tick); }
    if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
    draw();
  };

  const resize = () => {
    const w = Math.max(el.clientWidth, 320);
    const h = heightOf();
    renderer.setSize(w, h);
    composer?.setSize(w, h);
    labels.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  const setQuality = (q: RenderQuality) => {
    if (q === quality) return;
    quality = q;
    renderer.setPixelRatio(pixelRatio());
    composer?.setPixelRatio(pixelRatio());
    renderer.shadowMap.enabled = q === "high";
    renderer.shadowMap.needsUpdate = true;
    //  A material compiled with (or without) shadows must be compiled again.
    world.traverse((o) => {
      const mat = (o as T3.Mesh).material as T3.Material | T3.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => { x.needsUpdate = true; });
      else if (mat) mat.needsUpdate = true;
    });
    resize();
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
      .find((x) => {
        for (let o: T3.Object3D | null = x.object; o; o = o.parent) if (!o.visible) return false;
        return true;
      });
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

  const ro = new ResizeObserver(() => { resize(); draw(); });
  ro.observe(el);

  fit(opts.view);
  apply(opts.toggles);

  const dispose = () => {
    if (raf) cancelAnimationFrame(raf);
    ro.disconnect();
    renderer.domElement.removeEventListener("pointermove", onMove);
    renderer.domElement.removeEventListener("pointerleave", onLeave);
    controls.dispose();
    composer?.dispose();
    world.traverse((o) => {
      const mesh = o as T3.Mesh;
      mesh.geometry?.dispose?.();
      const mat = mesh.material as T3.Material | T3.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose?.();
    });
    for (const d of disposables) d.dispose();
    renderer.dispose();
    el.replaceChildren();
  };

  return { setToggles: apply, setQuality, fit, dispose };
}
