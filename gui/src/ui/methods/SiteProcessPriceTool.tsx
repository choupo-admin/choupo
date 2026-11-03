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
  SiteProcessPriceTool -- "Where to build it, what to make, and what it
  sells for" (commission C212, the market side).

  THE TASK (CLAUDE.md section 10): a student deciding where a plant goes,
  which patented route it runs and what the product earns at the plant gate
  declares the criteria, the example and the margins, and sees the ranking,
  the per-kg basis and the ex-factory price computed from them -- with every
  weight, margin and tax rate theirs, and none shipped.

  NO ENGINE RUN.  The arithmetic is siteProcessPriceMath.ts (React-free, held
  by tests/siteProcessPrice.test.ts); this file draws it.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import {
  Alert, Badge, Box, Button, Checkbox, Group, NativeSelect, NumberInput, Stack, Table, Text, TextInput, Title,
} from "@mantine/core";

import { LessonLimits, lessonStepper } from "./lessonStep.js";
import { LessonQuiz } from "./lessonQuiz.js";
import {
  SITE_PROCESS_PRICE_LIMITS, SITE_PROCESS_PRICE_QUIZ, SITE_PROCESS_PRICE_STEPS,
} from "./siteProcessPriceLesson.js";
import {
  PATENT_CHECKLIST, SITE_PROMPTS, chainDown, chainUp, flipTable, matrixStart, patentBasis,
  patentStart, rankOf, scoresWithWeight, stageProblem, stagesStart, weightedScores,
  leaderAtMultiple, type Criterion, type PatentExample, type Stage, type StageKind,
} from "./siteProcessPriceMath.js";
import { OriginMark } from "./origin.js";

const step = lessonStepper(SITE_PROCESS_PRICE_STEPS);

const f = (x: number | null | undefined, p = 2): string =>
  (x === null || x === undefined || !Number.isFinite(x) ? "—" : x.toFixed(p));

const INK = "var(--mantine-color-dimmed)";
const TEXTC = "var(--mantine-color-text)";
const COLOURS = ["#1971c2", "#e8590c", "#2f9e44", "#9c36b5", "#f08c00", "#0c8599"];

