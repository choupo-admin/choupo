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
  PlantRunTool -- "What a plant costs to run, and when it pays"
  (commission C212, item B).

  THE TASK (CLAUDE.md section 10): a student with the balances and the
  investment of a plant turns them into a cost of production, a cash flow
  and a verdict; sees which factor is theirs to declare, with a pointer to the
  book that tabulates it; and sees what Choupo computes of it and what it does
  not.

  NO ENGINE RUN.  The arithmetic is plantRunMath.ts (React-free, held by
  tests/plantRun.test.ts, which also holds each engine line the page cites
  to the engine source); this file draws it.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import {
  Alert, Badge, Box, Button, Group, NativeSelect, NumberInput, Stack, Table, Text, Title,
} from "@mantine/core";

import { LessonLimits, lessonStepper, LessonReferences } from "./lessonStep.js";
import { LessonQuiz } from "./lessonQuiz.js";
import {
  PLANT_RUN_LIMITS, PLANT_RUN_QUIZ, PLANT_RUN_STEPS,
} from "./plantRunLesson.js";
import {
  ENGINE_ABSENCES, ENGINE_FACTS, RANGES, actualised, apparentConsumption,
  breakEvenOf, cashFlowOf, cifOf, classesStart, compareDepreciation, composedRate,
  converted, crewOf, enginePositions, groupsOf, itemise, nominalRate, plantStart,
  sensitivityOf, turton, unitMargin, type AssetClass, type CostRoute, type EngineFact,
  type FactorRange, type RunPlant,
} from "./plantRunMath.js";
import { OriginMark } from "./origin.js";

const step = lessonStepper(PLANT_RUN_STEPS);

const f = (x: number | null | undefined, p = 2): string =>
  (x === null || x === undefined || !Number.isFinite(x) ? "—" : x.toFixed(p));
const pc = (x: number | null, p = 1): string => (x === null ? "none" : `${(100 * x).toFixed(p)} %`);

const GRID = "var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";
const TEXTC = "var(--mantine-color-text)";

function Num({ label, value, onChange, unit, step: st = 1, min = 0, w = 140 }: {
  label: string; value: number; onChange: (v: number) => void; unit?: string;
  step?: number; min?: number; w?: number;
}): JSX.Element {
  return (
    <NumberInput size="xs" label={label} description={unit} value={value} min={min} step={st} w={w}
      onChange={(v) => { if (typeof v === "number" && Number.isFinite(v)) onChange(v); }} />
  );
}

function PanTable({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <Box data-pan-x="" style={{ width: "100%", overflowX: "auto" }}>
      <Table striped withTableBorder withColumnBorders fz="xs" mt={6}>{children}</Table>
    </Box>
  );
}

/** What the engine does, with the file and the line it was read at. */
function EngineBox({ id, facts }: { id: string; facts: readonly EngineFact[] }): JSX.Element {
  return (
    <Box data-engine={id} mt="xs" p="xs" style={{ border: `1px solid ${GRID}`, borderRadius: 4 }}>
      <Text size="xs" fw={700}>What Choupo does</Text>
      <Stack gap={4} mt={4}>
        {facts.map((g, k) => (
          <Group key={k} gap="xs" wrap="nowrap" align="flex-start">
            <Badge size="sm" color="blue" variant="light" style={{ flexShrink: 0 }}>computes</Badge>
            <Text size="xs">{g.says} <code>{g.file}:{g.line}</code></Text>
          </Group>
        ))}
      </Stack>
    </Box>
  );
}

function AbsenceBox({ ids }: { ids: readonly string[] }): JSX.Element {
  return (
    <Box data-absence={ids.join(" ")} mt="xs" p="xs" style={{ border: `1px solid ${GRID}`, borderRadius: 4 }}>
      <Stack gap={4}>
        {ENGINE_ABSENCES.filter((a) => ids.includes(a.id)).map((a) => (
          <Group key={a.id} gap="xs" wrap="nowrap" align="flex-start">
            <Badge size="sm" color="gray" variant="outline" style={{ flexShrink: 0 }}>does NOT</Badge>
            <Text size="xs">{a.says}</Text>
          </Group>
        ))}
      </Stack>
    </Box>
  );
}

// ---- charts ---------------------------------------------------------------------------------

