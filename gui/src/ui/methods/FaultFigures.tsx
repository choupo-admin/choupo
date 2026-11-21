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
  FaultFigures -- the interactive figures of the `fault-diagnosis` EduTool
  (DEV.md 4c C464), one per method, each a small panel of sliders and a chart
  computed live from faultDiagnosisMath.ts / faultSignals.ts.  The ORIGIN
  marks are drawn by FaultDiagnosisTool.tsx around each figure (the origin
  test reads that file), so nothing here claims a provenance of its own.
\*---------------------------------------------------------------------------*/

import { useMemo, useState } from "react";

import { Box, NumberInput, SegmentedControl, Table, Text } from "@mantine/core";

import { TraceChart } from "./FaultCharts.js";
import { KnobSlider, type PanelKnob } from "./knobPanel.js";
import {
  absoluteHumidity, alarmRun, arl, catalogueHead, chi2Quantile, dipStats, gaussian,
  humidistatTrace, hxTrace, mean, mulberry32, normalTwoSided, oddOneOut, predictions,
  psatWater, pumpPoint, pumpResidual, PUMP_TOY, reconcile, roomTrace, selfHeatingShift,
  sensorZ, shewhartExceed, SPLITTER_A, SPLITTER_MIXER_A, STORY_SENSORS, STORY_TANK,
  tankStops, tankTrace, valveForSameFlow,
} from "./faultDiagnosisMath.js";
import { classifySignature, makeSignal, type Signature } from "./faultSignals.js";

const f = (v: number, p = 2): string => (Number.isFinite(v) ? v.toFixed(p) : "n/a");

const grid = (children: React.ReactNode): JSX.Element => (
  <Box mt="xs" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
    {children}
  </Box>
);

const knob = (id: string, label: string, min: number, max: number, step: number, unit = ""): PanelKnob =>
  ({ id, label, min, max, step, unit });

function Readout({ id, children }: { id: string; children: React.ReactNode }): JSX.Element {
  return <Text size="sm" mt="xs" data-readout={id}>{children}</Text>;
}

// ---- 1: the room ----------------------------------------------------------------

