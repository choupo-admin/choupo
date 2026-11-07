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
  COLOUR THE PIPES BY A PUBLISHED QUANTITY (DEV.md 4c C229).

  Phase (a category), temperature, pressure and the mole fraction of a chosen
  component (continuous scales).  The VALUE of a pipe is READ from what the
  engine published on it (`T`, `P`, `vf` on the layout pipe) or in the stream
  table (the composition); nothing is calculated here.  The scale's two ends
  are the smallest and largest published values on the drawn pipes, rounded
  outward to a round number -- so the legend is true of the picture and a
  reader can read a value off a colour.

  A pipe whose stream lacks the value is NEUTRAL (grey) and the legend says
  how many: a missing value is never painted as the bottom of the scale.  The
  one exception is stated in the legend too: a stream that publishes a
  composition without the chosen component carries ZERO of it (that is a fact
  the table states by omission), while a stream with no composition published
  at all is neutral.

  The ramp is viridis (sampled at five stops): perceptually ordered, safe for
  the common colour-vision deficiencies, and it survives greyscale because its
  lightness rises along the scale.  Pure, no three.js.
\*---------------------------------------------------------------------------*/

import type { LayoutFacts } from "./layoutFacts.js";
import { sig } from "./layoutFacts.js";
import { PHASE_COLOURS, PHASE_WORDS, phaseOf, type Phase, type ScenePipe } from "./plantLayout.js";

export type ColourMode =
  | { kind: "phase" }
  | { kind: "T" }
  | { kind: "P" }
  | { kind: "x"; component: string };

export const MODE_KINDS = ["phase", "T", "P", "x"] as const;

export const NEUTRAL_COLOUR = 0x9aa0a6;

/** Viridis, five stops (matplotlib's colormap, public domain). */
const RAMP: [number, number, number][] = [
  [0x44, 0x01, 0x54], [0x3b, 0x52, 0x8b], [0x21, 0x91, 0x8c], [0x5e, 0xc9, 0x62], [0xfd, 0xe7, 0x25],
];

/** The ramp at t in [0, 1], as 0xRRGGBB. */
export function rampColour(t: number): number {
  const u = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(u));
  const f = u - i;
  const a = RAMP[i]!, b = RAMP[i + 1]!;
  const c = (k: 0 | 1 | 2) => Math.round(a[k] + (b[k] - a[k]) * f);
  return (c(0) << 16) | (c(1) << 8) | c(2);
}

export const css = (c: number): string => `#${c.toString(16).padStart(6, "0")}`;

/** [lo, hi] widened to round numbers (1, 2, 2.5 or 5 times a power of ten). */
export function niceRange(lo: number, hi: number): [number, number] {
  if (!(Number.isFinite(lo) && Number.isFinite(hi))) return [0, 1];
  if (hi - lo < 1e-12 * Math.max(1, Math.abs(hi))) {
    const pad = Math.max(Math.abs(hi) * 0.05, 1e-9);
    return [lo - pad, hi + pad];
  }
  const span = hi - lo;
  const raw = span / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step];
}

export interface LegendEntry { label: string; colour: number }
export interface Legend {
  title: string;
  /** "category" is the phase; "scale" a continuous ramp. */
  kind: "category" | "scale";
  unit: string;
  entries: LegendEntry[];
  /** For a scale: the two ends and the labels at both ends and the middle. */
  lo?: number; hi?: number; ticks?: string[];
  /** What the legend says that the picture cannot: the neutral count, the source. */
  notes: string[];
}

export interface PipeColouring {
  /** One colour per pipe, in input order. */
  colours: number[];
  /** True where the pipe carries no value for the mode (drawn neutral). */
  neutral: boolean[];
  legend: Legend;
}

const K_TO_C = 273.15;

/** The published value of one pipe for a continuous mode, or null. */
function valueOf(p: ScenePipe, mode: Exclude<ColourMode, { kind: "phase" }>,
                 facts: LayoutFacts | null | undefined): number | null {
  if (mode.kind === "T") return p.T !== undefined ? p.T : facts?.streams[p.stream]?.T ?? null;
  if (mode.kind === "P") return p.P !== undefined ? p.P : facts?.streams[p.stream]?.P ?? null;
  const comp = facts?.streams[p.stream]?.composition;
  if (!comp) return null;
  const v = comp[mode.component];
  return v === undefined ? 0 : (Number.isFinite(v) ? v : null);
}

