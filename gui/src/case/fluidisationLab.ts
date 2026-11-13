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
  fluidisationLab — the pure half of the fluidisation laboratory, the
  `fluidised-beds` page's pop-out tab (ui/methods/FluidisationLabTab.tsx).

  The student's task, in one sentence: "I turn up the gas on a bed of
  particles, I watch what the bed does and I read the instruments, and from
  my own readings I find the velocity at which it fluidises and the one at
  which it is carried away."

  NOTHING IS SIMULATED HERE.  Every number the laboratory shows is CALLED
  from the page's arithmetic, case/fluidisedBeds.ts: the pressure drop
  (`bedPressureDrop`), the regime (`regimeMap`), u_mf (`minimumFluidisation`,
  with `wenYu` beside it), u_t (`terminalVelocity`), the bed height
  (`particulateExpansion` in the particulate band, `bubbleBed` when it
  bubbles), and each void's diameter and rise velocity (`bubbleAt`, i.e.
  Mori and Wen's diameter and the two-phase rise velocity at the void's
  height).  This file only turns those numbers into a DRAWING: a pure
  function of (the computed state, time) that returns positions, so it can
  be tested without a browser.

  WHAT IS DECORATION, and is flagged as such on the screen: the dots (their
  number, their size and the way each one jiggles), the horizontal position
  of a void, and the rate at which a column empties above u_t (the page
  computes no elutriation rate).  What is computed and drawn to the column's
  scale: the bed height, each void's diameter at its height, its rise
  velocity, and how many voids are present (their mean area fraction in the
  drawn slice equals the computed mean bubble fraction).

  Record: docs/design/fluidisation-virtual-laboratory.md.
\*---------------------------------------------------------------------------*/

import {
  GELDART_SAYS, bedPressureDrop, bubbleAt, bubbleBed, geldartGroup, idealGasDensity, inputRefusal,
  minimumFluidisation, moriWenOutside, particulateExpansion, regimeMap, terminalVelocity,
  type BubbleBed, type BubbleInput, type FlowRegime, type Gas, type GeldartGroup, type MinFluid,
  type Particle, type RegimeMap, type Terminal,
} from "./fluidisedBeds.js";
import { GASES, PARTICLES, type ParticlePreset } from "./fluidisedBedPresets.js";

// ---- the set-up the tab carries in its URL ------------------------------------------

export interface LabColumnSpec {
  /** a preset id, or "own" for the page's own typed particle */
  kind: string;
  d_um: number;
  rhoP: number;
  eps: number;
  F: number;
}

export interface LabSetup {
  gasId: string;
  T_C: number;
  P_bar: number;
  mu_uPas: number;
  /** bed height at minimum fluidisation (the charge), m */
  Lmf: number;
  /** column diameter, m */
  Dt: number;
  orificesPerM2: number;
  /** gas diffusivity, cm2/s (only the bubble model reads it) */
  Dg_cm2s: number;
  /** superficial gas velocity, m/s, shared by every column */
  u: number;
  columns: LabColumnSpec[];
}

/** The velocity control's range, m/s, on a log scale. */
export const LAB_U_MIN = 1e-4;
export const LAB_U_MAX = 30;
/** The laboratory starts with the gas almost off. */
export const LAB_U_START = 2e-4;
/** The drawn column is this many times the charge's packed height. */
export const COLUMN_HEIGHT_FACTOR = 3;

/** The page's own defaults (FluidisedBedsTool.tsx's initial state). */
export const LAB_DEFAULTS = {
  gasId: "air", T_C: 20, P_bar: 1.01325, mu_uPas: 18, Lmf: 1, Dt: 1, orificesPerM2: 1000, Dg_cm2s: 0.2,
} as const;

/** The columns a bare deep link opens with: three of the page's presets in
 *  three different Geldart groups (A, B, D, as `geldartGroup` returns them
 *  for air at 20 degC; the test file holds that). */
export const LAB_DEFAULT_KINDS = ["catalyst", "sand", "grain"] as const;

const presetSpec = (x: ParticlePreset): LabColumnSpec =>
  ({ kind: x.id, d_um: x.d_um, rhoP: x.rhoP, eps: x.eps, F: x.F });

