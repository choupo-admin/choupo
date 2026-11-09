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
  RelaxationFigures -- the live drawings of the `relaxation` EduTool (DEV.md
  4c C246: "esquemas visuais com graficos manobraveis").  Hand-drawn SVG, like
  the Wegstein page's error plot, because a draggable handle needs pointer
  events on a drawing this file owns, and Plotly would make that a fight.

  THREE FIGURES, each driven by a drag or a slider, none a static picture:

    SlopeCobweb  y = G(x) with the loop gain a as a DRAGGABLE handle, the
                 diagonal, the relaxed line of slope 1 - w + w a, and the
                 staircase of the relaxed iteration (the direct one dotted).
    GainMap      the (a, w) plane: the band |1 - w + w a| < 1, the optimal
                 factor w = 1/(1 - a), a >= 1 shaded "no w converges", the
                 over-relaxed strip w > 1 marked as the part the engine key
                 refuses, and the point the controls set -- itself draggable.
    SlopeHandle  the small version of the cobweb's handle, for the Wegstein
                 page, so the two pages feel like one instrument.

  EVERY DRAG HAS A KEYBOARD TWIN.  The handle is a slider role with arrow keys,
  and the page keeps its numeric sliders beside the drawings: a drawing that
  only a mouse can move is not accessible.  Colour never carries meaning
  alone: the methods differ by dash and marker as well as colour.

  The arithmetic is relaxationMath's; nothing here recomputes it.
\*---------------------------------------------------------------------------*/

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { Box } from "@mantine/core";

import {
  ENGINE_W_MAX, GAIN_MAX, GAIN_MIN, W_MAX, W_MIN,
  effectiveSlope, optimalW,
} from "./relaxationMath.js";

const GRID = "var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";
export const RELAXED = "#81c784";
export const GAIN_COLOUR = "#ef9a9a";
const OK_FILL = "rgba(129,199,132,0.20)";
const NO_FILL = "rgba(239,154,154,0.22)";
const OVER_FILL = "rgba(255,183,77,0.16)";

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, v));
const snap = (v: number, step: number): number => Math.round(v / step) * step;

/** Where in an SVG's own viewBox a pointer event landed. */
function local(e: PointerEvent<SVGElement>, svg: SVGSVGElement,
  vw: number, vh: number): { x: number; y: number } {
  const r = svg.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / Math.max(r.width, 1)) * vw,
    y: ((e.clientY - r.top) / Math.max(r.height, 1)) * vh,
  };
}

// ---- 1. The cobweb with a draggable slope -----------------------------------

const CW = 360, CH = 360, CM = 34;
const CLIM = 1.6;                      // the cobweb shows x, y in [-1.6, 1.6]
const cx = (x: number) => CM + ((x + CLIM) / (2 * CLIM)) * (CW - 2 * CM);
const cy = (y: number) => CH - CM - ((y + CLIM) / (2 * CLIM)) * (CH - 2 * CM);

/** The staircase of x+ = s x from x = 1 on the line y = s x, as polyline
 *  points, stopped when it leaves the box.  `s` is the slope of the map the
 *  iteration runs on (the gain for direct substitution, the effective slope
 *  for the relaxed one). */
export function staircase(s: number, maxSteps = 16): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  let x = 1;
  pts.push({ x, y: x });
  for (let k = 0; k < maxSteps; ++k) {
    const g = s * x;
    if (Math.abs(g) > CLIM || !Number.isFinite(g)) {
      //  stop at the box edge along the vertical segment
      pts.push({ x, y: clamp(g, -CLIM, CLIM) });
      break;
    }
    pts.push({ x, y: g });
    pts.push({ x: g, y: g });
    x = g;
    if (Math.abs(x) < 1e-4) break;
  }
  return pts;
}

