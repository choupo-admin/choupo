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
  THE CAMERAS OF THE PLOT PLAN, AS ARITHMETIC (DEV.md 4c C229).

  Orbit is three.js's own control.  This module is the other two and
  everything around them, with no three.js in it:

    * WALK -- the eye at a person's height, WASD / arrow keys / touch pads,
      dragging turns the head; it stays on the ground and inside the plot;
    * DRONE -- the same controls, but the look direction flies (W goes where
      you look), Q / E (or the up / down pads) change height; it never goes
      below DRONE_MIN_HEIGHT and never leaves a box a few plots wide;
    * GO TO -- one entry per sector and per item, each with the pose that
      frames it (`cameraFit` is the one framing rule);
    * the MINIMAP -- the plan of the plot as a small canvas: the mapping
      from the world to its pixels and back, so a click can jump the camera.

  Yaw 0 looks toward plan north (three.js -Z); positive yaw turns clockwise
  seen from above.  Positions are three.js coordinates (X, Y up, Z).
\*---------------------------------------------------------------------------*/

import { cameraFit, type LayoutScene, type Vec3 } from "./plantLayout.js";

export type CameraMode = "orbit" | "walk" | "drone";

/** Eye height of a standing person (m), walking pace (m/s) and the factor
 *  of a held Shift. */
export const EYE_HEIGHT = 1.7;
export const WALK_SPEED = 3;
export const RUN_FACTOR = 3;
/** The drone's cruise speed scales with the plant; it never dips below this height. */
export const DRONE_MIN_HEIGHT = 2;
export const PITCH_LIMIT = 1.45;   // rad, just short of straight up / down

export interface FreeState { pos: Vec3; yaw: number; pitch: number }
export interface Keys {
  fwd: boolean; back: boolean; left: boolean; right: boolean;
  up: boolean; down: boolean; fast: boolean;
}
export const NO_KEYS: Keys = { fwd: false, back: false, left: false, right: false,
                               up: false, down: false, fast: false };

/** The look direction (unit) of a yaw and a pitch. */
export function lookDir(yaw: number, pitch: number): Vec3 {
  const c = Math.cos(pitch);
  return [Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c];
}

/** The free state that looks from `pos` toward `target`. */
export function freeLooking(pos: Vec3, target: Vec3): FreeState {
  const d: Vec3 = [target[0] - pos[0], target[1] - pos[1], target[2] - pos[2]];
  const h = Math.hypot(d[0], d[2]);
  return {
    pos: [...pos] as Vec3,
    yaw: h < 1e-9 ? 0 : Math.atan2(d[0], -d[2]),
    pitch: Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, Math.atan2(d[1], Math.max(h, 1e-9)))),
  };
}

/** The point `dist` metres ahead (for three.js's lookAt). */
export function aheadOf(s: FreeState, dist = 10): Vec3 {
  const d = lookDir(s.yaw, s.pitch);
  return [s.pos[0] + d[0] * dist, s.pos[1] + d[1] * dist, s.pos[2] + d[2] * dist];
}

/** Turn the head by a drag of (dx, dy) pixels (right drag turns right, up drag looks up). */
export function look(s: FreeState, dx: number, dy: number, sensitivity = 0.0035): FreeState {
  return { pos: s.pos, yaw: s.yaw + dx * sensitivity,
           pitch: Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, s.pitch - dy * sensitivity)) };
}

/** Where the free camera may be: the scene's box grown by `grow` metres
 *  (walk) or by a few spans (drone). */
export function freeBounds(scene: Pick<LayoutScene, "min" | "max" | "fitMin" | "fitMax">,
                           mode: "walk" | "drone"): { min: Vec3; max: Vec3 } {
  const span = Math.max(scene.max[0] - scene.min[0], scene.max[2] - scene.min[2], 20);
  const g = mode === "walk" ? 5 : span * 0.6;
  return {
    min: [scene.min[0] - g, mode === "walk" ? EYE_HEIGHT : DRONE_MIN_HEIGHT, scene.min[2] - g],
    max: [scene.max[0] + g, mode === "walk" ? EYE_HEIGHT : Math.max(scene.max[1] * 3, span * 0.8, 30),
          scene.max[2] + g],
  };
}

/** One step of dt seconds.  Walk moves on the ground plane along the head's
 *  heading; drone moves along the look direction.  Clamped to `bounds`. */
export function stepFree(s: FreeState, keys: Keys, dt: number, mode: "walk" | "drone",
                         bounds: { min: Vec3; max: Vec3 }, speed = WALK_SPEED): FreeState {
  const v = speed * (keys.fast ? RUN_FACTOR : 1) * dt;
  const fwd = (keys.fwd ? 1 : 0) - (keys.back ? 1 : 0);
  const side = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const rise = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
  const d = lookDir(s.yaw, mode === "drone" ? s.pitch : 0);
  const rx = Math.cos(s.yaw), rz = Math.sin(s.yaw);   // to the right of the heading
  const pos: Vec3 = [
    s.pos[0] + (d[0] * fwd + rx * side) * v,
    s.pos[1] + (mode === "drone" ? (d[1] * fwd + rise) * v : 0),
    s.pos[2] + (d[2] * fwd + rz * side) * v,
  ];
  for (let k = 0; k < 3; k++) pos[k] = Math.max(bounds.min[k]!, Math.min(bounds.max[k]!, pos[k]!));
  if (mode === "walk") pos[1] = EYE_HEIGHT;
  return { pos, yaw: s.yaw, pitch: s.pitch };
}

