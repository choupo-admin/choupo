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
  ReactorLadderTool -- stoichiometry, then the limit, then the rate
  (commission C23, 2026-09-28).

  THE DATA PATH.  ONE bundled witness,
  tutorials/steady/reactors/ladder01_wgs_three_rungs, run in the browser on
  the WASM build of `choupoSolve` through `useMethodRun`.  One run gives all
  five answers, because the case splits one feed to five reactors: `stoich`
  (a declared conversion), `limit` (the equilibrium reactor), `approach` (the
  same with a temperature approach), `gibbs` (Gibbs minimisation over the four
  species) and `kinetic` (a PFR, whose axial profile is drawn).

  The three knobs write DECLARED scalars (methodRun replaces a number and
  cannot add a key): the stoich reactor's `conversion`, the approach reactor's
  `temperatureApproach` (the SECOND of the two the case declares -- the first,
  on `limit`, stays 0), and the temperature, written into the three reactors
  that declare one and into the feed.  The conversion reactor and the PFR are
  isothermal at the temperature they are fed at, so the feed's T is theirs.

  ZERO PHYSICS IN TYPESCRIPT.  Every number is the engine's: the conversions
  are KPIs (`conversion`, `conversion_wgs`, `X_limiting`), the mole fractions
  come from the stream table and the curve is the PFR's own published
  profile.  The Gibbs reactor publishes no conversion, so its column shows
  its mole fractions and says so rather than computing one.  The measured
  values this page was written against are in reactorLadderLesson.ts.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Alert, Anchor, Badge, Box, Group, Loader, Stack, Table, Text, Title,
} from "@mantine/core";

import { useMethodRun, type DictOverride } from "../../case/methodRun.js";
import type { RunResult, UnitProfile } from "../../adapters/SolverAdapter.js";
import { KnobSlider, PanelNote, type PanelKnob } from "./knobPanel.js";
import { Tex } from "./lessonStep.js";
import {
  LADDER_LIMITS, LADDER_SECTIONS, type LadderSection,
} from "./reactorLadderLesson.js";
import { setActiveMethodTool } from "./registry.js";

const INK = "var(--mantine-color-dimmed)";
const GRID = "var(--mantine-color-default-border)";

/** The bundled witness (no leading `tutorials/`). */
export const LADDER_WITNESS = "steady/reactors/ladder01_wgs_three_rungs";

/** The five reactors, in the order the lesson climbs them.  `kpi` names the
 *  conversion the unit PUBLISHES; the Gibbs reactor publishes none. */
export interface LadderColumn {
  unit: string;
  stream: string;
  rung: 1 | 2 | 3;
  label: string;
  told: string;
  kpi: string | null;
}

export const LADDER_COLUMNS: readonly LadderColumn[] = [
  { unit: "stoich", stream: "outStoich", rung: 1, label: "conversion reactor",
    told: "stoichiometry + a declared X", kpi: "conversion" },
  { unit: "limit", stream: "outLimit", rung: 2, label: "equilibrium reactor",
    told: "the reaction; K(T) from formation data", kpi: "conversion_wgs" },
  { unit: "approach", stream: "outApproach", rung: 2,
    label: "equilibrium + approach",
    told: "the same, K taken ΔT away from T", kpi: "conversion_wgs" },
  { unit: "gibbs", stream: "outGibbs", rung: 2, label: "Gibbs reactor",
    told: "elements and four species, no reaction", kpi: null },
  { unit: "kinetic", stream: "outKinetic", rung: 3, label: "plug flow (PFR)",
    told: "the reaction AND a measured rate law", kpi: "X_limiting" },
];

export const LADDER_SPECIES: readonly string[] = ["CO", "water", "CO2", "H2"];

/** The dict scalars one run writes.  `T` appears three times in the
 *  flowsheet (limit, approach, gibbs -- in that order) and once in the feed;
 *  `temperatureApproach` twice (limit, approach).  Units are ASSERTED, and
 *  methodRun refuses a mismatch by name. */