function BreakEvenChart({ p }: { p: RunPlant }): JSX.Element {
  const W = 520, H = 230, ML = 52, MR = 14, MT = 12, MB = 38;
  const c0 = itemise(p, 0), c1 = itemise(p, 1);
  const hi = Math.max(c1.sales, c1.total) * 1.05;
  const sx = (x: number) => ML + x * (W - ML - MR);
  const sy = (y: number) => H - MB - (y / hi) * (H - MT - MB);
  const be = breakEvenOf(p);
  const mark = (x: number | null, col: string, k: number) => x === null || x > 1 ? null : (
    <g key={k}>
      <line x1={sx(x)} x2={sx(x)} y1={MT} y2={H - MB} stroke={col} strokeDasharray="4 3" strokeWidth={1.1} />
    </g>
  );
  return (
    <Box data-chart="break-even" style={{ maxWidth: W }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Sales and total cost against capacity sold">
        <line x1={ML} x2={W - MR} y1={H - MB} y2={H - MB} stroke={INK} strokeWidth={0.8} />
        {[0, 0.25, 0.5, 0.75, 1].map((x) => (
          <text key={x} x={sx(x)} y={H - MB + 13} textAnchor="middle" fontSize={9} fill={INK}>{Math.round(100 * x)}</text>
        ))}
        {[0, hi / 2, hi].map((y, k) => (
          <text key={k} x={ML - 5} y={sy(y) + 3} textAnchor="end" fontSize={9} fill={INK}>{y.toFixed(0)}</text>
        ))}
        <text x={(ML + W - MR) / 2} y={H - 5} textAnchor="middle" fontSize={10} fill={TEXTC}>capacity sold (% of design)</text>
        <text x={12} y={(MT + H - MB) / 2} fontSize={10} fill={TEXTC} textAnchor="middle"
          transform={`rotate(-90 12 ${(MT + H - MB) / 2})`}>M EUR per year</text>
        <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(c1.sales)} stroke="#1971c2" strokeWidth={2} />
        <line x1={sx(0)} y1={sy(c0.total)} x2={sx(1)} y2={sy(c1.total)} stroke="#e8590c" strokeWidth={2} />
        <line x1={sx(0)} y1={sy(c0.total)} x2={sx(1)} y2={sy(c0.total)} stroke={INK} strokeDasharray="2 3" strokeWidth={1} />
        {mark(be.accounting, "#e8590c", 1)}
        {mark(be.npv, "#2f9e44", 2)}
        {be.accounting !== null && be.accounting <= 1 &&
          <circle cx={sx(be.accounting)} cy={sy(be.accounting * c1.sales)} r={4} fill="#e8590c" />}
      </svg>
      <Text size="xs" c="dimmed">
        <span style={{ color: "#1971c2", fontWeight: 700 }}>— sales</span>{"  "}
        <span style={{ color: "#e8590c", fontWeight: 700 }}>— total cost</span>{"  "}
        <span>··· the fixed part</span>{"  "}
        <span style={{ color: "#e8590c", fontWeight: 700 }}>- - accounting break-even</span>{"  "}
        <span style={{ color: "#2f9e44", fontWeight: 700 }}>- - NPV break-even</span>
      </Text>
    </Box>
  );
}

