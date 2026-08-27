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
  ThielePelletTool — the intraparticle CONCENTRATION FIELD, drawn.

  This is the EduTool half of the pellet slice: the engine's `thielePellet`
  property operation solves the isothermal first-order boundary-value problem
  inside one catalyst pellet and publishes the field, the effectiveness factor
  and the classical eta(phi) family.  Until this file existed, all of that was
  computed on every run and nothing drew it.

  WHAT IS ON SCREEN, and which published column feeds it:

    * THREE CROSS-SECTIONS — slab, cylinder, sphere — each painted from its OWN
      run's `c_over_cs` column against `xi` (the normalised coordinate from the
      pellet CENTRE).  A slab is drawn as a slab and a disc as a disc, and at
      one modulus the three carry visibly different colour: the sphere has the
      most surface per unit volume, so its core is the least starved.  That
      difference IS the lesson, so it is in the drawing rather than in a label.
    * THE PROFILE CHART — the same `c_over_cs` as a curve against `xi`, with
      `c_over_cs_closedForm` drawn OVER it dashed.  Both come out of the same
      CSV row, so the method is watched being CHECKED rather than trusted, and
      the reader can see the two lie on top of each other while the modulus and
      the grid move underneath them.
    * ETA, beside each shape — `eta` and `eta_closedForm` from the operation's
      own diagnostics.  eta is the volume integral of the field and this file
      does not take it; nothing here integrates, differentiates or interpolates.
    * THE ETA(PHI) FAMILY (second view) — the `pelletEtaPhi.csv` family over all
      three geometries, with the three runs' own (phi, eta) marked on it.

  ZERO PHYSICS IN TYPESCRIPT, and it costs nothing here: the engine publishes
  the numerical answer AND its closed form in the same row.  Two VIEW transforms
  are declared where they happen and nowhere else — a log10 abscissa on the
  family chart, and the stride that reduces a 401-row field to about eighty
  drawn bands (a stride DROPS published rows; it never averages them, and every
  band's colour is one published number).  See case/thielePellet.ts.

  THREE RUNS, ONE WITNESS.  The field CSV carries one geometry because a case
  declares one pellet, so the comparison needs three runs of
  tutorials/props/reactor/thiele01_sphere_first_order with the catalyst record's
  `geometry` word swapped and — for the slab alone — the characteristic
  dimension's KEY renamed, because the engine refuses `radius` on a slab rather
  than reinterpreting it.  Everything else about the three is identical.

  Inline SVG (the Merkel / Levenspiel / TieTriangle precedent): the plotting
  bundle cannot load outside a browser, and keeping the reading and the geometry
  in a plain module lets tests/thielePelletTool.test.ts pin them with no mock.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import {
  Alert, Badge, Box, Group, Loader, NumberInput, SegmentedControl, Slider,
  Stack, Text, Title, Tooltip,
} from "@mantine/core";

import type { RunResult } from "../../adapters/SolverAdapter.js";
import { useMethodRun } from "../../case/methodRun.js";
import {
  FIELD_CSV, GEOMETRIES, RATE_CONSTANT_LADDER, SWEEP_CSV, THIELE_KNOBS,
  THIELE_LIMITS, THIELE_WITNESS, WITNESS_CARRIER, WITNESS_CATALYST,
  WITNESS_SPECIES, defaultKnobValues, fieldBands, fieldColor,
  fieldTemperatureRange, temperatureColor,
  nearestLadderIndex, overridesFor, readEtaPhiSweep, readPelletDiagnostics,
  readPelletField,
  type FieldRead, type PelletDiagnostics, type PelletGeometry, type Read,
  type SweepRead, type ThieleKnobValues,
} from "../../case/thielePellet.js";
import { KnobField, KnobSlider, PanelNote } from "./knobPanel.js";

/*  THE LESSON, as data rather than as markup.
 *
 *  This tool used to be an instrument panel: knobs down one side, a drawing in
 *  the middle, and a wall of small grey provenance text underneath.  Every
 *  number on it was right and none of it TAUGHT anything -- a reader who did
 *  not already know what a Thiele modulus was left knowing exactly that.  The
 *  temperature tool had already shown the shape that works: a page you scroll,
 *  where the interactive is EARNED by the paragraphs above it.
 *
 *  The steps live here, not inline in the JSX, because a test can then check
 *  that the argument still runs end to end -- that no step lost its formula,
 *  and that the two regimes are still stated as consequences a designer acts
 *  on rather than as algebra.  */
export const THIELE_STEPS: readonly {
  n: number; title: string; body: string; formula?: string; note?: string;
}[] = [
  {
    n: 1,
    title: "The rate you measured is not the rate you get",
    body: "You measure a rate constant in a flask, with the catalyst ground "
      + "to powder and everything in contact with everything.  Then you pack "
      + "a bed with 3 mm pellets and use that same constant to size it.  The "
      + "bed comes out too small — sometimes by a factor of five — and "
      + "nothing in the arithmetic looks wrong.  What went wrong is "
      + "geographical: the reaction happens on pore walls INSIDE the pellet, "
      + "and the reagent has to get there.",
  },
  {
    n: 2,
    title: "Two speeds, and only their ratio matters",
    body: "A pellet is a race between two processes.  Reaction consumes the "
      + "species at a rate k·c per unit volume.  Diffusion resupplies it "
      + "through the pore network at a rate set by D_eff and by how far the "
      + "centre is from the surface.  Neither speed means anything alone: "
      + "double both and the pellet behaves identically.  The Thiele modulus "
      + "is that ratio, made dimensionless.",
    formula: "φ = L · √(k / D_eff)",
    note: "L is the characteristic length — the sphere's radius, the "
      + "slab's HALF-thickness.  φ small: diffusion wins, the whole pellet "
      + "sees surface concentration.  φ large: reaction wins, the reagent is "
      + "eaten near the surface and the core is dead weight.",
  },
  {
    n: 3,
    title: "η is the answer to “how much of my pellet is working?”",
    body: "The effectiveness factor is the honest bookkeeping: the rate the "
      + "pellet ACTUALLY delivers, divided by the rate it would deliver if "
      + "every pore saw surface concentration.  It is what your flask "
      + "constant must be multiplied by before it describes your bed.  "
      + "η = 1 means the whole pellet works.  η = 0.19 means four fifths "
      + "of the catalyst you paid for is doing nothing.",
    formula: "η = (actual rate) / (rate at surface conditions)",
  },
  {
    n: 4,
    title: "Two regimes, and they demand opposite things of you",
    body: "At small φ you are KINETICALLY controlled: η ≈ 1, and the way "
      + "to more conversion is more catalyst activity or more temperature.  "
      + "At large φ you are DIFFUSION controlled: η → 3/φ for a sphere, "
      + "so η·k → 3√(k·D_eff)/L — the observed rate now depends on "
      + "the SQUARE ROOT of k.  Doubling your catalyst's activity buys you "
      + "41 %, not 100 %.  Halving the pellet size buys you the full factor "
      + "of two.  Knowing which regime you are in tells you which lever to "
      + "pull, and pulling the wrong one is expensive.",
    note: "The apparent activation energy halves too, for the same reason "
      + "— which is a classic diagnostic: an Arrhenius plot whose slope is "
      + "about half what the chemistry says is a pellet telling you it is "
      + "diffusion limited.",
  },
  {
    n: 5,
    title: "You cannot measure φ. You can measure η·φ².",
    body: "To compute φ you need k and D_eff — the two things you were "
      + "trying to establish.  This is circular, and the way out is the "
      + "WEISZ-PRATER criterion, which is built only from quantities you can "
      + "actually observe: the rate the pellet is delivering right now, its "
      + "size, and the surface concentration.  Well below 1 and you are "
      + "kinetically controlled; well above 1 and you are not.  It answers "
      + "the design question without ever asking for the intrinsic rate.",
    formula: "η·φ² = (r_obs · L²) / (D_eff · c_s)",
  },
];

// ---- palette ----------------------------------------------------------------

const INK = "var(--mantine-color-dimmed)";
const TEXT = "var(--mantine-color-text)";
const GRID = "var(--mantine-color-default-border)";

/** One colour per shape, used for the cross-section outline, the profile curve
 *  and the family series — so a reader who has learned the shape from the
 *  drawing can follow it across all three panels. */
const C_GEO: Record<string, string> = {
  slab: "#ffb74d", cylinder: "#26c6da", sphere: "#ce93d8",
};

const fmt = (v: number | null | undefined, d = 4): string =>
  typeof v === "number" && Number.isFinite(v) ? v.toPrecision(d) : "—";

const sci = (v: number | null | undefined, d = 3): string =>
  typeof v === "number" && Number.isFinite(v) ? v.toExponential(d) : "—";

// ---- the frame --------------------------------------------------------------

const FW = 920, FH = 664;
const CELL_W = 300;
const CELL_X = [4, 310, 616];
const STRIP_Y = 4, STRIP_H = 208;
const DISC_R = 52;
const SLAB_HW = 88, SLAB_HH = 50;
/** Where a cross-section's centre sits inside its cell.  The vertical budget
 *  is tight and was got wrong once: the disc's caption baseline and the eta
 *  line collided at 4 px.  Cell layout, top to bottom: name 18, moduli 32,
 *  shape centred at 104, caption 168, eta 190, its closed form 203, strip ends
 *  at 212. */
const CELL_CY = STRIP_Y + 100;
/** How many bands a cross-section is painted with.  A 401-point field would
 *  otherwise be 400 rings most of which are narrower than a pixel. */
const MAX_BANDS = 90;

const PLOT_L = 58, PLOT_R = FW - 14, PLOT_T = STRIP_Y + STRIP_H + 40;
const PLOT_B = FH - 34;

interface Run {
  geometry: PelletGeometry;
  result: RunResult | null;
  err: string | null;
  busy: boolean;
  field: Read<FieldRead> | null;
  diag: PelletDiagnostics | null;
}

// ---- one pellet cross-section ------------------------------------------------

/** Paint one shape from its own published field.  Bands are piecewise constant
 *  over intervals whose two ends are published `xi`, filled with one published
 *  `c_over_cs`; the rings are drawn outside-in so each visible annulus shows
 *  the value published at its inner edge. */
function CrossSection({ run, x, paint, tRange }: {
  run: Run; x: number;
  /** Which published quantity the SAME geometry is coloured by.  One picture,
   *  two stories: a toggle costs no layout, where a second strip of discs
   *  would have to come out of the height budget MenuBar.tsx measured. */
  paint: "concentration" | "temperature";
  /** Normalisation for the temperature ramp, shared across the three shapes so
   *  the same colour means the same kelvin in all of them.  An absolute ramp
   *  would paint every pellet identically; a PER-SHAPE one would make three
   *  different pellets look alike, which is worse. */
  tRange: { lo: number; hi: number } | null;
}): JSX.Element {
  const g = run.geometry;
  const colour = C_GEO[g] ?? TEXT;
  const cx = x + CELL_W / 2;
  const cy = CELL_CY;
  const read = run.field && run.field.ok ? run.field.read : null;
  const bands = read ? fieldBands(read.rows, MAX_BANDS) : [];
  const d = run.diag;

  //  A band with no published temperature keeps the CONCENTRATION colour
  //  rather than falling to the ramp's cold end: painting "no datum" as
  //  "coldest" is a number where there is none.
  const bandFill = (b: { u: number; tK?: number }): string => {
    if (paint === "concentration") return fieldColor(b.u);
    if (b.tK === undefined || !tRange || tRange.hi <= tRange.lo)
      return fieldColor(b.u);
    return temperatureColor((b.tK - tRange.lo) / (tRange.hi - tRange.lo));
  };

  return (
    <g>
      <text x={cx} y={STRIP_Y + 18} textAnchor="middle" fontSize={13}
        fill={colour} fontWeight={600}>{g}</text>
      <text x={cx} y={STRIP_Y + 32} textAnchor="middle" fontSize={10} fill={INK}>
        φ = {fmt(d?.phi, 4)} (on Λ = V/S) · φ_char = {fmt(d?.phiChar, 4)}
      </text>

      {bands.length === 0 ? (
        <text x={cx} y={cy} textAnchor="middle" fontSize={11} fill={INK}>
          {run.busy ? "solving…" : "no field published"}
        </text>
      ) : g === "slab" ? (
        <g>
          {/* Both halves of the slab, mirrored about the centre plane: the
              published field runs from the centre (xi = 0) to one face. */}
          {bands.map((b, i) => (
            <g key={i}>
              <rect x={cx + b.from * SLAB_HW} y={cy - SLAB_HH}
                width={Math.max(0.4, (b.to - b.from) * SLAB_HW)}
                height={2 * SLAB_HH} fill={bandFill(b)} />
              <rect x={cx - b.to * SLAB_HW} y={cy - SLAB_HH}
                width={Math.max(0.4, (b.to - b.from) * SLAB_HW)}
                height={2 * SLAB_HH} fill={bandFill(b)} />
            </g>
          ))}
          <rect x={cx - SLAB_HW} y={cy - SLAB_HH} width={2 * SLAB_HW}
            height={2 * SLAB_HH} fill="none" stroke={colour} strokeWidth={1.6} />
          <line x1={cx} y1={cy - SLAB_HH} x2={cx} y2={cy + SLAB_HH}
            stroke={GRID} strokeWidth={1} strokeDasharray="3 4" />
          <text x={cx} y={cy + SLAB_HH + 14} textAnchor="middle" fontSize={9}
            fill={INK}>centre plane · faces at ξ = 1</text>
        </g>
      ) : (
        <g>
          {[...bands].reverse().map((b, i) => (
            <circle key={i} cx={cx} cy={cy} r={Math.max(0.4, b.to * DISC_R)}
              fill={bandFill(b)} />
          ))}
          <circle cx={cx} cy={cy} r={DISC_R} fill="none" stroke={colour}
            strokeWidth={1.6} />
          <circle cx={cx} cy={cy} r={1.8} fill={GRID} />
          <text x={cx} y={cy + DISC_R + 14} textAnchor="middle" fontSize={9}
            fill={INK}>
            {g === "cylinder"
              ? "section ⊥ the axis · surface at ξ = 1"
              : "great-circle section · surface at ξ = 1"}
          </text>
        </g>
      )}

      {/* ETA, beside the shape it belongs to: the consequence the field has. */}
      <text x={cx} y={STRIP_Y + 186} textAnchor="middle" fontSize={12}
        fill={TEXT}>η = {fmt(d?.eta, 5)}</text>
      <text x={cx} y={STRIP_Y + 199} textAnchor="middle" fontSize={9.5}
        fill={INK}>
        closed form {fmt(d?.etaClosed, 5)} · c(centre)/c_s = {fmt(d?.cCentre, 4)}
      </text>
    </g>
  );
}

// ---- the colour legend -------------------------------------------------------

function RampLegend({ y }: { y: number }): JSX.Element {
  const x0 = PLOT_L, w = 190, steps = 40;
  return (
    <g>
      {Array.from({ length: steps }, (_, i) => (
        <rect key={i} x={x0 + (i * w) / steps} y={y} width={w / steps + 0.6}
          height={9} fill={fieldColor(i / (steps - 1))} />
      ))}
      <rect x={x0} y={y} width={w} height={9} fill="none" stroke={GRID} />
      <text x={x0 - 6} y={y + 8} textAnchor="end" fontSize={9} fill={INK}>0</text>
      <text x={x0 + w + 6} y={y + 8} fontSize={9} fill={INK}>1</text>
      <text x={x0 + w + 22} y={y + 8} fontSize={9.5} fill={INK}>
        fill = c/c_s, as published
      </text>
    </g>
  );
}

/** What a solid line, a dashed line and each colour mean.  A LEGEND and not a
 *  tooltip: the whole claim of this drawing is that two curves lie on top of
 *  each other, and a reader who cannot tell which is which cannot check it. */
function TraceLegend({ y }: { y: number }): JSX.Element {
  const x0 = 440;
  return (
    <g>
      <line x1={x0} y1={y + 4} x2={x0 + 22} y2={y + 4} stroke={TEXT}
        strokeWidth={2.4} />
      <text x={x0 + 27} y={y + 8} fontSize={9.5} fill={INK}>numerical</text>
      <line x1={x0 + 92} y1={y + 4} x2={x0 + 114} y2={y + 4} stroke={TEXT}
        strokeWidth={1.1} strokeDasharray="5 4" />
      <text x={x0 + 119} y={y + 8} fontSize={9.5} fill={INK}>closed form</text>
      {GEOMETRIES.map((g, i) => (
        <g key={g}>
          <rect x={x0 + 205 + i * 76} y={y} width={9} height={9}
            fill={C_GEO[g] ?? TEXT} />
          <text x={x0 + 218 + i * 76} y={y + 8} fontSize={9.5}
            fill={INK}>{g}</text>
        </g>
      ))}
    </g>
  );
}

// ---- the profile chart -------------------------------------------------------

function ProfileChart({ runs }: { runs: readonly Run[] }): JSX.Element {
  const toX = (xi: number) => PLOT_L + xi * (PLOT_R - PLOT_L);
  const toY = (u: number) => PLOT_B - u * (PLOT_B - PLOT_T);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <g>
      {ticks.map((t) => (
        <g key={`gx${t}`}>
          <line x1={toX(t)} y1={PLOT_T} x2={toX(t)} y2={PLOT_B} stroke={GRID}
            strokeWidth={0.6} opacity={0.6} />
          <text x={toX(t)} y={PLOT_B + 14} textAnchor="middle" fontSize={10}
            fill={INK}>{t}</text>
        </g>
      ))}
      {ticks.map((t) => (
        <g key={`gy${t}`}>
          <line x1={PLOT_L} y1={toY(t)} x2={PLOT_R} y2={toY(t)} stroke={GRID}
            strokeWidth={0.6} opacity={0.6} />
          <text x={PLOT_L - 8} y={toY(t) + 3.5} textAnchor="end" fontSize={10}
            fill={INK}>{t}</text>
        </g>
      ))}
      <text x={(PLOT_L + PLOT_R) / 2} y={PLOT_B + 28} textAnchor="middle"
        fontSize={11} fill={INK}>
        ξ — normalised coordinate, 0 at the pellet centre, 1 at its surface
      </text>
      <text x={14} y={(PLOT_T + PLOT_B) / 2} fontSize={11} fill={INK}
        transform={`rotate(-90 14 ${(PLOT_T + PLOT_B) / 2})`}
        textAnchor="middle">c / c_s</text>

      {runs.map((r) => {
        if (!r.field || !r.field.ok) return null;
        const rows = r.field.read.rows;
        const colour = C_GEO[r.geometry] ?? TEXT;
        const num = rows.map((p) => `${toX(p.xi).toFixed(1)},${toY(p.u).toFixed(1)}`).join(" ");
        const cf = rows.map((p) => `${toX(p.xi).toFixed(1)},${toY(p.uClosed).toFixed(1)}`).join(" ");
        return (
          <g key={r.geometry}>
            <polyline points={num} fill="none" stroke={colour} strokeWidth={2.4} />
            <polyline points={cf} fill="none" stroke={TEXT} strokeWidth={1.1}
              strokeDasharray="5 4" opacity={0.85} />
          </g>
        );
      })}
    </g>
  );
}

