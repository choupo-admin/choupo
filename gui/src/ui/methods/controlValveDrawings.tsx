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
  controlValveDrawings -- the drawings of "Why does a correctly sized valve
  still control badly?" (C509), drawn by hand in SVG.

  The rules are letdownDrawings.tsx's, kept: no prose inside an SVG (every
  sentence is the caption's); ink and text are Mantine CSS variables so both
  themes draw them; a 360-unit viewBox at 100 % width so a phone does not
  scroll sideways; a hue is never the only channel (every curve carries a
  direct label and a dash or a width of its own); role="img" and an aria-label.

  Two drawings: the series loop with the pressure the pump gives split between
  the line and the valve (SeriesLoopDrawing, card 1), and one chart of curves
  (CurveChart) the other cards use with their own series.
\*---------------------------------------------------------------------------*/

export const HUE_A = "#228be6";   // blue-6
export const HUE_B = "#e8590c";   // orange-8
export const HUE_C = "#2f9e44";   // green-8
const INK = "var(--mantine-color-dimmed)";
const TEXT = "var(--mantine-color-text)";
const METAL = "var(--mantine-color-default-border)";

const SVG_STYLE = { display: "block", width: "100%", maxWidth: 560 } as const;

function Label({ x, y, children, anchor = "middle", size = 10, fill = TEXT, weight }: {
  x: number; y: number; children: React.ReactNode;
  anchor?: "start" | "middle" | "end"; size?: number; fill?: string; weight?: number;
}): JSX.Element {
  return (
    <text x={x} y={y} textAnchor={anchor} fontSize={size} fill={fill}
      fontWeight={weight}>{children}</text>
  );
}

// ---- Card 1: the series loop and where the pressure goes -------------------

/** The pump behind a line and a valve in series, drawn as a pipe, with the
 *  pump's rise stacked as three bars (static elevation, line, valve) and the
 *  valve's share re-split live.  Values in Pa; drawn in bar. */
export function SeriesLoopDrawing({ elevation, line, valve, opening }: {
  elevation: number; line: number; valve: number; opening: number;
}): JSX.Element {
  const W = 360, H = 250;
  const total = elevation + line + valve;
  const barTop = 40, barBot = 205, bx = 205, bw = 56;
  const Y = (p: number) => (p / total) * (barBot - barTop);
  const yE = barBot - Y(elevation), yL = yE - Y(line), yV = yL - Y(valve);
  const bar = (pa: number) => (pa / 1e5).toFixed(2);
  const plugY = 128 - 16 * Math.min(1, Math.max(0, opening));   // plug rises as the valve opens
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={SVG_STYLE} role="img"
      aria-label={`The pump's rise of ${bar(total)} bar split between the static elevation `
        + `(${bar(elevation)} bar), the line (${bar(line)} bar) and the valve (${bar(valve)} bar), `
        + `with the valve at ${(opening * 100).toFixed(0)} per cent of its travel.`}>
      {/* the circuit: pump, line, valve, discharge vessel */}
      <circle cx={30} cy={150} r={14} fill="none" stroke={TEXT} strokeWidth={1.5} />
      <path d="M 24 144 L 38 150 L 24 156 Z" fill={TEXT} />
      <Label x={30} y={180} size={10} fill={INK}>pump</Label>
      <line x1={44} y1={150} x2={90} y2={150} stroke={METAL} strokeWidth={3} />
      <path d="M 90 150 C 100 150 100 120 110 120 L 120 120" fill="none" stroke={METAL} strokeWidth={3} />
      <path d="M 120 120 L 140 120" fill="none" stroke={HUE_B} strokeWidth={3} />
      <Label x={115} y={108} size={10} fill={HUE_B}>line</Label>
      <line x1={140} y1={120} x2={152} y2={120} stroke={METAL} strokeWidth={3} />
      {/* the valve: two cones and a stem, the gap is the opening */}
      <path d={`M 152 108 L 168 120 L 152 132 Z`} fill="none" stroke={HUE_A} strokeWidth={2} />
      <path d={`M ${184} 108 L 168 120 L ${184} 132 Z`} fill="none" stroke={HUE_A} strokeWidth={2} />
      <line x1={168} y1={plugY} x2={168} y2={96} stroke={HUE_A} strokeWidth={2} />
      <rect x={162} y={plugY - 2} width={12} height={5} fill={HUE_A} />
      <line x1={160} y1={96} x2={176} y2={96} stroke={HUE_A} strokeWidth={2} />
      <Label x={168} y={86} size={10} fill={HUE_A}>valve</Label>
      <line x1={184} y1={120} x2={196} y2={120} stroke={METAL} strokeWidth={3} />
      <Label x={168} y={150} size={10} fill={INK}>
        {(opening * 100).toFixed(0)} % open
      </Label>
      {/* the bar */}
      <rect x={bx} y={yV} width={bw} height={Math.max(0, yL - yV)} fill={HUE_A} opacity={0.85} />
      <rect x={bx} y={yL} width={bw} height={Math.max(0, yE - yL)} fill={HUE_B} opacity={0.85} />
      <rect x={bx} y={yE} width={bw} height={Math.max(0, barBot - yE)} fill={HUE_C} opacity={0.85} />
      <rect x={bx} y={barTop} width={bw} height={barBot - barTop} fill="none" stroke={TEXT} strokeWidth={1} />
      <Label x={bx + bw + 6} y={(yV + yL) / 2 + 3} anchor="start" size={10} fill={HUE_A}>
        valve {bar(valve)}
      </Label>
      <Label x={bx + bw + 6} y={(yL + yE) / 2 + 3} anchor="start" size={10} fill={HUE_B}>
        line {bar(line)}
      </Label>
      <Label x={bx + bw + 6} y={(yE + barBot) / 2 + 3} anchor="start" size={10} fill={HUE_C}>
        static {bar(elevation)}
      </Label>
      <Label x={bx + bw / 2} y={barTop - 8} size={10} fill={INK}>pump rise {bar(total)} bar</Label>
      <Label x={bx + bw / 2} y={barBot + 16} size={10} fill={INK}>shared</Label>
    </svg>
  );
}

