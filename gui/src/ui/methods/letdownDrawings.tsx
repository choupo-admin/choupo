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
  letdownDrawings -- the hand-drawn schematics of "Large pressure letdown"
  (DEV.md 4c C64; Vitor: "coloca muitas imagens e esquemas!").

  EACH DRAWING SHOWS A MECHANISM, NOT DECORATION.  Four are driven by the
  page's numbers -- the pressure profile through a globe valve, the choked
  flow curve, the staged trim's stepped profile, the energy a turbine
  recovers -- and four are fixed schematics of hardware the engine does not
  model (the cavitating bubble, the drilled cage and the tortuous path, the
  two installations, the orifice in series).

  THE RULES THEY KEEP, from the sibling tools and the GUI credo:
    * NO PROSE IN AN SVG.  An SVG does not reflow; every sentence lives in
      the caption under the drawing, and only short placed LABELS sit
      inside it.  Each label is placed at a coordinate chosen for it, never
      guessed from a midpoint.
    * THEME.  Ink and text are Mantine CSS variables, so both themes draw
      them; the two hues are the pair FrontEndLoadingTool validated through
      the dataviz palette validator against #1f1f1f, #172123 and #ffffff
      (blue-6 #228be6, orange-8 #e8590c), which OverpressureTool reuses.  A
      hue is never the only channel: every line drawn in one is also NAMED
      by a label beside it, or dashed.
    * PHONE.  Every viewBox is 360 units wide and drawn at 100 % width, so
      at 390 px a unit is about a pixel and the smallest label (10) stays
      legible; nothing scrolls sideways.
    * Each SVG carries role="img" and an aria-label that says what it shows.
\*---------------------------------------------------------------------------*/

import type { Stage } from "./letdown.js";

export const HUE_A = "#228be6";   // blue-6: liquid, the valve, the shaft
export const HUE_B = "#e8590c";   // orange-8: vapour pressure, vapour, heat
const INK = "var(--mantine-color-dimmed)";
const TEXT = "var(--mantine-color-text)";
const METAL = "var(--mantine-color-default-border)";
const BG = "var(--mantine-color-body)";

const SVG_STYLE = { display: "block", width: "100%", maxWidth: 560 } as const;

function Label({ x, y, children, anchor = "middle", size = 11, fill = TEXT,
  weight }: {
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

const bar = (pa: number): string => (pa / 1e5).toFixed(pa < 1e6 ? 2 : 1);

// ---- (a) a globe valve, and the pressure along the path through it ---------

/** The cutaway of a flow-up globe valve and, aligned under it, the pressure
 *  along the flow path: P1, the dip to the vena contracta, the recovery to
 *  P2, against the vapour pressure.  Driven by the bench's numbers.
 *  `choked` says the flow is choked and Pvc is the pressure the vaporising
 *  vena contracta is held near (F_F Pv), not the single-phase relation's
 *  extrapolation (C70). */
export function ValveProfileDrawing({ P1, P2, Pvc, Pv, choked = false }: {
  P1: number; P2: number; Pvc: number; Pv: number; choked?: boolean;
}): JSX.Element {
  const W = 360, H = 300;
  // -- the profile's frame
  const x0 = 34, x1 = 350, top = 158, bot = 272;
  const Pmax = P1 * 1.05;
  const floor = 0;
  const y = (p: number) => bot - ((Math.max(p, floor) - floor) / (Pmax - floor)) * (bot - top);
  const xs = { inlet: 60, seat: 180, vc: 204, out: 300 };
  const below = Pvc < floor;
  const yVc = y(Pvc);
  const path = [
    `M ${x0} ${y(P1)}`, `L ${xs.seat - 46} ${y(P1)}`,
    `C ${xs.seat - 10} ${y(P1)}, ${xs.seat} ${yVc}, ${xs.vc} ${yVc}`,
    `C ${xs.vc + 26} ${yVc}, ${xs.vc + 40} ${y(P2)}, ${xs.out - 30} ${y(P2)}`,
    `L ${x1} ${y(P2)}`,
  ].join(" ");
  const cavitating = Pvc <= Pv && P2 > Pv;
  const flashing = P2 <= Pv;
  const yPv = y(Pv);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={SVG_STYLE} role="img"
      aria-label={"A globe valve in cutaway, flow entering below the seat and "
        + "leaving above it, and under it the pressure along that path: "
        + `flat at P1 = ${bar(P1)} bar, falling to its lowest at the vena `
        + `contracta just past the seat (${below ? "below zero, which a liquid cannot follow"
          : choked ? `held near ${bar(Pvc)} bar by vaporisation: the flow is choked`
          : `${bar(Pvc)} bar`}), `
        + `then recovering to P2 = ${bar(P2)} bar, drawn against the vapour `
        + `pressure Pv = ${bar(Pv)} bar.  ${flashing ? "The outlet is below Pv: flashing."
          : cavitating ? "Only the vena contracta is below Pv: cavitation." : "Nothing falls below Pv."}`}>
      {/* -- the valve body (cutaway) -- */}
      <rect x={110} y={14} width={140} height={110} rx={34} fill={METAL}
        stroke={INK} strokeWidth={1.5} />
      <rect x={118} y={22} width={124} height={94} rx={28} fill={BG} />
      {/* inlet (lower) and outlet (upper) pipes */}
      <rect x={6} y={74} width={112} height={30} fill={METAL} stroke={INK} />
      <rect x={6} y={79} width={116} height={20} fill={BG} />
      <rect x={242} y={34} width={112} height={30} fill={METAL} stroke={INK} />
      <rect x={238} y={39} width={116} height={20} fill={BG} />
      {/* the bridge with the seat ring in it */}
      <rect x={118} y={66} width={46} height={8} fill={METAL} stroke={INK} />
      <rect x={196} y={66} width={46} height={8} fill={METAL} stroke={INK} />
      {/* stem and plug */}
      <rect x={176} y={2} width={8} height={48} fill={METAL} stroke={INK} />
      <path d="M 162 50 L 198 50 L 192 62 L 168 62 Z" fill={METAL} stroke={INK} />
      {/* flow path */}
      <path d="M 14 89 L 150 89 Q 172 89 172 74 L 176 64" fill="none"
        stroke={HUE_A} strokeWidth={2.5} />
      <path d="M 184 64 Q 196 46 216 48 L 340 48" fill="none" stroke={HUE_A}
        strokeWidth={2.5} />
      <Arrow x1={300} y1={48} x2={346} y2={48} color={HUE_A} width={2.5} />
      <Arrow x1={20} y1={89} x2={70} y2={89} color={HUE_A} width={2.5} />
      <Label x={60} y={118} size={10} fill={INK}>inlet, P1</Label>
      <Label x={300} y={78} size={10} fill={INK}>outlet, P2</Label>
      <Label x={214} y={88} size={10} fill={INK} anchor="start">seat</Label>
      <line x1={196} y1={70} x2={212} y2={84} stroke={INK} strokeWidth={0.8} />
      <Label x={214} y={11} size={10} fill={INK} anchor="start">vena contracta</Label>
      <line x1={205} y1={47} x2={222} y2={14} stroke={INK} strokeWidth={0.8} />
      <Label x={170} y={11} size={10} fill={INK} anchor="end">plug</Label>
      {/* guides from the hardware to the profile */}
      {[xs.inlet, xs.seat, xs.vc, xs.out].map((gx) => (
        <line key={gx} x1={gx} x2={gx} y1={132} y2={bot} stroke={INK}
          strokeWidth={0.6} strokeDasharray="2 3" />
      ))}
      {/* -- the profile -- */}
      <line x1={x0} x2={x0} y1={top - 4} y2={bot} stroke={INK} />
      <line x1={x0} x2={x1} y1={bot} y2={bot} stroke={INK} />
      <Label x={x0 - 4} y={top + 2} anchor="end" size={10} fill={INK}>P</Label>
      <Label x={x0 - 4} y={bot + 4} anchor="end" size={10} fill={INK}>0</Label>
      <Label x={x1} y={bot + 13} anchor="end" size={10} fill={INK}>along the flow path</Label>
      {/* vapour pressure */}
      <line x1={x0} x2={x1} y1={yPv} y2={yPv} stroke={HUE_B} strokeWidth={1.5}
        strokeDasharray="6 4" />
      <Label x={x0 + 4} y={yPv - 4} anchor="start" size={11} fill={HUE_B} weight={600}>Pv</Label>
      <path d={path} fill="none" stroke={HUE_A} strokeWidth={2.5} />
      <Label x={x0 + 4} y={y(P1) - 5} anchor="start" size={11}>P1</Label>
      <Label x={x1 - 4} y={Math.abs(y(P2) - yPv) < 14 && y(P2) + 14 < bot ? y(P2) + 13 : y(P2) - 5}
        anchor="end" size={11}>P2</Label>
      {/* the vena-contracta value sits UNDER the axis, where no curve runs */}
      <Label x={xs.vc} y={bot + 13} size={11}>{below ? "Pvc < 0" : choked ? "Pvc ≈ F_F·Pv" : "Pvc"}</Label>
      <line x1={xs.vc} x2={xs.vc} y1={yVc} y2={bot} stroke={TEXT} strokeWidth={0.8} />
      {/* vapour where the pressure is below Pv */}
      {(cavitating || flashing) && (
        <g>
          {[0, 1, 2].map((i) => (
            <circle key={`b${i}`} cx={xs.vc - 8 + i * 9} cy={yVc - 10 - i * 2}
              r={2.5 + i * 0.8} fill="none" stroke={HUE_B} strokeWidth={1.2} />
          ))}
          {flashing && [0, 1, 2, 3].map((i) => (
            <circle key={`f${i}`} cx={xs.out - 6 + i * 13} cy={y(P2) - 12 - (i % 2) * 4}
              r={3 + i * 0.7} fill="none" stroke={HUE_B} strokeWidth={1.2} />
          ))}
          {cavitating && (
            <g>
              {[0, 1].map((i) => {
                const cx = xs.vc + 44 + i * 16, cy = y(P2) - 12;
                return (
                  <g key={`c${i}`} stroke={HUE_B} strokeWidth={1.4}>
                    <line x1={cx - 3} y1={cy - 3} x2={cx + 3} y2={cy + 3} />
                    <line x1={cx - 3} y1={cy + 3} x2={cx + 3} y2={cy - 3} />
                  </g>
                );
              })}
              <Label x={xs.vc + 52} y={y(P2) - 22} size={10} fill={HUE_B}>collapse</Label>
            </g>
          )}
          {flashing && (
            <Label x={xs.out + 14} y={Math.min(y(P2), yPv) - 26} size={10} fill={HUE_B}>vapour stays</Label>
          )}
        </g>
      )}
    </svg>
  );
}

// ---- (b) the choked-flow curve ------------------------------------------------

export function ChokedFlowChart({ valve, nozzle, xCh, xNozzle, xCase }: {
  /** Sampled (x, W/W_choked) pairs of the valve and of the ideal nozzle. */
  valve: readonly [number, number][];
  nozzle: readonly [number, number][];
  xCh: number; xNozzle: number; xCase: number | null;
}): JSX.Element {
  const W = 360, H = 230, x0 = 44, x1 = 344, top = 16, bot = 190;
  const X = (x: number) => x0 + x * (x1 - x0);
  const Y = (f: number) => bot - (f / 1.1) * (bot - top);
  const line = (pts: readonly [number, number][]) =>
    pts.map(([x, f], i) => `${i ? "L" : "M"} ${X(x).toFixed(1)} ${Y(f).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={SVG_STYLE} role="img"
      aria-label={"Mass flow through the valve, as a fraction of its choked "
        + "flow, against the pressure-drop ratio (P1 - P2)/P1.  The valve's "
        + `curve rises and then is flat from x = ${xCh.toFixed(3)}; the ideal `
        + `nozzle's from x = ${xNozzle.toFixed(3)}.${xCase !== null
          ? `  The purge letdown sits at x = ${xCase.toFixed(3)}, on the flat part.` : ""}`}>
      <line x1={x0} x2={x0} y1={top} y2={bot} stroke={INK} />
      <line x1={x0} x2={x1} y1={bot} y2={bot} stroke={INK} />
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <line x1={X(t)} x2={X(t)} y1={bot} y2={bot + 4} stroke={INK} />
          <Label x={X(t)} y={bot + 15} size={10} fill={INK}>{t.toFixed(2)}</Label>
        </g>
      ))}
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={x0 - 4} x2={x0} y1={Y(f)} y2={Y(f)} stroke={INK} />
          <Label x={x0 - 6} y={Y(f) + 4} anchor="end" size={10} fill={INK}>{f.toFixed(1)}</Label>
        </g>
      ))}
      <Label x={(x0 + x1) / 2} y={H - 6} size={10} fill={INK}>x = (P1 − P2)/P1</Label>
      <Label x={x0 + 2} y={top - 4} anchor="start" size={10} fill={INK}>W / W choked</Label>
      <line x1={X(xCh)} x2={X(xCh)} y1={top} y2={bot} stroke={HUE_A}
        strokeWidth={1} strokeDasharray="3 3" />
      <line x1={X(xNozzle)} x2={X(xNozzle)} y1={top} y2={bot} stroke={HUE_B}
        strokeWidth={1} strokeDasharray="3 3" />
      <path d={line(nozzle)} fill="none" stroke={HUE_B} strokeWidth={2}
        strokeDasharray="7 4" />
      <path d={line(valve)} fill="none" stroke={HUE_A} strokeWidth={2.5} />
      <Label x={X(xNozzle) - 4} y={Y(0.3)} anchor="end" size={10} fill={HUE_B}>nozzle</Label>
      <Label x={X(xCh) + 4} y={Y(0.3)} anchor="start" size={10} fill={HUE_A}>valve</Label>
      <Label x={X(0.97)} y={Y(1) - 8} anchor="end" size={10} fill={INK}>choked: flat</Label>
      {xCase !== null && (
        <g>
          <circle cx={X(xCase)} cy={Y(1)} r={4.5} fill={BG} stroke={TEXT} strokeWidth={1.5} />
          <Label x={X(xCase) - 2} y={Y(1) + 18} anchor="end" size={10}>purge</Label>
        </g>
      )}
    </svg>
  );
}

// ---- (c) single-stage against multi-stage -------------------------------------

/** The stepped pressure profile of an n-stage trim, each stage dipping to its
 *  own vena contracta, against the vapour pressure; the restrictions drawn
 *  above it.  Driven by the stages slider. */
export function StagesDrawing({ stages, Pv }: { stages: readonly Stage[]; Pv: number }): JSX.Element {
  const W = 360, H = 250, x0 = 34, x1 = 350, top = 70, bot = 220;
  const n = stages.length;
  const P1 = stages[0]?.P_in ?? 1;
  const yOf = (p: number) => bot - (Math.max(p, 0) / (P1 * 1.05)) * (bot - top);
  const span = (x1 - x0 - 16) / Math.max(n, 1);
  let d = `M ${x0} ${yOf(P1)}`;
  const marks: JSX.Element[] = [];
  stages.forEach((s, k) => {
    const a = x0 + 8 + k * span;
    const seat = a + span * 0.45, vc = a + span * 0.58, rec = a + span * 0.85;
    d += ` L ${seat - span * 0.12} ${yOf(s.P_in)}`;
    d += ` C ${seat} ${yOf(s.P_in)}, ${seat} ${yOf(s.P_vc)}, ${vc} ${yOf(s.P_vc)}`;
    d += ` C ${vc + span * 0.1} ${yOf(s.P_vc)}, ${vc + span * 0.12} ${yOf(s.P_out)}, ${rec} ${yOf(s.P_out)}`;
    d += ` L ${a + span} ${yOf(s.P_out)}`;
    // the restriction itself, drawn above
    marks.push(
      <g key={`r${k}`}>
        <rect x={seat - 2} y={18} width={4} height={14} fill={METAL} stroke={INK} />
        <rect x={seat - 2} y={42} width={4} height={14} fill={METAL} stroke={INK} />
      </g>,
    );
    if (s.P_vc <= Pv)
      marks.push(
        <circle key={`v${k}`} cx={vc} cy={yOf(Math.max(s.P_vc, 0)) - 9} r={3.5}
          fill="none" stroke={HUE_B} strokeWidth={1.3} />,
      );
  });
  d += ` L ${x1} ${yOf(stages[n - 1]?.P_out ?? 0)}`;
  const bad = stages.filter((s) => s.P_vc <= Pv).length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={SVG_STYLE} role="img"
      aria-label={`A trim of ${n} stage${n > 1 ? "s" : ""} drawn as ${n} restrictions in a pipe, `
        + "and under them the pressure stepping down through each, with a dip "
        + `at each vena contracta.  ${bad} of the ${n} dips reach the vapour pressure.`}>
      {/* the pipe and its restrictions */}
      <line x1={x0} x2={x1} y1={18} y2={18} stroke={INK} strokeWidth={1.5} />
      <line x1={x0} x2={x1} y1={56} y2={56} stroke={INK} strokeWidth={1.5} />
      <Arrow x1={x0 + 2} y1={37} x2={x0 + 26} y2={37} color={HUE_A} width={2} />
      {marks.filter((m) => String(m.key).startsWith("r"))}
      <Label x={x1} y={12} anchor="end" size={10} fill={INK}>
        {n === 1 ? "one restriction" : `${n} restrictions in series`}
      </Label>
      {/* profile */}
      <line x1={x0} x2={x0} y1={top - 4} y2={bot} stroke={INK} />
      <line x1={x0} x2={x1} y1={bot} y2={bot} stroke={INK} />
      <Label x={x0 - 4} y={top + 4} anchor="end" size={10} fill={INK}>P</Label>
      <Label x={x0 - 4} y={bot + 4} anchor="end" size={10} fill={INK}>0</Label>
      <line x1={x0} x2={x1} y1={yOf(Pv)} y2={yOf(Pv)} stroke={HUE_B}
        strokeWidth={1.5} strokeDasharray="6 4" />
      <Label x={x1} y={yOf(Pv) - 4} anchor="end" size={11} fill={HUE_B} weight={600}>Pv</Label>
      <path d={d} fill="none" stroke={HUE_A} strokeWidth={2.2} />
      {marks.filter((m) => String(m.key).startsWith("v"))}
      <Label x={x0 + 4} y={yOf(P1) - 5} anchor="start" size={11}>P1</Label>
      <Label x={x1} y={bot + 14} anchor="end" size={10} fill={INK}>along the trim</Label>
    </svg>
  );
}

// ---- (d) a drilled cage and a tortuous path -------------------------------------

export function TrimsDrawing(): JSX.Element {
  const holes = [0, 1, 2, 3, 4, 5];
  return (
    <svg viewBox="0 0 360 200" style={SVG_STYLE} role="img"
      aria-label={"Two low-noise, anti-cavitation trims.  Left: a drilled "
        + "cage in section, a sleeve pierced by rows of small holes around "
        + "the plug; the flow enters through the holes from outside and the "
        + "small jets from opposite walls meet in the middle.  Right: one "
        + "disc of a tortuous-path stack seen from above, its passage "
        + "turning through many right angles between the outer edge and "
        + "the bore."}>
      {/* -- left: drilled cage, in section -- */}
      <Label x={90} y={14} size={11} weight={600}>drilled cage</Label>
      {/* two cage walls with holes (gaps) */}
      {[46, 126].map((wx) => (
        <g key={wx}>
          {holes.map((i) => (
            <rect key={i} x={wx} y={30 + i * 22} width={8} height={16}
              fill={METAL} stroke={INK} />
          ))}
        </g>
      ))}
      {/* plug lowered into the cage */}
      <rect x={60} y={22} width={60} height={46} fill={METAL} stroke={INK} />
      <Label x={90} y={50} size={10} fill={INK}>plug</Label>
      {/* jets through the open holes below the plug */}
      {[3, 4, 5].map((i) => {
        const yy = 30 + i * 22 - 3;
        return (
          <g key={i}>
            <Arrow x1={20} y1={yy} x2={64} y2={yy} color={HUE_A} width={1.6} />
            <Arrow x1={160} y1={yy} x2={116} y2={yy} color={HUE_A} width={1.6} />
          </g>
        );
      })}
      <Label x={90} y={164} size={10} fill={HUE_A}>jets meet</Label>
      <Arrow x1={90} y1={168} x2={90} y2={190} color={HUE_A} width={1.6} />
      {/* -- right: one tortuous-path disc, from above -- */}
      <Label x={270} y={14} size={11} weight={600}>tortuous path</Label>
      <rect x={196} y={26} width={148} height={150} rx={10} fill={METAL} stroke={INK} />
      <circle cx={270} cy={101} r={24} fill={BG} stroke={INK} />
      <Label x={270} y={105} size={10} fill={INK}>bore</Label>
      <path d={"M 344 46 L 324 46 L 324 66 L 334 66 L 334 86 L 312 86 L 312 64 "
        + "L 300 64 L 300 92 L 294 92"}
        fill="none" stroke={BG} strokeWidth={7} strokeLinejoin="miter" />
      <path d={"M 344 46 L 324 46 L 324 66 L 334 66 L 334 86 L 312 86 L 312 64 "
        + "L 300 64 L 300 92 L 294 92"}
        fill="none" stroke={HUE_A} strokeWidth={1.8} strokeLinejoin="miter" />
      <Arrow x1={300} y1={92} x2={292} y2={92} color={HUE_A} width={1.8} />
      <Label x={330} y={190} anchor="end" size={10} fill={INK}>each turn a small drop</Label>
    </svg>
  );
}

// ---- (e) where the valve stands; a restriction orifice in series -----------------

function Drum({ x, y, w, h, label }: { x: number; y: number; w: number; h: number; label: string }): JSX.Element {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={w / 2} fill={METAL} stroke={INK} />
      <Label x={x + w / 2} y={y + h + 12} size={10} fill={INK}>{label}</Label>
    </g>
  );
}

/** A valve symbol (two triangles tip to tip) centred at (cx, cy). */
function ValveSymbol({ cx, cy, s = 9 }: { cx: number; cy: number; s?: number }): JSX.Element {
  return (
    <g stroke={TEXT} strokeWidth={1.4} fill={BG}>
      <polygon points={`${cx - s},${cy - s * 0.7} ${cx},${cy} ${cx - s},${cy + s * 0.7}`} />
      <polygon points={`${cx + s},${cy - s * 0.7} ${cx},${cy} ${cx + s},${cy + s * 0.7}`} />
      <line x1={cx} y1={cy} x2={cx} y2={cy - s - 4} />
      <rect x={cx - 5} y={cy - s - 9} width={10} height={5} />
    </g>
  );
}

export function InstallationDrawing(): JSX.Element {
  const row = (yy: number, valveX: number, good: boolean, label: string) => (
    <g>
      <Drum x={8} y={yy - 26} w={30} h={52} label="HP drum" />
      <Drum x={322} y={yy - 26} w={30} h={52} label="LP drum" />
      {/* the liquid part of the line */}
      <line x1={38} y1={yy} x2={valveX - 9} y2={yy} stroke={HUE_A} strokeWidth={4} />
      {/* the two-phase part, dashed in the vapour hue */}
      <line x1={valveX + 9} y1={yy} x2={322} y2={yy} stroke={HUE_B} strokeWidth={4}
        strokeDasharray="6 3" />
      <ValveSymbol cx={valveX} cy={yy} />
      <Label x={180} y={yy - 40} size={11} weight={600}>{label}</Label>
      {good
        ? <Label x={(38 + valveX) / 2} y={yy + 16} size={10} fill={HUE_A}>liquid, slow</Label>
        : <Label x={(valveX + 322) / 2} y={yy + 16} size={10} fill={HUE_B}>two-phase, fast</Label>}
      {!good && [0, 1, 2].map((i) => (
        <path key={i} d={`M ${150 + i * 50} ${yy - 8} q 6 -8 12 0`} fill="none"
          stroke={HUE_B} strokeWidth={1.2} />
      ))}
    </g>
  );
  return (
    <svg viewBox="0 0 360 230" style={SVG_STYLE} role="img"
      aria-label={"Two installations of the same flashing letdown.  Top: the "
        + "valve stands at the low-pressure drum's nozzle, so the long line "
        + "from the high-pressure drum carries only liquid and the two-phase "
        + "jet goes straight into the drum.  Bottom: the valve stands at the "
        + "high-pressure drum, and the whole long line carries the fast "
        + "two-phase flow, which erodes the bends."}>
      {row(70, 306, true, "valve at the receiving drum")}
      {row(176, 54, false, "valve at the source")}
    </svg>
  );
}

/** A control valve and a restriction orifice in series, and the two steps in
 *  pressure they share. */
export function SeriesDrawing(): JSX.Element {
  const yy = 50;
  return (
    <svg viewBox="0 0 360 190" style={SVG_STYLE} role="img"
      aria-label={"A control valve followed by a fixed restriction orifice "
        + "plate in the same line, and under them the pressure falling in "
        + "two steps instead of one: each device takes a part of the drop, "
        + "so neither takes it all."}>
      <line x1={10} y1={yy} x2={350} y2={yy} stroke={HUE_A} strokeWidth={4} />
      <ValveSymbol cx={110} cy={yy} s={11} />
      <Label x={110} y={yy + 26} size={10} fill={INK}>control valve</Label>
      <rect x={236} y={yy - 18} width={5} height={13} fill={METAL} stroke={INK} />
      <rect x={236} y={yy + 5} width={5} height={13} fill={METAL} stroke={INK} />
      <Label x={238} y={yy + 32} size={10} fill={INK}>orifice plate</Label>
      <Arrow x1={14} y1={yy - 12} x2={44} y2={yy - 12} color={HUE_A} width={1.6} />
      {/* the pressure steps */}
      <line x1={20} x2={20} y1={98} y2={176} stroke={INK} />
      <line x1={20} x2={350} y1={176} y2={176} stroke={INK} />
      <Label x={16} y={104} anchor="end" size={10} fill={INK}>P</Label>
      <path d="M 20 104 L 96 104 C 110 104 110 150 118 146 C 126 140 128 136 150 136 L 226 136 C 238 136 238 172 246 168 C 252 164 256 160 278 160 L 350 160"
        fill="none" stroke={HUE_A} strokeWidth={2.2} />
      <path d="M 20 112 L 96 112 C 110 112 110 186 118 182" fill="none"
        stroke={INK} strokeWidth={1} strokeDasharray="3 3" />
      <Label x={130} y={128} anchor="start" size={10} fill={INK}>part of the drop</Label>
      <Label x={256} y={152} anchor="start" size={10} fill={INK}>the rest</Label>
    </svg>
  );
}

// ---- (f) a turbine instead of a valve -------------------------------------------

export function RecoveryDrawing({ P_kW, eta }: { P_kW: number; eta: number }): JSX.Element {
  const x0 = 96, x1 = 344, len = x1 - x0;
  const shaft = Math.max(0, Math.min(1, eta)) * len;
  const fx = (v: number) => (Number.isFinite(v) ? v.toFixed(0) : "—");
  return (
    <svg viewBox="0 0 360 170" style={SVG_STYLE} role="img"
      aria-label={`The same ${fx(P_kW)} kW of hydraulic power, taken two ways.  `
        + "Through a valve, all of it is dissipated: the stream's enthalpy is "
        + "unchanged and the availability of the drop is destroyed.  Through a "
        + `power-recovery turbine of efficiency ${eta.toFixed(2)}, ${fx(eta * P_kW)} kW `
        + `reaches the shaft and ${fx((1 - eta) * P_kW)} kW is dissipated.`}>
      {/* valve row */}
      <ValveSymbol cx={40} cy={44} s={11} />
      <Label x={40} y={74} size={10} fill={INK}>valve</Label>
      <rect x={x0} y={34} width={len} height={20} fill={HUE_B} opacity={0.85} />
      <Label x={x1} y={68} anchor="end" size={10} fill={HUE_B}>
        {`${fx(P_kW)} kW hydraulic power dissipated`}
      </Label>
      {/* turbine row */}
      <circle cx={40} cy={122} r={16} fill={BG} stroke={TEXT} strokeWidth={1.4} />
      {[0, 1, 2, 3].map((i) => {
        const a = (i * Math.PI) / 2 + 0.4;
        return (
          <path key={i} d={`M 40 122 Q ${40 + 9 * Math.cos(a + 0.6)} ${122 + 9 * Math.sin(a + 0.6)} ${40 + 14 * Math.cos(a)} ${122 + 14 * Math.sin(a)}`}
            fill="none" stroke={TEXT} strokeWidth={1.4} />
        );
      })}
      <Label x={40} y={154} size={10} fill={INK}>turbine</Label>
      <rect x={x0} y={112} width={shaft} height={20} fill={HUE_A} />
      <rect x={x0 + shaft} y={112} width={len - shaft} height={20} fill={HUE_B} opacity={0.85} />
      <Label x={x0 + 4} y={106} anchor="start" size={10} fill={HUE_A}>{`shaft ${fx(eta * P_kW)} kW`}</Label>
      <Label x={x1} y={146} anchor="end" size={10} fill={HUE_B}>{`${fx((1 - eta) * P_kW)} kW dissipated`}</Label>
    </svg>
  );
}

// ---- (g) a cavitation bubble: growth, collapse, the jet, the pit ----------------

export function BubbleCollapseDrawing(): JSX.Element {
  const wallY = 150;
  return (
    <svg viewBox="0 0 360 190" style={SVG_STYLE} role="img"
      aria-label={"The life of a cavitation bubble near a wall, left to "
        + "right along the flow.  Where the pressure is below the vapour "
        + "pressure the bubble grows; carried to where the pressure has "
        + "recovered, it collapses unevenly, its far side folding in to "
        + "drive a thin jet of liquid at the wall; repeated millions of times "
        + "the jets and pressure pulses pit the metal."}>
      <Arrow x1={14} y1={18} x2={346} y2={18} color={INK} width={1.2} />
      <Label x={90} y={34} size={10} fill={INK}>P below Pv</Label>
      <Label x={270} y={34} size={10} fill={INK}>P recovered</Label>
      <line x1={180} y1={26} x2={180} y2={wallY} stroke={INK} strokeDasharray="3 4" />
      {/* growth */}
      {[{ x: 34, r: 6 }, { x: 74, r: 12 }, { x: 130, r: 20 }].map((b) => (
        <circle key={b.x} cx={b.x} cy={wallY - 32} r={b.r} fill="none"
          stroke={HUE_B} strokeWidth={1.6} />
      ))}
      <Label x={80} y={wallY - 64} size={10} fill={HUE_B}>grows</Label>
      {/* collapse: an indented bubble and its jet */}
      <path d="M 212 112 C 212 92, 248 92, 248 112 C 248 122, 240 128, 230 128 C 232 120, 228 114, 230 106 C 224 114, 218 122, 212 112 Z"
        fill="none" stroke={HUE_B} strokeWidth={1.6} />
      <Arrow x1={231} y1={100} x2={231} y2={wallY - 4} color={HUE_A} width={2.2} />
      <Label x={244} y={140} anchor="start" size={10} fill={HUE_A}>jet</Label>
      <Label x={230} y={84} size={10} fill={HUE_B}>collapses</Label>
      {/* small collapsed remnants */}
      {[300, 322].map((cx) => (
        <circle key={cx} cx={cx} cy={wallY - 12} r={2} fill={HUE_B} />
      ))}
      {/* the wall, pitted under the collapses */}
      <path d={`M 10 ${wallY} L 220 ${wallY} q 5 8 10 0 L 292 ${wallY} q 4 7 8 0 L 314 ${wallY} q 5 9 10 0 L 350 ${wallY}`}
        fill="none" stroke={TEXT} strokeWidth={1.6} />
      <rect x={10} y={wallY + 1} width={340} height={14} fill={METAL} />
      <Label x={300} y={wallY + 30} size={10} fill={INK}>pits</Label>
      <Label x={60} y={wallY + 30} size={10} fill={INK}>wall</Label>
    </svg>
  );
}
