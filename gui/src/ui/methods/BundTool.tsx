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
  BundTool -- "Secondary containment: designing a bund" (DEV.md 4c C136,
  commissioned by Vitor 2026-10-21), on the "Process safety" shelf beside
  the pool-fire and overpressure pages.

  A CONSTRUCTION with three benches, each after the steps that earn it: the
  DESIGN CHECK (the bund's geometric, net and useful capacities against a
  rule, the engine's reading and the page's side by side), the SCENARIOS
  (the four ways a bund is tested, integrated in time, drawn as a section
  and balanced to the cubic metre), and the EXERCISE (Vitor's three tanks of
  20, 15 and 10 m3, dry and after rain).  One volume held by three walls
  sits after the geometry step.

  NO ENGINE RUN.  The arithmetic is bund.ts, whose engine half is
  BundArithmetic.H's twin and is held to it by check_bund_arithmetic; the
  page is self-contained in the browser and edits no case.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import {
  Alert, Anchor, Box, SegmentedControl, Slider, Stack, Switch, Table, Text, Title,
} from "@mantine/core";

import { guideUrl, openGuide } from "../../help/guideLinks.js";
import { DESIGN_GUIDE_CONTAINMENT } from "../../case/layoutTables.js";
import { BundSection, LevelChart, type SectionState } from "./bundDrawings.js";
import {
  CLOSING_REFLECTION, DRAIN_CD, EXERCISE_BUND, EXERCISE_RAIN_M, EXERCISE_TANKS, RULES,
  bundForWall, designCheck, floorAt, footprint, freeVolume, levelOf, problems, scenarioDefaults,
  simulate, tankPositions, wallClearances, wallForEngineRule, wallLoad,
  type Basis, type Bund, type CapacityRule, type ScenarioInput, type Tank,
} from "./bund.js";
import { BUND_LIMITS, BUND_SOURCES, BUND_STEPS, RULE_IS_AN_EXAMPLE } from "./bundLesson.js";
import { KnobField, KnobNumber, PanelNote } from "./knobPanel.js";
import { LessonLimits, LessonStepView } from "./lessonStep.js";
import { setActiveMethodTool } from "./registry.js";
import { OriginMark } from "./origin.js";

export const BUND_TITLE = "Secondary containment: designing a bund";

const step = (n: number) => {
  const s = BUND_STEPS.find((q) => q.n === n);
  return s ? <LessonStepView key={n} step={s} /> : null;
};

const fx = (v: number | null | undefined, d: number): string =>
  typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "—";

const KNOB_GRID = {
  display: "grid", gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(170px, 100%), 1fr))",
} as const;

function PanTable({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <Box data-pan-x="" style={{ width: "100%", overflowX: "auto" }}>
      <Table striped withTableBorder withColumnBorders fz="xs" mt={6}>
        {children}
      </Table>
    </Box>
  );
}

const ruleOf = (id: string): CapacityRule => RULES.find((r) => r.id === id) ?? RULES[0]!;

function Verdict({ ok }: { ok: boolean }): JSX.Element {
  return <Text span fw={700} c={ok ? "teal" : "red"}>{ok ? "adequate" : "SHORT"}</Text>;
}

function BundKnobs({ bund, onBund, slope = true }: {
  bund: Bund; onBund: (b: Bund) => void; slope?: boolean;
}): JSX.Element {
  return (
    <Box style={KNOB_GRID}>
      <KnobNumber label="length L [m]" value={bund.L} min={1} max={60} step={0.5} decimals={2}
        onChange={(v) => onBund({ ...bund, L: v })} />
      <KnobNumber label="width W [m]" value={bund.W} min={1} max={60} step={0.5} decimals={2}
        onChange={(v) => onBund({ ...bund, W: v })} />
      <KnobNumber label="wall height h_w at the sump [m]" value={bund.wall} min={0.05} max={5}
        step={0.05} decimals={3} onChange={(v) => onBund({ ...bund, wall: v })} />
      <KnobNumber label="freeboard f [m]" value={bund.freeboard} min={0} max={1} step={0.05}
        decimals={3} onChange={(v) => onBund({ ...bund, freeboard: v })} />
      {slope && (
        <KnobNumber label="floor slope s to the sump [m/m]" value={bund.slope} min={0} max={0.05}
          step={0.005} decimals={4} onChange={(v) => onBund({ ...bund, slope: v })} />
      )}
    </Box>
  );
}

