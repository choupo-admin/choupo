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
  syngasExercise -- the BENCHES and the MOVES behind the synthesis-gas
  EduTool (DEV.md 4c C109), kept React-free so tests/syngasLesson.test.ts can
  build every move's case exactly as the page does and run it through the
  NATIVE engine.

  NO NEW CASE (DEV.md, the standing rule of 2026-10-17: no new tutorial case
  for an EduTool; a probe lives in a temporary COPY of an existing case).
  Each bench is an in-browser copy of a bundled tutorial, and the tutorial on
  disk is never changed:

    reformer   steady/gibbs/gibbs11_carbon_deposition -- two Gibbs reformers
               on methane and steam, graphite declared as a pure solid;
    oxidation  steady/reactors/screen01_methanol_routes -- its `gibbsC`
               reactor, whose feed is already the partial-oxidation feed
               (2 CH4 + O2), made hot and adiabatic;
    shift      steady/reactors/equil01_reforming -- the equilibrium reformer,
               with two shift reactors (the `wgs` reaction alone) written in
               after it;
    rwgs       the same host, fed CO2 and H2 and given the shift alone;
    psa        steady/separation/psa01_h2_psa -- the hydrogen PSA.

  ZERO PHYSICS HERE.  A move is a list of EDITS to declared text -- a
  temperature, a pressure, a feed flow, a reaction list, an added unit -- and
  the engine solves the edited copy.  The only arithmetic in this file is two
  RATIOS of flows the engine published (H2/CO and the module) and a
  conversion; the test recomputes each from the native run.

  AN EDIT IS EXACT TEXT, AND IT MUST LAND EXACTLY ONCE (the C101 rule).
  `from` is a piece of one file as written; scoped to a UNIT, it is looked
  for only inside that unit's own `{ name <unit>; ... }` entry (braces
  matched).  Absent, or present twice, it THROWS by name -- a silent no-op
  edit would run the engine on the wrong question.
\*---------------------------------------------------------------------------*/

import type { RunResult } from "../../adapters/SolverAdapter.js";
import type { CaseFiles } from "../../case/types.js";
import { filesToCaseFiles, tutorialByName } from "../../cases/tutorials.js";

/** One change to one declared file of the host case. */
export interface CaseEdit {
  /** Case-relative path, e.g. `system/flowsheetDict` or `0/feedHigh`. */
  file: string;
  /** Look for `from` only inside this unit's own `{ name <unit>; ... }`. */
  unit?: string;
  from: string;
  to: string;
}

/** The text of unit `name`'s entry: [start, end) offsets.  Throws when absent. */
export function unitSpan(text: string, name: string): [number, number] {
  const head = new RegExp(`\\{\\s*name\\s+${name}\\s*;`).exec(text);
  if (!head) throw new Error(`syngas bench: no unit \`${name}\``);
  let depth = 0;
  for (let i = head.index; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return [head.index, i + 1];
  }
  throw new Error(`syngas bench: unit \`${name}\` has no closing brace`);
}

/** Apply one edit to one file's text; throws unless `from` occurs exactly once. */
export function applyEdit(text: string, e: CaseEdit): string {
  const [a, b] = e.unit ? unitSpan(text, e.unit) : [0, text.length];
  const scope = text.slice(a, b);
  const first = scope.indexOf(e.from);
  const where = e.unit ? `unit \`${e.unit}\` of ${e.file}` : e.file;
  if (first < 0) throw new Error(`edit: \`${e.from}\` not found in ${where}`);
  if (scope.indexOf(e.from, first + 1) >= 0)
    throw new Error(`edit: \`${e.from}\` occurs more than once in ${where}`);
  return text.slice(0, a + first) + e.to + text.slice(a + first + e.from.length);
}

// ---- the benches -------------------------------------------------------------

export type BenchId = "reformer" | "oxidation" | "shift" | "rwgs" | "psa";

/** One reactor (or separator) whose inlet and outlet the page reads. */
export interface Stage {
  label: string;
  unit: string;
  in: string;
  out: string;
}

export interface Bench {
  host: string;
  /** What the copy changes before any move: always shown on the page. */
  base: readonly CaseEdit[];
  /** Files the copy adds (a new stream's 0/ seed). */
  adds?: { readonly [rel: string]: string };
  /** One line on the page: what this bench is. */
  about: string;
}

const FS = "system/flowsheetDict";

