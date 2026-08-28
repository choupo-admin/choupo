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
  BatchStaircasePlot -- the stages of a batch rectifier, at one instant.

  Asked for by name: students want to SEE the stages in transient
  distillation.  A batch still with trays is a McCabe construction that MOVES,
  and that is the whole lesson -- in a column the staircase is fixed and you
  count it once; here it slides down the curve as the pot depletes, and the
  distillate gets leaner while you watch.

  EVERY NUMBER IS THE ENGINE'S.  x_D, the reflux ratio and the pot composition
  come from the batch run's own trajectory at the selected instant; the curve
  is a choupoProps sweep.  This file draws the geometry on them and computes
  no physics -- and the geometry itself lives in case/mccabeThiele.ts, where
  it is checked against the engine's trajectory at every instant of the run.

  THE BOTTOM STEP IS THE CHECK.  The engine computed x_D FROM the pot through
  the trays; the staircase walks back down and lands on the pot.  The gap is
  printed rather than hidden -- it is the interpolation of a curve sampled at
  finite points, and on the shipped witness it is under 0.001.
\*---------------------------------------------------------------------------*/

import { Box, Text } from "@mantine/core";

import {
  batchRectifierStaircase, rectifyingLine, type EqCurve,
} from "../../case/mccabeThiele.js";

const INK = "var(--mantine-color-dimmed)";
const TEXT = "var(--mantine-color-text)";
const GRID = "var(--mantine-color-default-border)";
const ACCENT = "var(--mantine-primary-color-filled)";
const HOT = "#e8590c";
const POT = "#1971c2";

const W = 560, H = 470, ML = 60, MR = 20, MT = 16, MB = 48;
const sx = (x: number): number => ML + x * (W - ML - MR);
const sy = (y: number): number => H - MB - y * (H - MT - MB);

export interface StaircaseInstant {
  /** seconds into the batch */
  t: number;
  /** pot mole fraction of the light key, from the engine's own trajectory */
  xPot: number;
  /** distillate mole fraction, ditto */
  xD: number;
  /** reflux ratio at this instant, ditto */
  R: number;
}

export function BatchStaircasePlot({ curve, at, trays, light }: {
  curve: EqCurve;
  at: StaircaseInstant;
  trays: number;
  light: string;
}): JSX.Element {
  const s = batchRectifierStaircase(curve, at.xD, at.R, trays);
  const line = rectifyingLine(at.R, at.xD);
  const gap = Math.abs(s.xBottom - at.xPot);

  //  The operating line, from the diagonal anchor down to the last step.
  const xLo = Math.min(s.xBottom, at.xPot) * 0.92;
  const eq = curve.pts.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ");
  const stair = s.corners.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ");

  return (
    <Box>
      <svg viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        role="img"
        aria-label={"McCabe-Thiele construction for a batch rectifier at one "
          + "instant: the equilibrium curve, the rectifying operating line "
          + "anchored at the distillate on the diagonal, and the staircase of "
          + "ideal stages descending to the still pot"}>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={sx(v)} y1={sy(0)} x2={sx(v)} y2={sy(1)} stroke={GRID}
              strokeWidth={0.5} />
            <line x1={sx(0)} y1={sy(v)} x2={sx(1)} y2={sy(v)} stroke={GRID}
              strokeWidth={0.5} />
            <text x={sx(v)} y={sy(0) + 16} textAnchor="middle" fontSize={10}
              fill={INK}>{v.toFixed(2)}</text>
            <text x={sx(0) - 8} y={sy(v) + 3.5} textAnchor="end" fontSize={10}
              fill={INK}>{v.toFixed(2)}</text>
          </g>
        ))}
        <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} stroke={INK}
          strokeWidth={1} strokeDasharray="3 3" />
        <polyline points={eq} fill="none" stroke={ACCENT} strokeWidth={2} />
        <text x={sx(0.28)} y={sy(0.66)} fontSize={11} fill={ACCENT}>y*(x)</text>

        {/* the rectifying line, anchored on the diagonal at x_D */}
        <line x1={sx(xLo)} y1={sy(line.m * xLo + line.b)}
          x2={sx(at.xD)} y2={sy(at.xD)} stroke={HOT} strokeWidth={1.6} />

        {/* THE STAGES */}
        <polyline points={stair} fill="none" stroke={TEXT} strokeWidth={1.6} />
        {s.steps.map((st, i) => (
          <g key={i}>
            <circle cx={sx(st.x)} cy={sy(st.y)} r={3.6}
              fill={i === s.steps.length - 1 ? POT : TEXT} />
            <text x={sx(st.x) - 7} y={sy(st.y) - 6} fontSize={10}
              textAnchor="end" fill={INK}>
              {i === s.steps.length - 1 ? "pot" : i + 1}
            </text>
          </g>
        ))}

        {/* the distillate anchor, and the pot the ENGINE reports */}
        <circle cx={sx(at.xD)} cy={sy(at.xD)} r={4.5} fill="none"
          stroke={HOT} strokeWidth={1.8} />
        <text x={sx(at.xD) - 8} y={sy(at.xD) - 8} fontSize={10}
          textAnchor="end" fill={HOT}>x_D = {at.xD.toFixed(4)}</text>
        <line x1={sx(at.xPot)} y1={sy(0)} x2={sx(at.xPot)} y2={sy(0.08)}
          stroke={POT} strokeWidth={2} />
        <text x={sx(at.xPot)} y={sy(0) - 10} fontSize={10} textAnchor="middle"
          fill={POT}>pot {at.xPot.toFixed(4)}</text>

        <text x={(sx(0) + sx(1)) / 2} y={H - 10} textAnchor="middle"
          fontSize={11} fill={TEXT}>x — liquid mole fraction of {light}</text>
        <text x={14} y={(sy(0) + sy(1)) / 2} fontSize={11} fill={TEXT}
          transform={`rotate(-90 14 ${(sy(0) + sy(1)) / 2})`}
          textAnchor="middle">y — vapour mole fraction of {light}</text>
      </svg>

      <Text size="xs" c={INK} mt={4}>
        t = {at.t.toFixed(0)} s · R = {at.R.toFixed(2)} · {trays} tray
        {trays === 1 ? "" : "s"} above the pot, so the walk takes{" "}
        {trays + 1} equilibrium steps — the pot is one of them.  The last step
        lands at <strong>{s.xBottom.toFixed(4)}</strong> against the engine’s
        pot of <strong>{at.xPot.toFixed(4)}</strong>
        {gap < 1e-3
          ? `, closing to ${gap.toExponential(1)}.`
          : `; the gap of ${gap.toFixed(4)} is larger than this construction `
            + "usually closes to, which is worth reading as a finding rather "
            + "than a rounding."}
        {s.ranOut && "  The walk stopped early: the operating line has pinched "
          + "against the equilibrium curve, so further stages buy nothing."}
      </Text>
    </Box>
  );
}

export default BatchStaircasePlot;