export function RoomFigure(): JSX.Element {
  const [stop, setStop] = useState(20);
  const [period, setPeriod] = useState(4.5);
  const o = { stopMin: stop, periodH: period, startH: 1, hours: 14 };
  const tr = useMemo(() => roomTrace(o), [stop, period]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = dipStats(tr, o);
  const spans: { from: number; to: number }[] = [];
  for (let s = o.startH; s < o.hours; s += period) spans.push({ from: s, to: Math.min(o.hours, s + stop / 60) });
  return (
    <Box data-figure="room">
      {grid(<>
        <KnobSlider knob={knob("stop", "length of each stop", 0, 60, 1, "min")} value={stop} onChange={setStop} />
        <KnobSlider knob={knob("period", "time between stops", 2, 8, 0.25, "h")} value={period} onChange={setPeriod} />
      </>)}
      <TraceChart x={tr.t} xLabel="time, h" yLabel="room air temperature, C" id="room"
        ariaLabel="Room air temperature dipping during each stop of the unit"
        series={[{ label: "room air (toy)", y: tr.T }]} spans={spans} />
      <Readout id="room">
        The first dip is <b>{f(st.dip, 2)} K</b>; the room takes <b>{f(st.recoverH, 2)} h</b> after the
        restart to recover nine tenths of it. The shaded bands are the stops.
      </Readout>
    </Box>
  );
}

// ---- 2: separating the hypotheses -----------------------------------------------

export function SeparateFigure(): JSX.Element {
  const [load, setLoad] = useState<number>(STORY_TANK.loadLPerDay);
  const [pump, setPump] = useState<number>(STORY_TANK.pumpLPerH);
  const [defrost, setDefrost] = useState(8);
  const base = tankStops(STORY_TANK.tankL, STORY_TANK.loadLPerDay, STORY_TANK.pumpLPerH);
  const pred = predictions(load, pump, base.periodH, defrost);
  const close = (a: number, b: number): boolean => Math.abs(a / b - 1) < 0.1;
  return (
    <Box data-figure="separate">
      {grid(<>
        <KnobSlider knob={knob("load", "moisture load the unit removes", 4, 40, 1, "L/day")} value={load} onChange={setLoad} />
        <KnobSlider knob={knob("pump", "pump emptying rate", 3, 30, 0.5, "L/h")} value={pump} onChange={setPump} />
        <KnobSlider knob={knob("defrost", "defrost length (the hypothesis' own)", 2, 30, 1, "min")} value={defrost} onChange={setDefrost} />
      </>)}
      <Table withTableBorder withColumnBorders fz="xs" mt={8}>
        <Table.Thead><Table.Tr>
          <Table.Th>explanation</Table.Th><Table.Th>predicts a period of</Table.Th><Table.Th>predicts a stop of</Table.Th>
          <Table.Th>fits the period seen ({f(base.periodH, 1)} h)</Table.Th><Table.Th>fits the stop seen ({f(base.stopMin, 0)} min)</Table.Th>
        </Table.Tr></Table.Thead>
        <Table.Tbody>
          {pred.map((p) => (
            <Table.Tr key={p.id} data-hypothesis={p.id}>
              <Table.Td>{p.label}</Table.Td><Table.Td>{f(p.periodH, 2)} h</Table.Td><Table.Td>{f(p.stopMin, 1)} min</Table.Td>
              <Table.Td>{close(p.periodH, base.periodH) ? "yes" : "no"}</Table.Td>
              <Table.Td>{close(p.stopMin, base.stopMin) ? "yes" : "no"}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Readout id="separate">
        Change the load: the timer&apos;s period stays at {f(base.periodH, 1)} h and the full tank&apos;s moves with it
        (tank {STORY_TANK.tankL} L). The period alone never told the two apart; the stop&apos;s length and the response to the load do.
      </Readout>
    </Box>
  );
}

// ---- 3: the sensor that watches the unit ---------------------------------------------

export function HumidistatFigure(): JSX.Element {
  const [heat, setHeat] = useState(0);
  const [width, setWidth] = useState(5);
  const lo = 52.5 - width / 2;
  const hi = 52.5 + width / 2;
  const tr = useMemo(() => humidistatTrace({ loPct: lo, hiPct: hi, selfHeatK: heat, hours: 8 }), [heat, width]); // eslint-disable-line react-hooks/exhaustive-deps
  const shift = selfHeatingShift(20, heat, 55);
  const spans: { from: number; to: number }[] = [];
  let start = -1;
  tr.on.forEach((v, i) => {
    if (v === 1 && start < 0) start = i;
    if ((v === 0 || i === tr.on.length - 1) && start >= 0) { spans.push({ from: tr.t[start]!, to: tr.t[i]! }); start = -1; }
  });
  return (
    <Box data-figure="humidistat">
      {grid(<>
        <KnobSlider knob={knob("heat", "warming of the air at the sensor while running", 0, 3, 0.1, "K")} value={heat} onChange={setHeat} />
        <KnobSlider knob={knob("width", "width of the on/off band, centred on 52.5 %", 2, 20, 0.5, "points")} value={width} onChange={setWidth} />
      </>)}
      <TraceChart x={tr.t} xLabel="time, h" yLabel="relative humidity, %" id="humidistat"
        ariaLabel="Relative humidity of the room and as the unit's sensor sees it"
        series={[{ label: "what the sensor reads", y: tr.seen }, { label: "the room's real value (at the room's temperature)", y: tr.room, dashed: true }]}
        bands={[{ y: hi, label: "switch on above", color: "#ffa94d" }, { y: lo, label: "switch off below", color: "#69db7c" }]}
        spans={spans} />
      <Readout id="humidistat">
        At 20 C and 55 %, a sensor in air {f(heat, 1)} K warmer reads <b>{f(shift, 1)} points</b> lower.
        The unit switched <b>{tr.switches}</b> times in 8 h (<b>{f(tr.switches / 8, 1)} per hour</b>). The shaded bands are the unit running.
      </Readout>
    </Box>
  );
}

// ---- 4: absolute humidity ------------------------------------------------------------

export function HumidityFigure(): JSX.Element {
  const [a, setA] = useState<{ T: number; rh: number }>({ T: STORY_SENSORS[0].T, rh: STORY_SENSORS[0].rhPct });
  const [b, setB] = useState<{ T: number; rh: number }>({ T: STORY_SENSORS[1].T, rh: STORY_SENSORS[1].rhPct });
  const [bias, setBias] = useState(15);
  const ahA = absoluteHumidity(a.T, a.rh / 100);
  const ahB = absoluteHumidity(b.T, b.rh / 100);
  const unitReads = Math.min(100, b.rh + bias);
  const ahUnit = absoluteHumidity(b.T, unitReads / 100);
  const z = sensorZ(ahA, ahB, 0.3, 0.3);
  const row = (name: string, T: number, rh: number, ah: number): JSX.Element => (
    <Table.Tr key={name} data-sensor={name}><Table.Td>{name}</Table.Td><Table.Td>{f(T, 1)} C</Table.Td><Table.Td>{f(rh, 0)} %</Table.Td>
      <Table.Td><b>{f(ah, 2)}</b> g/m3</Table.Td></Table.Tr>
  );
  const num = (v: number, set: (n: number) => void, label: string, min: number, max: number): JSX.Element => (
    <NumberInput size="xs" label={label} value={v} min={min} max={max} step={0.5} onChange={(x) => { if (typeof x === "number") set(x); }} />
  );
  return (
    <Box data-figure="humidity">
      {grid(<>
        {num(a.T, (T) => setA({ ...a, T }), "sensor A, temperature C", 5, 35)}
        {num(a.rh, (rh) => setA({ ...a, rh }), "sensor A, relative humidity %", 10, 100)}
        {num(b.T, (T) => setB({ ...b, T }), "sensor B, temperature C", 5, 35)}
        {num(b.rh, (rh) => setB({ ...b, rh }), "sensor B, relative humidity %", 10, 100)}
        <KnobSlider knob={knob("bias", "the unit's own sensor reads high by", 0, 25, 1, "points")} value={bias} onChange={setBias} />
      </>)}
      <Table withTableBorder withColumnBorders fz="xs" mt={8}>
        <Table.Thead><Table.Tr><Table.Th>sensor</Table.Th><Table.Th>T</Table.Th><Table.Th>relative humidity</Table.Th><Table.Th>absolute humidity</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>
          {row("A", a.T, a.rh, ahA)}
          {row("B", b.T, b.rh, ahB)}
          {row("the unit, next to B", b.T, unitReads, ahUnit)}
        </Table.Tbody>
      </Table>
      <Readout id="humidity">
        A and B differ by {f(Math.abs(a.rh - b.rh), 0)} points of relative humidity but by only{" "}
        <b>{f(Math.abs(ahA - ahB), 2)} g/m3</b> ({f(z, 1)} noise units at an assumed 0.3 g/m3 each). The unit&apos;s sensor, with its{" "}
        {f(bias, 0)} points of bias, is {f(ahUnit - ahB, 2)} g/m3 away from B in the same air: that gap, in a conserved quantity, is what exposes it.
      </Readout>
    </Box>
  );
}

// ---- 6: alarms ---------------------------------------------------------------------

export function AlarmFigure(): JSX.Element {
  const [limit, setLimit] = useState(53);
  const [seed, setSeed] = useState(4);
  const run = useMemo(() => alarmRun({ limit, normal: 50, noise: 1, faultAt: 200, ramp: 0.05, n: 300, seed }), [limit, seed]);
  const x = run.y.map((_, i) => i);
  return (
    <Box data-figure="alarm">
      {grid(<>
        <KnobSlider knob={knob("limit", "high alarm limit (normal level 50, noise 1)", 50, 60, 0.25)} value={limit} onChange={setLimit} />
        <KnobSlider knob={knob("seed", "noise seed", 1, 50, 1)} value={seed} onChange={(v) => setSeed(Math.round(v))} />
      </>)}
      <TraceChart x={x} xLabel="sample" yLabel="measurement" id="alarm"
        ariaLabel="A noisy measurement with a ramp fault from sample 200 and a high alarm limit"
        series={[{ label: "measurement", y: run.y }]} bands={[{ y: limit, label: "alarm limit" }]}
        spans={[{ from: 200, to: 299, color: "#ff8787" }]} />
      <Readout id="alarm">
        Before the fault (samples 0 to 200) the limit was crossed <b>{run.falseAlarms}</b> times by noise alone. After the ramp
        begins the alarm came <b>{Number.isNaN(run.delay) ? "never" : `${run.delay} samples`}</b> later. Move the limit: closer means false alarms, farther means a late alarm.
      </Readout>
    </Box>
  );
}

// ---- 7: the tank ----------------------------------------------------------------------

export function TankFigure(): JSX.Element {
  const [bIn, setBIn] = useState(0);
  const [bOut, setBOut] = useState(-1);
  const tr = useMemo(() => tankTrace({ hours: 24, n: 240, flow: 10, area: 20, biasIn: bIn, biasOut: bOut, noiseF: 0.15, noiseL: 0.002, seed: 11 }), [bIn, bOut]);
  const m = mean(tr.blockR);
  const sd = Math.sqrt(tr.blockR.reduce((s, v) => s + (v - m) ** 2, 0) / (tr.blockR.length - 1));
  const se = sd / Math.sqrt(tr.blockR.length);
  return (
    <Box data-figure="tank">
      {grid(<>
        <KnobSlider knob={knob("bIn", "inlet meter reads too high by", -2, 2, 0.1, "m3/h")} value={bIn} onChange={setBIn} />
        <KnobSlider knob={knob("bOut", "outlet meter reads too high by", -2, 2, 0.1, "m3/h")} value={bOut} onChange={setBOut} />
      </>)}
      <TraceChart x={tr.t} xLabel="time, h" yLabel="flow, m3/h" id="tank-flows" height={160}
        ariaLabel="Inlet and outlet flowmeter readings of a tank held at constant level"
        series={[{ label: "inlet meter", y: tr.Fin }, { label: "outlet meter", y: tr.Fout }]} />
      <TraceChart x={tr.t} xLabel="time, h" yLabel="level, m" id="tank-level" height={110} yDomain={[1.9, 2.1]}
        ariaLabel="Level of the tank: flat"
        series={[{ label: "level transmitter", y: tr.level, color: "#69db7c" }]} />
      <TraceChart x={tr.blockT} xLabel="time, h" yLabel="residual, m3/h" id="tank-residual" height={150}
        ariaLabel="Balance residual per block of 2.4 hours"
        series={[{ label: "r = Fin - Fout - A dh/dt, per 2.4 h block", y: tr.blockR, dots: true, color: "#ff8787" }]}
        bands={[{ y: 0, label: "balanced", color: "#868e96" }]} />
      <Readout id="tank">
        Mean residual <b>{f(m, 2)} m3/h</b> (standard error {f(se, 2)}): {Math.abs(m / se) > 4 ? "far outside noise" : "inside noise"}.
        The balance says the pair of meters disagrees by {f(bIn - bOut, 2)} m3/h; it does not say which one is wrong.
      </Readout>
    </Box>
  );
}

// ---- 8: the exchanger -------------------------------------------------------------------

export function HxFigure(): JSX.Element {
  const [fault, setFault] = useState("fouling");
  const [size, setSize] = useState(0.6);
  const [step, setStep] = useState(3);
  const tr = useMemo(() => hxTrace({
    days: 60, n: 120, noiseT: 0.15, seed: 5, tauDays: 22,
    rInf: fault === "fouling" ? size : 0, stepK: fault === "sensor" ? step : 0, stepDay: 30,
  }), [fault, size, step]);
  const third = 40;
  const dBal = mean(tr.balance.slice(-third)) - mean(tr.balance.slice(0, third));
  const dUA = mean(tr.UAest.slice(-third)) - mean(tr.UAest.slice(0, third));
  return (
    <Box data-figure="exchanger">
      <SegmentedControl size="xs" value={fault} onChange={setFault} data-knob="fault"
        data={[{ value: "fouling", label: "fouling" }, { value: "sensor", label: "a thermometer shifts" }, { value: "none", label: "nothing wrong" }]} />
      {grid(<>
        <KnobSlider knob={knob("size", "fouling: final fall of UA is r/(1+r) with r =", 0.1, 1.2, 0.05)} value={size} onChange={setSize} />
        <KnobSlider knob={knob("step", "cold outlet thermometer shifts by", -5, 5, 0.5, "K")} value={step} onChange={setStep} />
      </>)}
      <TraceChart x={tr.t} xLabel="day" yLabel="UA, kW/K" id="hx-ua" height={170}
        ariaLabel="Estimated and true overall conductance of the exchanger over sixty days"
        series={[{ label: "UA estimated from the measurements", y: tr.UAest, color: "#4dabf7" }, { label: "true UA (toy)", y: tr.UAtrue, dashed: true, color: "#868e96" }]} />
      <TraceChart x={tr.t} xLabel="day" yLabel="Q hot - Q cold, kW" id="hx-balance" height={140}
        ariaLabel="Difference between the duty of the hot side and the duty of the cold side"
        series={[{ label: "energy balance of the two sides", y: tr.balance, color: "#ff8787" }]}
        bands={[{ y: 0, label: "agree", color: "#868e96" }]} />
      <Readout id="exchanger">
        Over the record the estimated UA changed by <b>{f(dUA, 2)} kW/K</b> and the two duties drifted apart by <b>{f(dBal, 1)} kW</b>.{" "}
        {fault === "fouling" ? "UA falls slowly and the duties still agree: the exchanger changed."
          : fault === "sensor" ? "The duties disagree from the day of the shift and UA jumps with it: a thermometer, not the exchanger."
          : "Nothing moves beyond noise."}
      </Readout>
    </Box>
  );
}

// ---- 9: the pump ------------------------------------------------------------------------

export function PumpFigure(): JSX.Element {
  const [wear, setWear] = useState(0.1);
  const [valve, setValve] = useState(1);
  const p = pumpPoint(wear, valve);
  const h0 = PUMP_TOY.H0;
  const qs = Array.from({ length: 41 }, (_, i) => (i * 120) / 40);
  const sysCurve = qs.map((q) => PUMP_TOY.Hst + PUMP_TOY.ks * valve * q * q);
  const cat = qs.map((q) => catalogueHead(q));
  const worn = qs.map((q) => h0 * (1 - wear) - PUMP_TOY.kp * q * q);
  const r = pumpResidual(wear, valve);
  const vSame = valveForSameFlow(wear);
  return (
    <Box data-figure="pump">
      {grid(<>
        <KnobSlider knob={knob("wear", "wear: fraction of the shut-off head lost", 0, 0.25, 0.01)} value={wear} onChange={setWear} />
        <KnobSlider knob={knob("valve", "valve: extra friction of the piping, times", 1, 3, 0.05)} value={valve} onChange={setValve} />
      </>)}
      <TraceChart x={qs} xLabel="flow Q, m3/h" yLabel="head H, m" id="pump" height={210} yDomain={[0, 45]}
        ariaLabel="Catalogue pump curve, worn pump curve, system curve and operating point"
        series={[
          { label: "catalogue curve", y: cat, color: "#69db7c" },
          { label: "this pump", y: worn, color: "#ff8787", dashed: true },
          { label: "system curve", y: sysCurve, color: "#4dabf7" },
          { label: "operating point", x: [p.Q], y: [p.H], dots: true, color: "#ffa94d" },
        ]} />
      <Readout id="pump">
        The pump delivers <b>{f(p.Q, 1)} m3/h</b> at <b>{f(p.H, 1)} m</b>; the catalogue curve gives {f(catalogueHead(p.Q), 1)} m at that flow, so the head
        residual is <b>{f(r, 2)} m</b> ({Math.abs(r) < 0.05 ? "on the curve: a healthy pump" : "below the curve: the pump itself is worse"}).
        A healthy pump with the valve friction raised {f(vSame, 2)} times would deliver the same {f(pumpPoint(0, vSame).Q, 1)} m3/h with a residual of {f(pumpResidual(0, vSame), 2)} m.
      </Readout>
    </Box>
  );
}

// ---- 10: two or three sensors -----------------------------------------------------------

export function SensorFigure(): JSX.Element {
  const [biasB, setBiasB] = useState(0);
  const [biasC, setBiasC] = useState(1.4);
  const y = [10.0, 10.1 + biasB, 10.0 + biasC];
  const s = 0.1;
  const names = ["A", "B", "C"];
  const pairs: [number, number][] = [[0, 1], [0, 2], [1, 2]];
  const odd = oddOneOut(y);
  return (
    <Box data-figure="sensors">
      {grid(<>
        <KnobSlider knob={knob("biasB", "sensor B reads too high by", -2, 2, 0.05)} value={biasB} onChange={setBiasB} />
        <KnobSlider knob={knob("biasC", "sensor C reads too high by", -2, 2, 0.05)} value={biasC} onChange={setBiasC} />
      </>)}
      <Table withTableBorder withColumnBorders fz="xs" mt={8}>
        <Table.Thead><Table.Tr><Table.Th>pair</Table.Th><Table.Th>difference</Table.Th><Table.Th>in noise units (sigma {s} each)</Table.Th><Table.Th>verdict</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>
          {pairs.map(([i, j]) => {
            const z = sensorZ(y[i]!, y[j]!, s, s);
            return (
              <Table.Tr key={`${i}${j}`} data-pair={`${names[i]}${names[j]}`}>
                <Table.Td>{names[i]} and {names[j]}</Table.Td><Table.Td>{f(y[i]! - y[j]!, 2)}</Table.Td><Table.Td>{f(z, 1)}</Table.Td>
                <Table.Td>{z > 3 ? "disagree: one of the two is wrong" : "agree within noise"}</Table.Td>
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
      <Readout id="sensors">
        {odd >= 0 && Math.max(...pairs.map(([i, j]) => sensorZ(y[i]!, y[j]!, s, s))) > 3
          ? <>Three sensors vote: <b>{names[odd]}</b> is the odd one out. Two alone would only have said that they disagree.</>
          : <>All three agree within noise: no sensor is accused.</>}
      </Readout>
    </Box>
  );
}

// ---- 11: reconciliation ---------------------------------------------------------------------

const TRUE_FLOWS = [100, 60, 40, 55, 15];
const FLOW_NAMES = ["F1", "F2", "F3", "F4", "F5"];

export function ReconcileFigure(): JSX.Element {
  const [net, setNet] = useState("splitter");
  const [meter, setMeter] = useState("F3");
  const [bias, setBias] = useState(9);
  const [seed, setSeed] = useState(3);
  const n = net === "splitter" ? 3 : 5;
  const A = net === "splitter" ? SPLITTER_A : SPLITTER_MIXER_A;
  const sigma = Array.from({ length: n }, () => 2);
  const noise = useMemo(() => { const r = mulberry32(seed); return Array.from({ length: 5 }, () => 0.5 * gaussian(r)); }, [seed]);
  const y = TRUE_FLOWS.slice(0, n).map((v, i) => v + noise[i]! + (FLOW_NAMES[i] === meter ? bias : 0));
  const rec = reconcile(A, y, sigma);
  const crit = chi2Quantile(0.95, rec.dof);
  const zc = normalTwoSided(0.95);
  const max = Math.max(...rec.z);
  const top = rec.z.map((v, i) => [v, i] as const).filter(([v]) => v > max - 1e-6).map(([, i]) => FLOW_NAMES[i]!);
  const rejected = rec.chi2 > crit;
  return (
    <Box data-figure="reconcile">
      <SegmentedControl size="xs" value={net} onChange={setNet} data-knob="network"
        data={[{ value: "splitter", label: "a splitter: F1 = F2 + F3" }, { value: "mixer", label: "plus a mixer: F4 = F3 + F5" }]} />
      {grid(<>
        <Box>
          <Text size="xs" c="dimmed" mb={2}>meter with a gross error</Text>
          <SegmentedControl size="xs" value={meter} onChange={setMeter} data-knob="meter"
            data={FLOW_NAMES.slice(0, n).concat(["none"]).map((m) => ({ value: m, label: m }))} />
        </Box>
        <KnobSlider knob={knob("bias", "its error (t/h; every meter has sigma 2)", -15, 15, 0.5)} value={bias} onChange={setBias} />
        <KnobSlider knob={knob("seed", "noise seed", 1, 40, 1)} value={seed} onChange={(v) => setSeed(Math.round(v))} />
      </>)}
      <Table withTableBorder withColumnBorders fz="xs" mt={8}>
        <Table.Thead><Table.Tr><Table.Th>stream</Table.Th><Table.Th>measured</Table.Th><Table.Th>reconciled</Table.Th><Table.Th>adjustment</Table.Th><Table.Th>measurement test z</Table.Th></Table.Tr></Table.Thead>
        <Table.Tbody>
          {y.map((v, i) => (
            <Table.Tr key={i} data-stream={FLOW_NAMES[i]}>
              <Table.Td>{FLOW_NAMES[i]}</Table.Td><Table.Td>{f(v, 2)}</Table.Td><Table.Td>{f(rec.x[i]!, 2)}</Table.Td>
              <Table.Td>{f(rec.adjust[i]!, 2)}</Table.Td><Table.Td style={{ fontWeight: rejected && rec.z[i]! > max - 1e-6 ? 700 : 400 }}>{f(rec.z[i]!, 2)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      <Readout id="reconcile">
        Balance residuals: {rec.r.map((v) => f(v, 2)).join(", ")} t/h. Global statistic <b>{f(rec.chi2, 2)}</b> against the 95 % limit{" "}
        <b>{f(crit, 2)}</b> ({rec.dof} degree{rec.dof > 1 ? "s" : ""} of freedom; p = {f(rec.pValue, 4)}): <b>{rejected ? "rejected" : "accepted"}</b>.{" "}
        {rejected
          ? (top.length === n
            ? <>Every meter has the same score {f(max, 2)} (limit {f(zc, 2)}): one balance cannot choose.</>
            : <>The largest score, {f(max, 2)} against {f(zc, 2)}, belongs to <b>{top.join(" and ")}</b>{top.length > 1 ? ": these meters appear together in the same balances and cannot be told apart" : ""}.</>)
          : "Nothing is accused: the adjustments are noise."}
      </Readout>
    </Box>
  );
}

// ---- 12: signatures ----------------------------------------------------------------------------

export function SignatureFigure(): JSX.Element {
  const [kind, setKind] = useState<Signature>("drift");
  const [size, setSize] = useState(6);
  const [seed, setSeed] = useState(2);
  const y = useMemo(() => makeSignal(kind, { n: 200, dt: 1, seed, noise: 1, size, amp: size / 2, period: 20 }), [kind, size, seed]);
  const r = classifySignature(y, 1);
  const x = y.map((_, i) => i);
  return (
    <Box data-figure="signature">
      <SegmentedControl size="xs" value={kind} onChange={(v) => setKind(v as Signature)} data-knob="kind"
        data={[{ value: "step", label: "step" }, { value: "drift", label: "drift" }, { value: "oscillation", label: "oscillation" }, { value: "noise", label: "noise only" }]} />
      {grid(<>
        <KnobSlider knob={knob("size", "size of the fault, in noise standard deviations", 0.5, 10, 0.5)} value={size} onChange={setSize} />
        <KnobSlider knob={knob("seed", "noise seed", 1, 50, 1)} value={seed} onChange={(v) => setSeed(Math.round(v))} />
      </>)}
      <TraceChart x={x} xLabel="sample" yLabel="signal" id="signature" height={170}
        ariaLabel="A signal with a chosen time signature and noise"
        series={[{ label: kind, y }]} />
      <Readout id="signature">
        A straight line explains <b>{f(100 * r.r2Line, 0)} %</b> of the variance and one step <b>{f(100 * r.r2Step, 0)} %</b>; what is left repeats with an
        autocorrelation of <b>{f(r.peak, 2)}</b>{r.period > 0 ? <> at a period of {f(r.period, 0)} samples</> : null}. The classifier&apos;s reading: <b>{r.kind}</b>
        {r.kind !== kind ? <> (the true shape is {kind}: at this size it is lost in the noise)</> : null}.
      </Readout>
    </Box>
  );
}

// ---- 13: a control chart ---------------------------------------------------------------------------

export function ChartFigure(): JSX.Element {
  const [shift, setShift] = useState(1.5);
  const [seed, setSeed] = useState(7);
  const n = 80;
  const at = 40;
  const y = useMemo(() => { const r = mulberry32(seed); return Array.from({ length: n }, (_, i) => gaussian(r) + (i >= at ? shift : 0)); }, [shift, seed]);
  const first = y.findIndex((v, i) => i >= at && Math.abs(v) > 3);
  const early = y.findIndex((v, i) => i < at && Math.abs(v) > 3);
  const x = y.map((_, i) => i);
  return (
    <Box data-figure="chart">
      {grid(<>
        <KnobSlider knob={knob("shift", "shift of the mean after sample 40, in standard deviations", 0, 4, 0.25)} value={shift} onChange={setShift} />
        <KnobSlider knob={knob("seed", "noise seed", 1, 50, 1)} value={seed} onChange={(v) => setSeed(Math.round(v))} />
      </>)}
      <TraceChart x={x} xLabel="sample" yLabel="in standard deviations" id="chart" height={170}
        ariaLabel="A Shewhart chart with three-sigma limits and a shift of the mean after sample 40"
        series={[{ label: "measurement (standardised)", y }]}
        bands={[{ y: 3, label: "upper limit" }, { y: -3, label: "lower limit" }, { y: 0, label: "mean", color: "#868e96" }]}
        spans={[{ from: at, to: n - 1, color: "#ff8787" }]} />
      <Readout id="chart">
        With nothing wrong the chance of a point outside three-sigma limits is <b>{f(100 * shewhartExceed(0), 2)} %</b>, so on average <b>{f(arl(0), 0)}</b> points
        pass between false alarms. With this shift it is {f(100 * shewhartExceed(shift), 1)} % per point: an average run length of <b>{f(arl(shift), 1)}</b>.
        In this record the first point outside after the shift is {first < 0 ? "none" : `sample ${first}`}{early >= 0 ? `; a false alarm came earlier at sample ${early}` : ""}.
      </Readout>
    </Box>
  );
}

/** Water's saturation pressure at a temperature: exported for the page's own
 *  sentence about where the humidity arithmetic comes from. */
export const psatNote = (T: number): string => `${(psatWater(T) / 1000).toFixed(3)} kPa`;
