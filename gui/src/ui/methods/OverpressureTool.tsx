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
import { useNarrowViewport } from "./methodsChrome.js";
import {
  OVERPRESSURE_LIMITS, OVERPRESSURE_SOURCES, OVERPRESSURE_STEPS,
} from "./overpressureLesson.js";
import {
  ACCUMULATION, DESIGN_GUIDE_RELIEF, FIRE_COMPONENT, FIRE_DEFAULT_MAWP_BARG,
  FIRE_OP, FIRE_SHIPPED_T_K, LOOP_OPERATING,
  LOOP_OPS, P_ATM_PA, RELIEF_WITNESS_FIRE, RELIEF_WITNESS_LOOP, SET_LIMITS,
  WATER_REF_DENSITY, designPressureGauge, fireCoefficientSI, fireHeatInput,
  fireOverrides, fireVapourRate, gasArea, liquidArea, loopGas, loopOverrides,
  maxAccumulatedGauge, readPoint, recordScalar, relievingPressureAbs,
  specificGravity, ventMassFlow, type DeviceCase, type GasSizing, type LoopOp,
} from "./overpressure.js";
import { setActiveMethodTool } from "./registry.js";

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
  const opG = opBarg * 1e5;
  const mawp = designPressureGauge(opG);
  const p1g = maxAccumulatedGauge(mawp, c);
  const a = ACCUMULATION[c];
  const floorWins = mawp + a.minPsi * 6894.757293168361 > mawp * (1 + a.frac);
  return (
    <Box>
      <Title order={5}>The ladder for your vessel</Title>
      <Box mt={8} style={KNOB_GRID}>
        <KnobNumber label="operating pressure [barg]" value={opBarg} min={0.1}
          max={300} step={0.5} decimals={2} onChange={setOpBarg} />
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
            <Table.Tr><Table.Td>MAWP (rule of thumb) = set, first device</Table.Td><Table.Td>{bar(mawp)}</Table.Td><Table.Td>{bar(mawp + P_ATM_PA)}</Table.Td></Table.Tr>
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
        MAWP is the Design Guide&apos;s rule of thumb, max(1.1 × operating,
        operating + 1.7 bar), here {mawp > 1.1 * opG + 1 ? "the +1.7 bar floor" : "the 10 %"}.
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
      out[op] = relievingPressureAbs(designPressureGauge(opG), c);
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
          <Table.Tr><Table.Td>relieving pressure P1 [bar abs]</Table.Td>{cell((r) => bar(P1[r.op]))}</Table.Tr>
          <Table.Tr><Table.Td>relieving temperature T [K]</Table.Td>{cell((r) => fx(r.pt?.T, 2))}</Table.Tr>
          <Table.Tr><Table.Td>relieving rate W, the converter feed [kg/h]</Table.Td>{cell((r) => fx(r.g?.W_kg_h, 0))}</Table.Tr>
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
              needs at 150 bar: the lower-pressure loop circulates more gas,
              and every kilogram passes the orifice at a third of the pressure.
              Attenuation lowered the pressure and enlarged the relief system
              -- the same trade the Process-safety page found in the
              inventory.</>
          : "—"}
      </Text>
      <PanelNote>
        Runs tutorials/{RELIEF_WITNESS_LOOP} in your browser (choupoProps
        WASM), moving only each operation&apos;s pressure to the relieving
        pressure above.  The relieving rate is the converter feed each
        witness operation carries as its composition -- the plants&apos;
        converged PreheatedFeed, copied and held to them by the test -- priced
        with the records&apos; molar masses.  Kd 0.975 and Kc 0.9 are API
        520&apos;s preliminary values as the open fluids implementation
        carries them; Kb is yours.
      </PanelNote>
    </Box>
  );
}

// ---- Bench 3: the fire case -------------------------------------------------

export interface FireOutcome { Q_W: number; lambda_J_kg: number; W_kg_h: number }