/** A 0/ seed for a stream the shift bench adds.  The engine overwrites it:
 *  an intermediate stream's 0/ file is where the solve STARTS, never what it
 *  answers (CLAUDE.md 3, the 0/ completeness contract). */
const SHIFT_SEED = `// Seed for a stream the EduTool's shift bench adds; the solve overwrites it.
componentMolarFlows
{
    CH4      0.01 kmol/h;
    water    2.0 kmol/h;
    CO       0.7 kmol/h;
    CO2      0.3 kmol/h;
    H2       3.0 kmol/h;
}
T               600 K;
P               100000 Pa;
phase           gas;
`;

/** The two shift reactors written in after equil01's reformer. */
export const SHIFT_UNITS = `        reactions   ( smr wgs );         // names from constant/reactions
    }
    {
        name        hts;                 // high-temperature shift
        type        equilibriumReactor;
        in          syngas;
        outputs     ( shifted1 );
        operation   { T 650 K; }
        reactions   ( wgs );             // the shift ALONE: no methanation
    }
    {
        name        lts;                 // low-temperature shift
        type        equilibriumReactor;
        in          shifted1;
        outputs     ( shifted2 );
        operation   { T 480 K; }
        reactions   ( wgs );
    }
);`;

export const BENCHES: { readonly [B in BenchId]: Bench } = {
  reformer: {
    host: "steady/gibbs/gibbs11_carbon_deposition",
    base: [],
    about: "two Gibbs reformers at 1000 K and 1 bar on 1 kmol/h of methane -- "
      + "reformerHigh with 3 kmol/h of steam, reformerLow with 0.8 -- over "
      + "CH4, H2O, CO, CO2, H2 and graphite as a pure solid.",
  },
  oxidation: {
    host: "steady/reactors/screen01_methanol_routes",
    base: [
      { file: FS, unit: "gibbsC", from: "T          525 K;",
        to: "T          1500 K;     // adiabatic: the outer Newton's seed\n"
          + "            mode       adiabatic;" },
      { file: FS, unit: "gibbsC", from: "P          50 bar;", to: "P          1 bar;" },
    ],
    about: "the Gibbs reactor gibbsC of the methanol-route screen, whose feed is "
      + "already 2 CH4 + O2 at 525 K, made ADIABATIC (no heat in or out; the "
      + "engine finds the outlet temperature) at 1 bar.",
  },
  shift: {
    host: "steady/reactors/equil01_reforming",
    base: [
      { file: FS,
        from: "        reactions   ( smr wgs );         // names from constant/reactions\n    }\n);",
        to: SHIFT_UNITS },
    ],
    adds: { "0/shifted1": SHIFT_SEED, "0/shifted2": SHIFT_SEED },
    about: "the equilibrium reformer at 1100 K and 1 bar (CH4 + 3 H2O, the "
      + "reforming and shift reactions), followed by two equilibrium reactors "
      + "that are allowed the shift reaction alone: hts at 650 K, lts at 480 K.",
  },
  rwgs: {
    host: "steady/reactors/equil01_reforming",
    base: [
      { file: "0/feed", from: "CH4    1.0 kmol/h;", to: "CO2    1.0 kmol/h;" },
      { file: "0/feed", from: "water    3.0 kmol/h;", to: "H2       3.0 kmol/h;" },
      { file: FS, unit: "reformer", from: "reactions   ( smr wgs );",
        to: "reactions   ( wgs );" },
    ],
    about: "the same equilibrium reactor at 1100 K and 1 bar, fed 1 kmol/h of "
      + "CO2 and 3 kmol/h of H2, and allowed the shift reaction alone -- which "
      + "at this temperature runs backwards.",
  },
  psa: {
    host: "steady/separation/psa01_h2_psa",
    base: [],
    about: "the hydrogen PSA: 1000 kmol/h of a shifted-syngas-like gas (70 % H2, "
      + "18 % CO2, 5 % CH4, 4 % CO, 3 % N2) on zeolite 5A, adsorbing at 20 bar "
      + "and regenerating at 1.2 bar.",
  },
};

