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
  FluidisedBedsTool — the EduTool `fluidised-beds`.

  The student's task, in one sentence: "I have a bed of particles and a gas;
  at what velocity does it fluidise, what regime will it be in, how much
  does it expand, and how much gas bypasses the particles?"

  The particles, the gas and the bed are chosen once at the top; each step
  answers one part of the question on them, and a short exercise at the end
  asks the student to refute three planted statements with the page.

  ALL OF IT IS THIS PAGE'S ARITHMETIC (gui/src/case/fluidisedBeds.ts), and
  every result panel is marked so: Choupo's engine has no fluidised bed.  The
  page writes the engine's Ergun gradient and its Schiller-Naumann terminal
  velocity in the same form, and says so.  The measurement, the source table
  and the proposal for an engine unit are in
  docs/design/fluidised-bed-hydrodynamics.md.  The plot, the panel and the
  table wrapper are the isotherm page's, imported, not redrawn.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import {
  Alert, Box, Button, Group, NumberInput, Select, Stack, Table, Text, Textarea, Title,
} from "@mantine/core";

import {
  DEFAULT_CLASSES, GELDART_LINES, GELDART_SAYS, archimedes, bedPressureDrop, bubbleBed,
  cutDiameter, elutriationTable, ergunGradient, geldartBoundaryD, geldartGroup, idealGasDensity,
  inputRefusal, minimumFluidisation, moriWenOutside, regimeMap, terminalVelocity,
  type BubbleInput, type FlowRegime, type Gas, type GeldartGroup, type GeldartLine, type Particle,
  type SizeClass,
} from "../../case/fluidisedBeds.js";
import { Panel, Wide, XYPlot, fmt } from "./AdsorptionIsothermsTool.js";
import { LessonLimits, LessonReferences, lessonStepper } from "./lessonStep.js";
import { FLUID_LIMITS, FLUID_STEPS } from "./fluidisedBedsLesson.js";

type XY = readonly [number, number];
const TEXT = "var(--mantine-color-text)";
const INK = "var(--mantine-color-dimmed)";
const GRID = "var(--mantine-color-default-border)";
const ERGUN = "#2a78d6", WEIGHT = "#d4572a", ANSWER = "#1baf7a", WENYU = "#8a5cd6";

const step = lessonStepper(FLUID_STEPS);
const num = (v: number | string): number => (v === "" ? NaN : Number(v));

/** Example particles, this page's own illustrative numbers, not measurements. */
const PARTICLES: readonly { id: string; label: string; d_um: number; rhoP: number; eps: number; F: number }[] = [
  { id: "sand", label: "Sand-like, 200 µm, 2600 kg/m³", d_um: 200, rhoP: 2600, eps: 0.42, F: 0 },
  { id: "catalyst", label: "Cracking-catalyst-like, 70 µm, 1500 kg/m³", d_um: 70, rhoP: 1500, eps: 0.45, F: 0.15 },
  { id: "fine", label: "A fine powder, 15 µm, 1200 kg/m³", d_um: 15, rhoP: 1200, eps: 0.55, F: 1 },
  { id: "grain", label: "Grain-like, 3 mm, 1200 kg/m³", d_um: 3000, rhoP: 1200, eps: 0.40, F: 0 },
];

/** Gases by molar mass (g/mol); the viscosity is typed by the student. */
const GASES: readonly { id: string; label: string; M: number }[] = [
  { id: "air", label: "air (M = 28.96 g/mol)", M: 28.96 },
  { id: "N2", label: "nitrogen (M = 28.01 g/mol)", M: 28.01 },
  { id: "CO2", label: "carbon dioxide (M = 44.01 g/mol)", M: 44.01 },
  { id: "He", label: "helium (M = 4.003 g/mol)", M: 4.003 },
];

const GROUP_COLOR: Readonly<Record<GeldartGroup, string>> = {
  C: "#9b9b9b", A: "#2a78d6", B: "#1baf7a", D: "#d4572a",
};

const REGIME_COLOR: Readonly<Record<FlowRegime, string>> = {
  "fixed bed": "#9b9b9b",
  "particulate (no bubbles)": "#8a5cd6",
  "bubbling": "#2a78d6",
  "turbulent": "#e0a100",
  "fast fluidisation or pneumatic transport": "#d4572a",
};

function grid(lo: number, hi: number, n: number, log = false): number[] {
  return Array.from({ length: n }, (_, k) => (log
    ? lo * Math.pow(hi / lo, k / (n - 1)) : lo + ((hi - lo) * k) / (n - 1)));
}

/** A velocity with a unit that keeps it readable. */
const fmtU = (u: number): string => (!Number.isFinite(u) ? "—"
  : u < 0.1 ? `${fmt(u * 100, 3)} cm/s` : `${fmt(u, 3)} m/s`);

/** Parse "d mass%" lines; a line that does not read is a refusal, never skipped. */
export function parseClasses(text: string): { classes: SizeClass[]; refused: string | null } {
  const classes: SizeClass[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l !== "");
  for (const [k, l] of lines.entries()) {
    const parts = l.split(/[\s,;]+/).map(Number);
    if (parts.length !== 2 || !parts.every((x) => Number.isFinite(x) && x >= 0) || !(parts[0]! > 0)) {
      return { classes: [], refused: `line ${k + 1} ("${l}") is not a positive diameter in µm and a mass percentage` };
    }
    classes.push({ d_um: parts[0]!, massPct: parts[1]! });
  }
  if (classes.length === 0) return { classes, refused: "type at least one size class" };
  return { classes, refused: null };
}

