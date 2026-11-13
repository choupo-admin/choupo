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
  THE PANEL'S DRAWING PRIMITIVES -- one bar with its limits, one trend, one
  lamp, one alarm colour, shared by the Panel workspace (ui/PanelWorkspace)
  and the operator-panels EduTool page (ui/methods/OperatorPanelsTool), so a
  lesson and the screen it teaches are drawn by the same code (DEV.md 4c
  C371, slice S2).

  THE HIGH-PERFORMANCE RULE they hold (the owner's answer to C371): grey by
  default, colour ONLY for an abnormal state, analogue bars with their limits
  drawn, trends beside the number, no decoration.  The ONE colour is ALARM,
  and it is applied only where the CALLER says the engine reported the
  element in alarm; a shape and a word always travel with it, so colour is
  never the only signal.

  NOTHING IS COMPUTED HERE.  A position on a scale is a published value
  placed against the engine's own range; the primitives compare no value
  with a limit.  `alarmOn` is the caller's reading of the engine's interval.
\*---------------------------------------------------------------------------*/

import { Box, Group, Text } from "@mantine/core";
import { useElementSize } from "@mantine/hooks";

export const GRID = "var(--mantine-color-default-border)";
export const INK = "var(--mantine-color-dimmed)";
export const TEXT = "var(--mantine-color-text)";
export const QUIET = "var(--mantine-color-gray-6)";
/** The ONE colour of the panel drawings, reserved for an element in alarm. */
export const ALARM = "#c92a2a";

export const sig = (v: number | undefined, n = 4): string =>
  (v !== undefined && Number.isFinite(v) ? Number(v.toPrecision(n)).toString() : "—");

/** A small trend, drawn at its container's width.  `limit` is the high
 *  limit (the lesson's name for it), `limitLow` the low one; `intervals` are
 *  the engine's alarm intervals, drawn as a band along the foot. */
export function MiniTrend({ t, y, yRef, range, limit, limitLow, intervals, cursor, alarmOn, height = 90, aria }: {
  t: readonly number[]; y: readonly number[]; yRef?: readonly number[];
  range: [number, number]; limit?: number; limitLow?: number;
  intervals?: readonly (readonly [number, number])[];
  cursor?: number; alarmOn?: boolean; height?: number; aria: string;
}): JSX.Element {
  const { ref, width } = useElementSize();
  const W = Math.max(80, Math.round(width || 260)), H = height, m = 4;
  const tMax = t[t.length - 1] || 1;
  const X = (x: number): number => m + (W - 2 * m) * x / tMax;
  const Y = (v: number): number => {
    const c = Math.min(Math.max(v, range[0]), range[1]);
    return m + (H - 2 * m) * (1 - (c - range[0]) / (range[1] - range[0]));
  };
  const path = (s: readonly number[]): string => s.map((v, i) => `${i ? "L" : "M"}${X(t[i]!).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  return (
    <Box ref={ref} style={{ width: "100%" }}>
      <svg width={W} height={H} role="img" aria-label={aria} style={{ display: "block" }}>
        <rect x={0.5} y={0.5} width={W - 1} height={H - 1} fill="none" stroke={GRID} />
        {(intervals ?? []).map(([a, b], k) => (
          <rect key={k} x={X(a)} y={H - m - 3} width={Math.max(2, X(b) - X(a))} height={3} fill={ALARM} />
        ))}
        {limit !== undefined && (
          <line x1={m} x2={W - m} y1={Y(limit)} y2={Y(limit)} stroke={QUIET} strokeDasharray="4 3" />
        )}
        {limitLow !== undefined && (
          <line x1={m} x2={W - m} y1={Y(limitLow)} y2={Y(limitLow)} stroke={QUIET} strokeDasharray="4 3" />
        )}
        {yRef && <path d={path(yRef)} fill="none" stroke={QUIET} strokeWidth={1.2} strokeDasharray="2 2" />}
        <path d={path(y)} fill="none" stroke={alarmOn ? ALARM : TEXT} strokeWidth={1.6} />
        {cursor !== undefined && <line x1={X(cursor)} x2={X(cursor)} y1={m} y2={H - m} stroke={INK} strokeWidth={0.8} />}
      </svg>
    </Box>
  );
}

/** A horizontal bar on its scale, the limits marked.  The fill turns to the
 *  alarm colour ONLY when the engine's interval says the element is in alarm. */
export function ScaleBar({ value, range, limit, limitLow, alarmOn, aria }: {
  value: number; range: [number, number]; limit?: number; limitLow?: number; alarmOn?: boolean; aria: string;
}): JSX.Element {
  const f = (v: number): number => Math.min(Math.max((v - range[0]) / (range[1] - range[0]), 0), 1);
  const tick = (v: number): JSX.Element => (
    <Box style={{ position: "absolute", top: -3, bottom: -3, left: `calc(${100 * f(v)}% - 1px)`, width: 2, background: TEXT }} />
  );
  return (
    <Box role="img" aria-label={aria} style={{ position: "relative", height: 14, border: `1px solid ${GRID}`, borderRadius: 2 }}>
      <Box style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${100 * f(value)}%`,
        background: alarmOn ? ALARM : QUIET, opacity: alarmOn ? 0.9 : 0.5 }} />
      {limit !== undefined && tick(limit)}
      {limitLow !== undefined && tick(limitLow)}
    </Box>
  );
}

/** The lamp: a word AND a shape, coloured only when in alarm. */
export function Lamp({ alarmOn, normal, high }: { alarmOn: boolean | undefined; normal: string; high: string }): JSX.Element {
  if (alarmOn === undefined) return <Text size="sm" c="dimmed">no alarm declared</Text>;
  return (
    <Group gap={8} wrap="nowrap">
      <svg width={18} height={18} aria-hidden>
        {alarmOn
          ? <polygon points="9,1 17,17 1,17" fill={ALARM} />
          : <circle cx={9} cy={9} r={7} fill="none" stroke={QUIET} strokeWidth={2} />}
      </svg>
      <Text size="sm" fw={alarmOn ? 700 : 500} c={alarmOn ? "red.8" : "dimmed"}>{alarmOn ? high : normal}</Text>
    </Group>
  );
}