/** Modes the scene can offer: composition needs facts with a stream table. */
export function availableModes(pipes: ScenePipe[], facts: LayoutFacts | null | undefined):
  { phase: boolean; T: boolean; P: boolean; x: boolean } {
  const any = (m: Exclude<ColourMode, { kind: "phase" }>) =>
    pipes.some((p) => valueOf(p, m, facts) !== null);
  return {
    phase: pipes.length > 0,
    T: any({ kind: "T" }),
    P: any({ kind: "P" }),
    x: (facts?.components.length ?? 0) > 0
      && pipes.some((p) => facts?.streams[p.stream]?.composition !== undefined),
  };
}

/** Colour every pipe for `mode` and say what the colours mean. */
export function colourPipes(pipes: ScenePipe[], mode: ColourMode,
                            facts?: LayoutFacts | null): PipeColouring {
  if (mode.kind === "phase") {
    const seen = new Set<Phase>(pipes.map((p) => phaseOf(p.vf)));
    const order: Phase[] = ["liquid", "vapour", "twoPhase", "unknown"];
    return {
      colours: pipes.map((p) => PHASE_COLOURS[phaseOf(p.vf)]),
      neutral: pipes.map((p) => phaseOf(p.vf) === "unknown"),
      legend: {
        title: "Pipe colour: phase", kind: "category", unit: "",
        entries: order.filter((ph) => seen.has(ph))
          .map((ph) => ({ label: PHASE_WORDS[ph], colour: PHASE_COLOURS[ph] })),
        notes: [],
      },
    };
  }
  const vals = pipes.map((p) => valueOf(p, mode, facts));
  const pub = vals.filter((v): v is number => v !== null);
  const unit = mode.kind === "T" ? "K" : mode.kind === "P" ? "bar" : "mol/mol";
  const disp = (v: number) => (mode.kind === "P" ? v / 1e5 : v);
  const title = mode.kind === "T" ? "Pipe colour: temperature"
    : mode.kind === "P" ? "Pipe colour: pressure"
    : `Pipe colour: mole fraction of ${mode.component}`;
  const nNeutral = vals.filter((v) => v === null).length;
  const notes: string[] = [];
  if (mode.kind === "x")
    notes.push("overall mole fraction, read from each stream's published composition; "
      + "a stream that publishes a composition without this component carries 0");
  else notes.push("read from the engine's stream table (as published on the pipe)");
  if (nNeutral > 0)
    notes.push(`${nNeutral} pipe${nNeutral === 1 ? "" : "s"} grey: the value is not published for `
      + `${nNeutral === 1 ? "its stream" : "their streams"}`);
  if (pub.length === 0) {
    const what = mode.kind === "x" ? "composition" : mode.kind === "T" ? "temperature" : "pressure";
    return { colours: pipes.map(() => NEUTRAL_COLOUR), neutral: pipes.map(() => true),
             legend: { title, kind: "scale", unit, entries: [],
                       notes: [`no pipe carries a published ${what}: all grey`] } };
  }
  const [lo, hi] = mode.kind === "x"
    ? niceRange(0, Math.max(...pub))
    : niceRange(disp(Math.min(...pub)), disp(Math.max(...pub)));
  const lo2 = mode.kind === "x" ? 0 : lo;
  const t = (v: number) => (hi > lo2 ? (disp(v) - lo2) / (hi - lo2) : 0.5);
  const tick = (v: number) => mode.kind === "T"
    ? `${sig(v, 4)} K (${sig(v - K_TO_C, 3)} °C)` : `${sig(v, 4)} ${unit}`;
  return {
    colours: vals.map((v) => (v === null ? NEUTRAL_COLOUR : rampColour(t(v)))),
    neutral: vals.map((v) => v === null),
    legend: {
      title, kind: "scale", unit,
      entries: [0, 0.25, 0.5, 0.75, 1].map((f) => ({ label: "", colour: rampColour(f) })),
      lo: lo2, hi,
      ticks: [lo2, (lo2 + hi) / 2, hi].map(tick),
      notes,
    },
  };
}