// ---- Geldart's map ----------------------------------------------------------------------

const GW = 560, GH = 360, GML = 64, GMR = 26, GMT = 12, GMB = 52;
const GX0 = 1, GX1 = Math.log10(5000), GY0 = -1, GY1 = 1;   // d 10..5000 µm, drho 0.1..10 g/cm3

function GeldartMap({ d_um, drho }: { d_um: number; drho: number }): JSX.Element {
  const X = (d: number): number => GML + ((Math.log10(d) - GX0) / (GX1 - GX0)) * (GW - GML - GMR);
  const Y = (r: number): number => GH - GMB - ((Math.log10(r) - GY0) / (GY1 - GY0)) * (GH - GMT - GMB);
  const lines: GeldartLine[] = ["CA", "AB", "BD"];
  const ys = grid(0.1, 10, 40, true);
  const label: readonly { g: GeldartGroup; d: number; r: number }[] = [
    { g: "C", d: 14, r: 0.3 }, { g: "A", d: 200, r: 0.25 }, { g: "B", d: 500, r: 1 }, { g: "D", d: 2500, r: 3 },
  ];
  const ticksX = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  const ticksY = [0.1, 0.2, 0.5, 1, 2, 5, 10];
  const inMap = d_um >= 10 && d_um <= 5000 && drho >= 0.1 && drho <= 10;
  return (
    <Box>
      <svg viewBox={`0 0 ${GW} ${GH}`} width="100%" role="img" style={{ display: "block", maxWidth: GW, fontSize: 15 }}
        aria-label="Geldart's map, approximated by straight lines on log axes, with your particle">
        <rect x={GML} y={GMT} width={GW - GML - GMR} height={GH - GMT - GMB} fill="none" stroke={GRID} />
        {ticksX.map((t) => (
          <g key={`x${t}`}>
            <line x1={X(t)} x2={X(t)} y1={GMT} y2={GH - GMB} stroke={GRID} strokeWidth={0.6} />
            <text x={X(t)} y={GH - GMB + 19} textAnchor="middle" fill={INK}>{t}</text>
          </g>
        ))}
        {ticksY.map((t) => (
          <g key={`y${t}`}>
            <line x1={GML} x2={GW - GMR} y1={Y(t)} y2={Y(t)} stroke={GRID} strokeWidth={0.6} />
            <text x={GML - 6} y={Y(t) + 4} textAnchor="end" fill={INK}>{t}</text>
          </g>
        ))}
        <clipPath id="geldart-clip"><rect x={GML} y={GMT} width={GW - GML - GMR} height={GH - GMT - GMB} /></clipPath>
        <g clipPath="url(#geldart-clip)">
          {lines.map((l) => (
            <path key={l} fill="none" stroke={TEXT} strokeWidth={1.6} strokeDasharray="7 4"
              d={ys.map((r, k) => `${k ? "L" : "M"}${X(geldartBoundaryD(l, r)).toFixed(1)},${Y(r).toFixed(1)}`).join("")} />
          ))}
          {label.map((l) => (
            <text key={l.g} x={X(l.d)} y={Y(l.r)} textAnchor="middle" fontSize={26} fontWeight={700}
              fill={GROUP_COLOR[l.g]}>{l.g}</text>
          ))}
          {inMap && <circle cx={X(d_um)} cy={Y(drho)} r={7} fill={ANSWER} stroke="var(--mantine-color-body)" strokeWidth={1.5} />}
        </g>
        <text x={(GML + GW - GMR) / 2} y={GH - 10} textAnchor="middle" fill={TEXT}>mean particle diameter, µm (log)</text>
        <text x={14} y={(GMT + GH - GMB) / 2} textAnchor="middle" fill={TEXT}
          transform={`rotate(-90 14 ${(GMT + GH - GMB) / 2})`}>ρp − ρg, g/cm³ (log)</text>
      </svg>
      <Text size="xs" c="dimmed">
        Dashed: the page&apos;s straight-line approximation of the published boundaries
        (C/A: Δρ d² = {GELDART_LINES.CA.value}; A/B: Δρ d = {GELDART_LINES.AB.value}; B/D: Δρ d² = 10⁶;
        d in µm, Δρ in g/cm³), not a tracing of the published map.  The green dot is your particle
        {inMap ? "" : " (outside the drawn range, so not drawn)"}.
      </Text>
    </Box>
  );
}

// ---- the regime axis ---------------------------------------------------------------------

