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
  OperatorPanelsTool -- the operator-panels EduTool (registry id
  "operator-panels"): "my process publishes dozens of variables; what do I
  put in front of the operator, in what form, and which alarms?"

  WHO COMPUTES WHAT (the origin marks say the same):

    * the RUN and every FACT about a panel are the ENGINE's: the page writes
      a choupoBatch case (the shipped edbatch01 rig, at most one declared
      value changed, its own system/panelDict) and reads the trajectory and
      the result's `panel` block (adapters/panelPayload).  An answer whose
      panel or first instant does not match what was asked is not drawn.
    * the DRAWINGS of the worked panel and of the four display forms are the
      PAGE's illustrations, lesson-local: they place published values on a
      scale and colour an element only where the engine's alarm interval
      says it is in alarm.  This is not the panel workspace of the design
      record (slices S2-S4, not built), and it draws only the lesson's own
      six elements.
    * the alarm onsets per window of step 5 are the PAGE's count over the
      engine's intervals, against an ADJUSTABLE ASSUMPTION of the page.

  Record: docs/design/operator-panels-good-practice.md.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Alert, Badge, Box, Button, Group, Loader, SegmentedControl, Slider, Stack, Table, Text, Title,
} from "@mantine/core";
import { useElementSize } from "@mantine/hooks";

import { useCaseFilesRun, type MethodRunState } from "../../case/methodRun.js";
import { filesToCaseFiles, tutorialByName } from "../../cases/tutorials.js";
import {
  DEFECTS, PANEL_CASE_NAME, PANEL_VARIANTS, PANEL_WITNESS, RIG, alarmOnsets, answerMatches,
  basePanel, defectPanel, growthStages, inAlarmAt, maxOnsetsInWindow, naivePanel, panelCaseFiles,
  variantById, type PanelSpec, type PanelVariantId,
} from "../../case/operatorPanels.js";
import type { PanelElementReport, PanelReport } from "../../adapters/panelPayload.js";
import { KnobNumber, PanelNote } from "./knobPanel.js";
import { OriginMark, type OriginKind } from "./origin.js";
import { LessonLimits, LessonReferences, lessonStepper } from "./lessonStep.js";
import { PANEL_LIMITS, PANEL_STEPS } from "./operatorPanelsLesson.js";

const GRID = "var(--mantine-color-default-border)";
const INK = "var(--mantine-color-dimmed)";
const TEXT = "var(--mantine-color-text)";
const QUIET = "var(--mantine-color-gray-6)";
/** The ONE colour of the panel drawings, reserved for an element in alarm. */
const ALARM = "#c92a2a";

const sig = (v: number | undefined, n = 4): string =>
  (v !== undefined && Number.isFinite(v) ? Number(v.toPrecision(n)).toString() : "—");

// ---- page chrome ------------------------------------------------------------------

function Panel({ title, origin, originNote, children }: {
  title: string; origin: OriginKind | readonly OriginKind[]; originNote?: string; children: ReactNode;
}): JSX.Element {
  return (
    <Box px="sm" py="sm" data-lesson-panel={title} style={{ border: `1px solid ${GRID}`, borderRadius: 6, minWidth: 0 }}>
      <Text size="xs" c="dimmed" fw={700} tt="uppercase" mb={4}>{title}</Text>
      <Box mb={8}><OriginMark of={origin} note={originNote} /></Box>
      <Stack gap={10}>{children}</Stack>
    </Box>
  );
}

function Wide({ children }: { children: ReactNode }): JSX.Element {
  return <Box style={{ overflowX: "auto", maxWidth: "100%" }}>{children}</Box>;
}

function RunState({ run, matches, what }: { run: MethodRunState; matches: boolean; what: string }): JSX.Element | null {
  if (run.err) return <Alert color="red" title="The engine did not answer">{run.err}</Alert>;
  if (run.busy) return <Group gap={6}><Loader size="xs" /><Text size="xs" c="dimmed">choupoBatch is running {what}…</Text></Group>;
  if (run.result && !matches)
    return <Text size="xs" c="dimmed">The last answer belongs to another setting and is not drawn; waiting for the run of this one.</Text>;
  return null;
}

// ---- one run of the rig with one panel -----------------------------------------

interface Answer { run: MethodRunState; report: PanelReport | null; traj: { t: number[]; vars: { [k: string]: number[] } } | null }

