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
  FaultDiagrams -- ONE ORIGINAL SVG DIAGRAM PER STEP of the `fault-diagnosis`
  EduTool (DEV.md 4c C464), drawn from rectangles, lines, arrows and text and
  nothing else: no image, no icon font, no other source.  A diagram shows the
  IDEA of its step (the house and the unit, the two hypotheses, the sensor in
  the warm air, the balance around a tank); the live figures beside it carry
  the numbers.  tests/faultDiagnosis.test.ts holds that every step of the
  lesson has one.
\*---------------------------------------------------------------------------*/

import type { ReactNode } from "react";

import { DiagramFrame } from "./FaultCharts.js";

const BLUE = "#4dabf7";
const ORANGE = "#ffa94d";
const GREEN = "#69db7c";
const RED = "#ff8787";
const VIOLET = "#b197fc";
const INK = "currentColor";
const LINE = "var(--mantine-color-default-border)";

function Bx({ x, y, w, h, label, color, sub }: {
  x: number; y: number; w: number; h: number; label: string; color?: string; sub?: string;
}): JSX.Element {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={5} fill="none" stroke={color ?? INK} strokeWidth={1.4} />
      <text x={x + w / 2} y={y + h / 2 + (sub ? -2 : 4)} textAnchor="middle" fill={INK}>{label}</text>
      {sub && <text x={x + w / 2} y={y + h / 2 + 11} textAnchor="middle" fontSize={9} fill={INK}>{sub}</text>}
    </g>
  );
}

function Ar({ n, x1, y1, x2, y2, color, dashed }: {
  n: number; x1: number; y1: number; x2: number; y2: number; color?: string; dashed?: boolean;
}): JSX.Element {
  return (
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color ?? INK} strokeWidth={1.4}
      strokeDasharray={dashed ? "4 3" : undefined} markerEnd={`url(#ah${n})`} />
  );
}

const Tx = ({ x, y, children, color, anchor = "start", size }: {
  x: number; y: number; children: ReactNode; color?: string; anchor?: "start" | "middle" | "end"; size?: number;
}): JSX.Element => (
  <text x={x} y={y} textAnchor={anchor} fill={color ?? INK} fontSize={size}>{children}</text>
);