function RegimeAxis({ bands, u, ut }: { bands: { regime: FlowRegime; from: number; to: number }[]; u: number; ut: number }): JSX.Element {
  const W = 560, H = 120, ML = 30, MR = 30;
  const finite = [...bands.flatMap((b) => [b.from, b.to]), u, ut].filter((x) => Number.isFinite(x) && x > 0);
  const lo = Math.log10(Math.min(...finite) / 3), hi = Math.log10(Math.max(...finite) * 3);
  const X = (v: number): number => ML + ((Math.log10(Math.max(v, 10 ** lo)) - lo) / (hi - lo)) * (W - ML - MR);
  const xEnd = (v: number): number => (Number.isFinite(v) ? X(v) : W - MR);
  const ticks: number[] = [];
  for (let e = Math.ceil(lo); e <= Math.floor(hi); e++) ticks.push(10 ** e);
  return (
    <Box>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" style={{ display: "block", maxWidth: W, fontSize: 18 }}
        aria-label="the regimes along a velocity axis, with your velocity and the particle's terminal velocity">
        {bands.map((b) => (
          <rect key={b.regime} x={b.from > 0 ? X(b.from) : ML} y={30} height={34}
            width={Math.max(0, xEnd(b.to) - (b.from > 0 ? X(b.from) : ML))} fill={REGIME_COLOR[b.regime]} opacity={0.75} />
        ))}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={X(t)} x2={X(t)} y1={64} y2={70} stroke={TEXT} />
            <text x={X(t)} y={90} textAnchor="middle" fill={INK}>{t >= 1 ? `${t} m/s` : `${t}`}</text>
          </g>
        ))}
        <line x1={X(ut)} x2={X(ut)} y1={22} y2={70} stroke={TEXT} strokeWidth={2} strokeDasharray="5 3" />
        <text x={X(ut)} y={18} textAnchor="middle" fill={TEXT}>u_t</text>
        <line x1={X(u)} x2={X(u)} y1={22} y2={70} stroke={TEXT} strokeWidth={3} />
        <text x={X(u)} y={114} textAnchor="middle" fill={TEXT} fontWeight={700}>your u</text>
      </svg>
      <Group gap={12} mt={4} wrap="wrap">
        {bands.map((b) => (
          <Group key={b.regime} gap={6} wrap="nowrap">
            <Box w={16} h={10} style={{ background: REGIME_COLOR[b.regime] }} />
            <Text size="xs">{b.regime}: {b.from > 0 ? fmtU(b.from) : "0"} to {Number.isFinite(b.to) ? fmtU(b.to) : "∞"}</Text>
          </Group>
        ))}
      </Group>
    </Box>
  );
}

// ---- the bubble, cloud, wake and emulsion -------------------------------------------------

function BubbleSchematic(): JSX.Element {
  return (
    <Box>
      <svg viewBox="0 0 320 230" width="100%" role="img" style={{ display: "block", maxWidth: 320, fontSize: 13 }}
        aria-label="a rising bubble with its cloud and wake in the emulsion">
        <rect x={4} y={4} width={312} height={222} fill="rgba(212, 165, 90, 0.18)" stroke={GRID} />
        {Array.from({ length: 90 }, (_, k) => (
          <circle key={k} cx={12 + ((Math.sin(k * 12.9898) * 43758.5453) % 1 + 1) % 1 * 296}
            cy={12 + ((Math.sin(k * 78.233) * 12345.6789) % 1 + 1) % 1 * 206} r={2} fill="rgba(140, 100, 40, 0.55)" />
        ))}
        <ellipse cx={130} cy={100} rx={70} ry={62} fill="rgba(42, 120, 214, 0.18)" stroke="#2a78d6" strokeDasharray="5 3" />
        <path d="M 80 112 A 50 50 0 0 1 180 112 Z" fill="var(--mantine-color-body)" stroke={TEXT} strokeWidth={1.5} />
        <path d="M 84 112 L 176 112 Q 130 150 84 112 Z" fill="rgba(140, 100, 40, 0.55)" />
        <text x={130} y={95} textAnchor="middle" fill={TEXT}>bubble</text>
        <text x={130} y={133} textAnchor="middle" fill={TEXT} fontSize={11}>wake</text>
        <text x={210} y={52} fill="#2a78d6">cloud</text>
        <text x={226} y={196} fill={TEXT}>emulsion</text>
        <path d="M 130 50 L 130 22" stroke={TEXT} strokeWidth={1.5} markerEnd="url(#bubble-arrow)" />
        <defs>
          <marker id="bubble-arrow" markerWidth={8} markerHeight={8} refX={4} refY={4} orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill={TEXT} />
          </marker>
        </defs>
      </svg>
      <Text size="xs" c="dimmed">
        A schematic of the picture, not to scale: the bubble is nearly free of particles; gas
        circulates through the cloud around it; the wake carries particles up behind it; the
        emulsion is the rest of the bed, at minimum fluidisation.
      </Text>
    </Box>
  );
}

// ---- the page ------------------------------------------------------------------------------

