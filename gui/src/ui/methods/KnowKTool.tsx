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
  KnowKTool -- the EduTool `how-do-we-know-k`, "How do we know k?".

  The student's task, in one sentence: "How do you isolate ONE reaction among
  the dozens in a flame and read its k, its activation energy and its
  pressure dependence from a signal?"  The page answers by doing it: the
  engine's batch reactor is the cell of a flash-photolysis experiment, the
  amount of OH (or of H2O2) is the signal, and the page fits it as an
  experimenter would -- one decay, k' against the excess, an Arrhenius plot,
  the fall-off in pressure, and the two ways the method breaks.

  NO RUN STARTS ON OPENING.  Each panel runs when its button is pressed, and
  a change of a knob stops the panel's runs and asks for the button again.

  WHERE EVERY NUMBER COMES FROM.  The signals are the engine's (case/knowK.ts
  names the one witness and the dict numbers a knob rewrites).  The page
  fits straight lines to them and compares each fit with the k the ENGINE
  evaluates: the law it announced when it loaded the reaction, read from the
  run's own log.  The optional noise is seeded, multiplicative and labelled
  synthetic.  The plot, the panel and the table wrapper are the isotherm
  page's, imported, not redrawn.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import {
  Alert, Badge, Box, Button, Group, Loader, SegmentedControl, Slider, Stack, Table, Text, Title,
} from "@mantine/core";

import { tutorialByName } from "../../cases/tutorials.js";
import {
  ARR_XH2, BREAK_XH2, BREAK_XOH, CELL_PRESSURE, FALLOFF_P_BAR, FALLOFF_T, FALLOFF_XH2O2,
  KNOW_K_WITNESS, NOISE_SEEDS, ONE_XH2_STOPS, R_GAS, ROP_TIME, RXN_FALLOFF, RXN_OH_H2, SEED_XOH,
  SERIES_XH2, T_STOPS, announcedLaws, arrheniusFit, concMolCm3, effectiveEa, engineBimolecularK,
  engineFalloff, fitDecay, linearFit, recordExponents, ropOf, signalOf, withNoise,
} from "../../case/knowK.js";
import { useDecaySweep, type DecayPoint, type DecayRun } from "../../case/knowKRun.js";
import { Panel, Wide, XYPlot, fmt } from "./AdsorptionIsothermsTool.js";
import { LessonLimits, LessonReferences, TexText, lessonStepper } from "./lessonStep.js";
import { KNOW_K_LIMITS, KNOW_K_QUIZ, KNOW_K_STEPS, KNOW_K_TASK } from "./knowKLesson.js";
import { LessonQuiz } from "./lessonQuiz.js";

type XY = readonly [number, number];
const DATA = "#2a78d6", FIT = "#d4572a", RECORD = "#1baf7a", CHECK = "#8a8a8a", ALT = "#8e44ad";

const step = lessonStepper(KNOW_K_STEPS);

const NOISE_STOPS: readonly { label: string; v: number }[] = [
  { label: "none", v: 0 }, { label: "1 %", v: 0.01 }, { label: "3 %", v: 0.03 }, { label: "10 %", v: 0.1 },
];

/** The record text the cell's reactions come from. */
function reactionsText(): string {
  return tutorialByName(KNOW_K_WITNESS)?.files.rawFiles?.["constant/reactions"] ?? "";
}

/** The watched signal of a run, as the instrument reports it (noise on), and
 *  its decay fit. */
function measure(run: DecayRun | null, species: "OH" | "H2O2", sigma: number, seed: number) {
  const traj = run?.run.trajectory;
  const sig = traj ? signalOf(traj, species) : null;
  if (!run || !sig) return null;
  const reported = withNoise(sig.n, sigma, seed);
  const decay = fitDecay(sig.t, reported);
  return { t: sig.t, n0: sig.n[0]!, reported, decay };
}

const winText = (r: DecayRun): string =>
  `${r.trials.length === 1 ? "first window kept" : `${r.trials.length} pilot runs`}: `
  + r.trials.map((w) => `${fmt(w, 2)} s`).join(" → ")
  + (r.good ? "" : " (the pilot did not settle)");

