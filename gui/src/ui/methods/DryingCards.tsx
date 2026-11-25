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
  DryingCards -- the three cards the drying-curve page grew (C508, page B):

    C4  "Loading": the tray loading L = m_s/A against the time of the curve;
        three engine runs at three loadings, X drawn against t/L;
    C5  "The last percent": the time at which the engine's own X(t) reaches a
        specification, read off its column, with the asymptote at X_eq;
    C6  "Where is the product hot?": the solid's temperature of the tray with
        `solidTemperature integrated`, read off the engine's own column;
  C7  "The spray chamber": sprayDryer01 under a grid of chamber heights and
        wheel speeds, the residence, the constant-rate time and the
        falling-rate constant side by side.

  ZERO PHYSICS IN TYPESCRIPT.  Each number is a KPI or a column of an engine
  run; the TypeScript divides by the loading (a ratio of the case's own
  numbers), reads a time off an emitted series, and orders.  The spray dryer's
  axial particle temperature (SprayDryer.cpp:921) is a display interpolation of
  the engine and is NEVER shown here.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";
import { Alert, Badge, Box, Group, Loader, Table, Text, Title } from "@mantine/core";

import type { TrajectoryData } from "../../adapters/SolverAdapter.js";
import {
  useMethodRunSweep, type DictOverride, type ScalarOverride,
} from "../../case/methodRun.js";
import { DryChart, type ChartGuide, type ChartSeries } from "./DryChart.js";
import { W_SPRAY_BASE, dryerVerdict, timeToReach } from "./dryingBalance.js";
import { KnobSlider } from "./knobPanel.js";
import { OriginMark } from "./origin.js";
import { VERDICT_COLOR, factsOf } from "./WhyDidItNotDryTool.js";

const g4 = (v: number | null | undefined): string =>
  typeof v === "number" && Number.isFinite(v) ? String(Number(v.toPrecision(4))) : "—";
const BOX = {
  border: "1px solid var(--mantine-color-default-border)", borderRadius: 4,
} as const;
const SCROLL = { overflowX: "auto", maxWidth: "100%" } as const;
const COLORS = ["#1c7ed6", "#f59f00", "#c92a2a", "#37b24d"];

/** The free-moisture fractions the last-percent table walks:
 *  phi = (X - X_eq)/(X_c - X_eq), 1 at the corner, 0 on the floor. */
export const PHI_STEPS: readonly number[] = [0.5, 0.25, 0.1, 0.05, 0.02];

/** The moisture at which the free moisture has fallen to the fraction `phi`
 *  of what it was at the corner: X_eq + phi (X_c - X_eq).  A definition. */
export function levelAtPhi(Xeq: number, Xc: number, phi: number): number {
  return Xeq + phi * (Xc - Xeq);
}

export interface TrayRun { traj: TrajectoryData | undefined; kpis: { [k: string]: number } | undefined }

const colX = (tr: TrajectoryData | undefined): readonly number[] | undefined =>
  tr?.vars["dryer.X_kg_kg"];

// ---- C4: loading -------------------------------------------------------------

/** The loadings the collapse card runs, kg dry solid per m2. */
export const COLLAPSE_LOADINGS: readonly number[] = [2, 4, 8];

