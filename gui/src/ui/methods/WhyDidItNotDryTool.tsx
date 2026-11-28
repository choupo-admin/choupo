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
  WhyDidItNotDryTool -- "Why did it not dry?" (C508, page A of the dryer
  redesign: "The water, the air, the clock").

  THE TASK, in one sentence: a dryer left the product wetter than it should
  be; was it the air, the clock or the isotherm, and what does the last
  percent cost?  Three cards answer it.

    C1  "Ten percent of what?"  the wet and the dry basis, and each case's
        own feed and product on both (read from four engine runs);
    C2  "Why did it not dry?"  four engine runs side by side, each with a
        verdict chip that ORDERS the engine's numbers against declared
        tolerances (dryingBalance.dryerVerdict) and prints the numbers it
        used; one control (the inlet air flow of the sugar dryer) with a
        sweep that shows where the cliff is;
    C3  "The humid day"  the tray of dryer01 in air of rising humidity: the
        floor X_eq rises, and a specification below it is unreachable.

  ZERO PHYSICS IN TYPESCRIPT.  Every X, a_w, T and residence time is a KPI or
  a column of a run of a bundled witness (solidDryer01/02, evapDryer02,
  sprayDryer06, dryer01), in the shipped WASM.  The TypeScript orders,
  takes ratios and converts bases, and says which of those it did.  The one
  knob, the air flow, multiplies the case's own authored flows by a ratio.
  SolidDryer and EvaporativeDryer have no kinetics, and the card says so; no
  particle temperature is shown anywhere on the page.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import {
  Alert, Badge, Box, Group, Loader, NumberInput, Table, Text, Title,
} from "@mantine/core";

import type { RunResult } from "../../adapters/SolverAdapter.js";
import {
  useMethodRun, useMethodRunSweep, type DictOverride, type MethodRunState,
} from "../../case/methodRun.js";
import { DryChart, type ChartGuide, type ChartSeries } from "./DryChart.js";
import {
  VERDICT_CASES, VERDICT_TOLERANCE, W_SOLID_RICH, W_TRAY,
  authoredFlow, dryerVerdict, dryFromWet, scaledFlowOverrides, shareRemoved,
  timeToReach, waterPerTonneProduct, wetFromDry,
  type DryerFacts, type Verdict, type VerdictResult,
} from "./dryingBalance.js";
import { KnobSlider } from "./knobPanel.js";
import { LessonDocument, type LessonDoc } from "./lessonDocument.js";
import { OriginMark } from "./origin.js";
import { WHY_LIMITS, WHY_QUIZ, WHY_STEPS } from "./whyDidItNotDryLesson.js";

const g4 = (v: number | null | undefined): string =>
  typeof v === "number" && Number.isFinite(v) ? String(Number(v.toPrecision(4))) : "—";
const BOX = {
  border: "1px solid var(--mantine-color-default-border)", borderRadius: 4,
} as const;
const SCROLL = { overflowX: "auto", maxWidth: "100%" } as const;

/** The unit's KPI block of a run, or undefined. */
function blockOf(r: RunResult | null | undefined, unit: string): { [k: string]: number } | undefined {
  return r?.kpis?.[unit];
}