const path = (pts: readonly (readonly [number, number])[]): string =>
  pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0]},${p[1]}`).join(" ");

// 1: the house, the unit, the tank, the pump, the temperature trace
function D1(): JSX.Element {
  const n = 1;
  return (
    <DiagramFrame n={n} title="A house with a dehumidifier, its tank and pump, and the room temperature dipping each time the unit stops">
      <rect x={20} y={30} width={210} height={110} fill="none" stroke={INK} strokeWidth={1.4} />
      <path d="M12,32 L125,6 L238,32" fill="none" stroke={INK} strokeWidth={1.4} />
      <Tx x={125} y={50} anchor="middle">room (stores heat)</Tx>
      <Bx x={40} y={70} w={80} h={36} label="dehumidifier" color={ORANGE} sub="its motor warms the air" />
      <Bx x={40} y={114} w={80} h={20} label="tank" color={BLUE} />
      <Ar n={n} x1={120} y1={124} x2={160} y2={124} color={BLUE} />
      <Bx x={160} y={112} w={56} h={24} label="slow pump" />
      <Ar n={n} x1={130} y1={88} x2={185} y2={88} color={ORANGE} />
      <Tx x={190} y={92} color={ORANGE}>heat</Tx>
      <line x1={270} y1={130} x2={540} y2={130} stroke={INK} />
      <line x1={270} y1={20} x2={270} y2={130} stroke={INK} />
      <path d={path([[270, 50], [330, 50], [334, 78], [350, 66], [380, 52], [410, 50], [440, 50], [444, 78], [460, 66], [490, 52], [540, 50]])}
        fill="none" stroke={ORANGE} strokeWidth={2} />
      <Tx x={278} y={26}>room temperature</Tx>
      <Tx x={338} y={98} color={RED}>dip: tank full, unit stopped</Tx>
      <Tx x={540} y={146} anchor="end">time (a stop every 4.5 h)</Tx>
    </DiagramFrame>
  );
}

// 2: two hypotheses, three observations
function D2(): JSX.Element {
  const n = 2;
  const rows = ["time between stops", "length of a stop", "if the moisture load doubles"];
  const defrost = ["fixed by the timer", "the defrost time", "the same period"];
  const tank = ["volume / water collected", "volume / pump rate", "the period halves"];
  return (
    <DiagramFrame n={n} title="Two hypotheses predict the same period but different stop lengths and a different response to the load">
      <Tx x={190} y={22} anchor="middle" color={ORANGE}>auto-defrost (a timer)</Tx>
      <Tx x={400} y={22} anchor="middle" color={BLUE}>tank full, slow pump</Tx>
      {rows.map((r, i) => (
        <g key={r}>
          <Tx x={10} y={56 + 38 * i}>{r}</Tx>
          <Bx x={120} y={38 + 38 * i} w={140} h={26} label={defrost[i]!} color={ORANGE} />
          <Bx x={330} y={38 + 38 * i} w={140} h={26} label={tank[i]!} color={BLUE} />
        </g>
      ))}
      <Tx x={190} y={158} anchor="middle" size={10}>agree on the period (set equal)</Tx>
      <Tx x={400} y={158} anchor="middle" size={10}>differ on the other two: measure those</Tx>
    </DiagramFrame>
  );
}

// 3: the sensor in the unit's own warm air
function D3(): JSX.Element {
  const n = 3;
  return (
    <DiagramFrame n={n} title="A humidity sensor sitting in the warm air the unit itself makes, so the reading falls by about the width of the control band">
      <Bx x={30} y={50} w={120} h={60} label="unit" color={ORANGE} />
      <Bx x={190} y={62} w={70} h={36} label="sensor" color={VIOLET} />
      <Ar n={n} x1={150} y1={72} x2={188} y2={72} color={ORANGE} />
      <Ar n={n} x1={150} y1={88} x2={188} y2={88} color={ORANGE} />
      <Tx x={156} y={120} color={ORANGE} size={10}>warm exhaust air</Tx>
      <line x1={330} y1={20} x2={330} y2={140} stroke={INK} />
      <Tx x={324} y={28} anchor="end" size={10}>reading, % RH</Tx>
      <rect x={336} y={46} width={60} height={40} fill={BLUE} opacity={0.25} />
      <Tx x={402} y={64} size={10}>band 50 to 55</Tx>
      <line x1={420} y1={90} x2={420} y2={120} stroke={RED} strokeWidth={2} markerEnd={`url(#ah${n})`} />
      <Tx x={428} y={110} color={RED} size={10}>own heating lowers the reading</Tx>
      <Tx x={428} y={124} color={RED} size={10}>by about the band's width</Tx>
    </DiagramFrame>
  );
}

// 4: two relative humidities, one absolute humidity
function D4(): JSX.Element {
  const n = 4;
  return (
    <DiagramFrame n={n} title="Two sensors at different temperatures disagree in relative humidity but agree in grams of water per cubic metre">
      <Bx x={20} y={26} w={120} h={46} label="sensor A" color={BLUE} sub="18.4 C, 68 %" />
      <Bx x={20} y={92} w={120} h={46} label="sensor B" color={GREEN} sub="22.3 C, 52 %" />
      <Ar n={n} x1={140} y1={49} x2={210} y2={72} />
      <Ar n={n} x1={140} y1={115} x2={210} y2={92} />
      <Bx x={210} y={66} w={120} h={32} label="water per m3 of air" color={VIOLET} />
      <Ar n={n} x1={330} y1={82} x2={370} y2={82} />
      <rect x={380} y={40} width={50} height={90} fill={BLUE} opacity={0.5} />
      <rect x={440} y={44} width={50} height={86} fill={GREEN} opacity={0.5} />
      <line x1={374} y1={130} x2={500} y2={130} stroke={INK} />
      <Tx x={405} y={146} anchor="middle" size={10}>10.7</Tx>
      <Tx x={465} y={146} anchor="middle" size={10}>10.3 g/m3</Tx>
      <Tx x={20} y={14} size={10}>16 points apart in %RH ...</Tx>
      <Tx x={380} y={30} size={10}>... the same air</Tx>
    </DiagramFrame>
  );
}

