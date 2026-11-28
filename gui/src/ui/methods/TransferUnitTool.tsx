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
  TransferUnitTool -- the EduTool `transfer-unit`, "Why the transfer unit was
  invented" (DEV.md 4c C222).

  The student's task, in one sentence: "My packed tower is too tall or too
  short: how much of its height is the separation's fault and how much is
  the packing's, and how does that connect to the stages I counted on the
  McCabe-Thiele diagram?"

  TWO HALVES, said on the page.  The PAGE half (steps 1-4) is arithmetic done
  here, in transferUnitMath.ts: Z = H_OG N_OG, Colburn's closed form with its
  true pole at A = R, and HETP = H_OG ln(lambda)/(lambda - 1) derived from
  the Kremser count; a test holds the closed form to a numerical integral of
  the definition and the HETP relation to the engine's own source line.
  The ENGINE half (step 5) runs one shipped case behind a button and reads
  what it published: the per-segment H_OG, m, V and L of the rate-based bed
  `ratebased01_schulz_0p10bar`, and its KPIs.  The two sums the page does on
  them (N_OG = sum dz/H_OG, the HETP from H_OG and lambda) are labelled as
  the page's.  Nothing is typed in from a book.

  THE PLOT IS INLINE SVG (the Bode precedent): plotly cannot load under the
  node test environment, and transferUnitMath must stay importable by it.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import { Alert, Box, Button, Group, Stack, Table, Text, Title } from "@mantine/core";

import { useMethodRun } from "../../case/methodRun.js";
import { KnobSlider, type PanelKnob } from "./knobPanel.js";
import { LessonLimits, lessonStepper, LessonReferences } from "./lessonStep.js";
import { LessonQuiz } from "./lessonQuiz.js";
import { OriginMark } from "./origin.js";
import {
  TRANSFER_UNIT_LIMITS, TRANSFER_UNIT_QUIZ, TRANSFER_UNIT_STEPS,
} from "./transferUnitLesson.js";
import {
  colburnNOG, hetpFromHog, impliedLambda, kremserStages, nogCurve, summariseBed,
} from "./transferUnitMath.js";

export const TRANSFER_UNIT_WITNESS = "ratebased01_schulz_0p10bar";

const R_KNOB: PanelKnob = {
  id: "R", label: "Recovery \\(R\\)", min: 0.5, max: 0.999, step: 0.001,
  why: "The fraction of the entering solute that the tower must absorb.  "
    + "This and \\(A\\) are all that \\(N_{OG}\\) depends on.",
};
const A_KNOB: PanelKnob = {
  id: "A", label: "Absorption factor \\(A = L/(mG)\\)", min: 0.3, max: 3, step: 0.01,
  why: "Liquid rate over the equilibrium slope.  Below \\(R\\) no height works.",
};
const H_KNOB: PanelKnob = {
  id: "H", label: "Packing quality \\(H_{OG}\\)", min: 0.1, max: 1.5, step: 0.01, unit: "m",
  why: "The equipment's half: the height of one transfer unit.",
};

const INK = "var(--mantine-color-dimmed)";
const GRID = "var(--mantine-color-default-border)";
const CURVE = "#26c6da";
const MARK = "#ffb74d";

function fmt(x: number | null, d = 3): string {
  return x === null || !Number.isFinite(x) ? "n/a" : x.toFixed(d);
}

/** N_OG against A at the chosen recovery; the pole at A = R and the A = 1
 *  line are drawn, and the current point is marked. */