// ---- One chart of curves for the other cards -------------------------------

export interface CurveSeries {
  name: string;
  pts: readonly [number, number][];
  color: string;
  dash?: string;
  width?: number;
  /** Where along x the series' name is written (x of the data). */
  labelX: number;
  /** Vertical nudge of the label in SVG units. */
  labelDy?: number;
}

export interface CurveMark {
  x: number; label: string; color: string;
}

export function CurveChart({ series, xMax, yMax, xLabel, yLabel, xTicks, yTicks, marks = [],
  aria }: {
  series: readonly CurveSeries[];
  xMax: number; yMax: number; xLabel: string; yLabel: string;
  xTicks: readonly number[]; yTicks: readonly number[];
  marks?: readonly CurveMark[];
  aria: string;
}): JSX.Element {
  const W = 360, H = 240, x0 = 40, x1 = 346, top = 18, bot = 196;
  const X = (x: number) => x0 + (x / xMax) * (x1 - x0);
  const Y = (y: number) => bot - (Math.min(y, yMax * 1.02) / yMax) * (bot - top);
  const d = (pts: readonly [number, number][]) =>
    pts.map(([x, y], i) => `${i ? "L" : "M"} ${X(x).toFixed(1)} ${Y(y).toFixed(1)}`).join(" ");
  const tick = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(v < 1 ? 2 : 1));
  const at = (s: CurveSeries): number => {
    let best = s.pts[0]!;
    for (const p of s.pts) if (Math.abs(p[0] - s.labelX) < Math.abs(best[0] - s.labelX)) best = p;
    return best[1];
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={SVG_STYLE} role="img" aria-label={aria}>
      <line x1={x0} x2={x0} y1={top} y2={bot} stroke={INK} />
      <line x1={x0} x2={x1} y1={bot} y2={bot} stroke={INK} />
      {xTicks.map((t) => (
        <g key={`x${t}`}>
          <line x1={X(t)} x2={X(t)} y1={bot} y2={bot + 4} stroke={INK} />
          <Label x={X(t)} y={bot + 15} fill={INK}>{tick(t)}</Label>
        </g>
      ))}
      {yTicks.map((t) => (
        <g key={`y${t}`}>
          <line x1={x0 - 4} x2={x0} y1={Y(t)} y2={Y(t)} stroke={INK} />
          <Label x={x0 - 6} y={Y(t) + 3} anchor="end" fill={INK}>{tick(t)}</Label>
        </g>
      ))}
      <Label x={(x0 + x1) / 2} y={H - 8} fill={INK}>{xLabel}</Label>
      <Label x={x0 + 2} y={top - 6} anchor="start" fill={INK}>{yLabel}</Label>
      {marks.map((m) => (
        <g key={m.label}>
          <line x1={X(m.x)} x2={X(m.x)} y1={top} y2={bot} stroke={m.color}
            strokeWidth={1} strokeDasharray="2 3" />
          <Label x={X(m.x) + 3} y={top + 9} anchor="start" fill={m.color}>{m.label}</Label>
        </g>
      ))}
      {series.map((s) => (
        <g key={s.name}>
          <path d={d(s.pts)} fill="none" stroke={s.color} strokeWidth={s.width ?? 2.2}
            strokeDasharray={s.dash} />
          <text x={X(s.labelX)} y={Y(at(s)) + (s.labelDy ?? -6)} textAnchor="middle" fontSize={10}
            fill={s.color} fontWeight={600} stroke="var(--mantine-color-body)" strokeWidth={3}
            paintOrder="stroke">{s.name}</text>
        </g>
      ))}
    </svg>
  );
}