export function ladderOverrides(T_K: number, dT_K: number, X: number):
  DictOverride[] {
  return [
    { file: "system/flowsheetDict", key: "T", value: T_K, unit: "K", occurrence: 1 },
    { file: "system/flowsheetDict", key: "T", value: T_K, unit: "K", occurrence: 2 },
    { file: "system/flowsheetDict", key: "T", value: T_K, unit: "K", occurrence: 3 },
    { file: "0/feed", key: "T", value: T_K, unit: "K" },
    { file: "system/flowsheetDict", key: "temperatureApproach", value: dT_K,
      unit: "", occurrence: 2 },
    { file: "system/flowsheetDict", key: "conversion", value: X, unit: "" },
  ];
}

export const T_KNOB: PanelKnob = {
  id: "T", label: "temperature T — every reactor and the feed",
  min: 550, max: 700, step: 25, unit: "K",
  why: "Hot: the rate is fast and the limit is low.  Cool: the limit is high "
    + "and the rate is slow.  At 550 K the same bed no longer reaches the "
    + "limit.",
};

export const DT_KNOB: PanelKnob = {
  id: "dT", label: "approach |ΔT| on the approach reactor — a MAGNITUDE",
  min: 0, max: 50, step: 5, unit: "K",
  why: "How far short of the limit the design is placed, declared as a "
    + "temperature.  The engine picks the side: the shift is exothermic, so "
    + "its K is taken above T.",
};

export const X_KNOB: PanelKnob = {
  id: "X", label: "declared conversion X on rung 1",
  min: 0.5, max: 0.95, step: 0.05, unit: "",
  why: "Any number between 0 and 1 is accepted.  Compare it with the "
    + "equilibrium column: rung 1 cannot tell you when it is impossible.",
};

function num(r: RunResult | null, unit: string, key: string | null):
  number | null {
  if (!r || key === null) return null;
  const v = r.kpis?.[unit]?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function compositionOf(r: RunResult | null, stream: string):
  { [c: string]: number } | null {
  const s = r?.streams.find((x) => x.name === stream);
  return s ? s.composition : null;
}

function fmt(v: number | null | undefined, d = 4): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(d);
}

/** The PFR's published profile, or null. */
export function kineticProfile(profiles: readonly UnitProfile[] | undefined):
  { V: number[]; X: number[] } | null {
  const p = profiles?.find((q) => q.unit === "kinetic");
  const V = p?.columns?.["V"];
  const X = p?.columns?.["X"];
  if (!V || !X || V.length !== X.length || V.length < 2) return null;
  return { V, X };
}

// ---- visual pieces ----------------------------------------------------------

/** Prose with its mathematics between `$` marks. */
function Md({ s }: { s: string }): JSX.Element {
  return (
    <>
      {s.split("$").map((part, i) => (i % 2 === 1
        ? <Tex key={i} src={part} mode="inline" />
        : <span key={i}>{part}</span>))}
    </>
  );
}

function Section({ s }: { s: LadderSection }): JSX.Element {
  return (
    <Box>
      <Title order={5}>{s.title}</Title>
      <Text size="sm" mt={4}><Md s={s.body} /></Text>
      {s.eq && (
        <Box my={8} px="sm" py={6} style={{ borderLeft: `3px solid ${GRID}` }}>
          <Tex src={s.eq} mode="display" />
          {s.where && (
            <Box mt={8}>
              {s.where.map((g) => (
                <Text key={g.sym} size="xs" c="dimmed" style={{ lineHeight: 1.6 }}>
                  <Tex src={g.sym} mode="inline" />{"  "}{g.means}
                  {g.unit ? <Text span c="dimmed"> [{g.unit}]</Text> : null}
                </Text>
              ))}
            </Box>
          )}
        </Box>
      )}
      {s.needs && (
        <Text size="sm" mt={4}><b>What this rung needs:</b> {s.needs}</Text>
      )}
      {s.check && (
        <Box mt={6} px="sm" py={6} style={{ borderLeft: `3px solid ${GRID}` }}>
          <Text size="sm" fw={600}>{s.check.q}</Text>
          <Text size="sm" c={INK} mt={2}><em>Answer:</em> {s.check.a}</Text>
        </Box>
      )}
    </Box>
  );
}

/** The PFR profile against the three horizontal lines of the other rungs.
 *  It plots the engine's points and joins them; nothing is interpolated
 *  beyond the straight segments between published points. */
