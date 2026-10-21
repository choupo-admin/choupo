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
  DATA RECONCILIATION, AND HOW BAYES HELPS (DEV.md 4c C121) -- four pages:
  why the measurements do not close a balance; reconciliation read as
  weighted least squares AND as the Bayesian posterior mode; gross errors,
  the global and the measurement test; a prior that is not flat, and the
  posterior covariance.

  WHERE EVERY NUMBER COMES FROM.  The witness
  `props/reconciliation/reconcile01_recycle_loop` runs in the reader's
  browser (the WASM build of choupoProps) and writes three CSVs per
  operation -- the streams, the balances, the covariance -- beside a result
  JSON carrying the tests.  Every number on every table is read from those;
  NO reconciliation is computed here.  Page 3's knobs plant the gross error
  on another meter by overriding two words and two numbers of the witness's
  own propsDict, and the engine runs again.  The one curve drawn from a
  formula is page 4's bell curves, each a Gaussian whose centre and width
  are numbers the engine published.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import {
  Alert, Badge, Box, Group, Loader, SegmentedControl, Stack, Table, Text, Title,
} from "@mantine/core";

import { useMethodRun, type MethodRunState } from "../../case/methodRun.js";
import type { OperationResult } from "../../adapters/SolverAdapter.js";
import { LessonLimits, lessonStepper } from "./lessonStep.js";
import { DR_LIMITS, DR_STEPS } from "./dataReconciliationLesson.js";
import { KnobSlider, type PanelKnob } from "./knobPanel.js";
import {
  DRIFT_DEFAULT_METER, DRIFT_DEFAULT_SIZE, DRIFT_MAX, DRIFT_MIN, DR_UNIT, DR_WITNESS,
  DIAGRAM_EDGES, DIAGRAM_NODES, balancesCsv, covarianceCsv, driftOverrides, fmt, fmtSigned,
  readBalances,
  readCovariance, readStreams, streamsCsv,
  type BalanceRow, type Covariance, type DrOp, type StreamRow, type StreamTable,
} from "./dataReconciliationRun.js";

const BORDER = "var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";
const TEXT = "var(--mantine-color-text)";
const SURFACE = "var(--mantine-color-body)";
const FLAG = "var(--mantine-color-red-6)";
const ACCENT = "var(--mantine-color-blue-6)";

type PageId = "why" | "bayes" | "gross" | "prior";
const PAGES: { value: PageId; label: string }[] = [
  { value: "why", label: "1 · Why balances do not close" },
  { value: "bayes", label: "2 · Reconciliation = Bayes" },
  { value: "gross", label: "3 · Gross errors" },
  { value: "prior", label: "4 · Priors and precision" },
];

const step = lessonStepper(DR_STEPS);

// ---- what one run of the witness published ------------------------------------

export interface OpResult {
  streams: StreamTable | null;
  balances: BalanceRow[] | null;
  cov: Covariance | null;
  diag: { [k: string]: number };
  why: string | null;
}

export function opOf(run: MethodRunState, op: DrOp, name: string): OpResult {
  const csv = run.result?.csvFiles ?? {};
  const s = readStreams(csv[streamsCsv(op)] ?? "");
  const b = readBalances(csv[balancesCsv(op)] ?? "");
  const c = readCovariance(csv[covarianceCsv(op)] ?? "");
  const r = (run.result?.operationResults ?? []).find((o: OperationResult) => o.name === name);
  return {
    streams: s.ok ? s.read : null,
    balances: b.ok ? b.read : null,
    cov: c.ok ? c.read : null,
    diag: r?.diagnostics ?? {},
    why: !s.ok ? s.why : !b.ok ? b.why : !c.ok ? c.why : !r ? `no operation '${name}' in the result` : null,
  };
}

function RunGate({ run, children }: { run: MethodRunState; children: () => JSX.Element }): JSX.Element {
  if (run.err) {
    return (
      <Alert color="red" variant="light" title="the engine run did not finish">
        <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>{run.err}</Text>
      </Alert>
    );
  }
  if (!run.result) {
    return (
      <Group gap={8}>
        <Loader size="xs" />
        <Text size="sm" c="dimmed">running {DR_WITNESS} with choupoProps in your browser…</Text>
      </Group>
    );
  }
  return children();
}

// ---- the plant ---------------------------------------------------------------

const NW = 96, NH = 34;