export function LoadingCollapseCard({ loading, endTime, overridesAt, baseKey }: {
  /** The page's own loading knob, kg/m2. */
  loading: number;
  /** The page's run horizon at that loading, s. */
  endTime: number;
  /** Overrides of the page's other knobs with the loading and the horizon
   *  written for loading L and horizon T. */
  overridesAt: (L: number, T: number) => ScalarOverride[];
  /** Changes whenever a knob other than the loading and the horizon does. */
  baseKey: string;
}): JSX.Element {
  // The horizon scales with the loading, so each curve spans the same t/L.
  const sets = useMemo(
    () => COLLAPSE_LOADINGS.map((L) => overridesAt(L, endTime * (L / loading))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseKey, endTime, loading]);
  const sweep = useMethodRunSweep(
    "batch/drying/dryer01_sucrose_tray", sets, `${baseKey}|${endTime}|${loading}`, "choupoBatch");
  const rows = COLLAPSE_LOADINGS.map((L, i) => {
    const r = sweep.results[i];
    const b = r?.kpis?.["dryer"];
    const t = r?.trajectory?.t, X = colX(r?.trajectory);
    const Xc = b?.["X_critical"], Xe = b?.["X_equilibrium"];
    const lvl = Xc !== undefined && Xe !== undefined ? levelAtPhi(Xe, Xc, 0.25) : null;
    const tq = t && X && lvl !== null ? timeToReach(t, X, lvl) : null;
    return { L, t, X, tc: b?.["t_critical"] ?? null, tq };
  });
  const series: ChartSeries[] = rows.filter((r) => r.t && r.X).map((r, k) => ({
    id: `L${r.L}`, label: `L = ${r.L} kg/m²`, color: COLORS[k]!, dash: k === 1 ? "6 3" : k === 2 ? "2 3" : "",
    pts: r.t!.map((t, j) => [t / r.L, r.X![j]!] as const),
  }));
  const spread = (xs: (number | null)[]): string => {
    const v = xs.filter((x): x is number => x !== null);
    if (v.length < 2) return "—";
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    return `${g4(100 * (Math.max(...v) - Math.min(...v)) / mean)} %`;
  };
  const problems = sweep.errs.filter((e): e is string => !!e);
  return (
    <Box px="sm" py={8} style={BOX} data-card="loading">
      <Title order={5}>Loading: what the time of the curve is proportional to</Title>
      <OriginMark of={["engine", "assumption"]}
        note="three runs of dryer01_sucrose_tray at 2, 4 and 8 kg of dry solid per m2, every other knob as set above; the division by L is the page's" />
      <Text size="sm" mt={4}>
        Three trays, three loadings, the engine run on each.  Drawn against the time over the
        loading, t/L, the three curves of moisture lie on one curve: in this model the time of
        the whole curve is proportional to the kilograms of dry solid on each square metre.
      </Text>
      <Box mt={4} data-sweep="collapse">
        <DryChart series={series} xLabel="time over loading, t/L (s m²/kg)" yLabel="X, kg/kg dry solid"
          aria="Moisture against time over loading for three tray loadings, lying on one curve" xZero yZero />
        {sweep.busy && <Group gap={6}><Loader size="xs" /><Text size="xs" c="dimmed">integrating three trays</Text></Group>}
      </Box>
      <Box style={SCROLL}>
        <Table withTableBorder withColumnBorders fz="xs" data-collapse-table="">
          <Table.Thead><Table.Tr>
            <Table.Th>L, kg/m²</Table.Th><Table.Th>t_critical (engine), s</Table.Th>
            <Table.Th>t_critical / L</Table.Th>
            <Table.Th>time to a quarter of the free moisture left, s</Table.Th>
            <Table.Th>that time / L</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={r.L} data-collapse-row={r.L}>
                <Table.Td>{r.L}</Table.Td>
                <Table.Td>{r.tc === null ? "absent: the run ended first" : g4(r.tc)}</Table.Td>
                <Table.Td>{r.tc === null ? "—" : g4(r.tc / r.L)}</Table.Td>
                <Table.Td>{r.tq === null ? "not reached" : g4(r.tq)}</Table.Td>
                <Table.Td>{r.tq === null ? "—" : g4(r.tq / r.L)}</Table.Td>
              </Table.Tr>
            ))}
            <Table.Tr><Table.Td colSpan={2}><Text size="xs" c="dimmed">spread of the ratio</Text></Table.Td>
              <Table.Td>{spread(rows.map((r) => (r.tc === null ? null : r.tc / r.L)))}</Table.Td>
              <Table.Td />
              <Table.Td>{spread(rows.map((r) => (r.tq === null ? null : r.tq / r.L)))}</Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </Box>
      <Alert color="gray" variant="light" mt={8} p="xs" data-loading-limit="">
        <Text size="xs">
          This is the model&apos;s law, and a real bed does not obey it once the falling rate is
          governed by diffusion inside the material: there the time grows faster than the loading
          (with its square, for a slab drying from one face).  The falling-rate curve here is a
          declared curve, not a mechanism, so a drying test on the real loading is what settles it.
        </Text>
      </Alert>
      {problems.map((e) => <Text key={e} size="xs" c="red" ff="monospace">{e}</Text>)}
    </Box>
  );
}

// ---- C5: the last percent ---------------------------------------------------

export const SPEC_B_KNOB = {
  id: "targetX", label: "specification X_target (kg/kg dry solid)",
  min: 0.01, max: 0.3, step: 0.005, def: 0.05,
  why: "the moisture the product must reach: read from the engine's curve the time it takes, and see it grow without bound as the target nears the floor",
} as const;