/** Encode a set-up as the tab's query string (without the "?"). */
export function encodeLab(s: LabSetup): string {
  const q = new URLSearchParams();
  q.set("fluidlab", "1");
  q.set("gas", s.gasId);
  q.set("T", String(s.T_C));
  q.set("P", String(s.P_bar));
  q.set("mu", String(s.mu_uPas));
  q.set("L", String(s.Lmf));
  q.set("Dt", String(s.Dt));
  q.set("nd", String(s.orificesPerM2));
  q.set("Dg", String(s.Dg_cm2s));
  q.set("u", String(Number(s.u.toPrecision(4))));
  q.set("c", s.columns.map((c) => (c.kind === "own"
    ? `own:${c.d_um}:${c.rhoP}:${c.eps}:${c.F}` : c.kind)).join(","));
  return q.toString();
}

/** True when a query string asks for the laboratory tab. */
export const isLabSearch = (search: string): boolean => new URLSearchParams(search).has("fluidlab");

/** Parse the tab's query string.  A value that does not read REFUSES by
 *  name (the tab then says so); an ABSENT value takes the page's default,
 *  so the bare deep link `?fluidlab=1` opens the three default columns. */
export function parseLab(search: string): { setup: LabSetup; refused: null } | { setup: null; refused: string } {
  const q = new URLSearchParams(search);
  const numOf = (key: string, dflt: number): number | string => {
    const v = q.get(key);
    if (v === null || v.trim() === "") return dflt;
    const x = Number(v);
    return Number.isFinite(x) ? x : `"${key}=${v}" is not a number`;
  };
  const keys = ["T", "P", "mu", "L", "Dt", "nd", "Dg", "u"] as const;
  const dflt = [LAB_DEFAULTS.T_C, LAB_DEFAULTS.P_bar, LAB_DEFAULTS.mu_uPas, LAB_DEFAULTS.Lmf,
    LAB_DEFAULTS.Dt, LAB_DEFAULTS.orificesPerM2, LAB_DEFAULTS.Dg_cm2s, LAB_U_START];
  const vals: number[] = [];
  for (const [k, key] of keys.entries()) {
    const v = numOf(key, dflt[k]!);
    if (typeof v === "string") return { setup: null, refused: v };
    vals.push(v);
  }
  const [T_C, P_bar, mu_uPas, Lmf, Dt, orificesPerM2, Dg_cm2s, u] = vals as [number, number, number, number, number, number, number, number];
  const gasId = q.get("gas") ?? LAB_DEFAULTS.gasId;
  if (!GASES.some((g) => g.id === gasId)) {
    return { setup: null, refused: `the gas "${gasId}" is not one of the page's (${GASES.map((g) => g.id).join(", ")})` };
  }
  if (!(T_C > -273.15)) return { setup: null, refused: "the temperature must be above absolute zero" };
  if (!(P_bar > 0)) return { setup: null, refused: "the pressure must be positive" };
  if (!(mu_uPas > 0)) return { setup: null, refused: "the gas viscosity must be positive" };
  if (!(Lmf > 0)) return { setup: null, refused: "the bed height must be positive" };
  if (!(Dt > 0)) return { setup: null, refused: "the column diameter must be positive" };
  if (!(orificesPerM2 > 0)) return { setup: null, refused: "the orifice count must be positive" };
  if (!(Dg_cm2s > 0)) return { setup: null, refused: "the gas diffusivity must be positive" };
  if (!(u >= LAB_U_MIN && u <= LAB_U_MAX)) {
    return { setup: null, refused: `the velocity ${u} m/s is outside the laboratory's range, ${LAB_U_MIN} to ${LAB_U_MAX} m/s` };
  }
  const cText = q.get("c");
  const items = cText === null || cText.trim() === "" ? [...LAB_DEFAULT_KINDS] : cText.split(",");
  if (items.length < 1 || items.length > 3) return { setup: null, refused: "the laboratory holds one to three columns" };
  const columns: LabColumnSpec[] = [];
  for (const it of items) {
    const x = PARTICLES.find((p) => p.id === it);
    if (x) { columns.push(presetSpec(x)); continue; }
    const parts = it.split(":");
    if (parts[0] === "own" && parts.length === 5) {
      const [d_um, rhoP, eps, F] = parts.slice(1).map(Number) as [number, number, number, number];
      if ([d_um, rhoP, eps, F].every(Number.isFinite) && d_um > 0 && rhoP > 0 && eps > 0 && eps < 1 && F >= 0 && F <= 1) {
        columns.push({ kind: "own", d_um, rhoP, eps, F });
        continue;
      }
    }
    return { setup: null, refused: `the column "${it}" is neither one of the page's particles (${PARTICLES.map((p) => p.id).join(", ")}) nor own:d_um:rhoP:eps:F` };
  }
  return { setup: { gasId, T_C, P_bar, mu_uPas, Lmf, Dt, orificesPerM2, Dg_cm2s, u, columns }, refused: null };
}