/** A key (event.code) to the movement it asks for, or null. */
export function keyAction(code: string): keyof Keys | null {
  switch (code) {
    case "KeyW": case "ArrowUp": return "fwd";
    case "KeyS": case "ArrowDown": return "back";
    case "KeyA": case "ArrowLeft": return "left";
    case "KeyD": case "ArrowRight": return "right";
    case "KeyE": case "PageUp": case "Space": return "up";
    case "KeyQ": case "PageDown": return "down";
    case "ShiftLeft": case "ShiftRight": return "fast";
    default: return null;
  }
}

//  ---- go to ---------------------------------------------------------------

export interface GoTo {
  id: string;
  label: string;
  kind: "plant" | "sector" | "item";
  min: Vec3;
  max: Vec3;
}

/** The "Go to..." list: the whole plant, each sector, each process item
 *  (non-process ones after, so a building is findable too).  The boxes are the
 *  engine's extents. */
export function gotoList(scene: Pick<LayoutScene, "solids" | "fitMin" | "fitMax">): GoTo[] {
  const out: GoTo[] = [{ id: "plant", label: "Whole plant", kind: "plant",
                         min: scene.fitMin, max: scene.fitMax }];
  const boxOf = (xs: LayoutScene["solids"]): { min: Vec3; max: Vec3 } => {
    const min: Vec3 = [Infinity, 0, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const s of xs)
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k]!, s.center[k]! - s.size[k]! / 2);
        max[k] = Math.max(max[k]!, s.center[k]! + s.size[k]! / 2);
      }
    return { min, max };
  };
  const sectors = [...new Set(scene.solids.filter((s) => s.sector !== "").map((s) => s.sector))];
  for (const sec of sectors)
    out.push({ id: `sector:${sec}`, label: `Sector ${sec}`, kind: "sector",
               ...boxOf(scene.solids.filter((s) => s.sector === sec)) });
  const ordered = [...scene.solids.filter((s) => !s.nonProcess), ...scene.solids.filter((s) => s.nonProcess)];
  for (const s of ordered)
    out.push({ id: `item:${s.id}`, label: s.id, kind: "item", ...boxOf([s]) });
  return out;
}

/** The orbit pose that frames a box (the one framing rule, with room round it). */
export function poseFor(min: Vec3, max: Vec3, fovDeg: number, aspect: number):
  { position: Vec3; target: Vec3 } {
  return cameraFit(min, max, "3d", fovDeg, aspect, 0.35);
}

/** A free (walk / drone) pose that looks at a box: stand back from it on the
 *  fitted 3D side, at eye height for a walker. */
export function freePoseFor(min: Vec3, max: Vec3, mode: "walk" | "drone", fovDeg: number,
                            aspect: number): FreeState {
  const p = poseFor(min, max, fovDeg, aspect);
  const target: Vec3 = [(min[0] + max[0]) / 2, Math.min((min[1] + max[1]) / 2, EYE_HEIGHT * 3),
                        (min[2] + max[2]) / 2];
  const pos: Vec3 = [p.position[0], mode === "walk" ? EYE_HEIGHT : Math.max(p.position[1], DRONE_MIN_HEIGHT),
                     p.position[2]];
  return freeLooking(pos, target);
}

/** Ease for a flight (smoothstep), t in [0, 1]. */
export const ease = (t: number): number => { const u = Math.min(1, Math.max(0, t)); return u * u * (3 - 2 * u); };

export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

//  ---- the minimap ---------------------------------------------------------

export interface Minimap { w: number; h: number; scale: number; x0: number; z0: number; ox: number; oz: number }

/** The mapping of the plan's box (X, Z) into a w x h canvas, with `pad` pixels round it. */
export function minimapOf(min: Vec3, max: Vec3, w: number, h: number, pad = 6): Minimap {
  const dx = Math.max(max[0] - min[0], 1), dz = Math.max(max[2] - min[2], 1);
  const scale = Math.min((w - 2 * pad) / dx, (h - 2 * pad) / dz);
  return { w, h, scale, x0: min[0], z0: min[2],
           ox: (w - dx * scale) / 2, oz: (h - dz * scale) / 2 };
}
/** World (X, Z) to canvas pixels: plan north is up the canvas. */
export const toMini = (m: Minimap, x: number, z: number): [number, number] =>
  [m.ox + (x - m.x0) * m.scale, m.oz + (z - m.z0) * m.scale];
/** Canvas pixels to world (X, Z). */
export const fromMini = (m: Minimap, px: number, py: number): [number, number] =>
  [m.x0 + (px - m.ox) / m.scale, m.z0 + (py - m.oz) / m.scale];
