/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  bundDrawings -- the section view of "Secondary containment: designing a
  bund" (DEV.md 4c C136 item 2), and the level-against-time chart beside it.

  ONE DRAWING, DRIVEN BY THE PAGE'S NUMBERS.  A vertical section along the
  bund through the tanks' centres, to true scale: the impermeable floor
  falling to the sump, the walls and their height, the tanks on the floor
  (or on their plinths), the liquid inside each tank and in the bund, the
  low collection point and the drain valve outside the wall, the usable
  level under the freeboard.  Normal operation and the accident are drawn
  differently in WORDS as well as in ink: a title says which, a failed shell
  is dashed and labelled, an overtopping is an arrow with its volume, an
  open drain says OPEN.

  THE RULES THE SIBLING DRAWINGS KEEP (letdownDrawings.tsx): no prose in an
  SVG, only short placed labels; ink and text are Mantine CSS variables so
  both themes draw them; the liquid is the house blue (blue-6, validated by
  the sibling tools against both themes' backgrounds) and is also NAMED; the
  viewBox is 360 wide at 100 % width, so nothing scrolls sideways on a
  phone; role="img" and an aria-label that says what is shown.
\*---------------------------------------------------------------------------*/

import {
  floorAt, shellHeight, tankBody, tankPositions, type Bund, type ScenarioPoint, type Tank,
} from "./bund.js";

export const HUE_LIQUID = "#228be6";   // blue-6: the liquid
export const HUE_ALERT = "#e8590c";    // orange-8: what leaves the bund
const INK = "var(--mantine-color-dimmed)";
const TEXT = "var(--mantine-color-text)";
const METAL = "var(--mantine-color-default-border)";
const BG = "var(--mantine-color-body)";

const SVG_STYLE = { display: "block", width: "100%", maxWidth: 640 } as const;

function Label({ x, y, children, anchor = "middle", size = 10, fill = TEXT, weight }: {
  x: number; y: number; children: React.ReactNode; anchor?: "start" | "middle" | "end";
  size?: number; fill?: string; weight?: number;
}): JSX.Element {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={size} fill={fill}
      fontWeight={weight}>{children}</text>
  );
}

function Arrow({ x1, y1, x2, y2, color = INK, width = 1.5 }: {
  x1: number; y1: number; x2: number; y2: number; color?: string; width?: number;
}): JSX.Element {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const h = 6;
  const p1 = `${x2 - h * Math.cos(a - 0.45)},${y2 - h * Math.sin(a - 0.45)}`;
  const p2 = `${x2 - h * Math.cos(a + 0.45)},${y2 - h * Math.sin(a + 0.45)}`;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={width} />
      <polygon points={`${x2},${y2} ${p1} ${p2}`} fill={color} />
    </g>
  );
}

const m = (v: number, d = 2): string => v.toFixed(d);

/** What the section shows at one instant. */
export interface SectionState {
  /** The pool's elevation above the sump [m]; 0 is a dry bund. */
  level: number;
  /** Each tank's inside liquid elevation above the sump [m]. */
  inside: readonly number[];
  /** false: that tank's shell has failed (drawn dashed, its inside one with the pool). */
  intact: readonly boolean[];
  overtopped: number;   // m3 gone over the wall so far
  drainOpen: boolean;
  drained: number;      // m3 gone through the drain so far
  title: string;        // "normal operation", "t = 0.25 h after the rupture of T1", ...
}