/** The page's particle first, then presets of Geldart groups not yet
 *  present (a cohesive group C preset last, since its column does not
 *  fluidise), up to three columns.  Groups are the page's `geldartGroup`. */
export function columnsFromPage(own: LabColumnSpec, gas: Gas): LabColumnSpec[] {
  const groupOf = (c: { d_um: number; rhoP: number }): GeldartGroup =>
    geldartGroup(c.d_um, (c.rhoP - gas.rhoG) / 1000);
  const out: LabColumnSpec[] = [own];
  const seen = new Set<GeldartGroup>([groupOf(own)]);
  const order = [...PARTICLES].sort((a, b) => Number(groupOf(a) === "C") - Number(groupOf(b) === "C"));
  for (const x of order) {
    if (out.length >= 3) break;
    if (x.id === own.kind) continue;
    const g = groupOf(x);
    if (seen.has(g)) continue;
    seen.add(g);
    out.push(presetSpec(x));
  }
  return out;
}

export function gasOf(s: LabSetup): Gas {
  const M = GASES.find((g) => g.id === s.gasId)?.M ?? 28.96;
  return { rhoG: idealGasDensity(M, s.T_C + 273.15, s.P_bar * 1e5), mu: s.mu_uPas * 1e-6 };
}

export function labelOf(c: LabColumnSpec): string {
  const x = PARTICLES.find((p) => p.id === c.kind);
  return x ? x.short : "your particle";
}

// ---- the computed state of one column ------------------------------------------------

/** How the column is drawn at this velocity. */
export type LabPhase =
  | "fixed"          // u <= u_mf: packed, nothing moves
  | "particulate"    // group A between u_mf and u_mb: expands, no voids
  | "bubbling"       // two-phase bed with voids
  | "beyond"         // turbulent or transport: no void picture, height flagged
  | "cohesive"       // group C: not animated (the page's own sentence)
  | "empty";         // everything has been carried out

export interface RiseTable {
  /** heights, m, from 0 to H */
  hs: number[];
  /** time to rise from the distributor to hs[k], s */
  tau: number[];
  /** time to cross the bed, s */
  T: number;
  /** interval between two void births, s, set so the mean drawn area
   *  fraction equals the computed mean bubble fraction */
  dtSpawn: number;
  /** how many voids are in the bed at a time, on average */
  wanted: number;
}

export interface ColumnState {
  spec: LabColumnSpec;
  label: string;
  refused: string | null;
  p: Particle;
  gas: Gas;
  group: GeldartGroup;
  mf: MinFluid;
  map: RegimeMap;
  term: Terminal;
  u: number;
  /** the regime word, `regimeMap(...).at` */
  regime: FlowRegime;
  /** the charge's packed height, m (full column) */
  LmfFull: number;
  /** fraction of the charge still in the column, 0..1 */
  inventory: number;
  /** the packed height of what is still in the column, m */
  Lmf: number;
  /** pressure drop across the bed, Pa, `bedPressureDrop` on what remains */
  dP: number;
  /** the bed height the drawing uses, m; null where the page computes none */
  H: number | null;
  /** where H comes from */
  Hfrom: "packed" | "particulate expansion" | "two-phase bed" | "two-phase bed, outside its regime" | "none";
  /** u > u_t: particles of this size are carried out */
  carriedOut: boolean;
  phase: LabPhase;
  bubbleInput: BubbleInput | null;
  bubbleBed: BubbleBed | null;
  rise: RiseTable | null;
  /** the column's diameter, m (the drawing's width) */
  Dt: number;
  /** the drawn column's height, m */
  columnTop: number;
  /** plain sentences the column states under its drawing */
  notes: string[];
}

export interface ColumnInputs {
  spec: LabColumnSpec;
  gas: Gas;
  LmfFull: number;
  Dt: number;
  orificesPerM2: number;
  Dg_cm2s: number;
}

/** The travel-time table of the voids: tau(h) = integral of dh/u_b, and the
 *  birth interval that makes the mean drawn area fraction equal delta-bar:
 *  integral of (pi d_b^2/4)/u_b dh over the bed, divided by delta-bar D_t H. */
