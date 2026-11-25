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
  calculatedToBoughtMath -- the readers and the page arithmetic of "From the
  calculated to the bought" (C503).  The TypeScript predicts nothing.

  WHAT IS THE ENGINE'S.  The exchanger: the witness hxBought01_margin_and_stock
  is run with the margin and the stock lengths the student sets, and the page
  READS the three areas (`A_calculated`, `A_margined`, `A_bought`), the tubes,
  the length, the shell and the purchased cost from the equipment list the
  engine wrote.  The pipe: line01_pumped_drum's line list (nominal size, bore,
  velocity, the window's ceiling; the run's reports/lines/lineList.csv) is read as the engine wrote it, with the
  ceiling of the discharge service moved by the student.  The compressor:
  compressor03_staged_design's shaft power and driver rating.

  WHAT IS THE PAGE'S, and marked so.  (1) For a pipe, the smallest bore the
  window allows, `d_min = d sqrt(v / v_max)`, which is an identity of the
  engine's own published velocity and bore at constant flow (v is inversely
  proportional to d squared); (2) for the driver, `rating = margin x shaft
  power` and a frame ladder the student declares (the engine has no motor
  list); (3) the cover test of card 5: the smallest swept margin whose bought
  area still delivers the duty if the overall coefficient fell by a stated
  fraction, `A >= A_calc / (1 - u)` (U also moves with the tube count, which
  the page does not model: said on the page).
\*---------------------------------------------------------------------------*/

import type { RunResult } from "../../adapters/SolverAdapter.js";
import type { DictOverride } from "../../case/methodRun.js";

export const CB_WITNESS = "hxBought01_margin_and_stock";
export const CB_LINE_WITNESS = "line01_pumped_drum";
export const CB_COMPRESSOR_WITNESS = "compressor03_staged_design";
export const CB_ITEM = "column17/condenser";

/** The margins the cost curve is swept over (a fraction of the calculated area). */
export const CB_MARGINS: readonly number[] = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3];

/** The tube lengths the witness's stock list declares, in dict order (m).  The
 *  test holds this array to the witness's own text. */
export const CB_STOCK_LENGTHS: readonly number[] = [3.048, 3.658, 4.877, 6.096];

/** The overrides that set the margin and (optionally) restrict the stock to ONE
 *  of its lengths: every entry of the list is written with the same value, so
 *  the engine can only buy that one. */
export function exchangerOverrides(margin: number, onlyLength: number | null): DictOverride[] {
  const o: DictOverride[] = [
    { file: "system/postDict", key: "area", value: margin },
  ];
  if (onlyLength !== null)
    CB_STOCK_LENGTHS.forEach((_, i) =>
      o.push({ file: "system/postDict", key: "length", value: onlyLength, occurrence: i + 1, unit: "m" }));
  return o;
}

export interface ExchangerReading {
  calculated: number;     // m2
  margined: number;       // m2
  bought: number;         // m2
  margin: number;
  nTubes: number;
  tubeLength: number;     // m, the bought one
  shellCalculated: number;
  shellBought: number | null;
  cost: number | null;
  currency: string;
  surplus: number;        // bought / calculated - 1: the rounding surplus + the margin
}

/** The condenser's numbers, as the engine wrote them.  null when the run
 *  carries no such item or a key is absent (a refused run says nothing). */
export function readExchanger(result: RunResult | null | undefined): ExchangerReading | null {
  const it = result?.equipment?.find((e) => e.item === CB_ITEM);
  if (!it) return null;
  const v = it.values;
  const need = ["A_calculated", "A_margined", "A_bought", "designMargin", "nTubes",
    "tubeLength", "shellID"] as const;
  for (const k of need) if (!Number.isFinite(v[k])) return null;
  return {
    calculated: v["A_calculated"]!, margined: v["A_margined"]!, bought: v["A_bought"]!,
    margin: v["designMargin"]!, nTubes: v["nTubes"]!, tubeLength: v["tubeLength"]!,
    shellCalculated: v["shellID"]!,
    shellBought: Number.isFinite(v["shellID_bought"]) ? v["shellID_bought"]! : null,
    cost: it.cost?.purchased ?? null, currency: it.cost?.currency ?? "",
    surplus: v["A_bought"]! / v["A_calculated"]! - 1,
  };
}

