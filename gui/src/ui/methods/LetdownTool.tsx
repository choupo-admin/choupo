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
  LetdownTool -- "Large pressure letdown: choked flow, cavitation, flashing
  and noise" (DEV.md 4c C64, commissioned by Vitor 2026-10-11), on the
  "Hydraulics & control" shelf (registry.ts says why that shelf), linked
  both ways with the overpressure page.

  A CONSTRUCTION with TWO WITNESSES run in the browser:
    * letdown01 (choupoSolve): the green-ammonia separator liquid through
      two engine `valve`s (140 -> 20 bar -> the storage pressure, which the
      reader moves) and the loop purge through a third (140 -> 2 bar).
      Every temperature, vapour fraction, density and volumetric flow on
      the page is that run's.
    * letdown02 (choupoProps): the purge's k = Cp/Cv, Z and Cp, and the
      ammonia's vapour pressure at the second throttle's inlet.
  The VALVE ARITHMETIC on those numbers is letdown.ts's (tested); the
  drawings are letdownDrawings.tsx's.  Nothing on this page types a fluid
  property.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import { Alert, Anchor, Box, Group, Loader, Stack, Table, Text, Title } from "@mantine/core";

import { useMethodRun, type MethodRunState } from "../../case/methodRun.js";
import { tutorialByName } from "../../cases/tutorials.js";
import {
  FL_DEFAULT, LETDOWN_PROPS, LETDOWN_WITNESS, LINE_BORE_DEFAULT,
  PROPS_GAS_OP, PROPS_LIQUID_OP, SHIPPED_P_OUT, TURBINE_EFF_DEFAULT,
  XT_DEFAULT, cavitationIndex, chokedLiquidDrop, chokedLiquidOutletPressure,
  chokedPressureRatio, criticalPressureRatio, effectivePressureRatio,
  expansionFactor, flashFractionEstimate, hydraulicPower, idealExpander,
  levelDifference, lineVelocity, liquidCriticalRatioFactor, liquidRegime,
  nozzleFlowFraction, physicalVenaContracta, readProps, readValve,
  recordScalar, stagedDrop, stagesToAvoidVapour, storagePressureOverride,
  valveFlowFraction, venaContractaPressure, type ValveReading,
} from "./letdown.js";
import {
  BubbleCollapseDrawing, ChokedFlowChart, InstallationDrawing,
  RecoveryDrawing, SeriesDrawing, StagesDrawing, TrimsDrawing,
  ValveProfileDrawing,
} from "./letdownDrawings.js";
import { LETDOWN_LIMITS, LETDOWN_SOURCES, LETDOWN_STEPS } from "./letdownLesson.js";
import { KnobSlider, PanelNote } from "./knobPanel.js";
import { LessonLimits, LessonStepView } from "./lessonStep.js";
import { setActiveMethodTool } from "./registry.js";

const step = (n: number) => {
  const s = LETDOWN_STEPS.find((q) => q.n === n);
  return s ? <LessonStepView key={n} step={s} /> : null;
};

const fx = (v: number | null | undefined, d: number): string =>
  typeof v === "number" && Number.isFinite(v) ? v.toFixed(d) : "—";
const bar = (pa: number | undefined, d = 2): string =>
  typeof pa === "number" ? fx(pa / 1e5, d) : "—";

const KNOB_GRID = {
  display: "grid", gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))",
} as const;

/** A drawing with its caption: the caption is prose and lives OUT of the
 *  SVG, where it can reflow. */
function Figure({ children, caption }: { children: React.ReactNode; caption: React.ReactNode }): JSX.Element {
  return (
    <Box component="figure" m={0} mt={8} mb={8} style={{ minWidth: 0 }}>
      {children}
      <Text component="figcaption" size="xs" c="dimmed" mt={4}
        style={{ whiteSpace: "normal", overflowWrap: "anywhere", lineHeight: 1.35 }}>
        {caption}
      </Text>
    </Box>
  );
}

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

/** The liquid heat capacity of a record whose polynomial is a CONSTANT, or
 *  undefined -- a temperature-dependent one would need the engine's own
 *  integral, which this page will not imitate. */
function constantLiquidCp(raw: { [rel: string]: string } | undefined, comp: string): number | undefined {
  const body = raw?.[`constant/components/${comp}.dat`];
  const m = body ? /liquidHeatCapacity\s*\{[^}]*coefficients\s*\(([^)]*)\)/.exec(body) : null;
  if (!m) return undefined;
  const c = m[1]!.trim().split(/\s+/).map(Number);
  return c.length === 1 && Number.isFinite(c[0]) ? c[0] : undefined;
}