// 5: four lessons
function D5(): JSX.Element {
  const t = [
    ["1", "separate the", "hypotheses"], ["2", "use what is", "conserved"],
    ["3", "redundancy finds", "a bad sensor"], ["4", "a controller can", "watch itself"],
  ];
  const cols = [ORANGE, BLUE, GREEN, RED];
  return (
    <DiagramFrame n={5} title="Four lessons: separate the hypotheses, use conserved quantities, use redundancy, beware a controller watching itself">
      {t.map((r, i) => (
        <g key={r[0]}>
          <rect x={14 + 136 * i} y={30} width={124} height={96} rx={8} fill="none" stroke={cols[i]!} strokeWidth={1.6} />
          <circle cx={76 + 136 * i} cy={56} r={13} fill="none" stroke={cols[i]!} strokeWidth={1.6} />
          <Tx x={76 + 136 * i} y={61} anchor="middle" color={cols[i]!}>{r[0]}</Tx>
          <Tx x={76 + 136 * i} y={94} anchor="middle">{r[1]}</Tx>
          <Tx x={76 + 136 * i} y={110} anchor="middle">{r[2]}</Tx>
        </g>
      ))}
    </DiagramFrame>
  );
}

// 6: limits
function D6(): JSX.Element {
  const n = 6;
  const pts: [number, number][] = [[40, 84], [70, 80], [100, 88], [130, 82], [160, 86], [190, 80], [220, 84], [250, 76], [280, 66], [310, 56], [340, 44], [370, 34], [400, 24]];
  return (
    <DiagramFrame n={n} title="A signal against warning and alarm limits: it crosses the warning limit first and the alarm limit later">
      <line x1={30} y1={130} x2={470} y2={130} stroke={INK} />
      <line x1={30} y1={14} x2={30} y2={130} stroke={INK} />
      <line x1={30} y1={52} x2={470} y2={52} stroke={ORANGE} strokeDasharray="6 3" />
      <Tx x={472} y={56} color={ORANGE} size={10}>high (warning)</Tx>
      <line x1={30} y1={30} x2={470} y2={30} stroke={RED} strokeDasharray="6 3" />
      <Tx x={472} y={34} color={RED} size={10}>high-high (alarm)</Tx>
      <line x1={30} y1={112} x2={470} y2={112} stroke={ORANGE} strokeDasharray="6 3" />
      <Tx x={472} y={116} color={ORANGE} size={10}>low</Tx>
      <path d={path(pts)} fill="none" stroke={BLUE} strokeWidth={2} />
      <circle cx={331} cy={52} r={4} fill={ORANGE} />
      <circle cx={384} cy={30} r={4} fill={RED} />
      <Tx x={36} y={146} size={10}>a limit sees one variable, one value at a time</Tx>
      <Ar n={n} x1={250} y1={140} x2={380} y2={140} dashed />
      <Tx x={310} y={152} size={10}>delay before the alarm</Tx>
    </DiagramFrame>
  );
}

// 7: the tank balance
function D7(): JSX.Element {
  const n = 7;
  return (
    <DiagramFrame n={n} title="A tank with an inlet meter, an outlet meter and a level transmitter; the balance residual is the meter difference minus what the level accounts for">
      <rect x={200} y={30} width={110} height={100} fill="none" stroke={INK} strokeWidth={1.4} />
      <rect x={201} y={74} width={108} height={55} fill={BLUE} opacity={0.3} />
      <Ar n={n} x1={60} y1={44} x2={200} y2={44} color={BLUE} />
      <Ar n={n} x1={310} y1={120} x2={450} y2={120} color={BLUE} />
      <circle cx={110} cy={44} r={14} fill="none" stroke={INK} /><Tx x={110} y={48} anchor="middle">FT</Tx>
      <circle cx={380} cy={120} r={14} fill="none" stroke={INK} /><Tx x={380} y={124} anchor="middle">FT</Tx>
      <circle cx={255} cy={74} r={13} fill="none" stroke={INK} /><Tx x={255} y={78} anchor="middle">LT</Tx>
      <Tx x={110} y={26} anchor="middle">in = 10</Tx>
      <Tx x={380} y={100} anchor="middle">out = 9</Tx>
      <Tx x={255} y={146} anchor="middle" color={RED}>level flat: r = 10 - 9 - 0 = 1</Tx>
      <Tx x={450} y={44} anchor="end" color={RED} size={10}>one meter is wrong, which?</Tx>
    </DiagramFrame>
  );
}