export function LastPercentCard({ run }: { run: TrayRun }): JSX.Element {
  const [target, setTarget] = useState<number>(SPEC_B_KNOB.def);
  const k = run.kpis;
  const t = run.traj?.t, X = colX(run.traj);
  const Xc = k?.["X_critical"], Xe = k?.["X_equilibrium"];
  const have = t && X && Xc !== undefined && Xe !== undefined;
  const rows = have
    ? PHI_STEPS.map((phi) => {
      const lvl = levelAtPhi(Xe!, Xc!, phi);
      return { phi, lvl, time: timeToReach(t!, X!, lvl) };
    }) : [];
  const series: ChartSeries[] = have ? [{
    id: "tx", label: "time to reach X (engine curve, X against t turned over)", color: "#4263eb",
    pts: X!.map((x, j) => [x, t![j]!] as const),
  }] : [];
  const guides: ChartGuide[] = have ? [
    { dir: "v", at: Xe!, label: "X_eq: the floor", color: "#12b886" },
    { dir: "v", at: Xc!, label: "X_c", color: "#ef5350" },
    { dir: "v", at: target, label: "X_target", color: "#495057", dash: "" },
  ] : [];
  const tTarget = have ? timeToReach(t!, X!, target) : null;
  const unreachable = have && target <= Xe!;
  const a = rows.find((r) => r.phi === 0.25)?.time ?? null;
  const b = rows.find((r) => r.phi === 0.05)?.time ?? null;
  const tc = k?.["t_critical"] ?? null;
  return (
    <Box px="sm" py={8} style={BOX} data-card="last-percent">
      <Title order={5}>The last percent</Title>
      <OriginMark of={["engine", "assumption"]}
        note="read off the X(t) column of the run above; the free-moisture levels are the page's definition, the times are the engine's" />
      <Text size="sm" mt={4}>
        Turn the curve over and ask how long each moisture takes.  The curve climbs without bound as
        the target approaches the floor X_eq, and the floor is a line it never crosses.
      </Text>
      <Box w={300} maw="100%" mt={6}>
        <KnobSlider knob={SPEC_B_KNOB} value={target} onChange={setTarget} />
      </Box>
      <Text size="sm" mt={4} data-target-read="">
        {!have ? "Waiting for the run."
          : unreachable ? `X_target is at or below the floor X_eq = ${g4(Xe)}: no time reaches it in this air.`
            : tTarget === null ? `X_target = ${g4(target)} is not reached within this run's horizon.`
              : `The engine's curve reaches X_target = ${g4(target)} at t = ${g4(tTarget)} s.`}
      </Text>
      <Box mt={4} data-sweep="last-percent">
        <DryChart series={series} guides={guides} xLabel="moisture X, kg/kg dry solid"
          yLabel="time to reach it, s" aria="Time to reach a moisture against the moisture, with the floor as a vertical asymptote"
          yZero />
      </Box>
      <Box style={SCROLL}>
        <Table withTableBorder withColumnBorders fz="xs" data-last-table="">
          <Table.Thead><Table.Tr>
            <Table.Th>free moisture left, share of that at the corner</Table.Th>
            <Table.Th>X at that level</Table.Th><Table.Th>time, s</Table.Th>
            <Table.Th>time since the previous row, s</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {rows.map((r, i) => {
              const prev = i === 0 ? tc : rows[i - 1]!.time;
              return (
                <Table.Tr key={r.phi} data-last-row={r.phi}>
                  <Table.Td>{r.phi}</Table.Td><Table.Td>{g4(r.lvl)}</Table.Td>
                  <Table.Td>{r.time === null ? "not within the run" : g4(r.time)}</Table.Td>
                  <Table.Td>{r.time === null || prev === null ? "—" : g4(r.time - prev)}</Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Box>
      {have && a !== null && b !== null && tc !== null && (
        <Text size="sm" mt={6} data-last-ratio="">
          From the break to a quarter of the free moisture the engine&apos;s curve takes {g4(a - tc)} s;
          from there to a twentieth, {g4(b - a)} s more, {g4((b - a) / (a - tc))} times the first stretch, for a fifth as much
          free moisture to remove.
        </Text>
      )}
      <Text size="xs" c="dimmed" mt={4}>
        The first row&apos;s &quot;since the previous row&quot; is counted from the break time the
        engine published.  The shape of the tail is the declared falling-rate curve (the exponent
        knob moves it): with an exponent below one the curve reaches the floor in finite time, which
        is an artefact of the choice, not a property of the material.
      </Text>
    </Box>
  );
}

// ---- C6: where is the product hot? ------------------------------------------

/** The tray of `dryer03_solid_temperature`: dryer01 with the solid's
 *  temperature integrated (`solidTemperature integrated;`). */
export const HOT_WITNESS = "batch/drying/dryer03_solid_temperature";

/** The first time the series rises above `level`, interpolated between the two
 *  samples that bracket it; null when it never does.  A reading, not a model. */
export function firstTimeAbove(
  t: readonly number[], y: readonly number[], level: number,
): number | null {
  for (let i = 1; i < y.length; ++i) {
    const y0 = y[i - 1]!, y1 = y[i]!;
    if (Number.isFinite(y0) && Number.isFinite(y1) && y0 <= level && y1 > level)
      return t[i - 1]! + ((level - y0) / (y1 - y0)) * (t[i]! - t[i - 1]!);
  }
  return null;
}

/** How far above the wet bulb the solid must be before the page calls it warm, K. */
export const WARM_ABOVE_WET_BULB = 1;

export function HotProductCard(): JSX.Element {
  const sets = useMemo(() => [[] as DictOverride[]], []);
  const sweep = useMethodRunSweep(HOT_WITNESS, sets, "hot-product", "choupoBatch");
  const r = sweep.results[0];
  const k = r?.kpis?.["dryer"];
  const t = r?.trajectory?.t;
  const Ts = r?.trajectory?.vars["dryer.T_solid_K"];
  const X = colX(r?.trajectory);
  const Twb = k?.["T_wb"], tc = k?.["t_critical"] ?? null;
  const Tend = k?.["T_solid_final"];
  const closure = k?.["solidEnergy_closure_rel"];
  const Xeq = k?.["X_equilibrium"];
  const have = !!(t && Ts && Twb !== undefined);
  const stale = !!(r && k && !Ts);
  const warm = have ? firstTimeAbove(t!, Ts!, Twb! + WARM_ABOVE_WET_BULB) : null;
  const series: ChartSeries[] = have ? [{
    id: "Ts", label: "solid temperature (engine)", color: "#c92a2a",
    pts: t!.map((tt, j) => [tt, Ts![j]!] as const),
  }] : [];
  const guides: ChartGuide[] = have ? [
    { dir: "h", at: Twb!, label: "T_wb: the surface while it is wet", color: "#1c7ed6" },
    ...(tc !== null ? [{ dir: "v" as const, at: tc, label: "t_critical", color: "#ef5350" }] : []),
  ] : [];
  const problems = sweep.errs.filter((e): e is string => !!e);
  const read = stale
    ? "The engine in this browser did not return the solid-temperature column; rebuild it (make wasm-gui)."
    : !have ? "Waiting for the run."
      : `The solid stays within ${WARM_ABOVE_WET_BULB} K of the wet bulb (${g4(Twb)} K) until t = `
        + `${warm === null ? "—" : g4(warm)} s`
        + `${tc !== null ? `; the engine's constant-rate period ends at ${g4(tc)} s` : ""}.  At the end of the run it is at `
        + `${g4(Tend)} K${X && X.length ? `, with X = ${g4(X[X.length - 1])} against the floor ${g4(Xeq)}` : ""}.`;
  return (
    <Box px="sm" py={8} style={BOX} data-card="hot-product">
      <Title order={5}>Where is the product hot?</Title>
      <OriginMark of={["engine", "assumption"]}
        note="one run of dryer03_solid_temperature (choupoBatch, solidTemperature integrated); the temperature, the wet bulb, the critical time and the energy ledger are the engine's, the 1 K that calls the solid warm is the page's" />
      <Text size="sm" mt={4}>
        While water covers the surface the product sits at the wet bulb, however hot the air is.
        When the constant-rate period ends the flux falls, the evaporation no longer takes all the
        heat, and the solid warms toward the air.  The engine integrates one temperature for the
        solid and its water with the same film coefficient the wet bulb uses.
      </Text>
      <Box mt={4} data-sweep="hot-product">
        <DryChart series={series} guides={guides} xLabel="time, s" yLabel="solid temperature, K"
          aria="Solid temperature against time, flat at the wet bulb until the critical time and rising toward the air after it" xZero />
        {sweep.busy && <Group gap={6}><Loader size="xs" /><Text size="xs" c="dimmed">integrating the tray</Text></Group>}
      </Box>
      <Text size="sm" mt={4} data-hot-read="">{read}</Text>
      <Text size="sm" mt={4} data-hot-ledger="">
        {closure === undefined ? "" : `The heat the air gave the tray, minus what left with the vapour, equals what the solid stored, to ${g4(Math.abs(closure))} of the heat in (the engine's own ledger).`}
      </Text>
      <Alert color="gray" variant="light" mt={8} p="xs" data-hot-limits="">
        <Text size="xs">
          One temperature for the whole tray: a thick bed has a hot top and a cool bottom, and this
          one does not.  The flux is the declared drying curve and does not feel the temperature, so a warmer surface
          does not dry faster here as it would in a dryer.  The charge is taken to start at the wet bulb.  The
          spray dryer&apos;s particle temperature along the chamber is not this: the engine draws it by
          interpolation and names the column so.
        </Text>
      </Alert>
      {problems.map((e) => <Text key={e} size="xs" c="red" ff="monospace">{e}</Text>)}
    </Box>
  );
}

// ---- C7: the spray chamber --------------------------------------------------

/** The chamber heights (m) and wheel speeds (rpm) of the grid. */
export const CHAMBER_HEIGHTS: readonly number[] = [0.15, 0.6, 1.2, 5];
export const WHEEL_SPEEDS: readonly number[] = [5000, 20000];

const SPRAY_FILE = "system/flowsheetDict";

/** Overrides of one grid point: the chamber height (the dict declares it in
 *  metres) and the wheel speed (declared bare, in rpm). */
export function sprayOverrides(H: number, rpm: number): DictOverride[] {
  return [
    { file: SPRAY_FILE, key: "chamberHeight", value: H, unit: "m" },
    { file: SPRAY_FILE, key: "wheelSpeed", value: rpm, unit: "" },
  ];
}

export function SprayChamberCard(): JSX.Element {
  const grid = useMemo(() => WHEEL_SPEEDS.flatMap((rpm) =>
    CHAMBER_HEIGHTS.map((H) => ({ rpm, H }))), []);
  const sets = useMemo(() => grid.map((p) => sprayOverrides(p.H, p.rpm)), [grid]);
  const sweep = useMethodRunSweep(W_SPRAY_BASE, sets, "spray-grid", "choupoSolve");
  const rows = grid.map((p, i) => {
    const b = sweep.results[i]?.kpis?.["dryer"];
    const f = factsOf(b);
    const tc = b?.["t_constant_rate"] ?? null, tau = b?.["tau_dry_constant"] ?? null;
    return { ...p, b, f, d: b?.["d_droplet_micron"] ?? null, tc, tau,
      v: sweep.results[i] ? dryerVerdict(f, true) : null };
  });
  const scale = Math.max(1e-9, ...rows.flatMap((r) =>
    [r.f.residence ?? 0, r.tc ?? 0, r.tau ?? 0]));
  const bar = (v: number | null, color: string): JSX.Element => (
    <Box style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <Box style={{ height: 8, width: `${Math.max(1, 100 * (v ?? 0) / scale)}%`, maxWidth: 90,
        background: color, borderRadius: 2 }} />
      <Text size="xs">{g4(v)}</Text>
    </Box>
  );
  const fine = rows.filter((r) => r.rpm === WHEEL_SPEEDS[1]);
  const coarse = rows.filter((r) => r.rpm === WHEEL_SPEEDS[0]);
  const tallF = fine.find((r) => r.H === CHAMBER_HEIGHTS[CHAMBER_HEIGHTS.length - 1]);
  const tallC = coarse.find((r) => r.H === CHAMBER_HEIGHTS[CHAMBER_HEIGHTS.length - 1]);
  const ratioD = tallC?.d != null && tallF?.d != null ? tallC.d / tallF.d : null;
  const ratioT = tallC?.tau != null && tallF?.tau != null && tallF.tau > 0 ? tallC.tau / tallF.tau : null;
  const expo = ratioD !== null && ratioT !== null && ratioD > 1 && ratioT > 0
    ? Math.log(ratioT) / Math.log(ratioD) : null;
  const problems = sweep.errs.filter((e): e is string => !!e);
  return (
    <Box px="sm" py={8} style={BOX} data-card="spray-chamber">
      <Title order={5}>The spray-dryer chamber: height and spray against the clock</Title>
      <OriginMark of={["engine", "assumption"]}
        note="eight runs of sprayDryer01_sugar (choupoSolve), chamber height and wheel speed moved; the bars scale the engine's three times, the ratios are the page's" />
      <Text size="sm" mt={4}>
        A droplet falls for the residence time and needs the constant-rate time plus the falling-rate
        constant to dry.  Compare the three, run by run, with the moisture the powder leaves at
        against its floor.
      </Text>
      <Box mt={6} style={SCROLL}>
        <Table withTableBorder withColumnBorders fz="xs" data-spray-table="">
          <Table.Thead><Table.Tr>
            <Table.Th>wheel, rpm</Table.Th><Table.Th>chamber, m</Table.Th>
            <Table.Th>droplet, µm</Table.Th>
            <Table.Th>residence, s</Table.Th><Table.Th>constant-rate time, s</Table.Th>
            <Table.Th>falling-rate constant, s</Table.Th>
            <Table.Th>X_final</Table.Th><Table.Th>X_eq</Table.Th>
            <Table.Th>residence ÷ (constant + falling)</Table.Th>
            <Table.Th>verdict</Table.Th>
          </Table.Tr></Table.Thead>
          <Table.Tbody>
            {rows.map((r) => (
              <Table.Tr key={`${r.rpm}-${r.H}`} data-spray-row={`${r.rpm}-${r.H}`}>
                <Table.Td>{r.rpm}</Table.Td><Table.Td>{r.H}</Table.Td>
                <Table.Td>{g4(r.d)}</Table.Td>
                <Table.Td>{bar(r.f.residence, "#4263eb")}</Table.Td>
                <Table.Td>{bar(r.tc, "#f59f00")}</Table.Td>
                <Table.Td>{bar(r.tau, "#c92a2a")}</Table.Td>
                <Table.Td>{g4(r.f.Xfinal)}</Table.Td><Table.Td>{g4(r.f.Xeq)}</Table.Td>
                <Table.Td>{r.f.residence !== null && r.tc !== null && r.tau !== null
                  ? g4(r.f.residence / (r.tc + r.tau)) : "—"}</Table.Td>
                <Table.Td>{r.v
                  ? <Badge variant="light" color={VERDICT_COLOR[r.v.verdict]} tt="none">
                    {r.v.verdict === "not-classified" ? "not classified" : r.v.verdict}</Badge>
                  : sweep.busy ? <Loader size="xs" /> : "—"}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Box>
      {expo !== null && ratioD !== null && ratioT !== null && (
        <Text size="sm" mt={6} data-size-law="">
          Between the {WHEEL_SPEEDS[0]} and {WHEEL_SPEEDS[1]} rpm sprays in the tallest chamber the
          droplet is {g4(ratioD)} times larger and its falling-rate constant {g4(ratioT)} times
          longer: the constant grows as the size to the power {g4(expo)} in the engine&apos;s runs.
          That is read from two runs, not asserted as a law; the engine&apos;s heat-transfer
          coefficient depends on the particle Reynolds number, so the time is not simply the square of
          the size.
        </Text>
      )}
      <Alert color="gray" variant="light" mt={8} p="xs" data-spray-limits="">
        <Text size="xs">
          The engine models one droplet size, the Sauter mean (SprayDryer.cpp:665), falling
          for a residence set by the chamber height and the particle&apos;s fall speed
          (SprayDryer.cpp:772), so the real chamber&apos;s extra height for the coarse tail, the wall and
          the cone is not in these numbers; wall deposition and stickiness are not computed either.
          The particle temperature along the chamber is not shown: the engine&apos;s own axial profile
          interpolates it for display (SprayDryer.cpp:921) rather than solving it.  Spray dryers are
          built with the gas co-current, counter-current or mixed with the spray; the engine
          offers co-current and counter-current (<code>flow</code>), this page runs the co-current
          witness, and the other flow gives another residence time.
        </Text>
      </Alert>
      {problems.map((e) => <Text key={e} size="xs" c="red" ff="monospace">{e}</Text>)}
    </Box>
  );
}