/** The engine numbers a verdict may read, lifted from a unit's KPI block. */
export function factsOf(b: { [k: string]: number } | undefined): DryerFacts {
  const read = (k: string): number | null => {
    const v = b?.[k];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  return {
    Xinitial: read("X_initial"), Xfinal: read("X_final"), Xeq: read("X_equilibrium"),
    exhaustAw: read("exhaust_humidity"), Tout: read("T_out"), Twb: read("T_wetbulb"),
    residence: read("residenceTime"),
  };
}

export const VERDICT_COLOR: Readonly<Record<Verdict, string>> = {
  "air-limited": "orange", "time-limited": "grape",
  "isotherm-bound": "teal", "not-classified": "gray",
};
const VERDICT_DOT: Readonly<Record<Verdict, string>> = {
  "air-limited": "#f08c00", "time-limited": "#ae3ec9",
  "isotherm-bound": "#12b886", "not-classified": "#868e96",
};

function VerdictChip({ v }: { v: VerdictResult }): JSX.Element {
  return (
    <Badge variant="light" color={VERDICT_COLOR[v.verdict]} tt="none" data-verdict={v.verdict}>
      {v.verdict === "not-classified" ? "not classified" : v.verdict}
      {v.detail ? ` (${v.detail})` : ""}
    </Badge>
  );
}

// ---- The knob: one control, the sugar dryer's inlet air --------------------

const AIR_SPECIES = ["water", "N2", "O2", "Ar"] as const;
const AIR_FILE = "0/hotAir";

/** The knob's descriptor.  `def` is the witness's own authored total (the
 *  test holds it to the bundled text). */
export const AIR_KNOB = {
  id: "airFlow", label: "inlet air flow of the sugar dryer (solidDryer01)", unit: "kmol/h",
  min: 20, max: 1000, step: 10, def: 800,
  why: "the knob multiplies the four authored air flows by one ratio, so the "
    + "air's composition and temperature do not move: only how much of it there is",
} as const;

/** The sweep's points, kmol/h: where the sugar dryer's cliff is. */
export const AIR_SWEEP: readonly number[] = [25, 50, 100, 200, 400, 800];

function airOverrides(flow: number): DictOverride[] {
  return scaledFlowOverrides(W_SOLID_RICH, AIR_FILE, AIR_SPECIES,
    flow / authoredFlow(W_SOLID_RICH, AIR_FILE, AIR_SPECIES));
}

// ---- C1: ten percent of what? ----------------------------------------------

function CardBasis({ runs }: { runs: readonly MethodRunState[] }): JSX.Element {
  const [wetPct, setWetPct] = useState<number | string>(10);
  const w = Number(wetPct) / 100;
  const X = dryFromWet(w);
  return (
    <Box px="sm" py={8} style={BOX} data-card="basis">
      <Title order={5}>Try it: ten percent of what?</Title>
      <OriginMark of={["page", "engine"]}
        note="the converter is algebra on the two definitions; the pairs below are each case's own feed and product, from the four runs of the ceilings card (step 3)" />
      <Group gap="md" mt={6} align="flex-end">
        <NumberInput label="moisture on the wet basis, %" value={wetPct} onChange={setWetPct}
          min={0} max={99} step={1} w={190} size="xs" />
        <Text size="sm" data-converted="">
          is X = <strong>{g4(X)}</strong> kg water per kg dry solid
          {Number.isFinite(X) && X > 0
            ? `; the water is ${g4(100 * X / (1 + X))} % of the wet product and ${g4(X)} times the dry solid`
            : ""}
        </Text>
      </Group>
      <Text size="xs" c="dimmed" mt={4}>
        What a drop of five points removes: from 50 % wet to 45 % wet the water falls by{" "}
        {g4(100 * shareRemoved(dryFromWet(0.5), dryFromWet(0.45)))} % of what is there; from 10 % to 5 %
        by {g4(100 * shareRemoved(dryFromWet(0.1), dryFromWet(0.05)))} %.
      </Text>
      <Box mt={8} style={SCROLL}>
        <Table withTableBorder withColumnBorders fz="xs" data-basis-table="">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Case</Table.Th>
              <Table.Th>feed X</Table.Th><Table.Th>feed, % wet</Table.Th>
              <Table.Th>product X</Table.Th><Table.Th>product, % wet</Table.Th>
              <Table.Th>engine kpi moisture_pct_wb</Table.Th>
              <Table.Th>water removed, % of it</Table.Th>
              <Table.Th>water per tonne of product, kg</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {VERDICT_CASES.map((c, i) => {
              const b = blockOf(runs[i]?.result, c.unit);
              const f = factsOf(b);
              const have = f.Xinitial !== null && f.Xfinal !== null;
              return (
                <Table.Tr key={c.id} data-basis-row={c.id}>
                  <Table.Td>{c.label}</Table.Td>
                  <Table.Td>{g4(f.Xinitial)}</Table.Td>
                  <Table.Td>{have ? g4(100 * wetFromDry(f.Xinitial!)) : "—"}</Table.Td>
                  <Table.Td>{g4(f.Xfinal)}</Table.Td>
                  <Table.Td data-col="wet-out">{have ? g4(100 * wetFromDry(f.Xfinal!)) : "—"}</Table.Td>
                  <Table.Td data-col="kpi-wet">{g4(b?.["moisture_pct_wb"])}</Table.Td>
                  <Table.Td>{have ? g4(100 * shareRemoved(f.Xinitial!, f.Xfinal!)) : "—"}</Table.Td>
                  <Table.Td>{have ? g4(waterPerTonneProduct(f.Xinitial!, f.Xfinal!)) : "—"}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Box>
      <Text size="xs" c="dimmed" mt={4}>
        The product&apos;s wet-basis percentage in the fifth column is computed here from X; the sixth is
        the engine&apos;s own kpi, and the two agree.  The starved evaporative dryer leaves its
        product at about a sixth of its mass in water, wet basis, and yet most of its water is still
        in it: both statements are true, and only the dry basis shows the second.
      </Text>
    </Box>
  );
}

// ---- C2: the three ceilings -------------------------------------------------

function FactsTable({ rows }: {
  rows: { id: string; label: string; f: DryerFacts; v: VerdictResult | null; note?: string }[];
}): JSX.Element {
  return (
    <Box style={SCROLL}>
      <Table withTableBorder withColumnBorders fz="xs" data-verdict-table="">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Run</Table.Th><Table.Th>X in</Table.Th><Table.Th>X out</Table.Th>
            <Table.Th>X_eq</Table.Th><Table.Th>exhaust a_w</Table.Th>
            <Table.Th>T_out - T_wb, K</Table.Th><Table.Th>residence, s</Table.Th>
            <Table.Th>verdict</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((r) => (
            <Table.Tr key={r.id} data-verdict-row={r.id}>
              <Table.Td>{r.label}{r.note ? <Text size="xs" c="dimmed">{r.note}</Text> : null}</Table.Td>
              <Table.Td>{g4(r.f.Xinitial)}</Table.Td>
              <Table.Td>{g4(r.f.Xfinal)}</Table.Td>
              <Table.Td>{r.f.Xeq === null ? "no isotherm" : g4(r.f.Xeq)}</Table.Td>
              <Table.Td>{r.f.exhaustAw === null ? "not published" : g4(r.f.exhaustAw)}</Table.Td>
              <Table.Td>{r.f.Tout !== null && r.f.Twb !== null ? g4(r.f.Tout - r.f.Twb) : "—"}</Table.Td>
              <Table.Td>{r.f.residence === null ? "no clock" : g4(r.f.residence)}</Table.Td>
              <Table.Td data-col="verdict">{r.v ? <VerdictChip v={r.v} /> : <Text size="xs" c="dimmed">running</Text>}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Box>
  );
}

function CardCeilings({ runs, live, flow, onFlow, sweep }: {
  runs: readonly MethodRunState[]; live: MethodRunState;
  flow: number; onFlow: (v: number) => void;
  sweep: { results: (RunResult | null)[]; errs: (string | null)[]; busy: boolean };
}): JSX.Element {
  const rows = VERDICT_CASES.map((c, i) => {
    const f = factsOf(blockOf(runs[i]?.result, c.unit));
    return { id: c.id, label: c.label, note: c.note, f,
      v: runs[i]?.result ? dryerVerdict(f, c.kinetics) : null };
  });
  const liveF = factsOf(blockOf(live.result, "solidDryer"));
  const liveV = live.result ? dryerVerdict(liveF, false) : null;
  const pts = AIR_SWEEP.map((q, i) => {
    const f = factsOf(blockOf(sweep.results[i], "solidDryer"));
    return { q, f, v: sweep.results[i] ? dryerVerdict(f, false) : null };
  });
  const series: ChartSeries[] = [{
    id: "xfinal", label: "X_final (engine), coloured by verdict", color: "#4263eb", dots: true,
    pts: pts.filter((p) => p.f.Xfinal !== null).map((p) => [p.q, p.f.Xfinal!] as const),
    dotColors: pts.filter((p) => p.f.Xfinal !== null)
      .map((p) => (p.v ? VERDICT_DOT[p.v.verdict] : "#868e96")),
  }];
  const xeq = pts.map((p) => p.f.Xeq).find((v) => v !== null) ?? null;
  const guides: ChartGuide[] = xeq !== null
    ? [{ dir: "h", at: xeq, label: "X_eq (isotherm floor)", color: "#12b886" }] : [];
  const problems = [...runs.map((r) => r.err), live.err, ...sweep.errs].filter((e): e is string => !!e);
  return (
    <Box px="sm" py={8} style={BOX} data-card="ceilings">
      <Title order={5}>Try it: three ceilings, four runs</Title>
      <OriginMark of={["engine", "page"]}
        note="four runs of bundled cases in your browser; the chip orders the engine's own numbers against the tolerances printed below it" />
      <Text size="sm" mt={4}>
        When a dryer leaves the product wet, the air, the clock or the isotherm has set the limit.
        The four rows are four engine runs; the chip is read from the numbers in the same row.
      </Text>
      <Box mt={6}><FactsTable rows={rows} /></Box>
      <Text size="xs" c="dimmed" mt={4} data-tolerances="">
        Tolerances, declared: exhaust saturated at a_w &gt;= {1 - VERDICT_TOLERANCE.sat};
        outlet at the gas wet bulb within {VERDICT_TOLERANCE.floorK} K; on the isotherm within{" "}
        {100 * VERDICT_TOLERANCE.iso} % of X_eq.  A row where none of the orderings applies is
        printed &quot;not classified&quot; with its reason, not forced into one.
      </Text>
      <Box mt={6} data-verdict-reasons="">
        {rows.map((r) => r.v && (
          <Text key={r.id} size="xs" c="dimmed">
            <strong>{r.label.split(" (")[0]}:</strong> {r.v.reason}.
          </Text>
        ))}
      </Box>
      <Alert color="gray" variant="light" mt={8} p="xs" data-no-kinetics="">
        <Text size="xs">
          The solid dryer and the evaporative dryer are balances in this engine, with no time in them: a balance, plus
          an isotherm for the first, and no residence time to read.  So &quot;time-limited&quot; can
          appear only for the spray dryer, which is the one unit here with a clock (a single-size model,
          co-current in this witness).  The chip classifies the engine&apos;s numbers; it is not a diagnosis of a
          plant.
        </Text>
      </Alert>

      <Title order={6} mt={12}>Move the air</Title>
      <Group gap="md" align="flex-start" wrap="wrap">
        <Box w={260} maw="100%">
          <KnobSlider knob={AIR_KNOB} value={flow} onChange={onFlow} showWhy />
        </Box>
        <Box style={{ flex: 1, minWidth: 260 }} data-live-air="">
          <Text size="sm">
            At {flow} kmol/h the sugar dryer gives X_final = <strong>{g4(liveF.Xfinal)}</strong>
            {liveF.Xeq !== null ? ` against X_eq = ${g4(liveF.Xeq)}` : ""}; exhaust a_w{" "}
            {g4(liveF.exhaustAw)}.{" "}
            {liveV ? <VerdictChip v={liveV} /> : (live.busy ? <Loader size="xs" /> : null)}
          </Text>
          {liveV && <Text size="xs" c="dimmed" mt={2}>{liveV.reason}.</Text>}
        </Box>
      </Group>
      <Text size="sm" mt={8}>
        The same dryer over a range of air flows, one engine run per point.  The cliff is where the
        exhaust stops being saturated: to its right more air changes nothing, because the solid is
        on its isotherm.
      </Text>
      <Box mt={4} data-sweep="air">
        <DryChart series={series} guides={guides} xLabel="inlet air flow, kmol/h"
          yLabel="X_final, kg/kg dry solid" aria="Final moisture of the sugar dryer against its inlet air flow" xDomain={[0, 850]}
          yZero />
      </Box>
      <Box style={SCROLL}>
        <Table withTableBorder withColumnBorders fz="xs" data-sweep-table="">
          <Table.Thead><Table.Tr>
            <Table.Th>air, kmol/h</Table.Th><Table.Th>X_final</Table.Th>
            <Table.Th>exhaust a_w</Table.Th><Table.Th>verdict</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {pts.map((p) => (
              <Table.Tr key={p.q}>
                <Table.Td>{p.q}</Table.Td><Table.Td>{g4(p.f.Xfinal)}</Table.Td>
                <Table.Td>{g4(p.f.exhaustAw)}</Table.Td>
                <Table.Td>{p.v ? <VerdictChip v={p.v} /> : (sweep.busy ? <Loader size="xs" /> : "—")}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>
      {problems.map((e) => <Text key={e} size="xs" c="red" ff="monospace">{e}</Text>)}
    </Box>
  );
}

// ---- C3: the humid day ------------------------------------------------------

/** The humidities of the tray's air, kg/kg dry carrier.  Every one is below
 *  saturation at the tray's 333.15 K (about 0.15 kg/kg). */
export const HUMID_DAYS: readonly number[] = [0.002, 0.006, 0.01, 0.014, 0.018];
/** The run horizon of the humid-day runs, s: long enough for the tails to show their floors. */
export const HUMID_END_TIME = 6000;

export const SPEC_KNOB = {
  id: "spec", label: "specification X_spec (kg/kg dry solid)",
  min: 0.005, max: 0.1, step: 0.005, def: 0.02,
  why: "the moisture the product must reach: draw it, and see in which air it can be reached at all",
} as const;

const DAY_COLORS = ["#1c7ed6", "#37b24d", "#f59f00", "#e8590c", "#c92a2a"];

function CardHumid({ spec, onSpec, sweep }: {
  spec: number; onSpec: (v: number) => void;
  sweep: { results: (RunResult | null)[]; errs: (string | null)[]; busy: boolean };
}): JSX.Element {
  const rows = HUMID_DAYS.map((Y, i) => {
    const r = sweep.results[i];
    const b = blockOf(r, "dryer");
    const tr = r?.trajectory;
    const X = tr?.vars["dryer.X_kg_kg"];
    const Xeq = b?.["X_equilibrium"] ?? null;
    return {
      Y, i, Xeq, t: tr?.t, X,
      reach: Xeq !== null ? spec > Xeq : null,
      time: tr && X ? timeToReach(tr.t, X, spec) : null,
    };
  });
  const series: ChartSeries[] = rows.filter((r) => r.t && r.X).map((r) => ({
    id: `Y${r.Y}`, label: `Y = ${r.Y}`, color: DAY_COLORS[r.i]!,
    pts: r.t!.map((t, k) => [t, r.X![k]!] as const),
  }));
  const guides: ChartGuide[] = [
    { dir: "h", at: spec, label: "specification", color: "#495057", dash: "" },
    ...rows.filter((r) => r.Xeq !== null).map((r) => ({
      dir: "h" as const, at: r.Xeq!, label: "", color: DAY_COLORS[r.i]!, dash: "2 4",
    })),
  ];
  const problems = sweep.errs.filter((e): e is string => !!e);
  return (
    <Box px="sm" py={8} style={BOX} data-card="humid-day">
      <Title order={5}>Try it: the humid day</Title>
      <OriginMark of={["engine", "assumption"]}
        note="five runs of the tray case dryer01_sucrose_tray (choupoBatch), the air's humidity moved; the specification is yours" />
      <Text size="sm" mt={4}>
        The same tray of sucrose in air that is drier or wetter.  Each curve is an engine column; the
        dotted line of the same colour is that air&apos;s floor, X_eq, an engine kpi.  Set a
        specification and read which airs can reach it.
      </Text>
      <Box w={300} maw="100%" mt={6}><KnobSlider knob={SPEC_KNOB} value={spec} onChange={onSpec} /></Box>
      <Box mt={4} data-sweep="humid">
        <DryChart series={series} guides={guides} xLabel="time, s" yLabel="X, kg/kg dry solid"
          aria="Moisture against time of one tray in five airs of different humidity, with each air's floor dotted"
          yZero xZero />
        {sweep.busy && <Group gap={6}><Loader size="xs" /><Text size="xs" c="dimmed">integrating five trays</Text></Group>}
      </Box>
      <Box style={SCROLL}>
        <Table withTableBorder withColumnBorders fz="xs" data-humid-table="">
          <Table.Thead><Table.Tr>
            <Table.Th>air humidity Y</Table.Th><Table.Th>floor X_eq (engine)</Table.Th>
            <Table.Th>can X_spec be reached?</Table.Th><Table.Th>time to X_spec, s</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.Y} data-humid-row={r.Y}>
                <Table.Td>{r.Y}</Table.Td><Table.Td>{g4(r.Xeq)}</Table.Td>
                <Table.Td>{r.reach === null ? "—" : r.reach ? "yes, in principle" : "no: below the floor"}</Table.Td>
                <Table.Td>{r.reach === false ? "never"
                  : r.time === null ? (r.t ? `not within ${HUMID_END_TIME} s` : "—") : g4(r.time)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>
      <Text size="xs" c="dimmed" mt={4}>
        &quot;Yes, in principle&quot; compares the specification with the floor and nothing else; the
        time is read from the emitted curve and is only as long as the run ({HUMID_END_TIME} s).  The
        floor is the sample&apos;s declared sorption record evaluated at the air&apos;s water activity,
        not a prediction, and the record is a fit: below the lowest water activity it was fitted over
        it is extrapolating.
      </Text>
      {problems.map((e) => <Text key={e} size="xs" c="red" ff="monospace">{e}</Text>)}
    </Box>
  );
}

// ---- The page ---------------------------------------------------------------

const NO_OVERRIDES: readonly DictOverride[] = [];

export function WhyDidItNotDryTool(): JSX.Element {
  // The four fixed runs (hook order is constant: one per verdict case).
  const r0 = useMethodRun(VERDICT_CASES[0]!.witness, NO_OVERRIDES, "", "choupoSolve");
  const r1 = useMethodRun(VERDICT_CASES[1]!.witness, NO_OVERRIDES, "", "choupoSolve");
  const r2 = useMethodRun(VERDICT_CASES[2]!.witness, NO_OVERRIDES, "", "choupoSolve");
  const r3 = useMethodRun(VERDICT_CASES[3]!.witness, NO_OVERRIDES, "", "choupoSolve");
  const runs = [r0, r1, r2, r3];

  const [flow, setFlow] = useState<number>(AIR_KNOB.def);
  const liveOv = useMemo(() => airOverrides(flow), [flow]);
  const live = useMethodRun(W_SOLID_RICH, liveOv, String(flow), "choupoSolve");

  const airSets = useMemo(() => AIR_SWEEP.map((q) => airOverrides(q)), []);
  const airSweep = useMethodRunSweep(W_SOLID_RICH, airSets, "air", "choupoSolve");

  const [spec, setSpec] = useState<number>(SPEC_KNOB.def);
  const humidSets = useMemo(() => HUMID_DAYS.map((Y): DictOverride[] => [
    { file: "system/flowsheetDict", key: "Y", value: Y },
    { file: "system/controlDict", key: "endTime", value: HUMID_END_TIME },
  ]), []);
  const humid = useMethodRunSweep(W_TRAY, humidSets, "humid", "choupoBatch");

  const doc: LessonDoc = {
    title: "Why did it not dry?",
    question: "In ten minutes.  The question: a dryer left the product wet; was it the air, the clock "
      + "or the floor?  The one idea: three ceilings, and the numbers say which one you hit.  "
      + "The first number: cutting a feed from 50 to 10 percent moisture on the wet basis "
      + "removes 88.9 percent of its water (X falls from 1 to 0.111), not 40.  Every number "
      + "below the lead is an engine run of a bundled case.",
    steps: WHY_STEPS, quiz: WHY_QUIZ, limits: WHY_LIMITS,
    sections: {
      question: [{ kind: "step", n: 1 }],
      try: [
        { kind: "bench", node: <CardBasis runs={runs} /> },
      ],
      see: [
        { kind: "step", n: 2 }, { kind: "step", n: 3 },
        { kind: "bench", node: <CardCeilings runs={runs} live={live} flow={flow} onFlow={setFlow} sweep={airSweep} /> },
      ],
      why: [
        { kind: "step", n: 4 },
        { kind: "bench", node: <CardHumid spec={spec} onSpec={setSpec} sweep={humid} /> },
      ],
    },
  };
  return <LessonDocument tool="why-did-it-not-dry" doc={doc} />;
}
