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
  CompressionTool -- "Compressing a gas" (DEV.md 4c C442), on the "Hydraulics
  & control" shelf beside the pump-and-system page.

  TWO WITNESSES run in the browser (choupoSolve):
    * compressor03_staged_design: air, 1 -> 12 bar, the engine's staged design
      (three sections, two intercoolers).  Its sheet, `design/compressor1/
      compressor`, is the ANCHOR: the page recomputes section 1 from the
      sheet's own numbers and shows both side by side.
    * ammonia02_full_plant: the make-up compressor, hydrogen and nitrogen,
      25 -> 245 bar, for the real-gas step.
  The student moves the number of sections and the intercooler temperature;
  the page computes the total power and the hottest discharge from the closed
  forms the lessons states (compression.ts), against the engine's limit.  At
  the engine's own choice it reproduces the engine's total (the test holds it).
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import { Alert, Badge, Box, Group, Loader, Stack, Table, Text, Title } from "@mantine/core";

import { useMethodRun, type MethodRunState } from "../../case/methodRun.js";
import {
  COMPRESSION_REAL_UNIT, COMPRESSION_REAL_WITNESS, COMPRESSION_UNIT, COMPRESSION_WITNESS,
  aFromN, isentropicEfficiency, readCompressionSheet, stage, staged, fewestStages,
  type CompressionSheet,
} from "./compression.js";
import { COMPRESSION_LIMITS, COMPRESSION_QUIZ, COMPRESSION_STEPS } from "./compressionLesson.js";
import { LessonQuiz } from "./lessonQuiz.js";
import { KnobSlider, PanelNote } from "./knobPanel.js";
import { LessonLimits, LessonReferences, lessonStepper } from "./lessonStep.js";
import { OriginMark } from "./origin.js";

const fx = (v: number, d: number): string => (Number.isFinite(v) ? v.toFixed(d) : "—");

function Waiting({ run, what }: { run: MethodRunState; what: string }): JSX.Element | null {
  if (run.err !== null) {
    return (
      <Alert color="red" variant="light" title="The engine refused or failed — its message, verbatim">
        <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>{run.err}</Text>
      </Alert>
    );
  }
  if (run.busy || run.result === null) {
    return (
      <Group gap="sm" wrap="nowrap" align="center">
        <Loader size="xs" />
        <Text size="xs" c="dimmed">{what}</Text>
      </Group>
    );
  }
  return null;
}

function PanTable({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <Box data-pan-x="" style={{ width: "100%", overflowX: "auto" }}>
      <Table striped withTableBorder withColumnBorders fz="xs" mt={6}>{children}</Table>
    </Box>
  );
}

const FAIL = "var(--mantine-color-red-6)";
const OK = "var(--mantine-color-teal-6)";
const INK = "var(--mantine-color-text)";
const DIM = "var(--mantine-color-dimmed)";
const BAR = "var(--mantine-color-blue-6)";

/** Total power against the number of sections, and the hottest discharge of
 *  each against the limit.  Two small bar charts sharing one row. */
function StagingChart({ powers, temps, chosen, Tlimit }: {
  powers: readonly number[]; temps: readonly number[]; chosen: number; Tlimit: number;
}): JSX.Element {
  const W = 300, H = 170, L = 44, B = 28, T = 14, Rm = 10;
  const pMax = Math.max(...powers) * 1.08;
  const tMax = Math.max(...temps, Tlimit) * 1.05;
  const bw = (W - L - Rm) / powers.length;
  const y = (v: number, vm: number): number => T + (H - T - B) * (1 - v / vm);
  const panel = (vals: readonly number[], vm: number, unit: string, limit?: number): JSX.Element => (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" style={{ width: "100%", maxWidth: 360, height: "auto" }}>
      <line x1={L} y1={H - B} x2={W - Rm} y2={H - B} stroke={DIM} />
      <line x1={L} y1={T} x2={L} y2={H - B} stroke={DIM} />
      {vals.map((v, i) => (
        <g key={i}>
          <rect x={L + i * bw + 6} y={y(v, vm)} width={bw - 12} height={H - B - y(v, vm)}
            fill={limit !== undefined && v > limit ? FAIL : BAR}
            opacity={i + 1 === chosen ? 1 : 0.45} />
          <text x={L + i * bw + bw / 2} y={H - B + 14} fontSize={10} textAnchor="middle" fill={INK}>
            {i + 1}
          </text>
          <text x={L + i * bw + bw / 2} y={y(v, vm) - 3} fontSize={9} textAnchor="middle" fill={INK}>
            {fx(v, 0)}
          </text>
        </g>
      ))}
      {limit !== undefined && (
        <g>
          <line x1={L} y1={y(limit, vm)} x2={W - Rm} y2={y(limit, vm)} stroke={OK} strokeDasharray="4 3" />
          <text x={W - Rm - 2} y={y(limit, vm) - 3} fontSize={9} textAnchor="end" fill={OK}>
            limit {fx(limit, 0)} K
          </text>
        </g>
      )}
      <text x={4} y={T + 2} fontSize={9} fill={DIM}>{unit}</text>
      <text x={(L + W - Rm) / 2} y={H - 2} fontSize={9} textAnchor="middle" fill={DIM}>
        number of sections
      </text>
    </svg>
  );
  return (
    <Box style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))" }}>
      <Box>
        <Text size="xs" fw={600}>Shaft power, total</Text>
        {panel(powers, pMax, "kW")}
      </Box>
      <Box>
        <Text size="xs" fw={600}>Hottest discharge, against the limit</Text>
        {panel(temps, tMax, "K", Tlimit)}
      </Box>
    </Box>
  );
}