function useRigRun(panel: PanelSpec | null, variantId: PanelVariantId, key: string): Answer {
  const variant = variantById(variantId);
  const raw = tutorialByName(PANEL_WITNESS)?.files.rawFiles ?? null;
  const build = panel && raw
    ? () => filesToCaseFiles(PANEL_CASE_NAME, panelCaseFiles(raw, variant, panel))
    : null;
  const run = useCaseFilesRun(build, `${key}|${variantId}`, "choupoBatch");
  const ok = panel !== null && answerMatches(run.result?.panel, run.result?.trajectory, panel, variant);
  return {
    run,
    report: ok ? run.result!.panel! : null,
    traj: ok ? run.result!.trajectory! : null,
  };
}

// ---- a small trend, drawn at its container's width --------------------------------

function MiniTrend({ t, y, yRef, range, limit, cursor, alarmOn, height = 90, aria }: {
  t: readonly number[]; y: readonly number[]; yRef?: readonly number[];
  range: [number, number]; limit?: number; cursor?: number; alarmOn?: boolean; height?: number; aria: string;
}): JSX.Element {
  const { ref, width } = useElementSize();
  const W = Math.max(80, Math.round(width || 260)), H = height, m = 4;
  const tMax = t[t.length - 1] || 1;
  const X = (x: number): number => m + (W - 2 * m) * x / tMax;
  const Y = (v: number): number => {
    const c = Math.min(Math.max(v, range[0]), range[1]);
    return m + (H - 2 * m) * (1 - (c - range[0]) / (range[1] - range[0]));
  };
  const path = (s: readonly number[]): string => s.map((v, i) => `${i ? "L" : "M"}${X(t[i]!).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  return (
    <Box ref={ref} style={{ width: "100%" }}>
      <svg width={W} height={H} role="img" aria-label={aria} style={{ display: "block" }}>
        <rect x={0.5} y={0.5} width={W - 1} height={H - 1} fill="none" stroke={GRID} />
        {limit !== undefined && (
          <line x1={m} x2={W - m} y1={Y(limit)} y2={Y(limit)} stroke={QUIET} strokeDasharray="4 3" />
        )}
        {yRef && <path d={path(yRef)} fill="none" stroke={QUIET} strokeWidth={1.2} strokeDasharray="2 2" />}
        <path d={path(y)} fill="none" stroke={alarmOn ? ALARM : TEXT} strokeWidth={1.6} />
        {cursor !== undefined && <line x1={X(cursor)} x2={X(cursor)} y1={m} y2={H - m} stroke={INK} strokeWidth={0.8} />}
      </svg>
    </Box>
  );
}

/** A horizontal bar on its scale, the limit marked.  The fill turns to the
 *  alarm colour ONLY when the engine's interval says the element is in alarm. */
function ScaleBar({ value, range, limit, alarmOn, aria }: {
  value: number; range: [number, number]; limit?: number; alarmOn?: boolean; aria: string;
}): JSX.Element {
  const f = (v: number): number => Math.min(Math.max((v - range[0]) / (range[1] - range[0]), 0), 1);
  return (
    <Box role="img" aria-label={aria} style={{ position: "relative", height: 14, border: `1px solid ${GRID}`, borderRadius: 2 }}>
      <Box style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${100 * f(value)}%`,
        background: alarmOn ? ALARM : QUIET, opacity: alarmOn ? 0.9 : 0.5 }} />
      {limit !== undefined && (
        <Box style={{ position: "absolute", top: -3, bottom: -3, left: `calc(${100 * f(limit)}% - 1px)`, width: 2, background: TEXT }} />
      )}
    </Box>
  );
}

/** The lamp: a word AND a shape, coloured only when in alarm. */
function Lamp({ alarmOn, normal, high }: { alarmOn: boolean | undefined; normal: string; high: string }): JSX.Element {
  if (alarmOn === undefined) return <Text size="sm" c="dimmed">no alarm declared</Text>;
  return (
    <Group gap={8} wrap="nowrap">
      <svg width={18} height={18} aria-hidden>
        {alarmOn
          ? <polygon points="9,1 17,17 1,17" fill={ALARM} />
          : <circle cx={9} cy={9} r={7} fill="none" stroke={QUIET} strokeWidth={2} />}
      </svg>
      <Text size="sm" fw={alarmOn ? 700 : 500} c={alarmOn ? "red.8" : "dimmed"}>{alarmOn ? high : normal}</Text>
    </Group>
  );
}

// ---- the worked panel, drawn (lesson-local, its six elements only) ---------------

function series(traj: Answer["traj"], col: string): number[] | undefined {
  return traj?.vars[col];
}

function valueAt(traj: Answer["traj"], col: string, i: number): number | undefined {
  return series(traj, col)?.[i];
}

