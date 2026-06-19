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
  Pinch analysis from a completed run.  Each heat DUTY in the flowsheet becomes
  a thermal stream (a COLD stream that needs heating, Q>0; a HOT stream that
  needs cooling, Q<0), with its supply/target temperatures taken from the run:

    - heater / cooler / heatExchanger : kpi Q_kW + T_in/T_out
    - distillation column             : Q_reboiler_kW @ T_bottom (heating, ~iso),
                                         Q_condenser_kW @ T_top   (cooling, ~iso)
    - any other unit with kpi Q_kW     : T-range from its inlet/outlet stream
                                         temperatures (runResult.streams)

  Then the Problem Table Algorithm gives the minimum hot/cold utility targets and
  the pinch temperature, and the composite curves give the T-H picture.  All
  GUI-side -- the engine already emitted the duties + temperatures.
\*---------------------------------------------------------------------------*/

import type { RunResult, StreamResult } from "../adapters/SolverAdapter.js";
import type { JsonDict } from "../dict/json.js";

export interface ThermalStream { unit: string; kind: "hot" | "cold"; Ts: number; Tt: number; Q_kW: number; }
// A candidate process-process match (screening): a hot stream that can heat a
// cold one with >= dTmin driving force.  capKW = min duty of the pair (an upper
// bound, not the network-optimal recovery).  `side` = which side of the pinch
// the feasible overlap sits (the golden rule: don't match across the pinch).
export interface HeatMatch { hot: string; cold: string; capKW: number; side: "above" | "below"; }
export interface PinchResult {
  streams: ThermalStream[];
  dTmin: number;
  QhMin: number;            // minimum hot utility (kW)
  QcMin: number;            // minimum cold utility (kW)
  QhNow: number;            // current hot utility = sum of heating duties
  QcNow: number;            // current cold utility = sum of cooling duties
  pinchHot: number | null;  // hot-side pinch temperature (K)
  pinchCold: number | null;
  pinchShift: number | null; // shifted pinch temperature (the GCC's y at H=0)
  hotComposite: [number, number][];  // [H_kW, T_K]
  coldComposite: [number, number][];
  gcc: [number, number][];  // Grand Composite Curve: [net H_kW, T_shifted_K]
  matches: HeatMatch[];     // candidate process-process exchanges (screening)
}

const ISO_BAND = 0.5;       // half-width (K) for an isothermal phase-change duty

