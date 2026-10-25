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
  OverpressureTool -- "Designing for overpressure: scenarios, devices and
  relief sizing" (DEV.md 4c C61, commissioned by Vitor 2026-10-11), on the
  "Process safety" shelf beside the C60 page it links both ways.

  A CONSTRUCTION: the reader drives the sizing.  Four benches, each placed
  after the paragraphs that earn it:
    * the PRESSURE LADDER (no engine run -- it is the Code's arithmetic on
      the reader's own pressures), drawn as an inline SVG and a table;
    * the LOOP GAS bench: the green-ammonia converter feed at 150 and 50 bar
      under a blocked outlet -- Z and k from the relief01 witness, run in the
      browser at the relieving pressures the ladder rule gives;
    * the FIRE bench: an acetone drum -- the relieving temperature, latent
      heat, Z and k from the relief02 witness, run TWICE whenever the MAWP
      moves (once to find the boiling temperature at P1, once AT it);
    * the LIQUID check (API 520's own Example 5, reproduced) and the
      two-phase multiplier on the fire case's heat.

  THE CHART COLOURS.  The ladder takes Mantine blue-6 (#228be6) for the
  MAWP and the accumulation band, and orange-8 (#e8590c) for the relieving
  pressure: the pair FrontEndLoadingTool validated, re-run here through the
  dataviz palette validator against #1f1f1f, #172123 and #ffffff -- every
  check passes on all three.  Every level is also NAMED in the drawing and
  tabulated beside it, because colour alone is not identity.
\*---------------------------------------------------------------------------*/

import { useEffect, useMemo, useState } from "react";

import {
  Alert, Anchor, Box, Group, Loader, SegmentedControl, Stack, Table, Text,
  Title,
} from "@mantine/core";

import { useMethodRun, type MethodRunState } from "../../case/methodRun.js";
import { tutorialByName } from "../../cases/tutorials.js";
import { guideUrl, openGuide } from "../../help/guideLinks.js";
import { KnobField, KnobNumber, PanelNote } from "./knobPanel.js";
import { LessonLimits, LessonStepView } from "./lessonStep.js";
import {
  OVERPRESSURE_LIMITS, OVERPRESSURE_SOURCES, OVERPRESSURE_STEPS,
} from "./overpressureLesson.js";
import {
  ACCUMULATION, DESIGN_GUIDE_RELIEF, FIRE_COMPONENT, FIRE_DEFAULT_MAWP_BARG,
  FIRE_OP, FIRE_SHIPPED_T_K, LOOP_OPERATING, LOOP_OPS, PSI_PA, P_ATM_PA,
  RELIEF_WITNESS_FIRE, RELIEF_WITNESS_LOOP, SET_LIMITS, WATER_REF_DENSITY,
  fireCoefficientSI, fireHeatInput, fireOverrides,
  fireRunState, fireVapourRate, gasArea, governingScenario, liquidArea,
  liquidMassFlow, loopGas, loopOverrides, maxAccumulatedGauge,
  preliminaryLadder, readPoint, recordScalar, relievingPressureAbs,
  specificGravity, ventMassFlow, type DeviceCase, type GasSizing, type LoopOp,
  type ReliefScenario,
} from "./overpressure.js";
import { setActiveMethodTool } from "./registry.js";
import { OriginMark } from "./origin.js";

/** The fire bench's other defaults: round numbers for the lesson. */
export const DEFAULT_WETTED_M2 = 40;
/** The pump the liquid bench relieves [L/min]: a round number. */
export const DEFAULT_PUMP_L_MIN = 500;

const HUE_MAWP = "#228be6";
const HUE_P1 = "#e8590c";
const INK = "var(--mantine-color-dimmed)";
const TEXT = "var(--mantine-color-text)";

const step = (n: number) => {
  const s = OVERPRESSURE_STEPS.find((q) => q.n === n);
  return s ? <LessonStepView key={n} step={s} /> : null;
};

const fx = (v: number | null | undefined, d: number): string =>
  typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "—";
const bar = (pa: number): string => fx(pa / 1e5, 2);
const IN2_MM2 = 645.16;

const KNOB_GRID = {
  display: "grid", gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))",
} as const;

function Waiting({ runs, what }: { runs: MethodRunState[]; what: string }): JSX.Element | null {
  const err = runs.find((r) => r.err !== null)?.err ?? null;
  if (err !== null) {
    return (
      <Alert color="red" variant="light"
        title="The engine refused or failed — its message, verbatim">
        <Text size="xs" ff="monospace" style={{ whiteSpace: "pre-wrap" }}>{err}</Text>
      </Alert>
    );
  }
  if (runs.some((r) => r.busy || r.result === null)) {
    return (
      <Group gap="sm" wrap="nowrap" align="center">
        <Loader size="xs" />
        <Text size="xs" c="dimmed">{what}</Text>
      </Group>
    );
  }
  return null;
}

/** A table in a box that may pan sideways on a phone. */
function PanTable({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <Box data-pan-x="" style={{ width: "100%", overflowX: "auto" }}>
      <Table striped withTableBorder withColumnBorders fz="xs" mt={6}>
        {children}
      </Table>
    </Box>
  );
}

function CaseSelect({ value, onChange, allowFire = true }: {
  value: DeviceCase; onChange: (c: DeviceCase) => void; allowFire?: boolean;
}): JSX.Element {
  const data = [
    { value: "single", label: "one device" },
    { value: "multiple", label: "several" },
    ...(allowFire ? [{ value: "fire", label: "fire" }] : []),
  ];
  return (
    <KnobField label="which allowance">
      <SegmentedControl size="xs" fullWidth value={value} data={data}
        onChange={(v) => onChange(v as DeviceCase)} />
    </KnobField>
  );
}

// ---- Bench 1: the pressure ladder ------------------------------------------

function LadderDrawing({ op, mawp, p1g }: { op: number; mawp: number; p1g: number }): JSX.Element {
  const W = 360, H = 200, x0 = 104, x1 = 340, top = 14, bot = 186;
  const pMax = p1g * 1.08;
  const y = (p: number) => bot - (p / pMax) * (bot - top);
  const line = (p: number, label: string, color: string, dash?: string) => (
    <g>
      <line x1={x0} x2={x1} y1={y(p)} y2={y(p)} stroke={color} strokeWidth={2}
        strokeDasharray={dash} />
      <text x={x0 - 6} y={y(p) + 4} textAnchor="end" fontSize={11} fill={TEXT}>
        {label}
      </text>
    </g>
  );
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", maxWidth: 520 }}
      role="img" aria-label={"The pressure ladder: operating pressure, set "
        + "pressure at the MAWP, and the highest pressure allowed while the "
        + "device relieves, with the accumulation band between the last two"}>
      <rect x={x0} y={y(p1g)} width={x1 - x0} height={y(mawp) - y(p1g)}
        fill={HUE_MAWP} opacity={0.18} />
      <line x1={x0} x2={x0} y1={top} y2={bot} stroke={INK} strokeWidth={1} />
      <line x1={x0} x2={x1} y1={bot} y2={bot} stroke={INK} strokeWidth={1} />
      {line(op, "operating", INK, "4 3")}
      {line(mawp, "set = MAWP", HUE_MAWP)}
      {line(p1g, "relieving", HUE_P1)}
      <text x={x0 - 6} y={bot + 4} textAnchor="end" fontSize={11} fill={INK}>0 barg</text>
    </svg>
  );
}

function LadderBench(): JSX.Element {
  const [opBarg, setOpBarg] = useState(10);
  const [c, setC] = useState<DeviceCase>("single");
  const [mawpRatio, setMawpRatio] = useState(1);
  const opG = opBarg * 1e5;
  const ladder = preliminaryLadder(opG, Math.max(1, mawpRatio));
  const design = ladder.design;
  const mawp = ladder.mawp;
  const p1g = maxAccumulatedGauge(mawp, c);
  const a = ACCUMULATION[c];
  const floorWins = mawp + a.minPsi * PSI_PA > mawp * (1 + a.frac);
  return (
    <Box>
      <Title order={5}>The ladder for your vessel</Title>
      <OriginMark of={["page", "reference", "assumption"]} note="the arithmetic of step 6 on your numbers, with the Design Guide's rule of thumb; the MAWP is your assumption; no engine run" />
      <Box mt={8} style={KNOB_GRID}>
        <KnobNumber label="operating pressure [barg]" value={opBarg} min={0.1}
          max={300} step={0.5} decimals={2} onChange={setOpBarg} />
        <KnobNumber label="assumed MAWP ÷ design pressure" value={mawpRatio}
          min={1} max={1.5} step={0.01} decimals={2}
          onChange={(v) => setMawpRatio(Math.max(1, v))} />
        <CaseSelect value={c} onChange={setC} />
      </Box>
      <Box mt={10} style={{ display: "grid", gap: 12,
        gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))" }}>
        <LadderDrawing op={opG} mawp={mawp} p1g={p1g} />
        <PanTable>
          <Table.Thead>
            <Table.Tr><Table.Th>level</Table.Th><Table.Th>barg</Table.Th><Table.Th>bar abs</Table.Th></Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Table.Tr><Table.Td>operating</Table.Td><Table.Td>{bar(opG)}</Table.Td><Table.Td>{bar(opG + P_ATM_PA)}</Table.Td></Table.Tr>
            <Table.Tr><Table.Td>design pressure, preliminary (rule of thumb)</Table.Td><Table.Td>{bar(design)}</Table.Td><Table.Td>{bar(design + P_ATM_PA)}</Table.Td></Table.Tr>
            <Table.Tr><Table.Td>MAWP — ASSUMED, {fx(mawp / design, 2)} × design (not certified)</Table.Td><Table.Td>{bar(mawp)}</Table.Td><Table.Td>{bar(mawp + P_ATM_PA)}</Table.Td></Table.Tr>
            <Table.Tr><Table.Td>set, first device — taken at the MAWP</Table.Td><Table.Td>{bar(ladder.set)}</Table.Td><Table.Td>{bar(ladder.set + P_ATM_PA)}</Table.Td></Table.Tr>
            {c === "multiple" && (
              <Table.Tr><Table.Td>highest set, additional devices</Table.Td><Table.Td>{bar(SET_LIMITS.additional * mawp)}</Table.Td><Table.Td>{bar(SET_LIMITS.additional * mawp + P_ATM_PA)}</Table.Td></Table.Tr>
            )}
            {c === "fire" && (
              <Table.Tr><Table.Td>highest set, a device for fire only</Table.Td><Table.Td>{bar(SET_LIMITS.fireSupplemental * mawp)}</Table.Td><Table.Td>{bar(SET_LIMITS.fireSupplemental * mawp + P_ATM_PA)}</Table.Td></Table.Tr>
            )}
            <Table.Tr><Table.Td>relieving, P1</Table.Td><Table.Td>{bar(p1g)}</Table.Td><Table.Td>{bar(p1g + P_ATM_PA)}</Table.Td></Table.Tr>
          </Table.Tbody>
        </PanTable>
      </Box>
      <PanelNote>
        No engine run: this is the arithmetic of step 6 on your numbers.  The
        design pressure is the Design Guide&apos;s rule of thumb, max(1.1 ×
        operating, operating + 1.7 bar), here {design > 1.1 * opG + 1 ? "the +1.7 bar floor" : "the 10 %"};
        it is a preliminary design pressure and no more.  The MAWP is YOUR
        assumption about the built vessel, at least the design pressure (a
        ratio of 1 is the lowest it can be); a real one comes from the
        vessel&apos;s mechanical design and its code stamp, and nothing here
        certifies it.  The set pressure is taken at the MAWP.
        The accumulation is {Math.round(a.frac * 100)} %
        {a.minPsi > 0 ? ` or ${a.minPsi} psi, whichever is larger (here ${floorWins ? `the ${a.minPsi} psi floor` : `the ${Math.round(a.frac * 100)} %`})` : ""}.
      </PanelNote>
    </Box>
  );
}

// ---- Bench 2: the loop gas under a blocked outlet --------------------------

function LoopBench(): JSX.Element {
  const [c, setC] = useState<DeviceCase>("single");
  const [Kd, setKd] = useState(0.975);
  const [Kb, setKb] = useState(1);
  const [disc, setDisc] = useState(false);
  const [P2bar, setP2bar] = useState(1.01325);

  const P1 = useMemo(() => {
    const out = {} as Record<LoopOp, number>;
    for (const op of LOOP_OPS) {
      const opG = LOOP_OPERATING[op].P_Pa - P_ATM_PA;
      //  The MAWP ASSUMED equal to the preliminary design pressure (step 6).
      out[op] = relievingPressureAbs(preliminaryLadder(opG).mawp, c);
    }
    return out;
  }, [c]);
  const run = useMethodRun(RELIEF_WITNESS_LOOP, loopOverrides(P1.loop150, P1.loop50),
    `case=${c}`, "choupoProps");
  const raw = tutorialByName(RELIEF_WITNESS_LOOP)?.files.rawFiles;
  const gas = useMemo(() => ({
    loop150: loopGas(raw, "loop150"), loop50: loopGas(raw, "loop50"),
  }), [raw]);

  const rows = LOOP_OPS.map((op) => {
    const pt = readPoint(run.result, op);
    const g = gas[op];
    const sizing: GasSizing | null = pt && g ? gasArea({
      W_kg_h: g.W_kg_h, T_K: pt.T, Z: pt.Z, M: g.M, k: pt.k,
      P1_kPa: pt.P / 1000, P2_kPa: P2bar * 100,
      Kd, Kb, Kc: disc ? 0.9 : 1,
    }) : null;
    return { op, pt, g, sizing };
  });
  const [a, b] = rows;
  const ratio = a?.sizing && b?.sizing ? b.sizing.A_mm2 / a.sizing.A_mm2 : NaN;
  const cell = (fn: (r: typeof rows[number]) => string) =>
    rows.map((r) => <Table.Td key={r.op}>{fn(r)}</Table.Td>);

  return (
    <Box>
      <Title order={5}>The loop bench: a blocked outlet at 150 and at 50 bar</Title>
      <OriginMark of={["engine", "page", "reference"]} note="the fluid properties at the relieving state are a choupoProps run in this browser; the API 520 area is computed on this page from them" />
      <Text size="sm" mt={4}>
        The converter feed of the two green-ammonia feasibility loops, which
        the Process-safety page compares, relieved through one valve each.
        The engine computes Z and k at each relieving state; you choose the
        allowance, the discharge coefficient, a rupture disc upstream, the
        back-pressure factor and the back pressure.
      </Text>
      <Box mt={8} style={KNOB_GRID}>
        <CaseSelect value={c} onChange={setC} allowFire={false} />
        <KnobNumber label="Kd, discharge coefficient" value={Kd} min={0.3}
          max={1} step={0.005} decimals={3} onChange={setKd} />
        <KnobNumber label="Kb, back-pressure factor" value={Kb} min={0.3}
          max={1} step={0.01} decimals={2} onChange={setKb} />
        <KnobField label="rupture disc upstream (Kc)">
          <SegmentedControl size="xs" fullWidth value={disc ? "disc" : "none"}
            data={[{ value: "none", label: "none (1.0)" },
                   { value: "disc", label: "disc (0.9)" }]}
            onChange={(v) => setDisc(v === "disc")} />
        </KnobField>
        <KnobNumber label="back pressure P2 [bar abs]" value={P2bar} min={1.01325}
          max={150} step={0.5} decimals={3} onChange={setP2bar} />
      </Box>
      <Box mt={8}><Waiting runs={[run]} what="the engine is evaluating the loop gas at both relieving pressures" /></Box>
      <PanTable>
        <Table.Thead>
          <Table.Tr><Table.Th>quantity</Table.Th><Table.Th>150 bar loop</Table.Th><Table.Th>50 bar loop</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          <Table.Tr><Table.Td>operating pressure [bar abs]</Table.Td>{cell((r) => bar(LOOP_OPERATING[r.op].P_Pa))}</Table.Tr>
          <Table.Tr><Table.Td>MAWP, ASSUMED = preliminary design pressure [barg]</Table.Td>{cell((r) => bar(preliminaryLadder(LOOP_OPERATING[r.op].P_Pa - P_ATM_PA).mawp))}</Table.Tr>
          <Table.Tr><Table.Td>relieving pressure P1 [bar abs]</Table.Td>{cell((r) => bar(P1[r.op]))}</Table.Tr>
          <Table.Tr><Table.Td>relieving temperature T [K]</Table.Td>{cell((r) => fx(r.pt?.T, 2))}</Table.Tr>
          <Table.Tr><Table.Td>relieving rate W [kg/h] — HYPOTHESIS: the compressor&apos;s nominal flow (the converter feed) whatever the back pressure</Table.Td>{cell((r) => fx(r.g?.W_kg_h, 0))}</Table.Tr>
          <Table.Tr><Table.Td>molar mass M (records) [kg/kmol]</Table.Td>{cell((r) => fx(r.g?.M, 3))}</Table.Tr>
          <Table.Tr><Table.Td>Z (engine, SRK)</Table.Td>{cell((r) => fx(r.pt?.Z, 4))}</Table.Tr>
          <Table.Tr><Table.Td>k = Cp/Cv (engine, ideal gas)</Table.Td>{cell((r) => fx(r.pt?.k, 4))}</Table.Tr>
          <Table.Tr><Table.Td>critical ratio P_cf/P1 against P2/P1</Table.Td>{cell((r) => r.sizing ? `${fx(r.sizing.rc, 3)} vs ${fx(r.sizing.r, 3)}` : "—")}</Table.Tr>
          <Table.Tr><Table.Td>flow regime</Table.Td>{cell((r) => r.sizing?.regime ?? "—")}</Table.Tr>
          <Table.Tr><Table.Td>{"C or F2"}</Table.Td>{cell((r) => fx(r.sizing?.coefficient, 5))}</Table.Tr>
          <Table.Tr><Table.Td><b>required area A [mm2]</b></Table.Td>{cell((r) => fx(r.sizing?.A_mm2, 0))}</Table.Tr>
          <Table.Tr><Table.Td>required area A [in2]</Table.Td>{cell((r) => fx(r.sizing ? r.sizing.A_mm2 / IN2_MM2 : NaN, 2))}</Table.Tr>
        </Table.Tbody>
      </PanTable>
      <Text size="sm" mt={6}>
        {Number.isFinite(ratio)
          ? <>At 50 bar the valve needs {ratio.toFixed(2)} times the area it
              needs at 150 bar, on the same declared blocked-outlet flow for
              both: the lower-pressure loop circulates more gas, and every
              kilogram passes the orifice at a third of the pressure.  In this
              exercise, lowering the pressure enlarged the required area --
              the same trade the Process-safety page found in the inventory.
              It is a comparison of the sizing arithmetic under one teaching
              hypothesis, not of the two loops&apos; real relief systems,
              whose rates would be worked from each compressor&apos;s curve at
              the relieving pressure (step 2).</>
          : "—"}
      </Text>
      <PanelNote>
        Runs tutorials/{RELIEF_WITNESS_LOOP} in your browser (choupoProps
        WASM), moving only each operation&apos;s pressure to the relieving
        pressure above.  The relieving rate is the converter feed each
        witness operation carries as its composition -- the plants&apos;
        converged PreheatedFeed, copied and held to them by the test -- priced
        with the records&apos; molar masses.  That rate is a DIDACTIC
        HYPOTHESIS (step 2): the recycle compressor&apos;s nominal flow, taken
        whatever the pressure it pushes against.  A real compressor&apos;s
        delivery into a blocked outlet is set by its curve, its antisurge
        recycle, its trips and the loop&apos;s topology, none of which is
        modelled here.  The MAWP is ASSUMED equal to the Design Guide&apos;s
        preliminary design pressure (step 6).  Kd 0.975 and Kc 0.9 are API
        520&apos;s preliminary values as the open fluids implementation
        carries them; Kb is yours.
      </PanelNote>
    </Box>
  );
}

// ---- Bench 3: the fire case -------------------------------------------------

export interface FireOutcome {
  Q_W: number; lambda_J_kg: number; W_kg_h: number;
  /** The required area, null until the run is at the relieving state. */
  A_mm2: number | null;
  P1_Pa: number;
}

function FireBench({ mawpBarg, setMawp, onOutcome }: {
  mawpBarg: number; setMawp: (v: number) => void;
  onOutcome: (o: FireOutcome | null) => void;
}): JSX.Element {
  const raw = tutorialByName(RELIEF_WITNESS_FIRE)?.files.rawFiles;
  const M = recordScalar(raw, FIRE_COMPONENT, "MW") ?? NaN;
  const [A, setA] = useState(DEFAULT_WETTED_M2);
  const [F, setF] = useState(1);
  const [adequate, setAdequate] = useState(true);
  const [Kd, setKd] = useState(0.975);
  const [P2bar, setP2bar] = useState(1.01325);
  const P1 = relievingPressureAbs(mawpBarg * 1e5, "fire");
  //  The temperature the witness is evaluated at.  It starts at the one the
  //  witness ships (its own boiling temperature at the default MAWP) and is
  //  moved to each run's T_bubble, so the numbers drawn belong to the
  //  relieving state.
  const [Tstate, setTstate] = useState(FIRE_SHIPPED_T_K);
  const run = useMethodRun(RELIEF_WITNESS_FIRE, fireOverrides(P1, Tstate),
    `P=${P1},T=${Tstate}`, "choupoProps");
  const pt = readPoint(run.result, FIRE_OP, `Hvap_${FIRE_COMPONENT}`);
  const Tb = pt?.T_bubble;
  const { atState, nextT } = fireRunState(pt, Tstate, P1);
  useEffect(() => {
    if (nextT !== null) setTstate(nextT);
  }, [nextT]);

  const Q = fireHeatInput(A, F, adequate);
  const lambda = atState && pt?.Hvap !== undefined ? pt.Hvap / (M / 1000) : NaN;
  const Wkg_s = fireVapourRate(Q, lambda);
  const W = Wkg_s * 3600;
  const sizing = atState && pt ? gasArea({
    W_kg_h: W, T_K: pt.T, Z: pt.Z, M, k: pt.k, P1_kPa: P1 / 1000,
    P2_kPa: P2bar * 100, Kd, Kb: 1, Kc: 1,
  }) : null;
  const Afire = sizing ? sizing.A_mm2 : null;
  useEffect(() => {
    onOutcome(Number.isFinite(W)
      ? { Q_W: Q, lambda_J_kg: lambda, W_kg_h: W, A_mm2: Afire, P1_Pa: P1 }
      : null);
  }, [Q, lambda, W, Afire, P1, onOutcome]);

  return (
    <Box>
      <Title order={5}>The fire bench: an acetone drum</Title>
      <OriginMark of={["engine", "page", "reference", "assumption"]} note="the boiling state and its properties are the engine's run in this browser; the API 521 heat input and the API 520 area are computed on this page; the MAWP and the wetted area are author-set round numbers" />
      <Text size="sm" mt={4}>
        A drum of acetone in a pool fire, relieving through a valve set at its
        MAWP with the fire allowance of 21 %.  Move the MAWP and the engine
        finds the boiling temperature at the new relieving pressure, then
        evaluates the latent heat, Z and k there.
      </Text>
      <Box mt={8} style={KNOB_GRID}>
        <KnobNumber label="assumed MAWP = set pressure [barg]" value={mawpBarg} min={0.5}
          max={30} step={0.5} decimals={2} onChange={setMawp} />
        <KnobNumber label="wetted area A_wet [m2]" value={A} min={1} max={500}
          step={5} decimals={1} onChange={setA} />
        <KnobNumber label="environment factor F" value={F} min={0} max={1}
          step={0.05} decimals={3} onChange={setF} />
        <KnobField label="drainage and fire-fighting">
          <SegmentedControl size="xs" fullWidth value={adequate ? "yes" : "no"}
            data={[{ value: "yes", label: "adequate" },
                   { value: "no", label: "inadequate" }]}
            onChange={(v) => setAdequate(v === "yes")} />
        </KnobField>
        <KnobNumber label="Kd, discharge coefficient" value={Kd} min={0.3}
          max={1} step={0.005} decimals={3} onChange={setKd} />
        <KnobNumber label="back pressure P2 [bar abs]" value={P2bar} min={1.01325}
          max={30} step={0.25} decimals={3} onChange={setP2bar} />
      </Box>
      <Box mt={8}>
        <Waiting runs={[run]} what="the engine is evaluating acetone at the relieving pressure" />
        {!atState && typeof Tb === "number" && run.err === null && (
          <Text size="xs" c="dimmed">re-running at the boiling temperature the engine just found…</Text>
        )}
      </Box>
      <PanTable>
        <Table.Thead>
          <Table.Tr><Table.Th>quantity</Table.Th><Table.Th>value</Table.Th><Table.Th>from</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          <Table.Tr><Table.Td>relieving pressure P1 [bar abs]</Table.Td><Table.Td>{bar(P1)}</Table.Td><Table.Td>step 6, fire allowance</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>relieving temperature [K]</Table.Td><Table.Td>{atState ? fx(Tb, 2) : "—"}</Table.Td><Table.Td>engine, T_bubble</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>latent heat [kJ/mol]</Table.Td><Table.Td>{atState ? fx((pt?.Hvap ?? NaN) / 1000, 3) : "—"}</Table.Td><Table.Td>engine, Hvap_{FIRE_COMPONENT}</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>latent heat λ [kJ/kg]</Table.Td><Table.Td>{fx(lambda / 1000, 1)}</Table.Td><Table.Td>÷ M = {fx(M, 3)} kg/kmol (record)</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>fire heat input Q [kW]</Table.Td><Table.Td>{fx(Q / 1000, 1)}</Table.Td><Table.Td>{fx(fireCoefficientSI(adequate) / 1000, 2)} kW × F × A^0.82</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>vapour to relieve W [kg/h]</Table.Td><Table.Td>{fx(W, 0)}</Table.Td><Table.Td>Q / λ</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>Z</Table.Td><Table.Td>{atState ? fx(pt?.Z, 4) : "—"}</Table.Td><Table.Td>engine, SRK vapour root</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>k = Cp/Cv</Table.Td><Table.Td>{atState ? fx(pt?.k, 4) : "—"}</Table.Td><Table.Td>engine, ideal gas</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>regime</Table.Td><Table.Td>{sizing?.regime ?? "—"}</Table.Td><Table.Td>{sizing ? `P_cf/P1 ${fx(sizing.rc, 3)}, P2/P1 ${fx(sizing.r, 3)}` : ""}</Table.Td></Table.Tr>
          <Table.Tr><Table.Td><b>required area A [mm2]</b></Table.Td><Table.Td><b>{fx(sizing?.A_mm2, 0)}</b></Table.Td><Table.Td>step 8 or 9</Table.Td></Table.Tr>
        </Table.Tbody>
      </PanTable>
      <PanelNote>
        Runs tutorials/{RELIEF_WITNESS_FIRE} in your browser (choupoProps
        WASM), moving its pressure to P1 and then its temperature to the
        boiling temperature that run reports, so every engine number above
        belongs to the relieving state.  The MAWP of {FIRE_DEFAULT_MAWP_BARG} barg
        and the {DEFAULT_WETTED_M2} m2 of wetted surface are round numbers for
        the lesson, not a drum anybody built.  The fire coefficient is API
        521&apos;s US-customary one converted here to SI; the record&apos;s
        vapour pressure is fitted to {"507.6"} K, so a MAWP whose boiling
        temperature passes it is an extrapolation the engine announces.
      </PanelNote>
    </Box>
  );
}

// ---- The liquid check ---------------------------------------------------------

export interface LiquidOutcome { W_kg_h: number; A_mm2: number; P1_Pa: number }

function LiquidBench({ mawpBarg, onOutcome }: {
  mawpBarg: number; onOutcome: (o: LiquidOutcome | null) => void;
}): JSX.Element {
  const raw = tutorialByName(RELIEF_WITNESS_FIRE)?.files.rawFiles;
  const M = recordScalar(raw, FIRE_COMPONENT, "MW") ?? NaN;
  const Vliq = recordScalar(raw, FIRE_COMPONENT, "Vliq") ?? NaN;
  const G = specificGravity(M, Vliq);
  const [Q, setQ] = useState(DEFAULT_PUMP_L_MIN);
  //  API 520 Part I, Example 5 (10th ed.), as fluids reproduces it.
  const ex5 = liquidArea({ Q_L_min: 6814, G: 0.9 * 999 / WATER_REF_DENSITY,
    P1_kPag: 1.1 * 1724, P2_kPag: 0.2 * 1724, Kd: 0.65, Kw: 0.97, Kc: 1, Kv: 1 });
  //  The pump is a blocked outlet, not a fire: the single-device allowance
  //  on the same drum's assumed MAWP.
  const p1g = maxAccumulatedGauge(mawpBarg * 1e5, "single");
  const p1 = p1g / 1000;
  const pump = liquidArea({ Q_L_min: Q, G, P1_kPag: p1, P2_kPag: 0,
    Kd: 0.65, Kw: 1, Kc: 1, Kv: 1 });
  const Wpump = liquidMassFlow(Q, G);
  useEffect(() => {
    onOutcome(Number.isFinite(pump) && Number.isFinite(Wpump)
      ? { W_kg_h: Wpump, A_mm2: pump, P1_Pa: p1g + P_ATM_PA } : null);
  }, [pump, Wpump, p1g, onOutcome]);
  return (
    <Box>
      <Title order={5}>The liquid equation, checked and used</Title>
      <OriginMark of={["page", "reference", "assumption"]} note="the standard's own worked example, recomputed on this page; no engine run" />
      <Box mt={8} style={KNOB_GRID}>
        <KnobNumber label="pump flow into the full drum [L/min]" value={Q}
          min={10} max={10000} step={50} decimals={0} onChange={setQ} />
      </Box>
      <PanTable>
        <Table.Thead>
          <Table.Tr><Table.Th>case</Table.Th><Table.Th>Q [L/min]</Table.Th><Table.Th>G</Table.Th><Table.Th>p1 − p2 [kPa]</Table.Th><Table.Th>Kd · Kw</Table.Th><Table.Th>A [mm2]</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          <Table.Tr><Table.Td>API 520 Example 5, its first pass with Kv = 1 (3066 mm2 there)</Table.Td><Table.Td>6814</Table.Td><Table.Td>0.900</Table.Td><Table.Td>{fx(0.9 * 1724, 1)}</Table.Td><Table.Td>0.65 · 0.97</Table.Td><Table.Td>{fx(ex5, 0)}</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>a pump blocked into the acetone drum, one device (cold liquid: hypothesis)</Table.Td><Table.Td>{fx(Q, 0)}</Table.Td><Table.Td>{fx(G, 3)}</Table.Td><Table.Td>{fx(p1, 1)}</Table.Td><Table.Td>0.65 · 1</Table.Td><Table.Td>{fx(pump, 0)}</Table.Td></Table.Tr>
        </Table.Tbody>
      </PanTable>
      <PanelNote>
        No engine run.  The first row is the standard&apos;s own worked
        example (a 2000 SSU oil, so its viscosity correction is taken as 1
        here as in the first pass of the example); the area is the one the
        open fluids implementation reproduces.  The second row relieves a pump
        at the acetone drum&apos;s assumed MAWP of {fx(mawpBarg, 2)} barg plus
        the single-device allowance ({fx(p1g / 1e5, 2)} barg), to atmosphere,
        with the specific gravity from the record&apos;s liquid molar volume
        at 25 °C (Vliq = {fx(Vliq * 1e6, 1)} cm3/mol) -- a record value, not
        a density the engine computed at the pump&apos;s temperature.  The
        equation holds only while the liquid stays liquid in the valve (step
        10), and that is a DECLARED HYPOTHESIS here, not a checked one: the
        pump delivers cold acetone, far below its boiling point at the
        outlet pressure.  The drum&apos;s own liquid, at its boiling point,
        would flash.
      </PanelNote>
    </Box>
  );
}

// ---- Which scenario governs ---------------------------------------------------

function GoverningBench({ fire, liquid, mawpBarg }: {
  fire: FireOutcome | null; liquid: LiquidOutcome | null; mawpBarg: number;
}): JSX.Element {
  const scenarios: ReliefScenario[] = [
    { id: "fire", W_kg_h: fire?.W_kg_h ?? NaN, A_mm2: fire?.A_mm2 ?? null, method: "vapour" },
    { id: "pump", W_kg_h: liquid?.W_kg_h ?? NaN, A_mm2: liquid?.A_mm2 ?? null, method: "liquid" },
    { id: "hotLiquid", W_kg_h: NaN, A_mm2: null, method: "twoPhase" },
  ];
  const ready = fire?.A_mm2 != null && liquid !== null;
  const gov = governingScenario(scenarios);
  const LABEL: Record<string, string> = {
    fire: "external fire: acetone vapour",
    pump: "pump blocked in: cold liquid (hypothesis)",
    hotLiquid: "the drum's own boiling liquid, relieved as liquid",
  };
  const P1 = (id: string): string =>
    id === "fire" ? bar(fire?.P1_Pa ?? NaN)
      : id === "pump" ? bar(liquid?.P1_Pa ?? NaN) : "—";
  const verdict = (id: string): string =>
    gov.unsized.includes(id) ? "two-phase: needs a method this page lacks"
      : !ready ? "—"
      : id === gov.byArea ? "GOVERNS (largest area)"
      : "";
  return (
    <Box>
      <Title order={5}>Which cause governs the acetone drum?</Title>
      <OriginMark of={["page", "engine"]} note="the areas of the two benches above, compared on this page" />
      <Text size="sm" mt={4}>
        The fire bench and the pump row above are two causes on ONE drum, at
        its assumed MAWP of {fx(mawpBarg, 2)} barg, each sized at its own
        relieving pressure and in its own phase (step 1).  The device is
        sized for the larger AREA, whichever moves more mass.
      </Text>
      <PanTable>
        <Table.Thead>
          <Table.Tr><Table.Th>cause</Table.Th><Table.Th>P1 [bar abs]</Table.Th><Table.Th>W [kg/h]</Table.Th><Table.Th>required A [mm2]</Table.Th><Table.Th>verdict</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {scenarios.map((s) => (
            <Table.Tr key={s.id}>
              <Table.Td>{LABEL[s.id]}</Table.Td>
              <Table.Td>{P1(s.id)}</Table.Td>
              <Table.Td>{fx(s.W_kg_h, 0)}</Table.Td>
              <Table.Td>{s.A_mm2 === null ? "not sized" : fx(s.A_mm2, 0)}</Table.Td>
              <Table.Td>{verdict(s.id)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </PanTable>
      <Text size="sm" mt={6}>
        {ready && gov.byArea !== null
          ? (gov.byArea === gov.byFlow
              ? <>Here the cause with the most mass also needs the larger area.
                  Move the pump flow or the wetted area and watch whether that
                  stays true.</>
              : <>The {gov.byFlow === "pump" ? "pump" : "fire"} moves more mass,
                  and the {gov.byArea === "fire" ? "fire" : "pump"} needs the
                  larger valve: a kilogram of vapour needs far more area than a
                  kilogram of liquid.</>)
          : "—"}
      </Text>
      <PanelNote>
        No engine run beyond the two benches it reads.  The third row is
        there to be left out: a liquid at its boiling point flashes in the
        valve (step 10), so the single-phase equations cannot size it, and a
        valve sized on the other two rows is not sized for it.  The same
        largest-area rule is the engine&apos;s reliefValve sizer&apos;s.
      </PanelNote>
    </Box>
  );
}

// ---- The two-phase multiplier --------------------------------------------------

function TwoPhaseBench({ fire }: { fire: FireOutcome | null }): JSX.Element {
  const [x, setX] = useState(0.1);
  const W = fire ? ventMassFlow(fire.Q_W, fire.lambda_J_kg, x) * 3600 : NaN;
  return (
    <Box>
      <Title order={5}>The same heat, vented two-phase</Title>
      <OriginMark of={["page", "engine"]} note="the fire bench's heat input and latent heat put through step 13's estimate on this page" />
      <Box mt={8} style={KNOB_GRID}>
        <KnobNumber label="vapour mass fraction x of what leaves" value={x}
          min={0.01} max={1} step={0.01} decimals={3} onChange={(v) => setX(Math.min(1, Math.max(0.01, v)))} />
      </Box>
      <PanTable>
        <Table.Thead>
          <Table.Tr><Table.Th>what leaves</Table.Th><Table.Th>mass to vent, restricted energy estimate [kg/h]</Table.Th><Table.Th>× the all-vapour vent</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          <Table.Tr><Table.Td>all vapour (the fire bench)</Table.Td><Table.Td>{fx(fire?.W_kg_h, 0)}</Table.Td><Table.Td>1</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>a mixture with x = {fx(x, 3)}</Table.Td><Table.Td>{fx(W, 0)}</Table.Td><Table.Td>{fx(1 / x, 1)}</Table.Td></Table.Tr>
        </Table.Tbody>
      </PanTable>
      <PanelNote>
        The fire bench&apos;s heat input and latent heat, put through step
        13&apos;s restricted estimate of latent-heat removal only to show
        the factor 1/x -- a fire on a solvent drum is not a runaway, and
        this is not a vent size.  Under its hypotheses the power is fixed,
        no gas is made, and the liquid leaving carries no enthalpy and does
        not flash on the way out; a real vent breaks each of them, and the
        liquid it discharges takes reacting mass with it.  What area
        that mass needs is the omega method&apos;s question, which this page
        does not answer (step 13).
      </PanelNote>
    </Box>
  );
}

// ---- The page -----------------------------------------------------------------

export function OverpressureTool(): JSX.Element {
  const [fire, setFire] = useState<FireOutcome | null>(null);
  const [liquid, setLiquid] = useState<LiquidOutcome | null>(null);
  //  ONE drum, so ONE assumed MAWP for the liquid row and the fire bench.
  const [drumMawp, setDrumMawp] = useState(FIRE_DEFAULT_MAWP_BARG);
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
        <Box>
          <Title order={3}>Designing for overpressure: scenarios, devices and relief sizing</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Why a relief system is sized for the worst credible cause, the
            pressures a device lives between, the published sizing equations
            worked on fluids the engine computes, where the relief goes after
            the valve, and why a runaway vent that passes liquid must pass
            more mass, under a restricted energy estimate.
          </Text>
          <Text size="sm" mt={6}>
            The Design Guide&apos;s chapter{" "}
            <Anchor component="button" type="button"
              onClick={() => openGuide(guideUrl("designGuide", DESIGN_GUIDE_RELIEF))}>
              Pressure relief, flare &amp; safety basics
            </Anchor>{" "}
            is the orientation this page expands, and its disclaimer holds
            here: nothing on this page is a design for a real plant.
          </Text>
        </Box>

        <Title order={4}>Part 1 — the cause decides the rate</Title>
        {step(1)}
        {step(2)}
        {step(3)}
        {step(4)}
        {step(5)}

        <Title order={4}>Part 2 — the devices and the pressure ladder</Title>
        {step(6)}
        <LadderBench />
        {step(7)}

        <Title order={4}>Part 3 — sizing</Title>
        {step(8)}
        {step(9)}
        <LoopBench />
        {step(10)}
        <LiquidBench mawpBarg={drumMawp} onOutcome={setLiquid} />
        <FireBench mawpBarg={drumMawp} setMawp={setDrumMawp} onOutcome={setFire} />
        <GoverningBench fire={fire} liquid={liquid} mawpBarg={drumMawp} />
        {step(11)}

        <Title order={4}>Part 4 — disposal</Title>
        {step(12)}

        <Title order={4}>Part 5 — two-phase venting of a runaway</Title>
        {step(13)}
        <TwoPhaseBench fire={fire} />
        {step(14)}
        <Text size="sm">
          Back to{" "}
          <Anchor component="button" type="button"
            onClick={() => setActiveMethodTool("process-safety")}>
            Process safety: remove the hazard before you add a layer
          </Anchor>{" "}for the cooling-failure scenario, the accumulation and
          the criticality classes this vent is the barrier for.
        </Text>

        <LessonLimits limits={OVERPRESSURE_LIMITS} />
        <Box>
          <Title order={5}>Sources, and how each was reached</Title>
          {OVERPRESSURE_SOURCES.map((s) => (
            <Box key={s.id} mt={6}>
              <Text size="sm">{s.cite}</Text>
              <Text size="xs" c="dimmed">{s.used}</Text>
            </Box>
          ))}
        </Box>
      </Stack>
    </Box>
  );
}