export function NogPlot({ R, A }: { R: number; A: number }): JSX.Element {
  const W = 560, Hh = 260, L = 46, B = 34, T = 12, Rm = 14;
  const aMin = 0.3, aMax = 3;
  const pts = nogCurve(R, aMin, aMax, 600);
  const cap = 60;
  const nMax = cap;
  const x = (a: number) => L + (a - aMin) / (aMax - aMin) * (W - L - Rm);
  const y = (n: number) => Hh - B - Math.min(n, nMax) / nMax * (Hh - B - T);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(p.A).toFixed(1)},${y(p.N).toFixed(1)}`).join(" ");
  const here = colburnNOG(R, A);
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} width="100%" role="img" data-plot="nog-vs-A"
      aria-label="N_OG against the absorption factor at the chosen recovery">
      <rect x={L} y={T} width={W - L - Rm} height={Hh - B - T} fill="none" stroke={GRID} />
      {[0, 20, 40, 60].map((n) => (
        <g key={n}>
          <line x1={L} x2={W - Rm} y1={y(n)} y2={y(n)} stroke={GRID} strokeDasharray="2 4" />
          <text x={L - 6} y={y(n) + 4} fontSize="10" textAnchor="end" fill={INK}>{n}</text>
        </g>
      ))}
      {[0.5, 1, 1.5, 2, 2.5, 3].map((a) => (
        <text key={a} x={x(a)} y={Hh - B + 14} fontSize="10" textAnchor="middle" fill={INK}>{a}</text>
      ))}
      <text x={(L + W - Rm) / 2} y={Hh - 4} fontSize="11" textAnchor="middle" fill={INK}>
        absorption factor A = L/(mG)
      </text>
      <text x={12} y={(T + Hh - B) / 2} fontSize="11" textAnchor="middle" fill={INK}
        transform={`rotate(-90 12 ${(T + Hh - B) / 2})`}>N_OG (capped at 60)</text>
      <line x1={x(R)} x2={x(R)} y1={T} y2={Hh - B} stroke={MARK} strokeDasharray="5 3" />
      <text x={x(R) + 4} y={T + 12} fontSize="10" fill={MARK}>A = R: the pole</text>
      <line x1={x(1)} x2={x(1)} y1={T} y2={Hh - B} stroke={GRID} />
      <text x={x(1) + 4} y={T + 24} fontSize="10" fill={INK}>A = 1</text>
      <path d={path} fill="none" stroke={CURVE} strokeWidth={2} />
      {here !== null && (
        <circle cx={x(A)} cy={y(here)} r={5} fill={MARK} stroke="#000" strokeWidth={0.5} />
      )}
    </svg>
  );
}

/** The two bars of Z = H_OG N_OG as a rectangle: width N_OG, height H_OG. */
function ProductBar({ N, H }: { N: number | null; H: number }): JSX.Element {
  const Z = N === null ? null : N * H;
  return (
    <Group gap="lg" align="baseline" data-product="">
      <Text size="sm">N<sub>OG</sub> = <b>{fmt(N, 2)}</b></Text>
      <Text size="sm">× H<sub>OG</sub> = <b>{fmt(H, 2)} m</b></Text>
      <Text size="sm">= Z = <b>{Z === null ? "no tower is tall enough" : `${fmt(Z, 2)} m`}</b></Text>
    </Group>
  );
}

/** What the engine published for the witness, as the panel shows it. */
export interface PublishedBed {
  unit: string;
  z: number[]; HOG: number[]; m: number[]; V: number[]; L: number[];
  HETP: number | null; Nt: number | null;
}

/** Pick the bed out of a run: the profile that carries an `HOG` column, and
 *  the KPIs of the unit of the same name. */
export function publishedBed(
  profiles: readonly { unit: string; columns: { [k: string]: number[] } }[] | undefined,
  kpis: { [unit: string]: { [key: string]: number } } | undefined,
): PublishedBed | null {
  const p = profiles?.find((q) => q.columns["HOG"] && q.columns["z"] && q.columns["m"]
    && q.columns["V"] && q.columns["L"]);
  if (!p) return null;
  const k = kpis?.[p.unit];
  return {
    unit: p.unit, z: p.columns["z"] ?? [], HOG: p.columns["HOG"] ?? [], m: p.columns["m"] ?? [],
    V: p.columns["V"] ?? [], L: p.columns["L"] ?? [],
    HETP: k?.["HETP"] ?? null, Nt: k?.["theoreticalStages_bed"] ?? null,
  };
}

export function BedPanel({ bed }: { bed: PublishedBed }): JSX.Element {
  const s = summariseBed(bed.z, bed.HOG, bed.m, bed.V, bed.L);
  if (!s) return <Text size="sm" c="red">The published profile is not a uniform bed.</Text>;
  const ratio = bed.HETP !== null ? bed.HETP / s.HOGmean : null;
  const lam = ratio !== null ? impliedLambda(ratio) : null;
  return (
    <Box data-bed-panel="">
      <Table withTableBorder withColumnBorders fz="sm" maw={620}>
        <Table.Tbody>
          <Table.Tr><Table.Td>packed height Z (segments × dz)</Table.Td>
            <Table.Td>{fmt(s.height, 3)} m</Table.Td><Table.Td><OriginMark of="page" /></Table.Td></Table.Tr>
          <Table.Tr><Table.Td>mean H<sub>OG</sub> over {s.segments} segments</Table.Td>
            <Table.Td>{fmt(s.HOGmean, 4)} m</Table.Td><Table.Td><OriginMark of="engine" note="the HOG column" /></Table.Td></Table.Tr>
          <Table.Tr><Table.Td>N<sub>OG</sub> = Σ dz / H<sub>OG</sub></Table.Td>
            <Table.Td>{fmt(s.NOG, 3)}</Table.Td><Table.Td><OriginMark of="page" note="a sum over published H_OG" /></Table.Td></Table.Tr>
          <Table.Tr><Table.Td>mean λ = m V / L</Table.Td>
            <Table.Td>{fmt(s.lambdaMean, 3)}</Table.Td><Table.Td><OriginMark of="engine" note="m, V, L columns" /></Table.Td></Table.Tr>
          <Table.Tr><Table.Td>HETP from H<sub>OG</sub> and λ, segment by segment (mean)</Table.Td>
            <Table.Td>{fmt(s.hetpFromSegments, 4)} m</Table.Td><Table.Td><OriginMark of="page" /></Table.Td></Table.Tr>
          <Table.Tr><Table.Td>HETP the engine published (KPI)</Table.Td>
            <Table.Td>{fmt(bed.HETP, 4)} m</Table.Td><Table.Td><OriginMark of="engine" note="KPI HETP" /></Table.Td></Table.Tr>
          <Table.Tr><Table.Td>theoretical stages in the bed (KPI)</Table.Td>
            <Table.Td>{fmt(bed.Nt, 3)}</Table.Td><Table.Td><OriginMark of="engine" note="KPI theoreticalStages_bed" /></Table.Td></Table.Tr>
          <Table.Tr><Table.Td>N<sub>OG</sub> / N<sub>t</sub></Table.Td>
            <Table.Td>{bed.Nt ? fmt(s.NOG / bed.Nt, 3) : "n/a"}</Table.Td><Table.Td><OriginMark of="page" /></Table.Td></Table.Tr>
          <Table.Tr><Table.Td>λ implied by HETP / mean H<sub>OG</sub></Table.Td>
            <Table.Td>{fmt(lam, 3)}</Table.Td><Table.Td><OriginMark of="page" note="inverts HETP = H_OG ln λ/(λ-1)" /></Table.Td></Table.Tr>
        </Table.Tbody>
      </Table>
      <Text size="xs" c="dimmed" mt={4}>
        Z / N<sub>OG</sub> is the harmonic-mean H<sub>OG</sub>, and Z / N<sub>t</sub> is the
        HETP of the test report; they differ here because the lines of a distillation
        at total reflux are not straight.
      </Text>
    </Box>
  );
}

export function TransferUnitTool(): JSX.Element {
  const [R, setR] = useState(0.95);
  const [A, setA] = useState(1.4);
  const [H, setH] = useState(0.6);
  const [go, setGo] = useState(false);
  const run = useMethodRun(go ? TRANSFER_UNIT_WITNESS : null, [], "", "choupoSolve");
  const step = useMemo(() => lessonStepper(TRANSFER_UNIT_STEPS), []);
  const N = colburnNOG(R, A);
  const Nt = kremserStages(R, A);
  const hetp = hetpFromHog(H, 1 / A);
  const bed = go && run.result ? publishedBed(run.result.profiles, run.result.kpis) : null;
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 1040, margin: "0 auto" }}>
        <Box>
          <Title order={4}>The transfer unit, in short</Title>
          <Text size="sm" c="dimmed" mt={4}>
            A packed tower's height is a product of two numbers that answer two different
            questions: how hard the separation is, and how good the packing is. Move the
            sliders to see each one on its own, then see Choupo's own packed bed publish both.
          </Text>
          <Alert mt="sm" color="yellow" variant="light" title="Two halves, not one" data-halves="">
            Steps 1 to 4 are arithmetic done on this page (a dilute absorber with straight
            lines), held by a test to a numerical integral of the definition. Step 5 runs a
            Choupo case in your browser and reads what it published.
          </Alert>
        </Box>

        {step(1)}
        <Box data-demo="difficulty-times-quality">
          <OriginMark of={["page", "reference"]} note="Colburn's equation, Treybal Eq. 8.50" />
          <Stack gap="xs" mt="xs" maw={620}>
            <KnobSlider knob={R_KNOB} value={R} onChange={setR} showWhy />
            <KnobSlider knob={A_KNOB} value={A} onChange={setA} showWhy />
            <KnobSlider knob={H_KNOB} value={H} onChange={setH} showWhy />
          </Stack>
          <ProductBar N={N} H={H} />
          <NogPlot R={R} A={A} />
          <Text size="xs" c="dimmed">
            Dashed line: the pole at A = R = {fmt(R, 3)}. At A = 1 the number is
            R/(1 − R) = {fmt(R / (1 - R), 1)}. Move H<sub>OG</sub> and only the equipment
            half moves; move R or A and only the separation half does.
          </Text>
        </Box>
        {step(2)}
        {step(3)}
        {step(4)}
        <Box data-demo="hetp" maw={620}>
          <OriginMark of="page" note="derived on the page from Eq. 8.50 and the Kremser count" />
          <Text size="sm" mt="xs">
            At these sliders: λ = 1/A = <b>{fmt(1 / A, 3)}</b>, N<sub>t</sub> (Kremser) ={" "}
            <b>{fmt(Nt, 2)}</b>, N<sub>OG</sub> = <b>{fmt(N, 2)}</b>; HETP = H<sub>OG</sub> ln λ/(λ − 1) ={" "}
            <b>{fmt(hetp, 3)} m</b>, and Z/N<sub>t</sub> ={" "}
            <b>{N === null || Nt === null ? "n/a" : fmt(N * H / Nt, 3)} m</b> (the same number).
          </Text>
        </Box>
        {step(5)}
        <Box data-engine-half={TRANSFER_UNIT_WITNESS}>
          <OriginMark of={["engine", "page"]}
            note={`${TRANSFER_UNIT_WITNESS}: the published profile and KPIs; two sums are the page's`} />
          {!go && (
            <Button mt="sm" size="xs" variant="default" data-engine-run={TRANSFER_UNIT_WITNESS}
              onClick={() => setGo(true)}>
              Run {TRANSFER_UNIT_WITNESS} and read its H_OG
            </Button>
          )}
          {go && run.busy && <Text size="sm" mt="sm" c="dimmed">Running the engine in the browser…</Text>}
          {go && run.err && <Text size="sm" mt="sm" c="red">{run.err}</Text>}
          {go && !run.busy && !run.err && run.result && !bed && (
            <Text size="sm" mt="sm" c="red">The run published no H_OG profile.</Text>
          )}
          {bed && <BedPanel bed={bed} />}
        </Box>

        <LessonQuiz title="Check your understanding" questions={TRANSFER_UNIT_QUIZ} lesson={TRANSFER_UNIT_STEPS} />
        <LessonLimits limits={TRANSFER_UNIT_LIMITS} />
        <LessonReferences tool="transfer-unit" />
      </Stack>
    </Box>
  );
}