export function SlopeCobweb({ a, w, onGain }: {
  a: number; w: number; onGain: (a: number) => void;
}): JSX.Element {
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef(false);
  const aEff = effectiveSlope(a, w);
  const move = (e: PointerEvent<SVGElement>) => {
    if (!drag.current || !ref.current) return;
    const p = local(e, ref.current, CW, CH);
    //  invert cy: the handle sits at x = 1, so its height IS the gain
    const y = ((CH - CM - p.y) / (CH - 2 * CM)) * (2 * CLIM) - CLIM;
    onGain(clamp(snap(y, 0.01), GAIN_MIN, GAIN_MAX));
  };
  const key = (e: KeyboardEvent<SVGElement>) => {
    const d = e.key === "ArrowUp" || e.key === "ArrowRight" ? 0.05
      : e.key === "ArrowDown" || e.key === "ArrowLeft" ? -0.05 : 0;
    if (d !== 0) { e.preventDefault(); onGain(clamp(snap(a + d, 0.01), GAIN_MIN, GAIN_MAX)); }
  };
  const poly = (pts: { x: number; y: number }[]) =>
    pts.map((p) => `${cx(p.x).toFixed(1)},${cy(p.y).toFixed(1)}`).join(" ");
  const ticks = [-1, 0, 1];
  return (
    <Box style={{ width: "100%", maxWidth: 420 }}>
      <svg ref={ref} viewBox={`0 0 ${CW} ${CH}`} width="100%"
        style={{ display: "block", touchAction: "none" }}
        role="img"
        aria-label={`Cobweb of the relaxed iteration; loop gain ${a.toFixed(2)}, `
          + `relaxation factor ${w.toFixed(2)}, effective slope ${aEff.toFixed(2)}`}
        onPointerMove={move}
        onPointerUp={() => { drag.current = false; }}
        onPointerLeave={() => { drag.current = false; }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={cx(t)} x2={cx(t)} y1={cy(-CLIM)} y2={cy(CLIM)}
              stroke={GRID} strokeDasharray="2 4" />
            <line x1={cx(-CLIM)} x2={cx(CLIM)} y1={cy(t)} y2={cy(t)}
              stroke={GRID} strokeDasharray="2 4" />
            <text x={cx(t)} y={CH - CM + 14} textAnchor="middle" fontSize={9}
              fill={INK}>{t}</text>
            <text x={CM - 6} y={cy(t) + 3} textAnchor="end" fontSize={9}
              fill={INK}>{t}</text>
          </g>
        ))}
        <text x={CW / 2} y={CH - 4} textAnchor="middle" fontSize={9} fill={INK}>
          guess  x − x* (what goes into the plant)
        </text>
        <text x={8} y={CM - 12} fontSize={9} fill={INK}>
          what comes back
        </text>
        {/* the diagonal: the answer lies where the curve meets it */}
        <line x1={cx(-CLIM)} y1={cy(-CLIM)} x2={cx(CLIM)} y2={cy(CLIM)}
          stroke={INK} strokeWidth={1} strokeDasharray="1 3" />
        {/* G: slope a */}
        <line x1={cx(-CLIM)} y1={cy(-CLIM * a)} x2={cx(CLIM)} y2={cy(CLIM * a)}
          stroke={GAIN_COLOUR} strokeWidth={2.2} />
        {/* H: slope 1 - w + w a */}
        <line x1={cx(-CLIM)} y1={cy(-CLIM * aEff)} x2={cx(CLIM)} y2={cy(CLIM * aEff)}
          stroke={RELAXED} strokeWidth={2.2} strokeDasharray="6 3" />
        {/* direct staircase, dotted; relaxed staircase, solid */}
        <polyline points={poly(staircase(a))} fill="none" stroke={GAIN_COLOUR}
          strokeWidth={1} strokeDasharray="2 2" opacity={0.8} />
        <polyline points={poly(staircase(aEff))} fill="none" stroke={RELAXED}
          strokeWidth={1.6} />
        {/* the draggable handle, on G at x = 1 */}
        <circle cx={cx(1)} cy={cy(clamp(a, -CLIM, CLIM))} r={9}
          fill={GAIN_COLOUR} stroke="#fff" strokeWidth={1.5}
          style={{ cursor: "ns-resize" }}
          tabIndex={0} role="slider" aria-label="loop gain a"
          aria-valuemin={GAIN_MIN} aria-valuemax={GAIN_MAX} aria-valuenow={a}
          onKeyDown={key}
          onPointerDown={(e) => {
            drag.current = true;
            (e.target as Element).setPointerCapture(e.pointerId);
          }} />
        <text x={cx(1) + 12} y={cy(clamp(a, -CLIM, CLIM)) + 3} fontSize={10}
          fill={GAIN_COLOUR}>a = {a.toFixed(2)}</text>
        <text x={CM + 4} y={CM + 4} fontSize={10} fill={RELAXED}>
          effective slope = {aEff.toFixed(2)}
        </text>
      </svg>
    </Box>
  );
}

/** The small draggable-slope strip the Wegstein page puts beside its cobweb:
 *  the line y = a x with a handle at x = 1.  `lo`/`hi` bound the gain as the
 *  Wegstein page's own sliders do. */
