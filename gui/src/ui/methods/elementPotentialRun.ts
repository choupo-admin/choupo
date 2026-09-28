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
  elementPotentialRun -- the witnesses, the knobs, and ONE READER for the log
  a Gibbs reactor writes when its case declares `newtonLog <file>;`
  (commission C15, 2026-09-27).

  `Run`, NOT `Math` (the leastSquaresRun precedent): this page recomputes no
  Newton.  The engine publishes the PATH -- every iterate's element
  potentials, ln N, residuals, step and ln n_i, the seed route and the phase
  searches -- as a long-form CSV (src/unitOperations/reactor/gibbsMethod/
  GibbsLog.cpp), one number per line:

      stage,iteration,quantity,value,unit

  and this module only SELECTS from it.  The one piece of arithmetic on the
  page is step 3's re-addition of the engine's own numbers (g/RT + ln P +
  ln y beside sum pi_k A_ki), printed with every term so a reader can redo
  it on paper; it lives in the lesson's tool, not here.

  THE READER REFUSES RATHER THAN GUESSES.  A header that is not the one the
  engine writes is named and rejected, and a row that does not carry five
  fields or a finite iteration is SKIPPED and counted -- never padded, because
  a padded zero would put an iterate on screen that the engine never took.
\*---------------------------------------------------------------------------*/

import type { DictOverride } from "../../case/methodRun.js";

/** The witness of steps 1-3 and 5 (and the solid half of step 4). */
export const EP_WITNESS = "steady/gibbs/gibbs12_element_potential_newton";
/** The witness of the liquid half of step 4: gibbs07 declares its own log. */
export const EP_LIQUID_WITNESS = "steady/gibbs/gibbs07_wgs_cooled";

/** The log each reactor writes, by the `newtonLog` its dict declares. */
export const EP_LOGS = {
  shift: "newtonLog_shift.csv",
  coking: "newtonLog_coking.csv",
  ammonia: "newtonLog_ammonia.csv",
  liquid: "newtonLog.csv",
} as const;

/** The element and species lists of each reactor, in the order the dict
 *  declares them (and so the order the log writes them).  They are LABELS
 *  for the tables; tests/elementPotentialLesson.test.ts holds each list to
 *  the witness's own `elements` / `species` declaration. */
export const EP_UNITS = {
  shift: { elements: ["C", "H", "O"], species: ["CO", "water", "CO2", "H2"] },
  coking: { elements: ["C", "H", "O"],
            species: ["CH4", "water", "CO", "CO2", "H2", "graphite"] },
  ammonia: { elements: ["N", "H", "O"],
             species: ["NH3", "O2", "N2", "NO", "water"] },
  liquid: { elements: ["C", "H", "O"], species: ["CO", "water", "CO2", "H2"] },
} as const;

/** The atom counts of the shift reactor's species, element by element in
 *  `EP_UNITS.shift.elements` order -- the `atoms ( ... )` lists the witness
 *  declares (held to the dict by the test).  Step 3 multiplies the engine's
 *  pi_k by these, which is the whole of its arithmetic. */
export const SHIFT_ATOMS: { readonly [sp: string]: readonly number[] } = {
  CO: [1, 0, 1],
  water: [0, 2, 1],
  CO2: [1, 0, 2],
  H2: [0, 2, 0],
};

// ---- the knobs -------------------------------------------------------------

export const SHIFT_T = { id: "shiftT", label: "shift reactor temperature T",
  min: 600, max: 1100, step: 50, unit: "K", default: 800,
  why: "The water-gas shift reactor, isothermal.  Watch how many iterations "
    + "the Newton takes and where the element potentials land." } as const;

export const AMMONIA_T = { id: "ammoniaT",
  label: "ammonia reactor temperature T (10 % NH3 in air, 5 bar)",
  min: 500, max: 1100, step: 50, unit: "K", default: 700,
  why: "Below about 800 K the least-squares seed stops the Newton at its "
    + "first iteration; the engine then re-seeds.  Move T and read which "
    + "route produced the answer." } as const;

/** The dict scalars one run writes.  `T` is declared three times in the
 *  witness's flowsheet (shift, coking, ammonia -- in that order) and once in
 *  each feed; the unit is ASSERTED, not assumed -- methodRun refuses a
 *  mismatch by name.  The coking reactor is left as the case declares it. */
export function elementPotentialOverrides(shiftT: number, ammoniaT: number):
  DictOverride[] {
  return [
    { file: "system/flowsheetDict", key: "T", value: shiftT, unit: "K", occurrence: 1 },
    { file: "0/feedShift", key: "T", value: shiftT, unit: "K" },
    { file: "system/flowsheetDict", key: "T", value: ammoniaT, unit: "K", occurrence: 3 },
    { file: "0/feedAmmonia", key: "T", value: ammoniaT, unit: "K" },
  ];
}