// ---- the eta(phi) family -----------------------------------------------------

function FamilyChart({ sweep, runs }: {
  sweep: SweepRead; runs: readonly Run[];
}): JSX.Element {
  //  THE ABSCISSA IS log10(phi) — a VIEW transform over published numbers, and
  //  the only one on this chart.  The classical plot is read on a log modulus;
  //  drawing it linearly would put nine tenths of the family in the last inch.
  const all = sweep.series.flatMap((s) => s.points.map((p) => Math.log10(p.phi)));
  const lo = Math.min(...all), hi = Math.max(...all);
  const span = hi - lo > 1e-9 ? hi - lo : 1;
  const toX = (phi: number) =>
    PLOT_L + ((Math.log10(phi) - lo) / span) * (PLOT_R - PLOT_L);
  const toY = (eta: number) => PLOT_B - Math.min(1, Math.max(0, eta)) * (PLOT_B - PLOT_T);
  const decades: number[] = [];
  for (let e = Math.ceil(lo); e <= Math.floor(hi); ++e) decades.push(10 ** e);
  const yticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <g>
      {decades.map((p) => (
        <g key={`fx${p}`}>
          <line x1={toX(p)} y1={PLOT_T} x2={toX(p)} y2={PLOT_B} stroke={GRID}
            strokeWidth={0.6} opacity={0.6} />
          <text x={toX(p)} y={PLOT_B + 14} textAnchor="middle" fontSize={10}
            fill={INK}>{p}</text>
        </g>
      ))}
      {yticks.map((t) => (
        <g key={`fy${t}`}>
          <line x1={PLOT_L} y1={toY(t)} x2={PLOT_R} y2={toY(t)} stroke={GRID}
            strokeWidth={0.6} opacity={0.6} />
          <text x={PLOT_L - 8} y={toY(t) + 3.5} textAnchor="end" fontSize={10}
            fill={INK}>{t}</text>
        </g>
      ))}
      <text x={(PLOT_L + PLOT_R) / 2} y={PLOT_B + 28} textAnchor="middle"
        fontSize={11} fill={INK}>
        φ, the generalised modulus on Λ = V/S (log axis — a view transform over
        the published φ column)
      </text>
      <text x={14} y={(PLOT_T + PLOT_B) / 2} fontSize={11} fill={INK}
        transform={`rotate(-90 14 ${(PLOT_T + PLOT_B) / 2})`}
        textAnchor="middle">η</text>

      {sweep.series.map((s) => {
        const colour = C_GEO[s.geometry] ?? TEXT;
        const num = s.points.map((p) => `${toX(p.phi).toFixed(1)},${toY(p.eta).toFixed(1)}`).join(" ");
        const cf = s.points.map((p) => `${toX(p.phi).toFixed(1)},${toY(p.etaClosed).toFixed(1)}`).join(" ");
        return (
          <g key={s.geometry}>
            <polyline points={num} fill="none" stroke={colour} strokeWidth={2.2} />
            <polyline points={cf} fill="none" stroke={TEXT} strokeWidth={1.1}
              strokeDasharray="5 4" opacity={0.85} />
            <text x={toX(s.points[s.points.length - 1]!.phi) - 6}
              y={toY(s.points[s.points.length - 1]!.eta) - 6} textAnchor="end"
              fontSize={10} fill={colour}>{s.geometry}</text>
          </g>
        );
      })}

      {/* The three runs' OWN pellets, on the family they belong to. */}
      {runs.map((r) => {
        const phi = r.diag?.phi, eta = r.diag?.eta;
        if (!Number.isFinite(phi) || !Number.isFinite(eta)) return null;
        const colour = C_GEO[r.geometry] ?? TEXT;
        return (
          <g key={`m${r.geometry}`}>
            <circle cx={toX(phi!)} cy={toY(eta!)} r={5} fill="none"
              stroke={colour} strokeWidth={2.2} />
            <circle cx={toX(phi!)} cy={toY(eta!)} r={1.8} fill={colour} />
          </g>
        );
      })}
    </g>
  );
}