function StagingBench({ sheet }: { sheet: CompressionSheet }): JSX.Element {
  const [N, setN] = useState(sheet.nStages);
  const [Tcool, setTcool] = useState(sheet.Tin);
  const s1 = sheet.stages[0]!;
  const base = useMemo(() => ({
    Tcool, T1: sheet.Tin, P1: sheet.Pin, P2: sheet.Pout, n: s1.n, Z: s1.Zavg,
    MW: sheet.MW, mdot: sheet.mdot, etaP: s1.etaPoly, mech: sheet.mechLoss,
  }), [Tcool, sheet, s1]);
  const runs = useMemo(() => [1, 2, 3, 4].map((k) => staged({ ...base, N: k })), [base]);
  const cur = runs[N - 1]!;
  const one = runs[0]!;
  const need = fewestStages(base, sheet.TdischargeLimit);
  const over = cur.Tmax > sheet.TdischargeLimit;
  const atEngine = N === sheet.nStages && Math.abs(Tcool - sheet.Tin) < 1e-9;

  return (
    <Box>
      <Title order={5}>Move the sections and the intercooler temperature</Title>
      <Text size="sm" mt={4}>
        The total power and the discharge temperatures below are computed on this page from
        the formulas of steps 1, 3 and 4, with the engine's section 1 as the anchor: the same
        air, the same 1 to 12 bar, the same polytropic efficiency, mechanical loss and cooler
        pressure drop.  Put the controls at the engine's own design (three sections, back to
        298.15 K) and the total is the engine's.
      </Text>
      <Box style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(200px, 260px) 1fr", marginTop: 8 }}>
        <Stack gap={8}>
          <OriginMark of="assumption" note="the two numbers you set" />
          <KnobSlider knob={{ id: "N", label: "Number of sections", min: 1, max: 4, step: 1 }}
            value={N} onChange={(v) => setN(Math.min(4, Math.max(1, Math.round(v))))} />
          <KnobSlider knob={{ id: "Tcool", label: "Intercooler outlet temperature", unit: "K",
            min: 280, max: 340, step: 1 }}
            value={Tcool} onChange={setTcool} />
          <PanelNote>
            Suction temperature {fx(sheet.Tin, 2)} K.  The first section always starts there;
            the intercooler sets the start of every later one.
          </PanelNote>
        </Stack>
        <Stack gap={8}>
          <OriginMark of={["engine", "page"]}
            note="inputs: the engine's sheet (air, flow, ratio, exponent, efficiency); numbers: this page's closed forms" />
          <Group gap="sm" wrap="wrap">
            <Badge variant="light" color={over ? "red" : "teal"} tt="none">
              total {fx(cur.Wshaft / 1000, 1)} kW
            </Badge>
            <Badge variant="light" color={over ? "red" : "teal"} tt="none">
              hottest discharge {fx(cur.Tmax, 1)} K {over ? "> " : "≤ "}{fx(sheet.TdischargeLimit, 0)} K limit
            </Badge>
            <Badge variant="light" color="gray" tt="none">
              section ratio {fx(cur.rStage, 4)}
            </Badge>
            {N > 1 && (
              <Badge variant="light" color="gray" tt="none">
                saved against one section {fx(100 * (1 - cur.Wshaft / one.Wshaft), 1)} %
              </Badge>
            )}
            {need !== null && (
              <Badge variant="light" color="gray" tt="none">
                fewest sections within the limit: {need}
              </Badge>
            )}
            {atEngine && (
              <Badge variant="light" color="blue" tt="none">
                the engine's own design: {fx(sheet.powerShaft, 1)} kW
              </Badge>
            )}
          </Group>
          <PanTable>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>section</Table.Th><Table.Th>ratio</Table.Th>
                <Table.Th>T in [K]</Table.Th><Table.Th>T out [K]</Table.Th>
                <Table.Th>P in [bar]</Table.Th><Table.Th>P out [bar]</Table.Th>
                <Table.Th>shaft [kW]</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {cur.stages.map((s, i) => (
                <Table.Tr key={i}>
                  <Table.Td>{i + 1}</Table.Td><Table.Td>{fx(s.r, 4)}</Table.Td>
                  <Table.Td>{fx(s.Tin, 2)}</Table.Td>
                  <Table.Td style={{ color: s.Tout > sheet.TdischargeLimit ? FAIL : undefined }}>
                    {fx(s.Tout, 2)}
                  </Table.Td>
                  <Table.Td>{fx(s.Pin / 1e5, 3)}</Table.Td><Table.Td>{fx(s.Pout / 1e5, 3)}</Table.Td>
                  <Table.Td>{fx(s.Wshaft / 1000, 2)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </PanTable>
          <StagingChart powers={runs.map((r) => r.Wshaft / 1000)} temps={runs.map((r) => r.Tmax)}
            chosen={N} Tlimit={sheet.TdischargeLimit} />
          <Text size="xs" c="dimmed">
            Bars are the total for 1 to 4 sections at the intercooler temperature you set; the
            chosen number is solid.  A red bar is a discharge above the limit.  The pressure
            between sections falls by the cooler's drop (2 % of the entrance pressure, at least
            2 psi), which is why the section ratio is a little above the ideal
            {" "}{fx(Math.pow(sheet.Pout / sheet.Pin, 1 / Math.max(N, 1)), 4)}.
          </Text>
        </Stack>
      </Box>
    </Box>
  );
}

function AnchorTable({ sheet }: { sheet: CompressionSheet }): JSX.Element {
  const s = sheet.stages[0]!;
  const mine = stage({ T1: s.Tin, r: s.ratio, n: s.n, Z: s.Zavg, MW: sheet.MW,
    mdot: sheet.mdot, etaP: s.etaPoly, mech: sheet.mechLoss });
  const a = aFromN(s.n, s.etaPoly);
  const etaA = isentropicEfficiency(s.ratio, a, s.etaPoly);
  const row = (what: string, eng: number, page: number, d: number, unit: string): JSX.Element => (
    <Table.Tr key={what}>
      <Table.Td>{what}</Table.Td>
      <Table.Td>{fx(eng, d)} {unit}</Table.Td>
      <Table.Td>{fx(page, d)} {unit}</Table.Td>
    </Table.Tr>
  );
  return (
    <Box>
      <Title order={5}>Section 1: the engine's numbers against this page's formulas</Title>
      <Text size="sm" mt={4}>
        The engine's sheet gives the section's inlet state, ratio, exponent and efficiency; the page
        puts them in steps 1 and 3 and compares.  The two columns are the same arithmetic, so they
        agree to the digits the sheet prints.  (Isentropic efficiency of this section on the
        page's formula: {fx(etaA, 4)}.)
      </Text>
      <OriginMark of={["engine", "page", "reference"]}
        note={`compressor ${sheet.unit}, section 1 of ${sheet.nStages}: the engine's sheet, and the formulas of Brown (2005) Eqs 2.73, 2.78 and 5.16 evaluated on this page`} />
      <PanTable>
        <Table.Thead>
          <Table.Tr><Table.Th>section 1</Table.Th><Table.Th>engine sheet</Table.Th><Table.Th>this page</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {row("discharge temperature", s.Tout, mine.T2, 2, "K")}
          {row("polytropic head", s.head, mine.head, 1, "J/kg")}
          {row("shaft power", s.power, mine.Wshaft / 1000, 2, "kW")}
        </Table.Tbody>
      </PanTable>
      <Text size="xs" c="dimmed" mt={4}>
        The flowsheet's own single adiabatic pass over the whole ratio (isentropic efficiency
        0.75): {fx(sheet.singlePassTout, 2)} K and {fx(sheet.singlePassPower, 1)} kW.  The
        staged design: {sheet.nStages} sections, hottest {fx(sheet.TdischargeMax, 2)} K,
        {" "}{fx(sheet.powerShaft, 1)} kW, intercoolers {fx(sheet.Qintercoolers, 1)} kW.
      </Text>
    </Box>
  );
}

function RealGasTable({ sheet }: { sheet: CompressionSheet }): JSX.Element {
  return (
    <Box>
      <Title order={5}>The reference plant's make-up compressor, section by section</Title>
      <OriginMark of={["engine", "page"]}
        note={`${COMPRESSION_REAL_WITNESS}, unit ${sheet.unit}: ${fx(sheet.Pin / 1e5, 0)} to ${fx(sheet.Pout / 1e5, 1)} bar`} />
      <PanTable>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>section</Table.Th><Table.Th>ratio</Table.Th><Table.Th>n</Table.Th>
            <Table.Th>Z avg</Table.Th><Table.Th>T out [K]</Table.Th>
            <Table.Th>head, engine [J/kg]</Table.Th><Table.Th>head, Z = 1 [J/kg]</Table.Th>
            <Table.Th>shaft [kW]</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sheet.stages.map((s, i) => {
            const ideal = stage({ T1: s.Tin, r: s.ratio, n: s.n, Z: 1, MW: sheet.MW,
              mdot: sheet.mdot, etaP: s.etaPoly, mech: sheet.mechLoss });
            return (
              <Table.Tr key={i}>
                <Table.Td>{i + 1}</Table.Td><Table.Td>{fx(s.ratio, 4)}</Table.Td>
                <Table.Td>{fx(s.n, 4)}</Table.Td><Table.Td>{fx(s.Zavg, 4)}</Table.Td>
                <Table.Td>{fx(s.Tout, 2)}</Table.Td>
                <Table.Td>{fx(s.head, 0)}</Table.Td><Table.Td>{fx(ideal.head, 0)}</Table.Td>
                <Table.Td>{fx(s.power, 1)}</Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </PanTable>
      <Text size="xs" c="dimmed" mt={4}>
        The Z = 1 column is the page's step 1 with the compressibility set to 1 at the engine's
        exponent: the engine's head over it is Z avg, and the whole difference between an
        ideal-gas page and the package.
      </Text>
    </Box>
  );
}

export function CompressionTool(): JSX.Element {
  const air = useMethodRun(COMPRESSION_WITNESS, [], "shipped", "choupoSolve");
  const real = useMethodRun(COMPRESSION_REAL_WITNESS, [], "shipped", "choupoSolve");
  const airSheet = useMemo(
    () => air.result ? readCompressionSheet(air.result.designFiles, COMPRESSION_UNIT) : null,
    [air.result]);
  const realSheet = useMemo(
    () => real.result ? readCompressionSheet(real.result.designFiles, COMPRESSION_REAL_UNIT) : null,
    [real.result]);
  const step = lessonStepper(COMPRESSION_STEPS);

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
        <Box>
          <Title order={3}>Compressing a gas: work, discharge temperature and staging</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Why one stage cannot do the job, why the ratios come out equal, and what the real gas
            adds — on the engine's staged design of an air compressor (1 to 12 bar) and of the
            reference plant's make-up compressor (25 to 245 bar), every number read from its run.
          </Text>
        </Box>

        {step(1)}
        {step(2)}

        <Waiting run={air} what="running choupoSolve on the air compressor witness in your browser…" />
        {airSheet && "error" in airSheet && (
          <Alert color="red" variant="light" title="The sheet could not be read">
            <Text size="xs" ff="monospace">{airSheet.error}</Text>
          </Alert>
        )}
        {airSheet && !("error" in airSheet) && <AnchorTable sheet={airSheet} />}

        {step(3)}
        {step(4)}
        {airSheet && !("error" in airSheet) && <StagingBench sheet={airSheet} />}
        {step(5)}

        <Waiting run={real} what="running choupoSolve on the ammonia plant witness in your browser…" />
        {realSheet && "error" in realSheet && (
          <Alert color="red" variant="light" title="The sheet could not be read">
            <Text size="xs" ff="monospace">{realSheet.error}</Text>
          </Alert>
        )}
        {step(6)}
        {realSheet && !("error" in realSheet) && <RealGasTable sheet={realSheet} />}

        <LessonQuiz title="Check your understanding" questions={COMPRESSION_QUIZ}
          lesson={COMPRESSION_STEPS} />

        <LessonLimits limits={COMPRESSION_LIMITS} title="What this does not model" />
        <LessonReferences tool="compression" />
      </Stack>
    </Box>
  );
}