// 8: exchanger, drift vs step
function D8(): JSX.Element {
  const n = 8;
  const drift = path([[330, 56], [360, 62], [390, 72], [420, 84], [450, 96], [480, 104]]);
  const step = path([[330, 128], [400, 128], [400, 108], [480, 108]]);
  return (
    <DiagramFrame n={n} title="A heat exchanger and two time shapes: fouling is a slow drift of the estimated U, a shifted thermometer is a step">
      <rect x={30} y={50} width={200} height={46} rx={20} fill="none" stroke={INK} strokeWidth={1.4} />
      <Ar n={n} x1={10} y1={62} x2={30} y2={62} color={RED} />
      <Ar n={n} x1={230} y1={62} x2={256} y2={62} color={RED} />
      <Ar n={n} x1={256} y1={84} x2={230} y2={84} color={BLUE} />
      <Ar n={n} x1={30} y1={84} x2={4} y2={84} color={BLUE} />
      <Tx x={130} y={78} anchor="middle">UA = Q / LMTD</Tx>
      <Tx x={130} y={34} anchor="middle" color={RED} size={10}>hot side loses Q</Tx>
      <Tx x={130} y={118} anchor="middle" color={BLUE} size={10}>cold side gains Q</Tx>
      <Tx x={330} y={22} color={ORANGE}>fouling: drift, duties still agree</Tx>
      <path d={drift} fill="none" stroke={ORANGE} strokeWidth={2} />
      <Tx x={330} y={150} color={VIOLET}>thermometer: step, duties disagree</Tx>
      <path d={step} fill="none" stroke={VIOLET} strokeWidth={2} />
    </DiagramFrame>
  );
}

// 9: pump curves
function D9(): JSX.Element {
  const n = 9;
  const pump = path([[60, 30], [120, 36], [180, 52], [240, 80], [300, 118]]);
  const worn = path([[60, 50], [120, 56], [180, 72], [240, 100], [290, 128]]);
  const sys = path([[60, 120], [140, 112], [220, 90], [300, 50]]);
  return (
    <DiagramFrame n={n} title="Pump curve, worn pump curve and system curve: wear moves the operating point below the catalogue curve, a closed valve moves it along it">
      <line x1={50} y1={140} x2={330} y2={140} stroke={INK} /><line x1={50} y1={20} x2={50} y2={140} stroke={INK} />
      <Tx x={190} y={154} anchor="middle" size={10}>flow Q</Tx><Tx x={54} y={16} size={10}>head H</Tx>
      <path d={pump} fill="none" stroke={GREEN} strokeWidth={2} />
      <path d={worn} fill="none" stroke={RED} strokeWidth={2} strokeDasharray="5 3" />
      <path d={sys} fill="none" stroke={BLUE} strokeWidth={2} />
      <circle cx={214} cy={86} r={4} fill={GREEN} /><circle cx={190} cy={104} r={4} fill={RED} />
      <Tx x={345} y={44} color={GREEN}>catalogue curve</Tx>
      <Tx x={345} y={64} color={RED}>worn pump: point drops below it</Tx>
      <Tx x={345} y={84} color={BLUE}>piping: valve closing steepens it</Tx>
      <Tx x={345} y={116}>flow alone cannot tell them apart;</Tx>
      <Tx x={345} y={130}>head against the curve can</Tx>
    </DiagramFrame>
  );
}

// 10: three sensors, a vote
function D10(): JSX.Element {
  const n = 10;
  return (
    <DiagramFrame n={n} title="Two sensors that disagree cannot say which is wrong; with three, the odd one out is the suspect">
      <Bx x={20} y={20} w={90} h={28} label="A: 10.0" color={BLUE} />
      <Bx x={20} y={66} w={90} h={28} label="B: 10.1" color={GREEN} />
      <Bx x={20} y={112} w={90} h={28} label="C: 11.4" color={RED} />
      <Ar n={n} x1={110} y1={34} x2={190} y2={76} /><Ar n={n} x1={110} y1={80} x2={190} y2={80} /><Ar n={n} x1={110} y1={126} x2={190} y2={84} />
      <Bx x={190} y={62} w={110} h={36} label="median, compare" color={VIOLET} />
      <Ar n={n} x1={300} y1={80} x2={350} y2={80} />
      <Tx x={356} y={76} color={RED}>C is the odd one out</Tx>
      <Tx x={356} y={92} size={10}>(A and B alone: only "they disagree")</Tx>
      <Tx x={20} y={156} size={10}>|difference| / sqrt(sigma A^2 + sigma B^2) above about 3 is not noise</Tx>
    </DiagramFrame>
  );
}