export interface MarginPoint { margin: number; reading: ExchangerReading }

/** The smallest swept margin whose bought area still delivers the duty when the
 *  overall coefficient is `u` (a fraction) below the calculated one: bought
 *  area >= calculated / (1 - u).  null when no swept margin covers it. */
export function coveringMargin(points: readonly MarginPoint[], u: number): MarginPoint | null {
  if (!(u >= 0) || !(u < 1) || points.length === 0) return null;
  const need = points[0]!.reading.calculated / (1 - u);
  const sorted = [...points].sort((a, b) => a.margin - b.margin);
  for (const p of sorted) if (p.reading.bought >= need * (1 - 1e-12)) return p;
  return null;
}

// ---- pipe ---------------------------------------------------------------------

/** The window ceiling of the discharge service, m/s: overrides occurrence 1 of
 *  `max` in the witness's layoutDict (liquidDischarge; the gas and steam
 *  services follow it). */
export function lineOverrides(vMax: number): DictOverride[] {
  return [{ file: "system/layoutDict", key: "max", value: vMax, occurrence: 1, unit: "m/s" }];
}

export interface LineReading {
  stream: string;
  service: string;
  nps: number;            // nominal size, in
  schedule: number;
  bore: number;           // m
  velocity: number;       // m/s
  velocityMax: number;    // m/s
  /** page arithmetic: the smallest bore the window's ceiling allows */
  boreMin: number;
  /** page arithmetic: how much more flow area the bought bore has than the minimum */
  areaMargin: number;
  /** the engine's price of the line where the case declares one for that size, else null */
  cost: number | null;
}

export function readLines(result: RunResult | null | undefined): LineReading[] {
  const files = result?.csvFiles ?? {};
  const key = Object.keys(files).find((k) => k.endsWith("reports/lines/lineList.csv"));
  const text = key ? files[key] : undefined;
  if (typeof text !== "string") return [];
  const rows = text.trim().split(/\r?\n/);
  const head = (rows[0] ?? "").split(",");
  const at = (k: string) => head.indexOf(k);
  const cols = ["line", "service", "state", "nominalSize_in", "schedule", "insideDiameter_m",
    "velocity_m_s", "velocityMax_m_s"].map(at);
  if (cols.some((c) => c < 0)) return [];
  const out: LineReading[] = [];
  for (const row of rows.slice(1)) {
    const c = row.split(",");
    if (c[at("state")] !== "sized") continue;
    const nps = Number(c[at("nominalSize_in")]), sch = Number(c[at("schedule")]);
    const d = Number(c[at("insideDiameter_m")]), v = Number(c[at("velocity_m_s")]);
    const vm = Number(c[at("velocityMax_m_s")]);
    if (![nps, sch, d, v, vm].every((x) => Number.isFinite(x)) || !(v > 0)) continue;
    out.push({
      stream: c[at("line")]!, service: c[at("service")]!, nps, schedule: sch, bore: d,
      velocity: v, velocityMax: vm, boreMin: d * Math.sqrt(v / vm), areaMargin: vm / v - 1,
      cost: (() => { const t = (c[at("cost")] ?? "").trim(); return t !== "" && Number.isFinite(Number(t)) ? Number(t) : null; })(),
    });
  }
  return out;
}

// ---- driver -------------------------------------------------------------------

export interface DriverReading { powerShaft: number; rating: number; margin: number }

/** compressor03's shaft power and the rating the engine wrote at its margin. */
export function readDriver(result: RunResult | null | undefined): DriverReading | null {
  const it = result?.equipment?.find((e) => e.type === "compressor");
  if (!it) return null;
  const { powerShaft, driverRating, driverMargin } = it.values;
  if (![powerShaft, driverRating, driverMargin].every((x) => Number.isFinite(x))) return null;
  return { powerShaft: powerShaft!, rating: driverRating!, margin: driverMargin! };
}

/** The page's arithmetic: the rating a margin asks for, and the frame bought
 *  from a ladder the STUDENT declares (every `step` kW; the engine has none). */
export function driverAt(powerShaft: number, margin: number, step: number):
  { rating: number; bought: number; surplus: number } {
  const rating = margin * powerShaft;
  const bought = step > 0 ? Math.ceil(rating / step - 1e-12) * step : rating;
  return { rating, bought, surplus: bought / powerShaft - 1 };
}