function LadderPlot({ prof, limit, approach, declared }: {
  prof: { V: number[]; X: number[] } | null;
  limit: number | null; approach: number | null; declared: number | null;
}): JSX.Element {
  const W = 560, H = 260, L = 48, R = 150, T = 12, B = 36;
  const Vmax = (prof ? prof.V[prof.V.length - 1] : undefined) ?? 1;
  const Xend = (prof ? prof.X[prof.X.length - 1] : undefined) ?? 0;
  const x = (v: number) => L + (v / Vmax) * (W - L - R);
  const y = (X: number) => T + (1 - X) * (H - T - B);
  const line = (X: number | null, color: string, dash: string, label: string) =>
    X === null ? null : (
      <g key={label}>
        <line x1={L} x2={W - R} y1={y(X)} y2={y(X)} stroke={color}
          strokeWidth={1.5} strokeDasharray={dash} />
        <text x={W - R + 6} y={y(X) + 4} fontSize={11} fill={color}>
          {label} {X.toFixed(3)}
        </text>
      </g>
    );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
      aria-label="PFR conversion profile against the equilibrium limit">
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke={GRID} />
      <line x1={L} x2={L} y1={T} y2={H - B} stroke={GRID} />
      {[0, 0.25, 0.5, 0.75, 1].map((t) => (
        <g key={t}>
          <text x={L - 6} y={y(t) + 4} fontSize={10} textAnchor="end"
            fill="currentColor">{t.toFixed(2)}</text>
          <line x1={L - 3} x2={L} y1={y(t)} y2={y(t)} stroke={GRID} />
        </g>
      ))}
      <text x={(L + W - R) / 2} y={H - 8} fontSize={11} textAnchor="middle"
        fill="currentColor">position along the bed, V / V_R (a shape, not a size)</text>
      <text x={12} y={(T + H - B) / 2} fontSize={11} textAnchor="middle"
        fill="currentColor" transform={`rotate(-90 12 ${(T + H - B) / 2})`}>
        conversion of CO
      </text>
      {line(declared, "var(--mantine-color-red-6)", "2 3", "declared")}
      {line(limit, "var(--mantine-color-teal-7)", "6 3", "limit")}
      {line(approach, "var(--mantine-color-orange-6)", "3 3", "approach")}
      {prof && (
        <polyline fill="none" stroke="var(--mantine-color-blue-6)"
          strokeWidth={2}
          points={prof.V.map((v, i) => `${x(v)},${y(prof.X[i] ?? 0)}`).join(" ")} />
      )}
      {prof && (
        <text x={x(Vmax) + 6} y={y(Xend) + 16}
          fontSize={11} fill="var(--mantine-color-blue-6)">PFR</text>
      )}
    </svg>
  );
}