// ---- the reader ------------------------------------------------------------

export type Read<T> = { ok: true; read: T } | { ok: false; why: string };

export interface LogRecord {
  stage: string;
  iteration: number;
  quantity: string;
  value: number;
  unit: string;
}

export const LOG_HEADER = "stage,iteration,quantity,value,unit";

/** Read a `newtonLog` CSV.  `skipped` counts the rows that could not be read
 *  as five fields, so a page can say a log was truncated instead of drawing
 *  a shorter Newton than the engine ran. */
export function readNewtonLog(csv: string):
  Read<{ records: LogRecord[]; skipped: number }> {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2)
    return { ok: false, why: "the Newton log carries no rows" };
  const header = lines[0]!.split(",").map((s) => s.trim()).join(",");
  if (header !== LOG_HEADER)
    return { ok: false, why: `this CSV is not a Gibbs reactor's newtonLog `
      + `(its header is '${header}'; the engine writes '${LOG_HEADER}')` };
  const records: LogRecord[] = [];
  let skipped = 0;
  for (let r = 1; r < lines.length; ++r) {
    const c = lines[r]!.split(",");
    const iteration = Number(c[1]);
    if (c.length !== 5 || !Number.isInteger(iteration)) { ++skipped; continue; }
    //  A value the engine wrote as `nan` stays NaN: it is a fact about the
    //  run (a non-finite iterate), not a row to drop.
    records.push({ stage: c[0]!, iteration, quantity: c[2]!,
                   value: Number(c[3]), unit: c[4]! });
  }
  if (records.length === 0)
    return { ok: false, why: "the Newton log has a header and no usable row" };
  return { ok: true, read: { records, skipped } };
}

/** One number, or null when the log does not carry it. */
export function pick(recs: readonly LogRecord[], stage: string,
  iteration: number, quantity: string): number | null {
  const r = recs.find((x) => x.stage === stage && x.iteration === iteration
    && x.quantity === quantity);
  return r ? r.value : null;
}

/** The stages the log carries, in the order it wrote them. */
export function stagesOf(recs: readonly LogRecord[]): string[] {
  const out: string[] = [];
  for (const r of recs) if (!out.includes(r.stage)) out.push(r.stage);
  return out;
}

/** The iteration a stage recorded `converged` at, and the verdict. */
export function routeEnd(recs: readonly LogRecord[], stage: string):
  { iteration: number; converged: boolean } | null {
  const r = recs.find((x) => x.stage === stage && x.quantity === "converged");
  return r ? { iteration: r.iteration, converged: r.value === 1 } : null;
}

export interface NewtonRow {
  iteration: number;
  pi: (number | null)[];          // per element, EP_UNITS order
  lnN: number | null;
  f: (number | null)[];           // element-balance residuals, same order
  fTotal: number | null;
  normF: number | null;
  lnn: (number | null)[];         // per species
  /** Present only where a step FOLLOWED this iterate. */
  alpha: number | null;
  dpi: (number | null)[] | null;
  dlnN: number | null;
}

/** Every iterate of one Newton route, as the engine logged it. */
export function newtonRoute(recs: readonly LogRecord[], stage: string,
  elements: readonly string[], species: readonly string[]): NewtonRow[] {
  const its = Array.from(new Set(recs.filter((r) => r.stage === stage
    && r.quantity === "normF").map((r) => r.iteration))).sort((a, b) => a - b);
  return its.map((it) => {
    const q = (name: string) => pick(recs, stage, it, name);
    const alpha = q("alpha");
    return {
      iteration: it,
      pi: elements.map((e) => q(`pi_${e}`)),
      lnN: q("lnN"),
      f: elements.map((e) => q(`f_${e}`)),
      fTotal: q("f_total"),
      normF: q("normF"),
      lnn: species.map((s) => q(`lnn_${s}`)),
      alpha,
      dpi: alpha === null ? null : elements.map((e) => q(`dpi_${e}`)),
      dlnN: alpha === null ? null : q("dlnN"),
    };
  });
}

/** The records of a one-dimensional phase search (`liquidBisection`,
 *  `solidBisection`), one entry per fluid solve, in the order made. */
export function bisection(recs: readonly LogRecord[], stage: string,
  xName: string, rName: string): { iteration: number; x: number; r: number }[] {
  const its = Array.from(new Set(recs.filter((r) => r.stage === stage)
    .map((r) => r.iteration))).sort((a, b) => a - b);
  const out: { iteration: number; x: number; r: number }[] = [];
  for (const it of its) {
    const x = pick(recs, stage, it, xName), r = pick(recs, stage, it, rName);
    if (x !== null && r !== null) out.push({ iteration: it, x, r });
  }
  return out;
}