/** The section view.  True scale, both axes: what is tall is drawn tall. */
export function BundSection({ bund: b, tanks, state }: {
  bund: Bund; tanks: readonly Tank[]; state: SectionState;
}): JSX.Element {
  const W = 360, H = 250;
  const wallT = 0.25;                         // wall thickness drawn [m]
  const slab = 0.2;                           // floor slab drawn [m]
  const sumpW = 0.5, sumpD = 0.3;             // the low collection point [m]
  const xs = tankPositions(b, tanks);
  const top = Math.max(b.wall, ...tanks.map((t, i) => {
    const body = tankBody(b, t, xs[i]!);
    return body.z + body.H;
  }));
  const spanX = b.L + 2 * wallT + 1.6;        // + the valve outside the sump wall
  const spanY = top + slab + sumpD + 0.4;
  const k = Math.min((W - 40) / spanX, (H - 46) / spanY);
  const ox = 20 + 1.4 * k + ((W - 40) - spanX * k) / 2;  // x = 0 (the sump wall's inner face)
  const oy = H - 22 - (slab + sumpD) * k;                 // elevation 0 (the sump's rim)
  const X = (x: number) => ox + x * k;
  const Y = (e: number) => oy - e * k;
  const fallE = floorAt(b, b.L);

  // the pool, between the floor and the level, from the sump to where it is dry
  const e = state.level;
  const xWet = b.slope > 0 ? Math.min(b.L, e / b.slope) : b.L;
  const pool = e > 0
    ? (xWet >= b.L
      ? `${X(0)},${Y(e)} ${X(b.L)},${Y(e)} ${X(b.L)},${Y(fallE)} ${X(0)},${Y(0)}`
      : `${X(0)},${Y(e)} ${X(xWet)},${Y(e)} ${X(0)},${Y(0)}`)
    : "";
  const usable = b.wall - b.freeboard;
  const valveX = X(-wallT - 0.9), pipeY = Y(-sumpD * 0.5);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={SVG_STYLE} role="img"
      aria-label={`A section through a bund ${m(b.L, 1)} m long with a ${m(b.wall)} m wall, `
        + `${tanks.length} standing tanks in it, the floor falling ${m(fallE)} m to a sump `
        + `at the left with a drain valve outside the wall (${state.drainOpen ? "OPEN" : "closed"}). `
        + `${state.title}: the pool stands ${m(e)} m above the sump`
        + `${state.overtopped > 1e-9 ? `, and ${m(state.overtopped, 1)} m3 has gone over the wall` : ""}`
        + `${state.drained > 1e-9 ? `, ${m(state.drained, 1)} m3 has left through the drain` : ""}.`}>
      <Label x={6} y={13} anchor="start" size={11} weight={700}>{state.title}</Label>
      {/* outside ground */}
      <line x1={8} y1={Y(-slab)} x2={X(-wallT)} y2={Y(-slab)} stroke={INK} />
      <line x1={X(b.L + wallT)} y1={Y(fallE - slab)} x2={W - 8} y2={Y(fallE - slab)} stroke={INK} />
      {/* the floor slab, falling to the sump */}
      <polygon fill={METAL} stroke={INK} strokeWidth={0.8}
        points={`${X(-wallT)},${Y(-slab - sumpD)} ${X(sumpW)},${Y(-slab - sumpD)} `
          + `${X(sumpW)},${Y(floorAt(b, sumpW) - slab)} ${X(b.L + wallT)},${Y(fallE - slab)} `
          + `${X(b.L + wallT)},${Y(fallE)} ${X(sumpW)},${Y(floorAt(b, sumpW))} `
          + `${X(sumpW)},${Y(-sumpD)} ${X(0)},${Y(-sumpD)} ${X(0)},${Y(0)} ${X(-wallT)},${Y(0)}`} />
      {/* the pool and the sump's liquid */}
      {e > 0 && (
        <g>
          <rect x={X(0)} y={Y(0)} width={sumpW * k} height={sumpD * k}
            fill={HUE_LIQUID} opacity={0.55} />
          <polygon points={pool} fill={HUE_LIQUID} opacity={0.55} />
        </g>
      )}
      {/* the walls: level tops at h_w above the sump */}
      <rect x={X(-wallT)} y={Y(b.wall)} width={wallT * k} height={(b.wall + slab + sumpD) * k}
        fill={METAL} stroke={TEXT} strokeWidth={1} />
      <rect x={X(b.L)} y={Y(b.wall)} width={wallT * k} height={(b.wall - fallE + slab) * k}
        fill={METAL} stroke={TEXT} strokeWidth={1} />
      {/* the tanks */}
      {tanks.map((t, i) => {
        const x = xs[i]!;
        const zf = floorAt(b, x);
        const bottom = zf + t.plinth;
        const Hs = shellHeight(t);
        const ok = state.intact[i] ?? true;
        const inside = Math.min(state.inside[i] ?? bottom, bottom + Hs);
        const x0 = X(x - t.D / 2), w = t.D * k;
        return (
          <g key={t.id}>
            {t.plinth > 0 && (t.solidPlinth
              ? <rect x={x0} y={Y(bottom)} width={w} height={t.plinth * k} fill={METAL} stroke={INK} />
              : <g>
                  <line x1={x0 + 3} y1={Y(bottom)} x2={x0 + 3} y2={Y(zf)} stroke={INK} strokeWidth={2} />
                  <line x1={x0 + w - 3} y1={Y(bottom)} x2={x0 + w - 3} y2={Y(zf)} stroke={INK} strokeWidth={2} />
                </g>)}
            <rect x={x0} y={Y(bottom + Hs)} width={w} height={Hs * k} fill={BG} stroke="none" />
            {inside > bottom && (
              <rect x={x0} y={Y(inside)} width={w} height={(inside - bottom) * k}
                fill={HUE_LIQUID} opacity={ok ? 0.8 : 0.55} />
            )}
            <rect x={x0} y={Y(bottom + Hs)} width={w} height={Hs * k} fill="none"
              stroke={TEXT} strokeWidth={1.2} strokeDasharray={ok ? undefined : "4 3"} />
            <Label x={X(x)} y={Y(bottom + Hs) - 4} size={9}>
              {t.id} {t.capacity} m3{ok ? "" : " failed"}
            </Label>
          </g>
        );
      })}
      {/* the levels */}
      <line x1={X(0)} y1={Y(usable)} x2={X(b.L)} y2={Y(usable)} stroke={INK}
        strokeDasharray="2 3" />
      {b.freeboard > 0 && (
        <Label x={X(b.L) - 2} y={Y(usable) + 10} anchor="end" size={8} fill={INK}>usable level</Label>
      )}
      {e > 0 && (
        <Label x={X(b.L) - 2} y={Y(e) - 3} anchor="end" size={9} fill={HUE_LIQUID} weight={700}>
          pool {m(e)} m
        </Label>
      )}
      {/* the wall height, dimensioned at the right */}
      <line x1={X(b.L + wallT) + 6} y1={Y(b.wall)} x2={X(b.L + wallT) + 6} y2={Y(0)} stroke={INK} />
      <Label x={X(b.L + wallT) + 9} y={Y(b.wall / 2) + 3} anchor="start" size={9}>
        h_w {m(b.wall)} m
      </Label>
      {/* the sump, the drain pipe through the wall and its valve outside */}
      <Label x={X(sumpW / 2)} y={Y(-slab - sumpD) + 11} size={8} fill={INK}>sump</Label>
      <line x1={X(0)} y1={pipeY} x2={valveX} y2={pipeY} stroke={TEXT} strokeWidth={2} />
      <polygon fill={state.drainOpen ? HUE_ALERT : BG} stroke={TEXT}
        points={`${valveX - 6},${pipeY - 5} ${valveX + 6},${pipeY + 5} ${valveX + 6},${pipeY - 5} ${valveX - 6},${pipeY + 5}`} />
      <Label x={valveX} y={pipeY - 8} size={8} fill={state.drainOpen ? HUE_ALERT : INK}
        weight={state.drainOpen ? 700 : undefined}>
        {state.drainOpen ? "drain OPEN" : "drain closed"}
      </Label>
      {state.drainOpen && state.drained > 1e-9 && (
        <g>
          <Arrow x1={valveX - 6} y1={pipeY} x2={valveX - 18} y2={pipeY + 12} color={HUE_ALERT} />
          <Label x={valveX - 6} y={pipeY + 24} size={8} fill={HUE_ALERT}>
            {m(state.drained, 1)} m3 to the sewer
          </Label>
        </g>
      )}
      {/* overtopping, over the sump-end wall */}
      {state.overtopped > 1e-9 && (
        <g>
          <Arrow x1={X(0) - 2} y1={Y(b.wall) - 2} x2={X(-wallT) - 14} y2={Y(b.wall) + 14}
            color={HUE_ALERT} width={2} />
          <Label x={X(-wallT) - 10} y={Y(b.wall) - 8} anchor="end" size={9} fill={HUE_ALERT}
            weight={700}>overtops {m(state.overtopped, 1)} m3</Label>
        </g>
      )}
    </svg>
  );
}