export function FluidisedBedsTool(): JSX.Element {
  const [pid, setPid] = useState<string>(PARTICLES[0]!.id);
  const [dS, setD] = useState<number | string>(PARTICLES[0]!.d_um);
  const [rhoPS, setRhoP] = useState<number | string>(PARTICLES[0]!.rhoP);
  const [epsS, setEps] = useState<number | string>(PARTICLES[0]!.eps);
  const [FS, setF] = useState<number | string>(PARTICLES[0]!.F);
  const [gasId, setGasId] = useState<string>("air");
  const [TS, setT] = useState<number | string>(20);
  const [PS, setP] = useState<number | string>(1.01325);
  const [muS, setMu] = useState<number | string>(18);   // µPa s
  const [LS, setL] = useState<number | string>(1);
  const [uS, setU] = useState<number | string>(0.2);

  const gasM = GASES.find((g) => g.id === gasId)?.M ?? 28.96;
  const gas: Gas = { rhoG: idealGasDensity(gasM, num(TS) + 273.15, num(PS) * 1e5), mu: num(muS) * 1e-6 };
  const p: Particle = { d: num(dS) * 1e-6, rhoP: num(rhoPS) };
  const eps = num(epsS), F = num(FS), Lmf = num(LS), u = num(uS);
  const refused = inputRefusal(p, gas, eps)
    ?? (!(num(TS) > -273.15) ? "the temperature must be above absolute zero"
      : !(num(PS) > 0) ? "the pressure must be positive"
        : !(Lmf > 0) ? "the bed height must be positive"
          : !(u > 0) ? "the operating velocity must be positive"
            : !(F >= 0 && F <= 1) ? "the fines fraction lies between 0 and 1" : null);
  const ok = refused === null;
  const key = `${p.d}|${p.rhoP}|${gas.rhoG}|${gas.mu}|${eps}|${F}|${Lmf}|${u}`;

  const mf = useMemo(() => (ok ? minimumFluidisation(p, gas, eps) : null), [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  const Ar = ok ? archimedes(p, gas) : NaN;
  const dpCurve = useMemo(() => {
    if (!mf) return null;
    const us = grid(0, 3 * mf.u, 160);
    return {
      line: us.map((x): XY => [x * 100, bedPressureDrop(x, p, gas, eps, Lmf, mf.u) / 1000]),
      ergun: us.map((x): XY => [x * 100, (Lmf * ergunGradient(x, p.d, eps, gas).total) / 1000]),
      weight: [[0, (Lmf * mf.weight) / 1000], [3 * mf.u * 100, (Lmf * mf.weight) / 1000]] as XY[],
    };
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  const ergunResidual = mf ? Math.abs(ergunGradient(mf.u, p.d, eps, gas).total - mf.weight) / mf.weight : NaN;

  const group = ok ? geldartGroup(p.d * 1e6, (p.rhoP - gas.rhoG) / 1000) : null;
  const regimes = useMemo(() => (ok ? regimeMap(p, gas, eps, F, u) : null), [key]);   // eslint-disable-line react-hooks/exhaustive-deps
  const term = useMemo(() => (ok ? terminalVelocity(p, gas) : null), [key]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---- step 4 ----
  const [DtS, setDt] = useState<number | string>(1);
  const [orS, setOr] = useState<number | string>(1000);
  const [DgS, setDg] = useState<number | string>(0.2);   // cm2/s
  const bIn: BubbleInput | null = mf && num(DtS) > 0 && num(orS) > 0 && num(DgS) > 0
    ? { u, umf: mf.u, epsMf: eps, Lmf, Dt: num(DtS), orificesPerM2: num(orS), Dg: num(DgS) * 1e-4, d: p.d }
    : null;
  const bub = useMemo(() => {
    if (!bIn || !(u > bIn.umf)) return null;
    const grow = bubbleBed(bIn, true)!, frozen = bubbleBed(bIn, false)!;
    const us = grid(1.2 * bIn.umf, Math.max(6 * bIn.umf, 1.5 * u), 30);
    const sweep = us.map((x) => ({ u: x, grow: bubbleBed({ ...bIn, u: x }, true, 200)!, frozen: bubbleBed({ ...bIn, u: x }, false, 200)! }));
    return { grow, frozen, sweep, outside: moriWenOutside(bIn) };
  }, [key, bIn?.Dt, bIn?.orificesPerM2, bIn?.Dg]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ---- step 5 ----
  const [classText, setClassText] = useState<string>(DEFAULT_CLASSES.map((c) => `${c.d_um} ${c.massPct}`).join("\n"));
  const parsed = parseClasses(classText);
  const elu = ok && !parsed.refused ? elutriationTable(parsed.classes, p.rhoP, gas, u) : null;
  const dCut = ok ? cutDiameter(p.rhoP, gas, u) : NaN;

  // ---- the exercise ----
  const [shown, setShown] = useState<readonly boolean[]>([false, false, false]);
  const reveal = (k: number): void => setShown((s) => s.map((x, i) => (i === k ? true : x)));
  const ex = useMemo(() => {
    if (!ok || !mf) return null;
    const umfAt = (d: number, g: Gas = gas): number => minimumFluidisation({ d, rhoP: p.rhoP }, g, eps).u;
    const g10: Gas = { rhoG: gas.rhoG * 10, mu: gas.mu };
    return {
      doubling: [p.d, 60e-6, 3e-3].map((d) => ({ d, ratio: umfAt(2 * d) / umfAt(d) })),
      dp: [1.01, 2, 4].map((m) => ({ m, dp: bedPressureDrop(m * mf.u, p, gas, eps, Lmf, mf.u) })),
      pressure: [p.d, 60e-6, 1e-3].map((d) => ({ d, ratio: umfAt(d, g10) / umfAt(d) })),
    };
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (id: string): void => {
    const x = PARTICLES.find((q) => q.id === id);
    setPid(id);
    if (x) { setD(x.d_um); setRhoP(x.rhoP); setEps(x.eps); setF(x.F); }
  };

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto", minWidth: 0 }}>
        <Box>
          <Title order={3}>Fluidised beds: when a bed lifts, and what the gas does then</Title>
          <Text size="sm" c="dimmed" mt={4}>
            You have a bed of particles and a gas.  At what velocity does the bed fluidise, what
            regime will it be in, how much does it expand, and how much gas bypasses the
            particles?  Choose the particles, the gas and the bed below; each step answers one
            part of the question on them.
          </Text>
        </Box>

        <Alert color="gray" variant="light" title="Choupo's engine has no fluidised-bed model">
          <Text size="sm">
            No unit operation in the engine computes a minimum fluidisation velocity, a bed
            expansion or a bubble.  Every number on this page is computed by the page in your
            browser, from the formulas written on it.  Two of them are written in the same form as
            the engine&apos;s: Ergun&apos;s pressure drop (the plug-flow reactor&apos;s packed bed) and a
            particle&apos;s terminal velocity (the pneumatic conveyor).  The design record proposes
            what an engine unit would need.
          </Text>
        </Alert>

        <Panel title="the particles, the gas and the bed" origin="assumption"
          originNote="example particles with this page's own illustrative numbers, a gas whose density is the ideal-gas law and whose viscosity you type, and your bed">
          <Select label="particles" allowDeselect={false} value={pid} onChange={(v) => { if (v) choose(v); }}
            data={[...PARTICLES.map((x) => ({ value: x.id, label: x.label })), { value: "own", label: "Your own (edit the numbers)" }]} />
          <Group gap="sm" align="flex-end" wrap="wrap">
            <NumberInput label="d_p, µm" value={dS} onChange={(v) => { setD(v); setPid("own"); }} min={0} w={110} />
            <NumberInput label="ρ_p, kg/m³" value={rhoPS} onChange={(v) => { setRhoP(v); setPid("own"); }} min={0} w={120} />
            <NumberInput label="ε_mf" value={epsS} onChange={(v) => { setEps(v); setPid("own"); }} min={0} max={1} step={0.01} decimalScale={3} w={100} />
            <NumberInput label="fines < 45 µm, F" value={FS} onChange={(v) => { setF(v); setPid("own"); }} min={0} max={1} step={0.05} decimalScale={3} w={140} />
          </Group>
          <Group gap="sm" align="flex-end" wrap="wrap">
            <Select label="gas" allowDeselect={false} value={gasId} onChange={(v) => { if (v) setGasId(v); }} w={250}
              data={GASES.map((g) => ({ value: g.id, label: g.label }))} />
            <NumberInput label="T, °C" value={TS} onChange={setT} w={90} />
            <NumberInput label="P, bar" value={PS} onChange={setP} min={0} decimalScale={4} w={100} />
            <NumberInput label="μ, µPa s" value={muS} onChange={setMu} min={0} decimalScale={3} w={110} />
          </Group>
          <Group gap="sm" align="flex-end" wrap="wrap">
            <NumberInput label="L_mf, bed height, m" value={LS} onChange={setL} min={0} decimalScale={3} w={160} />
            <NumberInput label="u, operating velocity, m/s" value={uS} onChange={setU} min={0} decimalScale={4} step={0.01} w={200} />
          </Group>
          <Text size="xs" c="dimmed">
            The gas density is computed by the page from the ideal-gas law: ρ_g = P M/(R T) ={" "}
            {fmt(gas.rhoG)} kg/m³.  The viscosity is yours to type (18 µPa s is a typical value for
            air near room temperature, an assumption, not a measurement); the engine&apos;s property
            package is not called.  The particle numbers are illustrative, chosen for this page.
          </Text>
          {refused && (
            <Alert color="red" variant="light" title="Refused">
              <Text size="sm">{refused}</Text>
            </Alert>
          )}
        </Panel>

        {step(1)}

        {mf && dpCurve && (
          <Panel title="pressure drop against gas velocity" origin="page"
            originNote="Ergun's gradient, the weight line, the bisection and Wen and Yu's correlation, all by this page">
            <Text size="sm">
              Ar = {fmt(Ar)}.  Ergun meets the weight line at <b>u_mf = {fmtU(mf.u)}</b>{" "}
              (Re_mf = {fmt(mf.re, 3)}), found by bisection in {mf.iterations} halvings of the bracket
              [0, {fmt(mf.bracket[1])}] m/s; the quadratic formula gives {fmt(mf.uClosed, 10)} m/s
              against {fmt(mf.u, 10)}, and at the root Ergun&apos;s gradient equals the weight line to a
              relative {fmt(ergunResidual, 2)}.  The bed then carries ΔP = (1 − ε_mf)(ρ_p − ρ_g) g L_mf
              = <b>{fmt((mf.weight * Lmf) / 1000)} kPa</b>, whatever the velocity.
            </Text>
            <Text size="sm">
              Wen and Yu&apos;s correlation gives <b>{fmtU(mf.wenYu.u)}</b> (Re_mf = {fmt(mf.wenYu.re, 3)}):{" "}
              {mf.diffPct >= 0 ? "+" : ""}{fmt(mf.diffPct, 3)} % from Ergun at your ε_mf = {fmt(eps, 3)}.
              The correlation&apos;s C₂ alone is Ergun at ε_mf = 0.415 for a sphere; move ε_mf towards
              0.415 and watch the gap change.
            </Text>
            <XYPlot ariaLabel="bed pressure drop against superficial velocity"
              xLabel="u, cm/s" yLabel="ΔP, kPa"
              series={[
                { name: "Ergun through the packed bed (continued past u_mf)", color: ERGUN, dash: "6 4", line: dpCurve.ergun },
                { name: "weight line (1 − ε_mf)(ρp − ρg) g L_mf", color: WEIGHT, dash: "2 3", line: dpCurve.weight },
                { name: "the bed's pressure drop", color: TEXT, line: dpCurve.line },
                { name: "u_mf (Ergun = weight)", color: ANSWER, points: [[mf.u * 100, (mf.weight * Lmf) / 1000]] },
                { name: "u_mf by Wen-Yu", color: WENYU, points: [[mf.wenYu.u * 100, (mf.weight * Lmf) / 1000]] },
              ]} />
            <Text size="xs" c="dimmed">
              Below u_mf the bed is packed at ε_mf; above it, the pressure drop is the weight per area
              and does not change with velocity.  A real bed shows a small overshoot at u_mf on the
              way up (the particles must first be unlocked) and a lower curve on the way down; the
              page draws neither.
            </Text>
          </Panel>
        )}

        {step(2)}

        {ok && group && (
          <Panel title="Geldart's group of your powder" origin={["page", "assumption"]}
            originNote="the classification by this page; the boundary lines are this page's own straight-line approximation of Geldart's 1973 map, not the map">
            <Text size="sm">
              d_p = {fmt(p.d * 1e6, 3)} µm and ρ_p − ρ_g = {fmt((p.rhoP - gas.rhoG) / 1000)} g/cm³:{" "}
              <b>group {group}</b>.  {GELDART_SAYS[group]}
            </Text>
            <GeldartMap d_um={p.d * 1e6} drho={(p.rhoP - gas.rhoG) / 1000} />
            <Stack gap={4}>
              {(["C", "A", "B", "D"] as const).map((g) => (
                <Text key={g} size="xs"><b style={{ color: GROUP_COLOR[g] }}>{g}</b> {GELDART_SAYS[g]}</Text>
              ))}
            </Stack>
          </Panel>
        )}

        {step(3)}

        {regimes && term && mf && group && (
          <Panel title="the velocities that bound the regimes" origin="page"
            originNote="the bisection on the drag balance, the onset correlations (Abrahamsen-Geldart, Bi-Grace) and the regime map, all evaluated by this page">
            <Wide>
              <Table fz="xs" striped withTableBorder style={{ minWidth: 340 }}>
                <Table.Thead><Table.Tr><Table.Th>velocity</Table.Th><Table.Th>value</Table.Th><Table.Th>how</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>
                  <Table.Tr><Table.Td>u_mf</Table.Td><Table.Td>{fmtU(regimes.umf)}</Table.Td><Table.Td>Ergun = weight (step 1)</Table.Td></Table.Tr>
                  <Table.Tr><Table.Td>u_mb</Table.Td><Table.Td>{fmtU(regimes.umb)}</Table.Td>
                    <Table.Td>{group === "A" ? `Abrahamsen-Geldart, F = ${fmt(F, 3)} (empirical)` : `= u_mf: a group ${group} powder bubbles as it fluidises`}</Table.Td></Table.Tr>
                  <Table.Tr><Table.Td>u_c</Table.Td><Table.Td>{fmtU(regimes.uc)}</Table.Td><Table.Td>Bi-Grace, Re_c = 1.24 Ar^0.45</Table.Td></Table.Tr>
                  <Table.Tr><Table.Td>u_se</Table.Td><Table.Td>{fmtU(regimes.use)}</Table.Td><Table.Td>Bi-Grace, Re_se = 1.53 Ar^0.5</Table.Td></Table.Tr>
                  <Table.Tr><Table.Td>u_t</Table.Td><Table.Td>{fmtU(term.u)}</Table.Td>
                    <Table.Td>drag balance, Re_t = {fmt(term.Re, 3)}, C_D = {fmt(term.Cd, 3)}, {term.regime} regime</Table.Td></Table.Tr>
                  <Table.Tr><Table.Td>u (yours)</Table.Td><Table.Td>{fmtU(u)}</Table.Td><Table.Td>u/u_mf = {fmt(regimes.ratio, 3)}</Table.Td></Table.Tr>
                </Table.Tbody>
              </Table>
            </Wide>
            <Text size="sm">
              At your velocity the bed is <b>{regimes.at}</b>, at {fmt(regimes.ratio, 3)} times u_mf.
              The terminal velocity was found by bisection on Re in {term.iterations} halvings; drag
              and net weight agree there to a relative {fmt(term.balanceResidual, 2)}.  Stokes&apos; law
              alone would give {fmtU(term.uStokes)}
              {term.regime === "Stokes" ? ", close, because the particle is in the Stokes regime." : `, ${fmt(term.uStokes / term.u, 3)} times too fast, because Re_t is outside the Stokes regime.`}
              {u > term.u ? "  Your velocity is above u_t: particles of this size are carried out of the bed." : ""}
            </Text>
            {!regimes.biGraceInRange && (
              <Alert color="yellow" variant="light" title="Outside the range the page takes for Bi and Grace">
                <Text size="sm">Ar = {fmt(Ar)} is outside 2 to 10⁸: u_c and u_se are extrapolations (flagged, not clipped).</Text>
              </Alert>
            )}
            {term.regime === "beyond Newton" && (
              <Alert color="yellow" variant="light" title="Beyond the drag law's range">
                <Text size="sm">Re_t = {fmt(term.Re)} is above 2×10⁵, where the drag crisis begins; the terminal velocity is not reliable.</Text>
              </Alert>
            )}
            <RegimeAxis bands={regimes.bands} u={u} ut={term.u} />
            <Text size="xs" c="dimmed">
              Above u_se the bed is in fast fluidisation or pneumatic transport; which of the two
              depends on the rate at which solids are returned to the bottom, which the page does not
              take.  The boundaries are correlations with scatter, not lines a bed obeys.
            </Text>
          </Panel>
        )}

        {step(4)}

        {mf && (
          <Panel title="bubbles, expansion and bypass" origin={["page", "assumption"]}
            originNote="the two-phase bed, Mori-Wen bubble size and Kunii-Levenspiel exchange integrated by this page; the bed diameter, the distributor and the gas diffusivity are your assumptions">
            <Group gap="sm" align="flex-end" wrap="wrap">
              <NumberInput label="D_t, bed diameter, m" value={DtS} onChange={setDt} min={0} decimalScale={3} w={160} />
              <NumberInput label="orifices per m²" value={orS} onChange={setOr} min={0} w={130} />
              <NumberInput label="D, gas diffusivity, cm²/s" value={DgS} onChange={setDg} min={0} decimalScale={4} w={190} />
            </Group>
            {!bIn ? (
              <Alert color="red" variant="light" title="Refused">
                <Text size="sm">the bed diameter, the orifice count and the diffusivity must be positive</Text>
              </Alert>
            ) : !bub ? (
              <Alert color="gray" variant="light" title="No bubbles">
                <Text size="sm">
                  Your velocity {fmtU(u)} is not above u_mf = {fmtU(mf.u)}: the bed is fixed, it does not
                  expand and no gas bypasses.  Raise u to see the bubbles.
                </Text>
              </Alert>
            ) : (
              <>
                <Text size="sm">
                  A share (u − u_mf)/u = <b>{fmt(100 * bub.grow.bubbleGasFraction, 3)} %</b> of the gas
                  enters as bubbles.  They grow from {fmt(bub.grow.profile[0]!.db * 100, 3)} cm at the
                  distributor to {fmt(bub.grow.profile[bub.grow.profile.length - 1]!.db * 100, 3)} cm at the
                  top of the bed; they occupy on average a fraction {fmt(bub.grow.deltaMean, 3)} of it, so the
                  bed expands from {fmt(Lmf, 3)} m to <b>H = {fmt(bub.grow.H, 4)} m</b>{" "}
                  (H/L_mf = {fmt(bub.grow.expansion, 4)}, {bub.grow.iterations} fixed-point passes).
                </Text>
                <Wide>
                  <Table fz="xs" striped withTableBorder style={{ minWidth: 360 }}>
                    <Table.Thead><Table.Tr>
                      <Table.Th>bubbles</Table.Th><Table.Th>H, m</Table.Th><Table.Th>renewals ∫K_bc/u_b dh</Table.Th>
                      <Table.Th>bypass ψ</Table.Th>
                    </Table.Tr></Table.Thead>
                    <Table.Tbody>
                      {([["growing (Mori-Wen)", bub.grow], ["frozen at the distributor size", bub.frozen]] as const).map(([nm, b]) => (
                        <Table.Tr key={nm}>
                          <Table.Td>{nm}</Table.Td><Table.Td>{fmt(b.H, 4)}</Table.Td>
                          <Table.Td>{fmt(-Math.log(b.unexchanged), 4)}</Table.Td>
                          <Table.Td>{fmt(100 * b.bypass, 3)} %</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Wide>
                <Text size="sm">
                  Growing bubbles renew their gas {fmt(-Math.log(bub.grow.unexchanged), 3)} times on the way
                  up, against {fmt(-Math.log(bub.frozen.unexchanged), 3)} if they stayed at their initial
                  size: growth lets <b>{fmt(100 * bub.grow.bypass, 3)} %</b> of all the gas through
                  untouched instead of {fmt(100 * bub.frozen.bypass, 3)} %.  A catalyst in this bed would
                  convert less than the same catalyst in a plug-flow packed bed, because that share of the
                  gas never meets it.
                </Text>
                {bub.outside.length > 0 && (
                  <Alert color="yellow" variant="light" title="Outside the range the page knows for Mori and Wen">
                    <Text size="sm">{bub.outside.join("; ")}.  The bubble sizes are extrapolated (flagged, not clipped).</Text>
                  </Alert>
                )}
                <XYPlot ariaLabel="bubble diameter against height in the bed"
                  xLabel="h, height above the distributor, m" yLabel="d_b, cm"
                  series={[
                    { name: "growing (Mori-Wen)", color: ERGUN, line: bub.grow.profile.map((q): XY => [q.h, q.db * 100]) },
                    { name: "frozen at the distributor size", color: INK, dash: "6 4", line: bub.frozen.profile.map((q): XY => [q.h, q.db * 100]) },
                  ]} />
                <XYPlot ariaLabel="times the bubble gas is renewed on its way up, against the gas velocity"
                  xLabel="u/u_mf" yLabel="renewals ∫K_bc/u_b dh"
                  series={[
                    { name: "growing bubbles", color: ERGUN, line: bub.sweep.map((s): XY => [s.u / mf.u, -Math.log(s.grow.unexchanged)]) },
                    { name: "frozen bubbles", color: INK, dash: "6 4", line: bub.sweep.map((s): XY => [s.u / mf.u, -Math.log(s.frozen.unexchanged)]) },
                    { name: "your u", color: ANSWER, points: [[u / mf.u, -Math.log(bub.grow.unexchanged)]] },
                  ]} />
                <Text size="xs" c="dimmed">
                  The bypassed share is ψ = ((u − u_mf)/u) e^(−renewals): every renewal fewer
                  multiplies it by e = 2.72.  Growing bubbles are renewed a few times; frozen small
                  bubbles tens of times, which leaves essentially no gas untouched.
                </Text>
                <Text size="xs" c="dimmed">
                  The cloud is counted as contact with the emulsion, the emulsion is held at minimum
                  fluidisation, and every constant of the bubble correlations is unchecked against its
                  source (design record).  At this velocity the cloud around the top bubble is
                  {bub.grow.profile[bub.grow.profile.length - 1]!.cloudRatio === Infinity
                    ? " absent: the bubble rises slower than the emulsion gas, which flows through it."
                    : ` ${fmt(bub.grow.profile[bub.grow.profile.length - 1]!.cloudRatio, 3)} times the bubble's volume (Davidson's ratio).`}
                </Text>
              </>
            )}
            <BubbleSchematic />
          </Panel>
        )}

        {step(5)}

        {ok && (
          <Panel title="which size classes the gas can carry out" origin={["page", "assumption"]}
            originNote="the terminal velocity of each class by this page (the drag balance of step 3); the size distribution is yours">
            <Textarea label="size classes: diameter in µm and mass %, one per line" value={classText}
              onChange={(e) => setClassText(e.currentTarget.value)} minRows={5} autosize maxRows={12} />
            {parsed.refused ? (
              <Alert color="red" variant="light" title="Refused">
                <Text size="sm">{parsed.refused}</Text>
              </Alert>
            ) : elu && (
              <>
                <Wide>
                  <Table fz="xs" striped withTableBorder style={{ minWidth: 340 }}>
                    <Table.Thead><Table.Tr>
                      <Table.Th>d, µm</Table.Th><Table.Th>mass %</Table.Th><Table.Th>u_t</Table.Th><Table.Th>Re_t</Table.Th><Table.Th>at your u</Table.Th>
                    </Table.Tr></Table.Thead>
                    <Table.Tbody>
                      {elu.rows.map((r) => (
                        <Table.Tr key={`${r.d_um}-${r.massPct}`}>
                          <Table.Td>{fmt(r.d_um, 4)}</Table.Td><Table.Td>{fmt(r.massPct, 3)}</Table.Td>
                          <Table.Td>{fmtU(r.ut)}</Table.Td><Table.Td>{fmt(r.Re, 3)}</Table.Td>
                          <Table.Td>{r.leaves ? <b>carried out</b> : "stays"}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Wide>
                <Text size="sm">
                  At u = {fmtU(u)} the cut diameter (u_t = u) is <b>{fmt(dCut * 1e6, 4)} µm</b>: the classes
                  below it, <b>{fmt(elu.leavingPct, 3)} %</b> of the {fmt(elu.totalPct, 4)} % you typed, can
                  leave the bed.  They go to a cyclone that returns them; the engine&apos;s{" "}
                  <code>cyclone</code> unit computes what it catches (tutorial{" "}
                  <code>cyclone01_dust_removal</code>).  The page gives no elutriation rate.
                </Text>
              </>
            )}
          </Panel>
        )}

        {step(6)}

        <LessonLimits limits={FLUID_LIMITS} />

        {ex && (
          <Panel title="an exercise: three statements to refute" origin="page"
            originNote="each check is this page's own arithmetic on your gas, particle density and voidage">
            <Text size="sm">
              Each statement below is one a student might write in a report.  Decide whether it is
              true, then press the button and see what the page computes.
            </Text>
            <Stack gap={10}>
              <Box>
                <Text size="sm" fw={600}>1. &quot;Doubling the particle diameter halves u_mf.&quot;</Text>
                {shown[0] ? (
                  <Text size="sm">
                    u_mf(2d)/u_mf(d): {ex.doubling.map((x) => `${fmt(x.d * 1e6, 3)} µm → ×${fmt(x.ratio, 3)}`).join("; ")}.
                    It RISES: near ×4 for fine particles, where the viscous term of Ergun dominates
                    (u_mf grows as d²), towards ×√2 = 1.41 for coarse ones, where the inertial term does
                    (u_mf grows as d^½).
                  </Text>
                ) : <Button size="xs" variant="light" onClick={() => reveal(0)}>Check with the page</Button>}
              </Box>
              <Box>
                <Text size="sm" fw={600}>2. &quot;Once the bed is fluidised, blowing harder raises the pressure drop across it.&quot;</Text>
                {shown[1] ? (
                  <Text size="sm">
                    ΔP at {ex.dp.map((x) => `${fmt(x.m, 3)} u_mf: ${fmt(x.dp / 1000, 6)} kPa`).join("; ")}.
                    Unchanged: above u_mf the gas carries the bed&apos;s weight per area and nothing more;
                    the extra gas goes into bubbles.  (A real bed adds the distributor&apos;s drop and a
                    little wall friction, which this page does not model.)
                  </Text>
                ) : <Button size="xs" variant="light" onClick={() => reveal(1)}>Check with the page</Button>}
              </Box>
              <Box>
                <Text size="sm" fw={600}>3. &quot;Running the bed at ten times the pressure does not change u_mf.&quot;</Text>
                {shown[2] ? (
                  <Text size="sm">
                    u_mf at ten times the gas density over u_mf now: {ex.pressure.map((x) => `${fmt(x.d * 1e6, 3)} µm → ×${fmt(x.ratio, 3)}`).join("; ")}.
                    Nearly true for fine powders (the viscous term does not see the gas density, and the
                    viscosity of a gas barely moves with pressure) and false for coarse ones, where u_mf
                    falls roughly as 1/√ρ_g.
                  </Text>
                ) : <Button size="xs" variant="light" onClick={() => reveal(2)}>Check with the page</Button>}
              </Box>
            </Stack>
          </Panel>
        )}

        <LessonReferences tool="fluidised-beds" />
      </Stack>
    </Box>
  );
}
