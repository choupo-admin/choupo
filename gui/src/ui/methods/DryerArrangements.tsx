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
  The section "Co-current, counter-current, cross-flow" of the dryer-selection
  page (DEV.md 4c C465, Vitor 2026-11-21): the three drawings with a button
  that opens each tutorial case, the figure of X(z), Y(z) and T(z) of the three
  cases, the side-by-side outlet table, and the table of where each is used.

  THE TASK, in one sentence: I have a continuous convective dryer to specify;
  which way should the gas meet the solid, and what does the choice cost?  So
  the page shows the three, the engine's own answer for the same dryer run
  three ways, and what the books say each is for.

  NOTHING HERE IS COMPUTED OR TYPED.  The figure and the table are the
  in-browser engine's profile and KPIs of the three witnesses
  (dryerArrangements.ts names them; case/methodRun.ts runs them).  While a run
  is pending or has failed the figure says so; it never falls back to numbers
  held in the page.
\*---------------------------------------------------------------------------*/

import { Box, Button, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";

import { caseTabSearch, openAppTab } from "../openInTab.js";
import { useMethodRun } from "../../case/methodRun.js";
import { OriginMark } from "./origin.js";
import { ArrangementDrawing } from "./dryerDrawings.js";
import {
  ARRANGEMENT_CASES, ARRANGEMENT_IDS, ARRANGEMENT_USES, outletOfUnit, profileOfUnit,
  type ArrangementId, type ArrangementOutlet, type ArrangementProfile,
} from "./dryerArrangements.js";

const fx = (v: number, d: number): string => (Number.isFinite(v) ? v.toFixed(d) : "—");

/** One colour and one dash per arrangement: the dash carries the identity where the colour cannot. */
export const ARRANGEMENT_STYLE: Readonly<Record<ArrangementId, { color: string; dash: string }>> = {
  cocurrent: { color: "#8e5bd0", dash: "" },
  countercurrent: { color: "#2e9e5b", dash: "6 3" },
  crossflow: { color: "#d63384", dash: "1.5 3" },
};

const BOX = { border: "1px solid var(--mantine-color-default-border)", borderRadius: 4 } as const;

/** The three schematics, each with its sentence and the button that opens its case. */
export function ArrangementCards(): JSX.Element {
  return (
    <Box data-arrangement-cards="">
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        {ARRANGEMENT_IDS.map((id) => {
          const c = ARRANGEMENT_CASES[id];
          return (
            <Box key={id} px="sm" py={8} data-arrangement-card={id} style={BOX}>
              <Text fw={600} size="sm">{c.label}</Text>
              <ArrangementDrawing id={id} label={c.label.toLowerCase()} />
              <Text size="xs" mt={4}>{c.meets}</Text>
              <Stack gap={2} mt={6} data-engine-case={c.witness}>
                <Button size="compact-xs" variant="light" w="fit-content"
                  onClick={() => openAppTab(caseTabSearch(c.witness))}>
                  Open the case {c.witness.split("/").pop()}
                </Button>
              </Stack>
            </Box>
          );
        })}
      </SimpleGrid>
    </Box>
  );
}

// ---- the figure -----------------------------------------------------------------------

const PW = 300, PH = 190, ML = 46, MR = 8, MT = 10, MB = 34;

interface PanelSpec {
  key: "X" | "Y" | "T";
  title: string;
  unit: string;
  digits: number;
}

export const PANELS: readonly PanelSpec[] = [
  { key: "X", title: "Solid moisture X", unit: "kg/kg dry solid", digits: 3 },
  { key: "Y", title: "Gas humidity Y", unit: "kg/kg dry gas", digits: 3 },
  { key: "T", title: "Gas temperature T", unit: "K", digits: 0 },
];

function niceRange(lo: number, hi: number): [number, number] {
  if (!(hi > lo)) return [lo - 1, hi + 1];
  const pad = 0.06 * (hi - lo);
  return [lo - pad, hi + pad];
}

function Panel({ spec, series }: {
  spec: PanelSpec; series: { id: ArrangementId; p: ArrangementProfile }[];
}): JSX.Element {
  const all = series.flatMap((s) => s.p[spec.key]);
  const [lo, hi] = niceRange(Math.min(...all), Math.max(...all));
  const x = (v: number): number => ML + v * (PW - ML - MR);
  const y = (v: number): number => MT + (1 - (v - lo) / (hi - lo)) * (PH - MT - MB);
  const yTicks = [0, 1, 2, 3].map((k) => lo + ((hi - lo) * k) / 3);
  return (
    <Box data-panel={spec.key}>
      <Text size="xs" fw={600}>{spec.title} <Text span size="xs" c="dimmed">[{spec.unit}]</Text></Text>
      <svg viewBox={`0 0 ${PW} ${PH}`} width="100%" role="img"
        aria-label={`${spec.title} along the dryer, three arrangements`}>
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={ML} x2={PW - MR} y1={y(t)} y2={y(t)} stroke="var(--mantine-color-default-border)" />
            <text x={ML - 4} y={y(t) + 3} fontSize={9} textAnchor="end"
              fill="var(--mantine-color-dimmed)">{fx(t, spec.digits)}</text>
          </g>
        ))}
        {[0, 0.5, 1].map((t) => (
          <text key={t} x={x(t)} y={PH - MB + 12} fontSize={9} textAnchor="middle"
            fill="var(--mantine-color-dimmed)">{t}</text>
        ))}
        <text x={(ML + PW - MR) / 2} y={PH - 6} fontSize={9} textAnchor="middle"
          fill="var(--mantine-color-dimmed)">fraction of the contact area passed by the solid</text>
        <rect x={ML} y={MT} width={PW - ML - MR} height={PH - MT - MB} fill="none"
          stroke="var(--mantine-color-default-border)" />
        {series.map(({ id, p }) => (
          <polyline key={id} data-series={id} fill="none" strokeWidth={2}
            stroke={ARRANGEMENT_STYLE[id].color} strokeDasharray={ARRANGEMENT_STYLE[id].dash}
            points={p.xi.map((v, i) => `${x(v).toFixed(1)},${y(p[spec.key][i]!).toFixed(1)}`).join(" ")} />
        ))}
      </svg>
    </Box>
  );
}