// ---- Part 1: the letdown ------------------------------------------------------

function LetdownBench({ run, P2, setP2, D, setD }: {
  run: MethodRunState; P2: number; setP2: (v: number) => void;
  D: number; setD: (v: number) => void;
}): JSX.Element {
  const hp = readValve(run.result, "ValveHP");
  const lp = readValve(run.result, "ValveLP");
  const raw = tutorialByName(LETDOWN_WITNESS)?.files.rawFiles;
  const cpL = constantLiquidCp(raw, "NH3");
  const lambda = recordScalar(raw, "NH3", "HvapTb");
  const est = lp && cpL !== undefined && lambda !== undefined
    ? flashFractionEstimate(cpL, lp.T_in, lp.T_out, lambda) : NaN;
  const rows: [string, (v: ValveReading) => string][] = [
    ["inlet pressure P1 [bar]", (v) => bar(v.P_in)],
    ["outlet pressure P2 [bar]", (v) => bar(v.P_out)],
    ["pressure ratio P1/P2", (v) => fx(v.P_in / v.P_out, 1)],
    ["inlet temperature T1 [K]", (v) => fx(v.T_in, 2)],
    ["outlet temperature T2 [K]", (v) => fx(v.T_out, 2)],
    ["vapour, molar fraction out", (v) => fx(v.vf, 5)],
    ["vapour, mass fraction out", (v) => fx(v.x_mass_out, 5)],
    ["density in [kg/m3]", (v) => fx(v.rho_in, 1)],
    ["density out, no slip [kg/m3]", (v) => fx(v.rho_out, 2)],
    ["volumetric flow in [m3/h]", (v) => fx((v.Q_in ?? NaN) * 3600, 1)],
    ["volumetric flow out [m3/h]", (v) => fx((v.Q_out ?? NaN) * 3600, 1)],
    ["volume ratio out/in", (v) => fx(v.volumeRatio, 2)],
    [`velocity in a ${fx(D * 1000, 0)} mm bore, in [m/s]`, (v) => fx(lineVelocity(v.Q_in ?? NaN, D), 2)],
    [`velocity in a ${fx(D * 1000, 0)} mm bore, out [m/s]`, (v) => fx(lineVelocity(v.Q_out ?? NaN, D), 1)],
  ];
  return (
    <Box>
      <Title order={5}>The letdown, run by the engine</Title>
      <Text size="sm" mt={4}>
        The green-ammonia separator liquid let down in two throttles, each
        followed by a drum.  Move the storage pressure -- the second
        throttle&apos;s outlet -- and the engine runs the whole letdown
        again; choose a line bore to see what the volume does to the
        velocity.
      </Text>
      <Box mt={8} style={KNOB_GRID}>
        <KnobSlider knob={{ id: "P2", label: "storage pressure, second throttle's outlet",
          unit: "bar", min: 1.01325, max: 15, step: 0.05 }}
          value={P2 / 1e5} onChange={(v) => setP2(v * 1e5)} />
        <KnobSlider knob={{ id: "D", label: "line bore before and after the valve",
          unit: "mm", min: 25, max: 600, step: 5 }}
          value={D * 1000} onChange={(v) => setD(v / 1000)} />
      </Box>
      <Box mt={8}><Waiting runs={[run]} what="the engine is letting the ammonia down" /></Box>
      <PanTable>
        <Table.Thead>
          <Table.Tr><Table.Th>quantity</Table.Th><Table.Th>first throttle</Table.Th><Table.Th>second throttle</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map(([label, f]) => (
            <Table.Tr key={label}>
              <Table.Td>{label}</Table.Td>
              <Table.Td>{hp ? f(hp) : "—"}</Table.Td>
              <Table.Td>{lp ? f(lp) : "—"}</Table.Td>
            </Table.Tr>
          ))}
          <Table.Tr>
            <Table.Td>hand estimate of the flash, c_p,L (T1 − T2)/λ</Table.Td>
            <Table.Td>—</Table.Td>
            <Table.Td>{fx(est, 5)}</Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </PanTable>
      <PanelNote>
        Runs tutorials/{LETDOWN_WITNESS} in your browser (choupoSolve WASM),
        moving only the second valve&apos;s outlet pressure (it ships at
        {" "}{bar(SHIPPED_P_OUT.ValveLP, 5)} bar, the plant&apos;s store).
        The hand estimate takes c_p,L = {fx(cpL, 1)} J/(mol K) and
        λ = {fx(lambda, 0)} J/mol from the NH3 record the witness carries,
        and the two temperatures from the run.  The bore is yours, a round
        number for the lesson.
      </PanelNote>
    </Box>
  );
}