const rng = (e: PanelElementReport): [number, number] => [e.rangeMin ?? 0, e.rangeMax ?? 1];

function WorkedPanel({ report, traj, i }: { report: PanelReport; traj: NonNullable<Answer["traj"]>; i: number }): JSX.Element {
  const t = traj.t[i] ?? 0;
  const el = (name: string): PanelElementReport | undefined => report.elements.find((e) => e.name === name);
  const cell = (e: PanelElementReport | undefined, body: ReactNode, wide = false): JSX.Element | null => {
    if (!e) return null;
    const alarm = inAlarmAt(e, t);
    return (
      <Box key={e.name} p={8} style={{
        border: `${alarm ? 2 : 1}px solid ${alarm ? ALARM : GRID}`, borderRadius: 4, minWidth: 0,
        gridColumn: wide ? "1 / -1" : undefined,
      }}>
        <Group justify="space-between" gap={4} wrap="nowrap">
          <Text size="xs" fw={600} style={{ minWidth: 0 }}>{e.text.title ?? e.name}</Text>
          {alarm && <Badge size="xs" color="red" variant="filled" style={{ flexShrink: 0 }}>ALARM</Badge>}
        </Group>
        {e.published ? body : <Text size="sm" c="dimmed">not published</Text>}
      </Box>
    );
  };
  const trend = (e: PanelElementReport | undefined, unit: string): ReactNode => {
    if (!e) return null;
    const y = series(traj, e.column) ?? [];
    const yr = e.referenceColumn ? series(traj, e.referenceColumn) : undefined;
    return (
      <>
        <Text size="lg" fw={600} ff="monospace">{sig(y[i])} <Text span size="xs" c="dimmed" style={{ fontFamily: "var(--mantine-font-family)" }}>{unit}</Text></Text>
        <MiniTrend t={traj.t} y={y} yRef={yr} range={rng(e)} limit={e.limitHigh} cursor={t}
          alarmOn={inAlarmAt(e, t)} aria={`${e.name} trend`} />
      </>
    );
  };
  const d = el("diluate"), dm = el("demineralisation"), v = el("voltage"), ol = el("overLimiting"),
    cd = el("currentDensity"), tp = el("temperature");
  return (
    <Box style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
      {cell(d, trend(d, "S/m"), true)}
      {cell(dm, trend(dm, "of the salt removed (dotted: Faraday's line)"), true)}
      {cell(v, trend(v, "V"))}
      {cell(ol, <Box mt={6}><Lamp alarmOn={ol ? inAlarmAt(ol, t) : undefined}
        normal={ol?.text.wordNormal ?? "NORMAL"} high={ol?.text.wordHigh ?? "HIGH"} /></Box>)}
      {cell(cd, cd && <>
        <Text size="lg" fw={600} ff="monospace">{sig(valueAt(traj, cd.column, i))} <Text span size="xs" c="dimmed" style={{ fontFamily: "var(--mantine-font-family)" }}>A/m2</Text></Text>
        <ScaleBar value={valueAt(traj, cd.column, i) ?? 0} range={rng(cd)} limit={cd.limitHigh}
          alarmOn={inAlarmAt(cd, t)} aria="current density on its scale" />
      </>)}
      {cell(tp, tp && <Text size="lg" fw={600} ff="monospace">{sig((valueAt(traj, tp.column, i) ?? NaN) - 273.15)} <Text span size="xs" c="dimmed" style={{ fontFamily: "var(--mantine-font-family)" }}>°C</Text></Text>)}
    </Box>
  );
}