// ---- the rate-constant knob (exact entry + a half-decade ladder) -------------

/** The rate-constant knob's descriptor, resolved ONCE out of the registry the
 *  overrides are built from — never a second copy of its range or its
 *  default. */
const RATE_KNOB = THIELE_KNOBS.find((k) => k.id === "rateConstant")!;

function RateConstantKnob({ value, onChange }: {
  value: number; onChange: (v: number) => void;
}): JSX.Element {
  const knob = RATE_KNOB;
  return (
    <KnobField label={knob.label} hint={knob.why}>
      <NumberInput size="xs" value={value} min={knob.min} max={knob.max}
        step={knob.step} w="100%"
        onChange={(v) => {
          const n = typeof v === "number" ? v : Number(v);
          if (Number.isFinite(n) && n > 0) onChange(n);
        }} />
      {/* The slider walks a half-decade LADDER of literal values — four decades
          of k is unreachable on a linear handle, and every rung below is
          written into the dict verbatim. */}
      <Slider size="xs" mt={6} min={0} max={RATE_CONSTANT_LADDER.length - 1}
        step={1} value={nearestLadderIndex(value)} label={null}
        onChange={(i) => onChange(RATE_CONSTANT_LADDER[i]!)} />
      <Text size="xs" c="dimmed" mt={2}>
        ladder: {RATE_CONSTANT_LADDER.join(" · ")} 1/s
      </Text>
    </KnobField>
  );
}