// ---- Part 2: the gas ------------------------------------------------------------

function GasBench({ run, props, xT, setXT }: {
  run: MethodRunState; props: MethodRunState; xT: number; setXT: (v: number) => void;
}): JSX.Element {
  const gas = readProps(props.result, PROPS_GAS_OP);
  const purge = readValve(run.result, "PurgeValve");
  const k = gas?.k ?? NaN;
  const curves = useMemo(() => {
    if (!Number.isFinite(k)) return null;
    const xs = Array.from({ length: 201 }, (_, i) => i / 200);
    return {
      valve: xs.map((x) => [x, valveFlowFraction(x, k, xT)] as [number, number]),
      nozzle: xs.map((x) => [x, nozzleFlowFraction(x, k)] as [number, number]),
    };
  }, [k, xT]);
  const rc = Number.isFinite(k) ? criticalPressureRatio(k) : NaN;
  const xch = Number.isFinite(k) ? chokedPressureRatio(k, xT) : NaN;
  const x = purge ? (purge.P_in - purge.P_out) / purge.P_in : NaN;
  return (
    <Box>
      <Title order={5}>The purge letdown: how far past the choke</Title>
      <Box mt={8} style={KNOB_GRID}>
        <KnobSlider knob={{ id: "xT", label: "x_T, the valve's choked pressure-drop ratio factor",
          min: 0.1, max: 0.95, step: 0.01 }} value={xT} onChange={setXT} />
      </Box>
      <Box mt={8}><Waiting runs={[props, run]} what="the engine is evaluating the purge gas" /></Box>
      {curves && (
        <Figure caption={<>The valve (solid, blue) and an ideal nozzle (dashed,
          orange): mass flow as a fraction of the choked flow, at a fixed inlet
          state and opening, against the pressure-drop ratio.  Both rise and
          then stop rising.  With your x_T = {fx(xT, 2)} the valve chokes at
          {xch > 1 - rc ? " a larger" : " a smaller"} pressure-drop ratio than
          the nozzle; x_T belongs to the valve&apos;s style and travel, and the
          default 0.7 is only an illustration.  The circle is the purge
          letdown: everything right of the dashed lines buys no more mass
          flow -- downstream of the throat that pressure goes into a
          supersonic jet, shocks and mixing, its availability destroyed and a
          small part of it radiated as sound.</>}>
          <ChokedFlowChart valve={curves.valve} nozzle={curves.nozzle}
            xCh={xch} xNozzle={1 - rc} xCase={Number.isFinite(x) ? x : null} />
        </Figure>
      )}
      <PanTable>
        <Table.Thead>
          <Table.Tr><Table.Th>quantity</Table.Th><Table.Th>value</Table.Th><Table.Th>from</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          <Table.Tr><Table.Td>k = Cp/Cv of the purge</Table.Td><Table.Td>{fx(gas?.k, 4)}</Table.Td><Table.Td>engine, letdown02 (ideal gas)</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>Z at 140 bar</Table.Td><Table.Td>{fx(gas?.Z, 4)}</Table.Td><Table.Td>engine, SRK vapour root</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>nozzle critical ratio P*/P1</Table.Td><Table.Td>{fx(rc, 4)}</Table.Td><Table.Td>step 4</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>valve chokes at x = F_γ x_T</Table.Td><Table.Td>{fx(xch, 4)}</Table.Td><Table.Td>step 5, x_T yours</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>the purge letdown&apos;s x</Table.Td><Table.Td>{fx(x, 4)}</Table.Td><Table.Td>140 → {bar(purge?.P_out, 1)} bar</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>x_eff = min(x, F_γ x_T), what the valve can use</Table.Td><Table.Td>{Number.isFinite(x) && Number.isFinite(k) ? fx(effectivePressureRatio(x, k, xT), 4) : "—"}</Table.Td><Table.Td>step 5</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>Y at x_eff</Table.Td><Table.Td>{Number.isFinite(x) && Number.isFinite(k) ? fx(expansionFactor(x, k, xT), 4) : "—"}</Table.Td><Table.Td>step 5</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>regime</Table.Td><Table.Td>{Number.isFinite(x) && Number.isFinite(xch) ? (x >= xch ? "choked: the mass flow is capped" : "not choked") : "—"}</Table.Td><Table.Td /></Table.Tr>
          <Table.Tr><Table.Td>volume ratio out/in</Table.Td><Table.Td>{fx(purge?.volumeRatio, 1)}</Table.Td><Table.Td>engine, letdown01 PurgeValve</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>outlet temperature [K]</Table.Td><Table.Td>{fx(purge?.T_out, 2)}</Table.Td><Table.Td>engine, letdown01 PurgeValve: the Joule-Thomson cooling (step 6)</Table.Td></Table.Tr>
        </Table.Tbody>
      </PanTable>
      <PanelNote>
        Runs tutorials/{LETDOWN_PROPS} (choupoProps WASM) for k and Z, and
        reads the purge&apos;s throttle from the letdown run above.  The default
        x_T = {XT_DEFAULT} is the open fluids library&apos;s keyword default,
        not any valve&apos;s; a maker&apos;s data sheet gives the real one.
      </PanelNote>
    </Box>
  );
}