function RunState({ busy, done, total, errs }: { busy: boolean; done: number; total: number; errs: (string | null)[] }) {
  const err = errs.find((e) => e);
  return (
    <>
      {busy && <Group gap={6}><Loader size="xs" /><Text size="xs">{done} of {total} conditions done (each with its pilot runs)…</Text></Group>}
      {err && <Alert color="red" variant="light" title="the engine did not finish"><Text size="sm">{err}</Text></Alert>}
    </>
  );
}

/** A decay plotted as the experimenter sees it: ln of the signal against t,
 *  the engine's points and the fitted line over the window. */
function decaySeries(m: NonNullable<ReturnType<typeof measure>>, label: string) {
  const d = m.decay;
  const lastShown = d ? Math.min(m.t.length - 1, d.last * 2) : m.t.length - 1;
  const pts: XY[] = [];
  for (let i = 0; i <= lastShown; i++)
    if (m.reported[i]! > 0) pts.push([m.t[i]!, Math.log(m.reported[i]! / m.n0)]);
  const line: XY[] = d
    ? [0, d.last].map((i): XY => [m.t[i]!, Math.log(m.reported[0]! / m.n0) - d.kPrime * m.t[i]!])
    : [];
  return [
    { name: label, color: DATA, points: pts },
    ...(d ? [{ name: "straight-line fit over the first three lifetimes", color: FIT, line }] : []),
  ];
}

// ---------------------------------------------------------------------------------
//  Panel 1: one decay
// ---------------------------------------------------------------------------------