export function SlopeHandle({ a, lo, hi, label, onGain }: {
  a: number; lo: number; hi: number; label: string;
  onGain: (a: number) => void;
}): JSX.Element {
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef(false);
  const S = 140, M = 18, L = Math.max(Math.abs(lo), Math.abs(hi), 1) * 1.15;
  const px = (x: number) => M + ((x + 1.2) / 2.4) * (S - 2 * M);
  const py = (y: number) => S - M - ((y + L) / (2 * L)) * (S - 2 * M);
  const move = (e: PointerEvent<SVGElement>) => {
    if (!drag.current || !ref.current) return;
    const p = local(e, ref.current, S, S);
    const y = ((S - M - p.y) / (S - 2 * M)) * (2 * L) - L;
    onGain(clamp(snap(y, 0.01), lo, hi));
  };
  const key = (e: KeyboardEvent<SVGElement>) => {
    const d = e.key === "ArrowUp" || e.key === "ArrowRight" ? 0.01
      : e.key === "ArrowDown" || e.key === "ArrowLeft" ? -0.01 : 0;
    if (d !== 0) { e.preventDefault(); onGain(clamp(snap(a + d, 0.01), lo, hi)); }
  };
  return (
    <svg ref={ref} viewBox={`0 0 ${S} ${S}`} width={S}
      style={{ display: "block", touchAction: "none" }}
      role="img" aria-label={`Drag to set ${label}`}
      onPointerMove={move}
      onPointerUp={() => { drag.current = false; }}
      onPointerLeave={() => { drag.current = false; }}>
      <line x1={px(-1.2)} y1={py(-1.2)} x2={px(1.2)} y2={py(1.2)}
        stroke={INK} strokeDasharray="1 3" />
      <line x1={px(-1.2)} y1={py(-1.2 * a)} x2={px(1.2)} y2={py(1.2 * a)}
        stroke={GAIN_COLOUR} strokeWidth={2} />
      <circle cx={px(1)} cy={py(a)} r={8} fill={GAIN_COLOUR} stroke="#fff"
        strokeWidth={1.5} style={{ cursor: "ns-resize" }} tabIndex={0}
        role="slider" aria-label={label} aria-valuemin={lo} aria-valuemax={hi}
        aria-valuenow={a} onKeyDown={key}
        onPointerDown={(e) => {
          drag.current = true;
          (e.target as Element).setPointerCapture(e.pointerId);
        }} />
      <text x={S / 2} y={S - 3} textAnchor="middle" fontSize={9} fill={INK}>
        drag: {label} = {a.toFixed(2)}
      </text>
    </svg>
  );
}

// ---- 3. The (a, w) map -------------------------------------------------------

const MW = 460, MH = 300, MX0 = 44, MX1 = MW - 12, MY0 = 14, MY1 = MH - 34;
const mx = (a: number) => MX0 + ((a - GAIN_MIN) / (GAIN_MAX - GAIN_MIN)) * (MX1 - MX0);
const my = (w: number) => MY1 - ((w - 0) / W_MAX) * (MY1 - MY0);