function RuleSelect({ value, onChange }: { value: string; onChange: (id: string) => void }): JSX.Element {
  return (
    <KnobField label="capacity rule (an example, step 8)">
      <SegmentedControl size="xs" fullWidth value={value}
        data={RULES.map((r) => ({ value: r.id, label: r.id === "110-25" ? "110 % / 25 %" : "100 % of the largest" }))}
        onChange={onChange} />
    </KnobField>
  );
}

// ---- Bench 1: the design check, both readings ------------------------------------

function DesignBench({ bund, onBund, ruleId, onRule, basis, onBasis, rain, onRain }: {
  bund: Bund; onBund: (b: Bund) => void; ruleId: string; onRule: (id: string) => void;
  basis: Basis; onBasis: (b: Basis) => void; rain: number; onRain: (d: number) => void;
}): JSX.Element {
  const tanks = EXERCISE_TANKS;
  const bad = problems(bund, tanks);
  const d = useMemo(() => designCheck(bund, tanks, ruleOf(ruleId), basis, rain),
    [bund, tanks, ruleId, basis, rain]);
  const clear = wallClearances(bund, tanks);
  return (
    <Box data-testid="bund-design">
      <Title order={5}>The design check: geometric, net and useful, side by side</Title>
      <OriginMark of={["page", "reference", "assumption"]} note="this page's arithmetic -- the rows marked Choupo's reproduce the engine's BundArithmetic.H, which is not run here; the rule and the HSG176 clearances are the cited guidance; the bund, the tanks and the rain are inputs" />
      <Box mt={8} style={KNOB_GRID}>
        <RuleSelect value={ruleId} onChange={onRule} />
        <KnobField label="the volume a tank counts">
          <SegmentedControl size="xs" fullWidth value={basis}
            data={[{ value: "capacity", label: "its capacity" }, { value: "held", label: "what it holds" }]}
            onChange={(v) => onBasis(v as Basis)} />
        </KnobField>
        <KnobNumber label="rain the bund must hold, d [mm]" value={rain * 1000} min={0} max={300}
          step={10} decimals={0} onChange={(v) => onRain(v / 1000)} />
      </Box>
      <Box mt={8}><BundKnobs bund={bund} onBund={onBund} /></Box>
      {bad.length > 0 ? (
        <Alert color="red" variant="light" mt={8} title="This bund cannot be built as drawn">
          {bad.map((p) => <Text key={p} size="xs">{p}</Text>)}
        </Alert>
      ) : (
        <>
          <PanTable>
            <Table.Thead>
              <Table.Tr><Table.Th>quantity</Table.Th><Table.Th>value [m3]</Table.Th><Table.Th>how</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <Table.Tr><Table.Td>floor area A</Table.Td><Table.Td>{fx(d.area, 2)} m2</Table.Td><Table.Td>L × W</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>geometric capacity, flat-floor formula</Table.Td><Table.Td>{fx(d.gross, 3)}</Table.Td><Table.Td>A h_w (the engine&apos;s gross volume)</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>geometric capacity, with the slope</Table.Td><Table.Td>{fx(d.geometric, 3)}</Table.Td><Table.Td>{bund.slope > 0 ? "A (h_w − Δ/2): this page only" : "the same: the floor is flat"}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>displaced by every tank below the wall top</Table.Td><Table.Td>{fx(d.displacedAll, 3)}</Table.Td><Table.Td>Σ π D²/4 × min(h_w, H) (step 5)</Table.Td></Table.Tr>
              <Table.Tr><Table.Td><b>net volume (Choupo&apos;s layout check)</b></Table.Td><Table.Td><b>{fx(d.net, 3)}</b></Table.Td><Table.Td>gross − displaced, flat floor, no freeboard</Table.Td></Table.Tr>
              {d.rule.terms.map((t) => (
                <Table.Tr key={`${t.fraction}${t.of}`}><Table.Td>term: {fx(t.fraction * 100, 0)} % of the {t.of}</Table.Td><Table.Td>{fx(t.volume, 3)}</Table.Td><Table.Td>{t.of === "largest" ? `largest ${fx(d.rule.largest, 2)}` : `total ${fx(d.rule.total, 2)}`} m3{t.of === d.rule.governing && t.volume === d.rule.governingVolume ? " — governs" : ""}</Table.Td></Table.Tr>
              ))}
              <Table.Tr><Table.Td>rain, d A</Table.Td><Table.Td>{fx(d.rain, 3)}</Table.Td><Table.Td>{fx(rain * 1000, 0)} mm over {fx(d.area, 1)} m2</Table.Td></Table.Tr>
              <Table.Tr><Table.Td><b>required (Choupo&apos;s layout check)</b></Table.Td><Table.Td><b>{fx(d.required, 3)}</b></Table.Td><Table.Td>governing term + rain: <Verdict ok={d.engineAdequate} /> by {fx(d.net - d.required, 3)} m3</Table.Td></Table.Tr>
              <Table.Tr><Table.Td><b>useful capacity, {d.failing} failing</b></Table.Td><Table.Td><b>{fx(d.useful, 3)}</b></Table.Td><Table.Td>free volume to h_w − f, the OTHER tanks deducted, less the rain (step 6): <Verdict ok={d.usefulAdequate} /> against {fx(d.rule.governingVolume, 3)} by {fx(d.useful - d.rule.governingVolume, 3)} m3</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>the engine&apos;s safe-side margin</Table.Td><Table.Td>{fx(d.engineCredit, 3)}</Table.Td><Table.Td>{d.failing}&apos;s footprint × min(h_w, its height): what the net volume deducts and the failing tank does not take</Table.Td></Table.Tr>
            </Table.Tbody>
          </PanTable>
          <PanTable>
            <Table.Thead>
              <Table.Tr><Table.Th>tank</Table.Th><Table.Th>clearance to the nearest wall [m]</Table.Th><Table.Th>HSG176 para 161 recommends at least [m]</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {clear.map((c) => (
                <Table.Tr key={c.id}><Table.Td>{c.id}</Table.Td><Table.Td>{fx(c.clearance, 2)}</Table.Td><Table.Td>{c.recommended}{c.clearance < c.recommended ? " — closer than recommended" : ""}</Table.Td></Table.Tr>
              ))}
            </Table.Tbody>
          </PanTable>
        </>
      )}
      <PanelNote>
        The tanks are the exercise&apos;s three (20, 15 and 10 m3; D = 2.6, 2.4 and
        2.0 m), full, standing on the floor in one row, evenly spaced.  The two
        bold rows marked as Choupo&apos;s are what its layout check computes for
        this bund (BundArithmetic.H): a flat floor, every footprint deducted at
        the wall top.  The slope, the freeboard and the useful capacity are this
        page&apos;s.  {RULE_IS_AN_EXAMPLE}
      </PanelNote>
    </Box>
  );
}