// ---- Part 3: the liquid -----------------------------------------------------------

function LiquidBench({ run, props, P2, setP2, FL, setFL }: {
  run: MethodRunState; props: MethodRunState; P2: number; setP2: (v: number) => void;
  FL: number; setFL: (v: number) => void;
}): JSX.Element {
  const lp = readValve(run.result, "ValveLP");
  const liq = readProps(props.result, PROPS_LIQUID_OP);
  const raw = tutorialByName(LETDOWN_PROPS)?.files.rawFiles;
  const Pc = (recordScalar(raw, "NH3", "Pc") ?? NaN) * 1e5;
  const Pv = liq?.Psat_NH3 ?? NaN;
  const P1 = lp?.P_in ?? NaN;
  const ok = Number.isFinite(Pv) && Number.isFinite(P1);
  const Pvc = ok ? venaContractaPressure(P1, P2, FL) : NaN;
  const okPc = ok && Number.isFinite(Pc);
  const phys = okPc ? physicalVenaContracta(P1, P2, Pv, Pc, FL) : null;
  const FF = okPc ? liquidCriticalRatioFactor(Pv, Pc) : NaN;
  const regime = ok ? liquidRegime(P1, P2, Pv, FL) : null;
  return (
    <Box>
      <Title order={5}>The second throttle: where the vena contracta sits</Title>
      <Box mt={8} style={KNOB_GRID}>
        <KnobSlider knob={{ id: "FL", label: "F_L, the valve's pressure recovery factor",
          min: 0.5, max: 0.99, step: 0.01 }} value={FL} onChange={setFL} />
        <KnobSlider knob={{ id: "P2b", label: "storage pressure (the same knob as above)",
          unit: "bar", min: 1.01325, max: 15, step: 0.05 }}
          value={P2 / 1e5} onChange={(v) => setP2(v * 1e5)} />
      </Box>
      <Box mt={8}><Waiting runs={[props, run]} what="the engine is evaluating ammonia's vapour pressure" /></Box>
      {ok && (
        <Figure caption={<>A flow-up globe valve: the liquid enters under the
          seat, turns up through it past the plug, and leaves above.  Under
          it, the pressure along that path on your numbers -- P1 from the
          run, the dip at the vena contracta from your F_L, the recovery to
          P2, against the engine&apos;s vapour pressure (dashed).  Once the
          flow is choked the dip is drawn held near F_F P_v, where the
          vaporising vena contracta sits, not at the single-phase
          extrapolation.  Circles are vapour; crosses where it collapses.
          Move the storage pressure above the vapour pressure and a low F_L
          to see cavitation, below it to see flashing.</>}>
          <ValveProfileDrawing P1={P1} P2={P2} Pvc={phys ? phys.P_vc : Pvc} Pv={Pv}
            choked={phys?.choked ?? false} />
        </Figure>
      )}
      <PanTable>
        <Table.Thead>
          <Table.Tr><Table.Th>quantity</Table.Th><Table.Th>value</Table.Th><Table.Th>from</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          <Table.Tr><Table.Td>inlet P1 [bar], T1 [K]</Table.Td><Table.Td>{bar(lp?.P_in)}, {fx(lp?.T_in, 2)}</Table.Td><Table.Td>engine, letdown01</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>vapour pressure of NH3 at T1, Pv [bar]</Table.Td><Table.Td>{bar(Pv, 3)}</Table.Td><Table.Td>engine, Psat_NH3 (letdown02)</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>outlet P2 [bar]</Table.Td><Table.Td>{bar(P2, 3)}</Table.Td><Table.Td>yours</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>vena contracta P_vc, single-phase relation [bar]</Table.Td><Table.Td>{phys?.choked ? `${bar(Pvc)} -- an extrapolation, nonphysical: the flow is choked first` : bar(Pvc)}</Table.Td><Table.Td>step 7</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>cavitation index σ</Table.Td><Table.Td>{ok ? fx(cavitationIndex(P1, P2, Pv), 3) : "—"}</Table.Td><Table.Td>step 8</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>critical pressure of NH3, Pc [bar]</Table.Td><Table.Td>{bar(Pc)}</Table.Td><Table.Td>NH3 record</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>F_F = 0.96 − 0.28 √(Pv/Pc)</Table.Td><Table.Td>{okPc ? fx(FF, 4) : "—"}</Table.Td><Table.Td>step 10</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>F_F Pv, the vena contracta at the choke [bar]</Table.Td><Table.Td>{okPc ? bar(FF * Pv) : "—"}</Table.Td><Table.Td>step 10</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>largest effective drop ΔP_max [bar], against P1 − P2</Table.Td><Table.Td>{okPc ? `${bar(chokedLiquidDrop(P1, Pv, Pc, FL))} vs ${bar(P1 - P2)}` : "—"}</Table.Td><Table.Td>step 10</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>choked once P2 falls below [bar]</Table.Td><Table.Td>{okPc ? `${bar(chokedLiquidOutletPressure(P1, Pv, Pc, FL))}${phys?.choked ? " -- choked here" : " -- not choked here"}` : "—"}</Table.Td><Table.Td>step 10</Table.Td></Table.Tr>
          <Table.Tr><Table.Td><b>regime</b></Table.Td><Table.Td><b>{regime === "neither" ? "neither cavitation nor flashing" : regime ?? "—"}</b></Table.Td><Table.Td>steps 8, 9</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>engine: vapour, molar fraction out</Table.Td><Table.Td>{fx(lp?.vf, 5)}</Table.Td><Table.Td>dissolved gas included (step 9)</Table.Td></Table.Tr>
        </Table.Tbody>
      </PanTable>
      <PanelNote>
        The F_L default, {FL_DEFAULT}, is the open fluids library&apos;s keyword
        default; a real valve&apos;s F_L is its maker&apos;s, and falls as the
        valve opens.  The vapour pressure is the NH3 record&apos;s Antoine curve
        at the temperature the first throttle left the liquid at -- the PURE
        ammonia&apos;s, so classifying this liquid, which holds dissolved
        H2, N2 and Ar, by it is a didactic approximation, and the
        standard&apos;s liquid relations are not meant for a mixture that
        vaporises.
      </PanelNote>
    </Box>
  );
}

