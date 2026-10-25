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
  bund through the tanks' centres: the impermeable floor falling to the
  sump, the walls and their height, the tanks on the floor (or on their
  plinths), the liquid inside each tank and in the bund, the low collection
  point and the drain valve outside the wall, the usable level under the
  freeboard.  Normal operation and the accident are told apart in WORDS as
  well as in ink: a title says which, a failed shell is dashed and labelled
  failed, an overtopping is an arrow and a sentence with its volume, an open
  drain says OPEN.

  THE VERTICAL SCALE IS EXAGGERATED, AND SAYS BY HOW MUCH.  A bund is long
  and low -- 11 m against 0.55 m in the exercise -- so at true scale the
  pool, the subject of the drawing, is a line two pixels thick.  The
  horizontal scale fits the length; the vertical scale fits the wall with
  room above it, and the factor between them is printed on the drawing.
  The tanks are far taller than the window, so each is CUT by a break line
  above the wall, as a section drawing does, with the elevation of the
  liquid inside it written beside the break when it is above the window.

  THE RULES THE SIBLING DRAWINGS KEEP (letdownDrawings.tsx): no prose in an
  SVG, only short placed labels, and the longer facts on header lines at
  the top that never collide with the drawing; ink and text are Mantine CSS
  variables so both themes draw them; the liquid is the house blue (blue-6)
  and what leaves the bund the house orange (orange-8), the pair the sibling
  tools validated against both themes' backgrounds, and each is also NAMED
  in words; the viewBox is 360 wide at 100 % width, so nothing scrolls
  sideways on a phone; role="img" and an aria-label that says what is shown.
\*---------------------------------------------------------------------------*/

