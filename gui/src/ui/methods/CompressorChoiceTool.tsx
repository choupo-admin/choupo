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
  CompressorChoiceTool -- "Which compressor, and how far can I turn it down?"
  (C510).  A scrolling lesson, five cards; the lesson is DATA
  (compressorChoiceLesson.ts), the arithmetic is compressorChoiceMath.ts's,
  the drawings compressorChoiceDrawings.tsx's.

  WHAT IS THE ENGINE'S.  Two live runs (choupoSolve in the browser): the air
  machine of compressor03_staged_design and the make-up compressor of
  ammonia02_full_plant.  From their design sheets the page reads each duty
  (actual inlet flow, ratio), and -- the C510 export -- the MACHINE CHART the
  engine selected from, so the rectangles drawn are the engine's, never typed.
  Card 5 re-runs the air machine at the total flow an anti-surge valve makes it
  pass, and again at the suction temperature of an uncooled recycle.  The
  reference plant's four compressors (card 2) are a RECORDED run
  (compressorChoicePlant.ts), labelled so.
  WHAT IS THE PAGE'S, marked so: the point-in-region rule (held to the
  engine's own pick), the driver-limited ceiling, the mass balance of the
  recycle.  AUTHORED: the grid of card 3.  DECLARED BY YOU: the surge flow and
  the shut-off head (the engine holds no characteristic map).
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import { Alert, Anchor, Badge, Box, Button, Chip, Group, Loader, SegmentedControl, Slider, Stack,
  Table, Text, Title } from "@mantine/core";

import { findDesignSheet } from "../../case/designSheet.js";
import { useMethodRun, type MethodRunState } from "../../case/methodRun.js";
import {
  COMPRESSION_REAL_UNIT, COMPRESSION_REAL_WITNESS, COMPRESSION_UNIT, COMPRESSION_WITNESS,
  readCompressionSheet, type CompressionSheet,
} from "./compression.js";
import {
  antiSurge, driverCeilingRatio, eligible, enginePick, m3hFromCfm, readChart, readDuty,
  shutOffRatio, suctionMix, swapGas, type DutyRead,
} from "./compressorChoiceMath.js";
import { PLANT_COMPRESSORS, PLANT_RECORD } from "./compressorChoicePlant.js";
import { MachineChart, RecycleBar } from "./compressorChoiceDrawings.js";
import {
  CC_LIMITS, CC_QUIZ, CC_STEPS, GRID, GRID_MACHINES, GRID_QUESTIONS, type Favour, type GridQuestionId,
} from "./compressorChoiceLesson.js";
import { KnobSlider, PanelNote } from "./knobPanel.js";
import { LessonLimits, lessonStepper } from "./lessonStep.js";
import { LessonQuiz } from "./lessonQuiz.js";
import { OriginMark } from "./origin.js";
import { setActiveMethodTool } from "./registry.js";

const step = lessonStepper(CC_STEPS);

/** The feed the air witness declares (0/feed): the page scales it for card 5. */
export const AIR_FEED_KMOL_H = { N2: 360.0, O2: 95.0 } as const;
export const AIR_FEED_T = 298.15;

const KNOB_GRID = {
  display: "grid", gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))",
} as const;

const fx = (v: number | null | undefined, d: number): string =>
  typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "—";

function PanTable({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <Box data-pan-x="" style={{ width: "100%", overflowX: "auto" }}>
      <Table striped withTableBorder withColumnBorders fz="xs" mt={6}>{children}</Table>
    </Box>
  );
}

function Figure({ children, caption }: { children: React.ReactNode; caption: React.ReactNode }): JSX.Element {
  return (
    <Box component="figure" m={0} mt={8} mb={8} style={{ minWidth: 0 }}>
      {children}
      <Text component="figcaption" size="xs" c="dimmed" mt={4}
        style={{ whiteSpace: "normal", overflowWrap: "anywhere", lineHeight: 1.35 }}>
        {caption}
      </Text>
    </Box>
  );
}