/** Where each stream is drawn: its polyline and the point its two labels
 *  (the name above, the value below) are centred on.  Layout only. */
const GEOM: { [s: string]: { pts: [number, number][]; at: [number, number]; side?: boolean } } = {
  F1: { pts: [[8, 70], [92, 70]], at: [50, 70] },
  F2: { pts: [[188, 70], [292, 70]], at: [240, 70] },
  F3: { pts: [[388, 70], [492, 70]], at: [440, 70] },
  F4: { pts: [[588, 70], [752, 70]], at: [670, 70] },
  F5: { pts: [[540, 87], [540, 175], [488, 175]], at: [548, 128], side: true },
  F6: { pts: [[440, 192], [440, 244]], at: [448, 222], side: true },
  F7: { pts: [[392, 175], [140, 175], [140, 87]], at: [266, 175] },
};

function PlantDiagram({ rows, label, flagged }: {
  rows: StreamRow[];
  label: (r: StreamRow) => string;
  flagged?: Set<string>;
}): JSX.Element {
  const byName = new Map(rows.map((r) => [r.stream, r]));
  const poly = (pts: [number, number][]) => pts.map(([x, y]) => `${x},${y}`).join(" ");
  return (
    <Box style={{ overflowX: "auto" }}>
      <svg viewBox="0 0 760 252" width="100%" style={{ maxWidth: 820, display: "block" }}
        role="img" aria-label="the invented plant: mixer, reactor, separator and purge splitter, seven metered streams">
        <defs>
          <marker id="dr-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7"
            markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={INK} />
          </marker>
        </defs>
        {Object.keys(DIAGRAM_EDGES).map((s) => {
          const g = GEOM[s]!;
          const r = byName.get(s);
          const isFlag = flagged?.has(s) ?? false;
          const [x, y] = g.at;
          const anchor = g.side ? "start" : "middle";
          return (
            <g key={s}>
              <polyline points={poly(g.pts)} fill="none" stroke={isFlag ? FLAG : INK}
                strokeWidth={isFlag ? 2.5 : 1.5} markerEnd="url(#dr-arrow)" />
              <text x={x} y={g.side ? y - 4 : y - 6} fontSize={11} textAnchor={anchor}
                fill={isFlag ? FLAG : TEXT} fontWeight={700}>
                {s}{isFlag ? " — flagged" : ""}
              </text>
              {r && (
                <text x={x} y={g.side ? y + 10 : y + 15} fontSize={10} textAnchor={anchor}
                  fill={isFlag ? FLAG : INK}>
                  {label(r)}
                </text>
              )}
            </g>
          );
        })}
        {DIAGRAM_NODES.map((n) => (
          <g key={n.id}>
            <rect x={n.x - NW / 2} y={n.y - NH / 2} width={NW} height={NH} rx={5}
              fill={SURFACE} stroke={TEXT} strokeWidth={1.2} />
            <text x={n.x} y={n.y + 4} fontSize={12} textAnchor="middle" fill={TEXT}>{n.id}</text>
          </g>
        ))}
      </svg>
    </Box>
  );
}

// ---- tables ------------------------------------------------------------------