import {
  floorAt, shellHeight, tankPositions, type Bund, type ScenarioPoint, type Tank,
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

/** The section view: horizontal to scale, vertical exaggerated by a factor
 *  the drawing prints. */
export function BundSection({ bund: b, tanks, state }: {
  bund: Bund; tanks: readonly Tank[]; state: SectionState;
}): JSX.Element {
  const W = 360, H = 250;
  const top0 = 46;                            // the header lines above the drawing
  const wallT = 0.25;                         // wall thickness drawn [m]
  const xs = tankPositions(b, tanks);
  const spanX = b.L + 2 * wallT + 2.8;        // + the valve outside, the dimension at the right
  const kx = (W - 30) / spanX;
  // the vertical window: below the floor, the wall, and room above it
  const eTop = b.wall * 1.7;
  const slab = 0.12 * b.wall, sumpD = 0.35 * b.wall, sumpW = 0.5;
  const ky = Math.max(kx, (H - top0 - 18) / (eTop + slab + sumpD));
  const ve = ky / kx;
  const ox = 10 + 2.0 * kx;                   // x = 0, the sump wall's inner face
  const oy = H - 14 - (slab + sumpD) * ky;    // elevation 0, the sump's rim
  const X = (x: number) => ox + x * kx;
  const Y = (e: number) => oy - e * ky;
  const yCut = Y(eTop);                       // the break line, top of the window
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
  const valveX = X(-wallT - 1.1), pipeY = Y(-sumpD * 0.5);
  const alerts: string[] = [];
  if (state.overtopped > 1e-9) alerts.push(`OVERTOPS ${m(state.overtopped, 2)} m3`);
  if (state.drainOpen && state.drained > 1e-9) alerts.push(`drained ${m(state.drained, 2)} m3`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={SVG_STYLE} role="img"
      aria-label={`A section through a bund ${m(b.L, 1)} m long with a ${m(b.wall)} m wall, `
        + `${tanks.length} standing tanks in it, the floor falling ${m(fallE)} m to a sump `
        + `at the left with a drain valve outside the wall (${state.drainOpen ? "OPEN" : "closed"}); `
        + `vertical scale exaggerated ${m(ve, 1)} times. `
        + `${state.title}: the pool stands ${m(e)} m above the sump`
        + `${state.overtopped > 1e-9 ? `, and ${m(state.overtopped, 1)} m3 has gone over the wall` : ""}`
        + `${state.drained > 1e-9 ? `, ${m(state.drained, 1)} m3 has left through the drain` : ""}.`}>
      <Label x={6} y={12} anchor="start" size={11} weight={700}>{state.title}</Label>
      <Label x={6} y={25} anchor="start" size={9} fill={INK}>
        {`h_w ${m(b.wall)} m · usable ${m(usable)} m · pool ${m(e, 3)} m · vertical ×${m(ve, 1)}`}
      </Label>
      {alerts.length > 0 && (
        <Label x={6} y={38} anchor="start" size={9} fill={HUE_ALERT} weight={700}>
          {alerts.join(" · ")}
        </Label>
      )}
      {/* outside ground */}
      <line x1={4} y1={Y(-slab)} x2={X(-wallT)} y2={Y(-slab)} stroke={INK} />
      <line x1={X(b.L + wallT)} y1={Y(fallE - slab)} x2={W - 4} y2={Y(fallE - slab)} stroke={INK} />
      {/* the floor slab, falling to the sump */}
      <polygon fill={METAL} stroke={INK} strokeWidth={0.8}
        points={`${X(-wallT)},${Y(-slab - sumpD)} ${X(sumpW)},${Y(-slab - sumpD)} `
          + `${X(sumpW)},${Y(floorAt(b, sumpW) - slab)} ${X(b.L + wallT)},${Y(fallE - slab)} `
          + `${X(b.L + wallT)},${Y(fallE)} ${X(sumpW)},${Y(floorAt(b, sumpW))} `
          + `${X(sumpW)},${Y(-sumpD)} ${X(0)},${Y(-sumpD)} ${X(0)},${Y(0)} ${X(-wallT)},${Y(0)}`} />
      {/* the pool and the sump's liquid */}
      {e > 0 && (
        <g>
          <rect x={X(0)} y={Y(0)} width={sumpW * kx} height={sumpD * ky}
            fill={HUE_LIQUID} opacity={0.55} />
          <polygon points={pool} fill={HUE_LIQUID} opacity={0.55} />
        </g>
      )}
      {/* the walls: level tops at h_w above the sump */}
      <rect x={X(-wallT)} y={Y(b.wall)} width={wallT * kx} height={(b.wall + slab + sumpD) * ky}
        fill={METAL} stroke={TEXT} strokeWidth={1} />
      <rect x={X(b.L)} y={Y(b.wall)} width={wallT * kx} height={(b.wall - fallE + slab) * ky}
        fill={METAL} stroke={TEXT} strokeWidth={1} />
      {/* the tanks, cut above the window */}
      {tanks.map((t, i) => {
        const x = xs[i]!;
        const zf = floorAt(b, x);
        const bottom = zf + t.plinth;
        const roof = bottom + shellHeight(t);
        const cut = roof > eTop;
        const yTop = cut ? yCut : Y(roof);
        const ok = state.intact[i] ?? true;
        const inside = Math.min(state.inside[i] ?? bottom, roof);
        const x0 = X(x - t.D / 2), w = t.D * kx;
        const yIn = Math.max(yTop, Y(inside));
        return (
          <g key={t.id}>
            {t.plinth > 0 && (t.solidPlinth
              ? <rect x={x0} y={Y(bottom)} width={w} height={(bottom - zf) * ky} fill={METAL} stroke={INK} />
              : <g>
                  <line x1={x0 + 3} y1={Y(bottom)} x2={x0 + 3} y2={Y(zf)} stroke={INK} strokeWidth={2} />
                  <line x1={x0 + w - 3} y1={Y(bottom)} x2={x0 + w - 3} y2={Y(zf)} stroke={INK} strokeWidth={2} />
                </g>)}
            <rect x={x0} y={yTop} width={w} height={Y(bottom) - yTop} fill={BG} stroke="none" />
            {inside > bottom && (
              <rect x={x0} y={yIn} width={w} height={Y(bottom) - yIn}
                fill={HUE_LIQUID} opacity={ok ? 0.8 : 0.55} />
            )}
            <polyline fill="none" stroke={TEXT} strokeWidth={1.2}
              strokeDasharray={ok ? undefined : "4 3"}
              points={`${x0},${yTop} ${x0},${Y(bottom)} ${x0 + w},${Y(bottom)} ${x0 + w},${yTop}`} />
            {cut
              ? <polyline fill="none" stroke={TEXT} strokeWidth={1}
                  points={`${x0 - 2},${yTop + 3} ${x0 + w * 0.35},${yTop - 3} ${x0 + w * 0.65},${yTop + 3} ${x0 + w + 2},${yTop - 3}`} />
              : <line x1={x0} y1={yTop} x2={x0 + w} y2={yTop} stroke={TEXT} strokeWidth={1.2}
                  strokeDasharray={ok ? undefined : "4 3"} />}
            <Label x={X(x)} y={yTop - 6} size={9} weight={ok ? undefined : 700}
              fill={ok ? TEXT : HUE_ALERT}>
              {t.id} {t.capacity} m3{ok ? "" : " failed"}
            </Label>
            {cut && inside > eTop && (
              <Label x={X(x)} y={yTop + 12} size={8} fill="#ffffff">{`liquid ${m(inside, 2)} m`}</Label>
            )}
          </g>
        );
      })}
      {/* the usable level under the freeboard */}
      {b.freeboard > 0 && (
        <line x1={X(0)} y1={Y(usable)} x2={X(b.L)} y2={Y(usable)} stroke={INK}
          strokeDasharray="1.5 3" strokeWidth={1.2} />
      )}
      {/* the wall height, dimensioned at the right */}
      <line x1={X(b.L + wallT) + 5} y1={Y(b.wall)} x2={X(b.L + wallT) + 5} y2={Y(0)} stroke={INK} />
      <line x1={X(b.L + wallT) + 2} y1={Y(b.wall)} x2={X(b.L + wallT) + 8} y2={Y(b.wall)} stroke={INK} />
      <line x1={X(b.L + wallT) + 2} y1={Y(0)} x2={X(b.L + wallT) + 8} y2={Y(0)} stroke={INK} />
      <Label x={X(b.L + wallT) + 10} y={Y(b.wall / 2) + 3} anchor="start" size={9}>h_w</Label>
      {/* the sump, the drain pipe through the wall and its valve outside */}
      <Label x={X(sumpW) + 3} y={Y(-sumpD) + 3} anchor="start" size={8} fill={INK}>sump</Label>
      <line x1={X(0)} y1={pipeY} x2={valveX} y2={pipeY} stroke={TEXT} strokeWidth={2} />
      <polygon fill={state.drainOpen ? HUE_ALERT : BG} stroke={TEXT}
        points={`${valveX - 6},${pipeY - 5} ${valveX + 6},${pipeY + 5} ${valveX + 6},${pipeY - 5} ${valveX - 6},${pipeY + 5}`} />
      <Label x={valveX - 4} y={pipeY - 9} anchor="start" size={8}
        fill={state.drainOpen ? HUE_ALERT : INK} weight={state.drainOpen ? 700 : undefined}>
        {state.drainOpen ? "OPEN" : "closed"}
      </Label>
      {state.drainOpen && state.drained > 1e-9 && (
        <Arrow x1={valveX - 6} y1={pipeY} x2={valveX - 12} y2={pipeY + 12} color={HUE_ALERT} />
      )}
      {/* overtopping, over the sump-end wall */}
      {state.overtopped > 1e-9 && (
        <Arrow x1={X(0) - 2} y1={Y(b.wall) - 3} x2={X(-wallT) - 12} y2={Y(b.wall) + 12}
          color={HUE_ALERT} width={2} />
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