// 11: the splitter and the mixer
function D11(): JSX.Element {
  const n = 11;
  return (
    <DiagramFrame n={n} title="A splitter and a mixer with five metered streams and two balances; the middle stream is in both balances">
      <Bx x={90} y={50} w={80} h={50} label="splitter" sub="F1 = F2 + F3" color={BLUE} />
      <Bx x={330} y={50} w={80} h={50} label="mixer" sub="F4 = F3 + F5" color={GREEN} />
      <Ar n={n} x1={20} y1={75} x2={90} y2={75} /><Tx x={34} y={66}>F1</Tx>
      <Ar n={n} x1={130} y1={50} x2={130} y2={14} /><Tx x={138} y={30}>F2</Tx>
      <Ar n={n} x1={170} y1={75} x2={330} y2={75} /><Tx x={242} y={66} color={RED}>F3: in both</Tx>
      <Ar n={n} x1={370} y1={134} x2={370} y2={100} /><Tx x={378} y={122}>F5</Tx>
      <Ar n={n} x1={410} y1={75} x2={480} y2={75} /><Tx x={440} y={66}>F4</Tx>
      <Tx x={20} y={150} size={10}>one balance: every meter gets the same score. two balances: a meter in both stands out.</Tx>
    </DiagramFrame>
  );
}

// 12: four signatures
function D12(): JSX.Element {
  const w = 120;
  const shapes: { name: string; d: string; c: string }[] = [
    { name: "step", d: path([[0, 70], [50, 70], [50, 36], [w, 36]]), c: ORANGE },
    { name: "drift", d: path([[0, 76], [w, 30]]), c: BLUE },
    { name: "oscillation", d: path(Array.from({ length: 25 }, (_, i) => [i * 5, 54 + 22 * Math.sin(i * 0.9)] as [number, number])), c: GREEN },
    { name: "noise only", d: path(Array.from({ length: 25 }, (_, i) => [i * 5, 54 + 7 * Math.sin(i * 2.3 + (i % 3))] as [number, number])), c: VIOLET },
  ];
  return (
    <DiagramFrame n={12} title="Four time signatures: a step, a drift, an oscillation with a period, and noise only">
      {shapes.map((s, i) => (
        <g key={s.name} transform={`translate(${16 + 136 * i},24)`}>
          <rect x={-4} y={-4} width={128} height={104} fill="none" stroke={LINE} />
          <path d={s.d} fill="none" stroke={s.c} strokeWidth={2} />
          <Tx x={62} y={122} anchor="middle">{s.name}</Tx>
        </g>
      ))}
      <line x1={16 + 136 * 2 + 12} y1={140} x2={16 + 136 * 2 + 60} y2={140} stroke={GREEN} markerEnd="url(#ah12)" />
      <Tx x={16 + 136 * 2 + 64} y={144} color={GREEN} size={10}>period</Tx>
    </DiagramFrame>
  );
}

// 13: a control chart and the bell curve
function D13(): JSX.Element {
  const n = 13;
  const pts: [number, number][] = [[40, 78], [70, 70], [100, 84], [130, 76], [160, 80], [190, 66], [220, 72], [250, 34], [280, 28], [310, 22]];
  return (
    <DiagramFrame n={n} title="A control chart with three-sigma limits, where the mean shifts and a later point crosses the upper limit">
      <line x1={30} y1={104} x2={380} y2={104} stroke={INK} strokeDasharray="2 3" />
      <Tx x={384} y={108} size={10}>mean</Tx>
      <line x1={30} y1={52} x2={380} y2={52} stroke={RED} strokeDasharray="6 3" />
      <Tx x={384} y={56} color={RED} size={10}>mean + 3 sigma</Tx>
      <line x1={30} y1={156} x2={380} y2={156} stroke={RED} strokeDasharray="6 3" />
      <Tx x={384} y={160} color={RED} size={10}>mean - 3 sigma</Tx>
      <path d={path(pts.map(([x, y]) => [x, y + 26] as [number, number]))} fill="none" stroke={BLUE} strokeWidth={2} />
      <circle cx={310} cy={48} r={4} fill={RED} />
      <Tx x={30} y={20} size={10}>no fault: a point outside about once in 370</Tx>
      <Tx x={30} y={34} size={10}>fault: the run length after the shift is much shorter</Tx>
    </DiagramFrame>
  );
}

const DIAGRAMS: Readonly<Record<number, () => JSX.Element>> = {
  1: D1, 2: D2, 3: D3, 4: D4, 5: D5, 6: D6, 7: D7, 8: D8, 9: D9, 10: D10, 11: D11, 12: D12, 13: D13,
};

/** The step numbers that have a diagram: the test compares it with the lesson's. */
export const DIAGRAM_STEPS: readonly number[] = Object.keys(DIAGRAMS).map(Number);

export function FaultDiagram({ n }: { n: number }): JSX.Element | null {
  const D = DIAGRAMS[n];
  return D ? <D /> : null;
}