function Legend(): JSX.Element {
  return (
    <Box data-arrangement-legend="" style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 12 }}>
      {ARRANGEMENT_IDS.map((id) => (
        <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <svg width={28} height={6} aria-hidden>
            <line x1={0} x2={28} y1={3} y2={3} strokeWidth={2} stroke={ARRANGEMENT_STYLE[id].color}
              strokeDasharray={ARRANGEMENT_STYLE[id].dash} />
          </svg>
          {ARRANGEMENT_CASES[id].label}
        </span>
      ))}
    </Box>
  );
}

const EMPTY: readonly never[] = [];

/** Runs the three witnesses and draws the figure and the outlet table from their output. */
export function ArrangementRuns(): JSX.Element {
  const co = useMethodRun(ARRANGEMENT_CASES.cocurrent.witness, EMPTY, "", "choupoSolve");
  const counter = useMethodRun(ARRANGEMENT_CASES.countercurrent.witness, EMPTY, "", "choupoSolve");
  const cross = useMethodRun(ARRANGEMENT_CASES.crossflow.witness, EMPTY, "", "choupoSolve");
  const runs: Record<ArrangementId, typeof co> = {
    cocurrent: co, countercurrent: counter, crossflow: cross,
  };
  const series: { id: ArrangementId; p: ArrangementProfile }[] = [];
  const outlets: Partial<Record<ArrangementId, ArrangementOutlet>> = {};
  const problems: string[] = [];
  for (const id of ARRANGEMENT_IDS) {
    const r = runs[id];
    const c = ARRANGEMENT_CASES[id];
    if (r.err) { problems.push(`${c.label}: ${r.err}`); continue; }
    if (!r.result) continue;
    const p = profileOfUnit(r.result.profiles, c.unit);
    const o = outletOfUnit(r.result.kpis, c.unit);
    if (!p || !o) { problems.push(`${c.label}: the run has no profile or outlet for unit ${c.unit}`); continue; }
    series.push({ id, p });
    outlets[id] = o;
  }
  const busy = co.busy || counter.busy || cross.busy;
  return (
    <Stack gap="md" data-arrangement-runs="">
      <Box px="sm" py={8} style={BOX} data-arrangement-figure="">
        <Title order={5}>Along the dryer, the three arrangements</Title>
        <OriginMark of={["engine"]}
          note="the engine's profile of each unit, run in your browser on the three tutorial cases; hypothetical teaching values" />
        <Box mt={6}><Legend /></Box>
        {series.length === ARRANGEMENT_IDS.length ? (
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md" mt={6}>
            {PANELS.map((spec) => <Panel key={spec.key} spec={spec} series={series} />)}
          </SimpleGrid>
        ) : (
          <Text size="sm" c="dimmed" mt={6} data-arrangement-pending="">
            {busy ? "Running the three cases in the engine..." : "The three cases have not run."}
          </Text>
        )}
        {problems.map((t) => <Text key={t} size="xs" c="red">{t}</Text>)}
        <Text size="xs" c="dimmed" mt={4}>
          In cross-flow the gas curves are the gas leaving the element at that position, not one
          stream running down the length.  The solid sits at the local wet-bulb temperature in all
          three, so its temperature is not plotted.
        </Text>
      </Box>

      <Box px="sm" py={8} style={BOX} data-arrangement-outlets="">
        <Title order={5}>The outlets, side by side</Title>
        <OriginMark of={["engine"]} note="the outlet KPIs of the same three runs" />
        <Table withTableBorder withColumnBorders fz="xs" mt={4}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Arrangement</Table.Th>
              <Table.Th>X out, kg/kg</Table.Th>
              <Table.Th>Y out, kg/kg</Table.Th>
              <Table.Th>T air out, K</Table.Th>
              <Table.Th>X_c crossed at, % of area</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {ARRANGEMENT_IDS.map((id) => {
              const o = outlets[id];
              return (
                <Table.Tr key={id} data-outlet-row={id}>
                  <Table.Td>{ARRANGEMENT_CASES[id].label}</Table.Td>
                  <Table.Td data-col="X">{o ? fx(o.X, 5) : "—"}</Table.Td>
                  <Table.Td data-col="Y">{o ? fx(o.Y, 4) : "—"}</Table.Td>
                  <Table.Td data-col="T">{o ? fx(o.Tair, 1) : "—"}</Table.Td>
                  <Table.Td data-col="xi">{o && o.xiCrit !== null ? fx(100 * o.xiCrit, 1) : "—"}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Box>
    </Stack>
  );
}

/** Where each arrangement is used, as the books say, each with its page. */
export function ArrangementUses(): JSX.Element {
  return (
    <Box px="sm" py={8} style={BOX} data-arrangement-uses="">
      <Title order={5}>Where each arrangement is used, as the books say</Title>
      <OriginMark of={["reference"]}
        note="Perry p. 12-36, van 't Land section 4.1 p. 42, Mujumdar section 3.6.2 pp. 57-66, read at their pages" />
      <Table withTableBorder withColumnBorders fz="xs" mt={4}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Arrangement</Table.Th><Table.Th>Use it for</Table.Th>
            <Table.Th>Why, as the book gives it</Table.Th><Table.Th>Read in</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {ARRANGEMENT_USES.map((u) => (
            <Table.Tr key={u.id} data-use-row={u.id}>
              <Table.Td>{ARRANGEMENT_CASES[u.id].label}</Table.Td>
              <Table.Td>{u.when}</Table.Td>
              <Table.Td>{u.why}</Table.Td>
              <Table.Td>{u.src}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Box>
  );
}