function Waiting({ runs, what }: { runs: MethodRunState[]; what: string }): JSX.Element | null {
  const err = runs.find((r) => r.err !== null)?.err ?? null;
  if (err !== null) {
    return (
      <Alert color="red" variant="light" title="The engine reported an error: its message, verbatim">
        <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>{err}</Text>
      </Alert>
    );
  }
  if (runs.some((r) => r.busy || r.result === null)) {
    return (
      <Group gap="sm" wrap="nowrap" align="center" data-cc-waiting="">
        <Loader size="xs" />
        <Text size="xs" c="dimmed">{what}</Text>
      </Group>
    );
  }
  return null;
}

/** A slider on a logarithmic scale: `value` is the true quantity. */
function LogSlider({ label, value, min, max, onChange, unit, digits = 0 }: {
  label: string; value: number; min: number; max: number; unit?: string; digits?: number;
  onChange: (v: number) => void;
}): JSX.Element {
  return (
    <Box style={{ minWidth: 0 }}>
      <Text size="xs" fw={600}>{label}: {fx(value, digits)}{unit ? ` ${unit}` : ""}</Text>
      <Slider size="xs" mt={6} min={Math.log10(min)} max={Math.log10(max)} step={0.01}
        value={Math.log10(Math.min(max, Math.max(min, value)))}
        scale={(v) => Math.pow(10, v)} label={null}
        onChange={(v) => onChange(Math.pow(10, v))} aria-label={label} />
    </Box>
  );
}

interface RunSheets {
  sheet: CompressionSheet | { error: string } | null;
  compressor: ReturnType<typeof findDesignSheet> | null;
  duty: DutyRead | { error: string } | null;
  driverKW: number | null;
}

function readRun(run: MethodRunState, unit: string): RunSheets {
  if (!run.result) return { sheet: null, compressor: null, duty: null, driverKW: null };
  const sheet = readCompressionSheet(run.result.designFiles, unit);
  const ds = findDesignSheet(run.result.designFiles, unit, "compressor");
  const duty = "error" in sheet ? sheet : readDuty(ds?.compressor ?? null, sheet);
  const dv = ds?.sizing.find((s) => s.key === "driverRating")?.value;
  return { sheet, compressor: ds, duty, driverKW: typeof dv === "number" ? dv : null };
}

const FAVOUR_COLOR: Record<Favour, string> = { favoured: "teal", neutral: "gray", against: "orange" };