// Build the thermal-stream list from the run.  Returns [] if nothing usable.
export function thermalStreams(runResult: RunResult | null, flowsheet: JsonDict | undefined): ThermalStream[] {
  if (!runResult || !flowsheet) return [];
  const kpis = runResult.kpis ?? {};
  const byName = new Map((runResult.streams ?? []).map((s: StreamResult) => [s.name, s]));
  const units = Array.isArray(flowsheet["units"]) ? (flowsheet["units"] as JsonDict[]) : [];
  const out: ThermalStream[] = [];
  const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : undefined);
  const namesOf = (v: unknown): string[] =>
    Array.isArray(v) ? (v as string[]).map(String) : v === undefined || v === null ? [] : [String(v)];

  // The unit list is FLAT only at the top level; a fractal plant's root carries
  // `children`, not `units`, so flowsheet["units"] is empty for it.  Iterate the
  // run's KPIS instead (already flattened to plant.sector.unit) -- this works
  // for BOTH flat and fractal cases.  flowsheet `units` (when present) only
  // feeds the stream-temperature fallback below.  (`COLUMN`/`type` no longer
  // needed: a column is detected by its reboiler/condenser kpis.)
  const unitByName = new Map<string, JsonDict>(units.map((u) => [String(u["name"]), u]));
  // Representative isothermal T when a duty has no T_in/T_out range: boiling /
  // crystallising / flashing all happen at ~one T, carried in the kpi.
  const reprT = (k: JsonDict): number | undefined =>
    num(k["T_boil"]) ?? num(k["T_op"]) ?? num(k["T"]) ?? num(k["T_out"]) ?? num(k["T_in"]);

  for (const [name, kRaw] of Object.entries(kpis)) {
    const k = (kRaw ?? {}) as JsonDict;

    // Column: reboiler (heating, base) + condenser (cooling, top), detected by
    // the kpis themselves so it works on a flattened name too.
    const qr = num(k["Q_reboiler_kW"]); const tb = num(k["T_bottom"]);
    const qc = num(k["Q_condenser_kW"]); const tt = num(k["T_top"]);
    if (qr !== undefined || qc !== undefined) {
      if (qr && tb) out.push({ unit: `${name}.reboiler`, kind: "cold", Ts: tb - ISO_BAND, Tt: tb + ISO_BAND, Q_kW: Math.abs(qr) });
      if (qc && tt) out.push({ unit: `${name}.condenser`, kind: "hot", Ts: tt + ISO_BAND, Tt: tt - ISO_BAND, Q_kW: Math.abs(qc) });
      continue;
    }

    // Generic duty.  Q_kW carries a SIGN (+ heating/cold, - cooling/hot).  Units
    // that report only `duty_kW`/`duty` (evaporator, dryer, boiler) are HEATING
    // by construction -> a cold stream (q > 0).  Cooling devices (cooler,
    // crystalliser) report a signed Q_kW, so this stays correct.
    let q = num(k["Q_kW"]);
    if (q === undefined) {
      const dW = num(k["duty"]);
      const d = num(k["duty_kW"]) ?? (dW !== undefined ? dW / 1000 : undefined);
      if (d !== undefined) q = Math.abs(d);   // duty-only => heating
    }
    if (q === undefined || Math.abs(q) < 1e-9) continue;

    // T-range: explicit kpi range, else a representative isothermal T (band),
    // else the connected streams' run temperatures (flat cases only).
    let Ts = num(k["T_in"]); let Tt = num(k["T_out"]);
    if (Ts === undefined || Tt === undefined) {
      const Tr = reprT(k);
      if (Tr !== undefined) {
        Ts = q >= 0 ? Tr - ISO_BAND : Tr + ISO_BAND;
        Tt = q >= 0 ? Tr + ISO_BAND : Tr - ISO_BAND;
      }
    }
    if ((Ts === undefined || Tt === undefined) && unitByName.has(name)) {
      const u = unitByName.get(name)!;
      const inT = namesOf(u["in"] ?? u["inputs"]).map((n) => byName.get(n)?.T).filter((x): x is number => typeof x === "number");
      const outT = namesOf(u["outputs"]).map((n) => byName.get(n)?.T).filter((x): x is number => typeof x === "number");
      if (inT.length) Ts = Math.max(...inT);
      if (outT.length) Tt = q >= 0 ? Math.max(...outT) : Math.min(...outT);
    }
    if (Ts === undefined || Tt === undefined || Ts === Tt) continue;
    out.push({ unit: name, kind: q >= 0 ? "cold" : "hot", Ts, Tt, Q_kW: Math.abs(q) });
  }
  return out;
}

export function canComputePinch(runResult: RunResult | null, flowsheet: JsonDict | undefined): boolean {
  const s = thermalStreams(runResult, flowsheet);
  return s.some((x) => x.kind === "hot") && s.some((x) => x.kind === "cold");
}

const CP = (s: ThermalStream) => s.Q_kW / Math.abs(s.Tt - s.Ts);

// Composite curve for one set (hot or cold): list of [H_kW, T_K] ascending in T.
function composite(streams: ThermalStream[]): [number, number][] {
  if (!streams.length) return [];
  const bks = Array.from(new Set(streams.flatMap((s) => [s.Ts, s.Tt]))).sort((a, b) => a - b);
  const pts: [number, number][] = [[0, bks[0]!]];
  let H = 0;
  for (let i = 0; i < bks.length - 1; i++) {
    const Tlo = bks[i]!, Thi = bks[i + 1]!;
    let cp = 0;
    for (const s of streams) {
      const lo = Math.min(s.Ts, s.Tt), hi = Math.max(s.Ts, s.Tt);
      if (lo <= Tlo && hi >= Thi) cp += CP(s);
    }
    H += cp * (Thi - Tlo);
    pts.push([H, Thi]);
  }
  return pts;
}