/** The stages each bench draws. */
export const STAGES = {
  smr: { label: "reformerHigh (S/C 3)", unit: "reformerHigh", in: "feedHigh", out: "syngasHigh" },
  smrLow: { label: "reformerLow (S/C 0.8)", unit: "reformerLow", in: "feedLow", out: "syngasLow" },
  oxidation: { label: "gibbsC (adiabatic)", unit: "gibbsC", in: "feedGibbsC", out: "outGibbsC" },
  reformer: { label: "reformer, 1100 K", unit: "reformer", in: "feed", out: "syngas" },
  hts: { label: "high-temperature shift", unit: "hts", in: "syngas", out: "shifted1" },
  lts: { label: "low-temperature shift", unit: "lts", in: "shifted1", out: "shifted2" },
  rwgs: { label: "reverse shift (unit reformer)", unit: "reformer", in: "feed", out: "syngas" },
  psa: { label: "hydrogen product", unit: "h2psa", in: "feed", out: "hydrogen" },
} as const satisfies { readonly [k: string]: Stage };

export const BENCH_STAGES: { readonly [B in BenchId]: readonly Stage[] } = {
  reformer: [STAGES.smr, STAGES.smrLow],
  oxidation: [STAGES.oxidation],
  shift: [STAGES.reformer, STAGES.hts, STAGES.lts],
  rwgs: [STAGES.rwgs],
  psa: [STAGES.psa],
};

/** The host's files, with the bench's base edits, its added files, and
 *  `edits` applied in that order. */
export function benchRaw(bench: BenchId, edits: readonly CaseEdit[]): { [rel: string]: string } {
  const b = BENCHES[bench];
  const entry = tutorialByName(b.host);
  if (!entry?.files.rawFiles)
    throw new Error(`syngas EduTool host '${b.host}' is not in the bundled corpus`);
  const raw: { [rel: string]: string } = { ...entry.files.rawFiles };
  for (const [rel, body] of Object.entries(b.adds ?? {})) {
    if (raw[rel] !== undefined)
      throw new Error(`syngas bench '${bench}': the host already has ${rel};`
        + " the bench would replace it");
    raw[rel] = body;
  }
  for (const e of [...b.base, ...edits]) {
    const t = raw[e.file];
    if (t === undefined) throw new Error(`edit: the host has no file ${e.file}`);
    raw[e.file] = applyEdit(t, e);
  }
  return raw;
}

export function benchCase(bench: BenchId, edits: readonly CaseEdit[]): CaseFiles {
  return filesToCaseFiles(BENCHES[bench].host, benchRaw(bench, edits));
}

// ---- what the page reads off a run ------------------------------------------------

/** The two things a run publishes that this page reads: streams (overall
 *  molar flow F in kmol/s, T in K, P in Pa, overall mole fractions) and the
 *  per-unit KPIs.  Built from the browser's RunResult, or from the native
 *  result JSON in the test. */
export interface RunData {
  streams: { [name: string]: { F: number; T: number; P: number;
    composition: { [c: string]: number } } };
  kpis: { [unit: string]: { [k: string]: number } };
}

export function runDataOf(r: RunResult): RunData {
  const streams: RunData["streams"] = {};
  for (const s of r.streams) streams[s.name] = { F: s.F, T: s.T, P: s.P, composition: s.composition };
  return { streams, kpis: r.kpis ?? {} };
}

export type ReadoutId =
  | "T_K" | "P_bar" | "H2_CO" | "M" | "X_CH4" | "Q_kW" | "C_solid" | "a_C"
  | "CO_kmol_h" | "Kp_wgs" | "purity_H2" | "recovery_H2";

export interface ReadoutDef { label: string; unit: string; digits: number; meaning: string }

export const READOUTS: { readonly [R in ReadoutId]: ReadoutDef } = {
  T_K: { label: "T out", unit: "K", digits: 2, meaning: "the outlet temperature" },
  P_bar: { label: "P", unit: "bar", digits: 2, meaning: "the outlet pressure" },
  H2_CO: { label: "H₂/CO", unit: "mol/mol", digits: 2,
    meaning: "moles of hydrogen per mole of carbon monoxide in the outlet" },
  M: { label: "module", unit: "-", digits: 3,
    meaning: "(H₂ − CO₂)/(CO + CO₂) of the outlet" },
  X_CH4: { label: "CH₄ converted", unit: "-", digits: 3,
    meaning: "1 − (methane out)/(methane in)" },
  Q_kW: { label: "Q", unit: "kW", digits: 2,
    meaning: "the heat the reactor must be supplied (negative: removed)" },
  C_solid: { label: "carbon", unit: "kmol/h", digits: 4,
    meaning: "solid graphite the equilibrium deposits" },
  a_C: { label: "a_C", unit: "-", digits: 3,
    meaning: "the carbon activity of the gas without the solid" },
  CO_kmol_h: { label: "CO out", unit: "kmol/h", digits: 4, meaning: "carbon monoxide leaving" },
  Kp_wgs: { label: "K (shift)", unit: "-", digits: 2,
    meaning: "the shift's equilibrium constant at the reactor temperature" },
  purity_H2: { label: "H₂ purity", unit: "-", digits: 4, meaning: "H₂ mole fraction of the product" },
  recovery_H2: { label: "H₂ recovery", unit: "-", digits: 4,
    meaning: "fraction of the feed's H₂ that leaves in the product" },
};