/** Everything the engine published, at the cursor: one cell per column. */
function Wall({ traj, i }: { traj: NonNullable<Answer["traj"]>; i: number }): JSX.Element {
  const cols = Object.keys(traj.vars);
  return (
    <Box style={{ display: "grid", gap: 4, gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}
      aria-label="every published series at the cursor">
      {cols.map((c) => (
        <Box key={c} px={6} py={2} style={{ border: `1px solid ${GRID}`, borderRadius: 3, minWidth: 0 }}>
          <Text size="10px" c="dimmed" style={{ overflowWrap: "anywhere" }}>{c}</Text>
          <Text size="xs" ff="monospace">{sig(traj.vars[c]![i], 6)}</Text>
        </Box>
      ))}
    </Box>
  );
}

function TimeCursor({ traj, i, setI }: { traj: NonNullable<Answer["traj"]>; i: number; setI: (n: number) => void }): JSX.Element {
  const n = traj.t.length;
  return (
    <Box>
      <Text size="xs" c="dimmed">Time cursor: t = {sig(traj.t[Math.min(i, n - 1)], 5)} s of {sig(traj.t[n - 1], 5)} s (written instant {Math.min(i, n - 1) + 1} of {n})</Text>
      <Slider min={0} max={n - 1} step={1} value={Math.min(i, n - 1)} onChange={setI} label={null} aria-label="time cursor" />
    </Box>
  );
}

// ---- the engine's facts, as the engine wrote them ----------------------------------

function FactsList({ report }: { report: PanelReport }): JSX.Element {
  const s = report.summary;
  return (
    <Stack gap={6}>
      <Text size="sm">
        {s?.elements ?? report.elements.length} element(s), {s?.alarms ?? 0} alarm(s) declared;
        at most {s?.alarmsMax ?? 0} active at once{s?.alarmsMax ? ` (first at t = ${sig(s.alarmsMaxAt)} s)` : ""}.
      </Text>
      {report.facts.filter((f) => f.kind !== "alarmsActive").length === 0
        && <Text size="sm" c="dimmed">No element-level fact: no limit is crossed, no element is constant, nothing is unpublished.</Text>}
      {report.facts.filter((f) => f.kind !== "alarmsActive").map((f) => (
        <Group key={f.id} gap={6} align="flex-start" wrap="nowrap">
          <Badge size="xs" variant="light" color="gray" tt="none" style={{ flexShrink: 0 }}>{f.kind}</Badge>
          <Text size="xs" style={{ overflowWrap: "anywhere", minWidth: 0 }}>{f.explanation}</Text>
        </Group>
      ))}
      {report.messages.map((m) => (
        <Text key={m.id} size="xs" c="dimmed">
          message <b>{m.name}</b>: {m.fired ? `would be sent at t = ${sig(m.t)} s` : "never sent in this run"} — “{m.text}”
        </Text>
      ))}
    </Stack>
  );
}

// ---- the page ------------------------------------------------------------------------

const step = lessonStepper(PANEL_STEPS);

/** What the operator asks, what answers it, which element shows it (step 2). */
const MAPPING: readonly { task: string; info: string; element: string }[] = [
  { task: "Is the batch normal?", info: "whether the current is past the limiting current", element: "lamp: Limiting current (word + shape)" },
  { task: "Is the stack inside its rating?", info: "current density against the record's 200 A/m2", element: "bar: Current density, limit marked" },
  { task: "How far has the batch got?", info: "the diluate conductivity, the product", element: "trend: Diluate conductivity" },
  { task: "Where is it heading?", info: "the demineralisation against Faraday's straight line", element: "trend: actual against ideal" },
  { task: "Why is it doing that?", info: "the free electrical variable at constant current", element: "trend: Stack voltage" },
  { task: "Is the rig safe for the membranes?", info: "temperature against the record's ceiling", element: "number: Rig temperature" },
];

/** Why each published series that the panel does NOT show is left off. */
const LEFT_OFF: { [suffix: string]: string } = {
  "n_water": "a tank inventory in kmol: the operator reads the product by its conductivity",
  "n_Na": "an ion inventory: the conductivity already says it in the unit the operator measures",
  "n_Cl": "as n_Na",
  "I_A": "constant at constant current: it is the set point, not a measurement that moves",
  "i_lim_A_per_m2": "folded into the lamp, which shows i over i_lim; the limit alone asks no question",
  "i_over_ilim": "shown as the lamp, as a word rather than a number",
  "xi_eff": "a model quantity no instrument at the rig measures",
  "E_mem_pair_V": "a membrane potential: diagnosis, not operation",
  "R_pair_ohm": "a resistance: the voltage trend already shows it changing",
  "P_electric_kW": "an energy figure for the campaign report, not for the rig",
  "W_electric_kJ": "as P_electric_kW",
  "kappa_conc_S_per_m": "the concentrate is not the product; a detail-level quantity",
  "m_dil_Na": "a molality: the conductivity shows the same thing to the operator",
  "m_dil_Cl": "as m_dil_Na",
  "m_conc_Na": "the concentrate's molality: detail level",
  "m_conc_Cl": "as m_conc_Na",
  "n_conc_water": "a concentrate inventory: detail level",
  "n_conc_Na": "as n_conc_water",
  "n_conc_Cl": "as n_conc_water",
  "deminIdeal": "shown, as the reference line on the demineralisation trend",
};

export function OperatorPanelsTool(): JSX.Element {
  const [variant, setVariant] = useState<PanelVariantId>("base");
  const [cursor, setCursor] = useState(32);
  const [revealed, setRevealed] = useState(false);
  const [level, setLevel] = useState<"overview" | "unit" | "detail">("overview");
  const [limit, setLimit] = useState(1);
  const [limitTouched, setLimitTouched] = useState(false);
  const [rate, setRate] = useState(2);
  const [bench, setBench] = useState<string | null>(null);
  const [benchVariant, setBenchVariant] = useState<PanelVariantId>("base");
  const [showKey, setShowKey] = useState(false);

  // ---- the main run: the worked panel on the chosen disturbance
  const base = useMemo(() => basePanel(), []);
  const main = useRigRun(base, variant, "main");
  const v = variantById(variant);
  const ci = main.traj ? Math.min(cursor, main.traj.t.length - 1) : 0;
  const tNow = main.traj?.t[ci] ?? 0;

  // ---- step 5: the moved limit (run only once the student moves it)
  const limitPanel = useMemo(() => basePanel(limit), [limit]);
  const lim = useRigRun(limitTouched ? limitPanel : null, variant, `limit${limit}`);

  // ---- steps 5-7: the bench (on demand)
  const stages = useMemo(() => growthStages(), []);
  const benchPanel: PanelSpec | null = useMemo(() => {
    if (bench === "naive") return naivePanel();
    if (bench === "minimal") return basePanel();
    if (bench === "defect") return defectPanel();
    const g = stages.find((s) => s.id === bench);
    return g ? g.panel : null;
  }, [bench, stages]);
  const bn = useRigRun(benchPanel, benchVariant, `bench${bench}`);
  const benchOf = (keys: readonly string[]): boolean => bench !== null && keys.includes(bench);

  const ol = main.report?.elements.find((e) => e.name === "overLimiting");
  const olLim = lim.report?.elements.find((e) => e.name === "overLimiting");
  const factsFor = (r: PanelReport | null, name: string): string[] =>
    r ? r.facts.filter((f) => f.element === name).map((f) => f.kind) : [];

  const nCols = main.traj ? Object.keys(main.traj.vars).length : 0;
  const nInst = main.traj?.t.length ?? 0;
  const shown = new Set((main.report?.elements ?? []).flatMap((e) => [e.column, e.referenceColumn ?? ""]));

  const variantPicker = (value: PanelVariantId, set: (x: PanelVariantId) => void, label: string): JSX.Element => (
    <Box>
      <Text size="xs" c="dimmed" mb={2}>{label}</Text>
      <SegmentedControl size="xs" fullWidth orientation="vertical" value={value}
        onChange={(x) => set(x as PanelVariantId)}
        data={PANEL_VARIANTS.map((p) => ({ value: p.id, label: p.label }))}
        style={{ maxWidth: 360 }} />
    </Box>
  );

  const runButton = (key: string, label: string, vId: PanelVariantId): JSX.Element => (
    <Button size="xs" variant={bench === key && benchVariant === vId ? "filled" : "light"}
      onClick={() => { setBench(key); setBenchVariant(vId); }}>{label}</Button>
  );

  const benchResult = (keys: readonly string[]): JSX.Element | null => {
    if (!benchOf(keys)) return null;
    return (
      <Panel title={`Engine facts: ${benchPanel?.title ?? ""}, ${variantById(benchVariant).label.toLowerCase()}`}
        origin="engine" originNote="choupoBatch, the panel block of the result">
        <RunState run={bn.run} matches={bn.report !== null} what="the panel under test" />
        {bn.report && <FactsList report={bn.report} />}
      </Panel>
    );
  };

  const onsets = bn.report ? alarmOnsets(bn.report) : [];
  const worst10 = maxOnsetsInWindow(onsets, 600);

  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
    <Stack gap="lg" style={{ maxWidth: 1100, margin: "0 auto" }}>
      <Box>
        <Title order={3}>Operator panels and alarms</Title>
        <Text size="sm" c="dimmed" mt={4}>
          My process publishes dozens of variables: what do I put in front of the operator, in what form,
          and which alarms?  Worked on a batch electrodialysis rig the engine runs.
        </Text>
      </Box>

      {/* ---- step 1 ---- */}
      {step(1)}
      <Panel title="The same run, two ways" origin={["engine", "page"]}
        originNote="the run and the alarm intervals: choupoBatch on edbatch01_constant_current; the drawing: this page">
        {variantPicker(variant, (x) => { setVariant(x); setRevealed(false); }, "Disturbance (a second run of the case with one declared value changed)")}
        <Text size="sm">{v.story}</Text>
        <RunState run={main.run} matches={main.report !== null} what="the rig" />
        {main.traj && main.report && (
          <>
            <TimeCursor traj={main.traj} i={ci} setI={setCursor} />
            <Box style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
              <Box style={{ minWidth: 0 }}>
                <Text size="sm" fw={600}>Everything the engine publishes: {nCols} series × {nInst} instants = {nCols * nInst} numbers</Text>
                <Box mt={6}><Wall traj={main.traj} i={ci} /></Box>
              </Box>
              <Box style={{ minWidth: 0 }}>
                <Text size="sm" fw={600}>The panel: {main.report.elements.length} elements</Text>
                <Box mt={6}><WorkedPanel report={main.report} traj={main.traj} i={ci} /></Box>
              </Box>
            </Box>
            <Text size="sm">What is happening?  Write it down from the wall first, then from the panel, and then open the answer.</Text>
            <Group><Button size="xs" variant="light" onClick={() => setRevealed((r) => !r)}>{revealed ? "Hide the answer" : "Show the answer"}</Button></Group>
            {revealed && <Alert color="gray" title={v.label}>{v.answer}</Alert>}
          </>
        )}
      </Panel>

      {/* ---- step 2 ---- */}
      {step(2)}
      <Panel title="Task, minimum information, element" origin="page" originNote="this page's design reasoning for this rig">
        <Wide>
          <Table withTableBorder withColumnBorders fz="xs" style={{ minWidth: 520 }}>
            <Table.Thead><Table.Tr><Table.Th>the operator asks</Table.Th><Table.Th>the least that answers it</Table.Th><Table.Th>element</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {MAPPING.map((m) => (
                <Table.Tr key={m.task}><Table.Td>{m.task}</Table.Td><Table.Td>{m.info}</Table.Td><Table.Td>{m.element}</Table.Td></Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Wide>
        {main.traj && (
          <>
            <Text size="sm" fw={600}>Left off: {Object.keys(main.traj.vars).filter((c) => !shown.has(c)).length} of the {nCols} published series</Text>
            <Stack gap={2}>
              {Object.keys(main.traj.vars).filter((c) => !shown.has(c)).map((c) => {
                const key = c.startsWith(`${RIG}.`) ? c.slice(RIG.length + 1) : c;
                return (
                  <Text key={c} size="xs" style={{ overflowWrap: "anywhere" }}>
                    <Text span ff="monospace">{c}</Text> — {LEFT_OFF[key] ?? <Text span c="dimmed">no reason written on this page</Text>}
                  </Text>
                );
              })}
            </Stack>
          </>
        )}
      </Panel>

      {/* ---- step 3 ---- */}
      {step(3)}
      <Panel title="One value, four ways: i over i_lim at the cursor" origin={["engine", "page"]}
        originNote="the value and whether it is in alarm: the engine; the four drawings: this page">
        {main.traj && ol ? (() => {
          const y = series(main.traj, ol.column) ?? [];
          const a = inAlarmAt(ol, tNow);
          return (
            <>
              <TimeCursor traj={main.traj} i={ci} setI={setCursor} />
              <Box style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
                <Box p={8} style={{ border: `1px solid ${GRID}`, borderRadius: 4 }}>
                  <Text size="xs" c="dimmed">1 · a bare number</Text>
                  <Text size="xl" ff="monospace" fw={600}>{sig(y[ci], 3)}</Text>
                  <PanelNote>normal or not? the reader must know the limit</PanelNote>
                </Box>
                <Box p={8} style={{ border: `1px solid ${GRID}`, borderRadius: 4 }}>
                  <Text size="xs" c="dimmed">2 · on its scale, limit marked</Text>
                  <Text size="sm" ff="monospace">{sig(y[ci], 3)} <Text span size="xs" c="dimmed" style={{ fontFamily: "var(--mantine-font-family)" }}>of 0 to {sig(ol.rangeMax)}, limit {sig(ol.limitHigh)}</Text></Text>
                  <ScaleBar value={y[ci] ?? 0} range={rng(ol)} limit={ol.limitHigh} alarmOn={a} aria="i over i_lim on its scale" />
                  <PanelNote>how close it is</PanelNote>
                </Box>
                <Box p={8} style={{ border: `1px solid ${GRID}`, borderRadius: 4 }}>
                  <Text size="xs" c="dimmed">3 · a trend</Text>
                  <MiniTrend t={main.traj.t} y={y} range={rng(ol)} limit={ol.limitHigh} cursor={tNow} alarmOn={a} height={70} aria="i over i_lim trend" />
                  <PanelNote>where it is heading</PanelNote>
                </Box>
                <Box p={8} style={{ border: `1px solid ${GRID}`, borderRadius: 4 }}>
                  <Text size="xs" c="dimmed">4 · a lamp</Text>
                  <Box my={6}><Lamp alarmOn={a} normal={ol.text.wordNormal ?? "NORMAL"} high={ol.text.wordHigh ?? "HIGH"} /></Box>
                  <PanelNote>only whether it is normal, in a word and a shape</PanelNote>
                </Box>
              </Box>
              <Text size="xs" c="dimmed">
                Grey while normal; the one colour appears only where the engine's alarm interval for this element
                ({(ol.intervals ?? []).map(([a0, b0]) => `${sig(a0)}–${sig(b0)} s`).join(", ") || "none in this run"}) covers the cursor,
                and the word and the triangle say the same without the colour.  The engine publishes the closest approach of this
                run as {sig(ol.closestApproachFraction, 3)} of the scale.
              </Text>
            </>
          );
        })() : <RunState run={main.run} matches={main.report !== null} what="the rig" />}
      </Panel>

      {/* ---- step 4 ---- */}
      {step(4)}
      <Panel title="Three levels of one plant" origin={["engine", "page"]} originNote="alarm state: the engine's intervals; the levels: this page's drawing">
        <SegmentedControl size="xs" value={level} onChange={(x) => setLevel(x as typeof level)}
          data={[{ value: "overview", label: "Overview" }, { value: "unit", label: "Unit" }, { value: "detail", label: "Detail" }]} />
        {main.traj && main.report && (() => {
          const active = main.report.elements.filter((e) => inAlarmAt(e, tNow)).length;
          if (level === "overview")
            return (
              <Wide>
                <Table withTableBorder fz="sm" style={{ minWidth: 300 }}>
                  <Table.Thead><Table.Tr><Table.Th>unit</Table.Th><Table.Th>state at t = {sig(tNow)} s</Table.Th><Table.Th>active alarms</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody><Table.Tr>
                    <Table.Td>{RIG} (batch electrodialysis)</Table.Td>
                    <Table.Td><Text span fw={active ? 700 : 400} c={active ? "red.8" : "dimmed"}>{active ? "▲ ABNORMAL" : "○ NORMAL"}</Text></Table.Td>
                    <Table.Td>{active}</Table.Td>
                  </Table.Tr></Table.Tbody>
                </Table>
              </Wide>
            );
          if (level === "unit") return <WorkedPanel report={main.report} traj={main.traj} i={ci} />;
          return <Wall traj={main.traj} i={ci} />;
        })()}
        <PanelNote>The plant has one unit here, so the overview has one line; a plant of twenty units would have twenty, each a word.</PanelNote>
      </Panel>

      {/* ---- step 5 ---- */}
      {step(5)}
      <Panel title="Move the limit of the over-limiting alarm" origin="engine"
        originNote="each value is a re-run of the case with the changed panelDict; the facts are the panel block's">
        <Box maw={420}>
          <Text size="xs" c="dimmed">high limit on i over i_lim (the case declares 1; the scale is 0 to 2.5)</Text>
          <Slider min={0.25} max={3} step={0.25} value={limit} label={(x) => x.toFixed(2)}
            onChange={(x) => { setLimit(x); setLimitTouched(true); }} aria-label="over-limiting limit" />
        </Box>
        <PanelNote>On the run chosen in step 1: {v.label.toLowerCase()}.</PanelNote>
        {!limitTouched && ol && (
          <Text size="sm">At the declared limit 1 the engine reports: violated at {sig(ol.violated)} of {sig(ol.n)} written instants
            {ol.intervals?.[0] ? `, first at t = ${sig(ol.intervals[0][0])} s` : ""}.  Move the limit to re-run.</Text>
        )}
        {limitTouched && <RunState run={lim.run} matches={lim.report !== null} what="the rig with the moved limit" />}
        {limitTouched && lim.report && olLim && (
          <>
            <Text size="sm">
              Limit {sig(olLim.limitHigh)}: violated at {sig(olLim.violated)} of {sig(olLim.n)} written instants
              {olLim.intervals?.[0] ? `, first at t = ${sig(olLim.intervals[0][0])} s` : ""}; closest approach {sig(olLim.closestApproachFraction, 3)} of the scale.
            </Text>
            <Group gap={6}>
              {factsFor(lim.report, "overLimiting").map((k) => <Badge key={k} size="sm" variant="light" color="gray" tt="none">{k}</Badge>)}
            </Group>
            <PanelNote>
              A limit the run always breaks (alwaysViolated) is an alarm that sounds from the first second and teaches the operator to
              ignore it; one it never approaches (neverApproached) was not exercised by this run; a limit off its own scale
              (limitOutsideRange) cannot be seen.  Which of these is the limit's fault and which the run's is the judgement the engine leaves to you.
            </PanelNote>
          </>
        )}
      </Panel>
      <Panel title="An alarm on everything that moves" origin={["engine", "page", "assumption"]}
        originNote="the alarms active and their intervals: the engine; the onsets per ten minutes: this page's count; the handling rate: an assumption of this page">
        <Group gap={6} wrap="wrap">
          {runButton("naive", "Run the naive panel (8 alarms)", benchVariant)}
          {runButton("minimal", "Run the worked panel (3 alarms)", benchVariant)}
        </Group>
        {variantPicker(benchVariant, setBenchVariant, "on the disturbance")}
        <Box maw={260}>
          <KnobNumber label="alarms one person can act on in 10 minutes (assumption of this page)"
            value={rate} min={1} max={20} step={1} onChange={setRate} />
        </Box>
        {benchResult(["naive", "minimal"])}
        {benchOf(["naive", "minimal"]) && bn.report && (
          <Text size="sm">
            The page counts {onsets.length} alarm onset(s) in the engine's intervals, at most {worst10} inside any ten minutes, against the
            {" "}{rate} this page assumes a person can act on.  {worst10 > rate
              ? "More alarms start together than the assumed person can handle: the one that matters is now one of many."
              : "Within the assumed handling rate."}
          </Text>
        )}
      </Panel>

      {/* ---- step 6 ---- */}
      {step(6)}
      <Panel title="Three stages of one panel" origin={["engine", "page"]}
        originNote="the facts and the counts: the engine; why each stage was added: this page">
        <Group gap={6} wrap="wrap">
          {stages.map((g) => <Box key={g.id}>{runButton(g.id, g.label, "highCurrent")}</Box>)}
        </Group>
        {stages.filter((g) => g.id === bench).map((g) => <Text key={g.id} size="sm">{g.why}</Text>)}
        {benchResult(stages.map((s) => s.id))}
        <Wide>
          <Table withTableBorder fz="xs" style={{ minWidth: 300 }}>
            <Table.Thead><Table.Tr><Table.Th>stage</Table.Th><Table.Th>elements</Table.Th><Table.Th>alarms</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {stages.map((g) => (
                <Table.Tr key={g.id}><Table.Td>{g.label}</Table.Td>
                  <Table.Td>{g.panel.elements.length}</Table.Td>
                  <Table.Td>{g.panel.elements.filter((e) => e.alarm).length}</Table.Td></Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Wide>
        <PanelNote>The counts in the table are what the page wrote into each panel; the run reports the same count back in its summary.</PanelNote>
      </Panel>

      {/* ---- step 7 ---- */}
      {step(7)}
      <Panel title="The exercise panel" origin={["engine", "page"]}
        originNote="which defects the engine reports: the panel block; the key: this page">
        <Group gap={6}>{runButton("defect", "Run the exercise panel", "base")}</Group>
        {benchResult(["defect"])}
        <Group><Button size="xs" variant="light" onClick={() => setShowKey((k) => !k)}>{showKey ? "Hide the key" : "Show the key"}</Button></Group>
        {showKey && (
          <Wide>
            <Table withTableBorder withColumnBorders fz="xs" style={{ minWidth: 560 }}>
              <Table.Thead><Table.Tr><Table.Th>defect</Table.Th><Table.Th>element</Table.Th><Table.Th>seen by</Table.Th><Table.Th>why</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {DEFECTS.map((d) => {
                  const reported = d.fact && bench === "defect" && bn.report
                    ? bn.report.facts.some((f) => f.kind === d.fact) : null;
                  return (
                    <Table.Tr key={d.id}>
                      <Table.Td>{d.title}</Table.Td>
                      <Table.Td><Text span ff="monospace" size="xs">{d.where}</Text></Table.Td>
                      <Table.Td>{d.fact
                        ? <>the engine: <Text span ff="monospace" size="xs">{d.fact}</Text>{reported === null ? " (run the panel to see it)" : reported ? " — reported in this run" : " — NOT reported in this run"}</>
                        : "a person only"}</Table.Td>
                      <Table.Td>{d.explanation}</Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Wide>
        )}
      </Panel>

      <LessonLimits limits={PANEL_LIMITS} />
      <LessonReferences tool="operator-panels" />
    </Stack>
    </Box>
  );
}