export function GainMap({ a, w, onPoint }: {
  a: number; w: number; onPoint: (a: number, w: number) => void;
}): JSX.Element {
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef(false);
  const set = (e: PointerEvent<SVGElement>) => {
    if (!ref.current) return;
    const p = local(e, ref.current, MW, MH);
    const aa = GAIN_MIN + ((p.x - MX0) / (MX1 - MX0)) * (GAIN_MAX - GAIN_MIN);
    const ww = ((MY1 - p.y) / (MY1 - MY0)) * W_MAX;
    onPoint(clamp(snap(aa, 0.01), GAIN_MIN, GAIN_MAX),
      clamp(snap(ww, 0.01), W_MIN, W_MAX));
  };
  //  the converging band: for a < 1, 0 < w < min(W_MAX, 2/(1 - a))
  const band: string[] = [];
  const upper: string[] = [];
  const N = 80;
  for (let i = 0; i <= N; ++i) {
    const aa = GAIN_MIN + (i / N) * (1 - GAIN_MIN);       // a in [-2, 1]
    const top = aa >= 1 ? W_MAX : Math.min(W_MAX, 2 / (1 - aa));
    upper.push(`${mx(aa).toFixed(1)},${my(top).toFixed(1)}`);
  }
  band.push(`${mx(GAIN_MIN).toFixed(1)},${my(0).toFixed(1)}`);
  band.push(...upper);
  band.push(`${mx(1).toFixed(1)},${my(0).toFixed(1)}`);
  const opt: string[] = [];
  for (let i = 0; i <= N; ++i) {
    const aa = GAIN_MIN + (i / N) * (0.5 - GAIN_MIN);     // w_opt <= 2 for a <= 0.5
    const wo = optimalW(aa);
    if (wo !== null && wo <= W_MAX) opt.push(`${mx(aa).toFixed(1)},${my(wo).toFixed(1)}`);
  }
  const ticksA = [-2, -1, 0, 1, 2];
  const ticksW = [0, 0.5, 1, 1.5, 2];
  return (
    <Box style={{ width: "100%", maxWidth: 560 }}>
      <svg ref={ref} viewBox={`0 0 ${MW} ${MH}`} width="100%"
        style={{ display: "block", touchAction: "none", cursor: "crosshair" }}
        role="img"
        aria-label={`Map of relaxation factor against loop gain; the point is at `
          + `gain ${a.toFixed(2)}, factor ${w.toFixed(2)}`}
        onPointerDown={(e) => { drag.current = true;
          (e.currentTarget as Element).setPointerCapture(e.pointerId); set(e); }}
        onPointerMove={(e) => { if (drag.current) set(e); }}
        onPointerUp={() => { drag.current = false; }}
        onPointerLeave={() => { drag.current = false; }}>
        {/* everything is the "does not converge" colour; the band overpaints it */}
        <rect x={MX0} y={MY0} width={MX1 - MX0} height={MY1 - MY0} fill={NO_FILL} />
        <polygon points={band.join(" ")} fill={OK_FILL} />
        {/* the over-relaxed strip: the engine key refuses w above 1 */}
        <rect x={MX0} y={my(W_MAX)} width={MX1 - MX0}
          height={my(ENGINE_W_MAX) - my(W_MAX)} fill={OVER_FILL} />
        <text x={MX1 - 4} y={my(W_MAX) + 12} textAnchor="end" fontSize={9}
          fill={INK}>w &gt; 1: over-relaxation (Wegstein; the engine key refuses)</text>
        <text x={mx(1.5)} y={my(0.5)} textAnchor="middle" fontSize={10}
          fill={INK}>a &gt; 1: no w converges</text>
        <text x={mx(-0.6)} y={my(0.25)} textAnchor="middle" fontSize={10}
          fill={INK}>|1 − w + w a| &lt; 1</text>
        {ticksA.map((t) => (
          <g key={`a${t}`}>
            <line x1={mx(t)} x2={mx(t)} y1={MY0} y2={MY1} stroke={GRID}
              strokeDasharray="2 4" />
            <text x={mx(t)} y={MY1 + 13} textAnchor="middle" fontSize={9}
              fill={INK}>{t}</text>
          </g>
        ))}
        {ticksW.map((t) => (
          <g key={`w${t}`}>
            <line x1={MX0} x2={MX1} y1={my(t)} y2={my(t)} stroke={GRID}
              strokeDasharray="2 4" />
            <text x={MX0 - 5} y={my(t) + 3} textAnchor="end" fontSize={9}
              fill={INK}>{t}</text>
          </g>
        ))}
        <text x={(MX0 + MX1) / 2} y={MH - 4} textAnchor="middle" fontSize={9}
          fill={INK}>loop gain a</text>
        <text x={4} y={MY0 + 4} fontSize={9} fill={INK}>w</text>
        {/* w = 1: direct substitution */}
        <line x1={MX0} x2={MX1} y1={my(1)} y2={my(1)} stroke={GAIN_COLOUR}
          strokeWidth={1.2} strokeDasharray="4 3" />
        <text x={MX0 + 3} y={my(1) - 3} fontSize={9} fill={GAIN_COLOUR}>
          w = 1: direct substitution
        </text>
        {/* the optimal factor */}
        <polyline points={opt.join(" ")} fill="none" stroke={RELAXED}
          strokeWidth={2.2} />
        <text x={mx(-1.5)} y={my(optimalW(-1.5) ?? 0.4) - 6} fontSize={9}
          fill={RELAXED}>w = 1/(1 − a)</text>
        {/* the point the controls set */}
        <circle cx={mx(a)} cy={my(w)} r={7} fill="#fff" stroke="#000"
          strokeWidth={2} />
        <circle cx={mx(a)} cy={my(w)} r={2.5} fill="#000" />
      </svg>
    </Box>
  );
}