export function CompressorChoiceTool(): JSX.Element {
  // ---- the runs ---------------------------------------------------------------
  const air = useMethodRun(COMPRESSION_WITNESS, [], "shipped", "choupoSolve");
  const plant = useMethodRun(COMPRESSION_REAL_WITNESS, [], "shipped", "choupoSolve");
  const A = useMemo(() => readRun(air, COMPRESSION_UNIT), [air.result]);          // eslint-disable-line react-hooks/exhaustive-deps
  const P = useMemo(() => readRun(plant, COMPRESSION_REAL_UNIT), [plant.result]); // eslint-disable-line react-hooks/exhaustive-deps
  const dutyA = A.duty && !("error" in A.duty) ? A.duty : null;
  const dutyP = P.duty && !("error" in P.duty) ? P.duty : null;
  const chart = readChart(A.compressor?.compressor ?? null);

  // ---- state ------------------------------------------------------------------
  const [machineOf, setMachineOf] = useState<"air" | "plant">("air");
  const [dutyPt, setDutyPt] = useState<{ cfm: number; ratio: number } | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [ceilingMachine, setCeilingMachine] = useState<"positive" | "centrifugal">("positive");
  const [vesselBar, setVesselBar] = useState(14);
  const [shutOff, setShutOff] = useState(1.1);
  const [demand, setDemand] = useState(0.5);
  const [surgeFrac, setSurgeFrac] = useState(0.7);
  const [margin, setMargin] = useState(0.1);
  const [cooled, setCooled] = useState<"cooled" | "uncooled">("uncooled");

  // ---- card 1 -----------------------------------------------------------------
  const base = machineOf === "air" ? dutyA : dutyP;
  const other = machineOf === "air" ? dutyP : dutyA;
  const swap = base && other ? swapGas(base, other) : null;

  const duty = dutyPt ?? (dutyA ? { cfm: dutyA.cfm, ratio: dutyA.ratio } : { cfm: 1e3, ratio: 5 });
  const card1 = (
    <Box data-cc-card="duty">
      <OriginMark of={["engine", "page"]}
        note="the two duties and their gases are the engine's (two sized compressors run in this browser); the swap is the page's one-section arithmetic" />
      <Box mt={8}><Waiting runs={[air, plant]} what="the engine is running the air machine and the ammonia plant" /></Box>
      <PanTable>
        <Table.Thead>
          <Table.Tr><Table.Th>from the engine</Table.Th><Table.Th>air machine</Table.Th><Table.Th>make-up compressor, ammonia plant</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          <Table.Tr><Table.Td>actual inlet flow [m³/h]</Table.Td><Table.Td>{fx(dutyA?.m3h, 0)}</Table.Td><Table.Td>{fx(dutyP?.m3h, 0)}</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>actual inlet flow [cfm]</Table.Td><Table.Td>{fx(dutyA?.cfm, 0)}</Table.Td><Table.Td>{fx(dutyP?.cfm, 0)}</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>overall pressure ratio</Table.Td><Table.Td>{fx(dutyA?.ratio, 2)}</Table.Td><Table.Td>{fx(dutyP?.ratio, 2)}</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>molar mass [kg/kmol]</Table.Td><Table.Td>{fx(dutyA?.MW, 2)}</Table.Td><Table.Td>{fx(dutyP?.MW, 2)}</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>mass flow [kg/s]</Table.Td><Table.Td>{fx(dutyA?.mdot, 3)}</Table.Td><Table.Td>{fx(dutyP?.mdot, 3)}</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>head of stage 1 [kJ/kg]</Table.Td><Table.Td>{fx(dutyA ? dutyA.head1 / 1000 : undefined, 1)}</Table.Td><Table.Td>{fx(dutyP ? dutyP.head1 / 1000 : undefined, 1)}</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>shaft power of the design [kW]</Table.Td><Table.Td>{fx(dutyA?.powerShaft, 0)}</Table.Td><Table.Td>{fx(dutyP?.powerShaft, 0)}</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>machine the engine picked</Table.Td><Table.Td>{A.compressor?.compressor?.machine ?? "—"}</Table.Td><Table.Td>{P.compressor?.compressor?.machine ?? "—"}</Table.Td></Table.Tr>
        </Table.Tbody>
      </PanTable>
      <Box mt={10}>
        <Text size="xs" fw={600}>Hand one machine's duty to the other gas</Text>
        <SegmentedControl size="xs" fullWidth mt={4} value={machineOf}
          onChange={(v) => setMachineOf(v as "air" | "plant")} aria-label="whose machine"
          data={[{ value: "air", label: "air machine's volume and ratio" },
                 { value: "plant", label: "make-up machine's volume and ratio" }]} />
      </Box>
      {base && other && swap && (
        <Text size="sm" mt={8} data-cc-swap="">
          At {fx(base.m3h, 0)} m³/h and a ratio of {fx(base.ratio, 2)}, the other gas (molar mass {fx(other.MW, 2)}) would weigh
          {" "}{fx(swap.mdot, 3)} kg/s instead of {fx(base.mdot, 3)}, ask {fx(swap.head / 1000, 1)} kJ/kg of head instead of
          {" "}{fx(base.head1 / 1000, 1)}, and need {fx(swap.power, 0)} kW in one section against {fx(base.powerShaft, 0)} kW
          for the engine's staged design of the machine as it is: the mass and the head move by a factor of {fx(Math.max(swap.mdot / base.mdot, base.mdot / swap.mdot), 1)} or
          {" "}{fx(Math.max(swap.head / base.head1, base.head1 / swap.head), 1)}, the volume and the ratio do not.
        </Text>
      )}
      <PanelNote>
        Runs tutorials/{COMPRESSION_WITNESS} and tutorials/{COMPRESSION_REAL_WITNESS} (choupoSolve WASM, shipped
        dicts). The swap is one section at the other gas's own exponent, compressibility and efficiency from its
        sheet, at the first machine's suction state, so its power is NOT the engine's staged figure for that gas
        and is not compared with it.
      </PanelNote>
    </Box>
  );

  // ---- card 2 -----------------------------------------------------------------
  const pick = !("error" in chart) ? enginePick(chart, duty.cfm, duty.ratio) : null;
  const elig = !("error" in chart) ? eligible(chart, duty.cfm, duty.ratio) : [];
  const atEngine = dutyA !== null && !dutyPt;
  const card2 = (
    <Box data-cc-card="chart">
      <OriginMark of={["engine", "reference", "page"]}
        note="the rectangles are the engine's, published in its design sheet from Brown 2005 Fig 1-2 (p.3); the duty point is yours; the plant's four compressors are a recorded run" />
      {"error" in chart ? (
        air.result !== null && (
          <Alert color="orange" variant="light" mt={8} data-cc-nochart="">
            The engine's sheet carries no machine chart: {chart.error}.
          </Alert>
        )
      ) : (
        <>
          <Box mt={8} style={KNOB_GRID}>
            <LogSlider label="actual inlet flow" value={duty.cfm} min={1e2} max={1e6} unit="cfm"
              onChange={(v) => setDutyPt({ cfm: v, ratio: duty.ratio })} />
            <LogSlider label="overall pressure ratio" value={duty.ratio} min={1.05} max={200} digits={2}
              onChange={(v) => setDutyPt({ cfm: duty.cfm, ratio: v })} />
            <Stack gap={4} justify="flex-end">
              <Group gap={6}>
                <Button size="xs" variant="light" disabled={!dutyA}
                  onClick={() => dutyA && setDutyPt({ cfm: dutyA.cfm, ratio: dutyA.ratio })}>the air machine's duty</Button>
                <Button size="xs" variant="light" disabled={!dutyP}
                  onClick={() => dutyP && setDutyPt({ cfm: dutyP.cfm, ratio: dutyP.ratio })}>the make-up machine's</Button>
              </Group>
            </Stack>
          </Box>
          <Figure caption={<>Inlet flow against pressure ratio, both logarithmic, the regions the engine selects from
            (the figure of Brown 2005 as the engine reads it: good to about 3 % of an edge). The circle is your duty
            ({fx(duty.cfm, 0)} cfm = {fx(m3hFromCfm(duty.cfm), 0)} m³/h, ratio {fx(duty.ratio, 2)}): drag it, or use the sliders. A region
            whose rectangle holds it is drawn heavy; the engine's pick carries a star. The diamonds are the four compressors of the
            reference ammonia plant, from the recorded run named below, not a live one.</>}>
            <MachineChart regions={chart.regions} duty={duty} picked={pick?.machine ?? null} eligible={elig}
              onMove={(cfm, ratio) => setDutyPt({ cfm, ratio })}
              points={PLANT_COMPRESSORS.map((p) => ({ name: p.name, cfm: p.cfm, ratio: p.ratio }))} />
          </Figure>
          <Text size="sm" data-cc-pick="">
            {elig.length === 0
              ? <>No region holds this point. </>
              : <>The regions that hold it: <b>{elig.join(", ")}</b>. </>}
            {pick && pick.how === "region" && elig.length > 1 && (
              <>Two regions overlap here, and the engine takes the first in its own list, <b>{pick.machine}</b>: a convention, because the book gives no tie-break. </>
            )}
            {pick && pick.how === "region" && elig.length === 1 && <>The engine's pick is <b>{pick.machine}</b>. </>}
            {pick && pick.how === "belowChart" && (
              <>The ratio is below the chart's lowest edge, where the figure draws nothing: the engine takes the first machine whose flow range holds the flow, <b>{pick.machine}</b> (a booster or circulator duty). </>
            )}
            {pick && pick.how === "outside" && (
              <>The point is outside every region, and the engine takes <b>reciprocating</b>, the only family that reaches the highest ratios. </>
            )}
            {pick && pick.how === "beyondFlow" && (
              <>Above 10⁶ cfm the engine stops and asks you to declare the machine and the parallel trains. </>
            )}
            {atEngine && A.compressor?.compressor && (
              <>For the air machine's own duty the engine said: “{A.compressor.compressor.selection}”.</>
            )}
          </Text>
        </>
      )}
      <PanelNote>
        The chart is read from tutorials/{COMPRESSION_WITNESS}'s design sheet (`compressor {"{ chart ( … ) }"}`); the
        point-in-region rule and the fall-backs are the page's copy of the engine's rule and a test holds them to the
        engine's own pick. The plant's points: {PLANT_RECORD}
      </PanelNote>
    </Box>
  );

  // ---- card 3 -----------------------------------------------------------------
  const tally = GRID_MACHINES.map((m) => {
    const chosen = GRID_QUESTIONS.filter((q) => questions.includes(q.id));
    return {
      m,
      favoured: chosen.filter((q) => GRID[q.id][m].favour === "favoured").length,
      against: chosen.filter((q) => GRID[q.id][m].favour === "against").length,
    };
  });
  const card3 = (
    <Box data-cc-card="grid">
      <Group gap={6}>
        <Badge size="sm" variant="light" color="orange" data-cc-authored="">authored, not computed</Badge>
        <Text size="xs" c="dimmed">
          Written for this lesson in its own words, from general practice. No source was read for any cell, and a maker's quotation can overrule every one.
        </Text>
      </Group>
      <Text size="xs" mt={8} fw={600}>Which of these decide your duty? Tick them and the tally below counts only those.</Text>
      <Chip.Group multiple value={questions} onChange={setQuestions}>
        <Group gap={6} mt={6}>
          {GRID_QUESTIONS.map((q) => (
            <Chip key={q.id} size="xs" value={q.id} data-cc-question={q.id}>{q.ask}</Chip>
          ))}
        </Group>
      </Chip.Group>
      <PanTable>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>the ticked questions</Table.Th>
            {GRID_MACHINES.map((m) => <Table.Th key={m}>{m}</Table.Th>)}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          <Table.Tr data-cc-tally="">
            <Table.Td>{questions.length === 0 ? "none ticked" : `${questions.length} ticked`}</Table.Td>
            {tally.map((t) => (
              <Table.Td key={t.m}>{questions.length === 0 ? "—" : `${t.favoured} usual, ${t.against} against`}</Table.Td>
            ))}
          </Table.Tr>
        </Table.Tbody>
      </PanTable>
      <Stack gap="sm" mt="sm">
        {GRID_QUESTIONS.map((q) => (
          <Box key={q.id} px="sm" py={8} data-cc-grid-row={q.id}
            style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: 4,
              borderLeft: questions.includes(q.id) ? "3px solid var(--mantine-color-accent-5)" : undefined }}>
            <Text size="sm" fw={600}>{q.ask}</Text>
            {GRID_MACHINES.map((m) => {
              const cell = GRID[q.id as GridQuestionId][m];
              return (
                <Group key={m} gap={8} mt={4} wrap="nowrap" align="flex-start">
                  <Badge size="xs" variant="light" color={FAVOUR_COLOR[cell.favour]} w={92} style={{ flexShrink: 0 }}
                    data-cc-cell={`${q.id}:${m}`}>{cell.favour === "favoured" ? "usual answer" : cell.favour === "against" ? "against" : "neutral"}</Badge>
                  <Text size="xs" style={{ minWidth: 0 }}><b>{m}.</b> {cell.why}</Text>
                </Group>
              );
            })}
          </Box>
        ))}
      </Stack>
    </Box>
  );

  // ---- card 4 -----------------------------------------------------------------
  const driverKW = A.driverKW;
  const positive = dutyA && driverKW !== null ? driverCeilingRatio(dutyA, driverKW) : null;
  const shut = dutyA ? shutOffRatio(dutyA, shutOff) : null;
  const ceilRatio = ceilingMachine === "positive" ? positive : shut;
  const ceilP = dutyA && ceilRatio !== null ? ceilRatio * dutyA.P1 : null;
  const vesselPa = vesselBar * 1e5;
  const exceeds = ceilP !== null && ceilP > vesselPa;
  const card4 = (
    <Box data-cc-card="ceiling">
      <OriginMark of={["engine", "page", "assumption"]}
        note="the duty, the exponent, the driver rating and the mass flow are the engine's (the air machine); the ceiling is the page's arithmetic on the engine's staging; the vessel's pressure and the shut-off head are yours" />
      <SegmentedControl size="xs" fullWidth mt={8} value={ceilingMachine}
        onChange={(v) => setCeilingMachine(v as "positive" | "centrifugal")} aria-label="machine family"
        data={[{ value: "positive", label: "positive displacement (driver-limited)" },
               { value: "centrifugal", label: "centrifugal (shut-off head)" }]} />
      <Box mt={8} style={KNOB_GRID}>
        <KnobSlider knob={{ id: "vessel", label: "design pressure of the vessel after the machine", unit: "bar abs", min: 2, max: 60, step: 0.5 }}
          value={vesselBar} onChange={setVesselBar} />
        {ceilingMachine === "centrifugal" && (
          <KnobSlider knob={{ id: "k", label: "shut-off head over design head (yours)", min: 1, max: 1.5, step: 0.01 }}
            value={shutOff} onChange={setShutOff} />
        )}
      </Box>
      {dutyA && ceilRatio !== null && ceilP !== null && (
        <Box mt={8} data-cc-ceiling="">
          <PanTable>
            <Table.Thead><Table.Tr><Table.Th>air machine</Table.Th><Table.Th>value</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              <Table.Tr><Table.Td>suction [bar abs]</Table.Td><Table.Td>{fx(dutyA.P1 / 1e5, 2)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>design discharge [bar abs]</Table.Td><Table.Td>{fx(dutyA.P2 / 1e5, 2)} (ratio {fx(dutyA.ratio, 2)})</Table.Td></Table.Tr>
              {ceilingMachine === "positive" && (
                <Table.Tr><Table.Td>driver rating, from the sheet [kW]</Table.Td><Table.Td>{fx(driverKW, 0)}</Table.Td></Table.Tr>
              )}
              <Table.Tr><Table.Td>highest ratio the machine can make</Table.Td><Table.Td>{fx(ceilRatio, 2)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>highest discharge pressure [bar abs]</Table.Td><Table.Td>{fx(ceilP / 1e5, 1)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>flow it still pushes at that pressure [kg/s]</Table.Td><Table.Td>{fx(dutyA.mdot, 3)}{ceilingMachine === "centrifugal" ? " (none: at shut-off it falls to zero)" : ""}</Table.Td></Table.Tr>
            </Table.Tbody>
          </PanTable>
          <Text size="sm" mt={8} data-cc-verdict={exceeds ? "exceeds" : "within"}>
            {exceeds
              ? <>Closing the discharge lets this machine alone take the vessel to {fx(ceilP / 1e5, 1)} bar, above its {fx(vesselBar, 1)} bar design pressure.
                {ceilingMachine === "positive"
                  ? <> A relief valve is mandatory, and it must pass the machine's whole flow, {fx(dutyA.mdot, 3)} kg/s ({fx(dutyA.mdot * 3600, 0)} kg/h), at the pressure it opens.</>
                  : <> The machine stops delivering as it nears shut-off, but a vessel designed below its shut-off pressure still needs a relief device; the flow to relieve is then a question for the Overpressure page.</>}</>
              : <>The most this machine can make, {fx(ceilP / 1e5, 1)} bar, is below the vessel's {fx(vesselBar, 1)} bar: on these assumptions the machine alone cannot overpressure it. The vessel can still be overpressured by other causes, which the Overpressure page lists.</>}
          </Text>
          <Text size="xs" mt={6}>
            The relief valve and the other ways a vessel exceeds its design pressure:{" "}
            <Anchor component="button" type="button" onClick={() => setActiveMethodTool("overpressure")}>Overpressure</Anchor>.
          </Text>
        </Box>
      )}
      <PanelNote>
        The engine's own staging ({dutyA?.nStages ?? "—"} sections) at the exponent n = {fx(dutyA?.n, 3)} of its stage 1, the efficiency held at its design value; the
        casing and rod-load limits of a real machine are not in the ceiling, and the shut-off multiple is yours (the engine holds no characteristic map).
      </PanelNote>
    </Box>
  );

  // ---- card 5 -----------------------------------------------------------------
  const kp = (r: MethodRunState): { power: number; Tin: number; Tout: number } | null => {
    const k = r.result?.kpis?.[COMPRESSION_UNIT];
    return k && Number.isFinite(k["W_shaft_kW"]) ? { power: k["W_shaft_kW"]!, Tin: k["T_in"]!, Tout: k["T_out"]! } : null;
  };
  const sd = kp(air);
  const rec = antiSurge(demand, surgeFrac, margin);
  const floor = Math.min(1, surgeFrac * (1 + margin));
  const feedOverrides = (f: number, T: number) => ([
    { file: "0/feed", key: "N2", value: AIR_FEED_KMOL_H.N2 * f, unit: "kmol/h" },
    { file: "0/feed", key: "O2", value: AIR_FEED_KMOL_H.O2 * f, unit: "kmol/h" },
    { file: "0/feed", key: "T", value: T, unit: "K" },
  ]);
  const totalKey = rec.total.toFixed(4);
  const runC = useMethodRun(COMPRESSION_WITNESS, feedOverrides(rec.total, AIR_FEED_T), `cool:${totalKey}`, "choupoSolve");
  const cooledOut = kp(runC);
  const Tmix = cooledOut ? suctionMix(rec.share, AIR_FEED_T, cooledOut.Tout) : AIR_FEED_T;
  const hotKey = `hot:${totalKey}:${Tmix.toFixed(2)}`;
  const runH = useMethodRun(COMPRESSION_WITNESS, feedOverrides(rec.total, cooledOut ? Tmix : AIR_FEED_T), hotKey, "choupoSolve");
  const hotOut = kp(runH);
  const chosen = cooled === "cooled" ? cooledOut : hotOut;
  const perKg = (s: { power: number } | null): number | null =>
    s && sd && demand > 0 ? (s.power / sd.power) / demand : null;
  const card5 = (
    <Box data-cc-card="recycle">
      <OriginMark of={["engine", "page", "assumption"]}
        note="the air machine is re-run by the engine at the total flow and, for the uncooled case, at the mixed suction temperature; the mass balance is the page's; the surge flow and its margin are yours" />
      <Box mt={8} style={KNOB_GRID}>
        <KnobSlider knob={{ id: "demand", label: "flow the plant takes, share of design", min: 0.1, max: 1, step: 0.05 }}
          value={demand} onChange={setDemand} />
        <KnobSlider knob={{ id: "surge", label: "surge flow, share of design (yours)", min: 0.4, max: 0.9, step: 0.05 }}
          value={surgeFrac} onChange={setSurgeFrac} />
        <KnobSlider knob={{ id: "margin", label: "margin kept above surge (yours)", min: 0, max: 0.3, step: 0.05 }}
          value={margin} onChange={setMargin} />
      </Box>
      <SegmentedControl size="xs" fullWidth mt={8} value={cooled}
        onChange={(v) => setCooled(v as "cooled" | "uncooled")} aria-label="recycle cooling"
        data={[{ value: "cooled", label: "recycle cooled to the fresh gas's temperature" },
               { value: "uncooled", label: "recycle returns hot" }]} />
      <Box mt={8}><Waiting runs={[air, runC, ...(rec.share > 0 ? [runH] : [])]} what="the engine is compressing the total flow" /></Box>
      <Figure caption={<>What the machine passes, as a share of its design flow. The plant takes {fx(demand * 100, 0)} %; the surge floor is
        {" "}{fx(floor * 100, 0)} % ({fx(surgeFrac * 100, 0)} % plus a margin of {fx(margin * 100, 0)} %); the machine therefore passes {fx(rec.total * 100, 0)} %,
        and {fx(rec.recycle * 100, 0)} % of the design flow ({fx(rec.share * 100, 0)} % of what it passes) goes round the recycle valve.</>}>
        <RecycleBar demand={demand} total={rec.total} floor={floor} />
      </Figure>
      {sd && cooledOut && (
        <PanTable>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>from the engine's single pass</Table.Th><Table.Th>design</Table.Th>
              <Table.Th>this demand, recycle cooled</Table.Th><Table.Th>this demand, recycle hot</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Table.Tr><Table.Td>machine passes [share of design]</Table.Td><Table.Td>1.00</Table.Td><Table.Td>{fx(rec.total, 2)}</Table.Td><Table.Td>{fx(rec.total, 2)}</Table.Td></Table.Tr>
            <Table.Tr><Table.Td>suction temperature [K]</Table.Td><Table.Td>{fx(sd.Tin, 1)}</Table.Td><Table.Td>{fx(cooledOut.Tin, 1)}</Table.Td><Table.Td>{fx(hotOut?.Tin, 1)}</Table.Td></Table.Tr>
            <Table.Tr><Table.Td>shaft power [kW]</Table.Td><Table.Td>{fx(sd.power, 0)}</Table.Td><Table.Td>{fx(cooledOut.power, 0)}</Table.Td><Table.Td>{fx(hotOut?.power, 0)}</Table.Td></Table.Tr>
            <Table.Tr><Table.Td>power if it followed the demand [kW]</Table.Td><Table.Td>{fx(sd.power, 0)}</Table.Td><Table.Td>{fx(sd.power * demand, 0)}</Table.Td><Table.Td>{fx(sd.power * demand, 0)}</Table.Td></Table.Tr>
            <Table.Tr><Table.Td>discharge temperature [K]</Table.Td><Table.Td>{fx(sd.Tout, 1)}</Table.Td><Table.Td>{fx(cooledOut.Tout, 1)}</Table.Td><Table.Td>{fx(hotOut?.Tout, 1)}</Table.Td></Table.Tr>
            <Table.Tr><Table.Td>energy per kilogram delivered, against design</Table.Td><Table.Td>1.00</Table.Td><Table.Td>{fx(perKg(cooledOut), 2)}</Table.Td><Table.Td>{fx(perKg(hotOut), 2)}</Table.Td></Table.Tr>
          </Table.Tbody>
        </PanTable>
      )}
      {chosen && sd && (
        <Text size="sm" mt={8} data-cc-recycle-line="">
          With the recycle {cooled === "cooled" ? "cooled back to the fresh gas's temperature" : "returning hot"}, the machine draws {fx(chosen.power, 0)} kW
          to deliver {fx(demand * 100, 0)} % of the flow: {fx(chosen.power / (sd.power * demand), 2)} times the power it would draw if it followed the demand,
          and the discharge is {fx(chosen.Tout, 0)} K against {fx(sd.Tout, 0)} K at the design point.
          {cooled === "uncooled" && hotOut && cooledOut && (
            <> The hot run's suction temperature ({fx(hotOut.Tin, 1)} K) comes from the cooled run's discharge, one step of the iteration;
              the hot run's own discharge came out {fx(hotOut.Tout - cooledOut.Tout, 1)} K above that, so the iteration has not converged and the true discharge is higher still; the page does not iterate further.</>
          )}
        </Text>
      )}
      {rec.share > 0 && runH.result?.log.includes("could not be SIZED") && (
        <Alert color="orange" variant="light" mt={8} data-cc-hot-refused="">
          With the recycle returning hot, the engine's staged design of this machine could not keep every discharge within the
          case's temperature limit, and the engine said so (its message is in the run's log): the single pass above is still solved,
          but a machine with a hot recycle cannot be designed on the same staging.
        </Alert>
      )}
      <PanelNote>
        Runs tutorials/{COMPRESSION_WITNESS} with its feed flow scaled to the total the machine passes (nitrogen and oxygen in their
        declared ratio) and, in the hot case, its feed temperature set to the mixed suction temperature. The power is the engine's single
        adiabatic pass at the isentropic efficiency the case declares; the staged design's own sizes are not read. Speed control, suction
        throttling and cylinder unloading are not on this page: the first two need a characteristic map the engine does not hold, and the third a source not yet read.
      </PanelNote>
    </Box>
  );

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>
        <Box>
          <Title order={4}>Which compressor, and how far can I turn it down?</Title>
          <Text size="sm" c="dimmed" mt={4}>
            A compressor is chosen from a volume and a ratio, not a power. This page takes the duty from the engine, draws the chart the
            engine selects from, gives the questions a plant engineer asks beyond the chart, shows the highest pressure the machine can
            make, and prices what it costs to keep a centrifugal machine away from surge at part load.
          </Text>
        </Box>
        {step(1)}
        {card1}
        {step(2)}
        {card2}
        {step(3)}
        {card3}
        {step(4)}
        {card4}
        {step(5)}
        {card5}
        <LessonLimits limits={CC_LIMITS} />
        <LessonQuiz title="Check your understanding" questions={CC_QUIZ} lesson={CC_STEPS} />
        <Text size="sm">
          Related:{" "}
          <Anchor component="button" type="button" onClick={() => setActiveMethodTool("compression")}>Compressing a gas</Anchor>{" "}
          (the stages once the machine is chosen),{" "}
          <Anchor component="button" type="button" onClick={() => setActiveMethodTool("overpressure")}>Overpressure</Anchor>{" "}
          (the relief a blocked discharge needs) and{" "}
          <Anchor component="button" type="button" onClick={() => setActiveMethodTool("pump-system")}>Pump vs system curve</Anchor>{" "}
          (the same question for a liquid).
        </Text>
      </Stack>
    </Box>
  );
}