export function riseTable(b: BubbleInput, H: number, deltaMean: number, n = 200): RiseTable {
  const hs: number[] = [], tau: number[] = [];
  let t = 0, area = 0;
  let prev = bubbleAt(0, b, true);
  hs.push(0); tau.push(0);
  for (let k = 1; k <= n; k++) {
    const h = (H * k) / n;
    const pt = bubbleAt(h, b, true);
    const dh = H / n;
    t += 0.5 * dh * (1 / prev.ub + 1 / pt.ub);
    area += 0.5 * dh * ((Math.PI / 4) * (prev.db ** 2 / prev.ub + pt.db ** 2 / pt.ub));
    hs.push(h); tau.push(t);
    prev = pt;
  }
  const dtSpawn = area / (deltaMean * b.Dt * H);
  return { hs, tau, T: t, dtSpawn, wanted: t / dtSpawn };
}

/** The height a void has reached after rising for `age` seconds. */
export function heightAtAge(r: RiseTable, age: number): number {
  if (age <= 0) return 0;
  if (age >= r.T) return r.hs[r.hs.length - 1]!;
  let lo = 0, hi = r.tau.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (r.tau[mid]! <= age) lo = mid; else hi = mid;
  }
  const f = (age - r.tau[lo]!) / (r.tau[hi]! - r.tau[lo]!);
  return r.hs[lo]! + f * (r.hs[hi]! - r.hs[lo]!);
}

export function columnState(ci: ColumnInputs, u: number, inventory: number): ColumnState {
  const { spec, gas } = ci;
  const p: Particle = { d: spec.d_um * 1e-6, rhoP: spec.rhoP };
  const refused = inputRefusal(p, gas, spec.eps);
  const label = labelOf(spec);
  const columnTop = COLUMN_HEIGHT_FACTOR * ci.LmfFull;
  if (refused) {
    //  The rest of the state is never read when refused.
    return { spec, label, refused, p, gas, Dt: ci.Dt, columnTop, notes: [] } as unknown as ColumnState;
  }
  const inv = Math.min(1, Math.max(0, inventory));
  const group = geldartGroup(spec.d_um, (spec.rhoP - gas.rhoG) / 1000);
  const mf = minimumFluidisation(p, gas, spec.eps);
  const map = regimeMap(p, gas, spec.eps, spec.F, u);
  const term = terminalVelocity(p, gas);
  const Lmf = inv * ci.LmfFull;
  const dP = bedPressureDrop(u, p, gas, spec.eps, Lmf, mf.u);
  const carriedOut = u > term.u;
  const notes: string[] = [];
  let H: number | null = Lmf;
  let Hfrom: ColumnState["Hfrom"] = "packed";
  let phase: LabPhase = "fixed";
  let bIn: BubbleInput | null = null, bed: BubbleBed | null = null, rise: RiseTable | null = null;

  if (Lmf <= 0) {
    phase = "empty"; H = 0; Hfrom = "none";
    notes.push("The column is empty: every particle has been carried out.  Refill it to start again.");
  } else if (group === "C") {
    phase = "cohesive";
    notes.push(`Group C. ${GELDART_SAYS.C}  The laboratory does not animate a fluidisation the page says does not happen: the column is drawn packed at every velocity, and the instruments show the page's Ergun numbers, which assume a powder that does fluidise.`);
  } else if (u <= mf.u) {
    phase = "fixed";
  } else if (map.at === "particulate (no bubbles)") {
    const pe = particulateExpansion(u, p, gas, spec.eps, Lmf, mf.u);
    if (pe) {
      phase = "particulate"; H = pe.H; Hfrom = "particulate expansion";
    } else {
      phase = "particulate"; H = null; Hfrom = "none";
      notes.push("Ergun's balance finds no voidage below 1 that carries the bed here, so no height is computed.");
    }
  } else {
    bIn = {
      u, umf: mf.u, epsMf: spec.eps, Lmf, Dt: ci.Dt, orificesPerM2: ci.orificesPerM2,
      Dg: ci.Dg_cm2s * 1e-4, d: p.d,
    };
    bed = bubbleBed(bIn, true);
    if (bed) {
      H = bed.H;
      if (map.at === "bubbling") {
        phase = "bubbling"; Hfrom = "two-phase bed";
        rise = riseTable(bIn, bed.H, bed.deltaMean);
        const out = moriWenOutside(bIn);
        if (out.length > 0) notes.push(`Mori and Wen's correlation is used outside the range the page knows for it (${out.join("; ")}): the voids' sizes are extrapolated.`);
      } else {
        phase = "beyond"; Hfrom = "two-phase bed, outside its regime";
        notes.push(`In the ${map.at} regime the bubbles of the two-phase picture break up; the page computes nothing of its own for this regime.  The height drawn (dashed) is the two-phase result taken outside its regime, and no voids are drawn.`);
      }
    } else {
      H = null; Hfrom = "none";
    }
  }
  if (carriedOut && phase !== "cohesive" && phase !== "empty") {
    notes.push("The gas is faster than these particles' terminal velocity: they are carried out through the top.  How fast the column empties is not computed (the page gives no elutriation rate); the drawing empties it at a fixed pace.");
  }
  if (carriedOut && phase === "cohesive") {
    notes.push("The gas is faster than a single particle's terminal velocity; a cohesive powder leaves as clumps the page does not describe, so nothing is drawn leaving.");
  }
  if (H !== null && H > columnTop) notes.push(`The computed bed height, ${H.toPrecision(3)} m, is taller than the drawn column, ${columnTop.toPrecision(3)} m: the drawing is cut at the top.`);
  if (bed && bed.profile.some((q) => q.db > ci.Dt)) {
    notes.push("Some computed bubbles are wider than the column: that is slugging, which the page does not model; such a void is drawn across the whole width.");
  }
  return {
    spec, label, refused: null, p, gas, group, mf, map, term, u, regime: map.at, LmfFull: ci.LmfFull,
    inventory: inv, Lmf, dP, H, Hfrom, carriedOut, phase, bubbleInput: bIn, bubbleBed: bed, rise,
    Dt: ci.Dt, columnTop, notes,
  };
}