// ---- the tool ----------------------------------------------------------------

export function ThielePelletTool(): JSX.Element {
  const [knobs, setKnobs] = useState<ThieleKnobValues>(defaultKnobValues);
  const [view, setView] = useState<"field" | "family">("field");
  //  WHICH published quantity paints the discs.  Defaults to concentration,
  //  so a witness with no `thermal {}` block behaves exactly as before.
  const [paint, setPaint] =
    useState<"concentration" | "temperature">("concentration");
  const knobsKey = JSON.stringify(knobs);

  //  THREE RUNS of ONE witness, one per shape.  The hooks are unconditional and
  //  in a fixed order; the geometry rides in the key so a shape change is a new
  //  run rather than a stale one.
  const slab = useMethodRun(THIELE_WITNESS, overridesFor(knobs, "slab"),
    `${knobsKey}|slab`, "choupoProps");
  const cylinder = useMethodRun(THIELE_WITNESS, overridesFor(knobs, "cylinder"),
    `${knobsKey}|cylinder`, "choupoProps");
  const sphere = useMethodRun(THIELE_WITNESS, overridesFor(knobs, "sphere"),
    `${knobsKey}|sphere`, "choupoProps");

  //  The memo depends on the RUN STATE, not on the hooks' return objects: those
  //  are fresh literals on every render, and a 401-row field would be re-parsed
  //  on every keystroke in the panel.
  const runs: Run[] = useMemo(() => {
    const raw = [
      { result: slab.result, err: slab.err, busy: slab.busy },
      { result: cylinder.result, err: cylinder.err, busy: cylinder.busy },
      { result: sphere.result, err: sphere.err, busy: sphere.busy },
    ];
    return GEOMETRIES.map((geometry, i) => {
      const r = raw[i]!;
      const csv = r.result?.csvFiles?.[FIELD_CSV];
      return {
        geometry, result: r.result, err: r.err, busy: r.busy,
        field: csv ? readPelletField(csv) : null,
        diag: readPelletDiagnostics(r.result?.operationResults),
      };
    });
  }, [slab.result, slab.err, slab.busy,
    cylinder.result, cylinder.err, cylinder.busy,
    sphere.result, sphere.err, sphere.busy]);

  const busy = runs.some((r) => r.busy);
  const bySphere = runs.find((r) => r.geometry === "sphere");

  //  ONE temperature range ACROSS THE THREE SHAPES, so the same colour means
  //  the same kelvin in all of them.  Normalising each shape against its own
  //  range would paint three different pellets identically and hide the very
  //  comparison the strip exists for.  Null when no run published a
  //  temperature -- the toggle then does not appear at all.
  const tRange = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    for (const r of runs) {
      const read = r.field && r.field.ok ? r.field.read : null;
      const range = read ? fieldTemperatureRange(read.rows) : null;
      if (!range) continue;
      if (range.lo < lo) lo = range.lo;
      if (range.hi > hi) hi = range.hi;
    }
    return Number.isFinite(lo) && Number.isFinite(hi) ? { lo, hi } : null;
  }, [runs]);
  const hasTemperature = tRange !== null;

  //  THE FAMILY IS PUBLISHED IDENTICALLY BY ALL THREE RUNS (it is parametric in
  //  phi and holds no pellet fixed), so it is read from the FIRST run that
  //  produced one, in the fixed geometry order — and the view says which.
  const family = useMemo(() => {
    for (const r of runs) {
      const csv = r.result?.csvFiles?.[SWEEP_CSV];
      if (csv) return { geometry: r.geometry, read: readEtaPhiSweep(csv) };
    }
    return null;
  }, [runs]);

  //  THE ENGINE'S OWN WORDS, lifted onto the surface.  The three runs raise the
  //  same advisories (same records, same model), so they are de-duplicated by
  //  their text rather than printed three times.
  const advisories = useMemo(() => {
    const seen = new Map<string, { locus: string; message: string; severity: string }>();
    for (const r of runs)
      for (const a of r.result?.advisories ?? [])
        if (!seen.has(a.message)) seen.set(a.message, a);
    return [...seen.values()];
  }, [runs]);

  const worstFieldDev = useMemo(() => {
    const v = runs.map((r) => r.diag?.fieldMaxAbsDeviation)
      .filter((x): x is number => typeof x === "number" && Number.isFinite(x));
    return v.length > 0 ? Math.max(...v) : null;
  }, [runs]);
  const dEff = runs.map((r) => r.diag?.dEff).find((v) => typeof v === "number");

  /*  THERE IS NO "GATE FAILED" BADGE, and the absence is deliberate.
   *
   *  The operation publishes `gates_pass` and case/thielePellet.ts reads it, so
   *  the datum is on this surface — but a run that FAILS its verification exits
   *  1, and the browser worker harvests neither CSVs nor the results JSON on a
   *  non-zero exit code (gui/public/workers/solverWorker.js: the whole harvest
   *  sits inside `if (rc === 0)`).  So `gatesPass === false` cannot reach this
   *  component: a failed verification arrives as a failed RUN, and the red
   *  alert above says so and names the remedy.  A badge conditioned on it would
   *  be a check that can never fire — the shape this project retired a gate
   *  over — so the condition is stated here instead of drawn.  The day the
   *  worker harvests a non-zero run, this is the paragraph to come back to.  */

  /*  THE THREE RUNS FAIL THE SAME WAY, so they get ONE alert.  When the engine
   *  refuses the OPERATION rather than the pellet — an unknown type, a missing
   *  record — all three runs come back with byte-identical text, and three
   *  copies of a twelve-line refusal push the drawing off the page (measured:
   *  at 1400x900 they left the SVG box zero pixels tall).  Grouping by the
   *  MESSAGE keeps the shape names, quotes the engine once, and never merges
   *  two different refusals into one. */
  const failures = useMemo(() => {
    const byMessage = new Map<string, PelletGeometry[]>();
    for (const r of runs) {
      if (!r.err) continue;
      const bucket = byMessage.get(r.err);
      if (bucket) bucket.push(r.geometry); else byMessage.set(r.err, [r.geometry]);
    }
    return [...byMessage.entries()];
  }, [runs]);

  const alerts: JSX.Element[] = [];
  for (const [message, shapes] of failures) {
    alerts.push(
      <Alert key={`e-${shapes.join("-")}`} color="red" variant="light" m={12}
        title={`The ${shapes.join(", ")} run${shapes.length > 1 ? "s" : ""} `
          + "refused or failed — the engine's message, verbatim"}>
        {/* Bounded, not truncated: the whole message is here and scrolls.  A
            refusal the reader cannot finish reading is not a refusal, and a
            refusal that eats the construction is not a view. */}
        <Text size="xs" ff="monospace" component="div"
          style={{ whiteSpace: "pre-wrap", maxHeight: 96, overflow: "auto" }}>
          {message}
        </Text>
        <Text size="xs" mt={6}>
          Two things reach the reader this way. If the engine does not know the
          operation at all, this build&apos;s WebAssembly predates it — rebuild
          with <code>make wasm-gui</code>. Otherwise the operation EXITS 1 when
          its numerical answer misses the case&apos;s own declared verification
          tolerance (field 1e-4 absolute, eta 1e-4 relative), and on a non-zero
          exit the browser run returns no CSV at all, so the shape is not drawn.
          At a large rate constant that is usually the grid: the boundary layer
          is about 1/φ_char thick, and the remedy the engine names is more grid
          points.
        </Text>
      </Alert>);
  }
  for (const r of runs) {
    if (!r.field || r.field.ok) continue;
    alerts.push(
      <Alert key={`f-${r.geometry}`} color="orange" variant="light" m={12}
        title={`The ${r.geometry} run published no readable field`}>
        <Text size="xs">{r.field.why}</Text>
      </Alert>);
  }
  for (const r of runs) {
    if (!r.field || !r.field.ok) continue;
    if (r.field.read.skippedRows > 0) alerts.push(
      <Alert key={`s-${r.geometry}`} color="yellow" variant="light" m={12}
        title={`${r.field.read.skippedRows} unreadable row(s) in the ${r.geometry} field`}>
        <Text size="xs">
          They are not drawn. A silently dropped row is a hole in the picture,
          so it is counted here instead.
        </Text>
      </Alert>);
    if (!r.field.read.xiMonotonic) alerts.push(
      <Alert key={`m-${r.geometry}`} color="orange" variant="light" m={12}
        title={`The ${r.geometry} field arrived out of order in ξ`}>
        <Text size="xs">
          The drawing walks the rows in file order and is therefore folded. The
          view does not re-sort them, because re-sorting would hide a change in
          what the engine writes.
        </Text>
      </Alert>);
  }
  if (family && !family.read.ok) alerts.push(
    <Alert key="fam" color="orange" variant="light" m={12}
      title="The η(φ) family could not be read">
      <Text size="xs">{family.read.why}</Text>
    </Alert>);

  /*  THE ADVISORIES ARE NOT A FAILURE, so they do not sit with the failures.
   *  Everything in `alerts` above is a run that did not produce an answer;
   *  these are the engine qualifying an answer it DID produce, which belongs
   *  beside the provenance at the foot of the lesson rather than in front of
   *  the paragraph that introduces the pellet.  */
  const advisoryAlert = advisories.length === 0 ? null : (
    <Alert color="yellow" variant="light"
      title={`The engine qualifies its own answer: ${advisories.length} `
        + `advisor${advisories.length === 1 ? "y" : "ies"}`}>
      {advisories.map((a) => (
        <Text key={a.message} size="xs" ff="monospace" mt={2}
          style={{ whiteSpace: "pre-wrap" }}>
          [{a.severity}] {a.locus}: {a.message}
        </Text>
      ))}
    </Alert>);

  const knobRail = (
    <>
      <KnobField label="view">
        <SegmentedControl size="xs" value={view} fullWidth
          onChange={(v) => setView(v === "family" ? "family" : "field")}
          data={[
            { label: "pellet field", value: "field" },
            { label: "η(φ) family", value: "family" },
          ]} />
      </KnobField>
      {/* THE PAINT TOGGLE appears only when the run actually published a
          temperature.  An always-visible control that yields the same picture
          would teach the reader that the toggle does nothing. */}
      {hasTemperature && (
        <KnobField label="paint the pellet by">
          <SegmentedControl size="xs" value={paint} fullWidth
            onChange={(v) => setPaint(v === "temperature"
              ? "temperature" : "concentration")}
            data={[
              { label: "c / c_s", value: "concentration" },
              { label: "temperature", value: "temperature" },
            ]} />
        </KnobField>
      )}
      <RateConstantKnob value={knobs["rateConstant"] ?? RATE_KNOB.def}
        onChange={(v) => setKnobs((st) => ({ ...st, rateConstant: v }))} />
      {THIELE_KNOBS.filter((k) => k.id !== "rateConstant").map((k) => (
        <KnobSlider key={k.id} knob={k} value={knobs[k.id] ?? k.def} showWhy
          onChange={(v) => setKnobs((st) => ({ ...st, [k.id]: v }))} />
      ))}
    </>
  );

  const step = (n: number): JSX.Element | null => {
    const st = THIELE_STEPS.find((x) => x.n === n);
    if (!st) return null;
    return (
      <Box>
        <Title order={5}>{st.n} · {st.title}</Title>
        <Text size="sm" mt={4}>{st.body}</Text>
        {st.formula && (
          <Box my={8} px="sm" py={6} style={{ borderLeft: `3px solid ${GRID}` }}>
            <Text size="sm" ff="monospace">{st.formula}</Text>
          </Box>
        )}
        {st.note && <Text size="sm" c={INK}>{st.note}</Text>}
      </Box>
    );
  };

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>

        <Box>
          <Title order={3}>What is a catalyst pellet doing inside?</Title>
          <Text size="sm" c={INK} mt={4}>
            You are about to size a packed bed.  Everything below decides
            whether it comes out the right size, and none of it is visible
            from outside the pellet.
          </Text>
        </Box>

        {alerts}

        {step(1)}
        {step(2)}
        {step(3)}

        <Box>
          <Title order={5}>Now watch it happen</Title>
          <Text size="sm" mt={4}>
            Three shapes, the same length, the same chemistry, solved in your
            browser.  <strong>Drag the rate constant</strong> and watch the
            field go from nearly flat — the whole pellet working — to a skin
            hugging the surface over a dead core.  The dashed curve is the
            closed-form solution drawn on top of the numerical one, so you are
            watching the method being checked as well as the physics.
          </Text>
        </Box>

        <Box style={{ display: "grid", gap: 14,
          gridTemplateColumns: "minmax(210px, 250px) 1fr" }}>
          <Stack gap={6}>
            {knobRail}
            {busy && (
              <Group gap={6} wrap="nowrap" align="center">
                <Loader size="xs" />
                <Text size="xs" c={INK}>re-solving all three shapes…</Text>
              </Group>
            )}
          </Stack>

          <Box style={{ minWidth: 0, position: "relative" }}>
            <Group gap="xs" wrap="wrap" align="center" mb={4}>
              <Tooltip withArrow multiline w={430}
                label={"D_eff is not stored anywhere: the engine derives it as "
                  + "(epsilon_p / tau) * D_molecular from the catalyst record "
                  + "and Fuller's correlation for the CO/N2 pair, and "
                  + "announces the rule that produced it.  Knudsen diffusion "
                  + "is not modelled and the run says so."}>
                <Badge variant="light" color="teal" tt="none"
                  styles={{ root: { cursor: "help" } }}>
                  D_eff = {sci(dEff)} m²/s
                </Badge>
              </Tooltip>
              <Tooltip withArrow multiline w={430}
                label={"The largest |numerical - closed form| over every node "
                  + "of the three fields, as each run published it in its own "
                  + "diagnostics.  It is not recomputed here."}>
                <Badge variant="light" color="cyan" tt="none"
                  styles={{ root: { cursor: "help" } }}>
                  worst field deviation = {sci(worstFieldDev)}
                </Badge>
              </Tooltip>
              <Badge variant="light" color="grape" tt="none">
                grid: {Number.isFinite(runs[0]?.diag?.nodes)
                  ? runs[0]!.diag!.nodes : "—"} points
              </Badge>
              <Badge variant="light" color="orange" tt="none">
                Weisz-Prater η·φ² (sphere) ={" "}
                {fmt(bySphere?.diag?.weiszPrater, 4)}
              </Badge>
            </Group>
            {busy && (
              <Box style={{ position: "absolute", inset: 0, display: "flex",
                alignItems: "center", justifyContent: "center", zIndex: 1,
                background: "light-dark(rgba(255,255,255,0.5), "
                  + "rgba(0,0,0,0.35))" }}>
                <Loader size="sm" />
              </Box>
            )}
            {/*  The height comes from the aspect ratio, never from an
                 attribute: `height="auto"` is not a valid SVG length and the
                 browser rejects the whole attribute with a console error.
                 A CSS height of auto on an element with a viewBox lets the
                 intrinsic ratio set it, which is what a scrolling page
                 wants.  */}
            <svg viewBox={`0 0 ${FW} ${FH}`}
              style={{ width: "100%", height: "auto", display: "block" }}
              preserveAspectRatio="xMidYMid meet" role="img"
              aria-label={"Intraparticle concentration field in a catalyst "
                + "pellet: a slab, a cylinder and a sphere painted from the "
                + "engine's own c/c_s field, each with its Thiele modulus and "
                + "effectiveness factor, over a chart of the same field "
                + "against the normalised coordinate with the closed form "
                + "drawn on top of it"}>
              {runs.map((r, i) => (
                <CrossSection key={r.geometry} run={r} x={CELL_X[i]!}
                  paint={paint} tRange={tRange} />
              ))}
              <RampLegend y={STRIP_Y + STRIP_H + 6} />
              <TraceLegend y={STRIP_Y + STRIP_H + 6} />
              {view === "field"
                ? <ProfileChart runs={runs} />
                : family && family.read.ok
                  ? <FamilyChart sweep={family.read.read} runs={runs} />
                  : (
                    <text x={FW / 2} y={(PLOT_T + PLOT_B) / 2}
                      textAnchor="middle" fontSize={12} fill={INK}>
                      no η(φ) family published yet
                    </text>
                  )}
            </svg>
          </Box>
        </Box>

        <Alert variant="light"
          title="Why the three shapes are not three problems">
          <Text size="sm">
            A slab, a cylinder and a sphere give three different η at the same
            φ — you can see the gap on the chart.  But switch to the{" "}
            <strong>η(φ) family</strong> view and they very nearly collapse
            onto ONE curve.  The trick is the characteristic length: measure φ
            on Λ = V/S, the volume the reaction happens in divided by the area
            the reagent enters through, and the geometry mostly cancels.  That
            is why a designer can carry one curve instead of a catalogue of
            shapes — and why comparing shapes at the same RADIUS, as the strip
            above does, is a deliberate choice and not a law.
          </Text>
        </Alert>

        {step(4)}
        {step(5)}

        <Alert variant="light" color="orange"
          title="The number this screen exists to make you distrust">
          <Text size="sm">
            The badge above reads <strong>η·φ² ={" "}
            {fmt(bySphere?.diag?.weiszPrater, 4)}</strong> for the sphere, at
            the knob settings you are holding right now.  Turn the rate
            constant up and watch it cross 1 while the pellet on screen grows
            its dead core.  That crossing is the moment your flask constant
            stopped describing your bed.
          </Text>
        </Alert>

        {hasTemperature && (
          <Box>
            <Title order={5}>
              6 · And the pellet is not at one temperature
            </Title>
            <Text size="sm" mt={4}>
              Switch the paint to <strong>temperature</strong>.  An exothermic
              reaction releases its heat where it happens — near the surface,
              once φ is large — and the pellet cannot conduct it away for
              free.  Prater’s relation makes this exact rather than
              hand-waved: heat and mass obey the same equation inside the
              pellet, so temperature and concentration are locked together and
              there is no second differential equation to solve.
            </Text>
            <Box my={8} px="sm" py={6}
              style={{ borderLeft: `3px solid ${GRID}` }}>
              <Text size="sm" ff="monospace">
                T − T_s = β · T_s · (1 − c/c_s),{"   "}
                β = (−ΔH)·D_eff·c_s / (k_eff·T_s)
              </Text>
            </Box>
            <Text size="sm">
              <strong>And now the honest half.</strong>  What is painted is
              Prater’s exact consequence of the concentration field that was
              solved.  It is NOT the coupled non-isothermal pellet: the rate
              constant on this screen does not rise where the pellet is
              hotter.  The real coupled problem can have three steady states
              at one modulus and η above 1, and nothing here solves it.
            </Text>
          </Box>
        )}

        {advisoryAlert}

        <Box>
          <Title order={5}>
            What is the engine’s, and what is the drawing’s
          </Title>
          <Text size="xs" c={INK} mt={4}>
            <b>Engine output:</b> every band and every solid curve is the{" "}
            <code>c_over_cs</code> column of <code>{FIELD_CSV}</code> against
            its own <code>xi</code>; every dashed curve is{" "}
            <code>c_over_cs_closedForm</code> from the SAME row. η, φ,
            φ_char, c(centre) and the deviations are the operation’s own
            published diagnostics.
            {view === "family" && family && family.read.ok && (
              <> The η(φ) family is <code>{SWEEP_CSV}</code> as the{" "}
              {family.geometry} run wrote it — all three runs publish it
              identically, because it is parametric in φ and holds no pellet
              fixed.</>)}
          </Text>
          <Text size="xs" c={INK} mt={2}>
            <b>Drawn by this view:</b> the shapes; the stride that reduces the
            field to about {MAX_BANDS} piecewise-constant bands (published rows
            are DROPPED, never averaged); the colour ramp; and, on the family
            chart only, a log10 abscissa.  Nothing else.  No modulus, no
            effectiveness factor, no profile and no deviation is computed in
            the browser.
          </Text>
        </Box>

        <Box>
          <Title order={5}>What this does not model</Title>
          <Box mt={4} style={{ display: "grid", columnGap: 16, rowGap: 6,
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
            {THIELE_LIMITS.map((l) => (
              <Text key={l.id} size="xs" c={INK}>
                <b>{l.title}</b> {l.body}
              </Text>
            ))}
          </Box>
        </Box>

        <Box>
          <PanelNote>
            Runs tutorials/{THIELE_WITNESS} THREE times in your browser — once
            per shape — with your parameters written into its own dicts.  The
            species is {WITNESS_SPECIES} counter-diffusing against{" "}
            {WITNESS_CARRIER} in the {WITNESS_CATALYST} record.
          </PanelNote>
          <PanelNote>
            There is no ORDER knob and no film-coefficient knob: the operation
            models neither, and a knob that changed nothing would be worse than
            its absence.
          </PanelNote>
        </Box>

        <Text size="xs" c={TEXT}>
          Nothing on this page is computed in the page: every η, every φ and
          every profile point is the engine’s.
        </Text>
      </Stack>
    </Box>
  );
}