// ---- Part 4: stages ---------------------------------------------------------------

function StagesBench({ run, props, P2, FL }: {
  run: MethodRunState; props: MethodRunState; P2: number; FL: number;
}): JSX.Element {
  const [n, setN] = useState(1);
  const lp = readValve(run.result, "ValveLP");
  const Pv = readProps(props.result, PROPS_LIQUID_OP)?.Psat_NH3 ?? NaN;
  const P1 = lp?.P_in ?? NaN;
  const ok = Number.isFinite(Pv) && Number.isFinite(P1);
  const stages = ok ? stagedDrop(P1, P2, n, FL) : [];
  const need = ok ? stagesToAvoidVapour(P1, P2, Pv, FL) : null;
  return (
    <Box>
      <Title order={5}>The stages slider</Title>
      <Box mt={8} style={KNOB_GRID}>
        <KnobSlider knob={{ id: "n", label: "number of stages", min: 1, max: 8, step: 1 }}
          value={n} onChange={(v) => setN(Math.max(1, Math.min(8, Math.round(v))))} />
      </Box>
      {ok && (
        <Figure caption={<>The same drop as the bench above (its F_L and storage
          pressure), taken in {n} stage{n > 1 ? "s" : ""} of equal pressure
          ratio.  Each restriction dips to its own vena contracta; a circle
          marks a stage whose dip reaches the vapour pressure (dashed).
          {P2 <= Pv ? <> The outlet is below the vapour pressure, so the last
            stage flashes whatever the count: staging can prevent or
            mitigate cavitation, but cannot remove the flashing the outlet
            state requires -- it can still hold velocities down and control
            where the vapour forms.</> : need !== null
            ? <> At these numbers {need} stage{need > 1 ? "s" : ""} keep every dip
              above it.</>
            : <> No count up to 20 keeps every dip above it.</>}</>}>
          <StagesDrawing stages={stages} Pv={Pv} />
        </Figure>
      )}
      <PanTable>
        <Table.Thead>
          <Table.Tr><Table.Th>stage</Table.Th><Table.Th>in [bar]</Table.Th><Table.Th>out [bar]</Table.Th><Table.Th>P_vc [bar]</Table.Th><Table.Th>vs Pv</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {stages.map((s) => (
            <Table.Tr key={s.i}>
              <Table.Td>{s.i}</Table.Td><Table.Td>{bar(s.P_in)}</Table.Td>
              <Table.Td>{bar(s.P_out)}</Table.Td>
              <Table.Td>{bar(s.P_vc)}{s.P_vc < 0 ? " (single-phase extrapolation)" : ""}</Table.Td>
              <Table.Td>{s.P_vc > Pv ? "above" : "at or below"}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </PanTable>
      <PanelNote>
        No engine run of its own: the inlet pressure is the letdown run&apos;s,
        the vapour pressure letdown02&apos;s.  Equal-ratio stages with one F_L
        are this page&apos;s model of a staged trim, not a maker&apos;s.
      </PanelNote>
    </Box>
  );
}

// ---- Part 4: recovery --------------------------------------------------------------

function RecoveryBench({ run, props }: { run: MethodRunState; props: MethodRunState }): JSX.Element {
  const [eta, setEta] = useState(TURBINE_EFF_DEFAULT);
  const hp = readValve(run.result, "ValveHP");
  const lp = readValve(run.result, "ValveLP");
  const purge = readValve(run.result, "PurgeValve");
  const gas = readProps(props.result, PROPS_GAS_OP);
  const P = (v: ValveReading | null) =>
    v?.Q_in !== undefined ? hydraulicPower(v.Q_in, v.P_in - v.P_out) : NaN;
  const ex = purge && gas
    ? idealExpander(purge.F, gas.Cp_ig, purge.T_in, gas.k, purge.P_out / purge.P_in) : null;
  const pHP = P(hp);
  return (
    <Box>
      <Title order={5}>What a turbine would take back</Title>
      <Box mt={8} style={KNOB_GRID}>
        <KnobSlider knob={{ id: "eta", label: "turbine efficiency η", min: 0.3, max: 0.95, step: 0.01 }}
          value={eta} onChange={setEta} />
      </Box>
      <Figure caption={<>The first ammonia throttle&apos;s hydraulic power, Q1 (P1 − P2)
        from the run -- the power the drop could ideally deliver in the
        incompressible limit -- taken by a valve (top: all of it dissipated;
        the stream&apos;s enthalpy is unchanged and the availability is
        destroyed) and by a power-recovery turbine of your efficiency
        (bottom: the blue part reaches the shaft).</>}>
        <RecoveryDrawing P_kW={pHP / 1000} eta={eta} />
      </Figure>
      <PanTable>
        <Table.Thead>
          <Table.Tr><Table.Th>stream</Table.Th><Table.Th>Q1 (P1 − P2), ideal [kW]</Table.Th><Table.Th>at the shaft, η [kW]</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          <Table.Tr><Table.Td>ammonia, first throttle</Table.Td><Table.Td>{fx(pHP / 1000, 1)}</Table.Td><Table.Td>{fx(eta * pHP / 1000, 1)}</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>ammonia, second throttle (flashing)</Table.Td><Table.Td>{fx(P(lp) / 1000, 1)}</Table.Td><Table.Td>{fx(eta * P(lp) / 1000, 1)}</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>purge gas, ideal isentropic expander</Table.Td><Table.Td>{fx((ex?.W ?? NaN) / 1000, 1)}</Table.Td><Table.Td>{fx(eta * (ex?.W ?? NaN) / 1000, 1)}</Table.Td></Table.Tr>
          <Table.Tr><Table.Td>purge gas: the ideal expander&apos;s outlet T [K], a formal ideal-gas estimate</Table.Td><Table.Td>{fx(ex?.T2s, 1)}</Table.Td><Table.Td>throttle: {fx(purge?.T_out, 1)}</Table.Td></Table.Tr>
        </Table.Tbody>
      </PanTable>
      <PanelNote>
        The liquid rows are the incompressible limit, on the run&apos;s inlet
        volumetric flow; the gas row is an ideal gas with the engine&apos;s Cp and
        k, molar flow from the run.  The expander&apos;s outlet temperature is
        a FORMAL estimate -- constant Cp and k, below the range the
        records&apos; correlations were fitted over, and low enough that part
        of the purge may condense; a real design solves an isentropic
        equilibrium flash.  What it shows stands: an expander produces far
        more cold than a throttle.  The efficiency default,
        {TURBINE_EFF_DEFAULT}, is a round number for the lesson.
      </PanelNote>
    </Box>
  );
}

// ---- Part 5: noise -----------------------------------------------------------------

function NoiseBench({ run, props }: { run: MethodRunState; props: MethodRunState }): JSX.Element {
  const hp = readValve(run.result, "ValveHP");
  const lp = readValve(run.result, "ValveLP");
  const purge = readValve(run.result, "PurgeValve");
  const gas = readProps(props.result, PROPS_GAS_OP);
  const P = (v: ValveReading | null) =>
    v?.Q_in !== undefined ? hydraulicPower(v.Q_in, v.P_in - v.P_out) : NaN;
  const ex = purge && gas
    ? idealExpander(purge.F, gas.Cp_ig, purge.T_in, gas.k, purge.P_out / purge.P_in) : null;
  const rows: [string, number][] = [
    ["ammonia, first throttle", P(hp)],
    ["ammonia, second throttle (flashing)", P(lp)],
    ["purge gas", ex?.W ?? NaN],
  ];
  const ref = P(hp);
  return (
    <Box>
      <Title order={5}>The three valves, in decibels against each other</Title>
      <PanTable>
        <Table.Thead>
          <Table.Tr><Table.Th>valve</Table.Th><Table.Th>mechanical power dissipated [kW]</Table.Th><Table.Th>dB against the first throttle, same fraction</Table.Th></Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map(([label, W]) => (
            <Table.Tr key={label}>
              <Table.Td>{label}</Table.Td><Table.Td>{fx(W / 1000, 1)}</Table.Td>
              <Table.Td>{fx(levelDifference(W, ref), 1)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </PanTable>
      <PanelNote>
        For the liquids the power is Q1 (P1 − P2); for the gas it is the work
        an ideal expander would have taken from the same drop (the bench
        above).  The decibel column is an estimate of the RATIO and nothing
        more, labelled as one: it
        assumes the same fraction of each valve&apos;s dissipated power becomes
        sound, and that fraction -- which differs between a gas and a liquid,
        and rises steeply with cavitation and with the jet&apos;s Mach number --
        is exactly what the IEC 60534-8 methods compute: 8-3 for a gas, 8-4
        for turbulent liquid flow and cavitation.  8-4 does not cover
        flashing, so the flashing row is a comparison of mechanical power
        and nothing more, not an IEC noise estimate.  No sound level is
        printed, because none was computed.
      </PanelNote>
    </Box>
  );
}

// ---- The page ------------------------------------------------------------------------

export function LetdownTool(): JSX.Element {
  const [P2, setP2] = useState(SHIPPED_P_OUT.ValveLP);
  const [D, setD] = useState(LINE_BORE_DEFAULT);
  const [xT, setXT] = useState(XT_DEFAULT);
  const [FL, setFL] = useState(FL_DEFAULT);
  const overrides = useMemo(() => storagePressureOverride(P2), [P2]);
  const run = useMethodRun(LETDOWN_WITNESS, overrides, `P2=${P2}`, "choupoSolve");
  const props = useMethodRun(LETDOWN_PROPS, [], "shipped", "choupoProps");
  return (
    <Box style={{ flex: 1, minHeight: 0, overflowY: "auto" }} px="md" py="sm">
      <Stack gap="md" style={{ maxWidth: 940, margin: "0 auto" }}>
        <Box>
          <Title order={3}>Large pressure letdown: choked flow, cavitation, flashing and noise</Title>
          <Text size="sm" c="dimmed" mt={4}>
            What a valve taking a large pressure drop does to the stream, why
            that can make it a design problem -- wear, vapour, velocity and
            sound -- and how industry takes the drop instead, worked on the
            green-ammonia plant&apos;s own liquid and purge with the engine
            running.  How severe a letdown is depends on the fluid&apos;s
            state, its vapour pressure, the valve&apos;s F_L and x_T, its
            geometry and the flow, never on the pressure ratio alone.
          </Text>
          <Text size="sm" mt={6}>
            Beside it on this shelf,{" "}
            <Anchor component="button" type="button"
              onClick={() => setActiveMethodTool("pump-system")}>
              the pump and system curve
            </Anchor>{" "}
            raises a pressure; this page takes one away.  On the Process
            safety shelf,{" "}
            <Anchor component="button" type="button"
              onClick={() => setActiveMethodTool("overpressure")}>
              Designing for overpressure
            </Anchor>{" "}
            sizes a relief valve on the same choked-flow physics.
          </Text>
        </Box>

        <Title order={4}>Part 1 — one letdown, with the engine running</Title>
        {step(1)}
        {step(2)}
        {step(3)}
        <LetdownBench run={run} P2={P2} setP2={setP2} D={D} setD={setD} />

        <Title order={4}>Part 2 — gas: choked flow</Title>
        {step(4)}
        {step(5)}
        <GasBench run={run} props={props} xT={xT} setXT={setXT} />
        {step(6)}

        <Title order={4}>Part 3 — liquid: the vena contracta</Title>
        {step(7)}
        <LiquidBench run={run} props={props} P2={P2} setP2={setP2} FL={FL} setFL={setFL} />
        {step(8)}
        <Figure caption={<>What a cavitation bubble does.  Formed where the jet&apos;s
          pressure is below the vapour pressure, it grows; carried to where the
          pressure has recovered, it collapses -- not evenly, but folding in from
          the side away from the wall, which drives a thin jet of liquid at the
          metal.  Repeated at high frequency, the jets and the pressure pulses of
          the collapses pit the surface.  A schematic, not to scale.</>}>
          <BubbleCollapseDrawing />
        </Figure>
        {step(9)}
        {step(10)}

        <Title order={4}>Part 4 — how industry takes the drop</Title>
        {step(11)}
        <StagesBench run={run} props={props} P2={P2} FL={FL} />
        {step(12)}
        <Figure caption={<>Two trims that put the stages inside the valve.  Left, a
          drilled cage in section: the flow enters through many small holes in a
          sleeve around the plug, and the jets from opposite holes meet in the
          middle, spending their energy on each other rather than on the wall.
          Right, one disc of a tortuous-path stack seen from above: the passage
          from the rim to the bore turns through many right angles, each a small
          drop, so the velocity stays low all along it.  Schematics, not any
          maker&apos;s design.</>}>
          <TrimsDrawing />
        </Figure>
        {step(13)}
        <Figure caption={<>The same flashing letdown installed two ways.  Top: the valve
          at the receiving drum; the long line carries liquid (solid), slow, and
          the two-phase jet (dashed) goes straight into the drum.  Bottom: the
          valve at the source; the whole long line carries the fast two-phase
          flow, which erodes its bends and slugs the receiver.</>}>
          <InstallationDrawing />
        </Figure>
        <Figure caption={<>A fixed restriction orifice in series with the control
          valve: the drop is shared, so the valve takes only part of it (solid)
          instead of all of it (dotted), and each device&apos;s vena contracta
          dips less.  The orifice cannot move, so it is sized for the normal
          flow and the valve keeps the control.  Against cavitation it is very
          useful: it raises the valve&apos;s backpressure.  Against flashing
          it is not a cure: if the final P2 is below the vapour pressure the
          orifice does not remove the flashing, it moves the two-phase
          crossing to the last device -- the orifice itself.</>}>
          <SeriesDrawing />
        </Figure>
        {step(14)}
        <RecoveryBench run={run} props={props} />

        <Title order={4}>Part 5 — noise</Title>
        {step(15)}
        <NoiseBench run={run} props={props} />
        {step(16)}

        <LessonLimits limits={LETDOWN_LIMITS} />
        <Box>
          <Title order={5}>Sources, and how each was reached</Title>
          {LETDOWN_SOURCES.map((s) => (
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