const z = (s: { composition: { [c: string]: number } }, c: string): number => s.composition[c] ?? 0;

/** One readout of one stage, from what the engine published.  NaN when the
 *  run did not publish it (an adiabatic reactor publishes no duty). */
export function readout(run: RunData, st: Stage, id: ReadoutId): number {
  const o = run.streams[st.out];
  const i = run.streams[st.in];
  const k = run.kpis[st.unit] ?? {};
  const kpi = (key: string): number => (key in k ? k[key]! : Number.NaN);
  if (!o) return Number.NaN;
  switch (id) {
    case "T_K": return o.T;
    case "P_bar": return o.P / 1e5;
    case "H2_CO": return z(o, "CO") > 0 ? z(o, "H2") / z(o, "CO") : Number.NaN;
    case "M": {
      const d = z(o, "CO") + z(o, "CO2");
      return d > 0 ? (z(o, "H2") - z(o, "CO2")) / d : Number.NaN;
    }
    case "X_CH4": {
      const nIn = i ? i.F * z(i, "CH4") : 0;
      return nIn > 0 ? 1 - (o.F * z(o, "CH4")) / nIn : Number.NaN;
    }
    case "Q_kW": return kpi("Q_kW");
    case "C_solid": return kpi("n_solid_graphite_mol_s") * 3.6;
    case "a_C": return kpi("activity_graphite");
    case "CO_kmol_h": return o.F * z(o, "CO") * 3600;
    case "Kp_wgs": return kpi("Kp_wgs");
    case "purity_H2": return kpi("purity_H2");
    case "recovery_H2": return kpi("recovery_H2");
  }
}

export function fmtReadout(id: ReadoutId, v: number): string {
  return Number.isFinite(v) ? v.toFixed(READOUTS[id].digits) : "—";
}

/** The outlet's component flows [kmol/h], as the engine published them. */
export function outletFlows(run: RunData, st: Stage): { c: string; kmolh: number }[] {
  const o = run.streams[st.out];
  if (!o) return [];
  return Object.entries(o.composition)
    .filter(([, x]) => x > 1e-12)
    .map(([c, x]) => ({ c, kmolh: o.F * x * 3600 }));
}

// ---- the moves ------------------------------------------------------------------

/** One number a move's sentence quotes, held by the test to a native run:
 *  `stage` is the index into the bench's stages. */
export interface Quote { stage: number; id: ReadoutId; value: number }

export interface SyngasMove {
  id: string;
  label: string;
  bench: BenchId;
  edits: readonly CaseEdit[];
  /** Which of the bench's stages this move draws (default: all). */
  stages?: readonly number[];
  expect: string;
  quotes: readonly Quote[];
}

/** A number the reader may type, and the edit it makes on its bench. */
export interface SyngasKnob {
  id: string;
  label: string;
  unit: string;
  shipped: number;
  min: number; max: number; step: number;
  edit: (v: number) => CaseEdit;
}

export type SyngasPart =
  | "reformer" | "routes" | "pressure" | "carbon" | "shift" | "destinations"
  | "cleaning" | "future";

const RH = { file: FS, unit: "reformerHigh" } as const;
const RL = { file: FS, unit: "reformerLow" } as const;