function OneDecayPanel({ T, sigma }: { T: number; sigma: number }): JSX.Element {
  const [xi, setXi] = useState(1);
  const xH2 = ONE_XH2_STOPS[xi]!;
  const key = `one-${T}-${xH2}`;
  const [ran, setRan] = useState<string | null>(null);
  const live = ran === key;
  const pts = useMemo<DecayPoint[] | null>(() => (live ? [{
    key, species: "OH",
    experiment: { T, P: CELL_PRESSURE, xH2, xOH: SEED_XOH, xH2O2: 0 },
  }] : null), [live, key, T, xH2]);
  const sw = useDecaySweep(pts, live ? key : "off");
  const run = sw.results[0] ?? null;
  const m = measure(run, "OH", sigma, NOISE_SEEDS.one);
  const c = concMolCm3(xH2, T, CELL_PRESSURE);
  const kEng = run ? engineBimolecularK(run.run.log, reactionsText(), RXN_OH_H2, T) : null;
  const kApp = m?.decay ? m.decay.kPrime / c : null;
  return (
    <Panel title="1 · one decay: ln of the signal against time" origin={["engine", "page", "assumption"]}
      originNote={`the cell is ${KNOW_K_WITNESS}: the engine's amount of OH; the fit and the ratio are the page's; the noise, when on, is synthetic`}>
      <Group gap="md" align="flex-end" wrap="wrap">
        <Box>
          <Text size="xs" c="dimmed">H2 in the bath, mole fraction (excess over the OH)</Text>
          <SegmentedControl size="xs" value={String(xi)} onChange={(v) => setXi(Number(v))}
            data={ONE_XH2_STOPS.map((x, i) => ({ value: String(i), label: String(x) }))} />
        </Box>
        <Button size="xs" disabled={live} onClick={() => setRan(key)}>Run the experiment in the engine</Button>
        {!live && ran !== null && <Text size="xs" c="dimmed">A knob moved: run again.</Text>}
      </Group>
      <RunState busy={sw.busy} done={sw.done} total={1} errs={sw.errs} />
      {run && m && (
        <>
          <XYPlot tight ariaLabel="ln of the OH signal against time" xLabel="t [s]"
            yLabel="ln (OH signal / initial OH)" series={decaySeries(m, "OH, the engine's amount (as reported)")} />
          <Text size="xs" c="dimmed">{winText(run)}.  The engine writes {m.t.length - 1} instants over the window.</Text>
          {m.decay ? (
            <Wide>
              <Table withTableBorder fz="xs" style={{ width: "auto" }}>
                <Table.Tbody>
                  <Table.Tr><Table.Td>H2 concentration, c = x P / (R T)</Table.Td>
                    <Table.Td ff="monospace">{fmt(c, 4)} mol/cm3</Table.Td></Table.Tr>
                  <Table.Tr><Table.Td>decay constant from the fit, k'</Table.Td>
                    <Table.Td ff="monospace">{fmt(m.decay.kPrime, 4)} ± {fmt(m.decay.seKPrime, 2)} 1/s  ({m.decay.points} points)</Table.Td></Table.Tr>
                  <Table.Tr><Table.Td>k = k' / c</Table.Td>
                    <Table.Td ff="monospace">{kApp !== null ? fmt(kApp, 4) : "—"} cm3/(mol s)</Table.Td></Table.Tr>
                  <Table.Tr><Table.Td>the k the engine evaluates at {T} K (the law it announced, Reaction.cpp:55)</Table.Td>
                    <Table.Td ff="monospace">{kEng !== null ? fmt(kEng, 4) : "—"} cm3/(mol s)</Table.Td></Table.Tr>
                  <Table.Tr><Table.Td>recovered / engine</Table.Td>
                    <Table.Td ff="monospace">{kApp !== null && kEng !== null ? fmt(kApp / kEng, 4) : "—"}</Table.Td></Table.Tr>
                </Table.Tbody>
              </Table>
            </Wide>
          ) : <Alert color="gray" variant="light" title="no decay to fit"><Text size="sm">The signal did not fall in the window.</Text></Alert>}
        </>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------------
//  Panel 2: k' against the excess
// ---------------------------------------------------------------------------------

function SeriesPanel({ T, sigma }: { T: number; sigma: number }): JSX.Element {
  const key = `series-${T}`;
  const [ran, setRan] = useState<string | null>(null);
  const live = ran === key;
  const pts = useMemo<DecayPoint[] | null>(() => (live ? SERIES_XH2.map((x) => ({
    key: `${key}-${x}`, species: "OH" as const,
    experiment: { T, P: CELL_PRESSURE, xH2: x, xOH: SEED_XOH, xH2O2: 0 },
  })) : null), [live, key, T]);
  const sw = useDecaySweep(pts, live ? key : "off");
  const ms = sw.results.map((r, i) => measure(r, "OH", sigma, NOISE_SEEDS.series + i));
  const have = ms.length === pts?.length && ms.every((m) => m?.decay);
  const cs = SERIES_XH2.map((x) => concMolCm3(x, T, CELL_PRESSURE));
  const kps = ms.map((m) => m?.decay?.kPrime ?? NaN);
  const fit = have ? linearFit(cs, kps) : null;
  const first = sw.results[0];
  const kEng = first ? engineBimolecularK(first.run.log, reactionsText(), RXN_OH_H2, T) : null;
  const cMax = Math.max(...cs);
  return (
    <Panel title="2 · k' against the excess: the slope is k" origin={["engine", "page"]}
      originNote={`${SERIES_XH2.length} engine runs at one temperature; the line is a least-squares fit with a free intercept, drawn by the page`}>
      <Group gap="md" wrap="wrap">
        <Button size="xs" disabled={live} onClick={() => setRan(key)}>
          Run {SERIES_XH2.length} concentrations of H2 at {T} K
        </Button>
        {!live && ran !== null && <Text size="xs" c="dimmed">A knob moved: run again.</Text>}
      </Group>
      <RunState busy={sw.busy} done={sw.done} total={SERIES_XH2.length} errs={sw.errs} />
      {have && fit && (
        <>
          <XYPlot tight ariaLabel="pseudo-first-order constant against the H2 concentration"
            xLabel="H2 concentration [mol/cm3]" yLabel="k' [1/s]"
            series={[
              { name: "k' of each run", color: DATA, points: cs.map((c, i): XY => [c, kps[i]!]) },
              { name: "straight line through them", color: FIT, line: [[0, fit.intercept], [cMax, fit.intercept + fit.slope * cMax]] },
              ...(kEng !== null ? [{ name: "the engine's k times c (check)", color: RECORD, dash: "6 4",
                line: [[0, 0], [cMax, kEng * cMax]] as XY[] }] : []),
            ]} />
          <Wide>
            <Table withTableBorder fz="xs" style={{ width: "auto" }}>
              <Table.Tbody>
                <Table.Tr><Table.Td>slope: k</Table.Td>
                  <Table.Td ff="monospace">{fmt(fit.slope, 4)} ± {fmt(fit.seSlope, 2)} cm3/(mol s)</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>intercept: k'0, the loss that does not depend on H2</Table.Td>
                  <Table.Td ff="monospace">{fmt(fit.intercept, 3)} ± {fmt(fit.seIntercept, 2)} 1/s</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>the k the engine evaluates at {T} K</Table.Td>
                  <Table.Td ff="monospace">{kEng !== null ? fmt(kEng, 4) : "—"} cm3/(mol s)</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>slope / engine</Table.Td>
                  <Table.Td ff="monospace">{kEng !== null ? fmt(fit.slope / kEng, 4) : "—"}</Table.Td></Table.Tr>
              </Table.Tbody>
            </Table>
          </Wide>
          <Text size="xs" c="dimmed">
            Windows: {sw.results.map((r) => (r ? `${fmt(r.window, 2)} s` : "…")).join(", ")}.
          </Text>
        </>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------------
//  Panel 3: Arrhenius
// ---------------------------------------------------------------------------------

function ArrheniusPanel({ sigma }: { sigma: number }): JSX.Element {
  const key = "arrhenius";
  const [ran, setRan] = useState<string | null>(null);
  const live = ran === key;
  const pts = useMemo<DecayPoint[] | null>(() => (live ? T_STOPS.map((T) => ({
    key: `${key}-${T}`, species: "OH" as const,
    experiment: { T, P: CELL_PRESSURE, xH2: ARR_XH2, xOH: SEED_XOH, xH2O2: 0 },
  })) : null), [live]);
  const sw = useDecaySweep(pts, live ? key : "off");
  const ms = sw.results.map((r, i) => measure(r, "OH", sigma, NOISE_SEEDS.arrhenius + i));
  const have = ms.length === pts?.length && ms.every((m) => m?.decay);
  const ks = T_STOPS.map((T, i) => (ms[i]?.decay ? ms[i]!.decay!.kPrime / concMolCm3(ARR_XH2, T, CELL_PRESSURE) : NaN));
  const fit = have ? arrheniusFit(T_STOPS, ks) : null;
  const rec = reactionsText();
  const first = sw.results[0];
  const ex = recordExponents(rec, RXN_OH_H2);
  const law = first ? announcedLaws(first.run.log).get(RXN_OH_H2) ?? null : null;
  const kEngAt = (T: number): number | null =>
    (first ? engineBimolecularK(first.run.log, rec, RXN_OH_H2, T) : null);
  const invT = (T: number) => 1000 / T;
  const Tmean = fit ? 1 / (T_STOPS.reduce((s, T) => s + 1 / T, 0) / T_STOPS.length) : NaN;
  const curve: XY[] = T_STOPS.map((T): XY => [invT(T), Math.log(kEngAt(T) ?? NaN)]);
  return (
    <Panel title="3 · Arrhenius: the same experiment at several temperatures" origin={["engine", "page"]}
      originNote={`${T_STOPS.length} engine runs, one per temperature, at one excess; k = k' / c at each; the line is a least-squares fit of ln k on 1/T`}>
      <Group gap="md" wrap="wrap">
        <Button size="xs" disabled={live} onClick={() => setRan(key)}>
          Run {T_STOPS.length} temperatures, {T_STOPS[0]} to {T_STOPS[T_STOPS.length - 1]} K
        </Button>
      </Group>
      <RunState busy={sw.busy} done={sw.done} total={T_STOPS.length} errs={sw.errs} />
      {have && fit && (
        <>
          <XYPlot tight ariaLabel="ln k against 1000 over T" xLabel="1000 / T [1/K]" yLabel="ln k  (k in cm3/(mol s))"
            series={[
              { name: "k = k' / c from each run", color: DATA, points: T_STOPS.map((T, i): XY => [invT(T), Math.log(ks[i]!)]) },
              { name: "straight line through them", color: FIT,
                line: [invT(T_STOPS[0]!), invT(T_STOPS[T_STOPS.length - 1]!)].map((x): XY => [x, fit.lnA - (fit.EaApp / R_GAS) * (x / 1000)]) },
              { name: "the engine's law (check)", color: RECORD, dash: "6 4", line: curve },
            ]} />
          <Wide>
            <Table withTableBorder fz="xs" style={{ width: "auto" }}>
              <Table.Tbody>
                <Table.Tr><Table.Td>apparent activation energy from the line</Table.Td>
                  <Table.Td ff="monospace">{fmt(fit.EaApp / 1000, 4)} ± {fmt(fit.seEa / 1000, 2)} kJ/mol</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>Ea + b R T at the middle of the range (T = {fmt(Tmean, 4)} K), from the record</Table.Td>
                  <Table.Td ff="monospace">{ex && law ? fmt(effectiveEa(law.Ea, ex.b, Tmean) / 1000, 4) : "—"} kJ/mol</Table.Td></Table.Tr>
                <Table.Tr><Table.Td>the record's b (temperature exponent), as written in the case</Table.Td>
                  <Table.Td ff="monospace">{ex ? ex.b : "—"}</Table.Td></Table.Tr>
              </Table.Tbody>
            </Table>
          </Wide>
          <Wide>
            <Table withTableBorder fz="xs" style={{ width: "auto" }}>
              <Table.Thead><Table.Tr><Table.Th>T [K]</Table.Th><Table.Th>k recovered</Table.Th>
                <Table.Th>k of the engine</Table.Th><Table.Th>ratio</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {T_STOPS.map((T, i) => (
                  <Table.Tr key={T}>
                    <Table.Td ff="monospace">{T}</Table.Td>
                    <Table.Td ff="monospace">{fmt(ks[i]!, 4)}</Table.Td>
                    <Table.Td ff="monospace">{kEngAt(T) !== null ? fmt(kEngAt(T)!, 4) : "—"}</Table.Td>
                    <Table.Td ff="monospace">{kEngAt(T) !== null ? fmt(ks[i]! / kEngAt(T)!, 4) : "—"}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Wide>
        </>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------------
//  Panel 4: fall-off
// ---------------------------------------------------------------------------------

function FalloffPanel({ sigma }: { sigma: number }): JSX.Element {
  const [ti, setTi] = useState(0);
  const T = FALLOFF_T[ti]!;
  const key = `falloff-${T}`;
  const [ran, setRan] = useState<string | null>(null);
  const live = ran === key;
  const pts = useMemo<DecayPoint[] | null>(() => (live ? FALLOFF_P_BAR.map((p) => ({
    key: `${key}-${p}`, species: "H2O2" as const,
    experiment: { T, P: p * 1e5, xH2: 0, xOH: 0, xH2O2: FALLOFF_XH2O2 },
  })) : null), [live, key, T]);
  const sw = useDecaySweep(pts, live ? key : "off");
  const ms = sw.results.map((r, i) => measure(r, "H2O2", sigma, NOISE_SEEDS.falloff + i));
  const have = ms.length === pts?.length && ms.every((m) => m?.decay);
  const rec = reactionsText();
  const first = sw.results[0];
  const M = (pBar: number) => (pBar * 1e5) / (R_GAS * T) * 1e-3;      // kmol/m3, all-N2 bath
  const laws = FALLOFF_P_BAR.map((p) => (first ? engineFalloff(first.run.log, rec, RXN_FALLOFF, T, M(p)) : null));
  const ok = laws.every((l) => l !== null);
  const ks = ms.map((m) => m?.decay?.kPrime ?? NaN);
  const grid: number[] = Array.from({ length: 60 }, (_, i) =>
    FALLOFF_P_BAR[0]! * Math.pow(FALLOFF_P_BAR[FALLOFF_P_BAR.length - 1]! / FALLOFF_P_BAR[0]!, i / 59));
  const lawsGrid = grid.map((p) => (first ? engineFalloff(first.run.log, rec, RXN_FALLOFF, T, M(p)) : null));
  const lineOf = (f: (l: NonNullable<typeof lawsGrid[number]>) => number): XY[] =>
    grid.map((p, i): XY => [p, lawsGrid[i] ? f(lawsGrid[i]!) : NaN]);
  return (
    <Panel title="4 · fall-off: H2O2 decomposition against pressure" origin={["engine", "page"]}
      originNote={`${FALLOFF_P_BAR.length} engine runs of H2O2 in N2 at one temperature; the lines are the record's law evaluated by the page as a check (Lindemann and Troe)`}>
      <Group gap="md" align="flex-end" wrap="wrap">
        <Box>
          <Text size="xs" c="dimmed">temperature of the cell, K</Text>
          <SegmentedControl size="xs" value={String(ti)} onChange={(v) => setTi(Number(v))}
            data={FALLOFF_T.map((t, i) => ({ value: String(i), label: String(t) }))} />
        </Box>
        <Button size="xs" disabled={live} onClick={() => setRan(key)}>
          Run {FALLOFF_P_BAR.length} pressures, {FALLOFF_P_BAR[0]} to {FALLOFF_P_BAR[FALLOFF_P_BAR.length - 1]} bar
        </Button>
        {!live && ran !== null && <Text size="xs" c="dimmed">A knob moved: run again.</Text>}
      </Group>
      <RunState busy={sw.busy} done={sw.done} total={FALLOFF_P_BAR.length} errs={sw.errs} />
      {have && ok && (
        <>
          <XYPlot xlog ylog ariaLabel="first-order constant against pressure" xLabel="pressure [bar]"
            yLabel="k [1/s]"
            series={[
              { name: "k from the decay of H2O2 in each run", color: DATA, points: FALLOFF_P_BAR.map((p, i): XY => [p, ks[i]!]) },
              { name: "Troe (the engine's law, check)", color: RECORD, line: lineOf((l) => l.k) },
              { name: "Lindemann (no broadening)", color: ALT, dash: "6 4", line: lineOf((l) => l.kLindemann) },
              { name: "low-pressure limit, k0 [M]", color: CHECK, dash: "2 3", line: lineOf((l) => l.Pr * l.kInf) },
              { name: "high-pressure limit, k_inf", color: CHECK, dash: "10 4", line: lineOf((l) => l.kInf) },
            ]} />
          <Wide>
            <Table withTableBorder fz="xs" style={{ width: "auto" }}>
              <Table.Thead><Table.Tr><Table.Th>P [bar]</Table.Th><Table.Th>P_r</Table.Th><Table.Th>F</Table.Th>
                <Table.Th>k measured [1/s]</Table.Th><Table.Th>k of the engine [1/s]</Table.Th><Table.Th>ratio</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {FALLOFF_P_BAR.map((p, i) => (
                  <Table.Tr key={p}>
                    <Table.Td ff="monospace">{p}</Table.Td>
                    <Table.Td ff="monospace">{fmt(laws[i]!.Pr, 3)}</Table.Td>
                    <Table.Td ff="monospace">{fmt(laws[i]!.F, 3)}</Table.Td>
                    <Table.Td ff="monospace">{fmt(ks[i]!, 4)}</Table.Td>
                    <Table.Td ff="monospace">{fmt(laws[i]!.k, 4)}</Table.Td>
                    <Table.Td ff="monospace">{fmt(ks[i]! / laws[i]!.k, 4)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Wide>
          <Text size="xs" c="dimmed">
            Windows: {sw.results.map((r) => (r ? `${fmt(r.window, 2)} s` : "…")).join(", ")}.  The
            pressures go far above what an ideal gas obeys; the engine's cell is an ideal gas by
            declaration, so the high end is the model's, not a real gas's.
          </Text>
        </>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------------
//  Panel 5: where the method breaks
// ---------------------------------------------------------------------------------

function BreakPanel({ T, sigma }: { T: number; sigma: number }): JSX.Element {
  const key = `break-${T}`;
  const [ran, setRan] = useState<string | null>(null);
  const live = ran === key;
  const pts = useMemo<DecayPoint[] | null>(() => (live ? BREAK_XOH.map((x) => ({
    key: `${key}-${x}`, species: "OH" as const,
    experiment: { T, P: CELL_PRESSURE, xH2: BREAK_XH2, xOH: x, xH2O2: 0 },
  })) : null), [live, key, T]);
  const sw = useDecaySweep(pts, live ? key : "off");
  const ms = sw.results.map((r, i) => measure(r, "OH", sigma, NOISE_SEEDS.breaks + i));
  const rec = reactionsText();
  const first = sw.results[0];
  const kEng = first ? engineBimolecularK(first.run.log, rec, RXN_OH_H2, T) : null;
  const cH2 = concMolCm3(BREAK_XH2, T, CELL_PRESSURE);
  const delta = BREAK_XOH.map((x) => x / BREAK_XH2);
  const kApp = ms.map((m) => (m?.decay ? m.decay.kPrime / cH2 : NaN));
  const have = ms.length === pts?.length && ms.every((m) => m?.decay);
  const demoIx = BREAK_XOH.length - 2;
  const demo = ms[demoIx] ?? null;
  const demoRun = sw.results[demoIx] ?? null;
  const ropCsv = demoRun ? Object.entries(demoRun.run.csvFiles ?? {})
    .find(([k]) => k.endsWith("rateOfProduction.csv"))?.[1] ?? null : null;
  const rop = ropCsv ? ropOf(ropCsv, "OH", ROP_TIME) : null;
  const demoLine: XY[] = demo && kEng !== null
    ? [0, demo.decay?.last ?? 0].map((i): XY => [demo.t[i]!, -kEng * cH2 * demo.t[i]!]) : [];
  return (
    <Panel title="5 · where it breaks: a small excess, and secondary reactions" origin={["engine", "page"]}
      originNote={`${BREAK_XOH.length} engine runs at one H2 fraction with a growing OH seed; the table is the engine's own rateOfProduction.csv`}>
      <Group gap="md" wrap="wrap">
        <Button size="xs" disabled={live} onClick={() => setRan(key)}>
          Run {BREAK_XOH.length} OH seeds at {T} K, H2 fraction {BREAK_XH2}
        </Button>
        {!live && ran !== null && <Text size="xs" c="dimmed">A knob moved: run again.</Text>}
      </Group>
      <RunState busy={sw.busy} done={sw.done} total={BREAK_XOH.length} errs={sw.errs} />
      {have && kEng !== null && (
        <>
          <XYPlot tight xlog ariaLabel="recovered k over the engine's k against the excess ratio"
            xLabel="excess: H2 over OH at t = 0" yLabel="recovered k / engine's k"
            series={[
              { name: "k' / c of each run, over the engine's k", color: DATA,
                points: delta.map((d, i): XY => [1 / d, kApp[i]! / kEng]) },
              { name: "exact (1)", color: CHECK, dash: "6 4", line: [[1 / delta[delta.length - 1]!, 1], [1 / delta[0]!, 1]] },
            ]} />
          <Wide>
            <Table withTableBorder fz="xs" style={{ width: "auto" }}>
              <Table.Thead><Table.Tr><Table.Th>OH seed (mole fraction)</Table.Th><Table.Th>excess, H2/OH</Table.Th>
                <Table.Th>k recovered</Table.Th><Table.Th>recovered / engine</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {BREAK_XOH.map((x, i) => (
                  <Table.Tr key={x}>
                    <Table.Td ff="monospace">{x}</Table.Td>
                    <Table.Td ff="monospace">{fmt(1 / delta[i]!, 3)}</Table.Td>
                    <Table.Td ff="monospace">{fmt(kApp[i]!, 4)}</Table.Td>
                    <Table.Td ff="monospace">{fmt(kApp[i]! / kEng, 4)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Wide>
          {demo && (
            <>
              <Text size="sm">
                The run with seed {BREAK_XOH[demoIx]}: the log plot against the straight line the engine's k
                would give (grey).  The data bend away from it, and the rate-of-production table below is
                why.
              </Text>
              <XYPlot tight ariaLabel="ln of the OH signal for a large seed" xLabel="t [s]"
                yLabel="ln (OH signal / initial OH)"
                series={[
                  ...decaySeries(demo, "OH, the engine's amount (as reported)").slice(0, 1),
                  { name: "a straight line with the engine's k and the starting H2 (check)", color: CHECK, dash: "6 4", line: demoLine },
                ]} />
            </>
          )}
          {rop && (
            <>
              <Text size="sm">
                OH made and used, by reaction, at t = {fmt(rop.at, 3)} s in that run (the engine's
                rateOfProduction block, the eight largest of {rop.rows.length} reactions; a negative number
                removes OH).  Net of all of them: {rop.net !== null ? fmt(rop.net, 3) : "—"} kmol/s.
              </Text>
              <Wide>
                <Table withTableBorder fz="xs" style={{ width: "auto" }}>
                  <Table.Thead><Table.Tr><Table.Th>reaction</Table.Th><Table.Th>nu of OH</Table.Th>
                    <Table.Th>net rate [kmol/(m3 s)]</Table.Th><Table.Th>OH made [kmol/s]</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {rop.rows.slice(0, 8).map((r) => (
                      <Table.Tr key={r.reaction}>
                        <Table.Td ff="monospace">{r.reaction}</Table.Td>
                        <Table.Td ff="monospace">{r.nu}</Table.Td>
                        <Table.Td ff="monospace">{fmt(r.rate, 3)}</Table.Td>
                        <Table.Td ff="monospace">{fmt(r.contribution, 3)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Wide>
            </>
          )}
        </>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------------
//  The page
// ---------------------------------------------------------------------------------

export function KnowKTool(): JSX.Element {
  const [ti, setTi] = useState(2);
  const T = T_STOPS[ti]!;
  const [ni, setNi] = useState(0);
  const sigma = NOISE_STOPS[ni]!.v;
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 980, margin: "0 auto", minWidth: 0 }}>
        <Box>
          <Title order={3}>How do we know k?</Title>
          <Text size="md" mt={6}>{KNOW_K_TASK}</Text>
          <Text size="sm" c="dimmed" mt={6}>
            You do the experiment, in the engine.  The cell is a closed vessel at a chosen temperature
            holding H2 in N2 and a trace of OH made at t = 0, with the whole 19-reaction mechanism of the
            shipped ignition cases switched on.  The amount of OH against time is your signal, and
            you read k from it the way a laboratory does.  Nothing runs until you press a button.
          </Text>
        </Box>

        <Panel title="the cell" origin={["page", "assumption"]}
          originNote="the temperature is a declared dict number of the case; the noise is the page's, seeded, synthetic">
          <Group gap="xl" align="flex-end" wrap="wrap">
            <Box style={{ minWidth: 220, flex: 1 }}>
              <Group justify="space-between"><Text size="xs" c="dimmed">temperature of the cell</Text>
                <Text size="xs" ff="monospace">{T} K</Text></Group>
              <Slider size="xs" mt={4} value={ti} min={0} max={T_STOPS.length - 1} step={1} label={null}
                onChange={setTi} marks={T_STOPS.map((_, i) => ({ value: i }))} />
              <Text size="xs" c="dimmed" mt={6}>Panels 1, 2 and 5 use it; 3 and 4 run their own temperatures.</Text>
            </Box>
            <Box>
              <Text size="xs" c="dimmed">measurement noise on the signal (synthetic, seeded)</Text>
              <SegmentedControl size="xs" value={String(ni)} onChange={(v) => setNi(Number(v))}
                data={NOISE_STOPS.map((n, i) => ({ value: String(i), label: n.label }))} />
              <Badge size="xs" color="gray" tt="none" mt={4}>
                {sigma === 0 ? "the engine's numbers untouched" : "each reading times exp(σ z), z from a seeded normal"}
              </Badge>
            </Box>
          </Group>
        </Panel>

        {step(1)}
        {step(2)}
        <OneDecayPanel T={T} sigma={sigma} />
        {step(3)}
        <SeriesPanel T={T} sigma={sigma} />
        {step(4)}
        <ArrheniusPanel sigma={sigma} />
        {step(5)}
        <FalloffPanel sigma={sigma} />
        {step(6)}
        <BreakPanel T={T} sigma={sigma} />

        <Text size="sm">
          <TexText text={"The engine's k, to which every recovered value is compared, is the law it announced when it "
            + "loaded the reaction, \\(k = A\\,T^b\\,e^{-E_a/RT}\\) in its own units, put in the cm3/(mol s) the "
            + "literature uses.  That agreement shows the method works; it says nothing about whether the "
            + "record matches a real gas."} />
        </Text>

        <LessonQuiz title="Check your understanding" questions={KNOW_K_QUIZ}
          lesson={KNOW_K_STEPS} />

        <LessonLimits limits={KNOW_K_LIMITS} />
        <LessonReferences tool="how-do-we-know-k" />
      </Stack>
    </Box>
  );
}