/** The pool's level against time, with the wall top and the usable level:
 *  where the line meets the wall, the bund overtops. */
export function LevelChart({ points, bund: b, cursor }: {
  points: readonly ScenarioPoint[]; bund: Bund; cursor: number;
}): JSX.Element {
  const W = 360, H = 170;
  const x0 = 40, x1 = 350, y0 = 140, y1 = 16;
  const tMax = Math.max(1e-9, points[points.length - 1]?.t ?? 1);
  const eMax = b.wall * 1.15;
  const X = (t: number) => x0 + (t / tMax) * (x1 - x0);
  const Y = (e: number) => y0 - (Math.min(e, eMax) / eMax) * (y0 - y1);
  const path = points.map((p, i) => `${i ? "L" : "M"} ${X(p.t).toFixed(1)} ${Y(p.level).toFixed(1)}`).join(" ");
  const c = points[Math.min(points.length - 1, Math.max(0, cursor))];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={SVG_STYLE} role="img"
      aria-label={`The pool's level against time over ${m(tMax)} h, against the wall top at ${m(b.wall)} m.`}>
      <line x1={x0} y1={y0} x2={x1} y2={y0} stroke={INK} />
      <line x1={x0} y1={y0} x2={x0} y2={y1} stroke={INK} />
      <line x1={x0} y1={Y(b.wall)} x2={x1} y2={Y(b.wall)} stroke={TEXT} strokeDasharray="5 3" />
      <Label x={x1} y={Y(b.wall) - 3} anchor="end" size={9}>wall top {m(b.wall)} m</Label>
      {b.freeboard > 0 && (
        <g>
          <line x1={x0} y1={Y(b.wall - b.freeboard)} x2={x1} y2={Y(b.wall - b.freeboard)}
            stroke={INK} strokeDasharray="2 3" />
          <Label x={x1} y={Y(b.wall - b.freeboard) + 10} anchor="end" size={8} fill={INK}>usable level</Label>
        </g>
      )}
      <path d={path} fill="none" stroke={HUE_LIQUID} strokeWidth={2} />
      {c && <circle cx={X(c.t)} cy={Y(c.level)} r={3.5} fill={HUE_LIQUID} />}
      <Label x={(x0 + x1) / 2} y={H - 8} size={9} fill={INK}>time [h]</Label>
      <Label x={x0 - 4} y={y0 + 3} anchor="end" size={8} fill={INK}>0</Label>
      <Label x={x0 - 4} y={Y(b.wall) + 3} anchor="end" size={8} fill={INK}>{m(b.wall)}</Label>
      <Label x={x1} y={y0 + 12} anchor="end" size={8} fill={INK}>{m(tMax)}</Label>
      <Label x={x0 + 4} y={y1 + 2} anchor="start" size={9} fill={HUE_LIQUID}>pool level [m]</Label>
    </svg>
  );
}