function Tornado({ rows, base }: {
  rows: ReturnType<typeof sensitivityOf>; base: number;
}): JSX.Element {
  const W = 540, ML = 150, MR = 20, rowH = 22, MT = 8, MB = 26;
  const H = MT + rows.length * rowH + MB;
  const lo = Math.min(base, ...rows.map((r) => Math.min(r.npvLow, r.npvHigh)));
  const hi = Math.max(base, ...rows.map((r) => Math.max(r.npvLow, r.npvHigh)));
  const span = Math.max(hi - lo, 1e-9);
  const sx = (v: number) => ML + ((v - lo) / span) * (W - ML - MR);
  return (
    <Box data-chart="tornado" style={{ maxWidth: W }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="NPV when each input is moved one at a time">
        {rows.map((r, k) => {
          const y = MT + k * rowH;
          const a = Math.min(r.npvLow, r.npvHigh), b = Math.max(r.npvLow, r.npvHigh);
          return (
            <g key={r.key}>
              <text x={ML - 6} y={y + 14} textAnchor="end" fontSize={10} fill={TEXTC}>{r.label}</text>
              <rect x={sx(a)} y={y + 3} width={Math.max(sx(b) - sx(a), 1)} height={rowH - 8} fill="#1971c2" opacity={0.75} />
            </g>
          );
        })}
        <line x1={sx(base)} x2={sx(base)} y1={MT - 2} y2={H - MB + 2} stroke="#e8590c" strokeWidth={1.4} />
        {[lo, base, hi].map((v, k) => (
          <text key={k} x={sx(v)} y={H - 8} textAnchor="middle" fontSize={9} fill={INK}>{v.toFixed(1)}</text>
        ))}
      </svg>
      <Text size="xs" c="dimmed">NPV (M EUR); the orange line is the base case.</Text>
    </Box>
  );
}

// ---- the page ---------------------------------------------------------------------------------

export function PlantRunTool(): JSX.Element {
  const [p, setP] = useState<RunPlant>(plantStart());
  const set = <K extends keyof RunPlant>(k: K, v: RunPlant[K]) => setP((q) => ({ ...q, [k]: v }));
  const [route, setRoute] = useState<CostRoute>("itemised");
  const [classes, setClasses] = useState<AssetClass[]>(classesStart());
  const [singleLife, setSingleLife] = useState(10);
  const [t1, setT1] = useState(0.03);
  const [t2, setT2] = useState(0.06);
  const [infl, setInfl] = useState(0.02);
  const [delta, setDelta] = useState(0.10);
  const [mk, setMk] = useState({
    cost: 100, idxThen: 400, idxNow: 500, amount: 100, fx: 1.1,
    prod: 120, imp: 80, exp: 30, fob: 1000, freight: 0.08, insurance: 0.01,
    rawPerUnit: 1.9,
  });

  const crew = useMemo(() => crewOf(p), [p]);
  const c = useMemo(() => itemise(p), [p]);
  const tu = useMemo(() => turton(p), [p]);
  const grp = useMemo(() => groupsOf(p), [p]);
  const dep = useMemo(() => compareDepreciation(classes, singleLife, p.tax, p.rate, 25), [classes, singleLife, p.tax, p.rate]);
  const be = useMemo(() => breakEvenOf(p, route), [p, route]);
  const cfr = useMemo(() => cashFlowOf(p, route), [p, route]);
  const sens = useMemo(() => sensitivityOf(p, delta, route), [p, delta, route]);
  const built = composedRate(t1, t2);
  const mkt = unitMargin(p.price, mk.rawPerUnit);

  const pctInput = (key: keyof RunPlant & string, r: FactorRange) => {
    const range = r.source.startsWith("Peters") ? "pointer: Peters, Timmerhaus & West (2003), ch. 6; read the book, declare your value with that source" : r.source;
    const v = p[key] as number;
    const out = r.lo !== null && r.hi !== null && (v < r.lo - 1e-12 || v > r.hi + 1e-12);
    return (
      <Box key={key} data-factor={key}>
        <NumberInput size="xs" label={`${r.label} (% of ${r.basis})`} description={range + "; starting value: illustration"}
          value={+(100 * v).toFixed(3)} min={0} step={0.5} w={250}
          error={out ? "outside the declared range: say why" : undefined}
          onChange={(x) => { if (typeof x === "number" && Number.isFinite(x)) set(key, x / 100 as never); }} />
      </Box>
    );
  };

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>
        <Box>
          <Title order={4}>What a plant costs to run, and when it pays</Title>
          <Text size="sm" c="dimmed" mt={4}>
            From the balances and the investment of one plant to a cost of
            production, a cash flow and a verdict: the cost itemised and in
            Choupo&apos;s three terms, the crew, depreciation by class, the
            break-even capacity, NPV, IRR and payback, a sensitivity, and the
            market arithmetic that feeds the price.  One illustrative plant
            runs through every step; every number is yours to edit.
          </Text>
          <Alert mt="sm" color="yellow" variant="light" title="Illustrations, not a market study" data-illustrations="">
            The plant below is made of round numbers.  A factor starting value is
            an illustration, with a pointer to the book that tabulates it; every statement about Choupo carries the line of the engine it
            was read at.  Nothing here is financial or legal advice.
          </Alert>
        </Box>

        {step(1)}

        {/* ---------------------------------------------------------------- 1 */}
        <Box data-section="cost">
          <OriginMark of={["page", "reference", "assumption"]}
            note="factor pointers (no numbers): Peters, Timmerhaus & West, 5th ed., 2003, ch. 6; Towler & Sinnott, ch. 8; Turton et al., ch. 8. The plant and the starting values are illustrations." />
          <Title order={5} mt="xs">The plant, and its bills from the balances</Title>
          <Text size="xs" c="dimmed">
            Raw material, catalyst and solvent, and utilities are quantity x
            price from the mass and energy balance at full capacity, never a
            percentage of anything.
          </Text>
          <Group mt={6} gap="md" align="flex-end" wrap="wrap">
            <Num label="Design production" unit="million units / yr" value={p.capacity} onChange={(v) => set("capacity", v)} />
            <Num label="Price" unit="EUR / unit" value={p.price} step={0.1} onChange={(v) => set("price", v)} />
            <Num label="Quantity sold" unit="fraction of design" value={p.load} step={0.05} onChange={(v) => set("load", Math.min(v, 1))} />
            <Num label="Raw materials" unit="M EUR / yr at full capacity" value={p.rawMaterial} step={1} w={190} onChange={(v) => set("rawMaterial", v)} />
            <Num label="Catalyst and solvents" unit="M EUR / yr" value={p.catalystSolvent} step={0.1} onChange={(v) => set("catalystSolvent", v)} />
            <Num label="Utilities" unit="M EUR / yr" value={p.utilities} step={0.5} onChange={(v) => set("utilities", v)} />
            <Num label="Fixed capital I" unit="M EUR" value={p.fci} step={5} onChange={(v) => set("fci", v)} />
            <Num label="Depreciation life" unit="year, straight line" value={p.deprLife} step={1} onChange={(v) => set("deprLife", Math.max(1, Math.round(v)))} />
            <Num label="Rent" unit="M EUR / yr" value={p.rent} step={0.1} onChange={(v) => set("rent", v)} />
            <Num label="Financing (interest)" unit="M EUR / yr" value={p.financing} step={0.1} onChange={(v) => set("financing", v)} />
          </Group>
          <Title order={6} mt="sm">The factors, each with a pointer to its source</Title>
          <Group mt={4} gap="md" align="flex-start" wrap="wrap">
            {RANGES.map((r) => pctInput(r.key as keyof RunPlant & string, r))}
          </Group>
          <Text size="xs" c="dimmed" mt={4} data-range-source="">
            Ranges: none shipped. {RANGES[0]?.source}.
          </Text>

          <PanTable>
            <Table.Thead><Table.Tr><Table.Th>Group</Table.Th><Table.Th>Line</Table.Th><Table.Th ta="right">M EUR / yr</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody data-itemised="">
              <Table.Tr><Table.Td rowSpan={9}>Direct</Table.Td><Table.Td>Raw materials (balance)</Table.Td><Table.Td ta="right">{f(c.rawMaterial)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Operating labour (step 2)</Table.Td><Table.Td ta="right">{f(c.labour)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Supervision</Table.Td><Table.Td ta="right">{f(c.supervision)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Utilities</Table.Td><Table.Td ta="right">{f(c.utilities)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Maintenance and repairs</Table.Td><Table.Td ta="right">{f(c.maintenance)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Operating supplies</Table.Td><Table.Td ta="right">{f(c.supplies)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Royalties</Table.Td><Table.Td ta="right">{f(c.royalty)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Catalysts and solvents</Table.Td><Table.Td ta="right">{f(c.catalystSolvent)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Laboratory</Table.Td><Table.Td ta="right">{f(c.laboratory)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Indirect</Table.Td><Table.Td>Plant overhead</Table.Td><Table.Td ta="right">{f(c.overhead)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td rowSpan={4}>Fixed</Table.Td><Table.Td>Depreciation (I / life)</Table.Td><Table.Td ta="right">{f(c.depreciation)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Local taxes</Table.Td><Table.Td ta="right">{f(c.taxes)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Insurance</Table.Td><Table.Td ta="right">{f(c.insurance)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Rent</Table.Td><Table.Td ta="right">{f(c.rent)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td rowSpan={3}>General</Table.Td><Table.Td>Administration</Table.Td><Table.Td ta="right">{f(c.admin)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Distribution and selling</Table.Td><Table.Td ta="right">{f(c.selling)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Research and development</Table.Td><Table.Td ta="right">{f(c.research)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Financing</Table.Td><Table.Td>Interest on loans</Table.Td><Table.Td ta="right">{f(c.financing)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td colSpan={2}><b>Total, depreciation and financing included</b></Table.Td><Table.Td ta="right" data-total=""><b>{f(c.total)}</b></Table.Td></Table.Tr>
              <Table.Tr><Table.Td colSpan={2}><b>Cash cost (without depreciation and financing)</b></Table.Td><Table.Td ta="right" data-cash=""><b>{f(c.cash)}</b></Table.Td></Table.Tr>
            </Table.Tbody>
          </PanTable>

          <Title order={6} mt="sm">Choupo&apos;s three terms, on the same bills</Title>
          <PanTable>
            <Table.Thead><Table.Tr>
              <Table.Th>Term</Table.Th><Table.Th ta="right">Choupo, M EUR / yr</Table.Th>
              <Table.Th>The itemised lines it stands for</Table.Th><Table.Th ta="right">Itemised, M EUR / yr</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody data-turton="">
              <Table.Tr><Table.Td>0.180 I</Table.Td><Table.Td ta="right">{f(tu.termFci)}</Table.Td>
                <Table.Td>maintenance, supplies, taxes, insurance, rent, and the overhead and administration charged on maintenance</Table.Td>
                <Table.Td ta="right">{f(grp.fciRelated)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>2.73 C_OL</Table.Td><Table.Td ta="right">{f(tu.termLabour)}</Table.Td>
                <Table.Td>labour, supervision, laboratory, and the overhead and administration charged on them</Table.Td>
                <Table.Td ta="right">{f(grp.labourRelated)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>1.23 (C_RM + C_UT + C_WT)</Table.Td><Table.Td ta="right">{f(tu.termVariable)}</Table.Td>
                <Table.Td>raw materials, catalysts and solvents, utilities, royalty (C_WT = 0)</Table.Td>
                <Table.Td ta="right">{f(grp.variable)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>(inside the 1.23)</Table.Td><Table.Td ta="right">—</Table.Td>
                <Table.Td>distribution and selling, research and development</Table.Td>
                <Table.Td ta="right">{f(grp.sellingResearch)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td><b>COM_d</b></Table.Td><Table.Td ta="right" data-comd=""><b>{f(tu.comD)}</b></Table.Td>
                <Table.Td><b>cash cost, itemised</b></Table.Td><Table.Td ta="right"><b>{f(c.cash)}</b></Table.Td></Table.Tr>
            </Table.Tbody>
          </PanTable>
          <Text size="xs" mt={4} data-turton-diff="">
            The two differ by <b>{f(tu.comD - c.cash)} M EUR a year</b> ({pc((tu.comD - c.cash) / c.cash)} of the itemised
            cash cost).  Neither is the error: Choupo&apos;s factors stand for what the lines add up to on a typical
            plant, and its 1.23 carries the overheads that ride on the bills; the itemised lines follow the factors
            YOU chose.  Choupo&apos;s C_RM here is the raw materials plus the catalysts and solvents, and its
            labour is the hired crew of step 2.
          </Text>
          <EngineBox id="comD" facts={[ENGINE_FACTS.comD, ENGINE_FACTS.wasteZero]} />
          <AbsenceBox ids={["itemised"]} />
          <EngineBox id="royalty" facts={[ENGINE_FACTS.royalty]} />
        </Box>

        {/* ---------------------------------------------------------------- 2 */}
        {step(2)}
        <Box data-section="labour">
          <OriginMark of={["page", "assumption"]} note="the crew is arithmetic on the hours you declare; the wage and the days are illustrations" />
          <Group mt={6} gap="md" align="flex-end" wrap="wrap">
            <Num label="Operators on duty per shift" value={p.operatorsPerShift} step={1} onChange={(v) => set("operatorsPerShift", v)} w={170} />
            <Num label="Shifts per day" value={p.shiftsPerDay} step={1} onChange={(v) => set("shiftsPerDay", Math.min(3, Math.max(1, Math.round(v))))} />
            <Num label="Hours per shift" unit="h" value={p.hoursPerShift} step={1} onChange={(v) => set("hoursPerShift", v)} />
            <Num label="Operating days" unit="day / yr" value={p.daysPerYear} step={5} onChange={(v) => set("daysPerYear", v)} />
            <Num label="Hours one operator is paid" unit="h / yr" value={p.hoursPerOperatorYear} step={20} w={170}
              onChange={(v) => set("hoursPerOperatorYear", Math.max(1, v))} />
            <Num label="Loaded wage" unit="EUR / h" value={p.wage} step={1} onChange={(v) => set("wage", v)} />
          </Group>
          <PanTable>
            <Table.Tbody data-crew="">
              <Table.Tr><Table.Td>Hours a post is staffed per year</Table.Td><Table.Td ta="right">{f(crew.postHours, 0)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>People per post</Table.Td><Table.Td ta="right">{f(crew.perPost, 3)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>On duty at a time</Table.Td><Table.Td ta="right">{crew.onDuty}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td><b>On the payroll</b></Table.Td><Table.Td ta="right" data-hired=""><b>{crew.hired}</b></Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Labour bill, M EUR / yr</Table.Td><Table.Td ta="right">{f(crew.cost, 3)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Round the clock (8760 h), people per post</Table.Td><Table.Td ta="right">{f(crew.roundTheClock, 3)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Choupo&apos;s positions for the same operators per shift (x 4.5)</Table.Td><Table.Td ta="right" data-engine-positions="">{f(enginePositions(p.operatorsPerShift), 1)}</Table.Td></Table.Tr>
            </Table.Tbody>
          </PanTable>
          <Text size="xs" c="dimmed" mt={4}>
            Try one, two and three shifts a day: the people per post fall from about {f(1 * 8 * p.daysPerYear / p.hoursPerOperatorYear, 2)} to {f(3 * 8 * p.daysPerYear / p.hoursPerOperatorYear, 2)} and the bill follows.
          </Text>
          <EngineBox id="labour" facts={[ENGINE_FACTS.positions, ENGINE_FACTS.operatorHours, ENGINE_FACTS.crew]} />
        </Box>

        {/* ---------------------------------------------------------------- 3 */}
        {step(3)}
        <Box data-section="depreciation">
          <OriginMark of={["page", "assumption"]} note="the classes, lives and residuals are illustrations: the tax rules of your country and year decide them" />
          <PanTable>
            <Table.Thead><Table.Tr><Table.Th>Asset class</Table.Th><Table.Th>Cost, M EUR</Table.Th><Table.Th>Life, yr</Table.Th><Table.Th>Residual, %</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {classes.map((k, idx) => (
                <Table.Tr key={idx}>
                  <Table.Td>{k.name}</Table.Td>
                  <Table.Td><Num label="" value={k.cost} step={1} w={90} onChange={(v) => setClasses(classes.map((x, j) => j === idx ? { ...x, cost: v } : x))} /></Table.Td>
                  <Table.Td><Num label="" value={k.life} step={1} w={80} onChange={(v) => setClasses(classes.map((x, j) => j === idx ? { ...x, life: Math.max(1, Math.round(v)) } : x))} /></Table.Td>
                  <Table.Td><Num label="" value={+(100 * k.residual).toFixed(2)} step={1} w={80} onChange={(v) => setClasses(classes.map((x, j) => j === idx ? { ...x, residual: Math.min(1, v / 100) } : x))} /></Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </PanTable>
          <Group mt={6} gap="md" align="flex-end" wrap="wrap">
            <Num label="One straight line over" unit="year (what Choupo does)" value={singleLife} step={1} w={190} onChange={(v) => setSingleLife(Math.max(1, Math.round(v)))} />
            <Text size="xs" c="dimmed">Tax rate {pc(p.tax, 0)} and discount rate {pc(p.rate, 1)} from step 5.</Text>
          </Group>
          <PanTable>
            <Table.Thead><Table.Tr><Table.Th>Year</Table.Th>
              {[1, 2, 3, 4, 5, 10, 11, 25].map((y) => <Table.Th key={y} ta="right">{y}</Table.Th>)}</Table.Tr></Table.Thead>
            <Table.Tbody data-depr="">
              <Table.Tr><Table.Td>By class, M EUR</Table.Td>{[1, 2, 3, 4, 5, 10, 11, 25].map((y) => <Table.Td key={y} ta="right">{f(dep.byClass[y - 1])}</Table.Td>)}</Table.Tr>
              <Table.Tr><Table.Td>One line, M EUR</Table.Td>{[1, 2, 3, 4, 5, 10, 11, 25].map((y) => <Table.Td key={y} ta="right">{f(dep.single[y - 1])}</Table.Td>)}</Table.Tr>
            </Table.Tbody>
          </PanTable>
          <Text size="sm" mt={4} data-depr-pv="">
            Present value of the tax saved, by class: <b>{f(dep.pvShieldClass, 3)} M EUR</b>; one line:{" "}
            <b>{f(dep.pvShieldSingle, 3)} M EUR</b>.  Left on the books after 25 years: {f(dep.bookClass, 2)} against {f(dep.bookSingle, 2)} M EUR (the residuals).
          </Text>
          <EngineBox id="depr" facts={[ENGINE_FACTS.straightLine, ENGINE_FACTS.otherDepreciation]} />
          <AbsenceBox ids={["classes"]} />
        </Box>

        {/* ---------------------------------------------------------------- 4 */}
        {step(4)}
        <Box data-section="breakeven">
          <OriginMark of={["page", "assumption"]} note="costs from step 1, sales at the price of step 1; NPV break-even from the cash flow of step 5" />
          <BreakEvenChart p={p} />
          <PanTable>
            <Table.Tbody data-breakeven="">
              <Table.Tr><Table.Td>Fixed part of the total cost (at 0 % sold), M EUR / yr</Table.Td><Table.Td ta="right">{f(be.fixed)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Part that grows to 100 %, M EUR / yr</Table.Td><Table.Td ta="right">{f(be.variableFull)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Sales at 100 %, M EUR / yr</Table.Td><Table.Td ta="right">{f(be.salesFull)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td><b>Break-even, accounting (with depreciation and financing)</b></Table.Td><Table.Td ta="right" data-be-acc=""><b>{pc(be.accounting)}</b></Table.Td></Table.Tr>
              <Table.Tr><Table.Td><b>Break-even, cash (without them)</b></Table.Td><Table.Td ta="right" data-be-cash=""><b>{pc(be.cash)}</b></Table.Td></Table.Tr>
              <Table.Tr><Table.Td><b>Break-even, NPV = 0 at the discount rate</b></Table.Td><Table.Td ta="right" data-be-npv=""><b>{pc(be.npv)}</b></Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Check: the NPV with that fraction put back, M EUR</Table.Td>
                <Table.Td ta="right" data-be-check="">{be.npv === null ? "—" : f(cashFlowOf({ ...p, load: be.npv }, route).npv, 6)}</Table.Td></Table.Tr>
            </Table.Tbody>
          </PanTable>
          <Text size="xs" c="dimmed" mt={4}>
            The sold quantity in step 1 is {pc(p.load, 0)} of the design production: the plant sits{" "}
            {be.npv !== null && p.load > be.npv ? "above" : "below"} its NPV break-even.
          </Text>
          <EngineBox id="breakEven" facts={[ENGINE_FACTS.breakEven]} />
        </Box>

        {/* ---------------------------------------------------------------- 5 */}
        {step(5)}
        <Box data-section="cashflow">
          <OriginMark of={["page", "assumption"]} note="the standard year-end discounted cash flow, as the engine's appraisal does it; the rates, tax and capital are illustrations" />
          <Group mt={6} gap="md" align="flex-end" wrap="wrap">
            <Num label="Working capital W" unit="M EUR" value={p.workingCapital} step={1} onChange={(v) => set("workingCapital", v)} />
            <Num label="Project life n" unit="year" value={p.life} step={1} onChange={(v) => set("life", Math.max(1, Math.round(v)))} />
            <Num label="Salvage" unit="% of I" value={+(100 * p.salvage).toFixed(2)} step={1} onChange={(v) => set("salvage", v / 100)} />
            <Num label="Tax rate" unit="%" value={+(100 * p.tax).toFixed(2)} step={1} onChange={(v) => set("tax", v / 100)} />
            <Num label="Discount rate i" unit="%" value={+(100 * p.rate).toFixed(3)} step={0.5} onChange={(v) => set("rate", v / 100)} />
            <NativeSelect size="xs" label="Cost route" description="itemised, or Choupo's COM_d" w={190} value={route}
              data={[{ value: "itemised", label: "itemised (step 1)" }, { value: "turton", label: "Choupo COM_d" }]}
              onChange={(e) => setRoute(e.currentTarget.value as CostRoute)} />
          </Group>
          <Group mt={6} gap="md" align="flex-end" wrap="wrap">
            <Num label="Component T1 (risk-free)" unit="%" value={+(100 * t1).toFixed(3)} step={0.5} onChange={(v) => setT1(v / 100)} w={170} />
            <Num label="Component T2 (risk premium)" unit="%" value={+(100 * t2).toFixed(3)} step={0.5} onChange={(v) => setT2(v / 100)} w={190} />
            <Num label="Inflation (current prices only)" unit="%" value={+(100 * infl).toFixed(3)} step={0.5} onChange={(v) => setInfl(v / 100)} w={200} />
            <Button size="xs" variant="light" onClick={() => set("rate", built)}>Use i = {pc(built, 2)}</Button>
          </Group>
          <Text size="xs" mt={4} data-rate="">
            (1 + {f(t1, 3)})(1 + {f(t2, 3)}) - 1 = <b>{pc(built, 2)}</b>; the same rate in current prices with {pc(infl, 1)} inflation:{" "}
            <b>{pc(nominalRate(built, infl), 2)}</b> (use it only if the flows are in current prices).
          </Text>
          <PanTable>
            <Table.Tbody data-cashflow="">
              <Table.Tr><Table.Td>Sales, M EUR / yr</Table.Td><Table.Td ta="right">{f(cfr.sales)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Cash cost of production, M EUR / yr</Table.Td><Table.Td ta="right">{f(cfr.cash)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Depreciation, M EUR / yr</Table.Td><Table.Td ta="right">{f(cfr.depreciation)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Taxable income, M EUR / yr</Table.Td><Table.Td ta="right">{f(cfr.sales - cfr.cash - cfr.depreciation)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Cash flow, years 1 to {Math.min(p.deprLife, p.life)} (after tax, depreciation added back)</Table.Td><Table.Td ta="right">{f(cfr.cf[1])}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Cash flow, last year (working capital and taxed salvage back)</Table.Td><Table.Td ta="right">{f(cfr.cf[p.life])}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Year 0: fixed capital and working capital</Table.Td><Table.Td ta="right">{f(cfr.cf[0])}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td><b>NPV at {pc(p.rate, 2)}, M EUR</b></Table.Td><Table.Td ta="right" data-npv=""><b>{f(cfr.npv)}</b></Table.Td></Table.Tr>
              <Table.Tr><Table.Td><b>IRR</b></Table.Td><Table.Td ta="right" data-irr=""><b>{cfr.irr === null ? "none" : pc(cfr.irr, 2)}</b></Table.Td></Table.Tr>
              <Table.Tr><Table.Td>Simple payback, year</Table.Td><Table.Td ta="right">{f(cfr.simplePayback)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td><b>Discounted payback, year</b></Table.Td><Table.Td ta="right" data-dpb=""><b>{f(cfr.discountedPayback)}</b></Table.Td></Table.Tr>
            </Table.Tbody>
          </PanTable>
          {cfr.irr !== null && cfr.irr > 2 && (
            <Alert mt="xs" color="orange" variant="light">
              An IRR above 200 % is a symptom: the cash flow dwarfs the investment, which points to a scale error upstream.
            </Alert>
          )}
          <EngineBox id="cf" facts={[ENGINE_FACTS.appraise, ENGINE_FACTS.taxable, ENGINE_FACTS.wcSalvage, ENGINE_FACTS.paybackDisc, ENGINE_FACTS.irrWarning]} />
        </Box>

        {/* ---------------------------------------------------------------- 6 */}
        {step(6)}
        <Box data-section="sensitivity">
          <OriginMark of={["page", "assumption"]} note="one input at a time on the cash flow of step 5; no probability is attached to any input" />
          <Group mt={6} gap="md" align="flex-end">
            <Num label="Relative step" unit="%" value={+(100 * delta).toFixed(2)} step={1} onChange={(v) => setDelta(Math.min(0.5, Math.max(0.01, v / 100)))} />
          </Group>
          <Tornado rows={sens} base={cfr.npv} />
          <PanTable>
            <Table.Thead><Table.Tr><Table.Th>Input</Table.Th><Table.Th ta="right">NPV at -step, M EUR</Table.Th><Table.Th ta="right">NPV at +step, M EUR</Table.Th>
              <Table.Th ta="right">Elasticity</Table.Th><Table.Th ta="right">Share of cash cost</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody data-sens="">
              {sens.map((r) => (
                <Table.Tr key={r.key} data-sens-row={r.key}>
                  <Table.Td>{r.label}{r.above10 ? " (above 10 % of the cost)" : ""}</Table.Td>
                  <Table.Td ta="right">{f(r.npvLow)}</Table.Td><Table.Td ta="right">{f(r.npvHigh)}</Table.Td>
                  <Table.Td ta="right">{f(r.elasticity)}</Table.Td>
                  <Table.Td ta="right">{r.costShare === null ? "—" : pc(r.costShare)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </PanTable>
          <Text size="xs" c="dimmed" mt={4}>
            Elasticity: per cent change of the NPV per per cent change of the input.  Fixed capital also moves the lines
            that rest on it (maintenance, taxes, insurance, depreciation).  One at a time is not risk: it ranks levers.
          </Text>
          <EngineBox id="sens" facts={[ENGINE_FACTS.sensitivity]} />
        </Box>

        {/* ---------------------------------------------------------------- 7 */}
        {step(7)}
        <Box data-section="market">
          <OriginMark of={["page", "assumption"]} note="arithmetic on the numbers you declare; the indices, the rate and the uplifts are illustrations. For the volume forecast see the demand-forecast page." />
          <Group mt={6} gap="md" align="flex-end" wrap="wrap">
            <Num label="Cost quoted" value={mk.cost} onChange={(v) => setMk({ ...mk, cost: v })} />
            <Num label="Index in the quotation year" value={mk.idxThen} onChange={(v) => setMk({ ...mk, idxThen: Math.max(1e-9, v) })} w={190} />
            <Num label="Index now" value={mk.idxNow} onChange={(v) => setMk({ ...mk, idxNow: v })} />
            <Num label="Amount to convert" value={mk.amount} onChange={(v) => setMk({ ...mk, amount: v })} w={170} />
            <Num label="Target units per source unit" value={mk.fx} step={0.05} onChange={(v) => setMk({ ...mk, fx: v })} w={200} />
          </Group>
          <Text size="sm" data-market-index="">
            Brought to today&apos;s level: {mk.cost} x {mk.idxNow} / {mk.idxThen} = <b>{f(actualised(mk.cost, mk.idxNow, mk.idxThen), 2)}</b>.
            Converted: {mk.amount} x {mk.fx} = <b>{f(converted(mk.amount, mk.fx), 2)}</b>.
          </Text>
          <Group mt={6} gap="md" align="flex-end" wrap="wrap">
            <Num label="Production" unit="tonne / yr" value={mk.prod} onChange={(v) => setMk({ ...mk, prod: v })} />
            <Num label="Imports" unit="tonne / yr" value={mk.imp} onChange={(v) => setMk({ ...mk, imp: v })} />
            <Num label="Exports" unit="tonne / yr" value={mk.exp} onChange={(v) => setMk({ ...mk, exp: v })} />
            <Num label="FOB price" value={mk.fob} step={10} onChange={(v) => setMk({ ...mk, fob: v })} />
            <Num label="Freight" unit="% of FOB" value={+(100 * mk.freight).toFixed(2)} step={1} onChange={(v) => setMk({ ...mk, freight: v / 100 })} />
            <Num label="Insurance" unit="% of FOB" value={+(100 * mk.insurance).toFixed(2)} step={0.5} onChange={(v) => setMk({ ...mk, insurance: v / 100 })} />
            <Num label="Raw material per unit sold" unit="EUR / unit" value={mk.rawPerUnit} step={0.1} w={180} onChange={(v) => setMk({ ...mk, rawPerUnit: v })} />
          </Group>
          <Text size="sm" mt={4} data-market-trade="">
            Apparent consumption = {mk.prod} + {mk.imp} - {mk.exp} = <b>{f(apparentConsumption(mk.prod, mk.imp, mk.exp), 1)}</b> tonne / yr.
            CIF = {mk.fob} x (1 + {f(mk.freight, 3)} + {f(mk.insurance, 3)}) = <b>{f(cifOf(mk.fob, mk.freight, mk.insurance), 2)}</b>.
            Unit gross margin = {f(p.price, 2)} - {f(mk.rawPerUnit, 2)} = <b>{f(mkt.margin, 2)} EUR per unit</b> ({pc(mkt.fraction)} of the price, price from step 1).
          </Text>
        </Box>

        {step(8)}

        <LessonQuiz title="Check your understanding" questions={PLANT_RUN_QUIZ} lesson={PLANT_RUN_STEPS} />

        <LessonLimits limits={PLANT_RUN_LIMITS} />

        <LessonReferences tool="plant-running-cost" />
      </Stack>
    </Box>
  );
}