export const KNOBS: { readonly [P in SyngasPart]?: { bench: BenchId; stages?: readonly number[];
  knobs: readonly SyngasKnob[] } } = {
  reformer: {
    bench: "reformer", stages: [0],
    knobs: [
      { id: "T", label: "reformer temperature", unit: "K", shipped: 1000, min: 700, max: 1300,
        step: 25, edit: (v) => ({ ...RH, from: "T          1000.0 K;", to: `T          ${v} K;` }) },
      { id: "P", label: "reformer pressure", unit: "bar", shipped: 1, min: 1, max: 40, step: 1,
        edit: (v) => ({ ...RH, from: "P          1.0 bar;", to: `P          ${v} bar;` }) },
      { id: "SC", label: "steam per methane (S/C)", unit: "mol/mol", shipped: 3, min: 1.5, max: 6,
        step: 0.1,
        edit: (v) => ({ file: "0/feedHigh", from: "water    3 kmol/h;", to: `water    ${v} kmol/h;` }) },
    ],
  },
  carbon: {
    bench: "reformer", stages: [1],
    knobs: [
      { id: "SC", label: "steam per methane (S/C)", unit: "mol/mol", shipped: 0.8, min: 0.1,
        max: 3, step: 0.1,
        edit: (v) => ({ file: "0/feedLow", from: "water    0.8 kmol/h;", to: `water    ${v} kmol/h;` }) },
      { id: "T", label: "reformer temperature", unit: "K", shipped: 1000, min: 800, max: 1300,
        step: 25, edit: (v) => ({ ...RL, from: "T          1000.0 K;", to: `T          ${v} K;` }) },
    ],
  },
  shift: {
    bench: "shift",
    knobs: [
      { id: "Thts", label: "high-temperature shift", unit: "K", shipped: 650, min: 450, max: 900,
        step: 10,
        edit: (v) => ({ file: FS, unit: "hts", from: "operation   { T 650 K; }",
          to: `operation   { T ${v} K; }` }) },
      { id: "Tlts", label: "low-temperature shift", unit: "K", shipped: 480, min: 420, max: 900,
        step: 10,
        edit: (v) => ({ file: FS, unit: "lts", from: "operation   { T 480 K; }",
          to: `operation   { T ${v} K; }` }) },
    ],
  },
  cleaning: {
    bench: "psa",
    knobs: [
      { id: "Plow", label: "regeneration pressure", unit: "bar", shipped: 1.2, min: 1.0, max: 8,
        step: 0.2,
        edit: (v) => ({ file: FS, from: "P_low         1.2 bar;", to: `P_low         ${v} bar;` }) },
      { id: "purge", label: "purge ratio", unit: "-", shipped: 0.15, min: 0, max: 0.6, step: 0.05,
        edit: (v) => ({ file: FS, from: "purgeRatio    0.15;", to: `purgeRatio    ${v};` }) },
    ],
  },
  future: {
    bench: "rwgs",
    knobs: [
      { id: "H2", label: "hydrogen per CO2", unit: "mol/mol", shipped: 3, min: 1, max: 6, step: 0.1,
        edit: (v) => ({ file: "0/feed", from: "H2       3.0 kmol/h;", to: `H2       ${v} kmol/h;` }) },
      { id: "T", label: "reactor temperature", unit: "K", shipped: 1100, min: 600, max: 1300, step: 25,
        edit: (v) => ({ file: FS, unit: "reformer", from: "operation   { T 1100 K; }",
          to: `operation   { T ${v} K; }` }) },
    ],
  },
};

/** The ATR feed: more oxygen and some steam on the same methane. */
const ATR_FEED: CaseEdit = { file: "0/feedMethane", from: "O2       1.0 kmol/h;",
  to: "O2       1.2 kmol/h;\n    water    1.2 kmol/h;" };
const CO2_REFORMING: CaseEdit = { file: "0/feedLow", from: "CH4      1 kmol/h;",
  to: "CH4      1 kmol/h;\n    CO2      1 kmol/h;" };

const q = (stage: number, id: ReadoutId, value: number): Quote => ({ stage, id, value });

const SMR: SyngasMove = {
  id: "smr", label: "steam reforming (as shipped)", bench: "reformer", edits: [], stages: [0],
  expect: "1000 K, 1 bar, three steam per methane: 0.985 of the methane is converted, "
    + "H2/CO is 5.74 and the module 3.000, and the furnace must supply 57.78 kW for "
    + "1 kmol/h of methane.",
  quotes: [q(0, "X_CH4", 0.985), q(0, "H2_CO", 5.74), q(0, "M", 3), q(0, "Q_kW", 57.78)] };
const POX: SyngasMove = {
  id: "pox", label: "partial oxidation", bench: "oxidation", edits: [],
  expect: "Half a mole of oxygen per carbon, preheated to 525 K, adiabatic at 1 bar: the "
    + "gas leaves at 1063.72 K, too cool to finish the job -- only 0.915 of the methane is "
    + "converted -- with H2/CO 2.01 and module 1.908.",
  quotes: [q(0, "T_K", 1063.72), q(0, "X_CH4", 0.915), q(0, "H2_CO", 2.01), q(0, "M", 1.908)] };