function FireBench({ onOutcome }: { onOutcome: (o: FireOutcome | null) => void }): JSX.Element {
  const raw = tutorialByName(RELIEF_WITNESS_FIRE)?.files.rawFiles;
  const M = recordScalar(raw, FIRE_COMPONENT, "MW") ?? NaN;
  const [mawpBarg, setMawp] = useState(FIRE_DEFAULT_MAWP_BARG);
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
  useEffect(() => {
    if (typeof Tb === "number" && Math.abs(Tb - Tstate) > 1e-4) setTstate(Number(Tb.toFixed(6)));
  }, [Tb, Tstate]);
  const atState = pt !== null && typeof Tb === "number"
    && Math.abs(pt.T - Tb) <= 1e-3 && Math.abs(pt.P - P1) <= 1e-6 * P1;

  const Q = fireHeatInput(A, F, adequate);
  const lambda = atState && pt?.Hvap !== undefined ? pt.Hvap / (M / 1000) : NaN;
  const Wkg_s = fireVapourRate(Q, lambda);
  const W = Wkg_s * 3600;
  const sizing = atState && pt ? gasArea({
    W_kg_h: W, T_K: pt.T, Z: pt.Z, M, k: pt.k, P1_kPa: P1 / 1000,
    P2_kPa: P2bar * 100, Kd, Kb: 1, Kc: 1,
  }) : null;
  useEffect(() => {
    onOutcome(Number.isFinite(W) ? { Q_W: Q, lambda_J_kg: lambda, W_kg_h: W } : null);
  }, [Q, lambda, W, onOutcome]);

  return (
    <Box>
      <Title order={5}>The fire bench: an acetone drum</Title>
      <Text size="sm" mt={4}>
        A drum of acetone in a pool fire, relieving through a valve set at its
        MAWP with the fire allowance of 21 %.  Move the MAWP and the engine
        finds the boiling temperature at the new relieving pressure, then
        evaluates the latent heat, Z and k there.
      </Text>
      <Box mt={8} style={KNOB_GRID}>
        <KnobNumber label="MAWP = set pressure [barg]" value={mawpBarg} min={0.5}
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
        {!atState && run.result !== null && run.err === null && (
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

function LiquidBench(): JSX.Element {
  const raw = tutorialByName(RELIEF_WITNESS_FIRE)?.files.rawFiles;
  const M = recordScalar(raw, FIRE_COMPONENT, "MW") ?? NaN;
  const Vliq = recordScalar(raw, FIRE_COMPONENT, "Vliq") ?? NaN;
  const G = specificGravity(M, Vliq);
  const [Q, setQ] = useState(DEFAULT_PUMP_L_MIN);
  //  API 520 Part I, Example 5 (10th ed.), as fluids reproduces it.
  const ex5 = liquidArea({ Q_L_min: 6814, G: 0.9 * 999 / WATER_REF_DENSITY,
    P1_kPag: 1.1 * 1724, P2_kPag: 0.2 * 1724, Kd: 0.65, Kw: 0.97, Kc: 1, Kv: 1 });
  const p1 = 1.1 * FIRE_DEFAULT_MAWP_BARG * 100;
  const pump = liquidArea({ Q_L_min: Q, G, P1_kPag: p1, P2_kPag: 0,
    Kd: 0.65, Kw: 1, Kc: 1, Kv: 1 });
  return (
    <Box>
      <Title order={5}>The liquid equation, checked and used</Title>
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
          <Table.Tr><Table.Td>a pump blocked into the acetone drum, one device</Table.Td><Table.Td>{fx(Q, 0)}</Table.Td><Table.Td>{fx(G, 3)}</Table.Td><Table.Td>{fx(p1, 1)}</Table.Td><Table.Td>0.65 · 1</Table.Td><Table.Td>{fx(pump, 0)}</Table.Td></Table.Tr>
        </Table.Tbody>
      </PanTable>
      <PanelNote>
        No engine run.  The first row is the standard&apos;s own worked
        example (a 2000 SSU oil, so its viscosity correction is taken as 1
        here as in the first pass of the example); the area is the one the
        open fluids implementation reproduces.  The second row relieves a pump
        at the acetone drum&apos;s {FIRE_DEFAULT_MAWP_BARG} barg MAWP plus 10 %,
        to atmosphere, with the specific gravity from the record&apos;s liquid
        molar volume at 25 °C (Vliq = {fx(Vliq * 1e6, 1)} cm3/mol) -- a
        record value, not a density the engine computed at the pump&apos;s
        temperature.
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
      <Box mt={8} style={KNOB_GRID}>
        <KnobNumber label="vapour mass fraction x of what leaves" value={x}
          min={0.01} max={1} step={0.01} decimals={3} onChange={(v) => setX(Math.min(1, Math.max(0.01, v)))} />
      </Box>
      <PanTable>
        <Table.Thead>
          <Table.Tr><Table.Th>what leaves</Table.Th><Table.Th>mass to vent [kg/h]</Table.Th><Table.Th>× the all-vapour vent</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          <Table.Tr><Table.Td>all vapour (the fire bench)</Table.Td><Table.Td>{fx(fire?.W_kg_h, 0)}</Table.Td><Table.Td>1</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>a mixture with x = {fx(x, 3)}</Table.Td><Table.Td>{fx(W, 0)}</Table.Td><Table.Td>{fx(1 / x, 1)}</Table.Td></Table.Tr>
        </Table.Tbody>
      </PanTable>
      <PanelNote>
        The fire bench&apos;s heat input and latent heat, put through step
        13&apos;s energy balance.  What area that mass needs is the omega
        method&apos;s question, which this page does not answer (step 13).
      </PanelNote>
    </Box>
  );
}

// ---- The page -----------------------------------------------------------------

export function OverpressureTool(): JSX.Element {
  const [fire, setFire] = useState<FireOutcome | null>(null);
  const narrow = useNarrowViewport();
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
        <Box>
          <Title order={3}>Designing for overpressure: scenarios, devices and relief sizing</Title>
          <Text size="sm" c="dimmed" mt={4}>
            Why a relief system is sized for the worst credible cause, the
            pressures a device lives between, the published sizing equations
            worked on fluids the engine computes, where the relief goes after
            the valve, and why a runaway vent is larger than a vapour one.
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
        {narrow && (
          <Text size="xs" c="dimmed">
            The tables below may be wider than this screen: swipe them
            sideways to see every column.
          </Text>
        )}
        <LoopBench />
        {step(10)}
        <LiquidBench />
        <FireBench onOutcome={setFire} />
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