function BalanceTable({ rows, after }: { rows: BalanceRow[]; after?: boolean }): JSX.Element {
  return (
    <Box style={{ overflowX: "auto" }}>
      <Table striped withTableBorder fz="xs" miw={560}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>balance</Table.Th>
            <Table.Th>equation</Table.Th>
            <Table.Th ta="right">residual [{DR_UNIT}]</Table.Th>
            <Table.Th ta="right">its sd [{DR_UNIT}]</Table.Th>
            <Table.Th ta="right">residual / sd</Table.Th>
            {after && <Table.Th ta="right">after</Table.Th>}
            {after && <Table.Th ta="right">λ [h/t]</Table.Th>}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map((b) => (
            <Table.Tr key={b.balance}>
              <Table.Td>{b.balance}</Table.Td>
              <Table.Td ff="monospace">{b.equation}</Table.Td>
              <Table.Td ta="right">{fmtSigned(b.residual, 2)}</Table.Td>
              <Table.Td ta="right">{fmt(b.residualSigma, 2)}</Table.Td>
              <Table.Td ta="right" fw={Math.abs(b.residualTest) > 3 ? 700 : 400}
                c={Math.abs(b.residualTest) > 3 ? "red" : undefined}>
                {fmtSigned(b.residualTest, 2)}
              </Table.Td>
              {after && <Table.Td ta="right">{fmt(Math.abs(b.residualAfter) < 1e-9 ? 0 : b.residualAfter, 2)}</Table.Td>}
              {after && <Table.Td ta="right">{fmtSigned(b.multiplier, 4)}</Table.Td>}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Box>
  );
}

/** One verdict, with the numbers that produced it beside the word. */
function GlobalTest({ diag, title }: { diag: { [k: string]: number }; title: string }): JSX.Element {
  const rejects = diag.globalTestRejects === 1;
  return (
    <Box px="sm" py={6} style={{ border: `1px solid ${BORDER}`, borderRadius: 4, flex: 1, minWidth: 240 }}>
      <Text size="xs" c="dimmed" fw={700} tt="uppercase">{title}</Text>
      <Text size="sm" mt={4}>
        γ = <b>{fmt(diag.objective, 2)}</b> against χ²<sub>{fmt(diag.dof, 0)}</sub> critical{" "}
        <b>{fmt(diag.chi2Critical, 2)}</b> (α = {fmt(diag.alpha, 2)}); p = {fmt(diag.pValue, 5)}
      </Text>
      <Badge mt={6} color={rejects ? "red" : "teal"} variant="light">
        {rejects ? "rejected — a gross error is suspected" : "accepted — consistent with the meters' noise"}
      </Badge>
      <Text size="xs" c="dimmed" mt={6}>
        measurement test: largest |z| = {fmt(diag.maxAbsMeasurementTest, 2)} against{" "}
        {fmt(diag.zCritical, 3)} (Šidák level β = {fmt(diag.measurementTestLevel, 5)} over{" "}
        {fmt(diag.measurementTests, 0)} meters); {fmt(diag.flagged, 0)} flagged
      </Text>
    </Box>
  );
}

// ---- page 1 ------------------------------------------------------------------

export function WhyPage({ honest }: { honest: OpResult }): JSX.Element {
  const rows = honest.streams!.rows;
  return (
    <Stack gap="md">
      {step(1)}
      <PlantDiagram rows={rows} label={(r) => `${fmt(r.reading, 1)} ± ${fmt(r.sigma, 1)}`} />
      <Box style={{ overflowX: "auto" }}>
        <Table striped withTableBorder fz="xs" miw={480}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>stream</Table.Th>
              <Table.Th ta="right">reading m [{DR_UNIT}]</Table.Th>
              <Table.Th ta="right">meter σ [{DR_UNIT}]</Table.Th>
              <Table.Th ta="right">true x (synthetic) [{DR_UNIT}]</Table.Th>
              <Table.Th ta="right">error in σ</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.stream}>
                <Table.Td>{r.stream}</Table.Td>
                <Table.Td ta="right">{fmt(r.reading, 1)}</Table.Td>
                <Table.Td ta="right">{fmt(r.sigma, 1)}</Table.Td>
                <Table.Td ta="right">{fmt(r.truth, 1)}</Table.Td>
                <Table.Td ta="right">
                  {r.reading !== null && r.truth !== null && r.sigma
                    ? fmtSigned((r.reading - r.truth) / r.sigma, 2) : "—"}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>
      {step(2)}
      {step(3)}
      <BalanceTable rows={honest.balances!} />
    </Stack>
  );
}

// ---- page 2 ------------------------------------------------------------------

function ReconciliationTable({ t, showTruth = true }: { t: StreamTable; showTruth?: boolean }): JSX.Element {
  return (
    <Box style={{ overflowX: "auto" }}>
      <Table striped withTableBorder fz="xs" miw={720}>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>stream</Table.Th>
            <Table.Th ta="right">m</Table.Th>
            <Table.Th ta="right">x̂</Table.Th>
            <Table.Th ta="right">x̂ − m</Table.Th>
            <Table.Th ta="right">(x̂ − m)/σ</Table.Th>
            {t.balances.map((b) => <Table.Th key={b} ta="right">by {b}</Table.Th>)}
            {showTruth && <Table.Th ta="right">error m, in σ</Table.Th>}
            {showTruth && <Table.Th ta="right">error x̂, in σ</Table.Th>}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {t.rows.map((r) => (
            <Table.Tr key={r.stream}>
              <Table.Td>{r.stream}</Table.Td>
              <Table.Td ta="right">{fmt(r.reading, 1)}</Table.Td>
              <Table.Td ta="right" fw={600}>{fmt(r.reconciled, 2)}</Table.Td>
              <Table.Td ta="right">{fmtSigned(r.adjustment, 2)}</Table.Td>
              <Table.Td ta="right">{fmtSigned(r.adjustmentSigma, 3)}</Table.Td>
              {t.balances.map((b) => (
                <Table.Td key={b} ta="right" c={r.byBalance[b] ? undefined : "dimmed"}>
                  {r.byBalance[b] ? fmtSigned(r.byBalance[b], 3) : "·"}
                </Table.Td>
              ))}
              {showTruth && (
                <Table.Td ta="right">
                  {r.reading !== null && r.truth !== null && r.sigma
                    ? fmtSigned((r.reading - r.truth) / r.sigma, 2) : "—"}
                </Table.Td>
              )}
              {showTruth && (
                <Table.Td ta="right">
                  {r.truth !== null && r.sigma ? fmtSigned((r.reconciled - r.truth) / r.sigma, 2) : "—"}
                </Table.Td>
              )}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Box>
  );
}

export function BayesPage({ honest }: { honest: OpResult }): JSX.Element {
  const t = honest.streams!;
  const d = honest.diag;
  return (
    <Stack gap="md">
      {step(4)}
      {step(5)}
      <PlantDiagram rows={t.rows} label={(r) => `${fmt(r.reconciled, 2)}  (read ${fmt(r.reading, 1)})`} />
      <Text size="sm">
        The engine's answer on the honest snapshot: the objective at the answer is{" "}
        <b>{fmt(d.objective, 3)}</b>, and every balance now closes (the column &ldquo;after&rdquo;).
        The &ldquo;by&rdquo; columns split each adjustment, in meter sigmas, into the part each
        balance caused; they add up to (x̂ − m)/σ on every row.
      </Text>
      <ReconciliationTable t={t} />
      {step(6)}
      <BalanceTable rows={honest.balances!} after />
      {step(7)}
      <Text size="sm">
        On this snapshot: rms error of the readings <b>{fmt(d.rmsErrorReadingSigma, 3)}</b> meter
        sigmas, of the reconciled flows <b>{fmt(d.rmsErrorReconciledSigma, 3)}</b>.
      </Text>
    </Stack>
  );
}

// ---- page 3 ------------------------------------------------------------------

const METERS = ["F1", "F2", "F3", "F4", "F5", "F6", "F7"];
const SIZE_KNOB: PanelKnob = {
  id: "size", label: "Planted gross error", min: DRIFT_MIN, max: DRIFT_MAX, step: 1,
  unit: DR_UNIT, why: "added to the chosen meter's reading before anything else",
};

export function GrossPage({ run, meter, size, setMeter, setSize }: {
  run: MethodRunState; meter: string; size: number;
  setMeter: (m: string) => void; setSize: (v: number) => void;
}): JSX.Element {
  const kept = opOf(run, "drifted", "drifted");
  const without = opOf(run, "driftedWithout", "driftedWithout");
  return (
    <Stack gap="md">
      {step(8)}
      <Box px="sm" py={8} style={{ border: `1px solid ${BORDER}`, borderRadius: 4 }}>
        <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={6}>plant a gross error</Text>
        <Group align="flex-end" gap="lg" wrap="wrap">
          <Box>
            <Text size="xs" mb={4}>meter</Text>
            <SegmentedControl size="xs" value={meter} onChange={setMeter} data={METERS} />
          </Box>
          <Box style={{ minWidth: 240, flex: 1 }}>
            <KnobSlider knob={SIZE_KNOB} value={size} onChange={setSize} />
          </Box>
        </Group>
        <Text size="xs" c="dimmed" mt={6}>
          The engine runs the witness again with <code>syntheticDrift {"{"} meter {meter}; size{" "}
          {size} t/h; {"}"}</code> in both drifted operations and <code>exclude {meter};</code> in the
          second.  {run.busy ? "re-running…" : ""}
        </Text>
      </Box>
      <RunGate run={run}>{() => {
        if (kept.why || without.why)
          return <Alert color="red" variant="light" title="the run did not publish what this page reads">
            <Text size="sm">{kept.why ?? without.why}</Text></Alert>;
        const flagged = new Set(kept.streams!.rows.filter((r) => r.flagged).map((r) => r.stream));
        const ex = without.streams!.rows.find((r) => r.excluded);
        return (
          <Stack gap="md">
            <PlantDiagram rows={kept.streams!.rows} flagged={flagged}
              label={(r) => `${fmt(r.reading, 1)}  z ${fmtSigned(r.measurementTest, 2)}`} />
            <BalanceTable rows={kept.balances!} />
            {step(9)}
            {step(10)}
            <Group gap="md" align="stretch" wrap="wrap">
              <GlobalTest diag={kept.diag} title={`${meter} left in`} />
              <GlobalTest diag={without.diag} title={`${meter} out of service`} />
            </Group>
            {step(11)}
            <Box style={{ overflowX: "auto" }}>
              <Table striped withTableBorder fz="xs" miw={640}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>stream</Table.Th>
                    <Table.Th ta="right">reading</Table.Th>
                    <Table.Th ta="right">z, left in</Table.Th>
                    <Table.Th ta="right">x̂, left in</Table.Th>
                    <Table.Th ta="right">x̂, {meter} removed</Table.Th>
                    <Table.Th ta="right">σ(x̂), removed</Table.Th>
                    <Table.Th ta="right">true (synthetic)</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {kept.streams!.rows.map((r) => {
                    const w = without.streams!.rows.find((q) => q.stream === r.stream);
                    return (
                      <Table.Tr key={r.stream}>
                        <Table.Td fw={r.flagged ? 700 : 400} c={r.flagged ? "red" : undefined}>
                          {r.stream}{r.flagged ? " (flagged)" : ""}
                        </Table.Td>
                        <Table.Td ta="right">{fmt(r.reading, 1)}</Table.Td>
                        <Table.Td ta="right">{fmtSigned(r.measurementTest, 2)}</Table.Td>
                        <Table.Td ta="right">{fmt(r.reconciled, 2)}</Table.Td>
                        <Table.Td ta="right" fw={w?.excluded ? 700 : 400}>
                          {fmt(w?.reconciled, 2)}{w?.excluded ? " (from the balances)" : ""}
                        </Table.Td>
                        <Table.Td ta="right">{fmt(w?.sigmaReconciled, 2)}</Table.Td>
                        <Table.Td ta="right">{fmt(r.truth, 1)}</Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Box>
            <BalanceTable rows={without.balances!} />
            {ex && (
              <Text size="sm">
                With {ex.stream} out of service the rest of the plant says {ex.stream} ={" "}
                <b>{fmt(ex.reconciled, 2)} ± {fmt(ex.sigmaReconciled, 2)}</b> {DR_UNIT}; the meter read{" "}
                {fmt(ex.reading, 1)}, so it reads <b>{fmtSigned(ex.offset, 2)}</b> {DR_UNIT} off —{" "}
                <b>{fmtSigned(ex.offsetTest, 3)}</b> standard deviations.  Its measurement test while
                in service was <b>{fmtSigned(kept.streams!.rows.find((r) => r.stream === ex.stream)?.measurementTest, 3)}</b>.
              </Text>
            )}
          </Stack>
        );
      }}</RunGate>
    </Stack>
  );
}

// ---- page 4 ------------------------------------------------------------------

/** Three bell curves for one flow -- the reading, the prior, and the
 *  precision-weighted combination -- and the posterior after the balances.
 *  Every centre and width is a number the engine published; the curve is
 *  the Gaussian density drawn through them. */
function Bells({ r }: { r: StreamRow }): JSX.Element | null {
  if (r.reading === null || r.sigma === null || r.prior === null || r.priorSigma === null
    || r.combined === null || r.combinedSigma === null) return null;
  const curves = [
    { label: `reading ${fmt(r.reading, 1)} ± ${fmt(r.sigma, 2)}`, mu: r.reading, s: r.sigma, color: INK, dash: "4 3" },
    { label: `prior ${fmt(r.prior, 1)} ± ${fmt(r.priorSigma, 2)}`, mu: r.prior, s: r.priorSigma, color: "var(--mantine-color-orange-6)", dash: "4 3" },
    { label: `combined ${fmt(r.combined, 2)} ± ${fmt(r.combinedSigma, 2)}`, mu: r.combined, s: r.combinedSigma, color: ACCENT, dash: "" },
    { label: `after the balances ${fmt(r.reconciled, 2)} ± ${fmt(r.sigmaReconciled, 2)}`, mu: r.reconciled, s: r.sigmaReconciled, color: "var(--mantine-color-teal-7)", dash: "" },
  ];
  const lo = Math.min(...curves.map((c) => c.mu - 3.2 * c.s));
  const hi = Math.max(...curves.map((c) => c.mu + 3.2 * c.s));
  const W = 640, H = 200, L = 36, R = 12, T = 10, B = 30;
  const peak = Math.max(...curves.map((c) => 1 / c.s));
  const X = (v: number) => L + ((v - lo) / (hi - lo)) * (W - L - R);
  const Y = (p: number) => T + (1 - p / peak) * (H - T - B);
  const pts = (mu: number, s: number) => Array.from({ length: 161 }, (_, i) => {
    const v = lo + (i / 160) * (hi - lo);
    return `${X(v).toFixed(1)},${Y(Math.exp(-0.5 * ((v - mu) / s) ** 2) / s).toFixed(1)}`;
  }).join(" ");
  const ticks = Array.from({ length: 6 }, (_, i) => lo + (i / 5) * (hi - lo));
  return (
    <Box>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 700, display: "block" }}
        role="img" aria-label={`the reading, the prior and their combination for ${r.stream}`}>
        <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke={BORDER} />
        {ticks.map((t) => (
          <text key={t} x={X(t)} y={H - B + 14} fontSize={10} textAnchor="middle" fill={INK}>{t.toFixed(1)}</text>
        ))}
        <text x={(W + L) / 2} y={H - 2} fontSize={10} textAnchor="middle" fill={INK}>{r.stream} [{DR_UNIT}]</text>
        {curves.map((c) => (
          <polyline key={c.label} points={pts(c.mu, c.s)} fill="none" stroke={c.color} strokeWidth={1.8}
            strokeDasharray={c.dash || undefined} />
        ))}
      </svg>
      <Group gap="md" mt={4} wrap="wrap">
        {curves.map((c) => (
          <Text key={c.label} size="xs">
            <Box component="span" display="inline-block" w={18} h={3} mr={6}
              style={{ background: c.color, verticalAlign: "middle" }} />
            {c.label}
          </Text>
        ))}
      </Group>
    </Box>
  );
}

export function PriorPage({ honest, prior }: { honest: OpResult; prior: OpResult }): JSX.Element {
  const [flow, setFlow] = useState("F2");
  const h = honest.streams!.rows, p = prior.streams!.rows;
  const cov = honest.cov!;
  const rowP = p.find((r) => r.stream === flow)!;
  return (
    <Stack gap="md">
      {step(12)}
      <Box style={{ overflowX: "auto" }}>
        <Table striped withTableBorder fz="xs" miw={520}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>stream</Table.Th>
              <Table.Th ta="right">meter σ</Table.Th>
              <Table.Th ta="right">reconciled σ (flat prior)</Table.Th>
              <Table.Th ta="right">prior s (yesterday)</Table.Th>
              <Table.Th ta="right">combined σ*</Table.Th>
              <Table.Th ta="right">reconciled σ (with prior)</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {h.map((r) => {
              const q = p.find((x) => x.stream === r.stream);
              return (
                <Table.Tr key={r.stream}>
                  <Table.Td>{r.stream}</Table.Td>
                  <Table.Td ta="right">{fmt(r.sigma, 2)}</Table.Td>
                  <Table.Td ta="right" fw={600}>{fmt(r.sigmaReconciled, 3)}</Table.Td>
                  <Table.Td ta="right">{fmt(q?.priorSigma, 2)}</Table.Td>
                  <Table.Td ta="right">{fmt(q?.combinedSigma, 3)}</Table.Td>
                  <Table.Td ta="right" fw={600}>{fmt(q?.sigmaReconciled, 3)}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Box>
      <Text size="sm">
        The posterior covariance Σ of the honest reconciliation, in ({DR_UNIT})², as the engine wrote it:
      </Text>
      <Box style={{ overflowX: "auto" }}>
        <Table withTableBorder fz="xs" miw={520}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th />
              {cov.streams.map((s) => <Table.Th key={s} ta="right">{s}</Table.Th>)}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {cov.streams.map((s, i) => (
              <Table.Tr key={s}>
                <Table.Td fw={600}>{s}</Table.Td>
                {cov.cell[i]!.map((v, j) => (
                  <Table.Td key={j} ta="right" fw={i === j ? 700 : 400}
                    c={Math.abs(v) < 1e-9 ? "dimmed" : undefined}>{fmt(Math.abs(v) < 1e-12 ? 0 : v, 3)}</Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>
      {step(13)}
      <Box>
        <Text size="xs" mb={4}>flow</Text>
        <SegmentedControl size="xs" value={flow} onChange={setFlow} data={p.map((r) => r.stream)} />
      </Box>
      <Bells r={rowP} />
      <Text size="xs" c="dimmed">
        The dashed curves are the reading and the prior; the blue one is their precision-weighted
        product (the engine's combined value and σ*); the green one is the same flow after the
        balances have let the other six meters vouch for it.  The densities are drawn to their own
        heights: a narrower curve stands taller.
      </Text>
      {step(14)}
      <Group gap="md" align="stretch" wrap="wrap">
        <GlobalTest diag={prior.diag} title="with yesterday's prior" />
        <Box px="sm" py={6} style={{ border: `1px solid ${BORDER}`, borderRadius: 4, flex: 1, minWidth: 240 }}>
          <Text size="xs" c="dimmed" fw={700} tt="uppercase">prior against the readings</Text>
          <Text size="sm" mt={4}>
            γ<sub>prior</sub> = <b>{fmt(prior.diag.priorConflict, 2)}</b> against χ²
            <sub>{fmt(prior.diag.priorConflictDof, 0)}</sub> critical{" "}
            <b>{fmt(prior.diag.priorConflictCritical, 2)}</b>; p = {fmt(prior.diag.priorConflictPValue, 3)}
          </Text>
        </Box>
      </Group>
      <ReconciliationTable t={prior.streams!} />
      {step(15)}
    </Stack>
  );
}

// ---- the tool ----------------------------------------------------------------

export function DataReconciliationTool(): JSX.Element {
  const [page, setPage] = useState<PageId>("why");
  const [meter, setMeter] = useState(DRIFT_DEFAULT_METER);
  const [size, setSize] = useState(DRIFT_DEFAULT_SIZE);
  //  The shipped run serves every page; page 3's knobs start a second run
  //  only once they leave the case's own drift.
  const base = useMethodRun(DR_WITNESS, [], "", "choupoProps");
  const shipped = meter === DRIFT_DEFAULT_METER && size === DRIFT_DEFAULT_SIZE;
  const knobs = useMemo(() => driftOverrides(meter, size), [meter, size]);
  const explore = useMethodRun(page === "gross" && !shipped ? DR_WITNESS : null, knobs,
    `${meter}:${size}`, "choupoProps");
  const honest = useMemo(() => opOf(base, "honest", "honest"), [base]);
  const prior = useMemo(() => opOf(base, "yesterday", "yesterday"), [base]);

  const ready = (o: OpResult, body: () => JSX.Element): JSX.Element => (
    <RunGate run={base}>{() => (o.why
      ? <Alert color="red" variant="light" title="the run did not publish what this page reads">
          <Text size="sm">{o.why}</Text></Alert>
      : body())}</RunGate>
  );

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto" }}>
        <Box>
          <Title order={3}>Data reconciliation, and how Bayes helps</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Plant meters are noisy, so their readings never close the mass balances the true flows
            obey.  Reconciliation finds the flows that do, moving each reading as little as its
            meter allows — and that answer is also the most probable true state, given Gaussian
            meters and a flat prior.  Then: how to tell noise from a meter that lies, and what a
            prior that is not flat adds.
          </Text>
        </Box>
        <Alert color="gray" variant="light" title="Synthetic data, said plainly">
          <Text size="sm">
            The plant, its true flows, the meter uncertainties, the noise, the planted gross error
            and yesterday&apos;s prior are all invented for the exercise; the case files say so line
            by line.  Every number on the page is the engine&apos;s, from a run of{" "}
            <code>{DR_WITNESS}</code> in your browser.
          </Text>
        </Alert>
        <SegmentedControl fullWidth value={page} onChange={(v) => setPage(v as PageId)} data={PAGES} />
        {page === "why" && ready(honest, () => <WhyPage honest={honest} />)}
        {page === "bayes" && ready(honest, () => <BayesPage honest={honest} />)}
        {page === "gross" && (
          <GrossPage run={shipped ? base : explore} meter={meter} size={size}
            setMeter={setMeter} setSize={setSize} />
        )}
        {page === "prior" && ready(prior, () => <PriorPage honest={honest} prior={prior} />)}
        <LessonLimits limits={DR_LIMITS} />
      </Stack>
    </Box>
  );
}