export function computePinch(runResult: RunResult | null, flowsheet: JsonDict | undefined,
  dTmin = 10): PinchResult | null {
  const streams = thermalStreams(runResult, flowsheet);
  const hot = streams.filter((s) => s.kind === "hot");
  const cold = streams.filter((s) => s.kind === "cold");
  if (!hot.length || !cold.length) return null;

  // ---- Problem Table Algorithm on shifted temperatures ----
  const temps = new Set<number>();
  for (const s of hot) { temps.add(s.Ts - dTmin / 2); temps.add(s.Tt - dTmin / 2); }
  for (const s of cold) { temps.add(s.Ts + dTmin / 2); temps.add(s.Tt + dTmin / 2); }
  const T = Array.from(temps).sort((a, b) => b - a);   // descending
  const casc = [0];
  for (let i = 0; i < T.length - 1; i++) {
    const Thi = T[i]!, Tlo = T[i + 1]!;
    let sumCP = 0;
    for (const s of hot) { const lo = Math.min(s.Ts, s.Tt) - dTmin / 2, hi = Math.max(s.Ts, s.Tt) - dTmin / 2; if (lo <= Tlo && hi >= Thi) sumCP += CP(s); }
    for (const s of cold) { const lo = Math.min(s.Ts, s.Tt) + dTmin / 2, hi = Math.max(s.Ts, s.Tt) + dTmin / 2; if (lo <= Tlo && hi >= Thi) sumCP -= CP(s); }
    casc.push(casc[casc.length - 1]! + sumCP * (Thi - Tlo));
  }
  const deficit = Math.min(...casc);
  const QhMin = deficit < 0 ? -deficit : 0;
  const casc2 = casc.map((c) => c + QhMin);
  const QcMin = casc2[casc2.length - 1]!;
  // pinch = the shifted T where the cascade is zero (closest to 0)
  let pi = 0; for (let i = 1; i < casc2.length; i++) if (Math.abs(casc2[i]!) < Math.abs(casc2[pi]!)) pi = i;
  const pinchShift = T[pi] ?? null;

  // Grand Composite Curve: the net heat cascade vs shifted temperature -- the
  // "pockets" are internal recovery, and it touches H=0 at the pinch.  Used to
  // place utility levels (lowest steam grade above the pinch, etc.).
  const gcc: [number, number][] = T.map((t, i) => [casc2[i]!, t]);

  // Candidate matches (screening): a hot stream can heat a cold one if it is
  // >= dTmin hotter somewhere; classify the feasible overlap above/below the
  // pinch.  An upper-bound kW per pair (the network achieves the targets above).
  const matches: HeatMatch[] = [];
  for (const h of hot) for (const c of cold) {
    const hHi = Math.max(h.Ts, h.Tt), hLo = Math.min(h.Ts, h.Tt);
    const cHi = Math.max(c.Ts, c.Tt), cLo = Math.min(c.Ts, c.Tt);
    if (hHi < cLo + dTmin) continue;                       // no driving force anywhere
    const ovLo = Math.max(hLo - dTmin / 2, cLo + dTmin / 2);
    const ovHi = Math.min(hHi - dTmin / 2, cHi + dTmin / 2);
    if (ovHi <= ovLo) continue;
    const mid = (ovLo + ovHi) / 2;
    const side: "above" | "below" = pinchShift == null || mid >= pinchShift ? "above" : "below";
    matches.push({ hot: h.unit, cold: c.unit, capKW: Math.min(h.Q_kW, c.Q_kW), side });
  }
  matches.sort((a, b) => b.capKW - a.capKW);

  return {
    streams, dTmin, QhMin, QcMin,
    QhNow: cold.reduce((a, s) => a + s.Q_kW, 0),
    QcNow: hot.reduce((a, s) => a + s.Q_kW, 0),
    pinchHot: pinchShift === null ? null : pinchShift + dTmin / 2,
    pinchCold: pinchShift === null ? null : pinchShift - dTmin / 2,
    pinchShift,
    hotComposite: composite(hot),
    coldComposite: composite(cold).map(([h, t]) => [h + QcMin, t]),  // shift so the gap = dTmin
    gcc,
    matches,
  };
}
