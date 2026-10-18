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

  WHAT IS DRAWN.  Every placed item at its extents, drawn by its equipment
  KIND (case/equipmentModel.ts, DEV.md 4c C88): heads, skirts, saddles,
  ladders and platforms on the engine's envelope; a kind with no drawing
  keeps the plain cylinder or box.  A Quality control (High / Fast, kept
  per browser) turns the shadows, ambient occlusion and finding outline off
  for a weak laptop.  Sector areas as outlined
  rectangles on the ground.  Hazardous-area zones as translucent cylinders
  whose zones differ by opacity AND edge style AND the word in their label
  (zone labels OFF by default: they are the first thing to crowd a plant).
  An item the engine named in a finding is painted safety orange (and
  outlined, in High) and its label carries a warning glyph; a separation shortfall is a dashed line tagged
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

  FULL SCREEN (DEV.md 4c C91).  A Full screen button takes the view and its
  toolbar to the whole screen through the Fullscreen API, or, where the
  browser does not grant it, to a fixed overlay over the window (Esc or the
  button leaves either); case/layoutPanels.ts `fullscreenMode` decides which.
  A fixed-height view is drawn filling while it is full screen.

  THE DRAWING ITSELF lives in layoutRenderer.ts (no React), since C81: the
  page "Export as page" saves draws with the same function, so this file is
  the toolbar and the lifecycle around it.
\*---------------------------------------------------------------------------*/

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Button, Checkbox, Group, SegmentedControl, Text } from "@mantine/core";

import {
  initialQuality, prefersReducedMotion, QUALITY_TITLE, rememberQuality,
  type LayoutScene, type RenderQuality, type ViewPreset,
} from "../../case/plantLayout.js";
import { fullscreenMode, type FullscreenMode } from "../../case/layoutPanels.js";
import {
  FILL_MIN_HEIGHT, mountLayoutScene, type LayoutModules, type LayoutView, type SceneExtension,
  type Toggles,
} from "./layoutRenderer.js";

/** three.js and the addons it ships that the drawing uses, imported on
 *  demand (a lazy chunk): a case without a layout never downloads them. */
async function loadLayoutModules(): Promise<LayoutModules> {
  const [THREE, orbit, css2d, room, utils, composer, renderPass, gtao, outline, output] =
    await Promise.all([
      import("three"),
      import("three/examples/jsm/controls/OrbitControls.js"),
      import("three/examples/jsm/renderers/CSS2DRenderer.js"),
      import("three/examples/jsm/environments/RoomEnvironment.js"),
      import("three/examples/jsm/utils/BufferGeometryUtils.js"),
      import("three/examples/jsm/postprocessing/EffectComposer.js"),
      import("three/examples/jsm/postprocessing/RenderPass.js"),
      import("three/examples/jsm/postprocessing/GTAOPass.js"),
      import("three/examples/jsm/postprocessing/OutlinePass.js"),
      import("three/examples/jsm/postprocessing/OutputPass.js"),
    ]);
  return {
    THREE, OrbitControls: orbit.OrbitControls,
    CSS2DRenderer: css2d.CSS2DRenderer, CSS2DObject: css2d.CSS2DObject,
    RoomEnvironment: room.RoomEnvironment, mergeGeometries: utils.mergeGeometries,
    post: { EffectComposer: composer.EffectComposer, RenderPass: renderPass.RenderPass,
            GTAOPass: gtao.GTAOPass, OutlinePass: outline.OutlinePass,
            OutputPass: output.OutputPass },
  };
}

/** `height` is a pixel height, or "fill": take the height of the box the
 *  view is placed in (the `?layout=` pop-out tab, DEV.md 4c C78) and follow
 *  it when the window is resized.  Either way three.js is imported only when
 *  a layout is first shown. */
export function PlantLayout3D({ scene, height: declaredHeight = 520, extend, toolbarExtra }: {
  scene: LayoutScene; height?: number | "fill";
  /** Another drawing in the same scene (the GMP interior, DEV.md 4c C97). */
  extend?: SceneExtension;
  /** Its controls, on the same toolbar. */
  toolbarExtra?: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  //  Full screen (C91): off, the browser's own, or the overlay fallback.
  const [full, setFull] = useState<"off" | FullscreenMode>("off");
  const height: number | "fill" = full === "off" ? declaredHeight : "fill";
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFull((f) => (f === "api" ? "off" : f));
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  useEffect(() => {
    if (full !== "overlay") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFull("off"); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);
  const toggleFull = () => {
    if (full === "api") { void document.exitFullscreen?.().catch(() => setFull("off")); return; }
    if (full === "overlay") { setFull("off"); return; }
    const el = frame.current;
    if (fullscreenMode(document, el) === "api" && el) {
      el.requestFullscreen().then(() => setFull("api"), () => setFull("overlay"));
    } else setFull("overlay");
  };
  const api = useRef<LayoutView | null>(null);
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
  const [quality, setQualityState] = useState<RenderQuality>(() => initialQuality());
  const qualityRef = useRef(quality);
  qualityRef.current = quality;

  useEffect(() => { api.current?.setToggles(toggles); }, [toggles]);
  useEffect(() => { api.current?.setQuality(quality); }, [quality]);

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const modules = await loadLayoutModules();
        const el = host.current;
        if (disposed || !el) return;
        api.current = mountLayoutScene(modules, el, scene,
          { height, toggles: togglesRef.current, view: viewRef.current,
            quality: qualityRef.current, ...(extend ? { extend } : {}) });
      } catch (e) {
        if (!disposed)
          setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      disposed = true;
      api.current?.dispose();
      api.current = null;
    };
  }, [scene, height, extend]);

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
      <SegmentedControl size="xs" value={quality} title={QUALITY_TITLE}
        aria-label="Quality"
        data={[{ value: "high", label: "High" }, { value: "fast", label: "Fast" }]}
        onChange={(v) => {
          const q = v === "fast" ? "fast" : "high";
          rememberQuality(q);
          setQualityState(q);
        }} />
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
      {toolbarExtra}
      <Button size="compact-xs" variant="default" onClick={toggleFull}
        aria-pressed={full !== "off"}
        title={full === "off"
          ? "Show the view on the whole screen (Esc returns)"
          : "Leave full screen (Esc)"}>
        {full === "off" ? "Full screen" : "Exit full screen"}
      </Button>
    </Group>
  );
  //  The overlay fallback: the frame fixed over the window, on the page's
  //  own surface (the chrome follows the theme; the scene is daylight).
  const overlay: React.CSSProperties = full === "overlay"
    ? { position: "fixed", inset: 0, zIndex: 400, paddingTop: 8,
        background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))" }
    : {};
  const filling: React.CSSProperties = full === "api"
    ? { background: "light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))",
        paddingTop: 8 }
    : {};
  //  "fill": the box sizes the view; the canvas is absolutely placed inside
  //  it so the canvas itself can never push the box taller (a feedback loop
  //  with the ResizeObserver).
  if (height === "fill")
    return (
      <div ref={frame} style={{ display: "flex", flexDirection: "column", height: "100%",
        width: "100%", ...filling, ...overlay }}>
        <div style={{ padding: "0 16px" }}>{toolbar}</div>
        <div ref={host} style={{ position: "relative", width: "100%", flex: "1 1 auto",
          minHeight: FILL_MIN_HEIGHT, overflow: "hidden" }} />
      </div>
    );
  return (
    <div ref={frame}>
      {toolbar}
      <div ref={host} style={{ position: "relative", width: "100%", height }} />
    </div>
  );
}