function Num({ label, value, onChange, unit, step: st = 1, min = 0, w = 120 }: {
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

/** Score of every site as the weight of one criterion sweeps from 0 upward. */
function SweepChart({ cs, sites, j }: { cs: readonly Criterion[]; sites: readonly string[]; j: number }): JSX.Element {
  const W = 520, H = 220, ML = 44, MR = 14, MT = 12, MB = 36;
  const xmax = Math.max(2 * cs[j]!.weight, 2);
  const N = 40;
  const series = sites.map((_, i) => {
    const pts: [number, number][] = [];
    for (let k = 0; k <= N; k++) {
      const x = (xmax * k) / N;
      const s = scoresWithWeight(cs, sites.length, j, x);
      pts.push([x, s ? s[i]! : NaN]);
    }
    return pts;
  });
  const all = series.flat().map((p) => p[1]).filter(Number.isFinite);
  const lo = Math.min(0, ...all), hi = Math.max(10, ...all);
  const sx = (x: number) => ML + (x / xmax) * (W - ML - MR);
  const sy = (y: number) => H - MB - ((y - lo) / (hi - lo || 1)) * (H - MT - MB);
  return (
    <Box data-chart="weight-sweep" style={{ maxWidth: W }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Weighted score of each site against the weight of one criterion">
        <line x1={ML} x2={W - MR} y1={H - MB} y2={H - MB} stroke={INK} strokeWidth={0.8} />
        <line x1={ML} x2={ML} y1={MT} y2={H - MB} stroke={INK} strokeWidth={0.8} />
        {[0, 0.5, 1].map((t) => (
          <text key={t} x={sx(t * xmax)} y={H - MB + 13} textAnchor="middle" fontSize={9} fill={INK}>{(t * xmax).toFixed(1)}</text>
        ))}
        {[lo, (lo + hi) / 2, hi].map((y, k) => (
          <text key={k} x={ML - 5} y={sy(y) + 3} textAnchor="end" fontSize={9} fill={INK}>{y.toFixed(1)}</text>
        ))}
        <text x={(ML + W - MR) / 2} y={H - 5} textAnchor="middle" fontSize={10} fill={TEXTC}>weight of “{cs[j]!.name}”</text>
        <text x={12} y={(MT + H - MB) / 2} fontSize={10} fill={TEXTC} textAnchor="middle"
          transform={`rotate(-90 12 ${(MT + H - MB) / 2})`}>weighted score</text>
        <line x1={sx(cs[j]!.weight)} x2={sx(cs[j]!.weight)} y1={MT} y2={H - MB} stroke={INK} strokeDasharray="4 3" strokeWidth={1} />
        {series.map((pts, i) => (
          <polyline key={i} fill="none" stroke={COLOURS[i % COLOURS.length]} strokeWidth={2}
            points={pts.filter((p) => Number.isFinite(p[1])).map((p) => `${sx(p[0])},${sy(p[1])}`).join(" ")} />
        ))}
      </svg>
      <Group gap="sm" mt={2}>
        {sites.map((s, i) => (
          <Group key={i} gap={4}><Box w={12} h={3} style={{ background: COLOURS[i % COLOURS.length] }} /><Text size="xs">{s}</Text></Group>
        ))}
        <Text size="xs" c="dimmed">dashed line: the weight you declared</Text>
      </Group>
    </Box>
  );
}

const KIND_LABELS: { value: StageKind; label: string }[] = [
  { value: "taxAdded", label: "tax added on top" },
  { value: "onSelling", label: "share of the price it sells at" },
  { value: "onCost", label: "markup on the price it pays" },
  { value: "fixed", label: "fixed amount per pack" },
];

export function SiteProcessPriceTool(): JSX.Element {
  const start = useMemo(() => matrixStart(), []);
  const [sites, setSites] = useState<string[]>(start.sites);
  const [cs, setCs] = useState<Criterion[]>(start.criteria);
  const [jSel, setJSel] = useState(0);
  const [ex, setEx] = useState<PatentExample>(patentStart());
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [stages, setStages] = useState<Stage[]>(stagesStart());
  const [shelf, setShelf] = useState(20);
  const [exNeed, setExNeed] = useState(12.968);

  const nS = sites.length;
  const sc = useMemo(() => weightedScores(cs, nS), [cs, nS]);
  const rank = sc ? rankOf(sc) : [];
  const flips = useMemo(() => flipTable(cs, nS), [cs, nS]);
  const jj = Math.min(jSel, cs.length - 1);
  const basis = useMemo(() => patentBasis(ex), [ex]);
  const down = useMemo(() => chainDown(shelf, stages), [shelf, stages]);
  const up = useMemo(() => chainUp(down.exFactory, stages), [down, stages]);
  const upNeed = useMemo(() => chainUp(exNeed, stages), [exNeed, stages]);
  const problems = stages.map(stageProblem);

  const setCrit = (j: number, c: Partial<Criterion>) => setCs((a) => a.map((x, k) => (k === j ? { ...x, ...c } : x)));
  const setScore = (j: number, i: number, v: number) =>
    setCs((a) => a.map((x, k) => (k === j ? { ...x, scores: x.scores.map((s, m) => (m === i ? v : s)) } : x)));
  const setStage = (k: number, s: Partial<Stage>) => setStages((a) => a.map((x, m) => (m === k ? { ...x, ...s } : x)));
  const setIn = (k: number, v: Partial<PatentExample["inputs"][number]>) =>
    setEx((e) => ({ ...e, inputs: e.inputs.map((x, m) => (m === k ? { ...x, ...v } : x)) }));

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>
        <Box>
          <Title order={4}>Where to build it, what to make, and what it sells for</Title>
          <Text size="sm" c="dimmed" mt={4}>
            The market-side decisions that come before the cost pages: a weighted choice of site and how fragile its
            ranking is, a patent example turned into a per-kilogram basis and a cycle time, and the margin chain between
            the shelf price and the ex-factory price, down and back up.  A pharmaceutical product is the example; the
            arithmetic is the same for any chemical.  Every weight, score, margin and tax rate is yours to declare.
          </Text>
          <Alert mt="sm" color="yellow" variant="light" title="Illustrations, not a market study" data-illustrations="">
            Every starting value on this page is an illustration: a round number that shows the arithmetic, not a
            figure about a place, a patent or a market.  Margins and taxes are shipped by nobody: read the regulation of
            your market and declare each with its source.  Nothing here is legal advice.
          </Alert>
        </Box>

        {/* ---------------------------------------------------------------- 1 */}
        {step(1)}
        <Box data-section="site">
          <OriginMark of={["page", "assumption"]} note="a weighted sum of your own scores; the sites, weights and scores are illustrations" />
          <Text size="xs" fw={700} mt={6}>Prompts: criteria to declare, with no number attached</Text>
          <Box data-prompts="" component="ul" m={0} pl="md">
            {SITE_PROMPTS.map((p) => (
              <li key={p.name}><Text size="xs"><b>{p.name}.</b> {p.ask}</Text></li>
            ))}
          </Box>
          <PanTable>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Criterion</Table.Th><Table.Th>Weight</Table.Th>
                {sites.map((s, i) => (
                  <Table.Th key={i}>
                    <TextInput size="xs" value={s} w={110}
                      onChange={(e) => { const v = e.currentTarget.value; setSites((a) => a.map((x, m) => (m === i ? v : x))); }} />
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody data-matrix="">
              {cs.map((c, j) => (
                <Table.Tr key={j}>
                  <Table.Td>
                    <TextInput size="xs" value={c.name} w={230} onChange={(e) => setCrit(j, { name: e.currentTarget.value })} />
                  </Table.Td>
                  <Table.Td><Num label="" value={c.weight} step={0.5} w={80} onChange={(v) => setCrit(j, { weight: v })} /></Table.Td>
                  {sites.map((_, i) => (
                    <Table.Td key={i}><Num label="" value={c.scores[i] ?? 0} step={1} w={80} onChange={(v) => setScore(j, i, Math.min(10, v))} /></Table.Td>
                  ))}
                </Table.Tr>
              ))}
              <Table.Tr data-scores="">
                <Table.Td colSpan={2}><b>Weighted score (0 to 10)</b></Table.Td>
                {sites.map((_, i) => (
                  <Table.Td key={i} ta="right"><b>{sc ? f(sc[i], 3) : "—"}</b></Table.Td>
                ))}
              </Table.Tr>
              <Table.Tr data-rank="">
                <Table.Td colSpan={2}>Rank</Table.Td>
                {sites.map((_, i) => (
                  <Table.Td key={i} ta="right">{sc ? rank.indexOf(i) + 1 : "—"}</Table.Td>
                ))}
              </Table.Tr>
            </Table.Tbody>
          </PanTable>
          <Group mt={6} gap="xs">
            <Button size="xs" variant="light" disabled={cs.length >= 8}
              onClick={() => setCs((a) => [...a, { name: "New criterion", weight: 1, scores: sites.map(() => 5) }])}>Add criterion</Button>
            <Button size="xs" variant="light" disabled={cs.length <= 1}
              onClick={() => setCs((a) => a.slice(0, -1))}>Remove last criterion</Button>
            <Button size="xs" variant="light" disabled={nS >= 5}
              onClick={() => { setSites((a) => [...a, `Site ${String.fromCharCode(65 + a.length)}`]); setCs((a) => a.map((c) => ({ ...c, scores: [...c.scores, 5] }))); }}>Add site</Button>
            <Button size="xs" variant="light" disabled={nS <= 2}
              onClick={() => { setSites((a) => a.slice(0, -1)); setCs((a) => a.map((c) => ({ ...c, scores: c.scores.slice(0, -1) }))); }}>Remove last site</Button>
          </Group>
        </Box>

        {/* ---------------------------------------------------------------- 2 */}
        {step(2)}
        <Box data-section="sensitivity">
          <OriginMark of={["page", "assumption"]} note="one weight moved at a time, the others held; no probability is attached to any weight" />
          <PanTable>
            <Table.Thead><Table.Tr>
              <Table.Th>Criterion</Table.Th><Table.Th ta="right">Your weight</Table.Th>
              <Table.Th ta="right">Leader is overtaken at weight</Table.Th><Table.Th>By</Table.Th>
              <Table.Th>Leader at weight x 0 / 0.5 / 1 / 1.5 / 2</Table.Th>
            </Table.Tr></Table.Thead>
            <Table.Tbody data-flips="">
              {flips.map((r, j) => (
                <Table.Tr key={j} data-flip-row={j}>
                  <Table.Td>{r.criterion}</Table.Td>
                  <Table.Td ta="right">{f(r.weight, 2)}</Table.Td>
                  <Table.Td ta="right">{r.flipAt === null ? "never" : f(r.flipAt, 3)}</Table.Td>
                  <Table.Td>{r.by === null ? "—" : sites[r.by]}</Table.Td>
                  <Table.Td>{[0, 0.5, 1, 1.5, 2].map((m) => {
                    const l = leaderAtMultiple(cs, nS, j, m);
                    return l === null ? "—" : sites[l];
                  }).join(" / ")}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </PanTable>
          <Group mt={6} align="flex-end">
            <NativeSelect size="xs" label="Plot the sweep of" w={280} value={String(jj)}
              data={cs.map((c, j) => ({ value: String(j), label: c.name }))}
              onChange={(e) => setJSel(Number(e.currentTarget.value))} />
          </Group>
          {sc && <SweepChart cs={cs} sites={sites} j={jj} />}
          <Text size="xs" c="dimmed" mt={4}>
            A weight close to “overtaken at” means the choice rests on it.  One weight at a time is not a measure of
            uncertainty: it ranks the weights you should defend.
          </Text>
        </Box>

        {/* ---------------------------------------------------------------- 3 */}
        {step(3)}
        <Box data-section="patent-method">
          <OriginMark of={["page", "assumption"]} note="a reading method, not a source; the page cites no patent and invents no number" />
          <Box data-checklist="" mt={6}>
            <Stack gap={4}>
              {PATENT_CHECKLIST.map((c) => (
                <Checkbox key={c.id} size="xs" label={c.text} checked={!!ticked[c.id]}
                  onChange={(e) => { const v = e.currentTarget.checked; setTicked((t) => ({ ...t, [c.id]: v })); }} />
              ))}
            </Stack>
            <Text size="xs" c="dimmed" mt={4} data-ticked="">
              {PATENT_CHECKLIST.filter((c) => ticked[c.id]).length} of {PATENT_CHECKLIST.length} steps done.
            </Text>
          </Box>
        </Box>

        {/* ---------------------------------------------------------------- 4 */}
        {step(4)}
        <Box data-section="patent-basis">
          <OriginMark of={["page", "assumption"]} note="the example below is invented; copy yours from the patent, with its example number" />
          <PanTable>
            <Table.Thead><Table.Tr><Table.Th>Charged</Table.Th><Table.Th>Role</Table.Th><Table.Th ta="right">kg</Table.Th><Table.Th ta="right">kg per kg of product</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody data-patent-inputs="">
              {ex.inputs.map((inp, k) => (
                <Table.Tr key={k}>
                  <Table.Td><TextInput size="xs" value={inp.name} w={170} onChange={(e) => setIn(k, { name: e.currentTarget.value })} /></Table.Td>
                  <Table.Td><NativeSelect size="xs" w={120} value={inp.role}
                    data={["reactant", "reagent", "solvent", "work-up"]}
                    onChange={(e) => setIn(k, { role: e.currentTarget.value as typeof inp.role })} /></Table.Td>
                  <Table.Td><Num label="" value={inp.kg} step={1} w={90} onChange={(v) => setIn(k, { kg: v })} /></Table.Td>
                  <Table.Td ta="right">{basis ? f(basis.perKg[k]!.kgPerKg, 3) : "—"}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </PanTable>
          <Group mt={6} gap="md" align="flex-end" wrap="wrap">
            <Num label="Isolated product" unit="kg" value={ex.productKg} step={0.5} onChange={(v) => setEx((e) => ({ ...e, productKg: v }))} />
            <Num label="Limiting reactant charged" unit="mol" value={ex.limitingMol} step={1} w={170} onChange={(v) => setEx((e) => ({ ...e, limitingMol: v }))} />
            <Num label="Molar mass of product" unit="kg per mol" value={ex.productMw} step={0.01} w={170} onChange={(v) => setEx((e) => ({ ...e, productMw: v }))} />
          </Group>
          {basis && (
            <Text size="sm" mt={6} data-basis="">
              Total charged = <b>{f(basis.totalIn, 2)}</b> kg.  PMI = {f(basis.totalIn, 2)} / {f(ex.productKg, 2)} = <b>{f(basis.pmi, 2)}</b> kg per kg.
              E-factor = <b>{f(basis.eFactor, 2)}</b>.  Theoretical product = {f(ex.limitingMol, 1)} x {f(ex.productMw, 3)} = {f(basis.theoreticalKg, 2)} kg;
              yield = <b>{f(100 * basis.yieldFraction, 1)} %</b>.
            </Text>
          )}
        </Box>

        {/* ---------------------------------------------------------------- 5 */}
        {step(5)}
        <Box data-section="patent-cycle">
          <OriginMark of={["page", "assumption"]} note="times are the example's reaction time and your declared work-up and cleaning; a bookkeeping scale-up" />
          <Group mt={6} gap="md" align="flex-end" wrap="wrap">
            <Num label="Reaction time" unit="hour" value={ex.reactionH} step={0.5} onChange={(v) => setEx((e) => ({ ...e, reactionH: v }))} />
            <Num label="Work-up time" unit="hour" value={ex.workupH} step={0.5} onChange={(v) => setEx((e) => ({ ...e, workupH: v }))} />
            <Num label="Cleaning / turnaround" unit="hour" value={ex.cleaningH} step={0.5} w={160} onChange={(v) => setEx((e) => ({ ...e, cleaningH: v }))} />
            <Num label="Target batch of product" unit="kg" value={ex.targetKg} step={10} w={170} onChange={(v) => setEx((e) => ({ ...e, targetKg: v }))} />
          </Group>
          {basis && (
            <Box data-cycle="">
              <Text size="sm" mt={6}>
                Cycle = {f(ex.reactionH, 1)} + {f(ex.workupH, 1)} + {f(ex.cleaningH, 1)} = <b>{f(basis.cycleH, 1)}</b> h;
                product per hour = <b>{f(basis.kgPerH, 3)}</b> kg per h.  Scale factor = {f(ex.targetKg, 1)} / {f(ex.productKg, 2)} = <b>{f(basis.scale, 3)}</b>.
              </Text>
              <PanTable>
                <Table.Thead><Table.Tr><Table.Th>Charged</Table.Th><Table.Th ta="right">kg at the target batch</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>
                  {basis.scaled.map((s, k) => (
                    <Table.Tr key={k}><Table.Td>{s.name}</Table.Td><Table.Td ta="right">{f(s.kg, 2)}</Table.Td></Table.Tr>
                  ))}
                </Table.Tbody>
              </PanTable>
            </Box>
          )}
        </Box>

        {/* ---------------------------------------------------------------- 6 */}
        {step(6)}
        <Box data-section="chain-down">
          <OriginMark of={["page", "assumption"]} note="every stage, its kind and its value are your declared inputs; the starting stages are illustrations, not any market's" />
          <Alert mt="xs" color="blue" variant="light" data-declare="">
            Read the regulation of your market and declare each stage with its source.  The page ships no margin and no tax rate.
          </Alert>
          <PanTable>
            <Table.Thead><Table.Tr><Table.Th>Stage (from the shelf down)</Table.Th><Table.Th>How it takes its share</Table.Th><Table.Th>Value</Table.Th><Table.Th>Check</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody data-stages="">
              {stages.map((s, k) => (
                <Table.Tr key={k}>
                  <Table.Td><TextInput size="xs" w={190} value={s.name} onChange={(e) => setStage(k, { name: e.currentTarget.value })} /></Table.Td>
                  <Table.Td><NativeSelect size="xs" w={250} value={s.kind} data={KIND_LABELS}
                    onChange={(e) => setStage(k, { kind: e.currentTarget.value as StageKind })} /></Table.Td>
                  <Table.Td><Num label="" value={s.value} step={s.kind === "fixed" ? 0.1 : 0.01} min={-1e9} w={100} onChange={(v) => setStage(k, { value: v })} /></Table.Td>
                  <Table.Td>{problems[k] ? <Badge color="red" variant="light">{problems[k]}</Badge> : <Text size="xs" c="dimmed">{s.kind === "fixed" ? "currency per pack" : "as a fraction, 0.2 = 20 %"}</Text>}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </PanTable>
          <Group mt={6} gap="xs">
            <Button size="xs" variant="light" disabled={stages.length >= 8}
              onClick={() => setStages((a) => [...a, { name: "New stage", kind: "onSelling", value: 0 }])}>Add stage</Button>
            <Button size="xs" variant="light" disabled={stages.length <= 1}
              onClick={() => setStages((a) => a.slice(0, -1))}>Remove last stage</Button>
          </Group>
          <Group mt={6} gap="md" align="flex-end">
            <Num label="Shelf price" unit="currency per pack" value={shelf} step={0.5} w={170} onChange={setShelf} />
          </Group>
          <PanTable>
            <Table.Thead><Table.Tr><Table.Th>Stage</Table.Th><Table.Th ta="right">Price above</Table.Th><Table.Th ta="right">Takes</Table.Th><Table.Th ta="right">Price below</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody data-chain-down="">
              {down.rows.map((r, k) => (
                <Table.Tr key={k}><Table.Td>{r.stage}</Table.Td><Table.Td ta="right">{f(r.priceBefore, 4)}</Table.Td>
                  <Table.Td ta="right">{f(r.taken, 4)}</Table.Td><Table.Td ta="right">{f(r.priceAfter, 4)}</Table.Td></Table.Tr>
              ))}
            </Table.Tbody>
          </PanTable>
          <Text size="sm" mt={4} data-exfactory="">
            Ex-factory price = <b>{f(down.exFactory, 4)}</b> per pack, which is {f(100 * down.exFactory / (shelf || 1), 1)} % of the shelf price.
          </Text>
        </Box>

        {/* ---------------------------------------------------------------- 7 */}
        {step(7)}
        <Box data-section="chain-up">
          <OriginMark of={["page", "assumption"]} note="the same declared stages, walked in reverse" />
          <Text size="sm" mt={6} data-roundtrip="">
            Round trip: from the ex-factory price {f(down.exFactory, 4)} back up the chain gives a shelf price of <b>{f(up.shelf, 4)}</b>,
            against the {f(shelf, 4)} you started from (difference {Math.abs(up.shelf - shelf).toExponential(1)}).
          </Text>
          <Group mt={6} gap="md" align="flex-end">
            <Num label="Ex-factory price the plant needs" unit="currency per pack" value={exNeed} step={0.5} w={220} onChange={setExNeed} />
          </Group>
          <PanTable>
            <Table.Thead><Table.Tr><Table.Th>Stage (from the plant gate up)</Table.Th><Table.Th ta="right">Price below</Table.Th><Table.Th ta="right">Adds</Table.Th><Table.Th ta="right">Price above</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody data-chain-up="">
              {upNeed.rows.map((r, k) => (
                <Table.Tr key={k}><Table.Td>{r.stage}</Table.Td><Table.Td ta="right">{f(r.priceBefore, 4)}</Table.Td>
                  <Table.Td ta="right">{f(r.taken, 4)}</Table.Td><Table.Td ta="right">{f(r.priceAfter, 4)}</Table.Td></Table.Tr>
              ))}
            </Table.Tbody>
          </PanTable>
          <Text size="sm" mt={4} data-shelf-needed="">
            To receive {f(exNeed, 4)} at the plant gate the shelf price must be <b>{f(upNeed.shelf, 4)}</b> per pack.
            Compare it with the going price of the competing products: if it is far above, the plant cannot pay with these margins.
          </Text>
        </Box>

        {step(8)}

        <LessonQuiz title="Check your understanding" questions={SITE_PROCESS_PRICE_QUIZ} lesson={SITE_PROCESS_PRICE_STEPS} />

        <LessonLimits limits={SITE_PROCESS_PRICE_LIMITS} />
      </Stack>
    </Box>
  );
}