// ---- Bench 2: the four scenarios --------------------------------------------------

type ScenarioId = "A" | "B" | "C" | "D";

const SCENARIO_LABEL: Record<ScenarioId, string> = {
  A: "A · rupture", B: "B · leak", C: "C · rain first", D: "D · drain open",
};

function scenarioInput(id: ScenarioId, bund: Bund, tanks: readonly Tank[], tank: string,
  knobs: { qStart: number; qEnd: number; stopAt: number | null; rain: number; dDrain: number; hours: number }): ScenarioInput {
  const s = scenarioDefaults(bund, tanks, tank);
  s.duration = knobs.hours;
  s.dt = Math.max(1, knobs.hours * 3600 / 4000);
  if (id === "B" || id === "D") {
    s.kind = "leak"; s.qStart = knobs.qStart; s.qEnd = knobs.qEnd; s.leakEnd = knobs.hours;
    s.stopAt = knobs.stopAt;
  }
  if (id === "C") s.rainDepth = knobs.rain;
  if (id === "D") { s.drainOpen = true; s.drainDiameter = knobs.dDrain; s.drainCd = DRAIN_CD; }
  return s;
}

function ScenarioBench({ bund }: { bund: Bund }): JSX.Element {
  const tanks = EXERCISE_TANKS;
  const [id, setId] = useState<ScenarioId>("A");
  const [tank, setTank] = useState("T1");
  const [qStart, setQStart] = useState(30);
  const [qEnd, setQEnd] = useState(10);
  const [stop, setStop] = useState(false);
  const [stopAt, setStopAt] = useState(0.25);
  const [rain, setRain] = useState(0.1);
  const [dDrain, setDDrain] = useState(0.1);
  const [hours, setHours] = useState(1);
  const [cursor, setCursor] = useState(1000);
  const bad = problems(bund, tanks);
  const res = useMemo(() => (bad.length ? null : simulate(scenarioInput(id, bund, tanks, tank,
    { qStart, qEnd, stopAt: stop ? stopAt : null, rain, dDrain, hours }))),
  [id, bund, tanks, tank, qStart, qEnd, stop, stopAt, rain, dDrain, hours, bad.length]);
  const i = tanks.findIndex((t) => t.id === tank);
  const xs = tankPositions(bund, tanks);
  const normalInside = tanks.map((t, k) => floorAt(bund, xs[k]!) + t.plinth + t.capacity * t.fill / footprint(t));
  const last = res ? res.points.length - 1 : 0;
  const at = res ? res.points[Math.min(last, cursor)]! : null;
  const failed = tanks.find((t) => t.id === tank)!;
  const what = id === "A" || id === "C" ? "the rupture" : "the leak";
  const normalState: SectionState = {
    level: res ? levelOf(bund, tanks, tanks.map(() => true), res.rain).level : 0,
    inside: normalInside, intact: tanks.map(() => true), overtopped: 0,
    drainOpen: id === "D", drained: 0, title: "normal operation",
  };
  const accident: SectionState | null = at ? {
    level: at.level,
    inside: normalInside.map((v, k) => (k === i ? at.tankLevel : v)),
    intact: tanks.map((_, k) => (k === i ? at.shellIntact : true)),
    overtopped: at.overtopped, drainOpen: id === "D", drained: at.drained,
    title: `t = ${fx(at.t, 2)} h after ${what} of ${tank}`,
  } : null;
  return (
    <Box data-testid="bund-scenarios">
      <Title order={5}>The four scenarios, balanced to the cubic metre</Title>
      <OriginMark of={["page", "assumption"]} note="a volume balance integrated on this page from the flows you declare; no engine run" />
      <Box mt={8} style={KNOB_GRID}>
        <KnobField label="scenario">
          <SegmentedControl size="xs" fullWidth value={id}
            data={(Object.keys(SCENARIO_LABEL) as ScenarioId[]).map((k) => ({ value: k, label: SCENARIO_LABEL[k] }))}
            onChange={(v) => setId(v as ScenarioId)} />
        </KnobField>
        <KnobField label="the tank that fails">
          <SegmentedControl size="xs" fullWidth value={tank}
            data={tanks.map((t) => ({ value: t.id, label: `${t.id} ${t.capacity} m3` }))}
            onChange={setTank} />
        </KnobField>
        <KnobNumber label="time integrated [h]" value={hours} min={0.05} max={24} step={0.25}
          decimals={2} onChange={setHours} />
        {(id === "B" || id === "D") && (
          <>
            <KnobNumber label="leak flow at the start [m3/h]" value={qStart} min={0} max={500}
              step={5} decimals={1} onChange={setQStart} />
            <KnobNumber label="leak flow at the end [m3/h]" value={qEnd} min={0} max={500}
              step={5} decimals={1} onChange={setQEnd} />
            <KnobField label="isolated by an operator">
              <Switch size="sm" checked={stop} onChange={(e) => setStop(e.currentTarget.checked)}
                label={stop ? `at ${fx(stopAt, 2)} h` : "never"} />
            </KnobField>
            {stop && <KnobNumber label="isolated at [h]" value={stopAt} min={0} max={24}
              step={0.05} decimals={2} onChange={setStopAt} />}
          </>
        )}
        {id === "C" && <KnobNumber label="rain standing in the bund first [mm]" value={rain * 1000}
          min={0} max={500} step={10} decimals={0} onChange={(v) => setRain(v / 1000)} />}
        {id === "D" && <KnobNumber label="open drain diameter [m]" value={dDrain} min={0.01}
          max={0.5} step={0.01} decimals={3} onChange={setDDrain} />}
      </Box>
      {bad.length > 0 && (
        <Alert color="red" variant="light" mt={8} title="Set a bund that can be built (the design bench above)">
          {bad.map((p) => <Text key={p} size="xs">{p}</Text>)}
        </Alert>
      )}
      {res && at && accident && (
        <>
          <Box mt={8}><BundSection bund={bund} tanks={tanks} state={normalState} /></Box>
          <Box mt={4}><BundSection bund={bund} tanks={tanks} state={accident} /></Box>
          <KnobField label="time after the failure">
            <Slider size="xs" min={0} max={last} value={Math.min(last, cursor)} onChange={setCursor}
              label={(v) => `${fx(res.points[v]?.t, 2)} h`} />
          </KnobField>
          <Box mt={6}><LevelChart points={res.points} bund={bund} cursor={Math.min(last, cursor)} /></Box>
          <PanTable>
            <Table.Thead>
              <Table.Tr><Table.Th>where the liquid is, at t = {fx(at.t, 3)} h</Table.Th><Table.Th>[m3]</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <Table.Tr><Table.Td>still in {tank}</Table.Td><Table.Td>{fx(at.inTank, 3)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>standing in the bund (spill and rain)</Table.Td><Table.Td>{fx(at.inBund, 3)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>gone over the wall</Table.Td><Table.Td>{fx(at.overtopped, 3)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>gone through the drain</Table.Td><Table.Td>{fx(at.drained, 3)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td><b>sum</b></Table.Td><Table.Td><b>{fx(at.inTank + at.inBund + at.overtopped + at.drained, 3)}</b></Table.Td></Table.Tr>
              <Table.Tr><Table.Td>{tank} held V_0, plus the rain present</Table.Td><Table.Td>{fx(res.initial, 3)} + {fx(res.rain, 3)} = {fx(res.initial + res.rain, 3)}</Table.Td></Table.Tr>
              <Table.Tr><Table.Td>largest imbalance over the whole run</Table.Td><Table.Td>{res.imbalance.toExponential(1)}</Table.Td></Table.Tr>
            </Table.Tbody>
          </PanTable>
          <Text size="sm" mt={6}>
            {at.overtopped > 1e-9
              ? `The bund has overtopped: ${fx(at.overtopped, 2)} m3 of the ${fx(failed.capacity * failed.fill, 1)} m3 ${tank} held is outside the wall.`
              : at.drained > 1e-9
                ? `The wall has held, and ${fx(at.drained, 2)} m3 has left through the open drain: the bund is there, and it is not a barrier.`
                : `The bund holds: the pool stands ${fx(at.level, 3)} m above the sump, ${fx((bund.wall - at.level) * 100, 1)} cm under the wall top.`}
          </Text>
        </>
      )}
      <PanelNote>
        No engine run.  The bund is the design bench&apos;s; the step is
        {" "}{res ? fx(Math.max(1, hours * 3600 / 4000), 1) : "—"} s.  A rupture empties the
        shell at once; a leak flows at the flow you declare while the inside
        stands above the pool, and joins it when the two levels meet.  The
        imbalance is rounding: every transfer leaves one store as it enters
        another.  The wave of a sudden failure is not modelled (step 10).
      </PanelNote>
    </Box>
  );
}

// ---- After step 11: one volume, three walls ----------------------------------------

function GeometryTable(): JSX.Element {
  const V = 22, Af = EXERCISE_TANKS.reduce((s, t) => s + footprint(t), 0), rho = 1000;
  const walls = [0.3, 0.6, 1.2, 2.0];
  return (
    <Box>
      <Title order={5}>One volume, four walls</Title>
      <OriginMark of={["page", "assumption"]} note="computed on this page for an author-set 22 m3 and density" />
      <PanTable>
        <Table.Thead>
          <Table.Tr><Table.Th>wall h_w [m]</Table.Th><Table.Th>floor area [m2]</Table.Th><Table.Th>side of a square [m]</Table.Th><Table.Th>pool surface [m2]</Table.Th><Table.Th>thrust F [kN/m]</Table.Th><Table.Th>moment M [kN m/m]</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {walls.map((h) => {
            const g = bundForWall(V, h, Af);
            const l = wallLoad(rho, h);
            return (
              <Table.Tr key={h}><Table.Td>{fx(h, 1)}</Table.Td><Table.Td>{fx(g.area, 1)}</Table.Td><Table.Td>{fx(g.side, 2)}</Table.Td><Table.Td>{fx(g.pool, 1)}</Table.Td><Table.Td>{fx(l.F / 1000, 2)}</Table.Td><Table.Td>{fx(l.M / 1000, 3)}</Table.Td></Table.Tr>
            );
          })}
        </Table.Tbody>
      </PanTable>
      <PanelNote>
        22 m3 (110 % of the exercise&apos;s largest tank) round the three tanks&apos;
        footprints ({fx(Af, 2)} m2, which they occupy to above every wall here),
        a liquid of density {rho} kg/m3.  Each doubling of the wall halves the
        pool and multiplies the moment on the wall by eight.
      </PanelNote>
    </Box>
  );
}

// ---- Bench 3: the exercise -----------------------------------------------------------

function ExerciseBench(): JSX.Element {
  const tanks = EXERCISE_TANKS;
  const [ruleId, setRuleId] = useState("110-25");
  const [bund, setBund] = useState<Bund>(EXERCISE_BUND);
  const [wet, setWet] = useState(false);
  const rule = ruleOf(ruleId);
  const bad = problems(bund, tanks);
  const rows = ([false, true] as const).map((w) => {
    const rain = w ? EXERCISE_RAIN_M : 0;
    const d = designCheck(bund, tanks, rule, "capacity", rain);
    const need = wallForEngineRule(bund, tanks, rule, "capacity", rain);
    const largest = tanks.reduce((a, t) => (t.capacity > a.capacity ? t : a));
    const intact = tanks.map((t) => t.id !== largest.id);
    const spilled = largest.capacity * largest.fill + d.rain;
    const r = levelOf(bund, tanks, intact, spilled);
    const margin = freeVolume(bund, tanks, intact, bund.wall) - spilled;
    return { w, rain, d, need, largest, r, margin };
  });
  const row = rows[wet ? 1 : 0]!;
  const fail = tanks.findIndex((t) => t.id === row.largest.id);
  const xs = tankPositions(bund, tanks);
  const inside = tanks.map((t, k) => (k === fail ? row.r.level
    : floorAt(bund, xs[k]!) + t.plinth + t.capacity * t.fill / footprint(t)));
  return (
    <Box data-testid="bund-exercise">
      <Title order={5}>The exercise: 20, 15 and 10 m3 in one bund</Title>
      <OriginMark of={["page", "reference", "assumption"]} note="this page's arithmetic on the exercise's tanks, the cited rule and an author-set rain" />
      <Box mt={8} style={KNOB_GRID}>
        <RuleSelect value={ruleId} onChange={setRuleId} />
        <KnobField label="exercise 2: rain first">
          <Switch size="sm" checked={wet} onChange={(e) => setWet(e.currentTarget.checked)}
            label={wet ? `${fx(EXERCISE_RAIN_M * 1000, 0)} mm standing` : "a dry day"} />
        </KnobField>
      </Box>
      <Box mt={8}><BundKnobs bund={bund} onBund={setBund} slope={false} /></Box>
      {bad.length > 0 ? (
        <Alert color="red" variant="light" mt={8} title="This bund cannot be built as drawn">
          {bad.map((p) => <Text key={p} size="xs">{p}</Text>)}
        </Alert>
      ) : (
        <>
          <PanTable>
            <Table.Thead>
              <Table.Tr><Table.Th>quantity</Table.Th><Table.Th>a dry day</Table.Th><Table.Th>after {fx(EXERCISE_RAIN_M * 1000, 0)} mm of rain</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <Table.Tr><Table.Td>required by the rule [m3]</Table.Td>{rows.map((q) => <Table.Td key={String(q.w)}>{fx(q.d.required, 3)}</Table.Td>)}</Table.Tr>
              <Table.Tr><Table.Td>wall the engine&apos;s check needs on this floor [m]</Table.Td>{rows.map((q) => <Table.Td key={String(q.w)}>{q.need === null ? "none up to 20 m" : fx(q.need, 3)}</Table.Td>)}</Table.Tr>
              <Table.Tr><Table.Td>your geometric capacity A h_w [m3]</Table.Td>{rows.map((q) => <Table.Td key={String(q.w)}>{fx(q.d.gross, 3)}</Table.Td>)}</Table.Tr>
              <Table.Tr><Table.Td>your net volume, every footprint deducted [m3]</Table.Td>{rows.map((q) => <Table.Td key={String(q.w)}>{fx(q.d.net, 3)} <Verdict ok={q.d.engineAdequate} /></Table.Td>)}</Table.Tr>
              <Table.Tr><Table.Td>your useful capacity, {row.largest.id} failing [m3]</Table.Td>{rows.map((q) => <Table.Td key={String(q.w)}>{fx(q.d.useful, 3)} <Verdict ok={q.d.usefulAdequate} /></Table.Td>)}</Table.Tr>
              <Table.Tr><Table.Td>{row.largest.id} ruptures full: the pool stands at [m]</Table.Td>{rows.map((q) => <Table.Td key={String(q.w)}>{fx(q.r.level, 3)}</Table.Td>)}</Table.Tr>
              <Table.Tr><Table.Td>margin to the wall top [cm]</Table.Td>{rows.map((q) => <Table.Td key={String(q.w)}>{q.r.overtop > 0 ? "none" : fx((bund.wall - q.r.level) * 100, 1)}</Table.Td>)}</Table.Tr>
              <Table.Tr><Table.Td>margin to the wall top [m3]</Table.Td>{rows.map((q) => <Table.Td key={String(q.w)}>{q.r.overtop > 0 ? `overtops ${fx(q.r.overtop, 3)}` : fx(q.margin, 3)}</Table.Td>)}</Table.Tr>
            </Table.Tbody>
          </PanTable>
          <Box mt={8}>
            <BundSection bund={bund} tanks={tanks} state={{
              level: row.r.level, inside, intact: tanks.map((_, k) => k !== fail),
              overtopped: row.r.overtop, drainOpen: false, drained: 0,
              title: `${row.largest.id} ruptured, ${wet ? "after rain" : "a dry day"}`,
            }} />
          </Box>
        </>
      )}
      <PanelNote>
        The wall height the engine&apos;s check needs is found by bisection on
        net − required (bund.ts, wallForEngineRule).  The rupture is the
        largest tank, full, its footprint left free (step 6).  The rain is an
        author-set number for the exercise, not a design rainfall.
      </PanelNote>
    </Box>
  );
}

// ---- The page -------------------------------------------------------------------

export function BundTool(): JSX.Element {
  const [bund, setBund] = useState<Bund>({ ...EXERCISE_BUND, slope: 0.01, freeboard: 0.05 });
  const [ruleId, setRuleId] = useState("110-25");
  const [basis, setBasis] = useState<Basis>("capacity");
  const [rain, setRain] = useState(0);
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
        <Box>
          <Title order={3}>{BUND_TITLE}</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Why bunds exist, how they are built and sized, what a leak or a
            rupture does to one, how its geometry decides safety and how a
            badly conceived one can raise some risks -- with the volumes
            balanced to the cubic metre and every equation on the page.
          </Text>
          <Text size="sm" mt={6}>
            The{" "}
            <Anchor component="button" type="button"
              onClick={() => setActiveMethodTool("plant-layout")}>
              plant-layout page
            </Anchor>{" "}
            places the items; Choupo&apos;s layout check is where a case declares
            its bunds and has their capacity checked, and the Design Guide&apos;s{" "}
            <Anchor component="button" type="button"
              onClick={() => openGuide(guideUrl("designGuide", DESIGN_GUIDE_CONTAINMENT))}>
              secondary-containment section
            </Anchor>{" "}
            describes that declaration.  Nothing on this page is a compliance
            check or a certified risk analysis.
          </Text>
        </Box>

        <Title order={4}>Part 1 — why a bund</Title>
        {step(1)}
        {step(2)}

        <Title order={4}>Part 2 — what a failure does</Title>
        {step(3)}

        <Title order={4}>Part 3 — sizing: geometric and useful capacity</Title>
        {step(4)}
        {step(5)}
        {step(6)}
        {step(7)}

        <Title order={4}>Part 4 — the rule</Title>
        {step(8)}
        <DesignBench bund={bund} onBund={setBund} ruleId={ruleId} onRule={setRuleId}
          basis={basis} onBasis={setBasis} rain={rain} onRain={setRain} />

        <Title order={4}>Part 5 — four scenarios</Title>
        {step(9)}
        {step(10)}
        <ScenarioBench bund={bund} />

        <Title order={4}>Part 6 — geometry decides</Title>
        {step(11)}
        <GeometryTable />

        <Title order={4}>Part 7 — flammable liquids, and where the pool goes</Title>
        {step(12)}
        {step(13)}

        <Title order={4}>Part 8 — construction, compatibility, inspection</Title>
        {step(14)}

        <Title order={4}>Part 9 — the exercise</Title>
        {step(15)}
        {step(16)}
        <ExerciseBench />

        <Box data-testid="bund-closing" px="sm" py={8}
          style={{ borderLeft: "3px solid var(--mantine-color-accent-5)" }}>
          <Text size="md" fs="italic">{CLOSING_REFLECTION}</Text>
        </Box>

        <LessonLimits limits={BUND_LIMITS} />
        <Box>
          <Title order={5}>Sources, what kind of authority each is, and how each was reached</Title>
          {BUND_SOURCES.map((s) => (
            <Box key={s.id} mt={6}>
              <Text size="sm"><b>{s.kind}</b> — {s.cite}</Text>
              <Text size="xs" c="dimmed">{s.used}</Text>
            </Box>
          ))}
        </Box>
      </Stack>
    </Box>
  );
}
