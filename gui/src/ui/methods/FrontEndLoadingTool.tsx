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
  FrontEndLoadingTool -- "Front-End Loading: how industry stages a design"
  (commission C58).

  NO ENGINE RUN, AND THAT IS A DECISION, NOT AN OMISSION.  The page's live
  content is the AACE range of ranges and the decision it supports, which is
  arithmetic on a published table; no simulator computes an estimate band.
  The plant cases that show Choupo at each stage's fidelity are named and
  linked, not run: the heaviest (greenAmmoniaIndustrialN2, seventeen units,
  two recycles, costing and DCF) is a whole plant, and running it to show a
  number the page does not need would teach the wait, not the stage.  The
  C57 stage cases (greenAmmoniaFeasibility, its 50 bar variant and
  greenAmmoniaBasicDesign) exist since 2026-10-10 and are linked from
  FEL_STAGES; none is wired as a live witness.

  THE DATA AND THE ARITHMETIC are in frontEndLoading.ts and the prose in
  frontEndLoadingLesson.ts, both React-free and both held to the tree by
  tests/frontEndLoading.test.ts.

  THE CHART is inline SVG: one row per class, Class 5 at the top, the
  PESSIMISTIC band drawn pale and wide, the OPTIMISTIC band drawn solid and
  narrow inside it, the point estimate as a tick.  Two options take two hues
  and are ALSO labelled A and B on every row, because colour alone is not
  identity; the table beside it is the same numbers in a form that does not
  need the picture.  The hues are Mantine blue-6 (#228be6) and orange-8
  (#e8590c), and ONE pair serves both colour schemes: run through the dataviz
  palette validator (lightness band, chroma floor, CVD separation,
  normal-vision floor, 3:1 contrast) against the light body (#ffffff) and the
  dark one (#172123, graphite dark-7), it passes every check in both.  The
  first pick, orange-6 (#fd7e14), was too light for the dark band (OKLCH L
  0.727 > 0.67, FAILED) and under 3:1 on white (2.5:1, WARN); orange-7 still
  fails the dark band (0.685).  Re-run the validator before changing either.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Anchor, Badge, Box, Group, SegmentedControl, Stack, Table, Text, Title,
} from "@mantine/core";

import { KnobField, KnobNumber, PanelNote } from "./knobPanel.js";
import { LessonLimits, LessonStepView, Tex } from "./lessonStep.js";
import { FEL_LIMITS, FEL_STEPS } from "./frontEndLoadingLesson.js";
import {
  AACE_CLASSES, DELIVERABLE_ROWS, FEL_NUMBERINGS, FEL_STAGES,
  HIGH_RANGE_MULTIPLIERS, bandOf, decide, firstSeparatingClass,
  separatingRatio, type Band, type Corner, type FelStage,
  type HighRangeMultiplier,
} from "./frontEndLoading.js";
import {
  METHOD_TOOLS, setActiveMethodTool, type MethodToolId,
} from "./registry.js";

const INK = "var(--mantine-color-dimmed)";
const TEXT = "var(--mantine-color-text)";
const GRID = "var(--mantine-color-default-border)";
const HUE_A = "var(--mantine-color-blue-6)";
const HUE_B = "var(--mantine-color-orange-8)";

/** Defaults: round numbers, labelled as such on the page. */
export const DEFAULT_POINT = 100;
export const DEFAULT_A = 100;
export const DEFAULT_B = 140;

const step = (n: number) => {
  const s = FEL_STEPS.find((q) => q.n === n);
  return s ? <LessonStepView key={n} step={s} /> : null;
};

const pct = (v: number): string => (v > 0 ? `+${v}` : `${v}`);
const money = (v: number): string =>
  Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2);

// ---- the band chart --------------------------------------------------------

interface ChartOption {
  key: string;
  color: string;
  point: number;
  outer: Band;
  inner: Band;
}

interface ChartRow { cls: number; options: ChartOption[]; note?: string }

/** Ticks at a round step covering [lo, hi]. */
function ticks(lo: number, hi: number): number[] {
  const span = Math.max(hi - lo, 1e-9);
  const raw = span / 6;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const stepV = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let t = Math.ceil(lo / stepV) * stepV; t <= hi + 1e-9; t += stepV)
    out.push(Number(t.toPrecision(10)));
  return out;
}

function BandChart({ rows, unit, ariaLabel }: {
  rows: ChartRow[]; unit: string; ariaLabel: string;
}): JSX.Element {
  const W = 680, Lm = 74, Rm = 96, Tm = 8, Bm = 34;
  const perOpt = 16, rowGap = 12;
  const nOpt = Math.max(1, ...rows.map((r) => r.options.length));
  const rowH = nOpt * perOpt + rowGap;
  const H = Tm + rows.length * rowH + Bm;
  const all = rows.flatMap((r) => r.options.flatMap((o) => [o.outer.lo, o.outer.hi]));
  const lo = Math.min(0, ...all), hi = Math.max(...all);
  const x = (v: number) => Lm + ((v - lo) / (hi - lo || 1)) * (W - Lm - Rm);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
      aria-label={ariaLabel} preserveAspectRatio="xMidYMid meet"
      style={{ maxWidth: W, display: "block" }}>
      {ticks(lo, hi).map((t) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={Tm} y2={H - Bm}
            stroke={GRID} strokeWidth={1} />
          <text x={x(t)} y={H - Bm + 14} fontSize={10} fill={INK}
            textAnchor="middle">{t}</text>
        </g>
      ))}
      <text x={(Lm + W - Rm) / 2} y={H - 4} fontSize={11} fill={INK}
        textAnchor="middle">cost [{unit}]</text>
      {rows.map((r, i) => {
        const y0 = Tm + i * rowH;
        return (
          <g key={r.cls}>
            <text x={8} y={y0 + (nOpt * perOpt) / 2 + 4} fontSize={11}
              fill={TEXT} fontWeight={600}>Class {r.cls}</text>
            {r.options.map((o, k) => {
              const yy = y0 + k * perOpt;
              const title = `Class ${r.cls}, option ${o.key}: optimistic `
                + `${money(o.inner.lo)}–${money(o.inner.hi)}, pessimistic `
                + `${money(o.outer.lo)}–${money(o.outer.hi)} ${unit}`;
              return (
                <g key={o.key}>
                  <title>{title}</title>
                  <rect x={x(o.outer.lo)} y={yy + 2}
                    width={Math.max(1, x(o.outer.hi) - x(o.outer.lo))}
                    height={perOpt - 4} rx={4} fill={o.color} opacity={0.28} />
                  <rect x={x(o.inner.lo)} y={yy + 4}
                    width={Math.max(1, x(o.inner.hi) - x(o.inner.lo))}
                    height={perOpt - 8} rx={3} fill={o.color} opacity={0.9} />
                  <line x1={x(o.point)} x2={x(o.point)} y1={yy}
                    y2={yy + perOpt} stroke={TEXT} strokeWidth={2} />
                  {nOpt > 1 && (
                    <text x={x(o.outer.lo) - 4} y={yy + perOpt - 4}
                      fontSize={10} fill={TEXT} textAnchor="end">{o.key}</text>
                  )}
                </g>
              );
            })}
            {r.note && (
              <text x={W - Rm + 8} y={y0 + (nOpt * perOpt) / 2 + 4}
                fontSize={10} fill={INK}>{r.note}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function ChartKey(): JSX.Element {
  return (
    <Text size="xs" c="dimmed" mt={4}>
      Pale bar: the PESSIMISTIC end of the class's range of ranges.  Solid
      bar: the OPTIMISTIC end.  Tick: the point estimate.  Hover a bar for its
      numbers.
    </Text>
  );
}

// ---- the stage-gate strip ------------------------------------------------

function StageStrip({ active, onPick }: {
  active: FelStage["id"]; onPick: (id: FelStage["id"]) => void;
}): JSX.Element {
  return (
    <Box style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch",
      gap: 6 }}>
      {FEL_STAGES.map((s, i) => (
        <Box key={s.id} style={{ display: "flex", alignItems: "center", gap: 6,
          flex: "1 1 150px", minWidth: 0 }}>
          <Box component="button" type="button" onClick={() => onPick(s.id)}
            aria-pressed={active === s.id}
            style={{
              flex: 1, minWidth: 0, textAlign: "left", cursor: "pointer",
              padding: "6px 8px", borderRadius: 6, background: "transparent",
              color: "inherit", font: "inherit",
              border: `${active === s.id ? 2 : 1}px solid ${
                active === s.id ? "var(--mantine-color-accent-5)" : GRID}`,
            }}>
            <Text size="xs" c="dimmed">AACE Class {s.aace}</Text>
            <Text size="sm" fw={600} style={{ lineHeight: 1.25 }}>
              {s.names.split(" (")[0]}
            </Text>
          </Box>
          {i < FEL_STAGES.length - 1 && (
            <Text size="xs" c="dimmed" title="a gate: the owner decides whether the project goes on"
              style={{ whiteSpace: "nowrap" }}>◆ gate</Text>
          )}
        </Box>
      ))}
    </Box>
  );
}

function ToolLink({ id }: { id: string }): JSX.Element {
  const t = METHOD_TOOLS.find((m) => m.id === id);
  return (
    <Anchor component="button" type="button" size="sm"
      onClick={() => setActiveMethodTool(id as MethodToolId)}>
      {t ? t.label : id}
    </Anchor>
  );
}

function StageDetail({ s }: { s: FelStage }): JSX.Element {
  const row = (k: string, v: React.ReactNode) => (
    <Table.Tr key={k}>
      <Table.Td style={{ width: 170, verticalAlign: "top" }}>
        <Text size="sm" fw={600}>{k}</Text>
      </Table.Td>
      <Table.Td><Text size="sm">{v}</Text></Table.Td>
    </Table.Tr>
  );
  return (
    <Table withTableBorder withColumnBorders fz="sm" mt={8}>
      <Table.Tbody>
        {row("Names", s.names)}
        {row("AACE estimate class", s.aace)}
        {row("What it decides", s.decides)}
        {row("Simulation fidelity", s.fidelity)}
        {row("Deliverables", s.deliverables)}
        {row("What Choupo runs", s.choupo)}
        {row("Cases", s.choupoCases.length === 0 ? "—" : (
          <>{s.choupoCases.map((c, i) => (
            <span key={c}>{i > 0 ? ", " : ""}<code>tutorials/{c}</code></span>
          ))}</>
        ))}
        {row("EduTools", s.choupoTools.length === 0 ? "—" : (
          <>{s.choupoTools.map((id, i) => (
            <span key={id}>{i > 0 ? " · " : ""}<ToolLink id={id} /></span>
          ))}</>
        ))}
        {row("Not produced by Choupo", s.notChoupo)}
      </Table.Tbody>
    </Table>
  );
}

// ---- the page --------------------------------------------------------------

function MultiplierControl({ value, onChange }: {
  value: HighRangeMultiplier; onChange: (m: HighRangeMultiplier) => void;
}): JSX.Element {
  return (
    <KnobField label="high range multiplied by (weak project system: 2 to 3)">
      <SegmentedControl size="xs" fullWidth value={String(value)}
        data={HIGH_RANGE_MULTIPLIERS.map((m) => ({ value: String(m),
          label: m === 1 ? "× 1 (as printed)" : `× ${m}` }))}
        onChange={(v) => onChange(Number(v) as HighRangeMultiplier)} />
    </KnobField>
  );
}

export function FrontEndLoadingTool(): JSX.Element {
  const [stage, setStage] = useState<FelStage["id"]>("feasibility");
  const [point, setPoint] = useState(DEFAULT_POINT);
  const [mult1, setMult1] = useState<HighRangeMultiplier>(1);
  const [costA, setCostA] = useState(DEFAULT_A);
  const [costB, setCostB] = useState(DEFAULT_B);
  const [corner, setCorner] = useState<Corner>("pessimistic");
  const [mult2, setMult2] = useState<HighRangeMultiplier>(1);

  const rangeRows: ChartRow[] = useMemo(() => AACE_CLASSES.map((row) => ({
    cls: row.cls,
    options: [{ key: "C", color: HUE_A, point,
      outer: bandOf(point, row, "pessimistic", mult1),
      inner: bandOf(point, row, "optimistic", mult1) }],
  })), [point, mult1]);

  const verdicts = useMemo(() => decide(costA, costB, corner, mult2),
    [costA, costB, corner, mult2]);
  const first = firstSeparatingClass(costA, costB, corner, mult2);
  const decisionRows: ChartRow[] = AACE_CLASSES.map((row, i) => ({
    cls: row.cls,
    note: verdicts[i]!.separated ? "separated" : "inside the band",
    options: [
      { key: "A", color: HUE_A, point: costA,
        outer: verdicts[i]!.a, inner: verdicts[i]!.a },
      { key: "B", color: HUE_B, point: costB,
        outer: verdicts[i]!.b, inner: verdicts[i]!.b },
    ],
  }));
  const active = FEL_STAGES.find((s) => s.id === stage)!;

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>
        <Box>
          <Title order={4}>Front-End Loading: how industry stages a design</Title>
          <Text size="sm" c="dimmed" mt={4}>
            How an owner buys a process design in stages, what each stage
            decides and at what simulation fidelity, how good the cost
            estimate is at each gate, and why two options whose difference
            lies inside that band are not yet decided.  Every claim on this
            page comes from one research record,{" "}
            <code>docs/design/how-a-process-design-is-staged.md</code>, which
            cites a retrieved source for each.
          </Text>
        </Box>

        {step(1)}

        <Box>
          <Title order={5}>The stages, and the gates between them</Title>
          <Text size="sm" mt={4}>
            Click a stage.  Each row of the table is the research record's
            stage table (§2.3), with what Choupo runs at that fidelity added.
          </Text>
          <Box mt={8}><StageStrip active={stage} onPick={setStage} /></Box>
          <StageDetail s={active} />
        </Box>

        {step(2)}

        <Box style={{ display: "grid", gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          {FEL_NUMBERINGS.map((nb) => (
            <Box key={nb.source}>
              <Text size="xs" c="dimmed" mb={4}>{nb.source}</Text>
              <Table withTableBorder fz="sm">
                <Table.Tbody>
                  {nb.stages.map((s) => (
                    <Table.Tr key={s.label}>
                      <Table.Td style={{ width: 70 }}><b>{s.label}</b></Table.Td>
                      <Table.Td>{s.name}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Box>
          ))}
        </Box>

        {step(3)}
        {step(4)}

        <Box>
          <Title order={5}>Draw the range of ranges</Title>
          <Text size="sm" mt={4}>
            Type a point estimate.  Each class draws both ends of its range of
            ranges around it.  Look for a pale bar of one class that is no
            wider than the solid bar of the class above it.
          </Text>
          <Box mt={8} style={{ display: "grid", gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            <KnobNumber label="point estimate C [M€]" value={point} min={1}
              max={100000} step={10} onChange={setPoint} />
            <MultiplierControl value={mult1} onChange={setMult1} />
          </Box>
          <Box mt={10}>
            <BandChart rows={rangeRows} unit="M€"
              ariaLabel="the AACE accuracy band of each class around one point estimate" />
            <ChartKey />
          </Box>
          <Box style={{ overflowX: "auto" }}>
          <Table striped withTableBorder withColumnBorders fz="xs" mt={10}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>class</Table.Th>
                <Table.Th>definition complete</Table.Th>
                <Table.Th>end usage</Table.Th>
                <Table.Th>typical method</Table.Th>
                <Table.Th>low range L</Table.Th>
                <Table.Th>high range H</Table.Th>
                <Table.Th>band at the optimistic end [M€]</Table.Th>
                <Table.Th>band at the pessimistic end [M€]</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {AACE_CLASSES.map((r, i) => {
                const o = rangeRows[i]!.options[0]!;
                return (
                  <Table.Tr key={r.cls}>
                    <Table.Td><b>{r.cls}</b></Table.Td>
                    <Table.Td>{r.maturityLo} to {r.maturityHi} %</Table.Td>
                    <Table.Td>{r.endUsage}</Table.Td>
                    <Table.Td>{r.methodology}</Table.Td>
                    <Table.Td style={{ whiteSpace: "nowrap" }}>
                      {pct(r.accLoNarrow)} to {pct(r.accLoWide)} %</Table.Td>
                    <Table.Td style={{ whiteSpace: "nowrap" }}>
                      {pct(r.accHiNarrow)} to {pct(r.accHiWide)} %</Table.Td>
                    <Table.Td>{money(o.inner.lo)} – {money(o.inner.hi)}</Table.Td>
                    <Table.Td>{money(o.outer.lo)} – {money(o.outer.hi)}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
          </Box>
          <PanelNote>
            AACE International Recommended Practice 18R-97, Table 1 (rev.
            2020-08-07), as transcribed in the engine's one home for it,{" "}
            <code>src/postProcessing/EstimateClass.H</code>; this page's copy
            is held to that file by its test.  The multiplier applies the
            2020 revision's warning to the HIGH side only, as the standard
            states it.
          </PanelNote>
        </Box>

        {step(5)}

        <Box style={{ overflowX: "auto" }}>
        <Table striped withTableBorder withColumnBorders fz="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>deliverable</Table.Th>
              {AACE_CLASSES.map((r) => <Table.Th key={r.cls}>Class {r.cls}</Table.Th>)}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {DELIVERABLE_ROWS.map((d) => (
              <Table.Tr key={d.name}>
                <Table.Td>{d.name}</Table.Td>
                {d.byClass.map((v, i) => <Table.Td key={i}>{v}</Table.Td>)}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        </Box>
        <Text size="xs" c="dimmed">
          AACE 18R-97 Figure 4 (2005 revision), six of its sixteen rows.
          —: not begun; S: started; P: preliminary; C: complete.
        </Text>

        {step(6)}

        <Box>
          <Title order={5}>Two options: when does the estimate decide?</Title>
          <Text size="sm" mt={4}>
            Give two options a point estimate each, for example two routes
            or two loop pressures.  Walk down the classes and watch where the
            two bands stop overlapping.  Then change the corner: the class at
            which the decision becomes defensible depends on where in the
            range of ranges the project sits.
          </Text>
          <Box mt={8} style={{ display: "grid", gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <KnobNumber label="option A, point estimate [M€]" value={costA}
              min={1} max={100000} step={5} onChange={setCostA} />
            <KnobNumber label="option B, point estimate [M€]" value={costB}
              min={1} max={100000} step={5} onChange={setCostB} />
            <KnobField label="end of the range of ranges">
              <SegmentedControl size="xs" fullWidth value={corner}
                data={[{ value: "optimistic", label: "optimistic" },
                       { value: "pessimistic", label: "pessimistic" }]}
                onChange={(v) => setCorner(v as Corner)} />
            </KnobField>
            <MultiplierControl value={mult2} onChange={setMult2} />
          </Box>
          <Group gap="xs" mt={10}>
            <Badge variant="light" color={first === null ? "red" : "teal"}>
              {first === null
                ? "no class separates them"
                : `first separated at Class ${first}`}
            </Badge>
            <Badge variant="light" color="gray">
              B/A = {(Math.max(costA, costB) / Math.min(costA, costB)).toFixed(3)}
            </Badge>
          </Group>
          <Box mt={10}>
            <BandChart rows={decisionRows} unit="M€"
              ariaLabel="the bands of two options at every class" />
            <Text size="xs" c="dimmed" mt={4}>
              Each bar is the band at the {corner} end.  A in blue, B in
              orange, each labelled at its left end.
            </Text>
          </Box>
          <Box style={{ overflowX: "auto" }}>
          <Table striped withTableBorder withColumnBorders fz="xs" mt={10}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>class</Table.Th>
                <Table.Th>band A [M€]</Table.Th>
                <Table.Th>band B [M€]</Table.Th>
                <Table.Th>ratio needed, (1+H)/(1+L)</Table.Th>
                <Table.Th>verdict</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {verdicts.map((v, i) => (
                <Table.Tr key={v.cls}>
                  <Table.Td><b>{v.cls}</b></Table.Td>
                  <Table.Td>{money(v.a.lo)} – {money(v.a.hi)}</Table.Td>
                  <Table.Td>{money(v.b.lo)} – {money(v.b.hi)}</Table.Td>
                  <Table.Td>
                    {separatingRatio(AACE_CLASSES[i]!, corner, mult2).toFixed(3)}
                  </Table.Td>
                  <Table.Td>
                    {v.separated
                      ? "separated: the estimate says which is cheaper"
                      : "inside the band: not yet decided by cost"}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          </Box>
          <Box mt={6}>
            <Tex src={String.raw`\frac{C_B}{C_A} > \frac{1 + H}{1 + L}`}
              mode="inline" />
            <Text span size="xs" c="dimmed">
              {"  "}the test each row applies, with B the dearer option.
            </Text>
          </Box>
          <PanelNote>
            The point estimates are round numbers chosen to make the
            arithmetic visible, not the cost of any plant.  Nothing on this
            page runs the engine: an estimate band is a fact about how much of
            the project has been defined, not something a simulator computes.
          </PanelNote>
        </Box>

        {step(7)}
        {step(8)}

        <Box style={{ overflowX: "auto" }}>
        <Table striped withTableBorder withColumnBorders fz="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>stage</Table.Th>
              <Table.Th>class</Table.Th>
              <Table.Th>what Choupo runs</Table.Th>
              <Table.Th>not produced by Choupo</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {FEL_STAGES.map((s) => (
              <Table.Tr key={s.id}>
                <Table.Td>{s.names.split(" (")[0]}</Table.Td>
                <Table.Td>{s.aace}</Table.Td>
                <Table.Td>{s.choupo}</Table.Td>
                <Table.Td>{s.notChoupo}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        </Box>

        <LessonLimits limits={FEL_LIMITS} />

        <Text size="sm">
          Next:{" "}
          <Anchor component="button" type="button"
            onClick={() => setActiveMethodTool("route-screening")}>
            Screening routes to a product
          </Anchor>{" "}(the first stage's paper filters) and{" "}
          <Anchor component="button" type="button"
            onClick={() => setActiveMethodTool("reactor-ladder")}>
            The reactor ladder
          </Anchor>{" "}(the fidelity a reactor climbs as the stages pass).
        </Text>
      </Stack>
    </Box>
  );
}