const ATR: SyngasMove = {
  id: "atr", label: "autothermal reforming", bench: "oxidation", edits: [ATR_FEED],
  expect: "A fifth more oxygen (0.6 per carbon) and 0.6 steam per carbon: the outlet rises "
    + "to 1232.06 K, the methane is converted (1.000), H2/CO is 2.39 with the steam's "
    + "help, and the module drops to 1.800 -- three minus twice the oxygen per carbon.",
  quotes: [q(0, "T_K", 1232.06), q(0, "X_CH4", 1), q(0, "H2_CO", 2.39), q(0, "M", 1.8)] };
const CO2R: SyngasMove = {
  id: "co2-reforming", label: "reforming with CO2 and steam", bench: "reformer",
  edits: [CO2_REFORMING], stages: [1],
  expect: "The steam-lean reformer given one CO2 per methane beside its 0.8 steam: no "
    + "carbon (0.0000 kmol/h of graphite; the activity is 0.652), H2/CO 1.48 and module 0.932 -- the low-ratio gas -- for a "
    + "duty of 64.02 kW.",
  quotes: [q(0, "a_C", 0.652), q(0, "C_solid", 0), q(0, "H2_CO", 1.48), q(0, "M", 0.932),
    q(0, "Q_kW", 64.02)] };
const SHIFTED: SyngasMove = {
  id: "smr-shifted", label: "steam reforming, then shifted", bench: "shift", edits: [],
  expect: "The reformer at 1100 K leaves 0.6694 kmol/h of CO, H2/CO 4.97.  The hot stage "
    + "(K 15.51) leaves 0.1731, the cold one (K 204.37) 0.0187, and H2/CO climbs to "
    + "212.98.  Both stages reject heat (-5.30 and -1.72 kW), and the module reads 3.000 "
    + "at all three.",
  quotes: [q(0, "CO_kmol_h", 0.6694), q(0, "H2_CO", 4.97), q(1, "Kp_wgs", 15.51),
    q(1, "CO_kmol_h", 0.1731), q(2, "Kp_wgs", 204.37), q(2, "CO_kmol_h", 0.0187),
    q(2, "H2_CO", 212.98), q(1, "Q_kW", -5.3), q(2, "Q_kW", -1.72),
    q(0, "M", 3), q(1, "M", 3), q(2, "M", 3)] };
const RWGS: SyngasMove = {
  id: "rwgs", label: "CO2 + green H2, reverse shift", bench: "rwgs", edits: [],
  expect: "One CO2 and three hydrogen at 1100 K, the shift alone: CO is made, 0.7531 "
    + "kmol/h of it, H2/CO is 2.98 and the module 2.000, and the reactor must be heated "
    + "(7.06 kW): run backwards, the shift absorbs heat.",
  quotes: [q(0, "CO_kmol_h", 0.7531), q(0, "H2_CO", 2.98), q(0, "M", 2), q(0, "Q_kW", 7.06)] };

/** The steam-lean reformer as shipped. */
const LOW: SyngasMove = {
  id: "shipped-low", label: "as shipped (S/C 0.8)", bench: "reformer", edits: [], stages: [1],
  expect: "S/C 0.8 at 1000 K and 1 bar: the carbon-free gas has a carbon activity above "
    + "one, so 0.2485 kmol/h of graphite deposits per kmol/h of methane and the activity "
    + "settles at 1.000; the module reads 3.838 because the carbon on the catalyst is "
    + "missing from the gas.",
  quotes: [q(0, "C_solid", 0.2485), q(0, "a_C", 1), q(0, "M", 3.838)] };

const PSA0: SyngasMove = {
  id: "shipped-psa", label: "as shipped", bench: "psa", edits: [],
  expect: "Adsorbing at 20 bar and regenerating at 1.2 bar with a purge of 0.15: hydrogen "
    + "of purity 0.9848 at a recovery of 0.7358; the nitrogen, held most weakly, is what "
    + "is left in it.",
  quotes: [q(0, "purity_H2", 0.9848), q(0, "recovery_H2", 0.7358)] };