export function ReactorLadderTool(): JSX.Element {
  const [T, setT] = useState(600);
  const [dT, setDT] = useState(25);
  const [X, setX] = useState(0.9);

  const ov = useMemo(() => ladderOverrides(T, dT, X), [T, dT, X]);
  const run = useMethodRun(LADDER_WITNESS, ov, JSON.stringify([T, dT, X]),
    "choupoSolve");
  const r = run.result;
  const prof = kineticProfile(r?.profiles);
  const xLimit = num(r, "limit", "conversion_wgs");
  const xApproach = num(r, "approach", "conversion_wgs");
  const xDeclared = num(r, "stoich", "conversion");
  const xPfr = num(r, "kinetic", "X_limiting");

  const sec = (id: string) => {
    const s = LADDER_SECTIONS.find((q) => q.id === id);
    return s ? <Section key={id} s={s} /> : null;
  };

  const table = (
    <Table striped withTableBorder withColumnBorders fz="xs">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>rung</Table.Th>
          <Table.Th>model — what it is told</Table.Th>
          <Table.Th>conversion of CO</Table.Th>
          {LADDER_SPECIES.map((sp) => <Table.Th key={sp}>y {sp}</Table.Th>)}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {LADDER_COLUMNS.map((c) => {
          const y = compositionOf(r, c.stream);
          return (
            <Table.Tr key={c.unit}>
              <Table.Td>{c.rung}</Table.Td>
              <Table.Td>
                <b>{c.label}</b>
                <Text size="xs" c="dimmed">{c.told}</Text>
              </Table.Td>
              <Table.Td>
                {c.kpi === null
                  ? <Text size="xs" c="dimmed">publishes none — read y</Text>
                  : fmt(num(r, c.unit, c.kpi))}
              </Table.Td>
              {LADDER_SPECIES.map((sp) => (
                <Table.Td key={sp}>{fmt(y?.[sp])}</Table.Td>
              ))}
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );

  const overLimit = xDeclared !== null && xLimit !== null && xDeclared > xLimit;
  const rateBinds = xPfr !== null && xLimit !== null && xLimit - xPfr > 1e-4;

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
        <Box>
          <Title order={4}>
            The reactor ladder: stoichiometry, then the limit, then the rate
          </Title>
          <Text size="sm" c="dimmed" mt={4}>
            One reaction, one feed, five models of the same reactor, climbed
            in the order a design climbs them. Each rung asks for more
            information than the one below; the top one asks for a
            measurement.
          </Text>
        </Box>

        {sec("order")}
        {sec("rung1")}
        {sec("rung2")}
        {sec("approach")}

        <Box>
          <Title order={5}>Now run it</Title>
          <Text size="sm" mt={4}>
            One run of the witness in your browser: equimolar CO and steam at
            10 bar, one fifth to each reactor. Read the conversion column from
            the top, then the curve, then move the knobs.
          </Text>

          {run.err && (
            <Alert color="red" variant="light" mt={8}
              title="The engine did not finish">
              <Text size="sm">{run.err}</Text>
            </Alert>
          )}

          <Box mt={10} style={{
            display: "grid", gap: 14,
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          }}>
            <Stack gap={8} style={{ maxWidth: 300 }}>
              <KnobSlider knob={T_KNOB} value={T} onChange={setT} showWhy />
              <KnobSlider knob={DT_KNOB} value={dT} onChange={setDT} showWhy />
              <KnobSlider knob={X_KNOB} value={X} onChange={setX} showWhy />
              <PanelNote>
                Runs <code>tutorials/{LADDER_WITNESS}</code> on the WASM build
                of <code>choupoSolve</code>. The knobs write numbers the witness
                declares; every value shown is the engine&apos;s.
              </PanelNote>
            </Stack>
            <Box style={{ minWidth: 0 }}>
              {run.busy && (
                <Group gap="sm" wrap="nowrap" align="center" mb={6}>
                  <Loader size="xs" />
                  <Text size="xs" c="dimmed">
                    two Newtons, one Gibbs minimisation and one integration
                  </Text>
                </Group>
              )}
              <LadderPlot prof={prof} limit={xLimit} approach={xApproach}
                declared={xDeclared} />
              <Group gap="xs" wrap="wrap" mt={4}>
                {overLimit && (
                  <Badge variant="light" color="red">
                    rung 1 declares more than thermodynamics allows
                  </Badge>
                )}
                {xPfr !== null && (
                  <Badge variant="light" color={rateBinds ? "orange" : "teal"}>
                    {rateBinds
                      ? "the rate binds: the bed ends below the limit"
                      : "equilibrium binds: the bed reaches the limit"}
                  </Badge>
                )}
                <Badge variant="light" color="gray">
                  T = {T} K · |ΔT| = {dT} K · X declared = {X.toFixed(2)}
                </Badge>
              </Group>
            </Box>
          </Box>
          <Box mt={10}>{table}</Box>
          <Text size="xs" c="dimmed" mt={6}>
            The equilibrium and Gibbs rows must agree: over these four species
            the shift is the only reaction there is. The PFR row can meet them
            but never exceed them.
          </Text>
        </Box>

        {sec("rung3")}
        {sec("phases")}

        <Box>
          <Title order={5}>What this does not show</Title>
          <Box mt={6}>
            {LADDER_LIMITS.map((l) => (
              <Box key={l.id} mb={8}>
                <Text size="sm" fw={600}>{l.title}</Text>
                <Text size="sm" c="dimmed">{l.body}</Text>
              </Box>
            ))}
          </Box>
        </Box>

        <Text size="sm">
          The second rung in depth:{" "}
          <Anchor component="button" type="button"
            onClick={() => setActiveMethodTool("approach-to-equilibrium")}>
            Approach to equilibrium
          </Anchor>{" "}and{" "}
          <Anchor component="button" type="button"
            onClick={() => setActiveMethodTool("declared-pathways")}>
            Declared pathways
          </Anchor>.
        </Text>
      </Stack>
    </Box>
  );
}