// ---- the drawing: a pure function of (state, time) ------------------------------------

/** Number of dots in a full column.  DECORATION: not the number of particles. */
export const LAB_DOTS = 140;
/** Dots shown in flight above u_t.  DECORATION. */
export const LAB_FLYING = 24;
/** At most this many voids are drawn at a time (the frame cost on a phone). */
export const MAX_VOIDS = 60;
/** Seconds of drawing time for a column to empty above u_t.  DECORATION:
 *  the page computes no elutriation rate. */
export const EMPTY_SECONDS = 12;

export interface Void {
  x: number; y: number; r: number; slug: boolean;
  /** the void's birth number, which also fixes its decorative x */
  id: number;
}
export interface Dot { x: number; y: number }

export interface Frame {
  /** column width (= D_t) and drawn height, m */
  width: number;
  top: number;
  /** the bed's top, m; null where no height is computed */
  bedTop: number | null;
  /** drawn dashed: a height taken outside its regime */
  bedTopDashed: boolean;
  dots: Dot[];
  flying: Dot[];
  voids: Void[];
  /** voids the computed fraction asks for at this instant (mean) and the
   *  share of them drawn (1 = all) */
  voidsWanted: number;
  voidsStride: number;
}

/** A deterministic number in [0, 1) from an integer and a salt. */
export function hash01(k: number, salt: number): number {
  const s = Math.sin(k * 12.9898 + salt * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Fold x back into [lo, hi] by reflection. */
function fold(x: number, lo: number, hi: number): number {
  const w = hi - lo;
  if (!(w > 0)) return lo;
  let y = (x - lo) % (2 * w);
  if (y < 0) y += 2 * w;
  return lo + (y <= w ? y : 2 * w - y);
}

/** The voids present at time t (all of them, before any thinning). */
export function voidsAt(st: ColumnState, t: number): Void[] {
  if (!st.rise || !st.bubbleInput) return [];
  const r = st.rise, Dt = st.bubbleInput.Dt;
  const first = Math.floor((t - r.T) / r.dtSpawn) + 1, last = Math.floor(t / r.dtSpawn);
  const out: Void[] = [];
  for (let i = first; i <= last; i++) {
    const age = t - i * r.dtSpawn;
    if (age < 0 || age >= r.T) continue;
    const y = heightAtAge(r, age);
    const db = bubbleAt(y, st.bubbleInput, true).db;
    const slug = db > Dt;
    const rad = slug ? Dt / 2 : db / 2;
    const x = slug ? Dt / 2 : rad + hash01(i, 3) * (Dt - 2 * rad);
    out.push({ x, y, r: rad, slug, id: i });
  }
  return out;
}

/** What is drawn in one column at time t (seconds).  `reduced` freezes
 *  every decorative motion; the computed numbers are the same. */
export function labFrame(st: ColumnState, t: number, reduced = false): Frame {
  const W = st.Dt;
  if (st.refused) {
    return { width: W, top: st.columnTop, bedTop: null, bedTopDashed: false,
      dots: [], flying: [], voids: [], voidsWanted: 0, voidsStride: 1 };
  }
  const base: Frame = {
    width: W, top: st.columnTop, bedTop: st.H, bedTopDashed: st.phase === "beyond",
    dots: [], flying: [], voids: [], voidsWanted: 0, voidsStride: 1,
  };
  const tt = reduced ? 0 : t;
  const bedTop = st.H ?? st.Lmf;
  //  Voids: every one the computed fraction asks for, thinned by a stride
  //  only when more than MAX_VOIDS would be on screen (said on screen).
  let voids: Void[] = [];
  if (st.phase === "bubbling" && st.rise) {
    const all = voidsAt(st, tt);
    const stride = Math.max(1, Math.ceil(st.rise.wanted / MAX_VOIDS));
    base.voidsWanted = st.rise.wanted;
    base.voidsStride = stride;
    voids = stride === 1 ? all : all.filter((v) => ((v.id % stride) + stride) % stride === 0);
  }
  //  Dots: DECORATION.  Static below u_mf, for group C and when reduced.
  const n = Math.round(LAB_DOTS * st.inventory);
  const moving = !reduced && (st.phase === "particulate" || st.phase === "bubbling" || st.phase === "beyond");
  const amp = st.phase === "particulate" ? 0.25 : 1;
  const m = 0.02 * W;
  const dots: Dot[] = [];
  for (let k = 0; k < n; k++) {
    let x = m + hash01(k, 1) * (W - 2 * m);
    let y = (0.02 + 0.96 * hash01(k, 2)) * bedTop;
    if (moving) {
      const ph = 2 * Math.PI * hash01(k, 4), f = 0.6 + 0.8 * hash01(k, 5);
      x = fold(x + amp * 0.04 * W * Math.sin(2 * Math.PI * f * tt + ph), 0, W);
      y = fold(y + amp * 0.05 * bedTop * Math.sin(2 * Math.PI * 0.7 * f * tt + 1.7 * ph), 0, bedTop);
    }
    if (voids.some((v) => (x - v.x) ** 2 + (y - v.y) ** 2 < v.r * v.r)) continue;
    dots.push({ x, y });
  }
  //  Dots in flight above u_t: DECORATION, at u - u_t, the single particle's
  //  slip, on the column's scale.
  const flying: Dot[] = [];
  if (st.carriedOut && st.phase !== "cohesive" && st.phase !== "empty" && st.inventory > 0) {
    const span = Math.max(st.columnTop - bedTop, 1e-9);
    const v = st.u - st.term.u;
    for (let k = 0; k < LAB_FLYING; k++) {
      const y = bedTop + ((hash01(k, 6) * span + v * tt) % span);
      flying.push({ x: m + hash01(k, 7) * (W - 2 * m), y });
    }
  }
  return { ...base, dots, flying, voids };
}

/** The fraction of the charge left after `dt` seconds of drawing.  DECORATION:
 *  above u_t the column empties at a fixed pace (EMPTY_SECONDS); the page
 *  has no elutriation rate.  Below u_t nothing leaves. */
export function nextInventory(inv: number, dt: number, u: number, ut: number): number {
  if (!(u > ut)) return inv;
  return Math.max(0, inv - dt / EMPTY_SECONDS);
}

// ---- the notebook ---------------------------------------------------------------------

export interface Reading {
  /** which column */
  col: number;
  u: number;
  /** Pa */
  dP: number;
  /** m, or null where no height is computed */
  H: number | null;
  dir: "up" | "down";
}

/** The direction of a new reading against the column's last one. */
export function directionOf(prev: Reading | undefined, u: number): "up" | "down" {
  if (!prev) return "up";
  if (u > prev.u) return "up";
  if (u < prev.u) return "down";
  return prev.dir;
}

export type Reveal =
  | { ok: false; reason: string }
  | { ok: true; guess: number; computed: number; diffPct: number };

/** PREDICT, THEN REVEAL: nothing is revealed until the student has typed a
 *  positive velocity read off his own points.  The difference is the
 *  student's against the page's, in % of the page's. */
export function revealOf(guess: number | string, computed: number): Reveal {
  const g = typeof guess === "string" ? (guess.trim() === "" ? NaN : Number(guess)) : guess;
  if (!Number.isFinite(g) || !(g > 0)) return { ok: false, reason: "type the velocity you read off your own points first" };
  return { ok: true, guess: g, computed, diffPct: (100 * (g - computed)) / computed };
}