export const MOVES: { readonly [P in SyngasPart]: readonly SyngasMove[] } = {
  reformer: [
    { ...SMR, id: "smr-hot", label: "hotter: 1200 K",
      edits: [{ ...RH, from: "T          1000.0 K;", to: "T          1200 K;" }],
      expect: "At 1200 K the methane is all but gone (1.000 converted), the duty rises to "
        + "71.75 kW, and H2/CO FALLS to 4.52: the shift, which releases heat, retreats in "
        + "the hotter gas.  The module stays at 3.000.",
      quotes: [q(0, "X_CH4", 1), q(0, "Q_kW", 71.75), q(0, "H2_CO", 4.52), q(0, "M", 3)] },
    { ...SMR, id: "smr-lean", label: "less steam: S/C 2",
      edits: [{ file: "0/feedHigh", from: "water    3 kmol/h;", to: "water    2 kmol/h;" }],
      expect: "Two steam per methane: 0.957 converted and H2/CO 4.44 -- less steam, less "
        + "reforming and less shift -- while the module stays at 3.000.",
      quotes: [q(0, "X_CH4", 0.957), q(0, "H2_CO", 4.44), q(0, "M", 3)] },
  ],
  routes: [POX, ATR, CO2R],
  pressure: [
    { ...SMR, id: "p5", label: "5 bar",
      edits: [{ ...RH, from: "P          1.0 bar;", to: "P          5 bar;" }],
      expect: "At 5 bar only 0.828 of the methane converts and the duty falls to 48.04 kW, "
        + "because less reforming is done.  The module: 3.000.",
      quotes: [q(0, "X_CH4", 0.828), q(0, "Q_kW", 48.04), q(0, "M", 3)] },
    { ...SMR, id: "p25", label: "25 bar",
      edits: [{ ...RH, from: "P          1.0 bar;", to: "P          25 bar;" }],
      expect: "At 25 bar half the methane comes back unconverted (0.504 converted) and "
        + "H2/CO rises to 9.78: what little CO is made is shifted.  The module: 3.000.",
      quotes: [q(0, "X_CH4", 0.504), q(0, "H2_CO", 9.78), q(0, "M", 3)] },
    { ...SMR, id: "p25-hot", label: "25 bar and 1200 K",
      edits: [{ ...RH, from: "P          1.0 bar;", to: "P          25 bar;" },
              { ...RH, from: "T          1000.0 K;", to: "T          1200 K;" }],
      expect: "Still at 25 bar, 200 K hotter: 0.924 converted, H2/CO 4.71, for 66.99 kW.  "
        + "Temperature buys back most of what pressure cost.  The module: 3.000.",
      quotes: [q(0, "X_CH4", 0.924), q(0, "H2_CO", 4.71), q(0, "Q_kW", 66.99), q(0, "M", 3)] },
  ],
  carbon: [
    { ...LOW, id: "sc1", label: "S/C 1.0",
      edits: [{ file: "0/feedLow", from: "water    0.8 kmol/h;", to: "water    1.0 kmol/h;" }],
      expect: "One steam per methane: still coking, 0.0940 kmol/h of graphite, the "
        + "activity held at 1.000.",
      quotes: [q(0, "C_solid", 0.094), q(0, "a_C", 1)] },
    { ...LOW, id: "sc12", label: "S/C 1.2",
      edits: [{ file: "0/feedLow", from: "water    0.8 kmol/h;", to: "water    1.2 kmol/h;" }],
      expect: "1.2 steam per methane: the carbon-free gas has an activity of 0.839, below "
        + "one, so no graphite forms (0.0000) and the module is back at 3.000.",
      quotes: [q(0, "a_C", 0.839), q(0, "C_solid", 0), q(0, "M", 3)] },
    { ...LOW, id: "dry", label: "CO2 instead of steam",
      edits: [{ file: "0/feedLow", from: "water    0.8 kmol/h;", to: "CO2      1 kmol/h;" }],
      expect: "One CO2 per methane and no steam: H2/CO falls to 1.30, the ratio an oxo "
        + "plant wants, and 0.4206 kmol/h of graphite deposits -- more than the steam-lean "
        + "reformer laid down.",
      quotes: [q(0, "H2_CO", 1.3), q(0, "C_solid", 0.4206)] },
  ],
  shift: [
    { ...SHIFTED, id: "one-stage", label: "one stage at 480 K",
      edits: [{ file: FS, unit: "hts", from: "operation   { T 650 K; }", to: "operation   { T 480 K; }" }],
      expect: "The first stage at 480 K leaves 0.0187 kmol/h of CO -- the outlet of the two "
        + "stages -- and the second stage, at the same temperature, has nothing left to do.",
      quotes: [q(1, "CO_kmol_h", 0.0187), q(2, "CO_kmol_h", 0.0187)] },
    { ...SHIFTED, id: "no-lts", label: "high-temperature stage only",
      edits: [{ file: FS, unit: "lts", from: "operation   { T 480 K; }", to: "operation   { T 650 K; }" }],
      expect: "With the second stage held at 650 K, 0.1731 kmol/h of CO slips through: the "
        + "hot stage alone stops where its own equilibrium does, H2/CO 22.08.",
      quotes: [q(2, "CO_kmol_h", 0.1731), q(2, "H2_CO", 22.08)] },
  ],
  destinations: [SHIFTED, POX, ATR, CO2R, RWGS],
  cleaning: [
    { ...PSA0, id: "plow3", label: "regenerate at 3 bar",
      edits: [{ file: FS, from: "P_low         1.2 bar;", to: "P_low         3.0 bar;" }],
      expect: "Blown down to 3 bar, the beds give up less and hold less on the next cycle: "
        + "purity 0.9432, and methane appears in the product.",
      quotes: [q(0, "purity_H2", 0.9432)] },
    { ...PSA0, id: "plow5", label: "regenerate at 5 bar",
      edits: [{ file: FS, from: "P_low         1.2 bar;", to: "P_low         5.0 bar;" }],
      expect: "At 5 bar CO joins the methane in the product and the purity falls to 0.9057, "
        + "while the recovery creeps up to 0.7882.",
      quotes: [q(0, "purity_H2", 0.9057), q(0, "recovery_H2", 0.7882)] },
    { ...PSA0, id: "purge05", label: "purge 0.05",
      edits: [{ file: FS, from: "purgeRatio    0.15;", to: "purgeRatio    0.05;" }],
      expect: "A third of the purge: recovery 0.8764, and the purity unchanged at 0.9848.",
      quotes: [q(0, "recovery_H2", 0.8764), q(0, "purity_H2", 0.9848)] },
    { ...PSA0, id: "purge30", label: "purge 0.30",
      edits: [{ file: FS, from: "purgeRatio    0.15;", to: "purgeRatio    0.30;" }],
      expect: "Twice the purge: recovery 0.5247, and the purity still 0.9848.  In this model "
        + "the purge only costs hydrogen.",
      quotes: [q(0, "recovery_H2", 0.5247), q(0, "purity_H2", 0.9848)] },
  ],
  future: [
    { ...RWGS, id: "rwgs-ft", label: "2.5 H2 per CO2",
      edits: [{ file: "0/feed", from: "H2       3.0 kmol/h;", to: "H2       2.5 kmol/h;" }],
      expect: "2.5 hydrogen per CO2: H2/CO 2.48, closer to a Fischer-Tropsch gas, and the "
        + "module 1.500 -- (2.5 - 1)/1, as step 11 predicts.",
      quotes: [q(0, "H2_CO", 2.48), q(0, "M", 1.5)] },
    { ...RWGS, id: "rwgs-cool", label: "at 800 K",
      edits: [{ file: FS, unit: "reformer", from: "operation   { T 1100 K; }", to: "operation   { T 800 K; }" }],
      expect: "At 800 K the shift's constant is 4.19, it favours CO2 more, and only 0.5278 "
        + "kmol/h of CO is made: H2/CO 4.68, module still 2.000.",
      quotes: [q(0, "Kp_wgs", 4.19), q(0, "CO_kmol_h", 0.5278), q(0, "H2_CO", 4.68), q(0, "M", 2)] },
  ],
};

/** The move each part's exercise starts on (the host, edited by its bench only). */
export const START: { readonly [P in SyngasPart]: SyngasMove } = {
  reformer: SMR, routes: SMR, pressure: SMR, carbon: LOW, shift: SHIFTED,
  destinations: SMR, cleaning: PSA0, future: RWGS,
};

/** The readouts each part's exercise tabulates. */
export const COLUMNS: { readonly [P in SyngasPart]: readonly ReadoutId[] } = {
  reformer: ["T_K", "P_bar", "X_CH4", "H2_CO", "M", "Q_kW"],
  routes: ["T_K", "X_CH4", "H2_CO", "M", "Q_kW"],
  pressure: ["T_K", "P_bar", "X_CH4", "H2_CO", "Q_kW"],
  carbon: ["X_CH4", "a_C", "C_solid", "H2_CO", "M"],
  shift: ["T_K", "CO_kmol_h", "Kp_wgs", "H2_CO", "M", "Q_kW"],
  destinations: ["H2_CO", "M"],
  cleaning: ["purity_H2", "recovery_H2"],
  future: ["T_K", "H2_CO", "M", "Q_kW"],
};
